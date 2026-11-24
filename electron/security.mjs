// =======================================================================
// PhysioRecord Electron — Security, Validation, CSP & Atomic Config I/O
// =======================================================================

import { app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';

export const OFFICIAL_GITHUB_REPO = 'Hhi5/physiorecord';
export const DEFAULT_LAN_SYNC_PORT = 47821;
export const MAX_FILE_EXPORT_BYTES = 100 * 1024 * 1024;
export const MAX_SYNC_ENVELOPE_BYTES = 35 * 1024 * 1024;

export const MIME_BY_EXT = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

// Zero renderer network access: all opt-in external requests go through allowlisted main-process IPC
export const DESKTOP_CSP = [
  "default-src 'self' app:",
  "script-src 'self' app:",
  "style-src 'self' app: 'unsafe-inline'",
  "img-src 'self' app: data: blob:",
  "font-src 'self' app: data:",
  "worker-src 'self' app: blob:",
  "connect-src 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const DANGEROUS_JSON_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function getSettingsFilePath() {
  return path.join(app.getPath('userData'), 'desktop-bridge-config.json');
}

export async function readDesktopConfig() {
  try {
    const raw = await fs.readFile(getSettingsFilePath(), 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function writeDesktopConfig(nextConfig) {
  const filePath = getSettingsFilePath();
  const tmpPath = `${filePath}.tmp`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(tmpPath, JSON.stringify(nextConfig, null, 2), 'utf-8');
  await fs.rename(tmpPath, filePath);
}

export async function writeTextFileAtomically(targetPath, content) {
  const dir = path.dirname(targetPath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${targetPath}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, content, 'utf-8');
  await fs.rename(tmpPath, targetPath);
}

export function isAllowedExternalUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed || /[\u0000-\u001F\u007F]/.test(trimmed)) return false;
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password) return false;
  if (parsed.port && parsed.port !== '443') return false;

  const host = parsed.hostname.toLowerCase();
  if (host === 'wa.me' || host === 'api.whatsapp.com') return true;
  if (host === 'google.com' || host === 'www.google.com') {
    return parsed.pathname === '/maps' || parsed.pathname.startsWith('/maps/');
  }
  if (host === 'github.com') {
    return /^\/Hhi5\/physiorecord(\/releases(\/[^?#\s]*)?)?\/?$/i.test(parsed.pathname);
  }
  return false;
}

export function isPrivateLanSyncUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (!trimmed || /[\s\r\n\0]/.test(trimmed)) return false;
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password) return false;
  if (parsed.search || parsed.hash) return false;
  if (parsed.pathname !== '' && parsed.pathname !== '/') return false;
  if (parsed.port) {
    const portNum = Number(parsed.port);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) return false;
  }

  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1') return true;
  if (/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.local$/.test(host)) return true;

  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4Match) return false;
  const octets = ipv4Match.slice(1).map((p) => (p.length > 1 && p.startsWith('0') ? -1 : Number(p)));
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true;
  return false;
}

export function safeJsonParse(rawJson) {
  return JSON.parse(rawJson, (key, value) => {
    if (DANGEROUS_JSON_KEYS.has(key)) {
      return undefined;
    }
    return value;
  });
}

const STATIC_ALLOWED_LAN_CORS_ORIGINS = new Set([
  'app://bundle',
  'capacitor://localhost',
  'https://physiorecord.pages.dev',
  'https://physiorecord-app.resercher.workers.dev',
]);

export function getValidatedLanCorsOrigin(origin) {
  if (!origin || typeof origin !== 'string') return null;
  const trimmed = origin.trim();
  if (!trimmed || /[\s\r\n\0]/.test(trimmed)) return null;
  if (STATIC_ALLOWED_LAN_CORS_ORIGINS.has(trimmed)) {
    for (const allowed of STATIC_ALLOWED_LAN_CORS_ORIGINS) {
      if (allowed === trimmed) return allowed;
    }
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password) return null;
  const canonicalOrigin = `${parsed.protocol}//${parsed.host}`;
  if (STATIC_ALLOWED_LAN_CORS_ORIGINS.has(canonicalOrigin)) {
    for (const allowed of STATIC_ALLOWED_LAN_CORS_ORIGINS) {
      if (allowed === canonicalOrigin) return allowed;
    }
  }
  if (isPrivateLanSyncUrl(canonicalOrigin)) {
    return canonicalOrigin;
  }
  return null;
}

export function isAllowedLanCorsOrigin(origin) {
  return getValidatedLanCorsOrigin(origin) !== null;
}

export function createTrustedIpcSenderGuard(getMainWindow) {
  return function assertTrustedIpcSender(event) {
    const frameUrl = event?.senderFrame?.url || '';
    if (!frameUrl.startsWith('app://bundle/')) {
      throw new Error('Blocked IPC call from untrusted origin.');
    }
    const win = getMainWindow();
    if (win && !win.isDestroyed() && event?.sender?.id !== win.webContents.id) {
      throw new Error('Blocked IPC call from unknown WebContents.');
    }
  };
}
