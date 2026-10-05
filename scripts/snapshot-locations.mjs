/**
 * Snapshot of real member locations, fetched at build time and committed.
 *
 * The prerender runs in CI, which has no database access — so the location
 * pages cannot be derived from a live query inside the build. Instead this
 * script hits the PUBLIC /api/profiles endpoint and writes a snapshot the
 * prerenderer consumes.
 *
 * Only cities and countries from src/data/locationSeo.js that actually appear
 * in the snapshot get a page. A member typing "Fake City" therefore cannot
 * manufacture one, and a location nobody lives in never gets published.
 *
 * Run manually (or on a schedule) and commit the result:
 *   npm run snapshot:locations
 */
import { writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { findCity, findCountry } from '../src/data/locationSeo.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const API = process.env.SNAPSHOT_API || 'https://shiarishta.com/api/profiles';

const res = await fetch(API, { headers: { Accept: 'application/json' } });
if (!res.ok) throw new Error(`${API} returned ${res.status}`);
const profiles = await res.json();

const cities = new Map();
const countries = new Map();
const unmatchedCities = new Set();

for (const p of profiles) {
  const c = findCity(p.city);
  if (c) cities.set(c.slug, (cities.get(c.slug) || 0) + 1);
  else if (p.city) unmatchedCities.add(String(p.city).trim());

  const k = findCountry(p.country);
  if (k) countries.set(k.slug, (countries.get(k.slug) || 0) + 1);
}

const snapshot = {
  // When this was measured. The prerender does not need it, but a reviewer
  // asking "is this stale?" should be able to answer without running git.
  generatedAt: new Date().toISOString().slice(0, 10),
  source: API,
  cities: Object.fromEntries(cities),
  countries: Object.fromEntries(countries),
  // Cities members actually typed that have no page. Worth surfacing: these are
  // either typos or genuine gaps in the city list worth adding.
  unmatchedCities: [...unmatchedCities].sort(),
};

await writeFile(
  join(ROOT, 'src', 'data', 'locationSnapshot.json'),
  `${JSON.stringify(snapshot, null, 2)}\n`,
  'utf8',
);

console.log(
  `snapshot: ${cities.size} cities, ${countries.size} countries from ${profiles.length} profiles`,
);
if (unmatchedCities.size) {
  console.log(`cities members typed with no page yet: ${[...unmatchedCities].join(', ')}`);
}