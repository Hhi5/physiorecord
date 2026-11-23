// =======================================================================
// PhysioRecord — Production Hosted Web Platform Access & Install Gate
// Enforces local-first distribution on hosted web origins:
// - iPhone/iPad Standalone (Home Screen): ALLOWED (full local encrypted app)
// - iPhone/iPad Safari Tab (not installed): BLOCKED -> Guided Add-to-Home-Screen
// - iPhone/iPad Chrome/Edge/In-App Browser: BLOCKED -> Copy Link & Open in Safari
// - Android Browser (non-APK): BLOCKED -> Direct Download Official Android APK
// - Desktop Browser (non-Electron): BLOCKED -> Direct Download Official Desktop App
// - Native Shells (Electron / Capacitor) & Dev/Preview Hosts: ALWAYS ALLOWED
// =======================================================================

import { detectIosPwaEnvironment } from './pwaClient';

export type PlatformGateMode =
  | 'allow'
  | 'ios-safari-install'
  | 'ios-open-in-safari'
  | 'macos-install-app'
  | 'android-download-apk'
  | 'desktop-download-app';

export interface PlatformGateInput {
  hostname: string;
  protocol: string;
  search: string;
  userAgent: string;
  maxTouchPoints: number;
  isStandalone: boolean;
  isNativeShell: boolean;
}

export interface PlatformGateDecision {
  mode: PlatformGateMode;
  desktopOs: 'windows' | 'macos' | 'linux' | 'other';
  isMacSafari: boolean;
  isDevOrPreviewHost: boolean;
}

const VALID_PREVIEW_GATES = new Set<PlatformGateMode>([
  'ios-safari-install',
  'ios-open-in-safari',
  'macos-install-app',
  'android-download-apk',
  'desktop-download-app',
]);

export function isDevOrPreviewHostname(hostname: string): boolean {
  const host = (hostname || '').trim().toLowerCase();
  if (!host) return true;
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host === '::1' ||
    host === '0.0.0.0'
  ) {
    return true;
  }
  if (
    host.endsWith('.local') ||
    host.endsWith('.localhost') ||
    host.endsWith('.run.app') ||
    host.endsWith('.webcontainer.io')
  ) {
    return true;
  }
  // Private LAN IPv4 addresses used for local clinic testing
  return (
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)
  );
}

export function detectDesktopOs(userAgent: string): 'windows' | 'macos' | 'linux' | 'other' {
  const ua = userAgent || '';
  if (/\bWindows\b/i.test(ua)) return 'windows';
  if (/\bMacintosh\b|\bMac OS X\b/i.test(ua)) return 'macos';
  if (/\bLinux\b|\bX11\b/i.test(ua)) return 'linux';
  return 'other';
}

export function detectMacSafari(userAgent: string): boolean {
  const ua = userAgent || '';
  const hasSafariSignature = /\bVersion\/\d/i.test(ua) && /\bSafari\/\d/i.test(ua);
  const isNonSafariDesktop =
    /Chrome|Chromium|Edg\/|OPR\/|Firefox|Brave|Vivaldi|YaBrowser|Arc|Orion|DuckDuckGo/i.test(ua);
  return hasSafariSignature && !isNonSafariDesktop;
}

function parseQueryParam(search: string, key: string): string | null {
  if (!search) return null;
  try {
    const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
    return params.get(key);
  } catch {
    return null;
  }
}

export function resolvePlatformAccessGate(input: PlatformGateInput): PlatformGateDecision {
  const desktopOs = detectDesktopOs(input.userAgent);
  const isMacSafari = desktopOs === 'macos' && detectMacSafari(input.userAgent);
  const isDevOrPreviewHost = isDevOrPreviewHostname(input.hostname);

  // 1. Native shells (Electron Windows, Capacitor Android/iOS) are ALWAYS allowed
  if (input.isNativeShell) {
    return { mode: 'allow', desktopOs, isMacSafari, isDevOrPreviewHost };
  }

  // 2. Non-HTTP protocols (file://, capacitor://, app://) are ALWAYS allowed
  const protocol = (input.protocol || '').toLowerCase();
  if (protocol && protocol !== 'http:' && protocol !== 'https:') {
    return { mode: 'allow', desktopOs, isMacSafari, isDevOrPreviewHost };
  }

  // 3. Dev / Preview hosts allow normal work unless explicitly testing the gate
  if (isDevOrPreviewHost) {
    const explicitPreviewGate = parseQueryParam(input.search, 'gate') as PlatformGateMode | null;
    if (explicitPreviewGate && VALID_PREVIEW_GATES.has(explicitPreviewGate)) {
      return { mode: explicitPreviewGate, desktopOs, isMacSafari, isDevOrPreviewHost };
    }
    const forceRealGate = parseQueryParam(input.search, 'platformGate') === '1';
    if (!forceRealGate) {
      return { mode: 'allow', desktopOs, isMacSafari, isDevOrPreviewHost };
    }
  }

  // 4. Production hosted web origin: enforce strict local-first platform routing
  const iosEnv = detectIosPwaEnvironment({
    userAgent: input.userAgent,
    maxTouchPoints: input.maxTouchPoints,
    isStandalone: input.isStandalone,
    isNativeShell: false,
  });

  if (iosEnv.isIosDevice) {
    // Installed on iPhone/iPad Home Screen -> Full local offline clinical app!
    if (input.isStandalone) {
      return { mode: 'allow', desktopOs, isMacSafari, isDevOrPreviewHost };
    }
    // Regular Safari browser tab -> require Add to Home Screen first
    if (iosEnv.isIosSafari) {
      return { mode: 'ios-safari-install', desktopOs, isMacSafari, isDevOrPreviewHost };
    }
    // ANY other iOS browser (Chrome, Edge, Firefox, Brave, Opera, WhatsApp, etc.) -> Open in Safari first
    return { mode: 'ios-open-in-safari', desktopOs, isMacSafari, isDevOrPreviewHost };
  }

  // Android browser -> always direct to official APK release
  if (/\bAndroid\b/i.test(input.userAgent || '')) {
    return { mode: 'android-download-apk', desktopOs, isMacSafari, isDevOrPreviewHost };
  }

  // macOS (MacBook / iMac) has no .dmg in Releases yet: allow Standalone Dock/Installed App,
  // and guide browser-tab visitors to install it as a standalone local Mac app.
  if (desktopOs === 'macos') {
    if (input.isStandalone) {
      return { mode: 'allow', desktopOs, isMacSafari, isDevOrPreviewHost };
    }
    return { mode: 'macos-install-app', desktopOs, isMacSafari, isDevOrPreviewHost };
  }

  // Linux standalone PWA allowed if installed; Windows ALWAYS routes to official .exe
  if (desktopOs === 'linux' && input.isStandalone) {
    return { mode: 'allow', desktopOs, isMacSafari, isDevOrPreviewHost };
  }

  // Desktop browser (Windows / Linux non-standalone) -> direct to official desktop release
  return { mode: 'desktop-download-app', desktopOs, isMacSafari, isDevOrPreviewHost };
}
