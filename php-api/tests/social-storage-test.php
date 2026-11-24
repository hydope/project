<?php
// Offline test for the social storage lifecycle (lib/SocialStorage.php):
// the purge DECISION rules, the dry-run gate resolution, the directory
// budget config and the recursive dir-size helper.
//
// Rules pinned here (Social-Storage-World-Class-Plan.md §3.3/§3.4):
//   · all targets published with live URLs → purge after the configured
//     grace (72h default; fractional allowed down to 0.5h = 30 minutes)
//   · any target failed, none still open → keep 7 days, then purge
//   · cancelled post → purge 24h after cancellation
//   · emergency (watchdog ≥95%) → published files purge regardless of grace
//   · dry-run defaults ON for 48h from the first-run anchor; an explicit
//     SOCIAL_PURGE_DRYRUN_UNTIL wins, and '0'/'off' disables it at once
//
// Everything runs on stubbed rows + a temp dir — no DB, no network.
// Run: php tests/social-storage-test.php
declare(strict_types=1);

require __DIR__ . '/../lib/SocialStorage.php';

$failures = 0;
function check(string $label, bool $cond): void
{
    global $failures;
    echo ($cond ? 'PASS' : 'FAIL') . '  ' . $label . "\n";
    if (!$cond) $failures++;
}

$H = 3600;
$D = 24 * $H;
$now = strtotime('2026-11-21 12:00:00 UTC');
$fmt = static fn(int $ts): string => gmdate('Y-m-d H:i:s', $ts);

$post = static fn(array $over = []): array => array_merge([
    'id' => 'p1', 'status' => 'published', 'media_path' => 'social/reel.mp4',
    'media_purged_at' => null, 'created_at' => $fmt($now - 10 * $D), 'updated_at' => $fmt($now - 3 * $D),
], $over);
$tgt = static fn(string $status, array $over = []): array => array_merge([
    'status' => $status, 'platform_url' => $status === 'published' ? 'https://example.com/post/1' : null,
    'published_at' => $status === 'published' ? $fmt($now - 3 * $D) : null,
    'updated_at' => $fmt($now - 3 * $D),
], $over);

// ── Published rule ──────────────────────────────────────────────────────
$d = socialPurgeDecision($post(), [$tgt('published'), $tgt('published')], $now);
check('all published, last publish 73h ago -> purge (published_grace)',
    $d !== null && $d['reason'] === 'published_grace');

$d = socialPurgeDecision($post(), [$tgt('published', ['published_at' => $fmt($now - 71 * $H), 'updated_at' => $fmt($now - 71 * $H)])], $now);
check('all published, last publish 71h ago -> keep (inside grace)', $d === null);

$d = socialPurgeDecision($post(), [$tgt('published'), $tgt('skipped')], $now);
check('published + skipped target -> purge after grace (skipped is settled)',
    $d !== null && $d['reason'] === 'published_grace');

// ── Fractional grace: 0.5h = 30 minutes (panel minimum, 2026-11-24) ──
$d = socialPurgeDecision($post(), [$tgt('published', ['published_at' => $fmt($now - 31 * 60), 'updated_at' => $fmt($now - 31 * 60)])], $now, false, 0.5);
check('grace 0.5h: last publish 31 min ago -> purge (published_grace)',
    $d !== null && $d['reason'] === 'published_grace');
check('grace 0.5h: note renders the grace cleanly as 0.5h',
    $d !== null && str_contains($d['note'], '>0.5h ago'));

$d = socialPurgeDecision($post(), [$tgt('published', ['published_at' => $fmt($now - 30 * 60), 'updated_at' => $fmt($now - 30 * 60)])], $now, false, 0.5);
check('grace 0.5h: last publish exactly 30 min ago -> purge (boundary)', $d !== null);

$d = socialPurgeDecision($post(), [$tgt('published', ['published_at' => $fmt($now - 29 * 60), 'updated_at' => $fmt($now - 29 * 60)])], $now, false, 0.5);
check('grace 0.5h: last publish 29 min ago -> keep (inside grace)', $d === null);

$d = socialPurgeDecision($post(), [$tgt('published', ['platform_url' => null])], $now);
check('published target WITHOUT a live URL -> keep (proof rule)', $d === null);

$d = socialPurgeDecision($post(), [$tgt('published', ['published_at' => $fmt($now - 1 * $H), 'updated_at' => $fmt($now - 1 * $H)])], $now, true);
check('emergency=true purges a 1h-old published file (emergency_storage_95)',
    $d !== null && $d['reason'] === 'emergency_storage_95');

// ── Failed rule ─────────────────────────────────────────────────────────
$failedOld = $tgt('failed', ['updated_at' => $fmt($now - 8 * $D)]);
$d = socialPurgeDecision($post(['status' => 'partial']), [$tgt('published'), $failedOld], $now);
check('one failed target, last attempt 8d ago -> purge (failed_retention_7d)',
    $d !== null && $d['reason'] === 'failed_retention_7d');

$d = socialPurgeDecision($post(['status' => 'partial']), [$tgt('published'), $tgt('failed', ['updated_at' => $fmt($now - 6 * $D)])], $now);
check('one failed target, last attempt 6d ago -> keep (retry window)', $d === null);

$d = socialPurgeDecision($post(['status' => 'partial']), [$failedOld, $tgt('pending')], $now);
check('failed target but another still pending -> keep (work in flight)', $d === null);

$d = socialPurgeDecision($post(['status' => 'failed', 'updated_at' => $fmt($now - 8 * $D)]), [], $now);
check('failed post with no target rows, 8d old -> purge (failed_retention_7d)',
    $d !== null && $d['reason'] === 'failed_retention_7d');

// ── Cancelled rule ──────────────────────────────────────────────────────
$d = socialPurgeDecision($post(['status' => 'cancelled', 'updated_at' => $fmt($now - 25 * $H)]), [], $now);
check('cancelled 25h ago -> purge (cancelled_24h)', $d !== null && $d['reason'] === 'cancelled_24h');

$d = socialPurgeDecision($post(['status' => 'cancelled', 'updated_at' => $fmt($now - 23 * $H)]), [], $now);
check('cancelled 23h ago -> keep', $d === null);

// ── Guards ──────────────────────────────────────────────────────────────
check('no media_path -> keep', socialPurgeDecision($post(['media_path' => null]), [$tgt('published')], $now) === null);
check('already purged -> keep (idempotent)',
    socialPurgeDecision($post(['media_purged_at' => $fmt($now - $D)]), [$tgt('published')], $now) === null);
check('scheduled post with pending targets -> keep',
    socialPurgeDecision($post(['status' => 'scheduled']), [$tgt('pending')], $now) === null);

// ── Dry-run resolution ──────────────────────────────────────────────────
$r = socialPurgeDryRunResolve('0', null, $now);
check("env '0' disables dry-run immediately", $r['dryRun'] === false && $r['source'] === 'env-off');

$r = socialPurgeDryRunResolve((string)($now + $H), null, $now);
check('env until = now+1h -> dry-run ON', $r['dryRun'] === true && $r['source'] === 'env');

$r = socialPurgeDryRunResolve((string)($now - $H), null, $now);
check('env until in the past -> dry-run OFF', $r['dryRun'] === false);

$r = socialPurgeDryRunResolve(null, $now, $now);
check('no env, fresh anchor -> dry-run ON, until = anchor+48h',
    $r['dryRun'] === true && $r['until'] === $now + 48 * $H && $r['source'] === 'default-48h');

$r = socialPurgeDryRunResolve(null, $now - 49 * $H, $now);
check('no env, anchor 49h old -> dry-run OFF', $r['dryRun'] === false);

$r = socialPurgeDryRunResolve(null, null, $now);
check('no env, no anchor -> dry-run ON (fail safe)', $r['dryRun'] === true && $r['source'] === 'default-on');

// ── Budget / quota config ───────────────────────────────────────────────
putenv('SOCIAL_MEDIA_BUDGET_BYTES');
check('budget default is 2 GiB', socialMediaBudgetBytes() === 2 * 1024 * 1024 * 1024);
putenv('SOCIAL_MEDIA_BUDGET_BYTES=1000');
check('budget env override honoured', socialMediaBudgetBytes() === 1000);
putenv('SOCIAL_MEDIA_BUDGET_BYTES');
putenv('SOCIAL_ACCOUNT_QUOTA_MB');
check('quota default is 10000 MB', socialAccountQuotaBytes() === 10000 * 1024 * 1024);
putenv('SOCIAL_ACCOUNT_QUOTA_MB=5000');
check('quota env override honoured', socialAccountQuotaBytes() === 5000 * 1024 * 1024);
putenv('SOCIAL_ACCOUNT_QUOTA_MB');

// ── Dir size helper ─────────────────────────────────────────────────────
$tmp = sys_get_temp_dir() . '/social-storage-test-' . getmypid();
@mkdir($tmp . '/sub', 0775, true);
file_put_contents($tmp . '/a.bin', str_repeat('x', 1000));
file_put_contents($tmp . '/sub/b.bin', str_repeat('y', 500));
check('dir size sums recursively (1500 bytes)', socialDirSizeBytes($tmp) === 1500);
check('missing dir sizes to 0', socialDirSizeBytes($tmp . '/nope') === 0);
@unlink($tmp . '/a.bin'); @unlink($tmp . '/sub/b.bin'); @rmdir($tmp . '/sub'); @rmdir($tmp);

echo $failures === 0 ? "\nALL PASS\n" : "\n{$failures} FAILURE(S)\n";
exit($failures === 0 ? 0 : 1);
