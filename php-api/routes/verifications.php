<?php
// Verification submissions (member side) — parity with server/routes/verifications.js.
// Files stay on disk under UPLOAD_DIR (outside any web root); bytes are served
// ONLY to admins through routes/admin.php.
declare(strict_types=1);

function routeVerifications(string $method, array $segments): void
{
    if ($method === 'POST' && ($segments[0] ?? null) === null) { verificationSubmit(); return; }
    if ($method === 'GET' && ($segments[0] ?? null) === 'mine') { verificationMine(); return; }

    json(['error' => 'Verification endpoint not found'], 404);
}

function verificationSubmit(): void
{
    $user = requireAuthUser();
    $payload = requestJson();
    $kind = trim((string)($payload['kind'] ?? ''));
    $imageBase64 = trim((string)($payload['imageBase64'] ?? ''));

    if (!in_array($kind, ['selfie', 'id_document'], true)) {
        je('Choose selfie or ID document.', 400);
    }

    $normalized = preg_replace('/^data:image\/(png|jpe?g|webp);base64,/i', '', $imageBase64);
    if ($normalized === null || $normalized === '') {
        je('Attach a photo to verify.', 400);
    }

    $bytes = base64_decode($normalized, true);
    if ($bytes === false || strlen($bytes) === 0 || strlen($bytes) > 1_500_000) {
        je('Photo must be under 1.5 MB.', 400);
    }

    $uploadDir = trim((string)(getenv('UPLOAD_DIR') ?: (__DIR__ . '/../uploads')));
    if (!is_dir($uploadDir) && !mkdir($uploadDir, 0775, true) && !is_dir($uploadDir)) {
        throw new RuntimeException('Unable to create uploads directory.');
    }

    $file = $uploadDir . DIRECTORY_SEPARATOR . 'v-' . $user['uid'] . '-' . time() . '.bin';
    // ID documents and selfies are encrypted before they touch the disk, so a
    // leaked upload directory (or a stolen backup) yields no readable image.
    if (file_put_contents($file, encBytesAtRest($bytes)) === false) {
        je('Could not save verification photo.', 500);
    }

    // App-generated UUID; MySQL has no INSERT...RETURNING, so read back after.
    $vid = uuid();
    $stmt = db()->prepare('INSERT INTO verifications (id, user_id, kind, storage_path) VALUES (?, ?, ?, ?)');
    $stmt->execute([$vid, $user['uid'], $kind, $file]);

    $fetch = db()->prepare('SELECT id, kind, status, created_at FROM verifications WHERE id = ? LIMIT 1');
    $fetch->execute([$vid]);
    $row = $fetch->fetch();

    json(['ok' => true, 'verification' => $row], 201);
}

function verificationMine(): void
{
    $user = requireAuthUser();
    // Document submissions only — account-review rows (kind='account') are
    // an admin record, not something the member submitted; showing one here
    // would render a kind the Get Verified UI does not know.
    $stmt = db()->prepare("SELECT id, kind, status, review_note, created_at, reviewed_at FROM verifications WHERE user_id = ? AND kind IN ('selfie', 'id_document') ORDER BY created_at DESC LIMIT 20");
    $stmt->execute([$user['uid']]);
    json($stmt->fetchAll());
}
