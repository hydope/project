<?php
// ─── Notification service ────────────────────────────────────────────────────
// Centralized notification creation. Replaces scattered notifyUser() calls.

declare(strict_types=1);

class NotificationService
{
    /**
     * Create a notification for a user.
     */
    public static function send(string $userId, string $type, string $title, ?string $body = null, ?string $refId = null): void
    {
        db()->prepare(
            'INSERT INTO notifications (id, user_id, type, title, body, ref_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())'
        )->execute([uuid(), $userId, $type, $title, $body, $refId]);
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
