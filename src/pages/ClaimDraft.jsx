import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { HandHeart, ShieldCheck, MailX, Clock, FileQuestion } from 'lucide-react';
import { introductions } from '../lib/api/introductions';
import { http } from '../lib/api/transport';
import { write } from '../lib/api/storage';

// Public claim page — opened from a matchmaker's or guardian's WhatsApp/email
// link. Nothing here needs an account: the token IS the credential. She reviews
// the prefilled draft, then either claims it (becomes HER account + profile) or
// declines (everything about her is erased server-side).
/**
 * A label/value line in the claim preview.
 *
 * Hoisted to module scope deliberately. It was previously declared inside the
 * component body, which creates a NEW component type on every render — React
 * unmounts and remounts the whole subtree each time (losing focus, resetting
 * animation state, and doing needless DOM work). Functionally it looked fine,
 * which is why it survived review.
 */
function Row({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
      <span style={{ width: 130, flexShrink: 0, fontSize: '0.8rem', color: 'var(--color-ink-faint)' }}>{label}</span>
      <span style={{ fontSize: '0.9rem', color: 'var(--color-ink)' }}>{value}</span>
    </div>
  );
}

export default function ClaimDraft() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [preview, setPreview] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | claimform | claimed | declined | dead
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await introductions.preview(token);
        if (alive) { setPreview(res.draft); setState('ready'); }
      } catch (e) {
        if (!alive) return;
        setState('dead'); // 404 unknown or 410 claimed/declined/expired — server sends a human message
        setMessage(e.message || 'This link is unknown or no longer valid.');
      }
    })();
    return () => { alive = false; };
  }, [token]);

  const claim = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await introductions.claim(token, { email: email.trim(), password, displayName: displayName.trim() });
      // Same session shape the login flow stores — she is signed in immediately.
      http.setToken(res.token);
      write('session', res.user);
      setState('claimed');
      setTimeout(() => navigate('/dashboard'), 1600);
    } catch (err) {
      setMessage(err.message || 'Could not claim right now.');
      setState('claimform');
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    setBusy(true);
    try {
      await introductions.decline(token);
      setState('declined');
    } catch (err) {
      setMessage(err.message || 'Could not decline right now.');
    } finally {
      setBusy(false);
    }
  };

  const card = { background: 'color-mix(in srgb, var(--color-elevated) 82%, transparent)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-lg)' };

  return (
    <div className="relative min-h-screen px-6 py-12" style={{ background: 'var(--color-canvas)' }}>
      <div className="w-full max-w-lg mx-auto rounded-2xl p-8" style={card}>
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'linear-gradient(135deg,#10b981,#d4af69)', color: '#fff' }}>
          <HandHeart className="w-5 h-5" />
        </div>

        {state === 'loading' && <p style={{ color: 'var(--color-ink-secondary)' }}>Opening your private invitation…</p>}

        {state === 'dead' && (
          <>
            <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-ink)' }}>This invitation is closed</h1>
            <p className="text-sm mb-6" style={{ color: 'var(--color-ink-secondary)' }}>{message}</p>
            <DeadEndActions />
          </>
        )}

        {state === 'declined' && (
          <>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'var(--color-danger-subtle)', color: 'var(--color-danger)' }}>
              <MailX className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-ink)' }}>Declined and erased</h1>
            <p className="text-sm mb-6" style={{ color: 'var(--color-ink-secondary)' }}>
              Nothing of yours remains on Shia Rishta — the draft is scrubbed and the link is dead. No account was created.
            </p>
            <Link to="/" className="button w-full py-3 inline-flex justify-center font-semibold" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>Go to homepage</Link>
          </>
        )}

        {state === 'claimed' && (
          <>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'var(--color-success-subtle, rgba(16,185,129,.12))', color: 'var(--color-success)' }}>
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-ink)' }}>This profile is yours now</h1>
            <p className="text-sm" style={{ color: 'var(--color-ink-secondary)' }}>
              Welcome to Shia Rishta. Taking you to your dashboard — from there you can edit everything, add your own photo, and set your own privacy.
            </p>
          </>
        )}

        {(state === 'ready' || state === 'claimform') && preview && <ClaimReview
          preview={preview} state={state} setState={setState} claim={claim} decline={decline}
          email={email} setEmail={setEmail} password={password} setPassword={setPassword}
          displayName={displayName} setDisplayName={setDisplayName} busy={busy} message={message}
        />}
      </div>
    </div>
  );
}

// Review + claim form: she sees exactly what was written about her before she
// decides. Every field is editable after claiming — this is a preview, not a cage.
function ClaimReview({ preview, state, setState, claim, decline, email, setEmail, password, setPassword, displayName, setDisplayName, busy, message }) {
  // `Row` is the module-scope component defined at the top of this file. It used
  // to be redefined here inside the render body, which gave React a new
  // component type on every render and remounted the whole preview each time.
  return (
    <>
      <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--color-ink)' }}>A profile is waiting for you</h1>
      <p className="text-sm mb-6" style={{ color: 'var(--color-ink-secondary)' }}>
        {preview.creatorName}, a verified {preview.creatorRole} on Shia Rishta, set this up with your details and confirmed they had your permission.{' '}
        <strong style={{ color: 'var(--color-ink)' }}>Nothing is public.</strong>{' '}
        If you claim it, the profile becomes yours — you edit every word and add your own photo.
      </p>

      <div className="rounded-xl p-4 mb-6" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <Row label="Name" value={preview.displayName} />
        <Row label="Age" value={preview.age} />
        <Row label="City" value={[preview.city, preview.country].filter(Boolean).join(', ')} />
        <Row label="Sect" value={preview.sect} />
        <Row label="Profession" value={preview.profession} />
        {preview.relationship && <Row label="Introduced as" value={preview.relationship} />}
        <Row label="Invited email" value={preview.maskedEmail} />
        <Row label="About me" value={preview.bio} />
        <Row label="Expectations" value={preview.expectations} />
        <Row label="About family" value={preview.aboutFamily} />
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 10, fontSize: '0.78rem', color: 'var(--color-ink-faint)' }}>
          <Clock className="w-3.5 h-3.5" />
          Valid until {preview.expiresAt ? new Date(preview.expiresAt).toLocaleDateString() : '—'} — the matchmaker can extend it anytime.
        </div>
      </div>

      {state === 'ready' && (
        <div className="space-y-4">
          <button onClick={() => { setState('claimform'); setEmail(''); }} className="button primary w-full py-3.5 font-semibold">This is me — make it mine</button>
          <button onClick={decline} disabled={busy} className="button w-full py-3 font-semibold" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-ink-secondary)' }}>
            Not me / I decline — erase everything
          </button>
          <p className="text-center text-xs" style={{ color: 'var(--color-ink-faint)' }}>
            Declining removes your name, contact details and every word of this draft immediately. Nothing is kept.
          </p>
        </div>
      )}

      {state === 'claimform' && (
        <form onSubmit={claim} className="space-y-5">
          {message && <div className="p-4 rounded-xl text-sm" style={{ background: 'var(--color-danger-subtle)', color: 'var(--color-danger)' }}>{message}</div>}
          <div>
            <label htmlFor="cl-email" className="block mb-1.5 text-sm font-medium" style={{ color: 'var(--color-ink-secondary)' }}>
              Your email — must match the invited address ({preview.maskedEmail})
            </label>
            <input id="cl-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" className="input w-full" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }} />
          </div>
          <div>
            <label htmlFor="cl-name" className="block mb-1.5 text-sm font-medium" style={{ color: 'var(--color-ink-secondary)' }}>
              Your display name (this overrides the draft — your call)
            </label>
            <input id="cl-name" type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={preview.displayName} className="input w-full" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }} />
          </div>
          <div>
            <label htmlFor="cl-pass" className="block mb-1.5 text-sm font-medium" style={{ color: 'var(--color-ink-secondary)' }}>Choose a password (8+ characters)</label>
            <input id="cl-pass" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="input w-full" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }} />
          </div>
          <button type="submit" disabled={busy} className="button primary w-full py-3.5 font-semibold">{busy ? 'Creating your account…' : 'Claim this profile'}</button>
          <button type="button" onClick={decline} disabled={busy} className="button w-full py-3 font-semibold" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-ink-secondary)' }}>
            Decline and erase instead
          </button>
        </form>
      )}
    </>
  );
}

// Dead links get an honest path back in: the 6-character short code printed
// under every invitation revives an expired one.
function DeadEndActions() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const lookup = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const res = await introductions.lookupShortCode(code);
      window.location.href = res.claimUrl;
    } catch {
      setErr('That code is unknown, expired or already used.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <Link to="/" className="button primary w-full py-3 inline-flex justify-center font-semibold">Go to homepage</Link>
      <form onSubmit={lookup} className="rounded-xl p-4" style={{ background: 'var(--color-surface)', border: '1px dashed var(--color-border)' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, fontSize: '0.8rem', color: 'var(--color-ink-secondary)' }}>
          <FileQuestion className="w-4 h-4" /> Have a short code? It revives an expired invitation.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. 4C47EC" maxLength={6} className="input" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', textTransform: 'uppercase', flex: 1 }} aria-label="Short code" />
          <button type="submit" disabled={busy || code.trim().length < 4} className="button primary px-4 font-semibold text-sm">Open</button>
        </div>
        {err && <p className="text-xs mt-2" style={{ color: 'var(--color-danger)' }}>{err}</p>}
      </form>
    </div>
  );
}


