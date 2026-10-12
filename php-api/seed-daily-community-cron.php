<?php
/**
 * HTTP trigger for the daily community seeder.
 *
 * Called by GitHub Actions cron via:
 *   curl -H "X-Seeder-Cron-Key: <SEEDER_CRON_KEY>" https://shiarishta.com/api/seed-daily-community-cron.php
 *
 * Same SEEDER_CRON_KEY as the profile seeder. Runs on the server so it has
 * direct DB access.
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

define('SEEDER_INCLUDED', true);
ob_start();
$seederExitCode = 0;
try {
    require __DIR__ . '/seed-daily-community.php';
} catch (Throwable $e) {
    $seederExitCode = 1;
    echo "ERROR: " . $e->getMessage() . "\n";
}
$output = ob_get_clean();

echo json_encode([
    'ok' => $seederExitCode === 0,
    'output' => $output,
]);
