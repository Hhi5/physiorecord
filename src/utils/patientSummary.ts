// =======================================================================
// PhysioRecord — Read-Only Patient Clinical Quick-Summary Builder
// Decodes and formats a single patient's clinical chart, episodes,
// latest SOAP notes, imaging reports, appointments, and (role-gated)
// financial summary into structured cards + copyable plain-text report.
// =======================================================================

import type {
  EpisodeRecord,
  PatientRecord,
  SessionRecord,
  SoapNoteRecord,
} from '../types/clinical';
import type {
  ClinicAppointment,
  EpisodeScopedClinicalStore,
  FinancialInvoiceIQD,
} from '../types/clinicManagement';
import type { SupportedLanguage } from '../context/LanguageContext';
import { getCurrencyConfig, DEFAULT_CURRENCY_CODE } from './currencies';
import {
  computePatientAge,
  formatClinicalDate,
  formatIraqiPhoneDisplay,
  formatTimeIraq,
} from './date';
import {
  getPatientDisplayName,
  getPatientMrn,
  getPatientSecondaryName,
} from './mrn';
import { resolveMarkerDisplayMeta } from './bodyChartMarkers';
import {
  getAttachmentCategoryDisplayLabel,
  normalizeLegacyAttachment,
} from './imagingReports';

export interface PatientQuickSummaryInput {
  patient: PatientRecord;
  patientIndex?: number;
  episodes: EpisodeRecord[];
  episodeStores: Record<string, EpisodeScopedClinicalStore | undefined>;
  latestSoapByEpisode: Record<string, SoapNoteRecord | null | undefined>;
  sessionsByEpisode: Record<string, SessionRecord[] | undefined>;
  nprsSeriesByEpisode?: Record<string, Array<{ sessionNumber: number; date: string; pain: number }>>;
  appointments: ClinicAppointment[];
  invoices: FinancialInvoiceIQD[];
  canViewFinance: boolean;
  currencyCode?: string;
  language: SupportedLanguage;
}

export interface PatientSummaryEpisodeItem {
  episodeId: string;
  title: string;
  diagnosis?: string;
  status: EpisodeRecord['status'];
  statusLabel: string;
  specialtyLabel: string;
  startDate: string;
  endDate?: string;
  chiefComplaint?: string;
  clinicalImpression?: string;
  painSnapshot?: string;
  nprsTrajectory: string[];
  totalSessionsCount: number;
  completedSessionsCount: number;
  specialTestsSummary: string[];
  bodyMarkersSummary: string[];
  hepCount: number;
  latestSoap?: {
    sessionNumber?: number;
    sessionDate?: string;
    isFinalized: boolean;
    painPrePost?: string;
    subjective?: string;
    objective?: string;
    assessment?: string;
    plan?: string;
  };
}

export interface PatientSummaryAttachmentItem {
  id: string;
  title: string;
  categoryLabel: string;
  studyDate?: string;
  bodyRegion?: string;
  summaryNotes?: string;
  fileName?: string;
}

export interface PatientSummaryAppointmentItem {
  id: string;
  date: string;
  startTime: string;
  therapistName: string;
  statusLabel: string;
}

export interface PatientSummaryFinanceSection {
  visible: true;
  invoiceCount: number;
  currencyCode: string;
  totalNet: number;
  totalPaid: number;
  balanceDue: number;
  formattedTotalNet: string;
  formattedTotalPaid: string;
  formattedBalanceDue: string;
}

export interface PatientQuickSummary {
  header: {
    primaryName: string;
    secondaryName?: string;
    mrn: string;
    genderLabel: string;
    age?: number;
    phone?: string;
    occupation?: string;
    address?: string;
    referringPhysician?: string;
    referringClinic?: string;
    emergencyContact?: string;
    updatedAtLabel: string;
  };
  alerts: {
    hasAnyAlert: boolean;
    redFlags?: string;
    checklistAlerts: string[];
    allergies?: string;
    precautions?: string;
    contraindications?: string;
  };
  clinicalBackground: {
    medicalHistory?: string;
    previousSurgeries?: string;
    currentMedications?: string;
    comorbidities?: string;
    generalNotes?: string;
  };
  episodes: PatientSummaryEpisodeItem[];
  attachments: PatientSummaryAttachmentItem[];
  appointments: PatientSummaryAppointmentItem[];
  finance?: PatientSummaryFinanceSection;
}

function ltext(lang: SupportedLanguage, ar: string, en: string, ckb?: string): string {
  if (lang === 'en') return en;
  if (lang === 'ckb') return ckb || ar;
  return ar;
}

const EPISODE_STATUS_MAP: Record<EpisodeRecord['status'], { ar: string; en: string; ckb: string }> = {
  active: { ar: 'نشطة', en: 'Active', ckb: 'چالاک' },
  completed: { ar: 'مكتملة', en: 'Completed', ckb: 'تەواوبوو' },
  on_hold: { ar: 'متوقفة مؤقتاً', en: 'On Hold', ckb: 'ڕاگیراو' },
  archived: { ar: 'مؤرشفة', en: 'Archived', ckb: 'ئەرشیفکراو' },
};

const SPECIALTY_MAP: Record<string, { ar: string; en: string; ckb: string }> = {
  general: { ar: 'عام', en: 'General PT', ckb: 'گشتی' },
  musculoskeletal: { ar: 'عظام ومفاصل', en: 'Musculoskeletal / MSK', ckb: 'ئێسک و جومگە' },
  neurological: { ar: 'أعصاب', en: 'Neurological', ckb: 'دەمارەکان' },
  sports: { ar: 'إصابات رياضية', en: 'Sports Rehab', ckb: 'پێکانی وەرزشی' },
  pediatric: { ar: 'أطفال', en: 'Pediatric', ckb: 'منداڵان' },
  geriatric: { ar: 'كبار السن', en: 'Geriatric', ckb: 'بەساڵاچووان' },
  cardiopulmonary: { ar: 'قلبي رئوي', en: 'Cardiopulmonary', ckb: 'دڵ و سییەکان' },
};

const APPOINTMENT_STATUS_MAP: Record<ClinicAppointment['status'], { ar: string; en: string; ckb: string }> = {
  scheduled: { ar: 'مجدول', en: 'Scheduled', ckb: 'تۆمارکراو' },
  arrived: { ar: 'حضر', en: 'Arrived', ckb: 'گەیشت' },
  in_session: { ar: 'في الجلسة', en: 'In Session', ckb: 'لە دانیشتندایە' },
  completed: { ar: 'مكتمل', en: 'Completed', ckb: 'تەواوبوو' },
  cancelled: { ar: 'ملغى', en: 'Cancelled', ckb: 'هەڵوەشاوەتەوە' },
  no_show: { ar: 'لم يحضر', en: 'No Show', ckb: 'نەهات' },
};

const SPECIAL_TEST_OUTCOME_MAP: Record<string, { ar: string; en: string; ckb: string }> = {
  positive: { ar: 'إيجابي (+)', en: 'Positive (+)', ckb: 'پۆزەتیڤ (+)' },
  negative: { ar: 'سلبي (-)', en: 'Negative (-)', ckb: 'نێگەتیڤ (-)' },
  pain_reproduced: { ar: 'أثار الألم', en: 'Pain Reproduced', ckb: 'ئازاری دەرخست' },
  inconclusive: { ar: 'غير حاسم', en: 'Inconclusive', ckb: 'یەکلاکەرەوە نییە' },
  not_tested: { ar: 'لم يُفحص', en: 'Not Tested', ckb: 'پشکنینی بۆ نەکراوە' },
};

/**
 * Formats currency using Latin numerals and places the currency symbol AFTER
 * the number (per clinic owner invariant: e.g. "25,000 د.ع").
 */
export function formatCurrencyText(
  amount: number,
  currencyCode: string = DEFAULT_CURRENCY_CODE,
  language: SupportedLanguage = 'ar'
): string {
  const safe = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
  const cfg = getCurrencyConfig(currencyCode);
  const locale = language === 'en' ? 'en-US' : 'ar-IQ-u-nu-latn';
  const formattedNumber = new Intl.NumberFormat(locale, {
    maximumFractionDigits: cfg.decimals,
    minimumFractionDigits: cfg.decimals > 0 && Math.abs(safe) % 1 !== 0 ? 2 : 0,
  }).format(safe);
  const symbol = language === 'en' ? cfg.symbolEn : cfg.symbolAr;
  return `${formattedNumber} ${symbol}`;
}

export function buildPatientQuickSummary(input: PatientQuickSummaryInput): PatientQuickSummary {
  const {
    patient,
    patientIndex = 0,
    episodes,
    episodeStores,
    latestSoapByEpisode,
    sessionsByEpisode,
    nprsSeriesByEpisode = {},
    appointments,
    invoices,
    canViewFinance,
    currencyCode = DEFAULT_CURRENCY_CODE,
    language,
  } = input;

  const p = patient.data;
  const primaryName = getPatientDisplayName(p, language);
  const secondaryName = getPatientSecondaryName(p, language) || undefined;
  const mrn = getPatientMrn(patient, patientIndex);
  const age = computePatientAge(p.dateOfBirth, p.age);
  const phoneRaw = p.phoneNumber || p.phone;
  const phone = phoneRaw ? formatIraqiPhoneDisplay(phoneRaw) : undefined;
  const emergencyParts = [
    p.emergencyContactName?.trim(),
    p.emergencyContactRelation?.trim() ? `(${p.emergencyContactRelation.trim()})` : undefined,
    p.emergencyContactPhone?.trim() ? formatIraqiPhoneDisplay(p.emergencyContactPhone) : undefined,
  ].filter(Boolean);

  const checklistAlerts = (p.redFlagChecklist || [])
    .filter((item) => item.status === 'present')
    .map((item) => {
      const label = language === 'en' ? item.labelEn : item.labelAr;
      return item.notes?.trim() ? `${label}: ${item.notes.trim()}` : label;
    });

  const hasAnyAlert = Boolean(
    (p.redFlags && p.redFlags.trim()) ||
      checklistAlerts.length > 0 ||
      (p.allergies && p.allergies.trim()) ||
      (p.precautions && p.precautions.trim()) ||
      (p.contraindications && p.contraindications.trim())
  );

  const dateLocale = language === 'en' ? 'en' : language === 'ckb' ? 'ckb' : 'ar';

  const episodeItems: PatientSummaryEpisodeItem[] = episodes.map((ep) => {
    const store = episodeStores[ep.id];
    const latestSoap = latestSoapByEpisode[ep.id] || null;
    const epSessions = sessionsByEpisode[ep.id] || [];

    const completedSessionsCount = epSessions.filter((s) => s.status === 'finalized').length;

    const statusMeta = EPISODE_STATUS_MAP[ep.status] || EPISODE_STATUS_MAP.active;
    const specMeta = SPECIALTY_MAP[ep.primarySpecialty] || SPECIALTY_MAP.general;

    const painParts: string[] = [];
    if (store) {
      if (typeof store.painAtRestNrs === 'number' && store.painAtRestNrs > 0) {
        painParts.push(`${ltext(language, 'راحة', 'Rest', 'لە کاتی حەسانەوەدا')}: ${store.painAtRestNrs}/10`);
      }
      if (typeof store.painOnActivityNrs === 'number' && store.painOnActivityNrs > 0) {
        painParts.push(`${ltext(language, 'حركة', 'Activity', 'لە جووڵەدا')}: ${store.painOnActivityNrs}/10`);
      }
      if (typeof store.painWorst24hNrs === 'number' && store.painWorst24hNrs > 0) {
        painParts.push(`${ltext(language, 'أقصى 24س', 'Worst 24h', 'بەرزترین ٢٤ کاتژمێر')}: ${store.painWorst24hNrs}/10`);
      }
    }

    const series = nprsSeriesByEpisode[ep.id] || [];
    const nprsTrajectory = [...series]
      .sort((a, b) => a.sessionNumber - b.sessionNumber)
      .map((pt) => `#${pt.sessionNumber}: ${pt.pain}/10`);

    const specialTests =
      store?.specialTests?.length
        ? store.specialTests
        : latestSoap?.data.objective?.specialTests || [];

    const specialTestsSummary = specialTests.map((t) => {
      const name = language === 'en' ? t.nameEn || t.nameAr : t.nameAr || t.nameEn;
      const outMeta = SPECIAL_TEST_OUTCOME_MAP[t.outcome] || SPECIAL_TEST_OUTCOME_MAP.not_tested;
      const outcomeLabel = ltext(language, outMeta.ar, outMeta.en, outMeta.ckb);
      return `${name}: ${outcomeLabel}`;
    });

    const markers =
      store?.bodyChart?.markers?.length
        ? store.bodyChart.markers
        : latestSoap?.data.subjective?.bodyChart?.markers || [];

    const bodyMarkersSummary = markers.map((m) => {
      const meta = resolveMarkerDisplayMeta(m, language);
      const region =
        language === 'en'
          ? m.anatomicalRegionLabelEn || m.anatomicalRegionLabelAr
          : m.anatomicalRegionLabelAr || m.anatomicalRegionLabelEn;
      const sev = typeof m.severityNrs === 'number' ? ` (${m.severityNrs}/10)` : '';
      return region ? `${region}: ${meta.label}${sev}` : `${meta.label}${sev}`;
    });

    let soapExcerpt: PatientSummaryEpisodeItem['latestSoap'];
    if (latestSoap) {
      const sData = latestSoap.data;
      const matchedSession = epSessions.find((s) => s.id === latestSoap.sessionId);
      const prePain = sData.subjective?.painNrsScore;
      const postPain = sData.subjective?.postSessionPainNrs;
      const prePostParts: string[] = [];
      if (typeof prePain === 'number') {
        prePostParts.push(`${ltext(language, 'قبل', 'Pre', 'پێش')}: ${prePain}/10`);
      }
      if (typeof postPain === 'number') {
        prePostParts.push(`${ltext(language, 'بعد', 'Post', 'دوای')}: ${postPain}/10`);
      }
      soapExcerpt = {
        sessionNumber: matchedSession?.sessionNumber,
        sessionDate: matchedSession?.sessionDate
          ? formatClinicalDate(matchedSession.sessionDate, dateLocale)
          : undefined,
        isFinalized: Boolean(sData.isFinalized),
        painPrePost: prePostParts.length ? prePostParts.join(' · ') : undefined,
        subjective:
          sData.subjective?.symptomChangesSinceLastSession?.trim() ||
          sData.subjective?.chiefComplaint?.trim() ||
          sData.subjective?.painLocationDescription?.trim() ||
          undefined,
        objective:
          sData.objective?.dailyInterventionsSummary?.trim() ||
          (sData.objective?.isWithinNormalLimits
            ? ltext(language, 'الفحص ضمن الحدود الطبيعية', 'Within normal limits', 'پشکنین لە سنووری ئاساییدایە')
            : undefined),
        assessment: sData.assessment?.clinicalImpressionCurrent?.trim() || undefined,
        plan:
          sData.plan?.nextSessionPlan?.trim() ||
          sData.plan?.homeInstructions?.trim() ||
          undefined,
      };
    }

    return {
      episodeId: ep.id,
      title: ep.data.title || ep.data.medicalDiagnosis || ltext(language, 'حلقة علاجية', 'Care Episode', 'خولی چارەسەری'),
      diagnosis: ep.data.medicalDiagnosis?.trim() || undefined,
      status: ep.status,
      statusLabel: ltext(language, statusMeta.ar, statusMeta.en, statusMeta.ckb),
      specialtyLabel: ltext(language, specMeta.ar, specMeta.en, specMeta.ckb),
      startDate: formatClinicalDate(ep.data.startDate || ep.startDate, dateLocale),
      endDate: ep.data.endDate ? formatClinicalDate(ep.data.endDate, dateLocale) : undefined,
      chiefComplaint: store?.chiefComplaint?.trim() || ep.data.chiefComplaint?.trim() || undefined,
      clinicalImpression:
        store?.clinicalImpression?.trim() || ep.data.clinicalImpression?.trim() || undefined,
      painSnapshot: painParts.length ? painParts.join(' | ') : undefined,
      nprsTrajectory,
      totalSessionsCount: epSessions.length,
      completedSessionsCount,
      specialTestsSummary,
      bodyMarkersSummary,
      hepCount: store?.hepProgram?.length || 0,
      latestSoap: soapExcerpt,
    };
  });

  const attachments: PatientSummaryAttachmentItem[] = (p.attachments || []).map((att) => {
    const normalized = normalizeLegacyAttachment(att);
    return {
      id: normalized.id,
      title: normalized.title,
      categoryLabel: getAttachmentCategoryDisplayLabel(normalized, language),
      studyDate: normalized.studyDate || normalized.dateAdded
        ? formatClinicalDate(normalized.studyDate || normalized.dateAdded, dateLocale)
        : undefined,
      bodyRegion: normalized.bodyRegion,
      summaryNotes: normalized.summaryNotes,
      fileName: normalized.fileName,
    };
  });

  const sortedAppointments = [...appointments]
    .filter((a) => a.patientId === patient.id)
    .sort((a, b) => `${b.date}T${b.startTime}`.localeCompare(`${a.date}T${a.startTime}`))
    .slice(0, 8)
    .map((appt) => {
      const meta = APPOINTMENT_STATUS_MAP[appt.status] || APPOINTMENT_STATUS_MAP.scheduled;
      return {
        id: appt.id,
        date: formatClinicalDate(appt.date, dateLocale),
        startTime: formatTimeIraq(appt.startTime, language),
        therapistName: appt.therapistName,
        statusLabel: ltext(language, meta.ar, meta.en, meta.ckb),
      };
    });

  let finance: PatientSummaryFinanceSection | undefined;
  if (canViewFinance) {
    const patientInvoices = invoices.filter((inv) => inv.patientId === patient.id && inv.status !== 'void');
    const totalNet = patientInvoices.reduce((sum, inv) => sum + (Number(inv.netAmountIQD) || 0), 0);
    const totalPaid = patientInvoices.reduce((sum, inv) => sum + (Number(inv.paidAmountIQD) || 0), 0);
    const balanceDue = patientInvoices.reduce((sum, inv) => sum + (Number(inv.balanceDueIQD) || 0), 0);
    finance = {
      visible: true,
      invoiceCount: patientInvoices.length,
      currencyCode,
      totalNet,
      totalPaid,
      balanceDue,
      formattedTotalNet: formatCurrencyText(totalNet, currencyCode, language),
      formattedTotalPaid: formatCurrencyText(totalPaid, currencyCode, language),
      formattedBalanceDue: formatCurrencyText(balanceDue, currencyCode, language),
    };
  }

  return {
    header: {
      primaryName,
      secondaryName,
      mrn,
      genderLabel:
        p.gender === 'male'
          ? ltext(language, 'ذكر', 'Male', 'نێر')
          : ltext(language, 'أنثى', 'Female', 'مێ'),
      age,
      phone,
      occupation: p.occupation?.trim() || undefined,
      address: p.address?.trim() || undefined,
      referringPhysician: p.referringPhysician?.trim() || undefined,
      referringClinic: p.referringClinic?.trim() || undefined,
      emergencyContact: emergencyParts.length ? emergencyParts.join(' · ') : undefined,
      updatedAtLabel: formatClinicalDate(patient.updatedAt, dateLocale),
    },
    alerts: {
      hasAnyAlert,
      redFlags: p.redFlags?.trim() || undefined,
      checklistAlerts,
      allergies: p.allergies?.trim() || undefined,
      precautions: p.precautions?.trim() || undefined,
      contraindications: p.contraindications?.trim() || undefined,
    },
    clinicalBackground: {
      medicalHistory: p.medicalHistory?.trim() || undefined,
      previousSurgeries: p.previousSurgeries?.trim() || undefined,
      currentMedications: p.currentMedications?.trim() || undefined,
      comorbidities: p.comorbidities?.trim() || undefined,
      generalNotes: p.generalNotes?.trim() || undefined,
    },
    episodes: episodeItems,
    attachments,
    appointments: sortedAppointments,
    finance,
  };
}

/**
 * Produces a structured plain-text clinical report for quick reading or clipboard copy.
 * Strictly omits financial data when `summary.finance` is undefined (RBAC enforcement).
 */
export function renderPatientSummaryText(
  summary: PatientQuickSummary,
  language: SupportedLanguage = 'ar'
): string {
  const lines: string[] = [];
  const sep = '----------------------------------------';

  lines.push(ltext(language, 'التقرير السريري المختصر للمريض', 'PATIENT CLINICAL QUICK SUMMARY', 'پوختەی ڕاپۆرتی کلینیکی نەخۆش'));
  lines.push(sep);
  lines.push(`${ltext(language, 'الاسم', 'Name', 'ناو')}: ${summary.header.primaryName}${summary.header.secondaryName ? ` (${summary.header.secondaryName})` : ''}`);
  lines.push(`MRN: ${summary.header.mrn}`);
  lines.push(`${ltext(language, 'الجنس / العمر', 'Gender / Age', 'ڕەگەز / تەمەن')}: ${summary.header.genderLabel}${summary.header.age !== undefined ? ` · ${summary.header.age}` : ''}`);
  if (summary.header.phone) lines.push(`${ltext(language, 'الهاتف', 'Phone', 'تەلەفۆن')}: ${summary.header.phone}`);
  if (summary.header.occupation) lines.push(`${ltext(language, 'المهنة', 'Occupation', 'پیشە')}: ${summary.header.occupation}`);
  if (summary.header.referringPhysician || summary.header.referringClinic) {
    lines.push(
      `${ltext(language, 'الطبيب المحيل', 'Referring MD', 'پزیشکی ڕەوانەکار')}: ${[summary.header.referringPhysician, summary.header.referringClinic].filter(Boolean).join(' — ')}`
    );
  }
  lines.push(`${ltext(language, 'آخر تحديث', 'Updated', 'دوایین نوێکردنەوە')}: ${summary.header.updatedAtLabel}`);

  if (summary.alerts.hasAnyAlert) {
    lines.push('');
    lines.push(ltext(language, '[!] التنبيهات والمحاذير السريرية', '[!] ALERTS & PRECAUTIONS', '[!] ئاگادارکردنەوە کلینیکییەکان'));
    if (summary.alerts.redFlags) lines.push(`- ${ltext(language, 'علامات الخطر', 'Red Flags', 'نیشانە مەترسیدارەکان')}: ${summary.alerts.redFlags}`);
    for (const item of summary.alerts.checklistAlerts) {
      lines.push(`- ${item}`);
    }
    if (summary.alerts.allergies) lines.push(`- ${ltext(language, 'الحساسية', 'Allergies', 'هەستیاری')}: ${summary.alerts.allergies}`);
    if (summary.alerts.precautions) lines.push(`- ${ltext(language, 'الاحتياطات', 'Precautions', 'ئاگاداری')}: ${summary.alerts.precautions}`);
    if (summary.alerts.contraindications) lines.push(`- ${ltext(language, 'الموانع', 'Contraindications', 'قەدەغەکراوەکان')}: ${summary.alerts.contraindications}`);
  }

  const bg = summary.clinicalBackground;
  if (bg.medicalHistory || bg.previousSurgeries || bg.currentMedications || bg.generalNotes) {
    lines.push('');
    lines.push(ltext(language, 'التاريخ الطبي والأدوية', 'MEDICAL BACKGROUND', 'مێژووی پزیشکی و دەرمانەکان'));
    if (bg.medicalHistory) lines.push(`- ${ltext(language, 'التاريخ المرضي', 'Medical History', 'مێژووی نەخۆشی')}: ${bg.medicalHistory}`);
    if (bg.previousSurgeries) lines.push(`- ${ltext(language, 'العمليات السابقة', 'Surgeries', 'نەشتەرگەری پێشوو')}: ${bg.previousSurgeries}`);
    if (bg.currentMedications) lines.push(`- ${ltext(language, 'الأدوية الحالية', 'Medications', 'دەرمانەکان')}: ${bg.currentMedications}`);
    if (bg.generalNotes) lines.push(`- ${ltext(language, 'ملاحظات عامة', 'General Notes', 'تێبینی گشتی')}: ${bg.generalNotes}`);
  }

  lines.push('');
  lines.push(`${ltext(language, 'الحلقات العلاجية والتقييم', 'CARE EPISODES & ASSESSMENT', 'خولە چارەسەرییەکان و هەڵسەنگاندن')} (${summary.episodes.length})`);
  if (summary.episodes.length === 0) {
    lines.push(`- ${ltext(language, 'لا توجد حلقات علاجية مسجلة', 'No recorded episodes', 'هیچ خولێکی چارەسەری تۆمار نەکراوە')}`);
  } else {
    for (const ep of summary.episodes) {
      lines.push(`• ${ep.title} [${ep.statusLabel} · ${ep.specialtyLabel}] (${ep.startDate}${ep.endDate ? ` → ${ep.endDate}` : ''})`);
      if (ep.diagnosis) lines.push(`  ${ltext(language, 'التشخيص', 'Diagnosis', 'دەستنیشانکردن')}: ${ep.diagnosis}`);
      if (ep.chiefComplaint) lines.push(`  ${ltext(language, 'الشكوى الرئيسية', 'Chief Complaint', 'سکاڵای سەرەکی')}: ${ep.chiefComplaint}`);
      if (ep.clinicalImpression) lines.push(`  ${ltext(language, 'التقييم السريري', 'Clinical Impression', 'هەڵسەنگاندنی کلینیکی')}: ${ep.clinicalImpression}`);
      if (ep.painSnapshot) lines.push(`  ${ltext(language, 'الألم المبدئي', 'Baseline Pain', 'ئازاری سەرەتایی')}: ${ep.painSnapshot}`);
      if (ep.nprsTrajectory.length > 0) {
        lines.push(`  ${ltext(language, 'مسار الألم (NPRS)', 'Pain Trajectory (NPRS)', 'ڕەوتی ئازار (NPRS)')}: ${ep.nprsTrajectory.join(' → ')}`);
      }
      lines.push(`  ${ltext(language, 'الجلسات', 'Sessions', 'دانیشتنەکان')}: ${ep.completedSessionsCount}/${ep.totalSessionsCount} · ${ltext(language, 'تمارين HEP', 'HEP Exercises', 'ڕاهێنانی ماڵەوە')}: ${ep.hepCount}`);
      if (ep.specialTestsSummary.length > 0) {
        lines.push(`  ${ltext(language, 'الفحوصات التخصصية', 'Special Tests', 'پشکنینە تایبەتەکان')}: ${ep.specialTestsSummary.join(' | ')}`);
      }
      if (ep.bodyMarkersSummary.length > 0) {
        lines.push(`  ${ltext(language, 'مخطط الجسم', 'Body Chart', 'نەخشەی جەستە')}: ${ep.bodyMarkersSummary.join(' | ')}`);
      }
      if (ep.latestSoap) {
        const soapLabel = ep.latestSoap.isFinalized
          ? ltext(language, 'مختوم نهائياً', 'Finalized', 'مۆرکراوی کۆتایی')
          : ltext(language, 'مسودة', 'Draft', 'ڕەشنووس');
        lines.push(`  ${ltext(language, 'آخر ملاحظة SOAP', 'Latest SOAP Note', 'دوایین تێبینی SOAP')} (${ep.latestSoap.sessionDate || ''} · ${soapLabel}):`);
        if (ep.latestSoap.painPrePost) lines.push(`    pain: ${ep.latestSoap.painPrePost}`);
        if (ep.latestSoap.subjective) lines.push(`    S: ${ep.latestSoap.subjective}`);
        if (ep.latestSoap.objective) lines.push(`    O: ${ep.latestSoap.objective}`);
        if (ep.latestSoap.assessment) lines.push(`    A: ${ep.latestSoap.assessment}`);
        if (ep.latestSoap.plan) lines.push(`    P: ${ep.latestSoap.plan}`);
      }
    }
  }

  if (summary.attachments.length > 0) {
    lines.push('');
    lines.push(`${ltext(language, 'المستندات والأشعة والرنين', 'IMAGING & CLINICAL DOCUMENTS', 'بەڵگەنامە، تیشک و ڕەنین')} (${summary.attachments.length})`);
    for (const att of summary.attachments) {
      const parts = [att.title, `[${att.categoryLabel}]`, att.studyDate, att.bodyRegion].filter(Boolean);
      lines.push(`- ${parts.join(' · ')}`);
      if (att.summaryNotes) lines.push(`  ${att.summaryNotes}`);
    }
  }

  if (summary.appointments.length > 0) {
    lines.push('');
    lines.push(`${ltext(language, 'المواعيد', 'APPOINTMENTS', 'کاتەکان')} (${summary.appointments.length})`);
    for (const appt of summary.appointments) {
      lines.push(`- ${appt.date} ${appt.startTime} · ${appt.therapistName} (${appt.statusLabel})`);
    }
  }

  if (summary.finance) {
    lines.push('');
    lines.push(ltext(language, 'الملخص المالي', 'FINANCIAL SUMMARY', 'پوختەی دارایی'));
    lines.push(
      `- ${ltext(language, 'الفواتير', 'Invoices', 'پسوڵەکان')}: ${summary.finance.invoiceCount} | ${ltext(language, 'الإجمالي', 'Net Total', 'کۆی گشتی')}: ${summary.finance.formattedTotalNet} | ${ltext(language, 'المدفوع', 'Paid', 'دراو')}: ${summary.finance.formattedTotalPaid} | ${ltext(language, 'المتبقي', 'Balance Due', 'ماوە')}: ${summary.finance.formattedBalanceDue}`
    );
  }

  return lines.join('\n');
}
