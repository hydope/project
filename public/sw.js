// Service worker DISABLED — it was pinning stale JavaScript bundles on
// users' devices after deploys, causing persistent "Something went wrong"
// errors that a refresh could not fix.
//
// This file unregisters itself and clears all caches. Every client it
// controls gets a clean slate on next load.
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.claim())
  );
});
