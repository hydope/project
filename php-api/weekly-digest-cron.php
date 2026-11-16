<?php
// Weekly digest cron — sends the "this week on Shia Rishta" email to members
// who opted in, and only when they actually have new activity.
//
// Route: .github/workflows/weekly-digest.yml curls this file every Sunday
// 08:00 UTC with X-Seeder-Cron-Key (the same key the seeder/blog crons use).
// The digest toggle is honest about this: Settings promises the digest goes
// out on Sundays, only when there is new activity — and that is exactly the
// gate here. No activity in the past 7 days → no email, ever.
//
// Prefs: profiles.notification_prefs JSON; missing/NULL = the defaults
// (all email toggles on). The digest uses emailWeeklyDigest; a member who
// turned it off never receives one. The toggle lives in Settings →
// Notifications and is persisted server-side (see profileUpdate()).

declare(strict_types=1);

require __DIR__ . '/lib/db.php';
require __DIR__ . '/lib/mail.php';
require __DIR__ . '/lib/NotificationService.php';

// Same shared cron key as the seeder and blog crons.
$expected = getenv('SEEDER_CRON_KEY');
if (!is_string($expected) || $expected === '') {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'cron key not configured']);
    exit;
}
$provided = $_SERVER['HTTP_X_SEEDER_CRON_KEY'] ?? '';
if (!hash_equals($expected, $provided)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'forbidden']);
    exit;
}

try {
    // Recipients: verified members whose digest pref is on (NULL = default
    // on) and who are not seeded/test/admin.
    $recipients = db()->query(
        "SELECT u.id, u.email, u.display_name
           FROM users u
           JOIN profiles p ON p.user_id = u.id
          WHERE u.email_verified = 1
            AND u.is_admin = 0 AND u.is_test = 0
            AND p.is_seeded = 0
            AND (p.notification_prefs IS NULL
                 OR JSON_EXTRACT(p.notification_prefs, '$.emailWeeklyDigest') IS NULL
                 OR JSON_EXTRACT(p.notification_prefs, '$.emailWeeklyDigest') = true)"
    )->fetchAll();

    $sent = 0;
    $skipped = 0;
    $failed = 0;
    foreach ($recipients as $member) {
        $uid = (string)$member['id'];
        $email = (string)($member['email'] ?? '');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $skipped++;
            continue;
        }
        // Activity in the past 7 days: notifications addressed to the member.
        // No rows → no digest (an empty digest is spam, not a feature).
        $st = db()->prepare(
            "SELECT type, title, body, created_at FROM notifications
              WHERE user_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
              ORDER BY created_at DESC LIMIT 10"
        );
        $st->execute([$uid]);
        $items = $st->fetchAll();
        if (!$items) {
            $skipped++;
            continue;
        }
        $name = trim((string)($member['display_name'] ?? '')) ?: 'there';
        $lines = [];
        foreach ($items as $it) {
            $title = trim((string)($it['title'] ?? ''));
            $when = date('D M j', strtotime((string)($it['created_at'] ?? 'now')));
            if ($title !== '') $lines[] = "- {$title} ({$when})";
        }
        $subject = 'Your week on Shia Rishta';
        $body = "Assalamu alaikum {$name},\n\n"
            . "Here is what happened on your Shia Rishta profile this week:\n\n"
            . implode("\n", $lines)
            . "\n\nSee your full activity: https://shiarishta.com/dashboard\n\n"
            . "You receive this weekly summary because you turned on the weekly digest in Settings → Notifications. "
            . "Turn it off there any time.\n\n"
            . "— Shia Rishta";
        try {
            mailSend(['to' => $email, 'subject' => $subject, 'text' => $body]);
            $sent++;
        } catch (Throwable) {
            $failed++;
        }
    }
    // ── Guest lead alerts (2026-11-15) ──────────────────────────────────
    // Visitors who left an email instead of registering get one Sunday
    // email when new REAL profiles joined that week (city-matched when
    // the lead gave a city). Same honesty gate as the member digest: no
    // new profiles → no email. Failures here never break the digest.
    $leadStats = ['sent' => 0, 'skipped' => 0, 'failed' => 0];
    try {
        $newProfiles = db()->query(
            "SELECT p.display_name, p.city, p.country
               FROM profiles p
               JOIN users u ON u.id = p.user_id
              WHERE u.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                AND u.email_verified = 1
                AND u.is_admin = 0 AND u.is_test = 0
                AND p.is_seeded = 0
                AND p.visibility <> 'private'
                AND p.display_name <> ''
              ORDER BY u.created_at DESC
              LIMIT 25"
        )->fetchAll();
        if ($newProfiles) {
            $leads = db()->query(
                'SELECT email, city, unsub_token FROM guest_leads WHERE unsubscribed = 0'
            )->fetchAll();
            foreach ($leads as $lead) {
                $leadEmail = (string)($lead['email'] ?? '');
                if (!filter_var($leadEmail, FILTER_VALIDATE_EMAIL)) { $leadStats['skipped']++; continue; }
                $leadCity = trim((string)($lead['city'] ?? ''));
                $matches = $newProfiles;
                if ($leadCity !== '') {
                    $matches = array_values(array_filter($newProfiles, static function ($p) use ($leadCity) {
                        return strcasecmp(trim((string)($p['city'] ?? '')), $leadCity) === 0;
                    }));
                }
                if (!$matches) { $leadStats['skipped']++; continue; }
                $lines = [];
                foreach (array_slice($matches, 0, 6) as $p) {
                    $place = trim((string)($p['city'] ?? '') . ', ' . (string)($p['country'] ?? ''), ', ');
                    $lines[] = '- ' . (string)$p['display_name'] . ($place !== '' ? " ({$place})" : '');
                }
                $n = count($matches);
                $subject = $n === 1 ? 'A new member joined Shia Rishta this week' : "{$n} new members joined Shia Rishta this week";
                $unsub = 'https://shiarishta.com/api/leads/unsubscribe?e=' . urlencode($leadEmail) . '&t=' . urlencode((string)$lead['unsub_token']);
                $body = "Assalamu alaikum,\n\n"
                    . "New Shia Rishta members joined this week:\n\n"
                    . implode("\n", $lines)
                    . "\n\nBrowse all profiles: https://shiarishta.com/profiles/\n"
                    . "Create your free profile: https://shiarishta.com/auth/register\n\n"
                    . "You asked for new-profile alerts on shiarishta.com. Unsubscribe any time: {$unsub}\n\n"
                    . "— Shia Rishta";
                try {
                    mailSend(['to' => $leadEmail, 'subject' => $subject, 'text' => $body]);
                    db()->prepare('UPDATE guest_leads SET last_sent_at = NOW() WHERE email = ?')->execute([$leadEmail]);
                    $leadStats['sent']++;
                } catch (Throwable) {
                    $leadStats['failed']++;
                }
            }
        }
    } catch (Throwable $e) {
        error_log('[weekly-digest] lead alerts failed: ' . $e->getMessage());
    }

    echo json_encode(['ok' => true, 'sent' => $sent, 'skipped' => $skipped, 'failed' => $failed, 'leads' => $leadStats]);
} catch (Throwable $e) {
    error_log('[weekly-digest] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'digest failed']);
}
