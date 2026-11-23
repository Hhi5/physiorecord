// =======================================================================
// PhysioRecord — Procedural Functional Performance-Test Library (Phase B5)
// Original procedure descriptions, units, formulas, citations, and age/sex
// reference tables. ALL clinical thresholds are explicitly marked as
// "needs_expert_verification" until reviewed by a senior clinician.
// =======================================================================

import type { PerformanceTestId } from '../../types/clinicManagement';

export type ExpertVerificationStatus = 'needs_expert_verification' | 'verified';

export interface PerformanceTestDefinition {
  id: PerformanceTestId;
  code: string;
  nameAr: string;
  nameCkb: string;
  nameEn: string;
  unit: string;
  procedureSummaryAr: string;
  procedureSummaryEn: string;
  formulaDescription: string;
  citation: string;
  referenceThresholdsNoteAr: string;
  referenceThresholdsNoteEn: string;
  verificationStatus: ExpertVerificationStatus;
}

export interface GripStrengthNormBand {
  ageRange: string;
  minAge: number;
  maxAge: number;
  maleRightMeanKg: number;
  maleRightSdKg: number;
  maleLeftMeanKg: number;
  maleLeftSdKg: number;
  femaleRightMeanKg: number;
  femaleRightSdKg: number;
  femaleLeftMeanKg: number;
  femaleLeftSdKg: number;
}

export interface ChairStand30sNormBand {
  ageRange: string;
  minAge: number;
  maxAge: number;
  maleMinExpectedReps: number;
  femaleMinExpectedReps: number;
}

/**
 * Hand Grip Strength adult reference means (kg) synthesized from published
 * Jamar dynamometry cohorts (Mathiowetz et al., Arch Phys Med Rehabil 1985).
 * Marked `needs_expert_verification` for local Iraqi clinic population adaptation.
 */
export const GRIP_STRENGTH_NORMS_KG: GripStrengthNormBand[] = [
  {
    ageRange: '20–29',
    minAge: 20,
    maxAge: 29,
    maleRightMeanKg: 54.0,
    maleRightSdKg: 9.5,
    maleLeftMeanKg: 47.4,
    maleLeftSdKg: 9.2,
    femaleRightMeanKg: 31.6,
    femaleRightSdKg: 5.9,
    femaleLeftMeanKg: 27.9,
    femaleLeftSdKg: 5.5,
  },
  {
    ageRange: '30–39',
    minAge: 30,
    maxAge: 39,
    maleRightMeanKg: 54.3,
    maleRightSdKg: 9.7,
    maleLeftMeanKg: 49.0,
    maleLeftSdKg: 9.5,
    femaleRightMeanKg: 32.1,
    femaleRightSdKg: 6.4,
    femaleLeftMeanKg: 28.4,
    femaleLeftSdKg: 5.6,
  },
  {
    ageRange: '40–49',
    minAge: 40,
    maxAge: 49,
    maleRightMeanKg: 49.9,
    maleRightSdKg: 9.4,
    maleLeftMeanKg: 46.1,
    maleLeftSdKg: 9.1,
    femaleRightMeanKg: 30.0,
    femaleRightSdKg: 6.0,
    femaleLeftMeanKg: 26.8,
    femaleLeftSdKg: 5.8,
  },
  {
    ageRange: '50–59',
    minAge: 50,
    maxAge: 59,
    maleRightMeanKg: 45.9,
    maleRightSdKg: 9.0,
    maleLeftMeanKg: 41.2,
    maleLeftSdKg: 8.6,
    femaleRightMeanKg: 27.6,
    femaleRightSdKg: 5.6,
    femaleLeftMeanKg: 24.4,
    femaleLeftSdKg: 5.2,
  },
  {
    ageRange: '60–69',
    minAge: 60,
    maxAge: 69,
    maleRightMeanKg: 40.7,
    maleRightSdKg: 8.4,
    maleLeftMeanKg: 36.2,
    maleLeftSdKg: 8.0,
    femaleRightMeanKg: 24.1,
    femaleRightSdKg: 5.0,
    femaleLeftMeanKg: 21.1,
    femaleLeftSdKg: 4.8,
  },
  {
    ageRange: '70+',
    minAge: 70,
    maxAge: 120,
    maleRightMeanKg: 32.0,
    maleRightSdKg: 7.5,
    maleLeftMeanKg: 27.9,
    maleLeftSdKg: 7.0,
    femaleRightMeanKg: 19.5,
    femaleRightSdKg: 4.6,
    femaleLeftMeanKg: 17.5,
    femaleLeftSdKg: 4.3,
  },
];

/**
 * Below-average fall-risk cutoffs for 30-second Chair Stand Test
 * (Jones & Rikli / CDC STEADI older adult guidance).
 */
export const CHAIR_STAND_30S_CUTOFFS: ChairStand30sNormBand[] = [
  { ageRange: '60–64', minAge: 60, maxAge: 64, maleMinExpectedReps: 14, femaleMinExpectedReps: 12 },
  { ageRange: '65–69', minAge: 65, maxAge: 69, maleMinExpectedReps: 12, femaleMinExpectedReps: 11 },
  { ageRange: '70–74', minAge: 70, maxAge: 74, maleMinExpectedReps: 12, femaleMinExpectedReps: 10 },
  { ageRange: '75–79', minAge: 75, maxAge: 79, maleMinExpectedReps: 11, femaleMinExpectedReps: 10 },
  { ageRange: '80–84', minAge: 80, maxAge: 84, maleMinExpectedReps: 10, femaleMinExpectedReps: 9 },
  { ageRange: '85–89', minAge: 85, maxAge: 89, maleMinExpectedReps: 8, femaleMinExpectedReps: 8 },
  { ageRange: '90+', minAge: 90, maxAge: 120, maleMinExpectedReps: 7, femaleMinExpectedReps: 4 },
];

export const PERFORMANCE_TESTS_CATALOG: PerformanceTestDefinition[] = [
  {
    id: 'lsi',
    code: 'LSI',
    nameAr: 'مؤشر التناظر الطرفي (Limb Symmetry Index)',
    nameCkb: 'پێوەری هاوسەنگی پەل (LSI)',
    nameEn: 'Limb Symmetry Index (LSI)',
    unit: '%',
    procedureSummaryAr:
      'قارن أفضل قراءة للطرف المصاب مع أفضل قراءة للطرف السليم (مثل القفز لمسافة أو قوة العضلة الرباعية).',
    procedureSummaryEn:
      'Compare involved-limb best trial (hop distance, triple hop, or dynamometer torque) against uninvolved limb.',
    formulaDescription: '(Involved / Uninvolved) × 100%',
    citation: 'Noyes et al., Am J Sports Med 1991; Kyritsis et al., Br J Sports Med 2016',
    referenceThresholdsNoteAr:
      'العتبة الشائعة للعودة للرياضة ≥ 90% (تتطلب مراجعة ومصادقة المختص وفق نوع الجراحة).',
    referenceThresholdsNoteEn:
      'Common return-to-sport reference benchmark ≥ 90% (needs expert verification per graft/sport).',
    verificationStatus: 'needs_expert_verification',
  },
  {
    id: 'walk_10m',
    code: '10MWT',
    nameAr: 'اختبار المشي لعشرة أمتار (10MWT)',
    nameCkb: 'تاقیکردنەوەی ڕۆیشتنی ١٠ مەتر',
    nameEn: '10-Meter Walk Test (10MWT)',
    unit: 'm/s',
    procedureSummaryAr:
      'يمشي المريض 10 أمتار إجمالاً مع احتساب الوقت للمسافة الوسطية (عادة 6 أمتار بين العلامتين 2م و8م) بالسرعة المريحة أو القصوى.',
    procedureSummaryEn:
      'Patient walks 10 meters; stopwatch times middle timed distance (commonly middle 6 m to exclude acceleration/deceleration).',
    formulaDescription: 'Timed Distance (m) / Time (s) → Gait Speed (m/s)',
    citation: 'Watson, Phys Ther Rev 2002; Perera et al., J Am Geriatr Soc 2006 (MCID ≈ 0.05–0.13 m/s)',
    referenceThresholdsNoteAr:
      'السرعة < 0.8 م/ث قد ترتبط بمحدودية المشي المجتمعي؛ تغيّر ≥ 0.13 م/ث ذو دلالة (يتطلب مراجعة مختص).',
    referenceThresholdsNoteEn:
      '< 0.8 m/s often associated with limited community ambulation; substantial change ≥ 0.13 m/s (needs expert verification).',
    verificationStatus: 'needs_expert_verification',
  },
  {
    id: 'walk_6m',
    code: '6MWT',
    nameAr: 'اختبار المشي لمدة 6 دقائق (6MWT)',
    nameCkb: 'تاقیکردنەوەی ڕۆیشتنی ٦ خولەک',
    nameEn: '6-Minute Walk Test (6MWT)',
    unit: 'm',
    procedureSummaryAr:
      'يسجل إجمالي المسافة التي يقطعها المريض مشياً على ممر مستوٍ بطول قياسي (مثلاً 30 متراً) خلال 6 دقائق مع مراقبة الأكسجة والنبض.',
    procedureSummaryEn:
      'Measure total distance walked along a flat marked corridor in 6 minutes while monitoring SpO2, HR, and perceived exertion.',
    formulaDescription: 'Total Distance Walked in 6 Minutes (meters)',
    citation: 'ATS Statement, Am J Respir Crit Care Med 2002; Holland et al., Eur Respir J 2014',
    referenceThresholdsNoteAr:
      'الحد الأدنى للتغير السريري الملحوظ يشار إليه غالباً بين 30–54 متراً حسب الحالة (يتطلب مراجعة مختص).',
    referenceThresholdsNoteEn:
      'Cited MCID typically 30–54 m depending on cardiopulmonary/neuro cohort (needs expert verification).',
    verificationStatus: 'needs_expert_verification',
  },
  {
    id: 'single_leg_stance',
    code: 'SLS',
    nameAr: 'اختبار الوقوف على ساق واحدة (Single-Leg Stance)',
    nameCkb: 'تاقیکردنەوەی وەستان لەسەر یەک قاچ',
    nameEn: 'Single-Leg Stance (SLS)',
    unit: 's',
    procedureSummaryAr:
      'يقف المريض حافي القدمين بأيدٍ متقاطعة على الصدر على ساق واحدة (أعين مفتوحة أو مغلقة) ويُوقف المؤقت عند لمس الأرض أو فك الذراعين.',
    procedureSummaryEn:
      'Stand unassisted on one leg with arms crossed; stop timing (cap 30s or 45s) if opposite foot touches floor or arms uncross.',
    formulaDescription: 'Balance Hold Time (seconds)',
    citation: 'Springer et al., J Geriatr Phys Ther 2007; CDC STEADI Balance Screening',
    referenceThresholdsNoteAr:
      'القدرة < 5 ثوانٍ بعيون مفتوحة لدى كبار السن قد تشير لخطر سقوط مرتفع (يتطلب مراجعة مختص).',
    referenceThresholdsNoteEn:
      'Eyes-open hold < 5s in older adults flagged as elevated fall-risk screen (needs expert verification).',
    verificationStatus: 'needs_expert_verification',
  },
  {
    id: 'chair_stand_30s',
    code: '30s-CST',
    nameAr: 'اختبار القيام من الكرسي خلال 30 ثانية (30s-CST)',
    nameCkb: 'هەستانەوە لەسەر کورسی لە ٣٠ چرکەدا',
    nameEn: '30-Second Chair Stand Test (30s-CST)',
    unit: 'reps',
    procedureSummaryAr:
      'عدد مرات الوقوف الكامل والجلوس من كرسي بارتفاع قياسي (~43 سم) بذراعين متقاطعين على الصدر خلال 30 ثانية.',
    procedureSummaryEn:
      'Count full stand-to-sit repetitions completed in 30 seconds from an armless ~43 cm chair with arms folded.',
    formulaDescription: 'Full Stand Repetitions in 30 Seconds',
    citation: 'Jones et al., Res Q Exerc Sport 1999; CDC STEADI Assessment Protocol',
    referenceThresholdsNoteAr:
      'تقارن النتيجة بجدول العمر والجنس أدناه لتقدير خطورة السقوط (يتطلب مراجعة مختص).',
    referenceThresholdsNoteEn:
      'Compare repetitions against age/sex cutoff table (needs expert verification).',
    verificationStatus: 'needs_expert_verification',
  },
  {
    id: 'five_x_sts',
    code: '5xSTS',
    nameAr: 'اختبار الجلوس والقيام 5 مرات (5xSTS)',
    nameCkb: '٥ جار دانیشتن و هەستانەوە',
    nameEn: '5-Time Sit-to-Stand Test (5xSTS)',
    unit: 's',
    procedureSummaryAr:
      'الوقت اللازم بالثواني لإتمام 5 وقفات كاملة بأسرع ما يمكن بأمان دون استخدام اليدين.',
    procedureSummaryEn:
      'Stopwatch seconds required to stand fully and return 5 consecutive times safely without arm push-off.',
    formulaDescription: 'Elapsed Time for 5 Full Stands (seconds)',
    citation: 'Whitney et al., Phys Ther 2005; Bohannon, Isokinet Exerc Sci 2006',
    referenceThresholdsNoteAr:
      'زمن > 12 ثانية لدى كبار السن يشار إليه كإشارة فحص لمخاطر السقوط أو ضعف الطرف السفلي (يتطلب مراجعة مختص).',
    referenceThresholdsNoteEn:
      '> 12 seconds often cited for fall/mobility risk screening in older adults (needs expert verification).',
    verificationStatus: 'needs_expert_verification',
  },
  {
    id: 'grip_strength',
    code: 'Grip',
    nameAr: 'قوة قبضة اليد بالديناموميتر (Grip Strength)',
    nameCkb: 'هێزی گرتنی دەست',
    nameEn: 'Hand Grip Strength (Dynamometry)',
    unit: 'kg',
    procedureSummaryAr:
      'الجلوس مع ثني المرفق 90 درجة وساعد محايد (الوضع القياسي لـ ASHT) وأخذ متوسط أو أعلى 3 محاولات بالكيلوغرام لليد اليمنى واليسرى.',
    procedureSummaryEn:
      'Seated, shoulder adducted, elbow flexed 90°, forearm neutral (ASHT position); record best/mean of 3 trials (kg) R & L.',
    formulaDescription: 'Force (kg) + Laterality Symmetry + Age/Sex Reference Band',
    citation: 'Mathiowetz et al., Arch Phys Med Rehabil 1985; Roberts et al., Age Ageing 2011 (EWGSOP)',
    referenceThresholdsNoteAr:
      'قيم مرجعية أولية لـ EWGSOP (< 27 كغم رجال / < 16 كغم نساء لضعف القبضة) وجدول Mathiowetz تتطلب مراجعة مختص.',
    referenceThresholdsNoteEn:
      'Reference bands (e.g., EWGSOP2 screening < 27 kg men / < 16 kg women) and Mathiowetz means require expert verification.',
    verificationStatus: 'needs_expert_verification',
  },
];

export function computePerformanceTestResult(params: {
  testId: PerformanceTestId;
  inputs: Record<string, number | string>;
  age?: number;
  gender?: 'male' | 'female' | 'other';
}): {
  computedValue: number;
  unit: string;
  interpretationAr: string;
  interpretationEn: string;
} {
  const num = (k: string, fallback = 0): number => {
    const v = Number(params.inputs[k]);
    return Number.isFinite(v) ? v : fallback;
  };

  switch (params.testId) {
    case 'lsi': {
      const involved = num('involved');
      const uninvolved = num('uninvolved');
      const lsi = uninvolved > 0 ? Number(((involved / uninvolved) * 100).toFixed(1)) : 0;
      const meetsRef = lsi >= 90;
      return {
        computedValue: lsi,
        unit: '%',
        interpretationAr: meetsRef
          ? `LSI = ${lsi}% (≥ 90% المرجعية — يتطلب مراجعة مختص)`
          : `LSI = ${lsi}% (أقل من 90% المرجعية — يتطلب مراجعة مختص)`,
        interpretationEn: meetsRef
          ? `LSI = ${lsi}% (≥ 90% ref benchmark — needs expert verification)`
          : `LSI = ${lsi}% (< 90% ref benchmark — needs expert verification)`,
      };
    }

    case 'walk_10m': {
      const distance = Math.max(1, num('distanceMeters', 6));
      const timeSec = num('timeSeconds');
      const speed = timeSec > 0 ? Number((distance / timeSec).toFixed(2)) : 0;
      return {
        computedValue: speed,
        unit: 'm/s',
        interpretationAr:
          speed >= 0.8
            ? `سرعة المشي ${speed} م/ث (≥ 0.8 م/ث — يتطلب مراجعة مختص)`
            : `سرعة المشي ${speed} م/ث (< 0.8 م/ث مؤشر سريري — يتطلب مراجعة مختص)`,
        interpretationEn:
          speed >= 0.8
            ? `Gait speed ${speed} m/s (≥ 0.8 m/s — needs expert verification)`
            : `Gait speed ${speed} m/s (< 0.8 m/s screen — needs expert verification)`,
      };
    }

    case 'walk_6m': {
      const dist = Number(num('distanceMeters').toFixed(1));
      return {
        computedValue: dist,
        unit: 'm',
        interpretationAr: `مسافة 6 دقائق: ${dist} متر (تتطلب مقارنة فردية ومراجعة مختص)`,
        interpretationEn: `6MWT distance: ${dist} m (compare longitudinally — needs expert verification)`,
      };
    }

    case 'single_leg_stance': {
      const sec = Number(num('seconds').toFixed(1));
      return {
        computedValue: sec,
        unit: 's',
        interpretationAr:
          sec < 5
            ? `ثبات ساق واحدة ${sec} ث (< 5 ث مؤشر خطر سقوط — يتطلب مراجعة مختص)`
            : `ثبات ساق واحدة ${sec} ث (يتطلب مراجعة مختص)`,
        interpretationEn:
          sec < 5
            ? `SLS hold ${sec} s (< 5s screen flag — needs expert verification)`
            : `SLS hold ${sec} s (needs expert verification)`,
      };
    }

    case 'chair_stand_30s': {
      const reps = Math.max(0, Math.round(num('reps')));
      const { age } = params;
      const band =
        age !== undefined
          ? CHAIR_STAND_30S_CUTOFFS.find(
              (bandEntry) => age >= bandEntry.minAge && age <= bandEntry.maxAge
            )
          : undefined;
      const expected = band
        ? params.gender === 'female'
          ? band.femaleMinExpectedReps
          : band.maleMinExpectedReps
        : undefined;
      const below = expected !== undefined && reps < expected;
      return {
        computedValue: reps,
        unit: 'reps',
        interpretationAr:
          band && expected !== undefined
            ? below
              ? `${reps} تكرار (أقل من الحد المرجعي ${expected} لعمر ${band.ageRange} — يتطلب مراجعة مختص)`
              : `${reps} تكرار (ضمن/فوق المرجع ${expected} لعمر ${band.ageRange} — يتطلب مراجعة مختص)`
            : `${reps} تكرار في 30 ثانية (يتطلب مراجعة مختص)`,
        interpretationEn:
          band && expected !== undefined
            ? below
              ? `${reps} reps (< ${expected} STEADI ref for age ${band.ageRange} — needs expert verification)`
              : `${reps} reps (≥ ${expected} STEADI ref for age ${band.ageRange} — needs expert verification)`
            : `${reps} reps in 30s (needs expert verification)`,
      };
    }

    case 'five_x_sts': {
      const sec = Number(num('seconds').toFixed(1));
      return {
        computedValue: sec,
        unit: 's',
        interpretationAr:
          sec > 12
            ? `زمن 5xSTS = ${sec} ث (> 12 ث مؤشر فحص — يتطلب مراجعة مختص)`
            : `زمن 5xSTS = ${sec} ث (يتطلب مراجعة مختص)`,
        interpretationEn:
          sec > 12
            ? `5xSTS = ${sec} s (> 12s screen threshold — needs expert verification)`
            : `5xSTS = ${sec} s (needs expert verification)`,
      };
    }

    case 'grip_strength': {
      const rightKg = num('rightKg');
      const leftKg = num('leftKg');
      const peak = Number(Math.max(rightKg, leftKg).toFixed(1));
      const { age } = params;
      const band =
        age !== undefined
          ? GRIP_STRENGTH_NORMS_KG.find(
              (bandEntry) => age >= bandEntry.minAge && age <= bandEntry.maxAge
            )
          : undefined;
      const refMean = band
        ? params.gender === 'female'
          ? band.femaleRightMeanKg
          : band.maleRightMeanKg
        : undefined;
      return {
        computedValue: peak,
        unit: 'kg',
        interpretationAr:
          band && refMean !== undefined
            ? `القبضة العليا ${peak} كغم (متوسط عمر ${band.ageRange}: ~${refMean} كغم — يتطلب مراجعة مختص)`
            : `القبضة يمين ${rightKg} / يسار ${leftKg} كغم (يتطلب مراجعة مختص)`,
        interpretationEn:
          band && refMean !== undefined
            ? `Peak grip ${peak} kg (age ${band.ageRange} ref mean ~${refMean} kg — needs expert verification)`
            : `Grip R ${rightKg} / L ${leftKg} kg (needs expert verification)`,
      };
    }

    default: {
      const exhaustiveCheck: never = params.testId;
      throw new Error(`Unsupported performance test: ${String(exhaustiveCheck)}`);
    }
  }
}
