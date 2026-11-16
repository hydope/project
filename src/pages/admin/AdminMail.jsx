import { useState, useEffect, useCallback } from 'react';
import Layout from '@/layouts/AdminLayout';
import { http } from '@/lib/api/transport';
import { Mail, RefreshCw, Search, Trash2, ArrowLeft, Paperclip, Plug } from 'lucide-react';

/**
 * Mail — read the site's own mailboxes (@shiarishta.com) in the panel
 * (Syed's ask, 2026-11-16). cPanel webmail is unreachable from some
 * networks and a chore on a phone; this reads the same mail server from
 * inside the product instead.
 *
 * Read-only by design: the server fetches with BODY.PEEK, so opening a
 * message never marks it read, and there is no delete/send here. A
 * mailbox is connected once with its password — the server proves the
 * login before storing anything, stores only an encrypted copy, and
 * never sends the password back. Message bodies render as plain text
 * (never HTML injection) because email content is untrusted input.
 */

function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? String(s) : d.toLocaleString();
}

export default function AdminMail() {
  const [accounts, setAccounts] = useState([]);
  const [transport, setTransport] = useState('');
  const [error, setError] = useState('');

  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [connecting, setConnecting] = useState(false);

  const [selectedId, setSelectedId] = useState(null);
  const [folders, setFolders] = useState([]);
  const [folder, setFolder] = useState('INBOX');
  const [qInput, setQInput] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [list, setList] = useState({ total: 0, rows: [] });
  const [loadingList, setLoadingList] = useState(false);

  const [openUid, setOpenUid] = useState(null);
  const [message, setMessage] = useState(null);
  const [loadingMsg, setLoadingMsg] = useState(false);

  const loadAccounts = useCallback(async () => {
    try {
      const [acc, st] = await Promise.all([
        http.get('/api/admin/mail/accounts'),
        http.get('/api/admin/mail/status'),
      ]);
      setAccounts(acc.rows || []);
      setTransport(st.transport || '');
      setSelectedId((prev) => prev || (acc.rows?.[0]?.id ?? null));
    } catch (e) {
      setError(e.message || 'Could not load mailboxes.');
    }
  }, []);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  const connect = async (e) => {
    e.preventDefault();
    setConnecting(true);
    setError('');
    try {
      await http.post('/api/admin/mail/accounts', { address: address.trim(), password });
      setPassword('');
      setAddress('');
      await loadAccounts();
    } catch (err) {
      setError(err.message || 'Could not connect that mailbox.');
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async (id) => {
    setError('');
    try {
      await http.del(`/api/admin/mail/accounts/${id}`);
      if (selectedId === id) { setSelectedId(null); setFolders([]); setList({ total: 0, rows: [] }); }
      await loadAccounts();
    } catch (err) {
      setError(err.message || 'Could not disconnect that mailbox.');
    }
  };

  // Folders for the selected mailbox.
  useEffect(() => {
    if (!selectedId) return;
    let live = true;
    http.get(`/api/admin/mail/accounts/${selectedId}/folders`)
      .then((res) => {
        if (!live) return;
        const names = (res.folders || []).map((f) => f.name);
        setFolders(names);
        setFolder((prev) => (names.includes(prev) ? prev : (names.includes('INBOX') ? 'INBOX' : (names[0] || 'INBOX'))));
      })
      .catch((err) => { if (live) setError(err.message || 'Could not list folders.'); });
    return () => { live = false; };
  }, [selectedId]);

  // Message list.
  const loadMessages = useCallback(async () => {
    if (!selectedId) return;
    setLoadingList(true);
    setError('');
    try {
      const params = new URLSearchParams({ folder, page: String(page) });
      if (query) params.set('q', query);
      const res = await http.get(`/api/admin/mail/accounts/${selectedId}/messages?${params.toString()}`);
      setList({ total: res.total || 0, rows: res.rows || [] });
    } catch (err) {
      setError(err.message || 'Could not read that folder.');
      setList({ total: 0, rows: [] });
    } finally {
      setLoadingList(false);
    }
  }, [selectedId, folder, query, page]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  const openMessage = async (uid) => {
    setOpenUid(uid);
    setMessage(null);
    setLoadingMsg(true);
    setError('');
    try {
      const params = new URLSearchParams({ folder, uid: String(uid) });
      const res = await http.get(`/api/admin/mail/accounts/${selectedId}/message?${params.toString()}`);
      setMessage(res);
    } catch (err) {
      setError(err.message || 'Could not open that message.');
    } finally {
      setLoadingMsg(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(list.total / 25));
  const selectedAccount = accounts.find((a) => a.id === selectedId);

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-3 mb-1">
          <Mail className="w-6 h-6" />
          <h1 className="text-xl font-bold">Mail</h1>
          <button type="button" onClick={loadMessages} className="ml-auto btn px-3 py-1.5 text-sm flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
        <p className="text-sm mb-5" style={{ color: 'var(--color-ink-secondary)' }}>
          Read the site&apos;s mailboxes here — confirmation codes, replies, support mail.
          Read-only: opening a message never marks it read in the mailbox.
          {transport && <span> Connection: {transport === 'php-imap' ? 'direct (php-imap)' : 'direct (socket fallback)'}.</span>}
        </p>

        {error && (
          <p role="alert" className="mb-4 text-sm px-3 py-2 rounded" style={{ background: 'var(--color-danger-soft, #fdecec)', color: 'var(--color-danger)' }}>
            {error}
          </p>
        )}

        {/* Connected mailboxes + connect form */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {accounts.map((a) => (
            <span
              key={a.id}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm border"
              style={{
                borderColor: 'var(--color-border)',
                background: a.id === selectedId ? 'var(--color-surface-2, #eef2ee)' : 'transparent',
                fontWeight: a.id === selectedId ? 600 : 400,
              }}
            >
              <button type="button" onClick={() => { setSelectedId(a.id); setPage(1); setOpenUid(null); }}>
                {a.address}
              </button>
              <button type="button" title="Disconnect mailbox" onClick={() => disconnect(a.id)} className="opacity-60 hover:opacity-100">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
          {accounts.length === 0 && (
            <span className="text-sm" style={{ color: 'var(--color-ink-faint)' }}>No mailbox connected yet.</span>
          )}
        </div>

        <form onSubmit={connect} className="flex flex-wrap gap-2 mb-6">
          <input
            type="email"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="mailbox@shiarishta.com"
            className="input px-3 py-2 text-sm"
            style={{ minWidth: 230 }}
            autoComplete="off"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mailbox password"
            className="input px-3 py-2 text-sm"
            style={{ minWidth: 200 }}
            autoComplete="new-password"
          />
          <button type="submit" disabled={connecting || !address || !password} className="btn px-4 py-2 text-sm flex items-center gap-2">
            <Plug className="w-4 h-4" /> {connecting ? 'Checking login…' : 'Connect mailbox'}
          </button>
          <span className="text-xs self-center" style={{ color: 'var(--color-ink-faint)' }}>
            The login is tested before anything is saved; the password is stored encrypted and never shown again.
          </span>
        </form>

        {selectedAccount && !openUid && (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <div className="flex flex-wrap gap-1.5">
                {folders.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => { setFolder(f); setPage(1); }}
                    className="px-2.5 py-1 rounded-full text-xs border"
                    style={{
                      borderColor: 'var(--color-border)',
                      background: f === folder ? 'var(--color-surface-2, #eef2ee)' : 'transparent',
                      fontWeight: f === folder ? 600 : 400,
                    }}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <form
                className="ml-auto flex gap-2"
                onSubmit={(e) => { e.preventDefault(); setQuery(qInput.trim()); setPage(1); }}
              >
                <input
                  value={qInput}
                  onChange={(e) => setQInput(e.target.value)}
                  placeholder="Search this mailbox"
                  className="input px-3 py-1.5 text-sm"
                  style={{ minWidth: 190 }}
                />
                <button type="submit" className="btn px-3 py-1.5 text-sm flex items-center gap-1.5">
                  <Search className="w-4 h-4" /> Search
                </button>
              </form>
            </div>

            <p className="text-xs mb-2" style={{ color: 'var(--color-ink-faint)' }}>
              {loadingList ? 'Loading…' : `${list.total} message${list.total === 1 ? '' : 's'} in ${folder}${query ? ` matching “${query}”` : ''}`}
            </p>

            <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
              {list.rows.map((r) => (
                <button
                  key={r.uid}
                  type="button"
                  onClick={() => openMessage(r.uid)}
                  className="w-full text-left py-2.5 px-2 flex items-baseline gap-3 hover:opacity-80"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block truncate text-sm" style={{ fontWeight: r.seen ? 400 : 700 }}>
                      {r.subject || '(no subject)'}
                    </span>
                    <span className="block truncate text-xs" style={{ color: 'var(--color-ink-secondary)' }}>{r.from}</span>
                  </span>
                  <span className="text-xs whitespace-nowrap" style={{ color: 'var(--color-ink-faint)' }}>{fmtDate(r.date)}</span>
                </button>
              ))}
              {!loadingList && list.rows.length === 0 && (
                <p className="py-6 text-sm text-center" style={{ color: 'var(--color-ink-faint)' }}>No messages here.</p>
              )}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-3 mt-4 text-sm">
                <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn px-3 py-1.5 disabled:opacity-40">Newer</button>
                <span>Page {page} of {totalPages}</span>
                <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="btn px-3 py-1.5 disabled:opacity-40">Older</button>
              </div>
            )}
          </>
        )}

        {openUid && (
          <div>
            <button type="button" onClick={() => setOpenUid(null)} className="btn px-3 py-1.5 text-sm flex items-center gap-2 mb-4">
              <ArrowLeft className="w-4 h-4" /> Back to {folder}
            </button>
            {loadingMsg && <p className="text-sm">Loading message…</p>}
            {message && (
              <article>
                <h2 className="text-lg font-bold mb-1">{message.subject || '(no subject)'}</h2>
                <p className="text-sm" style={{ color: 'var(--color-ink-secondary)' }}>
                  From: {message.from}<br />
                  To: {message.to}<br />
                  {fmtDate(message.date)}
                </p>
                {message.attachments?.length > 0 && (
                  <p className="text-sm mt-2 flex items-center gap-2">
                    <Paperclip className="w-4 h-4" /> {message.attachments.join(', ')}
                    <span style={{ color: 'var(--color-ink-faint)' }}>(attachments are listed, not downloadable yet)</span>
                  </p>
                )}
                <pre
                  className="mt-4 text-sm whitespace-pre-wrap break-words p-4 rounded"
                  style={{ background: 'var(--color-surface-2, #f6f6f3)', fontFamily: 'inherit' }}
                >
                  {message.text || '(this message has no readable text body)'}
                </pre>
              </article>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
