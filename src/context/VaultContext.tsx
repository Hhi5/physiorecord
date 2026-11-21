// =======================================================================
// PhysioRecord — Vault & Authentication Context (Envelope Encryption v1.1)
// Phase 1B: KDF Auto-Upgrade, Emergency Recovery Key, and Bulletproof Auto-Lock
// =======================================================================

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { db, requestPersistentStorage } from '../db/db';
import {
  generateAndWrapOperationalDEK,
  unwrapOperationalDEK,
  decryptRawDEKForBackup,
  wrapDEK,
  generateVerifier,
  checkVerifier,
  randomBytes,
  bindDekToGeneration,
  CONSTANTS,
  CURRENT_DEK_VERSION,
  checkNeedsKdfUpgrade,
  autoUpgradeVaultKdf,
  resetVaultPasswordWithRecoveryKey,
  getEncryptionKeyUsageStatus,
  rotateAllKeys,
  isQuarterlyRecoveryDrillDue,
  type KeyRotationSummary,
} from '../crypto/vault';
import { deriveKEKWithWorker } from '../crypto/cryptoWorkerClient';
import {
  getBiometricAvailabilityInfo,
  isBiometricUnlockEnrolled,
  enrollPasskeyPrfUnlock,
  unlockOperationalDekWithPrf,
  resetVaultPasswordWithPrf,
  disablePasskeyPrfUnlock,
  type BiometricUnavailableReason,
  type BiometricUnlockMode,
} from '../crypto/webauthnPrf';
import {
  isPinUnlockEnrolled,
  enrollVaultPinUnlock,
  unlockOperationalDekWithPin,
  disablePinUnlock,
  type PinUnlockOutcome,
} from '../crypto/vaultPin';
import {
  loadPasswordReminderState,
  isPasswordReminderDue,
  recordPasswordMemoryVerified,
  recordPasswordChangedSchedule,
  snoozePasswordReminderState,
  setPasswordReminderEnabledState,
  getReminderIntervalDays,
  type PasswordReminderState,
} from '../utils/passwordReminderSchedule';
import { saveVaultPasswordToBrowserManager } from '../utils/passwordReminderSchedule';
import { subscribeToVaultEvents, broadcastVaultEvent } from '../utils/vaultEvents';
import { SessionService } from '../services/sessionService';
import { ClinicOperationsService } from '../services/clinicOperationsService';
import { DraftRecoveryService } from '../services/draftRecoveryService';
import { LocalStorageMigrationService, type LocalStorageMigrationResult } from '../services/localStorageMigrationService';
import {
  clearNativeAndroidBiometricDek,
  detectDexieSchemaDowngradeError,
  isNativeAppShell,
  type DexieSchemaDowngradeInfo,
} from '../platform/nativeBridge';
import type { DecryptedDraftRecord } from '../types/clinical';
import { recordSafeNonFatalWarning } from '../utils/safeDevDiagnostics';

export interface VaultRepairSummary {
  repairedCount: number;
  skippedCount: number;
  repairedSessionIds: string[];
  skippedSessionIds: string[];
  repairedSessions: Array<{
    sessionId: string;
    episodeId: string;
    patientId: string;
  }>;
}

export interface EncryptionKeyUsageStatus {
  persistedCount: number;
  effectiveCount: number;
  maxLimit: number;
  usageRatio: number;
  usagePercent: number;
  shouldAutoRotate: boolean;
}

interface VaultContextType {
  ready: boolean;
  isInitialized: boolean;
  isLocked: boolean;
  dek: CryptoKey | null; // Operational non-extractable DEK
  vaultKek: CryptoKey | null; // Active Vault KEK held only while unlocked
  vaultGeneration: number | null; // Technical epoch/generation bound to in-memory DEK
  persistenceGranted: boolean;
  kdfProgress: number;
  isPrfSupported: boolean;
  isPrfEnrolled: boolean;
  isPinEnrolled: boolean;
  biometricMode: BiometricUnlockMode;
  biometricUnavailableReason: BiometricUnavailableReason;
  keyUsageStatus: EncryptionKeyUsageStatus | null;
  schemaDowngradeError: DexieSchemaDowngradeInfo | null;
  lastRepairSummary: VaultRepairSummary | null;
  repairError: string | null;
  lastMigrationResult: LocalStorageMigrationResult | null;
  dismissMigrationResult: () => void;
  autoLockTimeoutMs: number;
  setAutoLockTimeoutMs: (timeoutMs: number) => void;
  secondsUntilAutoLock: number | null;
  stayUnlocked: () => void;
  recoveredDrafts: DecryptedDraftRecord[];
  dismissRecoveredDraft: (draftId: string) => Promise<void>;
  clearAllRecoveredDrafts: () => Promise<void>;
  refreshRecoveredDrafts: () => Promise<void>;
  isRecoveryDrillDue: boolean;
  lastRecoveryDrillAt: string | null;
  refreshRecoveryDrillStatus: () => Promise<void>;
  snoozeRecoveryDrillBanner: (days?: number) => void;
  passwordReminderState: PasswordReminderState;
  isPasswordReminderDueNow: boolean;
  setPasswordReminderEnabled: (enabled: boolean) => void;
  confirmPasswordMemoryCheck: (password: string) => Promise<{ ok: boolean; nextIntervalDays?: number }>;
  snoozePasswordReminder: (days?: number) => void;
  dismissRepairNotice: () => void;
  setupPassword: (password: string) => Promise<{ recoveryKeyFormatted: string }>;
  completeSetup: () => void;
  unlock: (password: string) => Promise<boolean>;
  verifyVaultPassword: (password: string) => Promise<boolean>;
  unlockWithPrf: () => Promise<boolean>;
  enrollPrf: () => Promise<void>;
  disablePrf: () => Promise<void>;
  unlockWithPin: (pin: string) => Promise<PinUnlockOutcome>;
  enrollPin: (pin: string, masterPasswordForVerification?: string) => Promise<void>;
  disablePin: () => Promise<void>;
  refreshKeyUsageStatus: () => Promise<EncryptionKeyUsageStatus | null>;
  rotateDekNow: () => Promise<KeyRotationSummary>;
  resetPasswordWithRecovery: (recoveryKey: string, newPassword: string) => Promise<{ newRecoveryKeyFormatted: string }>;
  resetPasswordWithPrf: (newPassword: string) => Promise<void>;
  changeVaultPassword: (oldPass: string, newPass: string) => Promise<void>;
  lock: () => void;
  wipeDatabase: () => Promise<void>;
}

const VaultContext = createContext<VaultContextType | null>(null);

const DEFAULT_AUTO_LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes default (Batch 1 P0)

const AUTO_LOCK_WARNING_WINDOW_MS = 30 * 1000;

export const VaultProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ready, setReady] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLocked, setIsLocked] = useState(true);
  const [dek, setDek] = useState<CryptoKey | null>(null);
  const [vaultKek, setVaultKek] = useState<CryptoKey | null>(null);
  const [vaultGeneration, setVaultGeneration] = useState<number | null>(null);
  const [persistenceGranted, setPersistenceGranted] = useState(false);
  const [lastRepairSummary, setLastRepairSummary] = useState<VaultRepairSummary | null>(null);
  const [repairError, setRepairError] = useState<string | null>(null);
  const [lastMigrationResult, setLastMigrationResult] = useState<LocalStorageMigrationResult | null>(null);
  const [kdfProgress, setKdfProgress] = useState<number>(0);
  const [isPrfSupported, setIsPrfSupported] = useState<boolean>(false);
  const [isPrfEnrolled, setIsPrfEnrolled] = useState<boolean>(false);
  const [isPinEnrolled, setIsPinEnrolled] = useState<boolean>(false);
  const [biometricMode, setBiometricMode] = useState<BiometricUnlockMode>('unsupported');
  const [biometricUnavailableReason, setBiometricUnavailableReason] =
    useState<BiometricUnavailableReason>('browser-unsupported');
  const [keyUsageStatus, setKeyUsageStatus] = useState<EncryptionKeyUsageStatus | null>(null);
  const [schemaDowngradeError, setSchemaDowngradeError] = useState<DexieSchemaDowngradeInfo | null>(null);
  const [secondsUntilAutoLock, setSecondsUntilAutoLock] = useState<number | null>(null);
  const [recoveredDrafts, setRecoveredDrafts] = useState<DecryptedDraftRecord[]>([]);
  const [lastRecoveryDrillAt, setLastRecoveryDrillAt] = useState<string | null>(null);
  const [isRecoveryDrillDue, setIsRecoveryDrillDue] = useState<boolean>(false);
  const [passwordReminderState, setPasswordReminderState] = useState<PasswordReminderState>(() =>
    loadPasswordReminderState()
  );
  const [isPasswordReminderDueNow, setIsPasswordReminderDueNow] = useState<boolean>(() =>
    isPasswordReminderDue(loadPasswordReminderState())
  );
  const dekRef = useRef<CryptoKey | null>(null);
  dekRef.current = dek;

  // Configurable inactivity auto-lock timeout (Phase 1B; 0 = Never auto-lock)
  const [autoLockTimeoutMs, setAutoLockTimeoutMsState] = useState<number>(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('physiorecord_autolock_timeout_ms');
      if (saved !== null) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && (parsed === 0 || parsed >= 60_000)) return parsed;
      }
    }
    return DEFAULT_AUTO_LOCK_TIMEOUT_MS;
  });

  const setAutoLockTimeoutMs = useCallback((newMs: number) => {
    const clamped = newMs <= 0 ? 0 : Math.max(60_000, newMs);
    setAutoLockTimeoutMsState(clamped);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('physiorecord_autolock_timeout_ms', String(clamped));
    }
  }, []);

  const lastActivityRef = useRef<number>(Date.now());
  const hiddenAtRef = useRef<number | null>(null);
  const autoLockTimerRef = useRef<NodeJS.Timeout | null>(null);

  const dismissRepairNotice = useCallback(() => {
    setLastRepairSummary(null);
    setRepairError(null);
  }, []);

  const dismissMigrationResult = useCallback(() => {
    setLastMigrationResult(null);
  }, []);

  // Best-effort sensitive memory cleanup and lock (Phase 1B + A1/A2 pre-lock draft flush)
  // Captures transient DEK reference to flush any unsaved encrypted drafts before GC while locking UI immediately
  const lock = useCallback((skipDraftFlush = false) => {
    const preLockDek = dekRef.current;
    setDek(null);
    setVaultKek(null);
    setVaultGeneration(null);
    setIsLocked(true);
    setKdfProgress(0);
    setKeyUsageStatus(null);
    setSecondsUntilAutoLock(null);
    setRecoveredDrafts([]);
    dekRef.current = null;
    ClinicOperationsService.clearInMemoryCache();
    hiddenAtRef.current = null;
    if (autoLockTimerRef.current) {
      clearTimeout(autoLockTimerRef.current);
      autoLockTimerRef.current = null;
    }
    if (preLockDek && !skipDraftFlush) {
      void DraftRecoveryService.flushAllPendingDrafts(preLockDek, db).catch(() => undefined);
    }
  }, []);

  const refreshRecoveredDrafts = useCallback(async (targetDek?: CryptoKey | null) => {
    const activeDek = targetDek ?? dekRef.current;
    if (!activeDek) {
      setRecoveredDrafts([]);
      return;
    }
    try {
      const drafts = await DraftRecoveryService.listDecryptedDraftsAsync(activeDek, db);
      setRecoveredDrafts(drafts);
    } catch {
      setRecoveredDrafts([]);
    }
  }, []);

  const dismissRecoveredDraft = useCallback(async (draftId: string) => {
    await DraftRecoveryService.deleteDraftByIdAsync(draftId, db);
    setRecoveredDrafts((prev) => prev.filter((d) => d.id !== draftId));
  }, []);

  const clearAllRecoveredDrafts = useCallback(async () => {
    await DraftRecoveryService.clearAllDraftsAsync(db);
    setRecoveredDrafts([]);
  }, []);

  const refreshRecoveryDrillStatus = useCallback(async () => {
    try {
      const meta = await db.vaultMeta.get('auth');
      setLastRecoveryDrillAt(meta?.lastRecoveryDrillAt ?? null);
      const snoozeUntilStr =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem('physiorecord_recovery_drill_snooze_until')
          : null;
      const snoozeUntilMs = snoozeUntilStr ? Number(snoozeUntilStr) : 0;
      const isSnoozed = Number.isFinite(snoozeUntilMs) && snoozeUntilMs > Date.now();
      setIsRecoveryDrillDue(!isSnoozed && isQuarterlyRecoveryDrillDue(meta));
    } catch {
      setIsRecoveryDrillDue(false);
    }
  }, []);

  const snoozeRecoveryDrillBanner = useCallback((days: number = 14) => {
    if (typeof localStorage !== 'undefined') {
      const until = Date.now() + Math.max(1, days) * 24 * 60 * 60 * 1000;
      localStorage.setItem('physiorecord_recovery_drill_snooze_until', String(until));
    }
    setIsRecoveryDrillDue(false);
  }, []);

  const refreshPasswordReminderStatus = useCallback(() => {
    const next = loadPasswordReminderState();
    setPasswordReminderState(next);
    setIsPasswordReminderDueNow(isPasswordReminderDue(next));
  }, []);

  const setPasswordReminderEnabled = useCallback((enabled: boolean) => {
    const next = setPasswordReminderEnabledState(enabled);
    setPasswordReminderState(next);
    setIsPasswordReminderDueNow(isPasswordReminderDue(next));
  }, []);

  const snoozePasswordReminder = useCallback((days: number = 2) => {
    const next = snoozePasswordReminderState(days);
    setPasswordReminderState(next);
    setIsPasswordReminderDueNow(isPasswordReminderDue(next));
  }, []);

  // Global pagehide / visibilitychange / beforeunload encrypted draft flush (Phase A1)
  useEffect(() => {
    return DraftRecoveryService.attachGlobalDraftFlushHandlers(() => dekRef.current, db);
  }, []);

  // Update activity timestamp ONLY when the tab is visible (Phase 1B requirement: Do NOT update if hidden!)
  const updateActivity = useCallback(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return;
    }
    lastActivityRef.current = Date.now();
    setSecondsUntilAutoLock((prev) => (prev === null ? prev : null));
  }, []);

  const stayUnlocked = useCallback(() => {
    updateActivity();
  }, [updateActivity]);

  // Multi-tier Bulletproof Inactivity Monitor (Phase 1B + A2 30s warning countdown):
  // 1. User interactions when tab is visible update lastActivityRef.
  // 2. Hidden-tab bypass fix: When document.visibilityState becomes 'hidden', record hiddenAt.
  //    When document becomes 'visible', check Date.now() - hiddenAt and Date.now() - lastActivity.
  //    If either exceeds timeout, lock IMMEDIATELY (flushing drafts before clearing DEK).
  // 3. 1-second timer tick shows 30s warning countdown and triggers deterministic lock at <=0s.
  useEffect(() => {
    if (isLocked || autoLockTimeoutMs <= 0) {
      hiddenAtRef.current = null;
      setSecondsUntilAutoLock(null);
      if (autoLockTimerRef.current) clearTimeout(autoLockTimerRef.current);
      return;
    }

    const checkInactivityAndLock = () => {
      if (autoLockTimeoutMs <= 0) return false;
      const now = Date.now();
      const elapsedSinceActivity = now - lastActivityRef.current;
      const elapsedSinceHidden = hiddenAtRef.current !== null ? now - hiddenAtRef.current : 0;

      if (elapsedSinceActivity >= autoLockTimeoutMs || elapsedSinceHidden >= autoLockTimeoutMs) {
        console.warn('PhysioRecord: Inactivity timeout reached. Locking vault.');
        lock();
        return true;
      }

      const remainingMs = autoLockTimeoutMs - elapsedSinceActivity;
      if (remainingMs <= AUTO_LOCK_WARNING_WINDOW_MS) {
        const secs = Math.max(1, Math.ceil(remainingMs / 1000));
        setSecondsUntilAutoLock((prev) => (prev === secs ? prev : secs));
      } else {
        setSecondsUntilAutoLock((prev) => (prev === null ? null : null));
      }
      return false;
    };

    const handleUserInteraction = () => {
      if (document.visibilityState === 'visible') {
        updateActivity();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // Tab went to background: record hiddenAt. Do NOT update activity timestamp!
        hiddenAtRef.current = Date.now();
      } else if (document.visibilityState === 'visible') {
        // Tab resumed / became visible: check elapsed duration while hidden
        if (hiddenAtRef.current !== null) {
          const elapsedHidden = Date.now() - hiddenAtRef.current;
          const elapsedActivity = Date.now() - lastActivityRef.current;
          if (elapsedHidden >= autoLockTimeoutMs || elapsedActivity >= autoLockTimeoutMs) {
            console.warn(
              `PhysioRecord: Auto-locking vault on resume (hidden duration: ${elapsedHidden}ms, total inactive: ${elapsedActivity}ms)`
            );
            hiddenAtRef.current = null;
            lock();
            return;
          }
          hiddenAtRef.current = null;
        }
        // If still within allowed timeout, refresh activity timestamp on becoming active
        updateActivity();
      }
    };

    // 1-second check interval for 30s warning countdown and exact timeout enforcement
    const heartbeat = setInterval(() => {
      checkInactivityAndLock();
    }, 1000);

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll', 'pointerdown'];
    events.forEach(evt => window.addEventListener(evt, handleUserInteraction, { passive: true }));
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      events.forEach(evt => window.removeEventListener(evt, handleUserInteraction));
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(heartbeat);
      if (autoLockTimerRef.current) {
        clearTimeout(autoLockTimerRef.current);
      }
    };
  }, [isLocked, lock, updateActivity, autoLockTimeoutMs]);

  // Initial boot check
  useEffect(() => {
    const initCheck = async () => {
      try {
        const meta = await db.vaultMeta.get('auth');
        setSchemaDowngradeError(null);
        setIsInitialized(!!meta);
        const availability = await getBiometricAvailabilityInfo();
        setIsPrfSupported(availability.supported);
        setBiometricMode(availability.mode);
        setBiometricUnavailableReason(availability.reason);
        setIsPrfEnrolled(
          availability.enrolledOnNative || Boolean(meta?.prfCredentialId && meta?.prfWrappedDek)
        );
        setIsPinEnrolled(isPinUnlockEnrolled(meta));
        const persistent = await requestPersistentStorage();
        setPersistenceGranted(persistent || isNativeAppShell());
      } catch (err) {
        const downgrade = detectDexieSchemaDowngradeError(err);
        if (downgrade) {
          setSchemaDowngradeError(downgrade);
          // Mark as initialized so LockScreen never offers to overwrite a newer database
          setIsInitialized(true);
        }
        console.error('Failed to read vault metadata:', err);
      } finally {
        setReady(true);
      }
    };
    initCheck();
  }, []);

  const refreshKeyUsageStatus = useCallback(
    async (targetDek?: CryptoKey | null): Promise<EncryptionKeyUsageStatus | null> => {
      const effectiveDek = targetDek ?? dekRef.current;
      if (!effectiveDek) {
        setKeyUsageStatus(null);
        return null;
      }
      const usage = await getEncryptionKeyUsageStatus(db, effectiveDek);
      setKeyUsageStatus(usage);
      return usage;
    },
    []
  );

  // Setup Vault with Envelope Encryption (Non-extractable DEK + Vault KEK + Emergency Recovery Key)
  const setupPassword = useCallback(async (password: string): Promise<{ recoveryKeyFormatted: string }> => {
    if (password.length < 10) {
      throw new Error('يجب ألا تقل كلمة المرور عن 10 خانات.');
    }

    setKdfProgress(0);
    try {
      // 1. Derive Vault KEK from password with 600,000 iterations in Web Worker
      const salt = randomBytes(CONSTANTS.SALT_BYTES);
      const kek = await deriveKEKWithWorker(
        password,
        salt,
        CONSTANTS.DEFAULT_PBKDF2_ITERATIONS,
        (pct) => setKdfProgress(pct)
      );

      // 2. Generate random 256-bit DEK, wrap under KEK and Emergency Recovery Key, and import as NON-EXTRACTABLE
      const gen = 1;
      const {
        operationalDek,
        wrappedDek,
        wrappedDekIv,
        recoveryKeyFormatted,
        recoveryWrappedDek,
        recoveryWrappedDekIv,
        recoverySalt,
        recoveryKdfIterations,
        recoveryKeyGroupSalt,
        recoveryKeyGroupDigests,
      } = await generateAndWrapOperationalDEK(kek, gen);
      bindDekToGeneration(operationalDek, gen);

      // 3. Generate verifier token
      const { verifierIv, verifierCiphertext } = await generateVerifier(kek);

      const initialDrillIso = new Date().toISOString();

      // 4. Store in vaultMeta
      await db.vaultMeta.put({
        id: 'auth',
        salt,
        wrappedDek,
        wrappedDekIv,
        verifierIv,
        verifierCiphertext,
        schemaVersion: 1,
        kdfAlgorithm: 'PBKDF2-HMAC-SHA256',
        kdfIterations: CONSTANTS.DEFAULT_PBKDF2_ITERATIONS,
        dekVersion: CURRENT_DEK_VERSION,
        encryptionInvocationCount: 0,
        vaultGeneration: gen,
        recoveryWrappedDek,
        recoveryWrappedDekIv,
        recoverySalt,
        recoveryKdfIterations,
        recoveryKeyGroupSalt,
        recoveryKeyGroupDigests,
        lastRecoveryDrillAt: initialDrillIso,
      });
      setLastRecoveryDrillAt(initialDrillIso);
      setIsRecoveryDrillDue(false);

      await ClinicOperationsService.hydrateEncryptedCache(operationalDek, db, {
        lazyHeavyStores: true,
      });
      const persistent = await requestPersistentStorage();
      setPersistenceGranted(persistent);
      await refreshKeyUsageStatus(operationalDek);

      setDek(operationalDek);
      setVaultKek(kek);
      setVaultGeneration(gen);
      setIsInitialized(true);
      setIsPrfEnrolled(false);
      setIsPinEnrolled(false);
      // Initialize Signal-style spaced reminder for the brand-new password (first check in 1 day)
      const reminderState = recordPasswordChangedSchedule();
      setPasswordReminderState(reminderState);
      setIsPasswordReminderDueNow(false);
      void saveVaultPasswordToBrowserManager(password);
      // Keep isLocked true so LockScreen can display the Emergency Recovery Key
      updateActivity();

      return { recoveryKeyFormatted: recoveryKeyFormatted || '' };
    } finally {
      setKdfProgress(0);
    }
  }, [updateActivity, refreshKeyUsageStatus]);

  const completeSetup = useCallback(() => {
    setIsLocked(false);
    updateActivity();
  }, [updateActivity]);

  // Shared post-DEK unlock routine (repairs -> migration -> operations hydration -> auto key rotation >= 70%)
  const finalizeUnlockWithDek = useCallback(
    async (recoveredDek: CryptoKey, activeVaultKek: CryptoKey | null, initialGen: number): Promise<void> => {
      let effectiveDek = recoveredDek;
      let effectiveGen = initialGen;

      try {
        const repairResult = await SessionService.repairHalfFinalizedSessions(effectiveDek, db);
        setRepairError(null);
        if (repairResult.repairedCount > 0 || repairResult.skippedCount > 0) {
          setLastRepairSummary({
            repairedCount: repairResult.repairedCount,
            skippedCount: repairResult.skippedCount,
            repairedSessionIds: repairResult.repairedSessionIds,
            skippedSessionIds: repairResult.skippedSessionIds,
            repairedSessions: repairResult.repairedSessions,
          });
        } else {
          setLastRepairSummary(null);
        }

        const migrationResult = await LocalStorageMigrationService.runMigration(effectiveDek, db);
        setLastMigrationResult(migrationResult);
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : 'فشل فحص وإصلاح حالة قفل الملاحظات السريرية بعد فتح الخزينة.';
        setRepairError(msg);
      }

      // Auto-rotate DEK when >= 70% of safe GCM budget is reached (only if Vault KEK is active)
      try {
        const usage = await getEncryptionKeyUsageStatus(db, effectiveDek);
        if (usage.shouldAutoRotate && activeVaultKek) {
          const rotated = await rotateAllKeys(db, effectiveDek, activeVaultKek);
          effectiveDek = rotated.newOperationalDek;
          effectiveGen = rotated.newVaultGeneration;
          try {
            await disablePasskeyPrfUnlock(db);
            setIsPrfEnrolled(false);
          } catch (prfErr: unknown) {
            recordSafeNonFatalWarning('vault', 'disable_prf_after_rotation', prfErr);
          }
          try {
            await disablePinUnlock(db);
            setIsPinEnrolled(false);
          } catch (pinErr: unknown) {
            recordSafeNonFatalWarning('vault', 'disable_pin_after_rotation', pinErr);
          }
        }
      } catch (rotErr) {
        console.warn('Auto DEK rotation check failed (non-fatal):', rotErr);
      }

      await ClinicOperationsService.hydrateEncryptedCache(effectiveDek, db, {
        lazyHeavyStores: true,
      });
      await refreshKeyUsageStatus(effectiveDek);
      await refreshRecoveredDrafts(effectiveDek);
      await refreshRecoveryDrillStatus();
      refreshPasswordReminderStatus();

      const latestMeta = await db.vaultMeta.get('auth');
      setIsPrfEnrolled(await isBiometricUnlockEnrolled(latestMeta));
      setIsPinEnrolled(isPinUnlockEnrolled(latestMeta));

      // Refresh persistent storage grant status after user gesture
      try {
        const persistent = await requestPersistentStorage();
        setPersistenceGranted(persistent);
      } catch (persistErr: unknown) {
        recordSafeNonFatalWarning('vault', 'request_persistent_storage', persistErr);
      }

      setDek(effectiveDek);
      setVaultKek(activeVaultKek);
      setVaultGeneration(effectiveGen);
      setIsLocked(false);
      updateActivity();
    },
    [refreshKeyUsageStatus, refreshRecoveredDrafts, refreshRecoveryDrillStatus, refreshPasswordReminderStatus, updateActivity]
  );

  // Unlock Vault: Verify KEK -> Auto-Upgrade KDF if needed -> Unwrap DEK as NON-EXTRACTABLE
  // -> Run repair & migrations -> Hydrate encrypted cache -> Auto-rotate at >=70%
  const unlock = useCallback(async (password: string): Promise<boolean> => {
    const meta = await db.vaultMeta.get('auth');
    if (!meta) throw new Error('الخزينة غير مهيأة بعد');

    setKdfProgress(0);
    try {
      const candidateKek = await deriveKEKWithWorker(
        password,
        meta.salt,
        meta.kdfIterations || CONSTANTS.DEFAULT_PBKDF2_ITERATIONS,
        (pct) => setKdfProgress(pct)
      );

      const isValid = await checkVerifier(candidateKek, meta.verifierIv, meta.verifierCiphertext);
      if (!isValid) return false;

      // Phase 1B: KDF Auto-Upgrade
      let activeVaultKek = candidateKek;
      if (checkNeedsKdfUpgrade(meta)) {
        try {
          const upgradeResult = await autoUpgradeVaultKdf(db, meta, candidateKek, password);
          if (upgradeResult.upgraded) {
            activeVaultKek = upgradeResult.newVaultKek;
          }
        } catch (upgradeErr) {
          console.warn('Auto KDF upgrade non-fatal error:', upgradeErr);
        }
      }

      // Unwrap DEK as non-extractable CryptoKey and bind to active vaultGeneration
      const gen = meta.vaultGeneration ?? 1;
      const recoveredDek = await unwrapOperationalDEK(meta.wrappedDek, meta.wrappedDekIv, activeVaultKek, gen);
      bindDekToGeneration(recoveredDek, gen);

      await finalizeUnlockWithDek(recoveredDek, activeVaultKek, gen);
      // If a spaced password reminder was due, manually typing the password satisfies it
      const currentReminder = loadPasswordReminderState();
      if (isPasswordReminderDue(currentReminder)) {
        const advanced = recordPasswordMemoryVerified();
        setPasswordReminderState(advanced);
        setIsPasswordReminderDueNow(false);
      }
      void saveVaultPasswordToBrowserManager(password);
      return true;
    } finally {
      setKdfProgress(0);
    }
  }, [finalizeUnlockWithDek]);

  // Verify the master vault password while already unlocked (used by Full CSV/JSON Export 5.1 & Kiosk exit 5.10)
  const verifyVaultPassword = useCallback(async (password: string): Promise<boolean> => {
    const trimmed = password;
    if (!trimmed) return false;
    const meta = await db.vaultMeta.get('auth');
    if (!meta) return false;
    try {
      const candidateKek = await deriveKEKWithWorker(
        trimmed,
        meta.salt,
        meta.kdfIterations || CONSTANTS.DEFAULT_PBKDF2_ITERATIONS
      );
      return await checkVerifier(candidateKek, meta.verifierIv, meta.verifierCiphertext);
    } catch (verifyErr: unknown) {
      recordSafeNonFatalWarning('vault', 'verify_vault_password', verifyErr);
      return false;
    }
  }, []);

  const confirmPasswordMemoryCheck = useCallback(
    async (password: string): Promise<{ ok: boolean; nextIntervalDays?: number }> => {
      const valid = await verifyVaultPassword(password);
      if (!valid) {
        return { ok: false };
      }
      const nextState = recordPasswordMemoryVerified();
      setPasswordReminderState(nextState);
      setIsPasswordReminderDueNow(false);
      void saveVaultPasswordToBrowserManager(password);
      return {
        ok: true,
        nextIntervalDays: getReminderIntervalDays(nextState.stageIndex),
      };
    },
    [verifyVaultPassword]
  );

  const unlockWithPrf = useCallback(async (): Promise<boolean> => {
    const meta = await db.vaultMeta.get('auth');
    if (!meta) throw new Error('الخزينة غير مهيأة بعد');
    const recoveredDek = await unlockOperationalDekWithPrf(meta);
    const gen = meta.vaultGeneration ?? 1;
    await finalizeUnlockWithDek(recoveredDek, null, gen);
    return true;
  }, [finalizeUnlockWithDek]);

  const enrollPrf = useCallback(async (): Promise<void> => {
    if (!dekRef.current || !vaultKek) {
      throw new Error('يرجى فتح الخزينة بكلمة المرور الرئيسية أولاً لتفعيل الفتح بالبصمة/مفتاح المرور.');
    }
    await enrollPasskeyPrfUnlock(db, vaultKek);
    setIsPrfEnrolled(true);
  }, [vaultKek]);

  const disablePrf = useCallback(async (): Promise<void> => {
    await disablePasskeyPrfUnlock(db);
    setIsPrfEnrolled(false);
  }, []);

  const unlockWithPin = useCallback(
    async (pin: string): Promise<PinUnlockOutcome> => {
      const meta = await db.vaultMeta.get('auth');
      if (!meta) throw new Error('الخزينة غير مهيأة بعد');
      setKdfProgress(0);
      try {
        const outcome = await unlockOperationalDekWithPin(
          db,
          pin,
          deriveKEKWithWorker,
          (pct) => setKdfProgress(pct)
        );
        if (outcome.disabledByFailures) {
          setIsPinEnrolled(false);
        }
        if (outcome.ok && outcome.operationalDek) {
          const gen = outcome.vaultGeneration ?? (meta.vaultGeneration ?? 1);
          await finalizeUnlockWithDek(outcome.operationalDek, null, gen);
        }
        return outcome;
      } finally {
        setKdfProgress(0);
      }
    },
    [finalizeUnlockWithDek]
  );

  const enrollPin = useCallback(
    async (pin: string, masterPasswordForVerification?: string): Promise<void> => {
      if (!dekRef.current) {
        throw new Error('الخزينة مقفلة.');
      }
      let effectiveKek = vaultKek;
      if (!effectiveKek) {
        const pw = masterPasswordForVerification ?? '';
        if (!pw) {
          throw new Error('يرجى إدخال كلمة المرور الرئيسية للتحقق وتفعيل رمز PIN.');
        }
        const meta = await db.vaultMeta.get('auth');
        if (!meta) throw new Error('الخزينة غير مهيأة.');
        setKdfProgress(0);
        try {
          const candidateKek = await deriveKEKWithWorker(
            pw,
            meta.salt,
            meta.kdfIterations || CONSTANTS.DEFAULT_PBKDF2_ITERATIONS,
            (pct) => setKdfProgress(pct)
          );
          const valid = await checkVerifier(candidateKek, meta.verifierIv, meta.verifierCiphertext);
          if (!valid) {
            throw new Error('كلمة المرور الرئيسية غير صحيحة.');
          }
          effectiveKek = candidateKek;
          setVaultKek(candidateKek);
        } finally {
          setKdfProgress(0);
        }
      }

      setKdfProgress(0);
      try {
        await enrollVaultPinUnlock(
          db,
          effectiveKek,
          pin,
          deriveKEKWithWorker,
          (pct) => setKdfProgress(pct)
        );
        setIsPinEnrolled(true);
      } finally {
        setKdfProgress(0);
      }
    },
    [vaultKek]
  );

  const disablePin = useCallback(async (): Promise<void> => {
    await disablePinUnlock(db);
    setIsPinEnrolled(false);
  }, []);

  const rotateDekNow = useCallback(async (): Promise<KeyRotationSummary> => {
    if (!dekRef.current) {
      throw new Error('الخزينة مقفلة.');
    }
    if (!vaultKek) {
      throw new Error('يرجى فتح الخزينة بكلمة المرور الرئيسية قبل تدوير مفتاح التشفير.');
    }
    const summary = await rotateAllKeys(db, dekRef.current, vaultKek);
    try {
      await disablePasskeyPrfUnlock(db);
    } catch (prfErr: unknown) {
      recordSafeNonFatalWarning('vault', 'disable_prf_after_manual_rotation', prfErr);
    }
    try {
      await disablePinUnlock(db);
    } catch (pinErr: unknown) {
      recordSafeNonFatalWarning('vault', 'disable_pin_after_manual_rotation', pinErr);
    }
    setIsPrfEnrolled(false);
    setIsPinEnrolled(false);
    await ClinicOperationsService.hydrateEncryptedCache(summary.newOperationalDek, db, {
      lazyHeavyStores: true,
    });
    await refreshKeyUsageStatus(summary.newOperationalDek);
    setDek(summary.newOperationalDek);
    setVaultGeneration(summary.newVaultGeneration);
    updateActivity();
    return summary;
  }, [vaultKek, refreshKeyUsageStatus, updateActivity]);

  // Emergency Password Reset using Recovery Key (Phase 1B)
  const resetPasswordWithRecovery = useCallback(
    async (recoveryKey: string, newPassword: string): Promise<{ newRecoveryKeyFormatted: string }> => {
      const result = await resetVaultPasswordWithRecoveryKey(db, recoveryKey, newPassword);
      await ClinicOperationsService.hydrateEncryptedCache(result.operationalDek, db, {
        lazyHeavyStores: true,
      });
      await refreshKeyUsageStatus(result.operationalDek);
      setDek(result.operationalDek);
      setVaultKek(result.newVaultKek);
      const meta = await db.vaultMeta.get('auth');
      const gen = meta?.vaultGeneration ?? 1;
      setVaultGeneration(gen);
      setIsPrfEnrolled(await isBiometricUnlockEnrolled(meta));
      setIsPinEnrolled(isPinUnlockEnrolled(meta));
      const reminderState = recordPasswordChangedSchedule();
      setPasswordReminderState(reminderState);
      setIsPasswordReminderDueNow(false);
      void saveVaultPasswordToBrowserManager(newPassword);
      // Keep isLocked true so LockScreen can display the rotated Recovery Key
      updateActivity();
      return { newRecoveryKeyFormatted: result.newRecoveryKeyFormatted };
    },
    [refreshKeyUsageStatus, updateActivity]
  );

  // Instant Password Reset using Enrolled Biometrics / Passkey (WebAuthn PRF)
  const resetPasswordWithPrf = useCallback(
    async (newPassword: string): Promise<void> => {
      setKdfProgress(0);
      try {
        const result = await resetVaultPasswordWithPrf(
          db,
          newPassword,
          deriveKEKWithWorker,
          (pct) => setKdfProgress(pct)
        );
        const reminderState = recordPasswordChangedSchedule();
        setPasswordReminderState(reminderState);
        setIsPasswordReminderDueNow(false);
        void saveVaultPasswordToBrowserManager(newPassword);

        if (dekRef.current && !isLocked) {
          // Already unlocked: refresh in-memory DEK & KEK cleanly without re-running full startup repair
          setDek(result.operationalDek);
          setVaultKek(result.newVaultKek);
          setVaultGeneration(result.vaultGeneration);
          updateActivity();
        } else {
          await finalizeUnlockWithDek(
            result.operationalDek,
            result.newVaultKek,
            result.vaultGeneration
          );
        }
      } finally {
        setKdfProgress(0);
      }
    },
    [finalizeUnlockWithDek, isLocked, updateActivity]
  );

  // Change Vault Password in O(1) without re-encrypting records
  const changeVaultPassword = useCallback(async (oldPass: string, newPass: string) => {
    const meta = await db.vaultMeta.get('auth');
    if (!meta) throw new Error('الخزينة غير مهيأة');
    if (!dek) throw new Error('الخزينة مقفلة');

    setKdfProgress(0);
    try {
      // Verify old password in worker
      const oldKek = await deriveKEKWithWorker(oldPass, meta.salt, meta.kdfIterations);
      const isValid = await checkVerifier(oldKek, meta.verifierIv, meta.verifierCiphertext);
      if (!isValid) {
        throw new Error('كلمة المرور الحالية غير صحيحة.');
      }

      // Derive new KEK with fresh salt in worker
      const newSalt = randomBytes(CONSTANTS.SALT_BYTES);
      const newKek = await deriveKEKWithWorker(
        newPass,
        newSalt,
        CONSTANTS.DEFAULT_PBKDF2_ITERATIONS,
        (pct) => setKdfProgress(pct)
      );

      // Temporarily recover raw DEK bytes via oldKek and re-wrap under newKek
      const rawDekBytes = await decryptRawDEKForBackup(meta.wrappedDek, meta.wrappedDekIv, oldKek);
      const { wrappedDek, wrappedDekIv } = await wrapDEK(rawDekBytes, newKek);
      rawDekBytes.fill(0); // Immediately zero transient raw buffer

      const { verifierIv, verifierCiphertext } = await generateVerifier(newKek);

      const currentGen = meta.vaultGeneration ?? 1;

      // Update vaultMeta (preserving optional WebAuthn PRF wrapping & usage counters)
      await db.vaultMeta.put({
        ...meta,
        id: 'auth',
        salt: newSalt,
        wrappedDek,
        wrappedDekIv,
        verifierIv,
        verifierCiphertext,
        schemaVersion: meta.schemaVersion,
        kdfAlgorithm: 'PBKDF2-HMAC-SHA256',
        kdfIterations: CONSTANTS.DEFAULT_PBKDF2_ITERATIONS,
        dekVersion: meta.dekVersion || CURRENT_DEK_VERSION,
        encryptionInvocationCount: meta.encryptionInvocationCount || 0,
        vaultGeneration: currentGen,
        recoveryWrappedDek: meta.recoveryWrappedDek,
        recoveryWrappedDekIv: meta.recoveryWrappedDekIv,
        recoverySalt: meta.recoverySalt,
        recoveryKdfIterations: meta.recoveryKdfIterations,
      });

      bindDekToGeneration(dek, currentGen);
      setVaultKek(newKek);
      setVaultGeneration(currentGen);
      const reminderState = recordPasswordChangedSchedule();
      setPasswordReminderState(reminderState);
      setIsPasswordReminderDueNow(false);
      void saveVaultPasswordToBrowserManager(newPass);
      updateActivity();

      // Broadcast password change to other open tabs
      broadcastVaultEvent({
        type: 'VAULT_PASSWORD_CHANGED',
        generation: currentGen,
      });
    } finally {
      setKdfProgress(0);
    }
  }, [dek, updateActivity]);

  // Cross-Tab Vault Synchronization:
  // - Full Restore or rotated credentials immediately lock and wipe memory
  // - Operational data updates refresh this tab's decrypted cache from IndexedDB
  useEffect(() => {
    const unsubscribe = subscribeToVaultEvents((event) => {
      if (event.type === 'VAULT_GENERATION_CHANGED' || event.type === 'VAULT_PASSWORD_CHANGED') {
        console.warn(`PhysioRecord: Cross-tab ${event.type} event received. Locking vault.`);
        lock();
      } else if (event.type === 'OPERATIONS_UPDATED' && dekRef.current) {
        void ClinicOperationsService.hydrateEncryptedCache(dekRef.current, db, {
          lazyHeavyStores: true,
        });
      }
    });
    return unsubscribe;
  }, [lock]);

  // Wipe database completely and purge all local clinical data
  const wipeDatabase = useCallback(async () => {
    lock(true);
    await clearNativeAndroidBiometricDek();
    await db.delete();
    await db.open();

    // Clear ANY remaining physiorecord_* keys from localStorage
    if (typeof localStorage !== 'undefined') {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('physiorecord_')) {
          keysToRemove.push(k);
        }
      }
      for (const k of keysToRemove) {
        localStorage.removeItem(k);
      }
    }

    setIsInitialized(false);
    setIsPrfEnrolled(false);
    setIsPinEnrolled(false);
    setKeyUsageStatus(null);
    setLastMigrationResult(null);
    const freshReminder = loadPasswordReminderState();
    setPasswordReminderState(freshReminder);
    setIsPasswordReminderDueNow(false);
    setIsLocked(true);
  }, [lock]);

  return (
    <VaultContext.Provider
      value={{
        ready,
        isInitialized,
        isLocked,
        dek,
        vaultKek,
        vaultGeneration,
        persistenceGranted,
        kdfProgress,
        isPrfSupported,
        isPrfEnrolled,
        isPinEnrolled,
        biometricMode,
        biometricUnavailableReason,
        keyUsageStatus,
        schemaDowngradeError,
        lastRepairSummary,
        repairError,
        lastMigrationResult,
        dismissMigrationResult,
        autoLockTimeoutMs,
        setAutoLockTimeoutMs,
        secondsUntilAutoLock,
        stayUnlocked,
        recoveredDrafts,
        dismissRecoveredDraft,
        clearAllRecoveredDrafts,
        refreshRecoveredDrafts,
        isRecoveryDrillDue,
        lastRecoveryDrillAt,
        refreshRecoveryDrillStatus,
        snoozeRecoveryDrillBanner,
        passwordReminderState,
        isPasswordReminderDueNow,
        setPasswordReminderEnabled,
        confirmPasswordMemoryCheck,
        snoozePasswordReminder,
        dismissRepairNotice,
        setupPassword,
        completeSetup,
        unlock,
        verifyVaultPassword,
        unlockWithPrf,
        enrollPrf,
        disablePrf,
        unlockWithPin,
        enrollPin,
        disablePin,
        refreshKeyUsageStatus,
        rotateDekNow,
        resetPasswordWithRecovery,
        resetPasswordWithPrf,
        changeVaultPassword,
        lock: () => lock(false),
        wipeDatabase,
      }}
    >
      {children}
    </VaultContext.Provider>
  );
};

export const useVault = () => {
  const context = useContext(VaultContext);
  if (!context) throw new Error('useVault must be used within a VaultProvider');
  return context;
};
