/**
 * The /locations hub.
 *
 * ── The problem ──────────────────────────────────────────────────────────────
 * Every /city/* and /country/* page was an orphan. It was in the sitemap, it
 * had a unique title, H1 and canonical — and nothing on the site linked to it.
 * A crawler can only find a page by following a link or reading the sitemap;
 * the latter is a hint, not a discovery path. No internal links to a page is
 * the strongest possible signal that it is not part of the site.
 *
 * This hub is the fix: one page that links every real city and country, linked
 * from the primary nav so the whole cluster is reachable in two clicks from the
 * homepage.
 *
 * It is built from the same committed snapshot as the location pages themselves,
 * so a location cannot appear here without having a page, or vice versa.
 */
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SITE_URL } from '../src/data/routeSeo.js';
import { CITIES, COUNTRIES } from '../src/data/locationSeo.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SNAP = JSON.parse(
  await readFile(join(ROOT, 'src', 'data', 'locationSnapshot.json'), 'utf8'),
);

const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const live = (slug, name) => `https://shiarishta.com/profiles?city=${encodeURIComponent(name)}`;
const liveCountry = (slug, name) => `https://shiarishta.com/profiles?country=${encodeURIComponent(name)}`;

const cities = CITIES.filter((c) => SNAP.cities[c.slug]);
const countries = COUNTRIES.filter((c) => SNAP.countries[c.slug]);

const cityLinks = cities
  .map((c) =>
    `      <li><a href="${SITE_URL}/city/${c.slug}">Shia matrimony in ${esc(c.name)}</a>` +
    ` — <a href="${live(c.slug, c.name)}">browse profiles in ${esc(c.name)}</a></li>`
  ).join('\n');

const countryLinks = countries
  .map((c) =>
    `      <li><a href="${SITE_URL}/country/${c.slug}">Shia matrimony in ${esc(c.name)}</a>` +
    ` — <a href="${liveCountry(c.slug, c.name)}">browse profiles in ${esc(c.name)}</a></li>`
  ).join('\n');

// Grouped by country so the hub doubles as a directory of where members are,
// which is the thing a family actually arrives looking for.
const byCountry = countries.map((c) => {
  const inCountry = cities.filter((x) => x.countrySlug === c.slug);
  if (!inCountry.length) return '';
  const items = inCountry
    .map((x) => `<li><a href="${SITE_URL}/city/${x.slug}">${esc(x.name)}</a></li>`)
    .join('');
  return (
    `      <section>\n        <h3><a href="${SITE_URL}/country/${c.slug}">${esc(c.name)}</a></h3>\n` +
    `        <ul>\n${items}\n        </ul>\n      </section>`
  );
}).filter(Boolean).join('\n');

const html = `<div class="seo-static">
      <header><nav aria-label="Main"><ul>
        <li><a href="${SITE_URL}/">Home</a></li>
        <li><a href="${SITE_URL}/profiles">Browse profiles</a></li>
        <li><a href="${SITE_URL}/about">About</a></li>
        <li><a href="${SITE_URL}/safety">Safety</a></li>
        <li><a href="${SITE_URL}/success-stories">How it works</a></li>
        <li><a href="${SITE_URL}/contact">Contact</a></li>
        <li><a href="${SITE_URL}/privacy">Privacy</a></li>
        <li><a href="${SITE_URL}/terms">Terms</a></li>
        <li><a href="${SITE_URL}/auth/register">Create free account</a></li>
      </ul></nav></header>
      <main id="main-content">
        <h1>Shia matrimony by location</h1>
        <p>Find Shia matrimonial profiles by city or country. Every location below has members on Shia Rishta today, and each page links straight to live, filtered results. Where a location is not listed, nobody on the platform lives there yet.</p>
        <p><a class="seo-btn" href="${SITE_URL}/profiles">Browse all profiles</a>
        <a class="seo-btn-ghost" href="${SITE_URL}/auth/register">Create a free account</a></p>

        <article class="seo-section">
          <h2>Cities</h2>
          <ul>
${cityLinks}
          </ul>
        </article>

        <article class="seo-section">
          <h2>Countries</h2>
          <ul>
${countryLinks}
          </ul>
        </article>

        <article class="seo-section">
          <h2>Locations grouped by country</h2>
${byCountry}
        </article>

        <article class="seo-section">
          <h2>Before you search</h2>
          <p>Photos on Shia Rishta are private by default: a member can show photos to everyone, only to people they have mutual interest with, or only to matches. Contact details are never published, and a conversation opens only after interest is mutual from both sides. Browsing is free and needs no account.</p>
          <p>If you are looking for a specific situation — a sayyid rishta, or families outside Pakistan — try <a href="${SITE_URL}/syed-rishta">Syed rishta</a>, <a href="${SITE_URL}/shia-nikah">what nikah involves</a>, or the <a href="${SITE_URL}/profile-guide">profile guide</a>.</p>
        </article>

        <h2>Contact</h2>
        <p>Questions, privacy requests or takedown requests go through our <a href="${SITE_URL}/contact">contact form</a>, which reaches the operations team directly.</p>
        <footer><p>
          <a href="${SITE_URL}/privacy">Privacy policy</a> &middot;
          <a href="${SITE_URL}/terms">Terms of use</a> &middot;
          <a href="${SITE_URL}/safety">Safety</a> &middot;
          <a href="${SITE_URL}/contact">Contact</a>
        </p></footer>
      </main>
    </div>`;

console.log(`locations hub: ${cities.length} cities, ${countries.length} countries`);
console.log(html.slice(0, 200) + '...');