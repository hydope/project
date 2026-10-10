<?php
/**
 * One-off: backfill profile photos for seeded profiles that have none.
 * Finds seeded profiles with empty photo_url (or missing file), assigns a
 * gender-matched photo from the uploads/seeded/ pool, and sets visibility
 * to public. Delete after use.
 */

header('Content-Type: application/json');

$envFile = __DIR__ . '/.env';
if (file_exists($envFile)) {
    foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $l) {
        $l = trim($l);
        if ($l === '' || $l[0] === '#') continue;
        if (strpos($l, '=') !== false) {
            [$k, $v] = explode('=', $l, 2);
            putenv(trim($k) . '=' . trim($v));
        }
    }
}

$provided = $_SERVER['HTTP_X_SEEDER_CRON_KEY'] ?? '';
$expected = getenv('SEEDER_CRON_KEY') ?: '';
if ($expected === '' || !hash_equals($expected, $provided)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Forbidden']);
    exit;
}

require_once __DIR__ . '/lib/db.php';

$FEMALE_PHOTOS = ['female-01.webp', 'female-02.webp', 'female-03.webp', 'female-04.webp'];
$MALE_PHOTOS = ['male-01.webp', 'male-02.webp', 'male-03.webp', 'male-04.webp'];

try {
    $db = db();
    $stmt = $db->query(
        "SELECT p.user_id, p.photo_url, u.display_name,
                (SELECT gender FROM profiles WHERE user_id = p.user_id) AS gender
         FROM profiles p
         JOIN users u ON u.id = p.user_id
         WHERE u.email LIKE 'seeded-%@shiarishta.com'"
    );
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $fixed = [];
    $skipped = 0;
    foreach ($rows as $row) {
        $needsPhoto = empty($row['photo_url']) || !file_exists($row['photo_url']);
        if (!$needsPhoto) { $skipped++; continue; }

        // Determine gender from profiles table
        $g = $db->prepare("SELECT gender FROM profiles WHERE user_id = ? LIMIT 1");
        $g->execute([$row['user_id']]);
        $gender = strtolower((string)$g->fetchColumn());

        $pool = $gender === 'male' ? $MALE_PHOTOS : $FEMALE_PHOTOS;
        $photoFile = $pool[array_rand($pool)];
        $src = __DIR__ . '/uploads/seeded/' . $photoFile;
        if (!file_exists($src)) continue;

        $destDir = __DIR__ . '/uploads/photos/' . $row['user_id'];
        if (!is_dir($destDir)) @mkdir($destDir, 0755, true);
        $dest = $destDir . '/profile.webp';
        if (!@copy($src, $dest)) continue;

        $upd = $db->prepare(
            "UPDATE profiles SET photo_url = ?, photos_visibility = 'public',
             updated_at = UTC_TIMESTAMP() WHERE user_id = ?"
        );
        $upd->execute([$dest, $row['user_id']]);
        $fixed[] = $row['display_name'] . ' <- ' . $photoFile;
    }

    echo json_encode(['ok' => true, 'fixed' => $fixed, 'already_had_photo' => $skipped]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => substr($e->getMessage(), 0, 200)]);
}
