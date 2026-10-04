import { useState, useEffect, useCallback } from 'react';
import Layout from '@/layouts/MainLayout';
import { http } from '@/lib/api/transport';
import { BarChart3, RefreshCw, TrendingDown } from 'lucide-react';

/**
 * Analytics â€” real aggregates plus the activation funnel.
 *
 * This page previously imported `adminData`, a fixture module, and rendered
 * hardcoded charts. An operator could see growth that never happened and make
 * decisions from it. Everything below comes from GET /api/admin/analytics (real
 * created_at buckets) and GET /api/admin/funnel (real COUNTs per step).
 */

function BarChart({ title, labels, values, color }) {
  const max = Math.max(...values, 1);
  return (
    <section className="rounded-xl border border-line/20 bg-elevated p-5">
      <h3 className="text-sm font-bold text-ink mb-4">{title}</h3>
      <div className="flex items-end gap-1 h-28" role="img" aria-label={`${title}: ${values.length} data points`}>
        {values.map((v, i) => (
          <div key={i} title={`${labels[i]}: ${v}`}
            style={{ flex: 1, height: `${Math.max((v / max) * 100, 2)}%`, background: color, borderRadius: '4px 4px 0 0', minWidth: 4 }}
            className="transition-all" />
        ))}
      </div>
      <div className="flex gap-1 mt-2">
        {labels.map((l, i) => (
          <span key={i} style={{ flex: 1, textAlign: 'center', fontSize: '0.625rem' }}
            className="text-muted truncate">{i === 0 || i === labels.length - 1 ? l : ''}</span>
        ))}
      </div>
      <p className="text-xs text-muted mt-2">Peak {max} Â· total {values.reduce((a, b) => a + b, 0)}</p>
    </section>
  );
}

export default function AdminAnalytics() {
  const [range, setRange] = useState('7d');
  const [analytics, setAnalytics] = useState(null);
  const [funnel, setFunnel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [a, f] = await Promise.all([
        http.get(`/api/admin/analytics?range=${range}`),
        http.get('/api/admin/funnel'),
      ]);
      setAnalytics(a);
      setFunnel(f);
    } catch (e) {
      setError(e?.message || 'Could not load analytics.');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const charts = analytics?.charts || [];
  const steps = funnel?.steps || [];
  const base = steps[0]?.n || 0;

  return (
    <Layout>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <header className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-ink">Analytics</h1>
            <p className="text-sm text-muted mt-1">Real counts from the database. No sample data.</p>
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

        {loading && !charts.length ? (
          <div className="grid gap-4 sm:grid-cols-2">{[0, 1].map((i) => <div key={i} className="skeleton h-56 rounded-xl" />)}</div>
        ) : charts.length ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {charts.map((c) => (
              <BarChart key={c.key} title={c.title} labels={c.labels} values={c.values}
                color={c.color || 'var(--color-primary)'} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="text-muted mb-3 flex justify-center"><BarChart3 className="w-12 h-12" /></div>
            <h2 className="empty-state-title">No activity in this window</h2>
            <p className="empty-state-text">Widen the range, or check back once members are active.</p>
          </div>
        )}
      </main>
    </Layout>
  );
}