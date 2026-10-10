import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MailCheck, AlertCircle, Sparkles } from 'lucide-react';
import { auth } from '../../lib/api/authService';

// /verify/:token — the path-token form of the verification link sent by the
// server (see POST /api/auth/verify/request). Consumes the token once via
// GET /api/auth/verify?token=… and reports the outcome honestly.
export default function VerifyToken() {
  const { token = '' } = useParams();
  const [state, setState] = useState({ busy: true, ok: false, error: '' });

  useEffect(() => {
    if (!token) { setState({ busy: false, ok: false, error: 'This link is missing its token. Sign in and request a new one.' }); return; }
    auth.verifyToken(token)
      .then((r) => {
        // Refresh the stored session so the UI stops showing stale state
        // (e.g. a verification banner) when the member is already signed in
        // in this browser.
        auth.me().catch(() => {});
        setState({ busy: false, ok: true, error: '', already: !!r?.alreadyVerified });
      })
      .catch((e) => setState({ busy: false, ok: false, error: e.message || 'Verification failed.' }));
  }, [token]);

  return (
    <div className="relative min-h-screen flex items-center justify-center px-6 py-12" style={{ background: 'var(--color-canvas)' }}>
      <div className="w-full max-w-md text-center rounded-2xl p-8" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-lg)' }}>
        <div className="w-12 h-12 mx-auto rounded-2xl flex items-center justify-center mb-4" style={{ background: 'linear-gradient(135deg,#10b981,#d4af69)', color: '#fff' }}>
          {state.busy ? <Sparkles className="w-5 h-5" /> : state.ok ? <MailCheck className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
        </div>
        <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-ink)' }}>
          {state.busy ? 'Verifying…' : state.ok ? 'Email verified' : 'Could not verify'}
        </h1>
        <p className="text-sm mb-6" style={{ color: 'var(--color-ink-secondary)' }}>
          {state.busy
            ? 'One moment — confirming your email with the server.'
            : state.ok
              ? state.already
                ? 'This email is already confirmed — you’re all set.'
                : 'Your email is confirmed. Sign in and complete your profile — verified emails get seen first.'
              : state.error}
        </p>
        <Link to="/auth/login" className="button primary inline-flex items-center px-5 py-2.5 font-semibold">Go to sign in</Link>
      </div>
    </div>
  );
}
