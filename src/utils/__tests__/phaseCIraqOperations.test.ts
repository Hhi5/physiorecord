import { describe, it, expect, beforeEach } from 'vitest';
import {
  ClinicOperationsService,
  DEFAULT_PRACTICE_LOCATIONS,
  DEFAULT_RECURRING_EXPENSE_TEMPLATES,
} from '../../services/clinicOperationsService';
import {
  buildGoogleMapsSearchUrl,
  formatHijriDate,
  formatHomeVisitAddressDisplay,
  summarizeAppointmentsByLocation,
} from '../iraqScheduleLocationsC1C3';
import {
  buildInstallmentAgingSummary,
  buildInstallmentWhatsAppReminderUrl,
  classifyOverdueBucket,
  generateEqualInstallmentSchedule,
  getDueRecurringExpenseSuggestions,
  getExpenseCategoryDisplayLabel,
  summarizeInvoicesByLocation,
} from '../iraqFinanceC4C5';
import {
  buildDoctorReportBackLetter,
  buildRetentionWhatsAppUrl,
  computeReferralStatistics,
  computeRetentionActionLists,
} from '../iraqReferralsRetentionC6C7';

describe('Phase C — Iraq-Specific Operations (C1–C5 Core & UI Helpers)', () => {
  beforeEach(() => {
    ClinicOperationsService.clearInMemoryCache();
  });

  it('C1: constructs landmark Google Maps URLs purely offline and detects home-visit travel buffer conflicts', () => {
    const addr = {
      governorate: 'بغداد',
      area: 'الكرادة داخل',
      nearestLandmark: 'قرب تقاطع المسبح',
      notes: 'اسم المريض الحساس لا يجب إرساله للخريطة',
    };

    const url = buildGoogleMapsSearchUrl(addr);
    expect(url).toContain('https://www.google.com/maps/search/?api=1&query=');
    expect(decodeURIComponent(url)).toContain('بغداد');
    expect(decodeURIComponent(url)).toContain('قرب تقاطع المسبح');
    // Privacy: clinical notes must not leak into external map URL
    expect(decodeURIComponent(url)).not.toContain('اسم المريض الحساس');
    expect(formatHomeVisitAddressDisplay(addr)).toBe('بغداد — الكرادة داخل — قرب تقاطع المسبح');

    // Add a clinic visit at 10:00–10:45
    ClinicOperationsService.saveAppointment({
      patientId: 'pat-1',
      patientName: 'سارة علي',
      therapistName: 'د. نور',
      date: '2026-11-18',
      startTime: '10:00',
      durationMinutes: 45,
      visitType: 'follow_up',
      status: 'scheduled',
    });

    // Candidate home visit at 11:00–11:45 with a 30 min travelBufferBeforeMin reaches back to 10:30 (overlaps 10:00–10:45)
    const conflict = ClinicOperationsService.detectAppointmentConflicts({
      date: '2026-11-18',
      startTime: '11:00',
      durationMinutes: 45,
      therapistName: 'د. نور',
      appointmentMode: 'home_visit',
      travelBufferBeforeMin: 30,
      travelBufferAfterMin: 20,
    });

    expect(conflict.hasConflict).toBe(false);
    expect(conflict.travelBufferConflicts).toHaveLength(1);
    expect(conflict.allowConcurrent).toBe(true);

    // Blank/zero financial default preserved when travelFeeIQD is omitted; persisted when explicit
    const clinicInvoice = ClinicOperationsService.createInvoiceIQD({
      patientId: 'pat-1',
      patientName: 'سارة علي',
      invoiceType: 'single_session',
      titleAr: 'جلسة علاج طبيعي',
      titleEn: 'PT Session',
      totalAmountIQD: 0,
      discountIQD: 0,
      initialPaidIQD: 0,
      paymentMethod: 'cash',
    });
    expect(clinicInvoice.travelFeeIQD).toBeUndefined();

    const homeVisitInvoice = ClinicOperationsService.createInvoiceIQD({
      patientId: 'pat-1',
      patientName: 'سارة علي',
      locationId: 'loc_home_visits',
      travelFeeIQD: 10000,
      invoiceType: 'single_session',
      titleAr: 'جلسة منزلية',
      titleEn: 'Home Visit',
      totalAmountIQD: 35000,
      discountIQD: 0,
      initialPaidIQD: 35000,
      paymentMethod: 'cash',
    });
    expect(homeVisitInvoice.locationId).toBe('loc_home_visits');
    expect(homeVisitInvoice.travelFeeIQD).toBe(10000);
  });

  it('C2: initializes four Iraqi practice locations and aggregates appointments & invoices per location', () => {
    expect(DEFAULT_PRACTICE_LOCATIONS.map((l) => l.type)).toEqual([
      'clinic',
      'home_visits',
      'hospital',
      'second_clinic',
    ]);

    const locations = ClinicOperationsService.getPracticeLocations();
    ClinicOperationsService.saveAppointment({
      patientId: 'pat-a',
      patientName: 'حيدر حسن',
      therapistName: 'د. كريم',
      date: '2026-11-19',
      startTime: '09:00',
      durationMinutes: 45,
      visitType: 're_evaluation',
      locationId: 'loc_hospital',
      status: 'completed',
    });
    ClinicOperationsService.saveAppointment({
      patientId: 'pat-b',
      patientName: 'مريم جاسم',
      therapistName: 'د. كريم',
      date: '2026-11-19',
      startTime: '12:00',
      durationMinutes: 45,
      visitType: 'follow_up',
      appointmentMode: 'home_visit',
      status: 'scheduled',
    });

    const apptSummary = summarizeAppointmentsByLocation(
      ClinicOperationsService.getAppointments(),
      locations
    );
    expect(apptSummary.find((x) => x.locationId === 'loc_hospital')?.completedCount).toBe(1);
    expect(apptSummary.find((x) => x.locationId === 'loc_home_visits')?.activeCount).toBe(1);

    const inv1 = ClinicOperationsService.createInvoiceIQD({
      patientId: 'pat-a',
      patientName: 'حيدر حسن',
      locationId: 'loc_hospital',
      invoiceType: 'evaluation',
      titleAr: 'فحص مستشفى',
      titleEn: 'Hospital Eval',
      totalAmountIQD: 40000,
      discountIQD: 0,
      initialPaidIQD: 15000,
      paymentMethod: 'qi_card',
    });
    const invSummary = summarizeInvoicesByLocation([inv1], locations);
    const hospitalFinance = invSummary.find((x) => x.locationId === 'loc_hospital');
    expect(hospitalFinance?.invoiceCount).toBe(1);
    expect(hospitalFinance?.billedNetIQD).toBe(40000);
    expect(hospitalFinance?.collectedPaidIQD).toBe(15000);
    expect(hospitalFinance?.outstandingBalanceIQD).toBe(25000);
  });

  it('C3: ships zero bundled holidays, detects closed ranges & weekly breaks, skips recurring slots on closed dates, and formats Hijri safely', () => {
    expect(ClinicOperationsService.getClosedDateRanges()).toEqual([]);

    // 2026-11-18 is Wednesday (weekday = 3)
    const breakOnlyConflict = ClinicOperationsService.detectAppointmentConflicts({
      date: '2026-11-18',
      startTime: '13:15',
      durationMinutes: 30,
      therapistName: 'د. نور',
    });
    expect(breakOnlyConflict.breakConflicts?.length).toBeGreaterThanOrEqual(1);
    expect(breakOnlyConflict.closedDayMatches).toEqual([]);

    ClinicOperationsService.saveClosedDateRanges([
      {
        id: 'closed_custom_1',
        labelAr: 'إغلاق صيانة العيادة',
        labelEn: 'Clinic Maintenance Day',
        startDate: '2026-11-25',
        endDate: '2026-11-26',
      },
    ]);

    const closedConflict = ClinicOperationsService.detectAppointmentConflicts({
      date: '2026-11-25',
      startTime: '10:00',
      durationMinutes: 45,
      therapistName: 'د. نور',
    });
    expect(closedConflict.closedDayMatches).toHaveLength(1);

    // Recurring Wednesday rule should skip 2026-11-25 because it is marked closed, while creating 2026-11-18
    ClinicOperationsService.saveRecurringSchedule({
      patientId: 'pat-rec',
      patientName: 'زينب سعد',
      therapistName: 'د. نور',
      weekdays: [3], // Wednesday
      startTime: '09:30',
      durationMinutes: 45,
      visitType: 'follow_up',
      startDate: '2026-11-01',
      isActive: true,
    });

    ClinicOperationsService.ensureRecurringAppointmentsForDate('2026-11-25');
    expect(
      ClinicOperationsService.getAppointments().filter((a) => a.date === '2026-11-25')
    ).toHaveLength(0);

    ClinicOperationsService.ensureRecurringAppointmentsForDate('2026-11-18');
    expect(
      ClinicOperationsService.getAppointments().filter((a) => a.date === '2026-11-18')
    ).toHaveLength(1);

    const hijriAr = formatHijriDate('2026-11-18', 'ar');
    expect(typeof hijriAr).toBe('string');
  });

  it('C4: splits invoices into installments, reconciles payments & reversals, computes 30/60/90 aging buckets, and builds WhatsApp reminders', () => {
    const schedule = generateEqualInstallmentSchedule({
      netAmountIQD: 100000,
      count: 3,
      firstDueDate: '2026-08-01',
      intervalDays: 30,
      isAr: true,
    });
    expect(schedule).toHaveLength(3);
    expect(schedule.reduce((s, item) => s + item.amountIQD, 0)).toBe(100000);
    // Custom dates for aging bucket testing relative to 2026-11-14:
    // #1: 2026-08-01 (>90 days overdue: 105 days)
    // #2: 2026-10-01 (31-60 days overdue: 44 days)
    // #3: 2026-11-01 (1-30 days overdue: 13 days)
    const stagedPlan = [
      { ...schedule[0], dueDate: '2026-08-01' },
      { ...schedule[1], dueDate: '2026-10-01' },
      { ...schedule[2], dueDate: '2026-11-01' },
    ];

    const inv = ClinicOperationsService.createInvoiceIQD({
      patientId: 'pat-inst',
      patientName: 'مصطفى طارق',
      invoiceType: 'rehab_package',
      titleAr: 'كورس تأهيل ركبة',
      titleEn: 'Knee Rehab Package',
      totalAmountIQD: 100000,
      discountIQD: 0,
      initialPaidIQD: 0,
      paymentMethod: 'cash',
      installmentPlan: stagedPlan,
    });

    expect(classifyOverdueBucket('2026-08-01', '2026-11-14')).toBe('over_90');
    expect(classifyOverdueBucket('2026-10-01', '2026-11-14')).toBe('31_60');
    expect(classifyOverdueBucket('2026-11-01', '2026-11-14')).toBe('1_30');
    expect(classifyOverdueBucket('2026-12-01', '2026-11-14')).toBe('current');

    const agingBefore = buildInstallmentAgingSummary([inv], '2026-11-14');
    expect(agingBefore.totalOverdueCount).toBe(3);
    expect(agingBefore.buckets.over_90.amountIQD).toBe(schedule[0].amountIQD);
    expect(agingBefore.buckets['31_60'].amountIQD).toBe(schedule[1].amountIQD);
    expect(agingBefore.buckets['1_30'].amountIQD).toBe(schedule[2].amountIQD);

    // Pay off first installment + partial second (40,000 IQD)
    const afterPay = ClinicOperationsService.recordPaymentOnInvoiceIQD(
      inv.id,
      40000,
      'zain_cash'
    );
    const paidInv = afterPay.find((x) => x.id === inv.id)!;
    expect(paidInv.installmentPlan?.[0].status).toBe('paid');
    expect(paidInv.installmentPlan?.[1].status).toBe('partial');
    expect(paidInv.installmentPlan?.[1].paidAmountIQD).toBe(40000 - schedule[0].amountIQD);
    expect(paidInv.installmentPlan?.[2].status).toBe('pending');

    // Reversing that payment must restore pending status on all installments
    const paymentId = paidInv.payments[0].id;
    const afterReverse = ClinicOperationsService.reversePaymentIQD(
      inv.id,
      paymentId,
      'خطأ في المبلغ'
    );
    const reversedInv = afterReverse.find((x) => x.id === inv.id)!;
    expect(reversedInv.installmentPlan?.every((item) => item.status === 'pending')).toBe(true);

    const waUrl = buildInstallmentWhatsAppReminderUrl({
      phone: '07701234567',
      patientName: 'مصطفى طارق',
      invoiceNumber: inv.invoiceNumber,
      installmentLabel: 'القسط 1 من 3',
      dueDate: '2026-08-01',
      remainingAmount: schedule[0].amountIQD,
      overdueDays: 105,
      isAr: true,
    });
    expect(waUrl).toContain('https://wa.me/9647701234567?text=');
  });

  it('C5: preserves 0 default amounts on recurring expense templates, detects month-due suggestions, and logs custom categories cleanly', () => {
    expect(DEFAULT_RECURRING_EXPENSE_TEMPLATES.every((t) => t.defaultAmountIQD === 0)).toBe(true);

    const templates = ClinicOperationsService.getRecurringExpenseTemplates();
    const dueBefore = getDueRecurringExpenseSuggestions(templates, [], '2026-11-14');
    expect(dueBefore.length).toBe(templates.length);
    expect(dueBefore.find((d) => d.id === 'rec_exp_rent')?.isPastScheduledDay).toBe(true);

    const updatedExpenses = ClinicOperationsService.logRecurringExpenseForMonth({
      templateId: 'rec_exp_subscriptions',
      amountIQD: 45000,
      date: '2026-11-14',
      customCategoryLabel: 'اشتراك ألياف ضوئية',
      notes: 'دفعة شهر 11',
    });

    expect(updatedExpenses).toHaveLength(1);
    expect(
      getExpenseCategoryDisplayLabel(updatedExpenses[0], true)
    ).toBe('اشتراك ألياف ضوئية');

    // Template must keep defaultAmountIQD = 0 (blank R2 rule) and stamp lastLoggedMonthKey
    const nextTemplates = ClinicOperationsService.getRecurringExpenseTemplates();
    const subsTpl = nextTemplates.find((t) => t.id === 'rec_exp_subscriptions')!;
    expect(subsTpl.defaultAmountIQD).toBe(0);
    expect(subsTpl.lastLoggedMonthKey).toBe('2026-11');

    // Already-logged template disappears from due suggestions for November 2026, but remains due in December 2026
    const dueAfterNov = getDueRecurringExpenseSuggestions(
      nextTemplates,
      updatedExpenses,
      '2026-11-20'
    );
    expect(dueAfterNov.some((d) => d.id === 'rec_exp_subscriptions')).toBe(false);

    const dueDec = getDueRecurringExpenseSuggestions(
      nextTemplates,
      updatedExpenses,
      '2026-12-06'
    );
    expect(dueDec.some((d) => d.id === 'rec_exp_subscriptions')).toBe(true);
  });

  it('C6: computes referral source & doctor revenue statistics and builds bilingual report-back letters', () => {
    ClinicOperationsService.upsertReferringDoctor({
      id: 'doc-ortho-1',
      nameAr: 'د. مازن العبيدي',
      nameEn: 'Dr. Mazin Al-Ubaidi',
      specialtyAr: 'جراحة العظام والكسور',
      specialtyEn: 'Orthopedic Surgery',
      facilityAr: 'مستشفى اليرموك التعليمي',
      facilityEn: 'Al-Yarmouk Teaching Hospital',
      phone: '07711223344',
    });

    const doctors = ClinicOperationsService.getReferringDoctors();
    expect(doctors).toHaveLength(1);

    const p1 = {
      id: 'pat-ref-1',
      fullName: 'أحمد قاسم',
      phone: '07701112223',
      data: {
        fullName: 'أحمد قاسم',
        fullNameAr: 'أحمد قاسم',
        referralSourceType: 'doctor' as const,
        referringDoctorId: 'doc-ortho-1',
      },
    };
    const p2 = {
      id: 'pat-ref-2',
      fullName: 'فاطمة سالم',
      phone: '07809998887',
      data: {
        fullName: 'فاطمة سالم',
        fullNameAr: 'فاطمة سالم',
        referralSourceType: 'social_media' as const,
      },
    };

    const inv1 = ClinicOperationsService.createInvoiceIQD({
      patientId: p1.id,
      patientName: p1.fullName,
      invoiceType: 'rehab_package',
      titleAr: 'كورس تأهيل',
      titleEn: 'Rehab Course',
      totalAmountIQD: 150000,
      discountIQD: 0,
      initialPaidIQD: 100000,
      paymentMethod: 'cash',
    });

    const stats = computeReferralStatistics({
      patients: [p1, p2],
      clinicalRecordsByPatientId: {
        [p1.id]: p1.data as never,
        [p2.id]: p2.data as never,
      },
      doctors,
      invoices: [inv1],
    });

    expect(stats.totalReferredPatients).toBe(2);
    expect(stats.bySourceMap.doctor.patientCount).toBe(1);
    expect(stats.bySourceMap.doctor.billedRevenueIQD).toBe(150000);
    expect(stats.bySourceMap.social_media.patientCount).toBe(1);
    expect(stats.byDoctor[0]?.doctor.id).toBe('doc-ortho-1');
    expect(stats.byDoctor[0]?.collectedRevenueIQD).toBe(100000);

    const arLetter = buildDoctorReportBackLetter({
      doctor: doctors[0],
      patient: p1,
      episode: {
        id: 'ep-ref-1',
        patientId: p1.id,
        title: 'تأهيل ما بعد عملية الرباط الصليبي',
        medicalDiagnosis: 'ACL Reconstruction Rehab',
        startDate: '2026-10-01',
      },
      sessions: [
        {
          id: 'sess-1',
          episodeId: 'ep-ref-1',
          patientId: p1.id,
          sessionDate: '2026-10-05',
          painNrs: 7,
        },
        {
          id: 'sess-2',
          episodeId: 'ep-ref-1',
          patientId: p1.id,
          sessionDate: '2026-11-10',
          painNrs: 2,
        },
      ],
      clinicName: 'مركز النور للعلاج الطبيعي',
      therapistName: 'د. رند عادل',
      referenceDate: '2026-11-14',
      isAr: true,
    });

    expect(arLetter.subject).toContain('د. مازن العبيدي');
    expect(arLetter.body).toContain('أحمد قاسم');
    expect(arLetter.body).toContain('ACL Reconstruction Rehab');

    const enLetter = buildDoctorReportBackLetter({
      doctor: doctors[0],
      patient: p1,
      sessions: [],
      isAr: false,
    });
    expect(enLetter.subject).toContain('Dr. Mazin Al-Ubaidi');
  });

  it('C7: detects inactive active-plan patients, 4w/12w post-discharge follow-ups, package expiry, unpaid balances & WhatsApp templates', () => {
    const patients = [
      {
        id: 'pat-inactive',
        fullName: 'عمر نبيل',
        phone: '07701234560',
      },
      {
        id: 'pat-discharged-4w',
        fullName: 'زهراء علاء',
        phone: '07801234561',
      },
      {
        id: 'pat-discharged-12w',
        fullName: 'حسام رائد',
        phone: '07901234562',
      },
    ];

    const episodes = [
      {
        id: 'ep-active-stale',
        patientId: 'pat-inactive',
        status: 'active',
        startDate: '2026-10-15',
        title: 'آلام أسفل الظهر',
      },
      {
        id: 'ep-done-4w',
        patientId: 'pat-discharged-4w',
        status: 'completed',
        startDate: '2026-09-01',
        endDate: '2026-10-15', // 30 days before 2026-11-14 -> 4-week milestone
        title: 'تأهيل الكتف',
      },
      {
        id: 'ep-done-12w',
        patientId: 'pat-discharged-12w',
        status: 'completed',
        startDate: '2026-06-01',
        endDate: '2026-08-15', // 91 days before 2026-11-14 -> 12-week milestone
        title: 'تأهيل الركبة',
      },
    ];

    const sessions = [
      {
        id: 's-stale-1',
        episodeId: 'ep-active-stale',
        patientId: 'pat-inactive',
        sessionDate: '2026-10-25', // 20 days before 2026-11-14 (>= 14 threshold)
        status: 'finalized',
      },
    ];

    const pkgInv = ClinicOperationsService.createInvoiceIQD({
      patientId: 'pat-inactive',
      patientName: 'عمر نبيل',
      invoiceType: 'rehab_package',
      titleAr: 'كورس 6 جلسات',
      titleEn: '6-Session Package',
      packageTotalSessions: 6,
      packageUsedSessions: 5, // 1 remaining (<= 2 threshold)
      totalAmountIQD: 120000,
      discountIQD: 0,
      initialPaidIQD: 70000, // 50,000 unpaid balance
      paymentMethod: 'cash',
    });

    const beforeFollowUp = computeRetentionActionLists({
      patients,
      episodes,
      sessions,
      invoices: [pkgInv],
      appointments: [],
      followUps: ClinicOperationsService.getPostDischargeFollowUps(),
      inactiveDaysThreshold: 14,
      referenceDate: '2026-11-14',
    });

    expect(beforeFollowUp.inactiveActivePlan).toHaveLength(1);
    expect(beforeFollowUp.inactiveActivePlan[0].daysInactive).toBe(20);
    expect(beforeFollowUp.postDischargeFollowUpsDue.map((d) => [d.patientId, d.intervalWeeks])).toEqual(
      expect.arrayContaining([
        ['pat-discharged-4w', 4],
        ['pat-discharged-12w', 12],
      ])
    );
    expect(beforeFollowUp.packageExpiring).toHaveLength(1);
    expect(beforeFollowUp.packageExpiring[0].remainingSessions).toBe(1);
    expect(beforeFollowUp.unpaidBalances).toHaveLength(1);
    expect(beforeFollowUp.unpaidBalances[0].balanceDueIQD).toBe(50000);

    // Record 4-week outcome follow-up (NPRS & PSFS) -> should clear pat-discharged-4w from due list
    ClinicOperationsService.recordPostDischargeFollowUp({
      patientId: 'pat-discharged-4w',
      episodeId: 'ep-done-4w',
      intervalWeeks: 4,
      dischargeDate: '2026-10-15',
      dueDate: '2026-11-12',
      nprsScore: 1,
      psfsScore: 9,
      notes: 'تحسن ممتاز مستمر',
    });

    const afterFollowUp = computeRetentionActionLists({
      patients,
      episodes,
      sessions,
      invoices: [pkgInv],
      appointments: [],
      followUps: ClinicOperationsService.getPostDischargeFollowUps(),
      inactiveDaysThreshold: 14,
      referenceDate: '2026-11-14',
    });
    expect(afterFollowUp.postDischargeFollowUpsDue.map((d) => d.patientId)).toEqual([
      'pat-discharged-12w',
    ]);

    const waInactive = buildRetentionWhatsAppUrl({
      bucket: 'inactiveActivePlan',
      patientPhone: '07701234560',
      patientName: 'عمر نبيل',
      detailsText: '20 يوم',
      isAr: true,
    });
    expect(waInactive).toContain('https://wa.me/9647701234560?text=');
  });
});
