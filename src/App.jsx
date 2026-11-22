import { RouterProvider } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import router from './routes';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { AuthProvider } from './lib/auth/AuthContext';

// Lazy: the toast system is only needed after a user action, never during
// first paint, so it stays out of the entry chunk's static graph.
const ToastManager = lazy(() => import('./components/ToastManager.jsx'));

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <RouterProvider router={router} />
        <Suspense fallback={null}>
          <ToastManager />
        </Suspense>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;