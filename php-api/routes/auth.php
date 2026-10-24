<?php
// Auth routes — exact parity with server/routes/auth.js:
// register | login | verify-email | forgot | reset | resend-verification.
// Tokens are stored HASHED — a DB leak must not yield usable verify/reset links.

declare(strict_types=1);

function routeAuth(string $method, array $segments): void
{
    $action = $segments[0] ?? '';

    if ($method === 'POST' && $action === 'register') { authRegister(); return; }
    if ($method === 'POST' && $action === 'login')    { authLogin();    return; }
    if ($method === 'POST' && $action === 'logout')   { authLogout();   return; }
    if ($method === 'GET'  && $action === 'verify-email') { authVerifyEmail(); return; }
    if ($method === 'POST' && $action === 'verify' && ($segments[1] ?? '') === 'request') { authVerifyRequest(); return; }
    if ($method === 'GET'  && $action === 'verify')   { authVerifyToken(); return; }
    if ($method === 'GET'  && $action === 'sessions') { authSessions(); return; }
    if ($method === 'GET'  && $action === 'me') { authMe(); return; }
    if ($method === 'POST' && $action === 'forgot')   { authForgot();   return; }
    if ($method === 'POST' && $action === 'reset')    { authReset();    return; }
    if ($method === 'POST' && $action === 'resend-verification') { authResendVerification(); return; }
    if ($method === 'DELETE' && $action === 'account') { authDeleteAccount(); return; }

    json(['error' => 'Auth endpoint not found'], 404);
}

function authRegister(): void
{
    $payload = requestJson();
    $v = validate($payload, [
        'email'       => 'required|email|max:320',
        'password'    => 'required|min:8|max:128',
        'displayName' => 'max:60',
        'sect'        => 'required|in:Ithna Ashari (Twelver),Ismaili,Bohra (Dawoodi),Zaydi,Alevi,Other / Prefer not to say',
        'role'        => 'in:member,guardian,matchmaker',
    ]);
    if (!$v->ok) {
        je($v->firstError(), 400);
    }
    $email = strtolower((string)$v->get('email'));
    $password = (string)$v->get('password');
    $displayName = $v->get('displayName') ?: explode('@', $email)[0];
    $sect = (string)$v->get('sect');

    // Account type selected at signup: member (default), guardian, or matchmaker.
    $role = $v->get('role') ?: 'member';

    // ADMIN_EMAILS drives is_admin on register — the first-admin bootstrap.
    $adminEmails = adminEmails();
    $isAdmin = in_array($email, $adminEmails, true);
    $userId = uuid();
    $hash = password_hash($password, PASSWORD_BCRYPT);

    $pdo = db();
    try {
        $pdo->beginTransaction();
        $stmt = $pdo->prepare('INSERT INTO users (id, email, password_hash, display_name, is_admin, role) VALUES (?, ?, ?, ?, ?, ?)');
        $stmt->execute([$userId, $email, $hash, $displayName, $isAdmin ? 1 : 0, $role]);
        $profileStmt = $pdo->prepare('INSERT INTO profiles (user_id, display_name, sect) VALUES (?, ?, ?)');
        $profileStmt->execute([$userId, $displayName, $sect]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        if (($e instanceof PDOException) && (($e->errorInfo[1] ?? 0) === 1062 || stripos($e->getMessage(), 'Duplicate') !== false)) {
            je('An account with this email already exists.', 409);
        }
        throw $e;
    }

    // Email verification: explicit unverified flag plus a 24h token in the
    // email_verifications table (stored HASHED — a DB leak must not yield
    // usable verify links). The legacy users.email_verify_token columns stay
    // readable by GET /verify-email for any links already in flight.
    $pdo->prepare('UPDATE users SET email_verified = 0 WHERE id = ?')->execute([$userId]);
    $verifyToken = issueVerificationToken($userId);

    mailSend([
        'to' => $email,
        'subject' => 'Verify your Shia Rishta email',
        'text' => "Assalamu Alaikum {$displayName},\n\nConfirm your email to finish creating your account:\nhttps://shiarishta.com/verify/{$verifyToken}\n\nThis link expires in 72 hours.",
    ]);

    $userRow = ['id' => $userId, 'email' => $email, 'display_name' => $displayName, 'is_admin' => $isAdmin, 'email_verified' => false];
    $token = signSession($userRow);
    setAuthCookie($token);
    json([
        'user' => makeMemberSession($userRow),
        'token' => $token,
    ], 201);
}

function authLogin(): void
{
    $payload = requestJson();
    $email = strtolower(trim((string)($payload['email'] ?? '')));
    $password = (string)($payload['password'] ?? '');

    $row = db()->prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
    $row->execute([$email]);
    $user = $row->fetch();

    // Constant-shape errors: no account enumeration.
    if (!$user || !password_verify($password, (string)$user['password_hash'])) {
        je('Invalid email or password.', 401);
    }

    $token = signSession($user);
    // Track this login so the Security tab can list active sessions.
    recordSession((string)$user['id'], $token);
    // HttpOnly cookie: XSS-proof token storage for browsers.
    setAuthCookie($token);

    json([
        'user' => makeMemberSession($user),
        'token' => $token,
    ]);
}

function authLogout(): void
{
    // The client clears its own token; this drops the row so the session list
    // stops showing a signed-out device.
    requireAuthUser();
    dropSession();
    clearAuthCookie();
    json(['ok' => true]);
}

// GET /api/auth/me — fresh session snapshot from the DB (never trust the
// token's cached claims for mutable state like email_verified: the member
// may have verified in another tab/device after this token was minted).
function authMe(): void
{
    $user = requireAuthUser();
    $stmt = db()->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
    $stmt->execute([$user['uid']]);
    $row = $stmt->fetch();
    if (!$row) je('Authentication required', 401);
    json(['user' => makeMemberSession($row)]);
}

// ─── Email verification (table-based, P0) ────────────────────────────────────

// mailEnabled() now lives in lib/util.php (shared with recovery-cron.php).
// Guarded copy kept so auth.php still works if loaded without util.php.
if (!function_exists('mailEnabled')) {
    function mailEnabled(): bool
    {
        return strtolower(trim((string)(getenv('MAIL_ENABLED') ?: ''))) === 'true';
    }
}

// Issues (or replaces) the 24h verification token for a user. Returns the RAW
// token — the only place it ever exists in cleartext; the table holds the hash.
// POST /api/auth/verify/request — signed-in member asks for a fresh link.
function authVerifyRequest(): void
{
    $user = requireAuthUser();

    // MySQL has no UPDATE...RETURNING: probe first, then issue.
    $probe = db()->prepare('SELECT id, email, display_name FROM users WHERE id = ? AND email_verified = 0 LIMIT 1');
    $probe->execute([$user['uid']]);
    $row = $probe->fetch();

    if (!$row) {
        json(['ok' => true, 'alreadyVerified' => true]);
        return;
    }

    $token = issueVerificationToken((string)$user['uid']);
    $verifyUrl = 'https://shiarishta.com/verify/' . $token;

    if (mailEnabled()) {
        mailSend([
            'to' => $row['email'],
            'subject' => 'Verify your Shia Rishta email',
            'text' => "Assalamu Alaikum {$row['display_name']},\n\nConfirm your email to finish creating your account:\n{$verifyUrl}\n\nThis link expires in 72 hours.",
        ]);
        json(['ok' => true, 'message' => 'Verification email sent — check your inbox.']);
    }

    json(['ok' => true, 'devMode' => true, 'verifyUrl' => $verifyUrl]);
}

// GET /api/auth/verify?token=... — public. Consumes the token on success.
function authVerifyToken(): void
{
    $token = (string)($_GET['token'] ?? '');
    if ($token === '') {
        je('Missing verification token.', 400);
    }

    $stmt = db()->prepare('SELECT v.user_id, u.email_verified FROM email_verifications v JOIN users u ON u.id = v.user_id WHERE v.token_hash = ? AND v.expires_at > UTC_TIMESTAMP() LIMIT 1');
    $stmt->execute([sha256Hex($token)]);
    $row = $stmt->fetch();

    if (!$row) {
        json(['ok' => false, 'error' => 'This link has expired or was already used. Sign in to get a new one.'], 400);
    }

    // Idempotent: a re-tapped (or prefetched-then-tapped) link for an already
    // verified address is a success, not an error. Email clients and link
    // prefetchers routinely fetch verification URLs before the human taps.
    if (!empty($row['email_verified'])) {
        json(['ok' => true, 'emailVerified' => true, 'alreadyVerified' => true]);
    }

    $pdo = db();
    try {
        $pdo->beginTransaction();
        $pdo->prepare('UPDATE users SET email_verified = 1 WHERE id = ?')->execute([$row['user_id']]);
        // Keep the token row (do NOT delete): a second tap within the 24h
        // window resolves to the branch above instead of a confusing
        // "expired or already used" error. Expired rows are pruned on issue.
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    json(['ok' => true, 'emailVerified' => true]);
}

// GET /api/auth/sessions — newest first, with the caller's own marked.
function authSessions(): void
{
    $user = requireAuthUser();
    $stmt = db()->prepare('SELECT id, created_at, last_seen, ip, user_agent, token_hash FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50');
    $stmt->execute([$user['uid']]);
    $rows = $stmt->fetchAll();

    $current = sessionTokenHash();
    $out = [];
    foreach ($rows as $r) {
        $out[] = [
            'id' => $r['id'],
            'createdAt' => $r['created_at'],
            'lastSeen' => $r['last_seen'],
            'ip' => $r['ip'],
            'userAgent' => $r['user_agent'],
            'current' => $current !== null && hash_equals((string)$r['token_hash'], $current),
        ];
    }

    json($out);
}

// Gating helper for messaging and full profile views. Deliberately does NOT
// gate registration, onboarding publish, /profiles/me, or anonymous teasers.
function requireVerifiedEmail(string $uid): void
{
    $stmt = db()->prepare('SELECT email_verified FROM users WHERE id = ? LIMIT 1');
    $stmt->execute([$uid]);
    $row = $stmt->fetch();

    if (!$row || empty($row['email_verified'])) {
        json([
            'error' => 'Please verify your email to continue. Check your inbox for the verification link, or request a new one from Settings.',
            'emailVerificationRequired' => true,
        ], 403);
    }
}

function authVerifyEmail(): void
{
    $token = (string)($_GET['token'] ?? '');
    if ($token === '') {
        je('Missing verification token.', 400);
    }

    $stmt = db()->prepare('SELECT id FROM users WHERE email_verify_token = ? AND email_verify_expires > UTC_TIMESTAMP() LIMIT 1');
    $stmt->execute([sha256Hex($token)]);
    $user = $stmt->fetch();

    if (!$user) {
        je('This link has expired or was already used. Sign in to get a new one.', 400);
    }

    $update = db()->prepare('UPDATE users SET email_verified = 1, email_verify_token = NULL, email_verify_expires = NULL WHERE id = ?');
    $update->execute([$user['id']]);

    json(['ok' => true, 'emailVerified' => true]);
}
function authForgot(): void
{
    $payload = requestJson();
    $email = strtolower(trim((string)($payload['email'] ?? '')));

    // Constant response whether or not the account exists — no enumeration.
    if (filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $stmt = db()->prepare('SELECT id, display_name FROM users WHERE email = ? LIMIT 1');
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if ($user) {
            $token = bin2hex(random_bytes(32));
            db()->prepare("UPDATE users SET password_reset_token = ?, password_reset_expires = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 HOUR) WHERE id = ?")
                ->execute([sha256Hex($token), $user['id']]);

            mailSend([
                'to' => $email,
                'subject' => 'Reset your Shia Rishta password',
                'text' => "Assalamu Alaikum,\n\nReset your password with this link (valid 1 hour):\n" . publicBase() . "/auth/reset?token={$token}\n\nIf you did not request this, ignore this email — your account is safe.",
            ]);
        }
    }

    json(['ok' => true, 'message' => 'If that email is registered, a reset link is on its way.']);
}

function authReset(): void
{
    $payload = requestJson();
    $token = (string)($payload['token'] ?? '');
    $password = (string)($payload['password'] ?? '');

    if (strlen($password) < 8) {
        je('Password must be at least 8 characters.', 400);
    }

    // Hashed, single-use token.
    $stmt = db()->prepare('SELECT id FROM users WHERE password_reset_token = ? AND password_reset_expires > UTC_TIMESTAMP() LIMIT 1');
    $stmt->execute([sha256Hex($token)]);
    $user = $stmt->fetch();

    if (!$user) {
        je('This reset link has expired or was already used.', 400);
    }

    $hash = password_hash($password, PASSWORD_BCRYPT);
    db()->prepare('UPDATE users SET password_hash = ?, password_reset_token = NULL, password_reset_expires = NULL WHERE id = ?')
        ->execute([$hash, $user['id']]);

    json(['ok' => true, 'message' => 'Password updated. You can sign in with your new password.']);
}

function authResendVerification(): void
{
    // Reads the session from the bearer token itself: the only address this
    // endpoint can ever mail is the signed-in account's own.
    $user = requireAuthUser();
    $token = bin2hex(random_bytes(32));

    // MySQL has no UPDATE...RETURNING: probe first, then update.
    $probe = db()->prepare('SELECT id, email, display_name FROM users WHERE id = ? AND email_verified = 0 LIMIT 1');
    $probe->execute([$user['uid']]);
    $row = $probe->fetch();

    if (!$row) {
        json(['ok' => true, 'alreadyVerified' => true]);
        return;
    }

    db()->prepare("UPDATE users SET email_verify_token = ?, email_verify_expires = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 24 HOUR) WHERE id = ?")
        ->execute([sha256Hex($token), $user['uid']]);

    mailSend([
        'to' => $row['email'],
        'subject' => 'Verify your Shia Rishta email',
        'text' => "Assalamu Alaikum {$row['display_name']},\n\nConfirm your email to finish creating your account:\n" . publicBase() . "/verify-email?token={$token}\n\nThis link expires in 72 hours.",
    ]);

    json(['ok' => true, 'message' => 'Verification email sent — check your inbox.']);
}

function authDeleteAccount(): void
{
    $user = requireAuthUser();
    $uid = (string)$user['uid'];
    $pdo = db();

    try {
        $pdo->beginTransaction();
        // Delete in dependency order. Foreign keys with ON DELETE CASCADE
        // handle most of this, but explicit deletes are safer.
        $pdo->prepare('DELETE FROM messages WHERE sender_id = ?')->execute([$uid]);
        $pdo->prepare('DELETE FROM conversations WHERE user_a = ? OR user_b = ?')->execute([$uid, $uid]);
        $pdo->prepare('DELETE FROM interests WHERE from_user_id = ? OR to_user_id = ?')->execute([$uid, $uid]);
        $pdo->prepare('DELETE FROM blocks WHERE blocker_id = ? OR blocked_id = ?')->execute([$uid, $uid]);
        $pdo->prepare('DELETE FROM reports WHERE reporter_id = ?')->execute([$uid]);
        $pdo->prepare('DELETE FROM wali_links WHERE user_id = ?')->execute([$uid]);
        $pdo->prepare('DELETE FROM verifications WHERE user_id = ?')->execute([$uid]);
        $pdo->prepare('DELETE FROM profiles WHERE user_id = ?')->execute([$uid]);
        $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$uid]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    json(['ok' => true, 'message' => 'Your account has been deleted.']);
}

