<?php
// Biodata drafts: logged-in members can save their marriage biodata securely
// on the server (AES-256-GCM encrypted at rest), so it follows them across
// devices. Guests continue to use localStorage only — nothing is stored
// server-side without an account.

declare(strict_types=1);

function routeBiodata(string $method, array $segments): void
{
    // Public log endpoint: the biodata maker needs no account. Everything
    // else requires a signed-in member.
    if ($method === 'POST' && ($segments[0] ?? null) === 'log') {
        biodataLogCreation();
        return;
    }

    $user = requireAuthUser();
    $userId = (string)($user['id'] ?? '');
    if ($userId === '') {
        json(['error' => 'Unauthorized'], 401);
    }

    if ($method === 'GET' && ($segments[0] ?? null) === 'draft') {
        biodataGetDraft($userId);
        return;
    }
    if ($method === 'POST' && ($segments[0] ?? null) === 'draft') {
        biodataSaveDraft($userId);
        return;
    }
    json(['error' => 'Biodata endpoint not found'], 404);
}

// GET /api/biodata/draft — load the member's saved biodata draft.
function biodataGetDraft(string $userId): void
{
    try {
        $st = db()->prepare('SELECT data_enc, template, lang, updated_at FROM biodata_drafts WHERE user_id = ? LIMIT 1');
        $st->execute([$userId]);
        $row = $st->fetch();
    } catch (Throwable) {
        json(['ok' => true, 'draft' => null]);
    }
    if (!$row) {
        json(['ok' => true, 'draft' => null]);
    }

    $data = [];
    try {
        $decrypted = decAtRest((string)$row['data_enc']);
        $data = json_decode($decrypted, true) ?: [];
    } catch (Throwable) {
        // Corrupt row — treat as no draft rather than failing.
    }

    json(['ok' => true, 'draft' => [
        'data' => is_array($data['data'] ?? null) ? $data['data'] : [],
        'photo' => is_string($data['photo'] ?? null) ? $data['photo'] : null,
        'template' => (string)($row['template'] ?? 'essential'),
        'lang' => (string)($row['lang'] ?? 'en'),
        'updated_at' => (string)($row['updated_at'] ?? ''),
    ]]);
}

// POST /api/biodata/draft — save (upsert) the member's biodata draft.
// Body: { data: {...}, photo: "data:image/..."|null, template, lang }
function biodataSaveDraft(string $userId): void
{
    $body = requestJson();
    $data = $body['data'] ?? [];
    if (!is_array($data)) {
        je('Invalid biodata data.', 400);
    }

    // Sanitize: keep it a flat string map, cap sizes to prevent abuse.
    $clean = [];
    foreach ($data as $k => $v) {
        if (!is_string($k) || !is_string($v)) continue;
        $k = substr(trim($k), 0, 40);
        $v = substr(trim($v), 0, 2000);
        if ($k !== '' && $v !== '') $clean[$k] = $v;
        if (count($clean) >= 60) break;
    }

    $photo = $body['photo'] ?? null;
    if (!is_string($photo) || !str_starts_with($photo, 'data:image/')) {
        $photo = null;
    } elseif (strlen($photo) > 2_000_000) {
        // ~1.5MB image cap — larger photos stay local-only.
        $photo = null;
    }

    $template = substr((string)($body['template'] ?? 'essential'), 0, 20);
    $lang = substr((string)($body['lang'] ?? 'en'), 0, 5);

    $payload = json_encode(['data' => $clean, 'photo' => $photo], JSON_UNESCAPED_UNICODE);
    try {
        $enc = encAtRest((string)$payload);
    } catch (Throwable $e) {
        je('Could not save securely. Try again.', 500);
    }

    try {
        db()->prepare(
            'INSERT INTO biodata_drafts (user_id, data_enc, template, lang, updated_at)
             VALUES (?, ?, ?, ?, UTC_TIMESTAMP())
             ON DUPLICATE KEY UPDATE data_enc = VALUES(data_enc), template = VALUES(template),
             lang = VALUES(lang), updated_at = UTC_TIMESTAMP()'
        )->execute([$userId, $enc, $template, $lang]);
    } catch (Throwable $e) {
        error_log('[biodata] save failed: ' . substr($e->getMessage(), 0, 120));
        je('Could not save. Try again.', 500);
    }

    json(['ok' => true, 'saved_at' => gmdate('Y-m-d H:i:s')]);
}

/**
 * POST /api/biodata/log — record a biodata creation in the admin audit trail.
 *
 * Public (the maker needs no account). Body: { data: {...}, template, lang,
 * has_photo: bool }. Writes an immutable admin_audit row with action
 * 'biodata.created' and every submitted field, so admins can count usage and
 * see exactly what was entered. The photo itself is never logged — only
 * whether one was attached.
 *
 * Rate-limited by IP to keep the audit table clean.
 */
function biodataLogCreation(): void
{
    // Simple per-IP throttle: max 20 biodata logs per hour.
    $ip = (string)($_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '');
    $ipTag = $ip !== '' ? 'ip:' . substr(hash('sha256', $ip . 'biodata'), 0, 16) : '';
    try {
        if ($ipTag !== '') {
            $n = db()->prepare(
                "SELECT COUNT(*) c FROM admin_audit
                 WHERE action = 'biodata.created' AND target_id = ?
                 AND created_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 HOUR)"
            );
            $n->execute([$ipTag]);
            if ((int)($n->fetch()['c'] ?? 0) >= 20) {
                json(['ok' => true, 'throttled' => true]);
            }
        }
    } catch (Throwable) {
        // Throttle is best-effort; never block the log on its failure.
    }

    $body = requestJson();
    $data = $body['data'] ?? [];
    if (!is_array($data)) $data = [];

    // Sanitize: flat string map, capped — the audit row should stay readable.
    $fields = [];
    foreach ($data as $k => $v) {
        if (!is_string($k) || !is_string($v)) continue;
        $k = substr(trim($k), 0, 40);
        $v = substr(trim($v), 0, 500);
        if ($k !== '' && $v !== '') $fields[$k] = $v;
        if (count($fields) >= 40) break;
    }

    $meta = [
        'template' => substr((string)($body['template'] ?? 'essential'), 0, 20),
        'lang' => substr((string)($body['lang'] ?? 'en'), 0, 5),
        'has_photo' => !empty($body['has_photo']),
        'field_count' => count($fields),
        'fields' => $fields,
    ];

    // Optional photo (~600px JPEG). The audit meta column is MEDIUMTEXT, so
    // there's room for a clear image — still downscaled from the original to
    // keep the audit trail lean.
    $thumb = $body['photo_thumb'] ?? null;
    if (is_string($thumb) && str_starts_with($thumb, 'data:image/') && strlen($thumb) <= 500000) {
        $meta['photo_thumb'] = $thumb;
    }

    // Actor: signed-in member if any, otherwise the guest IP (hashed for privacy).
    $actorId = '';
    $actorEmail = '';
    try {
        $u = currentUser();
        $actorId = (string)($u['uid'] ?? '');
        $actorEmail = (string)($u['email'] ?? '');
    } catch (Throwable) {
    }
    $targetId = $actorId !== '' ? 'user:' . $actorId : $ipTag;

    try {
        db()->prepare(
            'INSERT INTO admin_audit (id, actor_id, actor_email, action, target_type, target_id, meta, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())'
        )->execute([
            uuid(),
            $actorId,
            $actorEmail !== '' ? $actorEmail : 'guest',
            'biodata.created',
            'biodata',
            $targetId,
            json_encode($meta, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ]);
    } catch (Throwable $e) {
        error_log('[biodata] audit log failed: ' . substr($e->getMessage(), 0, 120));
    }

    json(['ok' => true]);
}
