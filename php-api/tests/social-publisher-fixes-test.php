<?php
// Test for the 2026-11-22 publisher fixes (Viral Growth Plan):
//
//   FIX 1 — ATOMIC CLAIM. On 2026-11-22 the server cron and the GitHub
//   workflow overlapped and published the same Facebook Reel twice
//   ("Nikah parson, rukhsati isi hafte?!" exists as two distinct public
//   posts). socialPublishTarget used to flip a target to 'publishing'
//   with an unconditional UPDATE, so two concurrent workers both
//   proceeded. Now a single conditional UPDATE claims the target and
//   the worker proceeds only when its claim changed the row; a loser
//   gets 'skipped' and persists nothing.
//
//   FIX 2 — FIRST COMMENT. After a Facebook/Instagram target publishes,
//   the publisher comments the story's hook question (the caption's
//   first line) on the new post. Strictly best-effort: a failure is a
//   note on the target row, never a failed publish.
//
//   FIX 3 — FACEBOOK DAILY-CAP TEST. Max 8 Facebook publishes per
//   America/New_York calendar day through 2026-11-25, then no cap.
//   At the cap a target is deferred to the next NY day — pending, not
//   failed, no watchdog attempt burned. Config lives in social_state.
//
// Same pattern as the sibling social tests: the pure decision
// functions are exercised behaviourally, and the DB/network wiring is
// pinned by contract strings, because a regression in either silently
// breaks the feature end to end.
//
// Run: php tests/social-publisher-fixes-test.php
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

$now = strtotime('2026-11-22 19:00:00 UTC');
$target = static fn(array $over = []): array => array_merge([
    'status' => 'pending', 'updated_at' => '2026-11-22 18:59:00',
], $over);

// ── FIX 1: claimability — the claim decision ───────────────────────────
check('claim: pending target is claimable', socialTargetClaimable($target(), $now) === true);
check('claim: failed target is claimable', socialTargetClaimable($target(['status' => 'failed']), $now) === true);
check('claim: published target is NOT claimable', socialTargetClaimable($target(['status' => 'published']), $now) === false);
check('claim: dead target is NOT claimable', socialTargetClaimable($target(['status' => 'dead']), $now) === false);
check('claim: fresh publishing claim (1 min old) is NOT claimable — the second worker changes nothing',
    socialTargetClaimable($target(['status' => 'publishing', 'updated_at' => '2026-11-22 18:59:00']), $now) === false);
check('claim: publishing claim at 19 min is NOT claimable yet',
    socialTargetClaimable($target(['status' => 'publishing', 'updated_at' => '2026-11-22 18:41:00']), $now) === false);
check('claim: stale publishing claim (21 min old) IS claimable — a stranded run never wedges the target',
    socialTargetClaimable($target(['status' => 'publishing', 'updated_at' => '2026-11-22 18:39:00']), $now) === true);
check('claim: publishing with no timestamp is NOT claimable',
    socialTargetClaimable($target(['status' => 'publishing', 'updated_at' => null]), $now) === false);

// ── FIX 1: the claim is ONE conditional UPDATE, gated on rowCount ──────
check('claim: claim is a single UPDATE on social_post_targets',
    preg_match('/function socialClaimTarget\(PDO \$pdo, string \$targetId\): bool\s*\{.*?UPDATE social_post_targets/s', $publisher) === 1);
check('claim: UPDATE flips the row to publishing and bumps attempts atomically',
    str_contains($publisher, "SET status = 'publishing', attempts = attempts + 1, updated_at = UTC_TIMESTAMP()"));
check('claim: UPDATE only fires while the row is pending/failed',
    str_contains($publisher, "status IN ('pending', 'failed')"));
check('claim: UPDATE also admits a stale (>20 min) publishing claim',
    str_contains($publisher, "status = 'publishing' AND updated_at <= UTC_TIMESTAMP() - INTERVAL 20 MINUTE"));
check('claim: the worker proceeds only when the claim changed the row',
    str_contains($publisher, 'return $stmt->rowCount() === 1;'));
check('claim: socialPublishTarget claims before publishing',
    str_contains($publisher, 'if (!socialClaimTarget($pdo, (string)$target[\'id\'])) {'));
$claimPos = strpos($publisher, 'socialClaimTarget($pdo');
$dispatchPos = strpos($publisher, "'facebook' => socialPublishFacebook(");
check('claim: the claim runs before any platform dispatch',
    $claimPos !== false && $dispatchPos !== false && $claimPos < $dispatchPos);
check('claim: a lost claim returns skipped and persists nothing (no failure write on that path)',
    str_contains($publisher, "'skipped' => true")
    && str_contains($publisher, 'Target already claimed by another publish run'));
check('claim: the OLD unconditional publishing UPDATE is gone',
    !str_contains($publisher, '$pdo->prepare("UPDATE social_post_targets SET status = \'publishing\', attempts = attempts + 1, updated_at = UTC_TIMESTAMP() WHERE id = ?")'));
check('claim: watchdog uncounts and ignores a skipped target (no attempt burned)',
    str_contains($publisher, "if (!empty(\$result['skipped'])) \$out['retried']--;"));

// ── FIX 2: hook-question derivation ────────────────────────────────────
check('hook: one-line caption is cut at the hook question, before the CTA and hashtags',
    socialHookQuestion('Meri salary aap ke account mein jaye gi?! Aakhir tak dekho. Apna rishta dhoondho shiarishta.com par. #ShiaRishta #Nikah')
    === 'Meri salary aap ke account mein jaye gi?!');
check('hook: multi-line caption uses the first line only',
    socialHookQuestion("Nikah parson, rukhsati isi hafte?!\nMeri zindagi koi jaldi wala sauda nahi!") === 'Nikah parson, rukhsati isi hafte?!');
check('hook: a dotted domain in the hook is not a sentence end',
    socialHookQuestion('Kya shiarishta.com par rishta mile ga? Aakhir tak dekho.') === 'Kya shiarishta.com par rishta mile ga?');
check('hook: no sentence punctuation keeps the whole first line',
    socialHookQuestion('Phone rakh do, phir baat karo') === 'Phone rakh do, phir baat karo');
check('hook: empty caption yields no question', socialHookQuestion('') === '');
check('hook: whitespace caption yields no question', socialHookQuestion("  \n  ") === '');
check('hook: the comment text is length-capped at 280 chars',
    mb_strlen(socialHookQuestion(str_repeat('Lambi kahani ', 40) . '?')) <= 280);

// ── FIX 2: first comment is best-effort and FB/IG only ─────────────────
$r = socialPostFirstComment([], 'youtube', 'vid123', 'Koi sawaal hai?');
check('comment: YouTube is skipped (no comment step in its flow)', ($r['skipped'] ?? false) === true && ($r['ok'] ?? true) === false);
$r = socialPostFirstComment([], 'facebook', 'post123', '');
check('comment: a caption with no hook question is skipped, not an error', ($r['skipped'] ?? false) === true);
$r = socialPostFirstComment([], 'instagram', '', 'Sawaal hai?');
check('comment: a missing platform post id is skipped, not an error', ($r['skipped'] ?? false) === true);
check('comment: Facebook posts to /{post-id}/comments',
    str_contains($publisher, "'/comments'") && str_contains($publisher, "urlencode(\$platformPostId) . '/comments'"));
check('comment: the comment body is the derived hook question',
    str_contains($publisher, "'message' => \$question"));
check('comment: socialPostFirstComment never throws (Throwable is caught)',
    str_contains($publisher, "} catch (Throwable \$e) {\n        return ['ok' => false, 'error' => 'First comment: '"));
check('comment: publish path attempts the comment only after a successful FB/IG publish',
    str_contains($publisher, "if (!empty(\$result['ok']) && in_array((string)\$target['platform'], ['facebook', 'instagram'], true))"));
check('comment: a comment failure is carried on the result as comment_error',
    str_contains($publisher, "\$result['comment_error'] = (string)(\$comment['error'] ?? 'unknown error');"));
check('comment: a skipped comment is NOT recorded as an error',
    str_contains($publisher, "if (empty(\$comment['ok']) && empty(\$comment['skipped']))"));

// ── FIX 2: the published note (failure of an extra never fails the post) ─
check('note: clean publish has no note', socialPublishedNote(['ok' => true]) === null);
check('note: thumbnail failure keeps the exact legacy wording',
    socialPublishedNote(['thumbnail_error' => 'HTTP 403']) === 'Published OK; custom thumbnail not set: HTTP 403');
check('note: comment failure is noted, publish stays published',
    socialPublishedNote(['comment_error' => 'HTTP 400']) === 'Published OK; first comment not posted: HTTP 400');
check('note: both failures combine into one note',
    socialPublishedNote(['thumbnail_error' => 'T', 'comment_error' => 'C'])
    === 'Published OK; custom thumbnail not set: T; first comment not posted: C');
check('note: success persistence writes the shared note builder',
    str_contains($publisher, '$note = socialPublishedNote($result);'));

// ── FIX 3: cap window — active through 2026-11-25, gone after ──────────
$cfg = ['cap' => 8, 'until' => '2026-11-25'];
check('cap: active before the window end', socialFacebookCapForDate($cfg, '2026-11-22') === 8);
check('cap: still active ON the last day (through 2026-11-25 inclusive)', socialFacebookCapForDate($cfg, '2026-11-25') === 8);
check('cap: EXPIRED the day after — no cap at all', socialFacebookCapForDate($cfg, '2026-11-26') === null);
check('cap: long after expiry there is still no cap', socialFacebookCapForDate($cfg, '2027-01-01') === null);
check('cap: a zero cap in config disables the test', socialFacebookCapForDate(['cap' => 0, 'until' => '2026-11-25'], '2026-11-23') === null);
check('cap: no config means no cap', socialFacebookCapForDate(null, '2026-11-23') === null);
check('cap: defaults are 8/day through 2026-11-25',
    SOCIAL_FB_CAP_DEFAULT_CAP === 8 && SOCIAL_FB_CAP_DEFAULT_UNTIL === '2026-11-25');

// ── FIX 3: 8 allowed, the 9th is deferred ──────────────────────────────
check('cap: 0 published today — publish allowed', socialFacebookCapAllows(0, 8) === true);
check('cap: 7 published today — the 8th is allowed', socialFacebookCapAllows(7, 8) === true);
check('cap: 8 published today — the 9th is NOT allowed (deferred)', socialFacebookCapAllows(8, 8) === false);
check('cap: beyond the cap stays deferred', socialFacebookCapAllows(12, 8) === false);
check('cap: no cap (expired) allows any count', socialFacebookCapAllows(99, null) === true);

// ── FIX 3: New York day bounds (the cap counts NY calendar days) ───────
[$d, $s, $e] = socialNyDayBoundsUtc(strtotime('2026-11-23 04:30:00 UTC')); // 23:30 EST on Nov 22
check('cap: 04:30 UTC is still Nov 22 in New York', $d === '2026-11-22');
check('cap: NY day starts 05:00 UTC in standard time', $s === '2026-11-22 05:00:00' && $e === '2026-11-23 05:00:00');
[$d, $s, $e] = socialNyDayBoundsUtc(strtotime('2026-07-01 12:00:00 UTC')); // DST: EDT = UTC-4
check('cap: NY day starts 04:00 UTC in daylight time', $d === '2026-07-01' && $s === '2026-07-01 04:00:00' && $e === '2026-07-02 04:00:00');

// ── FIX 3: deferral wiring — pending, parked, never failed ─────────────
check('cap: config is stored in social_state under the test key',
    str_contains($publisher, "SOCIAL_FB_CAP_STATE_KEY = 'fb_daily_cap_test'")
    && str_contains($publisher, 'socialStateGet(SOCIAL_FB_CAP_STATE_KEY)'));
check('cap: the count reads Facebook targets published inside the NY day bounds',
    str_contains($publisher, "WHERE platform = 'facebook' AND status = 'published'")
    && str_contains($publisher, 'AND published_at >= ? AND published_at < ?'));
check('cap: the cap is checked only for Facebook targets',
    str_contains($publisher, "(string)\$target['platform'] === 'facebook' ? socialFacebookCapDeferral(\$pdo, time()) : null"));
check('cap: a capped target returns a deferred result',
    str_contains($publisher, "'deferred' => true"));
check('cap: deferral persists the target back to pending (never failed)',
    str_contains($publisher, 'if (empty($result[\'ok\']) && !empty($result[\'deferred\']))')
    && str_contains($publisher, "SET status = 'pending', error = ?, next_retry_at = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?"));
check('cap: deferral parks the target until the next NY midnight',
    str_contains($publisher, "'defer_until' => \$endUtc"));
check('cap: deferral returns before the failure persistence (failure rail untouched)',
    strpos($publisher, "!empty(\$result['deferred'])") < strpos($publisher, "SET status = 'failed', error = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?"));
check('cap: watchdog leaves deferred targets alone (no retry attempt burned)',
    str_contains($publisher, "!empty(\$result['deferred'])"));
check('cap: cron selection requires an actionable target (parked posts cannot starve the queue)',
    str_contains($cron, 'EXISTS (SELECT 1 FROM social_post_targets t')
    && str_contains($cron, 't.next_retry_at IS NULL OR t.next_retry_at <= UTC_TIMESTAMP()'));

echo $failures === 0 ? "ALL PASS\n" : "{$failures} FAILURE(S)\n";
exit($failures === 0 ? 0 : 1);
