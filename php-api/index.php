<?php
// Shia Rishta PHP API — front controller.
// Deploy: point the vhost document root here (or Apache Alias /api → this dir).

declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/logger.php';
require __DIR__ . '/lib/validate.php';
require __DIR__ . '/lib/ProfileService.php';
require __DIR__ . '/lib/AdminService.php';
require __DIR__ . '/lib/AuthService.php';
require __DIR__ . '/lib/NotificationService.php';
require __DIR__ . '/lib/JobQueue.php';
require __DIR__ . '/lib/db.php';
require __DIR__ . '/lib/jwt.php';
require __DIR__ . '/lib/util.php';
require __DIR__ . '/lib/mail.php';
require __DIR__ . '/lib/ratelimit.php';
require __DIR__ . '/lib/migrate.php';
require __DIR__ . '/lib/sessions.php';
require __DIR__ . '/routes/auth.php';
require __DIR__ . '/routes/profiles.php';
require __DIR__ . '/routes/users.php';
require __DIR__ . '/routes/messages.php';
require __DIR__ . '/routes/community.php';
require __DIR__ . '/routes/reports.php';
require __DIR__ . '/routes/verifications.php';
require __DIR__ . '/routes/wali.php';
require __DIR__ . '/routes/drafts.php';
require __DIR__ . '/routes/admin.php';
require __DIR__ . '/routes/analytics.php';
require __DIR__ . '/routes/compatibility.php';
require __DIR__ . '/routes/contact.php';
require __DIR__ . '/routes/matchmaker.php';
require __DIR__ . '/routes/biodata.php';
require __DIR__ . '/routes/sitemap.php';
require __DIR__ . '/routes/llms.php';
require __DIR__ . '/routes/blog-ssr.php';
require __DIR__ . '/routes/social.php';
require __DIR__ . '/lib/ai.php';
require __DIR__ . '/routes/ai.php';
require __DIR__ . '/routes/config.php';

// ── Global error handler: structured log + safe 500 ─────────────────────────
// Without this, a fatal error returns a blank 500 with nothing in the logs.
set_exception_handler(function (Throwable $e) {
    logError('Uncaught exception', [
        'message' => $e->getMessage(),
        'file' => basename($e->getFile()),
        'line' => $e->getLine(),
    ]);
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json');
    }
    echo json_encode(['error' => 'Something went wrong. Please try again.']);
});

// ── Security headers (helmet-equivalent, zero dependencies) ─────────────────
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
header('Cross-Origin-Resource-Policy: cross-origin');
header('Cache-Control: no-store');
if ((getenv('APP_ENV') ?: 'development') === 'production') {
    header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
}

// ── CORS — mirrors express cors({origin: CLIENT_URL, credentials: true}) ────
$origins = array_map('trim', explode(',', getenv('CLIENT_URL') ?: 'http://localhost:5173'));
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && in_array($origin, $origins, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
    header('Access-Control-Allow-Credentials: true');
}
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');

// Precedence matters: parentheses around the ?? expression. Without them this
// evaluated as REQUEST_METHOD ?? ('GET' === 'OPTIONS') and 204'd EVERY request.
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Boot-time JWT gate (mirrors index.js failFast) ──────────────────────────
$knownDefaults = ['change-me-to-a-long-random-secret', 'dev-only-secret-change-me', 'test-secret-for-verification-only-not-production'];
$secret = getenv('JWT_SECRET') ?: '';
$isProd = (getenv('APP_ENV') ?: 'development') === 'production';
if (strlen($secret) < 32) {
    if ($isProd) {
        json(['error' => 'Server misconfigured: JWT_SECRET must be at least 32 characters.'], 500);
    }
} elseif (in_array($secret, $knownDefaults, true) && $isProd) {
    json(['error' => 'Server misconfigured: JWT_SECRET is a known default value.'], 500);
}

// ── Schema migration (idempotent, cheap when already applied) ───────────────
migrateSchema();

// ── Parse route ─────────────────────────────────────────────────────────────
$url = $_SERVER['REQUEST_URI'] ?? '/';
$uri = parse_url($url, PHP_URL_PATH) ?: '/';
$uri = preg_replace('#/+#', '/', $uri);
$trimmed = trim($uri, '/');
$segments = $trimmed === '' ? [] : explode('/', $trimmed);

// Health: /health or /api/health — honest about DB state like Node.
if ($segments === [] || $segments === ['health'] || $segments === ['api', 'health']) {
    $t = gmdate('c');
    try {
        db()->query('SELECT 1');
        json(['ok' => true, 'db' => 'up', 'migrated' => true, 'time' => $t]);
    } catch (Throwable $e) {
        json(['ok' => false, 'db' => 'down', 'error' => 'database unreachable', 'time' => $t], 503);
    }
}

if (($segments[0] ?? '') === 'api') {
    array_shift($segments);
}
// ── API versioning ────────────────────────────────────────────────────────────
// /api/v1/... is the canonical prefix. Bare /api/... (no version) routes to
// v1 for backward compatibility. When v2 ships with breaking changes, add
// `case 'v2'` here and keep v1 handlers untouched.
$apiVersion = 'v1';
if (($segments[0] ?? '') === 'v1' || ($segments[0] ?? '') === 'v2') {
    $apiVersion = array_shift($segments);
}
header('X-API-Version: ' . $apiVersion);
if ($segments === []) {
    json(['service' => 'shiarishta-php-api', 'status' => 'ok', 'version' => $apiVersion], 200);
}

$resource = strtolower((string)$segments[0]);
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$rest = array_slice($segments, 1);

// ── Rate limits (same ceilings as server/index.js) ─────────────────────────
try {
    if ($resource === 'auth') {
        $action = $rest[0] ?? '';
        if ($method === 'POST' && $action === 'login') {
            $body = requestJson();
            $emailKey = strtolower(substr((string)($body['email'] ?? 'none'), 0, 120));
            rateCheck('login:acct', cip() . ':' . $emailKey, 5, 900, 'Too many attempts for this account. Try again in 15 minutes.');
        }
        rateCheck('auth:ip', cip(), 30, 900, 'Too many sign-up/sign-in attempts from your network. Try again in 15 minutes.');
        if ($method === 'POST' && $action === 'register') rateCheck('register:ip', cip(), 3, 3600, 'Too many accounts created from your network. Try again in an hour.');
        if ($action === 'forgot')  rateCheck('forgot:ip', cip(), 5, 3600, 'Too many reset requests. Check your inbox, or try again in an hour.');
        if ($action === 'reset')   rateCheck('reset:ip', cip(), 10, 3600, 'Too many attempts. Try again in an hour.');
        if ($action === 'resend-verification') rateCheck('resend:ip', cip(), 5, 3600, 'Too many verification requests. Try again in an hour.');
    }
    // Read limiter: DISABLED 2026-10-07 — cip() returns the shared proxy IP
    // when TRUST_PROXY isn't set, so the bucket was shared across all users
    // and blocked legitimate traffic. Re-enable only after fixing client IP
    // detection behind Cloudflare.
    // if ($method === 'GET' && in_array($resource, ['profiles', 'search'], true)) {
    //     rateCheck('read:profiles', cip(), 120, 300, 'Too many requests. Please slow down.');
    // }
    // Sitemap and llms.txt are crawler targets — 30 per hour per IP.
    if ($method === 'GET' && in_array($resource, ['sitemap', 'llms'], true)) {
        rateCheck('read:crawler', cip(), 30, 3600, 'Crawl rate exceeded. Please slow down.');
    }
    // Write limiter for every other mutating resource.
    // EXEMPTION: the analytics beacon (POST /api/analytics/collect) fires on
    // every page view by design. It must NOT consume the shared 'write' bucket
    // — cip() is the shared Cloudflare proxy IP, so 30/min would 429 every
    // visitor (the 2026-10-07 incident). The endpoint enforces its own
    // per-visitor-day bucket inside routeAnalytics().
    $isBeacon = $method === 'POST' && $resource === 'analytics' && ($rest[0] ?? '') === 'collect';
    if (!$isBeacon) {
        writeRateCheck();
    }
} catch (Throwable $e) {
    logWarn('Rate limiter error', ['error' => $e->getMessage()]);
}

// ── Dispatch ───────────────────────────────────────────────────────────────
$requestId = bin2hex(random_bytes(8));
header('X-Request-Id: ' . $requestId);

try {
    switch ($resource) {
        case 'auth':
            // Social login lives under /api/auth/social.
            if ($method === 'POST' && ($rest[0] ?? '') === 'social') {
                routeSocial($method, $rest);
                break;
            }
            routeAuth($method, $rest);
            break;
        case 'profiles':
            routeProfiles($method, $rest);
            break;
        case 'compatibility':
            routeCompatibility($method, $rest);
            break;
        case 'users':
            routeUsers($method, $rest);
            break;
        case 'messages':
            requireAuthUser();
            routeMessages($method, $rest);
            break;
        case 'matchmaker':
            routeMatchmaker($method, $rest);
            break;
        case 'biodata':
            routeBiodata($method, $rest);
            break;
        case 'community':
            routeCommunity($method, $rest);
            break;
        case 'reports':
            requireAuthUser();
            routeReports($method, $rest);
            break;
        case 'verifications':
            requireAuthUser();
            routeVerifications($method, $rest);
            break;
        case 'wali':
            routeWali($method, $rest);
            break;
        case 'drafts':
            routeDrafts($method, $rest);
            break;
        case 'admin':
            routeAdmin($method, $rest);
            break;
        case 'analytics':
            routeAnalytics($method, $rest);
            break;
        case 'contact':
            routeContact($method, $rest);
            break;
        case 'config':
            // Public UI config for mobile apps (API-driven labels).
            if ($method === 'GET' && ($rest[0] ?? '') === 'ui') {
                handleUiConfig();
                break;
            }
            json(['error' => 'Not found'], 404);
            break;
        case 'ai':
            routeAI($method, $rest);
            break;
        case 'blog-ssr':
            // Server-side rendered blog post HTML — see routes/blog-ssr.php.
            // The public URL is /blog/:slug (rewritten in .htaccess).
            if ($method === 'GET' && isset($rest[0]) && preg_match('/^[a-z0-9-]+$/', $rest[0])) {
                blogSsr($rest[0]);
                break;
            }
            json(['error' => 'Not found'], 404);
            break;
        case 'sitemap.xml':
            // Dynamic sitemap — no auth, cacheable. Served at /api/sitemap.xml.
            sitemapXml();
            break;
        case 'llms.txt':
            // Dynamic llms.txt — no auth, cacheable. Served at /api/llms.txt.
            // The static /llms.txt is served directly; this is the live fallback.
            llmsTxt();
            break;
        default:
            json(['error' => 'Not found'], 404);
    }
} catch (Throwable $e) {
    // Never leak internals; carry the request id for correlation (Node parity).
    error_log("[api] req=$requestId " . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    json(['error' => 'Internal server error', 'requestId' => $requestId], 500);
}
