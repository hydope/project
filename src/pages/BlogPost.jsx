import { Link, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Layout from '../layouts/LandingLayout';
import { Clock, ArrowLeft } from 'lucide-react';
import NotFound from './NotFound';
import { usePageTitle } from '../lib/usePageTitle';

// articles.js holds all eight full-length articles — dynamically imported so
// it ships as its own async chunk instead of bloating the shared entry chunk.
const MONTHS = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
function toISO(display) {
  const m = /^([A-Za-z]{3}) (\d{1,2}), (\d{4})$/.exec(display || '');
  return m ? `${m[3]}-${MONTHS[m[1]]}-${m[2].padStart(2, '0')}` : undefined;
}

// Individual article page: /blog/:slug — crawlable URL, unique meta (via Seo),
// and Article structured data for rich results.
export default function BlogPost() {
  const { slug } = useParams();
  const [articles, setArticles] = useState(null);
  // Server-rendered post payload (injected by routes/blog-ssr.php as
  // window.__SSR_POST__): the article HTML is already in the document, so
  // skip the API fetch and render immediately — no content flash.
  const [dbPost, setDbPost] = useState(() => {
    try {
      const w = typeof window !== 'undefined' ? window.__SSR_POST__ : null;
      return w && w.slug === slug ? w : null;
    } catch {
      return null;
    }
  });
  const [dbLoading, setDbLoading] = useState(false);
  useEffect(() => {
    let on = true;
    import('../data/articles.js').then((m) => { if (on) setArticles(m.articles); });
    return () => { on = false; };
  }, []);
  const article = articles?.find((a) => a.slug === slug);

  // Only 404 after we've checked BOTH static articles and the database.
  // dbChecked tracks whether the DB lookup has completed (or was skipped
  // because a static article matched).
  const [dbChecked, setDbChecked] = useState(false);
  useEffect(() => {
    // Found in the static list — no DB lookup needed.
    if (article) { setDbChecked(true); return; }
    if (dbPost) {
      // Server-rendered payload for THIS slug — no fetch needed.
      if (dbPost.slug === slug) { setDbChecked(true); return; }
      // Stale payload from a previously viewed post (client-side nav) —
      // drop it and fall through to the fetch below.
      setDbPost(null);
      setDbChecked(false);
      return;
    }
    // Static list still loading — keep the skeleton. Setting dbChecked here
    // would flash the 404 page (and crawlers can snapshot it as a soft 404).
    if (!articles) return;
    setDbLoading(true);
    import('../lib/api/transport.js').then(({ http }) =>
      http.get(`/api/ai/posts/${encodeURIComponent(slug)}`)
        .then(r => setDbPost(r?.post || r || null))
        .catch(() => setDbPost(null))
        .finally(() => { setDbLoading(false); setDbChecked(true); })
    ).catch(() => {
      // Transport chunk failed to load — don't hang on the skeleton forever.
      setDbLoading(false); setDbChecked(true);
    });
  }, [articles, article, slug, dbPost]);

  // Normalize a DB post to the article shape the template expects.
  // Only the payload matching the current slug counts (a stale payload from
  // client-side navigation is cleared by the effect above).
  const ssrPost = dbPost && dbPost.slug === slug ? dbPost : null;
  const post = article || (ssrPost ? {
    slug: ssrPost.slug,
    title: ssrPost.title,
    excerpt: ssrPost.excerpt,
    category: ssrPost.category,
    image: ssrPost.image_url || '/og-cover.jpg',
    date: (ssrPost.published_at || ssrPost.created_at || '').slice(0, 10),
    readTime: ssrPost.read_time || '5 min',
    // DB body is [{t:'p'|'h2', x:'...'}]; convert to the static article blocks.
    body: (Array.isArray(ssrPost.body) ? ssrPost.body : []).map(b => ({
      type: b.t === 'h2' ? 'h2' : 'p',
      text: b.x,
    })),
  } : null);

  usePageTitle(post ? post.title : 'Article');

  useEffect(() => {
    if (!post) return;
    // The SSR document (routes/blog-ssr.php) already embeds this tag —
    // don't duplicate it when the SPA takes over.
    if (document.getElementById('article-jsonld')) return;
    const data = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: post.title,
      description: post.excerpt,
      image: `https://shiarishta.com${post.image}`,
      datePublished: toISO(post.date),
      dateModified: toISO(post.date),
      author: {
        '@type': 'Organization',
        name: 'Shia Rishta',
        url: 'https://shiarishta.com/',
      },
      publisher: {
        '@type': 'Organization',
        name: 'Shia Rishta',
        logo: { '@type': 'ImageObject', url: 'https://shiarishta.com/icon-512.png' },
      },
      mainEntityOfPage: `https://shiarishta.com/blog/${post.slug}`,
      inLanguage: 'en',
    };
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = 'article-jsonld';
    el.textContent = JSON.stringify(data);
    document.head.appendChild(el);
    return () => document.getElementById('article-jsonld')?.remove();
  }, [post]);

  if (!articles || dbLoading || !dbChecked) {
    return (
      <Layout>
        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
          <div className="animate-pulse">
            <div className="h-8 rounded-xl mb-4" style={{ background: 'var(--color-surface)' }} />
            <div className="h-4 rounded-xl w-2/3 mb-8" style={{ background: 'var(--color-surface)' }} />
            <div className="h-64 rounded-2xl" style={{ background: 'var(--color-surface)' }} />
          </div>
        </main>
      </Layout>
    );
  }

  if (!post && dbChecked) return <NotFound />;
  if (!post) return null;

  return (
    <Layout>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <Link to="/blog" className="button ghost btn-sm mb-6 inline-flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back to articles
        </Link>
        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full" style={{ color: 'var(--color-primary)', background: 'var(--color-primary-subtle)' }}>{post.category}</span>
        <h1 style={{ fontSize: 'clamp(1.75rem,4vw,2.75rem)', fontWeight: 700, color: 'var(--color-ink)', lineHeight: 1.2, margin: '0.75rem 0 1rem' }}>{post.title}</h1>
        <div className="flex items-center gap-4 mb-6" style={{ color: 'var(--color-ink-faint)', fontSize: '0.8125rem' }}>
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {post.readTime} read</span>
          <span>{post.date}</span>
        </div>
        <div className="rounded-2xl overflow-hidden mb-8">
          <img src={post.image} alt={post.title} className="w-full h-64 sm:h-80 object-cover" loading="eager" />
        </div>
        <div style={{ color: 'var(--color-ink-secondary)', lineHeight: 1.8, fontSize: '1rem' }}>
          {post.body.map((b, i) => (b.type || b.t) === 'h2' ? (
            <h2 key={i} style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-ink)', margin: '2rem 0 0.75rem' }}>{b.x || b.text}</h2>
          ) : (
            <p key={i} style={{ marginBottom: '1.25rem' }}>{b.x || b.text}</p>
          ))}
        </div>
        <div className="mt-8 pt-6" style={{ borderTop: '1px solid var(--color-border)' }}>
          <Link to="/auth/register" className="button primary px-6 py-2.5 font-semibold">Start your journey — it&rsquo;s free</Link>
        </div>
      </main>
    </Layout>
  );
}
