<?php
/**
 * HTTP trigger for the daily profile seeder.
 *
 * Called by GitHub Actions cron via:
 *   curl -H "X-Seeder-Cron-Key: <SEEDER_CRON_KEY>" https://shiarishta.com/api/seed-daily-cron.php
 *
 * The key is compared against the SEEDER_CRON_KEY env var (set in .env on server).
 * Runs on the server so it has direct DB + filesystem access.
 */

header('Content-Type: application/json');

$provided = $_SERVER['HTTP_X_SEEDER_CRON_KEY'] ?? '';
$expected = getenv('SEEDER_CRON_KEY') ?: '';

if ($expected === '' || !hash_equals($expected, $provided)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Forbidden']);
    exit;
}

// Capture the seeder's output
// Define SEEDER_INCLUDED so the seeder doesn't try to exit() itself
define('SEEDER_INCLUDED', true);
ob_start();
$seederExitCode = 0;
try {
    require __DIR__ . '/seed-daily-profiles.php';
} catch (Throwable $e) {
    $seederExitCode = 1;
    echo "ERROR: " . $e->getMessage() . "\n";
}
$output = ob_get_clean();

echo json_encode([
    'ok' => $seederExitCode === 0,
    'output' => $output,
]);
