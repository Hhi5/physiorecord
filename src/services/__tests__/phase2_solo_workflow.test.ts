// =======================================================================
// PhysioRecord — Phase 2: Solo Therapist Workflow, Smart Memory, EOD Summary & 8s Finish Undo Tests
// =======================================================================

import { describe, it, expect, beforeEach } from 'vitest';
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
  DEFAULT_QUICK_SOAP_CHIPS,
} from '../clinicOperationsService';
import { EpisodeService } from '../episodeService';
import {
  SessionService,
  verifySessionSeal,
  verifySoapSeal,
} from '../sessionService';
import { SoapService } from '../soapService';
import {
  LocalStorageMigrationService,
  type StorageLike,
} from '../localStorageMigrationService';
import { addDaysToDateStr, buildWhatsAppReminderUrl, localDate } from '../../utils/date';
import type { FinishUndoSnapshot } from '../../types/clinicManagement';

class MemoryStorage implements StorageLike {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

async function setupInitializedVault(initialVerno = 7): Promise<{
  db: PhysioRecordDatabase;
  dek: CryptoKey;
}> {
  const db = createInMemoryDatabase(initialVerno);
  const salt = randomBytes(CONSTANTS.SALT_BYTES);
  const kek = await deriveKEK('SoloTherapistKey!99', salt, 1000);
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
  fullName: string
): Promise<void> {
  const enc = await encryptRecordWithMandatoryReservation(
    db,
    dek,
    'patients',
    patientId,
    [],
    { fullName, gender: 'male', phone: '07701234567' }
  );
  await db.patients.put({
    id: patientId,
    createdAt: '2026-05-01T08:00:00.000Z',
    updatedAt: '2026-05-01T08:00:00.000Z',
    isArchived: 0,
    recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
    dekVersion: CURRENT_DEK_VERSION,
    iv: enc.iv,
    ciphertext: enc.ciphertext,
  });
}

describe('Phase 2 — Solo Therapist Experience, Smart Memory & Non-Destructive Finish Undo', () => {
  beforeEach(async () => {
    const fresh = await setupInitializedVault(7);
    await ClinicOperationsService.hydrateEncryptedCache(fresh.dek, fresh.db);
  });

  it('2.1: requires first-run wizard on empty vault, configures Solo Mode without Admin PIN prompt, and upgrades legacy vaults to Team Mode', async () => {
    const { db, dek } = await setupInitializedVault(7);

    expect(ClinicOperationsService.requiresFirstRunModeWizard()).toBe(true);
    // Unconfigured vault stays fail-closed for Admin PIN until Solo Mode explicitly disables it
    expect(ClinicOperationsService.requiresFirstRunAdminPinSetup()).toBe(true);

    // Select Solo Mode
    const soloMode = await ClinicOperationsService.configureSoloModeAsync({
      therapistNameAr: 'د. سارة أحمد',
      therapistNameEn: 'Dr. Sara Ahmed',
      clinicNameAr: 'عيادة بغداد للعلاج الطبيعي',
      clinicNameEn: 'Baghdad PT Clinic',
    });

    expect(soloMode.mode).toBe('solo');
    expect(soloMode.wizardCompleted).toBe(true);
    expect(ClinicOperationsService.isSoloMode()).toBe(true);
    expect(ClinicOperationsService.requiresFirstRunModeWizard()).toBe(false);
    expect(ClinicOperationsService.requiresFirstRunAdminPinSetup()).toBe(false);

    const roster = ClinicOperationsService.getStaffRoster();
    expect(roster).toHaveLength(1);
    expect(roster[0].role).toBe('admin');
    expect(roster[0].nameAr).toBe('د. سارة أحمد');

    await ClinicOperationsService.flushPendingWrites();

    // Re-hydrate from encrypted IndexedDB store and verify Solo Mode persistence
    await ClinicOperationsService.hydrateEncryptedCache(dek, db);
    expect(ClinicOperationsService.isSoloMode()).toBe(true);
    expect(ClinicOperationsService.requiresFirstRunModeWizard()).toBe(false);
    expect(ClinicOperationsService.getClinicProfile().clinicNameAr).toBe(
      'عيادة بغداد للعلاج الطبيعي'
    );

    // Switch from Solo Mode -> Team Mode: expands roster and enforces Team Admin PIN setup
    await ClinicOperationsService.switchWorkspaceModeAsync('team');
    expect(ClinicOperationsService.isSoloMode()).toBe(false);
    expect(ClinicOperationsService.getStaffRoster().length).toBeGreaterThan(1);
    expect(ClinicOperationsService.requiresFirstRunAdminPinSetup()).toBe(true);

    await ClinicOperationsService.setAdminPinAsync('739150');
    expect(ClinicOperationsService.requiresFirstRunAdminPinSetup()).toBe(false);

    // Legacy pre-Phase-2 vault (has patient activity without workspace_mode row) upgrades to Team Mode silently
    const legacy = await setupInitializedVault(7);
    await seedPatientRecord(legacy.db, legacy.dek, 'pat-legacy-1', 'مريض سابق');
    await ClinicOperationsService.hydrateEncryptedCache(legacy.dek, legacy.db);

    expect(ClinicOperationsService.requiresFirstRunModeWizard()).toBe(false);
    expect(ClinicOperationsService.isSoloMode()).toBe(false);
    expect(ClinicOperationsService.getWorkspaceMode().mode).toBe('team');
  });

  it('2.2 & 2.6: keeps default clinic services empty, persists encrypted Smart Memory & Quick SOAP chips, and stores zero PHI in localStorage', async () => {
    const { db, dek } = await setupInitializedVault(7);
    await ClinicOperationsService.configureSoloModeAsync();

    // R2: Zero hardcoded fees/prices by default
    expect(ClinicOperationsService.getClinicServices()).toEqual([]);

    // Configure user's own services
    await ClinicOperationsService.saveClinicServicesAsync([
      {
        id: 'svc_manual',
        nameAr: 'جلسة علاج يدوي وتمارين',
        nameEn: 'Manual Therapy & Exercise',
        invoiceType: 'single_session',
        priceIQD: 30000,
        isActive: true,
      },
    ]);

    // Pinned & Recent patient memory
    ClinicOperationsService.recordPatientVisitMemory('pat-1');
    ClinicOperationsService.recordPatientVisitMemory('pat-2');
    const pinnedState = ClinicOperationsService.togglePinnedPatient('pat-2');
    expect(pinnedState).toBe(true);
    expect(ClinicOperationsService.getRecentPatientIds()).toEqual(['pat-2', 'pat-1']);
    expect(ClinicOperationsService.getPinnedPatientIds()).toEqual(['pat-2']);

    // Custom Quick SOAP chips
    const customChips = [
      ...DEFAULT_QUICK_SOAP_CHIPS,
      {
        id: 'chip_custom_mckenzie',
        category: 'exercise' as const,
        labelAr: 'تمارين ماكنزي للامتداد',
        labelEn: 'McKenzie extension protocol',
        sets: 3,
        reps: 10,
      },
    ];
    await ClinicOperationsService.saveQuickSoapChipsAsync(customChips);
    await ClinicOperationsService.flushPendingWrites();

    // Re-hydrate from Dexie to verify AES-GCM persistence
    await ClinicOperationsService.hydrateEncryptedCache(dek, db);
    expect(ClinicOperationsService.getClinicServices()).toHaveLength(1);
    expect(ClinicOperationsService.getClinicServices()[0].priceIQD).toBe(30000);
    expect(ClinicOperationsService.isPatientPinned('pat-2')).toBe(true);
    expect(ClinicOperationsService.getRecentPatientIds()).toEqual(['pat-2', 'pat-1']);
    expect(
      ClinicOperationsService.getQuickSoapChips().some(
        (c) => c.id === 'chip_custom_mckenzie'
      )
    ).toBe(true);

    // 2.7 localStorage keys allowed without PHI alerts
    const storage = new MemoryStorage();
    storage.setItem('physiorecord_language', 'ar');
    storage.setItem('physiorecord_font_scale', '115');
    storage.setItem('physiorecord_reduce_motion', 'true');
    expect(LocalStorageMigrationService.findPhiLikeLocalStorageEntries(storage)).toEqual([]);

    // Injecting unallowed PHI-like key triggers detection
    storage.setItem('physiorecord_patient_notes_leak', 'Patient Name: Ali');
    expect(
      LocalStorageMigrationService.findPhiLikeLocalStorageEntries(storage).length
    ).toBe(1);
  });

  it('2.3 & 2.5: fetches previous episode SOAP note for Copy-Forward, tracks draft sessions, aggregates EOD Iraq payment methods & builds pure WhatsApp URLs', async () => {
    const { db, dek } = await setupInitializedVault(7);
    await ClinicOperationsService.configureSoloModeAsync({
      therapistNameAr: 'د. سارة أحمد',
      therapistNameEn: 'Dr. Sara Ahmed',
    });

    await seedPatientRecord(db, dek, 'pat-cf-1', 'أحمد كريم');
    const episode = await EpisodeService.createEpisode(
      'pat-cf-1',
      {
        title: 'تأهيل الكتف المتجمد',
        primarySpecialty: 'musculoskeletal',
        medicalDiagnosis: 'Adhesive Capsulitis',
        clinicalImpression: 'Restricted external rotation & abduction',
        affectedBodyRegion: 'Right Shoulder',
        startDate: '2026-05-01',
        status: 'active',
        rehabilitationGoals: {
          shortTerm: ['Reduce pain < 4/10'],
          longTerm: ['Overhead reach pain-free'],
        },
      },
      dek,
      'ep-cf-1',
      db
    );

    const sess1 = await SessionService.createSession(
      'pat-cf-1',
      episode.id,
      {
        sessionDate: '2026-05-01',
        sessionType: 'initial_evaluation',
        attendanceStatus: 'attended',
        therapistName: 'د. سارة أحمد',
      },
      dek,
      'sess-cf-1',
      db
    );

    await SoapService.createSoapNote(
      'pat-cf-1',
      episode.id,
      sess1.id,
      {
        subjective: {
          chiefComplaint: 'ألم ليلي في الكتف الأيمن',
          painNrsScore: 7,
          postSessionPainNrs: 5,
        },
        objective: {
          dailyInterventionsSummary: 'تحريك مفصلي درجة ثانية وتمارين بندولية',
          status: 'assessed',
        },
        assessment: {
          clinicalImpressionCurrent: 'تحسن بسيط بعد التحريك اللطيف',
          progressStatus: 'improved',
        },
        plan: {
          nextSessionPlan: 'زيادة مدى الدوران الخارجي تدريجياً',
          homeInstructions: 'تمارين العصا ٣ مرات يومياً',
        },
      },
      dek,
      'soap-cf-1',
      db
    );

    await SessionService.finalizeSession(sess1.id, 'د. سارة أحمد', dek, db);

    // Create second draft session
    const sess2 = await SessionService.createSession(
      'pat-cf-1',
      episode.id,
      {
        sessionDate: '2026-05-04',
        sessionType: 'follow_up',
        attendanceStatus: 'attended',
        therapistName: 'د. سارة أحمد',
      },
      dek,
      'sess-cf-2',
      db
    );

    const drafts = await SessionService.getAllDraftSessions(dek, db);
    expect(drafts.map((d) => d.id)).toContain(sess2.id);
    expect(drafts.map((d) => d.id)).not.toContain(sess1.id);

    const prevSoapResult = await SoapService.getLatestEpisodeSoapNote(
      episode.id,
      sess2.id,
      dek,
      db,
      sess2.sessionNumber,
      sess2.sessionDate
    );
    expect(prevSoapResult.soapNote).not.toBeNull();
    expect(prevSoapResult.sourceSessionId).toBe(sess1.id);
    expect(prevSoapResult.sourceSessionNumber).toBe(1);
    expect(prevSoapResult.soapNote?.data.plan.homeInstructions).toBe(
      'تمارين العصا ٣ مرات يومياً'
    );

    // 2.5 End-of-Day Cash/ZainCash/QiCard/Other summary
    const today = localDate();
    ClinicOperationsService.createInvoiceIQD({
      patientId: 'pat-cf-1',
      patientName: 'أحمد كريم',
      episodeId: episode.id,
      invoiceType: 'single_session',
      titleAr: 'جلسة مفردة',
      titleEn: 'Single Session',
      totalAmountIQD: 25000,
      discountIQD: 0,
      initialPaidIQD: 25000,
      paymentMethod: 'cash',
    });
    ClinicOperationsService.createInvoiceIQD({
      patientId: 'pat-cf-1',
      patientName: 'أحمد كريم',
      episodeId: episode.id,
      invoiceType: 'rehab_package',
      titleAr: 'كورس تأهيل',
      titleEn: 'Rehab Package',
      totalAmountIQD: 120000,
      discountIQD: 20000,
      initialPaidIQD: 50000,
      paymentMethod: 'zain_cash',
      packageTotalSessions: 6,
    });
    ClinicOperationsService.createInvoiceIQD({
      patientId: 'pat-cf-1',
      patientName: 'أحمد كريم',
      invoiceType: 'evaluation',
      titleAr: 'فحص أولي',
      titleEn: 'Evaluation',
      totalAmountIQD: 15000,
      discountIQD: 0,
      initialPaidIQD: 15000,
      paymentMethod: 'qi_card',
    });
    ClinicOperationsService.addExpenseIQD({
      date: today,
      category: 'medical_consumables',
      titleAr: 'شريط لاصق طبي',
      titleEn: 'Kinesio Tape',
      amountIQD: 10000,
      paidBy: 'د. سارة أحمد',
    });

    const summary = ClinicOperationsService.getFinanceSummaryForDate(today);
    expect(summary.totalCollectedIQD).toBe(90000);
    expect(summary.byMethod.cash).toBe(25000);
    expect(summary.byMethod.zain_cash).toBe(50000);
    expect(summary.byMethod.qi_card).toBe(15000);
    expect(summary.byMethod.other).toBe(0);
    expect(summary.expensesIQD).toBe(10000);
    expect(summary.netCashIQD).toBe(80000);

    // 2.5 WhatsApp deep link builder (offline pure function)
    const waUrl = buildWhatsAppReminderUrl('0770 123 4567', 'موعدك غداً 10:00 ص');
    expect(waUrl).toContain('https://wa.me/9647701234567?text=');
    expect(buildWhatsAppReminderUrl('123', 'short')).toBeNull();
    expect(addDaysToDateStr('2026-05-01', 2)).toBe('2026-05-03');
  });

  it('2.4: Finish Sequence 8s Undo reverts billing & rebooked appointment while keeping finalized SOAP & session seals intact (R1)', async () => {
    const { db, dek } = await setupInitializedVault(7);
    await ClinicOperationsService.configureSoloModeAsync({
      therapistNameAr: 'د. سارة أحمد',
      therapistNameEn: 'Dr. Sara Ahmed',
    });

    await seedPatientRecord(db, dek, 'pat-fin-1', 'زينب حسن');
    const episode = await EpisodeService.createEpisode(
      'pat-fin-1',
      {
        title: 'إصابة الرباط الجانبي للركبة',
        primarySpecialty: 'musculoskeletal',
        medicalDiagnosis: 'MCL Sprain Grade II',
        clinicalImpression: 'Medial joint line tenderness, improving stability',
        affectedBodyRegion: 'Left Knee',
        startDate: '2026-05-01',
        status: 'active',
        rehabilitationGoals: {
          shortTerm: ['Full extension'],
          longTerm: ['Return to running'],
        },
      },
      dek,
      'ep-fin-1',
      db
    );

    const today = localDate();
    const todayAppt = ClinicOperationsService.saveAppointment({
      patientId: 'pat-fin-1',
      patientName: 'زينب حسن',
      episodeId: episode.id,
      episodeTitle: episode.data.title,
      therapistName: 'د. سارة أحمد',
      date: today,
      startTime: '11:00',
      durationMinutes: 45,
      visitType: 'follow_up',
      status: 'arrived',
    });

    const session = await SessionService.createSession(
      'pat-fin-1',
      episode.id,
      {
        sessionDate: today,
        sessionType: 'follow_up',
        attendanceStatus: 'attended',
        therapistName: 'د. سارة أحمد',
      },
      dek,
      'sess-fin-1',
      db
    );

    await SoapService.createSoapNote(
      'pat-fin-1',
      episode.id,
      session.id,
      {
        subjective: {
          chiefComplaint: 'ثبات أفضل عند المشي',
          painNrsScore: 4,
          postSessionPainNrs: 2,
        },
        objective: {
          dailyInterventionsSummary: 'تقوية العضلة رباعية الرؤوس',
          status: 'assessed',
        },
        assessment: {
          clinicalImpressionCurrent: 'تحسن جيد في المدى الحركي',
          progressStatus: 'improved',
        },
        plan: {
          nextSessionPlan: 'تمارين توازن أحادي الساق',
        },
      },
      dek,
      'soap-fin-1',
      db
    );

    // Finalize Session + SOAP clinically (irreversible R1 clinical seal)
    await SessionService.finalizeSession(session.id, 'د. سارة أحمد', dek, db);

    // Execute billing & next-appointment steps from Finish flow
    ClinicOperationsService.updateAppointmentStatus(todayAppt.id, 'completed');
    const createdInvoice = ClinicOperationsService.createInvoiceIQD({
      patientId: 'pat-fin-1',
      patientName: 'زينب حسن',
      episodeId: episode.id,
      invoiceType: 'single_session',
      titleAr: 'جلسة ركبة',
      titleEn: 'Knee Session',
      totalAmountIQD: 25000,
      discountIQD: 0,
      initialPaidIQD: 25000,
      paymentMethod: 'cash',
    });
    const nextAppt = ClinicOperationsService.saveAppointment({
      patientId: 'pat-fin-1',
      patientName: 'زينب حسن',
      episodeId: episode.id,
      episodeTitle: episode.data.title,
      therapistName: 'د. سارة أحمد',
      date: addDaysToDateStr(today, 2),
      startTime: '11:00',
      durationMinutes: 45,
      visitType: 'follow_up',
      status: 'scheduled',
    });

    const undoSnapshot: FinishUndoSnapshot = {
      createdInvoiceId: createdInvoice.id,
      createdPaymentId: createdInvoice.payments[0]?.id,
      createdAppointmentId: nextAppt.id,
      previousAppointmentId: todayAppt.id,
      previousAppointmentStatus: 'arrived',
    };

    expect(ClinicOperationsService.getInvoicesIQD()).toHaveLength(1);
    expect(ClinicOperationsService.getAppointments()).toHaveLength(2);

    // Trigger 8-second Undo
    ClinicOperationsService.undoFinishSequenceBillingAndBooking(undoSnapshot);
    await ClinicOperationsService.flushPendingWrites();

    // Billing & booking cleanly rolled back
    expect(ClinicOperationsService.getInvoicesIQD()).toHaveLength(0);
    const apptsAfterUndo = ClinicOperationsService.getAppointments();
    expect(apptsAfterUndo).toHaveLength(1);
    expect(apptsAfterUndo[0].id).toBe(todayAppt.id);
    expect(apptsAfterUndo[0].status).toBe('arrived');

    // Finalized clinical SOAP & Session remain IMMUTABLE & cryptographically valid (R1)
    const finalizedSessionAfter = await SessionService.getSessionById(session.id, dek, db);
    const finalizedSoapAfter = await SoapService.getSoapNoteBySession(session.id, dek, db);
    expect(finalizedSessionAfter?.status).toBe('finalized');
    expect(finalizedSoapAfter?.data.isFinalized).toBe(true);

    const soapSeal = await verifySoapSeal(finalizedSoapAfter!.data);
    const sessSeal = await verifySessionSeal(
      finalizedSessionAfter!.data,
      finalizedSoapAfter!.data
    );
    expect(soapSeal.status).toBe('valid');
    expect(sessSeal.status).toBe('valid');
  });

  it('2.8: persists onboarding tips/tour state encrypted and clears demo operational records cleanly with 1-click delete', async () => {
    const { db, dek } = await setupInitializedVault(7);
    await ClinicOperationsService.configureSoloModeAsync();

    await ClinicOperationsService.dismissTipAsync('today_walkin');
    await ClinicOperationsService.setTourCompletedAsync(true);
    await ClinicOperationsService.setTipsEnabledAsync(false);
    await ClinicOperationsService.flushPendingWrites();

    await ClinicOperationsService.hydrateEncryptedCache(dek, db);
    const ob = ClinicOperationsService.getOnboardingState();
    expect(ob.dismissedTipIds).toContain('today_walkin');
    expect(ob.tourCompleted).toBe(true);
    expect(ob.tipsEnabled).toBe(false);

    await ClinicOperationsService.resetOnboardingAsync();
    expect(ClinicOperationsService.getOnboardingState().dismissedTipIds).toEqual([]);
    expect(ClinicOperationsService.getOnboardingState().tourCompleted).toBe(false);
    expect(ClinicOperationsService.getOnboardingState().tipsEnabled).toBe(true);

    // Create 1 real + 1 demo operational record set
    const today = localDate();
    ClinicOperationsService.saveAppointment({
      patientId: 'pat-real-1',
      patientName: 'مريض حقيقي',
      therapistName: 'د. سارة أحمد',
      date: today,
      startTime: '09:00',
      durationMinutes: 30,
      visitType: 'follow_up',
      status: 'scheduled',
    });
    ClinicOperationsService.saveAppointment({
      patientId: 'demo_pat_1',
      isDemo: true,
      patientName: 'مريض تجريبي',
      therapistName: 'د. سارة أحمد',
      date: today,
      startTime: '10:00',
      durationMinutes: 45,
      visitType: 'initial_evaluation',
      status: 'scheduled',
    });
    ClinicOperationsService.createInvoiceIQD({
      patientId: 'demo_pat_1',
      isDemo: true,
      patientName: 'مريض تجريبي',
      invoiceType: 'single_session',
      titleAr: 'تجريبي',
      titleEn: 'Demo',
      totalAmountIQD: 25000,
      discountIQD: 0,
      initialPaidIQD: 25000,
      paymentMethod: 'cash',
    });
    ClinicOperationsService.recordPatientVisitMemory('pat-real-1');
    ClinicOperationsService.recordPatientVisitMemory('demo_pat_1');

    expect(ClinicOperationsService.hasDemoOperationsData()).toBe(true);
    ClinicOperationsService.deleteAllDemoOperationsData();
    await ClinicOperationsService.flushPendingWrites();

    expect(ClinicOperationsService.hasDemoOperationsData()).toBe(false);
    expect(ClinicOperationsService.getAppointments()).toHaveLength(1);
    expect(ClinicOperationsService.getAppointments()[0].patientId).toBe('pat-real-1');
    expect(ClinicOperationsService.getInvoicesIQD()).toHaveLength(0);
    expect(ClinicOperationsService.getRecentPatientIds()).toEqual(['pat-real-1']);
  });
});
