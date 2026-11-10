<?php
// ─── Notification service ────────────────────────────────────────────────────
// Centralized notification creation. Replaces scattered notifyUser() calls.
//
// Email mirror (2026-11-09): the Settings toggles used to promise emails that
// were never sent — this class only inserted in-app rows. maybeEmail() sends
// a real email via mailSend() when the recipient's STORED pref allows it.
// Prefs live in profiles.notification_prefs (JSON); a missing column or row
// means "defaults" (all email on except nothing — see defaultPrefs), never
// a 500. Seeded and test accounts never get mail: their addresses are fake.

declare(strict_types=1);

class NotificationService
{
    /** Every toggle Settings knows about. New toggles must be added here AND in Settings.jsx. */
    public const PREF_KEYS = [
        'emailMessages', 'emailMatches', 'emailInterests', 'emailWeeklyDigest',
        'pushMessages', 'pushMatches', 'pushProfileViews',
    ];

    /** Defaults for a member who never touched the toggles — matches Settings.jsx. */
    public static function defaultPrefs(): array
    {
        return notificationPrefsDefaults();
    }

    /** Stored prefs merged over the defaults. Unknown keys are dropped. */
    public static function prefsFor(string $userId): array
    {
        $prefs = self::defaultPrefs();
        try {
            $stmt = db()->prepare('SELECT notification_prefs FROM profiles WHERE user_id = ? LIMIT 1');
            $stmt->execute([$userId]);
            $row = $stmt->fetch();
            $stored = json_decode((string)($row['notification_prefs'] ?? ''), true);
            if (is_array($stored)) {
                foreach (self::PREF_KEYS as $k) {
                    if (array_key_exists($k, $stored)) {
                        $prefs[$k] = !empty($stored[$k]);
                    }
                }
            }
        } catch (Throwable) {
            // Column not migrated yet — defaults. Never fail the notification.
        }
        return $prefs;
    }

    /**
     * Send a notification email if the recipient's stored pref allows it.
     *
     * $event is 'interest' | 'match' | 'message'. Best-effort by design: a
     * mail failure must never fail the notification itself, and a member who
     * turned the toggle off hears nothing. No email is ever sent for an
     * event with no toggle (there is no email toggle for profile views —
     * the views toggle is push-only and there is no push infrastructure).
     */
    public static function maybeEmail(string $userId, string $event, string $subject, string $text): void
    {
        $prefKey = ['interest' => 'emailInterests', 'match' => 'emailMatches', 'message' => 'emailMessages'][$event] ?? null;
        if ($prefKey === null) return;
        try {
            if (empty(self::prefsFor($userId)[$prefKey])) return;
            $em = db()->prepare('SELECT email, is_test FROM users WHERE id = ? LIMIT 1');
            $em->execute([$userId]);
            $row = $em->fetch();
            $to = trim((string)($row['email'] ?? ''));
            if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) return;
            // Seeded and test accounts carry fake addresses (seeded-…@…);
            // mailing them would bounce into the operator's inbox.
            if (!empty($row['is_test']) || str_starts_with($to, 'seeded-')) return;
            mailSend([
                'to' => $to,
                'subject' => $subject,
                'text' => $text . "\n\n— Shia Rishta\nManage these emails in Settings → Notifications: https://shiarishta.com/settings?tab=notifications",
            ]);
        } catch (Throwable $e) {
            error_log('[api] notification email failed: ' . substr($e->getMessage(), 0, 120));
        }
    }

    /**
     * Create a notification for a user.
     */
    public static function send(string $userId, string $type, string $title, ?string $body = null, ?string $refId = null): void
    {
        db()->prepare(
            'INSERT INTO notifications (id, user_id, type, title, body, ref_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())'
        )->execute([uuid(), $userId, $type, $title, $body, $refId]);

        $event = ['interest' => 'interest', 'match' => 'match', 'message' => 'message'][$type] ?? null;
        if ($event !== null) {
            self::maybeEmail($userId, $event, (string)$title, (string)($body ?? ''));
        }
    }

    /**
     * Notify on new interest (someone likes your profile).
     */
    public static function interestReceived(string $toUserId, string $fromName): void
    {
        self::send($toUserId, 'interest', 'New interest', "$fromName is interested in your profile.");
    }

    /**
     * Notify on mutual match.
     */
    public static function matchCreated(string $userId, string $otherName): void
    {
        self::send($userId, 'match', "You're a match!", "You and $otherName are now matched. Say salaam!");
    }

    /**
     * Notify on new message (only if the user isn't currently in the chat).
     */
    public static function messageReceived(string $toUserId, string $fromName): void
    {
        self::send($toUserId, 'message', 'New message', "$fromName sent you a message.");
    }
}
