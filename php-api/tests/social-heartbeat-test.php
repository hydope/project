<?php
// Test for the publisher heartbeat + dead-letter visibility
// (2026-11-22): every publish-cron run records a heartbeat row; the
// admin API exposes it on GET /posts together with the watchdog
// dead-letter list; the admin UI shows "Publisher last ran X min
// ago", goes red when the last run is >15 min old, and renders a
// Needs Attention banner for dead targets. The failure mode being
// eliminated is SILENCE — a stalled publisher or a permanently
// failed target must be visible on the dashboard, not discovered
// hours later by a human counting posts.
//
// Run: php tests/social-heartbeat-test.php
declare(strict_types=1);

$failures = 0;
function check(string $label, bool $cond): void
{
    global $failures;
    echo ($cond ? 'PASS' : 'FAIL') . '  ' . $label . "\n";
    if (!$cond) $failures++;
}

$root = __DIR__ . '/..';
require $root . '/lib/SocialPublisher.php';
$publisher = (string)file_get_contents($root . '/lib/SocialPublisher.php');
$cron = (string)file_get_contents($root . '/social-publish-cron.php');
$routes = (string)file_get_contents($root . '/routes/social_scheduler.php');
$ui = (string)file_get_contents($root . '/../src/pages/admin/AdminSocialScheduler.jsx');

$now = strtotime('2026-11-22 14:00:00 UTC');
$hb = static fn(string $at, int $processed = 3, bool $ok = true): array => [
    'last_run_at' => $at, 'processed' => $processed, 'ok' => $ok, 'source' => 'cli',
];

// ── Payload shaping ────────────────────────────────────────────────────
$p = socialHeartbeatPayload(null, $now);
check('payload: no heartbeat at all reads stale (never ran = alarm)', $p['stale'] === true && $p['lastRunAt'] === null);
$p = socialHeartbeatPayload($hb('2026-11-22 13:58:00'), $now);
check('payload: 2-minute-old run is fresh', $p['stale'] === false && $p['ageSeconds'] === 120);
check('payload: lastRunAt / processed / ok pass through', $p['lastRunAt'] === '2026-11-22 13:58:00' && $p['processed'] === 3 && $p['ok'] === true);
$p = socialHeartbeatPayload($hb('2026-11-22 13:45:00'), $now);
check('payload: exactly 15 minutes old is still fresh (boundary)', $p['stale'] === false && $p['ageSeconds'] === 900);
$p = socialHeartbeatPayload($hb('2026-11-22 13:44:59'), $now);
check('payload: 15 min + 1 s old is stale', $p['stale'] === true);
$p = socialHeartbeatPayload($hb('2026-11-22 06:00:00', 0, false), $now);
check('payload: an hours-old failed run is stale and not ok', $p['stale'] === true && $p['ok'] === false);

// ── Recording + exposure contracts ─────────────────────────────────────
check('publisher: socialRecordHeartbeat writes the publisher_heartbeat state key',
    str_contains($publisher, "socialStateSet('publisher_heartbeat'"));
check('publisher: heartbeat records last_run_at + processed + ok + source',
    str_contains($publisher, "'last_run_at' => gmdate('Y-m-d H:i:s')")
    && str_contains($publisher, "'processed' => \$processed") && str_contains($publisher, "'source' => \$source"));
check('publisher: heartbeat write can never fail the run it describes',
    str_contains($publisher, 'The heartbeat must never fail the run it describes.'));
check('cron: a successful run records an ok heartbeat', str_contains($cron, "socialRecordHeartbeat(\$processed, true,"));
check('cron: a failed run records a not-ok heartbeat', str_contains($cron, "socialRecordHeartbeat(0, false,"));
check('routes: GET /posts exposes the publisher heartbeat',
    str_contains($routes, "'publisher' => socialHeartbeatPayload(socialPublisherHeartbeat(), time())"));
check('routes: GET /posts exposes the dead-letter list',
    str_contains($routes, "'deadTargets' => \$dead") && str_contains($routes, "WHERE t.status = 'dead'"));
check('routes: target payload carries the watchdog counters',
    str_contains($routes, "'retryAttempts' => (int)(\$t['retry_attempts'] ?? 0)"));

// ── UI contracts ───────────────────────────────────────────────────────
check('ui: heartbeat state is loaded from the posts response',
    str_contains($ui, 'setPublisher(list.publisher || null)') && str_contains($ui, 'setDeadTargets(list.deadTargets || [])'));
check('ui: shows "Publisher last ran … min ago"', str_contains($ui, 'Publisher last ran'));
check('ui: stale heartbeat renders a red alert', str_contains($ui, 'publisher.stale') && str_contains($ui, 'publishing may be stalled'));
check('ui: Needs Attention banner lists dead targets', str_contains($ui, 'Needs attention:') && str_contains($ui, 'deadTargets.map('));
check('ui: dead targets get a Retry button in the banner', str_contains($ui, 'onClick={() => retryTarget(d.postId, d.platform)}'));
check('ui: dead has its own status style', str_contains($ui, "dead: { color: 'var(--color-danger)'"));

echo $failures === 0 ? "\nALL PASS\n" : "\n{$failures} FAILURE(S)\n";
exit($failures === 0 ? 0 : 1);
