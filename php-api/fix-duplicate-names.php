<?php
/**
 * One-off: rename duplicate first names in today's seeded batch.
 * "Shabana Ali" -> "Sadia Ali", "Shabana Kazmi" -> "Zainab Kazmi".
 * Delete after use.
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

$renames = [
    'Shabana Ali' => 'Sadia Ali',
    'Shabana Kazmi' => 'Zainab Kazmi',
];

try {
    $db = db();
    $fixed = [];
    foreach ($renames as $old => $new) {
        $stmt = $db->prepare(
            "UPDATE users SET display_name = ? WHERE display_name = ? AND email LIKE 'seeded-%@shiarishta.com' LIMIT 1"
        );
        $stmt->execute([$new, $old]);
        if ($stmt->rowCount() > 0) {
            $fixed[] = "$old -> $new";
            // Keep profiles table in sync if it stores display_name
            try {
                $db->prepare("UPDATE profiles SET display_name = ? WHERE display_name = ?")
                   ->execute([$new, $old]);
            } catch (Throwable $e) {}
        }
    }
    echo json_encode(['ok' => true, 'renamed' => $fixed]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => substr($e->getMessage(), 0, 200)]);
}
