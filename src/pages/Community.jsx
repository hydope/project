import { usePageTitle } from '../lib/usePageTitle';
import { useState, useMemo, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import Layout from '../layouts/LandingLayout';
import LoginGate from '../components/LoginGate';
import { useAuth } from '../lib/auth/AuthContext';
import { MessageCircle, Heart, Plus, Search, X, ChevronRight } from 'lucide-react';
import { createCommunity, createPost, listCommunities, listPosts, postPath } from '../lib/communityData';

export default function Community() {
  usePageTitle('Community');
  const { isLoggedIn, user } = useAuth();
  const [activeSub, setActiveSub] = useState('all');
  const [showLoginGate, setShowLoginGate] = useState(false);
  const [showNewPost, setShowNewPost] = useState(false);
  const [showCreateSub, setShowCreateSub] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [anonymous, setAnonymous] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [posts, setPosts] = useState([]);
  const [subreddits, setSubreddits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [newSubName, setNewSubName] = useState('');
  const [newSubDesc, setNewSubDesc] = useState('');

  const { slug } = useParams();
  const navigate = useNavigate();

  const refresh = async (sub = activeSub) => {
    try {
      const [rooms, feed] = await Promise.all([listCommunities(), listPosts(sub)]);
      setSubreddits(rooms);
      setPosts(feed);
      setLoadError('');
    } catch (e) {
      setLoadError(e.message || 'Could not load the community.');
    }
  };

  // Initial load + reload when switching rooms (remote mode fetches per room)
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setNotFound(false);
      const target = slug || 'all';
      try {
        const [rooms, feed] = await Promise.all([listCommunities(), listPosts(target)]);
        if (cancelled) return;
        setSubreddits(rooms);
        setPosts(feed);
        // Bogus slug → show a proper not-found state, not the generic feed.
        if (slug && slug !== 'all' && !rooms.some(s => s.id === slug)) {
          setNotFound(true);
        } else {
          setActiveSub(rooms.some(s => s.id === target) ? target : 'all');
        }
      } catch (e) {
        if (!cancelled) setLoadError(e.message || 'Could not load the community.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  // Navigate to a community's URL slug
  const goToSub = (id) => {
    setActiveSub(id);
    navigate(id === 'all' ? '/community' : `/community/${id}`);
  };

  const filtered = useMemo(() => {
    let result = activeSub === 'all' ? posts : posts.filter(p => p.sub === activeSub);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p =>
        p.title.toLowerCase().includes(q) ||
        (p.body || '').toLowerCase().includes(q) ||
        (p.tags || []).some(t => t.toLowerCase().includes(q)) ||
        p.author.toLowerCase().includes(q)
      );
    }
    return result;
  }, [activeSub, posts, searchQuery]);

  const filteredSubs = useMemo(() => {
    if (!searchQuery.trim()) return subreddits;
    const q = searchQuery.toLowerCase();
    return subreddits.filter(s => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q));
  }, [subreddits, searchQuery]);

  // Check if search query matches a community slug exactly — enables URL slug navigation
  const searchSlugMatch = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase().replace(/^\//, '');
    return subreddits.find(s => s.id === q) || null;
  }, [subreddits, searchQuery]);

  const activeSubData = subreddits.find(s => s.id === activeSub);
  const handlePost = () => { if (!isLoggedIn) { setShowLoginGate(true); return; } setShowNewPost(true); };
  const submitPost = async () => {
    if (!newTitle.trim() || saving) return;
    setSaving(true);
    try {
      const author = anonymous ? 'Anonymous' : (user?.displayName || 'You');
      const post = await createPost({
        sub: activeSub === 'all' ? 'general' : activeSub,
        title: newTitle,
        body: newBody,
        author,
        avatar: author.trim().charAt(0).toUpperCase() || 'Y',
      });
      await refresh(post.sub === activeSub || activeSub === 'all' ? activeSub : post.sub);
      if (post.sub !== activeSub && activeSub !== 'all') goToSub(post.sub);
      setNewTitle(''); setNewBody(''); setShowNewPost(false);
      navigate(postPath(post));
    } catch (e) {
      setLoadError(e.message || 'Could not publish your post.');
    } finally {
      setSaving(false);
    }
  };
  const handleCreateSub = async () => {
    if (!newSubName.trim() || saving) return;
    setSaving(true);
    try {
      const community = await createCommunity({ name: newSubName });
      if (!community) return;
      const rooms = await listCommunities();
      setSubreddits(rooms);
      setNewSubName(''); setNewSubDesc(''); setShowCreateSub(false);
      setActiveSub(community.id);
      navigate(`/community/${community.id}`);
    } catch (e) {
      setLoadError(e.message || 'Could not create the community.');
    } finally {
      setSaving(false);
    }
  };

  if (notFound) {
    return (
      <Layout>
        <main className="max-w-xl mx-auto px-4 py-20 text-center">
          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-ink)' }}>Community not found</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--color-ink-secondary)' }}>
            No community exists at “{slug}”. It may have been removed or the link is wrong.
          </p>
          <Link to="/community" className="button primary px-5 py-2.5 font-semibold">
            Browse communities
          </Link>
        </main>
      </Layout>
    );
  }

  return (
    <Layout>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 style={{ fontSize: 'clamp(1.75rem,3vw,2.25rem)', fontWeight: 700, color: 'var(--color-ink)' }}>Community</h1>
            <p style={{ color: 'var(--color-ink-secondary)', marginTop: '0.25rem' }}>Connect, share, and grow — together in faith.</p>
            {loadError && <p className="text-sm mt-2" style={{ color: 'var(--color-danger, #c0392b)' }}>{loadError}</p>}
            {loading && <p className="text-sm mt-2" style={{ color: 'var(--color-ink-faint)' }}>Loading discussions…</p>}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowCreateSub(true)} className="button secondary px-4 py-2.5 font-semibold text-sm flex items-center gap-2">
              <Plus className="w-4 h-4" /> Create
            </button>
            <button onClick={handlePost} className="button primary px-5 py-2.5 font-semibold text-sm flex items-center gap-2">
              <Plus className="w-4 h-4" /> New Post
            </button>
          </div>
        </div>

        <div className="mb-5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--color-ink-faint)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search communities or posts... (e.g. /hyderabad, /dubai)"
              className="input input-with-icon input-with-action text-sm"
              style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
              aria-label="Search communities and posts"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-ink-faint)' }}>
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Jump to community by exact slug match */}
          {searchSlugMatch && searchSlugMatch.id !== activeSub && (
            <button
              onClick={() => goToSub(searchSlugMatch.id)}
              className="mt-2 text-xs hover:underline flex items-center gap-1"
              style={{ color: 'var(--color-primary)' }}
            >
              <ChevronRight className="w-3 h-3" /> Jump to /{searchSlugMatch.name}
            </button>
          )}
        </div>

        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {filteredSubs.map(sub => (
            <button key={sub.id} onClick={() => goToSub(sub.id)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap" style={activeSub === sub.id ? { background: 'var(--color-primary)', color: '#fff' } : { background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-ink-secondary)' }}>
              <span>{sub.icon}</span> /{sub.name.toLowerCase()}
              <span className="text-[10px] opacity-70">{(sub.members || 0).toLocaleString()}</span>
            </button>
          ))}
        </div>

        {activeSub !== 'all' && activeSubData && (
          <div className="p-3 rounded-xl mb-5" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span style={{ fontSize: '1.5rem' }}>{activeSubData.icon}</span>
                <div>
                  <p style={{ fontWeight: 600, color: 'var(--color-ink)', fontSize: '1rem' }}>/{activeSubData.name}</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-ink-secondary)' }}>{activeSubData.members || 0} members · {filtered.length} discussions</p>
                </div>
              </div>
              <button onClick={handlePost} className="button primary px-4 py-2 text-sm font-semibold flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Post
              </button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {filtered.map(post => (
            <Link key={post.id} to={postPath(post)} className="block rounded-xl p-4 transition-all group" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--color-primary-subtle)' }}>
                  <span className="text-xs font-bold" style={{ color: 'var(--color-primary)' }}>{post.avatar}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    {post.pinned && (<span className="text-[10px] font-bold text-white px-1.5 py-0.5 rounded" style={{ background: 'var(--color-primary)' }}>Pinned</span>)}
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ color: 'var(--color-primary)', background: 'var(--color-primary-subtle)' }}>/{subreddits.find(s => s.id === post.sub)?.name || post.sub}</span>
                    <span className="text-[10px]" style={{ color: 'var(--color-ink-faint)' }}>· {post.time}</span>
                  </div>
                  <h3 style={{ fontWeight: 600, color: 'var(--color-ink)', marginBottom: '0.15rem', lineHeight: 1.4 }} className="group-hover:text-primary transition-colors">{post.title}</h3>
                  {post.body && (
                    <p className="line-clamp-2" style={{ fontSize: '0.8125rem', color: 'var(--color-ink-secondary)', lineHeight: 1.6, marginBottom: '0.15rem' }}>{post.body}</p>
                  )}
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-ink-faint)' }}>by {post.author}</p>
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-ink-secondary)' }}>
                      <MessageCircle className="w-3.5 h-3.5" /> {post.replies}
                    </span>
                    <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-ink-secondary)' }}>
                      <Heart className="w-3.5 h-3.5" /> {post.likes}
                    </span>
                    <div className="flex gap-1 ml-auto">
                      {(post.tags || []).map(tag => (<span key={tag} className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: 'var(--color-ink-secondary)', background: 'var(--color-surface)' }}>#{tag}</span>))}
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>

      {showLoginGate && <LoginGate onClose={() => setShowLoginGate(false)} />}

      {showNewPost && (
        <div className="ai-backdrop" style={{ zIndex: 400 }} onClick={() => setShowNewPost(false)}>
          <div className="ai-drawer" style={{ width: '480px', maxWidth: '95vw', margin: '2rem auto', borderRadius: 'var(--radius-xl)', position: 'relative', top: '10vh' }} onClick={e => e.stopPropagation()}>
            <div className="ai-drawer-header">
              <p className="ai-drawer-title">New post in /{activeSubData?.name || activeSub}</p>
              <button className="ai-icon-btn" onClick={() => setShowNewPost(false)}><span style={{ fontSize: '1.25rem' }}>Ã—</span></button>
            </div>
            <div style={{ padding: '1.5rem' }}>
              <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Post title..." className="w-full px-3 py-2 rounded-lg mb-3" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-ink)', fontSize: '0.9375rem' }} />
              {/* Trending starters — tap to fill */}
              <div className="mb-3">
                <p className="text-[11px] font-bold mb-1.5" style={{ color: 'var(--color-ink-tertiary)' }}>🔥 TRENDING STARTERS</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Unpopular opinion: green flags > red flags…',
                    'POV: your wali actually likes your match',
                    'What’s your biggest rishta ick?',
                    'Rate my biodata 1-10 (be honest)',
                    'Things I wish I knew before the first meeting',
                    'Duas that actually worked for me',
                  ].map(s => (
                    <button key={s} type="button" onClick={() => setNewTitle(s)}
                      className="text-[11px] px-2.5 py-1 rounded-full"
                      style={{ border: '1px solid var(--color-border)', color: 'var(--color-ink-secondary)' }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <textarea value={newBody} onChange={e => setNewBody(e.target.value)} placeholder="Share your thoughts (optional)..." rows={4} className="w-full px-3 py-2 rounded-lg mb-3 resize-none" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-ink)', fontSize: '0.9375rem' }} />
              <label className="flex items-center gap-2 mb-3 cursor-pointer">
                <input type="checkbox" checked={anonymous} onChange={e => setAnonymous(e.target.checked)} />
                <span style={{ fontSize: '0.875rem', color: 'var(--color-ink-secondary)' }}>Post anonymously</span>
              </label>
              <button onClick={submitPost} className="button primary w-full py-2.5 font-semibold">Submit post</button>
            </div>
          </div>
        </div>
      )}

      {showCreateSub && (
        <div className="ai-backdrop" style={{ zIndex: 400 }} onClick={() => setShowCreateSub(false)}>
          <div className="ai-drawer" style={{ width: '480px', maxWidth: '95vw', margin: '2rem auto', borderRadius: 'var(--radius-xl)', position: 'relative', top: '10vh' }} onClick={e => e.stopPropagation()}>
            <div className="ai-drawer-header">
              <p className="ai-drawer-title">Create a community</p>
              <button className="ai-icon-btn" onClick={() => setShowCreateSub(false)}><X className="w-4 h-4" /></button>
            </div>
            <div style={{ padding: '1.5rem' }}>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-ink-secondary)', marginBottom: '1.5rem' }}>Create a new community for people to connect, share, and grow together.</p>
              <div className="space-y-4">
                <div>
                  <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-ink)', display: 'block', marginBottom: '0.5rem' }}>Community name *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--color-ink-faint)' }}>/</span>
                    <input
                      type="text"
                      value={newSubName}
                      onChange={e => setNewSubName(e.target.value)}
                      placeholder="e.g. hyderabad, dubai, london"
                      className="input input-with-prefix text-sm"
                      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
                    />
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-ink-faint)', marginTop: '0.5rem' }}>Lowercase letters and numbers only. This will be your community URL.</p>
                </div>
                <div>
                  <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-ink)', display: 'block', marginBottom: '0.5rem' }}>Description (optional)</label>
                  <textarea
                    value={newSubDesc}
                    onChange={e => setNewSubDesc(e.target.value)}
                    placeholder="What is this community about?"
                    rows={3}
                    className="input px-3 py-2 text-sm resize-none"
                    style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
                  />
                </div>
                <button onClick={handleCreateSub} className="button primary w-full py-2.5 font-semibold" disabled={!newSubName.trim()}>Create Community</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}


