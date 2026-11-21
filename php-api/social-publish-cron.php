<?php
// Social publish cron — publishes every DUE scheduled social post
// (manual, autopilot and autopilot_reel alike; one publishing path for
// everything, so status/proof rules are identical).
//
// Trigger (same SEEDER_CRON_KEY pattern as the other crons):
//   curl -H "X-Seeder-Cron-Key: <SEEDER_CRON_KEY>" https://shiarishta.com/api/social-publish-cron.php
// Suggested cadence: every 5 minutes from GitHub Actions or cPanel cron.

declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/logger.php';
require __DIR__ . '/lib/db.php';
require __DIR__ . '/lib/jwt.php';
require __DIR__ . '/lib/util.php';
require __DIR__ . '/lib/photos.php';
require __DIR__ . '/lib/SocialPublisher.php';
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
    $due = db()->query(
        "SELECT id FROM social_posts
          WHERE status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= UTC_TIMESTAMP()
          ORDER BY scheduled_at ASC LIMIT 20"
    )->fetchAll(PDO::FETCH_ASSOC);

    $summary = [];
    foreach ($due as $row) {
        $result = socialPublishPost((string)$row['id']);
        $summary[] = ['post' => (string)$row['id'], 'status' => $result['status']];
    }
    // Storage lifecycle sweep (Social-Storage plan §3.3): purge server
    // media whose lifecycle ended — published >72h, failed >7d,
    // cancelled >24h. Dry-run for the first 48h (see SocialStorage.php).
    // A purge failure must never fail the publishing output.
    try {
        $purge = socialPurgeSweep(false);
    } catch (Throwable $e) {
        error_log('[social-publish-cron] purge sweep failed: ' . substr($e->getMessage(), 0, 160));
        $purge = ['error' => 'purge sweep failed'];
    }
    echo json_encode(['ok' => true, 'processed' => count($summary), 'posts' => $summary, 'purge' => $purge]);
} catch (Throwable $e) {
    error_log('[social-publish-cron] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'publish run failed']);
}
