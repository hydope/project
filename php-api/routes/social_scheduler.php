<?php
// Social Scheduler routes (Phase 1, 2026-11-21).
//
// Admin API (all under /api/admin/social/*, dispatched from routeAdmin —
// admin auth already enforced there):
//   GET    /accounts                 connected accounts + config status
//   DELETE /accounts/:id             disconnect (tokens wiped)
//   POST   /accounts/:id/reactivate  clear needs_attention after a check
//   GET    /connect/meta             -> {url} Meta OAuth start
//   GET    /connect/facebook         -> alias of /connect/meta
//   GET    /connect/youtube          -> {url} Google OAuth start
//   POST   /media                    multipart upload -> {mediaPath,...}
//   GET    /posts                    queue list with per-target status
//   POST   /posts                    create (draft | scheduled | now)
//   GET    /posts/:id
//   PUT    /posts/:id                edit an unsent post
//   DELETE /posts/:id                cancel/delete an unsent post
//   POST   /posts/:id/publish-now
//   POST   /posts/:id/retry          retry failed targets only
//   GET    /autopilot                autopilot settings
//   PUT    /autopilot                save autopilot settings
//
// Public (no admin session possible mid-redirect / for platform fetches):
//   GET  /api/social-oauth/:provider/callback   OAuth redirect target
//   GET  /api/social-media/:file                serve an uploaded media
//                                               file (platforms fetch
//                                               these URLs, e.g. IG)
//   POST /api/social-ingest                     REEL INGEST — protected
//                                               by X-Ingest-Key against
//                                               SOCIAL_INGEST_KEY env.
//                                               This is the seam where
//                                               the Muse-side ShortSmash
//                                               generator feeds finished
//                                               1080x1920 reels in.
declare(strict_types=1);

// ── Shared helpers ──────────────────────────────────────────────────────

function socialStateSign(array $payload): string
{
    $payload['exp'] = time() + 900;
    $b64 = rtrim(strtr(base64_encode((string)json_encode($payload)), '+/', '-_'), '=');
    return $b64 . '.' . hash_hmac('sha256', $b64, jwtSecret());
}

function socialStateVerify(string $state): ?array
{
    $parts = explode('.', $state);
    if (count($parts) !== 2) return null;
    [$b64, $sig] = $parts;
    if (!hash_equals(hash_hmac('sha256', $b64, jwtSecret()), $sig)) return null;
    $payload = json_decode((string)base64_decode(strtr($b64, '-_', '+/')), true);
    if (!is_array($payload) || (int)($payload['exp'] ?? 0) < time()) return null;
    return $payload;
}

function socialAccountPayload(array $row): array
{
    return [
        'id' => (string)$row['id'],
        'platform' => (string)$row['platform'],
        'platformAccountId' => (string)$row['platform_account_id'],
        'accountName' => $row['account_name'],
        'status' => (string)$row['status'],
        'consecutiveFailures' => (int)($row['consecutive_failures'] ?? 0),
        'tokenExpiresAt' => $row['token_expires_at'],
        'scopes' => $row['scopes'],
        'createdAt' => $row['created_at'],
        'updatedAt' => $row['updated_at'],
    ];
}

function socialPostPayload(array $row, array $targets): array
{
    return [
        'id' => (string)$row['id'],
        'caption' => (string)$row['caption'],
        'captionOverrides' => json_decode((string)($row['caption_overrides'] ?? ''), true) ?: null,
        'mediaPath' => $row['media_path'],
        'mediaType' => $row['media_type'],
        'mediaUrl' => $row['media_url'],
        'scheduledAt' => $row['scheduled_at'],
        'status' => (string)$row['status'],
        'source' => (string)($row['source'] ?? 'manual'),
        'createdAt' => $row['created_at'],
        'updatedAt' => $row['updated_at'],
        'targets' => array_map(static fn(array $t) => [
            'id' => (string)$t['id'],
            'platform' => (string)$t['platform'],
            'socialAccountId' => (string)$t['social_account_id'],
            'status' => (string)$t['status'],
            'platformPostId' => $t['platform_post_id'],
            'platformUrl' => $t['platform_url'],
            'error' => $t['error'],
            'attempts' => (int)$t['attempts'],
            'publishedAt' => $t['published_at'],
        ], $targets),
    ];
}

function socialLoadPost(string $id): ?array
{
    $stmt = db()->prepare('SELECT * FROM social_posts WHERE id = ? LIMIT 1');
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) return null;
    $stmt = db()->prepare('SELECT * FROM social_post_targets WHERE post_id = ? ORDER BY platform ASC');
    $stmt->execute([$id]);
    return socialPostPayload($row, $stmt->fetchAll(PDO::FETCH_ASSOC));
}

/** Store an uploaded media file under the social media dir. Returns [mediaPath, mediaType]. */
function socialStoreUpload(array $file, string $kind): array
{
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || empty($file['tmp_name']) || !is_uploaded_file($file['tmp_name'])) {
        je('The upload did not arrive. Check the file and try again.', 400);
    }
    $max = $kind === 'video' ? 200 * 1024 * 1024 : 15 * 1024 * 1024;
    if ((int)$file['size'] > $max) {
        je($kind === 'video' ? 'Video must be under 200 MB.' : 'Image must be under 15 MB.', 400);
    }
    // Directory budget (Social-Storage plan §3.4): the social media dir
    // has a hard cap (default 2 GB, env SOCIAL_MEDIA_BUDGET_BYTES). New
    // video is refused at/over the cap — this one check covers BOTH the
    // admin upload and the reel ingest, which share this store path.
    if ($kind === 'video' && function_exists('socialMediaBudgetExceeded') && socialMediaBudgetExceeded((int)$file['size'])) {
        je(socialMediaBudgetError(), 507);
    }
    $bytes = (string)file_get_contents($file['tmp_name']);
    $mime = class_exists('finfo') ? (new finfo(FILEINFO_MIME_TYPE))->buffer($bytes) : null;
    $allowed = $kind === 'video'
        ? ['video/mp4' => 'mp4', 'video/quicktime' => 'mov', 'video/webm' => 'webm']
        : ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    if (!is_string($mime) || !isset($allowed[$mime])) {
        // finfo can call an MP4 'video/mp4' or 'application/octet-stream'
        // depending on build; accept by extension only for mp4 video.
        if ($kind === 'video' && strtolower(pathinfo((string)$file['name'], PATHINFO_EXTENSION)) === 'mp4') {
            $mime = 'video/mp4';
        } else {
            je('Unsupported file type: ' . (string)$mime, 400);
        }
    }
    $dir = photoBaseDir() . '/social';
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
        je('Could not save the file — server storage is not writable.', 500);
    }
    $rel = 'social/' . uuid() . '.' . $allowed[$mime];
    if (@file_put_contents(photoBaseDir() . '/' . $rel, $bytes) === false) {
        je('Could not save the file.', 500);
    }
    return [$rel, $kind];
}

/** Next free hourly slot (UTC) for autopilot-fed content, honouring caps. */
function socialNextAutopilotSlot(): string
{
    $ts = (int)(floor(time() / 3600) * 3600) + 3600;
    for ($i = 0; $i < 48; $i++) {
        $slot = gmdate('Y-m-d H:i:s', $ts + $i * 3600);
        $stmt = db()->prepare("SELECT 1 FROM social_posts WHERE source IN ('autopilot','autopilot_reel') AND scheduled_at = ? AND status IN ('scheduled','publishing') LIMIT 1");
        $stmt->execute([$slot]);
        if (!$stmt->fetch()) return $slot;
    }
    return gmdate('Y-m-d H:i:s', $ts + 48 * 3600);
}

// ── Admin dispatch ──────────────────────────────────────────────────────

function routeAdminSocial(string $method, array $segments): void
{
    $sub = $segments[0] ?? null;

    if ($sub === 'accounts') {
        if ($method === 'GET' && ($segments[1] ?? null) === null) { socialAccountsList(); return; }
        if ($method === 'DELETE' && ($segments[1] ?? null) !== null) { socialAccountDisconnect((string)$segments[1]); return; }
        if ($method === 'POST' && ($segments[1] ?? null) !== null && ($segments[2] ?? null) === 'reactivate') { socialAccountReactivate((string)$segments[1]); return; }
    }
    if ($sub === 'connect' && $method === 'GET') {
        // 'facebook' accepted as an alias for 'meta' — the admin UI's
        // Facebook card originally sent 'facebook' verbatim and 404'd,
        // because only 'meta'/'youtube' were registered here.
        if (in_array($segments[1] ?? null, ['meta', 'facebook'], true)) { socialConnectMeta(); return; }
        if (($segments[1] ?? null) === 'youtube') { socialConnectYouTube(); return; }
    }
    if ($sub === 'media' && $method === 'POST') { socialMediaUpload(); return; }
    if ($sub === 'autopilot') {
        if ($method === 'GET') { socialAutopilotGet(); return; }
        if ($method === 'PUT' || $method === 'POST') { socialAutopilotUpdate(); return; }
    }
    if ($sub === 'posts') {
        $id = $segments[1] ?? null;
        if ($method === 'GET' && $id === null) { socialPostsList(); return; }
        if ($method === 'POST' && $id === null) { socialPostCreate(); return; }
        if ($id !== null) {
            if ($method === 'GET' && ($segments[2] ?? null) === null) {
                $post = socialLoadPost((string)$id);
                if (!$post) je('Post not found.', 404);
                json(['ok' => true, 'post' => $post]);
            }
            if ($method === 'PUT' && ($segments[2] ?? null) === null) { socialPostUpdate((string)$id); return; }
            if ($method === 'DELETE' && ($segments[2] ?? null) === null) { socialPostDelete((string)$id); return; }
            if ($method === 'POST' && ($segments[2] ?? null) === 'publish-now') { socialPostPublishNow((string)$id); return; }
            if ($method === 'POST' && ($segments[2] ?? null) === 'retry') { socialPostRetry((string)$id); return; }
        }
    }
    json(['error' => 'Not found'], 404);
}

// ── Accounts ────────────────────────────────────────────────────────────

function socialAccountsList(): void
{
    $rows = db()->query('SELECT * FROM social_accounts ORDER BY platform ASC, created_at ASC')->fetchAll(PDO::FETCH_ASSOC);
    json([
        'ok' => true,
        'config' => [
            'metaConfigured' => socialMetaConfigured(),
            'googleConfigured' => socialGoogleConfigured(),
            'ingestConfigured' => socialConfig()['ingestKey'] !== '',
        ],
        // Storage lifecycle status (Social-Storage plan §3.4): media dir
        // vs its 2 GB budget + the hourly watchdog's account tier, so the
        // admin panel can show "storage watch/block" before it's a fire.
        'storage' => function_exists('socialStorageStatus') ? socialStorageStatus() : null,
        'accounts' => array_map('socialAccountPayload', $rows),
    ]);
}

function socialAccountDisconnect(string $id): void
{
    $stmt = db()->prepare("UPDATE social_accounts SET status = 'disconnected', access_token_enc = NULL, refresh_token_enc = NULL, updated_at = UTC_TIMESTAMP() WHERE id = ?");
    $stmt->execute([$id]);
    if ($stmt->rowCount() === 0) je('Account not found.', 404);
    auditLog('social.account.disconnected', 'social_account', $id);
    json(['ok' => true]);
}

function socialAccountReactivate(string $id): void
{
    $stmt = db()->prepare("UPDATE social_accounts SET status = 'connected', consecutive_failures = 0, updated_at = UTC_TIMESTAMP() WHERE id = ? AND status = 'needs_attention'");
    $stmt->execute([$id]);
    if ($stmt->rowCount() === 0) je('Account not found or not flagged.', 404);
    auditLog('social.account.reactivated', 'social_account', $id);
    json(['ok' => true]);
}

// ── OAuth start ─────────────────────────────────────────────────────────

function socialConnectMeta(): void
{
    if (!socialMetaConfigured()) {
        je('Meta is not configured on the server yet. The Meta app does not exist yet — once it is created, set META_APP_ID and META_APP_SECRET in php-api/.env and this button will work.', 503);
    }
    $cfg = socialConfig();
    $admin = requireAdminUser();
    $state = socialStateSign(['provider' => 'meta', 'uid' => (string)$admin['uid']]);
    $redirect = $cfg['apiPublicUrl'] . '/social-oauth/meta/callback';
    $url = 'https://www.facebook.com/' . $cfg['metaGraphVersion'] . '/dialog/oauth?' . http_build_query([
        'client_id' => $cfg['metaAppId'],
        'redirect_uri' => $redirect,
        'state' => $state,
        // business_management is REQUIRED for the callback's business
        // discovery route (/me/businesses -> owned_pages/client_pages).
        // Round 1 shipped without it in this list, so that route could
        // never return the portfolio-owned Shia Rishta Page.
        'scope' => 'pages_show_list,pages_read_engagement,pages_manage_posts,business_management,instagram_basic,instagram_content_publish',
        'response_type' => 'code',
    ]);
    json(['ok' => true, 'url' => $url]);
}

function socialConnectYouTube(): void
{
    if (!socialGoogleConfigured()) {
        je('Google is not configured on the server yet. Create the Google Cloud project, enable YouTube Data API v3, and set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in php-api/.env.', 503);
    }
    $cfg = socialConfig();
    $admin = requireAdminUser();
    $state = socialStateSign(['provider' => 'google', 'uid' => (string)$admin['uid']]);
    $redirect = $cfg['apiPublicUrl'] . '/social-oauth/google/callback';
    $url = 'https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query([
        'client_id' => $cfg['googleClientId'],
        'redirect_uri' => $redirect,
        'response_type' => 'code',
        'scope' => 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
        'access_type' => 'offline',
        'prompt' => 'consent',
        'state' => $state,
    ]);
    json(['ok' => true, 'url' => $url]);
}

// ── Meta page discovery ─────────────────────────────────────────────────

/**
 * Format a Graph error from a socialHttp() response for diagnostics:
 * "error <code>/<subcode>: <message>" (message clipped). Returns null
 * when the response carries no error. Never includes the access token
 * or the request URL — only Meta's own error fields.
 */
function socialGraphErrorDiag(array $res): ?string
{
    $err = $res['json']['error'] ?? null;
    if (is_array($err)) {
        $code = (string)($err['code'] ?? '?');
        $sub = isset($err['error_subcode']) ? '/' . (string)$err['error_subcode'] : '';
        $msg = trim((string)($err['message'] ?? 'unknown Graph error'));
        return 'error ' . $code . $sub . ': ' . substr($msg, 0, 140);
    }
    if (!empty($res['error'])) return 'transport: ' . substr((string)$res['error'], 0, 140);
    if (($res['json'] ?? null) === null && (int)($res['status'] ?? 0) >= 400) {
        return 'HTTP ' . (int)$res['status'] . ' with no Graph error body';
    }
    return null;
}

/**
 * GET a Graph list endpoint and follow paging.next (bounded to 5 pages).
 * Returns the merged `data` rows; a failed/permission-denied call yields
 * [] so callers can fall back to another route instead of dying — but
 * the first failure's Graph error is written to $firstError (when the
 * caller passes it) so an empty result is never again indistinguishable
 * from a permission error (the round-1/round-2 connect bug: every route
 * silently "empty", zero signal about why).
 */
function socialGraphListAll(string $url, string $accessToken, ?string &$firstError = null): array
{
    $rows = [];
    $next = $url;
    for ($i = 0; $i < 5 && $next !== ''; $i++) {
        $sep = str_contains($next, '?') ? '&' : '?';
        $full = str_contains($next, 'access_token=') ? $next : $next . $sep . 'access_token=' . urlencode($accessToken);
        $res = socialHttp('GET', $full);
        $data = $res['json']['data'] ?? null;
        if (!is_array($data)) {
            if ($firstError === null) $firstError = socialGraphErrorDiag($res) ?? 'no data in response';
            break;
        }
        foreach ($data as $row) {
            if (is_array($row)) $rows[] = $row;
        }
        $next = (string)($res['json']['paging']['next'] ?? '');
    }
    return $rows;
}

/**
 * Build the admin-facing error for a zero-page discovery: one entry per
 * route with its outcome (row count, "empty", or the Graph error), plus
 * any key permissions that were declined / not granted. One failed
 * connect attempt must be enough to diagnose the cause. Contains no
 * tokens — only Meta's own error text and route tallies.
 *
 * @param array<string,string> $diag        route => outcome
 * @param array<int,string>    $missingPerms permission names
 */
function socialMetaNoPagesMessage(array $diag, array $missingPerms): string
{
    $parts = [];
    foreach ($diag as $route => $outcome) $parts[] = $route . ': ' . $outcome;
    $msg = 'No Facebook Page was found on that Meta account. Discovery — '
        . ($parts ? implode('; ', $parts) : 'no routes ran') . '.';
    if ($missingPerms !== []) {
        $msg .= ' Permissions declined or not granted: ' . implode(', ', $missingPerms) . '.';
    }
    return substr($msg, 0, 600);
}

/**
 * Discover every Facebook Page the connecting user can act on.
 *
 * Routes, in order (results merged):
 *   1. /me/accounts?limit=100 — the classic edge; the raised limit
 *      matters for users who manage many Pages.
 *   2. /me?fields=accounts{...} — the same connection nested under /me;
 *      under Facebook Login for Business this can return the granted
 *      assets even when the top-level edge comes back empty.
 *   3. Business route (only when routes 1–2 found nothing, or found
 *      pages but none carries a linked Instagram account): enumerate
 *      the user's businesses and merge their owned_pages + client_pages.
 *      Requires business_management — requested at connect since round
 *      2; round 1 never asked for it, so this route silently errored.
 *      The Shia Rishta Page is owned by business portfolio
 *      2222291815376368, so it only shows up reliably through here.
 *
 * Every route's outcome (row count / "empty" / first Graph error) is
 * recorded into $diag when the caller passes it, so a zero-page result
 * carries its own diagnosis instead of a bare "no Page found".
 *
 * Pages are deduped by id (fields merged so a later route can fill a
 * missing access_token / IG link) and sorted with IG-linked pages first,
 * so the earliest-stored facebook account — the one autopilot/ingest
 * pick by default — is a page that has an Instagram account.
 *
 * @param array<string,string>|null $diag route => outcome, filled when passed
 * @return array<int,array<string,mixed>>
 */
function socialDiscoverMetaPages(string $userToken, string $version, ?array &$diag = null): array
{
    $fields = 'id,name,access_token,instagram_business_account{id,username}';
    $base = 'https://graph.facebook.com/' . $version;
    $diag = [];
    $byId = [];
    $add = static function (array $rows) use (&$byId): void {
        foreach ($rows as $row) {
            $id = (string)($row['id'] ?? '');
            if ($id === '') continue;
            if (!isset($byId[$id])) { $byId[$id] = $row; continue; }
            foreach (['name', 'access_token', 'instagram_business_account'] as $k) {
                if (empty($byId[$id][$k]) && !empty($row[$k])) $byId[$id][$k] = $row[$k];
            }
        }
    };
    $hasIg = static function (array $pages): bool {
        foreach ($pages as $p) {
            if (!empty($p['instagram_business_account']['id'])) return true;
        }
        return false;
    };
    $tally = static fn(array $rows, ?string $err): string => $err ?? ($rows === [] ? 'empty' : count($rows) . ' row(s)');

    // Route 1: /me/accounts.
    $err = null;
    $rows = socialGraphListAll($base . '/me/accounts?fields=' . $fields . '&limit=100', $userToken, $err);
    $diag['accounts'] = $tally($rows, $err);
    $add($rows);

    // Route 2: accounts connection nested under /me.
    $res = socialHttp('GET', $base . '/me?fields=accounts{' . $fields . '}&access_token=' . urlencode($userToken));
    $nested = $res['json']['accounts']['data'] ?? null;
    if (is_array($nested)) {
        $diag['me.accounts-field'] = $nested === [] ? 'empty' : count($nested) . ' row(s)';
        $add($nested);
        $next = (string)($res['json']['accounts']['paging']['next'] ?? '');
        if ($next !== '') $add(socialGraphListAll($next, $userToken));
    } else {
        $diag['me.accounts-field'] = socialGraphErrorDiag($res) ?? 'empty';
    }

    // Route 3: businesses -> owned/client pages.
    if ($byId === [] || !$hasIg($byId)) {
        $errB = null;
        $businesses = socialGraphListAll($base . '/me/businesses?fields=id,name', $userToken, $errB);
        $diag['businesses'] = $tally($businesses, $errB);
        if ($businesses !== []) {
            $pageRows = 0;
            $errP = null;
            foreach ($businesses as $biz) {
                $bid = (string)($biz['id'] ?? '');
                if ($bid === '') continue;
                $e1 = null;
                $e2 = null;
                $owned = socialGraphListAll($base . '/' . $bid . '/owned_pages?fields=' . $fields, $userToken, $e1);
                $client = socialGraphListAll($base . '/' . $bid . '/client_pages?fields=' . $fields, $userToken, $e2);
                $pageRows += count($owned) + count($client);
                if ($errP === null) $errP = $e1 ?? $e2;
                $add($owned);
                $add($client);
            }
            $diag['business-pages'] = $errP ?? ($pageRows === 0 ? 'empty' : $pageRows . ' row(s)');
        }
    }

    $pages = array_values($byId);
    usort($pages, static function (array $a, array $b): int {
        $ai = !empty($a['instagram_business_account']['id']) ? 0 : 1;
        $bi = !empty($b['instagram_business_account']['id']) ? 0 : 1;
        return $ai <=> $bi;
    });
    return $pages;
}

// ── OAuth callbacks (public — state is HMAC-signed) ─────────────────────

function routeSocialOAuth(string $provider, string $action): void
{
    if ($action !== 'callback') { json(['error' => 'Not found'], 404); }
    $cfg = socialConfig();
    $back = $cfg['adminUrl'];
    $fail = static function (string $msg) use ($back): never {
        header('Location: ' . $back . '?social_error=' . urlencode($msg));
        exit;
    };
    $state = socialStateVerify((string)($_GET['state'] ?? ''));
    if (!$state || ($state['provider'] ?? '') !== $provider) $fail('Sign-in link expired or invalid. Please try connecting again from the admin.');
    $code = (string)($_GET['code'] ?? '');
    if ($code === '') $fail('The provider did not return an authorization code.');

    if ($provider === 'meta') {
        if (!socialMetaConfigured()) $fail('Meta is not configured on the server.');
        $redirect = $cfg['apiPublicUrl'] . '/social-oauth/meta/callback';
        $tok = socialHttp('GET', 'https://graph.facebook.com/' . $cfg['metaGraphVersion'] . '/oauth/access_token?' . http_build_query([
            'client_id' => $cfg['metaAppId'], 'client_secret' => $cfg['metaAppSecret'],
            'redirect_uri' => $redirect, 'code' => $code,
        ]));
        $short = (string)($tok['json']['access_token'] ?? '');
        if ($short === '') $fail('Meta did not return an access token.');
        // Exchange for a long-lived user token; Page tokens derived from
        // it do not expire on the normal 60-day cycle.
        $long = socialHttp('GET', 'https://graph.facebook.com/' . $cfg['metaGraphVersion'] . '/oauth/access_token?' . http_build_query([
            'grant_type' => 'fb_exchange_token', 'client_id' => $cfg['metaAppId'],
            'client_secret' => $cfg['metaAppSecret'], 'fb_exchange_token' => $short,
        ]));
        $userToken = (string)($long['json']['access_token'] ?? $short);
        // Page discovery must survive Facebook Login for Business
        // asset-scoped grants: /me/accounts can come back EMPTY when the
        // user granted specific assets instead of "all Pages", and its
        // nested instagram_business_account expansion can be missing even
        // when pages are returned. socialDiscoverMetaPages() tries the
        // /me/accounts edge, the accounts connection nested under /me,
        // and the business route (owned + client pages), and reports
        // each route's outcome in $diag.
        $base = 'https://graph.facebook.com/' . $cfg['metaGraphVersion'];
        $diag = [];
        $list = socialDiscoverMetaPages($userToken, $cfg['metaGraphVersion'], $diag);
        if ($list === []) {
            // Distinguish "permission declined / never granted" (fix:
            // re-grant in the OAuth dialog) from "granted but empty"
            // (fix: asset assignment). /me/permissions is only read on
            // this failure path, so a successful connect pays nothing.
            $permStatus = [];
            foreach (socialGraphListAll($base . '/me/permissions', $userToken) as $pr) {
                if (!empty($pr['permission'])) $permStatus[(string)$pr['permission']] = (string)($pr['status'] ?? '');
            }
            $missing = [];
            foreach (['pages_show_list', 'pages_manage_posts', 'business_management', 'instagram_basic'] as $key) {
                if (($permStatus[$key] ?? '') !== 'granted') $missing[] = $key;
            }
            $fail(socialMetaNoPagesMessage($diag, $missing));
        }
        $scopes = 'pages_show_list,pages_read_engagement,pages_manage_posts,business_management,instagram_basic,instagram_content_publish';
        $stored = 0;
        foreach ($list as $page) {
            $pageToken = (string)($page['access_token'] ?? '');
            if ($pageToken === '' || empty($page['id'])) continue;
            $pageId = (string)$page['id'];
            socialUpsertAccount('facebook', $pageId, (string)($page['name'] ?? 'Facebook Page'), $pageToken, null, null, $scopes);
            $stored++;
            // Instagram discovery: use the list payload when present,
            // otherwise ask the Page directly — the nested field is not
            // reliably expanded on list responses for business logins.
            $ig = $page['instagram_business_account'] ?? null;
            if (!is_array($ig) || empty($ig['id'])) {
                $one = socialHttp('GET', $base . '/' . $pageId . '?fields=instagram_business_account{id,username}&access_token=' . urlencode($pageToken));
                $ig = $one['json']['instagram_business_account'] ?? null;
            }
            if (is_array($ig) && !empty($ig['id'])) {
                $igName = (string)($ig['username'] ?? '');
                if ($igName === '') {
                    $igRes = socialHttp('GET', $base . '/' . (string)$ig['id'] . '?fields=username&access_token=' . urlencode($pageToken));
                    $igName = (string)($igRes['json']['username'] ?? '');
                }
                socialUpsertAccount('instagram', (string)$ig['id'], $igName !== '' ? $igName : 'Instagram', $pageToken, null, null, $scopes);
            }
        }
        if ($stored === 0) $fail('Facebook Pages were visible but none returned a Page access token. Please grant Page access for the app and try again.');
        header('Location: ' . $back . '?social_connected=meta');
        exit;
    }

    if ($provider === 'google') {
        if (!socialGoogleConfigured()) $fail('Google is not configured on the server.');
        $redirect = $cfg['apiPublicUrl'] . '/social-oauth/google/callback';
        $tok = socialHttp('POST', 'https://oauth2.googleapis.com/token', [
            'body' => http_build_query([
                'code' => $code, 'client_id' => $cfg['googleClientId'],
                'client_secret' => $cfg['googleClientSecret'],
                'redirect_uri' => $redirect, 'grant_type' => 'authorization_code',
            ]),
            'headers' => ['Content-Type: application/x-www-form-urlencoded'],
        ]);
        $access = (string)($tok['json']['access_token'] ?? '');
        if ($access === '') $fail('Google did not return an access token.');
        $refresh = (string)($tok['json']['refresh_token'] ?? '');
        $expires = gmdate('Y-m-d H:i:s', time() + (int)($tok['json']['expires_in'] ?? 3600));
        $ch = socialHttp('GET', 'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', [
            'headers' => ['Authorization: Bearer ' . $access],
        ]);
        $channel = $ch['json']['items'][0] ?? null;
        if (!is_array($channel) || empty($channel['id'])) $fail('No YouTube channel was found on that Google account.');
        socialUpsertAccount('youtube', (string)$channel['id'], (string)($channel['snippet']['title'] ?? 'YouTube channel'), $access, $refresh !== '' ? $refresh : null, $expires, 'youtube.upload,youtube.readonly');
        header('Location: ' . $back . '?social_connected=youtube');
        exit;
    }

    $fail('Unknown provider.');
}

function socialUpsertAccount(string $platform, string $platformId, string $name, string $accessToken, ?string $refreshToken, ?string $expiresAt, string $scopes): void
{
    $existing = db()->prepare('SELECT id, refresh_token_enc FROM social_accounts WHERE platform = ? AND platform_account_id = ? LIMIT 1');
    $existing->execute([$platform, $platformId]);
    $row = $existing->fetch(PDO::FETCH_ASSOC);
    if ($row) {
        // Keep an existing refresh token when the provider did not send
        // a new one (Google only sends it on first consent).
        $refreshEnc = $refreshToken !== null ? encAtRest($refreshToken) : $row['refresh_token_enc'];
        db()->prepare("UPDATE social_accounts SET account_name = ?, access_token_enc = ?, refresh_token_enc = ?, token_expires_at = ?, scopes = ?, status = 'connected', consecutive_failures = 0, updated_at = UTC_TIMESTAMP() WHERE id = ?")
            ->execute([$name, encAtRest($accessToken), $refreshEnc, $expiresAt, $scopes, $row['id']]);
        return;
    }
    db()->prepare('INSERT INTO social_accounts (id, platform, platform_account_id, account_name, access_token_enc, refresh_token_enc, token_expires_at, scopes, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, \'connected\')')
        ->execute([uuid(), $platform, $platformId, $name, encAtRest($accessToken), $refreshToken !== null ? encAtRest($refreshToken) : null, $expiresAt, $scopes]);
}

// ── Media ───────────────────────────────────────────────────────────────

function socialMediaUpload(): void
{
    requireAdminUser();
    $kind = (($_POST['kind'] ?? 'image') === 'video') ? 'video' : 'image';
    $file = $_FILES['media'] ?? null;
    if (!is_array($file)) je('Attach a media file.', 400);
    [$rel, $mediaType] = socialStoreUpload($file, $kind);
    json(['ok' => true, 'mediaPath' => $rel, 'mediaType' => $mediaType,
          'mediaUrl' => socialConfig()['apiPublicUrl'] . '/social-media/' . rawurlencode(basename($rel))], 201);
}

/** Public serve for platform fetches (IG containers pull from this URL). */
function routeSocialMediaServe(string $file): void
{
    $base = basename($file);
    if (!preg_match('/^[A-Za-z0-9._-]+$/', $base)) { json(['error' => 'Not found'], 404); }
    $path = photoBaseDir() . '/social/' . $base;
    if (!is_file($path)) { json(['error' => 'Not found'], 404); }
    header('Content-Type: ' . socialMimeFor($path));
    header('Content-Length: ' . (string)filesize($path));
    header('Cache-Control: public, max-age=3600');
    readfile($path);
    exit;
}

// ── Posts CRUD ──────────────────────────────────────────────────────────

function socialPostsList(): void
{
    $rows = db()->query('SELECT * FROM social_posts ORDER BY COALESCE(scheduled_at, created_at) DESC LIMIT 100')->fetchAll(PDO::FETCH_ASSOC);
    $out = [];
    foreach ($rows as $row) {
        $stmt = db()->prepare('SELECT * FROM social_post_targets WHERE post_id = ? ORDER BY platform ASC');
        $stmt->execute([$row['id']]);
        $out[] = socialPostPayload($row, $stmt->fetchAll(PDO::FETCH_ASSOC));
    }
    json(['ok' => true, 'posts' => $out]);
}

/** Validate + resolve the target accounts for a create/update payload. */
function socialResolveAccounts(array $accountIds): array
{
    if ($accountIds === []) je('Pick at least one connected account to post to.', 400);
    $accounts = [];
    foreach ($accountIds as $aid) {
        $stmt = db()->prepare('SELECT * FROM social_accounts WHERE id = ? LIMIT 1');
        $stmt->execute([(string)$aid]);
        $acc = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$acc) je('One of the selected accounts no longer exists.', 400);
        if ((string)$acc['status'] === 'disconnected') je('Account "' . ($acc['account_name'] ?? $acc['platform']) . '" is disconnected.', 400);
        $accounts[] = $acc;
    }
    return $accounts;
}

function socialPostCreate(): void
{
    $admin = requireAdminUser();
    $body = requestJson();
    $caption = trim((string)($body['caption'] ?? ''));
    if ($caption === '') je('Write a caption first.', 400);
    $accounts = socialResolveAccounts(is_array($body['accountIds'] ?? null) ? $body['accountIds'] : []);
    $publishNow = !empty($body['publishNow']);
    $scheduledAt = trim((string)($body['scheduledAt'] ?? ''));
    $status = $publishNow ? 'scheduled' : ($scheduledAt !== '' ? 'scheduled' : 'draft');
    $scheduledDb = null;
    if ($scheduledAt !== '') {
        $ts = strtotime($scheduledAt);
        if ($ts === false) je('Scheduled time is not a valid date/time.', 400);
        $scheduledDb = gmdate('Y-m-d H:i:s', $ts);
    }
    $overrides = null;
    if (isset($body['captionOverrides']) && is_array($body['captionOverrides']) && $body['captionOverrides'] !== []) {
        $clean = [];
        foreach (['facebook', 'instagram', 'youtube'] as $p) {
            if (!empty($body['captionOverrides'][$p])) $clean[$p] = (string)$body['captionOverrides'][$p];
        }
        $overrides = $clean ? (string)json_encode($clean, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null;
    }
    $postId = uuid();
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->prepare(
            "INSERT INTO social_posts (id, caption, caption_overrides, media_path, media_type, media_url, scheduled_at, status, source, caption_hash, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)"
        )->execute([
            $postId, $caption, $overrides,
            !empty($body['mediaPath']) ? (string)$body['mediaPath'] : null,
            !empty($body['mediaType']) ? (string)$body['mediaType'] : null,
            !empty($body['mediaUrl']) ? (string)$body['mediaUrl'] : null,
            $scheduledDb, $status, socialCaptionHash($caption), (string)$admin['uid'],
        ]);
        $ins = $pdo->prepare("INSERT INTO social_post_targets (id, post_id, social_account_id, platform, status) VALUES (?, ?, ?, ?, 'pending')");
        foreach ($accounts as $acc) $ins->execute([uuid(), $postId, $acc['id'], $acc['platform']]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    auditLog('social.post.created', 'social_post', $postId, ['publishNow' => $publishNow]);
    if ($publishNow) {
        $result = socialPublishPost($postId);
        json(['ok' => true, 'post' => socialLoadPost($postId), 'publish' => $result], 201);
    }
    json(['ok' => true, 'post' => socialLoadPost($postId)], 201);
}

function socialPostUpdate(string $id): void
{
    requireAdminUser();
    $stmt = db()->prepare('SELECT * FROM social_posts WHERE id = ? LIMIT 1');
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) je('Post not found.', 404);
    if (in_array((string)$row['status'], ['published', 'publishing'], true)) {
        je('This post has already been published and cannot be edited.', 409);
    }
    $body = requestJson();
    $caption = array_key_exists('caption', $body) ? trim((string)$body['caption']) : (string)$row['caption'];
    if ($caption === '') je('Caption cannot be empty.', 400);
    $scheduledDb = $row['scheduled_at'];
    if (array_key_exists('scheduledAt', $body)) {
        $scheduledAt = trim((string)$body['scheduledAt']);
        if ($scheduledAt === '') { $scheduledDb = null; }
        else {
            $ts = strtotime($scheduledAt);
            if ($ts === false) je('Scheduled time is not a valid date/time.', 400);
            $scheduledDb = gmdate('Y-m-d H:i:s', $ts);
        }
    }
    db()->prepare('UPDATE social_posts SET caption = ?, caption_hash = ?, scheduled_at = ?, status = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?')
        ->execute([$caption, socialCaptionHash($caption), $scheduledDb, $scheduledDb ? 'scheduled' : 'draft', $id]);
    if (isset($body['accountIds']) && is_array($body['accountIds'])) {
        $accounts = socialResolveAccounts($body['accountIds']);
        db()->prepare("DELETE FROM social_post_targets WHERE post_id = ? AND status IN ('pending','failed')")->execute([$id]);
        $ins = db()->prepare("INSERT IGNORE INTO social_post_targets (id, post_id, social_account_id, platform, status) VALUES (?, ?, ?, ?, 'pending')");
        foreach ($accounts as $acc) $ins->execute([uuid(), $id, $acc['id'], $acc['platform']]);
    }
    json(['ok' => true, 'post' => socialLoadPost($id)]);
}

function socialPostDelete(string $id): void
{
    requireAdminUser();
    $stmt = db()->prepare('SELECT status FROM social_posts WHERE id = ? LIMIT 1');
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) je('Post not found.', 404);
    if ((string)$row['status'] === 'publishing') je('This post is publishing right now and cannot be deleted.', 409);
    db()->prepare('DELETE FROM social_post_targets WHERE post_id = ?')->execute([$id]);
    db()->prepare('DELETE FROM social_posts WHERE id = ?')->execute([$id]);
    auditLog('social.post.deleted', 'social_post', $id);
    json(['ok' => true]);
}

function socialPostPublishNow(string $id): void
{
    requireAdminUser();
    $post = socialLoadPost($id);
    if (!$post) je('Post not found.', 404);
    if ($post['status'] === 'published') je('This post is already published.', 409);
    db()->prepare("UPDATE social_posts SET status = 'scheduled', updated_at = UTC_TIMESTAMP() WHERE id = ?")->execute([$id]);
    $result = socialPublishPost($id);
    auditLog('social.post.publish_now', 'social_post', $id, ['result' => $result['status']]);
    json(['ok' => true, 'post' => socialLoadPost($id), 'publish' => $result]);
}

function socialPostRetry(string $id): void
{
    requireAdminUser();
    $post = socialLoadPost($id);
    if (!$post) je('Post not found.', 404);
    $result = socialPublishPost($id, true);
    auditLog('social.post.retry', 'social_post', $id, ['result' => $result['status']]);
    json(['ok' => true, 'post' => socialLoadPost($id), 'publish' => $result]);
}

// ── Autopilot settings ──────────────────────────────────────────────────

function socialAutopilotGet(): void
{
    json(['ok' => true, 'autopilot' => socialAutopilotSettings()]);
}

function socialAutopilotUpdate(): void
{
    $admin = requireAdminUser();
    $body = requestJson();
    $settings = socialAutopilotSettings();
    if (array_key_exists('enabled', $body)) $settings['enabled'] = !empty($body['enabled']);
    if (isset($body['platforms']) && is_array($body['platforms'])) {
        foreach (['facebook', 'instagram', 'youtube'] as $p) {
            if (!isset($body['platforms'][$p]) || !is_array($body['platforms'][$p])) continue;
            if (array_key_exists('enabled', $body['platforms'][$p])) {
                $settings['platforms'][$p]['enabled'] = !empty($body['platforms'][$p]['enabled']);
            }
            if (array_key_exists('dailyCap', $body['platforms'][$p])) {
                $settings['platforms'][$p]['dailyCap'] = max(0, min(100, (int)$body['platforms'][$p]['dailyCap']));
            }
        }
    }
    socialAutopilotSaveSettings($settings, (string)$admin['uid']);
    auditLog('social.autopilot.updated', 'social_autopilot', 'settings', ['enabled' => $settings['enabled']]);
    json(['ok' => true, 'autopilot' => $settings]);
}

// ── Reel ingest (Muse-side generator -> queue) ──────────────────────────
// POST /api/social-ingest with header X-Ingest-Key: <SOCIAL_INGEST_KEY>.
// Body: multipart with 'video' file OR mediaRef=<basename of a file
// already in the social media dir>, plus caption, optional
// captionOverrides (JSON string), optional scheduledAt (ISO; default =
// next free autopilot slot). Creates source='autopilot_reel' post with
// targets for every connected, healthy account on FB/IG/YouTube subject
// to the autopilot platform enables + daily caps. The kill switch applies:
// when autopilot is OFF the ingest refuses, so stopping autopilot stops
// the reel feed too.

function routeSocialIngest(): void
{
    $expected = socialConfig()['ingestKey'];
    $provided = (string)($_SERVER['HTTP_X_INGEST_KEY'] ?? '');
    if ($expected === '' || !hash_equals($expected, $provided)) {
        json(['error' => 'Forbidden'], 403);
    }
    $settings = socialAutopilotSettings();
    if (empty($settings['enabled'])) {
        json(['error' => 'Autopilot is OFF — ingest is paused by the kill switch.'], 409);
    }
    // Storage watchdog (≥85% of account quota): new renders/ingest pause
    // until space frees up; publishing of queued posts continues.
    if (function_exists('socialStorageIngestBlocked') && socialStorageIngestBlocked()) {
        json(['error' => 'Storage watchdog: account disk usage is at or over 85% of quota — new reel ingest is paused until space frees up. Publishing continues.'], 503);
    }

    $caption = trim((string)($_POST['caption'] ?? ''));
    if ($caption === '') json(['error' => 'caption is required'], 400);
    if (socialCaptionExists($caption)) json(['error' => 'duplicate caption — this exact caption was already queued or posted'], 409);

    // Video: fresh multipart upload, or a reference to an uploaded file.
    $mediaPath = null;
    if (!empty($_FILES['video']) && is_array($_FILES['video'])) {
        [$mediaPath] = socialStoreUpload($_FILES['video'], 'video');
    } elseif (!empty($_POST['mediaRef'])) {
        $base = basename((string)$_POST['mediaRef']);
        if (!is_file(photoBaseDir() . '/social/' . $base)) json(['error' => 'mediaRef file not found in the social media dir'], 400);
        $mediaPath = 'social/' . $base;
    } else {
        json(['error' => 'a video file (multipart field "video") or mediaRef is required'], 400);
    }

    $scheduledAt = trim((string)($_POST['scheduledAt'] ?? ''));
    if ($scheduledAt !== '') {
        $ts = strtotime($scheduledAt);
        if ($ts === false) json(['error' => 'scheduledAt is not a valid date/time'], 400);
        $slot = gmdate('Y-m-d H:i:s', $ts);
    } else {
        $slot = socialNextAutopilotSlot();
    }

    $overrides = null;
    if (!empty($_POST['captionOverrides'])) {
        $decoded = json_decode((string)$_POST['captionOverrides'], true);
        if (is_array($decoded) && $decoded !== []) {
            $overrides = (string)json_encode($decoded, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }
    }

    $targets = [];
    $skipped = [];
    foreach (['facebook', 'instagram', 'youtube'] as $platform) {
        $cfg = $settings['platforms'][$platform];
        if (empty($cfg['enabled'])) { $skipped[$platform] = 'platform disabled in autopilot settings'; continue; }
        if (socialAutopilotTodayCount($platform) >= (int)$cfg['dailyCap']) { $skipped[$platform] = 'daily cap reached'; continue; }
        $stmt = db()->prepare("SELECT * FROM social_accounts WHERE platform = ? AND status = 'connected' ORDER BY created_at ASC LIMIT 1");
        $stmt->execute([$platform]);
        $acc = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$acc) { $skipped[$platform] = 'no connected healthy account'; continue; }
        $targets[$platform] = $acc;
    }
    if (!$targets) json(['error' => 'no eligible target platforms', 'skipped' => $skipped], 422);

    $postId = uuid();
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->prepare(
            "INSERT INTO social_posts (id, caption, caption_overrides, media_path, media_type, media_url, scheduled_at, status, source, caption_hash, created_by)
             VALUES (?, ?, ?, ?, 'video', NULL, ?, 'scheduled', 'autopilot_reel', ?, NULL)"
        )->execute([$postId, $caption, $overrides, $mediaPath, $slot, socialCaptionHash($caption)]);
        $ins = $pdo->prepare("INSERT INTO social_post_targets (id, post_id, social_account_id, platform, status) VALUES (?, ?, ?, ?, 'pending')");
        foreach ($targets as $platform => $acc) $ins->execute([uuid(), $postId, $acc['id'], $platform]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        json(['error' => 'ingest insert failed: ' . substr($e->getMessage(), 0, 160)], 500);
    }
    json(['ok' => true, 'post' => socialLoadPost($postId), 'skipped' => $skipped], 201);
}
