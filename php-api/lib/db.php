<?php
// PDO connection (MariaDB/MySQL, utf8mb4, UTC session) + shared route helpers.

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
    $isMutual = false;
    if ($viewer !== null && !$isOwner) {
        $pdo = db();
        $s1 = $pdo->prepare('SELECT 1 FROM interests WHERE from_user_id = ? AND to_user_id = ? LIMIT 1');
        $s1->execute([$viewer['uid'], $ownerId]);
        $s2 = $pdo->prepare('SELECT 1 FROM interests WHERE from_user_id = ? AND to_user_id = ? LIMIT 1');
        $s2->execute([$ownerId, $viewer['uid']]);
        $isMutual = (bool)$s1->fetch() && (bool)$s2->fetch();
    }
    if (($row['visibility'] ?? 'members') === 'private' && !$isOwner && !$isMutual) {
        return null;
    }
    $isAnonymous = $viewer === null;

    // P0: members-only profiles are invisible to anonymous visitors entirely.
    // Only explicitly public profiles get a teaser.
    if ($isAnonymous && ($row['visibility'] ?? 'members') !== 'public') {
        return null;
    }

    // Anonymous visitors get a minimal teaser only — enough to encourage
    // signup, never intimate details. Full profiles require an account.
    if ($isAnonymous) {
        return [
            'id' => $ownerId,
            'displayName' => $row['display_name'] ?? null,
            'age' => $row['age'] ?? null,
            'city' => $row['city'] ?? null,
            'country' => $row['country'] ?? null,
            'is_verified' => (bool)($row['is_verified'] ?? false),
            'visibility' => $row['visibility'] ?? 'members',
            'photosVisibility' => (string)($row['photos_visibility'] ?? 'members'),
            'photosLocked' => true,
            'locked' => true,
            'teaser' => true,
            'gallery' => [],
        ];
    }

    if (($row['visibility'] ?? 'members') === 'public' || isset($viewer['uid']) || $isOwner) {
        $photosVisibility = (string)($row['photos_visibility'] ?? 'members');
        $photosLocked = $photosVisibility === 'private' && !$isOwner;
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
        'expectations' => $row['expectations'] ?? null,
        'aboutFamily' => $row['about_family'] ?? null,
        'visibility' => $row['visibility'] ?? 'members',
        'photosVisibility' => (string)($row['photos_visibility'] ?? 'members'),
        'photosLocked' => !$isOwner,
        'locked' => true,
        'gallery' => [],
    ];
}
