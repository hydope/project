import { usePageTitle } from '../lib/usePageTitle';
import { Link } from 'react-router-dom';
import Layout from '../layouts/MainLayout';
import { useAuth } from '../lib/auth/AuthContext';
import { api } from '../lib/api/client';
import { http } from '../lib/api/transport';
import { useAuthedImage } from '../lib/api/useAuthedImage';
import { computeProfileCompleteness } from '../lib/onboardingData';
import { getMyProfile } from '../lib/storage';
import { computeCompatibility } from '../lib/compatibility';
import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  User, MessageCircle, Eye, Users, Sparkles, Flame, ArrowRight, ShieldCheck
} from 'lucide-react';

// Match card with authenticated photo loading and monogram fallback.
function MatchCard({ p, i }) {
  const { url: photoUrl } = useAuthedImage(p.photo);
  const hasPhoto = Boolean(photoUrl);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.06, duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
    >
      <Link to={'/profiles/' + p.id} className="card card-interactive overflow-hidden block group">
        <div className="aspect-[4/3] overflow-hidden relative" style={{ background: 'var(--color-surface)' }}>
          {hasPhoto ? (
            <img src={photoUrl} alt={p.displayName} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" onError={e => { e.currentTarget.style.display = 'none'; }} />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-4xl font-bold select-none"
              role="img" aria-label={`${p.displayName} has not added a photo`}
              style={{ background: 'linear-gradient(160deg, #134e39 0%, #0c1220 70%)', color: 'rgba(212,175,105,0.35)' }}>
              {(p.displayName || '?').trim()[0]?.toUpperCase()}
            </div>
          )}
        </div>
        <div className="p-3">
          <p className="font-medium text-sm truncate" style={{ color: 'var(--color-ink)' }}>{p.displayName}, {p.age}</p>
          <p className="text-xs truncate" style={{ color: 'var(--color-ink-secondary)' }}>{p.city}, {p.country}</p>
          <div className="mt-2 flex items-center gap-1">
            {typeof p.score === 'number' && !Number.isNaN(p.score) && (
              <span className="badge badge-success text-xs font-bold">{p.score}%</span>
            )}
            {p.is_verified && <ShieldCheck className="w-3 h-3" style={{ color: 'var(--color-warning)' }} />}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

export default function Dashboard() {
  usePageTitle('Dashboard');
  const { user } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getProfiles().catch(() => []),
      api.getConversations().catch(() => []),
    ]).then(([p, c]) => {
      setProfiles(p);
      setConversations(c);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const rankedMatches = useMemo(() => {
    if (!profiles.length) return [];
    // Never show the member their own profile as a match.
    const me = String(user?.uid || '');
    const myProfile = typeof getMyProfile === 'function' ? getMyProfile() : null;
    return profiles
      .filter(p => String(p.id ?? p.user_id ?? p.uid ?? '') !== me)
      .map(p => {
        // Honest score only when the viewer has onboarded; otherwise null.
        let score = null;
        try {
          if (myProfile?.sect) {
            score = computeCompatibility(p, myProfile)?.overall ?? null;
          }
        } catch { /* ignore */ }
        return { ...p, score };
      })
      .filter(p => typeof p.score === 'number' && !Number.isNaN(p.score))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
  }, [profiles, user]);

  const topMatch = rankedMatches[0];
  // Single source of truth: the onboarding wizard's scoring model. Falls back
  // to 75 only when the member has never completed a profile draft.
  const savedProfile = typeof getMyProfile === 'function' ? getMyProfile() : null;
  const completeness = savedProfile
    ? computeProfileCompleteness(savedProfile)
    : 75;
  // Real counts from the API — never fabricated figures.
  const unreadCount = conversations.reduce((n, c) => n + (c.unread_count || 0), 0);
  const activeConvos = conversations.length;

  const statCards = [
    {
      label: 'Profile Completeness',
      value: completeness + '%',
      icon: User,
      color: 'var(--color-primary)',
      bg: 'var(--color-primary-subtle)',
      trend: completeness >= 80 ? 'On track' : 'Add more details to attract better matches',
    },
    {
      label: 'Top Match Score',
      value: topMatch?.score ? topMatch.score + '%' : '—',
      icon: Flame,
      color: 'var(--color-danger)',
      bg: 'var(--color-danger-subtle)',
      trend: topMatch ? 'with ' + topMatch.displayName : 'Complete onboarding for match scores',
    },
    {
      label: 'Active Conversations',
      value: String(activeConvos),
      icon: MessageCircle,
      color: 'var(--color-success)',
      bg: 'var(--color-success-subtle)',
      trend: unreadCount > 0 ? `${unreadCount} unread message${unreadCount === 1 ? '' : 's'}` : 'No unread messages',
    },
    {
      label: 'Potential Matches',
      value: String(rankedMatches.length),
      icon: Eye,
      color: 'var(--color-accent)',
      bg: 'var(--color-accent-subtle)',
      trend: rankedMatches.length > 0 ? 'Based on your preferences' : 'Complete your profile for matches',
    },
  ];

  const [verifyMsg, setVerifyMsg] = useState('');
  const [verifySending, setVerifySending] = useState(false);
  const [verifyUrl, setVerifyUrl] = useState('');
  const resendVerification = async () => {
    setVerifySending(true);
    setVerifyMsg('');
    setVerifyUrl('');
    try {
      // Must be /api-prefixed. transport.js resolves paths against VITE_API_URL
      // (https://shiarishta.com in production), so a bare '/auth/verify/request'
      // hit the SPA fallback and returned index.html with a 200 — the resend
      // button reported success while sending no email at all.
      const res = await http.post('/api/auth/verify/request', {});
      if (res?.devMode && res?.verifyUrl) {
        setVerifyUrl(res.verifyUrl);
        setVerifyMsg('Email sending is not configured yet — use this link to verify:');
      } else if (res?.alreadyVerified) {
        setVerifyMsg('Your email is already verified.');
      } else {
        setVerifyMsg(res?.message || 'Verification email sent — check your inbox.');
      }
    } catch (e) {
      setVerifyMsg(e?.message || 'Could not send verification email.');
    } finally {
      setVerifySending(false);
    }
  };

  return (
    <Layout>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        {user && user.emailVerified === false && (
          <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="text-sm flex-1" style={{ color: 'var(--color-ink)' }}>
              <strong>Verify your email</strong> to unlock messaging and publishing. Check your inbox for the verification link.
              {verifyMsg && <span className="block mt-1 text-xs opacity-80">{verifyMsg}</span>}
              {verifyUrl && (
                <a href={verifyUrl} className="block mt-1 text-xs font-semibold underline break-all" style={{ color: 'var(--color-primary)' }}>
                  {verifyUrl}
                </a>
              )}
            </p>
            <button
              onClick={resendVerification}
              disabled={verifySending}
              className="shrink-0 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: 'var(--color-primary)' }}
            >
              {verifySending ? 'Sending…' : 'Resend email'}
            </button>
          </div>
        )}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold" style={{ color: 'var(--color-ink)' }}>
            Welcome back, {user?.displayName || 'there'}
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-ink-secondary)' }}>
            Your matchmaking journey at a glance.
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[...Array(4)].map((_, i) => <div key={i} className="h-28 rounded-xl skeleton" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {statCards.map((card, i) => (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06, duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                className="card p-4 sm:p-5"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs sm:text-sm" style={{ color: 'var(--color-ink-secondary)' }}>{card.label}</span>
                  <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ background: card.bg }}>
                    <card.icon className="w-4 h-4" style={{ color: card.color }} />
                  </div>
                </div>
                <p className="text-2xl sm:text-3xl font-bold" style={{ color: 'var(--color-ink)' }}>{card.value}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--color-ink-tertiary)' }}>{card.trend}</p>
              </motion.div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <h2 className="text-heading mb-4" style={{ color: 'var(--color-ink)' }}>Quick actions</h2>
            <div className="space-y-3">
              {[
                { to: '/profiles', icon: Users, label: 'Browse profiles', desc: 'Discover your ideal match', color: 'var(--color-primary)', bg: 'var(--color-primary-subtle)' },
                { to: '/messages', icon: MessageCircle, label: 'Messages', desc: 'Check your conversations', color: 'var(--color-success)', bg: 'var(--color-success-subtle)' },
                { to: '/onboard', icon: Sparkles, label: 'Update profile', desc: 'Improve your match quality', color: 'var(--color-warning)', bg: 'var(--color-warning-subtle)' },
              ].map(action => {
              const ActionIcon = action.icon;
              return (
                <Link key={action.to} to={action.to} className="card card-interactive flex items-center gap-3 p-4">
                  <div className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: action.bg }}>
                    <ActionIcon className="w-5 h-5" style={{ color: action.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm" style={{ color: 'var(--color-ink)' }}>{action.label}</p>
                    <p className="text-xs" style={{ color: 'var(--color-ink-secondary)' }}>{action.desc}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-ink-tertiary)' }} />
                </Link>
              );
            })}
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-heading" style={{ color: 'var(--color-ink)' }}>Top matches for you</h2>
              <Link to="/profiles" className="link-primary text-sm font-semibold">View all</Link>
            </div>
            {loading ? (
              <div className="grid grid-cols-2 gap-4">
                {[...Array(4)].map((_, i) => <div key={i} className="h-48 rounded-xl skeleton" />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {profiles.slice(0, 4).map((p, i) => (
                  <MatchCard key={p.id} p={p} i={i} />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </Layout>
  );
}
