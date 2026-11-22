// =======================================================================
// PhysioRecord — Offline PWA Service Worker & Install Prompt Helper (1.8)
// Strictly same-origin (/sw.js), zero external requests, zero paid plugins.
// =======================================================================

import { useEffect, useState } from 'react';
import { isNativeAppShell } from '../platform/nativeBridge';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface PwaClientState {
  isStandalone: boolean;
  canInstallPrompt: boolean;
  isIosDevice: boolean;
  isIosSafari: boolean;
  isIosOtherBrowser: boolean;
  isIosInstallEligible: boolean;
  /** Backwards-compatible alias for iOS Safari/browser home-screen install eligibility */
  isIosSafariInstallEligible: boolean;
  updateReady: boolean;
  offlineReady: boolean;
}

export interface IosPwaEnvironment {
  isIosDevice: boolean;
  isIosSafari: boolean;
  isIosOtherBrowser: boolean;
  isIosInstallEligible: boolean;
}

export function detectIosPwaEnvironment(params: {
  userAgent: string;
  maxTouchPoints: number;
  isStandalone: boolean;
  isNativeShell: boolean;
}): IosPwaEnvironment {
  const { userAgent, maxTouchPoints, isStandalone, isNativeShell } = params;
  if (isNativeShell) {
    return {
      isIosDevice: false,
      isIosSafari: false,
      isIosOtherBrowser: false,
      isIosInstallEligible: false,
    };
  }
  const ua = userAgent || '';
  const isClassicIos = /\b(iPad|iPhone|iPod)\b/i.test(ua);
  // iPadOS 13+ reports Macintosh desktop UA with touch points > 1
  const isModernIpad = /\bMacintosh\b/i.test(ua) && maxTouchPoints > 1;
  const isIosDevice = isClassicIos || isModernIpad;
  if (!isIosDevice) {
    return {
      isIosDevice: false,
      isIosSafari: false,
      isIosOtherBrowser: false,
      isIosInstallEligible: false,
    };
  }
  // Only real Apple Safari on iOS/iPadOS includes both Version/X and Safari/X
  // without third-party browser or social in-app WebView tokens.
  const isKnownThirdPartyOrInAppIosBrowser =
    /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|DuckDuckGo|GSA\/|FBAN|FBAV|FBIOS|Instagram|Line\/|MicroMessenger|WhatsApp|Telegram|Snapchat|Twitter|LinkedInApp|TikTok|BytedanceWebview|musical_ly|YaBrowser|UCBrowser|Vivaldi|Brave|Focus|Klar|Mercury|Puffin|Coast|Aloha|SamsungBrowser|QQBrowser|Baidu|Sogou|HuaweiBrowser|MiuiBrowser|BingWeb|Ecosia|Orion|Arc/i.test(
      ua
    );
  const hasRealSafariSignature = /\bVersion\/\d/i.test(ua) && /\bSafari\/\d/i.test(ua);
  const isIosSafari = hasRealSafariSignature && !isKnownThirdPartyOrInAppIosBrowser;
  const isIosOtherBrowser = !isIosSafari;
  return {
    isIosDevice: true,
    isIosSafari,
    isIosOtherBrowser,
    isIosInstallEligible: !isStandalone,
  };
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (isNativeAppShell()) return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches === true ||
    nav.standalone === true
  );
}

function computeIosEnv(): IosPwaEnvironment {
  if (typeof navigator === 'undefined') {
    return {
      isIosDevice: false,
      isIosSafari: false,
      isIosOtherBrowser: false,
      isIosInstallEligible: false,
    };
  }
  return detectIosPwaEnvironment({
    userAgent: navigator.userAgent || '',
    maxTouchPoints: typeof navigator.maxTouchPoints === 'number' ? navigator.maxTouchPoints : 0,
    isStandalone: detectStandalone(),
    isNativeShell: isNativeAppShell(),
  });
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let waitingWorker: ServiceWorker | null = null;
let swRegistration: ServiceWorkerRegistration | null = null;

const listeners = new Set<() => void>();

const initialStandalone = detectStandalone();
const initialIos = computeIosEnv();

const state: PwaClientState = {
  isStandalone: initialStandalone,
  canInstallPrompt: false,
  isIosDevice: initialIos.isIosDevice,
  isIosSafari: initialIos.isIosSafari,
  isIosOtherBrowser: initialIos.isIosOtherBrowser,
  isIosInstallEligible: initialIos.isIosInstallEligible,
  isIosSafariInstallEligible: initialIos.isIosInstallEligible,
  updateReady: false,
  offlineReady: isNativeAppShell(),
};

function notify(): void {
  for (const fn of listeners) fn();
}

function syncRuntimeDisplayMode(): void {
  const standaloneNow = detectStandalone();
  const iosNow = computeIosEnv();
  state.isStandalone = standaloneNow;
  state.isIosDevice = iosNow.isIosDevice;
  state.isIosSafari = iosNow.isIosSafari;
  state.isIosOtherBrowser = iosNow.isIosOtherBrowser;
  state.isIosInstallEligible = iosNow.isIosInstallEligible;
  state.isIosSafariInstallEligible = iosNow.isIosInstallEligible;
}

let initialized = false;

export function initPwaClient(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  if (isNativeAppShell()) {
    state.isStandalone = true;
    state.canInstallPrompt = false;
    state.isIosDevice = false;
    state.isIosSafari = false;
    state.isIosOtherBrowser = false;
    state.isIosInstallEligible = false;
    state.isIosSafariInstallEligible = false;
    state.offlineReady = true;
    notify();
    return;
  }

  syncRuntimeDisplayMode();

  const standaloneMedia = window.matchMedia?.('(display-mode: standalone)');
  if (standaloneMedia?.addEventListener) {
    standaloneMedia.addEventListener('change', () => {
      syncRuntimeDisplayMode();
      notify();
    });
  }

  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    state.canInstallPrompt = true;
    notify();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    state.canInstallPrompt = false;
    state.isStandalone = true;
    state.isIosInstallEligible = false;
    state.isIosSafariInstallEligible = false;
    notify();
  });

  if (
    'serviceWorker' in navigator &&
    window.location.protocol.startsWith('http') &&
    !import.meta.env.DEV
  ) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((registration) => {
          swRegistration = registration;
          if (registration.waiting) {
            waitingWorker = registration.waiting;
            state.updateReady = true;
            notify();
          }

          registration.addEventListener('updatefound', () => {
            const installing = registration.installing;
            if (!installing) return;
            installing.addEventListener('statechange', () => {
              if (installing.state === 'installed') {
                if (navigator.serviceWorker.controller) {
                  waitingWorker = installing;
                  state.updateReady = true;
                } else {
                  state.offlineReady = true;
                }
                notify();
              }
            });
          });
        })
        .catch(() => {
          // Non-fatal in environments where /sw.js is unavailable
        });

      // Only reload on Service Worker handoff when an existing controller was replaced (user update).
      // First-time `clients.claim()` changes controller from `null` -> active and must NOT reload mid-session.
      const hadController = Boolean(navigator.serviceWorker.controller);
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController || refreshing) return;
        refreshing = true;
        window.location.reload();
      });
    });
  }
}

export async function triggerPwaInstallPrompt(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable';
  const promptEvent = deferredPrompt;
  deferredPrompt = null;
  await promptEvent.prompt();
  const choice = await promptEvent.userChoice;
  state.canInstallPrompt = false;
  notify();
  return choice.outcome;
}

export function applyPwaUpdate(): void {
  if (waitingWorker) {
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  } else if (typeof window !== 'undefined') {
    window.location.reload();
  }
}

export async function checkForPwaUpdate(): Promise<'update-ready' | 'up-to-date' | 'unavailable'> {
  if (
    isNativeAppShell() ||
    typeof navigator === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !swRegistration
  ) {
    return 'unavailable';
  }
  try {
    await swRegistration.update();
    if (swRegistration.waiting) {
      waitingWorker = swRegistration.waiting;
      state.updateReady = true;
      notify();
      return 'update-ready';
    }
    return state.updateReady ? 'update-ready' : 'up-to-date';
  } catch {
    return 'unavailable';
  }
}

export function usePwaStatus(): PwaClientState {
  const [snapshot, setSnapshot] = useState<PwaClientState>({ ...state });

  useEffect(() => {
    initPwaClient();
    const update = () => setSnapshot({ ...state });
    listeners.add(update);
    update();
    return () => {
      listeners.delete(update);
    };
  }, []);

  return snapshot;
}
