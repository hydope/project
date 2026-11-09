import { useState, useEffect, useCallback } from 'react';
import Layout from '@/layouts/AdminLayout';
import { http } from '@/lib/api/transport';
import { History, RefreshCw, Shield } from 'lucide-react';

/**
 * Admin audit trail.
 *
 * Append-only record of who did what. Before this, approving an identity
 * document or blocking a member left no trace at all, so "which admin did this"
 * was unanswerable. Rendered read-only by design: the API exposes no mutation
 * route for this table.
 */
export default function AdminAudit() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  const load = useCallback(async (nextOffset, append) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(nextOffset));
      if (actionFilter.trim()) params.set('action', actionFilter.trim());
      if (actorFilter.trim()) params.set('actor', actorFilter.trim());
      if (query.trim()) params.set('q', query.trim());
      const data = await http.get(`/api/admin/audit?${params}`);
      const list = Array.isArray(data) ? data : [];
      if (append) setRows((prev) => [...prev, ...list]);
      else setRows(list);
      // The endpoint returns a plain array: a short page means the end.
      setHasMore(list.length === limit);
      setOffset(nextOffset);
    } catch (e) {
      setError(e?.message || 'Could not load the audit trail.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [limit, actionFilter, actorFilter, query]);

  useEffect(() => {
    // One effect for mount and filter changes, debounced like AdminSupport:
    // typing in a filter fires one request 300ms after the last keystroke,
    // and the initial load (no filters set) fires immediately.
    const t = setTimeout(() => load(0, false), (actionFilter || actorFilter || query) ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, actionFilter, actorFilter, query]);

  const copyTargetId = async (id) => {
    try {
      await navigator.clipboard.writeText(String(id));
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
    } catch { /* clipboard unavailable — the full id is visible to select */ }
  };

  return (
    <Layout>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <header className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-ink">Audit trail</h1>
            <p className="text-sm text-muted mt-1 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" /> Append-only. Nothing here can be edited or removed.
            </p>
          </div>
          <button onClick={load} disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-elevated text-muted border border-line/20 hover:border-line/40 disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </header>

        {error && (
          <div className="mb-4 rounded-xl border border-line/20 bg-elevated p-3 text-sm text-muted">{error}</div>
        )}

        {/* Filters — the trail was newest-100-only, so finding one action
            meant scrolling and re-loading. */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <input value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}
            placeholder="Filter by action (e.g. verification.approved)" aria-label="Filter by action"
            className="input flex-1 min-w-[200px]" />
          <input value={actorFilter} onChange={(e) => setActorFilter(e.target.value)}
            placeholder="Filter by admin email" aria-label="Filter by admin email"
            className="input flex-1 min-w-[180px]" />
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search action, target or admin" aria-label="Search audit trail"
            className="input flex-1 min-w-[180px]" />
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}
            aria-label="Rows per page" className="input">
            {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n} / page</option>)}
          </select>
          <button onClick={() => load(0, false)} disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-elevated text-muted border border-line/20 hover:border-line/40 disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {loading && !rows.length ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-12 rounded-xl" />)}</div>
        ) : !rows.length ? (
          <div className="empty-state">
            <div className="text-muted mb-3 flex justify-center"><History className="w-12 h-12" /></div>
            <h2 className="empty-state-title">No admin actions recorded yet</h2>
            <p className="empty-state-text">
              Entries appear here the moment an admin approves a verification, acts on a
              report, changes a role or unblocks a member.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-line/20 bg-elevated overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-hover/50">
                <tr className="text-left text-xs text-muted">
                  <th className="px-4 py-3 font-semibold">When</th>
                  <th className="px-4 py-3 font-semibold">Admin</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                  <th className="px-4 py-3 font-semibold">Target</th>
                  <th className="px-4 py-3 font-semibold">Detail</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-line/15">
                    <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                      {new Date(`${String(r.created_at).replace(' ', 'T')}Z`).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink">{r.actor_email || 'system'}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-hover">{r.action}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {r.target_type}
                      {r.target_id ? (
                        <button onClick={() => copyTargetId(r.target_id)}
                          title="Click to copy the full target id"
                          className="ml-1 font-mono text-faint hover:text-ink break-all">
                          {String(r.target_id)}{copiedId === r.target_id ? ' ✓' : ''}
                        </button>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted max-w-md">
                      {r.action === 'biodata.created' && r.meta ? (
                        <details className="cursor-pointer">
                          <summary className="hover:text-ink">
                            {r.meta.template || 'essential'} · {r.meta.lang || 'en'} ·{' '}
                            {r.meta.field_count || 0} fields
                            {r.meta.has_photo ? ' · 📷 photo' : ''}
                          </summary>
                          {r.meta.photo_thumb && (
                            <img src={r.meta.photo_thumb} alt="Biodata photo"
                              className="mt-2 w-32 h-40 object-cover rounded-lg border border-line/20" />
                          )}
                          <dl className="mt-2 space-y-1 max-h-48 overflow-auto pr-2">
                            {Object.entries(r.meta.fields || {}).map(([k, v]) => (
                              <div key={k} className="flex gap-2">
                                <dt className="text-faint shrink-0 min-w-[90px]">{k}:</dt>
                                <dd className="text-ink break-words">{String(v)}</dd>
                              </div>
                            ))}
                          </dl>
                        </details>
                      ) : r.meta && Object.keys(r.meta).length ? (
                        // Readable key/value pairs, not a truncated JSON blob.
                        <dl className="space-y-0.5 max-h-32 overflow-auto pr-2">
                          {Object.entries(r.meta).map(([k, v]) => (
                            <div key={k} className="flex gap-2">
                              <dt className="text-faint shrink-0">{k}:</dt>
                              <dd className="text-ink break-words">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : (
                        <span className="text-faint">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {hasMore && !loading && (
          <div className="flex justify-center mt-4">
            <button onClick={() => load(offset + limit, true)} disabled={loadingMore}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-elevated text-muted border border-line/20 hover:border-line/40 disabled:opacity-50">
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </main>
    </Layout>
  );
}