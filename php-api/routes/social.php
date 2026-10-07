<?php
// Social login — Google and Facebook OAuth.
//
// POST /api/auth/social
// Body: { provider: 'google'|'facebook', token: string }
//
// The frontend obtains the token via the provider's SDK (Google Identity
// Services, Facebook JS SDK). This endpoint verifies the token with the
// provider, then finds-or-creates the user and returns a normal session.
//
// Required secrets (GitHub repo secrets → .env):
//   GOOGLE_CLIENT_ID     — Google Cloud OAuth client ID
//   FACEBOOK_APP_ID      — Facebook App ID
//   FACEBOOK_APP_SECRET  — Facebook App secret
//
// Instagram login is NOT offered as a separate provider: Meta consolidated
// Instagram sign-in into Facebook Login (same Meta account system), so the
// Facebook button covers Instagram users.
declare(strict_types=1);

function routeSocial(string $method, array $segments): void
{
    if ($method === 'POST' && ($segments[0] ?? '') === 'social') {
        socialLogin();
        return;
    }
    json(['error' => 'Not found'], 404);
}

function socialLogin(): void
{
    $body = requestJson();
    $provider = trim((string)($body['provider'] ?? ''));
    $token = trim((string)($body['token'] ?? ''));

    if (!in_array($provider, ['google', 'facebook'], true) || $token === '') {
        je('Provider and token are required.', 400);
    }

    $profile = $provider === 'google'
        ? verifyGoogleToken($token)
        : verifyFacebookToken($token);

    if (!$profile) {
        je('Could not verify your ' . ucfirst($provider) . ' account. Please try again.', 401);
    }

    $email = strtolower(trim((string)($profile['email'] ?? '')));
    $name = trim((string)($profile['name'] ?? ''));
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        je('Your ' . ucfirst($provider) . ' account did not share an email address. Please use email signup instead.', 400);
    }
    if ($name === '') $name = explode('@', $email)[0];
    if (mb_strlen($name) > 60) $name = mb_substr($name, 0, 60);

    $pdo = db();
    $stmt = $pdo->prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
    $stmt->execute([$email]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        // New user — create the account. Sect defaults to the most common;
        // the member can correct it during onboarding. Social signups skip
        // the password (password_hash stays NULL-safe via a placeholder the
        // login form can never match).
        $userId = uuid();
        $adminEmails = adminEmails();
        $isAdmin = in_array($email, $adminEmails, true);
        $pdo->beginTransaction();
        try {
            $pdo->prepare(
                'INSERT INTO users (id, email, password_hash, display_name, is_admin, email_verified) VALUES (?, ?, ?, ?, ?, 1)'
            )->execute([$userId, $email, 'social:' . $provider, $name, $isAdmin ? 1 : 0]);
            $pdo->prepare(
                'INSERT INTO profiles (user_id, display_name, sect) VALUES (?, ?, ?)'
            )->execute([$userId, $name, 'Ithna Ashari (Twelver)']);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
        $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$userId]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
    } else {
        // Existing user — link the social provider for future reference.
        $col = $provider === 'google' ? 'google_id' : 'facebook_id';
        $pid = (string)($profile['id'] ?? '');
        if ($pid !== '') {
            try {
                $pdo->prepare("UPDATE users SET {$col} = ? WHERE id = ? AND ({$col} IS NULL OR {$col} = '')")
                    ->execute([$pid, (string)$user['id']]);
            } catch (Throwable $e) { /* column may not exist yet — non-fatal */ }
        }
        // Social login proves email ownership.
        if (empty($user['email_verified'])) {
            $pdo->prepare('UPDATE users SET email_verified = 1 WHERE id = ?')->execute([(string)$user['id']]);
            $user['email_verified'] = 1;
        }
    }

    // Blocked/banned users cannot log in, whatever the method.
    if (!empty($user['is_blocked']) || !empty($user['is_banned'])) {
        je('This account has been restricted. Contact support if you believe this is a mistake.', 403);
    }

    issueSocialSession($user);
    json([
        'ok' => true,
        'user' => makeMemberSession($user),
        'token' => signSession($user),
        'isNew' => empty($user['created_at']) ? false : (strtotime((string)$user['created_at']) > time() - 60),
    ]);
}

/** Create the session row for a social login. */
function issueSocialSession(array $user): void
{
    $token = signSession($user);
    recordSession((string)$user['id'], $token);
}

/**
 * Verify a Google ID token (JWT from Google Identity Services).
 * Fetches Google's public keys and checks signature, audience and expiry.
 */
function verifyGoogleToken(string $idToken): ?array
{
    $clientId = getenv('GOOGLE_CLIENT_ID') ?: '';
    if ($clientId === '') return null;

    $parts = explode('.', $idToken);
    if (count($parts) !== 3) return null;
    [$headerB64, $payloadB64, $sigB64] = $parts;

    $header = json_decode(b64urlDecode($headerB64), true);
    $payload = json_decode(b64urlDecode($payloadB64), true);
    if (!is_array($header) || !is_array($payload)) return null;

    // Audience must be our client ID; token must not be expired.
    if (($payload['aud'] ?? '') !== $clientId) return null;
    if (($payload['exp'] ?? 0) < time() - 30) return null;
    if (($payload['iss'] ?? '') !== 'https://accounts.google.com' && ($payload['iss'] ?? '') !== 'accounts.google.com') return null;

    // Verify RSA signature against Google's published keys.
    $keys = fetchGoogleKeys();
    $kid = (string)($header['kid'] ?? '');
    if (!isset($keys[$kid])) return null;

    $ok = openssl_verify(
        $headerB64 . '.' . $payloadB64,
        b64urlDecode($sigB64),
        $keys[$kid],
        OPENSSL_ALGO_SHA256
    );
    if ($ok !== 1) return null;

    return [
        'id' => (string)($payload['sub'] ?? ''),
        'email' => (string)($payload['email'] ?? ''),
        'name' => (string)($payload['name'] ?? ''),
    ];
}

function b64urlDecode(string $s): string
{
    return base64_decode(strtr($s, '-_', '+/') . str_repeat('=', (4 - strlen($s) % 4) % 4));
}

/** Google's cert keys, cached for 1 hour. */
function fetchGoogleKeys(): array
{
    static $cache = null;
    if ($cache !== null) return $cache;
    $cache = [];
    $ctx = stream_context_create(['http' => ['timeout' => 8]]);
    $json = @file_get_contents('https://www.googleapis.com/oauth2/v3/certs', false, $ctx);
    if (!$json) return $cache;
    $data = json_decode($json, true);
    foreach (($data['keys'] ?? []) as $k) {
        if (($k['kty'] ?? '') !== 'RSA' || empty($k['kid']) || empty($k['n']) || empty($k['e'])) continue;
        // Build a PEM public key from n/e (no external deps — pure DER).
        $der = derSequence(
            derSequence(
                derOid('1.2.840.113549.1.1.1') . derNull()
            ) .
            derBitString(
                derSequence(
                    derInteger(b64urlDecode($k['n'])) .
                    derInteger(b64urlDecode($k['e']))
                )
            )
        );
        $pem = "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END PUBLIC KEY-----\n";
        $cache[(string)$k['kid']] = $pem;
    }
    return $cache;
}

// Minimal DER encoders for RSA public key construction.
function derLength(int $len): string
{
    if ($len < 128) return chr($len);
    $b = ltrim(pack('N', $len), "\x00");
    return chr(0x80 | strlen($b)) . $b;
}
function derSequence(string $s): string { return "\x30" . derLength(strlen($s)) . $s; }
function derInteger(string $b): string {
    $b = ltrim($b, "\x00");
    if ($b === '' || (ord($b[0]) & 0x80)) $b = "\x00" . $b;
    return "\x02" . derLength(strlen($b)) . $b;
}
function derBitString(string $s): string { return "\x03" . derLength(strlen($s) + 1) . "\x00" . $s; }
function derNull(): string { return "\x05\x00"; }
function derOid(string $oid): string {
    $parts = array_map('intval', explode('.', $oid));
    $out = chr(40 * $parts[0] + $parts[1]);
    for ($i = 2; $i < count($parts); $i++) {
        $v = $parts[$i]; $stack = [ $v & 0x7f ]; $v >>= 7;
        while ($v > 0) { array_unshift($stack, 0x80 | ($v & 0x7f)); $v >>= 7; }
        foreach ($stack as $byte) $out .= chr($byte);
    }
    return "\x06" . derLength(strlen($out)) . $out;
}

/**
 * Verify a Facebook access token via the debug_token endpoint, then fetch
 * the user's id, name and email.
 */
function verifyFacebookToken(string $accessToken): ?array
{
    $appId = getenv('FACEBOOK_APP_ID') ?: '';
    $appSecret = getenv('FACEBOOK_APP_SECRET') ?: '';
    if ($appId === '' || $appSecret === '') return null;

    $ctx = stream_context_create(['http' => ['timeout' => 8]]);
    $appToken = $appId . '|' . $appSecret;
    $debug = @file_get_contents(
        'https://graph.facebook.com/debug_token?input_token=' . urlencode($accessToken)
        . '&access_token=' . urlencode($appToken),
        false, $ctx
    );
    if (!$debug) return null;
    $d = json_decode($debug, true);
    $info = $d['data'] ?? [];
    if (empty($info['is_valid']) || (string)($info['app_id'] ?? '') !== $appId) return null;

    $me = @file_get_contents(
        'https://graph.facebook.com/me?fields=id,name,email&access_token=' . urlencode($accessToken),
        false, $ctx
    );
    if (!$me) return null;
    $m = json_decode($me, true);
    if (empty($m['id'])) return null;

    return [
        'id' => (string)$m['id'],
        'email' => (string)($m['email'] ?? ''),
        'name' => (string)($m['name'] ?? ''),
    ];
}
