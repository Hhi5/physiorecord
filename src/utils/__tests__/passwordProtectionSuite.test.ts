import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  PASSWORD_REMINDER_INTERVALS_DAYS,
  PASSWORD_REMINDER_STORAGE_KEY,
  loadPasswordReminderState,
  isPasswordReminderDue,
  recordPasswordMemoryVerified,
  recordPasswordChangedSchedule,
  snoozePasswordReminderState,
  setPasswordReminderEnabledState,
  getReminderIntervalDays,
} from '../passwordReminderSchedule';
import {
  VAULT_CREDENTIAL_USERNAME,
  saveVaultPasswordToBrowserManager,
} from '../passwordReminderSchedule';
import {
  generateAndWrapOperationalDEK,
  generateVerifier,
  checkVerifier,
  deriveKEK,
  randomBytes,
  encryptRecordPayload,
  decryptRecordPayload,
  unwrapOperationalDEK,
  unwrapDEKWithRecoveryKey,
} from '../../crypto/vault';
import {
  enrollPasskeyPrfUnlock,
  resetVaultPasswordWithPrf,
  unlockOperationalDekWithPrf,
} from '../../crypto/webauthnPrf';
import { createInMemoryDatabase } from '../../crypto/__tests__/testDbHelper';
import type { PhysioRecordDatabase } from '../../db/db';
import {
  ALLOWED_NON_PHI_LOCALSTORAGE_KEYS,
  LocalStorageMigrationService,
} from '../../services/localStorageMigrationService';

const DAY_MS = 24 * 60 * 60 * 1000;

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  const mockStorage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
  vi.stubGlobal('localStorage', mockStorage);
  return mockStorage;
}

describe('Signal-Style Spaced-Repetition Password Reminder Schedule', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    localStorage.removeItem(PASSWORD_REMINDER_STORAGE_KEY);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('initializes enabled at stage 0 (1 day) and is not due on Day 0', () => {
    const t0 = Date.UTC(2026, 0, 1, 9, 0, 0);
    const state = loadPasswordReminderState(t0);
    expect(state.enabled).toBe(true);
    expect(state.stageIndex).toBe(0);
    expect(getReminderIntervalDays(state.stageIndex)).toBe(1);
    expect(isPasswordReminderDue(state, t0)).toBe(false);
    expect(isPasswordReminderDue(state, t0 + DAY_MS - 1000)).toBe(false);
    expect(isPasswordReminderDue(state, t0 + DAY_MS)).toBe(true);
  });

  it('advances across the full expanding interval ladder (1 -> 3 -> 7 -> 14 -> 30 days) and caps at 30d', () => {
    let now = Date.UTC(2026, 0, 1, 9, 0, 0);
    loadPasswordReminderState(now);

    for (let i = 1; i < PASSWORD_REMINDER_INTERVALS_DAYS.length; i++) {
      now += getReminderIntervalDays(i - 1) * DAY_MS;
      const next = recordPasswordMemoryVerified(now);
      expect(next.stageIndex).toBe(i);
      expect(getReminderIntervalDays(next.stageIndex)).toBe(PASSWORD_REMINDER_INTERVALS_DAYS[i]);
      expect(isPasswordReminderDue(next, now)).toBe(false);
      expect(isPasswordReminderDue(next, now + PASSWORD_REMINDER_INTERVALS_DAYS[i] * DAY_MS)).toBe(
        true
      );
    }

    // Additional verification stays capped at 30 days
    now += 30 * DAY_MS;
    const capped = recordPasswordMemoryVerified(now);
    expect(capped.stageIndex).toBe(PASSWORD_REMINDER_INTERVALS_DAYS.length - 1);
    expect(getReminderIntervalDays(capped.stageIndex)).toBe(30);
  });

  it('supports snoozing without losing stage progress and resetting on password change', () => {
    const t0 = Date.UTC(2026, 0, 1, 9, 0, 0);
    loadPasswordReminderState(t0);
    const stage1 = recordPasswordMemoryVerified(t0 + DAY_MS); // 3d interval
    expect(stage1.stageIndex).toBe(1);

    const overdueNow = t0 + 5 * DAY_MS;
    expect(isPasswordReminderDue(stage1, overdueNow)).toBe(true);

    const snoozed = snoozePasswordReminderState(2, overdueNow);
    expect(snoozed.stageIndex).toBe(1);
    expect(isPasswordReminderDue(snoozed, overdueNow + DAY_MS)).toBe(false);
    expect(isPasswordReminderDue(snoozed, overdueNow + 2 * DAY_MS)).toBe(true);

    const afterChange = recordPasswordChangedSchedule(overdueNow);
    expect(afterChange.stageIndex).toBe(0);
    expect(isPasswordReminderDue(afterChange, overdueNow)).toBe(false);
    expect(isPasswordReminderDue(afterChange, overdueNow + DAY_MS)).toBe(true);
  });

  it('respects disable/enable toggle cleanly', () => {
    const t0 = Date.UTC(2026, 0, 1, 9, 0, 0);
    loadPasswordReminderState(t0);
    const disabled = setPasswordReminderEnabledState(false, t0);
    expect(disabled.enabled).toBe(false);
    expect(isPasswordReminderDue(disabled, t0 + 100 * DAY_MS)).toBe(false);

    const reenabled = setPasswordReminderEnabledState(true, t0 + 100 * DAY_MS);
    expect(reenabled.enabled).toBe(true);
    expect(isPasswordReminderDue(reenabled, t0 + 100 * DAY_MS)).toBe(false);
    expect(isPasswordReminderDue(reenabled, t0 + 101 * DAY_MS)).toBe(true);
  });

  it('registers PASSWORD_REMINDER_STORAGE_KEY as an allowed non-PHI key so migration scanner never flags it', () => {
    expect(ALLOWED_NON_PHI_LOCALSTORAGE_KEYS.has(PASSWORD_REMINDER_STORAGE_KEY)).toBe(true);
    loadPasswordReminderState(Date.UTC(2026, 0, 1, 9, 0, 0));
    expect(LocalStorageMigrationService.scanUnmigratedItems()).toEqual([]);
    expect(LocalStorageMigrationService.findPhiLikeLocalStorageEntries()).toEqual([]);
  });
});

describe('OS / Browser Password Manager Helper', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('degrades silently when PasswordCredential is unavailable', async () => {
    const ok = await saveVaultPasswordToBrowserManager('StrongClinicalPass123!');
    expect(ok).toBe(false);
  });

  it('stores credential with fixed local vault username when supported in secure context', async () => {
    const storeSpy = vi.fn().mockResolvedValue(undefined);
    class MockPasswordCredential {
      id: string;
      name?: string;
      password: string;
      constructor(data: { id: string; name?: string; password: string }) {
        this.id = data.id;
        this.name = data.name;
        this.password = data.password;
      }
    }

    vi.stubGlobal('window', {
      isSecureContext: true,
      PasswordCredential: MockPasswordCredential,
    });
    vi.stubGlobal('navigator', {
      credentials: { store: storeSpy },
    });

    const saved = await saveVaultPasswordToBrowserManager('StrongClinicalPass123!');
    expect(saved).toBe(true);
    expect(storeSpy).toHaveBeenCalledTimes(1);
    const arg = storeSpy.mock.calls[0][0] as MockPasswordCredential;
    expect(arg.id).toBe(VAULT_CREDENTIAL_USERNAME);
    expect(arg.password).toBe('StrongClinicalPass123!');
  });
});

describe('WebAuthn PRF Biometric Password Reset', () => {
  const TEST_KDF_ITERATIONS = 10_000;

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('resets master password via enrolled PRF passkey while keeping existing data, passkey, and recovery key intact', async () => {
    const testDb = createInMemoryDatabase() as unknown as PhysioRecordDatabase;
    const oldPassword = 'OldClinicPassword#2025';
    const newPassword = 'NewClinicPassword#2026';

    // 1. Initialize vault with oldPassword
    const salt = randomBytes(16);
    const oldKek = await deriveKEK(oldPassword, salt, TEST_KDF_ITERATIONS);
    const keypair = await generateAndWrapOperationalDEK(oldKek, 1);
    const verifier = await generateVerifier(oldKek);

    await testDb.vaultMeta.put({
      id: 'auth',
      salt,
      wrappedDek: keypair.wrappedDek,
      wrappedDekIv: keypair.wrappedDekIv,
      verifierIv: verifier.verifierIv,
      verifierCiphertext: verifier.verifierCiphertext,
      schemaVersion: 1,
      kdfAlgorithm: 'PBKDF2-HMAC-SHA256',
      kdfIterations: TEST_KDF_ITERATIONS,
      dekVersion: 1,
      encryptionInvocationCount: 0,
      vaultGeneration: 1,
      recoveryWrappedDek: keypair.recoveryWrappedDek,
      recoveryWrappedDekIv: keypair.recoveryWrappedDekIv,
      recoverySalt: keypair.recoverySalt,
      recoveryKdfIterations: keypair.recoveryKdfIterations,
    });

    // Encrypt a real patient payload under the initial DEK
    const samplePatient = { fullName: 'أحمد حسن العراقي', diagnosis: 'Lumbar Disc Herniation' };
    const encryptedRecord = await encryptRecordPayload(
      keypair.operationalDek,
      'patients',
      'pat_prf_1',
      [],
      samplePatient
    );

    // 2. Mock deterministic platform WebAuthn PRF authenticator in Node environment
    const mockCredId = randomBytes(16);
    const mockPrfOutput = randomBytes(32);

    vi.stubGlobal('window', {
      location: { hostname: 'localhost' },
      PublicKeyCredential: {
        isUserVerifyingPlatformAuthenticatorAvailable: async () => true,
      },
    });
    vi.stubGlobal('navigator', {
      credentials: {
        create: async () => ({
          rawId: mockCredId.slice().buffer,
          getClientExtensionResults: () => ({
            prf: { enabled: true, results: { first: mockPrfOutput.slice().buffer } },
          }),
        }),
        get: async () => ({
          rawId: mockCredId.slice().buffer,
          getClientExtensionResults: () => ({
            prf: { results: { first: mockPrfOutput.slice().buffer } },
          }),
        }),
      },
    });

    // Enroll Passkey PRF
    await enrollPasskeyPrfUnlock(testDb, oldKek);

    // Reject too-short password
    await expect(
      resetVaultPasswordWithPrf(testDb, 'short', (pw, s) => deriveKEK(pw, s, TEST_KDF_ITERATIONS))
    ).rejects.toThrow(/10/);

    // 3. Reset password via PRF without knowing oldPassword
    const resetResult = await resetVaultPasswordWithPrf(
      testDb,
      newPassword,
      (pw, s) => deriveKEK(pw, s, TEST_KDF_ITERATIONS)
    );

    // Verify decrypted record still matches with returned operationalDek
    const decryptedWithResetDek = await decryptRecordPayload<typeof samplePatient>(
      resetResult.operationalDek,
      'patients',
      'pat_prf_1',
      [],
      encryptedRecord.iv,
      encryptedRecord.ciphertext,
      2,
      1,
      encryptedRecord.recordSalt
    );
    expect(decryptedWithResetDek).toEqual(samplePatient);

    // 4. Verify updated vaultMeta rejects oldPassword and accepts newPassword
    const updatedMeta = await testDb.vaultMeta.get('auth');
    expect(updatedMeta).toBeDefined();

    const wrongKek = await deriveKEK(oldPassword, updatedMeta!.salt, TEST_KDF_ITERATIONS);
    expect(
      await checkVerifier(wrongKek, updatedMeta!.verifierIv, updatedMeta!.verifierCiphertext)
    ).toBe(false);

    const validNewKek = await deriveKEK(newPassword, updatedMeta!.salt, TEST_KDF_ITERATIONS);
    expect(
      await checkVerifier(validNewKek, updatedMeta!.verifierIv, updatedMeta!.verifierCiphertext)
    ).toBe(true);

    // Unwrap DEK with newPassword and decrypt original patient record
    const unwrappedByNewPw = await unwrapOperationalDEK(
      updatedMeta!.wrappedDek,
      updatedMeta!.wrappedDekIv,
      validNewKek,
      updatedMeta!.vaultGeneration ?? 1
    );
    const decryptedByNewPw = await decryptRecordPayload<typeof samplePatient>(
      unwrappedByNewPw,
      'patients',
      'pat_prf_1',
      [],
      encryptedRecord.iv,
      encryptedRecord.ciphertext,
      2,
      1,
      encryptedRecord.recordSalt
    );
    expect(decryptedByNewPw).toEqual(samplePatient);

    // 5. Existing Passkey PRF unlock STILL works after password reset
    const unlockedByPrfAgain = await unlockOperationalDekWithPrf(updatedMeta!);
    const decryptedByPrf = await decryptRecordPayload<typeof samplePatient>(
      unlockedByPrfAgain,
      'patients',
      'pat_prf_1',
      [],
      encryptedRecord.iv,
      encryptedRecord.ciphertext,
      2,
      1,
      encryptedRecord.recordSalt
    );
    expect(decryptedByPrf).toEqual(samplePatient);

    // 6. Existing 32-char Emergency Recovery Key STILL unwraps the DEK
    const rawRecovered = await unwrapDEKWithRecoveryKey(
      keypair.recoveryKeyFormatted!,
      updatedMeta!.recoveryWrappedDek!,
      updatedMeta!.recoveryWrappedDekIv!,
      updatedMeta!.recoverySalt!,
      updatedMeta!.recoveryKdfIterations!
    );
    expect(rawRecovered.length).toBe(32);
    rawRecovered.fill(0);
  });
});
