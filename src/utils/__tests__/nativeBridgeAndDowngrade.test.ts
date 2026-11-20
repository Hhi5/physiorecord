import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  computeAndroidVersionCode,
  detectDexieSchemaDowngradeError,
  getAppRuntimeTarget,
  openSafeExternalUrl,
  saveTextFilePortable,
  triggerPlatformPrint,
} from '../../platform/nativeBridge';
import { isWebAuthnPrfSupported } from '../../crypto/webauthnPrf';
import { isCredentialManagerStoreSupported } from '../../utils/passwordManagerHelper';

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

  it('computes deterministic monotonic Android versionCode from semver', () => {
    expect(computeAndroidVersionCode('1.0.0')).toBe(10000);
    expect(computeAndroidVersionCode('1.0.1')).toBe(10001);
    expect(computeAndroidVersionCode('1.1.0')).toBe(10100);
    expect(computeAndroidVersionCode('0.0.2')).toBe(10102);
    expect(computeAndroidVersionCode('0.0.3')).toBe(10103);
    expect(computeAndroidVersionCode('0.0.2')).toBeGreaterThan(
      computeAndroidVersionCode('1.1.0')
    );
    expect(computeAndroidVersionCode('1.2.3')).toBe(10203);
    expect(computeAndroidVersionCode('2.10.5')).toBe(21005);
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
});
