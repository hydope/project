<?php
// Matchmaker profiles: members can submit profiles for others (family, clients).
// Submissions stay invisible until an admin approves; pending submissions
// older than 7 days are deleted automatically (lazy purge).

function routeMatchmaker(string $method, array $segments): void
{
    // Photo upload for a pending submission. The upload lives under
    // /matchmaker/photo (not /profiles/me/photo) because a submission is a
    // pending JSON payload, not a profile row — the profile-photo endpoint
    // requires a profile and would 409.
    if ($method === 'POST' && ($segments[0] ?? null) === 'photo') {
        matchmakerPhotoUpload();
        return;
    }
    if ($method === 'DELETE' && ($segments[0] ?? null) === 'photo') {
        matchmakerPhotoDelete();
        return;
    }
    // Serves a pending submission's uploaded photo to its owner or an admin.
    if ($method === 'GET' && ($segments[0] ?? null) === 'photo') {
        matchmakerPhotoServe((string)($segments[1] ?? ''), (string)($segments[2] ?? ''));
        return;
    }
    if ($method === 'POST' && ($segments[0] ?? null) === null) {
        matchmakerSubmit();
        return;
    }
    if ($method === 'GET' && ($segments[0] ?? null) === 'mine') {
        matchmakerMine();
        return;
    }
    json(['error' => 'Matchmaker endpoint not found'], 404);
}

// ── Pending-submission photos ─────────────────────────────────────────────
// Uploaded matchmaker photos live under <photo root>/matchmaker/<uid>/<uuid>.<ext>:
// same storage root as profile photos (outside the web root), segregated so a
// pending photo can never be confused with a live member photo. The upload
// endpoint returns the SERVE URL (/api/matchmaker/photo/<uid>/<file>) — never
// the filesystem path — and the submit/delete/replace endpoints resolve that
// URL back to the local file server-side, so the approval path still copies
// a filesystem path into profiles.photo_url verbatim and the existing
// photoServe() serves it unchanged once the profile exists.

// A matchmaker photo is a server-generated file under
// <photo root>/matchmaker/<uid>/<uuid>.<ext>. Anything else (a pasted http
// link, a data: URI, a profile photo path) is not ours to delete or serve.
function matchmakerLocalPhotoPath(string $p): ?string
{
    if (!preg_match('#^/.+/photos/matchmaker/[0-9a-f-]{36}/[0-9a-f-]{36}\.(?:jpg|png|webp)$#', $p)) {
        return null;
    }
    return is_file($p) ? $p : null;
}

// Resolve EITHER form of a matchmaker photo reference to the local file:
// the serve URL (/api/matchmaker/photo/<uid>/<file>) the upload endpoint
// now returns, or a legacy absolute filesystem path stored before that
// change. $ownerUid, when given, must match the file's owner — a member
// can never resolve (and therefore delete or submit) another member's
// photo. Returns null for anything else (pasted http links included).
function matchmakerResolvePhotoLocal(string $p, ?string $ownerUid = null): ?string
{
    $p = trim($p);
    if ($p === '') return null;
    if (preg_match('#^/api/matchmaker/photo/([0-9a-f-]{36})/([0-9a-f-]{36}\.(?:jpg|png|webp))$#', $p, $m)) {
        if ($ownerUid !== null && $m[1] !== $ownerUid) return null;
        $local = photoBaseDir() . '/matchmaker/' . $m[1] . '/' . $m[2];
        return is_file($local) ? $local : null;
    }
    return matchmakerLocalPhotoPath($p);
}

// URL an <img> (or useAuthedImage) can render for a submission's photo:
// pasted links as-is; uploaded files via the authed serve endpoint.
function matchmakerPhotoPreviewUrl(string $photoUrl, string $submittedBy): ?string
{
    $p = trim($photoUrl);
    if ($p === '') {
        return null;
    }
    if (preg_match('#^https?://#i', $p)) {
        return $p;
    }
    // Already a serve URL (e.g. a submission stored before the resolve step
    // ran, or a form holding the upload response): it is renderable as-is.
    if (preg_match('#^/api/matchmaker/photo/[0-9a-f-]{36}/[0-9a-f-]{36}\.(?:jpg|png|webp)$#', $p)) {
        return $p;
    }
    if (!preg_match('#^/.+/photos/matchmaker/([0-9a-f-]{36})/([0-9a-f-]{36}\.(?:jpg|png|webp))$#', $p, $m)) {
        return null;
    }
    if (!is_file($p)) {
        return null;
    }
    return '/api/matchmaker/photo/' . $m[1] . '/' . $m[2];
}

// POST /api/matchmaker/photo — upload a photo for a pending submission.
//
// Mirrors the member photoUpload() validation pipeline step for step:
// multipart read, 5 MB cap, byte-sniffed mime, decode check, pixel cap,
// structural completeness, EXIF strip. The file is written under the
// submitter's matchmaker directory with a server-generated name (the client
// filename is never used). No profile row is needed. The response returns
// the SERVE URL as photo_url — never the filesystem path (2026-11-09: the
// old response leaked the absolute server path) — and the submit endpoint
// resolves that URL back to the local file before storing it, so the
// approval path still copies a filesystem path into profiles.photo_url.
function matchmakerPhotoUpload(): void
{
    $user = requireAuthUser();
    $uid = (string)$user['uid'];
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

    // 2. Confirm it really decodes, and get the real dimensions.
    $info = @getimagesizefromstring($bytes);
    if ($info === false || (int)$info[0] < 1 || (int)$info[1] < 1) {
        je('That file is not a readable image.', 400);
    }
    if ((int)$info[0] * (int)$info[1] > PHOTO_MAX_PIXELS) {
        je('Photo resolution is too large.', 400);
    }

    // 2b. Structural completeness — refuse trailing-byte payloads outright.
    if (!imageIsComplete($bytes, $mime)) {
        je('That file is not a complete image.', 400);
    }

    // 3. Strip EXIF (selfies carry GPS coordinates).
    $bytes = stripJpegExif($bytes);
    $ext = PHOTO_ALLOWED[$mime];

    // 4. Write it under the submitter's matchmaker directory.
    $dir = photoBaseDir() . '/matchmaker/' . $uid;
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
        error_log(sprintf('[api] matchmaker photo mkdir failed for uid=%s', $uid));
        je('Could not save your photo — server storage is not writable.', 500);
    }
    $path = $dir . '/' . uuid() . '.' . $ext;
    if (@file_put_contents($path, $bytes) === false) {
        error_log(sprintf('[api] matchmaker photo write failed path=%s bytes=%d', $path, strlen($bytes)));
        je('Could not save your photo.', 500);
    }

    // 5. A replaced upload leaves its file behind with nothing referencing
    // it. The client sends the previous photo reference — a serve URL, or a
    // legacy filesystem path from an older form — and it is resolved (own
    // files only) before unlinking.
    $prev = trim((string)($_POST['previous_path'] ?? ''));
    if ($prev !== '') {
        $old = matchmakerResolvePhotoLocal($prev, $uid);
        if ($old !== null && $old !== $path) {
            @unlink($old);
        }
    }

    auditLog('matchmaker.photo_uploaded', 'matchmaker_photo', basename($path), ['by' => $uid]);
    $serveUrl = '/api/matchmaker/photo/' . $uid . '/' . basename($path);
    json(['ok' => true, 'photo_url' => $serveUrl, 'preview_url' => $serveUrl], 201);
}

// DELETE /api/matchmaker/photo — remove an uploaded-but-unsubmitted photo
// (the form's Remove button). Accepts the serve URL the upload endpoint
// returns, or a legacy filesystem path. Only the owner's own files, matched
// by the strict server-generated pattern; anything else is not ours to delete.
function matchmakerPhotoDelete(): void
{
    $user = requireAuthUser();
    $body = requestJson();
    $path = trim((string)($body['path'] ?? ''));
    $uid = (string)$user['uid'];
    $local = null;
    if (preg_match('#^/api/matchmaker/photo/([0-9a-f-]{36})/([0-9a-f-]{36}\.(?:jpg|png|webp))$#', $path, $m)) {
        if ($m[1] !== $uid) {
            je('Not found.', 404);
        }
        $candidate = photoBaseDir() . '/matchmaker/' . $m[1] . '/' . $m[2];
        $local = is_file($candidate) ? $candidate : null;
    } elseif (preg_match('#^/.+/photos/matchmaker/([0-9a-f-]{36})/[0-9a-f-]{36}\.(?:jpg|png|webp)$#', $path, $m)) {
        if ($m[1] !== $uid) {
            je('Not found.', 404);
        }
        $local = matchmakerLocalPhotoPath($path);
    } else {
        je('Nothing to remove.', 400);
    }
    if ($local !== null) {
        @unlink($local);
    }
    json(['ok' => true]);
}

// GET /api/matchmaker/photo/:uid/:file — serve a pending submission's photo.
// Owner or admin only; everyone else (including other signed-in members) gets
// the same 404, so the file's existence cannot be probed.
function matchmakerPhotoServe(string $uid, string $file): void
{
    $viewer = requireAuthUser();
    if (!preg_match('/^[0-9a-f-]{36}$/', $uid)
        || !preg_match('/^[0-9a-f-]{36}\.(jpg|png|webp)$/', $file)) {
        je('Not found.', 404);
    }
    $isOwner = (string)($viewer['uid'] ?? '') === $uid;
    if (!$isOwner && empty($viewer['isAdmin'])) {
        je('Not found.', 404);
    }
    $base = realpath(photoBaseDir() . '/matchmaker/' . $uid) ?: '';
    $real = realpath(photoBaseDir() . '/matchmaker/' . $uid . '/' . $file) ?: '';
    if ($real === '' || $base === '' || strncmp($real, $base, strlen($base)) !== 0 || !is_file($real)) {
        je('Not found.', 404);
    }
    $mime = class_exists('finfo')
        ? ((new finfo(FILEINFO_MIME_TYPE))->file($real) ?: 'application/octet-stream')
        : (sniffImageMime((string)@file_get_contents($real, false, null, 0, 16)) ?: 'application/octet-stream');
    $size = filesize($real);
    header('Content-Type: ' . $mime);
    header('Content-Length: ' . $size);
    header('Cache-Control: private, no-store, max-age=0');
    header('X-Content-Type-Options: nosniff');
    header('Content-Disposition: inline');
    readfile($real);
    exit;
}

// Delete pending submissions older than 7 days. Runs lazily on every
// matchmaker read — there is no cron on shared hosting.
function matchmakerPurgeExpired(): void
{
    try {
        $rows = db()->query(
            "SELECT payload FROM matchmaker_profiles WHERE status = 'pending' AND created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)"
        )->fetchAll();
        foreach ($rows as $r) {
            $p = json_decode((string)($r['payload'] ?? ''), true) ?: [];
            $local = matchmakerLocalPhotoPath((string)($p['photo_url'] ?? ''));
            if ($local !== null) {
                @unlink($local);
            }
        }
        db()->prepare("DELETE FROM matchmaker_profiles WHERE status = 'pending' AND created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)")
            ->execute();
    } catch (Throwable) { /* table may not exist yet */ }
}

// POST /api/matchmaker — submit a profile for someone else.
function matchmakerSubmit(): void
{
    $user = requireAuthUser();
    matchmakerPurgeExpired();
    $body = requestJson();

    $name = trim((string)($body['display_name'] ?? $body['name'] ?? ''));
    if ($name === '') {
        je('A name is required.', 400);
    }
    $gender = in_array($body['gender'] ?? '', ['male', 'female'], true) ? $body['gender'] : null;
    // Matchmaker submissions are for female profiles only, whoever submits
    // them. The gate used to check the submitter's role, so a member-role
    // account could submit a male profile straight past the client-side
    // forcing and get a 200.
    if ($gender !== 'female') {
        je('Matchmaker submissions are for female profiles only.', 403);
    }
    // The form sends the photo as the serve URL the upload endpoint
    // returned (/api/matchmaker/photo/<uid>/<file>). Resolve it back to the
    // local file before storing, so the approval path still copies a
    // filesystem path into profiles.photo_url verbatim. A pasted http(s)
    // link is stored as-is (it is not our file); anything unresolvable is
    // stored as no photo rather than a dangling reference.
    $photoUrlRaw = trim((string)($body['photo_url'] ?? ''));
    $photoUrl = '';
    if ($photoUrlRaw !== '') {
        $resolved = matchmakerResolvePhotoLocal($photoUrlRaw, (string)$user['uid']);
        if ($resolved !== null) {
            $photoUrl = $resolved;
        } elseif (preg_match('#^https?://#i', $photoUrlRaw)) {
            $photoUrl = $photoUrlRaw;
        }
    }
    $payload = [
        'display_name' => $name,
        'age' => isset($body['age']) ? (int)$body['age'] : null,
        'gender' => $gender,
        'city' => trim((string)($body['city'] ?? '')),
        'country' => trim((string)($body['country'] ?? '')),
        'bio' => trim((string)($body['bio'] ?? '')),
        'profession' => trim((string)($body['profession'] ?? '')),
        'education_level' => trim((string)($body['education_level'] ?? '')),
        'marital_status' => trim((string)($body['marital_status'] ?? '')),
        'photo_url' => $photoUrl,
        'contact_note' => trim((string)($body['contact_note'] ?? '')),
    ];

    $id = uuid();
    db()->prepare('INSERT INTO matchmaker_profiles (id, submitted_by, payload, status) VALUES (?, ?, ?, ?)')
        ->execute([$id, (string)$user['uid'], json_encode($payload, JSON_UNESCAPED_UNICODE), 'pending']);

    auditLog('matchmaker.submitted', 'matchmaker_profile', $id, ['name' => $name]);
    json(['ok' => true, 'id' => $id, 'message' => 'Submitted. An admin will review it within 7 days.']);
}

// GET /api/matchmaker/mine — my submissions and their status.
function matchmakerMine(): void
{
    $user = requireAuthUser();
    matchmakerPurgeExpired();
    try {
        $rows = db()->prepare("SELECT id, payload, status, created_at, reviewed_at FROM matchmaker_profiles WHERE submitted_by = ? ORDER BY created_at DESC LIMIT 50");
        $rows->execute([(string)$user['uid']]);
        $out = [];
        foreach ($rows->fetchAll() as $r) {
            $p = json_decode((string)$r['payload'], true) ?: [];
            $out[] = [
                'id' => $r['id'],
                'display_name' => $p['display_name'] ?? '',
                'status' => $r['status'],
                'created_at' => $r['created_at'],
            ];
        }
        json(['ok' => true, 'submissions' => $out]);
    } catch (Throwable) {
        json(['ok' => true, 'submissions' => []]);
    }
}

// ── Admin ────────────────────────────────────────────────────────────────

function routeAdminMatchmaker(string $method, array $segments): void
{
    if ($method === 'GET' && ($segments[0] ?? null) === null) {
        adminMatchmakerQueue();
        return;
    }
    $id = (string)($segments[0] ?? '');
    if ($method === 'POST' && ($segments[1] ?? null) === 'approve' && $id !== '') {
        adminMatchmakerApprove($id);
        return;
    }
    if ($method === 'POST' && ($segments[1] ?? null) === 'reject' && $id !== '') {
        adminMatchmakerReject($id);
        return;
    }
    json(['error' => 'Matchmaker admin endpoint not found'], 404);
}

// GET /api/admin/matchmaker — pending queue (expired auto-purged first).
function adminMatchmakerQueue(): void
{
    matchmakerPurgeExpired();
    try {
        $rows = db()->query(
            "SELECT m.id, m.submitted_by, m.payload, m.status, m.created_at, u.email AS submitter_email
             FROM matchmaker_profiles m LEFT JOIN users u ON u.id = m.submitted_by
             WHERE m.status = 'pending' ORDER BY m.created_at ASC LIMIT 100"
        )->fetchAll();
    } catch (Throwable) {
        json(['ok' => true, 'queue' => []]);
        return;
    }
    $out = [];
    foreach ($rows as $r) {
        $payload = json_decode((string)$r['payload'], true) ?: [];
        $out[] = [
            'id' => $r['id'],
            'payload' => $payload,
            'submitter_email' => $r['submitter_email'] ?? '',
            'created_at' => $r['created_at'],
            // Renderable photo for review: pasted links as-is, uploaded files
            // via the authed serve endpoint (null when there is no photo).
            'photo_preview' => matchmakerPhotoPreviewUrl((string)($payload['photo_url'] ?? ''), (string)$r['submitted_by']),
            // Days left before automatic deletion.
            'expires_in_days' => max(0, 7 - (int)floor((time() - strtotime((string)$r['created_at'])) / 86400)),
        ];
    }
    json(['ok' => true, 'queue' => $out]);
}

// POST /api/admin/matchmaker/:id/approve — publish as a browsable profile.
function adminMatchmakerApprove(string $id): void
{
    $admin = requireAdminUser();
    $stmt = db()->prepare("SELECT * FROM matchmaker_profiles WHERE id = ? AND status = 'pending' LIMIT 1");
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) {
        je('Submission not found or already reviewed.', 404);
    }
    $p = json_decode((string)$row['payload'], true) ?: [];

    $profileId = uuid();
    try {
        db()->prepare(
            'INSERT INTO profiles (user_id, display_name, age, gender, city, country, bio, profession, education_level, marital_status, photo_url, is_matchmaker, matchmaker_by, seeking_gender) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)'
        )->execute([
            $profileId,
            (string)($p['display_name'] ?? 'Member'),
            $p['age'] ?? null,
            $p['gender'] ?? null,
            $p['city'] ?? null,
            $p['country'] ?? null,
            $p['bio'] ?? null,
            $p['profession'] ?? null,
            $p['education_level'] ?? null,
            $p['marital_status'] ?? null,
            $p['photo_url'] ?? null,
            (string)$row['submitted_by'],
            // A matchmaker profile seeks the opposite gender of the person listed.
            ($p['gender'] ?? '') === 'male' ? 'female' : (($p['gender'] ?? '') === 'female' ? 'male' : null),
        ]);
    } catch (Throwable $e) {
        je('Could not publish the profile.', 500);
    }

    db()->prepare("UPDATE matchmaker_profiles SET status = 'approved', reviewed_at = NOW(), reviewed_by = ? WHERE id = ?")
        ->execute([(string)($admin['uid'] ?? $admin['id'] ?? ''), $id]);

    auditLog('matchmaker.approved', 'matchmaker_profile', $id, ['profile_id' => $profileId]);
    json(['ok' => true, 'profile_id' => $profileId]);
}

// POST /api/admin/matchmaker/:id/reject — decline (deleted, not kept).
function adminMatchmakerReject(string $id): void
{
    $admin = requireAdminUser();
    $body = requestJson();
    $reason = trim((string)($body['reason'] ?? ''));
    $stmt = db()->prepare("SELECT payload FROM matchmaker_profiles WHERE id = ? AND status = 'pending' LIMIT 1");
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) {
        je('Submission not found or already reviewed.', 404);
    }
    // A rejected upload leaves its file behind with nothing referencing it.
    $p = json_decode((string)($row['payload'] ?? ''), true) ?: [];
    $local = matchmakerLocalPhotoPath((string)($p['photo_url'] ?? ''));
    if ($local !== null) {
        @unlink($local);
    }
    db()->prepare('DELETE FROM matchmaker_profiles WHERE id = ?')->execute([$id]);
    auditLog('matchmaker.rejected', 'matchmaker_profile', $id, ['reason' => $reason]);
    json(['ok' => true]);
}
