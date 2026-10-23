<?php
// TEMPORARY diagnostic (2026-10-23): who are the most recent REAL signups?
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
    $rows = db()->query(
        "SELECT p.display_name, p.gender, p.city, p.country, u.created_at FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE {$w} ORDER BY u.created_at DESC LIMIT 3"
    )->fetchAll(PDO::FETCH_ASSOC);
    header('Content-Type: application/json');
    echo json_encode(['recent_real_signups' => $rows], JSON_PRETTY_PRINT);
} catch (Throwable $e) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['error' => $e->getMessage()]);
}
