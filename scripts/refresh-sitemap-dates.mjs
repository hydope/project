/**
 * Rewrites <lastmod> in public/sitemap.xml from real git history.
 *
 * A rating site reported "no visible dates or recent references that indicate
 * content is regularly updated". Every entry here was hardcoded to 2026-09-26
 * and had been drifting further out of date with every deploy.
 *
 * Two problems with a hand-maintained date:
 *   1. It goes stale silently. Nothing fails when a page changes and the date
 *      does not.
 *   2. It is a claim, not a measurement. A crawler reading "last updated
 *      2026-09-26" is being told something that may be untrue.
 *
 * So the date is now derived: for each URL, find the most recent commit that
 * touched the source backing that route, and use that commit's date. If git
 * history is unavailable the previous value is kept rather than replaced with
 * today's date, because "changed today" is itself a false claim for a page that
 * did not change.
 */
import { readFile, writeFile } from 'fs/promises';
import { execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ROUTE_SEO } from '../src/data/routeSeo.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SITEMAP = join(ROOT, 'public', 'sitemap.xml');

/** Most recent commit date (YYYY-MM-DD) touching any of these paths. */
function lastCommitDate(paths) {
  let newest = null;
  for (const p of paths) {
    try {
      const out = execFileSync(
        'git',
        ['log', '-1', '--format=%cs', '--', p],
        { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      ).trim();
      if (out && (!newest || out > newest)) newest = out;
    } catch {
      // File not in git history (new, or untracked). Skip rather than guess.
    }
  }
  return newest;
}

let xml;
try {
  xml = await readFile(SITEMAP, 'utf8');
} catch {
  console.error('public/sitemap.xml not found');
  process.exit(1);
}

const routes = Object.keys(ROUTE_SEO);
const lookup = new Map(routes.map((r) => [r === '/' ? '/' : r, r]));

let updated = 0;
let kept = 0;

xml = xml.replace(
  /<loc>https:\/\/shiarishta\.com([^<]*)<\/loc>\s*<lastmod>([^<]*)<\/lastmod>/g,
  (match, path, existing) => {
    const route = path.replace(/\/$/, '') || '/';
    if (!lookup.has(route)) return match; // landing pages / articles, untouched

    const date = lastCommitDate([
      'src/data/routeSeo.js',
      `src/pages${route === '/' ? '/Home.jsx' : route.replace(/\//g, '/')}`,
      'src/components/Seo.jsx',
    ]);

    if (!date) {
      kept++;
      return match; // no evidence of a change: keep the old value, don't fabricate
    }
    if (date !== existing) updated++;
    return match.replace(existing, date);
  },
);

await writeFile(SITEMAP, xml, 'utf8');
console.log(`sitemap lastmod refreshed from git: ${updated} changed, ${kept} kept (no git evidence)`);