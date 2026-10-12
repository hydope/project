/**
 * Programmatic-SEO landing pages, merged into the prerender pass.
 *
 * ── The bug this fixes ──────────────────────────────────────────────────────
 * These 14 pages are the site's entire long-tail asset. Each already carried a
 * hand-written, per-page title and description in landingPageMeta.js — but they
 * were NOT prerendered. Every one served the HOMEPAGE's document, including its
 * canonical tag.
 *
 * That is the most damaging SEO defect on the site. A canonical pointing at
 * another URL is an instruction to index the page AS that other URL, so
 * /shia-nikah was explicitly telling Google it was the homepage. All 14 keyword
 * pages were switched off at the source, while still being advertised in the
 * sitemap — discoverable, and incapable of ranking.
 *
 * ── Why per-page copy, not a template ────────────────────────────────────────
 * The body text below is written per page. Generating fourteen pages from one
 * paragraph with a swapped-in city name is exactly the doorway-page pattern
 * Google scaled down in its March 2024 core update: thin, near-identical pages
 * whose only purpose is to rank for a location. The previous state — all
 * fourteen serving one identical document — was that same mistake in a worse
 * form.
 *
 * Titles and descriptions are NOT retyped here. They are read from
 * landingPageMeta.js at build time, so the runtime <Seo> component and the
 * prerenderer cannot drift apart.
 */
const LANDING_BODY = {
  'shia-nikah': {
    h1: 'Shia Nikah: the marriage contract, explained',
    more: 'Nikah is the contract that makes a marriage valid in Islam, and for Shia Muslims it carries obligations on both sides rather than being a formality. A Muslim man may marry a Muslim woman directly. A Muslim man may not marry a woman of the People of the Book unless her companions are also People of the Book, and permission from her wali is required in every case where she has not already been married once. A Shia man may not marry a non-Shia woman at all. The practical consequences show up well before a wedding date: a family will ask which marja the bride follows, whether the wali attends, whether a mahr has been agreed, and whether anyone is already married. Those questions are the actual conversation.',
  },
  'shia-marriage': {
    h1: 'Shia marriage, from proposal to nikah',
    more: 'A Shia marriage usually moves through the same broad stages: a proposal reaches the family rather than the individual, the families and the wali discuss expectations, identity and intent are established, a mahr is agreed, and nikah is performed with the required witnesses. Where and how each stage happens varies by family, by marja and by the couple. What varies most in practice is how early the family is involved, and how much of the process is expected to be private between the couple. Those are worth agreeing explicitly rather than assuming.',
  },
  'shia-brides': {
    h1: 'Shia brides seeking nikah',
    more: 'Browse profiles of Shia women looking for marriage, with the details families actually decide on: age, city, education level, religiosity, prayer practice and family background. Every profile states marriage intent up front, so nobody has to guess whether a profile is casual. Photos are private by default: a bride can show photos to everyone, to people she has mutual interest with, or only to matches, and that choice is enforced on the server rather than hidden in the interface.',
  },
  'shia-grooms': {
    h1: 'Shia grooms seeking nikah',
    more: 'Browse profiles of Shia men looking for marriage, filtered by the same criteria families use elsewhere: age, city, education, religiosity, prayer practice and family background. Sect and marja are separate searchable fields rather than a line in a biography. Photos follow the same three-tier privacy model as every other profile, and a conversation can only begin after interest is mutual from both sides.',
  },
  'syed-rishta': {
    h1: 'Syed and Syeda rishtas for nikah',
    more: 'Families looking for a sayyid rishta can filter specifically for it. Syed status is a searchable field on this platform, which means a family can narrow a list by lineage without reading through every profile. It is a real constraint for a real marriage market, and leaving it to be discovered by chance is how families end up with mismatches they did not intend.',
  },
  'shia-matrimonial': {
    h1: 'Shia matrimonial profiles',
    more: 'A general search across Shia matrimonial profiles, filterable by sect, marja, religiosity, prayer practice, education, age, city and country. The point of structured filters is that a family can do the narrowing themselves rather than sending messages and finding out two conversations later that a fundamental position differs.',
  },
  'shia-matrimony-usa': {
    h1: 'Shia matrimony in the United States',
    more: 'Shia matrimonial profiles across the United States, searchable by city and state, plus sect, marja and practice. Useful for families spread across the country who want to narrow by where someone actually lives rather than by an overseas hometown listing. Privacy matters more, not less, for a diaspora community where an extended family network can make a visible profile effectively public.',
  },
  'shia-matrimony-london': {
    h1: 'Shia matrimony in London',
    more: 'Shia matrimonial profiles in London and across the UK, searchable by city, plus sect, marja and practice. Filter for where someone lives now rather than where their family is from, which is often not the same thing in a diaspora. Photos default to the most private setting, and a conversation opens only after interest is mutual.',
  },
  'shia-matrimony-toronto': {
    h1: 'Shia matrimony in Toronto',
    more: 'Shia matrimonial profiles in Toronto and across Canada, searchable by city, plus sect, marja and practice. Built for families in the Greater Toronto Area who want to narrow by practice and location together. Free to browse, and no account is required to view public profiles.',
  },
  'shia-matrimony-chicago': {
    h1: 'Shia matrimony in Chicago',
    more: 'Shia matrimonial profiles in Chicago and across Illinois, searchable by city, plus sect, marja and practice. Privacy-first by default: photos follow a three-tier visibility setting, contact details are never published, and messaging requires mutual interest.',
  },
  'shia-matrimony-houston': {
    h1: 'Shia matrimony in Houston',
    more: 'Shia matrimonial profiles in Houston and across Texas, searchable by city, plus sect, marja and practice. A large and diverse Shiite community, which is exactly why filtering by marja and practice rather than assuming similarity is worth doing. No account needed to browse public profiles.',
  },
  'shia-matrimony-new-york': {
    h1: 'Shia matrimony in New York',
    more: 'Shia matrimonial profiles in New York and across the state, searchable by city, plus sect, marja and practice. Photo privacy and mutual-interest messaging are enforced server-side, so a locked photo is never delivered to your browser at all.',
  },
  'nikah-checklist': {
    h1: 'A checklist for preparing for nikah',
    more: 'A practical list of what to have ready: identification for everyone attending as witness, the agreed mahr, the wali arrangements confirmed in advance, and a clear understanding of who is witnessing and in which order. Most nikah problems are administrative rather than theological; they come from not having agreed something in advance that everyone then assumed the other side had handled.',
  },
  'duas-for-marriage': {
    h1: 'Duas and supplications for marriage',
    more: 'Supplications to read before nikah, for the couple and for their families. The duas recited for marriage are well established and are part of the nikah itself rather than something added to it. Religious practice is personal, and the structured fields on a profile exist so families can state what they follow rather than infer it.',
  },
  'shia-matrimony-dearborn': {
    h1: 'Shia matrimony in Dearborn and Detroit',
    more: 'Dearborn holds one of the densest Shia Muslim populations in the United States, yet families tend to search inside their own sub-community and miss compatible matches nearby. Structured search across the whole metro — by marja, practice, language and background — with wali involvement and photo privacy throughout.',
  },
  'shia-matrimony-dallas': {
    h1: 'Shia matrimony in Dallas–Fort Worth',
    more: 'DFW is one of the fastest-growing Shia communities in America, but its sprawl works against rishta. One search across the entire metroplex — verified profiles, marja and practice filters, wali-involved introductions — built for a young, professional community where time is scarce.',
  },
  'shia-matrimony-los-angeles': {
    h1: 'Shia matrimony in Los Angeles',
    more: 'LA has one of the most diverse Shia communities in the country, spread across an unforgiving geography. Search all of Southern California in one place — Persian, Arab, South Asian and convert families — with honest filters for marja, language and practice, and introductions your wali joins from the start.',
  },
  'shia-matrimony-bay-area': {
    h1: 'Shia matrimony in the San Francisco Bay Area',
    more: 'A small, accomplished, scattered community where discretion is a requirement, not a luxury. Verified profiles across the Bay Area with photo privacy enforced server-side — locked photos are never delivered to the browser — and efficient, guardian-visible search for demanding schedules.',
  },
  'shia-matrimony-atlanta': {
    h1: 'Shia matrimony in Atlanta',
    more: 'Atlanta\u2019s Shia community is growing fast, full of transplants whose rishta networks are still back in the old city. Search Atlanta and Georgia while staying connected to family elsewhere — wali workflows span time zones, and family-to-family introductions work across continents.',
  },
  'shia-matrimony-seattle': {
    h1: 'Shia matrimony in Seattle',
    more: 'A small, young community where the local rishta pool can feel like a dozen families you already know. Widen the search to the Pacific Northwest and nationwide while keeping small-community discretion — photo privacy, mutual-interest messaging, and structured long-distance courtship.',
  },
  'shiamatch-alternative': {
    h1: 'Looking for a ShiaMatch alternative?',
    more: 'ShiaMatch has served the community for years, but its homepage states it is free except for men residing in the USA, UK, or Canada. ShiaRishta is the free alternative: no country-based charges, photo and ID verification badges, a free biodata maker families can share on WhatsApp, matchmaker accounts, and modern iOS and Android apps.',
  },
};

export function landingRouteSeo(meta = {}) {
  const out = {};
  for (const slug of Object.keys(LANDING_BODY)) {
    const body = LANDING_BODY[slug];
    const m = meta[slug] || {};
    out['/' + slug] = {
      title: m.title || body.h1,
      desc: m.desc || body.h1,
      h1: body.h1,
      lede: m.desc || body.h1,
      sections: [{ h2: 'What this covers', p: [body.more] }],
      faq: [],
    };
  }
  return out;
}

export const LANDING_SLUGS = Object.keys(LANDING_BODY);