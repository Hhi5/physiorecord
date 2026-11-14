// =======================================================================
// PhysioRecord — Open-Source Outcome Measure Calculators & MCID Metadata
// Pure clinical calculations & score-entry bands (NO proprietary test items).
// =======================================================================

import type {
  CustomOutcomeMeasureConfig,
  ValidatedScaleId,
} from '../types/clinicalWidgets';

export type ScaleCategory = 'score_entry' | 'procedure' | 'custom';

export interface ScoreEntryInstrumentSpec {
  id: ValidatedScaleId;
  code: string;
  category: ScaleCategory;
  nameAr: string;
  nameEn: string;
  regionAr: string;
  regionEn: string;
  higherIsBetter: boolean;
  minRaw: number;
  maxRaw: number;
  unitAr: string;
  unitEn: string;
  mcidValue: number; // In % points for % scales or raw units for procedures
  mcidUnitIsPercent: boolean;
  mcidLabelAr: string;
  mcidLabelEn: string;
  mdcLabelAr: string;
  mdcLabelEn: string;
  citation: string;
  officialSourceUrl?: string;
  officialSourceLabelAr?: string;
  officialSourceLabelEn?: string;
  hasSubscales?: boolean;
  procedureSummaryAr?: string;
  procedureSummaryEn?: string;
}

export const OUTCOME_INSTRUMENTS: Record<
  Exclude<ValidatedScaleId, 'oswestry' | 'custom'>,
  ScoreEntryInstrumentSpec
> = {
  nprs: {
    id: 'nprs',
    code: 'NPRS',
    category: 'procedure',
    nameAr: 'مقياس تقييم الألم الرقمي (NPRS 0–10)',
    nameEn: 'Numeric Pain Rating Scale (NPRS 0–10)',
    regionAr: 'عام / شدة الألم',
    regionEn: 'General Pain Intensity',
    higherIsBetter: false,
    minRaw: 0,
    maxRaw: 10,
    unitAr: 'نقطة (0–10)',
    unitEn: 'pts (0–10)',
    mcidValue: 20,
    mcidUnitIsPercent: true,
    mcidLabelAr: 'MCID ≥ 2 نقطتان (20%) أو تحسن ≥ 30%',
    mcidLabelEn: 'MCID ≥ 2 points (20%) or ≥ 30% improvement',
    mdcLabelAr: 'MDC ≈ 2 نقطتان',
    mdcLabelEn: 'MDC ≈ 2 points',
    citation: 'Childs et al., Spine 2005; Farrar et al., Pain 2001',
  },
  psfs: {
    id: 'psfs',
    code: 'PSFS',
    category: 'procedure',
    nameAr: 'المقياس الوظيفي الخاص بالمريض (PSFS)',
    nameEn: 'Patient-Specific Functional Scale (PSFS)',
    regionAr: 'أنشطة وظيفية مخصصة',
    regionEn: 'Patient-Identified Activities',
    higherIsBetter: true,
    minRaw: 0,
    maxRaw: 10,
    unitAr: 'متوسط (0–10)',
    unitEn: 'mean (0–10)',
    mcidValue: 20,
    mcidUnitIsPercent: true,
    mcidLabelAr: 'MCID ≥ 2.0 نقطة للنشاط الواحد (≥ 2.3 للمتوسط)',
    mcidLabelEn: 'MCID ≥ 2.0 pts single activity (≥ 2.3 mean)',
    mdcLabelAr: 'MDC₉₀ ≈ 1.4 – 2.0 نقطة',
    mdcLabelEn: 'MDC₉₀ ≈ 1.4 – 2.0 points',
    citation: 'Stratford et al., Physiother Can 1995; Horn et al., JOSPT 2012',
    procedureSummaryAr:
      'يدوّن المعالج 1–5 أنشطة يومية هامة يذكرها المريض بكلماته الخاصة، ثم يقيّم القدرة على أدائها من 0 (عجز تام) إلى 10 (بالمستوى المعتاد).',
    procedureSummaryEn:
      'Record 1–5 important daily activities named by the patient, and rate current ability from 0 (unable) to 10 (able at prior baseline level).',
  },
  tug: {
    id: 'tug',
    code: 'TUG',
    category: 'procedure',
    nameAr: 'اختبار الوقوف والمشي الموقوت (TUG)',
    nameEn: 'Timed Up and Go (TUG)',
    regionAr: 'التوازن والتنقل',
    regionEn: 'Balance & Functional Mobility',
    higherIsBetter: false,
    minRaw: 0,
    maxRaw: 120,
    unitAr: 'ثانية',
    unitEn: 'seconds',
    mcidValue: 3.0,
    mcidUnitIsPercent: false,
    mcidLabelAr: 'تغيّر سريري دال ≥ 2.1 – 3.5 ثانية (حسب الفئة)',
    mcidLabelEn: 'Clinically meaningful change ≈ 2.1 – 3.5 s (cohort-dependent)',
    mdcLabelAr: 'MDC₉₅ ≈ 1.8 – 4.0 ثانية',
    mdcLabelEn: 'MDC₉₅ ≈ 1.8 – 4.0 s',
    citation: 'Podsiadlo & Richardson, J Am Geriatr Soc 1991; Shumway-Cook et al., Phys Ther 2000; Bohannon, J Geriatr Phys Ther 2006; Barry et al., BMC Geriatr 2014',
    procedureSummaryAr:
      'يقف المريض من كرسي قياسي، يمشي لمسافة 3 أمتار بخطى معتادة، يستدير، يعود ويجلس. يُفسَّر الزمن المقاس مقارنة بالمدى المرجعي للفئة العمرية والحالة السريرية وليس كتصنيف ثنائي.',
    procedureSummaryEn:
      'Patient rises from a standard chair, walks 3 meters at comfortable pace, turns, walks back, and sits down. Interpret measured seconds against cited cohort reference ranges rather than a single binary cutoff.',
  },
  chair_stand_30s: {
    id: 'chair_stand_30s',
    code: '30s-CST',
    category: 'procedure',
    nameAr: 'اختبار الوقوف من الكرسي خلال 30 ثانية (30s Chair Stand)',
    nameEn: '30-Second Chair Stand Test (30s-CST)',
    regionAr: 'قوة وتحمل الطرف السفلي',
    regionEn: 'Lower Extremity Strength & Endurance',
    higherIsBetter: true,
    minRaw: 0,
    maxRaw: 60,
    unitAr: 'تكرار خلال 30 ث',
    unitEn: 'reps in 30 s',
    mcidValue: 2.0,
    mcidUnitIsPercent: false,
    mcidLabelAr: 'MCID ≈ ≥ 2.0 – 2.6 تكرار',
    mcidLabelEn: 'MCID ≈ ≥ 2.0 – 2.6 repetitions',
    mdcLabelAr: 'MDC₉₀ ≈ 2.0 – 3.0 تكرار',
    mdcLabelEn: 'MDC₉₀ ≈ 2.0 – 3.0 repetitions',
    citation: 'Jones et al., Res Q Exerc Sport 1999; Wright et al., Physiother Theory Pract 2011',
    procedureSummaryAr:
      'الذراعان متقاطعتان على الصدر؛ يُحسب عدد مرات الوقوف الكامل من الكرسي والجلوس خلال 30 ثانية بأقصى وتيرة آمنة (بروتوكول CDC STEADI العام).',
    procedureSummaryEn:
      'Arms crossed over chest; count full sit-to-stand repetitions completed safely in 30 seconds (CDC STEADI public-domain procedure).',
  },
  five_x_sts: {
    id: 'five_x_sts',
    code: '5xSTS',
    category: 'procedure',
    nameAr: 'اختبار الوقوف والجلوس 5 مرات (5xSTS)',
    nameEn: 'Five-Times Sit-to-Stand (5xSTS)',
    regionAr: 'القوة الوظيفية للطرف السفلي',
    regionEn: 'Lower Limb Functional Power & Balance',
    higherIsBetter: false,
    minRaw: 0,
    maxRaw: 120,
    unitAr: 'ثانية',
    unitEn: 'seconds',
    mcidValue: 2.3,
    mcidUnitIsPercent: false,
    mcidLabelAr: 'MCID ≈ ≥ 2.3 ثانية',
    mcidLabelEn: 'MCID ≈ ≥ 2.3 seconds',
    mdcLabelAr: 'MDC₉₀ ≈ 2.5 – 3.6 ثانية؛ مؤشر إضافي > 12–15 ث',
    mdcLabelEn: 'MDC₉₀ ≈ 2.5 – 3.6 s; mobility impairment > 12–15 s',
    citation: 'Csuka & McCarty 1985; Meretta et al., J Geriatr Phys Ther 2006; Tiedemann et al. 2008',
    procedureSummaryAr:
      'يقف المريض ويجلس 5 مرات متتالية بأسرع ما يمكن بأمان دون استخدام اليدين مع تثبيت الذراعين على الصدر، ويُسجَّل الزمن بالثواني.',
    procedureSummaryEn:
      'Patient completes 5 consecutive full sit-to-stand transitions as quickly and safely as possible without arm support; record elapsed time in seconds.',
  },
  odi: {
    id: 'odi',
    code: 'ODI',
    category: 'score_entry',
    nameAr: 'مؤشر أوسويستري للإعاقة القطنية (ODI — إدخال النتيجة)',
    nameEn: 'Oswestry Disability Index (ODI — Score Entry)',
    regionAr: 'العمود الفقري القطني',
    regionEn: 'Lumbar Spine',
    higherIsBetter: false,
    minRaw: 0,
    maxRaw: 50,
    unitAr: 'درجة (0–50)',
    unitEn: 'pts (0–50)',
    mcidValue: 10,
    mcidUnitIsPercent: true,
    mcidLabelAr: 'MCID ≥ 10 نقاط مئوية (أو 30% تحسن نسبي)',
    mcidLabelEn: 'MCID ≥ 10 percentage points (or 30% relative improvement)',
    mdcLabelAr: 'MDC₉₀ ≈ 10 – 12.7 نقطة مئوية',
    mdcLabelEn: 'MDC₉₀ ≈ 10 – 12.7 percentage points',
    citation: 'Fairbank et al. 1980; Ostelo et al., Spine 2008',
    officialSourceUrl:
      'https://eprovide.mapi-trust.org/instruments/oswestry-disability-index',
    officialSourceLabelAr: 'المصدر الرسمي والترخيص (Mapi Research Trust / ePROVIDE)',
    officialSourceLabelEn: 'Official Instrument & Licensing (Mapi Research Trust)',
  },
  ndi: {
    id: 'ndi',
    code: 'NDI',
    category: 'score_entry',
    nameAr: 'مؤشر إعاقة الرقبة (NDI — إدخال النتيجة)',
    nameEn: 'Neck Disability Index (NDI — Score Entry)',
    regionAr: 'الفقرات العنقية',
    regionEn: 'Cervical Spine',
    higherIsBetter: false,
    minRaw: 0,
    maxRaw: 50,
    unitAr: 'درجة (0–50)',
    unitEn: 'pts (0–50)',
    mcidValue: 15,
    mcidUnitIsPercent: true,
    mcidLabelAr: 'MCID ≈ 7.5 – 8.5 نقطة (15–17%) للرضوض / 5 نقاط (10%) غير النوعي',
    mcidLabelEn: 'MCID ≈ 5–8.5 / 50 pts (10–17%)',
    mdcLabelAr: 'MDC₉₀ ≈ 5 نقاط من 50 (10%)',
    mdcLabelEn: 'MDC₉₀ ≈ 5 / 50 pts (10%)',
    citation: 'Vernon & Mior 1991; Young et al., JOSPT 2010; MacDermid et al. 2009',
    officialSourceUrl:
      'https://eprovide.mapi-trust.org/instruments/neck-disability-index',
    officialSourceLabelAr: 'المصدر الرسمي والترخيص (ePROVIDE / NDI)',
    officialSourceLabelEn: 'Official Instrument & Licensing (ePROVIDE / NDI)',
  },
  quickdash: {
    id: 'quickdash',
    code: 'QuickDASH',
    category: 'score_entry',
    nameAr: 'مقياس QuickDASH للطرف العلوي (إدخال النتيجة)',
    nameEn: 'QuickDASH Upper Extremity (Score Entry)',
    regionAr: 'الطرف العلوي',
    regionEn: 'Upper Extremity',
    higherIsBetter: false,
    minRaw: 0,
    maxRaw: 100,
    unitAr: 'نسبة % (0–100)',
    unitEn: 'score (0–100%)',
    mcidValue: 15.9,
    mcidUnitIsPercent: true,
    mcidLabelAr: 'MCID ≈ 15.9 نقطة مئوية (8–19 نقطة حسب الحالة)',
    mcidLabelEn: 'MCID ≈ 15.9 points (cohort range 8–19)',
    mdcLabelAr: 'MDC₉₅ ≈ 11.2 نقطة مئوية',
    mdcLabelEn: 'MDC₉₅ ≈ 11.2 points',
    citation: 'Beaton et al., JBJS 2005; Franchignoni et al., Arch Phys Med Rehabil 2014',
    officialSourceUrl: 'https://dash.iwh.on.ca/',
    officialSourceLabelAr: 'المصدر الرسمي والترخيص (Institute for Work & Health — DASH)',
    officialSourceLabelEn: 'Official Source & Licensing (IWH DASH Portal)',
  },
  spadi: {
    id: 'spadi',
    code: 'SPADI',
    category: 'score_entry',
    nameAr: 'مؤشر ألم وإعاقة الكتف (SPADI — إدخال النتيجة الفرعية/الكلية)',
    nameEn: 'Shoulder Pain and Disability Index (SPADI — Score Entry)',
    regionAr: 'الكتف',
    regionEn: 'Shoulder',
    higherIsBetter: false,
    minRaw: 0,
    maxRaw: 130,
    unitAr: 'درجة (ألم 0–50 + إعاقة 0–80)',
    unitEn: 'pts (Pain 0–50 + Disab 0–80)',
    mcidValue: 10,
    mcidUnitIsPercent: true,
    mcidLabelAr: 'MCID ≈ 8 – 13 نقطة مئوية',
    mcidLabelEn: 'MCID ≈ 8 – 13 percentage points',
    mdcLabelAr: 'MDC₉₅ ≈ 18 نقطة مئوية',
    mdcLabelEn: 'MDC₉₅ ≈ 18 percentage points',
    citation: 'Roach et al., Arthritis Care Res 1991; Roy et al., Arthritis Care Res 2009',
    officialSourceUrl:
      'https://www.sralab.org/rehabilitation-measures/shoulder-pain-and-disability-index',
    officialSourceLabelAr: 'مرجع الأداة والترخيص (Shirley Ryan AbilityLab — SPADI)',
    officialSourceLabelEn: 'Official Instrument Summary (Shirley Ryan AbilityLab)',
    hasSubscales: true,
  },
  lefs: {
    id: 'lefs',
    code: 'LEFS',
    category: 'score_entry',
    nameAr: 'المقياس الوظيفي للطرف السفلي (LEFS — إدخال النتيجة)',
    nameEn: 'Lower Extremity Functional Scale (LEFS — Score Entry)',
    regionAr: 'الطرف السفلي',
    regionEn: 'Lower Extremity',
    higherIsBetter: true,
    minRaw: 0,
    maxRaw: 80,
    unitAr: 'درجة (0–80)',
    unitEn: 'pts (0–80)',
    mcidValue: 11.25,
    mcidUnitIsPercent: true,
    mcidLabelAr: 'MCID = 9 نقاط (11.3% من المقياس الكلي)',
    mcidLabelEn: 'MCID = 9 points (11.3% scale width)',
    mdcLabelAr: 'MDC₉₀ = 9 نقاط',
    mdcLabelEn: 'MDC₉₀ = 9 points',
    citation: 'Binkley et al., Phys Ther 1999',
    officialSourceUrl:
      'https://www.sralab.org/rehabilitation-measures/lower-extremity-functional-scale',
    officialSourceLabelAr: 'مرجع الأداة والترخيص (Shirley Ryan AbilityLab — LEFS)',
    officialSourceLabelEn: 'Official Instrument Summary (Shirley Ryan AbilityLab)',
  },
};

export function normalizeScaleId(scaleId: ValidatedScaleId): Exclude<ValidatedScaleId, 'oswestry'> {
  return scaleId === 'oswestry' ? 'odi' : scaleId;
}

export function computeScalePercentage(
  scaleId: ValidatedScaleId,
  rawScore: number,
  maxScoreOverride?: number,
  customConfig?: CustomOutcomeMeasureConfig
): number {
  const id = normalizeScaleId(scaleId);
  if (id === 'custom' && customConfig) {
    const min = customConfig.minScore;
    const max = customConfig.maxScore;
    if (max <= min) return 0;
    const clamped = Math.min(max, Math.max(min, rawScore));
    return Math.round(((clamped - min) / (max - min)) * 100);
  }
  if (id === 'tug') {
    // Lower seconds = better relative score percentage capped reasonably for chart normalization (0..30s -> 100..0%)
    const clamped = Math.max(0, Math.min(30, rawScore));
    return Math.round(((30 - clamped) / 30) * 100);
  }
  if (id === 'five_x_sts') {
    const clamped = Math.max(0, Math.min(40, rawScore));
    return Math.round(((40 - clamped) / 40) * 100);
  }
  if (id === 'chair_stand_30s') {
    const maxRef = maxScoreOverride && maxScoreOverride > 0 ? maxScoreOverride : 30;
    const clamped = Math.max(0, Math.min(maxRef, rawScore));
    return Math.round((clamped / maxRef) * 100);
  }

  const spec = OUTCOME_INSTRUMENTS[id as keyof typeof OUTCOME_INSTRUMENTS];
  const maxVal = maxScoreOverride && maxScoreOverride > 0 ? maxScoreOverride : spec?.maxRaw || 100;
  const clamped = Math.max(0, Math.min(maxVal, rawScore));
  return Math.round((clamped / maxVal) * 100);
}

export function classifyOutcomeSeverity(
  scaleId: ValidatedScaleId,
  rawScore: number,
  percentage: number,
  customConfig?: CustomOutcomeMeasureConfig
): { ar: string; en: string } {
  const id = normalizeScaleId(scaleId);

  if (id === 'nprs') {
    if (rawScore === 0) return { ar: 'لا يوجد ألم (0/10)', en: 'No Pain (0/10)' };
    if (rawScore <= 3) return { ar: 'ألم خفيف (1–3/10)', en: 'Mild Pain (1–3/10)' };
    if (rawScore <= 6) return { ar: 'ألم متوسط (4–6/10)', en: 'Moderate Pain (4–6/10)' };
    return { ar: 'ألم شديد (7–10/10)', en: 'Severe Pain (7–10/10)' };
  }

  if (id === 'psfs') {
    if (rawScore >= 8) return { ar: 'كفاءة وظيفية عالية', en: 'High Functional Ability' };
    if (rawScore >= 5) return { ar: 'محدودية وظيفية متوسطة', en: 'Moderate Functional Limitation' };
    return { ar: 'محدودية وظيفية شديدة', en: 'Severe Functional Limitation' };
  }

  if (id === 'lefs') {
    if (percentage >= 75) return { ar: 'كفاءة وظيفية عالية', en: 'High Functional Level' };
    if (percentage >= 45) return { ar: 'محدودية وظيفية متوسطة', en: 'Moderate Limitation' };
    return { ar: 'محدودية وظيفية شديدة', en: 'Severe Limitation' };
  }

  if (id === 'tug') {
    return {
      ar: `الزمن المقاس: ${rawScore} ث — قارن بالمدى المرجعي للفئة العمرية/الحالة`,
      en: `Measured: ${rawScore} s — compare with cited population range`,
    };
  }

  if (id === 'chair_stand_30s') {
    return {
      ar: `التكرار المقاس: ${rawScore} / 30 ث — قارن بالمعيار العمري (Jones 1999)`,
      en: `Measured: ${rawScore} reps / 30 s — compare with age-sex norm (Jones 1999)`,
    };
  }

  if (id === 'five_x_sts') {
    return {
      ar: `الزمن المقاس: ${rawScore} ث — قارن بالمدى المرجعي للفئة (Bohannon 2006)`,
      en: `Measured: ${rawScore} s — compare with cited age/cohort norm (Bohannon 2006)`,
    };
  }

  if (id === 'custom') {
    const dir = customConfig?.higherIsBetter ?? true;
    const isGood = dir ? percentage >= 75 : percentage <= 25;
    const isMid = percentage > 25 && percentage < 75;
    if (isGood) return { ar: 'ضمن المستوى المستهدف', en: 'Target / High Function' };
    if (isMid) return { ar: 'مستوى متوسط', en: 'Moderate Range' };
    return { ar: 'تأثر ملحوظ', en: 'Substantial Impairment' };
  }

  // Disability % scales (ODI, NDI, QuickDASH, SPADI — lower % = better)
  if (percentage <= 20) return { ar: 'عجز وظيفي طفيف (Minimal)', en: 'Minimal Disability' };
  if (percentage <= 40) return { ar: 'عجز وظيفي متوسط (Moderate)', en: 'Moderate Disability' };
  if (percentage <= 60) return { ar: 'عجز وظيفي شديد (Severe)', en: 'Severe Disability' };
  return { ar: 'إعاقة وظيفية بالغة (Very Severe)', en: 'Very Severe Disability' };
}

export interface McidChangeEvaluation {
  deltaPercent: number;
  deltaRaw: number;
  improved: boolean;
  mcidMet: boolean;
  summaryAr: string;
  summaryEn: string;
}

export function evaluateBaselineChange(
  scaleId: ValidatedScaleId,
  baselineRaw: number,
  currentRaw: number,
  baselinePercent: number,
  currentPercent: number,
  customConfig?: CustomOutcomeMeasureConfig
): McidChangeEvaluation {
  const id = normalizeScaleId(scaleId);
  const spec =
    id === 'custom'
      ? undefined
      : OUTCOME_INSTRUMENTS[id as keyof typeof OUTCOME_INSTRUMENTS];

  const higherIsBetter =
    id === 'custom'
      ? customConfig?.higherIsBetter ?? true
      : spec?.higherIsBetter ?? false;

  const deltaRaw = Number((currentRaw - baselineRaw).toFixed(2));
  const deltaPercent = Math.round(currentPercent - baselinePercent);

  const improved =
    deltaRaw === 0
      ? false
      : higherIsBetter
        ? deltaRaw > 0
        : deltaRaw < 0;

  let mcidThreshold = 0;
  let mcidMet = false;

  if (id === 'custom') {
    mcidThreshold = customConfig?.mcidDelta ?? 0;
    mcidMet = mcidThreshold > 0 && improved && Math.abs(deltaRaw) >= mcidThreshold;
  } else if (spec) {
    if (spec.mcidUnitIsPercent) {
      mcidMet = improved && Math.abs(deltaPercent) >= spec.mcidValue;
    } else {
      mcidMet = improved && Math.abs(deltaRaw) >= spec.mcidValue;
    }
  }

  if (deltaRaw === 0) {
    return {
      deltaPercent,
      deltaRaw,
      improved: false,
      mcidMet: false,
      summaryAr: 'لا يوجد تغيّر عن خط الأساس',
      summaryEn: 'No change from baseline',
    };
  }

  const absRaw = Math.abs(deltaRaw);
  const absPct = Math.abs(deltaPercent);

  if (improved) {
    return {
      deltaPercent,
      deltaRaw,
      improved: true,
      mcidMet,
      summaryAr: mcidMet
        ? `تحسن دال سريرياً (حقق MCID: Δ ${absRaw} / ${absPct}%)`
        : `تحسن عن البداية (Δ ${absRaw} / ${absPct}% — دون عتبة MCID)`,
      summaryEn: mcidMet
        ? `Clinically important improvement (MCID met: Δ ${absRaw} / ${absPct}%)`
        : `Improved vs baseline (Δ ${absRaw} / ${absPct}% — below MCID threshold)`,
    };
  }

  return {
    deltaPercent,
    deltaRaw,
    improved: false,
    mcidMet: false,
    summaryAr: `تراجع عن البداية (Δ ${absRaw} / ${absPct}%)`,
    summaryEn: `Worsened vs baseline (Δ ${absRaw} / ${absPct}%)`,
  };
}

export interface TugPopulationNormEntry {
  profileId:
    | 'older_adult_60_69'
    | 'older_adult_70_79'
    | 'older_adult_80_99'
    | 'community_ambulator'
    | 'neuro_rehab';
  populationAr: string;
  populationEn: string;
  referenceRangeAr: string;
  referenceRangeEn: string;
  clinicalContextAr: string;
  clinicalContextEn: string;
  citation: string;
}

export const TUG_POPULATION_NORMS: TugPopulationNormEntry[] = [
  {
    profileId: 'older_adult_60_69',
    populationAr: 'البالغون الأصحاء (60–69 سنة)',
    populationEn: 'Community Adults (60–69 yrs)',
    referenceRangeAr: 'متوسط مرجعي 8.1 ث (نطاق ثقة 95%: 7.1–9.0 ث)',
    referenceRangeEn: 'Mean 8.1 s (95% CI: 7.1–9.0 s)',
    clinicalContextAr: 'قيم مرجعية للمشي المستقل في المجتمع بدون إعاقة حركية.',
    clinicalContextEn: 'Normative benchmark for independently ambulating 60–69y adults.',
    citation: 'Bohannon RW. J Geriatr Phys Ther. 2006;29(2):64-68.',
  },
  {
    profileId: 'older_adult_70_79',
    populationAr: 'البالغون الأصحاء (70–79 سنة)',
    populationEn: 'Community Adults (70–79 yrs)',
    referenceRangeAr: 'متوسط مرجعي 9.2 ث (نطاق ثقة 95%: 8.2–10.2 ث)',
    referenceRangeEn: 'Mean 9.2 s (95% CI: 8.2–10.2 s)',
    clinicalContextAr: 'تقييم التنقل المجتمعي مقارنة بالأقران في الفئة العمرية نفسها.',
    clinicalContextEn: 'Normative mobility range for independently ambulating 70–79y adults.',
    citation: 'Bohannon RW. J Geriatr Phys Ther. 2006;29(2):64-68.',
  },
  {
    profileId: 'older_adult_80_99',
    populationAr: 'كبار السن الأصحاء (80–99 سنة)',
    populationEn: 'Community Older Adults (80–99 yrs)',
    referenceRangeAr: 'متوسط مرجعي 11.3 ث (نطاق ثقة 95%: 10.0–12.7 ث)',
    referenceRangeEn: 'Mean 11.3 s (95% CI: 10.0–12.7 s)',
    clinicalContextAr: 'الارتفاع الفسيولوجي بالزمن لا يُعد مرضياً بحد ذاته دون ارتباط سريري.',
    clinicalContextEn: 'Higher healthy normative range with age; interpret alongside balance exam.',
    citation: 'Bohannon RW. J Geriatr Phys Ther. 2006;29(2):64-68.',
  },
  {
    profileId: 'community_ambulator',
    populationAr: 'تقييم التوازن المجتمعي العام (متعدد العوامل)',
    populationEn: 'Community Mobility Screening (Multifactorial)',
    referenceRangeAr: 'العتبة التقليدية 13.5 ث (تنوع تشخيصي محدود منفرداً)',
    referenceRangeEn: 'Historical 13.5 s benchmark (limited standalone rule-in accuracy)',
    clinicalContextAr: 'أظهرت المراجعة المنهجية أنه لا يغني عن تقييم التوازن والأدوية والتاريخ المرضي.',
    clinicalContextEn: 'Systematic review indicates 13.5 s alone has limited predictive value; combine with multifactorial assessment.',
    citation: 'Shumway-Cook et al. Phys Ther 2000; Barry et al. BMC Geriatr 2014;14:14.',
  },
  {
    profileId: 'neuro_rehab',
    populationAr: 'البالغون الضعفاء / التأهيل العصبي أو بعد الجلطة',
    populationEn: 'Frail Older Adults / Neurological Rehab',
    referenceRangeAr: 'نطاق الاستقلال الأساسي ≈ 10–20 ث؛ > 20–30 ث يرتبط بحاجة لمساعدة بالتنقل',
    referenceRangeEn: 'Typical functional bracket ≈ 10–20 s; > 20–30 s often accompanies mobility assistance needs',
    clinicalContextAr: 'العتبات المرصودة تعتمد على التشخيص واستخدام أدوات المساعدة ويجب متابعة التغير مقارنة بخط الأساس (MDC ≈ 2.9 ث بعد السكتة).',
    clinicalContextEn: 'Thresholds vary with diagnosis and assistive device; track longitudinal change vs baseline (stroke MDC ≈ 2.9 s).',
    citation: 'Podsiadlo & Richardson. JAGS 1991; Flansbjer et al. J Rehabil Med 2005.',
  },
];
