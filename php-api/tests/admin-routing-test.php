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
            'verification_status' => 'unverified', 'verification_note' => null,
            'is_admin' => 0, 'email_verified' => 0,
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

// The message count in that bundle shipped as `messages.receiver_id`. The table
// is normalised (conversation_id + sender_id) and has no such column, so the
// whole endpoint 500'd and blanked the drawer. Assert it joins through
// conversations instead.
route('GET /user/:id counts messages via conversations', 'GET', ['user', 'abc'], 'JOIN conversations c ON c.id = m.conversation_id');
route('GET /wali reads wali_links', 'GET', ['wali'], 'FROM wali_links');
route('GET /analytics reads the time series', 'GET', ['analytics'], 'FROM users');

// Manual account verification: the queue a moderator works through.
route('GET /verification-queue lists accounts awaiting review', 'GET', ['verification-queue'], 'WHERE u.is_admin = 0 AND u.verification_status = ?');
route('GET /verification-queue?status=all is allowed', 'GET', ['verification-queue'], 'u.verification_status');

// Writes. The queue route must be matched before the :id branch reads
// 'bulk' as a user id.
route(
    'POST /users/:id/verify updates the account',
    'POST',
    ['users', 'u1', 'verify'],
    'UPDATE users',
    ['decision' => 'approve', 'note' => 'checked']
);
route(
    'POST /verify/bulk resolves to the bulk handler',
    'POST',
    ['verify', 'bulk'],
    'SELECT id FROM users WHERE id IN (?,?)',
    ['ids' => ['a', 'b'], 'decision' => 'approve']
);

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

// A call to a helper that does not exist is a FATAL at runtime, not a lint
// error: `requireAdmin()` shipped in contact.php while the lib defines
// requireAdminUser(), so the entire admin support inbox 500'd while `php -l`
// stayed silent. Check every internal call resolves to something defined.
echo "\nundefined-function guard\n";

/** Collect every `function name(` defined across the API. */
function definedFunctionNames(string $dir): array
{
    $names = [];
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir));
    foreach ($it as $file) {
        if ($file->getExtension() !== 'php') continue;
        $src = (string)file_get_contents($file->getPathname());
        if (preg_match_all('/^\s*function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/mi', $src, $m)) {
            foreach ($m[1] as $n) $names[strtolower($n)] = true;
        }
    }
    return $names;
}

$defined = definedFunctionNames(__DIR__ . '/..');

// PHP built-ins plus anything the runtime provides; only flag names that look
// like this project's own helpers but resolve to nothing.
$builtins = get_defined_functions()['internal'];
$internal = [];
foreach ($builtins as $b) $internal[strtolower($b)] = true;

// Calls that are method calls, `new X`, or language constructs.
$ignore = [
    'if','for','foreach','while','switch','array','list','isset','unset','empty',
    'echo','print','return','function','fn','match','catch','use','exit','die',
    'and','or','new','static','self','parent','str_replace','sprintf','count',
    'in_array','array_map','array_filter','json_encode','json_decode','trim',
];

$missing = [];
foreach (glob(__DIR__ . '/../routes/*.php') as $routeFile) {
    // Use the real tokenizer: a regex over raw source also matches SQL inside
    // string literals and words inside comments, which is pure noise.
    $tokens = token_get_all((string)file_get_contents($routeFile));
    $count = count($tokens);
    for ($i = 0; $i < $count; $i++) {
        $t = $tokens[$i];
        if (!is_array($t) || $t[0] !== T_STRING) continue;

        // Must be a call: next meaningful token is '('.
        $j = $i + 1;
        while ($j < $count && is_array($tokens[$j])
            && in_array($tokens[$j][0], [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true)) {
            $j++;
        }
        if ($j >= $count || $tokens[$j] !== '(') continue;

        // Skip declarations and object/static access.
        $k = $i - 1;
        while ($k >= 0 && is_array($tokens[$k])
            && in_array($tokens[$k][0], [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true)) {
            $k--;
        }
        if ($k >= 0 && is_array($tokens[$k])
            && in_array($tokens[$k][0], [T_FUNCTION, T_NEW, T_OBJECT_OPERATOR, T_DOUBLE_COLON, T_CLASS], true)) {
            continue;
        }

        $name = strtolower($t[1]);
        if (isset($internal[$name]) || isset($defined[$name])) continue;
        $missing[] = basename($routeFile) . ': ' . $t[1] . '()';
    }
}
$missing = array_values(array_unique($missing));
check(
    'no route calls an undefined function',
    $missing === [],
    implode(', ', $missing)
);

// ── Schema conformance ──────────────────────────────────────────────────────
// adminUserDetail shipped querying messages.receiver_id and adminWaliLinks
// shipped querying wali_links.id / revoked_at. None of those columns exist:
// messages is normalised, and wali_links uses `token` as its PK with a `revoked`
// flag. Both endpoints failed at runtime while php -l stayed silent.
//
// A migration that invents a shape disagreeing with db/schema.sql is how the
// Guardians screen ended up permanently unavailable, so assert they agree.
echo "\nschema conformance\n";

$schema = (string)file_get_contents(__DIR__ . '/../db/schema.sql');

/** Parse `CREATE TABLE x (...)` into a lowercase column list. */
function schemaColumns(string $sql): array
{
    $out = [];
    if (!preg_match_all('/CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\((.*?)\)\s*ENGINE/is', $sql, $m, PREG_SET_ORDER)) {
        return $out;
    }
    foreach ($m as $set) {
        $cols = [];
        // Strip comment lines first. schema.sql documents some columns with a
        // leading `--` block, and without this a commented column is invisible
        // to the checker — which would make the check pass on a real mismatch.
        $inner = implode("\n", array_filter(
            explode("\n", $set[2]),
            fn($l) => !preg_match('/^\s*--/', $l)
        ));
        foreach (preg_split('/,\s*\n/', $inner) as $line) {
            $line = trim($line);
            if ($line === '' || preg_match('/^(PRIMARY|UNIQUE|KEY|INDEX|CONSTRAINT|FOREIGN)/i', $line)) continue;
            if (preg_match('/^(\w+)\s+/', $line, $c)) $cols[] = strtolower($c[1]);
        }
        $out[strtolower($set[1])] = $cols;
    }
    return $out;
}

$canonical = schemaColumns($schema);

$migrateSrc = (string)file_get_contents(__DIR__ . '/../lib/migrate.php');
preg_match_all('/CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\((.*?)\)\s*ENGINE/is', $migrateSrc, $mm, PREG_SET_ORDER);
$mismatch = [];
foreach ($mm as $set) {
    $table = strtolower($set[1]);
    if (!isset($canonical[$table])) {
        $mismatch[] = "$table created by migration but absent from schema.sql";
        continue;
    }
    $mine = schemaColumns('CREATE TABLE IF NOT EXISTS ' . $set[1] . " (\n" . $set[2] . "\n) ENGINE=InnoDB;");
    foreach ($mine[$table] ?? [] as $col) {
        if (!in_array($col, $canonical[$table], true)) {
            $mismatch[] = "$table.$col created by migration but not in schema.sql";
        }
    }
}
check('migration tables match schema.sql', $mismatch === [], implode('; ', $mismatch));

$waliExpected = ['token', 'user_id', 'revoked', 'created_at'];
$missingWali = array_values(array_diff($waliExpected, $canonical['wali_links'] ?? []));
check(
    'schema.sql wali_links has token/user_id/revoked/created_at',
    $missingWali === [],
    'missing: ' . implode(',', $missingWali)
);

// messages is normalised; a receiver_id reference must never come back. Strip
// comments first — the explanation of why this matters necessarily names the
// column, and matching that would make the check fail on its own rationale.
$adminSrc = (string)file_get_contents(__DIR__ . '/../routes/admin.php');
$adminSqlOnly = preg_replace('!/\*.*?\*/!s', '', $adminSrc);
$adminSqlOnly = preg_replace('!//[^\n]*!', '', (string)$adminSqlOnly);
check(
    'no route queries the non-existent messages.receiver_id',
    stripos((string)$adminSqlOnly, 'receiver_id') === false,
    'a live query still references messages.receiver_id'
);

// ── AI credential containment ───────────────────────────────────────────────
// The NVIDIA key must exist only in php-api/.env. If it ever lands in a route,
// a lib file, or anything under src/ (which is bundled to the browser), anyone
// reading the page or the repo can spend the account.
echo "\nAI credential containment\n";

$keyish = '/nvapi-[A-Za-z0-9_-]{20,}/';
$scanned = 0;
$leaks = [];
foreach (['/routes', '/lib', '/db'] as $sub) {
    foreach (glob(__DIR__ . '/..' . $sub . '/*.{php,sql}', GLOB_BRACE) as $f) {
        $scanned++;
        if (preg_match($keyish, (string)file_get_contents($f))) $leaks[] = basename($f);
    }
}
check('no PHP/SQL file contains an NVIDIA key', $leaks === [], implode(', ', $leaks));

// src/ is compiled into the public bundle — nothing there may look like a key
// or an Authorization header. Walk it with a PHP iterator: `find` does not
// exist on Windows, and a silently-empty scan would pass vacuously.
$srcDir = dirname(__DIR__, 2) . '/src';
$srcLeaks = [];
$srcCount = 0;
if (is_dir($srcDir)) {
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($srcDir));
    foreach ($it as $file) {
        if (!$file->isFile() || !preg_match('/\.(js|jsx|ts|tsx|json)$/', $file->getFilename())) continue;
        $srcCount++;
        $body = (string)file_get_contents($file->getPathname());
        if (preg_match($keyish, $body)) $srcLeaks[] = $file->getFilename() . ' (key)';
        if (preg_match('/Authorization\s*:\s*Bearer\s+[A-Za-z0-9_-]{16,}/i', $body)) {
            $srcLeaks[] = $file->getFilename() . ' (bearer header)';
        }
    }
}
check('client bundle was actually scanned', $srcCount > 20, "only scanned $srcCount files");
check('no client bundle contains an NVIDIA key', $srcLeaks === [], implode(', ', $srcLeaks));

// The credential may only ever be read to build a boolean or to fill an
// Authorization header — never placed inside a json() payload. The status
// endpoint legitimately calls getenv() to compare against '', so a naive
// "does this file mention the env var" check would false-positive on the one
// place it is used safely.
$aiRoute = (string)file_get_contents(__DIR__ . '/../routes/ai.php');
$badUse = [];
foreach (explode("\n", $aiRoute) as $n => $line) {
    if (!str_contains($line, 'NVIDIA_API_KEY')) continue;
    $safe = str_contains($line, "!== ''")          // boolean for the status endpoint
        || str_contains($line, '$key =');          // assignment for the auth header
    if (!$safe) $badUse[] = 'L' . ($n + 1) . ': ' . trim($line);
}
check(
    'NVIDIA_API_KEY is only read for a boolean or an auth header',
    $badUse === [],
    implode(' | ', $badUse)
);

// And the parsed $key must never reach a response body.
check(
    'AI routes never json() the parsed $key',
    !preg_match('/json\(\s*\[.*\$key/s', $aiRoute),
    'a json() payload may be leaking the credential'
);

echo "\n$pass passed, $fail failed\n";
exit($fail === 0 ? 0 : 1);