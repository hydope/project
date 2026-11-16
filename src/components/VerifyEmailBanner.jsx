import { useState } from 'react';
import { Link } from 'react-router-dom';
import { http } from '../lib/api/transport';

// Global verify-email banner (2026-11-15, Batch C — verification cliff).
// The banner used to live only on Dashboard, so a member who landed on
// Messages/Profiles/Community first never saw why actions were locked.
// MainLayout renders this on every member page except the ones that
// carry their own richer version (Dashboard, Onboard) or are the verify
// flow itself. One-tap resend posts to the same endpoint Dashboard uses.
export default function VerifyEmailBanner() {
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [verifyUrl, setVerifyUrl] = useState('');

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
        setMsg('Your email is already verified — refresh the page.');
      } else {
        setMsg(res?.message || 'Verification email sent — check your inbox.');
      }
    } catch (e) {
      setMsg(e?.message || 'Could not send verification email.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-4">
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
        <p className="text-sm flex-1" style={{ color: 'var(--color-ink)' }}>
          <strong>Verify your email</strong> to unlock messaging, interests and publishing. Your profile stays hidden from most members until you do.
          {msg && <span className="block mt-1 text-xs opacity-80">{msg}</span>}
          {verifyUrl && (
            <a href={verifyUrl} className="block mt-1 text-xs font-semibold underline break-all" style={{ color: 'var(--color-primary)' }}>
              {verifyUrl}
            </a>
          )}
        </p>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={resend}
            disabled={sending}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: 'var(--color-primary)' }}
          >
            {sending ? 'Sending…' : 'Resend email'}
          </button>
          <Link
            to="/verify-pending"
            className="px-4 py-2 rounded-lg text-sm font-semibold text-center"
            style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-ink)' }}
          >
            Change email
          </Link>
        </div>
      </div>
    </div>
  );
}
