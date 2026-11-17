<?php
// ─── Encryption at rest ──────────────────────────────────────────────────────
// AES-256-GCM via core OpenSSL. Applied to the two categories the Privacy
// Policy promises to protect: message bodies and uploaded verification files.
//
// Format (versioned, so keys can be rotated later without ambiguity):
//     v1:<base64 iv>:<base64 gcm tag>:<base64 ciphertext>
// GCM is authenticated, so a tampered row fails loudly instead of decrypting to
// garbage — we never surface that to a member as a message body.
//
// LEGACY ROWS: anything without the `v1:` prefix is passed through unchanged.
// That keeps an existing database readable across this upgrade; it also means a
// row written before the deploy is still served (in plaintext) until it is
// rewritten, so drain those with the re-encryption script when convenient.
declare(strict_types=1);

const AT_REST_PREFIX = 'v1:';
const AT_REST_CIPHER = 'aes-256-gcm';

// The data key is separate from JWT_SECRET on purpose: rotating either must not
// silently orphan the other. Falls back to a JWT_SECRET-derived key so a dev
// checkout works with no extra config, but production should set it explicitly.
function dataKey(): string
{
    static $key = null;
    if ($key !== null) return $key;

    $raw = trim((string)(getenv('DATA_ENCRYPTION_KEY') ?: ''));
    if ($raw === '') {
        $secret = (string)(getenv('JWT_SECRET') ?: '');
        if ($secret === '') {
            throw new RuntimeException('DATA_ENCRYPTION_KEY or JWT_SECRET must be set to encrypt at rest.');
        }
        // Development fallback only — deterministic derivation from the JWT key.
        $raw = hash('sha256', 'at-rest:' . $secret, true);
    } else {
        // Accept hex or base64 keys; otherwise use the raw bytes.
        $decoded = base64_decode($raw, true);
        $hex = @hex2bin($raw);
        $raw = ($decoded !== false && strlen($decoded) === 32) ? $decoded
             : (($hex !== false && strlen($hex) === 32) ? $hex
             : hash('sha256', $raw, true));
    }

    $key = $raw;
    return $key;
}

function encAtRest(string $plaintext): string
{
    if ($plaintext === '') return $plaintext;
    $iv = random_bytes(12);
    $tag = '';
    $ct = openssl_encrypt($plaintext, AT_REST_CIPHER, dataKey(), OPENSSL_RAW_DATA, $iv, $tag);
    if ($ct === false) {
        throw new RuntimeException('Failed to encrypt payload at rest.');
    }
    return AT_REST_PREFIX
        . base64_encode($iv) . ':'
        . base64_encode($tag) . ':'
        . base64_encode($ct);
}

function decAtRest(?string $stored): string
{
    $stored = (string)$stored;
    if ($stored === '' || !str_starts_with($stored, AT_REST_PREFIX)) {
        return $stored; // legacy plaintext row
    }

    $parts = explode(':', $stored, 4);
    if (count($parts) !== 4) {
        error_log('[crypto] malformed ciphertext, refusing to decode');
        return '';
    }
    [, $ivB64, $tagB64, $ctB64] = $parts;
    $iv  = base64_decode($ivB64, true);
    $tag = base64_decode($tagB64, true);
    $ct  = base64_decode($ctB64, true);
    if ($iv === false || $tag === false || $ct === false || strlen($iv) !== 12) {
        error_log('[crypto] corrupt ciphertext envelope, refusing to decode');
        return '';
    }

    $plain = openssl_decrypt($ct, AT_REST_CIPHER, dataKey(), OPENSSL_RAW_DATA, $iv, $tag);
    if ($plain === false) {
        // Either the key changed or someone edited the row. Never guess.
        error_log('[crypto] GCM auth failed — wrong DATA_ENCRYPTION_KEY or tampered row');
        return '';
    }
    return $plain;
}

function isEncryptedAtRest(?string $stored): bool
{
    return str_starts_with((string)$stored, AT_REST_PREFIX);
}

// Bytes for files (verification uploads). Same envelope as encAtRest but kept
// as a helper so the intent is explicit at the call site.
function encBytesAtRest(string $bytes): string
{
    return encAtRest($bytes);
}

function decBytesAtRest(string $stored): string
{
    return decAtRest($stored);
}
// Contact-stripping regex — mirrors server/routes/messages.js CONTACT_RE.
const CONTACT_RE = '/(\b[\w.+-]+@[\w-]+\.[\w.]+\b)|(\+?\d[\d\s\-().]{7,}\d)|(whatsapp|telegram|signal|instagram|snapchat|facebook)\s*[:@]?\s*[\w.]+/i';

function cleanMessage(?string $body): string {
    $body = trim((string)($body ?? ''));
    if ($body === '') return '';
    if (mb_strlen($body) > 5000) $body = mb_substr($body, 0, 5000);
    if (preg_match(CONTACT_RE, $body)) {
        return '[Removed: sharing contact details is not allowed before mutual consent. Keep the conversation here.]';
    }
    return $body;
}

function validEmail(?string $e): bool {
    if ($e === null) return false;
    return (bool)filter_var(trim($e), FILTER_VALIDATE_EMAIL);
}

function uuid(): string {
    $data = random_bytes(16);
    $data[6] = chr(ord($data[6]) & 0x0f | 0x40);
    $data[8] = chr(ord($data[8]) & 0x3f | 0x80);
    $hex = bin2hex($data);
    return substr($hex,0,8).'-'.substr($hex,8,4).'-'.substr($hex,12,4).'-'.substr($hex,16,4).'-'.substr($hex,20);
}

function sha256Hex(string $s): string { return hash('sha256', (string)$s); }

// Record why a member is deleting their account — called FIRST inside the
// delete transaction, before any row is removed. Snapshots identity
// (name/email/city/country/join date) from the live rows, because after the
// deletes there is nothing left to join against. The feedback table has no
// foreign key to users by design: the row must survive the deletion.
// Never throws: if the table is not migrated yet, log and let the deletion
// proceed — losing a reason is bad, blocking a deletion is worse.
// Syed's rule (2026-11-17): a deletion by the test bot must always be
// marked as a test deletion, so the admin Deleted Profiles list shows real
// member churn, not QA debris. The feedback table predates the rule, so
// the is_test column is ensured lazily here (the migrate.php marker trap
// means a migrate-only change would never run on production). The first
// call after the column appears also backfills history: rows whose email
// is one of the operator's own test addresses, or whose exit note starts
// with TEST, were test deletions by construction — no genuine member
// registers with the operator's personal inboxes.
function deletionFeedbackEnsureTest(PDO $pdo): void
{
    try {
        $cols = $pdo->query("SHOW COLUMNS FROM account_deletion_feedback LIKE 'is_test'")->fetchAll();
        if ($cols) {
            return;
        }
        $pdo->exec("ALTER TABLE account_deletion_feedback ADD COLUMN is_test TINYINT(1) NOT NULL DEFAULT 0 AFTER detail");
        $pdo->exec("UPDATE account_deletion_feedback SET is_test = 1
            WHERE email LIKE 'syedmohammedali1512+%@gmail.com'
               OR email = 'alisyedmohd51@gmail.com'
               OR email LIKE '%@example.com'
               OR detail LIKE 'TEST%'");
    } catch (Throwable $e) {
        error_log('[api] deletion-feedback is_test ensure: ' . substr($e->getMessage(), 0, 120));
    }
}

// Was this account one of the operator's test accounts? The users.is_test
// flag is the primary signal; the operator's own email addresses and a
// TEST-prefixed exit note are the fallbacks, because several historical
// test accounts were created before the flag's patterns covered them.
function deletionLooksTest(array $user, string $detail): bool
{
    if (!empty($user['is_test'])) {
        return true;
    }
    $email = strtolower((string)($user['email'] ?? ''));
    if (str_starts_with($email, 'syedmohammedali1512+') || $email === 'alisyedmohd51@gmail.com' || str_ends_with($email, '@example.com')) {
        return true;
    }
    return stripos($detail, 'TEST') === 0;
}

function recordDeletionFeedback(PDO $pdo, string $uid, array $body): void
{
    $validReasons = ['found_match_elsewhere', 'no_suitable_matches', 'too_few_members', 'nobody_replies', 'privacy', 'too_complicated', 'other', 'prefer_not_to_say'];
    $reason = isset($body['reason']) ? trim((string)$body['reason']) : '';
    if ($reason !== '' && !in_array($reason, $validReasons, true)) {
        $reason = 'other';
    }
    $detail = isset($body['detail']) ? trim((string)$body['detail']) : '';
    if (mb_strlen($detail) > 1000) {
        $detail = mb_substr($detail, 0, 1000);
    }
    try {
        deletionFeedbackEnsureTest($pdo);
        $u = $pdo->prepare('SELECT display_name, email, created_at, is_test FROM users WHERE id = ? LIMIT 1');
        $u->execute([$uid]);
        $user = $u->fetch() ?: [];
        $p = $pdo->prepare('SELECT city, country FROM profiles WHERE user_id = ? LIMIT 1');
        $p->execute([$uid]);
        $prof = $p->fetch() ?: [];
        $pdo->prepare('INSERT INTO account_deletion_feedback (id, user_id, display_name, email, city, country, joined_at, reason, detail, is_test) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            ->execute([
                uuid(),
                $uid,
                (string)($user['display_name'] ?? ''),
                (string)($user['email'] ?? ''),
                ($prof['city'] ?? null) !== '' ? ($prof['city'] ?? null) : null,
                ($prof['country'] ?? null) !== '' ? ($prof['country'] ?? null) : null,
                $user['created_at'] ?? null,
                $reason === '' ? null : $reason,
                $detail === '' ? null : $detail,
                deletionLooksTest($user, $detail) ? 1 : 0,
            ]);
    } catch (Throwable $e) {
        error_log('[api] deletion feedback not recorded: ' . substr($e->getMessage(), 0, 120));
    }
}

// Issues a hashed email-verification token (72h expiry). Used by the auth
// routes and the recovery-email cron. Tokens are stored hashed — a DB leak
// must not yield usable verify links.
function issueVerificationToken(string $userId): string
{
    $token = bin2hex(random_bytes(32));
    // Prune long-expired rows so kept (idempotent re-tap) tokens don't linger.
    db()->prepare('DELETE FROM email_verifications WHERE expires_at < UTC_TIMESTAMP()')->execute();
    db()->prepare(
        'INSERT INTO email_verifications (user_id, token_hash, expires_at)
         VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 72 HOUR))
         ON DUPLICATE KEY UPDATE token_hash = VALUES(token_hash),
                                 expires_at = VALUES(expires_at),
                                 created_at = UTC_TIMESTAMP()'
    )->execute([$userId, sha256Hex($token)]);
    return $token;
}

function randomBase64Url(int $bytes): string {
    return rtrim(strtr(base64_encode(random_bytes($bytes)), '+/', '-_'), '=');
}

function nowIso(): string { return gmdate('Y-m-d H:i:s'); }

function nowPlus(string $interval): string {
    return date('Y-m-d H:i:s', strtotime($interval));
}

function publicBase(): string {
    $u = getenv('CLIENT_URL') ?: 'http://localhost:5173';
    return trim(explode(',', $u)[0]);
}

// MAIL_ENABLED='true' means a real mail transport is configured. Until SMTP is
// set up the API runs in devMode and hands the verification URL straight back
// so the stopgap is explicit, never silent. Moved here from routes/auth.php
// (2026-10-24) so standalone scripts like recovery-cron.php can use it too —
// auth.php's copy was the only definition, which is why the recovery cron
// 500'd with "Call to undefined function mailEnabled()".
function mailEnabled(): bool
{
    return strtolower(trim((string)(getenv('MAIL_ENABLED') ?: ''))) === 'true';
}
