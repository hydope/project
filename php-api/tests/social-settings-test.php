<?php
// Test for the 2026-11-23 scheduler Settings panel:
//
//   Every operational knob of the social scheduler lives in
//   social_state and is read at runtime by the publisher, watchdog,
//   autopilot and storage lifecycle — the admin Settings panel edits
//   the same rows, so changing a value never needs a code edit or a
//   deploy. Covered here:
//     · socialSettingsMerge — stored JSON merged over defaults that
//       reproduce the pre-panel behaviour, validated/clamped per field.
//     · socialNextSlotTs — the configured posting-slot computation.
//     · Watchdog retry policy — settings max-attempts + backoff base
//       via socialWatchdogAfterFailure's optional parameters, with
//       the 1-arg shipped behaviour unchanged.
//     · The Facebook cap JSON the settings endpoint writes round-trips
//       through the publisher's own parser unchanged ({cap, until}).
//     · Wiring pinned by contract strings across the routes file,
//       publisher, storage and autopilot libs.
//
// Run: php tests/social-settings-test.php
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
$storage = (string)file_get_contents($root . '/lib/SocialStorage.php');
$autopilot = (string)file_get_contents($root . '/lib/SocialAutopilot.php');

// ── Defaults reproduce the pre-panel behaviour ────────────────────────
$d = socialSettingsMerge(null);
check('defaults: instagram cap is null (no publisher cap)', $d['dailyCaps']['instagram'] === null);
check('defaults: youtube cap is null (no publisher cap)', $d['dailyCaps']['youtube'] === null);
check('defaults: nothing paused', $d['paused'] === ['facebook' => false, 'instagram' => false, 'youtube' => false]);
check('defaults: slots empty (hourly ladder)', $d['slots'] === []);
check('defaults: first-comment mode is stored', $d['firstCommentMode'] === 'stored');
check('defaults: retry is 6 attempts / 5 min base', $d['retry'] === ['maxAttempts' => 6, 'backoffMinutes' => 5]);
check('defaults: storage budget unset (legacy), purge 72h', $d['storage']['budgetGiB'] === null && $d['storage']['purgeHours'] === 72);
check('settings storage key', SOCIAL_SETTINGS_KEY === 'social_scheduler_settings');

// ── Merge: stored values applied and clamped ──────────────────────────
$m = socialSettingsMerge([
    'dailyCaps' => ['instagram' => 24, 'youtube' => 500],
    'paused' => ['youtube' => true],
    'slots' => ['18:00', '09:30', '18:00', 'bogus', '25:00'],
    'firstCommentMode' => 'off',
    'retry' => ['maxAttempts' => 3, 'backoffMinutes' => 10],
    'storage' => ['budgetGiB' => 4, 'purgeHours' => 48],
]);
check('merge: instagram cap 24 kept', $m['dailyCaps']['instagram'] === 24);
check('merge: youtube cap clamped to 100', $m['dailyCaps']['youtube'] === 100);
check('merge: youtube paused, others not', $m['paused']['youtube'] === true && $m['paused']['facebook'] === false);
check('merge: slots validated, deduped, sorted', $m['slots'] === ['09:30', '18:00']);
check('merge: first-comment mode off kept', $m['firstCommentMode'] === 'off');
check('merge: retry applied', $m['retry'] === ['maxAttempts' => 3, 'backoffMinutes' => 10]);
check('merge: storage applied', $m['storage']['budgetGiB'] === 4.0 && $m['storage']['purgeHours'] === 48);
$m2 = socialSettingsMerge(['firstCommentMode' => 'bogus', 'retry' => ['maxAttempts' => 0, 'backoffMinutes' => 0]]);
check('merge: invalid mode falls back to stored', $m2['firstCommentMode'] === 'stored');
check('merge: retry clamped to minimums', $m2['retry'] === ['maxAttempts' => 1, 'backoffMinutes' => 1]);

// ── Slot computation (UTC) ────────────────────────────────────────────
$times = ['09:30', '18:00'];
$morning = strtotime('2026-11-23 10:00:00 UTC');
check('slot: next is today 18:00', socialNextSlotTs($morning, $times) === strtotime('2026-11-23 18:00:00 UTC'));
$atSlot = strtotime('2026-11-23 18:00:00 UTC');
check('slot: strictly after — at 18:00 the next is tomorrow 09:30', socialNextSlotTs($atSlot, $times) === strtotime('2026-11-24 09:30:00 UTC'));
check('slot: empty times -> null (hourly fallback)', socialNextSlotTs($morning, []) === null);

// ── Watchdog retry policy parameters ──────────────────────────────────
$d1 = socialWatchdogAfterFailure(0);
check('retry: shipped behaviour unchanged (1st failure, 300s)', $d1['dead'] === false && $d1['delay_seconds'] === 300 && $d1['retry_attempts'] === 1);
$dDead = socialWatchdogAfterFailure(5);
check('retry: shipped cap still declares dead at 6', $dDead['dead'] === true);
$dCap = socialWatchdogAfterFailure(2, 3, 5);
check('retry: settings cap 3 declares dead on the 3rd attempt', $dCap['dead'] === true);
$dScale = socialWatchdogAfterFailure(1, 6, 10);
check('retry: backoff base 10 doubles the table (900s -> 1800s)', $dScale['dead'] === false && $dScale['delay_seconds'] === 1800);

// ── Facebook cap JSON round-trip (endpoint write -> publisher read) ──
$cfg = json_decode((string)json_encode(['cap' => 24, 'until' => '2026-11-25']), true);
check('fb cap: 24 applies on the last window day', socialFacebookCapForDate($cfg, '2026-11-25') === 24);
check('fb cap: window over the day after', socialFacebookCapForDate($cfg, '2026-11-26') === null);
check('fb cap: cap 0 switches the cap off', socialFacebookCapForDate(['cap' => 0, 'until' => '2026-11-25'], '2026-11-24') === null);

// ── Wiring contract strings ───────────────────────────────────────────
check('routes: settings dispatch registered', str_contains($routes, "\$sub === 'settings'"));
check('routes: activity dispatch registered', str_contains($routes, "\$sub === 'activity'"));
check('routes: fb cap written through socialStateSet on the publisher key', str_contains($routes, 'socialStateSet(SOCIAL_FB_CAP_STATE_KEY'));
check('routes: settings saved via socialSchedulerSettingsSave', str_contains($routes, 'socialSchedulerSettingsSave($settings)'));
check('routes: cap changes release deferred targets', str_contains($routes, 'socialReleaseCapDeferredTargets'));
check('publisher: pause gate wired into publish', str_contains($publisher, 'socialPlatformPaused($platform)'));
check('publisher: settings cap deferral wired for instagram/youtube', str_contains($publisher, 'socialSettingsCapDeferral($pdo, $platform'));
check('publisher: first-comment mode honoured', str_contains($publisher, "['firstCommentMode']"));
check('publisher: watchdog sweep reads settings retry policy', str_contains($publisher, "socialSchedulerSettings()['retry']"));
check('storage: budget reads settings', str_contains($storage, "socialSchedulerSettings()['storage']['budgetGiB']"));
check('storage: purge grace passed from settings', str_contains($storage, "socialSchedulerSettings()['storage']['purgeHours']"));
check('autopilot: slot times read from settings', str_contains($autopilot, "socialSchedulerSettings()['slots']"));
check('routes: ingest slot reads settings', str_contains($routes, "socialSchedulerSettings()['slots']"));

echo $failures === 0 ? "\nALL PASS\n" : "\n{$failures} FAILURE(S)\n";
exit($failures === 0 ? 0 : 1);
