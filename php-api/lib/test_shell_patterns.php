<?php
/**
 * Test-shell predicates, split out of lib/db.php so they can be loaded on their
 * own.
 *
 * lib/db.php cannot simply be required by a test: it declares requestJson(),
 * sanitizeText() and friends, which every test harness stubs with its own
 * versions, so including it alongside a harness is a fatal redeclare. Extracting
 * the pure functions means the matching rules — the part with the actual bug
 * potential — are directly testable with no database and no stub collision.
 *
 * lib/db.php requires THIS file, so the production code and the tested code are
 * the same bytes. That is the whole point: a test that reimplements the rule
 * proves nothing about the rule that ships.
 */
declare(strict_types=1);

if (!function_exists('testShellPatterns')) {
    /**
     * The pattern list, verbatim: observed in production plus what the E2E suite
     * is known to generate. Kept in one function so the SQL form and the PHP form
     * cannot drift apart.
     *
     * @return array<int,string>
     */
    function testShellPatterns(): array
    {
        return [
            'TEST PROFILE%', 'Desi Test%', 'Life Test%', 'Data-%',
            'QA Test%', 'QATest%', 'qatest%', 'QA Tester%', 'QA Verify%',
            'E2E QA%', 'E2E Test%', 'e2e%',
            'Sec Test%', 'Probe L1-%',
            // The probe series appears under several shapes: "Probe L1-1" and
            // "Probe L1-2" as display names, "probe." as an email local-part, and
            // "probe-l2" / "probe-2" as display names or professions. One narrow
            // pattern let the shorter variants through and they reached the
            // public directory as real-looking names.
            'probe.%', 'probe-%',
            // Bare 'TEST%' is deliberately NOT here. It reads as harmless but
            // swallows genuine names that merely begin with "test" — Testament,
            // Testa, T-esther — and silently hiding a real member from the
            // directory is far worse than leaving one test row visible. The E2E
            // suite always emits a fuller label ("TEST PROFILE FOR QA", "QA Test
            // 07"), all of which are matched above.
        ];
    }
}

if (!function_exists('testShellFilterSql')) {
    /**
     * SQL form of the same rule, for the purge script and admin health counts.
     *
     * @return array{0:string,1:array} SQL fragment and its bound parameters
     */
    function testShellFilterSql(string $alias = 'p'): array
    {
        $clauses = [];
        $params = [];
        foreach (testShellPatterns() as $pat) {
            $clauses[] = "{$alias}.display_name LIKE ?";
            $params[] = $pat;
        }
        // The same debris seen from another column.
        $clauses[] = "{$alias}.city LIKE ?";
        $params[] = 'TEST PROFILE%';
        $clauses[] = "{$alias}.city LIKE ?";
        $params[] = 'DATA-% City';
        $clauses[] = "{$alias}.profession LIKE ?";
        $params[] = 'probe-%';

        return ['(' . implode(' OR ', $clauses) . ')', $params];
    }
}

if (!function_exists('isTestShellRow')) {
    /**
     * Does this profile row look like E2E debris?
     *
     * Shared by the browse listing, the public stats endpoint and the admin
     * health banner. All three must agree, or the site reports one member count
     * to visitors and a different one to operators.
     *
     * Patterns are anchored at the START of the value, so a genuine member
     * called "Testament", "Probes" or "Qasim" is never caught.
     */
    function isTestShellRow(array $row): bool
    {
        $patterns = testShellPatterns();
        $name = trim((string)($row['display_name'] ?? ''));
        if ($name !== '') {
            foreach ($patterns as $pat) {
                if (stripos($name, rtrim($pat, '%')) === 0) return true;
            }
        }
        $city = trim((string)($row['city'] ?? ''));
        if ($city !== '' && (stripos($city, 'TEST PROFILE') === 0 || stripos($city, 'DATA-') === 0)) {
            return true;
        }
        $job = trim((string)($row['profession'] ?? ''));
        return $job !== '' && stripos($job, 'probe-') === 0;
    }
}
