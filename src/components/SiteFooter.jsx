import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useRemote } from '../lib/api/transport';
import BrandLockup from './BrandLockup';
import {
  ShieldCheck, Lock, Users, Send, BadgeCheck, Globe,
} from 'lucide-react';

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
          <div className="site-footer-legal">
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/safety">Safety</Link>
            <span className="site-footer-lang">
              <Globe className="w-3.5 h-3.5" aria-hidden="true" /> English
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
