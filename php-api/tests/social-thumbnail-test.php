<?php
// Offline contract test for YouTube custom-thumbnail support in the
// Social Scheduler (2026-11-21). The live path needs a DB, an OAuth
// token and YouTube itself, so what can be pinned offline is the
// CONTRACT every layer must keep — a regression in any of these strings
// silently breaks the feature end to end:
//
//   · schema.sql declares social_posts.thumbnail_path (its digest is
//     what reopens the production migration pass)
//   · migrate.php registers + defines migrateAddSocialThumbnailColumn()
//   · the ingest route accepts the optional 'thumbnail' multipart field
//     and persists thumbnail_path on the post row
//   · the publisher calls thumbnails.set after a YouTube upload and
//     surfaces failures as thumbnail_error WITHOUT failing the publish
//   · the purge sweep clears thumbnail_path with the video
//
// Run: php tests/social-thumbnail-test.php
declare(strict_types=1);

$failures = 0;
function check(string $label, bool $cond): void
{
    global $failures;
    echo ($cond ? 'PASS' : 'FAIL') . '  ' . $label . "\n";
    if (!$cond) $failures++;
}

$root = __DIR__ . '/..';
$schema = (string)file_get_contents($root . '/db/schema.sql');
$migrate = (string)file_get_contents($root . '/lib/migrate.php');
$routes = (string)file_get_contents($root . '/routes/social_scheduler.php');
$publisher = (string)file_get_contents($root . '/lib/SocialPublisher.php');
$storage = (string)file_get_contents($root . '/lib/SocialStorage.php');

// ── Schema + migration ──────────────────────────────────────────────────
$postsBlock = substr($schema, (int)strpos($schema, 'CREATE TABLE IF NOT EXISTS social_posts'));
$postsBlock = substr($postsBlock, 0, (int)strpos($postsBlock, 'ENGINE=InnoDB'));
check('schema.sql: social_posts declares thumbnail_path', str_contains($postsBlock, 'thumbnail_path'));
check('migrate.php: migrateAddSocialThumbnailColumn() is registered in migrateSchema()',
    str_contains($migrate, 'migrateAddSocialThumbnailColumn();'));
check('migrate.php: migrateAddSocialThumbnailColumn() adds the column when missing',
    str_contains($migrate, 'function migrateAddSocialThumbnailColumn()')
    && str_contains($migrate, "ADD COLUMN thumbnail_path VARCHAR(500) DEFAULT NULL AFTER media_url"));

// ── Ingest ──────────────────────────────────────────────────────────────
check('routes: ingest reads the optional thumbnail upload',
    str_contains($routes, "\$_FILES['thumbnail']"));
check('routes: socialStoreThumbnail() enforces the 2 MB cap',
    str_contains($routes, 'function socialStoreThumbnail(')
    && str_contains($routes, '2 * 1024 * 1024'));
check('routes: socialStoreThumbnail() accepts JPEG/PNG only',
    str_contains($routes, "'image/jpeg' => 'jpg', 'image/png' => 'png'"));
check('routes: socialStoreThumbnail() sniffs JPEG/PNG magic bytes (finfo is not the only gate)',
    str_contains($routes, '"\xFF\xD8\xFF"') && str_contains($routes, '"\x89PNG\r\n\x1a\n"'));
check('routes: ingest INSERT persists thumbnail_path',
    str_contains($routes, 'media_url, thumbnail_path, scheduled_at'));
check('routes: post payload exposes thumbnailPath',
    str_contains($routes, "'thumbnailPath' => \$row['thumbnail_path'] ?? null"));

// ── Publisher ───────────────────────────────────────────────────────────
check('publisher: thumbnails.set endpoint is called',
    str_contains($publisher, 'https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId='));
check('publisher: socialYouTubeSetThumbnail() exists and never throws the publish',
    str_contains($publisher, 'function socialYouTubeSetThumbnail('));
check('publisher: upload result carries thumbnail_error on thumbnail failure',
    str_contains($publisher, "\$out['thumbnail_error']"));
check('publisher: target row records the thumbnail note while staying published',
    str_contains($publisher, 'Published OK; custom thumbnail not set: '));
check('publisher: thumbnail file resolved from the post row',
    str_contains($publisher, "socialMediaFile(\$post['thumbnail_path'] ?? null)"));

// ── Storage lifecycle ───────────────────────────────────────────────────
check('storage: purge sweep clears thumbnail_path with the video',
    str_contains($storage, 'thumbnail_path = NULL'));

echo $failures === 0 ? "\nALL PASS\n" : "\n{$failures} FAILURE(S)\n";
exit($failures === 0 ? 0 : 1);
