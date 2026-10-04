<?php
/**
 * Child-process probe for the profile visibility + match helpers.
 *
 * Runs in its own PHP process because lib/db.php declares its own db() and
 * admin-routing-test.php already stubs one. It loads the REAL lib/db.php,
 * routes/messages.php and routes/profiles.php against an in-memory db stub, then
 * prints one key=json line per observation for the parent to assert on.
 *
 * The parent copies this file to a temp path before running it, so __DIR__ must
 * resolve relative to the tests/ directory.
 */
declare(strict_types=1);

/** Minimal statement: hands back whatever rows the test queued. */
final class ProbeStmt
{
    public function execute(array $p = []): bool { return true; }
    public function fetchAll(): array { return $GLOBALS['probe_rows'] ?? []; }
    public function fetch()
    {
        $rows = $GLOBALS['probe_rows'] ?? [];
        return $rows ? $rows[0] : false;
    }
    public function rowCount(): int { return count($GLOBALS['probe_rows'] ?? []); }
}

/** db() stand-in. Nothing in this probe should need a real database. */
function db()
{
    return new class {
        public function prepare(string $sql): ProbeStmt { return new ProbeStmt(); }
        public function query(string $sql): ProbeStmt { return new ProbeStmt(); }
        public function exec(string $sql): bool { return true; }
    };
}

// Stub only what lib/db.php does NOT provide, and only before including it.
// db.php's own db() is function_exists-guarded so we can inject a fake handle;
// its requestJson()/sanitizeText() are real and fine to use as-is. Every other
// helper below lives in a file this probe does NOT load.
function je(string $msg, int $status = 400): void { throw new RuntimeException($msg); }
function json($data = null, int $status = 200): void { throw new RuntimeException('JSON_CAPTURED'); }
function uuid(): string { return 'probe-uuid'; }
function rateCheck(string $a, string $b, int $c, int $d, string $e): void {}
function cip(): string { return '127.0.0.1'; }
function requireVerifiedEmail(string $uid): void {}
function cleanMessage(string $text): string { return $text; }

require __DIR__ . '/../lib/db.php';
require __DIR__ . '/../routes/messages.php';
require __DIR__ . '/../routes/profiles.php';

/** A representative public profile row; $over patches individual fields. */
function probeRow(array $over = []): array
{
    return array_merge([
        'user_id' => 'u2', 'display_name' => 'Ayesha', 'age' => 27,
        'gender' => 'female', 'city' => 'London', 'country' => 'UK',
        'bio' => 'Looking for a kind, practising partner.',
        'expectations' => 'A peaceful, deen-centred home.',
        'about_family' => 'Family lives in London.',
        'visibility' => 'public', 'photos_visibility' => 'public',
        'photo_url' => '/photos/u2.jpg', 'is_blocked' => 0, 'is_verified' => 1,
    ], $over);
}

/** Emit one observation for the parent to assert on. */
function emit(string $key, $value): void
{
    echo $key . '=' . json_encode($value, JSON_UNESCAPED_SLASHES) . "\n";
}

// ── Anonymous visitor ────────────────────────────────────────────────────────
$anon = visibleProfile(probeRow(), null);
emit('anon_is_array', is_array($anon));
emit('anon_bio', $anon['bio'] ?? null);
emit('anon_expectations', $anon['expectations'] ?? null);
emit('anon_family', $anon['aboutFamily'] ?? null);
emit('anon_photo', $anon['photo'] ?? null);
emit('anon_locked', (bool)($anon['photosLocked'] ?? true));
emit('anon_leaks_contact',
    array_key_exists('email', (array)$anon) || array_key_exists('contact', (array)$anon));

// "After interest" photos stay gated — that choice belongs to the member.
$after = visibleProfile(probeRow(['photos_visibility' => 'members']), null);
emit('after_tier_locked', (bool)($after['photosLocked'] ?? false));
emit('after_tier_photo', $after['photo'] ?? null);

// `private` is the one setting that hides a profile outright.
emit('private_hidden_anon', visibleProfile(probeRow(['visibility' => 'private']), null) === null);
emit('private_hidden_member', visibleProfile(probeRow(['visibility' => 'private']), ['uid' => 'u1']) === null);
emit('owner_sees_private', is_array(visibleProfile(probeRow(['visibility' => 'private']), ['uid' => 'u2'])));

// A signed-in viewer is not "members only" — they see the after-interest tier.
$authed = visibleProfile(probeRow(['photos_visibility' => 'members']), ['uid' => 'u1']);
emit('authed_photo', $authed['photo'] ?? null);
emit('authed_bio', $authed['bio'] ?? null);

// ── Match gating ────────────────────────────────────────────────────────────
// "Matched" had three separate implementations; one helper now defines it.
// Two distinct interest rows (in either direction) is what makes it mutual.
$GLOBALS['probe_rows'] = [['from_user_id' => 'u1', 'to_user_id' => 'u2']];
emit('one_sided_is_match', mutualInterest('u1', 'u2'));
$GLOBALS['probe_rows'] = [
    ['from_user_id' => 'u1', 'to_user_id' => 'u2'],
    ['from_user_id' => 'u2', 'to_user_id' => 'u1'],
];
emit('two_way_is_match', mutualInterest('u1', 'u2'));

// ── Sample profiles ───────────────────────────────────────────────────────────
// A seeded example profile must be labelled as one in every payload, so the UI
// can badge it and block contact. Missing this is how polished sample content
// ends up reading as a real person.
$demoAnon = visibleProfile(probeRow(['is_demo' => 1]), null);
emit('demo_flag_anon', $demoAnon['isDemo'] ?? null);
$demoAuthed = visibleProfile(probeRow(['is_demo' => 1]), ['uid' => 'u1']);
emit('demo_flag_authed', $demoAuthed['isDemo'] ?? null);
// A real member must NOT be flagged — this is the case that would mislabel every
// genuine profile on the site if it regressed.
$realAnon = visibleProfile(probeRow(['is_demo' => 0]), null);
emit('real_flag_false', $realAnon['isDemo'] ?? null);
// Absent column (a database predating is_demo) must read as false, not null.
emit('real_flag_missing_column', visibleProfile(probeRow(), null)['isDemo'] ?? null);