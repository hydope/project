import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useRemote } from '../lib/api/transport';
import BrandLockup from './BrandLockup';
import {
  ShieldCheck, Lock, Users, Send, BadgeCheck, Globe,
} from 'lucide-react';
import { SOCIAL_LINKS } from '../data/socialLinks';

// Inline brand SVG paths (lucide-react no longer ships brand icons).
const BRAND_PATHS = {
  facebook: 'M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.09 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.5c-1.5 0-1.96.93-1.96 1.89v2.26h3.32l-.53 3.49h-2.8V24C19.62 23.1 24 18.1 24 12.07z',
  instagram: 'M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.72 3.72 0 0 1-1.38-.9 3.72 3.72 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16M12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63c-.79.3-1.46.72-2.13 1.38A5.88 5.88 0 0 0 .63 4.14C.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.3.79.72 1.46 1.38 2.13.67.66 1.34 1.08 2.13 1.38.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56a5.88 5.88 0 0 0 2.13-1.38 5.88 5.88 0 0 0 1.38-2.13c.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91a5.88 5.88 0 0 0-1.38-2.13A5.88 5.88 0 0 0 19.86.63C19.1.33 18.22.13 16.95.07 15.67.01 15.26 0 12 0zm0 5.84A6.16 6.16 0 1 0 18.16 12 6.16 6.16 0 0 0 12 5.84zm0 10.15A3.99 3.99 0 1 1 16 12a3.99 3.99 0 0 1-4 3.99zm7.85-10.4a1.44 1.44 0 1 1-2.88 0 1.44 1.44 0 0 1 2.88 0z',
  youtube: 'M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.19C0 8.07 0 12 0 12s0 3.93.5 5.81a3.02 3.02 0 0 0 2.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14C24 15.93 24 12 24 12s0-3.93-.5-5.81zM9.55 15.57V8.43L15.82 12l-6.27 3.57z',
  x: 'M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.41l-5.8-7.58-6.64 7.58H.47l8.6-9.83L0 1.15h7.59l5.24 6.93 6.07-6.93zm-1.29 19.5h2.04L6.49 3.24H4.3l13.31 17.41z',
};

function BrandIcon({ name, className }) {
  const d = BRAND_PATHS[name];
  if (!d) return <span className="text-xs font-bold">TT</span>;
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

// ── SiteFooter — the single shared footer for EVERY page ────────────────────
// Used by LandingLayout (public pages), MainLayout (member + admin pages) and
// the standalone auth screens, so the bottom of the product is identical
// everywhere: deep warm-charcoal band, gold accents, brand column with trust
// badges + status pill, Platform / Resources link columns, newsletter capture,
// and a hairline bottom bar. Fully theme-aware (warm light + warm dusk).
const TRUST_BADGES = [
  { icon: ShieldCheck, label: 'Verified members' },
  { icon: Lock, label: 'Privacy-first' },
  { icon: Users, label: 'Wali-supported' },
];

const PLATFORM_LINKS = [
  { to: '/profiles', label: 'Browse Profiles' },
  { to: '/success-stories', label: 'Success Stories' },
  { to: '/auth/register', label: 'Create Profile' },
  { to: '/profile-guide', label: 'Profile Guide' },
  { to: '/about', label: 'About Us' },
];

const RESOURCE_LINKS = [
  { to: '/blog', label: 'Guidance Blog' },
  { to: '/community', label: 'Community' },
  { to: '/safety', label: 'Safety Center' },
  { to: '/support', label: 'Help & Support' },
  { to: '/contact', label: 'Contact Us' },
];

export default function SiteFooter({ compact = false }) {
  const [email, setEmail] = useState('');
  const [saved, setSaved] = useState(false);

  // HONESTY CONTRACT: there is no newsletter service connected. The address is
  // saved to a local waitlist queue in this browser only — nothing is sent and
  // no success is claimed beyond that. When a mailing service exists, flush
  // this queue to it and delete this comment.
  const subscribe = (e) => {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!value) return;
    try {
      const key = 'shiarishta_waitlist_v1';
      const raw = localStorage.getItem(key);
      const list = raw ? JSON.parse(raw) : [];
      if (!list.includes(value)) list.push(value);
      localStorage.setItem(key, JSON.stringify(list.slice(-200)));
    } catch { /* quota — non-fatal */ }
    setSaved(true);
    setEmail('');
    setTimeout(() => setSaved(false), 6000);
  };

  return (
    <footer className={`site-footer${compact ? ' site-footer-compact' : ''}`} aria-label="Site footer">
      <div className="site-footer-glow" aria-hidden="true" />
      <div className="site-footer-inner">
        {/* ── Top grid ── */}
        <div className="site-footer-grid">
          {/* Brand */}
          <div className="site-footer-brand">
            <Link to="/" className="site-footer-logo" aria-label="Shia Rishta — home">
              <BrandLockup iconSize={40} />
            </Link>
            <p className="site-footer-tagline">
              Privacy-first Shia matchmaking where intention meets introduction.
              Built on trust, verification, and wali-supported journeys.
            </p>
            <div className="site-footer-badges">
              {TRUST_BADGES.map(({ icon: Icon, label }) => (
                <span key={label} className="site-footer-badge">
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" /> {label}
                </span>
              ))}
            </div>
                        <p className="site-footer-status">
              <span className="site-footer-pulse" aria-hidden="true" />
              All systems operational
            </p>
            <div className="demo-banner">
              <BadgeCheck className="w-3.5 h-3.5" aria-hidden="true" />
              {useRemote
                ? 'Accounts and verification data are stored on our servers.'
                : 'Demo build: data is browser-local only, not server-verified.'}
            </div>
          </div>

          {/* Platform */}
          <nav className="site-footer-col" aria-label="Platform">
            <h2 className="site-footer-title">Platform</h2>
            {PLATFORM_LINKS.map(l => (
              <Link key={l.to + l.label} to={l.to}>{l.label}</Link>
            ))}
          </nav>

          {/* Resources */}
          <nav className="site-footer-col" aria-label="Resources">
            <h2 className="site-footer-title">Resources</h2>
            {RESOURCE_LINKS.map(l => (
              <Link key={l.to} to={l.to}>{l.label}</Link>
            ))}
          </nav>

          {/* Newsletter */}
          <div className="site-footer-col site-footer-news">
            <h2 className="site-footer-title">Stay Updated</h2>
            <p className="site-footer-news-copy">
              Get matchmaking guidance and community updates. No spam — ever.
            </p>
            {saved ? (
              <p className="site-footer-success" role="status">
                <BadgeCheck className="w-4 h-4" aria-hidden="true" />
                Saved to the early-access list in this browser — our newsletter isn't connected yet, so nothing was sent.
              </p>
            ) : (
              <form onSubmit={subscribe} className="site-footer-form">
                <label htmlFor="site-footer-email" className="sr-only">Email address</label>
                <input
                  id="site-footer-email"
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="site-footer-input"
                />
                <button type="submit" className="site-footer-submit" aria-label="Subscribe">
                  <Send className="w-4 h-4" aria-hidden="true" />
                </button>
              </form>
            )}
          </div>
        </div>

        {/* ── Bottom bar ── */}
        <div className="site-footer-bottom">
          <span className="site-footer-copy">© {new Date().getFullYear()} Shia Rishta. All rights reserved.</span>
          {/* Social media pages */}
          <div className="site-footer-social" aria-label="Shia Rishta on social media">
            {SOCIAL_LINKS.filter(s => s.url).map(s => (
              <a
                key={s.name}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Shia Rishta on ${s.name}`}
                className="site-footer-social-link"
              >
                <BrandIcon name={s.icon} className="w-4 h-4" />
              </a>
            ))}
          </div>
          <div className="site-footer-legal">
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/safety">Safety</Link>
            <a
              href="https://fazier.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Shia Rishta on Fazier"
              className="site-footer-fazier-badge"
            >
              <img
                src="https://fazier.com/api/v1//public/badges/launch_badges.svg?badge_type=launched&theme=light"
                alt="Featured on Fazier"
                loading="lazy"
                width="120"
                height="36"
              />
            </a>
            <span className="site-footer-lang">
              <Globe className="w-3.5 h-3.5" aria-hidden="true" /> English
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
