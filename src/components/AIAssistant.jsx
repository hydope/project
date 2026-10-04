import { useState, useRef, useEffect } from 'react';
import { Bot, X, Send, Sparkles, BadgeCheck, MessageCircle, MessageCircleHeart } from 'lucide-react';
import { SUGGESTIONS, WELCOME } from '../lib/aiAssistantBrain';
import { AI_OPEN_EVENT } from '../lib/aiAssistant';
import { http, useRemote } from '../lib/api/transport';

// Re-exported for existing import sites; new code should import from
// '../lib/aiAssistant' so the header button doesn't pull this component
// (and the assistant brain) into the shared entry chunk.
export { AI_OPEN_EVENT, openAIAssistant } from '../lib/aiAssistant';

export default function AIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);
  // Which backend actually produced the last reply: 'model' (live),
  // 'facts' (retrieved platform guidance), 'guardrail' or 'offline'. Shown to
  // the member rather than hidden, so a degraded assistant is never mistaken
  // for a working one.
  const [lastSource, setLastSource] = useState(null);

  useEffect(() => {
    const h = (e) => {
      if (e.key === '/' && !isOpen) {
        const t = document.activeElement?.tagName;
        if (t !== 'INPUT' && t !== 'TEXTAREA') { e.preventDefault(); setIsOpen(true); }
      }
    };
    const openListener = () => setIsOpen(true);
    const esc = (e) => { if (e.key === 'Escape') setIsOpen(false); };
    window.addEventListener('keydown', h);
    window.addEventListener('keydown', esc);
    window.addEventListener(AI_OPEN_EVENT, openListener);
    return () => {
      window.removeEventListener('keydown', h);
      window.removeEventListener('keydown', esc);
      window.removeEventListener(AI_OPEN_EVENT, openListener);
    };
  }, [isOpen]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  const send = async (e, preset) => {
    e?.preventDefault();
    const text = (preset ?? input).trim();
    if (!text || loading) return;
    const turn = { role: 'user', content: text };
    setMessages(p => [...p, turn]);
    setInput('');
    setLoading(true);

    // Ask the server. The model call and the retrieval both live behind
    // /api/ai/* so the NVIDIA key never reaches this bundle.
    //
    // A note on the fallback: when the server cannot reach the model it answers
    // from its retrieved platform facts and sets source='facts'. That is a
    // genuinely useful answer, but it is NOT the same as a live model reply —
    // and silently swapping one for the other is how "the API works but the
    // assistant doesn't" stayed invisible. So the source is surfaced to the
    // member rather than hidden.
    try {
      if (!useRemote) throw new Error('offline');
      const res = await http.post('/api/ai/chat', {
        question: text,
        history: messages.slice(-6),
      });
      const { getReply } = await import('../lib/aiAssistantBrain');
      const answer = res?.answer || getReply(text);
      setMessages(p => [...p, { role: 'assistant', content: answer }]);
      setLastSource(res?.source || 'model');
    } catch (err) {
      const { getReply } = await import('../lib/aiAssistantBrain');
      setMessages(p => [...p, { role: 'assistant', content: getReply(text) }]);
      setLastSource('offline');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => setMessages([]);

  return (
    <>
      <button type="button" className="ai-fab" data-ai-fab onClick={() => setIsOpen(true)} aria-label="Open AI assistant">
        <MessageCircleHeart className="w-4 h-4" /><span>Ask Assistant</span>
      </button>
      {isOpen && (<>
        <div className="ai-backdrop" onClick={() => setIsOpen(false)} />
        <aside className="ai-drawer" role="dialog" aria-label="AI assistant">
          <div className="ai-drawer-header">
            <div className="flex items-center gap-2.5">
              <div className="ai-orb"><Bot className="w-4 h-4" /></div>
              <div>
                <p className="ai-drawer-title">Shia Rishta Assistant</p>
                <p className="ai-drawer-sub"><BadgeCheck className="w-3 h-3" /> Respectful, halal-aware guidance</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button className="ai-icon-btn" onClick={reset} title="Clear conversation" aria-label="Clear conversation">
                <Sparkles className="w-4 h-4" />
              </button>
              <button className="ai-icon-btn" onClick={() => setIsOpen(false)} title="Close" aria-label="Close assistant">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="ai-drawer-body">
            <div className="ai-msg ai-msg-bot">
              <div className="ai-msg-avatar"><Bot className="w-3.5 h-3.5" /></div>
              <div className="ai-bubble">{WELCOME}</div>
            </div>

            {messages.length === 0 && (
              <div className="ai-chips">
                {SUGGESTIONS.map(s => (
                  <button key={s} type="button" className="ai-chip" onClick={() => send(null, s)}>{s}</button>
                ))}
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'ai-msg ai-msg-user' : 'ai-msg ai-msg-bot'}>
                {m.role === 'assistant' && <div className="ai-msg-avatar"><Bot className="w-3.5 h-3.5" /></div>}
                <div className="ai-bubble">{m.content}</div>
              </div>
            ))}

            {loading && (
              <div className="ai-msg ai-msg-bot">
                <div className="ai-msg-avatar"><Bot className="w-3.5 h-3.5" /></div>
                <div className="ai-bubble ai-typing"><span /><span /><span /></div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Honest provenance. A member asking a question and getting retrieved
              facts is fine; not knowing WHICH they got is not. When the model is
              unreachable we say so and point at support rather than presenting a
              canned answer as a live one. */}
          {lastSource && lastSource !== 'model' && (
            <p
              className="px-4 py-2 text-[11px]"
              style={{ color: 'var(--color-ink-tertiary)', borderTop: '1px solid var(--color-border)' }}
            >
              {lastSource === 'facts'
                ? 'Answered from our platform guidance — the live assistant is temporarily unavailable.'
                : lastSource === 'offline'
                  ? 'Offline answers only. Please email support@shiarishta.com for anything specific.'
                  : null}
            </p>
          )}

          <form className="ai-drawer-input" onSubmit={(e) => send(e)}>
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask about verification, wali, privacy, halal rizz…"
              aria-label="Ask the assistant"
            />
            <button type="submit" className="ai-send" disabled={!input.trim() || loading} aria-label="Send">
              <Send className="w-4 h-4" />
            </button>
          </form>

          {/* Support pointer only. The server-side safety instructions stay
              enforced, but surfacing "Guardrails on" in the UI made the
              assistant read as restricted and undercut trust in every answer.
              Users get a calm help link instead. */}
          <div className="ai-guardrail">
            <MessageCircle className="w-3 h-3" />
            <span>Questions about a profile or your data? <a href="/support">Contact support</a></span>
          </div>
        </aside>
      </>)}
    </>
  );
}