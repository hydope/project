import { useState, useEffect, useCallback } from 'react';
import Layout from '@/layouts/MainLayout';
import { http } from '@/lib/api/transport';
import { UserCheck, RefreshCw, ShieldCheck } from 'lucide-react';

/**
 * Wali / guardian links.
 *
 * Previously rendered fixture data. This reads the real wali_links table.
 * The share token is never sent to the client: it is the bearer credential that
 * opens a read-only view of that member's profile, so an admin list must never
 * be a way to harvest one.
 */
export default function AdminGuardians() {
  const [rows, setRows] = useState([]);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await http.get('/api/admin/wali');
      setRows(Array.isArray(res?.rows) ? res.rows : []);
      setAvailable(res?.available !== false);
    } catch (e) {
      setError(e?.message || 'Could not load companion links.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const active = rows.filter((r) => r.active).length;

  return (
    <Layout>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <header className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-ink">Wali &amp; guardians</h1>
            <p className="text-sm text-muted mt-1">Companion links members have issued to a family member.</p>
          </div>
          <button onClick={load} disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-elevated text-muted border border-line/20 hover:border-line/40 disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </header>

        {error && (
          <div className="mb-4 rounded-xl border border-line/20 bg-elevated p-3 text-sm text-muted">{error}</div>
        )}

        {!available ? (
          <div className="rounded-xl border border-line/20 bg-elevated p-4 text-sm text-muted">
            Companion links are not available on this database yet.
          </div>
        ) : loading && !rows.length ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
        ) : !rows.length ? (
          <div className="empty-state">
            <div className="text-muted mb-3 flex justify-center"><UserCheck className="w-12 h-12" /></div>
            <h2 className="empty-state-title">No companion links issued</h2>
            <p className="empty-state-text">
              When a member issues a wali link from Settings, it appears here with its
              {active > 0 ? ' current' : ''} status.
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted mb-3">{rows.length} link(s), {active} active</p>
            <div className="rounded-xl border border-line/20 bg-elevated overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-hover/50">
                  <tr className="text-left text-xs text-muted">
                    <th className="px-4 py-3 font-semibold">Member</th>
                    <th className="px-4 py-3 font-semibold">Created</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-line/15">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-ink">{r.profile_name || r.member_name || 'Member'}</p>
                        <p className="text-xs text-muted">{r.email}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">{String(r.created_at).slice(0, 16)}</td>
                      <td className="px-4 py-3">
                        {r.active ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
                            <ShieldCheck className="w-3.5 h-3.5" /> Active
                          </span>
                        ) : (
                          <span className="text-xs text-muted">Revoked</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </Layout>
  );
}
