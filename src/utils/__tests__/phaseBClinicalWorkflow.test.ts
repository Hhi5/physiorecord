import { describe, it, expect, beforeEach } from 'vitest';
import {
  BUILT_IN_EXAM_PRESETS_CC0,
  applyExamPresetToEpisodeStore,
  serializeExamPresetPack,
  parseExamPresetPack,
} from '../../data/clinicalToolkit/examPresetsCc0';
import {
  buildLatestScoreByInstrumentMap,
  evaluateOutcomeGoalStatus,
  evaluateReEvalDueStatus,
  evaluateNoteCompleteness,
} from '../reEvalNudge';
import type { FunctionalScaleEntry } from '../../types/clinicalWidgets';
import {
  PERFORMANCE_TESTS_CATALOG,
  GRIP_STRENGTH_NORMS_KG,
  computePerformanceTestResult,
} from '../../data/clinicalToolkit/performanceTestsCatalog';
import {
  MODALITY_SAFETY_RULES,
  checkModalitySafety,
  evaluateVitalsAgainstThresholds,
} from '../modalitySafetyChecker';
import {
  ClinicOperationsService,
  DEFAULT_VITALS_THRESHOLDS,
} from '../../services/clinicOperationsService';
import type { EpisodeScopedClinicalStore, OutcomeLinkedGoal } from '../../types/clinicManagement';

function createBlankStore(): EpisodeScopedClinicalStore {
  return {
    episodeId: 'ep-test-1',
    patientId: 'pat-test-1',
    activeWidgetIds: ['body_chart'],
    chiefComplaint: '',
    historyOfPresentIllness: '',
    mechanismOfInjury: '',
    painAtRestNrs: 0,
    painOnActivityNrs: 0,
    painWorst24hNrs: 0,
    painNature: '',
    aggravatingFactors: '',
    relievingFactors: '',
    functionalLimitations: '',
    patientPersonalGoals: '',
    observationPosture: '',
    palpationFindings: '',
    circumferenceEdemaNotes: '',
    treatmentFrequency: '3x/wk',
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
}

describe('Phase B — Clinical Workflow & Safety Features (B1–B8)', () => {
  beforeEach(() => {
    ClinicOperationsService.clearInMemoryCache();
  });

  it('B1: provides 11 CC0-1.0 regional exam presets, applies them idempotently, and enforces CC0 pack import', () => {
    expect(BUILT_IN_EXAM_PRESETS_CC0).toHaveLength(11);
    const regions = BUILT_IN_EXAM_PRESETS_CC0.map((p) => p.regionId);
    expect(regions).toEqual(
      expect.arrayContaining([
        'neck',
        'low_back',
        'shoulder',
        'elbow_wrist_hand',
        'hip',
        'knee',
        'ankle_foot',
        'post_op',
        'neuro',
        'pediatric',
        'sports',
      ])
    );

    const kneePreset = BUILT_IN_EXAM_PRESETS_CC0.find((p) => p.regionId === 'knee')!;
    expect(kneePreset.license).toBe('CC0-1.0');

    const store = createBlankStore();
    const appliedOnce = applyExamPresetToEpisodeStore(store, kneePreset);
    expect(appliedOnce.appliedPresetIds).toContain(kneePreset.id);
    expect(appliedOnce.activeWidgetIds).toEqual(
      expect.arrayContaining(kneePreset.widgetsToEnable)
    );
    expect(appliedOnce.objective.romBattery?.entries.length).toBeGreaterThan(0);
    expect(appliedOnce.objective.mmtBattery?.entries.length).toBeGreaterThan(0);
    expect(appliedOnce.specialTests.length).toBeGreaterThan(0);

    // Idempotent second application must not duplicate starter rows
    const appliedTwice = applyExamPresetToEpisodeStore(appliedOnce, kneePreset);
    expect(appliedTwice.objective.romBattery?.entries.length).toBe(
      appliedOnce.objective.romBattery?.entries.length
    );

    const jsonPack = serializeExamPresetPack([kneePreset]);
    const parsedPack = parseExamPresetPack(jsonPack);
    expect(parsedPack).toHaveLength(1);
    expect(parsedPack[0].regionId).toBe('knee');

    const badLicenseJson = JSON.stringify({
      schema: 'physiorecord-exam-presets-pack/v1',
      license: 'Proprietary',
      presets: [kneePreset],
    });
    expect(() => parseExamPresetPack(badLicenseJson)).toThrow(/CC0-1\.0/);
  });

  it('B2: evaluates MCID outcome goal progression for higher-is-better and lower-is-better scales', () => {
    const odiGoal: OutcomeLinkedGoal = {
      id: 'g1',
      title: 'تقليل العجز الوظيفي أسفل الظهر / Reduce lumbar disability',
      linkedInstrumentId: 'odi',
      baselineScore: 52,
      currentScore: 30,
      targetScore: 20,
      targetDate: '2026-12-01',
      createdAt: '2026-11-01',
    };
    expect(evaluateOutcomeGoalStatus(odiGoal).status).toBe('improving');
    expect(evaluateOutcomeGoalStatus({ ...odiGoal, currentScore: 50 }).status).toBe('unchanged');
    expect(evaluateOutcomeGoalStatus({ ...odiGoal, currentScore: 68 }).status).toBe('worse');
    expect(evaluateOutcomeGoalStatus({ ...odiGoal, currentScore: undefined }).status).toBe('pending');

    const lefsGoal: OutcomeLinkedGoal = {
      id: 'g2',
      title: 'زيادة قدرة الطرف السفلي / Improve LEFS score',
      linkedInstrumentId: 'lefs',
      baselineScore: 40,
      currentScore: 58,
      targetScore: 55,
      targetDate: '2026-12-01',
      createdAt: '2026-11-01',
    };
    const lefsEval = evaluateOutcomeGoalStatus(lefsGoal);
    expect(lefsEval.status).toBe('improving');
    expect(lefsEval.reachedTarget).toBe(true);
  });

  it('B2b: indexes historical outcome scale scores by each history item scaleId without clobbering prior instruments', () => {
    const functionalScales: FunctionalScaleEntry = {
      scaleId: 'lefs',
      scaleNameAr: 'مقياس الطرف السفلي',
      scaleNameEn: 'LEFS',
      rawScore: 62,
      scorePercentage: 77.5,
      severityLabelAr: 'تحسن',
      severityLabelEn: 'Minimal difficulty',
      responses: {},
      history: [
        {
          id: 'h1',
          date: '2026-11-01',
          visitType: 'initial_evaluation',
          scaleId: 'odi',
          scaleNameAr: 'أوسويستري',
          scaleNameEn: 'ODI',
          rawScore: 48,
          scorePercentage: 48,
          severityLabelAr: 'عجز متوسط',
          severityLabelEn: 'Moderate disability',
        },
        {
          id: 'h2',
          date: '2026-11-07',
          visitType: 're_evaluation',
          scaleId: 'odi',
          scaleNameAr: 'أوسويستري',
          scaleNameEn: 'ODI',
          rawScore: 34,
          scorePercentage: 34,
          severityLabelAr: 'تحسن',
          severityLabelEn: 'Improved',
        },
        {
          id: 'h3',
          date: '2026-11-10',
          visitType: 'follow_up',
          scaleId: 'lefs',
          scaleNameAr: 'مقياس الطرف السفلي',
          scaleNameEn: 'LEFS',
          rawScore: 52,
          scorePercentage: 65,
          severityLabelAr: 'متوسط',
          severityLabelEn: 'Moderate difficulty',
        },
      ],
    };

    const scoreMap = buildLatestScoreByInstrumentMap(functionalScales);
    expect(scoreMap.get('odi')).toBe(34);
    expect(scoreMap.get('lefs')).toBe(62);
  });

  it('B3: keeps re-evaluation nudges OFF by default and triggers cleanly when enabled above thresholds', () => {
    expect(ClinicOperationsService.isReEvalNudgesEnabled()).toBe(false);

    const offStatus = evaluateReEvalDueStatus({
      enabled: false,
      sessionsSinceLastEval: 10,
      lastEvalDateStr: '2026-10-01',
      todayDateStr: '2026-11-14',
      thresholdSessions: 6,
      thresholdDays: 21,
    });
    expect(offStatus.isDue).toBe(false);

    const dueByBoth = evaluateReEvalDueStatus({
      enabled: true,
      sessionsSinceLastEval: 6,
      lastEvalDateStr: '2026-10-15',
      todayDateStr: '2026-11-14',
      thresholdSessions: 6,
      thresholdDays: 21,
    });
    expect(dueByBoth.isDue).toBe(true);
    expect(dueByBoth.reasonType).toBe('both');
  });

  it('B4: evaluates 5-item non-blocking note completeness report accurately', () => {
    const partial = evaluateNoteCompleteness({
      hasPainRecorded: true,
      hasObjectiveFinding: true,
      hasIntervention: true,
      hasPlan: false,
      hasNextVisit: false,
    });
    expect(partial.allComplete).toBe(false);
    expect(partial.missingCount).toBe(2);
    expect(partial.items).toHaveLength(5);

    const complete = evaluateNoteCompleteness({
      hasPainRecorded: true,
      hasObjectiveFinding: true,
      hasIntervention: true,
      hasPlan: true,
      hasNextVisit: true,
    });
    expect(complete.allComplete).toBe(true);
    expect(complete.missingCount).toBe(0);
  });

  it('B5: provides 7 performance tests marked needs_expert_verification with valid calculations', () => {
    expect(PERFORMANCE_TESTS_CATALOG).toHaveLength(7);
    for (const def of PERFORMANCE_TESTS_CATALOG) {
      expect(def.verificationStatus).toBe('needs_expert_verification');
      expect(def.citation.length).toBeGreaterThan(5);
    }
    expect(GRIP_STRENGTH_NORMS_KG.length).toBeGreaterThanOrEqual(4);

    const lsi = computePerformanceTestResult({
      testId: 'lsi',
      inputs: { involved: 85, uninvolved: 100 },
    });
    expect(lsi.computedValue).toBe(85);
    expect(lsi.unit).toBe('%');
    expect(lsi.interpretationEn).toContain('needs expert verification');

    const tenMwt = computePerformanceTestResult({
      testId: 'walk_10m',
      inputs: { distanceMeters: 10, timeSeconds: 8 },
    });
    expect(tenMwt.computedValue).toBe(1.25);
    expect(tenMwt.unit).toBe('m/s');

    const grip = computePerformanceTestResult({
      testId: 'grip_strength',
      inputs: { rightKg: 48, leftKg: 44 },
      age: 35,
      gender: 'male',
    });
    expect(grip.computedValue).toBe(48);
    expect(grip.interpretationEn).toContain('30–39');
  });

  it('B6: gates modality safety rules behind senior PT review and detects pacemaker / Shortwave risks', () => {
    expect(ClinicOperationsService.getModalitySafetyReviewStatus().reviewed).toBe(false);
    expect(ClinicOperationsService.isModalitySafetyCheckEnabled()).toBe(false);
    expect(MODALITY_SAFETY_RULES.length).toBeGreaterThan(0);

    // Attempt enabling without reviewer must remain disabled
    ClinicOperationsService.setModalitySafetyCheckEnabled(true);
    expect(ClinicOperationsService.isModalitySafetyCheckEnabled()).toBe(false);

    // Senior PT review sign-off enables the safety check
    ClinicOperationsService.confirmModalitySafetyReview('Dr. Senior PT', true);
    const status = ClinicOperationsService.getModalitySafetyReviewStatus();
    expect(status.reviewed).toBe(true);
    expect(status.enabled).toBe(true);
    expect(status.reviewedBy).toBe('Dr. Senior PT');

    const tensPacemaker = checkModalitySafety('TENS', ['pacemaker_icd']);
    expect(tensPacemaker.length).toBeGreaterThan(0);
    expect(tensPacemaker[0].severity).toBe('absolute_contraindication');

    const swdFreeText = checkModalitySafety('Shortwave', [], 'Patient has implanted metal plate and pacemaker');
    expect(swdFreeText.some((r) => r.precautionId === 'metal_implants')).toBe(true);
    expect(swdFreeText.some((r) => r.precautionId === 'pacemaker_icd')).toBe(true);
  });

  it('B7: evaluates high BP, low SpO2, and tachycardia against vitals thresholds', () => {
    const alerts = evaluateVitalsAgainstThresholds(
      { bpSystolic: 185, bpDiastolic: 112, heartRateBpm: 130, spO2Percent: 89 },
      DEFAULT_VITALS_THRESHOLDS
    );
    const codes = alerts.map((a) => a.code);
    expect(codes).toEqual(
      expect.arrayContaining(['bp_sys_high', 'bp_dia_high', 'hr_high', 'spo2_low'])
    );

    const normal = evaluateVitalsAgainstThresholds(
      { bpSystolic: 120, bpDiastolic: 78, heartRateBpm: 74, spO2Percent: 98 },
      DEFAULT_VITALS_THRESHOLDS
    );
    expect(normal).toHaveLength(0);
  });
});
