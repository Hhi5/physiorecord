import { describe, it, expect } from 'vitest';
import { createInMemoryDatabase } from './testDbHelper';
import {
  CONSTANTS,
  CURRENT_DEK_VERSION,
  CURRENT_RECORD_CRYPTO_VERSION,
  bindDekToGeneration,
  decryptRecordPayload,
  deriveKEK,
  encryptRecordWithMandatoryReservation,
  generateAndWrapOperationalDEK,
  generateVerifier,
  randomBytes,
} from '../vault';
import {
  disablePinUnlock,
  enrollVaultPinUnlock,
  getPinLockoutRemainingSeconds,
  isPinUnlockEnrolled,
  normalizeVaultPinInput,
  unlockOperationalDekWithPin,
  validateVaultPin,
} from '../vaultPin';
import {
  disablePasskeyPrfUnlock,
  enrollPasskeyPrfUnlock,
  getBiometricAvailabilityInfo,
  isBiometricUnlockEnrolled,
  unlockOperationalDekWithPrf,
} from '../webauthnPrf';

const fastTestDeriveKek = async (pin: string, salt: Uint8Array) =>
  deriveKEK(pin, salt, 1_000);

async function setupVault(password = 'VaultTestPass#2026') {
  const testDb = createInMemoryDatabase();
  const salt = randomBytes(CONSTANTS.SALT_BYTES);
  const kek = await deriveKEK(password, salt, 1_000);
  const { operationalDek, wrappedDek, wrappedDekIv } =
    await generateAndWrapOperationalDEK(kek, 1);
  const { verifierIv, verifierCiphertext } = await generateVerifier(kek);
  bindDekToGeneration(operationalDek, 1);

  await testDb.vaultMeta.put({
    id: 'auth',
    salt,
    wrappedDek,
    wrappedDekIv,
    verifierIv,
    verifierCiphertext,
    schemaVersion: testDb.verno,
    kdfAlgorithm: 'PBKDF2-HMAC-SHA256',
    kdfIterations: 1_000,
    dekVersion: CURRENT_DEK_VERSION,
    encryptionInvocationCount: 0,
    vaultGeneration: 1,
  });

  return { testDb, kek, dek: operationalDek };
}

describe('Quick Vault PIN Unlock (Desktop & Browser Fallback)', () => {
  it('normalizes Arabic-Indic digits and rejects short, non-digit, or trivial PINs', () => {
    expect(normalizeVaultPinInput(' ٤٨٢٧ ')).toBe('4827');
    expect(normalizeVaultPinInput('۷۳۹۱')).toBe('7391');

    expect(validateVaultPin('123')).toEqual({
      valid: false,
      normalized: '123',
      errorCode: 'too_short',
    });
    expect(validateVaultPin('abcd')).toEqual({
      valid: false,
      normalized: 'abcd',
      errorCode: 'non_digits',
    });
    expect(validateVaultPin('1234').errorCode).toBe('weak_pin');
    expect(validateVaultPin('0000').errorCode).toBe('weak_pin');
    expect(validateVaultPin('555555').errorCode).toBe('weak_pin');
    expect(validateVaultPin('654321').errorCode).toBe('weak_pin');
    expect(validateVaultPin('1212').errorCode).toBe('weak_pin');

    expect(validateVaultPin('٤٨٢٧٩٠')).toEqual({
      valid: true,
      normalized: '482790',
    });
  });

  it('enrolls Quick PIN, unlocks non-extractable DEK to decrypt records, and disables cleanly', async () => {
    const { testDb, kek, dek } = await setupVault();

    const enc = await encryptRecordWithMandatoryReservation(
      testDb,
      dek,
      'patients',
      'p-1',
      [],
      { fullName: 'Ali Baghdad' }
    );
    await testDb.patients.put({
      id: 'p-1',
      createdAt: '2026-11-21T00:00:00Z',
      updatedAt: '2026-11-21T00:00:00Z',
      isArchived: 0,
      recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
      dekVersion: CURRENT_DEK_VERSION,
      recordSalt: enc.recordSalt,
      iv: enc.iv,
      ciphertext: enc.ciphertext,
    });

    await enrollVaultPinUnlock(testDb, kek, '٧٣٩١٥٠', fastTestDeriveKek);

    let meta = await testDb.vaultMeta.get('auth');
    expect(isPinUnlockEnrolled(meta)).toBe(true);

    const unlocked = await unlockOperationalDekWithPin(testDb, '739150', fastTestDeriveKek);
    expect(unlocked.ok).toBe(true);
    expect(unlocked.operationalDek).toBeDefined();
    expect(unlocked.operationalDek!.extractable).toBe(false);

    const row = await testDb.patients.get('p-1');
    const dec = await decryptRecordPayload<{ fullName: string }>(
      unlocked.operationalDek!,
      'patients',
      'p-1',
      [],
      row!.iv,
      row!.ciphertext,
      row!.recordCryptoVersion,
      row!.dekVersion,
      row!.recordSalt
    );
    expect(dec.fullName).toBe('Ali Baghdad');

    await disablePinUnlock(testDb);
    meta = await testDb.vaultMeta.get('auth');
    expect(isPinUnlockEnrolled(meta)).toBe(false);
    await expect(
      unlockOperationalDekWithPin(testDb, '739150', fastTestDeriveKek)
    ).rejects.toThrow();
  });

  it('enforces cooldowns and disables Quick PIN after 5 consecutive failed attempts', async () => {
    const { testDb, kek } = await setupVault();
    await enrollVaultPinUnlock(testDb, kek, '849201', fastTestDeriveKek);

    const fail1 = await unlockOperationalDekWithPin(testDb, '111119', fastTestDeriveKek);
    expect(fail1).toMatchObject({ ok: false, rateLimited: false, remainingAttempts: 4 });

    const fail2 = await unlockOperationalDekWithPin(testDb, '222229', fastTestDeriveKek);
    expect(fail2).toMatchObject({ ok: false, rateLimited: false, remainingAttempts: 3 });

    const fail3 = await unlockOperationalDekWithPin(testDb, '333339', fastTestDeriveKek);
    expect(fail3.ok).toBe(false);
    expect(fail3.rateLimited).toBe(true);
    expect(fail3.remainingSeconds).toBeGreaterThan(0);

    // Clear cooldown in storage to test attempts 4 and 5 deterministically
    await testDb.vaultMeta.update('auth', { pinLockedUntilMs: 0 });
    const fail4 = await unlockOperationalDekWithPin(testDb, '444449', fastTestDeriveKek);
    expect(fail4.ok).toBe(false);
    expect(fail4.rateLimited).toBe(true);
    expect(fail4.remainingSeconds).toBeGreaterThanOrEqual(60);

    await testDb.vaultMeta.update('auth', { pinLockedUntilMs: 0 });
    const fail5 = await unlockOperationalDekWithPin(testDb, '555559', fastTestDeriveKek);
    expect(fail5).toMatchObject({
      ok: false,
      disabledByFailures: true,
      remainingAttempts: 0,
    });

    const meta = await testDb.vaultMeta.get('auth');
    expect(isPinUnlockEnrolled(meta)).toBe(false);
    expect(getPinLockoutRemainingSeconds(meta)).toBe(0);
    // Master password envelope remains completely intact
    expect(meta?.wrappedDek).toBeDefined();
    expect(meta?.verifierCiphertext).toBeDefined();
  });

  it('maps WebAuthn CredentialsContainer NotAllowedError to a localized Windows Hello / Passkey error', async () => {
    const { testDb, kek } = await setupVault();
    const win = globalThis as unknown as {
      window?: Record<string, unknown>;
      navigator?: Record<string, unknown>;
    };
    const origWindow = win.window;
    const origNavigator = win.navigator;

    const fakePublicKeyCredential = {
      isUserVerifyingPlatformAuthenticatorAvailable: async () => true,
    };

    try {
      const mockWin: Record<string, unknown> = {
        location: { hostname: 'localhost', protocol: 'https:' },
        PublicKeyCredential: fakePublicKeyCredential,
      };
      mockWin.self = mockWin;
      mockWin.top = mockWin;
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: mockWin,
      });
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: {
          credentials: {
            create: async () => {
              const err = new Error('CredentialsContainer request is not allowed.');
              err.name = 'NotAllowedError';
              throw err;
            },
            get: async () => null,
          },
        },
      });

      await expect(enrollPasskeyPrfUnlock(testDb, kek)).rejects.toThrow(/Windows Hello|Passkey/);
    } finally {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: origWindow,
      });
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: origNavigator,
      });
    }
  });

  it('detects restricted preview iframes explicitly when permissionsPolicy blocks WebAuthn', async () => {
    const win = globalThis as unknown as {
      window?: Record<string, unknown>;
      document?: Record<string, unknown>;
      navigator?: Record<string, unknown>;
    };
    const origWindow = win.window;
    const origDocument = win.document;
    const origNavigator = win.navigator;

    try {
      const mockWin: Record<string, unknown> = {
        location: { hostname: 'example.com', protocol: 'https:' },
        PublicKeyCredential: { isUserVerifyingPlatformAuthenticatorAvailable: async () => true },
        self: {},
        top: {},
      };
      Object.defineProperty(globalThis, 'window', { configurable: true, value: mockWin });
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: {
          credentials: {
            create: async () => null,
            get: async () => null,
          },
        },
      });
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: {
          permissionsPolicy: {
            allowsFeature: (feature: string) => feature !== 'publickey-credentials-create',
          },
        },
      });

      const info = await getBiometricAvailabilityInfo();
      expect(info.supported).toBe(false);
      expect(info.mode).toBe('unsupported');
      expect(info.reason).toBe('restricted-iframe');
    } finally {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: origWindow });
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: origNavigator });
      Object.defineProperty(globalThis, 'document', { configurable: true, value: origDocument });
    }
  });

  it('supports Electron Desktop Windows Hello / OS Lock DPAPI enrollment, unlock, and clear', async () => {
    const { testDb, kek, dek } = await setupVault();
    const enc = await encryptRecordWithMandatoryReservation(
      testDb,
      dek,
      'patients',
      'p-win-1',
      [],
      { fullName: 'Zaid Mosul' }
    );
    await testDb.patients.put({
      id: 'p-win-1',
      createdAt: '2026-11-21T00:00:00Z',
      updatedAt: '2026-11-21T00:00:00Z',
      isArchived: 0,
      recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
      dekVersion: CURRENT_DEK_VERSION,
      recordSalt: enc.recordSalt,
      iv: enc.iv,
      ciphertext: enc.ciphertext,
    });

    const win = globalThis as unknown as { window?: Record<string, unknown> };
    const origWindow = win.window;
    let storedDesktopDekBase64: string | null = null;

    try {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: {
          location: { protocol: 'app:' },
          electronAPI: {
            isElectron: true,
            isOsBiometricAvailable: async () => ({
              available: true,
              status: 'ready',
              enrolled: Boolean(storedDesktopDekBase64),
            }),
            enrollOsBiometricDek: async ({ dekBase64 }: { dekBase64: string }) => {
              storedDesktopDekBase64 = dekBase64;
              return { enrolled: true };
            },
            unlockOsBiometricDek: async () => {
              if (!storedDesktopDekBase64) throw new Error('Not enrolled');
              return { dekBase64: storedDesktopDekBase64 };
            },
            clearOsBiometricDek: async () => {
              storedDesktopDekBase64 = null;
              return { cleared: true };
            },
          },
        },
      });

      const avail = await getBiometricAvailabilityInfo();
      expect(avail.supported).toBe(true);
      expect(avail.mode).toBe('desktop-os');
      expect(avail.reason).toBe('none');

      await enrollPasskeyPrfUnlock(testDb, kek);
      expect(storedDesktopDekBase64).toBeTruthy();

      const meta = await testDb.vaultMeta.get('auth');
      expect(await isBiometricUnlockEnrolled(meta)).toBe(true);

      const unlockedDek = await unlockOperationalDekWithPrf(meta!);
      expect(unlockedDek.extractable).toBe(false);

      const row = await testDb.patients.get('p-win-1');
      const dec = await decryptRecordPayload<{ fullName: string }>(
        unlockedDek,
        'patients',
        'p-win-1',
        [],
        row!.iv,
        row!.ciphertext,
        row!.recordCryptoVersion,
        row!.dekVersion,
        row!.recordSalt
      );
      expect(dec.fullName).toBe('Zaid Mosul');

      await disablePasskeyPrfUnlock(testDb);
      expect(storedDesktopDekBase64).toBeNull();
      expect(await isBiometricUnlockEnrolled(await testDb.vaultMeta.get('auth'))).toBe(false);
    } finally {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: origWindow });
    }
  });
});
