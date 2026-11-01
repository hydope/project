import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, ArrowRight, RefreshCw, CheckCircle2 } from 'lucide-react';
import Layout from '../../layouts/MainLayout';
import { useAuth } from '../../lib/auth/AuthContext';
import { http } from '../../lib/api/transport';

// Shown right after registration (2026-11-01 fix for the stuck-signup funnel).
// Before this, Register sent new members straight to /onboard with no verify
// moment at all — 24 of 35 real members (69%) never verified their email,
// so they stayed hidden and locked out of messaging. This screen makes the
// one-tap verify step visible at the moment it matters, WITHOUT blocking
// onboarding: "Continue to profile setup" always works, verified or not
// (Syed's order 2026-10-24: onboarding must never block a new signup).
export default function VerifyPending() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState('');
  const [verifyUrl, setVerifyUrl] = useState('');
  // Change email (2026-11-01, Syed's order): sits beside Resend. A typo'd
  // address could never be fixed before — resending to a wrong address
  // forever. Only for unverified accounts (the server enforces that).
  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailMsg, setEmailMsg] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);

  // Already verified (e.g. tapped the link on another device) — don't strand
  // them here, move straight on to profile setup.
  useEffect(() => {
    if (user?.emailVerified === true) navigate('/onboard', { replace: true });
  }, [user?.emailVerified, navigate]);

  const resend = async () => {
    setSending(true);
    setMsg('');
    setVerifyUrl('');
    try {
      const res = await http.post('/api/auth/verify/request', {});
      if (res?.devMode && res?.verifyUrl) {
        setVerifyUrl(res.verifyUrl);
        setMsg('Email sending is not configured yet — use this link to verify:');
      } else if (res?.alreadyVerified) {
        setMsg('Your email is already verified.');
        refreshUser?.();
      } else {
        setMsg(res?.message || 'Verification email sent — check your inbox.');
      }
    } catch (e) {
      setMsg(e?.message || 'Could not send verification email. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const saveEmail = async (e) => {
    e.preventDefault();
    const clean = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      setEmailMsg('That email address does not look valid.');
      return;
    }
    setEmailSaving(true);
    setEmailMsg('');
    try {
      const res = await http.post('/api/auth/change-email', { email: clean });
      setMsg(res?.message || 'Verification email sent to your new address — check your inbox.');
      setEditingEmail(false);
      refreshUser?.();
    } catch (err) {
      setEmailMsg(err?.message || 'Could not change your email. Please try again.');
    } finally {
      setEmailSaving(false);
    }
  };

  return (
    <Layout>
      <main className="max-w-md mx-auto px-6 py-12 sm:py-16 text-center">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-6"
          style={{ background: 'linear-gradient(135deg,#10b981,#d4af69)', color: '#fff' }}
        >
          <Mail className="w-6 h-6" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold" style={{ color: 'var(--color-ink)' }}>
          Check your email
        </h1>
        <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--color-ink-secondary)' }}>
          We sent a verification link to{' '}
          <strong style={{ color: 'var(--color-ink)' }}>{user?.email || 'your email address'}</strong>.
          One tap verifies your account and unlocks messaging — your profile
          becomes visible to other Shia families.
        </p>
        <p className="mt-2 text-xs" style={{ color: 'var(--color-ink-faint)' }}>
          Don&apos;t see it? Check spam and promotions — it comes from no-reply@shiarishta.com.
          The link works for 72 hours.
        </p>

        {msg && (
          <p className="mt-4 text-sm rounded-xl px-4 py-3" style={{ background: 'var(--color-primary-soft)', color: 'var(--color-ink)' }}>
            {msg}
          </p>
        )}
        {verifyUrl && (
          <a href={verifyUrl} className="block mt-2 text-xs font-semibold underline break-all" style={{ color: 'var(--color-primary)' }}>
            {verifyUrl}
          </a>
        )}

        <div className="mt-6 space-y-3">
          <div className="flex gap-3">
            <button
              onClick={resend}
              disabled={sending}
              className="btn btn-primary flex-1 py-3.5 text-base flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <RefreshCw className="w-4 h-4" />
              {sending ? 'Sending…' : 'Resend email'}
            </button>
            <button
              onClick={() => { setNewEmail(user?.email || ''); setEmailMsg(''); setEditingEmail(v => !v); }}
              className="btn flex-1 py-3.5 text-base flex items-center justify-center gap-2"
              style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-ink)' }}
            >
              Change email
            </button>
          </div>
          {editingEmail && (
            <form onSubmit={saveEmail} className="rounded-xl border p-4 space-y-3 text-left" style={{ borderColor: 'var(--color-border)', background: 'var(--color-elevated)' }}>
              <label className="block text-sm font-medium" style={{ color: 'var(--color-ink-secondary)' }}>
                Correct email address
                <input
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="input w-full mt-1.5"
                  style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
                />
              </label>
              {emailMsg && <p className="text-xs" style={{ color: 'var(--color-danger)' }}>{emailMsg}</p>}
              <p className="text-xs" style={{ color: 'var(--color-ink-faint)' }}>
                We&apos;ll send a fresh verification link to the new address. The old link stops working.
              </p>
              <div className="flex gap-3">
                <button type="submit" disabled={emailSaving} className="btn btn-primary flex-1 py-2.5 text-sm disabled:opacity-60">
                  {emailSaving ? 'Saving…' : 'Save new email'}
                </button>
                <button type="button" onClick={() => setEditingEmail(false)} className="btn flex-1 py-2.5 text-sm" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-ink)' }}>
                  Cancel
                </button>
              </div>
            </form>
          )}
          <button
            onClick={() => navigate('/onboard')}
            className="btn w-full py-3.5 text-base flex items-center justify-center gap-2"
            style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-ink)' }}
          >
            Continue to profile setup <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <p className="mt-5 text-xs leading-relaxed" style={{ color: 'var(--color-ink-faint)' }}>
          <CheckCircle2 className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
          You can finish your profile now and verify later — but messaging stays
          locked until your email is verified. Already verified on another device?{' '}
          <button type="button" onClick={() => refreshUser?.()} className="underline font-semibold" style={{ color: 'var(--color-primary)' }}>
            Refresh status
          </button>{' '}
          or <Link to="/dashboard" className="underline font-semibold" style={{ color: 'var(--color-primary)' }}>go to your dashboard</Link>.
        </p>
      </main>
    </Layout>
  );
}
