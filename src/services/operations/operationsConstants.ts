// =======================================================================
// PhysioRecord — Clinic Operations Constants, Catalogs & Pure Helpers
// =======================================================================

import type {
  ClinicStaffMember,
  ClinicRoleId,
  ExerciseLibraryItem,
  InvoiceInstallmentItem,
  PracticeLocationItem,
  QuickSoapChip,
  RecurringExpenseTemplate,
  VitalsAlertThresholds,
  WeeklyBreakWindow,
} from '../../types/clinicManagement';

export type ColdStoreName =
  | 'auditLogs'
  | 'customWidgets'
  | 'noteTemplates'
  | 'attachments'
  | 'consents'
  | 'episodeClinical'
  | 'patientMedications';

export const ALL_COLD_STORES: readonly ColdStoreName[] = [
  'auditLogs',
  'customWidgets',
  'noteTemplates',
  'attachments',
  'consents',
  'episodeClinical',
  'patientMedications',
];

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

export function cloneDefaultLocations(): PracticeLocationItem[] {
  return DEFAULT_PRACTICE_LOCATIONS.map((loc) => ({ ...loc }));
}

export function cloneDefaultBreaks(): WeeklyBreakWindow[] {
  return DEFAULT_WEEKLY_BREAKS.map((brk) => ({ ...brk, weekdays: [...brk.weekdays] }));
}

export function cloneDefaultRecurringExpenseTemplates(): RecurringExpenseTemplate[] {
  return DEFAULT_RECURRING_EXPENSE_TEMPLATES.map((tpl) => ({ ...tpl }));
}

export function parseHhMmToMinutes(hhmm: string): number {
  const [hStr, mStr] = (hhmm || '00:00').split(':');
  const h = Math.max(0, Math.min(23, parseInt(hStr || '0', 10) || 0));
  const m = Math.max(0, Math.min(59, parseInt(mStr || '0', 10) || 0));
  return h * 60 + m;
}

export function reconcileInstallmentsWithPaidTotal(
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

export function areUint8ArraysEqual(a: Uint8Array, b: Uint8Array): boolean {
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

export function getEpisodeClinicalMutationTestHook():
  | ((context: { episodeId: string }) => Promise<void> | void)
  | null {
  return episodeClinicalMutationTestHook;
}

// -----------------------------------------------------------------------
// 1. Clinic Staff & Attribution Roles (Note: Attribution Only, Not Auth)
// -----------------------------------------------------------------------
const LEGACY_DIRECTOR_NAMES_AR = new Set([
  'د. حسين الرمضاني (مدير العيادة / أخصائي أقدم)',
  'د. حسين الرمضاني',
]);
const LEGACY_DIRECTOR_NAMES_EN = new Set([
  'Dr. Hussein Al-Ramdani (Clinic Director / Senior PT)',
  'Dr. Hussein Al-Ramadhani (Clinic Director / Senior PT)',
  'Dr. Hussein Al-Ramdani',
  'Dr. Hussein Al-Ramadhani',
]);
const DEFAULT_DIRECTOR_NAME_AR = 'د. زيد العاني (مدير العيادة / أخصائي أقدم)';
const DEFAULT_DIRECTOR_NAME_EN = 'Dr. Zaid Al-Ani (Clinic Director / Senior PT)';

export function replaceLegacyDirectorNameAr(name?: string | null): string {
  if (!name) return '';
  const trimmed = name.trim();
  return LEGACY_DIRECTOR_NAMES_AR.has(trimmed) ? DEFAULT_DIRECTOR_NAME_AR : name;
}

export function replaceLegacyDirectorNameEn(name?: string | null): string {
  if (!name) return '';
  const trimmed = name.trim();
  return LEGACY_DIRECTOR_NAMES_EN.has(trimmed) ? DEFAULT_DIRECTOR_NAME_EN : name;
}

const LEGACY_DEMO_PHONES_MAP: Readonly<Record<string, string>> = {
  '+964 770 123 4567': '+964 700 000 0147',
  '0770 123 4567': '+964 700 000 0147',
  '+964 780 987 6543': '+964 700 000 0283',
  '0780 987 6543': '+964 700 000 0283',
  '+964 790 321 0987': '+964 700 000 0391',
  '0790 321 0987': '+964 700 000 0391',
  '+964 771 789 1234': '+964 700 000 0465',
  '0771 789 1234': '+964 700 000 0465',
  '+964 750 216 5498': '+964 700 000 0528',
  '0750 216 5498': '+964 700 000 0528',
};

export function sanitizeDemoPhoneIfNeeded(phone?: string, isDemo?: boolean): string | undefined {
  if (!phone) return phone;
  const trimmed = phone.trim();
  if (isDemo && LEGACY_DEMO_PHONES_MAP[trimmed]) {
    return LEGACY_DEMO_PHONES_MAP[trimmed];
  }
  return phone;
}

export const CLINIC_STAFF_ROSTER: ClinicStaffMember[] = [
  {
    id: 'staff_admin_pt',
    nameAr: DEFAULT_DIRECTOR_NAME_AR,
    nameEn: DEFAULT_DIRECTOR_NAME_EN,
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

export function formatIQD(amount: number, isAr = true): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  const formattedAbs = new Intl.NumberFormat('en-US').format(Math.abs(safe));
  const signed = safe < 0 ? `\u2212${formattedAbs}` : formattedAbs;
  return isAr ? `${signed} د.ع` : `${signed} IQD`;
}
