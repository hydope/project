<?php
// Wali companion links — parity with server/routes/wali.js.
// The wali needs no account: a revocable token URL shows one member's profile
// (never email, never contact details) plus a human read-only note.
declare(strict_types=1);

function routeWali(string $method, array $segments): void
{
    if ($method === 'GET' && ($segments[0] ?? null) === 'link') { listWaliLinks(); return; }
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
    $token = randomBase64Url(24);
    db()->prepare('INSERT INTO wali_links (token, user_id) VALUES (?, ?)')->execute([$token, $user['uid']]);

    json(['ok' => true, 'url' => publicBase() . '/wali/' . $token], 201);
}

function listWaliLinks(): void
{
    $user = requireAuthUser();
    $stmt = db()->prepare('SELECT token, created_at, revoked FROM wali_links WHERE user_id = ? ORDER BY created_at DESC LIMIT 20');
    $stmt->execute([$user['uid']]);
    $rows = $stmt->fetchAll();

    $links = [];
    foreach ($rows as $row) {
        $links[] = [
            'token' => $row['token'],
            'url' => publicBase() . '/wali/' . $row['token'],
            'createdAt' => $row['created_at'],
            'revoked' => !empty($row['revoked']),
        ];
    }
    json(['links' => $links]);
}

function publicWaliView(string $token): void
{
    $stmt = db()->prepare(
        'SELECT u.id, p.display_name, p.age, p.city, p.country, p.sect, p.profession, p.bio, p.is_verified, p.verified_kind, l.revoked
           FROM wali_links l
           JOIN users u ON u.id = l.user_id
           LEFT JOIN profiles p ON p.user_id = u.id
          WHERE l.token = ? LIMIT 1'
    );
    $stmt->execute([$token]);
    $row = $stmt->fetch();

    if (!$row || !empty($row['revoked'])) {
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
    db()->prepare('UPDATE wali_links SET revoked = 1 WHERE token = ? AND user_id = ?')->execute([$token, $user['uid']]);
    json(['ok' => true]);
}
