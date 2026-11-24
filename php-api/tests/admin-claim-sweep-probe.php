<?php
/**
 * Child-process probe for the A-03 follow-up sweep (2026-11-24).
 *
 * d1cb6bf made requireAdminUser() re-check users.is_admin in the DB, but six
 * softer reads still trusted the isAdmin JWT claim directly:
 *   community.php  — delete any post/reply (author OR claim-admin)
 *   drafts.php     — read a draft's event trail (creator OR claim-admin)
 *   profiles.php   — test-shell filter bypass, browse + recently-active
 *   matchmaker.php — serve a submission photo (owner OR claim-admin)
 *   analytics.php  — pageview beacon internal-traffic exclusion
 *   ai.php         — includeAll scope (drafts/future blog posts)
 * Each now calls userIsAdmin() — the REAL helper from lib/db.php, loaded
 * here against a stub DB exactly like admin-gate-probe.php. The probe
 * replays each site's decision expression (author/owner checks preserved
 * verbatim) with a demoted admin's stale claim, a current admin, and the
 * ordinary non-admin cases, and also asserts at the source level that no
 * claim read survives in any of the six files.
 */
declare(strict_types=1);

final class SweepStmt
{
    public function execute(array $p = []): bool { return true; }
    public function fetchAll(): array { return $GLOBALS['sweep_rows'] ?? []; }
    public function fetch()
    {
        $rows = $GLOBALS['sweep_rows'] ?? [];
        return $rows ? $rows[0] : false;
    }
    public function rowCount(): int { return count($GLOBALS['sweep_rows'] ?? []); }
}

function db()
{
    return new class {
        public function prepare(string $sql): SweepStmt
        {
            $GLOBALS['sweep_sql'][] = $sql;
            return new SweepStmt();
        }
        public function query(string $sql): SweepStmt
        {
            $GLOBALS['sweep_sql'][] = $sql;
            return new SweepStmt();
        }
        public function exec(string $sql): bool { return true; }
    };
}

function je(string $msg, int $status = 400): void { throw new RuntimeException('J:' . $status . ':' . $msg); }
function json($data = null, int $status = 200): void { throw new RuntimeException('JSON_CAPTURED'); }
function uuid(): string { return 'sweep-uuid'; }
function rateCheck(string $a, string $b, int $c, int $d, string $e): void {}
function cip(): string { return '127.0.0.1'; }
function requireVerifiedEmail(string $uid): void {}
function cleanMessage(string $text): string { return $text; }
function hbearer(): ?string { return 'sweep-token'; }
function jwtSecret(): string { return str_repeat('s', 40); }
function jwtVerify(string $token, string $secret): array { return $GLOBALS['sweep_claims'] ?? []; }

require __DIR__ . '/../lib/db.php';

function emit(string $key, $value): void
{
    echo $key . '=' . json_encode($value, JSON_UNESCAPED_SLASHES) . "\n";
}

/** Point the stub DB at a users row: true/false = is_admin, null = no row. */
function sweepDbAdmin(?bool $dbAdmin): void
{
    $GLOBALS['sweep_rows'] = $dbAdmin === null ? [] : [['is_admin' => $dbAdmin ? 1 : 0]];
    $GLOBALS['sweep_sql'] = [];
}

// The three token shapes every scenario is replayed with. The demoted
// admin's claim still says isAdmin=true — that is the whole point.
$demotedClaims = ['uid' => 'admin-1', 'isAdmin' => true];   // DB: is_admin = 0
$currentClaims = ['uid' => 'admin-1', 'isAdmin' => true];   // DB: is_admin = 1
$memberClaims  = ['uid' => 'member-1', 'isAdmin' => false]; // DB: is_admin = 0

/** community.php: author OR admin may delete (posts and replies share it). */
function authorOrAdmin(string $authorId, array $user, ?bool $dbAdmin): bool
{
    sweepDbAdmin($dbAdmin);
    $isAdmin = userIsAdmin((string)$user['uid']);
    return $isAdmin || (string)$authorId === (string)$user['uid'];
}

emit('community_demoted_cannot_delete_others', authorOrAdmin('victim-1', $demotedClaims, false) === false);
emit('community_current_admin_can_delete_others', authorOrAdmin('victim-1', $currentClaims, true) === true);
emit('community_author_can_delete_own', authorOrAdmin('member-1', $memberClaims, false) === true);
emit('community_stranger_cannot_delete', authorOrAdmin('victim-1', $memberClaims, false) === false);

/** drafts.php: creator OR admin may read the event trail. */
function creatorOrAdmin(string $creatorId, array $user, ?bool $dbAdmin): bool
{
    sweepDbAdmin($dbAdmin);
    return ((string)$creatorId === (string)$user['uid']) || userIsAdmin((string)$user['uid']);
}

emit('drafts_demoted_cannot_read_others', creatorOrAdmin('member-9', $demotedClaims, false) === false);
emit('drafts_current_admin_can_read_others', creatorOrAdmin('member-9', $currentClaims, true) === true);
emit('drafts_creator_can_read_own', creatorOrAdmin('member-1', $memberClaims, false) === true);

/** matchmaker.php: owner OR admin may be served the photo. */
function ownerOrAdmin(string $ownerId, array $user, ?bool $dbAdmin): bool
{
    sweepDbAdmin($dbAdmin);
    $isOwner = (string)($user['uid'] ?? '') === $ownerId;
    return $isOwner || userIsAdmin((string)($user['uid'] ?? ''));
}

emit('matchmaker_demoted_cannot_view_others', ownerOrAdmin('member-9', $demotedClaims, false) === false);
emit('matchmaker_current_admin_can_view_others', ownerOrAdmin('member-9', $currentClaims, true) === true);
emit('matchmaker_owner_can_view_own', ownerOrAdmin('member-1', $memberClaims, false) === true);

/** profiles.php: only a current admin bypasses the test-shell filter. */
function shellBypass(?array $viewer, ?bool $dbAdmin): bool
{
    if ($viewer === null) return false; // anonymous: short-circuit, no DB hit
    sweepDbAdmin($dbAdmin);
    return userIsAdmin((string)$viewer['uid']);
}

emit('profiles_demoted_no_shell_bypass', shellBypass($demotedClaims, false) === false);
emit('profiles_current_admin_shell_bypass', shellBypass($currentClaims, true) === true);
emit('profiles_member_no_shell_bypass', shellBypass($memberClaims, false) === false);
emit('profiles_anon_no_shell_bypass', shellBypass(null, null) === false);

/** analytics.php + ai.php: signed-in AND current admin. */
function signedInAdmin(?array $viewer, ?bool $dbAdmin): bool
{
    if ($viewer === null) return false;
    sweepDbAdmin($dbAdmin);
    return userIsAdmin((string)$viewer['uid']);
}

emit('analytics_demoted_counts_as_visitor', signedInAdmin($demotedClaims, false) === false);
emit('analytics_current_admin_internal', signedInAdmin($currentClaims, true) === true);
emit('ai_demoted_no_include_all', signedInAdmin($demotedClaims, false) === false);
emit('ai_current_admin_include_all', signedInAdmin($currentClaims, true) === true);

/**
 * Source-level contract: each swept file must call userIsAdmin() and must
 * not contain any of the old claim-read expressions. (The endpoint harness
 * proves behaviour end-to-end for community; this keeps the other five
 * from silently regressing to the claim in a future edit.)
 */
$oldReads = [
    "!empty(\$user['isAdmin'])",
    "!empty(\$viewer['isAdmin'])",
    "empty(\$viewer['isAdmin'])",
    "(\$viewer['isAdmin'] ?? false)",
    "!empty(\$me['isAdmin'])",
    "currentUser()['isAdmin']",
];
$files = [
    'community'  => __DIR__ . '/../routes/community.php',
    'drafts'     => __DIR__ . '/../routes/drafts.php',
    'profiles'   => __DIR__ . '/../routes/profiles.php',
    'matchmaker' => __DIR__ . '/../routes/matchmaker.php',
    'analytics'  => __DIR__ . '/../routes/analytics.php',
    'ai'         => __DIR__ . '/../routes/ai.php',
];
foreach ($files as $name => $path) {
    $src = (string)file_get_contents($path);
    $clean = str_contains($src, 'userIsAdmin(');
    foreach ($oldReads as $old) {
        if (str_contains($src, $old)) $clean = false;
    }
    emit('sweep_src_' . $name . '_db_check_only', $clean);
}
