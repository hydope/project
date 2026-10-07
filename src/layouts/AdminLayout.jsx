import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth/AuthContext';
import {
  LayoutDashboard, ShieldAlert, UserCheck, Users, LifeBuoy, BadgeCheck,
  KeyRound, History, BookOpen, BarChart3, LogOut, HeartHandshake, Home,
  Sun, Moon, FileText,
} from 'lucide-react';

const ADMIN_LINKS = [
  { path: '/admin/dashboard', label: 'Overview', icon: LayoutDashboard },
  { path: '/admin/queue', label: 'Moderation Queue', icon: ShieldAlert },
  { path: '/admin/verify-accounts', label: 'Verify Accounts', icon: UserCheck },
  { path: '/admin/members', label: 'Members', icon: Users },
  { path: '/admin/matchmaker', label: 'Matchmaker Queue', icon: HeartHandshake },
  { path: '/admin/biodata', label: 'Biodata Maker', icon: FileText },
  { path: '/admin/verifications', label: 'ID Verifications', icon: BadgeCheck },
  { path: '/admin/guardians', label: 'Guardians', icon: Users },
  { path: '/admin/roles', label: 'Roles', icon: KeyRound },
  { path: '/admin/support', label: 'Support', icon: LifeBuoy },
  { path: '/admin/content', label: 'Blog & Content', icon: BookOpen },
  { path: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { path: '/admin/audit', label: 'Audit Trail', icon: History },
];

// The admin console is deliberately NOT the member layout. Admins were getting
// the same sidebar/chrome as members, which made it unclear which side they
// were operating on. Dark is the default, but a light mode toggle is available
// in the sidebar footer.
const ADMIN_THEME_KEY = 'shiarishta-admin-theme';
export default function AdminLayout({ children }) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [light, setLight] = useState(() => {
    try { return localStorage.getItem(ADMIN_THEME_KEY) === 'light'; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem(ADMIN_THEME_KEY, light ? 'light' : 'dark'); } catch {}
  }, [light]);

  const doLogout = async () => {
    await logout();
    navigate('/admin/login', { replace: true });
  };

  // Theme tokens — dark (default) or light. These are set as CSS variables
  // on the container so admin pages using text-ink, bg-primary, etc.
  // render correctly in both modes (previously light-theme variables on a
  // dark background made everything look like unstyled text).
  const t = light ? {
    bg: '#f6f8fa', fg: '#1f2328', sidebar: '#ffffff', border: '#d0d7de',
    muted: '#59636e', accent: '#0969da', danger: '#cf222e',
    surface: '#ffffff', elevated: '#ffffff', hover: '#eaeef2',
  } : {
    bg: '#0d1117', fg: '#e6edf3', sidebar: '#010409', border: '#21262d',
    muted: '#8b949e', accent: '#388bfd', danger: '#f85149',
    surface: '#161b22', elevated: '#161b22', hover: '#1c2128',
  };

  const cssVars = {
    background: t.bg,
    color: t.fg,
    '--color-ink': t.fg,
    '--color-ink-secondary': t.muted,
    '--color-ink-tertiary': t.muted,
    '--color-muted': t.muted,
    '--color-border': t.border,
    '--color-line': t.border,
    '--color-surface': t.surface,
    '--color-elevated': t.elevated,
    '--color-hover': t.hover,
    '--color-primary': t.accent,
    '--color-primary-subtle': light ? 'rgba(9,105,218,0.1)' : 'rgba(56,139,253,0.12)',
    '--color-danger': t.danger,
    '--color-success': light ? '#1a7f37' : '#3fb950',
    '--color-warning': light ? '#9a6700' : '#d29922',
    '--bg': t.bg,
    '--border': t.border,
  };

  return (
    <div className="min-h-screen flex" style={cssVars}>
      <aside className="w-60 flex-shrink-0 hidden md:flex flex-col" style={{ background: t.sidebar, borderRight: `1px solid ${t.border}` }}>
        <div className="px-5 py-5" style={{ borderBottom: `1px solid ${t.border}` }}>
          <p className="text-[10px] font-bold tracking-[0.2em]" style={{ color: t.danger }}>ADMIN CONSOLE</p>
          <p className="text-lg font-bold mt-1" style={{ color: t.fg }}>Shia Rishta</p>
        </div>
        <nav className="flex-1 overflow-y-auto py-3">
          {ADMIN_LINKS.map(l => {
            const active = pathname === l.path || pathname.startsWith(l.path + '/');
            const Icon = l.icon;
            return (
              <Link key={l.path} to={l.path}
                className="flex items-center gap-3 px-5 py-2.5 text-sm transition-colors"
                style={{
                  color: active ? t.fg : t.muted,
                  background: active ? (light ? 'rgba(9,105,218,0.08)' : 'rgba(56,139,253,0.12)') : 'transparent',
                  borderLeft: active ? `2px solid ${t.accent}` : '2px solid transparent',
                }}>
                <Icon className="w-4 h-4 flex-shrink-0" />
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4" style={{ borderTop: `1px solid ${t.border}` }}>
          <Link to="/dashboard" className="flex items-center gap-2 text-xs mb-3" style={{ color: t.muted }}>
            <Home className="w-3.5 h-3.5" /> Member site
          </Link>
          <button
            onClick={() => setLight(v => !v)}
            className="flex items-center gap-2 text-xs mb-3 w-full"
            style={{ color: t.muted }}
            aria-label={light ? 'Switch to dark mode' : 'Switch to light mode'}
          >
            {light ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
            {light ? 'Dark mode' : 'Light mode'}
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: light ? 'rgba(207,34,46,0.1)' : 'rgba(248,81,73,0.15)', color: t.danger }}>
              {(user?.displayName || user?.email || 'A')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate" style={{ color: t.fg }}>{user?.displayName || user?.email}</p>
              <p className="text-[10px]" style={{ color: t.muted }}>Administrator</p>
            </div>
            <button onClick={doLogout} aria-label="Log out" style={{ color: t.muted }}>
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="md:hidden flex items-center justify-between px-4 py-3" style={{ background: t.sidebar, borderBottom: `1px solid ${t.border}` }}>
          <p className="text-xs font-bold tracking-[0.2em]" style={{ color: t.danger }}>ADMIN CONSOLE</p>
          <div className="flex items-center gap-3">
            <button onClick={() => setLight(v => !v)} aria-label={light ? 'Switch to dark mode' : 'Switch to light mode'}
              style={{ color: t.muted }}>
              {light ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>
            <Link to="/dashboard" className="text-xs" style={{ color: t.muted }}>Member site</Link>
          </div>
        </header>
        <nav className="md:hidden flex gap-1 overflow-x-auto px-3 py-2" style={{ background: t.bg, borderBottom: `1px solid ${t.border}` }}>
          {ADMIN_LINKS.map(l => {
            const active = pathname === l.path;
            const Icon = l.icon;
            return (
              <Link key={l.path} to={l.path} aria-label={l.label}
                className="p-2 rounded-lg flex-shrink-0"
                style={{ background: active ? (light ? 'rgba(9,105,218,0.1)' : 'rgba(56,139,253,0.15)') : 'transparent', color: active ? t.fg : t.muted }}>
                <Icon className="w-4 h-4" />
              </Link>
            );
          })}
        </nav>
        <main className="flex-1 p-4 sm:p-6 max-w-6xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
