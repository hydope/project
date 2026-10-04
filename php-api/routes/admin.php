<?php
// Admin routes — parity with server/routes/admin.js. Everything here requires
// an authenticated admin session (router.use(authRequired, adminRequired)).
// MySQL has no UPDATE...RETURNING: guarded writes probe first, then act.
//
// Every state-changing admin action writes an immutable row to admin_audit via
// auditLog(). On a platform that verifies identity documents and can block a
// member outright, "who did this and when" is a compliance requirement, not a
// nice-to-have.
declare(strict_types=1);

/**
 * Append an immutable audit record. Never throws into the caller: a logging
 * failure must not roll back the action that already succeeded, so errors are
 * swallowed after being written to the error log.
 */
function auditLog(string $action, string $targetType, string $targetId, array $meta = []): void
{
    try {
        db()->prepare(
            'INSERT INTO admin_audit (id, actor_id, actor_email, action, target_type, target_id, meta, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())'
        )->execute([
            uuid(),
            (string)(currentUser()['uid'] ?? ''),
            (string)(currentUser()['email'] ?? ''),
            $action,
            $targetType,
            $targetId,
            json_encode($meta, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ]);
    } catch (Throwable $e) {
        error_log('[api] audit log failed: ' . substr($e->getMessage(), 0, 140));
    }
}

function routeAdmin(string $method, array $segments): void
{
    $user = requireAuthUser();
    if (empty($user['isAdmin'])) {
        je('Admin access required', 403);
    }

    $action = $segments[0] ?? null;

    // Audit trail — immutable, read-only.
    if ($method === 'GET' && $action === 'audit') { adminAuditList(); return; }

    // Member search with pagination. The old adminUsers() returned a flat
    // LIMIT 100 list with no way to find anybody and no way to page.
    if ($method === 'GET' && $action === 'users') { adminUsers(); return; }
    if ($method === 'GET' && $action === 'user' && ($segments[1] ?? null) !== null) {
        adminUserDetail((string)$segments[1]);
        return;
    }

    // The file branch must come before the plain list branch: /verifications
    // alone and /verifications/:id/file both start with action=verifications.
    if ($method === 'GET' && $action === 'verifications' && ($segments[1] ?? null) !== null && ($segments[2] ?? null) === 'file') {
        adminVerificationFile((string)$segments[1]);
        return;
    }
    if ($method === 'GET' && $action === 'verifications') { adminVerificationsList(); return; }
    if ($method === 'POST' && $action === 'verifications' && ($segments[1] ?? null) === 'bulk'
        && ($segments[2] ?? null) === null) {
        // POST /api/admin/verifications/bulk — the collection form. This is the
        // contract the queue UI calls. It must be tested BEFORE the /:id branch
        // below, otherwise "bulk" is read as a verification id.
        adminVerificationBulk();
        return;
    }
    if ($method === 'POST' && $action === 'verifications' && ($segments[1] ?? null) !== null) {
        $verb = strtolower((string)($segments[2] ?? ''));
        if ($verb === 'bulk') { adminVerificationBulk(); return; }
        if ($verb === 'approve') { adminApproveVerification((string)$segments[1]); return; }
        if ($verb === 'reject')  { adminRejectVerification((string)$segments[1]); return; }
    }
    if ($method === 'GET' && $action === 'overview') { adminOverview(); return; }
    if ($method === 'GET' && $action === 'analytics') { adminAnalytics(); return; }
    if ($method === 'GET' && $action === 'queue') { adminModerationQueue(); return; }
    if ($method === 'GET' && $action === 'funnel') { adminFunnel(); return; }
    if ($method === 'GET' && $action === 'wali') { adminWaliLinks(); return; }
    if ($method === 'GET' && $action === 'reports') { adminReports(); return; }
    if ($method === 'POST' && $action === 'reports' && ($segments[1] ?? null) !== null && ($segments[2] ?? null) === 'action') {
        adminReportAction((string)$segments[1]);
        return;
    }
    if ($method === 'POST' && $action === 'reports' && ($segments[1] ?? null) !== null && ($segments[2] ?? null) === 'dismiss') {
        adminReportDismiss((string)$segments[1]);
        return;
    }
    if ($method === 'POST' && $action === 'users' && ($segments[1] ?? null) !== null && ($segments[2] ?? null) === 'role') {
        adminSetRole((string)$segments[1]);
        return;
    }
    // POST /api/admin/users/:id/unblock — reverse a moderation block set by
    // report "action" (profiles.is_blocked = 1). Idempotent.
    if ($method === 'POST' && $action === 'users' && ($segments[1] ?? null) !== null && ($segments[2] ?? null) === 'unblock') {
        adminUnblockUser((string)$segments[1]);
        return;
    }

    json(['error' => 'Admin endpoint not found'], 404);
}

function adminVerificationsList(): void
{
    $status = $_GET['status'] ?? 'pending';
    if (!in_array($status, ['pending', 'approved', 'rejected'], true)) {
        $status = 'pending';
    }

    $stmt = db()->prepare(
        'SELECT v.id, v.kind, v.status, v.created_at, v.reviewed_at, v.review_note,
                u.email AS member_email, p.display_name AS member_name
           FROM verifications v
           JOIN users u ON u.id = v.user_id
           LEFT JOIN profiles p ON p.user_id = v.user_id
          WHERE v.status = ?
          ORDER BY v.created_at ASC LIMIT 200'
    );
    $stmt->execute([$status]);
    json($stmt->fetchAll());
}

function adminApproveVerification(string $verificationId): void
{
    $admin = requireAuthUser();
    $payload = requestJson();
    $note = sanitizeText((string)($payload['note'] ?? ''), 500) ?: null;

    // Guard first (only pending rows are reviewable), then update, then flip badge.
    $probe = db()->prepare("SELECT user_id FROM verifications WHERE id = ? AND status = 'pending' LIMIT 1");
    $probe->execute([$verificationId]);
    $row = $probe->fetch();
    if (!$row) {
        je('Submission not found or already reviewed.', 404);
    }

    db()->prepare("UPDATE verifications SET status = 'approved', reviewed_by = ?, reviewed_at = UTC_TIMESTAMP(), review_note = ? WHERE id = ?")
        ->execute([$admin['uid'], $note, $verificationId]);
    db()->prepare('UPDATE profiles SET is_verified = 1, updated_at = UTC_TIMESTAMP() WHERE user_id = ?')
        ->execute([$row['user_id']]);

    auditLog('verification.approved', 'verification', $verificationId, [
        'userId' => (string)$row['user_id'],
        'note' => $note,
    ]);

    json(['ok' => true, 'verified' => true]);
}

function adminRejectVerification(string $verificationId): void
{
    $admin = requireAuthUser();
    $payload = requestJson();
    $note = sanitizeText((string)($payload['note'] ?? ''), 500)
        ?: 'Photo was not clear enough — please resubmit.';

    $probe = db()->prepare("SELECT id FROM verifications WHERE id = ? AND status = 'pending' LIMIT 1");
    $probe->execute([$verificationId]);
    if (!$probe->fetch()) {
        je('Submission not found or already reviewed.', 404);
    }

    db()->prepare("UPDATE verifications SET status = 'rejected', reviewed_by = ?, reviewed_at = UTC_TIMESTAMP(), review_note = ? WHERE id = ?")
        ->execute([$admin['uid'], $note, $verificationId]);

    auditLog('verification.rejected', 'verification', $verificationId, ['note' => $note]);

    json(['ok' => true]);
}

function adminVerificationFile(string $verificationId): void
{
    $stmt = db()->prepare('SELECT storage_path FROM verifications WHERE id = ? LIMIT 1');
    $stmt->execute([$verificationId]);
    $row = $stmt->fetch();
    if (!$row) {
        je('Not found.', 404);
    }

    // Defense in depth: never serve anything outside UPLOAD_DIR even if a path
    // in the DB were tampered with (parity with routes/admin.js).
    $path = (string)$row['storage_path'];
    $base = trim((string)(getenv('UPLOAD_DIR') ?: (__DIR__ . '/../uploads')));
    $realBase = realpath($base) ?: $base;
    $realFile = realpath($path) ?: $path;

    if ($realBase === '' || $realFile === '' || strncmp($realFile, $realBase, strlen($realBase)) !== 0) {
        je('Forbidden.', 403);
    }
    if (!is_file($realFile)) {
        je('File missing on disk.', 404);
    }

    // Decrypt in memory, then stream. The plaintext never touches disk and is
    // never cached: no-store on every response, and admins are the only readers.
    $plain = decBytesAtRest((string)@file_get_contents($realFile));
    if ($plain === '') {
        je('Could not decrypt this file.', 500);
    }

    header('Content-Type: image/jpeg');
    header('Content-Length: ' . strlen($plain));
    header('Cache-Control: no-store, no-cache, must-revalidate, private');
    header('Pragma: no-cache');
    header('X-Content-Type-Options: nosniff');
    echo $plain;
    exit;
}
function adminOverview(): void
{
    // COUNT(*) comes back as a string from MySQL — cast for numeric parity.
    json([
        'totalMembers' => (int)db()->query('SELECT COUNT(*) AS n FROM users')->fetch()['n'],
        'activeProfiles' => (int)db()->query('SELECT COUNT(*) AS n FROM profiles WHERE is_blocked = 0')->fetch()['n'],
        'messagesToday' => (int)db()->query('SELECT COUNT(*) AS n FROM messages WHERE created_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)')->fetch()['n'],
        'livePosts' => (int)db()->query('SELECT COUNT(*) AS n FROM posts WHERE is_hidden = 0')->fetch()['n'],
        'repliesThisWeek' => (int)db()->query('SELECT COUNT(*) AS n FROM replies WHERE created_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)')->fetch()['n'],
        'openReports' => (int)db()->query("SELECT COUNT(*) AS n FROM reports WHERE status = 'open'")->fetch()['n'],
    ]);
}

// GET /api/admin/analytics?range=7d|30d — real series from created_at buckets.
// Node uses generate_series (Postgres); MySQL has none, so the day axis is
// built in PHP and counts come from one grouped query each.
function adminAnalytics(): void
{
    $range = ($_GET['range'] ?? '') === '30d' ? '30d' : '7d';
    $days = $range === '30d' ? 30 : 7;

    // generate_series(now() - days, now()) is inclusive → days + 1 buckets.
    $labels = [];
    $dayKeys = [];
    for ($i = $days; $i >= 0; $i--) {
        $ts = time() - ($i * 86400);
        $labels[] = date('M d', $ts);
        $dayKeys[] = date('Y-m-d', $ts);
    }

    $bucketCounts = function (string $table) use ($days): array {
        // $days is an int derived from a fixed enum above — safe to inline
        // (placeholder markers are not accepted inside INTERVAL by all
        // MariaDB versions with native prepares).
        $stmt = db()->prepare("SELECT DATE(created_at) AS d, COUNT(*) AS n FROM {$table}
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL {$days} DAY) GROUP BY DATE(created_at)");
        $stmt->execute();
        $map = [];
        foreach ($stmt->fetchAll() as $r) {
            $map[(string)$r['d']] = (int)$r['n'];
        }
        return $map;
    };

    $memberCounts = $bucketCounts('users');
    $messageCounts = $bucketCounts('messages');

    json([
        'range' => $range,
        'charts' => [
            [
                'key' => 'memberGrowth',
                'title' => 'Member Growth',
                'labels' => $labels,
                'values' => array_map(fn($d) => $memberCounts[$d] ?? 0, $dayKeys),
                'color' => 'var(--color-primary)',
            ],
            [
                'key' => 'messageVolume',
                'title' => 'Message Volume',
                'labels' => $labels,
                'values' => array_map(fn($d) => $messageCounts[$d] ?? 0, $dayKeys),
                'color' => 'var(--color-accent)',
            ],
        ],
    ]);
}

function adminReports(): void
{
    $status = in_array($_GET['status'] ?? '', ['open', 'actioned', 'dismissed'], true) ? $_GET['status'] : 'open';
    $stmt = db()->prepare('SELECT r.*, u.email AS reporter_email FROM reports r
        JOIN users u ON u.id = r.reporter_id WHERE r.status = ? ORDER BY r.created_at DESC LIMIT 200');
    $stmt->execute([$status]);
    json($stmt->fetchAll());
}

// POST /api/admin/reports/:id/action — hide the target + mark actioned
function adminReportAction(string $reportId): void
{
    $stmt = db()->prepare('SELECT * FROM reports WHERE id = ? LIMIT 1');
    $stmt->execute([$reportId]);
    $report = $stmt->fetch();
    if (!$report) {
        je('Report not found.', 404);
    }

    $type = (string)$report['target_type'];
    $targetId = (string)$report['target_id'];
    if ($type === 'post') {
        db()->prepare('UPDATE posts SET is_hidden = 1 WHERE id = ?')->execute([$targetId]);
    } elseif ($type === 'reply') {
        db()->prepare('UPDATE replies SET is_hidden = 1 WHERE id = ?')->execute([$targetId]);
    } elseif ($type === 'profile' || $type === 'user') {
        try {
            db()->prepare('UPDATE profiles SET is_blocked = 1 WHERE user_id = ?')->execute([$targetId]);
        } catch (Throwable) { /* target may have no profile row */ }
    }
    db()->prepare("UPDATE reports SET status = 'actioned' WHERE id = ?")->execute([$reportId]);

    auditLog('report.actioned', 'report', $reportId, [
        'targetType' => $type,
        'targetId' => $targetId,
    ]);

    json(['ok' => true]);
}

// POST /api/admin/reports/:id/dismiss
function adminReportDismiss(string $reportId): void
{
    db()->prepare("UPDATE reports SET status = 'dismissed' WHERE id = ?")->execute([$reportId]);
    auditLog('report.dismissed', 'report', $reportId);
    json(['ok' => true]);
}

// GET /api/admin/users — searchable, paginated member directory.
//
// The previous version returned a flat LIMIT 100 with no search, so an operator
// could neither find a specific member nor read past the hundredth. Supports
// ?q= (email, display name or id), ?role=, ?verified=, ?blocked= and
// ?limit=/?hasMore.
function adminUsers(): void
{
    $q = trim((string)($_GET['q'] ?? ''));
    $role = $_GET['role'] ?? null;
    $verified = $_GET['verified'] ?? null;
    $blocked = $_GET['blocked'] ?? null;
    $limit = max(1, min(100, (int)($_GET['limit'] ?? 25)));

    $where = [];
    $params = [];

    if ($q !== '') {
        // Escape LIKE metacharacters so a query containing % or _ is literal.
        $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $q) . '%';
        $where[] = '(u.email LIKE ? OR u.display_name LIKE ? OR u.id = ?)';
        $params[] = $like;
        $params[] = $like;
        $params[] = $q;
    }
    if (is_string($role) && in_array($role, ['member', 'matchmaker', 'guardian'], true)) {
        $where[] = 'u.role = ?';
        $params[] = $role;
    }
    if ($verified === '1' || $verified === '0') {
        $where[] = 'u.email_verified = ?';
        $params[] = (int)$verified;
    }

    $sql = 'SELECT u.id, u.email, u.display_name, u.role, u.email_verified, u.created_at,
                   p.is_blocked, p.is_verified AS id_verified, p.city, p.country, p.age
              FROM users u
              LEFT JOIN profiles p ON p.user_id = u.id';
    if ($blocked === '1') $where[] = 'p.is_blocked = 1';
    if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
    $sql .= ' ORDER BY u.created_at DESC, u.id DESC LIMIT ' . ($limit + 1);

    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    // One extra row tells us whether another page exists without a COUNT(*).
    $hasMore = count($rows) > $limit;
    if ($hasMore) array_pop($rows);

    foreach ($rows as &$r) {
        $r['is_blocked'] = (bool)($r['is_blocked'] ?? false);
        $r['id_verified'] = (bool)($r['id_verified'] ?? false);
        $r['email_verified'] = (bool)($r['email_verified'] ?? false);
    }
    unset($r);

    json(['rows' => $rows, 'hasMore' => $hasMore, 'count' => count($rows)]);
}

// GET /api/admin/queue — one ranked moderation worklist.
//
// Open reports and pending verifications merged, severity-first, with item age
// so an operator can see what is about to breach an SLA. Replaces the separate
// Reports and Verifications tabs that hid the real workload from each other.
function adminModerationQueue(): void
{
    $openReports = db()->query("SELECT r.id, r.reporter_id, r.target_type, r.target_id, r.reason, r.created_at,
                                       u.display_name AS reporter_name
                                  FROM reports r
                                  LEFT JOIN users u ON u.id = r.reporter_id
                                 WHERE r.status = 'open'
                                 ORDER BY r.created_at ASC LIMIT 200")
        ->fetchAll();

    $pending = db()->query("SELECT v.id, v.kind, v.created_at, u.display_name AS member_name, u.email
                              FROM verifications v
                              LEFT JOIN users u ON u.id = v.user_id
                             WHERE v.status = 'pending'
                             ORDER BY v.created_at ASC LIMIT 200")
        ->fetchAll();

    $now = time();
    $items = [];

    foreach ($openReports as $r) {
        $ageHours = (int)floor(($now - strtotime((string)$r['created_at'])) / 3600);
        $items[] = [
            'kind' => 'report',
            'id' => $r['id'],
            'title' => (string)$r['reason'],
            'subtitle' => 'Reported ' . $r['target_type'] . ' by ' . ($r['reporter_name'] ?: 'member'),
            'targetId' => $r['target_id'],
            'createdAt' => $r['created_at'],
            'ageHours' => $ageHours,
            // Older and safety-critical work first.
            'severity' => $ageHours >= 24 ? 'urgent' : 'normal',
        ];
    }
    foreach ($pending as $v) {
        $ageHours = (int)floor(($now - strtotime((string)$v['created_at'])) / 3600);
        $items[] = [
            'kind' => 'verification',
            'id' => $v['id'],
            'title' => ucfirst((string)$v['kind']) . ' verification',
            'subtitle' => ($v['member_name'] ?: 'Member') . ' - ' . ($v['email'] ?? ''),
            'targetId' => null,
            'createdAt' => $v['created_at'],
            'ageHours' => $ageHours,
            'severity' => $ageHours >= 48 ? 'urgent' : 'normal',
        ];
    }

    usort($items, static function (array $a, array $b): int {
        if ($a['severity'] !== $b['severity']) return $a['severity'] === 'urgent' ? -1 : 1;
        return $b['ageHours'] <=> $a['ageHours'];
    });

    json([
        'items' => $items,
        'openReports' => count($openReports),
        'pendingVerifications' => count($pending),
        'urgent' => count(array_filter($items, static fn(array $i): bool => $i['severity'] === 'urgent')),
    ]);
}

// POST /api/admin/verifications/bulk { ids:[], verb, note }
// Bulk review. Approving forty identity documents one click at a time is not an
// operable queue; this is the single biggest ergonomic win in the panel.
function adminVerificationBulk(): void
{
    $payload = requestJson();
    $ids = $payload['ids'] ?? [];
    $verb = strtolower((string)($payload['verb'] ?? 'approve'));
    $note = sanitizeText((string)($payload['note'] ?? ''), 500);

    if (!is_array($ids) || !$ids) {
        je('Provide a non-empty ids array.', 400);
    }
    if (!in_array($verb, ['approve', 'reject'], true)) {
        je('Verb must be approve or reject.', 400);
    }
    // Bound the batch so a fat-fingered request cannot lock the table.
    if (count($ids) > 200) {
        je('Bulk actions are limited to 200 items at a time.', 400);
    }

    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $probe = db()->prepare("SELECT id, user_id FROM verifications WHERE id IN ({$placeholders}) AND status = 'pending'");
    $probe->execute($ids);
    $rows = $probe->fetchAll();
    if (!$rows) {
        json(['ok' => true, 'affected' => 0, 'message' => 'Nothing pending in that selection.']);
    }

    $actor = requireAuthUser();
    if ($verb === 'approve') {
        $up = db()->prepare("UPDATE verifications SET status='approved', reviewed_by=?, reviewed_at=UTC_TIMESTAMP(), review_note=? WHERE id IN ({$placeholders})");
        $up->execute(array_merge([$actor['uid'], $note ?: null], $ids));
        $sync = db()->prepare("UPDATE profiles SET is_verified = 1, updated_at = UTC_TIMESTAMP() WHERE user_id IN (SELECT user_id FROM verifications WHERE id IN ({$placeholders}))");
        $sync->execute($ids);
    } else {
        $up = db()->prepare("UPDATE verifications SET status='rejected', reviewed_by=?, reviewed_at=UTC_TIMESTAMP(), review_note=? WHERE id IN ({$placeholders})");
        $up->execute(array_merge([$actor['uid'], $note ?: 'Photo was not clear enough - please resubmit.'], $ids));
    }

    $n = count($rows);
    auditLog('verification.bulk_' . $verb, 'verification', implode(',', array_column($rows, 'id')), [
        'count' => $n,
        'note' => $note,
    ]);
    json(['ok' => true, 'affected' => $n]);
}
function adminUserDetail(string $userId): void
{
    $stmt = db()->prepare(
        'SELECT u.id, u.email, u.display_name, u.role, u.email_verified, u.is_admin, u.created_at,
                p.display_name AS profile_name, p.age, p.city, p.country, p.sect, p.profession,
                p.bio, p.username, p.is_blocked, p.is_verified AS id_verified,
                p.visibility, p.photos_visibility
           FROM users u
           LEFT JOIN profiles p ON p.user_id = u.id
          WHERE u.id = ? LIMIT 1'
    );
    $stmt->execute([$userId]);
    $user = $stmt->fetch();
    if (!$user) {
        je('Member not found.', 404);
    }

    // One malformed sub-query here used to 500 the entire endpoint and blank the
    // drawer. Fetch the optional sections independently so a missing table on an
    // older database degrades that one section instead of the whole panel.
    $section = static function (string $sql, array $args = []) {
        try {
            $st = db()->prepare($sql);
            $st->execute($args);
            return $st->fetchAll();
        } catch (Throwable $e) {
            error_log('[api] admin/user detail section failed: ' . substr($e->getMessage(), 0, 140));
            return [];
        }
    };

    // messages is normalised: there is no receiver_id column. The recipient is
    // on conversations, so the count has to join through it.
    $messageCount = static function (string $userId): int {
        try {
            $st = db()->prepare(
                'SELECT COUNT(*) AS n FROM messages m
                   JOIN conversations c ON c.id = m.conversation_id
                  WHERE c.user_a = ? OR c.user_b = ?'
            );
            $st->execute([$userId, $userId]);
            return (int)($st->fetch()['n'] ?? 0);
        } catch (Throwable $e) {
            error_log('[api] admin/user message count failed: ' . substr($e->getMessage(), 0, 140));
            return 0;
        }
    };

    json([
        'user' => $user,
        'reports' => $section('SELECT id, target_type, target_id, reason, status, created_at FROM reports WHERE target_id = ? ORDER BY created_at DESC LIMIT 20', [$userId]),
        'verifications' => $section('SELECT id, kind, status, review_note, created_at, reviewed_at FROM verifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', [$userId]),
        'interests' => $section('SELECT id, from_user_id, to_user_id, created_at FROM interests WHERE from_user_id = ? OR to_user_id = ? ORDER BY created_at DESC LIMIT 20', [$userId, $userId]),
        'audit' => $section('SELECT id, actor_email, action, created_at, meta FROM admin_audit WHERE target_id = ? ORDER BY created_at DESC LIMIT 20', [$userId]),
        'messageCount' => $messageCount($userId),
    ]);
}

// GET /api/admin/audit — the immutable trail.
function adminAuditList(): void
{
    $limit = max(1, min(200, (int)($_GET['limit'] ?? 50)));
    $rows = db()->query("SELECT id, actor_id, actor_email, action, target_type, target_id, meta, created_at
                           FROM admin_audit ORDER BY created_at DESC, id DESC LIMIT {$limit}")
        ->fetchAll();
    foreach ($rows as &$r) {
        $decoded = json_decode((string)($r['meta'] ?? ''), true);
        $r['meta'] = is_array($decoded) ? $decoded : [];
    }
    unset($r);
    json($rows);
}

// POST /api/admin/users/:id/role { role } — approve a matchmaker/guardian (or
// revoke back to member). Revoking never deletes data; it only stops new drafts.
// GET /api/admin/funnel — where members drop out of activation.
//
// registered -> email verified -> profile published -> ID verified -> interest
// exchanged -> mutual match. Each step is a plain COUNT so it stays cheap on
// shared hosting.
// GET /api/admin/wali — every companion link a member has issued.
//
// AdminGuardians previously rendered fixture data. This reads the real
// wali_links table. The share TOKEN is deliberately NOT returned: it is the
// bearer credential that opens a read-only view of that member's profile, so it
// must never be exposed in an admin list.
function adminWaliLinks(): void
{
    try {
        $rows = db()->query(
            'SELECT w.id, w.user_id, w.created_at, w.revoked_at,
                    u.display_name AS member_name, u.email,
                    p.display_name AS profile_name
               FROM wali_links w
               LEFT JOIN users u ON u.id = w.user_id
               LEFT JOIN profiles p ON p.user_id = w.user_id
              ORDER BY w.created_at DESC
              LIMIT 200'
        )->fetchAll();
    } catch (Throwable $e) {
        // Older databases may not have wali_links yet; report honestly rather
        // than 500-ing the whole panel.
        error_log('[api] admin/wali unavailable: ' . substr($e->getMessage(), 0, 120));
        json(['rows' => [], 'available' => false]);
    }

    foreach ($rows as &$r) {
        $r['active'] = empty($r['revoked_at']);
    }
    unset($r);

    json(['rows' => $rows, 'available' => true]);
}

function adminFunnel(): void
{
    $count = static function (string $sql): int {
        try {
            $row = db()->query($sql)->fetch();
            return (int)($row['n'] ?? 0);
        } catch (Throwable $e) {
            error_log('[api] funnel step failed: ' . substr($e->getMessage(), 0, 100));
            return 0;
        }
    };

    $steps = [
        ['key' => 'registered', 'label' => 'Registered', 'n' => $count('SELECT COUNT(*) AS n FROM users')],
        ['key' => 'verified', 'label' => 'Email verified', 'n' => $count('SELECT COUNT(*) AS n FROM users WHERE email_verified = 1')],
        ['key' => 'published', 'label' => 'Profile published', 'n' => $count("SELECT COUNT(*) AS n FROM profiles WHERE visibility != 'private'")],
        ['key' => 'idVerified', 'label' => 'ID verified', 'n' => $count('SELECT COUNT(*) AS n FROM profiles WHERE is_verified = 1')],
        ['key' => 'interested', 'label' => 'Interest sent', 'n' => $count('SELECT COUNT(DISTINCT from_user_id) AS n FROM interests')],
        ['key' => 'matched', 'label' => 'Mutual match', 'n' => $count(
            'SELECT COUNT(*) AS n FROM interests a JOIN interests b ON a.from_user_id = b.to_user_id AND a.to_user_id = b.from_user_id',
        )],
    ];

    // Conversion from the first step, so the UI can show drop-off percentages.
    $base = $steps[0]['n'];
    foreach ($steps as &$s) {
        $s['pctOfRegistered'] = $base > 0 ? (int)round($s['n'] * 100 / $base) : 0;
    }
    unset($s);

    json(['steps' => $steps]);
}

function adminSetRole(string $userId): void
{
    $payload = requestJson();
    $role = trim((string)($payload['role'] ?? ''));
    if (!in_array($role, ['member', 'matchmaker', 'guardian'], true)) {
        je('Role must be member, matchmaker or guardian.', 400);
    }

    // Guard: 404 for unknown members (Node RETURNING yields no row).
    $probe = db()->prepare('SELECT id, email FROM users WHERE id = ? LIMIT 1');
    $probe->execute([$userId]);
    $row = $probe->fetch();
    if (!$row) {
        je('Member not found.', 404);
    }

    db()->prepare('UPDATE users SET role = ? WHERE id = ?')->execute([$role, $userId]);

    auditLog('user.role_changed', 'user', $userId, [
        'email' => (string)$row['email'],
        'newRole' => $role,
    ]);

    json(['ok' => true, 'id' => $row['id'], 'email' => $row['email'], 'role' => $role]);
}

// POST /api/admin/users/:id/unblock — clear a moderation block so the member's
// profile is visible again. No-op when there is no profile row.
function adminUnblockUser(string $userId): void
{
    $probe = db()->prepare('SELECT id, email FROM users WHERE id = ? LIMIT 1');
    $probe->execute([$userId]);
    $row = $probe->fetch();
    if (!$row) {
        je('Member not found.', 404);
    }
    try {
        db()->prepare('UPDATE profiles SET is_blocked = 0 WHERE user_id = ?')->execute([$userId]);
    } catch (Throwable) { /* target may have no profile row */ }

    auditLog('user.unblocked', 'user', $userId, ['email' => (string)$row['email']]);

    json(['ok' => true, 'id' => $row['id'], 'email' => $row['email']]);
}

