<?php
// Site behaviour settings — values an admin can change from the portal
// (Admin → Settings) with NO code change and NO deploy. Stored in
// app_settings like the AI and scheduler settings, encrypted at rest.
//
// Why this exists (Syed's order, 2026-11-23): flipping the public profile
// listing order took a code change plus a ~35-minute deploy. Behaviour
// choices like that belong in the admin portal; code keeps only the
// default and the validation.

/** Raw decrypted value of one app_settings row, '' when unset/unreadable. */
function siteSettingRaw(string $key): string
{
    try {
        $stmt = db()->prepare('SELECT value_enc FROM app_settings WHERE setting_key = ? LIMIT 1');
        $stmt->execute([$key]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!is_array($row)) return '';
        $raw = decAtRest($row['value_enc'] ?? null);
        return is_string($raw) ? trim($raw) : '';
    } catch (Throwable $e) {
        error_log('[site-settings] read failed: ' . substr($e->getMessage(), 0, 120));
        return '';
    }
}

/**
 * Public profile listing order.
 *   'latest'     — newest first, seeded profiles mixed in by recency
 *                  (Syed's order, 2026-11-23; the default).
 *   'real_first' — real members first, seeded after, newest-first within
 *                  each group (the 2026-10-12 order).
 * Anything unreadable or unrecognised falls back to 'latest'.
 */
function profileListingOrder(): string
{
    static $cached = null;
    if ($cached !== null) return $cached;
    $value = siteSettingRaw('profile_listing_order');
    $cached = ($value === 'real_first') ? 'real_first' : 'latest';
    return $cached;
}

/** ORDER BY fragment for the public listings, per profileListingOrder(). */
function profileListingOrderBy(): string
{
    return profileListingOrder() === 'real_first'
        ? 'p.is_seeded ASC, p.created_at DESC'
        : 'p.created_at DESC';
}
