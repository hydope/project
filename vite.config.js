import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Environment variable prefix for Vite
const defineOptions = {
  'process.env': {}
};

// Add all env vars that start with VITE_ or are in a allowed list
// Vite only exposes VITE_* vars to client code by default
const allowedEnvVars = [
  'NVIDIA_NIM_BASE_URL',
  'NVIDIA_NIM_MODEL'
];

allowedEnvVars.forEach(key => {
  if (process.env[key]) {
    defineOptions['process.env'][key] = JSON.stringify(process.env[key]);
  }
});

// Per-build asset namespace (2026-11-12 incident fix). Two successive
// builds once produced the SAME chunk filename (users-<hash>.js) with
// different export contracts; immutable edge caching froze the old copy,
// and phones loading the new build's importers crashed with
// "does not provide an export named 'U'". Content hashes alone do not
// make a filename unique across builds — the hash is over content that
// can coincide for re-export barrels — so every deploy now ships its
// chunks under assets/b-<buildId>/, a directory no earlier build ever
// used. A fresh page load therefore only ever requests URLs that were
// minted by its own build; stale edge copies of old URLs are simply
// never referenced again. BUILD_ID comes from CI (github.sha); local
// builds share the harmless 'local' namespace.
const buildId = (process.env.BUILD_ID || process.env.GITHUB_SHA || 'local')
  .replace(/[^a-zA-Z0-9-]/g, '')
  .slice(0, 12) || 'local';

export default defineConfig({
  plugins: [react()],
  // Build ID — injected into the bundle so the app can detect when the
  // server has a newer deploy than the running code (stale chunk guard).
  define: {
    '__BUILD_ID__': JSON.stringify(new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')),
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@lib': resolve(__dirname, 'src/lib'),
      '@components': resolve(__dirname, 'src/components'),
      '@pages': resolve(__dirname, 'src/pages'),
      '@hooks': resolve(__dirname, 'src/hooks'),
      '@assets': resolve(__dirname, 'src/assets')
    }
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      // PHP API is the default live backend for local development.
      '/api': { target: 'http://127.0.0.1:8888', changeOrigin: true },
    },
  },
  define: defineOptions,
  build: {
    outDir: 'dist',
    assetsDir: `assets/b-${buildId}`,
    // es2022 floor (2026-11-12, speed batch): every browser that can run
    // React 19 clears it (Chrome 94+, Safari 15.4+, Firefox 93+), and it
    // lets esbuild drop transpile shims for class fields, .at(),
    // Object.hasOwn and friends — measured −3.0 KB of total gzip, which
    // is what puts the bundle budget back in the green with headroom.
    target: 'es2022',
    // Don't preload below-the-fold vendor/layout chunks on first paint.
    // vendor-motion (framer-motion) and MainLayout are only needed when a
    // guarded member route renders or a toast fires — both happen after
    // first paint. They still load on demand via the dynamic-import runtime.
    modulePreload: {
      // No preload polyfill (2026-11-12, speed batch): every browser that
      // can run this app (React 19, native ESM) supports modulepreload
      // natively, and dynamic import works regardless — the polyfill was
      // ~1 KB of entry code emulating preload hints for browsers that
      // cannot run the app anyway.
      polyfill: false,
      resolveDependencies: (filename, deps) =>
        deps.filter((d) => !d.includes('vendor-motion') && !d.includes('MainLayout')),
    },
    rollupOptions: {
      output: {
        // Split slow-moving vendor code from the app entry so repeat visits
        // reuse the cached vendor chunk across deploys (immutable headers).
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-motion': ['framer-motion'],
          'vendor-utils': ['swr'],
        },
      },
    }
  }
});
