import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getDeviceFormFactor,
  isMobileOrTabletDevice,
} from '../../platform/nativeBridge';
import {
  getLockScreenBiometricCopy,
  getSecuritySettingsCopy,
} from '../deviceBiometricCopy';

describe('Device Form Factor Detection & Device-Specific Biometric / Security Copy', () => {
  const hadOriginalWindow = 'window' in globalThis;
  const originalWindow = (globalThis as Record<string, unknown>).window;

  beforeEach(() => {
    (globalThis as Record<string, unknown>).window = {};
  });

  afterEach(() => {
    if (hadOriginalWindow) {
      (globalThis as Record<string, unknown>).window = originalWindow;
    } else {
      delete (globalThis as Record<string, unknown>).window;
    }
  });

  it('classifies Electron desktop, desktop browsers, tablets, iPads, Android APK tablets/phones, and mobile viewports accurately', () => {
    // 1. Electron Windows desktop
    (globalThis as Record<string, unknown>).window = {
      physiorecordDesktop: { isDesktop: true },
      innerWidth: 1280,
      innerHeight: 800,
      navigator: { userAgent: 'Mozilla/5.0 Electron/35.0.0', maxTouchPoints: 0 },
    };
    expect(getDeviceFormFactor()).toBe('desktop');
    expect(isMobileOrTabletDevice()).toBe(false);

    // 2. Desktop Chrome browser
    (globalThis as Record<string, unknown>).window = {
      innerWidth: 1440,
      innerHeight: 900,
      navigator: {
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/134.0.0.0 Safari/537.36',
        maxTouchPoints: 0,
      },
    };
    expect(getDeviceFormFactor()).toBe('desktop');
    expect(isMobileOrTabletDevice()).toBe(false);

    // 3. iPhone browser
    (globalThis as Record<string, unknown>).window = {
      innerWidth: 390,
      innerHeight: 844,
      navigator: {
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
        maxTouchPoints: 5,
      },
    };
    expect(getDeviceFormFactor()).toBe('mobile');
    expect(isMobileOrTabletDevice()).toBe(true);

    // 4. iPadOS reporting Macintosh with touch points
    (globalThis as Record<string, unknown>).window = {
      innerWidth: 1024,
      innerHeight: 1366,
      navigator: {
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
        maxTouchPoints: 5,
      },
    };
    expect(getDeviceFormFactor()).toBe('tablet');
    expect(isMobileOrTabletDevice()).toBe(true);

    // 5. Android tablet browser (Android UA without Mobile)
    (globalThis as Record<string, unknown>).window = {
      innerWidth: 820,
      innerHeight: 1180,
      navigator: {
        userAgent:
          'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/133.0.0.0 Safari/537.36',
        maxTouchPoints: 5,
      },
    };
    expect(getDeviceFormFactor()).toBe('tablet');
    expect(isMobileOrTabletDevice()).toBe(true);

    // 6. Native Capacitor Android phone vs tablet
    (globalThis as Record<string, unknown>).window = {
      Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
      innerWidth: 390,
      innerHeight: 844,
      navigator: {
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile',
        maxTouchPoints: 5,
      },
    };
    expect(getDeviceFormFactor()).toBe('mobile');

    (globalThis as Record<string, unknown>).window = {
      Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
      innerWidth: 800,
      innerHeight: 1280,
      navigator: {
        userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-X810)',
        maxTouchPoints: 5,
      },
    };
    expect(getDeviceFormFactor()).toBe('tablet');

    // 7. Narrow responsive phone viewport even with desktop UA
    (globalThis as Record<string, unknown>).window = {
      innerWidth: 390,
      innerHeight: 844,
      navigator: {
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/134.0.0.0 Safari/537.36',
        maxTouchPoints: 0,
      },
    };
    expect(getDeviceFormFactor()).toBe('mobile');
  });

  it('produces completely distinct LockScreen biometric copy for desktop vs tablet vs mobile', () => {
    const desktopCopy = getLockScreenBiometricCopy('desktop', 'webauthn-prf');
    const tabletCopy = getLockScreenBiometricCopy('tablet', 'webauthn-prf');
    const mobileCopy = getLockScreenBiometricCopy('mobile', 'android-native');

    expect(desktopCopy.unlockButton.ar).toContain('الحاسوب');
    expect(tabletCopy.unlockButton.ar).toContain('التابلت');
    expect(mobileCopy.unlockButton.ar).toContain('الهاتف');

    expect(desktopCopy.unlockButton.en).toContain('PC Lock');
    expect(tabletCopy.unlockButton.en).toContain('Tablet');
    expect(mobileCopy.unlockButton.en).toContain('Phone');

      for (const copy of [tabletCopy, mobileCopy]) {
      for (const field of Object.values(copy)) {
        for (const text of [field.ar, field.en, field.ckb]) {
          expect(text).not.toMatch(/حاسوب|Windows Hello|\.exe|كۆمپیوتەر|\bPC\b|computer lock/i);
        }
      }
    }

    for (const field of Object.values(desktopCopy)) {
      for (const text of [field.ar, field.en, field.ckb]) {
        expect(text).not.toMatch(/هاتف|تابلت|مۆبایل|تابلێت|\bPhone\b|\bTablet\b/i);
      }
    }
  });

  it('keeps Security Settings copy cleanly separated between desktop and mobile/tablet', () => {
    const modes = [
      { isPrfSupported: true, biometricMode: 'webauthn-prf' as const, unavailableReason: 'none' as const, isElectronShell: false },
      { isPrfSupported: false, biometricMode: 'unsupported' as const, unavailableReason: 'restricted-iframe' as const, isElectronShell: false },
      { isPrfSupported: false, biometricMode: 'unsupported' as const, unavailableReason: 'not-enrolled-os' as const, isElectronShell: false },
      { isPrfSupported: false, biometricMode: 'unsupported' as const, unavailableReason: 'no-hardware' as const, isElectronShell: false },
      { isPrfSupported: false, biometricMode: 'unsupported' as const, unavailableReason: 'browser-unsupported' as const, isElectronShell: false },
    ];

    for (const opts of modes) {
      const desktop = getSecuritySettingsCopy({ device: 'desktop', ...opts });
      const tablet = getSecuritySettingsCopy({ device: 'tablet', ...opts });
      const mobile = getSecuritySettingsCopy({ device: 'mobile', ...opts });

      expect(desktop.deviceProfileBadge.ar).toContain('الحاسوب');
      expect(tablet.deviceProfileBadge.ar).toContain('التابلت');
      expect(mobile.deviceProfileBadge.ar).toContain('الهاتف');

      const scopedFields: Array<keyof typeof desktop> = [
        'deviceProfileBadge',
        'biometricTitle',
        'biometricDescription',
        'biometricEnableButton',
        'biometricResetPasswordButton',
        'biometricIframeBlockedError',
        'quickPinSummary',
        'quickPinTitle',
        'quickPinDescription',
        'passwordManagerNote',
        'passwordChangeBiometricTab',
        'passwordChangeBiometricSubmit',
      ];

      for (const key of scopedFields) {
        for (const variant of [tablet[key], mobile[key]]) {
          for (const text of [variant.ar, variant.en, variant.ckb]) {
            expect(text).not.toMatch(/حاسوب|Windows Hello|\.exe|كۆمپیوتەر/i);
          }
        }
        for (const text of [desktop[key].ar, desktop[key].en, desktop[key].ckb]) {
          expect(text).not.toMatch(/هاتف|تابلت|مۆبایل|تابلێت/i);
        }
      }
    }
  });
});
