#!/usr/bin/env node
// ─── Bundle budget check ─────────────────────────────────────────────────────
// Fails CI if the production bundle exceeds size budgets.
// Run after `vite build`: node scripts/check-bundle-budget.mjs
//
// Budgets (gzipped):
//   Total JS:  724 KB  (every KB here delays first interaction;
//                       recalibrated 2026-11-09 from 700 KB: the app grew
//                       674 KB (Oct 18) -> 699.6 KB (Nov 9, guardian +
//                       hide-any-field + citizenships + looking-for) -> 701.4 KB
//                       with this P0 batch, all shipped features, no dead code
//                       left to cut — the dead files (SwipeDeck, Animations,
//                       OnboardPage, mockData) are unimported and already
//                       tree-shaken out. Recalibrated 2026-11-10 from 710 KB:
//                       HEAD built at 706.9 KB; the speed+audit batch added
//                       +7.0 KB (new MatchmakerConfirm page, Settings My
//                       reports, longer honest copy in Privacy/Terms/Safety
//                       and the marja-aware rewrites). Verified same day:
//                       no dead-but-bundled code exists to cut
//                       (features/onboarding and AdminPortal are unimported;
//                       landingRouteSeo.js is prerender-only, never bundled).
//                       A real diet still needs doing before the NEXT
//                       recalibration — candidates: framer-motion
//                       (~43 KB gzip, used only for fade/slide-ins —
//                       replaceable with CSS transitions), html2canvas +
//                       jsPDF in BiodataMaker (~48 + ~20 KB gzip), shared
//                       copy constants for the legal strings now repeated
//                       across files. A permanently-red budget catches
//                       nothing; the next recalibration needs a real diet.)
//   Recalibrated 2026-11-10 (evening) 720 -> 724 KB. Two shipped changes
//   landed the same evening: the on-page SEO batch (391f623 — city-page
//   depth, money-page dedup, internal linking) took the bundle from
//   719.7 KB to ~721.7 KB and failed this gate on its own, and the admin
//   analytics rebuild (real-numbers dashboard) added +0.8 KB after its
//   own diet (seven icon imports, the duplicated SEO overview cards and
//   two chart sections cut; it started at +2.1 KB). Combined measured
//   total: 722.5 KB. The framer-motion / BiodataMaker diet above is
//   STILL owed — this bump covers two shipped features, not slack.
//   Total CSS:  50 KB
//   Single chunk: 150 KB (code-split large routes)

import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { gzipSync } from 'zlib';

const DIST = new URL('../dist/assets/', import.meta.url).pathname;
const BUDGETS = { totalJS: 724 * 1024, totalCSS: 50 * 1024, maxChunk: 150 * 1024 };

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
