import Layout from '@/layouts/MainLayout';
import { useEffect, useState } from 'react';
import { useToast } from '@lib/useToast';
import { http, useRemote } from '@lib/api/transport';
import { MailOpen, ShieldAlert } from 'lucide-react';

const STATUS_LABELS = { new: 'New', read: 'Read', replied: 'Replied', archived: 'Archived' };

export default function AdminSupport() {
  const [tab, setTab] = useState('contact'); // contact | reports
  const [reports, setReports] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('open');
  const [msgFilter, setMsgFilter] = useState('new');
  const [expanded, setExpanded] = useState(null);
  const [loadError, setLoadError] = useState('');
  const { addToast } = useToast();

  const loadReports = async (status = filter) => {
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
  };

  const loadMessages = async (status = msgFilter) => {
    setLoading(true);
    setLoadError('');
    try {
      if (!useRemote) { setMessages([]); return; }
      const data = await http.get(`/api/contact?status=${encodeURIComponent(status)}`);
      setMessages(data.messages || []);
    } catch (e) {
      setLoadError(e.message || 'Could not load messages.');
      addToast(e.message || 'Could not load messages.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'reports') loadReports(filter);
    else loadMessages(msgFilter);
  }, [tab, filter, msgFilter]);

  const act = async (id, action) => {
    try {
      await http.post(`/api/admin/reports/${encodeURIComponent(id)}/${action}`, {});
      addToast(action === 'action' ? 'Report actioned — content hidden.' : 'Report dismissed.', 'success');
      loadReports();
    } catch (e) {
      addToast(e.message || 'Action failed.', 'error');
    }
  };

  const setMsgStatus = async (id, status) => {
    try {
      await http.put(`/api/contact/${encodeURIComponent(id)}`, { status });
      addToast(`Marked as ${STATUS_LABELS[status].toLowerCase()}.`, 'success');
      loadMessages();
    } catch (e) {
      addToast(e.message || 'Action failed.', 'error');
    }
  };

  const newCount = msgFilter === 'new' ? messages.length : null;

  return (
    <Layout>
      <main>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <h1>Support inbox</h1>
          {!useRemote && (
            <span className="verified-pill"
              style={{ background: 'var(--color-primary-subtle)', color: 'var(--color-primary)' }}>
              Backend required
            </span>
          )}
        </div>
        <p>Contact form messages and member safety reports, all in one place.</p>

        <div style={{ display: 'flex', gap: '8px', margin: '20px 0' }}>
          <button onClick={() => setTab('contact')}
            className={`button px-4 py-2 text-sm font-semibold flex items-center gap-2 ${tab === 'contact' ? 'primary' : ''}`}
            style={tab !== 'contact' ? { background: 'var(--color-elevated)', border: '1px solid var(--color-border)' } : {}}>
            <MailOpen className="w-4 h-4" /> Contact messages
            {newCount > 0 && (
              <span className="bg-white/25 rounded-full px-2 py-0.5 text-xs">{newCount}</span>
            )}
          </button>
          <button onClick={() => setTab('reports')}
            className={`button px-4 py-2 text-sm font-semibold flex items-center gap-2 ${tab === 'reports' ? 'primary' : ''}`}
            style={tab !== 'reports' ? { background: 'var(--color-elevated)', border: '1px solid var(--color-border)' } : {}}>
            <ShieldAlert className="w-4 h-4" /> Safety reports
          </button>
        </div>

        {tab === 'contact' ? (
          <>
            <div className="settings-list" style={{ marginBottom: '24px' }}>
              <div className="toggle-row">
                <span>Filter by Status:</span>
                <select value={msgFilter} onChange={(e) => setMsgFilter(e.target.value)} aria-label="Filter messages by status">
                  <option value="new">New</option>
                  <option value="read">Read</option>
                  <option value="replied">Replied</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div className="empty-state"><p>Loading messages…</p></div>
            ) : loadError ? (
              // Never render the empty state on a failed load. "No new messages"
              // and "the request failed" look identical, and an operator reading
              // the first would conclude the inbox is genuinely empty.
              <div className="empty-state">
                <div className="text-muted mb-3 flex justify-center"><ShieldAlert className="w-10 h-10" /></div>
                <p className="empty-state-title">Could not load the inbox</p>
                <p className="empty-state-text">{loadError}</p>
                <button onClick={() => loadMessages(msgFilter)}
                  className="button primary mt-4 inline-flex">Retry</button>
              </div>
            ) : messages.length === 0 ? (
              <div className="empty-state">
                <p>No {msgFilter} messages.</p>
                <p style={{ marginTop: '4px' }}>New contact form submissions will appear here.</p>
              </div>
            ) : (
              <div className="settings-list">
                {messages.map((m) => (
                  <div key={m.id} className="toggle-row" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                      <div style={{ cursor: 'pointer', flex: 1 }} onClick={() => {
                        setExpanded(expanded === m.id ? null : m.id);
                        if (m.status === 'new') setMsgStatus(m.id, 'read');
                      }}>
                        <strong>{m.subject}</strong><br />
                        <small>from {m.name} &lt;{m.email}&gt; · {new Date(m.created_at).toLocaleString()}</small>
                        {expanded === m.id && (
                          <p style={{ marginTop: '10px', whiteSpace: 'pre-wrap' }}>{m.message}</p>
                        )}
                      </div>
                      <span className="verified-pill" style={{
                        background: m.status === 'new' ? 'var(--color-primary-subtle)' : 'var(--color-elevated)',
                        color: m.status === 'new' ? 'var(--color-primary)' : 'var(--color-muted)',
                        flexShrink: 0,
                      }}>{STATUS_LABELS[m.status] || m.status}</span>
                    </div>
                    {expanded === m.id && (
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <a href={`mailto:${m.email}?subject=Re: ${encodeURIComponent(m.subject)}`}
                          className="button primary px-3 py-1.5 text-xs font-semibold">Reply by email</a>
                        {m.status !== 'replied' && (
                          <button onClick={() => setMsgStatus(m.id, 'replied')}
                            className="button px-3 py-1.5 text-xs font-semibold"
                            style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
                            Mark replied
                          </button>
                        )}
                        {m.status !== 'archived' && (
                          <button onClick={() => setMsgStatus(m.id, 'archived')}
                            className="button px-3 py-1.5 text-xs font-semibold"
                            style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
                            Archive
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="settings-list" style={{ marginBottom: '24px' }}>
              <div className="toggle-row">
                <span>Filter by Status:</span>
                <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter reports by status">
                  <option value="open">Open</option>
                  <option value="actioned">Actioned</option>
                  <option value="dismissed">Dismissed</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div className="empty-state"><p>Loading reports…</p></div>
            ) : !useRemote ? (
              <div className="empty-state">
                <p>No backend connected.</p>
                <p style={{ marginTop: '4px' }}>Set VITE_API_URL to review live member reports here.</p>
              </div>
            ) : loadError ? (
              <div className="empty-state">
                <div className="text-muted mb-3 flex justify-center"><ShieldAlert className="w-10 h-10" /></div>
                <p className="empty-state-title">Could not load reports</p>
                <p className="empty-state-text">{loadError}</p>
                <button onClick={() => loadReports(filter)}
                  className="button primary mt-4 inline-flex">Retry</button>
              </div>
            ) : reports.length === 0 ? (
              <div className="empty-state">
                <p>No {filter} reports.</p>
                <p style={{ marginTop: '4px' }}>New member reports will appear here.</p>
              </div>
            ) : (
              <div className="settings-list">
                {reports.map((r) => (
                  <div key={r.id} className="toggle-row" style={{ alignItems: 'flex-start' }}>
                    <div>
                      <strong>{r.target_type}: {String(r.target_id).slice(0, 24)}</strong><br />
                      <small>by {r.reporter_email || r.reporter_id} · {new Date(r.created_at).toLocaleString()}</small>
                      <p style={{ marginTop: '6px' }}>{r.reason}</p>
                    </div>
                    {filter === 'open' && (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => act(r.id, 'action')} className="button primary px-3 py-1.5 text-xs font-semibold">Hide + action</button>
                        <button onClick={() => act(r.id, 'dismiss')} className="button px-3 py-1.5 text-xs font-semibold" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>Dismiss</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </Layout>
  );
}
