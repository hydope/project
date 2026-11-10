import { useEffect, useState } from 'react';
import { Link2, Copy, Check, Trash2, Plus } from 'lucide-react';
import { http } from '../lib/api/transport';
import ConfirmDialog from './ConfirmDialog';

// Wali (guardian) invite links — the member generates a read-only link for a
// family member, and can revoke it at any time. Listed here with revoke UI.
export default function WaliLinks() {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');
  const [revoking, setRevoking] = useState(null); // token awaiting confirmation
  const [revokeBusy, setRevokeBusy] = useState(false);
  const [restoring, setRestoring] = useState(null); // token being restored

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await http.get('/api/wali/link');
      setLinks(data.links || []);
    } catch (e) {
      setError(e.message || 'Could not load guardian links.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    setCreating(true);
    setError('');
    try {
      await http.post('/api/wali/link', {});
      await load();
    } catch (e) {
      setError(e.message || 'Could not create link.');
    } finally {
      setCreating(false);
    }
  };

  const revoke = async () => {
    if (!revoking) return;
    setRevokeBusy(true);
    setError('');
    try {
      await http.del(`/api/wali/link/${encodeURIComponent(revoking)}`);
      setRevoking(null);
      await load();
    } catch (e) {
      setError(e.message || 'Could not revoke link.');
    } finally {
      setRevokeBusy(false);
    }
  };

  // Restore a revoked link within 24h of revocation (2026-11-10,
  // external-audit fixes). After 24h the link is gone for good and the
  // member generates a fresh one instead.
  const restore = async (token) => {
    setRestoring(token);
    setError('');
    try {
      await http.post(`/api/wali/link/${encodeURIComponent(token)}/restore`, {});
      await load();
    } catch (e) {
      setError(e.message || 'Could not restore link.');
    } finally {
      setRestoring(null);
    }
  };

  const copy = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      setError('Could not copy — please copy the link manually.');
    }
  };

  return (
    <div className="pt-6 border-t border-line/10">
      <h3 className="text-base font-semibold text-ink mb-1 flex items-center gap-2">
        <Link2 className="w-4 h-4" /> Guardian (Wali) Links
      </h3>
      <p className="text-sm text-muted mb-4">
        Share a read-only view of your profile with a family member or wali.
        They see your profile — never your messages or contact details.
        Only you can revoke a link — the person holding it cannot. A revoked
        link can be restored within 24 hours; after that it is gone for good.
      </p>

      {error && <p className="text-sm text-danger mb-3">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : links.length === 0 ? (
        <p className="text-sm text-muted mb-3">No guardian links yet.</p>
      ) : (
        <div className="space-y-2 mb-4">
          {links.map((l) => (
            <div
              key={l.token}
              className={`flex items-center gap-2 p-3 rounded-lg border ${l.revoked ? 'opacity-50' : ''}`}
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-elevated)' }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-mono truncate text-muted">{l.url}</p>
                <p className="text-[11px] text-muted">
                  Created {new Date(l.createdAt).toLocaleDateString()}
                  {l.revoked && (
                    l.restorable
                      ? ` — revoked. Restore available until ${new Date(new Date(l.revokedAt).getTime() + 24 * 3600 * 1000).toLocaleString()}`
                      : ' — revoked. Restore window has passed; generate a new link instead.'
                  )}
                </p>
              </div>
              {l.revoked ? (
                l.restorable && (
                  <button
                    onClick={() => restore(l.token)}
                    disabled={restoring === l.token}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                    style={{ background: 'var(--color-primary)', color: '#fff' }}
                  >
                    {restoring === l.token ? 'Restoring…' : 'Restore access'}
                  </button>
                )
              ) : (
                <>
                  <button
                    onClick={() => copy(l.url)}
                    className="p-2 rounded-lg hover:bg-black/5"
                    title="Copy link"
                  >
                    {copied === l.url ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => setRevoking(l.token)}
                    className="p-2 rounded-lg hover:bg-black/5 text-danger"
                    title="Revoke link"
                    aria-label="Revoke guardian link"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <button
        onClick={create}
        disabled={creating}
        className="button primary px-4 py-2 text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
      >
        <Plus className="w-4 h-4" />
        {creating ? 'Creating…' : 'Generate guardian link'}
      </button>

      {revoking && (
        <ConfirmDialog
          title="Revoke guardian link?"
          message="The person with this link will lose access to your profile immediately. You can restore access within 24 hours; after that the link is gone for good and you will need to generate a new one."
          confirmLabel="Revoke link"
          danger
          busy={revokeBusy}
          onConfirm={revoke}
          onCancel={() => { if (!revokeBusy) setRevoking(null); }}
        />
      )}
    </div>
  );
}
