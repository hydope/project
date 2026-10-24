<?php
// Account management routes.
// DELETE /users/me — full data wipe (transactional, irreversible).
// PUT    /users/me — change display name and/or email.

declare(strict_types=1);

function routeUsers(string $method, array $segments): void
{
    $id = $segments[0] ?? null;
    if ($id !== 'me') {
        json(['error' => 'Users endpoint not found'], 404);
    }
    if ($method === 'DELETE') { userDeleteMe(); return; }
    if ($method === 'PUT')     { userUpdateMe(); return; }
    if ($method === 'POST' && ($segments[1] ?? '') === 'role') { userSetRole(); return; }
    if ($method === 'GET' && ($segments[1] ?? '') === 'completeness') { userCompleteness(); return; }
    if ($method === 'GET' && ($segments[1] ?? '') === 'draft') { userGetDraft(); return; }
    if ($method === 'PUT' && ($segments[1] ?? '') === 'draft') { userPutDraft(); return; }

    json(['error' => 'Users endpoint not found'], 404);
}

// POST /api/users/me/role — set the account type chosen after signup.
// Only member/guardian/matchmaker are allowed; admins are unaffected.
function userSetRole(): void
{
    $user = requireAuthUser();
    $body = requestJson();
    $role = trim((string)($body['role'] ?? ''));
    if (!in_array($role, ['member', 'guardian', 'matchmaker'], true)) {
        je('Invalid role.', 400);
    }
    // Never allow self-promotion to admin through this endpoint.
    db()->prepare('UPDATE users SET role = ? WHERE id = ?')->execute([$role, (string)$user['uid']]);
    json(['ok' => true, 'role' => $role]);
}

function userDeleteMe(): void
{
    $user = requireAuthUser();
    $uid = (string)$user['uid'];
    $pdo = db();

    try {
        $pdo->beginTransaction();
        // Delete in dependency order. Explicit deletes stay correct even
        // where foreign keys are not declared with cascades.
        $pdo->prepare('DELETE FROM messages WHERE sender_id = ?')->execute([$uid]);
        $pdo->prepare('DELETE FROM conversations WHERE user_a = ? OR user_b = ?')->execute([$uid, $uid]);
        $pdo->prepare('DELETE FROM interests WHERE from_user_id = ? OR to_user_id = ?')->execute([$uid, $uid]);
        $pdo->prepare('DELETE FROM blocks WHERE blocker_id = ? OR blocked_id = ?')->execute([$uid, $uid]);
        $pdo->prepare('DELETE FROM reports WHERE reporter_id = ?')->execute([$uid]);
        $pdo->prepare('DELETE FROM wali_links WHERE user_id = ?')->execute([$uid]);
        $pdo->prepare('DELETE FROM verifications WHERE user_id = ?')->execute([$uid]);
        $pdo->prepare('DELETE FROM sessions WHERE user_id = ?')->execute([$uid]);
        $pdo->prepare('DELETE FROM email_verifications WHERE user_id = ?')->execute([$uid]);
        $pdo->prepare('DELETE FROM profiles WHERE user_id = ?')->execute([$uid]);
        $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$uid]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    json(['ok' => true]);
}

function userMeShape(array $row): array
{
    return [
        'uid' => (string)$row['id'],
        'email' => (string)$row['email'],
        'displayName' => (string)$row['display_name'],
        'emailVerified' => (bool)$row['email_verified'],
    ];
}

function userUpdateMe(): void
{
    $user = requireAuthUser();
    $uid = (string)$user['uid'];
    $b = requestJson();
    $pdo = db();

    $stmt = $pdo->prepare('SELECT id, email, display_name, email_verified FROM users WHERE id = ? LIMIT 1');
    $stmt->execute([$uid]);
    $row = $stmt->fetch();
    if (!$row) {
        je('Account not found.', 404);
    }

    $updates = [];
    $params = [];
    $displayName = array_key_exists('displayName', $b) ? trim((string)$b['displayName']) : null;
    $email = array_key_exists('email', $b) ? strtolower(trim((string)$b['email'])) : null;

    if ($displayName !== null) {
        $len = mb_strlen($displayName);
        if ($len < 2 || $len > 60) {
            je('Display name must be 2–60 characters.', 400);
        }
        $updates[] = 'display_name = ?';
        $params[] = $displayName;
    }

    if ($email !== null) {
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            je('Enter a valid email address.', 400);
        }
        // Constant-shape check: the query only asks "is this taken by someone
        // else", never whether any account exists for it.
        $dup = $pdo->prepare('SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1');
        $dup->execute([$email, $uid]);
        if ($dup->fetch()) {
            je('An account with this email already exists.', 409);
        }
        if ($email !== strtolower((string)$row['email'])) {
            $updates[] = 'email = ?';
            $params[] = $email;
            // A new email must be re-verified before messaging unlocks again.
            $updates[] = 'email_verified = 0';
        }
    }

    $emailChanged = $email !== null && $email !== strtolower((string)$row['email']);

    if (empty($updates)) {
        json(userMeShape($row));
    }

    $params[] = $uid;
    $pdo->prepare('UPDATE users SET ' . implode(', ', $updates) . ' WHERE id = ?')
        ->execute($params);

    // Keep the public profile name in sync — the profile row is what other
    // members see, and the two must never disagree.
    if ($displayName !== null) {
        $pdo->prepare('UPDATE profiles SET display_name = ? WHERE user_id = ?')
            ->execute([$displayName, $uid]);
    }

    $verifyUrl = null;
    if ($emailChanged) {
        $verifyToken = issueVerificationToken($uid);
        $verifyUrl = 'https://shiarishta.com/verify/' . $verifyToken;
        if (mailEnabled()) {
            mailSend([
                'to' => $email,
                'subject' => 'Verify your new Shia Rishta email',
                'text' => "Assalamu Alaikum {$displayName},\n\nYou changed your account email. Confirm it to keep your account fully active:\n{$verifyUrl}\n\nThis link expires in 24 hours.",
            ]);
        }
    }

    $stmt->execute([$uid]);
    $out = userMeShape($stmt->fetch());

    // Explicit devMode stopgap: SMTP comes later; until then the UI can surface
    // the verification link directly.
    if ($verifyUrl !== null && !mailEnabled()) {
        $out['devMode'] = true;
        $out['verifyUrl'] = $verifyUrl;
    }

    json($out);
}

// GET /api/users/me/completeness — profile completion % + what's missing.
// Used by the dashboard recovery banner and the "finish in 2 minutes" flow.
// Never blocks: an incomplete profile is a normal state, not an error.
function userCompleteness(): void
{
    $user = requireAuthUser();
    $uid = $user['uid'];

    $uRow = db()->prepare('SELECT email_verified FROM users WHERE id = ? LIMIT 1');
    $uRow->execute([$uid]);
    $u = $uRow->fetch();
    if (!$u) { json(['error' => 'User not found'], 404); }

    $pRow = db()->prepare('SELECT city, country, bio, about_family, photo_url FROM profiles WHERE user_id = ? LIMIT 1');
    $pRow->execute([$uid]);
    $p = $pRow->fetch() ?: [];

    $missing = [];
    if (!(int)$u['email_verified']) $missing[] = 'email';
    if (empty($p['city']) || empty($p['country'])) $missing[] = 'location';
    if (empty($p['bio']) && empty($p['about_family'])) $missing[] = 'bio';
    if (empty($p['photo_url'])) $missing[] = 'photo';

    // Weights: email 25, location 30, bio 30, photo 15.
    $weights = ['email' => 25, 'location' => 30, 'bio' => 30, 'photo' => 15];
    $pct = 100;
    foreach ($missing as $m) $pct -= $weights[$m];

    $next = null;
    if (in_array('email', $missing, true)) $next = 'email';
    elseif (in_array('location', $missing, true)) $next = 'location';
    elseif (in_array('bio', $missing, true)) $next = 'bio';
    elseif (in_array('photo', $missing, true)) $next = 'photo';

    json([
        'ok' => true,
        'percent' => $pct,
        'complete' => empty($missing),
        'emailVerified' => (bool)(int)$u['email_verified'],
        'missing' => $missing,
        'nextStep' => $next,
    ]);
}

// GET /api/users/me/draft — server-side onboarding draft (2026-10-24).
// Replaces localStorage-only drafts so a member can resume from any device.
function userGetDraft(): void
{
    $user = requireAuthUser();
    $row = db()->prepare('SELECT onboarding_draft FROM profiles WHERE user_id = ? LIMIT 1');
    $row->execute([$user['uid']]);
    $p = $row->fetch();
    $draft = null;
    if ($p && !empty($p['onboarding_draft'])) {
        $draft = json_decode($p['onboarding_draft'], true);
    }
    json(['ok' => true, 'draft' => $draft]);
}

// PUT /api/users/me/draft — save onboarding draft to the server.
function userPutDraft(): void
{
    $user = requireAuthUser();
    $body = requestJson();
    $draft = $body['draft'] ?? null;
    if (!is_array($draft)) { je('Draft must be an object.', 400); }
    // Cap size: drafts are form answers, never large blobs.
    $encoded = json_encode($draft);
    if (strlen($encoded) > 20000) { je('Draft too large.', 400); }
    db()->prepare('UPDATE profiles SET onboarding_draft = ? WHERE user_id = ?')
        ->execute([$encoded, $user['uid']]);
    json(['ok' => true]);
}
