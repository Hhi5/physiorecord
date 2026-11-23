// =======================================================================
// PhysioRecord — Encrypted Clinic Operations Service (Single-Writer Facade)
// Local-first single-record Dexie persistence + optimistic concurrency +
// PBKDF2 Admin PIN + SHA-256 hash-chained audit logs (Zero PHI in localStorage)
// =======================================================================

import { db as defaultDb, type PhysioRecordDatabase } from '../db/db';
import {
  CURRENT_DEK_VERSION,
  CURRENT_RECORD_CRYPTO_VERSION,
  decryptRecordPayload,
  encryptRecordWithMandatoryReservation,
} from '../crypto/vault';
import {
  registerSessionFinalizedListener,
  type SessionFinalizedEventPayload,
} from './sessionService';
import { localDate } from '../utils/date';
import { broadcastVaultEvent } from '../utils/vaultEvents';
import { recordSafeNonFatalWarning } from '../utils/safeDevDiagnostics';
import { DEFAULT_CURRENCY_CODE } from '../utils/currencies';
import { OptimisticConcurrencyError } from '../types/clinical';
import type { CustomWidgetDefinition } from '../types/clinicalWidgets';
import type {
  AppointmentConflictResult,
  AppointmentStatus,
  AuditChainVerificationResult,
  AuditLogEntry,
  BackupStateMetadata,
  CancellationNoShowStats,
  CashCloseZReportRecord,
  ClinicAppointment,
  ClinicExpenseIQD,
  ClinicProfileData,
  ClinicServiceItem,
  ClinicStaffMember,
  ClinicWorkspaceMode,
  ClinicalAssessmentSnapshot,
  ClosedDateRangeEntry,
  ConsentTemplateId,
  ContentPackDefinition,
  DailyAuditDigest,
  EncryptedAttachmentRecord,
  EpisodeScopedClinicalStore,
  FinancialInvoiceIQD,
  FinancialSequencesData,
  FinishUndoSnapshot,
  InvoiceInstallmentItem,
  IraqiPaymentMethod,
  ModuleFlagsSettings,
  MonthlyFinanceSummary,
  MrnRegistryData,
  NoteTemplateSnippet,
  OnboardingStateSettings,
  PatientConsentRecord,
  PinRateLimitState,
  PracticeLocationItem,
  PostDischargeFollowUpRecord,
  QuickSoapChip,
  RecycleBinEntry,
  RecycleBinItemType,
  RecurringExpenseTemplate,
  RecurringPatientSchedule,
  ReferringDoctorEntry,
  RegionalExamPresetDefinition,
  SecurityConfigSettings,
  SessionFlowsheetData,
  SmartMemorySettings,
  VitalsAlertThresholds,
  WaitingListEntry,
  WaitlistMatchSuggestion,
  WeeklyBreakWindow,
  WhatsAppTemplatesConfig,
  WorkspaceModeSettings,
  WriteTelemetryStats,
} from '../types/clinicManagement';

import {
  CLINIC_RECYCLE_BIN_RETENTION_DAYS,
  CLINIC_STAFF_ROSTER,
  DEFAULT_PRACTICE_LOCATIONS,
  DEFAULT_QUICK_SOAP_CHIPS,
  DEFAULT_RECURRING_EXPENSE_TEMPLATES,
  DEFAULT_VITALS_THRESHOLDS,
  DEFAULT_WEEKLY_BREAKS,
  PT_EXERCISE_CATALOG,
  ROLE_PERMISSIONS,
  formatIQD,
  setEpisodeClinicalMutationTestHook,
  type ColdStoreName,
} from './operations/operationsConstants';
import {
  createDefaultCache,
  type BatchEncryptedWriteItem,
  type OperationsMemoryCache,
  type OperationsRuntime,
  type OperationsTableName,
} from './operations/operationsTypes';
import {
  ensureColdStoreLoadedOps,
  ensurePatientColdStoresLoadedOps,
  hydrateEncryptedCacheOps,
} from './operations/vaultHydrationOps';
import {
  appendAuditLogAsyncOps,
  appendAuditLogOps,
  buildDailyAuditDigestOps,
  getActiveStaffOps,
  getAdminPinStatusOps,
  getAuditLogsOps,
  getStaffRosterOps,
  isAdminPinConfiguredOps,
  requiresFirstRunAdminPinSetupOps,
  saveStaffRosterOps,
  setActiveStaffOps,
  setAdminPinOps,
  verifyAdminPinOps,
  verifyAuditChainOps,
} from './operations/staffRbacOps';
import {
  assertAppendOnlySnapshots,
  deleteAttachmentAsyncOps,
  deleteCustomWidgetAsyncOps,
  deleteNoteTemplateAsyncOps,
  getAllEpisodeClinicalStoresOps,
  getAllNoteTemplatesOps,
  getAttachmentsForPatientOps,
  getConsentsForPatientOps,
  getCustomNoteTemplatesOps,
  getCustomWidgetsOps,
  getEpisodeClinicalStoreEncryptedOps,
  getEpisodeClinicalStoreOps,
  getLatestEpisodeFlowsheetOps,
  getPatientMedicationsOps,
  getSessionFlowsheetOps,
  getTotalAttachmentsBytesOps,
  importContentPackAsyncOps,
  recordEpisodeSnapshotOps,
  revokePatientConsentAsyncOps,
  saveAttachmentAsyncOps,
  saveCustomWidgetAsyncOps,
  saveEpisodeClinicalStoreEncryptedOps,
  saveEpisodeClinicalStoreOps,
  saveNoteTemplateAsyncOps,
  savePatientConsentAsyncOps,
  savePatientMedicationsOps,
  saveSessionFlowsheetOps,
} from './operations/clinicalRecordsOps';
import {
  clearSessionTimerSecondsOps,
  configureSoloModeAsyncOps,
  configureTeamModeAsyncOps,
  confirmModalitySafetyReviewOps,
  deleteCustomExamPresetOps,
  deleteReferringDoctorOps,
  getBackupMetaOps,
  getClinicProfileOps,
  getClosedDateRangesOps,
  getCustomExamPresetsOps,
  getModalitySafetyReviewStatusOps,
  getModuleFlagsOps,
  getMrnRegistryOps,
  getOnboardingStateOps,
  getPostDischargeFollowUpsOps,
  getPracticeLocationsOps,
  getQuickSoapChipsOps,
  getReEvalNudgeConfigOps,
  getReceptionPrivacyBlurOps,
  getRecycleBinItemsOps,
  getRecurringExpenseTemplatesOps,
  getReferringDoctorsOps,
  getSecurityConfigOps,
  getSessionTimerSecondsOps,
  getSmartMemoryOps,
  getVitalsThresholdsOps,
  getWeeklyBreaksOps,
  getWhatsAppTemplatesOps,
  getWorkspaceModeOps,
  getWriteTelemetryOps,
  importCustomExamPresetsOps,
  moveRecordToRecycleBinOps,
  permanentlyDeleteRecycleBinItemOps,
  purgeExpiredRecycleBinItemsOps,
  recordPatientVisitMemoryOps,
  recordPostDischargeFollowUpOps,
  resetWhatsAppTemplatesAsyncOps,
  restoreRecycleBinItemOps,
  saveClinicProfileAsyncOps,
  saveClinicServicesAsyncOps,
  saveClosedDateRangesOps,
  saveCustomExamPresetOps,
  saveMrnRegistryAsyncOps,
  saveMrnRegistrySyncOps,
  savePracticeLocationsOps,
  saveQuickSoapChipsAsyncOps,
  saveRecurringExpenseTemplatesOps,
  saveReferringDoctorsOps,
  saveSecurityConfigAsyncOps,
  saveSessionTimerSecondsOps,
  saveWeeklyBreaksOps,
  saveWhatsAppTemplatesAsyncOps,
  setCustomWidgetStudioEnabledOps,
  setExerciseLibraryVisibleOps,
  setModalitySafetyCheckEnabledOps,
  setModuleFlagOps,
  setModuleFlagsAsyncOps,
  setReEvalNudgeConfigOps,
  setReceptionPrivacyBlurOps,
  setRetentionInactiveDaysThresholdOps,
  setSmartGoalsGasEnabledOps,
  setVitalsThresholdsOps,
  switchWorkspaceModeAsyncOps,
  togglePinnedPatientOps,
  updateBackupMetaAsyncOps,
  updateOnboardingStateAsyncOps,
  updateSmartMemoryAsyncOps,
  upsertReferringDoctorOps,
  patchModuleFlagsPartialOps,
} from './operations/settingsOps';
import {
  addWaitingListEntryOps,
  deleteAppointmentOps,
  deleteRecurringScheduleOps,
  detectAppointmentConflictsOps,
  ensureRecurringAppointmentsForDateOps,
  getAppointmentsOps,
  getCancellationAndNoShowStatsOps,
  getClosedDateMatchesForDateOps,
  getRecurringSchedulesForPatientOps,
  getRecurringSchedulesOps,
  getWaitingListOps,
  getWeeklyBreakConflictsForSlotOps,
  removeWaitingListEntryOps,
  restoreAppointmentOps,
  restoreRecurringScheduleOps,
  restoreWaitingListEntryOps,
  saveAppointmentOps,
  saveRecurringScheduleOps,
  suggestWaitlistForFreedSlotOps,
  toggleRecurringScheduleActiveOps,
  updateAppointmentStatusOps,
} from './operations/schedulingOps';
import {
  addExpenseIQDOps,
  adjustPackageSessionAdminOps,
  allocateNextFinancialNumberOps,
  buildDailyCashZReportDraftOps,
  closeDailyCashZReportAsyncOps,
  computeFxPaymentSnapshotOps,
  createInvoiceIQDOps,
  deleteAllDemoOperationsDataOps,
  deleteExpenseIQDOps,
  emitSessionFinalizedEventOps,
  getCashClosesOps,
  getExpensesIQDOps,
  getFinanceSummaryForDateOps,
  getFinancialSequencesOps,
  getInvoicesIQDOps,
  getMonthlyFinanceSummaryOps,
  getPatientFinancialSummaryIQDOps,
  hasDemoOperationsDataOps,
  incrementPackageSessionUsedOps,
  logRecurringExpenseForMonthOps,
  recordPaymentOnInvoiceIQDOps,
  restoreExpenseIQDOps,
  restoreInvoiceIQDOps,
  reversePaymentIQDOps,
  rollbackUncommittedFinishInvoiceOps,
  saveInvoiceInstallmentPlanOps,
  seedDemoOperationsDataOps,
  undoFinishSequenceBillingAndBookingOps,
  voidInvoiceWithReasonIQDOps,
} from './operations/financeOps';

export {
  CLINIC_RECYCLE_BIN_RETENTION_DAYS,
  CLINIC_STAFF_ROSTER,
  DEFAULT_PRACTICE_LOCATIONS,
  DEFAULT_QUICK_SOAP_CHIPS,
  DEFAULT_RECURRING_EXPENSE_TEMPLATES,
  DEFAULT_VITALS_THRESHOLDS,
  DEFAULT_WEEKLY_BREAKS,
  PT_EXERCISE_CATALOG,
  ROLE_PERMISSIONS,
  assertAppendOnlySnapshots,
  formatIQD,
  setEpisodeClinicalMutationTestHook,
  type ColdStoreName,
};

// -----------------------------------------------------------------------
// ClinicOperationsService (Single-Writer Dexie Engine & Public Facade)
// -----------------------------------------------------------------------
export class ClinicOperationsService {
  private static cache: OperationsMemoryCache = createDefaultCache();
  private static activeDek: CryptoKey | null = null;
  private static activeDb: PhysioRecordDatabase = defaultDb;
  private static versionMap: Map<string, number> = new Map();
  private static pendingWrites: Set<Promise<void>> = new Set();
  private static recordWriteQueues: Map<string, Promise<void>> = new Map();
  private static auditChainQueue: Promise<void> = Promise.resolve();
  private static listeners: Set<() => void> = new Set();
  private static concurrencyListeners: Set<(err: OptimisticConcurrencyError) => void> = new Set();
  private static lastConcurrencyError: OptimisticConcurrencyError | null = null;
  private static telemetryPersistCounter = 0;
  private static loadedColdStores: Set<ColdStoreName> = new Set();
  private static coldStoreLoadPromises: Map<ColdStoreName, Promise<void>> = new Map();
  private static loadedColdPatientIds: Set<string> = new Set();
  private static loadedColdEpisodeIds: Set<string> = new Set();
  private static coldPatientLoadPromises: Map<string, Promise<void>> = new Map();

  private static readonly runtime: OperationsRuntime = {
    getCache: () => ClinicOperationsService.cache,
    setCacheAndVersionMap: (nextCache, nextVersionMap) => {
      ClinicOperationsService.cache = nextCache;
      ClinicOperationsService.versionMap = nextVersionMap;
    },
    getActiveDek: () => ClinicOperationsService.activeDek,
    getActiveDb: () => ClinicOperationsService.activeDb,
    getVersionMap: () => ClinicOperationsService.versionMap,
    beginHydration: (dek, database) => {
      ClinicOperationsService.activeDek = dek;
      ClinicOperationsService.activeDb = database;
      ClinicOperationsService.loadedColdStores.clear();
      ClinicOperationsService.coldStoreLoadPromises.clear();
      ClinicOperationsService.loadedColdPatientIds.clear();
      ClinicOperationsService.loadedColdEpisodeIds.clear();
      ClinicOperationsService.coldPatientLoadPromises.clear();
    },
    getLoadedColdStores: () => ClinicOperationsService.loadedColdStores,
    getColdStoreLoadPromises: () => ClinicOperationsService.coldStoreLoadPromises,
    getLoadedColdPatientIds: () => ClinicOperationsService.loadedColdPatientIds,
    getLoadedColdEpisodeIds: () => ClinicOperationsService.loadedColdEpisodeIds,
    getColdPatientLoadPromises: () => ClinicOperationsService.coldPatientLoadPromises,
    getAuditChainQueue: () => ClinicOperationsService.auditChainQueue,
    setAuditChainQueue: (queue) => {
      ClinicOperationsService.auditChainQueue = queue;
    },
    notifyListeners: () => ClinicOperationsService.notifyListeners(),
    trackWrite: (task) => ClinicOperationsService.trackWrite(task),
    decryptStoreEntity: (dek, targetVersionMap, tableName, id, parentIds, entity) =>
      ClinicOperationsService.decryptStoreEntity(
        dek,
        targetVersionMap,
        tableName,
        id,
        parentIds,
        entity
      ),
    putRecordEncrypted: (tableName, id, parentIds, payload, extraColumns, options) =>
      ClinicOperationsService.putRecordEncrypted(
        tableName,
        id,
        parentIds,
        payload,
        extraColumns,
        options
      ),
    putRecordsEncryptedBatch: (items) => ClinicOperationsService.putRecordsEncryptedBatch(items),
    deleteRecordEncrypted: (tableName, id) =>
      ClinicOperationsService.deleteRecordEncrypted(tableName, id),
    ensureColdStoreLoadedAsync: (storeName) =>
      ClinicOperationsService.ensureColdStoreLoadedAsync(storeName),
    getActiveStaff: () => ClinicOperationsService.getActiveStaff(),
    getStaffRoster: () => ClinicOperationsService.getStaffRoster(),
    appendAuditLog: (params) => ClinicOperationsService.appendAuditLog(params),
    appendAuditLogAsync: (params) => ClinicOperationsService.appendAuditLogAsync(params),
    isTrashRecycleBinEnabled: () => ClinicOperationsService.isTrashRecycleBinEnabled(),
    moveRecordToRecycleBin: (params) => ClinicOperationsService.moveRecordToRecycleBin(params),
    saveClinicProfileAsync: (partial) => ClinicOperationsService.saveClinicProfileAsync(partial),
    getRecurringExpenseTemplates: () => ClinicOperationsService.getRecurringExpenseTemplates(),
    saveRecurringExpenseTemplates: (templates) =>
      ClinicOperationsService.saveRecurringExpenseTemplates(templates),
    getClosedDateMatchesForDate: (dateStr) =>
      ClinicOperationsService.getClosedDateMatchesForDate(dateStr),
    getWeeklyBreakConflictsForSlot: (dateStr, startTime, durationMinutes) =>
      ClinicOperationsService.getWeeklyBreakConflictsForSlot(dateStr, startTime, durationMinutes),
    restoreAppointment: (appt) => ClinicOperationsService.restoreAppointment(appt),
    restoreWaitingListEntry: (entry) => ClinicOperationsService.restoreWaitingListEntry(entry),
    restoreExpenseIQD: (expense) => ClinicOperationsService.restoreExpenseIQD(expense),
    deleteAppointment: (id, options) => ClinicOperationsService.deleteAppointment(id, options),
    updateAppointmentStatus: (id, status, reason) =>
      ClinicOperationsService.updateAppointmentStatus(id, status, reason),
    ensureRecurringAppointmentsForDate: (targetDate) =>
      ClinicOperationsService.ensureRecurringAppointmentsForDate(targetDate),
    allocateNextFinancialNumber: (kind) =>
      allocateNextFinancialNumberOps(ClinicOperationsService.runtime, kind),
    incrementPackageSessionUsed: (invoiceId, finalizedSessionId) =>
      ClinicOperationsService.incrementPackageSessionUsed(invoiceId, finalizedSessionId),
    rollbackUncommittedFinishInvoice: (id) =>
      rollbackUncommittedFinishInvoiceOps(ClinicOperationsService.runtime, id),
    restoreInvoiceIQD: (invoice) => ClinicOperationsService.restoreInvoiceIQD(invoice),
  };

  static subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  static onConcurrencyConflict(listener: (err: OptimisticConcurrencyError) => void): () => void {
    this.concurrencyListeners.add(listener);
    return () => this.concurrencyListeners.delete(listener);
  }

  static getLastConcurrencyConflict(): OptimisticConcurrencyError | null {
    return this.lastConcurrencyError;
  }

  private static notifyListeners(): void {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch (err: unknown) {
        recordSafeNonFatalWarning('clinic-ops', 'notify_listener', err);
      }
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('physiorecord-schedule-updated'));
      window.dispatchEvent(new CustomEvent('physiorecord-staff-updated'));
    }
  }

  private static trackWrite(task: Promise<void>): Promise<void> {
    const wrapped = task.catch((err) => {
      if (err instanceof OptimisticConcurrencyError) {
        this.lastConcurrencyError = err;
        this.concurrencyListeners.forEach((fn) => fn(err));
      }
      throw err;
    });
    const settled = wrapped.then(
      () => undefined,
      () => undefined
    );
    this.pendingWrites.add(settled);
    void settled.finally(() => {
      this.pendingWrites.delete(settled);
    });
    return wrapped;
  }

  static async flushPendingWrites(): Promise<void> {
    await this.auditChainQueue;
    const tasks = Array.from(this.pendingWrites);
    if (tasks.length > 0) {
      await Promise.allSettled(tasks);
    }
  }

  static isCacheHydrated(): boolean {
    return this.cache.hydrated;
  }

  static isColdStoreLoaded(storeName: ColdStoreName): boolean {
    return this.loadedColdStores.has(storeName);
  }

  static isPatientColdStoresLoaded(patientId: string): boolean {
    return (
      this.loadedColdPatientIds.has(patientId) ||
      (this.loadedColdStores.has('attachments') &&
        this.loadedColdStores.has('consents') &&
        this.loadedColdStores.has('episodeClinical') &&
        this.loadedColdStores.has('patientMedications'))
    );
  }

  static clearInMemoryCache(): void {
    this.activeDek = null;
    this.activeDb = defaultDb;
    this.versionMap.clear();
    this.cache = createDefaultCache();
    this.lastConcurrencyError = null;
    this.loadedColdStores.clear();
    this.coldStoreLoadPromises.clear();
    this.loadedColdPatientIds.clear();
    this.loadedColdEpisodeIds.clear();
    this.coldPatientLoadPromises.clear();
    this.recordWriteQueues.clear();
    this.notifyListeners();
  }

  private static async decryptStoreEntity<T>(
    dek: CryptoKey,
    targetVersionMap: Map<string, number>,
    tableName: string,
    id: string,
    parentIds: string[],
    entity: {
      iv: Uint8Array;
      ciphertext: Uint8Array;
      recordCryptoVersion?: number;
      dekVersion?: number;
      recordSalt?: Uint8Array;
      version?: number;
    }
  ): Promise<T | null> {
    try {
      const val = await decryptRecordPayload<T>(
        dek,
        tableName,
        id,
        parentIds,
        entity.iv,
        entity.ciphertext,
        entity.recordCryptoVersion || CURRENT_RECORD_CRYPTO_VERSION,
        entity.dekVersion || CURRENT_DEK_VERSION,
        entity.recordSalt
      );
      targetVersionMap.set(`${tableName}:${id}`, entity.version ?? 1);
      return val;
    } catch (err: unknown) {
      recordSafeNonFatalWarning('clinic-ops', 'decrypt_store_entity', err, { tableName });
      return null;
    }
  }

  static async hydrateEncryptedCache(
    dek: CryptoKey,
    database: PhysioRecordDatabase = defaultDb,
    options?: { lazyHeavyStores?: boolean }
  ): Promise<void> {
    return hydrateEncryptedCacheOps(this.runtime, dek, database, options);
  }

  static async ensureColdStoreLoadedAsync(storeName: ColdStoreName): Promise<void> {
    return ensureColdStoreLoadedOps(this.runtime, storeName);
  }

  static async ensurePatientColdStoresLoadedAsync(
    patientId: string,
    episodeIds: string[] = []
  ): Promise<void> {
    return ensurePatientColdStoresLoadedOps(this.runtime, patientId, episodeIds, (pid) =>
      this.isPatientColdStoresLoaded(pid)
    );
  }

  // ---------------------------------------------------------------------
  // Single-Record Encrypted Dexie Writer with Optimistic Concurrency (1.4)
  // ---------------------------------------------------------------------
  private static recordTelemetryBumpInMemory(): void {
    const today = localDate();
    const wt = this.cache.writeTelemetry;
    if (wt.dayKey !== today) {
      wt.averageDailyWrites = Math.round(((wt.averageDailyWrites || 0) * 6 + wt.writesToday) / 7);
      wt.writesToday = 1;
      wt.dayKey = today;
    } else {
      wt.writesToday += 1;
    }
    wt.totalWrites += 1;
    wt.updatedAt = new Date().toISOString();
    this.telemetryPersistCounter += 1;
  }

  private static enqueueRecordWrite(key: string, fn: () => Promise<void>): Promise<void> {
    const previous = this.recordWriteQueues.get(key) ?? Promise.resolve();
    const run = previous.then(fn, fn);
    const cleanup = run.then(
      () => undefined,
      () => undefined
    );
    this.recordWriteQueues.set(key, cleanup);
    void cleanup.finally(() => {
      if (this.recordWriteQueues.get(key) === cleanup) {
        this.recordWriteQueues.delete(key);
      }
    });
    return run;
  }

  private static async putRecordEncrypted(
    tableName: OperationsTableName,
    id: string,
    parentIds: string[],
    payload: unknown,
    extraColumns: Record<string, unknown> = {},
    options: { skipBroadcast?: boolean; skipConcurrencyCheck?: boolean } = {}
  ): Promise<void> {
    const versionKey = `${tableName}:${id}`;
    return this.enqueueRecordWrite(versionKey, async () => {
      if (!this.activeDek) return;
      const dek = this.activeDek;
      const database = this.activeDb;
      const now = new Date().toISOString();
    const meta = await database.vaultMeta.get('auth');
    const activeDekVersion = meta?.dekVersion || CURRENT_DEK_VERSION;

    const { iv, ciphertext, recordSalt } = await encryptRecordWithMandatoryReservation(
      database,
      dek,
      tableName,
      id,
      parentIds,
      payload,
      CURRENT_RECORD_CRYPTO_VERSION,
      activeDekVersion
    );

    const versionKey = `${tableName}:${id}`;
    const expectedVersion = this.versionMap.get(versionKey);
    const tableRef = database.table(tableName);

    await database.transaction('rw', [tableRef, database.vaultMeta], async () => {
      const existing = (await tableRef.get(id)) as
        | { version?: number; createdAt?: string; updatedAt?: string }
        | undefined;
      if (
        !options.skipConcurrencyCheck &&
        existing &&
        expectedVersion !== undefined &&
        (existing.version ?? 1) !== expectedVersion
      ) {
        throw new OptimisticConcurrencyError(
          `تعارض تحديث متزامن للسجل (${tableName}/${id}): متوقع v${expectedVersion} والحالي v${existing.version ?? 1}.`
        );
      }

      const nextVersion = (existing?.version ?? expectedVersion ?? 0) + 1;
      const entity = {
        id,
        createdAt: existing?.createdAt || now,
        ...extraColumns,
        updatedAt: now,
        version: nextVersion,
        recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
        dekVersion: activeDekVersion,
        recordSalt,
        iv,
        ciphertext,
      };
      await tableRef.put(entity);
      this.versionMap.set(versionKey, nextVersion);
    });

    if (tableName !== 'clinicSettings' || id !== 'write_telemetry') {
      this.recordTelemetryBumpInMemory();
      if (this.telemetryPersistCounter >= 10) {
        this.telemetryPersistCounter = 0;
        void this.putRecordEncrypted(
          'clinicSettings',
          'write_telemetry',
          [],
          this.cache.writeTelemetry,
          {},
          { skipBroadcast: true, skipConcurrencyCheck: true }
        ).catch(() => undefined);
      }
    }

    if (!options.skipBroadcast) {
      broadcastVaultEvent({ type: 'OPERATIONS_UPDATED' });
    }
    });
  }

  private static async putRecordsEncryptedBatch(items: BatchEncryptedWriteItem[]): Promise<void> {
    if (!this.activeDek || items.length === 0) return;
    const dek = this.activeDek;
    const database = this.activeDb;
    const now = new Date().toISOString();
    const meta = await database.vaultMeta.get('auth');
    const activeDekVersion = meta?.dekVersion || CURRENT_DEK_VERSION;

    const prepared = await Promise.all(
      items.map(async (item) => {
        const encrypted = await encryptRecordWithMandatoryReservation(
          database,
          dek,
          item.tableName,
          item.id,
          item.parentIds,
          item.payload,
          CURRENT_RECORD_CRYPTO_VERSION,
          activeDekVersion
        );
        return { item, encrypted };
      })
    );

    const uniqueTables = Array.from(new Set(items.map((i) => database.table(i.tableName))));

    await database.transaction('rw', [...uniqueTables, database.vaultMeta], async () => {
      for (const { item, encrypted } of prepared) {
        const tableRef = database.table(item.tableName);
        const existing = (await tableRef.get(item.id)) as
          | { version?: number; createdAt?: string }
          | undefined;
        const versionKey = `${item.tableName}:${item.id}`;
        const expectedVersion = this.versionMap.get(versionKey);
        const nextVersion = (existing?.version ?? expectedVersion ?? 0) + 1;
        await tableRef.put({
          id: item.id,
          createdAt: existing?.createdAt || now,
          ...(item.extraColumns || {}),
          updatedAt: now,
          version: nextVersion,
          recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
          dekVersion: activeDekVersion,
          recordSalt: encrypted.recordSalt,
          iv: encrypted.iv,
          ciphertext: encrypted.ciphertext,
        });
        this.versionMap.set(versionKey, nextVersion);
      }
    });

    broadcastVaultEvent({ type: 'OPERATIONS_UPDATED' });
  }

  private static async deleteRecordEncrypted(
    tableName: OperationsTableName,
    id: string
  ): Promise<void> {
    const versionKey = `${tableName}:${id}`;
    return this.enqueueRecordWrite(versionKey, async () => {
      if (!this.activeDek) return;
      const database = this.activeDb;
      const tableRef = database.table(tableName);
      await database.transaction('rw', [tableRef], async () => {
        await tableRef.delete(id);
      });
      this.versionMap.delete(versionKey);
      broadcastVaultEvent({ type: 'OPERATIONS_UPDATED' });
    });
  }

  // ---------------------------------------------------------------------
  // Admin PIN Security
  // ---------------------------------------------------------------------
  static isAdminPinConfigured(): boolean {
    return isAdminPinConfiguredOps(this.runtime);
  }

  static requiresFirstRunAdminPinSetup(): boolean {
    return requiresFirstRunAdminPinSetupOps(this.runtime);
  }

  static getAdminPinStatus(): {
    isConfigured: boolean;
    requiresFirstRunReset: boolean;
    rateLimit: PinRateLimitState;
    remainingLockSeconds: number;
  } {
    return getAdminPinStatusOps(this.runtime);
  }

  static async setAdminPinAsync(pin: string): Promise<void> {
    return setAdminPinOps(this.runtime, pin);
  }

  static async verifyAdminPinAsync(pinAttempt: string): Promise<{
    ok: boolean;
    rateLimited: boolean;
    remainingSeconds: number;
    requiresSetup: boolean;
  }> {
    return verifyAdminPinOps(this.runtime, pinAttempt);
  }

  // ---------------------------------------------------------------------
  // Module Flags, Clinic Profile, Security Config, MRN, Backup, Telemetry
  // ---------------------------------------------------------------------
  static getReceptionPrivacyBlur(): boolean {
    return getReceptionPrivacyBlurOps(this.runtime);
  }

  static setReceptionPrivacyBlur(enabled: boolean): void {
    setReceptionPrivacyBlurOps(this.runtime, enabled);
  }

  static getModuleFlags(): ModuleFlagsSettings {
    return getModuleFlagsOps(this.runtime);
  }

  static async setModuleFlagsAsync(partial: Partial<ModuleFlagsSettings>): Promise<ModuleFlagsSettings> {
    return setModuleFlagsAsyncOps(this.runtime, partial);
  }

  static isExerciseLibraryVisible(): boolean {
    return this.cache.moduleFlags.showHepLibrary;
  }

  static setExerciseLibraryVisible(visible: boolean): void {
    setExerciseLibraryVisibleOps(this.runtime, visible);
  }

  static isCustomWidgetStudioEnabled(): boolean {
    return this.cache.moduleFlags.enableCustomWidgetStudio;
  }

  static setCustomWidgetStudioEnabled(enabled: boolean): void {
    setCustomWidgetStudioEnabledOps(this.runtime, enabled);
  }

  static isSmartGoalsGasEnabled(): boolean {
    return Boolean(this.cache.moduleFlags.enableSmartGoalsGas);
  }

  static setSmartGoalsGasEnabled(enabled: boolean): void {
    setSmartGoalsGasEnabledOps(this.runtime, enabled);
  }

  static isConsentModuleEnabled(): boolean {
    return Boolean(this.cache.moduleFlags.enableConsentModule);
  }

  static setConsentModuleEnabled(enabled: boolean): void {
    setModuleFlagOps(this.runtime, 'enableConsentModule', enabled);
  }

  static isAttachmentsModuleEnabled(): boolean {
    return Boolean(this.cache.moduleFlags.enableAttachmentsModule);
  }

  static setAttachmentsModuleEnabled(enabled: boolean): void {
    setModuleFlagOps(this.runtime, 'enableAttachmentsModule', enabled);
  }

  static isVoiceDictationModuleEnabled(): boolean {
    return Boolean(this.cache.moduleFlags.enableVoiceDictationModule);
  }

  static setVoiceDictationModuleEnabled(enabled: boolean): void {
    setModuleFlagOps(this.runtime, 'enableVoiceDictationModule', enabled);
  }

  static isCloudSpeechFallbackOptIn(): boolean {
    return Boolean(this.cache.moduleFlags.allowCloudSpeechFallbackOptIn);
  }

  static setCloudSpeechFallbackOptIn(enabled: boolean): void {
    setModuleFlagOps(this.runtime, 'allowCloudSpeechFallbackOptIn', enabled);
  }

  static isTemplatesModuleEnabled(): boolean {
    return Boolean(this.cache.moduleFlags.enableTemplatesModule);
  }

  static setTemplatesModuleEnabled(enabled: boolean): void {
    setModuleFlagOps(this.runtime, 'enableTemplatesModule', enabled);
  }

  static isAnalyticsModuleEnabled(): boolean {
    return Boolean(this.cache.moduleFlags.enableAnalyticsModule);
  }

  static setAnalyticsModuleEnabled(enabled: boolean): void {
    setModuleFlagOps(this.runtime, 'enableAnalyticsModule', enabled);
  }

  static isKioskModuleEnabled(): boolean {
    return Boolean(this.cache.moduleFlags.enableKioskModule);
  }

  static setKioskModuleEnabled(enabled: boolean): void {
    setModuleFlagOps(this.runtime, 'enableKioskModule', enabled);
  }

  static isProblemListGoalsEnabled(): boolean {
    return this.cache.moduleFlags.enableProblemListGoals ?? true;
  }

  static setProblemListGoalsEnabled(enabled: boolean): void {
    setModuleFlagOps(this.runtime, 'enableProblemListGoals', enabled);
  }

  static isReEvalNudgesEnabled(): boolean {
    return Boolean(this.cache.moduleFlags.enableReEvalNudges);
  }

  static setReEvalNudgesEnabled(enabled: boolean): void {
    setModuleFlagOps(this.runtime, 'enableReEvalNudges', enabled);
  }

  static getReEvalNudgeConfig(): { afterSessions: number; afterDays: number } {
    return getReEvalNudgeConfigOps(this.runtime);
  }

  static setReEvalNudgeConfig(afterSessions: number, afterDays: number): void {
    setReEvalNudgeConfigOps(this.runtime, afterSessions, afterDays);
  }

  static isNoteCompletenessCheckEnabled(): boolean {
    return this.cache.moduleFlags.enableNoteCompletenessCheck ?? true;
  }

  static setNoteCompletenessCheckEnabled(enabled: boolean): void {
    setModuleFlagOps(this.runtime, 'enableNoteCompletenessCheck', enabled);
  }

  static isPerformanceTestLibraryEnabled(): boolean {
    return this.cache.moduleFlags.enablePerformanceTestLibrary ?? true;
  }

  static setPerformanceTestLibraryEnabled(enabled: boolean): void {
    setModuleFlagOps(this.runtime, 'enablePerformanceTestLibrary', enabled);
  }

  static getModalitySafetyReviewStatus(): {
    enabled: boolean;
    reviewed: boolean;
    reviewedBy?: string;
    reviewedAt?: string;
  } {
    return getModalitySafetyReviewStatusOps(this.runtime);
  }

  static isModalitySafetyCheckEnabled(): boolean {
    return getModalitySafetyReviewStatusOps(this.runtime).enabled;
  }

  static confirmModalitySafetyReview(reviewerName: string, enableNow = true): void {
    confirmModalitySafetyReviewOps(this.runtime, reviewerName, enableNow);
  }

  static setModalitySafetyCheckEnabled(enabled: boolean): void {
    setModalitySafetyCheckEnabledOps(this.runtime, enabled);
  }

  static isVitalsModuleEnabled(): boolean {
    return this.cache.moduleFlags.enableVitalsModule ?? true;
  }

  static setVitalsModuleEnabled(enabled: boolean): void {
    setModuleFlagOps(this.runtime, 'enableVitalsModule', enabled);
  }

  static getVitalsThresholds(): VitalsAlertThresholds {
    return getVitalsThresholdsOps(this.runtime);
  }

  static setVitalsThresholds(thresholds: VitalsAlertThresholds): void {
    setVitalsThresholdsOps(this.runtime, thresholds);
  }

  static isPediatricSafeguardsEnabled(): boolean {
    return this.cache.moduleFlags.enablePediatricSafeguards ?? true;
  }

  static setPediatricSafeguardsEnabled(enabled: boolean): void {
    setModuleFlagOps(this.runtime, 'enablePediatricSafeguards', enabled);
  }

  static isPediatricGeometricPainIconsEnabled(): boolean {
    return this.cache.moduleFlags.enablePediatricGeometricPainIcons ?? true;
  }

  static setPediatricGeometricPainIconsEnabled(enabled: boolean): void {
    setModuleFlagOps(this.runtime, 'enablePediatricGeometricPainIcons', enabled);
  }

  static getCustomExamPresets(): RegionalExamPresetDefinition[] {
    return getCustomExamPresetsOps(this.runtime);
  }

  static saveCustomExamPreset(preset: RegionalExamPresetDefinition): void {
    saveCustomExamPresetOps(this.runtime, preset);
  }

  static deleteCustomExamPreset(presetId: string): void {
    deleteCustomExamPresetOps(this.runtime, presetId);
  }

  static importCustomExamPresets(presets: RegionalExamPresetDefinition[]): number {
    return importCustomExamPresetsOps(this.runtime, presets);
  }

  static isHomeVisitsEnabled(): boolean {
    return this.cache.moduleFlags.enableHomeVisits ?? true;
  }

  static setHomeVisitsEnabled(enabled: boolean): void {
    setModuleFlagOps(this.runtime, 'enableHomeVisits', enabled);
  }

  static isPracticeLocationsEnabled(): boolean {
    return this.cache.moduleFlags.enablePracticeLocations ?? true;
  }

  static setPracticeLocationsEnabled(enabled: boolean): void {
    setModuleFlagOps(this.runtime, 'enablePracticeLocations', enabled);
  }

  static isClosedDaysBreaksEnabled(): boolean {
    return this.cache.moduleFlags.enableClosedDaysBreaks ?? true;
  }

  static setClosedDaysBreaksEnabled(enabled: boolean): void {
    setModuleFlagOps(this.runtime, 'enableClosedDaysBreaks', enabled);
  }

  static isHijriDateDisplayEnabled(): boolean {
    return this.cache.moduleFlags.enableHijriDateDisplay ?? false;
  }

  static setHijriDateDisplayEnabled(enabled: boolean): void {
    setModuleFlagOps(this.runtime, 'enableHijriDateDisplay', enabled);
  }

  static isInstallmentPlansEnabled(): boolean {
    return this.cache.moduleFlags.enableInstallmentPlans ?? true;
  }

  static setInstallmentPlansEnabled(enabled: boolean): void {
    setModuleFlagOps(this.runtime, 'enableInstallmentPlans', enabled);
  }

  static isRecurringExpensesEnabled(): boolean {
    return this.cache.moduleFlags.enableRecurringExpenses ?? true;
  }

  static setRecurringExpensesEnabled(enabled: boolean): void {
    setModuleFlagOps(this.runtime, 'enableRecurringExpenses', enabled);
  }

  static isReferralsModuleEnabled(): boolean {
    return this.cache.moduleFlags.enableReferralsModule ?? true;
  }

  static setReferralsModuleEnabled(enabled: boolean): void {
    setModuleFlagOps(this.runtime, 'enableReferralsModule', enabled);
  }

  static isRetentionListsEnabled(): boolean {
    return this.cache.moduleFlags.enableRetentionLists ?? true;
  }

  static setRetentionListsEnabled(enabled: boolean): void {
    setModuleFlagOps(this.runtime, 'enableRetentionLists', enabled);
  }

  static getRetentionInactiveDaysThreshold(): number {
    return this.cache.moduleFlags.retentionInactiveDaysThreshold ?? 14;
  }

  static setRetentionInactiveDaysThreshold(days: number): void {
    setRetentionInactiveDaysThresholdOps(this.runtime, days);
  }

  static isImportWizardEnabled(): boolean {
    return this.cache.moduleFlags.enableImportWizard ?? true;
  }

  static setImportWizardEnabled(enabled: boolean): void {
    setModuleFlagOps(this.runtime, 'enableImportWizard', enabled);
  }

  static isTrashRecycleBinEnabled(): boolean {
    return this.cache.moduleFlags.enableTrashRecycleBin ?? true;
  }

  static setTrashRecycleBinEnabled(enabled: boolean): void {
    setModuleFlagOps(this.runtime, 'enableTrashRecycleBin', enabled);
  }

  static isDataHealthScreenEnabled(): boolean {
    return this.cache.moduleFlags.enableDataHealthScreen ?? true;
  }

  static setDataHealthScreenEnabled(enabled: boolean): void {
    setModuleFlagOps(this.runtime, 'enableDataHealthScreen', enabled);
  }

  static isBilingualTerminologyGlossaryEnabled(): boolean {
    return this.cache.moduleFlags.enableBilingualTerminologyGlossary ?? true;
  }

  static setBilingualTerminologyGlossaryEnabled(enabled: boolean): void {
    setModuleFlagOps(this.runtime, 'enableBilingualTerminologyGlossary', enabled);
  }

  static isWebShareInteropEnabled(): boolean {
    return this.cache.moduleFlags.enableWebShareInterop ?? true;
  }

  static setWebShareInteropEnabled(enabled: boolean): void {
    setModuleFlagOps(this.runtime, 'enableWebShareInterop', enabled);
  }

  static isIcsCalendarExportEnabled(): boolean {
    return this.cache.moduleFlags.enableIcsCalendarExport ?? true;
  }

  static setIcsCalendarExportEnabled(enabled: boolean): void {
    setModuleFlagOps(this.runtime, 'enableIcsCalendarExport', enabled);
  }

  static isScheduleVisitCardPrintEnabled(): boolean {
    return this.cache.moduleFlags.enableScheduleVisitCardPrint ?? true;
  }

  static setScheduleVisitCardPrintEnabled(enabled: boolean): void {
    setModuleFlagOps(this.runtime, 'enableScheduleVisitCardPrint', enabled);
  }

  static isPhotoMeasurementToolsEnabled(): boolean {
    return this.cache.moduleFlags.enablePhotoMeasurementTools ?? true;
  }

  static setPhotoMeasurementToolsEnabled(enabled: boolean): void {
    setModuleFlagOps(this.runtime, 'enablePhotoMeasurementTools', enabled);
  }

  static getSettingsViewMode(): 'simple' | 'advanced' {
    return this.cache.moduleFlags.settingsViewMode === 'simple' ? 'simple' : 'advanced';
  }

  static setSettingsViewMode(mode: 'simple' | 'advanced'): void {
    patchModuleFlagsPartialOps(this.runtime, { settingsViewMode: mode });
  }

  static isPublicDemoModeEnabled(): boolean {
    return Boolean(this.cache.moduleFlags.publicDemoModeEnabled);
  }

  static setPublicDemoModeEnabled(enabled: boolean): void {
    patchModuleFlagsPartialOps(this.runtime, { publicDemoModeEnabled: enabled });
  }

  static isOnboardingChecklistDismissed(): boolean {
    return Boolean(this.cache.onboardingState.checklistDismissed);
  }

  static async setOnboardingChecklistDismissedAsync(
    dismissed: boolean
  ): Promise<OnboardingStateSettings> {
    return updateOnboardingStateAsyncOps(this.runtime, { checklistDismissed: dismissed });
  }

  static getLastSeenChangelogVersion(): string | undefined {
    return this.cache.onboardingState.lastSeenChangelogVersion;
  }

  static async setLastSeenChangelogVersionAsync(
    version: string
  ): Promise<OnboardingStateSettings> {
    return updateOnboardingStateAsyncOps(this.runtime, { lastSeenChangelogVersion: version });
  }

  static getRecycleBinItems(nowIso?: string): RecycleBinEntry[] {
    return getRecycleBinItemsOps(this.runtime, nowIso);
  }

  static moveRecordToRecycleBin(params: {
    itemType: RecycleBinItemType;
    originalId: string;
    titleAr: string;
    titleEn: string;
    subtitleAr?: string;
    subtitleEn?: string;
    payload: ClinicAppointment | WaitingListEntry | ClinicExpenseIQD;
    nowIso?: string;
  }): RecycleBinEntry {
    return moveRecordToRecycleBinOps(this.runtime, params);
  }

  static restoreRecycleBinItem(
    trashId: string,
    nowIso?: string
  ): { restored: boolean; entry?: RecycleBinEntry } {
    return restoreRecycleBinItemOps(this.runtime, trashId, nowIso);
  }

  static permanentlyDeleteRecycleBinItem(trashId: string): RecycleBinEntry[] {
    return permanentlyDeleteRecycleBinItemOps(this.runtime, trashId);
  }

  static purgeExpiredRecycleBinItems(nowIso?: string): number {
    return purgeExpiredRecycleBinItemsOps(this.runtime, nowIso);
  }

  static getPracticeLocations(): PracticeLocationItem[] {
    return getPracticeLocationsOps(this.runtime);
  }

  static savePracticeLocations(locations: PracticeLocationItem[]): PracticeLocationItem[] {
    return savePracticeLocationsOps(this.runtime, locations);
  }

  static getWeeklyBreaks(): WeeklyBreakWindow[] {
    return getWeeklyBreaksOps(this.runtime);
  }

  static saveWeeklyBreaks(breaks: WeeklyBreakWindow[]): WeeklyBreakWindow[] {
    return saveWeeklyBreaksOps(this.runtime, breaks);
  }

  static getClosedDateRanges(): ClosedDateRangeEntry[] {
    return getClosedDateRangesOps(this.runtime);
  }

  static saveClosedDateRanges(ranges: ClosedDateRangeEntry[]): ClosedDateRangeEntry[] {
    return saveClosedDateRangesOps(this.runtime, ranges);
  }

  static getClosedDateMatchesForDate(dateStr: string): ClosedDateRangeEntry[] {
    return getClosedDateMatchesForDateOps(this.runtime, dateStr);
  }

  static getWeeklyBreakConflictsForSlot(
    dateStr: string,
    startTime: string,
    durationMinutes: number
  ): WeeklyBreakWindow[] {
    return getWeeklyBreakConflictsForSlotOps(this.runtime, dateStr, startTime, durationMinutes);
  }

  static getRecurringExpenseTemplates(): RecurringExpenseTemplate[] {
    return getRecurringExpenseTemplatesOps(this.runtime);
  }

  static saveRecurringExpenseTemplates(
    templates: RecurringExpenseTemplate[]
  ): RecurringExpenseTemplate[] {
    return saveRecurringExpenseTemplatesOps(this.runtime, templates);
  }

  static getReferringDoctors(): ReferringDoctorEntry[] {
    return getReferringDoctorsOps(this.runtime);
  }

  static saveReferringDoctors(doctors: ReferringDoctorEntry[]): ReferringDoctorEntry[] {
    return saveReferringDoctorsOps(this.runtime, doctors);
  }

  static upsertReferringDoctor(
    entry: Omit<ReferringDoctorEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): ReferringDoctorEntry[] {
    return upsertReferringDoctorOps(this.runtime, entry);
  }

  static deleteReferringDoctor(doctorId: string): ReferringDoctorEntry[] {
    return deleteReferringDoctorOps(this.runtime, doctorId);
  }

  static getPostDischargeFollowUps(): PostDischargeFollowUpRecord[] {
    return getPostDischargeFollowUpsOps(this.runtime);
  }

  static recordPostDischargeFollowUp(
    entry: Omit<PostDischargeFollowUpRecord, 'id' | 'recordedAt' | 'recordedBy'> & {
      recordedAt?: string;
    }
  ): PostDischargeFollowUpRecord[] {
    return recordPostDischargeFollowUpOps(this.runtime, entry);
  }

  // ---------------------------------------------------------------------
  // Attachments & Clinical Note Templates
  // ---------------------------------------------------------------------
  static getAttachmentsForPatient(patientId: string): EncryptedAttachmentRecord[] {
    return getAttachmentsForPatientOps(this.runtime, patientId);
  }

  static getTotalAttachmentsBytes(): number {
    return getTotalAttachmentsBytesOps(this.runtime);
  }

  static async saveAttachmentAsync(
    input: Omit<EncryptedAttachmentRecord, 'id' | 'createdAt' | 'updatedAt' | 'version'> & {
      id?: string;
    }
  ): Promise<EncryptedAttachmentRecord> {
    return saveAttachmentAsyncOps(this.runtime, input);
  }

  static async deleteAttachmentAsync(
    patientId: string,
    attachmentId: string
  ): Promise<EncryptedAttachmentRecord[]> {
    return deleteAttachmentAsyncOps(this.runtime, patientId, attachmentId);
  }

  static getAllNoteTemplates(): NoteTemplateSnippet[] {
    return getAllNoteTemplatesOps(this.runtime);
  }

  static getCustomNoteTemplates(): NoteTemplateSnippet[] {
    return getCustomNoteTemplatesOps(this.runtime);
  }

  static async saveNoteTemplateAsync(
    snippet: Omit<NoteTemplateSnippet, 'id' | 'updatedAt' | 'version'> & { id?: string }
  ): Promise<NoteTemplateSnippet> {
    return saveNoteTemplateAsyncOps(this.runtime, snippet);
  }

  static async deleteNoteTemplateAsync(id: string): Promise<void> {
    return deleteNoteTemplateAsyncOps(this.runtime, id);
  }

  static async importContentPackAsync(rawJson: string): Promise<{
    pack: ContentPackDefinition;
    importedCount: number;
  }> {
    return importContentPackAsyncOps(this.runtime, rawJson);
  }

  static getAllEpisodeClinicalStores(): EpisodeScopedClinicalStore[] {
    return getAllEpisodeClinicalStoresOps(this.runtime);
  }

  // ---------------------------------------------------------------------
  // WhatsApp Templates, Clinic Profile, Security, MRN, Backup, Telemetry
  // ---------------------------------------------------------------------
  static getWhatsAppTemplates(): WhatsAppTemplatesConfig {
    return getWhatsAppTemplatesOps(this.runtime);
  }

  static async saveWhatsAppTemplatesAsync(
    partial: Partial<Omit<WhatsAppTemplatesConfig, 'id' | 'updatedAt' | 'version'>>
  ): Promise<WhatsAppTemplatesConfig> {
    return saveWhatsAppTemplatesAsyncOps(this.runtime, partial);
  }

  static async resetWhatsAppTemplatesAsync(): Promise<WhatsAppTemplatesConfig> {
    return resetWhatsAppTemplatesAsyncOps(this.runtime);
  }

  static getClinicProfile(): ClinicProfileData {
    return getClinicProfileOps(this.runtime);
  }

  static async saveClinicProfileAsync(
    partial: Partial<Omit<ClinicProfileData, 'id' | 'updatedAt' | 'version'>>
  ): Promise<ClinicProfileData> {
    return saveClinicProfileAsyncOps(this.runtime, partial);
  }

  static getSecurityConfig(): SecurityConfigSettings {
    return getSecurityConfigOps(this.runtime);
  }

  static async saveSecurityConfigAsync(
    partial: Partial<Omit<SecurityConfigSettings, 'id' | 'updatedAt' | 'version'>>
  ): Promise<SecurityConfigSettings> {
    return saveSecurityConfigAsyncOps(this.runtime, partial);
  }

  static getMrnRegistry(): MrnRegistryData {
    return getMrnRegistryOps(this.runtime);
  }

  static async saveMrnRegistryAsync(reg: MrnRegistryData): Promise<void> {
    return saveMrnRegistryAsyncOps(this.runtime, reg);
  }

  static saveMrnRegistrySync(reg: MrnRegistryData): void {
    saveMrnRegistrySyncOps(this.runtime, reg);
  }

  static getBackupMeta(): BackupStateMetadata {
    return getBackupMetaOps(this.runtime);
  }

  static async updateBackupMetaAsync(
    partial: Partial<Omit<BackupStateMetadata, 'id' | 'updatedAt' | 'version'>>
  ): Promise<BackupStateMetadata> {
    return updateBackupMetaAsyncOps(this.runtime, partial);
  }

  static getWriteTelemetry(): WriteTelemetryStats {
    return getWriteTelemetryOps(this.runtime);
  }

  // ---------------------------------------------------------------------
  // Workspace Mode, Smart Memory, Quick SOAP & Onboarding
  // ---------------------------------------------------------------------
  static getWorkspaceMode(): WorkspaceModeSettings {
    return getWorkspaceModeOps(this.runtime);
  }

  static isSoloMode(): boolean {
    return this.cache.workspaceMode.mode === 'solo';
  }

  static requiresFirstRunModeWizard(): boolean {
    return !this.cache.workspaceMode.wizardCompleted;
  }

  static async configureSoloModeAsync(params?: {
    therapistNameAr?: string;
    therapistNameEn?: string;
    clinicNameAr?: string;
    clinicNameEn?: string;
  }): Promise<WorkspaceModeSettings> {
    return configureSoloModeAsyncOps(this.runtime, params);
  }

  static async configureTeamModeAsync(): Promise<WorkspaceModeSettings> {
    return configureTeamModeAsyncOps(this.runtime);
  }

  static async switchWorkspaceModeAsync(mode: ClinicWorkspaceMode): Promise<WorkspaceModeSettings> {
    return switchWorkspaceModeAsyncOps(this.runtime, mode);
  }

  static getSmartMemory(): SmartMemorySettings {
    return getSmartMemoryOps(this.runtime);
  }

  static async updateSmartMemoryAsync(
    partial: Partial<Omit<SmartMemorySettings, 'id' | 'updatedAt' | 'version'>>
  ): Promise<SmartMemorySettings> {
    return updateSmartMemoryAsyncOps(this.runtime, partial);
  }

  static getSessionTimerSeconds(sessionId: string): number | null {
    return getSessionTimerSecondsOps(this.runtime, sessionId);
  }

  static saveSessionTimerSeconds(sessionId: string, seconds: number): void {
    saveSessionTimerSecondsOps(this.runtime, sessionId, seconds);
  }

  static clearSessionTimerSeconds(sessionId: string): void {
    clearSessionTimerSecondsOps(this.runtime, sessionId);
  }

  static recordPatientVisitMemory(patientId: string): void {
    recordPatientVisitMemoryOps(this.runtime, patientId);
  }

  static togglePinnedPatient(patientId: string): boolean {
    return togglePinnedPatientOps(this.runtime, patientId);
  }

  static isPatientPinned(patientId: string): boolean {
    return this.cache.smartMemory.pinnedPatientIds.includes(patientId);
  }

  static getPinnedPatientIds(): string[] {
    return [...this.cache.smartMemory.pinnedPatientIds];
  }

  static getRecentPatientIds(): string[] {
    return [...this.cache.smartMemory.recentPatientIds];
  }

  static getClinicServices(): ClinicServiceItem[] {
    return [...this.cache.smartMemory.services];
  }

  static async saveClinicServicesAsync(services: ClinicServiceItem[]): Promise<ClinicServiceItem[]> {
    return saveClinicServicesAsyncOps(this.runtime, services);
  }

  static getQuickSoapChips(): QuickSoapChip[] {
    return getQuickSoapChipsOps(this.runtime);
  }

  static async saveQuickSoapChipsAsync(chips: QuickSoapChip[]): Promise<QuickSoapChip[]> {
    return saveQuickSoapChipsAsyncOps(this.runtime, chips);
  }

  static getOnboardingState(): OnboardingStateSettings {
    return getOnboardingStateOps(this.runtime);
  }

  static async dismissTipAsync(tipId: string): Promise<OnboardingStateSettings> {
    const existing = this.cache.onboardingState.dismissedTipIds;
    const nextIds = existing.includes(tipId) ? existing : [...existing, tipId];
    return updateOnboardingStateAsyncOps(this.runtime, { dismissedTipIds: nextIds });
  }

  static async setTourCompletedAsync(tourCompleted: boolean): Promise<OnboardingStateSettings> {
    return updateOnboardingStateAsyncOps(this.runtime, { tourCompleted });
  }

  static async setTipsEnabledAsync(tipsEnabled: boolean): Promise<OnboardingStateSettings> {
    return updateOnboardingStateAsyncOps(this.runtime, { tipsEnabled });
  }

  static async resetOnboardingAsync(): Promise<OnboardingStateSettings> {
    return updateOnboardingStateAsyncOps(this.runtime, {
      tourCompleted: false,
      tipsEnabled: true,
      dismissedTipIds: [],
      checklistDismissed: false,
    });
  }

  // ---------------------------------------------------------------------
  // Daily / Monthly Summaries & Cash Close Z-Reports
  // ---------------------------------------------------------------------
  static getFinanceSummaryForDate(dateKey: string) {
    return getFinanceSummaryForDateOps(this.runtime, dateKey);
  }

  static getCashCloses(): CashCloseZReportRecord[] {
    return getCashClosesOps(this.runtime);
  }

  static buildDailyCashZReportDraft(
    dateKey: string,
    primaryCurrencyCode = DEFAULT_CURRENCY_CODE,
    countedCashActual?: number,
    notes?: string
  ) {
    return buildDailyCashZReportDraftOps(
      this.runtime,
      dateKey,
      primaryCurrencyCode,
      countedCashActual,
      notes
    );
  }

  static async closeDailyCashZReportAsync(params: {
    dateKey: string;
    primaryCurrencyCode?: string;
    countedCashActual?: number;
    notes?: string;
  }): Promise<CashCloseZReportRecord> {
    return closeDailyCashZReportAsyncOps(this.runtime, params);
  }

  static getMonthlyFinanceSummary(
    monthKey: string,
    primaryCurrencyCode = DEFAULT_CURRENCY_CODE
  ): MonthlyFinanceSummary {
    return getMonthlyFinanceSummaryOps(this.runtime, monthKey, primaryCurrencyCode);
  }

  // ---------------------------------------------------------------------
  // Medications, Custom Widgets, Staff Roster & Hash-Chained Audit Log
  // ---------------------------------------------------------------------
  static getPatientMedications(patientId: string): Array<Record<string, unknown>> {
    return getPatientMedicationsOps(this.runtime, patientId);
  }

  static savePatientMedications(patientId: string, medications: Array<Record<string, unknown>>): void {
    savePatientMedicationsOps(this.runtime, patientId, medications);
  }

  static getCustomWidgets(): CustomWidgetDefinition[] {
    return getCustomWidgetsOps(this.runtime);
  }

  static async saveCustomWidgetAsync(
    candidate: unknown,
    rawJsonLength?: number
  ): Promise<CustomWidgetDefinition> {
    return saveCustomWidgetAsyncOps(this.runtime, candidate, rawJsonLength);
  }

  static async deleteCustomWidgetAsync(widgetId: string): Promise<void> {
    return deleteCustomWidgetAsyncOps(this.runtime, widgetId);
  }

  static getStaffRoster(): ClinicStaffMember[] {
    return getStaffRosterOps(this.runtime);
  }

  static saveStaffRoster(roster: ClinicStaffMember[]): void {
    saveStaffRosterOps(this.runtime, roster);
  }

  static getActiveStaff(): ClinicStaffMember {
    return getActiveStaffOps(this.runtime);
  }

  static setActiveStaff(staffId: string): ClinicStaffMember {
    return setActiveStaffOps(this.runtime, staffId);
  }

  static getAuditLogs(): AuditLogEntry[] {
    return getAuditLogsOps(this.runtime);
  }

  static appendAuditLog(params: {
    actionType: AuditLogEntry['actionType'];
    entityType: AuditLogEntry['entityType'];
    entityId: string;
    patientId?: string;
    episodeId?: string;
    summaryAr: string;
    summaryEn: string;
  }): AuditLogEntry {
    return appendAuditLogOps(this.runtime, params);
  }

  static async appendAuditLogAsync(params: {
    actionType: AuditLogEntry['actionType'];
    entityType: AuditLogEntry['entityType'];
    entityId: string;
    patientId?: string;
    episodeId?: string;
    summaryAr: string;
    summaryEn: string;
  }): Promise<AuditLogEntry> {
    return appendAuditLogAsyncOps(this.runtime, params);
  }

  static async verifyAuditChain(
    database?: PhysioRecordDatabase,
    dek?: CryptoKey
  ): Promise<AuditChainVerificationResult> {
    return verifyAuditChainOps(this.runtime, database, dek);
  }

  static async buildDailyAuditDigestAsync(dateKey: string): Promise<DailyAuditDigest> {
    return buildDailyAuditDigestOps(this.runtime, dateKey);
  }

  // ---------------------------------------------------------------------
  // Episode-Scoped Clinical Store, Snapshots & Flowsheet Compat
  // ---------------------------------------------------------------------
  static getEpisodeClinicalStore(episodeId: string, patientId: string): EpisodeScopedClinicalStore {
    return getEpisodeClinicalStoreOps(this.runtime, episodeId, patientId);
  }

  static saveEpisodeClinicalStore(store: EpisodeScopedClinicalStore): void {
    saveEpisodeClinicalStoreOps(this.runtime, store);
  }

  static async getEpisodeClinicalStoreEncrypted(
    episodeId: string,
    patientId: string,
    dek: CryptoKey,
    database: PhysioRecordDatabase = defaultDb
  ): Promise<EpisodeScopedClinicalStore> {
    return getEpisodeClinicalStoreEncryptedOps(this.runtime, episodeId, patientId, dek, database);
  }

  static async saveEpisodeClinicalStoreEncrypted(
    store: EpisodeScopedClinicalStore,
    dek: CryptoKey,
    database: PhysioRecordDatabase = defaultDb,
    expectedUpdatedAt?: string
  ) {
    return saveEpisodeClinicalStoreEncryptedOps(
      this.runtime,
      store,
      dek,
      database,
      expectedUpdatedAt
    );
  }

  static recordEpisodeSnapshot(
    episodeId: string,
    patientId: string,
    snapshotType: ClinicalAssessmentSnapshot['snapshotType'],
    customLabelAr?: string,
    customLabelEn?: string
  ): ClinicalAssessmentSnapshot {
    return recordEpisodeSnapshotOps(
      this.runtime,
      episodeId,
      patientId,
      snapshotType,
      customLabelAr,
      customLabelEn
    );
  }

  static getSessionFlowsheet(sessionId: string): SessionFlowsheetData | null {
    return getSessionFlowsheetOps(this.runtime, sessionId);
  }

  static saveSessionFlowsheet(sessionId: string, episodeId: string, data: SessionFlowsheetData): void {
    saveSessionFlowsheetOps(this.runtime, sessionId, episodeId, data);
  }

  static getLatestEpisodeFlowsheet(episodeId: string): SessionFlowsheetData | null {
    return getLatestEpisodeFlowsheetOps(this.runtime, episodeId);
  }

  // ---------------------------------------------------------------------
  // Appointments, Recurring Weekly Schedules & Waiting List
  // ---------------------------------------------------------------------
  static getAppointments(): ClinicAppointment[] {
    return getAppointmentsOps(this.runtime);
  }

  static saveAppointment(appt: Omit<ClinicAppointment, 'id'> & { id?: string }): ClinicAppointment {
    return saveAppointmentOps(this.runtime, appt);
  }

  static restoreAppointment(appt: ClinicAppointment): ClinicAppointment[] {
    return restoreAppointmentOps(this.runtime, appt);
  }

  static detectAppointmentConflicts(candidate: {
    id?: string;
    date: string;
    startTime: string;
    durationMinutes: number;
    therapistName: string;
    roomOrBed?: string;
    appointmentMode?: 'clinic' | 'home_visit';
    travelBufferBeforeMin?: number;
    travelBufferAfterMin?: number;
  }): AppointmentConflictResult {
    return detectAppointmentConflictsOps(this.runtime, candidate);
  }

  static suggestWaitlistForFreedSlot(freedAppt: {
    date: string;
    startTime: string;
    therapistName?: string;
  }): WaitlistMatchSuggestion[] {
    return suggestWaitlistForFreedSlotOps(this.runtime, freedAppt);
  }

  static getCancellationAndNoShowStats(dateFrom?: string, dateTo?: string): CancellationNoShowStats {
    return getCancellationAndNoShowStatsOps(this.runtime, dateFrom, dateTo);
  }

  static updateAppointmentStatus(
    id: string,
    status: AppointmentStatus,
    reason?: string
  ): ClinicAppointment[] {
    return updateAppointmentStatusOps(this.runtime, id, status, reason);
  }

  static deleteAppointment(
    id: string,
    options?: { bypassRecycleBin?: boolean; deletedAtIso?: string }
  ): ClinicAppointment[] {
    return deleteAppointmentOps(this.runtime, id, options);
  }

  static getRecurringSchedules(): RecurringPatientSchedule[] {
    return getRecurringSchedulesOps(this.runtime);
  }

  static getRecurringSchedulesForPatient(patientId: string): RecurringPatientSchedule[] {
    return getRecurringSchedulesForPatientOps(this.runtime, patientId);
  }

  static saveRecurringSchedule(
    input: Omit<RecurringPatientSchedule, 'id' | 'createdAt'> & { id?: string }
  ): RecurringPatientSchedule {
    return saveRecurringScheduleOps(this.runtime, input);
  }

  static toggleRecurringScheduleActive(id: string): RecurringPatientSchedule[] {
    return toggleRecurringScheduleActiveOps(this.runtime, id);
  }

  static deleteRecurringSchedule(id: string): RecurringPatientSchedule[] {
    return deleteRecurringScheduleOps(this.runtime, id);
  }

  static restoreRecurringSchedule(rule: RecurringPatientSchedule): RecurringPatientSchedule[] {
    return restoreRecurringScheduleOps(this.runtime, rule);
  }

  static ensureRecurringAppointmentsForDate(targetDate: string): ClinicAppointment[] {
    return ensureRecurringAppointmentsForDateOps(this.runtime, targetDate);
  }

  static getWaitingList(includeCompleted = false): WaitingListEntry[] {
    return getWaitingListOps(this.runtime, includeCompleted);
  }

  static addWaitingListEntry(entry: Omit<WaitingListEntry, 'id' | 'addedAt'>): WaitingListEntry[] {
    return addWaitingListEntryOps(this.runtime, entry);
  }

  static restoreWaitingListEntry(entry: WaitingListEntry): WaitingListEntry[] {
    return restoreWaitingListEntryOps(this.runtime, entry);
  }

  static removeWaitingListEntry(
    id: string,
    options?: { bypassRecycleBin?: boolean; deletedAtIso?: string }
  ): WaitingListEntry[] {
    return removeWaitingListEntryOps(this.runtime, id, options);
  }

  // ---------------------------------------------------------------------
  // Financial Ledger, Invoices, Payments, Consents, Expenses & Demo Seed
  // ---------------------------------------------------------------------
  static getFinancialSequences(): FinancialSequencesData {
    return getFinancialSequencesOps(this.runtime);
  }

  static computeFxPaymentSnapshot(params: {
    primaryCurrencyCode?: string;
    paymentCurrencyCode?: string;
    originalAmount?: number;
    primaryAmountFallback?: number;
    exchangeRateToPrimary?: number;
    maxPrimaryCap?: number;
  }) {
    return computeFxPaymentSnapshotOps(params);
  }

  static getInvoicesIQD(): FinancialInvoiceIQD[] {
    return getInvoicesIQDOps(this.runtime);
  }

  static createInvoiceIQD(params: {
    patientId: string;
    patientName: string;
    episodeId?: string;
    episodeTitle?: string;
    locationId?: string;
    travelFeeIQD?: number;
    invoiceType: FinancialInvoiceIQD['invoiceType'];
    titleAr: string;
    titleEn: string;
    totalAmountIQD: number;
    discountIQD: number;
    initialPaidIQD: number;
    paymentMethod: IraqiPaymentMethod;
    currencyCode?: string;
    paymentCurrencyCode?: string;
    originalPaidAmount?: number;
    exchangeRateToPrimary?: number;
    packageTotalSessions?: number;
    packageUsedSessions?: number;
    installmentPlan?: InvoiceInstallmentItem[];
    notes?: string;
    isDemo?: boolean;
  }): FinancialInvoiceIQD {
    return createInvoiceIQDOps(this.runtime, params);
  }

  static deleteInvoiceIQD(_id: string): FinancialInvoiceIQD[] {
    throw new Error(
      'Hard-deleting financial invoices is disabled (4.1). Use voidInvoiceWithReasonIQD(invoiceId, reason) to issue a Credit Note instead.'
    );
  }

  static voidInvoiceWithReasonIQD(invoiceId: string, reason: string): FinancialInvoiceIQD[] {
    return voidInvoiceWithReasonIQDOps(this.runtime, invoiceId, reason);
  }

  static reversePaymentIQD(invoiceId: string, paymentId: string, reason: string): FinancialInvoiceIQD[] {
    return reversePaymentIQDOps(this.runtime, invoiceId, paymentId, reason);
  }

  static restoreInvoiceIQD(invoice: FinancialInvoiceIQD): FinancialInvoiceIQD[] {
    return restoreInvoiceIQDOps(this.runtime, invoice);
  }

  static recordPaymentOnInvoiceIQD(
    invoiceId: string,
    amountIQD: number,
    method: IraqiPaymentMethod,
    notes?: string,
    fx?: {
      paymentCurrencyCode?: string;
      originalAmount?: number;
      exchangeRateToPrimary?: number;
      primaryCurrencyCode?: string;
    }
  ): FinancialInvoiceIQD[] {
    return recordPaymentOnInvoiceIQDOps(this.runtime, invoiceId, amountIQD, method, notes, fx);
  }

  static saveInvoiceInstallmentPlan(
    invoiceId: string,
    installments: InvoiceInstallmentItem[]
  ): FinancialInvoiceIQD[] {
    return saveInvoiceInstallmentPlanOps(this.runtime, invoiceId, installments);
  }

  static incrementPackageSessionUsed(
    invoiceId: string,
    finalizedSessionId?: string
  ): FinancialInvoiceIQD[] {
    return incrementPackageSessionUsedOps(this.runtime, invoiceId, finalizedSessionId);
  }

  static adjustPackageSessionAdmin(
    invoiceId: string,
    delta: 1 | -1,
    reason: string
  ): FinancialInvoiceIQD[] {
    return adjustPackageSessionAdminOps(this.runtime, invoiceId, delta, reason);
  }

  static emitSessionFinalizedEvent(
    event: SessionFinalizedEventPayload & { skipPackageDecrement?: boolean }
  ) {
    return emitSessionFinalizedEventOps(this.runtime, event);
  }

  static undoFinishSequenceBillingAndBooking(snapshot: FinishUndoSnapshot): void {
    undoFinishSequenceBillingAndBookingOps(this.runtime, snapshot);
  }

  static getPatientFinancialSummaryIQD(patientId: string, patientName?: string) {
    return getPatientFinancialSummaryIQDOps(this.runtime, patientId, patientName);
  }

  static getConsentsForPatient(patientId: string): PatientConsentRecord[] {
    return getConsentsForPatientOps(this.runtime, patientId);
  }

  static async savePatientConsentAsync(input: {
    patientId: string;
    episodeId?: string;
    templateId: ConsentTemplateId;
    templateVersion: string;
    titleAr: string;
    titleEn: string;
    bodySnapshotAr: string;
    bodySnapshotEn: string;
    signerName: string;
    signerRelation: 'patient' | 'guardian' | 'representative';
    signatureDataUrl: string;
    consentGranted: boolean;
  }): Promise<PatientConsentRecord> {
    return savePatientConsentAsyncOps(this.runtime, input);
  }

  static async revokePatientConsentAsync(
    patientId: string,
    consentId: string,
    reason: string
  ): Promise<PatientConsentRecord[]> {
    return revokePatientConsentAsyncOps(this.runtime, patientId, consentId, reason);
  }

  static getExpensesIQD(): ClinicExpenseIQD[] {
    return getExpensesIQDOps(this.runtime);
  }

  static addExpenseIQD(expense: Omit<ClinicExpenseIQD, 'id'>): ClinicExpenseIQD[] {
    return addExpenseIQDOps(this.runtime, expense);
  }

  static logRecurringExpenseForMonth(params: {
    templateId: string;
    amountIQD: number;
    date: string;
    customCategoryLabel?: string;
    paidBy?: string;
    notes?: string;
  }): ClinicExpenseIQD[] {
    return logRecurringExpenseForMonthOps(this.runtime, params);
  }

  static deleteExpenseIQD(
    id: string,
    options?: { bypassRecycleBin?: boolean; deletedAtIso?: string }
  ): ClinicExpenseIQD[] {
    return deleteExpenseIQDOps(this.runtime, id, options);
  }

  static restoreExpenseIQD(expense: ClinicExpenseIQD): ClinicExpenseIQD[] {
    return restoreExpenseIQDOps(this.runtime, expense);
  }

  static seedDemoOperationsData(): void {
    seedDemoOperationsDataOps(this.runtime);
  }

  static deleteAllDemoOperationsData(): void {
    deleteAllDemoOperationsDataOps(this.runtime, (partial) =>
      this.updateSmartMemoryAsync(partial)
    );
  }

  static hasDemoOperationsData(): boolean {
    return hasDemoOperationsDataOps(this.runtime);
  }
}

registerSessionFinalizedListener((event) => {
  ClinicOperationsService.emitSessionFinalizedEvent(event);
});
