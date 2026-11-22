<?php
// Test for the self-healing watchdog (2026-11-22): targets past due
// >15 min that fell out of the main due-post flow are retried with
// exponential backoff recorded on the target row; after 6 failed
// watchdog attempts the target is marked 'dead' (dead-letter) instead
// of retrying — or rotting silently — forever. The 2026-11-22 07:00
// Facebook target sat failed for ~7 hours because its post's
// aggregate status flipped to 'failed' and the main cron selection
// (scheduled/partial posts only) never picked it up again; the
// watchdog selects by TARGET, which is the blind spot this closes.
//
// Pure decision functions are exercised behaviourally; DB-touching
// wiring is pinned by contract strings (same pattern as the other
// social tests). Run: php tests/social-watchdog-test.php
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
$migrate = (string)file_get_contents($root . '/lib/migrate.php');
$schema = (string)file_get_contents($root . '/db/schema.sql');

$now = strtotime('2026-11-22 14:00:00 UTC');
$target = static fn(array $over = []): array => array_merge([
    'status' => 'failed', 'retry_attempts' => 0, 'next_retry_at' => null,
    'updated_at' => '2026-11-22 07:00:00',
], $over);
$post = static fn(array $over = []): array => array_merge([
    'status' => 'failed', 'scheduled_at' => '2026-11-22 07:00:00',
], $over);

// ── Backoff schedule: exponential, capped table ────────────────────────
check('backoff: 1st failure waits 5 min', socialWatchdogBackoffSeconds(1) === 300);
check('backoff: 2nd failure waits 15 min', socialWatchdogBackoffSeconds(2) === 900);
check('backoff: 3rd failure waits 30 min', socialWatchdogBackoffSeconds(3) === 1800);
check('backoff: 4th failure waits 1 h', socialWatchdogBackoffSeconds(4) === 3600);
check('backoff: 5th failure waits 2 h', socialWatchdogBackoffSeconds(5) === 7200);
check('backoff: grows monotonically',
    socialWatchdogBackoffSeconds(1) < socialWatchdogBackoffSeconds(2)
    && socialWatchdogBackoffSeconds(2) < socialWatchdogBackoffSeconds(3)
    && socialWatchdogBackoffSeconds(3) < socialWatchdogBackoffSeconds(4)
    && socialWatchdogBackoffSeconds(4) < socialWatchdogBackoffSeconds(5));

// ── Failure bookkeeping: attempts climb, 6th failure is death ──────────
$d = socialWatchdogAfterFailure(0);
check('after failure #1: attempts=1, alive, delay scheduled', $d['retry_attempts'] === 1 && $d['dead'] === false && $d['delay_seconds'] === 300);
$d = socialWatchdogAfterFailure(4);
check('after failure #5: attempts=5, alive, 2h delay', $d['retry_attempts'] === 5 && $d['dead'] === false && $d['delay_seconds'] === 7200);
$d = socialWatchdogAfterFailure(5);
check('after failure #6: attempts=6, DEAD, no further delay', $d['retry_attempts'] === 6 && $d['dead'] === true && $d['delay_seconds'] === 0);
check('watchdog cap is 6 attempts', SOCIAL_WATCHDOG_MAX_ATTEMPTS === 6);

// ── Eligibility matrix ─────────────────────────────────────────────────
check('eligible: failed target, post 7h past due (the 07:00 case)', socialWatchdogTargetEligible($target(), $post(), $now));
check('eligible: pending target past due', socialWatchdogTargetEligible($target(['status' => 'pending']), $post(), $now));
check('eligible: stale publishing claim (>20 min)', socialWatchdogTargetEligible($target(['status' => 'publishing', 'updated_at' => '2026-11-22 13:30:00']), $post(), $now));
check('not eligible: post only 10 min past due', !socialWatchdogTargetEligible($target(), $post(['scheduled_at' => '2026-11-22 13:50:00']), $now));
check('not eligible: draft post (no due intent)', !socialWatchdogTargetEligible($target(), $post(['status' => 'draft']), $now));
check('not eligible: published target', !socialWatchdogTargetEligible($target(['status' => 'published']), $post(), $now));
check('not eligible: dead target (dead-letter is terminal for the watchdog)', !socialWatchdogTargetEligible($target(['status' => 'dead', 'retry_attempts' => 6]), $post(), $now));
check('not eligible: attempts exhausted', !socialWatchdogTargetEligible($target(['retry_attempts' => 6]), $post(), $now));
check('not eligible: backoff not yet elapsed', !socialWatchdogTargetEligible($target(['retry_attempts' => 2, 'next_retry_at' => '2026-11-22 14:10:00']), $post(), $now));
check('eligible: backoff elapsed', socialWatchdogTargetEligible($target(['retry_attempts' => 2, 'next_retry_at' => '2026-11-22 13:55:00']), $post(), $now));
check('not eligible: fresh publishing claim (a live run owns it)', !socialWatchdogTargetEligible($target(['status' => 'publishing', 'updated_at' => '2026-11-22 13:55:00']), $post(), $now));
check('not eligible: unscheduled post', !socialWatchdogTargetEligible($target(), $post(['scheduled_at' => null]), $now));

// ── Sweep wiring contracts ─────────────────────────────────────────────
check('sweep: selects by target joined to post schedule, not by post aggregate',
    str_contains($publisher, 'FROM social_post_targets t') && str_contains($publisher, 'JOIN social_posts p ON p.id = t.post_id'));
check('sweep: past-due threshold is 15 minutes', str_contains($publisher, 'INTERVAL 15 MINUTE'));
check('sweep: death writes the distinct dead status',
    str_contains($publisher, "SET status = 'dead', retry_attempts = ?"));
check('sweep: soft (processing) outcomes do not burn an attempt',
    str_contains($publisher, "!empty(\$result['retry'])") && str_contains($publisher, 'INTERVAL 5 MINUTE'));
check('sweep: success clears the backoff bookkeeping',
    str_contains($publisher, "SET retry_attempts = 0, next_retry_at = NULL"));
check('cron: the publish cron runs the watchdog every run', str_contains($cron, 'socialWatchdogSweep('));

// ── Revival: the manual per-platform Retry resets the counters ─────────
$v = socialTargetRetryResetValues(['status' => 'dead', 'platform_post_id' => null, 'retry_attempts' => 6, 'next_retry_at' => '2026-11-23 00:00:00']);
check('revival: retry reset returns a dead target to pending', $v['status'] === 'pending');
check('revival: retry reset zeroes watchdog attempts', $v['retry_attempts'] === 0);
check('revival: retry reset clears next_retry_at', $v['next_retry_at'] === null);
check('revival: the refusal guard still only refuses published (dead is retryable)',
    socialTargetRetryRefusal(['status' => 'dead', 'platform' => 'facebook']) === null);

// ── Aggregate + schema contracts ───────────────────────────────────────
check('aggregate: dead counts as failed in socialRecalcPostStatus',
    str_contains($publisher, "\$s === 'failed' || \$s === 'dead'"));
check('migration: migrateAddSocialReliability adds both columns + social_state',
    str_contains($migrate, 'function migrateAddSocialReliability(')
    && str_contains($migrate, "LIKE 'retry_attempts'") && str_contains($migrate, "LIKE 'next_retry_at'")
    && str_contains($migrate, 'CREATE TABLE IF NOT EXISTS social_state'));
check('migration: migrateAddSocialReliability is registered in migrateSchema',
    str_contains($migrate, 'migrateAddSocialReliability();'));
check('schema.sql: targets carry the watchdog columns and social_state exists',
    str_contains($schema, 'retry_attempts') && str_contains($schema, 'next_retry_at')
    && str_contains($schema, 'CREATE TABLE IF NOT EXISTS social_state'));

echo $failures === 0 ? "\nALL PASS\n" : "\n{$failures} FAILURE(S)\n";
exit($failures === 0 ? 0 : 1);
