<?php
// Test for the per-platform retry button (2026-11-22): an admin can
// retry ONE target of ONE post (Facebook Page / Instagram / YouTube
// separately) from the scheduler queue. The live publish needs platform
// tokens + a DB, so — same pattern as social-thumbnail-test.php and
// social-storage-test.php — this pins (a) the BEHAVIOUR of the pure
// guard/reset functions the endpoint is built from, and (b) the
// CONTRACT strings wiring route -> publisher -> UI together, because a
// regression in any of those silently breaks the feature end to end:
//
//   · a published target is REFUSED (never double-post)
//   · a failed / pending / stuck-publishing target is reset to pending
//     with its error cleared
//   · the Instagram container id stashed in platform_post_id (commit
//     cd1cd2b, resumable IG retries) SURVIVES the reset
//   · the admin route POST /posts/:id/targets/:platform/retry exists,
//     whitelists the platform and surfaces the refusal as an HTTP error
//   · the publisher orchestration resets, then publishes THAT target
//   · the admin UI renders a Retry button per non-published target
//
// Run: php tests/social-target-retry-test.php
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
$routes = (string)file_get_contents($root . '/routes/social_scheduler.php');
$ui = (string)file_get_contents($root . '/../src/pages/admin/AdminSocialScheduler.jsx');

$target = static fn(string $platform, string $status, array $over = []): array => array_merge([
    'id' => 't-' . $platform, 'post_id' => 'p1', 'social_account_id' => 'a1',
    'platform' => $platform, 'status' => $status,
    'platform_post_id' => null, 'platform_url' => null, 'error' => null,
    'attempts' => 1, 'published_at' => null,
], $over);

// ── Guard: published is refused, everything else is retryable ──────────
foreach (['facebook', 'instagram', 'youtube'] as $p) {
    $r = socialTargetRetryRefusal($target($p, 'published', ['platform_post_id' => 'real-post-id']));
    check("guard: published {$p} target is refused", is_string($r) && str_contains($r, 'Already published'));
    check("guard: refusal names the platform ({$p})", is_string($r) && str_contains($r, $p));
}
foreach (['pending', 'failed', 'publishing'] as $s) {
    check("guard: {$s} target is retryable", socialTargetRetryRefusal($target('facebook', $s)) === null);
}

// ── Reset: failed target goes back to pending, error cleared ───────────
$v = socialTargetRetryResetValues($target('facebook', 'failed', ['error' => 'Facebook video post: HTTP 503']));
check('reset: failed target returns to pending', $v['status'] === 'pending');
check('reset: error is cleared', $v['error'] === null);
$v = socialTargetRetryResetValues($target('youtube', 'publishing', ['error' => 'stranded claim']));
check('reset: stuck publishing target returns to pending (manual escape hatch)', $v['status'] === 'pending');

// ── Reset: the Instagram container id is preserved ─────────────────────
$v = socialTargetRetryResetValues($target('instagram', 'pending', [
    'platform_post_id' => 'ig-container-123', 'error' => 'Instagram video still processing — will retry.',
]));
check('reset: IG container id survives the reset (resumable retry, cd1cd2b)', $v['platform_post_id'] === 'ig-container-123');
$v = socialTargetRetryResetValues($target('facebook', 'failed'));
check('reset: a target with no stashed id keeps platform_post_id null', $v['platform_post_id'] === null);

// ── Publisher contract: reset SQL + orchestration ──────────────────────
check('publisher: socialResetTargetForRetry() exists', str_contains($publisher, 'function socialResetTargetForRetry('));
check('publisher: reset writes the values from socialTargetRetryResetValues()',
    str_contains($publisher, '$v = socialTargetRetryResetValues($target);')
    && str_contains($publisher, "'status' => 'pending',")
    && str_contains($publisher, "'platform_post_id' => \$target['platform_post_id'] ?? null,"));
check('publisher: reset never NULLs platform_post_id',
    !str_contains($publisher, 'platform_post_id = NULL'));
check('publisher: socialRetryPostTarget() selects only the one post+platform target',
    str_contains($publisher, 'function socialRetryPostTarget(')
    && str_contains($publisher, 'WHERE post_id = ? AND platform = ?'));
check('publisher: retry flow is refusal -> reset -> publish that target -> recalc',
    str_contains($publisher, '$refusal = socialTargetRetryRefusal($target);')
    && str_contains($publisher, 'socialResetTargetForRetry($pdo, $target);')
    && str_contains($publisher, '$result = socialPublishTarget($target);')
    && str_contains($publisher, '$status = socialRecalcPostStatus($postId);'));
check('publisher: unknown target refuses with 404, published with 409',
    str_contains($publisher, "'refused' => true, 'code' => 404")
    && str_contains($publisher, "'refused' => true, 'code' => 409"));

// ── Route contract ──────────────────────────────────────────────────────
check('routes: dispatch registers POST posts/:id/targets/:platform/retry',
    str_contains($routes, "(\$segments[2] ?? null) === 'targets' && (\$segments[4] ?? null) === 'retry'"));
check('routes: socialPostTargetRetry() handler exists and whitelists platforms',
    str_contains($routes, 'function socialPostTargetRetry(')
    && str_contains($routes, "in_array(\$platform, ['facebook', 'instagram', 'youtube'], true)"));
check('routes: handler surfaces a refusal as an HTTP error (no publish attempted)',
    str_contains($routes, "if (!empty(\$out['refused'])) je((string)\$out['error'], (int)(\$out['code'] ?? 409));"));
check('routes: handler returns the refreshed post + target outcome for the UI',
    str_contains($routes, "'target' => \$out['target']"));

// ── UI contract ─────────────────────────────────────────────────────────
check('ui: retry calls the per-target endpoint',
    str_contains($ui, '/targets/${platform}/retry'));
check('ui: Retry button is rendered only for non-published targets',
    str_contains($ui, "t.status !== 'published'"));
check('ui: the post is refreshed in place from the response',
    str_contains($ui, 'if (res.post) setPosts('));

echo $failures === 0 ? "\nALL PASS\n" : "\n{$failures} FAILURE(S)\n";
exit($failures === 0 ? 0 : 1);
