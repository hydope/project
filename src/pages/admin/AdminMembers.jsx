import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import Layout from '@/layouts/AdminLayout';
import { http, apiUrl } from '@/lib/api/transport';
import { Search, Users, RefreshCw, X, ShieldCheck, Ban, History, Mail, Check, Pencil, Upload, Sprout } from 'lucide-react';

/**
 * Member directory â€” searchable, paginated, with a full detail drawer.
 *
 * Replaces AdminRoles, which listed a flat LIMIT 100 of users with no search, so
 * nobody could be found. Search matches email, display name or exact id.
 * Selecting a member loads /api/admin/user/:id, which returns their reports,
 * verifications, interests, prior admin actions and message count in one call.
 */
export default function AdminMembers() {
  const [q, setQ] = useState('');
  const [data, setData] = useState({ rows: [], hasMore: false, count: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [limit, setLimit] = useState(25);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailBusy, setDetailBusy] = useState(false);

  // ?seeded=1 (from the "Seed Members" nav item) filters the directory to
  // synthetic seeder profiles only. Declared BEFORE load(): load() reads
  // seededOnly in its deps array, and a later declaration threw
  // "Cannot access ... before initialization" on every render.
  const [searchParams, setSearchParams] = useSearchParams();
  const seededOnly = searchParams.get('seeded') === '1';
  // Test accounts are hidden by default; admins can reveal them for cleanup.
  const [showTest, setShowTest] = useState(false);

  // Monotonic request id — see load() below.
  const reqId = useRef(0);

  const load = useCallback(async () => {
    // Monotonic request id. Search is debounced, but a slow response for "a" can
    // still land AFTER a fast response for "ali" — without this guard the older
    // result overwrote the newer one and the list showed the wrong members.
    // Only the newest request is allowed to write state.
    const id = ++reqId.current;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (q.trim()) params.set('q', q.trim());
      if (seededOnly) params.set('seeded', '1');
      if (showTest) params.set('include_test', '1');
      const result = await http.get(`/api/admin/users?${params}`);
      if (id !== reqId.current) return; // a newer search already won
      setData(result);
    } catch (e) {
      if (id !== reqId.current) return;
      setError(e?.message || 'Could not load members.');
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [q, limit, seededOnly, showTest]);

  // Debounce so typing does not fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const open = async (row) => {
    setSelected(row);
    setDetail(null);
    setDetailBusy(true);
    try {
      setDetail(await http.get(`/api/admin/user/${row.id}`));
    } catch (e) {
      setError(e?.message || 'Could not load that member.');
    } finally {
      setDetailBusy(false);
    }
  };

  const [blockTarget, setBlockTarget] = useState(null);
  const [blockReason, setBlockReason] = useState('');
  const [blockDuration, setBlockDuration] = useState('permanent');
  const [blockBusy, setBlockBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [editBusy, setEditBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileRef = useRef(null);

  const unblock = async (id) => {
    try {
      await http.post(`/api/admin/users/${id}/unblock`, {});
      await load();
      setDetail(await http.get(`/api/admin/user/${id}`));
    } catch (e) {
      setError(e?.message || 'Could not unblock that member.');
    }
  };

  const confirmBlock = async () => {
    if (!blockTarget) return;
    setBlockBusy(true);
    try {
      await http.post(`/api/admin/users/${blockTarget}/block`, { reason: blockReason, duration: blockDuration });
      setBlockTarget(null); setBlockReason(''); setBlockDuration('permanent');
      await load();
      setDetail(await http.get(`/api/admin/user/${blockTarget}`));
    } catch (e) {
      setError(e?.message || 'Could not block that member.');
    } finally {
      setBlockBusy(false);
    }
  };

  const verifyEmail = async (id) => {
    try {
      await http.post(`/api/admin/users/${id}/verify-email`, {});
      await load();
      setDetail(await http.get(`/api/admin/user/${id}`));
    } catch (e) {
      setError(e?.message || 'Could not verify email.');
    }
  };

  const openEdit = () => {
    const u = detail?.user || {};
    const p = detail?.profile || {};
    setEditForm({
      display_name: u.display_name || selected?.display_name || '',
      city: p.city || '', country: p.country || '', age: p.age || '',
      bio: p.bio || '', profession: p.profession || '',
      education_level: p.education_level || '', marital_status: p.marital_status || '',
      height_cm: p.height_cm || '', photo_url: p.photo_url || '',
      prayer: p.prayer || '', marja: p.marja || '', languages: p.languages || '', sect: p.sect || '',
    });
    setUploadError('');
    setUploadBusy(false);
    if (fileRef.current) fileRef.current.value = '';
    setEditOpen(true);
  };

  // Admin photo upload. Applies immediately server-side (profiles.photo_url is
  // updated and the old uploaded file removed) — the edit form then carries
  // the new photo URL, so Save persists it alongside the other fields.
  const uploadPhoto = async (file) => {
    if (!file || !selected) return;
    setUploadBusy(true);
    setUploadError('');
    try {
      const fd = new FormData();
      fd.append('photo', file);
      const res = await http.upload(`/api/admin/users/${selected.id}/photo`, fd);
      setEditForm((f) => ({ ...f, photo_url: res.photo }));
    } catch (e) {
      setUploadError(e?.message || 'Photo upload failed.');
    } finally {
      setUploadBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const saveEdit = async () => {
    if (!selected) return;
    setEditBusy(true);
    try {
      await http.patch(`/api/admin/users/${selected.id}`, editForm);
      setEditOpen(false);
      await load();
      setDetail(await http.get(`/api/admin/user/${selected.id}`));
    } catch (e) {
      setError(e?.message || 'Could not save changes.');
    } finally {
      setEditBusy(false);
    }
  };

  return (
    <Layout>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <header className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-ink flex items-center gap-2">
              {seededOnly ? 'Seed Members' : 'Members'}
              {seededOnly && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-warning/10 text-warning">
                  <Sprout className="w-3 h-3" /> Seeded profiles
                </span>
              )}
            </h1>
            <p className="text-sm text-muted mt-1">
              {seededOnly ? (
                <>Showing synthetic seeder profiles only. <button onClick={() => setSearchParams({})} className="text-primary hover:underline font-semibold">Show all members</button></>
              ) : (
                'Search by email, display name or member id.'
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!seededOnly && (
              <button onClick={() => setShowTest((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${showTest ? 'border-warning/50 text-warning bg-warning/10' : 'border-line/20 text-muted hover:border-line/40'}`}
                title="QA/test accounts are hidden by default">
                {showTest ? 'Hide test accounts' : 'Show test accounts'}
              </button>
            )}
            <button onClick={load} disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-elevated text-muted border border-line/20 hover:border-line/40 disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          </div>
        </header>

        <div className="relative mb-5">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search members"
            className="input w-full pl-10" aria-label="Search members" />
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-line/20 bg-elevated p-3 text-sm text-muted">{error}</div>
        )}

        {loading && !data.rows.length ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
        ) : !data.rows.length ? (
          <div className="empty-state">
            <div className="text-muted mb-3 flex justify-center"><Users className="w-12 h-12" /></div>
            <h2 className="empty-state-title">No members found</h2>
            <p className="empty-state-text">
              {q ? `Nothing matched "${q}". Try an email, a display name or a full member id.`
                  : 'There are no members yet.'}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-line/20 bg-elevated overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-hover/50">
                <tr className="text-left text-xs text-muted">
                  <th className="px-4 py-3 font-semibold">Member</th>
                  <th className="px-4 py-3 font-semibold">Location</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id} className="border-t border-line/15 hover:bg-hover/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink">
                        {r.display_name}
                        {r.is_seeded && (
                          <span title="Seeded profile" className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-warning/10 text-warning align-middle">seed</span>
                        )}
                        {r.is_test && (
                          <span title="QA/test account" className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-hover text-muted align-middle">test</span>
                        )}
                      </p>
                      <p className="text-xs text-muted flex items-center gap-1"><Mail className="w-3 h-3" />{r.email}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">{[r.city, r.country].filter(Boolean).join(', ') || '-'}</td>
                    <td className="px-4 py-3"><span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-hover">{r.role}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {r.email_verified && <span title="Email verified" className="text-primary"><ShieldCheck className="w-4 h-4" /></span>}
                        {r.id_verified && <span title="ID verified" className="text-success"><ShieldCheck className="w-4 h-4" /></span>}
                        {r.is_blocked && <span title="Blocked" className="text-danger"><Ban className="w-4 h-4" /></span>}
                        {!r.email_verified && !r.id_verified && !r.is_blocked && <span className="text-xs text-muted">Unverified</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => open(r)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-line/30 text-muted hover:border-line/50">
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between mt-4">
          {/* A real total beats "25+": the operator can tell whether the page is showing
              everything or a slice of something much larger. */}
          <p className="text-xs text-muted">
  Showing {data.rows.length}{data.total ? ` of ${data.total}` : ''}{data.hasMore ? ' — more available' : ''}
</p>
          <div className="flex items-center gap-2">
            <button onClick={() => setLimit((l) => Math.max(25, l - 25))} disabled={limit <= 25}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-line/20 text-muted disabled:opacity-40">Fewer</button>
            <button onClick={() => setLimit((l) => l + 25)} disabled={!data.hasMore}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-line/20 text-muted disabled:opacity-40">More</button>
          </div>
        </div>
{selected && (
          <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-label={`Member ${selected.display_name}`}>
            <div className="absolute inset-0" onClick={() => setSelected(null)} />
            <aside className="relative w-full max-w-lg bg-elevated border-l border-line/20 overflow-y-auto p-6">
              <button onClick={() => setSelected(null)} aria-label="Close"
                className="absolute right-4 top-4 text-muted hover:text-ink"><X className="w-5 h-5" /></button>
              <h2 className="text-lg font-bold text-ink pr-8">{detail?.user?.display_name || selected.display_name}</h2>
              <p className="text-xs text-muted mt-0.5 break-all">{detail?.user?.email || selected.email}</p>
              {selected.is_blocked ? (
                <button onClick={() => unblock(selected.id)}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-line/30 text-muted">
                  <Ban className="w-3.5 h-3.5" /> Unblock this member
                </button>
              ) : (
                <button onClick={() => setBlockTarget(selected.id)}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-danger/40 text-danger hover:bg-danger/10">
                  <Ban className="w-3.5 h-3.5" /> Restrict / ban this member
                </button>
              )}
              {!selected.email_verified && (
                <button onClick={() => verifyEmail(selected.id)}
                  className="mt-3 ml-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-line/30 text-muted">
                  <Check className="w-3.5 h-3.5" /> Verify email
                </button>
              )}
              <button onClick={openEdit}
                className="mt-3 ml-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-line/30 text-muted">
                <Pencil className="w-3.5 h-3.5" /> Edit details
              </button>
              {detailBusy && <div className="skeleton h-40 rounded-xl mt-4" />}
              {!detailBusy && detail && (
                <div className="space-y-5 mt-5">
                  {[
                    { label: 'Reports', rows: detail.reports, render: (x) => `${x.reason} (${x.status})` },
                    { label: 'Verifications', rows: detail.verifications, render: (x) => `${x.kind} - ${x.status}` },
                    { label: 'Interests', rows: detail.interests, render: (x) => `${x.from_user_id === selected.id ? 'sent to' : 'received from'} ${x.from_user_id === selected.id ? x.to_user_id : x.from_user_id}` },
                    { label: 'Admin actions on this member', rows: detail.audit, render: (x) => `${x.action} by ${x.actor_email || 'system'}` },
                  ].map(({ label, rows, render }) => (
                    <section key={label}>
                      <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">{label} ({rows.length})</h3>
                      {!rows.length ? <p className="text-xs text-muted">None</p> : (
                        <ul className="space-y-1">
                          {rows.map((x, i) => (
                            <li key={x.id || i} className="text-xs text-ink bg-hover/40 rounded px-2.5 py-1.5 truncate">{render(x)}</li>
                          ))}
                        </ul>
                      )}
                    </section>
                  ))}
                  <section>
                    <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Messages</h3>
                    <p className="text-xs text-muted flex items-center gap-1.5">
                      <History className="w-3.5 h-3.5" />{detail.messageCount} sent or received
                    </p>
                  </section>
                </div>
              )}
            </aside>
          </div>
        )}

        {/* Edit user modal */}
        {editOpen && selected && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-label="Edit member">
            <div className="absolute inset-0 bg-black/60" onClick={() => !editBusy && setEditOpen(false)} />
            <div className="relative rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto" style={{ background: '#161b22', border: '1px solid #21262d' }}>
              <h2 className="text-lg font-bold mb-4" style={{ color: '#f0f6fc' }}>Edit member</h2>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['display_name', 'Display name'], ['city', 'City'], ['country', 'Country'], ['age', 'Age'],
                  ['profession', 'Profession'], ['education_level', 'Education'], ['marital_status', 'Marital status'],
                  ['height_cm', 'Height (cm)'], ['prayer', 'Prayer'], ['marja', 'Marja'], ['languages', 'Languages'], ['sect', 'Sect'],
                ].map(([k, label]) => (
                  <div key={k}>
                    <label className="text-[11px] font-semibold block mb-1" style={{ color: '#8b949e' }}>{label}</label>
                    <input value={editForm[k] || ''} onChange={e => setEditForm(f => ({ ...f, [k]: e.target.value }))}
                      className="w-full rounded-lg px-3 py-2 text-sm"
                      style={{ background: '#0d1117', border: '1px solid #21262d', color: '#f0f6fc' }} />
                  </div>
                ))}
                <div className="col-span-2">
                  <label className="text-[11px] font-semibold block mb-1" style={{ color: '#8b949e' }}>Photo</label>
                  <div className="flex items-start gap-3">
                    {editForm.photo_url ? (
                      <img src={apiUrl(editForm.photo_url)} alt="Member photo"
                        className="w-20 h-20 rounded-xl object-cover flex-shrink-0"
                        style={{ border: '1px solid #21262d' }} />
                    ) : (
                      <div className="w-20 h-20 rounded-xl flex-shrink-0 flex items-center justify-center text-[10px]"
                        style={{ background: '#0d1117', border: '1px dashed #21262d', color: '#8b949e' }}>
                        No photo
                      </div>
                    )}
                    <div className="flex-1">
                      <label
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold cursor-pointer ${uploadBusy ? 'opacity-50 pointer-events-none' : ''}`}
                        style={{ background: '#238636', color: '#fff' }}>
                        <Upload className="w-3.5 h-3.5" />
                        {uploadBusy ? 'Uploading…' : 'Upload new photo'}
                        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp"
                          className="hidden" disabled={uploadBusy}
                          onChange={(e) => uploadPhoto(e.target.files?.[0])} />
                      </label>
                      <p className="text-[11px] mt-1.5" style={{ color: '#8b949e' }}>
                        JPEG, PNG or WebP, under 5 MB. The upload replaces the photo immediately.
                      </p>
                      {uploadError && <p className="text-xs mt-1" style={{ color: '#f85149' }}>{uploadError}</p>}
                    </div>
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="text-[11px] font-semibold block mb-1" style={{ color: '#8b949e' }}>Photo URL</label>
                  <input value={editForm.photo_url || ''} onChange={e => setEditForm(f => ({ ...f, photo_url: e.target.value }))}
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ background: '#0d1117', border: '1px solid #21262d', color: '#f0f6fc' }} />
                </div>
                <div className="col-span-2">
                  <label className="text-[11px] font-semibold block mb-1" style={{ color: '#8b949e' }}>Bio</label>
                  <textarea value={editForm.bio || ''} onChange={e => setEditForm(f => ({ ...f, bio: e.target.value }))} rows={3}
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ background: '#0d1117', border: '1px solid #21262d', color: '#f0f6fc' }} />
                </div>
              </div>
              <div className="flex gap-2 justify-end mt-5">
                <button onClick={() => setEditOpen(false)} disabled={editBusy}
                  className="px-4 py-2 rounded-lg text-xs font-semibold" style={{ color: '#8b949e' }}>Cancel</button>
                <button onClick={saveEdit} disabled={editBusy}
                  className="px-4 py-2 rounded-lg text-xs font-bold" style={{ background: '#238636', color: '#fff' }}>
                  {editBusy ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Block dialog — duration + reason, no window.prompt */}
        {blockTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-label="Restrict member">
            <div className="absolute inset-0 bg-black/60" onClick={() => !blockBusy && setBlockTarget(null)} />
            <div className="relative rounded-2xl p-6 w-full max-w-md" style={{ background: '#161b22', border: '1px solid #21262d' }}>
              <h2 className="text-lg font-bold mb-1" style={{ color: '#f0f6fc' }}>Restrict member</h2>
              <p className="text-xs mb-4" style={{ color: '#8b949e' }}>Temporary restrictions lift automatically. Permanent bans stay until unblocked.</p>
              <label className="text-xs font-semibold block mb-1.5" style={{ color: '#c9d1d9' }}>Duration</label>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {[['24h', '24 hours'], ['7d', '7 days'], ['30d', '30 days'], ['permanent', 'Permanent ban']].map(([v, label]) => (
                  <button key={v} onClick={() => setBlockDuration(v)}
                    className="px-3 py-2 rounded-lg text-xs font-semibold"
                    style={{
                      background: blockDuration === v ? 'rgba(248,81,73,0.15)' : 'transparent',
                      border: blockDuration === v ? '1px solid #f85149' : '1px solid #21262d',
                      color: blockDuration === v ? '#f85149' : '#8b949e',
                    }}>
                    {label}
                  </button>
                ))}
              </div>
              <label className="text-xs font-semibold block mb-1.5" style={{ color: '#c9d1d9' }}>Reason (audit log)</label>
              <textarea value={blockReason} onChange={e => setBlockReason(e.target.value)} rows={3}
                placeholder="e.g. Spam messages reported by 3 members"
                className="w-full rounded-lg px-3 py-2 text-sm mb-4"
                style={{ background: '#0d1117', border: '1px solid #21262d', color: '#f0f6fc' }} />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setBlockTarget(null)} disabled={blockBusy}
                  className="px-4 py-2 rounded-lg text-xs font-semibold" style={{ color: '#8b949e' }}>
                  Cancel
                </button>
                <button onClick={confirmBlock} disabled={blockBusy}
                  className="px-4 py-2 rounded-lg text-xs font-bold" style={{ background: '#da3633', color: '#fff' }}>
                  {blockBusy ? 'Applying…' : blockDuration === 'permanent' ? 'Ban permanently' : 'Restrict'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </Layout>
  );
}