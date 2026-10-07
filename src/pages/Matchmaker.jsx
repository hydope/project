import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../layouts/MainLayout';
import { http } from '../lib/api/transport';
import { useAuth } from '../lib/auth/AuthContext';
import { usePageTitle } from '../lib/usePageTitle';
import { HeartHandshake, Send, Clock, CheckCircle, XCircle } from 'lucide-react';

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
  const { isLoggedIn } = useAuth();
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [mine, setMine] = useState([]);

  useEffect(() => {
    if (!isLoggedIn) return;
    http.get('/api/matchmaker/mine').then(r => setMine(r.submissions || [])).catch(() => {});
  }, [isLoggedIn]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.display_name?.trim()) { setMsg('A name is required.'); return; }
    setBusy(true); setMsg('');
    try {
      const r = await http.post('/api/matchmaker', form);
      setMsg(r.message || 'Submitted.');
      setForm({});
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
        </p>

        {!isLoggedIn ? (
          <div className="card p-6 text-center">
            <p className="text-sm mb-4" style={{ color: 'var(--color-ink-secondary)' }}>
              Sign in to submit a profile as a matchmaker.
            </p>
            <Link to="/auth/login" className="btn btn-primary">Sign in</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="card p-6 space-y-4 mb-8">
            <h2 className="font-semibold" style={{ color: 'var(--color-ink)' }}>Add a profile</h2>
            {FIELDS.map(f => (
              <div key={f.key}>
                <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--color-ink-secondary)' }}>
                  {f.label}{f.required && ' *'}
                </label>
                {f.type === 'textarea' ? (
                  <textarea value={form[f.key] || ''} onChange={e => set(e.target.value)}
                    rows={3} className="input w-full" />
                ) : f.type === 'select' ? (
                  <select value={form[f.key] || ''} onChange={e => set(e.target.value)} className="input w-full">
                    {f.options.map(o => <option key={o} value={o}>{o || 'Select…'}</option>)}
                  </select>
                ) : (
                  <input type={f.type || 'text'} value={form[f.key] || ''} onChange={e => set(e.target.value)}
                    className="input w-full" required={f.required} />
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
