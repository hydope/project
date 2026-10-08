<?php
// ─── Structured logging ──────────────────────────────────────────────────────
// Every log line is JSON: timestamp, level, request_id, message, context.
// In production these go to error_log (captured by the host); in development
// they also echo to stderr for `php -S` visibility.
//
// Usage:
//   logInfo('Profile viewed', ['profile_id' => $id, 'viewer' => $uid]);
//   logWarn('Rate limit near', ['ip' => $ip, 'count' => $n]);
//   logError('DB query failed', ['sql' => $sql, 'error' => $e->getMessage()]);
//
// Never log: passwords, tokens, JWTs, full request bodies with PII.

declare(strict_types=1);

function logLine(string $level, string $message, array $context = []): void
{
    static $requestId = null;
    if ($requestId === null) {
        $requestId = substr(bin2hex(random_bytes(6)), 0, 12);
    }
    // Strip known secrets from context defensively.
    foreach (['password', 'token', 'jwt', 'secret', 'apiKey', 'api_key'] as $k) {
        unset($context[$k]);
    }
    $line = json_encode([
        'ts' => gmdate('Y-m-d\TH:i:s\Z'),
        'level' => $level,
        'req' => $requestId,
        'msg' => $message,
        'ctx' => $context,
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    error_log('[shiarishta] ' . $line);
    // In dev, also surface to stderr so `php -S` shows it.
    if ((getenv('APP_ENV') ?: 'development') !== 'production') {
        fwrite(STDERR, '[shiarishta] ' . $line . PHP_EOL);
    }
}

function logDebug(string $message, array $context = []): void
{
    if ((getenv('APP_ENV') ?: 'development') === 'production') return;
    logLine('debug', $message, $context);
}

function logInfo(string $message, array $context = []): void
{
    logLine('info', $message, $context);
}

function logWarn(string $message, array $context = []): void
{
    logLine('warn', $message, $context);
}

function logError(string $message, array $context = []): void
{
    logLine('error', $message, $context);
}
