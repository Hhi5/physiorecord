import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  computeAndroidVersionCode,
  detectDexieSchemaDowngradeError,
  getAppRuntimeTarget,
  openSafeExternalUrl,
  saveTextFilePortable,
  triggerPlatformPrint,
} from '../../platform/nativeBridge';
import {
  ensurePhysioRecordDriveFolder,
  getGoogleDriveAuthState,
  saveNativeGoogleOAuthConfig,
  signInWithGoogleDrive,
  signOutGoogleDrive,
} from '../../services/googleDriveSync';
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
        },
      },
    };

    await signOutGoogleDrive();

    // Without a Desktop OAuth Client ID, rejects clearly instead of launching broken Firebase popup
    await expect(signInWithGoogleDrive()).rejects.toThrow(/Firebase|Google Drive/);
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
    await expect(signInWithGoogleDrive()).rejects.toThrow(/Firebase|Google Drive/);
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
});
