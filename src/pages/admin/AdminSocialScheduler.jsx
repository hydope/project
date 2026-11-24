import { useState, useEffect, useCallback } from 'react';
import Layout from '@/layouts/AdminLayout';
import { http } from '@/lib/api/transport';
import {
  Share2, RefreshCw, Globe, Camera, Video, Plug, Trash2, Send,
  Clock, Save, AlertTriangle, Bot, Power, Gauge, HardDrive,
  ShieldAlert, History,
} from 'lucide-react';

// lucide-react 1.39 dropped brand icons, so platforms use generic glyphs.
const Facebook = Globe;
const Instagram = Camera;
const Youtube = Video;

/**
 * Social Scheduler — the admin portal is ONLY the control panel.
 * Posts are published NATIVELY to the Facebook Page, Instagram and
 * YouTube via their official APIs; nothing is posted on shiarishta.com.
 *
 * Autopilot: mostly REELS generated on the Muse side (ShortSmash) and
 * fed in through the ingest endpoint; the server-side generator fills a
 * slot with a text/image post only when no reel is waiting. Autopilot
 * defaults to OFF — the toggle below is the kill switch.
 */

const PLATFORM_META = {
  facebook: { label: 'Facebook Page', Icon: Facebook },
  instagram: { label: 'Instagram', Icon: Instagram },
  youtube: { label: 'YouTube', Icon: Youtube },
};

function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T') + (s.includes('T') ? '' : 'Z'));
  return Number.isNaN(d.getTime()) ? String(s) : d.toLocaleString();
}

const STATUS_STYLE = {
  published: { color: 'var(--color-success, #1a7f37)' },
  failed: { color: 'var(--color-danger)' },
  dead: { color: 'var(--color-danger)', fontWeight: 700 },
  publishing: { color: 'var(--color-warning, #9a6700)' },
  scheduled: {},
  pending: {},
  draft: { opacity: 0.7 },
  partial: { color: 'var(--color-warning, #9a6700)' },
};

export default function AdminSocialScheduler() {
  const [accounts, setAccounts] = useState([]);
  const [config, setConfig] = useState({});
  const [posts, setPosts] = useState([]);
  const [publisher, setPublisher] = useState(null);
  const [deadTargets, setDeadTargets] = useState([]);
  const [autopilot, setAutopilot] = useState(null);
  const [settings, setSettings] = useState(null);
  const [activity, setActivity] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Settings drafts (committed per card with its Save button)
  const [fbDraft, setFbDraft] = useState({ cap: 8, until: '2026-11-25' });
  const [capDraft, setCapDraft] = useState({ instagram: '', youtube: '' });
  const [slotDraft, setSlotDraft] = useState('');
  const [retryDraft, setRetryDraft] = useState({ maxAttempts: 6, backoffMinutes: 5 });
  const [storageDraft, setStorageDraft] = useState({ budgetGiB: '', purgeHours: 72 });

  const applySettings = useCallback((s) => {
    setSettings(s);
    if (!s) return;
    setFbDraft({ cap: s.fbCap.cap, until: s.fbCap.until });
    setCapDraft({ instagram: s.dailyCaps.instagram.cap ?? '', youtube: s.dailyCaps.youtube.cap ?? '' });
    setSlotDraft((s.slots || []).join(', '));
    setRetryDraft({ maxAttempts: s.retry.maxAttempts, backoffMinutes: s.retry.backoffMinutes });
    setStorageDraft({ budgetGiB: s.storage.budgetGiB ?? '', purgeHours: s.storage.purgeHours });
  }, []);

  // Composer state
  const [caption, setCaption] = useState('');
  const [overrides, setOverrides] = useState({ youtube: '' });
  const [showOverrides, setShowOverrides] = useState(false);
  const [media, setMedia] = useState(null); // {mediaPath, mediaType}
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState({}); // accountId -> bool
  const [when, setWhen] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [acc, list, ap, st, act] = await Promise.all([
        http.get('/api/admin/social/accounts'),
        http.get('/api/admin/social/posts'),
        http.get('/api/admin/social/autopilot'),
        http.get('/api/admin/social/settings'),
        http.get('/api/admin/social/activity'),
      ]);
      setAccounts(acc.accounts || []);
      setConfig(acc.config || {});
      setPosts(list.posts || []);
      setPublisher(list.publisher || null);
      setDeadTargets(list.deadTargets || []);
      setAutopilot(ap.autopilot || null);
      applySettings(st.settings || null);
      setActivity(act.events || []);
    } catch (e) {
      setError(e.message || 'Could not load the social scheduler.');
    }
  }, [applySettings]);

  const saveSettings = async (patch, msg) => {
    setError('');
    try {
      const res = await http.put('/api/admin/social/settings', patch);
      applySettings(res.settings);
      const released = Object.values(res.released || {}).reduce((a, b) => a + (b || 0), 0);
      setNotice(`${msg || 'Settings saved.'}${released ? ` ${released} cap-deferred post(s) released — they publish on the next run.` : ''}`);
      const act = await http.get('/api/admin/social/activity');
      setActivity(act.events || []);
    } catch (e) {
      setError(e.message || 'Could not save settings.');
    }
  };

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('social_connected')) setNotice(`Connected: ${params.get('social_connected')}.`);
    if (params.get('social_error')) setError(params.get('social_error'));
  }, []);

  const connect = async (provider) => {
    setError('');
    try {
      const res = await http.get(`/api/admin/social/connect/${provider}`);
      window.location.href = res.url;
    } catch (e) {
      setError(e.message || 'Connect is not available yet.');
    }
  };

  const disconnect = async (id) => {
    try {
      await http.del(`/api/admin/social/accounts/${id}`);
      await load();
    } catch (e) { setError(e.message || 'Could not disconnect.'); }
  };

  const reactivate = async (id) => {
    try {
      await http.post(`/api/admin/social/accounts/${id}/reactivate`, {});
      await load();
    } catch (e) { setError(e.message || 'Could not reactivate.'); }
  };

  const onMedia = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('media', file);
      fd.append('kind', file.type.startsWith('video/') ? 'video' : 'image');
      const res = await http.upload('/api/admin/social/media', fd);
      setMedia({ mediaPath: res.mediaPath, mediaType: res.mediaType });
    } catch (err) {
      setError(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const submit = async (mode) => {
    // mode: 'draft' | 'schedule' | 'now'
    setSaving(true);
    setError('');
    try {
      const accountIds = accounts.filter((a) => selected[a.id]).map((a) => a.id);
      const captionOverrides = {};
      if (showOverrides && overrides.youtube.trim()) captionOverrides.youtube = overrides.youtube.trim();
      await http.post('/api/admin/social/posts', {
        caption: caption.trim(),
        captionOverrides,
        mediaPath: media?.mediaPath || null,
        mediaType: media?.mediaType || null,
        accountIds,
        scheduledAt: mode === 'schedule' && when ? new Date(when).toISOString() : null,
        publishNow: mode === 'now',
      });
      setCaption('');
      setMedia(null);
      setWhen('');
      setNotice(mode === 'now' ? 'Publish attempted — see the queue for per-platform results.' : 'Saved to the queue.');
      await load();
    } catch (e) {
      setError(e.message || 'Could not save the post.');
    } finally {
      setSaving(false);
    }
  };

  const postAction = async (id, action) => {
    setError('');
    try {
      if (action === 'delete') await http.del(`/api/admin/social/posts/${id}`);
      else await http.post(`/api/admin/social/posts/${id}/${action}`, {});
      await load();
    } catch (e) { setError(e.message || 'Action failed.'); }
  };

  // Per-platform retry: retries ONE target (facebook / instagram /
  // youtube) without touching the post's other platforms. The server
  // refuses published targets, so this can never double-post.
  const [retrying, setRetrying] = useState('');
  const retryTarget = async (postId, platform) => {
    const key = `${postId}:${platform}`;
    setRetrying(key);
    setError('');
    setNotice('');
    try {
      // A single target's publish can take most of a minute (Instagram
      // processing polls) — give it more than the 30s default, capped
      // under the host's ~60s request termination.
      const res = await http.post(`/api/admin/social/posts/${postId}/targets/${platform}/retry`, {}, { timeout: 55000 });
      if (res.post) setPosts((ps) => ps.map((p) => (p.id === res.post.id ? res.post : p)));
      if (res.target?.status === 'published') {
        setNotice(`${platform}: published.`);
      } else if (res.target) {
        setError(`${platform} retry did not publish (${res.target.status})${res.target.error ? `: ${res.target.error}` : ''}`);
      }
    } catch (e) {
      setError(e.message || `${platform} retry failed.`);
      await load();
    } finally {
      setRetrying('');
    }
  };

  const saveAutopilot = async (next) => {
    setAutopilot(next);
    try {
      const res = await http.put('/api/admin/social/autopilot', next);
      setAutopilot(res.autopilot);
    } catch (e) { setError(e.message || 'Could not save autopilot settings.'); }
  };

  const connectedByPlatform = (p) => accounts.filter((a) => a.platform === p && a.status !== 'disconnected');

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-3 mb-1">
          <Share2 className="w-6 h-6" />
          <h1 className="text-xl font-bold">Social Scheduler</h1>
          <button type="button" onClick={load} className="ml-auto btn px-3 py-1.5 text-sm flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
        <p className="text-sm mb-5" style={{ color: 'var(--color-ink-secondary)' }}>
          This panel is only the control room — posts are published natively on Facebook, Instagram and
          YouTube through their official APIs. Nothing is posted on shiarishta.com itself.
        </p>

        {error && (
          <p role="alert" className="mb-4 text-sm px-3 py-2 rounded" style={{ background: '#fdecec', color: 'var(--color-danger)' }}>
            {error}
          </p>
        )}
        {notice && (
          <p className="mb-4 text-sm px-3 py-2 rounded" style={{ background: '#e9f7ee', color: 'var(--color-success, #1a7f37)' }}>
            {notice}
          </p>
        )}

        {/* ── Publisher heartbeat ──────────────────────────────
            The 2026-11-22 outage was silent for ~19h because nothing
            showed whether the publisher was even running. This line is
            that missing instrument: green when fresh, red when the
            last run is over 15 minutes old. */}
        {publisher && (
          publisher.stale ? (
            <p role="alert" className="mb-4 text-sm px-3 py-2 rounded flex items-center gap-2" style={{ background: '#fdecec', color: 'var(--color-danger)' }}>
              <AlertTriangle className="w-4 h-4" />
              Publisher last ran {publisher.ageSeconds == null ? 'never (no heartbeat recorded)' : `${Math.floor(publisher.ageSeconds / 60)} min ago`}
              {' '}— publishing may be stalled. Posts will not go out until the publisher runs again.
            </p>
          ) : (
            <p className="mb-4 text-xs" style={{ color: 'var(--color-ink-secondary)' }}>
              Publisher last ran {publisher.ageSeconds < 60 ? 'just now' : `${Math.floor(publisher.ageSeconds / 60)} min ago`}
              {publisher.ok ? '' : ' (that run reported an error)'} · {publisher.processed} target(s) processed.
            </p>
          )
        )}

        {/* ── Needs attention: watchdog dead-letter ──────────── */}
        {deadTargets.length > 0 && (
          <div role="alert" className="mb-4 text-sm px-3 py-2 rounded" style={{ background: '#fdecec', color: 'var(--color-danger)' }}>
            <p className="font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Needs attention: {deadTargets.length} target(s) failed permanently after repeated retries
            </p>
            <ul className="mt-1 space-y-1">
              {deadTargets.map((d) => (
                <li key={`${d.postId}:${d.platform}`} className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{d.platform}</span>
                  <span>· {d.caption}{d.scheduledAt ? ` · scheduled ${fmtDate(d.scheduledAt)}` : ''}</span>
                  {d.error && <span>· {String(d.error).slice(0, 160)}</span>}
                  <button
                    type="button"
                    className="underline disabled:opacity-40"
                    disabled={retrying === `${d.postId}:${d.platform}`}
                    onClick={() => retryTarget(d.postId, d.platform)}
                  >
                    {retrying === `${d.postId}:${d.platform}` ? 'Retrying…' : 'Retry'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Connected accounts ─────────────────────────────── */}
        <h2 className="font-bold mb-2">Connected accounts</h2>
        <div className="grid sm:grid-cols-3 gap-3 mb-6">
          {Object.entries(PLATFORM_META).map(([platform, { label, Icon }]) => {
            const list = connectedByPlatform(platform);
            const configured = platform === 'youtube' ? config.googleConfigured : config.metaConfigured;
            return (
              <div key={platform} className="border rounded p-3" style={{ borderColor: 'var(--color-border)' }}>
                <p className="flex items-center gap-2 font-semibold text-sm"><Icon className="w-4 h-4" /> {label}</p>
                {list.length === 0 && (
                  <>
                    <p className="text-xs mt-2" style={{ color: 'var(--color-ink-secondary)' }}>
                      {configured ? 'Not connected yet.' : 'Not configured on the server yet — see the build report for the owner steps.'}
                    </p>
                    <button type="button" disabled={!configured} onClick={() => connect(platform === 'youtube' ? 'youtube' : 'meta')}
                      className="btn px-3 py-1.5 text-sm mt-2 flex items-center gap-2 disabled:opacity-40">
                      <Plug className="w-4 h-4" /> Connect
                    </button>
                    {platform === 'instagram' && (
                      <p className="text-xs mt-1" style={{ color: 'var(--color-ink-secondary)' }}>
                        Instagram connects through the Facebook Page (linked IG account is discovered automatically).
                      </p>
                    )}
                  </>
                )}
                {list.map((a) => (
                  <div key={a.id} className="mt-2 text-sm">
                    <p className="font-medium">{a.accountName || a.platformAccountId}</p>
                    <p className="text-xs" style={{ color: 'var(--color-ink-secondary)' }}>
                      Status: {a.status}{a.consecutiveFailures > 0 ? ` · ${a.consecutiveFailures} consecutive failure(s)` : ''}
                    </p>
                    {a.status === 'needs_attention' && (
                      <p className="text-xs flex items-center gap-1 mt-1" style={{ color: 'var(--color-danger)' }}>
                        <AlertTriangle className="w-3.5 h-3.5" /> Needs attention — autopilot skips this account.
                        <button type="button" className="underline ml-1" onClick={() => reactivate(a.id)}>I checked it — reactivate</button>
                      </p>
                    )}
                    <button type="button" onClick={() => disconnect(a.id)} className="text-xs mt-1 flex items-center gap-1 opacity-70 hover:opacity-100">
                      <Trash2 className="w-3.5 h-3.5" /> Disconnect
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* ── Autopilot ──────────────────────────────────────── */}
        {autopilot && (
          <div className="border rounded p-4 mb-6" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5" />
              <h2 className="font-bold">Autopilot</h2>
              <label className="ml-auto flex items-center gap-2 text-sm font-semibold">
                <Power className="w-4 h-4" />
                {autopilot.enabled ? 'ON' : 'OFF (kill switch)'}
                <input
                  type="checkbox"
                  checked={!!autopilot.enabled}
                  onChange={(e) => saveAutopilot({ ...autopilot, enabled: e.target.checked })}
                />
              </label>
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--color-ink-secondary)' }}>
              Mostly reels: finished 1080×1920 videos are generated on the Muse side (ShortSmash) and fed in
              hourly through the ingest endpoint. If no reel is waiting for an hour, the server fills the slot
              with a text/image post. Turning this OFF halts generation and ingest immediately.
              YouTube is capped at 6/day by default — the YouTube Data API default quota (10,000 units/day,
              ~1,600 per upload) allows roughly 6 uploads a day.
            </p>
            <div className="grid sm:grid-cols-3 gap-3 mt-3">
              {Object.entries(PLATFORM_META).map(([platform, { label }]) => {
                const cfg = autopilot.platforms?.[platform] || { enabled: false, dailyCap: 0 };
                return (
                  <div key={platform} className="text-sm border rounded p-3" style={{ borderColor: 'var(--color-border)' }}>
                    <label className="flex items-center gap-2 font-medium">
                      <input
                        type="checkbox"
                        checked={!!cfg.enabled}
                        onChange={(e) => saveAutopilot({
                          ...autopilot,
                          platforms: { ...autopilot.platforms, [platform]: { ...cfg, enabled: e.target.checked } },
                        })}
                      />
                      {label}
                    </label>
                    <label className="flex items-center gap-2 mt-2 text-xs" style={{ color: 'var(--color-ink-secondary)' }}>
                      Daily cap
                      <input
                        type="number" min="0" max="100" value={cfg.dailyCap}
                        className="input px-2 py-1 text-sm" style={{ width: 70 }}
                        onChange={(e) => saveAutopilot({
                          ...autopilot,
                          platforms: { ...autopilot.platforms, [platform]: { ...cfg, dailyCap: Number(e.target.value) } },
                        })}
                      />
                      / day
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Settings: publishing limits ────────────────────── */}
        {settings && (
          <div className="border rounded p-4 mb-6" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-center gap-2">
              <Gauge className="w-5 h-5" />
              <h2 className="font-bold">Settings — Publishing limits</h2>
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--color-ink-secondary)' }}>
              Daily caps enforced by the publisher (New York day). A post that reaches a cap is deferred to
              the next day — never failed. Changes apply immediately, no deploy needed. For Instagram and
              YouTube, an empty cap or 0 means no cap.
            </p>
            <div className="grid sm:grid-cols-3 gap-3 mt-3">
              <div className="text-sm border rounded p-3" style={{ borderColor: 'var(--color-border)' }}>
                <p className="font-medium">Facebook</p>
                <label className="flex items-center gap-2 mt-2 text-xs" style={{ color: 'var(--color-ink-secondary)' }}>
                  Cap
                  <input type="number" min="0" max="100" value={fbDraft.cap}
                    className="input px-2 py-1 text-sm" style={{ width: 70 }}
                    onChange={(e) => setFbDraft({ ...fbDraft, cap: e.target.value })} />
                  / day
                </label>
                <label className="flex items-center gap-2 mt-2 text-xs" style={{ color: 'var(--color-ink-secondary)' }}>
                  Test window ends
                  <input type="date" value={fbDraft.until}
                    className="input px-2 py-1 text-sm"
                    onChange={(e) => setFbDraft({ ...fbDraft, until: e.target.value })} />
                </label>
                <p className="text-xs mt-2" style={{ color: 'var(--color-ink-secondary)' }}>
                  {settings.fbCap.usedToday} published today · {settings.fbCap.active ? 'cap active' : 'window ended — no cap in force (set cap 0 to switch off)'}
                </p>
              </div>
              <div className="text-sm border rounded p-3" style={{ borderColor: 'var(--color-border)' }}>
                <p className="font-medium">Instagram</p>
                <label className="flex items-center gap-2 mt-2 text-xs" style={{ color: 'var(--color-ink-secondary)' }}>
                  Cap
                  <input type="number" min="0" max="100" value={capDraft.instagram} placeholder="No cap"
                    className="input px-2 py-1 text-sm" style={{ width: 70 }}
                    onChange={(e) => setCapDraft({ ...capDraft, instagram: e.target.value })} />
                  / day
                </label>
                <p className="text-xs mt-2" style={{ color: 'var(--color-ink-secondary)' }}>
                  {settings.dailyCaps.instagram.usedToday} published today
                </p>
              </div>
              <div className="text-sm border rounded p-3" style={{ borderColor: 'var(--color-border)' }}>
                <p className="font-medium">YouTube</p>
                <label className="flex items-center gap-2 mt-2 text-xs" style={{ color: 'var(--color-ink-secondary)' }}>
                  Cap
                  <input type="number" min="0" max="100" value={capDraft.youtube} placeholder="No cap"
                    className="input px-2 py-1 text-sm" style={{ width: 70 }}
                    onChange={(e) => setCapDraft({ ...capDraft, youtube: e.target.value })} />
                  / day
                </label>
                <p className="text-xs mt-2" style={{ color: 'var(--color-ink-secondary)' }}>
                  {settings.dailyCaps.youtube.usedToday} published today
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--color-warning, #9a6700)' }}>
                  {settings.dailyCaps.youtube.quotaNote}
                </p>
              </div>
            </div>
            <button type="button"
              onClick={() => saveSettings({
                fbCap: { cap: Number(fbDraft.cap), until: fbDraft.until },
                dailyCaps: {
                  instagram: capDraft.instagram === '' ? null : Number(capDraft.instagram),
                  youtube: capDraft.youtube === '' ? null : Number(capDraft.youtube),
                },
              }, 'Publishing limits saved.')}
              className="btn px-3 py-1.5 text-sm mt-3 flex items-center gap-2">
              <Save className="w-4 h-4" /> Save limits
            </button>
          </div>
        )}

        {/* ── Settings: scheduling ───────────────────────────── */}
        {settings && (
          <div className="border rounded p-4 mb-6" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              <h2 className="font-bold">Settings — Scheduling</h2>
            </div>
            <label className="block text-xs mt-3" style={{ color: 'var(--color-ink-secondary)' }}>
              Posting slot times (UTC, 24h, comma-separated — e.g. 14:00, 18:00, 22:00). Ingested and
              autopilot posts are assigned the next free slot. Leave empty for the default hourly slots.
              <input type="text" value={slotDraft} placeholder="Hourly (default)"
                className="input w-full px-2 py-1 text-sm mt-1"
                onChange={(e) => setSlotDraft(e.target.value)} />
            </label>
            <button type="button"
              onClick={() => saveSettings({ slots: slotDraft.split(',').map((s) => s.trim()).filter(Boolean) }, 'Slot times saved.')}
              className="btn px-3 py-1.5 text-sm mt-2 flex items-center gap-2">
              <Save className="w-4 h-4" /> Save slot times
            </button>
            <p className="text-xs mt-4 mb-2" style={{ color: 'var(--color-ink-secondary)' }}>
              Publishing pause — a paused platform's posts wait (pending) until it is unpaused; nothing fails.
            </p>
            <div className="flex flex-wrap gap-3">
              {Object.entries(PLATFORM_META).map(([platform, { label }]) => (
                <label key={platform} className="flex items-center gap-2 text-sm border rounded px-2.5 py-1.5" style={{ borderColor: 'var(--color-border)' }}>
                  <input type="checkbox" checked={!!settings.paused[platform]}
                    onChange={(e) => saveSettings({ paused: { ...settings.paused, [platform]: e.target.checked } }, `${label} ${e.target.checked ? 'paused' : 'resumed'}.`)} />
                  Pause {label}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* ── Settings: automation rules ─────────────────────── */}
        {settings && (
          <div className="border rounded p-4 mb-6" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5" />
              <h2 className="font-bold">Settings — Automation rules</h2>
            </div>
            <label className="block text-xs mt-3" style={{ color: 'var(--color-ink-secondary)' }}>
              Automatic first comment on Facebook / Instagram
              <select value={settings.firstCommentMode}
                className="input w-full px-2 py-1 text-sm mt-1"
                onChange={(e) => saveSettings({ firstCommentMode: e.target.value }, 'First-comment mode saved.')}>
                <option value="stored">Stored comment, hook question as fallback</option>
                <option value="hook">Hook question only</option>
                <option value="off">Off — no automatic comment</option>
              </select>
            </label>
            <div className="flex flex-wrap items-end gap-3 mt-3">
              <label className="text-xs" style={{ color: 'var(--color-ink-secondary)' }}>
                Retry max attempts
                <input type="number" min="1" max="20" value={retryDraft.maxAttempts}
                  className="input px-2 py-1 text-sm block mt-1" style={{ width: 80 }}
                  onChange={(e) => setRetryDraft({ ...retryDraft, maxAttempts: e.target.value })} />
              </label>
              <label className="text-xs" style={{ color: 'var(--color-ink-secondary)' }}>
                Backoff base (minutes — delays scale 5/15/30/60/120 from this base)
                <input type="number" min="1" max="120" value={retryDraft.backoffMinutes}
                  className="input px-2 py-1 text-sm block mt-1" style={{ width: 80 }}
                  onChange={(e) => setRetryDraft({ ...retryDraft, backoffMinutes: e.target.value })} />
              </label>
              <button type="button"
                onClick={() => saveSettings({ retry: { maxAttempts: Number(retryDraft.maxAttempts), backoffMinutes: Number(retryDraft.backoffMinutes) } }, 'Retry policy saved.')}
                className="btn px-3 py-1.5 text-sm flex items-center gap-2">
                <Save className="w-4 h-4" /> Save retry policy
              </button>
            </div>
          </div>
        )}

        {/* ── Settings: storage & lifecycle ──────────────────── */}
        {settings && (
          <div className="border rounded p-4 mb-6" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-center gap-2">
              <HardDrive className="w-5 h-5" />
              <h2 className="font-bold">Settings — Storage &amp; lifecycle</h2>
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--color-ink-secondary)' }}>
              {settings.storage.usedBytes != null
                ? `Media on server: ${(settings.storage.usedBytes / 1073741824).toFixed(2)} GB of ${(settings.storage.budgetBytes / 1073741824).toFixed(2)} GB budget (${settings.storage.usedPct}%).`
                : 'Media usage unavailable.'}
              {' '}Published files are purged after the delay below; the platforms keep the content.
            </p>
            <div className="flex flex-wrap items-end gap-3 mt-3">
              <label className="text-xs" style={{ color: 'var(--color-ink-secondary)' }}>
                Storage budget (GB — empty = default 2 GB)
                <input type="number" min="0.1" max="100" step="0.1" value={storageDraft.budgetGiB} placeholder="2"
                  className="input px-2 py-1 text-sm block mt-1" style={{ width: 90 }}
                  onChange={(e) => setStorageDraft({ ...storageDraft, budgetGiB: e.target.value })} />
              </label>
              <label className="text-xs" style={{ color: 'var(--color-ink-secondary)' }}>
                Purge after publish (hours)
                <input type="number" min="0.5" max="720" step="0.5" value={storageDraft.purgeHours}
                  className="input px-2 py-1 text-sm block mt-1" style={{ width: 90 }}
                  onChange={(e) => setStorageDraft({ ...storageDraft, purgeHours: e.target.value })} />
                <span className="block mt-1">0.5 = 30 minutes</span>
              </label>
              <button type="button"
                onClick={() => saveSettings({ storage: { budgetGiB: storageDraft.budgetGiB === '' ? null : Number(storageDraft.budgetGiB), purgeHours: Number(storageDraft.purgeHours) } }, 'Storage settings saved.')}
                className="btn px-3 py-1.5 text-sm flex items-center gap-2">
                <Save className="w-4 h-4" /> Save storage settings
              </button>
            </div>
          </div>
        )}

        {/* ── Settings: safety & visibility ──────────────────── */}
        {settings && (
          <div className="border rounded p-4 mb-6" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5" />
              <h2 className="font-bold">Settings — Safety &amp; visibility</h2>
            </div>
            <p className="text-xs mt-2 font-semibold">Account token health</p>
            {settings.accounts.length === 0 && (
              <p className="text-xs mt-1" style={{ color: 'var(--color-ink-secondary)' }}>No accounts connected.</p>
            )}
            {settings.accounts.map((a) => (
              <div key={a.id} className="text-sm mt-2 flex flex-wrap items-center gap-2">
                <span className="font-medium">{(PLATFORM_META[a.platform]?.label) || a.platform}: {a.accountName || '—'}</span>
                <span className="text-xs" style={{ color: 'var(--color-ink-secondary)' }}>status {a.status}</span>
                {a.tokenHealth === 'ok' && (
                  <span className="text-xs" style={{ color: 'var(--color-success, #1a7f37)' }}>
                    Token OK — expires {fmtDate(a.tokenExpiresAt)} ({a.tokenDaysLeft} days left)
                  </span>
                )}
                {a.tokenHealth === 'expiring' && (
                  <span className="text-xs flex items-center gap-1" style={{ color: 'var(--color-warning, #9a6700)' }}>
                    <AlertTriangle className="w-3.5 h-3.5" /> Token expiring — {a.tokenDaysLeft} days left ({fmtDate(a.tokenExpiresAt)}). Reconnect soon.
                  </span>
                )}
                {a.tokenHealth === 'expired' && (
                  <span className="text-xs flex items-center gap-1" style={{ color: 'var(--color-danger)' }}>
                    <AlertTriangle className="w-3.5 h-3.5" /> Token EXPIRED {fmtDate(a.tokenExpiresAt)} — reconnect this account.
                  </span>
                )}
                {a.tokenHealth === 'unknown' && (
                  <span className="text-xs" style={{ color: 'var(--color-ink-secondary)' }}>Token expiry not tracked for this account.</span>
                )}
              </div>
            ))}
            <p className="text-xs mt-4 font-semibold flex items-center gap-1"><History className="w-3.5 h-3.5" /> Recent activity</p>
            {activity.length === 0 && (
              <p className="text-xs mt-1" style={{ color: 'var(--color-ink-secondary)' }}>No activity yet.</p>
            )}
            <div className="mt-1">
              {activity.map((ev, i) => (
                <div key={i} className="text-xs py-1.5 border-b flex flex-wrap gap-x-2" style={{ borderColor: 'var(--color-border)' }}>
                  <span style={{ color: 'var(--color-ink-secondary)' }}>{fmtDate(ev.at)}</span>
                  <span className="font-medium">{(PLATFORM_META[ev.platform]?.label) || ev.platform}</span>
                  <span style={STATUS_STYLE[ev.type] || {}}>{ev.type}</span>
                  <span>{ev.reason}</span>
                  {ev.url && <a href={ev.url} target="_blank" rel="noreferrer" className="underline">view</a>}
                  {ev.caption && <span style={{ color: 'var(--color-ink-secondary)' }}>“{ev.caption}…”</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Composer ───────────────────────────────────────── */}
        <h2 className="font-bold mb-2">New post</h2>
        <div className="border rounded p-4 mb-6" style={{ borderColor: 'var(--color-border)' }}>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Caption — for YouTube, the first line becomes the video title."
            className="input w-full px-3 py-2 text-sm"
            rows={4}
          />
          <button type="button" className="text-xs underline mt-1" onClick={() => setShowOverrides((v) => !v)}>
            {showOverrides ? 'Hide' : 'Add'} a YouTube-specific title/description
          </button>
          {showOverrides && (
            <textarea
              value={overrides.youtube}
              onChange={(e) => setOverrides({ youtube: e.target.value })}
              placeholder="YouTube override (first line = title)"
              className="input w-full px-3 py-2 text-sm mt-2"
              rows={3}
            />
          )}
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <label className="btn px-3 py-1.5 text-sm cursor-pointer">
              {uploading ? 'Uploading…' : media ? `Media: ${media.mediaType} attached` : 'Attach image or video'}
              <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm" className="hidden" onChange={onMedia} />
            </label>
            {media && (
              <button type="button" className="text-xs underline" onClick={() => setMedia(null)}>Remove media</button>
            )}
            <span className="text-xs" style={{ color: 'var(--color-ink-secondary)' }}>
              One vertical video (1080×1920) publishes as IG Reel + FB Reel + YouTube Short.
            </span>
          </div>
          <div className="flex flex-wrap gap-3 mt-3">
            {accounts.filter((a) => a.status !== 'disconnected').map((a) => {
              const { Icon } = PLATFORM_META[a.platform] || {};
              return (
                <label key={a.id} className="flex items-center gap-2 text-sm border rounded px-2.5 py-1.5" style={{ borderColor: 'var(--color-border)' }}>
                  <input
                    type="checkbox"
                    checked={!!selected[a.id]}
                    onChange={(e) => setSelected((s) => ({ ...s, [a.id]: e.target.checked }))}
                  />
                  {Icon && <Icon className="w-4 h-4" />}
                  {a.accountName || a.platform}
                  {a.status === 'needs_attention' && <AlertTriangle className="w-3.5 h-3.5" style={{ color: 'var(--color-danger)' }} />}
                </label>
              );
            })}
            {accounts.length === 0 && (
              <span className="text-sm" style={{ color: 'var(--color-ink-secondary)' }}>Connect an account above first.</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="input px-3 py-1.5 text-sm"
            />
            <button type="button" disabled={saving || !caption.trim()} onClick={() => submit('schedule')} className="btn px-3 py-1.5 text-sm flex items-center gap-2 disabled:opacity-40">
              <Clock className="w-4 h-4" /> Schedule
            </button>
            <button type="button" disabled={saving || !caption.trim()} onClick={() => submit('now')} className="btn px-3 py-1.5 text-sm flex items-center gap-2 disabled:opacity-40">
              <Send className="w-4 h-4" /> Post now
            </button>
            <button type="button" disabled={saving || !caption.trim()} onClick={() => submit('draft')} className="btn px-3 py-1.5 text-sm flex items-center gap-2 disabled:opacity-40">
              <Save className="w-4 h-4" /> Save draft
            </button>
          </div>
        </div>

        {/* ── Queue ──────────────────────────────────────────── */}
        <h2 className="font-bold mb-2">Queue</h2>
        <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
          {posts.map((p) => (
            <div key={p.id} className="py-3">
              <p className="text-sm whitespace-pre-wrap break-words">{p.caption.slice(0, 280)}{p.caption.length > 280 ? '…' : ''}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--color-ink-secondary)' }}>
                <span style={STATUS_STYLE[p.status] || {}} className="font-semibold">{p.status}</span>
                {' · '}{p.source}
                {p.mediaType ? ` · ${p.mediaType}` : ' · text'}
                {p.scheduledAt ? ` · scheduled ${fmtDate(p.scheduledAt)}` : ''}
              </p>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {p.targets.map((t) => (
                  <span key={t.id} className="text-xs border rounded-full px-2 py-0.5" style={{ borderColor: 'var(--color-border)' }}>
                    {t.platform}: <span style={STATUS_STYLE[t.status] || {}} className="font-semibold">{t.status}</span>
                    {t.platformUrl && (
                      <> · <a href={t.platformUrl} target="_blank" rel="noreferrer" className="underline">view live post</a></>
                    )}
                    {t.error && <span style={{ color: 'var(--color-danger)' }}> · {t.error.slice(0, 120)}</span>}
                    {t.status !== 'published' && (
                      <button
                        type="button"
                        className="underline ml-1 disabled:opacity-40"
                        disabled={retrying === `${p.id}:${t.platform}`}
                        onClick={() => retryTarget(p.id, t.platform)}
                      >
                        {retrying === `${p.id}:${t.platform}` ? 'Retrying…' : 'Retry'}
                      </button>
                    )}
                  </span>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                {!['published', 'publishing'].includes(p.status) && (
                  <button type="button" className="btn px-2.5 py-1 text-xs" onClick={() => postAction(p.id, 'publish-now')}>Post now</button>
                )}
                {p.targets.some((t) => t.status === 'failed') && (
                  <button type="button" className="btn px-2.5 py-1 text-xs" onClick={() => postAction(p.id, 'retry')}>Retry failed</button>
                )}
                {p.status !== 'publishing' && (
                  <button type="button" className="btn px-2.5 py-1 text-xs" onClick={() => postAction(p.id, 'delete')}>Delete</button>
                )}
              </div>
            </div>
          ))}
          {posts.length === 0 && (
            <p className="py-6 text-sm text-center" style={{ color: 'var(--color-ink-secondary)' }}>Nothing queued yet.</p>
          )}
        </div>
      </div>
    </Layout>
  );
}
