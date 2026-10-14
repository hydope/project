/**
 * Verifies the build-time prerender produced DISTINCT per-route documents,
 * rather than one template copied N times.
 *
 * The failure this catches is subtle and invisible in a diff: a regex that
 * silently fails to match leaves every route serving the homepage's H1, title
 * and canonical. Every route still returns HTTP 200 and still looks fine, so
 * nothing else in the pipeline notices.
 *
 * Runs against dist/, so it tests the real build artifact — not the source.
 */
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ROUTE_SEO, SITE_URL } from '../src/data/routeSeo.js';
import { landingRouteSeo } from '../src/data/landingRouteSeo.js';
import { CITIES, COUNTRIES, locationRouteSeo } from '../src/data/locationSeo.js';
import { LANDING_PAGE_META } from '../src/pages/landing/landingPageMeta.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIST = join(__dirname, '..', 'dist');

let pass = 0;
let fail = 0;
const check = (label, ok, detail = '') => {
  if (ok) { pass++; console.log(`PASS  ${label}`); }
  else { fail++; console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
};

const pathFor = (route) =>
  route === '/' ? join(DIST, 'index.html') : join(DIST, route.slice(1), 'index.html');

const routes = Object.keys(ROUTE_SEO);

// Sitemap integrity: every URL in public/sitemap.xml must be a route this app
// actually serves. A stale entry (this repo listed /pricing after pricing was
// removed) invites a crawler to request a URL that falls through to the SPA
// shell — which then serves the HOMEPAGE's H1, recreating the exact
// duplicate-content defect the prerender exists to eliminate.
const sitemapPath = join(__dirname, '..', 'public', 'sitemap.xml');
if (existsSync(sitemapPath)) {
  const sitemap = await readFile(sitemapPath, 'utf8');
  const listed = [...sitemap.matchAll(/<loc>https:\/\/shiarishta\.com([^<]*)<\/loc>/g)].map((m) => m[1]);
  const router = await readFile(join(__dirname, '..', 'src', 'routes.jsx'), 'utf8');
  const LANDING = await readFile(join(__dirname, '..', 'src', 'pages', 'landing', 'landingPages.js'), 'utf8').catch(() => '');
  const ARTICLES = await import('../src/data/articleMeta.js')
  .then((m) => m.ARTICLE_META || [])
  .catch(() => []);

  // Every sitemap URL must be a page that actually ships. Read the SAME merged
  // manifest the prerenderer and the sitemap generator use, rather than
  // re-deriving the route set from strings — that is how 14 location pages were
  // reported as "stale" while genuinely existing.
  const SNAP = JSON.parse(
    await readFile(join(ROOT, 'src', 'data', 'locationSnapshot.json'), 'utf8'),
  );
  const ALL_LOCATIONS = {
    cities: CITIES.map((c) => ({ ...c, count: SNAP.cities[c.slug] || 0 })),
    countries: COUNTRIES.map((c) => ({ ...c, count: SNAP.countries[c.slug] || 0 })),
  };
  const SHIPPED = new Set([
    ...Object.keys({ ...ROUTE_SEO, ...landingRouteSeo(LANDING_PAGE_META), ...locationRouteSeo(ALL_LOCATIONS) })
      .map((r) => (r === '/' ? '/' : r.replace(/\/$/, ''))),
    ...ARTICLES.map((a) => `/blog/${a.slug}`),
  ]);
  const stale = listed
    .map((p) => (p.replace(/\/$/, '') || '/'))
    .filter((route) => !SHIPPED.has(route));
  check('every sitemap URL maps to a real route', stale.length === 0,
    `stale entries: ${stale.join(', ')}`);

  // Every prerendered public route should be discoverable.
  const notListed = Object.keys(ROUTE_SEO)
    .filter((r) => r !== '/' && r !== '/auth/login')
    .filter((r) => !listed.includes(r));
  check('every prerendered route is in the sitemap', notListed.length === 0,
    `missing: ${notListed.join(', ')}`);
} else {
  check('public/sitemap.xml exists', false, 'file not found');
}

// Load every document once; several checks below reuse them.
const docs = {};
for (const route of routes) {
  const p = pathFor(route);
  if (existsSync(p)) docs[route] = await readFile(p, 'utf8');
}

check('every prerendered route has a document on disk', Object.keys(docs).length === routes.length,
  routes.filter((r) => !(r in docs)).join(', '));

// ── Each document carries ITS OWN content ────────────────────────────────────
// The headline assertion: no route may serve another route's H1.
const wrongH1 = [];
const wrongTitle = [];
const wrongCanonical = [];
for (const route of routes) {
  const html = docs[route];
  if (!html) continue;
  const meta = ROUTE_SEO[route];
  const h1s = [...html.matchAll(/<h1>([\s\S]*?)<\/h1>/g)].map((m) => m[1].trim());
  if (h1s.length !== 1 || h1s[0] !== meta.h1) wrongH1.push(`${route} -> [${h1s.join(' | ')}]`);
  // Compare the DECODED title. Titles containing "&" are serialised as "&amp;",
  // so a raw substring match fails on correct output — which would train us to
  // accept an unescaped title instead.
  // A miss yields '' rather than a sparse-array hole; eslint rightly rejects
  // `|| [, '']` because the skipped slot is undefined.
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/);
  const title = titleMatch ? titleMatch[1] : '';
  const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  if (decode(title) !== meta.title) wrongTitle.push(`${route} -> "${title}"`);
  const canonical = `${SITE_URL}${route === '/' ? '/' : route}`;
  if (!html.includes(`rel="canonical" href="${canonical}"`)) wrongCanonical.push(route);
}
check('every route serves its OWN H1 (no shared template)', wrongH1.length === 0, wrongH1.join('; '));
check('every route serves its OWN <title>', wrongTitle.length === 0, wrongTitle.join(', '));
check('every route has its OWN canonical URL', wrongCanonical.length === 0, wrongCanonical.join(', '));

// ── The homepage H1 must appear on exactly one route ─────────────────────────
const homepageH1 = ROUTE_SEO['/'].h1;
const homepageCount = routes.filter((r) => docs[r]?.includes(`<h1>${homepageH1}</h1>`)).length;
check('the homepage H1 appears on exactly one route', homepageCount === 1,
  `found on ${homepageCount} routes — duplicate content`);

// ── All H1s across the site are unique ───────────────────────────────────────
const h1s = Object.values(ROUTE_SEO).map((m) => m.h1);
const dupes = [...new Set(h1s.filter((h, i) => h1s.indexOf(h) !== i))];
check('no two routes share an H1', dupes.length === 0, dupes.join(' | '));

// ── The SPA must still boot ─────────────────────────────────────────────────
// The prerenderer rewrites <body>. If it dropped or corrupted the module
// script, every page would render as static text with no working navigation —
// the exact regression the static shell is supposed to prevent.
const brokenScripts = routes.filter(
  (r) => docs[r] && !/<script[^>]*type="module"[^>]*src="\/assets\/[^"]+\.js"/.test(docs[r]),
);
check('every route still loads the SPA module', brokenScripts.length === 0, brokenScripts.join(', '));

// ── One #root per document ───────────────────────────────────────────────────
const badRoots = routes
  .filter((r) => docs[r])
  .filter((r) => (docs[r].match(/id="root"/g) || []).length !== 1)
  .map((r) => r);
check('exactly one #root per document', badRoots.length === 0, badRoots.join(', '));

// ── The shell must not be hidden by a CSS class ─────────────────────────────
// It used to be, via `.js .seo-static { display:none }`. That collapsed the
// shell to zero height the moment main.jsx set html.js, then React grew the real
// page back — two mutations, one visible jump. Measured CLS 0.275 on a
// throttled Pixel 5 before the change.
//
// React's createRoot clears #root when it mounts, so the shell is replaced in a
// single commit with no intermediate collapse. This asserts the CSS rule stays
// gone, because re-adding it would silently restore the layout shift.
const cssHidden = routes.filter((r) => docs[r] && /\.js\s+\.seo-static\s*\{[^}]*display:\s*none/.test(docs[r]));
check('no route hides the shell via a CSS class', cssHidden.length === 0, cssHidden.join(', '));
check(
    'the shell still sits inside #root so React replaces it',
  routes.every((r) => docs[r]?.includes('<div id="root"><div class="seo-static">')),
  'the shell must be the first child of #root or React cannot replace it');

// ── The hero must never be gated behind an animation ─────────────────────────
// Measured LCP was 5056ms while React mounted at 2834ms. The 2.2s gap was the
// hero sitting at opacity:0 until <Reveal>'s 2500ms backstop fired, because the
// IntersectionObserver's -70px rootMargin never intersected an above-the-fold
// block. LCP is recorded when the element actually paints, so a cosmetic
// "animation enhances, never gates" rule became the critical path.
const reveal = (await readFile(join(__dirname, '..', 'src', 'components', 'Reveal.jsx'), 'utf8'));
check('Reveal reveals content already in the viewport on mount',
  /getBoundingClientRect\(\)[\s\S]{0,400}show\(\)/.test(reveal),
  'Reveal relies solely on IntersectionObserver, so above-the-fold content can stay at opacity 0 until the backstop timer — this is what cost 2.2s of LCP');
check("Reveal's backstop timer is short enough not to gate LCP",
  !/setTimeout\(show,\s*(?:[2-9]\d{3}|[1-9]\d{4,})/.test(reveal),
  'the backstop is long enough to become the critical path for above-the-fold content');

// ── Private routes are NOT prerendered ───────────────────────────────────────
// A dist/dashboard/ directory would publish the existence of member screens and
// put a document on disk at a route that must not resolve for a signed-out user.
const leaked = ['dashboard', 'messages', 'settings', 'onboard', 'admin', 'drafts', 'wali', 'verify', 'claim']
  .filter((d) => existsSync(join(DIST, d, 'index.html')));
check('no private route was prerendered', leaked.length === 0, leaked.join(', '));

// ── Honesty: no fabricated CLAIMS anywhere in the built output ───────────────
// These must match an ASSERTION of social proof, not the mere word. /about and
// /success-stories both legitimately contain the sentence "we do not publish
// testimonials we have not been given" — flagging that would force the honest
// copy to be deleted, which is exactly backwards. So each pattern requires
// surrounding phrasing that would only appear in a real claim.
const offenders = [];
const CLAIM_PATTERNS = [
  { label: 'testimonial', re: /\b[\d,]+\+?\s+testimonials?\b/i },
  { label: 'rating', re: /\b[45](\.\d)?\s*(\/\s*5|stars?|\bout of 5\b)/i },
  { label: 'trusted by', re: /trusted by\s+\w/i },
  { label: 'member count', re: /\b[\d,]+\+?\s+(members|families|couples)\s+(have|has|joined|registered)/i },
  { label: 'happy couples', re: /\b[\d,]+\+?\s+(happy\s+)?couples\b/i },
];
for (const route of routes) {
  const html = docs[route];
  if (!html) continue;
  const body = (html.match(/<div id="root">[\s\S]*?<\/body>/) || [''])[0];
  for (const { label, re } of CLAIM_PATTERNS) {
    if (re.test(body)) offenders.push(`${route}: ${label}`);
  }
}
check('no fabricated social proof claim in any built route', offenders.length === 0, offenders.join('; '));

// The honest copy that mentions what we do NOT publish must survive — if this
// ever fails, someone deleted a disclaimer to satisfy the check above.
const disclaimerKept = routes.filter((r) => docs[r]?.includes('testimonials')).length;
check('honest disclaimers about unpublished testimonials survive', disclaimerKept >= 1,
  'the disclaimer copy was removed, leaving the claim check with nothing to guard');

// ── Each route's body is textually distinct ──────────────────────────────────
const bodies = {};
for (const route of routes) {
  if (!docs[route]) continue;
  bodies[route] = (docs[route].match(/<div id="root">([\s\S]*?)<\/body>/) || ['', ''])[1].trim();
}
const bodyValues = Object.values(bodies);
const dupBodies = [...new Set(bodyValues.filter((b, i) => bodyValues.indexOf(b) !== i))];
check('no two routes ship identical body content', dupBodies.length === 0,
  `${dupBodies.length} duplicate bodies`);

// ── Structured data: the audit found 1 JSON-LD block and no FAQPage ─────────
// An AI grader reported "Schema Types Found: 2" and zero FAQPage. Both were
// correct: the prerenderer emitted Organization plus a breadcrumb only, and the
// homepage's own FAQ copy had no machine-readable equivalent.
const homeHtml = docs['/'] || '';
check('the homepage emits FAQPage structured data', homeHtml.includes('"FAQPage"'),
  'FAQPage schema is missing — answer engines must infer the FAQ from prose');
check('every route emits a robots meta directive', routes.every((r) =>
  docs[r] && /<meta name="robots" content="[^"]*index/.test(docs[r])),
  routes.filter((r) => docs[r] && !/<meta name="robots"/.test(docs[r])).join(', '));
check('the homepage keeps its WebSite node with a SearchAction',
  homeHtml.includes('SearchAction'),
  'the WebSite sitelinks node was dropped by the prerender');

// The FAQ schema must describe text that is actually on the page. Google
// penalises marked-up questions that are not rendered.
const homeFaq = ROUTE_SEO['/'].faq || [];
const faqNotOnPage = homeFaq.filter((f) => !homeHtml.includes(`<h3>${f.q}</h3>`));
check('every FAQPage question is rendered as a visible h3', faqNotOnPage.length === 0,
  `schema describes text that is not on the page: ${faqNotOnPage.map((f) => f.q).join(' | ')}`);

const faqNotInSchema = homeFaq.filter(
  (f) => !homeHtml.includes(f.q.replace(/"/g, '\\"')),
);
check('every visible FAQ question is also in the schema', faqNotInSchema.length === 0,
  faqNotInSchema.map((f) => f.q).join(' | '));

// Meta description length: the audit flagged 165 characters, above the
// 120-160 window where snippets get truncated.
const descLens = routes.map((r) => (docs[r] ? ROUTE_SEO[r].desc.length : 0));
const tooLong = routes.filter((r, i) => descLens[i] > 160).map((r) => `${r}:${descLens[routes.indexOf(r)]}`);
check('every meta description fits the 120-160 character window', tooLong.length === 0,
  tooLong.join(', '));
const tooShort = routes.filter((r) => ROUTE_SEO[r].desc.length < 120).map((r) => r);
check('no meta description is under 120 characters', tooShort.length === 0, tooShort.join(', '));

// Every prerendered route must carry contextual internal links, not just nav.
const thinLinks = routes.filter((r) => {
  const html = docs[r];
  if (!html) return false;
  const body = (html.match(/<div id="root">[\s\S]*?<\/body>/) || [''])[0];
  return ((body.match(/href="\/(?![a-z0-9-]*\/)/g) || []).length) < 4;
});
check('every prerendered route has contextual internal links', thinLinks.length === 0,
  thinLinks.join(', '));

// ── Semantic landmarks ───────────────────────────────────────────────────────
// A rating site scored AI Readiness 2/4 and reported "no <main> or <article>
// elements". Correct for the served document: the React app has <main> in
// LandingLayout, but the prerendered shell — which is what a crawler and most AI
// assistants actually read — had none, so the whole page was one undifferentiated
// block with no way to tell navigation from content.
const noMain = routes.filter((r) => docs[r] && !/<main[\s>]/.test(docs[r]));
check('every prerendered route exposes a <main> landmark', noMain.length === 0, noMain.join(', '));
check('every prerendered route exposes an <article> landmark',
  routes.every((r) => docs[r] && /<article[\s>]/.test(docs[r])),
  routes.filter((r) => docs[r] && !/<article[\s>]/.test(docs[r])).join(', '));
const badOrder = routes.filter((r) => {
  const h = docs[r];
  if (!h) return false;
  const b = (h.match(/<body[\s\S]*?<\/body>/) || [''])[0];
  // Exactly one <main>, opening before <header> closes.
  return (b.match(/<main[\s>]/g) || []).length !== 1
    || b.indexOf('<main') < b.indexOf('</header>')
    || b.indexOf('<main') < 0;
});
check('the <main> landmark wraps the content, not the navigation', badOrder.length === 0, badOrder.join(', '));

// ── Content depth ────────────────────────────────────────────────────────────
// A review flagged the homepage at 527 words against an 800-word target. The
// copy was not missing — renderBody only ever emitted `section.p` as a single
// string, so every second and third paragraph written in routeSeo.js was
// silently dropped at prerender. `p` now accepts an array.
const wordCount = (r) => {
  const h = docs[r];
  if (!h) return 0;
  const b = (h.match(/<body[\s\S]*?<\/body>/) || [''])[0];
  return (b.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean)).length;
};
check('the homepage clears the 800-word content target',
  wordCount('/') >= 800, `${wordCount('/')} words`);
// 80 words catches a genuinely broken or near-empty prerendered page. It is
// deliberately not 250: twelve secondary routes (/terms 229, /about 205,
// /safety 217, /blog 95, /community 87 and others) are still thin, and a
// threshold they cannot meet would only train everyone to ignore the check.
// They are real remaining content work, reported per route by
// the verifier output itself, not something to paper over with a lower bar.
const thin = routes.filter((r) => wordCount(r) > 0 && wordCount(r) < 80);
check('no prerendered route is a near-empty stub', thin.length === 0,
  thin.map((r) => `/${r.slice(1)}:${wordCount(r)}`).join(', '));
const REPORT_ONLY = routes
  .filter((r) => r !== '/' && wordCount(r) < 250)
  .map((r) => `/${r.slice(1)}=${wordCount(r)}`);
if (REPORT_ONLY.length) {
  console.log(`NOTE  still thin (<250 words), content work outstanding: ${REPORT_ONLY.join(' ')}`);
}

// ── HTTPS enforcement ───────────────────────────────────────────────────────
// http://shiarishta.com/ returned 200 and served the whole page over plaintext.
// Only www redirected, and only because the www rule fired first. A network
// attacker could rewrite the HTML and the JS bundle before the browser saw them.
const htaccess = await readFile(join(__dirname, '..', 'public', '.htaccess'), 'utf8');
check('plaintext http:// is redirected to https://',
  /HTTPS\}\s*!=\s*on[\s\S]{0,200}R=301/.test(htaccess),
  'no https upgrade rule — http:// still serves the page');
check('the HTTPS rule is scoped to known hosts',
  /HTTP_HOST\}\s*\^\(?shiarishta/.test(htaccess),
  'the https upgrade does not check HTTP_HOST, so X-Forwarded-Proto would be trusted from anywhere');
check('HSTS is set so browsers stop making plaintext requests',
  /Strict-Transport-Security/.test(htaccess),
  'no HSTS header — the window between http:// and the 301 stays open to tampering');
check('canonical and og:url stay https in the built output',
  routes.every((r) => docs[r] && !docs[r].includes('http://shiarishta.com')),
  'a route still self-references over plaintext');

// ── llms.txt ─────────────────────────────────────────────────────────────────
// It was returning HTTP 200 — the SPA fallback serving index.html — so a status
// check would have passed while an agent received 13KB of HTML. Assert it is
// really a plain-text file in the build output, not a served 200.
const llmsPath = join(DIST, 'llms.txt');
const llmsExists = existsSync(llmsPath);
check('a real llms.txt ships in the build output', llmsExists, 'dist/llms.txt missing');
if (llmsExists) {
  const llms = await readFile(llmsPath, 'utf8');
  check('llms.txt is plain text, not the SPA fallback', !/<!DOCTYPE html/i.test(llms));
  check('llms.txt states what the site is', /^#\s+\S/m.test(llms));
  check('llms.txt links the public pages',
    ['/profiles', '/privacy', '/terms', '/contact'].every((p) => llms.includes(SITE_URL + p)));
  // The honesty constraint: a build-time file must not claim live figures.
  check('llms.txt invents no member count or testimonials',
    !/\b[\d,]+\+?\s+(members|families|couples|testimonials)\b/i.test(llms)
      && !/\b[45](\.\d)?\s*(\/\s*5|stars?)\b/i.test(llms),
    'llms.txt asserts a figure it cannot know at build time');
  // Every public route should be reachable from the brief.
  const missingFromLlms = Object.keys(ROUTE_SEO)
    .filter((r) => r !== '/auth/login')
    .filter((r) => !llms.includes(SITE_URL + (r === '/' ? '/' : r)));
  check('llms.txt covers every public route', missingFromLlms.length === 0, missingFromLlms.join(', '));

  // Structure. Answer engines weight About / Services / Key pages / Contact
  // above a flat URL dump, and in that order. Assert the order rather than
  // hoping a future edit keeps it.
  const headings = [...llms.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim());
  const order = ['About', 'Services', 'Key pages', 'Contact'];
  const idx = order.map((h) => headings.indexOf(h));
  check('llms.txt has About / Services / Key pages / Contact sections',
    idx.every((i) => i >= 0), `found: ${headings.join(' | ')}`);
  check('those sections appear in the order engines weight them',
    idx.every((v, i) => i === 0 || v > idx[i - 1]), `indices ${idx.join(',')}`);

  // Real topical coverage. The file previously documented only the core routes
  // and so hid 14 landing pages and 8 articles from the engines reading it.
  const landingSlugs = [
    'shia-nikah', 'shia-marriage', 'shia-brides', 'shia-grooms', 'syed-rishta',
    'shia-matrimonial', 'shia-matrimony-usa', 'shia-matrimony-london',
  ];
  const missingLanding = landingSlugs.filter((s) => !llms.includes(`${SITE_URL}/${s}`));
  check('llms.txt lists the Shia marriage / nikah landing pages', missingLanding.length === 0,
    missingLanding.join(', '));
  check('llms.txt names the core topic terms an assistant would match on',
    ['shia', 'nikah', 'matrimony', 'wali', 'marja', 'sect'].every((t) =>
      new RegExp(t, 'i').test(llms)));
  check('llms.txt lists the blog articles', llms.includes(`${SITE_URL}/blog/`),
    'articles are omitted — they are the citable long-form content');
}

// ── Freshness ────────────────────────────────────────────────────────────────
// Sitemap <lastmod> was hardcoded to 2026-09-26 and silently drifting. It is now
// derived from git, so it is a measurement rather than a claim.
const sitemapOut = join(DIST, 'sitemap.xml');
if (existsSync(sitemapOut)) {
  const sm = await readFile(sitemapOut, 'utf8');
  const dates = [...sm.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]);
  check('every sitemap entry has a lastmod', dates.length > 0 && dates.length === sm.split('<url>').length - 1);
  const stale = dates.filter((d) => {
    const age = (Date.now() - Date.parse(`${d}T00:00:00Z`)) / 86400000;
    return Number.isNaN(age) || age > 120;
  });
  check('no sitemap lastmod is older than 120 days', stale.length === 0,
    `stale: ${stale.join(', ')} — a hardcoded date drifts and nothing fails`);
} else {
  check('sitemap.xml ships in the build output', false, 'missing');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);