<?php
// Introductions — parity with server/routes/drafts.js.
// Safety invariants enforced here, not in the UI:
//   • a draft is never a profile — invisible to search/messaging until claimed
//   • matchmakers may only draft FEMALE profiles; guardians may draft family
//   • the creator must attest they have the subject's permission
//   • claiming requires the link token AND the draft's email; token is consumed
//   • MySQL has no RETURNING: every write reads back explicitly
declare(strict_types=1);

const CLAIM_DAYS = 45;              // generous: people are busy
const CLAIM_BONUS = 5;              // more slots earned by claimed drafts

function routeDrafts(string $method, array $segments): void
{
    $action = $segments[0] ?? null;

    if ($method === 'GET' && $action === 'capabilities') { draftsCapabilities(); return; }
    if ($method === 'POST' && $action === null) { draftsCreate(); return; }
    if ($method === 'GET' && $action === 'mine') { draftsMine(); return; }
    if ($method === 'GET' && $action === 'by-short-code' && ($segments[1] ?? null) !== null) { draftsByShortCode((string)$segments[1]); return; }
    if ($method === 'GET' && $action === 'claim' && ($segments[1] ?? null) !== null) { draftsClaimPreview((string)$segments[1]); return; }
    if ($method === 'POST' && $action === 'claim' && ($segments[1] ?? null) !== null && ($segments[2] ?? null) === 'decline') { draftsClaimDecline((string)$segments[1]); return; }
    if ($method === 'POST' && $action === 'claim' && ($segments[1] ?? null) !== null) { draftsClaim((string)$segments[1]); return; }
    if ($method === 'POST' && $action !== null && ($segments[1] ?? null) === 'send') { draftsSend((string)$action); return; }
    if ($method === 'POST' && $action !== null && ($segments[1] ?? null) === 'extend') { draftsExtend((string)$action); return; }
    if ($method === 'GET' && $action !== null && ($segments[1] ?? null) === 'events') { draftsEvents((string)$action); return; }
    if ($method === 'DELETE' && $action !== null) { draftsWithdraw((string)$action); return; }

    json(['error' => 'Drafts endpoint not found'], 404);
}

// Role always comes from the DB — a JWT claim would go stale the moment an
// admin grants (or revokes) matchmaker/guardian.
function roleOf(string $userId): string
{
    $stmt = db()->prepare('SELECT role FROM users WHERE id = ? LIMIT 1');
    $stmt->execute([$userId]);
    $row = $stmt->fetch();
    return (string)($row['role'] ?? 'member');
}

function quotaFor(string $userId, string $role): array
{
    $base = $role === 'matchmaker' ? 10 : ($role === 'guardian' ? 5 : 0);
    $claimedStmt = db()->prepare("SELECT COUNT(*) AS n FROM profile_drafts WHERE created_by = ? AND status = 'claimed'");
    $claimedStmt->execute([$userId]);
    $claimed = (int)($claimedStmt->fetch()['n'] ?? 0);
    $openStmt = db()->prepare("SELECT COUNT(*) AS n FROM profile_drafts WHERE created_by = ? AND status = 'awaiting_claim'");
    $openStmt->execute([$userId]);
    $open = (int)($openStmt->fetch()['n'] ?? 0);
    return ['limit' => $base + ($claimed * CLAIM_BONUS), 'open' => $open, 'claimed' => $claimed];
}

// Append-only audit — best-effort, never blocks the request (Node logEvent).
function logEvent(string $draftId, ?string $actorId, string $event, ?string $detail = null): void
{
    try {
        db()->prepare('INSERT INTO draft_events (draft_id, actor_id, event, detail) VALUES (?, ?, ?, ?)')
            ->execute([$draftId, $actorId, $event, $detail]);
    } catch (Throwable $e) {
        error_log('[drafts] audit write failed: ' . $e->getMessage());
    }
}

// GET /api/drafts/capabilities — what this member may do (drives the UI; the
// real enforcement lives in every write below).
function draftsCapabilities(): void
{
    $user = requireAuthUser();
    $role = roleOf((string)$user['uid']);
    $canDraft = in_array($role, ['matchmaker', 'guardian'], true);

    json([
        'role' => $role,
        'canDraft' => $canDraft,
        'draftGenderScope' => $role === 'matchmaker' ? ['female'] : ($role === 'guardian' ? ['male', 'female'] : []),
        'quota' => $canDraft ? quotaFor((string)$user['uid'], $role) : null,
    ]);
}
// POST /api/drafts — create a private draft (role + scope + quota + attestation)
function draftsCreate(): void
{
    $user = requireAuthUser();
    $role = roleOf((string)$user['uid']);
    if (!in_array($role, ['matchmaker', 'guardian'], true)) {
        je('Only verified matchmakers and guardians can introduce a profile.', 403);
    }

    $payload = requestJson();
    $gender = trim((string)($payload['gender'] ?? ''));
    if (!in_array($gender, ['male', 'female'], true)) {
        je('Choose male or female.', 400);
    }
    // Scope: matchmaker = female only; guardian = family drafts (any gender).
    if ($role === 'matchmaker' && $gender !== 'female') {
        je('Matchmaker accounts may introduce female profiles only. Family drafts for men are created by a guardian.', 403);
    }
    if (empty($payload['consentAttested'])) {
        je('You must confirm you have this person’s permission to share their contact details.', 400);
    }

    $displayName = trim((string)($payload['displayName'] ?? ''));
    $contactEmail = strtolower(trim((string)($payload['contactEmail'] ?? '')));
    if ($displayName === '') je('A name is required.', 400);
    if (!filter_var($contactEmail, FILTER_VALIDATE_EMAIL)) je('A valid email for her is required.', 400);

    $age = isset($payload['age']) && $payload['age'] !== '' ? (int)$payload['age'] : null;
    if ($age !== null && ($age < 18 || $age > 100)) je('Age must be between 18 and 100.', 400);

    // Guardian drafts must state the relationship — this is their legal backbone.
    $relationship = trim((string)($payload['relationship'] ?? ''));
    if ($role === 'guardian' && $relationship === '') {
        je('State your relationship (son, nephew, sister…).', 400);
    }

    $quota = quotaFor((string)$user['uid'], $role);
    if ($quota['open'] >= $quota['limit']) {
        je('You already have ' . $quota['open'] . ' introductions awaiting a response. Claimed profiles unlock more slots.', 429);
    }

    $draftId = uuid();
    $claimToken = randomBase64Url(32);
    $shortCode = strtoupper(substr(bin2hex(random_bytes(3)), 0, 6));
    $expires = gmdate('Y-m-d H:i:s', time() + (CLAIM_DAYS * 86400));
    $contactPhone = trim((string)($payload['contactPhone'] ?? '')) ?: null;

    $stmt = db()->prepare(
        'INSERT INTO profile_drafts (id, created_by, creator_role, claim_token, claim_token_expires, short_code,
            gender, relationship, display_name, age, city, country, sect, profession, bio, expectations,
            about_family, contact_email, contact_phone, consent_attested, consent_attested_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, UTC_TIMESTAMP())'
    );
    $stmt->execute([
        $draftId, $user['uid'], $role, $claimToken, $expires, $shortCode,
        $gender, $relationship !== '' ? $relationship : null, $displayName, $age,
        trim((string)($payload['city'] ?? '')) ?: null,
        // Canonical country on save (E-01a): "usa"/"United States" → "USA".
        ProfileService::canonicalCountry(trim((string)($payload['country'] ?? '')) ?: null),
        trim((string)($payload['sect'] ?? '')) ?: null,
        trim((string)($payload['profession'] ?? '')) ?: null,
        trim((string)($payload['bio'] ?? '')) ?: null,
        trim((string)($payload['expectations'] ?? '')) ?: null,
        trim((string)($payload['aboutFamily'] ?? '')) ?: null,
        $contactEmail, $contactPhone,
    ]);

    logEvent($draftId, (string)$user['uid'], 'created', 'role=' . $role . ' gender=' . $gender);
    logEvent($draftId, (string)$user['uid'], 'consent_attested', $contactEmail);

    $base = publicBase();
    json([
        'ok' => true,
        'draft' => [
            'id' => $draftId,
            'status' => 'awaiting_claim',
            'gender' => $gender,
            'displayName' => $displayName,
            'shortCode' => $shortCode,
            'expiresAt' => $expires,
        ],
        'shareUrl' => $base . '/claim/' . $claimToken,
        'whatsappUrl' => 'https://wa.me/?text=' . rawurlencode(
            "Assalamu Alaikum — I have set up a private profile for you on Shia Rishta (nikah-first matchmaking). Review it and make it yours here (valid " . CLAIM_DAYS . " days): {$base}/claim/{$claimToken}\n\nShort code if the link expires: {$shortCode}"
        ),
        'quota' => quotaFor((string)$user['uid'], $role),
    ], 201);
}

// GET /api/drafts/mine — my drafts with status (dashboard feed). The claim
// token is only ever exposed while the invitation is still live.
function draftsMine(): void
{
    $user = requireAuthUser();
    $stmt = db()->prepare('SELECT id, status, gender, display_name, short_code, claim_token, claim_token_expires,
            contact_email, send_count, last_sent_at, claimed_at, declined_at, created_at
        FROM profile_drafts WHERE created_by = ? ORDER BY created_at DESC LIMIT 100');
    $stmt->execute([$user['uid']]);
    $rows = $stmt->fetchAll();
    $base = publicBase();

    $out = [];
    foreach ($rows as $row) {
        $item = $row;
        // Node masks the token for resolved drafts: key omitted entirely.
        if (($row['status'] ?? '') !== 'awaiting_claim') {
            unset($item['claim_token']);
        } else {
            $item['shareUrl'] = $base . '/claim/' . $row['claim_token'];
        }
        $out[] = $item;
    }

    json($out);
}
// POST /api/drafts/:id/send — platform email (dual delivery alongside her own
// WhatsApp share). Resend is allowed; every send is audited.
function draftsSend(string $draftId): void
{
    $user = requireAuthUser();
    $stmt = db()->prepare('SELECT * FROM profile_drafts WHERE id = ? AND created_by = ? LIMIT 1');
    $stmt->execute([$draftId, $user['uid']]);
    $draft = $stmt->fetch();

    if (!$draft) je('Draft not found.', 404);
    if (($draft['status'] ?? '') !== 'awaiting_claim') je('This draft is already resolved.', 400);

    $byStmt = db()->prepare('SELECT display_name FROM users WHERE id = ? LIMIT 1');
    $byStmt->execute([$user['uid']]);
    $by = $byStmt->fetch()['display_name'] ?? 'A verified matchmaker';
    $link = publicBase() . '/claim/' . $draft['claim_token'];

    mailSend([
        'to' => $draft['contact_email'],
        'subject' => "{$by} set up a private profile for you on Shia Rishta",
        'text' => "Assalamu Alaikum {$draft['display_name']},\n\n{$by}, a verified {$draft['creator_role']} on Shia Rishta (nikah-first matchmaking), set up a private profile for you and confirmed they have your permission to share your details.\n\nReview it and make it yours (valid " . CLAIM_DAYS . " days):\n{$link}\n\nShort code if the link does not work: {$draft['short_code']}\n\nNot you, or do not want this? Decline and erase everything:\n{$link}?decline=1\n\nNothing is public. Your photo is not included — you add it yourself if you claim the profile.",
    ]);

    db()->prepare('UPDATE profile_drafts SET last_sent_at = UTC_TIMESTAMP(), send_count = send_count + 1 WHERE id = ?')
        ->execute([$draftId]);
    logEvent($draftId, (string)$user['uid'], 'invite_sent', $draft['contact_email']);

    json(['ok' => true, 'sentTo' => $draft['contact_email'], 'expiresAt' => $draft['claim_token_expires']]);
}

// POST /api/drafts/:id/extend — one-tap extension for busy people (fresh window)
function draftsExtend(string $draftId): void
{
    $user = requireAuthUser();
    // Probe first: PDO MySQL rowCount() counts CHANGED rows, and a create →
    // extend inside the same second produces an identical timestamp → 0
    // changed rows would false-404. Node's UPDATE...RETURNING has no such trap.
    $probe = db()->prepare("SELECT id FROM profile_drafts WHERE id = ? AND created_by = ? AND status = 'awaiting_claim' LIMIT 1");
    $probe->execute([$draftId, $user['uid']]);
    if (!$probe->fetch()) {
        je('Draft not found or already resolved.', 404);
    }
    // MySQL has no UPDATE...RETURNING: update, then read back.
    // CLAIM_DAYS is a code constant (not input) — inlined so no placeholder
    // is needed inside the INTERVAL expression.
    $days = (int)CLAIM_DAYS;
    db()->prepare("UPDATE profile_drafts SET claim_token_expires = DATE_ADD(UTC_TIMESTAMP(), INTERVAL {$days} DAY)
        WHERE id = ?")->execute([$draftId]);

    $fetch = db()->prepare('SELECT claim_token_expires FROM profile_drafts WHERE id = ? LIMIT 1');
    $fetch->execute([$draftId]);
    $row = $fetch->fetch();
    logEvent($draftId, (string)$user['uid'], 'extended', (string)$row['claim_token_expires']);

    json(['ok' => true, 'expiresAt' => $row['claim_token_expires']]);
}

// GET /api/drafts/by-short-code/:code — manual entry when the link is lost.
function draftsByShortCode(string $code): void
{
    $stmt = db()->prepare("SELECT claim_token FROM profile_drafts
        WHERE short_code = ? AND status = 'awaiting_claim' AND claim_token_expires > UTC_TIMESTAMP() LIMIT 1");
    $stmt->execute([strtoupper(trim($code))]);
    $row = $stmt->fetch();
    if (!$row) {
        je('That code is unknown, expired or already used.', 404);
    }

    json(['ok' => true, 'claimUrl' => publicBase() . '/claim/' . $row['claim_token']]);
}

// GET /api/drafts/claim/:token — public review preview. The token is the only
// key, so the preview deliberately OMITS contact details: a leaked link must
// never yield her email or phone.
function draftsClaimPreview(string $token): void
{
    $stmt = db()->prepare('SELECT d.*, u.display_name AS creator_name
        FROM profile_drafts d JOIN users u ON u.id = d.created_by
        WHERE d.claim_token = ? LIMIT 1');
    $stmt->execute([$token]);
    $draft = $stmt->fetch();

    if (!$draft) {
        je('This link is unknown. Ask for a fresh one or enter the short code.', 404);
    }
    if (($draft['status'] ?? '') === 'claimed') {
        je('Already claimed — she owns it now.', 410);
    }
    if (($draft['status'] ?? '') === 'declined') {
        je('This invitation was declined and erased.', 410);
    }
    if (strtotime((string)$draft['claim_token_expires']) < time()) {
        db()->prepare("UPDATE profile_drafts SET status = 'expired' WHERE id = ?")->execute([$draft['id']]);
        je('Expired. The matchmaker can extend it with one tap.', 410);
    }

    json([
        'draft' => [
            'displayName' => $draft['display_name'],
            'gender' => $draft['gender'],
            'age' => $draft['age'] !== null ? (int)$draft['age'] : null,
            'city' => $draft['city'],
            'country' => $draft['country'],
            'sect' => $draft['sect'],
            'profession' => $draft['profession'],
            'bio' => $draft['bio'],
            'expectations' => $draft['expectations'],
            'aboutFamily' => $draft['about_family'],
            'relationship' => $draft['relationship'],
            'creatorRole' => $draft['creator_role'],
            'creatorName' => $draft['creator_name'],
            'expiresAt' => $draft['claim_token_expires'],
            'maskedEmail' => preg_replace('/^(.).*(@.*)$/', '$1•••$2', (string)$draft['contact_email']),
        ],
    ]);
}
// POST /api/drafts/claim/:token/decline — no account needed. Immediate hard
// erase: every personal field is scrubbed and the token dies.
function draftsClaimDecline(string $token): void
{
    $stmt = db()->prepare('SELECT * FROM profile_drafts WHERE claim_token = ? LIMIT 1');
    $stmt->execute([$token]);
    $draft = $stmt->fetch();

    if (!$draft || ($draft['status'] ?? '') !== 'awaiting_claim') {
        je('Unknown or already resolved.', 404);
    }

    db()->prepare("UPDATE profile_drafts SET status = 'declined', declined_at = UTC_TIMESTAMP(), scrubbed_at = UTC_TIMESTAMP(),
        display_name = '[declined]', age = NULL, city = NULL, country = NULL, sect = NULL, profession = NULL,
        bio = NULL, expectations = NULL, about_family = NULL, relationship = NULL,
        contact_email = 'declined.invalid', contact_phone = NULL,
        claim_token = CONCAT('dead-', UUID()) WHERE id = ?")->execute([$draft['id']]);

    logEvent($draft['id'], null, 'declined', 'subject declined, fields scrubbed');
    json(['ok' => true, 'message' => 'Declined and erased. Nothing of yours remains on Shia Rishta.']);
}

// POST /api/drafts/claim/:token — claim turns the draft into HER real profile.
// Signed in with the draft's email, OR creates a fresh account for that email.
// Her name at claim wins; ownership lands on her; the token dies.
function draftsClaim(string $token): void
{
    $payload = requestJson();
    $stmt = db()->prepare('SELECT * FROM profile_drafts WHERE claim_token = ? LIMIT 1');
    $stmt->execute([$token]);
    $draft = $stmt->fetch();

    if (!$draft || ($draft['status'] ?? '') !== 'awaiting_claim') {
        je('Unknown or already resolved.', 404);
    }
    if (strtotime((string)$draft['claim_token_expires']) < time()) {
        db()->prepare("UPDATE profile_drafts SET status = 'expired' WHERE id = ?")->execute([$draft['id']]);
        je('Expired. The matchmaker can extend it with one tap.', 410);
    }

    $email = strtolower(trim((string)($payload['email'] ?? '')));
    if ($email !== strtolower((string)$draft['contact_email'])) {
        je('Claim with the same email the invitation was sent to.', 400);
    }

    // Optional bearer session: an already-signed-in member must own this email.
    $sessionUser = currentUser();
    $userId = null;
    if ($sessionUser !== null) {
        $uStmt = db()->prepare('SELECT id, email FROM users WHERE id = ? LIMIT 1');
        $uStmt->execute([$sessionUser['uid']]);
        $u = $uStmt->fetch();
        if (!$u || strtolower((string)$u['email']) !== $email) {
            je('Claim with the same email the invitation was sent to.', 400);
        }
        $userId = (string)$u['id'];
    } else {
        $exists = db()->prepare('SELECT id, password_hash FROM users WHERE email = ? LIMIT 1');
        $exists->execute([$email]);
        $existing = $exists->fetch();

        $password = (string)($payload['password'] ?? '');
        if ($existing) {
            // Account exists: claiming must prove ownership of it.
            if (!password_verify($password, (string)$existing['password_hash'])) {
                je('This email already has an account — sign in, then open the link again.', 409);
            }
            $userId = (string)$existing['id'];
        } else {
            if (strlen($password) < 8) {
                je('Choose a password of at least 8 characters.', 400);
            }
            $userId = uuid();
            $displayName = trim((string)($payload['displayName'] ?? '')) ?: (string)$draft['display_name'];
            $pdo = db();
            try {
                $pdo->beginTransaction();
                $pdo->prepare('INSERT INTO users (id, email, password_hash, display_name) VALUES (?, ?, ?, ?)')
                    ->execute([$userId, $email, password_hash($password, PASSWORD_BCRYPT), $displayName]);
                $pdo->prepare('INSERT INTO profiles (user_id, display_name) VALUES (?, ?)')
                    ->execute([$userId, $displayName]);
                $pdo->commit();
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                throw $e;
            }
        }
    }
    // Seed her profile from the draft. Existing profile: COALESCE keeps her data;
    // fresh profile: her chosen name at claim wins over the draft placeholder.
    $profile = db()->prepare('SELECT user_id FROM profiles WHERE user_id = ? LIMIT 1');
    $profile->execute([$userId]);
    if ($profile->fetch()) {
        db()->prepare('UPDATE profiles SET display_name = COALESCE(NULLIF(display_name, \'\'), ?),
            age = COALESCE(age, ?), gender = COALESCE(gender, ?), city = COALESCE(city, ?),
            country = COALESCE(country, ?), sect = COALESCE(sect, ?), profession = COALESCE(profession, ?),
            bio = COALESCE(bio, ?), expectations = COALESCE(expectations, ?), about_family = COALESCE(about_family, ?),
            introduced_by = ?, introduced_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP()
            WHERE user_id = ?')->execute([
            $draft['display_name'], $draft['age'], $draft['gender'], $draft['city'], $draft['country'],
            $draft['sect'], $draft['profession'], $draft['bio'], $draft['expectations'], $draft['about_family'],
            $draft['created_by'], $userId,
        ]);
    } else {
        $chosenName = trim((string)($payload['displayName'] ?? '')) ?: (string)$draft['display_name'];
        db()->prepare('INSERT INTO profiles (user_id, display_name, age, gender, city, country, sect, profession,
            bio, expectations, about_family, introduced_by, introduced_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())')->execute([
            $userId, $chosenName, $draft['age'], $draft['gender'], $draft['city'], $draft['country'],
            $draft['sect'], $draft['profession'], $draft['bio'], $draft['expectations'], $draft['about_family'],
            $draft['created_by'],
        ]);
    }

    // Token dies: consumed, replaced with an unusable marker.
    db()->prepare("UPDATE profile_drafts SET status = 'claimed', claimed_by = ?, claimed_at = UTC_TIMESTAMP(),
        claim_token = CONCAT('claimed-', UUID()) WHERE id = ?")->execute([$userId, $draft['id']]);
    logEvent($draft['id'], $userId, 'claimed', 'owner=' . $userId);

    $sessionStmt = db()->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
    $sessionStmt->execute([$userId]);
    $sessionUserRow = $sessionStmt->fetch();

    json([
        'ok' => true,
        'user' => makeMemberSession($sessionUserRow),
        'token' => signSession($sessionUserRow),
    ], 201);
}

// GET /api/drafts/:id/events — audit trail (creator + admins only)
function draftsEvents(string $draftId): void
{
    $user = requireAuthUser();
    $draftStmt = db()->prepare('SELECT created_by FROM profile_drafts WHERE id = ? LIMIT 1');
    $draftStmt->execute([$draftId]);
    $draft = $draftStmt->fetch();
    if (!$draft) je('Not found.', 404);

    // Admin branch re-checks the DB, not the stale isAdmin claim (A-03 sweep).
    $can = ((string)$draft['created_by'] === (string)$user['uid']) || userIsAdmin((string)$user['uid']);
    if (!$can) je('Not yours to inspect.', 403);

    $stmt = db()->prepare('SELECT event, detail, created_at FROM draft_events WHERE draft_id = ? ORDER BY created_at ASC LIMIT 100');
    $stmt->execute([$draftId]);
    json($stmt->fetchAll());
}

// DELETE /api/drafts/:id — creator withdraws an unresolved draft (scrubbed)
function draftsWithdraw(string $draftId): void
{
    $user = requireAuthUser();
    $upd = db()->prepare("UPDATE profile_drafts SET status = 'expired', scrubbed_at = UTC_TIMESTAMP(),
        display_name = '[withdrawn]', bio = NULL, expectations = NULL, about_family = NULL,
        contact_email = 'withdrawn.invalid', contact_phone = NULL,
        claim_token = CONCAT('dead-', UUID())
        WHERE id = ? AND created_by = ? AND status = 'awaiting_claim'");
    $upd->execute([$draftId, $user['uid']]);
    if ($upd->rowCount() === 0) {
        je('Not found or already resolved.', 404);
    }

    logEvent($draftId, (string)$user['uid'], 'withdrawn', 'creator withdrew, fields scrubbed');
    json(['ok' => true]);
}




