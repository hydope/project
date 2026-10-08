<?php
// ─── Job queue ───────────────────────────────────────────────────────────────
// Database-backed background jobs. Replaces synchronous email/notification
// sends that block API responses.
//
// Usage:
//   JobQueue::push('send_email', ['to' => $email, 'subject' => $s, 'body' => $b]);
//   JobQueue::push('notify_match', ['user_id' => $uid, 'other_name' => $name]);
//
// Worker (cron every minute):
//   * * * * * php /path/to/php-api/worker.php
//
// Jobs are claimed with SELECT ... FOR UPDATE SKIP LOCKED so multiple
// workers don't double-process.

declare(strict_types=1);

class JobQueue
{
    /**
     * Enqueue a job. Returns the job ID.
     */
    public static function push(string $type, array $payload = [], int $delaySeconds = 0): string
    {
        $id = uuid();
        $runAt = gmdate('Y-m-d H:i:s', time() + $delaySeconds);
        db()->prepare(
            'INSERT INTO jobs (id, type, payload, status, run_at, created_at)
             VALUES (?, ?, ?, "pending", ?, UTC_TIMESTAMP())'
        )->execute([$id, $type, json_encode($payload, JSON_UNESCAPED_UNICODE), $runAt]);
        return $id;
    }

    /**
     * Claim the next pending job (for workers). Returns null if none.
     */
    public static function claim(): ?array
    {
        $pdo = db();
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare(
                'SELECT * FROM jobs
                 WHERE status = "pending" AND run_at <= UTC_TIMESTAMP()
                 ORDER BY created_at ASC LIMIT 1
                 FOR UPDATE SKIP LOCKED'
            );
            $stmt->execute();
            $job = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$job) {
                $pdo->commit();
                return null;
            }
            $pdo->prepare('UPDATE jobs SET status = "running", started_at = UTC_TIMESTAMP() WHERE id = ?')
                ->execute([$job['id']]);
            $pdo->commit();
            $job['payload'] = json_decode((string)$job['payload'], true) ?? [];
            return $job;
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

    public static function complete(string $id): void
    {
        db()->prepare('UPDATE jobs SET status = "done", finished_at = UTC_TIMESTAMP() WHERE id = ?')
            ->execute([$id]);
    }

    public static function fail(string $id, string $error, bool $retry = true): void
    {
        if ($retry) {
            // Exponential backoff: 1min, 5min, 25min, then dead.
            $job = db()->prepare('SELECT attempts FROM jobs WHERE id = ?')->execute([$id]);
            $attempts = (int)($job->fetchColumn() ?? 0);
            if ($attempts < 3) {
                $delay = [60, 300, 1500][$attempts] ?? 3600;
                $runAt = gmdate('Y-m-d H:i:s', time() + $delay);
                db()->prepare('UPDATE jobs SET status = "pending", attempts = attempts + 1, run_at = ?, last_error = ? WHERE id = ?')
                    ->execute([$runAt, substr($error, 0, 500), $id]);
                return;
            }
        }
        db()->prepare('UPDATE jobs SET status = "failed", last_error = ?, finished_at = UTC_TIMESTAMP() WHERE id = ?')
            ->execute([substr($error, 0, 500), $id]);
    }
}
