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
  isIosSafariInstallEligible: boolean;
  updateReady: boolean;
  offlineReady: boolean;
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

function detectIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIos = /iPad|iPhone|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return isIos && isSafari;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let waitingWorker: ServiceWorker | null = null;
let swRegistration: ServiceWorkerRegistration | null = null;

const listeners = new Set<() => void>();

const state: PwaClientState = {
  isStandalone: detectStandalone(),
  canInstallPrompt: false,
  isIosSafariInstallEligible: !detectStandalone() && detectIosSafari(),
  updateReady: false,
  offlineReady: isNativeAppShell(),
};

function notify(): void {
  for (const fn of listeners) fn();
}

let initialized = false;

export function initPwaClient(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  if (isNativeAppShell()) {
    state.isStandalone = true;
    state.canInstallPrompt = false;
    state.isIosSafariInstallEligible = false;
    state.offlineReady = true;
    notify();
    return;
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
