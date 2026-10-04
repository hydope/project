// ─── HTTP transport — defaults to the PHP backend in local development ─────
// Token lives in localStorage (demo-grade XSS tradeoff, documented in Privacy).
// Every request carries it as `Authorization: Bearer …` when present.
import { readApiResponse } from '../http';

const DEFAULT_BASE = 'http://127.0.0.1:8888';
const BASE = (import.meta.env?.VITE_API_URL || DEFAULT_BASE).replace(/\/$/, '');
export const useRemote = true;

// Resolves an API-relative path against the API origin. The server returns
// paths like `/api/profiles/:id/photo`; on a split-origin deploy (Vite on :5173,
// PHP on :8091, or a CDN front-end with api. subdomain) a relative src would be
// requested from the FRONT-END host and silently render a broken image.
export const apiUrl = (p) => {
  if (!p) return null;
  if (/^https?:\/\//i.test(p)) return p;
  if (p.startsWith('data:')) return p;
  return `${BASE}${p.startsWith('/') ? '' : '/'}${p}`;
};

function headers(extra = {}) {
  // A header explicitly set to undefined must be OMITTED, not serialised as the
  // literal string "undefined". Passing { 'Content-Type': undefined } to override
  // the JSON default would otherwise send `content-type: undefined`, which stops
  // the server ever seeing multipart/form-data — so $_FILES stays empty and the
  // upload is rejected. The browser then adds the real boundary itself.
  const h = { 'Content-Type': 'application/json' };
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined || v === null) delete h[k];
    else h[k] = v;
  }
  try {
    const raw = localStorage.getItem('sh_token');
    if (raw) h.Authorization = `Bearer ${raw}`;
  } catch { /* ignore */ }
  return h;
}

async function request(path, options = {}) {
  // Client-side timeout. The API sits behind shared hosting that terminates
  // slow requests at roughly 60s and returns an HTML error page; without this
  // the fetch would hang for minutes and the UI would sit on "loading" forever.
  // Aborting first lets callers show a real message and retry.
  const controller = new AbortController();
  const timeoutMs = options.timeout ?? 30000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: headers(options.headers),
      signal: controller.signal,
    });
  } catch (e) {
    // Distinguish "we gave up" from "the network failed" — they need different
    // copy, and conflating them is how a timeout became an unexplained spinner.
    if (e?.name === 'AbortError') {
      const err = new Error(`The server took longer than ${Math.round(timeoutMs / 1000)}s and the request was cancelled.`);
      err.code = 'timeout';
      err.status = 0;
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  const data = await readApiResponse(res);
  if (!res.ok) {
    // Carry `status` and the parsed payload on the Error. Several routes answer
    // with a structured flag rather than a bare 403 — notably
    // `emailVerificationRequired` on profile/messaging gates — and callers need
    // to tell "verify your email" apart from a genuine 404.
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}

export const http = {
  get: (path, opts) => request(path, opts),
  // `opts` carries the per-call timeout. Article drafting needs a longer budget
  // than ordinary writes, and the shared host kills anything past ~60s — so the
  // two AI routes pass an explicit value rather than inheriting the default.
  post: (path, body, opts) => request(path, { method: 'POST', body: JSON.stringify(body ?? {}), ...(opts || {}) }),
  put: (path, body, opts) => request(path, { method: 'PUT', body: JSON.stringify(body ?? {}), ...(opts || {}) }),
  del: (path, opts) => request(path, { method: 'DELETE', ...(opts || {}) }),
  // Returns the raw Response (not JSON) for binary endpoints. Accepts either a
  // path or an already-absolute URL — apiUrl() output must not be double-prefixed
  // with BASE.
  raw: async (path) => {
    const url = /^https?:\/\//i.test(path) ? path : `${BASE}${path.startsWith('/') ? '' : '/'}${path}`;
    return fetch(url, { headers: headers() });
  },
  // Multipart upload. Content-Type is deliberately NOT set: the browser must add
  // the multipart boundary itself, and forcing a header breaks the parse.
  upload: (path, formData) => request(path, { method: 'POST', body: formData, headers: { 'Content-Type': undefined } }),
  setToken: (token) => {
    try {
      if (token) localStorage.setItem('sh_token', token);
      else localStorage.removeItem('sh_token');
    } catch { /* ignore */ }
  },
};
