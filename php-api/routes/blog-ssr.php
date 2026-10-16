<?php
// Server-side render for DB-published blog posts.
//
// GET /api/blog-ssr/:slug — returns a complete HTML document for a published
// blog post: the SPA shell (index.html) with the article's title, meta tags,
// canonical, Article JSON-LD and the full article body injected server-side.
//
// ── Why this exists ─────────────────────────────────────────────────────────
// /blog/:slug is a client-rendered route: the article body only appears after
// JavaScript fetches /api/ai/posts/:slug. Google's renderer intermittently
// snapshots the page before that fetch resolves (or the fetch fails for the
// crawler), sees the 404 view, and flags the URL as a soft 404 — even though
// the post exists and the API answers 200. Serving the article HTML in the
// first response removes the crawler's dependence on JavaScript entirely.
//
// Unknown slugs (and the 8 static articles, which live in the JS bundle) fall
// through to the plain SPA shell — byte-identical to today's behavior.
//
// The SPA stays interactive: the post payload is embedded as
// window.__SSR_POST__ so BlogPost.jsx skips its fetch (see BlogPost.jsx).
declare(strict_types=1);

function blogSsrFetchPost(string $slug): ?array
{
    $hasImageUrl = false;
    try {
        $hasImageUrl = (bool)db()->query("SHOW COLUMNS FROM blog_posts LIKE 'image_url'")->fetch();
    } catch (Throwable $e) { /* assume missing */ }
    $imgCol = $hasImageUrl ? 'image_url, ' : '';
    $st = db()->prepare(
        "SELECT id, slug, title, excerpt, {$imgCol}category, read_time, body, published_at
           FROM blog_posts
          WHERE slug = ? AND status = 'published'
            AND (scheduled_for IS NULL OR scheduled_for <= UTC_TIMESTAMP())
          LIMIT 1"
    );
    $st->execute([$slug]);
    $row = $st->fetch();
    if (!$row) {
        return null;
    }
    $decoded = json_decode((string)$row['body'], true);
    $row['body'] = is_array($decoded) ? $decoded : [];
    return $row;
}

/** Render [{t:'p'|'h2', x:'...'}] body blocks as HTML. */
function blogSsrBodyHtml(array $body): string
{
    $out = '';
    foreach ($body as $b) {
        if (!is_array($b)) {
            continue;
        }
        $text = htmlspecialchars((string)($b['x'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        if (($b['t'] ?? 'p') === 'h2') {
            $out .= "<h2>{$text}</h2>";
        } else {
            $out .= "<p>{$text}</p>";
        }
    }
    return $out;
}

function blogSsr(string $slug): void
{
    // Shell lives two levels above this file on the deployed host:
    // php-api/routes/blog-ssr.php → public_html/api/routes/blog-ssr.php,
    // while dist/index.html → public_html/index.html.
    $shellPath = dirname(__DIR__, 2) . '/index.html';
    $shell = is_readable($shellPath) ? file_get_contents($shellPath) : false;
    if ($shell === false) {
        json(['error' => 'Service unavailable'], 503);
    }

    $post = blogSsrFetchPost($slug);
    if ($post === null) {
        // Unknown slug — serve the SPA shell unchanged (today's behavior).
        header('Content-Type: text/html; charset=utf-8');
        echo $shell;
        return;
    }

    $esc = fn(string $s): string => htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $title = (string)($post['title'] ?? '');
    $excerpt = (string)($post['excerpt'] ?? '');
    $category = (string)($post['category'] ?? 'Guidance');
    $readTime = (string)($post['read_time'] ?? '5 min');
    $date = substr((string)($post['published_at'] ?? ''), 0, 10);
    $image = (string)($post['image_url'] ?? '');
    if ($image === '') {
        $image = '/og-cover.jpg';
    }
    $imageAbs = str_starts_with($image, 'http') ? $image : 'https://shiarishta.com' . $image;
    $url = 'https://shiarishta.com/blog/' . $slug;
    $fullTitle = $title . ' — Shia Rishta';

    // ── <head>: title, description, canonical, Open Graph ──
    $html = preg_replace(
        '/<title>.*?<\/title>/s',
        '<title>' . $esc($fullTitle) . '</title>',
        $shell,
        1
    );
    $html = preg_replace(
        '/<meta name="description" content="[^"]*" \/>/',
        '<meta name="description" content="' . $esc($excerpt) . '" />',
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
        '/<meta property="og:type" content="[^"]*" \/>/' =>
            '<meta property="og:type" content="article" />',
        '/<meta property="og:url" content="[^"]*" \/>/' =>
            '<meta property="og:url" content="' . $esc($url) . '" />',
        '/<meta property="og:title" content="[^"]*" \/>/' =>
            '<meta property="og:title" content="' . $esc($fullTitle) . '" />',
        '/<meta property="og:description" content="[^"]*" \/>/' =>
            '<meta property="og:description" content="' . $esc($excerpt) . '" />',
        '/<meta property="og:image" content="[^"]*" \/>/' =>
            '<meta property="og:image" content="' . $esc($imageAbs) . '" />',
    ];
    foreach ($ogReplacements as $pattern => $replacement) {
        $html = preg_replace($pattern, $replacement, $html, 1);
    }

    // ── Article JSON-LD (mirrors the SPA's BlogPost schema) ──
    $jsonLd = [
        '@context' => 'https://schema.org',
        '@type' => 'Article',
        'headline' => $title,
        'description' => $excerpt,
        'image' => $imageAbs,
        'datePublished' => $date,
        'dateModified' => $date,
        'author' => [
            '@type' => 'Organization',
            'name' => 'Shia Rishta',
            'url' => 'https://shiarishta.com/',
        ],
        'publisher' => [
            '@type' => 'Organization',
            'name' => 'Shia Rishta',
            'logo' => ['@type' => 'ImageObject', 'url' => 'https://shiarishta.com/icon-512.png'],
        ],
        'mainEntityOfPage' => $url,
        'inLanguage' => 'en',
    ];
    $jsonLdTag = '<script type="application/ld+json" id="article-jsonld">' .
        json_encode($jsonLd, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) .
        '</script>';
    $html = str_replace('</head>', $jsonLdTag . "\n</head>", $html);

    // ── #root: the article body as real HTML ──
    $articleHtml = '<article>'
        . '<p><span>' . $esc($category) . '</span></p>'
        . '<h1>' . $esc($title) . '</h1>'
        . '<p>' . $esc($readTime) . ' read · ' . $esc($date) . '</p>'
        . '<img src="' . $esc($image) . '" alt="' . $esc($title) . '" />'
        . blogSsrBodyHtml($post['body'])
        . '<p><a href="/auth/register">Start your journey — it&rsquo;s free</a></p>'
        . '</article>';
    // #root's closing tag is the last </div> before </body> (the boot loader
    // markup ships inside #root and is replaced by React on hydration anyway).
    $html = preg_replace(
        '/<div id="root">.*<\/div>\s*<\/body>/s',
        '<div id="root">' . $articleHtml . '</div></body>',
        $html,
        1
    );

    // ── Post payload for the SPA: BlogPost.jsx picks this up and skips its
    // own fetch, so users see no content flash when React takes over. ──
    $ssrPost = [
        'slug' => $slug,
        'title' => $title,
        'excerpt' => $excerpt,
        'category' => $category,
        'image_url' => $image === '/og-cover.jpg' ? null : $image,
        'read_time' => $readTime,
        'published_at' => (string)($post['published_at'] ?? ''),
        'body' => $post['body'],
    ];
    $dataTag = '<script>window.__SSR_POST__=' .
        json_encode($ssrPost, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE) .
        ';</script>';
    $html = str_replace('</body>', $dataTag . "\n</body>", $html);

    header('Content-Type: text/html; charset=utf-8');
    echo $html;
}
