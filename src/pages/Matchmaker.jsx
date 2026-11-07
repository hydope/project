import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../layouts/MainLayout';
import { http } from '../lib/api/transport';
import { useAuthedImage } from '../lib/api/useAuthedImage';
import { useAuth } from '../lib/auth/AuthContext';
import { usePageTitle } from '../lib/usePageTitle';
import { HeartHandshake, Send, Clock, CheckCircle, XCircle, Upload, Loader2, X } from 'lucide-react';

const MAX_BYTES = 5_000_000;
const ACCEPT = ['image/jpeg', 'image/png', 'image/webp'];
const isHttpUrl = (v) => /^https?:\/\//i.test(v || '');
const isServerPath = (v) => Boolean(v) && !isHttpUrl(v);

// The serve endpoint needs the bearer token, which a plain <img src> cannot
// send — fetch the bytes like every other photo (see useAuthedImage).
function AuthedThumb({ path }) {
  const { url, loading } = useAuthedImage(path);
  if (loading) return <span className="text-xs px-2 text-center animate-pulse" style={{ color: 'var(--color-ink-tertiary)' }}>Loading…</span>;
  if (!url) return <span className="text-xs px-2 text-center" style={{ color: 'var(--color-ink-tertiary)' }}>Couldn’t load preview</span>;
  return <img src={url} alt="Submitted photo preview" className="w-full h-full object-cover" />;
}

const FIELDS = [
  { key: 'display_name', label: 'Full name', required: true },
  { key: 'age', label: 'Age', type: 'number' },
  { key: 'gender', label: 'Gender', type: 'select', options: ['', 'male', 'female'] },
  { key: 'city', label: 'City' },
  { key: 'country', label: 'Country' },
  { key: 'profession', label: 'Profession' },
  { key: 'education_level', label: 'Education' },
  { key: 'marital_status', label: 'Marital status' },
  { key: 'photo_url', label: 'Photo URL' },
  { key: 'bio', label: 'About them', type: 'textarea' },
  { key: 'contact_note', label: 'How should interested families reach you?', type: 'textarea' },
];

export default function Matchmaker() {
  usePageTitle('Matchmaker');
  const { isLoggedIn, user } = useAuth();
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [mine, setMine] = useState([]);
  // Uploaded-photo state. photoPreview is what the thumbnail renders: a
  // pasted link as-is, or the authed serve URL for an uploaded file.
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState('');
  const photoInputRef = useRef(null);

  // Matchmaker-role accounts may only list female profiles (enforced
  // server-side too). Don't offer them a "male" option that can only fail —
  // lock the field to female instead.
  const femaleOnly = user?.role === 'matchmaker';
  const fields = FIELDS.map(f => {
    if (f.key === 'gender' && femaleOnly) {
      return { ...f, type: 'static', staticText: 'Female — matchmaker accounts list female profiles only.' };
    }
    return f;
  });

  useEffect(() => {
    if (!isLoggedIn) return;
    http.get('/api/matchmaker/mine').then(r => setMine(r.submissions || [])).catch(() => {});
  }, [isLoggedIn]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Pasting a link and uploading a file both land in photo_url; the preview
  // follows whichever is current. Replacing a pasted link or an earlier
  // upload abandons that file, so remove it server-side — otherwise it sits
  // orphaned on disk with nothing referencing it. Best-effort: a failure
  // here must never block typing.
  const onPhotoUrlChange = (v) => {
    const prev = form.photo_url || '';
    set('photo_url', v);
    if (prev && isServerPath(prev) && prev !== v) {
      http.del('/api/matchmaker/photo', { path: prev }).catch(() => {});
    }
    setPhotoPreview(isHttpUrl(v) ? v : null);
  };

  const onPickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';               // allow re-picking the same file
    if (!file) return;
    setPhotoErr('');

    // Fast feedback only — the server re-validates the real bytes.
    if (!ACCEPT.includes(file.type)) {
      setPhotoErr('Please choose a JPEG, PNG or WebP image.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setPhotoErr('That photo is over 5 MB. Please choose a smaller one.');
      return;
    }

    setPhotoBusy(true);
    try {
      const fd = new FormData();
      fd.append('photo', file, file.name || 'photo.jpg');
      // The server deletes the previous upload so it does not orphan.
      if (isServerPath(form.photo_url)) fd.append('previous_path', form.photo_url);
      const r = await http.upload('/api/matchmaker/photo', fd);
      set('photo_url', r.photo_url);
      setPhotoPreview(r.preview_url);
    } catch (ex) {
      setPhotoErr(ex?.message || 'Could not upload that photo. You can still paste a link above.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const onRemovePhoto = async () => {
    const prev = form.photo_url || '';
    set('photo_url', '');
    setPhotoPreview(null);
    setPhotoErr('');
    if (isServerPath(prev)) {
      try { await http.del('/api/matchmaker/photo', { path: prev }); } catch { /* already gone */ }
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.display_name?.trim()) { setMsg('A name is required.'); return; }
    setBusy(true); setMsg('');
    try {
      // Female-only roles submit female implicitly — the visible field is
      // locked for them, so inject it here instead of trusting the form.
      const payload = femaleOnly ? { ...form, gender: 'female' } : form;
      const r = await http.post('/api/matchmaker', payload);
      setMsg(r.message || 'Submitted.');
      setForm({});
      setPhotoPreview(null);
      setPhotoErr('');
      const updated = await http.get('/api/matchmaker/mine').catch(() => null);
      if (updated) setMine(updated.submissions || []);
    } catch (err) {
      setMsg(err.message || 'Could not submit. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout>
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-2">
          <HeartHandshake className="w-8 h-8" style={{ color: 'var(--color-primary)' }} />
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-ink)' }}>Matchmaker</h1>
        </div>
        <p className="text-sm mb-8" style={{ color: 'var(--color-ink-secondary)' }}>
          Know someone looking for a rishta? Add their profile here. Every submission is
          reviewed by our team — approved profiles go live on the site, and anything
          not reviewed within 7 days is removed automatically.
          <span className="block mt-2 font-semibold">Matchmaker accounts may only list female profiles.</span>
        </p>

        {!isLoggedIn ? (
          <div className="card p-6 text-center">
            <HeartHandshake className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--color-primary)' }} />
            <h2 className="font-bold text-lg mb-2" style={{ color: 'var(--color-ink)' }}>
              Join to submit a profile
            </h2>
            <p className="text-sm mb-5 max-w-md mx-auto" style={{ color: 'var(--color-ink-secondary)' }}>
              Create a free account or sign in, then submit the profile for review.
              Our team reviews every submission — approved profiles go live on the site.
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              <Link to="/auth/register" className="btn btn-primary">
                Sign up free
              </Link>
              <Link to="/auth/login" className="btn btn-ghost">
                Sign in
              </Link>
            </div>
            <p className="text-[11px] mt-4" style={{ color: 'var(--color-ink-tertiary)' }}>
              After signing in you'll be able to fill the form below and submit it for review.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="card p-6 space-y-4 mb-8">
            <h2 className="font-semibold" style={{ color: 'var(--color-ink)' }}>Add a profile</h2>
            {fields.map(f => (
              <div key={f.key}>
                <label htmlFor={`mm-${f.key}`} className="text-xs font-semibold block mb-1" style={{ color: 'var(--color-ink-secondary)' }}>
                  {f.label}{f.required && ' *'}
                </label>
                {f.type === 'static' ? (
                  <p id={`mm-${f.key}`} className="text-sm font-medium py-2" style={{ color: 'var(--color-ink)' }}>{f.staticText}</p>
                ) : f.type === 'textarea' ? (
                  <textarea id={`mm-${f.key}`} value={form[f.key] || ''} onChange={e => set(e.target.value)}
                    rows={3} className="input w-full" />
                ) : f.type === 'select' ? (
                  <select id={`mm-${f.key}`} value={form[f.key] || ''} onChange={e => set(e.target.value)} className="input w-full">
                    {f.options.map(o => <option key={o} value={o}>{o || 'Select…'}</option>)}
                  </select>
                ) : (
                  <input id={`mm-${f.key}`} type={f.type || 'text'} value={form[f.key] || ''} onChange={e => f.key === 'photo_url' ? onPhotoUrlChange(e.target.value) : set(f.key, e.target.value)}
                    className="input w-full" required={f.required} />
                )}
                {f.key === 'photo_url' && (
                  <>
                    <p className="text-[11px] mt-1" style={{ color: 'var(--color-ink-tertiary)' }}>
                      Optional — paste a public link to a photo, or upload one from your device.
                    </p>
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      {photoPreview && (
                        <div className="w-20 h-20 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0"
                          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                          {isHttpUrl(photoPreview) ? (
                            <img src={photoPreview} alt="Submitted photo preview" className="w-full h-full object-cover" />
                          ) : (
                            <AuthedThumb path={photoPreview} />
                          )}
                        </div>
                      )}
                      <div className="flex flex-col gap-1">
                        <div className="flex gap-2">
                          <button type="button" onClick={() => photoInputRef.current?.click()} disabled={photoBusy}
                            className="btn btn-ghost px-3 py-1.5 text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60">
                            {photoBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                            {photoBusy ? 'Uploading…' : photoPreview ? 'Replace photo' : 'Upload a photo'}
                          </button>
                          {photoPreview && (
                            <button type="button" onClick={onRemovePhoto} disabled={photoBusy}
                              className="btn btn-ghost px-3 py-1.5 text-sm font-semibold inline-flex items-center gap-1 disabled:opacity-60">
                              <X className="w-4 h-4" /> Remove
                            </button>
                          )}
                        </div>
                        {photoErr && <p className="text-xs font-medium" style={{ color: 'var(--color-danger, #dc2626)' }} role="alert">{photoErr}</p>}
                      </div>
                      <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onPickPhoto} className="hidden" />
                    </div>
                  </>
                )}
              </div>
            ))}
            {msg && <p className="text-sm" style={{ color: 'var(--color-ink)' }}>{msg}</p>}
            <button type="submit" disabled={busy} className="btn btn-primary">
              <Send className="w-4 h-4" /> {busy ? 'Submitting…' : 'Submit for review'}
            </button>
          </form>
        )}

        {isLoggedIn && mine.length > 0 && (
          <div className="card p-6">
            <h2 className="font-semibold mb-4" style={{ color: 'var(--color-ink)' }}>My submissions</h2>
            <div className="space-y-2">
              {mine.map(s => (
                <div key={s.id} className="flex items-center justify-between py-2"
                  style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <span className="text-sm font-medium" style={{ color: 'var(--color-ink)' }}>{s.display_name}</span>
                  <span className="text-xs flex items-center gap-1" style={{ color: 'var(--color-ink-secondary)' }}>
                    {s.status === 'pending' ? <><Clock className="w-3 h-3" /> Under review</>
                      : s.status === 'approved' ? <><CheckCircle className="w-3 h-3" style={{ color: 'var(--color-success)' }} /> Live</>
                      : <><XCircle className="w-3 h-3" /> {s.status}</>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </Layout>
  );
}
