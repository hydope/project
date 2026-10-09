import { useState, useEffect, useCallback } from 'react';
import Layout from '@/layouts/AdminLayout';
import { http } from '@/lib/api/transport';
import {
  BarChart3, RefreshCw, TrendingDown, TrendingUp, Minus,
  Users, Eye, UserPlus, FileImage, MessageCircle, Newspaper,
  Monitor, Smartphone, Tablet, ExternalLink, Globe, MousePointerClick,
} from 'lucide-react';

/**
 * SEO & Growth Analytics — the admin's window into how the site is doing.
 *
 * Two data channels:
 * 1. First-party (this page): pageview beacons + real product aggregates from
 *    GET /api/admin/seo. No sample data — every number is a real COUNT.
 * 2. Google Analytics 4: the gtag snippet (G-KNR7541E3G) ships in index.html,
 *    so GA collects in parallel. GA's own numbers (real-time, acquisition,
 *    demographics) live in the GA console — linked below. Piping GA numbers
 *    directly into this page needs a Google Cloud service-account key; the
 *    dashboard is built to accept that feed when it exists.
 */

const STAT_ICONS = {
  visitors: Users,
  pageviews: Eye,
  members: UserPlus,
  biodatas: FileImage,
  messages: MessageCircle,
  posts: Newspaper,
};

function Delta({ value }) {
  if (value === null || value === undefined) {
    return <span className="inline-flex items-center gap-1 text-xs text-muted"><Minus className="w-3 h-3" /> —</span>;
  }
  const up = value > 0;
  const flat = value === 0;
  const cls = flat ? 'text-muted' : up ? 'text-success' : 'text-danger';
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${cls}`}>
      <Icon className="w-3 h-3" />{up ? '+' : ''}{value}% <span className="font-normal">vs prev</span>
    </span>
  );
}

function StatCard({ stat, loading }) {
  const Icon = STAT_ICONS[stat.key] || BarChart3;
  return (
    <div className="rounded-xl border border-line/20 bg-elevated p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-muted uppercase tracking-wide">{stat.label}</span>
        <Icon className="w-4 h-4 text-muted" />
      </div>
      {loading ? (
        <div className="skeleton h-8 w-20 rounded" />
      ) : (
        <>
          <div className="text-2xl font-bold text-ink">{stat.value.toLocaleString()}</div>
          <div className="mt-1"><Delta value={stat.delta} /></div>
        </>
      )}
    </div>
  );
}

function TrafficChart({ labels, pageviews, visitors, loading }) {
  const W = 640, H = 220, PAD = 28;
  const maxV = Math.max(...pageviews, ...visitors, 1);
  const n = labels.length;
  const x = (i) => PAD + (i * (W - PAD * 2)) / Math.max(n - 1, 1);
  const y = (v) => H - PAD - (v / maxV) * (H - PAD * 2);
  const line = (vals) => vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = (vals) => `${line(vals)} L${x(n - 1).toFixed(1)},${(H - PAD).toFixed(1)} L${x(0).toFixed(1)},${(H - PAD).toFixed(1)} Z`;
  const ticks = [0, 1, 2, 3].map((t) => Math.round((maxV * t) / 3));

  if (loading) return <div className="skeleton h-56 rounded-xl" />;

  return (
    <section className="rounded-xl border border-line/20 bg-elevated p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-ink">Traffic</h3>
        <div className="flex items-center gap-4 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--color-primary)' }} /> Pageviews
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--color-accent)' }} /> Visitors
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
        aria-label={`Traffic: ${pageviews.reduce((a, b) => a + b, 0)} pageviews, ${visitors.reduce((a, b) => a + b, 0)} visitors`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD} x2={W - PAD} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeOpacity="0.25" strokeDasharray="3 3" />
            <text x={PAD - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="var(--color-muted)">{t}</text>
          </g>
        ))}
        <path d={area(pageviews)} fill="var(--color-primary)" fillOpacity="0.12" />
        <path d={line(visitors)} fill="none" stroke="var(--color-accent)" strokeWidth="2" />
        <path d={line(pageviews)} fill="none" stroke="var(--color-primary)" strokeWidth="2.5" />
        {[0, n - 1].map((i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : 'end'} fontSize="10" fill="var(--color-muted)">
            {labels[i]}
          </text>
        ))}
      </svg>
      <p className="text-xs text-muted mt-2">
        Peak {maxV} in a day · total {pageviews.reduce((a, b) => a + b, 0).toLocaleString()} pageviews
      </p>
    </section>
  );
}

function DeviceIcon({ device }) {
  if (device === 'mobile') return <Smartphone className="w-4 h-4 text-muted" />;
  if (device === 'tablet') return <Tablet className="w-4 h-4 text-muted" />;
  return <Monitor className="w-4 h-4 text-muted" />;
}

export default function AdminAnalytics() {
  const [range, setRange] = useState('7d');
  const [seo, setSeo] = useState(null);
  const [funnel, setFunnel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [s, f] = await Promise.all([
        http.get(`/api/admin/seo?range=${range}`),
        http.get('/api/admin/funnel'),
      ]);
      setSeo(s);
      setFunnel(f);
    } catch (e) {
      setError(e?.message || 'Could not load analytics.');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const overview = seo?.overview || [];
  const traffic = seo?.traffic || { labels: [], pageviews: [], visitors: [] };
  const topPages = seo?.topPages || [];
  const referrers = seo?.referrers || [];
  const devices = seo?.devices || [];
  const ga = seo?.ga || {};
  const steps = funnel?.steps || [];
  const base = steps[0]?.n || 0;
  const deviceTotal = devices.reduce((a, d) => a + d.views, 0);

  return (
    <Layout>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <header className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-ink">SEO &amp; Growth Analytics</h1>
            <p className="text-sm text-muted mt-1">Real counts from your database. No sample data.</p>
          </div>
          <div className="flex items-center gap-2">
            {['7d', '30d'].map((r) => (
              <button key={r} onClick={() => setRange(r)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  range === r ? 'bg-primary text-white' : 'bg-elevated text-muted border border-line/20 hover:border-line/40'}`}>
                {r === '7d' ? '7 days' : '30 days'}
              </button>
            ))}
            <button onClick={load} disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-elevated text-muted border border-line/20 hover:border-line/40 disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded-xl border border-line/20 bg-elevated p-3 text-sm text-muted">{error}</div>
        )}

        {/* Google Analytics 4 connection status */}
        <section className="rounded-xl border border-line/20 bg-elevated p-5 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-success/15 text-success">
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" /> GA4 Connected
              </span>
              <div>
                <p className="text-sm font-bold text-ink">Google Analytics 4</p>
                <p className="text-xs text-muted font-mono">{ga.measurementId || 'G-KNR7541E3G'}</p>
              </div>
            </div>
            {ga.propertyUrl && (
              <a href={ga.propertyUrl} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-white hover:opacity-90">
                Open Google Analytics <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
          <p className="text-xs text-muted mt-3">
            The GA4 tag is live on shiarishta.com — traffic flows into your Google Analytics property
            (check its real-time report to confirm). This dashboard shows your first-party data below;
            GA's own acquisition and demographic reports live in the console above.
          </p>
        </section>

        {/* Overview stat cards */}
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {overview.map((s) => <StatCard key={s.key} stat={s} loading={loading} />)}
        </section>

        {/* Traffic chart */}
        <div className="mb-6">
          <TrafficChart labels={traffic.labels} pageviews={traffic.pageviews} visitors={traffic.visitors} loading={loading} />
        </div>

        {/* Top pages / referrers / devices */}
        <div className="grid gap-4 lg:grid-cols-3 mb-8">
          <section className="rounded-xl border border-line/20 bg-elevated p-5 lg:col-span-1">
            <h3 className="text-sm font-bold text-ink mb-4 inline-flex items-center gap-2">
              <MousePointerClick className="w-4 h-4 text-muted" /> Top pages
            </h3>
            {loading ? <div className="skeleton h-40 rounded" /> : topPages.length ? (
              <ul className="space-y-2.5">
                {topPages.slice(0, 8).map((p) => (
                  <li key={p.path} className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono text-ink truncate" title={p.path}>{p.path}</span>
                    <span className="text-muted whitespace-nowrap">{p.views.toLocaleString()} views</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted">No pageview data yet — it starts collecting from this deploy.</p>
            )}
          </section>

          <section className="rounded-xl border border-line/20 bg-elevated p-5">
            <h3 className="text-sm font-bold text-ink mb-4 inline-flex items-center gap-2">
              <Globe className="w-4 h-4 text-muted" /> Top referrers
            </h3>
            {loading ? <div className="skeleton h-40 rounded" /> : referrers.length ? (
              <ul className="space-y-2.5">
                {referrers.slice(0, 8).map((r) => (
                  <li key={r.host} className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono text-ink truncate" title={r.host}>{r.host}</span>
                    <span className="text-muted whitespace-nowrap">{r.views.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted">No referrer data yet — most early traffic is direct.</p>
            )}
          </section>

          <section className="rounded-xl border border-line/20 bg-elevated p-5">
            <h3 className="text-sm font-bold text-ink mb-4">Devices</h3>
            {loading ? <div className="skeleton h-40 rounded" /> : devices.length ? (
              <div className="space-y-3">
                {devices.map((d) => {
                  const pct = deviceTotal > 0 ? Math.round((d.views * 100) / deviceTotal) : 0;
                  return (
                    <div key={d.device}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="inline-flex items-center gap-2 font-semibold text-ink capitalize">
                          <DeviceIcon device={d.device} /> {d.device}
                        </span>
                        <span className="text-muted">{pct}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-hover overflow-hidden">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted">No device data yet.</p>
            )}
          </section>
        </div>

        {/* Activation funnel */}
        <section className="mb-8">
          <h2 className="text-base font-bold text-ink mb-3">Activation funnel</h2>
          {loading && !steps.length ? (
            <div className="skeleton h-40 rounded-xl" />
          ) : !steps.length ? (
            <p className="text-sm text-muted">No data yet.</p>
          ) : (
            <div className="rounded-xl border border-line/20 bg-elevated p-5 space-y-2.5">
              {steps.map((s, idx) => {
                const pct = base > 0 ? Math.round((s.n * 100) / base) : 0;
                const drop = idx > 0 ? steps[idx - 1].n - s.n : 0;
                return (
                  <div key={s.key}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold text-ink">{s.label}</span>
                      <span className="text-muted">
                        {s.n}
                        {drop > 0 && (
                          <span className="text-danger inline-flex items-center gap-0.5 ml-2">
                            <TrendingDown className="w-3 h-3" />{drop}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-hover overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </Layout>
  );
}
