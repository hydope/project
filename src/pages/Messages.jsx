import { usePageTitle } from '../lib/usePageTitle';
import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Layout from '../layouts/LandingLayout';
import { analytics } from '../lib/analytics';
import { computeCompatibility } from '../lib/compatibility';
import {
  Send, Search, ArrowLeft, MoreVertical, ShieldCheck, Sparkles, Check, X,
  MessageCircle, UserPlus, Info, Heart, Timer
} from 'lucide-react';

// ── Curated icebreakers — meaningful, marriage-focused conversation starters ─
const ICEBREAKERS = [
  "What does a peaceful home look like to you?",
  "How do you balance deen with daily work life?",
  "What role do you see family playing in the nikah process?",
  "What is one goal you are working toward this year?",
  "How would you describe your relationship with faith?",
  "What does an ideal weekend look like for your future family?",
  "What is something you are grateful for lately?"
];

// ── Real data — every conversation, request, and message comes from the API ──
// There are no demo conversations, no seeded threads, and no scripted members.
// An empty inbox is an honest empty inbox.
import { api } from '../lib/api/client';
import { http } from '../lib/api/transport';
import { blockMember } from '../lib/api/safety';
import { ReportFlag } from '../components/ReportFlag';
import ConfirmDialog from '../components/ConfirmDialog';

function initials(name) {
  const parts = String(name || 'M').trim().split(/\s+/);
  return ((parts[0]?.[0] || 'M') + (parts[1]?.[0] || '')).toUpperCase();
}

function timeAgo(iso) {
  try {
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return '';
    const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.round(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString();
  } catch { return ''; }
}

function Avatar({ name, size = 'w-10 h-10' }) {
  return (
    <span aria-hidden
      className={`${size} rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold`}
      style={{ background: 'var(--color-primary-subtle)', color: 'var(--color-primary)', border: '2px solid var(--color-border)' }}>
      {initials(name)}
    </span>
  );
}

// ── (Removed: demo intro requests, seeded threads, and per-browser message ──
// stores. Requests now come from GET /api/profiles/interests/received; threads
// from GET /api/messages/:id. Nothing here is fabricated.)

// ── Messages: Request Center + Chats with Chaperone mode ───────────────────
export default function Messages() {
  usePageTitle('Messages');
  const [convos, setConvos] = useState([]);
  const [convosLoading, setConvosLoading] = useState(true);
  const [convosError, setConvosError] = useState('');
  const [messagesByConvo, setMessagesByConvo] = useState({});
  const [disappearingByConvo, setDisappearingByConvo] = useState({});
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState('');
  const [requests, setRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestError, setRequestError] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [activeId, setActiveId] = useState(null);
  const [tab, setTab] = useState('chats'); // 'chats' | 'requests'
  // Requests were buried in a tab nobody opened. When introductions are
  // waiting and no conversation is active, land on Requests so they are
  // impossible to miss.
  useEffect(() => {
    if (!requestsLoading && requests.length > 0 && !activeId) setTab('requests');
  }, [requestsLoading, requests.length, activeId]);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState(null); // { ok, text } — transient safety confirmations
  // In-app block confirmation replaces window.confirm() (auto-dismissed by
  // automated browsers, silently cancelling the block).
  const [confirmBlock, setConfirmBlock] = useState(null); // convo awaiting confirmation
  const [blockBusy, setBlockBusy] = useState(false);
  const messagesEndRef = useRef(null);

  // Load real conversations + real intro requests from the API.
  useEffect(() => {
    let alive = true;
    api.getConversations()
      .then((list) => { if (alive) setConvos(Array.isArray(list) ? list : []); })
      .catch(() => { if (alive) setConvosError('Could not load your conversations.'); })
      .finally(() => { if (alive) setConvosLoading(false); });
    api.getReceivedInterests()
      .then((list) => { if (alive) setRequests(Array.isArray(list) ? list : []); })
      .catch(() => { if (alive) setRequests([]); })
      .finally(() => { if (alive) setRequestsLoading(false); });
    return () => { alive = false; };
  }, []);

  // Load the thread when a conversation is opened, then keep it fresh.
  // Previously the thread loaded exactly once — new messages from the other
  // person never appeared until a full page reload.
  const loadThread = useRef(null);
  loadThread.current = async (cid, silent = false) => {
    if (!silent) { setThreadLoading(true); setThreadError(''); }
    try {
      const res = await api.getMessages(cid);
      // Server returns { messages, disappearing_after }; be tolerant of the
      // legacy bare-array shape too.
      const msgs = Array.isArray(res) ? res : (res?.messages ?? []);
      const disappearing = Array.isArray(res) ? 0 : (res?.disappearing_after ?? 0);
      setDisappearingByConvo((prev) => ({ ...prev, [cid]: disappearing }));
      const normalized = msgs.map((m) => ({
        id: m.id,
        sender: m.senderId === 'me' ? 'me' : 'them',
        text: m.text,
        time: timeAgo(m.timestamp),
      }));
      setMessagesByConvo((prev) => {
        const existing = prev[cid] || [];
        const seen = new Set(existing.map((m) => m.id));
        const merged = [...existing];
        for (const m of normalized) {
          if (!seen.has(m.id)) { merged.push(m); seen.add(m.id); }
        }
        // Keep chronological order by id fallback
        return { ...prev, [cid]: merged };
      });
    } catch {
      if (!silent) setThreadError('Could not load these messages.');
    } finally {
      if (!silent) setThreadLoading(false);
    }
  };

  useEffect(() => {
    if (!activeId) return;
    // Only do the full loading state the first time this thread opens.
    if (!messagesByConvo[activeId]) loadThread.current(activeId, false);
    const poll = setInterval(() => loadThread.current(activeId, true), 8000);
    return () => clearInterval(poll);
  }, [activeId]);

  // Keep the conversation list (unread badges, last message) fresh too.
  useEffect(() => {
    const poll = setInterval(() => {
      api.getConversations()
        .then((list) => setConvos(Array.isArray(list) ? list : []))
        .catch(() => {});
    }, 20000);
    return () => clearInterval(poll);
  }, []);

  const activeConvo = convos.find((c) => c.id === activeId) || null;
  const messages = activeId ? (messagesByConvo[activeId] || []) : [];

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length, activeId]);

  const sendMessage = async (text) => {
    const t = (text || '').trim();
    if (!t || !activeId || sending) return;
    setSending(true);
    setSendError('');
    try {
      const saved = await api.sendMessage(activeId, t);
      setMessagesByConvo((prev) => ({
        ...prev,
        [activeId]: [...(prev[activeId] || []), { id: saved.id || `m${Date.now()}`, sender: 'me', text: saved.text || t, time: 'Just now' }],
      }));
      setConvos((prev) => prev.map((c) => (c.id === activeId ? { ...c, lastMessage: t } : c)));
      analytics.track('message_sent', { thread: activeId });
    } catch {
      setSendError('Could not send. Check your connection and try again.');
    } finally {
      setSending(false);
    }
  };

  const respondToRequest = async (userId, accept) => {
    const req = requests.find((r) => r.userId === userId);
    if (!req) return;
    setRequestError('');
    try {
      if (accept) {
        // Accepting expresses mutual interest and opens the real conversation.
        await api.expressInterest(userId);
        const { id: convoId } = await api.startConversation(userId);
        setRequests((prev) => prev.filter((r) => r.userId !== userId));
        setConvos((prev) => [
          { id: convoId, participantId: userId, participantName: req.name, lastMessage: '', timestamp: new Date().toISOString(), unread: false },
          ...prev.filter((c) => c.id !== convoId),
        ]);
        setActiveId(convoId);
        setTab('chats');
      } else {
        await api.withdrawInterest(userId);
        setRequests((prev) => prev.filter((r) => r.userId !== userId));
      }
    } catch (e) {
      // Keep the request visible so the member can retry — never silently drop it.
      // Surface the reason: most often the email-verification gate on messaging.
      const msg = (e && e.message) || '';
      setRequestError(
        /verify/i.test(msg)
          ? 'Please verify your email to accept introductions and start conversations. Check your inbox for the verification link.'
          : (msg || 'Could not respond to this request. Please try again.')
      );
    }
  };

  // Block the other participant from inside a conversation. The conversation is
  // removed from the inbox immediately and the server cuts messaging both ways.
  const handleBlock = (convo) => setConfirmBlock(convo);

  const confirmBlockNow = async () => {
    const convo = confirmBlock;
    if (!convo || blockBusy) return;
    const name = convo.participantName || 'this member';
    setBlockBusy(true);
    try {
      await blockMember(String(convo.participantId || ''));
      setConvos((prev) => prev.filter((c) => c.id !== convo.id));
      setMessagesByConvo((prev) => {
        const next = { ...prev };
        delete next[convo.id];
        return next;
      });
      if (activeId === convo.id) setActiveId(null);
      setNotice({ ok: true, text: `${name} is blocked — the conversation was removed and messaging is off.` });
      analytics.track('member_blocked', { thread: convo.id });
      setConfirmBlock(null);
    } catch (e) {
      setNotice({ ok: false, text: e.message || 'Could not block this member.' });
    } finally {
      setBlockBusy(false);
    }
  };

  const filteredConvos = convos.filter((c) => (c.participantName || '').toLowerCase().includes(search.toLowerCase()));
  const totalUnread = convos.reduce((n, c) => n + (c.unread ? 1 : 0), 0);

  return (
    <Layout>
      <main className="h-[calc(100vh-64px)] flex flex-col overflow-hidden" style={{ background: 'var(--bg)' }}>
        {notice && (
          <div
            role="status"
            className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm font-medium flex-shrink-0"
            style={{
              background: notice.ok ? 'var(--color-success-subtle, #eef7ee)' : 'var(--color-danger-subtle, #fdecec)',
              color: notice.ok ? 'var(--color-success, #1e7e34)' : 'var(--color-danger, #c0392b)',
              borderBottom: '1px solid var(--color-border)',
            }}
          >
            <span>{notice.text}</span>
            <button onClick={() => setNotice(null)} aria-label="Dismiss" className="p-1 hover:opacity-70">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="flex flex-1 overflow-hidden min-h-0">
        {/* ── Sidebar ── */}
        <div className={`w-full md:w-80 lg:w-96 flex-col ${activeId ? 'hidden md:flex' : 'flex'}`}
          style={{ borderRight: '1px solid var(--border)' }}>
          <div className="p-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <h1 className="text-xl font-bold text-ink mb-3">Messages</h1>
            {/* Tabs */}
            <div className="flex gap-2 mb-4">
              {[{ id: 'chats', label: 'Chats', badge: totalUnread }, { id: 'requests', label: 'Requests', badge: requests.length }].map(t => (
                <button key={t.id} onClick={() => setTab(t.id)} aria-pressed={tab === t.id}
                  className={'btn btn-' + (tab === t.id ? 'primary' : 'ghost') + ' mb-2'}>
                  {t.label}
                  {t.badge > 0 && (
                    <span className="badge badge-secondary ml-2">{t.badge}</span>
                  )}
                </button>
              ))}
            </div>
            {tab === 'chats' && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--color-ink-tertiary)' }} />
                <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search conversations…" aria-label="Search conversations"
                  className="input w-full input-with-icon" />
              </div>
            )}
          </div>

          {tab === 'chats' ? (
            <ConversationList convos={filteredConvos} activeId={activeId} onSelect={setActiveId}
              loading={convosLoading} error={convosError} />
          ) : (
            <>
              {requestError && (
                <div className="mx-4 mt-3 p-3 rounded-lg text-sm" role="alert" style={{ background: 'var(--color-danger-subtle)', color: 'var(--color-danger)' }}>
                  {requestError}
                </div>
              )}
              <RequestList requests={requests} onRespond={respondToRequest} loading={requestsLoading} />
            </>
          )}
        </div>

        {/* ── Chat pane ── */}
        <div className={`flex-1 flex-col ${activeId ? 'flex' : 'hidden md:flex'}`}>
          {activeConvo ? (
            <ChatPane convo={activeConvo} messages={messages} onBack={() => setActiveId(null)}
              onSend={sendMessage} onBlock={handleBlock} messagesEndRef={messagesEndRef}
              loading={threadLoading} error={threadError} sendError={sendError} sending={sending}
              disappearingAfter={disappearingByConvo[activeId] || 0}
              onSetDisappearing={async (cid, seconds) => {
                await http.post(`/api/messages/${encodeURIComponent(cid)}/disappearing`, { seconds });
                setDisappearingByConvo((prev) => ({ ...prev, [cid]: seconds }));
              }} />
          ) : (
            <EmptyState hasRequests={requests.length > 0} onOpenRequests={() => setTab('requests')} />
          )}
        </div>
        </div>
      </main>
      {confirmBlock && (
        <ConfirmDialog
          title={`Block ${confirmBlock.participantName || 'this member'}?`}
          message="The conversation will be removed and messaging disabled both ways."
          confirmLabel="Block member"
          danger
          busy={blockBusy}
          onConfirm={confirmBlockNow}
          onCancel={() => { if (!blockBusy) setConfirmBlock(null); }}
        />
      )}
    </Layout>
  );
}

// ── Sidebar: conversation list ──────────────────────────────────────────────
function ConversationList({ convos, activeId, onSelect, loading, error }) {
  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center" role="status">
        <p className="text-sm text-muted">Loading conversations…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center" role="alert">
        <p className="text-sm font-semibold text-ink">Couldn't load conversations</p>
        <p className="text-xs text-muted mt-1">{error}</p>
      </div>
    );
  }
  if (convos.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <MessageCircle className="w-8 h-8 mb-3" style={{ color: 'var(--color-ink-tertiary)' }} />
        <p className="text-sm font-semibold text-ink">No conversations yet</p>
        <p className="text-xs text-muted mt-1">When you and another member both express interest, your conversation appears here.</p>
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-1" role="list" aria-label="Conversations">
      {convos.map((c, i) => (
        <motion.button key={c.id} role="listitem" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04, duration: 0.25 }} onClick={() => onSelect(c.id)}
          aria-current={activeId === c.id ? 'true' : undefined}
          className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-150 hover:shadow-md ${activeId === c.id ? 'border-2 border-primary' : 'border-transparent hover:border-border'}`}
          style={{ background: activeId === c.id ? 'var(--color-primary-subtle)' : 'var(--color-surface)' }}>
          <Avatar name={c.participantName} />
          <span className="flex-1 min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-ink truncate">{c.participantName || 'Member'}</span>
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted mt-0.5">
              <span className="truncate">{c.lastMessage || 'Say salaam to start the conversation'}</span>
            </span>
          </span>
          {c.unread ? (
            <span className="badge badge-primary ml-2 flex-shrink-0" aria-label="Unread messages">•</span>
          ) : null}
        </motion.button>
      ))}
    </div>
  );
}

// ── Sidebar: introduction requests awaiting approval ────────────────────────
function RequestList({ requests, onRespond, loading }) {
  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center" role="status">
        <p className="text-sm text-muted">Loading requests…</p>
      </div>
    );
  }
  if (requests.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">
          <Check className="w-12 h-12" style={{ color: 'var(--color-success)' }} />
        </div>
        <h1 className="empty-state-title">All caught up</h1>
        <p className="empty-state-text">
          When someone expresses interest in your profile, their request appears here for your review.
        </p>
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4" role="list" aria-label="Introduction requests">
      {requests.map((r, i) => {
        const location = [r.city, r.country].filter(Boolean).join(', ');
        return (
          <motion.article key={r.userId} role="listitem" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.3 }}
            className="rounded-2xl p-4 border hover:shadow-md transition-all duration-200"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <header className="flex items-start gap-3">
              <Avatar name={r.name} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="text-sm font-semibold text-ink">{r.name}</h3>
                  {r.mutual && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: 'var(--color-primary-subtle)', color: 'var(--color-primary)' }}>
                      Mutual interest
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted mt-0.5">
                  {[location, timeAgo(r.receivedAt)].filter(Boolean).join(' · ') || 'Recently'}
                </p>
              </div>
            </header>
            <p className="text-xs text-muted leading-relaxed mt-2.5">
              Expressed interest in your profile. Accept to open a conversation, or decline to pass.
            </p>
            <div className="flex gap-3 mt-4">
              <button onClick={() => onRespond(r.userId, true)}
                className="btn btn-primary w-full">
                <Heart className="w-3 h-3" /> Accept
              </button>
              <button onClick={() => onRespond(r.userId, false)}
                className="btn btn-ghost w-full">
                <X className="w-3 h-3" /> Decline
              </button>
            </div>
          </motion.article>
        );
      })}
    </div>
  );
}

// ── Chat pane placeholder ───────────────────────────────────────────────────
function EmptyState({ hasRequests, onOpenRequests }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center" style={{ background: 'var(--color-canvas)' }}>
      <div className="empty-state">
        <div className="empty-state-icon">
          <MessageCircle className="w-16 h-16" style={{ color: 'var(--color-primary)' }} />
        </div>
        <h1 className="empty-state-title">Your conversations live here</h1>
        <p className="empty-state-text">
          Every conversation begins with an accepted introduction — intentional, respectful, and protected from the start.
        </p>
        {hasRequests && (
          <div className="mt-4 flex justify-center">
            <button onClick={onOpenRequests}
              className="btn btn-primary">
              <UserPlus className="w-3 h-3" /> Review pending requests
            </button>
          </div>
        )}
        <p className="mt-6 text-xs flex items-center gap-2" style={{ color: 'var(--color-ink-tertiary)' }}>
          <ShieldCheck className="w-3 h-3" /> Only the two of you can read this · Encrypted at rest · No contact details shared
        </p>
      </div>
    </div>
  );
}

// ── Chat pane: header, icebreakers, composer ────────────────────────────────
function ChatPane({ convo, messages, onBack, onSend, onBlock, messagesEndRef, loading, error, sendError, sending, disappearingAfter, onSetDisappearing }) {
  const [draft, setDraft] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [compat, setCompat] = useState(null);
  const [timerBusy, setTimerBusy] = useState(false);
  const name = convo.participantName || 'Member';
  const firstName = name.split(' ')[0];
  const profileId = convo.participantId;

  const setTimer = async (seconds) => {
    setMenuOpen(false);
    setTimerBusy(true);
    try {
      await onSetDisappearing(convo.id, seconds);
    } finally {
      setTimerBusy(false);
    }
  };

  const timerLabel = disappearingAfter === 86400 ? '24 hours' : disappearingAfter === 604800 ? '7 days' : 'Off';

  // Compatibility at a glance inside the chat — members asked where the match
  // score went after the conversation started. Fetched once per conversation.
  useEffect(() => {
    if (!profileId) return;
    let alive = true;
    api.getProfile(profileId)
      .then((p) => {
        if (!alive || !p) return;
        try {
          const c = computeCompatibility(p);
          if (alive && c) setCompat(c.overall);
        } catch { /* no score, no chip */ }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [profileId]);

  return (
    <div className="flex-1 flex flex-col min-w-0" style={{ background: 'var(--color-canvas)' }}>
      {/* Header — avatar + name link straight to the member's profile */}
      <header className="flex items-center gap-3 px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
        <button onClick={onBack} aria-label="Back to conversations"
          className="btn btn-ghost btn-sm md:hidden">
          <ArrowLeft className="w-3 h-3" />
        </button>
        <Link to={profileId ? `/profiles/${profileId}` : '#'} aria-label={`View ${name}'s profile`}
          className="flex items-center gap-3 flex-1 min-w-0 rounded-lg hover:opacity-80 transition-opacity">
          <Avatar name={name} size="w-9 h-9" />
          <div className="flex-1 min-w-0 text-left">
            <h2 className="text-sm font-semibold text-ink truncate">{name}</h2>
            <p className="text-xs text-muted truncate">
              Private conversation{typeof compat === 'number' ? ` · ${compat}% match` : ''}
            </p>
          </div>
        </Link>
        {/* NOTE: there is deliberately no "invite chaperone" control here.
            An earlier version had one, but it only flipped local React state —
            it never called the API, granted nobody access, and told the user
            "Chaperone present". A safety affordance that silently does nothing
            is worse than no affordance at all, so it was removed rather than
            relabelled. Family involvement happens through introductions. */}
        <div className="relative">
          <button
            aria-label="Conversation options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="btn btn-ghost btn-sm"
          >
            <MoreVertical className="w-2.5 h-2.5" />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-1 w-48 rounded-xl shadow-lg z-20 py-1"
              style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}
            >
              <button
                role="menuitem"
                onClick={() => { setMenuOpen(false); setShowReport((v) => !v); }}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-black/5"
                style={{ color: 'var(--color-ink)' }}
              >
                Report {firstName}
              </button>
              <button
                role="menuitem"
                onClick={() => { setMenuOpen(false); onBlock?.(convo); }}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-black/5"
                style={{ color: 'var(--color-danger, #c0392b)' }}
              >
                Block {firstName}
              </button>
              <div className="my-1" style={{ borderTop: '1px solid var(--color-border)' }} />
              <p className="px-4 pt-1 pb-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-ink-tertiary)' }}>
                Disappearing messages · {timerBusy ? '…' : timerLabel}
              </p>
              {[{ s: 0, label: 'Off' }, { s: 86400, label: '24 hours' }, { s: 604800, label: '7 days' }].map(o => (
                <button key={o.s} role="menuitemradio" aria-checked={disappearingAfter === o.s}
                  disabled={timerBusy}
                  onClick={() => setTimer(o.s)}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-black/5 flex items-center justify-between"
                  style={{ color: 'var(--color-ink)' }}>
                  {o.label}
                  {disappearingAfter === o.s && <span aria-hidden>✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {showReport && (
        <div className="px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
          <ReportFlag
            targetType="profile"
            targetId={String(convo.participantId || '')}
            onDone={() => setShowReport(false)}
          />
        </div>
      )}

      {/* Messages — constrained width on desktop so the thread doesn't feel
          zoomed-in on wide screens (WhatsApp Web-style centered column). */}
      <div className="flex-1 overflow-y-auto py-4" role="log" aria-label={`Conversation with ${name}`} aria-live="polite">
        <div className="px-3 space-y-2 max-w-2xl mx-auto">
        {loading && <p className="text-center text-xs text-muted py-6" role="status">Loading messages…</p>}
        {error && <p className="text-center text-xs text-muted py-6" role="alert">{error}</p>}
        {!loading && !error && messages.length === 0 && (
          <div className="text-center py-6">
            <p className="text-xs text-muted flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-3 h-3" style={{ color: 'var(--color-success)' }} />
              Private — only you and {firstName} can read these messages.
            </p>
            <p className="text-xs text-muted mt-2">No messages yet — say salaam to begin.</p>
          </div>
        )}
        {disappearingAfter > 0 && messages.length > 0 && (
          <p className="text-center text-[10px] py-1 flex items-center justify-center gap-1" style={{ color: 'var(--color-ink-tertiary)' }}>
            <Timer className="w-2.5 h-2.5" /> New messages disappear after {timerLabel.toLowerCase()}.
          </p>
        )}
        {messages.map(m => <Bubble key={m.id} msg={m} />)}
        </div>
        <div ref={messagesEndRef} />
      </div>

      {/* Icebreakers */}
      <div className="flex gap-2 px-3 pb-3 overflow-x-auto flex-shrink-0" aria-label="Icebreaker suggestions">
        {ICEBREAKERS.slice(0, 4).map(prompt => (
          <button key={prompt} type="button" onClick={() => setDraft(prompt)}
            className="btn btn-ghost btn-xs flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-medium whitespace-nowrap"
            style={{ border: '1px dashed var(--color-border)', background: 'var(--color-surface)' }}>
            <Sparkles className="w-2 h-2" style={{ color: 'var(--color-primary)' }} /> {prompt}
          </button>
        ))}
      </div>

      {/* Composer */}
      <form onSubmit={e => { e.preventDefault(); if (draft.trim() && !sending) { onSend(draft); setDraft(''); } }}
        className="flex items-end gap-2 p-3 flex-shrink-0" style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
        <input type="text" name="composer" value={draft} onChange={e => setDraft(e.target.value)}
          placeholder={`Write a respectful message to ${name.split(' ')[0]}…`} aria-label="Message"
          maxLength={2000} autoComplete="off"
          className="input w-full"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-ink)' }} />
        <button type="submit" disabled={!draft.trim() || sending} aria-label="Send message"
          className="btn btn-primary">
          <Send className="w-3 h-3" />
        </button>
      </form>
      {sendError && <p className="px-3 pb-2 text-xs" role="alert" style={{ color: 'var(--color-danger)' }}>{sendError}</p>}
    </div>
  );
}

// Message bubble — distinguishes me / them / guardian / system
function Bubble({ msg }) {
  if (msg.sender === 'system') {
    return (
      <motion.p initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
        className="mx-auto max-w-md text-center text-[11px] leading-relaxed px-3 py-2 rounded-xl"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-ink-tertiary)' }}>
        <Info className="w-2.5 h-2.5 inline mr-1 -mt-0.5" style={{ color: 'var(--color-primary)' }} />{msg.text}
      </motion.p>
    );
  }
  if (msg.sender === 'guardian') {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-start">
        <div className="max-w-[80%] md:max-w-[65%]">
          <span className="inline-flex items-center gap-1 text-[10px] font-bold mb-1" style={{ color: 'var(--color-accent)' }}>
            <ShieldCheck className="w-2.5 h-2.5" /> {msg.guardianName || 'Guardian'}
          </span>
          <div className="px-3 py-2 rounded-2xl rounded-bl-md text-sm leading-relaxed"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderLeft: '3px solid var(--color-accent)', color: 'var(--color-ink)' }}>
            {msg.text}
          </div>
          <span className="text-[10px] mt-1 inline-block" style={{ color: 'var(--color-ink-tertiary)' }}>{msg.time}</span>
        </div>
      </motion.div>
    );
  }
  const mine = msg.sender === 'me';
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[85%] sm:max-w-[75%] md:max-w-[65%]">
        <div className={`px-3 py-1.5 rounded-2xl text-[13px] sm:text-sm leading-relaxed ${mine ? 'rounded-br-md bg-primary text-white' : 'rounded-bl-md'}`}
          style={mine ? undefined : { background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-ink)' }}>
          {msg.text}
        </div>
        <span className={`text-[10px] mt-0.5 block ${mine ? 'text-right' : ''}`} style={{ color: 'var(--color-ink-tertiary)' }}>{msg.time}</span>
      </div>
    </motion.div>
  );
}

// ── Removed: ChaperoneModal ────────────────────────────────────────────────
// This modal asked for a guardian's name, then told the user "Your guardian
// will see this conversation in real time" and "They'll receive a secure email
// invitation to join as a participant". Neither was true: onConfirm only set
// local React state, no invitation was ever sent, and no server-side record
// existed. Removing a control is the correct fix — re-labelling it would still
// imply a guarantee the platform cannot make.
// ───────────────────────────────────────────────────────────────────────────





