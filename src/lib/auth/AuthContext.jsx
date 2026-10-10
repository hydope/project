import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { auth as authService } from '../api/authService';

const AuthContext = createContext(null);

/**
 * Single source of truth for member auth.
 * Session shape: { uid, email, displayName, isAdmin } | null
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // The uid this tab is currently rendering. Kept in a ref AND mirrored onto
  // <html data-session-uid> so the focus/storage listeners below can compare
  // against it.
  //
  // BUG FIXED HERE: the stamp was only written once, at boot. Logging in or out
  // changed `user` but never the stamp, so the very next window `focus` event
  // saw "stamp (old/empty) !== current session (new)" and called
  // window.location.reload(). In practice: sign in, click anywhere that blurred
  // and refocused the window, and the page hard-reloaded — throwing away
  // whatever the member had typed. Writing the stamp on every session change
  // makes the comparison mean "did ANOTHER tab change identity", which is the
  // only thing it should be watching for.
  const stampSession = useCallback((session) => {
    try {
      document.documentElement.dataset.sessionUid = session?.uid || '';
    } catch {
      /* dataset unavailable (rare CSP/locked-down browser) — degrade quietly */
    }
  }, []);

  useEffect(() => {
    const current = authService.current();
    setUser(current);
    stampSession(current);
    setLoading(false);
  }, [stampSession]);

  // Detect session changes from other tabs/windows (e.g. a different account
  // signed in on a shared browser). Fail closed: if the uid changes under us,
  // reload rather than silently swapping the user object, because setUser(next)
  // alone would leave the previous account's profiles, messages and drafts in
  // component state. A reload rebuilds everything from the new session.
  useEffect(() => {
    const identityChanged = () => {
      const next = authService.current();
      const currentUid = (() => {
        try {
          return document.documentElement.dataset.sessionUid || null;
        } catch {
          return null;
        }
      })();
      if ((currentUid || null) !== (next?.uid || null)) {
        window.location.reload();
      }
    };
    const onStorage = (e) => {
      if (e.key === 'sh_session') identityChanged();
    };
    window.addEventListener('storage', onStorage);
    // Also re-validate on window focus: catches token expiry / server-side
    // session invalidation that happened while the tab was in the background.
    window.addEventListener('focus', identityChanged);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', identityChanged);
    };
  }, []);

  const login = useCallback(async (email, password) => {
    const session = await authService.login({ email, password });
    setUser(session);
    // Re-stamp: without this, logging in looks like an identity change to the
    // listener above and the next focus triggers a full reload.
    stampSession(session);
    return { user: session };
  }, [stampSession]);

  const register = useCallback(async (data) => {
    const session = await authService.register(data);
    setUser(session);
    stampSession(session);
    return { user: session };
  }, [stampSession]);

  const logout = useCallback(() => {
    authService.logout();
    setUser(null);
    stampSession(null);
  }, [stampSession]);

  // Re-fetch the session from the server and update state + the stored copy.
  // Used when account state may have changed outside this tab (e.g. email
  // verified via a link on another device). Returns the fresh user or null.
  const refreshUser = useCallback(async () => {
    try {
      const fresh = await authService.me();
      if (fresh) {
        setUser(fresh);
        stampSession(fresh);
        return fresh;
      }
      return user;
    } catch {
      return user;
    }
  }, [stampSession, user]);

  // If the member verified their email (or changed anything material) in
  // another tab/device, pick it up when this tab regains focus — previously
  // the stale session survived until a full logout/login cycle.
  useEffect(() => {
    let timer = null;
    const onFocus = () => {
      // Small delay: the verification request from the other tab may still
      // be in flight when focus returns.
      timer = setTimeout(() => { refreshUser(); }, 800);
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      if (timer) clearTimeout(timer);
    };
  }, [refreshUser]);

  return (
    <AuthContext.Provider
      value={{ user, loading, isLoggedIn: !!user, isAdmin: user?.isAdmin === true, login, register, logout, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
