import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  clearNativeAndroidBiometricDek,
  computeAndroidVersionCode,
  detectDexieSchemaDowngradeError,
  enrollNativeAndroidBiometricDek,
  getAppRuntimeTarget,
  getDeviceFormFactor,
  isMobileOrTabletDevice,
  openSafeExternalUrl,
  openTextFileFromAndroid,
  saveTextFilePortable,
  triggerPlatformPrint,
  unlockNativeAndroidBiometricDek,
} from '../../platform/nativeBridge';
import {
  ensurePhysioRecordDriveFolder,
  getGoogleDriveAuthState,
  saveNativeGoogleOAuthConfig,
  signInWithGoogleDrive,
  signOutGoogleDrive,
} from '../../services/googleDriveSync';
import {
  getBiometricAvailabilityInfo,
  isWebAuthnPrfSupported,
} from '../../crypto/webauthnPrf';
import { isCredentialManagerStoreSupported } from '../../utils/passwordReminderSchedule';
import {
  getLockScreenBiometricCopy,
  getSecuritySettingsCopy,
} from '../deviceBiometricCopy';
import {
  AUTO_UPDATE_CHECK_INTERVAL_MS,
  compareSemverVersions,
  evaluateBackupRecencyForUpdate,
  extractReleaseNotesLines,
  getPendingUpdateNotification,
  isAllowedGithubReleaseUrl,
  isAllowedOfficialGithubUrl,
  isAutoUpdateCheckEnabled,
  normalizeGithubReleasesPayload,
  selectPlatformReleaseAsset,
  setAutoUpdateCheckEnabled,
  shouldRunAutoUpdateCheck,
  type SyncedGithubReleaseItem,
} from '../updateSafety';

describe('Multi-Platform Native Bridge, Version Sync & Schema Downgrade Guard', () => {
  const hadOriginalWindow = 'window' in globalThis;
  const originalWindow = (globalThis as Record<string, unknown>).window;

  beforeEach(() => {
    vi.restoreAllMocks();
    (globalThis as Record<string, unknown>).window = {};
  });

  afterEach(() => {
    if (hadOriginalWindow) {
      (globalThis as Record<string, unknown>).window = originalWindow;
    } else {
      delete (globalThis as Record<string, unknown>).window;
    }
  });

  it('computes deterministic monotonic Android versionCode from semver above legacy builds', () => {
    expect(computeAndroidVersionCode('0.0.1')).toBe(100001);
    expect(computeAndroidVersionCode('0.0.2')).toBe(100002);
    expect(computeAndroidVersionCode('1.0.0')).toBe(110000);
    expect(computeAndroidVersionCode('1.0.3')).toBe(110003);
    expect(computeAndroidVersionCode('v1.0.4')).toBe(110004);
    expect(computeAndroidVersionCode('1.1.0')).toBe(110100);
    expect(computeAndroidVersionCode('1.2.3')).toBe(110203);
    expect(computeAndroidVersionCode('2.10.5')).toBe(121005);
    // Regression guard: every tag series must stay strictly above legacy v1.1.0 (10100) and 0.0.2 (10102)
    expect(computeAndroidVersionCode('0.0.1')).toBeGreaterThan(10102);
    expect(computeAndroidVersionCode('1.0.3')).toBeGreaterThan(10102);
    expect(computeAndroidVersionCode('1.0.4')).toBeGreaterThan(
      computeAndroidVersionCode('1.0.3')
    );
    expect(computeAndroidVersionCode('1.1.0')).toBeGreaterThan(
      computeAndroidVersionCode('1.0.9')
    );
    expect(computeAndroidVersionCode('1.2.0')).toBeGreaterThan(
      computeAndroidVersionCode('1.1.9')
    );
  });

  it('detects Dexie / IndexedDB VersionError on schema downgrade without mistaking it for an uninitialized vault', () => {
    const versionErr = {
      name: 'VersionError',
      message:
        'The requested version (9) is less than the existing version (10).',
    };
    const wrappedDexieErr = {
      name: 'DatabaseClosedError',
      message: 'VersionError: The requested version (9) is less than the existing version (10).',
      inner: {
        name: 'VersionError',
        message: 'The requested version (9) is less than the existing version (10).',
      },
    };
    const regularErr = new Error('QuotaExceededError');

    expect(detectDexieSchemaDowngradeError(versionErr)).toEqual({
      isDowngrade: true,
      message:
        'The requested version (9) is less than the existing version (10).',
    });
    expect(detectDexieSchemaDowngradeError(wrappedDexieErr)?.isDowngrade).toBe(
      true
    );
    expect(detectDexieSchemaDowngradeError(regularErr)).toBeNull();
    expect(detectDexieSchemaDowngradeError(null)).toBeNull();
  });

  it('routes saveTextFilePortable to Electron IPC dialog when running in Windows Desktop shell', async () => {
    const saveFileMock = vi.fn().mockResolvedValue({
      saved: true,
      cancelled: false,
      filePath: 'C:\\Users\\Clinic\\Backups\\test.ptbackup',
      filename: 'test.ptbackup',
    });

    const win = (globalThis as Record<string, unknown>).window as Record<string, unknown>;
    win.electronAPI = {
      isElectron: true,
      saveFile: saveFileMock,
    };

    expect(getAppRuntimeTarget()).toBe('desktop');

    const result = await saveTextFilePortable({
      filename: 'test.ptbackup',
      content: '{"encrypted":true}',
      mimeType: 'application/octet-stream',
      description: 'Encrypted Backup',
      extensions: ['.ptbackup'],
    });

    expect(saveFileMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      method: 'electron-dialog',
      confirmedSaved: true,
      filename: 'test.ptbackup',
    });
  });

  it('routes saveTextFilePortable and triggerPlatformPrint to Android Capacitor plugin when running on Android', async () => {
    const saveFileToDeviceMock = vi.fn().mockResolvedValue({
      saved: true,
      cancelled: false,
      uri: 'content://com.android.externalstorage.documents/document/primary%3ADownload%2Fbackup.ptbackup',
      filename: 'backup.ptbackup',
    });
    const printCurrentPageMock = vi.fn().mockResolvedValue({
      printed: true,
    });

    const win = (globalThis as Record<string, unknown>).window as Record<string, unknown>;
    win.Capacitor = {
      getPlatform: () => 'android',
      isNativePlatform: () => true,
      Plugins: {
        PhysioRecordNative: {
          saveFileToDevice: saveFileToDeviceMock,
          printCurrentPage: printCurrentPageMock,
        },
      },
    };

    expect(getAppRuntimeTarget()).toBe('android');

    const saveRes = await saveTextFilePortable({
      filename: 'backup.ptbackup',
      content: '{"encrypted":true}',
      mimeType: 'application/octet-stream',
    });

    expect(saveRes).toEqual({
      method: 'android-saf',
      confirmedSaved: true,
      filename: 'backup.ptbackup',
    });

    await triggerPlatformPrint('PhysioRecord_Invoice');
    expect(printCurrentPageMock).toHaveBeenCalledWith({
      jobName: 'PhysioRecord_Invoice',
    });
  });

  it('routes Android Google Drive OAuth to native loopback bridge and blocks broken Firebase popup', async () => {
    const store = new Map<string, string>();
    const startGoogleDriveOAuthMock = vi.fn().mockResolvedValue({
      accessToken: 'ya29.test-native-token',
      email: 'clinic@example.com',
      displayName: 'Clinic PT',
      photoURL: '',
    });
    const openFileFromDeviceMock = vi.fn().mockResolvedValue({
      opened: true,
      cancelled: false,
      filename: 'sync_pc.ptsync.json',
      content: '{"magic":"PHYSIORECORD_SYNC_V1"}',
    });

    const win = (globalThis as Record<string, unknown>).window as Record<string, unknown>;
    win.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    };
    win.Capacitor = {
      getPlatform: () => 'android',
      isNativePlatform: () => true,
      Plugins: {
        PhysioRecordNative: {
          startGoogleDriveOAuth: startGoogleDriveOAuthMock,
          openFileFromDevice: openFileFromDeviceMock,
        },
      },
    };

    const opened = await openTextFileFromAndroid('*/*');
    expect(openFileFromDeviceMock).toHaveBeenCalledWith({ mimeType: '*/*' });
    expect(opened?.opened).toBe(true);
    expect(opened?.filename).toBe('sync_pc.ptsync.json');

    await signOutGoogleDrive();

    // Without a Desktop OAuth Client ID, rejects clearly instead of launching broken Firebase popup
    await expect(signInWithGoogleDrive()).rejects.toThrow(/Google/);
    expect(startGoogleDriveOAuthMock).not.toHaveBeenCalled();

    // With a valid Desktop OAuth Client ID, delegates to native PKCE loopback bridge
    saveNativeGoogleOAuthConfig({
      clientId: '1234567890-abc.apps.googleusercontent.com',
      clientSecret: 'GOCSPX-demo',
    });

    const authState = await signInWithGoogleDrive();
    expect(startGoogleDriveOAuthMock).toHaveBeenCalledTimes(1);
    expect(authState.isSignedIn).toBe(true);
    expect(authState.hasDriveToken).toBe(true);
    expect(authState.email).toBe('clinic@example.com');
    expect(getGoogleDriveAuthState().hasDriveToken).toBe(true);

    await signOutGoogleDrive();
    expect(getGoogleDriveAuthState().isSignedIn).toBe(false);
    expect(getGoogleDriveAuthState().hasDriveToken).toBe(false);
  });

  it('routes Windows Electron Desktop Google Drive OAuth and API calls through Main-Process IPC (preserving connect-src none)', async () => {
    const store = new Map<string, string>();
    const startOAuthMock = vi.fn().mockResolvedValue({
      accessToken: 'ya29.desktop-native-token',
      email: 'desktop-clinic@example.com',
      displayName: 'Clinic PC',
      photoURL: '',
    });
    const driveApiMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: JSON.stringify({ files: [{ id: 'folder_1234567890', name: 'PhysioRecord-Clinic-Sync' }] }),
      contentLength: 72,
    });

    const win = (globalThis as Record<string, unknown>).window as Record<string, unknown>;
    win.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    };
    win.electronAPI = {
      isElectron: true,
      startGoogleDriveOAuth: startOAuthMock,
      googleDriveApiRequest: driveApiMock,
    };

    await signOutGoogleDrive();

    // Unconfigured rejects cleanly without Firebase popup
    await expect(signInWithGoogleDrive()).rejects.toThrow(/Google/);
    expect(startOAuthMock).not.toHaveBeenCalled();

    // Configured delegates OAuth AND Drive v3 API requests through Electron Main Process
    saveNativeGoogleOAuthConfig({
      clientId: '987654321-pc.apps.googleusercontent.com',
    });

    const authState = await signInWithGoogleDrive();
    expect(startOAuthMock).toHaveBeenCalledTimes(1);
    expect(authState.isSignedIn).toBe(true);
    expect(authState.email).toBe('desktop-clinic@example.com');

    const folderId = await ensurePhysioRecordDriveFolder();
    expect(folderId).toBe('folder_1234567890');
    expect(driveApiMock).toHaveBeenCalledTimes(1);
    expect(driveApiMock.mock.calls[0][0].headers.Authorization).toBe(
      'Bearer ya29.desktop-native-token'
    );

    await signOutGoogleDrive();
  });

  it('strictly allowlists external URLs in openSafeExternalUrl (WhatsApp & Google Maps only)', async () => {
    const openExternalMock = vi.fn().mockResolvedValue({ opened: true });
    const win = (globalThis as Record<string, unknown>).window as Record<string, unknown>;
    win.electronAPI = {
      isElectron: true,
      openExternalUrl: openExternalMock,
    };

    expect(await openSafeExternalUrl('https://wa.me/9647701234567?text=Hello')).toBe(true);
    expect(
      await openSafeExternalUrl('https://www.google.com/maps/search/?api=1&query=Baghdad')
    ).toBe(true);
    expect(await openSafeExternalUrl('https://evil.example.com/phish')).toBe(false);
    expect(await openSafeExternalUrl('javascript:alert(1)')).toBe(false);
    expect(openExternalMock).toHaveBeenCalledTimes(2);
  });

  it('disables WebAuthn PRF and PasswordCredential safely under Electron app:// origin', async () => {
    const win = (globalThis as Record<string, unknown>).window as Record<string, unknown>;
    win.location = { protocol: 'app:' };
    win.isSecureContext = true;
    win.PublicKeyCredential = {
      isUserVerifyingPlatformAuthenticatorAvailable: async () => true,
    };
    win.PasswordCredential = function MockCred() {};
    win.electronAPI = { isElectron: true };

    expect(await isWebAuthnPrfSupported()).toBe(false);
    expect(isCredentialManagerStoreSupported()).toBe(false);
  });

  it('classifies Electron desktop, desktop browsers, tablets, iPads, Android APK tablets/phones, and mobile viewports accurately', () => {
    (globalThis as Record<string, unknown>).window = {
      physiorecordDesktop: { isDesktop: true },
      innerWidth: 1280,
      innerHeight: 800,
      navigator: { userAgent: 'Mozilla/5.0 Electron/35.0.0', maxTouchPoints: 0 },
    };
    expect(getDeviceFormFactor()).toBe('desktop');
    expect(isMobileOrTabletDevice()).toBe(false);

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

  it('produces distinct LockScreen and Security Settings biometric copy across desktop, tablet, and mobile', () => {
    const desktopCopy = getLockScreenBiometricCopy('desktop', 'webauthn-prf');
    const tabletCopy = getLockScreenBiometricCopy('tablet', 'webauthn-prf');
    const mobileCopy = getLockScreenBiometricCopy('mobile', 'android-native');

    expect(desktopCopy.unlockButton.ar).toContain('الحاسوب');
    expect(tabletCopy.unlockButton.ar).toContain('التابلت');
    expect(mobileCopy.unlockButton.ar).toContain('الهاتف');

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

  it('detects Native Android BiometricPrompt ready/none_enrolled and round-trips 32-byte DEK', async () => {
    let storedB64: string | null = null;
    let biometricStatus = 'ready';

    (globalThis as Record<string, unknown>).window = {
      location: { protocol: 'https:', hostname: 'localhost' },
      Capacitor: {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
        Plugins: {
          PhysioRecordNative: {
            isBiometricAvailable: async () => ({
              available: biometricStatus === 'ready',
              status: biometricStatus,
              enrolled: Boolean(storedB64),
            }),
            enrollBiometricDek: async ({ dekBase64 }: { dekBase64: string }) => {
              storedB64 = dekBase64;
              return { enrolled: true };
            },
            unlockBiometricDek: async () => ({ dekBase64: storedB64 || '' }),
            clearBiometricDek: async () => {
              storedB64 = null;
              return { cleared: true };
            },
          },
        },
      },
    };

    const readyInfo = await getBiometricAvailabilityInfo();
    expect(readyInfo.supported).toBe(true);
    expect(readyInfo.mode).toBe('android-native');
    expect(readyInfo.reason).toBe('none');
    expect(await isWebAuthnPrfSupported()).toBe(true);

    const sampleDek = new Uint8Array(32);
    for (let i = 0; i < 32; i++) sampleDek[i] = i + 1;

    expect(await enrollNativeAndroidBiometricDek(sampleDek)).toBe(true);
    const unlockedDek = await unlockNativeAndroidBiometricDek();
    expect(Array.from(unlockedDek)).toEqual(Array.from(sampleDek));

    const enrolledInfo = await getBiometricAvailabilityInfo();
    expect(enrolledInfo.enrolledOnNative).toBe(true);

    await clearNativeAndroidBiometricDek();
    expect(storedB64).toBeNull();

    biometricStatus = 'none_enrolled';
    const noneEnrolledInfo = await getBiometricAvailabilityInfo();
    expect(noneEnrolledInfo.supported).toBe(false);
    expect(noneEnrolledInfo.reason).toBe('not-enrolled-os');
  });
});

describe('updateSafety & Android Release Packaging Guards', () => {
  const hadOriginalWindow = 'window' in globalThis;
  const originalWindow = (globalThis as Record<string, unknown>).window;

  afterEach(() => {
    if (hadOriginalWindow) {
      (globalThis as Record<string, unknown>).window = originalWindow;
    } else {
      delete (globalThis as Record<string, unknown>).window;
    }
  });

  it('compares semver strings accurately across tag prefixes and numeric segments', () => {
    expect(compareSemverVersions('v1.2.0', '1.1.0')).toBe(1);
    expect(compareSemverVersions('1.1.0', 'v1.1.0')).toBe(0);
    expect(compareSemverVersions('1.0.9', '1.1.0')).toBe(-1);
    expect(compareSemverVersions('v2.1.0-beta.1', '2.0.9')).toBe(1);
  });

  it('selects signed APK on Android and NSIS Setup EXE on Windows over portable/debug assets', () => {
    const assets = [
      {
        name: 'PhysioRecord-Android-Universal-v1.2.0-debug.apk',
        browser_download_url: 'https://github.com/Hhi5/physiorecord/releases/download/v1.2.0/debug.apk',
      },
      {
        name: 'PhysioRecord-Android-Universal-v1.2.0.apk',
        browser_download_url: 'https://github.com/Hhi5/physiorecord/releases/download/v1.2.0/signed.apk',
      },
      {
        name: 'PhysioRecord-Portable-1.2.0-x64.exe',
        browser_download_url: 'https://github.com/Hhi5/physiorecord/releases/download/v1.2.0/portable.exe',
      },
      {
        name: 'PhysioRecord-Setup-1.2.0-x64.exe',
        browser_download_url: 'https://github.com/Hhi5/physiorecord/releases/download/v1.2.0/setup.exe',
      },
    ];

    expect(selectPlatformReleaseAsset(assets, 'android')?.downloadUrl).toBe(
      'https://github.com/Hhi5/physiorecord/releases/download/v1.2.0/signed.apk'
    );
    expect(selectPlatformReleaseAsset(assets, 'desktop')?.downloadUrl).toBe(
      'https://github.com/Hhi5/physiorecord/releases/download/v1.2.0/setup.exe'
    );
  });

  it('allowlists only official PhysioRecord repository and release URLs', () => {
    expect(isAllowedGithubReleaseUrl('https://github.com/Hhi5/physiorecord/releases/latest')).toBe(true);
    expect(
      isAllowedGithubReleaseUrl(
        'https://github.com/Hhi5/physiorecord/releases/download/v1.2.0/PhysioRecord-Android-Universal-v1.2.0.apk'
      )
    ).toBe(true);
    expect(isAllowedGithubReleaseUrl('https://example.com/PhysioRecord.apk')).toBe(false);

    expect(isAllowedOfficialGithubUrl('https://github.com/Hhi5/physiorecord')).toBe(true);
    expect(isAllowedOfficialGithubUrl('https://github.com/Hhi5/physiorecord/releases')).toBe(true);
    expect(isAllowedOfficialGithubUrl('https://github.com/other/physiorecord')).toBe(false);
  });

  it('normalizes GitHub releases, checks auto-update throttle & dismissal, and assesses backup recency', () => {
    const normalized = normalizeGithubReleasesPayload([
      {
        id: 1,
        tag_name: 'v1.0.0',
        name: 'Initial Release',
        body: '- First version',
        published_at: '2026-11-13T10:00:00Z',
        html_url: 'https://github.com/Hhi5/physiorecord/releases/tag/v1.0.0',
        draft: false,
        prerelease: false,
        assets: [],
      },
      { id: 2, tag_name: 'v1.3.0-draft', name: 'Draft', draft: true, assets: [] },
      {
        id: 3,
        tag_name: 'v1.2.0',
        name: 'Clinical Update 1.2',
        body: '## Highlights\n- Fixed **A4 printing**\n- See [Notes](https://github.com/Hhi5/physiorecord)',
        published_at: '2026-11-20T10:00:00Z',
        html_url: 'https://github.com/Hhi5/physiorecord/releases/tag/v1.2.0',
        draft: false,
        prerelease: false,
        assets: [
          {
            name: 'PhysioRecord-Setup-1.2.0-x64.exe',
            browser_download_url:
              'https://github.com/Hhi5/physiorecord/releases/download/v1.2.0/PhysioRecord-Setup-1.2.0-x64.exe',
            size: 85000000,
          },
          { name: 'malicious.exe', browser_download_url: 'https://evil.example.com/malicious.exe' },
        ],
      },
    ]);

    expect(normalized).toHaveLength(2);
    expect(normalized[0].tagName).toBe('v1.2.0');
    expect(normalized[0].assets).toHaveLength(1);
    expect(extractReleaseNotesLines(normalized[0].body)).toEqual([
      'Highlights',
      'Fixed A4 printing',
      'See Notes',
    ]);

    const nowMs = Date.parse('2026-11-21T12:00:00.000Z');
    expect(shouldRunAutoUpdateCheck({ enabled: false, lastSyncedAt: null, nowMs })).toBe(false);
    expect(shouldRunAutoUpdateCheck({ enabled: true, lastSyncedAt: null, nowMs })).toBe(true);
    expect(
      shouldRunAutoUpdateCheck({
        enabled: true,
        lastSyncedAt: new Date(nowMs - 2 * 60 * 60 * 1000).toISOString(),
        nowMs,
      })
    ).toBe(false);
    expect(
      shouldRunAutoUpdateCheck({
        enabled: true,
        lastSyncedAt: new Date(nowMs - (AUTO_UPDATE_CHECK_INTERVAL_MS + 60_000)).toISOString(),
        nowMs,
      })
    ).toBe(true);

    const store = new Map<string, string>();
    (globalThis as Record<string, unknown>).window = {
      localStorage: {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => store.set(k, v),
      },
      dispatchEvent: () => true,
    };
    expect(isAutoUpdateCheckEnabled()).toBe(true);
    setAutoUpdateCheckEnabled(false);
    expect(isAutoUpdateCheckEnabled()).toBe(false);
    setAutoUpdateCheckEnabled(true);
    expect(isAutoUpdateCheckEnabled()).toBe(true);

    const releases: SyncedGithubReleaseItem[] = [
      {
        id: 2,
        tagName: 'v3.0.0-beta.1',
        version: '3.0.0-beta.1',
        name: 'Beta',
        body: '',
        htmlUrl: 'https://github.com/Hhi5/physiorecord/releases/tag/v3.0.0-beta.1',
        publishedAt: '2026-11-21T00:00:00.000Z',
        isPrerelease: true,
        assets: [],
      },
      {
        id: 1,
        tagName: 'v2.6.0',
        version: '2.6.0',
        name: 'Release 2.6.0',
        body: '- Bug fixes',
        htmlUrl: 'https://github.com/Hhi5/physiorecord/releases/tag/v2.6.0',
        publishedAt: '2026-11-20T00:00:00.000Z',
        isPrerelease: false,
        assets: [],
      },
    ];
    expect(
      getPendingUpdateNotification({ releases, currentAppVersion: '2.5.0', dismissedTag: null })
        ?.tagName
    ).toBe('v2.6.0');
    expect(
      getPendingUpdateNotification({ releases, currentAppVersion: '2.6.0', dismissedTag: null })
    ).toBeNull();
    expect(
      getPendingUpdateNotification({
        releases,
        currentAppVersion: '2.5.0',
        dismissedTag: 'v2.6.0',
      })
    ).toBeNull();

    const now = Date.UTC(2026, 10, 18, 12, 0, 0);
    expect(evaluateBackupRecencyForUpdate(null, now).status).toBe('none');
    expect(
      evaluateBackupRecencyForUpdate(new Date(now - 3 * 86400_000).toISOString(), now).status
    ).toBe('recent');
    expect(
      evaluateBackupRecencyForUpdate(new Date(now - 14 * 86400_000).toISOString(), now).status
    ).toBe('stale');
  });

  it('verifies Android sync-version.mjs formula parity and data_extraction_rules.xml exclude paths', async () => {
    const syncVersionMod = (await import('../../../scripts/sync-version.mjs')) as {
      computeAndroidVersionCode: (v: string) => number;
    };
    const versions = ['0.0.1', '0.0.2', '1.0.0', '1.0.3', '1.0.4', '1.1.0', '1.2.3', '2.0.0'];
    let prev = 10102;
    for (const v of versions) {
      const sc = syncVersionMod.computeAndroidVersionCode(v);
      const ac = computeAndroidVersionCode(v);
      expect(sc).toBe(ac);
      expect(sc).toBeGreaterThan(prev);
      prev = sc;
    }

    const xmlPath = path.join(
      process.cwd(),
      'android',
      'app',
      'src',
      'main',
      'res',
      'xml',
      'data_extraction_rules.xml'
    );
    const xml = fs.readFileSync(xmlPath, 'utf8');
    const excludeTags = xml.match(/<exclude\b[^>]*>/g) || [];
    expect(excludeTags.length).toBeGreaterThanOrEqual(10);
    for (const tag of excludeTags) {
      expect(tag).toMatch(/\bdomain="[^"]+"/);
      expect(tag).toMatch(/\bpath="[^"]+"/);
    }
  });
});
