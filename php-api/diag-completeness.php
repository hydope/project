<?php
// TEMPORARY diagnostic (2026-10-24): profile completeness stats for real members.
// Deleted immediately after the one-off workflow run. Token-gated.
declare(strict_types=1);
$token = '__DIAG_TOKEN_VALUE__';
if ($token === '__DIAG_TOKEN_SENTINEL__' || (($_GET['t'] ?? '') !== $token)) { http_response_code(404); exit; }
error_reporting(E_ALL);
ini_set('display_errors', '1');
try {
    require __DIR__ . '/lib/bootstrap.php';
    require __DIR__ . '/lib/db.php';
    $w = "u.email NOT LIKE 'seeded-%@shiarishta.com' AND u.is_admin = 0 AND u.is_test = 0";
    $q = fn(string $cond): int => (int)db()->query(
        "SELECT COUNT(*) AS n FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE {$w} AND {$cond}"
    )->fetch()['n'];
    $stats = [
        'total_real' => $q('1 = 1'),
        'no_city' => $q('(p.city IS NULL OR p.city = \'\')'),
        'no_country' => $q('(p.country IS NULL OR p.country = \'\')'),
        'no_bio' => $q('(p.bio IS NULL OR p.bio = \'\') AND (p.aboutFamily IS NULL OR p.aboutFamily = \'\')'),
        'no_photo' => $q('(p.photo_url IS NULL OR p.photo_url = \'\')'),
        'email_unverified' => $q('u.email_verified = 0'),
        'complete_bio_and_location' => $q('(p.bio IS NOT NULL AND p.bio != \'\') AND (p.city IS NOT NULL AND p.city != \'\')'),
    ];
    $recent = db()->query(
        "SELECT u.display_name, u.email_verified, u.created_at, p.city, p.country, p.bio IS NOT NULL AND p.bio != '' AS has_bio FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE {$w} ORDER BY u.created_at DESC LIMIT 10"
    )->fetchAll(PDO::FETCH_ASSOC);
    header('Content-Type: application/json');
    echo json_encode(['stats' => $stats, 'recent' => $recent], JSON_PRETTY_PRINT);
} catch (Throwable $e) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['error' => $e->getMessage()]);
}
