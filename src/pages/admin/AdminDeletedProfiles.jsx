import { useState, useEffect, useCallback } from 'react';
import Layout from '@/layouts/AdminLayout';
import { http } from '@/lib/api/transport';
import { deletionReasonLabel, DELETION_REASONS } from '@/lib/api/safety';
import { UserX, RefreshCw } from 'lucide-react';

/**
 * Deleted profiles — why members left.
 *
 * Reads the account_deletion_feedback rows written at delete time (the user
 * row itself is gone, so this table is the only record). Rendered read-only
 * by design: the API exposes no mutation route for this table. A row with no
 * reason means the member deleted without answering the exit question.
 */
export default function AdminDeletedProfiles() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [byReason, setByReason] = useState({});
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [reasonFilter, setReasonFilter] = useState('');
  const [query, setQuery] = useState('');

  const LIMIT = 25;

  const load = useCallback(async (nextOffset, append) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('limit', String(LIMIT));
      params.set('offset', String(nextOffset));
      if (reasonFilter) params.set('reason', reasonFilter);
      if (query.trim()) params.set('q', query.trim());
      const result = await http.get(`/api/admin/deleted-profiles?${params}`);
      if (append) setRows((prev) => [...prev, ...(result.rows || [])]);
      else setRows(result.rows || []);
      setTotal(result.total || 0);
      setByReason(result.byReason || {});
      setHasMore(!!result.hasMore);
      setOffset(nextOffset);
    } catch (e) {
      setError(e?.message || 'Could not load deleted profiles.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [reasonFilter, query]);

  useEffect(() => {
    // Filter/search changes re-run from the top, debounced like AdminSupport.
    const t = setTimeout(() => load(0, false), query ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  const formatDate = (d) => {
    if (!d) return '—';
    const parsed = new Date(`${String(d).replace(' ', 'T')}Z`);
    return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString();
  };

  const location = (r) => [r.city, r.country].filter(Boolean).join(', ') || '—';

  return (
    <Layout>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <header className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-ink">Deleted profiles</h1>
            <p className="text-sm text-muted mt-1 flex items-center gap-1.5">
              <UserX className="w-3.5 h-3.5" />
              {total === 0 ? 'Why members leave, when they tell us.' : `${total} member${total === 1 ? '' : 's'} left — newest first.`}
            </p>
          </div>
          <button onClick={() => load(0, false)} disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-elevated text-muted border border-line/20 hover:border-line/40 disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </header>

        {error && (
          <div className="mb-4 rounded-xl border border-line/20 bg-elevated p-3 text-sm text-muted">{error}</div>
        )}

        {/* Reason breakdown — the exit data's whole point is "why are people
            leaving". Counts cover all leavers; tapping a chip filters the table. */}
        {Object.keys(byReason).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            <button onClick={() => setReasonFilter('')}
              className={`px-2.5 py-1.5 rounded-full text-xs font-semibold border ${reasonFilter === '' ? 'bg-primary text-white border-primary' : 'border-line/30 text-muted hover:text-ink'}`}>
              All ({total})
            </button>
            {[...DELETION_REASONS.map((r) => r.key), 'none'].map((key) => {
              const n = byReason[key] || 0;
              if (n === 0 && key !== 'none') return null;
              return (
                <button key={key} onClick={() => setReasonFilter(key)}
                  className={`px-2.5 py-1.5 rounded-full text-xs font-semibold border ${reasonFilter === key ? 'bg-primary text-white border-primary' : 'border-line/30 text-muted hover:text-ink'}`}>
                  {deletionReasonLabel(key === 'none' ? null : key)} ({n})
                </button>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap gap-2 mb-4">
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email or what they said" aria-label="Search deleted profiles"
            className="input flex-1 min-w-[220px]" />
          <select value={reasonFilter} onChange={(e) => setReasonFilter(e.target.value)}
            aria-label="Filter by reason" className="input">
            <option value="">All reasons</option>
            {DELETION_REASONS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            <option value="none">No reason given</option>
          </select>
        </div>

        {loading && !rows.length ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-12 rounded-xl" />)}</div>
        ) : !rows.length ? (
          <div className="empty-state">
            <div className="text-muted mb-3 flex justify-center"><UserX className="w-12 h-12" /></div>
            <h2 className="empty-state-title">Nobody has left yet</h2>
            <p className="empty-state-text">
              When a member deletes their account, they are asked why — their
              answer shows up here with the date they joined and the date they left.
            </p>
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-line/20 bg-elevated overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-hover/50">
                  <tr className="text-left text-xs text-muted">
                    <th className="px-4 py-3 font-semibold">Member</th>
                    <th className="px-4 py-3 font-semibold">From</th>
                    <th className="px-4 py-3 font-semibold">Joined</th>
                    <th className="px-4 py-3 font-semibold">Left</th>
                    <th className="px-4 py-3 font-semibold">Reason</th>
                    <th className="px-4 py-3 font-semibold">What they said</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-line/15 align-top">
                      <td className="px-4 py-3 text-xs text-ink font-medium">{r.display_name || '—'}</td>
                      <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{location(r)}</td>
                      <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{formatDate(r.joined_at)}</td>
                      <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{formatDate(r.created_at)}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-hover whitespace-nowrap">{deletionReasonLabel(r.reason)}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted max-w-xs break-words">{r.detail || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {hasMore && (
              <div className="flex justify-center mt-4">
                <button onClick={() => load(offset + LIMIT, true)} disabled={loadingMore}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-elevated text-muted border border-line/20 hover:border-line/40 disabled:opacity-50">
                  {loadingMore ? 'Loading…' : `Load more (${total - rows.length} remaining)`}
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </Layout>
  );
}
