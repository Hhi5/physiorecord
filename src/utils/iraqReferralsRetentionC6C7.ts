// =======================================================================
// PhysioRecord — Phase C6–C7: Referrals, Doctor Report-Back & Retention Lists
// Pure, offline-first clinical & operational helpers (zero network requests).
// =======================================================================

import type {
  EpisodeClinicalData,
  EpisodeRecord,
  EpisodeStatus,
  PatientClinicalData,
  PatientRecord,
  SessionClinicalData,
  SessionRecord,
  SoapNoteRecord,
} from '../types/clinical';
import type {
  ClinicAppointment,
  EpisodeScopedClinicalStore,
  FinancialInvoiceIQD,
  FollowUpIntervalWeeks,
  PostDischargeFollowUpRecord,
  ReferralSourceType,
  ReferringDoctorEntry,
} from '../types/clinicManagement';
import {
  addDaysToDateStr,
  buildWhatsAppReminderUrl,
  formatDateDDMMYYYY,
  localDate,
} from './date';

export const REFERRAL_SOURCE_TYPES: readonly ReferralSourceType[] = [
  'doctor',
  'hospital',
  'friend',
  'social_media',
  'other',
] as const;

export const REFERRAL_SOURCE_LABELS: Record<
  ReferralSourceType,
  { ar: string; en: string }
> = {
  doctor: { ar: 'طبيب محيل', en: 'Referring Doctor' },
  hospital: { ar: 'مستشفى / مركز صحي', en: 'Hospital / Medical Center' },
  friend: { ar: 'توصية مريض / صديق', en: 'Patient / Friend Referral' },
  social_media: { ar: 'وسائل التواصل الاجتماعي', en: 'Social Media' },
  other: { ar: 'مصدر آخر', en: 'Other Source' },
};

/**
 * Structural compatibility shapes allowing either full decrypted Dexie records
 * (`PatientRecord` / `EpisodeRecord` / `SessionRecord`) or lightweight DTOs.
 */
export type PatientLike =
  | PatientRecord
  | {
      id: string;
      createdAt?: string;
      updatedAt?: string;
      isArchived?: number;
      data?: Partial<PatientClinicalData>;
      fullName?: string;
      fullNameAr?: string;
      phone?: string;
      phoneNumber?: string;
      mrn?: string;
      age?: number;
      gender?: string;
    };

export type EpisodeLike =
  | EpisodeRecord
  | {
      id: string;
      patientId: string;
      status?: EpisodeStatus | string;
      primarySpecialty?: string;
      startDate?: string;
      endDate?: string;
      createdAt?: string;
      updatedAt?: string;
      title?: string;
      medicalDiagnosis?: string;
      data?: Partial<EpisodeClinicalData>;
    };

export type SessionLike =
  | SessionRecord
  | {
      id: string;
      episodeId: string;
      patientId: string;
      sessionNumber?: number;
      sessionDate?: string;
      status?: string;
      createdAt?: string;
      updatedAt?: string;
      notes?: string;
      painNrs?: number;
      vasScore?: number;
      data?: Partial<SessionClinicalData> & Record<string, unknown>;
    };

const VALID_REFERRAL_SOURCES = new Set<string>(REFERRAL_SOURCE_TYPES);

function resolveClinicalRecord(
  patient: PatientLike,
  clinicalRecordsByPatientId?: Record<string, PatientClinicalData | null | undefined>
): Partial<PatientClinicalData> | null {
  if (
    clinicalRecordsByPatientId &&
    Object.prototype.hasOwnProperty.call(clinicalRecordsByPatientId, patient.id)
  ) {
    const mapped = clinicalRecordsByPatientId[patient.id];
    if (mapped === null) {
      return null;
    }
    if (mapped) {
      return patient.data ? { ...patient.data, ...mapped } : mapped;
    }
  }
  if (patient.data) return patient.data;

  const flat = patient as Record<string, unknown>;
  if (
    typeof flat.fullName === 'string' ||
    typeof flat.fullNameAr === 'string' ||
    typeof flat.referralSourceType === 'string'
  ) {
    return flat as Partial<PatientClinicalData>;
  }
  return null;
}

export function resolvePatientName(
  patient: PatientLike | undefined,
  clinical?: Partial<PatientClinicalData> | null,
  isAr = true,
  fallback = ''
): string {
  const flat = (patient || {}) as Record<string, unknown>;
  const arName =
    clinical?.fullNameAr?.trim() ||
    (typeof flat.fullNameAr === 'string' ? flat.fullNameAr.trim() : '');
  const enName =
    clinical?.fullName?.trim() ||
    (typeof flat.fullName === 'string' ? flat.fullName.trim() : '');
  if (isAr) {
    return arName || enName || fallback || 'مريض';
  }
  return enName || arName || fallback || 'Patient';
}

export function resolvePatientPhone(
  patient: PatientLike | undefined,
  clinical?: Partial<PatientClinicalData> | null
): string {
  const flat = (patient || {}) as Record<string, unknown>;
  return (
    clinical?.phoneNumber?.trim() ||
    clinical?.phone?.trim() ||
    (typeof flat.phoneNumber === 'string' ? flat.phoneNumber.trim() : '') ||
    (typeof flat.phone === 'string' ? flat.phone.trim() : '') ||
    ''
  );
}

/**
 * Resolves a patient's effective referral source type, inferring `'doctor'` or `'hospital'`
 * for legacy records that predate `referralSourceType`.
 */
export function resolvePatientReferralSource(
  clinical?: Partial<PatientClinicalData> | null
): ReferralSourceType | null {
  if (!clinical) return null;
  if (clinical.referralSourceType && VALID_REFERRAL_SOURCES.has(clinical.referralSourceType)) {
    return clinical.referralSourceType;
  }
  if (clinical.referringDoctorId || clinical.referringPhysician?.trim()) {
    return 'doctor';
  }
  if (clinical.referringClinic?.trim()) {
    return 'hospital';
  }
  return null;
}

function pickBilingualField(
  arValue: string | undefined,
  enValue: string | undefined,
  isAr: boolean
): string {
  return isAr
    ? arValue?.trim() || enValue?.trim() || ''
    : enValue?.trim() || arValue?.trim() || '';
}

export function resolveDoctorDisplayName(
  doctor: ReferringDoctorEntry | null | undefined,
  isAr: boolean
): string {
  if (!doctor) return '';
  return pickBilingualField(doctor.nameAr, doctor.nameEn, isAr);
}

export function resolveDoctorSpecialty(
  doctor: ReferringDoctorEntry | null | undefined,
  isAr: boolean
): string {
  if (!doctor) return '';
  return pickBilingualField(doctor.specialtyAr, doctor.specialtyEn, isAr);
}

export function resolveDoctorFacility(
  doctor: ReferringDoctorEntry | null | undefined,
  isAr: boolean
): string {
  if (!doctor) return '';
  return pickBilingualField(doctor.facilityAr, doctor.facilityEn, isAr);
}

function normalizeDateYmd(input: string | undefined | null): string {
  if (!input) return '';
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }
  return localDate(trimmed);
}

function diffCalendarDays(earlierYmd: string, laterYmd: string): number {
  const eNorm = normalizeDateYmd(earlierYmd);
  const lNorm = normalizeDateYmd(laterYmd);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eNorm) || !/^\d{4}-\d{2}-\d{2}$/.test(lNorm)) {
    return 0;
  }
  const [ey, em, ed] = eNorm.split('-').map(Number);
  const [ly, lm, ld] = lNorm.split('-').map(Number);
  const eUtc = Date.UTC(ey, em - 1, ed);
  const lUtc = Date.UTC(ly, lm - 1, ld);
  return Math.floor((lUtc - eUtc) / 86_400_000);
}

function resolveEpisodeStatus(ep: EpisodeLike): string {
  return ep.data?.status ?? ep.status ?? 'active';
}

function resolveEpisodeStartDate(ep: EpisodeLike): string {
  return normalizeDateYmd(ep.data?.startDate || ep.startDate || ep.createdAt);
}

function resolveEpisodeEndDate(ep: EpisodeLike): string {
  return normalizeDateYmd(ep.data?.endDate || ep.endDate);
}

function resolveEpisodeTitle(ep: EpisodeLike, isAr = true): string {
  const flat = ep as Record<string, unknown>;
  return (
    ep.data?.title?.trim() ||
    (typeof flat.title === 'string' ? flat.title.trim() : '') ||
    ep.data?.medicalDiagnosis?.trim() ||
    (typeof flat.medicalDiagnosis === 'string' ? flat.medicalDiagnosis.trim() : '') ||
    (isAr ? 'حلقة رعاية علاجية' : 'Rehabilitation Episode')
  );
}

function resolveSessionDate(s: SessionLike): string {
  return normalizeDateYmd(s.data?.sessionDate || s.sessionDate || s.createdAt);
}

function resolveSessionStatus(s: SessionLike): string {
  return s.data?.status ?? s.status ?? 'draft';
}

function resolveSessionNumber(s: SessionLike, fallbackIdx: number): number {
  const n = s.data?.sessionNumber ?? s.sessionNumber;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallbackIdx + 1;
}

// -----------------------------------------------------------------------
// C6: Referral Source Statistics
// -----------------------------------------------------------------------

export interface ReferralSourceStatItem {
  sourceType: ReferralSourceType;
  labelAr: string;
  labelEn: string;
  patientCount: number;
  billedRevenueIQD: number;
  collectedRevenueIQD: number;
  revenueIQD: number;
  sharePercent: number;
}

export interface ReferringDoctorStatItem {
  doctorId: string;
  doctor: ReferringDoctorEntry;
  patientCount: number;
  billedRevenueIQD: number;
  collectedRevenueIQD: number;
  revenueIQD: number;
  patientIds: string[];
}

export interface ReferralStatisticsSummary {
  totalPatients: number;
  totalReferredPatients: number;
  unattributedPatientsCount: number;
  totalReferredBilledRevenueIQD: number;
  totalReferredCollectedRevenueIQD: number;
  bySource: ReferralSourceStatItem[];
  bySourceMap: Record<ReferralSourceType, ReferralSourceStatItem>;
  byDoctor: ReferringDoctorStatItem[];
}

/**
 * Computes referral patient counts and non-void invoice revenue per referral source
 * and per referring doctor in the local clinic directory.
 */
export function computeReferralStatistics(params: {
  patients: PatientLike[];
  clinicalRecordsByPatientId?: Record<string, PatientClinicalData | null | undefined>;
  doctors: ReferringDoctorEntry[];
  invoices: FinancialInvoiceIQD[];
}): ReferralStatisticsSummary {
  const { patients, clinicalRecordsByPatientId, doctors, invoices } = params;

  const revenueByPatient = new Map<string, { billed: number; collected: number }>();
  for (const inv of invoices) {
    if (inv.status === 'void') continue;
    const prev = revenueByPatient.get(inv.patientId) || { billed: 0, collected: 0 };
    const netBilled = Number.isFinite(inv.netAmountIQD)
      ? inv.netAmountIQD
      : Math.max(0, (inv.totalAmountIQD || 0) - (inv.discountIQD || 0));
    prev.billed += Math.max(0, netBilled);
    prev.collected += Math.max(0, inv.paidAmountIQD || 0);
    revenueByPatient.set(inv.patientId, prev);
  }

  const bySourceMap = {} as Record<ReferralSourceType, ReferralSourceStatItem>;
  for (const src of REFERRAL_SOURCE_TYPES) {
    bySourceMap[src] = {
      sourceType: src,
      labelAr: REFERRAL_SOURCE_LABELS[src].ar,
      labelEn: REFERRAL_SOURCE_LABELS[src].en,
      patientCount: 0,
      billedRevenueIQD: 0,
      collectedRevenueIQD: 0,
      revenueIQD: 0,
      sharePercent: 0,
    };
  }

  const doctorBuckets = new Map<string, ReferringDoctorStatItem>();
  const doctorNameLookup = new Map<string, string>();
  for (const doc of doctors) {
    doctorBuckets.set(doc.id, {
      doctorId: doc.id,
      doctor: doc,
      patientCount: 0,
      billedRevenueIQD: 0,
      collectedRevenueIQD: 0,
      revenueIQD: 0,
      patientIds: [],
    });
    if (doc.nameAr?.trim()) {
      doctorNameLookup.set(doc.nameAr.trim().toLowerCase(), doc.id);
    }
    if (doc.nameEn?.trim()) {
      doctorNameLookup.set(doc.nameEn.trim().toLowerCase(), doc.id);
    }
  }

  let totalReferredPatients = 0;
  let unattributedPatientsCount = 0;
  let totalReferredBilledRevenueIQD = 0;
  let totalReferredCollectedRevenueIQD = 0;

  for (const patient of patients) {
    const clinical = resolveClinicalRecord(patient, clinicalRecordsByPatientId);
    const rev = revenueByPatient.get(patient.id) || { billed: 0, collected: 0 };
    const sourceType = resolvePatientReferralSource(clinical);

    if (sourceType) {
      totalReferredPatients += 1;
      totalReferredBilledRevenueIQD += rev.billed;
      totalReferredCollectedRevenueIQD += rev.collected;

      const bucket = bySourceMap[sourceType];
      bucket.patientCount += 1;
      bucket.billedRevenueIQD += rev.billed;
      bucket.collectedRevenueIQD += rev.collected;
      bucket.revenueIQD += rev.billed;
    } else {
      unattributedPatientsCount += 1;
    }

    let matchedDoctorId = clinical?.referringDoctorId?.trim() || '';
    if (!matchedDoctorId && clinical?.referringPhysician?.trim()) {
      matchedDoctorId =
        doctorNameLookup.get(clinical.referringPhysician.trim().toLowerCase()) || '';
    }

    if (matchedDoctorId && doctorBuckets.has(matchedDoctorId)) {
      const docBucket = doctorBuckets.get(matchedDoctorId)!;
      docBucket.patientCount += 1;
      docBucket.billedRevenueIQD += rev.billed;
      docBucket.collectedRevenueIQD += rev.collected;
      docBucket.revenueIQD += rev.billed;
      docBucket.patientIds.push(patient.id);
    }
  }

  for (const src of REFERRAL_SOURCE_TYPES) {
    const item = bySourceMap[src];
    item.sharePercent =
      totalReferredPatients > 0
        ? Math.round((item.patientCount / totalReferredPatients) * 100)
        : 0;
  }

  const bySource = REFERRAL_SOURCE_TYPES.map((src) => bySourceMap[src]);
  const byDoctor = Array.from(doctorBuckets.values()).sort(
    (a, b) =>
      b.patientCount - a.patientCount || b.billedRevenueIQD - a.billedRevenueIQD
  );

  return {
    totalPatients: patients.length,
    totalReferredPatients,
    unattributedPatientsCount,
    totalReferredBilledRevenueIQD,
    totalReferredCollectedRevenueIQD,
    bySource,
    bySourceMap,
    byDoctor,
  };
}

// -----------------------------------------------------------------------
// C6: Referring Doctor Progress & Report-Back Letter Builder
// -----------------------------------------------------------------------

export interface BuildDoctorReportBackLetterParams {
  doctor?: ReferringDoctorEntry | null;
  doctorNameFallback?: string;
  patient: PatientLike;
  clinicalData?: PatientClinicalData | null;
  episode?: EpisodeLike | null;
  sessions: SessionLike[];
  clinicName?: string;
  therapistName?: string;
  episodeStore?: EpisodeScopedClinicalStore | null;
  soaps?: SoapNoteRecord[];
  referenceDate?: string;
  isAr: boolean;
}

function extractNumericPainFromSession(session: SessionLike): number | null {
  const sRec = session as Record<string, unknown>;
  const dataRec = (session.data || {}) as Record<string, unknown>;
  const candidates = [
    sRec.painNrs,
    sRec.vasScore,
    sRec.painScore,
    dataRec.painNrs,
    dataRec.painNrsScore,
    dataRec.vasScore,
    dataRec.painScore,
  ];
  for (const val of candidates) {
    if (typeof val === 'number' && Number.isFinite(val) && val >= 0 && val <= 10) {
      return val;
    }
  }
  return null;
}

/**
 * Builds a clean printable and copyable bilingual physiotherapy progress & report-back
 * letter addressed to the referring physician.
 */
export function buildDoctorReportBackLetter(
  params: BuildDoctorReportBackLetterParams
): { subject: string; body: string } {
  const {
    doctor,
    doctorNameFallback,
    patient,
    clinicalData,
    episode,
    sessions,
    clinicName,
    therapistName,
    episodeStore,
    soaps = [],
    referenceDate,
    isAr,
  } = params;

  const clinical = clinicalData ?? patient.data ?? null;
  const issueDateStr = formatDateDDMMYYYY(referenceDate || localDate());
  const resolvedClinic =
    clinicName?.trim() || (isAr ? 'عيادة العلاج الطبيعي والتأهيل' : 'Physiotherapy & Rehab Clinic');
  const resolvedTherapist =
    therapistName?.trim() || (isAr ? 'أخصائي العلاج الطبيعي' : 'Physiotherapist');

  const doctorName =
    resolveDoctorDisplayName(doctor, isAr) ||
    doctorNameFallback?.trim() ||
    clinical?.referringPhysician?.trim() ||
    episode?.data?.referringDoctor?.trim() ||
    (isAr ? 'الزميل الدكتور المحترم' : 'Colleague Physician');

  const doctorSpecialty = doctor
    ? isAr
      ? doctor.specialtyAr || doctor.specialtyEn || ''
      : doctor.specialtyEn || doctor.specialtyAr || ''
    : '';

  const doctorFacility =
    (doctor
      ? isAr
        ? doctor.facilityAr || doctor.facilityEn || ''
        : doctor.facilityEn || doctor.facilityAr || ''
      : '') ||
    clinical?.referringClinic?.trim() ||
    '';

  const patientName = resolvePatientName(patient, clinical, isAr);
  const mrn = clinical?.mrn?.trim() || '';
  const age = clinical?.age;
  const genderLabel =
    clinical?.gender === 'male'
      ? isAr
        ? 'ذكر'
        : 'Male'
      : clinical?.gender === 'female'
      ? isAr
        ? 'أنثى'
        : 'Female'
      : '';

  const diagnosis =
    episode?.data?.medicalDiagnosis?.trim() ||
    (episode as Record<string, unknown> | null | undefined)?.medicalDiagnosis?.toString().trim() ||
    (episode ? resolveEpisodeTitle(episode, isAr) : '') ||
    (isAr ? 'تأهيل وعلاج طبيعي' : 'Physiotherapy Rehabilitation');
  const icd10 = episode?.data?.icd10Code?.trim() || '';
  const chiefComplaint =
    episodeStore?.chiefComplaint?.trim() ||
    episode?.data?.chiefComplaint?.trim() ||
    clinical?.medicalHistory?.trim() ||
    '';

  const activeSessions = sessions
    .filter((s) => resolveSessionStatus(s) !== 'cancelled')
    .sort((a, b) => resolveSessionDate(a).localeCompare(resolveSessionDate(b)));
  const finalizedCount = activeSessions.filter(
    (s) => resolveSessionStatus(s) === 'finalized'
  ).length;
  const firstSessionDate = activeSessions[0] ? resolveSessionDate(activeSessions[0]) : '';
  const latestSessionDate =
    activeSessions.length > 0
      ? resolveSessionDate(activeSessions[activeSessions.length - 1])
      : '';

  // Collect pain trajectory (NPRS/VAS 0-10) from snapshots, SOAPs, or direct session fields
  const painEntries: Array<{ label: string; score: number }> = [];
  const snapshots = [...(episodeStore?.snapshots || [])].sort((a, b) =>
    a.recordedDate.localeCompare(b.recordedDate)
  );
  if (snapshots.length > 0) {
    const firstSnap = snapshots[0];
    const lastSnap = snapshots[snapshots.length - 1];
    const firstScore = firstSnap.painNrsActivity ?? firstSnap.painNrsRest;
    const lastScore = lastSnap.painNrsActivity ?? lastSnap.painNrsRest;
    if (typeof firstScore === 'number') {
      painEntries.push({
        label: isAr ? 'الأولي' : 'Initial',
        score: firstScore,
      });
    }
    if (snapshots.length > 1 && typeof lastScore === 'number') {
      painEntries.push({
        label: isAr ? 'الأخير' : 'Latest',
        score: lastScore,
      });
    }
  } else if (soaps.length > 0) {
    const sortedSoaps = [...soaps].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const soapPainVals = sortedSoaps
      .map((sp) => sp.data.subjective?.postSessionPainNrs ?? sp.data.subjective?.painNrsScore)
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    if (soapPainVals.length > 0) {
      painEntries.push({
        label: isAr ? 'الأولي' : 'Initial',
        score: soapPainVals[0],
      });
      if (soapPainVals.length > 1) {
        painEntries.push({
          label: isAr ? 'الأخير' : 'Latest',
          score: soapPainVals[soapPainVals.length - 1],
        });
      }
    }
  } else {
    const directPainVals = activeSessions
      .map(extractNumericPainFromSession)
      .filter((v): v is number => v !== null);
    if (directPainVals.length > 0) {
      painEntries.push({
        label: isAr ? 'الأولي' : 'Initial',
        score: directPainVals[0],
      });
      if (directPainVals.length > 1) {
        painEntries.push({
          label: isAr ? 'الأخير' : 'Latest',
          score: directPainVals[directPainVals.length - 1],
        });
      }
    } else if (
      episodeStore &&
      (episodeStore.painOnActivityNrs > 0 || episodeStore.painAtRestNrs > 0)
    ) {
      painEntries.push({
        label: isAr ? 'التقييم' : 'Baseline',
        score: episodeStore.painOnActivityNrs || episodeStore.painAtRestNrs,
      });
    }
  }

  // Functional scale summary (if recorded)
  const scaleHistory = [...(episodeStore?.functionalScales?.history || [])].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  let functionalProgressLine = '';
  if (scaleHistory.length >= 2) {
    const firstScale = scaleHistory[0];
    const lastScale = scaleHistory[scaleHistory.length - 1];
    const scaleName = isAr ? lastScale.scaleNameAr : lastScale.scaleNameEn;
    functionalProgressLine = isAr
      ? `${scaleName}: من ${firstScale.scorePercentage}% إلى ${lastScale.scorePercentage}%`
      : `${scaleName}: ${firstScale.scorePercentage}% → ${lastScale.scorePercentage}%`;
  } else if (scaleHistory.length === 1) {
    const onlyScale = scaleHistory[0];
    const scaleName = isAr ? onlyScale.scaleNameAr : onlyScale.scaleNameEn;
    functionalProgressLine = isAr
      ? `${scaleName}: ${onlyScale.scorePercentage}% (${onlyScale.severityLabelAr})`
      : `${scaleName}: ${onlyScale.scorePercentage}% (${onlyScale.severityLabelEn})`;
  } else if (snapshots.length > 0 && snapshots[snapshots.length - 1].outcomeScale) {
    const os = snapshots[snapshots.length - 1].outcomeScale!;
    functionalProgressLine = isAr
      ? `${os.scaleNameAr}: ${os.scorePercentage}% (${os.severityLabelAr})`
      : `${os.scaleNameEn}: ${os.scorePercentage}% (${os.severityLabelEn})`;
  }

  const sortedSoaps = [...soaps].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const latestSoap = sortedSoaps.length > 0 ? sortedSoaps[sortedSoaps.length - 1] : null;
  const clinicalImpression =
    episodeStore?.clinicalImpression?.trim() ||
    latestSoap?.data.assessment?.clinicalImpressionCurrent?.trim() ||
    episode?.data?.clinicalImpression?.trim() ||
    '';

  const epStatus = episode ? resolveEpisodeStatus(episode) : 'active';
  const freq = episodeStore?.treatmentFrequency?.trim() || episode?.data?.treatmentFrequency?.trim();
  const planWeeks = episodeStore?.plannedDurationWeeks ?? episode?.data?.plannedDurationWeeks;
  const planLine =
    episode?.data?.dischargeSummary?.trim() ||
    episode?.data?.dischargeFinalOutcomeNote?.trim() ||
    latestSoap?.data.plan?.nextSessionPlan?.trim() ||
    latestSoap?.data.plan?.homeInstructions?.trim() ||
    (epStatus === 'completed'
      ? isAr
        ? 'تم استيفاء الخطة التأهيلية وتخريج المريض مع برنامج تمارين منزلية وقائية.'
        : 'Rehabilitation course completed; patient discharged with a maintenance home exercise program.'
      : freq
      ? isAr
        ? `الاستمرار بالبرنامج التأهيلي بمعدل (${freq})${planWeeks ? ` لمدة ${planWeeks} أسابيع` : ''}.`
        : `Continue structured physiotherapy (${freq}${planWeeks ? ` over ${planWeeks} weeks` : ''}).`
      : isAr
      ? 'الاستمرار في جلسات العلاج الطبيعي والمتابعة السريرية الدورية وإعادة التقييم.'
      : 'Continue physiotherapy sessions with periodic functional re-evaluation.');

  const subject = isAr
    ? `تقرير متابعة علاج طبيعي — ${patientName} (إلى ${doctorName})`
    : `Physiotherapy Progress Report — ${patientName} (To ${doctorName})`;

  const lines: string[] = [];
  if (isAr) {
    lines.push(`${resolvedClinic}`);
    lines.push(`التاريخ: ${issueDateStr}`);
    lines.push('');
    lines.push(
      `تحية طيبة وبعد، إلى الدكتور/ة ${doctorName}${doctorSpecialty ? ` (${doctorSpecialty})` : ''}${
        doctorFacility ? ` — ${doctorFacility}` : ''
      }`
    );
    lines.push('');
    lines.push(
      `نود إعلامكم بملخص التقييم والتقدم التأهيلي للمريض/ة المحال من قبلكم:`
    );
    lines.push(
      `• الاسم: ${patientName}${mrn ? ` | رقم الملف: ${mrn}` : ''}${
        age ? ` | العمر: ${age} سنة` : ''
      }${genderLabel ? ` | الجنس: ${genderLabel}` : ''}`
    );
    lines.push(`• التشخيص: ${diagnosis}${icd10 ? ` (${icd10})` : ''}`);
    if (chiefComplaint) {
      lines.push(`• الشكوى الرئيسية: ${chiefComplaint}`);
    }
    lines.push(
      `• عدد الجلسات: ${activeSessions.length} جلسة${
        finalizedCount > 0 ? ` (${finalizedCount} معتمدة)` : ''
      }${
        firstSessionDate && latestSessionDate
          ? ` (من ${formatDateDDMMYYYY(firstSessionDate)} إلى ${formatDateDDMMYYYY(latestSessionDate)})`
          : ''
      }`
    );
    if (painEntries.length === 2) {
      lines.push(
        `• مقياس الألم (NPRS/VAS): من ${painEntries[0].score}/10 (${painEntries[0].label}) إلى ${painEntries[1].score}/10 (${painEntries[1].label})`
      );
    } else if (painEntries.length === 1) {
      lines.push(`• مقياس الألم (NPRS/VAS): ${painEntries[0].score}/10 (${painEntries[0].label})`);
    }
    if (functionalProgressLine) {
      lines.push(`• التقدم الوظيفي: ${functionalProgressLine}`);
    }
    if (clinicalImpression) {
      lines.push(`• الملاحظات والتفسير السريري: ${clinicalImpression}`);
    }
    lines.push(`• الخطة والتوصية الحالية: ${planLine}`);
    lines.push('');
    lines.push('شاكرين تعاونكم الكريم ويسعدنا تواصلكم لأي استفسار طبي.');
    lines.push(`مع التقدير،`);
    lines.push(`${resolvedTherapist}`);
    lines.push(`${resolvedClinic}`);
  } else {
    lines.push(`${resolvedClinic}`);
    lines.push(`Date: ${issueDateStr}`);
    lines.push('');
    lines.push(
      `Dear ${doctorName}${doctorSpecialty ? ` (${doctorSpecialty})` : ''}${
        doctorFacility ? ` — ${doctorFacility}` : ''
      },`
    );
    lines.push('');
    lines.push(
      `Thank you for referring the patient below. Here is a summary of their physiotherapy progress:`
    );
    lines.push(
      `• Patient: ${patientName}${mrn ? ` | MRN: ${mrn}` : ''}${
        age ? ` | Age: ${age} yrs` : ''
      }${genderLabel ? ` | Gender: ${genderLabel}` : ''}`
    );
    lines.push(`• Diagnosis: ${diagnosis}${icd10 ? ` (${icd10})` : ''}`);
    if (chiefComplaint) {
      lines.push(`• Chief Complaint: ${chiefComplaint}`);
    }
    lines.push(
      `• Sessions Completed: ${activeSessions.length} session(s)${
        finalizedCount > 0 ? ` (${finalizedCount} finalized)` : ''
      }${
        firstSessionDate && latestSessionDate
          ? ` (${formatDateDDMMYYYY(firstSessionDate)} – ${formatDateDDMMYYYY(latestSessionDate)})`
          : ''
      }`
    );
    if (painEntries.length === 2) {
      lines.push(
        `• Pain Score (NPRS/VAS): ${painEntries[0].score}/10 (${painEntries[0].label}) → ${painEntries[1].score}/10 (${painEntries[1].label})`
      );
    } else if (painEntries.length === 1) {
      lines.push(`• Pain Score (NPRS/VAS): ${painEntries[0].score}/10 (${painEntries[0].label})`);
    }
    if (functionalProgressLine) {
      lines.push(`• Functional Progress: ${functionalProgressLine}`);
    }
    if (clinicalImpression) {
      lines.push(`• Clinical Impression: ${clinicalImpression}`);
    }
    lines.push(`• Plan & Recommendation: ${planLine}`);
    lines.push('');
    lines.push('Thank you for your collaboration. Please reach out if further clinical details are needed.');
    lines.push('Sincerely,');
    lines.push(`${resolvedTherapist}`);
    lines.push(`${resolvedClinic}`);
  }

  return {
    subject,
    body: lines.join('\n'),
  };
}

// -----------------------------------------------------------------------
// C7: Patient Retention Action Lists & Post-Discharge Follow-Ups
// -----------------------------------------------------------------------

export interface InactiveActivePlanItem {
  patientId: string;
  patientName: string;
  patientNameEn: string;
  patientPhone: string;
  episodeId: string;
  episodeTitle: string;
  lastActivityDate: string; // YYYY-MM-DD
  daysInactive: number;
  sessionCount: number;
}

export interface PostDischargeFollowUpDueItem {
  patientId: string;
  patientName: string;
  patientNameEn: string;
  patientPhone: string;
  episodeId: string;
  episodeTitle: string;
  dischargeDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  intervalWeeks: FollowUpIntervalWeeks;
  daysSinceDischarge: number;
}

export interface PackageExpiringItem {
  invoiceId: string;
  invoiceNumber: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  episodeId?: string;
  episodeTitle?: string;
  packageTotalSessions: number;
  packageUsedSessions: number;
  remainingSessions: number;
  invoice: FinancialInvoiceIQD;
}

export interface UnpaidBalanceItem {
  invoiceId: string;
  invoiceNumber: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  episodeId?: string;
  episodeTitle?: string;
  date: string;
  netAmountIQD: number;
  paidAmountIQD: number;
  balanceDueIQD: number;
  currencyCode?: string;
  invoice: FinancialInvoiceIQD;
}

export interface RetentionActionListsResult {
  referenceDate: string;
  inactiveDaysThreshold: number;
  inactiveActivePlan: InactiveActivePlanItem[];
  postDischargeFollowUpsDue: PostDischargeFollowUpDueItem[];
  packageExpiring: PackageExpiringItem[];
  unpaidBalances: UnpaidBalanceItem[];
}

const ACTIVE_FUTURE_APPT_STATUSES = new Set([
  'scheduled',
  'confirmed',
  'arrived',
  'in_session',
]);

/**
 * Computes the 4 actionable patient retention lists locally from decrypted records:
 * 1. Inactive active-plan patients (>= N days with no future appointment)
 * 2. Post-discharge 4-week (28d) & 12-week (84d) follow-ups due
 * 3. Rehab packages expiring (<= 2 remaining sessions)
 * 4. Non-void unpaid invoice balances
 */
export function computeRetentionActionLists(params: {
  patients: PatientLike[];
  episodes: EpisodeLike[];
  sessions: SessionLike[];
  invoices: FinancialInvoiceIQD[];
  appointments: ClinicAppointment[];
  followUps: PostDischargeFollowUpRecord[];
  inactiveDaysThreshold?: number;
  referenceDate?: string;
}): RetentionActionListsResult {
  const {
    patients,
    episodes,
    sessions,
    invoices,
    appointments,
    followUps,
    inactiveDaysThreshold = 14,
    referenceDate,
  } = params;

  const refDate = normalizeDateYmd(referenceDate) || localDate();
  const threshold = Math.max(1, Math.round(Number(inactiveDaysThreshold) || 14));

  const patientMap = new Map<string, PatientLike>();
  for (const p of patients) {
    patientMap.set(p.id, p);
  }

  // Index non-cancelled sessions by episodeId
  const sessionsByEpisode = new Map<string, SessionLike[]>();
  for (const s of sessions) {
    if (resolveSessionStatus(s) === 'cancelled') continue;
    const list = sessionsByEpisode.get(s.episodeId) || [];
    list.push(s);
    sessionsByEpisode.set(s.episodeId, list);
  }

  // Index patients with a future scheduled/confirmed/active appointment on or after refDate
  const patientsWithFutureAppt = new Set<string>();
  for (const appt of appointments) {
    const apptDate = normalizeDateYmd(appt.date);
    if (!apptDate || apptDate < refDate) continue;
    if (ACTIVE_FUTURE_APPT_STATUSES.has(String(appt.status))) {
      patientsWithFutureAppt.add(appt.patientId);
    }
  }

  // 1. Inactive Active-Plan Patients
  const activeByPatient = new Map<
    string,
    {
      item: InactiveActivePlanItem;
      lastActivityDate: string;
    }
  >();

  for (const ep of episodes) {
    if (resolveEpisodeStatus(ep) !== 'active') continue;
    const patient = patientMap.get(ep.patientId);
    if (patient && patient.isArchived === 1) continue;

    const epSessions = sessionsByEpisode.get(ep.id) || [];
    let lastActivityDate = resolveEpisodeStartDate(ep);
    for (const s of epSessions) {
      const sDate = resolveSessionDate(s);
      if (sDate && (!lastActivityDate || sDate > lastActivityDate)) {
        lastActivityDate = sDate;
      }
    }
    if (!lastActivityDate) continue;

    const existingForPatient = activeByPatient.get(ep.patientId);
    // Keep the most recently active episode per patient so a recent active episode isn't masked by an older one
    if (existingForPatient && existingForPatient.lastActivityDate >= lastActivityDate) {
      continue;
    }

    const clinical = patient ? resolveClinicalRecord(patient) : null;
    const daysInactive = diffCalendarDays(lastActivityDate, refDate);
    activeByPatient.set(ep.patientId, {
      lastActivityDate,
      item: {
        patientId: ep.patientId,
        patientName: resolvePatientName(patient, clinical, true),
        patientNameEn: resolvePatientName(patient, clinical, false),
        patientPhone: resolvePatientPhone(patient, clinical),
        episodeId: ep.id,
        episodeTitle: resolveEpisodeTitle(ep, true),
        lastActivityDate,
        daysInactive,
        sessionCount: epSessions.length,
      },
    });
  }

  const inactiveActivePlan: InactiveActivePlanItem[] = [];
  for (const [patientId, entry] of activeByPatient.entries()) {
    if (patientsWithFutureAppt.has(patientId)) continue;
    if (entry.item.daysInactive >= threshold) {
      inactiveActivePlan.push(entry.item);
    }
  }
  inactiveActivePlan.sort((a, b) => b.daysInactive - a.daysInactive);

  // 2. Post-Discharge 4-Week & 12-Week Follow-Ups Due
  const postDischargeFollowUpsDue: PostDischargeFollowUpDueItem[] = [];
  for (const ep of episodes) {
    if (resolveEpisodeStatus(ep) !== 'completed') continue;
    const patient = patientMap.get(ep.patientId);
    if (patient && patient.isArchived === 1) continue;

    const epSessions = sessionsByEpisode.get(ep.id) || [];
    let latestSessionDate = '';
    for (const s of epSessions) {
      const sDate = resolveSessionDate(s);
      if (sDate && (!latestSessionDate || sDate > latestSessionDate)) {
        latestSessionDate = sDate;
      }
    }

    const dischargeDate =
      resolveEpisodeEndDate(ep) ||
      latestSessionDate ||
      normalizeDateYmd(ep.updatedAt) ||
      resolveEpisodeStartDate(ep);

    if (!dischargeDate) continue;

    const daysSinceDischarge = diffCalendarDays(dischargeDate, refDate);
    if (daysSinceDischarge < 28) continue;

    const intervalWeeks: FollowUpIntervalWeeks = daysSinceDischarge >= 84 ? 12 : 4;
    const alreadyLogged = followUps.some(
      (f) =>
        f.patientId === ep.patientId &&
        f.intervalWeeks === intervalWeeks &&
        (f.episodeId ? f.episodeId === ep.id : f.dischargeDate === dischargeDate)
    );
    if (alreadyLogged) continue;

    const clinical = patient ? resolveClinicalRecord(patient) : null;
    postDischargeFollowUpsDue.push({
      patientId: ep.patientId,
      patientName: resolvePatientName(patient, clinical, true),
      patientNameEn: resolvePatientName(patient, clinical, false),
      patientPhone: resolvePatientPhone(patient, clinical),
      episodeId: ep.id,
      episodeTitle: resolveEpisodeTitle(ep, true),
      dischargeDate,
      dueDate: addDaysToDateStr(dischargeDate, intervalWeeks * 7),
      intervalWeeks,
      daysSinceDischarge,
    });
  }
  postDischargeFollowUpsDue.sort((a, b) => b.daysSinceDischarge - a.daysSinceDischarge);

  // 3. Package Expiring (<= 2 remaining sessions)
  const packageExpiring: PackageExpiringItem[] = [];
  for (const inv of invoices) {
    if (inv.status === 'void' || inv.invoiceType !== 'rehab_package') continue;
    const total = inv.packageTotalSessions ?? 0;
    if (total <= 0) continue;
    const used = inv.packageUsedSessions ?? 0;
    const remaining = total - used;
    if (remaining <= 2 && remaining >= 0) {
      const patient = patientMap.get(inv.patientId);
      const clinical = patient ? resolveClinicalRecord(patient) : null;
      packageExpiring.push({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        patientId: inv.patientId,
        patientName:
          resolvePatientName(patient, clinical, true, inv.patientName) || inv.patientName,
        patientPhone: resolvePatientPhone(patient, clinical),
        episodeId: inv.episodeId,
        episodeTitle: inv.episodeTitle,
        packageTotalSessions: total,
        packageUsedSessions: used,
        remainingSessions: remaining,
        invoice: inv,
      });
    }
  }
  packageExpiring.sort((a, b) => a.remainingSessions - b.remainingSessions);

  // 4. Unpaid Balances (non-void invoices with balanceDueIQD > 0)
  const unpaidBalances: UnpaidBalanceItem[] = [];
  for (const inv of invoices) {
    if (inv.status === 'void' || !(inv.balanceDueIQD > 0)) continue;
    const patient = patientMap.get(inv.patientId);
    const clinical = patient ? resolveClinicalRecord(patient) : null;
    unpaidBalances.push({
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      patientId: inv.patientId,
      patientName:
        resolvePatientName(patient, clinical, true, inv.patientName) || inv.patientName,
      patientPhone: resolvePatientPhone(patient, clinical),
      episodeId: inv.episodeId,
      episodeTitle: inv.episodeTitle,
      date: inv.date,
      netAmountIQD: inv.netAmountIQD,
      paidAmountIQD: inv.paidAmountIQD,
      balanceDueIQD: inv.balanceDueIQD,
      currencyCode: inv.currencyCode,
      invoice: inv,
    });
  }
  unpaidBalances.sort((a, b) => b.balanceDueIQD - a.balanceDueIQD);

  return {
    referenceDate: refDate,
    inactiveDaysThreshold: threshold,
    inactiveActivePlan,
    postDischargeFollowUpsDue,
    packageExpiring,
    unpaidBalances,
  };
}

// -----------------------------------------------------------------------
// C7: Offline WhatsApp Deep-Link Reminder Templates
// -----------------------------------------------------------------------

export type RetentionBucketKey =
  | 'inactiveActivePlan'
  | 'postDischargeFollowUpsDue'
  | 'packageExpiring'
  | 'unpaidBalances';

export function buildRetentionWhatsAppMessage(params: {
  bucket: RetentionBucketKey;
  patientName: string;
  detailsText?: string;
  clinicName?: string;
  isAr: boolean;
}): string {
  const { bucket, patientName, detailsText = '', clinicName, isAr } = params;
  const name = patientName.trim() || (isAr ? 'مريضنا الكريم' : 'Valued Patient');
  const clinic =
    clinicName?.trim() || (isAr ? 'عيادة العلاج الطبيعي' : 'the Physiotherapy Clinic');
  const detailSuffix = detailsText.trim() ? ` (${detailsText.trim()})` : '';

  switch (bucket) {
    case 'inactiveActivePlan':
      return isAr
        ? `السلام عليكم ${name}، نطمئن عليكم من ${clinic}. لاحظنا عدم حجز جلسة متابعة منذ فترة${detailSuffix}. يسعدنا تنسيق موعدكم القادم لاستكمال الخطة العلاجية بنجاح.`
        : `Hello ${name}, checking in from ${clinic}. We noticed it has been a while since your last physiotherapy session${detailSuffix}. We would be glad to schedule your next visit to continue your recovery plan.`;
    case 'postDischargeFollowUpsDue':
      return isAr
        ? `السلام عليكم ${name}، نرجو أن تكونوا بأتم الصحة والعافية. حان موعد متابعة ما بعد التخريج في ${clinic}${detailSuffix} للاطمئنان على مستوى الألم والتحسن الوظيفي لديكم.`
        : `Hello ${name}, wishing you continued wellness. It is time for your post-discharge follow-up check-in with ${clinic}${detailSuffix} to review your pain and functional progress.`;
    case 'packageExpiring':
      return isAr
        ? `السلام عليكم ${name}، تذكير لطيف من ${clinic} بخصوص باقة جلسات العلاج الطبيعي${detailSuffix}. يمكنكم التواصل معنا لحجز الجلسات المتبقية أو تجديد الكورس.`
        : `Hello ${name}, friendly reminder from ${clinic} regarding your physiotherapy package${detailSuffix}. Please contact us to schedule your remaining sessions or renew your course.`;
    case 'unpaidBalances':
      return isAr
        ? `السلام عليكم ${name}، تذكير مالي لطيف من ${clinic} بخصوص الرصيد المتبقي${detailSuffix}. نشكركم على ثقتكم وتعاونكم.`
        : `Hello ${name}, friendly billing reminder from ${clinic} regarding your outstanding balance${detailSuffix}. Thank you for your cooperation.`;
  }
}

/**
 * Builds an offline `https://wa.me/...` reminder URL for one of the 4 retention buckets,
 * returning `null` when the patient phone cannot be normalized.
 */
export function buildRetentionWhatsAppUrl(params: {
  bucket: RetentionBucketKey;
  patientPhone?: string | null;
  patientName: string;
  detailsText?: string;
  clinicName?: string;
  isAr: boolean;
}): string | null {
  const text = buildRetentionWhatsAppMessage(params);
  return buildWhatsAppReminderUrl(params.patientPhone, text);
}
