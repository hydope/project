import { Link } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import Reveal from '../components/Reveal';
import {
  ArrowRight, BadgeCheck, BookOpen, CheckCircle2, Eye, EyeOff, Heart,
  Lock, Sparkles, Users,
} from 'lucide-react';
import Layout from '../layouts/LandingLayout';
import ProfileCard from '../components/ProfileCard.jsx';
import FaqSection from '../components/FaqSection.jsx';
import { useAuth } from '../lib/auth/AuthContext';
import { useProfiles, useStats } from '../lib/api/client';

// Homepage FAQs — genuine questions, keyword-aware, visible on the page so
// the FAQPage JSON-LD in FaqSection is eligible for rich results.
const HOME_FAQS = [
  { q: 'What is Shia Rishta?', a: 'Shia Rishta is a nikah-first matchmaking platform built specifically for Shia Muslims and their families. Unlike generic dating apps, every profile is created with marriage intent, identity verification is built in, and wali/family workflows are part of the journey from the start.' },
  { q: 'Is Shia Rishta free?', a: 'Yes. Creating a profile, browsing, expressing interest, and using guardian tools are all free during early access. There is no payment system today, and core access is intended to stay free — paid tiers, if they ever arrive, would only add convenience features.' },
  { q: 'How does Shia Rishta protect my privacy?', a: 'You control exactly who sees your photos: everyone, only after mutual interest, or only after matching. Your contact details are never shown publicly, conversations require mutual interest, and you can block anyone instantly.' },
  { q: 'Can my family or wali be involved?', a: 'Yes — that is the point. Shia Rishta has built-in wali and guardian workflows: approvals, family-to-family introductions, and chaperoned communication. In Shia fiqh a virgin woman\u2019s nikah requires her wali\u2019s consent, so the platform is designed around that from day one.' },
  { q: 'Who can join Shia Rishta?', a: 'Shia Muslims who are seriously seeking nikah, along with their parents, guardians, and trusted matchmakers acting on their behalf. Profiles are reviewed for genuine marriage intent.' },
  { q: 'How is this different from other matrimonial sites?', a: 'Three things: it is Shia-specific (marja, sect, and practice filters that generic sites don\u2019t have), privacy-first (photo tiers instead of public galleries), and nikah-first (no swiping culture — conversations are limited and purposeful).' },
];

// ── Reference-parity copy (shiarishta12.netlify.app) ────────────────────────
const HERO_CHIPS = [
  { icon: BadgeCheck, label: 'Verified women', className: 'c1' },
  { icon: Sparkles, label: 'Smart matching', className: 'c2' },
  { icon: Lock, label: 'Photo privacy', className: 'c3' },
  { icon: Users, label: 'Wali workflow', className: 'c4' },
];

const QUIET_FEATURES = [
  { icon: BadgeCheck, title: 'Verified intent', desc: 'Identity and marriage-intention checks before sensitive access opens.' },
  { icon: EyeOff, title: 'Privacy-first photos', desc: 'Members can show photos publicly, after mutual interest, or only after matching.' },
  { icon: Users, title: 'Family supported', desc: 'Wali and family workflows are built into the journey from the start.' },
  { icon: Sparkles, title: 'Daily suggestions', desc: 'A limited number of higher-quality matches based on values, practice, and life stage.' },
];

const TRUST_STEPS = [
  { title: 'Intent assessment', desc: 'Marriage goals, religious practice, family background, and timeline.' },
  { title: 'Verified profile', desc: 'Identity, intention, and safety checks create a higher-trust member pool.' },
  { title: 'Private introduction', desc: 'Intro messages are limited, contact exchange requires agreement, and families can be included.' },
];

const PREMIUM_TOOLS = [
  'Verified profiles only access',
  'Contact exchange after mutual agreement',
  'Video introductions kept private',
  'Profile insights for views and saves',
  'Family-to-family communication tools',
  'Nikah planning and guidance resources',
];

// Self-hosted WebP hero (was a hotlinked Unsplash JPEG): 34KB vs 91KB,
// no third-party DNS/TLS on the critical path, immutable-cacheable.
const HERO_IMAGE = '/hero-nikah.webp';


export default function Home() {
  const reduceMotion = useReducedMotion();
  const { isLoggedIn, user } = useAuth();
  const { data, isLoading: profilesLoading } = useProfiles({});
  // Featured profiles: prefer members with a real bio — never showcase
  // empty "No profile summary yet." cards on the homepage.
  const featured = (data || [])
    .filter(p => (p.bio || p.aboutFamily || '').trim().length > 0)
    .slice(0, 6);

  // Community counts, straight from the database. Until this resolves we show
  // nothing rather than a placeholder number — a wrong figure on a marriage
  // site is worse than an absent one, and the endpoint is a single cheap query.
  const { data: stats } = useStats();
  const memberCount = Number(stats?.members ?? 0);
  const cityCount = Number(stats?.cities ?? 0);
  const verifiedCount = Number(stats?.verified ?? 0);
  const hasStats = !!stats;

  return (
    <Layout>
      <div className="hp-home">
        {/* ── Elite hero ── */}
        <section className="hp-hero">
          <div className="hp-hero-inner">
            <Reveal className="hp-hero-copy">
              <p className="hp-eyebrow"><span aria-hidden="true" /> Private Shia matchmaking</p>
              <h1>{isLoggedIn ? `Welcome back, ${user?.displayName || "friend"}` : "Shia Rishta"}</h1>
              <p className="hp-lede">
                A refined nikah-first platform where serious families can discover verified,
                privacy-protected profiles with clarity, dignity, and intention.
              </p>
              <div className="hp-cta-row">
                {isLoggedIn ? (<Link to="/dashboard" className="hp-btn-primary">Go to your dashboard <ArrowRight className="w-4 h-4" aria-hidden="true" /></Link>) : (<Link to="/profiles" className="hp-btn-primary">Browse profiles <ArrowRight className="w-4 h-4" aria-hidden="true" /></Link>)}
                {isLoggedIn ? (<Link to="/profiles" className="hp-btn-ghost">Continue browsing</Link>) : (<Link to="/auth/register" className="hp-btn-ghost">Create free account</Link>)}
              </div>
            </Reveal>

            <Reveal
              className="hp-visual"
              delay={0.12}
            >
              <div className="hp-visual-frame">
                <img src={HERO_IMAGE} alt="Nikah celebration" loading="eager" fetchPriority="high" decoding="async" width="1200" height="800" />
              </div>
              {/* The stagger below is deliberately tiny (80ms steps, ~240ms total).
                  It used to be 700ms steps, so the fourth chip waited 2.1s to appear.
                  These badges sit inside the hero, and LCP is re-recorded each time the
                  growing hero paints — a decorative badge appearing 2.1s late was pushing
                  LCP past 5s on a throttled connection. */}
              {HERO_CHIPS.map(({ icon: Icon, label, className }, i) => (
                <span
                  key={label}
                  className={`hp-chip ${className}`}
                  style={reduceMotion ? undefined : { animationDelay: `${i * 0.08}s` }}
                >
                  <Icon className="w-4 h-4" aria-hidden="true" /> {label}
                </span>
              ))}
              {/* Real counts from the database, not a marketing number.
                  This card used to read "96% values match" — a figure no code
                  anywhere computed. A matchmaking site that advertises a
                  statistic it cannot produce is the same trust failure as
                  displaying QA shells, just quieter. */}
              <div className="hp-float-card">
                <span className="hp-float-icon" aria-hidden="true"><Heart className="w-4 h-4" /></span>
                <div>
                  <strong>{memberCount} {memberCount === 1 ? 'member' : 'members'}</strong>
                  <span>{cityCount > 0 ? `across ${cityCount} ${cityCount === 1 ? 'city' : 'cities'}` : 'and growing'}</span>
                </div>
              </div>
            </Reveal>
          </div>
          <p className="hp-visual-caption">
            <Lock className="w-3.5 h-3.5" aria-hidden="true" />
            Photo access, guardian contact, and contact details can unlock only when both sides agree.
          </p>
        </section>

        {/* ── Community proof ──
            Real numbers only. If the endpoint fails this band renders nothing,
            so a broken API can never leave a stale or invented claim on the
            page — the failure mode of a hardcoded figure. */}
        {hasStats && memberCount > 0 && (
          <section className="hp-stats" aria-label="Community at a glance">
            <p className="hp-eyebrow"><span aria-hidden="true" /> Community at a glance</p>
            <dl className="hp-stats-row">
              <div className="hp-stat">
                <dt>Members</dt>
                <dd>{memberCount}</dd>
              </div>
              <div className="hp-stat">
                <dt>Cities</dt>
                <dd>{cityCount}</dd>
              </div>
              {verifiedCount > 0 && (
                <div className="hp-stat">
                  <dt>Identity verified</dt>
                  <dd>{verifiedCount}</dd>
                </div>
              )}
              <div className="hp-stat">
                <dt>Cost</dt>
                <dd>Free</dd>
              </div>
            </dl>
            {stats.topCities?.length > 0 && (
              <p className="hp-stats-cities">
                Families from {stats.topCities.join(', ')}
              </p>
            )}
            <p className="hp-stats-note">
              Counts are live from our database and update as members join. Verification is
              reviewed by a human, so the number moves only as reviews complete.
            </p>
          </section>
        )}

        {/* ── Quiet feature grid ── */}
        <section className="hp-features" aria-label="Platform principles">
          {QUIET_FEATURES.map(({ icon: Icon, title, desc }, i) => (
            <Reveal as="article" key={title} className="hp-feature" delay={i * 0.06}>
              <span className="hp-feature-icon"><Icon className="w-5 h-5" aria-hidden="true" /></span>
              <h3>{title}</h3>
              <p>{desc}</p>
            </Reveal>
          ))}
        </section>

        {/* ── Designed for trust (split + steps) ── */}
        <section className="hp-section">
          <div className="hp-split">
            <Reveal className="hp-split-copy">
              <p className="hp-eyebrow"><span aria-hidden="true" /> Privacy by design</p>
              <h2>Designed for trust</h2>
              <p className="hp-lede">Attractive, simple, and protective by design.</p>
              <div className="hp-member-cards">
                <div className="hp-member-card">
                  <span className="hp-feature-icon"><Sparkles className="w-4 h-4" aria-hidden="true" /></span>
                  <div>
                    <strong>For female members</strong>
                    <p>Present themselves beautifully without giving up control.</p>
                  </div>
                </div>
                <div className="hp-member-card">
                  <span className="hp-feature-icon"><Eye className="w-4 h-4" aria-hidden="true" /></span>
                  <div>
                    <strong>For male members</strong>
                    <p>See enough to understand compatibility, while private details open through respectful steps.</p>
                  </div>
                </div>
              </div>
            </Reveal>
            <Reveal as="ol" className="hp-steps" delay={0.1}>
              {TRUST_STEPS.map((step, i) => (
                <li key={step.title}>
                  <span className="hp-step-num" aria-hidden="true">{i + 1}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.desc}</p>
                  </div>
                </li>
              ))}
            </Reveal>
          </div>
        </section>

        {/* ── Featured profiles ── */}
        <section className="hp-section">
          <Reveal className="hp-section-head">
            <p className="hp-eyebrow"><span aria-hidden="true" /> Featured profiles</p>
            <h2>Curated profiles that feel premium at first glance</h2>
            <p className="hp-lede hp-lede-center">
              A quiet look at the member experience — privacy is the default, and members who have
              completed identity verification carry a visible badge.
            </p>
          </Reveal>
          <div className="profile-grid">
            {(featured.length ? featured : Array.from({ length: 6 })).map((p, i) => (
              <Reveal key={p?.id || i} delay={(i % 3) * 0.06}>
                {p ? (
                  <ProfileCard profile={p} actions={false} />
                ) : (
                  <div className="profiles-card profiles-card-skeleton" aria-hidden="true">
                    <div className="skeleton" style={{ height: 250 }} />
                    <div className="pcard-body">
                      <div className="skeleton" style={{ height: 12, width: '55%' }} />
                      <div className="skeleton" style={{ height: 11, width: '70%' }} />
                      <div className="skeleton" style={{ height: 11, width: '45%' }} />
                    </div>
                  </div>
                )}
              </Reveal>
            ))}
          </div>
          <div className="hp-featured-cta">
            {isLoggedIn ? (<Link to="/dashboard" className="hp-btn-primary">Go to your dashboard <ArrowRight className="w-4 h-4" aria-hidden="true" /></Link>) : (<Link to="/profiles" className="hp-btn-primary">Browse all profiles <ArrowRight className="w-4 h-4" aria-hidden="true" /></Link>)}
            <span>{profilesLoading ? 'Finding members…' : `${(data || []).length} curated members`} · {isLoggedIn ? "welcome back" : "free to join"}</span>
          </div>
        </section>

        {/* ── Premium experience ── */}
        <section className="hp-section">
          <div className="hp-premium">
            <Reveal>
              <p className="hp-eyebrow"><span aria-hidden="true" /> Premium experience</p>
              <h2>Serious tools for serious nikah conversations</h2>
              <p className="hp-lede">
                Everything is built to protect dignity while keeping momentum toward nikah.
              </p>
              <div className="hp-cta-row">
                <Link to={isLoggedIn ? "/dashboard" : "/auth/register"} className="hp-btn-primary">
                  {isLoggedIn ? "Go to your dashboard" : "Create free account"} <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Link>
              </div>
            </Reveal>
            <Reveal as="ul" className="hp-checklist" delay={0.1}>
              {PREMIUM_TOOLS.map((tool) => (
                <li key={tool}>
                  <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> {tool}
                </li>
              ))}
            </Reveal>
          </div>
        </section>

        {/* ── FAQ (visible + FAQPage JSON-LD for rich results) ── */}
        <FaqSection heading="Shia matrimony, answered" items={HOME_FAQS} id="home" />

        {/* ── Guidance band ── */}
        <section className="hp-section">
          <Reveal className="hp-guidance">
            <div>
              <p className="hp-eyebrow hp-eyebrow-light"><span aria-hidden="true" /> Guidance and community</p>
              <h2>Trust beyond the profile</h2>
              <p>Islamic guidance, events, and family testimonials build trust beyond the profile.</p>
            </div>
            <div className="hp-guidance-actions">
              <Link to="/blog" className="hp-btn-gold">
                <BookOpen className="w-4 h-4" aria-hidden="true" /> Read guidance
              </Link>
              <Link to="/community" className="hp-btn-outline-light">Visit community</Link>
            </div>
          </Reveal>
        </section>
      </div>
    </Layout>
  );
}