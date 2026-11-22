import test from 'node:test';
import assert from 'node:assert/strict';
import { detectIosPwaEnvironment } from '../src/pwa/pwaClient.ts';
import { resolvePlatformAccessGate } from '../src/pwa/platformAccessGate.ts';

test('detects iPhone Safari as iOS Safari and install-eligible when not standalone', () => {
  const res = detectIosPwaEnvironment({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
    maxTouchPoints: 5,
    isStandalone: false,
    isNativeShell: false,
  });

  assert.equal(res.isIosDevice, true);
  assert.equal(res.isIosSafari, true);
  assert.equal(res.isIosOtherBrowser, false);
  assert.equal(res.isIosInstallEligible, true);
});

test('detects iPadOS 13+ desktop Safari UA via Macintosh + maxTouchPoints > 1', () => {
  const res = detectIosPwaEnvironment({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    maxTouchPoints: 5,
    isStandalone: false,
    isNativeShell: false,
  });

  assert.equal(res.isIosDevice, true);
  assert.equal(res.isIosSafari, true);
  assert.equal(res.isIosOtherBrowser, false);
  assert.equal(res.isIosInstallEligible, true);
});

test('detects Chrome on iOS (CriOS) as non-Safari iOS browser while keeping install eligibility true', () => {
  const res = detectIosPwaEnvironment({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1',
    maxTouchPoints: 5,
    isStandalone: false,
    isNativeShell: false,
  });

  assert.equal(res.isIosDevice, true);
  assert.equal(res.isIosSafari, false);
  assert.equal(res.isIosOtherBrowser, true);
  assert.equal(res.isIosInstallEligible, true);
});

test('suppresses install eligibility when already running in iOS standalone mode', () => {
  const res = detectIosPwaEnvironment({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
    maxTouchPoints: 5,
    isStandalone: true,
    isNativeShell: false,
  });

  assert.equal(res.isIosDevice, true);
  assert.equal(res.isIosSafari, true);
  assert.equal(res.isIosInstallEligible, false);
});

test('returns all false inside native Capacitor/Electron shell', () => {
  const res = detectIosPwaEnvironment({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    maxTouchPoints: 5,
    isStandalone: true,
    isNativeShell: true,
  });

  assert.deepEqual(res, {
    isIosDevice: false,
    isIosSafari: false,
    isIosOtherBrowser: false,
    isIosInstallEligible: false,
  });
});

test('does not misclassify macOS desktop Safari or Windows Chrome as iOS', () => {
  const macDesktop = detectIosPwaEnvironment({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    maxTouchPoints: 0,
    isStandalone: false,
    isNativeShell: false,
  });
  const winDesktop = detectIosPwaEnvironment({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    maxTouchPoints: 0,
    isStandalone: false,
    isNativeShell: false,
  });

  assert.equal(macDesktop.isIosDevice, false);
  assert.equal(macDesktop.isIosInstallEligible, false);
  assert.equal(winDesktop.isIosDevice, false);
  assert.equal(winDesktop.isIosInstallEligible, false);
});

test('platform gate enforces strict local-first routing on production hosted domains', () => {
  const prodBase = {
    hostname: 'physiorecord.pages.dev',
    protocol: 'https:',
    search: '',
    isNativeShell: false,
  };

  // 1) iPhone Safari tab -> blocked with Add-to-Home-Screen guide
  assert.equal(
    resolvePlatformAccessGate({
      ...prodBase,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
      maxTouchPoints: 5,
      isStandalone: false,
    }).mode,
    'ios-safari-install'
  );

  // 2) iPhone Home Screen Standalone -> ALLOWED
  assert.equal(
    resolvePlatformAccessGate({
      ...prodBase,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
      maxTouchPoints: 5,
      isStandalone: true,
    }).mode,
    'allow'
  );

  // 3) iPhone Chrome / WhatsApp in-app browser -> blocked with Open in Safari
  assert.equal(
    resolvePlatformAccessGate({
      ...prodBase,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1',
      maxTouchPoints: 5,
      isStandalone: false,
    }).mode,
    'ios-open-in-safari'
  );

  // 4) Android Chrome browser -> blocked with Official APK download
  assert.equal(
    resolvePlatformAccessGate({
      ...prodBase,
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
      maxTouchPoints: 5,
      isStandalone: false,
    }).mode,
    'android-download-apk'
  );

  // 5) Windows Desktop browser -> blocked with Official Windows App download
  const winDecision = resolvePlatformAccessGate({
    ...prodBase,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    maxTouchPoints: 0,
    isStandalone: false,
  });
  assert.equal(winDecision.mode, 'desktop-download-app');
  assert.equal(winDecision.desktopOs, 'windows');
});

test('platform gate always allows native shells and dev/preview hosts unless explicitly testing', () => {
  // Native shell (Electron / Capacitor)
  assert.equal(
    resolvePlatformAccessGate({
      hostname: 'physiorecord.pages.dev',
      protocol: 'https:',
      search: '',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0',
      maxTouchPoints: 0,
      isStandalone: true,
      isNativeShell: true,
    }).mode,
    'allow'
  );

  // Localhost dev default -> allowed
  assert.equal(
    resolvePlatformAccessGate({
      hostname: 'localhost',
      protocol: 'http:',
      search: '',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0',
      maxTouchPoints: 0,
      isStandalone: false,
      isNativeShell: false,
    }).mode,
    'allow'
  );

  // Localhost with ?platformGate=1 -> evaluates real gate
  assert.equal(
    resolvePlatformAccessGate({
      hostname: 'localhost',
      protocol: 'http:',
      search: '?platformGate=1',
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130.0',
      maxTouchPoints: 5,
      isStandalone: false,
      isNativeShell: false,
    }).mode,
    'android-download-apk'
  );
});

test('catches ALL third-party & in-app iOS browsers (Brave, Opera, Yandex, Instagram, WhatsApp, TikTok, Google App)', () => {
  const nonSafariUAs = [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1 OPT/4.2.0',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) YaBrowser/24.10.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0]',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/335.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WhatsApp/24.20',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 BytedanceWebview/d8a21c6',
    // Generic WKWebView without Version/ token (e.g. Telegram/in-app)
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  ];

  for (const ua of nonSafariUAs) {
    const decision = resolvePlatformAccessGate({
      hostname: 'physiorecord.pages.dev',
      protocol: 'https:',
      search: '',
      userAgent: ua,
      maxTouchPoints: 5,
      isStandalone: false,
      isNativeShell: false,
    });
    assert.equal(decision.mode, 'ios-open-in-safari', `Failed for UA: ${ua}`);
  }
});

test('routes macOS browser tabs to macos-install-app and allows macOS Standalone Dock/Installed App', () => {
  const macSafariTab = resolvePlatformAccessGate({
    hostname: 'physiorecord.pages.dev',
    protocol: 'https:',
    search: '',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    maxTouchPoints: 0,
    isStandalone: false,
    isNativeShell: false,
  });
  assert.equal(macSafariTab.mode, 'macos-install-app');
  assert.equal(macSafariTab.desktopOs, 'macos');
  assert.equal(macSafariTab.isMacSafari, true);

  const macChromeTab = resolvePlatformAccessGate({
    hostname: 'physiorecord.pages.dev',
    protocol: 'https:',
    search: '',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    maxTouchPoints: 0,
    isStandalone: false,
    isNativeShell: false,
  });
  assert.equal(macChromeTab.mode, 'macos-install-app');
  assert.equal(macChromeTab.isMacSafari, false);

  const macStandalone = resolvePlatformAccessGate({
    hostname: 'physiorecord.pages.dev',
    protocol: 'https:',
    search: '',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    maxTouchPoints: 0,
    isStandalone: true,
    isNativeShell: false,
  });
  assert.equal(macStandalone.mode, 'allow');
});
