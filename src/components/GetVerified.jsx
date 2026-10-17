import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, Camera, ShieldCheck, Users } from 'lucide-react';
import { api } from '../lib/api/client';
import { useAuth } from '../lib/auth/AuthContext';

const MAX_BYTES = 1_500_000;

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

// Get verified — the member submits a selfie or ID photo; a human reviews it.
// Approval is what turns on the public verified badge on their profile.
export default function GetVerified() {
  const { user } = useAuth();
  const [kind, setKind] = useState('selfie');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [mine, setMine] = useState([]);
  const fileRef = useRef(null);

  const loadMine = () => api.myVerifications().then(setMine).catch(() => {});
  useEffect(() => { loadMine(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setSubmitted('');
    const file = fileRef.current?.files?.[0];
    if (!file) { setError('Choose a photo first.'); return; }
    if (file.size > MAX_BYTES) { setError('Photo must be under 1.5 MB.'); return; }
    setBusy(true);
    try {
      const imageBase64 = await fileToBase64(file);
      await api.submitVerification({ kind, imageBase64 });
      setSubmitted('Submitted — a person on our team reviews it, usually within a day. You keep using Shia Rishta meanwhile.');
      if (fileRef.current) fileRef.current.value = '';
      loadMine();
    } catch (err) {
      setError(err.message || 'Could not submit.');
    } finally {
      setBusy(false);
    }
  };
  const statusColor = (s) => (s === 'approved' ? 'var(--color-primary)' : s === 'rejected' ? 'var(--color-danger, #c0392b)' : 'var(--color-ink-faint)');

  return (
    <div className="pt-2 space-y-4">
      <div className="p-4 rounded-xl" style={{ background: 'var(--color-primary-subtle)', border: '1px solid var(--color-border)' }}>
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--color-primary)' }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--color-ink)' }}>Get the verified badge</p>
            <p className="text-xs mt-1" style={{ color: 'var(--color-ink-secondary)' }}>
              {user?.emailVerified === false
                ? 'Verify your email first — check your inbox for the link we sent at sign-up.'
                : 'Send a clear selfie or your ID photo. A person reviews every submission — no bots, no face-scoring, and your photos are never shown to other members.'}
            </p>
          </div>
        </div>
      </div>

      {user?.emailVerified !== false && (
        <form onSubmit={submit} className="space-y-3">
          <div className="flex gap-2">
            {[{ v: 'selfie', label: 'Selfie', icon: Camera }, { v: 'id_document', label: 'ID document', icon: BadgeCheck }].map((o) => {
              const Icon = o.icon;
              return (
                <button key={o.v} type="button" onClick={() => setKind(o.v)}
                  className={kind === o.v ? 'button primary' : 'button'}
                  style={kind === o.v ? {} : { background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-ink-secondary)' }}>
                  <Icon className="w-4 h-4 inline mr-1" /> {o.label}
                </button>
              );
            })}
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="input w-full text-sm"
            style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }} aria-label="Verification photo" />
          <button type="submit" disabled={busy} className="button primary px-5 py-2 text-sm font-semibold">
            {busy ? 'Submitting…' : 'Submit for review'}
          </button>
        </form>
      )}
      {submitted && <p className="text-sm" style={{ color: 'var(--color-primary)' }}>{submitted}</p>}
      {error && <p className="text-sm" style={{ color: 'var(--color-danger, #c0392b)' }}>{error}</p>}

      {mine.length > 0 && (
        <ul className="space-y-2">
          {mine.map((v) => (
            <li key={v.id} className="flex items-center justify-between text-sm p-3 rounded-lg" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <span style={{ color: 'var(--color-ink-secondary)' }}>{v.kind === 'selfie' ? 'Selfie' : 'ID document'} · {new Date(v.created_at).toLocaleDateString()}</span>
              <span className="text-xs font-semibold" style={{ color: statusColor(v.status) }}>
                {v.status === 'approved' ? 'Verified ✓' : v.status === 'rejected' ? (v.review_note || 'Rejected — please resubmit') : 'In review'}
              </span>
            </li>
          ))}
        </ul>
      )}

    </div>
  );
}
