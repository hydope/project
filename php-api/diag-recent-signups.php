<?php
// TEMPORARY diagnostic (2026-10-23): who are the most recent REAL signups?
// Deleted immediately after the one-off workflow run. Token-gated.
declare(strict_types=1);
$token = '99919daf33496b6de4ecc26f53f55dc3';
if ((['t'] ?? '') !== $token) { http_response_code(404); exit; }
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/db.php';
$w = "email NOT LIKE 'seeded-%@shiarishta.com' AND is_admin = 0 AND is_test = 0";
$rows = db()->query(
    "SELECT display_name, gender, city, country, created_at FROM users WHERE {$w} ORDER BY created_at DESC LIMIT 3"
)->fetchAll(PDO::FETCH_ASSOC);
header('Content-Type: application/json');
echo json_encode(['recent_real_signups' => $rows], JSON_PRETTY_PRINT);
