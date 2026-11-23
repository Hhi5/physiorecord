// =======================================================================
// PhysioRecord — Pure Security Validation & Sanitization Primitives
// Zero runtime dependencies; decoupled for deterministic unit testing.
// Covers:
//  - SSRF protection (strict RFC1918 / loopback / .local LAN URL allowlist)
//  - Strict URL-parsed external link allowlist (WhatsApp, Maps, Official GitHub)
//  - Google Drive ID validation (prevents Drive query injection)
//  - Exported offline HTML XSS & active-content sanitizer
//  - Prototype-pollution-safe JSON parsing
// =======================================================================

import { DANGEROUS_OBJECT_KEYS } from '../config/appConstants';
import { isAllowedOfficialGithubUrl } from './updateSafety';

const DRIVE_ID_RE = /^[a-zA-Z0-9_-]{8,128}$/;
const SAFE_DEVICE_ID_RE = /^[a-zA-Z0-9_-]{4,64}$/;

/**
 * Validates that a hostname is strictly a private RFC1918 IPv4 address,
 * loopback (`127.0.0.1` / `localhost`), or local mDNS hostname (`*.local`).
 * Explicitly rejects link-local cloud metadata (`169.254.x.x`), IPv6 literals,
 * and public internet domains to prevent SSRF and pairing-token exfiltration.
 */
export function isPrivateLanHostname(hostname: string): boolean {
  const host = String(hostname || '').trim().toLowerCase();
  if (!host || host.length > 253) return false;

  if (host === 'localhost' || host === '127.0.0.1') {
    return true;
  }

  // Allow local mDNS hostnames (e.g., clinic-pc.local) with strict label characters
  if (/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.local$/.test(host)) {
    return true;
  }

  // Parse dotted-quad IPv4 strictly (reject octal/hex/short forms)
  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4Match) return false;

  const octets = ipv4Match.slice(1).map((part) => {
    // Reject leading zeros like 010.0.0.1
    if (part.length > 1 && part.startsWith('0')) return -1;
    return Number(part);
  });

  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }

  const [a, b] = octets;

  // 10.0.0.0/8 (RFC 1918)
  if (a === 10) return true;
  // 172.16.0.0/12 (RFC 1918)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16 (RFC 1918)
  if (a === 192 && b === 168) return true;
  // 127.0.0.0/8 loopback
  if (a === 127) return true;

  // Explicitly rejects 169.254.0.0/16 (cloud metadata / APIPA), 0.0.0.0, and all public IPs
  return false;
}

/**
 * Validates a Local Wi-Fi (LAN) Clinic Sync Hub base URL.
 * Requires `http:` or `https:`, zero embedded credentials (`username`/`password`),
 * a private LAN / loopback / `.local` hostname, optional valid port, and root path only.
 */
export function isPrivateLanSyncUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (!trimmed || /[\s\r\n\0]/.test(trimmed)) return false;

  let parsed: URL;
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

  return isPrivateLanHostname(parsed.hostname);
}

const STATIC_ALLOWED_LAN_CORS_ORIGINS = new Set([
  'app://bundle',
  'capacitor://localhost',
  'https://physiorecord.pages.dev',
]);

/**
 * Validates and canonicalizes a request `Origin` header for the Local Wi-Fi (LAN) Clinic Sync Hub.
 * Returns a canonical origin string from the strict allowlist (or private RFC1918 LAN origin),
 * and rejects arbitrary `*.pages.dev` tenants or external internet origins.
 */
export function getValidatedLanCorsOrigin(origin: string | undefined | null): string | null {
  if (!origin || typeof origin !== 'string') return null;
  const trimmed = origin.trim();
  if (!trimmed || /[\s\r\n\0]/.test(trimmed)) return null;
  if (STATIC_ALLOWED_LAN_CORS_ORIGINS.has(trimmed)) {
    for (const allowed of STATIC_ALLOWED_LAN_CORS_ORIGINS) {
      if (allowed === trimmed) return allowed;
    }
  }
  let parsed: URL;
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

/**
 * Strict URL-parsed allowlist for opening external links from Web, Electron, or Android:
 * - `https://wa.me/...`
 * - `https://api.whatsapp.com/...`
 * - `https://google.com/maps/...` or `https://www.google.com/maps/...`
 * - Official PhysioRecord GitHub repo & release URLs
 * Rejects non-HTTPS, embedded credentials, control characters, and unknown domains.
 */
export function isAllowedExternalActionUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (!trimmed || /[\u0000-\u001F\u007F]/.test(trimmed)) return false;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password) return false;
  if (parsed.port && parsed.port !== '443') return false;

  const host = parsed.hostname.toLowerCase();
  if (host === 'wa.me' || host === 'api.whatsapp.com') {
    return true;
  }
  if (host === 'google.com' || host === 'www.google.com') {
    return parsed.pathname === '/maps' || parsed.pathname.startsWith('/maps/');
  }
  if (host === 'github.com') {
    return isAllowedOfficialGithubUrl(trimmed);
  }

  return false;
}

/**
 * Validates a Google Drive file or folder ID strictly against Google Drive's ID alphabet
 * to eliminate query string injection (`q = "'<id>' in parents"`).
 */
export function isValidGoogleDriveId(id: string | undefined | null): id is string {
  return typeof id === 'string' && DRIVE_ID_RE.test(id.trim());
}

/**
 * Validates a clinic sync device identifier (strictly alphanumeric, `-`, `_`).
 */
export function isSafeSyncDeviceId(deviceId: string | undefined | null): deviceId is string {
  return typeof deviceId === 'string' && SAFE_DEVICE_ID_RE.test(deviceId.trim());
}

/**
 * Generates a cryptographically strong random hex string using WebCrypto CSPRNG.
 */
export function randomHexCsprng(byteLength: number): string {
  const bytes = new Uint8Array(Math.max(1, byteLength));
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Prototype-pollution-safe JSON parser that drops `__proto__`, `constructor`, and `prototype`
 * keys from untrusted JSON inputs (sync envelopes, imported files, external responses).
 */
export function safeJsonParse<T = unknown>(rawJson: string): T {
  return JSON.parse(rawJson, (key, value) => {
    if (DANGEROUS_OBJECT_KEYS.has(key)) {
      return undefined;
    }
    return value;
  }) as T;
}

function decodeHtmlEntitiesForUrlCheck(raw: string): string {
  return raw
    .replace(/&#x([0-9a-f]+);?/gi, (_m, hex: string) => {
      const cp = Number.parseInt(hex, 16);
      return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
    })
    .replace(/&#([0-9]+);?/g, (_m, dec: string) => {
      const cp = Number.parseInt(dec, 10);
      return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
    })
    .replace(/&colon;?/gi, ':')
    .replace(/&tab;?/gi, '\t')
    .replace(/&newline;?/gi, '\n')
    .replace(/&amp;?/gi, '&');
}

/**
 * Strips dangerous active HTML content (scripts, iframes, embeds, objects, forms, meta/base/link,
 * SVG active elements, inline `on*` event handler attributes including slash-separated forms,
 * entity-encoded `javascript:`/`vbscript:`/`data:text/html` URIs, CSS `@import`, and legacy
 * `expression(...)`) from printed document HTML before saving or sharing offline `.html`.
 */
export function sanitizeExportedDocumentHtml(rawHtml: string): string {
  if (!rawHtml || typeof rawHtml !== 'string') return '';

  let cleaned = rawHtml;

  // Iterate until stable to prevent nested-tag smuggling (e.g. `<scr<script>ipt>`)
  for (let pass = 0; pass < 4; pass++) {
    const prev = cleaned;

    // 1. Remove paired dangerous elements with their bodies
    cleaned = cleaned.replace(
      /<\s*(script|iframe|object|embed|applet|noscript|template|foreignobject|animate|set|use)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi,
      ''
    );

    // 2. Remove standalone / self-closing dangerous elements
    cleaned = cleaned.replace(
      /<\s*\/?\s*(script|iframe|object|embed|applet|base|meta|link|form|animate|set|use)\b[^>]*\/?>/gi,
      ''
    );

    // 3. Strip all inline event handler attributes (on*=...) — whitespace or slash separated
    cleaned = cleaned.replace(
      /(?:[\s/]+)on[a-z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
      ''
    );

    // 4. Neutralize javascript:, vbscript:, data:text/html, and data:image/svg+xml URIs (including entity-encoded forms)
    cleaned = cleaned.replace(
      /(\b(?:href|src|xlink:href|action|formaction)\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
      (_match, attrPrefix: string, dq?: string, sq?: string, bare?: string) => {
        const rawVal = (dq ?? sq ?? bare ?? '').trim();
        const decodedVal = decodeHtmlEntitiesForUrlCheck(rawVal);
        const normalized = decodedVal.replace(/[\u0000-\u0020]+/g, '').toLowerCase();
        if (
          normalized.startsWith('javascript:') ||
          normalized.startsWith('vbscript:') ||
          normalized.startsWith('data:text/html') ||
          normalized.startsWith('data:image/svg+xml')
        ) {
          return `${attrPrefix}"#"`;
        }
        if (dq !== undefined) return `${attrPrefix}"${dq}"`;
        if (sq !== undefined) return `${attrPrefix}'${sq}'`;
        return `${attrPrefix}${bare ?? ''}`;
      }
    );

    // 5. Neutralize dangerous CSS expressions, @import rules, and javascript url() inside styles
    cleaned = cleaned.replace(/expression\s*\(/gi, 'blocked(');
    cleaned = cleaned.replace(/url\s*\(\s*['"]?\s*javascript:/gi, 'url(blocked:');
    cleaned = cleaned.replace(/@import\b[^;]*(?:;|$)/gi, '');

    if (cleaned === prev) break;
  }

  return cleaned;
}

/**
 * Copies sensitive secrets (Emergency Recovery Keys) to clipboard and schedules
 * automatic clipboard clearing after 60 seconds so secrets do not linger in copy history.
 */
export const CLIPBOARD_AUTO_CLEAR_MS = 60_000;

let activeClearTimer: ReturnType<typeof setTimeout> | null = null;
let lastCopiedMarker: string | null = null;

export function cancelPendingClipboardClear(): void {
  if (activeClearTimer) {
    clearTimeout(activeClearTimer);
    activeClearTimer = null;
  }
  lastCopiedMarker = null;
}

export async function copySecretWithAutoClear(
  secretText: string,
  clearAfterMs: number = CLIPBOARD_AUTO_CLEAR_MS
): Promise<{ copied: boolean; clearScheduled: boolean }> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    return { copied: false, clearScheduled: false };
  }

  await navigator.clipboard.writeText(secretText);
  cancelPendingClipboardClear();
  lastCopiedMarker = secretText;

  if (clearAfterMs > 0 && typeof setTimeout !== 'undefined') {
    activeClearTimer = setTimeout(() => {
      activeClearTimer = null;
      const expectedSecret = lastCopiedMarker;
      lastCopiedMarker = null;
      void (async () => {
        try {
          if (typeof navigator.clipboard?.readText === 'function') {
            const current = await navigator.clipboard.readText().catch(() => expectedSecret);
            if (expectedSecret && current !== expectedSecret) {
              return;
            }
          }
          await navigator.clipboard.writeText('');
        } catch {
          // Ignore browser focus / permission restrictions on background clipboard overwrite
        }
      })();
    }, clearAfterMs);
    return { copied: true, clearScheduled: true };
  }

  return { copied: true, clearScheduled: false };
}
