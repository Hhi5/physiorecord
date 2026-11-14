// =======================================================================
// PhysioRecord — Clinical Terminology Registry & Bilingual Glossary (v2.1)
// License: CC0-1.0 (Original bilingual PT glossary authored for PhysioRecord)
// Standard International English reference paired with Iraqi/Arabic clarity
// =======================================================================

import type { ClinicalSpecialty, EpisodeStatus, OnsetMechanism } from '../types/clinical';
import { normalizeArabicSearchText } from '../utils/arabicSearch';

export interface TerminologyItem<T extends string = string> {
  code: T;
  en: string; // Standard International English
  ar: string; // Approved Arabic Explanatory Clarification
  descriptionAr?: string;
  badgeClass?: string;
}

export const CLINICAL_SPECIALTIES: Record<ClinicalSpecialty, TerminologyItem<ClinicalSpecialty>> = {
  musculoskeletal: {
    code: 'musculoskeletal',
    en: 'Musculoskeletal / Orthopedic',
    ar: 'العضلي الهيكلي وجراحة العظام',
    descriptionAr: 'إصابات المفاصل والعظام والأوتار والأربطة والعمود الفقري والتأهيل بعد الكسور والجراحات.',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  neurological: {
    code: 'neurological',
    en: 'Neurological Rehabilitation',
    ar: 'التأهيل العصبي والسكتة الدماغية',
    descriptionAr: 'السكتات الدماغية، إصابات النخاع الشوكي، التصلب اللويحي، الشلل الرعاش، واعتلال الأعصاب.',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
  },
  cardiopulmonary: {
    code: 'cardiopulmonary',
    en: 'Cardiopulmonary Rehabilitation',
    ar: 'إعادة تأهيل القلب والجهاز التنفسي',
    descriptionAr: 'أمراض الشرايين التاجية، جراحات القلب المفتوح، مرض الانسداد الرئوي المزمن، وتأهيل ما بعد العناية المركزة.',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  pediatric: {
    code: 'pediatric',
    en: 'Pediatric Physical Therapy',
    ar: 'العلاج الطبيعي للأطفال والنمو',
    descriptionAr: 'الشلل الدماغي، تأخر النمو الحركي، التشوهات القوامية الخلقية، وأمراض العضلات لدى الأطفال.',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  sports: {
    code: 'sports',
    en: 'Sports Physical Therapy',
    ar: 'إصابات الملاعب والتأهيل الرياضي',
    descriptionAr: 'إصابات الرياضيين التنافسية، إعادة التأهيل المتقدم، واختبارات العودة الآمنة للملاعب (Return-to-Play).',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  general: {
    code: 'general',
    en: 'General Physical Therapy',
    ar: 'العلاج الطبيعي العام',
    descriptionAr: 'الحالات العامة غير التخصصية، التقييم الأولي الشامل، وتأهيل متلازمات الألم والجهد العضلي العام.',
    badgeClass: 'bg-teal-50 text-teal-700 border-teal-200',
  },
  geriatric: {
    code: 'geriatric',
    en: 'Geriatric Physical Therapy',
    ar: 'العلاج الطبيعي لكبار السن (مجال سكاني)',
    descriptionAr: 'تأهيل الشيخوخة، هشاشة العظام، برامج التوازن والوقاية من السقوط، وتحسين الاستقلالية الحركية لكبار السن.',
    badgeClass: 'bg-orange-50 text-orange-700 border-orange-200',
  },
};

export const EPISODE_STATUSES: Record<EpisodeStatus, TerminologyItem<EpisodeStatus>> = {
  active: {
    code: 'active',
    en: 'Active Care',
    ar: 'خطة علاجية نشطة',
    descriptionAr: 'حلقة الرعاية جارية وتتلقى جلسات علاجية دورية.',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  on_hold: {
    code: 'on_hold',
    en: 'On Hold / Paused',
    ar: 'معلقة مؤقتاً',
    descriptionAr: 'تم تعليق العلاج مؤقتاً لسفر أو عارض صحي أو انتظار مراجعة طبية.',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  completed: {
    code: 'completed',
    en: 'Completed / Discharged',
    ar: 'مكتملة / تم التخريج',
    descriptionAr: 'تم إنهاء الخطة العلاجية وتحقيق الأهداف أو الوصول لأقصى تحسن سريري.',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  archived: {
    code: 'archived',
    en: 'Archived',
    ar: 'مؤرشفة',
    descriptionAr: 'حلقة رعاية سابقة مؤرشفة ومحفوظة ضمن السجل التاريخي للمريض.',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
  },
};

export const ONSET_MECHANISMS: Record<OnsetMechanism, TerminologyItem<OnsetMechanism>> = {
  traumatic: {
    code: 'traumatic',
    en: 'Traumatic / Acute Injury',
    ar: 'حادثة / إصابة رضية حادة',
    descriptionAr: 'سقوط، حادث مروري، أو إصابة مباشرة أثناء الرياضة.',
  },
  insidious: {
    code: 'insidious',
    en: 'Insidious Onset',
    ar: 'بداية تدريجية غير ملحوظة (غير واضحة)',
    descriptionAr: 'تطور تدريجي بطيء للأعراض دون حادثة واضحة أو رض صريح.',
  },
  post_surgical: {
    code: 'post_surgical',
    en: 'Post-Surgical',
    ar: 'بعد تدخل جراحي',
    descriptionAr: 'إحالة تأهيلية تالية لعملية جراحية كزراعة المفاصل أو تثبيت الكسور.',
  },
  congenital: {
    code: 'congenital',
    en: 'Congenital / Developmental',
    ar: 'خلقي / نمائي',
    descriptionAr: 'حالة موجودة منذ الولادة أو مرتبطة بمراحل النمو.',
  },
};

export const COMMON_BODY_REGIONS = [
  { en: 'Cervical Spine', ar: 'الفقرات العنقية' },
  { en: 'Thoracic Spine', ar: 'الفقرات الصدرية' },
  { en: 'Lumbar Spine & Sacroiliac', ar: 'الفقرات القطنية والعجزية' },
  { en: 'Shoulder Complex', ar: 'مجمع الكتف ولوح الكتف' },
  { en: 'Elbow & Forearm', ar: 'المرفق والساعد' },
  { en: 'Wrist & Hand', ar: 'الرسغ واليد' },
  { en: 'Pelvis & Hip Joint', ar: 'الحوض ومفصل الورك' },
  { en: 'Knee Complex', ar: 'مفصل الركبة والأربطة المحيطة' },
  { en: 'Ankle & Foot Complex', ar: 'الكاحل والقدم' },
  { en: 'Neurological / Cranial & Facial', ar: 'الأعصاب القحفية والوجه' },
  { en: 'Cardiopulmonary / Thorax', ar: 'القفص الصدري والجهاز التنفسي' },
  { en: 'Full Body / General Axial', ar: 'محوري / كامل الجسم' },
];

// -----------------------------------------------------------------------
// Phase D5: CC0 Bilingual Clinical Glossary & Print Document Labels
// -----------------------------------------------------------------------
export type GlossaryCategory =
  | 'region'
  | 'diagnosis'
  | 'modality'
  | 'intervention'
  | 'assessment'
  | 'print_heading'
  | 'plan_of_care';

export interface BilingualGlossaryEntry {
  id: string;
  category: GlossaryCategory;
  ar: string;
  en: string;
  aliasesAr?: string[];
  aliasesEn?: string[];
}

export const BILINGUAL_CLINICAL_GLOSSARY: BilingualGlossaryEntry[] = [
  // Regions
  {
    id: 'reg_cervical',
    category: 'region',
    ar: 'العمود الفقري العنقي (الرقبة)',
    en: 'Cervical Spine',
    aliasesAr: ['العنقية', 'الرقبة', 'فقرات الرقبة'],
    aliasesEn: ['neck', 'c-spine'],
  },
  {
    id: 'reg_lumbar',
    category: 'region',
    ar: 'العمود الفقري القطني (أسفل الظهر)',
    en: 'Lumbar Spine',
    aliasesAr: ['القطنية', 'أسفل الظهر', 'اسفل الظهر', 'الفقرات القطنية'],
    aliasesEn: ['low back', 'l-spine', 'lbp'],
  },
  {
    id: 'reg_shoulder',
    category: 'region',
    ar: 'مفصل الكتف',
    en: 'Shoulder Complex',
    aliasesAr: ['الكتف'],
    aliasesEn: ['shoulder', 'glenohumeral'],
  },
  {
    id: 'reg_knee',
    category: 'region',
    ar: 'مفصل الركبة',
    en: 'Knee Complex',
    aliasesAr: ['الركبة', 'مفصل الركبه'],
    aliasesEn: ['knee', 'patellofemoral'],
  },
  {
    id: 'reg_ankle',
    category: 'region',
    ar: 'مفصل الكاحل والقدم',
    en: 'Ankle & Foot Complex',
    aliasesAr: ['الكاحل', 'القدم'],
    aliasesEn: ['ankle', 'foot'],
  },
  {
    id: 'reg_hip',
    category: 'region',
    ar: 'مفصل الورك والحوض',
    en: 'Hip & Pelvis',
    aliasesAr: ['الورك', 'الحوض'],
    aliasesEn: ['hip', 'pelvis'],
  },
  {
    id: 'reg_elbow_wrist',
    category: 'region',
    ar: 'المرفق والرسغ واليد',
    en: 'Elbow, Wrist & Hand',
    aliasesAr: ['المرفق', 'الرسغ', 'اليد'],
    aliasesEn: ['elbow', 'wrist', 'hand'],
  },

  // Diagnoses
  {
    id: 'diag_lumbar_radiculopathy',
    category: 'diagnosis',
    ar: 'انزلاق غضروفي قطني مع ألم جذري (عرق النسا)',
    en: 'Lumbar Disc Herniation with Radiculopathy',
    aliasesAr: ['انزلاق غضروفي قطني', 'عرق النسا', 'انزلاق الفقرات'],
    aliasesEn: ['sciatica', 'lumbar disc', 'herniated disc'],
  },
  {
    id: 'diag_mechanical_lbp',
    category: 'diagnosis',
    ar: 'ألم أسفل الظهر الميكانيكي غير النوعي',
    en: 'Non-Specific Mechanical Low Back Pain',
    aliasesAr: ['ألم أسفل الظهر', 'تشنج أسفل الظهر'],
    aliasesEn: ['mechanical lbp', 'low back pain'],
  },
  {
    id: 'diag_cervical_radiculopathy',
    category: 'diagnosis',
    ar: 'اعتلال جذور الأعصاب العنقية',
    en: 'Cervical Radiculopathy',
    aliasesAr: ['انزلاق عنقي', 'ألم الرقبة والذراع'],
    aliasesEn: ['cervical disc', 'neck pain'],
  },
  {
    id: 'diag_rotator_cuff',
    category: 'diagnosis',
    ar: 'اعتلال أوتار الكفة المدورة للكتف',
    en: 'Rotator Cuff Tendinopathy / Impingement',
    aliasesAr: ['الكفة المدورة', 'ألم الكتف'],
    aliasesEn: ['rotator cuff', 'shoulder impingement'],
  },
  {
    id: 'diag_frozen_shoulder',
    category: 'diagnosis',
    ar: 'التهاب المحفظة اللاصق (تيبّس الكتف المتجمد)',
    en: 'Adhesive Capsulitis (Frozen Shoulder)',
    aliasesAr: ['الكتف المتجمد', 'تيبس الكتف'],
    aliasesEn: ['frozen shoulder', 'adhesive capsulitis'],
  },
  {
    id: 'diag_knee_oa',
    category: 'diagnosis',
    ar: 'خشونة وتآكل مفصل الركبة',
    en: 'Knee Osteoarthritis',
    aliasesAr: ['سوفان الركبة', 'خشونة الركبة'],
    aliasesEn: ['knee oa', 'osteoarthritis'],
  },
  {
    id: 'diag_acl_post_op',
    category: 'diagnosis',
    ar: 'إعادة تأهيل ما بعد ترميم الرباط الصليبي الأمامي',
    en: 'Post-Operative ACL Reconstruction Rehabilitation',
    aliasesAr: ['الرباط الصليبي', 'بعد عملية الصليبي'],
    aliasesEn: ['acl rehab', 'acl post op'],
  },
  {
    id: 'diag_stroke_hemiparesis',
    category: 'diagnosis',
    ar: 'إعادة تأهيل الشلل النصفي ما بعد السكتة الدماغية',
    en: 'Post-Stroke Hemiparesis Rehabilitation',
    aliasesAr: ['جلطة دماغية', 'شلل نصفي'],
    aliasesEn: ['stroke', 'cva', 'hemiparesis'],
  },
  {
    id: 'diag_bells_palsy',
    category: 'diagnosis',
    ar: 'شلل العصب الوجهي المحيطي (شلل بيل)',
    en: 'Peripheral Facial Nerve Palsy (Bell Palsy)',
    aliasesAr: ['العصب السابع', 'شلل الوجه'],
    aliasesEn: ['bells palsy', 'facial palsy'],
  },
  {
    id: 'diag_ankle_sprain',
    category: 'diagnosis',
    ar: 'التواء الأربطة الوحشية لمفصل الكاحل',
    en: 'Lateral Ankle Ligament Sprain',
    aliasesAr: ['التواء الكاحل'],
    aliasesEn: ['ankle sprain'],
  },

  // Modalities
  {
    id: 'mod_tens',
    category: 'modality',
    ar: 'تحفيز الأعصاب الكهربائي عبر الجلد (TENS)',
    en: 'Transcutaneous Electrical Nerve Stimulation (TENS)',
    aliasesAr: ['تيارات', 'تحفيز كهربائي'],
    aliasesEn: ['tens'],
  },
  {
    id: 'mod_ultrasound',
    category: 'modality',
    ar: 'الموجات فوق الصوتية العلاجية',
    en: 'Therapeutic Ultrasound',
    aliasesAr: ['التراساوند', 'امواج فوق صوتية'],
    aliasesEn: ['ultrasound', 'us'],
  },
  {
    id: 'mod_moist_heat',
    category: 'modality',
    ar: 'كمادات حرارية رطبة',
    en: 'Superficial Moist Heat Pack',
    aliasesAr: ['كمادة ساخنة', 'حرارة سطحية'],
    aliasesEn: ['hot pack', 'heat'],
  },
  {
    id: 'mod_cryotherapy',
    category: 'modality',
    ar: 'العلاج بالتبريد الموضعي',
    en: 'Localized Cryotherapy / Ice Pack',
    aliasesAr: ['تبريد', 'ثلج'],
    aliasesEn: ['ice', 'cryotherapy'],
  },
  {
    id: 'mod_dry_needling',
    category: 'modality',
    ar: 'الوخز بالإبر الجافة لنقاط الزناد العضلية',
    en: 'Trigger Point Dry Needling',
    aliasesAr: ['ابر جافة', 'نقاط زناد'],
    aliasesEn: ['dry needling', 'trp'],
  },

  // Interventions
  {
    id: 'int_manual_mob',
    category: 'intervention',
    ar: 'تحريك يدوي للمفاصل وتحرير الأنسجة الرخوة',
    en: 'Joint Mobilization & Soft Tissue Release',
    aliasesAr: ['علاج يدوي', 'تحريك مفصل'],
    aliasesEn: ['manual therapy', 'mobilization'],
  },
  {
    id: 'int_therex',
    category: 'intervention',
    ar: 'تمارين علاجية لتقوية العضلات واستعادة المدى الحركي',
    en: 'Therapeutic Strengthening & ROM Exercises',
    aliasesAr: ['تمارين علاجية', 'تقوية عضلات'],
    aliasesEn: ['therapeutic exercise', 'strengthening'],
  },
  {
    id: 'int_gait_balance',
    category: 'intervention',
    ar: 'تدريب المشي والتوازن والتناسق الحركي',
    en: 'Gait, Balance & Neuromuscular Training',
    aliasesAr: ['تدريب المشي', 'توازن'],
    aliasesEn: ['gait training', 'balance'],
  },
  {
    id: 'int_mckenzie',
    category: 'intervention',
    ar: 'تمارين التمركز الحركي المتكرر للعمود الفقري',
    en: 'Repeated Directional Preference Exercises',
    aliasesAr: ['تمارين التمدد المتكرر'],
    aliasesEn: ['directional preference', 'extension bias'],
  },

  // Assessments
  {
    id: 'assm_arom_prom',
    category: 'assessment',
    ar: 'قياس المدى الحركي النشط والسلبي (AROM / PROM)',
    en: 'Active & Passive Range of Motion (AROM / PROM)',
    aliasesAr: ['مدى حركي', 'زوايا المفصل'],
    aliasesEn: ['rom', 'goniometry'],
  },
  {
    id: 'assm_mmt',
    category: 'assessment',
    ar: 'اختبار قوة العضلات اليدوي (MMT 0–5)',
    en: 'Manual Muscle Testing (MMT 0–5)',
    aliasesAr: ['قوة العضلات', 'فحص العضلات'],
    aliasesEn: ['mmt', 'muscle strength'],
  },
  {
    id: 'assm_neuro_screen',
    category: 'assessment',
    ar: 'الفحص العصبي (القطاعات الجلدية، القوة العضلية، المنعكسات)',
    en: 'Neurological Screening (Dermatomes, Myotomes, DTR)',
    aliasesAr: ['فحص عصبي', 'منعكسات'],
    aliasesEn: ['neuro', 'dermatomes'],
  },
  {
    id: 'assm_outcome_mcid',
    category: 'assessment',
    ar: 'تقييم المقاييس الوظيفية والفرق السريري المهم (MCID)',
    en: 'Functional Outcome Measures & MCID Change',
    aliasesAr: ['مقياس وظيفي', 'تحسن سريري'],
    aliasesEn: ['outcome', 'mcid'],
  },

  // Print Headings
  {
    id: 'prt_progress_report',
    category: 'print_heading',
    ar: 'تقرير متابعة التقدم العلاجي',
    en: 'Clinical Progress Report',
  },
  {
    id: 'prt_discharge_summary',
    category: 'print_heading',
    ar: 'ملخص التخريج وإنهاء الخطة العلاجية',
    en: 'Discharge Summary',
  },
  {
    id: 'prt_referral_back',
    category: 'print_heading',
    ar: 'كتاب متابعة للطبيب المحيل',
    en: 'Referring Physician Progress Letter',
  },
  {
    id: 'prt_hep_sheet',
    category: 'print_heading',
    ar: 'برنامج التمارين العلاجية المنزلية (HEP)',
    en: 'Home Exercise Program (HEP)',
  },
  {
    id: 'prt_medical_report',
    category: 'print_heading',
    ar: 'تقرير علاج طبيعي وتأهيل حركي',
    en: 'Physiotherapy Medical Report',
  },

  // Plan of Care
  {
    id: 'plan_hep_education',
    category: 'plan_of_care',
    ar: 'الالتزام ببرنامج التمارين المنزلية وتصحيح القوام وتجنب الأوضاع المجهدة',
    en: 'Adhere to daily Home Exercise Program, ergonomic posture & activity modification',
    aliasesAr: ['تمارين منزلية', 'تصحيح قوام'],
    aliasesEn: ['hep', 'posture education'],
  },
  {
    id: 'plan_progressive_loading',
    category: 'plan_of_care',
    ar: 'تدرج أحمال المقاومة والتحكم العضلي مع إعادة التقييم الدورية',
    en: 'Progressive resistance loading & neuromuscular control with periodic re-evaluation',
    aliasesAr: ['تدرج الأحمال', 'إعادة التقييم'],
    aliasesEn: ['progressive loading', 're-evaluation'],
  },
];

export function searchBilingualGlossary(
  query: string,
  category?: GlossaryCategory,
  limit = 12
): BilingualGlossaryEntry[] {
  const cleanLimit = Math.max(1, Math.min(50, limit));
  const pool = category
    ? BILINGUAL_CLINICAL_GLOSSARY.filter((item) => item.category === category)
    : BILINGUAL_CLINICAL_GLOSSARY;

  const normalizedQuery = normalizeArabicSearchText(query);
  if (!normalizedQuery) {
    return pool.slice(0, cleanLimit);
  }

  return pool
    .filter((entry) => {
      const candidates = [
        entry.ar,
        entry.en,
        ...(entry.aliasesAr || []),
        ...(entry.aliasesEn || []),
      ];
      return candidates.some((term) => normalizeArabicSearchText(term).includes(normalizedQuery));
    })
    .slice(0, cleanLimit);
}

export function resolveCanonicalBilingualTerm(rawText: string): {
  ar: string;
  en: string;
  bilingual: string;
  matched: boolean;
} {
  const clean = rawText.trim();
  if (!clean) {
    return { ar: '', en: '', bilingual: '', matched: false };
  }

  const normalizedInput = normalizeArabicSearchText(clean);
  for (const entry of BILINGUAL_CLINICAL_GLOSSARY) {
    const exactCandidates = [
      entry.ar,
      entry.en,
      ...(entry.aliasesAr || []),
      ...(entry.aliasesEn || []),
    ].map((c) => normalizeArabicSearchText(c));
    if (exactCandidates.includes(normalizedInput)) {
      return {
        ar: entry.ar,
        en: entry.en,
        bilingual: `${entry.ar} / ${entry.en}`,
        matched: true,
      };
    }
  }

  return {
    ar: clean,
    en: clean,
    bilingual: clean,
    matched: false,
  };
}

export interface PrintDocumentGlossaryLabels {
  patientLabel: string;
  mrnLabel: string;
  diagnosisLabel: string;
  bodyRegionLabel: string;
  clinicalImpressionLabel: string;
  outcomeMeasuresLabel: string;
  planOfCareLabel: string;
  physicianSignatureLabel: string;
  therapistAttestationLabel: string;
}

export function getPrintDocumentGlossaryLabels(lang: 'ar' | 'en'): PrintDocumentGlossaryLabels {
  if (lang === 'en') {
    return {
      patientLabel: 'Patient Name',
      mrnLabel: 'Medical Record Number (MRN)',
      diagnosisLabel: 'Medical Diagnosis',
      bodyRegionLabel: 'Affected Body Region',
      clinicalImpressionLabel: 'Clinical Assessment & Impression',
      outcomeMeasuresLabel: 'Functional Outcome Measures & MCID',
      planOfCareLabel: 'Plan of Care & Home Program',
      physicianSignatureLabel: 'Referring Physician',
      therapistAttestationLabel: 'Attending Physical Therapist',
    };
  }
  return {
    patientLabel: 'اسم المريض',
    mrnLabel: 'رقم الملف الطبي (MRN)',
    diagnosisLabel: 'التشخيص الطبي',
    bodyRegionLabel: 'المنطقة التشريحية المصابة',
    clinicalImpressionLabel: 'التقييم والانطباع السريري',
    outcomeMeasuresLabel: 'المقاييس الوظيفية والفرق السريري (MCID)',
    planOfCareLabel: 'الخطة العلاجية والبرنامج المنزلي',
    physicianSignatureLabel: 'الطبيب المحيل',
    therapistAttestationLabel: 'أخصائي العلاج الطبيعي المعالج',
  };
}
