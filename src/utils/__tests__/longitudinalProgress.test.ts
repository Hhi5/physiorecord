import { describe, expect, it } from 'vitest';
import {
  buildClinicalVerdictText,
  buildComparisonPointFromSnapshot,
  buildLongitudinalMatrixCsv,
  buildLongitudinalSummaryText,
  computeMmtDelta,
  computePainDelta,
  computePerformanceTestProgress,
  computeRomDelta,
  computeSpecialTestsDelta,
  normalizeSparklineCoords,
  parseMmtGradeNumeric,
} from '../longitudinalProgress';
import type {
  ClinicalAssessmentSnapshot,
  PerformanceTestResultEntry,
} from '../../types/clinicManagement';

describe('longitudinalProgress clinical calculations & exports', () => {
  it('computes pain NPRS deltas accurately for improvement (MCID), worsening, and unchanged', () => {
    const improved = computePainDelta(7, 4);
    expect(improved).toMatchObject({
      signedChange: -3,
      reduction: 3,
      direction: 'improved',
      mcidMet: true,
      formatted: '\u22123 pts',
    });

    const worsened = computePainDelta(3, 5);
    expect(worsened).toMatchObject({
      signedChange: 2,
      reduction: -2,
      direction: 'worsened',
      mcidMet: false,
      formatted: '+2 pts',
    });

    const unchanged = computePainDelta(4, 4);
    expect(unchanged).toMatchObject({
      signedChange: 0,
      direction: 'unchanged',
      mcidMet: false,
      formatted: '0 pts',
    });
  });

  it('parses MMT grades monotonically and computes accurate direction', () => {
    expect(parseMmtGradeNumeric('3+')).toBeGreaterThan(parseMmtGradeNumeric('3')!);
    expect(parseMmtGradeNumeric('4-')).toBeGreaterThan(parseMmtGradeNumeric('3+')!);
    expect(parseMmtGradeNumeric('4+/5')).toBeGreaterThan(parseMmtGradeNumeric('4')!);

    const up = computeMmtDelta('3+', '4+');
    expect(up?.direction).toBe('improved');
    expect(up?.formatted).toBe('3+ → 4+/5');

    const down = computeMmtDelta('4', '3');
    expect(down?.direction).toBe('worsened');

    const flat = computeMmtDelta('4', '4');
    expect(flat?.direction).toBe('unchanged');
  });

  it('computes ROM and provocative special test deltas properly', () => {
    expect(computeRomDelta(95, 120)).toMatchObject({
      signedChange: 25,
      direction: 'improved',
      formatted: '+25°',
    });
    expect(computeRomDelta(120, 105)).toMatchObject({
      signedChange: -15,
      direction: 'worsened',
      formatted: '\u221215°',
    });

    expect(computeSpecialTestsDelta(3, 1)).toMatchObject({
      signedChange: -2,
      direction: 'improved',
      formatted: '\u22122',
    });
    expect(computeSpecialTestsDelta(1, 2)).toMatchObject({
      signedChange: 1,
      direction: 'worsened',
      formatted: '+1',
    });
  });

  it('tracks functional performance tests with correct higher-vs-lower improvement direction', () => {
    const entries: PerformanceTestResultEntry[] = [
      {
        id: 'p1',
        testId: 'five_x_sts',
        recordedAt: '2026-10-01T10:00:00.000Z',
        inputs: { seconds: 15.4 },
        computedValue: 15.4,
        unit: 's',
        interpretationAr: '',
        interpretationEn: '',
      },
      {
        id: 'p2',
        testId: 'five_x_sts',
        recordedAt: '2026-11-01T10:00:00.000Z',
        inputs: { seconds: 11.2 },
        computedValue: 11.2,
        unit: 's',
        interpretationAr: '',
        interpretationEn: '',
      },
      {
        id: 'p3',
        testId: 'walk_6m',
        recordedAt: '2026-10-01T10:00:00.000Z',
        inputs: { meters: 320 },
        computedValue: 320,
        unit: 'm',
        interpretationAr: '',
        interpretationEn: '',
      },
      {
        id: 'p4',
        testId: 'walk_6m',
        recordedAt: '2026-11-01T10:00:00.000Z',
        inputs: { meters: 410 },
        computedValue: 410,
        unit: 'm',
        interpretationAr: '',
        interpretationEn: '',
      },
    ];

    const rows = computePerformanceTestProgress(entries);
    const sts = rows.find((r) => r.testId === 'five_x_sts');
    const walk = rows.find((r) => r.testId === 'walk_6m');

    expect(sts?.direction).toBe('improved');
    expect(sts?.signedChange).toBe(-4.2);
    expect(walk?.direction).toBe('improved');
    expect(walk?.signedChange).toBe(90);
  });

  it('builds bilingual progress summary text and formula-safe UTF-8 BOM CSV', () => {
    const snap1: ClinicalAssessmentSnapshot = {
      id: 'snap_1',
      episodeId: 'ep_1',
      snapshotType: 'initial_evaluation',
      recordedDate: '2026-10-01',
      recordedBy: 'Dr. Ali',
      labelAr: 'التقييم الأولي',
      labelEn: 'Initial Evaluation',
      painNrsRest: 5,
      painNrsActivity: 8,
      romSummary: [],
      mmtSummary: [],
      specialTestsPositiveCount: 3,
    };
    const snap2: ClinicalAssessmentSnapshot = {
      ...snap1,
      id: 'snap_2',
      snapshotType: 're_evaluation',
      recordedDate: '2026-11-01',
      labelAr: 'إعادة تقييم',
      labelEn: 'Re-evaluation',
      painNrsRest: 2,
      painNrsActivity: 4,
      specialTestsPositiveCount: 1,
    };

    const fromPt = buildComparisonPointFromSnapshot(snap1, true);
    const toPt = buildComparisonPointFromSnapshot(snap2, false);

    const arSummary = buildLongitudinalSummaryText({
      language: 'ar',
      patientName: 'أحمد حسن',
      episodeTitle: 'إعادة تأهيل الركبة اليمنى',
      fromPoint: fromPt,
      toPoint: toPt,
      romRows: [{ label: 'الركبة - ثني (يمين)', fromVal: 95, toVal: 125 }],
      mmtRows: [{ label: 'العضلة الرباعية (يمين)', fromVal: '3+', toVal: '4+' }],
      performanceRows: [],
      goalsAchieved: 2,
      goalsTotal: 3,
    });

    expect(arSummary).toContain('ملخص التقدم السريري');
    expect(arSummary).toContain('MCID');
    expect(arSummary).toContain('+30°');
    expect(arSummary).toContain('2 من 3');

    const csv = buildLongitudinalMatrixCsv({
      language: 'en',
      snapshots: [snap1, snap2],
      rows: [
        {
          parameter: '=HYPERLINK("bad")',
          snapshotValues: ['8/10', '4/10'],
          currentValue: '4/10',
          changeValue: '-4 pts',
        },
      ],
    });

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain('Baseline (01/10/2026)');
  });

  it('normalizes sparkline coordinates safely for flat, single, and multi-point series', () => {
    expect(normalizeSparklineCoords([])).toEqual([]);

    const single = normalizeSparklineCoords([5], 68, 22);
    expect(single).toHaveLength(1);
    expect(single[0].x).toBe(34);
    expect(single[0].y).toBe(11);

    const flat = normalizeSparklineCoords([4, 4, 4], 68, 22);
    expect(flat.every((c) => c.y === 11)).toBe(true);

    const rising = normalizeSparklineCoords([80, 100, 120], 68, 22, 4, 4);
    expect(rising[0].y).toBeGreaterThan(rising[2].y);
  });

  it('builds localized clinical verdict text reflecting improvement or worsening', () => {
    const improved = buildClinicalVerdictText({
      language: 'ar',
      painActivityDelta: computePainDelta(7, 4),
      avgRomGain: { avg: 20, count: 2 },
      outcomeImproved: true,
      outcomeMcidMet: true,
      goalsAchieved: 2,
      goalsTotal: 3,
    });
    expect(improved.tone).toBe('improved');
    expect(improved.text).toContain('MCID');
    expect(improved.text).toContain('+20°');

    const worsened = buildClinicalVerdictText({
      language: 'en',
      painActivityDelta: computePainDelta(3, 6),
      avgRomGain: null,
      outcomeImproved: null,
      outcomeMcidMet: false,
      goalsAchieved: 0,
      goalsTotal: 0,
    });
    expect(worsened.tone).toBe('worsened');
    expect(worsened.text).toContain('increased');
  });
});

