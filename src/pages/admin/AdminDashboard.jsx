import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Users, UserPlus, MessageCircle, Heart, ShieldCheck, Activity,
  RefreshCw, AlertTriangle
} from 'lucide-react';
import Layout from '@/layouts/AdminLayout';
import { http } from '@/lib/api/transport';

// Every number below comes from /api/admin/overview and /api/admin/analytics.
//
// This dashboard previously rendered MOCK_STATS / MOCK_ACTIVITY / MOCK_DAILY:
// a hardcoded "1,247 total members" and "156 messages today" on a site with 61
// rows and no messages. The endpoints behind this screen already existed and
// already returned correct COUNT(*) aggregates — they were simply never called.
// Fabricated operational numbers are the same failure mode as fabricated member
// profiles: an operator acting on them is acting on fiction.

const STAT_CONFIG = [
  { key: 'totalMembers', label: 'Total Members', icon: Users, color: 'primary' },
  { key: 'activeProfiles', label: 'Active Profiles', icon: Activity, color: 'success' },
  { key: 'messagesToday', label: 'Messages (24h)', icon: MessageCircle, color: 'info' },
  { key: 'livePosts', label: 'Live Posts', icon: Heart, color: 'accent' },
  { key: 'repliesThisWeek', label: 'Replies (7d)', icon: UserPlus, color: 'danger' },
  { key: 'openReports', label: 'Open Reports', icon: ShieldCheck, color: 'warning' },
];

const ACTIVITY_META = {
  member_joined: { color: 'success', icon: '+' },
  message_sent: { color: 'primary', icon: '💬' },
  verification_completed: { color: 'info', icon: '✓' },
  match_made: { color: 'danger', icon: '💞' },
  guardian_invite: { color: 'accent', icon: '🛡' },
  profile_flagged: { color: 'warning', icon: '⚠' }
};

const colorMap = {
  primary: { bg: 'bg-primary/10', text: 'text-primary', fill: 'var(--primary)' },
  success: { bg: 'bg-success/10', text: 'text-success', fill: 'var(--success)' },
  accent: { bg: 'bg-accent/10', text: 'text-accent', fill: 'var(--accent)' },
  info: { bg: 'bg-info/10', text: 'text-info', fill: 'var(--info)' },
  danger: { bg: 'bg-danger/10', text: 'text-danger', fill: 'var(--danger)' },
  warning: { bg: 'bg-warning/10', text: 'text-warning', fill: 'var(--warning)' }
};

function Sparkline({ dataKey, data, color = 'primary', height = 80 }) {
  const values = data.map(d => Number(d[dataKey]) || 0);
  const c = colorMap[color] || colorMap.primary;

  // A window with no rows used to build `points = ''`, which produced the path
  // "M0,120 L L300,120 Z" and threw an SVG error on every empty dashboard. A
  // single point also divided by (length - 1) = 0 and produced NaN coordinates.
  if (values.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg bg-hover/40 text-xs text-muted"
        style={{ height }}
      >
        No activity in this window
      </div>
    );
  }

  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const w = 300;
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  const points = values
    .map((v, i) => {
      const x = values.length > 1 ? i * step : w / 2;
      const y = height - ((v - min) / range) * (height - 10) - 5;
      return `${x},${y}`;
    })
    .join(' ');
  const linePath = points
    .split(' ')
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p}`)
    .join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }} preserveAspectRatio="none" aria-hidden="true">
      <path d={`M0,${height} ${points.split(' ').map(p => `L${p}`).join(' ')} L${w},${height} Z`} fill={c.fill} opacity="0.12" />
      <path d={linePath} fill="none" stroke={c.fill} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatCard({ stat, value, index, pending }) {
  const c = colorMap[stat.color] || colorMap.primary;
  const [display, setDisplay] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        const start = performance.now();
        const animate = (now) => {
          const p = Math.min((now - start) / 800, 1);
          setDisplay(Math.floor((1 - Math.pow(1 - p, 3)) * value));
          if (p < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
        observer.disconnect();
      }
    }, { threshold: 0.3 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [value]);
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.4 }}
      className="bg-elevated rounded-2xl border border-line/20 p-5 hover:border-line/40 hover:-translate-y-0.5 transition-all duration-200 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.bg}`}>
          <stat.icon className={`w-5 h-5 ${c.text}`} />
        </span>
        {/* The old badge printed a hardcoded +12.5% / -2.1% that was not derived
            from anything. A trend needs two real samples, which the API does not
            yet return — so the badge is omitted rather than invented. */}
      </div>
      <p className="text-2xl font-bold text-ink">
        {pending ? <span className="text-muted/40">—</span> : display.toLocaleString()}
      </p>
      <p className="text-xs text-muted mt-0.5">{stat.label}</p>
    </motion.div>
  );
}

// __CHUNK2__

// Data-health banner.
//
// 48 of 61 profiles were E2E test shells and no screen reported it. This is the
// early-warning signal: real counts from /api/admin/health, shown to whoever is
// operating the site. It never rounds up and never invents a reassuring number —
// if the data is contaminated, the banner says so.
//
// role="status" (not alert) so it is announced politely on load instead of
// interrupting, and because the page's own state is informational.
function HealthBanner({ health }) {
  if (!health) return null;
  const warn = health.level === 'warn';
  const tone = warn
    ? 'border-warning/40 bg-warning/10 text-ink'
    : health.level === 'info'
      ? 'border-line/30 bg-elevated text-ink'
      : 'border-success/40 bg-success/10 text-ink';
  const Icon = warn ? AlertTriangle : ShieldCheck;

  return (
    <div role="status" aria-live="polite"
      className={`mb-6 rounded-2xl border p-4 sm:p-5 ${tone}`}>
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${warn ? 'text-warning' : 'text-success'}`} aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="text-sm font-bold">
            {warn ? 'Data health needs attention' : 'Data health'}
          </h2>
          <ul className="mt-1.5 space-y-1 text-sm text-muted">
            {health.messages.map((m) => <li key={m}>{m}</li>)}
          </ul>
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
            <div className="flex gap-1.5">
              <dt>Real profiles</dt>
              <dd className="font-bold text-ink">{health.realProfiles}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt>Shells hidden</dt>
              <dd className="font-bold text-ink">{health.testShellsHidden}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt>Incomplete</dt>
              <dd className="font-bold text-ink">{health.incompleteProfiles}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt>Verified</dt>
              <dd className="font-bold text-ink">{health.verified}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [timeRange, setTimeRange] = useState('30d');
  const [chartMetric, setChartMetric] = useState('members');
  const [stats, setStats] = useState(null);
  const [daily, setDaily] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [pending, setPending] = useState(true);
  const [health, setHealth] = useState(null);

  // Live aggregates. /overview gives the six KPIs, /analytics gives the real
  // day series. Both are already admin-guarded server-side.
  const load = useCallback(async () => {
    setPending(true);
    setLoadError(null);
    try {
      const range = timeRange === '90d' ? '30d' : timeRange; // API supports 7d | 30d
      const [overview, analytics, healthRes] = await Promise.all([
        http.get('/api/admin/overview'),
        http.get(`/api/admin/analytics?range=${range}`),
        // Health is advisory: a failure here must not blank the whole dashboard,
        // so it resolves separately rather than joining the Promise.all above.
        http.get('/api/admin/health').catch(() => null),
      ]);
      setHealth(healthRes);
      setStats(overview);
      const members = analytics?.charts?.find((c) => c.key === 'memberGrowth');
      const messages = analytics?.charts?.find((c) => c.key === 'messageVolume');
      setDaily(
        (members?.labels || []).map((label, i) => ({
          date: label,
          members: members?.values?.[i] ?? 0,
          messages: messages?.values?.[i] ?? 0,
        })),
      );
    } catch (e) {
      // An empty dashboard is better than a fabricated one, but it must be
      // labelled rather than silently blank.
      setLoadError(e?.message || 'Could not load dashboard data.');
      setStats(null);
      setDaily([]);
    } finally {
      setPending(false);
    }
  }, [timeRange]);

  useEffect(() => { load(); }, [load]);

  const activity = []; // no activity feed endpoint exists; nothing is invented

  return (
    <Layout>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <HealthBanner health={health} />
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-ink">Admin Dashboard</h1>
            <p className="text-sm text-muted mt-1">Platform overview, member analytics, and community health.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} disabled={pending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-elevated text-muted border border-line/20 hover:border-line/40 disabled:opacity-50 transition-all">
              <RefreshCw className={`w-3.5 h-3.5 ${pending ? 'animate-spin' : ''}`} /> Refresh
            </button>
            {['7d', '30d', '90d'].map(r => (
              <button key={r} onClick={() => setTimeRange(r)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${timeRange === r ? 'bg-primary text-white' : 'bg-elevated text-muted border border-line/20 hover:border-line/40'}`}>
                {r === '7d' ? '7 days' : r === '30d' ? '30 days' : '90 days'}
              </button>
            ))}
          </div>
        </div>

        {/* Honest failure state. The dashboard used to render plausible numbers
            whether or not any request succeeded; a red banner is the correct
            response to a failed admin API call. */}
        {loadError && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-danger/30 bg-danger/5 p-4">
            <AlertTriangle className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-ink">Could not load live data</p>
              <p className="text-xs text-muted mt-0.5">{loadError}</p>
            </div>
          </div>
        )}

        {/* KPI Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          {STAT_CONFIG.map((stat, i) => (
            <StatCard key={stat.key} stat={stat} value={stats?.[stat.key] ?? 0} index={i} pending={pending || !stats} />
          ))}
        </div>

        {/* Main grid: Activity chart + Activity feed */}
        <div className="grid lg:grid-cols-[1fr_340px] gap-6">
          {/* Activity Chart */}
          <div className="bg-elevated rounded-2xl border border-line/20 shadow-sm p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <h2 className="text-base font-bold text-ink">Platform Activity</h2>
              <div className="flex items-center gap-1 bg-hover rounded-lg p-1">
                {[
                  { key: 'members', label: 'Members' },
                  { key: 'messages', label: 'Messages' },
                  { key: 'matches', label: 'Matches' }
                ].map(m => (
                  <button key={m.key} onClick={() => setChartMetric(m.key)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${chartMetric === m.key ? 'bg-elevated text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <Sparkline dataKey={chartMetric} data={daily} color={chartMetric === 'members' ? 'primary' : chartMetric === 'messages' ? 'info' : 'danger'} height={120} />
            <div className="flex items-center justify-between mt-3 text-[11px] text-muted">
              <span>{daily[0]?.date}</span>
              <span>{daily[daily.length - 1]?.date}</span>
            </div>

            {/* Secondary KPIs */}
            <div className="grid grid-cols-2 gap-4 mt-6 pt-5 border-t border-line/15">
              <div>
                <p className="text-xs text-muted mb-0.5">Avg. Profile Completeness</p>
                {/* /api/admin/overview does not compute this yet. Showing the old
                    hardcoded 78% would be a fabricated metric; omit until real. */}
                <p className="text-lg font-bold text-muted/50">Not tracked</p>
              </div>
              <div>
                <p className="text-xs text-muted mb-0.5">Response Rate</p>
                <p className="text-lg font-bold text-muted/50">Not tracked</p>
              </div>
            </div>
          </div>

          {/* Activity Feed */}
          <div className="bg-elevated rounded-2xl border border-line/20 shadow-sm p-6">
            <h2 className="text-base font-bold text-ink mb-4">Recent Activity</h2>
            <div className="space-y-3">
              {activity.length === 0 ? (
                <div className="flex items-start gap-3 p-3 rounded-xl bg-hover/40">
                  <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-muted leading-relaxed">
                    No activity feed exists yet. This panel previously showed six
                    invented events with fixed timestamps.
                  </p>
                </div>
              ) : activity.map(item => {
                const meta = ACTIVITY_META[item.type] || { color: 'primary', icon: '•' };
                const c = colorMap[meta.color] || colorMap.primary;
                const timeAgo = getTimeAgo(item.timestamp);
                return (
                  <motion.div key={item.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
                    className="flex items-start gap-3 p-3 rounded-xl hover:bg-hover/60 transition-colors">
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-sm ${c.bg}`}>
                      <span className={c.text}>{meta.icon}</span>
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-ink leading-relaxed">{item.description}</p>
                      <p className="text-[11px] text-faint mt-0.5">{timeAgo}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </main>
    </Layout>
  );
}

function getTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
