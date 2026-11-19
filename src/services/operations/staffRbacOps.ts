// =======================================================================
// PhysioRecord — Admin PIN Security, Staff Roster & Hash-Chained Audit Log
// =======================================================================

import type { PhysioRecordDatabase } from '../../db/db';
import {
  CURRENT_DEK_VERSION,
  CURRENT_RECORD_CRYPTO_VERSION,
  decryptRecordPayload,
} from '../../crypto/vault';
import type { EncryptedAuditLogEntity } from '../../types/clinical';
import type {
  AdminPinAuthRecord,
  AuditChainVerificationResult,
  AuditLogEntry,
  ClinicStaffMember,
  DailyAuditDigest,
  PinRateLimitState,
} from '../../types/clinicManagement';
import { localDate } from '../../utils/date';
import {
  ADMIN_PIN_PBKDF2_ITERATIONS,
  computeAuditEntryHash,
  computePinBackoffMs,
  computeSha256Hex,
  hashAdminPinPBKDF2,
  verifyAdminPinPBKDF2,
  verifyAuditLogChainEntries,
} from '../clinicSecurityHelpers';
import { CLINIC_STAFF_ROSTER } from './operationsConstants';
import type { OperationsRuntime } from './operationsTypes';

// ---------------------------------------------------------------------
// Admin PIN Security (1.1: PBKDF2-SHA256 in IndexedDB + Exponential Backoff)
// Zero hardcoded default PIN; forces setup on first run.
// ---------------------------------------------------------------------
export function isAdminPinConfiguredOps(rt: OperationsRuntime): boolean {
  const auth = rt.getCache().adminAuth;
  return Boolean(auth && !auth.requiresFirstRunReset && auth.pinHashBase64 && auth.pinSaltBase64);
}

export function requiresFirstRunAdminPinSetupOps(rt: OperationsRuntime): boolean {
  const cache = rt.getCache();
  if (cache.workspaceMode.wizardCompleted && cache.workspaceMode.mode === 'solo') {
    return false;
  }
  return !isAdminPinConfiguredOps(rt);
}

export function getAdminPinStatusOps(rt: OperationsRuntime): {
  isConfigured: boolean;
  requiresFirstRunReset: boolean;
  rateLimit: PinRateLimitState;
  remainingLockSeconds: number;
} {
  const cache = rt.getCache();
  const nowMs = Date.now();
  const lockedUntilMs = cache.pinRateLimit.lockedUntilMs || 0;
  const remainingLockSeconds =
    lockedUntilMs > nowMs ? Math.ceil((lockedUntilMs - nowMs) / 1000) : 0;
  return {
    isConfigured: isAdminPinConfiguredOps(rt),
    requiresFirstRunReset: !isAdminPinConfiguredOps(rt),
    rateLimit: { ...cache.pinRateLimit },
    remainingLockSeconds,
  };
}

export async function setAdminPinOps(rt: OperationsRuntime, pin: string): Promise<void> {
  const trimmed = pin.trim();
  if (trimmed.length < 4 || trimmed.length > 32) {
    throw new Error(
      'Admin PIN must be between 4 and 32 characters (يجب أن يكون رمز المدير 4 إلى 32 خانة).'
    );
  }
  if (trimmed === '1234' || trimmed === '0000') {
    throw new Error(
      'Please choose a strong custom Admin PIN instead of a trivial code (يرجى اختيار رمز مخصص وقوي).'
    );
  }

  const cache = rt.getCache();
  const { hashBase64, saltBase64, iterations } = await hashAdminPinPBKDF2(
    trimmed,
    undefined,
    ADMIN_PIN_PBKDF2_ITERATIONS
  );
  const now = new Date().toISOString();
  const nextRecord: AdminPinAuthRecord = {
    id: 'admin_auth',
    pinHashBase64: hashBase64,
    pinSaltBase64: saltBase64,
    iterations,
    requiresFirstRunReset: false,
    updatedAt: now,
    version: (cache.adminAuth?.version || 0) + 1,
  };
  const nextRateLimit: PinRateLimitState = {
    id: 'pin_rate_limit',
    failedAttempts: 0,
    lockedUntilMs: 0,
    updatedAt: now,
    version: (cache.pinRateLimit.version || 0) + 1,
  };

  cache.adminAuth = nextRecord;
  cache.pinRateLimit = nextRateLimit;

  await rt.trackWrite(
    rt.putRecordEncrypted('clinicSettings', 'admin_auth', [], nextRecord, {}, { skipConcurrencyCheck: true })
  );
  await rt.trackWrite(
    rt.putRecordEncrypted('clinicSettings', 'pin_rate_limit', [], nextRateLimit, {}, { skipConcurrencyCheck: true })
  );
  await rt.appendAuditLogAsync({
    actionType: 'pin_changed',
    entityType: 'settings',
    entityId: 'admin_auth',
    summaryAr: 'تم تعيين أو تحديث رمز PIN لصلاحية مدير العيادة (مشفر بـ PBKDF2)',
    summaryEn: 'Updated Clinic Admin PIN (PBKDF2-SHA256 encrypted)',
  });
  rt.notifyListeners();
}

export async function verifyAdminPinOps(
  rt: OperationsRuntime,
  pinAttempt: string
): Promise<{
  ok: boolean;
  rateLimited: boolean;
  remainingSeconds: number;
  requiresSetup: boolean;
}> {
  const cache = rt.getCache();
  if (!isAdminPinConfiguredOps(rt) || !cache.adminAuth) {
    return {
      ok: false,
      rateLimited: false,
      remainingSeconds: 0,
      requiresSetup: true,
    };
  }

  const nowMs = Date.now();
  if (cache.pinRateLimit.lockedUntilMs > nowMs) {
    const remainingSeconds = Math.ceil((cache.pinRateLimit.lockedUntilMs - nowMs) / 1000);
    return {
      ok: false,
      rateLimited: true,
      remainingSeconds,
      requiresSetup: false,
    };
  }

  const valid = await verifyAdminPinPBKDF2(pinAttempt, cache.adminAuth);
  const nowIso = new Date().toISOString();

  if (valid) {
    const resetState: PinRateLimitState = {
      id: 'pin_rate_limit',
      failedAttempts: 0,
      lockedUntilMs: 0,
      updatedAt: nowIso,
      version: (cache.pinRateLimit.version || 0) + 1,
    };
    cache.pinRateLimit = resetState;
    await rt.trackWrite(
      rt.putRecordEncrypted('clinicSettings', 'pin_rate_limit', [], resetState, {}, { skipConcurrencyCheck: true })
    );
    return {
      ok: true,
      rateLimited: false,
      remainingSeconds: 0,
      requiresSetup: false,
    };
  }

  const nextFails = (cache.pinRateLimit.failedAttempts || 0) + 1;
  const delayMs = computePinBackoffMs(nextFails);
  const nextRateState: PinRateLimitState = {
    id: 'pin_rate_limit',
    failedAttempts: nextFails,
    lockedUntilMs: delayMs > 0 ? nowMs + delayMs : 0,
    lastFailedAt: nowIso,
    updatedAt: nowIso,
    version: (cache.pinRateLimit.version || 0) + 1,
  };
  cache.pinRateLimit = nextRateState;
  await rt.trackWrite(
    rt.putRecordEncrypted('clinicSettings', 'pin_rate_limit', [], nextRateState, {}, { skipConcurrencyCheck: true })
  );
  await rt.appendAuditLogAsync({
    actionType: 'pin_failed',
    entityType: 'settings',
    entityId: 'admin_auth',
    summaryAr: `محاولة خاطئة لإدخال رمز المدير (#${nextFails})`,
    summaryEn: `Failed Admin PIN verification attempt (#${nextFails})`,
  });

  return {
    ok: false,
    rateLimited: delayMs > 0,
    remainingSeconds: Math.ceil(delayMs / 1000),
    requiresSetup: false,
  };
}

// ---------------------------------------------------------------------
// Staff Attribution Roster (Honest attribution labels, not auth)
// ---------------------------------------------------------------------
export function getStaffRosterOps(rt: OperationsRuntime): ClinicStaffMember[] {
  const roster = rt.getCache().staffRoster;
  return roster.length > 0 ? [...roster] : [...CLINIC_STAFF_ROSTER];
}

export function saveStaffRosterOps(rt: OperationsRuntime, roster: ClinicStaffMember[]): void {
  rt.getCache().staffRoster = roster;
  void rt.trackWrite(
    rt.putRecordEncrypted(
      'staffState',
      'staff_roster',
      [],
      roster,
      {},
      { skipConcurrencyCheck: true }
    )
  ).catch(() => undefined);
  rt.notifyListeners();
}

export function getActiveStaffOps(rt: OperationsRuntime): ClinicStaffMember {
  const roster = getStaffRosterOps(rt);
  return roster.find((s) => s.id === rt.getCache().activeStaffId) || roster[0];
}

export function setActiveStaffOps(rt: OperationsRuntime, staffId: string): ClinicStaffMember {
  const roster = getStaffRosterOps(rt);
  const matched = roster.find((s) => s.id === staffId) || roster[0];
  rt.getCache().activeStaffId = matched.id;
  void rt.trackWrite(
    rt.putRecordEncrypted(
      'staffState',
      'active_staff',
      [],
      { activeStaffId: matched.id, updatedAt: new Date().toISOString() },
      {},
      { skipConcurrencyCheck: true }
    )
  ).catch(() => undefined);
  rt.appendAuditLog({
    actionType: 'staff_switched',
    entityType: 'staff',
    entityId: matched.id,
    summaryAr: `تبديل ملصق إسناد الموظف إلى: ${matched.nameAr}`,
    summaryEn: `Switched staff attribution label to: ${matched.nameEn}`,
  });
  rt.notifyListeners();
  return matched;
}

// ---------------------------------------------------------------------
// Hash-Chained Encrypted Audit Log (1.6)
// ---------------------------------------------------------------------
export function getAuditLogsOps(rt: OperationsRuntime): AuditLogEntry[] {
  return rt.getCache().auditLogs.slice(0, 500);
}

export function appendAuditLogOps(
  rt: OperationsRuntime,
  params: {
    actionType: AuditLogEntry['actionType'];
    entityType: AuditLogEntry['entityType'];
    entityId: string;
    patientId?: string;
    episodeId?: string;
    summaryAr: string;
    summaryEn: string;
  }
): AuditLogEntry {
  const staff = rt.getActiveStaff();
  const id = `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const provisional: AuditLogEntry = {
    id,
    timestamp: new Date().toISOString(),
    actorName: staff.nameAr || staff.nameEn,
    actorRole: staff.role,
    staffId: staff.id,
    staffNameAr: staff.nameAr,
    staffNameEn: staff.nameEn,
    role: staff.role,
    ...params,
  };

  const cache = rt.getCache();
  cache.auditLogs = [provisional, ...cache.auditLogs];

  const task = rt.getAuditChainQueue().then(async () => {
    await rt.ensureColdStoreLoadedAsync('auditLogs');
    const currentCache = rt.getCache();
    const chainedOnly = currentCache.auditLogs.filter(
      (e) => e.id !== id && typeof e.sequence === 'number' && typeof e.entryHash === 'string'
    );
    let maxSeq = 0;
    let prevHash = 'GENESIS';
    for (const item of chainedOnly) {
      if ((item.sequence as number) > maxSeq) {
        maxSeq = item.sequence as number;
        prevHash = item.entryHash as string;
      }
    }

    const patientIdHashSha256 = provisional.patientId
      ? await computeSha256Hex(provisional.patientId)
      : undefined;

    const unsignedEntry: Omit<AuditLogEntry, 'entryHash'> = {
      ...provisional,
      sequence: maxSeq + 1,
      prevHash,
      ...(patientIdHashSha256 ? { patientIdHashSha256 } : {}),
    };
    const entryHash = await computeAuditEntryHash(unsignedEntry);
    const finalized: AuditLogEntry = {
      ...unsignedEntry,
      entryHash,
    };

    const idx = currentCache.auditLogs.findIndex((e) => e.id === id);
    if (idx >= 0) {
      currentCache.auditLogs[idx] = finalized;
    }

    if (rt.getActiveDek()) {
      await rt.putRecordEncrypted(
        'auditLogs',
        finalized.id,
        [],
        finalized,
        {
          ...(finalized.patientId ? { patientId: finalized.patientId } : {}),
          ...(finalized.episodeId ? { episodeId: finalized.episodeId } : {}),
          createdAt: finalized.timestamp,
        },
        { skipBroadcast: true, skipConcurrencyCheck: true }
      );
    }
  });

  rt.setAuditChainQueue(task.catch(() => undefined));
  void rt.trackWrite(task).catch(() => undefined);
  return provisional;
}

export async function appendAuditLogAsyncOps(
  rt: OperationsRuntime,
  params: {
    actionType: AuditLogEntry['actionType'];
    entityType: AuditLogEntry['entityType'];
    entityId: string;
    patientId?: string;
    episodeId?: string;
    summaryAr: string;
    summaryEn: string;
  }
): Promise<AuditLogEntry> {
  const entry = appendAuditLogOps(rt, params);
  await rt.getAuditChainQueue();
  return rt.getCache().auditLogs.find((e) => e.id === entry.id) || entry;
}

export async function verifyAuditChainOps(
  rt: OperationsRuntime,
  database?: PhysioRecordDatabase,
  dek?: CryptoKey
): Promise<AuditChainVerificationResult> {
  await rt.getAuditChainQueue();
  const targetDb = database || rt.getActiveDb();
  const targetDek = dek || rt.getActiveDek();

  if (targetDek && targetDb) {
    const rows = (await targetDb.auditLogs.toArray()) as EncryptedAuditLogEntity[];
    const decryptedEntries: AuditLogEntry[] = [];
    for (const row of rows) {
      try {
        const dec = await decryptRecordPayload<AuditLogEntry>(
          targetDek,
          'auditLogs',
          row.id,
          [],
          row.iv,
          row.ciphertext,
          row.recordCryptoVersion || CURRENT_RECORD_CRYPTO_VERSION,
          row.dekVersion || CURRENT_DEK_VERSION,
          row.recordSalt
        );
        decryptedEntries.push(dec);
      } catch (err) {
        return {
          valid: false,
          totalEntries: rows.length,
          verifiedEntries: decryptedEntries.length,
          legacyUnchainedEntries: 0,
          brokenAtEntryId: row.id,
          brokenReason:
            err instanceof Error
              ? `Encrypted audit row decryption failed (${row.id}): ${err.message}`
              : `Encrypted audit row decryption failed (${row.id}).`,
          verifiedAt: new Date().toISOString(),
        };
      }
    }
    return verifyAuditLogChainEntries(decryptedEntries);
  }

  return verifyAuditLogChainEntries(rt.getCache().auditLogs);
}

export async function buildDailyAuditDigestOps(
  rt: OperationsRuntime,
  dateKey: string
): Promise<DailyAuditDigest> {
  await rt.ensureColdStoreLoadedAsync('auditLogs');
  const verification = await verifyAuditChainOps(rt);
  const entries = rt
    .getCache()
    .auditLogs.filter((e) => localDate(e.timestamp) === dateKey)
    .slice()
    .sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

  return {
    dateKey,
    generatedAt: new Date().toISOString(),
    totalEntries: entries.length,
    headHash: entries[entries.length - 1]?.entryHash || verification.headHash || 'GENESIS',
    chainValid: verification.valid,
    entries,
  };
}
