<?php
/**
 * Static-SEO shell checks.
 *
 * The deployed HTML shipped an EMPTY <div id="root">, so any consumer that does
 * not execute JavaScript read a shell with no headings, no navigation landmark
 * and a 0.0% text-to-HTML ratio. Google executes JS; social scrapers, link
 * preview bots and most SEO checkers do not.
 *
 * Assertions run against index.html with comments stripped, so the prose
 * explaining the shell cannot satisfy them by itself.
 */
declare(strict_types=1);

$html = (string)file_get_contents(__DIR__ . '/../../index.html');
// Comments are stripped before counting: the shell's own comment says
// "found 0 <h1>...", which would otherwise register as a heading and let the
// test pass while the served page stayed empty.
$doc = (string)preg_replace('/<!--.*?-->/s', '', $html);
$text = trim((string)preg_replace('/\s+/', ' ', strip_tags($doc)));

$pass = 0;
$fail = 0;
function check(string $label, bool $ok, string $detail = ''): void
{
    global $pass, $fail;
    if ($ok) { $pass++; echo "PASS  $label\n"; }
    else { $fail++; echo "FAIL  $label" . ($detail !== '' ? " — $detail" : '') . "\n"; }
}

$count = static fn(string $re): int => preg_match_all($re, $doc);

check('exactly one <html> element', $count('/<html[\s>]/') === 1, 'found ' . $count('/<html[\s>]/'));
check('exactly one <body> element', $count('/<body[\s>]/') === 1, 'found ' . $count('/<body[\s>]/'));
check(
    'exactly one #root mount point',
    $count('/id="root"/') === 1,
    'found ' . $count('/id="root"/') . ' — createRoot would target the wrong node'
);

// ── The five issues the audit reported ───────────────────────────────────────
check('exactly one H1', $count('/<h1[\s>]/') === 1, 'found ' . $count('/<h1[\s>]/'));
check('page has a heading hierarchy', $count('/<h2[\s>]/') >= 3, 'only ' . $count('/<h2[\s>]/') . ' H2');
check('page has a navigation landmark', $count('/<nav[\s>]/') >= 1, 'no <nav> found');
check('navigation landmark is labelled', $count('/<nav[^>]*aria-label=/') >= 1, 'unlabelled nav');
check(
    'heading levels do not skip (h2 before h3)',
    strpos($doc, '<h2') !== false && strpos($doc, '<h2') < strpos($doc, '<h3'),
    'an H3 appears before the first H2'
);

// ── Content substance ────────────────────────────────────────────────────────
check(
    'text-to-HTML ratio is no longer thin',
    strlen($text) > 1500,
    'only ' . strlen($text) . ' chars of text (' . (int)round(strlen($text) / max(1, strlen($doc)) * 100) . '% of doc)'
);

// ── Legal and trust signals the audit asked for ─────────────────────────────
check('privacy policy is linked', preg_match('/href="\/privacy"/', $doc) === 1, 'no privacy link');
check('terms of use are linked', preg_match('/href="\/terms"/', $doc) === 1, 'no terms link');
check('a contact route is reachable', preg_match('/href="\/contact"/', $doc) === 1, 'no contact route');
check('pricing is stated', stripos($doc, 'free') !== false, 'the page never says if it costs anything');

// ── Honesty guards ───────────────────────────────────────────────────────────
// The shell exists to satisfy a crawler, which is exactly where fabrication
// creeps in. These fail if a testimonial or a member count is ever hardcoded
// into a static file that cannot possibly know the truth.
check(
    'no invented testimonials in the static shell',
    preg_match('/testimonial/i', $doc) !== 1,
    'a testimonial is hardcoded in static HTML'
);
check(
    'no invented review scores or star ratings',
    preg_match('/\b[45](\.\d)?\s*(\/\s*5|stars?|\bout of 5\b)/i', $doc) !== 1,
    'a rating is hardcoded in static HTML'
);
check(
    'no hardcoded member count (a static file cannot know it)',
    preg_match('/\b[\d,]+\+?\s+(members|families|couples|brides|grooms)\b/i', $doc) !== 1,
    'a member count is hardcoded — it will go stale and mislead'
);
check(
    'no invented "trusted by" claim',
    preg_match('/trusted by/i', $doc) !== 1,
    'an unverifiable "trusted by" claim is in the static shell'
);

// ── Correctness of the no-JS reveal ──────────────────────────────────────────
// If this breaks, either the shell sits on top of the React app (duplicate
// content) or a no-JS user gets a blank page. Both are worse than the original
// problem, so the gate is asserted rather than eyeballed.
// The shell is NOT hidden by a CSS class. It used to be, and the collapse
// caused a measured CLS of 0.275 on a throttled Pixel 5. React's createRoot
// clears #root when it mounts, so the shell is replaced in a single commit
// with no intermediate collapse. Assert the CSS rule stays gone.
check(
    'the shell is not hidden by a CSS class when JS runs',
    preg_match('/\.js\s+\.seo-static\s*\{[^}]*display:\s*none/', $doc) !== 1,
    'a class-based hide rule is present — it collapses the shell to zero height before React mounts and reintroduces the layout shift'
);
check(
    'main.jsx marks the document as JS-enabled',
    strpos((string)file_get_contents(__DIR__ . '/../../src/main.jsx'), "classList.add('js')") !== false,
    'main.jsx does not add html.js, so the reveal gate never opens'
);
check(
    'the shell lives inside #root so React replaces it',
    preg_match('/<div id="root"><div class="seo-static">/', $doc) === 1,
    'the shell is not the first child of #root'
);
check(
    'body has an explicit background colour (no white flash)',
    preg_match('/<body[^>]*style="[^"]*background-color/', $doc) === 1,
    'no background-color on <body>: dark-theme users get a white flash'
);

// ── Links must resolve to real routes ────────────────────────────────────────
$router = (string)file_get_contents(__DIR__ . '/../../src/routes.jsx');
$links = [];
preg_match_all('/<a href="(\/[a-z0-9\/-]*)"/', $doc, $m);
foreach ($m[1] as $href) $links[$href] = true;
$dead = [];
foreach (array_keys($links) as $href) {
    $route = rtrim($href, '/');
    if ($route === '' || $route === '/') continue;
    if (strpos($router, "path: '" . $route . "'") === false
        && strpos($router, 'path: "' . $route . '"') === false) {
        $dead[] = $href;
    }
}
check(
    'every static link maps to a real route',
    $dead === [],
    'no route in src/routes.jsx for: ' . implode(', ', $dead)
);

echo "\n$pass passed, $fail failed\n";
exit($fail === 0 ? 0 : 1);


