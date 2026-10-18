<?php
// TEMPORARY diagnostic — deleted after one use. Do not link or index.
$tok = '__DIAG_TOKEN__';
if (($_GET['token'] ?? '') !== $tok) { http_response_code(403); exit('no'); }
require __DIR__.'/lib/bootstrap.php';
require __DIR__.'/lib/db.php';
$pdo = db();
$mask = function ($e) {
    return preg_match('/^(..).*(@.*)$/', $e, $m) ? $m[1].'***'.$m[2] : '***';
};
$real = $pdo->query("SELECT COUNT(*) n FROM users WHERE email NOT LIKE 'seeded-%@shiarishta.com' AND is_admin = 0 AND is_test = 0")->fetch()['n'];
$total = $pdo->query("SELECT COUNT(*) n FROM users")->fetch()['n'];
$flagged = $pdo->query("SELECT id, email, created_at FROM users WHERE is_test = 1 ORDER BY created_at DESC LIMIT 25")->fetchAll(PDO::FETCH_ASSOC);
foreach ($flagged as &$r) { $r['email'] = $mask($r['email']); unset($r); }
$recent = $pdo->query("SELECT id, email, created_at, is_test, is_admin FROM users WHERE email NOT LIKE 'seeded-%@shiarishta.com' ORDER BY created_at DESC LIMIT 30")->fetchAll(PDO::FETCH_ASSOC);
foreach ($recent as &$r) { $r['email'] = $mask($r['email']); unset($r); }
$profiles = $pdo->query("SELECT COUNT(*) n FROM profiles")->fetch()['n'];
header('Content-Type: application/json');
echo json_encode([
    'real_count' => (int)$real,
    'total_users' => (int)$total,
    'total_profiles' => (int)$profiles,
    'flagged_test' => $flagged,
    'recent_nontest' => $recent,
]);
