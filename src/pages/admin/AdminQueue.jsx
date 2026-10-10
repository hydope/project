import { useState, useEffect, useCallback } from 'react';
import Layout from '@/layouts/AdminLayout';
import { http } from '@/lib/api/transport';
import { AlertTriangle, ShieldCheck, Flag, RefreshCw, Check, X, Inbox } from 'lucide-react';

/**
 * Moderation queue â€” one ranked worklist.
 *
 * Replaces the previous split of "Reports" and "Verifications" tabs, which hid
 * the real workload from each other: an operator could not see that five reports
 * and thirty verifications were pending at once, nor which were about to breach
 * an SLA. Items are severity-ordered and verifications action in bulk.
 */
export default function AdminQueue() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [note, setNote] = useState('');
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await http.get('/api/admin/queue'));
      setSelected([]);
    } catch (e) {
      setError(e?.message || 'Could not load the moderation queue.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const items = (data?.items || []).filter((i) => filter === 'all' || i.kind === filter);
  const verIds = items.filter((i) => i.kind === 'verification' && selected.includes(i.id)).map((i) => i.id);

  const act = async (id, verb) => {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await http.post(`/api/admin/verifications/${id}/${verb}`, { note });
      await load();
      setSuccess(`Verification ${verb}d.`);
    } catch (e) {
      setError(e?.message || 'That action failed.');
    } finally {
      setBusy(false);
    }
  };

  const bulk = async (verb) => {
    if (!verIds.length) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const res = await http.post('/api/admin/verifications/bulk', { ids: verIds, verb, note });
      setNote('');
      await load();
      if (res?.affected) setSuccess(`${res.affected} verification(s) ${verb}d.`);
    } catch (e) {
      setError(e?.message || 'Bulk action failed.');
    } finally {
      setBusy(false);
    }
  };

  const reportAction = async (id, verb) => {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const item = items.find(i => i.id === id);
      await http.post(`/api/admin/reports/${id}/${verb}`, {});
      await load();
      // Tell the admin what actually happened — previously the item just
      // vanished with no explanation.
      if (verb === 'action') {
        const what = item?.kind === 'report' ? 'The reported content was hidden' : 'Action taken';
        setSuccess(`${what} and the report was marked as actioned.`);
      } else {
        setSuccess('Report dismissed — no action taken on the content.');
      }
    } catch (e) {
      setError(e?.message || 'That action failed.');
    } finally {
      setBusy(false);
    }
  };

  const total = (data?.openReports || 0) + (data?.pendingVerifications || 0);

  return (
    <Layout>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <header className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-ink">Moderation queue</h1>
            <p className="text-sm text-muted mt-1">Every open report and pending verification, ranked by urgency.</p>
          </div>
          <div className="flex items-center gap-2">
            {['all', 'report', 'verification'].map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  filter === f ? 'bg-primary text-white' : 'bg-elevated text-muted border border-line/20 hover:border-line/40'}`}>
                {f === 'all' ? 'Everything' : f === 'report' ? 'Reports' : 'Verifications'}
              </button>
            ))}
            <button onClick={load} disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-elevated text-muted border border-line/20 hover:border-line/40 disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </header>

        {data && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              { label: 'Open reports', value: data.openReports, icon: Flag },
              { label: 'Pending verifications', value: data.pendingVerifications, icon: ShieldCheck },
              { label: 'Breaching SLA', value: data.urgent, icon: AlertTriangle, danger: data.urgent > 0 },
            ].map(({ label, value, icon: Icon, danger }) => (
              <div key={label}
                className={`rounded-xl p-4 border ${danger ? 'border-danger/30 bg-danger/5' : 'border-line/20 bg-elevated'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`w-4 h-4 ${danger ? 'text-danger' : 'text-muted'}`} />
                  <span className="text-xs text-muted">{label}</span>
                </div>
                <p className={`text-2xl font-bold ${danger ? 'text-danger' : 'text-ink'}`}>{value}</p>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-xl border border-line/20 bg-elevated p-3 text-sm text-muted" role="alert">{error}</div>
        )}
        {success && (
          <div className="mb-4 rounded-xl border border-line/20 bg-elevated p-3 text-sm font-medium" style={{ color: 'var(--color-success, #16a34a)' }} role="status">{success}</div>
        )}

        {verIds.length > 0 && (
          <div className="sticky top-20 z-20 mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-elevated p-3 shadow-lg">
            <span className="text-sm font-semibold text-ink">{verIds.length} selected</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Review note (optional)"
              className="input flex-1 min-w-[160px] text-sm" aria-label="Bulk review note" />
            <button onClick={() => bulk('approve')} disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-white disabled:opacity-50">
              <Check className="w-3.5 h-3.5" /> Approve all
            </button>
            <button onClick={() => bulk('reject')} disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-line/30 text-muted disabled:opacity-50">
              <X className="w-3.5 h-3.5" /> Reject all
            </button>
          </div>
        )}

        {loading && !data ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => <div key={i} className="skeleton h-16 rounded-xl" />)}
          </div>
        ) : !items.length ? (
          <div className="empty-state">
            <div className="text-muted mb-3 flex justify-center"><Inbox className="w-12 h-12" /></div>
            <h2 className="empty-state-title">{total === 0 ? 'Queue is clear' : 'Nothing in this filter'}</h2>
            <p className="empty-state-text">
              {total === 0
                ? 'No open reports and no pending verifications. Nothing needs a human right now.'
                : 'Switch filters to see the rest of the queue.'}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={`${item.kind}-${item.id}`}
                className={`flex items-center gap-4 rounded-xl border p-4 transition-colors ${
                  item.severity === 'urgent' ? 'border-danger/30 bg-danger/5' : 'border-line/20 bg-elevated hover:border-line/40'}`}>
                {item.kind === 'verification' && (
                  <input type="checkbox" checked={selected.includes(item.id)}
                    onChange={(e) => setSelected((s) => e.target.checked ? [...s, item.id] : s.filter((x) => x !== item.id))}
                    aria-label={`Select verification ${item.id}`} className="w-4 h-4 flex-shrink-0" />
                )}
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-hover">
                  {item.kind === 'report'
                    ? <Flag className="w-4 h-4 text-danger" />
                    : <ShieldCheck className="w-4 h-4 text-primary" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink truncate">{item.title}</p>
                  <p className="text-xs text-muted truncate">{item.subtitle}</p>
                </div>
                <span className={`text-[11px] font-semibold flex-shrink-0 ${
                  item.ageHours >= 48 ? 'text-danger' : item.ageHours >= 24 ? 'text-warning' : 'text-muted'}`}>
                  {item.ageHours < 1 ? '<1h' : item.ageHours < 48 ? `${item.ageHours}h` : `${Math.round(item.ageHours / 24)}d`}
                </span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {item.kind === 'report' ? (
                    <>
                      <button onClick={() => reportAction(item.id, 'action')} disabled={busy}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-primary text-white disabled:opacity-50">Action</button>
                      <button onClick={() => reportAction(item.id, 'dismiss')} disabled={busy}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-line/30 text-muted disabled:opacity-50">Dismiss</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => act(item.id, 'approve')} disabled={busy}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-primary text-white disabled:opacity-50">Approve</button>
                      <button onClick={() => act(item.id, 'reject')} disabled={busy}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-line/30 text-muted disabled:opacity-50">Reject</button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </Layout>
  );
}