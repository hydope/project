import { useState } from 'react';
import { MessageSquareHeart, X, Star, Send, CheckCircle2 } from 'lucide-react';

// ── In-app feedback: reviews, feature requests, problem reports ─────────────
// A floating button (bottom-left, clear of the AI assistant) opens a small
// dialog. Submissions go through the existing /api/contact pipeline so they
// land in the admin support inbox with a [Feedback: …] subject prefix.
const TYPES = [
  { value: 'review', label: 'App review' },
  { value: 'feature', label: 'Feature request' },
  { value: 'problem', label: 'Report a problem' },
  { value: 'general', label: 'General feedback' },
];

export default function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('review');
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error
  const [error, setError] = useState('');

  const submit = async (e) => {
    e?.preventDefault();
    if (!message.trim() || status === 'sending') return;
    setStatus('sending');
    setError('');
    const typeLabel = TYPES.find(t => t.value === type)?.label || 'Feedback';
    const ratingLine = type === 'review' && rating > 0 ? `Rating: ${rating}/5 stars\n` : '';
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || 'App user',
          email: email.trim() || 'noreply@shiarishta.com',
          subject: `[Feedback: ${typeLabel}]`,
          message: `${ratingLine}${message.trim()}`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not send feedback.');
      setStatus('sent');
    } catch (err) {
      setStatus('error');
      setError(err.message || 'Could not send feedback. Please try again.');
    }
  };

  const reset = () => {
    setOpen(false);
    setTimeout(() => {
      setType('review'); setRating(0); setMessage('');
      setStatus('idle'); setError('');
    }, 300);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Give feedback"
        title="Give feedback"
        className="fixed z-40 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-105"
        style={{ left: '1rem', bottom: '1rem', background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-primary)' }}
      >
        <MessageSquareHeart className="w-5 h-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Give feedback">
          <div className="absolute inset-0 bg-black/40" onClick={reset} />
          <div className="relative w-full max-w-md rounded-2xl p-6 shadow-xl"
            style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
            <button onClick={reset} aria-label="Close feedback" className="absolute right-4 top-4 text-muted hover:text-ink">
              <X className="w-5 h-5" />
            </button>

            {status === 'sent' ? (
              <div className="text-center py-6">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--color-success)' }} />
                <h3 className="text-lg font-bold text-ink">Thank you!</h3>
                <p className="text-sm text-muted mt-1">Your feedback was sent. We read every single one.</p>
                <button onClick={reset} className="btn btn-primary mt-5">Done</button>
              </div>
            ) : (
              <form onSubmit={submit}>
                <h3 className="text-lg font-bold text-ink pr-8">Share your feedback</h3>
                <p className="text-xs text-muted mt-1 mb-4">Reviews, ideas, or things that bother you — tell us straight.</p>

                <div className="flex gap-2 mb-4 flex-wrap">
                  {TYPES.map(t => (
                    <button key={t.value} type="button" onClick={() => setType(t.value)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${type === t.value ? 'bg-primary text-white border-primary' : 'text-muted border-line/30 hover:border-line/60'}`}>
                      {t.label}
                    </button>
                  ))}
                </div>

                {type === 'review' && (
                  <div className="flex items-center gap-1 mb-4" role="radiogroup" aria-label="Star rating">
                    {[1, 2, 3, 4, 5].map(s => (
                      <button key={s} type="button" role="radio" aria-checked={rating === s} aria-label={`${s} star${s > 1 ? 's' : ''}`}
                        onClick={() => setRating(s)} onMouseEnter={() => setHoverRating(s)} onMouseLeave={() => setHoverRating(0)}
                        className="p-0.5">
                        <Star className="w-7 h-7" style={{
                          color: (hoverRating || rating) >= s ? 'var(--color-warning, #d4a017)' : 'var(--color-border)',
                          fill: (hoverRating || rating) >= s ? 'var(--color-warning, #d4a017)' : 'transparent',
                        }} />
                      </button>
                    ))}
                  </div>
                )}

                <textarea value={message} onChange={e => setMessage(e.target.value)} required rows={4} maxLength={2000}
                  placeholder={type === 'feature' ? 'What should we build next?' : type === 'problem' ? 'What went wrong? Be specific — which page, what happened.' : 'What do you think of Shia Rishta?'}
                  aria-label="Your feedback"
                  className="w-full px-4 py-3 rounded-xl border border-line/30 bg-base text-sm text-ink placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/30 mb-3" />

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="Name (optional)" aria-label="Name"
                    className="px-4 py-2.5 rounded-xl border border-line/30 bg-base text-sm text-ink placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email (optional)" aria-label="Email"
                    className="px-4 py-2.5 rounded-xl border border-line/30 bg-base text-sm text-ink placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>

                {status === 'error' && <p className="text-xs mb-3" role="alert" style={{ color: 'var(--color-danger)' }}>{error}</p>}

                <button type="submit" disabled={status === 'sending' || !message.trim()}
                  className="btn btn-primary w-full disabled:opacity-50">
                  <Send className="w-4 h-4" /> {status === 'sending' ? 'Sending…' : 'Send feedback'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
