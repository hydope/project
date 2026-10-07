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
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await http.get('/api/admin/audit?limit=100'));
    } catch (e) {
      setError(e?.message || 'Could not load the audit trail.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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
                      {r.target_id ? <span className="ml-1 text-faint">{String(r.target_id).slice(0, 12)}</span> : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted max-w-xs truncate">
                      {r.meta && Object.keys(r.meta).length ? JSON.stringify(r.meta) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </Layout>
  );
}