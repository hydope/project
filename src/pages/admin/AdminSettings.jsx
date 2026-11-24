import { useState, useEffect, useCallback } from 'react';
import Layout from '@/layouts/AdminLayout';
import { http } from '@/lib/api/transport';
import { Settings, Users, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

/**
 * Site settings — behaviour an admin can change from the portal with no
 * code change and no deploy (Syed's order, 2026-11-23: flipping the
 * profile listing order took a code change plus a ~35-minute deploy,
 * which "doesn't make any sense"). Values live server-side in
 * app_settings (see php-api/lib/siteSettings.php); this page is a thin
 * editor over GET/PUT /api/admin/site-settings.
 *
 * New behaviour toggles belong HERE, as their own card, not in code.
 */

const ORDER_OPTIONS = [
  {
    value: 'latest',
    title: 'Latest first — seeded included',
    body: 'The directory, the homepage strip and both apps show the newest profiles first, whatever kind they are. A profile seeded today appears at the top alongside real members who joined today.',
  },
  {
    value: 'real_first',
    title: 'Real members first',
    body: 'Real members first, newest first; seeded profiles only after every real member. The directory looks fuller only once the real roster is exhausted.',
  },
];

function fmtWhen(s) {
  if (!s) return null;
  const d = new Date(`${s.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? String(s) : d.toLocaleString();
}

export default function AdminSettings() {
  const [order, setOrder] = useState('latest');
  const [savedOrder, setSavedOrder] = useState('latest');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await http.get('/api/admin/site-settings');
      const value = res?.profileListingOrder === 'real_first' ? 'real_first' : 'latest';
      setOrder(value);
      setSavedOrder(value);
      setUpdatedAt(res?.updatedAt || null);
    } catch (e) {
      setMsg({ ok: false, text: e?.message || 'Could not load site settings.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await http.put('/api/admin/site-settings', { profileListingOrder: order });
      const value = res?.profileListingOrder === 'real_first' ? 'real_first' : 'latest';
      setSavedOrder(value);
      setOrder(value);
      setMsg({ ok: true, text: 'Saved. The new order applies within about a minute — no deploy needed.' });
      load();
    } catch (e) {
      setMsg({ ok: false, text: e?.message || 'Could not save. Try again.' });
    } finally {
      setSaving(false);
    }
  };

  const dirty = order !== savedOrder;

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-3 mb-1">
          <Settings className="w-6 h-6" />
          <h1 className="text-xl font-bold">Settings</h1>
        </div>
        <p className="text-sm text-muted mb-6">
          Site behaviour you can change right here. Changes take effect on their own — no code, no deploy.
        </p>

        {msg && (
          <div className={`mb-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
            {msg.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{msg.text}</span>
          </div>
        )}

        <section className="rounded-xl border border-line/20 bg-elevated p-5 mb-8">
          <h2 className="text-base font-bold text-ink mb-1 flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" /> Profile listing order
          </h2>
          <p className="text-xs text-muted mb-4">
            How the public directory and the homepage profile strip are ordered. Match suggestions and
            member counts are unaffected — seeded profiles are never suggested as matches and never
            counted as real members, whichever order you pick.
          </p>

          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</p>
          ) : (
            <>
              <div className="space-y-3" role="radiogroup" aria-label="Profile listing order">
                {ORDER_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex gap-3 rounded-lg border p-3.5 cursor-pointer transition-colors ${order === opt.value ? 'border-primary/60 bg-primary/5' : 'border-line/20 hover:border-line/40'}`}
                  >
                    <input
                      type="radio"
                      name="profile-listing-order"
                      value={opt.value}
                      checked={order === opt.value}
                      onChange={() => setOrder(opt.value)}
                      className="mt-1 shrink-0"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-ink">{opt.title}</span>
                      <span className="block text-xs text-muted mt-0.5">{opt.body}</span>
                    </span>
                  </label>
                ))}
              </div>

              <div className="mt-4 flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={save}
                  disabled={!dirty || saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white disabled:opacity-50"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save order
                </button>
                {updatedAt && (
                  <span className="text-xs text-muted">Last changed {fmtWhen(updatedAt)}</span>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </Layout>
  );
}
