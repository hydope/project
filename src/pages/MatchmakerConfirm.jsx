import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Layout from '../layouts/LandingLayout';
import { http } from '../lib/api/transport';
import { usePageTitle } from '../lib/usePageTitle';
import { CheckCircle, XCircle, Loader2, HeartHandshake } from 'lucide-react';

// Confirm a matchmaker-submitted profile (2026-11-10, external-audit
// fixes): the subject of a submission taps the link in the consent email.
// Public page — the subject has no account. POSTs once on mount; a token
// is single-use, so a second tap (or a prefetched link) lands on the
// already-used state, not a silent success.
export default function MatchmakerConfirm() {
  usePageTitle('Confirm your profile');
  const { token } = useParams();
  const [state, setState] = useState({ status: 'loading', name: '', error: '' });

  useEffect(() => {
    let alive = true;
    http.post(`/api/matchmaker/confirm/${encodeURIComponent(token || '')}`, {})
      .then((r) => {
        if (alive) setState({ status: 'ok', name: r.display_name || 'Member', error: '' });
      })
      .catch((e) => {
        if (alive) setState({ status: 'error', name: '', error: e.message || 'This confirmation link is invalid or already used.' });
      });
    return () => { alive = false; };
  }, [token]);

  return (
    <Layout>
      <main className="max-w-xl mx-auto px-4 sm:px-6 py-12 sm:py-16 text-center">
        <HeartHandshake className="w-10 h-10 mx-auto mb-4" style={{ color: 'var(--color-primary)' }} />
        {state.status === 'loading' && (
          <>
            <Loader2 className="w-6 h-6 mx-auto mb-3 animate-spin" style={{ color: 'var(--color-ink-faint)' }} />
            <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-ink)' }}>Confirming your profile…</h1>
            <p className="text-sm" style={{ color: 'var(--color-ink-secondary)' }}>Please wait a moment.</p>
          </>
        )}
        {state.status === 'ok' && (
          <>
            <CheckCircle className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--color-success, #1a7f4e)' }} />
            <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-ink)' }}>Thank you, {state.name} — confirmed.</h1>
            <p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--color-ink-secondary)' }}>
              Your profile now goes to our team for review. If it is approved, it will appear as a
              browsable profile on Shia Rishta. If you change your mind, ask the admin to remove it
              at any time — use the contact form and mention the name on the profile.
            </p>
            <Link to="/" className="btn btn-primary">Back to Shia Rishta</Link>
          </>
        )}
        {state.status === 'error' && (
          <>
            <XCircle className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--color-danger, #c0392b)' }} />
            <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-ink)' }}>This link can’t be used</h1>
            <p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--color-ink-secondary)' }}>
              {state.error} If you expected a confirmation link, ask the person who submitted your
              profile to submit it again — a fresh link will be emailed to you.
            </p>
            <Link to="/" className="btn btn-primary">Back to Shia Rishta</Link>
          </>
        )}
      </main>
    </Layout>
  );
}
