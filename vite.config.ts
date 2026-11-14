import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {HTTP_HEADER_CSP, physioRecordPwaPlugin} from './scripts/vite-pwa-plugin.mjs';

const PREVIEW_SECURITY_HEADERS = {
  'Content-Security-Policy': HTTP_HEADER_CSP,
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(self), geolocation=()',
};

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), physioRecordPwaPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    build: {
      // Never inline small @fontsource .woff/.woff2 assets as data: URIs so strict `font-src 'self'` CSP holds.
      assetsInlineLimit: 0,
    },
    worker: {
      format: 'es' as const,
    },
    preview: {
      headers: PREVIEW_SECURITY_HEADERS,
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
