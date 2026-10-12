<?php
/**
 * ONE-OFF: delete QA/test user accounts from production.
 *
 * Triggered via GitHub workflow_dispatch (see .github/workflows/delete-test-users.yml),
 * which POSTs {"emails": [...]} with the X-Seeder-Cron-Key header — the same
 * protection as the daily seeders. This file is REMOVED after the one-off run;
 * it is not a permanent endpoint.
 *
 * HARD SAFETY GUARD: a user is deleted ONLY if is_admin = 0 AND the email
 * matches a known QA/test pattern (qatest bots, +e2e personas, +critic
 * personas). Anything else is refused, so a typo can never nuke a real member.
 */
declare(strict_types=1);

require __DIR__ . '/lib/db.php';

$provided = $_SERVER['HTTP_X_SEEDER_CRON_KEY'] ?? '';
$expected = getenv('SEEDER_CRON_KEY') ?: '';
if ($expected === '' || !hash_equals($expected, (string)$provided)) {
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode(['ok' => false, 'error' => 'forbidden']);
    exit;
}

$body = json_decode(file_get_contents('php://input') ?: '{}', true);
$emails = $body['emails'] ?? [];
if (!is_array($emails)) $emails = [];

$deleted = [];
$skipped = [];

foreach ($emails as $email) {
    $email = trim((string)$email);
    if ($email === '') continue;

    $st = db()->prepare('SELECT id, email, is_admin FROM users WHERE email = ? LIMIT 1');
    $st->execute([$email]);
    $u = $st->fetch();
    if (!$u) { $skipped[] = ['email' => $email, 'reason' => 'not found']; continue; }
    if ((int)($u['is_admin'] ?? 0) === 1) { $skipped[] = ['email' => $email, 'reason' => 'is admin — refused']; continue; }

    $em = strtolower($u['email']);
    $isTestMail = str_contains($em, 'qatest@')
        || preg_match('/\+e2e\d*@/', $em)
        || preg_match('/\+critic\d*@/', $em);
    if (!$isTestMail) { $skipped[] = ['email' => $email, 'reason' => 'not a QA/test email — refused']; continue; }

    $id = $u['id'];
    try {
        db()->beginTransaction();
        // Conversations + messages involving this user.
        $convIds = db()->prepare('SELECT id FROM conversations WHERE user_a = ? OR user_b = ?');
        $convIds->execute([$id, $id]);
        $cids = array_column($convIds->fetchAll(), 'id');
        if ($cids) {
            $ph = implode(',', array_fill(0, count($cids), '?'));
            db()->prepare("DELETE FROM messages WHERE conversation_id IN ($ph)")->execute($cids);
            db()->prepare("DELETE FROM conversations WHERE id IN ($ph)")->execute($cids);
        }
        db()->prepare('DELETE FROM interests WHERE from_user_id = ? OR to_user_id = ?')->execute([$id, $id]);
        db()->prepare('DELETE FROM favourites WHERE user_id = ?')->execute([$id]);
        db()->prepare('DELETE FROM favourites WHERE profile_id IN (SELECT id FROM profiles WHERE user_id = ?)')->execute([$id]);
        db()->prepare('DELETE FROM verifications WHERE user_id = ?')->execute([$id]);
        db()->prepare('DELETE FROM reports WHERE reporter_id = ?')->execute([$id]);
        db()->prepare('DELETE FROM blocks WHERE blocker_id = ? OR blocked_id = ?')->execute([$id, $id]);
        db()->prepare('DELETE FROM wali_links WHERE user_id = ?')->execute([$id]);
        db()->prepare('DELETE FROM profile_drafts WHERE user_id = ?')->execute([$id]);
        db()->prepare('DELETE FROM sessions WHERE user_id = ?')->execute([$id]);
        db()->prepare('DELETE FROM email_verifications WHERE user_id = ?')->execute([$id]);
        db()->prepare('DELETE FROM notifications WHERE user_id = ?')->execute([$id]);
        db()->prepare('DELETE FROM posts WHERE author_id = ?')->execute([$id]);
        db()->prepare('DELETE FROM replies WHERE author_id = ?')->execute([$id]);
        // biodata_drafts has ON DELETE CASCADE, but be explicit for clarity.
        db()->prepare('DELETE FROM biodata_drafts WHERE user_id = ?')->execute([$id]);
        db()->prepare('DELETE FROM profiles WHERE user_id = ?')->execute([$id]);
        db()->prepare('DELETE FROM users WHERE id = ?')->execute([$id]);
        // admin_audit rows are intentionally KEPT (immutable trail).
        db()->commit();
        $deleted[] = $email;
    } catch (Throwable $e) {
        db()->rollBack();
        $skipped[] = ['email' => $email, 'reason' => 'db error: ' . substr($e->getMessage(), 0, 120)];
    }
}

header('Content-Type: application/json');
echo json_encode(['ok' => true, 'deleted' => $deleted, 'skipped' => $skipped]);
