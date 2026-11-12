// ────────────────────────────────────────────────────────────────────────────
// Route meta resolution — split out of components/Seo.jsx (2026-11-12,
// speed batch) so the SEO data tables (route map, landing-page meta,
// location lists, tag-page builder) ship as a lazy chunk loaded after
// first paint instead of inflating the entry bundle. Seo.jsx starts the
// import at module scope, so the data is normally warm before the first
// client-side navigation; prerendered HTML already carries the correct
// meta for the initial page either way. The prerenderer
// (scripts/prerender-routes.mjs) reads the same data modules directly
// and is unaffected.
// ──────────────────────────────────────────────────────────────────────────────────
import { LANDING_PAGE_META } from '../pages/landing/landingPageMeta.js';
import { buildTagLandingPages } from '../data/tagLandingPages.js';
import { ARTICLE_META } from '../data/articleMeta.js';
import { CITIES, COUNTRIES, locationMetaDesc } from '../data/locationSeo.js';
import { ROUTE_SEO, SITE_URL } from '../data/routeSeo.js';
import { SOCIAL_LINKS } from '../data/socialLinks.js';

// SITE comes from routeSeo.js so the prerenderer and the runtime agree on the host.
const SITE = SITE_URL;

// Per-route title/description/h1/body copy now lives in src/data/routeSeo.js so that
// this component and the build-time prerenderer (scripts/prerender-routes.mjs) cannot
// disagree about what a route is called. See that file for the full explanation.
const PUBLIC_META = ROUTE_SEO;


// Prefixes that are private even though the path is public-shaped.
// Matched on segment boundaries so /profile never catches /profiles.
const NOINDEX_PREFIXES = [
  '/auth', '/dashboard', '/messages', '/onboard', '/profile', '/settings',
  '/drafts', '/verify', '/wali', '/claim', '/admin', '/login', '/signup', '/signin',
];

// Known private routes that deserve a real title (not the 404 one).
const PRIVATE_TITLES = {
  '/auth/login': 'Log in | Shia Rishta',
  '/auth/register': 'Create Your Free Account | Shia Rishta',
  '/auth/forgot': 'Reset Your Password | Shia Rishta',
  '/auth/reset': 'Set a New Password | Shia Rishta',
  '/verify-email': 'Verify Your Email | Shia Rishta',
  '/login': 'Log in | Shia Rishta',
  '/signup': 'Create Your Free Account | Shia Rishta',
  '/signin': 'Log in | Shia Rishta',
  '/dashboard': 'Your Dashboard | Shia Rishta',
  '/messages': 'Your Messages | Shia Rishta',
  '/onboard': 'Complete Your Profile | Shia Rishta',
  '/settings': 'Settings | Shia Rishta',
  '/favorites': 'Your Favorites | Shia Rishta',
  '/admin': 'Admin Dashboard | Shia Rishta',
  '/admin/content': 'Blog & Content | Shia Rishta Admin',
  '/admin/members': 'Members | Shia Rishta Admin',
  '/admin/deleted-profiles': 'Deleted Profiles | Shia Rishta Admin',
  '/admin/moderation': 'Moderation | Shia Rishta Admin',
  '/admin/biodata': 'Biodata Maker | Shia Rishta Admin',
  '/admin/verifications': 'Verifications | Shia Rishta Admin',
};

// Memoized lookup for programmatic tag landing pages (12 tags × places).
// Built once — 276 small objects — so resolveMeta stays cheap on navigation.
let TAG_LANDING_PAGES = null;
function getTagLandingPage(slug) {
  if (!TAG_LANDING_PAGES) TAG_LANDING_PAGES = buildTagLandingPages();
  return TAG_LANDING_PAGES[slug] || null;
}

// Display name from a location slug — the same derivation CityPage uses
// (hyphens to spaces, title-case each word).
function displayNameFromSlug(slug) {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function resolveMeta(pathname) {
  // Trailing-slash normalization: /blog/ must resolve exactly like /blog.
  // Without this, /blog/ fell into the /blog/ article branch, matched no
  // article, and the tab showed "Page Not Found".
  const path = pathname.replace(/\/+$/, '') || '/';
  if (PUBLIC_META[path]) return { ...PUBLIC_META[path], index: true };
  // SEO landing pages — meta comes from the hand-written page data.
  const slug = path.replace(/^\/+/, '');
  const landing = LANDING_PAGE_META[slug];
  if (landing) return { title: landing.title, desc: landing.desc, index: true };
  // Programmatic tag landing pages (12 tags × profile cities/countries).
  // Without this, all 276 generated pages fell through to "Page Not Found"
  // with noindex — silently deindexing the entire programmatic SEO surface
  // the moment the SPA booted (the prerendered HTML was correct).
  const tagPage = getTagLandingPage(slug);
  if (tagPage) return { title: tagPage.title, desc: tagPage.desc, index: true };
  // Blog articles — each has a crawlable URL and unique meta.
  if (path.startsWith('/blog/')) {
    const article = ARTICLE_META.find((a) => `/blog/${a.slug}` === path);
    if (article) {
      return {
        title: `${article.title} | Shia Rishta Blog`,
        desc: article.excerpt,
        index: true,
      };
    }
    // New posts from the blog engine are published via the API and never land
    // in the static ARTICLE_META list. Noindexing them here hid every new post
    // from Google (Search Console: "Excluded by 'noindex' tag"). Default any
    // /blog/<slug> to indexable — BlogPost renders its own not-found state for
    // genuinely bad slugs.
    const slug = path.slice('/blog/'.length);
    if (slug && !slug.includes('/')) {
      const pretty = slug
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      return {
        title: `${pretty} | Shia Rishta Blog`,
        desc: 'Shia matrimony guidance on Shia Rishta — the nikah-first Shia matchmaking platform.',
        index: true,
      };
    }
    return { title: 'Page Not Found | Shia Rishta', desc: '', index: false };
  }
  if (path.startsWith('/profiles/')) {
    return {
      title: 'Shia Profile for Nikah | Shia Rishta',
      desc: 'View this Shia profile on Shia Rishta — the nikah-first Shia matrimony platform.',
      index: true,
    };
  }
  if (path.startsWith('/community/')) {
    return {
      title: 'Community Post | Shia Rishta',
      desc: 'Community guidance for Shia Muslims on Shia Rishta.',
      index: true,
    };
  }
  // Location pages — curated AND dynamic (2026-11-09, Syed's call: any city
  // or country with real profiles gets a page, and it is indexable). Curated
  // slugs keep their exact meta. A non-curated slug gets the same template
  // built from the slug's display name. The page component still 404s for a
  // slug with no profiles at all, so a junk slug gets indexable meta but
  // NotFound content — a soft 404 Google will not index, the same pattern
  // as /blog/<slug> above. The sitemap only lists slugs with real profiles,
  // so crawlers discover the real pages, not the junk ones.
  if (path.startsWith('/city/')) {
    const city = CITIES.find((c) => `/city/${c.slug}` === path);
    if (city) {
      return {
        title: `Shia Matrimony in ${city.name} | Shia Rishta & Matchmaking`,
        desc: locationMetaDesc(city.name, city.note),
        index: true,
      };
    }
    const name = displayNameFromSlug(path.slice('/city/'.length));
    return {
      title: `Shia Matrimony in ${name} | Shia Rishta & Matchmaking`,
      desc: `Browse Shia matrimonial profiles in ${name}. Privacy-first photos, mutual-interest messaging and wali-supported introductions. Free to join.`,
      index: true,
    };
  }
  if (path.startsWith('/country/')) {
    const country = COUNTRIES.find((c) => `/country/${c.slug}` === path);
    if (country) {
      return {
        title: `Shia Matrimony in ${country.name} | Free Shia Rishta Platform`,
        desc: locationMetaDesc(country.name, country.note),
        index: true,
      };
    }
    const name = displayNameFromSlug(path.slice('/country/'.length));
    return {
      title: `Shia Matrimony in ${name} | Free Shia Rishta Platform`,
      desc: `Find Shia brides and grooms in ${name}. Privacy-first profiles, wali and guardian workflows, mutual-interest messaging. Free.`,
      index: true,
    };
  }
  if (PRIVATE_TITLES[path]) {
    return { title: PRIVATE_TITLES[path], desc: '', index: false };
  }
  if (NOINDEX_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
    return { title: 'Shia Rishta', desc: '', index: false };
  }
  // Unknown route → the NotFound page.
  return { title: 'Page Not Found | Shia Rishta', desc: '', index: false };
}

function organizationNode() {
  return {
    '@type': 'Organization',
    '@id': `${SITE}/#organization`,
    name: 'Shia Rishta',
    url: SITE,
    description: 'A nikah-first Shia matrimony platform for serious families, with privacy-protected profiles and wali-supported introductions.',
    areaServed: 'Worldwide',
    knowsAbout: ['Shia Islam', 'Nikah', 'Islamic marriage', 'Wali', 'Matrimony'],
    sameAs: SOCIAL_LINKS.filter(s => s.url).map(s => s.url),
  };
}

function websiteNode() {
  return {
    '@type': 'WebSite',
    '@id': `${SITE}/#website`,
    url: SITE,
    name: 'Shia Rishta',
    publisher: { '@id': `${SITE}/#organization` },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE}/profiles?search={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/** Breadcrumbs for deep routes; the homepage deliberately has none. */
function breadcrumbNode(pathname) {
  if (pathname === '/') return null;
  const segs = pathname.split('/').filter(Boolean);
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
      ...segs.map((s, i) => ({
        '@type': 'ListItem',
        position: i + 2,
        name: s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        // The leaf item is this page itself — use its canonical form.
        item:
          i === segs.length - 1
            ? canonicalFor(pathname)
            : `${SITE}/${segs.slice(0, i + 1).join('/')}`,
      })),
    ],
  };
}

/** FAQPage only when the landing page really renders a FAQ list. */
function faqNode(pathname) {
  const faq = LANDING_PAGE_META[pathname.replace(/^\/+/, '')]?.faq;
  if (!Array.isArray(faq) || !faq.length) return null;
  return {
    '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

// The canonical URL for a route — the URL that actually serves 200.
//
// Prerendered routes are directories on disk (dist/<route>/index.html), so
// the server 301s the slash-less URL to the trailing-slash one. Their
// canonical is the trailing-slash form; anything else names a redirect,
// which is a conflicting signal (a 2026-10-20 audit found 494 of 619 sitemap
// URLs redirecting for this reason). SPA/SSR routes (/blog/<slug>,
// /profiles/<id>, /community/...) serve 200 at the slash-less URL and keep
// it. Mirrors the rule in scripts/prerender-routes.mjs — the two must agree.
function canonicalFor(pathname) {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return `${SITE}/`;
  const slug = path.replace(/^\/+/, '');
  const isPrerendered =
    Object.prototype.hasOwnProperty.call(PUBLIC_META, path) ||
    LANDING_PAGE_META[slug] != null ||
    getTagLandingPage(slug) !== null ||
    CITIES.some((c) => `/city/${c.slug}` === path) ||
    COUNTRIES.some((c) => `/country/${c.slug}` === path) ||
    // Dynamic location pages are prerendered from the live API at build time
    // (2026-11-09), so every /city/ and /country/ URL in the sitemap is a
    // directory on disk and its canonical is the trailing-slash form. A city
    // that appears between deploys is client-rendered, but its trailing-slash
    // URL still serves 200 via the SPA fallback, so the canonical stays valid.
    path.startsWith('/city/') ||
    path.startsWith('/country/');
  return isPrerendered ? `${SITE}${path}/` : `${SITE}${path}`;
}

/** All JSON-LD nodes for a route (Seo.jsx upserts them into the head). */
export function buildJsonLd(pathname) {
  return [organizationNode(), websiteNode(), breadcrumbNode(pathname), faqNode(pathname)];
}

export { resolveMeta, canonicalFor };
