<?php
// Shia Rishta PHP API — front controller.
// Deploy: point the vhost document root here (or Apache Alias /api → this dir).

declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';
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
require __DIR__ . '/routes/contact.php';
require __DIR__ . '/routes/matchmaker.php';
require __DIR__ . '/routes/biodata.php';
require __DIR__ . '/routes/sitemap.php';
require __DIR__ . '/routes/social.php';
require __DIR__ . '/lib/ai.php';
require __DIR__ . '/routes/ai.php';

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
if ($segments === []) {
    json(['service' => 'shiarishta-php-api', 'status' => 'ok'], 200);
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
    // Write limiter for every other mutating resource.
    writeRateCheck();
} catch (Throwable $e) {
    error_log('[api] rate limiter error: ' . $e->getMessage());
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
        case 'contact':
            routeContact($method, $rest);
            break;
        case 'ai':
            routeAI($method, $rest);
            break;
        case 'sitemap.xml':
            // Dynamic sitemap — no auth, cacheable. Served at /api/sitemap.xml.
            sitemapXml();
            break;
        default:
            json(['error' => 'Not found'], 404);
    }
} catch (Throwable $e) {
    // Never leak internals; carry the request id for correlation (Node parity).
    error_log("[api] req=$requestId " . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    json(['error' => 'Internal server error', 'requestId' => $requestId], 500);
}
