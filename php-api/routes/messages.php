<?php
// Messaging — exact parity with server/routes/messages.js.
// GATE: messaging unlocks only on mutual interest (the nikah-first rule).
// Contact details are stripped server-side before any message is stored.

declare(strict_types=1);

function routeMessages(string $method, array $segments): void
{
    $id = $segments[0] ?? null;

    if ($method === 'GET' && $id === null) { messagesList(); return; }
    if ($method === 'GET' && $id !== null && ($segments[1] ?? null) === null) { messageThread($id); return; }
    if ($method === 'POST' && $id === null) { startConversation(); return; }
    if ($method === 'POST' && $id !== null && ($segments[1] ?? null) === null) { sendMessage($id); return; }
    // POST /api/messages/:id/disappearing { seconds: 0|86400|604800 }
    if ($method === 'POST' && $id !== null && ($segments[1] ?? null) === 'disappearing') { setDisappearing($id); return; }

    json(['error' => 'Messages endpoint not found'], 404);
}

// True when a block exists in EITHER direction between the two members.
function pairBlocked(string $a, string $b): bool
{
    $stmt = db()->prepare('SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?) LIMIT 1');
    $stmt->execute([$a, $b, $b, $a]);
    return (bool)$stmt->fetch();
}

function messagesList(): void
{
    $user = requireAuthUser();
    // Blocked pairs disappear from the list entirely (both directions) and the
    // other member's name comes from their profile (NULLS LAST is Postgres-only:
    // MySQL sorts NULLs first ASC / last DESC already, so IS NULL swap not needed
    // for DESC — but explicit ordering keeps parity: non-null last_at first).
    $stmt = db()->prepare(
        'SELECT c.id, c.user_a, c.user_b, c.created_at,
                (SELECT m.body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
                (SELECT m.created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_at,
                CASE WHEN c.user_a = ? THEN c.user_b ELSE c.user_a END AS other_id,
                (SELECT p.display_name FROM profiles p WHERE p.user_id = CASE WHEN c.user_a = ? THEN c.user_b ELSE c.user_a END) AS other_name
           FROM conversations c
          WHERE (c.user_a = ? OR c.user_b = ?)
            AND NOT EXISTS (
              SELECT 1 FROM blocks b
               WHERE (b.blocker_id = c.user_a AND b.blocked_id = c.user_b)
                  OR (b.blocker_id = c.user_b AND b.blocked_id = c.user_a)
            )
          ORDER BY c.created_at DESC'
    );
    $stmt->execute([$user['uid'], $user['uid'], $user['uid'], $user['uid']]);
    $rows = $stmt->fetchAll();

    // Re-sort in PHP for exact NULLS LAST semantics on the last message time.
    usort($rows, function ($x, $y) {
        $tx = $x['last_at'] ?? null;
        $ty = $y['last_at'] ?? null;
        if ($tx === null && $ty === null) return strcmp($y['created_at'], $x['created_at']);
        if ($tx === null) return 1;   // NULLS LAST
        if ($ty === null) return -1;
        $cmp = strcmp($ty, $tx);
        return $cmp !== 0 ? $cmp : strcmp($y['created_at'], $x['created_at']);
    });

    $list = [];
    foreach ($rows as $row) {
        $list[] = [
            'id' => $row['id'],
            'participantId' => $row['other_id'],
            'participantName' => $row['other_name'] ?: 'Member',
            'lastMessage' => decAtRest($row['last_message']),
            'timestamp' => $row['last_at'] ?: $row['created_at'],
            'unread' => false,
        ];
    }

    json($list);
}
function messageThread(string $id): void
{
    $user = requireAuthUser();
    $stmt = db()->prepare('SELECT * FROM conversations WHERE id = ? LIMIT 1');
    $stmt->execute([$id]);
    $thread = $stmt->fetch();

    if (!$thread) {
        je('Conversation not found.', 404);
    }
    if ($thread['user_a'] !== (string)$user['uid'] && $thread['user_b'] !== (string)$user['uid']) {
        je('Not your conversation.', 403);
    }

    // A block must cut history, not just sends.
    $other = $thread['user_a'] === (string)$user['uid'] ? $thread['user_b'] : $thread['user_a'];
    if (pairBlocked((string)$user['uid'], $other)) {
        je('This conversation is unavailable.', 403);
    }

    // Lazy purge: disappearing messages are deleted when the thread loads.
    // (No cron on shared hosting, so expiry is enforced on read.)
    try {
        db()->prepare('DELETE FROM messages WHERE conversation_id = ? AND expires_at IS NOT NULL AND expires_at <= NOW()')
            ->execute([$id]);
    } catch (Throwable) { /* column may not exist yet */ }

    $msgStmt = db()->prepare('SELECT id, sender_id, body, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 500');
    $msgStmt->execute([$id]);
    $rows = $msgStmt->fetchAll();

    $out = [];
    foreach ($rows as $row) {
        $out[] = [
            'id' => $row['id'],
            'senderId' => $row['sender_id'] === (string)$user['uid'] ? 'me' : 'them',
            'text' => decAtRest($row['body']),
            'timestamp' => $row['created_at'],
        ];
    }

    json(['messages' => $out, 'disappearing_after' => (int)($thread['disappearing_after'] ?? 0)]);
}

function startConversation(): void
{
    $user = requireAuthUser();
    // P0: messaging requires a verified email — unverified accounts get no
    // member access to the conversation loop.
    requireVerifiedEmail((string)$user['uid']);
    $payload = requestJson();
    $other = (string)($payload['userId'] ?? $payload['profileId'] ?? '');

    if ($other === '') {
        je('Recipient is required.', 400);
    }
    if ($other === (string)$user['uid']) {
        je('You cannot start a conversation with yourself.', 400);
    }

    $target = db()->prepare('SELECT id FROM users WHERE id = ? LIMIT 1');
    $target->execute([$other]);
    if (!$target->fetch()) {
        je('Member not found.', 404);
    }

    if (pairBlocked((string)$user['uid'], $other)) {
        je('Messaging is unavailable with this member.', 403);
    }

    // GATE: only two-way interest opens a conversation. Uses the same helper the
    // photo endpoint and sendMessage use, so "matched" cannot drift into three
    // subtly different definitions.
    if (!mutualInterest((string)$user['uid'], $other)) {
        json([
            'error' => 'Messaging unlocks when you both express interest. Send interest and wait for theirs.',
            'mutualInterest' => false,
        ], 403);
    }

    // Canonical ordering keeps (user_a, user_b) unique — INSERT IGNORE handles
    // the race where the other member starts the same conversation.
    $a = (string)$user['uid'] < $other ? (string)$user['uid'] : $other;
    $b = (string)$user['uid'] < $other ? $other : (string)$user['uid'];
    $stmt = db()->prepare('INSERT IGNORE INTO conversations (id, user_a, user_b) VALUES (?, ?, ?)');
    $stmt->execute([uuid(), $a, $b]);

    $fetch = db()->prepare('SELECT id FROM conversations WHERE user_a = ? AND user_b = ? LIMIT 1');
    $fetch->execute([$a, $b]);
    $row = $fetch->fetch();

    json(['id' => $row['id']], 201);
}

function sendMessage(string $id): void
{
    $user = requireAuthUser();
    // P0: messaging requires a verified email.
    requireVerifiedEmail((string)$user['uid']);
    $payload = requestJson();
    $body = cleanMessage($payload['text'] ?? $payload['body'] ?? '');
    if ($body === '') {
        je('Message cannot be empty.', 400);
    }

    $conv = db()->prepare('SELECT * FROM conversations WHERE id = ? LIMIT 1');
    $conv->execute([$id]);
    $row = $conv->fetch();
    if (!$row) {
        je('Conversation not found.', 404);
    }
    if ($row['user_a'] !== (string)$user['uid'] && $row['user_b'] !== (string)$user['uid']) {
        je('Not your conversation.', 403);
    }

    $other = $row['user_a'] === (string)$user['uid'] ? $row['user_b'] : $row['user_a'];

    // Messaging requires a match. Profiles are readable by anyone, so this is
    // now the only thing standing between a stranger and someone's inbox — which
    // makes it the check that matters most, not an extra hurdle on top of one.
    if (!mutualInterest((string)$user['uid'], $other)) {
        je('You can only message someone you have both matched with.', 403);
    }
    if (pairBlocked((string)$user['uid'], $other)) {
        je('Messaging is unavailable with this member.', 403);
    }

    $msgId = uuid();
    // Encrypted at rest (AES-256-GCM). Decrypted only for the two participants.
    // Disappearing timer: stamp expiry from the conversation's setting.
    $disappearing = (int)($row['disappearing_after'] ?? 0);
    $expiresAt = $disappearing > 0 ? date('Y-m-d H:i:s', time() + $disappearing) : null;
    try {
        $stmt = db()->prepare('INSERT INTO messages (id, conversation_id, sender_id, body, expires_at) VALUES (?, ?, ?, ?, ?)');
        $stmt->execute([$msgId, $id, $user['uid'], encAtRest($body), $expiresAt]);
    } catch (Throwable) {
        // Column may not exist yet on an unmigrated database.
        $stmt = db()->prepare('INSERT INTO messages (id, conversation_id, sender_id, body) VALUES (?, ?, ?, ?)');
        $stmt->execute([$msgId, $id, $user['uid'], encAtRest($body)]);
    }

    // Notify the recipient so the notification bell deep-links to the chat.
    try {
        $nm = db()->prepare('SELECT display_name FROM profiles WHERE user_id = ? LIMIT 1');
        $nm->execute([(string)$user['uid']]);
        $senderName = $nm->fetch()['display_name'] ?? 'Someone';
        $preview = mb_substr($body, 0, 80);
        notifyUser($other, 'message', 'New message from ' . $senderName, $preview, $id);
    } catch (Throwable $e) { /* notification is best-effort */ }

    $fetch = db()->prepare('SELECT id, body, created_at FROM messages WHERE id = ? LIMIT 1');
    $fetch->execute([$msgId]);
    $saved = $fetch->fetch();

    json([
        'id' => $saved['id'],
        'senderId' => 'me',
        'text' => decAtRest($saved['body']),
        'timestamp' => $saved['created_at'],
    ], 201);
}

// POST /api/messages/:id/disappearing { seconds: 0|86400|604800 } — either
// participant can set the disappearing timer. Applies to messages sent after
// the change; already-sent messages keep their original expiry.
function setDisappearing(string $id): void
{
    $user = requireAuthUser();
    $stmt = db()->prepare('SELECT * FROM conversations WHERE id = ? LIMIT 1');
    $stmt->execute([$id]);
    $thread = $stmt->fetch();
    if (!$thread) {
        je('Conversation not found.', 404);
    }
    if ($thread['user_a'] !== (string)$user['uid'] && $thread['user_b'] !== (string)$user['uid']) {
        je('Not your conversation.', 403);
    }
    $body = requestJson();
    $seconds = (int)($body['seconds'] ?? -1);
    if (!in_array($seconds, [0, 86400, 604800], true)) {
        je('Choose off, 24 hours or 7 days.', 400);
    }
    try {
        db()->prepare('UPDATE conversations SET disappearing_after = ? WHERE id = ?')
            ->execute([$seconds, $id]);
    } catch (Throwable) {
        je('Disappearing messages are not available yet. Try again shortly.', 503);
    }
    json(['ok' => true, 'disappearing_after' => $seconds]);
}

