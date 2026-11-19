<?php
// Server-side render for individual profile URLs (/profiles/<id>).
//
// GET /profiles/<id> — the .htaccess rewrite lands here via the front
// controller (REQUEST_URI keeps the public path, so index.php dispatches
// on resource 'profiles' WITHOUT the /api prefix and with one segment).
//
// ── The rule this implements ────────────────────────────────────────────
// A profile URL tells crawlers the truth about the profile, from the
// database, in the first response:
//   * Genuinely public profile (finished, not private, not blocked, not
//     a test shell, visible to a signed-out visitor) → HTTP 200 with the
//     profile's real public content server-rendered — the same fields
//     visibleProfile() already exposes to anonymous API callers, no
//     photo (photo access has its own endpoint and visibility rules).
//   * Anything else — private, unfinished, blocked, test, deleted, or
//     simply nonexistent → HTTP 404 with the SPA shell, the exact
//     response the old .htaccess R=404 rule produced. Browsers still
//     boot the app from that shell, so a signed-in owner or mutual match
//     sees the profile client-side exactly as before; crawlers get an
//     honest status instead of a soft-404 homepage duplicate.
//
// History: 209 sitemap'd profile URLs serving the homepage shell with
// HTTP 200 were judged soft 404s (2026-11-15, G1) and profile URLs were
// pulled from the sitemap and forced to 404. That stopped the damage
// but threw away the real pages too. With this SSR, public profiles are
// real pages again — and they stay OUT of the sitemap on purpose: a
// member can delete or privatise a profile at any moment, and a sitemap
// full of fresh 404s is the G1 failure all over again. Discovery runs
// through the browse page, whose SSR grid and app cards link here.
declare(strict_types=1);

function profileSsr(string $id): void
{
    $root = dirname(__DIR__, 2);
    $shellPath = $root . '/index.html';
    $shell = is_readable($shellPath) ? file_get_contents($shellPath) : false;
    if ($shell === false) {
        json(['error' => 'Service unavailable'], 503);
    }

    $serve404 = static function () use ($shell): void {
        http_response_code(404);
        header('Content-Type: text/html; charset=utf-8');
        echo $shell;
    };

    try {
        $stmt = db()->prepare('SELECT * FROM profiles WHERE user_id = ? LIMIT 1');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
    } catch (Throwable $e) {
        $row = false;
    }
    if ($row === false || isTestShellRow($row)) {
        $serve404();
        return;
    }
    // Finished-profile predicate — the same definition the sitemap and
    // filter-options use: a profile with no place, no bio and no family
    // text is a signup shell, not a page.
    $unfinished = trim((string)($row['city'] ?? '')) === ''
        && trim((string)($row['country'] ?? '')) === ''
        && trim((string)($row['bio'] ?? '')) === ''
        && trim((string)($row['about_family'] ?? '')) === '';
    if ($unfinished) {
        $serve404();
        return;
    }
    // The anonymous view IS the public-truth test: it returns null for
    // blocked, private and unverified-blocked profiles, and its field
    // set is exactly what a signed-out visitor may see.
    $view = visibleProfile($row, null);
    if ($view === null) {
        $serve404();
        return;
    }

    $esc = static fn($s): string => htmlspecialchars((string)($s ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $name = (string)($view['displayName'] ?? 'Member');
    $age = $view['age'] ?? null;
    $city = (string)($view['city'] ?? '');
    $country = (string)($view['country'] ?? '');
    $place = trim($city . ', ' . $country, ', ');
    $url = 'https://shiarishta.com/profiles/' . rawurlencode($id);

    $titleParts = [$name];
    if (!empty($age)) {
        $titleParts[] = (string)$age;
    }
    if ($place !== '') {
        $titleParts[] = $place;
    }
    $fullTitle = implode(', ', $titleParts) . ' | Shia Rishta';

    $descParts = [$name . ' is a Shia Muslim'];
    if (!empty($age)) {
        $descParts[] = 'age ' . $age;
    }
    if (!empty($view['profession'])) {
        $descParts[] = (string)$view['profession'];
    }
    if ($place !== '') {
        $descParts[] = 'based in ' . $place;
    }
    $desc = implode(', ', $descParts) . ', seeking nikah on Shia Rishta — the nikah-first Shia matrimony platform.';
    if (!empty($view['bio'])) {
        $bio = trim((string)$view['bio']);
        $desc = strlen($bio) > 160 ? substr($bio, 0, 157) . '…' : $bio;
    }

    // ── <head>: title, description, canonical, Open Graph (blog-ssr pattern) ──
    $html = preg_replace('/<title>.*?<\/title>/s', '<title>' . $esc($fullTitle) . '</title>', $shell, 1);
    $html = preg_replace(
        '/<meta name="description" content="[^"]*" \/>/',
        '<meta name="description" content="' . $esc($desc) . '" />',
        $html,
        1
    );
    $html = preg_replace(
        '/<link rel="canonical" href="[^"]*" \/>/',
        '<link rel="canonical" href="' . $esc($url) . '" />',
        $html,
        1
    );
    $ogReplacements = [
        '/<meta property="og:url" content="[^"]*" \/>/' =>
            '<meta property="og:url" content="' . $esc($url) . '" />',
        '/<meta property="og:title" content="[^"]*" \/>/' =>
            '<meta property="og:title" content="' . $esc($fullTitle) . '" />',
        '/<meta property="og:description" content="[^"]*" \/>/' =>
            '<meta property="og:description" content="' . $esc($desc) . '" />',
    ];
    foreach ($ogReplacements as $pattern => $replacement) {
        $html = preg_replace($pattern, $replacement, $html, 1);
    }

    // ── Person JSON-LD ──
    $person = [
        '@context' => 'https://schema.org',
        '@type' => 'Person',
        'name' => $name,
        'url' => $url,
    ];
    if ($place !== '') {
        $person['homeLocation'] = ['@type' => 'Place', 'name' => $place];
    }
    if (!empty($view['profession'])) {
        $person['jobTitle'] = (string)$view['profession'];
    }
    $jsonLdTag = '<script type="application/ld+json" id="profile-jsonld">'
        . json_encode($person, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
        . '</script>';
    $html = str_replace('</head>', $jsonLdTag . "\n</head>", $html);

    // ── #root: the profile as real HTML ──
    $meta = [];
    if (!empty($age)) {
        $meta[] = 'Age ' . $esc($age);
    }
    if (!empty($view['gender'])) {
        $meta[] = $esc(ucfirst((string)$view['gender']));
    }
    if ($place !== '') {
        $meta[] = $esc($place);
    }
    $body = '<article>'
        . '<h1>' . $esc($name) . '</h1>';
    if ($meta !== []) {
        $body .= '<p>' . implode(' · ', $meta) . '</p>';
    }
    $facts = [
        'Profession' => $view['profession'] ?? null,
        'Sect' => $view['sect'] ?? null,
        'Religiosity' => $view['religiosity'] ?? null,
        'Education' => $view['educationLevel'] ?? null,
    ];
    foreach ($facts as $label => $value) {
        if (!empty($value)) {
            $body .= '<p>' . $label . ': ' . $esc($value) . '</p>';
        }
    }
    if (!empty($view['bio'])) {
        $body .= '<h2>About</h2><p>' . $esc($view['bio']) . '</p>';
    }
    if (!empty($view['expectations'])) {
        $body .= '<h2>Looking for</h2><p>' . $esc($view['expectations']) . '</p>';
    }
    if (!empty($view['aboutFamily'])) {
        $body .= '<h2>Family</h2><p>' . $esc($view['aboutFamily']) . '</p>';
    }
    $body .= '<p><a href="/profiles/">Browse more Shia profiles</a> · '
        . '<a href="/auth/register">Join free to express interest</a></p>'
        . '</article>';
    $html = preg_replace(
        '/<div id="root">.*<\/div>\s*<\/body>/s',
        '<div id="root">' . $body . '</div></body>',
        $html,
        1
    );

    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    echo $html;
}
