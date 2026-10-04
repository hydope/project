// ─── Repository: typed CRUD over the storage adapter — or the real API ──────
// When VITE_API_URL is set, every call below goes to MariaDB through the
// PHP backend (privacy tiers + blocks enforced server-side). Otherwise the
// same shapes resolve from per-member local storage (demo/offline mode).
// Every method is async so switching modes changes zero call sites.
import { read, write } from './storage';
import { http, useRemote } from './transport';

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

function allProfiles() {
  const cached = read('profiles', null);
  if (cached) return cached;
  // No fake profiles: an empty directory is honest. Demo mode shows empty states.
  write('profiles', []);
  return [];
}

export const profilesRepo = {
  async all() {
    if (useRemote) return http.get('/api/profiles');
    return allProfiles();
  },
  async getById(id) {
    if (useRemote) return http.get(`/api/profiles/${encodeURIComponent(id)}`);
    return allProfiles().find((p) => p.id === id) ?? null;
  },
  async search(filters = {}) {
    if (useRemote) {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(filters)) {
        if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
      }
      const qs = q.toString();
      return http.get(`/api/profiles${qs ? `?${qs}` : ''}`);
    }
    let list = allProfiles();
    if (filters.minAge) list = list.filter((p) => p.age >= +filters.minAge);
    if (filters.maxAge) list = list.filter((p) => p.age <= +filters.maxAge);
    if (filters.verifiedOnly) list = list.filter((p) => p.is_verified);
    if (filters.gender) list = list.filter((p) => p.gender === filters.gender);
    if (filters.sect && filters.sect !== 'Any sect') list = list.filter((p) => p.sect === filters.sect);
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter((p) =>
        [p.displayName, p.profession, p.city, p.country].join(' ').toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
  },
  async save(profile) {
    if (useRemote) return http.put('/api/profiles/me', profile);
    const list = allProfiles();
    const idx = list.findIndex((p) => p.id === profile.id);
    const next = [...list];
    if (idx >= 0) next[idx] = { ...next[idx], ...profile };
    else next.push({ ...profile, id: profile.id ?? uid() });
    write('profiles', next);
    return next[idx >= 0 ? idx : next.length - 1];
  },
  // Photo upload goes to the server only. There is deliberately no local-storage
  // fallback: a photo in demo mode would be a data URL pretending to be a
  // member's real image, which is the exact misrepresentation this product is
  // trying to avoid.
  async uploadPhoto(file) {
    if (!useRemote) throw new Error('Photo upload needs the live platform.');
    const fd = new FormData();
    fd.append('photo', file, file.name || 'photo.jpg');
    return http.upload('/api/profiles/me/photo', fd);
  },
  async deletePhoto() {
    if (!useRemote) throw new Error('Photo upload needs the live platform.');
    return http.del('/api/profiles/me/photo');
  },
};

export const messagesRepo = {
  async conversations() {
    if (useRemote) return http.get('/api/messages');
    return read('conv', [
      {
        id: 'c1',
        participantId: 'p1',
        participantName: 'Zainab H.',
        lastMessage: 'Assalamu Alaikum!',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        unread: true,
      },
    ]);
  },
  async thread(cid) {
    if (useRemote) return http.get(`/api/messages/${encodeURIComponent(cid)}`);
    const all = read('msg', {});
    return (
      all[cid] ?? [
        {
          id: 'm1',
          senderId: 'them',
          text: 'Assalamu Alaikum! Thank you for reaching out.',
          timestamp: new Date(Date.now() - 7200000).toISOString(),
        },
      ]
    );
  },
  async send(cid, text) {
    if (useRemote) return http.post(`/api/messages/${encodeURIComponent(cid)}`, { text });
    const all = read('msg', {});
    const msg = { id: uid(), senderId: 'me', text, timestamp: new Date().toISOString() };
    write('msg', { ...all, [cid]: [...(all[cid] ?? []), msg] });
    return msg;
  },
};

export const matchesRepo = {
  async suggestions(limit = 6) {
    const list = await profilesRepo.all();
    return [...list].sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0)).slice(0, limit);
  },
  // Deterministic: idempotent, no Math.random() — mutual match resolved server-side later.
  async expressInterest(profileId) {
    if (useRemote) return http.post(`/api/profiles/${encodeURIComponent(profileId)}/interest`, {});
    const existing = read('int', []);
    if (!existing.some((i) => i.profileId === profileId)) {
      write('int', [...existing, { profileId, timestamp: new Date().toISOString() }]);
    }
    return { success: true, matched: false };
  },
  // People who expressed interest in me (Request Center). Server is source of truth.
  async receivedInterests() {
    if (useRemote) return http.get('/api/profiles/interests/received');
    return [];
  },
  // Withdraw an expressed interest (declining a request removes their interest row).
  async withdrawInterest(profileId) {
    if (useRemote) return http.del(`/api/profiles/${encodeURIComponent(profileId)}/interest`);
    return { success: true };
  },
  // ── Favourites ──
  // Remote-only by design. A localStorage fallback would let a signed-out
  // visitor save profiles they could never see again after signing in, which
  // reads as silent data loss. The API requires a session.
  async favourites() {
    if (!useRemote) return [];
    const res = await http.get('/api/profiles/me/favourites');
    return res?.rows ?? res ?? [];
  },
  async addFavourite(profileId) {
    return http.post(`/api/profiles/${encodeURIComponent(profileId)}/favourite`, {});
  },
  async removeFavourite(profileId) {
    return http.del(`/api/profiles/${encodeURIComponent(profileId)}/favourite`);
  },

  // Interest-gated conversation start (server enforces mutual interest).
  async startConversation(profileId) {
    if (useRemote) return http.post('/api/messages', { userId: profileId });
    const list = read('conv', []);
    const existing = list.find((c) => c.participantId === profileId);
    if (existing) return { id: existing.id };
    const conv = {
      id: `c-${Date.now().toString(36)}`,
      participantId: profileId,
      participantName: profileId,
      lastMessage: '',
      timestamp: new Date().toISOString(),
      unread: false,
    };
    write('conv', [conv, ...list]);
    return { id: conv.id };
  },

  async submitVerification({ kind, imageBase64 }) {
    if (useRemote) return http.post('/api/verifications', { kind, imageBase64 });
    throw new Error('Verification runs on the live platform — connect the backend.');
  },

  async myVerifications() {
    if (useRemote) return http.get('/api/verifications/mine');
    return [];
  },

  async createWaliLink() {
    if (useRemote) return http.post('/api/wali/link');
    throw new Error('Wali links work on the live platform — connect the backend.');
  },
};

export const ticketsRepo = {
  async all() {
    return read('tickets', []);
  },
  async create(ticket) {
    const list = read('tickets', []);
    const created = {
      ...ticket,
      id: `t${Date.now()}`,
      status: 'open',
      createdAt: new Date().toISOString(),
    };
    write('tickets', [...list, created]);
    return created;
  },
};
