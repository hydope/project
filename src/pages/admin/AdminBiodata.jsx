import { useState, useEffect, useCallback } from 'react';
import Layout from '@/layouts/AdminLayout';
import { http } from '@/lib/api/transport';
import { FileText, Search, Download, Calendar, User, Camera, RefreshCw, ChevronDown, BarChart3 } from 'lucide-react';

/**
 * Biodata Maker — admin section.
 *
 * Every biodata created via /biodata-maker is logged to the audit trail
 * (action: biodata.created) with all submitted fields, template, language,
 * and a photo thumbnail. This page surfaces those logs as a first-class
 * admin view: searchable, filterable, with full detail expansion.
 */
export default function AdminBiodata() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [templateFilter, setTemplateFilter] = useState('all');
  const [expanded, setExpanded] = useState(null);
  const [stats, setStats] = useState({ total: 0, withPhoto: 0, templates: {} });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await http.get('/api/admin/audit?action=biodata.created&limit=200');
      const list = Array.isArray(res) ? res : (res.rows || res.items || []);
      setRows(list);
      // Compute stats
      const templates = {};
      let withPhoto = 0;
      for (const r of list) {
        const t = r.meta?.template || 'essential';
        templates[t] = (templates[t] || 0) + 1;
        if (r.meta?.has_photo) withPhoto++;
      }
      setStats({ total: list.length, withPhoto, templates });
    } catch (e) {
      setError(e?.message || 'Could not load biodata logs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter(r => {
    if (templateFilter !== 'all' && (r.meta?.template || 'essential') !== templateFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    const fields = r.meta?.fields || {};
    return Object.values(fields).some(v => String(v).toLowerCase().includes(q)) ||
      (r.meta?.template || '').toLowerCase().includes(q);
  });

  const templates = [...new Set(rows.map(r => r.meta?.template || 'essential'))];

  return (
    <Layout>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <header className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-ink flex items-center gap-2">
              <FileText className="w-6 h-6" /> Biodata Maker
            </h1>
            <p className="text-sm text-muted mt-1">
              Every biodata created — who made it, what they entered, and when.
            </p>
          </div>
          <button onClick={load} disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-elevated text-muted border border-line/20 hover:border-line/40 disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </header>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="rounded-xl p-4 border border-line/20 bg-elevated">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-muted" />
              <span className="text-xs text-muted">Total created</span>
            </div>
            <p className="text-2xl font-bold text-ink">{stats.total}</p>
          </div>
          <div className="rounded-xl p-4 border border-line/20 bg-elevated">
            <div className="flex items-center gap-2 mb-1">
              <Camera className="w-4 h-4 text-muted" />
              <span className="text-xs text-muted">With photo</span>
            </div>
            <p className="text-2xl font-bold text-ink">{stats.withPhoto}</p>
          </div>
          <div className="rounded-xl p-4 border border-line/20 bg-elevated col-span-2">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-4 h-4 text-muted" />
              <span className="text-xs text-muted">By template</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.templates).map(([t, n]) => (
                <span key={t} className="text-xs px-2 py-1 rounded-full bg-hover text-ink">
                  {t}: <strong>{n}</strong>
                </span>
              ))}
              {!Object.keys(stats.templates).length && (
                <span className="text-xs text-muted">No data yet</span>
              )}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search names, details..."
              className="input w-full pl-9 text-sm"
              aria-label="Search biodata"
            />
          </div>
          <select
            value={templateFilter} onChange={e => setTemplateFilter(e.target.value)}
            className="input text-sm" aria-label="Filter by template"
          >
            <option value="all">All templates</option>
            {templates.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-line/20 bg-elevated p-3 text-sm text-muted">{error}</div>
        )}

        {loading && !rows.length ? (
          <div className="space-y-2">
            {[0, 1, 2].map(i => <div key={i} className="skeleton h-20 rounded-xl" />)}
          </div>
        ) : !filtered.length ? (
          <div className="empty-state">
            <div className="text-muted mb-3 flex justify-center"><FileText className="w-12 h-12" /></div>
            <h2 className="empty-state-title">No biodata yet</h2>
            <p className="empty-state-text">
              When someone creates a biodata via the Biodata Maker, it appears here with all details.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map(r => {
              const m = r.meta || {};
              const fields = m.fields || {};
              const isOpen = expanded === r.id;
              const name = fields.name || fields.full_name || 'Unnamed';
              return (
                <li key={r.id} className="rounded-xl border border-line/20 bg-elevated overflow-hidden">
                  <button
                    onClick={() => setExpanded(isOpen ? null : r.id)}
                    className="w-full flex items-center gap-4 p-4 text-left hover:bg-hover/50 transition-colors"
                    aria-expanded={isOpen}
                  >
                    {m.photo_thumb ? (
                      <img src={m.photo_thumb} alt="" className="w-12 h-14 object-cover rounded-lg flex-shrink-0 border border-line/20" />
                    ) : (
                      <div className="w-12 h-14 rounded-lg flex-shrink-0 flex items-center justify-center bg-hover">
                        <User className="w-5 h-5 text-muted" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-ink truncate">{name}</p>
                      <p className="text-xs text-muted truncate">
                        {m.template || 'essential'} · {m.lang || 'en'} · {m.field_count || 0} fields
                        {m.has_photo ? ' · 📷' : ''}
                      </p>
                      <p className="text-[11px] text-muted mt-0.5 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {r.created_at ? new Date(r.created_at).toLocaleString() : ''}
                        {r.actor_label ? ` · ${r.actor_label}` : ''}
                      </p>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-muted flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 pt-1 border-t border-line/10">
                      {m.photo_thumb && (
                        <img src={m.photo_thumb} alt="Biodata photo"
                          className="mt-3 w-32 h-40 object-cover rounded-xl border border-line/20" />
                      )}
                      <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                        {Object.entries(fields).map(([k, v]) => (
                          <div key={k} className="flex gap-2 text-sm">
                            <dt className="text-muted shrink-0 min-w-[110px] capitalize">
                              {k.replace(/_/g, ' ')}:
                            </dt>
                            <dd className="text-ink break-words">{String(v)}</dd>
                          </div>
                        ))}
                      </dl>
                      {Object.keys(fields).length === 0 && (
                        <p className="text-xs text-muted mt-2">No field details recorded.</p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </Layout>
  );
}
