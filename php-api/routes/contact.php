<?php
// Contact form submissions — public POST, admin-only listing.
// Messages land in contact_messages for admins to read in the admin panel.
declare(strict_types=1);

function routeContact(string $method, array $segments): void
{
    $action = $segments[0] ?? null;

    if ($method === 'POST' && $action === null) { submitContact(); return; }
    if ($method === 'GET' && $action === null) { listContact(); return; }
    if ($method === 'PUT' && $action !== null) { updateContactStatus((string)$action); return; }

    json(['error' => 'Contact endpoint not found'], 404);
}

function submitContact(): void
{
    $payload = requestJson();
    $name = mb_substr(trim((string)($payload['name'] ?? '')), 0, 120);
    $email = strtolower(mb_substr(trim((string)($payload['email'] ?? '')), 0, 320));
    $subject = mb_substr(trim((string)($payload['subject'] ?? '')), 0, 200);
    $message = mb_substr(trim((string)($payload['message'] ?? '')), 0, 5000);

    if ($name === '' || $email === '' || $subject === '' || $message === '') {
        je('Please fill in every field.', 400);
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        je('Please enter a valid email address.', 400);
    }

    // Basic spam throttle: max 3 messages per email per hour.
    $throttle = db()->prepare("SELECT COUNT(*) FROM contact_messages WHERE email = ? AND created_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 HOUR)");
    $throttle->execute([$email]);
    if ((int)$throttle->fetchColumn() >= 3) {
        je('Too many messages. Please wait a bit before sending another.', 429);
    }

    $stmt = db()->prepare("INSERT INTO contact_messages (name, email, subject, message) VALUES (?, ?, ?, ?)");
    $stmt->execute([$name, $email, $subject, $message]);

    json(['ok' => true, 'id' => (int)db()->lastInsertId()]);
}

function listContact(): void
{
    requireAdminUser();
    $status = trim((string)($_GET['status'] ?? ''));
    $sql = "SELECT id, name, email, subject, message, status, created_at FROM contact_messages";
    $params = [];
    if ($status !== '' && in_array($status, ['new', 'read', 'replied', 'archived'], true)) {
        $sql .= " WHERE status = ?";
        $params[] = $status;
    }
    $sql .= " ORDER BY created_at DESC LIMIT 200";
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    json(['messages' => $stmt->fetchAll()]);
}

function updateContactStatus(string $id): void
{
    requireAdminUser();
    $payload = requestJson();
    $status = trim((string)($payload['status'] ?? ''));
    if (!in_array($status, ['new', 'read', 'replied', 'archived'], true)) {
        je('Invalid status.', 400);
    }
    $stmt = db()->prepare("UPDATE contact_messages SET status = ? WHERE id = ?");
    $stmt->execute([$status, $id]);
    if ($stmt->rowCount() === 0) {
        je('Message not found.', 404);
    }
    json(['ok' => true]);
}
