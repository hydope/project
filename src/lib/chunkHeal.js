// Stale-bundle self-heal, shared by the entry point and both error
// boundaries. After a deploy, a client can hold a page/bundle mix whose
// lazy chunks no longer exist on the server (deploys replace every hashed
// chunk name). The dynamic import then fails and there is no in-place
// retry that can fix it — the only cure is one hard reload, so the
// browser fetches the fresh index.html (served no-store) and the chunks
// that match it.
//
// Loop safety: the heal is guarded by a timestamp in sessionStorage — at
// most one heal per HEAL_WINDOW_MS. If the reloaded page hits the same
// failure inside the window, the heal refuses and the caller's normal
// error screen shows instead of a reload loop. A boot that survives
// CLEAR_AFTER_MS clears the flag, so a later deploy can heal again
// (the previous per-boundary flags were never cleared, which permanently
// disabled self-healing for the rest of a long-lived mobile tab session).

const KEY = 'sr_chunk_heal_at';
const HEAL_WINDOW_MS = 30_000;
const CLEAR_AFTER_MS = 10_000;

// Real chunk-failure shapes across browsers and bundlers: webpack's
// ChunkLoadError, Chrome's dynamic-import TypeError, Safari's module
// message, Firefox's import failure, Vite's CSS preload failure, and
// Chrome's MIME rejection — the shape a missing chunk takes on this host,
// where the SPA fallback answers the dead URL with index.html instead of
// JavaScript.
const CHUNK_ERROR_RE =
  /chunkloaderror|loading chunk \d+ failed|failed to fetch dynamically imported module|failed to load module script|importing a module script failed|unable to preload css|error loading dynamically imported module/i;

export function isChunkLoadError(error) {
  if (!error) return false;
  if (error.name === 'ChunkLoadError') return true;
  return CHUNK_ERROR_RE.test(String(error.message || error));
}

// Set the moment this boot sees any chunk-load failure. A boot that is
// still failing must not have its heal flag cleared by the success timer
// below — the app shell can be alive while a route chunk is still
// erroring, and clearing early would re-arm a second heal inside the
// window for one incident.
let bootSawChunkError = false;

// If `error` is a chunk-load failure and no heal happened inside the
// window, start one hard reload and return true. Otherwise return false
// and let the caller fall through to its normal error UI.
export function healChunkLoadError(error) {
  if (!isChunkLoadError(error)) return false;
  bootSawChunkError = true;
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < HEAL_WINDOW_MS) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false; // no storage → cannot guard → never risk a loop
  }
  window.location.reload();
  return true;
}

// Call once at boot: if the app is still alive after CLEAR_AFTER_MS —
// and this boot saw no chunk failure — the load counts as successful:
// forget any earlier heal.
export function clearChunkHealFlagOnBoot() {
  setTimeout(() => {
    if (bootSawChunkError) return;
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* storage unavailable — the timestamp window still bounds heals */
    }
  }, CLEAR_AFTER_MS);
}
