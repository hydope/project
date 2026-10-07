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
    $rows = db()->query('SELECT display_name, city, visibility, is_blocked FROM profiles WHERE is_blocked = 0')->fetchAll();
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
              WHERE v.status = \'approved\' AND p.is_blocked = 0'
        )->fetch();
        $verified = (int)($v['n'] ?? 0);
    } catch (Throwable $e) {
        // The verifications table is added by migrate.php; a database that has
        // not been migrated yet should render the page, not 500 it.
        $verified = 0;
    }

    json([
        'members' => count($real),
        'cities' => count($cities),
        'verified' => $verified,
        // Names only — a city label a member published themselves.
        'topCities' => array_slice(array_keys($cities), 0, 6),
        'testShellsHidden' => count($rows) - count($real),
    ]);
}

// Node's visibleProfile(): privacy tiers + blocks enforced here, not in the UI.
// $viewer is the decoded JWT (or null). Returns null when the row must be hidden.
function visibleProfile(array $row, ?array $viewer): ?array
{
    if (!empty($row['is_blocked'])) {
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
        return [
            'id' => $ownerId,
            'displayName' => $row['display_name'] ?? null,
            'age' => $row['age'] ?? null,
            'gender' => $row['gender'] ?? null,
            'city' => $row['city'] ?? null,
            'country' => $row['country'] ?? null,
            'sect' => $row['sect'] ?? null,
            'profession' => $row['profession'] ?? null,
            'bio' => $row['bio'] ?? null,
            'expectations' => $row['expectations'] ?? null,
            'aboutFamily' => $row['about_family'] ?? null,
            'is_verified' => (bool)($row['is_verified'] ?? false),
            'isDemo' => (bool)($row['is_demo'] ?? false),
            'visibility' => $row['visibility'] ?? 'members',
            'username' => $row['username'] ?? null,
            'religiosity' => $row['religiosity'] ?? null,
            'educationLevel' => $row['education_level'] ?? null,
            'marja' => $row['marja'] ?? null,
            'syedStatus' => $row['syed_status'] ?? null,
            'prayer' => $row['prayer'] ?? null,
            'modesty' => $row['modesty'] ?? null,
            'diet' => $row['diet'] ?? null,
            'languages' => $row['languages'] ?? null,
            'ethnicity' => $row['ethnicity'] ?? null,
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
        ];
    }

    if (($row['visibility'] ?? 'members') === 'public' || isset($viewer['uid']) || $isOwner) {
        $photosVisibility = (string)($row['photos_visibility'] ?? 'members');
        // For a signed-in viewer only `private` withholds the photo; a
        // members/match tier is open to anyone who can see the profile.
        $photosLocked = $photosVisibility === 'private' && !$isOwner;
        return [
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
            'isDemo' => (bool)($row['is_demo'] ?? false),
            'visibility' => $row['visibility'] ?? 'members',
            // Public handle the member chose for themselves. Null when unset.
            'username' => $row['username'] ?? null,
            // ── Filterable fields ────────────────────────────────────────────
            // The browse filters (sect, religiosity, education, Marja') match on
            // these. They were absent from the response entirely, so selecting
            // any of those filters silently returned zero results.
            'religiosity' => $row['religiosity'] ?? null,
            'educationLevel' => $row['education_level'] ?? null,
            'marja' => $row['marja'] ?? null,
            'syedStatus' => $row['syed_status'] ?? null,
            'prayer' => $row['prayer'] ?? null,
            'modesty' => $row['modesty'] ?? null,
            'diet' => $row['diet'] ?? null,
            'languages' => $row['languages'] ?? null,
            'ethnicity' => $row['ethnicity'] ?? null,
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
        ];
    }
    return [
        'id' => $ownerId,
        'displayName' => $row['display_name'] ?? null,
        'age' => $row['age'] ?? null,
        'profession' => $row['profession'] ?? null,
        'is_verified' => (bool)($row['is_verified'] ?? false),
        'isDemo' => (bool)($row['is_demo'] ?? false),
        'expectations' => $row['expectations'] ?? null,
        'aboutFamily' => $row['about_family'] ?? null,
        'visibility' => $row['visibility'] ?? 'members',
        'photosVisibility' => (string)($row['photos_visibility'] ?? 'members'),
        'photosLocked' => !$isOwner,
        'locked' => true,
        'gallery' => [],
    ];
}
