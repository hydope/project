<?php
// Social Publisher (Phase 1, 2026-11-21) — publishes NATIVELY to the
// platforms via their official APIs. The admin portal is only the control
// panel; nothing here posts anything on shiarishta.com itself.
//
//   Facebook Page : Graph API feed / photos / videos / video_reels
//   Instagram     : Graph API media containers (image + REELS) + publish
//   YouTube       : Data API v3 resumable videos.insert, with
//                   status.publishAt for native scheduling when the
//                   post's scheduled time is still in the future
//
// Tokens come from social_accounts (encAtRest ciphertext). YouTube access
// tokens are refreshed from the stored refresh_token when expired.
// Every call goes through socialHttp() (curl, timeouts) and every failure
// is returned as a structured ['ok'=>false,'error'=>...] — never thrown
// into the caller, so one bad target cannot strand the others.
declare(strict_types=1);

// ── HTTP ────────────────────────────────────────────────────────────────

/** @return array{status:int,json:?array,raw:string,error:?string} */
function socialHttp(string $method, string $url, array $opts = []): array
{
    $ch = curl_init($url);
    $headers = $opts['headers'] ?? [];
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HEADER => !empty($opts['wantHeaders']),
        CURLOPT_TIMEOUT => (int)($opts['timeout'] ?? 60),
        CURLOPT_CONNECTTIMEOUT => 10,
    ]);
    if (array_key_exists('body', $opts)) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $opts['body']);
    }
    if ($headers) curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    $raw = curl_exec($ch);
    $err = curl_error($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $respHeaders = [];
    if (!empty($opts['wantHeaders']) && is_string($raw)) {
        $hsize = (int)curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        foreach (explode("\r\n", substr($raw, 0, $hsize)) as $line) {
            if (str_contains($line, ':')) {
                [$k, $v] = explode(':', $line, 2);
                $respHeaders[strtolower(trim($k))] = trim($v);
            }
        }
        $raw = substr($raw, $hsize);
    }
    curl_close($ch);
    if ($raw === false || $err !== '') {
        return ['status' => $status, 'json' => null, 'raw' => '', 'error' => 'Network error: ' . $err, 'headers' => $respHeaders];
    }
    $json = json_decode((string)$raw, true);
    return ['status' => $status, 'json' => is_array($json) ? $json : null, 'raw' => (string)$raw, 'error' => null, 'headers' => $respHeaders];
}

function socialGraphError(array $res, string $what): string
{
    $msg = $res['json']['error']['message'] ?? null;
    if (is_string($msg) && $msg !== '') return $what . ': ' . substr($msg, 0, 300);
    if ($res['error']) return $what . ': ' . $res['error'];
    return $what . ': HTTP ' . $res['status'];
}

// ── Media resolution ────────────────────────────────────────────────────

/** Absolute filesystem path for a stored media_path (relative to the photo root), or null. */
function socialMediaFile(?string $mediaPath): ?string
{
    if (!$mediaPath) return null;
    $rel = ltrim(str_replace('\\', '/', $mediaPath), '/');
    if (str_contains($rel, '..')) return null;
    $abs = photoBaseDir() . '/' . $rel;
    return is_file($abs) ? $abs : null;
}

/** Publicly reachable URL for a post's media (Instagram requires one). */
function socialMediaPublicUrl(array $post): ?string
{
    if (!empty($post['media_url'])) return (string)$post['media_url'];
    if (!empty($post['media_path'])) {
        $base = socialConfig()['apiPublicUrl'];
        return $base . '/social-media/' . rawurlencode(basename((string)$post['media_path']));
    }
    return null;
}

function socialMimeFor(string $file): string
{
    $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
    return ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp',
            'mp4' => 'video/mp4', 'mov' => 'video/quicktime', 'webm' => 'video/webm'][$ext] ?? 'application/octet-stream';
}

// ── Account token handling ──────────────────────────────────────────────

function socialAccountToken(array $account): string
{
    return decAtRest($account['access_token_enc'] ?? null);
}

/** Refresh a YouTube access token if expired (or forced); persists the new token. */
function socialYouTubeAccessToken(array $account, bool $force = false): ?string
{
    $expires = !empty($account['token_expires_at']) ? strtotime((string)$account['token_expires_at']) : 0;
    if (!$force && $expires && $expires > time() + 120) {
        $t = socialAccountToken($account);
        return $t !== '' ? $t : null;
    }
    $refresh = decAtRest($account['refresh_token_enc'] ?? null);
    $cfg = socialConfig();
    if ($refresh === '' || $cfg['googleClientId'] === '' || $cfg['googleClientSecret'] === '') {
        $t = socialAccountToken($account);
        return $t !== '' ? $t : null;
    }
    $res = socialHttp('POST', 'https://oauth2.googleapis.com/token', [
        'body' => http_build_query([
            'client_id' => $cfg['googleClientId'],
            'client_secret' => $cfg['googleClientSecret'],
            'refresh_token' => $refresh,
            'grant_type' => 'refresh_token',
        ]),
        'headers' => ['Content-Type: application/x-www-form-urlencoded'],
    ]);
    $tok = (string)($res['json']['access_token'] ?? '');
    if ($tok === '') {
        error_log('[social] youtube token refresh failed: ' . substr((string)($res['json']['error_description'] ?? $res['raw']), 0, 160));
        return null;
    }
    $exp = gmdate('Y-m-d H:i:s', time() + (int)($res['json']['expires_in'] ?? 3600));
    try {
        db()->prepare('UPDATE social_accounts SET access_token_enc = ?, token_expires_at = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?')
            ->execute([encAtRest($tok), $exp, $account['id']]);
    } catch (Throwable $e) {
        error_log('[social] youtube token persist failed: ' . substr($e->getMessage(), 0, 120));
    }
    return $tok;
}

// ── Meta: Facebook Page ─────────────────────────────────────────────────

function socialPublishFacebook(array $account, array $post, string $caption): array
{
    $pageId = (string)$account['platform_account_id'];
    $token = socialAccountToken($account);
    if ($token === '') return ['ok' => false, 'error' => 'Facebook Page token is missing — reconnect the account.'];
    $v = socialConfig()['metaGraphVersion'];
    $file = socialMediaFile($post['media_path'] ?? null);

    if (($post['media_type'] ?? '') === 'video' && $file) {
        // Reel first (vertical short-form reach); fall back to a plain
        // video post if the Reel flow is rejected.
        $reel = socialFacebookReel($pageId, $token, $post, $caption, $v);
        if ($reel['ok']) return $reel;
        $res = socialHttp('POST', "https://graph-video.facebook.com/{$v}/{$pageId}/videos", [
            'timeout' => 300,
            'body' => ['access_token' => $token, 'description' => $caption, 'source' => new CURLFile($file, socialMimeFor($file), basename($file))],
        ]);
        $id = (string)($res['json']['id'] ?? '');
        if ($id !== '') return ['ok' => true, 'platform_post_id' => $id, 'platform_url' => 'https://www.facebook.com/watch/?v=' . $id];
        return ['ok' => false, 'error' => socialGraphError($res, 'Facebook video post') . ' (Reel attempt: ' . ($reel['error'] ?? 'n/a') . ')'];
    }
    if (($post['media_type'] ?? '') === 'image' && $file) {
        $res = socialHttp('POST', "https://graph.facebook.com/{$v}/{$pageId}/photos", [
            'timeout' => 120,
            'body' => ['access_token' => $token, 'caption' => $caption, 'source' => new CURLFile($file, socialMimeFor($file), basename($file))],
        ]);
        $id = (string)($res['json']['post_id'] ?? $res['json']['id'] ?? '');
        if ($id !== '') return ['ok' => true, 'platform_post_id' => $id, 'platform_url' => 'https://www.facebook.com/' . $id];
        return ['ok' => false, 'error' => socialGraphError($res, 'Facebook photo post')];
    }
    // Text / link post.
    $body = ['access_token' => $token, 'message' => $caption];
    $res = socialHttp('POST', "https://graph.facebook.com/{$v}/{$pageId}/feed", ['body' => $body]);
    $id = (string)($res['json']['id'] ?? '');
    if ($id !== '') return ['ok' => true, 'platform_post_id' => $id, 'platform_url' => 'https://www.facebook.com/' . $id];
    return ['ok' => false, 'error' => socialGraphError($res, 'Facebook feed post')];
}

/**
 * Is a failed Reel step worth a FRESH upload session? Transient means:
 * a network error, any HTTP 5xx (Meta's 503s are routine), a known
 * transient Graph error code, or a phase/session complaint — the
 * 2026-11-22 failure was "(#100) Param upload_phase must be one of
 * {START, FINISH…}", i.e. the session/phase state went bad mid-flow;
 * a brand-new session is exactly the cure. Deterministic errors (bad
 * token 190, permission 200/10, invalid file) are NOT retried — a new
 * session would fail identically and only burn time.
 */
function socialReelFailureRetryable(array $res): bool
{
    if (!empty($res['error'])) return true;               // network layer
    if ((int)($res['status'] ?? 0) >= 500) return true;    // Meta 5xx
    $code = (int)($res['json']['error']['code'] ?? 0);
    if (in_array($code, [1, 2, 4, 17, 32, 341, 613], true)) return true;
    $msg = (string)($res['json']['error']['message'] ?? '');
    foreach (['upload_phase', 'upload session', 'session', 'temporar'] as $needle) {
        if (stripos($msg, $needle) !== false) return true;
    }
    return false;
}

/**
 * ONE Facebook Reel upload session, phases done the way the Graph API
 * actually defines them:
 *   START    POST /{page}/video_reels upload_phase=start
 *            → {video_id, upload_url}
 *   TRANSFER POST the hosted file to the session's own upload_url
 *            (rupload host) with the file_url header — there is NO
 *            'transfer' upload_phase on the video_reels endpoint; the
 *            old code sent one and Meta answered "(#100) Param
 *            upload_phase must be one of {START, FINISH…}".
 *   FINISH   POST /{page}/video_reels upload_phase=finish,
 *            video_state=PUBLISHED, description=caption.
 * A session is single-use: any failure poisons it, and the caller
 * restarts with a FRESH session rather than resuming a dead one.
 */
function socialFacebookReelSession(string $pageId, string $token, string $url, string $caption, string $v): array
{
    $start = socialHttp('POST', "https://graph.facebook.com/{$v}/{$pageId}/video_reels", [
        'body' => ['access_token' => $token, 'upload_phase' => 'start'],
    ]);
    $videoId = (string)($start['json']['video_id'] ?? '');
    $uploadUrl = (string)($start['json']['upload_url'] ?? '');
    if ($videoId === '' || $uploadUrl === '') {
        return ['ok' => false, 'retryable' => socialReelFailureRetryable($start),
            'error' => socialGraphError($start, 'Facebook Reel start')];
    }
    $transfer = socialHttp('POST', $uploadUrl, [
        'headers' => ['Authorization: OAuth ' . $token, 'file_url: ' . $url],
        'timeout' => 300,
    ]);
    $transferOk = $transfer['error'] === null
        && $transfer['status'] >= 200 && $transfer['status'] < 300
        && empty($transfer['json']['error'])
        && ($transfer['json'] === null || !empty($transfer['json']['success']));
    if (!$transferOk) {
        return ['ok' => false, 'retryable' => socialReelFailureRetryable($transfer),
            'error' => socialGraphError($transfer, 'Facebook Reel transfer')];
    }
    $finish = socialHttp('POST', "https://graph.facebook.com/{$v}/{$pageId}/video_reels", [
        'body' => ['access_token' => $token, 'upload_phase' => 'finish', 'video_id' => $videoId, 'video_state' => 'PUBLISHED', 'description' => $caption],
    ]);
    if (empty($finish['json']['success'])) {
        return ['ok' => false, 'retryable' => socialReelFailureRetryable($finish),
            'error' => socialGraphError($finish, 'Facebook Reel finish')];
    }
    return ['ok' => true, 'platform_post_id' => $videoId, 'platform_url' => 'https://www.facebook.com/reel/' . $videoId];
}

function socialFacebookReel(string $pageId, string $token, array $post, string $caption, string $v): array
{
    $url = socialMediaPublicUrl($post);
    if (!$url) return ['ok' => false, 'error' => 'Reels need a publicly reachable video URL.'];
    // Up to 2 restarts with a FRESH session inside this one publish
    // attempt (3 sessions total) — a transient Meta 5xx or a poisoned
    // session must not fail the target when a clean session seconds
    // later succeeds. If every session fails, the caller falls back
    // to a plain video post (see socialPublishFacebook).
    $attempts = 0;
    $lastError = 'Facebook Reel failed.';
    while ($attempts < 3) {
        $attempts++;
        $r = socialFacebookReelSession($pageId, $token, $url, $caption, $v);
        if (!empty($r['ok'])) return $r;
        $lastError = (string)($r['error'] ?? $lastError);
        if (empty($r['retryable']) || $attempts >= 3) break;
        sleep(2);
    }
    return ['ok' => false, 'error' => $lastError . ($attempts > 1 ? " (failed after {$attempts} fresh upload sessions)" : '')];
}

// ── Meta: Instagram ─────────────────────────────────────────────────────

function socialPublishInstagram(array $account, array $post, string $caption, ?string $resumeCreationId = null): array
{
    $igId = (string)$account['platform_account_id'];
    $token = socialAccountToken($account);
    if ($token === '') return ['ok' => false, 'error' => 'Instagram token is missing — reconnect the account.'];
    $url = socialMediaPublicUrl($post);
    if (!$url) return ['ok' => false, 'error' => 'Instagram requires media with a publicly reachable URL — attach an image or video first.'];
    $v = socialConfig()['metaGraphVersion'];
    $isVideo = ($post['media_type'] ?? '') === 'video';

    // Resume a container a previous run created (its id is stashed on
    // the target row): Meta keeps processing it server-side between
    // runs, so by retry time it is usually FINISHED — restarting with
    // a fresh container every retry was resetting that clock and is
    // why Instagram lagged hours behind Facebook. A dead container
    // (ERROR/EXPIRED) falls through to a fresh create.
    $creationId = '';
    if ($isVideo && $resumeCreationId !== null && $resumeCreationId !== '') {
        $st = socialHttp('GET', "https://graph.facebook.com/{$v}/{$resumeCreationId}?fields=status_code&access_token=" . urlencode($token));
        $code = (string)($st['json']['status_code'] ?? '');
        if ($code === 'FINISHED' || $code === 'IN_PROGRESS') {
            $creationId = $resumeCreationId;
        }
    }

    if ($creationId === '') {
        $params = ['access_token' => $token, 'caption' => $caption];
        if ($isVideo) {
            $params['media_type'] = 'REELS';
            $params['video_url'] = $url;
            $params['share_to_feed'] = 'true';
        } else {
            $params['image_url'] = $url;
        }
        $create = socialHttp('POST', "https://graph.facebook.com/{$v}/{$igId}/media", ['body' => $params, 'timeout' => 120]);
        $creationId = (string)($create['json']['id'] ?? '');
        if ($creationId === '') return ['ok' => false, 'error' => socialGraphError($create, 'Instagram media container')];
    }

    // Video containers process asynchronously — poll briefly, then
    // publish. The poll budget is deliberately short (~30s): the whole
    // publish request must finish inside the web server's ~120s
    // connection timeout, so a slow container is handed back as a
    // retryable 'pending' (see socialPublishTarget) and the next cron
    // call re-creates the container and tries again.
    if ($isVideo) {
        $ready = false;
        for ($i = 0; $i < 8; $i++) {
            sleep(4);
            $st = socialHttp('GET', "https://graph.facebook.com/{$v}/{$creationId}?fields=status_code&access_token=" . urlencode($token));
            $code = (string)($st['json']['status_code'] ?? '');
            if ($code === 'FINISHED') { $ready = true; break; }
            if ($code === 'ERROR' || $code === 'EXPIRED') {
                return ['ok' => false, 'error' => 'Instagram video processing ' . strtolower($code) . '.'];
            }
        }
        if (!$ready) return ['ok' => false, 'retry' => true, 'resume_id' => $creationId, 'error' => 'Instagram video still processing after ~30s — returned to pending for the next publish run.'];
    }

    $pub = socialHttp('POST', "https://graph.facebook.com/{$v}/{$igId}/media_publish", [
        'body' => ['access_token' => $token, 'creation_id' => $creationId], 'timeout' => 120,
    ]);
    $mediaId = (string)($pub['json']['id'] ?? '');
    if ($mediaId === '') return ['ok' => false, 'error' => socialGraphError($pub, 'Instagram publish')];
    $link = socialHttp('GET', "https://graph.facebook.com/{$v}/{$mediaId}?fields=permalink&access_token=" . urlencode($token));
    $permalink = (string)($link['json']['permalink'] ?? '');
    return ['ok' => true, 'platform_post_id' => $mediaId, 'platform_url' => $permalink !== '' ? $permalink : 'https://www.instagram.com/'];
}

// ── YouTube ─────────────────────────────────────────────────────────────

function socialPublishYouTube(array $account, array $post, string $caption): array
{
    $file = socialMediaFile($post['media_path'] ?? null);
    if (($post['media_type'] ?? '') !== 'video' || !$file) {
        return ['ok' => false, 'error' => 'YouTube requires a video file — attach one to this post.'];
    }
    $token = socialYouTubeAccessToken($account);
    if (!$token) return ['ok' => false, 'error' => 'YouTube token is missing/expired — reconnect the account.'];

    $lines = preg_split('/\r?\n/', trim($caption)) ?: [];
    $title = mb_substr(trim((string)($lines[0] ?? 'Shia Rishta')), 0, 100);
    if ($title === '') $title = 'Shia Rishta';
    $snippet = ['title' => $title, 'description' => mb_substr($caption, 0, 5000), 'categoryId' => '22'];
    // #Shorts marker when the caller flagged a short via caption override key.
    $status = ['privacyStatus' => 'public', 'selfDeclaredMadeForKids' => false];
    $scheduledAt = !empty($post['scheduled_at']) ? strtotime((string)$post['scheduled_at']) : 0;
    if ($scheduledAt && $scheduledAt > time() + 60) {
        // Native YouTube scheduling: upload as private with publishAt.
        $status['privacyStatus'] = 'private';
        $status['publishAt'] = gmdate('Y-m-d\TH:i:s\Z', $scheduledAt);
    }
    $meta = json_encode(['snippet' => $snippet, 'status' => $status], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    $thumbFile = socialMediaFile($post['thumbnail_path'] ?? null);
    $mime = socialMimeFor($file);
    $size = (int)filesize($file);
    $init = socialHttp('POST', 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', [
        'headers' => [
            'Authorization: Bearer ' . $token,
            'Content-Type: application/json; charset=UTF-8',
            'X-Upload-Content-Length: ' . $size,
            'X-Upload-Content-Type: ' . $mime,
        ],
        'body' => $meta,
        'wantHeaders' => true,
        'timeout' => 60,
    ]);
    $location = $init['headers']['location'] ?? '';
    if ($location === '') {
        if ($init['status'] === 401) {
            // One forced refresh + retry of the initiate step.
            $token = socialYouTubeAccessToken($account, true);
            if ($token) return socialPublishYouTubeWithToken($token, $file, $meta, $thumbFile);
        }
        return ['ok' => false, 'error' => socialGraphError($init, 'YouTube upload init')];
    }
    return socialYouTubePut($location, $token, $file, $thumbFile);
}

function socialPublishYouTubeWithToken(string $token, string $file, string $meta, ?string $thumbFile = null): array
{
    $mime = socialMimeFor($file);
    $init = socialHttp('POST', 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', [
        'headers' => [
            'Authorization: Bearer ' . $token,
            'Content-Type: application/json; charset=UTF-8',
            'X-Upload-Content-Length: ' . (int)filesize($file),
            'X-Upload-Content-Type: ' . $mime,
        ],
        'body' => $meta, 'wantHeaders' => true, 'timeout' => 60,
    ]);
    $location = $init['headers']['location'] ?? '';
    if ($location === '') return ['ok' => false, 'error' => socialGraphError($init, 'YouTube upload init')];
    return socialYouTubePut($location, $token, $file, $thumbFile);
}

function socialYouTubePut(string $location, string $token, string $file, ?string $thumbFile = null): array
{
    $fh = fopen($file, 'rb');
    if ($fh === false) return ['ok' => false, 'error' => 'Could not read the video file on the server.'];
    $ch = curl_init($location);
    curl_setopt_array($ch, [
        CURLOPT_PUT => true,
        CURLOPT_INFILE => $fh,
        CURLOPT_INFILESIZE => (int)filesize($file),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 900,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $token, 'Content-Type: ' . socialMimeFor($file)],
    ]);
    $raw = curl_exec($ch);
    $err = curl_error($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    fclose($fh);
    $json = is_string($raw) ? json_decode($raw, true) : null;
    $id = (string)($json['id'] ?? '');
    if ($id !== '') {
        $out = ['ok' => true, 'platform_post_id' => $id, 'platform_url' => 'https://www.youtube.com/watch?v=' . $id];
        // Custom thumbnail (best-effort): the video is already committed
        // on YouTube at this point, so a thumbnail failure is reported
        // on the result — never turned into a publish failure.
        if ($thumbFile !== null) {
            $thumb = socialYouTubeSetThumbnail($token, $id, $thumbFile);
            if (!empty($thumb['ok'])) {
                $out['thumbnail_ok'] = true;
            } else {
                $out['thumbnail_error'] = (string)($thumb['error'] ?? 'unknown error');
            }
        }
        return $out;
    }
    $msg = (string)($json['error']['message'] ?? $err);
    return ['ok' => false, 'error' => 'YouTube upload: ' . substr($msg !== '' ? $msg : ('HTTP ' . $status), 0, 300)];
}

/**
 * Apply a custom thumbnail to an uploaded YouTube video
 * (thumbnails.set). Best-effort by contract: returns a structured
 * result and never throws; the caller records the outcome without
 * failing the publish. Note the channel must be eligible for custom
 * thumbnails (verified channel) or YouTube answers 403 — that failure
 * is recorded the same way.
 */
function socialYouTubeSetThumbnail(string $token, string $videoId, string $thumbFile): array
{
    $bytes = @file_get_contents($thumbFile);
    if ($bytes === false || $bytes === '') {
        error_log('[social] youtube thumbnail: could not read ' . basename($thumbFile));
        return ['ok' => false, 'error' => 'thumbnail file unreadable on the server'];
    }
    $res = socialHttp('POST', 'https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=' . urlencode($videoId), [
        'headers' => [
            'Authorization: Bearer ' . $token,
            'Content-Type: ' . socialMimeFor($thumbFile),
        ],
        'body' => $bytes,
        'timeout' => 120,
    ]);
    if ($res['status'] >= 200 && $res['status'] < 300 && !empty($res['json']['items'])) {
        error_log('[social] youtube thumbnail set for video ' . $videoId);
        return ['ok' => true];
    }
    $err = socialGraphError($res, 'YouTube thumbnail');
    error_log('[social] youtube thumbnail failed for video ' . $videoId . ': ' . substr($err, 0, 200));
    return ['ok' => false, 'error' => $err];
}

// ── Orchestration (shared by publish-now, retry and the cron worker) ────

function socialCaptionFor(array $post, string $platform): string
{
    $overrides = json_decode((string)($post['caption_overrides'] ?? ''), true);
    if (is_array($overrides) && isset($overrides[$platform]) && trim((string)$overrides[$platform]) !== '') {
        return (string)$overrides[$platform];
    }
    return (string)$post['caption'];
}

/**
 * Atomically claim one target for publishing: a SINGLE conditional
 * UPDATE that flips the row to 'publishing' only while it is
 * claimable — 'pending'/'failed', or a 'publishing' claim gone stale
 * (>20 min: every platform call is time-bounded well under that, so a
 * fresher claim belongs to a live run). The caller proceeds ONLY when
 * the claim actually changed the row (rowCount === 1). Two concurrent
 * invocations — on 2026-11-22 the server cron and the GitHub workflow
 * overlapped and posted the same Facebook Reel twice — can never both
 * win this UPDATE, so they can never both publish. attempts is bumped
 * inside the same UPDATE, so a lost race costs the loser nothing.
 */
function socialClaimTarget(PDO $pdo, string $targetId): bool
{
    $stmt = $pdo->prepare(
        "UPDATE social_post_targets
            SET status = 'publishing', attempts = attempts + 1, updated_at = UTC_TIMESTAMP()
          WHERE id = ?
            AND (status IN ('pending', 'failed')
                 OR (status = 'publishing' AND updated_at <= UTC_TIMESTAMP() - INTERVAL 20 MINUTE))"
    );
    $stmt->execute([$targetId]);
    return $stmt->rowCount() === 1;
}

/**
 * Pure mirror of socialClaimTarget()'s WHERE clause, so the claim
 * decision is unit-testable without a database: a target is claimable
 * when it is pending/failed, or when its 'publishing' claim is stale
 * (>20 min old). A second claim on an already-claimed (fresh) target
 * is NOT claimable — it changes nothing.
 */
function socialTargetClaimable(array $target, int $now): bool
{
    $status = (string)($target['status'] ?? '');
    if (in_array($status, ['pending', 'failed'], true)) return true;
    if ($status === 'publishing') {
        $upd = !empty($target['updated_at']) ? strtotime((string)$target['updated_at'] . ' UTC') : false;
        return $upd !== false && $upd <= $now - 1200;
    }
    return false;
}

/**
 * The note recorded on a target row after a SUCCESSFUL publish whose
 * best-effort extras failed (YouTube custom thumbnail, the FB/IG first
 * comment). The publish itself stays 'published' — the post is the
 * committed effect; a note is not a failure. Pure: unit-tested.
 */
function socialPublishedNote(array $result): ?string
{
    $parts = [];
    if (!empty($result['thumbnail_error'])) $parts[] = 'custom thumbnail not set: ' . (string)$result['thumbnail_error'];
    if (!empty($result['comment_error'])) $parts[] = 'first comment not posted: ' . (string)$result['comment_error'];
    if ($parts === []) return null;
    return substr('Published OK; ' . implode('; ', $parts), 0, 1000);
}

/**
 * The hook question for the automatic first comment: post captions
 * lead with the story's hook as a one-line question or shock
 * statement, followed on the SAME line by the call-to-action and the
 * hashtags — so the hook is the caption's first line, cut at its
 * first sentence end. Pure: unit-tested.
 */
function socialHookQuestion(string $caption): string
{
    $lines = preg_split('/\r?\n/', trim($caption)) ?: [];
    $first = trim((string)($lines[0] ?? ''));
    if ($first === '') return '';
    if (preg_match('/^.*?[.!?]+(?=\s|$)/us', $first, $m) === 1) {
        $first = trim($m[0]);
    }
    return mb_substr($first, 0, 280);
}

/**
 * Post the automatic FIRST COMMENT on a freshly published Facebook /
 * Instagram post: the story's hook question (see socialHookQuestion).
 * Comments are the strongest early engagement signal the platforms
 * rank on, and the question hands viewers the exact thing to answer.
 * STRICTLY best-effort by contract: never throws, and the caller
 * records a failure as a note on the target row — it never fails,
 * retries or unpublishes the post itself. YouTube is skipped (its
 * publish flow has no comment step).
 */
function socialPostFirstComment(array $account, string $platform, string $platformPostId, string $caption): array
{
    if (!in_array($platform, ['facebook', 'instagram'], true)) {
        return ['ok' => false, 'skipped' => true, 'error' => 'First comment applies to Facebook and Instagram only.'];
    }
    $question = socialHookQuestion($caption);
    if ($question === '' || $platformPostId === '') {
        return ['ok' => false, 'skipped' => true, 'error' => 'No hook question in the caption — nothing to comment.'];
    }
    $token = socialAccountToken($account);
    if ($token === '') {
        return ['ok' => false, 'error' => 'Platform token is missing — first comment not posted.'];
    }
    $v = socialConfig()['metaGraphVersion'];
    try {
        $res = socialHttp('POST', "https://graph.facebook.com/{$v}/" . urlencode($platformPostId) . '/comments', [
            'body' => ['access_token' => $token, 'message' => $question],
            'timeout' => 30,
        ]);
    } catch (Throwable $e) {
        return ['ok' => false, 'error' => 'First comment: ' . substr($e->getMessage(), 0, 200)];
    }
    if (!empty($res['json']['id'])) return ['ok' => true, 'comment_id' => (string)$res['json']['id']];
    return ['ok' => false, 'error' => socialGraphError($res, 'First comment')];
}

// ── Facebook daily-cap test (temporary, 2026-11-22) ─────────────────────
//
// Syed's A/B test from the Viral Growth Plan: Facebook gets at most 8
// publishes per calendar day (America/New_York) THROUGH 2026-11-25;
// from 2026-11-26 on there is no cap. The cap + expiry live in
// social_state (key below) so the test can be tuned or killed without
// a deploy; the row is seeded with the defaults on first read. When
// the cap is reached a Facebook target is DEFERRED — back to 'pending'
// with next_retry_at at the next New York midnight — never failed,
// and the watchdog never burns a retry attempt on it. Instagram and
// YouTube are unaffected.

const SOCIAL_FB_CAP_STATE_KEY = 'fb_daily_cap_test';
const SOCIAL_FB_CAP_DEFAULT_CAP = 8;
const SOCIAL_FB_CAP_DEFAULT_UNTIL = '2026-11-25';

/** The cap config from social_state, seeding the test defaults once. */
function socialFacebookCapConfig(): ?array
{
    try {
        $raw = socialStateGet(SOCIAL_FB_CAP_STATE_KEY);
        if ($raw === null || trim($raw) === '') {
            $cfg = ['cap' => SOCIAL_FB_CAP_DEFAULT_CAP, 'until' => SOCIAL_FB_CAP_DEFAULT_UNTIL];
            try {
                socialStateSet(SOCIAL_FB_CAP_STATE_KEY, (string)json_encode($cfg));
            } catch (Throwable $e) {
                error_log('[social] fb cap config seed failed: ' . substr($e->getMessage(), 0, 120));
            }
            return $cfg;
        }
        $cfg = json_decode($raw, true);
        if (!is_array($cfg) || !isset($cfg['cap'], $cfg['until'])) return null;
        return ['cap' => (int)$cfg['cap'], 'until' => (string)$cfg['until']];
    } catch (Throwable $e) {
        // A broken state store must not break publishing; fall back to
        // the built-in test defaults (which expire on their own).
        error_log('[social] fb cap config read failed: ' . substr($e->getMessage(), 0, 120));
        return ['cap' => SOCIAL_FB_CAP_DEFAULT_CAP, 'until' => SOCIAL_FB_CAP_DEFAULT_UNTIL];
    }
}

/**
 * The Facebook cap in force on an America/New_York calendar date
 * ('Y-m-d'), or null when no cap applies. The test is active THROUGH
 * its 'until' date inclusive; after that date there is no cap.
 * Pure: unit-tested.
 */
function socialFacebookCapForDate(?array $config, string $nyDate): ?int
{
    if ($config === null) return null;
    $cap = (int)($config['cap'] ?? 0);
    $until = (string)($config['until'] ?? '');
    if ($cap <= 0 || $until === '') return null;
    return strcmp($nyDate, $until) <= 0 ? $cap : null;
}

/** May one more Facebook publish go out today? Pure: unit-tested. */
function socialFacebookCapAllows(int $publishedToday, ?int $cap): bool
{
    return $cap === null || $publishedToday < $cap;
}

/**
 * [nyDate, startUtc, endUtc] for the America/New_York calendar day
 * containing $now (unix ts) — start/end are UTC 'Y-m-d H:i:s' strings
 * bounding that NY day, for comparison against stored UTC timestamps.
 * Pure: unit-tested.
 */
function socialNyDayBoundsUtc(int $now): array
{
    $tz = new DateTimeZone('America/New_York');
    $start = (new DateTimeImmutable('@' . $now))->setTimezone($tz)->setTime(0, 0, 0);
    $end = $start->modify('+1 day');
    $utc = new DateTimeZone('UTC');
    return [
        $start->format('Y-m-d'),
        $start->setTimezone($utc)->format('Y-m-d H:i:s'),
        $end->setTimezone($utc)->format('Y-m-d H:i:s'),
    ];
}

/**
 * If the Facebook daily cap is in force AND already reached, the
 * deferral for a Facebook target: park it until the next New York
 * midnight. Returns null when the publish may proceed (cap inactive,
 * expired, or not yet reached).
 */
function socialFacebookCapDeferral(PDO $pdo, int $now): ?array
{
    $config = socialFacebookCapConfig();
    [$nyDate, $startUtc, $endUtc] = socialNyDayBoundsUtc($now);
    $cap = socialFacebookCapForDate($config, $nyDate);
    if ($cap === null) return null;
    $stmt = $pdo->prepare(
        "SELECT COUNT(*) FROM social_post_targets
          WHERE platform = 'facebook' AND status = 'published'
            AND published_at >= ? AND published_at < ?"
    );
    $stmt->execute([$startUtc, $endUtc]);
    if (socialFacebookCapAllows((int)$stmt->fetchColumn(), $cap)) return null;
    return ['cap' => $cap, 'until' => (string)($config['until'] ?? ''), 'defer_until' => $endUtc];
}

/**
 * Publish one target row. Returns the publisher result and persists it.
 * Also maintains the account failure rail: 3 consecutive failures mark
 * the account 'needs_attention' (autopilot + admin surface read this).
 */
function socialPublishTarget(array $target): array
{
    $pdo = db();
    $stmt = $pdo->prepare('SELECT * FROM social_accounts WHERE id = ? LIMIT 1');
    $stmt->execute([$target['social_account_id']]);
    $account = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$account) {
        $result = ['ok' => false, 'error' => 'Connected account no longer exists.'];
    } elseif ((string)$account['status'] === 'disconnected') {
        $result = ['ok' => false, 'error' => 'Account is disconnected — reconnect it in the admin.'];
    } else {
        $stmt = $pdo->prepare('SELECT * FROM social_posts WHERE id = ? LIMIT 1');
        $stmt->execute([$target['post_id']]);
        $post = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
        $caption = socialCaptionFor($post, (string)$target['platform']);
        // ATOMIC CLAIM: exactly one concurrent worker wins the target;
        // a loser returns 'skipped' BEFORE any platform call and
        // persists nothing, so the winner's row is never disturbed.
        if (!socialClaimTarget($pdo, (string)$target['id'])) {
            return ['ok' => false, 'skipped' => true,
                'error' => 'Target already claimed by another publish run — skipped so it can never be posted twice.'];
        }
        // Facebook daily-cap test: at the cap, the target is deferred
        // to the next New York day (persisted below) — not published,
        // not failed.
        $capDeferral = (string)$target['platform'] === 'facebook' ? socialFacebookCapDeferral($pdo, time()) : null;
        if ($capDeferral !== null) {
            $result = ['ok' => false, 'deferred' => true,
                'error' => 'Facebook daily cap reached (' . $capDeferral['cap'] . '/day test through ' . $capDeferral['until'] . ') — deferred to the next day.',
                'defer_until' => $capDeferral['defer_until']];
        } else {
            try {
                $result = match ((string)$target['platform']) {
                    'facebook' => socialPublishFacebook($account, $post, $caption),
                    'instagram' => socialPublishInstagram($account, $post, $caption, trim((string)($target['platform_post_id'] ?? '')) !== '' ? (string)$target['platform_post_id'] : null),
                    'youtube' => socialPublishYouTube($account, $post, $caption),
                    default => ['ok' => false, 'error' => 'Unknown platform: ' . $target['platform']],
                };
            } catch (Throwable $e) {
                $result = ['ok' => false, 'error' => substr($e->getMessage(), 0, 300)];
            }
            // FIRST COMMENT (engagement): on a successful Facebook /
            // Instagram publish, comment the story's hook question on
            // the new post. Best-effort by contract — a failure is
            // carried on the result and noted on the target row by the
            // success persistence below; it never fails the publish.
            if (!empty($result['ok']) && in_array((string)$target['platform'], ['facebook', 'instagram'], true)) {
                $comment = socialPostFirstComment($account, (string)$target['platform'], (string)($result['platform_post_id'] ?? ''), $caption);
                if (empty($comment['ok']) && empty($comment['skipped'])) {
                    $result['comment_error'] = (string)($comment['error'] ?? 'unknown error');
                }
            }
        }
    }

    if (empty($result['ok']) && !empty($result['deferred'])) {
        // Daily-cap deferral: NOT a failure and NOT a soft platform
        // outcome — the target simply waits for the next calendar day.
        // Back to 'pending' with next_retry_at at the next New York
        // midnight: the watchdog honours next_retry_at and never burns
        // a retry attempt on a capped target, and the account failure
        // rail below is never reached.
        $pdo->prepare("UPDATE social_post_targets SET status = 'pending', error = ?, next_retry_at = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?")
            ->execute([substr((string)($result['error'] ?? 'Deferred.'), 0, 1000), (string)($result['defer_until'] ?? gmdate('Y-m-d H:i:s', time() + 3600)), $target['id']]);
        return $result;
    }

    if (empty($result['ok']) && !empty($result['retry'])) {
        // Not a failure — the platform is just slow (e.g. Instagram is
        // still processing the video). Put the target back to 'pending'
        // so the next publish run retries it, and do NOT touch the
        // account failure rail. When the publisher hands back a
        // resume_id (the Instagram container it created), stash it in
        // platform_post_id so the retry resumes THAT container instead
        // of restarting Meta's processing from zero; a successful
        // publish overwrites the field with the real media id.
        if (!empty($result['resume_id'])) {
            $pdo->prepare("UPDATE social_post_targets SET status = 'pending', platform_post_id = ?, error = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?")
                ->execute([(string)$result['resume_id'], substr((string)($result['error'] ?? 'Will retry.'), 0, 1000), $target['id']]);
        } else {
            $pdo->prepare("UPDATE social_post_targets SET status = 'pending', error = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?")
                ->execute([substr((string)($result['error'] ?? 'Will retry.'), 0, 1000), $target['id']]);
        }
        return $result;
    }

    if (!empty($result['ok'])) {
        // Best-effort extras that failed (a YouTube custom thumbnail,
        // the FB/IG first comment) are noted on the target's error
        // field while the publish itself stays 'published' — the post
        // is the committed effect; a note is not a failure.
        $note = socialPublishedNote($result);
        $pdo->prepare("UPDATE social_post_targets SET status = 'published', platform_post_id = ?, platform_url = ?, error = ?, published_at = UTC_TIMESTAMP(), retry_attempts = 0, next_retry_at = NULL, updated_at = UTC_TIMESTAMP() WHERE id = ?")
            ->execute([$result['platform_post_id'] ?? null, $result['platform_url'] ?? null, $note, $target['id']]);
        $pdo->prepare("UPDATE social_accounts SET consecutive_failures = 0, status = CASE WHEN status = 'needs_attention' THEN 'connected' ELSE status END, updated_at = UTC_TIMESTAMP() WHERE id = ?")
            ->execute([$target['social_account_id']]);
    } else {
        $pdo->prepare("UPDATE social_post_targets SET status = 'failed', error = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?")
            ->execute([substr((string)($result['error'] ?? 'Publish failed.'), 0, 1000), $target['id']]);
        // Failure rail: bump the account counter; at 3 in a row the
        // account is flagged needs_attention and autopilot skips it.
        try {
            $pdo->prepare('UPDATE social_accounts SET consecutive_failures = consecutive_failures + 1, updated_at = UTC_TIMESTAMP() WHERE id = ?')
                ->execute([$target['social_account_id']]);
            $pdo->prepare("UPDATE social_accounts SET status = 'needs_attention' WHERE id = ? AND consecutive_failures >= 3 AND status = 'connected'")
                ->execute([$target['social_account_id']]);
        } catch (Throwable $e) {
            error_log('[social] failure-rail update failed: ' . substr($e->getMessage(), 0, 120));
        }
    }
    return $result;
}

/** Recompute a post's aggregate status from its targets. */
function socialRecalcPostStatus(string $postId): string
{
    $pdo = db();
    $stmt = $pdo->prepare('SELECT status FROM social_post_targets WHERE post_id = ?');
    $stmt->execute([$postId]);
    $statuses = array_map('strval', $stmt->fetchAll(PDO::FETCH_COLUMN) ?: []);
    if ($statuses === []) return 'draft';
    $published = count(array_filter($statuses, fn($s) => $s === 'published'));
    // 'dead' (watchdog gave up after 6 retries) aggregates like 'failed':
    // the post is finished-with-errors, never silently 'scheduled'.
    $failed = count(array_filter($statuses, fn($s) => $s === 'failed' || $s === 'dead'));
    $pending = count(array_filter($statuses, fn($s) => in_array($s, ['pending', 'publishing'], true)));
    $status = match (true) {
        $published === count($statuses) => 'published',
        $published > 0 && $pending === 0 => 'partial',
        $pending > 0 && $published === 0 && $failed === 0 => 'scheduled',
        $failed === count($statuses) => 'failed',
        $published > 0 => 'partial',
        default => 'failed',
    };
    // Never downgrade a draft with no due intent: pending targets on a
    // draft post keep it a draft.
    $row = $pdo->prepare('SELECT status FROM social_posts WHERE id = ?');
    $row->execute([$postId]);
    $current = (string)($row->fetch(PDO::FETCH_ASSOC)['status'] ?? '');
    if ($current === 'draft' && $published === 0 && $failed === 0) $status = 'draft';
    $pdo->prepare('UPDATE social_posts SET status = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?')->execute([$status, $postId]);
    return $status;
}

/**
 * Publish every due/pending target of a post (or only failed ones when
 * $onlyFailed). Used by publish-now, retry, and social-publish-cron.
 */
function socialPublishPost(string $postId, bool $onlyFailed = false, ?int $deadline = null): array
{
    $pdo = db();
    $pdo->prepare("UPDATE social_posts SET status = 'publishing', updated_at = UTC_TIMESTAMP() WHERE id = ? AND status <> 'draft'")
        ->execute([$postId]);
    // Both publish-now and the cron (re)try pending AND failed targets;
    // a plain first run has only pending rows anyway. $onlyFailed is kept
    // for call-site clarity (retry endpoint) — behaviour is identical.
    // A target stranded in 'publishing' by a run that died mid-publish
    // (client timeout, worker kill) is retried once its claim is stale
    // (>20 min): every platform call is time-bounded well under that,
    // so a fresher 'publishing' row belongs to a live run and is left
    // alone — this is what keeps a dead run from wedging a target
    // forever without ever double-posting an active one.
    $stmt = $pdo->prepare("SELECT * FROM social_post_targets WHERE post_id = ? AND (status IN ('pending', 'failed') OR (status = 'publishing' AND updated_at <= UTC_TIMESTAMP() - INTERVAL 20 MINUTE))");
    $stmt->execute([$postId]);
    $results = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $target) {
        // Deadline (set by the cron): once it passes, stop starting new
        // targets — they stay 'pending' and the next trigger resumes
        // them. This keeps every HTTP invocation comfortably inside
        // the web server's ~120s connection timeout. A target already
        // started always runs to completion.
        if ($deadline !== null && $results !== [] && time() >= $deadline) break;
        $results[(string)$target['platform']] = socialPublishTarget($target);
    }
    $status = socialRecalcPostStatus($postId);
    return ['status' => $status, 'results' => $results];
}

// ── Per-platform manual retry (admin "Retry" button, 2026-11-22) ────────
//
// Syed's ask: retry ONE platform of ONE post (Facebook Page / Instagram /
// YouTube separately) without touching the others. The whole-post retry
// above re-runs every unfinished target; this is the scoped version.

/**
 * Guard for a single-target retry: a published target is NEVER retried
 * (that would double-post). Returns the refusal message, or null when
 * the target may be retried (pending / failed / stuck publishing).
 */
function socialTargetRetryRefusal(array $target): ?string
{
    if ((string)($target['status'] ?? '') === 'published') {
        return 'Already published on ' . (string)($target['platform'] ?? 'that platform')
            . ' — a published target is never retried, so it can never be posted twice.';
    }
    return null;
}

/**
 * The column values a retry reset writes. platform_post_id is carried
 * through UNCHANGED: for Instagram it holds the resumable Meta container
 * id a previous run stashed (commit cd1cd2b) — clearing it would restart
 * Meta's video processing from zero, which is exactly the IG lag that
 * fix cured. Writing the same value back makes the preservation
 * structural instead of incidental.
 */
function socialTargetRetryResetValues(array $target): array
{
    return [
        'status' => 'pending',
        'error' => null,
        'platform_post_id' => $target['platform_post_id'] ?? null,
        // A manual retry REVIVES a watchdog-'dead' target: its backoff
        // counters reset, so a human saying "try again" always gets a
        // genuinely fresh attempt cycle.
        'retry_attempts' => 0,
        'next_retry_at' => null,
    ];
}

/**
 * Reset one target to a retryable state: status back to 'pending' (this
 * also force-clears a stuck 'publishing' claim — the manual escape hatch
 * for a wedged target) and the error cleared. The IG container id is
 * preserved via socialTargetRetryResetValues().
 */
function socialResetTargetForRetry(PDO $pdo, array $target): void
{
    $v = socialTargetRetryResetValues($target);
    $pdo->prepare('UPDATE social_post_targets SET status = ?, error = ?, platform_post_id = ?, retry_attempts = ?, next_retry_at = ?, updated_at = ? WHERE id = ?')
        ->execute([$v['status'], $v['error'], $v['platform_post_id'], $v['retry_attempts'], $v['next_retry_at'], gmdate('Y-m-d H:i:s'), $target['id']]);
}

/**
 * Retry ONE target of ONE post and attempt the publish immediately (one
 * target's platform calls are time-bounded well inside the web server's
 * ~120s request wall — the same budget the cron relies on per target).
 * Returns ['refused' => true, 'code' => …, 'error' => …] for guard
 * refusals (unknown target / already published), otherwise
 * ['refused' => false, 'status' => <post aggregate>, 'target' => […],
 * 'result' => <publisher result>].
 */
function socialRetryPostTarget(string $postId, string $platform): array
{
    $pdo = db();
    $stmt = $pdo->prepare('SELECT * FROM social_post_targets WHERE post_id = ? AND platform = ? LIMIT 1');
    $stmt->execute([$postId, $platform]);
    $target = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$target) {
        return ['refused' => true, 'code' => 404, 'error' => 'This post has no ' . $platform . ' target.'];
    }
    $refusal = socialTargetRetryRefusal($target);
    if ($refusal !== null) {
        return ['refused' => true, 'code' => 409, 'error' => $refusal];
    }
    socialResetTargetForRetry($pdo, $target);
    // Bring the post into a publishable aggregate state without touching
    // the other targets (mirrors socialPostPublishNow for drafts).
    $pdo->prepare("UPDATE social_posts SET status = 'publishing', updated_at = UTC_TIMESTAMP() WHERE id = ? AND status <> 'published'")
        ->execute([$postId]);
    $target['status'] = 'pending';
    $target['error'] = null;
    $result = socialPublishTarget($target);
    $status = socialRecalcPostStatus($postId);
    $stmt = $pdo->prepare('SELECT status, error FROM social_post_targets WHERE id = ?');
    $stmt->execute([$target['id']]);
    $after = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
    return [
        'refused' => false,
        'status' => $status,
        'target' => [
            'platform' => $platform,
            'status' => (string)($after['status'] ?? ''),
            'error' => $after['error'] ?? null,
        ],
        'result' => $result,
    ];
}

// ── Reliability layer (2026-11-22) ──────────────────────────────────────
//
// Built after the 2026-11-22 outage, whose real damage was SILENCE: a
// Facebook target failed at 07:00 and sat unretried for ~7 hours while
// every dashboard claimed health. Four mechanisms, all driven from
// social-publish-cron.php:
//   · state store      — tiny key/value table (social_state) for the
//                        heartbeat + the reconciliation gate.
//   · heartbeat        — every publish run records itself; the admin
//                        shows "last ran X min ago" and goes red when
//                        the publisher has been quiet > 15 minutes.
//   · watchdog         — targets past due > 15 min that fell OUT of
//                        the main due-post flow (e.g. their post's
//                        aggregate flipped to 'failed', which the main
//                        selection never picks up again) are retried
//                        with exponential backoff; after 6 failed
//                        watchdog attempts the target is marked 'dead'
//                        and surfaced in the admin as Needs Attention
//                        instead of retrying — or rotting — forever.
//   · reconciliation   — hourly, targets marked published in the last
//                        48h are checked against the platform; a post
//                        Meta/YouTube says no longer exists is requeued
//                        instead of being reported as live forever.

// ── State store ─────────────────────────────────────────────────────────

function socialStateGet(string $key): ?string
{
    $stmt = db()->prepare('SELECT state_value FROM social_state WHERE state_key = ? LIMIT 1');
    $stmt->execute([$key]);
    $v = $stmt->fetchColumn();
    return $v === false ? null : (string)$v;
}

function socialStateSet(string $key, string $value): void
{
    db()->prepare(
        'INSERT INTO social_state (state_key, state_value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE state_value = VALUES(state_value), updated_at = UTC_TIMESTAMP()'
    )->execute([$key, $value]);
}

// ── Publisher heartbeat ─────────────────────────────────────────────────

function socialRecordHeartbeat(int $processed, bool $ok, string $source): void
{
    try {
        socialStateSet('publisher_heartbeat', (string)json_encode([
            'last_run_at' => gmdate('Y-m-d H:i:s'),
            'processed' => $processed,
            'ok' => $ok,
            'source' => $source,
        ]));
    } catch (Throwable $e) {
        // The heartbeat must never fail the run it describes.
        error_log('[social] heartbeat write failed: ' . substr($e->getMessage(), 0, 120));
    }
}

function socialPublisherHeartbeat(): ?array
{
    try {
        $raw = socialStateGet('publisher_heartbeat');
        if ($raw === null || $raw === '') return null;
        $hb = json_decode($raw, true);
        return is_array($hb) && !empty($hb['last_run_at']) ? $hb : null;
    } catch (Throwable $e) {
        error_log('[social] heartbeat read failed: ' . substr($e->getMessage(), 0, 120));
        return null;
    }
}

/** Shape the heartbeat for the admin API. Stale = no run in 15 min. */
function socialHeartbeatPayload(?array $hb, int $now): array
{
    if ($hb === null || empty($hb['last_run_at'])) {
        return ['lastRunAt' => null, 'processed' => 0, 'ok' => false, 'ageSeconds' => null, 'stale' => true];
    }
    $ts = strtotime((string)$hb['last_run_at'] . ' UTC');
    $age = $ts === false ? null : max(0, $now - $ts);
    return [
        'lastRunAt' => (string)$hb['last_run_at'],
        'processed' => (int)($hb['processed'] ?? 0),
        'ok' => !empty($hb['ok']),
        'ageSeconds' => $age,
        'stale' => $age === null || $age > 900,
    ];
}

// ── Watchdog: self-healing retries with backoff, then dead-letter ───────

const SOCIAL_WATCHDOG_MAX_ATTEMPTS = 6;

/** Delay before watchdog attempt N+1, after N failed attempts (1-based). */
function socialWatchdogBackoffSeconds(int $failedAttempts): int
{
    $table = [1 => 300, 2 => 900, 3 => 1800, 4 => 3600, 5 => 7200];
    return $table[max(1, min(5, $failedAttempts))] ?? 300;
}

/**
 * Bookkeeping after one watchdog publish attempt FAILED: bump the
 * counter, and either schedule the next attempt (exponential backoff)
 * or — at the cap — declare the target dead. Pure: unit-tested.
 */
function socialWatchdogAfterFailure(int $retryAttempts): array
{
    $next = $retryAttempts + 1;
    if ($next >= SOCIAL_WATCHDOG_MAX_ATTEMPTS) {
        return ['retry_attempts' => $next, 'dead' => true, 'delay_seconds' => 0];
    }
    return ['retry_attempts' => $next, 'dead' => false, 'delay_seconds' => socialWatchdogBackoffSeconds($next)];
}

/**
 * May the watchdog touch this target right now? Pure: unit-tested.
 * $target needs status/retry_attempts/next_retry_at/updated_at;
 * $post needs scheduled_at/status. All times are unix timestamps
 * pre-converted by the caller (DB rows arrive as UTC strings).
 */
function socialWatchdogTargetEligible(array $target, array $post, int $now): bool
{
    if (($post['status'] ?? '') === 'draft') return false;
    $due = !empty($post['scheduled_at']) ? strtotime((string)$post['scheduled_at'] . ' UTC') : false;
    if ($due === false || $due > $now - 900) return false;   // past due > 15 min
    $status = (string)($target['status'] ?? '');
    if ($status === 'publishing') {
        // Only a STALE claim (>20 min — every platform call is bounded
        // well under that) is a stranded run, never a live one.
        $upd = !empty($target['updated_at']) ? strtotime((string)$target['updated_at'] . ' UTC') : false;
        if ($upd === false || $upd > $now - 1200) return false;
    } elseif (!in_array($status, ['pending', 'failed'], true)) {
        return false;   // published / dead / skipped are not watchdog work
    }
    if ((int)($target['retry_attempts'] ?? 0) >= SOCIAL_WATCHDOG_MAX_ATTEMPTS) return false;
    $next = !empty($target['next_retry_at']) ? strtotime((string)$target['next_retry_at'] . ' UTC') : false;
    if ($next !== false && $next > $now) return false;       // backoff not yet elapsed
    return true;
}

/**
 * One watchdog pass: find targets that are past due and NOT published
 * but no longer reached by the main due-post selection, and retry
 * them under the backoff/dead-letter bookkeeping. Selection is by
 * TARGET (joined to the post's scheduled time), deliberately NOT by
 * the post's aggregate status — a post whose targets all failed has
 * aggregate 'failed' and the main flow never selects it again; that
 * blind spot is what stranded the 2026-11-22 07:00 Facebook target.
 */
function socialWatchdogSweep(?int $deadline = null): array
{
    $pdo = db();
    $stmt = $pdo->query(
        "SELECT t.*, p.scheduled_at AS post_scheduled_at, p.status AS post_status
           FROM social_post_targets t
           JOIN social_posts p ON p.id = t.post_id
          WHERE p.scheduled_at IS NOT NULL
            AND p.scheduled_at <= UTC_TIMESTAMP() - INTERVAL 15 MINUTE
            AND p.status <> 'draft'
            AND (t.status IN ('pending', 'failed')
                 OR (t.status = 'publishing' AND t.updated_at <= UTC_TIMESTAMP() - INTERVAL 20 MINUTE))
            AND (t.next_retry_at IS NULL OR t.next_retry_at <= UTC_TIMESTAMP())
            AND t.retry_attempts < " . SOCIAL_WATCHDOG_MAX_ATTEMPTS . "
          ORDER BY p.scheduled_at ASC LIMIT 10"
    );
    $out = ['scanned' => 0, 'retried' => 0, 'published' => 0, 'dead' => 0];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $out['scanned']++;
        if ($deadline !== null && $out['retried'] > 0 && time() >= $deadline) break;
        $post = ['scheduled_at' => $row['post_scheduled_at'], 'status' => $row['post_status']];
        if (!socialWatchdogTargetEligible($row, $post, time())) continue;
        $out['retried']++;
        $result = socialPublishTarget($row);
        if (!empty($result['skipped']) || !empty($result['deferred'])) {
            // Not the watchdog's to book-keep: 'skipped' means another
            // worker won the atomic claim first (this sweep did no
            // work — uncount it); 'deferred' means the Facebook
            // daily-cap test parked the target until the next New
            // York day with its next_retry_at already set. Neither may
            // burn a watchdog retry attempt.
            if (!empty($result['skipped'])) $out['retried']--;
            continue;
        }
        if (!empty($result['ok'])) {
            $out['published']++;
            $pdo->prepare('UPDATE social_post_targets SET retry_attempts = 0, next_retry_at = NULL, updated_at = UTC_TIMESTAMP() WHERE id = ?')
                ->execute([$row['id']]);
        } elseif (!empty($result['retry'])) {
            // Soft outcome (platform still processing, e.g. Instagram):
            // not a failure — don't burn a watchdog attempt, just rest
            // the target briefly so the next runs don't hammer it.
            $pdo->prepare('UPDATE social_post_targets SET next_retry_at = UTC_TIMESTAMP() + INTERVAL 5 MINUTE, updated_at = UTC_TIMESTAMP() WHERE id = ?')
                ->execute([$row['id']]);
        } else {
            $d = socialWatchdogAfterFailure((int)$row['retry_attempts']);
            if ($d['dead']) {
                $out['dead']++;
                $pdo->prepare("UPDATE social_post_targets SET status = 'dead', retry_attempts = ?, next_retry_at = NULL, updated_at = UTC_TIMESTAMP() WHERE id = ?")
                    ->execute([$d['retry_attempts'], $row['id']]);
            } else {
                $pdo->prepare('UPDATE social_post_targets SET retry_attempts = ?, next_retry_at = UTC_TIMESTAMP() + INTERVAL ? SECOND, updated_at = UTC_TIMESTAMP() WHERE id = ?')
                    ->execute([$d['retry_attempts'], (int)$d['delay_seconds'], $row['id']]);
            }
        }
        socialRecalcPostStatus((string)$row['post_id']);
    }
    return $out;
}

// ── Reconciliation: published on our books = present on the platform ────

/**
 * Definitive "this object does not exist" from the Graph API: error
 * 100/33 ("object with ID … does not exist") or 803 (alias missing).
 * Anything else — token, permission, rate limit — proves nothing and
 * must never flip a target. Pure: unit-tested.
 */
function socialGraphObjectMissing(array $res): bool
{
    $code = (int)($res['json']['error']['code'] ?? 0);
    $sub = (int)($res['json']['error']['error_subcode'] ?? 0);
    if ($code === 100 && $sub === 33) return true;
    if ($code === 803) return true;
    return false;
}

/**
 * YouTube videos.list: a 404, or a 200 whose items list is empty,
 * means the video is gone. Errors (quota/auth) prove nothing.
 */
function socialYouTubeObjectMissing(array $res): bool
{
    if ((int)($res['status'] ?? 0) === 404) return true;
    if ((int)($res['status'] ?? 0) === 200 && isset($res['json']['items']) && is_array($res['json']['items']) && $res['json']['items'] === []) return true;
    return false;
}

/** Reconciliation runs at most once an hour. Pure: unit-tested. */
function socialReconcileDue(?string $lastRunAt, int $now): bool
{
    if ($lastRunAt === null || $lastRunAt === '') return true;
    $ts = strtotime($lastRunAt . ' UTC');
    return $ts === false || ($now - $ts) >= 3300;
}

/**
 * Hourly pass over targets marked published in the last 48h: ask the
 * platform whether the object still exists. If it is definitively
 * gone (deleted on-platform, removed by a moderator), flip the target
 * back to pending with a loud error — the watchdog/main flow then
 * republishes it, and until it does, the admin no longer claims a
 * dead link is live. Facebook + Instagram share the Graph read;
 * YouTube uses videos.list (1 quota unit per call).
 */
function socialReconcileSweep(): array
{
    $out = ['ran' => false, 'checked' => 0, 'missing' => 0];
    if (!socialReconcileDue(socialStateGet('reconcile_last_run_at'), time())) return $out;
    socialStateSet('reconcile_last_run_at', gmdate('Y-m-d H:i:s'));
    $out['ran'] = true;
    $pdo = db();
    $rows = $pdo->query(
        "SELECT * FROM social_post_targets
          WHERE status = 'published' AND platform_post_id IS NOT NULL AND platform_post_id <> ''
            AND published_at >= UTC_TIMESTAMP() - INTERVAL 48 HOUR
          ORDER BY published_at DESC LIMIT 50"
    )->fetchAll(PDO::FETCH_ASSOC);
    $accounts = [];
    $v = socialConfig()['metaGraphVersion'];
    foreach ($rows as $t) {
        $aid = (string)$t['social_account_id'];
        if (!array_key_exists($aid, $accounts)) {
            $stmt = $pdo->prepare('SELECT * FROM social_accounts WHERE id = ? LIMIT 1');
            $stmt->execute([$aid]);
            $accounts[$aid] = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
        }
        $account = $accounts[$aid];
        if (!$account) continue;
        $out['checked']++;
        $pid = (string)$t['platform_post_id'];
        $missing = false;
        if ($t['platform'] === 'youtube') {
            $token = socialYouTubeAccessToken($account);
            if (!$token) continue;
            $res = socialHttp('GET', 'https://www.googleapis.com/youtube/v3/videos?part=id&id=' . urlencode($pid), [
                'headers' => ['Authorization: Bearer ' . $token], 'timeout' => 30,
            ]);
            $missing = socialYouTubeObjectMissing($res);
        } else {
            $token = socialAccountToken($account);
            if ($token === '') continue;
            $res = socialHttp('GET', "https://graph.facebook.com/{$v}/" . urlencode($pid) . '?fields=id&access_token=' . urlencode($token), ['timeout' => 30]);
            $missing = socialGraphObjectMissing($res);
        }
        if ($missing) {
            $out['missing']++;
            error_log('[social] reconcile: ' . $t['platform'] . ' object ' . $pid . ' missing on platform — requeued (target ' . $t['id'] . ')');
            // platform_post_id is deliberately NOT cleared: the file-wide
            // invariant is that a stored id is only ever overwritten by a
            // successful publish (the IG resume path status-checks any
            // stashed id and falls through to a fresh container when it
            // is not a live container, so a stale media id is harmless).
            $pdo->prepare(
                "UPDATE social_post_targets
                    SET status = 'pending', platform_url = NULL, published_at = NULL,
                        retry_attempts = 0, next_retry_at = NULL,
                        error = 'Published object missing on platform — requeued for republication.',
                        updated_at = UTC_TIMESTAMP()
                  WHERE id = ?"
            )->execute([$t['id']]);
            socialRecalcPostStatus((string)$t['post_id']);
        }
    }
    return $out;
}
