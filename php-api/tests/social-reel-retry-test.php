<?php
// Test for Facebook Reel upload robustness (2026-11-22): the 07:00
// post died with "HTTP 503 (Reel attempt: Facebook Reel transfer:
// (#100) Param upload_phase must be one of {START, FI…" — the old
// flow sent a 'transfer' upload_phase to the video_reels endpoint,
// which the Graph API does not define (transfer is a POST to the
// session's own upload_url), and a single transient failure failed
// the whole target. Same pattern as the other social tests: the pure
// retry classifier is exercised behaviourally, and CONTRACT strings
// pin the session flow + fresh-session restart loop + the plain
// video-post fallback, since the live flow needs Meta tokens.
//
// Run: php tests/social-reel-retry-test.php
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

$res = static fn(int $status, ?array $json = null, ?string $error = null): array => [
    'status' => $status, 'json' => $json, 'raw' => '', 'error' => $error, 'headers' => [],
];

// ── Classifier: transient failures earn a fresh session ────────────────
check('retryable: Meta 503', socialReelFailureRetryable($res(503, ['error' => ['message' => 'Service temporarily unavailable', 'code' => 2]])));
check('retryable: bare HTTP 500 with no json', socialReelFailureRetryable($res(500)));
check('retryable: network error', socialReelFailureRetryable($res(0, null, 'Network error: Connection timed out')));
check('retryable: the 2026-11-22 upload_phase (#100) error',
    socialReelFailureRetryable($res(400, ['error' => ['message' => '(#100) Param upload_phase must be one of {START, FINISH}', 'code' => 100]])));
check('retryable: transient Graph code 613 (rate limit)', socialReelFailureRetryable($res(400, ['error' => ['message' => 'Calls too frequent', 'code' => 613]])));
check('retryable: transient Graph code 1 (unknown error)', socialReelFailureRetryable($res(400, ['error' => ['message' => 'An unknown error occurred', 'code' => 1]])));

// ── Classifier: deterministic failures do NOT burn restarts ────────────
check('not retryable: token error 190', !socialReelFailureRetryable($res(401, ['error' => ['message' => 'Invalid OAuth access token', 'code' => 190]])));
check('not retryable: permission error 200', !socialReelFailureRetryable($res(403, ['error' => ['message' => 'Permissions error', 'code' => 200]])));
check('not retryable: plain 400 validation', !socialReelFailureRetryable($res(400, ['error' => ['message' => 'Invalid parameter', 'code' => 100]])));

// ── Session flow contract: START → upload_url transfer → FINISH ────────
check('session: a dedicated one-session function exists', str_contains($publisher, 'function socialFacebookReelSession('));
check('session: START asks for upload_phase=start', str_contains($publisher, "'upload_phase' => 'start'"));
check('session: START reads the returned upload_url', str_contains($publisher, "\$start['json']['upload_url']"));
check('session: transfer POSTs the file_url header to the session upload URL',
    str_contains($publisher, "'file_url: ' . \$url") && str_contains($publisher, "'Authorization: OAuth ' . \$token"));
check('session: FINISH publishes with video_state=PUBLISHED',
    str_contains($publisher, "'upload_phase' => 'finish'") && str_contains($publisher, "'video_state' => 'PUBLISHED'"));
check('session: NO transfer upload_phase is sent to video_reels (the #100 bug)',
    !str_contains($publisher, "'upload_phase' => 'transfer'"));

// ── Restart loop contract: fresh session per attempt, max 3 ────────────
check('reel: restart loop runs up to 3 fresh sessions', str_contains($publisher, 'while ($attempts < 3)'));
check('reel: every attempt calls the session function anew (fresh video_id)',
    str_contains($publisher, '$r = socialFacebookReelSession($pageId, $token, $url, $caption, $v);'));
check('reel: a non-retryable failure stops the loop immediately',
    str_contains($publisher, "if (empty(\$r['retryable']) || \$attempts >= 3) break;"));
check('reel: exhausted attempts report how many sessions were tried',
    str_contains($publisher, 'fresh upload sessions'));

// ── Fallback contract: a plain video post beats no post ────────────────
$fbPos = strpos($publisher, 'function socialPublishFacebook(');
$reelPos = strpos($publisher, '$reel = socialFacebookReel(', (int)$fbPos);
$fallbackPos = strpos($publisher, 'graph-video.facebook.com', (int)$fbPos);
check('fallback: socialPublishFacebook tries the Reel first, then graph-video /videos',
    $fbPos !== false && $reelPos !== false && $fallbackPos !== false && $reelPos < $fallbackPos);
check('fallback: the plain-post error keeps the Reel attempt context',
    str_contains($publisher, "(Reel attempt: ' . (\$reel['error'] ?? 'n/a') . ')"));

echo $failures === 0 ? "\nALL PASS\n" : "\n{$failures} FAILURE(S)\n";
exit($failures === 0 ? 0 : 1);
