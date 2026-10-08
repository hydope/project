#!/usr/bin/env node
// ─── Bundle budget check ─────────────────────────────────────────────────────
// Fails CI if the production bundle exceeds size budgets.
// Run after `vite build`: node scripts/check-bundle-budget.mjs
//
// Budgets (gzipped):
//   Total JS:  300 KB  (every KB here delays first interaction)
//   Total CSS:  50 KB
//   Single chunk: 150 KB (code-split large routes)

import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { gzipSync } from 'zlib';

const DIST = new URL('../dist/assets/', import.meta.url).pathname;
const BUDGETS = { totalJS: 300 * 1024, totalCSS: 50 * 1024, maxChunk: 150 * 1024 };

let totalJS = 0, totalCSS = 0, maxChunk = 0, maxChunkName = '';
const violations = [];

for (const file of readdirSync(DIST)) {
  const path = join(DIST, file);
  if (!statSync(path).isFile()) continue;
  const { readFileSync } = await import('fs');
  const gzipped = gzipSync(readFileSync(path)).length;

  if (file.endsWith('.js')) {
    totalJS += gzipped;
    if (gzipped > maxChunk) { maxChunk = gzipped; maxChunkName = file; }
  } else if (file.endsWith('.css')) {
    totalCSS += gzipped;
  }
}

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
console.log(`JS total:  ${kb(totalJS)} (budget ${kb(BUDGETS.totalJS)})`);
console.log(`CSS total: ${kb(totalCSS)} (budget ${kb(BUDGETS.totalCSS)})`);
console.log(`Largest chunk: ${maxChunkName} ${kb(maxChunk)} (budget ${kb(BUDGETS.maxChunk)})`);

if (totalJS > BUDGETS.totalJS) violations.push(`JS total ${kb(totalJS)} exceeds ${kb(BUDGETS.totalJS)}`);
if (totalCSS > BUDGETS.totalCSS) violations.push(`CSS total ${kb(totalCSS)} exceeds ${kb(BUDGETS.totalCSS)}`);
if (maxChunk > BUDGETS.maxChunk) violations.push(`Chunk ${maxChunkName} ${kb(maxChunk)} exceeds ${kb(BUDGETS.maxChunk)}`);

if (violations.length) {
  console.error('\n❌ BUDGET VIOLATIONS:');
  violations.forEach(v => console.error('  - ' + v));
  process.exit(1);
}
console.log('\n✅ All bundle budgets passed.');
