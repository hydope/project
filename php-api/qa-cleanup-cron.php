<?php
/**
 * One-off QA debris cleanup (2026-10-17 audit P0) — hides the public QA test
 * post and removes the empty QA test community.
 *
 * Follows the exact pattern of seed-daily-community-cron.php: load .env into
 * the environment first (db() reads credentials via getenv), then verify
 * SEEDER_CRON_KEY. Safe to delete after the cleanup run.
 */

header('Content-Type: application/json');

$envFile = __DIR__ . '/.env';
if (file_exists($envFile)) {
    foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $l) {
        $l = trim($l);
        if ($l === '' || $l[0] === '#') continue;
        if (strpos($l, '=') !== false) {
            [$k, $v] = explode('=', $l, 2);
            putenv(trim($k) . '=' . trim($v));
        }
    }
}

$provided = $_SERVER['HTTP_X_SEEDER_CRON_KEY'] ?? '';
$expected = getenv('SEEDER_CRON_KEY') ?: '';

if ($expected === '' || !hash_equals($expected, $provided)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Forbidden']);
    exit;
}

require_once __DIR__ . '/lib/db.php';

$out = ['ok' => true];

// Hide (not delete) the QA test post — reversible via is_hidden=0.
$stmt = db()->prepare("UPDATE posts SET is_hidden = 1 WHERE id = 'e6782107-ed97-4343-9666-20d0a8647f39' AND title LIKE 'TEST PROFILE FOR QA%'");
$stmt->execute();
$out['post_hidden'] = $stmt->rowCount();

// Remove the empty QA test community if it still exists (0 posts).
$chk = db()->prepare("SELECT COUNT(*) FROM communities WHERE id = 'qatestcommunity07'");
$chk->execute();
if ((int)$chk->fetchColumn() > 0) {
    $cnt = db()->prepare("SELECT COUNT(*) FROM posts WHERE community_id = 'qatestcommunity07'");
    $cnt->execute();
    $postCount = (int)$cnt->fetchColumn();
    if ($postCount === 0) {
        $del = db()->prepare("DELETE FROM communities WHERE id = 'qatestcommunity07'");
        $del->execute();
        $out['community_deleted'] = $del->rowCount();
    } else {
        $out['community_skipped'] = "has {$postCount} posts, not empty — left in place";
    }
} else {
    $out['community_deleted'] = 'already gone';
}

echo json_encode($out);
