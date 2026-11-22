// =======================================================================
// PhysioRecord — Enterprise Clinic Operations, Flowsheet, HEP, IQD Billing & RBAC Types
// =======================================================================

import type {
  PatientBodyChartData,
  SoapObjectiveData,
  SessionType,
  ExerciseAnatomicalRegion,
  FlowsheetExerciseEntry,
  ManualTherapyFlowsheetEntry,
  PhysicalAgentFlowsheetEntry,
  SoapFlowsheetData,
  ClinicalContentGovernance,
  StructuredRehabGoal,
  SessionVitalsEntry,
} from './clinical';

export type {
  ExerciseAnatomicalRegion,
  FlowsheetExerciseEntry,
  ManualTherapyFlowsheetEntry,
  PhysicalAgentFlowsheetEntry,
  SoapFlowsheetData,
};
import type {
  OrthopedicSpecialTestItem,
  GaitPostureData,
  FunctionalScaleEntry,
  ValidatedScaleId,
} from './clinicalWidgets';

// -----------------------------------------------------------------------
// 1. Role-Based Access Control (RBAC) & Immutable Audit Log (Phase 9)
// -----------------------------------------------------------------------
export type ClinicRoleId = 'admin' | 'senior_pt' | 'assistant_pt' | 'receptionist';

export interface ClinicStaffMember {
  id: string;
  nameAr: string;
  nameEn: string;
  role: ClinicRoleId;
  specialtyAr: string;
  specialtyEn: string;
  updatedAt?: string;
  version?: number;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string; // ISO 8601
  actorName: string;
  actorRole: ClinicRoleId;
  staffId?: string;
  staffNameAr?: string;
  staffNameEn?: string;
  role?: ClinicRoleId;
  actionType:
    | 'patient_created'
    | 'patient_updated'
    | 'episode_created'
    | 'evaluation_saved'
    | 'session_finalized'
    | 'session_finalized_event'
    | 'session_deleted'
    | 'package_manual_adjustment'
    | 'addendum_signed'
    | 'invoice_created'
    | 'invoice_voided'
    | 'credit_note_issued'
    | 'payment_collected_iqd'
    | 'payment_received'
    | 'payment_reversed'
    | 'z_report_closed'
    | 'expense_recorded_iqd'
    | 'expense_logged'
    | 'appointment_created'
    | 'appointment_status_changed'
    | 'consent_signed'
    | 'consent_revoked'
    | 'role_switched'
    | 'staff_switched'
    | 'pin_changed'
    | 'pin_failed'
    | 'pin_rate_limited'
    | 'backup_exported'
    | 'backup_verified'
    | 'backup_restored'
    | 'dek_rotated'
    | 'patient_hard_deleted'
    | 'attachment_saved'
    | 'attachment_deleted'
    | 'content_pack_imported'
    | 'kiosk_intake_submitted'
    | 'settings_updated'
    | 'patient_merged'
    | 'patients_imported_batch'
    | 'recycle_bin_restored';
  entityType:
    | 'patient'
    | 'episode'
    | 'session'
    | 'invoice'
    | 'payment'
    | 'expense'
    | 'cash_close'
    | 'appointment'
    | 'waiting_list'
    | 'consent'
    | 'attachment'
    | 'security'
    | 'backup'
    | 'staff'
    | 'settings';
  entityId: string;
  patientId?: string;
  episodeId?: string;
  summaryAr: string;
  summaryEn: string;
  // Tamper-evident hash chain metadata (Phase 1.6)
  sequence?: number;
  prevHash?: string;
  entryHash?: string;
  patientIdHashSha256?: string;
  deletedAt?: string;
}

// -----------------------------------------------------------------------
// 2. Session Exercise & Modality Flowsheet + HEP Builder (Phase 6)
// -----------------------------------------------------------------------
export type ExerciseTherapeuticGoal =
  | 'mobility_rom'
  | 'strengthening'
  | 'core_stability'
  | 'stretching_flexibility'
  | 'neuromuscular_balance'
  | 'pain_modulation';

export interface ExerciseLibraryItem {
  id: string;
  nameAr: string;
  nameEn: string;
  region: ExerciseAnatomicalRegion;
  goal: ExerciseTherapeuticGoal;
  equipmentAr: string;
  equipmentEn: string;
  defaultSets: number;
  defaultReps: number;
  defaultHoldSeconds: number;
  defaultLoadOrBand: string;
  instructionsAr: string;
  instructionsEn: string;
  precautionsAr?: string;
  precautionsEn?: string;
  governance: ClinicalContentGovernance;
}

/**
 * Legacy localStorage shape used only when migrating pre-v5 `physiorecord_session_flowsheet_v2_*` keys.
 * All active session flowsheets live inside `SoapNoteData.objective.flowsheet` (`SoapFlowsheetData`).
 */
export interface SessionFlowsheetData {
  preSessionPainNrs?: number;
  postSessionPainNrs?: number;
  exercises: FlowsheetExerciseEntry[];
  manualTherapy: ManualTherapyFlowsheetEntry[];
  physicalAgents: PhysicalAgentFlowsheetEntry[];
}


export interface HepPrescriptionItem {
  id: string;
  exerciseId: string;
  nameAr: string;
  nameEn: string;
  region: ExerciseAnatomicalRegion;
  sets: number;
  reps: number;
  holdSeconds: number;
  frequencyPerDay: number;
  daysPerWeek: number;
  loadOrBand: string;
  instructionsAr: string;
  instructionsEn: string;
  complianceStatus?: 'full' | 'partial' | 'non_compliant';
}

// -----------------------------------------------------------------------
// 3. Episode-Scoped Clinical Assessment & Longitudinal Comparison (Phase 4 & 5)
// -----------------------------------------------------------------------
export interface ClinicalAssessmentSnapshot {
  id: string;
  episodeId: string;
  sessionId?: string;
  snapshotType: 'initial_evaluation' | 're_evaluation' | 'follow_up' | 'discharge';
  recordedDate: string; // YYYY-MM-DD
  recordedBy: string;
  labelAr: string;
  labelEn: string;
  painNrsRest: number;
  painNrsActivity: number;
  romSummary: Array<{
    jointMovementKey: string;
    canonicalKey?: string | null;
    label?: string;
    labelAr: string;
    labelEn: string;
    laterality: string;
    aromDegrees: number | null;
    promDegrees?: number | null;
    normalDegrees?: number;
  }>;
  mmtSummary: Array<{
    muscleKey: string;
    canonicalKey?: string | null;
    label?: string;
    labelAr: string;
    labelEn: string;
    laterality: string;
    grade: string;
  }>;
  outcomeScale?: {
    scaleId: string;
    scaleNameAr: string;
    scaleNameEn: string;
    rawScore?: number;
    scorePercentage: number;
    severityLabelAr: string;
    severityLabelEn: string;
  };
  specialTestsPositiveCount: number;
  clinicalImpressionNote?: string;
}

export interface EpisodeScopedClinicalStore {
  episodeId: string;
  patientId: string;
  activeWidgetIds: string[];
  // Structured Initial Evaluation Subjective & Objective fields
  chiefComplaint: string;
  historyOfPresentIllness: string;
  mechanismOfInjury: string;
  painAtRestNrs: number;
  painOnActivityNrs: number;
  painWorst24hNrs: number;
  painNature: string; // e.g., 'Sharp / Radicular / Ache'
  aggravatingFactors: string;
  relievingFactors: string;
  functionalLimitations: string;
  patientPersonalGoals: string;
  observationPosture: string;
  palpationFindings: string;
  circumferenceEdemaNotes: string;
  treatmentFrequency: string;
  plannedDurationWeeks: number;
  clinicalImpression: string;
  // Interactive Widgets Scoped to THIS Episode
  bodyChart?: PatientBodyChartData;
  objective: SoapObjectiveData;
  specialTests: OrthopedicSpecialTestItem[];
  gaitPosture?: GaitPostureData;
  functionalScales?: FunctionalScaleEntry;
  customWidgetsData: Record<string, Record<string, unknown>>;
  // Longitudinal Comparison Snapshots (Initial Eval -> Re-evals -> Discharge)
  snapshots: ClinicalAssessmentSnapshot[];
  // Optional SMART Goals & GAS Scaling (Phase 3.3)
  smartGoals?: StructuredRehabGoal[];
  // Home Exercise Program (HEP) Scoped to THIS Episode
  hepProgram: HepPrescriptionItem[];
  // Phase B Clinical Workflow Extensions
  problemList?: EpisodeProblemItem[];
  outcomeGoals?: OutcomeLinkedGoal[];
  performanceTests?: PerformanceTestResultEntry[];
  vitalsHistory?: SessionVitalsEntry[];
  appliedPresetIds?: string[];
  updatedAt: string;
}

export interface EpisodeProblemItem {
  id: string;
  text: string;
  category: 'impairment' | 'activity_limitation' | 'participation_restriction';
  status: 'active' | 'resolved';
  createdAt: string;
}

export interface OutcomeLinkedGoal {
  id: string;
  title: string;
  linkedInstrumentId: Exclude<ValidatedScaleId, 'oswestry' | 'custom'>;
  baselineScore: number;
  currentScore?: number;
  targetScore: number;
  targetDate: string;
  notes?: string;
  createdAt: string;
}

export type PerformanceTestId =
  | 'lsi'
  | 'walk_10m'
  | 'walk_6m'
  | 'single_leg_stance'
  | 'chair_stand_30s'
  | 'five_x_sts'
  | 'grip_strength';

export interface PerformanceTestResultEntry {
  id: string;
  testId: PerformanceTestId;
  recordedAt: string;
  inputs: Record<string, number | string>;
  computedValue: number;
  unit: string;
  interpretationAr: string;
  interpretationEn: string;
  notes?: string;
}

export interface VitalsAlertThresholds {
  bpSystolicHigh: number;
  bpSystolicLow: number;
  bpDiastolicHigh: number;
  bpDiastolicLow: number;
  hrHigh: number;
  hrLow: number;
  spO2Low: number;
  verificationStatus: 'needs_expert_verification' | 'verified';
  reviewedBy?: string;
  reviewedAt?: string;
}

export type ExamPresetRegionId =
  | 'neck'
  | 'low_back'
  | 'shoulder'
  | 'elbow_wrist_hand'
  | 'hip'
  | 'knee'
  | 'ankle_foot'
  | 'post_op'
  | 'neuro'
  | 'pediatric'
  | 'sports'
  | string;

export interface RegionalExamPresetDefinition {
  id: string;
  regionId: ExamPresetRegionId;
  titleAr: string;
  titleCkb: string;
  titleEn: string;
  summaryAr: string;
  summaryEn: string;
  license: 'CC0-1.0';
  isBuiltIn: boolean;
  widgetsToEnable: Array<
    'body_chart' | 'rom' | 'mmt' | 'neuro' | 'special_tests' | 'gait_posture' | 'functional_scales'
  >;
  romStarters: Array<{
    jointId: string;
    jointNameAr: string;
    jointNameEn: string;
    movementId: string;
    movementNameAr: string;
    movementNameEn: string;
    side: 'right' | 'left' | 'bilateral' | 'midline';
  }>;
  mmtStarters: Array<{
    muscleGroupId: string;
    muscleGroupNameAr: string;
    muscleGroupNameEn: string;
    side: 'right' | 'left' | 'bilateral' | 'midline';
  }>;
  specialTestIds: string[];
  recommendedScaleId: Exclude<ValidatedScaleId, 'oswestry' | 'custom'>;
  redFlagRegionId:
    | 'lumbar_pelvis'
    | 'cervical_craniovertebral'
    | 'thoracic_systemic'
    | 'lower_extremity'
    | 'upper_extremity';
  redFlagReminderAr: string;
  redFlagReminderEn: string;
  updatedAt?: string;
}

// -----------------------------------------------------------------------
// 4. Appointments, Waiting List & Therapist Schedule (Phase 7)
// -----------------------------------------------------------------------
export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sun, 1 = Mon, ..., 6 = Sat

export type AppointmentStatus =
  | 'scheduled'
  | 'arrived'
  | 'in_session'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export type AppointmentMode = 'clinic' | 'home_visit';

export interface HomeVisitAddress {
  governorate: string;
  area: string;
  nearestLandmark: string;
  notes?: string;
}

export type PracticeLocationType = 'clinic' | 'home_visits' | 'hospital' | 'second_clinic';

export interface PracticeLocationItem {
  id: string;
  type: PracticeLocationType;
  nameAr: string;
  nameEn: string;
  governorate?: string;
  area?: string;
  isDefault?: boolean;
  isActive?: boolean;
}

export interface WeeklyBreakWindow {
  id: string;
  labelAr: string;
  labelEn: string;
  weekdays: WeekdayIndex[];
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  isActive: boolean;
}

export interface ClosedDateRangeEntry {
  id: string;
  labelAr: string;
  labelEn: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  notes?: string;
}

export interface ClinicAppointment {
  id: string;
  patientId: string;
  isDemo?: boolean;
  patientName: string;
  patientPhone?: string;
  episodeId?: string;
  episodeTitle?: string;
  therapistName: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  durationMinutes: number;
  visitType: SessionType;
  appointmentMode?: AppointmentMode;
  locationId?: string;
  homeVisitAddress?: HomeVisitAddress;
  travelBufferBeforeMin?: number;
  travelBufferAfterMin?: number;
  status: AppointmentStatus;
  roomOrBed?: string;
  recurringScheduleId?: string;
  notes?: string;
  cancellationReason?: string;
  noShowReason?: string;
  statusUpdatedAt?: string;
  updatedAt?: string;
  version?: number;
}

export interface RecurringPatientSchedule {
  id: string;
  patientId: string;
  isDemo?: boolean;
  patientName: string;
  patientPhone?: string;
  episodeId?: string;
  episodeTitle?: string;
  therapistName: string;
  weekdays: WeekdayIndex[];
  startTime: string; // HH:mm
  durationMinutes: number;
  visitType: SessionType;
  appointmentMode?: AppointmentMode;
  locationId?: string;
  homeVisitAddress?: HomeVisitAddress;
  travelBufferBeforeMin?: number;
  travelBufferAfterMin?: number;
  roomOrBed?: string;
  startDate: string; // YYYY-MM-DD
  endDate?: string; // Optional YYYY-MM-DD
  isActive: boolean;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
  version?: number;
}

export interface WaitingListEntry {
  id: string;
  patientId: string;
  isDemo?: boolean;
  patientName: string;
  phone: string;
  conditionOrRegion: string;
  preferredTherapist?: string;
  preferredDays: string;
  preferredTimeWindow: 'morning' | 'afternoon' | 'evening' | 'any';
  priority: 'urgent' | 'high' | 'normal';
  status?: 'waiting' | 'scheduled' | 'completed';
  addedAt: string;
  notes?: string;
  updatedAt?: string;
  version?: number;
}

// -----------------------------------------------------------------------
// 5. Iraqi Financial System (IQD Primary Currency, Packages, Debt & Expenses)
// -----------------------------------------------------------------------
export type IraqiPaymentMethod = 'cash' | 'zain_cash' | 'qi_card' | 'other';

export interface PaymentTransactionIQD {
  id: string;
  invoiceId: string;
  patientId: string;
  date: string; // YYYY-MM-DD
  /** Equivalent amount converted into the clinic's primary ledger currency (negative for reversal entries). */
  amountIQD: number;
  /** Per-payment currency snapshot (4.2), e.g., 'IQD' | 'USD' */
  currencyCode?: string;
  /** Original paid/reversed amount denominated in `currencyCode` before FX conversion */
  originalAmount?: number;
  /** Exchange rate snapshot at time of collection: 1 `currencyCode` = `exchangeRateToPrimary` `primaryCurrencyCode` */
  exchangeRateToPrimary?: number;
  primaryCurrencyCode?: string;
  method: IraqiPaymentMethod;
  receivedBy: string;
  receiptNumber: string;
  status?: 'posted' | 'reversed';
  isReversal?: boolean;
  reversalOfPaymentId?: string;
  reversedByPaymentId?: string;
  reversalReason?: string;
  notes?: string;
  updatedAt?: string;
  version?: number;
}

export interface CreditNoteEntry {
  id: string;
  creditNoteNumber: string;
  invoiceId: string;
  patientId: string;
  date: string; // YYYY-MM-DD
  amountIQD: number;
  reason: string;
  issuedBy: string;
  createdAt: string;
}

export type InvoiceInstallmentStatus = 'pending' | 'partial' | 'paid';

export interface InvoiceInstallmentItem {
  id: string;
  labelAr: string;
  labelEn: string;
  dueDate: string; // YYYY-MM-DD
  amountIQD: number;
  paidAmountIQD: number;
  status: InvoiceInstallmentStatus;
  paidAt?: string; // YYYY-MM-DD
  notes?: string;
}

export interface FinancialInvoiceIQD {
  id: string;
  invoiceNumber: string;
  patientId: string;
  isDemo?: boolean;
  patientName: string;
  episodeId?: string;
  episodeTitle?: string;
  sessionId?: string;
  locationId?: string;
  travelFeeIQD?: number;
  date: string; // YYYY-MM-DD
  invoiceType: 'single_session' | 'rehab_package' | 'evaluation';
  titleAr: string;
  titleEn: string;
  currencyCode?: string;
  totalAmountIQD: number; // e.g. 25000 or 200000
  discountIQD: number;
  netAmountIQD: number; // totalAmountIQD - discountIQD
  paidAmountIQD: number;
  balanceDueIQD: number; // netAmountIQD - paidAmountIQD
  status: 'paid' | 'partial' | 'unpaid' | 'void';
  installmentPlan?: InvoiceInstallmentItem[];
  voidedAt?: string;
  voidReason?: string;
  voidedBy?: string;
  creditNoteNumber?: string;
  creditNotes?: CreditNoteEntry[];
  // Package tracking (for multi-session bundles)
  packageTotalSessions?: number;
  packageUsedSessions?: number;
  processedFinalizedSessionIds?: string[];
  packageAdjustments?: Array<{
    timestamp: string;
    delta: number;
    reason: string;
    actorName: string;
    actorRole: ClinicRoleId;
  }>;
  payments: PaymentTransactionIQD[];
  createdBy: string;
  notes?: string;
  updatedAt?: string;
  version?: number;
}

export type ExpenseCategoryIQD =
  | 'rent'
  | 'medical_consumables'
  | 'equipment_maintenance'
  | 'staff_salaries'
  | 'electricity_generator'
  | 'marketing_other';

export interface RecurringExpenseTemplate {
  id: string;
  category: ExpenseCategoryIQD;
  customCategoryLabel?: string;
  titleAr: string;
  titleEn: string;
  defaultAmountIQD: number; // 0 by default (blank financial default)
  dayOfMonth: number; // 1..28
  paidBy?: string;
  isActive: boolean;
  lastLoggedMonthKey?: string; // YYYY-MM
}

export interface ClinicExpenseIQD {
  id: string;
  patientId?: string;
  patientName?: string;
  isDemo?: boolean;
  date: string; // YYYY-MM-DD
  category: ExpenseCategoryIQD;
  customCategoryLabel?: string;
  recurringTemplateId?: string;
  titleAr: string;
  titleEn: string;
  amountIQD: number;
  paidBy: string;
  notes?: string;
  updatedAt?: string;
  version?: number;
}

export type ReferralSourceType = 'doctor' | 'hospital' | 'friend' | 'social_media' | 'other';

export interface ReferringDoctorEntry {
  id: string;
  nameAr: string;
  nameEn: string;
  specialtyAr?: string;
  specialtyEn?: string;
  facilityAr?: string;
  facilityEn?: string;
  phone?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export type FollowUpIntervalWeeks = 4 | 12;

export interface PostDischargeFollowUpRecord {
  id: string;
  patientId: string;
  episodeId?: string;
  intervalWeeks: FollowUpIntervalWeeks;
  dischargeDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  recordedAt: string; // YYYY-MM-DD
  nprsScore?: number;
  psfsScore?: number;
  notes?: string;
  recordedBy?: string;
}

// -----------------------------------------------------------------------
// 6. Phase 1 Encrypted Settings, Hash-Chained Audit & Backup Merge Types
// -----------------------------------------------------------------------
export interface ClinicProfileData {
  id: 'clinic_profile';
  clinicNameAr: string;
  clinicNameEn: string;
  therapistNameAr: string;
  therapistNameEn: string;
  phone: string;
  addressAr: string;
  addressEn: string;
  licenseNumber: string;
  /** Encrypted data URLs (PNG/JPEG/WebP resized client-side) */
  logoDataUrl?: string;
  stampSignatureDataUrl?: string;
  receiptFooterAr?: string;
  receiptFooterEn?: string;
  /** Working schedule configuration (4.4) */
  workingDaysPreset?: 'sun_thu' | 'sat_thu' | 'custom';
  workingDays?: WeekdayIndex[];
  workHoursStart?: string; // HH:mm
  workHoursEnd?: string; // HH:mm
  defaultSessionDurationMinutes?: number;
  updatedAt: string;
  version: number;
}

export interface AdminPinAuthRecord {
  id: 'admin_auth';
  pinHashBase64: string;
  pinSaltBase64: string;
  iterations: number;
  requiresFirstRunReset: boolean;
  updatedAt: string;
  version: number;
}

export interface PinRateLimitState {
  id: 'pin_rate_limit';
  failedAttempts: number;
  lockedUntilMs: number;
  lastFailedAt?: string;
  updatedAt: string;
  version: number;
}

export interface SecurityConfigSettings {
  id: 'security_config';
  autoLockTimeoutMs: number;
  autoRotateThresholdRatio: number;
  webauthnPrfEnabled: boolean;
  autoBackupFolderEnabled: boolean;
  updatedAt: string;
  version: number;
}

export interface ModuleFlagsSettings {
  id: 'module_flags';
  showHepLibrary: boolean;
  enableCustomWidgetStudio: boolean;
  enableSmartGoalsGas?: boolean;
  enableConsentModule?: boolean;
  /** Phase 5 optional feature modules (ALL default false per R6) */
  enableAttachmentsModule?: boolean;
  enableVoiceDictationModule?: boolean;
  allowCloudSpeechFallbackOptIn?: boolean;
  enableTemplatesModule?: boolean;
  enableAnalyticsModule?: boolean;
  enableKioskModule?: boolean;
  /** Phase B workflow modules & configurable thresholds */
  enableProblemListGoals?: boolean;
  enableReEvalNudges?: boolean;
  reEvalAfterSessions?: number;
  reEvalAfterDays?: number;
  enableNoteCompletenessCheck?: boolean;
  enablePerformanceTestLibrary?: boolean;
  enableModalitySafetyCheck?: boolean;
  modalitySafetyReviewedBy?: string;
  modalitySafetyReviewedAt?: string;
  enableVitalsModule?: boolean;
  vitalsThresholds?: VitalsAlertThresholds;
  enablePediatricSafeguards?: boolean;
  enablePediatricGeometricPainIcons?: boolean;
  customExamPresets?: RegionalExamPresetDefinition[];
  // Phase C: Iraq-Specific Operations flags & clinic settings
  enableHomeVisits?: boolean;
  enablePracticeLocations?: boolean;
  enableClosedDaysBreaks?: boolean;
  enableHijriDateDisplay?: boolean;
  enableInstallmentPlans?: boolean;
  enableRecurringExpenses?: boolean;
  enableReferralsModule?: boolean;
  enableRetentionLists?: boolean;
  retentionInactiveDaysThreshold?: number;
  practiceLocations?: PracticeLocationItem[];
  weeklyBreaks?: WeeklyBreakWindow[];
  closedDateRanges?: ClosedDateRangeEntry[];
  recurringExpenseTemplates?: RecurringExpenseTemplate[];
  referringDoctors?: ReferringDoctorEntry[];
  postDischargeFollowUps?: PostDischargeFollowUpRecord[];
  /** Phase D modules & 30-day non-clinical recycle bin */
  enableImportWizard?: boolean;
  enableTrashRecycleBin?: boolean;
  enableDataHealthScreen?: boolean;
  enableBilingualTerminologyGlossary?: boolean;
  recycleBinItems?: RecycleBinEntry[];
  /** Phase E: Sharing & Interop modules */
  enableWebShareInterop?: boolean;
  enableIcsCalendarExport?: boolean;
  enableScheduleVisitCardPrint?: boolean;
  enablePhotoMeasurementTools?: boolean;
  /** Phase F: Settings View Mode, Onboarding Checklist & Public Demo */
  settingsViewMode?: 'simple' | 'advanced';
  publicDemoModeEnabled?: boolean;
  updatedAt: string;
  version: number;
}

export type RecycleBinItemType = 'appointment' | 'waiting_list' | 'expense';

export interface RecycleBinEntry {
  id: string;
  itemType: RecycleBinItemType;
  originalId: string;
  titleAr: string;
  titleEn: string;
  subtitleAr?: string;
  subtitleEn?: string;
  deletedAt: string;
  expiresAt: string;
  deletedBy: string;
  payload: ClinicAppointment | WaitingListEntry | ClinicExpenseIQD;
}

export interface MrnRegistryData {
  id: 'mrn_registry';
  issuedMrns: string[];
  patientMrnMap?: Record<string, string>;
  sequence: number;
  updatedAt: string;
  version: number;
}

export interface BackupStateMetadata {
  id: 'backup_meta';
  lastBackupAt?: string;
  lastVerifiedBackupAt?: string;
  lastBackupMethod?: 'fs-access' | 'download';
  lastBackupFormatVersion?: string;
  lastBackupVerified?: boolean;
  lastBackupRecordCount?: number;
  lastReminderDismissedAt?: string;
  updatedAt: string;
  version: number;
}

export interface WriteTelemetryStats {
  id: 'write_telemetry';
  totalWrites: number;
  writesToday: number;
  dayKey: string;
  averageDailyWrites: number;
  updatedAt: string;
  version: number;
}

export interface PatientMedicationPlan {
  patientId: string;
  medications: Array<Record<string, unknown>>;
  updatedAt: string;
  version: number;
}

export interface AuditChainVerificationResult {
  valid: boolean;
  totalEntries: number;
  verifiedEntries: number;
  legacyUnchainedEntries: number;
  brokenAtEntryId?: string;
  brokenReason?: string;
  headHash?: string;
  verifiedAt: string;
}

export interface DailyAuditDigest {
  dateKey: string;
  generatedAt: string;
  totalEntries: number;
  headHash: string;
  chainValid: boolean;
  entries: AuditLogEntry[];
}

export type BackupRestoreMode = 'replace' | 'merge';

export interface MergeConflictRecord {
  storeName: string;
  recordId: string;
  resolution: 'kept_local' | 'applied_backup' | 'skipped_immutable';
  localUpdatedAt?: string;
  backupUpdatedAt?: string;
  reasonAr: string;
  reasonEn: string;
}

// -----------------------------------------------------------------------
// Phase 2: Solo Therapist Experience, Smart Memory & Quick SOAP Types
// Stored encrypted in Dexie `clinicSettings` (Zero PHI in localStorage)
// -----------------------------------------------------------------------
export type ClinicWorkspaceMode = 'solo' | 'team';

export interface WorkspaceModeSettings {
  id: 'workspace_mode';
  mode: ClinicWorkspaceMode;
  wizardCompleted: boolean;
  updatedAt: string;
  version: number;
}

export interface ClinicServiceItem {
  id: string;
  nameAr: string;
  nameEn: string;
  invoiceType: FinancialInvoiceIQD['invoiceType'];
  priceIQD: number;
  packageSessions?: number;
  isActive: boolean;
}

export interface SmartMemorySettings {
  id: 'smart_memory';
  lastDurationMinutes?: number;
  lastRoom?: string;
  lastPaymentMethod?: IraqiPaymentMethod;
  recentPatientIds: string[];
  pinnedPatientIds: string[];
  services: ClinicServiceItem[];
  sessionTimers?: Record<string, number>;
  updatedAt: string;
  version: number;
}

export type QuickSoapChipCategory = 'exercise' | 'manual' | 'modality';

export interface QuickSoapChip {
  id: string;
  category: QuickSoapChipCategory;
  labelAr: string;
  labelEn: string;
  exerciseId?: string;
  sets?: number;
  reps?: number;
  holdSeconds?: number;
  loadOrBand?: string;
  manualTechniqueAr?: string;
  manualTechniqueEn?: string;
  manualTarget?: string;
  manualGrade?: 'Grade I' | 'Grade II' | 'Grade III' | 'Grade IV' | 'MWM' | 'Soft Tissue';
  modalityType?: PhysicalAgentFlowsheetEntry['modality'];
  modalityParams?: string;
  durationMinutes?: number;
}

export interface QuickSoapPreferences {
  id: 'quick_soap_prefs';
  favoriteChips: QuickSoapChip[];
  updatedAt: string;
  version: number;
}

export interface OnboardingStateSettings {
  id: 'onboarding_state';
  tourCompleted: boolean;
  tipsEnabled: boolean;
  dismissedTipIds: string[];
  checklistDismissed?: boolean;
  lastSeenChangelogVersion?: string;
  updatedAt: string;
  version: number;
}

export interface FinishUndoSnapshot {
  createdInvoiceId?: string;
  createdPaymentId?: string;
  previousInvoiceState?: FinancialInvoiceIQD;
  createdAppointmentId?: string;
  previousAppointmentId?: string;
  previousAppointmentStatus?: AppointmentStatus;
}

export type FontScaleOption = 100 | 115 | 130;

// -----------------------------------------------------------------------
// Phase 4: Financial Integrity, FX, Z-Report, Scheduler Ops, WhatsApp & Consents
// -----------------------------------------------------------------------
export interface FinancialSequencesData {
  id: 'financial_sequences';
  invoiceSequence: number;
  receiptSequence: number;
  creditNoteSequence: number;
  zReportSequence: number;
  updatedAt: string;
  version: number;
}

export interface CurrencyBreakdownBucket {
  collectedOriginal: number;
  collectedPrimary: number;
  reversedOriginal: number;
  reversedPrimary: number;
  count: number;
}

export interface CashCloseZReportRecord {
  id: string;
  zReportNumber: string;
  dateKey: string; // YYYY-MM-DD
  primaryCurrencyCode: string;
  totalCollectedPrimary: number;
  totalReversedPrimary: number;
  netCollectedPrimary: number;
  totalExpensesPrimary: number;
  netCashFlowPrimary: number;
  paymentCount: number;
  reversalCount: number;
  expenseCount: number;
  byMethod: Record<IraqiPaymentMethod, number>;
  byCurrency: Record<string, CurrencyBreakdownBucket>;
  countedCashActual?: number;
  cashVariance?: number;
  closedAt: string;
  closedBy: string;
  notes?: string;
  updatedAt: string;
  version: number;
}

export interface MonthlyFinanceSummary {
  monthKey: string; // YYYY-MM
  primaryCurrencyCode: string;
  invoiceCount: number;
  voidedInvoiceCount: number;
  totalBilledPrimary: number;
  totalCollectedPrimary: number;
  totalReversedPrimary: number;
  netCollectedPrimary: number;
  totalExpensesPrimary: number;
  netCashFlowPrimary: number;
  byMethod: Record<IraqiPaymentMethod, number>;
  byExpenseCategory: Record<ExpenseCategoryIQD, number>;
  byCurrency: Record<string, CurrencyBreakdownBucket>;
}

export interface AppointmentConflictResult {
  hasConflict: boolean;
  allOverlaps?: ClinicAppointment[];
  therapistConflicts: ClinicAppointment[];
  roomConflicts: ClinicAppointment[];
  travelBufferConflicts?: ClinicAppointment[];
  breakConflicts?: WeeklyBreakWindow[];
  closedDayMatches?: ClosedDateRangeEntry[];
  allowConcurrent?: boolean;
}

export interface CancellationNoShowStats {
  total: number;
  completed: number;
  cancelled: number;
  noShow: number;
  activePending: number;
  attendanceRatePercent: number;
  cancellationRatePercent: number;
  noShowRatePercent: number;
  topCancellationReasons: Array<{ reason: string; count: number }>;
  topNoShowReasons: Array<{ reason: string; count: number }>;
}

export interface WaitlistMatchSuggestion {
  entry: WaitingListEntry;
  score: number;
  matchReasonAr: string;
  matchReasonEn: string;
}

export interface WhatsAppTemplatePair {
  ar: string;
  en: string;
}

export interface WhatsAppTemplatesConfig {
  id: 'whatsapp_templates';
  appointmentReminder: WhatsAppTemplatePair;
  hepProgram: WhatsAppTemplatePair;
  paymentReceipt: WhatsAppTemplatePair;
  updatedAt: string;
  version: number;
}

export type ConsentTemplateId = 'treatment' | 'data_storage' | 'photography';

export interface ConsentTemplateDefinition {
  id: ConsentTemplateId;
  titleAr: string;
  titleEn: string;
  summaryAr: string;
  summaryEn: string;
  bodyAr: string;
  bodyEn: string;
  version: string;
}

export interface PatientConsentRecord {
  id: string;
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
  therapistWitnessName: string;
  /** PNG signature drawn on local HTML5 canvas, encrypted inside Dexie */
  signatureDataUrl: string;
  consentGranted: boolean;
  signedAt: string; // ISO 8601
  revokedAt?: string;
  revokeReason?: string;
  updatedAt: string;
  version: number;
}

// -----------------------------------------------------------------------
// Phase 5: Encrypted Attachments (5.2), Snippets (5.6), Analytics (5.7)
// -----------------------------------------------------------------------
export type PatientAttachmentCategory =
  | 'posture_before'
  | 'posture_after'
  | 'imaging_mri_xray'
  | 'pdf_report'
  | 'clinical_photo'
  | 'other';

export interface EncryptedAttachmentRecord {
  id: string;
  patientId: string;
  episodeId?: string;
  category: PatientAttachmentCategory;
  title: string;
  notes?: string;
  fileName: string;
  mimeType: string;
  /** Data URL of downscaled image (<=1600px) or Base64 PDF payload, encrypted at rest in Dexie v9 */
  payloadDataUrl: string;
  /** Optional ~320px preview thumbnail data URL for fast gallery rendering */
  thumbnailDataUrl?: string;
  widthPx?: number;
  heightPx?: number;
  originalBytes: number;
  storedBytes: number;
  /** Optional pairing tag for posture before/after comparison (e.g. "lumbar-sagittal-1") */
  posturePairKey?: string;
  capturedAt: string; // YYYY-MM-DD
  createdAt: string;
  updatedAt: string;
  version: number;
  /** Phase E: Editable vector photo measurement annotation state (angles, cobb, plumb, calibration) */
  annotations?: PhotoAnnotationState;
}

export type NoteTemplateCategory =
  | 'subjective'
  | 'objective'
  | 'assessment'
  | 'plan'
  | 'general';

export interface NoteTemplateSnippet {
  id: string;
  slashTrigger: string; // e.g. "rom", "hep", "pain"
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  category: NoteTemplateCategory;
  packId: string;
  source: string;
  license: string;
  isBuiltIn?: boolean;
  updatedAt: string;
  version: number;
}

export interface ContentPackDefinition {
  packId: string;
  name: string;
  version: string;
  source: string;
  license: string;
  author?: string;
  snippets: Array<{
    id?: string;
    slashTrigger: string;
    titleAr: string;
    titleEn: string;
    bodyAr: string;
    bodyEn: string;
    category: NoteTemplateCategory;
  }>;
}

export interface LocalClinicAnalyticsSummary {
  totalPatients: number;
  activePatients: number;
  totalEpisodes: number;
  activeEpisodes: number;
  completedEpisodes: number;
  totalSessions: number;
  finalizedSessions: number;
  meanSessionsPerEpisode: number;
  totalAppointments: number;
  attendedAppointments: number;
  cancelledAppointments: number;
  noShowAppointments: number;
  attendanceRatePercent: number;
  noShowRatePercent: number;
  outcomesEvaluatedCount: number;
  outcomesImprovedCount: number;
  outcomesMcidAchievedCount: number;
  outcomeImprovementRatePercent: number;
  outcomeMcidRatePercent: number;
  totalInvoicedIQD: number;
  totalCollectedIQD: number;
  totalExpensesIQD: number;
  netCashflowIQD: number;
  collectionRatePercent: number;
  monthlyCashflow: Array<{
    monthKey: string; // YYYY-MM
    incomeIQD: number;
    expensesIQD: number;
    netIQD: number;
  }>;
}

// -----------------------------------------------------------------------
// Phase E: Sharing & Interop Types (Web Share, .ics, Visit Card, Photo Tools)
// -----------------------------------------------------------------------
export interface IcsExportFieldOptions {
  includePatientName: boolean;
  includePatientPhone: boolean;
  includeTherapistName: boolean;
  includeLocationAndRoom: boolean;
  includeVisitTypeAndNotes: boolean;
  includeReminderAlarmMinutes: number | null;
}

export interface PatientVisitCardSummary {
  patientId: string;
  patientName: string;
  patientMrn?: string;
  patientPhone?: string;
  nextAppointment: ClinicAppointment | null;
  upcomingAppointments: ClinicAppointment[];
  packageTotalSessions: number;
  packageUsedSessions: number;
  packageRemainingSessions: number;
  activeCourseInvoiceNumbers: string[];
  totalBalanceDueIQD: number;
}

export interface PhotoPoint2D {
  /** Normalized 0..1 coordinates relative to image width/height */
  xNorm: number;
  yNorm: number;
}

export interface PhotoAngleMeasurement {
  id: string;
  label: string;
  pointA: PhotoPoint2D;
  vertexB: PhotoPoint2D;
  pointC: PhotoPoint2D;
  angleDegrees: number;
  supplementaryDegrees: number;
}

export interface PhotoCobbAngleMeasurement {
  id: string;
  label: string;
  line1Start: PhotoPoint2D;
  line1End: PhotoPoint2D;
  line2Start: PhotoPoint2D;
  line2End: PhotoPoint2D;
  /** Acute intersecting Cobb angle (0..90 deg) */
  angleDegrees: number;
  /** Supplementary / obtuse angle (90..180 deg) */
  obtuseDegrees: number;
}

export interface PhotoCalibrationScale {
  pointA: PhotoPoint2D;
  pointB: PhotoPoint2D;
  /** Real-world known length between pointA and pointB in millimeters */
  knownLengthMm: number;
  /** Derived pixels per millimeter relative to natural image pixel dimensions */
  pixelsPerMm: number;
}

export interface PhotoDistanceMeasurement {
  id: string;
  label: string;
  start: PhotoPoint2D;
  end: PhotoPoint2D;
  pixelLength: number;
  lengthMm: number | null;
  deltaXMm: number | null;
  deltaYMm: number | null;
  tiltFromHorizontalDeg: number;
}

export interface PhotoArrowAnnotation {
  id: string;
  label: string;
  start: PhotoPoint2D;
  end: PhotoPoint2D;
  colorHex: string;
}

export interface PhotoAnnotationState {
  showPlumbLine: boolean;
  plumbLineXPercent: number; // 0..100, default 50
  showHorizontalLevel: boolean;
  horizontalLevelYPercent: number; // 0..100, default 50
  gridMode: 'none' | '3x3' | '6x6' | '12x12';
  angles: PhotoAngleMeasurement[];
  cobbAngles?: PhotoCobbAngleMeasurement[];
  distances?: PhotoDistanceMeasurement[];
  arrows?: PhotoArrowAnnotation[];
  calibration?: PhotoCalibrationScale | null;
}

// -----------------------------------------------------------------------
// Phase F: Settings Search, Simple/Advanced Mode, Onboarding & Community
// -----------------------------------------------------------------------
export type SettingsViewMode = 'simple' | 'advanced';

export type OnboardingChecklistStepId =
  | 'clinic_profile'
  | 'first_patient'
  | 'first_backup'
  | 'verify_recovery_key';

export interface OnboardingChecklistStepStatus {
  id: OnboardingChecklistStepId;
  completed: boolean;
  titleAr: string;
  titleEn: string;
  titleCkb: string;
  descAr: string;
  descEn: string;
  ctaAr: string;
  ctaEn: string;
}

export interface OnboardingChecklistSummary {
  steps: OnboardingChecklistStepStatus[];
  completedCount: number;
  totalCount: number;
  allCompleted: boolean;
  isDismissed: boolean;
}

export interface ChangelogReleaseEntry {
  version: string;
  date: string;
  tagAr: string;
  tagEn: string;
  titleAr: string;
  titleEn: string;
  highlightsAr: string[];
  highlightsEn: string[];
}

export interface DexieMigrationVersionEntry {
  version: number;
  storesAdded: string[];
  summaryAr: string;
  summaryEn: string;
  upgradeBehaviorAr: string;
  upgradeBehaviorEn: string;
}

export interface SettingsSearchableItem {
  id: string;
  tab: 'currency' | 'clinic' | 'display' | 'staff' | 'security' | 'modules' | 'developer';
  isAdvanced: boolean;
  categoryAr: string;
  categoryEn: string;
  titleAr: string;
  titleEn: string;
  descAr: string;
  descEn: string;
  keywords: string[];
}

export interface CommunityContentPackValidationResult {
  valid: boolean;
  errors: string[];
  packId?: string;
  license?: string;
  source?: string;
  snippetCount: number;
}
