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
    // POST /api/messages/:id/image — send an image (multipart field 'photo').
    if ($method === 'POST' && $id !== null && ($segments[1] ?? null) === 'image') { sendMessageImage($id); return; }
    // GET /api/messages/:id/image/:msgId — serve one image, participants only.
    if ($method === 'GET' && $id !== null && ($segments[1] ?? null) === 'image' && isset($segments[2])) { messageImageServe($id, (string)$segments[2]); return; }
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
    // The attachment subquery is wrapped in a fallback: on a database that has
    // not run the 2026-11-10 migration yet the column does not exist, and the
    // whole list must not 500 for it — the preview simply falls back to text.
    $sqlWithAttachment =
        'SELECT c.id, c.user_a, c.user_b, c.created_at,
                (SELECT m.body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
                (SELECT m.attachment_type FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_attachment_type,
                (SELECT m.created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_at,
                CASE WHEN c.user_a = ? THEN c.user_b ELSE c.user_a END AS other_id,
                (SELECT p.display_name FROM profiles p WHERE p.user_id = CASE WHEN c.user_a = ? THEN c.user_b ELSE c.user_a END) AS other_name,
                (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.sender_id <> ?
                    AND ((CASE WHEN c.user_a = ? THEN c.last_read_a ELSE c.last_read_b END) IS NULL
                         OR m.created_at > (CASE WHEN c.user_a = ? THEN c.last_read_a ELSE c.last_read_b END))) AS unread_count
           FROM conversations c
          WHERE (c.user_a = ? OR c.user_b = ?)
            AND NOT EXISTS (
              SELECT 1 FROM blocks b
               WHERE (b.blocker_id = c.user_a AND b.blocked_id = c.user_b)
                  OR (b.blocker_id = c.user_b AND b.blocked_id = c.user_a)
            )
          ORDER BY c.created_at DESC';
    try {
        $stmt = db()->prepare($sqlWithAttachment);
        $stmt->execute([$user['uid'], $user['uid'], $user['uid'], $user['uid'], $user['uid'], $user['uid'], $user['uid']]);
        $rows = $stmt->fetchAll();
    } catch (Throwable $e) {
        // Double-quoted search: \n must be a real newline to match the SQL.
        // The search starts at the newline (not the comma) so the comma
        // after last_message survives — removing it would leave two SELECT
        // items with no separator and the fallback would 500 too.
        $stmt = db()->prepare(str_replace(
            "\n                (SELECT m.attachment_type FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_attachment_type,",
            '',
            $sqlWithAttachment
        ));
        $stmt->execute([$user['uid'], $user['uid'], $user['uid'], $user['uid'], $user['uid'], $user['uid'], $user['uid']]);
        $rows = $stmt->fetchAll();
    }

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
        $unreadCount = (int)($row['unread_count'] ?? 0);
        $list[] = [
            'id' => $row['id'],
            'participantId' => $row['other_id'],
            'participantName' => $row['other_name'] ?: 'Member',
            // An image message has no readable text — the list shows a
            // neutral label, never the (empty) decrypted body.
            'lastMessage' => ($row['last_attachment_type'] ?? null) === 'image' ? 'Sent a photo' : decAtRest($row['last_message']),
            'timestamp' => $row['last_at'] ?: $row['created_at'],
            'unread' => $unreadCount > 0,
            // Both casings: the Messages list reads unreadCount, the
            // dashboard badge total reads unread_count. Same value.
            'unread_count' => $unreadCount,
            'unreadCount' => $unreadCount,
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

    // Opening the thread marks the other member's messages read up to now.
    // Polling while the thread stays open re-marks, so the list badge clears
    // the moment the member is looking at the messages. (Second-precision
    // timestamps mean a message landing in the exact mark second can miss
    // the badge once; it still appears in the open thread, and the next
    // poll corrects the badge.)
    try {
        $readCol = $thread['user_a'] === (string)$user['uid'] ? 'last_read_a' : 'last_read_b';
        db()->prepare("UPDATE conversations SET {$readCol} = NOW() WHERE id = ?")->execute([$id]);
    } catch (Throwable) { /* columns may not exist yet */ }

    // Lazy purge: disappearing messages are deleted when the thread loads.
    // (No cron on shared hosting, so expiry is enforced on read.) Expired
    // image attachments are unlinked too, or their files would outlive the
    // message they belonged to.
    try {
        $expStmt = db()->prepare('SELECT attachment_path FROM messages WHERE conversation_id = ? AND expires_at IS NOT NULL AND expires_at <= NOW() AND attachment_path IS NOT NULL');
        $expStmt->execute([$id]);
        $expiredPaths = array_column($expStmt->fetchAll(), 'attachment_path');
        db()->prepare('DELETE FROM messages WHERE conversation_id = ? AND expires_at IS NOT NULL AND expires_at <= NOW()')
            ->execute([$id]);
        foreach ($expiredPaths as $p) {
            if (is_string($p) && $p !== '') @unlink($p);
        }
    } catch (Throwable) { /* columns may not exist yet */ }

    // The attachment columns are wrapped in a fallback: on a database that
    // has not run the 2026-11-10 migration yet the SELECT would throw and
    // the whole thread would 500.
    try {
        $msgStmt = db()->prepare('SELECT id, sender_id, body, created_at, attachment_path, attachment_type FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 500');
        $msgStmt->execute([$id]);
        $rows = $msgStmt->fetchAll();
    } catch (Throwable $e) {
        $msgStmt = db()->prepare('SELECT id, sender_id, body, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 500');
        $msgStmt->execute([$id]);
        $rows = $msgStmt->fetchAll();
    }

    $out = [];
    foreach ($rows as $row) {
        $isImage = ($row['attachment_type'] ?? null) === 'image';
        $out[] = [
            'id' => $row['id'],
            'senderId' => $row['sender_id'] === (string)$user['uid'] ? 'me' : 'them',
            'text' => decAtRest($row['body']),
            'timestamp' => $row['created_at'],
            'type' => $isImage ? 'image' : 'text',
            // A gated endpoint, not the file path — membership is re-checked
            // on every request, so a blocked member's link stops working.
            'image' => $isImage ? '/api/messages/' . $id . '/image/' . $row['id'] : null,
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

    // Spam limit (2026-11-10, external-audit fixes): per-user, 20/min.
    // cip() is the shared proxy IP, so the IP bucket would limit everyone.
    perUserRateCheck((string)$user['uid'], 'messages', 'sender_id', 60, 20, 'You are sending messages quickly — please slow down and try again in a minute.');

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

    touchLastActive((string)$user['uid']);

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

// POST /api/messages/:id/image — send an image in a chat (multipart field
// 'photo'). The SAME gates as a text message (verified email + mutual
// interest, server-side) and the SAME photo validation pipeline as the
// profile photo: byte-sniff, 5 MB cap, decode + completeness check, EXIF
// strip. The file lives under the shared photo root (never the web root)
// and is served only through the membership-checked endpoint below.
function sendMessageImage(string $id): void
{
    $user = requireAuthUser();
    // P0: messaging requires a verified email.
    requireVerifiedEmail((string)$user['uid']);

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

    if (!mutualInterest((string)$user['uid'], $other)) {
        je('You can only message someone you have both matched with.', 403);
    }
    if (pairBlocked((string)$user['uid'], $other)) {
        je('Messaging is unavailable with this member.', 403);
    }

    // Same spam limit as text (20/min per user).
    perUserRateCheck((string)$user['uid'], 'messages', 'sender_id', 60, 20, 'You are sending messages quickly — please slow down and try again in a minute.');

    // The profile-photo pipeline, reused verbatim: oversize guard, sniff,
    // decode, 40MP cap, completeness, EXIF strip.
    $bytes = photoReadUpload();
    $mime = sniffImageMime($bytes);
    if ($mime === null) {
        je('Photo must be a JPEG, PNG, or WebP image.', 400);
    }
    if (!imageIsComplete($bytes, $mime)) {
        je('That photo file looks damaged. Try a different photo.', 400);
    }
    $dims = imageSizeFromBytes($bytes);
    if ($dims === null || $dims[0] * $dims[1] > 40_000_000) {
        je('Photo must be under 40 megapixels.', 400);
    }
    if ($mime === 'image/jpeg') {
        $bytes = stripJpegExif($bytes);
    }
    $ext = $mime === 'image/jpeg' ? 'jpg' : ($mime === 'image/png' ? 'png' : 'webp');
    $dir = rtrim(photoBaseDir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'messages'
        . DIRECTORY_SEPARATOR . $id;
    if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
        je('Could not save the photo. Try again.', 500);
    }
    $stored = $dir . DIRECTORY_SEPARATOR . uuid() . '.' . $ext;
    if (@file_put_contents($stored, $bytes) === false) {
        je('Could not save the photo. Try again.', 500);
    }

    $msgId = uuid();
    $disappearing = (int)($row['disappearing_after'] ?? 0);
    $expiresAt = $disappearing > 0 ? date('Y-m-d H:i:s', time() + $disappearing) : null;
    try {
        $stmt = db()->prepare('INSERT INTO messages (id, conversation_id, sender_id, body, attachment_path, attachment_type, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([$msgId, $id, $user['uid'], encAtRest(''), $stored, 'image', $expiresAt]);
    } catch (Throwable $e) {
        // The attachment columns do not exist yet — do not store an image
        // message the thread could never render; fail cleanly instead.
        @unlink($stored);
        error_log('[api] image message insert failed: ' . substr($e->getMessage(), 0, 120));
        je('Image messages are not available yet. Try again shortly.', 503);
    }

    try {
        $nm = db()->prepare('SELECT display_name FROM profiles WHERE user_id = ? LIMIT 1');
        $nm->execute([(string)$user['uid']]);
        $senderName = $nm->fetch()['display_name'] ?? 'Someone';
        notifyUser($other, 'message', 'New message from ' . $senderName, 'Sent a photo', $id);
    } catch (Throwable $e) { /* notification is best-effort */ }

    touchLastActive((string)$user['uid']);

    $fetch = db()->prepare('SELECT id, created_at FROM messages WHERE id = ? LIMIT 1');
    $fetch->execute([$msgId]);
    $saved = $fetch->fetch();

    json([
        'id' => $saved['id'],
        'senderId' => 'me',
        'text' => '',
        'type' => 'image',
        'image' => '/api/messages/' . $id . '/image/' . $msgId,
        'timestamp' => $saved['created_at'],
    ], 201);
}

// GET /api/messages/:id/image/:msgId — serve one image, participants only.
// Membership + block are re-checked on every request, and the path is
// re-validated against the photo root, so a shared link dies the moment
// the conversation is blocked or the message expires.
function messageImageServe(string $id, string $msgId): void
{
    $user = requireAuthUser();
    $conv = db()->prepare('SELECT * FROM conversations WHERE id = ? LIMIT 1');
    $conv->execute([$id]);
    $row = $conv->fetch();
    if (!$row) {
        je('Not found.', 404);
    }
    if ($row['user_a'] !== (string)$user['uid'] && $row['user_b'] !== (string)$user['uid']) {
        je('Not found.', 404);
    }
    $other = $row['user_a'] === (string)$user['uid'] ? $row['user_b'] : $row['user_a'];
    if (pairBlocked((string)$user['uid'], $other)) {
        je('Not found.', 404);
    }

    try {
        $mStmt = db()->prepare('SELECT attachment_path, attachment_type FROM messages WHERE id = ? AND conversation_id = ? LIMIT 1');
        $mStmt->execute([$msgId, $id]);
        $msg = $mStmt->fetch();
    } catch (Throwable $e) {
        je('Not found.', 404);
    }
    if (!$msg || ($msg['attachment_type'] ?? null) !== 'image' || (string)($msg['attachment_path'] ?? '') === '') {
        je('Not found.', 404);
    }

    $base = realpath(photoBaseDir()) ?: photoBaseDir();
    $real = realpath((string)$msg['attachment_path']) ?: '';
    if ($real === '' || strncmp($real, $base, strlen($base)) !== 0) {
        je('Image unavailable.', 404);
    }
    $mime = class_exists('finfo')
        ? ((new finfo(FILEINFO_MIME_TYPE))->file($real) ?: 'application/octet-stream')
        : (sniffImageMime((string)@file_get_contents($real)) ?: 'application/octet-stream');
    $size = filesize($real);

    header('Content-Type: ' . $mime);
    header('Content-Length: ' . $size);
    header('Cache-Control: private, no-store, max-age=0');
    header('X-Content-Type-Options: nosniff');
    header('Content-Disposition: inline');
    readfile($real);
    exit;
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

