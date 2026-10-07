import { useState, useEffect, useCallback } from 'react';
import Layout from '@/layouts/MainLayout';
import { http } from '@/lib/api/transport';
import { Sparkles, RefreshCw, Calendar, Send, Trash2, FileText, Eye, KeyRound, ShieldCheck, Loader2 } from 'lucide-react';

/**
 * Admin content desk — AI-drafted blog posts with scheduling.
 *
 * Generated content is a draft, never a publish. An AI-drafted article about
 * marriage guidance goes live to real readers, so a human reads it, edits it and
 * decides when. The generator saves nothing on its own: it returns a draft into
 * the editor, and only an explicit save writes a row.
 */

const STATUS_TONE = {
  draft: 'text-muted bg-hover',
  scheduled: 'text-warning bg-warning/10',
  published: 'text-success bg-success/10',
};
/**
 * AI credential panel.
 *
 * Lets an operator repair a broken NVIDIA key without shell access to the host.
 * The API only ever reports PRESENCE and SOURCE — never the stored value — so
 * this form is write-only by design: you can replace a key, you cannot read one
 * back. That matters because an admin session is exactly where a credential
 * would otherwise get copied into a screenshot or a browser cache.
 */
function AiSettingsPanel({ onChanged }) {
  const [status, setStatus] = useState(null);
  const [keyInput, setKeyInput] = useState('');
  const [modelInput, setModelInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [msg, setMsg] = useState(null);
  const [open, setOpen] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await http.get('/api/admin/ai-settings'));
    } catch (e) {
      setMsg({ ok: false, text: e?.message || 'Could not read AI settings.' });
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const save = async (e) => {
    e.preventDefault();
    const body = {};
    // An empty box means "leave it alone" — not "clear it". Clearing is an
    // explicit button so a stray keystroke can't wipe a working credential.
    if (keyInput.trim()) body.apiKey = keyInput.trim();
    if (modelInput.trim()) body.model = modelInput.trim();
    if (!Object.keys(body).length) {
      setMsg({ ok: false, text: 'Enter a key or a model id first.' });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const res = await http.put('/api/admin/ai-settings', body);
      setKeyInput('');
      setModelInput('');
      setMsg({ ok: true, text: `Saved. Credential is now coming from ${res.source === 'admin-panel' ? 'this panel' : 'the environment'}.` });
      await loadStatus();
      onChanged?.();
    } catch (e) {
      setMsg({ ok: false, text: e?.message || 'Could not save.' });
    } finally {
      setSaving(false);
    }
  };

  const clearKey = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await http.put('/api/admin/ai-settings', { apiKey: '' });
      setKeyInput('');
      setMsg({ ok: true, text: 'Panel key removed. Falling back to the environment variable.' });
      await loadStatus();
      onChanged?.();
    } catch (e) {
      setMsg({ ok: false, text: e?.message || 'Could not clear.' });
    } finally {
      setSaving(false);
    }
  };

  const verify = async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      setVerifyResult(await http.post('/api/admin/ai-settings/verify', {}));
    } catch (e) {
      setVerifyResult({ ok: false, status: 0, detail: e?.message || 'Verification request failed.' });
    } finally {
      setVerifying(false);
      await loadStatus();
    }
  };

  const sourceTone = {
    'admin-panel': 'bg-success/10 text-success',
    environment: 'bg-warning/10 text-warning',
    missing: 'bg-danger/10 text-danger',
  };
  const sourceLabel = {
    'admin-panel': 'Configured here',
    environment: 'From environment',
    missing: 'Not configured',
  };

  return (
    <section className="rounded-xl border border-line/20 bg-elevated p-5 mb-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-ink mb-1 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-primary" /> AI assistant connection
          </h2>
          <p className="text-xs text-muted">
            The assistant answers from retrieved platform facts even with no key, but content
            drafting needs a live model. Keys are encrypted at rest and can never be read back
            from this page.
          </p>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-elevated text-muted border border-line/20 hover:border-line/40"
        >
          {open ? 'Hide' : 'Configure'}
        </button>
      </div>

      {/* Status line — always visible so a broken integration is diagnosable
          without opening the form. */}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        <span className={`px-2 py-1 rounded-full font-semibold ${sourceTone[status?.source] || 'bg-hover text-muted'}`}>
          {status?.available ? (sourceLabel[status?.source] || 'Configured') : 'Not configured'}
        </span>
        {status?.masked && (
          <code className="px-2 py-1 rounded bg-hover text-muted" title="Stored key — write only">{status.masked}</code>
        )}
        <span className="text-muted">Model: <code className="text-ink">{status?.model || '—'}</code></span>
        {status?.keyFingerprint && (
          <span className="text-muted" title="SHA-256 prefix of the key currently in use. Not the key itself. After rotating a compromised key, this value must change.">
            Active key: <code className="text-ink">#{status.keyFingerprint}</code>
          </span>
        )}
        {status?.lastStatus && <span className="text-muted">Last check: {status.lastStatus}</span>}
        {!status?.available && (
          <span className="text-danger">
            Drafting is disabled. Paste a key below to turn it on.
          </span>
        )}
      </div>
      {open && (
        <AiSettingsForm
          status={status} keyInput={keyInput} setKeyInput={setKeyInput}
          modelInput={modelInput} setModelInput={setModelInput}
          saving={saving} verifying={verifying} verifyResult={verifyResult} msg={msg}
          onSave={save} onVerify={verify} onClear={clearKey}
        />
      )}
    </section>
  );
}


export default function AdminContent() {
  const [posts, setPosts] = useState([]);
  const [available, setAvailable] = useState(true);
  const [aiReady, setAiReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');

  const [topic, setTopic] = useState('');
  const [angle, setAngle] = useState('');
  const [draft, setDraft] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [scheduledFor, setScheduledFor] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [list, status] = await Promise.all([
        http.get('/api/ai/posts'),
        http.get('/api/ai/status').catch(() => ({ available: false })),
      ]);
      setPosts(list.rows || []);
      setAvailable(list.available !== false);
      // `available` means a credential is CONFIGURED, not that the model
      // answers. The two diverge — a reasoning model can accept every request
      // and still return no text — which is why the panel also offers "Test
      // connection", a real end-to-end completion. Gating the form on
      // `available` is right: it only blocks when there is no key at all.
      setAiReady(!!status?.available);
    } catch (e) {
      setError(e?.message || 'Could not load posts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const generate = async (e) => {
    e.preventDefault();
    if (!topic.trim() || generating) return;
    setGenerating(true);
    setError('');
    setFlash('');
    try {
      const res = await http.post('/api/ai/generate-post', {
        topic: topic.trim(),
        angle: angle.trim() || undefined,
      }, { timeout: 55000 });
      setDraft(res.draft);
      setFlash('Draft ready. Read it, edit anything, then save.');
    } catch (err) {
      setError(err?.message || 'The writer could not draft that.');
    } finally {
      setGenerating(false);
    }
  };

  const save = async (status) => {
    if (!draft) return;
    setBusy(true);
    setError('');
    try {
      await http.post('/api/ai/posts', {
        draft: { ...draft, status, scheduledFor: scheduledFor || undefined },
      });
      setDraft(null);
      setTopic('');
      setAngle('');
      setScheduledFor('');
      setFlash(status === 'published'
        ? 'Published — it is live on the blog now.'
        : status === 'scheduled'
          ? 'Scheduled. It goes live automatically at that time.'
          : 'Saved as a draft.');
      await load();
    } catch (err) {
      setError(err?.message || 'Could not save that post.');
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (id, status) => {
    setBusy(true);
    setError('');
    try {
      await http.put(`/api/ai/posts/${id}`, { status });
      await load();
    } catch (err) {
      setError(err?.message || 'Could not change that post.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    setBusy(true);
    setError('');
    try {
      await http.del(`/api/ai/posts/${id}`);
      await load();
    } catch (err) {
      setError(err?.message || 'Could not delete that post.');
    } finally {
      setBusy(false);
    }
  };

  const autoSchedule = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await http.post('/api/ai/posts/auto-schedule', { count: 7 });
      setFlash(res?.count
        ? `Scheduled ${res.count} draft${res.count === 1 ? '' : 's'}, one per day.`
        : 'No drafts to schedule — write or generate some first.');
      await load();
    } catch (err) {
      setError(err?.message || 'Could not auto-schedule.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <header className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-ink">Content</h1>
            <p className="text-sm text-muted mt-1">
              Draft, schedule and publish articles. Nothing goes live without you.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={autoSchedule} disabled={busy}
              title="Schedule draft posts automatically, one per day"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-elevated text-muted border border-line/20 hover:border-line/40 disabled:opacity-50">
              <Calendar className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} /> Auto-schedule 1/day
            </button>
            <button onClick={load} disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-elevated text-muted border border-line/20 hover:border-line/40 disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger">{error}</div>
        )}
        {flash && (
          <div className="mb-4 rounded-xl border border-success/30 bg-success/5 p-3 text-sm text-success">{flash}</div>
        )}

<AiSettingsPanel onChanged={load} />


        <section className="rounded-xl border border-line/20 bg-elevated p-5 mb-8">
          <h2 className="text-base font-bold text-ink mb-1 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> Write with AI
          </h2>
          <p className="text-xs text-muted mb-4">
            {aiReady
              ? 'Give a topic. It returns a full draft you can edit before anything is saved.'
              : 'No API key is configured, so drafting is unavailable. Publishing and scheduling still work below.'}
          </p>

          <form onSubmit={generate} className="space-y-3">
            <div>
              <label htmlFor="topic" className="block text-sm font-semibold text-ink mb-1.5">Topic</label>
              <input id="topic" value={topic} onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Talking to family about marriage expectations" className="input w-full"
                disabled={!aiReady || generating} required />
            </div>
            <div>
              <label htmlFor="angle" className="block text-sm font-semibold text-ink mb-1.5">Angle (optional)</label>
              <input id="angle" value={angle} onChange={(e) => setAngle(e.target.value)}
                placeholder="e.g. keep it practical, avoid quoting scripture" className="input w-full"
                disabled={!aiReady || generating} />
            </div>
            <button type="submit" disabled={!aiReady || generating || !topic.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white disabled:opacity-50">
              <Sparkles className={`w-4 h-4 ${generating ? 'animate-pulse' : ''}`} />
              {generating ? 'Writing…' : 'Draft article'}
            </button>
          </form>
        </section>
        {draft && (
          <section className="rounded-xl border border-primary/30 bg-primary/5 p-5 mb-8">
            <h2 className="text-base font-bold text-ink mb-3">Review the draft</h2>
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              className="input w-full font-semibold mb-2" aria-label="Draft title" />
            <div className="flex flex-wrap gap-2 mb-3 text-xs">
              <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                className="input" aria-label="Category">
                {['Guidance', 'Safety', 'Community', 'Profiles'].map((c) => <option key={c}>{c}</option>)}
              </select>
              <input value={draft.readTime} onChange={(e) => setDraft({ ...draft, readTime: e.target.value })}
                className="input w-24" aria-label="Read time" />
              <span className="self-center text-muted">{draft.body.length} blocks</span>
            </div>
            <textarea value={draft.excerpt} onChange={(e) => setDraft({ ...draft, excerpt: e.target.value })}
              className="input w-full mb-3" rows={2} aria-label="Excerpt" />

            <div className="max-h-72 overflow-y-auto rounded-lg border border-line/20 bg-elevated p-4 mb-4 space-y-3">
              {draft.body.map((b, i) => (
                b.t === 'h2'
                  ? <h3 key={i} className="text-sm font-bold text-ink">{b.x}</h3>
                  : <p key={i} className="text-sm text-muted leading-relaxed">{b.x}</p>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <input type="datetime-local" value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                className="input" aria-label="Schedule for" />
              <button onClick={() => save('scheduled')} disabled={busy || !scheduledFor}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-line/30 text-muted disabled:opacity-50">
                <Calendar className="w-3.5 h-3.5" /> Schedule
              </button>
              <button onClick={() => save('published')} disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-primary text-white disabled:opacity-50">
                <Send className="w-3.5 h-3.5" /> Publish now
              </button>
              <button onClick={() => save('draft')} disabled={busy}
                className="px-3 py-2 rounded-lg text-xs font-semibold border border-line/30 text-muted disabled:opacity-50">
                Save as draft
              </button>
              <button onClick={() => setDraft(null)}
                className="px-3 py-2 rounded-lg text-xs font-semibold text-muted hover:text-ink">Discard</button>
            </div>
          </section>
        )}

        <section>
          <h2 className="text-base font-bold text-ink mb-3">Posts</h2>
          {!available ? (
            <p className="text-sm text-muted">Post storage is not available on this database yet.</p>
          ) : loading && !posts.length ? (
            <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
          ) : !posts.length ? (
            <div className="empty-state">
              <div className="text-muted mb-3 flex justify-center"><FileText className="w-12 h-12" /></div>
              <h3 className="empty-state-title">No posts yet</h3>
              <p className="empty-state-text">Write one above and it will appear here as a draft you can schedule.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {posts.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line/20 bg-elevated p-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink truncate">{p.title}</p>
                    <p className="text-xs text-muted truncate">
                      {p.category} · {p.read_time}
                      {p.status === 'scheduled' && p.scheduled_for && ` · goes live ${String(p.scheduled_for).slice(0, 16)}`}
                      {p.status === 'published' && p.published_at && ` · published ${String(p.published_at).slice(0, 10)}`}
                    </p>
                  </div>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${STATUS_TONE[p.status] || STATUS_TONE.draft}`}>
                    {p.status}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {p.status !== 'published' && (
                      <button onClick={() => setStatus(p.id, 'published')} disabled={busy}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-primary text-white disabled:opacity-50">Publish</button>
                    )}
                    {p.status === 'published' && (
                      <a href={`/blog/${p.slug}`} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-line/30 text-muted">
                        <Eye className="w-3.5 h-3.5" /> View
                      </a>
                    )}
                    <button onClick={() => remove(p.id)} disabled={busy}
                      aria-label={`Delete ${p.title}`}
                      className="p-1.5 rounded-lg text-muted hover:text-danger disabled:opacity-50">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </Layout>
  );
}

/** The expandable form half of AiSettingsPanel. Split out to keep each
 *  component readable, and so the status summary can render collapsed. */
function AiSettingsForm({ status, keyInput, setKeyInput, modelInput, setModelInput,
                          saving, verifying, verifyResult, msg, onSave, onVerify, onClear }) {
  return (
    <form onSubmit={onSave} className="mt-4 pt-4 border-t border-line/20 space-y-4">
      <div>
        <label htmlFor="ai-key" className="block text-sm font-semibold text-ink mb-1.5">
          NVIDIA API key
        </label>
        <input
          id="ai-key"
          type="password"
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          placeholder={status?.available ? 'Enter a new key to replace the current one' : 'nvapi-…'}
          className="input w-full font-mono text-sm"
          autoComplete="off"
          spellCheck={false}
          disabled={saving}
        />
        <p className="text-[11px] text-muted mt-1">
          Write-only. Saving replaces the stored key — there is no way to read it back, by design.
        </p>
      </div>

      <div>
        <label htmlFor="ai-model" className="block text-sm font-semibold text-ink mb-1.5">
          Model id <span className="font-normal text-muted">(optional)</span>
        </label>
        <input
          id="ai-model"
          type="text"
          value={modelInput}
          onChange={(e) => setModelInput(e.target.value)}
          placeholder={status?.model || 'vendor/model-name'}
          className="input w-full font-mono text-sm"
          spellCheck={false}
          disabled={saving}
        />
        <p className="text-[11px] text-muted mt-1">
          Leave blank to keep the current model. Every parameter you send must be one your model
          supports — an unsupported parameter is rejected outright rather than ignored.
        </p>
      </div>

      {msg && (
        <div
          role="status"
          className={`rounded-lg border p-2.5 text-xs ${
            msg.ok ? 'border-success/30 bg-success/5 text-success' : 'border-danger/30 bg-danger/5 text-danger'
          }`}
        >
          {msg.text}
        </div>
      )}

      {verifyResult && (
        <div
          role="status"
          className={`rounded-lg border p-2.5 text-xs flex items-start gap-2 ${
            verifyResult.ok ? 'border-success/30 bg-success/5 text-success' : 'border-danger/30 bg-danger/5 text-danger'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>
            {verifyResult.detail}
            {verifyResult.status ? <span className="opacity-70"> (HTTP {verifyResult.status})</span> : null}
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
          Save
        </button>
        <button
          type="button"
          onClick={onVerify}
          disabled={verifying || !status?.available}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-elevated text-ink border border-line/30 disabled:opacity-50"
        >
          {verifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Test connection
        </button>
        {status?.source === 'admin-panel' && (
          <button
            type="button"
            onClick={onClear}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-danger border border-danger/30 disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Remove panel key
          </button>
        )}
      </div>
    </form>
  );
}
