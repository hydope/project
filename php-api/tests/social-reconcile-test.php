<?php
// Test for automatic reconciliation (2026-11-22): once an hour, the
// publish cron checks targets marked published in the last 48h
// against the platform itself. If Facebook/Instagram's Graph API or
// YouTube's Data API says the object no longer exists, the target is
// flipped back to pending ("Published object missing on platform —
// requeued") so the watchdog republishes it — our books must never
// claim a dead link is live. The classifiers are deliberately
// conservative: only a DEFINITIVE not-exists answer flips a target;
// token, permission, quota and rate-limit errors prove nothing.
//
// Run: php tests/social-reconcile-test.php
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

$res = static fn(int $status, ?array $json = null): array => [
    'status' => $status, 'json' => $json, 'raw' => '', 'error' => null, 'headers' => [],
];

// ── Graph (Facebook + Instagram) missing-classifier ────────────────────
check('graph: object exists (id returned) is not missing',
    !socialGraphObjectMissing($res(200, ['id' => '12345'])));
check('graph: error 100 + subcode 33 (object does not exist) is missing',
    socialGraphObjectMissing($res(400, ['error' => ['message' => '(#100) Object with ID 123 does not exist', 'code' => 100, 'error_subcode' => 33]])));
check('graph: error 803 (alias does not exist) is missing',
    socialGraphObjectMissing($res(404, ['error' => ['message' => '(#803) Some of the aliases you requested do not exist', 'code' => 803]])));
check('graph: error 100 WITHOUT subcode 33 is not proof (generic param error)',
    !socialGraphObjectMissing($res(400, ['error' => ['message' => '(#100) Param upload_phase must be one of {START, FINISH}', 'code' => 100]])));
check('graph: token error 190 proves nothing', !socialGraphObjectMissing($res(401, ['error' => ['message' => 'Invalid OAuth', 'code' => 190]])));
check('graph: permission error 200 proves nothing', !socialGraphObjectMissing($res(403, ['error' => ['message' => 'Permissions error', 'code' => 200]])));
check('graph: 500 proves nothing', !socialGraphObjectMissing($res(500)));

// ── YouTube missing-classifier ─────────────────────────────────────────
check('youtube: video present (items non-empty) is not missing',
    !socialYouTubeObjectMissing($res(200, ['items' => [['id' => 'abc123']]])));
check('youtube: 200 with empty items is missing', socialYouTubeObjectMissing($res(200, ['items' => []])));
check('youtube: 404 is missing', socialYouTubeObjectMissing($res(404, ['error' => ['message' => 'Not found']])));
check('youtube: 403 quota error proves nothing', !socialYouTubeObjectMissing($res(403, ['error' => ['message' => 'quotaExceeded']])));
check('youtube: 200 without an items key proves nothing', !socialYouTubeObjectMissing($res(200, ['kind' => 'youtube#videoListResponse'])));

// ── Hourly gate ────────────────────────────────────────────────────────
$now = strtotime('2026-11-22 14:00:00 UTC');
check('gate: never run before → due', socialReconcileDue(null, $now));
check('gate: ran 10 min ago → not due', !socialReconcileDue('2026-11-22 13:50:00', $now));
check('gate: ran 54 min ago → not due', !socialReconcileDue('2026-11-22 13:06:00', $now));
check('gate: ran 56 min ago → due', socialReconcileDue('2026-11-22 13:04:00', $now));
check('gate: ran 3 h ago → due', socialReconcileDue('2026-11-22 11:00:00', $now));

// ── Sweep wiring contracts ─────────────────────────────────────────────
check('sweep: gated on the reconcile_last_run_at state key',
    str_contains($publisher, "socialReconcileDue(socialStateGet('reconcile_last_run_at'), time())"));
check('sweep: only targets published within 48h are checked',
    str_contains($publisher, 'INTERVAL 48 HOUR'));
check('sweep: Facebook/Instagram checked with a fields=id Graph read',
    str_contains($publisher, "?fields=id&access_token="));
check('sweep: YouTube checked via videos.list part=id',
    str_contains($publisher, 'youtube/v3/videos?part=id&id='));
check('sweep: a missing object is requeued as pending with the loud error',
    str_contains($publisher, "SET status = 'pending', platform_url = NULL")
    && str_contains($publisher, 'Published object missing on platform — requeued for republication.'));
check('sweep: requeue resets the watchdog bookkeeping for a fresh cycle',
    str_contains($publisher, 'retry_attempts = 0, next_retry_at = NULL'));
check('sweep: requeue recalcs the post aggregate', str_contains($publisher, 'socialRecalcPostStatus((string)$t[\'post_id\'])'));
check('cron: the publish cron runs reconciliation every run (self-gated hourly)',
    str_contains($cron, 'socialReconcileSweep()'));

echo $failures === 0 ? "\nALL PASS\n" : "\n{$failures} FAILURE(S)\n";
exit($failures === 0 ? 0 : 1);
