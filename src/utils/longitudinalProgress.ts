// =======================================================================
// PhysioRecord — Longitudinal Clinical Progress Calculations & Exporters
// Pure offline clinical math for NPRS, ROM, MMT, Outcome Scales, Special
// Tests, Performance Tests, CSV export (RFC-4180), and bilingual summaries.
// =======================================================================

import { PERFORMANCE_TESTS_CATALOG } from '../data/clinicalToolkit/performanceTestsCatalog';
import {
  resolveLongitudinalMmtGroupKey,
  resolveLongitudinalRomGroupKey,
} from '../data/clinicalToolkit/canonicalKeysCatalog';
import type {
  CustomOutcomeMeasureConfig,
  ValidatedScaleId,
} from '../types/clinicalWidgets';
import type {
  ClinicalAssessmentSnapshot,
  EpisodeScopedClinicalStore,
  PerformanceTestId,
  PerformanceTestResultEntry,
} from '../types/clinicManagement';
import { buildCsvDocument } from './csvExport';
import { formatDateDDMMYYYY } from './date';
import { evaluateBaselineChange } from './outcomeMeasures';

export type DeltaDirection = 'improved' | 'worsened' | 'unchanged';

export interface PainDeltaResult {
  /** Signed difference (to - from). Negative means pain decreased (improved). */
  signedChange: number;
  /** Positive reduction amount (from - to). */
  reduction: number;
  direction: DeltaDirection;
  mcidMet: boolean;
  formatted: string;
}

export interface RomDeltaResult {
  signedChange: number;
  direction: DeltaDirection;
  formatted: string;
}

export interface MmtDeltaResult {
  numericDelta: number | null;
  direction: DeltaDirection;
  formatted: string;
}

export interface PerformanceTestProgressRow {
  testId: PerformanceTestId;
  code: string;
  nameAr: string;
  nameEn: string;
  nameCkb: string;
  unit: string;
  firstValue: number;
  firstDate: string;
  latestValue: number;
  latestDate: string;
  count: number;
  signedChange: number;
  direction: DeltaDirection;
  formattedDelta: string;
}

const MMT_GRADE_NUMERIC_MAP: Record<string, number> = {
  '0': 0,
  '1': 1,
  '1+': 1.3,
  '2-': 1.7,
  '2': 2,
  '2+': 2.3,
  '3-': 2.7,
  '3': 3,
  '3+': 3.3,
  '4-': 3.7,
  '4': 4,
  '4+': 4.3,
  '5-': 4.7,
  '5': 5,
};

/**
 * Converts standard Oxford / Kendall MMT grade strings (0..5 with +/- modifiers)
 * into a monotonic numeric value for accurate longitudinal comparison.
 */
export function parseMmtGradeNumeric(grade: string | null | undefined): number | null {
  if (!grade) return null;
  const cleaned = String(grade)
    .trim()
    .replace(/\/5$/i, '')
    .replace(/\s+/g, '');
  if (cleaned in MMT_GRADE_NUMERIC_MAP) {
    return MMT_GRADE_NUMERIC_MAP[cleaned];
  }
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) && num >= 0 && num <= 5 ? num : null;
}

export function computePainDelta(
  fromPain: number | null | undefined,
  toPain: number | null | undefined
): PainDeltaResult | null {
  if (
    typeof fromPain !== 'number' ||
    !Number.isFinite(fromPain) ||
    typeof toPain !== 'number' ||
    !Number.isFinite(toPain)
  ) {
    return null;
  }
  const signedChange = Number((toPain - fromPain).toFixed(1));
  const reduction = Number((fromPain - toPain).toFixed(1));
  const direction: DeltaDirection =
    signedChange < 0 ? 'improved' : signedChange > 0 ? 'worsened' : 'unchanged';
  const mcidMet = reduction >= 2;
  const formatted =
    signedChange < 0
      ? `\u2212${Math.abs(signedChange)} pts`
      : signedChange > 0
        ? `+${signedChange} pts`
        : '0 pts';

  return { signedChange, reduction, direction, mcidMet, formatted };
}

export function computeRomDelta(
  fromDeg: number | null | undefined,
  toDeg: number | null | undefined
): RomDeltaResult | null {
  if (
    typeof fromDeg !== 'number' ||
    !Number.isFinite(fromDeg) ||
    typeof toDeg !== 'number' ||
    !Number.isFinite(toDeg)
  ) {
    return null;
  }
  const signedChange = Math.round(toDeg - fromDeg);
  const direction: DeltaDirection =
    signedChange > 0 ? 'improved' : signedChange < 0 ? 'worsened' : 'unchanged';
  const formatted =
    signedChange > 0
      ? `+${signedChange}°`
      : signedChange < 0
        ? `\u2212${Math.abs(signedChange)}°`
        : '0°';

  return { signedChange, direction, formatted };
}

export function computeMmtDelta(
  fromGrade: string | null | undefined,
  toGrade: string | null | undefined
): MmtDeltaResult | null {
  if (!fromGrade || !toGrade) return null;
  const fromNum = parseMmtGradeNumeric(fromGrade);
  const toNum = parseMmtGradeNumeric(toGrade);
  const numericDelta =
    fromNum !== null && toNum !== null ? Number((toNum - fromNum).toFixed(2)) : null;

  let direction: DeltaDirection = 'unchanged';
  if (numericDelta !== null) {
    if (numericDelta > 0) direction = 'improved';
    else if (numericDelta < 0) direction = 'worsened';
  } else if (fromGrade !== toGrade) {
    direction = 'unchanged';
  }

  return {
    numericDelta,
    direction,
    formatted: `${fromGrade} → ${toGrade}/5`,
  };
}

export function computeSpecialTestsDelta(
  fromPositiveCount: number | null | undefined,
  toPositiveCount: number | null | undefined
): { signedChange: number; direction: DeltaDirection; formatted: string } | null {
  if (
    typeof fromPositiveCount !== 'number' ||
    !Number.isFinite(fromPositiveCount) ||
    typeof toPositiveCount !== 'number' ||
    !Number.isFinite(toPositiveCount)
  ) {
    return null;
  }
  const signedChange = toPositiveCount - fromPositiveCount;
  // Fewer positive provocative tests = clinical improvement
  const direction: DeltaDirection =
    signedChange < 0 ? 'improved' : signedChange > 0 ? 'worsened' : 'unchanged';
  const formatted =
    signedChange < 0
      ? `\u2212${Math.abs(signedChange)}`
      : signedChange > 0
        ? `+${signedChange}`
        : '0';

  return { signedChange, direction, formatted };
}

const LOWER_IS_BETTER_PERFORMANCE_TESTS = new Set<PerformanceTestId>(['five_x_sts']);

/**
 * Summarizes longitudinal progression for each recorded functional performance test
 * (comparing the earliest recorded trial to the most recent recorded trial).
 */
export function computePerformanceTestProgress(
  tests: PerformanceTestResultEntry[] | undefined
): PerformanceTestProgressRow[] {
  if (!tests || tests.length === 0) return [];

  const grouped = new Map<PerformanceTestId, PerformanceTestResultEntry[]>();
  for (const entry of tests) {
    if (!Number.isFinite(entry.computedValue)) continue;
    const list = grouped.get(entry.testId) || [];
    list.push(entry);
    grouped.set(entry.testId, list);
  }

  const rows: PerformanceTestProgressRow[] = [];
  for (const [testId, entries] of grouped.entries()) {
    const sorted = [...entries].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
    const first = sorted[0];
    const latest = sorted[sorted.length - 1];
    const def = PERFORMANCE_TESTS_CATALOG.find((t) => t.id === testId);
    const signedChange = Number((latest.computedValue - first.computedValue).toFixed(2));
    const lowerIsBetter = LOWER_IS_BETTER_PERFORMANCE_TESTS.has(testId);

    let direction: DeltaDirection = 'unchanged';
    if (signedChange !== 0) {
      direction = (lowerIsBetter ? signedChange < 0 : signedChange > 0)
        ? 'improved'
        : 'worsened';
    }

    const formattedDelta =
      sorted.length < 2
        ? '—'
        : signedChange > 0
          ? `+${signedChange} ${latest.unit || def?.unit || ''}`.trim()
          : signedChange < 0
            ? `\u2212${Math.abs(signedChange)} ${latest.unit || def?.unit || ''}`.trim()
            : `0 ${latest.unit || def?.unit || ''}`.trim();

    rows.push({
      testId,
      code: def?.code || testId.toUpperCase(),
      nameAr: def?.nameAr || testId,
      nameEn: def?.nameEn || testId,
      nameCkb: def?.nameCkb || def?.nameAr || testId,
      unit: latest.unit || def?.unit || '',
      firstValue: first.computedValue,
      firstDate: first.recordedAt,
      latestValue: latest.computedValue,
      latestDate: latest.recordedAt,
      count: sorted.length,
      signedChange,
      direction,
      formattedDelta,
    });
  }

  return rows;
}

export interface ComparisonPointData {
  id: string;
  labelAr: string;
  labelEn: string;
  date: string;
  painRest: number;
  painActivity: number;
  outcomeScale?: ClinicalAssessmentSnapshot['outcomeScale'];
  specialTestsPositiveCount: number;
  romByKey: Map<string, number>;
  mmtByKey: Map<string, string>;
}

/**
 * Normalizes either a historical ClinicalAssessmentSnapshot or the live EpisodeScopedClinicalStore
 * into a uniform ComparisonPointData object so any two timepoints can be compared cleanly.
 */
export function buildComparisonPointFromSnapshot(
  snap: ClinicalAssessmentSnapshot,
  isBaseline: boolean
): ComparisonPointData {
  const romByKey = new Map<string, number>();
  for (const r of snap.romSummary || []) {
    if (r.aromDegrees !== null && r.aromDegrees !== undefined) {
      romByKey.set(resolveLongitudinalRomGroupKey(r), r.aromDegrees);
    }
  }
  const mmtByKey = new Map<string, string>();
  for (const m of snap.mmtSummary || []) {
    if (m.grade) {
      mmtByKey.set(resolveLongitudinalMmtGroupKey(m), m.grade);
    }
  }
  return {
    id: snap.id,
    labelAr: isBaseline ? 'خط الأساس (Baseline)' : snap.labelAr,
    labelEn: isBaseline ? 'Baseline' : snap.labelEn,
    date: snap.recordedDate,
    painRest: snap.painNrsRest,
    painActivity: snap.painNrsActivity,
    outcomeScale: snap.outcomeScale,
    specialTestsPositiveCount: snap.specialTestsPositiveCount ?? 0,
    romByKey,
    mmtByKey,
  };
}

export function buildComparisonPointFromLiveStore(
  store: EpisodeScopedClinicalStore
): ComparisonPointData {
  const romByKey = new Map<string, number>();
  for (const r of store.objective?.romBattery?.entries || []) {
    if (r.isTested && r.measuredAngleDegrees !== null) {
      const key = resolveLongitudinalRomGroupKey({
        canonicalKey: r.canonicalKey,
        jointMovementKey: `${r.jointId}_${r.movementId}_${r.laterality}`,
        laterality: r.laterality,
      });
      romByKey.set(key, r.measuredAngleDegrees);
    }
  }

  const mmtByKey = new Map<string, string>();
  for (const m of store.objective?.mmtBattery?.entries || []) {
    if (m.isTested && m.gradeValue !== null) {
      const key = resolveLongitudinalMmtGroupKey({
        canonicalKey: m.canonicalKey,
        muscleKey: `${m.muscleGroupId}_${m.laterality}`,
        label: m.label || m.muscleNameEn || m.muscleNameAr,
        laterality: m.laterality,
      });
      mmtByKey.set(key, m.gradeValue);
    }
  }

  const positiveSpecialTests = (store.specialTests || []).filter(
    (t) => t.outcome === 'positive' || t.outcome === 'pain_reproduced'
  ).length;

  return {
    id: '__current__',
    labelAr: 'الحالي (Current)',
    labelEn: 'Current',
    date: store.updatedAt ? store.updatedAt.slice(0, 10) : '',
    painRest: store.painAtRestNrs ?? 0,
    painActivity: store.painOnActivityNrs ?? 0,
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
    specialTestsPositiveCount: positiveSpecialTests,
    romByKey,
    mmtByKey,
  };
}

export function buildLongitudinalSummaryText(params: {
  language: 'ar' | 'en' | 'ckb';
  patientName?: string;
  episodeTitle: string;
  fromPoint: ComparisonPointData;
  toPoint: ComparisonPointData;
  romRows: Array<{ label: string; fromVal?: number; toVal?: number }>;
  mmtRows: Array<{ label: string; fromVal?: string; toVal?: string }>;
  performanceRows: PerformanceTestProgressRow[];
  goalsAchieved: number;
  goalsTotal: number;
  customMeasureConfig?: CustomOutcomeMeasureConfig;
}): string {
  const {
    language,
    patientName,
    episodeTitle,
    fromPoint,
    toPoint,
    romRows,
    mmtRows,
    performanceRows,
    goalsAchieved,
    goalsTotal,
    customMeasureConfig,
  } = params;
  const isEn = language === 'en';
  const lines: string[] = [];

  if (isEn) {
    lines.push(`Clinical Progress Summary — ${episodeTitle}`);
    if (patientName) lines.push(`Patient: ${patientName}`);
    lines.push(
      `Comparison: ${fromPoint.labelEn}${fromPoint.date ? ` (${formatDateDDMMYYYY(fromPoint.date)})` : ''} → ${toPoint.labelEn}${toPoint.date ? ` (${formatDateDDMMYYYY(toPoint.date)})` : ''}`
    );
    lines.push('');

    const restDelta = computePainDelta(fromPoint.painRest, toPoint.painRest);
    const actDelta = computePainDelta(fromPoint.painActivity, toPoint.painActivity);
    lines.push(
      `• Pain at Rest (NPRS): ${fromPoint.painRest}/10 → ${toPoint.painRest}/10 (${restDelta?.formatted || '0 pts'})`
    );
    lines.push(
      `• Pain on Activity (NPRS): ${fromPoint.painActivity}/10 → ${toPoint.painActivity}/10 (${actDelta?.formatted || '0 pts'}${actDelta?.mcidMet ? ' — MCID met' : ''})`
    );

    if (fromPoint.outcomeScale && toPoint.outcomeScale) {
      const outcomeEval = evaluateBaselineChange(
        toPoint.outcomeScale.scaleId as ValidatedScaleId,
        fromPoint.outcomeScale.rawScore ?? fromPoint.outcomeScale.scorePercentage,
        toPoint.outcomeScale.rawScore ?? toPoint.outcomeScale.scorePercentage,
        fromPoint.outcomeScale.scorePercentage,
        toPoint.outcomeScale.scorePercentage,
        customMeasureConfig
      );
      lines.push(
        `• Outcome Scale (${toPoint.outcomeScale.scaleId.toUpperCase()}): ${fromPoint.outcomeScale.scorePercentage}% → ${toPoint.outcomeScale.scorePercentage}% (${outcomeEval.summaryEn})`
      );
    }

    lines.push(
      `• Positive Provocative Special Tests: ${fromPoint.specialTestsPositiveCount} → ${toPoint.specialTestsPositiveCount}`
    );

    if (romRows.length > 0) {
      lines.push('');
      lines.push('Range of Motion (ROM):');
      for (const r of romRows) {
        const d = computeRomDelta(r.fromVal, r.toVal);
        lines.push(
          `  - ${r.label}: ${r.fromVal !== undefined ? `${r.fromVal}°` : '—'} → ${r.toVal !== undefined ? `${r.toVal}°` : '—'}${d ? ` (${d.formatted})` : ''}`
        );
      }
    }

    if (mmtRows.length > 0) {
      lines.push('');
      lines.push('Manual Muscle Testing (MMT):');
      for (const m of mmtRows) {
        lines.push(`  - ${m.label}: ${m.fromVal || '—'} → ${m.toVal ? `${m.toVal}/5` : '—'}`);
      }
    }

    if (performanceRows.length > 0) {
      lines.push('');
      lines.push('Functional Performance Tests:');
      for (const p of performanceRows) {
        lines.push(
          `  - ${p.nameEn}: ${p.firstValue} → ${p.latestValue} ${p.unit}${p.count >= 2 ? ` (${p.formattedDelta})` : ''}`
        );
      }
    }

    if (goalsTotal > 0) {
      lines.push('');
      lines.push(`Rehabilitation Goals Achieved: ${goalsAchieved} / ${goalsTotal}`);
    }
  } else {
    lines.push(`ملخص التقدم السريري — ${episodeTitle}`);
    if (patientName) lines.push(`المريض: ${patientName}`);
    lines.push(
      `المقارنة: ${fromPoint.labelAr}${fromPoint.date ? ` (${formatDateDDMMYYYY(fromPoint.date)})` : ''} ← ${toPoint.labelAr}${toPoint.date ? ` (${formatDateDDMMYYYY(toPoint.date)})` : ''}`
    );
    lines.push('');

    const restDelta = computePainDelta(fromPoint.painRest, toPoint.painRest);
    const actDelta = computePainDelta(fromPoint.painActivity, toPoint.painActivity);
    lines.push(
      `• الألم أثناء الراحة (NPRS): ${fromPoint.painRest}/10 ← ${toPoint.painRest}/10 (${restDelta?.formatted || '0 pts'})`
    );
    lines.push(
      `• الألم مع الحركة (NPRS): ${fromPoint.painActivity}/10 ← ${toPoint.painActivity}/10 (${actDelta?.formatted || '0 pts'}${actDelta?.mcidMet ? ' — تحقق تحسن ذو دلالة MCID' : ''})`
    );

    if (fromPoint.outcomeScale && toPoint.outcomeScale) {
      const outcomeEval = evaluateBaselineChange(
        toPoint.outcomeScale.scaleId as ValidatedScaleId,
        fromPoint.outcomeScale.rawScore ?? fromPoint.outcomeScale.scorePercentage,
        toPoint.outcomeScale.rawScore ?? toPoint.outcomeScale.scorePercentage,
        fromPoint.outcomeScale.scorePercentage,
        toPoint.outcomeScale.scorePercentage,
        customMeasureConfig
      );
      lines.push(
        `• المقياس الوظيفي (${toPoint.outcomeScale.scaleId.toUpperCase()}): ${fromPoint.outcomeScale.scorePercentage}% ← ${toPoint.outcomeScale.scorePercentage}% (${outcomeEval.summaryAr})`
      );
    }

    lines.push(
      `• الاختبارات الخاصة الإيجابية: ${fromPoint.specialTestsPositiveCount} ← ${toPoint.specialTestsPositiveCount}`
    );

    if (romRows.length > 0) {
      lines.push('');
      lines.push('المدى الحركي (ROM):');
      for (const r of romRows) {
        const d = computeRomDelta(r.fromVal, r.toVal);
        lines.push(
          `  - ${r.label}: ${r.fromVal !== undefined ? `${r.fromVal}°` : '—'} ← ${r.toVal !== undefined ? `${r.toVal}°` : '—'}${d ? ` (${d.formatted})` : ''}`
        );
      }
    }

    if (mmtRows.length > 0) {
      lines.push('');
      lines.push('القوة العضلية (MMT):');
      for (const m of mmtRows) {
        lines.push(`  - ${m.label}: ${m.fromVal || '—'} ← ${m.toVal ? `${m.toVal}/5` : '—'}`);
      }
    }

    if (performanceRows.length > 0) {
      lines.push('');
      lines.push('اختبارات الأداء الوظيفي:');
      for (const p of performanceRows) {
        lines.push(
          `  - ${p.nameAr}: ${p.firstValue} ← ${p.latestValue} ${p.unit}${p.count >= 2 ? ` (${p.formattedDelta})` : ''}`
        );
      }
    }

    if (goalsTotal > 0) {
      lines.push('');
      lines.push(`الأهداف التأهيلية المحققة: ${goalsAchieved} من ${goalsTotal}`);
    }
  }

  return lines.join('\n');
}

export function buildLongitudinalMatrixCsv(params: {
  language: 'ar' | 'en' | 'ckb';
  snapshots: ClinicalAssessmentSnapshot[];
  rows: Array<{
    parameter: string;
    snapshotValues: string[];
    currentValue: string;
    changeValue: string;
  }>;
}): string {
  const isEn = params.language === 'en';
  const headers = [
    isEn ? 'Clinical Parameter' : 'المعيار السريري',
    ...params.snapshots.map((snap, idx) =>
      idx === 0
        ? `${isEn ? 'Baseline' : 'خط الأساس'} (${formatDateDDMMYYYY(snap.recordedDate)})`
        : `${isEn ? snap.labelEn : snap.labelAr} (${formatDateDDMMYYYY(snap.recordedDate)})`
    ),
    isEn ? 'Current' : 'الحالي',
    isEn ? 'Change' : 'التغير',
  ];

  const matrixRows = params.rows.map((r) => [
    r.parameter,
    ...r.snapshotValues,
    r.currentValue,
    r.changeValue,
  ]);

  return buildCsvDocument(headers, matrixRows, true);
}

export interface SparklineCoord {
  x: number;
  y: number;
  value: number;
}

/**
 * Normalizes a numeric series into SVG coordinates with padding so flat series
 * render cleanly centered without division-by-zero.
 */
export function normalizeSparklineCoords(
  values: number[],
  width = 68,
  height = 22,
  padX = 4,
  padY = 4
): SparklineCoord[] {
  const finite = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (finite.length === 0) return [];

  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const span = max - min;
  const innerW = Math.max(1, width - padX * 2);
  const innerH = Math.max(1, height - padY * 2);

  return finite.map((val, idx) => {
    const x =
      finite.length === 1
        ? width / 2
        : Number((padX + (idx / (finite.length - 1)) * innerW).toFixed(1));
    const ratio = span === 0 ? 0.5 : (val - min) / span;
    const y = Number((padY + innerH - ratio * innerH).toFixed(1));
    return { x, y, value: val };
  });
}

export function buildClinicalVerdictText(params: {
  language: 'ar' | 'en' | 'ckb';
  painActivityDelta: PainDeltaResult | null;
  avgRomGain: { avg: number; count: number } | null;
  outcomeImproved: boolean | null;
  outcomeMcidMet: boolean;
  goalsAchieved: number;
  goalsTotal: number;
}): { tone: 'improved' | 'worsened' | 'neutral'; text: string } {
  const {
    language,
    painActivityDelta,
    avgRomGain,
    outcomeImproved,
    outcomeMcidMet,
    goalsAchieved,
    goalsTotal,
  } = params;
  const isEn = language === 'en';
  const isCkb = language === 'ckb';
  const parts: string[] = [];

  if (painActivityDelta) {
    if (painActivityDelta.direction === 'improved') {
      parts.push(
        isEn
          ? `Activity pain dropped ${painActivityDelta.reduction} pts${painActivityDelta.mcidMet ? ' (MCID met)' : ''}`
          : isCkb
            ? `ئازاری جوڵە ${painActivityDelta.reduction} خاڵ کەمیکرد${painActivityDelta.mcidMet ? ' (MCID)' : ''}`
            : `انخفض ألم الحركة ${painActivityDelta.reduction} نقاط${painActivityDelta.mcidMet ? ' (تحقق MCID)' : ''}`
      );
    } else if (painActivityDelta.direction === 'worsened') {
      parts.push(
        isEn
          ? `Activity pain increased by ${painActivityDelta.signedChange} pts`
          : isCkb
            ? `ئازاری جوڵە ${painActivityDelta.signedChange} خاڵ زیادیکرد`
            : `ارتفع ألم الحركة بمقدار ${painActivityDelta.signedChange} نقاط`
      );
    }
  }

  if (avgRomGain && avgRomGain.avg !== 0) {
    parts.push(
      isEn
        ? `mean ROM ${avgRomGain.avg > 0 ? `+${avgRomGain.avg}°` : `${avgRomGain.avg}°`} across ${avgRomGain.count} joint(s)`
        : isCkb
          ? `ناوەندی ROM ${avgRomGain.avg > 0 ? `+${avgRomGain.avg}°` : `${avgRomGain.avg}°`}`
          : `متوسط تغير المدى الحركي ${avgRomGain.avg > 0 ? `+${avgRomGain.avg}°` : `${avgRomGain.avg}°`}`
    );
  }

  if (outcomeMcidMet) {
    parts.push(
      isEn
        ? 'functional scale achieved MCID'
        : isCkb
          ? 'پێوانەی فرمانی MCIDی بەدەستهێنا'
          : 'المقياس الوظيفي حقق تحسناً دالاً (MCID)'
    );
  } else if (outcomeImproved === true) {
    parts.push(
      isEn
        ? 'functional score improved'
        : isCkb
          ? 'ئەنجامی فرمانی باشتربووە'
          : 'تحسن في النتيجة الوظيفية'
    );
  }

  if (goalsTotal > 0) {
    parts.push(
      isEn
        ? `${goalsAchieved}/${goalsTotal} goals achieved`
        : isCkb
          ? `${goalsAchieved}/${goalsTotal} ئامانج بەدەستهات`
          : `تحقق ${goalsAchieved} من ${goalsTotal} أهداف`
    );
  }

  const hasWorsening =
    painActivityDelta?.direction === 'worsened' || (avgRomGain !== null && avgRomGain.avg < 0);
  const hasImprovement =
    painActivityDelta?.direction === 'improved' ||
    (avgRomGain !== null && avgRomGain.avg > 0) ||
    outcomeImproved === true;

  const tone: 'improved' | 'worsened' | 'neutral' = hasWorsening
    ? 'worsened'
    : hasImprovement
      ? 'improved'
      : 'neutral';

  if (parts.length === 0) {
    return {
      tone: 'neutral',
      text: isEn
        ? 'Measurements match the selected reference point; record follow-up exams to track trajectory.'
        : isCkb
          ? 'پێوانەکان هاوتای خاڵی بنەڕەتین؛ پشکنینی دواتر تۆمار بکە بۆ شوێنکەوتنی بەرەوپێشچوون.'
          : 'القراءات مطابقة لنقطة المرجع المحددة؛ ستظهر فروقات المسار مع تقييمات المتابعة القادمة.',
    };
  }

  return {
    tone,
    text: parts.join(' · '),
  };
}

