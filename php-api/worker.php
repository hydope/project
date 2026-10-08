<?php
// ─── Background worker ───────────────────────────────────────────────────────
// Processes jobs from the queue. Run via cron every minute:
//   * * * * * php /path/to/php-api/worker.php >> /tmp/worker.log 2>&1
//
// Each run claims up to 10 jobs. Handlers are registered below.

declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/logger.php';
require __DIR__ . '/lib/db.php';
require __DIR__ . '/lib/JobQueue.php';
require __DIR__ . '/lib/mail.php';

// Ensure the jobs table exists.
try {
    db()->exec(
        "CREATE TABLE IF NOT EXISTS jobs (
            id CHAR(36) NOT NULL PRIMARY KEY,
            type VARCHAR(60) NOT NULL,
            payload JSON NOT NULL,
            status VARCHAR(16) NOT NULL DEFAULT 'pending',
            attempts INT NOT NULL DEFAULT 0,
            run_at DATETIME NOT NULL,
            last_error VARCHAR(500) DEFAULT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            started_at DATETIME DEFAULT NULL,
            finished_at DATETIME DEFAULT NULL,
            KEY idx_jobs_claim (status, run_at, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
} catch (Throwable $e) {
    logError('Worker: jobs table creation failed', ['error' => $e->getMessage()]);
    exit(1);
}

// ── Job handlers ─────────────────────────────────────────────────────────────
$handlers = [
    'send_email' => function (array $payload): void {
        $to = (string)($payload['to'] ?? '');
        $subject = (string)($payload['subject'] ?? '');
        $body = (string)($payload['body'] ?? '');
        if (!$to || !$subject) {
            throw new RuntimeException('send_email: missing to/subject');
        }
        sendMail($to, $subject, $body);
    },
    'notify_match' => function (array $payload): void {
        require_once __DIR__ . '/lib/NotificationService.php';
        NotificationService::matchCreated(
            (string)($payload['user_id'] ?? ''),
            (string)($payload['other_name'] ?? 'Someone')
        );
    },
];

// ── Main loop ────────────────────────────────────────────────────────────────
$processed = 0;
$maxJobs = 10;

while ($processed < $maxJobs) {
    $job = JobQueue::claim();
    if (!$job) break;

    $handler = $handlers[$job['type']] ?? null;
    if (!$handler) {
        JobQueue::fail($job['id'], "Unknown job type: {$job['type']}", false);
        logWarn('Worker: unknown job type', ['type' => $job['type'], 'id' => $job['id']]);
        continue;
    }

    try {
        $handler($job['payload']);
        JobQueue::complete($job['id']);
        logInfo('Worker: job done', ['type' => $job['type'], 'id' => $job['id']]);
    } catch (Throwable $e) {
        JobQueue::fail($job['id'], $e->getMessage(), true);
        logError('Worker: job failed', [
            'type' => $job['type'],
            'id' => $job['id'],
            'error' => $e->getMessage(),
        ]);
    }
    $processed++;
}

logInfo('Worker: run complete', ['processed' => $processed]);
