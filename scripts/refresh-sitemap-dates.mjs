/**
 * Generates public/sitemap.xml from the SAME manifest the prerenderer uses.
 *
 * ── Why it is generated rather than hand-maintained ──────────────────────────
 * The previous version edited <lastmod> in a hand-written sitemap.xml. That
 * silently excluded every page added after it was written: all 14 location pages
 * were prerendered and completely absent from the sitemap, so they could not be
 * discovered at all. A sitemap that drifts from the route table is worse than no
 * sitemap, because it looks authoritative.
 *
 * It is generated from ROUTE_SEO + landingRouteSeo() + locationRouteSeo(), the
 * exact union scripts/prerender-routes.mjs writes to disk. If a page ships, it
 * is listed; if it is listed, it ships.
 *
 * ── lastmod ─────────────────────────────────────────────────────────────────
 * Derived from the most recent commit touching that route's source, so it is a
 * measurement rather than a claim. Where git has no history for a path the
 * existing date is kept rather than replaced with today, because "changed today"
 * is itself untrue for a page that did not change.
 */
import { readFile, writeFile } from 'fs/promises';
import { execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ROUTE_SEO } from '../src/data/routeSeo.js';
import { landingRouteSeo } from '../src/data/landingRouteSeo.js';
import { CITIES, COUNTRIES, locationRouteSeo } from '../src/data/locationSeo.js';
import { LANDING_PAGE_META } from '../src/pages/landing/landingPageMeta.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SITEMAP = join(ROOT, 'public', 'sitemap.xml');

/** Real member locations, same snapshot the prerenderer consumes. */
const SNAP = JSON.parse(
  await readFile(join(ROOT, 'src', 'data', 'locationSnapshot.json'), 'utf8'),
);
const ALL_LOCATIONS = {
  cities: CITIES.map((c) => ({ ...c, count: SNAP.cities[c.slug] || 0 })),
  countries: COUNTRIES.map((c) => ({ ...c, count: SNAP.countries[c.slug] || 0 })),
};

const ALL = {
  ...ROUTE_SEO,
  ...landingRouteSeo(LANDING_PAGE_META),
  ...locationRouteSeo(ALL_LOCATIONS),
};

// Blog articles are crawlable, real content, and belong in the sitemap.
let articles = [];
try {
  const file = join(ROOT, 'src', 'data', 'articleMeta.js');
  const mod = await import(`file://${file.replace(/\\/g, '/')}`);
  articles = mod.ARTICLE_META || [];
} catch {
  articles = [];
}

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
      // File not in git history. Skip rather than guess.
    }
  }
  return newest;
}

/** Preserve an existing lastmod so an untracked route does not claim "today". */
async function existingDates() {
  const map = new Map();
  try {
    const xml = await readFile(SITEMAP, 'utf8');
    for (const m of xml.matchAll(/<loc>https:\/\/shiarishta\.com([^<]*)<\/loc>\s*<lastmod>([^<]*)<\/lastmod>/g)) {
      map.set(m[1], m[2]);
    }
  } catch {
    // No sitemap yet: everything gets its git-derived date.
  }
  return map;
}

const prior = await existingDates();

/** Source files that, when touched, mean this route changed. */
function sourcesFor(path) {
  const out = ['src/data/routeSeo.js', 'src/components/Seo.jsx'];
  if (path.startsWith('/city/') || path.startsWith('/country/')) {
    out.push('src/data/locationSeo.js', 'src/data/locationSnapshot.json');
  } else if (LANDING_PAGE_META[path.slice(1)]) {
    out.push('src/pages/landing/landingPageMeta.js', 'src/pages/landing/landingPages.js');
  } else {
    out.push(`src/pages${path === '/' ? '/Home.jsx' : path.replace(/\//g, '/')}`);
  }
  return out;
}

const entries = [];
const routes = Object.keys(ALL).sort();
for (const path of routes) {
  const route = path.replace(/\/$/, '') || '/';
  entries.push({
    loc: `https://shiarishta.com${route === '/' ? '/' : route}`,
    date: lastCommitDate(sourcesFor(route)) || prior.get(route) || null,
    priority: route === '/' ? '1.0'
      : (route.startsWith('/city/') || route.startsWith('/country/') || LANDING_PAGE_META[route.slice(1)]) ? '0.8'
      : '0.7',
  });
}

for (const a of articles) {
  const route = `/blog/${a.slug}`;
  entries.push({
    loc: `https://shiarishta.com${route}`,
    date: lastCommitDate(['src/data/articleMeta.js', `src/pages/Blog.jsx`]) || prior.get(route) || null,
    priority: '0.6',
  });
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...entries.map((e) => [
    '  <url>',
    `    <loc>${esc(e.loc)}</loc>`,
    e.date ? `    <lastmod>${e.date}</lastmod>` : '',
    `    <priority>${e.priority}</priority>`,
    '  </url>',
  ].filter(Boolean).join('\n')),
  '</urlset>',
  '',
].join('\n');

await writeFile(SITEMAP, xml, 'utf8');
const withDate = entries.filter((e) => e.date).length;
console.log(`sitemap: ${entries.length} URLs (${withDate} with a real lastmod, ${entries.length - withDate} without)`);
console.log(`  ${routes.length} routes + ${articles.length} articles`);
