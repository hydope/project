<?php
/**
 * Automatic-recommendation gender eligibility (Syed's order, 2026-11-11).
 *
 * Automatic recommendations — GET /api/profiles/first-connections,
 * GET /api/profiles/new-this-week, and the dashboard's "Top matches for
 * you" (which applies the same logic client-side) — show ONLY
 * opposite-gender profiles. Manual browsing is deliberately untouched: a
 * member who opens Profiles and picks a filter sees exactly what they
 * asked for; this file governs only what the site pushes at a member
 * unasked.
 *
 * FAIL CLOSED, because a wrong-gender suggestion is worse than none:
 *   - Both signals recorded (own gender + seeking_gender): the target is
 *     the seeking gender ONLY when it is also the opposite of the
 *     viewer's own gender. If the two conflict, there is no target and
 *     the member gets NO recommendations rather than a risky guess.
 *   - One signal recorded: it decides alone — seeking_gender, else the
 *     opposite of the viewer's own gender.
 *   - Neither recorded: no target, no recommendations. Never "show
 *     everyone".
 *   - A candidate is eligible only when their recorded gender is present
 *     and exactly equals the target (case/whitespace normalized). A
 *     blank or unknown gender is EXCLUDED: "opposite" cannot be
 *     confirmed, so the candidate is not recommended. They remain fully
 *     browsable through manual filters.
 *
 * Pure functions with no dependencies, so the behavioural probe
 * (tests/recommendation-gender-probe.php) can exercise the exact shipped
 * code without a database — the same pattern as lib/test_shell_patterns.php.
 */

declare(strict_types=1);

/** Normalize a stored gender value to 'male' | 'female' | '' (unknown). */
function recommendationGenderNorm($value): string
{
    $s = strtolower(trim((string)($value ?? '')));
    return ($s === 'male' || $s === 'female') ? $s : '';
}

/**
 * The gender an automatic recommendation may show this viewer, or null
 * when no recommendation is safe (conflicting signals, or none recorded).
 * $viewerRow is a profiles row (or the subset with gender/seeking_gender).
 */
function recommendationTargetGender(?array $viewerRow): ?string
{
    if ($viewerRow === null) return null;
    $own = recommendationGenderNorm($viewerRow['gender'] ?? null);
    $seeking = recommendationGenderNorm($viewerRow['seeking_gender'] ?? null);
    $opposite = $own === '' ? '' : ($own === 'male' ? 'female' : 'male');
    if ($own !== '' && $seeking !== '') {
        return $seeking === $opposite ? $seeking : null;
    }
    if ($seeking !== '') return $seeking;
    return $opposite === '' ? null : $opposite;
}

/**
 * Filter a candidate pool (profile rows) down to recommendation-eligible
 * rows for this viewer. Applied BEFORE any ranking and BEFORE any
 * limit/slice by the callers, so a card never fills its slots with
 * ineligible profiles and then trims.
 */
function recommendationEligibleRows(array $rows, ?array $viewerRow): array
{
    $target = recommendationTargetGender($viewerRow);
    if ($target === null) return [];
    return array_values(array_filter($rows, static function (array $r) use ($target): bool {
        return recommendationGenderNorm($r['gender'] ?? null) === $target;
    }));
}
