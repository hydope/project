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
    // Filter options MUST be matched before the `/:id` branch, same as stats.
    if ($method === 'GET' && $id === 'filter-options') { profilesFilterOptions(); return; }
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
    if ($method === 'POST' && $id === 'me' && $sub === 'video') { videoUpload(); return; }
    if ($method === 'DELETE' && $id === 'me' && $sub === 'video') { videoDelete(); return; }
    if ($method === 'GET' && $id === 'interests' && ($segments[1] ?? '') === 'received') { interestsReceived(); return; }
    if ($method === 'GET' && $id === 'notifications') { notificationsList(); return; }
    if ($method === 'POST' && $id === 'notifications' && ($segments[1] ?? '') === 'read') { notificationsRead(); return; }
    if ($method === 'GET' && $id === 'notifications' && ($segments[1] ?? '') === 'unread-count') { notificationsUnreadCount(); return; }
    if ($method === 'GET' && $id !== null && $sub === 'photo') { photoServe($id); return; }
    if ($method === 'GET' && $id !== null && $sub === 'video') { videoServe($id); return; }
    if ($method === 'GET' && $id !== null) { profileById($id); return; }
    if ($method === 'POST' && $id !== null && ($segments[1] ?? '') === 'interest') { profileInterest($id); return; }
    if ($method === 'DELETE' && $id !== null && ($segments[1] ?? '') === 'interest') { profileUninterest($id); return; }
    if ($method === 'POST' && $id !== null && ($segments[1] ?? '') === 'decline') { profileDecline($id); return; }

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
    $upd = db()->prepare('UPDATE profiles SET photo_url = ?, updated_at = UTC_TIMESTAMP() WHERE user_id = ?');
    $upd->execute([$path, $user['uid']]);
    // If no profile row exists the UPDATE silently affects 0 rows — the file
    // would be on disk but nothing would ever serve it. Fail loudly instead
    // of reporting a success that is not real.
    if ($upd->rowCount() === 0) {
        @unlink($path);
        je('Could not save your photo — no profile found. Complete your profile first, then try again.', 409);
    }
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

// ── Profile video (2026-11-10) ────────────────────────────────────────────
// One short video per profile, same discipline as the photo flow: the server
// sniffs the bytes (never trusts the extension or the Content-Type), caps
// duration at 30s and size at 25 MB, generates the filename, and serves it
// through the same photo-tier gate (public → anyone, members → any signed-in
// member, legacy request/match → mutual interest only, private → never,
// owner always). NO transcoding — the file is stored and served as-is, so a
// member whose phone records in an unusual codec may get a video their own
// browser cannot play; the upload still succeeds, and the client checks
// playability before uploading where it can.
const VIDEO_MAX_BYTES = 25 * 1024 * 1024;
const VIDEO_MAX_SECONDS = 30;
const VIDEO_ALLOWED = ['video/mp4' => 'mp4', 'video/webm' => 'webm'];

// Byte-sniff a video. finfo first, magic bytes as the fallback: MP4 carries
// the 'ftyp' box at offset 4, WebM starts with the EBML header 1A 45 DF A3.
function sniffVideoMime(string $bytes): ?string
{
    if (class_exists('finfo')) {
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mime = $finfo->buffer($bytes);
        if ($mime !== false && isset(VIDEO_ALLOWED[$mime])) return $mime;
    }
    if (strlen($bytes) >= 8 && substr($bytes, 4, 4) === 'ftyp') return 'video/mp4';
    if (strlen($bytes) >= 4 && substr($bytes, 0, 4) === "\x1A\x45\xDF\xA3") return 'video/webm';
    return null;
}

// Read the duration in seconds, or null when it cannot be parsed. MP4:
// scan for the 'mvhd' atom and read its timescale + duration (version 0 and
// 1 have different field widths). WebM: the Duration element (0x4489) in
// the Info block is a float in milliseconds at the default timecode scale.
// A file whose duration cannot be read is rejected — a silent long video
// would break the 30s promise to every viewer.
function videoDurationSeconds(string $bytes, string $mime): ?float
{
    if ($mime === 'video/mp4') {
        $p = strpos($bytes, 'mvhd');
        if ($p === false) return null;
        $version = ord($bytes[$p + 4] ?? "\x00");
        if ($version === 0) {
            $ts = unpack('N', substr($bytes, $p + 16, 4));
            $dur = unpack('N', substr($bytes, $p + 20, 4));
            if ($ts === false || $dur === false || $ts[1] === 0) return null;
            return $dur[1] / $ts[1];
        }
        if ($version === 1) {
            $ts = unpack('N', substr($bytes, $p + 24, 4));
            $dur = unpack('J', substr($bytes, $p + 28, 8));
            if ($ts === false || $dur === false || $ts[1] === 0) return null;
            return $dur[1] / $ts[1];
        }
        return null;
    }
    if ($mime === 'video/webm') {
        // The Info element lives near the start of the file; searching the
        // whole 25 MB for a two-byte pattern would be a false-positive farm.
        $head = substr($bytes, 0, 8192);
        $p = strpos($head, "\x44\x89");
        if ($p === false) return null;
        $b = ord($head[$p + 2] ?? "\x00");
        // EBML variable-length size: the leading set bit marks the length.
        if (($b & 0x80) !== 0) { $size = $b & 0x7F; $off = $p + 3; }
        elseif (($b & 0x40) !== 0) { $size = (($b & 0x3F) << 8) | ord($head[$p + 3] ?? "\x00"); $off = $p + 4; }
        else return null;
        if ($size !== 8) return null; // Duration is an 8-byte double.
        $v = unpack('E', substr($head, $off, 8));
        if ($v === false) return null;
        return $v[1] / 1000.0; // milliseconds at the default timecode scale
    }
    return null;
}

// Multipart or base64 JSON, mirroring photoReadUpload — including the
// CONTENT_LENGTH oversize guard, because a POST over post_max_size arrives
// with an empty $_FILES and an empty body.
function videoReadUpload(): string
{
    $contentLength = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($contentLength > 0 && empty($_FILES['video'])) {
        $postMax = parsePhpSize((string)ini_get('post_max_size'));
        if ($postMax > 0 && $contentLength > $postMax) {
            je('Video must be under 25 MB.', 400);
        }
    }
    if (!empty($_FILES['video']) && is_array($_FILES['video'])) {
        $f = $_FILES['video'];
        $err = (int)($f['error'] ?? UPLOAD_ERR_NO_FILE);
        if ($err === UPLOAD_ERR_INI_SIZE || $err === UPLOAD_ERR_FORM_SIZE) {
            je('Video must be under 25 MB.', 400);
        }
        if ($err !== UPLOAD_ERR_OK) {
            je('Could not read the uploaded video.', 400);
        }
        $tmp = (string)($f['tmp_name'] ?? '');
        if ($tmp === '' || !is_uploaded_file($tmp)) {
            je('Could not read the uploaded video.', 400);
        }
        $bytes = @file_get_contents($tmp);
        if ($bytes === false || $bytes === '') {
            je('Attach a video to upload.', 400);
        }
        return $bytes;
    }
    // The JSON branch: requestJson() is the body accessor every POST handler
    // uses (lib/db.php). There is no readJsonBody helper anywhere in the
    // codebase — an earlier draft called one and the deploy gate caught it.
    $payload = requestJson();
    $b64 = $payload['video'] ?? $payload['data'] ?? null;
    if (!is_string($b64) || $b64 === '') {
        je('Attach a video to upload.', 400);
    }
    $b64 = preg_replace('#^data:video/[a-z0-9.+-]+;base64,#i', '', $b64);
    $bytes = base64_decode($b64, true);
    if ($bytes === false || $bytes === '') {
        je('Attach a video to upload.', 400);
    }
    return $bytes;
}

function videoUpload(): void
{
    $user = requireAuthUser();
    $bytes = videoReadUpload();
    if (strlen($bytes) > VIDEO_MAX_BYTES) {
        je('Video must be under 25 MB.', 400);
    }
    $mime = sniffVideoMime($bytes);
    if ($mime === null || !isset(VIDEO_ALLOWED[$mime])) {
        je('Video must be an MP4 or WebM file.', 400);
    }
    $duration = videoDurationSeconds($bytes, $mime);
    if ($duration === null) {
        je('Could not read this video — try exporting it as MP4.', 400);
    }
    if ($duration > VIDEO_MAX_SECONDS) {
        je('Video must be 30 seconds or shorter.', 400);
    }
    $ext = VIDEO_ALLOWED[$mime];
    $dir = rtrim(photoBaseDir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'videos'
        . DIRECTORY_SEPARATOR . $user['uid'];
    if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
        je('Could not save the video. Try again.', 500);
    }
    $stored = $dir . DIRECTORY_SEPARATOR . uuid() . '.' . $ext;
    if (@file_put_contents($stored, $bytes) === false) {
        je('Could not save the video. Try again.', 500);
    }

    $stmt = db()->prepare('SELECT video_url FROM profiles WHERE user_id = ? LIMIT 1');
    $stmt->execute([$user['uid']]);
    $row = $stmt->fetch();
    if ($row === false) {
        @unlink($stored);
        je('Set up your profile first, then add a video.', 409);
    }
    $old = (string)($row['video_url'] ?? '');
    db()->prepare('UPDATE profiles SET video_url = ?, updated_at = UTC_TIMESTAMP() WHERE user_id = ?')
        ->execute([$stored, $user['uid']]);
    if ($old !== '' && $old !== $stored) {
        @unlink($old);
    }
    touchLastActive($user['uid']);
    json(['ok' => true, 'video' => '/api/profiles/' . $user['uid'] . '/video'], 201);
}

function videoDelete(): void
{
    $user = requireAuthUser();
    $stmt = db()->prepare('SELECT video_url FROM profiles WHERE user_id = ? LIMIT 1');
    $stmt->execute([$user['uid']]);
    $old = (string)($stmt->fetch()['video_url'] ?? '');

    db()->prepare('UPDATE profiles SET video_url = NULL, updated_at = UTC_TIMESTAMP() WHERE user_id = ?')
        ->execute([$user['uid']]);
    if ($old !== '') {
        @unlink($old);
    }
    touchLastActive($user['uid']);
    json(['ok' => true]);
}

// Serve a profile video through the same photo-tier gate as photoServe:
// public → anyone; members → any signed-in member; legacy request/match →
// mutual interest only; private → never; owner always. Blocks and
// private-profile visibility are re-checked on every request.
function videoServe(string $id): void
{
    // currentUser() is the nullable viewer — null for an anonymous request.
    // (An earlier draft called optionalAuthUser(), which does not exist
    // anywhere in the codebase; the deploy gate caught it.)
    $viewer = currentUser();
    $stmt = db()->prepare('SELECT user_id, video_url, visibility, photos_visibility FROM profiles WHERE user_id = ? LIMIT 1');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if ($row === false || (string)($row['video_url'] ?? '') === '') {
        je('Not found.', 404);
    }
    if ((string)($row['visibility'] ?? 'members') === 'private' && ($viewer === null || (string)$viewer['uid'] !== (string)$row['user_id'])) {
        je('Not found.', 404);
    }
    // Owner always — the tier gate is for other viewers only. (2026-11-10:
    // the first version checked the 'private' tier before the owner, so an
    // owner got a 404 on their own video the moment they set the tier to
    // private. photoServe computes $isOwner first; this does the same.)
    $isOwner = $viewer !== null && (string)$viewer['uid'] === (string)$row['user_id'];
    if (!$isOwner) {
        $tier = (string)($row['photos_visibility'] ?? 'members');
        if ($tier === 'private') {
            je('Not found.', 404);
        }
        if ($tier === 'members') {
            if ($viewer === null) {
                je('Not found.', 404);
            }
            // Any signed-in member may watch.
        } elseif ($tier !== 'public') { // legacy 'request' / 'match'
            if ($viewer === null || !mutualInterest((string)$row['user_id'], (string)$viewer['uid'])) {
                je('Not found.', 404);
            }
        }
        if ($viewer !== null && pairBlocked((string)$row['user_id'], (string)$viewer['uid'])) {
            je('Not found.', 404);
        }
    }

    $base = realpath(photoBaseDir()) ?: photoBaseDir();
    $real = realpath((string)$row['video_url']) ?: '';
    if ($real === '' || strncmp($real, $base, strlen($base)) !== 0) {
        je('Video unavailable.', 404);
    }
    $mime = class_exists('finfo')
        ? ((new finfo(FILEINFO_MIME_TYPE))->file($real) ?: 'application/octet-stream')
        : (sniffVideoMime((string)@file_get_contents($real)) ?: 'application/octet-stream');
    $size = filesize($real);

    header('Content-Type: ' . $mime);
    header('Content-Length: ' . $size);
    header('Cache-Control: private, no-store, max-age=0');
    header('X-Content-Type-Options: nosniff');
    header('Content-Disposition: inline');
    // A video is streamed, not downloaded — no Accept-Ranges here yet; the
    // <video> element fetches it whole, which is fine at 25 MB and under.
    readfile($real);
    exit;
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
    $stmt = db()->prepare('SELECT user_id, photo_url, photos_visibility, visibility, is_blocked, blocked_until FROM profiles WHERE user_id = ? LIMIT 1');
    $stmt->execute([$id]);
    $row = $stmt->fetch();

    if (!$row || blockIsActive($row) || (string)($row['photo_url'] ?? '') === '') {
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
        // Photo tiers (2026-11-09, Syed's decision — option A): public → anyone;
        // 'members' → any signed-in member; legacy 'request'/'match' → mutual
        // interest only; 'private' → never (handled above). Owner always.
        // This matches visibleProfile(), which already advertised members-tier
        // photo URLs to any signed-in member — the serve endpoint was the odd
        // one out, 404ing a URL the payload had just handed out. An anonymous
        // viewer is told to sign in rather than 404'd, so the link is not
        // mistaken for a bug.
        if ($tier === 'members') {
            if ($viewer === null) {
                je('Sign in to view this photo.', 401);
            }
            // Any signed-in member — no mutual-interest check.
        } elseif ($tier !== 'public') {
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

// photoBaseDir() lives in lib/photos.php (shared with the seeder + migration).

// Parse a php.ini size ("8M", "512K", "1G", "0" = unlimited) to bytes.
function parsePhpSize(string $size): int
{
    $size = trim($size);
    if ($size === '' || $size === '0' || $size === '-1') return 0;
    $unit = strtolower(substr($size, -1));
    $num = (float)$size;
    if ($unit === 'g') return (int)($num * 1024 * 1024 * 1024);
    if ($unit === 'm') return (int)($num * 1024 * 1024);
    if ($unit === 'k') return (int)($num * 1024);
    return (int)$num;
}

// Accepts multipart/form-data (what a browser sends) and a base64 JSON body
// (what API clients use, matching the verification endpoint).
function photoReadUpload(): string
{
    // Oversize guard (2026-11-09): when the whole POST exceeds PHP's
    // post_max_size, PHP discards the body entirely — $_FILES is empty and
    // php://input is empty — so without this the caller reports the
    // misleading "Attach a photo to upload." for a file that was actually
    // far too big. CONTENT_LENGTH survives the discard, and post_max_size
    // here sits above the 5 MB cap, so a discarded body is always an
    // over-limit photo. A small empty POST still falls through to the
    // honest "Attach a photo" error below.
    $contentLength = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($contentLength > 0 && empty($_FILES['photo'])) {
        $postMax = parsePhpSize((string)ini_get('post_max_size'));
        if ($postMax > 0 && $contentLength > $postMax) {
            je('Photo must be under 5 MB.', 400);
        }
    }
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

// GET /api/profiles/filter-options — distinct values actually present in
// browsable profiles, so the Filters panel never offers a choice that
// matches nobody. Same base roster as browse: real, finished, unblocked
// members only (no test shells, no seeded profiles in the options). Counts
// are most-common first; the client renders them in this order.
function profilesFilterOptions(): void
{
    // Real members only: JOIN users (see adminPhotoLift — a NOT IN filter
    // lets orphaned profiles of deleted accounts leak in). Approved
    // matchmaker profiles have no users row, so they are admitted by their
    // is_matchmaker marker instead — they are browsable and their values
    // belong in the options.
    try {
        $rows = db()->query(
            "SELECT p.citizenships, p.income_range, p.height_cm, p.residency_status, p.marital_status, p.convert_status, p.hobbies, p.languages FROM profiles p
               LEFT JOIN users u ON u.id = p.user_id
              WHERE (p.is_blocked = 0 OR (p.blocked_until IS NOT NULL AND p.blocked_until <= NOW()))
                AND (p.is_matchmaker = 1 OR (u.id IS NOT NULL AND u.is_admin = 0 AND u.is_test = 0 AND u.email NOT LIKE 'seeded-%@shiarishta.com'))
                AND p.is_seeded = 0
                AND NOT (TRIM(COALESCE(p.city, '')) = '' AND TRIM(COALESCE(p.country, '')) = '' AND TRIM(COALESCE(p.bio, '')) = '' AND TRIM(COALESCE(p.about_family, '')) = '')"
        )->fetchAll();
    } catch (Throwable $e) {
        json(['citizenships' => [], 'incomeRanges' => [], 'heightRange' => ['min' => null, 'max' => null], 'residencyStatuses' => [], 'maritalStatuses' => [], 'convertStatuses' => [], 'hobbies' => [], 'languages' => []]);
    }
    $cit = [];
    $inc = [];
    $res = [];
    $mar = [];
    $con = [];
    $hob = [];
    $lang = [];
    $minH = null;
    $maxH = null;
    foreach ($rows as $r) {
        foreach (explode(',', (string)($r['citizenships'] ?? '')) as $tok) {
            $tok = trim($tok);
            if ($tok !== '') $cit[$tok] = ($cit[$tok] ?? 0) + 1;
        }
        $ir = trim((string)($r['income_range'] ?? ''));
        if ($ir !== '' && $ir !== 'Prefer not to say') $inc[$ir] = ($inc[$ir] ?? 0) + 1;
        $rs = trim((string)($r['residency_status'] ?? ''));
        if ($rs !== '' && $rs !== 'Prefer not to say') $res[$rs] = ($res[$rs] ?? 0) + 1;
        $ms = trim((string)($r['marital_status'] ?? ''));
        if ($ms !== '') $mar[$ms] = ($mar[$ms] ?? 0) + 1;
        $cs = trim((string)($r['convert_status'] ?? ''));
        if ($cs !== '' && $cs !== 'Prefer not to say') $con[$cs] = ($con[$cs] ?? 0) + 1;
        foreach (explode(',', (string)($r['hobbies'] ?? '')) as $tok) {
            $tok = trim($tok);
            if ($tok !== '') $hob[$tok] = ($hob[$tok] ?? 0) + 1;
        }
        foreach (explode(',', (string)($r['languages'] ?? '')) as $tok) {
            $tok = trim($tok);
            if ($tok !== '') $lang[$tok] = ($lang[$tok] ?? 0) + 1;
        }
        $h = $r['height_cm'] !== null ? (int)$r['height_cm'] : null;
        if ($h !== null && $h > 0) {
            $minH = $minH === null ? $h : min($minH, $h);
            $maxH = $maxH === null ? $h : max($maxH, $h);
        }
    }
    arsort($cit);
    arsort($inc);
    arsort($res);
    arsort($mar);
    arsort($con);
    arsort($hob);
    arsort($lang);
    json([
        'citizenships' => array_keys($cit),
        'incomeRanges' => array_keys($inc),
        'heightRange' => ['min' => $minH, 'max' => $maxH],
        'residencyStatuses' => array_keys($res),
        'maritalStatuses' => array_keys($mar),
        'convertStatuses' => array_keys($con),
        'hobbies' => array_keys($hob),
        'languages' => array_keys($lang),
    ]);
}

function profilesList(): void
{
    $viewer = currentUser();
    $params = [];
    $where = ['(p.is_blocked = 0 OR (p.blocked_until IS NOT NULL AND p.blocked_until <= NOW()))'];
    // QA/test accounts must never appear in the public directory, even when
    // they use a real-looking display name (the critic persona is "Zahra Fatima").
    $where[] = 'p.user_id NOT IN (SELECT id FROM users WHERE is_test = 1)';

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
    // Browse filters (2026-11-09): height range in cm (the UI enters
    // feet-inches and converts), citizenship (comma-joined tokens matched
    // against the comma-joined `citizenships` column), income range (exact
    // match on the stored `income_range` value).
    $minHeightCm = $_GET['minHeightCm'] ?? null;
    $maxHeightCm = $_GET['maxHeightCm'] ?? null;
    $citizenship = $_GET['citizenship'] ?? null;
    $incomeRange = $_GET['incomeRange'] ?? null;
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
    // Slug-matched country filter — same rule as the city filter below
    // (2026-11-09, D.i.khan fix): the stored value is free text, the card
    // links /country/<slug>, and the page queries the name derived from
    // the slug. Exact LOWER() equality can never join those spellings, so
    // the requested value is resolved to the exact stored values with the
    // same slug first; a slug with no stored value matches nothing.
    if ($searchable($country, 'country')) {
        $countryValues = resolveLocationFilterValues('country', (string)$country);
        if ($countryValues === []) { $where[] = '1 = 0'; }
        else {
            $where[] = 'LOWER(p.country) IN (' . implode(',', array_fill(0, count($countryValues), 'LOWER(?)')) . ')';
            foreach ($countryValues as $v) $params[] = $v;
        }
    }
    // Slug-matched city filter. `search` does a LIKE across city as part of
    // a free-text query, which is not the same thing: searching "Lahore" in
    // a profile named "Lahore Kid" would match, and a city called
    // "Springfield" would match "Springfield Gardens". A /city/<slug> page
    // needs the city and only the city, or it would advertise a location
    // page containing strangers.
    //
    // The match is on the slug, not the spelling: the stored value is free
    // text ("D.i.khan"), the card links /city/d-i-khan, and CityPage queries
    // ?city=<name derived from the slug> ("D I Khan"). Exact LOWER()
    // equality can never join those three, so the requested value is
    // resolved to the exact stored values with the same slug first (see
    // resolveLocationFilterValues in lib/db.php). A slug with no stored
    // value matches nothing — never a LIKE fallback.
    $city = $_GET['city'] ?? null;
    if ($searchable($city, 'city')) {
        $cityValues = resolveLocationFilterValues('city', (string)$city);
        if ($cityValues === []) { $where[] = '1 = 0'; }
        else {
            $where[] = 'LOWER(p.city) IN (' . implode(',', array_fill(0, count($cityValues), 'LOWER(?)')) . ')';
            foreach ($cityValues as $v) $params[] = $v;
        }
    }
    if ($searchable($photoAccess, 'photo')) { $where[] = 'p.photos_visibility = ?'; $params[] = $photoAccess; }
    if ($minHeightCm !== null && $minHeightCm !== '' && is_numeric($minHeightCm)) { $where[] = 'p.height_cm >= ?'; $params[] = (int)$minHeightCm; }
    if ($maxHeightCm !== null && $maxHeightCm !== '' && is_numeric($maxHeightCm)) { $where[] = 'p.height_cm <= ?'; $params[] = (int)$maxHeightCm; }
    if ($citizenship !== null && trim((string)$citizenship) !== '' && $citizenship !== 'Any') {
        // Citizenships are stored comma-joined with spaces ("Pakistani, Indian").
        // FIND_IN_SET needs the spaces gone on both sides; the token is
        // space-stripped the same way ("United States" → "UnitedStates").
        $tokens = array_values(array_filter(array_map('trim', explode(',', (string)$citizenship)), static fn($s) => $s !== ''));
        if ($tokens !== []) {
            $ors = [];
            foreach ($tokens as $tok) {
                $ors[] = "FIND_IN_SET(?, REPLACE(p.citizenships, ' ', '')) > 0";
                $params[] = str_replace(' ', '', $tok);
            }
            $where[] = '(' . implode(' OR ', $ors) . ')';
        }
    }
    if ($incomeRange !== null && trim((string)$incomeRange) !== '' && $incomeRange !== 'Any') { $where[] = 'p.income_range = ?'; $params[] = $incomeRange; }
    // Profile-depth filters (2026-11-10): hobbies and language are
    // comma-joined multi-values (same FIND_IN_SET shape as citizenships);
    // residency, marital and convert status are exact matches on fixed
    // lists. Partner preferences are NOT browse filters — they are the
    // viewer's own criteria, and the match sort covers them.
    $hobbies = $_GET['hobbies'] ?? null;
    $residencyStatus = $_GET['residencyStatus'] ?? null;
    $maritalStatus = $_GET['maritalStatus'] ?? null;
    $convertStatus = $_GET['convertStatus'] ?? null;
    $language = $_GET['language'] ?? null;
    $csvFilter = static function (string $column, $value) use (&$where, &$params): void {
        $tokens = array_values(array_filter(array_map('trim', explode(',', (string)$value)), static fn($s) => $s !== ''));
        if ($tokens === []) return;
        $ors = [];
        foreach ($tokens as $tok) {
            $ors[] = "FIND_IN_SET(?, REPLACE($column, ' ', '')) > 0";
            $params[] = str_replace(' ', '', $tok);
        }
        $where[] = '(' . implode(' OR ', $ors) . ')';
    };
    if ($hobbies !== null && trim((string)$hobbies) !== '' && $hobbies !== 'Any') { $csvFilter('p.hobbies', $hobbies); }
    if ($language !== null && trim((string)$language) !== '' && $language !== 'Any') { $csvFilter('p.languages', $language); }
    if ($searchable($residencyStatus, 'residency')) { $where[] = 'p.residency_status = ?'; $params[] = $residencyStatus; }
    if ($searchable($maritalStatus, 'marital')) { $where[] = 'p.marital_status = ?'; $params[] = $maritalStatus; }
    if ($searchable($convertStatus, 'convert')) { $where[] = 'p.convert_status = ?'; $params[] = $convertStatus; }
    $verifiedOnly = ($_GET['verifiedOnly'] ?? 'false') === 'true';
    if ($verifiedOnly) { $where[] = 'p.is_verified = 1'; }
    if ($search !== null && trim((string)$search) !== '') {
        // utf8mb4_unicode_ci LIKE is case-insensitive — parity with ILIKE.
        $where[] = '(p.display_name LIKE ? OR p.profession LIKE ? OR p.city LIKE ?)';
        $term = '%' . trim((string)$search) . '%';
        $params[] = $term; $params[] = $term; $params[] = $term;
    }

    // "Unfinished" is exactly the old "Profile in progress" badge condition
    // (ProfileCard.jsx): no city, no country, and no bio/about-family text.
    // excerptText() trims, so whitespace-only values count as empty here too.
    $unfinished = "(TRIM(COALESCE(p.city, '')) = '' AND TRIM(COALESCE(p.country, '')) = '' AND TRIM(COALESCE(p.bio, '')) = '' AND TRIM(COALESCE(p.about_family, '')) = '')";

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
        // "Block unverified members": an owner who turned it on is invisible
        // to signed-out visitors, who are unverified by definition.
        $where[] = 'p.block_unverified = 0';
        // Hide unfinished profiles from browse (2026-11-04, Syed's call): no
        // city, no country, no bio and no about-family text — the exact
        // condition behind the old "Profile in progress" badge. They stay
        // countable members, just not browsable until they add even one of
        // those fields, at which point they reappear immediately.
        $where[] = "NOT $unfinished";
        $limit = 100;
    } else {
        $where[] = "(p.visibility <> 'private' OR p.user_id = ?)";
        $params[] = $viewer['uid'];
        // Same unfinished filter, except the viewer's own profile, which stays
        // visible to themselves (mirrors the visibility exemption above).
        $where[] = "(NOT $unfinished OR p.user_id = ?)";
        $params[] = $viewer['uid'];
        // Never show members their own profile as a match.
        $where[] = 'p.user_id <> ?';
        $params[] = $viewer['uid'];
        // User blocks (2026-11-09, P0 batch): never list a profile whose
        // member blocked me or whom I blocked. Filtering in SQL keeps the
        // paged `total` honest — visibleProfile() is the safety net for the
        // single-profile and favourites paths.
        $where[] = 'NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = ? AND b.blocked_id = p.user_id) OR (b.blocker_id = p.user_id AND b.blocked_id = ?))';
        $params[] = $viewer['uid'];
        $params[] = $viewer['uid'];
        // "Block unverified members": an unverified viewer never sees those
        // profiles. One lookup here; visibleProfile() re-checks per row for
        // the single-profile and favourites paths.
        if (!viewerIsEmailVerified($viewer)) {
            $where[] = 'p.block_unverified = 0';
        }
    }

    // Pagination (2026-10-25): the directory hard-capped at 100 rows with no
    // way past it, so the oldest profiles became unreachable once the roster
    // passed 100 members. ?paged=1 returns an envelope {rows, total, hasMore}
    // sliced from the full filtered roster; without it the response stays a
    // plain array so every existing caller keeps working unchanged.
    $paged = ($_GET['paged'] ?? '') === '1';
    $pageLimit = isset($_GET['limit']) ? max(1, min(100, (int)$_GET['limit'])) : 100;
    $pageOffset = isset($_GET['offset']) ? max(0, (int)$_GET['offset']) : 0;

    // Match-score ranking (2026-11-10, Batch 4): ?sort=match orders the
    // roster by the server-side compatibility score for a signed-in viewer
    // with a sect, reusing CompatibilityService::score() — the same weights
    // as the client-side computeCompatibility(), so the order agrees with
    // the % on the card. The sort runs BEFORE the paged slice, and the
    // unpaged path drops its SQL LIMIT 100 so the whole roster is ranked
    // (then re-capped to 100 after sorting). Anonymous viewers and viewers
    // without a sect get the default order.
    $sortMatch = ($_GET['sort'] ?? '') === 'match' && $viewer !== null;

    // Real profiles first, seeded profiles after — then newest-first within
    // each group. Seeded profiles fill out the directory but never outrank
    // a real member.
    $sql = 'SELECT p.*, ' . lastActiveSql() . ' AS last_active_at FROM profiles p LEFT JOIN users u ON u.id = p.user_id WHERE ' . implode(' AND ', $where) . ' ORDER BY p.is_seeded ASC, p.created_at DESC' . (($paged || $sortMatch) ? '' : ' LIMIT ' . (isset($limit) ? (int)$limit : 100));
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

    // Paged mode slices AFTER the shell filter, so `total` counts only rows
    // the viewer can actually see and `hasMore` is authoritative — a short
    // page caused by filtered shells no longer looks like the end.
    $scores = [];
    if ($sortMatch) {
        try {
            $vStmt = db()->prepare('SELECT * FROM profiles WHERE user_id = ? LIMIT 1');
            $vStmt->execute([$viewer['uid']]);
            $viewerRow = $vStmt->fetch();
            if ($viewerRow !== false && !empty($viewerRow['sect'])) {
                require_once __DIR__ . '/../lib/compatibility.php';
                foreach ($rows as $r) {
                    // score(candidate, viewer) — the candidate row first,
                    // the viewer's own row second (the endpoint calls it the
                    // same way). Swapping them scores the wrong direction:
                    // the gender check, the diet/children/timeline reads and
                    // the language denominator all belong to specific sides.
                    $scores[(string)$r['user_id']] = CompatibilityService::score($r, $viewerRow)['overall'];
                }
                // Stable sort: score desc, original (newest-first) order on ties.
                $idx = 0;
                foreach ($rows as &$r) { $r['_sort_idx'] = $idx++; }
                unset($r);
                usort($rows, static function (array $a, array $b) use ($scores): int {
                    $sa = $scores[(string)$a['user_id']] ?? 0;
                    $sb = $scores[(string)$b['user_id']] ?? 0;
                    if ($sa !== $sb) return $sb <=> $sa;
                    return $a['_sort_idx'] <=> $b['_sort_idx'];
                });
                foreach ($rows as &$r) { unset($r['_sort_idx']); }
                unset($r);
                if (!$paged) {
                    // The unpaged contract is still a 100-row array — the
                    // ranking decides WHICH 100, not how many.
                    $rows = array_slice($rows, 0, 100);
                }
            }
        } catch (Throwable $e) {
            error_log('[api] match sort: ' . substr($e->getMessage(), 0, 120));
            $scores = [];
        }
    }
    $pageTotal = null;
    if ($paged) {
        $pageTotal = count($rows);
        $rows = array_slice($rows, $pageOffset, $pageLimit);
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
        // The server-side score, attached whenever it was computed — the
        // card badge is computed client-side and ignores this, but it makes
        // the ranking verifiable (and lets the client use the server number
        // for the same pair without re-implementing the formula).
        if (isset($scores[(string)$row['user_id']])) {
            $view['matchScore'] = $scores[(string)$row['user_id']];
        }
        if ($viewer !== null) {
            $view['interestSent'] = isset($sentIds[(string)($view['id'] ?? '')]);
        } else {
            $view['interestSent'] = false;
        }
        $view['favourited'] = isset($favIds[(string)($view['id'] ?? '')]);
        $list[] = $view;
    }

    if ($paged) {
        json(['rows' => $list, 'total' => $pageTotal, 'hasMore' => ($pageOffset + $pageLimit < $pageTotal)]);
    }
    json($list);
}

function profileMe(): void
{
    $user = requireAuthUser();
    $stmt = db()->prepare('SELECT p.*, ' . lastActiveSql() . ' AS last_active_at FROM profiles p LEFT JOIN users u ON u.id = p.user_id WHERE p.user_id = ? LIMIT 1');
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
            'SELECT p.*, ' . lastActiveSql() . ' AS last_active_at, f.created_at AS fav_created_at
               FROM favourites f
               JOIN profiles p ON p.user_id = f.profile_id
               LEFT JOIN users u ON u.id = p.user_id
              WHERE f.user_id = ? AND (p.is_blocked = 0 OR (p.blocked_until IS NOT NULL AND p.blocked_until <= NOW()))
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
    $probe = db()->prepare('SELECT user_id, is_demo, blocked_until FROM profiles WHERE user_id = ? AND (is_blocked = 0 OR (blocked_until IS NOT NULL AND blocked_until <= NOW())) LIMIT 1');
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
    $stmt = db()->prepare('SELECT p.*, ' . lastActiveSql() . ' AS last_active_at FROM profiles p LEFT JOIN users u ON u.id = p.user_id WHERE p.user_id = ? LIMIT 1');
    $stmt->execute([$id]);
    $row = $stmt->fetch();

    // QA/test accounts resolve to 404 from every public surface — no probing.
    if ($row) {
        $t = db()->prepare('SELECT is_test FROM users WHERE id = ? LIMIT 1');
        $t->execute([$row['user_id']]);
        if ((int)($t->fetch()['is_test'] ?? 0) === 1) $row = false;
    }

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
    // browse and read profiles, but cannot express interest or message until
    // they verify.

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

    // Guardian-managed profiles (2026-11-09): what is already stored, so a
    // partial save can be validated against it and an invite is only sent
    // when the guardian email is newly set or changed.
    $prevStmt = db()->prepare('SELECT management_mode, guardian_name, guardian_email FROM profiles WHERE user_id = ? LIMIT 1');
    $prevStmt->execute([(string)$user['uid']]);
    $prevRow = $prevStmt->fetch(PDO::FETCH_ASSOC) ?: ['management_mode' => null, 'guardian_name' => null, 'guardian_email' => null];

    // Validation parity with profileMutations.js.
    $age = ($b['age'] ?? null) === null || $b['age'] === '' ? null : (int)$b['age'];
    if ($age !== null && (!ctype_digit((string)$b['age']) || $age < 18 || $age > 100)) {
        je('Age must be between 18 and 100.', 400);
    }
    if (!empty($b['gender']) && !in_array($b['gender'], ['male', 'female'], true)) {
        je('Invalid gender.', 400);
    }
    if (!empty($b['seekingGender']) && !in_array($b['seekingGender'], ['male', 'female'], true)) {
        je('Invalid seekingGender.', 400);
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

    // Profile depth (2026-11-10): the audit's Layer 2 fields. Fixed lists
    // are validated against the same values the onboarding wizard offers —
    // a direct API call cannot store a value the UI could never show.
    // Hobbies accept an array (joined) or a comma string. Preference ranges
    // are checked against the STORED side too, so updating only the max
    // cannot invert a range the member already has.
    $depthLists = [
        'residencyStatus' => ['Citizen', 'Permanent resident', 'Work visa', 'Student visa', 'Other visa', 'Prefer not to say'],
        'build'           => ['Slim', 'Athletic', 'Average build', 'Heavyset', 'Prefer not to say'],
        'convertStatus'   => ['Born Muslim', 'Revert to Islam', 'Prefer not to say'],
    ];
    foreach ($depthLists as $field => $allowed) {
        if (array_key_exists($field, $b) && $b[$field] !== null && $b[$field] !== '' && !in_array($b[$field], $allowed, true)) {
            je("Invalid $field.", 400);
        }
    }
    if (!empty($b['educationField']) && strlen((string)$b['educationField']) > 120) je('Field of study must be under 120 characters.', 400);
    if (!empty($b['educationInstitution']) && strlen((string)$b['educationInstitution']) > 160) je('Institution must be under 160 characters.', 400);
    if (!empty($b['employer']) && strlen((string)$b['employer']) > 160) je('Employer must be under 160 characters.', 400);
    if (!empty($b['prefLocation']) && strlen((string)$b['prefLocation']) > 120) je('Location preference must be under 120 characters.', 400);
    if (!empty($b['prefMustHaves']) && strlen((string)$b['prefMustHaves']) > 1000) je('Must-haves must be under 1000 characters.', 400);
    if (array_key_exists('hobbies', $b)) {
        if (is_array($b['hobbies'])) {
            $b['hobbies'] = implode(', ', array_values(array_filter(array_map('trim', array_map('strval', $b['hobbies'])), static fn($s) => $s !== '')));
        }
        if (is_string($b['hobbies']) && strlen($b['hobbies']) > 500) je('Hobbies must be under 500 characters.', 400);
    }
    foreach (['prefAgeMin', 'prefAgeMax'] as $f) {
        if (array_key_exists($f, $b) && $b[$f] !== null && $b[$f] !== '') {
            $v = (int)$b[$f];
            if ($v < 18 || $v > 100) je('Preferred age must be between 18 and 100.', 400);
            $b[$f] = $v;
        }
    }
    $effAgeMin = array_key_exists('prefAgeMin', $b) ? $b['prefAgeMin'] : ($prevRow['pref_age_min'] ?? null);
    $effAgeMax = array_key_exists('prefAgeMax', $b) ? $b['prefAgeMax'] : ($prevRow['pref_age_max'] ?? null);
    if ($effAgeMin !== null && $effAgeMax !== null && $effAgeMin !== '' && $effAgeMax !== '' && (int)$effAgeMin > (int)$effAgeMax) {
        je('Preferred age range is reversed.', 400);
    }
    foreach (['prefHeightMinCm', 'prefHeightMaxCm'] as $f) {
        if (array_key_exists($f, $b) && $b[$f] !== null && $b[$f] !== '') {
            $v = (int)$b[$f];
            if ($v < 120 || $v > 250) je('Preferred height must be between 120 and 250 cm.', 400);
            $b[$f] = $v;
        }
    }
    $effHMin = array_key_exists('prefHeightMinCm', $b) ? $b['prefHeightMinCm'] : ($prevRow['pref_height_min_cm'] ?? null);
    $effHMax = array_key_exists('prefHeightMaxCm', $b) ? $b['prefHeightMaxCm'] : ($prevRow['pref_height_max_cm'] ?? null);
    if ($effHMin !== null && $effHMax !== null && $effHMin !== '' && $effHMax !== '' && (int)$effHMin > (int)$effHMax) {
        je('Preferred height range is reversed.', 400);
    }

    // Guardian fields (2026-11-09): a guardian-managed profile needs a
    // guardian name and a reachable email — enforced here, not only in the
    // wizard, so a direct API call cannot create one with nobody to invite.
    // Effective values are the provided ones, falling back to what is already
    // stored (an explicitly-sent empty string clears); a partial save is not
    // rejected for a value that is already on file.
    if (!empty($b['managementMode']) && !in_array($b['managementMode'], ['self', 'guardian'], true)) {
        je('Invalid managementMode.', 400);
    }
    if (array_key_exists('guardianEmail', $b) && $b['guardianEmail'] !== null && $b['guardianEmail'] !== '' && !validEmail((string)$b['guardianEmail'])) {
        je('Enter a valid guardian email.', 400);
    }
    if (!empty($b['guardianName']) && strlen((string)$b['guardianName']) > 120) {
        je('Guardian name must be under 120 characters.', 400);
    }
    $effMode = $b['managementMode'] ?? $prevRow['management_mode'] ?? null;
    if ($effMode === 'guardian') {
        $effEmail = array_key_exists('guardianEmail', $b)
            ? (($b['guardianEmail'] === '' || $b['guardianEmail'] === null) ? null : (string)$b['guardianEmail'])
            : (string)($prevRow['guardian_email'] ?? '');
        $effName = array_key_exists('guardianName', $b)
            ? (($b['guardianName'] === '' || $b['guardianName'] === null) ? null : (string)$b['guardianName'])
            : (string)($prevRow['guardian_name'] ?? '');
        if ($effEmail === null || trim($effEmail) === '' || !validEmail($effEmail)) {
            je('A guardian email is required for a guardian-managed profile.', 400);
        }
        if ($effName === null || trim($effName) === '') {
            je('A guardian name is required for a guardian-managed profile.', 400);
        }
    }
    // Switching back to self-managed clears the stored guardian details —
    // a self-managed profile has no guardian to invite.
    if (($b['managementMode'] ?? null) === 'self') {
        $b['guardianName'] = null;
        $b['guardianEmail'] = null;
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

    // Hide-any-field (2026-11-09): the member may hide ANY profile detail
    // from other viewers. Accepts `hiddenFields` (camelCase, what the
    // Settings UI sends) or `hidden_fields`. Keys are the payload keys
    // visibleProfile() returns — 'heightCm' for height, 'children' for
    // childrenStatus, 'expectations' for "what I'm looking for". Validated
    // against the allowlist, unknown keys dropped, stored as JSON text.
    // 'citizenships' is accepted although it has no display surface yet
    // (never stored) — the toggle is harmless until that field is stored.
    $hiddenRaw = $b['hiddenFields'] ?? $b['hidden_fields'] ?? null;
    if ($hiddenRaw !== null) {
        if (is_string($hiddenRaw)) {
            $decoded = json_decode($hiddenRaw, true);
            $hiddenRaw = is_array($decoded) ? $decoded : null;
        }
        if (!is_array($hiddenRaw)) {
            je('hiddenFields must be an array of field names.', 400);
        }
        $hiddenAllowed = ['age', 'gender', 'seekingGender', 'heightCm', 'city', 'country',
            'maritalStatus', 'sect', 'religiosity', 'prayer', 'modesty', 'diet', 'syedStatus',
            'ethnicity', 'subEthnicity', 'languages', 'citizenships', 'educationLevel',
            'profession', 'incomeRange', 'timeline', 'relocation', 'familyInvolvement',
            'children', 'childrenPlans', 'bio', 'expectations', 'aboutFamily',
            // Profile depth (2026-11-10): every new display field is
            // hideable. 'video' is server-allowlist-only — it is governed
            // by its photo tier, not a toggle; accepting the key keeps a
            // client that sends it from silently losing the rest of the
            // list. 'lastActive' is NOT accepted (removed 2026-11-10,
            // Syed's explicit order): last login is always visible and a
            // member can never hide it — applyHiddenFields() also strips
            // it from any list stored before the rule.
            'educationField', 'educationInstitution', 'employer', 'residencyStatus',
            'build', 'hobbies', 'convertStatus',
            'prefAgeMin', 'prefAgeMax', 'prefHeightMinCm', 'prefHeightMaxCm',
            'prefEducation', 'prefLocation', 'prefMustHaves',
            'video'];
        $hiddenClean = array_values(array_unique(array_intersect(
            array_map('strval', $hiddenRaw), $hiddenAllowed)));
        $b['hidden_fields'] = $hiddenClean === [] ? null : json_encode($hiddenClean);
        unset($b['hiddenFields']);
    }

    // Notification preferences (2026-11-09): the Settings toggles, stored
    // server-side so the mailer can respect them. Accepts `notificationPrefs`
    // (camelCase, what Settings sends) or `notification_prefs`. Only the
    // seven known keys are kept; anything else is dropped, and values are
    // coerced to booleans so a string "false" can never store as truthy.
    $prefsRaw = $b['notificationPrefs'] ?? $b['notification_prefs'] ?? null;
    if ($prefsRaw !== null) {
        if (is_string($prefsRaw)) {
            $decoded = json_decode($prefsRaw, true);
            $prefsRaw = is_array($decoded) ? $decoded : null;
        }
        if (!is_array($prefsRaw)) {
            je('notificationPrefs must be an object of toggle names.', 400);
        }
        $prefsAllowed = ['emailMessages', 'emailMatches', 'emailInterests', 'emailWeeklyDigest',
            'pushMessages', 'pushMatches', 'pushProfileViews'];
        $prefsClean = [];
        foreach ($prefsAllowed as $k) {
            if (array_key_exists($k, $prefsRaw)) {
                $prefsClean[$k] = !empty($prefsRaw[$k]) && $prefsRaw[$k] !== 'false' && $prefsRaw[$k] !== '0' ? 1 : 0;
            }
        }
        $b['notification_prefs'] = $prefsClean === [] ? null : json_encode($prefsClean);
        unset($b['notificationPrefs']);
    }

    $cols = ['display_name', 'displayName', 'age', 'gender', 'seekingGender', 'city', 'country',
        'sect', 'profession', 'bio', 'expectations', 'aboutFamily',
        'visibility', 'photos_visibility', 'photosVisibility',
        'contact_visibility', 'contactVisibility',
        // Fields onboarding collects. These columns were added by
        // migrateAddProfileColumns(); without this mapping the answers were
        // accepted by the form and silently thrown away on save.
        'religiosity', 'educationLevel', 'marja', 'prayer', 'modesty', 'diet',
        'languages', 'citizenships', 'ethnicity', 'sub_ethnicity', 'subEthnicity', 'incomeRange', 'maritalStatus', 'children',
        'childrenPlans', 'relocation', 'familyInvolvement', 'heightCm', 'timeline',
        'photoUrl', 'syedStatus', 'username',
        // Profile depth (2026-11-10): education detail, employer, residency,
        // build, hobbies, convert status, structured partner preferences.
        // 'video' is NOT here — the video URL is set only by the validated
        // upload endpoint, never by a direct profile save.
        'educationField', 'educationInstitution', 'employer', 'residencyStatus',
        'build', 'hobbies', 'convertStatus',
        'prefAgeMin', 'prefAgeMax', 'prefHeightMinCm', 'prefHeightMaxCm',
        'prefEducation', 'prefLocation', 'prefMustHaves',
        // Guardian management (2026-11-09). managementMode is the only one
        // of the three ever exposed publicly (via visibleProfile); the
        // guardian's name/email stay server-side.
        'managementMode', 'guardianName', 'guardianEmail',
        // Hide-any-field (2026-11-09). Normalized to a JSON string (or null)
        // above, so the $sets loop stores it as plain text.
        'hidden_fields',
        // Notification preferences (2026-11-09). Normalized to a JSON string
        // (or null) above, so the $sets loop stores it as plain text.
        'notification_prefs',
        // Privacy toggles + contact phone (2026-11-09, P0 batch). These were
        // collected in Settings but never sent to the server — the save wrote
        // localStorage and only the bio reached the API.
        'contactPhone', 'blockUnverified', 'allowFamilyView'];

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
        'phone'              => 'contactPhone',
        // Profile depth (2026-11-10): snake_case spellings of the new keys.
        'education_field'       => 'educationField',
        'education_institution' => 'educationInstitution',
        'residency_status'      => 'residencyStatus',
        'convert_status'        => 'convertStatus',
        'pref_age_min'          => 'prefAgeMin',
        'pref_age_max'          => 'prefAgeMax',
        'pref_height_min_cm'    => 'prefHeightMinCm',
        'pref_height_max_cm'    => 'prefHeightMaxCm',
        'pref_education'        => 'prefEducation',
        'pref_location'         => 'prefLocation',
        'pref_must_haves'       => 'prefMustHaves',
    ];
    // Privacy toggles arrive as JSON booleans; the columns are TINYINT.
    // Normalize here so a string "false" can never store as truthy.
    foreach (['blockUnverified', 'allowFamilyView'] as $toggle) {
        if (array_key_exists($toggle, $b)) {
            $b[$toggle] = !empty($b[$toggle]) && $b[$toggle] !== 'false' && $b[$toggle] !== '0' ? 1 : 0;
        }
    }
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
            'seekingGender' => 'seeking_gender',
            'subEthnicity' => 'sub_ethnicity',
            'managementMode' => 'management_mode',
            'guardianName' => 'guardian_name',
            'guardianEmail' => 'guardian_email',
            'contactPhone' => 'contact_phone',
            'blockUnverified' => 'block_unverified',
            'allowFamilyView' => 'allow_family_view',
            // Profile depth (2026-11-10).
            'educationField' => 'education_field',
            'educationInstitution' => 'education_institution',
            'residencyStatus' => 'residency_status',
            'convertStatus' => 'convert_status',
            'prefAgeMin' => 'pref_age_min',
            'prefAgeMax' => 'pref_age_max',
            'prefHeightMinCm' => 'pref_height_min_cm',
            'prefHeightMaxCm' => 'pref_height_max_cm',
            'prefEducation' => 'pref_education',
            'prefLocation' => 'pref_location',
            'prefMustHaves' => 'pref_must_haves',
            default => $key,
        };
        $v = in_array($key, ['age', 'heightCm'], true) && $b[$key] !== null && $b[$key] !== ''
            ? (int)$b[$key]
            : ($b[$key] === '' ? null : $b[$key]);
        // Delegate to ProfileService: normalizes "hyderabad" → "Hyderabad",
        // splits "Hyderabad, India" into city + country.
        if (in_array($key, ['city', 'country'], true) && is_string($v)) {
            $tmp = [$key => $v, 'country' => $b['country'] ?? null];
            ProfileService::normalizeLocation($tmp);
            $v = $tmp[$key];
            if ($key === 'city' && !empty($tmp['country']) && empty($b['country'])) {
                $b['country'] = $tmp['country'];
            }
        }
        if ($col === 'display_name' && ($v === null || trim((string)$v) === '')) continue;
        $sets[] = "{$col} = ?";
        $values[] = $v;
    }

    // Publish gate, server-side (2026-11-09): completing a profile requires
    // a verified email. The wizard enforces this client-side, but a direct
    // API call bypassed it entirely — an unverified PUT could publish a
    // complete profile. Partial saves stay open: only the transition from
    // incomplete to complete is gated, so an unverified member can keep
    // drafting, and a profile that is already complete can still be edited.
    // "Complete" is the browse-visible minimum: city + country + bio +
    // looking-for (expectations). Values are read from the normalized
    // $sets, so a "Hyderabad, India" city that splits out a country counts.
    $eff = [];
    foreach ($sets as $i => $set) {
        $eff[explode(' = ', $set)[0]] = $values[$i];
    }
    $storedStmt = db()->prepare('SELECT city, country, bio, expectations FROM profiles WHERE user_id = ? LIMIT 1');
    $storedStmt->execute([(string)$user['uid']]);
    $storedRow = $storedStmt->fetch(PDO::FETCH_ASSOC) ?: [];
    $isComplete = static fn(array $src): bool => trim((string)($src['city'] ?? '')) !== ''
        && trim((string)($src['country'] ?? '')) !== ''
        && trim((string)($src['bio'] ?? '')) !== ''
        && trim((string)($src['expectations'] ?? '')) !== '';
    $wasComplete = $isComplete($storedRow);
    $willBeComplete = $isComplete([
        'city' => $eff['city'] ?? $storedRow['city'] ?? null,
        'country' => $eff['country'] ?? $storedRow['country'] ?? null,
        'bio' => $eff['bio'] ?? $storedRow['bio'] ?? null,
        'expectations' => $eff['expectations'] ?? $storedRow['expectations'] ?? null,
    ]);
    if (!$wasComplete && $willBeComplete && !viewerIsEmailVerified($user)) {
        je('Verify your email to publish your profile. You can keep saving a draft until then.', 403);
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
    touchLastActive($user['uid']);

    $fetch = db()->prepare('SELECT p.*, ' . lastActiveSql() . ' AS last_active_at FROM profiles p LEFT JOIN users u ON u.id = p.user_id WHERE p.user_id = ? LIMIT 1');
    $fetch->execute([$user['uid']]);
    $row = $fetch->fetch();
    if (!$row) {
        je('Could not save this profile.', 500);
    }

    // Guardian invite (2026-11-09): when the profile is guardian-managed
    // and the guardian email is newly set or changed, issue a secure wali
    // view link and email it to the guardian. Only on change — never on
    // every save. Best-effort: a mail failure must never fail the profile
    // save itself, so it is caught and logged.
    $finalMode = (string)($row['management_mode'] ?? '');
    $finalEmail = trim((string)($row['guardian_email'] ?? ''));
    $prevEmail = trim((string)($prevRow['guardian_email'] ?? ''));
    if ($finalMode === 'guardian' && $finalEmail !== '' && $finalEmail !== $prevEmail) {
        try {
            $token = randomBase64Url(24);
            db()->prepare('INSERT INTO wali_links (token, user_id) VALUES (?, ?)')->execute([$token, (string)$user['uid']]);
            $waliUrl = publicBase() . '/wali/' . $token;
            $memberName = trim((string)($row['display_name'] ?? 'A member'));
            $guardianName = trim((string)($row['guardian_name'] ?? ''));
            mailSend([
                'to' => $finalEmail,
                'subject' => $memberName . ' invited you to view their Shia Rishta profile',
                'text' => 'Assalamu alaikum' . ($guardianName !== '' ? ' ' . $guardianName : '') . ",\n\n"
                    . $memberName . " listed you as their guardian (wali) on Shia Rishta, a Shia matrimony platform, and asked us to share their profile with you.\n\n"
                    . 'View the profile here (no account needed): ' . $waliUrl . "\n\n"
                    . "This link lets you view the profile only — you cannot edit it or contact anyone through it. "
                    . "The member can revoke this link at any time.\n\n"
                    . "If this invitation was not meant for you, please ignore this email.\n\n"
                    . '— Shia Rishta',
            ]);
        } catch (Throwable $e) {
            error_log('[api] guardian invite failed for ' . (string)$user['uid'] . ': ' . substr($e->getMessage(), 0, 120));
        }
    }

    // Return the whitelisted owner payload, never the raw row (2026-11-09):
    // the raw row leaked guardian_email and the photo_url filesystem path
    // to the owner — both are server-side only. visibleProfile() for the
    // owner returns exactly what Settings and onboarding need (their own
    // marja, contact phone, privacy toggles and notification prefs).
    $saved = visibleProfile($row, $user);
    json(['ok' => true, 'profile' => $saved ?? []]);
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

    // Verification gates CONTACT: an unverified member can browse and read
    // profiles, but expressing interest is a real action that requires a
    // verified email. A direct API call used to bypass the client-side
    // gate entirely and return 200.
    if (!viewerIsEmailVerified($user)) {
        je('Verify your email to express interest.', 403);
    }

    // Spam limits (2026-11-10, external-audit fixes): per-user, not per-IP
    // — cip() is the shared proxy IP, so the IP bucket is effectively
    // global. 10 interests/min, 30/day.
    perUserRateCheck((string)$user['uid'], 'interests', 'from_user_id', 60, 10, 'You are sending interests quickly — please slow down and try again in a minute.');
    perUserRateCheck((string)$user['uid'], 'interests', 'from_user_id', 86400, 30, 'You have sent 30 interests today. Please come back tomorrow.');

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

    // A decline sticks: if this member declined my interest, I cannot re-send.
    // Without this, declining would be undone by one more tap on the card.
    $declined = db()->prepare('SELECT 1 FROM interest_declines WHERE decliner_id = ? AND sender_id = ? LIMIT 1');
    $declined->execute([$id, $user['uid']]);
    if ($declined->fetch()) {
        je('This member declined your interest.', 403);
    }

    // A block in either direction stops interest (2026-11-09, P0 batch).
    // The message names the blocker's own action; the blocked side hears
    // only that the member is unavailable.
    if (isBlockedBetween($user['uid'], $id)) {
        if (didBlock($user['uid'], $id)) {
            je('You have blocked this member. Unblock them to send interest.', 403);
        }
        je('This member is not available.', 403);
    }

    // "Block unverified members": the target only accepts interest from
    // members whose email is verified.
    $targetPrefs = db()->prepare('SELECT block_unverified FROM profiles WHERE user_id = ? LIMIT 1');
    $targetPrefs->execute([$id]);
    $targetRow = $targetPrefs->fetch();
    if (!empty($targetRow['block_unverified']) && !viewerIsEmailVerified($user)) {
        je('This member only accepts interest from verified members.', 403);
    }

    // Idempotent: PK conflict on (from,to) is a no-op, like ON CONFLICT DO NOTHING.
    $insert = db()->prepare('INSERT IGNORE INTO interests (from_user_id, to_user_id) VALUES (?, ?)');
    $insert->execute([$user['uid'], $id]);
    touchLastActive((string)$user['uid']);

    $mutual = db()->prepare('SELECT 1 FROM interests WHERE from_user_id = ? AND to_user_id = ? LIMIT 1');
    $mutual->execute([$id, $user['uid']]);
    $mirrored = (bool)$mutual->fetch();

    // Notify the recipient of the new interest (or the match, if mutual).
    $fromName = db()->prepare('SELECT display_name FROM profiles WHERE user_id = ? LIMIT 1');
    $fromName->execute([$user['uid']]);
    $nameRow = $fromName->fetch();
    $senderName = $nameRow['display_name'] ?? 'Someone';
    if ($mirrored) {
        // The completing side's notification must name the OTHER person.
        // $senderName is this member's own name — using it here told the
        // member they had matched with themselves.
        $otherName = db()->prepare('SELECT display_name FROM profiles WHERE user_id = ? LIMIT 1');
        $otherName->execute([$id]);
        $otherRow = $otherName->fetch();
        $targetName = $otherRow['display_name'] ?? 'Someone';
        notifyUser($id, 'match', 'It\'s a mutual match!', $senderName . ' also expressed interest. Start a conversation.', $user['uid']);
        notifyUser($user['uid'], 'match', 'It\'s a mutual match!', 'You and ' . $targetName . ' both expressed interest.', $id);
    } else {
        notifyUser($id, 'interest', 'New interest received', $senderName . ' expressed interest in your profile.', $user['uid']);
    }

    json(['success' => true, 'matched' => $mirrored]);
}

// Decline a received interest. Deletes the sender's interest row so the
// request disappears for good, and records the decline so the sender cannot
// re-express interest afterwards. No notification is sent to the sender —
// a decline is a quiet pass, not a message. Idempotent: declining twice, or
// declining after the sender withdrew, is a success with nothing left to do.
function profileDecline(string $id): void
{
    $user = requireAuthUser();
    if ($id === (string)$user['uid']) {
        je('You cannot decline interest from yourself.', 400);
    }
    $row = db()->prepare('SELECT 1 FROM interests WHERE from_user_id = ? AND to_user_id = ? LIMIT 1');
    $row->execute([$id, $user['uid']]);
    if ($row->fetch()) {
        db()->prepare('DELETE FROM interests WHERE from_user_id = ? AND to_user_id = ?')->execute([$id, $user['uid']]);
        db()->prepare('INSERT IGNORE INTO interest_declines (decliner_id, sender_id) VALUES (?, ?)')->execute([$user['uid'], $id]);
    }
    json(['success' => true, 'declined' => true]);
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
    // Email mirror (2026-11-09): the Settings toggles used to promise emails
    // that were never sent — notifications only ever inserted in-app rows.
    // The in-app row above is the record; the email is best-effort and
    // respects the recipient's stored pref (NotificationService::maybeEmail).
    $event = ['interest' => 'interest', 'match' => 'match', 'message' => 'message'][$type] ?? null;
    if ($event !== null) {
        NotificationService::maybeEmail($userId, $event, $title, $body ?? '');
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

