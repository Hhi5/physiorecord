// =======================================================================
// PhysioRecord — Clinic Operations Cache Types & Runtime Adapter
// =======================================================================

import type { PhysioRecordDatabase } from '../../db/db';
import type { CustomWidgetDefinition } from '../../types/clinicalWidgets';
import type {
  AdminPinAuthRecord,
  AppointmentStatus,
  AuditLogEntry,
  BackupStateMetadata,
  CashCloseZReportRecord,
  ClinicAppointment,
  ClinicExpenseIQD,
  ClinicProfileData,
  ClinicStaffMember,
  ClosedDateRangeEntry,
  EncryptedAttachmentRecord,
  EpisodeScopedClinicalStore,
  FinancialInvoiceIQD,
  FinancialSequencesData,
  ModuleFlagsSettings,
  MrnRegistryData,
  NoteTemplateSnippet,
  OnboardingStateSettings,
  PatientConsentRecord,
  PatientMedicationPlan,
  PinRateLimitState,
  QuickSoapPreferences,
  RecycleBinEntry,
  RecycleBinItemType,
  RecurringExpenseTemplate,
  RecurringPatientSchedule,
  SecurityConfigSettings,
  SessionFlowsheetData,
  SmartMemorySettings,
  WaitingListEntry,
  WeeklyBreakWindow,
  WhatsAppTemplatesConfig,
  WorkspaceModeSettings,
  WriteTelemetryStats,
} from '../../types/clinicManagement';
import { localDate } from '../../utils/date';
import { DEFAULT_WHATSAPP_TEMPLATES } from '../../utils/whatsappTemplates';
import {
  CLINIC_STAFF_ROSTER,
  DEFAULT_QUICK_SOAP_CHIPS,
  DEFAULT_VITALS_THRESHOLDS,
  cloneDefaultBreaks,
  cloneDefaultLocations,
  cloneDefaultRecurringExpenseTemplates,
  type ColdStoreName,
} from './operationsConstants';

export type OperationsTableName =
  | 'appointments'
  | 'waitingList'
  | 'invoices'
  | 'payments'
  | 'expenses'
  | 'auditLogs'
  | 'staffState'
  | 'episodeClinical'
  | 'customWidgets'
  | 'recurringSchedules'
  | 'recurringSkippedDates'
  | 'clinicSettings'
  | 'patientMedications'
  | 'consents'
  | 'cashCloses'
  | 'attachments'
  | 'noteTemplates';

export interface OperationsMemoryCache {
  hydrated: boolean;
  staffRoster: ClinicStaffMember[];
  activeStaffId: string;
  appointments: ClinicAppointment[];
  recurringSchedules: RecurringPatientSchedule[];
  recurringSkippedDates: Map<string, { scheduleId: string; date: string; updatedAt: string; version: number }>;
  waitingList: WaitingListEntry[];
  invoices: FinancialInvoiceIQD[];
  expenses: ClinicExpenseIQD[];
  cashCloses: CashCloseZReportRecord[];
  consentsByPatientId: Map<string, PatientConsentRecord[]>;
  attachmentsByPatientId: Map<string, EncryptedAttachmentRecord[]>;
  noteTemplates: NoteTemplateSnippet[];
  auditLogs: AuditLogEntry[];
  customWidgets: CustomWidgetDefinition[];
  episodeClinicalByEpisodeId: Map<string, EpisodeScopedClinicalStore>;
  patientMedicationsByPatientId: Map<string, PatientMedicationPlan>;
  flowsheetBySessionId: Map<string, SessionFlowsheetData>;
  latestFlowsheetByEpisodeId: Map<string, SessionFlowsheetData>;
  receptionPrivacyBlur: boolean;
  clinicProfile: ClinicProfileData;
  adminAuth: AdminPinAuthRecord | null;
  pinRateLimit: PinRateLimitState;
  securityConfig: SecurityConfigSettings;
  moduleFlags: ModuleFlagsSettings;
  mrnRegistry: MrnRegistryData;
  financialSequences: FinancialSequencesData;
  whatsappTemplates: WhatsAppTemplatesConfig;
  backupMeta: BackupStateMetadata;
  writeTelemetry: WriteTelemetryStats;
  workspaceMode: WorkspaceModeSettings;
  smartMemory: SmartMemorySettings;
  quickSoapPrefs: QuickSoapPreferences;
  onboardingState: OnboardingStateSettings;
}

export function createDefaultCache(): OperationsMemoryCache {
  const now = new Date().toISOString();
  return {
    hydrated: false,
    staffRoster: [...CLINIC_STAFF_ROSTER],
    activeStaffId: CLINIC_STAFF_ROSTER[0].id,
    appointments: [],
    recurringSchedules: [],
    recurringSkippedDates: new Map(),
    waitingList: [],
    invoices: [],
    expenses: [],
    cashCloses: [],
    consentsByPatientId: new Map(),
    attachmentsByPatientId: new Map(),
    noteTemplates: [],
    auditLogs: [],
    customWidgets: [],
    episodeClinicalByEpisodeId: new Map(),
    patientMedicationsByPatientId: new Map(),
    flowsheetBySessionId: new Map(),
    latestFlowsheetByEpisodeId: new Map(),
    receptionPrivacyBlur: false,
    clinicProfile: {
      id: 'clinic_profile',
      clinicNameAr: '',
      clinicNameEn: '',
      therapistNameAr: CLINIC_STAFF_ROSTER[0].nameAr,
      therapistNameEn: CLINIC_STAFF_ROSTER[0].nameEn,
      phone: '',
      addressAr: '',
      addressEn: '',
      licenseNumber: '',
      workingDaysPreset: 'sun_thu',
      workingDays: [0, 1, 2, 3, 4],
      workHoursStart: '09:00',
      workHoursEnd: '21:00',
      defaultSessionDurationMinutes: 45,
      updatedAt: now,
      version: 1,
    },
    adminAuth: null,
    pinRateLimit: {
      id: 'pin_rate_limit',
      failedAttempts: 0,
      lockedUntilMs: 0,
      updatedAt: now,
      version: 1,
    },
    securityConfig: {
      id: 'security_config',
      autoLockTimeoutMs: 10 * 60 * 1000,
      autoRotateThresholdRatio: 0.7,
      webauthnPrfEnabled: false,
      autoBackupFolderEnabled: false,
      updatedAt: now,
      version: 1,
    },
    moduleFlags: {
      id: 'module_flags',
      showHepLibrary: false,
      enableCustomWidgetStudio: false,
      enableSmartGoalsGas: false,
      enableConsentModule: false,
      enableAttachmentsModule: false,
      enableVoiceDictationModule: false,
      allowCloudSpeechFallbackOptIn: false,
      enableTemplatesModule: false,
      enableAnalyticsModule: false,
      enableKioskModule: false,
      enableProblemListGoals: true,
      enableReEvalNudges: false,
      reEvalAfterSessions: 6,
      reEvalAfterDays: 21,
      enableNoteCompletenessCheck: true,
      enablePerformanceTestLibrary: true,
      enableModalitySafetyCheck: false,
      enableVitalsModule: true,
      vitalsThresholds: { ...DEFAULT_VITALS_THRESHOLDS },
      enablePediatricSafeguards: true,
      enablePediatricGeometricPainIcons: true,
      customExamPresets: [],
      enableHomeVisits: true,
      enablePracticeLocations: true,
      enableClosedDaysBreaks: true,
      enableHijriDateDisplay: false,
      enableInstallmentPlans: true,
      enableRecurringExpenses: true,
      enableReferralsModule: true,
      enableRetentionLists: true,
      retentionInactiveDaysThreshold: 14,
      practiceLocations: cloneDefaultLocations(),
      weeklyBreaks: cloneDefaultBreaks(),
      closedDateRanges: [],
      recurringExpenseTemplates: cloneDefaultRecurringExpenseTemplates(),
      referringDoctors: [],
      postDischargeFollowUps: [],
      enableImportWizard: true,
      enableTrashRecycleBin: true,
      enableDataHealthScreen: true,
      enableBilingualTerminologyGlossary: true,
      recycleBinItems: [],
      enableWebShareInterop: true,
      enableIcsCalendarExport: true,
      enableScheduleVisitCardPrint: true,
      enablePhotoMeasurementTools: true,
      settingsViewMode: 'advanced',
      publicDemoModeEnabled: false,
      updatedAt: now,
      version: 1,
    },
    mrnRegistry: {
      id: 'mrn_registry',
      issuedMrns: [],
      sequence: 0,
      updatedAt: now,
      version: 1,
    },
    financialSequences: {
      id: 'financial_sequences',
      invoiceSequence: 0,
      receiptSequence: 0,
      creditNoteSequence: 0,
      zReportSequence: 0,
      updatedAt: now,
      version: 1,
    },
    whatsappTemplates: {
      ...DEFAULT_WHATSAPP_TEMPLATES,
      appointmentReminder: { ...DEFAULT_WHATSAPP_TEMPLATES.appointmentReminder },
      hepProgram: { ...DEFAULT_WHATSAPP_TEMPLATES.hepProgram },
      paymentReceipt: { ...DEFAULT_WHATSAPP_TEMPLATES.paymentReceipt },
      updatedAt: now,
      version: 1,
    },
    backupMeta: {
      id: 'backup_meta',
      updatedAt: now,
      version: 1,
    },
    writeTelemetry: {
      id: 'write_telemetry',
      totalWrites: 0,
      writesToday: 0,
      dayKey: localDate(),
      averageDailyWrites: 0,
      updatedAt: now,
      version: 1,
    },
    workspaceMode: {
      id: 'workspace_mode',
      mode: 'solo',
      wizardCompleted: false,
      updatedAt: now,
      version: 1,
    },
    smartMemory: {
      id: 'smart_memory',
      recentPatientIds: [],
      pinnedPatientIds: [],
      services: [],
      sessionTimers: {},
      updatedAt: now,
      version: 1,
    },
    quickSoapPrefs: {
      id: 'quick_soap_prefs',
      favoriteChips: [...DEFAULT_QUICK_SOAP_CHIPS],
      updatedAt: now,
      version: 1,
    },
    onboardingState: {
      id: 'onboarding_state',
      tourCompleted: false,
      tipsEnabled: true,
      dismissedTipIds: [],
      checklistDismissed: false,
      updatedAt: now,
      version: 1,
    },
  };
}

export interface BatchEncryptedWriteItem {
  tableName: OperationsTableName;
  id: string;
  parentIds: string[];
  payload: unknown;
  extraColumns?: Record<string, unknown>;
}

/**
 * Controlled runtime interface binding sub-modules to the Single-Writer core
 * owned by `ClinicOperationsService`.
 */
export interface OperationsRuntime {
  getCache(): OperationsMemoryCache;
  setCacheAndVersionMap(nextCache: OperationsMemoryCache, nextVersionMap: Map<string, number>): void;
  getActiveDek(): CryptoKey | null;
  getActiveDb(): PhysioRecordDatabase;
  getVersionMap(): Map<string, number>;
  beginHydration(dek: CryptoKey, database: PhysioRecordDatabase): void;
  getLoadedColdStores(): Set<ColdStoreName>;
  getColdStoreLoadPromises(): Map<ColdStoreName, Promise<void>>;
  getLoadedColdPatientIds(): Set<string>;
  getLoadedColdEpisodeIds(): Set<string>;
  getColdPatientLoadPromises(): Map<string, Promise<void>>;
  getAuditChainQueue(): Promise<void>;
  setAuditChainQueue(queue: Promise<void>): void;
  notifyListeners(): void;
  trackWrite(task: Promise<void>): Promise<void>;
  decryptStoreEntity<T>(
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
  ): Promise<T | null>;
  putRecordEncrypted(
    tableName: OperationsTableName,
    id: string,
    parentIds: string[],
    payload: unknown,
    extraColumns?: Record<string, unknown>,
    options?: { skipBroadcast?: boolean; skipConcurrencyCheck?: boolean }
  ): Promise<void>;
  putRecordsEncryptedBatch(items: BatchEncryptedWriteItem[]): Promise<void>;
  deleteRecordEncrypted(tableName: OperationsTableName, id: string): Promise<void>;
  ensureColdStoreLoadedAsync(storeName: ColdStoreName): Promise<void>;
  getActiveStaff(): ClinicStaffMember;
  getStaffRoster(): ClinicStaffMember[];
  appendAuditLog(params: {
    actionType: AuditLogEntry['actionType'];
    entityType: AuditLogEntry['entityType'];
    entityId: string;
    patientId?: string;
    episodeId?: string;
    summaryAr: string;
    summaryEn: string;
  }): AuditLogEntry;
  appendAuditLogAsync(params: {
    actionType: AuditLogEntry['actionType'];
    entityType: AuditLogEntry['entityType'];
    entityId: string;
    patientId?: string;
    episodeId?: string;
    summaryAr: string;
    summaryEn: string;
  }): Promise<AuditLogEntry>;
  isTrashRecycleBinEnabled(): boolean;
  moveRecordToRecycleBin(params: {
    itemType: RecycleBinItemType;
    originalId: string;
    titleAr: string;
    titleEn: string;
    subtitleAr?: string;
    subtitleEn?: string;
    payload: ClinicAppointment | WaitingListEntry | ClinicExpenseIQD;
    nowIso?: string;
  }): RecycleBinEntry;
  saveClinicProfileAsync(
    partial: Partial<Omit<ClinicProfileData, 'id' | 'updatedAt' | 'version'>>
  ): Promise<ClinicProfileData>;
  getRecurringExpenseTemplates(): RecurringExpenseTemplate[];
  saveRecurringExpenseTemplates(templates: RecurringExpenseTemplate[]): RecurringExpenseTemplate[];
  getClosedDateMatchesForDate(dateStr: string): ClosedDateRangeEntry[];
  getWeeklyBreakConflictsForSlot(
    dateStr: string,
    startTime: string,
    durationMinutes: number
  ): WeeklyBreakWindow[];
  restoreAppointment(appt: ClinicAppointment): ClinicAppointment[];
  restoreWaitingListEntry(entry: WaitingListEntry): WaitingListEntry[];
  restoreExpenseIQD(expense: ClinicExpenseIQD): ClinicExpenseIQD[];
  deleteAppointment(
    id: string,
    options?: { bypassRecycleBin?: boolean; deletedAtIso?: string }
  ): ClinicAppointment[];
  updateAppointmentStatus(
    id: string,
    status: AppointmentStatus,
    reason?: string
  ): ClinicAppointment[];
  ensureRecurringAppointmentsForDate(targetDate: string): ClinicAppointment[];
  allocateNextFinancialNumber(kind: 'invoice' | 'receipt' | 'creditNote' | 'zReport'): string;
  incrementPackageSessionUsed(invoiceId: string, finalizedSessionId?: string): FinancialInvoiceIQD[];
  rollbackUncommittedFinishInvoice(id: string): FinancialInvoiceIQD[];
  restoreInvoiceIQD(invoice: FinancialInvoiceIQD): FinancialInvoiceIQD[];
}
