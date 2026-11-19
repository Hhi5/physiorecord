// =======================================================================
// PhysioRecord — Phase 1A-ii-b: Destructive localStorage -> Encrypted Dexie Migration Engine
// - Uses `navigator.locks` (with in-process mutex fallback) for cross-tab mutual exclusion.
// - Tracks resumable per-key progress in `db.migrationState` (`id: 'localStorage_v5_migration'`).
// - Computes all WebCrypto operations BEFORE opening Dexie transactions.
// - Writes encrypted records to Dexie, then verifies every record by decrypt + canonical deep-equal.
// - Supports `dryRun: true` mode that only reports what would be migrated without writing or deleting.
// - Phase 1A-ii-b rule: Deletes plaintext localStorage keys strictly AFTER successful Dexie commit and decrypt verification.
// - If verification fails, the key is NOT deleted, the error is recorded, and execution yields to the main thread.
// =======================================================================

import { db as defaultDb, type PhysioRecordDatabase } from '../db/db';
import {
  encryptRecordWithMandatoryReservation,
  decryptRecordPayload,
  getDekGeneration,
  CURRENT_DEK_VERSION,
  CURRENT_RECORD_CRYPTO_VERSION,
} from '../crypto/vault';
import {
  UnboundVaultKeyError,
  CURRENT_SOAP_SCHEMA_VERSION,
  type EncryptedAppointmentEntity,
  type EncryptedWaitingListEntity,
  type EncryptedInvoiceEntity,
  type EncryptedPaymentEntity,
  type EncryptedExpenseEntity,
  type EncryptedAuditLogEntity,
  type EncryptedStaffStateEntity,
  type EncryptedEpisodeClinicalEntity,
  type EncryptedCustomWidgetEntity,
  type EncryptedSoapEntity,
  type EncryptedMigrationReportEntity,
  type EncryptedRecurringScheduleEntity,
  type EncryptedRecurringSkippedDateEntity,
  type EncryptedClinicSettingsEntity,
  type EncryptedPatientMedicationEntity,
  type MigrationReportPayload,
  type MigrationPainConflictRecord,
  type MigrationOrphanFlowsheetRecord,
  type MigrationCorruptKeyRecord,
  type SoapNoteData,
  type SoapFlowsheetData,
  type PatientClinicalData,
} from '../types/clinical';
import type {
  AdminPinAuthRecord,
  BackupStateMetadata,
  ClinicAppointment,
  ClinicStaffMember,
  WaitingListEntry,
  FinancialInvoiceIQD,
  PaymentTransactionIQD,
  ClinicExpenseIQD,
  AuditLogEntry,
  EpisodeScopedClinicalStore,
  ModuleFlagsSettings,
  MrnRegistryData,
  PatientMedicationPlan,
  RecurringPatientSchedule,
  SessionFlowsheetData,
} from '../types/clinicManagement';
import { canonicalizeForSeal } from './sessionService';
import { assertAppendOnlySnapshots } from './clinicOperationsService';
import {
  ADMIN_PIN_PBKDF2_ITERATIONS,
  hashAdminPinPBKDF2,
} from './clinicSecurityHelpers';
import { recordSafeNonFatalWarning } from '../utils/safeDevDiagnostics';

export const LOCALSTORAGE_MIGRATION_STATE_ID = 'localStorage_v5_migration';
export const LOCALSTORAGE_MIGRATION_LOCK_NAME = 'physiorecord_v5_localstorage_migration';

/**
 * Only non-PHI UI preferences are permitted to remain in `localStorage`.
 */
export const ALLOWED_NON_PHI_LOCALSTORAGE_KEYS = new Set<string>([
  'physiorecord_language',
  'physiorecord_theme_mode',
  'physiorecord_theme_palette',
  'physiorecord_clinical_theme',
  'physiorecord_primary_currency_code',
  'physiorecord_autolock_timeout_ms',
  'physiorecord_font_scale',
  'physiorecord_reduce_motion',
  'physiorecord_display_prefs_v1',
  'physiorecord_recovery_drill_snooze_until',
  'physiorecord_pre_restore_safety_backup',
  'physiorecord_rail_expanded_v1',
]);

const NON_CLINICAL_SKIPPED_KEYS = ALLOWED_NON_PHI_LOCALSTORAGE_KEYS;

const KNOWN_KEY_NAMES = {
  ACTIVE_STAFF_ID: 'physiorecord_active_staff_v2',
  STAFF_ROSTER: 'physiorecord_staff_roster_v2',
  ADMIN_PIN: 'physiorecord_admin_pin_v1',
  RECEPTION_PRIVACY_BLUR: 'physiorecord_reception_privacy_blur_v1',
  SHOW_EXERCISE_LIBRARY: 'physiorecord_show_exercise_library_v1',
  PURGED_HARDCODED_MOCKS: 'physiorecord_purged_hardcoded_mocks_v1',
  PRELINE_LEGACY_THEME: 'physiorecord_preline_theme',
  AUDIT_LOGS: 'physiorecord_audit_logs_v2',
  APPOINTMENTS: 'physiorecord_appointments_v2',
  RECURRING_SCHEDULES: 'physiorecord_recurring_schedules_v1',
  RECURRING_SKIPPED_DATES: 'physiorecord_recurring_skipped_v1',
  WAITING_LIST: 'physiorecord_waiting_list_v2',
  INVOICES_IQD: 'physiorecord_invoices_iqd_v2',
  EXPENSES_IQD: 'physiorecord_expenses_iqd_v2',
  CUSTOM_WIDGETS: 'physiorecord_custom_widgets',
  MRN_SEQ: 'physiorecord_mrn_seq_v1',
  MRN_MAP: 'physiorecord_mrn_map_v1',
  LAST_BACKUP_AT: 'physiorecord_last_backup_at',
  EPISODE_STORE_PREFIX: 'physiorecord_episode_clinical_v2_',
  SESSION_FLOWSHEET_PREFIX: 'physiorecord_session_flowsheet_v2_',
  SESSION_FLOWSHEET_LATEST_PREFIX: 'physiorecord_session_flowsheet_v2_latest_ep_',
  SESSION_SOAP_LEGACY_PREFIX: 'physiorecord_session_soap_v2_',
  PATIENT_WIDGETS_LEGACY_PREFIX: 'physiorecord_patient_widgets_',
  ORGANUI_MEDS_PREFIX: 'physiorecord_organui_meds_',
};

export interface UnmigratedResolutionItem {
  key: string;
  category: 'corrupt' | 'orphan_flowsheet' | 'residual_key';
  errorReason: string;
  rawValue: string;
  rawPreview: string;
}

export interface StorageLike {
  length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem?(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface LocalStorageMigrationOptions {
  dryRun?: boolean;
  /**
   * Whether to delete plaintext keys from storage after Dexie verification (Phase 1A-ii-b destructive mode).
   * Defaults to true in Phase 1A-ii-b. Can be set to false for Phase 1A-ii-a non-destructive tests.
   */
  destructive?: boolean;
  storage?: StorageLike;
  /**
   * Optional test hook to simulate an interrupted migration after `interruptAfterKeys` keys have been committed.
   */
  interruptAfterKeys?: number;
  /**
   * Optional callback invoked before each key is committed in live mode.
   */
  onBeforeKeyCommit?: (key: string, committedSoFar: number) => Promise<void> | void;
}

export interface LocalStorageMigrationResult {
  status: 'completed' | 'partial_with_errors' | 'interrupted' | 'dry_run';
  alreadyCompleted?: boolean;
  report: MigrationReportPayload;
}

// In-process FIFO mutex used alongside navigator.locks so concurrent calls in Node/Vitest or same tab serialize cleanly
let inProcessLockPromise: Promise<unknown> = Promise.resolve();

async function withMigrationLock<T>(fn: () => Promise<T>): Promise<T> {
  const runInProcess = async (): Promise<T> => {
    const prev = inProcessLockPromise;
    let release!: () => void;
    inProcessLockPromise = new Promise<void>((resolve) => {
      release = resolve;
    });
    await prev.catch(() => undefined);
    try {
      return await fn();
    } finally {
      release();
    }
  };

  if (
    typeof navigator !== 'undefined' &&
    navigator.locks &&
    typeof navigator.locks.request === 'function'
  ) {
    return await navigator.locks.request(
      LOCALSTORAGE_MIGRATION_LOCK_NAME,
      { mode: 'exclusive' },
      async () => await runInProcess()
    );
  }

  return await runInProcess();
}

async function yieldToMainThread(): Promise<void> {
  if (typeof globalThis !== 'undefined' && typeof (globalThis as unknown as { requestIdleCallback?: unknown }).requestIdleCallback === 'function') {
    return new Promise((resolve) => {
      (globalThis as unknown as { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void }).requestIdleCallback(
        () => resolve(),
        { timeout: 50 }
      );
    });
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function computeSha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function resolveDefaultStorage(explicitStorage?: StorageLike): StorageLike | null {
  if (explicitStorage) return explicitStorage;
  if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
    const ls = globalThis.localStorage as Partial<StorageLike> & Record<string, unknown>;
    if (typeof ls.getItem === 'function') {
      if (typeof ls.length === 'number' && typeof ls.key === 'function') {
        return ls as StorageLike;
      }
      // Fallback wrapper for simplified mock localStorage objects in unit tests
      const ownKeys = Object.keys(ls).filter(
        (k) => !['getItem', 'setItem', 'removeItem', 'clear', 'key', 'length'].includes(k)
      );
      return {
        get length() {
          return ownKeys.length;
        },
        key(index: number) {
          return ownKeys[index] ?? null;
        },
        getItem(k: string) {
          return ls.getItem!(k);
        },
      };
    }
  }
  return null;
}

function collectPhysioRecordKeys(storage: StorageLike): Array<{ key: string; rawValue: string }> {
  const keys = new Set<string>();
  if (typeof storage.length === 'number' && typeof storage.key === 'function') {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.startsWith('physiorecord_')) {
        keys.add(k);
      }
    }
  }
  // Also probe well-known static keys in case a test double only implements `getItem`
  for (const staticKey of [
    KNOWN_KEY_NAMES.ACTIVE_STAFF_ID,
    KNOWN_KEY_NAMES.STAFF_ROSTER,
    KNOWN_KEY_NAMES.ADMIN_PIN,
    KNOWN_KEY_NAMES.RECEPTION_PRIVACY_BLUR,
    KNOWN_KEY_NAMES.SHOW_EXERCISE_LIBRARY,
    KNOWN_KEY_NAMES.PURGED_HARDCODED_MOCKS,
    KNOWN_KEY_NAMES.PRELINE_LEGACY_THEME,
    KNOWN_KEY_NAMES.AUDIT_LOGS,
    KNOWN_KEY_NAMES.APPOINTMENTS,
    KNOWN_KEY_NAMES.RECURRING_SCHEDULES,
    KNOWN_KEY_NAMES.RECURRING_SKIPPED_DATES,
    KNOWN_KEY_NAMES.WAITING_LIST,
    KNOWN_KEY_NAMES.INVOICES_IQD,
    KNOWN_KEY_NAMES.EXPENSES_IQD,
    KNOWN_KEY_NAMES.CUSTOM_WIDGETS,
    KNOWN_KEY_NAMES.MRN_SEQ,
    KNOWN_KEY_NAMES.MRN_MAP,
    KNOWN_KEY_NAMES.LAST_BACKUP_AT,
    ...NON_CLINICAL_SKIPPED_KEYS,
  ]) {
    const val = storage.getItem(staticKey);
    if (val !== null && val !== undefined) {
      keys.add(staticKey);
    }
  }

  const sortedKeys = Array.from(keys).sort();
  const entries: Array<{ key: string; rawValue: string }> = [];
  for (const k of sortedKeys) {
    const rawValue = storage.getItem(k);
    if (typeof rawValue === 'string') {
      entries.push({ key: k, rawValue });
    }
  }
  return entries;
}

/**
 * Scrubs embedded patient names from legacy audit log summaries while preserving
 * the clinical/financial event description and linking `patientId` / `episodeId`.
 */
export function sanitizeAuditLogEntryForMigration(
  entry: AuditLogEntry,
  knownPatientNames: string[],
  entityLookup: {
    invoiceToPatientEpisode: Map<string, { patientId: string; episodeId?: string }>;
    appointmentToPatientEpisode: Map<string, { patientId: string; episodeId?: string }>;
    sessionToPatientEpisode: Map<string, { patientId: string; episodeId: string }>;
    episodeToPatient: Map<string, string>;
  }
): AuditLogEntry {
  let patientId = entry.patientId;
  let episodeId = entry.episodeId;

  if (entry.entityType === 'patient' && entry.entityId) {
    patientId = patientId || entry.entityId;
  } else if (entry.entityType === 'episode' && entry.entityId) {
    episodeId = episodeId || entry.entityId;
    patientId = patientId || entityLookup.episodeToPatient.get(entry.entityId);
  } else if (entry.entityType === 'session' && entry.entityId) {
    const sessRef = entityLookup.sessionToPatientEpisode.get(entry.entityId);
    if (sessRef) {
      patientId = patientId || sessRef.patientId;
      episodeId = episodeId || sessRef.episodeId;
    }
  } else if (entry.entityType === 'invoice' && entry.entityId) {
    const invRef = entityLookup.invoiceToPatientEpisode.get(entry.entityId);
    if (invRef) {
      patientId = patientId || invRef.patientId;
      episodeId = episodeId || invRef.episodeId;
    }
  } else if (entry.entityType === 'appointment' && entry.entityId) {
    const apptRef = entityLookup.appointmentToPatientEpisode.get(entry.entityId);
    if (apptRef) {
      patientId = patientId || apptRef.patientId;
      episodeId = episodeId || apptRef.episodeId;
    }
  }

  let summaryAr = entry.summaryAr || '';
  let summaryEn = entry.summaryEn || '';

  // Scrub known patient names
  for (const name of knownPatientNames) {
    const trimmed = name.trim();
    if (trimmed.length >= 2) {
      summaryAr = summaryAr.split(trimmed).join('[مريض مرجعي]');
      summaryEn = summaryEn.split(trimmed).join('[Referenced Patient]');
    }
  }

  // Scrub common legacy phrasing patterns that embedded patient names
  summaryAr = summaryAr
    .replace(/للمريض\s+[^(\n]+?(?=\s+بصافي|\s*\(|$)/g, 'للمريض [مريض مرجعي]')
    .replace(/من المريض\s+[^(\n]+?(?=\s*\(|$)/g, 'من المريض [مريض مرجعي]')
    .replace(/ملف المريض:\s*.+$/g, `ملف المريض (#${(patientId || entry.entityId || '').slice(0, 8)})`);

  summaryEn = summaryEn
    .replace(/\bfor\s+[^(\n]+?(?=\s*\(|$)/gi, 'for [Referenced Patient]')
    .replace(/\bfrom\s+[^(\n]+?(?=\s*\(|$)/gi, 'from [Referenced Patient]')
    .replace(/patient record:\s*.+$/gi, `patient record (#${(patientId || entry.entityId || '').slice(0, 8)})`);

  return {
    ...entry,
    ...(patientId ? { patientId } : {}),
    ...(episodeId ? { episodeId } : {}),
    summaryAr,
    summaryEn,
  };
}

interface StagedVerificationRecord {
  tableName: string;
  id: string;
  parentIds: string[];
  entity: Record<string, unknown>;
  expectedPlaintext: unknown;
}

async function verifyWrittenRecordInDexie(
  database: PhysioRecordDatabase,
  dek: CryptoKey,
  item: StagedVerificationRecord
): Promise<void> {
  const table = database.table<Record<string, unknown>, string>(item.tableName);
  const stored = await table.get(item.id);
  if (!stored) {
    throw new Error(
      `فشل التحقق بعد الترحيل: السجل "${item.id}" غير موجود في جدول "${item.tableName}".`
    );
  }
  const decrypted = await decryptRecordPayload(
    dek,
    item.tableName,
    item.id,
    item.parentIds,
    stored.iv as Uint8Array,
    stored.ciphertext as Uint8Array,
    Number(stored.recordCryptoVersion) || CURRENT_RECORD_CRYPTO_VERSION,
    Number(stored.dekVersion) || CURRENT_DEK_VERSION,
    stored.recordSalt as Uint8Array | undefined
  );
  if (canonicalizeForSeal(decrypted) !== canonicalizeForSeal(item.expectedPlaintext)) {
    throw new Error(
      `فشل التحقق التشفيري العميق (decrypt + deep-equal) للسجل "${item.id}" في جدول "${item.tableName}".`
    );
  }
}

export class LocalStorageMigrationService {
  /**
   * Run Phase 1A-ii-a non-destructive migration from `localStorage` into encrypted Dexie tables.
   * - Acquires `navigator.locks` (`physiorecord_v5_localstorage_migration`) + in-process mutex.
   * - Tracks per-key completion hashes in `db.migrationState` (`localStorage_v5_migration`).
   * - Encrypts BEFORE opening Dexie transactions, commits, and verifies by decrypt + deep-equal.
   * - Never deletes any `localStorage` key in Phase 1A-ii-a.
   */
  static async runMigration(
    dek: CryptoKey,
    database: PhysioRecordDatabase = defaultDb,
    options: LocalStorageMigrationOptions = {}
  ): Promise<LocalStorageMigrationResult> {
    return await withMigrationLock(async () => {
      const expectedGen = getDekGeneration(dek);
      if (expectedGen === undefined) {
        throw new UnboundVaultKeyError(
          'تم رفض ترحيل البيانات: مفتاح التشفير التشغيلي (DEK) غير مرتبط بأي جيل خزينة معتمد.'
        );
      }

      const dryRun = Boolean(options.dryRun);
      const destructive = options.destructive !== false;
      const now = new Date().toISOString();
      const reportId = `migration_report_v5_gen_${expectedGen}`;

      const countsByTable: Record<string, number> = {
        staffState: 0,
        appointments: 0,
        waitingList: 0,
        invoices: 0,
        payments: 0,
        expenses: 0,
        auditLogs: 0,
        customWidgets: 0,
        episodeClinical: 0,
        soapNotes: 0,
        recurringSchedules: 0,
        recurringSkippedDates: 0,
        clinicSettings: 0,
        patientMedications: 0,
      };
      const migratedKeys: string[] = [];
      const skippedAlreadyCompletedKeys: string[] = [];
      const skippedNonClinicalKeys: string[] = [];
      const painConflicts: MigrationPainConflictRecord[] = [];
      const orphanFlowsheets: MigrationOrphanFlowsheetRecord[] = [];
      const corruptKeys: MigrationCorruptKeyRecord[] = [];

      const storage = resolveDefaultStorage(options.storage);
      if (!storage) {
        const emptyReport: MigrationReportPayload = {
          id: reportId,
          createdAt: now,
          vaultGeneration: expectedGen,
          dryRun,
          migratedKeys,
          skippedAlreadyCompletedKeys,
          skippedNonClinicalKeys,
          countsByTable,
          painConflicts,
          orphanFlowsheets,
          corruptKeys,
        };
        return {
          status: dryRun ? 'dry_run' : 'completed',
          report: emptyReport,
        };
      }

      const allEntries = collectPhysioRecordKeys(storage);

      const existingState = await database.migrationState.get(LOCALSTORAGE_MIGRATION_STATE_ID);
      const completedKeyHashSet = new Set<string>(
        existingState && existingState.vaultGeneration === expectedGen
          ? existingState.completedKeyHashes || []
          : []
      );

      // Build reference lookup maps for audit log patient-name scrubbing and patientId/episodeId resolution
      const knownPatientNames: string[] = [];
      const invoiceToPatientEpisode = new Map<string, { patientId: string; episodeId?: string }>();
      const appointmentToPatientEpisode = new Map<string, { patientId: string; episodeId?: string }>();
      const sessionToPatientEpisode = new Map<string, { patientId: string; episodeId: string }>();
      const episodeToPatient = new Map<string, string>();

      const allPatientsInDb = await database.patients.toArray();
      for (const pEntity of allPatientsInDb) {
        try {
          const pData = await decryptRecordPayload<PatientClinicalData>(
            dek,
            'patients',
            pEntity.id,
            [],
            pEntity.iv,
            pEntity.ciphertext,
            pEntity.recordCryptoVersion || CURRENT_RECORD_CRYPTO_VERSION,
            pEntity.dekVersion || CURRENT_DEK_VERSION,
            pEntity.recordSalt
          );
          if (pData.fullName) knownPatientNames.push(pData.fullName);
        } catch (err: unknown) {
          recordSafeNonFatalWarning('migration', 'decrypt_patient_for_scrub', err);
        }
      }

      const allEpisodesInDb = await database.episodes.toArray();
      for (const epEntity of allEpisodesInDb) {
        episodeToPatient.set(epEntity.id, epEntity.patientId);
      }

      const allSessionsInDb = await database.sessions.toArray();
      for (const sEntity of allSessionsInDb) {
        sessionToPatientEpisode.set(sEntity.id, {
          patientId: sEntity.patientId,
          episodeId: sEntity.episodeId,
        });
      }

      // Pre-scan invoices & appointments in localStorage to enrich knownPatientNames and entity lookup
      for (const entry of allEntries) {
        if (entry.key === KNOWN_KEY_NAMES.INVOICES_IQD) {
          try {
            const parsed = JSON.parse(entry.rawValue);
            if (Array.isArray(parsed)) {
              for (const inv of parsed as FinancialInvoiceIQD[]) {
                if (inv && typeof inv.id === 'string' && typeof inv.patientId === 'string') {
                  invoiceToPatientEpisode.set(inv.id, {
                    patientId: inv.patientId,
                    episodeId: inv.episodeId,
                  });
                }
                if (inv && typeof inv.patientName === 'string') {
                  knownPatientNames.push(inv.patientName);
                }
              }
            }
          } catch {
            // handled in main loop
          }
        } else if (entry.key === KNOWN_KEY_NAMES.APPOINTMENTS) {
          try {
            const parsed = JSON.parse(entry.rawValue);
            if (Array.isArray(parsed)) {
              for (const appt of parsed as ClinicAppointment[]) {
                if (appt && typeof appt.id === 'string' && typeof appt.patientId === 'string') {
                  appointmentToPatientEpisode.set(appt.id, {
                    patientId: appt.patientId,
                    episodeId: appt.episodeId,
                  });
                }
                if (appt && typeof appt.patientName === 'string') {
                  knownPatientNames.push(appt.patientName);
                }
              }
            }
          } catch {
            // handled in main loop
          }
        } else if (entry.key === KNOWN_KEY_NAMES.WAITING_LIST) {
          try {
            const parsed = JSON.parse(entry.rawValue);
            if (Array.isArray(parsed)) {
              for (const w of parsed as WaitingListEntry[]) {
                if (w && typeof w.patientName === 'string') {
                  knownPatientNames.push(w.patientName);
                }
              }
            }
          } catch {
            // handled in main loop
          }
        }
      }

      const meta = await database.vaultMeta.get('auth');
      const activeDekVersion = meta?.dekVersion || CURRENT_DEK_VERSION;

      if (!dryRun) {
        await database.migrationState.put({
          id: LOCALSTORAGE_MIGRATION_STATE_ID,
          status: 'in_progress',
          vaultGeneration: expectedGen,
          completedKeyHashes: Array.from(completedKeyHashSet),
          failedKeyCount: 0,
          repairedSoapNotesCount: existingState?.repairedSoapNotesCount || 0,
          conflictCount: 0,
          orphanFlowsheetCount: 0,
          updatedAt: now,
        });
      }

      let keysCommittedInThisRun = 0;
      let wasInterrupted = false;

      for (const { key, rawValue } of allEntries) {
        // 1. Check non-PHI UI preference keys
        if (NON_CLINICAL_SKIPPED_KEYS.has(key)) {
          skippedNonClinicalKeys.push(key);
          continue;
        }

        // Obsolete UI/maintenance flags safe to delete silently in destructive mode
        if (
          key === KNOWN_KEY_NAMES.PURGED_HARDCODED_MOCKS ||
          key === KNOWN_KEY_NAMES.PRELINE_LEGACY_THEME
        ) {
          if (!dryRun && destructive && typeof storage.removeItem === 'function') {
            storage.removeItem(key);
          }
          migratedKeys.push(key);
          continue;
        }

        const keyValueHash = await computeSha256Hex(`${key}:${rawValue}`);
        if (!dryRun && completedKeyHashSet.has(keyValueHash)) {
          skippedAlreadyCompletedKeys.push(key);
          // Phase 1A-ii-b: Clean up any residual plaintext key that was already verified and committed in a prior run
          if (destructive && typeof storage.removeItem === 'function') {
            storage.removeItem(key);
          }
          continue;
        }

        if (
          !dryRun &&
          options.interruptAfterKeys !== undefined &&
          keysCommittedInThisRun >= options.interruptAfterKeys
        ) {
          wasInterrupted = true;
          break;
        }

        if (!dryRun && options.onBeforeKeyCommit) {
          await options.onBeforeKeyCommit(key, keysCommittedInThisRun);
        }

        // 2. Classify & stage records for this key
        const stagedForThisKey: StagedVerificationRecord[] = [];
        let keyPainConflicts: MigrationPainConflictRecord[] = [];
        let keyOrphanFlowsheets: MigrationOrphanFlowsheetRecord[] = [];
        let episodeClinicalToSaveViaGuard: EpisodeScopedClinicalStore | null = null;
        let cleanupPlaintextKeyOnly = false;

        try {
          if (key === KNOWN_KEY_NAMES.ACTIVE_STAFF_ID) {
            const staffId = rawValue.trim();
            if (!staffId) {
              throw new Error('معرّف الموظف النشط فارغ.');
            }
            const payload = { activeStaffId: staffId, updatedAt: now };
            if (dryRun) {
              countsByTable.staffState += 1;
              migratedKeys.push(key);
              continue;
            }
            const { iv, ciphertext, recordSalt } = await encryptRecordWithMandatoryReservation(
              database,
              dek,
              'staffState',
              'active_staff',
              [],
              payload,
              CURRENT_RECORD_CRYPTO_VERSION,
              activeDekVersion,
              expectedGen
            );
            const entity: EncryptedStaffStateEntity = {
              id: 'active_staff',
              updatedAt: now,
              recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
              dekVersion: activeDekVersion,
              recordSalt,
              iv,
              ciphertext,
            };
            stagedForThisKey.push({
              tableName: 'staffState',
              id: 'active_staff',
              parentIds: [],
              entity: entity as unknown as Record<string, unknown>,
              expectedPlaintext: payload,
            });
          } else if (key === KNOWN_KEY_NAMES.STAFF_ROSTER) {
            const parsed = JSON.parse(rawValue) as ClinicStaffMember[];
            if (!Array.isArray(parsed)) {
              throw new Error('بنية قائمة الكادر غير صالحة (ليست مصفوفة).');
            }
            if (dryRun) {
              countsByTable.staffState += 1;
              migratedKeys.push(key);
              continue;
            }
            const { iv, ciphertext, recordSalt } = await encryptRecordWithMandatoryReservation(
              database,
              dek,
              'staffState',
              'staff_roster',
              [],
              parsed,
              CURRENT_RECORD_CRYPTO_VERSION,
              activeDekVersion,
              expectedGen
            );
            const entity: EncryptedStaffStateEntity = {
              id: 'staff_roster',
              updatedAt: now,
              recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
              dekVersion: activeDekVersion,
              recordSalt,
              iv,
              ciphertext,
            };
            stagedForThisKey.push({
              tableName: 'staffState',
              id: 'staff_roster',
              parentIds: [],
              entity: entity as unknown as Record<string, unknown>,
              expectedPlaintext: parsed,
            });
          } else if (key === KNOWN_KEY_NAMES.ADMIN_PIN) {
            const trimmedPin = rawValue.trim();
            if (dryRun) {
              countsByTable.clinicSettings += 1;
              migratedKeys.push(key);
              continue;
            }
            const isLegacyDefault =
              trimmedPin.length < 4 || trimmedPin === '1234' || trimmedPin === '0000';
            let authPayload: AdminPinAuthRecord;
            if (isLegacyDefault) {
              authPayload = {
                id: 'admin_auth',
                pinHashBase64: '',
                pinSaltBase64: '',
                iterations: ADMIN_PIN_PBKDF2_ITERATIONS,
                requiresFirstRunReset: true,
                updatedAt: now,
                version: 1,
              };
            } else {
              const hashed = await hashAdminPinPBKDF2(trimmedPin);
              authPayload = {
                id: 'admin_auth',
                pinHashBase64: hashed.hashBase64,
                pinSaltBase64: hashed.saltBase64,
                iterations: hashed.iterations,
                requiresFirstRunReset: false,
                updatedAt: now,
                version: 1,
              };
            }
            const { iv, ciphertext, recordSalt } = await encryptRecordWithMandatoryReservation(
              database,
              dek,
              'clinicSettings',
              'admin_auth',
              [],
              authPayload,
              CURRENT_RECORD_CRYPTO_VERSION,
              activeDekVersion,
              expectedGen
            );
            const entity: EncryptedClinicSettingsEntity = {
              id: 'admin_auth',
              updatedAt: now,
              version: 1,
              recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
              dekVersion: activeDekVersion,
              recordSalt,
              iv,
              ciphertext,
            };
            stagedForThisKey.push({
              tableName: 'clinicSettings',
              id: 'admin_auth',
              parentIds: [],
              entity: entity as unknown as Record<string, unknown>,
              expectedPlaintext: authPayload,
            });
          } else if (key === KNOWN_KEY_NAMES.RECURRING_SCHEDULES) {
            const parsed = JSON.parse(rawValue) as RecurringPatientSchedule[];
            if (!Array.isArray(parsed)) {
              throw new Error('بنية جداول المواعيد الأسبوعية المتكررة غير صالحة.');
            }
            for (const item of parsed) {
              if (!item || typeof item.id !== 'string' || !item.id.trim() || !item.patientId) {
                throw new Error('جدول أسبوعي متكرر يفتقر إلى معرّف أو معرّف مريض صالح.');
              }
              if (dryRun) {
                countsByTable.recurringSchedules += 1;
                continue;
              }
              const { iv, ciphertext, recordSalt } = await encryptRecordWithMandatoryReservation(
                database,
                dek,
                'recurringSchedules',
                item.id,
                [],
                item,
                CURRENT_RECORD_CRYPTO_VERSION,
                activeDekVersion,
                expectedGen
              );
              const entity: EncryptedRecurringScheduleEntity = {
                id: item.id,
                patientId: item.patientId,
                createdAt: item.createdAt || now,
                updatedAt: now,
                version: 1,
                recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
                dekVersion: activeDekVersion,
                recordSalt,
                iv,
                ciphertext,
              };
              stagedForThisKey.push({
                tableName: 'recurringSchedules',
                id: item.id,
                parentIds: [],
                entity: entity as unknown as Record<string, unknown>,
                expectedPlaintext: item,
              });
            }
            if (dryRun) {
              migratedKeys.push(key);
              continue;
            }
            if (parsed.length === 0) cleanupPlaintextKeyOnly = true;
          } else if (key === KNOWN_KEY_NAMES.RECURRING_SKIPPED_DATES) {
            const parsed = JSON.parse(rawValue) as string[];
            if (!Array.isArray(parsed)) {
              throw new Error('بنية التواريخ المستثناة للجدول الأسبوعي غير صالحة.');
            }
            for (const skipKey of parsed) {
              if (typeof skipKey !== 'string' || !skipKey.includes('_')) continue;
              const lastUnderscore = skipKey.lastIndexOf('_');
              const scheduleId = skipKey.slice(0, lastUnderscore);
              const date = skipKey.slice(lastUnderscore + 1);
              if (dryRun) {
                countsByTable.recurringSkippedDates += 1;
                continue;
              }
              const payload = { scheduleId, date, updatedAt: now, version: 1 };
              const { iv, ciphertext, recordSalt } = await encryptRecordWithMandatoryReservation(
                database,
                dek,
                'recurringSkippedDates',
                skipKey,
                [],
                payload,
                CURRENT_RECORD_CRYPTO_VERSION,
                activeDekVersion,
                expectedGen
              );
              const entity: EncryptedRecurringSkippedDateEntity = {
                id: skipKey,
                scheduleId,
                createdAt: now,
                updatedAt: now,
                version: 1,
                recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
                dekVersion: activeDekVersion,
                recordSalt,
                iv,
                ciphertext,
              };
              stagedForThisKey.push({
                tableName: 'recurringSkippedDates',
                id: skipKey,
                parentIds: [],
                entity: entity as unknown as Record<string, unknown>,
                expectedPlaintext: payload,
              });
            }
            if (dryRun) {
              migratedKeys.push(key);
              continue;
            }
            if (stagedForThisKey.length === 0) cleanupPlaintextKeyOnly = true;
          } else if (
            key === KNOWN_KEY_NAMES.MRN_SEQ ||
            key === KNOWN_KEY_NAMES.MRN_MAP
          ) {
            if (dryRun) {
              countsByTable.clinicSettings += 1;
              migratedKeys.push(key);
              continue;
            }
            let currentReg: MrnRegistryData = {
              id: 'mrn_registry',
              issuedMrns: [],
              patientMrnMap: {},
              sequence: 0,
              updatedAt: now,
              version: 0,
            };
            const existingEntity = await database.clinicSettings.get('mrn_registry');
            if (existingEntity) {
              try {
                const dec = await decryptRecordPayload<MrnRegistryData>(
                  dek,
                  'clinicSettings',
                  existingEntity.id,
                  [],
                  existingEntity.iv,
                  existingEntity.ciphertext,
                  existingEntity.recordCryptoVersion || CURRENT_RECORD_CRYPTO_VERSION,
                  existingEntity.dekVersion || CURRENT_DEK_VERSION,
                  existingEntity.recordSalt
                );
                currentReg = { ...currentReg, ...dec };
              } catch (err: unknown) {
                recordSafeNonFatalWarning('migration', 'decrypt_existing_mrn_registry', err);
              }
            }
            const issuedSet = new Set<string>(currentReg.issuedMrns || []);
            const nextMap: Record<string, string> = { ...(currentReg.patientMrnMap || {}) };
            let nextSeq = currentReg.sequence || 0;

            if (key === KNOWN_KEY_NAMES.MRN_SEQ) {
              const parsedSeq = Number(rawValue.trim());
              if (!Number.isFinite(parsedSeq) || parsedSeq < 0) {
                throw new Error('قيمة تسلسل MRN غير صالحة.');
              }
              nextSeq = Math.max(nextSeq, parsedSeq);
            } else {
              const parsedMap = JSON.parse(rawValue);
              if (Array.isArray(parsedMap)) {
                for (const item of parsedMap) {
                  if (typeof item === 'string' && item.trim()) issuedSet.add(item.trim());
                }
              } else if (parsedMap && typeof parsedMap === 'object') {
                for (const [pid, mrnVal] of Object.entries(parsedMap as Record<string, unknown>)) {
                  if (typeof mrnVal === 'string' && mrnVal.trim()) {
                    nextMap[pid] = mrnVal.trim();
                    issuedSet.add(mrnVal.trim());
                  }
                }
              } else {
                throw new Error('بنية خريطة MRN غير صالحة.');
              }
            }

            const mergedReg: MrnRegistryData = {
              id: 'mrn_registry',
              issuedMrns: Array.from(issuedSet),
              patientMrnMap: nextMap,
              sequence: nextSeq,
              updatedAt: now,
              version: (existingEntity?.version ?? currentReg.version ?? 0) + 1,
            };
            const { iv, ciphertext, recordSalt } = await encryptRecordWithMandatoryReservation(
              database,
              dek,
              'clinicSettings',
              'mrn_registry',
              [],
              mergedReg,
              CURRENT_RECORD_CRYPTO_VERSION,
              activeDekVersion,
              expectedGen
            );
            const entity: EncryptedClinicSettingsEntity = {
              id: 'mrn_registry',
              updatedAt: now,
              version: mergedReg.version,
              recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
              dekVersion: activeDekVersion,
              recordSalt,
              iv,
              ciphertext,
            };
            stagedForThisKey.push({
              tableName: 'clinicSettings',
              id: 'mrn_registry',
              parentIds: [],
              entity: entity as unknown as Record<string, unknown>,
              expectedPlaintext: mergedReg,
            });
          } else if (
            key === KNOWN_KEY_NAMES.RECEPTION_PRIVACY_BLUR ||
            key === KNOWN_KEY_NAMES.SHOW_EXERCISE_LIBRARY
          ) {
            if (dryRun) {
              countsByTable.clinicSettings += 1;
              migratedKeys.push(key);
              continue;
            }
            let currentFlags: ModuleFlagsSettings & { receptionPrivacyBlur?: boolean } = {
              id: 'module_flags',
              showHepLibrary: false,
              enableCustomWidgetStudio: false,
              receptionPrivacyBlur: false,
              updatedAt: now,
              version: 0,
            };
            const existingEntity = await database.clinicSettings.get('module_flags');
            if (existingEntity) {
              try {
                const dec = await decryptRecordPayload<
                  ModuleFlagsSettings & { receptionPrivacyBlur?: boolean }
                >(
                  dek,
                  'clinicSettings',
                  existingEntity.id,
                  [],
                  existingEntity.iv,
                  existingEntity.ciphertext,
                  existingEntity.recordCryptoVersion || CURRENT_RECORD_CRYPTO_VERSION,
                  existingEntity.dekVersion || CURRENT_DEK_VERSION,
                  existingEntity.recordSalt
                );
                currentFlags = { ...currentFlags, ...dec };
              } catch (err: unknown) {
                recordSafeNonFatalWarning('migration', 'decrypt_existing_module_flags', err);
              }
            }
            const boolVal = rawValue.trim() === 'true' || rawValue.trim() === '1';
            if (key === KNOWN_KEY_NAMES.RECEPTION_PRIVACY_BLUR) {
              currentFlags.receptionPrivacyBlur = boolVal;
            } else {
              currentFlags.showHepLibrary = boolVal;
            }
            currentFlags.updatedAt = now;
            currentFlags.version = (existingEntity?.version ?? currentFlags.version ?? 0) + 1;

            const { iv, ciphertext, recordSalt } = await encryptRecordWithMandatoryReservation(
              database,
              dek,
              'clinicSettings',
              'module_flags',
              [],
              currentFlags,
              CURRENT_RECORD_CRYPTO_VERSION,
              activeDekVersion,
              expectedGen
            );
            const entity: EncryptedClinicSettingsEntity = {
              id: 'module_flags',
              updatedAt: now,
              version: currentFlags.version,
              recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
              dekVersion: activeDekVersion,
              recordSalt,
              iv,
              ciphertext,
            };
            stagedForThisKey.push({
              tableName: 'clinicSettings',
              id: 'module_flags',
              parentIds: [],
              entity: entity as unknown as Record<string, unknown>,
              expectedPlaintext: currentFlags,
            });
          } else if (key === KNOWN_KEY_NAMES.LAST_BACKUP_AT) {
            if (dryRun) {
              countsByTable.clinicSettings += 1;
              migratedKeys.push(key);
              continue;
            }
            let currentMeta: BackupStateMetadata = {
              id: 'backup_meta',
              updatedAt: now,
              version: 0,
            };
            const existingEntity = await database.clinicSettings.get('backup_meta');
            if (existingEntity) {
              try {
                const dec = await decryptRecordPayload<BackupStateMetadata>(
                  dek,
                  'clinicSettings',
                  existingEntity.id,
                  [],
                  existingEntity.iv,
                  existingEntity.ciphertext,
                  existingEntity.recordCryptoVersion || CURRENT_RECORD_CRYPTO_VERSION,
                  existingEntity.dekVersion || CURRENT_DEK_VERSION,
                  existingEntity.recordSalt
                );
                currentMeta = { ...currentMeta, ...dec };
              } catch (err: unknown) {
                recordSafeNonFatalWarning('migration', 'decrypt_existing_backup_meta', err);
              }
            }
            const nextMeta: BackupStateMetadata = {
              ...currentMeta,
              lastBackupAt: rawValue.trim(),
              updatedAt: now,
              version: (existingEntity?.version ?? currentMeta.version ?? 0) + 1,
            };
            const { iv, ciphertext, recordSalt } = await encryptRecordWithMandatoryReservation(
              database,
              dek,
              'clinicSettings',
              'backup_meta',
              [],
              nextMeta,
              CURRENT_RECORD_CRYPTO_VERSION,
              activeDekVersion,
              expectedGen
            );
            const entity: EncryptedClinicSettingsEntity = {
              id: 'backup_meta',
              updatedAt: now,
              version: nextMeta.version,
              recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
              dekVersion: activeDekVersion,
              recordSalt,
              iv,
              ciphertext,
            };
            stagedForThisKey.push({
              tableName: 'clinicSettings',
              id: 'backup_meta',
              parentIds: [],
              entity: entity as unknown as Record<string, unknown>,
              expectedPlaintext: nextMeta,
            });
          } else if (key.startsWith(KNOWN_KEY_NAMES.ORGANUI_MEDS_PREFIX)) {
            const patientId = key.slice(KNOWN_KEY_NAMES.ORGANUI_MEDS_PREFIX.length).trim();
            const parsed = JSON.parse(rawValue);
            if (!patientId || !Array.isArray(parsed)) {
              throw new Error('بنية قائمة أدوية المريض غير صالحة.');
            }
            if (dryRun) {
              countsByTable.patientMedications += 1;
              migratedKeys.push(key);
              continue;
            }
            const medPlan: PatientMedicationPlan = {
              patientId,
              medications: parsed as Array<Record<string, unknown>>,
              updatedAt: now,
              version: 1,
            };
            const { iv, ciphertext, recordSalt } = await encryptRecordWithMandatoryReservation(
              database,
              dek,
              'patientMedications',
              patientId,
              [patientId],
              medPlan,
              CURRENT_RECORD_CRYPTO_VERSION,
              activeDekVersion,
              expectedGen
            );
            const entity: EncryptedPatientMedicationEntity = {
              id: patientId,
              patientId,
              createdAt: now,
              updatedAt: now,
              version: 1,
              recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
              dekVersion: activeDekVersion,
              recordSalt,
              iv,
              ciphertext,
            };
            stagedForThisKey.push({
              tableName: 'patientMedications',
              id: patientId,
              parentIds: [patientId],
              entity: entity as unknown as Record<string, unknown>,
              expectedPlaintext: medPlan,
            });
          } else if (key.startsWith(KNOWN_KEY_NAMES.PATIENT_WIDGETS_LEGACY_PREFIX)) {
            const patientId = key.slice(KNOWN_KEY_NAMES.PATIENT_WIDGETS_LEGACY_PREFIX.length).trim();
            const parsed = JSON.parse(rawValue) as Record<string, unknown>;
            if (!patientId || !parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
              throw new Error('بنية بيانات وحدات الفحص القديمة غير صالحة.');
            }
            if (dryRun) {
              countsByTable.clinicSettings += 1;
              migratedKeys.push(key);
              continue;
            }
            const settingId = `legacy_patient_widgets_${patientId}`;
            const { iv, ciphertext, recordSalt } = await encryptRecordWithMandatoryReservation(
              database,
              dek,
              'clinicSettings',
              settingId,
              [],
              parsed,
              CURRENT_RECORD_CRYPTO_VERSION,
              activeDekVersion,
              expectedGen
            );
            const entity: EncryptedClinicSettingsEntity = {
              id: settingId,
              updatedAt: now,
              version: 1,
              recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
              dekVersion: activeDekVersion,
              recordSalt,
              iv,
              ciphertext,
            };
            stagedForThisKey.push({
              tableName: 'clinicSettings',
              id: settingId,
              parentIds: [],
              entity: entity as unknown as Record<string, unknown>,
              expectedPlaintext: parsed,
            });
          } else if (key.startsWith(KNOWN_KEY_NAMES.SESSION_FLOWSHEET_LATEST_PREFIX)) {
            const epId = key.slice(KNOWN_KEY_NAMES.SESSION_FLOWSHEET_LATEST_PREFIX.length).trim();
            const parsed = JSON.parse(rawValue) as Record<string, unknown>;
            if (!epId || !parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
              throw new Error('بنية مسودة التمارين الأخيرة للحلقة غير صالحة.');
            }
            if (dryRun) {
              countsByTable.clinicSettings += 1;
              migratedKeys.push(key);
              continue;
            }
            const settingId = `legacy_latest_flowsheet_${epId}`;
            const { iv, ciphertext, recordSalt } = await encryptRecordWithMandatoryReservation(
              database,
              dek,
              'clinicSettings',
              settingId,
              [],
              parsed,
              CURRENT_RECORD_CRYPTO_VERSION,
              activeDekVersion,
              expectedGen
            );
            const entity: EncryptedClinicSettingsEntity = {
              id: settingId,
              updatedAt: now,
              version: 1,
              recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
              dekVersion: activeDekVersion,
              recordSalt,
              iv,
              ciphertext,
            };
            stagedForThisKey.push({
              tableName: 'clinicSettings',
              id: settingId,
              parentIds: [],
              entity: entity as unknown as Record<string, unknown>,
              expectedPlaintext: parsed,
            });
          } else if (key === KNOWN_KEY_NAMES.APPOINTMENTS) {
            const parsed = JSON.parse(rawValue);
            if (!Array.isArray(parsed)) {
              throw new Error('بنية جدول المواعيد غير صالحة (ليست مصفوفة).');
            }
            for (const item of parsed as ClinicAppointment[]) {
              if (!item || typeof item.id !== 'string' || !item.id.trim()) {
                throw new Error('عنصر موعد يفتقر إلى معرّف صالح.');
              }
              if (typeof item.patientId !== 'string' || !item.patientId.trim()) {
                throw new Error(`الموعد "${item.id}" يفتقر إلى patientId صالح.`);
              }
              if (dryRun) {
                countsByTable.appointments += 1;
                continue;
              }
              const { iv, ciphertext, recordSalt } = await encryptRecordWithMandatoryReservation(
                database,
                dek,
                'appointments',
                item.id,
                [],
                item,
                CURRENT_RECORD_CRYPTO_VERSION,
                activeDekVersion,
                expectedGen
              );
              const entity: EncryptedAppointmentEntity = {
                id: item.id,
                patientId: item.patientId,
                createdAt: now,
                updatedAt: now,
                recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
                dekVersion: activeDekVersion,
                recordSalt,
                iv,
                ciphertext,
              };
              stagedForThisKey.push({
                tableName: 'appointments',
                id: item.id,
                parentIds: [],
                entity: entity as unknown as Record<string, unknown>,
                expectedPlaintext: item,
              });
            }
            if (dryRun) {
              migratedKeys.push(key);
              continue;
            }
            if (parsed.length === 0) cleanupPlaintextKeyOnly = true;
          } else if (key === KNOWN_KEY_NAMES.WAITING_LIST) {
            const parsed = JSON.parse(rawValue);
            if (!Array.isArray(parsed)) {
              throw new Error('بنية قائمة الانتظار غير صالحة (ليست مصفوفة).');
            }
            for (const item of parsed as WaitingListEntry[]) {
              if (!item || typeof item.id !== 'string' || !item.id.trim()) {
                throw new Error('عنصر قائمة انتظار يفتقر إلى معرّف صالح.');
              }
              if (dryRun) {
                countsByTable.waitingList += 1;
                continue;
              }
              const { iv, ciphertext, recordSalt } = await encryptRecordWithMandatoryReservation(
                database,
                dek,
                'waitingList',
                item.id,
                [],
                item,
                CURRENT_RECORD_CRYPTO_VERSION,
                activeDekVersion,
                expectedGen
              );
              const entity: EncryptedWaitingListEntity = {
                id: item.id,
                ...(item.patientId ? { patientId: item.patientId } : {}),
                createdAt: item.addedAt || now,
                updatedAt: now,
                recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
                dekVersion: activeDekVersion,
                recordSalt,
                iv,
                ciphertext,
              };
              stagedForThisKey.push({
                tableName: 'waitingList',
                id: item.id,
                parentIds: [],
                entity: entity as unknown as Record<string, unknown>,
                expectedPlaintext: item,
              });
            }
            if (dryRun) {
              migratedKeys.push(key);
              continue;
            }
            if (parsed.length === 0) cleanupPlaintextKeyOnly = true;
          } else if (key === KNOWN_KEY_NAMES.INVOICES_IQD) {
            const parsed = JSON.parse(rawValue);
            if (!Array.isArray(parsed)) {
              throw new Error('بنية الفواتير غير صالحة (ليست مصفوفة).');
            }
            for (const inv of parsed as FinancialInvoiceIQD[]) {
              if (!inv || typeof inv.id !== 'string' || !inv.id.trim()) {
                throw new Error('فاتورة تفتقر إلى معرّف صالح.');
              }
              if (typeof inv.patientId !== 'string' || !inv.patientId.trim()) {
                throw new Error(`الفاتورة "${inv.id}" تفتقر إلى patientId صالح.`);
              }
              const paymentsList: PaymentTransactionIQD[] = Array.isArray(inv.payments)
                ? inv.payments
                : [];
              if (dryRun) {
                countsByTable.invoices += 1;
                countsByTable.payments += paymentsList.length;
                continue;
              }
              const { iv: invIv, ciphertext: invCipher, recordSalt: invSalt } =
                await encryptRecordWithMandatoryReservation(
                  database,
                  dek,
                  'invoices',
                  inv.id,
                  [],
                  inv,
                  CURRENT_RECORD_CRYPTO_VERSION,
                  activeDekVersion,
                  expectedGen
                );
              const invEntity: EncryptedInvoiceEntity = {
                id: inv.id,
                patientId: inv.patientId,
                ...(inv.episodeId ? { episodeId: inv.episodeId } : {}),
                createdAt: inv.date || now,
                updatedAt: now,
                recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
                dekVersion: activeDekVersion,
                recordSalt: invSalt,
                iv: invIv,
                ciphertext: invCipher,
              };
              stagedForThisKey.push({
                tableName: 'invoices',
                id: inv.id,
                parentIds: [],
                entity: invEntity as unknown as Record<string, unknown>,
                expectedPlaintext: inv,
              });

              for (const pay of paymentsList) {
                if (!pay || typeof pay.id !== 'string' || !pay.id.trim()) {
                  throw new Error(`دفعة تابعة للفاتورة "${inv.id}" تفتقر إلى معرّف صالح.`);
                }
                const normalizedPay: PaymentTransactionIQD = {
                  ...pay,
                  invoiceId: inv.id,
                  patientId: pay.patientId || inv.patientId,
                };
                const { iv: payIv, ciphertext: payCipher, recordSalt: paySalt } =
                  await encryptRecordWithMandatoryReservation(
                    database,
                    dek,
                    'payments',
                    normalizedPay.id,
                    [inv.id],
                    normalizedPay,
                    CURRENT_RECORD_CRYPTO_VERSION,
                    activeDekVersion,
                    expectedGen
                  );
                const payEntity: EncryptedPaymentEntity = {
                  id: normalizedPay.id,
                  invoiceId: inv.id,
                  patientId: normalizedPay.patientId,
                  createdAt: normalizedPay.date || now,
                  updatedAt: now,
                  recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
                  dekVersion: activeDekVersion,
                  recordSalt: paySalt,
                  iv: payIv,
                  ciphertext: payCipher,
                };
                stagedForThisKey.push({
                  tableName: 'payments',
                  id: normalizedPay.id,
                  parentIds: [inv.id],
                  entity: payEntity as unknown as Record<string, unknown>,
                  expectedPlaintext: normalizedPay,
                });
              }
            }
            if (dryRun) {
              migratedKeys.push(key);
              continue;
            }
            if (parsed.length === 0) cleanupPlaintextKeyOnly = true;
          } else if (key === KNOWN_KEY_NAMES.EXPENSES_IQD) {
            const parsed = JSON.parse(rawValue);
            if (!Array.isArray(parsed)) {
              throw new Error('بنية المصاريف غير صالحة (ليست مصفوفة).');
            }
            for (const exp of parsed as ClinicExpenseIQD[]) {
              if (!exp || typeof exp.id !== 'string' || !exp.id.trim()) {
                throw new Error('سجل مصروف يفتقر إلى معرّف صالح.');
              }
              if (dryRun) {
                countsByTable.expenses += 1;
                continue;
              }
              const { iv, ciphertext, recordSalt } = await encryptRecordWithMandatoryReservation(
                database,
                dek,
                'expenses',
                exp.id,
                [],
                exp,
                CURRENT_RECORD_CRYPTO_VERSION,
                activeDekVersion,
                expectedGen
              );
              const entity: EncryptedExpenseEntity = {
                id: exp.id,
                createdAt: exp.date || now,
                updatedAt: now,
                recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
                dekVersion: activeDekVersion,
                recordSalt,
                iv,
                ciphertext,
              };
              stagedForThisKey.push({
                tableName: 'expenses',
                id: exp.id,
                parentIds: [],
                entity: entity as unknown as Record<string, unknown>,
                expectedPlaintext: exp,
              });
            }
            if (dryRun) {
              migratedKeys.push(key);
              continue;
            }
            if (parsed.length === 0) cleanupPlaintextKeyOnly = true;
          } else if (key === KNOWN_KEY_NAMES.AUDIT_LOGS) {
            const parsed = JSON.parse(rawValue);
            if (!Array.isArray(parsed)) {
              throw new Error('بنية سجل التدقيق غير صالحة (ليست مصفوفة).');
            }
            for (const rawLog of parsed as AuditLogEntry[]) {
              if (!rawLog || typeof rawLog.id !== 'string' || !rawLog.id.trim()) {
                throw new Error('سجل تدقيق يفتقر إلى معرّف صالح.');
              }
              const sanitizedLog = sanitizeAuditLogEntryForMigration(
                rawLog,
                knownPatientNames,
                {
                  invoiceToPatientEpisode,
                  appointmentToPatientEpisode,
                  sessionToPatientEpisode,
                  episodeToPatient,
                }
              );
              if (dryRun) {
                countsByTable.auditLogs += 1;
                continue;
              }
              const { iv, ciphertext, recordSalt } = await encryptRecordWithMandatoryReservation(
                database,
                dek,
                'auditLogs',
                sanitizedLog.id,
                [],
                sanitizedLog,
                CURRENT_RECORD_CRYPTO_VERSION,
                activeDekVersion,
                expectedGen
              );
              const entity: EncryptedAuditLogEntity = {
                id: sanitizedLog.id,
                ...(sanitizedLog.patientId ? { patientId: sanitizedLog.patientId } : {}),
                ...(sanitizedLog.episodeId ? { episodeId: sanitizedLog.episodeId } : {}),
                createdAt: sanitizedLog.timestamp || now,
                recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
                dekVersion: activeDekVersion,
                recordSalt,
                iv,
                ciphertext,
              };
              stagedForThisKey.push({
                tableName: 'auditLogs',
                id: sanitizedLog.id,
                parentIds: [],
                entity: entity as unknown as Record<string, unknown>,
                expectedPlaintext: sanitizedLog,
              });
            }
            if (dryRun) {
              migratedKeys.push(key);
              continue;
            }
            if (parsed.length === 0) cleanupPlaintextKeyOnly = true;
          } else if (key === KNOWN_KEY_NAMES.CUSTOM_WIDGETS) {
            const parsed = JSON.parse(rawValue);
            if (!Array.isArray(parsed)) {
              throw new Error('بنية قوالب الوحدات المخصصة غير صالحة (ليست مصفوفة).');
            }
            for (const widget of parsed as Array<Record<string, unknown>>) {
              const wId = typeof widget?.id === 'string' ? widget.id.trim() : '';
              if (!wId) {
                throw new Error('قالب وحدة مخصصة يفتقر إلى معرّف صالح.');
              }
              if (dryRun) {
                countsByTable.customWidgets += 1;
                continue;
              }
              const { iv, ciphertext, recordSalt } = await encryptRecordWithMandatoryReservation(
                database,
                dek,
                'customWidgets',
                wId,
                [],
                widget,
                CURRENT_RECORD_CRYPTO_VERSION,
                activeDekVersion,
                expectedGen
              );
              const entity: EncryptedCustomWidgetEntity = {
                id: wId,
                createdAt:
                  typeof widget.createdAt === 'string' ? widget.createdAt : now,
                updatedAt: now,
                recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
                dekVersion: activeDekVersion,
                recordSalt,
                iv,
                ciphertext,
              };
              stagedForThisKey.push({
                tableName: 'customWidgets',
                id: wId,
                parentIds: [],
                entity: entity as unknown as Record<string, unknown>,
                expectedPlaintext: widget,
              });
            }
            if (dryRun) {
              migratedKeys.push(key);
              continue;
            }
            if (parsed.length === 0) cleanupPlaintextKeyOnly = true;
          } else if (key.startsWith(KNOWN_KEY_NAMES.EPISODE_STORE_PREFIX)) {
            const episodeIdFromKey = key.slice(KNOWN_KEY_NAMES.EPISODE_STORE_PREFIX.length).trim();
            if (!episodeIdFromKey) {
              throw new Error('مفتاح تقييم حلقة الرعاية يفتقر إلى episodeId.');
            }
            const parsed = JSON.parse(rawValue) as EpisodeScopedClinicalStore;
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
              throw new Error('بنية تقييم حلقة الرعاية غير صالحة.');
            }
            const resolvedEpisodeId = parsed.episodeId || episodeIdFromKey;
            const resolvedPatientId =
              parsed.patientId || episodeToPatient.get(resolvedEpisodeId) || '';
            if (!resolvedPatientId) {
              throw new Error(
                `سجل تقييم حلقة الرعاية "${resolvedEpisodeId}" يفتقر إلى patientId صالح.`
              );
            }
            const normalizedStore: EpisodeScopedClinicalStore = {
              ...parsed,
              episodeId: resolvedEpisodeId,
              patientId: resolvedPatientId,
              snapshots: Array.isArray(parsed.snapshots) ? parsed.snapshots : [],
              hepProgram: Array.isArray(parsed.hepProgram) ? parsed.hepProgram : [],
              updatedAt: parsed.updatedAt || now,
            };

            if (dryRun) {
              countsByTable.episodeClinical += 1;
              migratedKeys.push(key);
              continue;
            }
            episodeClinicalToSaveViaGuard = normalizedStore;
          } else if (
            key.startsWith(KNOWN_KEY_NAMES.SESSION_FLOWSHEET_PREFIX) &&
            !key.startsWith(KNOWN_KEY_NAMES.SESSION_FLOWSHEET_LATEST_PREFIX)
          ) {
            const sessionId = key.slice(KNOWN_KEY_NAMES.SESSION_FLOWSHEET_PREFIX.length).trim();
            if (!sessionId) {
              throw new Error('مفتاح جدول التمارين يفتقر إلى sessionId.');
            }
            const parsed = JSON.parse(rawValue) as SessionFlowsheetData;
            if (
              !parsed ||
              typeof parsed !== 'object' ||
              Array.isArray(parsed) ||
              !Array.isArray(parsed.exercises) ||
              !Array.isArray(parsed.manualTherapy) ||
              !Array.isArray(parsed.physicalAgents)
            ) {
              throw new Error(`بنية جدول تمارين الجلسة "${sessionId}" غير صالحة.`);
            }

            const sessionEntity = await database.sessions.get(sessionId);
            const existingSoapEntity = await database.soapNotes
              .where('sessionId')
              .equals(sessionId)
              .first();

            if (!sessionEntity && !existingSoapEntity) {
              // Orphan flowsheet whose session no longer exists in db.sessions
              keyOrphanFlowsheets.push({
                key,
                sessionId,
                reason: 'Parent session does not exist in db.sessions',
              });
              orphanFlowsheets.push(...keyOrphanFlowsheets);
              if (dryRun) {
                migratedKeys.push(key);
                continue;
              }
            } else {
              const cleanFlowsheet: SoapFlowsheetData = {
                exercises: parsed.exercises,
                manualTherapy: parsed.manualTherapy,
                physicalAgents: parsed.physicalAgents,
              };

              if (existingSoapEntity) {
                const parentIds = existingSoapEntity.episodeId
                  ? [
                      existingSoapEntity.patientId,
                      existingSoapEntity.episodeId,
                      existingSoapEntity.sessionId,
                    ]
                  : [existingSoapEntity.patientId, existingSoapEntity.sessionId];
                const existingSoapData = await decryptRecordPayload<SoapNoteData>(
                  dek,
                  'soapNotes',
                  existingSoapEntity.id,
                  parentIds,
                  existingSoapEntity.iv,
                  existingSoapEntity.ciphertext,
                  existingSoapEntity.recordCryptoVersion || CURRENT_RECORD_CRYPTO_VERSION,
                  existingSoapEntity.dekVersion || CURRENT_DEK_VERSION,
                  existingSoapEntity.recordSalt
                );

                // If the note is already finalized AND sealed under canonical seal v1, do not mutate it
                if (existingSoapData.isFinalized && existingSoapData.sealVersion) {
                  if (
                    parsed.preSessionPainNrs !== undefined &&
                    existingSoapData.subjective?.painNrsScore !== undefined &&
                    existingSoapData.subjective.painNrsScore !== parsed.preSessionPainNrs
                  ) {
                    keyPainConflicts.push({
                      sessionId,
                      soapId: existingSoapEntity.id,
                      soapPainNrsScore: existingSoapData.subjective.painNrsScore,
                      flowsheetPreSessionPainNrs: parsed.preSessionPainNrs,
                      resolution: 'skipped_finalized_sealed',
                    });
                    painConflicts.push(...keyPainConflicts);
                  }
                } else {
                  const currentSub = { ...(existingSoapData.subjective || {}) };
                  if (parsed.preSessionPainNrs !== undefined) {
                    if (
                      currentSub.painNrsScore !== undefined &&
                      currentSub.painNrsScore !== parsed.preSessionPainNrs
                    ) {
                      keyPainConflicts.push({
                        sessionId,
                        soapId: existingSoapEntity.id,
                        soapPainNrsScore: currentSub.painNrsScore,
                        flowsheetPreSessionPainNrs: parsed.preSessionPainNrs,
                        resolution: 'flowsheet_won',
                      });
                      painConflicts.push(...keyPainConflicts);
                    }
                    currentSub.painNrsScore = parsed.preSessionPainNrs;
                    delete currentSub.painNotRecorded;
                  }
                  if (parsed.postSessionPainNrs !== undefined) {
                    currentSub.postSessionPainNrs = parsed.postSessionPainNrs;
                    delete currentSub.postPainNotRecorded;
                  }

                  const wasLegacyUnreviewed = Boolean(
                    !existingSoapData.isFinalized &&
                      !existingSoapData.legacyReviewedAt &&
                      (existingSoapData.legacyUnreviewed ||
                        (existingSoapData.soapSchemaVersion ?? 1) < CURRENT_SOAP_SCHEMA_VERSION)
                  );

                  const mergedSoapData: SoapNoteData = {
                    ...existingSoapData,
                    soapSchemaVersion: CURRENT_SOAP_SCHEMA_VERSION,
                    ...(wasLegacyUnreviewed ? { legacyUnreviewed: true } : {}),
                    subjective: currentSub,
                    objective: {
                      ...(existingSoapData.objective || {}),
                      flowsheet: cleanFlowsheet,
                    },
                  };

                  if (dryRun) {
                    countsByTable.soapNotes += 1;
                    migratedKeys.push(key);
                    continue;
                  }

                  const resolvedEpisodeId =
                    existingSoapEntity.episodeId || sessionEntity?.episodeId || '';
                  const updatedParentIds = resolvedEpisodeId
                    ? [existingSoapEntity.patientId, resolvedEpisodeId, sessionId]
                    : [existingSoapEntity.patientId, sessionId];

                  const { iv: soapIv, ciphertext: soapCipher, recordSalt: soapSalt } =
                    await encryptRecordWithMandatoryReservation(
                      database,
                      dek,
                      'soapNotes',
                      existingSoapEntity.id,
                      updatedParentIds,
                      mergedSoapData,
                      CURRENT_RECORD_CRYPTO_VERSION,
                      activeDekVersion,
                      expectedGen
                    );

                  const updatedSoapEntity: EncryptedSoapEntity = {
                    id: existingSoapEntity.id,
                    sessionId,
                    episodeId: resolvedEpisodeId,
                    patientId: existingSoapEntity.patientId,
                    createdAt: existingSoapEntity.createdAt,
                    updatedAt: now,
                    recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
                    dekVersion: activeDekVersion,
                    recordSalt: soapSalt,
                    iv: soapIv,
                    ciphertext: soapCipher,
                  };

                  stagedForThisKey.push({
                    tableName: 'soapNotes',
                    id: existingSoapEntity.id,
                    parentIds: updatedParentIds,
                    entity: updatedSoapEntity as unknown as Record<string, unknown>,
                    expectedPlaintext: mergedSoapData,
                  });
                }
              } else if (sessionEntity) {
                // Session exists in db.sessions but had no db.soapNotes row yet
                const newSoapId = `soap_mig_${sessionId}`;
                const newSoapData: SoapNoteData = {
                  soapSchemaVersion: CURRENT_SOAP_SCHEMA_VERSION,
                  isFinalized: false,
                  legacyUnreviewed: true,
                  subjective: {
                    ...(parsed.preSessionPainNrs !== undefined
                      ? { painNrsScore: parsed.preSessionPainNrs }
                      : {}),
                    ...(parsed.postSessionPainNrs !== undefined
                      ? { postSessionPainNrs: parsed.postSessionPainNrs }
                      : {}),
                  },
                  objective: {
                    flowsheet: cleanFlowsheet,
                  },
                  assessment: {},
                  plan: {},
                };

                if (dryRun) {
                  countsByTable.soapNotes += 1;
                  migratedKeys.push(key);
                  continue;
                }

                const parentIds = [
                  sessionEntity.patientId,
                  sessionEntity.episodeId,
                  sessionId,
                ];
                const { iv: soapIv, ciphertext: soapCipher, recordSalt: soapSalt } =
                  await encryptRecordWithMandatoryReservation(
                    database,
                    dek,
                    'soapNotes',
                    newSoapId,
                    parentIds,
                    newSoapData,
                    CURRENT_RECORD_CRYPTO_VERSION,
                    activeDekVersion,
                    expectedGen
                  );

                const newSoapEntity: EncryptedSoapEntity = {
                  id: newSoapId,
                  sessionId,
                  episodeId: sessionEntity.episodeId,
                  patientId: sessionEntity.patientId,
                  createdAt: now,
                  updatedAt: now,
                  recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
                  dekVersion: activeDekVersion,
                  recordSalt: soapSalt,
                  iv: soapIv,
                  ciphertext: soapCipher,
                };

                stagedForThisKey.push({
                  tableName: 'soapNotes',
                  id: newSoapId,
                  parentIds,
                  entity: newSoapEntity as unknown as Record<string, unknown>,
                  expectedPlaintext: newSoapData,
                });
              }
            }
          } else {
            // Any other physiorecord_* key (e.g. legacy patient widgets or organui meds):
            // Validate JSON so corrupt keys are caught and reported without deleting
            const parsed = JSON.parse(rawValue);
            if (parsed === null || typeof parsed !== 'object') {
              throw new Error(`بنية المفتاح "${key}" غير صالحة.`);
            }
            skippedNonClinicalKeys.push(key);
            continue;
          }

          // 3. Commit & verify in live mode
          if (!dryRun) {
            if (episodeClinicalToSaveViaGuard) {
              // Pre-read existing Dexie record to ensure idempotence when re-migrating identical snapshots,
              // while strictly enforcing append-only snapshots via saveEpisodeClinicalStoreEncrypted
              const savedEntity = await this.commitAndVerifyEpisodeClinical(
                episodeClinicalToSaveViaGuard,
                dek,
                database
              );
              countsByTable.episodeClinical += 1;
              await verifyWrittenRecordInDexie(database, dek, {
                tableName: 'episodeClinical',
                id: savedEntity.id,
                parentIds: [savedEntity.episodeId],
                entity: savedEntity as unknown as Record<string, unknown>,
                expectedPlaintext: {
                  ...episodeClinicalToSaveViaGuard,
                  updatedAt: savedEntity.updatedAt,
                },
              });
            }

            if (stagedForThisKey.length > 0) {
              const tableNames = Array.from(
                new Set(stagedForThisKey.map((s) => s.tableName))
              );
              const tablesToLock = tableNames.map((t) => database.table(t));
              await database.transaction('rw', tablesToLock, async () => {
                for (const item of stagedForThisKey) {
                  await database.table(item.tableName).put(item.entity);
                }
              });

              // Verify EVERY written record by decrypt + canonical deep-equal before marking key complete
              for (const item of stagedForThisKey) {
                await verifyWrittenRecordInDexie(database, dek, item);
                countsByTable[item.tableName] = (countsByTable[item.tableName] || 0) + 1;
              }
            }

            // Record per-key completion hash in db.migrationState (resumable progress)
            completedKeyHashSet.add(keyValueHash);
            keysCommittedInThisRun += 1;
            migratedKeys.push(key);

            // Phase 1A-ii-b: Destructive Migration
            // Strictly delete plaintext key from localStorage ONLY AFTER successful commit & deep-equal verification!
            if (
              destructive &&
              (stagedForThisKey.length > 0 || episodeClinicalToSaveViaGuard || cleanupPlaintextKeyOnly) &&
              typeof storage.removeItem === 'function'
            ) {
              storage.removeItem(key);
            }

            await database.migrationState.put({
              id: LOCALSTORAGE_MIGRATION_STATE_ID,
              status: 'in_progress',
              vaultGeneration: expectedGen,
              completedKeyHashes: Array.from(completedKeyHashSet),
              failedKeyCount: corruptKeys.length,
              repairedSoapNotesCount: existingState?.repairedSoapNotesCount || 0,
              conflictCount: painConflicts.length,
              orphanFlowsheetCount: orphanFlowsheets.length,
              updatedAt: new Date().toISOString(),
            });
          }
        } catch (err: unknown) {
          const errorReason =
            err instanceof Error ? err.message : 'Corrupt or invalid JSON payload';
          corruptKeys.push({
            key,
            errorReason,
          });
          if (!dryRun) {
            await database.migrationState.put({
              id: LOCALSTORAGE_MIGRATION_STATE_ID,
              status: 'in_progress',
              vaultGeneration: expectedGen,
              completedKeyHashes: Array.from(completedKeyHashSet),
              failedKeyCount: corruptKeys.length,
              repairedSoapNotesCount: existingState?.repairedSoapNotesCount || 0,
              conflictCount: painConflicts.length,
              orphanFlowsheetCount: orphanFlowsheets.length,
              updatedAt: new Date().toISOString(),
            });
          }
        } finally {
          // Yield to browser main thread after processing each key to prevent UI jank or freezing
          await yieldToMainThread();
        }
      }

      const finalReport: MigrationReportPayload = {
        id: reportId,
        createdAt: now,
        vaultGeneration: expectedGen,
        dryRun,
        migratedKeys,
        skippedAlreadyCompletedKeys,
        skippedNonClinicalKeys,
        countsByTable,
        painConflicts,
        orphanFlowsheets,
        corruptKeys,
      };

      if (dryRun) {
        return {
          status: 'dry_run',
          report: finalReport,
        };
      }

      // Persist encrypted migration report into `db.migrationReports` and verify by decrypt + deep-equal
      const { iv: repIv, ciphertext: repCipher, recordSalt: repSalt } =
        await encryptRecordWithMandatoryReservation(
          database,
          dek,
          'migrationReports',
          reportId,
          [],
          finalReport,
          CURRENT_RECORD_CRYPTO_VERSION,
          activeDekVersion,
          expectedGen
        );

      const reportEntity: EncryptedMigrationReportEntity = {
        id: reportId,
        createdAt: now,
        recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
        dekVersion: activeDekVersion,
        recordSalt: repSalt,
        iv: repIv,
        ciphertext: repCipher,
      };
      await database.migrationReports.put(reportEntity);
      await verifyWrittenRecordInDexie(database, dek, {
        tableName: 'migrationReports',
        id: reportId,
        parentIds: [],
        entity: reportEntity as unknown as Record<string, unknown>,
        expectedPlaintext: finalReport,
      });

      const finalStateStatus = wasInterrupted
        ? 'in_progress'
        : corruptKeys.length > 0
          ? 'failed'
          : 'completed';

      await database.migrationState.put({
        id: LOCALSTORAGE_MIGRATION_STATE_ID,
        status: finalStateStatus,
        vaultGeneration: expectedGen,
        completedKeyHashes: Array.from(completedKeyHashSet),
        failedKeyCount: corruptKeys.length,
        repairedSoapNotesCount: existingState?.repairedSoapNotesCount || 0,
        conflictCount: painConflicts.length,
        orphanFlowsheetCount: orphanFlowsheets.length,
        updatedAt: new Date().toISOString(),
      });

      return {
        status: wasInterrupted
          ? 'interrupted'
          : corruptKeys.length > 0
            ? 'partial_with_errors'
            : 'completed',
        alreadyCompleted:
          !wasInterrupted &&
          corruptKeys.length === 0 &&
          migratedKeys.length === 0 &&
          skippedAlreadyCompletedKeys.length > 0,
        report: finalReport,
      };
    });
  }

  private static async commitAndVerifyEpisodeClinical(
    store: EpisodeScopedClinicalStore,
    dek: CryptoKey,
    database: PhysioRecordDatabase
  ): Promise<EncryptedEpisodeClinicalEntity> {
    const existingEntity =
      (await database.episodeClinical.get(store.episodeId)) ||
      (await database.episodeClinical.where('episodeId').equals(store.episodeId).first());

    if (existingEntity) {
      const existingDecrypted = await decryptRecordPayload<EpisodeScopedClinicalStore>(
        dek,
        'episodeClinical',
        existingEntity.id,
        [existingEntity.episodeId],
        existingEntity.iv,
        existingEntity.ciphertext,
        existingEntity.recordCryptoVersion || CURRENT_RECORD_CRYPTO_VERSION,
        existingEntity.dekVersion || CURRENT_DEK_VERSION,
        existingEntity.recordSalt
      );
      assertAppendOnlySnapshots(
        existingDecrypted.snapshots || [],
        store.snapshots || []
      );
    }

    const meta = await database.vaultMeta.get('auth');
    const activeDekVersion = meta?.dekVersion || CURRENT_DEK_VERSION;
    const expectedGen = getDekGeneration(dek);
    const now = new Date().toISOString();
    const payloadToEncrypt: EpisodeScopedClinicalStore = {
      ...store,
      updatedAt: now,
    };

    const { iv, ciphertext, recordSalt } = await encryptRecordWithMandatoryReservation(
      database,
      dek,
      'episodeClinical',
      store.episodeId,
      [store.episodeId],
      payloadToEncrypt,
      CURRENT_RECORD_CRYPTO_VERSION,
      activeDekVersion,
      expectedGen
    );

    const entity: EncryptedEpisodeClinicalEntity = {
      id: store.episodeId,
      episodeId: store.episodeId,
      patientId: store.patientId,
      createdAt: existingEntity?.createdAt || now,
      updatedAt: now,
      recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
      dekVersion: activeDekVersion,
      recordSalt,
      iv,
      ciphertext,
    };

    await database.transaction('rw', [database.episodeClinical], async () => {
      const inTxExisting = await database.episodeClinical.get(store.episodeId);
      if (inTxExisting) {
        const inTxDecrypted = await decryptRecordPayload<EpisodeScopedClinicalStore>(
          dek,
          'episodeClinical',
          inTxExisting.id,
          [inTxExisting.episodeId],
          inTxExisting.iv,
          inTxExisting.ciphertext,
          inTxExisting.recordCryptoVersion || CURRENT_RECORD_CRYPTO_VERSION,
          inTxExisting.dekVersion || CURRENT_DEK_VERSION,
          inTxExisting.recordSalt
        );
        assertAppendOnlySnapshots(
          inTxDecrypted.snapshots || [],
          payloadToEncrypt.snapshots || []
        );
      }
      await database.episodeClinical.put(entity);
    });

    return entity;
  }

  // ---------------------------------------------------------------------
  // Phase 1.2 & 1.3: Residual PHI Detection + Review & Resolve Actions
  // ---------------------------------------------------------------------

  /**
   * Audits `localStorage` for any remaining non-allowlisted `physiorecord_*` keys or values
   * looking like clinical/financial/operational PHI. Used by tests and migration diagnostics.
   */
  static findPhiLikeLocalStorageEntries(
    explicitStorage?: StorageLike
  ): Array<{ key: string; valuePreview: string }> {
    const storage = resolveDefaultStorage(explicitStorage);
    if (!storage) return [];

    const flagged: Array<{ key: string; valuePreview: string }> = [];
    for (const { key, rawValue } of collectPhysioRecordKeys(storage)) {
      if (ALLOWED_NON_PHI_LOCALSTORAGE_KEYS.has(key)) {
        continue;
      }
      flagged.push({
        key,
        valuePreview: rawValue.slice(0, 120),
      });
    }
    return flagged;
  }

  /**
   * Builds the list of unresolved / corrupt / orphan legacy items for the "Review & resolve" UI.
   */
  static scanUnmigratedItems(
    lastReport?: MigrationReportPayload | null,
    explicitStorage?: StorageLike
  ): UnmigratedResolutionItem[] {
    const storage = resolveDefaultStorage(explicitStorage);
    const itemsMap = new Map<string, UnmigratedResolutionItem>();

    if (lastReport?.corruptKeys) {
      for (const c of lastReport.corruptKeys) {
        const rawValue = storage?.getItem(c.key) ?? '';
        if (!rawValue) continue;
        itemsMap.set(c.key, {
          key: c.key,
          category: 'corrupt',
          errorReason: c.errorReason,
          rawValue,
          rawPreview: rawValue.slice(0, 240),
        });
      }
    }

    if (lastReport?.orphanFlowsheets) {
      for (const o of lastReport.orphanFlowsheets) {
        const rawValue = storage?.getItem(o.key) ?? '';
        if (!rawValue || itemsMap.has(o.key)) continue;
        itemsMap.set(o.key, {
          key: o.key,
          category: 'orphan_flowsheet',
          errorReason: o.reason,
          rawValue,
          rawPreview: rawValue.slice(0, 240),
        });
      }
    }

    if (storage) {
      for (const { key, rawValue } of collectPhysioRecordKeys(storage)) {
        if (ALLOWED_NON_PHI_LOCALSTORAGE_KEYS.has(key) || itemsMap.has(key)) {
          continue;
        }
        itemsMap.set(key, {
          key,
          category: 'residual_key',
          errorReason: 'Residual legacy storage key awaiting migration or cleanup',
          rawValue,
          rawPreview: rawValue.slice(0, 240),
        });
      }
    }

    return Array.from(itemsMap.values());
  }

  static async retryUnmigratedItem(
    key: string,
    dek: CryptoKey,
    database: PhysioRecordDatabase = defaultDb,
    explicitStorage?: StorageLike
  ): Promise<LocalStorageMigrationResult> {
    const storage = resolveDefaultStorage(explicitStorage);
    const result = await this.runMigration(dek, database, {
      storage: storage || undefined,
      destructive: true,
    });
    const stillCorrupt = result.report.corruptKeys.some((c) => c.key === key);
    if (stillCorrupt && storage?.getItem(key) !== null) {
      const reason =
        result.report.corruptKeys.find((c) => c.key === key)?.errorReason ||
        'Retry migration failed for this key.';
      throw new Error(reason);
    }
    return result;
  }

  static async manualImportUnmigratedItem(
    key: string,
    editedRawValue: string,
    dek: CryptoKey,
    database: PhysioRecordDatabase = defaultDb,
    explicitStorage?: StorageLike
  ): Promise<LocalStorageMigrationResult> {
    const storage = resolveDefaultStorage(explicitStorage);
    if (!storage || typeof storage.setItem !== 'function') {
      throw new Error('LocalStorage write interface unavailable.');
    }
    storage.setItem(key, editedRawValue);
    return await this.retryUnmigratedItem(key, dek, database, storage);
  }

  static discardUnmigratedItem(key: string, explicitStorage?: StorageLike): void {
    const storage = resolveDefaultStorage(explicitStorage);
    if (storage && typeof storage.removeItem === 'function') {
      storage.removeItem(key);
    }
  }
}
