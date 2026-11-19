// =======================================================================
// PhysioRecord — Modality Safety & Vitals Threshold Evaluators
// Phase B6 (Modality Contraindication Rules) + Phase B7 (Vitals Thresholds)
// =======================================================================

import rulesJson from '../data/clinicalToolkit/modalitySafetyRules.json';
import type { SessionVitalsEntry, StructuredPrecautionId } from '../types/clinical';
import type { VitalsAlertThresholds } from '../types/clinicManagement';

export interface ModalitySafetyRule {
  id: string;
  modalities: string[];
  precautionId: StructuredPrecautionId;
  severity: 'absolute_contraindication' | 'precaution';
  titleAr: string;
  titleEn: string;
  rationaleAr: string;
  rationaleEn: string;
  citation: string;
}

export interface StructuredPrecautionMeta {
  id: StructuredPrecautionId;
  labelAr: string;
  labelCkb: string;
  labelEn: string;
}

export const STRUCTURED_PRECAUTIONS_CATALOG: StructuredPrecautionMeta[] = [
  {
    id: 'pacemaker_icd',
    labelAr: 'منظم ضربات القلب / مزيل الرجفان (Pacemaker/ICD)',
    labelCkb: 'ڕێکخەری لێدانی دڵ (Pacemaker/ICD)',
    labelEn: 'Cardiac Pacemaker / ICD',
  },
  {
    id: 'pregnancy',
    labelAr: 'الحمل (Pregnancy)',
    labelCkb: 'دووگیانی',
    labelEn: 'Pregnancy',
  },
  {
    id: 'suspected_dvt',
    labelAr: 'اشتباه خثار وريدي عميق (Suspected DVT)',
    labelCkb: 'گومانی مەیینی خوێن لە خوێنهێنەر (DVT)',
    labelEn: 'Suspected DVT / Thrombophlebitis',
  },
  {
    id: 'active_malignancy',
    labelAr: 'ورم خبيث نشط (Active Malignancy)',
    labelCkb: 'گرێی شێرپەنجەیی چالاک',
    labelEn: 'Active Malignancy',
  },
  {
    id: 'metal_implants',
    labelAr: 'معادن أو مفاصل صناعية مزروعة (Metal Implants)',
    labelCkb: 'پارچەی کانزایی یان جومگەی دەستکرد',
    labelEn: 'Metal Implants / Prosthesis',
  },
  {
    id: 'impaired_sensation',
    labelAr: 'فقدان أو ضعف الإحساس الحراري/اللمسي',
    labelCkb: 'لاوازی هەستی گەرما و بەرکەوتن',
    labelEn: 'Impaired Thermal/Sensory Feedback',
  },
  {
    id: 'skin_lesion_infection',
    labelAr: 'جروح مفتوحة أو عدوى جلدية',
    labelCkb: 'برینی کراوە یان هەوکردنی پێست',
    labelEn: 'Open Wound / Local Skin Infection',
  },
  {
    id: 'epilepsy',
    labelAr: 'الصرع أو نوبات تشنجية',
    labelCkb: 'پەرکەم (Epilepsy)',
    labelEn: 'Epilepsy / Seizure Disorder',
  },
  {
    id: 'bleeding_anticoagulation',
    labelAr: 'نزف أو تناول مميعات الدم',
    labelCkb: 'خوێنبەربوون یان دەرمانی شلکردنی خوێن',
    labelEn: 'Bleeding Disorder / Anticoagulation',
  },
  {
    id: 'vascular_insufficiency',
    labelAr: 'قصور الأوعية المحيطية / رينود',
    labelCkb: 'کەمی سوڕی خوێنی پەلەکان',
    labelEn: 'Peripheral Vascular Insufficiency',
  },
  {
    id: 'acute_inflammation_trauma',
    labelAr: 'التهاب حاد أو رض/عدم ثبات حديث',
    labelCkb: 'هەوکردنی توند یان زەبری نوێ',
    labelEn: 'Acute Inflammation / Recent Trauma',
  },
];

export const MODALITY_SAFETY_RULES: ModalitySafetyRule[] =
  rulesJson.rules as ModalitySafetyRule[];

const MODALITY_ALIAS_MAP: Record<string, string> = {
  TENS: 'TENS',
  IFC: 'IFC',
  NMES: 'NMES',
  Ultrasound: 'Ultrasound',
  Cryotherapy: 'Cryotherapy',
  HotPack: 'HotPack',
  SuperficialHeat: 'SuperficialHeat',
  Shortwave: 'SWD_Diathermy',
  SWD_Diathermy: 'SWD_Diathermy',
  DryNeedling: 'DryNeedling',
  Traction: 'Traction',
  ManualTherapy: 'ManualTherapy',
};

const KEYWORD_TO_PRECAUTION: Array<{ regex: RegExp; id: StructuredPrecautionId }> = [
  { regex: /\bpacemaker\b|\bicd\b|منظم\s*(ضربات|نبض)/i, id: 'pacemaker_icd' },
  { regex: /\bpregnan|حامل|حمل/i, id: 'pregnancy' },
  { regex: /\bdvt\b|thrombo|خثار|جلطة\s*وريدية/i, id: 'suspected_dvt' },
  { regex: /malignan|cancer|tumor|ورم\s*خبيث|سرطان/i, id: 'active_malignancy' },
  { regex: /metal\s*implant|implanted\s*metal|prosthes|شريحة|بلاتين|مفصل\s*صناعي/i, id: 'metal_implants' },
  { regex: /impaired\s*sensation|neuropath|فقدان\s*الإحساس|خدر\s*شديد/i, id: 'impaired_sensation' },
  { regex: /open\s*wound|infection|جرح\s*مفتوح|عدوى/i, id: 'skin_lesion_infection' },
  { regex: /epilep|seizure|صرع/i, id: 'epilepsy' },
  { regex: /anticoag|warfarin|bleed|مميع|سيولة\s*الدم/i, id: 'bleeding_anticoagulation' },
];

export function extractPrecautionIdsFromText(text?: string): StructuredPrecautionId[] {
  if (!text || !text.trim()) return [];
  const matched = new Set<StructuredPrecautionId>();
  for (const item of KEYWORD_TO_PRECAUTION) {
    if (item.regex.test(text)) {
      matched.add(item.id);
    }
  }
  return Array.from(matched);
}

export function checkModalitySafety(
  modality: string,
  structuredPrecautions: StructuredPrecautionId[] = [],
  freeTextPrecautions?: string
): ModalitySafetyRule[] {
  const normalizedModality = MODALITY_ALIAS_MAP[modality] || modality;
  const effectivePrecautions = new Set<StructuredPrecautionId>([
    ...structuredPrecautions,
    ...extractPrecautionIdsFromText(freeTextPrecautions),
  ]);

  if (effectivePrecautions.size === 0) return [];

  return MODALITY_SAFETY_RULES.filter(
    (rule) =>
      effectivePrecautions.has(rule.precautionId) &&
      rule.modalities.includes(normalizedModality)
  );
}

export interface VitalsAlertItem {
  code: string;
  severity: 'critical' | 'warning';
  labelAr: string;
  labelCkb: string;
  labelEn: string;
}

export function evaluateVitalsAgainstThresholds(
  vitals: Partial<SessionVitalsEntry> | undefined,
  thresholds: VitalsAlertThresholds
): VitalsAlertItem[] {
  if (!vitals) return [];
  const alerts: VitalsAlertItem[] = [];

  if (vitals.bpSystolic !== undefined && Number.isFinite(vitals.bpSystolic)) {
    if (vitals.bpSystolic >= thresholds.bpSystolicHigh) {
      alerts.push({
        code: 'bp_sys_high',
        severity: 'critical',
        labelAr: `ضغط انقباضي مرتفع (≥ ${thresholds.bpSystolicHigh} mmHg) — يتطلب مراجعة/تقييم قبل التمرين`,
        labelCkb: `فشاری خوێنی بەرزی سەرەوە (≥ ${thresholds.bpSystolicHigh} mmHg)`,
        labelEn: `High Systolic BP (≥ ${thresholds.bpSystolicHigh} mmHg) — verify before exertion`,
      });
    } else if (vitals.bpSystolic <= thresholds.bpSystolicLow) {
      alerts.push({
        code: 'bp_sys_low',
        severity: 'warning',
        labelAr: `ضغط انقباضي منخفض (≤ ${thresholds.bpSystolicLow} mmHg) — انتبه لخطر الدوار الانتصابي`,
        labelCkb: `فشاری خوێنی نزمی سەرەوە (≤ ${thresholds.bpSystolicLow} mmHg)`,
        labelEn: `Low Systolic BP (≤ ${thresholds.bpSystolicLow} mmHg) — orthostatic precaution`,
      });
    }
  }

  if (vitals.bpDiastolic !== undefined && Number.isFinite(vitals.bpDiastolic)) {
    if (vitals.bpDiastolic >= thresholds.bpDiastolicHigh) {
      alerts.push({
        code: 'bp_dia_high',
        severity: 'critical',
        labelAr: `ضغط انبساطي مرتفع (≥ ${thresholds.bpDiastolicHigh} mmHg)`,
        labelCkb: `فشاری خوێنی بەرزی خوارەوە (≥ ${thresholds.bpDiastolicHigh} mmHg)`,
        labelEn: `High Diastolic BP (≥ ${thresholds.bpDiastolicHigh} mmHg)`,
      });
    } else if (vitals.bpDiastolic <= thresholds.bpDiastolicLow) {
      alerts.push({
        code: 'bp_dia_low',
        severity: 'warning',
        labelAr: `ضغط انبساطي منخفض (≤ ${thresholds.bpDiastolicLow} mmHg)`,
        labelCkb: `فشاری خوێنی نزمی خوارەوە (≤ ${thresholds.bpDiastolicLow} mmHg)`,
        labelEn: `Low Diastolic BP (≤ ${thresholds.bpDiastolicLow} mmHg)`,
      });
    }
  }

  if (vitals.heartRateBpm !== undefined && Number.isFinite(vitals.heartRateBpm)) {
    if (vitals.heartRateBpm >= thresholds.hrHigh) {
      alerts.push({
        code: 'hr_high',
        severity: 'warning',
        labelAr: `تسرّع نبض (≥ ${thresholds.hrHigh} bpm)`,
        labelCkb: `خێرایی لێدانی دڵ (≥ ${thresholds.hrHigh} bpm)`,
        labelEn: `Tachycardia Alert (≥ ${thresholds.hrHigh} bpm)`,
      });
    } else if (vitals.heartRateBpm <= thresholds.hrLow) {
      alerts.push({
        code: 'hr_low',
        severity: 'warning',
        labelAr: `تباطؤ نبض (≤ ${thresholds.hrLow} bpm)`,
        labelCkb: `خاوی لێدانی دڵ (≤ ${thresholds.hrLow} bpm)`,
        labelEn: `Bradycardia Alert (≤ ${thresholds.hrLow} bpm)`,
      });
    }
  }

  if (vitals.spO2Percent !== undefined && Number.isFinite(vitals.spO2Percent)) {
    if (vitals.spO2Percent <= thresholds.spO2Low) {
      alerts.push({
        code: 'spo2_low',
        severity: 'critical',
        labelAr: `انخفاض تشبّع الأكسجين SpO2 (≤ ${thresholds.spO2Low}%)`,
        labelCkb: `نزمی ئۆکسجینی خوێن SpO2 (≤ ${thresholds.spO2Low}%)`,
        labelEn: `Low SpO2 Alert (≤ ${thresholds.spO2Low}%)`,
      });
    }
  }

  return alerts;
}
