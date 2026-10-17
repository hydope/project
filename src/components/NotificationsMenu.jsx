import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useAuth } from '../lib/auth/AuthContext';
import { http } from '../lib/api/transport';

// Shared notification bell — used in the public landing header AND the
// authenticated member sidebar, so members see notifications where they live.
export default function NotificationsMenu({ className = 'landing-icon-btn' }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const { isLoggedIn } = useAuth();
  const navigate = useNavigate();

  // Deep link for each notification type — tapping one takes the member to
  // the exact thing it is about, instead of landing on a dead list.
  const targetFor = (n) => {
    switch (n.type) {
      case 'interest': return n.refId ? `/profiles/${n.refId}` : '/messages';
      case 'match': return '/messages';
      case 'message': return '/messages';
      default: return '/dashboard';
    }
  };

  const openNotification = async (n) => {
    setOpen(false);
    // Mark this one read (best-effort) then navigate.
    try {
      await http.post('/api/profiles/notifications/read', {});
    } catch { /* ignore */ }
    setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, isRead: true } : x));
    setUnreadCount(prev => Math.max(0, prev - 1));
    navigate(targetFor(n));
  };

  const fetchNotifications = async () => {
    if (!isLoggedIn) return;
    setLoading(true);
    try {
      const data = await http.get('/api/profiles/notifications');
      const list = Array.isArray(data) ? data : [];
      setNotifications(list);
      setUnreadCount(list.filter(n => !n.isRead).length);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => {
    if (isLoggedIn) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 30000);
      return () => clearInterval(interval);
    }
  }, [isLoggedIn]);

  const markAllRead = async () => {
    try {
      await http.post('/api/profiles/notifications/read', {});
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!isLoggedIn) return null;

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        ref={buttonRef}
        className={className}
        aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen(o => !o)}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute', top: 4, right: 4, width: 10, height: 10,
              borderRadius: '50%', background: 'var(--color-danger)',
              boxShadow: '0 0 0 2px var(--color-canvas)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontSize: '7px', fontWeight: 'bold'
            }}
          >
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="region"
          aria-label="Notifications"
          className="notif-popover"
        >
          <div className="flex items-center justify-between" style={{ padding: '6px 8px 10px' }}>
            <span className="text-xs font-bold" style={{ color: 'var(--color-ink)' }}>Notifications</span>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs" style={{ color: 'var(--color-primary)' }}>
                Mark all read
              </button>
            )}
          </div>
          {loading ? (
            <p className="text-xs" style={{ color: 'var(--color-ink-tertiary)', padding: '8px' }}>Loading...</p>
          ) : notifications.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--color-ink-tertiary)', padding: '8px' }}>
              You're all caught up — there are no notifications.
            </p>
          ) : (
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              {notifications.map(n => (
                <button key={n.id} onClick={() => openNotification(n)}
                  className="w-full text-left hover:bg-black/5 transition-colors"
                  style={{
                    padding: '8px',
                    borderBottom: '1px solid var(--color-border)',
                    background: n.isRead ? 'transparent' : 'var(--color-primary-subtle)',
                    cursor: 'pointer',
                  }}>
                  <p className="text-xs font-semibold" style={{ color: 'var(--color-ink)' }}>{n.title}</p>
                  {n.body && <p className="text-xs" style={{ color: 'var(--color-ink-secondary)' }}>{n.body}</p>}
                  <p className="text-[10px]" style={{ color: 'var(--color-ink-tertiary)' }}>
                    {new Date(n.createdAt).toLocaleDateString()}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
