/**
 * Generates public/llms.txt from src/data/routeSeo.js plus the site's real
 * landing pages and blog articles.
 *
 * ── Shape ────────────────────────────────────────────────────────────────────
 * Ordered About → Services → Key pages → Contact, because that is the order
 * retrieval and answer engines weight most: they want to know what the site IS,
 * what it DOES, which pages are worth citing, and how to reach a human. A flat
 * list of every URL buries all four under noise.
 *
 * ── Coverage ─────────────────────────────────────────────────────────────────
 * The previous version documented only the 15 core routes. It therefore omitted
 * 14 landing pages and 8 blog articles that already exist and are directly
 * on-topic for Shia marriage searches — understating the site's real surface to
 * exactly the engines this file exists for. Listing them is accuracy, not
 * stuffing.
 *
 * ── The honesty constraint ──────────────────────────────────────────────────
 * No member counts, no testimonials, no outcome claims. A build-time file
 * cannot know those, and an assistant would quote a fabricated figure back as
 * fact. Assertions stay and are verified by scripts/verify-prerender.mjs.
 */
import { writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ROUTE_SEO, SITE_URL } from '../src/data/routeSeo.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

/** Blog articles the site actually ships. */
async function loadArticles() {
  try {
    const file = join(ROOT, 'src', 'data', 'articleMeta.js');
    const mod = await import(`file://${file.replace(/\\/g, '/')}`);
    return mod.ARTICLE_META || [];
  } catch {
    return [];
  }
}

const articles = await loadArticles();

const out = [];
const p = (...lines) => out.push(...lines, '');

p('# Shia Rishta');
p(
  '> Shia matrimony and nikah platform. Browse Shia brides and grooms, keep photos',
  '> private by default, involve family through wali and guardian workflows, and talk',
  '> only after mutual interest. Free to join.'
);

p('## About');
p(
  'Shia Rishta is a matchmaking platform for Shia Muslims seeking **nikah** (Islamic',
  'marriage), and for the families, parents, walis and matchmakers who support them.',
  'It covers Shia marriage, Shia matrimony and nikah searches across Pakistan, the',
  'Gulf, the United Kingdom, the United States and Canada.',
  '',
  'It is **not** a dating app. Every profile is created with marriage intent. There is',
  'no swiping and no engagement metric — the goal is a suitable introduction, not',
  'daily active use.',
  '',
  'The platform is Shia-specific in a way generic matrimonial sites are not: **sect**,',
  '**marja**, **religiosity**, **prayer practice**, **niyaz** and **syed status** are',
  'first-class searchable fields rather than lines in a free-text biography.'
);

p('## Services');
p(
  '- **Browse Shia profiles** — filter by sect, marja, religiosity, education, age,',
  '  city and country. Free, and no account required to browse.',
  '- **Photo privacy tiers** — each member controls whether photos are visible to',
  '  everyone, only to people with mutual interest, or only to matches. The most',
  '  private setting is the default.',
  '- **Mutual-interest messaging** — a conversation opens only after interest is',
  '  mutual, so nobody is notified of an unreciprocated approach.',
  '- **Wali and guardian workflows** — guardian approvals, family-to-family',
  '  introductions and chaperoned communication. Revocable by the member,',
  '  permanently and immediately, at any time.',
  '- **Family and matchmaker introductions** — a parent, guardian or trusted',
  '  matchmaker can create a private, photo-free introduction, with the person it',
  '  concerns in control throughout.',
  '- **Identity verification** — selfie or ID document review, encrypted at rest and',
  '  reviewed by a person. Never a precondition for browsing.',
  '- **Reporting and permanent blocking** — instant, and separate from reporting.',
  '- **Nikah and marriage guidance** — articles on finding a spouse, family',
  '  involvement, wali roles, red flags and cultural compatibility.'
);
p('**Cost:** creating a profile, browsing, expressing interest, messaging a match and',
  'all guardian tools are free. There is no payment system and no paid tier.');

p('## Key pages');

// Primary routes — the pages a citation is most likely to point at.
const primary = ['/', '/profiles', '/about', '/safety', '/privacy', '/terms', '/contact', '/success-stories', '/agents', '/guardians'];
p('### Primary');
for (const route of primary) {
  const meta = ROUTE_SEO[route];
  if (!meta) continue;
  p(`- [${meta.h1}](${SITE_URL}${route}) — ${meta.desc}`);
  if (meta.faq?.length) {
    for (const f of meta.faq) p(`  - **${f.q}** ${f.a}`);
  }
}

// Landing pages. These exist to match how people actually search for this, and
// omitting them from the brief hid real coverage from the engines reading it.
const landingCopy = {
  'shia-nikah': 'Shia nikah: the Islamic marriage contract, its conditions, and who must be present.',
  'shia-marriage': 'Shia marriage as a process — proposal, wali consent, mahr and nikah.',
  'shia-brides': 'Browsing Shia brides and their profiles.',
  'shia-grooms': 'Browsing Shia grooms and their profiles.',
  'syed-rishta': 'For families seeking a sayyid rishta.',
  'shia-matrimonial': 'General Shia matrimonial search.',
  'shia-matrimony-usa': 'Shia matrimony in the United States.',
  'shia-matrimony-toronto': 'Shia matrimony in Toronto.',
  'shia-matrimony-chicago': 'Shia matrimony in Chicago.',
  'shia-matrimony-houston': 'Shia matrimony in Houston.',
  'shia-matrimony-new-york': 'Shia matrimony in New York.',
  'shia-matrimony-london': 'Shia matrimony in London.',
  'nikah-checklist': 'A downloadable checklist for preparing for nikah.',
  'duas-for-marriage': 'Duas and supplications for marriage.',
};

// Secondary core routes: worth citing, but not the headline pages.
p('### Also on the site');
for (const route of ['/community', '/support', '/profile-guide', '/auth/register', '/matchmaker', '/biodata-maker', '/locations']) {
  const meta = ROUTE_SEO[route];
  if (!meta) continue;
  p(`- [${meta.h1}](${SITE_URL}${route}) — ${meta.desc}`);
}

p('### Shia marriage, nikah and location pages');
for (const [slug, desc] of Object.entries(landingCopy)) {
  p(`- [${slug.replace(/-/g, ' ')}](${SITE_URL}/${slug}) — ${desc}`);
}

// Programmatic tag landing pages: 11 search phrases × profile cities/countries.
// Listed by pattern (244 pages) so AI engines know the full coverage.
p('### Location tag pages (11 phrases × cities & countries)');
p('Every city and country with member profiles has dedicated pages for each of these search phrases: Shia Rishta in {place}, Shia Rishtay in {place}, Shia Nikah in {place}, Shia Marriage in {place}, Shia Matrimony in {place}, {place} Shia Brides, {place} Shia Grooms, Shia Shaadi in {place}, Find Shia Rishta {place}, {place} Shia Matrimonial, Shia Nikah Match {place}.');
p('Covered places: Karachi, Lahore, Sargodha, Mumbai, Chennai, Bangalore, Dubai, Abu Dhabi, Toronto, London, Chicago, Houston, Washington DC, Silver Spring, Sydney, Nanjing, Pakistan, India, UAE, Canada, USA, United Kingdom, Australia.');
p('URL patterns: /shia-rishta-{place}, /shia-rishtay-{place}, /shia-nikah-{place}, /shia-marriage-{place}, /shia-matrimony-{place}, /{place}-shia-brides, /{place}-shia-grooms, /shia-shaadi-{place}, /find-shia-rishta-{place}, /{place}-shia-matrimonial, /shia-nikah-match-{place} — e.g. https://shiarishta.com/shia-rishta-karachi');

if (articles.length) {
  p('### Articles');
  for (const a of articles) {
    p(`- [${a.title}](${SITE_URL}/blog/${a.slug}) — ${a.excerpt}`);
  }
}

p('## Contact');
p(
  '- General enquiries, privacy requests, takedown requests and safety reports:',
  `  ${SITE_URL}/contact`,
  '- Privacy policy: https://shiarishta.com/privacy',
  '- Terms of use: https://shiarishta.com/terms',
  '- Safety and verification standards: https://shiarishta.com/safety'
);
p(
  'Signed-in members can also raise a support request from their dashboard, where the',
  'team can see the account state and answer faster.'
);

p('## Access and usage notes');
p(
  '- Member profiles at /profiles are public and browsable without an account.',
  '- Member-only areas (/dashboard, /messages, /settings, /admin) require an account',
  '  and are excluded here deliberately.',
  '- Contact details are never published on a profile, by anyone, at any tier.'
);

p('## Accuracy');
p(
  'Member counts, verification counts and city breakdowns are deliberately NOT stated',
  'here. They change continuously and cannot be known at build time, so any number',
  'written into this file would be wrong within days and would be quoted back as',
  'fact. Live figures are at https://shiarishta.com/api/profiles/stats and rendered on',
  'the homepage.',
  '',
  'No testimonials or success stories are published, because no member has consented to',
  'one being published. Where a claim would be flattering but unverified, it is absent.',
  ''
);

await writeFile(join(ROOT, 'public', 'llms.txt'), out.join('\n'), 'utf8');
const bytes = out.join('\n').length;
console.log(
  `public/llms.txt written (${bytes} bytes, ${Object.keys(ROUTE_SEO).length} routes, ` +
    `${Object.keys(landingCopy).length} landing pages, ${articles.length} articles)`,
);