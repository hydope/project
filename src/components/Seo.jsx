import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { LANDING_PAGE_META } from '../pages/landing/landingPageMeta.js';
import { ARTICLE_META } from '../data/articleMeta.js';
import { ROUTE_SEO, SITE_URL } from '../data/routeSeo.js';
import { SOCIAL_LINKS } from '../data/socialLinks.js';
import { trackPageView, beaconPageView } from '../lib/analytics.js';

// ─────────────────────────────────────────────────────────────────────────────
// Per-route SEO for the SPA. index.html ships the homepage <head>; this
// component keeps document.title, meta description, robots, canonical, and
// social tags in sync on every client-side navigation so crawlers and link
// unfurlers see a real page per route instead of one duplicated shell.
//
// Public marketing routes: indexable with keyword-targeted copy.
// Auth / member / admin / token routes: noindex (private by design).
// Unknown routes (NotFound): noindex.
// ─────────────────────────────────────────────────────────────────────────────

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
  '/admin': 'Admin Dashboard | Shia Rishta',
  '/admin/content': 'Blog & Content | Shia Rishta Admin',
  '/admin/members': 'Members | Shia Rishta Admin',
  '/admin/moderation': 'Moderation | Shia Rishta Admin',
  '/admin/biodata': 'Biodata Maker | Shia Rishta Admin',
  '/admin/verifications': 'Verifications | Shia Rishta Admin',
};

function upsertMeta(selector, attrs) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement('meta');
    document.head.appendChild(el);
  }
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

function upsertLinkCanonical(href) {
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function resolveMeta(pathname) {
  // Trailing-slash normalization: /blog/ must resolve exactly like /blog.
  // Without this, /blog/ fell into the /blog/ article branch, matched no
  // article, and the tab showed "Page Not Found".
  const path = pathname.replace(/\/+$/, '') || '/';
  if (PUBLIC_META[path]) return { ...PUBLIC_META[path], index: true };
  // SEO landing pages — meta comes from the hand-written page data.
  const landing = LANDING_PAGE_META[path.replace(/^\/+/, '')];
  if (landing) return { title: landing.title, desc: landing.desc, index: true };
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
    return { title: 'Page Not Found | Shia Rishta', desc: '', index: false };
  }
  if (path.startsWith('/profiles/')) {
    return {
      title: 'Shia Profile for Nikah | Shia Rishta',
      desc: 'View this verified Shia profile on Shia Rishta — the nikah-first Shia matrimony platform.',
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
  if (PRIVATE_TITLES[path]) {
    return { title: PRIVATE_TITLES[path], desc: '', index: false };
  }
  if (NOINDEX_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
    return { title: 'Shia Rishta', desc: '', index: false };
  }
  // Unknown route → the NotFound page.
  return { title: 'Page Not Found | Shia Rishta', desc: '', index: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON-LD structured data.
//
// This component previously emitted meta tags and canonicals but NO structured
// data at all — the single largest missed SEO lever for this category. Without
// it Google cannot render FAQ accordions, breadcrumb trails or a sitelinks
// search box, all of which a matrimonial site is unusually well suited to.
//
// Every node is derived from the same PUBLIC_META copy the meta tags already
// carry, so it cannot drift from what the page actually says.
// ─────────────────────────────────────────────────────────────────────────────

/** Inject or replace the single JSON-LD script tag. */
function upsertJsonLd(data) {
  const graph = (Array.isArray(data) ? data : [data]).filter(Boolean);
  if (!graph.length) return;
  // Flatten into one @graph document so several node types coexist.
  const nodes = graph.flatMap((n) => (n['@graph'] ? n['@graph'] : [n]));
  let el = document.getElementById('shia-rishta-jsonld');
  if (!el) {
    el = document.createElement('script');
    el.id = 'shia-rishta-jsonld';
    el.type = 'application/ld+json';
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes });
}

/** Organization + WebSite with a real SearchAction sitelinks box. */
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
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE },
      ...segs.map((s, i) => ({
        '@type': 'ListItem',
        position: i + 2,
        name: s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        item: `${SITE}/${segs.slice(0, i + 1).join('/')}`,
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

// Tracks whether the initial full-page-load page_view (fired automatically by
// the gtag config in index.html) has already happened, so the SPA only sends
// manual page_view events on client-side navigations.
let seoFirstPageViewDone = false;

export default function Seo() {
  const { pathname } = useLocation();

  useEffect(() => {
    const meta = resolveMeta(pathname);
    const canonical = `${SITE}${pathname === '/' ? '/' : pathname.replace(/\/+$/, '')}`;

    document.title = meta.title;
    upsertMeta('meta[name="description"]', { name: 'description', content: meta.desc || meta.title });
    upsertMeta('meta[name="robots"]', {
      name: 'robots',
      content: meta.index ? 'index, follow' : 'noindex, nofollow',
    });
    upsertMeta('meta[property="og:title"]', { property: 'og:title', content: meta.title });
    upsertMeta('meta[property="og:description"]', { property: 'og:description', content: meta.desc || meta.title });
    upsertMeta('meta[property="og:url"]', { property: 'og:url', content: canonical });
    upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: meta.title });
    upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: meta.desc || meta.title });
    upsertLinkCanonical(canonical);

    // Structured data only on indexable routes — marking up a noindex page
    // invites Google to ignore the whole URL.
    if (meta.index) {
      upsertJsonLd([organizationNode(), websiteNode(), breadcrumbNode(pathname), faqNode(pathname)]);
    } else {
      document.getElementById('shia-rishta-jsonld')?.remove();
    }

    // ── Pageview tracking ──────────────────────────────────────────────
    // GA4: the gtag config in index.html already fired the automatic
    // page_view for this full page load, so only fire on client-side
    // navigations (avoids double-counting the landing page).
    if (seoFirstPageViewDone) {
      trackPageView(pathname, meta.title);
    } else {
      seoFirstPageViewDone = true;
    }
    // First-party SEO analytics beacon — every page view, including the
    // first. Fire-and-forget; never blocks rendering.
    beaconPageView(pathname);
  }, [pathname]);

  return null;
}


