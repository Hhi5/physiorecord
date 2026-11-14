import { describe, expect, it } from 'vitest';
import type {
  EpisodeRecord,
  PatientRecord,
  SessionRecord,
  SoapNoteRecord,
} from '../../types/clinical';
import type {
  ClinicAppointment,
  EpisodeScopedClinicalStore,
  FinancialInvoiceIQD,
} from '../../types/clinicManagement';
import {
  buildPatientQuickSummary,
  formatCurrencyText,
  renderPatientSummaryText,
} from '../patientSummary';

const MOCK_PATIENT: PatientRecord = {
  id: 'pat_1',
  createdAt: '2026-10-01T08:00:00Z',
  updatedAt: '2026-11-12T14:30:00Z',
  isArchived: 0,
  data: {
    mrn: 'PR-1042',
    fullName: 'Ali Hassan Al-Janabi',
    fullNameAr: 'علي حسن الجنابي',
    age: 39,
    gender: 'male',
    phoneNumber: '07701234567',
    occupation: 'مهندس مدني',
    referringPhysician: 'د. عماد العاني',
    allergies: 'حساسية البنسلين',
    redFlags: 'خدر متزايد في القدم اليمنى',
    medicalHistory: 'انزلاق غضروفي L4-L5 منذ 4 أشهر',
    attachments: [
      {
        id: 'att_mri_1',
        title: 'رنين مغناطيسي قطني L4-L5',
        category: 'other',
        customCategoryLabel: 'تقرير تخطيط عصب EMG',
        dateAdded: '2026-11-05',
        studyDate: '2026-11-04',
        bodyRegion: 'Lumbar',
        summaryNotes: 'نتيجة معتدلة مع سلامة المسار العصبي الطرفي.',
      },
    ],
  },
};

const MOCK_EPISODE: EpisodeRecord = {
  id: 'ep_1',
  patientId: 'pat_1',
  status: 'active',
  primarySpecialty: 'musculoskeletal',
  startDate: '2026-11-01',
  createdAt: '2026-11-01T09:00:00Z',
  updatedAt: '2026-11-12T09:00:00Z',
  data: {
    title: 'تأهيل الفقرات القطنية',
    medicalDiagnosis: 'L4-L5 Disc Herniation',
    clinicalImpression: 'تحسن تدريجي في مدى الحركة',
    rehabilitationGoals: { shortTerm: ['تخفيف الألم'], longTerm: ['العودة للعمل بدون خدر'] },
    primarySpecialty: 'musculoskeletal',
    affectedBodyRegion: 'Lumbar Spine',
  },
};

const MOCK_STORE: EpisodeScopedClinicalStore = {
  episodeId: 'ep_1',
  patientId: 'pat_1',
  activeWidgetIds: ['body_chart', 'special_tests'],
  chiefComplaint: 'ألم أسفل الظهر ممتد للساق اليمنى',
  historyOfPresentIllness: 'بدأ تدريجياً بعد حمل ثقل',
  mechanismOfInjury: 'Lifting strain',
  painAtRestNrs: 3,
  painOnActivityNrs: 7,
  painWorst24hNrs: 8,
  painNature: 'ألم ممتد',
  aggravatingFactors: 'الجلوس الطويل',
  relievingFactors: 'المشي الخفيف',
  functionalLimitations: 'صعوبة الانحناء',
  patientPersonalGoals: 'العودة للعمل بدون خدر',
  observationPosture: 'تسطح قطني طفيف',
  palpationFindings: 'شد في العضلات الناصبة للعمود الفقري',
  circumferenceEdemaNotes: '',
  treatmentFrequency: '3 جلسات أسبوعياً',
  plannedDurationWeeks: 4,
  clinicalImpression: 'استجابة جيدة لتمديدات ماكنزي',
  bodyChart: {
    chartVersion: '1.0.0',
    lastUpdatedAt: '2026-11-01T09:00:00Z',
    markers: [
      {
        markerId: 'm_1',
        symptomType: 'pain_sharp',
        painTypeCustom: 'ألم نابض عميق',
        colorHex: '#0EA5E9',
        view: 'posterior',
        xPercent: 48,
        yPercent: 42,
        anatomicalRegionCode: 'lumbar',
        anatomicalRegionLabelAr: 'أسفل الظهر',
        anatomicalRegionLabelEn: 'Low Back',
        severityNrs: 7,
        createdAt: '2026-11-01T09:00:00Z',
      },
    ],
  },
  objective: {},
  specialTests: [
    {
      id: 'st_1',
      joint: 'lumbar',
      nameAr: 'اختبار رفع الساق المستقيمة (SLR)',
      nameEn: 'Straight Leg Raise',
      targetPathologyAr: 'جذر عصبي',
      targetPathologyEn: 'Sciatic nerve tension',
      outcome: 'positive',
    },
  ],
  customWidgetsData: {},
  snapshots: [],
  hepProgram: [],
  updatedAt: '2026-11-12T10:00:00Z',
};

const MOCK_SESSIONS: SessionRecord[] = [
  {
    id: 'sess_1',
    patientId: 'pat_1',
    episodeId: 'ep_1',
    sessionNumber: 1,
    sessionDate: '2026-11-01',
    sessionType: 'initial_evaluation',
    status: 'finalized',
    attendanceStatus: 'attended',
    createdAt: '2026-11-01T10:00:00Z',
    updatedAt: '2026-11-01T11:00:00Z',
    data: { sessionNumber: 1, sessionDate: '2026-11-01', sessionType: 'initial_evaluation', status: 'finalized', attendanceStatus: 'attended' },
  },
];

const MOCK_SOAP: SoapNoteRecord = {
  id: 'soap_1',
  patientId: 'pat_1',
  episodeId: 'ep_1',
  sessionId: 'sess_1',
  createdAt: '2026-11-01T10:00:00Z',
  updatedAt: '2026-11-01T11:00:00Z',
  data: {
    subjective: { chiefComplaint: 'تحسن الألم بنسبة 30%', painNrsScore: 7, postSessionPainNrs: 4 },
    objective: { dailyInterventionsSummary: 'تمديد قطني متدرج + تحريك فقري' },
    assessment: { clinicalImpressionCurrent: 'مركزة الألم نحو القطنية', progressStatus: 'improved' },
    plan: { nextSessionPlan: 'زيادة التدرج الحركي لتقوية الجذع' },
    isFinalized: true,
  },
};

const MOCK_APPOINTMENTS: ClinicAppointment[] = [
  {
    id: 'appt_1',
    patientId: 'pat_1',
    patientName: 'علي حسن الجنابي',
    therapistName: 'د. زينب كريم',
    date: '2026-11-15',
    startTime: '14:30',
    durationMinutes: 45,
    visitType: 'follow_up',
    status: 'scheduled',
  },
];

const MOCK_INVOICES: FinancialInvoiceIQD[] = [
  {
    id: 'inv_1',
    invoiceNumber: 'INV-001',
    patientId: 'pat_1',
    patientName: 'علي حسن الجنابي',
    date: '2026-11-01',
    invoiceType: 'single_session',
    titleAr: 'جلسة علاج طبيعي',
    titleEn: 'PT Session',
    totalAmountIQD: 30000,
    discountIQD: 0,
    netAmountIQD: 30000,
    paidAmountIQD: 25000,
    balanceDueIQD: 5000,
    status: 'partial',
    payments: [],
    createdBy: 'د. زينب كريم',
  },
];

describe('Read-Only Patient Quick Summary Builder', () => {
  it('formats IQD amounts with Latin digits and currency symbol AFTER the numeral', () => {
    expect(formatCurrencyText(25000, 'IQD', 'ar')).toBe('25,000 د.ع');
    expect(formatCurrencyText(25000, 'IQD', 'ckb')).toBe('25,000 د.ع');
    expect(formatCurrencyText(25000, 'IQD', 'en')).toBe('25,000 IQD');
  });

  it('builds complete clinical summary text with custom body-chart markers and "other" attachments, while enforcing RBAC on finance', () => {
    const withFinance = buildPatientQuickSummary({
      patient: MOCK_PATIENT,
      episodes: [MOCK_EPISODE],
      episodeStores: { ep_1: MOCK_STORE },
      latestSoapByEpisode: { ep_1: MOCK_SOAP },
      sessionsByEpisode: { ep_1: MOCK_SESSIONS },
      nprsSeriesByEpisode: { ep_1: [{ sessionNumber: 1, date: '2026-11-01', pain: 7 }] },
      appointments: MOCK_APPOINTMENTS,
      invoices: MOCK_INVOICES,
      canViewFinance: true,
      currencyCode: 'IQD',
      language: 'ar',
    });

    expect(withFinance.alerts.hasAnyAlert).toBe(true);
    expect(withFinance.episodes[0].bodyMarkersSummary[0]).toContain('ألم نابض عميق');
    expect(withFinance.attachments[0].categoryLabel).toBe('تقرير تخطيط عصب EMG');
    expect(withFinance.finance?.formattedTotalPaid).toBe('25,000 د.ع');

    const textWithFinance = renderPatientSummaryText(withFinance, 'ar');
    expect(textWithFinance).toContain('علي حسن الجنابي');
    expect(textWithFinance).toContain('25,000 د.ع');
    expect(textWithFinance).toContain('تقرير تخطيط عصب EMG');

    const withoutFinance = buildPatientQuickSummary({
      patient: MOCK_PATIENT,
      episodes: [MOCK_EPISODE],
      episodeStores: { ep_1: MOCK_STORE },
      latestSoapByEpisode: { ep_1: MOCK_SOAP },
      sessionsByEpisode: { ep_1: MOCK_SESSIONS },
      appointments: MOCK_APPOINTMENTS,
      invoices: MOCK_INVOICES,
      canViewFinance: false,
      currencyCode: 'IQD',
      language: 'ar',
    });

    expect(withoutFinance.finance).toBeUndefined();
    const textWithoutFinance = renderPatientSummaryText(withoutFinance, 'ar');
    expect(textWithoutFinance).not.toContain('25,000 د.ع');
    expect(textWithoutFinance).not.toContain('الملخص المالي');
  });
});
