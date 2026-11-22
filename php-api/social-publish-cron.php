<?php
// Social publish cron — publishes every DUE scheduled social post
// (manual, autopilot and autopilot_reel alike; one publishing path for
// everything, so status/proof rules are identical).
//
// Trigger:
//   Preferred — server-local cPanel cron via PHP CLI, every 5 minutes.
//   No HTTP request is involved, so neither GitHub's scheduler (which
//   fired a */5 workflow only ~3 times in 19h on 2026-11-22) nor the
//   web server's ~120s request wall can starve or kill the run:
//     /usr/local/bin/ea-php82 /home/<user>/public_html/api/social-publish-cron.php >> ~/social-publish-cron.log 2>&1
//   CLI invocation needs NO key: only someone with server access can
//   run the script at all, so the SAPI check below IS the credential.
//   HTTP invocation still requires the key (same SEEDER_CRON_KEY
//   pattern as the other crons); the GitHub Actions workflows remain
//   as backup triggers:
//     curl -H "X-Seeder-Cron-Key: <SEEDER_CRON_KEY>" https://shiarishta.com/api/social-publish-cron.php

declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/logger.php';
require __DIR__ . '/lib/db.php';
require __DIR__ . '/lib/jwt.php';
require __DIR__ . '/lib/util.php';
require __DIR__ . '/lib/photos.php';
require __DIR__ . '/lib/SocialPublisher.php';
require __DIR__ . '/lib/SocialStorage.php';

// Auth: HTTP callers must present the SEEDER_CRON_KEY header. PHP CLI
// callers (the server-local cPanel cron) skip the key entirely —
// reaching this script through the server's shell/cron already proves
// server access, and a key in the cron line would only leak it into
// the process list and the cron log.
$isCli = php_sapi_name() === 'cli';
if (!$isCli) {
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
} else {
    // One timestamped line per CLI run, so the cron log itself proves
    // the 5-minute cadence is firing on the server.
    echo '[' . gmdate('Y-m-d H:i:s') . " UTC] social-publish-cron (cli)\n";
}

// A client-side timeout (the GitHub Actions trigger caps its curl at a
// few minutes) must never kill this script mid-target: a killed run is
// what strands targets in 'publishing'. Detach from the client abort
// and let the batch finish; per-target results are persisted as they
// complete, so the response is only a summary.
ignore_user_abort(true);
set_time_limit(0);

try {
    // Due = scheduled time reached AND the post still has work: fresh
    // 'scheduled' posts, 'partial' posts with pending/failed targets
    // left, and 'publishing' posts whose run died >20 min ago (stale —
    // every platform call is time-bounded well under that, so a
    // 'publishing' post older than 20 min is stranded, not active).
    $due = db()->query(
        "SELECT id FROM social_posts
          WHERE scheduled_at IS NOT NULL AND scheduled_at <= UTC_TIMESTAMP()
            AND (status IN ('scheduled', 'partial')
                 OR (status = 'publishing' AND updated_at <= UTC_TIMESTAMP() - INTERVAL 20 MINUTE))
          ORDER BY scheduled_at ASC LIMIT 5"
    )->fetchAll(PDO::FETCH_ASSOC);

    $summary = [];
    // Hard reality: the web server (LiteSpeed) kills any request at
    // ~120s ("Connection Timeout"), whatever PHP allows — a longer
    // batch is what wedged this pipeline. So the whole invocation is
    // budgeted to ~60s of NEW work: posts and targets already started
    // always finish, but nothing new starts past the deadline, and
    // whatever remains stays due for the next trigger (the workflow
    // loops this endpoint until the queue reports empty).
    $deadline = time() + 60;
    foreach ($due as $row) {
        if ($summary !== [] && time() >= $deadline) break;
        $result = socialPublishPost((string)$row['id'], false, $deadline);
        // Include the post's full target snapshot (status + error) in
        // the response: the aggregate status alone cannot distinguish
        // "still working" from "one target failing deterministically",
        // and the workflow log is the operator's window into this run.
        $tstmt = db()->prepare('SELECT platform, status, error FROM social_post_targets WHERE post_id = ?');
        $tstmt->execute([(string)$row['id']]);
        $targets = [];
        foreach ($tstmt->fetchAll(PDO::FETCH_ASSOC) as $t) {
            $targets[(string)$t['platform']] = [
                'status' => (string)$t['status'],
                'error' => $t['error'] !== null ? substr((string)$t['error'], 0, 200) : null,
            ];
        }
        $summary[] = ['post' => (string)$row['id'], 'status' => $result['status'], 'targets' => $targets];
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
    // Watchdog (reliability layer, 2026-11-22): retry past-due targets
    // the main selection above cannot see — above all, targets of a
    // post whose aggregate flipped to 'failed' (never re-selected),
    // which is how the 07:00 Facebook failure sat silent for ~7 hours.
    // Exponential backoff on the target row; 6 strikes → 'dead' and the
    // admin Needs Attention banner. CLI runs (no request wall) get a
    // generous budget; HTTP backup triggers keep the 60s deadline.
    try {
        $watchdog = socialWatchdogSweep($isCli ? time() + 600 : $deadline);
    } catch (Throwable $e) {
        error_log('[social-publish-cron] watchdog sweep failed: ' . substr($e->getMessage(), 0, 160));
        $watchdog = ['error' => 'watchdog sweep failed'];
    }
    // Reconciliation (hourly, self-gated): a target we call published
    // whose object the platform says is gone gets requeued — the books
    // must never claim a dead link is live.
    try {
        $reconcile = socialReconcileSweep();
    } catch (Throwable $e) {
        error_log('[social-publish-cron] reconcile sweep failed: ' . substr($e->getMessage(), 0, 160));
        $reconcile = ['error' => 'reconcile sweep failed'];
    }
    $processed = count($summary) + (int)($watchdog['retried'] ?? 0);
    // Heartbeat LAST: the admin's "publisher last ran" reads this row,
    // so it is written only once the run's real work is done.
    socialRecordHeartbeat($processed, true, $isCli ? 'cli' : 'http');
    echo json_encode(['ok' => true, 'processed' => $processed, 'posts' => $summary, 'purge' => $purge, 'watchdog' => $watchdog, 'reconcile' => $reconcile]) . ($isCli ? "\n" : '');
} catch (Throwable $e) {
    error_log('[social-publish-cron] ' . $e->getMessage());
    socialRecordHeartbeat(0, false, $isCli ? 'cli' : 'http');
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'publish run failed']) . ($isCli ? "\n" : '');
}
