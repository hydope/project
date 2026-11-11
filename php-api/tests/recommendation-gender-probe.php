<?php
/**
 * Behavioural coverage for automatic-recommendation gender eligibility
 * (Syed's order, 2026-11-11: recommendations show ONLY opposite-gender
 * profiles; manual browse filters are untouched).
 *
 * The failure modes that matter are the permissive ones: the previous
 * seeking-only filter let unknown-gender candidates through, never
 * checked the viewer's own gender, and new-this-week had no eligibility
 * at all — which is how a woman was shown another woman with a Send
 * interest button. Every case below therefore asserts exclusion as
 * strictly as inclusion.
 */
declare(strict_types=1);

// The rule lives in its own dependency-free file, so this probe needs
// no database and no HTTP helpers — and it calls the production
// functions directly, never a copy.
require __DIR__ . '/../lib/recommendation_gender.php';

// Standalone: `php tests/recommendation-gender-probe.php` prints and
// exits non-zero on failure. Included: the parent suite (admin-routing-
// test.php) already owns check() and $pass/$fail, so this file
// contributes assertions to the parent's totals.
$probeStandalone = !function_exists('check');

if ($probeStandalone) {
    $pass = 0;
    $fail = 0;
    function check(string $label, bool $ok, string $detail = ''): void
    {
        global $pass, $fail;
        if ($ok) { $pass++; echo "PASS  $label\n"; }
        else { $fail++; echo "FAIL  $label" . ($detail !== '' ? " — $detail" : '') . "\n"; }
    }
}

// test-shell-probe.php (included earlier by the same parent suite)
// already defines probe_fail(); only define it when running standalone.
if (!function_exists('probe_fail')) {
    function probe_fail(string $label, string $detail = ''): void
    {
        global $probeStandalone;
        check($label, false, $detail);
        if ($probeStandalone) {
            echo "\n0 passed, 1 failed\n";
            exit(1);
        }
        throw new RuntimeException('probe boot failure');
    }
}

foreach (['recommendationTargetGender', 'recommendationEligibleRows', 'recommendationGenderNorm'] as $fn) {
    if (!function_exists($fn)) {
        probe_fail("$fn is not defined in lib/recommendation_gender.php");
    }
}

/** Genders of the eligible rows, in order — the assertion currency. */
function eligibleGenders(array $rows, ?array $viewer): array
{
    return array_map(
        static fn(array $r): string => recommendationGenderNorm($r['gender'] ?? null),
        recommendationEligibleRows($rows, $viewer)
    );
}

$pool = [
    ['gender' => 'male'],
    ['gender' => 'female'],
    ['gender' => 'Male'],      // stored case varies; normalized, still male
    ['gender' => ' female '],  // whitespace likewise
    ['gender' => ''],          // unknown — never recommendable
    ['gender' => null],        // unknown
    [],                        // column absent entirely
];

// ── Target resolution ────────────────────────────────────────────────────
check('woman seeking a man: target is male',
    recommendationTargetGender(['gender' => 'female', 'seeking_gender' => 'male']) === 'male');
check('man seeking a woman: target is female',
    recommendationTargetGender(['gender' => 'male', 'seeking_gender' => 'female']) === 'female');
check('conflict (man seeking a man): NO target — fail closed',
    recommendationTargetGender(['gender' => 'male', 'seeking_gender' => 'male']) === null);
check('conflict (woman seeking a woman): NO target — fail closed',
    recommendationTargetGender(['gender' => 'female', 'seeking_gender' => 'female']) === null);
check('only seeking recorded: it decides alone',
    recommendationTargetGender(['seeking_gender' => 'female']) === 'female');
check('only own gender recorded: opposite decides',
    recommendationTargetGender(['gender' => 'female']) === 'male');
check('neither recorded: NO target — never "show everyone"',
    recommendationTargetGender([]) === null);
check('no viewer row at all: NO target',
    recommendationTargetGender(null) === null);
check('unrecognized stored values count as unrecorded',
    recommendationTargetGender(['gender' => 'other', 'seeking_gender' => '']) === null);

// ── Candidate eligibility over a mixed pool ─────────────────────────────
check('woman seeking a man is offered ONLY men (unknowns excluded)',
    eligibleGenders($pool, ['gender' => 'female', 'seeking_gender' => 'male']) === ['male', 'male']);
check('man seeking a woman is offered ONLY women (unknowns excluded)',
    eligibleGenders($pool, ['gender' => 'male', 'seeking_gender' => 'female']) === ['female', 'female']);
check('conflicting viewer gets an EMPTY list, not the pool',
    recommendationEligibleRows($pool, ['gender' => 'male', 'seeking_gender' => 'male']) === []);
check('viewer with no signals gets an EMPTY list, not the pool',
    recommendationEligibleRows($pool, []) === []);
check('null viewer row gets an EMPTY list',
    recommendationEligibleRows($pool, null) === []);

if ($probeStandalone) {
    echo "\n$pass passed, $fail failed\n";
    exit($fail === 0 ? 0 : 1);
}
