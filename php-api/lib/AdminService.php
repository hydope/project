<?php
// ─── Admin service ───────────────────────────────────────────────────────────
// Business logic for admin operations, extracted from routes/admin.php.
// Routes handle HTTP; this class enforces domain rules.

declare(strict_types=1);

class AdminService
{
    /**
     * Take action on a moderation report: hide the content, mark actioned.
     * Returns the action taken.
     */
    public static function actionReport(string $reportId, string $adminId): array
    {
        $report = db()->prepare('SELECT * FROM reports WHERE id = ? LIMIT 1');
        $report->execute([$reportId]);
        $row = $report->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            throw new RuntimeException('Report not found.');
        }

        $targetType = (string)($row['target_type'] ?? '');
        $targetId = (string)($row['target_id'] ?? '');

        db()->beginTransaction();
        try {
            // Hide the reported content based on type.
            switch ($targetType) {
                case 'post':
                    db()->prepare('UPDATE posts SET is_hidden = 1 WHERE id = ?')->execute([$targetId]);
                    break;
                case 'reply':
                    db()->prepare('UPDATE replies SET is_hidden = 1 WHERE id = ?')->execute([$targetId]);
                    break;
                case 'profile':
                case 'user':
                    db()->prepare('UPDATE profiles SET is_blocked = 1 WHERE user_id = ?')->execute([$targetId]);
                    break;
            }

            db()->prepare("UPDATE reports SET status = 'actioned', actioned_by = ?, actioned_at = UTC_TIMESTAMP() WHERE id = ?")
                ->execute([$adminId, $reportId]);

            auditLog('report.actioned', 'report', $reportId, [
                'target_type' => $targetType,
                'target_id' => $targetId,
                'admin' => $adminId,
            ]);

            db()->commit();
        } catch (Throwable $e) {
            db()->rollBack();
            throw $e;
        }

        return ['action' => 'hidden', 'target_type' => $targetType];
    }

    /**
     * Dismiss a report without taking content action.
     */
    public static function dismissReport(string $reportId, string $adminId): void
    {
        db()->prepare("UPDATE reports SET status = 'dismissed', actioned_by = ?, actioned_at = UTC_TIMESTAMP() WHERE id = ?")
            ->execute([$adminId, $reportId]);
        auditLog('report.dismissed', 'report', $reportId, ['admin' => $adminId]);
    }

    /**
     * Block a user. Returns the block expiry (null = permanent).
     */
    public static function blockUser(string $userId, string $adminId, ?int $days = null, string $reason = ''): ?string
    {
        $until = $days ? gmdate('Y-m-d H:i:s', time() + $days * 86400) : null;
        db()->prepare('UPDATE profiles SET is_blocked = 1, blocked_until = ? WHERE user_id = ?')
            ->execute([$until, $userId]);
        auditLog('user.blocked', 'user', $userId, [
            'admin' => $adminId,
            'until' => $until,
            'reason' => substr($reason, 0, 500),
        ]);
        logInfo('User blocked', ['user_id' => $userId, 'admin' => $adminId, 'until' => $until]);
        return $until;
    }

    /**
     * Unblock a user.
     */
    public static function unblockUser(string $userId, string $adminId): void
    {
        db()->prepare('UPDATE profiles SET is_blocked = 0, blocked_until = NULL WHERE user_id = ?')
            ->execute([$userId]);
        auditLog('user.unblocked', 'user', $userId, ['admin' => $adminId]);
        logInfo('User unblocked', ['user_id' => $userId, 'admin' => $adminId]);
    }

    /**
     * Set a user's role. Only valid roles allowed.
     */
    public static function setRole(string $userId, string $role, string $adminId): void
    {
        $valid = ['member', 'guardian', 'matchmaker', 'admin'];
        if (!in_array($role, $valid, true)) {
            throw new InvalidArgumentException('Invalid role.');
        }
        // Prevent demoting the last admin.
        if ($role !== 'admin') {
            $count = (int)db()->query("SELECT COUNT(*) FROM users WHERE is_admin = 1 AND id != " . db()->quote($userId))->fetchColumn();
            $isTargetAdmin = (bool)db()->query("SELECT is_admin FROM users WHERE id = " . db()->quote($userId))->fetchColumn();
            if ($isTargetAdmin && $count === 0) {
                throw new RuntimeException('Cannot demote the last admin.');
            }
        }
        db()->prepare('UPDATE users SET role = ?, is_admin = ? WHERE id = ?')
            ->execute([$role, $role === 'admin' ? 1 : 0, $userId]);
        auditLog('user.role_changed', 'user', $userId, ['admin' => $adminId, 'role' => $role]);
    }
}
