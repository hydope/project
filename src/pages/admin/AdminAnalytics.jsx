import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Layout from '@/layouts/AdminLayout';
import { http } from '@/lib/api/transport';
import {
  BarChart3, RefreshCw, TrendingDown, TrendingUp,
  Users, Eye, UserPlus, FileImage, MessageCircle,
  Monitor, Smartphone, Tablet, ExternalLink, Globe, MousePointerClick,
} from 'lucide-react';

/**
 * Analytics — how the site is really doing, in plain words. Member numbers
 * (GET /api/admin/analytics) count REAL people only: seeded profiles, test
 * and admin accounts are excluded everywhere. Traffic (GET /api/admin/seo)
 * is the first-party pageview log. Every number is a live database count.
 */

function HeadlineCard({ label, value, sub, Icon, loading }) {
  return (
    <div className="rounded-xl border border-line/20 bg-elevated p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-muted uppercase tracking-wide">{label}</span>
        <Icon className="w-4 h-4 text-muted" />
      </div>
      {loading ? (
        <div className="skeleton h-8 w-16 rounded" />
      ) : (
        <>
          <div className="text-2xl font-bold text-ink">{(value ?? 0).toLocaleString()}</div>
          {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
        </>
      )}
    </div>
  );
}

function MiniBars({ chart, target, loading }) {
  if (loading || !chart) return <div className="skeleton h-24 rounded" />;
  const values = chart.values || [];
  const labels = chart.labels || [];
  const max = Math.max(...values, target || 0, 1);
  return (
    <div>
      <div className="flex items-end gap-1.5 h-24" role="img" aria-label={chart.title}>
        {values.map((v, i) => {
          const pct = Math.round((v / max) * 100);
          const met = target ? v >= target : false;
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full" title={`${labels[i] || ''}: ${v}`}>
              <span className="text-[10px] font-semibold text-muted mb-1">{v > 0 ? v : ''}</span>
              <div className={`w-full rounded-t transition-all ${met ? 'bg-success' : 'bg-primary'}`}
                style={{ height: `${Math.max(pct, v > 0 ? 6 : 2)}%`, opacity: v > 0 ? 1 : 0.25 }} />
            </div>
          );
        })}
      </div>
      {target ? (
        <p className="text-[11px] text-muted mt-3">Green bar = hit the {target}-a-day target.</p>
      ) : null}
    </div>
  );
}

function QualityBar({ label, n, pct, Icon }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="font-semibold text-ink inline-flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5 text-muted" /> {label}
        </span>
        <span className="text-muted">{n.toLocaleString()} · {pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-hover overflow-hidden">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(Math.max(pct, pct > 0 ? 2 : 0), 100)}%` }} />
      </div>
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

function fmtJoined(iso) {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function AdminAnalytics() {
  const [range, setRange] = useState('7d');
  const [data, setData] = useState(null);
  const [seo, setSeo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [a, s] = await Promise.all([
        http.get(`/api/admin/analytics?range=${range}`),
        http.get(`/api/admin/seo?range=${range}`).catch(() => null),
      ]);
      setData(a);
      setSeo(s);
    } catch (e) {
      setError(e?.message || 'Could not load analytics.');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const headline = data?.headline || {};
  const insight = data?.insight || '';
  const steps = data?.funnel?.steps || [];
  const engagement = data?.engagement || {};
  const quality = data?.quality || {};
  const leaks = data?.leaks || { total: 0, rows: [] };
  const charts = data?.charts || [];
  const chartByKey = (k) => charts.find((c) => c.key === k);

  const traffic = seo?.traffic || { labels: [], pageviews: [], visitors: [] };
  const topPages = seo?.topPages || [];
  const referrers = seo?.referrers || [];
  const devices = seo?.devices || [];
  const ga = seo?.ga || {};
  const deviceTotal = devices.reduce((a, d) => a + d.views, 0);

  const engagementStats = [
    { label: 'Interests between real members', value: engagement.interestsTotal },
    { label: 'Mutual pairs', value: engagement.mutualPairs },
    { label: 'Conversations started', value: engagement.conversationsTotal },
    { label: 'Messages (7 days)', value: engagement.messages7d },
    { label: 'Messages (30 days)', value: engagement.messages30d },
    { label: 'Active members (7 days)', value: engagement.active7d },
    { label: 'Active members (30 days)', value: engagement.active30d },
    { label: 'Not active in 30 days', value: engagement.dormant },
  ];

  return (
    <Layout>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <header className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-ink">Analytics</h1>
            <p className="text-sm text-muted mt-1">
              Real people only — seeded profiles and test accounts are not counted here.
            </p>
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

        {/* The one thing to know — plain English, from the numbers below */}
        {!loading && insight && (
          <section className="rounded-xl border border-primary/30 bg-primary/5 p-5 mb-6 flex gap-3">
            <TrendingUp className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-primary uppercase tracking-wide mb-1">The one thing to know</p>
              <p className="text-sm sm:text-base font-semibold text-ink leading-relaxed">{insight}</p>
            </div>
          </section>
        )}

        {/* Headline strip — today at a glance (New York day) */}
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          <HeadlineCard label="Joined today" Icon={UserPlus} loading={loading}
            value={headline.signupsToday}
            sub={`of ${headline.signupTarget ?? 5} target · yesterday ${headline.signupsYesterday ?? 0}`} />
          <HeadlineCard label="Real members" Icon={Users} loading={loading}
            value={headline.realMembers}
            sub="people, not profiles" />
          <HeadlineCard label="Visitors today" Icon={Eye} loading={loading}
            value={headline.visitorsToday}
            sub={`${(headline.pageviewsToday ?? 0).toLocaleString()} pageviews today`} />
          <HeadlineCard label="Interests today" Icon={TrendingUp} loading={loading}
            value={headline.interestsToday}
            sub="sent by members today" />
          <HeadlineCard label="Messages today" Icon={MessageCircle} loading={loading}
            value={headline.messagesToday}
            sub="sent today" />
        </section>

        {/* The funnel — where people drop off (all time) */}
        <section className="mb-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
            <h2 className="text-base font-bold text-ink">How members get from joining to talking</h2>
            <p className="text-xs text-muted">{data?.funnel?.window || 'All time'}</p>
          </div>
          {loading && !steps.length ? (
            <div className="skeleton h-48 rounded-xl" />
          ) : !steps.length ? (
            <p className="text-sm text-muted">No data yet.</p>
          ) : (
            <div className="rounded-xl border border-line/20 bg-elevated p-5 space-y-3">
              {steps.map((s, idx) => (
                <div key={s.key}>
                  <div className="flex items-center justify-between text-xs mb-1 gap-2">
                    <span className="font-semibold text-ink">{s.label}</span>
                    <span className="text-muted whitespace-nowrap">
                      <span className="font-bold text-ink">{s.n.toLocaleString()}</span>
                      {idx > 0 && <> · {s.pctOfSignups}% of everyone who joined</>}
                      {s.dropFromPrev > 0 && (
                        <span className="text-danger inline-flex items-center gap-0.5 ml-2">
                          <TrendingDown className="w-3 h-3" />{s.dropFromPrev.toLocaleString()} lost here
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-hover overflow-hidden">
                    <div className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${Math.max(s.pctOfSignups, s.pctOfSignups > 0 ? 2 : 0)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Charts — real signups, messages, biodatas */}
        <div className="mb-6">
          <section className="rounded-xl border border-line/20 bg-elevated p-5">
            <h3 className="text-sm font-bold text-ink mb-4 inline-flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-muted" /> Real signups per day
            </h3>
            <MiniBars chart={chartByKey('memberGrowth')} target={headline.signupTarget ?? 5} loading={loading} />
          </section>
        </div>

        {/* Engagement health + member quality */}
        <div className="grid gap-4 lg:grid-cols-2 mb-6">
          <section className="rounded-xl border border-line/20 bg-elevated p-5">
            <h3 className="text-sm font-bold text-ink mb-4">Are members actually talking?</h3>
            {loading ? <div className="skeleton h-40 rounded" /> : (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                {engagementStats.map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between gap-2 border-b border-line/10 pb-2">
                    <dt className="text-xs text-muted">{label}</dt>
                    <dd className="text-sm font-bold text-ink">{(value ?? 0).toLocaleString()}</dd>
                  </div>
                ))}
              </dl>
            )}
            <p className="text-[11px] text-muted mt-3">All time unless a window is named.</p>
          </section>

          <section className="rounded-xl border border-line/20 bg-elevated p-5">
            <h3 className="text-sm font-bold text-ink mb-4 inline-flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-muted" /> How complete are the profiles?
            </h3>
            {loading ? <div className="skeleton h-40 rounded" /> : (
              <div className="space-y-4">
                <QualityBar label="Finished their profile" Icon={UserPlus} n={quality.finished ?? 0} pct={quality.finishedPct ?? 0} />
                <QualityBar label="Has a photo" Icon={Eye} n={quality.withPhoto ?? 0} pct={quality.withPhotoPct ?? 0} />
                <QualityBar label="Wrote a bio" Icon={FileImage} n={quality.withBio ?? 0} pct={quality.withBioPct ?? 0} />
                <QualityBar label="Confirmed their email" Icon={Users} n={quality.emailVerified ?? 0} pct={quality.emailVerifiedPct ?? 0} />
                <div className="flex flex-wrap gap-2 pt-1">
                  <span className="text-xs px-2.5 py-1 rounded-full bg-hover text-ink font-semibold">
                    ID verified: {(quality.idVerified ?? 0).toLocaleString()}
                  </span>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-hover text-ink font-semibold">
                    Photo verified: {(quality.photoVerified ?? 0).toLocaleString()}
                  </span>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-hover text-ink font-semibold">
                    Any verified badge: {(quality.anyVerified ?? 0).toLocaleString()}
                  </span>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Leak list — members who are stuck right now */}
        <section className="rounded-xl border border-line/20 bg-elevated p-5 mb-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
            <h3 className="text-sm font-bold text-ink">Members who are stuck</h3>
            <p className="text-xs text-muted">{(leaks.total ?? 0).toLocaleString()} stuck · showing the {leaks.rows.length} newest</p>
          </div>
          <p className="text-xs text-muted mb-4">
Joined, but invisible in browse — email not confirmed, or profile unfinished. The fastest members to win back.
          </p>
          {loading ? <div className="skeleton h-40 rounded" /> : !leaks.rows.length ? (
            <p className="text-sm text-muted">Nobody is stuck — every member has confirmed their email and finished their profile.</p>
          ) : (
            <ul className="divide-y divide-line/10">
              {leaks.rows.map((r) => (
                <li key={r.id} className="py-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink truncate">
                      {r.profileName || r.accountName}
                      {r.accountName && r.profileName && r.accountName !== r.profileName && (
                        <span className="text-muted font-normal"> · account name: {r.accountName}</span>
                      )}
                    </p>
                    <p className="text-xs text-muted">
                      {[r.city, r.country].filter(Boolean).join(', ') || 'No location yet'} · joined {fmtJoined(r.joinedAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(r.missing || []).map((m) => (
                      <span key={m} className="text-[11px] px-2 py-0.5 rounded-full bg-danger/10 text-danger font-semibold">{m}</span>
                    ))}
                  </div>
                  <Link to={`/admin/members?q=${encodeURIComponent(r.email || r.profileName || '')}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline whitespace-nowrap">
                    Open in Members <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <h2 className="text-base font-bold text-ink mb-3">SEO &amp; traffic</h2>

        {/* Google Analytics 4 connection status */}
        <section className="rounded-xl border border-line/20 bg-elevated p-5 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-hover text-muted">
                Tag installed — verify in GA console
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
            The GA4 tag is live; its acquisition and demographic reports live in the GA console.
            Everything below is first-party data from this site's own database.
          </p>
        </section>


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
              <p className="text-xs text-muted">No pageview data yet.</p>
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
              <p className="text-xs text-muted">No referrer data yet.</p>
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

        <p className="text-[11px] text-muted">
“Today” is the New York day. Traffic counts come from the site's own pageview log.
        </p>
      </main>
    </Layout>
  );
}
