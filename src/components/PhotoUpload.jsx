import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api/client';
import { useAuth } from '../lib/auth/AuthContext';
import { useAuthedImage } from '../lib/api/useAuthedImage';
import { Upload, Trash2, Loader2 } from 'lucide-react';

const MAX_BYTES = 5_000_000;
const ACCEPT = ['image/jpeg', 'image/png', 'image/webp'];

// Uploads the member's own photo to the server. The checks here are for fast
// feedback only - the server re-validates the real bytes, so a client-side check
// is never what stands between a payload and disk.
export default function PhotoUpload() {
  const { user } = useAuth();
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const inputRef = useRef(null);
  const hasLoadedOnce = useRef(false);
  const [bust, setBust] = useState(0);
  // The preview must be fetched with the bearer token, like every other photo:
  // a plain <img src> cannot send Authorization and would 401 on a private tier.
  const { url: photoUrl } = useAuthedImage(photo, bust);

  const loadPhoto = async () => {
    // Background refreshes (after upload/remove) must not flash a loading
    // state over a photo the user can already see — only the first load may.
    const firstLoad = !hasLoadedOnce.current;
    if (firstLoad) setLoading(true);
    setLoadError(false);
    try {
      const p = await api.getProfile('me');
      setPhoto(p?.photo ?? null);
      hasLoadedOnce.current = true;
    } catch {
      // A failed fetch is NOT "no photo" — it is an unknown state. Showing
      // "Upload a photo" here would be a lie that hides the real problem.
      if (firstLoad) setLoadError(true);
    } finally {
      if (firstLoad) setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await loadPhoto();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, bust]);

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';               // allow re-picking the same file
    if (!file) return;
    setMsg(''); setErr('');

    if (!ACCEPT.includes(file.type)) {
      setErr('Please choose a JPEG, PNG or WebP image.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setErr('That photo is over 5 MB. Please choose a smaller one.');
      return;
    }

    setBusy(true);
    try {
      await api.uploadPhoto(file);
      // Verify the photo actually persisted before claiming success: a
      // "Photo uploaded." message for a photo the server did not keep is a
      // false success, which is worse than an honest error.
      const me = await api.getProfile('me').catch(() => null);
      if (me?.photo) {
        setPhoto(me.photo);
        setBust((b) => b + 1);           // bust any cached copy
        setMsg('Photo uploaded.');
      } else {
        setErr('The upload reached the server but the photo did not save. Please try again.');
      }
    } catch (ex) {
      setErr(ex?.message || 'Could not upload that photo.');
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async () => {
    setBusy(true); setMsg(''); setErr('');
    try {
      await api.deletePhoto();
      setPhoto(null);
      setBust((b) => b + 1);
      setMsg('Photo removed.');
    } catch (ex) {
      setErr(ex?.message || 'Could not remove your photo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <div
        className="w-24 h-24 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        {loading ? (
          <span className="text-xs text-muted px-2 text-center animate-pulse">Loading…</span>
        ) : loadError ? (
          <button type="button" onClick={loadPhoto} className="text-xs underline px-2 text-center" style={{ color: 'var(--color-primary)' }}>
            Couldn’t load — retry
          </button>
        ) : photoUrl ? (
          <img src={photoUrl} alt="Your photo" className="w-full h-full object-cover" />
        ) : (
          <span className="text-xs text-muted px-2 text-center">No photo</span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
            className="button primary px-4 py-2 text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {loading ? 'Loading…' : photo ? 'Replace photo' : 'Upload a photo'}
          </button>
          {photo && (
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

      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onPick} className="hidden" />
    </div>
  );
}