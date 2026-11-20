import { useState } from 'react';
import { Mail, CheckCircle2 } from 'lucide-react';
import { http } from '../lib/api/transport';
import { logSubmit } from '../lib/eventLog';

// Guest lead capture — the "smaller yes" for visitors who are not ready
// to register: leave an email (and optionally a city) and get new-profile
// alerts every Sunday, only in weeks when new members actually joined.
// Submissions land in guest_leads via POST /api/leads; the weekly digest
// cron sends the alerts. Shown to guests only — members already have the
// digest in Settings → Notifications.
export default function LeadCapture({ source = 'site', city = '', heading, blurb }) {
  const [email, setEmail] = useState('');
  const [cityVal, setCityVal] = useState(city || '');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const em = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      setError('Please enter a valid email address.');
      return;
    }
    setBusy(true);
    try {
      await http.post('/api/leads', { email: em, source, city: cityVal.trim() });
      logSubmit('lead_capture', true);
      setDone(true);
    } catch (err) {
      logSubmit('lead_capture', false);
      setError(err?.message || 'Could not save your email. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="card p-6 text-center" role="status">
        <CheckCircle2 className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--color-success, #2e7d32)' }} />
        <h3 className="font-semibold mb-1">You&apos;re on the list</h3>
        <p className="text-sm" style={{ color: 'var(--color-ink-secondary)' }}>
          We&apos;ll email you when new members join{cityVal ? ` in ${cityVal}` : ''} — every Sunday, and only in weeks when someone new actually joins. Unsubscribe any time from the email.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <div className="flex items-start gap-3 mb-4">
        <Mail className="w-6 h-6 shrink-0 mt-0.5" style={{ color: 'var(--color-ink-tertiary)' }} />
        <div>
          <h3 className="font-semibold">{heading || 'Not ready to join yet? Get new profiles by email'}</h3>
          <p className="text-sm" style={{ color: 'var(--color-ink-secondary)' }}>
            {blurb || 'Tell us where to send them. One email a week, only when new members join — no spam, unsubscribe any time.'}
          </p>
        </div>
      </div>
      <form onSubmit={submit} className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Your email address"
          aria-label="Email address"
          className="input flex-1 min-w-[180px]"
          autoComplete="email"
        />
        <input
          type="text"
          value={cityVal}
          onChange={(e) => setCityVal(e.target.value)}
          placeholder="City (optional)"
          aria-label="City (optional)"
          className="input sm:w-44"
          autoComplete="address-level2"
        />
        <button type="submit" disabled={busy} className="btn btn-primary disabled:opacity-60">
          {busy ? 'Saving…' : 'Email me new profiles'}
        </button>
      </form>
      {error && (
        <p role="alert" className="text-sm mt-3" style={{ color: 'var(--color-danger, #b3261e)' }}>{error}</p>
      )}
    </div>
  );
}
