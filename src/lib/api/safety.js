// ─── Report + block — remote enforcement when the API is configured ────────
// Local fallback stores reports in per-member storage so the flow is testable
// offline; only the backend actually hides content and cuts messaging.
import { read, write } from './storage';
import { http, useRemote } from './transport';

export async function fileReport({ targetType, targetId, reason }) {
  if (useRemote) return http.post('/api/reports', { targetType, targetId, reason });
  const list = read('reports', []);
  const report = { id: `r${Date.now()}`, targetType, targetId, reason, status: 'open', createdAt: new Date().toISOString() };
  write('reports', [...list, report]);
  return { ok: true, id: report.id };
}

export async function blockMember(userId) {
  if (useRemote) return http.post('/api/reports/block', { userId });
  const list = read('blocks', []);
  if (!list.includes(userId)) write('blocks', [...list, userId]);
  return { ok: true };
}

export async function unblockMember(userId) {
  if (useRemote) return http.del(`/api/reports/block/${encodeURIComponent(userId)}`);
  write('blocks', read('blocks', []).filter(id => id !== userId));
  return { ok: true };
}

export async function listBlocks() {
  if (useRemote) {
    const res = await http.get('/api/reports/blocks');
    return Array.isArray(res) ? res : (res?.blocks ?? []);
  }
  return read('blocks', []);
}

const isNotFound = (err) => /\(404\)|not found/i.test(err?.message || '');

// Why members leave — the exit-survey options shown in the delete-account
// confirmation. Keys are what the server stores; labels are what the member
// sees. The admin "Deleted profiles" page maps keys back to labels with
// deletionReasonLabel() — an unknown key renders as-is, never blank.
export const DELETION_REASONS = [
  { key: 'found_match_elsewhere', label: 'I found a match elsewhere' },
  { key: 'no_suitable_matches', label: 'No suitable matches for me' },
  { key: 'too_few_members', label: 'Too few members here' },
  { key: 'nobody_replies', label: 'Nobody replies to me' },
  { key: 'privacy', label: 'Privacy concerns' },
  { key: 'too_complicated', label: 'Too complicated / I got stuck' },
  { key: 'other', label: 'Something else' },
  { key: 'prefer_not_to_say', label: 'Prefer not to say' },
];

export function deletionReasonLabel(key) {
  if (!key) return 'No reason given';
  return DELETION_REASONS.find((r) => r.key === key)?.label || key;
}

// Delete the signed-in account. Tries the canonical /api/users/me first,
// falls back to the repo's existing /api/auth/account, and surfaces a clear
// "not available yet" when neither route exists on the server.
// `feedback` is the optional exit survey ({ reason, detail }) — sent to
// whichever endpoint handles the delete, recorded before the account is
// wiped. Skipping it changes nothing: deletion never waits on an answer.
export async function deleteAccount(feedback) {
  if (!useRemote) return { ok: true, local: true };
  try {
    return await http.del('/api/users/me', feedback);
  } catch (e) {
    if (!isNotFound(e)) throw e;
  }
  try {
    return await http.del('/api/auth/account', feedback);
  } catch (e) {
    if (isNotFound(e)) throw new Error('Account deletion is not available yet.');
    throw e;
  }
}
