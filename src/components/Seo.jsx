import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView, beaconPageView } from '../lib/analytics.js';

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Per-route SEO for the SPA. index.html ships the homepage <head>; this
// component keeps document.title, meta description, robots, canonical, and
// social tags in sync on every client-side navigation so crawlers and link
// unfurlers see a real page per route instead of one duplicated shell.
//
// Public marketing routes: indexable with keyword-targeted copy.
// Auth / member / admin / token routes: noindex (private by design).
// Unknown routes (NotFound): noindex.
//
// The resolver and its data tables live in lib/seoResolve.js, loaded as a
// lazy chunk (2026-11-12, speed batch): they were ~110 KB of the entry
// bundle's source. The import starts at module scope so it downloads in
// parallel with first paint; prerendered HTML already carries the correct
// meta for the initial page, and navigations apply meta as soon as the
// chunk resolves (instant once warm).
// ─────────────────────────────────────────────────────────────────────────────────────
let seoResolvePromise = null;
function loadSeoResolve() {
  if (!seoResolvePromise) {
    seoResolvePromise = import('../lib/seoResolve.js').catch(() => null);
  }
  return seoResolvePromise;
}
loadSeoResolve();

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

// Tracks whether the initial full-page-load page_view (fired automatically by
// the gtag config in index.html) has already happened, so the SPA only sends
// manual page_view events on client-side navigations.
let seoFirstPageViewDone = false;

export default function Seo() {
  const { pathname } = useLocation();

  useEffect(() => {
    // First-page flag flips synchronously so the counting semantics hold
    // even if the resolver chunk is still in flight (or failed): the
    // gtag config in index.html already fired the automatic page_view
    // for the full page load, so only client-side navigations fire here.
    const isFirstPageView = !seoFirstPageViewDone;
    seoFirstPageViewDone = true;

    let live = true;
    loadSeoResolve().then((m) => {
      if (!live || !m) return;
      const meta = m.resolveMeta(pathname);
      const canonical = m.canonicalFor(pathname);

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
        upsertJsonLd(m.buildJsonLd(pathname));
      } else {
        document.getElementById('shia-rishta-jsonld')?.remove();
      }

      if (!isFirstPageView) trackPageView(pathname, meta.title);
    });

    // First-party SEO analytics beacon — every page view, including the
    // first. Fire-and-forget; never blocks rendering.
    beaconPageView(pathname);
    return () => { live = false; };
  }, [pathname]);

  return null;
}


