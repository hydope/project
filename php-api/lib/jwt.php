<?php
function jwtSecret():string
{
    $s = getenv('JWT_SECRET');
    if ($s === false || $s === '' || strlen($s) < 32) {
        // Fail closed (audit A-13, 2026-11-24): the known literal fallback is
        // available ONLY under an explicit APP_ENV=development (appEnv() in
        // lib/bootstrap.php treats unset/unknown APP_ENV as production). The
        // old bare-CLI carve-out is gone for the same reason — CLI tooling in
        // a production checkout must use the real secret from .env, and local
        // harnesses set APP_ENV=development explicitly. Refusing means auth
        // fails loudly (500 via the front controller) rather than signing or
        // verifying tokens with a secret printed in this repo.
        $env = function_exists('appEnv') ? appEnv() : 'production';
        if ($env === 'development') {
            error_log('[api] JWT_SECRET short/unset dev fallback (NEVER prod)');
            return 'dev-only-secret-change-me';
        }
        error_log('[api] JWT_SECRET missing/short and APP_ENV is not explicitly development — refusing the dev fallback secret');
        throw new RuntimeException('JWT_SECRET >= 32 chars.');
    }
    return $s;
}

function jwtTtl():string { return getenv('JWT_TTL') ?: '7d'; }

function parseTtl(string $t): int
{
    $t = trim($t);
    if (preg_match('/^(\d+)d$/i', $t, $m)) return (int)$m[1] * 86400;
    if (preg_match('/^(\d+)h$/i', $t, $m)) return (int)$m[1] * 3600;
    if (preg_match('/^(\d+)m$/i', $t, $m)) return (int)$m[1] * 60;
    if (preg_match('/^(\d+)s$/i', $t, $m)) return (int)$m[1];
    if (preg_match('/^(\d+)$/', $t, $m)) return (int)$m[1];
    return 604800;
}

function b64urlEnc(string $d): string { return rtrim(strtr(base64_encode($d), '+/', '-_'), '='); }

function b64urlDec(string $d): string
{
    $r = strlen($d) % 4;
    if ($r !== 0) $d .= str_repeat('=', 4 - $r);
    return base64_decode(strtr($d, '-_', '+/'));
}

function jwsEncode(string $headerB64, string $payloadB64, string $secret): string
{
    $signingInput = $headerB64 . '.' . $payloadB64;
    return $signingInput . '.' . b64urlEnc(hash_hmac('sha256', $signingInput, $secret, true));
}

function jwsDecode(string $token, string $secret): array
{
    $parts = explode('.', $token);
    if (count($parts) !== 3) {
        throw new InvalidArgumentException('Malformed JWT.');
    }

    [$headerB64, $payloadB64, $signatureB64] = $parts;
    $expectedSignature = hash_hmac('sha256', $headerB64 . '.' . $payloadB64, $secret, true);
    $actualSignature = b64urlDec($signatureB64);

    if (!hash_equals($expectedSignature, $actualSignature)) {
        throw new InvalidArgumentException('Invalid signature.');
    }

    $header = json_decode(b64urlDec($headerB64), true);
    $payload = json_decode(b64urlDec($payloadB64), true);

    if (!is_array($header) || !is_array($payload)) {
        throw new InvalidArgumentException('Malformed JWT payload.');
    }

    if (($header['alg'] ?? '') !== 'HS256') {
        throw new InvalidArgumentException('Unsupported JWT algorithm.');
    }

    return $payload;
}

function jwtSign(array $claims, string $secret, string $ttl): string
{
    $now = time();
    $claims['iat'] = $now;
    $claims['nbf'] = $now;
    $claims['exp'] = $now + parseTtl($ttl);

    $header = ['alg' => 'HS256', 'typ' => 'JWT'];
    $headerB64 = b64urlEnc(json_encode($header, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    $payloadB64 = b64urlEnc(json_encode($claims, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

    return jwsEncode($headerB64, $payloadB64, $secret);
}

function jwtVerify(string $token, string $secret): array
{
    $payload = jwsDecode($token, $secret);
    if (($payload['exp'] ?? 0) < time()) {
        throw new InvalidArgumentException('Token expired.');
    }
    if (($payload['nbf'] ?? 0) > time()) {
        throw new InvalidArgumentException('Token not yet valid.');
    }
    return $payload;
}

function signSession(array $user): string
{
    // Exact Node claim set: uid, email, displayName, isAdmin. Role is NEVER a
    // claim — a stale JWT would keep granting (or denying) draft powers after
    // an admin changes it; routes query users.role from the DB instead.
    // isAdmin stays a claim only because the client session payload carries
    // it; no server gate trusts it — requireAdminUser() re-reads
    // users.is_admin from the DB on every admin request (audit A-03).
    return jwtSign([
        'uid' => (string)($user['id'] ?? ''),
        'email' => (string)($user['email'] ?? ''),
        'displayName' => (string)($user['display_name'] ?? ''),
        'isAdmin' => (bool)($user['is_admin'] ?? false),
    ], jwtSecret(), jwtTtl());
}

function authOptional(): ?array
{
    $t = hbearer();
    if ($t === null) return null;
    try {
        return jwtVerify($t, jwtSecret());
    } catch (Throwable) {
        return null;
    }
}

function authRequired(): array
{
    $t = hbearer();
    if ($t === null) je('Authentication required', 401);
    try {
        return jwtVerify($t, jwtSecret());
    } catch (Throwable) {
        je('Session expired. Please log in again.', 401);
    }
}

function adminRequired(array $user): void
{
    // Same stale-claim rule as requireAdminUser() (audit A-03): the isAdmin
    // claim alone is never enough when the DB helper is loaded — re-read
    // users.is_admin. The claim-only fallback exists solely for stripped
    // harnesses that load this file without lib/db.php.
    $ok = function_exists('userIsAdmin')
        ? userIsAdmin((string)($user['uid'] ?? ''))
        : !empty($user['isAdmin']);
    if (!$ok) je('Admin access required', 403);
}

function adminEmails(): array
{
    $r = getenv('ADMIN_EMAILS') ?: '';
    return array_values(array_filter(array_map('trim', explode(',', strtolower((string)$r))), fn($x) => $x !== ''));
}
