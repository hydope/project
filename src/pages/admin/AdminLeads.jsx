import { useState, useEffect, useCallback } from 'react';
import Layout from '@/layouts/AdminLayout';
import { http } from '@/lib/api/transport';
import {
  MailPlus, Search, Download, Trash2, Loader2, AlertCircle, RefreshCw,
} from 'lucide-react';

/**
 * Guest leads — the emails visitors leave in the "new profiles near you"
 * capture boxes (home, browse, city pages, biodata, blog). Until this
 * page existed (P2, 2026-11-23) the list lived only as an 8-row preview
 * inside Analytics: not searchable, not exportable, not manageable —
 * a conversion asset sitting in a drawer.
 *
 * Data: GET /api/admin/leads (q filters rows; total/active stay global).
 * Export builds the CSV in the browser from the same endpoint, so what
 * you download is exactly what the table shows.
 */

const PAGE = 100;

function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(`${s.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? String(s) : d.toLocaleDateString();
}

function toCsv(rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = 'email,source,city,subscribed,captured,last_emailed';
  const lines = rows.map((r) => [
    r.email, r.source || '', r.city || '', r.unsubscribed ? 'no' : 'yes',
    r.created_at || '', r.last_sent_at || '',
  ].map(esc).join(','));
  return [head, ...lines].join('\n');
}

export default function AdminLeads() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [active, setActive] = useState(0);
  const [filtered, setFiltered] = useState(0);
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');

  const load = useCallback(async (query, offset) => {
    setLoading(true);
    try {
      const res = await http.get(`/api/admin/leads?limit=${PAGE}&offset=${offset}&q=${encodeURIComponent(query)}`);
      const page = Array.isArray(res?.rows) ? res.rows : [];
      setRows((prev) => (offset === 0 ? page : [...prev, ...page]));
      setTotal(res?.total || 0);
      setActive(res?.active || 0);
      setFiltered(res?.filtered ?? res?.total ?? 0);
      setError(res?.error || '');
    } catch (e) {
      setError(e?.message || 'Could not load leads.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load('', 0); }, [load]);

  const applySearch = () => {
    setAppliedQ(q.trim());
    load(q.trim(), 0);
  };

  const removeLead = async (email) => {
    try {
      await http.post('/api/admin/leads/delete', { email });
      setConfirmEmail('');
      load(appliedQ, 0);
    } catch (e) {
      setError(e?.message || 'Could not remove that lead.');
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await http.get(`/api/admin/leads?limit=1000&offset=0&q=${encodeURIComponent(appliedQ)}`);
      const all = Array.isArray(res?.rows) ? res.rows : [];
      const blob = new Blob([toCsv(all)], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'guest-leads.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e?.message || 'Export failed.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-3 mb-1">
          <MailPlus className="w-6 h-6" />
          <h1 className="text-xl font-bold">Guest Leads</h1>
        </div>
        <p className="text-sm text-muted mb-6">
          Emails visitors left in the profile-alert boxes. The weekly digest already emails this list when
          new profiles join — here you can finally see it, search it, export it and clean it.
        </p>

        <div className="flex gap-6 mb-6">
          <div>
            <p className="text-2xl font-bold text-ink">{total}</p>
            <p className="text-xs text-muted">Total leads</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-ink">{active}</p>
            <p className="text-xs text-muted">Still subscribed</p>
          </div>
          {appliedQ && (
            <div>
              <p className="text-2xl font-bold text-ink">{filtered}</p>
              <p className="text-xs text-muted">Matching “{appliedQ}”</p>
            </div>
          )}
        </div>

        <div className="flex gap-2 flex-wrap mb-4">
          <div className="flex gap-2 flex-1 min-w-[220px]">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') applySearch(); }}
              placeholder="Search email or city…"
              className="flex-1 rounded-lg border border-line/30 bg-elevated px-3 py-2 text-sm text-ink"
            />
            <button
              onClick={applySearch}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-primary text-white"
            >
              <Search className="w-4 h-4" /> Search
            </button>
          </div>
          <button
            onClick={() => load(appliedQ, 0)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border border-line/30 text-muted"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button
            onClick={exportCsv}
            disabled={exporting || total === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border border-line/30 text-muted disabled:opacity-40"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Export CSV
          </button>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm bg-danger/10 text-danger">
            <AlertCircle className="w-4 h-4 shrink-0" /> <span>{error}</span>
          </div>
        )}

        <div className="rounded-xl border border-line/20 bg-elevated overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted border-b border-line/20">
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Source</th>
                <th className="px-4 py-3 font-semibold">City</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Captured</th>
                <th className="px-4 py-3 font-semibold">Last emailed</th>
                <th className="px-4 py-3 font-semibold"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.email} className="border-b border-line/10 last:border-0">
                  <td className="px-4 py-2.5 text-ink break-all">{r.email}</td>
                  <td className="px-4 py-2.5 text-muted">{r.source || '—'}</td>
                  <td className="px-4 py-2.5 text-muted">{r.city || '—'}</td>
                  <td className="px-4 py-2.5">
                    {r.unsubscribed
                      ? <span className="text-danger text-xs font-semibold">Unsubscribed</span>
                      : <span className="text-success text-xs font-semibold">Subscribed</span>}
                  </td>
                  <td className="px-4 py-2.5 text-muted">{fmtDate(r.created_at)}</td>
                  <td className="px-4 py-2.5 text-muted">{fmtDate(r.last_sent_at)}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {confirmEmail === r.email ? (
                      <>
                        <button onClick={() => removeLead(r.email)} className="text-xs font-semibold text-danger mr-2">Confirm remove</button>
                        <button onClick={() => setConfirmEmail('')} className="text-xs font-semibold text-muted">Cancel</button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmEmail(r.email)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-danger"
                        aria-label={`Remove lead ${r.email}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted text-sm">
                    {appliedQ ? 'No leads match that search.' : 'No guest leads yet. They appear here as visitors leave their email in the alert boxes.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center gap-3">
          {loading && <p className="flex items-center gap-2 text-sm text-muted"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</p>}
          {!loading && rows.length < filtered && (
            <button
              onClick={() => load(appliedQ, rows.length)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-line/20 text-muted"
            >
              Show more ({rows.length} of {filtered})
            </button>
          )}
        </div>
      </div>
    </Layout>
  );
}
