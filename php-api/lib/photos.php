<?php
// Shared photo storage resolution.
//
// Moved here from routes/profiles.php (2026-11-10, fix-everything leftover
// #16): the daily seeder and the seeded-photo repair migration need the SAME
// directory the API serves from. The seeder used to write to
// php-api/uploads/photos/ (inside the web root, deployed as
// public_html/api/uploads/) while photoServe() only serves files under this
// base — so ~95% of seeded public photos 404d, and the ones that "worked"
// were fetchable over plain HTTP with no tier check at all. One resolver,
// required by the API (index.php), the seeder, and migrate.php, so the three
// can never disagree again.
//
// Requires je() (lib/bootstrap.php) on the failure path — index.php loads
// bootstrap first, and the seeder requires bootstrap before this file.

/**
 * Resolve a WRITABLE photo directory that lives OUTSIDE the web root.
 *
 * WHY THIS IS NOT JUST `getenv('UPLOAD_DIR') ?: __DIR__.'/../uploads'`
 * ------------------------------------------------------------------
 * The old one-liner silently swallowed mkdir failure with `@`, so a bad
 * UPLOAD_DIR surfaced much later as an opaque 500 from photoUpload(). That is
 * exactly what happened in production: deploy.yml hardcoded
 * UPLOAD_DIR=/home/shiarishta/uploads, but the cPanel account is a different
 * username, so /home/shiarishta could not be created and every photo upload
 * died with "Internal server error".
 *
 * Two further traps this guards against:
 *   1. The repo-local fallback (__DIR__.'/../uploads') becomes
 *      public_html/api/uploads once deployed — INSIDE the web root. Member
 *      photos would then be fetchable by direct URL, bypassing every privacy
 *      check in photoServe(). We only accept it when the app is NOT running
 *      from a public_html directory.
 *   2. Result is cached per-request so photoUpload() and photoServe() can never
 *      resolve to two different directories and strand a file.
 */
function photoBaseDir(): string
{
    static $resolved = null;
    if ($resolved !== null) {
        return $resolved;
    }

    $candidates = [];

    $configured = trim((string)(getenv('UPLOAD_DIR') ?: ''));
    if ($configured !== '') {
        $candidates[] = $configured;
    }

    // cPanel/Cpanel sets HOME to the account home (/home/<user>), which is
    // always writable by the PHP process and always above public_html.
    $home = trim((string)(getenv('HOME') ?: ''));
    if ($home !== '') {
        $candidates[] = $home . '/uploads';
    }

    // Dev-only fallback: acceptable solely when we are not under public_html.
    $appRoot = dirname(__DIR__);
    if (strpos(str_replace('\\', '/', $appRoot), 'public_html') === false) {
        $candidates[] = $appRoot . '/uploads';
    }

    $tried = [];
    foreach ($candidates as $base) {
        $dir = rtrim($base, '/') . '/photos';
        $tried[] = $dir;
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        if (is_dir($dir) && is_writable($dir)) {
            $resolved = $dir;
            return $resolved;
        }
    }

    // Nothing was usable. Log the exact paths so the cause is diagnosable from
    // the PHP error log, and fail loudly instead of returning a broken path.
    error_log('[api] photo storage unavailable; tried: ' . implode(' | ', $tried));
    je('Photo storage is not available on this server. Please contact support.', 500);
}
