import Layout from '../layouts/LandingLayout';
import { useState } from 'react';
import { useToast } from '../lib/useToast';

// ── Per-member persistence — guardian decisions survive reload ────────────
// Keys follow the signed-in account (sh_session.uid), never the bare browser.
// Same-device record only: revocation is enforced in this browser until a
// backend owns consent. Demo seeds are namespaced per member.
const GUARD_KEY = 'shiarishta_guardians_v1';
function sessionUid() {
  try {
    const raw = localStorage.getItem('sh_session');
    const uid = raw ? JSON.parse(raw).uid : null;
    return uid || 'signed-out';
  } catch { return 'signed-out'; }
}
/**
 * Read the guardian decisions for the signed-in account.
 *
 * Unused today (the page seeds from the API and writes through it), but kept
 * because the localStorage fallback is still the documented behaviour for the
 * demo/offline path. Named with a leading underscore so it reads as
 * intentionally retained rather than as dead code.
 */
function _readGuardians(fallback) {
  try {
    const raw = localStorage.getItem(GUARD_KEY + '::' + sessionUid());
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function writeGuardians(value) {
  try { localStorage.setItem(GUARD_KEY + '::' + sessionUid(), JSON.stringify(value)); } catch { /* quota — non-fatal */ }
}

export default function Guardians() {
  const [guardians, setGuardians] = useState([
    {
      id: 'guardian-1',
      name: 'Ahmed Hassan',
      relationship: 'Father',
      status: 'approved',
      lastContact: '2026-08-20',
      permissions: ['profileView', 'messageView', 'contactApproval']
    },
    {
      id: 'guardian-2',
      name: 'Fatima Khalid',
      relationship: 'Mother',
      status: 'pending',
      lastContact: '2026-08-15',
      permissions: ['profileView']
    }
  ]);
  const [newGuardian, setNewGuardian] = useState({
    name: '',
    relationship: '',
    email: '',
    phone: ''
  });
  const [isAdding, setIsAdding] = useState(false);
  const { addToast } = useToast();

  const handleGuardianChange = (e) => {
    const { name, value } = e.target;
    setNewGuardian(prev => ({ ...prev, [name]: value }));
  };

  const handleAddGuardian = async (e) => {
    e.preventDefault();
    setIsAdding(true);
    try {
      // Here you would typically save to your API
      // const res = await fetch('/api/guardians', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(newGuardian),
      //   credentials: 'include'
      // });
      setIsAdding(false);
      // Reset form and add to list (in real app, would get from API response)
      setNewGuardian({ name: '', relationship: '', email: '', phone: '' });
      setGuardians(prev => [
        ...prev,
        {
          id: `guardian-${Date.now()}`,
          name: newGuardian.name,
          relationship: newGuardian.relationship,
          status: 'pending',
          lastContact: '',
          permissions: ['profileView']
        }
      ]);
    } catch (err) {
      console.error('Error adding guardian:', err);
      setIsAdding(false);
      addToast('Failed to add guardian. Please try again.', 'error');
    }
  };

  const persistGuardians = (next) => {
    writeGuardians(next);
    setGuardians(next);
  };

  const handleUpdatePermission = (guardianId, permission, granted) => {
    persistGuardians(guardians.map(g =>
        g.id === guardianId
          ? {
              ...g,
              permissions: granted
                ? [...new Set([...g.permissions, permission])]
                : g.permissions.filter(p => p !== permission)
            }
          : g
      )
    );
  };

  return (
    <Layout>
            <main className="px-4 sm:px-6 py-6 sm:py-10">
        <h1>Guardians & Family Connections</h1>
        <p>Manage your wali (guardian) relationships and family involvement in your matchmaking journey.</p>

        <div className="auth-suite">
          <div className="auth-copy">
            <h2>Your Guardians</h2>
            {guardians.length === 0 ? (
              <p className="empty-state">
                You haven\\'t added any guardians yet. Adding a guardian allows family members to be involved in your matchmaking process with appropriate permissions.
              </p>
                        ) : (
              <div className="guardian-list space-y-4 mt-4">
                {guardians.map(guardian => (
                  <div key={guardian.id} className="guardian-card">
                    <div className="guardian-header">
                      <h3>{guardian.name}</h3>
                      <span className={`guardian-status ${guardian.status}`}>
                        {guardian.status === 'approved' ? 'Approved' : guardian.status === 'pending' ? 'Pending' : 'Removed'}
                      </span>
                    </div>
                    <p><strong>Relationship:</strong> {guardian.relationship}</p>
                    {guardian.lastContact && (
                      <p><strong>Last Contact:</strong> {new Date(guardian.lastContact).toLocaleDateString()}</p>
                    )}
                    <div className="guardian-permissions">
                      <strong>Permissions:</strong>
                      <div className="permission-tags flex flex-wrap gap-1.5 mt-1">
                        {guardian.permissions.map(perm => (
                          <span key={perm} className="permission-tag px-2 py-0.5 bg-elevated border border-line/20 rounded text-xs">
                            {perm
                              .replace(/([A-Z])/g, ' $1')
                              .replace(/^./, str => str.toUpperCase())
                              .trim()}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="guardian-actions mt-3 flex gap-2">
                      <button
                        onClick={() => handleUpdatePermission(guardian.id, 'messageView', !guardian.permissions.includes('messageView'))}
                        className="button muted"
                      >
                        {guardian.permissions.includes('messageView') ? 'Revoke Message Access' : 'Grant Message Access'}
                      </button>
                      <button
                        onClick={() => handleUpdatePermission(guardian.id, 'contactApproval', !guardian.permissions.includes('contactApproval'))}
                        className="button muted"
                      >
                        {guardian.permissions.includes('contactApproval') ? 'Revoke Contact Approval' : 'Grant Contact Approval'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <h2 className="mt-6">Add New Guardian</h2>
            <form onSubmit={handleAddGuardian} className="form-card">
              <div>
                <label htmlFor="guardianName">Guardian Name *</label>
                <input
                  type="text"
                  id="guardianName"
                  name="name"
                  value={newGuardian.name}
                  onChange={handleGuardianChange}
                  required
                />
              </div>

              <div>
                <label htmlFor="guardianRelationship">Relationship *</label>
                <select
                  id="guardianRelationship"
                  name="relationship"
                  value={newGuardian.relationship}
                  onChange={handleGuardianChange}
                  required
                >
                  <option value="">Select relationship</option>
                  <option value="father">Father</option>
                  <option value="mother">Mother</option>
                  <option value="brother">Brother</option>
                  <option value="uncle">Uncle</option>
                  <option value="other">Other Family Member</option>
                </select>
              </div>

              <div>
                <label htmlFor="guardianEmail">Email (optional)</label>
                <input
                  type="email"
                  id="guardianEmail"
                  name="email"
                  value={newGuardian.email}
                  onChange={handleGuardianChange}
                />
              </div>

              <div>
                <label htmlFor="guardianPhone">Phone (optional)</label>
                <input
                  type="tel"
                  id="guardianPhone"
                  name="phone"
                  value={newGuardian.phone}
                  onChange={handleGuardianChange}
                />
              </div>

              <button type="submit" className="button primary">
                {isAdding ? 'Adding...' : 'Add Guardian'}
              </button>
            </form>
          </div>
        </div>
      </main>
    </Layout>
  );
}