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

function socialFacebookReel(string $pageId, string $token, array $post, string $caption, string $v): array
{
    $url = socialMediaPublicUrl($post);
    if (!$url) return ['ok' => false, 'error' => 'Reels need a publicly reachable video URL.'];
    $start = socialHttp('POST', "https://graph.facebook.com/{$v}/{$pageId}/video_reels", [
        'body' => ['access_token' => $token, 'upload_phase' => 'start'],
    ]);
    $videoId = (string)($start['json']['video_id'] ?? '');
    if ($videoId === '') return ['ok' => false, 'error' => socialGraphError($start, 'Facebook Reel start')];
    $transfer = socialHttp('POST', "https://graph.facebook.com/{$v}/{$pageId}/video_reels", [
        'body' => ['access_token' => $token, 'upload_phase' => 'transfer', 'video_id' => $videoId, 'file_url' => $url],
    ]);
    if (empty($transfer['json']['success'])) return ['ok' => false, 'error' => socialGraphError($transfer, 'Facebook Reel transfer')];
    $finish = socialHttp('POST', "https://graph.facebook.com/{$v}/{$pageId}/video_reels", [
        'body' => ['access_token' => $token, 'upload_phase' => 'finish', 'video_id' => $videoId, 'video_state' => 'PUBLISHED', 'description' => $caption],
    ]);
    if (empty($finish['json']['success'])) return ['ok' => false, 'error' => socialGraphError($finish, 'Facebook Reel finish')];
    return ['ok' => true, 'platform_post_id' => $videoId, 'platform_url' => 'https://www.facebook.com/reel/' . $videoId];
}

// ── Meta: Instagram ─────────────────────────────────────────────────────

function socialPublishInstagram(array $account, array $post, string $caption): array
{
    $igId = (string)$account['platform_account_id'];
    $token = socialAccountToken($account);
    if ($token === '') return ['ok' => false, 'error' => 'Instagram token is missing — reconnect the account.'];
    $url = socialMediaPublicUrl($post);
    if (!$url) return ['ok' => false, 'error' => 'Instagram requires media with a publicly reachable URL — attach an image or video first.'];
    $v = socialConfig()['metaGraphVersion'];
    $isVideo = ($post['media_type'] ?? '') === 'video';

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

    // Video containers process asynchronously — poll briefly, then publish.
    if ($isVideo) {
        $ready = false;
        for ($i = 0; $i < 10; $i++) {
            sleep(6);
            $st = socialHttp('GET', "https://graph.facebook.com/{$v}/{$creationId}?fields=status_code&access_token=" . urlencode($token));
            $code = (string)($st['json']['status_code'] ?? '');
            if ($code === 'FINISHED') { $ready = true; break; }
            if ($code === 'ERROR' || $code === 'EXPIRED') {
                return ['ok' => false, 'error' => 'Instagram video processing ' . strtolower($code) . '.'];
            }
        }
        if (!$ready) return ['ok' => false, 'error' => 'Instagram video was still processing after 60s — publish will need a retry.'];
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
        $pdo->prepare("UPDATE social_post_targets SET status = 'publishing', attempts = attempts + 1, updated_at = UTC_TIMESTAMP() WHERE id = ?")
            ->execute([$target['id']]);
        try {
            $result = match ((string)$target['platform']) {
                'facebook' => socialPublishFacebook($account, $post, $caption),
                'instagram' => socialPublishInstagram($account, $post, $caption),
                'youtube' => socialPublishYouTube($account, $post, $caption),
                default => ['ok' => false, 'error' => 'Unknown platform: ' . $target['platform']],
            };
        } catch (Throwable $e) {
            $result = ['ok' => false, 'error' => substr($e->getMessage(), 0, 300)];
        }
    }

    if (!empty($result['ok'])) {
        // A failed best-effort thumbnail (YouTube) is noted on the
        // target's error field while the publish itself stays
        // 'published' — the video is the committed effect.
        $note = !empty($result['thumbnail_error'])
            ? substr('Published OK; custom thumbnail not set: ' . (string)$result['thumbnail_error'], 0, 1000)
            : null;
        $pdo->prepare("UPDATE social_post_targets SET status = 'published', platform_post_id = ?, platform_url = ?, error = ?, published_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP() WHERE id = ?")
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
    $failed = count(array_filter($statuses, fn($s) => $s === 'failed'));
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
function socialPublishPost(string $postId, bool $onlyFailed = false): array
{
    $pdo = db();
    $pdo->prepare("UPDATE social_posts SET status = 'publishing', updated_at = UTC_TIMESTAMP() WHERE id = ? AND status <> 'draft'")
        ->execute([$postId]);
    // Both publish-now and the cron (re)try pending AND failed targets;
    // a plain first run has only pending rows anyway. $onlyFailed is kept
    // for call-site clarity (retry endpoint) — behaviour is identical.
    $stmt = $pdo->prepare("SELECT * FROM social_post_targets WHERE post_id = ? AND status IN ('pending', 'failed')");
    $stmt->execute([$postId]);
    $results = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $target) {
        $results[(string)$target['platform']] = socialPublishTarget($target);
    }
    $status = socialRecalcPostStatus($postId);
    return ['status' => $status, 'results' => $results];
}
