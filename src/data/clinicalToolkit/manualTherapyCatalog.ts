// =======================================================================
// PhysioRecord — Evidence-Based Manual Therapy Technique & Grade Catalog
// Supports joint mobilization/manipulation, soft tissue, neuromuscular, and neural techniques.
// =======================================================================

import type { ManualTherapyGradeOrIntensity } from '../../types/clinical';

export interface ManualTherapyTechniquePreset {
  id: string;
  shortAr: string;
  shortEn: string;
  shortCkb: string;
  techniqueAr: string;
  techniqueEn: string;
  defaultGrade: ManualTherapyGradeOrIntensity;
  defaultDurationMinutes: number;
  defaultTargetAr?: string;
  defaultTargetEn?: string;
}

export interface ManualTherapyGradeOption {
  value: ManualTherapyGradeOrIntensity;
  group: 'joint' | 'soft_neuro';
  labelAr: string;
  labelEn: string;
  labelCkb: string;
}

export const MANUAL_THERAPY_GRADE_OPTIONS: ReadonlyArray<ManualTherapyGradeOption> = [
  // Joint Mobilization / Manipulation / Traction
  {
    value: 'Grade I',
    group: 'joint',
    labelAr: 'Grade I (تسكين / بداية المدى)',
    labelEn: 'Grade I (Pain modulation)',
    labelCkb: 'Grade I (هێورکردنەوەی ئازار)',
  },
  {
    value: 'Grade II',
    group: 'joint',
    labelAr: 'Grade II (سعة كبيرة دون مقاومة)',
    labelEn: 'Grade II (Large amp, non-end range)',
    labelCkb: 'Grade II (جووڵەی فراوان بێ بەربەست)',
  },
  {
    value: 'Grade III',
    group: 'joint',
    labelAr: 'Grade III (استطالة المحفظة المفصلية)',
    labelEn: 'Grade III (Stretching / stiffness)',
    labelCkb: 'Grade III (کشانی جومگە)',
  },
  {
    value: 'Grade IV',
    group: 'joint',
    labelAr: 'Grade IV (تذبذب نهاية المدى)',
    labelEn: 'Grade IV (End-range oscillation)',
    labelCkb: 'Grade IV (لەرینەوەی کۆتایی مەودا)',
  },
  {
    value: 'Grade V (HVLA)',
    group: 'joint',
    labelAr: 'Grade V — HVLA (معالجة سريعة)',
    labelEn: 'Grade V — HVLA Manipulation',
    labelCkb: 'Grade V — HVLA',
  },
  {
    value: 'MWM',
    group: 'joint',
    labelAr: 'Mulligan MWM (تحريك مع حركة)',
    labelEn: 'Mulligan MWM (With Movement)',
    labelCkb: 'Mulligan MWM',
  },
  {
    value: 'SNAGs / NAGs',
    group: 'joint',
    labelAr: 'Mulligan SNAGs / NAGs (عمود فقري)',
    labelEn: 'Mulligan SNAGs / NAGs',
    labelCkb: 'SNAGs / NAGs',
  },
  {
    value: 'Manual Traction',
    group: 'joint',
    labelAr: 'شد / تباعد مفصلي يدوي (Traction)',
    labelEn: 'Manual Distraction / Traction',
    labelCkb: 'کێشانی دەستی (Traction)',
  },
  // Soft Tissue, Neuromuscular & Neural Mobilization
  {
    value: 'Soft Tissue',
    group: 'soft_neuro',
    labelAr: 'تحرير أنسجة رخوة (STM)',
    labelEn: 'Soft Tissue Mobilization (STM)',
    labelCkb: 'شێلانی شانەی نەرم',
  },
  {
    value: 'Myofascial Release',
    group: 'soft_neuro',
    labelAr: 'تحرير اللفافة العضلية (MFR)',
    labelEn: 'Myofascial Release (MFR)',
    labelCkb: 'ئازادکردنی فاشیا (MFR)',
  },
  {
    value: 'Trigger Point',
    group: 'soft_neuro',
    labelAr: 'تحرير نقاط الزناد (Trigger Point)',
    labelEn: 'Trigger Point / Ischemic Release',
    labelCkb: 'ئازادکردنی خاڵی ئازار',
  },
  {
    value: 'Deep Friction',
    group: 'soft_neuro',
    labelAr: 'تدليك احتكاكي عميق (Cyriax)',
    labelEn: 'Deep Transverse Friction (Cyriax)',
    labelCkb: 'شێلانی قووڵ (Cyriax)',
  },
  {
    value: 'MET',
    group: 'soft_neuro',
    labelAr: 'طاقة العضلات (MET)',
    labelEn: 'Muscle Energy Technique (MET)',
    labelCkb: 'تەکنیکی وزەی ماسولکە (MET)',
  },
  {
    value: 'PNF',
    group: 'soft_neuro',
    labelAr: 'تسهيل عصبي عضلي (PNF)',
    labelEn: 'PNF (Contract-Relax / Hold-Relax)',
    labelCkb: 'PNF',
  },
  {
    value: 'Neural Glide',
    group: 'soft_neuro',
    labelAr: 'تحريك الأعصاب (Neurodynamic)',
    labelEn: 'Neurodynamic / Nerve Gliding',
    labelCkb: 'جووڵاندنی دەمار (Neural Glide)',
  },
  {
    value: 'Lymphatic',
    group: 'soft_neuro',
    labelAr: 'تصريف لمفاوي يدوي (MLD)',
    labelEn: 'Manual Lymphatic Drainage (MLD)',
    labelCkb: 'ڕێڕەوکردنی لیمف (MLD)',
  },
];

export const MANUAL_THERAPY_TECHNIQUE_PRESETS: ReadonlyArray<ManualTherapyTechniquePreset> = [
  {
    id: 'mt_maitland',
    shortAr: 'تحريك مفصلي (Maitland)',
    shortEn: 'Maitland Mob',
    shortCkb: 'Maitland',
    techniqueAr: 'تحريك مفصلي تذبذبي (Maitland Mobilization)',
    techniqueEn: 'Maitland Joint Mobilization',
    defaultGrade: 'Grade III',
    defaultDurationMinutes: 10,
  },
  {
    id: 'mt_mwm',
    shortAr: 'موليغان (MWM)',
    shortEn: 'Mulligan MWM',
    shortCkb: 'Mulligan MWM',
    techniqueAr: 'تحريك مفصلي مع الحركة (Mulligan MWM)',
    techniqueEn: 'Mulligan Mobilization with Movement (MWM)',
    defaultGrade: 'MWM',
    defaultDurationMinutes: 8,
  },
  {
    id: 'mt_snags',
    shortAr: 'فقرات (SNAGs / NAGs)',
    shortEn: 'SNAGs / NAGs',
    shortCkb: 'SNAGs / NAGs',
    techniqueAr: 'انزلاق فقري مستدام (Mulligan SNAGs / NAGs)',
    techniqueEn: 'Spinal SNAGs / NAGs Mobilization',
    defaultGrade: 'SNAGs / NAGs',
    defaultDurationMinutes: 8,
    defaultTargetAr: 'الفقرات العنقية / القطنية',
    defaultTargetEn: 'Cervical / Lumbar Spine',
  },
  {
    id: 'mt_kaltenborn',
    shortAr: 'تباعد وشد (Traction)',
    shortEn: 'Manual Traction',
    shortCkb: 'کێشانی دەستی',
    techniqueAr: 'شد وتباعد مفصلي يدوي (Kaltenborn / Traction)',
    techniqueEn: 'Manual Joint Distraction / Traction',
    defaultGrade: 'Manual Traction',
    defaultDurationMinutes: 10,
  },
  {
    id: 'mt_mfr',
    shortAr: 'تحرير اللفافة (MFR)',
    shortEn: 'Myofascial Release',
    shortCkb: 'MFR',
    techniqueAr: 'تحرير اللفافة العضلية (Myofascial Release)',
    techniqueEn: 'Myofascial Release (MFR)',
    defaultGrade: 'Myofascial Release',
    defaultDurationMinutes: 12,
  },
  {
    id: 'mt_trigger',
    shortAr: 'نقاط الزناد (TrP)',
    shortEn: 'Trigger Point',
    shortCkb: 'Trigger Point',
    techniqueAr: 'تحرير نقاط الزناد والضغط الإفقاري',
    techniqueEn: 'Trigger Point Release',
    defaultGrade: 'Trigger Point',
    defaultDurationMinutes: 8,
  },
  {
    id: 'mt_friction',
    shortAr: 'تدليك عميق (Cyriax)',
    shortEn: 'Deep Friction',
    shortCkb: 'Cyriax Friction',
    techniqueAr: 'تدليك احتكاكي عميق مستعرض (Cyriax Friction)',
    techniqueEn: 'Deep Transverse Friction Massage',
    defaultGrade: 'Deep Friction',
    defaultDurationMinutes: 6,
  },
  {
    id: 'mt_met',
    shortAr: 'طاقة العضلات (MET)',
    shortEn: 'MET',
    shortCkb: 'MET',
    techniqueAr: 'تقنية طاقة العضلات (Muscle Energy Technique)',
    techniqueEn: 'Muscle Energy Technique (MET)',
    defaultGrade: 'MET',
    defaultDurationMinutes: 8,
  },
  {
    id: 'mt_pnf',
    shortAr: 'إطالة عصبية (PNF)',
    shortEn: 'PNF Stretch',
    shortCkb: 'PNF',
    techniqueAr: 'تسهيل عصبي عضلي مستقبلي (PNF Contract-Relax)',
    techniqueEn: 'PNF Contract-Relax Stretching',
    defaultGrade: 'PNF',
    defaultDurationMinutes: 8,
  },
  {
    id: 'mt_neural',
    shortAr: 'تحريك أعصاب (Neural)',
    shortEn: 'Neural Glide',
    shortCkb: 'Neural Glide',
    techniqueAr: 'تحريك وتزليق الأعصاب الطرفية (Neurodynamic)',
    techniqueEn: 'Neurodynamic Nerve Gliding (Slider/Tensioner)',
    defaultGrade: 'Neural Glide',
    defaultDurationMinutes: 8,
  },
  {
    id: 'mt_hvla',
    shortAr: 'معالجة (HVLA)',
    shortEn: 'HVLA Thrust',
    shortCkb: 'HVLA',
    techniqueAr: 'معالجة يدوية سريعة (HVLA Manipulation)',
    techniqueEn: 'High-Velocity Low-Amplitude Thrust (HVLA)',
    defaultGrade: 'Grade V (HVLA)',
    defaultDurationMinutes: 5,
  },
  {
    id: 'mt_lymph',
    shortAr: 'تصريف لمفاوي (MLD)',
    shortEn: 'Lymphatic Drainage',
    shortCkb: 'MLD',
    techniqueAr: 'تصريف لمفاوي يدوي لتقليل التورم (MLD)',
    techniqueEn: 'Manual Lymphatic Drainage',
    defaultGrade: 'Lymphatic',
    defaultDurationMinutes: 15,
  },
];

export const MANUAL_THERAPY_TARGET_CHIPS: ReadonlyArray<{
  ar: string;
  en: string;
  ckb: string;
}> = [
  { ar: 'الفقرات العنقية', en: 'Cervical Spine', ckb: 'بڕبڕەکانی مل' },
  { ar: 'الكتف (GH)', en: 'Shoulder (GH)', ckb: 'شان' },
  { ar: 'الفقرات الصدرية', en: 'Thoracic Spine', ckb: 'بڕبڕەکانی سنگ' },
  { ar: 'أسفل الظهر (Lumbar)', en: 'Lumbar Spine', ckb: 'بڕبڕەکانی کەمەر' },
  { ar: 'المفصل العجزي الحرقفي (SIJ)', en: 'SIJ / Pelvis', ckb: 'SIJ / حەوز' },
  { ar: 'مفصل الورك', en: 'Hip Joint', ckb: 'جومگەی ڕان' },
  { ar: 'الركبة / الرضفة', en: 'Knee / PFJ', ckb: 'ئەژنۆ' },
  { ar: 'الكاحل والقدم', en: 'Ankle / Subtalar', ckb: 'پاژنە و پێ' },
  { ar: 'المرفق والرسغ', en: 'Elbow / Wrist', ckb: 'ئانیشک و مەچەک' },
  { ar: 'اللفافة والأنسجة المحيطة', en: 'Surrounding Soft Tissue', ckb: 'شانەی نەرم' },
];
