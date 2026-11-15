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
    if ($method === 'POST' && $action === 'event') {
        analyticsEvent();
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
    if (!in_array($kind, ['error', 'submit', 'validation', 'api'], true)) {
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
    $visitorHash = hash('sha256', cip() . '|' . $ua . '|' . date('Y-m-d'));
    rateCheck('ev', $visitorHash, 300, 3600, 'Slow down.');

    $userId = null;
    try {
        $u = currentUser();
        if ($u && !empty($u['id'])) $userId = (string)$u['id'];
    } catch (Throwable $e) { /* guest or bad token — log anonymously */ }

    try {
        clientEventsEnsure();
        db()->prepare(
            'INSERT INTO client_events (kind, name, page, detail, user_id, visitor_hash, created_at)
             VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())'
        )->execute([$kind, $name, $page, $detail ? json_encode($detail) : null, $userId, $visitorHash]);
        // Retention: 30 days, pruned opportunistically (~1% of writes) so
        // the log can never grow unbounded on shared hosting.
        if (random_int(1, 100) === 1) {
            db()->exec('DELETE FROM client_events WHERE created_at < UTC_TIMESTAMP() - INTERVAL 30 DAY');
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
