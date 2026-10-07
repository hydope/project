import Layout from '@/layouts/AdminLayout';
import { useEffect, useState, useCallback } from 'react';
import { useToast } from '@lib/useToast';
import { http, useRemote } from '@lib/api/transport';
import {
  RefreshCw, Search, ShieldAlert, Mail, Archive, Reply, AlertTriangle, CheckCheck,
} from 'lucide-react';

/**
 * Support inbox.
 *
 * This used to render a subject, a sender and a date and nothing else — the
 * `message` column came back from the API and was never displayed. An operator
 * could not read what they were being asked, could not reply, and could not
 * separate a real enquiry from the jmailservice.com marketing that made up five
 * of the seven items in the inbox.
 *
 * Now a two-pane inbox: list on the left, full message on the right, with spam
 * separation and bulk triage.
 */

const STATUS_LABELS = { new: 'New', read: 'Read', replied: 'Replied', archived: 'Archived' };
const TABS = [
  { key: '', label: 'All' },
  { key: 'new', label: 'Unread' },
  { key: 'replied', label: 'Replied' },
  { key: 'read', label: 'Read' },
  { key: 'archived', label: 'Archived' },
];

/** "3h ago". An inbox of absolute timestamps cannot be scanned. */
function ago(iso) {
  const then = new Date(`${String(iso).replace(' ', 'T')}Z`).getTime();
  if (Number.isNaN(then)) return String(iso ?? '');
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days < 30 ? `${days}d ago` : new Date(then).toLocaleDateString();
}

export default function AdminSupport() {
  const [reports, setReports] = useState([]);
  const [messages, setMessages] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('open');
  const [tab, setTab] = useState('contact'); // contact | reports
  const [msgFilter, setMsgFilter] = useState('');
  const [showSpam, setShowSpam] = useState(false);
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(null);
  const [selected, setSelected] = useState([]);
  const [confirm, setConfirm] = useState(null); // pending bulk action
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const { addToast } = useToast();

  const loadReports = useCallback(async (status = filter) => {
    setLoading(true);
    setLoadError('');
    try {
      if (!useRemote) { setReports([]); return; }
      setReports(await http.get(`/api/admin/reports?status=${encodeURIComponent(status)}`));
    } catch (e) {
      setLoadError(e.message || 'Could not load reports.');
      addToast(e.message || 'Could not load reports.', 'error');
    } finally {
      setLoading(false);
    }
  }, [filter, addToast]);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      if (!useRemote) { setMessages([]); return; }
      const params = new URLSearchParams();
      if (msgFilter) params.set('status', msgFilter);
      // Spam is opt-in, never the default view: an enquiry hidden behind a
      // forgotten toggle is worse than a little extra mail to skim.
      params.set('spam', showSpam ? '1' : '0');
      if (query.trim()) params.set('q', query.trim());
      const data = await http.get(`/api/contact?${params}`);
      setMessages(data.messages || []);
      setCounts(data.counts || {});
    } catch (e) {
      setLoadError(e.message || 'Could not load messages.');
      addToast(e.message || 'Could not load messages.', 'error');
    } finally {
      setLoading(false);
    }
  }, [msgFilter, showSpam, query, addToast]);

  useEffect(() => { if (tab === 'reports') loadReports(filter); }, [tab, filter, loadReports]);

  useEffect(() => {
    if (tab !== 'contact') return undefined;
    // Debounced so typing in the search box does not fire a request per key.
    const t = setTimeout(loadMessages, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [tab, loadMessages]);

  const active = messages.find((m) => m.id === openId) || null;

  // Opening marks read, so the unread badge and the open pane cannot disagree.
  const openMessage = async (m) => {
    setOpenId(m.id);
    if (m.status !== 'new') return;
    try {
      await http.put(`/api/contact/${m.id}`, { status: 'read' });
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, status: 'read' } : x)));
      setCounts((c) => ({ ...c, new: Math.max(0, (c.new || 0) - 1) }));
    } catch { /* a failed read receipt must never block reading the message */ }
  };

  const setMsgStatus = async (id, patch, successMsg) => {
    try {
      await http.put(`/api/contact/${id}`, patch);
      addToast(successMsg, 'success');
      await loadMessages();
    } catch (e) {
      addToast(e.message || 'That did not save.', 'error');
    }
  };

  const toggleSelect = (id) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const runBulk = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      const res = await http.put('/api/contact/bulk', { ids: confirm.ids, ...confirm.body });
      addToast(`${res.updated} message(s) updated.`, 'success');
      setSelected([]);
      setConfirm(null);
      await loadMessages();
    } catch (e) {
      addToast(e.message || 'Bulk action failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Reply opens the operator's mail client with the original quoted. There is no
   * outbound transport for admin replies yet; pretending otherwise would be worse
   * than making the extra step explicit.
   */
  const reply = (m) => {
    const quoted = `\n\n---\nOn ${m.created_at}, ${m.name} <${m.email}> wrote:\n${m.message}`;
    window.location.href = `mailto:${encodeURIComponent(m.email)}`
      + `?subject=${encodeURIComponent(`Re: ${m.subject}`)}`
      + `&body=${encodeURIComponent(quoted)}`;
    setMsgStatus(m.id, { status: 'replied' }, 'Marked as replied.');
  };

  const copyEmail = async (m) => {
    try {
      await navigator.clipboard.writeText(m.email);
      addToast('Email address copied.', 'success');
    } catch {
      addToast('Could not copy — select the address manually.', 'error');
    }
  };

  const act = async (id, action) => {
    try {
      await http.post(`/api/admin/reports/${encodeURIComponent(id)}/${action}`, {});
      addToast(action === 'action' ? 'Report actioned — content hidden.' : 'Report dismissed.', 'success');
      loadReports();
    } catch (e) {
      addToast(e.message || 'Action failed.', 'error');
    }
  };
return (
    <Layout>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <header className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-ink">Support inbox</h1>
            <p className="text-sm text-muted mt-1">
              Contact form messages and member safety reports, all in one place.
            </p>
          </div>
          <button
            onClick={() => (tab === 'reports' ? loadReports(filter) : loadMessages())}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-elevated text-muted border border-line/20 hover:border-line/40 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </header>

        {loadError && (
          <div className="mb-4 rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
            {loadError}
          </div>
        )}

        <div className="flex gap-2 mb-5">
          <button onClick={() => setTab('contact')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 ${tab === 'contact' ? 'bg-primary text-white' : 'bg-elevated text-muted border border-line/20'}`}>
            <Mail className="w-4 h-4" /> Contact messages
            {(counts.new || 0) > 0 && (
              <span className="bg-white/25 rounded-full px-2 py-0.5 text-xs">{counts.new}</span>
            )}
          </button>
          <button onClick={() => setTab('reports')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 ${tab === 'reports' ? 'bg-primary text-white' : 'bg-elevated text-muted border border-line/20'}`}>
            <ShieldAlert className="w-4 h-4" /> Safety reports
          </button>
        </div>

        {tab === 'reports' ? (
          <section className="space-y-3">
            <div className="flex gap-2">
              {['open', 'actioned', 'dismissed'].map((s) => (
                <button key={s} onClick={() => setFilter(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize ${filter === s ? 'bg-primary text-white' : 'bg-elevated text-muted border border-line/20'}`}>
                  {s}
                </button>
              ))}
            </div>
            {loading && !reports.length ? (
              <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>
            ) : !reports.length ? (
              <p className="text-sm text-muted">No reports with that status.</p>
            ) : reports.map((r) => (
              <article key={r.id} className="rounded-xl border border-line/20 bg-elevated p-4">
                <p className="text-sm font-semibold text-ink">{r.reason}</p>
                <p className="text-xs text-muted mt-1">
                  Reported {r.target_type} by {r.reporter_email || 'member'} · {ago(r.created_at)}
                </p>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => act(r.id, 'action')}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-danger text-white">Take action</button>
                  <button onClick={() => act(r.id, 'dismiss')}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-line/30 text-muted">Dismiss</button>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <section className="rounded-xl border border-line/20 bg-elevated overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 p-3 border-b border-line/15">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name, email, subject or body"
                  aria-label="Search messages"
                  className="input w-full"
                  style={{ paddingLeft: '2.25rem' }}
                />
              </div>
              <button onClick={() => setShowSpam((s) => !s)}
                className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${showSpam ? 'bg-danger text-white' : 'bg-hover text-muted border border-line/20'}`}>
                <AlertTriangle className="w-3.5 h-3.5" /> Spam
                {(counts.spam || 0) > 0 && <span className="opacity-80">{counts.spam}</span>}
              </button>
            </div>

            <div className="flex flex-wrap gap-1 px-3 pt-3">
              {TABS.map((t) => (
                <button key={t.key} onClick={() => setMsgFilter(t.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${msgFilter === t.key ? 'bg-primary text-white' : 'text-muted hover:bg-hover'}`}>
                  {t.label} ({t.key === '' ? (counts.all || 0) : (counts[t.key] || 0)})
                </button>
              ))}
            </div>

            {/* Bulk bar appears only with a selection — a permanent row of
                buttons above an empty inbox is noise, and bulk archive is the
                kind of action that must never be one stray click away. */}
            {selected.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-3 mx-3 p-2.5 rounded-lg bg-primary/10 border border-primary/30">
                <span className="text-xs font-semibold text-ink">{selected.length} selected</span>
                <button onClick={() => setConfirm({ ids: selected, body: { spam: !showSpam }, label: showSpam ? 'un-spam' : 'mark as spam' })}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-line/30 text-muted">
                  {showSpam ? 'Not spam' : 'Mark spam'}
                </button>
                <button onClick={() => setConfirm({ ids: selected, body: { status: 'replied' }, label: 'mark as replied' })}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-line/30 text-muted">Replied</button>
                <button onClick={() => setConfirm({ ids: selected, body: { status: 'archived' }, label: 'archive' })}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-line/30 text-muted">
                  <Archive className="w-3.5 h-3.5" /> Archive
                </button>
                <button onClick={() => setSelected([])}
                  className="ml-auto px-2.5 py-1.5 rounded-lg text-xs font-semibold text-muted hover:text-ink">
                  Clear
                </button>
              </div>
            )}

            <div className="grid md:grid-cols-[minmax(0,380px)_1fr] mt-3 border-t border-line/15">
              {/* LIST */}
              <div className="max-h-[32rem] overflow-y-auto border-r border-line/15">
                {loading && !messages.length ? (
                  <div className="space-y-2 p-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-16 rounded-lg" />)}</div>
                ) : !messages.length ? (
                  <div className="empty-state">
                    <h3 className="empty-state-title">Nothing here</h3>
                    <p className="empty-state-text">
                      {showSpam ? 'No messages are flagged as spam.' : query ? 'No message matches that search.' : 'This view is empty.'}
                    </p>
                  </div>
                ) : messages.map((m) => (
                  <div key={m.id}
                    className={`flex gap-2.5 p-3 border-b border-line/10 cursor-pointer transition-colors ${openId === m.id ? 'bg-primary/5' : 'hover:bg-hover'}`}>
                    <input type="checkbox" checked={selected.includes(m.id)}
                      onChange={() => toggleSelect(m.id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select message from ${m.name}`}
                      className="mt-1 shrink-0" />
                    <button onClick={() => openMessage(m)} className="flex-1 min-w-0 text-left">
                      <div className="flex items-baseline gap-2">
                        <span className={`text-sm truncate ${m.status === 'new' ? 'font-bold text-ink' : 'font-medium text-muted'}`}>
                          {m.name}
                        </span>
                        <span className="text-[11px] text-muted ml-auto shrink-0">{ago(m.created_at)}</span>
                      </div>
                      <p className="text-xs font-medium text-ink truncate mt-0.5">{m.subject}</p>
                      <p className="text-xs text-muted truncate mt-0.5">{m.message}</p>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        {m.status !== 'new' && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-hover text-muted">
                            {STATUS_LABELS[m.status]}
                          </span>
                        )}
                        {!!m.is_spam && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-danger/10 text-danger">Spam</span>
                        )}
                      </div>
                    </button>
                  </div>
                ))}
              </div>
              <div className="p-5 max-h-[32rem] overflow-y-auto">
                {!active ? (
                  <div className="empty-state h-full flex flex-col items-center justify-center">
                    <Mail className="w-10 h-10 text-muted mb-3" />
                    <p className="text-sm text-muted">Select a message to read it.</p>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-start gap-3 mb-4">
                      <div className="min-w-0 flex-1">
                        <h2 className="text-lg font-bold text-ink">{active.subject}</h2>
                        <p className="text-xs text-muted mt-1">
                          <button onClick={() => copyEmail(active)}
                            className="hover:text-primary hover:underline" title="Copy address">
                            {active.name} &lt;{active.email}&gt;
                          </button>
                          {' · '}{ago(active.created_at)} · {STATUS_LABELS[active.status]}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <button onClick={() => reply(active)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-white">
                          <Reply className="w-3.5 h-3.5" /> Reply
                        </button>
                        <button
                          onClick={() => setMsgStatus(active.id, { spam: !active.is_spam },
                            active.is_spam ? 'Moved out of spam.' : 'Marked as spam.')}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-line/30 text-muted"
                        >
                          {active.is_spam ? 'Not spam' : 'Spam'}
                        </button>
                        <button
                          onClick={() => setMsgStatus(active.id, { status: 'archived' }, 'Archived.')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-line/30 text-muted"
                        >
                          <Archive className="w-3.5 h-3.5" /> Archive
                        </button>
                      </div>
                    </div>
                    {/* The body — the reason this pane exists. */}
                    <div className="rounded-lg bg-hover p-4 text-sm text-ink leading-relaxed whitespace-pre-wrap break-words">
                      {active.message}
                    </div>
                    <p className="text-[11px] text-muted mt-3">
                      Reply opens your mail client with this message quoted.
                    </p>
                  </>
                )}
              </div>
            </div>
          </section>
        )}

        {confirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
            <div role="dialog" aria-modal="true" aria-label="Confirm bulk action"
              className="w-full max-w-sm rounded-xl bg-elevated border border-line/20 p-5 shadow-xl">
              <h3 className="text-base font-bold text-ink">Confirm bulk action</h3>
              <p className="text-sm text-muted mt-2">
                You are about to {confirm.label}{' '}
                <strong className="text-ink">{confirm.ids.length} message(s)</strong>.
                {confirm.body.spam === true && ' Flagged mail leaves the default inbox.'}
              </p>
              <div className="flex justify-end gap-2 mt-5">
                <button onClick={() => setConfirm(null)}
                  className="px-3 py-2 rounded-lg text-sm font-semibold border border-line/30 text-muted">
                  Cancel
                </button>
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
