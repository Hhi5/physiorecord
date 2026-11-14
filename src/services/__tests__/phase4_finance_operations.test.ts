// =======================================================================
// PhysioRecord — Phase 4: Finance, Print, Scheduling, WhatsApp & Consents Tests
// Covers:
//   4.1 Gap-free sequential numbering (INV/RCPT/CN/Z), hard-delete disabled,
//       Void Invoice w/ Credit Note + negative reversals, single payment reversal,
//       plus internal 8s uncommitted Finish Undo compatibility
//   4.2 Per-payment FX currency & exchange rate snapshots
//   4.3 Daily Cash Close (Z-Report), Monthly Net Cash Flow & RFC-4180 CSV BOM/XSS guard
//   4.4 Encrypted Clinic Profile branding (logo/stamp/footer) & schedule config
//   4.5 Conflict detection, cancel/no-show reason stats, waitlist freed-slot match
//   4.7 Encrypted WhatsApp templates & user-initiated +964 wa.me link normalization
//   4.8 Consent module toggle, v8 encrypted storage, revocation, merge guard & purge
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
import { exportBackupPackage, restoreBackupPackage } from '../../crypto/backup';
import type { PhysioRecordDatabase } from '../../db/db';
import { ClinicOperationsService } from '../clinicOperationsService';
import {
  buildInvoicesCsv,
  buildMonthlySummaryCsv,
  sanitizeCsvFormulaInjection,
} from '../../utils/csvExport';
import { isValidEncryptedImageDataUrl } from '../../utils/imageUtils';
import {
  buildAppointmentReminderText,
  buildHepWhatsAppText,
  buildReceiptWhatsAppText,
  buildUserInitiatedWhatsAppHref,
} from '../../utils/whatsappTemplates';
import { CONSENT_TEMPLATES } from '../../data/consentTemplates';
import { localDate } from '../../utils/date';

const VALID_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

async function setupInitializedVault(initialVerno = 8): Promise<{
  db: PhysioRecordDatabase;
  dek: CryptoKey;
  kek: CryptoKey;
}> {
  const db = createInMemoryDatabase(initialVerno);
  const salt = randomBytes(CONSTANTS.SALT_BYTES);
  const kek = await deriveKEK('Phase4ClinicPass#2026', salt, 1000);
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
    schemaVersion: db.verno,
    kdfAlgorithm: 'PBKDF2-HMAC-SHA256',
    kdfIterations: 1000,
    dekVersion: CURRENT_DEK_VERSION,
    encryptionInvocationCount: 0,
    vaultGeneration: 1,
  });

  bindDekToGeneration(operationalDek, 1);
  await ClinicOperationsService.hydrateEncryptedCache(operationalDek, db);
  return { db, dek: operationalDek, kek };
}

async function seedPatientRecord(
  db: PhysioRecordDatabase,
  dek: CryptoKey,
  patientId: string,
  fullName: string,
  phoneNumber = '07701234567'
): Promise<void> {
  const enc = await encryptRecordWithMandatoryReservation(db, dek, 'patients', patientId, [], {
    fullName,
    fullNameAr: fullName,
    gender: 'male',
    phone: phoneNumber,
    phoneNumber,
  });
  await db.patients.put({
    id: patientId,
    createdAt: '2026-06-01T08:00:00.000Z',
    updatedAt: '2026-06-01T08:00:00.000Z',
    isArchived: 0,
    recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
    dekVersion: CURRENT_DEK_VERSION,
    recordSalt: enc.recordSalt,
    iv: enc.iv,
    ciphertext: enc.ciphertext,
  });
}

describe('Phase 4 — Finance, Printing, Scheduling, WhatsApp & Informed Consents', () => {
  beforeEach(async () => {
    const fresh = await setupInitializedVault(8);
    await ClinicOperationsService.hydrateEncryptedCache(fresh.dek, fresh.db);
  });

  it('4.1: enforces gap-free financial numbering, blocks hard deletion, supports Credit Note voiding & single payment reversal', async () => {
    const { db, dek } = await setupInitializedVault(8);
    await seedPatientRecord(db, dek, 'p4-inv-1', 'كريم فاضل');

    const inv1 = ClinicOperationsService.createInvoiceIQD({
      patientId: 'p4-inv-1',
      patientName: 'كريم فاضل',
      invoiceType: 'rehab_package',
      titleAr: 'كورس تأهيل رقبة (6 جلسات)',
      titleEn: 'Cervical Rehab Course (6 sessions)',
      totalAmountIQD: 150000,
      discountIQD: 0,
      initialPaidIQD: 50000,
      paymentMethod: 'cash',
      currencyCode: 'IQD',
    });

    expect(inv1.invoiceNumber).toBe('INV-0001');
    expect(inv1.payments[0]?.receiptNumber).toBe('RCPT-0001');
    expect(inv1.status).toBe('partial');
    expect(inv1.balanceDueIQD).toBe(100000);

    // 4.1 Hard-delete guard must throw
    expect(() => ClinicOperationsService.deleteInvoiceIQD(inv1.id)).toThrow();
    expect(ClinicOperationsService.getInvoicesIQD()).toHaveLength(1);

    // Void requires mandatory reason
    expect(() => ClinicOperationsService.voidInvoiceWithReasonIQD(inv1.id, '   ')).toThrow();

    // Void issues Credit Note CN-0001 + negative reversal RCPT-0002
    const afterVoid = ClinicOperationsService.voidInvoiceWithReasonIQD(
      inv1.id,
      'طلب المريض إلغاء الباقة واسترداد المبلغ'
    );
    const voided = afterVoid.find((i) => i.id === inv1.id)!;
    expect(voided.status).toBe('void');
    expect(voided.creditNoteNumber).toBe('CN-0001');
    expect(voided.voidReason).toBe('طلب المريض إلغاء الباقة واسترداد المبلغ');
    expect(voided.paidAmountIQD).toBe(0);
    expect(voided.balanceDueIQD).toBe(0);
    expect(voided.payments).toHaveLength(2);
    expect(voided.payments[1].receiptNumber).toBe('RCPT-0002');
    expect(voided.payments[1].amountIQD).toBe(-50000);
    expect(voided.payments[1].isReversal).toBe(true);

    // Voided invoices are excluded from active patient billed/debt totals
    const summaryAfterVoid = ClinicOperationsService.getPatientFinancialSummaryIQD('p4-inv-1');
    expect(summaryAfterVoid.totalBilledIQD).toBe(0);
    expect(summaryAfterVoid.totalDebtIQD).toBe(0);

    // Next invoice picks up INV-0002 cleanly with single payment reversal
    const inv2 = ClinicOperationsService.createInvoiceIQD({
      patientId: 'p4-inv-1',
      patientName: 'كريم فاضل',
      invoiceType: 'single_session',
      titleAr: 'جلسة مفردة',
      titleEn: 'Single Session',
      totalAmountIQD: 40000,
      discountIQD: 0,
      initialPaidIQD: 25000,
      paymentMethod: 'zain_cash',
      currencyCode: 'IQD',
    });
    expect(inv2.invoiceNumber).toBe('INV-0002');
    expect(inv2.payments[0].receiptNumber).toBe('RCPT-0003');

    // Empty reversal reason throws
    expect(() =>
      ClinicOperationsService.reversePaymentIQD(inv2.id, inv2.payments[0].id, '')
    ).toThrow();

    const afterPayReverse = ClinicOperationsService.reversePaymentIQD(
      inv2.id,
      inv2.payments[0].id,
      'خطأ في إدخال مبلغ زين كاش'
    );
    const inv2Updated = afterPayReverse.find((i) => i.id === inv2.id)!;
    expect(inv2Updated.paidAmountIQD).toBe(0);
    expect(inv2Updated.balanceDueIQD).toBe(40000);
    expect(inv2Updated.status).toBe('unpaid');
    expect(inv2Updated.payments[1].receiptNumber).toBe('RCPT-0004');
    expect(inv2Updated.payments[1].amountIQD).toBe(-25000);

    // Internal 8s uncommitted checkout undo remains functional (Phase 2.4 compatibility)
    const uncommitted = ClinicOperationsService.createInvoiceIQD({
      patientId: 'p4-inv-1',
      patientName: 'كريم فاضل',
      invoiceType: 'evaluation',
      titleAr: 'فحص أولي',
      titleEn: 'Evaluation',
      totalAmountIQD: 30000,
      discountIQD: 0,
      initialPaidIQD: 30000,
      paymentMethod: 'cash',
      currencyCode: 'IQD',
    });
    ClinicOperationsService.undoFinishSequenceBillingAndBooking({
      createdInvoiceId: uncommitted.id,
      createdPaymentId: uncommitted.payments[0].id,
    });
    expect(
      ClinicOperationsService.getInvoicesIQD().some((i) => i.id === uncommitted.id)
    ).toBe(false);

    await ClinicOperationsService.flushPendingWrites();
    await ClinicOperationsService.hydrateEncryptedCache(dek, db);
    expect(ClinicOperationsService.getFinancialSequences().invoiceSequence).toBeGreaterThanOrEqual(3);
    const inv4 = ClinicOperationsService.createInvoiceIQD({
      patientId: 'p4-inv-1',
      patientName: 'كريم فاضل',
      invoiceType: 'single_session',
      titleAr: 'جلسة متابعة',
      titleEn: 'Follow-up Session',
      totalAmountIQD: 25000,
      discountIQD: 0,
      initialPaidIQD: 0,
      paymentMethod: 'cash',
      currencyCode: 'IQD',
    });
    expect(inv4.invoiceNumber).toBe('INV-0004');
  });

  it('4.2 & 4.3: snapshots FX currency payments, computes Daily Z-Report + Monthly Net Cash Flow & sanitizes CSV exports', async () => {
    const { db, dek } = await setupInitializedVault(8);
    await seedPatientRecord(db, dek, 'p4-fx-1', '=CMD|calc', '07809876543');

    // Invoice in IQD with USD payment @ 1,500 IQD/USD -> $50 USD = 75,000 IQD
    const inv = ClinicOperationsService.createInvoiceIQD({
      patientId: 'p4-fx-1',
      patientName: '=CMD|calc',
      invoiceType: 'rehab_package',
      titleAr: 'كورس علاج طبيعي',
      titleEn: 'PT Course',
      totalAmountIQD: 150000,
      discountIQD: 0,
      initialPaidIQD: 0,
      paymentMethod: 'cash',
      currencyCode: 'IQD',
      paymentCurrencyCode: 'USD',
      originalPaidAmount: 50,
      exchangeRateToPrimary: 1500,
    });

    expect(inv.payments).toHaveLength(1);
    const fxPay = inv.payments[0];
    expect(fxPay.currencyCode).toBe('USD');
    expect(fxPay.primaryCurrencyCode).toBe('IQD');
    expect(fxPay.originalAmount).toBe(50);
    expect(fxPay.exchangeRateToPrimary).toBe(1500);
    expect(fxPay.amountIQD).toBe(75000);
    expect(inv.paidAmountIQD).toBe(75000);
    expect(inv.balanceDueIQD).toBe(75000);

    // Additional IQD payment via QiCard
    ClinicOperationsService.recordPaymentOnInvoiceIQD(
      inv.id,
      25000,
      'qi_card',
      'الدفعة الثانية',
      { primaryCurrencyCode: 'IQD' }
    );

    const today = localDate();
    const monthKey = today.slice(0, 7);

    // Operating expense
    ClinicOperationsService.addExpenseIQD({
      date: today,
      category: 'medical_consumables',
      titleAr: 'أربطة وكمادات',
      titleEn: 'Bandages & Cold Packs',
      amountIQD: 15000,
      paidBy: 'د. سارة',
    });

    // Z-Report Draft & Cash Close
    const draft = ClinicOperationsService.buildDailyCashZReportDraft(
      today,
      'IQD',
      62000,
      'زيادة بسيطة'
    );
    expect(draft.totalCollectedPrimary).toBe(100000);
    expect(draft.totalExpensesPrimary).toBe(15000);
    expect(draft.netCashFlowPrimary).toBe(85000);
    // Expected cash in drawer = 75,000 cash - 15,000 cash expenses = 60,000; counted 62,000 => +2,000
    expect(draft.byMethod.cash - draft.totalExpensesPrimary).toBe(60000);
    expect(draft.cashVariance).toBe(2000);

    const closedZ = await ClinicOperationsService.closeDailyCashZReportAsync({
      dateKey: today,
      primaryCurrencyCode: 'IQD',
      countedCashActual: 62000,
      notes: 'مطابقة الصندوق',
    });
    expect(closedZ.zReportNumber).toBe('Z-0001');

    await ClinicOperationsService.flushPendingWrites();
    await ClinicOperationsService.hydrateEncryptedCache(dek, db);
    expect(ClinicOperationsService.getCashCloses()).toHaveLength(1);
    expect(ClinicOperationsService.getCashCloses()[0].zReportNumber).toBe('Z-0001');

    // Monthly Summary & Net Cash Flow + Currency breakdown
    const monthly = ClinicOperationsService.getMonthlyFinanceSummary(monthKey, 'IQD');
    expect(monthly.netCashFlowPrimary).toBe(85000);
    expect(monthly.byCurrency.USD.collectedOriginal).toBe(50);
    expect(monthly.byCurrency.USD.collectedPrimary).toBe(75000);
    expect(monthly.byCurrency.IQD.collectedPrimary).toBe(25000);

    // CSV Export: UTF-8 BOM + formula-injection sanitization (preserves plain negative numbers)
    expect(sanitizeCsvFormulaInjection('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
    expect(sanitizeCsvFormulaInjection('+964770')).toBe("'+964770");
    expect(sanitizeCsvFormulaInjection('-500')).toBe('-500');
    expect(sanitizeCsvFormulaInjection('-CMD|calc')).toBe("'-CMD|calc");
    expect(sanitizeCsvFormulaInjection('@cmd')).toBe("'@cmd");

    const invCsv = buildInvoicesCsv(ClinicOperationsService.getInvoicesIQD(), 'IQD', 'en');
    expect(invCsv.startsWith('\uFEFF')).toBe(true);
    expect(invCsv).toContain("'=CMD|calc");

    const monthlyCsv = buildMonthlySummaryCsv(monthly, 'en');
    expect(monthlyCsv.startsWith('\uFEFF')).toBe(true);
    expect(monthlyCsv).toContain('Net Cash Flow (Collected - Expenses)');
  });

  it('4.4: validates raster logo/stamp uploads cleanly and persists extended Clinic Profile schedule config encrypted', async () => {
    const { db, dek } = await setupInitializedVault(8);

    expect(isValidEncryptedImageDataUrl(VALID_PNG_DATA_URL)).toBe(true);
    expect(
      isValidEncryptedImageDataUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')
    ).toBe(false);

    const saved = await ClinicOperationsService.saveClinicProfileAsync({
      clinicNameAr: 'مركز الرافدين للعلاج الطبيعي',
      clinicNameEn: 'Rafidain PT Center',
      therapistNameAr: 'د. نور علي',
      therapistNameEn: 'Dr. Noor Ali',
      phone: '07705556677',
      addressAr: 'بغداد - الكرادة',
      addressEn: 'Karrada, Baghdad',
      licenseNumber: 'IQ-PT-901',
      logoDataUrl: VALID_PNG_DATA_URL,
      stampSignatureDataUrl: VALID_PNG_DATA_URL,
      receiptFooterAr: 'نتمنى لكم الشفاء العاجل',
      receiptFooterEn: 'Wishing you a speedy recovery',
      workingDaysPreset: 'custom',
      workingDays: [0, 2, 4],
      workHoursStart: '09:30',
      workHoursEnd: '20:30',
      defaultSessionDurationMinutes: 60,
    });

    expect(saved.workingDays).toEqual([0, 2, 4]);
    expect(saved.defaultSessionDurationMinutes).toBe(60);

    await ClinicOperationsService.flushPendingWrites();
    await ClinicOperationsService.hydrateEncryptedCache(dek, db);

    const hydrated = ClinicOperationsService.getClinicProfile();
    expect(hydrated.logoDataUrl).toBe(VALID_PNG_DATA_URL);
    expect(hydrated.stampSignatureDataUrl).toBe(VALID_PNG_DATA_URL);
    expect(hydrated.receiptFooterAr).toBe('نتمنى لكم الشفاء العاجل');
    expect(hydrated.workingDays).toEqual([0, 2, 4]);
    expect(hydrated.workHoursStart).toBe('09:30');
    expect(hydrated.workHoursEnd).toBe('20:30');
    expect(hydrated.defaultSessionDurationMinutes).toBe(60);
  });

  it('4.5: detects therapist/room overlaps, records cancel/no-show reasons + stats & ranks waitlist matches for freed slots', async () => {
    const { db, dek } = await setupInitializedVault(8);
    await seedPatientRecord(db, dek, 'p4-sch-1', 'حسن علي');
    await seedPatientRecord(db, dek, 'p4-sch-2', 'مريم سعد');
    await seedPatientRecord(db, dek, 'p4-sch-3', 'طارق محمود');

    // Pick next Sunday date (weekday = 0)
    const sundayDate = '2026-07-05'; // 2026-07-05 is Sunday
    const appt1 = ClinicOperationsService.saveAppointment({
      patientId: 'p4-sch-1',
      patientName: 'حسن علي',
      patientPhone: '07701234567',
      episodeTitle: 'تأهيل الركبة',
      therapistName: 'د. سارة أحمد',
      date: sundayDate,
      startTime: '10:00',
      durationMinutes: 45,
      visitType: 'follow_up',
      status: 'scheduled',
      roomOrBed: 'غرفة 1',
    });

    // Overlap check: same therapist at 10:30 -> conflict
    const overlapTherapist = ClinicOperationsService.detectAppointmentConflicts({
      date: sundayDate,
      startTime: '10:30',
      durationMinutes: 30,
      therapistName: 'د. سارة أحمد',
      roomOrBed: 'غرفة 2',
    });
    expect(overlapTherapist.hasConflict).toBe(true);
    expect(overlapTherapist.therapistConflicts).toHaveLength(1);
    expect(overlapTherapist.roomConflicts).toHaveLength(0);

    // Overlap check: different therapist, same room at 10:15 -> room conflict
    const overlapRoom = ClinicOperationsService.detectAppointmentConflicts({
      date: sundayDate,
      startTime: '10:15',
      durationMinutes: 30,
      therapistName: 'د. علي حسن',
      roomOrBed: 'غرفة 1',
    });
    expect(overlapRoom.hasConflict).toBe(true);
    expect(overlapRoom.roomConflicts).toHaveLength(1);

    // Self-check ignored when editing existing appointment
    const selfEdit = ClinicOperationsService.detectAppointmentConflicts({
      id: appt1.id,
      date: sundayDate,
      startTime: '10:00',
      durationMinutes: 45,
      therapistName: 'د. سارة أحمد',
      roomOrBed: 'غرفة 1',
    });
    expect(selfEdit.hasConflict).toBe(false);

    // Waitlist entries: urgent matching Sunday morning vs low non-matching
    ClinicOperationsService.addWaitingListEntry({
      patientId: 'p4-sch-3',
      patientName: 'طارق محمود',
      phone: '07710000002',
      conditionOrRegion: 'آلام الكتف',
      preferredDays: 'الثلاثاء مساءً',
      preferredTimeWindow: 'evening',
      priority: 'normal',
      status: 'waiting',
    });
    ClinicOperationsService.addWaitingListEntry({
      patientId: 'p4-sch-2',
      patientName: 'مريم سعد',
      phone: '07710000001',
      conditionOrRegion: 'انزلاق غضروفي',
      preferredDays: 'الأحد والثلاثاء',
      preferredTimeWindow: 'morning',
      preferredTherapist: 'د. سارة أحمد',
      priority: 'urgent',
      status: 'waiting',
    });

    // Cancel appt1 with mandatory reason -> frees slot + ignores future conflict checks
    ClinicOperationsService.updateAppointmentStatus(
      appt1.id,
      'cancelled',
      'سفر طارئ للمريض'
    );
    const conflictAfterCancel = ClinicOperationsService.detectAppointmentConflicts({
      date: sundayDate,
      startTime: '10:00',
      durationMinutes: 45,
      therapistName: 'د. سارة أحمد',
      roomOrBed: 'غرفة 1',
    });
    expect(conflictAfterCancel.hasConflict).toBe(false);

    const suggestions = ClinicOperationsService.suggestWaitlistForFreedSlot({
      date: sundayDate,
      startTime: '10:00',
      therapistName: 'د. سارة أحمد',
    });
    expect(suggestions).toHaveLength(2);
    expect(suggestions[0].entry.patientId).toBe('p4-sch-2');

    const stats = ClinicOperationsService.getCancellationAndNoShowStats();
    expect(stats.cancelled).toBe(1);
    expect(stats.cancellationRatePercent).toBe(100);
    expect(stats.topCancellationReasons[0]?.reason).toBe('سفر طارئ للمريض');
  });

  it('4.7: normalizes Iraqi +964 WhatsApp links, interpolates HEP/Reminder/Receipt & stores encrypted templates', async () => {
    const { db, dek } = await setupInitializedVault(8);
    expect(buildUserInitiatedWhatsAppHref('07701234567', 'مرحباً')).toBe(
      'https://wa.me/9647701234567?text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7%D9%8B'
    );
    expect(buildUserInitiatedWhatsAppHref('+96407809998877', 'Test')).toBe(
      'https://wa.me/9647809998877?text=Test'
    );
    expect(buildUserInitiatedWhatsAppHref('123', 'Short')).toBeNull();

    await ClinicOperationsService.saveWhatsAppTemplatesAsync({
      appointmentReminder: {
        ar: 'تذكير مخصص: {patientName} الساعة {time} في {clinicName}',
        en: 'Custom reminder: {patientName} at {time} - {clinicName}',
      },
    });
    await ClinicOperationsService.flushPendingWrites();
    await ClinicOperationsService.hydrateEncryptedCache(dek, db);

    const profile = ClinicOperationsService.getClinicProfile();
    const templates = ClinicOperationsService.getWhatsAppTemplates();
    const reminderText = buildAppointmentReminderText({
      template: templates.appointmentReminder.ar,
      appointment: {
        id: 'a1',
        patientId: 'p1',
        patientName: 'زينب جاسم',
        episodeTitle: 'تأهيل',
        therapistName: 'د. سارة',
        date: '2026-07-06',
        startTime: '16:30',
        durationMinutes: 45,
        visitType: 'follow_up',
        status: 'scheduled',
      },
      clinicProfile: profile,
      lang: 'ar',
    });
    expect(reminderText).toContain('زينب جاسم');
    expect(reminderText).toContain('04:30');

    const hepText = buildHepWhatsAppText({
      template: templates.hepProgram.en,
      patientName: 'Zainab',
      hepItems: [
        {
          id: 'h1',
          exerciseId: 'ex1',
          nameAr: 'مد الركبة',
          nameEn: 'Quad Sets',
          region: 'hip_pelvis',
          sets: 3,
          reps: 10,
          holdSeconds: 5,
          frequencyPerDay: 2,
          daysPerWeek: 5,
          loadOrBand: 'Bodyweight',
          instructionsAr: 'تثبيت العضلة 5 ثوانٍ',
          instructionsEn: 'Hold quad contraction for 5 seconds',
        },
      ],
      clinicProfile: profile,
      lang: 'en',
    });
    expect(hepText).toContain('Quad Sets');

    const inv = ClinicOperationsService.createInvoiceIQD({
      patientId: 'p1',
      patientName: 'زينب جاسم',
      invoiceType: 'single_session',
      titleAr: 'جلسة مفردة',
      titleEn: 'Single Session',
      totalAmountIQD: 25000,
      discountIQD: 0,
      initialPaidIQD: 25000,
      paymentMethod: 'cash',
      currencyCode: 'IQD',
    });
    const receiptMsg = buildReceiptWhatsAppText({
      template: templates.paymentReceipt.en,
      invoice: inv,
      payment: inv.payments[0],
      clinicProfile: profile,
      primaryCurrencyCode: 'IQD',
      lang: 'en',
    });
    expect(receiptMsg).toContain('INV-0001');
    expect(receiptMsg).toContain('RCPT-0001');

    const reset = await ClinicOperationsService.resetWhatsAppTemplatesAsync();
    expect(reset.appointmentReminder.ar).not.toContain('تذكير مخصص:');
  });

  it('4.8: keeps Consent module off by default, encrypts & revokes canvas consents in v8, protects signed consents on merge & cascades delete', async () => {
    const { db, dek, kek } = await setupInitializedVault(8);
    expect(ClinicOperationsService.isConsentModuleEnabled()).toBe(false);
    expect(CONSENT_TEMPLATES.map((t) => t.id)).toEqual([
      'treatment',
      'data_storage',
      'photography',
    ]);

    ClinicOperationsService.setConsentModuleEnabled(true);
    expect(ClinicOperationsService.isConsentModuleEnabled()).toBe(true);

    await seedPatientRecord(db, dek, 'p4-cons-1', 'هالة محمد');
    const template = CONSENT_TEMPLATES[0];

    const saved = await ClinicOperationsService.savePatientConsentAsync({
      patientId: 'p4-cons-1',
      templateId: template.id,
      templateVersion: template.version,
      titleAr: template.titleAr,
      titleEn: template.titleEn,
      bodySnapshotAr: template.bodyAr,
      bodySnapshotEn: template.bodyEn,
      signerName: 'هالة محمد',
      signerRelation: 'patient',
      signatureDataUrl: VALID_PNG_DATA_URL,
      consentGranted: true,
    });

    expect(saved.id).toBeTruthy();
    expect(saved.signedAt).toBeTruthy();

    await expect(
      ClinicOperationsService.revokePatientConsentAsync('p4-cons-1', saved.id, '   ')
    ).rejects.toThrow();

    await ClinicOperationsService.revokePatientConsentAsync(
      'p4-cons-1',
      saved.id,
      'تغيير خطة العلاج'
    );

    await ClinicOperationsService.flushPendingWrites();
    await ClinicOperationsService.hydrateEncryptedCache(dek, db);
    const reloaded = ClinicOperationsService.getConsentsForPatient('p4-cons-1');
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0].revokedAt).toBeTruthy();
    expect(reloaded[0].revokeReason).toBe('تغيير خطة العلاج');

    // Merge mode protection: signed consents already on destination are never overwritten
    const sourceMeta = (await db.vaultMeta.get('auth'))!;
    const backupJson = await exportBackupPackage(db, sourceMeta, kek, 'BackupConsentPass#1');

    const mergeResult = await restoreBackupPackage(
      backupJson,
      'BackupConsentPass#1',
      'BackupConsentPass#1',
      db,
      { mode: 'merge', existingLocalDek: dek }
    );
    expect(mergeResult.mode).toBe('merge');
    expect(mergeResult.skippedImmutableCount).toBeGreaterThanOrEqual(1);

    // Cascade deletion removes consents for deleted patient
    expect(await db.consents.where('patientId').equals('p4-cons-1').count()).toBe(1);
    await db.deletePatientPermanently('p4-cons-1', { verifiedBackupString: backupJson });
    expect(await db.consents.where('patientId').equals('p4-cons-1').count()).toBe(0);
  });
});
