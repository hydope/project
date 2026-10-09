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
// ═══════════════════════════════════════════════════════════════════════════
//  AI CREDENTIAL — admin-configurable, encrypted at rest
// ═══════════════════════════════════════════════════════════════════════════
//
// Why this exists: the NVIDIA key came from a GitHub secret, so when it expired
// or was never set, the only remedy was a redeploy or shell access to the host
// to hand-edit .env. /admin/content can now set it directly.
//
// SECURITY MODEL — the important part:
//   · Encrypted at rest (AES-256-GCM via encAtRest()).
//   · NO endpoint returns a stored credential. GET returns presence, a source
//     label and a masked tail — enough to confirm a paste worked, not enough to
//     exfiltrate a live key from a browser.
//   · Every write is audit-logged with actor, timestamp and which fields moved.
//   · An admin can overwrite a credential; they cannot read one back.

/** Mask a credential for display: "nvapi-…4f2a". Never the middle. */
function aiMaskKey(string $key): string
{
    $key = trim($key);
    if ($key === '') return '';
    $tail = substr($key, -4);
    $prefix = str_starts_with($key, 'nvapi-') ? 'nvapi-' : substr($key, 0, 5);
    return $prefix . '…' . $tail;
}

/** Shared loader for the non-secret settings row. */
function aiSettingsRow(string $key): array
{
    $stmt = db()->prepare('SELECT value_enc, updated_at, last_status FROM app_settings WHERE setting_key = ? LIMIT 1');
    $stmt->execute([$key]);
    $row = $stmt->fetch();
    return is_array($row) ? $row : [];
}

/** GET /api/admin/ai-settings — status only, never the value. */
function adminAiSettingsStatus(): void
{
    $key = aiApiKey();
    $row = aiSettingsRow('nvidia_api_key');
    $modelRow = aiSettingsRow('nvidia_model');

    json([
        'available' => $key !== '',
        // 'admin-panel' | 'environment' | 'missing' — the single most useful
        // diagnostic: it tells the operator whether the paste took effect or
        // they are still relying on a (possibly empty) env var.
        'source' => aiApiKeySource(),
        'masked' => aiMaskKey($key),
        'model' => aiModel(),
        'modelOverridden' => ($modelRow['value_enc'] ?? null) !== null,
        'baseUrl' => (string)(getenv('NVIDIA_BASE_URL') ?: 'https://integrate.api.nvidia.com/v1'),
        'updatedAt' => $row['updated_at'] ?? null,
        'lastStatus' => $row['last_status'] ?? null,
    ]);
}

/** PUT /api/admin/ai-settings — set the key and/or the model. */
function adminAiSettingsUpdate(): void
{
    $admin = requireAdminUser();
    $body = requestJson();

    $wrote = [];

    if (array_key_exists('apiKey', $body)) {
        $key = trim((string)($body['apiKey'] ?? ''));
        if ($key === '') {
            // Explicit clear: fall back to the environment variable.
            db()->prepare('DELETE FROM app_settings WHERE setting_key = ?')->execute(['nvidia_api_key']);
            $wrote[] = 'apiKey-cleared';
        } else {
            // NVIDIA keys are nvapi-<64 hex>. Validating the shape catches
            // pasting the wrong thing (a GitHub PAT, a URL, a model id) before
            // it becomes a mysterious 401 at request time.
            if (!preg_match('/^nvapi-[A-Za-z0-9_\-]{20,}$/', $key)) {
                je('That does not look like an NVIDIA API key. It should start with "nvapi-".', 400);
            }
            $up = db()->prepare(
                'INSERT INTO app_settings (setting_key, value_enc, updated_by, updated_at)
                 VALUES (?, ?, ?, UTC_TIMESTAMP())
                 ON DUPLICATE KEY UPDATE value_enc = VALUES(value_enc), updated_by = VALUES(updated_by),
                                         updated_at = UTC_TIMESTAMP(), last_status = NULL'
            );
            $up->execute(['nvidia_api_key', encAtRest($key), $admin['uid']]);
            $wrote[] = 'apiKey';
        }
    }

    if (array_key_exists('model', $body)) {
        $model = trim((string)($body['model'] ?? ''));
        if ($model === '') {
            db()->prepare('DELETE FROM app_settings WHERE setting_key = ?')->execute(['nvidia_model']);
            $wrote[] = 'model-cleared';
        } else {
            if (!preg_match('#^[A-Za-z0-9._\-]+/[A-Za-z0-9._\-]+$#', $model)) {
                je('A model id looks like "vendor/model-name", e.g. moonshotai/kimi-k2-instruct.', 400);
            }
            $up = db()->prepare(
                'INSERT INTO app_settings (setting_key, value_enc, updated_by, updated_at)
                 VALUES (?, ?, ?, UTC_TIMESTAMP())
                 ON DUPLICATE KEY UPDATE value_enc = VALUES(value_enc), updated_by = VALUES(updated_by),
                                         updated_at = UTC_TIMESTAMP()'
            );
            $up->execute(['nvidia_model', encAtRest($model), $admin['uid']]);
            $wrote[] = 'model';
        }
    }

    if (!$wrote) {
        je('Nothing to save.', 400);
    }

    // Audit the FACT that a credential was rotated. Never the credential, and
    // not even its length — just which field moved.
    auditLog('ai.settings.updated', 'app_setting', 'nvidia', [
        'fields' => $wrote,
        'source' => aiApiKeySource(),
    ]);

    json(['ok' => true, 'updated' => $wrote, 'source' => aiApiKeySource()]);
}

/**
 * POST /api/admin/ai-settings/verify — live end-to-end check.
 *
 * Previously this hit GET /models, which only proves the credential is
 * accepted. That is NOT the same as "the assistant works": it was reporting
 * green while every real completion silently returned empty and the UI quietly
 * fell back to retrieved facts. The only meaningful check is the same request
 * the assistant actually makes.
 *
 * Reports HTTP status, elapsed time and a short error CLASS. The upstream body
 * is never returned: NVIDIA error payloads can echo back the Authorization
 * header, which would put a live credential into a browser-visible response.
 */
function adminAiSettingsVerify(): void
{
    requireAdminUser();

    $key = aiApiKey();
    if ($key === '') {
        json(['ok' => false, 'status' => 0, 'detail' => 'No credential configured. Add an API key first.']);
        return;
    }

    $base = rtrim((string)(getenv('NVIDIA_BASE_URL') ?: 'https://integrate.api.nvidia.com/v1'), '/');
    $model = aiModel();

    $payload = [
        'model' => $model,
        'messages' => [['role' => 'user', 'content' => 'Reply with the single word: OK']],
        // Reasoning models spend part of this budget on internal reasoning, so a
        // small cap can be exhausted before any visible answer is emitted —
        // which is exactly how "the API works but returns nothing" happens.
        // This mirrors aiComplete()'s defaults deliberately.
        'max_tokens' => (int)(getenv('NVIDIA_VERIFY_MAX_TOKENS') ?: 2000),
        'stream' => false,
        'temperature' => 0.0,
    ];

    $ch = curl_init($base . '/chat/completions');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 90,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $key,
            'Content-Type: application/json',
            'Accept: application/json',
        ],
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
    ]);

    $started = microtime(true);
    $body = curl_exec($ch);
    $elapsed = (int)round(microtime(true) - $started);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $err = curl_error($ch);
    curl_close($ch);

    $text = '';
    $finish = '';
    $reasoning = 0;
    if (is_string($body) && $body !== '') {
        $decoded = json_decode($body, true);
        $text = trim((string)($decoded['choices'][0]['message']['content'] ?? ''));
        $finish = (string)($decoded['choices'][0]['finish_reason'] ?? '');
        $reasoning = (int)($decoded['usage']['completion_tokens_details']['reasoning_tokens'] ?? 0);
    }

    if ($err !== '') {
        $detail = 'Could not reach NVIDIA: ' . substr($err, 0, 80);
    } elseif ($status === 401 || $status === 403) {
        $detail = 'NVIDIA rejected the credential (401/403). Invalid, expired or revoked.';
    } elseif ($status === 429) {
        $detail = 'Rate limited (429). The key is valid but over quota right now.';
    } elseif ($status !== 200) {
        $detail = 'NVIDIA returned HTTP ' . $status . '.';
    } elseif ($text === '') {
        // The specific failure this endpoint exists to catch: HTTP 200, valid
        // key, no answer. Almost always a token budget consumed by reasoning.
        $detail = 'NVIDIA accepted the request but returned no text'
            . ($finish !== '' ? " (finish_reason=$finish" : '')
            . ($reasoning > 0 ? ", {$reasoning} reasoning tokens" : '')
            . ($finish !== '' || $reasoning > 0 ? ')' : '')
            . '. Raise the token budget or use a non-reasoning model.';
    } else {
        $detail = 'Live completion succeeded.';
    }

    $ok = $status === 200 && $text !== '';

    $save = db()->prepare('UPDATE app_settings SET last_status = ? WHERE setting_key = ?');
    $save->execute([substr(($ok ? 'OK ' : 'FAIL ') . $detail, 0, 160), 'nvidia_api_key']);

    json([
        'ok' => $ok,
        'status' => $status,
        'detail' => $detail,
        'model' => $model,
        'elapsedMs' => $elapsed * 1000,
        // The model's own reply, so an operator can see it genuinely answered.
        // Truncated hard: this is a health probe, not a content preview.
        'sample' => $text === '' ? null : substr($text, 0, 120),
        'reasoningTokens' => $reasoning,
    ]);
}



function routeAdmin(string $method, array $segments): void
{
    $user = requireAuthUser();
    if (empty($user['isAdmin'])) {
        je('Admin access required', 403);
    }

    $action = $segments[0] ?? null;

    // ── AI credential / runtime settings ────────────────────────────────────
    // Checked before the generic branches below. These are the only endpoints
    // that touch app_settings, and there is deliberately no "read the value"
    // route — status reports presence and provenance only.
    if ($action === 'ai-settings' && ($segments[1] ?? null) === null) {
        if ($method === 'GET') { adminAiSettingsStatus(); return; }
        if ($method === 'PUT' || $method === 'POST') { adminAiSettingsUpdate(); return; }
    }
    if ($method === 'POST' && $action === 'ai-settings' && ($segments[1] ?? null) === 'verify') {
        adminAiSettingsVerify();
        return;
    }

    // Audit trail — immutable, read-only.
    if ($method === 'GET' && $action === 'audit') { adminAuditList(); return; }

    // Matchmaker profile submissions queue.
    if ($action === 'matchmaker') {
        array_shift($segments);
        routeAdminMatchmaker($method, $segments);
        return;
    }

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
    // Accepts both POST /verifications/bulk and the legacy POST /verifications/:id/bulk.
// The id slot was only ever a placeholder, which meant the endpoint could not
// be called without inventing a throwaway id — a trap for anyone wiring a new
// client against it.
    if ($method === 'POST' && $action === 'verifications' && ($segments[1] ?? null) !== null) {
        $verb = strtolower((string)($segments[2] ?? ''));
        if ($segments[1] === 'bulk') { adminVerificationBulk(); return; }
        if ($verb === 'bulk') { adminVerificationBulk(); return; }
        if ($verb === 'approve') { adminApproveVerification((string)$segments[1]); return; }
        if ($verb === 'reject')  { adminRejectVerification((string)$segments[1]); return; }
    }
    if ($method === 'GET' && $action === 'overview') { adminOverview(); return; }
    if ($method === 'GET' && $action === 'health') { adminHealth(); return; }
    if ($method === 'GET' && $action === 'analytics') { adminAnalytics(); return; }
    if ($method === 'GET' && $action === 'seo') { adminSeoAnalytics(); return; }
    if ($method === 'GET' && $action === 'queue') { adminModerationQueue(); return; }
    if ($method === 'GET' && $action === 'verification-queue') { adminVerificationQueue(); return; }
    // POST /verify/bulk — segments are ['verify', 'bulk'], so the verb is at
// index 1, not 2. Tested against index 2 it silently fell through to the 404.
    if ($method === 'POST' && $action === 'verify' && ($segments[1] ?? null) === 'bulk'
        && ($segments[2] ?? null) === null) {
        adminVerifyBulk();
        return;
    }
    if ($method === 'POST' && $action === 'users' && ($segments[1] ?? null) !== null && ($segments[2] ?? null) === 'verify') {
        adminVerifyOne((string)$segments[1]);
        return;
    }
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
    // POST /api/admin/users/:id/block — ban a member from the platform.
    // Sets profiles.is_blocked = 1, which hides them from browse, search,
    // favourites and messaging everywhere visibleProfile() is used.
    if ($method === 'POST' && $action === 'users' && ($segments[1] ?? null) !== null && ($segments[2] ?? null) === 'block') {
        adminBlockUser((string)$segments[1]);
        return;
    }
    // POST /api/admin/users/:id/verify-email — mark a member's email as
    // verified from the admin portal (e.g. they confirmed via another
    // channel, or the verification mail never arrived).
    if ($method === 'POST' && $action === 'users' && ($segments[1] ?? null) !== null && ($segments[2] ?? null) === 'verify-email') {
        adminVerifyEmail((string)$segments[1]);
        return;
    }
    // PATCH /api/admin/users/:id — edit a member's name, photo and details.
    if ($method === 'PATCH' && $action === 'users' && ($segments[1] ?? null) !== null && ($segments[2] ?? null) === null) {
        adminUpdateUser((string)$segments[1]);
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
    $rows = $stmt->fetchAll();

    // Counts for every tab, not just the active one. An "Approved (14)" tab is
    // how an operator discovers what they did last week.
    $counts = ['pending' => 0, 'approved' => 0, 'rejected' => 0];
    try {
        foreach (db()->query('SELECT status, COUNT(*) AS n FROM verifications GROUP BY status')->fetchAll() as $r) {
            if (isset($counts[(string)$r['status']])) {
                $counts[(string)$r['status']] = (int)$r['n'];
            }
        }
    } catch (Throwable) {
        // Counts stay at zero if the query fails; the list still renders.
    }

    // The reviewer has to actually see the submission to judge it, so give the
    // UI the file URL instead of making it construct one from the id.
    foreach ($rows as &$r) {
        $r['file_url'] = '/api/admin/verifications/' . rawurlencode((string)$r['id']) . '/file';
    }
    unset($r);

    json(['rows' => $rows, 'counts' => $counts]);
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

/**
 * Data health: the signal that 48 of 61 profiles were test shells went unnoticed
 * for weeks because no admin screen surfaced it.
 *
 * The banner is the early-warning system. It reports what is actually in the
 * database — never a rounded-up or reassuring figure — so an operator sees the
 * same number a visitor would.
 */
function adminHealth(): void
{
    $rows = db()->query(
        'SELECT p.user_id, p.display_name, p.city, p.profession, p.visibility
           FROM profiles p'
    )->fetchAll();

    // Negate, for the same array_filter reason documented in profilesStats():
    // passing isTestShellRow() directly would report the 48 shells as the real
    // profile count and leave the banner reassuring an operator about junk data.
    $real = array_values(array_filter($rows, static fn(array $r): bool => !isTestShellRow($r)));
    $shells = count($rows) - count($real);

    // A profile that is browsable but has nothing in it is the other half of
    // the problem: a wall of blanks reads exactly like a wall of junk.
    $incomplete = 0;
    foreach ($real as $r) {
        if (trim((string)($r['city'] ?? '')) === '' || trim((string)($r['profession'] ?? '')) === '') {
            $incomplete++;
        }
    }
    try {
        $v = db()->query(
            "SELECT COUNT(*) AS n FROM verifications WHERE status = 'approved'"
        )->fetch();
        $verified = (int)($v['n'] ?? 0);
    } catch (Throwable $e) {
        $verified = 0;
    }

    // A visible shell is worth an operator's attention; a hidden one is not.
    // Severity is deliberately driven by what a member would actually see.
    $level = 'ok';
    $messages = [];
    if ($shells > 0) {
        $level = 'warn';
        $messages[] = sprintf(
            '%d test-shell profile%s hidden from the public directory. They are excluded from browse and stats, but still occupy the database.',
            $shells,
            $shells === 1 ? '' : 's'
        );
    }
    if ($incomplete > 0) {
        $level = $level === 'ok' ? 'info' : $level;
        $messages[] = sprintf(
            '%d real profile%s missing a city or profession.',
            $incomplete,
            $incomplete === 1 ? '' : 's'
        );
    }
    if ($verified === 0 && count($real) > 0) {
        $level = $level === 'ok' ? 'info' : $level;
        $messages[] = 'No approved identity verifications yet — the public badge count reads zero.';
    }
    if ($messages === []) {
        $messages[] = 'No test shells and no incomplete profiles detected.';
    }

    json([
        'level' => $level,
        'realProfiles' => count($real),
        'testShellsHidden' => $shells,
        'incompleteProfiles' => $incomplete,
        'verified' => $verified,
        'messages' => $messages,
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

    // Biodata maker usage — from the audit trail (action = 'biodata.created').
    $biodataCounts = [];
    try {
        $stmt = db()->prepare("SELECT DATE(created_at) AS d, COUNT(*) AS n FROM admin_audit
            WHERE action = 'biodata.created'
            AND created_at >= DATE_SUB(CURDATE(), INTERVAL {$days} DAY) GROUP BY DATE(created_at)");
        $stmt->execute();
        foreach ($stmt->fetchAll() as $r) {
            $biodataCounts[(string)$r['d']] = (int)$r['n'];
        }
    } catch (Throwable) { /* audit table may predate biodata logging */ }

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
            [
                'key' => 'biodataCreated',
                'title' => 'Biodatas Created',
                'labels' => $labels,
                'values' => array_map(fn($d) => $biodataCounts[$d] ?? 0, $dayKeys),
                'color' => 'var(--color-success)',
            ],
        ],
    ]);
}

// GET /api/admin/seo?range=7d|30d — the SEO & Growth dashboard dataset.
//
// First-party analytics from the pageviews beacon (POST /api/analytics/collect)
// plus real product aggregates. Everything here is a real COUNT from the
// database — no sample data, no estimates. Google Analytics 4 runs in parallel
// via the gtag snippet (measurement ID G-KNR7541E3G); its own numbers live in
// the GA console, linked from the dashboard.
function adminSeoAnalytics(): void
{
    $range = ($_GET['range'] ?? '') === '30d' ? '30d' : '7d';
    $days = $range === '30d' ? 30 : 7;

    $labels = [];
    $dayKeys = [];
    for ($i = $days; $i >= 0; $i--) {
        $ts = time() - ($i * 86400);
        $labels[] = date('M d', $ts);
        $dayKeys[] = date('Y-m-d', $ts);
    }
    $since = date('Y-m-d', time() - ($days * 86400));
    $prevSince = date('Y-m-d', time() - (2 * $days * 86400));
    $prevUntil = date('Y-m-d', time() - (($days + 1) * 86400));

    // Day-bucketed traffic. pageviews may not exist yet on old installs —
    // degrade to zeros rather than 500ing the dashboard.
    $pvSeries = array_fill_keys($dayKeys, 0);
    $uvSeries = array_fill_keys($dayKeys, 0);
    try {
        $stmt = db()->prepare(
            "SELECT DATE(created_at) AS d, COUNT(*) AS n, COUNT(DISTINCT visitor_hash) AS u
             FROM pageviews WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL {$days} DAY)
             GROUP BY DATE(created_at)"
        );
        $stmt->execute();
        foreach ($stmt->fetchAll() as $r) {
            $d = (string)$r['d'];
            if (isset($pvSeries[$d])) {
                $pvSeries[$d] = (int)$r['n'];
                $uvSeries[$d] = (int)$r['u'];
            }
        }
    } catch (Throwable) { /* table missing — dashboard shows zeros */ }

    $scalar = function (string $sql, array $params = []): int {
        try {
            $stmt = db()->prepare($sql);
            $stmt->execute($params);
            return (int)($stmt->fetchColumn() ?? 0);
        } catch (Throwable) {
            return 0;
        }
    };

    // Overview counts: current window vs the previous equal window, for deltas.
    $visitors = $scalar(
        "SELECT COUNT(DISTINCT visitor_hash) FROM pageviews WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL {$days} DAY)"
    );
    $prevVisitors = $scalar(
        "SELECT COUNT(DISTINCT visitor_hash) FROM pageviews WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL " . (2 * $days) . " DAY)
         AND created_at < DATE_SUB(CURDATE(), INTERVAL {$days} DAY)"
    );
    $pageviews = $scalar(
        "SELECT COUNT(*) FROM pageviews WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL {$days} DAY)"
    );
    $prevPageviews = $scalar(
        "SELECT COUNT(*) FROM pageviews WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL " . (2 * $days) . " DAY)
         AND created_at < DATE_SUB(CURDATE(), INTERVAL {$days} DAY)"
    );
    $members = $scalar(
        "SELECT COUNT(*) FROM users WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL {$days} DAY)"
    );
    $prevMembers = $scalar(
        "SELECT COUNT(*) FROM users WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL " . (2 * $days) . " DAY)
         AND created_at < DATE_SUB(CURDATE(), INTERVAL {$days} DAY)"
    );
    $biodatas = $scalar(
        "SELECT COUNT(*) FROM admin_audit WHERE action = 'biodata.created'
         AND created_at >= DATE_SUB(CURDATE(), INTERVAL {$days} DAY)"
    );
    $prevBiodatas = $scalar(
        "SELECT COUNT(*) FROM admin_audit WHERE action = 'biodata.created'
         AND created_at >= DATE_SUB(CURDATE(), INTERVAL " . (2 * $days) . " DAY)
         AND created_at < DATE_SUB(CURDATE(), INTERVAL {$days} DAY)"
    );
    $messages = $scalar(
        "SELECT COUNT(*) FROM messages WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL {$days} DAY)"
    );
    $prevMessages = $scalar(
        "SELECT COUNT(*) FROM messages WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL " . (2 * $days) . " DAY)
         AND created_at < DATE_SUB(CURDATE(), INTERVAL {$days} DAY)"
    );
    $posts = $scalar(
        "SELECT COUNT(*) FROM blog_posts WHERE status = 'published'
         AND COALESCE(published_at, created_at) >= DATE_SUB(CURDATE(), INTERVAL {$days} DAY)"
    );
    $prevPosts = $scalar(
        "SELECT COUNT(*) FROM blog_posts WHERE status = 'published'
         AND COALESCE(published_at, created_at) >= DATE_SUB(CURDATE(), INTERVAL " . (2 * $days) . " DAY)
         AND COALESCE(published_at, created_at) < DATE_SUB(CURDATE(), INTERVAL {$days} DAY)"
    );

    $delta = fn(int $cur, int $prev): ?float =>
        $prev > 0 ? round((($cur - $prev) / $prev) * 100, 1) : ($cur > 0 ? 100.0 : null);

    // Top pages, top referrers, device split — current window only.
    $topPages = [];
    $referrers = [];
    $devices = [];
    try {
        $stmt = db()->prepare(
            "SELECT path, COUNT(*) AS views, COUNT(DISTINCT visitor_hash) AS visitors
             FROM pageviews WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL {$days} DAY)
             GROUP BY path ORDER BY views DESC LIMIT 12"
        );
        $stmt->execute();
        $topPages = array_map(fn($r) => [
            'path' => (string)$r['path'],
            'views' => (int)$r['views'],
            'visitors' => (int)$r['visitors'],
        ], $stmt->fetchAll());

        $stmt = db()->prepare(
            "SELECT referrer_host, COUNT(*) AS views
             FROM pageviews WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL {$days} DAY)
             AND referrer_host IS NOT NULL
             GROUP BY referrer_host ORDER BY views DESC LIMIT 10"
        );
        $stmt->execute();
        $referrers = array_map(fn($r) => [
            'host' => (string)$r['referrer_host'],
            'views' => (int)$r['views'],
        ], $stmt->fetchAll());

        $stmt = db()->prepare(
            "SELECT device, COUNT(*) AS views
             FROM pageviews WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL {$days} DAY)
             GROUP BY device ORDER BY views DESC"
        );
        $stmt->execute();
        $devices = array_map(fn($r) => [
            'device' => (string)$r['device'],
            'views' => (int)$r['views'],
        ], $stmt->fetchAll());
    } catch (Throwable) { /* table missing — sections render empty */ }

    json([
        'range' => $range,
        'since' => $since,
        'ga' => [
            'measurementId' => 'G-KNR7541E3G',
            'propertyUrl' => 'https://analytics.google.com/analytics/web/#/a324835995p453783207/',
            'status' => 'connected',
        ],
        'overview' => [
            ['key' => 'visitors', 'label' => 'Unique visitors', 'value' => $visitors, 'delta' => $delta($visitors, $prevVisitors)],
            ['key' => 'pageviews', 'label' => 'Pageviews', 'value' => $pageviews, 'delta' => $delta($pageviews, $prevPageviews)],
            ['key' => 'members', 'label' => 'New members', 'value' => $members, 'delta' => $delta($members, $prevMembers)],
            ['key' => 'biodatas', 'label' => 'Biodatas created', 'value' => $biodatas, 'delta' => $delta($biodatas, $prevBiodatas)],
            ['key' => 'messages', 'label' => 'Messages sent', 'value' => $messages, 'delta' => $delta($messages, $prevMessages)],
            ['key' => 'posts', 'label' => 'Posts published', 'value' => $posts, 'delta' => $delta($posts, $prevPosts)],
        ],
        'traffic' => [
            'labels' => $labels,
            'pageviews' => array_values($pvSeries),
            'visitors' => array_values($uvSeries),
        ],
        'topPages' => $topPages,
        'referrers' => $referrers,
        'devices' => $devices,
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
    $admin = currentUser();
    try {
        $result = AdminService::actionReport($reportId, (string)$admin['uid']);
        json(['ok' => true, 'action' => $result['action'], 'target_type' => $result['target_type']]);
    } catch (RuntimeException $e) {
        // The test harness signals json() via RuntimeException('JSON_CAPTURED') —
        // that is success, not a report error. Let it bubble.
        if ($e->getMessage() === 'JSON_CAPTURED') throw $e;
        je($e->getMessage(), 404);
    }
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
                   u.verification_status,
                   p.is_blocked, p.is_verified AS id_verified, p.city, p.country, p.age
              FROM users u
              LEFT JOIN profiles p ON p.user_id = u.id';
    if ($blocked === '1') $where[] = 'p.is_blocked = 1';
    if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);

    // Real total for the same filters, so the footer can say "25 of 63" instead
    // of the useless "25+". Counting was previously done as count($rows), which
    // is just the page length and told an operator nothing.
    $total = 0;
    try {
        $countSql = 'SELECT COUNT(*) AS n FROM users u LEFT JOIN profiles p ON p.user_id = u.id';
        if ($where) $countSql .= ' WHERE ' . implode(' AND ', $where);
        $cstmt = db()->prepare($countSql);
        $cstmt->execute($params);
        $total = (int)($cstmt->fetch()['n'] ?? 0);
    } catch (Throwable $e) {
        error_log('[api] admin/users count failed: ' . substr($e->getMessage(), 0, 100));
    }

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

    json(['rows' => $rows, 'hasMore' => $hasMore, 'count' => count($rows), 'total' => $total]);
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
        // wali_links has no `id` column (the token is the primary key) and
        // revokes via a `revoked` flag, not a `revoked_at` timestamp. Selecting
        // the wrong names here is what kept this endpoint reporting
        // "not available" forever.
        //
        // The token itself is NEVER returned. It is the bearer credential that
        // opens a read-only view of that member's profile, so an admin list must
        // not be a way to harvest one. A truncated SHA-256 of it is enough to
        // key a row without exposing anything reversible.
        $rows = db()->query(
            'SELECT LEFT(SHA2(w.token, 256), 12) AS ref,
                    w.user_id, w.created_at, w.revoked,
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
        $r['active'] = (int)($r['revoked'] ?? 0) === 0;
        unset($r['revoked']);
    }
    unset($r);

    json(['rows' => $rows, 'available' => true]);
}

// GET /api/admin/verification-queue
//
// Accounts waiting for a human to review them. Returning bare user rows would
// force a moderator to open each profile and judge it from scratch, so every
// row carries the evidence the decision needs: profile completeness, photo
// count, whether the email was confirmed, how long the account has waited, and
// whether it looks like a duplicate. Flags are advisory — they never auto-decide.
function adminVerificationQueue(): void
{
    $status = (string)($_GET['status'] ?? 'unverified');
    if (!in_array($status, ['unverified', 'verified', 'rejected', 'all'], true)) {
        $status = 'unverified';
    }
    $limit = max(1, min(200, (int)($_GET['limit'] ?? 50)));

    $where = 'u.is_admin = 0';
    $params = [];
    if ($status !== 'all') {
        $where .= ' AND u.verification_status = ?';
        $params[] = $status;
    }

    try {
        $rows = db()->prepare(
            "SELECT u.id, u.email, u.display_name, u.created_at, u.verification_status,
                    u.verified_at, u.verification_note, u.email_verified,
                    p.display_name AS profile_name, p.age, p.gender, p.city, p.country,
                    p.sect, p.profession, p.education_level, p.username, p.bio,
                    p.photo_url, p.marital_status, p.religiosity
               FROM users u
               LEFT JOIN profiles p ON p.user_id = u.id
              WHERE {$where}
              ORDER BY u.created_at ASC
              LIMIT {$limit}"
        );
        $rows->execute($params);
        $list = $rows->fetchAll();
    } catch (Throwable $e) {
        error_log('[api] admin/verification-queue unavailable: ' . substr($e->getMessage(), 0, 140));
        json(['rows' => [], 'available' => false, 'counts' => null]);
    }

    $ids = array_column($list, 'id');
    $photoCounts = [];
    $reportsBy = [];
    $waliBy = [];
    $verifBy = [];
    $dupes = [];

    if ($ids) {
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $load = static function (string $sql, array $args) use (&$photoCounts, &$reportsBy, &$waliBy, &$verifBy) {
            try {
                $st = db()->prepare($sql);
                $st->execute($args);
                return $st->fetchAll();
            } catch (Throwable) {
                return null; // optional evidence on an older database
            }
        };
        foreach ((array)$load("SELECT user_id, COUNT(*) AS n FROM profile_photos WHERE user_id IN ({$ph}) GROUP BY user_id", $ids) as $r) {
            $photoCounts[(string)$r['user_id']] = (int)$r['n'];
        }
        foreach ((array)$load("SELECT target_id, COUNT(*) AS n FROM reports WHERE status = 'open' AND target_id IN ({$ph}) GROUP BY target_id", $ids) as $r) {
            $reportsBy[(string)$r['target_id']] = (int)$r['n'];
        }
        foreach ((array)$load("SELECT user_id, COUNT(*) AS n FROM wali_links WHERE revoked_at IS NULL AND user_id IN ({$ph}) GROUP BY user_id", $ids) as $r) {
            $waliBy[(string)$r['user_id']] = (int)$r['n'];
        }
        foreach ((array)$load("SELECT user_id, COUNT(*) AS n FROM verifications WHERE status = 'approved' AND user_id IN ({$ph}) GROUP BY user_id", $ids) as $r) {
            $verifBy[(string)$r['user_id']] = (int)$r['n'];
        }

        // Same display name AND same city is the shape a re-registration or a
        // sock-puppet takes. Surfacing it lets a human make the call.
        try {
            $st = db()->prepare(
                "SELECT LOWER(p.display_name) AS nm, LOWER(COALESCE(p.city,'')) AS ct, COUNT(*) AS n
                   FROM profiles p JOIN users u2 ON u2.id = p.user_id
                  WHERE p.user_id IN ({$ph}) AND u2.is_admin = 0
                  GROUP BY nm, ct HAVING n > 1"
            );
            $st->execute($ids);
            foreach ($st->fetchAll() as $r) {
                $dupes[strtolower((string)$r['nm'] . '|' . (string)$r['ct'])] = (int)$r['n'];
            }
        } catch (Throwable) { /* optional evidence */ }
    }

    $now = time();
    foreach ($list as &$r) {
        $id = (string)$r['id'];
        $complete = 0;
        foreach (['profile_name', 'age', 'gender', 'city', 'sect', 'profession', 'education_level'] as $f) {
            if (!empty($r[$f])) $complete++;
        }
        $photoN = $photoCounts[$id] ?? (empty($r['photo_url']) ? 0 : 1);

        $flags = [];
        if (empty($r['bio'])) $flags[] = 'no_bio';
        if ($photoN === 0) $flags[] = 'no_photo';
        if ((int)($r['email_verified'] ?? 0) === 0) $flags[] = 'email_unconfirmed';
        if (empty($r['sect'])) $flags[] = 'no_sect';
        if (($reportsBy[$id] ?? 0) > 0) $flags[] = 'open_report';

        $ageDays = (int)floor(($now - strtotime((string)$r['created_at'] . ' UTC')) / 86400);
        if ($ageDays >= 7) $flags[] = 'waiting_7d';

        $dupKey = strtolower((string)($r['profile_name'] ?? $r['display_name']) . '|' . strtolower((string)($r['city'] ?? '')));

        $r['evidence'] = [
            'completeness' => (int)round(($complete / 7) * 100),
            'photos' => (int)$photoN,
            'hasWali' => (int)($waliBy[$id] ?? 0) > 0,
            'documentApproved' => (int)($verifBy[$id] ?? 0) > 0,
            'openReports' => (int)($reportsBy[$id] ?? 0),
            'accountAgeDays' => max(0, $ageDays),
            'duplicateOf' => $dupes[$dupKey] ?? null,
        ];
        $r['flags'] = $flags;
        // Highest-signal first, then longest-waiting: a moderator should never
        // have to scroll to find the account that most needs judgement.
        $r['priority'] = ($reportsBy[$id] ?? 0) > 0 ? 3 : ($complete >= 6 ? 2 : 1);
    }
    unset($r);

    usort($list, static function ($a, $b) {
        if ($a['priority'] !== $b['priority']) return $b['priority'] <=> $a['priority'];
        return $a['evidence']['accountAgeDays'] <=> $b['evidence']['accountAgeDays'];
    });

    $counts = ['unverified' => 0, 'verified' => 0, 'rejected' => 0];
    try {
        foreach (db()->query(
            'SELECT verification_status AS s, COUNT(*) AS n FROM users WHERE is_admin = 0 GROUP BY verification_status'
        )->fetchAll() as $r) {
            $counts[(string)$r['s']] = (int)$r['n'];
        }
    } catch (Throwable) { /* counts are decorative */ }

    json(['rows' => $list, 'available' => true, 'counts' => $counts]);
}

// GET /api/admin/funnel — where members drop out of activation.
/**
 * Shared write path for manual verification decisions.
 *
 * Every decision is audited with the actor, the subject, the note and the flags
 * that were visible at decision time. On a platform where an admin can mark a
 * real person's account as reviewed, "who approved this and why" has to be
 * answerable months later.
 */
function applyVerification(string $userId, string $decision, ?string $note, array $flags = []): bool
{
    if (!in_array($decision, ['approve', 'reject'], true)) {
        je('decision must be approve or reject.', 400);
    }

    $probe = db()->prepare("SELECT id, verification_status FROM users WHERE id = ? LIMIT 1");
    $probe->execute([$userId]);
    $row = $probe->fetch();
    if (!$row) return false;

    $actor = currentUser();
    $next = $decision === 'approve' ? 'verified' : 'rejected';

    db()->prepare(
        'UPDATE users
            SET verification_status = ?, verified_by = ?, verified_at = UTC_TIMESTAMP(), verification_note = ?
          WHERE id = ?'
    )->execute([$next, (string)($actor['uid'] ?? ''), $note, $userId]);

    // The profile badge reads profiles.is_verified, not users.verification_status.
    // Without this sync, an admin approval never showed the verified check on
    // the member's card — verification looked broken.
    try {
        db()->prepare('UPDATE profiles SET is_verified = ? WHERE user_id = ?')
            ->execute([$decision === 'approve' ? 1 : 0, $userId]);
    } catch (Throwable) { /* member may have no profile row yet */ }

    auditLog('account.' . $decision . 'd', 'user', $userId, [
        'from' => $row['verification_status'],
        'to' => $next,
        'note' => $note,
        'flags' => array_values(array_slice($flags, 0, 8)),
    ]);
    return true;
}

// POST /api/admin/users/:id/verify { decision, note, flags }
function adminVerifyOne(string $userId): void
{
    $payload = requestJson();
    $decision = strtolower(trim((string)($payload['decision'] ?? '')));
    $note = sanitizeText($payload['note'] ?? '', 500);
    $note = $note === '' ? null : $note;
    $flags = is_array($payload['flags'] ?? null) ? $payload['flags'] : [];

    if (!applyVerification($userId, $decision, $note, $flags)) {
        je('Member not found.', 404);
    }

    $out = db()->prepare('SELECT id, email, display_name, verification_status, verified_at FROM users WHERE id = ? LIMIT 1');
    $out->execute([$userId]);
    $user = $out->fetch() ?: null;

    json(['ok' => true, 'user' => $user]);
}

// POST /api/admin/verify/bulk { ids: [], decision, note }
//
// Reviewing sixty accounts one click at a time is not a workflow. Guarded so a
// typo cannot mass-approve, and every affected id is audited individually so the
// trail stays per-account rather than one opaque "bulk" line.
function adminVerifyBulk(): void
{
    $payload = requestJson();
    $decision = strtolower(trim((string)($payload['decision'] ?? '')));
    if (!in_array($decision, ['approve', 'reject'], true)) {
        je('decision must be approve or reject.', 400);
    }

    $ids = array_values(array_filter(array_map(
        static fn($v) => is_string($v) ? trim($v) : '',
        (array)($payload['ids'] ?? [])
    )));
    if (!$ids) {
        je('Provide a non-empty ids array.', 400);
    }
    if (count($ids) > 200) {
        je('Bulk actions are limited to 200 accounts at a time.', 400);
    }

    $note = sanitizeText($payload['note'] ?? '', 500);
    $note = $note === '' ? null : $note;

    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $probe = db()->prepare("SELECT id FROM users WHERE id IN ({$placeholders}) AND is_admin = 0");
    $probe->execute($ids);
    $rows = $probe->fetchAll();

    if (!$rows) {
        json(['ok' => true, 'affected' => 0, 'message' => 'No reviewable accounts in that selection.']);
    }

    $n = 0;
    foreach ($rows as $row) {
        if (applyVerification((string)$row['id'], $decision, $note, (array)($payload['flags'] ?? []))) {
            $n++;
        }
    }

    json(['ok' => true, 'affected' => $n]);
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

// POST /api/admin/users/:id/block — ban a member from the platform.
// Sets profiles.is_blocked = 1, which hides them from browse, search,
// favourites and messaging everywhere visibleProfile() is used. Audited.
function adminBlockUser(string $userId): void
{
    $probe = db()->prepare('SELECT id, email FROM users WHERE id = ? LIMIT 1');
    $probe->execute([$userId]);
    $row = $probe->fetch();
    if (!$row) {
        je('Member not found.', 404);
    }
    // Never let an admin ban themselves or another admin by accident.
    $role = db()->prepare('SELECT role FROM users WHERE id = ? LIMIT 1');
    $role->execute([$userId]);
    if (in_array((string)($role->fetch()['role'] ?? ''), ['admin', 'superadmin'], true)) {
        je('Admin accounts cannot be blocked.', 403);
    }
    $body = requestJson();
    $reason = trim((string)($body['reason'] ?? ''));
    // duration: '24h' | '7d' | '30d' | 'permanent' (default). Temporary blocks
    // lapse automatically via blocked_until; permanent sets it NULL.
    $duration = (string)($body['duration'] ?? 'permanent');
    $seconds = ['24h' => 86400, '7d' => 604800, '30d' => 2592000][$duration] ?? null;
    $blockedUntil = $seconds ? date('Y-m-d H:i:s', time() + $seconds) : null;
    try {
        db()->prepare('UPDATE profiles SET is_blocked = 1, blocked_until = ?, block_reason = ? WHERE user_id = ?')
            ->execute([$blockedUntil, $reason !== '' ? $reason : null, $userId]);
    } catch (Throwable) { /* target may have no profile row */ }

    auditLog('user.blocked', 'user', $userId, [
        'email' => (string)$row['email'],
        'reason' => $reason,
        'duration' => $duration,
        'blocked_until' => $blockedUntil,
    ]);

    json(['ok' => true, 'id' => $row['id'], 'email' => $row['email'], 'duration' => $duration, 'blocked_until' => $blockedUntil]);
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
        db()->prepare('UPDATE profiles SET is_blocked = 0, blocked_until = NULL, block_reason = NULL WHERE user_id = ?')->execute([$userId]);
    } catch (Throwable) { /* target may have no profile row */ }

    auditLog('user.unblocked', 'user', $userId, ['email' => (string)$row['email']]);

    json(['ok' => true, 'id' => $row['id'], 'email' => $row['email']]);
}

// POST /api/admin/users/:id/verify-email — mark a member's email verified.
function adminVerifyEmail(string $userId): void
{
    $probe = db()->prepare('SELECT id, email FROM users WHERE id = ? LIMIT 1');
    $probe->execute([$userId]);
    $row = $probe->fetch();
    if (!$row) {
        je('Member not found.', 404);
    }
    db()->prepare('UPDATE users SET email_verified = 1 WHERE id = ?')->execute([$userId]);
    auditLog('user.email_verified', 'user', $userId, ['email' => (string)$row['email']]);
    json(['ok' => true, 'id' => $row['id'], 'email' => $row['email']]);
}

// PATCH /api/admin/users/:id — edit a member's name, photo and profile details.
// Only whitelisted fields; every change is audit-logged.
function adminUpdateUser(string $userId): void
{
    $probe = db()->prepare('SELECT id, email FROM users WHERE id = ? LIMIT 1');
    $probe->execute([$userId]);
    $row = $probe->fetch();
    if (!$row) {
        je('Member not found.', 404);
    }
    $body = requestJson();
    // display_name lives on users; everything else on profiles.
    $allowed = [
        'display_name', 'city', 'country', 'age', 'bio', 'profession',
        'education_level', 'marital_status', 'height_cm', 'photo_url',
        'prayer', 'marja', 'languages', 'sect',
    ];
    $uSets = []; $uVals = []; $pSets = []; $pVals = []; $changed = [];
    foreach ($allowed as $field) {
        if (!array_key_exists($field, $body)) continue;
        $val = $body[$field];
        if (is_string($val)) $val = trim($val);
        if (($field === 'age' || $field === 'height_cm') && ($val === '' || $val === null)) $val = null;
        if ($val !== null && ($field === 'age' || $field === 'height_cm')) $val = (int)$val;
        if ($field === 'display_name') { $uSets[] = "$field = ?"; $uVals[] = $val; }
        else { $pSets[] = "$field = ?"; $pVals[] = $val; }
        $changed[] = $field;
    }
    if (!$changed) {
        je('Nothing to update.', 400);
    }
    if ($uSets) {
        $uVals[] = $userId;
        db()->prepare('UPDATE users SET ' . implode(', ', $uSets) . ' WHERE id = ?')->execute($uVals);
    }
    if ($pSets) {
        $pVals[] = $userId;
        try {
            db()->prepare('UPDATE profiles SET ' . implode(', ', $pSets) . ' WHERE user_id = ?')->execute($pVals);
        } catch (Throwable) { /* no profile row yet */ }
    }
    auditLog('user.updated', 'user', $userId, ['email' => (string)$row['email'], 'fields' => $changed]);
    json(['ok' => true, 'id' => $row['id'], 'updated' => $changed]);
}


