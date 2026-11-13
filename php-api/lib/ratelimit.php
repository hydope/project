<?php
// Fixed-window rate limiter — file-backed so counts survive PHP's per-request
// process model on shared hosting (in-memory Maps do not exist across requests).
// Same ceilings as server/index.js: login 5/15min per ip+email, auth 30/15min
// per ip, forgot 5/h, reset 10/h, resend 5/h, writes 30/min per ip.

function rateLimitDir(): string {
    $dir = __DIR__ . '/../storage/rate';
    if (!is_dir($dir)) { @mkdir($dir, 0775, true); }
    return $dir;
}

// Returns true when allowed; echoes 429 + Retry-After and exits when not.
function rateCheck(string $bucket, string $key, int $max, int $windowSec, string $message): void {
    $now = time();
    $file = rateLimitDir() . '/' . sha1($bucket . ':' . $key) . '.json';
    $fp = @fopen($file, 'c+');
    if ($fp === false) {
        return; // storage unavailable — never brick the API over telemetry
    }
    try {
        flock($fp, LOCK_EX);
        $raw = stream_get_contents($fp);
        $state = $raw ? json_decode($raw, true) : null;
        if (!is_array($state) || ($state['start'] ?? 0) + $windowSec <= $now) {
            $state = ['start' => $now, 'count' => 0];
        }
        $state['count'] = (int)$state['count'] + 1;
        rewind($fp); ftruncate($fp, 0);
        fwrite($fp, json_encode($state));
        fflush($fp);

        if ($state['count'] > $max) {
            $retryAfter = max(1, ($state['start'] + $windowSec) - $now);
            flock($fp, LOCK_UN); fclose($fp);
            header('Retry-After: ' . $retryAfter);
            json(['error' => $message], 429);
        }
        // Occasional sweep so one process cannot leak files forever.
        if (random_int(1, 50) === 1) {
            foreach (glob(rateLimitDir() . '/*.json') ?: [] as $f) {
                $s = @json_decode((string)@file_get_contents($f), true);
                if (is_array($s) && ($s['start'] ?? 0) + $windowSec <= $now) { @unlink($f); }
            }
        }
    } finally {
        @flock($fp, LOCK_UN);
        @fclose($fp);
    }
}

// Write limiter: non-GET only, bypassed by E2E_TEST_MODE=1 from localhost
// (identical to the Node writePerIp).
function writeRateCheck(): void {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (in_array($method, ['GET', 'HEAD', 'OPTIONS'], true)) return;
    if (getenv('E2E_TEST_MODE') === '1' && isLocalIp(cip())) return;
    rateCheck('write', cip(), 30, 60, 'Slow down a little — the community will still be here in a minute.');
}

// Per-user rate limit (2026-11-10, external-audit fixes): cip() then
// returned the shared Cloudflare edge address in production, so the
// IP-based writeRateCheck above was effectively ONE global bucket — one
// spammer's burst 429'd every member. cip() resolves the real client IP
// via CF-Connecting-IP since 2026-11-13, but these limits still count the
// authenticated user's own rows: per-user counting stays the fairer
// semantic for member actions (a burst limits only the spammer).
// $table/$userCol are hardcoded at the call sites, never user input.
function perUserRateCheck(string $uid, string $table, string $userCol, int $windowSec, int $max, string $message): void
{
    try {
        $stmt = db()->prepare("SELECT COUNT(*) AS n FROM {$table} WHERE {$userCol} = ? AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? SECOND)");
        $stmt->execute([$uid, $windowSec]);
        $n = (int)($stmt->fetch()['n'] ?? 0);
        if ($n >= $max) {
            je($message, 429);
        }
    } catch (Throwable $e) {
        // A missing table/column must not brick the action — the global
        // IP-based write limiter still applies.
        error_log('[api] per-user rate check failed: ' . substr($e->getMessage(), 0, 120));
    }
}
