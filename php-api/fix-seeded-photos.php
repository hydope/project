<?php
/**
 * One-off: set photos_visibility='public' on today's seeded profiles
 * so their photos display in the directory.
 * Delete after use.
 */

header('Content-Type: application/json');

// Load .env
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

try {
    $db = db();
    $stmt = $db->prepare(
        "UPDATE profiles SET photos_visibility = 'public', updated_at = UTC_TIMESTAMP()
         WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'seeded-%@shiarishta.com')
         AND photos_visibility <> 'public'"
    );
    $stmt->execute();
    $fixed = $stmt->rowCount();
    echo json_encode(['ok' => true, 'fixed' => $fixed]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => substr($e->getMessage(), 0, 200)]);
}
