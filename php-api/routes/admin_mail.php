<?php
/**
 * Admin webmail — read @shiarishta.com mailboxes from the admin panel
 * (Syed's ask, 2026-11-16, after a Facebook developer confirmation code
 * sat unread in seomaster7736@shiarishta.com: cPanel webmail is
 * unreachable from the agent environment and painful for the owner).
 *
 * Design:
 *   - Admin-only (routeAdmin has already enforced isAdmin before dispatch).
 *   - READ-ONLY in v1: every fetch uses BODY.PEEK / FT_PEEK, so opening a
 *     message never flips its \Seen flag, and there are no delete, move,
 *     or send endpoints here. Sending already exists elsewhere.
 *   - The mailbox password is entered once in the panel, proven with a
 *     live IMAP login BEFORE it is stored, and stored only as
 *     encAtRest() ciphertext (AES-GCM, DATA_ENCRYPTION_KEY). It is never
 *     returned by any endpoint and never logged.
 *   - The IMAP server is the host's own mail server on loopback — the PHP
 *     backend sits on the same cPanel account as the mailboxes, the same
 *     way Roundcube reaches Dovecot. Two transports: the php-imap
 *     extension when the host provides it, otherwise a minimal socket
 *     IMAP client (LOGIN / LIST / SELECT / UID SEARCH / UID FETCH).
 *     Both feed ONE shared raw-message parser, so the JSON shape is
 *     identical whichever transport served the request.
 */

const MAIL_PAGE_SIZE = 25;
const MAIL_IMAP_HOST = '127.0.0.1';
const MAIL_IMAP_PORT = 993;

function routeAdminMail(string $method, array $segments): void
{
    $sub = $segments[0] ?? null;

    if ($method === 'GET' && $sub === 'status') { adminMailStatus(); return; }

    if ($sub === 'accounts') {
        if ($method === 'GET' && ($segments[1] ?? null) === null) { adminMailAccountsList(); return; }
        if ($method === 'POST' && ($segments[1] ?? null) === null) { adminMailAccountConnect(); return; }
        $id = (string)($segments[1] ?? '');
        if ($method === 'DELETE' && $id !== '') { adminMailAccountDelete($id); return; }
        if ($method === 'GET' && $id !== '' && ($segments[2] ?? null) === 'folders') { adminMailFolders($id); return; }
        if ($method === 'GET' && $id !== '' && ($segments[2] ?? null) === 'messages') { adminMailMessages($id); return; }
        if ($method === 'GET' && $id !== '' && ($segments[2] ?? null) === 'message') { adminMailMessage($id); return; }
    }

    json(['error' => 'Not found'], 404);
}

// ── Storage ─────────────────────────────────────────────────────────────

function mailAccountsTable(): void
{
    db()->exec(
        "CREATE TABLE IF NOT EXISTS mail_accounts (
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            address VARCHAR(190) NOT NULL UNIQUE,
            password_enc TEXT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_login_ok_at DATETIME NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
}

function mailAccountRow(string $id): ?array
{
    mailAccountsTable();
    $stmt = db()->prepare('SELECT * FROM mail_accounts WHERE id = ? LIMIT 1');
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function adminMailStatus(): void
{
    json([
        'ok' => true,
        'imapExtension' => function_exists('imap_open'),
        'transport' => function_exists('imap_open') ? 'php-imap' : 'socket',
    ]);
}

function adminMailAccountsList(): void
{
    mailAccountsTable();
    $rows = db()->query('SELECT id, address, created_at, last_login_ok_at FROM mail_accounts ORDER BY created_at ASC')
        ->fetchAll(PDO::FETCH_ASSOC);
    json([
        'ok' => true,
        'rows' => array_map(static fn(array $r) => [
            'id' => $r['id'],
            'address' => $r['address'],
            'connected' => !empty($r['last_login_ok_at']),
            'lastLoginOkAt' => $r['last_login_ok_at'],
            'createdAt' => $r['created_at'],
        ], $rows),
    ]);
}

function adminMailAccountConnect(): void
{
    $body = requestJson();
    $address = strtolower(trim((string)($body['address'] ?? '')));
    $password = (string)($body['password'] ?? '');
    if (!filter_var($address, FILTER_VALIDATE_EMAIL)) {
        je('Enter a valid mailbox address.', 400);
    }
    if ($password === '') {
        je('Enter the mailbox password.', 400);
    }

    // Prove the credentials BEFORE storing anything: a stored password
    // that cannot log in is worse than none.
    try {
        $h = mailImapConnect($address, $password);
        mailImapClose($h);
    } catch (RuntimeException $e) {
        je('Could not log in to that mailbox: ' . $e->getMessage(), 422);
    }

    mailAccountsTable();
    $existing = db()->prepare('SELECT id FROM mail_accounts WHERE address = ? LIMIT 1');
    $existing->execute([$address]);
    $id = $existing->fetchColumn();
    if ($id) {
        db()->prepare('UPDATE mail_accounts SET password_enc = ?, updated_at = UTC_TIMESTAMP(), last_login_ok_at = UTC_TIMESTAMP() WHERE id = ?')
            ->execute([encAtRest($password), $id]);
    } else {
        $id = uuid();
        db()->prepare('INSERT INTO mail_accounts (id, address, password_enc, last_login_ok_at) VALUES (?, ?, ?, UTC_TIMESTAMP())')
            ->execute([$id, $address, encAtRest($password)]);
    }
    json(['ok' => true, 'id' => $id, 'address' => $address], 201);
}

function adminMailAccountDelete(string $id): void
{
    mailAccountsTable();
    $stmt = db()->prepare('DELETE FROM mail_accounts WHERE id = ?');
    $stmt->execute([$id]);
    if ($stmt->rowCount() === 0) je('Mailbox not found.', 404);
    json(['ok' => true]);
}

// ── Endpoints that talk to the mail server ──────────────────────────────

/** Open a connection for a stored account or fail the request. */
function mailAccountConnection(string $id): array
{
    $row = mailAccountRow($id);
    if (!$row) je('Mailbox not found. Connect it first.', 404);
    $password = decAtRest($row['password_enc']);
    if ($password === '') je('Stored mailbox password could not be decrypted. Reconnect the mailbox.', 409);
    try {
        $h = mailImapConnect((string)$row['address'], $password);
    } catch (RuntimeException $e) {
        je('Mailbox login failed: ' . $e->getMessage(), 502);
    }
    db()->prepare('UPDATE mail_accounts SET last_login_ok_at = UTC_TIMESTAMP() WHERE id = ?')->execute([$id]);
    return [$row, $h];
}

function adminMailFolders(string $id): void
{
    [, $h] = mailAccountConnection($id);
    try {
        $folders = mailImapListFolders($h);
    } catch (RuntimeException $e) {
        mailImapClose($h);
        je('Could not list folders: ' . $e->getMessage(), 502);
    }
    mailImapClose($h);
    json(['ok' => true, 'folders' => $folders]);
}

function adminMailMessages(string $id): void
{
    $folder = (string)($_GET['folder'] ?? 'INBOX');
    $q = trim((string)($_GET['q'] ?? ''));
    $page = max(1, (int)($_GET['page'] ?? 1));
    [, $h] = mailAccountConnection($id);
    try {
        $result = mailImapListMessages($h, $folder, $q, $page);
    } catch (RuntimeException $e) {
        mailImapClose($h);
        je('Could not read that folder: ' . $e->getMessage(), 502);
    }
    mailImapClose($h);
    json(['ok' => true] + $result);
}

function adminMailMessage(string $id): void
{
    $folder = (string)($_GET['folder'] ?? 'INBOX');
    $uid = (int)($_GET['uid'] ?? 0);
    if ($uid <= 0) je('Missing message uid.', 400);
    [, $h] = mailAccountConnection($id);
    try {
        $raw = mailImapFetchRaw($h, $folder, $uid);
    } catch (RuntimeException $e) {
        mailImapClose($h);
        je('Could not fetch that message: ' . $e->getMessage(), 502);
    }
    mailImapClose($h);
    if ($raw === '') je('Message not found.', 404);
    $msg = mailParseMessage($raw);
    json(['ok' => true, 'uid' => $uid, 'folder' => $folder] + $msg);
}

// ── IMAP transport: php-imap extension ──────────────────────────────────

function mailImapConnect(string $address, string $password): array
{
    if (function_exists('imap_open')) {
        imap_timeout(IMAP_OPENTIMEOUT, 15);
        imap_timeout(IMAP_READTIMEOUT, 20);
        $conn = @imap_open(
            '{' . MAIL_IMAP_HOST . ':' . MAIL_IMAP_PORT . '/imap/ssl/novalidate-cert}',
            $address,
            $password,
            0,
            1
        );
        if ($conn === false) {
            $err = function_exists('imap_last_error') ? (string)imap_last_error() : 'IMAP login failed';
            throw new RuntimeException($err !== '' ? $err : 'IMAP login failed');
        }
        return ['kind' => 'ext', 'conn' => $conn, 'folder' => null];
    }
    return mailSockConnect($address, $password);
}

function mailImapClose(array $h): void
{
    if (($h['kind'] ?? '') === 'ext') {
        @imap_close($h['conn']);
    } elseif (!empty($h['fp'])) {
        @fwrite($h['fp'], "Z999 LOGOUT\r\n");
        @fclose($h['fp']);
    }
}

/** Select a folder on either transport. Returns the message count. */
function mailImapSelect(array &$h, string $folder): int
{
    if ($h['kind'] === 'ext') {
        if (($h['folder'] ?? null) !== $folder) {
            if (!@imap_reopen($h['conn'], '{' . MAIL_IMAP_HOST . ':' . MAIL_IMAP_PORT . '/imap/ssl/novalidate-cert}' . imap_utf7_encode($folder))) {
                throw new RuntimeException('folder not found: ' . $folder);
            }
            $h['folder'] = $folder;
        }
        return (int)imap_num_msg($h['conn']);
    }
    $resp = mailSockCmd($h, 'SELECT ' . mailImapQuote($folder));
    foreach ($resp['lines'] as $line) {
        if (preg_match('/^\* (\d+) EXISTS/', $line, $m)) return (int)$m[1];
    }
    return 0;
}

function mailImapListFolders(array $h): array
{
    if ($h['kind'] === 'ext') {
        $boxes = @imap_list($h['conn'], '{' . MAIL_IMAP_HOST . ':' . MAIL_IMAP_PORT . '/imap/ssl/novalidate-cert}', '*');
        if ($boxes === false) throw new RuntimeException('folder list failed');
        $out = [];
        foreach ($boxes as $box) {
            $name = preg_replace('/^\{[^}]*\}/', '', (string)$box);
            $out[] = ['name' => imap_utf7_decode($name)];
        }
        return $out;
    }
    $resp = mailSockCmd($h, 'LIST "" "*"');
    $out = [];
    foreach ($resp['lines'] as $line) {
        // * LIST (\HasNoChildren) "." "INBOX.Sent"  — delimiter + quoted name.
        if (preg_match('/^\* LIST \([^)]*\) (?:\"[^\"]*\"|NIL) \"(.*)\"$/', trim($line), $m)) {
            $out[] = ['name' => stripcslashes($m[1])];
        }
    }
    return $out;
}

function mailImapListMessages(array $h, string $folder, string $q, int $page): array
{
    $total = mailImapSelect($h, $folder);
    if ($total === 0) {
        return ['folder' => $folder, 'total' => 0, 'page' => $page, 'pageSize' => MAIL_PAGE_SIZE, 'rows' => []];
    }

    if ($h['kind'] === 'ext') {
        $uids = $q !== ''
            ? @imap_search($h['conn'], 'TEXT ' . mailImapSearchQuote($q), SE_UID)
            : @imap_search($h['conn'], 'ALL', SE_UID);
        if ($uids === false) $uids = [];
        rsort($uids, SORT_NUMERIC);
        $total = count($uids);
        $slice = array_slice($uids, ($page - 1) * MAIL_PAGE_SIZE, MAIL_PAGE_SIZE);
        $rows = [];
        if ($slice) {
            $overview = @imap_fetch_overview($h['conn'], implode(',', $slice), FT_UID);
            $byUid = [];
            foreach ($overview ?: [] as $o) $byUid[(int)$o->uid] = $o;
            foreach ($slice as $uid) {
                $o = $byUid[(int)$uid] ?? null;
                $rows[] = [
                    'uid' => (int)$uid,
                    'from' => $o ? mailDecodeHeader((string)($o->from ?? '')) : '',
                    'subject' => $o ? mailDecodeHeader((string)($o->subject ?? '')) : '',
                    'date' => $o ? (string)($o->date ?? '') : '',
                    'seen' => $o ? !empty($o->seen) : true,
                ];
            }
        }
        return ['folder' => $folder, 'total' => $total, 'page' => $page, 'pageSize' => MAIL_PAGE_SIZE, 'rows' => $rows];
    }

    // Socket transport.
    $criteria = $q !== '' ? 'TEXT ' . mailImapQuote($q) : 'ALL';
    $resp = mailSockCmd($h, 'UID SEARCH ' . $criteria);
    $uids = [];
    foreach ($resp['lines'] as $line) {
        if (preg_match('/^\* SEARCH(.*)$/', trim($line), $m)) {
            foreach (preg_split('/\s+/', trim($m[1])) as $n) {
                if (ctype_digit($n)) $uids[] = (int)$n;
            }
        }
    }
    rsort($uids, SORT_NUMERIC);
    $total = count($uids);
    $slice = array_slice($uids, ($page - 1) * MAIL_PAGE_SIZE, MAIL_PAGE_SIZE);
    $rows = [];
    if ($slice) {
        $resp = mailSockCmd(
            $h,
            'UID FETCH ' . implode(',', $slice) . ' (FLAGS BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)])'
        );
        $seenByUid = [];
        foreach ($resp['items'] as $item) {
            if (!preg_match('/UID (\d+)/', $item['head'], $um)) continue;
            $uid = (int)$um[1];
            $seenByUid[$uid] = str_contains($item['head'], '\\Seen');
            $headers = mailParseHeaders($item['literal']);
            $rows[] = [
                'uid' => $uid,
                'from' => mailDecodeHeader($headers['from'] ?? ''),
                'subject' => mailDecodeHeader($headers['subject'] ?? ''),
                'date' => $headers['date'] ?? '',
                'seen' => $seenByUid[$uid],
            ];
        }
        // FETCH answers in ascending order; present newest first like the ext path.
        usort($rows, static fn(array $a, array $b) => $b['uid'] <=> $a['uid']);
    }
    return ['folder' => $folder, 'total' => $total, 'page' => $page, 'pageSize' => MAIL_PAGE_SIZE, 'rows' => $rows];
}

function mailImapFetchRaw(array $h, string $folder, int $uid): string
{
    mailImapSelect($h, $folder);
    if ($h['kind'] === 'ext') {
        $raw = @imap_fetchbody($h['conn'], (string)$uid, '', FT_UID | FT_PEEK);
        return $raw === false ? '' : (string)$raw;
    }
    $resp = mailSockCmd($h, 'UID FETCH ' . $uid . ' (BODY.PEEK[])');
    foreach ($resp['items'] as $item) {
        if (preg_match('/UID (\d+)/', $item['head'], $um) && (int)$um[1] === $uid) {
            return $item['literal'];
        }
    }
    return '';
}

function mailImapQuote(string $s): string
{
    return '"' . str_replace(['\\', '"'], ['\\\\', '\\"'], $s) . '"';
}

function mailImapSearchQuote(string $s): string
{
    return '"' . str_replace(['\\', '"'], ['\\\\', '\\"'], $s) . '"';
}

// ── IMAP transport: minimal socket client (fallback) ────────────────────
// Used only when the host has no php-imap extension. Speaks just enough
// IMAP4rev1 for the read-only operations above. Every command's tagged
// reply is checked; a NO/BAD raises with the server's own words (which
// never contain the password — commands are never echoed back).

function mailSockConnect(string $address, string $password): array
{
    $ctx = stream_context_create([
        'ssl' => [
            // Loopback to the host's own mail server; cPanel serves a
            // hostname certificate on 993, so peer verification cannot
            // apply to 127.0.0.1. The traffic never leaves the machine.
            'verify_peer' => false,
            'verify_peer_name' => false,
            'allow_self_signed' => true,
        ],
    ]);
    $fp = @stream_socket_client(
        'ssl://' . MAIL_IMAP_HOST . ':' . MAIL_IMAP_PORT,
        $errno,
        $errstr,
        15,
        STREAM_CLIENT_CONNECT,
        $ctx
    );
    if ($fp === false) {
        throw new RuntimeException('cannot reach the local mail server (' . $errstr . ')');
    }
    stream_set_timeout($fp, 20);
    $h = ['kind' => 'sock', 'fp' => $fp, 'tagSeq' => 0, 'folder' => null];
    $greeting = fgets($fp);
    if ($greeting === false || !str_starts_with($greeting, '* OK')) {
        fclose($fp);
        throw new RuntimeException('unexpected mail server greeting');
    }
    try {
        mailSockCmd($h, 'LOGIN ' . mailImapQuote($address) . ' ' . mailImapQuote($password));
    } catch (RuntimeException $e) {
        fclose($fp);
        throw new RuntimeException('mail server refused the login');
    }
    return $h;
}

/**
 * Run one tagged command and collect the untagged replies.
 * Returns ['lines' => string[], 'items' => [{head, literal}]] where an
 * item is a response line that carried a {n} literal (FETCH payloads).
 */
function mailSockCmd(array &$h, string $cmd): array
{
    $h['tagSeq']++;
    $tag = 'A' . $h['tagSeq'];
    fwrite($h['fp'], $tag . ' ' . $cmd . "\r\n");
    $lines = [];
    $items = [];
    while (true) {
        $line = fgets($h['fp']);
        if ($line === false) throw new RuntimeException('mail server closed the connection');
        if (str_starts_with($line, $tag . ' ')) {
            $status = strtoupper(trim(substr($line, strlen($tag) + 1)));
            if (!str_starts_with($status, 'OK')) {
                throw new RuntimeException('mail server said: ' . trim($line));
            }
            break;
        }
        if (preg_match('/^(.*?)\{(\d+)\}\r?\n$/', $line, $m)) {
            $n = (int)$m[2];
            $literal = '';
            $remaining = $n;
            while ($remaining > 0) {
                $chunk = fread($h['fp'], min(8192, $remaining));
                if ($chunk === false || $chunk === '') throw new RuntimeException('mail server closed mid-message');
                $literal .= $chunk;
                $remaining -= strlen($chunk);
            }
            // The rest of this response item (usually just ")") arrives as
            // the start of the next line; consume up to its newline.
            $tail = fgets($h['fp']);
            if ($tail === false) throw new RuntimeException('mail server closed the connection');
            $items[] = ['head' => trim($m[1] . $tail), 'literal' => $literal];
            continue;
        }
        $lines[] = $line;
    }
    return ['lines' => $lines, 'items' => $items];
}

// ── Raw message parsing (shared by both transports) ─────────────────────

function mailParseHeaders(string $raw): array
{
    $split = preg_split("/\r?\n\r?\n/", $raw, 2);
    $head = $split[0];
    $headers = [];
    $current = null;
    foreach (preg_split("/\r?\n/", $head) as $line) {
        if (($line[0] ?? '') === ' ' || ($line[0] ?? '') === "\t") {
            if ($current !== null) $headers[$current] .= ' ' . trim($line);
            continue;
        }
        if (preg_match('/^([^:]+):\s*(.*)$/', $line, $m)) {
            $current = strtolower(trim($m[1]));
            if (!isset($headers[$current])) $headers[$current] = trim($m[2]);
        }
    }
    return $headers;
}

function mailHeaderBodySplit(string $raw): array
{
    $parts = preg_split("/\r?\n\r?\n/", $raw, 2);
    return [$parts[0], $parts[1] ?? ''];
}

function mailDecodeHeader(string $s): string
{
    if (!str_contains($s, '=?')) return trim($s);
    // Whitespace between two adjacent encoded words is not significant.
    $s = preg_replace('/\?=\s+=\?/', '?==?', $s);
    $decoded = preg_replace_callback(
        '/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/',
        static function (array $m): string {
            $bytes = strtoupper($m[2]) === 'B'
                ? (base64_decode($m[3]) ?: '')
                : quoted_printable_decode(str_replace('_', ' ', $m[3]));
            return mailToUtf8($bytes, $m[1]);
        },
        $s
    );
    return trim((string)$decoded);
}

function mailToUtf8(string $bytes, string $charset): string
{
    $charset = strtoupper(trim($charset));
    if ($charset === '' || $charset === 'UTF-8' || $charset === 'US-ASCII') return $bytes;
    if (!function_exists('mb_convert_encoding')) return $bytes;
    try {
        $out = mb_convert_encoding($bytes, 'UTF-8', $charset);
        return $out === false ? $bytes : $out;
    } catch (Throwable) {
        return $bytes;
    }
}

function mailHeaderParams(string $value): array
{
    // "multipart/mixed; boundary="abc"; charset=UTF-8" → [main, params]
    $parts = array_map('trim', explode(';', $value));
    $main = strtolower((string)array_shift($parts));
    $params = [];
    foreach ($parts as $p) {
        if (preg_match('/^([^=]+)=\"?([^\"]*)\"?$/', $p, $m)) {
            $params[strtolower(trim($m[1]))] = trim($m[2]);
        }
    }
    return [$main, $params];
}

function mailDecodeBody(string $body, string $encoding): string
{
    return match (strtolower(trim($encoding))) {
        'base64' => base64_decode($body) ?: '',
        'quoted-printable' => quoted_printable_decode($body),
        default => $body,
    };
}

/** Recursively find the best readable text + attachment names in a MIME entity. */
function mailMimeWalk(array $headers, string $body, int $depth, array &$attachments): ?string
{
    [$type, $params] = mailHeaderParams($headers['content-type'] ?? 'text/plain');
    $disposition = strtolower($headers['content-disposition'] ?? '');
    if (str_starts_with($disposition, 'attachment')) {
        [, $dParams] = mailHeaderParams($headers['content-disposition']);
        $attachments[] = $dParams['filename'] ?? ($params['name'] ?? 'attachment');
        return null;
    }

    if (str_starts_with($type, 'multipart/') && $depth < 4 && !empty($params['boundary'])) {
        $chunks = preg_split('/--' . preg_quote($params['boundary'], '/') . '(?:--)?\s*(?:\r?\n|$)/', $body);
        $firstText = null;
        $htmlText = null;
        foreach ($chunks ?: [] as $chunk) {
            if (trim($chunk) === '') continue;
            [$pHead, $pBody] = mailHeaderBodySplit($chunk);
            $pHeaders = mailParseHeaders($chunk);
            [$pType] = mailHeaderParams($pHeaders['content-type'] ?? 'text/plain');
            $text = mailMimeWalk($pHeaders, $pBody, $depth + 1, $attachments);
            if ($text === null) continue;
            if ($pType === 'text/html') $htmlText ??= $text;
            else $firstText ??= $text;
        }
        return $firstText ?? $htmlText;
    }

    $decoded = mailDecodeBody($body, $headers['content-transfer-encoding'] ?? '');
    if ($type === 'text/html') {
        $noBlocks = preg_replace('#<(script|style)[^>]*>.*?</\1>#is', '', $decoded) ?? $decoded;
        $withBreaks = preg_replace('#<br\s*/?>|</p>|</div>|</li>#i', "\n", $noBlocks) ?? $noBlocks;
        $plain = html_entity_decode(strip_tags($withBreaks), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        return mailToUtf8($plain, $params['charset'] ?? 'UTF-8');
    }
    if (str_starts_with($type, 'text/')) {
        return mailToUtf8($decoded, $params['charset'] ?? 'UTF-8');
    }
    return null;
}

function mailParseMessage(string $raw): array
{
    $headers = mailParseHeaders($raw);
    [, $body] = mailHeaderBodySplit($raw);
    $attachments = [];
    $text = mailMimeWalk($headers, $body, 0, $attachments);
    $text = trim((string)($text ?? ''));
    if (strlen($text) > 200000) $text = substr($text, 0, 200000);
    return [
        'from' => mailDecodeHeader($headers['from'] ?? ''),
        'to' => mailDecodeHeader($headers['to'] ?? ''),
        'subject' => mailDecodeHeader($headers['subject'] ?? ''),
        'date' => $headers['date'] ?? '',
        'text' => $text,
        'attachments' => $attachments,
    ];
}
