<?php
// Offline test for socialDiscoverMetaPages() / socialGraphListAll() in
// routes/social_scheduler.php — the Meta OAuth callback page discovery.
//
// Regression coverage for the 2026-11-21 connect failures:
//   (a) Facebook Login for Business asset-scoped grant -> /me/accounts
//       returned EMPTY although the user granted the Shia Rishta Page;
//       discovery must fall back to /me/businesses owned/client pages.
//   (b) "All assets" grant -> /me/accounts returned several pages and
//       the page with the linked Instagram account must sort first (it
//       is the account autopilot/ingest pick by default), and a page
//       whose IG link is only visible via the business route must be
//       merged in, not dropped.
//
// socialHttp() is stubbed here with a URL-pattern -> response map, so
// no network and no SocialPublisher.php include. Run: php tests/social-discovery-test.php
declare(strict_types=1);

$GLOBALS['stubRoutes'] = [];
$GLOBALS['stubCalls'] = [];

function socialHttp(string $method, string $url, array $opts = []): array
{
    $GLOBALS['stubCalls'][] = $url;
    foreach ($GLOBALS['stubRoutes'] as $pattern => $json) {
        if (str_contains($url, $pattern)) {
            return ['status' => 200, 'json' => $json, 'raw' => (string)json_encode($json), 'error' => null, 'headers' => []];
        }
    }
    return ['status' => 400, 'json' => ['error' => ['message' => 'unstubbed: ' . $url]], 'raw' => '', 'error' => null, 'headers' => []];
}

require __DIR__ . '/../routes/social_scheduler.php';

$failures = 0;
function check(string $label, bool $cond): void
{
    global $failures;
    echo ($cond ? 'PASS' : 'FAIL') . '  ' . $label . "\n";
    if (!$cond) $failures++;
}
function stub(array $routes): void
{
    $GLOBALS['stubRoutes'] = $routes;
    $GLOBALS['stubCalls'] = [];
}

$V = 'v21.0';
$shiaPage = ['id' => '222', 'name' => 'Shia Rishta', 'access_token' => 'PT2',
             'instagram_business_account' => ['id' => '999', 'username' => 'shiarishta.official']];
$otherPage = ['id' => '111', 'name' => 'Syedinusa', 'access_token' => 'PT1'];

// ── Scenario A: /me/accounts empty -> business fallback finds the page ──
stub([
    '/me/accounts' => ['data' => []],
    '/me/businesses' => ['data' => [['id' => '2222291815376368', 'name' => 'Shia Rishta']]],
    '/owned_pages' => ['data' => [$shiaPage]],
    '/client_pages' => ['data' => []],
]);
$pages = socialDiscoverMetaPages('UT', $V);
check('A: business fallback finds 1 page when /me/accounts is empty', count($pages) === 1 && $pages[0]['id'] === '222');
check('A: fallback page carries its IG account', ($pages[0]['instagram_business_account']['id'] ?? '') === '999');

// ── Scenario B: several pages, IG-linked one sorts first ────────────────
stub([
    '/me/accounts' => ['data' => [$otherPage, $shiaPage]],
    '/me/businesses' => ['data' => []],
]);
$pages = socialDiscoverMetaPages('UT', $V);
check('B: both pages returned', count($pages) === 2);
check('B: IG-linked page sorts first', $pages[0]['id'] === '222');

// ── Scenario C: IG link only visible via business route gets merged ────
$shiaNoIg = ['id' => '222', 'name' => 'Shia Rishta', 'access_token' => 'PT2'];
stub([
    '/me/accounts' => ['data' => [$shiaNoIg]],
    '/me/businesses' => ['data' => [['id' => '2222291815376368', 'name' => 'Shia Rishta']]],
    '/owned_pages' => ['data' => [$shiaPage]],
    '/client_pages' => ['data' => [$otherPage]],
]);
$pages = socialDiscoverMetaPages('UT', $V);
check('C: business route consulted when no page has an IG link', count($pages) === 2);
check('C: IG link merged onto the /me/accounts page', ($pages[0]['id'] ?? '') === '222' && ($pages[0]['instagram_business_account']['id'] ?? '') === '999');
check('C: merged page kept its access_token', ($pages[0]['access_token'] ?? '') === 'PT2');

// ── Scenario D: truly nothing visible -> empty (callback errors) ───────
stub([
    '/me/accounts' => ['data' => []],
    '/me/businesses' => ['data' => []],
]);
check('D: zero pages after both routes returns []', socialDiscoverMetaPages('UT', $V) === []);

// ── Scenario E: pagination is followed ──────────────────────────────────
$GLOBALS['stubRoutes'] = [];
$GLOBALS['stubCalls'] = [];
$pagesE = socialGraphListAll('https://graph.facebook.com/' . $V . '/me/accounts?fields=id', 'UT');
check('E: unstubbed/error response yields [] without throwing', $pagesE === []);

// ── Scenario F: Graph ERROR on /me/accounts falls through to business ───
// Round-2 root cause shape: without business_management in the requested
// scopes the business route errored; with any route erroring, discovery
// must record the error in $diag (not swallow it as "empty") and still
// fall through to the routes that work.
stub([
    '/me/accounts' => ['error' => ['code' => 200, 'error_subcode' => 0, 'message' => '(#200) Requires business_management permission']],
    '/me/businesses' => ['data' => [['id' => '2222291815376368', 'name' => 'Shia Rishta']]],
    '/owned_pages' => ['data' => [$shiaPage]],
    '/client_pages' => ['data' => []],
]);
$diagF = null;
$pages = socialDiscoverMetaPages('UT', $V, $diagF);
check('F: graph error on /me/accounts falls through to business route', count($pages) === 1 && $pages[0]['id'] === '222');
check('F: diag records the accounts-route Graph error, not "empty"', str_contains((string)($diagF['accounts'] ?? ''), 'error 200'));

// ── Scenario G: accounts routes empty, business route returns the page ──
stub([
    '/me/accounts' => ['data' => []],
    'fields=accounts' => ['accounts' => ['data' => []]],
    '/me/businesses' => ['data' => [['id' => '2222291815376368', 'name' => 'Shia Rishta']]],
    '/owned_pages' => ['data' => [$shiaPage]],
    '/client_pages' => ['data' => []],
]);
$diagG = null;
$pages = socialDiscoverMetaPages('UT', $V, $diagG);
check('G: business route returns the page when accounts routes are empty', count($pages) === 1 && $pages[0]['id'] === '222');
check('G: diag shows the businesses route succeeded', str_contains((string)($diagG['businesses'] ?? ''), '1 row'));

// ── Scenario H: no-pages diagnostic message ─────────────────────────────
// The callback builds its failure redirect from socialMetaNoPagesMessage
// + the /me/permissions declined list; the message must name the route
// error AND the declined permission, and must never carry token material.
$msgH = socialMetaNoPagesMessage(
    ['accounts' => 'error 200: (#200) Requires business_management permission', 'businesses' => 'empty'],
    ['business_management']
);
check('H: message names the route error', str_contains($msgH, 'accounts: error 200'));
check('H: message names the declined permission', str_contains($msgH, 'Permissions declined or not granted: business_management'));
check('H: message carries no token material', !str_contains($msgH, 'access_token') && !str_contains($msgH, 'UT'));

echo $failures === 0 ? "ALL PASS\n" : "$failures FAILURE(S)\n";
exit($failures === 0 ? 0 : 1);
