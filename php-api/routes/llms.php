<?php
// Dynamic llms.txt — generated from the LIVE database on every request.
//
// Unlike the static build-time llms.txt, this includes:
// - Every published blog post (including admin-created and queue-generated)
// - Every city/country with active profiles (with member counts)
// - All landing pages and core site pages
//
// AI crawlers (GPTBot, ClaudeBot, etc.) read /llms.txt to understand the site.
// This ensures they see everything, not just what existed at build time.
//
// GET /llms.txt
declare(strict_types=1);

function llmsTxt(): void
{
    $base = 'https://shiarishta.com';
    $lines = [];
    $lines[] = '# ShiaRishta — Shia Matrimony for Nikah';
    $lines[] = '';
    $lines[] = 'ShiaRishta is a free nikah-first Shia matrimony platform. Verified Shia brides and';
    $lines[] = 'grooms, photo privacy by default, wali/guardian involvement, and a free 6-language';
    $lines[] = 'marriage biodata maker. Everything is free.';
    $lines[] = '';
    $lines[] = '## Core pages';
    $pages = [
        '/' => 'Homepage — Shia matrimony for nikah',
        '/profiles' => 'Browse verified Shia profiles',
        '/blog' => 'Guidance blog — Shia marriage articles',
        '/community' => 'Community discussions',
        '/matchmaker' => 'Submit a profile for review (matchmakers)',
        '/biodata-maker' => 'Free 6-language marriage biodata maker',
        '/about' => 'About ShiaRishta',
        '/safety' => 'Safety guidelines',
        '/success-stories' => 'Member success stories',
        '/contact' => 'Contact us',
    ];
    foreach ($pages as $path => $desc) {
        $lines[] = "- [$desc]($base$path)";
    }
    $lines[] = '';

    $lines[] = '## Shia matrimony landing pages';
    $landing = [
        '/shia-matrimony-usa' => 'Shia matrimony in the USA',
        '/shia-brides' => 'Shia brides',
        '/shia-grooms' => 'Shia grooms',
        '/syed-rishta' => 'Syed rishta',
        '/shia-matrimonial' => 'Shia matrimonial',
        '/shia-marriage' => 'Shia marriage',
        '/shia-nikah' => 'Shia nikah',
    ];
    foreach ($landing as $path => $desc) {
        $lines[] = "- [$desc]($base$path)";
    }
    $lines[] = '';

    try {
        $pdo = db();

        // Cities with active profiles.
        $stmt = $pdo->query(
            "SELECT city, COUNT(*) AS n FROM profiles
             WHERE is_blocked = 0 AND city IS NOT NULL AND city != ''
             GROUP BY city ORDER BY n DESC LIMIT 200"
        );
        $cities = $stmt->fetchAll(PDO::FETCH_ASSOC);
        if ($cities) {
            $lines[] = '## Shia rishta by city';
            foreach ($cities as $c) {
                $city = trim((string)$c['city']);
                $slug = trim(strtolower((string)preg_replace('/[^a-z0-9]+/i', '-', $city)), '-');
                if ($slug === '') continue;
                $lines[] = "- [Shia matrimony in $city ({$c['n']} profiles)]({$base}/city/{$slug})";
            }
            $lines[] = '';
        }

        // Countries with active profiles.
        $stmt = $pdo->query(
            "SELECT country, COUNT(*) AS n FROM profiles
             WHERE is_blocked = 0 AND country IS NOT NULL AND country != ''
             GROUP BY country ORDER BY n DESC LIMIT 100"
        );
        $countries = $stmt->fetchAll(PDO::FETCH_ASSOC);
        if ($countries) {
            $lines[] = '## Shia rishta by country';
            foreach ($countries as $c) {
                $country = trim((string)$c['country']);
                $slug = trim(strtolower((string)preg_replace('/[^a-z0-9]+/i', '-', $country)), '-');
                if ($slug === '') continue;
                $lines[] = "- [Shia matrimony in $country ({$c['n']} profiles)]({$base}/country/{$slug})";
            }
            $lines[] = '';
        }

        // Published blog posts.
        $stmt = $pdo->query(
            "SELECT slug, title, excerpt FROM blog_posts
             WHERE status = 'published'
             ORDER BY COALESCE(published_at, created_at) DESC LIMIT 500"
        );
        $posts = $stmt->fetchAll(PDO::FETCH_ASSOC);
        if ($posts) {
            $lines[] = '## Blog articles';
            foreach ($posts as $p) {
                $title = trim((string)$p['title']);
                $excerpt = trim((string)($p['excerpt'] ?? ''));
                $slug = rawurlencode((string)$p['slug']);
                $lines[] = "- [$title]($base/blog/$slug)" . ($excerpt !== '' ? " — $excerpt" : '');
            }
            $lines[] = '';
        }
    } catch (Throwable $e) {
        // DB unavailable — serve the static core without dynamic sections.
    }

    $lines[] = '## Contact';
    $lines[] = "- General enquiries: $base/contact";

    header('Content-Type: text/plain; charset=UTF-8');
    header('Cache-Control: public, max-age=3600');
    echo implode("\n", $lines);
    exit;
}
