<?php
// Server-side render for the public browse page (/profiles).
//
// GET /profiles — the .htaccess rewrite lands here via the front
// controller (REQUEST_URI keeps the public path, so index.php dispatches
// on resource 'profiles' WITHOUT the /api prefix). Returns the
// prerendered browse document with the real member grid injected into
// the first response, plus a server-side noindex for filtered variants.
//
// ── Why this exists ─────────────────────────────────────────────────────
// The browse grid used to exist only after client-side JavaScript
// fetched /api/profiles. Search Console's URL-Inspection live test
// (2026-11-19) judged https://shiarishta.com/profiles a SOFT 404 and
// refused the indexing request: Google's renderer snapshots the page
// around the fetch, and a skeleton / "loading" grid reads as an error
// page. Blog posts had the identical disease and routes/blog-ssr.php
// cured it by serving the article in the first response; this is the
// same medicine for the directory.
//
// ── Data honesty ────────────────────────────────────────────────────────
// The cards are built from the SAME code path the anonymous API uses —
// the profilesList() roster conditions, isTestShellRow() and
// visibleProfile($row, null) — so the SSR can never show a member the
// API would hide, nor print a field the anonymous payload does not
// carry. Photos are deliberately NOT rendered: photo access has its own
// endpoint and per-member visibility rules, and a text card carries
// everything a crawler needs.
//
// ── Filtered variants ───────────────────────────────────────────────────
// /profiles?city=… (any query string) is faceted navigation, not a
// landing page: Seo.jsx marks it "noindex, follow" client-side, but a
// crawler reading only the first response saw the clean page's
// "index, follow" instead. The same directive is now swapped in
// server-side. The canonical already points at the clean /profiles URL.
//
// A 5-minute file cache (the sitemap cache's pattern) keeps TTFB low on
// shared hosting; the roster changes slowly and React re-fetches live
// data on boot for human visitors regardless.
declare(strict_types=1);

/** Build the member-grid section from the anonymous roster. Returns the
 * HTML, or null when anything fails — the caller then serves the plain
 * prerendered document rather than an error. */
function profilesSsrSection(): ?string
{
    // Roster conditions mirrored from profilesList() (routes/profiles.php)
    // for the anonymous viewer: not moderation-blocked, no test accounts.
    // Viewer-specific conditions (blocks, mutes, unverified-viewer rules)
    // do not apply to a public, signed-out render.
    $stmt = db()->prepare(
        'SELECT p.* FROM profiles p LEFT JOIN users u ON u.id = p.user_id
          WHERE (p.is_blocked = 0 OR (p.blocked_until IS NOT NULL AND p.blocked_until <= NOW()))
            AND p.user_id NOT IN (SELECT id FROM users WHERE is_test = 1)
          ORDER BY ' . profileListingOrderBy()
    );
    $stmt->execute([]);
    $rows = $stmt->fetchAll();
    // Same post-query shell filter as profilesList().
    $rows = array_values(array_filter(
        $rows,
        static fn(array $r): bool => !isTestShellRow($r)
    ));
    $views = [];
    foreach ($rows as $row) {
        $view = visibleProfile($row, null);
        if ($view === null) {
            continue;
        }
        // Mirror BrowseProfiles' client filter: a locked profile with no
        // public teaser never renders as a card for a guest.
        if (!empty($view['locked']) && empty($view['teaser'])) {
            continue;
        }
        $views[] = $view;
    }
    $total = count($views);
    if ($total === 0) {
        return null;
    }
    $esc = static fn($s): string => htmlspecialchars((string)($s ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $cards = '';
    foreach (array_slice($views, 0, 24) as $v) {
        $meta = [];
        if (!empty($v['age'])) {
            $meta[] = 'Age ' . $esc($v['age']);
        }
        if (!empty($v['gender'])) {
            $meta[] = $esc(ucfirst((string)$v['gender']));
        }
        $place = trim($esc($v['city'] ?? '') . ', ' . $esc($v['country'] ?? ''), ', ');
        if ($place !== '') {
            $meta[] = $place;
        }
        $cards .= '<article><h3><a href="/profiles/' . $esc($v['id'] ?? '') . '">'
            . $esc($v['displayName'] ?? 'Member') . '</a></h3>';
        if ($meta !== []) {
            $cards .= '<p>' . implode(' · ', $meta) . '</p>';
        }
        if (!empty($v['profession'])) {
            $cards .= '<p>' . $esc($v['profession']) . '</p>';
        }
        if (!empty($v['sect'])) {
            $cards .= '<p>' . $esc($v['sect']) . '</p>';
        }
        if (!empty($v['bio'])) {
            $bio = trim((string)$v['bio']);
            if (strlen($bio) > 200) {
                $bio = substr($bio, 0, 200) . '…';
            }
            $cards .= '<p>' . $esc($bio) . '</p>';
        }
        $cards .= '</article>';
    }
    return '<section aria-label="Members seeking nikah">'
        . '<h2>' . $total . ' members seeking nikah</h2>'
        . $cards
        . '<p><a href="/auth/register">Join free to view full profiles and express interest</a></p>'
        . '</section>';
}

function profilesSsr(): void
{
    // Shell: the PRERENDERED browse document (public_html/profiles/
    // index.html) — it already carries this route's title, description,
    // canonical and SEO sections. Fall back to the root shell, then to a
    // JSON 503, exactly like blogSsr().
    $root = dirname(__DIR__, 2);
    $shellPath = $root . '/profiles/index.html';
    if (!is_readable($shellPath)) {
        $shellPath = $root . '/index.html';
    }
    $shell = is_readable($shellPath) ? file_get_contents($shellPath) : false;
    if ($shell === false) {
        json(['error' => 'Service unavailable'], 503);
    }

    $filtered = trim((string)($_SERVER['QUERY_STRING'] ?? '')) !== '';

    $cacheFile = __DIR__ . '/../storage/profiles-ssr-cache.html';
    $html = null;
    if (is_file($cacheFile) && filemtime($cacheFile) > time() - 300) {
        $cached = @file_get_contents($cacheFile);
        if ($cached !== false && $cached !== '') {
            $html = $cached;
        }
    }
    if ($html === null) {
        $html = $shell;
        try {
            $section = profilesSsrSection();
        } catch (Throwable $e) {
            $section = null;
        }
        if ($section !== null) {
            // #root's closing tag is the last </div> before </body> (the
            // boot markup ships inside #root and React replaces it all on
            // boot anyway) — the grid goes inside #root, after the
            // prerendered SEO sections.
            $injected = preg_replace(
                '/<\/div>\s*<\/body>/',
                $section . '</div></body>',
                $shell,
                1
            );
            if (is_string($injected) && $injected !== $shell) {
                $html = $injected;
                $cacheDir = dirname($cacheFile);
                if (!is_dir($cacheDir)) {
                    @mkdir($cacheDir, 0775, true);
                }
                $tmp = $cacheFile . '.' . getmypid() . '.tmp';
                if (@file_put_contents($tmp, $html) !== false) {
                    @rename($tmp, $cacheFile);
                }
            }
        }
    }

    if ($filtered) {
        // Faceted browse is not a landing page — mirror Seo.jsx's
        // "noindex, follow" in the first response.
        $html = preg_replace(
            '/<meta name="robots" content="[^"]*" \/>/',
            '<meta name="robots" content="noindex, follow" />',
            $html,
            1
        ) ?? $html;
    }

    header('Content-Type: text/html; charset=utf-8');
    if ($filtered) {
        // Faceted variants stay uncacheable: they are noindex crawl
        // permutations, not landing pages, and there is no reason for a
        // shared cache to hold them.
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    } else {
        // Phase 2 (2026-11-24, diagnosis F2): the clean browse document
        // is built ONLY from the anonymous roster — visibleProfile($row,
        // null) above; this route never reads a token or cookie, so the
        // response is byte-identical for every requester and a shared
        // cache can never serve one visitor's data to another. Let
        // Cloudflare hold it for 300s (matching the 5-minute server file
        // cache above) while browsers revalidate every load, so a deploy
        // is still picked up immediately. Personalised data only ever
        // travels via /api/*, which keeps its own no-store.
        header('Cache-Control: public, max-age=0, s-maxage=300, must-revalidate');
    }
    echo $html;
}
