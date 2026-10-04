import { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

// In-app confirmation dialog — replaces the native window.confirm(), which is
// auto-dismissed by automated browsers and some popup blockers, silently
// cancelling the action (e.g. wali-link revoke never fired). This dialog is a
// real DOM element: it works everywhere, is keyboard-accessible, and can be
// driven by QA automation.
export default function ConfirmDialog({
  open = true,
  title = 'Are you sure?',
  message = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}) {
  const panelRef = useRef(null);
  const restoreFocusRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    // Remember what had focus so it can be handed back on close. Without this,
    // dismissing the dialog drops the caret to <body> and a keyboard user has
    // to Tab from the top of the page to get back where they were.
    restoreFocusRef.current = document.activeElement;

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel?.();
        return;
      }
      // Focus trap. aria-modal="true" tells assistive tech the rest of the page
      // is inert, but without this the Tab key still walked into the page
      // behind the dialog — focus visibly disappearing mid-task.
      if (e.key !== 'Tab') return;
      const focusables = panelRef.current?.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      const el = restoreFocusRef.current;
      if (el && typeof el.focus === 'function' && document.contains(el)) {
        el.focus();
      }
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="ai-backdrop"
      style={{ zIndex: 500 }}
      onClick={onCancel}
      role="presentation"
    >
      <div
        ref={panelRef}
        className="ai-drawer"
        style={{ width: '380px', maxWidth: '95vw', margin: '2rem auto', borderRadius: 'var(--radius-xl)', position: 'relative', top: '20vh' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="ai-drawer-header">
          <div className="ai-orb" style={danger ? { background: 'var(--color-danger-subtle)', color: 'var(--color-danger)' } : undefined}>
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div><p className="ai-drawer-title">{title}</p></div>
          <button className="ai-icon-btn" onClick={onCancel} aria-label="Close">
            <span style={{ fontSize: '1.25rem' }}>×</span>
          </button>
        </div>
        <div style={{ padding: '1.5rem' }}>
          {message && (
            <p style={{ fontSize: '0.9375rem', color: 'var(--color-ink-secondary)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
              {message}
            </p>
          )}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button
              className="button px-4 py-2.5 font-semibold"
              style={{ background: 'var(--color-elevated)', color: 'var(--color-ink)', border: '1px solid var(--color-border)' }}
              onClick={onCancel}
              disabled={busy}
            >
              {cancelLabel}
            </button>
            <button
              className={`button primary px-4 py-2.5 font-semibold ${danger ? '' : ''}`}
              style={danger ? { background: 'var(--color-danger)', borderColor: 'var(--color-danger)' } : undefined}
              onClick={onConfirm}
              disabled={busy}
              autoFocus
            >
              {busy ? 'Working…' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
