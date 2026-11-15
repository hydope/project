// Client event log (Syed's ask, 2026-11-15): form submits, validation
// failures, and client-side crashes are beaconed to
// POST /api/analytics/event so a failure explains itself — the
// 2026-11-14 suspension night showed a member hitting a crash screen
// with no diagnosable trace anywhere.
//
// PRIVACY: this module never sends field VALUES — only the form name,
// the field NAME, and the error message the member already saw. No
// passwords, no message bodies, no typed text, ever. The server
// enforces the same allowlist again on its side.
//
// Fire-and-forget like the pageview beacon: logging must never break
// or slow the page it observes.
const ENDPOINT = '/api/analytics/event';

function send(payload) {
  try {
    const body = JSON.stringify(payload);
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function'
      && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }))) {
      return;
    }
    fetch(ENDPOINT, {
      method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true,
    }).catch(() => {});
  } catch { /* logging is best-effort by design */ }
}

export function logEvent(kind, name, detail) {
  send({
    kind,
    name: String(name || '').slice(0, 80),
    page: typeof window !== 'undefined' ? window.location.pathname : '/',
    detail: detail || {},
  });
}

// A form submit attempt and its outcome. `message` is the error text the
// member saw (or 'ok') — never anything they typed.
export function logSubmit(form, ok, message) {
  logEvent('submit', form, { form, message: ok ? 'ok' : String(message || 'failed').slice(0, 300) });
}

// One event per failing field: { fieldName: message } as the form's own
// validation produced it.
export function logValidation(form, errors) {
  for (const [field, message] of Object.entries(errors || {})) {
    if (message) logEvent('validation', form, { form, field, message: String(message).slice(0, 300) });
  }
}

// Global crash capture, installed once at boot: uncaught errors and
// unhandled promise rejections (chunk-load failures land here too).
export function installGlobalErrorLogging() {
  if (typeof window === 'undefined' || window.__srErrorLogging) return;
  window.__srErrorLogging = true;
  window.addEventListener('error', (e) => {
    logEvent('error', 'window_error', { message: String(e?.message || 'unknown error').slice(0, 300) });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e?.reason;
    logEvent('error', 'unhandled_rejection', { message: String((r && r.message) || r || 'unknown rejection').slice(0, 300) });
  });
}
