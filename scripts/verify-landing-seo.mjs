/**
 * Guards the programmatic-SEO fix.
 *
 * Before this, all 14 landing pages served the HOMEPAGE document — including its
 * canonical tag. A canonical pointing at another URL tells Google to index the
 * page AS that URL, so /shia-nikah was declaring itself the homepage and could
 * never rank for its own keyword, while still being listed in the sitemap.
 *
 * Every assertion below is a thing that, if it silently regressed, would put the
 * long-tail asset back to zero without anything visibly breaking.
 */
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { landingRouteSeo } from '../src/data/landingRouteSeo.js';
import { LANDING_PAGE_META } from '../src/pages/landing/landingPageMeta.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');

let pass = 0;
let fail = 0;
const check = (label, ok, detail = '') => {
  if (ok) { pass++; console.log(`PASS  ${label}`); }
  else { fail++; console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
};

const landing = landingRouteSeo(LANDING_PAGE_META);
const slugs = Object.keys(landing);

check('every landing page has prerender metadata', slugs.length >= 14,
  `${slugs.length} entries`);
check('every landing page has a unique H1',
  new Set(slugs.map((s) => landing[s].h1)).size === slugs.length,
  'two landing pages share an H1');
check('every landing page has a unique title',
  new Set(slugs.map((s) => landing[s].title)).size === slugs.length,
  'two landing pages share a title');

// The headline assertion: a landing page must claim ITSELF, not the homepage.
const wrongCanonical = [];
const missingDoc = [];
const homepageTitle = 'Shia Matrimony | Find Shia Rishta for Nikah';
const homepageLeak = [];

for (const slug of slugs) {
  // slug already starts with "/" (it is the route key), so the path is used as-is.
  const path = slug.replace(/^\//, '');
  const file = join(DIST, path, 'index.html');
  if (!existsSync(file)) { missingDoc.push(slug); continue; }
  const html = await readFile(file, 'utf8');
  const canonical = (html.match(/rel="canonical" href="([^"]+)"/) || [])[1];
  if (canonical !== `https://shiarishta.com${slug}`) wrongCanonical.push(`${slug} -> ${canonical}`);
  // Regression guard for the original bug in its title form.
  if (html.includes(`<title>${homepageTitle}`)) homepageLeak.push(slug);
}

check('every landing page has a document in the build output',
  missingDoc.length === 0, missingDoc.join(', '));
check('every landing page canonicalises to ITSELF',
  wrongCanonical.length === 0,
  wrongCanonical.length ? wrongCanonical.join('; ') : '');
check('no landing page ships the homepage title',
  homepageLeak.length === 0, homepageLeak.join(', '));

// Doorway-page guard. Fourteen pages of near-identical copy is what Google
// penalised in its March 2024 core update, so the bodies must actually differ.
const bodies = slugs.map((s) => landing[s].sections[0].p[0]);
check('landing page bodies are distinct, not a city-name template',
  new Set(bodies).size === slugs.length,
  `${slugs.length - new Set(bodies).size} duplicate bodies`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);