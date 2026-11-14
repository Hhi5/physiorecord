// =======================================================================
// PhysioRecord — Encrypted Clinic Operations Service
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
  canonicalizeForSeal,
  registerSessionFinalizedListener,
  type SessionFinalizedEventPayload,
} from './sessionService';
import { localDate, getWeekdayFromDateStr } from '../utils/date';
import { broadcastVaultEvent } from '../utils/vaultEvents';
import { getCurrencyConfig, DEFAULT_CURRENCY_CODE } from '../utils/currencies';
import { DEFAULT_WHATSAPP_TEMPLATES } from '../utils/whatsappTemplates';
import {
  BUILT_IN_CC0_SNIPPETS,
  parseAndValidateContentPackJson,
} from '../data/noteTemplatesCc0';
import {
  OptimisticConcurrencyError,
  StaleTabOverwriteError,
  type EncryptedAppointmentEntity,
  type EncryptedAuditLogEntity,
  type EncryptedClinicSettingsEntity,
  type EncryptedCustomWidgetEntity,
  type EncryptedEpisodeClinicalEntity,
  type EncryptedExpenseEntity,
  type EncryptedInvoiceEntity,
  type EncryptedPatientMedicationEntity,
  type EncryptedPaymentEntity,
  type EncryptedRecurringScheduleEntity,
  type EncryptedRecurringSkippedDateEntity,
  type EncryptedStaffStateEntity,
  type EncryptedWaitingListEntity,
  type EncryptedConsentEntity,
  type EncryptedCashCloseEntity,
  type EncryptedAttachmentEntity,
  type EncryptedNoteTemplateEntity,
} from '../types/clinical';
import type {
  AdminPinAuthRecord,
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
  ClinicRoleId,
  ClinicServiceItem,
  ClinicStaffMember,
  ClinicWorkspaceMode,
  ClinicalAssessmentSnapshot,
  ConsentTemplateId,
  ContentPackDefinition,
  CreditNoteEntry,
  CurrencyBreakdownBucket,
  DailyAuditDigest,
  EncryptedAttachmentRecord,
  EpisodeScopedClinicalStore,
  ExerciseLibraryItem,
  ExpenseCategoryIQD,
  FinancialInvoiceIQD,
  FinancialSequencesData,
  FinishUndoSnapshot,
  IraqiPaymentMethod,
  ModuleFlagsSettings,
  MonthlyFinanceSummary,
  MrnRegistryData,
  NoteTemplateSnippet,
  OnboardingStateSettings,
  PatientConsentRecord,
  PatientMedicationPlan,
  PaymentTransactionIQD,
  PinRateLimitState,
  QuickSoapChip,
  QuickSoapPreferences,
  RecurringPatientSchedule,
  RegionalExamPresetDefinition,
  SecurityConfigSettings,
  SessionFlowsheetData,
  SmartMemorySettings,
  VitalsAlertThresholds,
  ClosedDateRangeEntry,
  InvoiceInstallmentItem,
  PostDischargeFollowUpRecord,
  PracticeLocationItem,
  RecurringExpenseTemplate,
  RecycleBinEntry,
  RecycleBinItemType,
  ReferringDoctorEntry,
  WaitingListEntry,
  WaitlistMatchSuggestion,
  WeeklyBreakWindow,
  WhatsAppTemplatesConfig,
  WorkspaceModeSettings,
  WriteTelemetryStats,
} from '../types/clinicManagement';

export const CLINIC_RECYCLE_BIN_RETENTION_DAYS = 30;

export const DEFAULT_PRACTICE_LOCATIONS: PracticeLocationItem[] = [
  {
    id: 'loc_main_clinic',
    type: 'clinic',
    nameAr: 'العيادة الرئيسية',
    nameEn: 'Main Clinic',
    isDefault: true,
    isActive: true,
  },
  {
    id: 'loc_home_visits',
    type: 'home_visits',
    nameAr: 'زيارات منزلية',
    nameEn: 'Home Visits',
    isActive: true,
  },
  {
    id: 'loc_hospital',
    type: 'hospital',
    nameAr: 'المستشفى',
    nameEn: 'Hospital',
    isActive: true,
  },
  {
    id: 'loc_second_clinic',
    type: 'second_clinic',
    nameAr: 'العيادة الثانية',
    nameEn: 'Second Clinic',
    isActive: true,
  },
];

export const DEFAULT_WEEKLY_BREAKS: WeeklyBreakWindow[] = [
  {
    id: 'brk_lunch_prayer',
    labelAr: 'استراحة الغداء / الصلاة',
    labelEn: 'Lunch / Prayer Break',
    weekdays: [0, 1, 2, 3, 4],
    startTime: '13:00',
    endTime: '14:00',
    isActive: true,
  },
];

export const DEFAULT_RECURRING_EXPENSE_TEMPLATES: RecurringExpenseTemplate[] = [
  {
    id: 'rec_exp_rent',
    category: 'rent',
    titleAr: 'إيجار العيادة الشهري',
    titleEn: 'Monthly Clinic Rent',
    defaultAmountIQD: 0,
    dayOfMonth: 1,
    isActive: true,
  },
  {
    id: 'rec_exp_generator',
    category: 'electricity_generator',
    titleAr: 'وقود المولدة والكهرباء',
    titleEn: 'Generator Fuel & Electricity',
    defaultAmountIQD: 0,
    dayOfMonth: 1,
    isActive: true,
  },
  {
    id: 'rec_exp_subscriptions',
    category: 'marketing_other',
    customCategoryLabel: 'اشتراكات / Subscriptions',
    titleAr: 'اشتراكات شهرية (إنترنت / خدمات)',
    titleEn: 'Monthly Subscriptions (Internet / Services)',
    defaultAmountIQD: 0,
    dayOfMonth: 5,
    isActive: true,
  },
];

function cloneDefaultLocations(): PracticeLocationItem[] {
  return DEFAULT_PRACTICE_LOCATIONS.map((loc) => ({ ...loc }));
}

function cloneDefaultBreaks(): WeeklyBreakWindow[] {
  return DEFAULT_WEEKLY_BREAKS.map((brk) => ({ ...brk, weekdays: [...brk.weekdays] }));
}

function cloneDefaultRecurringExpenseTemplates(): RecurringExpenseTemplate[] {
  return DEFAULT_RECURRING_EXPENSE_TEMPLATES.map((tpl) => ({ ...tpl }));
}

function parseHhMmToMinutes(hhmm: string): number {
  const [hStr, mStr] = (hhmm || '00:00').split(':');
  const h = Math.max(0, Math.min(23, parseInt(hStr || '0', 10) || 0));
  const m = Math.max(0, Math.min(59, parseInt(mStr || '0', 10) || 0));
  return h * 60 + m;
}

function reconcileInstallmentsWithPaidTotal(
  plan: InvoiceInstallmentItem[] | undefined,
  paidTotalIQD: number,
  paidAtDate: string
): InvoiceInstallmentItem[] | undefined {
  if (!plan || plan.length === 0) return plan;
  let remaining = Math.max(0, paidTotalIQD);
  const indexed = plan.map((item, idx) => ({ item, idx }));
  const sorted = [...indexed].sort((a, b) => a.item.dueDate.localeCompare(b.item.dueDate));
  const updatedByIdx = new Map<number, InvoiceInstallmentItem>();
  for (const { item, idx } of sorted) {
    const targetAmt = Math.max(0, item.amountIQD);
    const allocated = Math.min(targetAmt, remaining);
    remaining = Math.max(0, remaining - allocated);
    const status: InvoiceInstallmentItem['status'] =
      allocated >= targetAmt && targetAmt > 0 ? 'paid' : allocated > 0 ? 'partial' : 'pending';
    updatedByIdx.set(idx, {
      ...item,
      paidAmountIQD: allocated,
      status,
      paidAt: status === 'paid' ? item.paidAt || paidAtDate : undefined,
    });
  }
  return plan.map((_, idx) => updatedByIdx.get(idx)!);
}
import type { CustomWidgetDefinition } from '../types/clinicalWidgets';
import {
  ADMIN_PIN_PBKDF2_ITERATIONS,
  CUSTOM_WIDGET_LIMITS,
  computeAuditEntryHash,
  computePinBackoffMs,
  computeSha256Hex,
  hashAdminPinPBKDF2,
  validateCustomWidgetDefinition,
  verifyAdminPinPBKDF2,
  verifyAuditLogChainEntries,
} from './clinicSecurityHelpers';
import { buildDemoOperationsSeed } from './clinicDemoSeed';

/**
 * Append-only snapshot invariant check: existing snapshots may not be deleted,
 * reordered, or mutated. New snapshots can only be appended at the tail.
 */
export function assertAppendOnlySnapshots(
  existingSnapshots: ClinicalAssessmentSnapshot[],
  candidateSnapshots: ClinicalAssessmentSnapshot[]
): void {
  if (!Array.isArray(existingSnapshots) || existingSnapshots.length === 0) {
    return;
  }
  if (!Array.isArray(candidateSnapshots) || candidateSnapshots.length < existingSnapshots.length) {
    throw new Error(
      'Append-only Snapshots Invariant Violation: لا يمكن حذف أو تقليص اللقطات السريرية المعتمدة في الحلقة.'
    );
  }
  for (let i = 0; i < existingSnapshots.length; i += 1) {
    if (canonicalizeForSeal(existingSnapshots[i]) !== canonicalizeForSeal(candidateSnapshots[i])) {
      throw new Error(
        `Append-only Snapshots Invariant Violation: تم رصد تعديل أو إعادة ترتيب غير مصرح للقطة السريرية #${existingSnapshots[i].id}.`
      );
    }
  }
}

function areUint8ArraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Test-only hook for deterministic multi-tab collision testing on episodeClinical. */
let episodeClinicalMutationTestHook: ((context: { episodeId: string }) => Promise<void> | void) | null = null;
export function setEpisodeClinicalMutationTestHook(
  hook: ((context: { episodeId: string }) => Promise<void> | void) | null
): void {
  episodeClinicalMutationTestHook = hook;
}

// -----------------------------------------------------------------------
// 1. Clinic Staff & Attribution Roles (Note: Attribution Only, Not Auth)
// -----------------------------------------------------------------------
export const CLINIC_STAFF_ROSTER: ClinicStaffMember[] = [
  {
    id: 'staff_admin_pt',
    nameAr: 'د. حسين الرمضاني (مدير العيادة / أخصائي أقدم)',
    nameEn: 'Dr. Hussein Al-Ramdani (Clinic Director / Senior PT)',
    role: 'admin',
    specialtyAr: 'تأهيل العظام والعمود الفقري والإصابات الرياضية',
    specialtyEn: 'Orthopedic, Spine & Sports Rehab',
  },
  {
    id: 'staff_senior_pt',
    nameAr: 'د. سارة الكاظمي (أخصائية علاج طبيعي أقدم)',
    nameEn: 'Dr. Sara Al-Kadhimi (Senior Physical Therapist)',
    role: 'senior_pt',
    specialtyAr: 'تأهيل الأعصاب والمفاصل والعلاج اليدوي',
    specialtyEn: 'Neuro & Manual Physical Therapy',
  },
  {
    id: 'staff_assistant_pt',
    nameAr: 'أ. علي العبيدي (معالج طبيعي ممارس)',
    nameEn: 'Ali Al-Obaidi (Assistant Physical Therapist)',
    role: 'assistant_pt',
    specialtyAr: 'التمارين العلاجية والأجهزة الفيزيائية',
    specialtyEn: 'Therapeutic Exercise & Modalities',
  },
  {
    id: 'staff_reception',
    nameAr: 'نور الزهراء (موظفة الاستقبال والحسابات)',
    nameEn: 'Noor Al-Zahraa (Reception & IQD Billing)',
    role: 'receptionist',
    specialtyAr: 'إدارة المواعيد، قائمة الانتظار، والحسابات',
    specialtyEn: 'Scheduling, Waitlist & Financial Desk',
  },
];

export const ROLE_PERMISSIONS: Record<
  ClinicRoleId,
  {
    labelAr: string;
    labelEn: string;
    canEditClinicalCharts: boolean;
    canFinalizeAndLockNotes: boolean;
    canManageAppointments: boolean;
    canCollectPaymentsIQD: boolean;
    canDeleteFinancialRecords: boolean;
    canViewAuditLogs: boolean;
  }
> = {
  admin: {
    labelAr: 'مدير النظام / أخصائي أقدم (Admin)',
    labelEn: 'Clinic Admin & Director',
    canEditClinicalCharts: true,
    canFinalizeAndLockNotes: true,
    canManageAppointments: true,
    canCollectPaymentsIQD: true,
    canDeleteFinancialRecords: true,
    canViewAuditLogs: true,
  },
  senior_pt: {
    labelAr: 'أخصائي علاج طبيعي أقدم (Senior PT)',
    labelEn: 'Senior Physical Therapist',
    canEditClinicalCharts: true,
    canFinalizeAndLockNotes: true,
    canManageAppointments: true,
    canCollectPaymentsIQD: false,
    canDeleteFinancialRecords: false,
    canViewAuditLogs: true,
  },
  assistant_pt: {
    labelAr: 'معالج طبيعي مساعد (Assistant PT)',
    labelEn: 'Assistant Physical Therapist',
    canEditClinicalCharts: true,
    canFinalizeAndLockNotes: false,
    canManageAppointments: true,
    canCollectPaymentsIQD: false,
    canDeleteFinancialRecords: false,
    canViewAuditLogs: false,
  },
  receptionist: {
    labelAr: 'موظف الاستقبال والحسابات (Receptionist)',
    labelEn: 'Front-Desk Receptionist',
    canEditClinicalCharts: false,
    canFinalizeAndLockNotes: false,
    canManageAppointments: true,
    canCollectPaymentsIQD: true,
    canDeleteFinancialRecords: false,
    canViewAuditLogs: false,
  },
};

// -----------------------------------------------------------------------
// 2. Searchable Built-In PT Exercise Library (Hidden by Default per Owner R2)
// -----------------------------------------------------------------------
const BASE_PT_EXERCISE_CATALOG: Array<Omit<ExerciseLibraryItem, 'governance'>> = [
  {
    id: 'ex_cerv_chin_tuck',
    nameAr: 'تمرين سحب الذقن لتقوية عضلات العنق العميقة (Chin Tucks)',
    nameEn: 'Deep Cervical Flexor Chin Tucks',
    region: 'cervical',
    goal: 'core_stability',
    equipmentAr: 'بدون أدوات (وزن الجسم)',
    equipmentEn: 'Bodyweight',
    defaultSets: 3,
    defaultReps: 10,
    defaultHoldSeconds: 5,
    defaultLoadOrBand: 'Bodyweight',
    instructionsAr: 'اسحب الذقن للخلف ببطء باتجاه الرقبة (كأنك تصنع ذقناً مزدوجاً) دون إمالة الرأس للأعلى أو الأسفل، اثبت 5 ثوانٍ ثم استرخِ.',
    instructionsEn: 'Gently draw your chin straight back while keeping eyes level. Hold for 5 seconds, then relax.',
    precautionsAr: 'تجنب حبس النفس أو الشعور بتنميل في الذراع.',
    precautionsEn: 'Avoid breath-holding or peripheralizing arm symptoms.',
  },
  {
    id: 'ex_cerv_scap_retraction',
    nameAr: 'تقريب لوحي الكتف بشريط مطاطي (Scapular Retraction Row)',
    nameEn: 'Seated TheraBand Scapular Retraction',
    region: 'cervical',
    goal: 'strengthening',
    equipmentAr: 'شريط مطاطي (TheraBand)',
    equipmentEn: 'TheraBand',
    defaultSets: 3,
    defaultReps: 12,
    defaultHoldSeconds: 3,
    defaultLoadOrBand: 'Yellow / Red Band',
    instructionsAr: 'اسحب الشريط المطاطي للخلف مع ضم لوحي الكتف للداخل والأسفل دون رفع الأكتاف نحو الأذنين.',
    instructionsEn: 'Pull band back by squeezing shoulder blades together and down without shrugging.',
  },
  {
    id: 'ex_shld_pendulum',
    nameAr: 'تمرين البندول لتحريك مفصل الكتف (Codman Pendulum)',
    nameEn: 'Codman Pendulum Shoulder Mobility',
    region: 'shoulder',
    goal: 'mobility_rom',
    equipmentAr: 'طاولة استناد',
    equipmentEn: 'Support Table',
    defaultSets: 2,
    defaultReps: 20,
    defaultHoldSeconds: 0,
    defaultLoadOrBand: 'Unweighted / 1 kg',
    instructionsAr: 'انحنِ للأمام مستنداً باليد السليمة، واترك الذراع المصابة تتأرجح في دوائر صغيرة مستخدماً حركة الجذع وليس عضلات الكتف.',
    instructionsEn: 'Lean forward supporting yourself with good arm; let affected arm swing gently in small circles using trunk momentum.',
  },
  {
    id: 'ex_shld_er_band',
    nameAr: 'دوران خارجي للكتف بشريط مطاطي (External Rotation at 0°)',
    nameEn: 'Resisted Shoulder External Rotation (0° Abduction)',
    region: 'shoulder',
    goal: 'strengthening',
    equipmentAr: 'شريط مطاطي + منشفة تحت المرفق',
    equipmentEn: 'TheraBand + Towel Roll',
    defaultSets: 3,
    defaultReps: 15,
    defaultHoldSeconds: 2,
    defaultLoadOrBand: 'Red Band',
    instructionsAr: 'ضع منشفة صغيرة بين المرفق والجذع بزاوية 90 درجة، واسحب الشريط للخارج ببطء ثم عد ببطء خلال 3 ثوانٍ.',
    instructionsEn: 'Keep towel roll tucked under elbow bent at 90°; rotate forearm outward against band resistance and return slowly.',
  },
  {
    id: 'ex_shld_wall_slide',
    nameAr: 'انزلاق الذراعين على الحائط للأعلى (Serratus Wall Slides)',
    nameEn: 'Scapular Wall Slides with Upward Rotation',
    region: 'shoulder',
    goal: 'mobility_rom',
    equipmentAr: 'حائط + منشفة',
    equipmentEn: 'Wall + Towel',
    defaultSets: 3,
    defaultReps: 10,
    defaultHoldSeconds: 3,
    defaultLoadOrBand: 'Bodyweight',
    instructionsAr: 'ضع الساعدين على الحائط وادفع برفق للأمام مع الانزلاق للأعلى في حدود المدى الخالي من الألم.',
    instructionsEn: 'Place forearms on wall with gentle protraction and slide upward within pain-free range.',
  },
  {
    id: 'ex_lumb_mckenzie',
    nameAr: 'تمرين مكنزي لبسط العمود الفقري القطني (Prone Lumbar Extension)',
    nameEn: 'McKenzie Prone Press-Up (Lumbar Extension)',
    region: 'thoracic_lumbar',
    goal: 'pain_modulation',
    equipmentAr: 'سرير علاجي / بساط أرضي',
    equipmentEn: 'Mat / Plinth',
    defaultSets: 3,
    defaultReps: 10,
    defaultHoldSeconds: 2,
    defaultLoadOrBand: 'Bodyweight',
    instructionsAr: 'استلقِ على بطنك، ضع اليدين تحت الكتفين، وادفع الجزء العلوي للأعلى مع إبقاء الحوض وأسفل الظهر مسترخيين تماماً.',
    instructionsEn: 'Lie prone, place hands under shoulders, press chest up while keeping pelvis and low back relaxed.',
    precautionsAr: 'توقف فوراً إذا انتشر الألم أو الخدر باتجاه الساق أو القدم (Peripheralization).',
    precautionsEn: 'Stop immediately if pain or numbness radiates further down the leg.',
  },
  {
    id: 'ex_lumb_bird_dog',
    nameAr: 'تمرين الثبات القطني المتبادل (Bird-Dog Quadruped Stabilization)',
    nameEn: 'Quadruped Bird-Dog Core Stabilization',
    region: 'thoracic_lumbar',
    goal: 'core_stability',
    equipmentAr: 'بساط علاجي',
    equipmentEn: 'Exercise Mat',
    defaultSets: 3,
    defaultReps: 10,
    defaultHoldSeconds: 5,
    defaultLoadOrBand: 'Bodyweight',
    instructionsAr: 'من وضع الارتكاز الرباعي، شد عضلات البطن العميقة ومد الذراع اليمنى مع الساق اليسرى باستقامة دون ميلان الحوض.',
    instructionsEn: 'From all fours, brace core and extend opposite arm and leg while keeping lumbar spine neutral.',
  },
  {
    id: 'ex_lumb_dead_bug',
    nameAr: 'تمرين الثبات الأمامي للعمود الفقري (Supine Dead Bug)',
    nameEn: 'Supine Dead Bug Core Control',
    region: 'thoracic_lumbar',
    goal: 'core_stability',
    equipmentAr: 'بساط علاجي',
    equipmentEn: 'Exercise Mat',
    defaultSets: 3,
    defaultReps: 12,
    defaultHoldSeconds: 3,
    defaultLoadOrBand: 'Bodyweight',
    instructionsAr: 'استلقِ على ظهرك مع رفع الركبتين 90 درجة، حافظ على ثبات أسفل الظهر على الأرض أثناء مد ساق واحدة ببطء.',
    instructionsEn: 'Lie supine in tabletop position; maintain neutral pelvic imprint while slowly lowering opposite arm and heel.',
  },
  {
    id: 'ex_hip_clamshell',
    nameAr: 'تقوية العضلة الألوية الوسطى (Side-Lying Clamshells)',
    nameEn: 'Side-Lying Resisted Clamshells (Gluteus Medius)',
    region: 'hip_pelvis',
    goal: 'strengthening',
    equipmentAr: 'حلقة مطاطية (Mini Loop Band)',
    equipmentEn: 'Mini Resistance Loop',
    defaultSets: 3,
    defaultReps: 15,
    defaultHoldSeconds: 3,
    defaultLoadOrBand: 'Green Loop Band',
    instructionsAr: 'استلقِ على جانبك مع ثني الركبتين، ارفع الركبة العليا للأعلى مع إبقاء القدمين متلاصقتين ودون تدوير الحوض للخلف.',
    instructionsEn: 'Lie on side with knees bent; lift top knee while keeping feet together and pelvis stacked vertically.',
  },
  {
    id: 'ex_hip_glute_bridge',
    nameAr: 'تمرين الجسر لرفع الحوض وتقوية الألوية (Glute Bridge)',
    nameEn: 'Supine Bilateral / Unilateral Glute Bridge',
    region: 'hip_pelvis',
    goal: 'strengthening',
    equipmentAr: 'بساط علاجي',
    equipmentEn: 'Exercise Mat',
    defaultSets: 3,
    defaultReps: 12,
    defaultHoldSeconds: 5,
    defaultLoadOrBand: 'Bodyweight / Band',
    instructionsAr: 'اضغط بالكعبين على الأرض وارفع الحوض حتى يستقيم الجذع مع الفخذين، اثبت 5 ثوانٍ ثم انزل ببطء.',
    instructionsEn: 'Drive through heels to lift hips until knees, hips, and shoulders align. Hold 5 seconds.',
  },
  {
    id: 'ex_knee_quad_set',
    nameAr: 'شد العضلة الرباعية الثابت مع رفع الساق المستقيمة (Quad Sets & SLR)',
    nameEn: 'Isometric Quad Sets & Straight Leg Raise (SLR)',
    region: 'knee',
    goal: 'strengthening',
    equipmentAr: 'منشفة ملفوفة تحت الركبة / أوزان كاحل',
    equipmentEn: 'Towel Roll / Cuff Weight',
    defaultSets: 3,
    defaultReps: 15,
    defaultHoldSeconds: 5,
    defaultLoadOrBand: '1.5 kg Ankle Weight',
    instructionsAr: 'اضغط خلف الركبة لأسفل لشد عضلة الفخذ الأمامية بالكامل ثم ارفع الساق مستقيمة لمستوى الركبة الأخرى.',
    instructionsEn: 'Tighten thigh muscle pressing back of knee down, locking knee fully before lifting straight leg 45 degrees.',
  },
  {
    id: 'ex_knee_tke',
    nameAr: 'المد النهائي للركبة من الوقوف بشريط مطاطي (Terminal Knee Extension - TKE)',
    nameEn: 'Standing Resisted Terminal Knee Extension (TKE)',
    region: 'knee',
    goal: 'strengthening',
    equipmentAr: 'شريط مطاطي مثبت خلف الركبة',
    equipmentEn: 'Anchored Resistance Band',
    defaultSets: 3,
    defaultReps: 15,
    defaultHoldSeconds: 3,
    defaultLoadOrBand: 'Blue / Black Band',
    instructionsAr: 'ثبت الشريط خلف الركبة، ابدأ بزاوية ثني 30 درجة ثم افرد الركبة للآخر مع عصر عضلة الفخذ الأمامية.',
    instructionsEn: 'With band looped behind knee, extend from 30° flexion to full terminal extension squeezing quadriceps.',
  },
  {
    id: 'ex_knee_step_down',
    nameAr: 'النزول المتدرج المتحكم من درجة (Eccentric Lateral Step-Down)',
    nameEn: 'Controlled Eccentric Lateral Step-Down',
    region: 'knee',
    goal: 'neuromuscular_balance',
    equipmentAr: 'صندوق متدرج 15 سم (Step Box)',
    equipmentEn: '15cm Step Box',
    defaultSets: 3,
    defaultReps: 10,
    defaultHoldSeconds: 0,
    defaultLoadOrBand: 'Bodyweight / 4 kg',
    instructionsAr: 'قف على الدرجة بالساق المصابة، وانزل ببطء خلال 3 ثوانٍ لملامسة الكعب الآخر للأرض مع منع انحراف الركبة للداخل (Valgus).',
    instructionsEn: 'Stand on step, slowly lower opposite heel to floor over 3 seconds while keeping knee aligned over 2nd toe.',
  },
  {
    id: 'ex_ankle_balance',
    nameAr: 'التوازن الأحادي واستقبال الحس العميق للكاحل (Single-Leg Proprioception)',
    nameEn: 'Single-Leg Balance & Proprioceptive Training',
    region: 'ankle_foot',
    goal: 'neuromuscular_balance',
    equipmentAr: 'وسادة توازن هوائية (Airex / BOSU)',
    equipmentEn: 'Foam Pad / BOSU',
    defaultSets: 3,
    defaultReps: 4,
    defaultHoldSeconds: 30,
    defaultLoadOrBand: 'Unstable Foam Surface',
    instructionsAr: 'قف على قدم واحدة فوق وسادة التوازن لمدة 30 ثانية مع الحفاظ على ثبات الكاحل والحوض.',
    instructionsEn: 'Maintain single-leg stance on foam pad for 30 seconds keeping arch domed and pelvis level.',
  },
  {
    id: 'ex_ankle_ecc_calf',
    nameAr: 'تقوية عضلة السمانة ووتر أخيل اللامركزية (Alfredson Eccentric Heel Drop)',
    nameEn: 'Eccentric Calf Raise / Heel Drop on Step',
    region: 'ankle_foot',
    goal: 'strengthening',
    equipmentAr: 'حافة درجة',
    equipmentEn: 'Step Edge',
    defaultSets: 3,
    defaultReps: 15,
    defaultHoldSeconds: 2,
    defaultLoadOrBand: 'Bodyweight / Weighted Backpack',
    instructionsAr: 'اصعد بكلتا القدمين، ثم ارفع القدم السليمة وانزل بالكعب المصاب ببطء شديد تحت مستوى الدرجة.',
    instructionsEn: 'Rise up on both feet, shift weight to affected leg, and lower heel slowly below step level.',
  },
  {
    id: 'ex_neuro_sit_to_stand',
    nameAr: 'تدريب النهوض الوظيفي المتكرر من الكرسي (Functional Sit-to-Stand)',
    nameEn: 'Task-Specific Sit-to-Stand Transfer Training',
    region: 'neuro_balance',
    goal: 'neuromuscular_balance',
    equipmentAr: 'كرسي قياسي 45 سم',
    equipmentEn: 'Standard 45cm Chair',
    defaultSets: 3,
    defaultReps: 10,
    defaultHoldSeconds: 2,
    defaultLoadOrBand: 'Bodyweight',
    instructionsAr: 'قدم القدمين للخلف قليلاً، انحنِ بالجذع للأمام ("الأنف فوق أصابع القدم") وانهض بتوزيع متساوٍ للوزن على الساقين.',
    instructionsEn: 'Bring feet slightly back, lean trunk forward ("nose over toes"), and stand with symmetrical weight-bearing.',
  },
];

export const PT_EXERCISE_CATALOG: ExerciseLibraryItem[] = BASE_PT_EXERCISE_CATALOG.map((item) => ({
  ...item,
  governance: {
    source: 'PhysioRecord Original Bilingual Rehabilitation Exercise Library',
    reviewedBy: null,
    reviewedDate: null,
  },
}));

export const DEFAULT_QUICK_SOAP_CHIPS: QuickSoapChip[] = [
  {
    id: 'chip_ex_chin_tuck',
    category: 'exercise',
    labelAr: 'سحب الذقن (Chin Tucks)',
    labelEn: 'Chin Tucks',
    exerciseId: 'ex_cerv_chin_tuck',
    sets: 3,
    reps: 10,
    holdSeconds: 5,
    loadOrBand: 'Bodyweight',
  },
  {
    id: 'chip_ex_mckenzie',
    category: 'exercise',
    labelAr: 'بسط قطني (McKenzie)',
    labelEn: 'McKenzie Extension',
    exerciseId: 'ex_lumb_mckenzie',
    sets: 3,
    reps: 10,
    holdSeconds: 3,
    loadOrBand: 'Bodyweight',
  },
  {
    id: 'chip_ex_quad_sets',
    category: 'exercise',
    labelAr: 'تقوية رباعية (Quad Sets)',
    labelEn: 'Quad Sets',
    exerciseId: 'ex_knee_quad_sets',
    sets: 3,
    reps: 12,
    holdSeconds: 5,
    loadOrBand: 'Bodyweight',
  },
  {
    id: 'chip_mt_mwm',
    category: 'manual',
    labelAr: 'تحريك مفصلي (MWM)',
    labelEn: 'Joint Mobilization (MWM)',
    manualTechniqueAr: 'تحريك مفصلي مع الحركة (Mulligan MWM)',
    manualTechniqueEn: 'Mobilization with Movement (MWM)',
    manualTarget: 'Target Joint',
    manualGrade: 'MWM',
    durationMinutes: 10,
  },
  {
    id: 'chip_mt_myofascial',
    category: 'manual',
    labelAr: 'تحرير عضلي (Myofascial)',
    labelEn: 'Myofascial Release',
    manualTechniqueAr: 'تحرير الأنسجة الرخوة ونقاط التحفيز',
    manualTechniqueEn: 'Myofascial / Trigger Point Release',
    manualTarget: 'Paraspinal / Target Muscle',
    manualGrade: 'Soft Tissue',
    durationMinutes: 10,
  },
  {
    id: 'chip_mod_tens',
    category: 'modality',
    labelAr: 'TENS مسكن',
    labelEn: 'TENS Analgesic',
    modalityType: 'TENS',
    modalityParams: '100Hz, 150µs',
    durationMinutes: 15,
  },
  {
    id: 'chip_mod_us',
    category: 'modality',
    labelAr: 'أمواج صوتية US',
    labelEn: 'Ultrasound',
    modalityType: 'Ultrasound',
    modalityParams: '1MHz, 1.2 W/cm²',
    durationMinutes: 8,
  },
  {
    id: 'chip_mod_dry_needling',
    category: 'modality',
    labelAr: 'إبر جافة (Dry Needling)',
    labelEn: 'Dry Needling',
    modalityType: 'DryNeedling',
    modalityParams: 'Trigger Points',
    durationMinutes: 10,
  },
];

export function formatIQD(amount: number, isAr = true): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  const formattedAbs = new Intl.NumberFormat('en-US').format(Math.abs(safe));
  const signed = safe < 0 ? `\u2212${formattedAbs}` : formattedAbs;
  return isAr ? `${signed} د.ع` : `${signed} IQD`;
}

// -----------------------------------------------------------------------
// 3. In-Memory Unlocked Vault Operations Cache (Zero PHI in localStorage)
// -----------------------------------------------------------------------
interface OperationsMemoryCache {
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

export const DEFAULT_VITALS_THRESHOLDS: VitalsAlertThresholds = {
  bpSystolicHigh: 180,
  bpSystolicLow: 90,
  bpDiastolicHigh: 110,
  bpDiastolicLow: 55,
  hrHigh: 120,
  hrLow: 50,
  spO2Low: 92,
  verificationStatus: 'needs_expert_verification',
};

function createDefaultCache(): OperationsMemoryCache {
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

export type ColdStoreName =
  | 'auditLogs'
  | 'customWidgets'
  | 'noteTemplates'
  | 'attachments'
  | 'consents'
  | 'episodeClinical'
  | 'patientMedications';

const ALL_COLD_STORES: readonly ColdStoreName[] = [
  'auditLogs',
  'customWidgets',
  'noteTemplates',
  'attachments',
  'consents',
  'episodeClinical',
  'patientMedications',
];

// -----------------------------------------------------------------------
// 4. ClinicOperationsService
// -----------------------------------------------------------------------
export class ClinicOperationsService {
  private static cache: OperationsMemoryCache = createDefaultCache();
  private static activeDek: CryptoKey | null = null;
  private static activeDb: PhysioRecordDatabase = defaultDb;
  private static versionMap: Map<string, number> = new Map();
  private static pendingWrites: Set<Promise<void>> = new Set();
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
      } catch {
        // ignore subscriber errors
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
    } catch {
      return null;
    }
  }

  /**
   * Decrypts Phase 1 / Dexie operational & settings stores into memory on unlock.
   * Pass `{ lazyHeavyStores: true }` during interactive unlock to defer heavy cold stores
   * (`attachments`, `consents`, `episodeClinical`, `patientMedications`, `auditLogs`,
   * `noteTemplates`, `customWidgets`) until opened on demand.
   */
  static async hydrateEncryptedCache(
    dek: CryptoKey,
    database: PhysioRecordDatabase = defaultDb,
    options?: { lazyHeavyStores?: boolean }
  ): Promise<void> {
    this.activeDek = dek;
    this.activeDb = database;
    this.loadedColdStores.clear();
    this.coldStoreLoadPromises.clear();
    this.loadedColdPatientIds.clear();
    this.loadedColdEpisodeIds.clear();
    this.coldPatientLoadPromises.clear();

    const lazyHeavyStores = Boolean(options?.lazyHeavyStores);
    const nextCache = createDefaultCache();
    const nextVersionMap = new Map<string, number>();

    const decryptSafe = <T>(
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
    ): Promise<T | null> =>
      this.decryptStoreEntity<T>(dek, nextVersionMap, tableName, id, parentIds, entity);

    const canUseV8Tables =
      !database.verno || database.verno >= 8;
    const canUseV9Tables =
      !database.verno || database.verno >= 9;

    const [
      apptEntities,
      waitEntities,
      invEntities,
      payEntities,
      expEntities,
      auditEntities,
      staffEntities,
      epEntities,
      widgetEntities,
      recEntities,
      skipEntities,
      settingEntities,
      medEntities,
      consentEntities,
      cashCloseEntities,
      attachmentEntities,
      noteTemplateEntities,
      patientCount,
    ] = await Promise.all([
      database.appointments.toArray(),
      database.waitingList.toArray(),
      database.invoices.toArray(),
      database.payments.toArray(),
      database.expenses.toArray(),
      lazyHeavyStores ? Promise.resolve([]) : database.auditLogs.toArray(),
      database.staffState.toArray(),
      lazyHeavyStores ? Promise.resolve([]) : database.episodeClinical.toArray(),
      lazyHeavyStores ? Promise.resolve([]) : database.customWidgets.toArray(),
      database.recurringSchedules.toArray(),
      database.recurringSkippedDates.toArray(),
      database.clinicSettings.toArray(),
      lazyHeavyStores ? Promise.resolve([]) : database.patientMedications.toArray(),
      !lazyHeavyStores && canUseV8Tables && database.consents
        ? database.consents.toArray()
        : Promise.resolve([]),
      canUseV8Tables && database.cashCloses ? database.cashCloses.toArray() : Promise.resolve([]),
      !lazyHeavyStores && canUseV9Tables && database.attachments
        ? database.attachments.toArray()
        : Promise.resolve([]),
      !lazyHeavyStores && canUseV9Tables && database.noteTemplates
        ? database.noteTemplates.toArray()
        : Promise.resolve([]),
      database.patients.count(),
    ]);

    for (const row of apptEntities) {
      const dec = await decryptSafe<ClinicAppointment>('appointments', row.id, [], row);
      if (dec && dec.patientId) {
        nextCache.appointments.push({ ...dec, version: row.version ?? dec.version ?? 1 });
      }
    }

    for (const row of waitEntities) {
      const dec = await decryptSafe<WaitingListEntry>('waitingList', row.id, [], row);
      if (dec && dec.patientId) {
        nextCache.waitingList.push({ ...dec, version: row.version ?? dec.version ?? 1 });
      }
    }

    const paymentsByInvoice = new Map<string, PaymentTransactionIQD[]>();
    for (const pRow of payEntities) {
      const dec = await decryptSafe<PaymentTransactionIQD>(
        'payments',
        pRow.id,
        [pRow.invoiceId],
        pRow
      );
      if (dec) {
        const list = paymentsByInvoice.get(pRow.invoiceId) || [];
        list.push(dec);
        paymentsByInvoice.set(pRow.invoiceId, list);
      }
    }

    for (const row of invEntities) {
      const dec = await decryptSafe<FinancialInvoiceIQD>('invoices', row.id, [], row);
      if (dec && dec.patientId) {
        const mergedPayments = new Map<string, PaymentTransactionIQD>();
        for (const p of dec.payments || []) mergedPayments.set(p.id, p);
        for (const p of paymentsByInvoice.get(dec.id) || []) mergedPayments.set(p.id, p);
        nextCache.invoices.push({
          ...dec,
          payments: Array.from(mergedPayments.values()),
          version: row.version ?? dec.version ?? 1,
        });
      }
    }

    for (const row of expEntities) {
      const dec = await decryptSafe<ClinicExpenseIQD>('expenses', row.id, [], row);
      if (dec) {
        nextCache.expenses.push({ ...dec, version: row.version ?? dec.version ?? 1 });
      }
    }

    const loadedLogs: AuditLogEntry[] = [];
    for (const row of auditEntities) {
      const dec = await decryptSafe<AuditLogEntry>('auditLogs', row.id, [], row);
      if (dec) loadedLogs.push(dec);
    }
    loadedLogs.sort((a, b) => {
      if (typeof a.sequence === 'number' && typeof b.sequence === 'number') {
        return b.sequence - a.sequence;
      }
      return b.timestamp.localeCompare(a.timestamp);
    });
    nextCache.auditLogs = loadedLogs;

    for (const row of staffEntities) {
      if (row.id === 'active_staff') {
        const dec = await decryptSafe<{ activeStaffId?: string }>('staffState', row.id, [], row);
        if (dec?.activeStaffId) nextCache.activeStaffId = dec.activeStaffId;
      } else if (row.id === 'staff_roster') {
        const dec = await decryptSafe<ClinicStaffMember[] | { roster?: ClinicStaffMember[] }>(
          'staffState',
          row.id,
          [],
          row
        );
        const arr = Array.isArray(dec) ? dec : Array.isArray(dec?.roster) ? dec.roster : null;
        if (arr && arr.length > 0) nextCache.staffRoster = arr;
      }
    }

    for (const row of epEntities) {
      const dec = await decryptSafe<EpisodeScopedClinicalStore>(
        'episodeClinical',
        row.id,
        [row.episodeId],
        row
      );
      if (dec && dec.episodeId) {
        nextCache.episodeClinicalByEpisodeId.set(dec.episodeId, dec);
      }
    }

    for (const row of widgetEntities) {
      const dec = await decryptSafe<CustomWidgetDefinition>('customWidgets', row.id, [], row);
      if (dec && dec.id) {
        const validated = validateCustomWidgetDefinition(dec);
        if (validated.ok) nextCache.customWidgets.push(validated.data);
      }
    }

    for (const row of recEntities) {
      const dec = await decryptSafe<RecurringPatientSchedule>(
        'recurringSchedules',
        row.id,
        [],
        row
      );
      if (dec && dec.patientId && Array.isArray(dec.weekdays) && dec.weekdays.length > 0) {
        nextCache.recurringSchedules.push({ ...dec, version: row.version ?? dec.version ?? 1 });
      }
    }

    for (const row of skipEntities) {
      const dec = await decryptSafe<{ scheduleId: string; date: string; updatedAt?: string }>(
        'recurringSkippedDates',
        row.id,
        [],
        row
      );
      if (dec && dec.scheduleId && dec.date) {
        nextCache.recurringSkippedDates.set(row.id, {
          scheduleId: dec.scheduleId,
          date: dec.date,
          updatedAt: dec.updatedAt || row.updatedAt,
          version: row.version ?? 1,
        });
      }
    }

    for (const row of medEntities) {
      const dec = await decryptSafe<PatientMedicationPlan>(
        'patientMedications',
        row.id,
        [row.patientId],
        row
      );
      if (dec && dec.patientId) {
        nextCache.patientMedicationsByPatientId.set(dec.patientId, {
          ...dec,
          version: row.version ?? dec.version ?? 1,
        });
      }
    }

    for (const row of consentEntities as EncryptedConsentEntity[]) {
      const dec = await decryptSafe<PatientConsentRecord>(
        'consents',
        row.id,
        [row.patientId],
        row
      );
      if (dec && dec.patientId) {
        const list = nextCache.consentsByPatientId.get(dec.patientId) || [];
        list.push({ ...dec, version: row.version ?? dec.version ?? 1 });
        nextCache.consentsByPatientId.set(dec.patientId, list);
      }
    }

    for (const row of cashCloseEntities as EncryptedCashCloseEntity[]) {
      const dec = await decryptSafe<CashCloseZReportRecord>('cashCloses', row.id, [], row);
      if (dec && dec.dateKey) {
        nextCache.cashCloses.push({ ...dec, version: row.version ?? dec.version ?? 1 });
      }
    }
    nextCache.cashCloses.sort((a, b) => b.closedAt.localeCompare(a.closedAt));

    for (const row of attachmentEntities as EncryptedAttachmentEntity[]) {
      const dec = await decryptSafe<EncryptedAttachmentRecord>(
        'attachments',
        row.id,
        [row.patientId],
        row
      );
      if (dec && dec.patientId) {
        const list = nextCache.attachmentsByPatientId.get(dec.patientId) || [];
        list.push({ ...dec, version: row.version ?? dec.version ?? 1 });
        nextCache.attachmentsByPatientId.set(dec.patientId, list);
      }
    }

    for (const row of noteTemplateEntities as EncryptedNoteTemplateEntity[]) {
      const dec = await decryptSafe<NoteTemplateSnippet>('noteTemplates', row.id, [], row);
      if (dec && dec.slashTrigger) {
        nextCache.noteTemplates.push({ ...dec, version: row.version ?? dec.version ?? 1 });
      }
    }

    for (const row of settingEntities) {
      const dec = await decryptSafe<Record<string, unknown>>('clinicSettings', row.id, [], row);
      if (!dec) continue;
      if (row.id === 'clinic_profile') {
        nextCache.clinicProfile = { ...nextCache.clinicProfile, ...(dec as Partial<ClinicProfileData>) };
      } else if (row.id === 'admin_auth') {
        nextCache.adminAuth = dec as unknown as AdminPinAuthRecord;
      } else if (row.id === 'pin_rate_limit') {
        nextCache.pinRateLimit = dec as unknown as PinRateLimitState;
      } else if (row.id === 'security_config') {
        nextCache.securityConfig = {
          ...nextCache.securityConfig,
          ...(dec as Partial<SecurityConfigSettings>),
        };
      } else if (row.id === 'module_flags') {
        const flags = dec as Partial<ModuleFlagsSettings> & { receptionPrivacyBlur?: boolean };
        nextCache.moduleFlags = {
          ...nextCache.moduleFlags,
          showHepLibrary: Boolean(flags.showHepLibrary),
          enableCustomWidgetStudio: Boolean(flags.enableCustomWidgetStudio),
          enableSmartGoalsGas: Boolean(flags.enableSmartGoalsGas),
          enableConsentModule: Boolean(flags.enableConsentModule),
          enableAttachmentsModule: Boolean(flags.enableAttachmentsModule),
          enableVoiceDictationModule: Boolean(flags.enableVoiceDictationModule),
          allowCloudSpeechFallbackOptIn: Boolean(flags.allowCloudSpeechFallbackOptIn),
          enableTemplatesModule: Boolean(flags.enableTemplatesModule),
          enableAnalyticsModule: Boolean(flags.enableAnalyticsModule),
          enableKioskModule: Boolean(flags.enableKioskModule),
          enableProblemListGoals:
            typeof flags.enableProblemListGoals === 'boolean' ? flags.enableProblemListGoals : true,
          enableReEvalNudges: Boolean(flags.enableReEvalNudges),
          reEvalAfterSessions:
            typeof flags.reEvalAfterSessions === 'number' && flags.reEvalAfterSessions > 0
              ? flags.reEvalAfterSessions
              : 6,
          reEvalAfterDays:
            typeof flags.reEvalAfterDays === 'number' && flags.reEvalAfterDays > 0
              ? flags.reEvalAfterDays
              : 21,
          enableNoteCompletenessCheck:
            typeof flags.enableNoteCompletenessCheck === 'boolean'
              ? flags.enableNoteCompletenessCheck
              : true,
          enablePerformanceTestLibrary:
            typeof flags.enablePerformanceTestLibrary === 'boolean'
              ? flags.enablePerformanceTestLibrary
              : true,
          modalitySafetyReviewedBy: flags.modalitySafetyReviewedBy,
          modalitySafetyReviewedAt: flags.modalitySafetyReviewedAt,
          enableModalitySafetyCheck: Boolean(
            flags.enableModalitySafetyCheck && flags.modalitySafetyReviewedBy
          ),
          enableVitalsModule:
            typeof flags.enableVitalsModule === 'boolean' ? flags.enableVitalsModule : true,
          vitalsThresholds: flags.vitalsThresholds
            ? { ...DEFAULT_VITALS_THRESHOLDS, ...flags.vitalsThresholds }
            : { ...DEFAULT_VITALS_THRESHOLDS },
          enablePediatricSafeguards:
            typeof flags.enablePediatricSafeguards === 'boolean'
              ? flags.enablePediatricSafeguards
              : true,
          enablePediatricGeometricPainIcons:
            typeof flags.enablePediatricGeometricPainIcons === 'boolean'
              ? flags.enablePediatricGeometricPainIcons
              : true,
          customExamPresets: Array.isArray(flags.customExamPresets) ? flags.customExamPresets : [],
          enableHomeVisits:
            typeof flags.enableHomeVisits === 'boolean' ? flags.enableHomeVisits : true,
          enablePracticeLocations:
            typeof flags.enablePracticeLocations === 'boolean'
              ? flags.enablePracticeLocations
              : true,
          enableClosedDaysBreaks:
            typeof flags.enableClosedDaysBreaks === 'boolean'
              ? flags.enableClosedDaysBreaks
              : true,
          enableHijriDateDisplay:
            typeof flags.enableHijriDateDisplay === 'boolean'
              ? flags.enableHijriDateDisplay
              : false,
          enableInstallmentPlans:
            typeof flags.enableInstallmentPlans === 'boolean'
              ? flags.enableInstallmentPlans
              : true,
          enableRecurringExpenses:
            typeof flags.enableRecurringExpenses === 'boolean'
              ? flags.enableRecurringExpenses
              : true,
          enableReferralsModule:
            typeof flags.enableReferralsModule === 'boolean'
              ? flags.enableReferralsModule
              : true,
          enableRetentionLists:
            typeof flags.enableRetentionLists === 'boolean' ? flags.enableRetentionLists : true,
          retentionInactiveDaysThreshold:
            typeof flags.retentionInactiveDaysThreshold === 'number' &&
            flags.retentionInactiveDaysThreshold > 0
              ? flags.retentionInactiveDaysThreshold
              : 14,
          practiceLocations:
            Array.isArray(flags.practiceLocations) && flags.practiceLocations.length > 0
              ? flags.practiceLocations
              : cloneDefaultLocations(),
          weeklyBreaks: Array.isArray(flags.weeklyBreaks)
            ? flags.weeklyBreaks
            : cloneDefaultBreaks(),
          closedDateRanges: Array.isArray(flags.closedDateRanges) ? flags.closedDateRanges : [],
          recurringExpenseTemplates:
            Array.isArray(flags.recurringExpenseTemplates) &&
            flags.recurringExpenseTemplates.length > 0
              ? flags.recurringExpenseTemplates
              : cloneDefaultRecurringExpenseTemplates(),
          referringDoctors: Array.isArray(flags.referringDoctors) ? flags.referringDoctors : [],
          postDischargeFollowUps: Array.isArray(flags.postDischargeFollowUps)
            ? flags.postDischargeFollowUps
            : [],
          enableImportWizard:
            typeof flags.enableImportWizard === 'boolean' ? flags.enableImportWizard : true,
          enableTrashRecycleBin:
            typeof flags.enableTrashRecycleBin === 'boolean' ? flags.enableTrashRecycleBin : true,
          enableDataHealthScreen:
            typeof flags.enableDataHealthScreen === 'boolean' ? flags.enableDataHealthScreen : true,
          enableBilingualTerminologyGlossary:
            typeof flags.enableBilingualTerminologyGlossary === 'boolean'
              ? flags.enableBilingualTerminologyGlossary
              : true,
          recycleBinItems: Array.isArray(flags.recycleBinItems) ? flags.recycleBinItems : [],
          enableWebShareInterop:
            typeof flags.enableWebShareInterop === 'boolean'
              ? flags.enableWebShareInterop
              : true,
          enableIcsCalendarExport:
            typeof flags.enableIcsCalendarExport === 'boolean'
              ? flags.enableIcsCalendarExport
              : true,
          enableScheduleVisitCardPrint:
            typeof flags.enableScheduleVisitCardPrint === 'boolean'
              ? flags.enableScheduleVisitCardPrint
              : true,
          enablePhotoMeasurementTools:
            typeof flags.enablePhotoMeasurementTools === 'boolean'
              ? flags.enablePhotoMeasurementTools
              : true,
          settingsViewMode:
            flags.settingsViewMode === 'simple' || flags.settingsViewMode === 'advanced'
              ? flags.settingsViewMode
              : 'advanced',
          publicDemoModeEnabled:
            typeof flags.publicDemoModeEnabled === 'boolean'
              ? flags.publicDemoModeEnabled
              : false,
          updatedAt: flags.updatedAt || row.updatedAt,
          version: row.version ?? flags.version ?? 1,
        };
        if (typeof flags.receptionPrivacyBlur === 'boolean') {
          nextCache.receptionPrivacyBlur = flags.receptionPrivacyBlur;
        }
      } else if (row.id === 'mrn_registry') {
        const mrn = dec as Partial<MrnRegistryData>;
        nextCache.mrnRegistry = {
          id: 'mrn_registry',
          issuedMrns: Array.isArray(mrn.issuedMrns) ? mrn.issuedMrns : [],
          ...(mrn.patientMrnMap ? { patientMrnMap: mrn.patientMrnMap } : {}),
          sequence: typeof mrn.sequence === 'number' ? mrn.sequence : 0,
          updatedAt: mrn.updatedAt || row.updatedAt,
          version: row.version ?? mrn.version ?? 1,
        };
      } else if (row.id === 'backup_meta') {
        nextCache.backupMeta = { ...nextCache.backupMeta, ...(dec as Partial<BackupStateMetadata>) };
      } else if (row.id === 'write_telemetry') {
        const wt = dec as Partial<WriteTelemetryStats>;
        const today = localDate();
        nextCache.writeTelemetry = {
          id: 'write_telemetry',
          totalWrites: typeof wt.totalWrites === 'number' ? wt.totalWrites : 0,
          writesToday: wt.dayKey === today && typeof wt.writesToday === 'number' ? wt.writesToday : 0,
          dayKey: today,
          averageDailyWrites:
            typeof wt.averageDailyWrites === 'number' ? wt.averageDailyWrites : 0,
          updatedAt: wt.updatedAt || row.updatedAt,
          version: row.version ?? wt.version ?? 1,
        };
      } else if (row.id === 'workspace_mode') {
        const wm = dec as Partial<WorkspaceModeSettings>;
        nextCache.workspaceMode = {
          id: 'workspace_mode',
          mode: wm.mode === 'team' ? 'team' : 'solo',
          wizardCompleted: Boolean(wm.wizardCompleted),
          updatedAt: wm.updatedAt || row.updatedAt,
          version: row.version ?? wm.version ?? 1,
        };
      } else if (row.id === 'smart_memory') {
        const sm = dec as Partial<SmartMemorySettings>;
        nextCache.smartMemory = {
          id: 'smart_memory',
          lastDurationMinutes:
            typeof sm.lastDurationMinutes === 'number' && sm.lastDurationMinutes > 0
              ? sm.lastDurationMinutes
              : undefined,
          lastRoom: typeof sm.lastRoom === 'string' && sm.lastRoom.trim() ? sm.lastRoom : undefined,
          lastPaymentMethod: sm.lastPaymentMethod,
          recentPatientIds: Array.isArray(sm.recentPatientIds) ? sm.recentPatientIds.slice(0, 12) : [],
          pinnedPatientIds: Array.isArray(sm.pinnedPatientIds) ? sm.pinnedPatientIds : [],
          services: Array.isArray(sm.services) ? sm.services : [],
          updatedAt: sm.updatedAt || row.updatedAt,
          version: row.version ?? sm.version ?? 1,
        };
      } else if (row.id === 'quick_soap_prefs') {
        const qp = dec as Partial<QuickSoapPreferences>;
        nextCache.quickSoapPrefs = {
          id: 'quick_soap_prefs',
          favoriteChips: Array.isArray(qp.favoriteChips) ? qp.favoriteChips : [...DEFAULT_QUICK_SOAP_CHIPS],
          updatedAt: qp.updatedAt || row.updatedAt,
          version: row.version ?? qp.version ?? 1,
        };
      } else if (row.id === 'onboarding_state') {
        const ob = dec as Partial<OnboardingStateSettings>;
        nextCache.onboardingState = {
          id: 'onboarding_state',
          tourCompleted: Boolean(ob.tourCompleted),
          tipsEnabled: typeof ob.tipsEnabled === 'boolean' ? ob.tipsEnabled : true,
          dismissedTipIds: Array.isArray(ob.dismissedTipIds) ? ob.dismissedTipIds : [],
          checklistDismissed: Boolean(ob.checklistDismissed),
          ...(typeof ob.lastSeenChangelogVersion === 'string'
            ? { lastSeenChangelogVersion: ob.lastSeenChangelogVersion }
            : {}),
          updatedAt: ob.updatedAt || row.updatedAt,
          version: row.version ?? ob.version ?? 1,
        };
      } else if (row.id === 'financial_sequences') {
        const fs = dec as Partial<FinancialSequencesData>;
        nextCache.financialSequences = {
          id: 'financial_sequences',
          invoiceSequence: typeof fs.invoiceSequence === 'number' ? fs.invoiceSequence : 0,
          receiptSequence: typeof fs.receiptSequence === 'number' ? fs.receiptSequence : 0,
          creditNoteSequence: typeof fs.creditNoteSequence === 'number' ? fs.creditNoteSequence : 0,
          zReportSequence: typeof fs.zReportSequence === 'number' ? fs.zReportSequence : 0,
          updatedAt: fs.updatedAt || row.updatedAt,
          version: row.version ?? fs.version ?? 1,
        };
      } else if (row.id === 'whatsapp_templates') {
        const wt = dec as Partial<WhatsAppTemplatesConfig>;
        nextCache.whatsappTemplates = {
          id: 'whatsapp_templates',
          appointmentReminder: wt.appointmentReminder?.ar
            ? wt.appointmentReminder
            : { ...DEFAULT_WHATSAPP_TEMPLATES.appointmentReminder },
          hepProgram: wt.hepProgram?.ar ? wt.hepProgram : { ...DEFAULT_WHATSAPP_TEMPLATES.hepProgram },
          paymentReceipt: wt.paymentReceipt?.ar
            ? wt.paymentReceipt
            : { ...DEFAULT_WHATSAPP_TEMPLATES.paymentReceipt },
          updatedAt: wt.updatedAt || row.updatedAt,
          version: row.version ?? wt.version ?? 1,
        };
      }
    }

    // Legacy pre-Phase-2 vaults with existing Admin PIN or clinical data upgrade transparently to Team Mode
    const hasExplicitWorkspaceMode = settingEntities.some((r) => r.id === 'workspace_mode');
    if (!hasExplicitWorkspaceMode) {
      const hasExistingVaultActivity =
        nextCache.adminAuth !== null ||
        patientCount > 0 ||
        nextCache.appointments.length > 0 ||
        nextCache.invoices.length > 0;
      if (hasExistingVaultActivity) {
        nextCache.workspaceMode = {
          ...nextCache.workspaceMode,
          mode: 'team',
          wizardCompleted: true,
        };
      }
    }

    nextCache.hydrated = true;
    this.cache = nextCache;
    this.versionMap = nextVersionMap;
    if (!lazyHeavyStores) {
      for (const storeName of ALL_COLD_STORES) {
        this.loadedColdStores.add(storeName);
      }
    }
    this.notifyListeners();
  }

  private static mergeByIdIntoCacheArray<T extends { id: string }>(
    existing: T[],
    decryptedRows: T[]
  ): T[] {
    const byId = new Map<string, T>();
    for (const item of decryptedRows) {
      byId.set(item.id, item);
    }
    // Preserve any newly written in-memory entries created before lazy load finished
    for (const item of existing) {
      byId.set(item.id, item);
    }
    return Array.from(byId.values());
  }

  private static mergeGroupedById<T extends { id: string }>(
    map: Map<string, T[]>,
    key: string,
    incoming: T[]
  ): void {
    const merged = this.mergeByIdIntoCacheArray(map.get(key) || [], incoming);
    map.set(key, merged);
  }

  /**
   * Lazily decrypts an entire cold store into the unlocked operations cache on demand.
   * Safe against concurrent callers and preserves in-session uncommitted/new cache entries.
   */
  static async ensureColdStoreLoadedAsync(storeName: ColdStoreName): Promise<void> {
    if (!this.activeDek || this.loadedColdStores.has(storeName)) return;
    const inflight = this.coldStoreLoadPromises.get(storeName);
    if (inflight) return inflight;

    const dek = this.activeDek;
    const database = this.activeDb;
    const canUseV8Tables = !database.verno || database.verno >= 8;
    const canUseV9Tables = !database.verno || database.verno >= 9;

    const task = (async () => {
      try {
        if (storeName === 'auditLogs') {
          const rows = await database.auditLogs.toArray();
          const loaded: AuditLogEntry[] = [];
          for (const row of rows) {
            const dec = await this.decryptStoreEntity<AuditLogEntry>(
              dek,
              this.versionMap,
              'auditLogs',
              row.id,
              [],
              row
            );
            if (dec) loaded.push(dec);
          }
          if (this.activeDek !== dek) return;
          const merged = this.mergeByIdIntoCacheArray(this.cache.auditLogs, loaded);
          merged.sort((a, b) => {
            if (typeof a.sequence === 'number' && typeof b.sequence === 'number') {
              return b.sequence - a.sequence;
            }
            return b.timestamp.localeCompare(a.timestamp);
          });
          this.cache.auditLogs = merged;
        } else if (storeName === 'customWidgets') {
          const rows = await database.customWidgets.toArray();
          const loaded: CustomWidgetDefinition[] = [];
          for (const row of rows) {
            const dec = await this.decryptStoreEntity<CustomWidgetDefinition>(
              dek,
              this.versionMap,
              'customWidgets',
              row.id,
              [],
              row
            );
            if (dec && dec.id) {
              const validated = validateCustomWidgetDefinition(dec);
              if (validated.ok) loaded.push(validated.data);
            }
          }
          if (this.activeDek !== dek) return;
          this.cache.customWidgets = this.mergeByIdIntoCacheArray(
            this.cache.customWidgets,
            loaded
          );
        } else if (storeName === 'noteTemplates') {
          const rows =
            canUseV9Tables && database.noteTemplates ? await database.noteTemplates.toArray() : [];
          const loaded: NoteTemplateSnippet[] = [];
          for (const row of rows as EncryptedNoteTemplateEntity[]) {
            const dec = await this.decryptStoreEntity<NoteTemplateSnippet>(
              dek,
              this.versionMap,
              'noteTemplates',
              row.id,
              [],
              row
            );
            if (dec && dec.slashTrigger) {
              loaded.push({ ...dec, version: row.version ?? dec.version ?? 1 });
            }
          }
          if (this.activeDek !== dek) return;
          this.cache.noteTemplates = this.mergeByIdIntoCacheArray(
            this.cache.noteTemplates,
            loaded
          );
        } else if (storeName === 'attachments') {
          const rows =
            canUseV9Tables && database.attachments ? await database.attachments.toArray() : [];
          const byPatient = new Map<string, EncryptedAttachmentRecord[]>();
          for (const row of rows as EncryptedAttachmentEntity[]) {
            const dec = await this.decryptStoreEntity<EncryptedAttachmentRecord>(
              dek,
              this.versionMap,
              'attachments',
              row.id,
              [row.patientId],
              row
            );
            if (dec && dec.patientId) {
              const bucket = byPatient.get(dec.patientId) || [];
              bucket.push({ ...dec, version: row.version ?? dec.version ?? 1 });
              byPatient.set(dec.patientId, bucket);
            }
          }
          if (this.activeDek !== dek) return;
          for (const [pid, items] of byPatient.entries()) {
            this.mergeGroupedById(this.cache.attachmentsByPatientId, pid, items);
          }
        } else if (storeName === 'consents') {
          const rows =
            canUseV8Tables && database.consents ? await database.consents.toArray() : [];
          const byPatient = new Map<string, PatientConsentRecord[]>();
          for (const row of rows as EncryptedConsentEntity[]) {
            const dec = await this.decryptStoreEntity<PatientConsentRecord>(
              dek,
              this.versionMap,
              'consents',
              row.id,
              [row.patientId],
              row
            );
            if (dec && dec.patientId) {
              const bucket = byPatient.get(dec.patientId) || [];
              bucket.push({ ...dec, version: row.version ?? dec.version ?? 1 });
              byPatient.set(dec.patientId, bucket);
            }
          }
          if (this.activeDek !== dek) return;
          for (const [pid, items] of byPatient.entries()) {
            this.mergeGroupedById(this.cache.consentsByPatientId, pid, items);
          }
        } else if (storeName === 'episodeClinical') {
          const rows = await database.episodeClinical.toArray();
          const loaded: EpisodeScopedClinicalStore[] = [];
          for (const row of rows) {
            const dec = await this.decryptStoreEntity<EpisodeScopedClinicalStore>(
              dek,
              this.versionMap,
              'episodeClinical',
              row.id,
              [row.episodeId],
              row
            );
            if (dec && dec.episodeId) loaded.push(dec);
          }
          if (this.activeDek !== dek) return;
          for (const item of loaded) {
            if (!this.cache.episodeClinicalByEpisodeId.has(item.episodeId)) {
              this.cache.episodeClinicalByEpisodeId.set(item.episodeId, item);
            }
            this.loadedColdEpisodeIds.add(item.episodeId);
          }
        } else if (storeName === 'patientMedications') {
          const rows = await database.patientMedications.toArray();
          const loaded: PatientMedicationPlan[] = [];
          for (const row of rows) {
            const dec = await this.decryptStoreEntity<PatientMedicationPlan>(
              dek,
              this.versionMap,
              'patientMedications',
              row.id,
              [row.patientId],
              row
            );
            if (dec && dec.patientId) {
              loaded.push({ ...dec, version: row.version ?? dec.version ?? 1 });
            }
          }
          if (this.activeDek !== dek) return;
          for (const item of loaded) {
            if (!this.cache.patientMedicationsByPatientId.has(item.patientId)) {
              this.cache.patientMedicationsByPatientId.set(item.patientId, item);
            }
          }
        }

        if (this.activeDek === dek) {
          this.loadedColdStores.add(storeName);
          this.notifyListeners();
        }
      } finally {
        this.coldStoreLoadPromises.delete(storeName);
      }
    })();

    this.coldStoreLoadPromises.set(storeName, task);
    return task;
  }

  /**
   * Decrypts cold stores (`attachments`, `consents`, `episodeClinical`, `patientMedications`)
   * strictly for a single patient (plus optional episode IDs) via indexed lookup.
   */
  static async ensurePatientColdStoresLoadedAsync(
    patientId: string,
    episodeIds: string[] = []
  ): Promise<void> {
    if (!patientId || !this.activeDek) return;
    if (this.isPatientColdStoresLoaded(patientId)) {
      const missingEp = episodeIds.some(
        (id) => id && !this.loadedColdEpisodeIds.has(id) && !this.cache.episodeClinicalByEpisodeId.has(id)
      );
      if (!missingEp) return;
    }

    const existingPromise = this.coldPatientLoadPromises.get(patientId);
    if (existingPromise && episodeIds.length === 0) return existingPromise;

    const dek = this.activeDek;
    const database = this.activeDb;
    const canUseV8Tables = !database.verno || database.verno >= 8;
    const canUseV9Tables = !database.verno || database.verno >= 9;

    const run = async () => {
      if (existingPromise) {
        await existingPromise.catch(() => undefined);
      }
      if (this.activeDek !== dek) return;

      const [attRows, consentRows, medRows, epByPatientRows, epByIdRows] = await Promise.all([
        !this.loadedColdStores.has('attachments') && canUseV9Tables && database.attachments
          ? database.attachments.where('patientId').equals(patientId).toArray()
          : Promise.resolve([]),
        !this.loadedColdStores.has('consents') && canUseV8Tables && database.consents
          ? database.consents.where('patientId').equals(patientId).toArray()
          : Promise.resolve([]),
        !this.loadedColdStores.has('patientMedications')
          ? database.patientMedications.where('patientId').equals(patientId).toArray()
          : Promise.resolve([]),
        !this.loadedColdStores.has('episodeClinical')
          ? database.episodeClinical.where('patientId').equals(patientId).toArray()
          : Promise.resolve([]),
        !this.loadedColdStores.has('episodeClinical') && episodeIds.length > 0
          ? database.episodeClinical.where('episodeId').anyOf(episodeIds).toArray()
          : Promise.resolve([]),
      ]);

      const attachmentsLoaded: EncryptedAttachmentRecord[] = [];
      for (const row of attRows as EncryptedAttachmentEntity[]) {
        const dec = await this.decryptStoreEntity<EncryptedAttachmentRecord>(
          dek,
          this.versionMap,
          'attachments',
          row.id,
          [row.patientId],
          row
        );
        if (dec && dec.patientId) {
          attachmentsLoaded.push({ ...dec, version: row.version ?? dec.version ?? 1 });
        }
      }

      const consentsLoaded: PatientConsentRecord[] = [];
      for (const row of consentRows as EncryptedConsentEntity[]) {
        const dec = await this.decryptStoreEntity<PatientConsentRecord>(
          dek,
          this.versionMap,
          'consents',
          row.id,
          [row.patientId],
          row
        );
        if (dec && dec.patientId) {
          consentsLoaded.push({ ...dec, version: row.version ?? dec.version ?? 1 });
        }
      }

      let medLoaded: PatientMedicationPlan | null = null;
      for (const row of medRows) {
        const dec = await this.decryptStoreEntity<PatientMedicationPlan>(
          dek,
          this.versionMap,
          'patientMedications',
          row.id,
          [row.patientId],
          row
        );
        if (dec && dec.patientId) {
          medLoaded = { ...dec, version: row.version ?? dec.version ?? 1 };
        }
      }

      const combinedEpMap = new Map<string, (typeof epByPatientRows)[number]>();
      for (const row of [...epByPatientRows, ...epByIdRows]) {
        combinedEpMap.set(row.id, row);
      }
      const epLoaded: EpisodeScopedClinicalStore[] = [];
      for (const row of combinedEpMap.values()) {
        const dec = await this.decryptStoreEntity<EpisodeScopedClinicalStore>(
          dek,
          this.versionMap,
          'episodeClinical',
          row.id,
          [row.episodeId],
          row
        );
        if (dec && dec.episodeId) epLoaded.push(dec);
      }

      if (this.activeDek !== dek) return;

      if (attachmentsLoaded.length > 0) {
        this.mergeGroupedById(this.cache.attachmentsByPatientId, patientId, attachmentsLoaded);
      }
      if (consentsLoaded.length > 0) {
        this.mergeGroupedById(this.cache.consentsByPatientId, patientId, consentsLoaded);
      }
      if (medLoaded && !this.cache.patientMedicationsByPatientId.has(patientId)) {
        this.cache.patientMedicationsByPatientId.set(patientId, medLoaded);
      }
      for (const epStore of epLoaded) {
        if (!this.cache.episodeClinicalByEpisodeId.has(epStore.episodeId)) {
          this.cache.episodeClinicalByEpisodeId.set(epStore.episodeId, epStore);
        }
        this.loadedColdEpisodeIds.add(epStore.episodeId);
      }
      for (const epId of episodeIds) {
        if (epId) this.loadedColdEpisodeIds.add(epId);
      }
      this.loadedColdPatientIds.add(patientId);
      this.notifyListeners();
    };

    const wrapped = run().finally(() => {
      if (this.coldPatientLoadPromises.get(patientId) === wrapped) {
        this.coldPatientLoadPromises.delete(patientId);
      }
    });
    this.coldPatientLoadPromises.set(patientId, wrapped);
    return wrapped;
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

  private static async putRecordEncrypted(
    tableName:
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
      | 'noteTemplates',
    id: string,
    parentIds: string[],
    payload: unknown,
    extraColumns: Record<string, unknown> = {},
    options: { skipBroadcast?: boolean; skipConcurrencyCheck?: boolean } = {}
  ): Promise<void> {
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
  }

  private static async putRecordsEncryptedBatch(
    items: Array<{
      tableName:
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
      id: string;
      parentIds: string[];
      payload: unknown;
      extraColumns?: Record<string, unknown>;
    }>
  ): Promise<void> {
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

    const uniqueTables = Array.from(
      new Set(items.map((i) => database.table(i.tableName)))
    );

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
    tableName:
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
      | 'noteTemplates',
    id: string
  ): Promise<void> {
    if (!this.activeDek) return;
    const database = this.activeDb;
    const tableRef = database.table(tableName);
    await database.transaction('rw', [tableRef], async () => {
      await tableRef.delete(id);
    });
    this.versionMap.delete(`${tableName}:${id}`);
    broadcastVaultEvent({ type: 'OPERATIONS_UPDATED' });
  }

  // ---------------------------------------------------------------------
  // Admin PIN Security (1.1: PBKDF2-SHA256 in IndexedDB + Exponential Backoff)
  // Zero hardcoded default PIN; forces setup on first run.
  // ---------------------------------------------------------------------
  static isAdminPinConfigured(): boolean {
    const auth = this.cache.adminAuth;
    return Boolean(auth && !auth.requiresFirstRunReset && auth.pinHashBase64 && auth.pinSaltBase64);
  }

  static requiresFirstRunAdminPinSetup(): boolean {
    if (this.cache.workspaceMode.wizardCompleted && this.cache.workspaceMode.mode === 'solo') {
      return false;
    }
    return !this.isAdminPinConfigured();
  }

  static getAdminPinStatus(): {
    isConfigured: boolean;
    requiresFirstRunReset: boolean;
    rateLimit: PinRateLimitState;
    remainingLockSeconds: number;
  } {
    const nowMs = Date.now();
    const lockedUntilMs = this.cache.pinRateLimit.lockedUntilMs || 0;
    const remainingLockSeconds =
      lockedUntilMs > nowMs ? Math.ceil((lockedUntilMs - nowMs) / 1000) : 0;
    return {
      isConfigured: this.isAdminPinConfigured(),
      requiresFirstRunReset: !this.isAdminPinConfigured(),
      rateLimit: { ...this.cache.pinRateLimit },
      remainingLockSeconds,
    };
  }

  static async setAdminPinAsync(pin: string): Promise<void> {
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
      version: (this.cache.adminAuth?.version || 0) + 1,
    };
    const nextRateLimit: PinRateLimitState = {
      id: 'pin_rate_limit',
      failedAttempts: 0,
      lockedUntilMs: 0,
      updatedAt: now,
      version: (this.cache.pinRateLimit.version || 0) + 1,
    };

    this.cache.adminAuth = nextRecord;
    this.cache.pinRateLimit = nextRateLimit;

    await this.trackWrite(
      this.putRecordEncrypted('clinicSettings', 'admin_auth', [], nextRecord, {}, { skipConcurrencyCheck: true })
    );
    await this.trackWrite(
      this.putRecordEncrypted('clinicSettings', 'pin_rate_limit', [], nextRateLimit, {}, { skipConcurrencyCheck: true })
    );
    await this.appendAuditLogAsync({
      actionType: 'pin_changed',
      entityType: 'settings',
      entityId: 'admin_auth',
      summaryAr: 'تم تعيين أو تحديث رمز PIN لصلاحية مدير العيادة (مشفر بـ PBKDF2)',
      summaryEn: 'Updated Clinic Admin PIN (PBKDF2-SHA256 encrypted)',
    });
    this.notifyListeners();
  }

  static async verifyAdminPinAsync(pinAttempt: string): Promise<{
    ok: boolean;
    rateLimited: boolean;
    remainingSeconds: number;
    requiresSetup: boolean;
  }> {
    if (!this.isAdminPinConfigured() || !this.cache.adminAuth) {
      return {
        ok: false,
        rateLimited: false,
        remainingSeconds: 0,
        requiresSetup: true,
      };
    }

    const nowMs = Date.now();
    if (this.cache.pinRateLimit.lockedUntilMs > nowMs) {
      const remainingSeconds = Math.ceil((this.cache.pinRateLimit.lockedUntilMs - nowMs) / 1000);
      return {
        ok: false,
        rateLimited: true,
        remainingSeconds,
        requiresSetup: false,
      };
    }

    const valid = await verifyAdminPinPBKDF2(pinAttempt, this.cache.adminAuth);
    const nowIso = new Date().toISOString();

    if (valid) {
      const resetState: PinRateLimitState = {
        id: 'pin_rate_limit',
        failedAttempts: 0,
        lockedUntilMs: 0,
        updatedAt: nowIso,
        version: (this.cache.pinRateLimit.version || 0) + 1,
      };
      this.cache.pinRateLimit = resetState;
      await this.trackWrite(
        this.putRecordEncrypted('clinicSettings', 'pin_rate_limit', [], resetState, {}, { skipConcurrencyCheck: true })
      );
      return {
        ok: true,
        rateLimited: false,
        remainingSeconds: 0,
        requiresSetup: false,
      };
    }

    const nextFails = (this.cache.pinRateLimit.failedAttempts || 0) + 1;
    const delayMs = computePinBackoffMs(nextFails);
    const nextRateState: PinRateLimitState = {
      id: 'pin_rate_limit',
      failedAttempts: nextFails,
      lockedUntilMs: delayMs > 0 ? nowMs + delayMs : 0,
      lastFailedAt: nowIso,
      updatedAt: nowIso,
      version: (this.cache.pinRateLimit.version || 0) + 1,
    };
    this.cache.pinRateLimit = nextRateState;
    await this.trackWrite(
      this.putRecordEncrypted('clinicSettings', 'pin_rate_limit', [], nextRateState, {}, { skipConcurrencyCheck: true })
    );
    await this.appendAuditLogAsync({
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
  // Module Flags, Clinic Profile, Security Config, MRN, Backup Meta, Telemetry
  // ---------------------------------------------------------------------
  static getReceptionPrivacyBlur(): boolean {
    return this.cache.receptionPrivacyBlur;
  }

  static setReceptionPrivacyBlur(enabled: boolean): void {
    this.cache.receptionPrivacyBlur = enabled;
    const payload = { ...this.cache.moduleFlags, receptionPrivacyBlur: enabled, updatedAt: new Date().toISOString() };
    void this.trackWrite(
      this.putRecordEncrypted('clinicSettings', 'module_flags', [], payload, {}, { skipConcurrencyCheck: true })
    ).catch(() => undefined);
    this.notifyListeners();
  }

  static getModuleFlags(): ModuleFlagsSettings {
    return { ...this.cache.moduleFlags };
  }

  static async setModuleFlagsAsync(partial: Partial<ModuleFlagsSettings>): Promise<ModuleFlagsSettings> {
    const next: ModuleFlagsSettings = {
      ...this.cache.moduleFlags,
      ...partial,
      id: 'module_flags',
      updatedAt: new Date().toISOString(),
      version: (this.cache.moduleFlags.version || 0) + 1,
    };
    this.cache.moduleFlags = next;
    await this.trackWrite(
      this.putRecordEncrypted(
        'clinicSettings',
        'module_flags',
        [],
        { ...next, receptionPrivacyBlur: this.cache.receptionPrivacyBlur },
        {},
        { skipConcurrencyCheck: true }
      )
    );
    this.notifyListeners();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('physiorecord-modules-updated'));
    }
    return next;
  }

  static isExerciseLibraryVisible(): boolean {
    return this.cache.moduleFlags.showHepLibrary;
  }

  static setExerciseLibraryVisible(visible: boolean): void {
    this.cache.moduleFlags = {
      ...this.cache.moduleFlags,
      showHepLibrary: visible,
      updatedAt: new Date().toISOString(),
      version: (this.cache.moduleFlags.version || 0) + 1,
    };
    void this.trackWrite(
      this.putRecordEncrypted(
        'clinicSettings',
        'module_flags',
        [],
        { ...this.cache.moduleFlags, receptionPrivacyBlur: this.cache.receptionPrivacyBlur },
        {},
        { skipConcurrencyCheck: true }
      )
    ).catch(() => undefined);
    this.notifyListeners();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('physiorecord-modules-updated'));
    }
  }

  static isCustomWidgetStudioEnabled(): boolean {
    return this.cache.moduleFlags.enableCustomWidgetStudio;
  }

  static setCustomWidgetStudioEnabled(enabled: boolean): void {
    this.cache.moduleFlags = {
      ...this.cache.moduleFlags,
      enableCustomWidgetStudio: enabled,
      updatedAt: new Date().toISOString(),
      version: (this.cache.moduleFlags.version || 0) + 1,
    };
    void this.trackWrite(
      this.putRecordEncrypted(
        'clinicSettings',
        'module_flags',
        [],
        { ...this.cache.moduleFlags, receptionPrivacyBlur: this.cache.receptionPrivacyBlur },
        {},
        { skipConcurrencyCheck: true }
      )
    ).catch(() => undefined);
    this.notifyListeners();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('physiorecord-modules-updated'));
    }
  }

  static isSmartGoalsGasEnabled(): boolean {
    return Boolean(this.cache.moduleFlags.enableSmartGoalsGas);
  }

  static setSmartGoalsGasEnabled(enabled: boolean): void {
    this.cache.moduleFlags = {
      ...this.cache.moduleFlags,
      enableSmartGoalsGas: enabled,
      updatedAt: new Date().toISOString(),
      version: (this.cache.moduleFlags.version || 0) + 1,
    };
    void this.trackWrite(
      this.putRecordEncrypted(
        'clinicSettings',
        'module_flags',
        [],
        { ...this.cache.moduleFlags, receptionPrivacyBlur: this.cache.receptionPrivacyBlur },
        {},
        { skipConcurrencyCheck: true }
      )
    ).catch(() => undefined);
    this.notifyListeners();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('physiorecord-modules-updated'));
    }
  }

  static isConsentModuleEnabled(): boolean {
    return Boolean(this.cache.moduleFlags.enableConsentModule);
  }

  static setConsentModuleEnabled(enabled: boolean): void {
    this.setModuleFlag('enableConsentModule', enabled);
  }

  private static setModuleFlag(
    flagKey:
      | 'enableConsentModule'
      | 'enableAttachmentsModule'
      | 'enableVoiceDictationModule'
      | 'allowCloudSpeechFallbackOptIn'
      | 'enableTemplatesModule'
      | 'enableAnalyticsModule'
      | 'enableKioskModule'
      | 'enableProblemListGoals'
      | 'enableReEvalNudges'
      | 'enableNoteCompletenessCheck'
      | 'enablePerformanceTestLibrary'
      | 'enableModalitySafetyCheck'
      | 'enableVitalsModule'
      | 'enablePediatricSafeguards'
      | 'enablePediatricGeometricPainIcons'
      | 'enableHomeVisits'
      | 'enablePracticeLocations'
      | 'enableClosedDaysBreaks'
      | 'enableHijriDateDisplay'
      | 'enableInstallmentPlans'
      | 'enableRecurringExpenses'
      | 'enableReferralsModule'
      | 'enableRetentionLists'
      | 'enableImportWizard'
      | 'enableTrashRecycleBin'
      | 'enableDataHealthScreen'
      | 'enableBilingualTerminologyGlossary'
      | 'enableWebShareInterop'
      | 'enableIcsCalendarExport'
      | 'enableScheduleVisitCardPrint'
      | 'enablePhotoMeasurementTools',
    enabled: boolean
  ): void {
    this.cache.moduleFlags = {
      ...this.cache.moduleFlags,
      [flagKey]: enabled,
      updatedAt: new Date().toISOString(),
      version: (this.cache.moduleFlags.version || 0) + 1,
    };
    void this.trackWrite(
      this.putRecordEncrypted(
        'clinicSettings',
        'module_flags',
        [],
        { ...this.cache.moduleFlags, receptionPrivacyBlur: this.cache.receptionPrivacyBlur },
        {},
        { skipConcurrencyCheck: true }
      )
    ).catch(() => undefined);
    this.notifyListeners();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('physiorecord-modules-updated'));
    }
  }

  private static patchModuleFlagsPartial(partial: Partial<ModuleFlagsSettings>): void {
    this.cache.moduleFlags = {
      ...this.cache.moduleFlags,
      ...partial,
      updatedAt: new Date().toISOString(),
      version: (this.cache.moduleFlags.version || 0) + 1,
    };
    void this.trackWrite(
      this.putRecordEncrypted(
        'clinicSettings',
        'module_flags',
        [],
        { ...this.cache.moduleFlags, receptionPrivacyBlur: this.cache.receptionPrivacyBlur },
        {},
        { skipConcurrencyCheck: true }
      )
    ).catch(() => undefined);
    this.notifyListeners();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('physiorecord-modules-updated'));
    }
  }

  static isAttachmentsModuleEnabled(): boolean {
    return Boolean(this.cache.moduleFlags.enableAttachmentsModule);
  }

  static setAttachmentsModuleEnabled(enabled: boolean): void {
    this.setModuleFlag('enableAttachmentsModule', enabled);
  }

  static isVoiceDictationModuleEnabled(): boolean {
    return Boolean(this.cache.moduleFlags.enableVoiceDictationModule);
  }

  static setVoiceDictationModuleEnabled(enabled: boolean): void {
    this.setModuleFlag('enableVoiceDictationModule', enabled);
  }

  static isCloudSpeechFallbackOptIn(): boolean {
    return Boolean(this.cache.moduleFlags.allowCloudSpeechFallbackOptIn);
  }

  static setCloudSpeechFallbackOptIn(enabled: boolean): void {
    this.setModuleFlag('allowCloudSpeechFallbackOptIn', enabled);
  }

  static isTemplatesModuleEnabled(): boolean {
    return Boolean(this.cache.moduleFlags.enableTemplatesModule);
  }

  static setTemplatesModuleEnabled(enabled: boolean): void {
    this.setModuleFlag('enableTemplatesModule', enabled);
  }

  static isAnalyticsModuleEnabled(): boolean {
    return Boolean(this.cache.moduleFlags.enableAnalyticsModule);
  }

  static setAnalyticsModuleEnabled(enabled: boolean): void {
    this.setModuleFlag('enableAnalyticsModule', enabled);
  }

  static isKioskModuleEnabled(): boolean {
    return Boolean(this.cache.moduleFlags.enableKioskModule);
  }

  static setKioskModuleEnabled(enabled: boolean): void {
    this.setModuleFlag('enableKioskModule', enabled);
  }

  // --- Phase B: Workflow Flags & Settings (B1–B8) ---
  static isProblemListGoalsEnabled(): boolean {
    return this.cache.moduleFlags.enableProblemListGoals ?? true;
  }

  static setProblemListGoalsEnabled(enabled: boolean): void {
    this.setModuleFlag('enableProblemListGoals', enabled);
  }

  static isReEvalNudgesEnabled(): boolean {
    return Boolean(this.cache.moduleFlags.enableReEvalNudges);
  }

  static setReEvalNudgesEnabled(enabled: boolean): void {
    this.setModuleFlag('enableReEvalNudges', enabled);
  }

  static getReEvalNudgeConfig(): { afterSessions: number; afterDays: number } {
    return {
      afterSessions: this.cache.moduleFlags.reEvalAfterSessions || 6,
      afterDays: this.cache.moduleFlags.reEvalAfterDays || 21,
    };
  }

  static setReEvalNudgeConfig(afterSessions: number, afterDays: number): void {
    this.patchModuleFlagsPartial({
      reEvalAfterSessions: Math.max(1, Math.min(50, Math.round(afterSessions || 6))),
      reEvalAfterDays: Math.max(1, Math.min(180, Math.round(afterDays || 21))),
    });
  }

  static isNoteCompletenessCheckEnabled(): boolean {
    return this.cache.moduleFlags.enableNoteCompletenessCheck ?? true;
  }

  static setNoteCompletenessCheckEnabled(enabled: boolean): void {
    this.setModuleFlag('enableNoteCompletenessCheck', enabled);
  }

  static isPerformanceTestLibraryEnabled(): boolean {
    return this.cache.moduleFlags.enablePerformanceTestLibrary ?? true;
  }

  static setPerformanceTestLibraryEnabled(enabled: boolean): void {
    this.setModuleFlag('enablePerformanceTestLibrary', enabled);
  }

  static getModalitySafetyReviewStatus(): {
    enabled: boolean;
    reviewed: boolean;
    reviewedBy?: string;
    reviewedAt?: string;
  } {
    const reviewedBy = this.cache.moduleFlags.modalitySafetyReviewedBy?.trim();
    const reviewed = Boolean(reviewedBy);
    return {
      enabled: Boolean(this.cache.moduleFlags.enableModalitySafetyCheck && reviewed),
      reviewed,
      reviewedBy: reviewedBy || undefined,
      reviewedAt: this.cache.moduleFlags.modalitySafetyReviewedAt,
    };
  }

  static isModalitySafetyCheckEnabled(): boolean {
    return this.getModalitySafetyReviewStatus().enabled;
  }

  static confirmModalitySafetyReview(reviewerName: string, enableNow = true): void {
    const cleanName = reviewerName.trim();
    if (!cleanName) return;
    this.patchModuleFlagsPartial({
      modalitySafetyReviewedBy: cleanName,
      modalitySafetyReviewedAt: new Date().toISOString(),
      enableModalitySafetyCheck: enableNow,
    });
  }

  static setModalitySafetyCheckEnabled(enabled: boolean): void {
    if (enabled && !this.cache.moduleFlags.modalitySafetyReviewedBy?.trim()) {
      return;
    }
    this.setModuleFlag('enableModalitySafetyCheck', enabled);
  }

  static isVitalsModuleEnabled(): boolean {
    return this.cache.moduleFlags.enableVitalsModule ?? true;
  }

  static setVitalsModuleEnabled(enabled: boolean): void {
    this.setModuleFlag('enableVitalsModule', enabled);
  }

  static getVitalsThresholds(): VitalsAlertThresholds {
    return {
      ...DEFAULT_VITALS_THRESHOLDS,
      ...(this.cache.moduleFlags.vitalsThresholds || {}),
    };
  }

  static setVitalsThresholds(thresholds: VitalsAlertThresholds): void {
    this.patchModuleFlagsPartial({
      vitalsThresholds: { ...DEFAULT_VITALS_THRESHOLDS, ...thresholds },
    });
  }

  static isPediatricSafeguardsEnabled(): boolean {
    return this.cache.moduleFlags.enablePediatricSafeguards ?? true;
  }

  static setPediatricSafeguardsEnabled(enabled: boolean): void {
    this.setModuleFlag('enablePediatricSafeguards', enabled);
  }

  static isPediatricGeometricPainIconsEnabled(): boolean {
    return this.cache.moduleFlags.enablePediatricGeometricPainIcons ?? true;
  }

  static setPediatricGeometricPainIconsEnabled(enabled: boolean): void {
    this.setModuleFlag('enablePediatricGeometricPainIcons', enabled);
  }

  static getCustomExamPresets(): RegionalExamPresetDefinition[] {
    return [...(this.cache.moduleFlags.customExamPresets || [])];
  }

  static saveCustomExamPreset(preset: RegionalExamPresetDefinition): void {
    const existing = this.cache.moduleFlags.customExamPresets || [];
    const idx = existing.findIndex((p) => p.id === preset.id);
    const nextPreset: RegionalExamPresetDefinition = {
      ...preset,
      updatedAt: new Date().toISOString(),
    };
    const nextList =
      idx >= 0
        ? existing.map((item, i) => (i === idx ? nextPreset : item))
        : [...existing, nextPreset];
    this.patchModuleFlagsPartial({ customExamPresets: nextList });
  }

  static deleteCustomExamPreset(presetId: string): void {
    const nextList = (this.cache.moduleFlags.customExamPresets || []).filter(
      (p) => p.id !== presetId
    );
    this.patchModuleFlagsPartial({ customExamPresets: nextList });
  }

  static importCustomExamPresets(presets: RegionalExamPresetDefinition[]): number {
    const existing = new Map(
      (this.cache.moduleFlags.customExamPresets || []).map((p) => [p.id, p])
    );
    let count = 0;
    for (const preset of presets) {
      existing.set(preset.id, {
        ...preset,
        updatedAt: new Date().toISOString(),
      });
      count += 1;
    }
    this.patchModuleFlagsPartial({ customExamPresets: Array.from(existing.values()) });
    return count;
  }

  // ---------------------------------------------------------------------
  // Phase C: Iraq-Specific Operations Module Flags & Collections
  // ---------------------------------------------------------------------
  static isHomeVisitsEnabled(): boolean {
    return this.cache.moduleFlags.enableHomeVisits ?? true;
  }

  static setHomeVisitsEnabled(enabled: boolean): void {
    this.setModuleFlag('enableHomeVisits', enabled);
  }

  static isPracticeLocationsEnabled(): boolean {
    return this.cache.moduleFlags.enablePracticeLocations ?? true;
  }

  static setPracticeLocationsEnabled(enabled: boolean): void {
    this.setModuleFlag('enablePracticeLocations', enabled);
  }

  static isClosedDaysBreaksEnabled(): boolean {
    return this.cache.moduleFlags.enableClosedDaysBreaks ?? true;
  }

  static setClosedDaysBreaksEnabled(enabled: boolean): void {
    this.setModuleFlag('enableClosedDaysBreaks', enabled);
  }

  static isHijriDateDisplayEnabled(): boolean {
    return this.cache.moduleFlags.enableHijriDateDisplay ?? false;
  }

  static setHijriDateDisplayEnabled(enabled: boolean): void {
    this.setModuleFlag('enableHijriDateDisplay', enabled);
  }

  static isInstallmentPlansEnabled(): boolean {
    return this.cache.moduleFlags.enableInstallmentPlans ?? true;
  }

  static setInstallmentPlansEnabled(enabled: boolean): void {
    this.setModuleFlag('enableInstallmentPlans', enabled);
  }

  static isRecurringExpensesEnabled(): boolean {
    return this.cache.moduleFlags.enableRecurringExpenses ?? true;
  }

  static setRecurringExpensesEnabled(enabled: boolean): void {
    this.setModuleFlag('enableRecurringExpenses', enabled);
  }

  static isReferralsModuleEnabled(): boolean {
    return this.cache.moduleFlags.enableReferralsModule ?? true;
  }

  static setReferralsModuleEnabled(enabled: boolean): void {
    this.setModuleFlag('enableReferralsModule', enabled);
  }

  static isRetentionListsEnabled(): boolean {
    return this.cache.moduleFlags.enableRetentionLists ?? true;
  }

  static setRetentionListsEnabled(enabled: boolean): void {
    this.setModuleFlag('enableRetentionLists', enabled);
  }

  static getRetentionInactiveDaysThreshold(): number {
    return this.cache.moduleFlags.retentionInactiveDaysThreshold ?? 14;
  }

  static setRetentionInactiveDaysThreshold(days: number): void {
    const clean = Math.max(3, Math.min(180, Math.round(Number(days) || 14)));
    this.patchModuleFlagsPartial({ retentionInactiveDaysThreshold: clean });
  }

  // ---------------------------------------------------------------------
  // Phase D: Data Quality, Import, 30-Day Non-Clinical Trash & Glossary
  // ---------------------------------------------------------------------
  static isImportWizardEnabled(): boolean {
    return this.cache.moduleFlags.enableImportWizard ?? true;
  }

  static setImportWizardEnabled(enabled: boolean): void {
    this.setModuleFlag('enableImportWizard', enabled);
  }

  static isTrashRecycleBinEnabled(): boolean {
    return this.cache.moduleFlags.enableTrashRecycleBin ?? true;
  }

  static setTrashRecycleBinEnabled(enabled: boolean): void {
    this.setModuleFlag('enableTrashRecycleBin', enabled);
  }

  static isDataHealthScreenEnabled(): boolean {
    return this.cache.moduleFlags.enableDataHealthScreen ?? true;
  }

  static setDataHealthScreenEnabled(enabled: boolean): void {
    this.setModuleFlag('enableDataHealthScreen', enabled);
  }

  static isBilingualTerminologyGlossaryEnabled(): boolean {
    return this.cache.moduleFlags.enableBilingualTerminologyGlossary ?? true;
  }

  static setBilingualTerminologyGlossaryEnabled(enabled: boolean): void {
    this.setModuleFlag('enableBilingualTerminologyGlossary', enabled);
  }

  // ---------------------------------------------------------------------
  // Phase E: Sharing & Interop Modules (E1–E4)
  // ---------------------------------------------------------------------
  static isWebShareInteropEnabled(): boolean {
    return this.cache.moduleFlags.enableWebShareInterop ?? true;
  }

  static setWebShareInteropEnabled(enabled: boolean): void {
    this.setModuleFlag('enableWebShareInterop', enabled);
  }

  static isIcsCalendarExportEnabled(): boolean {
    return this.cache.moduleFlags.enableIcsCalendarExport ?? true;
  }

  static setIcsCalendarExportEnabled(enabled: boolean): void {
    this.setModuleFlag('enableIcsCalendarExport', enabled);
  }

  static isScheduleVisitCardPrintEnabled(): boolean {
    return this.cache.moduleFlags.enableScheduleVisitCardPrint ?? true;
  }

  static setScheduleVisitCardPrintEnabled(enabled: boolean): void {
    this.setModuleFlag('enableScheduleVisitCardPrint', enabled);
  }

  static isPhotoMeasurementToolsEnabled(): boolean {
    return this.cache.moduleFlags.enablePhotoMeasurementTools ?? true;
  }

  static setPhotoMeasurementToolsEnabled(enabled: boolean): void {
    this.setModuleFlag('enablePhotoMeasurementTools', enabled);
  }

  // ---------------------------------------------------------------------
  // Phase F: Settings View Mode, Onboarding Checklist & Public Demo Mode
  // ---------------------------------------------------------------------
  static getSettingsViewMode(): 'simple' | 'advanced' {
    return this.cache.moduleFlags.settingsViewMode === 'simple' ? 'simple' : 'advanced';
  }

  static setSettingsViewMode(mode: 'simple' | 'advanced'): void {
    this.patchModuleFlagsPartial({ settingsViewMode: mode });
  }

  static isPublicDemoModeEnabled(): boolean {
    return Boolean(this.cache.moduleFlags.publicDemoModeEnabled);
  }

  static setPublicDemoModeEnabled(enabled: boolean): void {
    this.patchModuleFlagsPartial({ publicDemoModeEnabled: enabled });
  }

  static isOnboardingChecklistDismissed(): boolean {
    return Boolean(this.cache.onboardingState.checklistDismissed);
  }

  static async setOnboardingChecklistDismissedAsync(
    dismissed: boolean
  ): Promise<OnboardingStateSettings> {
    return this.updateOnboardingStateAsync({ checklistDismissed: dismissed });
  }

  static getLastSeenChangelogVersion(): string | undefined {
    return this.cache.onboardingState.lastSeenChangelogVersion;
  }

  static async setLastSeenChangelogVersionAsync(
    version: string
  ): Promise<OnboardingStateSettings> {
    return this.updateOnboardingStateAsync({ lastSeenChangelogVersion: version });
  }

  private static filterActiveRecycleEntries(
    items: RecycleBinEntry[],
    nowIso?: string
  ): RecycleBinEntry[] {
    const refMs = nowIso ? Date.parse(nowIso) : Date.now();
    const safeRefMs = Number.isFinite(refMs) ? refMs : Date.now();
    return items.filter((item) => {
      const expMs = Date.parse(item.expiresAt);
      return Number.isFinite(expMs) && expMs > safeRefMs;
    });
  }

  static getRecycleBinItems(nowIso?: string): RecycleBinEntry[] {
    const items = this.cache.moduleFlags.recycleBinItems || [];
    return this.filterActiveRecycleEntries(items, nowIso).map((item) => ({
      ...item,
      payload: { ...item.payload },
    }));
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
    const refMs = params.nowIso ? Date.parse(params.nowIso) : Date.now();
    const safeMs = Number.isFinite(refMs) ? refMs : Date.now();
    const deletedAt = new Date(safeMs).toISOString();
    const expiresAt = new Date(
      safeMs + CLINIC_RECYCLE_BIN_RETENTION_DAYS * 86400_000
    ).toISOString();
    const active = this.filterActiveRecycleEntries(
      this.cache.moduleFlags.recycleBinItems || [],
      deletedAt
    );
    const activeStaff = this.getActiveStaff();
    const entry: RecycleBinEntry = {
      id: `trash_${params.itemType}_${params.originalId}_${safeMs}`,
      itemType: params.itemType,
      originalId: params.originalId,
      titleAr: params.titleAr,
      titleEn: params.titleEn,
      subtitleAr: params.subtitleAr,
      subtitleEn: params.subtitleEn,
      deletedAt,
      expiresAt,
      deletedBy: activeStaff.nameAr || activeStaff.nameEn,
      payload: { ...params.payload },
    };
    this.patchModuleFlagsPartial({
      recycleBinItems: [entry, ...active].slice(0, 250),
    });
    return entry;
  }

  static restoreRecycleBinItem(
    trashId: string,
    nowIso?: string
  ): { restored: boolean; entry?: RecycleBinEntry } {
    const raw = this.cache.moduleFlags.recycleBinItems || [];
    const active = this.filterActiveRecycleEntries(raw, nowIso);
    const target = active.find((item) => item.id === trashId);
    if (!target) {
      if (active.length !== raw.length) {
        this.patchModuleFlagsPartial({ recycleBinItems: active });
      }
      return { restored: false };
    }

    if (target.itemType === 'appointment') {
      this.restoreAppointment(target.payload as unknown as ClinicAppointment);
    } else if (target.itemType === 'waiting_list') {
      this.restoreWaitingListEntry(target.payload as unknown as WaitingListEntry);
    } else if (target.itemType === 'expense') {
      this.restoreExpenseIQD(target.payload as unknown as ClinicExpenseIQD);
    } else {
      return { restored: false };
    }

    const remaining = active.filter((item) => item.id !== trashId);
    this.patchModuleFlagsPartial({ recycleBinItems: remaining });
    this.appendAuditLog({
      actionType: 'recycle_bin_restored',
      entityType: target.itemType,
      entityId: target.originalId,
      summaryAr: `استعادة عنصر غير سريري من سلة المهملات: ${target.titleAr}`,
      summaryEn: `Restored non-clinical item from 30-day recycle bin: ${target.titleEn}`,
    });
    return { restored: true, entry: target };
  }

  static permanentlyDeleteRecycleBinItem(trashId: string): RecycleBinEntry[] {
    const remaining = (this.cache.moduleFlags.recycleBinItems || []).filter(
      (item) => item.id !== trashId
    );
    this.patchModuleFlagsPartial({ recycleBinItems: remaining });
    return this.getRecycleBinItems();
  }

  static purgeExpiredRecycleBinItems(nowIso?: string): number {
    const raw = this.cache.moduleFlags.recycleBinItems || [];
    const active = this.filterActiveRecycleEntries(raw, nowIso);
    const removedCount = raw.length - active.length;
    if (removedCount > 0) {
      this.patchModuleFlagsPartial({ recycleBinItems: active });
    }
    return removedCount;
  }

  static getPracticeLocations(): PracticeLocationItem[] {
    const list = this.cache.moduleFlags.practiceLocations;
    return list && list.length > 0 ? list.map((item) => ({ ...item })) : cloneDefaultLocations();
  }

  static savePracticeLocations(locations: PracticeLocationItem[]): PracticeLocationItem[] {
    this.patchModuleFlagsPartial({ practiceLocations: locations.map((l) => ({ ...l })) });
    return this.getPracticeLocations();
  }

  static getWeeklyBreaks(): WeeklyBreakWindow[] {
    return (this.cache.moduleFlags.weeklyBreaks || []).map((b) => ({
      ...b,
      weekdays: [...b.weekdays],
    }));
  }

  static saveWeeklyBreaks(breaks: WeeklyBreakWindow[]): WeeklyBreakWindow[] {
    this.patchModuleFlagsPartial({
      weeklyBreaks: breaks.map((b) => ({ ...b, weekdays: [...b.weekdays] })),
    });
    return this.getWeeklyBreaks();
  }

  static getClosedDateRanges(): ClosedDateRangeEntry[] {
    return (this.cache.moduleFlags.closedDateRanges || []).map((c) => ({ ...c }));
  }

  static saveClosedDateRanges(ranges: ClosedDateRangeEntry[]): ClosedDateRangeEntry[] {
    this.patchModuleFlagsPartial({ closedDateRanges: ranges.map((r) => ({ ...r })) });
    return this.getClosedDateRanges();
  }

  static getClosedDateMatchesForDate(dateStr: string): ClosedDateRangeEntry[] {
    if (!dateStr || !this.isClosedDaysBreaksEnabled()) return [];
    return this.getClosedDateRanges().filter(
      (entry) => dateStr >= entry.startDate && dateStr <= (entry.endDate || entry.startDate)
    );
  }

  static getWeeklyBreakConflictsForSlot(
    dateStr: string,
    startTime: string,
    durationMinutes: number
  ): WeeklyBreakWindow[] {
    if (!dateStr || !this.isClosedDaysBreaksEnabled()) return [];
    const weekday = getWeekdayFromDateStr(dateStr);
    if (weekday === null) return [];
    const slotStart = parseHhMmToMinutes(startTime);
    const slotEnd = slotStart + Math.max(5, durationMinutes || 45);
    return this.getWeeklyBreaks().filter((brk) => {
      if (!brk.isActive || !brk.weekdays.includes(weekday)) return false;
      const brkStart = parseHhMmToMinutes(brk.startTime);
      const brkEnd = parseHhMmToMinutes(brk.endTime);
      return slotStart < brkEnd && brkStart < slotEnd;
    });
  }

  static getRecurringExpenseTemplates(): RecurringExpenseTemplate[] {
    const list = this.cache.moduleFlags.recurringExpenseTemplates;
    return list && list.length > 0
      ? list.map((t) => ({ ...t }))
      : cloneDefaultRecurringExpenseTemplates();
  }

  static saveRecurringExpenseTemplates(
    templates: RecurringExpenseTemplate[]
  ): RecurringExpenseTemplate[] {
    this.patchModuleFlagsPartial({
      recurringExpenseTemplates: templates.map((t) => ({ ...t })),
    });
    return this.getRecurringExpenseTemplates();
  }

  static getReferringDoctors(): ReferringDoctorEntry[] {
    return (this.cache.moduleFlags.referringDoctors || []).map((d) => ({ ...d }));
  }

  static saveReferringDoctors(doctors: ReferringDoctorEntry[]): ReferringDoctorEntry[] {
    this.patchModuleFlagsPartial({ referringDoctors: doctors.map((d) => ({ ...d })) });
    return this.getReferringDoctors();
  }

  static upsertReferringDoctor(
    entry: Omit<ReferringDoctorEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): ReferringDoctorEntry[] {
    const now = new Date().toISOString();
    const list = this.getReferringDoctors();
    const targetId = entry.id || `refdoc_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    const idx = list.findIndex((d) => d.id === targetId);
    const record: ReferringDoctorEntry = {
      ...entry,
      id: targetId,
      createdAt: idx >= 0 ? list[idx].createdAt : now,
      updatedAt: now,
    };
    const next = idx >= 0 ? list.map((d, i) => (i === idx ? record : d)) : [record, ...list];
    return this.saveReferringDoctors(next);
  }

  static deleteReferringDoctor(doctorId: string): ReferringDoctorEntry[] {
    return this.saveReferringDoctors(this.getReferringDoctors().filter((d) => d.id !== doctorId));
  }

  static getPostDischargeFollowUps(): PostDischargeFollowUpRecord[] {
    return (this.cache.moduleFlags.postDischargeFollowUps || []).map((f) => ({ ...f }));
  }

  static recordPostDischargeFollowUp(
    entry: Omit<PostDischargeFollowUpRecord, 'id' | 'recordedAt' | 'recordedBy'> & {
      recordedAt?: string;
    }
  ): PostDischargeFollowUpRecord[] {
    const staff = this.getActiveStaff();
    const list = this.cache.moduleFlags.postDischargeFollowUps || [];
    const existingIdx = list.findIndex(
      (f) =>
        f.patientId === entry.patientId &&
        f.intervalWeeks === entry.intervalWeeks &&
        (entry.episodeId ? f.episodeId === entry.episodeId : f.dischargeDate === entry.dischargeDate)
    );
    const record: PostDischargeFollowUpRecord = {
      ...entry,
      id:
        existingIdx >= 0
          ? list[existingIdx].id
          : `pdfu_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      recordedAt: entry.recordedAt || localDate(),
      recordedBy: staff.nameAr,
    };
    const next =
      existingIdx >= 0
        ? list.map((f, i) => (i === existingIdx ? record : f))
        : [record, ...list];
    this.patchModuleFlagsPartial({ postDischargeFollowUps: next });
    return next.map((f) => ({ ...f }));
  }

  // ---------------------------------------------------------------------
  // Phase 5.2: Encrypted Patient Attachments & Posture Photos (Dexie v9)
  // ---------------------------------------------------------------------
  static getAttachmentsForPatient(patientId: string): EncryptedAttachmentRecord[] {
    return [...(this.cache.attachmentsByPatientId.get(patientId) || [])].sort((a, b) =>
      b.capturedAt.localeCompare(a.capturedAt) || b.createdAt.localeCompare(a.createdAt)
    );
  }

  static getTotalAttachmentsBytes(): number {
    let total = 0;
    for (const list of this.cache.attachmentsByPatientId.values()) {
      for (const att of list) {
        total += att.storedBytes || 0;
      }
    }
    return total;
  }

  static async saveAttachmentAsync(
    input: Omit<EncryptedAttachmentRecord, 'id' | 'createdAt' | 'updatedAt' | 'version'> & {
      id?: string;
    }
  ): Promise<EncryptedAttachmentRecord> {
    const now = new Date().toISOString();
    const id = input.id || `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const existingList = this.cache.attachmentsByPatientId.get(input.patientId) || [];
    const existing = existingList.find((a) => a.id === id);

    const record: EncryptedAttachmentRecord = {
      ...input,
      id,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      version: (existing?.version || 0) + 1,
    };

    const nextList = [record, ...existingList.filter((a) => a.id !== id)];
    this.cache.attachmentsByPatientId.set(input.patientId, nextList);

    if (!this.activeDb.verno || this.activeDb.verno >= 9) {
      await this.trackWrite(
        this.putRecordEncrypted(
          'attachments',
          record.id,
          [record.patientId],
          record,
          {
            patientId: record.patientId,
            category: record.category,
            ...(record.episodeId ? { episodeId: record.episodeId } : {}),
          },
          { skipConcurrencyCheck: true }
        )
      );
    }

    await this.appendAuditLogAsync({
      actionType: 'attachment_saved',
      entityType: 'attachment',
      entityId: record.id,
      patientId: record.patientId,
      episodeId: record.episodeId,
      summaryAr: `حفظ مرفق سريري مشفر (${record.title}) — ${Math.round((record.storedBytes || 0) / 1024)} KB`,
      summaryEn: `Saved encrypted clinical attachment (${record.title}) — ${Math.round((record.storedBytes || 0) / 1024)} KB`,
    });

    this.notifyListeners();
    return record;
  }

  static async deleteAttachmentAsync(
    patientId: string,
    attachmentId: string
  ): Promise<EncryptedAttachmentRecord[]> {
    const existingList = this.cache.attachmentsByPatientId.get(patientId) || [];
    const target = existingList.find((a) => a.id === attachmentId);
    const nextList = existingList.filter((a) => a.id !== attachmentId);
    this.cache.attachmentsByPatientId.set(patientId, nextList);

    if (!this.activeDb.verno || this.activeDb.verno >= 9) {
      await this.deleteRecordEncrypted('attachments', attachmentId);
    }

    if (target) {
      await this.appendAuditLogAsync({
        actionType: 'attachment_deleted',
        entityType: 'attachment',
        entityId: attachmentId,
        patientId,
        summaryAr: `حذف مرفق سريري (${target.title})`,
        summaryEn: `Deleted clinical attachment (${target.title})`,
      });
    }

    this.notifyListeners();
    return this.getAttachmentsForPatient(patientId);
  }

  // ---------------------------------------------------------------------
  // Phase 5.6: Encrypted Clinical Note Templates & Content Packs (Dexie v9)
  // ---------------------------------------------------------------------
  static getAllNoteTemplates(): NoteTemplateSnippet[] {
    const customMap = new Map<string, NoteTemplateSnippet>();
    for (const t of this.cache.noteTemplates) {
      customMap.set(t.id, t);
    }
    const merged: NoteTemplateSnippet[] = [];
    for (const cc0 of BUILT_IN_CC0_SNIPPETS) {
      merged.push(customMap.get(cc0.id) || cc0);
      customMap.delete(cc0.id);
    }
    return [...Array.from(customMap.values()), ...merged];
  }

  static getCustomNoteTemplates(): NoteTemplateSnippet[] {
    return [...this.cache.noteTemplates];
  }

  static async saveNoteTemplateAsync(
    snippet: Omit<NoteTemplateSnippet, 'id' | 'updatedAt' | 'version'> & { id?: string }
  ): Promise<NoteTemplateSnippet> {
    const cleanTrigger = snippet.slashTrigger.replace(/^\/+/, '').trim().toLowerCase();
    if (!cleanTrigger) {
      throw new Error('يرجى إدخال كلمة الاختصار بدون مسافات.');
    }
    const now = new Date().toISOString();
    const id = snippet.id || `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const existing = this.cache.noteTemplates.find((n) => n.id === id);

    const record: NoteTemplateSnippet = {
      ...snippet,
      id,
      slashTrigger: cleanTrigger,
      isBuiltIn: false,
      updatedAt: now,
      version: (existing?.version || 0) + 1,
    };

    this.cache.noteTemplates = [
      record,
      ...this.cache.noteTemplates.filter((n) => n.id !== id),
    ];

    if (!this.activeDb.verno || this.activeDb.verno >= 9) {
      await this.trackWrite(
        this.putRecordEncrypted(
          'noteTemplates',
          record.id,
          [],
          record,
          { category: record.category },
          { skipConcurrencyCheck: true }
        )
      );
    }

    this.notifyListeners();
    return record;
  }

  static async deleteNoteTemplateAsync(id: string): Promise<void> {
    this.cache.noteTemplates = this.cache.noteTemplates.filter((n) => n.id !== id);
    if (!this.activeDb.verno || this.activeDb.verno >= 9) {
      await this.deleteRecordEncrypted('noteTemplates', id);
    }
    this.notifyListeners();
  }

  static async importContentPackAsync(rawJson: string): Promise<{
    pack: ContentPackDefinition;
    importedCount: number;
  }> {
    const { pack, snippets } = parseAndValidateContentPackJson(rawJson);
    const nonConflict = this.cache.noteTemplates.filter((n) => n.packId !== pack.packId);
    this.cache.noteTemplates = [...snippets, ...nonConflict];

    if (!this.activeDb.verno || this.activeDb.verno >= 9) {
      for (const s of snippets) {
        await this.trackWrite(
          this.putRecordEncrypted(
            'noteTemplates',
            s.id,
            [],
            s,
            { category: s.category },
            { skipConcurrencyCheck: true }
          )
        );
      }
    }

    await this.appendAuditLogAsync({
      actionType: 'content_pack_imported',
      entityType: 'settings',
      entityId: pack.packId,
      summaryAr: `استيراد حزمة قوالب (${pack.name} — ${pack.license}): ${snippets.length} قالب`,
      summaryEn: `Imported template content pack (${pack.name} — ${pack.license}): ${snippets.length} snippets`,
    });

    this.notifyListeners();
    return { pack, importedCount: snippets.length };
  }

  static getAllEpisodeClinicalStores(): EpisodeScopedClinicalStore[] {
    return Array.from(this.cache.episodeClinicalByEpisodeId.values());
  }

  static getWhatsAppTemplates(): WhatsAppTemplatesConfig {
    return {
      ...this.cache.whatsappTemplates,
      appointmentReminder: { ...this.cache.whatsappTemplates.appointmentReminder },
      hepProgram: { ...this.cache.whatsappTemplates.hepProgram },
      paymentReceipt: { ...this.cache.whatsappTemplates.paymentReceipt },
    };
  }

  static async saveWhatsAppTemplatesAsync(
    partial: Partial<Omit<WhatsAppTemplatesConfig, 'id' | 'updatedAt' | 'version'>>
  ): Promise<WhatsAppTemplatesConfig> {
    const next: WhatsAppTemplatesConfig = {
      id: 'whatsapp_templates',
      appointmentReminder:
        partial.appointmentReminder || this.cache.whatsappTemplates.appointmentReminder,
      hepProgram: partial.hepProgram || this.cache.whatsappTemplates.hepProgram,
      paymentReceipt: partial.paymentReceipt || this.cache.whatsappTemplates.paymentReceipt,
      updatedAt: new Date().toISOString(),
      version: (this.cache.whatsappTemplates.version || 0) + 1,
    };
    this.cache.whatsappTemplates = next;
    await this.trackWrite(
      this.putRecordEncrypted('clinicSettings', 'whatsapp_templates', [], next, {}, { skipConcurrencyCheck: true })
    );
    await this.appendAuditLogAsync({
      actionType: 'settings_updated',
      entityType: 'settings',
      entityId: 'whatsapp_templates',
      summaryAr: 'تحديث قوالب رسائل واتساب للعيادة',
      summaryEn: 'Updated clinic WhatsApp message templates',
    });
    this.notifyListeners();
    return this.getWhatsAppTemplates();
  }

  static async resetWhatsAppTemplatesAsync(): Promise<WhatsAppTemplatesConfig> {
    return this.saveWhatsAppTemplatesAsync({
      appointmentReminder: { ...DEFAULT_WHATSAPP_TEMPLATES.appointmentReminder },
      hepProgram: { ...DEFAULT_WHATSAPP_TEMPLATES.hepProgram },
      paymentReceipt: { ...DEFAULT_WHATSAPP_TEMPLATES.paymentReceipt },
    });
  }

  static getClinicProfile(): ClinicProfileData {
    return { ...this.cache.clinicProfile };
  }

  static async saveClinicProfileAsync(
    partial: Partial<Omit<ClinicProfileData, 'id' | 'updatedAt' | 'version'>>
  ): Promise<ClinicProfileData> {
    const next: ClinicProfileData = {
      ...this.cache.clinicProfile,
      ...partial,
      id: 'clinic_profile',
      updatedAt: new Date().toISOString(),
      version: (this.cache.clinicProfile.version || 0) + 1,
    };
    this.cache.clinicProfile = next;
    await this.trackWrite(
      this.putRecordEncrypted('clinicSettings', 'clinic_profile', [], next, {}, { skipConcurrencyCheck: true })
    );
    this.appendAuditLog({
      actionType: 'settings_updated',
      entityType: 'settings',
      entityId: 'clinic_profile',
      summaryAr: `تحديث بيانات ملف العيادة (${next.clinicNameAr || next.clinicNameEn || 'PhysioRecord'})`,
      summaryEn: `Updated Clinic Profile (${next.clinicNameEn || next.clinicNameAr || 'PhysioRecord'})`,
    });
    this.notifyListeners();
    return next;
  }

  static getSecurityConfig(): SecurityConfigSettings {
    return { ...this.cache.securityConfig };
  }

  static async saveSecurityConfigAsync(
    partial: Partial<Omit<SecurityConfigSettings, 'id' | 'updatedAt' | 'version'>>
  ): Promise<SecurityConfigSettings> {
    const next: SecurityConfigSettings = {
      ...this.cache.securityConfig,
      ...partial,
      id: 'security_config',
      updatedAt: new Date().toISOString(),
      version: (this.cache.securityConfig.version || 0) + 1,
    };
    this.cache.securityConfig = next;
    await this.trackWrite(
      this.putRecordEncrypted('clinicSettings', 'security_config', [], next, {}, { skipConcurrencyCheck: true })
    );
    this.notifyListeners();
    return next;
  }

  static getMrnRegistry(): MrnRegistryData {
    return {
      ...this.cache.mrnRegistry,
      issuedMrns: [...this.cache.mrnRegistry.issuedMrns],
      ...(this.cache.mrnRegistry.patientMrnMap
        ? { patientMrnMap: { ...this.cache.mrnRegistry.patientMrnMap } }
        : {}),
    };
  }

  static async saveMrnRegistryAsync(reg: MrnRegistryData): Promise<void> {
    const next: MrnRegistryData = {
      ...reg,
      id: 'mrn_registry',
      updatedAt: new Date().toISOString(),
      version: (this.cache.mrnRegistry.version || 0) + 1,
    };
    this.cache.mrnRegistry = next;
    await this.trackWrite(
      this.putRecordEncrypted('clinicSettings', 'mrn_registry', [], next, {}, { skipConcurrencyCheck: true })
    );
  }

  static saveMrnRegistrySync(reg: MrnRegistryData): void {
    const next: MrnRegistryData = {
      ...reg,
      id: 'mrn_registry',
      updatedAt: new Date().toISOString(),
      version: (this.cache.mrnRegistry.version || 0) + 1,
    };
    this.cache.mrnRegistry = next;
    void this.trackWrite(
      this.putRecordEncrypted('clinicSettings', 'mrn_registry', [], next, {}, { skipConcurrencyCheck: true })
    ).catch(() => undefined);
  }

  static getBackupMeta(): BackupStateMetadata {
    return { ...this.cache.backupMeta };
  }

  static async updateBackupMetaAsync(
    partial: Partial<Omit<BackupStateMetadata, 'id' | 'updatedAt' | 'version'>>
  ): Promise<BackupStateMetadata> {
    const next: BackupStateMetadata = {
      ...this.cache.backupMeta,
      ...partial,
      id: 'backup_meta',
      updatedAt: new Date().toISOString(),
      version: (this.cache.backupMeta.version || 0) + 1,
    };
    this.cache.backupMeta = next;
    await this.trackWrite(
      this.putRecordEncrypted('clinicSettings', 'backup_meta', [], next, {}, { skipConcurrencyCheck: true })
    );
    this.notifyListeners();
    return next;
  }

  static getWriteTelemetry(): WriteTelemetryStats {
    return { ...this.cache.writeTelemetry };
  }

  // ---------------------------------------------------------------------
  // Phase 2: Solo/Team Workspace Mode, Smart Memory, Quick SOAP & Onboarding
  // Stored strictly inside encrypted Dexie `clinicSettings` (Zero PHI in localStorage)
  // ---------------------------------------------------------------------
  static getWorkspaceMode(): WorkspaceModeSettings {
    return { ...this.cache.workspaceMode };
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
    const now = new Date().toISOString();
    const existingAdmin =
      this.cache.staffRoster.find((s) => s.role === 'admin') || CLINIC_STAFF_ROSTER[0];
    const nameAr =
      params?.therapistNameAr?.trim() ||
      this.cache.clinicProfile.therapistNameAr?.trim() ||
      existingAdmin.nameAr;
    const nameEn =
      params?.therapistNameEn?.trim() ||
      this.cache.clinicProfile.therapistNameEn?.trim() ||
      existingAdmin.nameEn;

    const soloStaff: ClinicStaffMember = {
      id: existingAdmin.id || 'staff_admin',
      nameAr,
      nameEn,
      role: 'admin',
      specialtyAr: existingAdmin.specialtyAr || 'أخصائي العلاج الطبيعي وتأهيل العيادة',
      specialtyEn: existingAdmin.specialtyEn || 'Solo Physical Therapist & Clinic Owner',
    };

    this.cache.staffRoster = [soloStaff];
    this.cache.activeStaffId = soloStaff.id;

    const nextMode: WorkspaceModeSettings = {
      id: 'workspace_mode',
      mode: 'solo',
      wizardCompleted: true,
      updatedAt: now,
      version: (this.cache.workspaceMode.version || 0) + 1,
    };
    this.cache.workspaceMode = nextMode;

    await this.trackWrite(
      this.putRecordEncrypted('clinicSettings', 'workspace_mode', [], nextMode, {}, { skipConcurrencyCheck: true })
    );
    await this.trackWrite(
      this.putRecordEncrypted('staffState', 'staff_roster', [], [soloStaff], {}, { skipConcurrencyCheck: true })
    );
    await this.trackWrite(
      this.putRecordEncrypted(
        'staffState',
        'active_staff',
        [],
        { activeStaffId: soloStaff.id, updatedAt: now },
        {},
        { skipConcurrencyCheck: true }
      )
    );

    if (
      params?.therapistNameAr?.trim() ||
      params?.therapistNameEn?.trim() ||
      params?.clinicNameAr?.trim() ||
      params?.clinicNameEn?.trim()
    ) {
      await this.saveClinicProfileAsync({
        therapistNameAr: nameAr,
        therapistNameEn: nameEn,
        ...(params?.clinicNameAr?.trim() ? { clinicNameAr: params.clinicNameAr.trim() } : {}),
        ...(params?.clinicNameEn?.trim() ? { clinicNameEn: params.clinicNameEn.trim() } : {}),
      });
    }

    await this.appendAuditLogAsync({
      actionType: 'settings_updated',
      entityType: 'settings',
      entityId: 'workspace_mode',
      summaryAr: 'تفعيل وضع المعالج الفردي (Solo Mode)',
      summaryEn: 'Configured Solo Therapist workspace mode',
    });
    this.notifyListeners();
    return nextMode;
  }

  static async configureTeamModeAsync(): Promise<WorkspaceModeSettings> {
    const now = new Date().toISOString();
    const nextMode: WorkspaceModeSettings = {
      id: 'workspace_mode',
      mode: 'team',
      wizardCompleted: true,
      updatedAt: now,
      version: (this.cache.workspaceMode.version || 0) + 1,
    };
    this.cache.workspaceMode = nextMode;

    // If roster was compressed to single solo entry without team customization, expand with default starter roles
    if (this.cache.staffRoster.length <= 1) {
      const primaryAdmin = this.cache.staffRoster[0] || CLINIC_STAFF_ROSTER[0];
      const mergedRoster = [primaryAdmin, ...CLINIC_STAFF_ROSTER.slice(1)];
      this.cache.staffRoster = mergedRoster;
      await this.trackWrite(
        this.putRecordEncrypted('staffState', 'staff_roster', [], mergedRoster, {}, { skipConcurrencyCheck: true })
      );
    }

    await this.trackWrite(
      this.putRecordEncrypted('clinicSettings', 'workspace_mode', [], nextMode, {}, { skipConcurrencyCheck: true })
    );
    await this.appendAuditLogAsync({
      actionType: 'settings_updated',
      entityType: 'settings',
      entityId: 'workspace_mode',
      summaryAr: 'تفعيل وضع فريق العمل (Team Mode)',
      summaryEn: 'Configured Multi-Staff Team workspace mode',
    });
    this.notifyListeners();
    return nextMode;
  }

  static async switchWorkspaceModeAsync(mode: ClinicWorkspaceMode): Promise<WorkspaceModeSettings> {
    return mode === 'solo' ? this.configureSoloModeAsync() : this.configureTeamModeAsync();
  }

  static getSmartMemory(): SmartMemorySettings {
    return {
      ...this.cache.smartMemory,
      recentPatientIds: [...this.cache.smartMemory.recentPatientIds],
      pinnedPatientIds: [...this.cache.smartMemory.pinnedPatientIds],
      services: [...this.cache.smartMemory.services],
    };
  }

  static async updateSmartMemoryAsync(
    partial: Partial<Omit<SmartMemorySettings, 'id' | 'updatedAt' | 'version'>>
  ): Promise<SmartMemorySettings> {
    const next: SmartMemorySettings = {
      ...this.cache.smartMemory,
      ...partial,
      id: 'smart_memory',
      recentPatientIds: (partial.recentPatientIds ?? this.cache.smartMemory.recentPatientIds).slice(0, 12),
      pinnedPatientIds: partial.pinnedPatientIds ?? this.cache.smartMemory.pinnedPatientIds,
      services: partial.services ?? this.cache.smartMemory.services,
      updatedAt: new Date().toISOString(),
      version: (this.cache.smartMemory.version || 0) + 1,
    };
    this.cache.smartMemory = next;
    await this.trackWrite(
      this.putRecordEncrypted('clinicSettings', 'smart_memory', [], next, {}, { skipConcurrencyCheck: true })
    );
    this.notifyListeners();
    return next;
  }

  static recordPatientVisitMemory(patientId: string): void {
    if (!patientId || !patientId.trim()) return;
    const prev = this.cache.smartMemory.recentPatientIds.filter((id) => id !== patientId);
    const updated = [patientId, ...prev].slice(0, 8);
    void this.updateSmartMemoryAsync({ recentPatientIds: updated }).catch(() => undefined);
  }

  static togglePinnedPatient(patientId: string): boolean {
    if (!patientId || !patientId.trim()) return false;
    const exists = this.cache.smartMemory.pinnedPatientIds.includes(patientId);
    const nextPinned = exists
      ? this.cache.smartMemory.pinnedPatientIds.filter((id) => id !== patientId)
      : [patientId, ...this.cache.smartMemory.pinnedPatientIds];
    void this.updateSmartMemoryAsync({ pinnedPatientIds: nextPinned }).catch(() => undefined);
    return !exists;
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
    const updated = await this.updateSmartMemoryAsync({ services });
    return updated.services;
  }

  static getQuickSoapChips(): QuickSoapChip[] {
    return [...this.cache.quickSoapPrefs.favoriteChips];
  }

  static async saveQuickSoapChipsAsync(chips: QuickSoapChip[]): Promise<QuickSoapChip[]> {
    const next: QuickSoapPreferences = {
      id: 'quick_soap_prefs',
      favoriteChips: chips,
      updatedAt: new Date().toISOString(),
      version: (this.cache.quickSoapPrefs.version || 0) + 1,
    };
    this.cache.quickSoapPrefs = next;
    await this.trackWrite(
      this.putRecordEncrypted('clinicSettings', 'quick_soap_prefs', [], next, {}, { skipConcurrencyCheck: true })
    );
    this.notifyListeners();
    return [...next.favoriteChips];
  }

  static getOnboardingState(): OnboardingStateSettings {
    return {
      ...this.cache.onboardingState,
      dismissedTipIds: [...this.cache.onboardingState.dismissedTipIds],
    };
  }

  static async dismissTipAsync(tipId: string): Promise<OnboardingStateSettings> {
    const existing = this.cache.onboardingState.dismissedTipIds;
    const nextIds = existing.includes(tipId) ? existing : [...existing, tipId];
    return this.updateOnboardingStateAsync({ dismissedTipIds: nextIds });
  }

  static async setTourCompletedAsync(tourCompleted: boolean): Promise<OnboardingStateSettings> {
    return this.updateOnboardingStateAsync({ tourCompleted });
  }

  static async setTipsEnabledAsync(tipsEnabled: boolean): Promise<OnboardingStateSettings> {
    return this.updateOnboardingStateAsync({ tipsEnabled });
  }

  static async resetOnboardingAsync(): Promise<OnboardingStateSettings> {
    return this.updateOnboardingStateAsync({
      tourCompleted: false,
      tipsEnabled: true,
      dismissedTipIds: [],
      checklistDismissed: false,
    });
  }

  private static async updateOnboardingStateAsync(
    partial: Partial<Omit<OnboardingStateSettings, 'id' | 'updatedAt' | 'version'>>
  ): Promise<OnboardingStateSettings> {
    const next: OnboardingStateSettings = {
      ...this.cache.onboardingState,
      ...partial,
      id: 'onboarding_state',
      updatedAt: new Date().toISOString(),
      version: (this.cache.onboardingState.version || 0) + 1,
    };
    this.cache.onboardingState = next;
    await this.trackWrite(
      this.putRecordEncrypted('clinicSettings', 'onboarding_state', [], next, {}, { skipConcurrencyCheck: true })
    );
    this.notifyListeners();
    return next;
  }

  static getFinanceSummaryForDate(dateKey: string): {
    totalCollectedIQD: number;
    totalReversedIQD: number;
    netCollectedIQD: number;
    paymentCount: number;
    byMethod: Record<IraqiPaymentMethod, number>;
    expensesIQD: number;
    netCashIQD: number;
  } {
    const byMethod: Record<IraqiPaymentMethod, number> = {
      cash: 0,
      zain_cash: 0,
      qi_card: 0,
      other: 0,
    };
    let totalCollectedIQD = 0;
    let totalReversedIQD = 0;
    let paymentCount = 0;

    for (const inv of this.cache.invoices) {
      for (const pay of inv.payments || []) {
        if (pay.date !== dateKey) continue;
        const m: IraqiPaymentMethod =
          pay.method === 'zain_cash' || pay.method === 'qi_card' || pay.method === 'other'
            ? pay.method
            : 'cash';
        if (pay.amountIQD > 0) {
          totalCollectedIQD += pay.amountIQD;
          paymentCount += 1;
          byMethod[m] += pay.amountIQD;
        } else if (pay.amountIQD < 0) {
          totalReversedIQD += Math.abs(pay.amountIQD);
          byMethod[m] += pay.amountIQD;
        }
      }
    }

    const expensesIQD = this.cache.expenses
      .filter((e) => e.date === dateKey)
      .reduce((acc, e) => acc + (e.amountIQD || 0), 0);
    const netCollectedIQD = totalCollectedIQD - totalReversedIQD;

    return {
      totalCollectedIQD,
      totalReversedIQD,
      netCollectedIQD,
      paymentCount,
      byMethod,
      expensesIQD,
      netCashIQD: netCollectedIQD - expensesIQD,
    };
  }

  static getCashCloses(): CashCloseZReportRecord[] {
    return [...this.cache.cashCloses];
  }

  static buildDailyCashZReportDraft(
    dateKey: string,
    primaryCurrencyCode = DEFAULT_CURRENCY_CODE,
    countedCashActual?: number,
    notes?: string
  ): Omit<CashCloseZReportRecord, 'id' | 'zReportNumber' | 'closedAt' | 'closedBy' | 'updatedAt' | 'version'> {
    const primaryCode = (primaryCurrencyCode || DEFAULT_CURRENCY_CODE).toUpperCase();
    const byMethod: Record<IraqiPaymentMethod, number> = {
      cash: 0,
      zain_cash: 0,
      qi_card: 0,
      other: 0,
    };
    const byCurrency: Record<string, CurrencyBreakdownBucket> = {};
    let totalCollectedPrimary = 0;
    let totalReversedPrimary = 0;
    let paymentCount = 0;
    let reversalCount = 0;

    for (const inv of this.cache.invoices) {
      for (const pay of inv.payments || []) {
        if (pay.date !== dateKey) continue;
        const method: IraqiPaymentMethod =
          pay.method === 'zain_cash' || pay.method === 'qi_card' || pay.method === 'other'
            ? pay.method
            : 'cash';
        const payCode = (pay.currencyCode || primaryCode).toUpperCase();
        if (!byCurrency[payCode]) {
          byCurrency[payCode] = {
            collectedOriginal: 0,
            collectedPrimary: 0,
            reversedOriginal: 0,
            reversedPrimary: 0,
            count: 0,
          };
        }
        const origAmt = Math.abs(pay.originalAmount ?? pay.amountIQD);
        if (pay.amountIQD > 0) {
          totalCollectedPrimary += pay.amountIQD;
          paymentCount += 1;
          byMethod[method] += pay.amountIQD;
          byCurrency[payCode].collectedOriginal += origAmt;
          byCurrency[payCode].collectedPrimary += pay.amountIQD;
          byCurrency[payCode].count += 1;
        } else if (pay.amountIQD < 0) {
          totalReversedPrimary += Math.abs(pay.amountIQD);
          reversalCount += 1;
          byMethod[method] += pay.amountIQD;
          byCurrency[payCode].reversedOriginal += origAmt;
          byCurrency[payCode].reversedPrimary += Math.abs(pay.amountIQD);
        }
      }
    }

    const dayExpenses = this.cache.expenses.filter((e) => e.date === dateKey);
    const totalExpensesPrimary = dayExpenses.reduce((s, e) => s + (e.amountIQD || 0), 0);
    const netCollectedPrimary = totalCollectedPrimary - totalReversedPrimary;
    const netCashFlowPrimary = netCollectedPrimary - totalExpensesPrimary;
    const expectedCashInDrawer = byMethod.cash - totalExpensesPrimary;
    const cashVariance =
      typeof countedCashActual === 'number' && !Number.isNaN(countedCashActual)
        ? countedCashActual - expectedCashInDrawer
        : undefined;

    return {
      dateKey,
      primaryCurrencyCode: primaryCode,
      totalCollectedPrimary,
      totalReversedPrimary,
      netCollectedPrimary,
      totalExpensesPrimary,
      netCashFlowPrimary,
      paymentCount,
      reversalCount,
      expenseCount: dayExpenses.length,
      byMethod,
      byCurrency,
      ...(typeof countedCashActual === 'number' && !Number.isNaN(countedCashActual)
        ? { countedCashActual }
        : {}),
      ...(typeof cashVariance === 'number' ? { cashVariance } : {}),
      ...(notes?.trim() ? { notes: notes.trim() } : {}),
    };
  }

  static async closeDailyCashZReportAsync(params: {
    dateKey: string;
    primaryCurrencyCode?: string;
    countedCashActual?: number;
    notes?: string;
  }): Promise<CashCloseZReportRecord> {
    const primaryCode = (params.primaryCurrencyCode || DEFAULT_CURRENCY_CODE).toUpperCase();
    const draft = this.buildDailyCashZReportDraft(
      params.dateKey,
      primaryCode,
      params.countedCashActual,
      params.notes
    );
    const staff = this.getActiveStaff();
    const now = new Date().toISOString();
    const zNumber = this.allocateNextFinancialNumber('zReport');

    const record: CashCloseZReportRecord = {
      ...draft,
      id: `zrep_${params.dateKey}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      zReportNumber: zNumber,
      closedAt: now,
      closedBy: staff.nameAr || staff.nameEn,
      updatedAt: now,
      version: 1,
    };

    this.cache.cashCloses = [record, ...this.cache.cashCloses];
    if (!this.activeDb.verno || this.activeDb.verno >= 8) {
      await this.trackWrite(
        this.putRecordEncrypted('cashCloses', record.id, [], record, { dateKey: record.dateKey })
      );
    }

    await this.appendAuditLogAsync({
      actionType: 'z_report_closed',
      entityType: 'cash_close',
      entityId: record.id,
      summaryAr: `إغلاق الصندوق اليومي (${record.zReportNumber}) لتاريخ ${record.dateKey} — صافي التدفق النقدي: ${record.netCashFlowPrimary} ${primaryCode}`,
      summaryEn: `Closed Daily Z-Report (${record.zReportNumber}) for ${record.dateKey} — Net Cash Flow: ${record.netCashFlowPrimary} ${primaryCode}`,
    });

    this.notifyListeners();
    return record;
  }

  static getMonthlyFinanceSummary(
    monthKey: string,
    primaryCurrencyCode = DEFAULT_CURRENCY_CODE
  ): MonthlyFinanceSummary {
    const primaryCode = (primaryCurrencyCode || DEFAULT_CURRENCY_CODE).toUpperCase();
    const byMethod: Record<IraqiPaymentMethod, number> = {
      cash: 0,
      zain_cash: 0,
      qi_card: 0,
      other: 0,
    };
    const byExpenseCategory: Record<ExpenseCategoryIQD, number> = {
      rent: 0,
      medical_consumables: 0,
      equipment_maintenance: 0,
      staff_salaries: 0,
      electricity_generator: 0,
      marketing_other: 0,
    };
    const byCurrency: Record<string, CurrencyBreakdownBucket> = {};

    let invoiceCount = 0;
    let voidedInvoiceCount = 0;
    let totalBilledPrimary = 0;
    let totalCollectedPrimary = 0;
    let totalReversedPrimary = 0;

    for (const inv of this.cache.invoices) {
      if (inv.date.startsWith(monthKey)) {
        if (inv.status === 'void') {
          voidedInvoiceCount += 1;
        } else {
          invoiceCount += 1;
          totalBilledPrimary += inv.netAmountIQD || 0;
        }
      }
      for (const pay of inv.payments || []) {
        if (!pay.date.startsWith(monthKey)) continue;
        const m: IraqiPaymentMethod =
          pay.method === 'zain_cash' || pay.method === 'qi_card' || pay.method === 'other'
            ? pay.method
            : 'cash';
        const payCode = (pay.currencyCode || primaryCode).toUpperCase();
        if (!byCurrency[payCode]) {
          byCurrency[payCode] = {
            collectedOriginal: 0,
            collectedPrimary: 0,
            reversedOriginal: 0,
            reversedPrimary: 0,
            count: 0,
          };
        }
        const origAmt = Math.abs(pay.originalAmount ?? pay.amountIQD);
        if (pay.amountIQD > 0) {
          totalCollectedPrimary += pay.amountIQD;
          byMethod[m] += pay.amountIQD;
          byCurrency[payCode].collectedOriginal += origAmt;
          byCurrency[payCode].collectedPrimary += pay.amountIQD;
          byCurrency[payCode].count += 1;
        } else if (pay.amountIQD < 0) {
          totalReversedPrimary += Math.abs(pay.amountIQD);
          byMethod[m] += pay.amountIQD;
          byCurrency[payCode].reversedOriginal += origAmt;
          byCurrency[payCode].reversedPrimary += Math.abs(pay.amountIQD);
        }
      }
    }

    let totalExpensesPrimary = 0;
    for (const exp of this.cache.expenses) {
      if (!exp.date.startsWith(monthKey)) continue;
      totalExpensesPrimary += exp.amountIQD || 0;
      if (exp.category in byExpenseCategory) {
        byExpenseCategory[exp.category] += exp.amountIQD || 0;
      } else {
        byExpenseCategory.marketing_other += exp.amountIQD || 0;
      }
    }

    const netCollectedPrimary = totalCollectedPrimary - totalReversedPrimary;
    return {
      monthKey,
      primaryCurrencyCode: primaryCode,
      invoiceCount,
      voidedInvoiceCount,
      totalBilledPrimary,
      totalCollectedPrimary,
      totalReversedPrimary,
      netCollectedPrimary,
      totalExpensesPrimary,
      netCashFlowPrimary: netCollectedPrimary - totalExpensesPrimary,
      byMethod,
      byExpenseCategory,
      byCurrency,
    };
  }

  // ---------------------------------------------------------------------
  // Patient Medications Encrypted Store (Dexie v7: patientMedications)
  // ---------------------------------------------------------------------
  static getPatientMedications(patientId: string): Array<Record<string, unknown>> {
    const plan = this.cache.patientMedicationsByPatientId.get(patientId);
    return plan ? [...plan.medications] : [];
  }

  static savePatientMedications(patientId: string, medications: Array<Record<string, unknown>>): void {
    const now = new Date().toISOString();
    const existing = this.cache.patientMedicationsByPatientId.get(patientId);
    const plan: PatientMedicationPlan = {
      patientId,
      medications,
      updatedAt: now,
      version: (existing?.version || 0) + 1,
    };
    this.cache.patientMedicationsByPatientId.set(patientId, plan);
    void this.trackWrite(
      this.putRecordEncrypted(
        'patientMedications',
        patientId,
        [patientId],
        plan,
        { patientId }
      )
    ).catch(() => undefined);
    this.notifyListeners();
  }

  // ---------------------------------------------------------------------
  // Custom Clinical Widgets Encrypted Store with Zod Validation (1.11)
  // ---------------------------------------------------------------------
  static getCustomWidgets(): CustomWidgetDefinition[] {
    return [...this.cache.customWidgets];
  }

  static async saveCustomWidgetAsync(
    candidate: unknown,
    rawJsonLength?: number
  ): Promise<CustomWidgetDefinition> {
    const check = validateCustomWidgetDefinition(candidate, rawJsonLength);
    if (!check.ok) {
      throw new Error(check.error);
    }
    const widget = check.data;
    const existsIdx = this.cache.customWidgets.findIndex((w) => w.id === widget.id);
    if (existsIdx < 0 && this.cache.customWidgets.length >= CUSTOM_WIDGET_LIMITS.MAX_WIDGETS) {
      throw new Error(
        `Maximum custom widget cap (${CUSTOM_WIDGET_LIMITS.MAX_WIDGETS}) reached.`
      );
    }

    const updated = [
      ...this.cache.customWidgets.filter((w) => w.id !== widget.id),
      widget,
    ];
    this.cache.customWidgets = updated;
    await this.trackWrite(
      this.putRecordEncrypted('customWidgets', widget.id, [], widget)
    );
    await this.appendAuditLogAsync({
      actionType: 'settings_updated',
      entityType: 'settings',
      entityId: widget.id,
      summaryAr: `حفظ فحص مخصص في الاستوديو: ${widget.titleAr}`,
      summaryEn: `Saved Custom Clinical Widget: ${widget.titleEn}`,
    });
    this.notifyListeners();
    return widget;
  }

  static async deleteCustomWidgetAsync(widgetId: string): Promise<void> {
    this.cache.customWidgets = this.cache.customWidgets.filter((w) => w.id !== widgetId);
    await this.deleteRecordEncrypted('customWidgets', widgetId);
    this.notifyListeners();
  }

  // ---------------------------------------------------------------------
  // Staff Attribution Roster (Honest attribution labels, not auth)
  // ---------------------------------------------------------------------
  static getStaffRoster(): ClinicStaffMember[] {
    return this.cache.staffRoster.length > 0 ? [...this.cache.staffRoster] : [...CLINIC_STAFF_ROSTER];
  }

  static saveStaffRoster(roster: ClinicStaffMember[]): void {
    this.cache.staffRoster = roster;
    void this.trackWrite(
      this.putRecordEncrypted(
        'staffState',
        'staff_roster',
        [],
        roster,
        {},
        { skipConcurrencyCheck: true }
      )
    ).catch(() => undefined);
    this.notifyListeners();
  }

  static getActiveStaff(): ClinicStaffMember {
    const roster = this.getStaffRoster();
    return roster.find((s) => s.id === this.cache.activeStaffId) || roster[0];
  }

  static setActiveStaff(staffId: string): ClinicStaffMember {
    const roster = this.getStaffRoster();
    const matched = roster.find((s) => s.id === staffId) || roster[0];
    this.cache.activeStaffId = matched.id;
    void this.trackWrite(
      this.putRecordEncrypted(
        'staffState',
        'active_staff',
        [],
        { activeStaffId: matched.id, updatedAt: new Date().toISOString() },
        {},
        { skipConcurrencyCheck: true }
      )
    ).catch(() => undefined);
    this.appendAuditLog({
      actionType: 'staff_switched',
      entityType: 'staff',
      entityId: matched.id,
      summaryAr: `تبديل ملصق إسناد الموظف إلى: ${matched.nameAr}`,
      summaryEn: `Switched staff attribution label to: ${matched.nameEn}`,
    });
    this.notifyListeners();
    return matched;
  }

  // ---------------------------------------------------------------------
  // Hash-Chained Encrypted Audit Log (1.6)
  // ---------------------------------------------------------------------
  static getAuditLogs(): AuditLogEntry[] {
    return this.cache.auditLogs.slice(0, 500);
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
    const staff = this.getActiveStaff();
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

    this.cache.auditLogs = [provisional, ...this.cache.auditLogs];

    const task = this.auditChainQueue.then(async () => {
      await this.ensureColdStoreLoadedAsync('auditLogs');
      const chainedOnly = this.cache.auditLogs.filter(
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

      const idx = this.cache.auditLogs.findIndex((e) => e.id === id);
      if (idx >= 0) {
        this.cache.auditLogs[idx] = finalized;
      }

      if (this.activeDek) {
        await this.putRecordEncrypted(
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

    this.auditChainQueue = task.catch(() => undefined);
    void this.trackWrite(task).catch(() => undefined);
    return provisional;
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
    const entry = this.appendAuditLog(params);
    await this.auditChainQueue;
    return this.cache.auditLogs.find((e) => e.id === entry.id) || entry;
  }

  static async verifyAuditChain(
    database?: PhysioRecordDatabase,
    dek?: CryptoKey
  ): Promise<AuditChainVerificationResult> {
    await this.auditChainQueue;
    const targetDb = database || this.activeDb;
    const targetDek = dek || this.activeDek;

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

    return verifyAuditLogChainEntries(this.cache.auditLogs);
  }

  static async buildDailyAuditDigestAsync(dateKey: string): Promise<DailyAuditDigest> {
    await this.ensureColdStoreLoadedAsync('auditLogs');
    const verification = await this.verifyAuditChain();
    const entries = this.cache.auditLogs
      .filter((e) => localDate(e.timestamp) === dateKey)
      .slice()
      .sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

    return {
      dateKey,
      generatedAt: new Date().toISOString(),
      totalEntries: entries.length,
      headHash:
        entries[entries.length - 1]?.entryHash || verification.headHash || 'GENESIS',
      chainValid: verification.valid,
      entries,
    };
  }

  // ---------------------------------------------------------------------
  // Episode-Scoped Clinical Store & Append-Only Snapshots
  // ---------------------------------------------------------------------
  static getEpisodeClinicalStore(episodeId: string, patientId: string): EpisodeScopedClinicalStore {
    const existing = this.cache.episodeClinicalByEpisodeId.get(episodeId);
    if (existing) {
      return existing;
    }

    const fresh: EpisodeScopedClinicalStore = {
      episodeId,
      patientId,
      activeWidgetIds: ['body_chart', 'rom', 'mmt', 'special_tests', 'functional_scales'],
      chiefComplaint: '',
      historyOfPresentIllness: '',
      mechanismOfInjury: '',
      painAtRestNrs: 3,
      painOnActivityNrs: 6,
      painWorst24hNrs: 7,
      painNature: 'ألم ميكانيكي يزداد مع المجهود (Mechanical pain)',
      aggravatingFactors: '',
      relievingFactors: '',
      functionalLimitations: '',
      patientPersonalGoals: '',
      observationPosture: '',
      palpationFindings: '',
      circumferenceEdemaNotes: '',
      treatmentFrequency: '3 جلسات أسبوعياً (3x / Week)',
      plannedDurationWeeks: 6,
      clinicalImpression: '',
      objective: {},
      specialTests: [],
      customWidgetsData: {},
      snapshots: [],
      smartGoals: [],
      hepProgram: [],
      problemList: [],
      outcomeGoals: [],
      performanceTests: [],
      vitalsHistory: [],
      appliedPresetIds: [],
      updatedAt: new Date().toISOString(),
    };
    return fresh;
  }

  static saveEpisodeClinicalStore(store: EpisodeScopedClinicalStore): void {
    const existing = this.cache.episodeClinicalByEpisodeId.get(store.episodeId);
    if (existing) {
      assertAppendOnlySnapshots(existing.snapshots || [], store.snapshots || []);
    }

    const updated: EpisodeScopedClinicalStore = {
      ...store,
      updatedAt: new Date().toISOString(),
    };
    this.cache.episodeClinicalByEpisodeId.set(store.episodeId, updated);

    if (this.activeDek) {
      void this.trackWrite(
        this.putRecordEncrypted(
          'episodeClinical',
          updated.episodeId,
          [updated.episodeId],
          updated,
          {
            episodeId: updated.episodeId,
            patientId: updated.patientId,
          },
          { skipConcurrencyCheck: true }
        )
      ).catch(() => undefined);
    }

    this.appendAuditLog({
      actionType: 'evaluation_saved',
      entityType: 'episode',
      entityId: store.episodeId,
      patientId: store.patientId,
      episodeId: store.episodeId,
      summaryAr: `حفظ وتحديث التقييم السريري لحلقة الرعاية #${store.episodeId.slice(0, 6)}`,
      summaryEn: `Saved episode-scoped clinical assessment for episode #${store.episodeId.slice(0, 6)}`,
    });
  }

  static async getEpisodeClinicalStoreEncrypted(
    episodeId: string,
    patientId: string,
    dek: CryptoKey,
    database: PhysioRecordDatabase = defaultDb
  ): Promise<EpisodeScopedClinicalStore> {
    const existingEntity =
      (await database.episodeClinical.get(episodeId)) ||
      (await database.episodeClinical.where('episodeId').equals(episodeId).first());
    if (existingEntity) {
      const dec = await decryptRecordPayload<EpisodeScopedClinicalStore>(
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
      this.cache.episodeClinicalByEpisodeId.set(episodeId, dec);
      return dec;
    }
    return this.getEpisodeClinicalStore(episodeId, patientId);
  }

  static async saveEpisodeClinicalStoreEncrypted(
    store: EpisodeScopedClinicalStore,
    dek: CryptoKey,
    database: PhysioRecordDatabase = defaultDb,
    expectedUpdatedAt?: string
  ): Promise<EncryptedEpisodeClinicalEntity> {
    if (!store.episodeId || !store.patientId) {
      throw new Error('معرّف حلقة الرعاية والمريض إلزاميان لحفظ سجل التقييم المشفر.');
    }

    // Read-only legacy snapshot invariant check if an unmigrated key exists during migration
    if (typeof localStorage !== 'undefined') {
      const epKey = `physiorecord_episode_clinical_v2_${store.episodeId}`;
      const existingLsRaw = localStorage.getItem(epKey);
      if (existingLsRaw) {
        try {
          const parsedLs = JSON.parse(existingLsRaw) as EpisodeScopedClinicalStore;
          assertAppendOnlySnapshots(parsedLs.snapshots || [], store.snapshots || []);
        } catch (err) {
          if (err instanceof Error && err.message.includes('Append-only Snapshots')) {
            throw err;
          }
        }
      }
    }

    const preEntity =
      (await database.episodeClinical.get(store.episodeId)) ||
      (await database.episodeClinical.where('episodeId').equals(store.episodeId).first());

    if (
      expectedUpdatedAt !== undefined &&
      preEntity &&
      preEntity.updatedAt !== expectedUpdatedAt
    ) {
      throw new StaleTabOverwriteError(
        'تم تعديل سجل تقييم حلقة الرعاية في تبويب آخر (Changed in another tab).'
      );
    }

    if (preEntity) {
      const preDecrypted = await decryptRecordPayload<EpisodeScopedClinicalStore>(
        dek,
        'episodeClinical',
        preEntity.id,
        [preEntity.episodeId],
        preEntity.iv,
        preEntity.ciphertext,
        preEntity.recordCryptoVersion || CURRENT_RECORD_CRYPTO_VERSION,
        preEntity.dekVersion || CURRENT_DEK_VERSION,
        preEntity.recordSalt
      );
      assertAppendOnlySnapshots(preDecrypted.snapshots || [], store.snapshots || []);
    }

    const baselineUpdatedAt = expectedUpdatedAt ?? preEntity?.updatedAt;
    const baselineIv = preEntity?.iv;
    const now = new Date().toISOString();
    const createdAt = preEntity?.createdAt || now;

    const payloadToEncrypt: EpisodeScopedClinicalStore = {
      ...store,
      updatedAt: now,
    };

    const meta = await database.vaultMeta.get('auth');
    const activeDekVersion = meta?.dekVersion || CURRENT_DEK_VERSION;

    const { iv, ciphertext, recordSalt } = await encryptRecordWithMandatoryReservation(
      database,
      dek,
      'episodeClinical',
      store.episodeId,
      [store.episodeId],
      payloadToEncrypt,
      CURRENT_RECORD_CRYPTO_VERSION,
      activeDekVersion
    );

    const candidateEntity: EncryptedEpisodeClinicalEntity = {
      id: store.episodeId,
      episodeId: store.episodeId,
      patientId: store.patientId,
      createdAt,
      updatedAt: now,
      version: (preEntity?.version ?? 0) + 1,
      recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
      dekVersion: activeDekVersion,
      recordSalt,
      iv,
      ciphertext,
    };

    if (episodeClinicalMutationTestHook) {
      await episodeClinicalMutationTestHook({ episodeId: store.episodeId });
    }

    await database.transaction(
      'rw',
      [database.episodeClinical, database.vaultMeta],
      async () => {
        const currentEntity =
          (await database.episodeClinical.get(store.episodeId)) ||
          (await database.episodeClinical.where('episodeId').equals(store.episodeId).first());

        if (preEntity) {
          if (
            !currentEntity ||
            currentEntity.updatedAt !== baselineUpdatedAt ||
            (baselineIv && !areUint8ArraysEqual(currentEntity.iv, baselineIv))
          ) {
            throw new StaleTabOverwriteError(
              'تم تعديل سجل تقييم حلقة الرعاية في تبويب آخر أثناء الحفظ (Changed in another tab).'
            );
          }
        } else if (currentEntity) {
          throw new StaleTabOverwriteError(
            'تم إنشاء سجل تقييم حلقة الرعاية في تبويب آخر أثناء الحفظ (Changed in another tab).'
          );
        }

        if (currentEntity) {
          const inTxDecrypted = await decryptRecordPayload<EpisodeScopedClinicalStore>(
            dek,
            'episodeClinical',
            currentEntity.id,
            [currentEntity.episodeId],
            currentEntity.iv,
            currentEntity.ciphertext,
            currentEntity.recordCryptoVersion || CURRENT_RECORD_CRYPTO_VERSION,
            currentEntity.dekVersion || CURRENT_DEK_VERSION,
            currentEntity.recordSalt
          );
          assertAppendOnlySnapshots(
            inTxDecrypted.snapshots || [],
            payloadToEncrypt.snapshots || []
          );
        }

        await database.episodeClinical.put(candidateEntity);
      }
    );

    this.cache.episodeClinicalByEpisodeId.set(store.episodeId, payloadToEncrypt);
    return candidateEntity;
  }

  static recordEpisodeSnapshot(
    episodeId: string,
    patientId: string,
    snapshotType: ClinicalAssessmentSnapshot['snapshotType'],
    customLabelAr?: string,
    customLabelEn?: string
  ): ClinicalAssessmentSnapshot {
    const store = this.getEpisodeClinicalStore(episodeId, patientId);
    const staff = this.getActiveStaff();
    const today = localDate();

    const romEntries = store.objective?.romBattery?.entries || [];
    const mmtEntries = store.objective?.mmtBattery?.entries || [];

    const typeLabels: Record<ClinicalAssessmentSnapshot['snapshotType'], { ar: string; en: string }> = {
      initial_evaluation: { ar: 'التقييم الأولي (Baseline)', en: 'Initial Evaluation' },
      re_evaluation: {
        ar: `إعادة تقييم سريري (${store.snapshots.length + 1})`,
        en: `Re-evaluation #${store.snapshots.length + 1}`,
      },
      follow_up: { ar: 'تحديث متابعة سريرية', en: 'Follow-up Snapshot' },
      discharge: { ar: 'تقييم التخريج الختامي (Discharge)', en: 'Discharge Evaluation' },
    };

    const snapshot: ClinicalAssessmentSnapshot = {
      id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      episodeId,
      snapshotType,
      recordedDate: today,
      recordedBy: staff.nameEn,
      labelAr: customLabelAr || typeLabels[snapshotType].ar,
      labelEn: customLabelEn || typeLabels[snapshotType].en,
      painNrsRest: store.painAtRestNrs ?? 0,
      painNrsActivity: store.painOnActivityNrs ?? 0,
      romSummary: romEntries
        .filter((r) => r.isTested && r.measuredAngleDegrees !== null)
        .map((r) => ({
          jointMovementKey: `${r.jointId}_${r.movementId}_${r.laterality}`,
          canonicalKey: r.canonicalKey ?? `rom.${r.jointId}.${r.movementId}.${r.laterality}`,
          label: r.label || r.movementNameEn || r.movementNameAr,
          labelAr: `${r.jointNameAr} - ${r.movementNameAr} (${r.laterality === 'right' ? 'يمين' : r.laterality === 'left' ? 'يسار' : 'ثنائي'})`,
          labelEn: `${r.jointNameEn} ${r.movementNameEn} (${r.laterality})`,
          laterality: r.laterality,
          aromDegrees: r.measuredAngleDegrees,
        })),
      mmtSummary: mmtEntries
        .filter((m) => m.isTested && m.gradeValue !== null)
        .map((m) => ({
          muscleKey: `${m.muscleGroupId}_${m.laterality}`,
          canonicalKey: m.canonicalKey ?? null,
          label: m.label || m.muscleNameAr || m.muscleNameEn,
          labelAr: `${m.muscleNameAr} (${m.laterality === 'right' ? 'يمين' : m.laterality === 'left' ? 'يسار' : 'ثنائي'})`,
          labelEn: `${m.muscleNameEn} (${m.laterality})`,
          laterality: m.laterality,
          grade: m.gradeValue || '4',
        })),
      outcomeScale: store.functionalScales
        ? {
            scaleId: store.functionalScales.scaleId,
            scaleNameAr: store.functionalScales.scaleNameAr,
            scaleNameEn: store.functionalScales.scaleNameEn,
            rawScore: store.functionalScales.rawScore,
            scorePercentage: store.functionalScales.scorePercentage,
            severityLabelAr: store.functionalScales.severityLabelAr,
            severityLabelEn: store.functionalScales.severityLabelEn,
          }
        : undefined,
      specialTestsPositiveCount: (store.specialTests || []).filter(
        (t) => t.outcome === 'positive' || t.outcome === 'pain_reproduced'
      ).length,
      clinicalImpressionNote: store.clinicalImpression,
    };

    const nextStore: EpisodeScopedClinicalStore = {
      ...store,
      snapshots: [...store.snapshots, snapshot],
    };
    this.saveEpisodeClinicalStore(nextStore);
    return snapshot;
  }

  // Legacy in-memory flowsheet accessors (kept for compat without localStorage)
  static getSessionFlowsheet(sessionId: string): SessionFlowsheetData | null {
    return this.cache.flowsheetBySessionId.get(sessionId) || null;
  }

  static saveSessionFlowsheet(sessionId: string, episodeId: string, data: SessionFlowsheetData): void {
    this.cache.flowsheetBySessionId.set(sessionId, data);
    this.cache.latestFlowsheetByEpisodeId.set(episodeId, data);
  }

  static getLatestEpisodeFlowsheet(episodeId: string): SessionFlowsheetData | null {
    return this.cache.latestFlowsheetByEpisodeId.get(episodeId) || null;
  }

  // ---------------------------------------------------------------------
  // Appointments & Recurring Weekly Schedules (Encrypted Dexie Single-Record)
  // ---------------------------------------------------------------------
  static getAppointments(): ClinicAppointment[] {
    return this.cache.appointments.filter((a) => Boolean(a.patientId));
  }

  static saveAppointment(appt: Omit<ClinicAppointment, 'id'> & { id?: string }): ClinicAppointment {
    if (!appt.patientId || !appt.patientId.trim()) {
      throw new Error('Patient ID is required for every clinic appointment.');
    }
    const existing = appt.id ? this.cache.appointments.find((a) => a.id === appt.id) : undefined;
    const now = new Date().toISOString();
    const record: ClinicAppointment = {
      ...appt,
      patientId: appt.patientId.trim(),
      id: appt.id || `appt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      updatedAt: now,
      version: (existing?.version || 0) + 1,
    };

    const idx = this.cache.appointments.findIndex((a) => a.id === record.id);
    if (idx >= 0) {
      this.cache.appointments[idx] = record;
    } else {
      this.cache.appointments = [record, ...this.cache.appointments];
    }

    void this.trackWrite(
      this.putRecordEncrypted('appointments', record.id, [], record, { patientId: record.patientId })
    ).catch(() => undefined);

    this.appendAuditLog({
      actionType: 'appointment_created',
      entityType: 'appointment',
      entityId: record.id,
      patientId: record.patientId,
      episodeId: record.episodeId,
      summaryAr: `حجز موعد جديد للمريض: ${record.patientName} (${record.date} الساعة ${record.startTime})`,
      summaryEn: `Scheduled appointment for ${record.patientName} (${record.date} at ${record.startTime})`,
    });
    this.notifyListeners();
    return record;
  }

  static restoreAppointment(appt: ClinicAppointment): ClinicAppointment[] {
    if (appt.recurringScheduleId) {
      this.unmarkSkippedRecurringDate(appt.recurringScheduleId, appt.date);
    }
    const rest = this.cache.appointments.filter((a) => a.id !== appt.id);
    this.cache.appointments = [appt, ...rest];
    void this.trackWrite(
      this.putRecordEncrypted(
        'appointments',
        appt.id,
        [],
        appt,
        { patientId: appt.patientId },
        { skipConcurrencyCheck: true }
      )
    ).catch(() => undefined);
    this.notifyListeners();
    return this.getAppointments();
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
    const candCoreStart = parseHhMmToMinutes(candidate.startTime);
    const candCoreEnd = candCoreStart + Math.max(5, candidate.durationMinutes || 45);
    const candBufStart = candCoreStart - Math.max(0, candidate.travelBufferBeforeMin || 0);
    const candBufEnd = candCoreEnd + Math.max(0, candidate.travelBufferAfterMin || 0);
    const allOverlaps: ClinicAppointment[] = [];
    const therapistConflicts: ClinicAppointment[] = [];
    const roomConflicts: ClinicAppointment[] = [];
    const travelBufferConflicts: ClinicAppointment[] = [];
    const candRoom = (candidate.roomOrBed || '').trim().toLowerCase();
    const candTherapist = (candidate.therapistName || '').trim().toLowerCase();

    for (const appt of this.cache.appointments) {
      if (candidate.id && appt.id === candidate.id) continue;
      if (appt.date !== candidate.date) continue;
      if (appt.status === 'cancelled' || appt.status === 'no_show') continue;

      const existCoreStart = parseHhMmToMinutes(appt.startTime);
      const existCoreEnd = existCoreStart + Math.max(5, appt.durationMinutes || 45);
      const existBufStart = existCoreStart - Math.max(0, appt.travelBufferBeforeMin || 0);
      const existBufEnd = existCoreEnd + Math.max(0, appt.travelBufferAfterMin || 0);

      const coreOverlaps = candCoreStart < existCoreEnd && existCoreStart < candCoreEnd;
      const bufferedOverlaps = candBufStart < existBufEnd && existBufStart < candBufEnd;
      if (!bufferedOverlaps) continue;

      if (!coreOverlaps) {
        travelBufferConflicts.push(appt);
        continue;
      }

      allOverlaps.push(appt);

      if (candTherapist && appt.therapistName.trim().toLowerCase() === candTherapist) {
        therapistConflicts.push(appt);
      }
      if (candRoom && appt.roomOrBed && appt.roomOrBed.trim().toLowerCase() === candRoom) {
        roomConflicts.push(appt);
      }
    }

    const closedDayMatches = this.getClosedDateMatchesForDate(candidate.date);
    const breakConflicts = this.getWeeklyBreakConflictsForSlot(
      candidate.date,
      candidate.startTime,
      candidate.durationMinutes
    );

    return {
      hasConflict: allOverlaps.length > 0,
      allOverlaps,
      therapistConflicts,
      roomConflicts,
      travelBufferConflicts,
      breakConflicts,
      closedDayMatches,
      allowConcurrent: true,
    };
  }

  static suggestWaitlistForFreedSlot(freedAppt: {
    date: string;
    startTime: string;
    therapistName?: string;
  }): WaitlistMatchSuggestion[] {
    const waitlist = this.getWaitingList();
    if (waitlist.length === 0) return [];
    const freedWeekday = getWeekdayFromDateStr(freedAppt.date);
    const weekdayKeywords: Record<number, string[]> = {
      0: ['أحد', 'احد', 'sun'],
      1: ['إثنين', 'اثنين', 'mon'],
      2: ['ثلاثاء', 'tue'],
      3: ['أربعاء', 'اربعاء', 'wed'],
      4: ['خميس', 'thu'],
      5: ['جمعة', 'fri'],
      6: ['سبت', 'sat'],
    };
    const [hourStr] = (freedAppt.startTime || '12:00').split(':');
    const hour = parseInt(hourStr || '12', 10) || 12;
    const slotWindow = hour < 12 ? 'morning' : hour >= 16 ? 'evening' : 'any';

    return waitlist
      .map((entry) => {
        let score = entry.priority === 'urgent' ? 30 : entry.priority === 'high' ? 20 : 10;
        const reasonsAr: string[] = [];
        const reasonsEn: string[] = [];

        if (entry.priority === 'urgent') {
          reasonsAr.push('حالة عاجلة');
          reasonsEn.push('Urgent priority');
        } else if (entry.priority === 'high') {
          reasonsAr.push('أولوية عالية');
          reasonsEn.push('High priority');
        }

        if (freedWeekday !== null) {
          const kws = weekdayKeywords[freedWeekday] || [];
          const prefLower = (entry.preferredDays || '').toLowerCase();
          if (kws.some((kw) => prefLower.includes(kw))) {
            score += 15;
            reasonsAr.push('يطابق اليوم المفضل');
            reasonsEn.push('Matches preferred day');
          }
        }

        if (entry.preferredTimeWindow === 'any' || entry.preferredTimeWindow === slotWindow) {
          score += 10;
          reasonsAr.push('يطابق الفترة الزمنية');
          reasonsEn.push('Matches time window');
        }

        if (
          entry.preferredTherapist &&
          freedAppt.therapistName &&
          entry.preferredTherapist === freedAppt.therapistName
        ) {
          score += 12;
          reasonsAr.push('نفس المعالج');
          reasonsEn.push('Same therapist');
        }

        return {
          entry,
          score,
          matchReasonAr: reasonsAr.join(' · ') || 'في قائمة الانتظار',
          matchReasonEn: reasonsEn.join(' · ') || 'Active waitlist patient',
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }

  static getCancellationAndNoShowStats(dateFrom?: string, dateTo?: string): CancellationNoShowStats {
    const scoped = this.getAppointments().filter((a) => {
      if (dateFrom && a.date < dateFrom) return false;
      if (dateTo && a.date > dateTo) return false;
      return true;
    });
    const total = scoped.length;
    const completed = scoped.filter((a) => a.status === 'completed').length;
    const cancelled = scoped.filter((a) => a.status === 'cancelled').length;
    const noShow = scoped.filter((a) => a.status === 'no_show').length;
    const activePending = scoped.filter(
      (a) => a.status === 'scheduled' || a.status === 'arrived' || a.status === 'in_session'
    ).length;

    const closedTotal = completed + cancelled + noShow;
    const denom = closedTotal > 0 ? closedTotal : total;
    const pct = (n: number) => (denom > 0 ? Math.round((n / denom) * 100) : 0);

    const tallyReasons = (items: string[]) => {
      const counts = new Map<string, number>();
      for (const r of items) {
        const clean = r.trim();
        if (!clean) continue;
        counts.set(clean, (counts.get(clean) || 0) + 1);
      }
      return Array.from(counts.entries())
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 4);
    };

    const topCancellationReasons = tallyReasons(
      scoped
        .filter((a) => a.status === 'cancelled')
        .map((a) => a.cancellationReason || 'غير محدد / Unspecified')
    );
    const topNoShowReasons = tallyReasons(
      scoped
        .filter((a) => a.status === 'no_show')
        .map((a) => a.noShowReason || 'غير محدد / Unspecified')
    );

    return {
      total,
      completed,
      cancelled,
      noShow,
      activePending,
      attendanceRatePercent: pct(completed),
      cancellationRatePercent: pct(cancelled),
      noShowRatePercent: pct(noShow),
      topCancellationReasons,
      topNoShowReasons,
    };
  }

  static updateAppointmentStatus(
    id: string,
    status: AppointmentStatus,
    reason?: string
  ): ClinicAppointment[] {
    let target: ClinicAppointment | undefined;
    const now = new Date().toISOString();
    const cleanReason = reason?.trim() || undefined;

    this.cache.appointments = this.cache.appointments.map((a) => {
      if (a.id !== id) return a;
      target = {
        ...a,
        status,
        statusUpdatedAt: now,
        ...(status === 'cancelled' && cleanReason ? { cancellationReason: cleanReason } : {}),
        ...(status === 'no_show' && cleanReason ? { noShowReason: cleanReason } : {}),
        updatedAt: now,
        version: (a.version || 0) + 1,
      };
      return target;
    });

    if (target) {
      void this.trackWrite(
        this.putRecordEncrypted('appointments', target.id, [], target, { patientId: target.patientId })
      ).catch(() => undefined);
      this.appendAuditLog({
        actionType: 'appointment_status_changed',
        entityType: 'appointment',
        entityId: id,
        patientId: target.patientId,
        episodeId: target.episodeId,
        summaryAr: cleanReason
          ? `تحديث حالة موعد ${target.patientName} إلى: ${status} (${cleanReason})`
          : `تحديث حالة موعد ${target.patientName} إلى: ${status}`,
        summaryEn: cleanReason
          ? `Updated appointment status for ${target.patientName} to ${status} (${cleanReason})`
          : `Updated appointment status for ${target.patientName} to ${status}`,
      });
    }
    this.notifyListeners();
    return this.getAppointments();
  }

  static deleteAppointment(
    id: string,
    options?: { bypassRecycleBin?: boolean; deletedAtIso?: string }
  ): ClinicAppointment[] {
    const target = this.cache.appointments.find((a) => a.id === id);
    if (target?.recurringScheduleId) {
      this.markSkippedRecurringDate(target.recurringScheduleId, target.date);
    }
    if (target && !target.isDemo && !options?.bypassRecycleBin && this.isTrashRecycleBinEnabled()) {
      this.moveRecordToRecycleBin({
        itemType: 'appointment',
        originalId: target.id,
        titleAr: `${target.patientName} — ${target.date} ${target.startTime}`,
        titleEn: `${target.patientName} — ${target.date} ${target.startTime}`,
        subtitleAr: target.therapistName || target.notes || '',
        subtitleEn: target.therapistName || target.notes || '',
        payload: { ...target },
        nowIso: options?.deletedAtIso,
      });
    }
    this.cache.appointments = this.cache.appointments.filter((a) => a.id !== id);
    void this.deleteRecordEncrypted('appointments', id).catch(() => undefined);
    this.notifyListeners();
    return this.getAppointments();
  }

  private static markSkippedRecurringDate(scheduleId: string, date: string): void {
    const id = `${scheduleId}_${date}`;
    if (this.cache.recurringSkippedDates.has(id)) return;
    const rec = {
      scheduleId,
      date,
      updatedAt: new Date().toISOString(),
      version: 1,
    };
    this.cache.recurringSkippedDates.set(id, rec);
    void this.trackWrite(
      this.putRecordEncrypted(
        'recurringSkippedDates',
        id,
        [],
        rec,
        { scheduleId },
        { skipConcurrencyCheck: true }
      )
    ).catch(() => undefined);
  }

  private static unmarkSkippedRecurringDate(scheduleId: string, date: string): void {
    const id = `${scheduleId}_${date}`;
    if (!this.cache.recurringSkippedDates.has(id)) return;
    this.cache.recurringSkippedDates.delete(id);
    void this.deleteRecordEncrypted('recurringSkippedDates', id).catch(() => undefined);
  }

  static getRecurringSchedules(): RecurringPatientSchedule[] {
    return this.cache.recurringSchedules.filter(
      (r) => Boolean(r.patientId) && Array.isArray(r.weekdays) && r.weekdays.length > 0
    );
  }

  static getRecurringSchedulesForPatient(patientId: string): RecurringPatientSchedule[] {
    return this.getRecurringSchedules().filter((r) => r.patientId === patientId);
  }

  static saveRecurringSchedule(
    input: Omit<RecurringPatientSchedule, 'id' | 'createdAt'> & { id?: string }
  ): RecurringPatientSchedule {
    if (!input.patientId || !input.patientId.trim()) {
      throw new Error('Patient ID is required for every recurring schedule.');
    }
    if (!input.weekdays || input.weekdays.length === 0) {
      throw new Error('At least one weekday must be selected.');
    }
    const existing = input.id
      ? this.cache.recurringSchedules.find((r) => r.id === input.id)
      : undefined;
    const record: RecurringPatientSchedule = {
      ...input,
      patientId: input.patientId.trim(),
      id: input.id || `rec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: existing?.createdAt || localDate(),
      updatedAt: new Date().toISOString(),
      version: (existing?.version || 0) + 1,
    };

    const idx = this.cache.recurringSchedules.findIndex((r) => r.id === record.id);
    if (idx >= 0) {
      this.cache.recurringSchedules[idx] = record;
    } else {
      this.cache.recurringSchedules = [record, ...this.cache.recurringSchedules];
    }

    void this.trackWrite(
      this.putRecordEncrypted('recurringSchedules', record.id, [], record, {
        patientId: record.patientId,
      })
    ).catch(() => undefined);

    const today = localDate();
    this.ensureRecurringAppointmentsForDate(today);
    if (record.startDate && record.startDate !== today) {
      this.ensureRecurringAppointmentsForDate(record.startDate);
    }
    this.notifyListeners();
    return record;
  }

  static toggleRecurringScheduleActive(id: string): RecurringPatientSchedule[] {
    let becameActive = false;
    let updatedRule: RecurringPatientSchedule | undefined;

    this.cache.recurringSchedules = this.cache.recurringSchedules.map((r) => {
      if (r.id !== id) return r;
      becameActive = !r.isActive;
      updatedRule = {
        ...r,
        isActive: !r.isActive,
        updatedAt: new Date().toISOString(),
        version: (r.version || 0) + 1,
      };
      return updatedRule;
    });

    if (updatedRule) {
      void this.trackWrite(
        this.putRecordEncrypted('recurringSchedules', updatedRule.id, [], updatedRule, {
          patientId: updatedRule.patientId,
        })
      ).catch(() => undefined);
    }

    const today = localDate();
    if (!becameActive) {
      const removed = this.cache.appointments.filter(
        (a) => a.recurringScheduleId === id && a.status === 'scheduled' && a.date >= today
      );
      this.cache.appointments = this.cache.appointments.filter(
        (a) => !(a.recurringScheduleId === id && a.status === 'scheduled' && a.date >= today)
      );
      for (const r of removed) {
        void this.deleteRecordEncrypted('appointments', r.id).catch(() => undefined);
      }
    } else {
      this.ensureRecurringAppointmentsForDate(today);
    }

    this.notifyListeners();
    return this.getRecurringSchedules();
  }

  static deleteRecurringSchedule(id: string): RecurringPatientSchedule[] {
    this.cache.recurringSchedules = this.cache.recurringSchedules.filter((r) => r.id !== id);
    void this.deleteRecordEncrypted('recurringSchedules', id).catch(() => undefined);

    const today = localDate();
    const removedAppts = this.cache.appointments.filter(
      (a) => a.recurringScheduleId === id && a.status === 'scheduled' && a.date >= today
    );
    this.cache.appointments = this.cache.appointments.filter(
      (a) => !(a.recurringScheduleId === id && a.status === 'scheduled' && a.date >= today)
    );
    for (const r of removedAppts) {
      void this.deleteRecordEncrypted('appointments', r.id).catch(() => undefined);
    }

    for (const key of Array.from(this.cache.recurringSkippedDates.keys())) {
      if (key.startsWith(`${id}_`)) {
        this.cache.recurringSkippedDates.delete(key);
        void this.deleteRecordEncrypted('recurringSkippedDates', key).catch(() => undefined);
      }
    }

    this.notifyListeners();
    return this.getRecurringSchedules();
  }

  static restoreRecurringSchedule(rule: RecurringPatientSchedule): RecurringPatientSchedule[] {
    const rest = this.cache.recurringSchedules.filter((r) => r.id !== rule.id);
    this.cache.recurringSchedules = [rule, ...rest];
    void this.trackWrite(
      this.putRecordEncrypted(
        'recurringSchedules',
        rule.id,
        [],
        rule,
        { patientId: rule.patientId },
        { skipConcurrencyCheck: true }
      )
    ).catch(() => undefined);
    this.ensureRecurringAppointmentsForDate(localDate());
    this.notifyListeners();
    return this.getRecurringSchedules();
  }

  static ensureRecurringAppointmentsForDate(targetDate: string): ClinicAppointment[] {
    if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      return this.getAppointments();
    }
    if (this.getClosedDateMatchesForDate(targetDate).length > 0) {
      return this.getAppointments();
    }
    const [y, m, d] = targetDate.split('-').map(Number);
    const weekday = new Date(y, m - 1, d, 12, 0, 0).getDay() as ClinicAppointment extends never
      ? never
      : number;

    const rules = this.getRecurringSchedules();
    const existing = this.getAppointments();
    const created: ClinicAppointment[] = [];

    for (const rule of rules) {
      if (!rule.isActive) continue;
      if (!rule.weekdays.includes(weekday as RecurringPatientSchedule['weekdays'][number])) continue;
      if (rule.startDate && targetDate < rule.startDate) continue;
      if (rule.endDate && targetDate > rule.endDate) continue;
      if (this.cache.recurringSkippedDates.has(`${rule.id}_${targetDate}`)) continue;

      const alreadyScheduled = existing.some(
        (a) =>
          (a.recurringScheduleId === rule.id && a.date === targetDate) ||
          (a.patientId === rule.patientId &&
            a.date === targetDate &&
            a.startTime === rule.startTime)
      );
      if (alreadyScheduled) continue;

      const newAppt: ClinicAppointment = {
        id: `appt_rec_${rule.id}_${targetDate}`,
        patientId: rule.patientId,
        isDemo: rule.isDemo,
        patientName: rule.patientName,
        patientPhone: rule.patientPhone,
        episodeId: rule.episodeId,
        episodeTitle: rule.episodeTitle,
        therapistName: rule.therapistName,
        date: targetDate,
        startTime: rule.startTime,
        durationMinutes: rule.durationMinutes,
        visitType: rule.visitType,
        appointmentMode: rule.appointmentMode,
        locationId: rule.locationId,
        homeVisitAddress: rule.homeVisitAddress,
        travelBufferBeforeMin: rule.travelBufferBeforeMin,
        travelBufferAfterMin: rule.travelBufferAfterMin,
        status: 'scheduled',
        roomOrBed: rule.roomOrBed,
        notes: rule.notes,
        recurringScheduleId: rule.id,
        updatedAt: new Date().toISOString(),
        version: 1,
      };
      created.push(newAppt);
      void this.trackWrite(
        this.putRecordEncrypted(
          'appointments',
          newAppt.id,
          [],
          newAppt,
          { patientId: newAppt.patientId },
          { skipConcurrencyCheck: true, skipBroadcast: true }
        )
      ).catch(() => undefined);
    }

    if (created.length > 0) {
      this.cache.appointments = [...created, ...this.cache.appointments];
      broadcastVaultEvent({ type: 'OPERATIONS_UPDATED' });
    }
    return this.getAppointments();
  }

  // ---------------------------------------------------------------------
  // Waiting List
  // ---------------------------------------------------------------------
  static getWaitingList(includeCompleted = false): WaitingListEntry[] {
    return this.cache.waitingList.filter(
      (w) => Boolean(w.patientId) && (includeCompleted || w.status !== 'completed')
    );
  }

  static addWaitingListEntry(entry: Omit<WaitingListEntry, 'id' | 'addedAt'>): WaitingListEntry[] {
    if (!entry.patientId || !entry.patientId.trim()) {
      throw new Error('Patient ID is required for every waiting list entry.');
    }
    const newItem: WaitingListEntry = {
      ...entry,
      patientId: entry.patientId.trim(),
      id: `wait_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      addedAt: localDate(),
      updatedAt: new Date().toISOString(),
      version: 1,
    };
    this.cache.waitingList = [newItem, ...this.cache.waitingList];
    void this.trackWrite(
      this.putRecordEncrypted('waitingList', newItem.id, [], newItem, { patientId: newItem.patientId })
    ).catch(() => undefined);
    this.notifyListeners();
    return this.getWaitingList();
  }

  static restoreWaitingListEntry(entry: WaitingListEntry): WaitingListEntry[] {
    const rest = this.cache.waitingList.filter((w) => w.id !== entry.id);
    this.cache.waitingList = [entry, ...rest];
    void this.trackWrite(
      this.putRecordEncrypted(
        'waitingList',
        entry.id,
        [],
        entry,
        { ...(entry.patientId ? { patientId: entry.patientId } : {}) },
        { skipConcurrencyCheck: true }
      )
    ).catch(() => undefined);
    this.notifyListeners();
    return this.getWaitingList();
  }

  static removeWaitingListEntry(
    id: string,
    options?: { bypassRecycleBin?: boolean; deletedAtIso?: string }
  ): WaitingListEntry[] {
    const target = this.cache.waitingList.find((w) => w.id === id);
    if (target && !target.isDemo && !options?.bypassRecycleBin && this.isTrashRecycleBinEnabled()) {
      this.moveRecordToRecycleBin({
        itemType: 'waiting_list',
        originalId: target.id,
        titleAr: `${target.patientName} — قائمة الانتظار`,
        titleEn: `${target.patientName} — Waiting List`,
        subtitleAr: target.notes || target.phone || '',
        subtitleEn: target.notes || target.phone || '',
        payload: { ...target },
        nowIso: options?.deletedAtIso,
      });
    }
    this.cache.waitingList = this.cache.waitingList.filter((w) => w.id !== id);
    void this.deleteRecordEncrypted('waitingList', id).catch(() => undefined);
    this.notifyListeners();
    return this.getWaitingList();
  }

  // ---------------------------------------------------------------------
  // Iraqi Dinar Financial Ledger (Single-Record Invoices, Payments, Expenses)
  // ---------------------------------------------------------------------
  static getFinancialSequences(): FinancialSequencesData {
    return { ...this.cache.financialSequences };
  }

  private static allocateNextFinancialNumber(
    kind: 'invoice' | 'receipt' | 'creditNote' | 'zReport'
  ): string {
    const seq = this.cache.financialSequences;
    const now = new Date().toISOString();
    let field: keyof Pick<
      FinancialSequencesData,
      'invoiceSequence' | 'receiptSequence' | 'creditNoteSequence' | 'zReportSequence'
    >;
    let prefix: string;
    const existingSet = new Set<string>();

    if (kind === 'invoice') {
      field = 'invoiceSequence';
      prefix = 'INV-';
      for (const inv of this.cache.invoices) {
        if (inv.invoiceNumber) existingSet.add(inv.invoiceNumber);
      }
    } else if (kind === 'receipt') {
      field = 'receiptSequence';
      prefix = 'RCPT-';
      for (const inv of this.cache.invoices) {
        for (const p of inv.payments || []) {
          if (p.receiptNumber) existingSet.add(p.receiptNumber);
        }
      }
    } else if (kind === 'creditNote') {
      field = 'creditNoteSequence';
      prefix = 'CN-';
      for (const inv of this.cache.invoices) {
        if (inv.creditNoteNumber) existingSet.add(inv.creditNoteNumber);
        for (const cn of inv.creditNotes || []) {
          if (cn.creditNoteNumber) existingSet.add(cn.creditNoteNumber);
        }
      }
    } else {
      field = 'zReportSequence';
      prefix = 'Z-';
      for (const z of this.cache.cashCloses) {
        if (z.zReportNumber) existingSet.add(z.zReportNumber);
      }
    }

    let nextNum = (seq[field] || 0) + 1;
    const formatNum = (n: number) => `${prefix}${String(n).padStart(4, '0')}`;
    while (existingSet.has(formatNum(nextNum))) {
      nextNum += 1;
    }

    const updatedSeq: FinancialSequencesData = {
      ...seq,
      [field]: nextNum,
      updatedAt: now,
      version: (seq.version || 0) + 1,
    };
    this.cache.financialSequences = updatedSeq;
    void this.trackWrite(
      this.putRecordEncrypted(
        'clinicSettings',
        'financial_sequences',
        [],
        updatedSeq,
        {},
        { skipConcurrencyCheck: true }
      )
    ).catch(() => undefined);

    return formatNum(nextNum);
  }

  static computeFxPaymentSnapshot(params: {
    primaryCurrencyCode?: string;
    paymentCurrencyCode?: string;
    originalAmount?: number;
    primaryAmountFallback?: number;
    exchangeRateToPrimary?: number;
    maxPrimaryCap?: number;
  }): {
    primaryCurrencyCode: string;
    paymentCurrencyCode: string;
    originalAmount: number;
    exchangeRateToPrimary: number;
    convertedPrimaryAmount: number;
  } {
    const primaryCurrencyCode = (params.primaryCurrencyCode || DEFAULT_CURRENCY_CODE).toUpperCase();
    const paymentCurrencyCode = (params.paymentCurrencyCode || primaryCurrencyCode).toUpperCase();
    const primaryCfg = getCurrencyConfig(primaryCurrencyCode);
    const payCfg = getCurrencyConfig(paymentCurrencyCode);
    const roundFor = (val: number, decimals: number) => {
      const factor = Math.pow(10, decimals);
      return Math.round(val * factor) / factor;
    };

    const isSameCurrency = paymentCurrencyCode === primaryCurrencyCode;
    const rawRate = isSameCurrency ? 1 : Number(params.exchangeRateToPrimary ?? 0);
    if (!isSameCurrency && (!Number.isFinite(rawRate) || rawRate <= 0)) {
      throw new Error(
        `Valid positive exchange rate is required when collecting in ${paymentCurrencyCode} for ${primaryCurrencyCode} ledger.`
      );
    }

    let orig = 0;
    let converted = 0;
    if (typeof params.originalAmount === 'number' && Number.isFinite(params.originalAmount) && params.originalAmount > 0) {
      orig = roundFor(params.originalAmount, payCfg.decimals);
      converted = isSameCurrency ? roundFor(orig, primaryCfg.decimals) : roundFor(orig * rawRate, primaryCfg.decimals);
    } else {
      const fallback = Math.max(0, Number(params.primaryAmountFallback ?? 0));
      converted = roundFor(fallback, primaryCfg.decimals);
      orig = isSameCurrency ? converted : roundFor(converted / rawRate, payCfg.decimals);
    }

    if (typeof params.maxPrimaryCap === 'number' && converted > params.maxPrimaryCap) {
      converted = roundFor(Math.max(0, params.maxPrimaryCap), primaryCfg.decimals);
      orig = isSameCurrency ? converted : roundFor(converted / rawRate, payCfg.decimals);
    }

    return {
      primaryCurrencyCode,
      paymentCurrencyCode,
      originalAmount: orig,
      exchangeRateToPrimary: rawRate,
      convertedPrimaryAmount: Math.max(0, converted),
    };
  }

  static getInvoicesIQD(): FinancialInvoiceIQD[] {
    return this.cache.invoices.filter((i) => Boolean(i.patientId));
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
    if (!params.patientId || !params.patientId.trim()) {
      throw new Error('Patient ID is required for every invoice.');
    }
    const list = this.getInvoicesIQD();
    const staff = this.getActiveStaff();
    const today = localDate();
    const now = new Date().toISOString();
    const primaryCode = (params.currencyCode || DEFAULT_CURRENCY_CODE).toUpperCase();
    const netAmountIQD = Math.max(0, params.totalAmountIQD - params.discountIQD);

    const hasRequestedPayment =
      params.initialPaidIQD > 0 || (typeof params.originalPaidAmount === 'number' && params.originalPaidAmount > 0);

    let paidAmountIQD = 0;
    let payments: PaymentTransactionIQD[] = [];
    if (hasRequestedPayment && netAmountIQD > 0) {
      const fx = this.computeFxPaymentSnapshot({
        primaryCurrencyCode: primaryCode,
        paymentCurrencyCode: params.paymentCurrencyCode,
        originalAmount: params.originalPaidAmount,
        primaryAmountFallback: params.initialPaidIQD,
        exchangeRateToPrimary: params.exchangeRateToPrimary,
        maxPrimaryCap: netAmountIQD,
      });
      paidAmountIQD = fx.convertedPrimaryAmount;
      if (paidAmountIQD > 0) {
        const invTempId = `inv_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
        const receiptNumber = this.allocateNextFinancialNumber('receipt');
        payments = [
          {
            id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            invoiceId: invTempId,
            patientId: params.patientId.trim(),
            date: today,
            amountIQD: paidAmountIQD,
            currencyCode: fx.paymentCurrencyCode,
            originalAmount: fx.originalAmount,
            exchangeRateToPrimary: fx.exchangeRateToPrimary,
            primaryCurrencyCode: fx.primaryCurrencyCode,
            method: params.paymentMethod,
            receivedBy: staff.nameAr,
            receiptNumber,
            status: 'posted',
            notes: 'دفعة عند إصدار الفاتورة',
            updatedAt: now,
            version: 1,
          },
        ];
      }
    }

    const balanceDueIQD = Math.max(0, netAmountIQD - paidAmountIQD);
    const status: FinancialInvoiceIQD['status'] =
      balanceDueIQD === 0 ? 'paid' : paidAmountIQD > 0 ? 'partial' : 'unpaid';

    const invId = payments[0]?.invoiceId || `inv_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    const invoiceNumber = this.allocateNextFinancialNumber('invoice');

    const newInvoice: FinancialInvoiceIQD = {
      id: invId,
      invoiceNumber,
      patientId: params.patientId.trim(),
      isDemo: params.isDemo,
      patientName: params.patientName,
      episodeId: params.episodeId,
      episodeTitle: params.episodeTitle,
      locationId: params.locationId,
      travelFeeIQD:
        typeof params.travelFeeIQD === 'number' && params.travelFeeIQD > 0
          ? params.travelFeeIQD
          : undefined,
      date: today,
      invoiceType: params.invoiceType,
      titleAr: params.titleAr,
      titleEn: params.titleEn,
      currencyCode: primaryCode,
      totalAmountIQD: params.totalAmountIQD,
      discountIQD: params.discountIQD,
      netAmountIQD,
      paidAmountIQD,
      balanceDueIQD,
      status,
      installmentPlan:
        params.installmentPlan && params.installmentPlan.length > 0
          ? reconcileInstallmentsWithPaidTotal(params.installmentPlan, paidAmountIQD, today)
          : undefined,
      packageTotalSessions:
        params.invoiceType === 'rehab_package' ? params.packageTotalSessions || 6 : undefined,
      packageUsedSessions:
        params.invoiceType === 'rehab_package' ? Math.max(0, params.packageUsedSessions ?? 0) : undefined,
      payments,
      createdBy: staff.nameAr,
      notes: params.notes,
      updatedAt: now,
      version: 1,
    };

    this.cache.invoices = [newInvoice, ...list];
    void this.trackWrite(
      this.putRecordsEncryptedBatch([
        {
          tableName: 'invoices',
          id: newInvoice.id,
          parentIds: [],
          payload: newInvoice,
          extraColumns: {
            patientId: newInvoice.patientId,
            ...(newInvoice.episodeId ? { episodeId: newInvoice.episodeId } : {}),
          },
        },
        ...payments.map((p) => ({
          tableName: 'payments' as const,
          id: p.id,
          parentIds: [invId],
          payload: p,
          extraColumns: {
            invoiceId: invId,
            patientId: p.patientId,
          },
        })),
      ])
    ).catch(() => undefined);

    this.appendAuditLog({
      actionType: 'invoice_created',
      entityType: 'invoice',
      entityId: newInvoice.id,
      patientId: newInvoice.patientId,
      episodeId: newInvoice.episodeId,
      summaryAr: `إصدار فاتورة ${invoiceNumber} بقيمة ${netAmountIQD} ${primaryCode} للمريض ${params.patientName}`,
      summaryEn: `Issued invoice ${invoiceNumber} (${netAmountIQD} ${primaryCode}) for ${params.patientName}`,
    });

    this.notifyListeners();
    return newInvoice;
  }

  /**
   * 4.1 Hard-delete guard: financial invoices cannot be hard-deleted; callers must void with reason / credit note.
   */
  static deleteInvoiceIQD(_id: string): FinancialInvoiceIQD[] {
    throw new Error(
      'Hard-deleting financial invoices is disabled (4.1). Use voidInvoiceWithReasonIQD(invoiceId, reason) to issue a Credit Note instead.'
    );
  }

  /**
   * Internal cleanup ONLY for the 8-second uncommitted FinishSessionFlow undo window (Phase 2.4).
   */
  private static rollbackUncommittedFinishInvoice(id: string): FinancialInvoiceIQD[] {
    const existing = this.cache.invoices.find((i) => i.id === id);
    this.cache.invoices = this.cache.invoices.filter((i) => i.id !== id);
    void this.deleteRecordEncrypted('invoices', id).catch(() => undefined);
    for (const p of existing?.payments || []) {
      void this.deleteRecordEncrypted('payments', p.id).catch(() => undefined);
    }
    this.notifyListeners();
    return this.getInvoicesIQD();
  }

  static voidInvoiceWithReasonIQD(invoiceId: string, reason: string): FinancialInvoiceIQD[] {
    const cleanReason = reason.trim();
    if (!cleanReason) {
      throw new Error('A mandatory reason is required to void an invoice.');
    }
    const existing = this.cache.invoices.find((i) => i.id === invoiceId);
    if (!existing) {
      throw new Error(`Invoice ${invoiceId} was not found.`);
    }
    if (existing.status === 'void') {
      throw new Error(`Invoice ${existing.invoiceNumber} is already voided.`);
    }

    const staff = this.getActiveStaff();
    const staffName = staff.nameAr || staff.nameEn;
    const today = localDate();
    const now = new Date().toISOString();
    const creditNoteNumber = this.allocateNextFinancialNumber('creditNote');

    const creditNote: CreditNoteEntry = {
      id: `cn_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      creditNoteNumber,
      invoiceId: existing.id,
      patientId: existing.patientId,
      date: today,
      amountIQD: existing.netAmountIQD,
      reason: cleanReason,
      issuedBy: staffName,
      createdAt: now,
    };

    const reversalPayments: PaymentTransactionIQD[] = [];
    const mutatedPayments: PaymentTransactionIQD[] = (existing.payments || []).map((pay) => {
      if (pay.amountIQD > 0 && !pay.isReversal && pay.status !== 'reversed') {
        const revId = `pay_rev_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
        const revReceipt = this.allocateNextFinancialNumber('receipt');
        const reversalEntry: PaymentTransactionIQD = {
          id: revId,
          invoiceId: existing.id,
          patientId: existing.patientId,
          date: today,
          amountIQD: -Math.abs(pay.amountIQD),
          currencyCode: pay.currencyCode || existing.currencyCode || DEFAULT_CURRENCY_CODE,
          originalAmount:
            typeof pay.originalAmount === 'number'
              ? -Math.abs(pay.originalAmount)
              : -Math.abs(pay.amountIQD),
          exchangeRateToPrimary: pay.exchangeRateToPrimary ?? 1,
          primaryCurrencyCode: pay.primaryCurrencyCode || existing.currencyCode || DEFAULT_CURRENCY_CODE,
          method: pay.method,
          receivedBy: staffName,
          receiptNumber: revReceipt,
          status: 'posted',
          isReversal: true,
          reversalOfPaymentId: pay.id,
          reversalReason: cleanReason,
          notes: `عكس دفعة (${pay.receiptNumber}) عند إصدار إشعار دائن ${creditNoteNumber}`,
          updatedAt: now,
          version: 1,
        };
        reversalPayments.push(reversalEntry);
        return {
          ...pay,
          status: 'reversed' as const,
          reversedByPaymentId: revId,
          reversalReason: cleanReason,
          updatedAt: now,
          version: (pay.version || 0) + 1,
        };
      }
      return pay;
    });

    const updatedPayments = [...mutatedPayments, ...reversalPayments];
    const updatedInvoice: FinancialInvoiceIQD = {
      ...existing,
      paidAmountIQD: 0,
      balanceDueIQD: 0,
      status: 'void',
      voidedAt: now,
      voidReason: cleanReason,
      voidedBy: staffName,
      creditNoteNumber,
      creditNotes: [...(existing.creditNotes || []), creditNote],
      payments: updatedPayments,
      updatedAt: now,
      version: (existing.version || 0) + 1,
    };

    this.cache.invoices = this.cache.invoices.map((inv) =>
      inv.id === invoiceId ? updatedInvoice : inv
    );

    const voidBatchItems: Parameters<typeof ClinicOperationsService.putRecordsEncryptedBatch>[0] = [
      {
        tableName: 'invoices',
        id: updatedInvoice.id,
        parentIds: [],
        payload: updatedInvoice,
        extraColumns: {
          patientId: updatedInvoice.patientId,
          ...(updatedInvoice.episodeId ? { episodeId: updatedInvoice.episodeId } : {}),
        },
      },
      ...mutatedPayments
        .filter((pay) => pay.reversedByPaymentId && reversalPayments.some((r) => r.id === pay.reversedByPaymentId))
        .map((pay) => ({
          tableName: 'payments' as const,
          id: pay.id,
          parentIds: [updatedInvoice.id],
          payload: pay,
          extraColumns: {
            invoiceId: updatedInvoice.id,
            patientId: pay.patientId,
          },
        })),
      ...reversalPayments.map((revPay) => ({
        tableName: 'payments' as const,
        id: revPay.id,
        parentIds: [updatedInvoice.id],
        payload: revPay,
        extraColumns: {
          invoiceId: updatedInvoice.id,
          patientId: revPay.patientId,
        },
      })),
    ];

    void this.trackWrite(this.putRecordsEncryptedBatch(voidBatchItems)).catch(() => undefined);

    this.appendAuditLog({
      actionType: 'invoice_voided',
      entityType: 'invoice',
      entityId: updatedInvoice.id,
      patientId: updatedInvoice.patientId,
      episodeId: updatedInvoice.episodeId,
      summaryAr: `إلغاء الفاتورة ${updatedInvoice.invoiceNumber} وإصدار إشعار دائن ${creditNoteNumber} — السبب: ${cleanReason}`,
      summaryEn: `Voided invoice ${updatedInvoice.invoiceNumber} with Credit Note ${creditNoteNumber} — Reason: ${cleanReason}`,
    });

    this.notifyListeners();
    return this.getInvoicesIQD();
  }

  static reversePaymentIQD(invoiceId: string, paymentId: string, reason: string): FinancialInvoiceIQD[] {
    const cleanReason = reason.trim();
    if (!cleanReason) {
      throw new Error('A mandatory reason is required to reverse a payment.');
    }
    const existing = this.cache.invoices.find((i) => i.id === invoiceId);
    if (!existing) {
      throw new Error(`Invoice ${invoiceId} was not found.`);
    }
    if (existing.status === 'void') {
      throw new Error(`Invoice ${existing.invoiceNumber} is already voided.`);
    }
    const targetPayment = (existing.payments || []).find((p) => p.id === paymentId);
    if (!targetPayment || targetPayment.isReversal || targetPayment.status === 'reversed' || targetPayment.amountIQD <= 0) {
      throw new Error('Target payment is not eligible for reversal.');
    }

    const staff = this.getActiveStaff();
    const staffName = staff.nameAr || staff.nameEn;
    const today = localDate();
    const now = new Date().toISOString();
    const revId = `pay_rev_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    const revReceipt = this.allocateNextFinancialNumber('receipt');

    const reversalEntry: PaymentTransactionIQD = {
      id: revId,
      invoiceId: existing.id,
      patientId: existing.patientId,
      date: today,
      amountIQD: -Math.abs(targetPayment.amountIQD),
      currencyCode: targetPayment.currencyCode || existing.currencyCode || DEFAULT_CURRENCY_CODE,
      originalAmount:
        typeof targetPayment.originalAmount === 'number'
          ? -Math.abs(targetPayment.originalAmount)
          : -Math.abs(targetPayment.amountIQD),
      exchangeRateToPrimary: targetPayment.exchangeRateToPrimary ?? 1,
      primaryCurrencyCode:
        targetPayment.primaryCurrencyCode || existing.currencyCode || DEFAULT_CURRENCY_CODE,
      method: targetPayment.method,
      receivedBy: staffName,
      receiptNumber: revReceipt,
      status: 'posted',
      isReversal: true,
      reversalOfPaymentId: targetPayment.id,
      reversalReason: cleanReason,
      notes: `عكس وصل ${targetPayment.receiptNumber}: ${cleanReason}`,
      updatedAt: now,
      version: 1,
    };

    const mutatedOriginal: PaymentTransactionIQD = {
      ...targetPayment,
      status: 'reversed',
      reversedByPaymentId: revId,
      reversalReason: cleanReason,
      updatedAt: now,
      version: (targetPayment.version || 0) + 1,
    };

    const updatedPayments = [
      ...(existing.payments || []).map((p) => (p.id === paymentId ? mutatedOriginal : p)),
      reversalEntry,
    ];
    const netPaid = Math.max(
      0,
      updatedPayments.reduce((sum, p) => sum + (p.amountIQD || 0), 0)
    );
    const newBal = Math.max(0, existing.netAmountIQD - netPaid);
    const newStatus: FinancialInvoiceIQD['status'] =
      newBal === 0 ? 'paid' : netPaid > 0 ? 'partial' : 'unpaid';

    const updatedInvoice: FinancialInvoiceIQD = {
      ...existing,
      paidAmountIQD: netPaid,
      balanceDueIQD: newBal,
      status: newStatus,
      installmentPlan: reconcileInstallmentsWithPaidTotal(
        existing.installmentPlan,
        netPaid,
        localDate()
      ),
      payments: updatedPayments,
      updatedAt: now,
      version: (existing.version || 0) + 1,
    };

    this.cache.invoices = this.cache.invoices.map((inv) =>
      inv.id === invoiceId ? updatedInvoice : inv
    );

    void this.trackWrite(
      this.putRecordEncrypted('invoices', updatedInvoice.id, [], updatedInvoice, {
        patientId: updatedInvoice.patientId,
        ...(updatedInvoice.episodeId ? { episodeId: updatedInvoice.episodeId } : {}),
      })
    ).catch(() => undefined);

    void this.trackWrite(
      this.putRecordEncrypted('payments', mutatedOriginal.id, [updatedInvoice.id], mutatedOriginal, {
        invoiceId: updatedInvoice.id,
        patientId: mutatedOriginal.patientId,
      })
    ).catch(() => undefined);

    void this.trackWrite(
      this.putRecordEncrypted('payments', reversalEntry.id, [updatedInvoice.id], reversalEntry, {
        invoiceId: updatedInvoice.id,
        patientId: reversalEntry.patientId,
      })
    ).catch(() => undefined);

    this.appendAuditLog({
      actionType: 'payment_reversed',
      entityType: 'payment',
      entityId: updatedInvoice.id,
      patientId: updatedInvoice.patientId,
      episodeId: updatedInvoice.episodeId,
      summaryAr: `عكس الدفعة ${targetPayment.receiptNumber} على الفاتورة ${updatedInvoice.invoiceNumber} — السبب: ${cleanReason}`,
      summaryEn: `Reversed payment ${targetPayment.receiptNumber} on invoice ${updatedInvoice.invoiceNumber} — Reason: ${cleanReason}`,
    });

    this.notifyListeners();
    return this.getInvoicesIQD();
  }

  static restoreInvoiceIQD(invoice: FinancialInvoiceIQD): FinancialInvoiceIQD[] {
    const rest = this.cache.invoices.filter((i) => i.id !== invoice.id);
    this.cache.invoices = [invoice, ...rest];
    void this.trackWrite(
      this.putRecordEncrypted(
        'invoices',
        invoice.id,
        [],
        invoice,
        {
          patientId: invoice.patientId,
          ...(invoice.episodeId ? { episodeId: invoice.episodeId } : {}),
        },
        { skipConcurrencyCheck: true }
      )
    ).catch(() => undefined);
    for (const p of invoice.payments || []) {
      void this.trackWrite(
        this.putRecordEncrypted(
          'payments',
          p.id,
          [invoice.id],
          p,
          { invoiceId: invoice.id, patientId: p.patientId },
          { skipConcurrencyCheck: true }
        )
      ).catch(() => undefined);
    }
    this.notifyListeners();
    return this.getInvoicesIQD();
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
    const targetInv = this.cache.invoices.find((inv) => inv.id === invoiceId);
    if (!targetInv) return this.getInvoicesIQD();
    if (targetInv.status === 'void') {
      throw new Error(`Cannot collect payment on voided invoice ${targetInv.invoiceNumber}.`);
    }

    const staff = this.getActiveStaff();
    const today = localDate();
    const now = new Date().toISOString();
    let updatedInvoice: FinancialInvoiceIQD | null = null;
    let newPayment: PaymentTransactionIQD | null = null;

    const snapshot = this.computeFxPaymentSnapshot({
      primaryCurrencyCode: fx?.primaryCurrencyCode || targetInv.currencyCode || DEFAULT_CURRENCY_CODE,
      paymentCurrencyCode: fx?.paymentCurrencyCode,
      originalAmount: fx?.originalAmount,
      primaryAmountFallback: amountIQD,
      exchangeRateToPrimary: fx?.exchangeRateToPrimary,
      maxPrimaryCap: targetInv.balanceDueIQD,
    });

    if (snapshot.convertedPrimaryAmount <= 0) {
      return this.getInvoicesIQD();
    }

    const receiptNumber = this.allocateNextFinancialNumber('receipt');
    newPayment = {
      id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      invoiceId: targetInv.id,
      patientId: targetInv.patientId,
      date: today,
      amountIQD: snapshot.convertedPrimaryAmount,
      currencyCode: snapshot.paymentCurrencyCode,
      originalAmount: snapshot.originalAmount,
      exchangeRateToPrimary: snapshot.exchangeRateToPrimary,
      primaryCurrencyCode: snapshot.primaryCurrencyCode,
      method,
      receivedBy: staff.nameAr,
      receiptNumber,
      status: 'posted',
      notes: notes || 'تسديد دفعة',
      updatedAt: now,
      version: 1,
    };

    const newPaid = targetInv.paidAmountIQD + snapshot.convertedPrimaryAmount;
    const newBal = Math.max(0, targetInv.netAmountIQD - newPaid);
    updatedInvoice = {
      ...targetInv,
      paidAmountIQD: newPaid,
      balanceDueIQD: newBal,
      status: newBal === 0 ? 'paid' : 'partial',
      installmentPlan: reconcileInstallmentsWithPaidTotal(
        targetInv.installmentPlan,
        newPaid,
        today
      ),
      payments: [...targetInv.payments, newPayment],
      updatedAt: now,
      version: (targetInv.version || 0) + 1,
    };

    this.cache.invoices = this.cache.invoices.map((inv) =>
      inv.id === invoiceId ? updatedInvoice! : inv
    );

    const invRef: FinancialInvoiceIQD = updatedInvoice;
    const payRef: PaymentTransactionIQD = newPayment;
    void this.trackWrite(
      this.putRecordsEncryptedBatch([
        {
          tableName: 'invoices',
          id: invRef.id,
          parentIds: [],
          payload: invRef,
          extraColumns: {
            patientId: invRef.patientId,
            ...(invRef.episodeId ? { episodeId: invRef.episodeId } : {}),
          },
        },
        {
          tableName: 'payments',
          id: payRef.id,
          parentIds: [invRef.id],
          payload: payRef,
          extraColumns: {
            invoiceId: invRef.id,
            patientId: payRef.patientId,
          },
        },
      ])
    ).catch(() => undefined);

    this.appendAuditLog({
      actionType: 'payment_received',
      entityType: 'payment',
      entityId: invRef.id,
      patientId: invRef.patientId,
      episodeId: invRef.episodeId,
      summaryAr: `استلام دفعة ${payRef.originalAmount} ${payRef.currencyCode} (${method}) على الفاتورة ${invRef.invoiceNumber}`,
      summaryEn: `Collected ${payRef.originalAmount} ${payRef.currencyCode} via ${method} for invoice ${invRef.invoiceNumber}`,
    });

    this.notifyListeners();
    return this.getInvoicesIQD();
  }

  static saveInvoiceInstallmentPlan(
    invoiceId: string,
    installments: InvoiceInstallmentItem[]
  ): FinancialInvoiceIQD[] {
    const targetInv = this.cache.invoices.find((inv) => inv.id === invoiceId);
    if (!targetInv) return this.getInvoicesIQD();
    const today = localDate();
    const now = new Date().toISOString();
    const reconciled =
      installments.length > 0
        ? reconcileInstallmentsWithPaidTotal(installments, targetInv.paidAmountIQD, today)
        : undefined;
    const updatedInvoice: FinancialInvoiceIQD = {
      ...targetInv,
      installmentPlan: reconciled,
      updatedAt: now,
      version: (targetInv.version || 0) + 1,
    };
    this.cache.invoices = this.cache.invoices.map((inv) =>
      inv.id === invoiceId ? updatedInvoice : inv
    );
    void this.trackWrite(
      this.putRecordEncrypted('invoices', updatedInvoice.id, [], updatedInvoice, {
        patientId: updatedInvoice.patientId,
        ...(updatedInvoice.episodeId ? { episodeId: updatedInvoice.episodeId } : {}),
      })
    ).catch(() => undefined);
    this.appendAuditLog({
      actionType: 'invoice_created',
      entityType: 'invoice',
      entityId: updatedInvoice.id,
      patientId: updatedInvoice.patientId,
      episodeId: updatedInvoice.episodeId,
      summaryAr: `تحديث خطة الأقساط للفاتورة ${updatedInvoice.invoiceNumber} (${reconciled?.length || 0} أقساط)`,
      summaryEn: `Updated installment plan on invoice ${updatedInvoice.invoiceNumber} (${reconciled?.length || 0} installments)`,
    });
    this.notifyListeners();
    return this.getInvoicesIQD();
  }

  static incrementPackageSessionUsed(
    invoiceId: string,
    finalizedSessionId?: string
  ): FinancialInvoiceIQD[] {
    let target: FinancialInvoiceIQD | null = null;
    this.cache.invoices = this.cache.invoices.map((inv) => {
      if (inv.id !== invoiceId || !inv.packageTotalSessions) return inv;
      if (finalizedSessionId && inv.processedFinalizedSessionIds?.includes(finalizedSessionId)) {
        return inv;
      }
      const current = inv.packageUsedSessions || 0;
      if (current >= inv.packageTotalSessions) return inv;
      const nextProcessed = finalizedSessionId
        ? [...(inv.processedFinalizedSessionIds || []), finalizedSessionId]
        : inv.processedFinalizedSessionIds;
      target = {
        ...inv,
        packageUsedSessions: current + 1,
        ...(nextProcessed ? { processedFinalizedSessionIds: nextProcessed } : {}),
        updatedAt: new Date().toISOString(),
        version: (inv.version || 0) + 1,
      };
      return target;
    });
    if (target) {
      const invRef: FinancialInvoiceIQD = target;
      void this.trackWrite(
        this.putRecordEncrypted('invoices', invRef.id, [], invRef, {
          patientId: invRef.patientId,
          ...(invRef.episodeId ? { episodeId: invRef.episodeId } : {}),
        })
      ).catch(() => undefined);
    }
    this.notifyListeners();
    return this.getInvoicesIQD();
  }

  /**
   * Admin-only manual adjustment for treatment course package visits (Phase 3.6).
   * Requires active staff role === 'admin' and a non-empty clinical/administrative reason.
   */
  static adjustPackageSessionAdmin(
    invoiceId: string,
    delta: 1 | -1,
    reason: string
  ): FinancialInvoiceIQD[] {
    const staff = this.getActiveStaff();
    if (staff.role !== 'admin') {
      throw new Error(
        'تعديل حصص الكورس يدوياً مسموح لدور مدير النظام (Admin) فقط.'
      );
    }
    const cleanReason = reason.trim();
    if (!cleanReason) {
      throw new Error(
        'يجب إدخال سبب واضح لتعديل عدد الجلسات المستخدمة في الكورس (Reason is required).'
      );
    }

    const now = new Date().toISOString();
    let updatedRef: FinancialInvoiceIQD | null = null;
    let previousUsed = 0;
    let nextUsed = 0;

    this.cache.invoices = this.cache.invoices.map((inv) => {
      if (inv.id !== invoiceId || !inv.packageTotalSessions) return inv;
      previousUsed = inv.packageUsedSessions || 0;
      nextUsed = Math.max(0, Math.min(inv.packageTotalSessions, previousUsed + delta));
      if (nextUsed === previousUsed) return inv;

      updatedRef = {
        ...inv,
        packageUsedSessions: nextUsed,
        packageAdjustments: [
          ...(inv.packageAdjustments || []),
          {
            timestamp: now,
            delta,
            reason: cleanReason,
            actorName: staff.nameAr,
            actorRole: staff.role,
          },
        ],
        updatedAt: now,
        version: (inv.version || 0) + 1,
      };
      return updatedRef;
    });

    if (updatedRef) {
      const invRef: FinancialInvoiceIQD = updatedRef;
      void this.trackWrite(
        this.putRecordEncrypted('invoices', invRef.id, [], invRef, {
          patientId: invRef.patientId,
          ...(invRef.episodeId ? { episodeId: invRef.episodeId } : {}),
        })
      ).catch(() => undefined);

      this.appendAuditLog({
        actionType: 'package_manual_adjustment',
        entityType: 'invoice',
        entityId: invRef.id,
        patientId: invRef.patientId,
        episodeId: invRef.episodeId,
        summaryAr: `تعديل إداري لعدد جلسات الكورس (${invRef.invoiceNumber}): ${previousUsed} ← ${nextUsed} (${delta > 0 ? '+1' : '-1'}) | السبب: ${cleanReason}`,
        summaryEn: `Admin package visit adjustment (${invRef.invoiceNumber}): ${previousUsed} -> ${nextUsed} (${delta > 0 ? '+1' : '-1'}) | Reason: ${cleanReason}`,
      });
    }

    this.notifyListeners();
    return this.getInvoicesIQD();
  }

  /**
   * Idempotent `SessionFinalized` domain event handler (Phase 3.6):
   * Emits once per `sessionId`:
   * 1. Marks matching scheduled/arrived/in_session appointment as completed (or no_show/cancelled)
   * 2. Decrements matching active `rehab_package` visit count at most once per `sessionId`
   * 3. Closes active `waitingList` entry for this patient (`status: 'completed'`)
   * 4. Logs a tamper-evident hash-chained `session_finalized_event` audit entry
   */
  static emitSessionFinalizedEvent(
    event: SessionFinalizedEventPayload & { skipPackageDecrement?: boolean }
  ): {
    alreadyProcessed: boolean;
    appointmentCompletedId?: string;
    packageInvoiceUpdatedId?: string;
    waitingListCompletedIds: string[];
  } {
    const alreadyLogged = this.cache.auditLogs.some(
      (entry) => entry.actionType === 'session_finalized_event' && entry.entityId === event.sessionId
    );
    if (alreadyLogged) {
      return {
        alreadyProcessed: true,
        waitingListCompletedIds: [],
      };
    }

    const now = new Date().toISOString();
    const sessionDay = (event.sessionDate || '').slice(0, 10);
    const targetApptStatus: AppointmentStatus =
      event.attendanceStatus === 'no_show'
        ? 'no_show'
        : event.attendanceStatus === 'cancelled_patient' ||
          event.attendanceStatus === 'cancelled_clinic'
        ? 'cancelled'
        : 'completed';

    // 1. Complete matching active appointment on that day (preferring same episodeId)
    let matchedAppt: ClinicAppointment | undefined = this.cache.appointments.find(
      (a) =>
        a.patientId === event.patientId &&
        a.date.slice(0, 10) === sessionDay &&
        a.episodeId === event.episodeId &&
        (a.status === 'scheduled' || a.status === 'arrived' || a.status === 'in_session')
    );
    if (!matchedAppt) {
      matchedAppt = this.cache.appointments.find(
        (a) =>
          a.patientId === event.patientId &&
          a.date.slice(0, 10) === sessionDay &&
          (a.status === 'scheduled' || a.status === 'arrived' || a.status === 'in_session')
      );
    }

    let appointmentCompletedId: string | undefined;
    if (matchedAppt) {
      const targetId = matchedAppt.id;
      let updatedAppt: ClinicAppointment | null = null;
      this.cache.appointments = this.cache.appointments.map((a) => {
        if (a.id !== targetId) return a;
        updatedAppt = {
          ...a,
          status: targetApptStatus,
          updatedAt: now,
          version: (a.version || 0) + 1,
        };
        return updatedAppt;
      });
      if (updatedAppt) {
        const apptRef: ClinicAppointment = updatedAppt;
        appointmentCompletedId = apptRef.id;
        void this.trackWrite(
          this.putRecordEncrypted('appointments', apptRef.id, [], apptRef, {
            patientId: apptRef.patientId,
            ...(apptRef.episodeId ? { episodeId: apptRef.episodeId } : {}),
          })
        ).catch(() => undefined);
      }
    }

    // 2. Deduct one visit from matching active rehab_package once per sessionId (only if attended)
    let packageInvoiceUpdatedId: string | undefined;
    const isAttended = !event.attendanceStatus || event.attendanceStatus === 'attended';
    if (isAttended && !event.skipPackageDecrement) {
      const candidatePkg =
        this.cache.invoices.find(
          (inv) =>
            inv.patientId === event.patientId &&
            inv.invoiceType === 'rehab_package' &&
            inv.episodeId === event.episodeId &&
            (inv.packageTotalSessions || 0) > (inv.packageUsedSessions || 0)
        ) ||
        this.cache.invoices.find(
          (inv) =>
            inv.patientId === event.patientId &&
            inv.invoiceType === 'rehab_package' &&
            (!inv.episodeId || inv.episodeId === event.episodeId) &&
            (inv.packageTotalSessions || 0) > (inv.packageUsedSessions || 0)
        );

      if (candidatePkg && !candidatePkg.processedFinalizedSessionIds?.includes(event.sessionId)) {
        this.incrementPackageSessionUsed(candidatePkg.id, event.sessionId);
        packageInvoiceUpdatedId = candidatePkg.id;
      }
    }

    // 3. Close any open waiting list entries for this patient
    const waitingListCompletedIds: string[] = [];
    this.cache.waitingList = this.cache.waitingList.map((w) => {
      if (w.patientId !== event.patientId || w.status === 'completed') return w;
      const updatedWait: WaitingListEntry = {
        ...w,
        status: 'completed',
        updatedAt: now,
        version: (w.version || 0) + 1,
      };
      waitingListCompletedIds.push(w.id);
      void this.trackWrite(
        this.putRecordEncrypted('waitingList', updatedWait.id, [], updatedWait, {
          patientId: updatedWait.patientId,
        })
      ).catch(() => undefined);
      return updatedWait;
    });

    // 4. Write hash-chained audit entry recording SessionFinalized event execution
    this.appendAuditLog({
      actionType: 'session_finalized_event',
      entityType: 'session',
      entityId: event.sessionId,
      patientId: event.patientId,
      episodeId: event.episodeId,
      summaryAr: `تنفيذ حدث اعتماد الجلسة (${event.sessionId}): ${appointmentCompletedId ? 'إغلاق الموعد' : 'دون موعد مرتبط'}${packageInvoiceUpdatedId ? ' + خصم جلسة من الكورس' : ''}${waitingListCompletedIds.length > 0 ? ' + إغلاق قائمة الانتظار' : ''}`,
      summaryEn: `SessionFinalized event (${event.sessionId}): ${appointmentCompletedId ? 'appointment completed' : 'no linked appointment'}${packageInvoiceUpdatedId ? ' + package visit deducted' : ''}${waitingListCompletedIds.length > 0 ? ' + waitlist closed' : ''}`,
    });

    this.notifyListeners();
    return {
      alreadyProcessed: false,
      appointmentCompletedId,
      packageInvoiceUpdatedId,
      waitingListCompletedIds,
    };
  }

  /**
   * 8-second Undo helper for Phase 2.4 Finish Sequence:
   * Safely removes follow-up billing & rebooked appointment WITHOUT mutating finalized clinical notes (R1).
   */
  static undoFinishSequenceBillingAndBooking(snapshot: FinishUndoSnapshot): void {
    if (snapshot.createdAppointmentId) {
      this.deleteAppointment(snapshot.createdAppointmentId, { bypassRecycleBin: true });
    }
    if (snapshot.createdInvoiceId) {
      this.rollbackUncommittedFinishInvoice(snapshot.createdInvoiceId);
    }
    if (snapshot.createdPaymentId) {
      void this.deleteRecordEncrypted('payments', snapshot.createdPaymentId).catch(() => undefined);
    }
    if (snapshot.previousInvoiceState) {
      this.restoreInvoiceIQD(snapshot.previousInvoiceState);
    }
    if (snapshot.previousAppointmentId && snapshot.previousAppointmentStatus) {
      this.updateAppointmentStatus(snapshot.previousAppointmentId, snapshot.previousAppointmentStatus);
    }
  }

  static getPatientFinancialSummaryIQD(patientId: string, _patientName?: string) {
    const patientInvoices = this.getInvoicesIQD().filter(
      (inv) => inv.patientId === patientId && inv.status !== 'void'
    );
    const totalBilledIQD = patientInvoices.reduce((acc, inv) => acc + inv.netAmountIQD, 0);
    const totalPaidIQD = patientInvoices.reduce((acc, inv) => acc + inv.paidAmountIQD, 0);
    const totalDebtIQD = patientInvoices.reduce((acc, inv) => acc + inv.balanceDueIQD, 0);
    return {
      invoices: this.getInvoicesIQD().filter((inv) => inv.patientId === patientId),
      totalBilledIQD,
      totalPaidIQD,
      totalDebtIQD,
    };
  }

  // ---------------------------------------------------------------------
  // Bilingual Informed Consents & Encrypted Canvas Signatures (Phase 4.8)
  // ---------------------------------------------------------------------
  static getConsentsForPatient(patientId: string): PatientConsentRecord[] {
    const list = this.cache.consentsByPatientId.get(patientId) || [];
    return [...list].sort((a, b) => b.signedAt.localeCompare(a.signedAt));
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
    if (!input.patientId?.trim()) {
      throw new Error('معرّف المريض مطلوب لحفظ نموذج الموافقة المستنيرة.');
    }
    if (!input.signerName?.trim()) {
      throw new Error('اسم الموقّع مطلوب لحفظ نموذج الموافقة.');
    }
    if (!input.signatureDataUrl || !input.signatureDataUrl.startsWith('data:image/')) {
      throw new Error('التوقيع الرقمي على اللوحة مطلوب قبل الاعتماد.');
    }

    const staff = this.getActiveStaff();
    const now = new Date().toISOString();
    const record: PatientConsentRecord = {
      id: `cons_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      patientId: input.patientId.trim(),
      ...(input.episodeId ? { episodeId: input.episodeId } : {}),
      templateId: input.templateId,
      templateVersion: input.templateVersion,
      titleAr: input.titleAr,
      titleEn: input.titleEn,
      bodySnapshotAr: input.bodySnapshotAr,
      bodySnapshotEn: input.bodySnapshotEn,
      signerName: input.signerName.trim(),
      signerRelation: input.signerRelation,
      therapistWitnessName: staff.nameAr || staff.nameEn,
      signatureDataUrl: input.signatureDataUrl,
      consentGranted: input.consentGranted,
      signedAt: now,
      updatedAt: now,
      version: 1,
    };

    const existing = this.cache.consentsByPatientId.get(record.patientId) || [];
    this.cache.consentsByPatientId.set(record.patientId, [record, ...existing]);

    if (!this.activeDb.verno || this.activeDb.verno >= 8) {
      await this.trackWrite(
        this.putRecordEncrypted('consents', record.id, [record.patientId], record, {
          patientId: record.patientId,
          ...(record.episodeId ? { episodeId: record.episodeId } : {}),
        })
      );
    }

    await this.appendAuditLogAsync({
      actionType: 'consent_signed',
      entityType: 'consent',
      entityId: record.id,
      patientId: record.patientId,
      episodeId: record.episodeId,
      summaryAr: `توقيع نموذج موافقة (${record.titleAr}) باسم ${record.signerName}`,
      summaryEn: `Signed consent (${record.titleEn}) by ${record.signerName}`,
    });

    this.notifyListeners();
    return record;
  }

  static async revokePatientConsentAsync(
    patientId: string,
    consentId: string,
    reason: string
  ): Promise<PatientConsentRecord[]> {
    const cleanReason = reason.trim();
    if (!cleanReason) {
      throw new Error('يرجى كتابة سبب سحب أو إلغاء الموافقة.');
    }
    const existingList = this.cache.consentsByPatientId.get(patientId) || [];
    let updatedRef: PatientConsentRecord | null = null;
    const now = new Date().toISOString();

    const nextList = existingList.map((c) => {
      if (c.id !== consentId) return c;
      updatedRef = {
        ...c,
        revokedAt: now,
        revokeReason: cleanReason,
        updatedAt: now,
        version: (c.version || 1) + 1,
      };
      return updatedRef;
    });

    if (!updatedRef) {
      throw new Error('لم يتم العثور على سجل الموافقة المطلوب.');
    }

    this.cache.consentsByPatientId.set(patientId, nextList);
    if (!this.activeDb.verno || this.activeDb.verno >= 8) {
      const ref: PatientConsentRecord = updatedRef;
      await this.trackWrite(
        this.putRecordEncrypted('consents', ref.id, [ref.patientId], ref, {
          patientId: ref.patientId,
          ...(ref.episodeId ? { episodeId: ref.episodeId } : {}),
        }, { skipConcurrencyCheck: true })
      );
    }

    await this.appendAuditLogAsync({
      actionType: 'consent_revoked',
      entityType: 'consent',
      entityId: consentId,
      patientId,
      summaryAr: `سحب الموافقة (${(updatedRef as PatientConsentRecord).titleAr}): ${cleanReason}`,
      summaryEn: `Revoked consent (${(updatedRef as PatientConsentRecord).titleEn}): ${cleanReason}`,
    });

    this.notifyListeners();
    return this.getConsentsForPatient(patientId);
  }

  // ---------------------------------------------------------------------
  // Clinic Expenses
  // ---------------------------------------------------------------------
  static getExpensesIQD(): ClinicExpenseIQD[] {
    return [...this.cache.expenses];
  }

  static addExpenseIQD(expense: Omit<ClinicExpenseIQD, 'id'>): ClinicExpenseIQD[] {
    const record: ClinicExpenseIQD = {
      ...expense,
      id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      updatedAt: new Date().toISOString(),
      version: 1,
    };
    this.cache.expenses = [record, ...this.cache.expenses];
    void this.trackWrite(
      this.putRecordEncrypted('expenses', record.id, [], record)
    ).catch(() => undefined);

    this.appendAuditLog({
      actionType: 'expense_logged',
      entityType: 'expense',
      entityId: record.id,
      patientId: record.patientId,
      summaryAr: `تسجيل مصروف عيادة (${record.titleAr}): ${formatIQD(record.amountIQD)}`,
      summaryEn: `Logged clinic expense (${record.titleEn}): ${formatIQD(record.amountIQD, false)}`,
    });
    this.notifyListeners();
    return this.getExpensesIQD();
  }

  static logRecurringExpenseForMonth(params: {
    templateId: string;
    amountIQD: number;
    date: string;
    customCategoryLabel?: string;
    paidBy?: string;
    notes?: string;
  }): ClinicExpenseIQD[] {
    const templates = this.getRecurringExpenseTemplates();
    const tpl = templates.find((t) => t.id === params.templateId);
    if (!tpl) {
      return this.getExpensesIQD();
    }
    const staff = this.getActiveStaff();
    this.addExpenseIQD({
      date: params.date,
      category: tpl.category,
      customCategoryLabel: params.customCategoryLabel || tpl.customCategoryLabel,
      recurringTemplateId: tpl.id,
      titleAr: tpl.titleAr,
      titleEn: tpl.titleEn,
      amountIQD: params.amountIQD,
      paidBy: params.paidBy || tpl.paidBy || staff.nameAr,
      notes: params.notes,
    });
    const monthKey = params.date.slice(0, 7);
    const updatedTemplates = templates.map((item) =>
      item.id === tpl.id
        ? {
            ...item,
            lastLoggedMonthKey: monthKey,
          }
        : item
    );
    this.saveRecurringExpenseTemplates(updatedTemplates);
    return this.getExpensesIQD();
  }

  static deleteExpenseIQD(
    id: string,
    options?: { bypassRecycleBin?: boolean; deletedAtIso?: string }
  ): ClinicExpenseIQD[] {
    const target = this.cache.expenses.find((e) => e.id === id);
    if (target && !target.isDemo && !options?.bypassRecycleBin && this.isTrashRecycleBinEnabled()) {
      this.moveRecordToRecycleBin({
        itemType: 'expense',
        originalId: target.id,
        titleAr: `${target.titleAr || target.titleEn} (${target.date})`,
        titleEn: `${target.titleEn || target.titleAr} (${target.date})`,
        subtitleAr: `${target.amountIQD} IQD — ${target.category}`,
        subtitleEn: `${target.amountIQD} IQD — ${target.category}`,
        payload: { ...target },
        nowIso: options?.deletedAtIso,
      });
    }
    this.cache.expenses = this.cache.expenses.filter((e) => e.id !== id);
    void this.deleteRecordEncrypted('expenses', id).catch(() => undefined);
    this.notifyListeners();
    return this.getExpensesIQD();
  }

  static restoreExpenseIQD(expense: ClinicExpenseIQD): ClinicExpenseIQD[] {
    const rest = this.cache.expenses.filter((e) => e.id !== expense.id);
    this.cache.expenses = [expense, ...rest];
    void this.trackWrite(
      this.putRecordEncrypted('expenses', expense.id, [], expense, {}, { skipConcurrencyCheck: true })
    ).catch(() => undefined);
    this.notifyListeners();
    return this.getExpensesIQD();
  }

  // ---------------------------------------------------------------------
  // Explicit Synthetic Demo Operations Seeding & Cleanup
  // ---------------------------------------------------------------------
  static seedDemoOperationsData(): void {
    const bundle = buildDemoOperationsSeed(this.getStaffRoster());

    const existingAppts = this.cache.appointments.filter((a) => !a.isDemo);
    const existingWaitlist = this.cache.waitingList.filter((w) => !w.isDemo);
    const existingInvoices = this.cache.invoices.filter((i) => !i.isDemo);
    const existingExpenses = this.cache.expenses.filter((e) => !e.isDemo);

    this.cache.appointments = [...bundle.appointments, ...existingAppts];
    this.cache.waitingList = [...bundle.waitlist, ...existingWaitlist];
    this.cache.invoices = [...bundle.invoices, ...existingInvoices];
    this.cache.expenses = [...bundle.expenses, ...existingExpenses];

    for (const a of bundle.appointments) {
      void this.trackWrite(
        this.putRecordEncrypted('appointments', a.id, [], a, { patientId: a.patientId }, { skipConcurrencyCheck: true })
      ).catch(() => undefined);
    }
    for (const w of bundle.waitlist) {
      void this.trackWrite(
        this.putRecordEncrypted('waitingList', w.id, [], w, { patientId: w.patientId }, { skipConcurrencyCheck: true })
      ).catch(() => undefined);
    }
    for (const i of bundle.invoices) {
      void this.trackWrite(
        this.putRecordEncrypted(
          'invoices',
          i.id,
          [],
          i,
          { patientId: i.patientId, ...(i.episodeId ? { episodeId: i.episodeId } : {}) },
          { skipConcurrencyCheck: true }
        )
      ).catch(() => undefined);
      for (const p of i.payments || []) {
        void this.trackWrite(
          this.putRecordEncrypted(
            'payments',
            p.id,
            [i.id],
            p,
            { invoiceId: i.id, patientId: p.patientId },
            { skipConcurrencyCheck: true }
          )
        ).catch(() => undefined);
      }
    }
    for (const e of bundle.expenses) {
      void this.trackWrite(
        this.putRecordEncrypted('expenses', e.id, [], e, {}, { skipConcurrencyCheck: true })
      ).catch(() => undefined);
    }
    this.notifyListeners();
  }

  static deleteAllDemoOperationsData(): void {
    const isDemoId = (id: string) => id.startsWith('demo_') || id.startsWith('syn-');
    const removedAppts = this.cache.appointments.filter((a) => a.isDemo || isDemoId(a.id) || isDemoId(a.patientId));
    const removedWait = this.cache.waitingList.filter((w) => w.isDemo || isDemoId(w.id) || isDemoId(w.patientId));
    const removedInvs = this.cache.invoices.filter((i) => i.isDemo || isDemoId(i.id) || isDemoId(i.patientId));
    const removedExps = this.cache.expenses.filter((e) => e.isDemo || isDemoId(e.id));
    const removedRecs = this.cache.recurringSchedules.filter((r) => r.isDemo || isDemoId(r.id) || isDemoId(r.patientId));

    this.cache.appointments = this.cache.appointments.filter((a) => !removedAppts.includes(a));
    this.cache.waitingList = this.cache.waitingList.filter((w) => !removedWait.includes(w));
    this.cache.invoices = this.cache.invoices.filter((i) => !removedInvs.includes(i));
    this.cache.expenses = this.cache.expenses.filter((e) => !removedExps.includes(e));
    this.cache.recurringSchedules = this.cache.recurringSchedules.filter((r) => !removedRecs.includes(r));

    for (const a of removedAppts) void this.deleteRecordEncrypted('appointments', a.id).catch(() => undefined);
    for (const w of removedWait) void this.deleteRecordEncrypted('waitingList', w.id).catch(() => undefined);
    for (const i of removedInvs) {
      void this.deleteRecordEncrypted('invoices', i.id).catch(() => undefined);
      for (const p of i.payments || []) {
        void this.deleteRecordEncrypted('payments', p.id).catch(() => undefined);
      }
    }
    for (const e of removedExps) void this.deleteRecordEncrypted('expenses', e.id).catch(() => undefined);
    for (const r of removedRecs) void this.deleteRecordEncrypted('recurringSchedules', r.id).catch(() => undefined);

    const cleanedRecent = this.cache.smartMemory.recentPatientIds.filter((id) => !isDemoId(id));
    const cleanedPinned = this.cache.smartMemory.pinnedPatientIds.filter((id) => !isDemoId(id));
    if (
      cleanedRecent.length !== this.cache.smartMemory.recentPatientIds.length ||
      cleanedPinned.length !== this.cache.smartMemory.pinnedPatientIds.length
    ) {
      void this.updateSmartMemoryAsync({
        recentPatientIds: cleanedRecent,
        pinnedPatientIds: cleanedPinned,
      }).catch(() => undefined);
    }

    this.notifyListeners();
  }

  static hasDemoOperationsData(): boolean {
    const isDemoId = (id: string) => id.startsWith('demo_') || id.startsWith('syn-');
    return (
      this.cache.appointments.some((a) => Boolean(a.isDemo) || isDemoId(a.id) || isDemoId(a.patientId)) ||
      this.cache.waitingList.some((w) => Boolean(w.isDemo) || isDemoId(w.id) || isDemoId(w.patientId)) ||
      this.cache.invoices.some((i) => Boolean(i.isDemo) || isDemoId(i.id) || isDemoId(i.patientId)) ||
      this.cache.expenses.some((e) => Boolean(e.isDemo) || isDemoId(e.id)) ||
      this.cache.recurringSchedules.some((r) => Boolean(r.isDemo) || isDemoId(r.id) || isDemoId(r.patientId))
    );
  }
}

registerSessionFinalizedListener((event) => {
  ClinicOperationsService.emitSessionFinalizedEvent(event);
});
