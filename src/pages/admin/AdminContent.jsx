import { useState, useEffect, useCallback } from 'react';
import Layout from '@/layouts/MainLayout';
import { http } from '@/lib/api/transport';
import { Sparkles, RefreshCw, Calendar, Send, Trash2, FileText, Eye } from 'lucide-react';

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
      });
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
          <button onClick={load} disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-elevated text-muted border border-line/20 hover:border-line/40 disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </header>

        {error && (
          <div className="mb-4 rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger">{error}</div>
        )}
        {flash && (
          <div className="mb-4 rounded-xl border border-success/30 bg-success/5 p-3 text-sm text-success">{flash}</div>
        )}

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