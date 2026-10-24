<?php
/**
 * Daily recovery-email drip for incomplete signups (2026-10-24).
 *
 * Called by GitHub Actions cron via:
 *   curl -H "X-Blog-Cron-Key: <BLOG_CRON_KEY>" https://shiarishta.com/api/recovery-cron.php
 *
 * Two drips. Per Syed's order (2026-10-24): reminders KEEP GOING until the
 * member finishes — no hard cap. After the initial sequence, a weekly
 * reminder repeats indefinitely until verified / complete. A member who
 * verifies mid-drip automatically stops receiving verify emails (the query
 * filters email_verified = 0) and starts receiving complete emails if their
 * profile is still incomplete. A member who completes their profile stops
 * receiving complete emails. Sends are recorded in recovery_emails.
 *
 * VERIFY drip (email_verified = 0):
 *   verify_1 — sent on first run if never sent ("Welcome back, verify your email")
 *   verify_2 — 1+ day after verify_1 ("Your profile is waiting")
 *   verify_3 — 2+ days after verify_2 ("New members joined this week")
 *   verify_4 — 4+ days after verify_3 ("Last call — your account stays hidden")
 *   verify_weekly — every 7+ days after verify_4, until verified
 *
 * COMPLETE drip (verified but no bio AND no location):
 *   complete_1 — sent on first run if never sent ("Finish your profile in 2 minutes")
 *   complete_2 — 2+ days after complete_1 ("You're almost there")
 *   complete_3 — 4+ days after complete_2 ("Last step to be seen")
 *   complete_weekly — every 7+ days after complete_3, until complete
 */

header('Content-Type: application/json');

// Never return a blank 500: convert any fatal error into a JSON error so the
// cron workflow can report what actually went wrong (2026-10-24 diagnosis).
set_exception_handler(function (Throwable $e): void {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => get_class($e) . ': ' . $e->getMessage()]);
    exit;
});

$envFile = __DIR__ . '/.env';
if (file_exists($envFile)) {
    foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $l) {
        $l = trim($l);
        if ($l === '' || $l[0] === '#') continue;
        if (strpos($l, '=') !== false) {
            [$k, $v] = explode('=', $l, 2);
            putenv(trim($k) . '=' . trim($v));
        }
    }
}

$provided = $_SERVER['HTTP_X_BLOG_CRON_KEY'] ?? '';
$expected = getenv('BLOG_CRON_KEY') ?: '';
if ($expected === '' || !hash_equals($expected, $provided)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Forbidden']);
    exit;
}

require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/db.php';
require __DIR__ . '/lib/util.php';
require __DIR__ . '/lib/mail.php';

// Self-sufficient: this standalone script does NOT go through index.php, so
// migrateSchema() never runs for it. Ensure our table exists (idempotent).
// If the migration already ran, this is a no-op.
try {
    db()->exec("CREATE TABLE IF NOT EXISTS recovery_emails (
      id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id       CHAR(36)     NOT NULL,
      stage         VARCHAR(32)  NOT NULL,
      sent_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY idx_re_user_stage (user_id, stage),
      KEY idx_re_sent (sent_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'recovery_emails table setup failed: ' . $e->getMessage()]);
    exit;
}

$real = "u.email NOT LIKE 'seeded-%@shiarishta.com' AND u.is_admin = 0 AND u.is_test = 0";

// --- Email templates -------------------------------------------------------
function verifyUrl(string $userId): string
{
    $token = issueVerificationToken($userId);
    return 'https://shiarishta.com/verify/' . $token;
}

$verifyTemplates = [
    'verify_1' => [
        'subject' => 'Welcome back — one tap to verify your Shia Rishta account',
        'body' => fn($name, $url) => "Assalamu Alaikum {$name},\n\nYou started creating your Shia Rishta account but haven't verified your email yet. One tap finishes it:\n\n{$url}\n\nThen complete your profile in 2 minutes and start being seen by serious Shia families.\n\nThis link expires in 72 hours.",
    ],
    'verify_2' => [
        'subject' => 'Your Shia Rishta profile is waiting',
        'body' => fn($name, $url) => "Assalamu Alaikum {$name},\n\nYour Shia Rishta account is still unverified, which means your profile is hidden from other members. Verify now and it becomes visible:\n\n{$url}\n\nThis link expires in 72 hours.",
    ],
    'verify_3' => [
        'subject' => 'New members joined Shia Rishta this week — don\'t miss out',
        'body' => fn($name, $url) => "Assalamu Alaikum {$name},\n\nNew Shia members joined this week and are already being seen. Your profile is ready to go — it just needs one verification tap:\n\n{$url}\n\nThis link expires in 72 hours.",
    ],
    'verify_4' => [
        'subject' => 'Your Shia Rishta account is still waiting',
        'body' => fn($name, $url) => "Assalamu Alaikum {$name},\n\nYour Shia Rishta account is still unverified, so your profile stays hidden from other members. One tap fixes it:\n\n{$url}\n\nThis link expires in 72 hours. After that you can request a fresh link from the login page any time.",
    ],
    'verify_weekly' => [
        'subject' => 'Quick reminder — verify your Shia Rishta account',
        'body' => fn($name, $url) => "Assalamu Alaikum {$name},\n\nJust a quick reminder: your Shia Rishta account is waiting for one verification tap. Once verified, your profile becomes visible to Shia families:\n\n{$url}\n\nThis link expires in 72 hours.",
    ],
];

$completeTemplates = [
    'complete_1' => [
        'subject' => 'Finish your Shia Rishta profile in 2 minutes',
        'body' => fn($name) => "Assalamu Alaikum {$name},\n\nYour email is verified — you're almost there. Your profile is missing just a location and a short bio, and without them other members can't find you.\n\nFinish in 2 minutes: https://shiarishta.com/onboard\n\nThat's all it takes to start appearing in searches and on the homepage.",
    ],
    'complete_2' => [
        'subject' => 'You\'re almost there — one more step on Shia Rishta',
        'body' => fn($name) => "Assalamu Alaikum {$name},\n\nYour Shia Rishta profile is still missing a location and bio. Members search by city first — without one, you're invisible in the results that matter most.\n\nAdd them now (2 minutes): https://shiarishta.com/onboard",
    ],
    'complete_3' => [
        'subject' => 'Last step to be seen on Shia Rishta',
        'body' => fn($name) => "Assalamu Alaikum {$name},\n\nYour profile has been waiting. Add your city and a line about yourself and you'll start appearing to Shia families looking for someone like you:\n\nhttps://shiarishta.com/onboard\n\nIt takes 2 minutes.",
    ],
    'complete_weekly' => [
        'subject' => 'Quick reminder — finish your Shia Rishta profile',
        'body' => fn($name) => "Assalamu Alaikum {$name},\n\nQuick reminder: your Shia Rishta profile is still missing a location and bio, so other members can't find you yet. Two minutes finishes it:\n\nhttps://shiarishta.com/onboard",
    ],
];

// --- Helpers ---------------------------------------------------------------
function sentStages(string $userId): array
{
    $rows = db()->prepare('SELECT stage, sent_at FROM recovery_emails WHERE user_id = ?');
    $rows->execute([$userId]);
    $out = [];
    foreach ($rows->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $out[$r['stage']] = $r['sent_at'];
    }
    return $out;
}

function recordSent(string $userId, string $stage): void
{
    // Weekly stages repeat: upsert so the row always carries the latest send.
    db()->prepare(
        'INSERT INTO recovery_emails (user_id, stage) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE sent_at = UTC_TIMESTAMP()'
    )->execute([$userId, $stage]);
}

function daysSince(?string $sentAt): float
{
    if (!$sentAt) return 9999;
    return (time() - strtotime($sentAt)) / 86400;
}

// --- VERIFY drip -----------------------------------------------------------
$verifySent = 0;
$verifySkipped = 0;
$unverified = db()->query(
    "SELECT u.id, u.email, u.display_name FROM users u
     WHERE {$real} AND u.email_verified = 0
     ORDER BY u.created_at ASC"
)->fetchAll(PDO::FETCH_ASSOC);

foreach ($unverified as $u) {
    $sent = sentStages($u['id']);
    $next = null;
    $body = null;
    if (!isset($sent['verify_1'])) {
        $next = 'verify_1';
    } elseif (!isset($sent['verify_2']) && daysSince($sent['verify_1']) >= 1) {
        $next = 'verify_2';
    } elseif (!isset($sent['verify_3']) && daysSince($sent['verify_2']) >= 2) {
        $next = 'verify_3';
    } elseif (!isset($sent['verify_4']) && daysSince($sent['verify_3']) >= 4) {
        $next = 'verify_4';
    } elseif (isset($sent['verify_4']) && daysSince($sent['verify_weekly'] ?? $sent['verify_4']) >= 7) {
        // Persistent weekly reminder until verified (Syed's order 2026-10-24).
        $next = 'verify_weekly';
    }
    if (!$next) {
        $verifySkipped++;
        continue;
    }
    $tpl = $verifyTemplates[$next];
    $url = verifyUrl($u['id']);
    if (mailEnabled()) {
        mailSend([
            'to' => $u['email'],
            'subject' => $tpl['subject'],
            'text' => $tpl['body']($u['display_name'], $url),
        ]);
    }
    recordSent($u['id'], $next);
    $verifySent++;
}

// --- COMPLETE drip ---------------------------------------------------------
$completeSent = 0;
$completeSkipped = 0;
$incomplete = db()->query(
    "SELECT u.id, u.email, u.display_name FROM users u
     LEFT JOIN profiles p ON p.user_id = u.id
     WHERE {$real} AND u.email_verified = 1
       AND (p.bio IS NULL OR p.bio = '')
       AND (p.city IS NULL OR p.city = '')
     ORDER BY u.created_at ASC"
)->fetchAll(PDO::FETCH_ASSOC);

foreach ($incomplete as $u) {
    $sent = sentStages($u['id']);
    $next = null;
    if (!isset($sent['complete_1'])) {
        $next = 'complete_1';
    } elseif (!isset($sent['complete_2']) && daysSince($sent['complete_1']) >= 2) {
        $next = 'complete_2';
    } elseif (!isset($sent['complete_3']) && daysSince($sent['complete_2']) >= 4) {
        $next = 'complete_3';
    } elseif (isset($sent['complete_3']) && daysSince($sent['complete_weekly'] ?? $sent['complete_3']) >= 7) {
        // Persistent weekly reminder until complete (Syed's order 2026-10-24).
        $next = 'complete_weekly';
    }
    if (!$next) {
        $completeSkipped++;
        continue;
    }
    $tpl = $completeTemplates[$next];
    if (mailEnabled()) {
        mailSend([
            'to' => $u['email'],
            'subject' => $tpl['subject'],
            'text' => $tpl['body']($u['display_name']),
        ]);
    }
    recordSent($u['id'], $next);
    $completeSent++;
}

echo json_encode([
    'ok' => true,
    'verify' => ['sent' => $verifySent, 'skipped' => $verifySkipped, 'total_unverified' => count($unverified)],
    'complete' => ['sent' => $completeSent, 'skipped' => $completeSkipped, 'total_incomplete' => count($incomplete)],
]);
