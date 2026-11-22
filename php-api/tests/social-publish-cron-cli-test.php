<?php
// Test for the server-local cPanel cron trigger (2026-11-22): the
// social publish cron must run under PHP CLI with NO key (the SAPI
// check is the credential — only server access can invoke it), while
// HTTP invocation keeps requiring the SEEDER_CRON_KEY header. This is
// what frees publishing from GitHub's scheduler (a */5 workflow fired
// ~3 times in 19h) and from the web server's ~120s request wall.
//
// Same pattern as the other social tests: (a) CONTRACT strings pinning
// the auth gate's shape in the cron source, and (b) one BEHAVIOURAL
// run of the real script under CLI with the DB pointed at a dead port
// — passing the gate and failing later at the DB proves the gate let
// the CLI caller through; the old code stopped at the gate instead.
//
// Run: php tests/social-publish-cron-cli-test.php
declare(strict_types=1);

$failures = 0;
function check(string $label, bool $cond): void
{
    global $failures;
    echo ($cond ? 'PASS' : 'FAIL') . '  ' . $label . "\n";
    if (!$cond) $failures++;
}

$root = __DIR__ . '/..';
$cron = (string)file_get_contents($root . '/social-publish-cron.php');

// --- Contract: the gate's shape -------------------------------------------
check('cron detects the CLI SAPI', str_contains($cron, "php_sapi_name() === 'cli'"));
$ifPos = strpos($cron, 'if (!$isCli) {');
$keyPos = strpos($cron, "getenv('SEEDER_CRON_KEY')");
check('key check is inside the non-CLI branch',
    $ifPos !== false && $keyPos !== false && $ifPos < $keyPos);
check('HTTP path still compares the header key with hash_equals',
    str_contains($cron, "hash_equals(\$expected, (string)\$provided)"));
check('HTTP path still reads the X-Seeder-Cron-Key header server var',
    str_contains($cron, "\$_SERVER['HTTP_X_SEEDER_CRON_KEY']"));
$gatePos = strpos($cron, 'hash_equals($expected');
$workPos = strpos($cron, 'socialPublishPost(');
check('auth gate runs before any publish work',
    $gatePos !== false && $workPos !== false && $gatePos < $workPos);
check('CLI runs print a timestamped start line for the cron log',
    str_contains($cron, "social-publish-cron (cli)"));

// --- Behaviour: real script, CLI SAPI, no key, dead DB --------------------
// DB_PORT=1 makes db() fail fast AFTER the gate. SEEDER_CRON_KEY is
// explicitly emptied: under the old code this printed
// 'cron key not configured'; a missing/wrong header printed
// 'forbidden'. Either string here means the gate wrongly stopped CLI.
$cmd = 'SEEDER_CRON_KEY= DB_HOST=127.0.0.1 DB_PORT=1 DB_NAME=shiarishta DB_USER=root DB_PASSWORD= '
    . escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($root . '/social-publish-cron.php') . ' 2>/dev/null';
$out = (string)shell_exec($cmd);
check('CLI run is not stopped by the key gate',
    !str_contains($out, 'forbidden') && !str_contains($out, 'cron key not configured'));
check('CLI run got past the gate to the publish attempt (DB failure or ok)',
    str_contains($out, 'publish run failed') || str_contains($out, '"ok":true'));
check('CLI run printed its timestamped start line',
    preg_match('/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC\] social-publish-cron \(cli\)/m', $out) === 1);

echo $failures === 0 ? "ALL PASS\n" : "{$failures} FAILURE(S)\n";
exit($failures === 0 ? 0 : 1);
