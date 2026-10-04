import { useState, useEffect } from 'react';
import Layout from '@/layouts/MainLayout';
import { useToast } from '@lib/useToast';
import { http, useRemote } from '@lib/api/transport';

// Admin: grant the matchmaker or guardian role. Matchmakers can only draft
// women; guardians draft male family members. Revoking returns a member to the
// plain role — their existing drafts stay theirs but no new ones.
// Placeholder until a real member is picked, so a mis-typed uid can never be
// submitted against the wrong account.
// The member's uid is a 36-character UUID that appears nowhere a human can see.
// This page used to ask admins to paste it, which guaranteed wrong-account
// mistakes. A searchable picker makes the id an implementation detail: you pick
// a person by name, the id follows.
function MemberPicker({ value, onChange, label, busy }) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const t = term.trim();
    if (t.length < 2) { setResults([]); return undefined; }
    let alive = true;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const data = await http.get(`/api/admin/users?q=${encodeURIComponent(t)}&limit=8`);
        if (alive) setResults(data.rows || []);
      } catch {
        if (alive) setResults([]);
      } finally {
        if (alive) setSearching(false);
      }
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [term]);

  if (value) {
    return (
      <div>
        <span className="block mb-1.5 text-sm font-medium" style={{ color: 'var(--color-ink-secondary)' }}>{label}</span>
        <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
          style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
          <div className="min-w-0">
            <p className="text-sm font-semibold" style={{ color: 'var(--color-ink)' }}>{value.display_name}</p>
            <p className="text-xs" style={{ color: 'var(--color-ink-secondary)' }}>{value.email} · currently {value.role}</p>
          </div>
          <button type="button" onClick={() => { onChange(''); setTerm(''); setResults([]); }}
            className="text-xs font-semibold flex-shrink-0" style={{ color: 'var(--color-ink-secondary)' }}>Change</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={`picker-${label}`} className="block mb-1.5 text-sm font-medium"
        style={{ color: 'var(--color-ink-secondary)' }}>{label}</label>
      <input id={`picker-${label}`} value={term} onChange={(e) => setTerm(e.target.value)}
        placeholder="Search by name or email" className="input w-full"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
        autoComplete="off" disabled={busy} />
      {(searching || results.length > 0) && (
        <ul className="mt-1 max-h-56 overflow-y-auto rounded-lg border divide-y"
          style={{ background: 'var(--color-elevated)', borderColor: 'var(--color-border)' }}>
          {searching && <li className="px-3 py-2 text-xs" style={{ color: 'var(--color-ink-secondary)' }}>Searching…</li>}
          {results.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => { onChange(r.id); setTerm(''); setResults([]); }}
                className="w-full px-3 py-2 text-left transition-colors hover:bg-[var(--color-hover)]">
                <p className="text-sm font-semibold" style={{ color: 'var(--color-ink)' }}>{r.display_name}</p>
                <p className="text-xs" style={{ color: 'var(--color-ink-secondary)' }}>{r.email} · {r.role}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
      {term.trim().length >= 2 && !searching && results.length === 0 && (
        <p className="text-xs mt-1" style={{ color: 'var(--color-ink-secondary)' }}>No member matched "{term.trim()}".</p>
      )}
    </div>
  );
}

export default function AdminRoles() {
  const [pickedRole, setPickedRole] = useState(null);
  const [role, setRole] = useState('matchmaker');
  const [busy, setBusy] = useState(false);
  const [pickedBlock, setPickedBlock] = useState(null);
  const [blockBusy, setBlockBusy] = useState(false);
  const { addToast } = useToast();

  const assign = async (e) => {
    e.preventDefault();
    if (!pickedRole) return;
    setBusy(true);
    try {
      if (!useRemote) throw new Error('Role assignment needs the live backend.');
      await http.post(`/api/admin/users/${encodeURIComponent(pickedRole.id)}/role`, { role });
      addToast(`${pickedRole.display_name} is now ${role}. They see it on their next load.`, 'success');
      setPickedRole(null);
    } catch (err) {
      addToast(err.message || 'Could not assign the role.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout>
      <main>
        <h1>Grant introducer roles</h1>
        <p>
          The member's uid is on their profile URL or any admin user listing. <strong>matchmaker</strong> introduces women only;
          <strong> guardian</strong> introduces male family members. Members can never self-promote — this is the only door.
        </p>

        <form onSubmit={assign} className="settings-list" style={{ maxWidth: 640 }}>
          <div className="toggle-row" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: 1, display: 'grid', gap: 12 }}>
              <div>
                <MemberPicker value={pickedRole} onChange={setPickedRole} label="Member" busy={busy} />
              </div>
              <div>
                <label htmlFor="role-kind" className="block mb-1.5 text-sm font-medium" style={{ color: 'var(--color-ink-secondary)' }}>Role</label>
                <select id="role-kind" value={role} onChange={(e) => setRole(e.target.value)} className="input w-full" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
                  <option value="matchmaker">matchmaker — drafts women only</option>
                  <option value="guardian">guardian — family drafts (male + female)</option>
                  <option value="member">member — revoke introducer access</option>
                </select>
              </div>
            </div>
            <button type="submit" disabled={busy || !pickedRole} className="button primary px-5 py-2 font-semibold text-sm">
              {busy ? 'Assigning…' : 'Assign role'}
            </button>
          </div>
        </form>

        {/* ── Moderation: unflag / unblock a member ───────────────────────────
            Reverses a block set by the Safety-reports "Hide + action" flow
            (profiles.is_blocked = 1). Idempotent; 404 for unknown members. */}
        <h2 style={{ marginTop: '36px' }}>Unblock a member</h2>
        <p>
          A blocked member's profile is invisible to everyone. Unblocking restores
          their profile immediately — their data is never deleted.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!pickedBlock) return;
            setBlockBusy(true);
            try {
              if (!useRemote) throw new Error('Unblocking needs the live backend.');
              await http.post(`/api/admin/users/${encodeURIComponent(pickedBlock.id)}/unblock`, {});
              addToast(`${pickedBlock.display_name} was unblocked. Their profile is visible again.`, 'success');
              setPickedBlock(null);
            } catch (err) {
              addToast(err.message || 'Could not unblock this member.', 'error');
            } finally {
              setBlockBusy(false);
            }
          }}
          className="settings-list"
          style={{ maxWidth: 640 }}
        >
          <div className="toggle-row" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <MemberPicker value={pickedBlock} onChange={setPickedBlock} label="Member" busy={blockBusy} />
            </div>
            <button type="submit" disabled={blockBusy || !pickedBlock} className="button primary px-5 py-2 font-semibold text-sm">
              {blockBusy ? 'Unblocking…' : 'Unblock account'}
            </button>
          </div>
        </form>
      </main>
    </Layout>
  );
}
