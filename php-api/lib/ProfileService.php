<?php
// ─── Profile service ─────────────────────────────────────────────────────────
// Business logic for profiles, extracted from routes/profiles.php.
// Routes handle HTTP (parse input, call service, format response).
// This class handles domain rules (validation, privacy, normalization).
//
// Pattern for future extractions:
//   PhotoService  ← photoUpload/photoServe/photoDelete
//   InterestService ← profileInterest/profileUninterest
//   NotificationService ← notifyUser/notificationsList

declare(strict_types=1);

class ProfileService
{
    /**
     * Canonical country names (2026-11-24 audit E-01a, Phase 4B).
     *
     * The stored country is free text, and the title-casing in
     * normalizeLocation() below actively manufactures variants — "USA"
     * becomes "Usa", "UAE" becomes "Uae" — so the same country ends up
     * stored three ways and exact-match filters miss rows. Keys are the
     * lowercase spellings members actually type; values are the canonical
     * forms the product already uses: the onboarding COUNTRIES list
     * (src/lib/onboardingData.js) spells them 'USA', 'United Kingdom',
     * 'UAE', 'Saudi Arabia', and the live data's majority forms agree
     * (audit sample: USA 20 vs Usa 3, UAE 6 vs Uae 2, United Kingdom 2
     * vs UK 1). Unknown countries pass through title-cased, unchanged —
     * this maps variants, it does not validate against a closed list.
     * Existing rows are NOT rewritten here; the backfill is a separate,
     * backup-gated step (E-01c).
     */
    private const COUNTRY_CANONICAL = [
        'usa' => 'USA', 'u.s.a.' => 'USA', 'us' => 'USA', 'u.s.' => 'USA',
        'united states' => 'USA', 'united states of america' => 'USA', 'america' => 'USA',
        'uae' => 'UAE', 'u.a.e.' => 'UAE', 'united arab emirates' => 'UAE', 'emirates' => 'UAE',
        'uk' => 'United Kingdom', 'u.k.' => 'United Kingdom', 'united kingdom' => 'United Kingdom',
        'england' => 'United Kingdom', 'great britain' => 'United Kingdom', 'britain' => 'United Kingdom',
        'ksa' => 'Saudi Arabia', 'saudi' => 'Saudi Arabia', 'kingdom of saudi arabia' => 'Saudi Arabia',
        'nz' => 'New Zealand',
        'korea' => 'South Korea',
        'holland' => 'Netherlands',
    ];

    /** Map a free-text country to its canonical form (null/'' pass through). */
    public static function canonicalCountry(?string $country): ?string
    {
        if ($country === null) return null;
        $v = trim((string)preg_replace('/\s+/', ' ', $country));
        if ($v === '') return null;
        return self::COUNTRY_CANONICAL[mb_strtolower($v, 'UTF-8')] ?? $v;
    }

    /**
     * Normalize city/country: trim, collapse whitespace, title-case.
     * "hyderabad", "HYDERABAD", "  hyderabad " → "Hyderabad".
     * "Hyderabad, India" in city field → city="Hyderabad", country="India".
     * Country then passes through canonicalCountry(), so "usa", "Usa" and
     * "United States" all store as "USA" (see E-01a note above). City gets
     * case/whitespace normalisation only — correcting misspellings
     * ("Bradfird") by fuzzy matching would silently rewrite real places.
     *
     * @param array<string,mixed> $data reference to the input array
     */
    public static function normalizeLocation(array &$data): void
    {
        foreach (['city', 'country'] as $key) {
            if (!isset($data[$key]) || !is_string($data[$key])) continue;
            $v = trim((string)preg_replace('/\s+/', ' ', $data[$key]));
            if ($key === 'city' && str_contains($v, ',')) {
                $parts = array_map('trim', explode(',', $v, 2));
                $v = $parts[0];
                if (!empty($parts[1]) && empty($data['country'])) {
                    $data['country'] = $parts[1];
                }
            }
            $v = mb_convert_case($v, MB_CASE_TITLE, 'UTF-8');
            if ($key === 'country') {
                $v = self::canonicalCountry($v) ?? '';
            }
            $data[$key] = $v === '' ? null : $v;
        }
    }

    /**
     * Build the location slug for SEO URLs: "New York" → "new-york".
     */
    public static function slugify(string $name): string
    {
        $slug = strtolower((string)preg_replace('/[^a-z0-9]+/i', '-', $name));
        return trim($slug, '-');
    }

    /**
     * Validate profile update input. Returns ValidationResult.
     */
    public static function validateUpdate(array $input): ValidationResult
    {
        return validate($input, [
            'displayName'  => 'max:60',
            'age'          => 'int|min:18|max:100',
            'city'         => 'max:120',
            'country'      => 'max:120',
            'profession'   => 'max:120',
            'bio'          => 'max:2000',
            'heightCm'     => 'int|min:100|max:250',
        ]);
    }

    // canView() was removed 2026-11-24 (Phase 4): it had no caller anywhere
    // in the codebase and its rule ("members" profiles require sign-in)
    // contradicted the live behaviour, where visibleProfile() in lib/db.php
    // is the single source of truth — profiles are browsable by visitors
    // and only `private` hides one (owner decision, 2026-11-24). Keeping a
    // second, contradictory privacy rule in the tree invited a future
    // caller to enforce the wrong one.

    /**
     * Determine photo access tier for a viewer.
     * Returns: 'open' | 'locked' | 'hidden'
     */
    public static function photoAccess(array $profileRow, ?array $viewer): string
    {
        $isOwner = $viewer !== null && (string)$viewer['uid'] === (string)$profileRow['user_id'];
        if ($isOwner) return 'open';
        $tier = (string)($profileRow['photos_visibility'] ?? 'members');
        if ($tier === 'private') return 'hidden';
        if ($tier === 'public') return 'open';
        // members/request/match — locked for anonymous, open for signed-in
        // (the photo endpoint enforces mutual-interest for match tier).
        return $viewer === null ? 'locked' : 'open';
    }
}
