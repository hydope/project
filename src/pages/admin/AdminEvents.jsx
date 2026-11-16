import { useState, useEffect, useCallback } from 'react';
import Layout from '@/layouts/AdminLayout';
import { http } from '@/lib/api/transport';
import { ScrollText, RefreshCw } from 'lucide-react';

/**
 * User Logs — the website activity log (Syed's ask, 2026-11-15).
 *
 * Every form submit, validation failure and client crash the site
 * records through POST /api/analytics/event lands here, newest first:
 * what happened, on which page, by whom (signed-in member's email, or
 * "Guest"), and the error message the member saw. Field VALUES are
 * never logged — the server allowlists detail keys — so this page can
 * show field names and messages only, by construction.
 */
const KIND_FILTERS = [
  { key: '', label: 'All' },
  { key: 'error', label: 'Crashes & errors' },
  { key: 'submit', label: 'Form submits' },
  { key: 'validation', label: 'Validation failures' },
  { key: 'api', label: 'API failures' },
  { key: 'search', label: 'Zero-result searches' },
  { key: 'onboarding', label: 'Onboarding steps' },
];

const KIND_BADGE = {
  error: 'bg-red-100 text-red-800',
  submit: 'bg-emerald-100 text-emerald-800',
  validation: 'bg-amber-100 text-amber-800',
  api: 'bg-sky-100 text-sky-800',
  search: 'bg-violet-100 text-violet-800',
  onboarding: 'bg-teal-100 text-teal-800',
};

function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(String(ts).replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? String(ts) : d.toLocaleString();
}

export default function AdminEvents() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [kind, setKind] = useState('');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(200);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (kind) params.set('kind', kind);
      if (query.trim()) params.set('q', query.trim());
      const data = await http.get(`/api/admin/events?${params.toString()}`);
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e) {
      setError(e?.message || 'Could not load the user logs.');
    } finally {
      setLoading(false);
    }
  }, [kind, query, limit]);

  useEffect(() => { load(); }, [load]);

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ScrollText className="w-6 h-6" /> User Logs
          </h1>
          <button className="btn btn-secondary flex items-center gap-2" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
        <p className="text-sm opacity-70 mb-6">
          Everything members do on the website that the site records — form submits, validation
          failures, and crashes — newest first. For privacy, typed values are never logged:
          you see the form, the field name, and the message the member saw.
        </p>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search logs — form, page, message…"
            className="px-3 py-1.5 rounded-full text-sm border border-current/20 bg-transparent min-w-[240px]"
            aria-label="Search user logs"
          />
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}
            className="px-3 py-1.5 rounded-full text-sm border border-current/20 bg-transparent" aria-label="Rows to show">
            <option value={100}>100 rows</option>
            <option value={200}>200 rows</option>
            <option value={500}>500 rows</option>
          </select>
          <span className="text-xs opacity-60">Logs are kept for 90 days.</span>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {KIND_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setKind(f.key)}
              className={`px-3 py-1.5 rounded-full text-sm border ${kind === f.key ? 'bg-emerald-700 text-white border-emerald-700' : 'border-current/20'}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {error && <div className="bg-red-50 text-red-800 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>}

        {loading ? (
          <p className="opacity-60 text-sm">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="opacity-60 text-sm">No log entries yet for this filter. Entries appear as members use the site.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-black/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left bg-black/5">
                  <th className="px-3 py-2 font-semibold">When</th>
                  <th className="px-3 py-2 font-semibold">Type</th>
                  <th className="px-3 py-2 font-semibold">What</th>
                  <th className="px-3 py-2 font-semibold">Page</th>
                  <th className="px-3 py-2 font-semibold">User</th>
                  <th className="px-3 py-2 font-semibold">Detail</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-black/5 align-top">
                    <td className="px-3 py-2 whitespace-nowrap opacity-80">{fmtTime(r.created_at)}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${KIND_BADGE[r.kind] || 'bg-black/10'}`}>{r.kind}</span>
                    </td>
                    <td className="px-3 py-2 font-medium">{r.name || '—'}</td>
                    <td className="px-3 py-2 opacity-80">{r.page}</td>
                    <td className="px-3 py-2 opacity-80">{r.user_email || 'Guest'}</td>
                    <td className="px-3 py-2 opacity-80 max-w-[320px]">
                      {r.detail
                        ? [r.detail.field ? `field: ${r.detail.field}` : null,
                           r.detail.message || null,
                           r.detail.endpoint ? `${r.detail.endpoint}${r.detail.status ? ` (${r.detail.status})` : ''}` : null]
                            .filter(Boolean).join(' — ') || '—'
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
