import { describe, expect, it } from 'vitest';
import { detectIosPwaEnvironment } from '../pwaClient';
import { resolvePlatformAccessGate } from '../platformAccessGate';

describe('detectIosPwaEnvironment', () => {
  it('identifies iPhone Safari as install-eligible when in browser mode', () => {
    const res = detectIosPwaEnvironment({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
      maxTouchPoints: 5,
      isStandalone: false,
      isNativeShell: false,
    });

    expect(res).toEqual({
      isIosDevice: true,
      isIosSafari: true,
      isIosOtherBrowser: false,
      isIosInstallEligible: true,
    });
  });

  it('identifies iPadOS 13+ desktop Safari via Macintosh UA + touch points', () => {
    const res = detectIosPwaEnvironment({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
      maxTouchPoints: 5,
      isStandalone: false,
      isNativeShell: false,
    });

    expect(res.isIosDevice).toBe(true);
    expect(res.isIosSafari).toBe(true);
    expect(res.isIosInstallEligible).toBe(true);
  });

  it('distinguishes third-party iOS browsers (CriOS, FxiOS, EdgiOS) from Safari', () => {
    for (const token of ['CriOS/130.0', 'FxiOS/131.0', 'EdgiOS/130.0']) {
      const res = detectIosPwaEnvironment({
        userAgent: `Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) ${token} Mobile/15E148 Safari/604.1`,
        maxTouchPoints: 5,
        isStandalone: false,
        isNativeShell: false,
      });
      expect(res.isIosDevice).toBe(true);
      expect(res.isIosSafari).toBe(false);
      expect(res.isIosOtherBrowser).toBe(true);
      expect(res.isIosInstallEligible).toBe(true);
    }
  });

  it('disables install eligibility when already standalone or inside native shell', () => {
    const standalone = detectIosPwaEnvironment({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
      maxTouchPoints: 5,
      isStandalone: true,
      isNativeShell: false,
    });
    expect(standalone.isIosDevice).toBe(true);
    expect(standalone.isIosInstallEligible).toBe(false);

    const nativeShell = detectIosPwaEnvironment({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
      maxTouchPoints: 5,
      isStandalone: true,
      isNativeShell: true,
    });
    expect(nativeShell.isIosDevice).toBe(false);
    expect(nativeShell.isIosInstallEligible).toBe(false);
  });

  it('ignores macOS desktop and Android browsers', () => {
    const mac = detectIosPwaEnvironment({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
      maxTouchPoints: 0,
      isStandalone: false,
      isNativeShell: false,
    });
    const android = detectIosPwaEnvironment({
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
      maxTouchPoints: 5,
      isStandalone: false,
      isNativeShell: false,
    });

    expect(mac.isIosDevice).toBe(false);
    expect(android.isIosDevice).toBe(false);
  });
});

describe('resolvePlatformAccessGate', () => {
  const hostedBase = {
    hostname: 'physiorecord.pages.dev',
    protocol: 'https:',
    search: '',
    isNativeShell: false,
  };

  it('blocks iOS Safari browser tabs until added to Home Screen and allows Standalone mode', () => {
    const safariTab = resolvePlatformAccessGate({
      ...hostedBase,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
      maxTouchPoints: 5,
      isStandalone: false,
    });
    expect(safariTab.mode).toBe('ios-safari-install');

    const homeScreenApp = resolvePlatformAccessGate({
      ...hostedBase,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
      maxTouchPoints: 5,
      isStandalone: true,
    });
    expect(homeScreenApp.mode).toBe('allow');
  });

  it('blocks iOS Chrome/Edge/in-app browsers and directs users to Safari', () => {
    const iosChrome = resolvePlatformAccessGate({
      ...hostedBase,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1',
      maxTouchPoints: 5,
      isStandalone: false,
    });
    expect(iosChrome.mode).toBe('ios-open-in-safari');
  });

  it('blocks Android and Desktop browsers on hosted web and routes to official native releases', () => {
    const androidWeb = resolvePlatformAccessGate({
      ...hostedBase,
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
      maxTouchPoints: 5,
      isStandalone: false,
    });
    expect(androidWeb.mode).toBe('android-download-apk');

    const windowsWeb = resolvePlatformAccessGate({
      ...hostedBase,
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      maxTouchPoints: 0,
      isStandalone: false,
    });
    expect(windowsWeb.mode).toBe('desktop-download-app');
    expect(windowsWeb.desktopOs).toBe('windows');
  });

  it('always allows native shells and dev/preview origins by default', () => {
    expect(
      resolvePlatformAccessGate({
        ...hostedBase,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        maxTouchPoints: 0,
        isStandalone: true,
        isNativeShell: true,
      }).mode
    ).toBe('allow');

    expect(
      resolvePlatformAccessGate({
        hostname: 'localhost',
        protocol: 'http:',
        search: '',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        maxTouchPoints: 0,
        isStandalone: false,
        isNativeShell: false,
      }).mode
    ).toBe('allow');
  });

  it('catches non-Safari iOS browsers & social in-app WebViews (Opera, Yandex, Instagram, WhatsApp, GSA, WKWebView)', () => {
    const uas = [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1 OPT/4.2.0',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) YaBrowser/24.10 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WhatsApp/24.20',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/335.0 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    ];
    for (const userAgent of uas) {
      expect(
        resolvePlatformAccessGate({
          ...hostedBase,
          userAgent,
          maxTouchPoints: 5,
          isStandalone: false,
        }).mode
      ).toBe('ios-open-in-safari');
    }
  });

  it('routes macOS browser tabs to macos-install-app and allows macOS standalone Dock apps', () => {
    const macSafari = resolvePlatformAccessGate({
      ...hostedBase,
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
      maxTouchPoints: 0,
      isStandalone: false,
    });
    expect(macSafari.mode).toBe('macos-install-app');
    expect(macSafari.isMacSafari).toBe(true);

    const macStandalone = resolvePlatformAccessGate({
      ...hostedBase,
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
      maxTouchPoints: 0,
      isStandalone: true,
    });
    expect(macStandalone.mode).toBe('allow');
  });
});
