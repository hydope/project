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
        '/shia-rishta-chicago', '/shia-rishta-houston', '/shia-rishta-new-york',
        '/shia-rishta-london', '/shia-rishta-toronto', '/shia-rishta-dearborn',
        '/shia-rishta-dallas', '/shia-rishta-los-angeles', '/shia-rishta-bay-area',
        '/shia-rishta-atlanta', '/shia-rishta-seattle',
        '/shiamatch-alternative',
        '/terms', '/privacy', '/contact', '/success-stories',
    ];
    // NOTE: '/faq' intentionally omitted — no /faq route exists (would 404).
    foreach ($static as $p) {
        $urls[] = ['loc' => $base . $p, 'lastmod' => date('Y-m-d'), 'priority' => $p === '/' ? '1.0' : '0.7'];
    }

    // Programmatic tag landing pages: 11 tag phrases × every profile
    // city/country. Mirrors src/data/tagLandingPages.js — keep in sync.
    $tagPlaces = [
        'karachi', 'lahore', 'sargodha', 'mumbai', 'chennai', 'bangalore',
        'dubai', 'abu-dhabi', 'toronto', 'london', 'chicago', 'houston',
        'washington-dc', 'silver-spring', 'sydney', 'nanjing',
        'pakistan', 'india', 'uae', 'canada', 'usa', 'united-kingdom', 'australia',
    ];
    $tagPatterns = [
        fn($s) => "shia-rishta-$s",
        fn($s) => "shia-rishtay-$s",
        fn($s) => "shia-nikah-$s",
        fn($s) => "shia-marriage-$s",
        fn($s) => "shia-matrimony-$s",
        fn($s) => "$s-shia-brides",
        fn($s) => "$s-shia-grooms",
        fn($s) => "shia-shaadi-$s",
        fn($s) => "find-shia-rishta-$s",
        fn($s) => "$s-shia-matrimonial",
        fn($s) => "shia-nikah-match-$s",
        fn($s) => "shia-match-$s",
    ];
    // Slugs already covered by hand-written pages (don't duplicate).
    $tagSkip = [
        'shia-rishta-toronto', 'shia-matrimony-toronto',
        'shia-rishta-london', 'shia-matrimony-london',
        'shia-rishta-chicago', 'shia-matrimony-chicago',
        'shia-rishta-houston', 'shia-matrimony-houston',
        'shia-matrimony-usa',
    ];
    $staticPaths = array_flip($static);
    foreach ($tagPlaces as $place) {
        foreach ($tagPatterns as $fn) {
            $slug = $fn($place);
            if (in_array($slug, $tagSkip, true)) continue;
            if (isset($staticPaths['/' . $slug])) continue;
            $urls[] = ['loc' => $base . '/' . $slug, 'lastmod' => date('Y-m-d'), 'priority' => '0.7'];
        }
    }

    $pdo = db();

    // Published blog posts. Cover images go into the sitemap as Google
    // image extensions so post images become indexable. image_url is
    // TEXT and may hold admin-uploaded data: URLs — only real http(s)
    // URLs are emitted.
    try {
        $hasImg = (bool)$pdo->query("SHOW COLUMNS FROM blog_posts LIKE 'image_url'")->fetch();
        $imgSel = $hasImg ? ', image_url' : '';
        $stmt = $pdo->query("SELECT slug, COALESCE(published_at, updated_at, created_at) AS lm{$imgSel} FROM blog_posts WHERE status = 'published' ORDER BY published_at DESC LIMIT 2000");
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $entry = [
                'loc' => $base . '/blog/' . rawurlencode((string)$row['slug']),
                'lastmod' => substr((string)$row['lm'], 0, 10),
                'priority' => '0.8',
            ];
            $img = $hasImg ? trim((string)($row['image_url'] ?? '')) : '';
            if (str_starts_with($img, 'data:') || $img === '') {
                $img = '';
            } elseif (!preg_match('#^https?://#i', $img)) {
                $img = $base . '/' . ltrim($img, '/');
            }
            if ($img !== '') {
                $entry['images'] = [$img];
            }
            $urls[] = $entry;
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

    // Public, non-blocked member profiles. QA/test accounts are excluded —
    // their city slugs ("testville", "test-profile-for-qa-please-ignore")
    // were leaking into the public sitemap.
    $noTest = 'user_id NOT IN (SELECT id FROM users WHERE is_test = 1)';
    try {
        $stmt = $pdo->query("SELECT user_id, updated_at FROM profiles WHERE is_blocked = 0 AND {$noTest} ORDER BY updated_at DESC LIMIT 5000");
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $urls[] = [
                'loc' => $base . '/profiles/' . rawurlencode((string)$row['user_id']),
                'lastmod' => substr((string)($row['updated_at'] ?? date('Y-m-d')), 0, 10),
                'priority' => '0.6',
            ];
        }
    } catch (Throwable $e) { /* skip */ }

    // City + country pages — the CURATED list from src/data/locationSeo.js.
    // Keep in sync with CITIES/COUNTRIES there. The old DB-driven version
    // (DISTINCT city/country from profiles) is deliberately gone: member
    // free-text could manufacture sitemap entries for pages that 404
    // (CityPage validates slugs against the curated list).
    $curatedCities = [
        'karachi', 'lahore', 'sargodha', 'islamabad', 'rawalpindi', 'dubai', 'london', 'toronto',
        'chicago', 'houston', 'new-york', 'silver-spring', 'detroit', 'tehran', 'qom', 'mashhad',
        'isfahan', 'shiraz', 'tabriz', 'karaj', 'yazd', 'ahvaz', 'kerman', 'najaf',
        'karbala', 'baghdad', 'basra', 'kufa', 'hillah', 'kirkuk', 'multan', 'faisalabad',
        'hyderabad-pakistan', 'quetta', 'peshawar', 'gilgit', 'skardu', 'sialkot', 'gujranwala', 'jhang',
        'parachinar', 'lucknow', 'hyderabad-india', 'mumbai', 'delhi', 'srinagar', 'kargil', 'chennai',
        'bengaluru', 'kolkata', 'patna', 'amroha', 'bhopal', 'manama', 'sitra', 'muharraq',
        'beirut', 'baalbek', 'tyre', 'nabatiyeh', 'baku', 'ganja', 'sanaa', 'saada',
        'qatif', 'al-ahsa', 'dammam', 'medina', 'kuwait-city', 'salmiya', 'abu-dhabi', 'sharjah',
        'doha', 'muscat', 'damascus', 'aleppo', 'istanbul', 'ankara', 'izmir', 'kabul',
        'herat', 'mazar-i-sharif', 'washington', 'boston', 'san-francisco', 'miami', 'philadelphia', 'minneapolis',
        'denver', 'phoenix', 'san-diego', 'sacramento', 'portland', 'austin', 'san-antonio', 'baltimore',
        'columbus', 'birmingham', 'manchester', 'bradford', 'leicester', 'glasgow', 'leeds', 'luton',
        'sheffield', 'coventry', 'vancouver', 'montreal', 'ottawa', 'calgary', 'edmonton', 'mississauga',
        'hamilton', 'sydney', 'melbourne', 'perth', 'brisbane', 'adelaide', 'berlin', 'hamburg',
        'munich', 'frankfurt', 'cologne', 'paris', 'lyon', 'marseille', 'stockholm', 'gothenburg',
        'amsterdam', 'the-hague', 'vienna', 'zurich', 'oslo', 'copenhagen', 'madrid', 'rome',
        'dar-es-salaam', 'nairobi', 'johannesburg', 'auckland', 'singapore', 'kuala-lumpur', 'jakarta',
    ];
    foreach ($curatedCities as $slug) {
        $urls[] = [
            'loc' => $base . '/city/' . rawurlencode($slug),
            'lastmod' => date('Y-m-d'),
            'priority' => '0.7',
        ];
    }
    $curatedCountries = [
        'pakistan', 'iran', 'uae', 'united-kingdom', 'usa', 'canada', 'iraq', 'india',
        'bahrain', 'lebanon', 'azerbaijan', 'yemen', 'saudi-arabia', 'kuwait', 'qatar', 'oman',
        'syria', 'turkey', 'afghanistan', 'australia', 'germany', 'france', 'sweden', 'netherlands',
        'austria', 'switzerland', 'norway', 'denmark', 'spain', 'italy', 'tanzania', 'kenya',
        'south-africa', 'new-zealand', 'singapore', 'malaysia', 'indonesia',
    ];
    foreach ($curatedCountries as $slug) {
        $urls[] = [
            'loc' => $base . '/country/' . rawurlencode($slug),
            'lastmod' => date('Y-m-d'),
            'priority' => '0.7',
        ];
    }


    $xml = '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
    $xml .= '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'
        . ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">' . "\n";
    foreach ($urls as $u) {
        $xml .= '  <url><loc>' . htmlspecialchars($u['loc'], ENT_XML1) . '</loc>'
            . '<lastmod>' . htmlspecialchars($u['lastmod'], ENT_XML1) . '</lastmod>'
            . '<priority>' . $u['priority'] . '</priority>';
        foreach ($u['images'] ?? [] as $img) {
            $xml .= '<image:image><image:loc>' . htmlspecialchars($img, ENT_XML1) . '</image:loc></image:image>';
        }
        $xml .= '</url>' . "\n";
    }
    $xml .= '</urlset>';

    header('Content-Type: application/xml; charset=UTF-8');
    header('Cache-Control: public, max-age=3600');
    echo $xml;
    exit;
}
