<?php
/**
 * Offline probe for the article parser.
 *
 * parseGeneratedPost() must cope with JSON the token ceiling cut short. That is
 * the normal outcome on shared hosting, not a rare corruption, so the salvage
 * path needs its own coverage: the offline PHP suite has no NVIDIA access and
 * cannot produce a truncated body by asking for one.
 */
declare(strict_types=1);

// Minimal stand-ins: routes/ai.php declares its routes against helpers that
// live in the wider API, none of which this probe exercises.
function sanitizeText(?string $v, int $max = 2000): string { $v = trim((string)$v); return mb_strlen($v) > $max ? mb_substr($v, 0, $max) : $v; }
function uuid(): string { return 'probe-uuid'; }
function je(string $m, int $s = 400): void { throw new RuntimeException($m); }
function json($d = null, int $s = 200): void { throw new RuntimeException('JSON_CAPTURED'); }
function db(): PDO { throw new RuntimeException('no db'); }
function requestJson(): array { return []; }
function requireAdminUser(): array { return []; }
function rateCheck(...$a): void {}
function cip(): string { return '127.0.0.1'; }
function auditLog(...$a): void {}
function currentUser(): ?array { return null; }
function notifyUser(...$a): void {}

require __DIR__ . '/../routes/ai.php';

$pass = 0;
$fail = 0;
function check(string $label, bool $ok, string $detail = ''): void
{
    global $pass, $fail;
    if ($ok) { $pass++; echo "PASS  $label\n"; }
    else { $fail++; echo "FAIL  $label" . ($detail !== '' ? " — $detail" : '') . "\n"; }
}

// ── The real failure: a body cut mid-object by the token ceiling ─────────────
$truncated = '{"title": "How to Talk About Marriage", "excerpt": "A short excerpt.", '
    . '"category": "Guidance", "readTime": "4 min", "body": ['
    . '{"t": "h2", "x": "Start early"},'
    . '{"t": "p", "x": "First complete paragraph here."},'
    . '{"t": "p", "x": "Second complete paragraph here."},'
    . '{"t": "p", "x": "Third paragraph cut off mid-sen';

$salvaged = parseGeneratedPost($truncated);
check(
    'truncated JSON yields the paragraphs that did complete',
    $salvaged !== null,
    'the salvage path returned null, so a token cut discards a usable draft'
);
check(
    'salvaged draft keeps its title',
    ($salvaged['title'] ?? null) === 'How to Talk About Marriage',
    'title lost during salvage: ' . json_encode($salvaged['title'] ?? null)
);
// Three complete blocks survive; the partial fourth has no closing brace and
// must not appear, because inventing half a sentence would be worse than
// losing it.
check(
    'salvage drops the incomplete trailing block rather than inventing text',
    count($salvaged['body'] ?? []) === 3,
    'expected 3 complete blocks, got ' . count($salvaged['body'] ?? [])
);
check(
    'salvaged draft keeps its category',
    ($salvaged['category'] ?? null) === 'Guidance',
    'category lost during salvage'
);

// ── Untruncated input must be unaffected ─────────────────────────────────────
$valid = '{"title":"Complete","excerpt":"e","category":"Safety","readTime":"6 min","body":'
    . '[{"t":"p","x":"one"},{"t":"p","x":"two"},{"t":"p","x":"three"}]}';
$parsed = parseGeneratedPost($valid);
check(
    'valid JSON parses normally',
    $parsed !== null && $parsed['title'] === 'Complete' && count($parsed['body']) === 3,
    'valid JSON regressed'
);
check(
    'valid JSON keeps its category',
    ($parsed['category'] ?? null) === 'Safety',
    'category not read from valid JSON'
);

// ── Genuinely unusable input still fails cleanly ────────────────────────────
check(
    'non-JSON input is rejected rather than half-rendered',
    parseGeneratedPost('no json at all here') === null,
    'garbage produced a draft'
);
check(
    'too few blocks to be an article is rejected',
    parseGeneratedPost('{"title":"T","body":[{"t":"p","x":"only one"}]}') === null,
    'a single-paragraph draft was accepted'
);
check(
    'truncated output with no recoverable blocks is rejected',
    parseGeneratedPost('{"title": "Cut", "excerpt": "x", "body": [{"t": "p", "x": "incomp') === null,
    'salvage produced a draft with no usable body'
);

echo "\n$pass passed, $fail failed\n";
exit($fail === 0 ? 0 : 1);