import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api/client';
import { useAuth } from '../lib/auth/AuthContext';
import { useAuthedImage } from '../lib/api/useAuthedImage';
import { Upload, Trash2, Loader2 } from 'lucide-react';

const MAX_BYTES = 25_000_000;
const MAX_SECONDS = 30;
const ACCEPT = ['video/mp4', 'video/webm'];

// Uploads the member's own profile video to the server (2026-11-10). Same
// discipline as PhotoUpload: the checks here are for fast feedback only —
// the server re-validates the real bytes (sniff, 30s, 25 MB), so a
// client-side check is never what stands between a payload and disk.
export default function VideoUpload() {
  const { user } = useAuth();
  const [video, setVideo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const inputRef = useRef(null);
  const hasLoadedOnce = useRef(false);
  const [bust, setBust] = useState(0);
  // The preview must be fetched with the bearer token, like every other
  // photo: a plain <video src> cannot send Authorization and would 401 on
  // a members tier. The blob URL plays fine as a video source.
  const { url: videoUrl } = useAuthedImage(video, bust);

  const loadVideo = async () => {
    const firstLoad = !hasLoadedOnce.current;
    if (firstLoad) setLoading(true);
    setLoadError(false);
    try {
      const p = await api.getProfile('me');
      setVideo(p?.video ?? null);
      hasLoadedOnce.current = true;
    } catch {
      if (firstLoad) setLoadError(true);
    } finally {
      if (firstLoad) setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await loadVideo();
    })();
    return () => { cancelled = true; };
  }, [user?.uid, bust]);

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';               // allow re-picking the same file
    if (!file) return;
    setMsg(''); setErr('');

    if (!ACCEPT.includes(file.type)) {
      setErr('Please choose an MP4 or WebM video.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setErr('That video is over 25 MB. Please choose a shorter one.');
      return;
    }
    // Duration check before the upload: a too-long clip is refused here,
    // not after 25 MB has crossed the wire.
    const tooLong = await new Promise(resolve => {
      const el = document.createElement('video');
      el.preload = 'metadata';
      el.onloadedmetadata = () => resolve(el.duration > MAX_SECONDS);
      el.onerror = () => resolve(false); // unparseable here — the server decides
      el.src = URL.createObjectURL(file);
    });
    if (tooLong) {
      setErr('Video must be 30 seconds or shorter.');
      return;
    }

    setBusy(true);
    try {
      await api.uploadVideo(file);
      const me = await api.getProfile('me').catch(() => null);
      if (me?.video) {
        setVideo(me.video);
        setBust((b) => b + 1);
        setMsg('Video uploaded.');
      } else {
        setErr('The upload reached the server but the video did not save. Please try again.');
      }
    } catch (ex) {
      setErr(ex?.message || 'Could not upload that video.');
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async () => {
    setBusy(true); setMsg(''); setErr('');
    try {
      await api.deleteVideo();
      setVideo(null);
      setBust((b) => b + 1);
      setMsg('Video removed.');
    } catch (ex) {
      setErr(ex?.message || 'Could not remove your video.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <div
        className="w-24 h-32 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        {loading ? (
          <span className="text-xs text-muted px-2 text-center animate-pulse">Loading…</span>
        ) : loadError ? (
          <button type="button" onClick={loadVideo} className="text-xs underline px-2 text-center" style={{ color: 'var(--color-primary)' }}>
            Couldn’t load — retry
          </button>
        ) : videoUrl ? (
          <video src={videoUrl} controls playsInline preload="metadata" className="w-full h-full object-cover" />
        ) : (
          <span className="text-xs text-muted px-2 text-center">No video</span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
            className="button primary px-4 py-2 text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {loading ? 'Loading…' : video ? 'Replace video' : 'Upload a video'}
          </button>
          {video && (
            <button type="button" onClick={onRemove} disabled={busy}
              className="button px-4 py-2 text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60"
              style={{ border: '1px solid var(--color-border)' }}>
              <Trash2 className="w-4 h-4" /> Remove
            </button>
          )}
        </div>
        {msg && <p className="text-sm text-success font-medium">{msg}</p>}
        {err && <p className="text-sm font-medium" style={{ color: 'var(--color-danger, #dc2626)' }} role="alert">{err}</p>}
      </div>

      <input ref={inputRef} type="file" accept="video/mp4,video/webm" onChange={onPick} className="hidden" />
    </div>
  );
}
