// ── Analytics ────────────────────────────────────────────────────────────────
// Two channels, both honest about what they do:
//
// 1. Google Analytics 4 (gtag.js, measurement ID G-KNR7541E3G) — loaded via the
//    snippet in index.html. trackPageView() fires manual page_view events on
//    SPA route changes; the initial page_view per full load is automatic.
// 2. First-party pageview beacon — beaconPageView() POSTs {path, referrer,
//    utm} to /api/analytics/collect (fire-and-forget via sendBeacon). Powers
//    the admin SEO & Growth dashboard. The server stores NO ip, NO user
//    agent, NO referrer query string — only a one-way persistent visitor
//    hash (ip+ua), referrer host+path, a classified channel, and UTM.
//
// The event queue below is the legacy in-browser funnel recorder (local only).
// Storage is injectable so unit tests can run in plain Node without a DOM.

const QUEUE_KEY = 'shiarishta_events_v1';
const MAX_EVENTS = 500;

export const GA_MEASUREMENT_ID = 'G-KNR7541E3G';

/** GA4 page_view for SPA navigations. No-op when gtag is blocked/missing. */
export function trackPageView(path, title) {
  try {
    if (typeof window === 'undefined' || typeof window.gtag !== 'function') return false;
    window.gtag('event', 'page_view', {
      page_path: path,
      page_title: title || (typeof document !== 'undefined' ? document.title : ''),
      page_location: window.location.origin + path,
    });
    return true;
  } catch {
    return false;
  }
}

const UTM_KEY = 'shiarishta_utm_v1';

/**
 * First-touch UTM capture (2026-11-15, Batch B): the campaign params on
 * the FIRST landing URL of the session are kept and attached to every
 * beacon, so a signup can be attributed to the outreach that brought the
 * visitor (page-to-signup attribution). Session-scoped on purpose.
 */
export function captureUtm() {
  try {
    if (typeof window === 'undefined') return null;
    const stored = window.sessionStorage.getItem(UTM_KEY);
    if (stored) return JSON.parse(stored);
    const q = new URLSearchParams(window.location.search);
    const utm = {
      utm_source: q.get('utm_source') || '',
      utm_medium: q.get('utm_medium') || '',
      utm_campaign: q.get('utm_campaign') || '',
    };
    if (utm.utm_source || utm.utm_medium || utm.utm_campaign) {
      window.sessionStorage.setItem(UTM_KEY, JSON.stringify(utm));
      return utm;
    }
    return null;
  } catch {
    return null;
  }
}

/** First-party pageview beacon. Fire-and-forget — never blocks rendering. */
export function beaconPageView(path) {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return false;
    // Internal traffic (2026-11-15, Batch B): admin screens are never
    // visitor traffic. The server drops these too — belt and braces.
    if (typeof path === 'string' && path.startsWith('/admin')) return false;
    const utm = captureUtm() || {};
    const payload = JSON.stringify({
      path,
      referrer: typeof document !== 'undefined' ? document.referrer || '' : '',
      ...utm,
    });
    return navigator.sendBeacon(
      '/api/analytics/collect',
      new Blob([payload], { type: 'application/json' })
    );
  } catch {
    return false;
  }
}

export function createAnalytics(storage = globalThis.localStorage) {
  const readQueue = () => {
    try {
      const raw = storage.getItem(QUEUE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const writeQueue = (events) => {
    try {
      // Keep the newest MAX_EVENTS; drop the oldest beyond that.
      storage.setItem(QUEUE_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
    } catch {
      /* quota — non-fatal: analytics must never break the product */
    }
  };

  return {
    /** Record one event. `name` must be a short snake_case string. */
    track(name, props = {}) {
      if (typeof name !== 'string' || !name.trim()) return null;
      const event = {
        event: name,
        props,
        ts: new Date().toISOString(),
      };
      const queue = readQueue();
      queue.push(event);
      writeQueue(queue);
      return event;
    },

    /** All queued events, oldest first. */
    getEvents() {
      return readQueue();
    },

    /** Count of events matching a name (all events when name omitted). */
    count(name) {
      const queue = readQueue();
      return name ? queue.filter(e => e.event === name).length : queue.length;
    },

    /** JSON export — attach to a support email or save via DevTools. */
    exportJson() {
      return JSON.stringify(readQueue(), null, 2);
    },

    clear() {
      try { storage.removeItem(QUEUE_KEY); } catch { /* non-fatal */ }
    },
  };
}

export const analytics = createAnalytics();
