<?php
// Session tracking — one row per login token so members can see and reason
// about their active sessions (Security tab "Sessions" list).
//
// A session is identified by the SHA-256 hash of the bearer JWT issued at
// login. The token itself is never stored; a DB leak must not yield usable
// credentials. last_seen is refreshed on every authenticated request via
// requireAuthUser() (once per request), so the list reflects real activity.

declare(strict_types=1);

function sessionTokenHash(): ?string
{
    $t = hbearer();
    return $t === null ? null : sha256Hex($t);
}

// Called at login with the freshly-signed JWT.
function recordSession(string $userId, string $token): void
{
    try {
        $stmt = db()->prepare(
            'INSERT INTO sessions (id, user_id, token_hash, ip, user_agent, created_at, last_seen)
             VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
             ON DUPLICATE KEY UPDATE last_seen = UTC_TIMESTAMP()'
        );
        $stmt->execute([
            uuid(),
            $userId,
            sha256Hex($token),
            substr(cip(), 0, 64),
            substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 512),
        ]);
        // Quietly prune dead sessions for this user — a 30-day idle session is
        // long gone (JWT TTL is 7 days), so keeping it would only confuse the list.
        db()->prepare('DELETE FROM sessions WHERE user_id = ? AND last_seen < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)')
            ->execute([$userId]);
    } catch (Throwable $e) {
        // Session tracking is observability, never a login gate — a failure
        // here must not brick sign-in.
        error_log('[api] session record failed: ' . $e->getMessage());
    }
}

// Called from requireAuthUser() — guarded to run at most once per request.
function touchSession(): void
{
    static $touched = false;
    if ($touched) return;
    $touched = true;

    $hash = sessionTokenHash();
    if ($hash === null) return;
    try {
        db()->prepare('UPDATE sessions SET last_seen = UTC_TIMESTAMP() WHERE token_hash = ?')
            ->execute([$hash]);
    } catch (Throwable $e) {
        error_log('[api] session touch failed: ' . $e->getMessage());
    }
}

// Called at logout so the session list stops showing a signed-out device.
function dropSession(): void
{
    $hash = sessionTokenHash();
    if ($hash === null) return;
    try {
        db()->prepare('DELETE FROM sessions WHERE token_hash = ?')->execute([$hash]);
    } catch (Throwable $e) {
        error_log('[api] session drop failed: ' . $e->getMessage());
    }
}

// ─── Revoked-token denylist (2026-11-11 sweep fix) ──────────────────────────
// Dropping the sessions row never actually signed anyone out: requireAuthUser()
// verifies the JWT signature only, so a logged-out (or copied) token stayed
// valid until its 7-day expiry. Logout now records the token's SHA-256 hash
// here until the token's own expiry, and requireAuthUser() rejects listed
// hashes. ONLY the logged-out token dies — the member's other sessions are
// untouched, and session tracking stays observability, never a login gate:
// a token with no sessions row is still accepted, a listed hash is not.
//
// The table is created lazily (CREATE TABLE IF NOT EXISTS) rather than via
// migrate.php: migrations are gated on the schema.sql digest, and a missed
// digest bump would leave production without the table. Every access is
// failure-tolerant — if the table cannot be created or read, auth behaves
// exactly as it did before this existed (logged, never a lockout).
function ensureRevokedTokensTable(): void
{
    static $done = false;
    if ($done) return;
    $done = true;
    try {
        db()->exec(
            'CREATE TABLE IF NOT EXISTS revoked_tokens (
                token_hash CHAR(64) NOT NULL PRIMARY KEY,
                expires_at DATETIME NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            )'
        );
    } catch (Throwable $e) {
        error_log('[api] revoked_tokens create failed: ' . $e->getMessage());
    }
}

// Denylist one token until its JWT expiry (or one TTL from now when the
// expiry is unknown). Expired rows are pruned on the way in — the table
// only ever holds hashes of tokens that could still be live.
function revokeToken(string $token, ?int $exp): void
{
    if ($token === '') return;
    ensureRevokedTokensTable();
    try {
        $expires = $exp !== null && $exp > time() ? $exp : time() + parseTtl(jwtTtl());
        db()->prepare(
            'INSERT INTO revoked_tokens (token_hash, expires_at) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE expires_at = VALUES(expires_at)'
        )->execute([sha256Hex($token), gmdate('Y-m-d H:i:s', $expires)]);
        db()->exec('DELETE FROM revoked_tokens WHERE expires_at < UTC_TIMESTAMP()');
    } catch (Throwable $e) {
        error_log('[api] token revoke failed: ' . $e->getMessage());
    }
}

// True when the CURRENT request's token was signed out. Called from
// requireAuthUser() (lib/db.php) — runtime-resolved and failure-tolerant,
// mirroring touchSession(): a database hiccup must never lock every
// member out, so any error reads as "not revoked".
function tokenIsRevoked(): bool
{
    $hash = sessionTokenHash();
    if ($hash === null) return false;
    ensureRevokedTokensTable();
    try {
        $stmt = db()->prepare('SELECT 1 FROM revoked_tokens WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP() LIMIT 1');
        $stmt->execute([$hash]);
        return (bool)$stmt->fetch();
    } catch (Throwable $e) {
        error_log('[api] token revoked check failed: ' . $e->getMessage());
        return false;
    }
}

// Denylist every OTHER recorded session token of a user (password change,
// 2026-11-11): the sessions table holds one SHA-256 hash per live login,
// which is exactly the set of tokens to kill. Their session rows are
// dropped too, so the Security list stops showing them. The current
// token (identified by $keepHash) is untouched. Returns how many were
// revoked. Tokens never recorded (recordSession is best-effort) cannot
// be enumerated — that residual is stated, not hidden.
function revokeUsersOtherTokens(string $userId, ?string $keepHash): int
{
    ensureRevokedTokensTable();
    $revoked = 0;
    try {
        $stmt = db()->prepare('SELECT token_hash FROM sessions WHERE user_id = ?');
        $stmt->execute([$userId]);
        $expires = gmdate('Y-m-d H:i:s', time() + parseTtl(jwtTtl()));
        $ins = db()->prepare(
            'INSERT INTO revoked_tokens (token_hash, expires_at) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE expires_at = VALUES(expires_at)'
        );
        $del = db()->prepare('DELETE FROM sessions WHERE token_hash = ?');
        foreach ($stmt->fetchAll() as $row) {
            $hash = (string)($row['token_hash'] ?? '');
            if ($hash === '' || ($keepHash !== null && hash_equals($keepHash, $hash))) continue;
            $ins->execute([$hash, $expires]);
            $del->execute([$hash]);
            $revoked++;
        }
    } catch (Throwable $e) {
        error_log('[api] revoke other tokens failed: ' . $e->getMessage());
    }
    return $revoked;
}
