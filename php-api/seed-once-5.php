<?php
/**
 * One-off: Create 5 profiles (4 female, 1 male) on demand.
 * Called via HTTP trigger. Delete after use.
 */

header('Content-Type: application/json');

$provided = $_SERVER['HTTP_X_SEEDER_CRON_KEY'] ?? '';
$expected = getenv('SEEDER_CRON_KEY') ?: '';

if ($expected === '' || !hash_equals($expected, $provided)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Forbidden']);
    exit;
}

define('SEEDER_INCLUDED', true);
define('SEEDER_CUSTOM_COUNT', 5);
define('SEEDER_FEMALE_COUNT', 4);
define('SEEDER_MALE_COUNT', 1);

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
