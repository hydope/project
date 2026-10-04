<?php
declare(strict_types=1);
function sanitizeText(?string $v, int $max = 2000): string { $v=trim((string)$v); return mb_strlen($v)>$max?mb_substr($v,0,$max):$v; }
function uuid(): string { return 'x'; }
function je(string $m,int $s=400): void { throw new RuntimeException($m); }
function json($d=null,int $s=200): void { throw new RuntimeException('json'); }
function db(): PDO { throw new RuntimeException('no db'); }
function requestJson(): array { return []; }
function requireAdminUser(): array { return []; }
function rateCheck(...$a): void {}
function cip(): string { return '1.1.1.1'; }
function auditLog(...$a): void {}
function currentUser(): ?array { return null; }
require __DIR__ . '/../routes/ai.php';

$truncated = '{"title": "How to Talk About Marriage", "excerpt": "A short excerpt.", "category": "Guidance", "readTime": "4 min", "body": ['
  . '{"t": "h2", "x": "Start early"},'
  . '{"t": "p", "x": "First complete paragraph here."},'
  . '{"t": "p", "x": "Second complete paragraph here."},'
  . '{"t": "p", "x": "Third paragraph cut off mid-sen';
$r = parseGeneratedPost($truncated);
echo "TRUNCATED -> recovered: " . ($r ? 'YES' : 'NO') . "\n";
if ($r) { echo "  title: {$r['title']}\n  blocks: ".count($r['body'])."\n  category: {$r['category']}\n"; }

$valid = '{"title":"Complete","excerpt":"e","category":"Safety","readTime":"6 min","body":[{"t":"p","x":"one"},{"t":"p","x":"two"},{"t":"p","x":"three"}]}';
$r2 = parseGeneratedPost($valid);
echo "VALID -> title: {$r2['title']} blocks: ".count($r2['body'])." category: {$r2['category']}\n";
echo "GARBAGE -> null: " . (parseGeneratedPost('no json at all') === null ? 'YES' : 'NO') . "\n";
echo "ONE BLOCK -> null: " . (parseGeneratedPost('{"title":"T","body":[{"t":"p","x":"only one"}]}') === null ? 'YES' : 'NO') . "\n";