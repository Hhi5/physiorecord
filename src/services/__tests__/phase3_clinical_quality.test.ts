// =======================================================================
// PhysioRecord — Phase 3: Clinical Quality, Safety & Data Integrity Tests
// Covers 3.1 (canonical keys + free-text continuity), 3.2' (table-first
// ASIA ISNCSCI + null BodyMapSlot), 3.3 (outcome MCID + optional SMART/GAS),
// 3.4 (red-flag screening + neutral zero state), 3.5 (non-binary TUG norms),
// 3.6 (idempotent SessionFinalized + admin-only package adjustment + audit),
// 3.7 (unique MRN + sessionDate >= episode.startDate + NPRS 0..10 bounds),
// 3.8 (clinical content governance source / Pending Review metadata).
// =======================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInMemoryDatabase } from '../../crypto/__tests__/testDbHelper';
import {
  CONSTANTS,
  CURRENT_DEK_VERSION,
  CURRENT_RECORD_CRYPTO_VERSION,
  bindDekToGeneration,
  deriveKEK,
  encryptRecordWithMandatoryReservation,
  generateAndWrapOperationalDEK,
  generateVerifier,
  randomBytes,
} from '../../crypto/vault';
import type { PhysioRecordDatabase } from '../../db/db';
import {
  ClinicOperationsService,
  PT_EXERCISE_CATALOG,
} from '../clinicOperationsService';
import { EpisodeService } from '../episodeService';
import { SessionService } from '../sessionService';
import { SoapService } from '../soapService';
import {
  CANONICAL_MMT_CONCEPTS,
  normalizeMmtEntryCanonical,
  normalizeRomEntryCanonical,
  resolveLongitudinalMmtGroupKey,
  resolveLongitudinalRomGroupKey,
  resolveMmtCanonicalKey,
} from '../../data/clinicalToolkit/canonicalKeysCatalog';
import {
  ASIA_ISNCSCI_LEVEL_CODES,
  ASIA_ISNCSCI_SENSORY_LEVELS,
  computeAsiaSensoryTotals,
  DERMATOMES_CATALOG_GOVERNANCE,
  deriveLegacySensoryStatus,
  getAsiaSensoryCellKey,
} from '../../data/clinicalToolkit/dermatomesData';
import {
  ASIA_ISNCSCI_KEY_MUSCLES,
  CLINICAL_PT_MYOTOMES,
  computeAsiaMotorTotals,
  MYOTOMES_CATALOG_GOVERNANCE,
} from '../../data/clinicalToolkit/myotomesData';
import {
  DTR_CATALOG_GOVERNANCE,
  DTR_DEFINITIONS,
  PATHOLOGICAL_REFLEX_DEFINITIONS,
} from '../../data/clinicalToolkit/dtrData';
import { ROM_MMT_CATALOG_GOVERNANCE } from '../../data/clinicalToolkit/romMmtCatalog';
import {
  RED_FLAG_CHECKLIST_CATALOG,
  RED_FLAG_REGION_GROUPS,
} from '../../data/clinicalToolkit/redFlagsCatalog';
import { BodyMapSlot } from '../../components/ui/BodyMapSlot';
import { computeSmartGoalsGasSummary } from '../../components/workspace/SmartGoalsGasPanel';
import {
  evaluateBaselineChange,
  OUTCOME_INSTRUMENTS,
  TUG_POPULATION_NORMS,
} from '../../utils/outcomeMeasures';
import {
  ensureUniquePatientMrn,
  hasPatientRedFlagsOrContraindications,
} from '../../utils/mrn';

async function setupInitializedVault(initialVerno = 7): Promise<{
  db: PhysioRecordDatabase;
  dek: CryptoKey;
}> {
  const db = createInMemoryDatabase(initialVerno);
  const salt = randomBytes(CONSTANTS.SALT_BYTES);
  const kek = await deriveKEK('Phase3ClinicalKey!2026', salt, 1000);
  const { operationalDek, wrappedDek, wrappedDekIv } =
    await generateAndWrapOperationalDEK(kek, 1);
  const { verifierIv, verifierCiphertext } = await generateVerifier(kek);

  await db.vaultMeta.put({
    id: 'auth',
    salt,
    wrappedDek,
    wrappedDekIv,
    verifierIv,
    verifierCiphertext,
    schemaVersion: 7,
    kdfAlgorithm: 'PBKDF2-HMAC-SHA256',
    kdfIterations: 1000,
    dekVersion: CURRENT_DEK_VERSION,
    encryptionInvocationCount: 0,
    vaultGeneration: 1,
  });

  bindDekToGeneration(operationalDek, 1);
  await ClinicOperationsService.hydrateEncryptedCache(operationalDek, db);
  return { db, dek: operationalDek };
}

async function seedPatientRecord(
  db: PhysioRecordDatabase,
  dek: CryptoKey,
  patientId: string,
  fullName: string,
  mrn: string
): Promise<void> {
  const enc = await encryptRecordWithMandatoryReservation(
    db,
    dek,
    'patients',
    patientId,
    [],
    { fullName, mrn, gender: 'male', phone: '07701234567' }
  );
  await db.patients.put({
    id: patientId,
    createdAt: '2026-06-01T08:00:00.000Z',
    updatedAt: '2026-06-01T08:00:00.000Z',
    isArchived: 0,
    recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
    dekVersion: CURRENT_DEK_VERSION,
    iv: enc.iv,
    ciphertext: enc.ciphertext,
  });
}

describe('Phase 3 — Clinical Quality, Safety & Data Integrity', () => {
  let db: PhysioRecordDatabase;
  let dek: CryptoKey;

  beforeEach(async () => {
    const fresh = await setupInitializedVault(7);
    db = fresh.db;
    dek = fresh.dek;
  });

  it('3.1: maps standard Arabic/English MMT & ROM terms to canonical keys while preserving free text non-destructively', () => {
    const matched = resolveMmtCanonicalKey('عاطفات الكتف');
    expect(matched).toEqual({
      canonicalKey: 'mmt.shoulder.flexors',
      label: 'عاطفات الكتف',
    });

    const englishMatched = resolveMmtCanonicalKey('Anterior Deltoid');
    expect(englishMatched).toEqual({
      canonicalKey: 'mmt.shoulder.flexors',
      label: 'Anterior Deltoid',
    });

    // Unknown custom muscle stays canonicalKey: null and preserves free text verbatim
    const customFreeText = resolveMmtCanonicalKey('مقربة الورك المعدلة — اختبار وظيفي مخصص');
    expect(customFreeText).toEqual({
      canonicalKey: null,
      label: 'مقربة الورك المعدلة — اختبار وظيفي مخصص',
    });

    const normalizedEntry = normalizeMmtEntryCanonical({
      entryId: 'mmt_custom_1',
      muscleGroupId: 'custom_1',
      muscleNameAr: 'اختبار مخصص لليد',
      muscleNameEn: 'اختبار مخصص لليد',
      actionNameAr: 'فحص قبضة دقيقة',
      actionNameEn: 'Fine Pinch',
      laterality: 'right',
      gravityCondition: 'against_gravity',
      gradeValue: '4',
      isTested: true,
    });
    expect(normalizedEntry.canonicalKey).toBeNull();
    expect(normalizedEntry.label).toBe('اختبار مخصص لليد');

    // Longitudinal grouping unifies Arabic + English canonical equivalents
    const arGroup = resolveLongitudinalMmtGroupKey({
      canonicalKey: matched.canonicalKey,
      muscleKey: 'custom_ar_1_right',
      label: matched.label,
      laterality: 'right',
    });
    const enGroup = resolveLongitudinalMmtGroupKey({
      canonicalKey: englishMatched.canonicalKey,
      muscleKey: 'shoulder_flexors_right',
      label: englishMatched.label,
      laterality: 'right',
    });
    expect(arGroup).toBe('mmt.shoulder.flexors::right');
    expect(enGroup).toBe('mmt.shoulder.flexors::right');

    const romNorm = normalizeRomEntryCanonical({
      entryId: 'rom_1',
      jointId: 'knee',
      jointNameAr: 'مفصل الركبة',
      jointNameEn: 'Knee',
      movementId: 'flexion',
      movementNameAr: 'ثني الركبة',
      movementNameEn: 'Flexion',
      laterality: 'left',
      movementType: 'AROM',
      measuredAngleDegrees: 118,
      isTested: true,
    });
    expect(romNorm.canonicalKey).toBe('rom.knee.flexion.left');
    expect(
      resolveLongitudinalRomGroupKey({
        canonicalKey: romNorm.canonicalKey,
        jointMovementKey: 'knee_flexion_left',
        laterality: 'left',
      })
    ).toBe('rom.knee.flexion.left');
  });

  it("3.2': enforces table-first ASIA ISNCSCI sensory matrix (C2..S4-5, R/L x LT/PP) and null-default BodyMapSlot", () => {
    expect(ASIA_ISNCSCI_LEVEL_CODES).toHaveLength(28);
    expect(ASIA_ISNCSCI_LEVEL_CODES[0]).toBe('C2');
    expect(ASIA_ISNCSCI_LEVEL_CODES[27]).toBe('S4-5');
    expect(ASIA_ISNCSCI_SENSORY_LEVELS).toHaveLength(28);

    expect(getAsiaSensoryCellKey('C5', 'R', 'LT')).toBe('C5.R.LT');
    expect(getAsiaSensoryCellKey('S4-5', 'L', 'PP')).toBe('S4-5.L.PP');

    expect(deriveLegacySensoryStatus('2', '2')).toBe('intact');
    expect(deriveLegacySensoryStatus('2', '1')).toBe('hypoesthesia');
    expect(deriveLegacySensoryStatus('0', '2')).toBe('anesthesia');
    expect(deriveLegacySensoryStatus('NT', 'NT')).toBe('not_tested');

    // Pluggable <BodyMapSlot> must render empty markup by default without unverified body map SVG
    const slotHtmlDefault = renderToStaticMarkup(
      React.createElement(BodyMapSlot, { region: 'dermatomes' })
    );
    expect(slotHtmlDefault).toBe('');

    const slotHtmlCustom = renderToStaticMarkup(
      React.createElement(BodyMapSlot, {
        region: 'dermatomes',
        renderer: React.createElement('div', { 'data-slot': 'verified' }, 'OK'),
      })
    );
    expect(slotHtmlCustom).toContain('data-slot="verified"');
  });

  it("3.2'': verifies ASIA/ISNCSCI 2019 10 key muscles, UEMS/LEMS & LT/PP totals, comprehensive C1-S2 clinical myotomes, and DTR/UMN data", () => {
    // Official ASIA / ISNCSCI (2019) has strictly 10 key muscles (5 upper, 5 lower)
    expect(ASIA_ISNCSCI_KEY_MUSCLES).toHaveLength(10);
    const byRoot = Object.fromEntries(ASIA_ISNCSCI_KEY_MUSCLES.map((m) => [m.rootLevel, m]));
    expect(byRoot.C5.functionEn).toBe('Elbow flexors');
    expect(byRoot.C6.functionEn).toBe('Wrist extensors');
    expect(byRoot.C7.functionEn).toBe('Elbow extensors');
    expect(byRoot.C8.functionEn).toContain('Finger flexors');
    expect(byRoot.T1.functionEn).toContain('Finger abductors');
    expect(byRoot.L2.functionEn).toBe('Hip flexors');
    expect(byRoot.L3.functionEn).toBe('Knee extensors');
    expect(byRoot.L4.functionEn).toBe('Ankle dorsiflexors');
    expect(byRoot.L5.functionEn).toBe('Long toe extensors');
    expect(byRoot.S1.functionEn).toBe('Ankle plantar flexors');

    // Comprehensive Clinical PT myotomes cover C1-C2..S2 with secondary differential muscles
    expect(CLINICAL_PT_MYOTOMES.map((g) => g.root)).toEqual([
      'C1-C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'T1', 'L1-L2', 'L3', 'L4', 'L5', 'S1', 'S2',
    ]);
    const c5Group = CLINICAL_PT_MYOTOMES.find((g) => g.root === 'C5')!;
    expect(c5Group.primaryTest.movementEn).toContain('Elbow flexors');
    expect(c5Group.primaryTest.asiaTestId).toBe('asia:C5');
    expect(c5Group.secondaryTests.some((s) => s.movementEn.includes('Shoulder: Flexion, extension, abduction'))).toBe(true);
    const l4Group = CLINICAL_PT_MYOTOMES.find((g) => g.root === 'L4')!;
    expect(l4Group.secondaryTests.some((s) => s.movementEn.includes('Hip: Extension, abduction, internal rotation'))).toBe(true);
    const l5Group = CLINICAL_PT_MYOTOMES.find((g) => g.root === 'L5')!;
    expect(l5Group.secondaryTests.some((s) => s.movementEn.includes('Hallux and Toe: DIP and PIP flexion and abduction'))).toBe(true);

    // Motor scoring math (including linked Clinical PT -> ASIA C5 cross-mapping & NT flag)
    const motorTotals = computeAsiaMotorTotals([
      {
        rootLevel: 'C5',
        testId: 'clinical:C5:elbow_flexion',
        movementLabelEn: 'Elbow flexion',
        movementLabelAr: 'ثني المرفق',
        rightGrade: '5',
        leftGrade: '4',
      },
      {
        rootLevel: 'C6',
        testId: 'asia:C6',
        movementLabelEn: 'Wrist extensors',
        movementLabelAr: 'بسط الرسغ',
        rightGrade: '5',
        leftGrade: 'NT',
      },
      {
        rootLevel: 'L4',
        testId: 'asia:L4',
        movementLabelEn: 'Ankle dorsiflexors',
        movementLabelAr: 'العطف الظهري للكاحل',
        rightGrade: '3',
        leftGrade: '5',
      },
    ]);
    expect(motorTotals.rightUEMS).toBe(10);
    expect(motorTotals.leftUEMS).toBe(4);
    expect(motorTotals.leftUEMSHasNT).toBe(true);
    expect(motorTotals.rightLEMS).toBe(3);
    expect(motorTotals.leftLEMS).toBe(5);
    expect(motorTotals.totalMotor).toBe(22);
    expect(motorTotals.anyNT).toBe(true);

    // Sensory scoring math (28 levels × 2 = 56/side, 112 total)
    const sensoryTotals = computeAsiaSensoryTotals({
      'C5.R.LT': '2',
      'C5.L.LT': '1',
      'C5.R.PP': '2',
      'C5.L.PP': 'NT',
      'S4-5.R.LT': '0',
    });
    expect(sensoryTotals.rightLT).toBe(2);
    expect(sensoryTotals.leftLT).toBe(1);
    expect(sensoryTotals.totalLT).toBe(3);
    expect(sensoryTotals.rightPP).toBe(2);
    expect(sensoryTotals.leftPPHasNT).toBe(true);
    expect(sensoryTotals.alteredLevels).toBe(2);

    // DTR & UMN accuracy checks
    const brachio = DTR_DEFINITIONS.find((d) => d.reflexId === 'brachioradialis')!;
    expect(brachio.nameAr).not.toContain('الكب');
    expect(brachio.nameAr).toContain('الاستلقاء');
    expect(PATHOLOGICAL_REFLEX_DEFINITIONS.map((p) => p.signId)).toEqual([
      'babinski',
      'hoffmann',
      'clonus',
    ]);
  });

  it('3.3: calculates MCID attainment on outcome scales, PSFS, and gates SMART Goals & GAS (-2..+2) off by default', () => {
    // ODI lower is better: 54% -> 34% (delta 20 >= MCID 10)
    const odiEval = evaluateBaselineChange('odi', 27, 17, 54, 34);
    expect(odiEval.improved).toBe(true);
    expect(odiEval.mcidMet).toBe(true);

    // PSFS higher is better: avg 3.0 -> 6.0 (delta +3.0 >= MCID 2.0 / 20%)
    const psfsEval = evaluateBaselineChange('psfs', 3, 6, 30, 60);
    expect(psfsEval.improved).toBe(true);
    expect(psfsEval.mcidMet).toBe(true);
    expect(OUTCOME_INSTRUMENTS.psfs.mcidValue).toBe(20);
    expect(OUTCOME_INSTRUMENTS.psfs.mcidUnitIsPercent).toBe(true);

    // R6: SMART Goals & GAS off by default until enabled
    expect(ClinicOperationsService.isSmartGoalsGasEnabled()).toBe(false);
    ClinicOperationsService.setSmartGoalsGasEnabled(true);
    expect(ClinicOperationsService.isSmartGoalsGasEnabled()).toBe(true);

    const gasSummary = computeSmartGoalsGasSummary([
      {
        id: 'g1',
        horizon: 'short_term',
        description: 'Knee flexion 120°',
        progressPercent: 100,
        status: 'achieved',
        gasScore: 1,
      },
      {
        id: 'g2',
        horizon: 'long_term',
        description: 'Walk 1km pain-free',
        progressPercent: 50,
        status: 'in_progress',
        gasScore: -1,
      },
    ]);
    expect(gasSummary.totalGoals).toBe(2);
    expect(gasSummary.gasScoredCount).toBe(2);
    expect(gasSummary.meanGasScore).toBe(0);
    expect(gasSummary.achievedCount).toBe(1);
  });

  it('3.4: provides regional red-flag checklists and keeps zero checked items neutrally unflagged', () => {
    expect(RED_FLAG_REGION_GROUPS.length).toBeGreaterThanOrEqual(5);
    expect(RED_FLAG_CHECKLIST_CATALOG.length).toBeGreaterThanOrEqual(10);

    // Neutral zero state: no flags checked, empty free text -> false
    expect(
      hasPatientRedFlagsOrContraindications({
        redFlags: '',
        contraindications: '',
        precautions: '',
        redFlagChecklist: [],
      })
    ).toBe(false);

    expect(
      hasPatientRedFlagsOrContraindications({
        redFlags: 'لا يوجد',
        redFlagChecklist: [
          {
            itemId: 'rf_lumb_cauda_equina',
            regionId: 'lumbar_pelvis',
            labelAr: 'اضطراب البول',
            labelEn: 'Bladder retention',
            status: 'absent',
          },
        ],
      })
    ).toBe(false);

    // Checked red flag -> triggers alert state
    expect(
      hasPatientRedFlagsOrContraindications({
        redFlagChecklist: [
          {
            itemId: 'rf_lumb_cauda_equina',
            regionId: 'lumbar_pelvis',
            labelAr: 'اضطراب البول',
            labelEn: 'Bladder retention',
            status: 'present',
            screenedAt: '2026-06-05T10:00:00.000Z',
          },
        ],
      })
    ).toBe(true);
  });

  it('3.5: provides peer-reviewed TUG population norms without binary fall-risk labeling', () => {
    expect(TUG_POPULATION_NORMS.length).toBeGreaterThanOrEqual(5);
    for (const norm of TUG_POPULATION_NORMS) {
      expect(norm.citation.trim().length).toBeGreaterThan(10);
      expect(norm.referenceRangeEn).not.toMatch(/\bhigh fall risk\b/i);
    }
    expect((OUTCOME_INSTRUMENTS.tug.procedureSummaryEn || '').toLowerCase()).not.toContain('high fall risk');
    expect(OUTCOME_INSTRUMENTS.tug.procedureSummaryAr || '').not.toContain('خطورة سقوط عالية');
  });

  it('3.6: emits idempotent SessionFinalized event once per sessionId and restricts manual package adjustments to admin with reason + audit', async () => {
    await ClinicOperationsService.configureSoloModeAsync({
      therapistNameAr: 'د. نور علي',
      therapistNameEn: 'Dr. Noor Ali',
      clinicNameAr: 'عيادة الرعاية الطبيعية',
      clinicNameEn: 'Physio Care Clinic',
    });
    await ClinicOperationsService.switchWorkspaceModeAsync('team');

    await seedPatientRecord(db, dek, 'pat-p3-1', 'أحمد كريم', 'PT-000010');
    const ep = await EpisodeService.createEpisode(
      'pat-p3-1',
      {
        title: 'تأهيل الركبة',
        primarySpecialty: 'musculoskeletal',
        medicalDiagnosis: 'ACL Rehab',
        clinicalImpression: 'Post-op week 6',
        affectedBodyRegion: 'Right Knee',
        startDate: '2026-06-01',
        status: 'active',
        rehabilitationGoals: { shortTerm: ['Full extension'], longTerm: ['Run'] },
      },
      dek,
      'ep-p3-1',
      db
    );

    const createdAppt = ClinicOperationsService.saveAppointment({
      patientId: 'pat-p3-1',
      patientName: 'أحمد كريم',
      episodeId: ep.id,
      episodeTitle: ep.data.title,
      therapistName: 'د. نور علي',
      date: '2026-06-10',
      startTime: '10:00',
      durationMinutes: 45,
      visitType: 'follow_up',
      status: 'arrived',
    });

    const pkgInv = ClinicOperationsService.createInvoiceIQD({
      patientId: 'pat-p3-1',
      patientName: 'أحمد كريم',
      episodeId: ep.id,
      episodeTitle: ep.data.title,
      invoiceType: 'rehab_package',
      titleAr: 'كورس 6 جلسات',
      titleEn: '6-Session Package',
      totalAmountIQD: 150000,
      discountIQD: 0,
      initialPaidIQD: 150000,
      paymentMethod: 'cash',
      packageTotalSessions: 6,
    });

    ClinicOperationsService.addWaitingListEntry({
      patientId: 'pat-p3-1',
      patientName: 'أحمد كريم',
      phone: '07701234567',
      conditionOrRegion: 'Knee',
      preferredDays: 'Sun/Tue',
      preferredTimeWindow: 'morning',
      priority: 'high',
    });
    expect(ClinicOperationsService.getWaitingList().some((w) => w.patientId === 'pat-p3-1')).toBe(
      true
    );

    const sess = await SessionService.createSession(
      'pat-p3-1',
      ep.id,
      {
        sessionDate: '2026-06-10',
        sessionType: 'follow_up',
        attendanceStatus: 'attended',
        therapistName: 'د. نور علي',
      },
      dek,
      'sess-p3-final',
      db
    );

    await SoapService.createSoapNote(
      'pat-p3-1',
      ep.id,
      sess.id,
      {
        subjective: {
          chiefComplaint: 'تحسن في المشي',
          painNrsScore: 4,
          postSessionPainNrs: 2,
        },
        objective: {
          dailyInterventionsSummary: 'تمارين تقوية رباعية الرؤوس وثني الركبة',
          status: 'assessed',
        },
        assessment: {
          clinicalImpressionCurrent: 'تقدم ممتاز في المدى الحركي',
          progressStatus: 'improved',
        },
        plan: {
          nextSessionPlan: 'متابعة التقوية',
        },
      },
      dek,
      'soap-p3-final',
      db
    );

    await SessionService.finalizeSession(sess.id, 'د. نور علي', dek, db);

    // Appointment marked completed, package decremented ONCE, waiting list closed
    const postAppt = ClinicOperationsService.getAppointments().find((a) => a.id === createdAppt.id)!;
    expect(postAppt.status).toBe('completed');

    const postPkg = ClinicOperationsService.getInvoicesIQD().find((i) => i.id === pkgInv.id)!;
    expect(postPkg.packageUsedSessions).toBe(1);
    expect(postPkg.processedFinalizedSessionIds).toContain(sess.id);

    // Waiting list filtered out of active queue & stored as completed
    expect(ClinicOperationsService.getWaitingList().some((w) => w.patientId === 'pat-p3-1')).toBe(
      false
    );
    expect(
      ClinicOperationsService.getWaitingList(true).find((w) => w.patientId === 'pat-p3-1')?.status
    ).toBe('completed');

    // Re-emitting SessionFinalized for the same sessionId MUST remain strictly idempotent
    const replayResult = ClinicOperationsService.emitSessionFinalizedEvent({
      sessionId: sess.id,
      patientId: 'pat-p3-1',
      episodeId: ep.id,
      sessionDate: '2026-06-10',
      attendanceStatus: 'attended',
    });
    expect(replayResult.alreadyProcessed).toBe(true);
    expect(
      ClinicOperationsService.getInvoicesIQD().find((i) => i.id === pkgInv.id)?.packageUsedSessions
    ).toBe(1);

    // Manual package adjustment blocked for non-admin staff
    const roster = ClinicOperationsService.getStaffRoster();
    const nonAdmin = roster.find((s) => s.role !== 'admin')!;
    ClinicOperationsService.setActiveStaff(nonAdmin.id);
    expect(() =>
      ClinicOperationsService.adjustPackageSessionAdmin(pkgInv.id, 1, 'Should fail for non-admin')
    ).toThrow(/Admin/);

    // Switch back to Admin: empty reason rejected, valid reason succeeds + writes audit log
    const admin = roster.find((s) => s.role === 'admin')!;
    ClinicOperationsService.setActiveStaff(admin.id);
    expect(() => ClinicOperationsService.adjustPackageSessionAdmin(pkgInv.id, 1, '   ')).toThrow();

    ClinicOperationsService.adjustPackageSessionAdmin(
      pkgInv.id,
      1,
      'Patient used extra home-exercise review visit'
    );
    const adjustedPkg = ClinicOperationsService.getInvoicesIQD().find((i) => i.id === pkgInv.id)!;
    expect(adjustedPkg.packageUsedSessions).toBe(2);
    expect(adjustedPkg.packageAdjustments?.length).toBe(1);
    expect(adjustedPkg.packageAdjustments?.[0].reason).toBe(
      'Patient used extra home-exercise review visit'
    );

    const logs = ClinicOperationsService.getAuditLogs();
    expect(logs.some((l) => l.actionType === 'session_finalized_event' && l.entityId === sess.id)).toBe(true);
    expect(
      logs.some(
        (l) =>
          l.actionType === 'package_manual_adjustment' &&
          l.entityId === pkgInv.id &&
          l.summaryEn.includes('Patient used extra home-exercise review visit')
      )
    ).toBe(true);

    await ClinicOperationsService.flushPendingWrites();
    const chainCheck = await ClinicOperationsService.verifyAuditChain(db, dek);
    expect(chainCheck.valid).toBe(true);
  });

  it('3.7: enforces unique MRNs, sessionDate >= episode.startDate, and NPRS 0..10 bounds', async () => {
    const existingPatients = [
      { id: 'p1', data: { mrn: 'PT-000001' } },
      { id: 'p2', data: { mrn: 'PT-000002' } },
    ];
    // Editing own record preserves own MRN
    expect(ensureUniquePatientMrn('PT-000001', 'p1', existingPatients)).toBe('PT-000001');
    // Colliding with another patient's MRN advances cleanly
    expect(ensureUniquePatientMrn('PT-000001', 'p3', existingPatients)).toBe('PT-000003');
    // Blank MRN auto-generates next sequential MRN
    expect(ensureUniquePatientMrn(undefined, 'p4', existingPatients)).toBe('PT-000004');

    await seedPatientRecord(db, dek, 'pat-val-1', 'سارة فاضل', 'PT-000020');
    const ep = await EpisodeService.createEpisode(
      'pat-val-1',
      {
        title: 'آلام الرقبة',
        primarySpecialty: 'musculoskeletal',
        medicalDiagnosis: 'Cervical Radiculopathy',
        clinicalImpression: 'C6 irritation',
        affectedBodyRegion: 'Cervical Spine',
        startDate: '2026-06-15',
        status: 'active',
        rehabilitationGoals: { shortTerm: ['Reduce radicular pain'], longTerm: ['Work pain-free'] },
      },
      dek,
      'ep-val-1',
      db
    );

    // Rejects sessionDate before episode.startDate on createSession
    await expect(
      SessionService.createSession(
        'pat-val-1',
        ep.id,
        {
          sessionDate: '2026-06-14',
          sessionType: 'initial_evaluation',
          attendanceStatus: 'attended',
          therapistName: 'د. نور علي',
        },
        dek,
        'sess-bad-date',
        db
      )
    ).rejects.toThrow();

    // Accepts sessionDate >= episode.startDate
    const validSession = await SessionService.createSession(
      'pat-val-1',
      ep.id,
      {
        sessionDate: '2026-06-15',
        sessionType: 'initial_evaluation',
        attendanceStatus: 'attended',
        therapistName: 'د. نور علي',
      },
      dek,
      'sess-valid-date',
      db
    );
    expect(validSession.sessionDate).toBe('2026-06-15');

    // Rejects moving sessionDate earlier than episode.startDate on updateSession
    await expect(
      SessionService.updateSession(
        validSession.id,
        { sessionDate: '2026-06-10' },
        dek,
        db
      )
    ).rejects.toThrow();

    // Rejects out-of-range NPRS (< 0 or > 10)
    await expect(
      SoapService.createSoapNote(
        'pat-val-1',
        ep.id,
        validSession.id,
        {
          subjective: {
            chiefComplaint: 'ألم رقبة',
            painNrsScore: 11,
          },
          objective: {},
          assessment: {},
          plan: {},
        },
        dek,
        'soap-bad-nrs',
        db
      )
    ).rejects.toThrow();

    await expect(
      SoapService.createSoapNote(
        'pat-val-1',
        ep.id,
        validSession.id,
        {
          subjective: {
            chiefComplaint: 'ألم رقبة',
            painNrsScore: -1,
          },
          objective: {},
          assessment: {},
          plan: {},
        },
        dek,
        'soap-neg-nrs',
        db
      )
    ).rejects.toThrow();

    // Accepts valid NPRS 0..10 and validates postSessionPainNrs on updateSoapNote
    const validSoap = await SoapService.createSoapNote(
      'pat-val-1',
      ep.id,
      validSession.id,
      {
        subjective: {
          chiefComplaint: 'ألم رقبة',
          painNrsScore: 6,
          postSessionPainNrs: 3,
        },
        objective: {},
        assessment: {},
        plan: {},
      },
      dek,
      'soap-valid-nrs',
      db
    );
    expect(validSoap.data.subjective.painNrsScore).toBe(6);

    await expect(
      SoapService.updateSoapNote(
        validSoap.id,
        {
          subjective: {
            chiefComplaint: 'ألم رقبة',
            painNrsScore: 6,
            postSessionPainNrs: 12,
          },
        },
        dek,
        db
      )
    ).rejects.toThrow();
  });

  it('3.8: annotates built-in clinical content catalogs with governance metadata (source + Pending Review)', () => {
    expect(ROM_MMT_CATALOG_GOVERNANCE.source).toBeTruthy();
    expect(ROM_MMT_CATALOG_GOVERNANCE.reviewedBy).toBeNull();
    expect(MYOTOMES_CATALOG_GOVERNANCE.source).toBeTruthy();
    expect(DTR_CATALOG_GOVERNANCE.source).toBeTruthy();
    expect(DERMATOMES_CATALOG_GOVERNANCE.source).toBeTruthy();

    expect(PT_EXERCISE_CATALOG.length).toBeGreaterThan(0);
    for (const ex of PT_EXERCISE_CATALOG) {
      expect(ex.governance.source.trim().length).toBeGreaterThan(0);
      expect(ex.governance.reviewedBy).toBeNull();
      expect(ex.governance.reviewedDate).toBeNull();
    }

    for (const rf of RED_FLAG_CHECKLIST_CATALOG) {
      expect(rf.governance.source.trim().length).toBeGreaterThan(0);
      expect(rf.governance.reviewedBy).toBeNull();
    }

    for (const concept of CANONICAL_MMT_CONCEPTS) {
      expect(concept.governance.source.trim().length).toBeGreaterThan(0);
    }
  });
});
