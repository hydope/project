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
    assetsDir: 'assets',
    // Don't preload below-the-fold vendor/layout chunks on first paint.
    // vendor-motion (framer-motion) and MainLayout are only needed when a
    // guarded member route renders or a toast fires — both happen after
    // first paint. They still load on demand via the dynamic-import runtime.
    modulePreload: {
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
