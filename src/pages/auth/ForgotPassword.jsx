import { useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { auth } from '../../lib/api/authService';

// Forgot password — asks the server for a reset link. The response shape is
// constant whether or not the email exists (no account enumeration).
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const res = await auth.forgotPassword(email.trim());
      setSent(res.message || 'If that email is registered, a reset link is on its way.');
    } catch (err) {
      setError(err.message || 'Could not send a reset link right now.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center px-6 py-12" style={{ background: 'var(--color-canvas)' }}>
      <div className="w-full max-w-md rounded-2xl p-8" style={{ background: 'color-mix(in srgb, var(--color-elevated) 82%, transparent)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-lg)' }}>
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'linear-gradient(135deg,#10b981,#d4af69)', color: '#fff' }}>
          <KeyRound className="w-5 h-5" />
        </div>
        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--color-ink)' }}>Reset your password</h1>
        <p className="text-sm mb-6" style={{ color: 'var(--color-ink-secondary)' }}>Enter your email and we&apos;ll send a one-hour reset link.</p>
        {sent ? (
          <div className="space-y-5">
            <div className="p-4 rounded-xl text-sm" style={{ background: 'var(--color-success-subtle, rgba(16,185,129,.1))', border: '1px solid color-mix(in srgb, var(--color-primary) 25%, transparent)', color: 'var(--color-ink)' }}>{sent}</div>
            <Link to="/auth/login" className="button primary w-full py-3 inline-flex justify-center font-semibold">Back to sign in</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            {error && <div className="p-4 rounded-xl text-sm" style={{ background: 'var(--color-danger-subtle)', color: 'var(--color-danger)' }}>{error}</div>}
            <div>
              <label htmlFor="fp-email" className="block mb-1.5 text-sm font-medium" style={{ color: 'var(--color-ink-secondary)' }}>Email</label>
              <input id="fp-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="input w-full" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }} />
            </div>
            <button type="submit" disabled={busy} className="btn btn-primary w-full py-3.5">{busy ? 'Sending…' : 'Send reset link'}</button>
            <p className="text-center text-sm" style={{ color: 'var(--color-ink-secondary)' }}>
              Remembered it? <Link to="/auth/login" className="link-primary font-semibold">Sign in</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
