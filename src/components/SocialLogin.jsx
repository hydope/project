import { useEffect, useRef, useState } from 'react';
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
//
// Flow notes (2026-11-16):
//   - Google uses the OFFICIAL rendered GIS button (renderButton). The
//     earlier custom button called accounts.id.prompt() (One Tap), which
//     browsers suppress silently — no popup, no error, a dead click for
//     real visitors (proven in the 2026-11-16 end-to-end test).
//   - No DOB form in front of the buttons. Sign-in completes first; a new
//     account lands on /auth/dob for the one mandatory 18+ step before
//     anything else unlocks (Syed's call). The server creates social
//     accounts with date_of_birth NULL + needsDob until that step is done.

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
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const googleBtnRef = useRef(null);

  const googleReady = !!GOOGLE_CLIENT_ID;
  const fbReady = !!FACEBOOK_APP_ID;

  const exchange = async (provider, token) => {
    setBusy(true);
    setError('');
    try {
      const res = await api.post('/auth/social', { provider, token });
      // Store the session exactly like a normal login does.
      const { http } = await import('../lib/api/transport');
      if (res.token) http.setToken(res.token);
      if (res.user) localStorage.setItem('session', JSON.stringify(res.user));
      if (res.user?.needsDob) {
        window.location.href = '/auth/dob';
      } else {
        window.location.href = res.isNew ? '/onboard' : '/dashboard';
      }
    } catch (e) {
      setError(e.message || 'Social sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  // Google: load GIS, initialize once, render the official button. The
  // credential callback fires only after the visitor picks an account in
  // Google's own chooser — the account is created at exchange time, so
  // nothing exists before that click.
  useEffect(() => {
    if (!googleReady || !googleBtnRef.current) return;
    let cancelled = false;
    loadScript('https://accounts.google.com/gsi/client', 'google-gsi')
      .then(() => {
        if (cancelled || !window.google?.accounts?.id || !googleBtnRef.current) return;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (resp) => {
            if (resp?.credential) exchange('google', resp.credential);
            else setError('Google sign-in was cancelled.');
          },
        });
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: 'outline',
          size: 'large',
          text: mode === 'signup' ? 'signup_with' : 'continue_with',
          shape: 'rectangular',
          width: 320,
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // exchange is stable enough for this one-shot render; mode changes
    // remount the component on the auth pages.
  }, [googleReady, mode]);

  useEffect(() => {
    if (fbReady) {
      loadScript('https://connect.facebook.net/en_US/sdk.js', 'facebook-jssdk')
        .then(() => {
          window.fbAsyncInit = window.fbAsyncInit || function () {};
          window.FB?.init({ appId: FACEBOOK_APP_ID, cookie: true, xfbml: false, version: 'v21.0' });
        })
        .catch(() => {});
    }
  }, [fbReady]);

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
        <div className="flex justify-center" aria-busy={busy}>
          <div ref={googleBtnRef} />
        </div>
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

      {fbReady && (
        <p className="text-[11px] text-center" style={{ color: 'var(--color-ink-faint)' }}>
          Facebook login also works with your Instagram-linked Meta account.
        </p>
      )}
    </div>
  );
}
