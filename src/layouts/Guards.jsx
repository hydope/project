import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { useAuth } from '../lib/auth/AuthContext';

// Lazy: MainLayout pulls in framer-motion. It isn't needed until a guarded
// route actually renders, so keep it out of the entry chunk's static graph.
const MainLayout = lazy(() => import('./MainLayout'));

function LoadingGate() {
  return (
    <Suspense fallback={<div className="empty-state"><p>Loading…</p></div>}>
      <MainLayout>
        <main>
          <div className="empty-state">
            <p>Loading…</p>
          </div>
        </main>
      </MainLayout>
    </Suspense>
  );
}

/** Blocks logged-out visitors. Preserves the target so login can redirect back. */
export function RequireAuth() {
  const { isLoggedIn, loading, user } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingGate />;
  if (!isLoggedIn) return <Navigate to="/auth/login" replace state={{ from: location.pathname }} />;
  // 18+ gate (2026-11-16): a social account created before its DOB step
  // (needsDob) is locked to /auth/dob until the date is on file. The
  // server refuses profile saves in the same state (profileUpdate).
  if (user?.needsDob && location.pathname !== '/auth/dob') {
    return <Navigate to="/auth/dob" replace />;
  }
  return <Outlet />;
}

/** Blocks non-admins. Relies on session.isAdmin set at register/login. */
export function RequireAdmin() {
  const { isLoggedIn, isAdmin, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingGate />;
  if (!isLoggedIn) return <Navigate to="/auth/login" replace state={{ from: location.pathname }} />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <Outlet />;
}
