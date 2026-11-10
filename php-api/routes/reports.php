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
    // GET /api/reports/mine — my own reports with their status, for the
    // Settings "My reports" list (2026-11-10, external-audit fixes: a
    // reporter used to hear nothing after filing).
    if ($method === 'GET' && $action === 'mine') { listMyReports(); return; }
    // POST /api/reports/:id/appeal — appeal a closed report; reopens it
    // for review with the reporter's reason attached.
    if ($method === 'POST' && $action !== null && ($segments[1] ?? null) === 'appeal') { appealReport((string)$action); return; }

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

// GET /api/reports/mine — the reporter's own reports, newest first, with
// status and appeal state. The target's identity is NOT resolved here:
// the reporter already knows what they reported, and resolving it would
// leak a profile that may since have been hidden or deleted.
function listMyReports(): void
{
    $user = requireAuthUser();
    $stmt = db()->prepare(
        'SELECT id, target_type, target_id, reason, status, created_at, actioned_at, appeal_reason, appeal_at
           FROM reports WHERE reporter_id = ? ORDER BY created_at DESC LIMIT 100'
    );
    $stmt->execute([$user['uid']]);
    $out = [];
    foreach ($stmt->fetchAll() as $row) {
        $out[] = [
            'id' => $row['id'],
            'targetType' => $row['target_type'],
            'targetId' => $row['target_id'],
            'reason' => $row['reason'],
            'status' => $row['status'],
            'createdAt' => $row['created_at'],
            'actionedAt' => $row['actioned_at'] ?? null,
            'appealReason' => $row['appeal_reason'] ?? null,
            'appealAt' => $row['appeal_at'] ?? null,
        ];
    }
    json(['reports' => $out]);
}

// POST /api/reports/:id/appeal — reporter-only. A closed report
// ('actioned' or 'dismissed') goes back to 'open' with the appeal reason
// attached, so the admin reviews it again. An open report, or someone
// else's report, cannot be appealed.
function appealReport(string $id): void
{
    $user = requireAuthUser();
    $payload = requestJson();
    $reason = mb_substr(trim((string)($payload['reason'] ?? $payload['appealReason'] ?? '')), 0, 1000);
    if ($reason === '') {
        je('Please say briefly why you are appealing.', 400);
    }
    $stmt = db()->prepare('SELECT status FROM reports WHERE id = ? AND reporter_id = ? LIMIT 1');
    $stmt->execute([$id, $user['uid']]);
    $row = $stmt->fetch();
    if (!$row) {
        je('Report not found.', 404);
    }
    if (!in_array((string)$row['status'], ['actioned', 'dismissed'], true)) {
        je('Only a closed report can be appealed.', 400);
    }
    db()->prepare("UPDATE reports SET status = 'open', appeal_reason = ?, appeal_at = NOW() WHERE id = ?")
        ->execute([$reason, $id]);
    auditLog('report.appealed', 'report', $id, ['by' => (string)$user['uid']]);
    json(['ok' => true, 'status' => 'open']);
}
