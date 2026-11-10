<?php
// ─── Compatibility scoring service ───────────────────────────────────────────
// Server-side match scoring. Previously computed in the browser
// (src/lib/compatibility.js), where any user could open DevTools and inflate
// their own score. The algorithm is identical — ported line by line — but now
// the viewer profile comes from the authenticated session, not localStorage.
//
// GET /api/compatibility/:profileId → { overall, breakdown, reasons, topReason }
// Returns null (404) when the viewer has no sect — same honesty contract.

declare(strict_types=1);

class CompatibilityService
{
    private const RELIGIOSITY_SCALE = [
        'very-practicing' => 4, 'practicing' => 3, 'moderately' => 2,
        'learning' => 1, 'cultural' => 0,
    ];
    private const RELIGIOSITY_BY_LABEL = [
        'very practicing' => 4, 'practicing' => 3, 'moderately practicing' => 2,
        'reconnecting' => 1, 'culturally connected' => 0,
    ];

    private static function religiosityScore($value): ?int
    {
        if (!$value) return null;
        if (isset(self::RELIGIOSITY_SCALE[$value])) return self::RELIGIOSITY_SCALE[$value];
        return self::RELIGIOSITY_BY_LABEL[strtolower((string)$value)] ?? null;
    }

    private static function timelineBucket($text): ?int
    {
        if (!$text) return null;
        $t = strtolower((string)$text);
        // Stored timeline codes (2026-11-10): the wizard saves 'now'/'6m'/
        // '1y'/'2y'/'exploring', not the labels the word buckets below were
        // written for. 'now' and 'exploring' match words already; '6m',
        // '1y' and '2y' never did, so every coded timeline scored a flat 60.
        // The JS side carries the same map — the two must stay identical or
        // the card badge and the server ranking disagree.
        $codes = ['now' => 0, '6m' => 1, '1y' => 2, '2y' => 2, 'exploring' => 3];
        if (isset($codes[$t])) return $codes[$t];
        $buckets = [
            [['immediate', 'now'], 0],
            [['6 month', '6-12', '6–12', 'near term'], 1],
            [['1-2', '1–2', '12 month', 'year'], 2],
            [['long-term', 'exploring', 'open'], 3],
        ];
        foreach ($buckets as [$words, $bucket]) {
            foreach ($words as $w) {
                if (str_contains($t, $w)) return $bucket;
            }
        }
        return null;
    }

    private static function languageOverlap($mine, $theirs): float
    {
        $toList = fn($v) => is_array($v)
            ? array_filter($v, fn($x) => is_string($x) && trim($x) !== '')
            : array_filter(array_map('trim', explode(',', (string)($v ?? ''))));
        $myLangs = array_map('strtolower', $toList($mine));
        $theirLangs = array_map('strtolower', $toList($theirs));
        if (!$myLangs) return 0.5;
        $shared = count(array_intersect($myLangs, $theirLangs));
        // Denominator is the SMALLER side (2026-11-10 parity fix): the JS
        // divides by min(mine, theirs) — a member who speaks 2 languages
        // and shares both with a 5-language member is a full overlap, not
        // 2/5. The old PHP divided by mine alone and disagreed with the card.
        return $shared / max(min(count($myLangs), count($theirLangs)), 1);
    }

    /**
     * @param array<string,mixed> $profile candidate profile row
     * @param array<string,mixed> $me viewer profile row
     * @return array<string,mixed>|null
     */
    public static function score(array $profile, array $me): ?array
    {
        if (!$profile || !$me || empty($me['sect'])) return null;

        $seeking = $me['seekingGender'] ?? $me['seeking_gender'] ?? null;
        $genderMismatch = $seeking && !empty($profile['gender']) && $seeking !== $profile['gender'];

        // ── Faith ──
        $faith = 62;
        if (!empty($me['sect']) && !empty($profile['sect'])) {
            $faith = $me['sect'] === $profile['sect'] ? 95 : 55;
        }
        $myR = self::religiosityScore($me['religiosity'] ?? null);
        $theirR = self::religiosityScore($profile['religiosity'] ?? null);
        if ($myR !== null && $theirR !== null) {
            $gap = abs($myR - $theirR);
            $faith = (int)round($faith * 0.6 + (1 - $gap / 4) * 100 * 0.4);
        }
        // Marja' is deliberately NOT scored here (2026-11-10): it is
        // owner-only in every payload, so the client-side scorer never sees
        // a candidate's marja and never awards the +4. Awarding it here
        // would make the server ranking disagree with the % on the card by
        // up to ~1.4 points — the exact trade-off Syed accepted when he
        // chose to keep marja fully hidden.

        // ── Values ──
        $langRatio = self::languageOverlap($me['languages'] ?? null, $profile['languages'] ?? null);
        $values = 45 + (int)round($langRatio * 40);
        if (($me['familyInvolvement'] ?? $me['family_involvement'] ?? null) === 'wali-required'
            || preg_match('/wali|family guided|family-first/i', (string)($profile['halalLifestyle'] ?? ''))) {
            $values += 8;
        }
        if (!empty($me['childrenPlans'] ?? $me['children_plans'] ?? null)
            && !empty($profile['children'])
            && preg_match('/no children/i', (string)$profile['children'])) {
            $values += 4;
        }
        $values = max(20, min(100, $values));

        // ── Lifestyle ──
        $lifestyle = 58;
        if ($myR !== null && $theirR !== null) {
            $lifestyle = (int)round(90 - abs($myR - $theirR) * 12);
        }
        if (!empty($me['diet']) && preg_match('/halal|zabiha/i', (string)$me['diet'])) $lifestyle += 3;
        if (($profile['prayer'] ?? null) === 'Daily prayers') $lifestyle += 4;
        $lifestyle = max(25, min(100, $lifestyle));

        // ── Timeline ──
        // The candidate's timeline lives in the `timeline` column; the
        // client reads `intentions` (a mock-data field real profiles never
        // carry) and falls back to `timeline`. Both sides read the same
        // fallback so the numbers agree.
        $theirIntentions = $profile['intentions'] ?? $profile['timeline'] ?? null;
        $myT = self::timelineBucket($me['timeline'] ?? null);
        $theirT = self::timelineBucket($theirIntentions);
        $timeline = 60;
        if ($myT !== null && $theirT !== null) {
            $timeline = (int)round(96 - abs($myT - $theirT) * 22);
        }
        if (preg_match('/immediate|now|ready/i', (string)$theirIntentions)) $timeline += 2;
        $timeline = max(25, min(100, $timeline));

        $overall = (int)round($faith * 0.34 + $values * 0.24 + $lifestyle * 0.22 + $timeline * 0.20
            + (!empty($profile['is_verified']) ? 2 : 0));

        $reasons = [];
        if (!empty($me['sect']) && !empty($profile['sect']) && $me['sect'] === $profile['sect']) {
            $reasons[] = "Same sect — {$profile['sect']}";
        }
        if ($myR !== null && $theirR !== null && abs($myR - $theirR) <= 1) {
            $reasons[] = 'Closely matched religiosity';
        }
        if (!empty($profile['is_verified'])) {
            $reasons[] = (($profile['verified_kind'] ?? '') === 'id_document')
                ? 'ID-verified member'
                : 'Photo-verified member';
        }
        if ($timeline >= 80) $reasons[] = 'Aligned nikah timelines';

        $finalOverall = $genderMismatch ? 5 : max(35, min(99, $overall));

        return [
            'overall' => $finalOverall,
            'breakdown' => ['values' => $values, 'lifestyle' => $lifestyle, 'faith' => $faith, 'timeline' => $timeline],
            'reasons' => $reasons ?: ['Strong overall alignment across core dimensions'],
            'topReason' => $reasons[0] ?? 'Strong overall alignment',
        ];
    }
}
