<?php
// Guest lead capture — visitors who are not ready to register can leave an
// email (and optionally a city) to receive new-profile alerts. Syed's
// conversion ask, 2026-11-15: the funnel's biggest leak is visitors leaving
// with nothing captured; a lead is a smaller yes than a full signup.
//
// POST /api/leads { email, source?, city? } — public, rate-limited, deduped
// by email. GET /api/leads/unsubscribe?e=<email>&t=<token> — one-click
// unsubscribe from the alert emails (token stored per lead at capture).
//
// The weekly digest cron (weekly-digest-cron.php) sends the alerts every
// Sunday, only when new real profiles actually joined that week — an empty
// alert is spam, not a feature. Admin visibility: GET /api/admin/leads.
declare(strict_types=1);

function routeLeads(string $method, array $segments): void
{
    $action = $segments[0] ?? '';
    if ($method === 'POST' && $action === '') { leadCreate(); return; }
    if ($method === 'GET' && $action === 'unsubscribe') { leadUnsubscribe(); return; }
    json(['error' => 'Not found'], 404);
}

function leadsEnsureTable(): void
{
    db()->exec(
        'CREATE TABLE IF NOT EXISTS guest_leads (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            email VARCHAR(190) NOT NULL,
            source VARCHAR(24) NOT NULL DEFAULT \'site\',
            city VARCHAR(80) NULL,
            unsub_token CHAR(32) NOT NULL,
            unsubscribed TINYINT(1) NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_sent_at DATETIME NULL,
            PRIMARY KEY (id),
            UNIQUE KEY uq_guest_leads_email (email)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
}

function leadCreate(): void
{
    rateCheck('lead:ip', cip(), 10, 3600, 'Too many attempts. Please try again later.');
    $body = requestJson();
    $email = strtolower(trim((string)($body['email'] ?? '')));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190) {
        je('Please enter a valid email address.', 400);
    }
    $source = (string)($body['source'] ?? 'site');
    if (!in_array($source, ['home', 'browse', 'city', 'biodata', 'blog', 'profile'], true)) $source = 'site';
    $city = trim((string)($body['city'] ?? ''));
    if (mb_strlen($city) > 80) $city = mb_substr($city, 0, 80);
    if ($city === '') $city = null;

    try {
        leadsEnsureTable();
        $stmt = db()->prepare(
            'INSERT INTO guest_leads (email, source, city, unsub_token)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                city = COALESCE(VALUES(city), city),
                source = VALUES(source),
                unsubscribed = 0'
        );
        $stmt->execute([$email, $source, $city, bin2hex(random_bytes(16))]);
    } catch (Throwable $e) {
        error_log('[leads] capture failed: ' . $e->getMessage());
        je('Could not save your email right now. Please try again.', 500);
    }
    json(['ok' => true]);
}

function leadUnsubscribe(): void
{
    $email = strtolower(trim((string)($_GET['e'] ?? '')));
    $token = trim((string)($_GET['t'] ?? ''));
    $done = false;
    if ($email !== '' && $token !== '') {
        try {
            leadsEnsureTable();
            $stmt = db()->prepare('SELECT unsub_token FROM guest_leads WHERE email = ? LIMIT 1');
            $stmt->execute([$email]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($row && hash_equals((string)$row['unsub_token'], $token)) {
                db()->prepare('UPDATE guest_leads SET unsubscribed = 1 WHERE email = ?')->execute([$email]);
                $done = true;
            }
        } catch (Throwable $e) {
            error_log('[leads] unsubscribe failed: ' . $e->getMessage());
        }
    }
    http_response_code($done ? 200 : 400);
    header('Content-Type: text/html; charset=utf-8');
    $msg = $done
        ? 'You are unsubscribed. You will not receive new-profile alerts any more.'
        : 'That unsubscribe link is not valid. If you keep receiving alerts, contact support@shiarishta.com.';
    echo '<!doctype html><html><head><meta charset="utf-8"><title>Shia Rishta — email alerts</title></head>'
        . '<body style="font-family:system-ui,sans-serif;max-width:34rem;margin:4rem auto;padding:0 1rem;line-height:1.6">'
        . '<h1 style="font-size:1.25rem">Shia Rishta</h1><p>' . htmlspecialchars($msg, ENT_QUOTES, 'UTF-8') . '</p>'
        . '<p><a href="https://shiarishta.com/">Return to Shia Rishta</a></p></body></html>';
    exit;
}
