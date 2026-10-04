import { useEffect, useState, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth/AuthContext';
import { readIsDark, writeIsDark, applyIsDark } from '../lib/theme';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Moon, Search, Command, X, LayoutDashboard, Users, MessageCircle,
  BookOpen, LifeBuoy, Settings, LogOut, Home, Menu,
  Shield, ShieldAlert, BarChart3, History, HandHeart, BadgeCheck, KeyRound, UserCheck
} from 'lucide-react';
import ThemeMenu from '../components/ThemeMenu';
// Lazy: the assistant widget + brain load on demand, not in the entry chunk.
const AIAssistant = lazy(() => import('../components/AIAssistant'));
import BrandLockup from '../components/BrandLockup';

// ── Command Palette — Full-text search across navigation + actions ───────────
function CommandPalette({ open, onClose, toggleTheme, isAdmin }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const commands = useMemo(() => [
    { label: 'Go to Home', icon: Home, path: '/', section: 'Navigate' },
    { label: 'Go to Profiles', icon: Users, path: '/profiles', section: 'Navigate' },
    { label: 'Go to Dashboard', icon: LayoutDashboard, path: '/dashboard', section: 'Navigate' },
    { label: 'Go to Messages', icon: MessageCircle, path: '/messages', section: 'Navigate' },
    { label: 'Go to Blog', icon: BookOpen, path: '/blog', section: 'Navigate' },
    { label: 'Go to Community', icon: Users, path: '/community', section: 'Navigate' },
    { label: 'Go to Support', icon: LifeBuoy, path: '/support', section: 'Navigate' },
    { label: 'Go to Settings', icon: Settings, path: '/settings', section: 'Navigate' },
    ...(isAdmin ? [
      { label: 'Go to Admin Panel', icon: Shield, path: '/admin/dashboard', section: 'Admin' },
      { label: 'Go to Moderation Queue', icon: ShieldAlert, path: '/admin/queue', section: 'Admin' },
      { label: 'Go to Verify Accounts', icon: UserCheck, path: '/admin/verify-accounts', section: 'Admin' },
      { label: 'Go to Admin Members', icon: Users, path: '/admin/members', section: 'Admin' },
      { label: 'Go to Admin Analytics', icon: BarChart3, path: '/admin/analytics', section: 'Admin' },
    ] : []),
    { label: 'Toggle Dark Mode', icon: Moon, action: 'theme', section: 'Actions' },
  ], [isAdmin]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return commands;
    return commands.filter(c =>
      c.label.toLowerCase().includes(q) ||
      c.section.toLowerCase().includes(q)
    );
  }, [query, commands]);

  // Group by section
  const grouped = useMemo(() => {
    const groups = {};
    filtered.forEach(cmd => {
      if (!groups[cmd.section]) groups[cmd.section] = [];
      groups[cmd.section].push(cmd);
    });
    return groups;
  }, [filtered]);

  // Reset selection when query changes
  useEffect(() => { setSelectedIndex(0); }, [query]);

  // Focus input on open
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = filtered[selectedIndex];
      if (selected) {
        if (selected.action === 'theme') toggleTheme();
        else if (selected.path) navigate(selected.path);
        onClose();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  }, [filtered, selectedIndex, onClose, toggleTheme, navigate]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selected = listRef.current.children[selectedIndex];
      if (selected) selected.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!open) return null;

  let flatIndex = -1;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.1 }}
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: -8 }}
        transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-lg glass overflow-hidden"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <Command className="w-4 h-4" style={{ color: 'var(--color-ink-tertiary)' }} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search pages and actions..."
            className="flex-1 bg-transparent border-0 p-0 text-sm"
            style={{ color: 'var(--color-ink)' }}
            aria-label="Search commands"
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded border" style={{ borderColor: 'var(--color-border)', color: 'var(--color-ink-tertiary)' }}>
            ESC
          </kbd>
        </div>
        <div ref={listRef} className="p-2 max-h-80 overflow-y-auto" role="listbox">
          {filtered.length === 0 && (
            <p className="text-sm px-3 py-6 text-center" style={{ color: 'var(--color-ink-tertiary)' }}>
              No results for "{query}"
            </p>
          )}
          {Object.entries(grouped).map(([section, items]) => (
            <div key={section}>
              <div className="px-3 py-1.5 text-micro" style={{ color: 'var(--color-ink-faint)' }}>
                {section}
              </div>
              {items.map((item) => {
                flatIndex++;
                const ItemIcon = item.icon;
                const isSelected = flatIndex === selectedIndex;
                return (
                  <Link
                    key={item.label}
                    to={item.path || '#'}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      if (item.action === 'theme') toggleTheme();
                      else if (item.path) navigate(item.path);
                      onClose();
                    }}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors"
                    style={{
                      backgroundColor: isSelected ? 'var(--color-primary-subtle)' : 'transparent',
                      color: isSelected ? 'var(--color-primary)' : 'var(--color-ink)',
                    }}
                  >
                    <ItemIcon className="w-4 h-4" style={{ color: isSelected ? 'var(--color-primary)' : 'var(--color-ink-tertiary)' }} />
                    <span className="flex-1">{item.label}</span>
                    {item.path && (
                      <kbd className="text-[10px] px-1.5 py-0.5 rounded border" style={{ borderColor: 'var(--color-border)', color: 'var(--color-ink-faint)' }}>
                        ↵
                      </kbd>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Sidebar Brand ────────────────────────────────────────────────────────────
function BrandMark() {
  return (
    <div className="flex items-center px-2 mb-6">
      <BrandLockup iconSize={32} tagline={false} />
    </div>
  );
}

// ── Navigation ───────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, section: 'Overview' },
  { path: '/profiles', label: 'Browse Profiles', icon: Users, section: 'Overview' },
  { path: '/settings', label: 'Settings', icon: Settings, section: 'Overview' },
  { path: '/messages', label: 'Messages', icon: MessageCircle, section: 'Connect' },
  { path: '/blog', label: 'Guidance', icon: BookOpen, section: 'Learn' },
  { path: '/community', label: 'Community', icon: Users, section: 'Learn' },
  { path: '/drafts', label: 'Introductions', icon: HandHeart, section: 'Connect' },
  { path: '/support', label: 'Support', icon: LifeBuoy, section: 'Help' },
];

// Elevated controls render for admins/moderators only — never for members.
const ADMIN_NAV_ITEMS = [
  { path: '/admin/dashboard', label: 'Admin Panel', icon: Shield, section: 'Admin' },
  { path: '/admin/queue', label: 'Moderation Queue', icon: ShieldAlert, section: 'Admin' },
  { path: '/admin/verify-accounts', label: 'Verify Accounts', icon: UserCheck, section: 'Admin' },
  { path: '/admin/members', label: 'Members', icon: Users, section: 'Admin' },
  { path: '/admin/support', label: 'Support Queue', icon: LifeBuoy, section: 'Admin' },
  { path: '/admin/verifications', label: 'Verifications', icon: BadgeCheck, section: 'Admin' },
  { path: '/admin/guardians', label: 'Guardians', icon: Users, section: 'Admin' },
  { path: '/admin/roles', label: 'Roles', icon: KeyRound, section: 'Admin' },
  { path: '/admin/audit', label: 'Audit Trail', icon: History, section: 'Admin' },
  { path: '/admin/content', label: 'Content', icon: BookOpen, section: 'Admin' },
  { path: '/admin/analytics', label: 'Analytics', icon: BarChart3, section: 'Admin' },
];

function Nav({ isLoggedIn, isAdmin, isActive, onNavigate, inAdmin }) {
  if (!isLoggedIn) return null;

  // Inside the admin console an admin sees the admin tree, not the member one.
  // Showing "Messages / Introductions / Browse Profiles" alongside moderation
  // controls made the console feel like a member site with an extra panel, and
  // gave an operator one stray click to leave the queue mid-review. One escape
  // hatch back to the member side is deliberate; a second nav is not.
  const items = !isAdmin
    ? NAV_ITEMS
    : inAdmin
      ? [...ADMIN_NAV_ITEMS, { path: '/dashboard', label: 'Member dashboard', icon: LayoutDashboard, section: 'Admin', divider: true }]
      : [...NAV_ITEMS, ...ADMIN_NAV_ITEMS];

  // Group by section
  const sections = {};
  items.forEach(item => {
    if (!sections[item.section]) sections[item.section] = [];
    sections[item.section].push(item);
  });

  return (
    <nav className="sidebar-nav">
      {Object.entries(sections).map(([section, sectionItems]) => (
        <div key={section}>
          <div className="sidebar-section">{section}</div>
          {sectionItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              onClick={onNavigate}
              className={isActive(item.path) ? 'active' : ''}
              aria-current={isActive(item.path) ? 'page' : undefined}
            >
              <item.icon />
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}

// ── Main Layout ──────────────────────────────────────────────────────────────
export default function MainLayout({ children }) {
  const { isLoggedIn, isAdmin, user, logout } = useAuth();
  const location = useLocation();
  // /admin/login and /admin are public entry points, not the console itself.
  // Everything else under /admin swaps the sidebar to the admin tree.
  const inAdmin = location.pathname.startsWith('/admin')
    && location.pathname !== '/admin'
    && location.pathname !== '/admin/login';
  // Single source of truth: lib/theme.js (versioned key, shared with
  // LandingLayout and the Settings Appearance tab). No per-layout overrides —
  // a stored "dark" must actually render dark.
  const [dark, setDark] = useState(() => readIsDark());
  const [cmdOpen, setCmdOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    writeIsDark(dark);
    applyIsDark(dark);
  }, [dark]);

  const isActive = useCallback(
    (path) => location.pathname === path || location.pathname.startsWith(path + '/'),
    [location.pathname]
  );

  // Global ⌘K / Ctrl+K listener
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdOpen(open => !open);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="app-shell">
      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {mobileNavOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-40 lg:hidden"
              style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
              onClick={() => setMobileNavOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-y-0 left-0 z-50 w-[280px] p-4 lg:hidden flex flex-col"
              style={{
                backgroundColor: 'var(--color-surface)',
                borderRight: '1px solid var(--color-border)',
                boxShadow: 'var(--shadow-lg)',
              }}
            >
              <div className="flex items-center justify-between pr-1">
                <BrandMark />
                <button className="mobile-menu-btn" onClick={() => setMobileNavOpen(false)} aria-label="Close menu">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <Nav isLoggedIn={isLoggedIn} isAdmin={isAdmin} isActive={isActive} onNavigate={() => setMobileNavOpen(false)} inAdmin={inAdmin} />
              <div className="sidebar-footer">
                <button onClick={() => { setCmdOpen(true); setMobileNavOpen(false); }} className="sidebar-nav-btn">
                  <Search className="w-4 h-4" /> Search
                  <kbd className="sidebar-kbd">⌘K</kbd>
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Desktop sidebar */}
      <aside className="app-sidebar">
        <BrandMark />
        <Nav isLoggedIn={isLoggedIn} isAdmin={isAdmin} isActive={isActive} inAdmin={inAdmin} />
        <div className="sidebar-footer">
          <div className="flex items-center gap-1.5">
            <button onClick={() => setCmdOpen(true)} className="sidebar-nav-btn flex-1 min-w-0">
              <Search className="w-4 h-4 flex-shrink-0" /> Search
              <kbd className="sidebar-kbd">⌘K</kbd>
            </button>
            <ThemeMenu dark={dark} setDark={setDark} />
          </div>
          {isLoggedIn && user && (
            <div className="flex items-center gap-2.5 px-2 pt-2 mt-1 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{ background: 'var(--color-primary-subtle)', color: 'var(--color-primary)' }}
              >
                {(user.displayName || user.email || 'U')[0].toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold truncate flex items-center gap-1.5" style={{ color: 'var(--color-ink)' }}>
                  {user.displayName || user.email}
                  {isAdmin && (
                    <span
                      className="flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: 'var(--color-accent-subtle)', color: 'var(--color-accent)', letterSpacing: '0.04em' }}
                    >
                      ADMIN
                    </span>
                  )}
                </p>
                <p className="text-[10px] truncate" style={{ color: 'var(--color-ink-tertiary)' }}>{user.email}</p>
              </div>
              <button
                onClick={logout}
                aria-label="Log out"
                className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
                style={{ color: 'var(--color-ink-tertiary)' }}
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="mobile-topbar">
        <button className="mobile-menu-btn" onClick={() => setMobileNavOpen(true)} aria-label="Open menu">
          <Menu className="w-5 h-5" />
        </button>
        <BrandMark />
        <button onClick={() => setCmdOpen(true)} className="ml-auto mobile-menu-btn" aria-label="Search">
          <Search className="w-5 h-5" />
        </button>
      </div>

      {/* Main content */}
      <div className="app-content">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
            className="min-h-screen"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>

      <AnimatePresence>
        <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} toggleTheme={() => setDark(d => !d)} isAdmin={isAdmin} />
      </AnimatePresence>

      {/* AI Assistant FAB + drawer — member pages get it too, not just landing */}
      <Suspense fallback={null}>
        <AIAssistant />
      </Suspense>
    </div>
  );
}
