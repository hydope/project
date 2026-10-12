<?php
// Dynamic XML sitemap — every public page, blog post, community post, and
// public profile gets a crawlable URL so Google can index the whole site.
//
// GET /api/sitemap.xml
declare(strict_types=1);

function sitemapXml(): void
{
    $base = 'https://shiarishta.com';
    $urls = [];

    // Static public pages.
    $static = [
        '/', '/about', '/safety', '/guardians', '/blog', '/community',
        '/profiles', '/matchmaker', '/biodata-maker',
        '/shia-matrimony-usa', '/shia-brides', '/shia-grooms', '/syed-rishta',
        '/shia-matrimony-chicago', '/shia-matrimony-houston',
        '/shia-matrimony-new-york', '/shia-matrimony-london',
        '/shia-matrimonial', '/shia-marriage', '/shia-nikah',
        '/nikah-checklist', '/duas-for-marriage', '/shia-matrimony-toronto',
        '/shia-matrimony-dearborn', '/shia-matrimony-dallas',
        '/shia-matrimony-los-angeles', '/shia-matrimony-bay-area',
        '/shia-matrimony-atlanta', '/shia-matrimony-seattle',
        '/shiamatch-alternative',
        '/terms', '/privacy', '/contact', '/success-stories', '/faq',
    ];
    foreach ($static as $p) {
        $urls[] = ['loc' => $base . $p, 'lastmod' => date('Y-m-d'), 'priority' => $p === '/' ? '1.0' : '0.7'];
    }

    $pdo = db();

    // Published blog posts.
    try {
        $stmt = $pdo->query("SELECT slug, COALESCE(published_at, updated_at, created_at) AS lm FROM blog_posts WHERE status = 'published' ORDER BY published_at DESC LIMIT 2000");
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $urls[] = [
                'loc' => $base . '/blog/' . rawurlencode((string)$row['slug']),
                'lastmod' => substr((string)$row['lm'], 0, 10),
                'priority' => '0.8',
            ];
        }
    } catch (Throwable $e) { /* table missing — skip */ }

    // Public community posts.
    try {
        $stmt = $pdo->query("SELECT id, created_at FROM posts WHERE is_hidden = 0 ORDER BY created_at DESC LIMIT 2000");
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $urls[] = [
                'loc' => $base . '/community/' . rawurlencode((string)$row['id']),
                'lastmod' => substr((string)$row['created_at'], 0, 10),
                'priority' => '0.6',
            ];
        }
    } catch (Throwable $e) { /* skip */ }

    // Public, non-blocked member profiles.
    try {
        $stmt = $pdo->query("SELECT user_id, updated_at FROM profiles WHERE is_blocked = 0 ORDER BY updated_at DESC LIMIT 5000");
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $urls[] = [
                'loc' => $base . '/profiles/' . rawurlencode((string)$row['user_id']),
                'lastmod' => substr((string)($row['updated_at'] ?? date('Y-m-d')), 0, 10),
                'priority' => '0.6',
            ];
        }
    } catch (Throwable $e) { /* skip */ }

    // City pages — every city with at least one active profile gets a
    // crawlable /city/:slug page. Slug matches the frontend's slugify:
    // lowercase, non-alphanumeric runs become a single dash.
    try {
        $stmt = $pdo->query("SELECT DISTINCT city FROM profiles WHERE is_blocked = 0 AND city IS NOT NULL AND city != '' LIMIT 500");
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $city = trim((string)$row['city']);
            if ($city === '') continue;
            $slug = strtolower(preg_replace('/[^a-z0-9]+/i', '-', $city));
            $slug = trim($slug, '-');
            if ($slug === '') continue;
            $urls[] = [
                'loc' => $base . '/city/' . rawurlencode($slug),
                'lastmod' => date('Y-m-d'),
                'priority' => '0.7',
            ];
        }
    } catch (Throwable $e) { /* skip */ }

    // Country pages — same treatment.
    try {
        $stmt = $pdo->query("SELECT DISTINCT country FROM profiles WHERE is_blocked = 0 AND country IS NOT NULL AND country != '' LIMIT 200");
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $country = trim((string)$row['country']);
            if ($country === '') continue;
            $slug = strtolower(preg_replace('/[^a-z0-9]+/i', '-', $country));
            $slug = trim($slug, '-');
            if ($slug === '') continue;
            $urls[] = [
                'loc' => $base . '/country/' . rawurlencode($slug),
                'lastmod' => date('Y-m-d'),
                'priority' => '0.7',
            ];
        }
    } catch (Throwable $e) { /* skip */ }

    $xml = '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
    $xml .= '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
    foreach ($urls as $u) {
        $xml .= '  <url><loc>' . htmlspecialchars($u['loc'], ENT_XML1) . '</loc>'
            . '<lastmod>' . htmlspecialchars($u['lastmod'], ENT_XML1) . '</lastmod>'
            . '<priority>' . $u['priority'] . '</priority></url>' . "\n";
    }
    $xml .= '</urlset>';

    header('Content-Type: application/xml; charset=UTF-8');
    header('Cache-Control: public, max-age=3600');
    echo $xml;
    exit;
}
