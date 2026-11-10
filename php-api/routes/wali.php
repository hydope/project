<?php
// Wali companion links — parity with server/routes/wali.js.
// The wali needs no account: a revocable token URL shows one member's profile
// (never email, never contact details) plus a human read-only note.
declare(strict_types=1);

function routeWali(string $method, array $segments): void
{
    if ($method === 'GET' && ($segments[0] ?? null) === 'link') { listWaliLinks(); return; }
    // Restore must be checked BEFORE create: POST /link/:token/restore
    // also matches the bare "POST link" shape below.
    if ($method === 'POST' && ($segments[0] ?? null) === 'link' && ($segments[2] ?? null) === 'restore' && ($segments[1] ?? null) !== null) { restoreWaliLink((string)$segments[1]); return; }
    if ($method === 'POST' && ($segments[0] ?? null) === 'link') { createWaliLink(); return; }
    if ($method === 'DELETE' && ($segments[0] ?? null) === 'link' && ($segments[1] ?? null) !== null) { revokeWaliLink((string)$segments[1]); return; }
    if ($method === 'GET' && ($segments[0] ?? null) !== null && ($segments[1] ?? null) === null && $segments[0] !== 'link') {
        publicWaliView((string)$segments[0]);
        return;
    }

    json(['error' => 'Wali endpoint not found'], 404);
}

function createWaliLink(): void
{
    $user = requireAuthUser();
    // "Allow family members to view profile" (2026-11-09, P0 batch): when
    // the member turned it off, no new wali link can be created. The toggle
    // used to be localStorage-only while Settings claimed server enforcement.
    $pref = db()->prepare('SELECT allow_family_view FROM profiles WHERE user_id = ? LIMIT 1');
    $pref->execute([$user['uid']]);
    $prefRow = $pref->fetch();
    $familyViewOff = is_array($prefRow) && array_key_exists('allow_family_view', $prefRow) && empty($prefRow['allow_family_view']);
    if ($familyViewOff) {
        je('Family viewing is turned off in your privacy settings.', 403);
    }
    $token = randomBase64Url(24);
    db()->prepare('INSERT INTO wali_links (token, user_id) VALUES (?, ?)')->execute([$token, $user['uid']]);

    json(['ok' => true, 'url' => publicBase() . '/wali/' . $token], 201);
}

function listWaliLinks(): void
{
    $user = requireAuthUser();
    $stmt = db()->prepare('SELECT token, created_at, revoked, revoked_at FROM wali_links WHERE user_id = ? ORDER BY created_at DESC LIMIT 20');
    $stmt->execute([$user['uid']]);
    $rows = $stmt->fetchAll();

    $links = [];
    foreach ($rows as $row) {
        $revoked = !empty($row['revoked']);
        // A revoked link can be restored within 24h of revocation (2026-11-10,
        // external-audit fixes); after that it is gone for good.
        $revokedAt = $row['revoked_at'] ?? null;
        $restorable = $revoked && $revokedAt !== null
            && strtotime((string)$revokedAt) > time() - 24 * 3600;
        $links[] = [
            'token' => $row['token'],
            'url' => publicBase() . '/wali/' . $row['token'],
            'createdAt' => $row['created_at'],
            'revoked' => $revoked,
            'revokedAt' => $revokedAt,
            'restorable' => $restorable,
        ];
    }
    json(['links' => $links]);
}

function publicWaliView(string $token): void
{
    $stmt = db()->prepare(
        'SELECT u.id, p.display_name, p.age, p.city, p.country, p.sect, p.profession, p.bio, p.is_verified, p.verified_kind, p.allow_family_view, l.revoked
           FROM wali_links l
           JOIN users u ON u.id = l.user_id
           LEFT JOIN profiles p ON p.user_id = u.id
          WHERE l.token = ? LIMIT 1'
    );
    $stmt->execute([$token]);
    $row = $stmt->fetch();

    // A member who turned family viewing off revokes every wali link by
    // that same act — the link reads as invalid, same as a revoked one, so
    // the setting itself is never disclosed to the link holder.
    $familyViewOff = is_array($row) && array_key_exists('allow_family_view', $row) && empty($row['allow_family_view']);
    if (!$row || !empty($row['revoked']) || $familyViewOff) {
        je('This wali link is invalid or was revoked.', 404);
    }

    json([
        'readOnly' => true,
        'member' => [
            'displayName' => $row['display_name'],
            'age' => $row['age'] !== null ? (int)$row['age'] : null,
            'city' => $row['city'],
            'country' => $row['country'],
            'sect' => $row['sect'],
            'profession' => $row['profession'],
            'bio' => $row['bio'],
            'isVerified' => (bool)($row['is_verified'] ?? false),
            'verifiedKind' => (string)($row['verified_kind'] ?? 'none'),
        ],
    ]);
}

function revokeWaliLink(string $token): void
{
    $user = requireAuthUser();
    // revoked_at stamps the start of the 24h restore window (2026-11-10).
    db()->prepare('UPDATE wali_links SET revoked = 1, revoked_at = UTC_TIMESTAMP() WHERE token = ? AND user_id = ?')->execute([$token, $user['uid']]);
    json(['ok' => true]);
}

// POST /api/wali/link/:token/restore — member-only. A revoked link can be
// restored within 24 hours of revocation; after that it is gone for good
// and the member creates a fresh link instead. Only the member can revoke
// or restore — the person holding the link cannot.
function restoreWaliLink(string $token): void
{
    $user = requireAuthUser();
    $stmt = db()->prepare('SELECT revoked, revoked_at FROM wali_links WHERE token = ? AND user_id = ? LIMIT 1');
    $stmt->execute([$token, $user['uid']]);
    $row = $stmt->fetch();
    if (!$row) {
        je('Link not found.', 404);
    }
    if (empty($row['revoked'])) {
        je('This link is not revoked.', 400);
    }
    $revokedAt = $row['revoked_at'] ?? null;
    if ($revokedAt === null || strtotime((string)$revokedAt) <= time() - 24 * 3600) {
        je('This link was revoked more than 24 hours ago and cannot be restored. Create a new link instead.', 410);
    }
    db()->prepare('UPDATE wali_links SET revoked = 0, revoked_at = NULL WHERE token = ? AND user_id = ?')->execute([$token, $user['uid']]);
    json(['ok' => true]);
}
