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
    echo json_encode(socialAutopilotRun());
} catch (Throwable $e) {
    error_log('[social-autopilot-cron] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'autopilot run failed']);
}
