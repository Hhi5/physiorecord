// =======================================================================
// PhysioRecord — Quick Vault PIN Unlock (PBKDF2-SHA256 + AES-256-GCM DEK Wrap)
// Works cleanly on Desktop (Windows/macOS/Linux Electron), Web & PWA without
// requiring WebAuthn / CredentialsContainer / platform biometric hardware.
// Master password & emergency recovery key always remain fully intact.
// =======================================================================

import type { PhysioRecordDatabase } from '../db/db';
import type { VaultMetaEntity } from '../types/clinical';
import {
  CONSTANTS,
  bindDekToGeneration,
  decryptRawDEKForBackup,
  deriveKEK,
  importOperationalDekFromRawBytes,
  randomBytes,
} from './vault';
import type { KekDerivationFn } from './webauthnPrf';

const PIN_WRAP_AAD = new TextEncoder().encode('vault-pin-dek-wrap:v1');

export const VAULT_PIN_MIN_LENGTH = 4;
export const VAULT_PIN_MAX_LENGTH = 12;
export const VAULT_PIN_MAX_FAILURES = 5;

export type PinValidationErrorCode = 'too_short' | 'too_long' | 'non_digits' | 'weak_pin';

export interface PinValidationResult {
  valid: boolean;
  normalized: string;
  errorCode?: PinValidationErrorCode;
}

export interface PinUnlockOutcome {
  ok: boolean;
  operationalDek?: CryptoKey;
  vaultGeneration?: number;
  rateLimited?: boolean;
  remainingSeconds?: number;
  remainingAttempts?: number;
  disabledByFailures?: boolean;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

/**
 * Normalize Arabic-Indic (٠-٩) and Extended Arabic-Indic (۰-۹) digits to ASCII 0-9
 * and strip surrounding/embedded whitespace.
 */
export function normalizeVaultPinInput(raw: string): string {
  return raw
    .replace(/[\u0660-\u0669]/g, (ch) => String(ch.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (ch) => String(ch.charCodeAt(0) - 0x06f0))
    .replace(/\s+/g, '');
}

function isSequentialDigits(pin: string): boolean {
  if (pin.length < 4) return false;
  let asc = true;
  let desc = true;
  for (let i = 1; i < pin.length; i += 1) {
    const prev = pin.charCodeAt(i - 1);
    const curr = pin.charCodeAt(i);
    if (curr - prev !== 1) asc = false;
    if (prev - curr !== 1) desc = false;
  }
  return asc || desc;
}

function isAllSameOrRepeatedPair(pin: string): boolean {
  if (/^(\d)\1+$/.test(pin)) return true;
  if (pin.length >= 4 && pin.length % 2 === 0) {
    const pair = pin.slice(0, 2);
    if (pair.repeat(pin.length / 2) === pin) return true;
  }
  return false;
}

const COMMON_WEAK_PINS = new Set([
  '0000',
  '1111',
  '1234',
  '4321',
  '1122',
  '2211',
  '1212',
  '2020',
  '12345',
  '54321',
  '123456',
  '654321',
  '012345',
  '112233',
]);

/**
 * Validate Quick Vault PIN (4-12 numeric digits, rejecting trivial/sequential codes).
 */
export function validateVaultPin(rawPin: string): PinValidationResult {
  const normalized = normalizeVaultPinInput(rawPin);
  if (normalized.length < VAULT_PIN_MIN_LENGTH) {
    return { valid: false, normalized, errorCode: 'too_short' };
  }
  if (normalized.length > VAULT_PIN_MAX_LENGTH) {
    return { valid: false, normalized, errorCode: 'too_long' };
  }
  if (!/^[0-9]+$/.test(normalized)) {
    return { valid: false, normalized, errorCode: 'non_digits' };
  }
  if (
    COMMON_WEAK_PINS.has(normalized) ||
    isAllSameOrRepeatedPair(normalized) ||
    isSequentialDigits(normalized)
  ) {
    return { valid: false, normalized, errorCode: 'weak_pin' };
  }
  return { valid: true, normalized };
}

export function isPinUnlockEnrolled(meta?: VaultMetaEntity | null): boolean {
  return Boolean(meta?.pinSalt && meta?.pinWrappedDek && meta?.pinWrappedDekIv);
}

export function getPinLockoutRemainingSeconds(
  meta?: VaultMetaEntity | null,
  nowMs: number = Date.now()
): number {
  if (!meta?.pinLockedUntilMs || meta.pinLockedUntilMs <= nowMs) return 0;
  return Math.max(1, Math.ceil((meta.pinLockedUntilMs - nowMs) / 1000));
}

function computeVaultPinBackoffMs(failedAttempts: number): number {
  if (failedAttempts < 3) return 0;
  if (failedAttempts === 3) return 30_000;
  return 120_000;
}

/**
 * Enroll or update Quick Vault PIN while unlocked with Vault KEK.
 * Wraps a copy of the operational DEK under a PBKDF2-HMAC-SHA256 key derived from the PIN.
 */
export async function enrollVaultPinUnlock(
  database: PhysioRecordDatabase,
  vaultKek: CryptoKey,
  rawPin: string,
  deriveKekFn?: KekDerivationFn,
  onProgress?: (pct: number) => void
): Promise<void> {
  const validation = validateVaultPin(rawPin);
  if (!validation.valid) {
    if (validation.errorCode === 'non_digits') {
      throw new Error('يجب أن يتكوّن رمز PIN من أرقام فقط (0–9).');
    }
    if (validation.errorCode === 'too_short' || validation.errorCode === 'too_long') {
      throw new Error('يجب أن يتكوّن رمز PIN من 4 إلى 12 رقماً.');
    }
    throw new Error('يرجى اختيار رمز PIN أقوى وتجنّب الرموز السهلة مثل 1234 أو 0000.');
  }

  const meta = await database.vaultMeta.get('auth');
  if (!meta) {
    throw new Error('الخزينة غير مهيأة.');
  }

  const rawDek = await decryptRawDEKForBackup(meta.wrappedDek, meta.wrappedDekIv, vaultKek);
  try {
    const pinSalt = randomBytes(CONSTANTS.SALT_BYTES);
    const iterations = CONSTANTS.DEFAULT_PBKDF2_ITERATIONS;
    const pinKek = deriveKekFn
      ? await deriveKekFn(validation.normalized, pinSalt, iterations, onProgress)
      : await deriveKEK(validation.normalized, pinSalt, iterations);

    const pinWrappedDekIv = randomBytes(CONSTANTS.IV_BYTES);
    const wrappedBuf = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(pinWrappedDekIv), additionalData: PIN_WRAP_AAD },
      pinKek,
      toArrayBuffer(rawDek)
    );

    await database.vaultMeta.update('auth', {
      pinSalt,
      pinWrappedDek: new Uint8Array(wrappedBuf),
      pinWrappedDekIv,
      pinKdfIterations: iterations,
      pinEnabledAt: new Date().toISOString(),
      pinFailedAttempts: 0,
      pinLockedUntilMs: 0,
    });
  } finally {
    rawDek.fill(0);
  }
}

/**
 * Attempt to unlock the operational DEK using the configured Quick Vault PIN.
 * Enforces progressive rate limiting and automatically disables Quick PIN after 5 consecutive failures.
 */
export async function unlockOperationalDekWithPin(
  database: PhysioRecordDatabase,
  rawPin: string,
  deriveKekFn?: KekDerivationFn,
  onProgress?: (pct: number) => void
): Promise<PinUnlockOutcome> {
  const meta = await database.vaultMeta.get('auth');
  if (!meta || !isPinUnlockEnrolled(meta)) {
    throw new Error('الفتح السريع برمز PIN غير مفعّل لهذه الخزينة.');
  }

  const nowMs = Date.now();
  const remainingCooldown = getPinLockoutRemainingSeconds(meta, nowMs);
  if (remainingCooldown > 0) {
    return {
      ok: false,
      rateLimited: true,
      remainingSeconds: remainingCooldown,
      remainingAttempts: Math.max(0, VAULT_PIN_MAX_FAILURES - (meta.pinFailedAttempts ?? 0)),
    };
  }

  const normalized = normalizeVaultPinInput(rawPin);
  if (!normalized || !/^[0-9]+$/.test(normalized)) {
    return {
      ok: false,
      remainingAttempts: Math.max(0, VAULT_PIN_MAX_FAILURES - (meta.pinFailedAttempts ?? 0)),
    };
  }

  const iterations = meta.pinKdfIterations || CONSTANTS.DEFAULT_PBKDF2_ITERATIONS;
  const candidateKek = deriveKekFn
    ? await deriveKekFn(normalized, new Uint8Array(meta.pinSalt!), iterations, onProgress)
    : await deriveKEK(normalized, new Uint8Array(meta.pinSalt!), iterations);

  let rawDek: Uint8Array | null = null;
  try {
    const rawBuf = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(new Uint8Array(meta.pinWrappedDekIv!)),
        additionalData: PIN_WRAP_AAD,
      },
      candidateKek,
      toArrayBuffer(new Uint8Array(meta.pinWrappedDek!))
    );
    rawDek = new Uint8Array(rawBuf);
    const generation = meta.vaultGeneration ?? 1;
    const operationalDek = await importOperationalDekFromRawBytes(rawDek, generation);
    bindDekToGeneration(operationalDek, generation);

    await database.vaultMeta.update('auth', {
      pinFailedAttempts: 0,
      pinLockedUntilMs: 0,
    });

    return {
      ok: true,
      operationalDek,
      vaultGeneration: generation,
    };
  } catch {
    const nextFailed = (meta.pinFailedAttempts ?? 0) + 1;
    if (nextFailed >= VAULT_PIN_MAX_FAILURES) {
      await disablePinUnlock(database);
      return {
        ok: false,
        disabledByFailures: true,
        remainingAttempts: 0,
      };
    }

    const backoffMs = computeVaultPinBackoffMs(nextFailed);
    const lockedUntilMs = backoffMs > 0 ? Date.now() + backoffMs : 0;
    await database.vaultMeta.update('auth', {
      pinFailedAttempts: nextFailed,
      pinLockedUntilMs: lockedUntilMs,
    });

    return {
      ok: false,
      rateLimited: backoffMs > 0,
      remainingSeconds: backoffMs > 0 ? Math.ceil(backoffMs / 1000) : 0,
      remainingAttempts: Math.max(0, VAULT_PIN_MAX_FAILURES - nextFailed),
    };
  } finally {
    if (rawDek) rawDek.fill(0);
  }
}

/**
 * Remove stored Quick Vault PIN wrapping metadata cleanly (master password remains unaffected).
 */
export async function disablePinUnlock(database: PhysioRecordDatabase): Promise<void> {
  const meta = await database.vaultMeta.get('auth');
  if (meta) {
    await database.vaultMeta.update('auth', {
      pinSalt: undefined,
      pinWrappedDek: undefined,
      pinWrappedDekIv: undefined,
      pinKdfIterations: undefined,
      pinEnabledAt: undefined,
      pinFailedAttempts: 0,
      pinLockedUntilMs: 0,
    });
  }
}
