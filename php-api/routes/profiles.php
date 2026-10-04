<?php
/**
 * Profile read routes — exact parity with server/routes/profiles.js.
 * GET / browse with filters (privacy tiers + blocks in visibleProfile)
 * GET /:id one profile (404 when hidden)
 * GET /me, PUT /me owner read/update (mutations mirror profileMutations.js)
 * POST /:id/interest express interest; matched = mutual
 *
 * Photo routes are the one deliberate addition: the schema carried a photo_url
 * column that nothing ever wrote, so no member could set a photo at all.
 *
 * Test-shell detection (testShellFilterSql / isTestShellRow) lives in
 * lib/db.php, alongside visibleProfile() which it filters, so it can be tested
 * without a database.
 */

declare(strict_types=1);

function routeProfiles(string $method, array $segments): void
{
    $id = $segments[0] ?? null;
    $sub = $segments[1] ?? null;

    if ($method === 'GET' && $id === null) { profilesList(); return; }
    // Community stats MUST be matched before the `/:id` branch below, or the
    // literal string "stats" is treated as a profile id and every request 404s
    // as "profile not found" — the same ordering bug that made
    // /api/profiles/me/favourites unreachable.
    if ($method === 'GET' && $id === 'stats') { profilesStats(); return; }
    // Saved profiles.
    //
    // MUST be matched BEFORE the `/me` branch below. The `/me` test only looks at
    // $segments[0], so `GET /api/profiles/me/favourites` matched it and returned
    // the member's OWN profile instead of their saved list — the endpoint was
    // unreachable, and the favourites page rendered the account holder as if
    // they were a saved result. The comment here previously claimed the ordering
    // was safe; it was not.
    if ($method === 'GET' && $id === 'me' && $sub === 'favourites') { favouritesList(); return; }
    if ($method === 'GET' && $id === 'me') { profileMe(); return; }
    if ($method === 'POST' && $id !== null && $sub === 'favourite') { favouriteAdd($id); return; }
    if ($method === 'DELETE' && $id !== null && $sub === 'favourite') { favouriteRemove($id); return; }
    // POST is accepted as an alias for PUT. Only PUT was ever routed, so a
    // client sending POST got a 404 and every profile save silently failed --
    // while writeRateCheck() had already charged the request against the
    // 30/min bucket. Both verbs hit the same handler and the same validation.
    //
    // $sub MUST be null here: POST /profiles/me/photo is the upload route and
    // is matched further down. Without this guard the alias swallows it and
    // breaks photo upload.
    if (($method === 'PUT' || $method === 'POST') && $id === 'me' && $sub === null) {
        profileUpdate();
        return;
    }
    if ($method === 'POST' && $id === 'me' && $sub === 'photo') { photoUpload(); return; }
    if ($method === 'DELETE' && $id === 'me' && $sub === 'photo') { photoDelete(); return; }
    if ($method === 'GET' && $id === 'interests' && ($segments[1] ?? '') === 'received') { interestsReceived(); return; }
    if ($method === 'GET' && $id === 'notifications') { notificationsList(); return; }
    if ($method === 'POST' && $id === 'notifications' && ($segments[1] ?? '') === 'read') { notificationsRead(); return; }
    if ($method === 'GET' && $id === 'notifications' && ($segments[1] ?? '') === 'unread-count') { notificationsUnreadCount(); return; }
    if ($method === 'GET' && $id !== null && $sub === 'photo') { photoServe($id); return; }
    if ($method === 'GET' && $id !== null) { profileById($id); return; }
    if ($method === 'POST' && $id !== null && ($segments[1] ?? '') === 'interest') { profileInterest($id); return; }
    if ($method === 'DELETE' && $id !== null && ($segments[1] ?? '') === 'interest') { profileUninterest($id); return; }

    // A known path with the wrong verb is a 405, not a 404. Returning "endpoint
    // not found" for e.g. PATCH /profiles/me hides the fact that the route
    // exists and tells the caller to go looking somewhere that cannot work.
    $allowed = match ($id) {
        'me' => 'GET, PUT, POST',
        'notifications' => 'GET, POST',
        null => 'GET, POST',
        default => 'GET, POST, DELETE',
    };
    if ($id === 'me') {
        header('Allow: ' . $allowed);
        json(['error' => 'Method not allowed on /api/profiles/me.', 'allowed' => explode(', ', $allowed)], 405);
    }

    json(['error' => 'Profile endpoint not found'], 404);
}

// ─── Photo upload ────────────────────────────────────────────────────────────
const PHOTO_MAX_BYTES  = 5_000_000; // 5 MB decoded
const PHOTO_MAX_PIXELS = 40_000_000; // ~40MP; guards decompression bombs

// Only formats with a real decoder. SVG is deliberately excluded: it is a
// scriptable document and would be an XSS vector when served to other members.
const PHOTO_ALLOWED = [
    'image/jpeg' => 'jpg',
    'image/pjpeg' => 'jpg',
    'image/png'  => 'png',
    'image/webp' => 'webp',
];

/**
 * Sniff the MIME type from the ACTUAL bytes.
 *
 * The client-supplied Content-Type and any data: URI prefix are attacker-
 * controlled and must never decide this, so detection is always byte-based.
 *
 * finfo (ext-fileinfo) is the accurate route, but it is NOT guaranteed on
 * minimal shared hosting — and `new finfo()` throws Error when the extension is
 * absent, which surfaced to members as an opaque 500 "Internal server error"
 * on every single photo upload. When it is unavailable we fall back to reading
 * the format's magic bytes directly, which is unambiguous for exactly the three
 * formats we accept.
 */
function sniffImageMime(string $bytes): string
{
    if (class_exists('finfo')) {
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mime = (string)$finfo->buffer($bytes);
        if ($mime !== '') {
            return $mime;
        }
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (strncmp($bytes, "\x89PNG\r\n\x1a\n", 8) === 0) {
        return 'image/png';
    }
    // JPEG: FF D8 FF
    if (strncmp($bytes, "\xFF\xD8\xFF", 3) === 0) {
        return 'image/jpeg';
    }
    // WebP: "RIFF" ????  "WEBP"
    if (strlen($bytes) >= 12 && strncmp($bytes, 'RIFF', 4) === 0 && substr($bytes, 8, 4) === 'WEBP') {
        return 'image/webp';
    }
    return '';
}

function photoUpload(): void
{
    $user = requireAuthUser();
    $bytes = photoReadUpload();

    if ($bytes === '') {
        je('Attach a photo to upload.', 400);
    }
    if (strlen($bytes) > PHOTO_MAX_BYTES) {
        je('Photo must be under 5 MB.', 400);
    }

    // 1. Sniff the ACTUAL bytes.
    $mime = sniffImageMime($bytes);
    if (!isset(PHOTO_ALLOWED[$mime])) {
        je('Photo must be a JPEG, PNG or WebP image.', 400);
    }

    // 2. Confirm it really decodes, and get the real dimensions. A polyglot
    //    (valid image header + embedded payload) passes a sniff but fails here.
    $info = @getimagesizefromstring($bytes);
    if ($info === false || (int)$info[0] < 1 || (int)$info[1] < 1) {
        je('That file is not a readable image.', 400);
    }
    if ((int)$info[0] * (int)$info[1] > PHOTO_MAX_PIXELS) {
        je('Photo resolution is too large.', 400);
    }

    // 2b. Structural completeness. Decoders stop reading at the first valid
    //     image stream, so a file with PHP or a shell payload bolted on the end
    //     still "decodes". Today that payload is inert — it is stored outside the
    //     web root and served with nosniff + a real image content type — but
    //     refusing it outright means no executable text ever lands on disk.
    if (!imageIsComplete($bytes, $mime)) {
        je('That file is not a complete image.', 400);
    }

    // 3. Strip EXIF. This is a privacy product and selfies carry GPS
    //    coordinates. No GD required — a byte-level pass drops APP1/Exif.
    $bytes = stripJpegExif($bytes);
    $ext = PHOTO_ALLOWED[$mime];

    // 4. Write it. The path is generated server-side from the owner's UUID; the
    //    client filename is never used, so traversal is impossible.
    $dir = photoBaseDir() . '/' . $user['uid'];
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
        // Log the real reason: a per-member dir failing while the parent works
        // almost always means a permissions or quota problem on the account,
        // not a bug in this code.
        error_log(sprintf(
            '[api] photo mkdir failed for uid=%s dir=%s parent_writable=%s free=%s',
            $user['uid'], $dir,
            is_writable(photoBaseDir()) ? 'yes' : 'no',
            (string)@disk_free_space(dirname($dir))
        ));
        je('Could not save your photo — server storage is not writable. Please contact support.', 500);
    }
    $path = $dir . '/' . uuid() . '.' . $ext;
    if (@file_put_contents($path, $bytes) === false) {
        error_log(sprintf('[api] photo write failed path=%s bytes=%d', $path, strlen($bytes)));
        je('Could not save your photo.', 500);
    }

    // 5. Drop the previous photo so a member never leaves files behind.
    $prev = db()->prepare('SELECT photo_url FROM profiles WHERE user_id = ? LIMIT 1');
    $prev->execute([$user['uid']]);
    $old = (string)($prev->fetch()['photo_url'] ?? '');
    db()->prepare('UPDATE profiles SET photo_url = ?, updated_at = UTC_TIMESTAMP() WHERE user_id = ?')
        ->execute([$path, $user['uid']]);
    if ($old !== '' && $old !== $path) {
        @unlink($old);
    }

    json(['ok' => true, 'photo' => '/api/profiles/' . $user['uid'] . '/photo'], 201);
}

function photoDelete(): void
{
    $user = requireAuthUser();
    $stmt = db()->prepare('SELECT photo_url FROM profiles WHERE user_id = ? LIMIT 1');
    $stmt->execute([$user['uid']]);
    $old = (string)($stmt->fetch()['photo_url'] ?? '');

    db()->prepare('UPDATE profiles SET photo_url = NULL, updated_at = UTC_TIMESTAMP() WHERE user_id = ?')
        ->execute([$user['uid']]);
    if ($old !== '') {
        @unlink($old);
    }
    json(['ok' => true]);
}

// Rejects trailing-byte payloads by checking the file ends where a complete
// image must end. PNG must terminate with the IEND chunk; JPEG with EOI (FFD9).
function imageIsComplete(string $bytes, string $mime): bool
{
    if ($mime === 'image/png') {
        return str_ends_with($bytes, "\x00\x00\x00\x00IEND\xAE\x42\x60\x82");
    }
    if ($mime === 'image/jpeg' || $mime === 'image/pjpeg') {
        // Allow trailing whitespace only; anything else after EOI is a payload.
        return str_ends_with(rtrim($bytes, "\x00\r\n\t "), "\xFF\xD9");
    }
    if ($mime === 'image/webp') {
        return str_contains(substr($bytes, -12, 4), 'WEBP') || str_ends_with($bytes, 'VP8 ');
    }
    return true;
}

// Serves the bytes — and re-checks privacy on EVERY request, so hiding your
// photos takes effect immediately for any link that was already shared.
function photoServe(string $id): void
{
    $stmt = db()->prepare('SELECT user_id, photo_url, photos_visibility, visibility, is_blocked FROM profiles WHERE user_id = ? LIMIT 1');
    $stmt->execute([$id]);
    $row = $stmt->fetch();

    if (!$row || !empty($row['is_blocked']) || (string)($row['photo_url'] ?? '') === '') {
        je('Not found.', 404);
    }

    $viewer = currentUser();
    $isOwner = $viewer !== null && (string)$viewer['uid'] === (string)$row['user_id'];

    if (!$isOwner) {
        // A private profile is invisible, photo or not — same 404, no probing.
        if ((string)($row['visibility'] ?? 'members') === 'private') {
            je('Not found.', 404);
        }
        $tier = (string)($row['photos_visibility'] ?? 'members');
        if ($tier === 'private') {
            je('Not found.', 404);
        }
        // "Share after interest" is the members/match tier. A signed-in viewer
        // needs a mutual interest to open it; an anonymous one is told to sign
        // in rather than being 404'd, so the link is not mistaken for a bug.
        if ($tier !== 'public') {
            if ($viewer === null) {
                je('Sign in to view this photo.', 401);
            }
            if (!mutualInterest((string)$row['user_id'], (string)$viewer['uid'])) {
                je('Not found.', 404);
            }
        }
        if ($viewer !== null && pairBlocked((string)$row['user_id'], (string)$viewer['uid'])) {
            je('Not found.', 404);
        }
    }

    // Re-validate the path against the photo root even though we wrote it: a
    // tampered storage_path must not be able to read arbitrary files.
    $base = realpath(photoBaseDir()) ?: photoBaseDir();
    $real = realpath((string)$row['photo_url']) ?: '';
    if ($real === '' || strncmp($real, $base, strlen($base)) !== 0) {
        je('Photo unavailable.', 404);
    }

    // Same ext-fileinfo dependency as the sniffer: never call finfo unguarded.
    // Serving a wrong Content-Type here would also be a nosniff-adjacent risk, so
    // an unrecognised file falls back to the safest generic binary type.
    $mime = class_exists('finfo')
        ? ((new finfo(FILEINFO_MIME_TYPE))->file($real) ?: 'application/octet-stream')
        : (sniffImageMime((string)@file_get_contents($real)) ?: 'application/octet-stream');
    $size = filesize($real);

    header('Content-Type: ' . $mime);
    header('Content-Length: ' . $size);
    header('Cache-Control: private, no-store, max-age=0');
    header('X-Content-Type-Options: nosniff');
    header('Content-Disposition: inline');
    readfile($real);
    exit;
}

/**
 * Resolve a WRITABLE photo directory that lives OUTSIDE the web root.
 *
 * WHY THIS IS NOT JUST `getenv('UPLOAD_DIR') ?: __DIR__.'/../uploads'`
 * ------------------------------------------------------------------
 * The old one-liner silently swallowed mkdir failure with `@`, so a bad
 * UPLOAD_DIR surfaced much later as an opaque 500 from photoUpload(). That is
 * exactly what happened in production: deploy.yml hardcoded
 * UPLOAD_DIR=/home/shiarishta/uploads, but the cPanel account is a different
 * username, so /home/shiarishta could not be created and every photo upload
 * died with "Internal server error".
 *
 * Two further traps this guards against:
 *   1. The repo-local fallback (__DIR__.'/../uploads') becomes
 *      public_html/api/uploads once deployed — INSIDE the web root. Member
 *      photos would then be fetchable by direct URL, bypassing every privacy
 *      check in photoServe(). We only accept it when the app is NOT running
 *      from a public_html directory.
 *   2. Result is cached per-request so photoUpload() and photoServe() can never
 *      resolve to two different directories and strand a file.
 */
function photoBaseDir(): string
{
    static $resolved = null;
    if ($resolved !== null) {
        return $resolved;
    }

    $candidates = [];

    $configured = trim((string)(getenv('UPLOAD_DIR') ?: ''));
    if ($configured !== '') {
        $candidates[] = $configured;
    }

    // cPanel/Cpanel sets HOME to the account home (/home/<user>), which is
    // always writable by the PHP process and always above public_html.
    $home = trim((string)(getenv('HOME') ?: ''));
    if ($home !== '') {
        $candidates[] = $home . '/uploads';
    }

    // Dev-only fallback: acceptable solely when we are not under public_html.
    $appRoot = dirname(__DIR__);
    if (strpos(str_replace('\\', '/', $appRoot), 'public_html') === false) {
        $candidates[] = $appRoot . '/uploads';
    }

    $tried = [];
    foreach ($candidates as $base) {
        $dir = rtrim($base, '/') . '/photos';
        $tried[] = $dir;
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        if (is_dir($dir) && is_writable($dir)) {
            $resolved = $dir;
            return $resolved;
        }
    }

    // Nothing was usable. Log the exact paths so the cause is diagnosable from
    // the PHP error log, and fail loudly instead of returning a broken path.
    error_log('[api] photo storage unavailable; tried: ' . implode(' | ', $tried));
    je('Photo storage is not available on this server. Please contact support.', 500);
}

// Accepts multipart/form-data (what a browser sends) and a base64 JSON body
// (what API clients use, matching the verification endpoint).
function photoReadUpload(): string
{
    if (!empty($_FILES['photo']) && is_array($_FILES['photo'])) {
        $f = $_FILES['photo'];
        $err = (int)($f['error'] ?? UPLOAD_ERR_NO_FILE);
        if ($err === UPLOAD_ERR_INI_SIZE || $err === UPLOAD_ERR_FORM_SIZE) {
            je('Photo must be under 5 MB.', 400);
        }
        if ($err !== UPLOAD_ERR_OK) {
            je('Upload failed.', 400);
        }
        $tmp = (string)$f['tmp_name'];
        // is_uploaded_file matters: it refuses any path the client supplied.
        if ($tmp === '' || !is_uploaded_file($tmp)) {
            je('Upload failed.', 400);
        }
        $data = @file_get_contents($tmp);
        return $data === false ? '' : $data;
    }

    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') return '';
    $payload = json_decode($raw, true);
    if (!is_array($payload)) return '';
    $b64 = trim((string)($payload['photo'] ?? $payload['imageBase64'] ?? $payload['data'] ?? ''));
    if ($b64 === '') return '';
    // Strip any data: URI prefix, then decode strictly.
    $b64 = (string)preg_replace('#^data:image/[a-z0-9.+-]+;base64,#i', '', $b64);
    $decoded = base64_decode($b64, true);
    return $decoded === false ? '' : $decoded;
}

// Removes the APP1/Exif segment from a JPEG. A phone selfie routinely carries
// GPS coordinates in EXIF, which would otherwise ship a member's home location
// to every viewer. No GD required — this is a segment-level byte edit.
function stripJpegExif(string $jpeg): string
{
    if (strlen($jpeg) < 4 || substr($jpeg, 0, 2) !== "\xFF\xD8") {
        return $jpeg; // not a JPEG; PNG/WebP carry no APP1
    }

    $out = "\xFF\xD8";
    $i = 2;
    $len = strlen($jpeg);

    while ($i + 3 < $len) {
        if ($jpeg[$i] !== "\xFF") { $out .= substr($jpeg, $i); return $out; }
        $marker = ord($jpeg[$i + 1]);

        // Standalone markers carry no length field.
        if ($marker === 0xD8 || $marker === 0x01 || ($marker >= 0xD0 && $marker <= 0xD7)) {
            $out .= substr($jpeg, $i, 2);
            $i += 2;
            continue;
        }
        if ($marker === 0xDA) {            // start of scan: the rest is entropy data
            $out .= substr($jpeg, $i);
            return $out;
        }

        $segLen = @unpack('n', substr($jpeg, $i + 2, 2))[1] ?? 0;
        if ($segLen < 2 || $i + 2 + $segLen > $len) {
            $out .= substr($jpeg, $i);    // malformed: keep the remainder intact
            return $out;
        }
        // 0xE1 = APP1, where Exif and XMP live. Drop it.
        if ($marker !== 0xE1) {
            $out .= substr($jpeg, $i, 2 + $segLen);
        }
        $i += 2 + $segLen;
    }
    return $out;
}

function profilesList(): void
{
    $viewer = currentUser();
    $params = [];
    $where = ['p.is_blocked = 0'];

    $minAge = $_GET['minAge'] ?? null;
    $maxAge = $_GET['maxAge'] ?? null;
    $gender = $_GET['gender'] ?? null;
    $sect = $_GET['sect'] ?? null;
    $search = $_GET['search'] ?? null;
    $verifiedOnly = ($_GET['verifiedOnly'] ?? 'false') === 'true';
    // Filters the browse UI exposes. These previously had no server-side
    // implementation at all, so the client filtered on fields the response
    // never contained and every one of them returned an empty list.
    $religiosity = $_GET['religiosity'] ?? null;
    $education   = $_GET['education'] ?? null;
    $marja       = $_GET['marja'] ?? null;
    $syedStatus  = $_GET['syedStatus'] ?? null;
    $modesty     = $_GET['modesty'] ?? null;
    $country     = $_GET['country'] ?? null;
    $photoAccess = $_GET['photoAccess'] ?? null;   // public | members | private
    $searchable  = static fn($v, $label) => ($v !== null && $v !== '' && $v !== "Any $label" && $v !== "Any $label.");
    if (array_key_exists('minAge', $_GET) && $_GET['minAge'] !== '' && $searchable($minAge, 'age')) { $where[] = 'p.age >= ?'; $params[] = (int)$minAge; }
    if (array_key_exists('maxAge', $_GET) && $_GET['maxAge'] !== '' && $searchable($maxAge, 'age')) { $where[] = 'p.age <= ?'; $params[] = (int)$maxAge; }
    if ($gender !== null && in_array($gender, ['male', 'female'], true)) { $where[] = 'p.gender = ?'; $params[] = $gender; }
    if ($searchable($sect, 'sect')) { $where[] = 'p.sect = ?'; $params[] = $sect; }
    if ($searchable($religiosity, 'level')) { $where[] = 'p.religiosity = ?'; $params[] = $religiosity; }
    if ($searchable($education, 'education')) { $where[] = 'p.education_level = ?'; $params[] = $education; }
    if ($searchable($marja, 'marja')) { $where[] = 'p.marja = ?'; $params[] = $marja; }
    if ($searchable($syedStatus, 'syed')) { $where[] = 'p.syed_status = ?'; $params[] = $syedStatus; }
    if ($modesty !== null && $modesty !== '' && $modesty !== 'Any') { $where[] = 'p.modesty = ?'; $params[] = $modesty; }
    if ($searchable($country, 'country')) { $where[] = 'p.country = ?'; $params[] = $country; }
    if ($searchable($photoAccess, 'photo')) { $where[] = 'p.photos_visibility = ?'; $params[] = $photoAccess; }
    $verifiedOnly = ($_GET['verifiedOnly'] ?? 'false') === 'true';
    if ($verifiedOnly) { $where[] = 'p.is_verified = 1'; }
    if ($search !== null && trim((string)$search) !== '') {
        // utf8mb4_unicode_ci LIKE is case-insensitive — parity with ILIKE.
        $where[] = '(p.display_name LIKE ? OR p.profession LIKE ? OR p.city LIKE ?)';
        $term = '%' . trim((string)$search) . '%';
        $params[] = $term; $params[] = $term; $params[] = $term;
    }

    if ($viewer === null) {
        // Signed-out visitors browse the same non-private roster a member sees.
        // Only `private` hides a profile now — it is the one setting a member
        // chose specifically to disappear, so it is the only privacy boundary
        // worth enforcing. `members` used to mean "logged-in only", which
        // contradicted the site's own promise of a free, browsable platform.
        //
        // Enumeration of non-private profiles is therefore possible. That is the
        // accepted trade: everything returned still honours the member's photo
        // setting, and `private` profiles remain fully invisible.
        $where[] = "p.visibility <> 'private'";
        $limit = 100;
    } else {
        $where[] = "(p.visibility <> 'private' OR p.user_id = ?)";
        $params[] = $viewer['uid'];
        // Never show members their own profile as a match.
        $where[] = 'p.user_id <> ?';
        $params[] = $viewer['uid'];
    }

    $sql = 'SELECT p.* FROM profiles p WHERE ' . implode(' AND ', $where) . ' ORDER BY p.created_at DESC LIMIT ' . (isset($limit) ? (int)$limit : 100);
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    // Test shells never belong in a public directory.
    //
    // Applied HERE, after the SQL rather than in the WHERE clause, for two
    // reasons: the predicate list lives in one function shared with the purge
    // script, and a LIMIT applies before a filter would remove rows — with
    // 48 shells ahead of 13 real profiles, filtering in SQL after LIMIT would
    // return a short page. Filtering here guarantees the member sees only
    // genuine rows however much debris precedes them.
    if ($viewer === null || ($viewer['isAdmin'] ?? false) !== true) {
        // Negate. array_filter KEEPS rows for which the callback returns true,
        // so passing isTestShellRow() directly would keep the debris and drop
        // every genuine member — the exact inverse of the intent, and it
        // shipped briefly before this was caught.
        $rows = array_values(array_filter(
            $rows,
            static fn(array $row): bool => !isTestShellRow($row)
        ));
    }

    // Include interest state per card so the UI survives reloads (parity with profileById).
    $sentStmt = null;
    if ($viewer !== null) {
        $sentStmt = db()->prepare('SELECT to_user_id FROM interests WHERE from_user_id = ?');
        $sentStmt->execute([$viewer['uid']]);
        $sentIds = [];
        foreach ($sentStmt->fetchAll() as $s) { $sentIds[(string)$s['to_user_id']] = true; }
    }

    // Same for favourites: one query for the whole page, not one per card. The
    // ProfileCard seeds its bookmark from `favourited`, which is what makes a
    // saved profile still look saved after a reload.
    $favIds = [];
    if ($viewer !== null) {
        try {
            $favStmt = db()->prepare('SELECT profile_id FROM favourites WHERE user_id = ?');
            $favStmt->execute([$viewer['uid']]);
            foreach ($favStmt->fetchAll() as $f) { $favIds[(string)$f['profile_id']] = true; }
        } catch (Throwable $e) {
            // A missing table must not break the browse page; the cards simply
            // render unsaved.
            error_log('[api] favourites flag: ' . substr($e->getMessage(), 0, 120));
        }
    }

    $list = [];
    foreach ($rows as $row) {
        $view = visibleProfile($row, $viewer);
        if ($view === null) continue;
        if ($viewer !== null) {
            $view['interestSent'] = isset($sentIds[(string)($view['id'] ?? '')]);
        } else {
            $view['interestSent'] = false;
        }
        $view['favourited'] = isset($favIds[(string)($view['id'] ?? '')]);
        $list[] = $view;
    }

    json($list);
}

function profileMe(): void
{
    $user = requireAuthUser();
    $stmt = db()->prepare('SELECT * FROM profiles WHERE user_id = ? LIMIT 1');
    $stmt->execute([$user['uid']]);
    $row = $stmt->fetch();

    if (!$row) {
        je('Profile not found.', 404);
    }

    json(visibleProfile($row, $user));
}

/**
 * GET /api/profiles/me/favourites — the caller's own saved profiles.
 *
 * Private by construction: there is no endpoint that reads anyone else's list,
 * so there is no way to learn who saved you. Rows reuse visibleProfile() so a
 * favourite that later becomes private stops rendering, rather than leaking
 * through the favourites list.
 */
function favouritesList(): void
{
    $user = requireAuthUser();

    try {
        $rows = db()->prepare(
            'SELECT p.*, f.created_at AS fav_created_at
               FROM favourites f
               JOIN profiles p ON p.user_id = f.profile_id
              WHERE f.user_id = ? AND p.is_blocked = 0
              ORDER BY f.created_at DESC
              LIMIT 200'
        );
        $rows->execute([$user['uid']]);
        $favs = $rows->fetchAll();
    } catch (Throwable $e) {
        error_log('[api] favourites list: ' . substr($e->getMessage(), 0, 120));
        json(['rows' => [], 'available' => false]);
    }

    $out = [];
    foreach ($favs as $f) {
        $row = $f;
        // Reuse the normal visibility rules — a saved profile that has since
        // been hidden must stop appearing here too.
        $view = visibleProfile($row, $user);
        if (!$view) continue;
        $view['favouritedAt'] = $f['fav_created_at'] ?? null;
        // MUST be true, not merely implied by appearing in this list.
        // ProfileCard seeds its bookmark from `profile.favourited === true`; with
        // this field absent every card on /favorites rendered as unsaved, so
        // tapping the bookmark there removed the save the member had just made.
        $view['favourited'] = true;
        $out[] = $view;
    }

    json(['rows' => $out, 'available' => true]);
}

/** POST /api/profiles/:id/favourite — idempotent. */
function favouriteAdd(string $id): void
{
    $user = requireAuthUser();

    if ((string)$id === (string)$user['uid']) {
        je('You cannot save your own profile.', 400);
    }
    $probe = db()->prepare('SELECT user_id, is_demo FROM profiles WHERE user_id = ? AND is_blocked = 0 LIMIT 1');
    $probe->execute([$id]);
    $target = $probe->fetch();
    if (!$target) {
        je('Profile not found.', 404);
    }
    // A sample profile on a favourites list is a dead end — there is nobody to
    // write to. Refused here as well as in the card so the list never fills with
    // entries that can never lead anywhere.
    if ((int)($target['is_demo'] ?? 0) === 1) {
        je('This is a sample profile, so it cannot be saved. Create your own profile to start building your list.', 409);
    }

    // INSERT IGNORE, not a SELECT-then-INSERT: a double-tap is normal UI
    // behaviour and must not 409 or insert a duplicate.
    db()->prepare('INSERT IGNORE INTO favourites (user_id, profile_id) VALUES (?, ?)')
        ->execute([$user['uid'], $id]);

    json(['ok' => true, 'favourited' => true]);
}

/** DELETE /api/profiles/:id/favourite — idempotent. */
function favouriteRemove(string $id): void
{
    $user = requireAuthUser();
    db()->prepare('DELETE FROM favourites WHERE user_id = ? AND profile_id = ?')
        ->execute([$user['uid'], $id]);
    json(['ok' => true, 'favourited' => false]);
}

function profileById(string $id): void
{
    $stmt = db()->prepare('SELECT * FROM profiles WHERE user_id = ? LIMIT 1');
    $stmt->execute([$id]);
    $row = $stmt->fetch();

    $viewer = currentUser();
    $view = $row ? visibleProfile($row, $viewer) : null;
    if (!$view) {
        // Same 404 for missing, blocked, and private-from-you — no probing.
        je('Profile not found.', 404);
    }

    // Full-profile reads are deliberately NOT gated on a verified email.
    // The gate used to live here, so every unverified member hit a dead end the
    // instant they clicked any card -- the exact moment the product most needs
    // to earn trust. Verification is a gate on CONTACT, not on LOOKING: it is
    // enforced where a real action happens (POST /messages to start a
    // conversation, and the interest write path). An unverified member can
    // browse, read profiles and express interest, but cannot message until they
    // verify.

    // Include interest state so the UI survives reloads.
    if ($viewer !== null) {
        $sent = db()->prepare('SELECT 1 FROM interests WHERE from_user_id = ? AND to_user_id = ? LIMIT 1');
        $sent->execute([$viewer['uid'], $id]);
        $view['interestSent'] = (bool)$sent->fetch();

        $received = db()->prepare('SELECT 1 FROM interests WHERE from_user_id = ? AND to_user_id = ? LIMIT 1');
        $received->execute([$id, $viewer['uid']]);
        $view['interestReceived'] = (bool)$received->fetch();
        $view['mutualInterest'] = $view['interestSent'] && $view['interestReceived'];
    } else {
        $view['interestSent'] = false;
        $view['interestReceived'] = false;
        $view['mutualInterest'] = false;
    }

    json($view);
}
function profileUpdate(): void
{
    $user = requireAuthUser();
    $b = requestJson();

    // Validation parity with profileMutations.js.
    $age = ($b['age'] ?? null) === null || $b['age'] === '' ? null : (int)$b['age'];
    if ($age !== null && (!ctype_digit((string)$b['age']) || $age < 18 || $age > 100)) {
        je('Age must be between 18 and 100.', 400);
    }
    if (!empty($b['gender']) && !in_array($b['gender'], ['male', 'female'], true)) {
        je('Invalid gender.', 400);
    }
    // Visibility vocabulary: the onboarding wizard speaks the product's UX
    // language (profile: public/limited/hidden; photos: public/request/match)
    // while the server enforces a 3-tier model (public/members/private).
    // Accept both, normalize to the server model — a vocabulary mismatch must
    // never 400 an entire profile save.
    $visibilityMap = [
        'public' => 'public', 'members' => 'members', 'private' => 'private',
        'limited' => 'members', 'hidden' => 'private',
    ];
    $photoVisibilityMap = [
        'public' => 'public', 'members' => 'members', 'private' => 'private',
        'request' => 'members', 'match' => 'members',
    ];
    foreach (['visibility', 'photos_visibility', 'photosVisibility', 'contact_visibility', 'contactVisibility'] as $f) {
        if (!empty($b[$f])) {
            $map = $f === 'visibility' ? $visibilityMap : $photoVisibilityMap;
            if (!isset($map[$b[$f]])) {
                je("Invalid {$f}.", 400);
            }
            $b[$f] = $map[$b[$f]];
        }
    }
    if (!empty($b['bio']) && strlen((string)$b['bio']) > 2000) {
        je('Bio must be under 2000 characters.', 400);
    }

    // Public handle. Optional, member-chosen, and unique across the platform so
    // it can be used to address someone. Validated here rather than trusted:
    // it is rendered in links and shown to other members.
    if (array_key_exists('username', $b)) {
        $raw = strtolower(trim((string)$b['username']));
        if ($raw === '') {
            $b['username'] = null;                 // clearing a handle is allowed
        } elseif (!preg_match('/^[a-z0-9][a-z0-9._-]{2,31}$/', $raw)) {
            je('Username must be 3-32 characters, start with a letter or number, and use only letters, numbers, dots, dashes or underscores.', 400);
        } else {
            $taken = db()->prepare('SELECT user_id FROM profiles WHERE username = ? AND user_id <> ? LIMIT 1');
            $taken->execute([$raw, (string)$user['uid']]);
            if ($taken->fetch()) {
                je('That username is already taken. Try another.', 409);
            }
            $b['username'] = $raw;
        }
    }

    $cols = ['display_name', 'displayName', 'age', 'gender', 'city', 'country',
        'sect', 'profession', 'bio', 'expectations', 'aboutFamily',
        'visibility', 'photos_visibility', 'photosVisibility',
        'contact_visibility', 'contactVisibility',
        // Fields onboarding collects. These columns were added by
        // migrateAddProfileColumns(); without this mapping the answers were
        // accepted by the form and silently thrown away on save.
        'religiosity', 'educationLevel', 'marja', 'prayer', 'modesty', 'diet',
        'languages', 'ethnicity', 'incomeRange', 'maritalStatus', 'children',
        'childrenPlans', 'relocation', 'familyInvolvement', 'heightCm', 'timeline',
        'photoUrl', 'syedStatus', 'username'];

    // Accept the same key under both shapes. The browse filter sends `education`
    // (that is the query-param name) while the onboarding form sends
    // `educationLevel`; without this alias the value was silently dropped.
    $aliases = [
        'education'          => 'educationLevel',
        'education_level'    => 'educationLevel',
        'religiosity_level'  => 'religiosity',
        'marja_affiliation'  => 'marja',
        'family_involvement' => 'familyInvolvement',
        'children_plans'     => 'childrenPlans',
        'marital_status'     => 'maritalStatus',
        'income_range'       => 'incomeRange',
        'height_cm'          => 'heightCm',
        'photo_url'          => 'photoUrl',
    ];
    foreach ($aliases as $from => $to) {
        if (!array_key_exists($to, $b) && array_key_exists($from, $b)) {
            $b[$to] = $b[$from];
        }
    }
    $sets = [];
    $values = [];
    foreach ($cols as $key) {
        if (!array_key_exists($key, $b)) continue;
        $col = match ($key) {
            'displayName' => 'display_name',
            'aboutFamily' => 'about_family',
            'photosVisibility' => 'photos_visibility',
            'contactVisibility' => 'contact_visibility',
            'educationLevel' => 'education_level',
            'incomeRange' => 'income_range',
            'maritalStatus' => 'marital_status',
            'childrenPlans' => 'children_plans',
            'familyInvolvement' => 'family_involvement',
            'heightCm' => 'height_cm',
            'photoUrl' => 'photo_url',
            'syedStatus' => 'syed_status',
            default => $key,
        };
        $v = in_array($key, ['age', 'heightCm'], true) && $b[$key] !== null && $b[$key] !== ''
            ? (int)$b[$key]
            : ($b[$key] === '' ? null : $b[$key]);
        if ($col === 'display_name' && ($v === null || trim((string)$v) === '')) continue;
        $sets[] = "{$col} = ?";
        $values[] = $v;
    }
    if (!$sets) {
        je('Nothing to update.', 400);
    }
    $values[] = $user['uid'];

    // Upsert: if the profile row doesn't exist yet (e.g. brand-new account
    // that skipped onboarding), create it instead of silently updating zero rows.
    $insertCols = ['user_id'];
    $insertVals = [$user['uid']];
    $updateSets = [];
    foreach ($sets as $i => $set) {
        // $sets entries are "col = ?" — extract col for the INSERT side.
        $col = explode(' = ', $set)[0];
        $insertCols[] = $col;
        $insertVals[] = $values[$i];
        $updateSets[] = "{$col} = VALUES({$col})";
    }
    // Strict-mode guard: display_name is NOT NULL with no default, and MySQL
    // validates INSERT defaults BEFORE the ON DUPLICATE KEY check — omitting
    // it 500s every partial save (e.g. bio-only) even when the profile row
    // already exists. Always carry it on the INSERT side.
    if (!in_array('display_name', $insertCols, true)) {
        $nm = db()->prepare('SELECT display_name FROM users WHERE id = ? LIMIT 1');
        $nm->execute([$user['uid']]);
        $fallback = trim((string)(($nm->fetch()['display_name'] ?? '')));
        if ($fallback === '') $fallback = 'Member';
        array_splice($insertCols, 1, 0, ['display_name']);
        array_splice($insertVals, 1, 0, [$fallback]);
    }
    $sql = 'INSERT INTO profiles (' . implode(', ', $insertCols) . ') VALUES (' .
        implode(', ', array_fill(0, count($insertVals), '?')) .
        ') ON DUPLICATE KEY UPDATE ' . implode(', ', $updateSets) . ', updated_at = UTC_TIMESTAMP()';
    db()->prepare($sql)->execute($insertVals);

    $fetch = db()->prepare('SELECT * FROM profiles WHERE user_id = ? LIMIT 1');
    $fetch->execute([$user['uid']]);
    $row = $fetch->fetch();
    if (!$row) {
        je('Could not save this profile.', 500);
    }

    json(['ok' => true, 'profile' => $row]);
}

function profileInterest(string $id): void
{
    $user = requireAuthUser();

    if ($id === (string)$user['uid']) {
        je('You cannot express interest in yourself.', 400);
    }
    $stmt = db()->prepare('SELECT 1 FROM users WHERE id = ? LIMIT 1');
    $stmt->execute([$id]);
    if (!$stmt->fetch()) {
        je('Profile not found.', 404);
    }

    // Sample profiles exist to show the format of a complete profile. There is no
    // person behind one, so accepting interest would create a match and a
    // notification addressed to nobody — and tell a real member that someone
    // chose them. Refuse server-side; the client hides the button, but the client
    // is not the thing that has to be right here.
    $demo = db()->prepare('SELECT is_demo FROM profiles WHERE user_id = ? LIMIT 1');
    $demo->execute([$id]);
    $demoRow = $demo->fetch();
    if ($demoRow && (int)($demoRow['is_demo'] ?? 0) === 1) {
        je('This is a sample profile, not a real member. It cannot receive interest or messages.', 409);
    }

    // Idempotent: PK conflict on (from,to) is a no-op, like ON CONFLICT DO NOTHING.
    $insert = db()->prepare('INSERT IGNORE INTO interests (from_user_id, to_user_id) VALUES (?, ?)');
    $insert->execute([$user['uid'], $id]);

    $mutual = db()->prepare('SELECT 1 FROM interests WHERE from_user_id = ? AND to_user_id = ? LIMIT 1');
    $mutual->execute([$id, $user['uid']]);
    $mirrored = (bool)$mutual->fetch();

    // Notify the recipient of the new interest (or the match, if mutual).
    $fromName = db()->prepare('SELECT display_name FROM profiles WHERE user_id = ? LIMIT 1');
    $fromName->execute([$user['uid']]);
    $nameRow = $fromName->fetch();
    $senderName = $nameRow['display_name'] ?? 'Someone';
    if ($mirrored) {
        notifyUser($id, 'match', 'It\'s a mutual match!', $senderName . ' also expressed interest. Start a conversation.', $user['uid']);
        notifyUser($user['uid'], 'match', 'It\'s a mutual match!', 'You and ' . $senderName . ' both expressed interest.', $id);
    } else {
        notifyUser($id, 'interest', 'New interest received', $senderName . ' expressed interest in your profile.', $user['uid']);
    }

    json(['success' => true, 'matched' => $mirrored]);
}

// Withdraw an expressed interest. Idempotent — withdrawing twice is a no-op.
function profileUninterest(string $id): void
{
    $user = requireAuthUser();
    $stmt = db()->prepare('DELETE FROM interests WHERE from_user_id = ? AND to_user_id = ?');
    $stmt->execute([$user['uid'], $id]);
    json(['success' => true]);
}

// People who expressed interest in me, newest first — the honest Request Center.
// Excludes pairs where I already withdrew/declined (no row) and pairs already
// in a mutual conversation (those live under Chats, not Requests).
function interestsReceived(): void
{
    $user = requireAuthUser();
    $stmt = db()->prepare(
        'SELECT u.id AS user_id, p.display_name, p.city, p.country, p.photo_url,
                i.created_at,
                EXISTS(SELECT 1 FROM interests m WHERE m.from_user_id = ? AND m.to_user_id = u.id) AS mutual,
                EXISTS(SELECT 1 FROM conversations c
                        WHERE (c.user_a = ? AND c.user_b = u.id) OR (c.user_a = u.id AND c.user_b = ?)) AS has_chat
           FROM interests i
           JOIN users u ON u.id = i.from_user_id
           LEFT JOIN profiles p ON p.user_id = u.id
          WHERE i.to_user_id = ?
       ORDER BY i.created_at DESC
          LIMIT 50'
    );
    $stmt->execute([$user['uid'], $user['uid'], $user['uid'], $user['uid']]);
    $out = [];
    foreach ($stmt->fetchAll() as $row) {
        if ((int)$row['has_chat']) continue; // mutual chats live under Chats
        $out[] = [
            'userId' => $row['user_id'],
            'name' => $row['display_name'] ?: 'Member',
            'city' => $row['city'],
            'country' => $row['country'],
            'photoUrl' => $row['photo_url'],
            'mutual' => (bool)$row['mutual'],
            'receivedAt' => $row['created_at'],
        ];
    }
    json($out);
}

// ─── Notifications ───────────────────────────────────────────────────────────
// Create a notification. Idempotent on (user_id, type, ref_id) to avoid dupes.
function notifyUser(string $userId, string $type, string $title, ?string $body = null, ?string $refId = null): void
{
    try {
        $id = uuid();
        $stmt = db()->prepare('INSERT INTO notifications (id, user_id, type, title, body, ref_id) VALUES (?, ?, ?, ?, ?, ?)');
        $stmt->execute([$id, $userId, $type, $title, $body, $refId]);
    } catch (Throwable $e) {
        error_log('[api] notify failed: ' . substr($e->getMessage(), 0, 120));
    }
}

function notificationsList(): void
{
    $user = requireAuthUser();
    $stmt = db()->prepare('SELECT id, type, title, body, ref_id AS refId, is_read AS isRead, created_at AS createdAt FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50');
    $stmt->execute([$user['uid']]);
    $rows = $stmt->fetchAll();
    foreach ($rows as &$r) { $r['isRead'] = (bool)$r['isRead']; }
    json($rows);
}

function notificationsRead(): void
{
    $user = requireAuthUser();
    $b = requestJson();
    $ids = $b['ids'] ?? null;
    if (is_array($ids) && $ids) {
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = db()->prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ? AND id IN ($placeholders)");
        $stmt->execute(array_merge([$user['uid']], $ids));
    } else {
        // Mark all as read
        $stmt = db()->prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?');
        $stmt->execute([$user['uid']]);
    }
    json(['success' => true]);
}

function notificationsUnreadCount(): void
{
    $user = requireAuthUser();
    $stmt = db()->prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0');
    $stmt->execute([$user['uid']]);
    $row = $stmt->fetch();
    json(['unread' => (int)($row['c'] ?? 0)]);
}

