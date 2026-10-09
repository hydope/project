<?php
// First-party pageview collection — feeds the admin SEO & Growth dashboard.
//
// POST /api/analytics/collect  { path, referrer }
// Public, fire-and-forget (the SPA uses navigator.sendBeacon). Privacy-first:
// stores NO ip, NO user agent, NO full referrer URL — only a day-scoped
// anonymous visitor hash, the path, the referrer host, and a device class.
//
// RATE LIMITING — read this before touching:
// The global writeRateCheck() in index.php buckets ALL non-GET requests by
// cip(), which returns the SHARED Cloudflare proxy IP on this host (the
// 2026-10-07 429-everyone incident). A per-pageview beacon would exhaust that
// shared 30/min bucket instantly, so index.php EXEMPTS this endpoint from
// writeRateCheck(). Abuse protection lives here instead: a generous
// per-visitor-day bucket (300/hour), which cannot punish other visitors.
declare(strict_types=1);

function routeAnalytics(string $method, array $segments): void
{
    $action = $segments[0] ?? '';
    if ($method === 'POST' && $action === 'collect') {
        analyticsCollect();
        return;
    }
    json(['error' => 'Not found'], 404);
}

function analyticsCollect(): void
{
    $body = requestJson();
    $path = substr(trim((string)($body['path'] ?? '')), 0, 255);
    if ($path === '' || $path[0] !== '/') {
        json(['ok' => false, 'error' => 'bad path'], 400);
    }
    // Normalize: collapse trailing slashes, drop anything after ? or #.
    $path = rtrim(preg_split('/[?#]/', $path, 2)[0], '/');
    if ($path === '') $path = '/';

    $ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
    $visitorHash = hash('sha256', cip() . '|' . $ua . '|' . date('Y-m-d'));

    // Per-visitor flood guard — generous on purpose; a beacon must never
    // break the page it measures, and this bucket is per-visitor-day.
    rateCheck('pv', $visitorHash, 300, 3600, 'Slow down.');

    // Referrer host only — never the full URL (it can carry tokens/PII).
    $referrerHost = null;
    $ref = trim((string)($body['referrer'] ?? ''));
    if ($ref !== '' && ($host = parse_url($ref, PHP_URL_HOST))) {
        $host = strtolower(substr((string)$host, 0, 255));
        // Internal navigation is not a referrer — record it as direct.
        if ($host !== 'shiarishta.com' && $host !== 'www.shiarishta.com') {
            $referrerHost = $host;
        }
    }

    $device = 'desktop';
    if (preg_match('/ipad|tablet/i', $ua)) {
        $device = 'tablet';
    } elseif (preg_match('/mobi|android|iphone|ipod|phone/i', $ua)) {
        $device = 'mobile';
    }

    try {
        db()->prepare(
            'INSERT INTO pageviews (path, referrer_host, device, visitor_hash, created_at)
             VALUES (?, ?, ?, ?, UTC_TIMESTAMP())'
        )->execute([$path, $referrerHost, $device, $visitorHash]);
    } catch (Throwable $e) {
        // Analytics must never break the product. If the table is missing
        // (migration hasn't run yet on some edge path), swallow and move on.
        error_log('[api] pageview collect failed: ' . substr($e->getMessage(), 0, 120));
    }
    json(['ok' => true]);
}
