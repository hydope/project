<?php
/**
 * Child-process probe for the DB-backed admin gate (audit A-03, 2026-11-24).
 *
 * Runs in its own PHP process for the same reason visibility-probe.php does:
 * lib/db.php declares its own db() and the parent harness stubs one. This
 * probe loads the REAL lib/db.php against an in-memory db stub, feeds
 * requireAdminUser() tokens whose isAdmin claim is deliberately stale in
 * both directions, and prints one key=json line per observation.
 *
 * The contract under test: admin status comes from users.is_admin in the DB
 * (the roleOf() stale-claim rule), never from the JWT claim alone — a demoted
 * admin's still-valid token must get 403, and a promoted member's stale
 * non-admin claim must pass.
 */
declare(strict_types=1);

/** Minimal statement: hands back whatever rows the test queued, records SQL. */
final class GateStmt
{
    public function execute(array $p = []): bool { return true; }
    public function fetchAll(): array { return $GLOBALS['gate_rows'] ?? []; }
    public function fetch()
    {
        $rows = $GLOBALS['gate_rows'] ?? [];
        return $rows ? $rows[0] : false;
    }
    public function rowCount(): int { return count($GLOBALS['gate_rows'] ?? []); }
}

/** db() stand-in. Nothing in this probe should need a real database. */
function db()
{
    return new class {
        public function prepare(string $sql): GateStmt
        {
            $GLOBALS['gate_sql'][] = $sql;
            return new GateStmt();
        }
        public function query(string $sql): GateStmt
        {
            $GLOBALS['gate_sql'][] = $sql;
            return new GateStmt();
        }
        public function exec(string $sql): bool { return true; }
    };
}

// Stub only what lib/db.php does NOT provide, and only before including it.
// je() carries the status in the message (J:<status>:<msg>) so the probe can
// tell a 403 gate denial from any other failure.
function je(string $msg, int $status = 400): void { throw new RuntimeException('J:' . $status . ':' . $msg); }
function json($data = null, int $status = 200): void { throw new RuntimeException('JSON_CAPTURED'); }
function uuid(): string { return 'gate-uuid'; }
function rateCheck(string $a, string $b, int $c, int $d, string $e): void {}
function cip(): string { return '127.0.0.1'; }
function requireVerifiedEmail(string $uid): void {}
function cleanMessage(string $text): string { return $text; }
/** Token transport + JWT verification stand-ins: the "token" is whatever
 *  claims the scenario queued in $GLOBALS['gate_claims']. */
function hbearer(): ?string { return 'gate-token'; }
function jwtSecret(): string { return str_repeat('g', 40); }
function jwtVerify(string $token, string $secret): array { return $GLOBALS['gate_claims'] ?? []; }

require __DIR__ . '/../lib/db.php';

/** Emit one observation for the parent to assert on. */
function emit(string $key, $value): void
{
    echo $key . '=' . json_encode($value, JSON_UNESCAPED_SLASHES) . "\n";
}

/**
 * Run requireAdminUser() for one scenario.
 * $claims: the JWT payload (stale or not). $dbAdmin: users.is_admin in the
 * "database" — true, false, or null for "no such user row".
 * Returns ['ok' => bool, 'status' => ?int, 'uid' => ?string, 'isAdmin' => ?bool].
 */
function gateRun(array $claims, ?bool $dbAdmin): array
{
    $GLOBALS['gate_claims'] = $claims;
    $GLOBALS['gate_rows'] = $dbAdmin === null ? [] : [['is_admin' => $dbAdmin ? 1 : 0]];
    $GLOBALS['gate_sql'] = [];
    try {
        $user = requireAdminUser();
        return ['ok' => true, 'status' => 200, 'uid' => $user['uid'] ?? null, 'isAdmin' => $user['isAdmin'] ?? null];
    } catch (RuntimeException $e) {
        $status = null;
        if (preg_match('/^J:(\d+):/', $e->getMessage(), $m)) {
            $status = (int)$m[1];
        }
        return ['ok' => false, 'status' => $status, 'uid' => null, 'isAdmin' => null];
    }
}

$adminClaims = ['uid' => 'admin-1', 'email' => 'admin@test.local', 'isAdmin' => true];
$memberClaims = ['uid' => 'member-1', 'email' => 'member@test.local', 'isAdmin' => false];

// The A-03 headline case: token still claims admin, DB says demoted → 403.
$demoted = gateRun($adminClaims, false);
emit('demoted_blocked', $demoted['ok'] === false && $demoted['status'] === 403);

// A current admin (claim and DB agree) passes, identity intact.
$current = gateRun($adminClaims, true);
emit('current_admin_passes', $current['ok'] === true && $current['uid'] === 'admin-1');
emit('current_admin_flag', $current['isAdmin']);

// The gate actually consulted the users table for is_admin.
$sql = implode(' ', $GLOBALS['gate_sql'] ?? []);
emit('gate_queries_is_admin', str_contains($sql, 'is_admin') && str_contains($sql, 'users'));

// Stale in the other direction: promoted after login — claim says member,
// DB says admin → passes (the gate trusts the DB, not the claim).
$promoted = gateRun($memberClaims, true);
emit('promoted_member_passes', $promoted['ok'] === true && $promoted['uid'] === 'member-1');

// Ordinary member: claim and DB agree → 403.
$member = gateRun($memberClaims, false);
emit('plain_member_blocked', $member['ok'] === false && $member['status'] === 403);

// Token for a user whose row no longer exists → 403, never a pass.
$ghost = gateRun($adminClaims, null);
emit('missing_row_blocked', $ghost['ok'] === false && $ghost['status'] === 403);
