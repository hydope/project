// ──── DEPRECATED — DO NOT IMPORT ─────────────────────────────────────────────
// This localStorage simulator is dead code (zero imports). The canonical API
// path is: pages/components → client.js → repository.js → transport.js → PHP.
// This file is kept for reference only and will be deleted.
// ─────────────────────────────────────────────────────────────────────────────
// ──── Backend Service Layer (localStorage-based) ──────────────────────────────
// Simulates a real REST API with persistence. Replace with a real Node.js/Express
// adapter to point the frontend at a production server.

// ── Tiny utilities ───────────────────────────────────────────────────────────
const DB = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota exceeded */ }
  },
  remove(key) { localStorage.removeItem(key); }
};

const delay = (min, max) => new Promise(r => setTimeout(r, Math.random() * (max - min) + min));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ── Auth service ─────────────────────────────────────────────────────────────
export const auth = {
  register(d) {
    return delay(200, 500).then(() => {
      const users = DB.get('sh_users', []);
      if (users.find(u => u.email === d.email)) throw new Error('Email already registered');
      const user = { uid: uid(), email: d.email, password: d.password, displayName: d.displayName, createdAt: new Date().toISOString() };
      users.push(user);
      DB.set('sh_users', users);
      const sess = { uid: user.uid, email: user.email, displayName: user.displayName };
      DB.set('sh_session', sess);
      return sess;
    });
  },
  login(d) {
    return delay(200, 500).then(() => {
      const users = DB.get('sh_users', []);
      const user = users.find(u => u.email === d.email && u.password === d.password);
      if (!user) throw new Error('Invalid email or password');
      const sess = { uid: user.uid, email: user.email, displayName: user.displayName };
      DB.set('sh_session', sess);
      return sess;
    });
  },
  logout() { DB.remove('sh_session'); },
  current() { return DB.get('sh_session', null); },
  isLoggedIn() { return !!DB.get('sh_session', null); }
};

// ── Profiles service ─────────────────────────────────────────────────────────
export const profiles = {
  getAll() {
    return delay(150, 400).then(() => {
      const s = DB.get('sh_profiles', null);
      if (s) return s;
      // No fake profiles — an empty directory is honest.
      DB.set('sh_profiles', []);
      return [];
    });
  },
  getById(id) {
    return delay(100, 300).then(() => this.getAll().then(a => a.find(p => p.id === id) || null));
  },
  search(f) {
    f = f || {};
    return delay(200, 500).then(() => this.getAll().then(r => {
      if (f.minAge) r = r.filter(p => p.age >= +f.minAge);
      if (f.maxAge) r = r.filter(p => p.age <= +f.maxAge);
      if (f.verifiedOnly) r = r.filter(p => p.is_verified);
      if (f.gender) r = r.filter(p => p.gender === f.gender);
      if (f.sect && f.sect !== 'Any sect') r = r.filter(p => p.sect === f.sect);
      if (f.search) {
        const q = f.search.toLowerCase();
        r = r.filter(p => [p.displayName, p.profession, p.city, p.country].join(' ').toLowerCase().includes(q));
      }
      return r;
    }));
  },
  save(p) {
    return delay(100, 300).then(() => this.getAll().then(a => {
      const i = a.findIndex(x => x.id === p.id);
      if (i >= 0) a[i] = Object.assign({}, a[i], p);
      else a.push(Object.assign({}, p, { id: uid() }));
      DB.set('sh_profiles', a);
      return p;
    }));
  }
};

// ── Messages service ─────────────────────────────────────────────────────────
export const messages = {
  getConversations() {
    return delay(150, 400).then(() => DB.get('sh_conv', [{
      id: 'c1', participantId: 'p1', participantName: 'Zainab H.', lastMessage: 'Assalamu Alaikum!', timestamp: new Date(Date.now() - 3600000).toISOString(), unread: true
    }]));
  },
  getMessages(cid) {
    return delay(100, 300).then(() => {
      const a = DB.get('sh_msg', {});
      return a[cid] || [{ id: 'm1', senderId: 'them', text: 'Assalamu Alaikum! Thank you for reaching out.', timestamp: new Date(Date.now() - 7200000).toISOString() }];
    });
  },
  sendMessage(cid, text) {
    return delay(100, 250).then(() => {
      const a = DB.get('sh_msg', {});
      if (!a[cid]) a[cid] = [];
      const m = { id: uid(), senderId: 'me', text, timestamp: new Date().toISOString() };
      a[cid].push(m);
      DB.set('sh_msg', a);
      return m;
    });
  }
};

// ── Matches service ──────────────────────────────────────────────────────────
export const matches = {
  getSuggestions() {
    return delay(200, 500).then(() => profiles.getAll().then(a => a.sort((x, y) => (y.matchScore || 0) - (x.matchScore || 0)).slice(0, 6)));
  },
  expressInterest(pid) {
    return delay(100, 300).then(() => {
      const a = DB.get('sh_int', []);
      if (!a.find(i => i.profileId === pid)) {
        a.push({ profileId: pid, timestamp: new Date().toISOString() });
        DB.set('sh_int', a);
      }
      return { success: true, matched: Math.random() > 0.7 };
    });
  }
};

export default { auth, profiles, messages, matches };