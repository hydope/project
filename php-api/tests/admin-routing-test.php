<?php
/**
 * Offline dispatcher test for php-api/routes/admin.php.
 *
 * The production check cannot confirm routing: routeAdmin() calls
 * requireAuthUser() on its very first line, so EVERY admin path answers 401
 * anonymously, including paths that do not exist. Verifying the new
 * POST /verifications/bulk contract against production therefore proves
 * nothing on its own.
 *
 * This harness stubs the lib helpers, includes the real route file, and records
 * which handler actually runs for a given method + segment list.
 *
 * Run: php php-api/tests/admin-routing-test.php
 */
declare(strict_types=1);

$GLOBALS['handler_hits'] = [];
$GLOBALS['sql_seen'] = [];
$GLOBALS['json_out'] = null;

function requireAuthUser(): array
{
    return ['uid' => 'admin-1', 'email' => 'admin@test.local', 'isAdmin' => true];
}
function currentUser(): array
{
    return ['uid' => 'admin-1', 'email' => 'admin@test.local', 'isAdmin' => true];
}
function uuid(): string
{
    return 'stub-uuid';
}
function je(string $msg, int $status = 400): void
{
    throw new RuntimeException('J:' . $status . ':' . $msg);
}
/** Capture the response instead of emitting it. */
function json($data = null, int $status = 200): void
{
    $GLOBALS['json_out'] = ['status' => $status, 'data' => $data];
    throw new RuntimeException('JSON_CAPTURED');
}
/**
 * Body accessor used by every POST handler. php://input is unreadable twice in
 * a CLI process, so tests seed $GLOBALS['request_body'] instead.
 */
function requestJson(): array
{
    if (isset($GLOBALS['request_body'])) {
        return (array)$GLOBALS['request_body'];
    }
    $decoded = json_decode((string)file_get_contents('php://input'), true);
    return is_array($decoded) ? $decoded : [];
}
/** Free-text cleaner from the lib; identity here is fine for routing tests. */
function sanitizeText($value, int $max = 255): string
{
    return substr(trim(strip_tags((string)$value)), 0, $max);
}

/** Minimal PDO stand-in: records SQL, returns empty result sets. */
final class StubStmt
{
    public function __construct(private string $sql) {}
    public function execute(array $p = []): bool
    {
        $GLOBALS['sql_seen'][] = $this->sql;
        return true;
    }
    public function fetchAll(): array { return []; }
    /** Full row so handlers that read columns do not emit warnings. */
    public function fetch(): array
    {
        return [
            'n' => 0, 'id' => 'row-1', 'email' => 'member@test.local',
            'user_id' => 'user-1', 'role' => 'member', 'display_name' => 'Member',
            'target_type' => 'profile', 'target_id' => 'row-1', 'storage_path' => null,
        ];
    }
    public function rowCount(): int { return 0; }
    public function bindParam($a, $b): bool { return true; }
}

final class StubDb
{
    public function query(string $sql): StubStmt
    {
        $GLOBALS['sql_seen'][] = $sql;
        return new StubStmt($sql);
    }
    public function prepare(string $sql): StubStmt
    {
        $GLOBALS['sql_seen'][] = $sql;
        return new StubStmt($sql);
    }
}
function db(): StubDb { return new StubDb(); }

require_once __DIR__ . '/../routes/admin.php';

$pass = 0;
$fail = 0;

function check(string $name, bool $ok, string $detail = ''): void
{
    global $pass, $fail;
    if ($ok) { $pass++; echo "  PASS  $name\n"; }
    else { $fail++; echo "  FAIL  $name" . ($detail ? " -- $detail" : '') . "\n"; }
}

/** Invoke routeAdmin and report whether $expectSql appeared in the SQL it ran. */
function route(string $label, string $method, array $segments, string $expectSqlFragment, array $body = []): void
{
    $GLOBALS['sql_seen'] = [];
    $GLOBALS['json_out'] = null;
    $GLOBALS['request_body'] = $body;
    try {
        routeAdmin($method, $segments);
    } catch (Throwable $e) {
        if ($e->getMessage() !== 'JSON_CAPTURED') {
            check($label, false, 'threw: ' . substr($e->getMessage(), 0, 90));
            return;
        }
    }
    $all = implode(' || ', $GLOBALS['sql_seen']);
    check(
        $label,
        stripos($all, $expectSqlFragment) !== false,
        'ran [' . substr($all, 0, 110) . ']'
    );
}

echo "admin route dispatcher\n";

// THE REGRESSION: '/verifications/bulk' must hit the bulk handler, not the
// /:id branch that would read 'bulk' as a verification id.
route(
    'POST /verifications/bulk resolves to the bulk handler',
    'POST',
    ['verifications', 'bulk'],
    'SELECT id, user_id FROM verifications WHERE id IN (?,?)',
    ['ids' => ['v1', 'v2'], 'verb' => 'approve']
);

// The legacy /:id/bulk spelling must keep working.
route(
    'POST /verifications/:id/bulk still resolves to the bulk handler',
    'POST',
    ['verifications', 'abc', 'bulk'],
    'SELECT id, user_id FROM verifications WHERE id IN (?,?)',
    ['ids' => ['v1', 'v2'], 'verb' => 'approve']
);

// A bulk call must be rejected when the caller asks for an unknown verb,
// rather than silently falling through to an approve.
$GLOBALS['sql_seen'] = [];
$GLOBALS['json_out'] = null;
$GLOBALS['request_body'] = ['ids' => ['v1'], 'verb' => 'delete-everything'];
$rejected = false;
try {
    routeAdmin('POST', ['verifications', 'bulk']);
} catch (Throwable $e) {
    $rejected = str_starts_with($e->getMessage(), 'J:');
}
$wrote = false;
foreach ($GLOBALS['sql_seen'] as $s) {
    if (stripos($s, 'UPDATE verifications') !== false) { $wrote = true; }
}
check('POST /verifications/bulk rejects an unknown verb', $rejected && !$wrote);

// Single-item review must NOT be swallowed by the bulk branch.
route(
    'POST /verifications/:id/approve probes the single verification',
    'POST',
    ['verifications', 'abc', 'approve'],
    'SELECT user_id FROM verifications WHERE id = ? AND status = \'pending\''
);

// Read routes used by the new UI.
route('GET /queue returns the merged worklist', 'GET', ['queue'], 'FROM reports r');
route('GET /funnel counts registered', 'GET', ['funnel'], 'FROM users');
route('GET /audit reads admin_audit', 'GET', ['audit'], 'FROM admin_audit');
route('GET /users lists members', 'GET', ['users'], 'FROM users');
route('GET /user/:id loads the detail bundle', 'GET', ['user', 'abc'], 'FROM reports');
route('GET /wali reads wali_links', 'GET', ['wali'], 'FROM wali_links');
route('GET /analytics reads the time series', 'GET', ['analytics'], 'FROM users');

// Report actions the queue UI calls. Note /action probes with a SELECT first,
// while /dismiss goes straight to the UPDATE -- assert what each really runs.
route('POST /reports/:id/action probes before writing', 'POST', ['reports', 'abc', 'action'], 'FROM reports WHERE id = ?');
route('POST /reports/:id/dismiss writes dismissed', 'POST', ['reports', 'abc', 'dismiss'], "SET status = 'dismissed'");
route('POST /users/:id/unblock', 'POST', ['users', 'abc', 'unblock'], 'FROM users');

// A genuinely unknown action must still 404 rather than silently passing.
$GLOBALS['sql_seen'] = [];
$GLOBALS['json_out'] = null;
$status = null;
try {
    routeAdmin('GET', ['definitelynotarealroute']);
} catch (Throwable $e) {
    $status = $GLOBALS['json_out']['status'] ?? null;
}
check('unknown action still returns 404', $status === 404, 'got ' . var_export($status, true));

echo "\n$pass passed, $fail failed\n";
exit($fail === 0 ? 0 : 1);