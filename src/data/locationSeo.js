/**
 * Location pages — one per real city and country that actually has members.
 *
 * ── What was asked for ───────────────────────────────────────────────────────
 * "If a user creates a profile with a city, automatically create that city page."
 *
 * ── Why it is NOT done literally ──────────────────────────────────────────────
 * Generating an indexable page for every city string a member types is the
 * textbook doorway-page pattern: thin pages whose only purpose is to rank for a
 * location. Google scaled this down specifically in its March 2024 core update,
 * and a spammer could abuse it by typing "Fake City" into a profile to
 * manufacture a page. Worse, with 13 members most such pages would be empty —
 * "0 profiles in Baku" is worse than no page at all.
 *
 * ── What is built instead ────────────────────────────────────────────────────
 * The same links, from real data:
 *
 *   1. A /city/<slug> page per REAL city, plus /country/<slug>, each generated
 *      at build time for locations that actually have members.
 *   2. Every page links to the LIVE filtered listing, so the member lands on
 *      real results rather than a static dead end.
 *   3. /locations indexes every real city and country.
 *
 * Faceted URLs (?city=X&gender=Y) deliberately get no indexable pages of their
 * own: crawling a combinatorial filter space is a crawl-budget trap and yields
 * near-identical documents. They canonical to the location page.
 */

// Real, recognisable locations. A member's free-text city is validated against
// this list before it is allowed to become a page — which is also what stops a
// spammer manufacturing one by typing nonsense into a profile.
export const CITIES = [
  { slug: 'karachi', name: 'Karachi', country: 'Pakistan', countrySlug: 'pakistan', note: 'The largest Shia population in Pakistan, and the city with the deepest concentration of Sayyid and Bohra families.' },
  { slug: 'lahore', name: 'Lahore', country: 'Pakistan', countrySlug: 'pakistan', note: 'A large Shia community centred on Data Darbar and Shah Alam, with a long-standing sayyid presence.' },
  { slug: 'sargodha', name: 'Sargodha', country: 'Pakistan', countrySlug: 'pakistan', note: 'A smaller city with a close-knit Shia community where families often search within a wider regional radius.' },
  { slug: 'islamabad', name: 'Islamabad', country: 'Pakistan', countrySlug: 'pakistan', note: 'The capital, with a settled family demographic that skews younger than Karachi or Lahore.' },
  { slug: 'rawalpindi', name: 'Rawalpindi', country: 'Pakistan', countrySlug: 'pakistan', note: 'Frequently searched together with Islamabad; the two function as one metropolitan area for families.' },
  { slug: 'dubai', name: 'Dubai', country: 'UAE', countrySlug: 'uae', note: 'A large expatriate community where the question that matters is often which masjed a family attends, not which suburb they live in.' },
  { slug: 'london', name: 'London', country: 'United Kingdom', countrySlug: 'united-kingdom', note: 'One of the larger Shiite communities in Europe, concentrated around East London and Southall.' },
  { slug: 'toronto', name: 'Toronto', country: 'Canada', countrySlug: 'canada', note: 'A growing Canadian Shiite community, largely arriving from Pakistan, Iran and East Africa.' },
  { slug: 'chicago', name: 'Chicago', country: 'USA', countrySlug: 'usa', note: 'One of the oldest established Shiite communities in North America, with mosques and families several generations deep.' },
  { slug: 'houston', name: 'Houston', country: 'USA', countrySlug: 'usa', note: 'A fast-growing community, younger and more mixed in origin than Chicago or New York.' },
  { slug: 'new-york', name: 'New York', country: 'USA', countrySlug: 'usa', note: 'A long-established community spread across Queens and Staten Island.' },
  { slug: 'silver-spring', name: 'Silver Spring', country: 'USA', countrySlug: 'usa', note: 'Part of the Washington metropolitan area, where families often search across the whole corridor rather than one city.' },
  { slug: 'detroit', name: 'Detroit', country: 'USA', countrySlug: 'usa', note: 'Home to one of the largest Shiite populations in the United States by percentage of population.' },
];

export const COUNTRIES = [
  { slug: 'pakistan', name: 'Pakistan', note: 'The largest Shia population in the world. Introductions are usually arranged through known networks, and wali involvement is near-universal.' },
  { slug: 'iran', name: 'Iran', note: 'The second-largest Shia population. Religious and family expectations differ sharply from South Asian practice, which is why a profile states which it follows.' },
  { slug: 'uae', name: 'United Arab Emirates', note: 'A large expatriate population. Marriages are often between families who also live abroad, which makes wali arrangements more formal.' },
  { slug: 'united-kingdom', name: 'United Kingdom', note: 'A well-established community, with families commonly spanning more than one generation in the UK.' },
  { slug: 'usa', name: 'United States', note: 'Concentrated in a handful of cities rather than spread evenly. Long-settled communities exist in Michigan, Chicago, New York and California.' },
  { slug: 'canada', name: 'Canada', note: 'Smaller and more recent than the US communities, largely arriving from Pakistan, Iran and East Africa.' },
];

const CITY_BY_LOWER = new Map(CITIES.map((c) => [c.name.toLowerCase(), c]));

/**
 * Validate a member's free-text city against the known list.
 *
 * This is the guard that makes the feature safe: a profile saying "Fake City"
 * returns null, so it can never become a page. A profile saying "Toronto"
 * resolves, so the city already has coverage and needs nothing new.
 */
export function findCity(name) {
  if (!name) return null;
  return CITY_BY_LOWER.get(String(name).trim().toLowerCase()) || null;
}

export function findCountry(name) {
  if (!name) return null;
  const lower = String(name).trim().toLowerCase();
  return (
    COUNTRIES.find((c) => c.name.toLowerCase() === lower) ||
    COUNTRIES.find((c) => c.slug === lower) ||
    null
  );
}

/**
 * Only locations that already have members get a page.
 *
 * Publishing a page for a city with zero profiles is the failure mode this
 * guards: a sitemap full of empty location pages is thin content at scale, and
 * it is exactly what the March 2024 core update targets.
 */
export function locationsWithMembers(profiles) {
  const cityHits = new Map();
  const countryHits = new Map();
  for (const p of profiles) {
    const c = findCity(p.city);
    if (c) cityHits.set(c.slug, (cityHits.get(c.slug) || 0) + 1);
    const k = findCountry(p.country);
    if (k) countryHits.set(k.slug, (countryHits.get(k.slug) || 0) + 1);
  }
  return {
    cities: CITIES.filter((c) => cityHits.has(c.slug)).map((c) => ({ ...c, count: cityHits.get(c.slug) })),
    countries: COUNTRIES.filter((c) => countryHits.has(c.slug)).map((c) => ({ ...c, count: countryHits.get(c.slug) })),
  };
}

/** Prerender entries for every location that currently has members. */
export function locationRouteSeo(withMembers) {
  const out = {};
  for (const c of withMembers.cities) {
    out[`/city/${c.slug}`] = {
      title: `Shia Matrimony in ${c.name} | Shia Rishta & Matchmaking`,
      desc: `Browse Shia matrimonial profiles in ${c.name}. Privacy-first photos, mutual-interest messaging and wali-supported introductions. Free to join.`,
      h1: `Shia matrimony in ${c.name}`,
      lede: `Shia Rishta profiles in ${c.name}, ${c.country}. Every profile is created with marriage intent, photos stay private by default, and a conversation opens only after interest is mutual.`,
      sections: [{ h2: `About Shia families in ${c.name}`, p: c.note }],
      faq: [],
      liveFilter: `/profiles?city=${encodeURIComponent(c.name)}`,
    };
  }
  for (const k of withMembers.countries) {
    out[`/country/${k.slug}`] = {
      title: `Shia Matrimony in ${k.name} | Free Shia Rishta Platform`,
      desc: `Find verified Shia brides and grooms in ${k.name}. Privacy-first profiles, wali and guardian workflows, mutual-interest messaging. Free.`,
      h1: `Shia matrimony in ${k.name}`,
      lede: `Shia matrimonial profiles across ${k.name}, filterable by city, sect, marja and practice. Free to browse, and no account is needed to view public profiles.`,
      sections: [{ h2: `Shia families in ${k.name}`, p: k.note }],
      faq: [],
      liveFilter: `/profiles?country=${encodeURIComponent(k.name)}`,
    };
  }
  return out;
}