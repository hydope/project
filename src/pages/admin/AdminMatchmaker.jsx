import { useState, useEffect } from 'react';
import Layout from '@/layouts/AdminLayout';
import { http } from '@/lib/api/transport';
import { usePageTitle } from '@/lib/usePageTitle';
import { HeartHandshake, Check, X, Clock } from 'lucide-react';

export default function AdminMatchmaker() {
  usePageTitle('Matchmaker Queue');
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await http.get('/api/admin/matchmaker');
      setQueue(r.queue || []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const act = async (id, action) => {
    setBusy(id + action);
    try {
      await http.post(`/api/admin/matchmaker/${id}/${action}`, {});
      await load();
    } catch (e) {
      alert(e.message || 'Failed.');
    }
    setBusy(null);
  };

  return (
    <Layout>
      <div className="flex items-center gap-3 mb-1">
        <HeartHandshake className="w-6 h-6" style={{ color: '#388bfd' }} />
        <h1 className="text-xl font-bold" style={{ color: '#f0f6fc' }}>Matchmaker Queue</h1>
      </div>
      <p className="text-sm mb-6" style={{ color: '#8b949e' }}>
        Submissions not reviewed within 7 days are deleted automatically.
      </p>

      {loading ? (
        <p style={{ color: '#8b949e' }}>Loading…</p>
      ) : queue.length === 0 ? (
        <div className="rounded-xl p-8 text-center" style={{ background: '#161b22', border: '1px solid #21262d' }}>
          <p style={{ color: '#8b949e' }}>No pending submissions.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {queue.map(q => (
            <div key={q.id} className="rounded-xl p-5" style={{ background: '#161b22', border: '1px solid #21262d' }}>
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <p className="font-bold" style={{ color: '#f0f6fc' }}>{q.payload.display_name}</p>
                  <p className="text-xs" style={{ color: '#8b949e' }}>
                    {q.payload.age ? q.payload.age + ' · ' : ''}{q.payload.gender || ''} {q.payload.city ? '· ' + q.payload.city : ''}
                    {' '}· submitted by {q.submitter_email || 'member'}
                  </p>
                  <p className="text-xs mt-1 flex items-center gap-1" style={{ color: '#d29922' }}>
                    <Clock className="w-3 h-3" /> {q.expires_in_days} day{q.expires_in_days === 1 ? '' : 's'} left before auto-delete
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button disabled={busy} onClick={() => act(q.id, 'approve')}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"
                    style={{ background: '#238636', color: '#fff' }}>
                    <Check className="w-3 h-3" /> Approve
                  </button>
                  <button disabled={busy} onClick={() => { if (confirm('Reject and delete this submission?')) act(q.id, 'reject'); }}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"
                    style={{ background: '#da3633', color: '#fff' }}>
                    <X className="w-3 h-3" /> Reject
                  </button>
                </div>
              </div>
              {q.payload.bio && <p className="text-sm mb-2" style={{ color: '#c9d1d9' }}>{q.payload.bio}</p>}
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs" style={{ color: '#8b949e' }}>
                {['profession', 'education_level', 'marital_status', 'country', 'contact_note'].map(k =>
                  q.payload[k] ? <p key={k}><span className="font-semibold">{k.replace(/_/g, ' ')}:</span> {q.payload[k]}</p> : null
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
