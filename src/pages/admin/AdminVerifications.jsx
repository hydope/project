import { useEffect, useState, useCallback } from 'react';
import Layout from '@/layouts/MainLayout';
import { useToast } from '@lib/useToast';
import { http, useRemote } from '@lib/api/transport';
import { RefreshCw, BadgeCheck, XCircle, Eye, FileText, CheckCheck } from 'lucide-react';

/**
 * Document verification queue.
 *
 * This was a filter dropdown over an empty list: no counts, no history, and no
 * way to see a submission without knowing an id. An operator could not tell an
 * empty queue from a broken one, and could not find out what they had already
 * approved.
 *
 * Now: counts on every tab, the submission actually rendered inline, bulk
 * review behind a confirmation, and the review history in view.
 */

const TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

const KIND_LABEL = { id: 'ID document', selfie: 'Selfie', document: 'ID document' };

function ago(iso) {
  const then = new Date(`${String(iso).replace(' ', 'T')}Z`).getTime();
  if (Number.isNaN(then)) return String(iso ?? '');
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days < 30 ? `${days}d ago` : new Date(then).toLocaleDateString();
}

export default function AdminVerifications() {
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('pending');
  const [fileUrl, setFileUrl] = useState('');
  const [selected, setSelected] = useState([]);
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const { addToast } = useToast();

  const load = useCallback(async (s = status) => {
    setLoading(true);
    try {
      if (!useRemote) { setItems([]); return; }
      const data = await http.get(`/api/admin/verifications?status=${encodeURIComponent(s)}`);
      setItems(data.rows || []);
      setCounts(data.counts || { pending: 0, approved: 0, rejected: 0 });
    } catch (e) {
      addToast(e.message || 'Could not load verifications.', 'error');
    } finally {
      setLoading(false);
    }
  }, [status, addToast]);

  useEffect(() => { load(status); setSelected([]); setFileUrl(''); }, [status, load]);

  const act = async (id, action) => {
    try {
      await http.post(`/api/admin/verifications/${encodeURIComponent(id)}/${action}`, { note: note || undefined });
      addToast(action === 'approve'
        ? 'Approved — verified badge is live for this member.'
        : 'Rejected — the member can resubmit.', 'success');
      setNote('');
      await load();
    } catch (e) {
      addToast(e.message || 'Action failed.', 'error');
    }
  };

  /**
   * Load the encrypted-at-rest submission through the authenticated endpoint and
   * render it from a blob URL. The raw URL is never put in an <img src>: it
   * needs a bearer header, and the bytes must not land in a referrer or cache.
   */
  const openFile = async (id) => {
    setFileUrl('');
    try {
      const token = localStorage.getItem('sh_token');
      const res = await fetch(`/api/admin/verifications/${encodeURIComponent(id)}/file`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Could not load that image');
      setFileUrl(URL.createObjectURL(await res.blob()));
    } catch (e) {
      addToast(e.message || 'Could not load that image.', 'error');
    }
  };

  const runBulk = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      const res = await http.post('/api/admin/verifications/bulk', {
        ids: confirm.ids, verb: confirm.verb, note: note || undefined,
      });
      addToast(`${res.affected ?? 0} submission(s) ${confirm.verb}d.`, 'success');
      setSelected([]);
      setNote('');
      setConfirm(null);
      await load();
    } catch (e) {
      addToast(e.message || 'Bulk action failed.', 'error');
    } finally {
      setBusy(false);
    }
  };
return (
    <Layout>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <header className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-ink">Verification queue</h1>
            <p className="text-sm text-muted mt-1">
              Selfie and ID submissions. Approving sets the public verified badge; rejecting asks
              the member to resubmit. A person reviews every one.
            </p>
          </div>
          <button onClick={() => load(status)} disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-elevated text-muted border border-line/20 disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </header>

        {/* Counts on every tab, so an empty queue is distinguishable from a
            broken one and past decisions stay discoverable. */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setStatus(t.key)}
              className={`rounded-xl border p-4 text-left transition-colors ${
                status === t.key ? 'border-primary bg-primary/5' : 'border-line/20 bg-elevated hover:border-line/40'}`}>
              <p className="text-xs font-semibold text-muted">{t.label}</p>
              <p className="text-2xl font-bold text-ink mt-1">{counts[t.key] ?? 0}</p>
            </button>
          ))}
        </div>

        {status === 'pending' && selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-4 p-3 rounded-xl bg-primary/10 border border-primary/30">
            <span className="text-xs font-semibold text-ink">{selected.length} selected</span>
            <input value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Note sent to the member (used for rejections)"
              aria-label="Review note" className="input flex-1 min-w-[180px]" />
            <button onClick={() => setConfirm({ ids: selected, verb: 'approve' })}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-white">
              <BadgeCheck className="w-3.5 h-3.5" /> Approve all
            </button>
            <button onClick={() => setConfirm({ ids: selected, verb: 'reject' })}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-line/30 text-muted">
              <XCircle className="w-3.5 h-3.5" /> Reject all
            </button>
            <button onClick={() => setSelected([])}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-muted hover:text-ink">Clear</button>
          </div>
        )}
        {loading && !items.length ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-20 rounded-xl" />)}</div>
        ) : !items.length ? (
          <div className="empty-state">
            <div className="text-muted mb-3 flex justify-center"><FileText className="w-12 h-12" /></div>
            <h3 className="empty-state-title">
              {status === 'pending' ? 'Nothing waiting' : `No ${status} submissions`}
            </h3>
            <p className="empty-state-text">
              {status === 'pending'
                ? 'Every submission has been reviewed. New ones appear here.'
                : `Nothing has been ${status} yet.`}
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((v) => (
              <li key={v.id} className="rounded-xl border border-line/20 bg-elevated p-4">
                <div className="flex flex-wrap items-start gap-3">
                  {status === 'pending' && (
                    <input type="checkbox"
                      checked={selected.includes(v.id)}
                      onChange={() => setSelected((s) => (s.includes(v.id)
                        ? s.filter((x) => x !== v.id) : [...s, v.id]))}
                      aria-label={`Select submission from ${v.member_name || v.member_email}`}
                      className="mt-1" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">{v.member_name || v.member_email}</p>
                    <p className="text-xs text-muted mt-0.5">
                      {v.member_email} · {KIND_LABEL[v.kind] || v.kind} · submitted {ago(v.created_at)}
                    </p>
                    {v.review_note && <p className="text-xs text-muted mt-1 italic">Note: {v.review_note}</p>}
                    {v.reviewed_at && <p className="text-xs text-muted mt-0.5">Reviewed {ago(v.reviewed_at)}</p>}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button onClick={() => openFile(v.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-line/30 text-muted">
                      <Eye className="w-3.5 h-3.5" /> View
                    </button>
                    {status === 'pending' && (
                      <>
                        <button onClick={() => act(v.id, 'approve')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-white">
                          <BadgeCheck className="w-3.5 h-3.5" /> Approve
                        </button>
                        <button onClick={() => act(v.id, 'reject')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-line/30 text-muted">
                          <XCircle className="w-3.5 h-3.5" /> Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {fileUrl && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
            onClick={() => setFileUrl('')} role="dialog" aria-modal="true" aria-label="Submission image">
            <img src={fileUrl} alt="Identity submission" className="max-w-full max-h-full rounded-xl shadow-2xl" />
            <button onClick={() => setFileUrl('')}
              className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
              aria-label="Close image">
              <XCircle className="w-6 h-6" />
            </button>
          </div>
        )}

        {confirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
            <div role="dialog" aria-modal="true" aria-label="Confirm bulk review"
              className="w-full max-w-sm rounded-xl bg-elevated border border-line/20 p-5 shadow-xl">
              <h3 className="text-base font-bold text-ink">
                {confirm.verb === 'approve' ? 'Approve' : 'Reject'} {confirm.ids.length} submission(s)?
              </h3>
              <p className="text-sm text-muted mt-2">
                {confirm.verb === 'approve'
                  ? 'Each of these members gets the public verified badge immediately. This cannot be undone from this page.'
                  : 'Each member is told to resubmit, and can submit again.'}
                {note && <> Your note: <em className="text-ink">{note}</em></>}
              </p>
              <div className="flex justify-end gap-2 mt-5">
                <button onClick={() => setConfirm(null)}
                  className="px-3 py-2 rounded-lg text-sm font-semibold border border-line/30 text-muted">Cancel</button>
                <button onClick={runBulk} disabled={busy}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-primary text-white disabled:opacity-50">
                  <CheckCheck className="w-4 h-4" /> {busy ? 'Working…' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </Layout>
  );
}
