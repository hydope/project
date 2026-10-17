<?php
// One-off QA debris cleanup — hides the public QA test post and removes the
// empty QA test community. Key-protected (same SEEDER_CRON_KEY as the seeders).
// Safe to delete this file after the 2026-10-17 cleanup run.
require_once __DIR__ . '/lib/db.php';

$key = $_SERVER['HTTP_X_SEEDER_CRON_KEY'] ?? '';
$expected = getenv('SEEDER_CRON_KEY') ?: '';
if ($expected === '' || !hash_equals($expected, $key)) {
  json(['error' => 'Forbidden'], 403);
}

$out = [];
// Hide (not delete) the QA test post — reversible via is_hidden=0.
$stmt = db()->prepare("UPDATE posts SET is_hidden = 1 WHERE id = 'e6782107-ed97-4343-9666-20d0a8647f39' AND title LIKE 'TEST PROFILE FOR QA%'");
$stmt->execute();
$out['post_hidden'] = $stmt->rowCount();

// Remove the empty QA test community (0 posts, created by QA automation).
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

json(['ok' => true] + $out);
