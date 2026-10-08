<?php
// ─── Compatibility API ───────────────────────────────────────────────────────
// GET /api/compatibility/:profileId
// Server-side match scoring. The viewer is the authenticated user; the
// candidate is the profile ID in the path. Returns the same shape as the
// old client-side computeCompatibility() so the frontend needs no changes
// beyond switching the data source.

declare(strict_types=1);

require_once __DIR__ . '/../lib/compatibility.php';

function routeCompatibility(string $method, array $segments): void
{
    if ($method !== 'GET') {
        je('Method not allowed.', 405);
    }
    $profileId = $segments[0] ?? null;
    if (!$profileId) {
        je('Profile ID is required.', 400);
    }

    $viewer = currentUser();
    if (!$viewer) {
        je('Sign in to see compatibility.', 401);
    }

    // Viewer profile — from the database, not localStorage.
    $meStmt = db()->prepare('SELECT * FROM profiles WHERE user_id = ? LIMIT 1');
    $meStmt->execute([$viewer['uid']]);
    $me = $meStmt->fetch(PDO::FETCH_ASSOC);
    if (!$me || empty($me['sect'])) {
        json(['score' => null, 'reason' => 'Complete your profile (sect) to see compatibility.']);
    }

    // Candidate profile.
    $cStmt = db()->prepare('SELECT * FROM profiles WHERE user_id = ? AND is_blocked = 0 LIMIT 1');
    $cStmt->execute([$profileId]);
    $candidate = $cStmt->fetch(PDO::FETCH_ASSOC);
    if (!$candidate) {
        je('Profile not found.', 404);
    }

    $score = CompatibilityService::score($candidate, $me);
    json(['score' => $score]);
}
