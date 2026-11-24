<?php
// First-party pageview collection — feeds the admin SEO & Growth dashboard.
//
// POST /api/analytics/collect  { path, referrer }
// Public, fire-and-forget (the SPA uses navigator.sendBeacon). Privacy-first:
// stores NO ip, NO user agent, NO referrer query string — only a one-way
// persistent visitor hash (ip+ua, no date — see analyticsCollect), the path,
// the referrer host+path, a classified channel, first-touch UTM, device.
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
    if ($method === 'POST' && $action === 'event') {
        analyticsEvent();
        return;
    }
    json(['error' => 'Not found'], 404);
}

// Channel taxonomy (2026-11-15, Batch B): classify the referrer into the
// channel an operator actually acts on. AI assistants are their OWN
// channel (chatgpt/perplexity/gemini/copilot) — Syed's Nov 15 ask.
// HONEST LIMIT: Google AI Overview clicks arrive with a google.* referrer
// indistinguishable from ordinary Google Search clicks, so both land in
// 'google' — no referrer-based system can split them, and this code does
// not pretend to. Search Console (blocked on Syed's sign-in) is the only
// source that can.
function analyticsChannel(?string $host, ?string $utmSource): string
{
    $s = strtolower(trim((string)$utmSource));
    if ($s !== '') {
        if (str_contains($s, 'chatgpt') || str_contains($s, 'openai')) return 'chatgpt';
        if (str_contains($s, 'perplexity')) return 'perplexity';
        if (str_contains($s, 'gemini') || str_contains($s, 'bard')) return 'gemini';
        if (str_contains($s, 'facebook') || str_contains($s, 'fb')) return 'facebook';
        if (str_contains($s, 'instagram')) return 'instagram';
        if (str_contains($s, 'whatsapp')) return 'whatsapp';
        if (str_contains($s, 'google')) return 'google';
        return 'campaign';
    }
    if ($host === null || $host === '') return 'direct';
    $h = strtolower($host);
    if (str_contains($h, 'chatgpt') || str_contains($h, 'openai')) return 'chatgpt';
    if (str_contains($h, 'perplexity')) return 'perplexity';
    if (str_contains($h, 'gemini') || str_contains($h, 'bard.google')) return 'gemini';
    if (str_contains($h, 'copilot') || str_contains($h, 'bing.com')) return str_contains($h, 'copilot') ? 'copilot' : 'bing';
    if (str_contains($h, 'google')) return 'google';
    if (str_contains($h, 'duckduckgo')) return 'duckduckgo';
    if (str_contains($h, 'facebook') || str_contains($h, 'fb.com')) return 'facebook';
    if (str_contains($h, 'instagram')) return 'instagram';
    if (str_contains($h, 'whatsapp')) return 'whatsapp';
    if (str_contains($h, 'linkedin')) return 'linkedin';
    if (str_contains($h, 'twitter') || $h === 'x.com' || str_contains($h, '.x.com')) return 'x';
    if (str_contains($h, 'tiktok')) return 'tiktok';
    if (str_contains($h, 'youtube')) return 'youtube';
    return 'referral';
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

    // Internal traffic exclusion (2026-11-15, Batch B #1): admin screens
    // and signed-in admins never count as visitors — internal views were
    // ~100/week polluting every headline number. The beacon still gets a
    // 200 so the client never retries or logs an error.
    if (str_starts_with($path, '/admin')) {
        json(['ok' => true, 'internal' => true]);
    }
    try {
        $me = currentUser();
        // DB re-check, not the stale isAdmin claim (A-03 sweep): a demoted
        // admin's pageviews count as ordinary traffic again.
        if ($me !== null && userIsAdmin((string)$me['uid'])) {
            json(['ok' => true, 'internal' => true]);
        }
    } catch (Throwable) { /* a bad token must never break the beacon */ }

    $ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
    // Persistent visitor hash (2026-11-15, Batch B): NO date component.
    // The old day-scoped hash reset every midnight, making multi-day
    // page-to-signup attribution impossible by construction. Per-day
    // unique counts stay exact (rows are windowed by created_at); the
    // hash is still one-way and no IP/UA is ever stored.
    $visitorHash = hash('sha256', cip() . '|' . $ua);

    // Per-visitor flood guard — generous on purpose; a beacon must never
    // break the page it measures, and this bucket is per-visitor-day.
    rateCheck('pv', $visitorHash, 300, 3600, 'Slow down.');

    // Referrer host + PATH — never the query string (it can carry
    // tokens/PII). Host-only referrers made every source a bare hostname;
    // the path distinguishes e.g. a ChatGPT answer from a ChatGPT home
    // visit without storing anything sensitive.
    $referrerHost = null;
    $referrerPath = null;
    $ref = trim((string)($body['referrer'] ?? ''));
    if ($ref !== '' && ($host = parse_url($ref, PHP_URL_HOST))) {
        $host = strtolower(substr((string)$host, 0, 255));
        // Internal navigation is not a referrer — record it as direct.
        if ($host !== 'shiarishta.com' && $host !== 'www.shiarishta.com') {
            $referrerHost = $host;
            $rp = parse_url($ref, PHP_URL_PATH);
            if (is_string($rp) && $rp !== '') $referrerPath = substr($rp, 0, 255);
        }
    }

    // First-touch UTM (client captures it once per session): campaign
    // attribution for the DR/DA + outreach work, length-capped + allowlist
    // characters so a beacon can never become a PII sink.
    $utm = static function (string $k, int $max) use ($body): ?string {
        $v = trim((string)($body[$k] ?? ''));
        if ($v === '') return null;
        $v = preg_replace('/[^A-Za-z0-9_\-\. ]/', '', $v) ?? '';
        return $v === '' ? null : substr($v, 0, $max);
    };
    $utmSource = $utm('utm_source', 120);
    $utmMedium = $utm('utm_medium', 120);
    $utmCampaign = $utm('utm_campaign', 160);
    $channel = analyticsChannel($referrerHost, $utmSource);

    $device = 'desktop';
    if (preg_match('/ipad|tablet/i', $ua)) {
        $device = 'tablet';
    } elseif (preg_match('/mobi|android|iphone|ipod|phone/i', $ua)) {
        $device = 'mobile';
    }

    try {
        db()->prepare(
            'INSERT INTO pageviews (path, referrer_host, referrer_path, channel, utm_source, utm_medium, utm_campaign, device, visitor_hash, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())'
        )->execute([$path, $referrerHost, $referrerPath, $channel, $utmSource, $utmMedium, $utmCampaign, $device, $visitorHash]);
    } catch (Throwable $e) {
        // Pre-migration fallback: if the attribution columns do not exist
        // yet on this database, store the legacy shape rather than losing
        // the pageview entirely. Analytics must never break the product.
        try {
            db()->prepare(
                'INSERT INTO pageviews (path, referrer_host, device, visitor_hash, created_at)
                 VALUES (?, ?, ?, ?, UTC_TIMESTAMP())'
            )->execute([$path, $referrerHost, $device, $visitorHash]);
        } catch (Throwable $e2) {
            error_log('[api] pageview collect failed: ' . substr($e2->getMessage(), 0, 120));
        }
    }
    json(['ok' => true]);
}

// POST /api/analytics/event  { kind, name, page, detail }
// Client event log (Syed's ask, 2026-11-15): every form submit, every
// validation failure, and every client-side crash lands here so the next
// failure explains itself — the 2026-11-14 suspension night proved the
// gap, when a member's crash screen carried no diagnosable trace.
//
// PRIVACY, enforced server-side (a buggy or hostile client cannot turn
// this into a PII sink): kinds and detail keys are allowlisted, every
// string is length-capped, and field VALUES are never accepted — the
// client sends field names and error messages only, never what the
// member typed, and never passwords or message bodies.
function analyticsEvent(): void
{
    $body = requestJson();
    $kind = (string)($body['kind'] ?? '');
    if (!in_array($kind, ['error', 'submit', 'validation', 'api', 'search', 'onboarding'], true)) {
        json(['ok' => false, 'error' => 'bad kind'], 400);
    }
    $name = substr((string)preg_replace('/[^A-Za-z0-9_.\-]/', '', (string)($body['name'] ?? '')), 0, 80);
    $page = substr(trim((string)($body['page'] ?? '')), 0, 255);
    $page = $page !== '' ? rtrim(preg_split('/[?#]/', $page, 2)[0], '/') : '';
    if ($page === '') $page = '/';

    $detailIn = is_array($body['detail'] ?? null) ? $body['detail'] : [];
    $detail = [];
    foreach (['form', 'field', 'message', 'endpoint'] as $k) {
        if (isset($detailIn[$k]) && is_string($detailIn[$k])) {
            $detail[$k] = substr($detailIn[$k], 0, $k === 'message' ? 300 : 120);
        }
    }
    if (isset($detailIn['status']) && is_numeric($detailIn['status'])) {
        $detail['status'] = (int)$detailIn['status'];
    }

    $ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
    $visitorHash = hash('sha256', cip() . '|' . $ua);
    rateCheck('ev', $visitorHash, 300, 3600, 'Slow down.');

    $userId = null;
    try {
        $u = currentUser();
        // The JWT carries `uid`, not `id` (lib/jwt.php) — reading `id`
        // here silently logged every signed-in member as a guest until
        // 2026-11-15, when the live probe caught it.
        $uid = $u['uid'] ?? $u['id'] ?? null;
        if ($uid) $userId = (string)$uid;
    } catch (Throwable $e) { /* guest or bad token — log anonymously */ }

    try {
        clientEventsEnsure();
        db()->prepare(
            'INSERT INTO client_events (kind, name, page, detail, user_id, visitor_hash, created_at)
             VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())'
        )->execute([$kind, $name, $page, $detail ? json_encode($detail) : null, $userId, $visitorHash]);
        // Retention: 90 days (raised from 30 on 2026-11-15, Batch B —
        // a 30-day window made month-over-month failure comparison
        // impossible), pruned opportunistically (~1% of writes) so the
        // log can never grow unbounded on shared hosting.
        if (random_int(1, 100) === 1) {
            db()->exec('DELETE FROM client_events WHERE created_at < UTC_TIMESTAMP() - INTERVAL 90 DAY');
        }
    } catch (Throwable $e) {
        error_log('[api] client event failed: ' . substr($e->getMessage(), 0, 120));
    }
    json(['ok' => true]);
}

// Lazy create: the table also lives in db/schema.sql for fresh installs,
// but creating it here means the log works even on a deploy whose
// migration marker has not cycled yet.
function clientEventsEnsure(): void
{
    static $done = false;
    if ($done) return;
    $done = true;
    db()->exec(
        'CREATE TABLE IF NOT EXISTS client_events (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            kind VARCHAR(16) NOT NULL,
            name VARCHAR(80) NOT NULL DEFAULT \'\',
            page VARCHAR(255) NOT NULL DEFAULT \'/\',
            detail TEXT NULL,
            user_id CHAR(36) NULL,
            visitor_hash CHAR(64) NOT NULL,
            created_at DATETIME NOT NULL,
            INDEX idx_created (created_at),
            INDEX idx_kind_created (kind, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
}
