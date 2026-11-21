<?php
// Social autopilot cron — the FALLBACK content generator.
//
// Reels are the main autopilot format and are generated on the Muse
// side (ShortSmash) and fed in via /api/social-ingest. This cron runs
// hourly and, ONLY when autopilot is ON, fills the next hour's slot with
// a text/image post if no reel (and no earlier fallback post) is already
// queued for it. Generated rows are ordinary social_posts
// (source='autopilot'); social-publish-cron.php publishes them.
//
// Trigger (same SEEDER_CRON_KEY pattern as the other crons):
//   curl -H "X-Seeder-Cron-Key: <SEEDER_CRON_KEY>" https://shiarishta.com/api/social-autopilot-cron.php
// Suggested cadence: hourly, a few minutes past the hour.

declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/logger.php';
require __DIR__ . '/lib/db.php';
require __DIR__ . '/lib/jwt.php';
require __DIR__ . '/lib/util.php';
require __DIR__ . '/lib/photos.php';
require __DIR__ . '/lib/ai.php';
require __DIR__ . '/lib/SocialPublisher.php';
require __DIR__ . '/lib/SocialAutopilot.php';
require __DIR__ . '/lib/SocialStorage.php';

$expected = getenv('SEEDER_CRON_KEY');
if (!is_string($expected) || $expected === '') {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'cron key not configured']);
    exit;
}
$provided = $_SERVER['HTTP_X_SEEDER_CRON_KEY'] ?? '';
if (!hash_equals($expected, (string)$provided)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'forbidden']);
    exit;
}

try {
    // Storage watchdog FIRST (Social-Storage plan §3.4), so this run's
    // generation respects the fresh tier: ≥70% warn, ≥85% block new
    // renders/ingest (flag persisted; publishing continues), ≥95%
    // emergency-purge published media regardless of the 72h grace.
    $watchdog = socialStorageWatchdogEvaluate();
    $out = socialAutopilotRun();
    $out['storageWatchdog'] = [
        'tier' => $watchdog['tier'],
        'pct' => $watchdog['pct'],
        'usedBytes' => $watchdog['usedBytes'],
        'quotaBytes' => $watchdog['quotaBytes'],
        'ingestBlocked' => $watchdog['ingestBlocked'],
    ];
    if (!empty($watchdog['warning'])) $out['warning'] = $watchdog['warning'];
    if ($watchdog['tier'] === 'emergency') {
        try {
            $out['emergencyPurge'] = socialPurgeSweep(true);
        } catch (Throwable $e) {
            error_log('[social-autopilot-cron] emergency purge failed: ' . substr($e->getMessage(), 0, 160));
            $out['emergencyPurge'] = ['error' => 'emergency purge failed'];
        }
    }
    echo json_encode($out);
} catch (Throwable $e) {
    error_log('[social-autopilot-cron] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'autopilot run failed']);
}
