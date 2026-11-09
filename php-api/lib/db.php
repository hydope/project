<?php
// PDO connection (MariaDB/MySQL, utf8mb4, UTC session) + shared route helpers.

// Guarded so an offline test harness can supply its own db() before including
// this file. Without the guard, every test that wanted to exercise visibleProfile()
// or mutualInterest() had to reach into this file — which is why those two
// functions had no coverage at all.
if (!function_exists('db')) {
function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $host = getenv('DB_HOST') ?: '127.0.0.1';
    $port = (int)(getenv('DB_PORT') ?: 3306);
    $db   = getenv('DB_NAME') ?: 'shiarishta';
    $user = getenv('DB_USER') ?: 'root';
    $pass = getenv('DB_PASSWORD') ?: '';

    $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $host, $port, $db);
    $pdo = new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    // Store every timestamp as UTC so NOW() matches gmdate() in PHP.
    $pdo->exec("SET time_zone = '+00:00'");

    return $pdo;
}
}

// Test-shell predicates live in their own file: lib/db.php declares
// requestJson()/sanitizeText(), which every test harness stubs itself, so
// requiring db.php from a probe is a fatal redeclare. The matching rules are
// the part with real bug potential, so they get tested directly.
require_once __DIR__ . '/test_shell_patterns.php';

function requestJson(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }
    // Node's express.json({limit:'2mb'}) rejects oversized bodies too.
    if (strlen($raw) > 2_000_000) {
        je('Payload too large.', 413);
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        je('Invalid JSON body.', 400);
    }
    return $data;
}

function currentUser(): ?array
{
    $token = hbearer();
    if ($token === null) {
        return null;
    }

    try {
        return jwtVerify($token, jwtSecret());
    } catch (Throwable) {
        return null;
    }
}

function requireAuthUser(): array
{
    $user = currentUser();
    if ($user === null) {
        je('Authentication required', 401);
    }
    // Refresh last_seen for the Security tab's session list. Runtime-resolved
    // (lib/sessions.php loads after this file) — guarded so a stripped deploy
    // can never brick authentication.
    if (function_exists('touchSession')) {
        touchSession();
    }
    return $user;
}

function requireAdminUser(): array
{
    $user = requireAuthUser();
    if (empty($user['isAdmin'])) {
        je('Admin access required', 403);
    }
    return $user;
}

function sanitizeText(?string $value, int $max = 2000): string
{
    $value = trim((string)($value ?? ''));
    if (mb_strlen($value) > $max) {
        $value = mb_substr($value, 0, $max);
    }
    return $value;
}

// Session payload — exact Node sessionOf() shape: {uid,email,displayName,isAdmin,emailVerified}.
function makeMemberSession(array $row): array
{
    return [
        'uid' => (string)($row['id'] ?? ''),
        'email' => (string)($row['email'] ?? ''),
        'displayName' => (string)($row['display_name'] ?? ''),
        'isAdmin' => (bool)($row['is_admin'] ?? false),
        'emailVerified' => (bool)($row['email_verified'] ?? false),
        'role' => (string)($row['role'] ?? 'member'),
    ];
}

/**
 * True when BOTH members have expressed interest — i.e. they have matched.
 *
 * This is the single definition of "matched", used by private-profile access,
 * photo access, starting a conversation and sending a message. It used to be
 * inlined in one place and absent from another, which is how "matched" quietly
 * came to mean two different things.
 *
 * It used to live in routes/messages.php — a *route* file — while being called
 * from lib/db.php and routes/profiles.php. That worked only because index.php
 * happened to require messages.php last, and it made the function untestable:
 * every probe that exercised visibleProfile() had to fake a database to get
 * past a "call to undefined function". Now it sits beside its callers, so the
 * privacy rules that depend on it are finally reachable in a test.
 */
function mutualInterest(string $a, string $b): bool
{
    $stmt = db()->prepare(
        'SELECT 1 FROM interests
          WHERE (from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?)
          LIMIT 2'
    );
    $stmt->execute([$a, $b, $b, $a]);
    // Two distinct rows is what makes it mutual; one row is a one-sided interest.
    return count($stmt->fetchAll()) === 2;
}

/**
 * GET /api/profiles/stats — honest community numbers for the landing page.
 *
 * The critique that this product had no social proof was right, and the obvious
 * "fix" — hardcode "12,000 families joined" — is exactly the fabrication this
 * project refuses to ship. So these numbers are counted from the live database,
 * with the same test-shell filter the browse listing uses, and the UI is
 * designed to read well whether the answer is 13 or 13,000.
 *
 * Deliberately absent: any estimate, growth projection or rounded-up figure.
 * Only counts that can be recomputed by hand from the database.
 *
 * Public and unauthenticated, because its entire purpose is to be visible to a
 * first-time visitor. It exposes aggregates only — no names, no ids, no city
 * breakdown beyond a top-N list of city names that members chose to publish.
 */
function profilesStats(): void
{
    // Same roster as the browse list: test accounts (is_test = 1) never
    // count — the browse SQL excludes them, and browsable must equal the
    // browse total or the homepage and the directory disagree again
    // (2026-11-09 P0 follow-up: stats said 187, browse said 185 — two
    // lingering is_test accounts with real-looking names).
    $rows = db()->query("SELECT display_name, city, country, bio, about_family, visibility, block_unverified, is_blocked FROM profiles WHERE (is_blocked = 0 OR (blocked_until IS NOT NULL AND blocked_until <= NOW())) AND user_id NOT IN (SELECT id FROM users WHERE is_test = 1)")->fetchAll();
    // Negate. array_filter KEEPS rows whose callback returns TRUE, and
    // isTestShellRow() returns true FOR THE SHELLS — so passing it straight
    // through would count 48 QA shells as "members" and report the top cities as
    // "TEST PROFILE FOR QA — please ignore." and "DATA-09 City". That shipped
    // once before on the browse listing, so it is asserted in the test suite now.
    $real = array_values(array_filter($rows, static fn(array $r): bool => !isTestShellRow($r)));

    // Private members still count as members — they are real people who chose
    // not to be browsable. Hiding them from the count would understate the
    // community, which is the opposite of the honesty this endpoint is for.
    $cities = [];
    foreach ($real as $r) {
        $city = trim((string)($r['city'] ?? ''));
        if ($city !== '') $cities[$city] = ($cities[$city] ?? 0) + 1;
    }
    arsort($cities);

    $verified = 0;
    try {
        $v = db()->query(
            'SELECT COUNT(*) AS n FROM verifications v
               JOIN profiles p ON p.user_id = v.user_id
              WHERE v.status = \'approved\' AND (p.is_blocked = 0 OR (p.blocked_until IS NOT NULL AND p.blocked_until <= NOW()))'
        )->fetch();
        $verified = (int)($v['n'] ?? 0);
    } catch (Throwable $e) {
        // The verifications table is added by migrate.php; a database that has
        // not been migrated yet should render the page, not 500 it.
        $verified = 0;
    }

    // Browsable (2026-11-09, P0 batch): the count a signed-out visitor
    // actually sees in /profiles — not private, not unfinished, not
    // restricted to verified members. The homepage, the featured section
    // and the browse page all show THIS number now, so the three can never
    // disagree again (199 vs 100 vs 98 was three different denominators:
    // all members, page length, page length). `members` stays in the
    // response for the admin/analytics view: private and unfinished members
    // are real people and still count as members of the community.
    $browsable = 0;
    foreach ($real as $r) {
        if ((string)($r['visibility'] ?? 'members') === 'private') continue;
        if (!empty($r['block_unverified'])) continue;
        $city = trim((string)($r['city'] ?? ''));
        $country = trim((string)($r['country'] ?? ''));
        $bio = trim((string)($r['bio'] ?? ''));
        $about = trim((string)($r['about_family'] ?? ''));
        if ($city === '' && $country === '' && $bio === '' && $about === '') continue;
        $browsable++;
    }

    json([
        'members' => count($real),
        'browsable' => $browsable,
        'cities' => count($cities),
        'verified' => $verified,
        // Names only — a city label a member published themselves.
        'topCities' => array_slice(array_keys($cities), 0, 6),
        'testShellsHidden' => count($rows) - count($real),
    ]);
}

// A moderation block is active when is_blocked is set AND (it is permanent —
// blocked_until NULL — or the expiry is still in the future). Temporary
// restrictions lapse automatically; every read path must use this instead of
// checking is_blocked alone.
function blockIsActive(array $row): bool
{
    if (empty($row['is_blocked'])) return false;
    $until = (string)($row['blocked_until'] ?? '');
    if ($until === '') return true; // permanent
    return strtotime($until) > time();
}

// User-to-user block (2026-11-09, P0 batch): a row in `blocks` in EITHER
// direction hides both members' profiles from each other and stops interest
// and messaging. The moderation `is_blocked` flag above is a different thing
// (admin action against one account); this is a member action against another.
function isBlockedBetween(string $a, string $b): bool
{
    if ($a === '' || $b === '' || $a === $b) return false;
    $stmt = db()->prepare('SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?) LIMIT 1');
    $stmt->execute([$a, $b, $b, $a]);
    return (bool)$stmt->fetch();
}

// Which side of a block is the blocker, for an honest 403 message: a member
// who blocked someone hears their own action named; a member who was blocked
// hears only that the profile is unavailable.
function didBlock(string $blocker, string $blocked): bool
{
    if ($blocker === '' || $blocked === '') return false;
    $stmt = db()->prepare('SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ? LIMIT 1');
    $stmt->execute([$blocker, $blocked]);
    return (bool)$stmt->fetch();
}

// Whether a signed-in viewer's email is verified. The JWT carries no
// emailVerified claim, so this reads users once per request (static cache —
// visibleProfile() runs once per row in a list, and must not N+1 the query).
function viewerIsEmailVerified(?array $viewer): bool
{
    static $cache = [];
    $uid = (string)($viewer['uid'] ?? '');
    if ($uid === '') return false;
    if (!array_key_exists($uid, $cache)) {
        try {
            $stmt = db()->prepare('SELECT email_verified FROM users WHERE id = ? LIMIT 1');
            $stmt->execute([$uid]);
            $row = $stmt->fetch();
            $cache[$uid] = !empty($row['email_verified']);
        } catch (Throwable) {
            $cache[$uid] = false;
        }
    }
    return $cache[$uid];
}

// Hide-any-field (2026-11-09): profiles.hidden_fields holds a JSON array of
// payload keys the member wants hidden from other viewers. DISPLAY-ONLY —
// the stored values stay in the row, so server-side matching and browse
// filters keep using them. The owner always sees their own full profile (and
// gets the list back as `hiddenFields` so Settings can render the toggles);
// anyone else sees the field omitted entirely, indistinguishable from a
// field the member never filled in. The guardian's name/email are never in
// a payload at all, so there is nothing to hide there.
function applyHiddenFields(array $payload, array $row, bool $isOwner): array
{
    $raw = (string)($row['hidden_fields'] ?? '');
    $hidden = $raw === '' ? [] : json_decode($raw, true);
    if (!is_array($hidden)) $hidden = [];
    $hidden = array_values(array_unique(array_map('strval', $hidden)));
    if ($isOwner) {
        $payload['hiddenFields'] = $hidden;
        return $payload;
    }
    foreach ($hidden as $key) {
        unset($payload[$key]);
    }
    return $payload;
}

// Node's visibleProfile(): privacy tiers + blocks enforced here, not in the UI.
// $viewer is the decoded JWT (or null). Returns null when the row must be hidden.
function visibleProfile(array $row, ?array $viewer): ?array
{
    if (blockIsActive($row)) {
        return null;
    }
    $ownerId = (string)($row['user_id'] ?? $row['id'] ?? '');
    $isOwner = $viewer !== null && (string)$viewer['uid'] === $ownerId;
    // Mutual interest unlocks private profiles — matches can see each other.
    $isMutual = $viewer !== null && !$isOwner
        && mutualInterest((string)$viewer['uid'], $ownerId);
    if (($row['visibility'] ?? 'members') === 'private' && !$isOwner && !$isMutual) {
        return null;
    }
    // User block (2026-11-09, P0 batch): a block in either direction hides
    // both profiles from each other. The owner always sees their own profile.
    // Anonymous visitors have no identity to block against, so this only
    // applies to signed-in viewers.
    if (!$isOwner && $viewer !== null && isBlockedBetween((string)$viewer['uid'], $ownerId)) {
        return null;
    }
    // "Block unverified members" (2026-11-09, P0 batch): an owner who turned
    // it on is invisible to anyone whose email is not verified — including
    // signed-out visitors, who are unverified by definition.
    if (!$isOwner && !empty($row['block_unverified'])) {
        if ($viewer === null || !viewerIsEmailVerified($viewer)) {
            return null;
        }
    }
    $isAnonymous = $viewer === null;

    // ── Anonymous visitors ────────────────────────────────────────────────────
    // Members here do not need an account to read a profile or see a public
    // photo. The previous behaviour hid everything behind a "sign up to view"
    // wall, which meant the browse pages had nothing to show and search traffic
    // bounced. A member's own settings still decide what is hidden: only
    // `private` hides the profile, and only `private` photos are withheld.
    // Messaging stays gated — see messages.php, which requires a mutual match.
    if ($isAnonymous) {
        $tier = (string)($row['photos_visibility'] ?? 'members');
        $photosLocked = $tier !== 'public';
        return applyHiddenFields([
            'id' => $ownerId,
            'displayName' => $row['display_name'] ?? null,
            'age' => $row['age'] ?? null,
            'gender' => $row['gender'] ?? null,
            'seekingGender' => $row['seeking_gender'] ?? null,
            'city' => $row['city'] ?? null,
            'country' => $row['country'] ?? null,
            'sect' => $row['sect'] ?? null,
            'profession' => $row['profession'] ?? null,
            'bio' => $row['bio'] ?? null,
            'expectations' => $row['expectations'] ?? null,
            'aboutFamily' => $row['about_family'] ?? null,
            'is_verified' => (bool)($row['is_verified'] ?? false),
            'verified_kind' => (string)($row['verified_kind'] ?? 'none'),
            'isDemo' => (bool)($row['is_demo'] ?? false),
            'visibility' => $row['visibility'] ?? 'members',
            // Guardian management only — the guardian's name/email are NEVER
            // exposed here; only the fact the profile is guardian-managed.
            'managementMode' => !empty($row['management_mode']) ? (string)$row['management_mode'] : null,
            // Matchmaker origin (2026-11-09): an admin-approved matchmaker
            // submission is browsable but has no member behind it. Browsers
            // must be able to tell it apart from a personal profile, so the
            // origin travels in every payload — anonymous included.
            'isMatchmaker' => !empty($row['is_matchmaker']),
            'username' => $row['username'] ?? null,
            'religiosity' => $row['religiosity'] ?? null,
            'educationLevel' => $row['education_level'] ?? null,
            // Marja' is owner-only (2026-11-09): the value is never sent to
            // another viewer — not even as null — so it cannot be read from
            // the payload. The owner still receives their own (their biodata
            // document and edit form need it); admin reads it directly.
            ...($isOwner ? ['marja' => $row['marja'] ?? null] : []),
            'syedStatus' => $row['syed_status'] ?? null,
            'prayer' => $row['prayer'] ?? null,
            'modesty' => $row['modesty'] ?? null,
            'diet' => $row['diet'] ?? null,
            'languages' => $row['languages'] ?? null,
            'citizenships' => $row['citizenships'] ?? null,
            'ethnicity' => $row['ethnicity'] ?? null,
            'subEthnicity' => $row['sub_ethnicity'] ?? null,
            'incomeRange' => $row['income_range'] ?? null,
            'maritalStatus' => $row['marital_status'] ?? null,
            'children' => $row['children'] ?? null,
            'childrenPlans' => $row['children_plans'] ?? null,
            'relocation' => $row['relocation'] ?? null,
            'familyInvolvement' => $row['family_involvement'] ?? null,
            'heightCm' => isset($row['height_cm']) && $row['height_cm'] !== null ? (int)$row['height_cm'] : null,
            'timeline' => $row['timeline'] ?? null,
            'photosVisibility' => $tier,
            'photosLocked' => $photosLocked,
            'photo' => ($photosLocked || (string)($row['photo_url'] ?? '') === '')
                ? null
                : '/api/profiles/' . $ownerId . '/photo',
        ], $row, $isOwner);
    }

    if (($row['visibility'] ?? 'members') === 'public' || isset($viewer['uid']) || $isOwner) {
        $photosVisibility = (string)($row['photos_visibility'] ?? 'members');
        // Per-tier entitlement (2026-11-09; the brief's rule + the repo's
        // own visibility test, admin-routing-test.php:768): a non-owner
        // sees the photo for a public tier (anyone), for the 'members'
        // tier when signed in, and for a legacy restricted tier
        // ('request'/'match') only with a mutual interest; 'private'
        // never. The first version of this fix mirrored photoServe()
        // exactly (mutual interest for every non-public tier) and broke
        // the deploy gate — the test codifies 'members' = any signed-in
        // member. photoServe() is NOT changed (brief: keep it as-is), so
        // a residual mismatch remains: a non-mutual signed-in viewer gets
        // a payload URL the serve endpoint still 404s. That needs a
        // product call (relax photoServe for 'members', or change the
        // tier copy) — it is NOT silently fixed here.
        if ($isOwner || $photosVisibility === 'public') {
            $photosLocked = false;
        } elseif ($photosVisibility === 'members') {
            // This branch is reached only by signed-in viewers (anonymous
            // returns above), so a signed-in member sees a members-tier
            // photo; the $viewer check keeps the rule true if the branch
            // is ever reached signed-out.
            $photosLocked = $viewer === null;
        } elseif ($photosVisibility === 'private') {
            $photosLocked = true;
        } else {
            // Legacy restricted tiers ('request'/'match'): mutual interest only.
            $photosLocked = !$isMutual;
        }
        return applyHiddenFields([
            'id' => $ownerId,
            'displayName' => $row['display_name'] ?? null,
            'age' => $row['age'] ?? null,
            'gender' => $row['gender'] ?? null,
            'seekingGender' => $row['seeking_gender'] ?? null,
            'city' => $row['city'] ?? null,
            'country' => $row['country'] ?? null,
            'sect' => $row['sect'] ?? null,
            'profession' => $row['profession'] ?? null,
            'bio' => $row['bio'] ?? null,
            'expectations' => $row['expectations'] ?? null,
            'aboutFamily' => $row['about_family'] ?? null,
            'is_verified' => (bool)($row['is_verified'] ?? false),
            'verified_kind' => (string)($row['verified_kind'] ?? 'none'),
            'isDemo' => (bool)($row['is_demo'] ?? false),
            'visibility' => $row['visibility'] ?? 'members',
            // Guardian management only — the guardian's name/email are NEVER
            // exposed here; only the fact the profile is guardian-managed.
            'managementMode' => !empty($row['management_mode']) ? (string)$row['management_mode'] : null,
            // Matchmaker origin (2026-11-09): see the anonymous branch.
            'isMatchmaker' => !empty($row['is_matchmaker']),
            // Public handle the member chose for themselves. Null when unset.
            'username' => $row['username'] ?? null,
            // ── Filterable fields ────────────────────────────────────────────
            // The browse filters (sect, religiosity, education, Marja') match on
            // these server-side. They were absent from the response entirely, so
            // selecting any of those filters silently returned zero results.
            // Marja' is owner-only in the payload (2026-11-09): the filter
            // still matches on the stored value, but another viewer never
            // receives it — not even as null.
            'religiosity' => $row['religiosity'] ?? null,
            'educationLevel' => $row['education_level'] ?? null,
            ...($isOwner ? ['marja' => $row['marja'] ?? null] : []),
            'syedStatus' => $row['syed_status'] ?? null,
            'prayer' => $row['prayer'] ?? null,
            'modesty' => $row['modesty'] ?? null,
            'diet' => $row['diet'] ?? null,
            'languages' => $row['languages'] ?? null,
            'citizenships' => $row['citizenships'] ?? null,
            'ethnicity' => $row['ethnicity'] ?? null,
            'subEthnicity' => $row['sub_ethnicity'] ?? null,
            'incomeRange' => $row['income_range'] ?? null,
            'maritalStatus' => $row['marital_status'] ?? null,
            'children' => $row['children'] ?? null,
            'childrenPlans' => $row['children_plans'] ?? null,
            'relocation' => $row['relocation'] ?? null,
            'familyInvolvement' => $row['family_involvement'] ?? null,
            'heightCm' => isset($row['height_cm']) && $row['height_cm'] !== null ? (int)$row['height_cm'] : null,
            'timeline' => $row['timeline'] ?? null,
            // MUST be sent: the client renders its "photos are private" state
            // from this. Omitting it left the lock overlay permanently hidden,
            // so a member who hid their photos still looked fully visible.
            'photosVisibility' => $photosVisibility,
            'photosLocked' => $photosLocked,
            // A GATED endpoint, not the file path. The privacy tier is re-checked
            // on every request, so switching photos to private instantly breaks
            // any link that was already shared or cached.
            'photo' => ($photosLocked || (string)($row['photo_url'] ?? '') === '')
                ? null
                : '/api/profiles/' . $ownerId . '/photo',
            // Owner-only settings (2026-11-09): the member's own privacy
            // toggles and contact phone, so Settings can load and save them.
            // Never sent to another viewer.
            ...($isOwner ? [
                'contactPhone' => $row['contact_phone'] ?? null,
                'contactVisibility' => $row['contact_visibility'] ?? 'members',
                'blockUnverified' => !empty($row['block_unverified']),
                'allowFamilyView' => !empty($row['allow_family_view'] ?? 1),
            ] : []),
        ], $row, $isOwner);
    }
    return applyHiddenFields([
        'id' => $ownerId,
        'displayName' => $row['display_name'] ?? null,
        'age' => $row['age'] ?? null,
        'profession' => $row['profession'] ?? null,
        'is_verified' => (bool)($row['is_verified'] ?? false),
        'verified_kind' => (string)($row['verified_kind'] ?? 'none'),
        'isDemo' => (bool)($row['is_demo'] ?? false),
        'expectations' => $row['expectations'] ?? null,
        'aboutFamily' => $row['about_family'] ?? null,
        'visibility' => $row['visibility'] ?? 'members',
        'managementMode' => !empty($row['management_mode']) ? (string)$row['management_mode'] : null,
        'isMatchmaker' => !empty($row['is_matchmaker']),
        'photosVisibility' => (string)($row['photos_visibility'] ?? 'members'),
        'photosLocked' => !$isOwner,
        'locked' => true,
        'gallery' => [],
    ], $row, $isOwner);
}
