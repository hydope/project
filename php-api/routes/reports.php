<?php
// Reports + block — exact parity with server/routes/reports.js.
// Mounted behind authRequired at the front controller.
declare(strict_types=1);

function routeReports(string $method, array $segments): void
{
    $action = $segments[0] ?? null;

    if ($method === 'POST' && $action === null) { createReport(); return; }
    if ($method === 'POST' && $action === 'block') { blockMember(); return; }
    if ($method === 'DELETE' && $action === 'block' && ($segments[1] ?? null) !== null) { unblockMember((string)$segments[1]); return; }
    // GET /api/reports/blocks — the members I blocked, for the Settings
    // "Blocked members" list. It used to 404 ("Report endpoint not found"),
    // so the page silently fell back to an empty list and unblocking from
    // Settings was impossible.
    if ($method === 'GET' && $action === 'blocks') { listBlocks(); return; }

    json(['error' => 'Report endpoint not found'], 404);
}

function createReport(): void
{
    $user = requireAuthUser();
    $payload = requestJson();
    $targetType = trim((string)($payload['targetType'] ?? $payload['target_type'] ?? ''));
    $targetId = trim((string)($payload['targetId'] ?? $payload['target_id'] ?? ''));
    $reason = mb_substr(trim((string)($payload['reason'] ?? '')), 0, 1000);

    if (!in_array($targetType, ['profile', 'post', 'reply', 'message', 'user'], true)) {
        je('Invalid report target.', 400);
    }
    if ($targetId === '') {
        je('Missing report target.', 400);
    }
    if ($reason === '') {
        je('Please describe the problem.', 400);
    }

    // One report per target per day — prevents spam without blocking real reports.
    $exists = db()->prepare("SELECT 1 FROM reports WHERE reporter_id = ? AND target_type = ? AND target_id = ? AND created_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY) LIMIT 1");
    $exists->execute([$user['uid'], $targetType, $targetId]);
    if ($exists->fetch()) {
        je('You already reported this. Our team is reviewing it.', 429);
    }

    $reportId = uuid();
    $stmt = db()->prepare('INSERT INTO reports (id, reporter_id, target_type, target_id, reason) VALUES (?, ?, ?, ?, ?)');
    $stmt->execute([$reportId, $user['uid'], $targetType, $targetId, $reason]);

    json(['ok' => true, 'id' => $reportId, 'created_at' => nowIso()], 201);
}

function blockMember(): void
{
    $user = requireAuthUser();
    $payload = requestJson();
    $blockedId = trim((string)($payload['userId'] ?? $payload['blockedId'] ?? ''));

    if ($blockedId === '' || $blockedId === (string)$user['uid']) {
        je('Invalid member.', 400);
    }

    // INSERT IGNORE == ON CONFLICT DO NOTHING on the (blocker, blocked) PK.
    $stmt = db()->prepare('INSERT IGNORE INTO blocks (blocker_id, blocked_id) VALUES (?, ?)');
    $stmt->execute([$user['uid'], $blockedId]);
    json(['ok' => true]);
}

function unblockMember(string $id): void
{
    $user = requireAuthUser();
    $stmt = db()->prepare('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?');
    $stmt->execute([$user['uid'], $id]);
    json(['ok' => true]);
}

function listBlocks(): void
{
    $user = requireAuthUser();
    $stmt = db()->prepare(
        'SELECT p.user_id AS id, p.display_name, p.photo_url
           FROM blocks b
           JOIN profiles p ON p.user_id = b.blocked_id
          WHERE b.blocker_id = ?
          ORDER BY p.display_name ASC'
    );
    $stmt->execute([$user['uid']]);
    $rows = $stmt->fetchAll();
    $out = [];
    foreach ($rows as $row) {
        $out[] = [
            'id' => (string)($row['id'] ?? ''),
            'displayName' => $row['display_name'] ?? 'Member',
            'photo' => !empty($row['photo_url']) ? '/api/profiles/' . (string)($row['id'] ?? '') . '/photo' : null,
        ];
    }
    json(['blocks' => $out]);
}
