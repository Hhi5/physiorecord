// =======================================================================
// PhysioRecord — Zero-Dependency Offline PWA & Strict Build CSP Plugin
// License: GPL-3.0-or-later (Original Project Code)
// Emits /manifest.webmanifest and /sw.js during Vite production build and
// stamps strict Content-Security-Policy meta tag into built dist/index.html.
// =======================================================================

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const PROD_META_CSP =
  "default-src 'self'; script-src 'self' https://apis.google.com; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://lh3.googleusercontent.com; font-src 'self'; frame-src 'self' https://*.firebaseapp.com https://accounts.google.com; connect-src 'self' https://api.github.com https://www.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://apis.google.com http:; object-src 'none'; base-uri 'self'; form-action 'self'";

export const HTTP_HEADER_CSP =
  "default-src 'self'; script-src 'self' https://apis.google.com; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://lh3.googleusercontent.com; font-src 'self'; frame-src 'self' https://*.firebaseapp.com https://accounts.google.com; connect-src 'self' https://api.github.com https://www.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://apis.google.com http:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

export const ANDROID_META_CSP =
  "default-src 'self'; script-src 'self' https://apis.google.com; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://lh3.googleusercontent.com; font-src 'self' data:; frame-src 'self' https://*.firebaseapp.com https://accounts.google.com; connect-src 'self' https://api.github.com https://www.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://apis.google.com http:; object-src 'none'; base-uri 'self'; form-action 'self'";

export const DESKTOP_META_CSP =
  "default-src 'self' app:; script-src 'self' app:; worker-src 'self' app: blob:; style-src 'self' app: 'unsafe-inline'; img-src 'self' app: data: blob:; font-src 'self' app: data:; connect-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'";

function listPublicFiles(dir, baseDir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const relDir = path.relative(baseDir, full).split(path.sep).join('/');
      if (relDir === 'assets/aistudio') continue;
      results.push(...listPublicFiles(full, baseDir));
    } else {
      const rel = path.relative(baseDir, full).split(path.sep).join('/');
      if (rel === '_headers' || rel === 'sw.js' || rel === 'manifest.webmanifest') continue;
      results.push(`/${rel}`);
    }
  }
  return results;
}

export function physioRecordPwaPlugin() {
  let rootDir = process.cwd();
  let publicDir = path.join(rootDir, 'public');

  return {
    name: 'physiorecord-pwa-and-csp',

    configResolved(config) {
      rootDir = config.root;
      publicDir = config.publicDir || path.join(rootDir, 'public');
    },

    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        // Apply strict CSP <meta> in built bundles (ctx.server is set only during Vite dev/HMR)
        if (ctx.server) return html;
        if (html.includes('http-equiv="Content-Security-Policy"')) return html;
        const appTarget = (process.env.VITE_APP_TARGET || 'web').toLowerCase();
        const metaCsp =
          appTarget === 'desktop'
            ? DESKTOP_META_CSP
            : appTarget === 'android'
              ? ANDROID_META_CSP
              : PROD_META_CSP;
        return html.replace(
          '<head>',
          `<head>\n    <meta http-equiv="Content-Security-Policy" content="${metaCsp}" />`
        );
      },
    },

    generateBundle(_options, bundle) {
      const appTarget = (process.env.VITE_APP_TARGET || 'web').toLowerCase();
      if (appTarget === 'android' || appTarget === 'desktop') {
        // Native Capacitor (Android) and Electron (Windows) bundle local assets directly;
        // skip Service Worker & Web App Manifest emission while keeping strict CSP <meta>.
        return;
      }

      const precacheUrls = new Set(['/', '/index.html', '/manifest.webmanifest']);

      for (const fileName of Object.keys(bundle)) {
        if (fileName === 'sw.js' || fileName === '_headers') continue;
        if (fileName.endsWith('.map')) continue;
        precacheUrls.add(`/${fileName.replace(/^\//, '')}`);
      }

      for (const pubUrl of listPublicFiles(publicDir, publicDir)) {
        precacheUrls.add(pubUrl);
      }

      const sortedUrls = Array.from(precacheUrls).sort();
      const cacheRevision = crypto
        .createHash('sha256')
        .update(sortedUrls.join('\n') + '|' + Date.now())
        .digest('hex')
        .slice(0, 16);
      const cacheName = `physiorecord-offline-${cacheRevision}`;

      const manifest = {
        name: 'PhysioRecord — التوثيق السريري للعلاج الطبيعي',
        short_name: 'PhysioRecord',
        description:
          'Local-first encrypted physical therapy EHR operating strictly on this device without cloud telemetry.',
        lang: 'ar',
        dir: 'rtl',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f8fafc',
        theme_color: '#0f766e',
        icons: [
          {
            src: '/icons/physiorecord-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      };

      this.emitFile({
        type: 'asset',
        fileName: 'manifest.webmanifest',
        source: JSON.stringify(manifest, null, 2),
      });

      const swSource = `// PhysioRecord Offline Service Worker (Same-Origin Strict)
const CACHE_NAME = ${JSON.stringify(cacheName)};
const PRECACHE_URLS = ${JSON.stringify(sortedUrls, null, 2)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('physiorecord-offline-') && k !== CACHE_NAME)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Strict same-origin policy: never proxy or cache cross-origin URLs
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          }
          return response;
        })
        .catch(() => caches.match('/index.html').then((cached) => cached || caches.match('/')))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((response) => {
        if (response && response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return response;
      });
    })
  );
});
`;

      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: swSource,
      });
    },
  };
}
