/**
 * Guards the location-page feature.
 *
 * The request was "auto-create a city page whenever a member types a city".
 * Done literally that is a doorway-page generator: a spammer could type
 * "Fake City" into a profile and manufacture an indexable page, and every
 * location with zero members would publish an empty one. Google scaled exactly
 * this down in the March 2024 core update.
 *
 * So pages exist only for REAL locations in the committed snapshot, and each
 * page must link to a LIVE filtered listing. These assertions fail if that
 * guarantee is ever weakened back into "any string a member types".
 */
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { CITIES, COUNTRIES, findCity, findCountry } from '../src/data/locationSeo.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIST = join(__dirname, '..', 'dist');
const SNAP = JSON.parse(
  await readFile(join(__dirname, '..', 'src', 'data', 'locationSnapshot.json'), 'utf8'),
);

let pass = 0;
let fail = 0;
const check = (label, ok, detail = '') => {
  if (ok) { pass++; console.log(`PASS  ${label}`); }
  else { fail++; console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
};

// The spam guard. This is the assertion that makes the feature safe.
check('an unknown city never resolves to a page',
  findCity('Fake City') === null && findCity('Atlantis') === null,
  'a member could type nonsense into a profile and manufacture a page');
check('a known city resolves',
  findCity('Toronto')?.slug === 'toronto' && findCity('  karachi ')?.slug === 'karachi',
  'exact-match lookup is broken, including whitespace tolerance');
check('an unknown country never resolves',
  findCountry('Wakanda') === null && findCountry('united kingdom')?.slug === 'united-kingdom',
  'country lookup is wrong');

// Only snapshotted locations may be published.
const expected = [
  ...Object.keys(SNAP.cities).map((s) => `/city/${s}`),
  ...Object.keys(SNAP.countries).map((s) => `/country/${s}`),
];
const missing = expected.filter((r) => !existsSync(join(DIST, r.slice(1), 'index.html')));
check('every location with members has a page', missing.length === 0, missing.join(', '));

// And nothing else may be published.
const allowed = new Set(expected.map((r) => r.slice(1)));
const orphans = ['city', 'country']
  .flatMap((kind) => CITIES.concat(COUNTRIES).map((x) => `${kind}/${x.slug}`))
  .filter((d) => !allowed.has(d) && existsSync(join(DIST, d, 'index.html')));
check('no location page exists without members behind it', orphans.length === 0, orphans.join(', '));

// Each page must canonicalise to itself and link to a live filtered listing.
const badCanonical = [];
const noLiveLink = [];
const duplicateH1 = [];
const h1s = [];
for (const route of expected) {
  const file = join(DIST, route.slice(1), 'index.html');
  if (!existsSync(file)) continue;
  const html = await readFile(file, 'utf8');
  const canonical = (html.match(/rel="canonical" href="([^"]+)"/) || [])[1];
  if (canonical !== `https://shiarishta.com${route}`) badCanonical.push(route);
  if (!/href="https:\/\/shiarishta\.com\/profiles\?(city|country)=/.test(html)) noLiveLink.push(route);
  const h1 = (html.match(/<h1>([^<]*)<\/h1>/) || [])[1];
  if (h1) h1s.push(h1);
}
check('every location page canonicalises to itself', badCanonical.length === 0, badCanonical.join(', '));
check('every location page links to a live filtered listing',
  noLiveLink.length === 0, noLiveLink.join(', ') || 'pages exist but none link to live results');
check('location H1s are unique', new Set(h1s).size === h1s.length,
  'two locations share an H1 — doorway-page shape');

// ── Discovery: nothing may be an orphan ─────────────────────────────────────
// All 14 location pages existed with unique titles, H1s and self-referencing
// canonicals — and nothing on the site linked to a single one of them. A sitemap
// entry is a hint to a crawler, not a discovery path; a page reachable from
// nothing is the strongest possible signal that it is not part of the site.
const hubPath = join(DIST, 'locations', 'index.html');
check('a /locations hub exists', existsSync(hubPath), 'no hub to link the cluster from');
if (existsSync(hubPath)) {
  const hub = await readFile(hubPath, 'utf8');
  const notLinked = expected.filter((r) => !hub.includes(`${r}"`));
  check('the hub links every location page', notLinked.length === 0,
    `orphaned: ${notLinked.join(', ')}`);
  check('the hub also links onward to browse and register',
    hub.includes('/profiles') && hub.includes('/auth/register'),
    'a hub that only links siblings is a directory, not a funnel');
}

// Every page must be reachable from the hub, the homepage, or the sitemap.
const sitemap = await readFile(join(ROOT, 'public', 'sitemap.xml'), 'utf8');
const home = await readFile(join(DIST, 'index.html'), 'utf8');
const hubOrHome = existsSync(hubPath) ? await readFile(hubPath, 'utf8') : '';
const undiscoverable = expected.filter((r) =>
  !hubOrHome.includes(`${r}"`) && !home.includes(`${r}"`) && !sitemap.includes(`${r}<`));
check('no location page is undiscoverable', undiscoverable.length === 0,
  `in sitemap only, linked from nothing: ${undiscoverable.join(', ')}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);