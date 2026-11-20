// =======================================================================
// PhysioRecord — Treatment Journey & Therapist Caseload Analytics (Pure)
// Decoupled pure computation for Discharge Summary & Clinic Oversight
// =======================================================================

import type {
  EpisodeRecord,
  PatientRecord,
  SessionRecord,
  SoapNoteRecord,
} from '../types/clinical';
import type {
  ClinicStaffMember,
  EpisodeScopedClinicalStore,
} from '../types/clinicManagement';

export type DischargeReasonCode =
  | 'goals_met'
  | 'plateau'
  | 'medical_referral'
  | 'self_discharge';

export interface OutcomeProgressItem {
  scaleName: string;
  firstScore: number;
  latestScore: number;
  delta: number;
  unit?: string;
}

export interface RomHighlightItem {
  label: string;
  firstDegrees?: number;
  latestDegrees: number;
  deltaDegrees?: number;
}

export interface MmtHighlightItem {
  label: string;
  latestGrade: string;
}

export interface ClinicalJourneySummary {
  episodeId: string;
  episodeTitle: string;
  diagnosis: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  totalSessions: number;
  finalizedSessions: number;
  attendedSessions: number;
  painFirst: number | null;
  painLatest: number | null;
  painDelta: number | null; // positive = pain reduction (improvement)
  painImprovementPercent: number | null;
  outcomeScales: OutcomeProgressItem[];
  romHighlights: RomHighlightItem[];
  mmtHighlights: MmtHighlightItem[];
  positiveTestsFirst: number | null;
  positiveTestsLatest: number | null;
  goalsAchievedCount: number;
  totalGoalsCount: number;
  improvementBadge: 'significant' | 'moderate' | 'stable' | 'insufficient_data';
  suggestedSummaryAr: string;
  suggestedSummaryEn: string;
}

export interface PatientCompletionMeta {
  patientId: string;
  isCompleted: boolean; // Has >= 1 completed episode AND no currently active episode
  hasActiveEpisode: boolean;
  completedEpisodesCount: number;
  totalEpisodesCount: number;
  latestCompletedEpisode?: EpisodeRecord;
  latestActiveEpisode?: EpisodeRecord;
  dischargeDate?: string;
  dischargeReason?: DischargeReasonCode;
  dischargeSummary?: string;
  assignedStaffId?: string;
  assignedTherapistName?: string;
}

export interface TherapistCaseloadRow {
  staffId: string;
  nameAr: string;
  nameEn: string;
  role: string;
  activePatients: number;
  completedPatients: number;
  archivedPatients: number;
  totalPatients: number;
  totalEpisodes: number;
}

export interface TherapistCaseloadOverview {
  rows: TherapistCaseloadRow[];
  unassignedActive: number;
  unassignedCompleted: number;
  totalActive: number;
  totalCompleted: number;
}

function parseDateSafe(isoOrDate?: string): number | null {
  if (!isoOrDate) return null;
  const ts = Date.parse(isoOrDate);
  return Number.isFinite(ts) ? ts : null;
}

function extractSoapPainScore(soap?: SoapNoteRecord): number | null {
  if (!soap?.data?.subjective) return null;
  const s = soap.data.subjective;
  if (typeof s.painNrsScore === 'number' && Number.isFinite(s.painNrsScore)) {
    return s.painNrsScore;
  }
  if (typeof s.postSessionPainNrs === 'number' && Number.isFinite(s.postSessionPainNrs)) {
    return s.postSessionPainNrs;
  }
  if (typeof s.painVasCurrent === 'number' && Number.isFinite(s.painVasCurrent)) {
    return s.painVasCurrent;
  }
  return null;
}

function extractSoapPostPainScore(soap?: SoapNoteRecord): number | null {
  if (!soap?.data?.subjective) return null;
  const s = soap.data.subjective;
  if (typeof s.postSessionPainNrs === 'number' && Number.isFinite(s.postSessionPainNrs)) {
    return s.postSessionPainNrs;
  }
  return extractSoapPainScore(soap);
}

/**
 * Pure clinical journey & improvement summary builder for episode discharge / review.
 */
export function buildClinicalJourneySummary(params: {
  episode: EpisodeRecord;
  sessions: SessionRecord[];
  soaps: SoapNoteRecord[];
  episodeStore?: EpisodeScopedClinicalStore | null;
  dischargeDateOverride?: string;
}): ClinicalJourneySummary {
  const { episode, sessions, soaps, episodeStore, dischargeDateOverride } = params;

  // Sort sessions chronologically (oldest -> newest)
  const orderedSessions = [...sessions].sort((a, b) => {
    const da = parseDateSafe(a.sessionDate || a.createdAt) ?? 0;
    const db = parseDateSafe(b.sessionDate || b.createdAt) ?? 0;
    if (da !== db) return da - db;
    return (a.sessionNumber || 0) - (b.sessionNumber || 0);
  });

  const soapBySessionId = new Map<string, SoapNoteRecord>();
  for (const soap of soaps) {
    soapBySessionId.set(soap.sessionId, soap);
  }

  const startDate =
    episode.startDate ||
    orderedSessions[0]?.sessionDate ||
    episode.createdAt.slice(0, 10);

  const lastSessionDate =
    orderedSessions.length > 0
      ? orderedSessions[orderedSessions.length - 1].sessionDate
      : undefined;

  const endDate =
    dischargeDateOverride ||
    episode.endDate ||
    lastSessionDate ||
    new Date().toISOString().slice(0, 10);

  const startMs = parseDateSafe(startDate);
  const endMs = parseDateSafe(endDate);
  const durationDays =
    startMs !== null && endMs !== null && endMs >= startMs
      ? Math.max(1, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)))
      : 1;

  const totalSessions = orderedSessions.length;
  const finalizedSessions = orderedSessions.filter((s) => s.status === 'finalized').length;
  const attendedSessions = orderedSessions.filter(
    (s) => !s.attendanceStatus || s.attendanceStatus === 'attended'
  ).length;

  // 1. Pain NPRS trajectory (Initial Eval / First Session -> Latest Session / Snapshot)
  const painPoints: number[] = [];
  if (episodeStore) {
    const baselineNrs =
      typeof episodeStore.painOnActivityNrs === 'number' && episodeStore.painOnActivityNrs > 0
        ? episodeStore.painOnActivityNrs
        : typeof episodeStore.painWorst24hNrs === 'number' && episodeStore.painWorst24hNrs > 0
          ? episodeStore.painWorst24hNrs
          : typeof episodeStore.painAtRestNrs === 'number' && episodeStore.painAtRestNrs > 0
            ? episodeStore.painAtRestNrs
            : null;
    if (baselineNrs !== null) {
      painPoints.push(baselineNrs);
    }
  }

  for (let i = 0; i < orderedSessions.length; i++) {
    const s = orderedSessions[i];
    const soap = soapBySessionId.get(s.id);
    const score =
      i === orderedSessions.length - 1
        ? extractSoapPostPainScore(soap)
        : extractSoapPainScore(soap);
    if (score !== null) {
      painPoints.push(score);
    }
  }

  // Fallback to snapshots if no session SOAP pain scores recorded
  if (painPoints.length < 2 && episodeStore?.snapshots && episodeStore.snapshots.length > 0) {
    const orderedSnapshots = [...episodeStore.snapshots].sort(
      (a, b) => (parseDateSafe(a.recordedDate) ?? 0) - (parseDateSafe(b.recordedDate) ?? 0)
    );
    for (const snap of orderedSnapshots) {
      const snapPain =
        typeof snap.painNrsActivity === 'number' && Number.isFinite(snap.painNrsActivity)
          ? snap.painNrsActivity
          : typeof snap.painNrsRest === 'number' && Number.isFinite(snap.painNrsRest)
            ? snap.painNrsRest
            : null;
      if (snapPain !== null) {
        painPoints.push(snapPain);
      }
    }
  }

  const painFirst = painPoints.length > 0 ? painPoints[0] : null;
  const painLatest = painPoints.length > 0 ? painPoints[painPoints.length - 1] : null;
  const painDelta =
    painFirst !== null && painLatest !== null ? Number((painFirst - painLatest).toFixed(1)) : null;
  const painImprovementPercent =
    painFirst !== null && painFirst > 0 && painDelta !== null
      ? Math.round((painDelta / painFirst) * 100)
      : null;

  // 2. Outcome scales progress from episodeStore.snapshots or outcomeGoals
  const outcomeScales: OutcomeProgressItem[] = [];
  if (episodeStore?.snapshots && episodeStore.snapshots.length >= 2) {
    const orderedSnapshots = [...episodeStore.snapshots].sort(
      (a, b) => (parseDateSafe(a.recordedDate) ?? 0) - (parseDateSafe(b.recordedDate) ?? 0)
    );
    const firstSnap = orderedSnapshots[0];
    const lastSnap = orderedSnapshots[orderedSnapshots.length - 1];
    if (
      typeof firstSnap.outcomeScale?.scorePercentage === 'number' &&
      typeof lastSnap.outcomeScale?.scorePercentage === 'number'
    ) {
      outcomeScales.push({
        scaleName:
          lastSnap.outcomeScale.scaleNameAr ||
          lastSnap.outcomeScale.scaleNameEn ||
          firstSnap.outcomeScale.scaleNameAr ||
          episodeStore.functionalScales?.scaleNameAr ||
          'Functional Outcome',
        firstScore: firstSnap.outcomeScale.scorePercentage,
        latestScore: lastSnap.outcomeScale.scorePercentage,
        delta: Number(
          (lastSnap.outcomeScale.scorePercentage - firstSnap.outcomeScale.scorePercentage).toFixed(1)
        ),
        unit: '%',
      });
    }
  } else if (episodeStore?.outcomeGoals && episodeStore.outcomeGoals.length > 0) {
    for (const g of episodeStore.outcomeGoals) {
      if (typeof g.baselineScore === 'number' && typeof g.currentScore === 'number') {
        outcomeScales.push({
          scaleName: g.title || g.linkedInstrumentId.toUpperCase(),
          firstScore: g.baselineScore,
          latestScore: g.currentScore,
          delta: Number((g.currentScore - g.baselineScore).toFixed(1)),
        });
      }
    }
  }

  // 3. ROM & MMT highlights from latest SOAP or episodeStore.objective
  const romHighlights: RomHighlightItem[] = [];
  const mmtHighlights: MmtHighlightItem[] = [];

  const firstRomMap = new Map<string, number>();
  const latestRomMap = new Map<string, { label: string; degrees: number }>();

  const collectRom = (
    entries: Array<{
      canonicalKey?: string | null;
      label?: string;
      jointNameAr?: string;
      movementNameAr?: string;
      jointNameEn?: string;
      movementNameEn?: string;
      isTested?: boolean;
      measuredAngleDegrees?: number | null;
    }>,
    isFirst: boolean
  ) => {
    for (const e of entries) {
      if (e.isTested === false || typeof e.measuredAngleDegrees !== 'number') continue;
      const key =
        e.canonicalKey ||
        `${e.jointNameEn || e.jointNameAr || 'joint'}_${e.movementNameEn || e.movementNameAr || 'move'}`;
      const label =
        e.label ||
        [e.jointNameAr || e.jointNameEn, e.movementNameAr || e.movementNameEn]
          .filter(Boolean)
          .join(' — ');
      if (isFirst && !firstRomMap.has(key)) {
        firstRomMap.set(key, e.measuredAngleDegrees);
      }
      latestRomMap.set(key, { label: label || key, degrees: e.measuredAngleDegrees });
    }
  };

  if (episodeStore?.objective?.romBattery?.entries?.length) {
    collectRom(episodeStore.objective.romBattery.entries, true);
  }
  for (let i = 0; i < orderedSessions.length; i++) {
    const soap = soapBySessionId.get(orderedSessions[i].id);
    const entries = soap?.data?.objective?.romBattery?.entries;
    if (entries?.length) {
      collectRom(entries, firstRomMap.size === 0);
    }
  }

  for (const [key, latest] of latestRomMap.entries()) {
    const first = firstRomMap.get(key);
    romHighlights.push({
      label: latest.label,
      firstDegrees: first,
      latestDegrees: latest.degrees,
      deltaDegrees: first !== undefined ? latest.degrees - first : undefined,
    });
  }

  // Latest MMT highlights
  const latestMmtEntries =
    [...orderedSessions]
      .reverse()
      .map((s) => soapBySessionId.get(s.id)?.data?.objective?.mmtBattery?.entries)
      .find((arr) => arr && arr.length > 0) ||
    episodeStore?.objective?.mmtBattery?.entries ||
    [];

  for (const m of latestMmtEntries.slice(0, 6)) {
    if (m.isTested !== false && m.gradeValue) {
      const label =
        m.label ||
        [m.muscleNameAr || m.muscleNameEn, m.actionNameAr || m.actionNameEn]
          .filter(Boolean)
          .join(' — ');
      mmtHighlights.push({
        label: label || 'MMT',
        latestGrade: `${m.gradeValue}/5`,
      });
    }
  }

  // 4. Positive special tests count (first snapshot -> latest snapshot/store)
  let positiveTestsFirst: number | null = null;
  let positiveTestsLatest: number | null = null;
  if (episodeStore?.snapshots && episodeStore.snapshots.length > 0) {
    const orderedSnapshots = [...episodeStore.snapshots].sort(
      (a, b) => (parseDateSafe(a.recordedDate) ?? 0) - (parseDateSafe(b.recordedDate) ?? 0)
    );
    positiveTestsFirst = orderedSnapshots[0].specialTestsPositiveCount ?? null;
    positiveTestsLatest =
      orderedSnapshots[orderedSnapshots.length - 1].specialTestsPositiveCount ?? null;
  } else if (episodeStore?.specialTests && episodeStore.specialTests.length > 0) {
    positiveTestsLatest = episodeStore.specialTests.filter((t) => t.outcome === 'positive').length;
  }

  // 5. Rehab goals achieved
  const structuredGoals =
    episode.data.structuredGoals || episodeStore?.smartGoals || [];
  const totalGoalsCount = structuredGoals.length;
  const goalsAchievedCount = structuredGoals.filter((g) => g.status === 'achieved').length;

  // 6. Improvement badge classification
  let improvementBadge: ClinicalJourneySummary['improvementBadge'] = 'insufficient_data';
  if (painDelta !== null) {
    if (painDelta >= 3 || (painImprovementPercent !== null && painImprovementPercent >= 50)) {
      improvementBadge = 'significant';
    } else if (painDelta >= 1 || (painImprovementPercent !== null && painImprovementPercent >= 20)) {
      improvementBadge = 'moderate';
    } else {
      improvementBadge = 'stable';
    }
  } else if (goalsAchievedCount > 0 || totalSessions >= 2) {
    improvementBadge = 'moderate';
  }

  // 7. Auto-drafted bilingual clinical discharge summaries
  const painSentenceAr =
    painFirst !== null && painLatest !== null
      ? painDelta !== null && painDelta > 0
        ? `انخفضت شدة الألم (NPRS) من ${painFirst}/10 إلى ${painLatest}/10 (تحسّن بنسبة ${painImprovementPercent ?? 0}%).`
        : `مستوى الألم (NPRS) عند البدء ${painFirst}/10 وعند التخريج ${painLatest}/10.`
      : '';
  const goalsSentenceAr =
    totalGoalsCount > 0
      ? `تحقق ${goalsAchievedCount} من أصل ${totalGoalsCount} من الأهداف التأهيلية.`
      : '';

  const formatArDays = (d: number): string => {
    if (d === 1) return 'يوم واحد';
    if (d === 2) return 'يومين';
    if (d >= 3 && d <= 10) return `${d} أيام`;
    return `${d} يوماً`;
  };
  const formatArSessions = (n: number): string => {
    if (n === 1) return 'جلسة واحدة';
    if (n === 2) return 'جلستين';
    if (n >= 3 && n <= 10) return `${n} جلسات`;
    return `${n} جلسة`;
  };

  const suggestedSummaryAr = [
    `أتمّ المريض خطة العلاج الطبيعي لحلقة "${episode.data.title}" (${episode.data.medicalDiagnosis || 'علاج طبيعي'}) بعد ${formatArSessions(totalSessions)} على مدى ${formatArDays(durationDays)} (${startDate.replace(/-/g, '/')} إلى ${endDate.replace(/-/g, '/')}).`,
    painSentenceAr,
    goalsSentenceAr,
    'تم تزويد المريض ببرنامج تمارين منزلية وإرشادات وقائية للحفاظ على النتائج العلاجية.',
  ]
    .filter(Boolean)
    .join(' ');

  const painSentenceEn =
    painFirst !== null && painLatest !== null
      ? painDelta !== null && painDelta > 0
        ? `Pain (NPRS) reduced from ${painFirst}/10 to ${painLatest}/10 (${painImprovementPercent ?? 0}% improvement).`
        : `Pain (NPRS) changed from ${painFirst}/10 at intake to ${painLatest}/10 at discharge.`
      : '';
  const goalsSentenceEn =
    totalGoalsCount > 0
      ? `${goalsAchievedCount} of ${totalGoalsCount} rehabilitation goals achieved.`
      : '';

  const suggestedSummaryEn = [
    `Patient completed physiotherapy care for "${episode.data.title}" (${episode.data.medicalDiagnosis || 'Physiotherapy'}) across ${totalSessions} session(s) over ${durationDays} day(s) (${startDate} to ${endDate}).`,
    painSentenceEn,
    goalsSentenceEn,
    'Home maintenance exercises and ergonomic precautions were reviewed for discharge.',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    episodeId: episode.id,
    episodeTitle: episode.data.title,
    diagnosis: episode.data.medicalDiagnosis || '',
    startDate,
    endDate,
    durationDays,
    totalSessions,
    finalizedSessions,
    attendedSessions,
    painFirst,
    painLatest,
    painDelta,
    painImprovementPercent,
    outcomeScales,
    romHighlights: romHighlights.slice(0, 6),
    mmtHighlights,
    positiveTestsFirst,
    positiveTestsLatest,
    goalsAchievedCount,
    totalGoalsCount,
    improvementBadge,
    suggestedSummaryAr,
    suggestedSummaryEn,
  };
}

/**
 * Determines completion & assignment metadata for a single patient from their episodes.
 */
export function getPatientCompletionMeta(
  patient: PatientRecord,
  patientEpisodes: EpisodeRecord[]
): PatientCompletionMeta {
  const nonArchivedEpisodes = patientEpisodes.filter((e) => e.status !== 'archived');
  const activeEpisodes = nonArchivedEpisodes.filter(
    (e) => e.status === 'active' || e.status === 'on_hold'
  );
  const completedEpisodes = nonArchivedEpisodes.filter((e) => e.status === 'completed');

  const latestActiveEpisode = activeEpisodes[0];
  const latestCompletedEpisode = [...completedEpisodes].sort((a, b) => {
    const da = parseDateSafe(a.endDate || a.updatedAt) ?? 0;
    const db = parseDateSafe(b.endDate || b.updatedAt) ?? 0;
    return db - da;
  })[0];

  const isCompleted = completedEpisodes.length > 0 && activeEpisodes.length === 0;
  const assignedStaffId =
    patient.data.assignedStaffId ||
    latestActiveEpisode?.data.assignedStaffId ||
    latestCompletedEpisode?.data.assignedStaffId;
  const assignedTherapistName =
    patient.data.assignedTherapistName ||
    latestActiveEpisode?.data.assignedTherapistName ||
    latestCompletedEpisode?.data.assignedTherapistName;

  return {
    patientId: patient.id,
    isCompleted,
    hasActiveEpisode: activeEpisodes.length > 0,
    completedEpisodesCount: completedEpisodes.length,
    totalEpisodesCount: nonArchivedEpisodes.length,
    latestCompletedEpisode,
    latestActiveEpisode,
    dischargeDate: latestCompletedEpisode?.endDate || latestCompletedEpisode?.data.endDate,
    dischargeReason: latestCompletedEpisode?.data.dischargeReason,
    dischargeSummary: latestCompletedEpisode?.data.dischargeSummary,
    assignedStaffId,
    assignedTherapistName,
  };
}

/**
 * Computes clinic-wide therapist caseload summary for Clinic Admin/Manager oversight.
 */
export function computeTherapistCaseloadSummary(params: {
  patients: PatientRecord[];
  episodes: EpisodeRecord[];
  staffRoster: ClinicStaffMember[];
}): TherapistCaseloadOverview {
  const { patients, episodes, staffRoster } = params;

  const episodesByPatient = new Map<string, EpisodeRecord[]>();
  for (const ep of episodes) {
    const arr = episodesByPatient.get(ep.patientId) || [];
    arr.push(ep);
    episodesByPatient.set(ep.patientId, arr);
  }

  const rowMap = new Map<string, TherapistCaseloadRow>();
  for (const member of staffRoster) {
    rowMap.set(member.id, {
      staffId: member.id,
      nameAr: member.nameAr,
      nameEn: member.nameEn,
      role: member.role,
      activePatients: 0,
      completedPatients: 0,
      archivedPatients: 0,
      totalPatients: 0,
      totalEpisodes: 0,
    });
  }

  let unassignedActive = 0;
  let unassignedCompleted = 0;
  let totalActive = 0;
  let totalCompleted = 0;

  for (const patient of patients) {
    const pEps = episodesByPatient.get(patient.id) || [];
    const meta = getPatientCompletionMeta(patient, pEps);
    const isArchived = patient.isArchived === 1;

    if (!isArchived) {
      if (meta.isCompleted) totalCompleted++;
      else totalActive++;
    }

    const staffId = meta.assignedStaffId;
    if (staffId) {
      let row = rowMap.get(staffId);
      if (!row) {
        row = {
          staffId,
          nameAr: meta.assignedTherapistName || staffId,
          nameEn: meta.assignedTherapistName || staffId,
          role: 'therapist',
          activePatients: 0,
          completedPatients: 0,
          archivedPatients: 0,
          totalPatients: 0,
          totalEpisodes: 0,
        };
        rowMap.set(staffId, row);
      }
      row.totalPatients++;
      row.totalEpisodes += pEps.length;
      if (isArchived) {
        row.archivedPatients++;
      } else if (meta.isCompleted) {
        row.completedPatients++;
      } else {
        row.activePatients++;
      }
    } else if (!isArchived) {
      if (meta.isCompleted) unassignedCompleted++;
      else unassignedActive++;
    }
  }

  const rows = Array.from(rowMap.values()).sort(
    (a, b) => b.activePatients + b.completedPatients - (a.activePatients + a.completedPatients)
  );

  return {
    rows,
    unassignedActive,
    unassignedCompleted,
    totalActive,
    totalCompleted,
  };
}
