<?php
/**
 * Behavioural coverage for the test-shell predicate.
 *
 * Uses the EXACT display names pulled from the live database during the audit,
 * plus the false-positive cases that a naive LIKE filter would catch: a real
 * member could legitimately be called "Testament", "Probes" or "Qasim".
 *
 * A structural "does the function exist" check proves nothing — the failure mode
 * that matters is a pattern that over-matches and hides a genuine member.
 */
declare(strict_types=1);

// The predicates live in lib/db.php, which declares db() behind a
// function_exists guard — so this probe can supply its own stub and include it
// with no database and no HTTP helpers.
if (!function_exists('db')) {
    function db(): PDO { throw new RuntimeException('no db in this probe'); }
}
require __DIR__ . '/../lib/db.php';

foreach (['testShellPatterns', 'isTestShellRow', 'testShellFilterSql'] as $fn) {
    if (!function_exists($fn)) {
        echo "FAIL  $fn is not defined in lib/db.php\n";
        echo "\n0 passed, 1 failed\n";
        exit(1);
    }
}

$pass = 0;
$fail = 0;
function check(string $label, bool $ok, string $detail = ''): void
{
    global $pass, $fail;
    if ($ok) { $pass++; echo "PASS  $label\n"; }
    else { $fail++; echo "FAIL  $label" . ($detail !== '' ? " — $detail" : '') . "\n"; }
}

/**
 * The production predicate, used directly. No reimplementation here: a copy in
 * the test would pass while the shipped function broke, which is the whole class
 * of bug these tests exist to catch.
 */
function looksLikeShell(array $row): bool
{
    return isTestShellRow($row);
}

// The SQL builder must expose exactly the patterns the row predicate uses,
// otherwise a purge and a browse would disagree about who is debris.
$patterns = testShellPatterns();
[, $sqlParams] = testShellFilterSql('p');
check(
    'the SQL filter and the row predicate share one pattern list',
    array_slice($sqlParams, 0, count($patterns)) === $patterns,
    'testShellFilterSql() and isTestShellRow() use different patterns, so purge and browse disagree'
);

// Every shell name observed in production.
$mustHide = [
    'TEST PROFILE FOR QA — please ignore.',
    'Probe L1-1', 'Probe L1-2',
    'Desi Test 01', 'Life Test 01', 'Life Test 02',
    'Sec Test 03', 'Sec Test 04', 'Sec Test 05',
    'QA Verify A', 'QA Verify B', 'QA Verify C', 'QA Verify 99',
    'QA Tester 51', 'QA Tester 52', 'QA Tester 53', 'QA Tester 54',
    'qatest13', 'qatest14', 'qatest15', 'qatest16', 'QATest Alpha',
    'QA Test 03', 'QA Test 04', 'QA Test 05A', 'QA Test 05B', 'QA Test 06',
    'QA Test 07', 'QA Test 08', 'QA Test 09', 'QA Test 10', 'QA Test 11',
    'QA Test 12', 'QA Test 17', 'QA Test 18', 'QA Test 19', 'QA Test 21',
    'QA Test 22', 'QA Test 23', 'QA Test 24', 'QA Test 26', 'QA Test 100',
];

$leaked = [];
foreach ($mustHide as $name) {
    if (!looksLikeShell(['display_name' => $name])) $leaked[] = $name;
}
check(
    'every observed test shell is hidden',
    $leaked === [],
    'still visible: ' . implode(', ', array_slice($leaked, 0, 5))
);

// Genuine members must survive. The last four are the false-positive traps.
$mustKeep = [
    'Zoya Kazmi', 'Khadija Noor', 'Sakina Rizvi', 'Maryam Siddiqui',
    'Zainab Husayn', 'Fatima Zahra Baig', 'Konain Mazhar', 'Fatima Raza',
    'Zainab Naqvi', 'Syed', 'Ali', 'Maryam', 'Fatima',
    // Traps: an over-broad filter would swallow these.
    'Testament Grace', 'Probes Ahson', 'Qasim Ali', 'Testa',
];
$falsely = [];
foreach ($mustKeep as $name) {
    if (looksLikeShell(['display_name' => $name])) $falsely[] = $name;
}
check(
    'no genuine member is hidden, including false-positive traps',
    $falsely === [],
    'wrongly hidden: ' . implode(', ', $falsely)
);

// Column-level debris.
check(
    'a TEST PROFILE city is treated as a shell',
    looksLikeShell(['display_name' => 'A Person', 'city' => 'TEST PROFILE 01']),
    'a shell with a human name slipped through'
);
check(
    'a probe- profession is treated as a shell',
    looksLikeShell(['display_name' => 'A Person', 'profession' => 'probe-2']),
    'a probe row slipped through'
);
check(
    'an ordinary city is not treated as a shell',
    !looksLikeShell(['display_name' => 'A Person', 'city' => 'Karachi']),
    'a real city matched the shell filter'
);

echo "\n$pass passed, $fail failed\n";
exit($fail === 0 ? 0 : 1);
