import { useState, useCallback, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import Toast from './Toast.jsx';

export default function ToastManager() {
  const [toasts, setToasts] = useState([]);
  // Auto-dismiss timers, keyed by toast id. Held in a ref (not state) so that
  // scheduling one never triggers a render, and so every pending timer can be
  // cleared on unmount. Previously the setTimeout was fire-and-forget: unmount
  // the provider and the callback still fired, calling setState on an unmounted
  // component — a React warning at best, a leak in a long-lived SPA shell.
  const timers = useRef(new Map());

  const clearTimer = useCallback((id) => {
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
  }, []);

  const addToast = useCallback((message, type = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts(prev => [...prev, { id, message, type }]);
    timers.current.set(id, setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id));
      timers.current.delete(id);
    }, 5000));
  }, []);

  const removeToast = useCallback((id) => {
    clearTimer(id);
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, [clearTimer]);

  // Clear every pending timer when the provider unmounts.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((t) => clearTimeout(t));
      pending.clear();
    };
  }, []);

  // Listen for toast events from anywhere in the app
  useEffect(() => {
    const handleToastEvent = (event) => {
      if (event.detail && event.detail.message) {
        addToast(event.detail.message, event.detail.type || 'info');
      }
    };

    window.addEventListener('show-toast', handleToastEvent);

    return () => {
      window.removeEventListener('show-toast', handleToastEvent);
    };
  }, [addToast]);

  return (
    <div className="toast-manager">
      <AnimatePresence initial={false}>
        {toasts.map(toast => (
          <Toast
            key={toast.id}
            type={toast.type}
            onClose={() => removeToast(toast.id)}
          >
            <p className="toast-message">{toast.message}</p>
          </Toast>
        ))}
      </AnimatePresence>
    </div>
  );
}