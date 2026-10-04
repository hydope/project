// ─── Auth service — remote JWT backend when VITE_API_URL is set ─────────────
// Local fallback keeps every flow working offline/demo: bcrypt-hashed passwords
// in per-member storage, same session shape the backend returns.
import bcrypt from 'bcryptjs';
import { read, write, clearUserData } from './storage';
import { http, useRemote } from './transport';

const USERS_KEY = 'users';
const SESSION_KEY = 'session';
// Set VITE_ADMIN_EMAILS="a@x.com,b@y.com" to promote accounts to admin.
const ADMIN_EMAILS = String(import.meta.env?.VITE_ADMIN_EMAILS ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

function toSession(user) {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    isAdmin: user.isAdmin === true,
    // Local demo has no mail transport, so there is nothing to verify — mark
    // verified to keep demo flows clean. The real backend decides this itself.
    emailVerified: true,
  };
}

export const auth = {
  async register({ email, password, displayName, sect }) {
    if (useRemote) {
      const data = await http.post('/api/auth/register', { email, password, displayName, sect });
      http.setToken(data.token);
      write(SESSION_KEY, data.user);
      return data.user;
    }
    const cleanEmail = String(email ?? '').trim().toLowerCase();
    if (!cleanEmail || !password) throw new Error('Email and password are required');
    const users = read(USERS_KEY, []);
    if (users.some((u) => u.email === cleanEmail)) throw new Error('Email already registered');
    const passwordHash = bcrypt.hashSync(String(password), 10);
    const user = {
      uid: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      email: cleanEmail,
      displayName: displayName?.trim() || cleanEmail.split('@')[0],
      passwordHash,
      sect: sect ?? '',
      isAdmin: ADMIN_EMAILS.includes(cleanEmail),
      createdAt: new Date().toISOString(),
    };
    write(USERS_KEY, [...users, user]);
    const session = toSession(user);
    write(SESSION_KEY, session);
    return session;
  },

  async login({ email, password }) {
    if (useRemote) {
      const data = await http.post('/api/auth/login', { email, password });
      http.setToken(data.token);
      write(SESSION_KEY, data.user);
      return data.user;
    }
    const cleanEmail = String(email ?? '').trim().toLowerCase();
    const users = read(USERS_KEY, []);
    const user = users.find((u) => u.email === cleanEmail);
    if (!user || !bcrypt.compareSync(String(password ?? ''), user.passwordHash)) {
      throw new Error('Invalid email or password');
    }
    const session = toSession(user);
    write(SESSION_KEY, session);
    return session;
  },

  // Password reset — remote only by design: the local demo has no mail
  // transport, and pretending otherwise would fake a security flow.
  async forgotPassword(email) {
    if (!useRemote) return { ok: true, message: 'Demo mode: password reset needs the live platform.' };
    return http.post('/api/auth/forgot', { email });
  },
  async resetPassword(token, password) {
    if (!useRemote) throw new Error('Demo mode: password reset needs the live platform.');
    return http.post('/api/auth/reset', { token, password });
  },
  async verifyEmail(token) {
    if (!useRemote) return { ok: true, emailVerified: true };
    return http.get(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
  },
  // New verification endpoint (GET /api/auth/verify?token=…). Falls back to
  // the legacy path if the new one is not deployed yet.
  async verifyToken(token) {
    if (!useRemote) return { ok: true, emailVerified: true };
    try {
      return await http.get(`/api/auth/verify?token=${encodeURIComponent(token)}`);
    } catch (e) {
      if (e?.status === 404) return this.verifyEmail(token);
      throw e;
    }
  },

  logout() {
    const session = read(SESSION_KEY, null);
    // Tell the server to drop this session row (best-effort — local cleanup
    // must happen even if the network fails).
    if (useRemote) {
      http.post('/api/auth/logout', {}).catch(() => {});
    }
    http.setToken(null);
    // Preserve the onboarding draft across sign-out: it is namespaced by the
    // account UID (no other member on a shared device can read it), and wiping
    // a member's own in-progress answers on every logout is a UX bug, not a
    // privacy win. Everything else (messages, interests, profile cache) is
    // still wiped so the next person on a shared device sees nothing.
    let onboardingDraft = null;
    let onboardingDraftKey = null;
    try {
      const uid = session?.uid;
      if (uid) {
        onboardingDraftKey = `shiarishta_onboarding_draft::${uid}`;
        onboardingDraft = localStorage.getItem(onboardingDraftKey);
      }
    } catch { /* ignore */ }
    clearUserData(session?.uid || null);
    try {
      if (onboardingDraftKey && onboardingDraft) {
        localStorage.setItem(onboardingDraftKey, onboardingDraft);
      }
    } catch { /* quota — non-fatal */ }
  },

  current() {
    return read(SESSION_KEY, null);
  },

  isLoggedIn() {
    return read(SESSION_KEY, null) !== null;
  },
};

export default auth;
