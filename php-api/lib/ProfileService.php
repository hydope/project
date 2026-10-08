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
     * Normalize city/country: trim, collapse whitespace, title-case.
     * "hyderabad", "HYDERABAD", "  hyderabad " → "Hyderabad".
     * "Hyderabad, India" in city field → city="Hyderabad", country="India".
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

    /**
     * Check if a viewer can see a profile (privacy rules).
     */
    public static function canView(array $profileRow, ?array $viewer): bool
    {
        if (blockIsActive($profileRow)) return false;
        $isOwner = $viewer !== null && (string)$viewer['uid'] === (string)$profileRow['user_id'];
        if ($isOwner) return true;
        $visibility = (string)($profileRow['visibility'] ?? 'members');
        if ($visibility === 'private') return false;
        if ($visibility === 'public') return true;
        // 'members' — must be signed in.
        return $viewer !== null;
    }

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
