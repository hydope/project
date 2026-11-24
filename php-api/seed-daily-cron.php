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

// Load .env (standalone script — bootstrap.php isn't included)
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

// Admin settings gate (Admin → Settings → Profile seeder): the panel owns
// whether the seeder runs and how many profiles it adds. The seeder script
// already honours SEEDER_CUSTOM_COUNT / SEEDER_FEMALE_COUNT defines, so the
// counts are handed over through them.
require_once __DIR__ . '/lib/db.php';
require_once __DIR__ . '/lib/util.php';
require_once __DIR__ . '/lib/siteSettings.php';
if (!siteSettingBool('seeder_enabled', true)) {
    echo json_encode(['ok' => true, 'skipped' => 'seeder disabled in Admin → Settings']);
    exit;
}
define('SEEDER_CUSTOM_COUNT', siteSettingInt('seeder_daily_count', 5, 0, 20));
define('SEEDER_FEMALE_COUNT', siteSettingInt('seeder_female_count', 4, 0, 20));

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
