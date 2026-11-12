import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css'; // Import global styles
import './styles/premium.css'; // Premium design layer
import { healChunkLoadError, clearChunkHealFlagOnBoot } from './lib/chunkHeal.js';

// Stale-bundle self-heal (see lib/chunkHeal.js): a chunk/dynamic-import
// failure that escapes a React boundary — preload failures, layout-level
// lazy imports — still gets the one guarded hard reload instead of
// stranding the member on an error screen after a deploy.
window.addEventListener('error', (event) => {
  healChunkLoadError(event.error ?? event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  healChunkLoadError(event.reason);
});
// Vite's own preload channel: __vite__preload dispatches this before it
// throws, so it is the earliest signal of a dead chunk on this stack.
window.addEventListener('vite:preloadError', (event) => {
  if (healChunkLoadError(event.payload)) event.preventDefault();
});

// SPA navigations should always start at the top — no browser scroll restoration jumps
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

// Mark JS as running for the fail-safe reveal system: the hidden initial
// state in CSS only applies when this class exists. If this module never
// executes, content stays visible.
document.documentElement.classList.add('js');

// Installable app shell (PWA). Registered only in secure contexts and never in
// dev, so a stale shell can't mask local code changes.
if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* offline shell is a bonus, not a requirement */ });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Boot survived → forget any earlier heal so the next deploy can heal too.
clearChunkHealFlagOnBoot();