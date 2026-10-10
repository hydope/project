import { usePageTitle } from '../lib/usePageTitle';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import Layout from '../layouts/LandingLayout';
import ProfileCard from '../components/ProfileCard.jsx';
import CuratedMatchFeed from '../components/CuratedMatchFeed.jsx';
import LoginGate from '../components/LoginGate';
import { useAuth } from '../lib/auth/AuthContext';
import { api } from '../lib/api/client';
import { MARJA_OPTIONS } from '../lib/onboardingData';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, SlidersHorizontal, LayoutGrid, Heart, AlertCircle, Shield, Bookmark, Users
} from 'lucide-react';

const SECT_FILTERS = ['Any sect', 'Ithna Ashari (Twelver)', 'Ismaili', 'Bohra', 'Zaydi'];
const RELIGIOSITY_FILTERS = ['Any level', 'Very practicing', 'Practicing', 'Moderately practicing', 'Reconnecting'];
const EDUCATION_FILTERS = ['Any education', "Bachelor's degree", "Master's degree", 'Doctorate', 'Some college'];
// Marja' is the single most requested Shia filter — it decides which rulings
// govern a shared household, so it belongs next to sect, not buried.
// Imported from onboardingData.js so the values can never drift apart.
const MARJA_FILTERS = ['Any marja', ...MARJA_OPTIONS];
// Modesty options MUST match MODESTY_OPTIONS_FEMALE/MALE in onboardingData.js exactly.
// Shown as Hijab options when browsing brides, Beard options for grooms.
const MODESTY_FILTERS_FEMALE = ['Any', 'Hijab — always observed', 'Hijab — working towards it', 'Modest dress, no hijab yet', 'Prefer not to say'];
const MODESTY_FILTERS_MALE = ['Any', 'Beard — always kept', 'Beard — sometimes kept', 'Clean shaven', 'Prefer not to say'];
const SORTS = [
  { value: 'match', label: 'Best match' },
  { value: 'newest', label: 'Newest members' },
  { value: 'age-asc', label: 'Age: low to high' },
  { value: 'age-desc', label: 'Age: high to low' }
];

const DEFAULT_FILTERS = {
  search: '', gender: '', minAge: '', maxAge: '', country: '',
  sect: 'Any sect', religiosity: 'Any level', education: 'Any education',
  marja: 'Any marja', syedStatus: 'Any', modesty: 'Any', photo: 'any', verifiedOnly: false, sort: 'match'
};

// Placeholder sentinels must be stripped before hitting the API, otherwise the
// server would filter for the literal string "Any sect" and return nothing.
const sentinels = new Set(['Any sect', 'Any level', 'Any education', 'Any marja', 'Any', 'any', '']);
const clean = (v) => (v === undefined || sentinels.has(String(v)) ? undefined : String(v));

const FAVOURITES_KEY = 'sr.favourites.v1';

// ── Saved profiles ───────────────────────────────────────────────────────────
// A private, per-member list. Backed by the API so it survives a reload and a
// new device; localStorage is a read-through cache only, and is scoped to this
// user id so two accounts on one browser never see each other's list.
export function Favourites() {
  usePageTitle('Saved Profiles');
  const { isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loginOpen, setLoginOpen] = useState(false);

  const cacheKey = useMemo(() => {
    try {
      const raw = localStorage.getItem('sr.user');
      const u = raw ? JSON.parse(raw) : null;
      return u?.id ? `${FAVOURITES_KEY}.${u.id}` : null;
    } catch { return null; }
  }, [isLoggedIn]);

  const load = useCallback(async () => {
    if (!isLoggedIn) { setRows([]); setLoading(false); return; }
    setLoading(true); setError(null);
    // Paint the cached list immediately so the page is never blank, then let the
    // API confirm it. A cache that disagrees with the server is overwritten.
    if (cacheKey) {
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey) || '[]');
        if (Array.isArray(cached) && cached.length) setRows(cached);
      } catch { /* corrupt cache is not worth surfacing */ }
    }
    try {
      const data = await api.getFavourites();
      const list = Array.isArray(data) ? data : (data?.rows ?? []);
      setRows(list);
      if (cacheKey) localStorage.setItem(cacheKey, JSON.stringify(list.map(p => p.id)));
    } catch (e) {
      setError(e.message || 'Could not load your saved profiles.');
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn, cacheKey]);

  useEffect(() => { load(); }, [load]);

  const remove = async (id) => {
    const snapshot = rows;
    // Optimistic, with a real rollback — a failed unfavourite must not silently
    // look like it worked.
    setRows(prev => prev.filter(p => p.id !== id));
    try {
      await api.removeFavourite(id);
      if (cacheKey) localStorage.setItem(cacheKey, JSON.stringify(snapshot.filter(p => p.id !== id).map(p => p.id)));
    } catch (e) {
      setRows(snapshot);
      setError(e.message || 'Could not remove that profile.');
    }
  };

  if (!isLoggedIn) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 py-20 text-center">
          <h1 className="text-2xl font-semibold mb-3">Saved profiles</h1>
          <p className="mb-6" style={{ color: 'var(--color-ink-secondary)' }}>
            Sign in to save profiles and find them again on any device.
          </p>
          <button className="btn btn-primary" onClick={() => setLoginOpen(true)}>Sign in to see favourites</button>
          {loginOpen && (
            <LoginGate
              reason="favourites"
              onClose={() => setLoginOpen(false)}
              onSuccess={() => { setLoginOpen(false); load(); }}
            />
          )}
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Saved profiles</h1>
            <p className="text-sm" style={{ color: 'var(--color-ink-secondary)' }}>
              Private to you. Only you can see this list.
            </p>
          </div>
          <button className="btn btn-secondary" onClick={() => navigate('/profiles')}>Browse more profiles</button>
        </div>

        {error && (
          <p className="mb-4 text-sm" style={{ color: 'var(--color-danger, #b3261e)' }}>{error}</p>
        )}

        {loading && rows.length === 0 && <p style={{ color: 'var(--color-ink-tertiary)' }}>Loading your saved profiles…</p>}

        {!loading && rows.length === 0 && !error && (
          <div className="card p-10 text-center">
            <Bookmark className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--color-ink-tertiary)' }} />
            <p className="mb-4" style={{ color: 'var(--color-ink-secondary)' }}>
              You have not saved any profiles yet.
            </p>
            <button className="btn btn-primary" onClick={() => navigate('/profiles')}>Browse profiles</button>
          </div>
        )}

        {rows.length > 0 && (
          <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {rows.map(p => (
              <div key={p.id} className="relative">
                <ProfileCard profile={p} />
                <button
                  onClick={() => remove(p.id)}
                  className="btn btn-secondary"
                  aria-label={`Remove ${p.displayName} from saved profiles`}
                  style={{ position: 'absolute', top: 8, right: 8, minWidth: 32, minHeight: 32, padding: '0 10px', fontSize: 11 }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

export function BrowseProfiles() {
  usePageTitle('Browse Profiles');
  const { isLoggedIn } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(9);
  // True when the gender filter was set automatically from the member's own
  // seekingGender (not chosen by them). Shown as a transparent notice — never
  // filter silently.
  const [autoGender, setAutoGender] = useState(false);

  // Default the gender filter to the signed-in member's seekingGender, so a
  // woman looking for a husband sees men (not women) ranked as top matches.
  // Only applies when the member hasn't chosen a gender filter themselves.
  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    api.getProfile('me')
      .then(me => {
        if (cancelled || !me?.seekingGender) return;
        // Runs once on mount while filters are still DEFAULT_FILTERS, so the
        // gender slot is always free here — no need to read previous state.
        setFilters(prev => (prev.gender ? prev : { ...prev, gender: me.seekingGender }));
        setAutoGender(true);
      })
      .catch(() => { /* browse works without it */ });
    return () => { cancelled = true; };
  }, [isLoggedIn]);

  const view = searchParams.get('view') === 'curated' ? 'curated' : 'grid';

  const setView = (v) => setSearchParams(v === 'curated' ? { view: 'curated' } : {}, { replace: true });
  const setFilter = (key, value) => {
    // A manual gender choice replaces the auto-applied default — the
    // transparency notice must not linger after the member takes control.
    if (key === 'gender') setAutoGender(false);
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    api.getProfiles({}).then(data => { if (!cancelled) { setProfiles(data); setLoading(false); } })
      .catch(() => { if (!cancelled) { setError("We couldn't load profiles right now. Check your connection and try again."); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  // Re-fetch when a filter that the server owns changes. Previously every filter
  // was applied client-side against fields the API never returned, so six of the
  // seven silently produced an empty list.
  const serverFilterKey = useMemo(() => JSON.stringify({
    gender: clean(filters.gender),
    minAge: clean(filters.minAge),
    maxAge: clean(filters.maxAge),
    country: clean(filters.country),
    sect: clean(filters.sect),
    religiosity: clean(filters.religiosity),
    education: clean(filters.education),
    marja: clean(filters.marja),
    syedStatus: clean(filters.syedStatus),
    modesty: clean(filters.modesty),
    // The API param is `photoAccess`; the UI state key is `photo`.
    photoAccess: clean(filters.photo),
    verifiedOnly: filters.verifiedOnly,
    search: clean(filters.search),
  }), [filters]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    // Pass the params as an OBJECT. getProfiles() builds the query string itself
    // via Object.entries(); handing it a pre-built '?marja=Sistani' string made
    // it iterate the characters, sending ?0=%3F&1=m&2=a... and filtering nothing.
    api.getProfiles(JSON.parse(serverFilterKey))
      .then(data => { if (!cancelled) { setProfiles(data); setLoading(false); } })
      .catch(() => { if (!cancelled) { setError("We couldn't load profiles right now. Check your connection and try again."); setLoading(false); } });
    return () => { cancelled = true; };
  }, [serverFilterKey]);

  useEffect(() => { setVisibleCount(9); }, [filters]);

  const filtered = useMemo(() => {
    // Filtering is server-side now. Only the sort stays local, plus a guard that
    // never lets a private row reach the grid even if the server were to change.
    let list = profiles.filter(p => {
      // A signed-out visitor receives teasers, and the server marks every teaser
      // locked:true because the payload is withheld. Filtering on `locked` alone
      // therefore discarded the ENTIRE anonymous roster — the API returned the
      // profiles and the grid threw all of them away, so /profiles looked empty
      // to anyone not signed in. Only genuinely locked rows (members-only,
      // viewed by someone not entitled) are dropped; a teaser is a public
      // profile that is meant to be browsed.
      if (p.locked && !p.teaser) return false;
      if (p.visibility === 'private' && !p.isOwner) return false;
      return true;
    });

    switch (filters.sort) {
      case 'newest': list = [...list].reverse(); break;
      case 'age-asc': list = [...list].sort((a, b) => (a.age ?? 99) - (b.age ?? 99)); break;
      case 'age-desc': list = [...list].sort((a, b) => (b.age ?? 0) - (a.age ?? 0)); break;
      default: list = [...list].sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
    }
    return list;
  }, [profiles, filters]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;
  const activeFilterCount = Object.entries(filters).filter(([k, v]) => {
    if (k === 'sort') return v !== 'match';
    if (k === 'verifiedOnly') return v === true;
    if (typeof v === 'string') return v && !['Any sect', 'Any level', 'Any education', 'any'].includes(v);
    return false;
  }).length;

  return (
    <Layout>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-display-lg font-bold" style={{ color: 'var(--color-ink)' }}>
            Browse <span className="text-gradient">profiles</span>
          </h1>
          <p className="text-body mt-2 max-w-2xl">
            Intentional matchmaking for serious, verified members. Take your time — every profile represents a real person seeking a meaningful connection.
          </p>
        </div>

        {/* View toggle + search */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
          <div className="flex items-center gap-2 p-1 rounded-lg" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <button
              onClick={() => setView('grid')}
              className={'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ' + (view === 'grid' ? 'shadow-sm' : '')}
              style={view === 'grid' ? { background: 'var(--color-elevated)', color: 'var(--color-ink)' } : { color: 'var(--color-ink-secondary)' }}
            >
              <LayoutGrid className="w-4 h-4" /> Grid
            </button>
            <button
              onClick={() => setView('curated')}
              className={'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ' + (view === 'curated' ? 'shadow-sm' : '')}
              style={view === 'curated' ? { background: 'var(--color-elevated)', color: 'var(--color-ink)' } : { color: 'var(--color-ink-secondary)' }}
            >
              <Heart className="w-4 h-4" /> Curated
            </button>
          </div>

          <div className="flex-1 w-full sm:w-auto">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--color-ink-faint)' }} />
              <input
                type="text"
                placeholder="Search by name, profession, city..."
                value={filters.search}
                onChange={e => setFilter('search', e.target.value)}
                className="input input-with-icon"
                style={{ background: 'var(--color-surface)' }}
                aria-label="Search profiles"
              />
            </div>
          </div>

          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            className={'btn btn-secondary flex items-center gap-2 ' + (activeFilterCount > 0 ? 'btn-primary' : '')}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center" style={{ background: 'var(--color-primary)', color: '#fff' }}>
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Transparency notice: the gender filter was pre-applied from the
            member's own seekingGender — never filter silently. One tap shows
            everyone. */}
        {autoGender && filters.gender && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl px-4 py-2.5 text-sm" style={{ background: 'var(--color-primary-subtle)', color: 'var(--color-ink)' }}>
            <SlidersHorizontal className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-primary)' }} />
            <span>
              Showing {filters.gender === 'female' ? 'brides' : filters.gender === 'male' ? 'grooms' : 'profiles'} based on your profile preferences.
            </span>
            <button
              onClick={() => { setFilter('gender', ''); }}
              className="font-semibold underline underline-offset-2"
              style={{ color: 'var(--color-primary)' }}
            >
              Show everyone
            </button>
          </div>
        )}

        {/* Filter panel */}
        <AnimatePresence>
          {filtersOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden mb-6"
            >
              <div className="card p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block mb-1.5 text-xs font-medium" style={{ color: 'var(--color-ink-secondary)' }}>Looking for</label>
                    <select value={filters.gender} onChange={e => setFilter('gender', e.target.value)} className="input" style={{ background: 'var(--color-surface)' }}>
                      <option value="">Any</option>
                      <option value="female">Brides</option>
                      <option value="male">Grooms</option>
                    </select>
                  </div>
                  <div>
                    <label className="block mb-1.5 text-xs font-medium" style={{ color: 'var(--color-ink-secondary)' }}>Age range</label>
                    <div className="flex gap-2">
                      <input type="number" min="18" max="100" placeholder="Min" value={filters.minAge} onChange={e => setFilter('minAge', e.target.value)} className="input" style={{ background: 'var(--color-surface)' }} aria-label="Minimum age" />
                      <input type="number" min="18" max="100" placeholder="Max" value={filters.maxAge} onChange={e => setFilter('maxAge', e.target.value)} className="input" style={{ background: 'var(--color-surface)' }} aria-label="Maximum age" />
                    </div>
                  </div>
                  <div>
                    <label className="block mb-1.5 text-xs font-medium" style={{ color: 'var(--color-ink-secondary)' }}>Sect</label>
                    <select value={filters.sect} onChange={e => setFilter('sect', e.target.value)} className="input" style={{ background: 'var(--color-surface)' }}>
                      {SECT_FILTERS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block mb-1.5 text-xs font-medium" style={{ color: 'var(--color-ink-secondary)' }}>Religiosity</label>
                    <select value={filters.religiosity} onChange={e => setFilter('religiosity', e.target.value)} className="input" style={{ background: 'var(--color-surface)' }}>
                      {RELIGIOSITY_FILTERS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block mb-1.5 text-xs font-medium" style={{ color: 'var(--color-ink-secondary)' }}>Education</label>
                    <select value={filters.education} onChange={e => setFilter('education', e.target.value)} className="input" style={{ background: 'var(--color-surface)' }}>
                      {EDUCATION_FILTERS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block mb-1.5 text-xs font-medium" style={{ color: 'var(--color-ink-secondary)' }}>Marja&apos;</label>
                    <select value={filters.marja} onChange={e => setFilter('marja', e.target.value)} className="input" style={{ background: 'var(--color-surface)' }}>
                      {MARJA_FILTERS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block mb-1.5 text-xs font-medium" style={{ color: 'var(--color-ink-secondary)' }}>Syed / Sadat</label>
                    <select value={filters.syedStatus} onChange={e => setFilter('syedStatus', e.target.value)} className="input" style={{ background: 'var(--color-surface)' }}>
                      <option value="Any">Any</option>
                      <option value="sadat-both">Syed / Sadat — both sides</option>
                      <option value="syed-paternal">Syed (paternal)</option>
                      <option value="non-syed">Non-Syed</option>
                    </select>
                  </div>
                  <div>
                    <label className="block mb-1.5 text-xs font-medium" style={{ color: 'var(--color-ink-secondary)' }}>Hijab / Modesty</label>
                    <select value={filters.modesty} onChange={e => setFilter('modesty', e.target.value)} className="input" style={{ background: 'var(--color-surface)' }}>
                      {(filters.gender === 'male' ? MODESTY_FILTERS_MALE : MODESTY_FILTERS_FEMALE).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block mb-1.5 text-xs font-medium" style={{ color: 'var(--color-ink-secondary)' }}>Photo access</label>
                    <select value={filters.photo} onChange={e => setFilter('photo', e.target.value)} className="input" style={{ background: 'var(--color-surface)' }}>
                      <option value="any">Any</option>
                      <option value="public">Photos public</option>
                      <option value="members">Members tier</option>
                      <option value="private">Photos private</option>
                    </select>
                  </div>
                  <div>
                    <label className="block mb-1.5 text-xs font-medium" style={{ color: 'var(--color-ink-secondary)' }}>Sort by</label>
                    <select value={filters.sort} onChange={e => setFilter('sort', e.target.value)} className="input" style={{ background: 'var(--color-surface)' }}>
                      {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-4 pt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
                  <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--color-ink-secondary)' }}>
                    <input
                      type="checkbox"
                      checked={filters.verifiedOnly}
                      onChange={e => setFilter('verifiedOnly', e.target.checked)}
                      className="w-4 h-4 rounded"
                      style={{ accentColor: 'var(--color-primary)' }}
                    />
                    <Shield className="w-4 h-4" /> Verified only
                  </label>
                  {activeFilterCount > 0 && (
                    <button onClick={() => setFilters(DEFAULT_FILTERS)} className="btn btn-ghost btn-sm">
                      Clear all filters
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results count */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm" style={{ color: 'var(--color-ink-secondary)' }}>
            {loading ? 'Loading profiles...' : filtered.length + ' member' + (filtered.length !== 1 ? 's' : '') + ' found'}
          </p>
        </div>

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
                <div className="h-52 skeleton" />
                <div className="p-4 space-y-2.5">
                  <div className="h-4 w-2/3 rounded skeleton" />
                  <div className="h-3 w-1/2 rounded skeleton" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="empty-state">
            <AlertCircle className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--color-danger)' }} />
            <h3 className="empty-state-title">Couldn&apos;t load profiles</h3>
            <p className="empty-state-text mb-4">{error}</p>
            <button onClick={load} className="btn btn-primary">Try again</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <Users className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--color-ink-tertiary)' }} />
            <h3 className="empty-state-title">
              {activeFilterCount > 0 ? 'No profiles match your filters' : 'No members here yet — be the first'}
            </h3>
            <p className="empty-state-text mb-5 max-w-md mx-auto">
              {activeFilterCount > 0
                ? 'Try widening the filters. Our member base is growing, and the right person may be one field away.'
                : 'Shia Rishta is early access, so the member list is still short. Every real profile here is someone a family could actually reach — we would rather show you twelve honest members than a grid of invented ones.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {activeFilterCount > 0 ? (
                <button onClick={() => setFilters(DEFAULT_FILTERS)} className="btn btn-secondary">Clear filters</button>
              ) : (
                <>
                  <Link to="/auth/register" className="btn btn-primary">Create your free profile</Link>
                  <Link to="/profile-guide" className="btn btn-secondary">
                    See what a strong profile looks like
                  </Link>
                </>
              )}
            </div>
          </div>
        ) : view === 'curated' ? (
          <CuratedMatchFeed profiles={filtered} />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {visible.map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                >
                  <ProfileCard profile={p} />
                </motion.div>
              ))}
            </div>
            {hasMore && (
              <div className="flex justify-center mt-8">
                <button
                  onClick={() => setVisibleCount(c => c + 9)}
                  className="btn btn-secondary"
                >
                  Load more profiles
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </Layout>
  );
}
