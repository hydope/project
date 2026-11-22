<?php
// Social Storage lifecycle (2026-11-21) — implements the approved
// storage plan (Social-Storage-World-Class-Plan.md) SERVER-SIDE ONLY.
//
// Syed's hard rule: NO external storage (no Cloudflare/R2/Drive). Every
// scheduler media file lives and dies on this server, inside the 10 GB
// hosting quota, under these enforced budgets:
//
//   · Media directory budget: 2 GB hard cap (env SOCIAL_MEDIA_BUDGET_BYTES).
//     Video uploads/ingest refuse at/over the cap — generation slows,
//     the website never does.
//   · Purge lifecycle (run by social-publish-cron.php every 5 min):
//       - all targets published with live URLs → purge 72h after the
//         last publish (the platforms are the archive; URLs stay on
//         the target rows, only the server file goes).
//       - any target failed, none still open → keep 7 days for retries,
//         then purge and note the row.
//       - cancelled post → purge 24h after cancellation.
//     Purges start in DRY-RUN for the first 48h of wall-clock time
//     (see socialPurgeDryRunInfo) — would-purge entries are logged,
//     nothing is deleted — unless SOCIAL_PURGE_DRYRUN_UNTIL explicitly
//     disables it.
//   · Account watchdog (run hourly by social-autopilot-cron.php):
//     account usage vs quota (env SOCIAL_ACCOUNT_QUOTA_MB, default
//     10000): ≥70% watch (warning), ≥85% block new renders/ingest
//     (publishing continues), ≥95% emergency purge of published files
//     regardless of the 72h grace.
//
// The purge DECISION (socialPurgeDecision) and the dry-run resolution
// (socialPurgeDryRunResolve) are pure functions of their inputs so the
// offline test (tests/social-storage-test.php) can pin the rules with
// stubbed rows — no DB, no filesystem side effects.
declare(strict_types=1);

const SOCIAL_STORAGE_WATCHDOG_KEY = 'social_storage_watchdog';
const SOCIAL_PURGE_ANCHOR_KEY = 'social_purge_dryrun_anchor';

// ── Config ──────────────────────────────────────────────────────────────

function socialMediaBudgetBytes(): int
{
    $raw = trim((string)(getenv('SOCIAL_MEDIA_BUDGET_BYTES') ?: ''));
    if ($raw !== '' && is_numeric($raw) && (int)$raw > 0) return (int)$raw;
    return 2 * 1024 * 1024 * 1024; // 2 GiB
}

function socialAccountQuotaBytes(): int
{
    $raw = trim((string)(getenv('SOCIAL_ACCOUNT_QUOTA_MB') ?: ''));
    $mb = ($raw !== '' && is_numeric($raw) && (int)$raw > 0) ? (int)$raw : 10000;
    return $mb * 1024 * 1024;
}

function socialMediaDirPath(): string
{
    if (function_exists('photoBaseDir')) return photoBaseDir() . '/social';
    return __DIR__ . '/../uploads/social'; // offline/test fallback only
}

// ── Filesystem measurement ──────────────────────────────────────────────

/** Recursive size of a directory in bytes; unreadable entries are skipped. */
function socialDirSizeBytes(string $dir): int
{
    if (!is_dir($dir)) return 0;
    $total = 0;
    try {
        $it = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::LEAVES_ONLY
        );
        foreach ($it as $f) {
            if ($f->isFile()) $total += (int)$f->getSize();
        }
    } catch (Throwable) {
        // Partial sum is better than crashing a cron over one bad entry.
    }
    return $total;
}

/** Account home dir: HOME env on cPanel; else the parent of the uploads root. */
function socialAccountHomeDir(): string
{
    $home = trim((string)(getenv('HOME') ?: ''));
    if ($home !== '' && is_dir($home)) return $home;
    if (function_exists('photoBaseDir')) {
        $parent = dirname(photoBaseDir());
        if (is_dir($parent)) return $parent;
    }
    return dirname(__DIR__, 3);
}

/**
 * Account usage in bytes. Method: recursive sum of the account home
 * directory — on shared cPanel hosting disk_free_space()/disk_total_space()
 * report the whole server partition, NOT the account quota, so summing
 * the home dir against SOCIAL_ACCOUNT_QUOTA_MB is the figure that
 * matches what cPanel's Disk Usage page shows for the account.
 */
function socialAccountUsageBytes(): int
{
    return socialDirSizeBytes(socialAccountHomeDir());
}

// ── Time helpers ────────────────────────────────────────────────────────

/** Parse a MySQL UTC datetime string to a unix ts (null when empty/invalid). */
function socialParseUtc(?string $s): ?int
{
    if ($s === null) return null;
    $s = trim($s);
    if ($s === '' || str_starts_with($s, '0000-00-00')) return null;
    $ts = strtotime($s . ' UTC');
    return $ts === false ? null : $ts;
}

// ── Purge decision (PURE — the testable core) ───────────────────────────

/**
 * Decide whether a post's server media file should be purged now.
 *
 * @param array $post    social_posts row (status, media_path, media_purged_at, updated_at, created_at)
 * @param array $targets social_post_targets rows for the post
 * @return ?array ['reason'=>string,'note'=>string] or null to keep the file
 */
function socialPurgeDecision(array $post, array $targets, int $now, bool $emergency = false): ?array
{
    if (empty($post['media_path'])) return null;
    if (!empty($post['media_purged_at'])) return null;
    $status = (string)($post['status'] ?? '');

    // Cancelled: purge 24h after the cancellation (row's updated_at).
    if ($status === 'cancelled') {
        $base = socialParseUtc($post['updated_at'] ?? null) ?? socialParseUtc($post['created_at'] ?? null);
        if ($base !== null && $now - $base >= 24 * 3600) {
            return ['reason' => 'cancelled_24h',
                    'note' => 'Media purged: post cancelled >24h ago. Server copy deleted; any platform URLs on the targets are unaffected.'];
        }
        return null;
    }

    $anyPublished = false;   // at least one target live with a URL
    $allSettledLive = $targets !== []; // every target published-with-URL or skipped
    $anyFailed = false;
    $anyOpen = false;        // pending/publishing — work still in flight
    $lastPublish = null;
    $lastFailedAttempt = null; // retry clock runs off FAILED targets only —
                               // a healthy target's recent update must not
                               // extend a failed target's 7-day window.
    foreach ($targets as $t) {
        $ts = (string)($t['status'] ?? '');
        $updated = socialParseUtc($t['updated_at'] ?? null);
        if ($ts === 'failed' && $updated !== null) $lastFailedAttempt = max($lastFailedAttempt ?? 0, $updated);
        if ($ts === 'published' && !empty($t['platform_url'])) {
            $anyPublished = true;
            $pub = socialParseUtc($t['published_at'] ?? null) ?? $updated;
            if ($pub !== null) $lastPublish = max($lastPublish ?? 0, $pub);
        } elseif ($ts === 'skipped') {
            // Terminal by decision — does not block the published rule.
        } else {
            $allSettledLive = false;
        }
        if ($ts === 'failed') $anyFailed = true;
        if ($ts === 'pending' || $ts === 'publishing') $anyOpen = true;
    }

    // Fully live everywhere it was sent: the platforms hold the content.
    if ($anyPublished && $allSettledLive && $lastPublish !== null) {
        if ($emergency) {
            return ['reason' => 'emergency_storage_95',
                    'note' => 'Media purged EARLY by the storage watchdog (account usage ≥95% of quota): 72h grace skipped to protect the website. Content lives on the platforms; URLs are on the targets.'];
        }
        if ($now - $lastPublish >= 72 * 3600) {
            return ['reason' => 'published_grace_72h',
                    'note' => 'Media purged: all targets published >72h ago. Server copy deleted; content lives on the platforms (URLs on the targets).'];
        }
        return null; // still inside the grace window — nothing else applies
    }

    // Something failed and nothing is still in flight: 7-day retry window.
    if (($anyFailed || ($targets === [] && $status === 'failed')) && !$anyOpen) {
        $base = $lastFailedAttempt ?? socialParseUtc($post['updated_at'] ?? null);
        if ($base !== null && $now - $base >= 7 * 24 * 3600) {
            return ['reason' => 'failed_retention_7d',
                    'note' => 'Media purged: post had failed target(s) and the 7-day retry window elapsed with no successful publish. Server copy deleted.'];
        }
    }
    return null;
}

// ── Dry-run gate ────────────────────────────────────────────────────────

/**
 * PURE dry-run resolution.
 * @param ?string $envRaw  raw SOCIAL_PURGE_DRYRUN_UNTIL value (null = env absent)
 * @param ?int    $anchor  first-run anchor ts (dry-run start), if recorded
 * @return array{dryRun:bool, until:?int, source:string}
 */
function socialPurgeDryRunResolve(?string $envRaw, ?int $anchor, int $now): array
{
    if ($envRaw !== null && trim($envRaw) !== '') {
        $v = strtolower(trim($envRaw));
        if ($v === '0' || $v === 'off' || $v === 'false' || $v === 'no') {
            return ['dryRun' => false, 'until' => null, 'source' => 'env-off'];
        }
        $until = is_numeric($v) ? (int)$v : strtotime(trim($envRaw));
        if ($until !== false && $until !== null) {
            return ['dryRun' => $now < (int)$until, 'until' => (int)$until, 'source' => 'env'];
        }
        // Unparseable env value: fail safe — stay in dry-run.
        return ['dryRun' => true, 'until' => null, 'source' => 'env-unparseable'];
    }
    if ($anchor !== null) {
        $until = $anchor + 48 * 3600;
        return ['dryRun' => $now < $until, 'until' => $until, 'source' => 'default-48h'];
    }
    // No env, no anchor yet: dry-run ON (the caller records the anchor).
    return ['dryRun' => true, 'until' => null, 'source' => 'default-on'];
}

/** Read (and on first sight, record) the dry-run anchor in app_settings. */
function socialPurgeAnchor(): ?int
{
    try {
        $stmt = db()->prepare('SELECT value_enc FROM app_settings WHERE setting_key = ? LIMIT 1');
        $stmt->execute([SOCIAL_PURGE_ANCHOR_KEY]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $raw = $row ? decAtRest($row['value_enc'] ?? null) : '';
        $data = $raw !== '' ? json_decode($raw, true) : null;
        if (is_array($data) && !empty($data['anchor'])) return (int)$data['anchor'];
        $anchor = time();
        db()->prepare(
            'INSERT INTO app_settings (setting_key, value_enc, updated_by, updated_at)
             VALUES (?, ?, NULL, UTC_TIMESTAMP())
             ON DUPLICATE KEY UPDATE value_enc = VALUES(value_enc), updated_at = UTC_TIMESTAMP()'
        )->execute([SOCIAL_PURGE_ANCHOR_KEY, encAtRest((string)json_encode(['anchor' => $anchor]))]);
        return $anchor;
    } catch (Throwable $e) {
        error_log('[social-storage] dry-run anchor unavailable: ' . substr($e->getMessage(), 0, 120));
        return null;
    }
}

function socialPurgeDryRunInfo(): array
{
    $env = getenv('SOCIAL_PURGE_DRYRUN_UNTIL');
    $envRaw = $env === false ? null : (string)$env;
    $anchor = null;
    if ($envRaw === null || trim($envRaw) === '') {
        // Only the default path needs the anchor; an explicit env wins.
        if (function_exists('db')) $anchor = socialPurgeAnchor();
    }
    return socialPurgeDryRunResolve($envRaw, $anchor, time());
}

// ── Purge sweep (DB + filesystem; called by the publish cron) ───────────

/**
 * Sweep candidate posts and purge per socialPurgeDecision().
 * Idempotent: purged rows get media_path=NULL + media_purged_at set, so
 * re-runs skip them. A file still referenced by another unpurged post
 * (possible via ingest mediaRef) is NOT unlinked — only the row's
 * reference is cleared; the last referrer's purge removes the file.
 *
 * @return array summary for the cron JSON output
 */
function socialPurgeSweep(bool $emergency = false): array
{
    $info = socialPurgeDryRunInfo();
    // Emergency (≥95%) overrides dry-run: protecting the website's disk
    // outranks the 48h observation window. The override is logged.
    $dry = $info['dryRun'] && !$emergency;
    $out = [
        'dryRun' => $dry,
        'dryRunUntil' => $info['until'] ? gmdate('Y-m-d H:i:s', $info['until']) . ' UTC' : null,
        'dryRunSource' => $info['source'],
        'emergency' => $emergency,
        'purged' => [],
        'wouldPurge' => [],
        'bytesFreed' => 0,
    ];
    try {
        $rows = db()->query(
            "SELECT * FROM social_posts
              WHERE media_path IS NOT NULL AND media_path <> '' AND media_purged_at IS NULL
                AND status IN ('published','partial','failed','cancelled')
              ORDER BY created_at ASC LIMIT 200"
        )->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        // Pre-migration safety: the media_purged_at column lands with the
        // same deploy, but migration runs on the next web request — until
        // then the sweep skips cleanly instead of failing the cron.
        $out['skipped'] = 'purge columns not present yet (migration pending)';
        return $out;
    }
    $tgtStmt = db()->prepare('SELECT * FROM social_post_targets WHERE post_id = ?');
    $shareStmt = db()->prepare('SELECT COUNT(*) AS n FROM social_posts WHERE media_path = ? AND id <> ? AND media_purged_at IS NULL');
    $updStmt = db()->prepare('UPDATE social_posts SET media_path = NULL, media_purged_at = UTC_TIMESTAMP(), media_purge_note = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?');
    // Same update + thumbnail cleanup, prepared lazily inside the row
    // loop (only when a row actually carries the thumbnail_path key —
    // SELECT * omits it pre-migration, and preparing against a missing
    // column here would throw outside the guarded section above).
    $updThumbStmt = null;
    foreach ($rows as $row) {
        try {
            $tgtStmt->execute([(string)$row['id']]);
            $targets = $tgtStmt->fetchAll(PDO::FETCH_ASSOC);
            $decision = socialPurgeDecision($row, $targets, time(), $emergency);
            if ($decision === null) continue;
            $file = function_exists('socialMediaFile') ? socialMediaFile($row['media_path'] ?? null) : null;
            $bytes = $file ? (int)@filesize($file) : 0;
            $entry = ['post' => (string)$row['id'], 'file' => basename((string)$row['media_path']), 'bytes' => $bytes, 'reason' => $decision['reason']];
            if ($dry) { $out['wouldPurge'][] = $entry; continue; }
            $shareStmt->execute([(string)$row['media_path'], (string)$row['id']]);
            $shared = (int)($shareStmt->fetch(PDO::FETCH_ASSOC)['n'] ?? 0) > 0;
            if ($file && !$shared) @unlink($file);
            $note = $decision['note'] . ($shared ? ' (File kept: still referenced by another post.)' : '');
            // The custom thumbnail dies with the video: it is unique to
            // this post (always a fresh upload, never a mediaRef), so it
            // is unlinked unconditionally and its column cleared in the
            // same update — otherwise thumbnails would leak ~2 MB per
            // purged post forever.
            $thumbFreed = 0;
            if (array_key_exists('thumbnail_path', $row)) {
                if (!empty($row['thumbnail_path'])) {
                    $thumbFile = function_exists('socialMediaFile') ? socialMediaFile((string)$row['thumbnail_path']) : null;
                    if ($thumbFile) {
                        $thumbFreed = (int)@filesize($thumbFile);
                        @unlink($thumbFile);
                    }
                }
                $updThumbStmt ??= db()->prepare('UPDATE social_posts SET media_path = NULL, thumbnail_path = NULL, media_purged_at = UTC_TIMESTAMP(), media_purge_note = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?');
                $updThumbStmt->execute([$note, (string)$row['id']]);
            } else {
                $updStmt->execute([$note, (string)$row['id']]);
            }
            $entry['sharedFileKept'] = $shared;
            $out['purged'][] = $entry;
            if (!$shared) $out['bytesFreed'] += $bytes;
            $out['bytesFreed'] += $thumbFreed;
        } catch (Throwable $e) {
            error_log('[social-storage] purge failed for post ' . ($row['id'] ?? '?') . ': ' . substr($e->getMessage(), 0, 160));
        }
    }
    return $out;
}

// ── Directory budget ────────────────────────────────────────────────────

/** True when the media dir (+ an incoming file) is at/over the budget. */
function socialMediaBudgetExceeded(int $incomingBytes = 0): bool
{
    return socialDirSizeBytes(socialMediaDirPath()) + max(0, $incomingBytes) >= socialMediaBudgetBytes();
}

function socialMediaBudgetError(): string
{
    $gb = rtrim(rtrim(number_format(socialMediaBudgetBytes() / 1073741824, 2), '0'), '.');
    return 'Social media storage is at its ' . $gb . ' GB budget — new videos are paused until published files are purged or the budget is raised (SOCIAL_MEDIA_BUDGET_BYTES). Nothing was saved.';
}

// ── Account watchdog ────────────────────────────────────────────────────

function socialStorageWatchdogRead(): ?array
{
    try {
        $stmt = db()->prepare('SELECT value_enc FROM app_settings WHERE setting_key = ? LIMIT 1');
        $stmt->execute([SOCIAL_STORAGE_WATCHDOG_KEY]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $raw = $row ? decAtRest($row['value_enc'] ?? null) : '';
        $data = $raw !== '' ? json_decode($raw, true) : null;
        return is_array($data) ? $data : null;
    } catch (Throwable) {
        return null;
    }
}

function socialStorageWatchdogWrite(array $state): void
{
    try {
        db()->prepare(
            'INSERT INTO app_settings (setting_key, value_enc, updated_by, updated_at)
             VALUES (?, ?, NULL, UTC_TIMESTAMP())
             ON DUPLICATE KEY UPDATE value_enc = VALUES(value_enc), updated_at = UTC_TIMESTAMP()'
        )->execute([SOCIAL_STORAGE_WATCHDOG_KEY, encAtRest((string)json_encode($state))]);
    } catch (Throwable $e) {
        error_log('[social-storage] watchdog persist failed: ' . substr($e->getMessage(), 0, 120));
    }
}

/** Persistent ≥85% flag: blocks new renders/ingest; publishing unaffected. */
function socialStorageIngestBlocked(): bool
{
    $wd = socialStorageWatchdogRead();
    return !empty($wd['ingestBlocked']);
}

/**
 * Evaluate the watchdog once (hourly cron): measure, tier, persist.
 * Tiers: ok <70 · watch ≥70 · block ≥85 (ingest blocked) · emergency ≥95.
 */
function socialStorageWatchdogEvaluate(): array
{
    $quota = socialAccountQuotaBytes();
    $used = socialAccountUsageBytes();
    $pct = $quota > 0 ? round($used / $quota * 100, 2) : 0.0;
    $tier = $pct >= 95 ? 'emergency' : ($pct >= 85 ? 'block' : ($pct >= 70 ? 'watch' : 'ok'));
    $state = [
        'pct' => $pct,
        'usedBytes' => $used,
        'quotaBytes' => $quota,
        'tier' => $tier,
        'ingestBlocked' => $pct >= 85,
        'evaluatedAt' => gmdate('Y-m-d H:i:s') . ' UTC',
        'usageMethod' => 'recursive sum of account home dir vs SOCIAL_ACCOUNT_QUOTA_MB (matches cPanel Disk Usage; disk_free_space reports the whole server partition, not the account quota)',
    ];
    if ($tier !== 'ok') {
        $state['warning'] = 'Storage ' . $tier . ': account disk usage at ' . $pct . '% of quota'
            . ($tier === 'watch' ? '.' : ' — new renders/ingest paused, publishing continues.')
            . ($tier === 'emergency' ? ' Emergency purge of published media ran with this evaluation.' : '');
    }
    socialStorageWatchdogWrite($state);
    return $state;
}

// ── Admin status payload ────────────────────────────────────────────────

/** Storage block for the admin scheduler accounts/status payload. */
function socialStorageStatus(): array
{
    $dirBytes = socialDirSizeBytes(socialMediaDirPath());
    $budget = socialMediaBudgetBytes();
    $wd = socialStorageWatchdogRead();
    $dry = socialPurgeDryRunInfo();
    return [
        'mediaDirBytes' => $dirBytes,
        'mediaBudgetBytes' => $budget,
        'mediaBudgetUsedPct' => $budget > 0 ? round($dirBytes / $budget * 100, 2) : 0.0,
        'accountUsagePct' => $wd['pct'] ?? null,
        'accountUsedBytes' => $wd['usedBytes'] ?? null,
        'accountQuotaBytes' => $wd['quotaBytes'] ?? socialAccountQuotaBytes(),
        'storageTier' => $wd['tier'] ?? 'unknown',
        'storageWarning' => $wd['warning'] ?? null,
        'watchdogEvaluatedAt' => $wd['evaluatedAt'] ?? null,
        'ingestBlocked' => socialStorageIngestBlocked(),
        'purgeDryRun' => $dry['dryRun'],
        'purgeDryRunUntil' => $dry['until'] ? gmdate('Y-m-d H:i:s', $dry['until']) . ' UTC' : null,
    ];
}
