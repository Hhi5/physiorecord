import { extractLegacyPainDetail } from '../../../services/soapService';
import {
  CURRENT_SOAP_SCHEMA_VERSION,
  type FlowsheetExerciseEntry,
  type LegacyPainDetail,
  type ManualTherapyFlowsheetEntry,
  type ModalitySafetyOverrideEntry,
  type PhysicalAgentFlowsheetEntry,
  type SessionVitalsEntry,
  type SoapFlowsheetData,
  type SoapNoteData,
  type SoapNoteRecord,
} from '../../../types/clinical';

export type ProgressStatusOption = '' | 'improved' | 'unchanged' | 'regressed' | 'plateau';
export type PatientToleranceOption =
  | ''
  | 'well_tolerated'
  | 'moderate_fatigue'
  | 'poorly_tolerated';

export type CopiedSoapTextField =
  | 'chiefComplaint'
  | 'interventionsSummary'
  | 'clinicalObservations'
  | 'clinicalImpression'
  | 'nextSessionPlan'
  | 'homeInstructions';

export interface UntouchedDraftFormState {
  prePainNrs: number | undefined;
  prePainNotRecorded: boolean;
  postPainNrs: number | undefined;
  postPainNotRecorded: boolean;
  legacyPainDetail?: LegacyPainDetail;
  legacyDraftReviewed: boolean;
  chiefComplaint: string;
  symptomChanges: string;
  interventionsSummary: string;
  legacyCompiledSummary: string | undefined;
  clinicalObservations: string;
  clinicalImpression: string;
  progressStatus: ProgressStatusOption;
  patientTolerance: PatientToleranceOption;
  nextSessionPlan: string;
  homeInstructions: string;
  exercises: FlowsheetExerciseEntry[];
  manualTherapy: ManualTherapyFlowsheetEntry[];
  physicalAgents: PhysicalAgentFlowsheetEntry[];
  vitals?: SessionVitalsEntry;
  modalitySafetyOverrides: ModalitySafetyOverrideEntry[];
}

/**
 * Initial untouched state for a new session draft:
 * - Pain starts undefined ("not recorded"), never 5 or 3.
 * - progressStatus and patientTolerance start unselected ('').
 * - All text fields start empty ('').
 */
export function createUntouchedDraftFormState(): UntouchedDraftFormState {
  return {
    prePainNrs: undefined,
    prePainNotRecorded: false,
    postPainNrs: undefined,
    postPainNotRecorded: false,
    legacyPainDetail: undefined,
    legacyDraftReviewed: false,
    chiefComplaint: '',
    symptomChanges: '',
    interventionsSummary: '',
    legacyCompiledSummary: undefined,
    clinicalObservations: '',
    clinicalImpression: '',
    progressStatus: '',
    patientTolerance: '',
    nextSessionPlan: '',
    homeInstructions: '',
    exercises: [],
    manualTherapy: [],
    physicalAgents: [],
    vitals: undefined,
    modalitySafetyOverrides: [],
  };
}

/**
 * Pure render/export helper: derives human-readable summary string from structured flowsheet items.
 * NEVER includes therapist free-text `interventionsSummary` and is NEVER stored in `dailyInterventionsSummary`.
 */
export function compileFlowsheetSummaryText(
  flowsheet: SoapFlowsheetData | undefined,
  isAr: boolean
): string {
  if (!flowsheet) return '';
  const exLines = (flowsheet.exercises || []).map(
    (e) =>
      `${isAr ? e.nameAr || e.nameEn : e.nameEn || e.nameAr} (${e.sets}×${e.reps}${
        e.holdSeconds ? ` × ${e.holdSeconds}s` : ''
      } @ ${e.loadOrBand})`
  );
  const mtLines = (flowsheet.manualTherapy || []).map(
    (m) =>
      `${isAr ? m.techniqueAr || m.techniqueEn : m.techniqueEn || m.techniqueAr} [${
        m.targetJointOrTissue ? `${m.targetJointOrTissue}, ` : ''
      }${m.gradeOrIntensity}, ${m.durationMinutes}m]`
  );
  const paLines = (flowsheet.physicalAgents || []).map(
    (p) =>
      `${isAr ? p.modalityAr || p.modality : p.modality} (${
        p.site ? `${p.site}, ` : ''
      }${p.parameters}, ${p.durationMinutes}m)`
  );
  return [...exLines, ...mtLines, ...paLines].filter(Boolean).join(' • ');
}

/**
 * Legacy compile format (pre-1A-i.5) used to detect if a stored `dailyInterventionsSummary`
 * was auto-compiled from the flowsheet so we can keep it read-only and prevent duplication on reload.
 */
function compileLegacyPrePatchSummary(
  flowsheet: SoapFlowsheetData | undefined,
  isAr: boolean
): string {
  if (!flowsheet) return '';
  const exLines = (flowsheet.exercises || []).map(
    (e) =>
      `${isAr ? e.nameAr : e.nameEn} (${e.sets}×${e.reps}${
        e.holdSeconds ? ` × ${e.holdSeconds}s` : ''
      } @ ${e.loadOrBand})`
  );
  const mtLines = (flowsheet.manualTherapy || []).map(
    (m) => `${isAr ? m.techniqueAr : m.techniqueEn} [${m.gradeOrIntensity}, ${m.durationMinutes}m]`
  );
  const paLines = (flowsheet.physicalAgents || []).map(
    (p) => `${p.modality} (${p.parameters}, ${p.durationMinutes}m)`
  );
  return [...exLines, ...mtLines, ...paLines].filter(Boolean).join(' • ');
}

/**
 * Inspects a stored `dailyInterventionsSummary` from an existing note:
 * - If it equals a compiled flowsheet string (current or pre-patch, AR or EN), treats it as a
 *   read-only legacy compiled summary and returns `freeText: ''` so saving never duplicates it.
 * - Otherwise returns it as the therapist's own `freeText`.
 */
export function resolveStoredInterventionsSummary(
  storedSummary: string | undefined,
  existingLegacyCompiled: string | undefined,
  flowsheet: SoapFlowsheetData | undefined
): { freeText: string; legacyCompiledSummary: string | undefined } {
  if (existingLegacyCompiled) {
    return {
      freeText: storedSummary || '',
      legacyCompiledSummary: existingLegacyCompiled,
    };
  }
  const trimmed = (storedSummary || '').trim();
  if (!trimmed) {
    return { freeText: '', legacyCompiledSummary: undefined };
  }

  const candidates = [
    compileFlowsheetSummaryText(flowsheet, true),
    compileFlowsheetSummaryText(flowsheet, false),
    compileLegacyPrePatchSummary(flowsheet, true),
    compileLegacyPrePatchSummary(flowsheet, false),
  ].filter(Boolean);

  for (const compiled of candidates) {
    if (trimmed === compiled) {
      return { freeText: '', legacyCompiledSummary: trimmed };
    }
    if (trimmed.startsWith(`${compiled} • `)) {
      const remainder = trimmed.slice(`${compiled} • `.length).trim();
      return { freeText: remainder, legacyCompiledSummary: compiled };
    }
  }

  return { freeText: storedSummary || '', legacyCompiledSummary: undefined };
}

/**
 * Builds the `SoapNoteData` payload from current form state without fabricating any default values.
 * `dailyInterventionsSummary` stores ONLY the therapist's free text (`state.interventionsSummary`).
 */
export function buildSoapPayloadFromFormState(
  state: UntouchedDraftFormState,
  existingSoap?: SoapNoteRecord | null
): SoapNoteData {
  const flowsheetPayload: SoapFlowsheetData = {
    exercises: state.exercises,
    manualTherapy: state.manualTherapy,
    physicalAgents: state.physicalAgents,
  };

  const preservedLegacyDetail =
    state.legacyPainDetail ?? extractLegacyPainDetail(existingSoap?.data.subjective);

  const subjective: SoapNoteData['subjective'] = {
    ...(existingSoap?.data.subjective || {}),
    chiefComplaint: state.chiefComplaint,
    symptomChangesSinceLastSession: state.symptomChanges,
    painNrsScore: state.prePainNotRecorded ? undefined : state.prePainNrs,
    painNotRecorded: state.prePainNotRecorded || undefined,
    postSessionPainNrs: state.postPainNotRecorded ? undefined : state.postPainNrs,
    postPainNotRecorded: state.postPainNotRecorded || undefined,
  };
  if (preservedLegacyDetail) {
    subjective.legacyPainDetail = preservedLegacyDetail;
  } else {
    delete subjective.legacyPainDetail;
  }
  delete subjective.painVasCurrent;
  delete subjective.painAssessment;
  delete subjective.painVasBestLast24h;
  delete subjective.painVasWorstLast24h;

  const objective: SoapNoteData['objective'] = {
    ...(existingSoap?.data.objective || {}),
    flowsheet: flowsheetPayload,
    dailyInterventionsSummary: state.interventionsSummary,
    clinicalObservations: state.clinicalObservations,
    vitals: state.vitals,
    modalitySafetyOverrides:
      state.modalitySafetyOverrides.length > 0 ? state.modalitySafetyOverrides : undefined,
  };
  if (state.legacyCompiledSummary) {
    objective.legacyCompiledSummary = state.legacyCompiledSummary;
  }

  const assessment: SoapNoteData['assessment'] = {
    ...(existingSoap?.data.assessment || {}),
    clinicalImpressionCurrent: state.clinicalImpression,
    progressStatus: state.progressStatus ? state.progressStatus : undefined,
    patientTolerance: state.patientTolerance ? state.patientTolerance : undefined,
  };

  const plan: SoapNoteData['plan'] = {
    ...(existingSoap?.data.plan || {}),
    nextSessionPlan: state.nextSessionPlan,
    homeInstructions: state.homeInstructions,
  };

  const isLegacyUnreviewedDraft = Boolean(
    existingSoap &&
      !existingSoap.data.isFinalized &&
      !existingSoap.data.legacyReviewedAt &&
      (existingSoap.data.legacyUnreviewed ||
        (existingSoap.data.soapSchemaVersion ?? 1) < CURRENT_SOAP_SCHEMA_VERSION)
  );

  return {
    soapSchemaVersion: CURRENT_SOAP_SCHEMA_VERSION,
    subjective,
    objective,
    assessment,
    plan,
    isFinalized: false,
    ...(isLegacyUnreviewedDraft ? { legacyUnreviewed: true } : {}),
  };
}

/**
 * Validates all mandatory clinical fields before allowing Sign & Lock.
 * Also requires an explicit `state.legacyDraftReviewed === true` confirmation when signing
 * a draft note with `legacyUnreviewed === true` (`requiresLegacyReview === true`).
 */
export function validateSignAndLockState(
  state: UntouchedDraftFormState,
  requiresLegacyReview = false
): {
  valid: boolean;
  missingAr: string[];
  missingEn: string[];
} {
  const missingAr: string[] = [];
  const missingEn: string[] = [];

  if (requiresLegacyReview && !state.legacyDraftReviewed) {
    missingAr.push('تأكيد مراجعة محتوى المسودة القديمة المنشأة بإصدار سابق (I reviewed this)');
    missingEn.push('Explicit confirmation that this legacy draft was reviewed ("I reviewed this")');
  }

  const hasPrePain = state.prePainNrs !== undefined || state.prePainNotRecorded;
  if (!hasPrePain) {
    missingAr.push('شدة الألم قبل الجلسة (أو تحديد "لم يُسجّل")');
    missingEn.push('Pre-session pain score (or mark "Not recorded")');
  }

  const hasPostPain = state.postPainNrs !== undefined || state.postPainNotRecorded;
  if (!hasPostPain) {
    missingAr.push('شدة الألم بعد الجلسة (أو تحديد "لم يُسجّل")');
    missingEn.push('Post-session pain score (or mark "Not recorded")');
  }

  const hasFlowsheetEntry =
    state.exercises.length > 0 ||
    state.manualTherapy.length > 0 ||
    state.physicalAgents.length > 0;
  const hasFreeTextIntervention =
    state.interventionsSummary.trim().length > 0 ||
    state.clinicalObservations.trim().length > 0;

  if (!hasFlowsheetEntry && !hasFreeTextIntervention) {
    missingAr.push('توثيق تدخل علاجي واحد على الأقل (جدول التمارين/الأجهزة أو ملخص التدخلات الحر)');
    missingEn.push('At least one documented intervention (flowsheet entry or free-text summary)');
  }

  if (!state.clinicalImpression.trim()) {
    missingAr.push('الانطباع والتفسير السريري للجلسة (Clinical Impression)');
    missingEn.push('Clinical Impression (Assessment)');
  }

  if (!state.progressStatus) {
    missingAr.push('مسار تقدم الحالة (Progress Status)');
    missingEn.push('Progress Status');
  }

  return {
    valid: missingAr.length === 0,
    missingAr,
    missingEn,
  };
}
