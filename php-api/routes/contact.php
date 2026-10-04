<?php
// Contact form submissions — public POST, admin-only listing.
// Messages land in contact_messages for admins to read in the admin panel.
declare(strict_types=1);

function routeContact(string $method, array $segments): void
{
    $action = $segments[0] ?? null;

    if ($method === 'POST' && $action === null) { submitContact(); return; }
    if ($method === 'GET' && $action === null) { listContact(); return; }
    // Must be matched before the single-message branch, or PUT /contact/bulk
    // would be read as a message with the id "bulk" and 404 on the cast.
    if ($method === 'PUT' && $action === 'bulk') { bulkContact(); return; }
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
    $q = trim((string)($_GET['q'] ?? ''));

    $where = [];
    $params = [];
    if ($status !== '' && in_array($status, ['new', 'read', 'replied', 'archived'], true)) {
        $where[] = 'status = ?';
        $params[] = $status;
    }
    if ($_GET['spam'] === '1') {
        $where[] = 'is_spam = 1';
    } elseif ($_GET['spam'] === '0') {
        // The default view hides spam. Marketing mail from jmailservice.com is
        // mixed in with real member enquiries, and an operator cannot triage
        // seven items when five are advertising.
        $where[] = 'is_spam = 0';
    }
    if ($q !== '') {
        // Escape LIKE metacharacters so a % or _ in a search is literal.
        $esc = str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $q);
        $where[] = '(name LIKE ? OR email LIKE ? OR subject LIKE ? OR message LIKE ?)';
        array_push($params, "%{$esc}%", "%{$esc}%", "%{$esc}%", "%{$esc}%");
    }

    $sql = 'SELECT id, name, email, subject, message, status, is_spam, created_at FROM contact_messages';
    if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
    $sql .= ' ORDER BY created_at DESC LIMIT 200';

    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    $messages = $stmt->fetchAll();

    // Counts for the tab bar. Counts the whole non-spam inbox, not the filtered
    // slice, so a tab shows "how many are waiting here" rather than "how many
    // are already showing".
    $counts = ['all' => 0, 'new' => 0, 'read' => 0, 'replied' => 0, 'archived' => 0, 'spam' => 0];
    try {
        foreach (db()->query(
            "SELECT status, COUNT(*) AS n FROM contact_messages
              WHERE is_spam = 0 GROUP BY status"
        )->fetchAll() as $row) {
            $counts[(string)$row['status']] = (int)$row['n'];
            $counts['all'] += (int)$row['n'];
        }
        $counts['spam'] = (int)db()
            ->query('SELECT COUNT(*) AS n FROM contact_messages WHERE is_spam = 1')
            ->fetch()['n'];
    } catch (Throwable) {
        // Migration has not run yet on this database; counts stay at zero.
    }

    json(['messages' => $messages, 'counts' => $counts]);
}

/**
 * Bulk triage. Separate from the single-message update because clearing a spam
 * folder is a different action with a different blast radius: one mis-click
 * archives one message, one mis-click on "archive all spam" hides a real
 * enquiry. The client confirms before calling it.
 */
function bulkContact(): void
{
    requireAdminUser();
    $payload = requestJson();

    $ids = array_values(array_filter(array_map(
        'intval',
        (array)($payload['ids'] ?? [])
    ), fn($id) => $id > 0));
    if (!$ids) {
        je('Select at least one message.', 400);
    }
    if (count($ids) > 500) {
        je('Too many messages selected.', 400);
    }

    $sets = [];
    $params = [];

    $status = trim((string)($payload['status'] ?? ''));
    if ($status !== '' && in_array($status, ['new', 'read', 'replied', 'archived'], true)) {
        $sets[] = 'status = ?';
        $params[] = $status;
    }
    if (array_key_exists('spam', $payload)) {
        $sets[] = 'is_spam = ?';
        $params[] = !empty($payload['spam']) ? 1 : 0;
    }
    if (!$sets) {
        je('Nothing to change.', 400);
    }

    // Placeholders are generated from the validated integer ids, never from
    // user input, so this cannot become an injection point.
    $in = implode(',', array_fill(0, count($ids), '?'));
    $stmt = db()->prepare('UPDATE contact_messages SET ' . implode(', ', $sets) . " WHERE id IN ({$in})");
    $stmt->execute(array_merge($params, $ids));

    auditLog('support.bulk', 'contact_message', implode(',', $ids), [
        'status' => $status ?: null,
        'spam' => array_key_exists('spam', $payload) ? !empty($payload['spam']) : null,
        'count' => $stmt->rowCount(),
    ]);
    json(['ok' => true, 'updated' => $stmt->rowCount()]);
}

function updateContactStatus(string $id): void
{
    requireAdminUser();
    $payload = requestJson();

    $sets = [];
    $params = [];

    $status = trim((string)($payload['status'] ?? ''));
    if ($status !== '' && in_array($status, ['new', 'read', 'replied', 'archived'], true)) {
        $sets[] = 'status = ?';
        $params[] = $status;
    }
    if (array_key_exists('spam', $payload)) {
        $sets[] = 'is_spam = ?';
        $params[] = !empty($payload['spam']) ? 1 : 0;
    }
    if (!$sets) {
        je('Invalid status.', 400);
    }

    $numId = (int)$id;
    if ($numId <= 0) {
        je('Message not found.', 404);
    }
    $stmt = db()->prepare('UPDATE contact_messages SET ' . implode(', ', $sets) . ' WHERE id = ?');
    $stmt->execute(array_merge($params, [$numId]));
    if ($stmt->rowCount() === 0) {
        je('Message not found.', 404);
    }
    auditLog('support.updated', 'contact_message', (string)$numId, [
        'status' => $status ?: null,
        'spam' => array_key_exists('spam', $payload) ? !empty($payload['spam']) : null,
    ]);
    json(['ok' => true]);
}
