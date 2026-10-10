<?php
/**
 * HTTP trigger for the daily profile seeder.
 *
 * Called by GitHub Actions cron via:
 *   curl -H "X-Seeder-Key: <SEEDER_CRON_KEY>" https://shiarishta.com/api/seed-daily-cron.php
 *
 * The key is compared against the SEEDER_CRON_KEY env var (set in .env on server).
 * Runs on the server so it has direct DB + filesystem access.
 */

header('Content-Type: application/json');

$provided = $_SERVER['HTTP_X_SEEDER_KEY'] ?? '';
$expected = getenv('SEEDER_CRON_KEY') ?: '';

if ($expected === '' || !hash_equals($expected, $provided)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Forbidden']);
    exit;
}

// Capture the seeder's output
ob_start();
$exitCode = 0;
try {
    require __DIR__ . '/seed-daily-profiles.php';
} catch (Throwable $e) {
    $exitCode = 1;
    echo "ERROR: " . $e->getMessage() . "\n";
}
$output = ob_get_clean();

echo json_encode([
    'ok' => $exitCode === 0,
    'output' => $output,
]);
