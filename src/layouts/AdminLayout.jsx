import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth/AuthContext';
import {
  LayoutDashboard, ShieldAlert, UserCheck, Users, LifeBuoy, BadgeCheck,
  KeyRound, History, BookOpen, BarChart3, LogOut, HeartHandshake, Home,
} from 'lucide-react';

const ADMIN_LINKS = [
  { path: '/admin/dashboard', label: 'Overview', icon: LayoutDashboard },
  { path: '/admin/queue', label: 'Moderation Queue', icon: ShieldAlert },
  { path: '/admin/verify-accounts', label: 'Verify Accounts', icon: UserCheck },
  { path: '/admin/members', label: 'Members', icon: Users },
  { path: '/admin/matchmaker', label: 'Matchmaker Queue', icon: HeartHandshake },
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
// were operating on. This is a dark, compact console with ADMIN branding.
export default function AdminLayout({ children }) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const doLogout = async () => {
    await logout();
    navigate('/admin/login', { replace: true });
  };

  return (
    <div className="min-h-screen flex" style={{ background: '#0d1117', color: '#e6edf3' }}>
      <aside className="w-60 flex-shrink-0 hidden md:flex flex-col" style={{ background: '#010409', borderRight: '1px solid #21262d' }}>
        <div className="px-5 py-5" style={{ borderBottom: '1px solid #21262d' }}>
          <p className="text-[10px] font-bold tracking-[0.2em]" style={{ color: '#f85149' }}>ADMIN CONSOLE</p>
          <p className="text-lg font-bold mt-1" style={{ color: '#f0f6fc' }}>Shia Rishta</p>
        </div>
        <nav className="flex-1 overflow-y-auto py-3">
          {ADMIN_LINKS.map(l => {
            const active = pathname === l.path || pathname.startsWith(l.path + '/');
            const Icon = l.icon;
            return (
              <Link key={l.path} to={l.path}
                className="flex items-center gap-3 px-5 py-2.5 text-sm transition-colors"
                style={{
                  color: active ? '#f0f6fc' : '#8b949e',
                  background: active ? 'rgba(56,139,253,0.12)' : 'transparent',
                  borderLeft: active ? '2px solid #388bfd' : '2px solid transparent',
                }}>
                <Icon className="w-4 h-4 flex-shrink-0" />
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4" style={{ borderTop: '1px solid #21262d' }}>
          <Link to="/dashboard" className="flex items-center gap-2 text-xs mb-3" style={{ color: '#8b949e' }}>
            <Home className="w-3.5 h-3.5" /> Member site
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: 'rgba(248,81,73,0.15)', color: '#f85149' }}>
              {(user?.displayName || user?.email || 'A')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate" style={{ color: '#f0f6fc' }}>{user?.displayName || user?.email}</p>
              <p className="text-[10px]" style={{ color: '#8b949e' }}>Administrator</p>
            </div>
            <button onClick={doLogout} aria-label="Log out" style={{ color: '#8b949e' }}>
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="md:hidden flex items-center justify-between px-4 py-3" style={{ background: '#010409', borderBottom: '1px solid #21262d' }}>
          <p className="text-xs font-bold tracking-[0.2em]" style={{ color: '#f85149' }}>ADMIN CONSOLE</p>
          <Link to="/dashboard" className="text-xs" style={{ color: '#8b949e' }}>Member site</Link>
        </header>
        <nav className="md:hidden flex gap-1 overflow-x-auto px-3 py-2" style={{ background: '#0d1117', borderBottom: '1px solid #21262d' }}>
          {ADMIN_LINKS.map(l => {
            const active = pathname === l.path;
            const Icon = l.icon;
            return (
              <Link key={l.path} to={l.path} aria-label={l.label}
                className="p-2 rounded-lg flex-shrink-0"
                style={{ background: active ? 'rgba(56,139,253,0.15)' : 'transparent', color: active ? '#f0f6fc' : '#8b949e' }}>
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
