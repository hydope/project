import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, ChevronRight } from 'lucide-react';
import Layout from '../../layouts/LandingLayout';
import FaqSection from '../../components/FaqSection.jsx';
import NotFound from '../NotFound';

// landingPages.js holds all eight hand-written landing pages — dynamically
// imported so it ships as its own async chunk instead of bloating the
// shared entry chunk.
export default function LandingPage() {
  // NOTE: landing routes are static paths (/shia-matrimony-usa, /shia-brides,
  // …), not a :slug param — derive the slug from the pathname. (useParams
  // returns {} here; using it 404s every landing page.)
  const { pathname } = useLocation();
  const slug = pathname.replace(/^\//, '').split('/')[0];
  const [pages, setPages] = useState(null);
  useEffect(() => {
    let on = true;
    Promise.all([
      import('./landingPages.js'),
      import('../../data/tagLandingPages.js'),
    ]).then(([hand, gen]) => {
      if (!on) return;
      // Generated tag pages fill gaps; hand-written pages win on conflict.
      setPages({ ...gen.buildTagLandingPages(), ...hand.LANDING_PAGES });
    });
    return () => { on = false; };
  }, []);
  const page = pages?.[slug];

  // Template for programmatic SEO landing pages (/shia-matrimony-usa, city
  // pages, /shia-brides, /syed-rishta …). Each page's copy is hand-written in
  // landingPages.js — this renders it with breadcrumbs, FAQ schema, and
  // internal links so every page earns its place in the index.

  useEffect(() => {
    if (!page) return;
    const data = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://shiarishta.com/' },
        { '@type': 'ListItem', position: 2, name: page.breadcrumb, item: `https://shiarishta.com/${slug}` },
      ],
    };
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = 'breadcrumb-jsonld';
    el.textContent = JSON.stringify(data);
    document.head.appendChild(el);
    return () => document.getElementById('breadcrumb-jsonld')?.remove();
  }, [page, slug]);

  if (!pages) {
    return (
      <Layout>
        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
          <div className="animate-pulse">
            <div className="h-8 rounded-xl mb-4" style={{ background: 'var(--color-surface)' }} />
            <div className="h-4 rounded-xl w-2/3 mb-8" style={{ background: 'var(--color-surface)' }} />
            <div className="h-40 rounded-2xl" style={{ background: 'var(--color-surface)' }} />
          </div>
        </main>
      </Layout>
    );
  }

  if (!page) return <NotFound />;

  return (
    <Layout>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs mb-6" style={{ color: 'var(--color-ink-faint)' }}>
          <Link to="/" className="hover:underline">Home</Link>
          <ChevronRight className="w-3 h-3" />
          <span aria-current="page" style={{ color: 'var(--color-ink-secondary)' }}>{page.breadcrumb}</span>
        </nav>

        <h1 style={{ fontSize: 'clamp(1.75rem,4vw,2.75rem)', fontWeight: 700, color: 'var(--color-ink)', lineHeight: 1.2, marginBottom: '1.25rem' }}>
          {page.h1}
        </h1>

        {page.intro.map((p, i) => (
          <p key={i} style={{ color: 'var(--color-ink-secondary)', lineHeight: 1.8, fontSize: '1.0625rem', marginBottom: '1.25rem' }}>{p}</p>
        ))}

        {page.download && (
          <div className="my-8 p-6 rounded-2xl text-center" style={{ background: 'var(--color-surface)', border: '1px dashed var(--color-border)' }}>
            <p className="font-bold text-lg mb-1" style={{ color: 'var(--color-ink)' }}>Take it with you</p>
            <p className="text-sm mb-4" style={{ color: 'var(--color-ink-secondary)' }}>{page.download.label}</p>
            <a href={page.download.href} download className="button secondary px-6 py-2.5 font-semibold inline-flex items-center gap-2">
              Download PDF
            </a>
          </div>
        )}

        <div className="my-8 p-6 rounded-2xl text-center" style={{ background: 'var(--color-primary-subtle)', border: '1px solid var(--color-border)' }}>
          <p className="font-bold text-lg mb-1" style={{ color: 'var(--color-ink)' }}>Begin your search — free</p>
          <p className="text-sm mb-4" style={{ color: 'var(--color-ink-secondary)' }}>Verified profiles. Wali workflows. Privacy you control.</p>
          <Link to="/auth/register" className="button primary px-6 py-2.5 font-semibold inline-flex items-center gap-2">
            Create free profile <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {page.sections.map((s, i) => (
          <section key={i} style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-ink)', marginBottom: '0.75rem' }}>{s.h2}</h2>
            {s.body.map((p, j) => (
              <p key={j} style={{ color: 'var(--color-ink-secondary)', lineHeight: 1.8, marginBottom: '1rem' }}>{p}</p>
            ))}
          </section>
        ))}

        <FaqSection heading="Common questions" items={page.faqs} id={`landing-${slug}`} />

        {page.related?.length > 0 && (
          <section style={{ marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--color-border)' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-ink)', marginBottom: '0.75rem' }}>Keep exploring</h2>
            <ul className="grid sm:grid-cols-2 gap-2">
              {page.related.map((r) => (
                <li key={r.to}>
                  <Link to={r.to} className="flex items-center gap-2 p-3 rounded-xl text-sm font-medium hover:underline" style={{ color: 'var(--color-primary)', background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
                    <ChevronRight className="w-4 h-4 flex-shrink-0" /> {r.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {page.popularTags?.length > 0 && (
          <section style={{ marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--color-border)' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-ink)', marginBottom: '0.75rem' }}>Popular searches</h2>
            <div className="flex flex-wrap gap-2">
              {page.popularTags.map((t) => (
                <Link
                  key={t.to}
                  to={t.to}
                  className="px-3 py-1.5 rounded-full text-sm font-medium hover:underline"
                  style={{ color: 'var(--color-ink-secondary)', background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                >
                  {t.label}
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
    </Layout>
  );
}
