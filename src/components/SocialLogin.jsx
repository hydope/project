import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth/AuthContext';
import { api } from '../lib/api/client';

// Social sign-in: Google + Facebook (Meta). Instagram sign-in is handled
// through the Facebook button — Meta consolidated Instagram login into
// Facebook Login, so there is no separate Instagram OAuth for websites.
//
// Setup (one-time, by the site owner):
//   Google:   Google Cloud Console → APIs & Services → Credentials → OAuth client ID
//             (Web application). Authorized origin: https://shiarishta.com
//             → put the client ID in the VITE_GOOGLE_CLIENT_ID env var.
//   Facebook: developers.facebook.com → create app → Facebook Login →
//             Valid OAuth redirect: https://shiarishta.com/auth/social-callback
//             → put the App ID in VITE_FACEBOOK_APP_ID.

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const FACEBOOK_APP_ID = import.meta.env.VITE_FACEBOOK_APP_ID || '';

function loadScript(src, id) {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) return resolve();
    const s = document.createElement('script');
    s.id = id;
    s.src = src;
    s.async = true;
    s.defer = true;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export default function SocialLogin({ mode = 'signin' }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const googleReady = !!GOOGLE_CLIENT_ID;
  const fbReady = !!FACEBOOK_APP_ID;

  useEffect(() => {
    if (googleReady) {
      loadScript('https://accounts.google.com/gsi/client', 'google-gsi').catch(() => {});
    }
    if (fbReady) {
      loadScript('https://connect.facebook.net/en_US/sdk.js', 'facebook-jssdk')
        .then(() => {
          window.fbAsyncInit = window.fbAsyncInit || function () {};
          window.FB?.init({ appId: FACEBOOK_APP_ID, cookie: true, xfbml: false, version: 'v21.0' });
        })
        .catch(() => {});
    }
  }, [googleReady, fbReady]);

  const exchange = async (provider, token) => {
    setBusy(true);
    setError('');
    try {
      const res = await api.post('/auth/social', { provider, token });
      // Store the session exactly like a normal login does.
      const { http } = await import('../lib/api/transport');
      if (res.token) http.setToken(res.token);
      if (res.user) localStorage.setItem('session', JSON.stringify(res.user));
      window.location.href = res.isNew ? '/onboard' : '/dashboard';
    } catch (e) {
      setError(e.message || 'Social sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const signInWithGoogle = () => {
    if (!window.google?.accounts?.id) {
      setError('Google sign-in is still loading. Please wait a moment and try again.');
      return;
    }
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (resp) => {
        if (resp?.credential) exchange('google', resp.credential);
        else setError('Google sign-in was cancelled.');
      },
    });
    window.google.accounts.id.prompt();
  };

  const signInWithFacebook = () => {
    if (!window.FB) {
      setError('Facebook sign-in is still loading. Please wait a moment and try again.');
      return;
    }
    window.FB.login((resp) => {
      if (resp?.authResponse?.accessToken) {
        exchange('facebook', resp.authResponse.accessToken);
      } else {
        setError('Facebook sign-in was cancelled.');
      }
    }, { scope: 'public_profile,email' });
  };

  if (!googleReady && !fbReady) return null;

  const label = mode === 'signup' ? 'Sign up' : 'Continue';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px" style={{ background: 'var(--color-border)' }} />
        <span className="text-xs" style={{ color: 'var(--color-ink-faint)' }}>or</span>
        <div className="flex-1 h-px" style={{ background: 'var(--color-border)' }} />
      </div>

      {googleReady && (
        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={busy}
          className="btn w-full flex items-center justify-center gap-3"
          style={{ background: '#fff', color: '#1a1a1a', border: '1px solid var(--color-border)' }}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.3H12v4.5h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.1.7 3.5 2.7.2.1c2.2-2 3.6-5 3.6-9.5z" />
            <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.1 1.2-3.1 0-5.8-2.1-6.8-5l-.7.1-3.6 2.8v.7C2.9 21.3 7.1 24 12 24z" />
            <path fill="#FBBC05" d="M5.2 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.7.4-2.4l-.1-.7-3.6-2.8-.5.2C.4 7.6 0 9.7 0 12s.4 4.4 1 6.4l4.2-4z" />
            <path fill="#EA4335" d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 7.1 0 2.9 2.7 1 6.4l4.2 3.3c1-2.9 3.7-5 6.8-5z" />
          </svg>
          {label} with Google
        </button>
      )}

      {fbReady && (
        <button
          type="button"
          onClick={signInWithFacebook}
          disabled={busy}
          className="btn w-full flex items-center justify-center gap-3"
          style={{ background: '#1877F2', color: '#fff', border: '1px solid #1877F2' }}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.09 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.5c-1.5 0-1.96.93-1.96 1.89v2.26h3.32l-.53 3.49h-2.8V24C19.62 23.1 24 18.1 24 12.07z" />
          </svg>
          {label} with Facebook
        </button>
      )}

      {error && (
        <p className="text-sm text-center" style={{ color: 'var(--color-danger)' }}>{error}</p>
      )}

      <p className="text-[11px] text-center" style={{ color: 'var(--color-ink-faint)' }}>
        Facebook login also works with your Instagram-linked Meta account.
      </p>
    </div>
  );
}
