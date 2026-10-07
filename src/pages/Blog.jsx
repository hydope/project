import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../layouts/LandingLayout';
import { Clock, ArrowRight, TrendingUp, Bookmark, Sparkles } from 'lucide-react';
import { articles as staticArticles } from '../data/articles.js';

const categories = ['All', 'Guidance', 'Family', 'Tips', 'Safety', 'Guardians'];

export default function Blog() {
  const [activeCategory, setActiveCategory] = useState('All');
  const [bookmarked, setBookmarked] = useState(new Set());
  const [dbPosts, setDbPosts] = useState([]);

  // Published posts from the database (admin panel + queue) merge with
  // static articles. Previously only static articles showed, so anything
  // published from the admin panel was invisible here.
  useEffect(() => {
    import('../lib/api/transport.js').then(({ http }) =>
      http.get('/api/ai/posts?limit=50')
        .then(r => {
          const rows = Array.isArray(r) ? r : (r.rows || []);
          setDbPosts(rows.map(p => ({
            id: p.id,
            slug: p.slug,
            title: p.title,
            excerpt: p.excerpt,
            category: p.category || 'Guidance',
            image: '/og-cover.jpg',
            date: (p.published_at || p.created_at || '').slice(0, 10),
            readTime: p.read_time || '5 min',
          })));
        })
        .catch(() => {})
    );
  }, []);

  // DB posts first (newest), then static. De-dupe by slug.
  const seen = new Set();
  const all = [...dbPosts, ...staticArticles].filter(a => {
    if (seen.has(a.slug)) return false;
    seen.add(a.slug);
    return true;
  });
  const filtered = activeCategory === 'All' ? all : all.filter(a => a.category === activeCategory);
  const toggleBookmark = (id) => setBookmarked(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <Layout>
      <main>
        <section style={{ padding: 'clamp(2.5rem,5vw,4rem) 1.5rem', textAlign: 'center', maxWidth: '700px', margin: '0 auto' }}>
          <h1 style={{ fontSize: 'clamp(1.75rem,4vw,2.75rem)', fontWeight: 700, color: 'var(--color-ink)', marginBottom: '0.75rem' }}>Guidance for your journey</h1>
          <p style={{ color: 'var(--color-ink-secondary)', fontSize: '1.0625rem' }}>Thoughtful articles on intentional matchmaking.</p>
        </section>
        <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 1.5rem 4rem' }}>
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
            {categories.map(cat => (<button key={cat} onClick={() => setActiveCategory(cat)} className={'px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ' + (activeCategory === cat ? 'button primary' : 'button ghost')} style={activeCategory === cat ? {} : { border: '1px solid var(--color-border)', color: 'var(--color-ink-secondary)' }}>{cat}</button>))}
          </div>
          {filtered.length === 0 ? (
            <div className="empty-state text-center py-12">
              <div className="empty-state-icon">
                <Sparkles className="w-16 h-16" style={{ color: 'var(--color-primary)' }} />
              </div>
              <h1 className="empty-state-title text-xl font-bold">No articles found</h1>
              <p className="empty-state-text text-lg">
                Try selecting a different category or check back later for new content.
              </p>
              <div className="mt-6 flex justify-center">
                <Link to="/" className="button ghost">Explore other sections</Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map((article) => (
                <Link key={article.id} to={`/blog/${article.slug}`} className="group rounded-2xl overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
                  <div className="relative aspect-[16/10] overflow-hidden">
                    <img src={article.image} alt={article.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" width="900" height="562" />
                    {article.trending && (<div className="absolute top-3 left-3 flex items-center gap-1 text-[10px] font-bold text-white px-2 py-1 rounded-full" style={{ background: 'var(--color-accent)' }}><TrendingUp className="w-3 h-3" /> Trending</div>)}
                    <div className="absolute bottom-3 left-3 flex items-center gap-2 text-[10px] font-medium">
                      <button className="button ghost btn-xs" onClick={(e) => { e.preventDefault(); toggleBookmark(article.id); }} aria-label={bookmarked.has(article.id) ? 'Remove bookmark' : 'Bookmark article'}>
                        <Bookmark className="w-3 h-3" fill={bookmarked.has(article.id) ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full" style={{ color: 'var(--color-primary)', background: 'var(--color-primary-subtle)' }}>{article.category}</span>
                      <span className="text-[11px] flex items-center gap-1" style={{ color: 'var(--color-ink-faint)' }}><Clock className="w-3 h-3" /> {article.readTime}</span>
                    </div>
                    <h3 style={{ fontWeight: 600, color: 'var(--color-ink)', marginBottom: '0.5rem' }}>{article.title}</h3>
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-ink-secondary)', lineHeight: 1.6, marginBottom: '1rem' }}>{article.excerpt}</p>
                    <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-ink-faint)' }}>{article.date}</span>
                      <span className="flex items-center gap-1 text-xs font-semibold group-hover:gap-2 transition-all" style={{ color: 'var(--color-primary)' }}>Read article <ArrowRight className="w-3 h-3" /></span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </Layout>
  );
}
