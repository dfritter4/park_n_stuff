/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// recharts and its transitive chart-rendering dependencies are only used by
// the analytics page's charts (src/components/charts/*, src/components/analytics2/*).
// Routing them into their own chunk keeps the main bundle well under the
// 500 kB warning threshold. This Vite is built on rolldown, but rolldown
// still honors Rollup's `manualChunks` output option (a documented, if
// deprecated, compat path — see node_modules/rolldown's define-config
// types), so no non-standard config is needed.
const CHART_VENDOR_PATTERN =
  /[\\/]node_modules[\\/](recharts|victory-vendor|d3-[a-z-]+|decimal\.js-light|es-toolkit|eventemitter3|@reduxjs|react-redux|reselect|immer|use-sync-external-store|tiny-invariant)[\\/]/;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': process.env.VITE_PROXY_TARGET ?? 'http://localhost:3000',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (CHART_VENDOR_PATTERN.test(id)) {
            return 'charts';
          }
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
  },
});
