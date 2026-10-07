import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth/AuthContext';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Menu, X, ArrowRight,
  Bell, LayoutDashboard,
  Shield, User, Lock,
} from 'lucide-react';
// Lazy: the assistant widget + brain load on demand, not in the entry chunk.
const AIAssistant = lazy(() => import('../components/AIAssistant'));
import SiteFooter from '../components/SiteFooter';
import BrandLockup from '../components/BrandLockup';
const FeedbackWidget = lazy(() => import('../components/FeedbackWidget'));
import { applyIsDark, readIsDark, writeIsDark } from '../lib/theme';
import { http } from '../lib/api/transport';

const landingLinks = [
  { href: '/profiles', label: 'Profiles' },
  { href: '/matchmaker', label: 'Matchmaker' },
  { href: '/biodata-maker', label: 'Biodata Maker' },
  { href: '/blog', label: 'Blog' },
  { href: '/community', label: 'Community' },
  { href: '/contact', label: 'Contact' },
];

// Account avatar initials — "Ali K." → "AK", a lone email → its first letter.
const initialsOf = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'U';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
};

// ── Notifications — accessible popover ────────────────────────────────────────
// Real server-side notifications: interests, matches, etc.
function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const { isLoggedIn } = useAuth();
  const navigate = useNavigate();

  // Deep link for each notification type — tapping one takes the member to
  // the exact thing it is about, instead of landing on a dead list.
  const targetFor = (n) => {
    switch (n.type) {
      case 'interest': return n.refId ? `/profiles/${n.refId}` : '/messages';
      case 'match': return '/messages';
      case 'message': return '/messages';
      default: return '/dashboard';
    }
  };

  const openNotification = async (n) => {
    setOpen(false);
    // Mark this one read (best-effort) then navigate.
    try {
      await http.post('/api/profiles/notifications/read', {});
    } catch { /* ignore */ }
    setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, isRead: true } : x));
    setUnreadCount(prev => Math.max(0, prev - 1));
    navigate(targetFor(n));
  };

  const fetchNotifications = async () => {
    if (!isLoggedIn) return;
    setLoading(true);
    try {
      // Uses the shared http helper. This previously called bare fetch() and
      // read localStorage.getItem('token'), but transport.js stores the session
      // under 'sh_token' — so the header sent "Bearer null" and every poll
      // 401'd, silently, every 30 seconds. Notifications never worked.
      const data = await http.get('/api/profiles/notifications');
      const list = Array.isArray(data) ? data : [];
      setNotifications(list);
      setUnreadCount(list.filter(n => !n.isRead).length);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => {
    if (isLoggedIn) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 30000);
      return () => clearInterval(interval);
    }
  }, [isLoggedIn]);

  const markAllRead = async () => {
    try {
      // Same token-key bug as fetchNotifications above.
      await http.post('/api/profiles/notifications/read', {});
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!isLoggedIn) return null;

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        ref={buttonRef}
        className="landing-icon-btn"
        aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen(o => !o)}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute', top: 4, right: 4, width: 10, height: 10,
              borderRadius: '50%', background: 'var(--color-danger)',
              boxShadow: '0 0 0 2px var(--color-canvas)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontSize: '7px', fontWeight: 'bold'
            }}
          >
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="region"
          aria-label="Notifications"
          className="notif-popover"
        >
          <div className="flex items-center justify-between" style={{ padding: '6px 8px 10px' }}>
            <span className="text-xs font-bold" style={{ color: 'var(--color-ink)' }}>Notifications</span>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs" style={{ color: 'var(--color-primary)' }}>
                Mark all read
              </button>
            )}
          </div>
          {loading ? (
            <p className="text-xs" style={{ color: 'var(--color-ink-tertiary)', padding: '8px' }}>Loading...</p>
          ) : notifications.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--color-ink-tertiary)', padding: '8px' }}>
              You're all caught up — there are no notifications.
            </p>
          ) : (
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              {notifications.map(n => (
                <button key={n.id} onClick={() => openNotification(n)}
                  className="w-full text-left hover:bg-black/5 transition-colors"
                  style={{
                    padding: '8px',
                    borderBottom: '1px solid var(--color-border)',
                    background: n.isRead ? 'transparent' : 'var(--color-primary-subtle)',
                    cursor: 'pointer',
                  }}>
                  <p className="text-xs font-semibold" style={{ color: 'var(--color-ink)' }}>{n.title}</p>
                  {n.body && <p className="text-xs" style={{ color: 'var(--color-ink-secondary)' }}>{n.body}</p>}
                  <p className="text-[10px]" style={{ color: 'var(--color-ink-tertiary)' }}>
                    {new Date(n.createdAt).toLocaleDateString()}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ── Account menu — dropdown popover for the avatar chip ───────────────────────
function AccountMenu({ user, logout, open, onClose, onToggle }) {
  const [confirmLogout, setConfirmLogout] = useState(false);
  const rootRef = useRef(null);

  // Sync internal state: close when parent closes, reset confirm when re-opening
  useEffect(() => {
    if (!open) setConfirmLogout(false);
  }, [open]);

  useEffect(() => {
    if (!rootRef.current) return;
    const onPointerDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) onClose();
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const handleLogout = () => {
    logout();
    onClose();
  };

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-flex' }}>
      {/* Avatar chip — opens the menu.
          NOTE: no inline reset here. This element is styled entirely by
          .landing-avatar-btn; an inline `background:'none', border:'none'`
          outranks the class, which erased the gradient and left white
          initials on a white header — i.e. an invisible account button. */}
      <button
        className="landing-avatar-btn"
        aria-label={`Account — ${user?.displayName || 'your profile'}`}
        title={`Your account${user?.displayName ? ` — ${user.displayName}` : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => { setConfirmLogout(false); onToggle(); }}
      >
        {initialsOf(user?.displayName || user?.email)}
      </button>

      {/* Dropdown panel — only rendered when open */}
      {open && (
        <div
        role="region"
        aria-label="Account"
        className="account-menu"
        style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          right: 0,
          minWidth: 200,
          background: 'var(--color-elevated)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.22)',
          padding: '6px',
          zIndex: 60,
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 8px 10px', borderBottom: '1px solid var(--color-border-subtle)', marginBottom: '4px',
        }}>
          <span className="text-xs font-bold" style={{ color: 'var(--color-ink)' }}>Account</span>
          <button
            onClick={onClose}
            aria-label="Close account menu"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', borderRadius: '4px', color: 'var(--color-ink-tertiary)' }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Settings */}
        <Link
          to="/settings"
          onClick={onClose}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '8px 8px', borderRadius: 'var(--radius-md)',
            textDecoration: 'none', fontWeight: 500, fontSize: '0.875rem',
            color: 'var(--color-ink)', cursor: 'pointer',
            transition: 'background 0.15s',
          }}
        >
          <Shield className="w-4 h-4" style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
          Settings
        </Link>

        {/* Profile */}
        <Link
          to="/profile"
          onClick={onClose}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '8px 8px', borderRadius: 'var(--radius-md)',
            textDecoration: 'none', fontWeight: 500, fontSize: '0.875rem',
            color: 'var(--color-ink)', cursor: 'pointer',
            transition: 'background 0.15s',
          }}
        >
          <User className="w-4 h-4" style={{ color: 'var(--color-ink-tertiary)', flexShrink: 0 }} />
          Profile
        </Link>

        {/* Logout */}
        {confirmLogout ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '4px 0', marginTop: '4px', borderTop: '1px solid var(--color-border-subtle)' }}>
            <button
              onClick={handleLogout}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '8px 8px', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-danger)',
                background: 'var(--color-danger-subtle)',
                color: 'var(--color-danger)', fontWeight: 600, fontSize: '0.875rem',
                cursor: 'pointer', width: '100%',
              }}
            >
              <Lock className="w-4 h-4" style={{ flexShrink: 0 }} />
              Yes, sign out
            </button>
            <button
              onClick={() => setConfirmLogout(false)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '8px 8px', borderRadius: 'var(--radius-md)',
                border: 'none', background: 'transparent',
                color: 'var(--color-ink-tertiary)', fontWeight: 500, fontSize: '0.875rem',
                cursor: 'pointer', width: '100%',
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmLogout(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '8px 8px', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              background: 'transparent',
              color: 'var(--color-ink)', fontWeight: 500, fontSize: '0.875rem',
              cursor: 'pointer', width: '100%', marginTop: '4px',
            }}
          >
            <Lock className="w-4 h-4" style={{ color: 'var(--color-ink-tertiary)', flexShrink: 0 }} />
            Sign out
          </button>
        )}
      </div>
    )}
    </div>
  );
}


function LandingHeader() {
  const { isLoggedIn, user, logout } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const location = useLocation();
  const headerRef = useRef(null);
  const mobilePanelRef = useRef(null);
  const mobileToggleRef = useRef(null);
  const reduceMotion = useReducedMotion();
  const accountMenuRef = useRef(null);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  // Keep keyboard focus in the floating panel while it is open.
  useEffect(() => {
    if (!mobileNavOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    mobilePanelRef.current?.querySelector('button')?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setMobileNavOpen(false);
      if (event.key !== 'Tab') return;
      const controls = mobilePanelRef.current?.querySelectorAll('a[href], button:not([disabled])');
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => { if (desktop.matches) setMobileNavOpen(false); };
    desktop.addEventListener('change', closeOnDesktop);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      desktop.removeEventListener('change', closeOnDesktop);
      mobileToggleRef.current?.focus();
    };
  }, [mobileNavOpen]);

  // Close account menu on outside click or Escape
  useEffect(() => {
    if (!accountMenuOpen) return;
    const handleClickOutside = (e) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target)) {
        setAccountMenuOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setAccountMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [accountMenuOpen]);

  const toggleMobileNav = () => setMobileNavOpen(o => !o);

  return (
    <>
      <header className="landing-header" ref={headerRef}>
        <div className="landing-header-inner">
          {/* Logo */}
          <Link to="/" className="landing-brand" aria-label="Shia Rishta — home">
            <BrandLockup iconSize={36} />
          </Link>

          {/* Primary nav — centered */}
          <nav className="landing-nav" aria-label="Main navigation">
            {landingLinks.map(l => (
              <Link key={l.href} to={l.href}>{l.label}</Link>
            ))}
          </nav>

          {/* Secondary actions — right */}
          <div className="landing-header-actions">
            {/* Dashboard — directly after AI, members only */}
            {isLoggedIn && (
              <Link
                to="/dashboard"
                className="btn btn-primary btn-sm landing-header-cta"
                aria-label="Go to your dashboard"
              >
                <LayoutDashboard className="w-4 h-4" />
                <span className="hidden sm:inline">Dashboard</span>
              </Link>
            )}

            {/* Icon group: Notifications + Account (appearance lives in Account Settings) */}
            <div className="landing-header-icon-group">
              {isLoggedIn && <NotificationsMenu />}
              {isLoggedIn && <AccountMenu user={user} logout={logout} open={accountMenuOpen} onToggle={() => setAccountMenuOpen(o => !o)} onClose={() => setAccountMenuOpen(false)} />}
            </div>

            {/* Auth CTA — visitors */}
            {!isLoggedIn && (
              <>
                <Link to="/auth/login" className="btn btn-ghost btn-sm landing-cta-header-login landing-header-cta">
                  Sign in
                </Link>
                <Link to="/auth/register" className="btn btn-primary btn-sm landing-cta-header landing-header-cta">
                  Create free account
                </Link>
              </>
            )}

            {/* Mobile menu toggle - visible only on mobile */}
            <button
              ref={mobileToggleRef}
              type="button"
              className="landing-icon-btn landing-menu-btn"
              onClick={toggleMobileNav}
              aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileNavOpen}
              aria-controls="mobile-nav-panel"
            >
              {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile navigation overlay backdrop */}
      <AnimatePresence>
        {mobileNavOpen && (
          <motion.div
            key="mobile-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
            className="mobile-nav-backdrop lg:hidden"
            aria-hidden="true"
            onClick={() => setMobileNavOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Mobile navigation drawer */}
      <AnimatePresence>
        {mobileNavOpen && (
          <motion.div
            key="mobile-nav-panel"
            ref={mobilePanelRef}
            initial={{ opacity: 0, y: reduceMotion ? 0 : -12, scale: reduceMotion ? 1 : 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : -8 }}
            transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="mobile-nav-drawer lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Mobile navigation"
            id="mobile-nav-panel"
          >
            {/* Mobile nav header */}
            <div className="mobile-nav-header">
              <Link to="/" className="flex items-center gap-2" onClick={() => setMobileNavOpen(false)}>
                <BrandLockup iconSize={36} />
              </Link>
              <button
                className="landing-icon-btn"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close menu"
                style={{ width: '36px', height: '36px' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mobile nav links */}
            <nav className="mobile-nav-links p-4 space-y-1">
              {landingLinks.map(l => (
                <Link
                  key={l.href}
                  to={l.href}
                  className="mobile-nav-link"
                  aria-current={location.pathname === l.href ? 'page' : undefined}
                  onClick={() => setMobileNavOpen(false)}
                >
                  {l.label}
                </Link>
              ))}
            </nav>

            {/* Mobile auth section */}
            <div className="mobile-nav-auth">
              {isLoggedIn ? (
                <Link
                  to="/dashboard"
                  className="btn btn-primary w-full"
                  onClick={() => setMobileNavOpen(false)}
                >
                  Dashboard <ArrowRight className="w-4 h-4" />
                </Link>
              ) : (
                <div className="flex flex-col gap-2">
                  <Link to="/auth/login" className="btn btn-ghost w-full" onClick={() => setMobileNavOpen(false)}>
                    Sign in
                  </Link>
                  <Link to="/auth/register" className="btn btn-primary w-full" onClick={() => setMobileNavOpen(false)}>
                    Create free account
                  </Link>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ── Footer — every page (public + member + admin) shares one SiteFooter ──────
// (The old landing-only LandingFooter was removed: it used class names with no
// matching CSS, which is exactly why the bottom looked broken/trashy.)

export default function LandingLayout({ children }) {
  // Warm editorial light is the product default — see lib/theme.js. The
  // versioned key means a stale `dark` from an older build cannot resurrect.
  const [dark, setDark] = useState(readIsDark);
  const location = useLocation();

  useEffect(() => {
    writeIsDark(dark);
    applyIsDark(dark);
  }, [dark]);

  return (
    <div className="landing-shell">
      <LandingHeader />
      {/* NOTE: page content renders in a plain <main> — never gated behind an
          animation's initial opacity. framer-motion is an enhancement only; if it
          fails or stalls, the page must still be fully visible. */}
      <main
        key={location.pathname}
        className="landing-main flex-1"
        style={{ paddingTop: 'var(--header-height)' }}
      >
        {children}
      </main>
      <SiteFooter />

      {/* AI Assistant FAB */}
      <Suspense fallback={null}>
        <AIAssistant />
      </Suspense>

      {/* Feedback widget — bottom-left, clear of the AI assistant FAB */}
      <Suspense fallback={null}>
        <FeedbackWidget />
      </Suspense>

      {/* Mobile nav styles */}
      <style>{`
        .mobile-nav-link {
          display: block;
          padding: 0.875rem 1rem;
          border-radius: var(--radius-md);
          font-size: 1.0625rem;
          font-weight: 500;
          color: var(--color-ink);
          text-decoration: none;
          transition: all 0.15s ease;
        }
        .mobile-nav-link:hover,
        .mobile-nav-link:focus {
          background: var(--color-hover);
          color: var(--color-primary);
          outline: none;
        }
        .mobile-nav-link:focus-visible {
          outline: 2px solid var(--color-primary);
          outline-offset: 2px;
        }
        .landing-cta-header-login { display: inline-flex; }
        .landing-cta-header { display: inline-flex; }
        .landing-header-ai span { display: inline; }
        @media (max-width: 960px) {
          .landing-cta-header-login { display: none; }
          .landing-header-ai span { display: none; }
        }
        @media (max-width: 640px) {
          .landing-cta-header { display: none; }
        }
        @media (min-width: 1024px) {
          .landing-menu-btn { display: none !important; }
        }
      `}</style>
    </div>
  );
}
