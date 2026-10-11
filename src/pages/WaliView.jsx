import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Layout from '../layouts/LandingLayout';
import { Eye } from 'lucide-react';
import VerifiedBadge from '../components/VerifiedBadge';
import { http } from '../lib/api/transport';

// Wali companion view — read-only, token-gated, deliberately minimal.
// The guardian sees one member's profile and nothing else: no browsing, no
// messaging, no other members' data. The member controls (and can revoke) access.
export default function WaliView() {
  const { token } = useParams();
  const [state, setState] = useState({ loading: true, data: null, error: '' });

  useEffect(() => {
    http.get(`/api/wali/${encodeURIComponent(token)}`)
      .then((data) => setState({ loading: false, data, error: '' }))
      .catch((e) => setState({ loading: false, data: null, error: e.message || 'Link invalid.' }));
  }, [token]);

  const m = state.data?.member;

  return (
    <Layout>
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
        {state.loading && (
          <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
            <p style={{ color: 'var(--color-ink-secondary)' }}>Loading…</p>
          </div>
        )}

        {!state.loading && state.error && (
          <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
            <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-ink)' }}>Link unavailable</h1>
            <p className="mb-4" style={{ color: 'var(--color-ink-secondary)' }}>{state.error} The member can generate a new one from Settings at any time.</p>
            <Link to="/community" className="button primary inline-flex px-5 py-2.5 font-semibold">Explore the community</Link>
          </div>
        )}

        {!state.loading && m && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl flex items-start gap-3" style={{ background: 'var(--color-primary-subtle)', border: '1px solid var(--color-border)' }}>
              <Eye className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--color-primary)' }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--color-ink)' }}>Read-only guardian view</p>
                <p className="text-xs" style={{ color: 'var(--color-ink-secondary)' }}>
                  You are viewing one member&apos;s profile with their permission. You cannot message, browse, or see anything else — and the member can revoke this link at any moment.
                </p>
              </div>
            </div>

            <div className="p-6 rounded-2xl" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--color-ink)' }}>
                  {m.displayName}{m.age ? `, ${m.age}` : ''}
                  <VerifiedBadge verifiedKind={m.verifiedKind} iconClassName="w-5 h-5" />
                </h1>
                {m.sect && <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--color-primary-subtle)', color: 'var(--color-primary)' }}>{m.sect}</span>}
              </div>
              {(m.city || m.country) && (
                <p className="text-sm mt-1" style={{ color: 'var(--color-ink-secondary)' }}>{[m.city, m.country].filter(Boolean).join(', ')}</p>
              )}
              {m.profession && <p className="text-sm mt-1" style={{ color: 'var(--color-ink-secondary)' }}>{m.profession}</p>}
              {m.bio && <p className="text-sm mt-4 leading-relaxed" style={{ color: 'var(--color-ink)' }}>{m.bio}</p>}
            </div>

            <p className="text-[11px] text-center" style={{ color: 'var(--color-ink-faint)' }}>
              Families are part of nikah, not an afterthought. Questions about this member go through the platform, never off it.
            </p>
          </div>
        )}
      </main>
    </Layout>
  );
}
