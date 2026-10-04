import { useState, useEffect, useCallback, useRef } from 'react';
import Layout from '@/layouts/MainLayout';
import { http } from '@/lib/api/transport';
import { Search, Users, RefreshCw, X, ShieldCheck, Ban, History, Mail } from 'lucide-react';

/**
 * Member directory â€” searchable, paginated, with a full detail drawer.
 *
 * Replaces AdminRoles, which listed a flat LIMIT 100 of users with no search, so
 * nobody could be found. Search matches email, display name or exact id.
 * Selecting a member loads /api/admin/user/:id, which returns their reports,
 * verifications, interests, prior admin actions and message count in one call.
 */
export default function AdminMembers() {
  const [q, setQ] = useState('');
  const [data, setData] = useState({ rows: [], hasMore: false, count: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [limit, setLimit] = useState(25);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailBusy, setDetailBusy] = useState(false);

  // Monotonic request id — see load() below.
  const reqId = useRef(0);

  const load = useCallback(async () => {
    // Monotonic request id. Search is debounced, but a slow response for "a" can
    // still land AFTER a fast response for "ali" — without this guard the older
    // result overwrote the newer one and the list showed the wrong members.
    // Only the newest request is allowed to write state.
    const id = ++reqId.current;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (q.trim()) params.set('q', q.trim());
      const result = await http.get(`/api/admin/users?${params}`);
      if (id !== reqId.current) return; // a newer search already won
      setData(result);
    } catch (e) {
      if (id !== reqId.current) return;
      setError(e?.message || 'Could not load members.');
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [q, limit]);

  // Debounce so typing does not fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const open = async (row) => {
    setSelected(row);
    setDetail(null);
    setDetailBusy(true);
    try {
      setDetail(await http.get(`/api/admin/user/${row.id}`));
    } catch (e) {
      setError(e?.message || 'Could not load that member.');
    } finally {
      setDetailBusy(false);
    }
  };

  const unblock = async (id) => {
    try {
      await http.post(`/api/admin/users/${id}/unblock`, {});
      await load();
      setDetail(await http.get(`/api/admin/user/${id}`));
    } catch (e) {
      setError(e?.message || 'Could not unblock that member.');
    }
  };

  return (
    <Layout>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <header className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-ink">Members</h1>
            <p className="text-sm text-muted mt-1">Search by email, display name or member id.</p>
          </div>
          <button onClick={load} disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-elevated text-muted border border-line/20 hover:border-line/40 disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </header>

        <div className="relative mb-5">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search members"
            className="input w-full pl-10" aria-label="Search members" />
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-line/20 bg-elevated p-3 text-sm text-muted">{error}</div>
        )}

        {loading && !data.rows.length ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
        ) : !data.rows.length ? (
          <div className="empty-state">
            <div className="text-muted mb-3 flex justify-center"><Users className="w-12 h-12" /></div>
            <h2 className="empty-state-title">No members found</h2>
            <p className="empty-state-text">
              {q ? `Nothing matched "${q}". Try an email, a display name or a full member id.`
                  : 'There are no members yet.'}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-line/20 bg-elevated overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-hover/50">
                <tr className="text-left text-xs text-muted">
                  <th className="px-4 py-3 font-semibold">Member</th>
                  <th className="px-4 py-3 font-semibold">Location</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id} className="border-t border-line/15 hover:bg-hover/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink">{r.display_name}</p>
                      <p className="text-xs text-muted flex items-center gap-1"><Mail className="w-3 h-3" />{r.email}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">{[r.city, r.country].filter(Boolean).join(', ') || '-'}</td>
                    <td className="px-4 py-3"><span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-hover">{r.role}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {r.email_verified && <span title="Email verified" className="text-primary"><ShieldCheck className="w-4 h-4" /></span>}
                        {r.id_verified && <span title="ID verified" className="text-success"><ShieldCheck className="w-4 h-4" /></span>}
                        {r.is_blocked && <span title="Blocked" className="text-danger"><Ban className="w-4 h-4" /></span>}
                        {!r.email_verified && !r.id_verified && !r.is_blocked && <span className="text-xs text-muted">Unverified</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => open(r)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-line/30 text-muted hover:border-line/50">
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between mt-4">
          {/* A real total beats "25+": the operator can tell whether the page is showing
              everything or a slice of something much larger. */}
          <p className="text-xs text-muted">
  Showing {data.rows.length}{data.total ? ` of ${data.total}` : ''}{data.hasMore ? ' — more available' : ''}
</p>
          <div className="flex items-center gap-2">
            <button onClick={() => setLimit((l) => Math.max(25, l - 25))} disabled={limit <= 25}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-line/20 text-muted disabled:opacity-40">Fewer</button>
            <button onClick={() => setLimit((l) => l + 25)} disabled={!data.hasMore}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-line/20 text-muted disabled:opacity-40">More</button>
          </div>
        </div>
{selected && (
          <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-label={`Member ${selected.display_name}`}>
            <div className="absolute inset-0" onClick={() => setSelected(null)} />
            <aside className="relative w-full max-w-lg bg-elevated border-l border-line/20 overflow-y-auto p-6">
              <button onClick={() => setSelected(null)} aria-label="Close"
                className="absolute right-4 top-4 text-muted hover:text-ink"><X className="w-5 h-5" /></button>
              <h2 className="text-lg font-bold text-ink pr-8">{detail?.user?.display_name || selected.display_name}</h2>
              <p className="text-xs text-muted mt-0.5 break-all">{detail?.user?.email || selected.email}</p>
              {selected.is_blocked && (
                <button onClick={() => unblock(selected.id)}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-line/30 text-muted">
                  <Ban className="w-3.5 h-3.5" /> Unblock this member
                </button>
              )}
              {detailBusy && <div className="skeleton h-40 rounded-xl mt-4" />}
              {!detailBusy && detail && (
                <div className="space-y-5 mt-5">
                  {[
                    { label: 'Reports', rows: detail.reports, render: (x) => `${x.reason} (${x.status})` },
                    { label: 'Verifications', rows: detail.verifications, render: (x) => `${x.kind} - ${x.status}` },
                    { label: 'Interests', rows: detail.interests, render: (x) => `${x.from_user_id === selected.id ? 'sent to' : 'received from'} ${x.from_user_id === selected.id ? x.to_user_id : x.from_user_id}` },
                    { label: 'Admin actions on this member', rows: detail.audit, render: (x) => `${x.action} by ${x.actor_email || 'system'}` },
                  ].map(({ label, rows, render }) => (
                    <section key={label}>
                      <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">{label} ({rows.length})</h3>
                      {!rows.length ? <p className="text-xs text-muted">None</p> : (
                        <ul className="space-y-1">
                          {rows.map((x, i) => (
                            <li key={x.id || i} className="text-xs text-ink bg-hover/40 rounded px-2.5 py-1.5 truncate">{render(x)}</li>
                          ))}
                        </ul>
                      )}
                    </section>
                  ))}
                  <section>
                    <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Messages</h3>
                    <p className="text-xs text-muted flex items-center gap-1.5">
                      <History className="w-3.5 h-3.5" />{detail.messageCount} sent or received
                    </p>
                  </section>
                </div>
              )}
            </aside>
          </div>
        )}
      </main>
    </Layout>
  );
}