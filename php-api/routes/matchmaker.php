<?php
// Matchmaker profiles: members can submit profiles for others (family, clients).
// Submissions stay invisible until an admin approves; pending submissions
// older than 7 days are deleted automatically (lazy purge).

function routeMatchmaker(string $method, array $segments): void
{
    if ($method === 'POST' && ($segments[0] ?? null) === null) {
        matchmakerSubmit();
        return;
    }
    if ($method === 'GET' && ($segments[0] ?? null) === 'mine') {
        matchmakerMine();
        return;
    }
    json(['error' => 'Matchmaker endpoint not found'], 404);
}

// Delete pending submissions older than 7 days. Runs lazily on every
// matchmaker read — there is no cron on shared hosting.
function matchmakerPurgeExpired(): void
{
    try {
        db()->prepare("DELETE FROM matchmaker_profiles WHERE status = 'pending' AND created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)")
            ->execute();
    } catch (Throwable) { /* table may not exist yet */ }
}

// POST /api/matchmaker — submit a profile for someone else.
function matchmakerSubmit(): void
{
    $user = requireAuthUser();
    matchmakerPurgeExpired();
    $body = requestJson();

    $name = trim((string)($body['display_name'] ?? $body['name'] ?? ''));
    if ($name === '') {
        je('A name is required.', 400);
    }
    $payload = [
        'display_name' => $name,
        'age' => isset($body['age']) ? (int)$body['age'] : null,
        'gender' => in_array($body['gender'] ?? '', ['male', 'female'], true) ? $body['gender'] : null,
        'city' => trim((string)($body['city'] ?? '')),
        'country' => trim((string)($body['country'] ?? '')),
        'bio' => trim((string)($body['bio'] ?? '')),
        'profession' => trim((string)($body['profession'] ?? '')),
        'education_level' => trim((string)($body['education_level'] ?? '')),
        'marital_status' => trim((string)($body['marital_status'] ?? '')),
        'photo_url' => trim((string)($body['photo_url'] ?? '')),
        'contact_note' => trim((string)($body['contact_note'] ?? '')),
    ];

    $id = uuid();
    db()->prepare('INSERT INTO matchmaker_profiles (id, submitted_by, payload, status) VALUES (?, ?, ?, ?)')
        ->execute([$id, (string)$user['uid'], json_encode($payload, JSON_UNESCAPED_UNICODE), 'pending']);

    auditLog('matchmaker.submitted', 'matchmaker_profile', $id, ['name' => $name]);
    json(['ok' => true, 'id' => $id, 'message' => 'Submitted. An admin will review it within 7 days.']);
}

// GET /api/matchmaker/mine — my submissions and their status.
function matchmakerMine(): void
{
    $user = requireAuthUser();
    matchmakerPurgeExpired();
    try {
        $rows = db()->prepare("SELECT id, payload, status, created_at, reviewed_at FROM matchmaker_profiles WHERE submitted_by = ? ORDER BY created_at DESC LIMIT 50");
        $rows->execute([(string)$user['uid']]);
        $out = [];
        foreach ($rows->fetchAll() as $r) {
            $p = json_decode((string)$r['payload'], true) ?: [];
            $out[] = [
                'id' => $r['id'],
                'display_name' => $p['display_name'] ?? '',
                'status' => $r['status'],
                'created_at' => $r['created_at'],
            ];
        }
        json(['ok' => true, 'submissions' => $out]);
    } catch (Throwable) {
        json(['ok' => true, 'submissions' => []]);
    }
}

// ── Admin ────────────────────────────────────────────────────────────────

function routeAdminMatchmaker(string $method, array $segments): void
{
    if ($method === 'GET' && ($segments[0] ?? null) === null) {
        adminMatchmakerQueue();
        return;
    }
    $id = (string)($segments[0] ?? '');
    if ($method === 'POST' && ($segments[1] ?? null) === 'approve' && $id !== '') {
        adminMatchmakerApprove($id);
        return;
    }
    if ($method === 'POST' && ($segments[1] ?? null) === 'reject' && $id !== '') {
        adminMatchmakerReject($id);
        return;
    }
    json(['error' => 'Matchmaker admin endpoint not found'], 404);
}

// GET /api/admin/matchmaker — pending queue (expired auto-purged first).
function adminMatchmakerQueue(): void
{
    matchmakerPurgeExpired();
    try {
        $rows = db()->query(
            "SELECT m.id, m.submitted_by, m.payload, m.status, m.created_at, u.email AS submitter_email
             FROM matchmaker_profiles m LEFT JOIN users u ON u.id = m.submitted_by
             WHERE m.status = 'pending' ORDER BY m.created_at ASC LIMIT 100"
        )->fetchAll();
    } catch (Throwable) {
        json(['ok' => true, 'queue' => []]);
        return;
    }
    $out = [];
    foreach ($rows as $r) {
        $out[] = [
            'id' => $r['id'],
            'payload' => json_decode((string)$r['payload'], true) ?: [],
            'submitter_email' => $r['submitter_email'] ?? '',
            'created_at' => $r['created_at'],
            // Days left before automatic deletion.
            'expires_in_days' => max(0, 7 - (int)floor((time() - strtotime((string)$r['created_at'])) / 86400)),
        ];
    }
    json(['ok' => true, 'queue' => $out]);
}

// POST /api/admin/matchmaker/:id/approve — publish as a browsable profile.
function adminMatchmakerApprove(string $id): void
{
    $admin = requireAdminUser();
    $stmt = db()->prepare("SELECT * FROM matchmaker_profiles WHERE id = ? AND status = 'pending' LIMIT 1");
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) {
        je('Submission not found or already reviewed.', 404);
    }
    $p = json_decode((string)$row['payload'], true) ?: [];

    $profileId = uuid();
    try {
        db()->prepare(
            'INSERT INTO profiles (user_id, display_name, age, gender, city, country, bio, profession, education_level, marital_status, photo_url, is_matchmaker, matchmaker_by, seeking_gender) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)'
        )->execute([
            $profileId,
            (string)($p['display_name'] ?? 'Member'),
            $p['age'] ?? null,
            $p['gender'] ?? null,
            $p['city'] ?? null,
            $p['country'] ?? null,
            $p['bio'] ?? null,
            $p['profession'] ?? null,
            $p['education_level'] ?? null,
            $p['marital_status'] ?? null,
            $p['photo_url'] ?? null,
            (string)$row['submitted_by'],
            // A matchmaker profile seeks the opposite gender of the person listed.
            ($p['gender'] ?? '') === 'male' ? 'female' : (($p['gender'] ?? '') === 'female' ? 'male' : null),
        ]);
    } catch (Throwable $e) {
        je('Could not publish the profile.', 500);
    }

    db()->prepare("UPDATE matchmaker_profiles SET status = 'approved', reviewed_at = NOW(), reviewed_by = ? WHERE id = ?")
        ->execute([(string)($admin['uid'] ?? $admin['id'] ?? ''), $id]);

    auditLog('matchmaker.approved', 'matchmaker_profile', $id, ['profile_id' => $profileId]);
    json(['ok' => true, 'profile_id' => $profileId]);
}

// POST /api/admin/matchmaker/:id/reject — decline (deleted, not kept).
function adminMatchmakerReject(string $id): void
{
    $admin = requireAdminUser();
    $body = requestJson();
    $reason = trim((string)($body['reason'] ?? ''));
    $stmt = db()->prepare("SELECT id FROM matchmaker_profiles WHERE id = ? AND status = 'pending' LIMIT 1");
    $stmt->execute([$id]);
    if (!$stmt->fetch()) {
        je('Submission not found or already reviewed.', 404);
    }
    db()->prepare('DELETE FROM matchmaker_profiles WHERE id = ?')->execute([$id]);
    auditLog('matchmaker.rejected', 'matchmaker_profile', $id, ['reason' => $reason]);
    json(['ok' => true]);
}
