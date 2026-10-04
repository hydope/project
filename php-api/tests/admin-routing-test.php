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
$GLOBALS['fake_responses'] = [];
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
/** Rate limiting is not what this suite is testing; skip it. */
function rateCheck(string $bucket, string $key, int $max, int $windowSec, string $message): void {}
function cip(): string { return '127.0.0.1'; }

/**
 * Identity for the caller.
 *
 * Returns the admin identity by default so the admin dispatcher suite works
 * unchanged. The profile/message suite sets $GLOBALS['auth_uid'] to the member
 * under test; when it is explicitly null the caller is anonymous and we return
 * null, which is the branch every privacy gate in profiles.php sits behind.
 */
function requireAuthUser(): ?array
{
    if (array_key_exists('auth_uid', $GLOBALS)) {
        return $GLOBALS['auth_uid'] === null
            ? null
            : ['uid' => (string)$GLOBALS['auth_uid'], 'email' => 'member@test.local', 'isAdmin' => false];
    }
    return ['uid' => 'admin-1', 'email' => 'admin@test.local', 'isAdmin' => true];
}
/** Some routes call the nullable form directly. */
function requireUser(): ?array { return requireAuthUser(); }

/** Nullable viewer: null for an anonymous request, else the identity array. */
function currentUser(): ?array
{
    if (array_key_exists('auth_uid', $GLOBALS)) {
        return $GLOBALS['auth_uid'] === null
            ? null
            : ['uid' => (string)$GLOBALS['auth_uid'], 'email' => 'member@test.local', 'isAdmin' => false];
    }
    return ['uid' => 'admin-1', 'email' => 'admin@test.local', 'isAdmin' => true];
}
function requireVerifiedEmail(string $uid): void {}
function cleanMessage(string $text): string { return substr(trim(strip_tags($text)), 0, 4000); }

/** Minimal PDO stand-in: records SQL, returns empty result sets. */
final class StubStmt
{
    public function __construct(private string $sql) {}
    public function execute(array $p = []): bool
    {
        $GLOBALS['sql_seen'][] = $this->sql;
        return true;
    }
    public function fetchAll(): array { return $GLOBALS['fake_responses'] ?? []; }
    /** Full row so handlers that read columns do not emit warnings. */
    public function fetch(): array
    {
        // A test that queued rows gets those; otherwise the generic stand-in row.
        if (!empty($GLOBALS['fake_responses'])) {
            return (array)$GLOBALS['fake_responses'][0];
        }
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
/**
 * Per-test SQL response table. StubStmt serves these rows instead of its default
 * one, so a test can stand up a specific interest or profile state.
 */
function fakeResponses(array $rows): void { $GLOBALS['fake_responses'] = $rows; }
function db(): StubDb { return new StubDb(); }

require_once __DIR__ . '/../routes/admin.php';
require_once __DIR__ . '/../lib/ai.php';
require_once __DIR__ . '/../routes/ai.php';

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

/**
 * True when this call sits inside a function_exists(...) probe.
 *
 * `function_exists` is a single T_STRING, not T_FUNCTION followed by T_STRING:
 * the lexer matches the longest identifier, so looking for the function keyword
 * here silently never matches.
 */
function guardedByFunctionExists(array $tokens, int $index): bool
{
    for ($j = $index; $j-- > 0;) {
        if (!is_array($tokens[$j])) continue;
        if ($tokens[$j][0] === T_STRING
            && strtolower((string)$tokens[$j][1]) === 'function_exists') {
            return true;
        }
        // Stop at the statement boundary — do not scan back into another call.
        if ($tokens[$j] === ';') return false;
    }
    return false;
}

$missing = [];
// Scan BOTH routes/ and lib/. Scanning only routes/ missed that ai.php calls
// curl_init(), which is fatal on a host without the cURL extension — a guard
// that only looks in half the codebase is worse than none, because it reads as
// coverage.
foreach (['/routes', '/lib'] as $sub) {
foreach (glob(__DIR__ . '/..' . $sub . '/*.php') as $routeFile) {
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

        // A call wrapped in function_exists() is a deliberate capability probe,
        // not a missing dependency (bootstrap does this for getallheaders, which
        // is absent under some SAPIs).
        if (guardedByFunctionExists($tokens, $i)) continue;

        $missing[] = basename($routeFile) . ': ' . $t[1] . '()';
    }
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

// ── AI chat path ─────────────────────────────────────────────────────────────
// The dispatcher test proved routeAI() *routes*, which is not the same as the
// handler working: POST /api/ai/chat shipped returning 500 on production while
// every routing assertion passed. Exercise the handler itself.
echo "\nAI chat handler\n";

function exerciseAiChat(string $question, array $context = []): array
{
    $GLOBALS['json_out'] = null;
    $GLOBALS['request_body'] = ['question' => $question, 'context' => $context];
    $GLOBALS['sql_seen'] = [];
    try {
        routeAI('POST', ['chat']);
    } catch (Throwable $e) {
        if ($e->getMessage() === 'JSON_CAPTURED') {
            return $GLOBALS['json_out'] ?? ['status' => 0, 'data' => null];
        }
        return ['status' => -1, 'data' => ['threw' => $e->getMessage()], 'trace' => array_map(
            static fn($t) => str_replace(dirname(__DIR__, 2) . DIRECTORY_SEPARATOR, '', $t['file'] ?? '?') . ':' . ($t['line'] ?? '?') . ' ' . ($t['function'] ?? ''),
            $e->getTrace()
        )];
    }
    return ['status' => 0, 'data' => null];
}

// $context with signedIn set is the shape that produced the production 500:
// $ctx becomes non-empty, so the buggy implode(', ') branch actually ran. A
// guest never hit it, which is exactly why browser testing of the logged-out
// view would never have caught it.
$res = exerciseAiChat('can my wali see my messages?', ['signedIn' => true, 'verified' => true]);
check(
    'AI chat returns 200 for a platform question',
    ($res['status'] ?? 0) === 200,
    'got ' . var_export($res, true)
);
$answer = (string)($res['data']['answer'] ?? '');
check(
    'AI chat answers about wali specifically, not generically',
    $answer !== '' && stripos($answer, 'wali') !== false,
    'answer did not mention wali: ' . substr($answer, 0, 120)
);
check(
    'AI chat always reports its source',
    in_array($res['data']['source'] ?? '', ['model', 'facts', 'guardrail'], true),
    'source was ' . var_export($res['data']['source'] ?? null, true)
);

// A guardrail hit must short-circuit before any retrieval or model call.
$res2 = exerciseAiChat('send me a nude photo');
check(
    'AI chat refuses a blocked request',
    ($res2['data']['source'] ?? '') === 'guardrail',
    'source was ' . var_export($res2['data']['source'] ?? null, true)
);

// An off-topic question must not be answered from the knowledge base. This is
// the exact failure the old regex assistant had: it returned the privacy blob
// for anything it did not recognise.
$res3 = exerciseAiChat('what is the capital of Peru?');
$offTopic = (string)($res3['data']['answer'] ?? '');
check(
    'AI chat does not answer off-topic questions from platform facts',
    stripos($offTopic, 'support@shiarishta.com') !== false,
    'off-topic answer did not defer: ' . substr($offTopic, 0, 120)
);

// Retrieval precision. A scorer that counts stopwords answers "what is the
// capital of Peru?" with first-message tips — a confident wrong answer, which is
// worse than the old blanket fallback because it reads as authoritative.
echo "\nAI retrieval precision\n";

check(
    'an off-topic question retrieves nothing',
    aiRetrieveFacts('what is the capital of Peru?') === [],
    'off-topic question matched: ' . implode(' / ', array_column(aiRetrieveFacts('what is the capital of Peru?'), 'text'))
);
check(
    'a stopword-only overlap does not match',
    aiRetrieveFacts('what is it like') === [],
    'matched on stopwords alone'
);
check(
    'a real question retrieves the right topic',
    count(aiRetrieveFacts('can my wali see my messages')) > 0
        && stripos(aiRetrieveFacts('can my wali see my messages')[0]['text'], 'wali') !== false,
    'wali question did not retrieve the wali fact'
);
check(
    'a pricing question retrieves pricing, not privacy',
    stripos(aiRetrieveFacts('is this site paid')[0]['text'] ?? '', 'free') !== false,
    'pricing question retrieved the wrong fact'
);
check(
    'a safety question retrieves the safety fact',
    stripos(aiRetrieveFacts('I think someone is scamming me')[0]['text'] ?? '', 'report') !== false,
    'safety question retrieved the wrong fact'
);

echo "\n$pass passed, $fail failed\n";

// ── Public profile visibility ────────────────────────────────────────────────
// The regression that motivated this: profiles were readable only when signed in,
// so a signed-out visitor got an empty grid. These lock the NEW contract in
// place — anonymous callers see real profile content and public photos, and only
// `private` is withheld — so it cannot silently regress the other way.
//
// visibleProfile() and mutualInterest() live in lib/db.php, which cannot be
// included here: it declares its own db() and this harness already stubs one.
// So the real files are exercised in a child process that supplies its own db()
// stub. Out-of-process also proves they work standalone, not just with this
// file's globals in scope.
echo "\npublic profile visibility\n";

/**
 * Run visibility-probe.php in a child process and return its key=value lines.
 *
 * The probe runs IN PLACE: copying it to a temp path would break its relative
 * `require __DIR__ . '/../lib/db.php'`, and a probe that cannot boot reports
 * nothing at all — silently turning every assertion below into a vacuous pass.
 * Raw output is returned too so a boot failure surfaces as a readable error.
 */
function visibilityProbe(string $file): array
{
    $out = [];
    exec(escapeshellcmd(PHP_BINARY) . ' ' . escapeshellarg($file) . ' 2>&1', $out);
    $parsed = [];
    foreach ($out as $line) {
        $line = trim($line);
        if (!str_contains($line, '=')) continue;
        [$k, $v] = explode('=', $line, 2);
        $parsed[$k] = json_decode($v, true);
    }
    $parsed['__raw'] = implode("\n", array_slice($out, 0, 6));
    return $parsed;
}

$probeFile = __DIR__ . '/visibility-probe.php';
$probe = visibilityProbe($probeFile);

// A probe that failed to boot reports nothing; fail loudly rather than passing
// vacuously on an empty array.
check(
    'the visibility probe ran',
    ($probe['anon_is_array'] ?? null) !== null,
    'probe produced no output: ' . substr((string)($probe['__raw'] ?? 'none'), 0, 200)
);

check('an anonymous visitor gets a profile at all', ($probe['anon_is_array'] ?? false) === true);
check('an anonymous visitor sees the bio', ($probe['anon_bio'] ?? null) !== null, 'bio withheld');
check(
    'an anonymous visitor sees expectations',
    ($probe['anon_expectations'] ?? null) !== null,
    'expectations withheld'
);
check(
    'an anonymous visitor sees family background',
    ($probe['anon_family'] ?? null) !== null,
    'family background withheld'
);
check(
    'a public photo is served to an anonymous visitor',
    ($probe['anon_photo'] ?? null) !== null && ($probe['anon_locked'] ?? true) === false,
    'public photo withheld or marked locked'
);
check(
    'no contact details leak in the anonymous payload',
    ($probe['anon_leaks_contact'] ?? true) === false,
    'the payload exposed contact fields'
);
// array_key_exists, not `??`: json_decode('null') yields PHP null, and `null ?? 'x'`
// falls back to 'x', so a correctly-withheld photo would read as "served".
$afterPhotoWithheld = array_key_exists('after_tier_photo', $probe)
    && $probe['after_tier_photo'] === null;
check(
    'after-interest photos stay hidden from anonymous visitors',
    ($probe['after_tier_locked'] ?? false) === true && $afterPhotoWithheld,
    'an after-interest photo was served to a signed-out visitor'
);
check(
    'a private profile is hidden from anonymous visitors',
    ($probe['private_hidden_anon'] ?? false) === true,
    'a private profile leaked to a signed-out visitor'
);
check(
    'a private profile is hidden from other members',
    ($probe['private_hidden_member'] ?? false) === true,
    'a private profile leaked to another member'
);
check(
    'an owner still sees their own private profile',
    ($probe['owner_sees_private'] ?? false) === true,
    'the owner lost access to their own profile'
);
check(
    'a signed-in viewer sees an after-interest photo',
    ($probe['authed_photo'] ?? null) !== null,
    'after-interest photo withheld from a signed-in viewer'
);
check(
    'a signed-in viewer sees a members-tier bio',
    ($probe['authed_bio'] ?? null) !== null,
    'members-tier bio withheld from a signed-in viewer'
);

// "Matched" had three separate implementations; one helper now defines it.
check('a one-sided interest is not a match', ($probe['one_sided_is_match'] ?? true) === false);
check('two mutual interests are a match', ($probe['two_way_is_match'] ?? false) === true);

// ── Favourites ──────────────────────────────────────────────────────────────
// Favourites are session-scoped and must never expose anyone else's list.
check(
    'schema.sql declares a favourites table',
    isset($canonical['favourites']) && in_array('profile_id', $canonical['favourites'], true),
    'the favourites table is missing from schema.sql'
);

// ── Sample profiles ──────────────────────────────────────────────────────────
// The seeder writes fully-written example profiles. They are legitimate content
// — they show what a complete profile looks like — but they are not people. The
// is_demo flag has to reach the client so the UI can label them and refuse
// contact. This is the load-bearing guarantee behind seeding anything at all.
check(
    'a sample profile is flagged as a sample for anonymous visitors',
    ($probe['demo_flag_anon'] ?? null) === true,
    'a sample profile reached a signed-out visitor without its isDemo flag'
);
check(
    'a sample profile is flagged as a sample for signed-in members',
    ($probe['demo_flag_authed'] ?? null) === true,
    'a sample profile reached a member without its isDemo flag'
);
check(
    'a real member is never flagged as a sample',
    ($probe['real_flag_false'] ?? true) === false,
    'a real member was mislabelled as a sample profile'
);
check(
    'a database without the is_demo column defaults to a real member',
    ($probe['real_flag_missing_column'] ?? null) === false,
    'a missing is_demo column did not default to false — every profile would badge as a sample'
);
check(
    'schema.sql declares the is_demo column',
    isset($canonical['profiles']) && in_array('is_demo', $canonical['profiles'], true),
    'profiles.is_demo is missing from schema.sql, so a fresh install cannot label samples'
);

// ── Admin-configurable AI credential ─────────────────────────────────────────
// This is the only place a credential can be set at runtime, so two properties
// matter more than anything else here: the schema supports it, and the API can
// never read a stored value back out.
check(
    'schema.sql declares an app_settings table',
    isset($canonical['app_settings']) && in_array('value_enc', $canonical['app_settings'], true),
    'the app_settings table is missing from schema.sql, so the AI key cannot be configured from the admin panel'
);

// Structural guard: no route may ever hand a stored secret to the browser.
//
// Two things are checked, and the distinction matters. `value_enc` MAY appear in
// this function, but only as a null/non-null presence test ('modelOverridden' =>
// ($row['value_enc'] ?? null) !== null) — never echoed as a value. A bare
// 'apiKey' => in the payload would be a real leak.
$adminSrc = (string)file_get_contents(__DIR__ . '/../routes/admin.php');
$statusStart = strpos($adminSrc, 'function adminAiSettingsStatus');
$statusFn = $statusStart === false ? '' : substr($adminSrc, $statusStart, (int)strpos(substr($adminSrc, $statusStart), "\n}") + 2);
check(
    'the AI status endpoint never returns a raw credential',
    $statusFn !== '' && stripos($statusFn, "'apiKey'") === false && stripos($statusFn, "'value' =>") === false,
    'adminAiSettingsStatus() appears to return a raw credential — an admin session can read it back'
);

// Every `value_enc` mention in that function must sit inside a `?? null`
// null-coalesce, i.e. be a presence test rather than an emitted value.
check(
    'stored values are only ever tested for presence, never emitted',
    preg_match('/value_enc[^\n]*\?\?\s*null/', $statusFn) === 1,
    'app_settings.value_enc is referenced in the status response without a null-guard — verify it is not emitted'
);

// The masking helper exists and never emits the body of a key.
check('aiMaskKey() is defined for credential display', strpos($adminSrc, 'function aiMaskKey') !== false);
check(
    'the mask helper returns a prefix and last-4 only',
    strpos($adminSrc, "substr(\$key, -4)") !== false && strpos($adminSrc, "substr(\$key, 0, 5)") !== false,
    'aiMaskKey() does not limit the tail — a full key could reach the browser'
);

// lib/ai.php must resolve the credential through the DB-backed helper, not a raw
// getenv — otherwise a key pasted into the panel would be ignored.
$aiSrc = (string)file_get_contents(__DIR__ . '/../lib/ai.php');
check(
    'the AI client resolves the key through aiApiKey()',
    strpos($aiSrc, '$key = aiApiKey();') !== false,
    'aiComplete() still reads getenv() directly, so a panel-configured key would never be used'
);
check(
    'the public AI status reflects a panel-configured key',
    strpos((string)file_get_contents(__DIR__ . '/../routes/ai.php'), "aiApiKey() !== ''") !== false,
    '/api/ai/status still reads only the env var, so the admin panel will look broken after a successful save'
);

// ── Route ordering: /me/favourites must win over /me ────────────────────────
// This regressed once and shipped. `GET /api/profiles/me` only inspects the
// FIRST path segment, so it matched `/me/favourites` and returned the caller's
// own profile. The favourites page therefore rendered the account holder as a
// saved result, and the list endpoint was unreachable.
//
// Ordering bugs are invisible to a lint pass and to any test that only checks
// the handler in isolation, so this asserts the actual source order.
$profilesSrc = (string)file_get_contents(__DIR__ . '/../routes/profiles.php');
$favPos = strpos($profilesSrc, "\$id === 'me' && \$sub === 'favourites'");
$mePos = strpos($profilesSrc, "\$id === 'me') { profileMe()");
check(
    'the favourites route is matched before the bare /me route',
    $favPos !== false && $mePos !== false && $favPos < $mePos,
    'GET /api/profiles/me swallows /me/favourites, so the saved list is unreachable'
);

// The saved-profiles list must flag each row as saved. ProfileCard seeds its
// bookmark from `favourited === true`, so a row without it renders as unsaved
// and tapping the bookmark on /favorites removes the save instead of showing it.
// Both endpoints that return profile cards are checked.
check(
    'the favourites list marks every row as favourited',
    strpos($profilesSrc, "\$view['favourited'] = true;") !== false,
    'favouritesList() never sets favourited, so saved cards render as unsaved'
);
check(
    'the browse list derives a per-profile favourited flag',
    strpos($profilesSrc, "\$view['favourited'] = isset(\$favIds") !== false,
    'profilesList() does not report favourite state per card'
);
// The N+1 was one round-trip per saved profile, on the page that grows with the
// member's own engagement. Scope the search to the function body: the same
// SELECT legitimately appears in profileMe(), and an unscoped check matches it
// there and reports a failure that does not exist.
$favFnStart = (int)strpos($profilesSrc, 'function favouritesList');
$favFnEnd = (int)strpos($profilesSrc, "\nfunction ", $favFnStart + 10);
$favFnBody = $favFnEnd > $favFnStart
    ? substr($profilesSrc, $favFnStart, $favFnEnd - $favFnStart)
    : '';
check(
    'favouritesList does not re-query each profile individually',
    $favFnBody !== '' && strpos($favFnBody, 'SELECT * FROM profiles WHERE user_id = ? LIMIT 1') === false,
    'favouritesList still runs a per-row profile lookup (N+1)'
);

echo "\n$pass passed, $fail failed\n";
exit($fail === 0 ? 0 : 1);