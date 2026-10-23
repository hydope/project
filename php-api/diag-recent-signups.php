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
    $w = "email NOT LIKE 'seeded-%@shiarishta.com' AND is_admin = 0 AND is_test = 0";
    $rows = db()->query(
        "SELECT display_name, gender, city, country, created_at FROM users WHERE {$w} ORDER BY created_at DESC LIMIT 3"
    )->fetchAll(PDO::FETCH_ASSOC);
    header('Content-Type: application/json');
    echo json_encode(['recent_real_signups' => $rows], JSON_PRETTY_PRINT);
} catch (Throwable $e) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['error' => $e->getMessage(), 'trace' => substr($e->getTraceAsString(), 0, 500)]);
}
