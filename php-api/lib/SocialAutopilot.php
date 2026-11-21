<?php
// Social Autopilot (2026-11-21) — generates ShiaRishta-style posts and
// queues them as ordinary social_posts (source='autopilot'); the SAME
// social-publish-cron worker publishes them. No separate publish path.
//
// FORMAT PRIORITY (Syed, 2026-11-21): the main autopilot format is REELS
// produced on the Muse side (ShortSmash pipeline) and fed in through
// the ingest endpoint (source='autopilot_reel'). This generator is the
// FALLBACK: if the next hour's slot has no reel waiting, it fills the
// slot with a text/image post so the hour is never missed.
//
// Safety rails (all enforced here + in SocialPublisher):
//   · Autopilot defaults to OFF — nothing generates until an admin turns
//     it on in /admin/social-scheduler.
//   · Per-platform enable + daily caps (FB 24, IG 24, YouTube 6 — the
//     YouTube Data API default 10,000-unit quota allows ~6 uploads/day
//     at 1,600 units per videos.insert).
//   · Captions are hash-deduped (social_posts.caption_hash UNIQUE) — a
//     caption is never posted twice.
//   · Accounts flagged needs_attention (3 consecutive publish failures,
//     set in SocialPublisher) are skipped.
//   · The kill switch is the same `enabled` flag: the cron checks it
//     before every slot, so turning it off halts generation immediately.
declare(strict_types=1);

const SOCIAL_AUTOPILOT_SETTING_KEY = 'social_autopilot_settings';

function socialAutopilotDefaults(): array
{
    return [
        'enabled' => false, // OFF by default — Syed turns it on in admin.
        'platforms' => [
            'facebook' => ['enabled' => true, 'dailyCap' => 24],
            'instagram' => ['enabled' => true, 'dailyCap' => 24],
            // YouTube Data API v3 default quota: 10,000 units/day and a
            // videos.insert costs 1,600 units → ~6 uploads/day maximum.
            'youtube' => ['enabled' => true, 'dailyCap' => 6],
        ],
    ];
}

function socialAutopilotSettings(): array
{
    $settings = socialAutopilotDefaults();
    try {
        $stmt = db()->prepare('SELECT value_enc FROM app_settings WHERE setting_key = ? LIMIT 1');
        $stmt->execute([SOCIAL_AUTOPILOT_SETTING_KEY]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $raw = $row ? decAtRest($row['value_enc'] ?? null) : '';
        $stored = $raw !== '' ? json_decode($raw, true) : null;
        if (is_array($stored)) {
            $settings['enabled'] = !empty($stored['enabled']);
            foreach (['facebook', 'instagram', 'youtube'] as $p) {
                if (isset($stored['platforms'][$p]) && is_array($stored['platforms'][$p])) {
                    $settings['platforms'][$p]['enabled'] = !empty($stored['platforms'][$p]['enabled']);
                    $cap = (int)($stored['platforms'][$p]['dailyCap'] ?? $settings['platforms'][$p]['dailyCap']);
                    $settings['platforms'][$p]['dailyCap'] = max(0, min(100, $cap));
                }
            }
        }
    } catch (Throwable $e) {
        error_log('[social-autopilot] settings read failed: ' . substr($e->getMessage(), 0, 120));
    }
    return $settings;
}

function socialAutopilotSaveSettings(array $settings, ?string $adminUid): void
{
    db()->prepare(
        'INSERT INTO app_settings (setting_key, value_enc, updated_by, updated_at)
         VALUES (?, ?, ?, UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE value_enc = VALUES(value_enc), updated_by = VALUES(updated_by), updated_at = UTC_TIMESTAMP()'
    )->execute([SOCIAL_AUTOPILOT_SETTING_KEY, encAtRest((string)json_encode($settings)), $adminUid]);
}

function socialCaptionHash(string $caption): string
{
    $norm = mb_strtolower(trim(preg_replace('/\s+/', ' ', $caption) ?? $caption));
    return hash('sha256', $norm);
}

function socialCaptionExists(string $caption): bool
{
    $stmt = db()->prepare('SELECT 1 FROM social_posts WHERE caption_hash = ? LIMIT 1');
    $stmt->execute([socialCaptionHash($caption)]);
    return (bool)$stmt->fetch();
}

// ── Content pillars + brand template bank ───────────────────────────────
// Rotated by slot hour so the feed never runs one theme into the ground.

function socialAutopilotPillars(): array
{
    return ['quran_reflection', 'nikah_dua', 'hadith', 'rishta_tip', 'biodata_cta', 'blog_share', 'community_question', 'success_format'];
}

function socialAutopilotTemplateBank(): array
{
    return [
        'quran_reflection' => [
            "\"And We created you in pairs.\" — Qur'an 78:8\n\nMarriage in Islam begins with a pair created for one another: two people, two families, one sincere intention.\n\nBegin your search the halal way: https://shiarishta.com\n\n#ShiaRishta #Nikah #ShiaMatrimony",
            "\"And among His signs is that He created for you spouses from among yourselves, that you may find tranquillity in them; and He placed between you affection and mercy.\" — Qur'an 30:21\n\nAffection and mercy — the two things every rishta conversation should be measured against.\n\nMeet sincere Shia singles: https://shiarishta.com\n\n#ShiaRishta #Quran #Nikah",
        ],
        'nikah_dua' => [
            "A dua for everyone searching for a spouse:\n\n\"Our Lord, grant us from among our spouses and offspring comfort to our eyes and make us an example for the righteous.\" — Qur'an 25:74\n\nMay your search end in a home full of faith and peace. Ameen.\n\nStart your search: https://shiarishta.com\n\n#ShiaRishta #Dua #Nikah",
            "Making dua for a righteous spouse is itself an act of worship. Ask with certainty, then take the means — a sincere profile, honest words, and family involved from the start.\n\nCreate your free profile: https://shiarishta.com\n\n#ShiaRishta #Dua #Rishta",
        ],
        'hadith' => [
            "The Prophet (s) said: \"When a man marries, he has fulfilled half of his religion, so let him fear Allah regarding the remaining half.\"\n\nHalf of faith — that is how seriously our tradition takes nikah.\n\nTake your next step: https://shiarishta.com\n\n#ShiaRishta #Hadith #Nikah",
            "\"There is no institution in Islam more beloved and dearer to Allah than marriage.\" — Imam Ja'far al-Sadiq (as)\n\nIf you are ready, do not let hesitation delay what Allah loves.\n\nhttps://shiarishta.com\n\n#ShiaRishta #Nikah #Rishta",
        ],
        'rishta_tip' => [
            "Rishta tip: ask about the things that shape daily life — prayer, family expectations, where you want to live, and how you handle disagreement. Chemistry fades; character is what you live with.\n\nMore guidance + free profiles: https://shiarishta.com\n\n#ShiaRishta #RishtaTips #Nikah",
            "Rishta tip: involve your wali and family early. A conversation that starts with family blessing rarely ends in confusion.\n\nShia Rishta is built for families: https://shiarishta.com\n\n#ShiaRishta #RishtaTips #ShiaMatrimony",
            "Rishta tip: a complete profile gets replies. A clear photo, an honest bio, and saying plainly what you are looking for will do more than a hundred vague messages.\n\nComplete yours free: https://shiarishta.com\n\n#ShiaRishta #RishtaTips",
        ],
        'biodata_cta' => [
            "Need a marriage biodata that actually looks professional?\n\nShia Rishta's free Biodata Maker builds a clean, shareable biodata in minutes — no design skills needed.\n\nTry it free: https://shiarishta.com/biodata-maker\n\n#ShiaRishta #Biodata #Rishta",
        ],
        'community_question' => [
            "Question for our community: what is the ONE question you wish every rishta conversation started with?\n\nReply below — the best answers will shape our next guidance post.\n\nJoin the conversation: https://shiarishta.com\n\n#ShiaRishta #Community #Rishta",
            "Question for our community: what matters more in a match — same city, or same outlook on life? Tell us why.\n\nBrowse members near you: https://shiarishta.com\n\n#ShiaRishta #Community",
        ],
        'success_format' => [
            "How matches happen on Shia Rishta:\n\n1. A sincere, complete profile\n2. A respectful first message\n3. Families involved early\n4. Istikhara and honest conversation\n\nYour story can start the same way: https://shiarishta.com\n\n#ShiaRishta #Nikah #SuccessStory",
        ],
    ];
}

/** Recent real material from the DB to ground generated posts (style source b). */
function socialAutopilotSourceMaterial(): array
{
    $material = ['blog' => [], 'community' => [], 'history' => []];
    try {
        $rows = db()->query("SELECT title, slug FROM blog_posts WHERE status = 'published' ORDER BY published_at DESC LIMIT 8")->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows ?: [] as $r) $material['blog'][] = ['title' => (string)$r['title'], 'url' => 'https://shiarishta.com/blog/' . $r['slug']];
    } catch (Throwable) {}
    try {
        $rows = db()->query('SELECT title FROM posts WHERE is_hidden = 0 ORDER BY created_at DESC LIMIT 5')->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows ?: [] as $r) $material['community'][] = (string)$r['title'];
    } catch (Throwable) {}
    try {
        // Our own published history is style source (a): real captions
        // that already went out, so generated copy matches the voice.
        $rows = db()->query("SELECT caption FROM social_posts WHERE status IN ('published','partial') ORDER BY created_at DESC LIMIT 5")->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows ?: [] as $r) $material['history'][] = (string)$r['caption'];
    } catch (Throwable) {}
    return $material;
}

/**
 * Generate one caption for a pillar. AI first (lib/ai.php aiComplete —
 * the same NVIDIA integration the assistant/blog use); any unusable
 * output (no key, empty, too long, duplicate) falls back to the template
 * bank, exactly like the blog engine's fallback, so a slot never misses.
 */
function socialAutopilotGenerateCaption(string $pillar, array $material): ?string
{
    // AI attempt.
    if (function_exists('aiComplete')) {
        $examples = implode("\n---\n", array_slice($material['history'], 0, 3));
        $blogHint = $material['blog'][0]['title'] ?? '';
        try {
            $out = aiComplete([
                ['role' => 'system', 'content' => 'You write short social media captions for Shia Rishta, a Shia matrimonial platform. Warm, dignified, never salesy. Always end with the link https://shiarishta.com and 2-3 hashtags including #ShiaRishta. Maximum 600 characters. Plain text only.'],
                ['role' => 'user', 'content' => "Write one caption on the theme '{$pillar}'." . ($blogHint !== '' ? " You may reference this recent article topic: {$blogHint}." : '') . ($examples !== '' ? "\nMatch the voice of these previous posts:\n{$examples}" : '')],
            ], ['max_tokens' => 1200, 'temperature' => 0.8]);
            $caption = trim((string)($out ?? ''));
            if ($caption !== '' && mb_strlen($caption) <= 2000 && !socialCaptionExists($caption)) {
                return $caption;
            }
        } catch (Throwable $e) {
            error_log('[social-autopilot] AI caption failed, using template bank: ' . substr($e->getMessage(), 0, 120));
        }
    }

    // Template-bank fallback.
    if ($pillar === 'blog_share' && !empty($material['blog'])) {
        $pick = $material['blog'][array_rand($material['blog'])];
        $caption = $pick['title'] . "\n\nRead the full guide on Shia Rishta:\n" . $pick['url'] . "\n\n#ShiaRishta #Nikah #RishtaGuide";
        return socialCaptionExists($caption) ? null : $caption;
    }
    $bank = socialAutopilotTemplateBank();
    $options = $bank[$pillar] ?? $bank['rishta_tip'];
    // Rotate deterministically by day so different days pick differently,
    // then scan for the first unused caption.
    $start = (int)date('z') % count($options);
    for ($i = 0; $i < count($options); $i++) {
        $caption = $options[($start + $i) % count($options)];
        if (!socialCaptionExists($caption)) return $caption;
    }
    return null; // every variant already used — skip this slot honestly
}

/**
 * Fallback image for a generated post. Rotates the site's existing brand
 * blog-cover images (uploads/blog-covers/*.webp) into the social media
 * dir; if GD is available and no cover exists, renders a simple branded
 * poster. Returns the media_path (relative to photo root) or null.
 */
function socialAutopilotFallbackImage(): ?string
{
    $dir = photoBaseDir() . '/social';
    if (!is_dir($dir)) @mkdir($dir, 0775, true);
    $covers = glob(__DIR__ . '/../uploads/blog-covers/*.webp') ?: [];
    if ($covers) {
        $pick = $covers[(int)date('G') % count($covers)];
        $dest = 'social/autopilot-' . date('Ymd-H') . '-' . substr(hash('sha256', $pick . date('Ymd')), 0, 8) . '.webp';
        if (!is_file(photoBaseDir() . '/' . $dest) && @copy($pick, photoBaseDir() . '/' . $dest)) {
            return $dest;
        }
        if (is_file(photoBaseDir() . '/' . $dest)) return $dest;
    }
    if (function_exists('imagecreate')) {
        $img = imagecreate(1080, 1080);
        if ($img !== false) {
            imagecolorallocate($img, 27, 67, 50); // deep green brand field
            $gold = imagecolorallocate($img, 201, 162, 39);
            imagerectangle($img, 24, 24, 1055, 1055, $gold);
            imagestring($img, 5, 380, 500, 'Shia Rishta', $gold);
            imagestring($img, 4, 330, 540, 'shiarishta.com', $gold);
            $dest = 'social/autopilot-' . date('Ymd-H') . '.png';
            imagepng($img, photoBaseDir() . '/' . $dest);
            imagedestroy($img);
            return $dest;
        }
    }
    return null;
}

/** Count of autopilot targets (scheduled + published) for a platform today (UTC). */
function socialAutopilotTodayCount(string $platform): int
{
    $stmt = db()->prepare(
        "SELECT COUNT(*) AS n FROM social_post_targets t
          JOIN social_posts p ON p.id = t.post_id
         WHERE t.platform = ? AND p.source IN ('autopilot', 'autopilot_reel')
           AND DATE(COALESCE(p.scheduled_at, p.created_at)) = UTC_DATE()"
    );
    $stmt->execute([$platform]);
    return (int)($stmt->fetch(PDO::FETCH_ASSOC)['n'] ?? 0);
}

/**
 * One autopilot run: fill the NEXT hour's slot if it is empty.
 * Returns a summary array for the cron log/response.
 */
function socialAutopilotRun(): array
{
    $settings = socialAutopilotSettings();
    if (empty($settings['enabled'])) {
        return ['ok' => true, 'skipped' => 'autopilot is OFF'];
    }

    // Next hour boundary (UTC) is the slot we fill.
    $slotTs = (int)(floor(time() / 3600) * 3600) + 3600;
    $slot = gmdate('Y-m-d H:i:s', $slotTs);

    // A reel already waiting for this slot wins — reels are the main
    // format; the fallback generator must not crowd them out.
    $stmt = db()->prepare("SELECT id FROM social_posts WHERE source = 'autopilot_reel' AND scheduled_at >= ? AND scheduled_at < ? AND status IN ('scheduled','publishing') LIMIT 1");
    $stmt->execute([$slot, gmdate('Y-m-d H:i:s', $slotTs + 3600)]);
    if ($stmt->fetch()) {
        return ['ok' => true, 'skipped' => 'reel already queued for this slot', 'slot' => $slot];
    }
    // A fallback post already queued for this slot — idempotent re-runs.
    $stmt = db()->prepare("SELECT id FROM social_posts WHERE source = 'autopilot' AND scheduled_at = ? AND status IN ('scheduled','publishing') LIMIT 1");
    $stmt->execute([$slot]);
    if ($stmt->fetch()) {
        return ['ok' => true, 'skipped' => 'slot already filled', 'slot' => $slot];
    }

    // Eligible accounts: platform enabled, under cap, connected, healthy.
    $targets = [];
    foreach (['facebook', 'instagram', 'youtube'] as $platform) {
        $cfg = $settings['platforms'][$platform];
        if (empty($cfg['enabled'])) continue;
        if (socialAutopilotTodayCount($platform) >= (int)$cfg['dailyCap']) continue;
        $stmt = db()->prepare("SELECT * FROM social_accounts WHERE platform = ? AND status = 'connected' ORDER BY created_at ASC LIMIT 1");
        $stmt->execute([$platform]);
        $account = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($account) $targets[$platform] = $account;
    }
    if (!$targets) {
        return ['ok' => true, 'skipped' => 'no eligible connected accounts (caps, disabled, or needs_attention)', 'slot' => $slot];
    }

    $pillars = socialAutopilotPillars();
    $pillar = $pillars[(int)gmdate('G') % count($pillars)];
    $material = socialAutopilotSourceMaterial();
    $caption = socialAutopilotGenerateCaption($pillar, $material);
    if ($caption === null) {
        return ['ok' => true, 'skipped' => 'no unused caption available for pillar ' . $pillar, 'slot' => $slot];
    }

    // Media decision: generated posts are image/text. YouTube needs a
    // video, so it only joins when a video exists (reels path) — here it
    // is dropped from the fallback post.
    $mediaPath = socialAutopilotFallbackImage();
    $mediaType = $mediaPath ? 'image' : null;
    unset($targets['youtube']); // fallback posts are never videos — YouTube only joins via reels
    if (isset($targets['instagram']) && !$mediaPath) unset($targets['instagram']); // IG requires media
    if (!$targets) {
        return ['ok' => true, 'skipped' => 'no platform can take a text/image fallback post this slot', 'slot' => $slot];
    }

    $postId = uuid();
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->prepare(
            "INSERT INTO social_posts (id, caption, caption_overrides, media_path, media_type, media_url, scheduled_at, status, source, caption_hash, created_by)
             VALUES (?, ?, NULL, ?, ?, NULL, ?, 'scheduled', 'autopilot', ?, NULL)"
        )->execute([$postId, $caption, $mediaPath, $mediaType, $slot, socialCaptionHash($caption)]);
        $ins = $pdo->prepare(
            "INSERT INTO social_post_targets (id, post_id, social_account_id, platform, status) VALUES (?, ?, ?, ?, 'pending')"
        );
        foreach ($targets as $platform => $account) {
            $ins->execute([uuid(), $postId, $account['id'], $platform]);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        // caption_hash UNIQUE race — another run filled it first.
        return ['ok' => false, 'error' => 'autopilot insert failed: ' . substr($e->getMessage(), 0, 160)];
    }
    return ['ok' => true, 'created' => $postId, 'slot' => $slot, 'pillar' => $pillar, 'platforms' => array_keys($targets)];
}
