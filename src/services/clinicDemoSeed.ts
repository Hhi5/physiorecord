// =======================================================================
// PhysioRecord — Explicit Synthetic Demo Operations Seed Builders
// Invoked ONLY on explicit user click ("Seed Demo Data" in Developer Tools).
// =======================================================================

import { localDate } from '../utils/date';
import type {
  ClinicAppointment,
  ClinicExpenseIQD,
  ClinicStaffMember,
  FinancialInvoiceIQD,
  WaitingListEntry,
} from '../types/clinicManagement';

export interface DemoOperationsSeedBundle {
  appointments: ClinicAppointment[];
  waitlist: WaitingListEntry[];
  invoices: FinancialInvoiceIQD[];
  expenses: ClinicExpenseIQD[];
}

export function buildDemoOperationsSeed(roster: ClinicStaffMember[]): DemoOperationsSeedBundle {
  const today = localDate();
  const directorName = roster[0]?.nameAr || 'Clinic Director';
  const seniorPtName = roster[1]?.nameAr || directorName;
  const receptionName = roster[3]?.nameAr || directorName;

  const appointments: ClinicAppointment[] = [
    {
      id: 'demo_appt_1',
      patientId: 'syn-patient-001',
      isDemo: true,
      patientName: 'مازن رائد الربيعي',
      patientPhone: '+964 700 000 0147',
      episodeId: 'syn-episode-001',
      episodeTitle: 'تأهيل ما بعد عملية ترميم الرباط الصليبي الأمامي (ACL)',
      therapistName: directorName,
      date: today,
      startTime: '09:30',
      durationMinutes: 45,
      visitType: 'follow_up',
      status: 'in_session',
      roomOrBed: 'وحدة التأهيل الرياضي 1',
      notes: 'الجلسة الثالثة — تركيز على استعادة الامتداد الكامل للركبة',
    },
    {
      id: 'demo_appt_2',
      patientId: 'syn-patient-002',
      isDemo: true,
      patientName: 'سلوى قاسم الطائي',
      patientPhone: '+964 700 000 0283',
      episodeId: 'syn-episode-002',
      episodeTitle: 'تأهيل عصبي للشلل النصفي الأيمن بعد جلطة دماغية',
      therapistName: seniorPtName,
      date: today,
      startTime: '10:30',
      durationMinutes: 45,
      visitType: 're_evaluation',
      status: 'arrived',
      roomOrBed: 'غرفة التأهيل العصبي 2',
      notes: 'إعادة تقييم التوازن والمشي المستقل',
    },
    {
      id: 'demo_appt_3',
      patientId: 'syn-patient-005',
      isDemo: true,
      patientName: 'رنا وليد العامري',
      patientPhone: '+964 700 000 0528',
      episodeId: 'syn-episode-005',
      episodeTitle: 'علاج الكتف المتجمد الأيمن (Adhesive Capsulitis)',
      therapistName: directorName,
      date: today,
      startTime: '11:30',
      durationMinutes: 60,
      visitType: 'initial_evaluation',
      status: 'scheduled',
      roomOrBed: 'غرفة العلاج اليدوي 1',
      notes: 'تحريك مفصلي تدريجي للمحفظة الخلفية والسفلية',
    },
  ];

  const waitlist: WaitingListEntry[] = [
    {
      id: 'demo_wait_1',
      patientId: 'syn-patient-003',
      isDemo: true,
      patientName: 'جاسم طارق النعيمي',
      phone: '+964 700 000 0391',
      conditionOrRegion: 'تأهيل قلبي رئوي بعد جراحة الشريان التاجي (CABG)',
      preferredTherapist: directorName,
      preferredDays: 'السبت، الإثنين، الأربعاء',
      preferredTimeWindow: 'morning',
      priority: 'urgent',
      addedAt: today,
      notes: 'يفضل المواعيد الصباحية المبكرة مع مراقبة العلامات الحيوية',
    },
    {
      id: 'demo_wait_2',
      patientId: 'syn-patient-004',
      isDemo: true,
      patientName: 'كرم مهند البياتي',
      phone: '+964 700 000 0465',
      conditionOrRegion: 'تأهيل حركي للأطفال — شلل دماغي تشنجي',
      preferredTherapist: seniorPtName,
      preferredDays: 'الأحد، الثلاثاء، الخميس',
      preferredTimeWindow: 'afternoon',
      priority: 'normal',
      addedAt: today,
    },
  ];

  const invoices: FinancialInvoiceIQD[] = [
    {
      id: 'demo_inv_1001',
      invoiceNumber: 'INV-IQD-1001',
      patientId: 'syn-patient-001',
      isDemo: true,
      patientName: 'مازن رائد الربيعي',
      episodeId: 'syn-episode-001',
      episodeTitle: 'باقة تأهيل الرباط الصليبي (10 جلسات)',
      date: today,
      invoiceType: 'rehab_package',
      titleAr: 'باقة تأهيل علاجي متكامل (10 جلسات)',
      titleEn: '10-Session Comprehensive Rehab Package',
      totalAmountIQD: 250000,
      discountIQD: 25000,
      netAmountIQD: 225000,
      paidAmountIQD: 150000,
      balanceDueIQD: 75000,
      status: 'partial',
      packageTotalSessions: 10,
      packageUsedSessions: 6,
      createdBy: receptionName,
      payments: [
        {
          id: 'demo_pay_1',
          invoiceId: 'demo_inv_1001',
          patientId: 'syn-patient-001',
          date: today,
          amountIQD: 150000,
          method: 'cash',
          receivedBy: receptionName,
          receiptNumber: 'RCPT-901',
          notes: 'دفعة أولى نقداً عند بدء الكورس',
        },
      ],
      notes: 'متبقي بذمة المريض 75,000 د.ع تسدد عند الجلسة الثامنة',
    },
    {
      id: 'demo_inv_1002',
      invoiceNumber: 'INV-IQD-1002',
      patientId: 'syn-patient-002',
      isDemo: true,
      patientName: 'سلوى قاسم الطائي',
      episodeId: 'syn-episode-002',
      episodeTitle: 'تأهيل الشلل النصفي الأيمن',
      date: today,
      invoiceType: 'single_session',
      titleAr: 'جلسة تأهيل عصبي + توازن وظيفي',
      titleEn: 'Neuro Rehab & Balance Session',
      totalAmountIQD: 30000,
      discountIQD: 0,
      netAmountIQD: 30000,
      paidAmountIQD: 30000,
      balanceDueIQD: 0,
      status: 'paid',
      createdBy: receptionName,
      payments: [
        {
          id: 'demo_pay_2',
          invoiceId: 'demo_inv_1002',
          patientId: 'syn-patient-002',
          date: today,
          amountIQD: 30000,
          method: 'zain_cash',
          receivedBy: receptionName,
          receiptNumber: 'RCPT-902',
          notes: 'تحويل زين كاش',
        },
      ],
    },
  ];

  const expenses: ClinicExpenseIQD[] = [
    {
      id: 'demo_exp_1',
      isDemo: true,
      date: today,
      category: 'medical_consumables',
      titleAr: 'شراء أقطاب تحفيز كهربائي وجل سونار (تجريبي)',
      titleEn: 'Ultrasound Gel & Electrodes Supply (Demo)',
      amountIQD: 45000,
      paidBy: directorName,
      notes: 'سجل مصروف تجريبي',
    },
  ];

  return { appointments, waitlist, invoices, expenses };
}
