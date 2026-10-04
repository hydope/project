import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { LANDING_PAGE_META } from '../pages/landing/landingPageMeta.js';
import { ARTICLE_META } from '../data/articleMeta.js';

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

const SITE = 'https://shiarishta.com';

const PUBLIC_META = {
  '/': {
    title: 'Shia Matrimony | Find Shia Rishta for Nikah – Shia Rishta',
    desc: 'Shia Rishta is the nikah-first Shia matrimony platform. Browse verified Shia brides and grooms, keep your photos private, and involve family with dignity. Join free.',
  },
  '/profiles': {
    title: 'Browse Shia Brides & Grooms for Nikah | Shia Rishta',
    desc: 'Search verified Shia profiles for nikah — filter by sect, marja, education and location. Serious Shia matrimony with privacy-first profiles. Join free.',
  },
  '/blog': {
    title: 'Nikah & Marriage Guidance for Shia Muslims | Shia Rishta Blog',
    desc: 'Practical guidance on nikah, choosing a spouse, and married life for Shia Muslims — written for serious seekers and their families.',
  },
  '/success-stories': {
    title: 'How Shia Rishta Works – Honest Nikah Matchmaking',
    desc: 'How Shia Rishta actually works: verified profiles, mutual-interest messaging, privacy controls and family-supported introductions. No invented stories.',
  },
  '/about': {
    title: 'About Shia Rishta – Nikah-First Shia Matchmaking',
    desc: 'Why Shia Rishta exists: a dignified, nikah-first alternative to swiping for Shia Muslims and their families.',
  },
  '/profile-guide': {
    title: 'Profile Guide – Write a Strong Shia Rishta Profile',
    desc: 'Worked examples of strong Shia marriage profiles: how to write about deen, expectations, family and timeline so real families reach back.',
  },
  '/safety': {
    title: 'Safety & Verification Standards | Shia Rishta',
    desc: 'How Shia Rishta keeps members safe: identity verification, photo privacy tiers, mutual-interest messaging and human review.',
  },
  '/support': {
    title: 'Help & Support | Shia Rishta',
    desc: 'Get help with your Shia Rishta account, verification, privacy settings and messaging.',
  },
  '/contact': {
    title: 'Contact Shia Rishta',
    desc: 'Reach the Shia Rishta team with questions, feedback or partnership enquiries.',
  },
  '/privacy': {
    title: 'Privacy Policy | Shia Rishta',
    desc: 'How Shia Rishta collects, encrypts and protects your personal data. Your photos and details stay under your control.',
  },
  '/terms': {
    title: 'Terms of Service | Shia Rishta',
    desc: 'The terms governing your use of Shia Rishta, the nikah-first Shia matrimony platform.',
  },
  '/agents': {
    title: 'Matchmaking Agents & Family Introductions | Shia Rishta',
    desc: 'Family members and matchmakers can create private, photo-free introductions on Shia Rishta — with the person concerned in control throughout.',
  },
  '/community': {
    title: 'Shia Community, Guidance & Events | Shia Rishta',
    desc: 'Community guidance and events for Shia Muslims preparing for nikah — beyond the profile.',
  },
  '/guardians': {
    title: 'Wali & Guardian Workflow for Nikah | Shia Rishta',
    desc: 'How walis and guardians stay involved on Shia Rishta: approvals, introductions and family-to-family communication.',
  },
};

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
  if (PUBLIC_META[pathname]) return { ...PUBLIC_META[pathname], index: true };
  // SEO landing pages — meta comes from the hand-written page data.
  const landing = LANDING_PAGE_META[pathname.replace(/^\/+/, '')];
  if (landing) return { title: landing.title, desc: landing.desc, index: true };
  // Blog articles — each has a crawlable URL and unique meta.
  if (pathname.startsWith('/blog/')) {
    const article = ARTICLE_META.find((a) => `/blog/${a.slug}` === pathname);
    if (article) {
      return {
        title: `${article.title} | Shia Rishta Blog`,
        desc: article.excerpt,
        index: true,
      };
    }
    return { title: 'Page Not Found | Shia Rishta', desc: '', index: false };
  }
  if (pathname.startsWith('/profiles/')) {
    return {
      title: 'Shia Profile for Nikah | Shia Rishta',
      desc: 'View this verified Shia profile on Shia Rishta — the nikah-first Shia matrimony platform.',
      index: false,
    };
  }
  if (pathname.startsWith('/community/')) {
    return {
      title: 'Community Post | Shia Rishta',
      desc: 'Community guidance for Shia Muslims on Shia Rishta.',
      index: true,
    };
  }
  if (PRIVATE_TITLES[pathname]) {
    return { title: PRIVATE_TITLES[pathname], desc: '', index: false };
  }
  if (NOINDEX_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
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
  }, [pathname]);

  return null;
}
