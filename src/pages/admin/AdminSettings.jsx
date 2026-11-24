import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Layout from '@/layouts/AdminLayout';
import { http } from '@/lib/api/transport';
import AiSettingsPanel from './AiSettingsPanel';
import {
  Settings, Users, Target, Sprout, BookOpen, Zap, Share2,
  Loader2, CheckCircle2, AlertCircle, ArrowRight,
} from 'lucide-react';

/**
 * Site settings — the ONE home for behaviour an admin can change with no
 * code change and no deploy (Syed's order, 2026-11-23: flipping the
 * profile listing order took a code change plus a ~35-minute deploy,
 * which "doesn't make any sense"). Values live server-side in
 * app_settings (php-api/lib/siteSettings.php); this page edits them via
 * GET/PUT /api/admin/site-settings. Specialist editors that predate this
 * page (social publishing) are linked, not duplicated.
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

const NUMERIC_FIELDS = ['signupTarget', 'seederDailyCount', 'seederFemaleCount', 'blogPostsPerDay', 'blogQueueTarget'];

function fmtWhen(s) {
  if (!s) return null;
  const d = new Date(`${s.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? String(s) : d.toLocaleString();
}

function CardMsg({ msg }) {
  if (!msg) return null;
  return (
    <div className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
      {msg.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
      <span>{msg.text}</span>
    </div>
  );
}

function Card({ icon: Icon, title, blurb, children, onSave, saving, msg, saveLabel = 'Save' }) {
  return (
    <section className="rounded-xl border border-line/20 bg-elevated p-5 mb-8">
      <h2 className="text-base font-bold text-ink mb-1 flex items-center gap-2">
        <Icon className="w-4 h-4 text-primary" /> {title}
      </h2>
      <p className="text-xs text-muted mb-4">{blurb}</p>
      {children}
      <div className="mt-4">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white disabled:opacity-50"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {saveLabel}
        </button>
      </div>
      <CardMsg msg={msg} />
    </section>
  );
}

function NumberField({ label, value, onChange, min, max, hint }) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-ink mb-1">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-28 rounded-lg border border-line/30 bg-elevated px-3 py-2 text-sm text-ink"
      />
      {hint && <span className="block text-xs text-muted mt-1">{hint}</span>}
    </label>
  );
}

function ToggleField({ label, body, checked, onChange }) {
  return (
    <label className="flex gap-3 items-start cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 shrink-0"
      />
      <span>
        <span className="block text-sm font-semibold text-ink">{label}</span>
        <span className="block text-xs text-muted mt-0.5">{body}</span>
      </span>
    </label>
  );
}

export default function AdminSettings() {
  const [s, setS] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [cardState, setCardState] = useState({}); // key -> {saving, msg}

  const load = useCallback(async () => {
    try {
      const res = await http.get('/api/admin/site-settings');
      setS({
        profileListingOrder: res?.profileListingOrder === 'real_first' ? 'real_first' : 'latest',
        signupTarget: String(res?.signupTarget ?? 10),
        seederEnabled: !!res?.seederEnabled,
        seederDailyCount: String(res?.seederDailyCount ?? 5),
        seederFemaleCount: String(res?.seederFemaleCount ?? 4),
        blogPostsPerDay: String(res?.blogPostsPerDay ?? 3),
        blogQueueTarget: String(res?.blogQueueTarget ?? 90),
        weeklyDigestEnabled: !!res?.weeklyDigestEnabled,
        communitySeederEnabled: !!res?.communitySeederEnabled,
      });
      setUpdatedAt(res?.updatedAt || null);
    } catch (e) {
      setLoadError(e?.message || 'Could not load site settings.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (field, value) => setS((prev) => (prev ? { ...prev, [field]: value } : prev));

  const saveCard = async (key, fields) => {
    setCardState((p) => ({ ...p, [key]: { saving: true, msg: null } }));
    try {
      const body = {};
      for (const f of fields) {
        body[f] = NUMERIC_FIELDS.includes(f) ? parseInt(s[f], 10) : s[f];
      }
      await http.put('/api/admin/site-settings', body);
      setCardState((p) => ({ ...p, [key]: { saving: false, msg: { ok: true, text: 'Saved — live within about a minute, no deploy.' } } }));
      load();
    } catch (e) {
      setCardState((p) => ({ ...p, [key]: { saving: false, msg: { ok: false, text: e?.message || 'Could not save. Try again.' } } }));
    }
  };

  const cs = (key) => cardState[key] || { saving: false, msg: null };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-3 mb-1">
          <Settings className="w-6 h-6" />
          <h1 className="text-xl font-bold">Settings</h1>
        </div>
        <p className="text-sm text-muted mb-6">
          Site behaviour you can change right here. Changes take effect on their own — no code, no deploy.
          {updatedAt && <> Last changed {fmtWhen(updatedAt)}.</>}
        </p>

        {loadError && (
          <div className="mb-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm bg-danger/10 text-danger">
            <AlertCircle className="w-4 h-4 shrink-0" /> <span>{loadError}</span>
          </div>
        )}

        {!s ? (
          <p className="flex items-center gap-2 text-sm text-muted"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</p>
        ) : (
          <>
            <Card
              icon={Users}
              title="Profile listing order"
              blurb="How the public directory and the homepage profile strip are ordered. Match suggestions and member counts are unaffected — seeded profiles are never suggested as matches and never counted as real members, whichever order you pick."
              onSave={() => saveCard('listing', ['profileListingOrder'])}
              saving={cs('listing').saving}
              msg={cs('listing').msg}
              saveLabel="Save order"
            >
              <div className="space-y-3" role="radiogroup" aria-label="Profile listing order">
                {ORDER_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex gap-3 rounded-lg border p-3.5 cursor-pointer transition-colors ${s.profileListingOrder === opt.value ? 'border-primary/60 bg-primary/5' : 'border-line/20 hover:border-line/40'}`}
                  >
                    <input
                      type="radio"
                      name="profile-listing-order"
                      value={opt.value}
                      checked={s.profileListingOrder === opt.value}
                      onChange={() => set('profileListingOrder', opt.value)}
                      className="mt-1 shrink-0"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-ink">{opt.title}</span>
                      <span className="block text-xs text-muted mt-0.5">{opt.body}</span>
                    </span>
                  </label>
                ))}
              </div>
            </Card>

            <Card
              icon={Target}
              title="Goals"
              blurb="The daily signup target the Overview and Analytics pages measure against."
              onSave={() => saveCard('goals', ['signupTarget'])}
              saving={cs('goals').saving}
              msg={cs('goals').msg}
            >
              <NumberField
                label="Real signups per day — target"
                value={s.signupTarget}
                onChange={(v) => set('signupTarget', v)}
                min={1}
                max={50}
              />
            </Card>

            <Card
              icon={Sprout}
              title="Profile seeder"
              blurb="The daily seeder that adds sample profiles so the directory never looks empty. Turning it off stops new seeded profiles from the next run — existing ones stay. Pausing this used to need a code change; now it's this switch."
              onSave={() => saveCard('seeder', ['seederEnabled', 'seederDailyCount', 'seederFemaleCount'])}
              saving={cs('seeder').saving}
              msg={cs('seeder').msg}
            >
              <div className="space-y-4">
                <ToggleField
                  label="Seeder on"
                  body="When off, the daily run skips and adds nothing."
                  checked={s.seederEnabled}
                  onChange={(v) => set('seederEnabled', v)}
                />
                <div className="flex gap-6 flex-wrap">
                  <NumberField
                    label="Profiles per day"
                    value={s.seederDailyCount}
                    onChange={(v) => set('seederDailyCount', v)}
                    min={0}
                    max={20}
                  />
                  <NumberField
                    label="Of those, female"
                    value={s.seederFemaleCount}
                    onChange={(v) => set('seederFemaleCount', v)}
                    min={0}
                    max={20}
                    hint="The rest are male. Cannot exceed the daily total."
                  />
                </div>
              </div>
            </Card>

            <Card
              icon={BookOpen}
              title="Blog publishing"
              blurb="How fast the blog machine runs. Posts per day uses the fixed publish slots (morning / afternoon / night UTC); the queue target is how many scheduled posts the daily workflow keeps stocked."
              onSave={() => saveCard('blog', ['blogPostsPerDay', 'blogQueueTarget'])}
              saving={cs('blog').saving}
              msg={cs('blog').msg}
            >
              <div className="flex gap-6 flex-wrap">
                <label className="block">
                  <span className="block text-sm font-semibold text-ink mb-1">Posts per day</span>
                  <select
                    value={s.blogPostsPerDay}
                    onChange={(e) => set('blogPostsPerDay', e.target.value)}
                    className="w-28 rounded-lg border border-line/30 bg-elevated px-3 py-2 text-sm text-ink"
                  >
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                  </select>
                </label>
                <NumberField
                  label="Scheduled queue target"
                  value={s.blogQueueTarget}
                  onChange={(v) => set('blogQueueTarget', v)}
                  min={0}
                  max={300}
                  hint="Default 90 — about 30 days of posts."
                />
              </div>
            </Card>

            <Card
              icon={Zap}
              title="Automations"
              blurb="Background jobs that run on their own schedule. Switching one off takes effect on its next run."
              onSave={() => saveCard('automations', ['weeklyDigestEnabled', 'communitySeederEnabled'])}
              saving={cs('automations').saving}
              msg={cs('automations').msg}
            >
              <div className="space-y-4">
                <ToggleField
                  label="Weekly digest email"
                  body="The Sunday email to members (and guest-lead alerts when new profiles joined that week)."
                  checked={s.weeklyDigestEnabled}
                  onChange={(v) => set('weeklyDigestEnabled', v)}
                />
                <ToggleField
                  label="Community seeder"
                  body="Adds sample community posts daily so the rooms don't look empty."
                  checked={s.communitySeederEnabled}
                  onChange={(v) => set('communitySeederEnabled', v)}
                />
              </div>
            </Card>

            <AiSettingsPanel onChanged={load} />

            <section className="rounded-xl border border-line/20 bg-elevated p-5 mb-8">
              <h2 className="text-base font-bold text-ink mb-1 flex items-center gap-2">
                <Share2 className="w-4 h-4 text-primary" /> Social publishing
              </h2>
              <p className="text-xs text-muted mb-3">
                Daily caps, pause switches, posting slots, first-comment mode and storage for the story
                scheduler are managed in the scheduler's own settings, where today's usage sits next to them.
              </p>
              <Link
                to="/admin/social-scheduler"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary"
              >
                Open Social Scheduler settings <ArrowRight className="w-4 h-4" />
              </Link>
            </section>
          </>
        )}
      </div>
    </Layout>
  );
}
