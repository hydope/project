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
