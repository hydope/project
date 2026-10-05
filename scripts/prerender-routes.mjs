/**
 * Build-time per-route prerendering.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * This is a client-rendered SPA behind an Apache fallback, so EVERY route used
 * to serve one identical index.html. A static shell was later added for
 * crawlers that never execute JavaScript, but it carried the HOMEPAGE's H1,
 * title and copy — so /privacy was served a document that confidently claimed
 * to be the homepage. That is worse than serving nothing: a crawler learns the
 * wrong thing, and a privacy page with an unrelated H1 reads as duplicate
 * content.
 *
 * The fix must be per-route and must happen at build time, because the crawler
 * that needs it will never run the JavaScript that would otherwise fill it in.
 *
 * ── The subtle failure this guards against ──────────────────────────────────
 * Apache's fallback is `RewriteCond %{REQUEST_FILENAME} !-d`, so /privacy
 * reaches the fallback ONLY because no such directory exists. Once this script
 * creates dist/privacy/, the request resolves to a real directory and Apache
 * serves its index.html. That is the goal — but it means the directory must
 * contain a usable document or the route breaks, and it means no trailing-slash
 * redirect is added for free. Both are asserted by the tests, not assumed.
 *
 * Run after `vite build`. Copying the built homepage's <head> (rather than
 * hand-writing tags) guarantees the hashed asset graph, modulepreload hints and
 * font links stay identical to what Vite actually emitted.
 */
import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ROUTE_SEO, SHARED_NAV, SITE_URL } from '../src/data/routeSeo.js';
import { landingRouteSeo } from '../src/data/landingRouteSeo.js';
import { CITIES, COUNTRIES, locationRouteSeo } from '../src/data/locationSeo.js';
import { readFileSync } from 'fs';
import { fileURLToPath as __f2u } from 'url';
import { LANDING_PAGE_META } from '../src/pages/landing/landingPageMeta.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIST = join(ROOT, 'dist');

/** Escape for HTML text and double-quoted attribute contexts. */
const esc = (s = '') =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const attr = esc;

// Landing pages merged into the core routes. Before this they served the homepage
// document, canonical tag included, which told Google to index each of them AS the
// homepage - so none of the 14 could rank for their own keywords.
// Location pages come from a committed snapshot of REAL member locations
// (scripts/snapshot-locations.mjs), not from anything a member typed at signup.
const SNAP = JSON.parse(
  readFileSync(join(__dirname, '..', 'src', 'data', 'locationSnapshot.json'), 'utf8'),
);
const WITH_MEMBERS = {
  cities: CITIES.filter((c) => SNAP.cities[c.slug]).map((c) => ({ ...c, count: SNAP.cities[c.slug] })),
  countries: COUNTRIES.filter((c) => SNAP.countries[c.slug]).map((c) => ({ ...c, count: SNAP.countries[c.slug] })),
};
const ALL = {
  ...ROUTE_SEO,
  ...landingRouteSeo(LANDING_PAGE_META),
  ...locationRouteSeo(WITH_MEMBERS),
  '/locations': { title: 'Shia Matrimony by City & Country | Shia Rishta', desc: 'Find Shia matrimonial profiles by city or country. Browse verified Shia rishta in Karachi, London, Toronto, Dubai and more. Free to browse.', h1: 'Shia matrimony by location', lede: 'Find Shia matrimonial profiles by city or country. Every location listed has members on Shia Rishta today, and each page links to live, filtered results.', sections: [{ h2: 'Where are members?', p: ['This directory lists only locations that currently have at least one member. Nothing is listed speculatively: a city with no profiles does not get a page, because an empty location page is thin content rather than useful information.', 'Where a location is not listed, nobody on the platform lives there yet.'] }], faq: [] },
};

/**
 * BreadcrumbList for a route. Only real routes appear, and the homepage has
 * none (a breadcrumb pointing at itself is noise).
 */
function breadcrumbJsonLd(pathname) {
  if (pathname === '/') return null;
  const segs = pathname.split('/').filter(Boolean);
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
      ...segs.map((s, i) => ({
        '@type': 'ListItem',
        position: i + 2,
        name: s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        item: `${SITE_URL}/${segs.slice(0, i + 1).join('/')}`,
      })),
    ],
  };
}

/**
 * FAQPage for a route that declares `faq`.
 *
 * Only emitted when the route has a faq array, and those answers are the same
 * strings rendered as visible <h3>/<p> below, so the structured data always
 * matches on-page copy. Google requires that, and inventing questions nobody on
 * the page answers would be both useless and a policy risk.
 */
function faqJsonLd(route) {
  const meta = ALL[route];
  if (!meta?.faq?.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: meta.faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

/** Organization node, plus the same SearchAction sitelinks box Seo.jsx emits. */
function websiteNode() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    url: `${SITE_URL}/`,
    name: 'Shia Rishta',
    publisher: { '@id': `${SITE_URL}/#organization` },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/profiles?search={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: 'Shia Rishta',
    url: `${SITE_URL}/`,
    description:
      'A nikah-first Shia matrimony platform for serious families, with privacy-protected profiles and wali-supported introductions.',
    areaServed: 'Worldwide',
    knowsAbout: ['Shia Islam', 'Nikah', 'Islamic marriage', 'Wali', 'Matrimony'],
  };
}

/**
 * The /locations hub body.
 *
 * Its entire job is to link every location page. Before it existed, all 14 were
 * orphans: present in the sitemap with unique metadata, and reachable from
 * nothing. A sitemap entry is a hint to a crawler, not a discovery path.
 */
function locationsHubHtml() {
  const parts = ['<article class="seo-section">', '<h2>Cities</h2>', '<ul>'];
  for (const c of WITH_MEMBERS.cities) {
    parts.push(
      `<li><a href="${SITE_URL}/city/${c.slug}">Shia matrimony in ${esc(c.name)}</a>` +
      ` — <a href="${SITE_URL}/profiles?city=${encodeURIComponent(c.name)}">browse profiles in ${esc(c.name)}</a></li>`
    );
  }
  parts.push('</ul>', '</article>');

  parts.push('<article class="seo-section">', '<h2>Countries</h2>', '<ul>');
  for (const k of WITH_MEMBERS.countries) {
    parts.push(
      `<li><a href="${SITE_URL}/country/${k.slug}">Shia matrimony in ${esc(k.name)}</a>` +
      ` — <a href="${SITE_URL}/profiles?country=${encodeURIComponent(k.name)}">browse profiles in ${esc(k.name)}</a></li>`
    );
  }
  parts.push('</ul>', '</article>');

  // Grouped by country, so the hub also answers "where are people?"
  parts.push('<article class="seo-section">', '<h2>Locations grouped by country</h2>');
  for (const k of WITH_MEMBERS.countries) {
    const inCountry = WITH_MEMBERS.cities.filter((x) => x.countrySlug === k.slug);
    if (!inCountry.length) continue;
    parts.push(`<h3><a href="${SITE_URL}/country/${k.slug}">${esc(k.name)}</a></h3>`, '<ul>');
    for (const x of inCountry) {
      parts.push(`<li><a href="${SITE_URL}/city/${x.slug}">${esc(x.name)}</a></li>`);
    }
    parts.push('</ul>');
  }
  parts.push('</article>');

  // Contextual links to the money pages. A hub that only links siblings is a
  // directory; one that also routes visitors onward is a funnel.
  parts.push(
    '<article class="seo-section">',
    '<h2>Before you search</h2>',
    '<p>Photos are private by default: a member can show photos to everyone, only to people they have mutual interest with, or only to matches. Contact details are never published, and a conversation opens only after interest is mutual from both sides. Browsing is free and needs no account.</p>',
    `<p>Looking for something specific? Try <a href="${SITE_URL}/syed-rishta">Syed rishta</a>, <a href="${SITE_URL}/shia-nikah">what nikah involves</a>, or the <a href="${SITE_URL}/profile-guide">profile guide</a>.</p>`,
    '</article>'
  );

  return parts.join('\n');
}

/** The no-JS body: this route's own copy, never another route's. */
function renderBody(meta, route) {
  const parts = [];

  // Landmarks first. A crawler — and an AI assistant asked to summarise or cite
  // this page — needs to know which part is the navigation, which is the
  // content, and which is boilerplate. Without <main> the whole document reads
  // as an undifferentiated blob, and "the article" is genuinely ambiguous.
  parts.push('<header><nav aria-label="Main"><ul>');
  for (const item of SHARED_NAV) {
    parts.push(`<li><a href="${attr(item.href)}">${esc(item.label)}</a></li>`);
  }
  parts.push('</ul></nav></header>');

  parts.push('<main id="main-content">');

  // The hero lives in the shell, not only in React.
  //
  // LCP is recorded when the largest contentful element paints. With the shell
  // carrying only text, the app's hero became the LCP element — and it cannot
  // paint until 102KB of critical JS has downloaded, parsed and executed. That
  // is what put LCP at ~4.3s on a throttled connection.
  //
  // Putting the same hero image and headline into the shell makes the LCP
  // candidate paint at first paint (~1.9s) instead. The image is preloaded in
  // index.html with fetchpriority=high, and width/height are declared so the
  // box is reserved and nothing reflows when the real hero arrives.
  //
  // It also cuts CLS, because the prerendered first screen and the app's first
  // screen now occupy roughly the same space. The badges are omitted here on
  // purpose: they are decorative, and reproducing them would re-introduce the
  // entrance animation that was itself an LCP contributor.
  parts.push(
    '<section class="seo-hero">',
    '<div class="seo-hero-copy">',
    `<h1>${esc(meta.h1)}</h1>`,
    `<p>${esc(meta.lede)}</p>`,
    '<p class="seo-cta">',
    `<a class="seo-btn" href="${SITE_URL}/profiles">Browse profiles</a>`,
    `<a class="seo-btn-ghost" href="${SITE_URL}/auth/register">Create free account</a>`,
    '</p>',
    '</div>',
    '<img class="seo-hero-img" src="/hero-nikah.webp" alt="Nikah celebration" ' +
      'width="1200" height="800" decoding="async" fetchpriority="high" />',
    '</section>',
  );

  if (meta.price) {
    parts.push(
      '<p class="seo-price">Free to join. There is no payment system today and no paid tier ' +
        'is required to browse, express interest, message a match, or use the guardian tools.</p>',
    );
  }

  for (const section of meta.sections || []) {
    // Each section is an <article>: a crawler (and an assistant asked "what does
    // this page say about photo privacy?") can then point at a specific section
    // instead of quoting the whole document. It also gives the page real
    // structure rather than one undifferentiated run of headings and <p>.
    parts.push('<article class="seo-section">');
    parts.push(`<h2>${esc(section.h2)}</h2>`);
    // `p` may be a string or an array of paragraphs. It only ever accepted a
    // string, so every second and third paragraph written in routeSeo.js was
    // silently dropped at prerender — the copy existed but never reached the
    // page, which is why measured word count sat near 527 no matter how much was
    // written.
    const paras = Array.isArray(section.p)
      ? section.p
      : section.p
        ? [section.p]
        : [];
    for (const para of paras) parts.push(`<p>${esc(para)}</p>`);
    for (const step of section.steps || []) {
      parts.push(`<h3>${esc(step.h3)}</h3>`);
      const stepParas = Array.isArray(step.p) ? step.p : [step.p];
      for (const para of stepParas) parts.push(`<p>${esc(para)}</p>`);
    }
    parts.push('</article>');
  }

  // The FAQ block is rendered from meta.faq, the SAME array the FAQPage schema
  // is generated from. Writing the questions twice meant the structured data
  // could describe text that was no longer on the page, which is exactly what
  // Google penalises.
  if (meta.faq?.length) {
    parts.push('<h2>Frequently Asked Questions</h2>');
    for (const f of meta.faq) {
      parts.push(`<article class="seo-faq-item">`);
      parts.push(`<h3>${esc(f.q)}</h3>`);
      parts.push(`<p>${esc(f.a)}</p>`);
      parts.push('</article>');
    }
  }

  // Location pages must lead to LIVE results, not a static dead end. A page
  // saying "browse Shia profiles in Toronto" and then showing one hardcoded
  // paragraph is exactly the thin-page pattern these pages exist to avoid.
  // The /locations hub links every location page, so none of them is an orphan.
  if (route === '/locations') {
    parts.push(locationsHubHtml());
  }
  if (meta.liveFilter) {
    parts.push(
      '<p class="seo-cta"><a class="seo-btn" href="' + SITE_URL + meta.liveFilter + '">' +
        'View profiles filtered to this location</a></p>'
    );
  }

  parts.push('</main>');

  parts.push(
    '<h2>Contact</h2>' +
      '<p>Questions, privacy requests or takedown requests go through our ' +
      '<a href="/contact">contact form</a>, which reaches the operations team directly.</p>',
  );
  parts.push(
    '<footer><p>' +
      '<a href="/privacy">Privacy policy</a> &middot; ' +
      '<a href="/terms">Terms of use</a> &middot; ' +
      '<a href="/safety">Safety</a> &middot; ' +
      '<a href="/contact">Contact</a>' +
      '</p></footer>',
  );

  return parts.join('\n');
}

/**
 * Build one route's document by rewriting the built homepage's head, so the
 * asset graph (hashed filenames, modulepreload hints, font links) is guaranteed
 * identical to what Vite produced. Hand-writing the tags would silently drift
 * the first time Vite changed its output.
 */
async function buildRouteHtml(route, meta, baseHtml) {
  const canonical = `${SITE_URL}${route === '/' ? '/' : route}`;
  const nodes = [
    organizationJsonLd(),
    websiteNode(),
    breadcrumbJsonLd(route),
    faqJsonLd(route),
  ].filter(Boolean);

  let html = baseHtml;

  // Each replacement is anchored on the exact homepage tag so a title that also
  // appears inside a description cannot be rewritten by accident.
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(meta.title)}</title>`);
  html = html.replace(
    /<meta name="description" content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${attr(meta.desc)}" />`,
  );
  html = html.replace(
    /<link rel="canonical" href="[^"]*"\s*\/?>/,
    `<link rel="canonical" href="${attr(canonical)}" />`,
  );
  // Robots directive. Seo.jsx sets this at runtime on every navigation, but a
  // crawler that does not execute JS saw NO directive at all, which an audit
  // correctly reported as "robots meta not specified". Static is the only
  // version most crawlers ever read, so it must be in the served document.
  if (!/<meta name="robots"/.test(html)) {
    html = html.replace(
      /(<link rel="canonical"[^>]*\/?>)/,
      '$1\n    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />',
    );
  }

  html = html.replace(
    /<meta property="og:title" content="[^"]*"\s*\/?>/,
    `<meta property="og:title" content="${attr(meta.title)}" />`,
  );
  html = html.replace(
    /<meta property="og:description" content="[^"]*"\s*\/?>/,
    `<meta property="og:description" content="${attr(meta.desc)}" />`,
  );
  html = html.replace(
    /<meta property="og:url" content="[^"]*"\s*\/?>/,
    `<meta property="og:url" content="${attr(canonical)}" />`,
  );
  html = html.replace(
    /<meta name="twitter:title" content="[^"]*"\s*\/?>/,
    `<meta name="twitter:title" content="${attr(meta.title)}" />`,
  );
  html = html.replace(
    /<meta name="twitter:description" content="[^"]*"\s*\/?>/,
    `<meta name="twitter:description" content="${attr(meta.desc)}" />`,
  );

  // Replace the homepage graph so this route advertises itself, not the root.
  html = html.replace(
    /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
    `<script type="application/ld+json">${JSON.stringify(
      nodes.length === 1 ? nodes[0] : { '@graph': nodes },
    )}</script>`,
  );

  // Swap the body wholesale: the homepage's own shell is discarded, so the
  // served document contains ONLY this route's content. That is the whole point.
  //
  // Matched against the real `<body>` element, NOT the literal text `<div id="root">`
  // — the explanatory comment in index.html contains that exact string, and
  // matching the first occurrence rewrote the comment instead of the document.
  //
  // The module script is captured and re-emitted. It lives inside <body>, so a
  // naive whole-body replacement deletes it and the SPA never boots — a silent
  // total failure that would look like "the site just doesn't load".
  html = html.replace(
    /<body([^>]*)>([\s\S]*?)<\/body>/,
    (match, bodyAttrs, inner) => {
      const scripts = inner.match(/<script[\s\S]*?<\/script>/g) || [];
      return (
        `<body${bodyAttrs}>\n` +
        `    <div id="root"><div class="seo-static">\n${renderBody(meta, route)}\n    </div></div>\n` +
        `    ${scripts.join('\n    ')}\n` +
        `  </body>`
      );
    },
  );

  return html;
}

async function main() {
  const indexPath = join(DIST, 'index.html');
  if (!existsSync(indexPath)) {
    throw new Error('dist/index.html not found — run `vite build` before prerendering.');
  }
  const baseHtml = await readFile(indexPath, 'utf8');

  const routes = Object.keys(ALL);
  let written = 0;

  for (const route of routes) {
    const meta = ALL[route];
    if (!meta.h1) {
      throw new Error(
        `route ${route} has no h1 — a prerendered page without one is the exact defect being fixed.`,
      );
    }
    const html = await buildRouteHtml(route, meta, baseHtml);

    if (route === '/') {
      await writeFile(indexPath, html, 'utf8');
    } else {
      const dir = join(DIST, route.replace(/^\//, ''));
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'index.html'), html, 'utf8');
    }
    written++;
  }

  // Verify the swap actually happened rather than assuming the regex matched.
  // A silent regex miss here would ship the homepage's H1 on every route —
  // precisely the bug this script exists to remove.
  const verify = await readFile(join(DIST, 'privacy', 'index.html'), 'utf8');
  if (!verify.includes('<h1>Privacy Policy</h1>')) {
    throw new Error('prerender produced /privacy without its own H1 — the body swap failed.');
  }
  if (verify.includes('nikah-first Shia matrimony</h1>')) {
    throw new Error('/privacy still contains the homepage H1 — duplicate content bug.');
  }
  if (!verify.includes('rel="canonical" href="https://shiarishta.com/privacy"')) {
    throw new Error('/privacy canonical was not rewritten.');
  }

  const dirs = (await readdir(DIST, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && existsSync(join(DIST, d.name, 'index.html')))
    .map((d) => `/${d.name}`);

  console.log(`prerendered ${written} routes: ${routes.join(' ')}`);
  console.log(`directories now on disk: ${dirs.join(' ')}`);
}

main().catch((err) => {
  console.error(`prerender failed: ${err.message}`);
  process.exit(1);
});