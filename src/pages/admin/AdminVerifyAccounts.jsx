import { useState, useEffect, useCallback } from 'react';
import Layout from '@/layouts/MainLayout';
import { http } from '@/lib/api/transport';
import { UserCheck, RefreshCw, Check, X, ShieldCheck, Flag, Search } from 'lucide-react';

/**
 * Manual account verification.
 *
 * Distinct from /admin/verifications, which reviews uploaded identity
 * documents. This is a human moderator deciding whether an ACCOUNT is genuine:
 * complete profile, real-looking identity, no duplicate registration. On a
 * marriage platform that decision is the trust gate, so each row carries the
 * evidence needed to make it rather than just a name and an Approve button.
 *
 * Signals are advisory. Nothing auto-decides: "no photo" is a reason to look
 * closer, not a reason to refuse someone.
 */

const FLAG_META = {
  no_bio: { label: 'No bio', tone: 'warning' },
  no_photo: { label: 'No photo', tone: 'warning' },
  email_unconfirmed: { label: 'Email unconfirmed', tone: 'danger' },
  no_sect: { label: 'No sect', tone: 'warning' },
  open_report: { label: 'Open report', tone: 'danger' },
  waiting_7d: { label: 'Waiting 7d+', tone: 'danger' },
};

function tone(t) {
  if (t === 'danger') return 'text-danger bg-danger/10';
  if (t === 'warning') return 'text-warning bg-warning/10';
  return 'text-muted bg-hover';
}

export default function AdminVerifyAccounts() {
  const [status, setStatus] = useState('unverified');
  const [data, setData] = useState({ rows: [], counts: null, available: true });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [flash, setFlash] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await http.get(`/api/admin/verification-queue?status=${status}&limit=200`));
      setSelected([]);
    } catch (e) {
      setError(e?.message || 'Could not load the verification queue.');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const rows = (data.rows || []).filter((r) => {
    if (!q.trim()) return true;
    const t = q.toLowerCase();
    return [r.display_name, r.email, r.city, r.profile_name]
      .filter(Boolean).some((v) => String(v).toLowerCase().includes(t));
  });

  const decide = async (id, decision, flags = []) => {
    setBusy(true);
    setError('');
    setFlash('');
    try {
      await http.post(`/api/admin/users/${id}/verify`, { decision, note: note || undefined, flags });
      setNote('');
      setFlash(decision === 'approve' ? 'Account verified.' : 'Account rejected.');
      await load();
    } catch (e) {
      setError(e?.message || 'That decision could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const bulk = async (decision) => {
    if (!selected.length) return;
    setBusy(true);
    setError('');
    setFlash('');
    try {
      const res = await http.post('/api/admin/verify/bulk', { ids: selected, decision, note: note || undefined });
      setNote('');
      setFlash(`${res?.affected ?? 0} account(s) ${decision === 'approve' ? 'verified' : 'rejected'}.`);
      await load();
    } catch (e) {
      setError(e?.message || 'Bulk decision failed.');
    } finally {
      setBusy(false);
    }
  };

  const counts = data.counts || {};
  const allSelected = rows.length > 0 && rows.every((r) => selected.includes(r.id));

  return (
    <Layout>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <header className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-ink">Verify accounts</h1>
            <p className="text-sm text-muted mt-1">
              A human decides, not a document scan. Every decision is logged.
            </p>
          </div>
          <button onClick={load} disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-elevated text-muted border border-line/20 hover:border-line/40 disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </header>

        {!data.available ? (
          <div className="rounded-xl border border-line/20 bg-elevated p-4 text-sm text-muted">
            Account verification is not available on this database yet. Run the schema
            migration to add the verification columns.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                { key: 'unverified', label: 'Awaiting review' },
                { key: 'verified', label: 'Verified' },
                { key: 'rejected', label: 'Rejected' },
              ].map((c) => (
                <button key={c.key} onClick={() => setStatus(c.key)}
                  className={`rounded-xl border p-4 text-left transition-all ${
                    status === c.key ? 'border-primary bg-primary/5' : 'border-line/20 bg-elevated hover:border-line/40'}`}>
                  <p className="text-xs text-muted">{c.label}</p>
                  <p className={`text-2xl font-bold mt-1 ${status === c.key ? 'text-primary' : 'text-ink'}`}>
                    {counts[c.key] ?? 0}
                  </p>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name, email or city"
                  className="input w-full pl-10" aria-label="Filter accounts" />
              </div>
              {rows.length > 0 && (
                <button onClick={() => setSelected(allSelected ? [] : rows.map((r) => r.id))}
                  className="px-3 py-2 rounded-lg text-xs font-semibold border border-line/30 text-muted hover:border-line/50">
                  {allSelected ? 'Clear selection' : `Select all ${rows.length}`}
                </button>
              )}
            </div>

            {error && (
              <div className="mb-4 rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger">{error}</div>
            )}
            {flash && (
              <div className="mb-4 rounded-xl border border-success/30 bg-success/5 p-3 text-sm text-success">{flash}</div>
            )}

            {selected.length > 0 && (
              <div className="sticky top-20 z-20 mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-elevated p-3 shadow-lg">
                <span className="text-sm font-semibold text-ink">{selected.length} selected</span>
                <input value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="Decision note (stored in the audit trail)" aria-label="Decision note"
                  className="input flex-1 min-w-[180px] text-sm" />
                <button onClick={() => bulk('approve')} disabled={busy}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-white disabled:opacity-50">
                  <Check className="w-3.5 h-3.5" /> Verify all
                </button>
                <button onClick={() => bulk('reject')} disabled={busy}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-line/30 text-muted disabled:opacity-50">
                  <X className="w-3.5 h-3.5" /> Reject all
                </button>
              </div>
            )}

            {loading && !rows.length ? (
              <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-24 rounded-xl" />)}</div>
            ) : !rows.length ? (
              <div className="empty-state">
                <div className="text-muted mb-3 flex justify-center"><UserCheck className="w-12 h-12" /></div>
                <h2 className="empty-state-title">
                  {status === 'unverified' ? 'Nothing waiting for review' : 'No accounts here'}
                </h2>
                <p className="empty-state-text">
                  {status === 'unverified'
                    ? 'Every account has been reviewed. New signups appear here automatically.'
                    : q ? 'Nothing matched your filter.' : 'No accounts in this state.'}
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {rows.map((r) => {
                  const ev = r.evidence || {};
                  const isSel = selected.includes(r.id);
                  return (
                    <li key={r.id}
                      className={`rounded-xl border p-4 transition-colors ${
                        isSel ? 'border-primary/50 bg-primary/5'
                          : (r.flags || []).includes('open_report') ? 'border-danger/30 bg-danger/5'
                          : 'border-line/20 bg-elevated'}`}>
                      <div className="flex items-start gap-3">
                        <input type="checkbox" checked={isSel} aria-label={`Select ${r.display_name}`}
                          onChange={(e) => setSelected((s) => e.target.checked ? [...s, r.id] : s.filter((x) => x !== r.id))}
                          className="w-4 h-4 mt-1 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-bold text-ink truncate">{r.profile_name || r.display_name}</p>
                            {r.username && (
                              <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-hover text-muted">@{r.username}</span>
                            )}
                            {ev.documentApproved && (
                              <span title="Identity document approved" className="text-success"><ShieldCheck className="w-4 h-4" /></span>
                            )}
                            {ev.hasWali && (
                              <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary">Wali linked</span>
                            )}
                            {r.verification_status === 'verified' && (
                              <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-success/10 text-success">Verified</span>
                            )}
                          </div>
                          <p className="text-xs text-muted mt-0.5 truncate">{r.email}</p>
                          <p className="text-xs text-muted mt-1">
                            {[
                              r.age ? `Age ${r.age}` : null,
                              r.gender,
                              [r.city, r.country].filter(Boolean).join(', '),
                              r.sect,
                              r.profession,
                            ].filter(Boolean).join(' · ') || 'No profile details yet'}
                          </p>
                        </div>
                        {/* Evidence, not a bare number: the moderator needs the
                            inputs behind the score to make the call. */}
                        <div className="w-32 flex-shrink-0 hidden sm:block">
                          <div className="flex items-center justify-between text-[11px] text-muted mb-1">
                            <span>Profile</span><span>{ev.completeness ?? 0}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-hover overflow-hidden">
                            <div className="h-full rounded-full bg-primary"
                              style={{ width: `${Math.max(ev.completeness ?? 0, 2)}%` }} />
                          </div>
                          <p className="text-[11px] text-muted mt-1.5">
                            {ev.photos ?? 0} photo{(ev.photos ?? 0) === 1 ? '' : 's'} · {ev.accountAgeDays ?? 0}d old
                          </p>
                        </div>
                      </div>

                      {(r.flags || []).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-3 pl-7">
                          {r.flags.map((f) => {
                            const m = FLAG_META[f] || { label: f, tone: 'default' };
                            return (
                              <span key={f} className={`text-[11px] font-semibold px-2 py-0.5 rounded ${tone(m.tone)}`}>
                                {m.label}
                              </span>
                            );
                          })}
                          {ev.duplicateOf > 1 && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded text-danger bg-danger/10">
                              <Flag className="w-3 h-3" />Possible duplicate ({ev.duplicateOf})
                            </span>
                          )}
                        </div>
                      )}

                      {status !== 'verified' && (
                        <div className="flex items-center gap-2 mt-3 pl-7">
                          <button onClick={() => decide(r.id, 'approve', r.flags)} disabled={busy}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-white disabled:opacity-50">
                            <Check className="w-3.5 h-3.5" /> Verify
                          </button>
                          <button onClick={() => decide(r.id, 'reject', r.flags)} disabled={busy}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-line/30 text-muted disabled:opacity-50">
                            <X className="w-3.5 h-3.5" /> Reject
                          </button>
                        </div>
                      )}

                      {r.verification_note && (
                        <p className="text-[11px] text-muted mt-2 pl-7 italic">Note: {r.verification_note}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </main>
    </Layout>
  );
}