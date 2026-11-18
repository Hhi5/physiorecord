// =======================================================================
// PhysioRecord — Structured Treatment Session & SOAP Documentation (v2.1)
// Single Source of Truth in Encrypted `db.soapNotes`:
// - No fabricated default clinical documentation
// - Real inputs for all SOAP fields (Subjective, Objective, Flowsheet, Assessment, Plan)
// - Derived-only flowsheet summary (never stored into dailyInterventionsSummary)
// - Debounced draft autosave with concurrency checks & unsaved-changes guard
// - Sign & Lock validation + irreversible confirmation dialog
// - Note on Signer ("Recorded by"): Self-declared active staff label from local app state,
//   NOT a cryptographically authenticated user identity.
// =======================================================================

import React, { useState, useEffect, useRef, useCallback, useMemo, Suspense, lazy } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useVault } from '../../context/VaultContext';
import { usePatients } from '../../context/PatientContext';
import {
  SoapService,
  MAX_ADDENDUM_TEXT_LENGTH,
  extractLegacyPainDetail,
} from '../../services/soapService';
import {
  SessionService,
  verifySessionSeal,
  verifySoapSeal,
} from '../../services/sessionService';
import { DraftRecoveryService } from '../../services/draftRecoveryService';
import {
  ClinicOperationsService,
  DEFAULT_QUICK_SOAP_CHIPS,
  PT_EXERCISE_CATALOG,
  ROLE_PERMISSIONS,
} from '../../services/clinicOperationsService';
import { ModalDialog } from '../ui/Dialog';
import { FinishSessionFlowModal } from './FinishSessionFlowModal';
import type { FinishUndoSnapshot, QuickSoapChip, QuickSoapChipCategory } from '../../types/clinicManagement';
import {
  ADDENDUM_REASONS,
  CURRENT_SOAP_SCHEMA_VERSION,
  type SealVerificationStatus,
  type SessionRecord,
  type SoapNoteRecord,
  type SoapNoteData,
  type SoapFlowsheetData,
  type LegacyPainDetail,
  type ClinicalAddendumRecord,
  type AddendumReason,
  type FlowsheetExerciseEntry,
  type ManualTherapyFlowsheetEntry,
  type PhysicalAgentFlowsheetEntry,
  type SessionVitalsEntry,
  type ModalitySafetyOverrideEntry,
} from '../../types/clinical';
import { formatClinicalDate, formatDateDDMMYYYY, localDate } from '../../utils/date';
import { evaluateNoteCompleteness, type NoteCompletenessReport } from '../../utils/reEvalNudge';
import { checkModalitySafety, type ModalitySafetyRule } from '../../utils/modalitySafetyChecker';
import {
  formatElapsedMmSs as formatTimerMmSs,
  resolveInitialSessionTimerState,
} from '../../utils/sessionTimerState';

const VitalsPanel = lazy(() =>
  import('./VitalsPanel').then((m) => ({ default: m.VitalsPanel }))
);
import { Fraction, AutoResizeTextarea, ClinicalAbbr, NprsControl } from '../ui/Primitives';
import {
  ArrowLeft,
  ArrowRight,
  Save,
  Layers,
  Copy,
  Plus,
  Trash2,
  Lock,
  Dumbbell,
  Zap,
  Hand,
  FilePlus2,
  ShieldCheck,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  Sparkles,
  Timer,
  Play,
  Pause,
  RotateCcw,
  Keyboard,
  SlidersHorizontal,
  X,
} from 'lucide-react';

export type ProgressStatusOption = '' | 'improved' | 'unchanged' | 'regressed' | 'plateau';
export type PatientToleranceOption =
  | ''
  | 'well_tolerated'
  | 'moderate_fatigue'
  | 'poorly_tolerated';

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

  // Persist `legacyUnreviewed: true` on the FIRST save of any non-finalized note whose stored schemaVersion < 2,
  // and preserve `legacyUnreviewed: true` across all draft saves until finalized with review confirmation.
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

interface TreatmentSessionViewProps {
  session: SessionRecord;
  patientId: string;
  patientName: string;
  episodeTitle: string;
  initialAutoOpenFinish?: boolean;
  onFinishCompleted?: (
    undoSnapshot: FinishUndoSnapshot,
    summaryAr: string,
    summaryEn: string
  ) => void;
  onBack: () => void;
  onSessionUpdated: () => void;
  onOpenMasterChart: () => void;
}

export const TreatmentSessionView: React.FC<TreatmentSessionViewProps> = ({
  session,
  patientId,
  patientName,
  episodeTitle,
  initialAutoOpenFinish = false,
  onFinishCompleted,
  onBack,
  onSessionUpdated,
  onOpenMasterChart,
}) => {
  const { language, bi, isRtl } = useLanguage();
  const { dek, refreshRecoveredDrafts } = useVault();
  const { patients } = usePatients();
  const currentPatient = useMemo(
    () => patients.find((p) => p.id === patientId),
    [patients, patientId]
  );

  const [enableVitalsModule, setEnableVitalsModule] = useState<boolean>(() =>
    ClinicOperationsService.isVitalsModuleEnabled()
  );
  const [enableModalitySafetyCheck, setEnableModalitySafetyCheck] = useState<boolean>(() =>
    ClinicOperationsService.isModalitySafetyCheckEnabled()
  );
  const [pendingModalityCandidate, setPendingModalityCandidate] = useState<{
    modality: PhysicalAgentFlowsheetEntry['modality'];
    modalityAr: string;
    defaultParams: string;
    rules: ModalitySafetyRule[];
  } | null>(null);
  const [modalityOverrideReason, setModalityOverrideReason] = useState('');

  useEffect(() => {
    const syncModules = () => {
      setEnableVitalsModule(ClinicOperationsService.isVitalsModuleEnabled());
      setEnableModalitySafetyCheck(ClinicOperationsService.isModalitySafetyCheckEnabled());
    };
    syncModules();
    return ClinicOperationsService.subscribe(syncModules);
  }, []);

  const [soapRecord, setSoapRecord] = useState<SoapNoteRecord | null>(null);
  const [addenda, setAddenda] = useState<ClinicalAddendumRecord[]>([]);
  const [addendaFailedCount, setAddendaFailedCount] = useState(0);
  const [flowsheetFailedCount, setFlowsheetFailedCount] = useState(0);
  const [sealStatus, setSealStatus] = useState<SealVerificationStatus | null>(null);
  const [sealMismatchWarning, setSealMismatchWarning] = useState<string | null>(null);
  const [unsealedNotice, setUnsealedNotice] = useState<string | null>(null);
  const [isLegacyDraftOrigin, setIsLegacyDraftOrigin] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [missingLockFields, setMissingLockFields] = useState<string[]>([]);
  const [showFinishFlowModal, setShowFinishFlowModal] = useState(false);
  const [pendingNavAction, setPendingNavAction] = useState<'back' | 'chart' | null>(null);
  const [isLocked, setIsLocked] = useState(session.data.status === 'finalized');
  const [isDirty, setIsDirty] = useState(false);

  // Phase 2.3 Quick SOAP State (Copy-Forward, Timer, Custom Chips, Shortcuts)
  const [copiedFromInfo, setCopiedFromInfo] = useState<{ sessionNumber: number; sessionDate: string } | null>(null);
  const [copiedBaseline, setCopiedBaseline] = useState<Partial<UntouchedDraftFormState> | null>(null);
  const [favoriteChips, setFavoriteChips] = useState<QuickSoapChip[]>(() =>
    ClinicOperationsService.getQuickSoapChips()
  );
  const [showChipEditorModal, setShowChipEditorModal] = useState(false);
  const [confirmDeleteChipId, setConfirmDeleteChipId] = useState<string | null>(null);
  const [confirmResetChips, setConfirmResetChips] = useState(false);
  const [newChipCategory, setNewChipCategory] = useState<QuickSoapChipCategory>('modality');
  const [newChipLabelAr, setNewChipLabelAr] = useState('');
  const [newChipLabelEn, setNewChipLabelEn] = useState('');
  const [newChipDetail, setNewChipDetail] = useState('');
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(() => {
    const recorded = ClinicOperationsService.getSessionTimerSeconds(session.id);
    return resolveInitialSessionTimerState({
      isFinalized: session.data.status === 'finalized',
      recordedSeconds: recorded,
    }).elapsedSeconds;
  });
  const [timerRunning, setTimerRunning] = useState<boolean>(() => {
    const recorded = ClinicOperationsService.getSessionTimerSeconds(session.id);
    return resolveInitialSessionTimerState({
      isFinalized: session.data.status === 'finalized',
      recordedSeconds: recorded,
    }).timerRunning;
  });
  const [savedSessionSeconds, setSavedSessionSeconds] = useState<number | null>(() => {
    const recorded = ClinicOperationsService.getSessionTimerSeconds(session.id);
    return resolveInitialSessionTimerState({
      isFinalized: session.data.status === 'finalized',
      recordedSeconds: recorded,
    }).savedSessionSeconds;
  });
  const latestElapsedRef = useRef<number>(elapsedSeconds);
  const isLockedRef = useRef<boolean>(isLocked);
  latestElapsedRef.current = elapsedSeconds;
  isLockedRef.current = isLocked;
  const [localUndoToast, setLocalUndoToast] = useState<{
    snapshot: FinishUndoSnapshot;
    label: string;
  } | null>(null);
  const autoFinishTriggeredRef = useRef(false);
  const shortcutSaveRef = useRef<(() => void) | null>(null);
  const shortcutFinishRef = useRef<(() => void) | null>(null);

  // Monotonic request-id guard so stale concurrent `loadSoapAndAddenda` runs never overwrite newer state
  const loadRequestIdRef = useRef(0);

  // Append-Only Addendum Form State (for finalized sessions)
  const [addendumReason, setAddendumReason] = useState<AddendumReason>('treatment_response_update');
  const [addendumText, setAddendumText] = useState('');
  const [isSavingAddendum, setIsSavingAddendum] = useState(false);
  const [addendumError, setAddendumError] = useState<string | null>(null);

  // Untouched initial SOAP & Flowsheet state (NO fabricated defaults)
  const [formState, setFormState] = useState<UntouchedDraftFormState>(
    createUntouchedDraftFormState
  );

  // Raw string drafts for numeric inputs so clearing an input never coerces "" -> 0
  const [numericDrafts, setNumericDrafts] = useState<Record<string, string>>({});
  // Track which physical agent entries still have unedited template prefill parameters
  const [prefillParameterIds, setPrefillParameterIds] = useState<Record<string, boolean>>({});

  const [selectedCatalogExId, setSelectedCatalogExId] = useState<string>(
    PT_EXERCISE_CATALOG[0].id
  );

  // Self-declared staff label ("Recorded by") — NOT cryptographically authenticated identity
  const activeStaff = ClinicOperationsService.getActiveStaff();
  const perms = ROLE_PERMISSIONS[activeStaff.role];
  const recordedByName =
    language !== 'en'
      ? `${activeStaff.nameAr} (${activeStaff.nameEn})`
      : `${activeStaff.nameEn} (${activeStaff.nameAr})`;

  const updateField = useCallback(
    <K extends keyof UntouchedDraftFormState>(key: K, value: UntouchedDraftFormState[K]) => {
      loadRequestIdRef.current++;
      setFormState((prev) => ({ ...prev, [key]: value }));
      setIsDirty(true);
      setAutosaveStatus('idle');
      setMissingLockFields([]);
    },
    []
  );

  const applyCopyForwardFromSoap = useCallback(
    (prevSoap: SoapNoteData, sourceSessionNumber: number, sourceSessionDate: string) => {
      const flow = prevSoap.objective?.flowsheet;
      const { freeText } = resolveStoredInterventionsSummary(
        prevSoap.objective?.dailyInterventionsSummary,
        prevSoap.objective?.legacyCompiledSummary,
        flow
      );
      const nextState: UntouchedDraftFormState = {
        ...createUntouchedDraftFormState(),
        chiefComplaint: prevSoap.subjective?.chiefComplaint || '',
        symptomChanges: '',
        interventionsSummary: freeText,
        clinicalObservations: prevSoap.objective?.clinicalObservations || '',
        clinicalImpression: prevSoap.assessment?.clinicalImpressionCurrent || '',
        progressStatus: prevSoap.assessment?.progressStatus || '',
        patientTolerance: '',
        nextSessionPlan: prevSoap.plan?.nextSessionPlan || '',
        homeInstructions: prevSoap.plan?.homeInstructions || '',
        exercises: (flow?.exercises || []).map((e) => ({ ...e, id: crypto.randomUUID() })),
        manualTherapy: (flow?.manualTherapy || []).map((m) => ({ ...m, id: crypto.randomUUID() })),
        physicalAgents: (flow?.physicalAgents || []).map((p) => ({ ...p, id: crypto.randomUUID() })),
      };
      setFormState(nextState);
      setCopiedFromInfo({ sessionNumber: sourceSessionNumber, sessionDate: sourceSessionDate });
      setCopiedBaseline({
        chiefComplaint: nextState.chiefComplaint,
        interventionsSummary: nextState.interventionsSummary,
        clinicalObservations: nextState.clinicalObservations,
        clinicalImpression: nextState.clinicalImpression,
        nextSessionPlan: nextState.nextSessionPlan,
        homeInstructions: nextState.homeInstructions,
      });
      setNumericDrafts({});
      setIsDirty(true);
    },
    []
  );

  const handleCopyPreviousSessionManual = async () => {
    if (isLocked || !dek) return;
    setSaveError(null);
    try {
      const prevRes = await SoapService.getLatestEpisodeSoapNote(
        session.episodeId,
        session.id,
        dek,
        undefined,
        session.sessionNumber,
        session.sessionDate
      );
      if (prevRes.soapNote) {
        applyCopyForwardFromSoap(
          prevRes.soapNote.data,
          prevRes.sourceSessionNumber || Math.max(1, session.sessionNumber - 1),
          prevRes.sourceSessionDate || ''
        );
      } else {
        setSaveError(
          bi(
            'لا توجد جلسة سابقة في هذه الحلقة تحتوي على ملاحظة SOAP لنسخها.',
            'No prior session in this episode has a saved SOAP note to copy forward.',
            'هیچ دانیشتنێکی پێشوو لەم ئەڵقەیەدا تۆماری SOAPـی نییە بۆ کۆپیکردن.'
          )
        );
      }
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Copy-forward failed');
    }
  };

  const handleResetCopiedFields = () => {
    if (isLocked) return;
    setCopiedFromInfo(null);
    setCopiedBaseline(null);
    setFormState(createUntouchedDraftFormState());
    setNumericDrafts({});
    setIsDirty(false);
  };

  const getCopiedFieldStatus = (
    field:
      | 'chiefComplaint'
      | 'interventionsSummary'
      | 'clinicalObservations'
      | 'clinicalImpression'
      | 'nextSessionPlan'
      | 'homeInstructions'
  ): 'copied' | 'edited' | null => {
    if (!copiedFromInfo || !copiedBaseline) return null;
    const base = copiedBaseline[field];
    if (!base || !String(base).trim()) return null;
    return formState[field] === base ? 'copied' : 'edited';
  };

  const renderCopiedFieldBadge = (
    field:
      | 'chiefComplaint'
      | 'interventionsSummary'
      | 'clinicalObservations'
      | 'clinicalImpression'
      | 'nextSessionPlan'
      | 'homeInstructions'
  ) => {
    const status = getCopiedFieldStatus(field);
    if (!status || !copiedFromInfo) return null;
    if (status === 'copied') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
          <Copy className="size-3" />
          {bi(
            `منقول من #${copiedFromInfo.sessionNumber}`,
            `Copied #${copiedFromInfo.sessionNumber}`,
            `کۆپیکراو لە #${copiedFromInfo.sessionNumber}`
          )}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
        {bi('مُعدَّل', 'Edited', 'دەستکاریکراو')}
      </span>
    );
  };

  const handleApplyFavoriteChip = (chip: QuickSoapChip) => {
    if (isLocked) return;
    if (chip.category === 'exercise') {
      const cat = chip.exerciseId
        ? PT_EXERCISE_CATALOG.find((e) => e.id === chip.exerciseId)
        : undefined;
      const entry: FlowsheetExerciseEntry = {
        id: crypto.randomUUID(),
        exerciseId: cat?.id || chip.exerciseId || chip.id,
        nameAr: cat?.nameAr || chip.labelAr,
        nameEn: cat?.nameEn || chip.labelEn,
        region: cat?.region || 'thoracic_lumbar',
        sets: chip.sets ?? cat?.defaultSets ?? 3,
        reps: chip.reps ?? cat?.defaultReps ?? 10,
        holdSeconds: chip.holdSeconds ?? cat?.defaultHoldSeconds ?? 0,
        loadOrBand: chip.loadOrBand ?? cat?.defaultLoadOrBand ?? 'Bodyweight',
        rpeOrPainResponse: 'pain_free',
      };
      updateField('exercises', [...formState.exercises, entry]);
      return;
    }
    if (chip.category === 'manual') {
      const entry: ManualTherapyFlowsheetEntry = {
        id: crypto.randomUUID(),
        techniqueAr: chip.manualTechniqueAr || chip.labelAr,
        techniqueEn: chip.manualTechniqueEn || chip.labelEn,
        targetJointOrTissue: chip.manualTarget || episodeTitle,
        gradeOrIntensity: chip.manualGrade || 'Grade III',
        durationMinutes: chip.durationMinutes ?? 10,
      };
      updateField('manualTherapy', [...formState.manualTherapy, entry]);
      return;
    }
    const id = crypto.randomUUID();
    const modType = chip.modalityType || 'TENS';
    const params = chip.modalityParams || '';
    handleAddPhysicalAgent(modType, chip.labelAr, params, chip.durationMinutes ?? 15, id);
  };

  const handleAddCustomChip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChipLabelAr.trim() && !newChipLabelEn.trim()) return;
    const ar = newChipLabelAr.trim() || newChipLabelEn.trim();
    const en = newChipLabelEn.trim() || newChipLabelAr.trim();
    const detail = newChipDetail.trim();
    const newChip: QuickSoapChip = {
      id: `chip_${crypto.randomUUID()}`,
      category: newChipCategory,
      labelAr: ar,
      labelEn: en,
      ...(newChipCategory === 'exercise'
        ? { sets: 3, reps: 10, holdSeconds: 5, loadOrBand: detail || 'Bodyweight' }
        : newChipCategory === 'manual'
          ? {
              manualTechniqueAr: ar,
              manualTechniqueEn: en,
              manualGrade: 'Grade III',
              durationMinutes: 10,
              manualTarget: detail || episodeTitle,
            }
          : {
              modalityType: 'TENS',
              modalityParams: detail || '100Hz',
              durationMinutes: 15,
            }),
    };
    const next = [...favoriteChips, newChip];
    setFavoriteChips(next);
    setNewChipLabelAr('');
    setNewChipLabelEn('');
    setNewChipDetail('');
    await ClinicOperationsService.saveQuickSoapChipsAsync(next);
  };

  const handleDeleteFavoriteChip = async (chipId: string) => {
    const next = favoriteChips.filter((c) => c.id !== chipId);
    setFavoriteChips(next);
    await ClinicOperationsService.saveQuickSoapChipsAsync(next);
  };

  const handleResetDefaultChips = async () => {
    setFavoriteChips(DEFAULT_QUICK_SOAP_CHIPS);
    await ClinicOperationsService.saveQuickSoapChipsAsync(DEFAULT_QUICK_SOAP_CHIPS);
  };

  const formatElapsedMmSs = (totalSec: number) => formatTimerMmSs(totalSec);

  const loadSoapAndAddenda = useCallback(async () => {
    if (!dek || !session.id) return;
    const requestId = ++loadRequestIdRef.current;
    setIsLoading(true);
    setLoadError(null);
    setSaveError(null);
    setSealStatus(null);
    setSealMismatchWarning(null);
    setUnsealedNotice(null);
    try {
      const latestSession = (await SessionService.getSessionById(session.id, dek)) || session;
      if (requestId !== loadRequestIdRef.current) return;

      const existing = await SoapService.getSoapNoteBySession(session.id, dek);
      if (requestId !== loadRequestIdRef.current) return;

      if (existing) {
        setCopiedFromInfo(null);
        setCopiedBaseline(null);
        setSoapRecord(existing);
        const d = existing.data;
        const flow = d.objective?.flowsheet;
        const { freeText, legacyCompiledSummary } = resolveStoredInterventionsSummary(
          d.objective?.dailyInterventionsSummary,
          d.objective?.legacyCompiledSummary,
          flow
        );

        const locked = Boolean(d.isFinalized || latestSession.data.status === 'finalized');
        setIsLocked(locked);

        // Derive the legacy-draft gate strictly from `d.legacyUnreviewed` (NOT from schemaVersion)
        const legacyDraft = !locked && Boolean(d.legacyUnreviewed);
        setIsLegacyDraftOrigin(legacyDraft);

        setFormState({
          prePainNrs: d.subjective?.painNotRecorded ? undefined : d.subjective?.painNrsScore,
          prePainNotRecorded: Boolean(d.subjective?.painNotRecorded),
          postPainNrs: d.subjective?.postPainNotRecorded
            ? undefined
            : d.subjective?.postSessionPainNrs,
          postPainNotRecorded: Boolean(d.subjective?.postPainNotRecorded),
          legacyPainDetail: extractLegacyPainDetail(d.subjective),
          legacyDraftReviewed: false,
          chiefComplaint: d.subjective?.chiefComplaint || '',
          symptomChanges: d.subjective?.symptomChangesSinceLastSession || '',
          interventionsSummary: freeText,
          legacyCompiledSummary,
          clinicalObservations: d.objective?.clinicalObservations || '',
          clinicalImpression: d.assessment?.clinicalImpressionCurrent || '',
          progressStatus: d.assessment?.progressStatus || '',
          patientTolerance: d.assessment?.patientTolerance || '',
          nextSessionPlan: d.plan?.nextSessionPlan || '',
          homeInstructions: d.plan?.homeInstructions || '',
          exercises: flow?.exercises || [],
          manualTherapy: flow?.manualTherapy || [],
          physicalAgents: flow?.physicalAgents || [],
          vitals: d.objective?.vitals,
          modalitySafetyOverrides: d.objective?.modalitySafetyOverrides || [],
        });
        setNumericDrafts({});

        if (locked) {
          const soapSealCheck = await verifySoapSeal(d);
          const sessionSealCheck = await verifySessionSeal(latestSession.data, d);
          if (requestId !== loadRequestIdRef.current) return;

          if (soapSealCheck.status === 'mismatch' || sessionSealCheck.status === 'mismatch') {
            setSealStatus('mismatch');
            setSealMismatchWarning(
              bi(
                'تحذير عدم تطابق ختم التكامل الرقمي (Seal Mismatch): المحتوى المخزن للجلسة أو ملاحظة SOAP لا يطابق بصمة الاعتماد الأصلية SHA-256.',
                'Integrity Seal Mismatch Warning: Stored session or SOAP note content does not match its SHA-256 finalization seal.',
                'ئاگاداری نەگونجانی مۆری دیجیتاڵی (Seal Mismatch): ناوەڕۆکی هەڵگیراوی دانیشتن یان تۆماری SOAP لەگەڵ مۆری سەرەکیی SHA-256 ناگونجێت.'
              )
            );
          } else if (
            soapSealCheck.status === 'unsealed' ||
            sessionSealCheck.status === 'unsealed'
          ) {
            setSealStatus('unsealed');
            setUnsealedNotice(
              bi(
                'سجل قديم بدون ختم تكامل قياسي (Unsealed legacy record): تم اعتماد هذه الملاحظة قبل تطبيق ختم التكامل القياسي v1 أو أثناء إصلاح القفل، يرجى مراجعة محتواها قبل الاعتماد عليها.',
                'Unsealed legacy record: This note was finalized before canonical integrity seal v1 (or repaired during migration); please review before relying on it.',
                'تۆماری کۆن بەبێ مۆری ستاندارد: ئەم تۆمارە پێش جێبەجێکردنی مۆری ستانداردی v1 پەسەند کراوە؛ تکایە پێش پشتبەستن پێی پێداچوونەوەی بۆ بکە.'
              )
            );
          } else {
            setSealStatus('valid');
          }
        }
      } else {
        setSoapRecord(null);
        setIsLegacyDraftOrigin(false);
        setNumericDrafts({});
        const locked = latestSession.data.status === 'finalized';
        setIsLocked(locked);
        if (!locked && latestSession.data.sessionType !== 'initial_evaluation') {
          const prevRes = await SoapService.getLatestEpisodeSoapNote(
            latestSession.episodeId,
            latestSession.id,
            dek,
            undefined,
            latestSession.sessionNumber,
            latestSession.sessionDate
          );
          if (requestId !== loadRequestIdRef.current) return;
          if (prevRes.soapNote) {
            applyCopyForwardFromSoap(
              prevRes.soapNote.data,
              prevRes.sourceSessionNumber || Math.max(1, latestSession.sessionNumber - 1),
              prevRes.sourceSessionDate || ''
            );
          } else {
            setCopiedFromInfo(null);
            setCopiedBaseline(null);
            setFormState(createUntouchedDraftFormState());
          }
        } else {
          setCopiedFromInfo(null);
          setCopiedBaseline(null);
          setFormState(createUntouchedDraftFormState());
        }
        if (locked) {
          const sessionSealCheck = await verifySessionSeal(latestSession.data, null);
          if (requestId !== loadRequestIdRef.current) return;

          if (sessionSealCheck.status === 'mismatch') {
            setSealStatus('mismatch');
            setSealMismatchWarning(
              bi(
                'تحذير عدم تطابق ختم التكامل الرقمي (Seal Mismatch): المحتوى المخزن للجلسة لا يطابق بصمة الاعتماد الأصلية SHA-256.',
                'Integrity Seal Mismatch Warning: Stored session content does not match its SHA-256 finalization seal.',
                'ئاگاداری نەگونجانی مۆری دیجیتاڵی (Seal Mismatch): ناوەڕۆکی هەڵگیراوی دانیشتنەکە لەگەڵ مۆری سەرەکیی SHA-256 ناگونجێت.'
              )
            );
          } else if (sessionSealCheck.status === 'unsealed') {
            setSealStatus('unsealed');
            setUnsealedNotice(
              bi(
                'سجل قديم بدون ختم تكامل قياسي (Unsealed legacy record): تم اعتماد هذه الجلسة قبل تطبيق ختم التكامل القياسي v1.',
                'Unsealed legacy record: This session was finalized before canonical integrity seal v1.',
                'تۆماری کۆن بەبێ مۆری ستاندارد: ئەم دانیشتنە پێش جێبەجێکردنی مۆری ستانداردی v1 پەسەند کراوە.'
              )
            );
          } else {
            setSealStatus('valid');
          }
        }
      }

      const addendaResult = await SoapService.getAddendaBySession(session.id, dek);
      if (requestId !== loadRequestIdRef.current) return;

      setAddenda(addendaResult.records);
      setAddendaFailedCount(addendaResult.failedCount);

      // Phase A1: Recover power-cut / pre-lock draft if present for this unfinalized session
      const sessionLockedNow = latestSession.data.status === 'finalized';
      if (!sessionLockedNow) {
        const recovered = await DraftRecoveryService.getDraftAsync<UntouchedDraftFormState>(
          dek,
          'soap',
          session.id
        );
        if (requestId !== loadRequestIdRef.current) return;
        if (recovered) {
          setFormState({
            ...createUntouchedDraftFormState(),
            ...recovered.payload,
            modalitySafetyOverrides: recovered.payload?.modalitySafetyOverrides || [],
          });
          setIsDirty(true);
        } else {
          setIsDirty(false);
        }
      } else {
        setIsDirty(false);
      }
    } catch (err: unknown) {
      if (requestId !== loadRequestIdRef.current) return;
      const msg =
        err instanceof Error
          ? err.message
          : bi(
              'تعذر تحميل وفك تشفير بيانات الجلسة السريرية.',
              'Failed to load and decrypt session clinical data.',
              'بارکردن و کردنەوەی کۆدی زانیارییە کلینیکییەکانی دانیشتن شکستی هێنا.'
            );
      setLoadError(msg);
      console.error('Failed to load session note:', err);
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [dek, session.id, bi]);

  useEffect(() => {
    autoFinishTriggeredRef.current = false;
    loadSoapAndAddenda();
  }, [loadSoapAndAddenda]);

  // Initialize session timer strictly per session.id (never from scheduled sessionDurationMinutes)
  // and persist actual elapsed time on navigation / unmount so re-entry resumes from recorded time.
  useEffect(() => {
    const currentSessionId = session.id;
    const recorded = ClinicOperationsService.getSessionTimerSeconds(currentSessionId);
    const initial = resolveInitialSessionTimerState({
      isFinalized: session.data.status === 'finalized',
      recordedSeconds: recorded,
    });
    setElapsedSeconds(initial.elapsedSeconds);
    setSavedSessionSeconds(initial.savedSessionSeconds);
    setTimerRunning(initial.timerRunning);
    latestElapsedRef.current = initial.elapsedSeconds;

    const flushTimerOnLeave = () => {
      if (!isLockedRef.current && latestElapsedRef.current > 0) {
        ClinicOperationsService.saveSessionTimerSeconds(
          currentSessionId,
          latestElapsedRef.current
        );
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushTimerOnLeave();
      }
    };

    window.addEventListener('pagehide', flushTimerOnLeave);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', flushTimerOnLeave);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      flushTimerOnLeave();
    };
    // Intentionally scoped to session.id only so language/draft updates never reset an active timer
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  // Stop timer immediately if session transitions to finalized
  useEffect(() => {
    if (isLocked) {
      setTimerRunning(false);
    }
  }, [isLocked]);

  // Automatic session timer with periodic encrypted checkpoint every 5 seconds
  useEffect(() => {
    if (!timerRunning || isLocked) return;
    const id = setInterval(() => {
      setElapsedSeconds((prev) => {
        const next = prev + 1;
        latestElapsedRef.current = next;
        if (next > 0 && next % 5 === 0) {
          ClinicOperationsService.saveSessionTimerSeconds(session.id, next);
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [timerRunning, isLocked, session.id]);

  // Auto-open Finish flow when launched via "Finish & Collect" in Today view
  useEffect(() => {
    if (
      initialAutoOpenFinish &&
      !isLoading &&
      !isLocked &&
      !autoFinishTriggeredRef.current
    ) {
      autoFinishTriggeredRef.current = true;
      shortcutFinishRef.current?.();
    }
  }, [initialAutoOpenFinish, isLoading, isLocked]);

  // Global keyboard shortcuts inside Session Workspace
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showShortcutsModal) setShowShortcutsModal(false);
        if (showChipEditorModal) setShowChipEditorModal(false);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (isLocked || isSaving) return;
        e.preventDefault();
        if (e.shiftKey) {
          shortcutFinishRef.current?.();
        } else {
          shortcutSaveRef.current?.();
        }
        return;
      }

      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName?.toUpperCase();
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          target?.isContentEditable
        ) {
          return;
        }
        e.preventDefault();
        setShowShortcutsModal((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLocked, isSaving, showShortcutsModal, showChipEditorModal]);

  // Browser tab close / refresh guard & Phase A1 encrypted <=650ms draft buffering
  useEffect(() => {
    if (!isDirty || isLocked || !dek) return;
    const summaryLabel =
      formState.chiefComplaint?.trim().slice(0, 60) ||
      `Session #${session.sessionNumber}`;
    const draftInput = {
      draftType: 'soap' as const,
      entityId: session.id,
      patientId,
      summaryLabel,
      payload: formState,
    };
    DraftRecoveryService.scheduleDebouncedDraftSave(dek, draftInput);
    const unregisterFlush = DraftRecoveryService.registerDraftFlushSource(
      `soap:${session.id}`,
      () => draftInput
    );
    const handleBeforeUnload = () => {
      void DraftRecoveryService.flushAllPendingDrafts(dek);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      unregisterFlush();
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty, isLocked, dek, session.id, session.sessionNumber, patientId, formState]);

  // Inline numeric validation for exercise, manual therapy, and physical agent rows
  const numericErrors = useMemo(() => {
    const errs: Record<string, string> = {};
    const checkIntRange = (
      key: string,
      actualVal: number,
      min: number,
      max: number,
      labelAr: string,
      labelEn: string,
      labelCkb: string
    ) => {
      const raw = numericDrafts[key] !== undefined ? numericDrafts[key] : String(actualVal);
      if (raw.trim() === '') {
        errs[key] = bi(
          `${labelAr} مطلوب (${min}–${max})`,
          `${labelEn} required (${min}–${max})`,
          `${labelCkb} پێویستە (${min}–${max})`
        );
        return;
      }
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
        errs[key] = bi(
          `${labelAr}: أدخل رقماً صحيحاً بين ${min} و ${max}`,
          `${labelEn}: enter integer ${min}–${max}`,
          `${labelCkb}: ژمارەیەکی تەواو لە نێوان ${min} و ${max} بنووسە`
        );
      }
    };

    for (const ex of formState.exercises) {
      checkIntRange(`${ex.id}_sets`, ex.sets, 1, 20, 'الجولات', 'Sets', 'سێتەکان');
      checkIntRange(`${ex.id}_reps`, ex.reps, 1, 200, 'التكرار', 'Reps', 'دووبارەبوونەوە');
      checkIntRange(`${ex.id}_hold`, ex.holdSeconds, 0, 600, 'الثبات (ث)', 'Hold (s)', 'ڕاگرتن (چ)');
    }
    for (const mt of formState.manualTherapy) {
      checkIntRange(`${mt.id}_duration`, mt.durationMinutes, 1, 120, 'المدة (د)', 'Duration (m)', 'ماوە (خ)');
    }
    for (const pa of formState.physicalAgents) {
      checkIntRange(`${pa.id}_duration`, pa.durationMinutes, 1, 120, 'المدة (د)', 'Duration (m)', 'ماوە (خ)');
    }
    return errs;
  }, [formState.exercises, formState.manualTherapy, formState.physicalAgents, numericDrafts, bi]);

  const hasNumericErrors = Object.keys(numericErrors).length > 0;

  // Derived flowsheet summary for display/export only (NEVER stored in dailyInterventionsSummary)
  const derivedFlowsheetSummary = useMemo(
    () =>
      compileFlowsheetSummaryText(
        {
          exercises: formState.exercises,
          manualTherapy: formState.manualTherapy,
          physicalAgents: formState.physicalAgents,
        },
        language !== 'en'
      ),
    [formState.exercises, formState.manualTherapy, formState.physicalAgents, language]
  );

  // Persist draft helper (used by manual Save Draft, debounced Autosave, and pre-Sign save)
  // Pass `notifyParent = false` inside the Sign & Lock flow so `onSessionUpdated()` is only called once after finalize succeeds.
  const persistDraftSoap = useCallback(
    async (isAuto = false, notifyParent = !isAuto): Promise<SoapNoteRecord | null> => {
      if (!dek || isLocked) return null;
      if (hasNumericErrors) {
        if (!isAuto) {
          setSaveError(
            bi(
              'يرجى تصحيح القيم الرقمية غير الصالحة في جدول التمارين أو الأجهزة قبل الحفظ.',
              'Please fix invalid numeric values in the flowsheet before saving.',
              'تکایە پێش پاشەکەوتکردن بەها ژمارەییە نادروستەکانی ناو خشتەی ڕاهێنان یان ئامێرەکان ڕاست بکەرەوە.'
            )
          );
        }
        return null;
      }

      // Invalidate any stale in-flight loadSoapAndAddenda before writing
      loadRequestIdRef.current++;

      if (isAuto) {
        setAutosaveStatus('saving');
      } else {
        setIsSaving(true);
        setSaveError(null);
      }

      try {
        const soapPayload = buildSoapPayloadFromFormState(formState, soapRecord);
        let savedSoap: SoapNoteRecord;
        if (soapRecord) {
          savedSoap = await SoapService.updateSoapNote(
            soapRecord.id,
            soapPayload,
            dek,
            undefined,
            soapRecord.updatedAt
          );
        } else {
          savedSoap = await SoapService.createSoapNote(
            patientId,
            session.episodeId,
            session.id,
            soapPayload,
            dek
          );
        }
        setSoapRecord(savedSoap);
        setIsLegacyDraftOrigin(Boolean(!savedSoap.data.isFinalized && savedSoap.data.legacyUnreviewed));
        if (latestElapsedRef.current > 0) {
          ClinicOperationsService.saveSessionTimerSeconds(session.id, latestElapsedRef.current);
        }
        if (!isAuto) {
          setIsDirty(false);
          void DraftRecoveryService.deleteDraftAsync('soap', session.id).then(() =>
            refreshRecoveredDrafts()
          );
        }
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        setLastSavedAt(`${hh}:${mm}`);
        if (isAuto) {
          setAutosaveStatus('saved');
        } else if (notifyParent) {
          setAutosaveStatus('saved');
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 3000);
          onSessionUpdated();
        }
        return savedSoap;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to save treatment session';
        setSaveError(msg);
        setAutosaveStatus('idle');
        return null;
      } finally {
        if (!isAuto && notifyParent) {
          setIsSaving(false);
        }
      }
    },
    [
      dek,
      isLocked,
      hasNumericErrors,
      bi,
      formState,
      soapRecord,
      patientId,
      session.episodeId,
      session.id,
      onSessionUpdated,
    ]
  );

  // Debounced draft autosave (only when dirty, unlocked, and no inline numeric errors)
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isDirty || isLocked || isSaving || hasNumericErrors || !dek) return;
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = setTimeout(() => {
      void persistDraftSoap(true, false);
    }, 2500);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [isDirty, isLocked, isSaving, hasNumericErrors, dek, persistDraftSoap]);

  const handleCarryForwardPreviousFlowsheet = async () => {
    if (isLocked || !dek) return;
    setSaveError(null);
    try {
      const result = await SoapService.getLatestEpisodeFlowsheet(
        session.episodeId,
        session.id,
        dek,
        undefined,
        session.sessionNumber,
        session.sessionDate
      );
      setFlowsheetFailedCount(result.failedCount);
      if (result.flowsheet) {
        setFormState((prev) => ({
          ...prev,
          exercises: (result.flowsheet?.exercises || []).map((e) => ({
            ...e,
            id: crypto.randomUUID(),
          })),
          manualTherapy: (result.flowsheet?.manualTherapy || []).map((m) => ({
            ...m,
            id: crypto.randomUUID(),
          })),
          physicalAgents: (result.flowsheet?.physicalAgents || []).map((p) => ({
            ...p,
            id: crypto.randomUUID(),
          })),
        }));
        setNumericDrafts({});
        setIsDirty(true);
      } else {
        setSaveError(
          bi(
            'لا توجد جلسة سابقة في هذه الحلقة تحتوي على جدول تمارين لنسخه.',
            'No previous session in this episode has a recorded flowsheet to copy.',
            'هیچ دانیشتنێکی پێشوو لەم ئەڵقەیەدا نییە کە خشتەی ڕاهێنانی تۆمارکراوی تێدابێت بۆ کۆپیکردن.'
          )
        );
      }
    } catch (err: unknown) {
      setSaveError(
        err instanceof Error ? err.message : 'Failed to carry forward previous flowsheet'
      );
    }
  };

  const handleAddExerciseFromCatalog = () => {
    if (isLocked) return;
    const cat = PT_EXERCISE_CATALOG.find((e) => e.id === selectedCatalogExId);
    if (!cat) return;
    const entry: FlowsheetExerciseEntry = {
      id: crypto.randomUUID(),
      exerciseId: cat.id,
      nameAr: cat.nameAr,
      nameEn: cat.nameEn,
      region: cat.region,
      sets: cat.defaultSets,
      reps: cat.defaultReps,
      holdSeconds: cat.defaultHoldSeconds,
      loadOrBand: cat.defaultLoadOrBand,
      rpeOrPainResponse: 'pain_free',
    };
    updateField('exercises', [...formState.exercises, entry]);
  };

  const handleAddManualTherapy = () => {
    if (isLocked) return;
    const entry: ManualTherapyFlowsheetEntry = {
      id: crypto.randomUUID(),
      techniqueAr: 'تحريك مفصلي تذبذبي (Maitland Mobilization)',
      techniqueEn: 'Maitland Joint Mobilization',
      targetJointOrTissue: episodeTitle,
      gradeOrIntensity: 'Grade III',
      durationMinutes: 10,
    };
    updateField('manualTherapy', [...formState.manualTherapy, entry]);
  };

  const appendPhysicalAgentDirectly = (
    modality: PhysicalAgentFlowsheetEntry['modality'],
    modalityAr: string,
    defaultParams: string,
    durationMinutes = 15,
    customId?: string
  ) => {
    const id = customId || crypto.randomUUID();
    const entry: PhysicalAgentFlowsheetEntry = {
      id,
      modality,
      modalityAr,
      site: episodeTitle,
      parameters: defaultParams,
      durationMinutes,
    };
    setPrefillParameterIds((prev) => ({ ...prev, [id]: true }));
    updateField('physicalAgents', [...formState.physicalAgents, entry]);
  };

  const handleAddPhysicalAgent = (
    modality: PhysicalAgentFlowsheetEntry['modality'],
    modalityAr: string,
    defaultParams: string,
    durationMinutes = 15,
    customId?: string
  ) => {
    if (isLocked) return;
    if (enableModalitySafetyCheck) {
      const combinedFreeText = [
        currentPatient?.data.contraindications,
        currentPatient?.data.precautions,
      ]
        .filter(Boolean)
        .join(' ');
      const matchedRules = checkModalitySafety(
        modality,
        currentPatient?.data.structuredPrecautions || [],
        combinedFreeText
      );
      if (matchedRules.length > 0) {
        setPendingModalityCandidate({
          modality,
          modalityAr,
          defaultParams,
          rules: matchedRules,
        });
        setModalityOverrideReason('');
        return;
      }
    }
    appendPhysicalAgentDirectly(modality, modalityAr, defaultParams, durationMinutes, customId);
  };

  const handleAddManualPhysicalAgent = () => {
    if (isLocked) return;
    appendPhysicalAgentDirectly('Other', '', '', 15);
  };

  const handleConfirmModalityOverride = () => {
    if (!pendingModalityCandidate || isLocked) return;
    const { modality, modalityAr, defaultParams, rules } = pendingModalityCandidate;
    const id = crypto.randomUUID();
    const paEntry: PhysicalAgentFlowsheetEntry = {
      id,
      modality,
      modalityAr,
      site: episodeTitle,
      parameters: defaultParams,
      durationMinutes: 15,
    };
    const overrideEntry: ModalitySafetyOverrideEntry = {
      id: crypto.randomUUID(),
      modality,
      precautionIds: Array.from(new Set(rules.map((r) => r.precautionId))),
      severity: rules.some((r) => r.severity === 'absolute_contraindication')
        ? 'absolute_contraindication'
        : 'precaution',
      overrideReason:
        modalityOverrideReason.trim() ||
        bi(
          'تجاوز موثق بعد موازنة الفائدة والمخاطرة السريرية',
          'Documented clinician override after clinical risk-benefit review',
          'تێپەڕاندنی تۆمارکراو دوای هەڵسەنگاندنی سوود و مەترسیی کلینیکی'
        ),
      overriddenBy: activeStaff.nameEn || activeStaff.nameAr,
      overriddenAt: new Date().toISOString(),
    };
    loadRequestIdRef.current++;
    setPrefillParameterIds((prev) => ({ ...prev, [id]: true }));
    setFormState((prev) => ({
      ...prev,
      physicalAgents: [...prev.physicalAgents, paEntry],
      modalitySafetyOverrides: [...prev.modalitySafetyOverrides, overrideEntry],
    }));
    setIsDirty(true);
    setAutosaveStatus('idle');
    setMissingLockFields([]);
    setPendingModalityCandidate(null);
    setModalityOverrideReason('');
  };

  const requiresLegacyReview = Boolean(
    !isLocked && (soapRecord?.data.legacyUnreviewed || isLegacyDraftOrigin)
  );

  const completenessReport = useMemo<NoteCompletenessReport | null>(() => {
    if (!ClinicOperationsService.isNoteCompletenessCheckEnabled()) return null;
    const hasPainRecorded =
      formState.prePainNrs !== undefined ||
      formState.prePainNotRecorded ||
      formState.postPainNrs !== undefined ||
      formState.postPainNotRecorded;
    const hasVitals = Boolean(
      formState.vitals &&
        (formState.vitals.bpSystolic !== undefined ||
          formState.vitals.bpDiastolic !== undefined ||
          formState.vitals.heartRateBpm !== undefined ||
          formState.vitals.spO2Percent !== undefined)
    );
    const hasObjectiveFinding =
      formState.clinicalObservations.trim().length > 0 || hasVitals;
    const hasIntervention =
      formState.exercises.length > 0 ||
      formState.manualTherapy.length > 0 ||
      formState.physicalAgents.length > 0 ||
      formState.interventionsSummary.trim().length > 0;
    const hasPlan =
      formState.nextSessionPlan.trim().length > 0 ||
      formState.homeInstructions.trim().length > 0 ||
      formState.clinicalImpression.trim().length > 0;
    const today = localDate();
    const hasUpcomingAppt = ClinicOperationsService.getAppointments().some(
      (a) =>
        a.patientId === patientId &&
        a.status === 'scheduled' &&
        a.date >= today
    );
    const hasRecurring = ClinicOperationsService.getRecurringSchedulesForPatient(
      patientId
    ).some((r) => r.isActive);
    const hasNextVisit =
      formState.nextSessionPlan.trim().length > 0 || hasUpcomingAppt || hasRecurring;
    return evaluateNoteCompleteness({
      hasPainRecorded,
      hasObjectiveFinding,
      hasIntervention,
      hasPlan,
      hasNextVisit,
    });
  }, [formState, patientId]);

  const handleRequestSignAndLock = () => {
    if (isLocked) return;
    setSaveError(null);
    if (hasNumericErrors) {
      setSaveError(
        bi(
          'يرجى تصحيح الأخطاء الرقمية في جدول التمارين أو الأجهزة قبل الاعتماد والقفل.',
          'Please fix numeric errors in the flowsheet before signing and locking.',
          'تکایە هەڵە ژمارەییەکان لە خشتەی ڕاهێنان یان ئامێرەکاندا پێش پەسەندکردن و قفڵکردن چاک بکە.'
        )
      );
      return;
    }
    if (requiresLegacyReview && !formState.legacyDraftReviewed) {
      const check = validateSignAndLockState(formState, true);
      setMissingLockFields(language === 'en' ? check.missingEn : check.missingAr);
      return;
    }
    // Missing SOAP fields are surfaced strictly as a non-blocking advisory notice inside the Sign & Lock modal
    const check = validateSignAndLockState(formState, false);
    setMissingLockFields(check.valid ? [] : language === 'en' ? check.missingEn : check.missingAr);
    setShowFinishFlowModal(true);
  };

  shortcutSaveRef.current = () => {
    if (!isLocked && !isSaving) {
      void persistDraftSoap(false);
    }
  };
  shortcutFinishRef.current = () => {
    if (!isLocked && !isSaving) {
      handleRequestSignAndLock();
    }
  };

  const executeFinalizeSessionAsync = async (): Promise<boolean> => {
    if (!dek || isLocked) return isLocked;
    setIsSaving(true);
    setSaveError(null);
    loadRequestIdRef.current++;
    try {
      // Save draft WITHOUT calling onSessionUpdated() before finalizeSession (Finding 3)
      const savedSoap = await persistDraftSoap(false, false);
      if (!savedSoap) {
        setIsSaving(false);
        return false;
      }

      // Single finalization path: SessionService.finalizeSession atomically seals & locks both records
      const finalizedSession = await SessionService.finalizeSession(
        session.id,
        activeStaff.nameEn,
        dek,
        undefined,
        session.updatedAt,
        savedSoap.updatedAt,
        Boolean(formState.legacyDraftReviewed),
        { allowIncompleteSoap: true }
      );
      const finalizedSoap = await SoapService.getSoapNoteBySession(session.id, dek);
      if (finalizedSoap) {
        setSoapRecord(finalizedSoap);
        const soapSealCheck = await verifySoapSeal(finalizedSoap.data);
        const sessionSealCheck = await verifySessionSeal(
          finalizedSession.data,
          finalizedSoap.data
        );
        if (soapSealCheck.status === 'mismatch' || sessionSealCheck.status === 'mismatch') {
          setSealStatus('mismatch');
          setSealMismatchWarning(
            bi(
              'تحذير عدم تطابق ختم التكامل الرقمي (Seal Mismatch): المحتوى المخزن لا يطابق بصمة الاعتماد SHA-256.',
              'Integrity Seal Mismatch Warning: Stored content does not match its SHA-256 finalization seal.',
              'ئاگاداری نەگونجانی مۆری دیجیتاڵی (Seal Mismatch): ناوەڕۆکی هەڵگیراو لەگەڵ مۆری پەسەندکردنی SHA-256 ناگونجێت.'
            )
          );
          setUnsealedNotice(null);
        } else if (
          soapSealCheck.status === 'unsealed' ||
          sessionSealCheck.status === 'unsealed'
        ) {
          setSealStatus('unsealed');
          setSealMismatchWarning(null);
          setUnsealedNotice(
            bi(
              'سجل قديم بدون ختم تكامل قياسي (Unsealed legacy record).',
              'Unsealed legacy record.',
              'تۆماری کۆن بەبێ مۆری ستاندارد.'
            )
          );
        } else {
          setSealStatus('valid');
          setSealMismatchWarning(null);
          setUnsealedNotice(null);
        }
      }
      setIsLegacyDraftOrigin(false);
      setIsLocked(true);
      setTimerRunning(false);
      setIsDirty(false);
      void DraftRecoveryService.deleteDraftAsync('soap', session.id).then(() =>
        refreshRecoveredDrafts()
      );
      setCopiedFromInfo(null);
      setCopiedBaseline(null);
      if (
        formState.vitals &&
        (formState.vitals.bpSystolic !== undefined ||
          formState.vitals.bpDiastolic !== undefined ||
          formState.vitals.heartRateBpm !== undefined ||
          formState.vitals.spO2Percent !== undefined)
      ) {
        const epStore = ClinicOperationsService.getEpisodeClinicalStore(
          session.episodeId,
          patientId
        );
        const existingHist = epStore.vitalsHistory || [];
        ClinicOperationsService.saveEpisodeClinicalStore({
          ...epStore,
          vitalsHistory: [...existingHist, formState.vitals],
        });
      }
      ClinicOperationsService.appendAuditLog({
        actionType: 'session_finalized',
        entityType: 'session',
        entityId: session.id,
        patientId,
        episodeId: session.episodeId,
        summaryAr: `اعتماد وقفل الجلسة #${session.data.sessionNumber} (مسجل بواسطة: ${activeStaff.nameAr})`,
        summaryEn: `Signed and locked Session #${session.data.sessionNumber} (Recorded by: ${activeStaff.nameEn})`,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      onSessionUpdated();
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to finalize treatment session';
      setSaveError(msg);
      console.error('Failed to finalize treatment session:', err);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddAddendum = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dek || !soapRecord) return;
    setAddendumError(null);
    setIsSavingAddendum(true);
    try {
      const created = await SoapService.addClinicalAddendum(
        session.id,
        'soapNotes',
        soapRecord.id,
        {
          reasonForAmendment: addendumReason,
          amendmentText: addendumText,
          signedByTherapistName: activeStaff.nameEn,
        },
        dek
      );
      setAddenda((prev) => [...prev, created]);
      setAddendumText('');
      ClinicOperationsService.appendAuditLog({
        actionType: 'addendum_signed',
        entityType: 'session',
        entityId: session.id,
        patientId,
        episodeId: session.episodeId,
        summaryAr: `إضافة ملحق سريري للجلسة #${session.data.sessionNumber} (مسجل بواسطة: ${activeStaff.nameAr})`,
        summaryEn: `Appended clinical addendum to Session #${session.data.sessionNumber} (Recorded by: ${activeStaff.nameEn})`,
      });
    } catch (err: unknown) {
      setAddendumError(err instanceof Error ? err.message : 'Failed to append addendum');
    } finally {
      setIsSavingAddendum(false);
    }
  };

  const handleSafeNavigation = (target: 'back' | 'chart') => {
    if (isDirty && !isLocked) {
      setPendingNavAction(target);
      return;
    }
    if (target === 'back') onBack();
    else onOpenMasterChart();
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-12 bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-muted-foreground-1 font-medium">
            {bi(
              'جاري فك تشفير بيانات الجلسة وجدول التمارين...',
              'Decrypting session & flowsheet...',
              'کردنەوەی کۆدی زانیاریی دانیشتن و خشتەی ڕاهێنان...'
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden transition-colors">
      {/* Top Session Bar (Modern cohesive layout) */}
      <div className="px-3 sm:px-6 py-2.5 bg-card/95 backdrop-blur-xs border-b border-card-line flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
        <div className="flex items-center justify-between sm:justify-start gap-2.5 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => handleSafeNavigation('back')}
              aria-label={bi('العودة للسجل العام', 'Back to Episode Chart', 'گەڕانەوە بۆ تۆماری گشتی')}
              title={bi('العودة للسجل العام', 'Back to Episode Chart', 'گەڕانەوە بۆ تۆماری گشتی')}
              className="size-8 rounded-xl bg-surface hover:bg-layer-hover border border-line-2 text-foreground flex items-center justify-center transition-colors cursor-pointer shrink-0"
            >
              {isRtl ? <ArrowRight className="size-4" /> : <ArrowLeft className="size-4" />}
            </button>

            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs tabular-nums min-w-0">
              <span className="py-1 px-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20 font-bold font-mono shrink-0">
                {bi(
                  `جلسة علاجية #${session.data.sessionNumber}`,
                  `Session #${session.data.sessionNumber}`,
                  `دانیشتنی چارەسەر #${session.data.sessionNumber}`
                )}
              </span>
              <span className="hidden md:inline text-muted-foreground-1">·</span>
              <span className="hidden md:inline text-foreground font-bold truncate max-w-[160px]">{patientName}</span>
              <span className="text-muted-foreground-1">·</span>
              <span className="text-muted-foreground-1 font-medium tabular-nums shrink-0">
                <bdi dir="ltr">{formatDateDDMMYYYY(session.data.sessionDate)}</bdi>
              </span>
              <span className="hidden sm:inline text-muted-foreground-1">·</span>
              <span className="hidden sm:inline text-xs font-bold text-foreground truncate max-w-[240px]">
                {episodeTitle}
              </span>
              {isLocked && (
                <span className="py-0.5 px-2 rounded-full bg-emerald-500/12 border border-emerald-500/25 text-emerald-700 dark:text-emerald-400 font-bold inline-flex items-center gap-1 shrink-0 text-[11px]">
                  <Lock className="size-3" />
                  {bi('معتمدة ومغلقة', 'Signed & Locked', 'پەسەندکراو و داخراو')}
                </span>
              )}
              {!isLocked && autosaveStatus === 'saving' && (
                <span className="text-xs text-amber-600 dark:text-amber-400 font-medium shrink-0">
                  {bi('جاري الحفظ...', 'Saving...', 'پاشەکەوتکردن...')}
                </span>
              )}
              {!isLocked && lastSavedAt && !isDirty && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium inline-flex items-center gap-1 shrink-0">
                  <CheckCircle2 className="size-3.5" />
                  <span className="hidden sm:inline">
                    {bi('تم الحفظ ', 'Saved ', 'پاشەکەوت کرا ')}
                  </span>
                  <bdi dir="ltr" className="font-mono tabular-nums">{lastSavedAt}</bdi>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-1.5 sm:gap-2">
          {!isLocked && (
            <div
              data-testid="session-timer-widget"
              className="inline-flex items-center gap-1 ps-2.5 pe-1 py-0.5 rounded-xl bg-surface border border-line-2 text-xs font-mono tabular-nums"
              title={bi('مؤقت الجلسة', 'Session Timer', 'کاتژمێری دانیشتن')}
            >
              <Timer className="size-3.5 text-primary" />
              {savedSessionSeconds !== null && !timerRunning ? (
                <>
                  <span
                    data-testid="session-timer-display"
                    className="font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-0.5"
                  >
                    <bdi dir="ltr">{formatElapsedMmSs(savedSessionSeconds)}</bdi>
                    <span className="text-[10px] ms-0.5">{bi('مسجّل', 'saved', 'تۆمارکرا')}</span>
                  </span>
                  <button
                    type="button"
                    data-testid="session-timer-resume-btn"
                    onClick={() => {
                      setElapsedSeconds(savedSessionSeconds);
                      latestElapsedRef.current = savedSessionSeconds;
                      setSavedSessionSeconds(null);
                      setTimerRunning(true);
                    }}
                    className="min-w-[30px] min-h-[30px] inline-flex items-center justify-center rounded-lg hover:bg-layer-hover text-muted-foreground-1 hover:text-foreground cursor-pointer transition-colors"
                    aria-label={bi('استئناف المؤقت', 'Resume timer', 'بەردەوامبوونی کاتژمێر')}
                    title={bi('استئناف المؤقت', 'Resume timer', 'بەردەوامبوونی کاتژمێر')}
                  >
                    <Play className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    data-testid="session-timer-reset-btn"
                    onClick={() => {
                      ClinicOperationsService.clearSessionTimerSeconds(session.id);
                      latestElapsedRef.current = 0;
                      setSavedSessionSeconds(null);
                      setElapsedSeconds(0);
                      setTimerRunning(true);
                    }}
                    className="min-w-[30px] min-h-[30px] inline-flex items-center justify-center rounded-lg hover:bg-layer-hover text-muted-foreground-1 hover:text-foreground cursor-pointer transition-colors"
                    aria-label={bi('إعادة التعيين', 'Reset timer', 'سفرکردنەوەی کاتژمێر')}
                    title={bi('إعادة التعيين', 'Reset timer', 'سفرکردنەوەی کاتژمێر')}
                  >
                    <RotateCcw className="size-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <span
                    data-testid="session-timer-display"
                    className="font-bold text-foreground"
                  >
                    <bdi dir="ltr">{formatElapsedMmSs(elapsedSeconds)}</bdi>
                  </span>
                  <button
                    type="button"
                    data-testid="session-timer-toggle-btn"
                    onClick={() => {
                      if (timerRunning) {
                        setSavedSessionSeconds(elapsedSeconds);
                        if (elapsedSeconds > 0) {
                          ClinicOperationsService.saveSessionTimerSeconds(session.id, elapsedSeconds);
                        }
                      }
                      setTimerRunning((r) => !r);
                    }}
                    className="min-w-[30px] min-h-[30px] inline-flex items-center justify-center rounded-lg hover:bg-layer-hover text-muted-foreground-1 hover:text-foreground cursor-pointer transition-colors"
                    aria-label={
                      timerRunning
                        ? bi('إيقاف مؤقت وحفظ الوقت', 'Pause & save time', 'وەستاندن و پاشەکەوتکردنی کات')
                        : bi('تشغيل المؤقت', 'Resume timer', 'کارپێکردنەوەی کاتژمێر')
                    }
                  >
                    {timerRunning ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                  </button>
                  <button
                    type="button"
                    data-testid="session-timer-reset-btn"
                    onClick={() => {
                      ClinicOperationsService.clearSessionTimerSeconds(session.id);
                      latestElapsedRef.current = 0;
                      setSavedSessionSeconds(null);
                      setElapsedSeconds(0);
                    }}
                    className="min-w-[30px] min-h-[30px] inline-flex items-center justify-center rounded-lg hover:bg-layer-hover text-muted-foreground-1 hover:text-foreground cursor-pointer transition-colors"
                    aria-label={bi('تصفير المؤقت', 'Reset timer', 'سفرکردنەوەی کاتژمێر')}
                  >
                    <RotateCcw className="size-3.5" />
                  </button>
                </>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowShortcutsModal(true)}
            className="hidden sm:inline-flex min-h-[34px] py-1 px-2.5 rounded-xl bg-surface hover:bg-layer-hover border border-line-2 text-muted-foreground-1 hover:text-foreground text-xs font-semibold items-center gap-1 cursor-pointer transition-colors"
            title={bi('اختصارات لوحة المفاتيح (?)', 'Keyboard Shortcuts (?)', 'قەدبڕەکانی کیبۆرد (؟)')}
          >
            <Keyboard className="size-3.5" />
            <span className="font-mono">?</span>
          </button>

          <button
            type="button"
            onClick={() => handleSafeNavigation('chart')}
            className="hidden sm:inline-flex min-h-[34px] py-1 px-3 rounded-xl bg-surface hover:bg-layer-hover border border-line-2 text-foreground text-xs font-semibold items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
          >
            <Layers className="size-3.5 text-primary" />
            <span>{bi('السجل العام', 'Episode Chart', 'تۆماری گشتیی بارودۆخ')}</span>
          </button>

          {!isLocked && (
            <div className="flex items-center gap-1.5 ms-auto sm:ms-0">
              <button
                type="button"
                onClick={() => void persistDraftSoap(false)}
                disabled={isSaving}
                className={`min-h-[34px] py-1 px-3 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-all ${
                  saveSuccess
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-primary/10 hover:bg-primary/15 text-primary border border-primary/25'
                }`}
              >
                <Save className="size-3.5" />
                <span>{bi('حفظ', 'Save', 'پاشەکەوتکردن')}</span>
              </button>

              {perms.canFinalizeAndLockNotes && (
                <button
                  type="button"
                  onClick={handleRequestSignAndLock}
                  disabled={isSaving}
                  className="min-h-[34px] py-1 px-3.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 shadow-xs shadow-primary/20 cursor-pointer whitespace-nowrap transition-all"
                >
                  <Lock className="size-3.5" />
                  <span>{bi('إنهاء واعتماد', 'Finish & Sign', 'تەواوکردن و پەسەندکردن')}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Unsaved Navigation Guard Banner */}
      {pendingNavAction && (
        <div className="px-4 py-3 bg-card border-b border-card-line shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-bold">
            <AlertTriangle className="size-4 shrink-0" />
            <span>
              {bi(
                'لديك تعديلات سريرية غير محفوظة في هذه الجلسة. هل ترغب في حفظ المسودة قبل المغادرة؟',
                'You have unsaved clinical changes in this session. Save draft before leaving?',
                'گۆڕانکاری کلینیکیی پاشەکەوتنەکراوت لەم دانیشتنەدا هەیە. دەتەوێت پێش ڕۆیشتن ڕەشنووس پاشەکەوت بکەیت؟'
              )}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                const target = pendingNavAction;
                setPendingNavAction(null);
                const saved = await persistDraftSoap(false);
                if (saved) {
                  if (target === 'back') onBack();
                  else onOpenMasterChart();
                }
              }}
              className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground font-semibold cursor-pointer"
            >
              {bi('حفظ المسودة والمغادرة', 'Save & Leave', 'پاشەکەوتکردنی ڕەشنووس و ڕۆیشتن')}
            </button>
            <button
              type="button"
              onClick={() => {
                const target = pendingNavAction;
                setPendingNavAction(null);
                setIsDirty(false);
                void DraftRecoveryService.deleteDraftAsync('soap', session.id).then(() =>
                  refreshRecoveredDrafts()
                );
                if (target === 'back') onBack();
                else onOpenMasterChart();
              }}
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold cursor-pointer"
            >
              {bi('تجاهل التغييرات والمغادرة', 'Discard & Leave', 'پشتگوێخستنی گۆڕانکارییەکان و ڕۆیشتن')}
            </button>
            <button
              type="button"
              onClick={() => setPendingNavAction(null)}
              className="px-3 py-1.5 rounded-lg bg-layer border border-layer-line text-foreground font-semibold cursor-pointer"
            >
              {bi('البقاء في الجلسة', 'Stay', 'مانەوە لە دانیشتن')}
            </button>
          </div>
        </div>
      )}

      {/* Main Session & Flowsheet Canvas */}
      <div
        tabIndex={0}
        aria-label={bi('مساحة توثيق الجلسة العلاجية', 'Treatment session documentation canvas', 'ڕووبەری تۆمارکردنی دانیشتنی چارەسەر')}
        className="flex-1 overflow-y-auto p-4 sm:p-6 pb-24 md:pb-6 space-y-5 max-w-5xl mx-auto w-full focus:outline-none"
      >
        {/* Load / Decrypt / Validation Warnings */}
        {loadError && (
          <div className="p-4 rounded-2xl bg-card shadow-2xs text-xs text-rose-700 dark:text-rose-400 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0 text-rose-600" />
              <span>{loadError}</span>
            </div>
            <button
              type="button"
              onClick={() => void loadSoapAndAddenda()}
              className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-bold inline-flex items-center gap-1 cursor-pointer shrink-0"
            >
              <RefreshCw className="size-3.5" />
              <span>{bi('إعادة المحاولة', 'Retry', 'هەوڵدانەوە')}</span>
            </button>
          </div>
        )}

        {saveError && (
          <div className="p-3.5 rounded-2xl bg-card shadow-2xs text-xs text-rose-700 dark:text-rose-400 flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0 text-rose-600" />
            <span>{saveError}</span>
          </div>
        )}

        {missingLockFields.length > 0 && (
          <div className="p-3.5 rounded-2xl bg-card shadow-2xs text-xs text-amber-700 dark:text-amber-400 space-y-1.5">
            <div className="flex items-center gap-2 font-extrabold">
              <AlertTriangle className="size-4 shrink-0" />
              <span>
                {bi(
                  'تنبيه إرشادي (غير مانع للاعتماد) — يفضّل استكمال الملاحظات التالية:',
                  'Advisory reminder (non-blocking) — recommended clinical fields to review:',
                  'ئاگاداری ڕێنمایی (ڕێگر نییە لە پەسەندکردن) — پێشنیار دەکرێت ئەم خانانە پڕبکرێنەوە:'
                )}
              </span>
            </div>
            <ul className="list-disc list-inside space-y-0.5 font-semibold text-muted-foreground-1">
              {missingLockFields.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {(addendaFailedCount > 0 || flowsheetFailedCount > 0) && (
          <div className="p-3.5 rounded-2xl bg-card shadow-2xs text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0" />
            <span>
              {bi(
                `تحذير سلامة البيانات: تعذر فك تشفير (${addendaFailedCount + flowsheetFailedCount}) سجل مرتبط بهذه الجلسة أو الحلقة.`,
                `Data integrity warning: (${addendaFailedCount + flowsheetFailedCount}) related record(s) failed decryption.`,
                `ئاگاداری سەلامەتیی زانیاری: کردنەوەی کۆدی (${addendaFailedCount + flowsheetFailedCount}) تۆماری پەیوەست بەم دانیشتنە شکستی هێنا.`
              )}
            </span>
          </div>
        )}

        {sealStatus === 'mismatch' && sealMismatchWarning && (
          <div className="p-4 rounded-2xl bg-card shadow-2xs text-xs text-rose-700 dark:text-rose-400 flex items-center gap-2.5 font-bold">
            <AlertCircle className="size-5 text-rose-600 dark:text-rose-400 shrink-0" />
            <span>{sealMismatchWarning}</span>
          </div>
        )}

        {sealStatus === 'unsealed' && unsealedNotice && (
          <div className="p-3.5 rounded-2xl bg-surface border border-line-2 text-xs text-foreground flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>{unsealedNotice}</span>
          </div>
        )}

        {soapRecord?.data.legacyReviewedAt ? (
          <div className="p-3.5 rounded-2xl bg-card shadow-2xs text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-2 font-semibold">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>
              {bi(
                `تمت مراجعة هذه المسودة المنشأة بإصدار أقدم بتاريخ ${formatClinicalDate(
                  soapRecord.data.legacyReviewedAt,
                  language,
                  { includeTime: true }
                )}${
                  soapRecord.data.legacyReviewedBy
                    ? ` (مسجل بواسطة: ${soapRecord.data.legacyReviewedBy})`
                    : ''
                }.`,
                `Legacy draft reviewed on ${formatClinicalDate(
                  soapRecord.data.legacyReviewedAt,
                  language,
                  { includeTime: true }
                )}${
                  soapRecord.data.legacyReviewedBy
                    ? ` (Recorded by: ${soapRecord.data.legacyReviewedBy})`
                    : ''
                }.`,
                `پێداچوونەوە بۆ ئەم ڕەشنووسە کۆنە کرا لە ڕێکەوتی ${formatClinicalDate(
                  soapRecord.data.legacyReviewedAt,
                  language,
                  { includeTime: true }
                )}${
                  soapRecord.data.legacyReviewedBy
                    ? ` (تۆمارکراو لەلایەن: ${soapRecord.data.legacyReviewedBy})`
                    : ''
                }.`
              )}
            </span>
          </div>
        ) : (
          (soapRecord?.data.legacyUnreviewed || isLegacyDraftOrigin) && (
            <div className="p-4 rounded-2xl bg-card shadow-2xs text-xs text-amber-700 dark:text-amber-400 space-y-2.5">
              <div className="flex items-center gap-2 font-bold">
                <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>
                  {bi(
                    'تنبيه مراجعة سريرية: تم إنشاء محتوى هذه الملاحظة بواسطة إصدار أقدم من النظام، يرجى مراجعته قبل الاعتماد عليه (Content created by an older version, review before relying on it).',
                    'Clinical review notice: Content created by an older version, review before relying on it.',
                    'ئاگاداری پێداچوونەوەی کلینیکی: ناوەڕۆکی ئەم تۆمارە بە وەشانێکی کۆنتری سیستەم دروست کراوە، تکایە پێش پشتبەستن پێی پێداچوونەوەی بۆ بکە.'
                  )}
                </span>
              </div>

              {requiresLegacyReview && (
                <label className="flex items-center gap-2 pt-1 cursor-pointer select-none font-bold text-amber-950 dark:text-amber-100">
                  <input
                    type="checkbox"
                    checked={formState.legacyDraftReviewed}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setFormState((prev) => ({ ...prev, legacyDraftReviewed: checked }));
                      setMissingLockFields([]);
                    }}
                    className="size-4 rounded border-line-2 text-primary focus:ring-primary cursor-pointer"
                  />
                  <span>
                    {bi(
                      'لقد راجعت محتوى هذه المسودة القديمة وأؤكد صحته قبل الاعتماد والقفل (I reviewed this)',
                      'I have reviewed this legacy draft and confirm its accuracy before Sign & Lock (I reviewed this)',
                      'پێداچوونەوەم بۆ ناوەڕۆکی ئەم ڕەشنووسە کۆنە کردووە و دروستییەکەی پێش پەسەندکردن و قفڵکردن دووپات دەکەمەوە'
                    )}
                  </span>
                </label>
              )}
            </div>
          )
        )}

        {soapRecord?.data.repairedDuringMigration && !soapRecord?.data.legacyUnreviewed && (
          <div className="p-3 rounded-xl bg-card shadow-2xs text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2">
            <ShieldCheck className="size-4 shrink-0" />
            <span>
              {bi(
                'تم إصلاح ومزامنة قفل الاعتماد لهذه الملاحظة تلقائياً أثناء الترحيل بناءً على حالة اعتماد الجلسة.',
                'Finalization lock on this SOAP note was automatically repaired during migration to match the finalized session.',
                'قفڵی پەسەندکردنی ئەم تۆماری SOAPـە بە خۆکاری چاککرایەوە لە کاتی گواستنەوەدا بەپێی باری پەسەندکردنی دانیشتنەکە.'
              )}
            </span>
          </div>
        )}

        {/* Quick SOAP Bar: Copy-Forward Notice + Custom Favorite Chips */}
        {!isLocked && (
          <div className="p-4 sm:p-5 rounded-2xl bg-card border border-card-line shadow-2xs space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-2.5 text-xs">
                <div className="size-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Sparkles className="size-4" />
                </div>
                <div>
                  <span className="font-bold text-foreground block">
                    {bi('أدوات التوثيق السريع (Quick SOAP)', 'Quick SOAP Helpers', 'ئامرازەکانی تۆمارکردنی خێرا (Quick SOAP)')}
                  </span>
                  {copiedFromInfo && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 font-semibold mt-0.5">
                      <Copy className="size-3" />
                      <span>
                        {bi(
                          `تم النسخ المسبق من الجلسة #${copiedFromInfo.sessionNumber} — راجع الحقول وعدّل ما تغير`,
                          `Copied forward from Session #${copiedFromInfo.sessionNumber} — review fields`,
                          `پێشوەختە لە دانیشتنی #${copiedFromInfo.sessionNumber} کۆپی کرا — خانەکان بپشکنە و گۆڕاوەکان چاک بکە`
                        )}
                      </span>
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {copiedFromInfo ? (
                  <button
                    type="button"
                    onClick={handleResetCopiedFields}
                    className="px-3 py-1.5 rounded-xl bg-surface hover:bg-layer-hover border border-line-2 text-xs font-semibold text-foreground inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <RotateCcw className="size-3.5" />
                    <span>{bi('إفراغ المنسوخ', 'Clear Copied', 'سڕینەوەی کۆپیکراو')}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleCopyPreviousSessionManual()}
                    className="px-3 py-1.5 rounded-xl bg-primary/10 hover:bg-primary/15 border border-primary/25 text-primary text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Copy className="size-3.5" />
                    <span>{bi('نسخ من الجلسة السابقة', 'Copy Last Session', 'کۆپیکردن لە دانیشتنی پێشوو')}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowChipEditorModal(true)}
                  className="px-3 py-1.5 rounded-xl bg-surface hover:bg-layer-hover border border-line-2 text-muted-foreground-1 hover:text-foreground text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <SlidersHorizontal className="size-3.5" />
                  <span>{bi('تخصيص البطاقات', 'Customize Chips', 'تایبەتمەندکردنی کارتەکان')}</span>
                </button>
              </div>
            </div>

            {favoriteChips.length > 0 && (
              <div className="pt-2.5 border-t border-card-divider space-y-1.5">
                <span className="text-xs text-muted-foreground-1 font-semibold block">
                  {bi('إدراج بلمسة واحدة:', '1-Tap Insert:', 'دانان بە یەک کرتە:')}
                </span>
                <div className="rounded-2xl border border-line-2 bg-surface/60 p-1 overflow-hidden">
                  <div className="pr-hscroll overflow-x-auto flex items-center gap-1.5 whitespace-nowrap pb-1 pt-0.5 px-0.5">
                    {favoriteChips.map((chip) => (
                      <button
                        key={chip.id}
                        type="button"
                        onClick={() => handleApplyFavoriteChip(chip)}
                        className="min-h-[34px] px-3 py-1 rounded-xl bg-primary/5 hover:bg-primary/12 border border-primary/15 hover:border-primary/35 text-xs font-semibold text-foreground hover:text-primary transition-all inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                      >
                        {chip.category === 'exercise' ? (
                          <Dumbbell className="size-3.5 text-emerald-600 shrink-0" />
                        ) : chip.category === 'manual' ? (
                          <Hand className="size-3.5 text-sky-600 shrink-0" />
                        ) : (
                          <Zap className="size-3.5 text-amber-500 shrink-0" />
                        )}
                        <span>+ {bi(chip.labelAr, chip.labelEn)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 1. SUBJECTIVE AXIS (المحور الذاتي — الألم والشكوى وتغير الأعراض) */}
        <div className="p-4 sm:p-6 rounded-2xl bg-card border border-card-line shadow-2xs space-y-4">
          <div className="flex items-center gap-2.5 border-b border-card-divider pb-3">
            <span className="size-7 rounded-xl bg-primary/10 text-primary font-black text-xs flex items-center justify-center shrink-0">
              1
            </span>
            <h2 className="text-sm font-bold text-foreground">
              {language === 'en' ? (
                'Subjective (S): Pre/Post Pain NPRS, Chief Complaint & Symptom Changes'
              ) : (
                <>
                  {bi(
                    'المحور الذاتي والألم والشكوى الرئيسية',
                    'Subjective (S): Pre/Post Pain NPRS, Chief Complaint & Symptom Changes',
                    'تەوەرەی خودی، ئازار و سکاڵای سەرەکی'
                  )}{' '}
                  <ClinicalAbbr code="SOAP" className="text-xs text-muted-foreground-1 ms-1" />
                </>
              )}
            </h2>
          </div>

          {/* Pre & Post Session Pain NPRS (Single-row 0-10 segmented control on desktop, slider on mobile; colored by severity) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Pre-Session Pain */}
            <div className="p-4 rounded-xl bg-surface border border-line-2">
              <NprsControl
                value={formState.prePainNotRecorded ? undefined : formState.prePainNrs}
                notRecorded={formState.prePainNotRecorded}
                showNotRecordedOption
                disabled={isLocked}
                label={bi('شدة الألم قبل الجلسة (NPRS 0–10):', 'Pre-Session Pain (NPRS 0–10):', 'توندی ئازار پێش دانیشتن (NPRS 0–10):')}
                onChange={(val) => {
                  loadRequestIdRef.current++;
                  setFormState((prev) => ({
                    ...prev,
                    prePainNrs: val,
                    prePainNotRecorded: false,
                  }));
                  setIsDirty(true);
                  setMissingLockFields([]);
                }}
                onToggleNotRecorded={() => {
                  loadRequestIdRef.current++;
                  setFormState((prev) => ({
                    ...prev,
                    prePainNrs: undefined,
                    prePainNotRecorded: !prev.prePainNotRecorded,
                  }));
                  setIsDirty(true);
                  setMissingLockFields([]);
                }}
              />
            </div>

            {/* Post-Session Pain */}
            <div className="p-4 rounded-xl bg-surface border border-line-2">
              <NprsControl
                value={formState.postPainNotRecorded ? undefined : formState.postPainNrs}
                notRecorded={formState.postPainNotRecorded}
                showNotRecordedOption
                disabled={isLocked}
                label={bi('شدة الألم بعد انتهاء الجلسة (NPRS 0–10):', 'Post-Session Pain (NPRS 0–10):', 'توندی ئازار دوای تەواوبوونی دانیشتن (NPRS 0–10):')}
                onChange={(val) => {
                  loadRequestIdRef.current++;
                  setFormState((prev) => ({
                    ...prev,
                    postPainNrs: val,
                    postPainNotRecorded: false,
                  }));
                  setIsDirty(true);
                  setMissingLockFields([]);
                }}
                onToggleNotRecorded={() => {
                  loadRequestIdRef.current++;
                  setFormState((prev) => ({
                    ...prev,
                    postPainNrs: undefined,
                    postPainNotRecorded: !prev.postPainNotRecorded,
                  }));
                  setIsDirty(true);
                  setMissingLockFields([]);
                }}
              />
            </div>
          </div>

          {formState.legacyPainDetail && (
            <div className="p-3 rounded-xl bg-surface border border-line-2 text-xs text-muted-foreground-2 flex flex-wrap items-center gap-3">
              <span className="font-bold text-muted-foreground-1">
                {bi(
                  'تفاصيل الألم المحفوظة من سجل سابق (قراءة فقط):',
                  'Preserved Legacy Pain Details (Read-Only):',
                  'وردەکاری ئازاری پارێزراو لە تۆمارێکی پێشووەوە (تەنها خوێندنەوە):'
                )}
              </span>
              {formState.legacyPainDetail.scoreAtRest !== undefined && (
                <span className="font-mono">
                  {bi('أثناء الراحة:', 'At Rest:', 'لە کاتی پشوودا:')}{' '}
                  <Fraction value={formState.legacyPainDetail.scoreAtRest} total={10} />
                </span>
              )}
              {formState.legacyPainDetail.scoreWithMovement !== undefined && (
                <span className="font-mono">
                  {bi('مع الحركة:', 'With Movement:', 'لە کاتی جووڵەدا:')}{' '}
                  <Fraction value={formState.legacyPainDetail.scoreWithMovement} total={10} />
                </span>
              )}
              {formState.legacyPainDetail.scoreBestLast24h !== undefined && (
                <span className="font-mono">
                  {bi('أفضل (24س):', 'Best (24h):', 'باشترین (٢٤ک):')}{' '}
                  <Fraction value={formState.legacyPainDetail.scoreBestLast24h} total={10} />
                </span>
              )}
              {formState.legacyPainDetail.scoreWorstLast24h !== undefined && (
                <span className="font-mono">
                  {bi('أسوأ (24س):', 'Worst (24h):', 'خراپترین (٢٤ک):')}{' '}
                  <Fraction value={formState.legacyPainDetail.scoreWorstLast24h} total={10} />
                </span>
              )}
              {formState.legacyPainDetail.contextNotes && (
                <span>
                  {bi('ملاحظات السياق:', 'Context:', 'تێبینییەکانی دۆخ:')}{' '}
                  {formState.legacyPainDetail.contextNotes}
                </span>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                <label htmlFor="soap-chief-complaint" className="text-xs font-semibold text-foreground">
                  {bi(
                    'الشكوى الحالية للمريض اليوم:',
                    'Chief Complaint (Subjective):',
                    'سکاڵای ئێستای نەخۆش ئەمڕۆ:'
                  )}
                </label>
                {renderCopiedFieldBadge('chiefComplaint')}
              </div>
              <AutoResizeTextarea
                id="soap-chief-complaint"
                minRows={2}
                snippetCategory="subjective"
                disabled={isLocked}
                value={formState.chiefComplaint}
                onChange={(e) => updateField('chiefComplaint', e.target.value)}
                placeholder={bi(
                  'اكتب شكوى المريض في بداية هذه الجلسة...',
                  'Enter patient chief complaint for today...',
                  'سکاڵای نەخۆش لە سەرەتای ئەم دانیشتنەدا بنووسە...'
                )}
                className={`w-full px-3 py-2 text-xs rounded-xl bg-layer border text-foreground focus:outline-none focus:border-primary ${
                  getCopiedFieldStatus('chiefComplaint') === 'copied'
                    ? 'border-amber-500/50 bg-amber-500/5'
                    : getCopiedFieldStatus('chiefComplaint') === 'edited'
                      ? 'border-emerald-500/50'
                      : 'border-layer-line'
                }`}
              />
            </div>

            <div>
              <label htmlFor="soap-symptom-changes" className="text-xs font-semibold text-foreground block mb-1.5">
                {bi(
                  'تغير الأعراض منذ الجلسة السابقة:',
                  'Symptom Changes Since Last Session:',
                  'گۆڕانی نیشانەکان لە دانیشتنی پێشووەوە:'
                )}
              </label>
              <AutoResizeTextarea
                id="soap-symptom-changes"
                minRows={2}
                snippetCategory="subjective"
                disabled={isLocked}
                value={formState.symptomChanges}
                onChange={(e) => updateField('symptomChanges', e.target.value)}
                placeholder={bi(
                  'تحسن أو تراجع الأعراض، النوم، الالتزام بالتمارين...',
                  'Symptom changes, sleep quality, HEP compliance...',
                  'باشبوون یان خراپتربوونی نیشانەکان، خەو، پابەندبوون بە ڕاهێنان...'
                )}
                className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
              />
            </div>
          </div>
        </div>

        {/* 2. OBJECTIVE AXIS — Structured Exercise Flowsheet */}
        <div className="p-4 sm:p-6 rounded-2xl bg-card border border-card-line shadow-2xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-card-divider pb-3">
            <div className="flex items-center gap-2.5">
              <span className="size-7 rounded-xl bg-primary/10 text-primary font-black text-xs flex items-center justify-center shrink-0">
                2
              </span>
              <h2 className="text-sm font-bold text-foreground">
                {bi(
                  'جدول التمارين العلاجية المنفذة في الجلسة',
                  'Therapeutic Exercise Flowsheet (Sets × Reps × Hold × Load)',
                  'خشتەی ڕاهێنانە چارەسەرییە ئەنجامدراوەکانی دانیشتن'
                )}
              </h2>
            </div>

            {!isLocked && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleCarryForwardPreviousFlowsheet()}
                  className="py-1.5 px-3 rounded-xl bg-layer hover:bg-layer-hover border border-layer-line text-layer-foreground text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Copy className="size-3.5 text-primary" />
                  <span>{bi('نسخ تمارين الجلسة السابقة', 'Copy Previous Flowsheet', 'کۆپیکردنی ڕاهێنانەکانی دانیشتنی پێشوو')}</span>
                </button>

                <select
                  value={selectedCatalogExId}
                  onChange={(e) => setSelectedCatalogExId(e.target.value)}
                  aria-label={bi('اختر تمريناً من الكتالوج', 'Select exercise from catalog', 'ڕاهێنانێک لە کەتەلۆگ هەڵبژێرە')}
                  className="py-1.5 px-2.5 rounded-xl text-xs bg-layer border border-layer-line text-foreground min-w-[200px] max-w-full sm:max-w-sm"
                >
                  {(() => {
                    const REGION_LABELS: Record<string, { ar: string; en: string }> = {
                      cervical: { ar: 'العنق والفقرات العنقية', en: 'Cervical Spine' },
                      shoulder: { ar: 'الكتف ولوح الكتف', en: 'Shoulder & Scapula' },
                      elbow_wrist: { ar: 'المرفق والرسغ واليد', en: 'Elbow & Wrist' },
                      thoracic_lumbar: { ar: 'الظهر والفقرات القطنية', en: 'Thoracic & Lumbar' },
                      hip_pelvis: { ar: 'الحوض والورك', en: 'Hip & Pelvis' },
                      knee: { ar: 'الركبة', en: 'Knee' },
                      ankle_foot: { ar: 'الكاحل والقدم', en: 'Ankle & Foot' },
                      neuro_balance: { ar: 'التوازن والأعصاب والوظائف', en: 'Balance & Functional' },
                    };
                    const grouped = PT_EXERCISE_CATALOG.reduce<Record<string, typeof PT_EXERCISE_CATALOG>>((acc, item) => {
                      const reg = item.region || 'neuro_balance';
                      if (!acc[reg]) acc[reg] = [];
                      acc[reg].push(item);
                      return acc;
                    }, {});
                    return Object.entries(grouped).map(([reg, items]) => {
                      const label = REGION_LABELS[reg] || { ar: reg, en: reg };
                      return (
                        <optgroup key={reg} label={bi(label.ar, label.en)}>
                          {items.map((ex) => (
                            <option key={ex.id} value={ex.id}>
                              {bi(ex.nameAr, ex.nameEn)}
                            </option>
                          ))}
                        </optgroup>
                      );
                    });
                  })()}
                </select>

                <button
                  type="button"
                  onClick={handleAddExerciseFromCatalog}
                  className="py-1.5 px-3 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="size-3.5" />
                  <span>{bi('إدراج تمرين', 'Add Exercise', 'زیادکردنی ڕاهێنان')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (isLocked) return;
                    const entry: FlowsheetExerciseEntry = {
                      id: crypto.randomUUID(),
                      exerciseId: undefined,
                      nameAr: '',
                      nameEn: '',
                      region: 'neuro_balance',
                      sets: 3,
                      reps: 10,
                      holdSeconds: 0,
                      loadOrBand: 'Bodyweight',
                      rpeOrPainResponse: 'pain_free',
                    };
                    updateField('exercises', [...formState.exercises, entry]);
                  }}
                  className="py-1.5 px-3 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="size-3.5" />
                  <span>{bi('إضافة يدوي', 'Manual Exercise', 'زیادکردنی دەستی')}</span>
                </button>
              </div>
            )}
          </div>

          {formState.exercises.length === 0 ? (
            <p className="text-xs text-muted-foreground-1 text-center py-4">
              {bi(
                'أدرج التمارين المنفذة اليوم أو انقر على "نسخ تمارين الجلسة السابقة" لتوثيق التدرج في الأوزان والتكرارات.',
                'Add exercises from catalog or copy previous session flowsheet.',
                'ڕاهێنانە ئەنجامدراوەکانی ئەمڕۆ دابنێ یان کرتە لە «کۆپیکردنی ڕاهێنانەکانی دانیشتنی پێشوو» بکە بۆ تۆمارکردنی پێشکەوتن.'
              )}
            </p>
          ) : (
            <div
              tabIndex={0}
              aria-label={bi('جدول التمارين العلاجية', 'Therapeutic exercise flowsheet table')}
              className="overflow-x-auto -mx-2 px-2 focus:outline-none"
            >
              <table className="pr-responsive-table w-full text-start text-xs border-collapse">
                <thead>
                  <tr className="bg-muted/50 border-b border-card-divider text-muted-foreground-1 font-semibold">
                    <th className="py-2.5 px-3 text-start">{bi('التمرين العلاجي', 'Exercise', 'ڕاهێنانی چارەسەری')}</th>
                    <th className="py-2.5 px-3 text-center w-24">
                      {bi('جولات (1–20)', 'Sets (1–20)', 'گەڕ (١–٢٠)')}
                    </th>
                    <th className="py-2.5 px-3 text-center w-24">
                      {bi('تكرار (1–200)', 'Reps (1–200)', 'دووبارەبوونەوە (١–٢٠٠)')}
                    </th>
                    <th className="py-2.5 px-3 text-center w-28">
                      {bi('ثبات ث (0–600)', 'Hold s (0–600)', 'مانەوە چرکە (٠–٦٠٠)')}
                    </th>
                    <th className="py-2.5 px-3 text-start w-40">
                      {bi('المقاومة / الوزن', 'Load / Band', 'بەرگری / کێش')}
                    </th>
                    <th className="py-2.5 px-3 text-start w-36">
                      {bi('الاستجابة', 'Response', 'وەڵامدانەوە')}
                    </th>
                    <th className="py-2.5 px-2 text-end w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-card-divider tabular-nums">
                  {formState.exercises.map((ex, idx) => {
                    const setsKey = `${ex.id}_sets`;
                    const repsKey = `${ex.id}_reps`;
                    const holdKey = `${ex.id}_hold`;
                    return (
                      <tr key={ex.id} className="hover:bg-muted/30 transition-colors">
                        <td
                          data-label={bi('التمرين العلاجي', 'Exercise', 'ڕاهێنانی چارەسەری')}
                          className="py-2.5 px-3 font-bold text-foreground align-top pr-cell-primary md:table-cell"
                        >
                          {ex.exerciseId === undefined && !isLocked ? (
                            <input
                              type="text"
                              value={language !== 'en' ? ex.nameAr : ex.nameEn}
                              onChange={(e) => {
                                const updated = formState.exercises.map((x) =>
                                  x.id === ex.id
                                    ? { ...x, nameAr: e.target.value, nameEn: e.target.value }
                                    : x
                                );
                                updateField('exercises', updated);
                              }}
                              placeholder={bi('اسم التمرين', 'Exercise name', 'ناوی ڕاهێنان')}
                              className="w-full px-2 py-0.5 rounded-lg bg-layer border border-line-2 text-xs font-bold text-foreground placeholder:text-muted-foreground-2 focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                          ) : (
                            bi(ex.nameAr, ex.nameEn)
                          )}
                        </td>
                        <td
                          data-label={bi('جولات (1–20)', 'Sets (1–20)', 'گەڕ (١–٢٠)')}
                          className="py-2.5 px-3 align-top"
                        >
                          <input
                            type="number"
                            min={1}
                            max={20}
                            disabled={isLocked}
                            aria-label={`${bi(ex.nameAr, ex.nameEn)} — ${bi('جولات', 'Sets')}`}
                            value={
                              numericDrafts[setsKey] !== undefined
                                ? numericDrafts[setsKey]
                                : String(ex.sets)
                            }
                            onChange={(e) => {
                              const raw = e.target.value;
                              setNumericDrafts((prev) => ({ ...prev, [setsKey]: raw }));
                              const parsed = Number(raw);
                              if (
                                raw.trim() !== '' &&
                                Number.isInteger(parsed) &&
                                parsed >= 1 &&
                                parsed <= 20
                              ) {
                                const next = [...formState.exercises];
                                next[idx] = { ...ex, sets: parsed };
                                updateField('exercises', next);
                              } else {
                                setIsDirty(true);
                              }
                            }}
                            className={`w-24 sm:w-18 px-2 py-1 rounded-lg bg-surface border font-mono text-center text-foreground ${
                              numericErrors[setsKey]
                                ? 'border-rose-500 text-rose-600'
                                : 'border-layer-line'
                            }`}
                          />
                          {numericErrors[setsKey] && (
                            <p className="text-xs text-rose-600 mt-0.5">
                              {numericErrors[setsKey]}
                            </p>
                          )}
                        </td>
                        <td
                          data-label={bi('تكرار (1–200)', 'Reps (1–200)', 'دووبارەبوونەوە (١–٢٠٠)')}
                          className="py-2.5 px-3 align-top"
                        >
                          <input
                            type="number"
                            min={1}
                            max={200}
                            disabled={isLocked}
                            aria-label={`${bi(ex.nameAr, ex.nameEn)} — ${bi('تكرار', 'Reps')}`}
                            value={
                              numericDrafts[repsKey] !== undefined
                                ? numericDrafts[repsKey]
                                : String(ex.reps)
                            }
                            onChange={(e) => {
                              const raw = e.target.value;
                              setNumericDrafts((prev) => ({ ...prev, [repsKey]: raw }));
                              const parsed = Number(raw);
                              if (
                                raw.trim() !== '' &&
                                Number.isInteger(parsed) &&
                                parsed >= 1 &&
                                parsed <= 200
                              ) {
                                const next = [...formState.exercises];
                                next[idx] = { ...ex, reps: parsed };
                                updateField('exercises', next);
                              } else {
                                setIsDirty(true);
                              }
                            }}
                            className={`w-24 sm:w-18 px-2 py-1 rounded-lg bg-surface border font-mono text-center text-foreground ${
                              numericErrors[repsKey]
                                ? 'border-rose-500 text-rose-600'
                                : 'border-layer-line'
                            }`}
                          />
                          {numericErrors[repsKey] && (
                            <p className="text-xs text-rose-600 mt-0.5">
                              {numericErrors[repsKey]}
                            </p>
                          )}
                        </td>
                        <td
                          data-label={bi('ثبات ث (0–600)', 'Hold s (0–600)', 'مانەوە چرکە (٠–٦٠٠)')}
                          className="py-2.5 px-3 align-top"
                        >
                          <input
                            type="number"
                            min={0}
                            max={600}
                            disabled={isLocked}
                            aria-label={`${bi(ex.nameAr, ex.nameEn)} — ${bi('ثبات بالثواني', 'Hold seconds')}`}
                            value={
                              numericDrafts[holdKey] !== undefined
                                ? numericDrafts[holdKey]
                                : String(ex.holdSeconds)
                            }
                            onChange={(e) => {
                              const raw = e.target.value;
                              setNumericDrafts((prev) => ({ ...prev, [holdKey]: raw }));
                              const parsed = Number(raw);
                              if (
                                raw.trim() !== '' &&
                                Number.isInteger(parsed) &&
                                parsed >= 0 &&
                                parsed <= 600
                              ) {
                                const next = [...formState.exercises];
                                next[idx] = { ...ex, holdSeconds: parsed };
                                updateField('exercises', next);
                              } else {
                                setIsDirty(true);
                              }
                            }}
                            className={`w-24 sm:w-18 px-2 py-1 rounded-lg bg-surface border font-mono text-center text-foreground ${
                              numericErrors[holdKey]
                                ? 'border-rose-500 text-rose-600'
                                : 'border-layer-line'
                            }`}
                          />
                          {numericErrors[holdKey] && (
                            <p className="text-xs text-rose-600 mt-0.5">
                              {numericErrors[holdKey]}
                            </p>
                          )}
                        </td>
                        <td
                          data-label={bi('المقاومة / الوزن', 'Load / Band', 'بەرگری / کێش')}
                          className="py-2.5 px-3 align-top"
                        >
                          <input
                            type="text"
                            disabled={isLocked}
                            aria-label={`${bi(ex.nameAr, ex.nameEn)} — ${bi('المقاومة / الوزن', 'Load / Band')}`}
                            value={ex.loadOrBand}
                            onChange={(e) => {
                              const next = [...formState.exercises];
                              next[idx] = { ...ex, loadOrBand: e.target.value };
                              updateField('exercises', next);
                            }}
                            className="w-40 max-w-full sm:w-full px-2 py-1 rounded-lg bg-surface border border-layer-line font-mono text-foreground"
                          />
                        </td>
                        <td
                          data-label={bi('الاستجابة', 'Response', 'وەڵامدانەوە')}
                          className="py-2.5 px-3 align-top"
                        >
                          <select
                            disabled={isLocked}
                            aria-label={`${bi(ex.nameAr, ex.nameEn)} — ${bi('الاستجابة', 'Response')}`}
                            value={ex.rpeOrPainResponse}
                            onChange={(e) => {
                              const next = [...formState.exercises];
                              next[idx] = {
                                ...ex,
                                rpeOrPainResponse:
                                  e.target.value as FlowsheetExerciseEntry['rpeOrPainResponse'],
                              };
                              updateField('exercises', next);
                            }}
                            className="w-44 max-w-full sm:w-full px-2 py-1 rounded-lg bg-surface border border-layer-line text-foreground"
                          >
                            <option value="pain_free">{bi('دون ألم', 'Pain-free', 'بێ ئازار')}</option>
                            <option value="mild_discomfort">
                              {bi('شد خفيف مقبول', 'Mild discomfort', 'کەمێک نائاسوودەیی قبوڵکراو')}
                            </option>
                            <option value="painful_modified">
                              {bi('مؤلم - تم التعديل', 'Modified', 'بەئازار - دەستکاریکرا')}
                            </option>
                          </select>
                        </td>
                        <td className="py-2.5 px-2 text-end align-top">
                          {!isLocked && (
                            <button
                              type="button"
                              aria-label={`${bi('حذف التمرين', 'Remove exercise')}: ${bi(ex.nameAr, ex.nameEn)}`}
                              onClick={() =>
                                updateField(
                                  'exercises',
                                  formState.exercises.filter((item) => item.id !== ex.id)
                                )
                              }
                              className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg text-muted-foreground-2 hover:text-rose-600 p-1 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Manual Therapy & Physical Agents / Modalities Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Manual Therapy Box */}
          <div className="p-5 rounded-xl bg-card border border-card-line shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                <Hand className="w-4 h-4 text-primary" />
                <span>{bi('العلاج اليدوي', 'Manual Therapy', 'چارەسەری دەستی')}</span>
              </div>
              {!isLocked && (
                <button
                  type="button"
                  onClick={handleAddManualTherapy}
                  className="text-xs font-bold text-primary cursor-pointer"
                >
                  {bi('+ إضافة تقنية يدوية', '+ Add Technique', '+ زیادکردنی تەکنیکی دەستی')}
                </button>
              )}
            </div>

            {formState.manualTherapy.map((mt, idx) => {
              const durKey = `${mt.id}_duration`;
              return (
                <div
                  key={mt.id}
                  className="p-3 rounded-xl bg-muted/40 border border-card-line space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="text"
                      disabled={isLocked}
                      aria-label={bi('اسم التقنية اليدوية', 'Manual therapy technique', 'ناوی تەکنیکی چارەسەری دەستی')}
                      placeholder={bi('اسم التقنية اليدوية', 'Manual therapy technique', 'ناوی تەکنیکی چارەسەری دەستی')}
                      value={language !== 'en' ? mt.techniqueAr : mt.techniqueEn}
                      onChange={(e) => {
                        const next = [...formState.manualTherapy];
                        // Edit ONLY the active language while preserving the other language
                        next[idx] = language !== 'en'
                          ? { ...mt, techniqueAr: e.target.value }
                          : { ...mt, techniqueEn: e.target.value };
                        updateField('manualTherapy', next);
                      }}
                      className="flex-1 px-2.5 py-1 rounded-lg bg-surface border border-layer-line font-semibold text-foreground"
                    />
                    {!isLocked && (
                      <button
                        type="button"
                        aria-label={bi('حذف التقنية اليدوية', 'Remove manual therapy technique')}
                        onClick={() =>
                          updateField(
                            'manualTherapy',
                            formState.manualTherapy.filter((m) => m.id !== mt.id)
                          )
                        }
                        className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg text-muted-foreground-2 hover:text-rose-600 cursor-pointer p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label htmlFor={`mt-target-${mt.id}`} className="text-xs text-muted-foreground-1 block mb-0.5">
                        {bi('المفصل / النسيج المستهدف', 'Target Joint/Tissue', 'جومگە / شانەی ئامانج')}
                      </label>
                      <input
                        id={`mt-target-${mt.id}`}
                        type="text"
                        disabled={isLocked}
                        value={mt.targetJointOrTissue}
                        onChange={(e) => {
                          const next = [...formState.manualTherapy];
                          next[idx] = { ...mt, targetJointOrTissue: e.target.value };
                          updateField('manualTherapy', next);
                        }}
                        className="w-full px-2 py-1 rounded-lg bg-surface border border-layer-line text-foreground"
                      />
                    </div>

                    <div>
                      <label htmlFor={`mt-grade-${mt.id}`} className="text-xs text-muted-foreground-1 block mb-0.5">
                        {bi('الدرجة / الشدة', 'Grade', 'پلە / توندی')}
                      </label>
                      <select
                        id={`mt-grade-${mt.id}`}
                        disabled={isLocked}
                        value={mt.gradeOrIntensity}
                        onChange={(e) => {
                          const next = [...formState.manualTherapy];
                          next[idx] = {
                            ...mt,
                            gradeOrIntensity:
                              e.target.value as ManualTherapyFlowsheetEntry['gradeOrIntensity'],
                          };
                          updateField('manualTherapy', next);
                        }}
                        className="w-full px-2 py-1 rounded-lg bg-surface border border-layer-line font-mono text-foreground"
                      >
                        <option value="Grade I">Grade I</option>
                        <option value="Grade II">Grade II</option>
                        <option value="Grade III">Grade III</option>
                        <option value="Grade IV">Grade IV</option>
                        <option value="MWM">Mulligan MWM</option>
                        <option value="Soft Tissue">Myofascial</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor={`mt-duration-${mt.id}`} className="text-xs text-muted-foreground-1 block mb-0.5">
                        {bi('المدة (دقيقة 1–120)', 'Duration (m)', 'ماوە (١–١٢٠ خولەک)')}
                      </label>
                      <input
                        id={`mt-duration-${mt.id}`}
                        type="number"
                        min={1}
                        max={120}
                        disabled={isLocked}
                        value={
                          numericDrafts[durKey] !== undefined
                            ? numericDrafts[durKey]
                            : String(mt.durationMinutes)
                        }
                        onChange={(e) => {
                          const raw = e.target.value;
                          setNumericDrafts((prev) => ({ ...prev, [durKey]: raw }));
                          const parsed = Number(raw);
                          if (
                            raw.trim() !== '' &&
                            Number.isInteger(parsed) &&
                            parsed >= 1 &&
                            parsed <= 120
                          ) {
                            const next = [...formState.manualTherapy];
                            next[idx] = { ...mt, durationMinutes: parsed };
                            updateField('manualTherapy', next);
                          } else {
                            setIsDirty(true);
                          }
                        }}
                        className={`w-full px-2 py-1 rounded-lg bg-surface border font-mono text-center text-foreground ${
                          numericErrors[durKey]
                            ? 'border-rose-500 text-rose-600'
                            : 'border-layer-line'
                        }`}
                      />
                      {numericErrors[durKey] && (
                        <p className="text-xs text-rose-600 mt-0.5">
                          {numericErrors[durKey]}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Physical Agents / Electrotherapy Box */}
          <div className="p-5 rounded-xl bg-card border border-card-line shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                <Zap className="w-4 h-4 text-amber-500" />
                <span>
                  {bi('الأجهزة والوسائل الفيزيائية', 'Physical Modalities', 'ئامێر و شێوازە فیزیاییەکان')}
                </span>
              </div>
            </div>

            {!isLocked && (
              <div className="rounded-2xl border border-line-2 bg-surface/60 p-1 overflow-hidden">
                <div className="pr-hscroll overflow-x-auto flex items-center gap-1.5 whitespace-nowrap pb-1 pt-0.5 px-0.5">
                  {[
                    {
                      mod: 'TENS' as const,
                      ar: 'تحفيز كهربائي مسكن TENS',
                      ckb: 'وریاکردنەوەی کارەبایی ئازارشکێن TENS',
                      params: '100Hz, 150µs',
                    },
                    {
                      mod: 'Ultrasound' as const,
                      ar: 'أمواج فوق صوتية',
                      ckb: 'شەپۆلی سەروودەنگ',
                      params: '1MHz, 1.2 W/cm²',
                    },
                    {
                      mod: 'NMES' as const,
                      ar: 'تحفيز عضلي كهربائي NMES',
                      ckb: 'وریاکردنەوەی ماسولکەیی کارەبایی NMES',
                      params: '50Hz, 10s/30s',
                    },
                    {
                      mod: 'HotPack' as const,
                      ar: 'كمادات ساخنة (حرارة سطحية)',
                      ckb: 'پەستانی گەرم (گەرمی ڕووکەش)',
                      params: 'Hydrocollator 15m',
                    },
                    {
                      mod: 'Shortwave' as const,
                      ar: 'موجات قصيرة (SWD)',
                      ckb: 'شەپۆلی کورت (SWD)',
                      params: 'Pulsed / Continuous',
                    },
                    {
                      mod: 'DryNeedling' as const,
                      ar: 'وخز بالإبر الجافة',
                      ckb: 'دەرزی وشک (Dry Needling)',
                      params: 'Trigger Points',
                    },
                    {
                      mod: 'Cryotherapy' as const,
                      ar: 'كمادات باردة',
                      ckb: 'پەستانی سارد',
                      params: 'Cold pack',
                    },
                    {
                      mod: 'Traction' as const,
                      ar: 'شد فقري / ميكانيكي',
                      ckb: 'کێشانی بڕبڕە / میکانیکی',
                      params: 'Intermittent traction',
                    },
                  ].map((btn) => (
                    <button
                      key={btn.mod}
                      type="button"
                      data-testid={`add-modality-${btn.mod}`}
                      onClick={() => handleAddPhysicalAgent(btn.mod, btn.ar, btn.params)}
                      className="px-3 py-1.5 rounded-xl bg-card hover:bg-primary/10 hover:text-primary border border-line-2/70 text-xs font-semibold text-foreground transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      + {bi(btn.ar, btn.mod, btn.ckb)}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={handleAddManualPhysicalAgent}
                    className="px-3 py-1.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    + {bi('إضافة يدوي', 'Manual Entry', 'زیادکردنی دەستی')}
                  </button>
                </div>
              </div>
            )}
            {formState.modalitySafetyOverrides.length > 0 && (
              <div
                data-testid="session-modality-overrides-list"
                className="p-2.5 rounded-xl bg-card shadow-2xs space-y-1 text-xs"
              >
                <div className="font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  <span>
                    {bi(
                      'تجاوزات سلامة الوسائل الفيزيائية الموثقة:',
                      'Documented Modality Safety Overrides:',
                      'تێپەڕاندنە تۆمارکراوەکانی سەلامەتی ئامێرە فیزیاییەکان:'
                    )}
                  </span>
                </div>
                {formState.modalitySafetyOverrides.map((ov) => (
                  <div key={ov.id} className="text-foreground">
                    <span className="font-bold">{ov.modality}</span> ·{' '}
                    <span>{ov.overrideReason}</span>{' '}
                    <span className="text-muted-foreground-1">({ov.overriddenBy})</span>
                  </div>
                ))}
              </div>
            )}

            {formState.physicalAgents.map((pa, idx) => {
              const durKey = `${pa.id}_duration`;
              const isDefaultPrefill = Boolean(prefillParameterIds[pa.id]);
              return (
                <div
                  key={pa.id}
                  className="p-3 rounded-xl bg-muted/40 border border-card-line space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-primary">
                      {pa.modality === 'Other' && !isLocked ? (
                        <input
                          type="text"
                          value={pa.modalityAr}
                          onChange={(e) => {
                            const updated = formState.physicalAgents.map((p) =>
                              p.id === pa.id ? { ...p, modalityAr: e.target.value } : p
                            );
                            updateField('physicalAgents', updated);
                          }}
                          placeholder={bi('اسم الجهاز / الوسيلة', 'Modality name', 'ناوی ئامێر')}
                          className="w-full px-2 py-0.5 rounded-lg bg-layer border border-line-2 text-xs font-bold text-primary placeholder:text-muted-foreground-2 focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      ) : (
                        bi(pa.modalityAr || pa.modality, pa.modality)
                      )}
                    </span>
                    <div className="flex items-center gap-2">
                      {isDefaultPrefill && (
                        <span className="text-amber-700 dark:text-amber-400 text-xs font-bold">
                          {bi('افتراضي — يرجى التحقق (default - verify)', 'default - verify', 'بنەڕەتی — تکایە دڵنیابە (default - verify)')}
                        </span>
                      )}
                      {!isLocked && (
                        <button
                          type="button"
                          aria-label={`${bi('حذف الجهاز', 'Remove modality')}: ${bi(pa.modalityAr, pa.modality)}`}
                          onClick={() =>
                            updateField(
                              'physicalAgents',
                              formState.physicalAgents.filter((p) => p.id !== pa.id)
                            )
                          }
                          className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg text-muted-foreground-2 hover:text-rose-600 cursor-pointer p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label htmlFor={`pa-site-${pa.id}`} className="text-xs text-muted-foreground-1 block mb-0.5">
                        {bi('المنطقة المستهدفة (Site)', 'Target Site', 'شوێنی ئامانج (Site)')}
                      </label>
                      <input
                        id={`pa-site-${pa.id}`}
                        type="text"
                        disabled={isLocked}
                        value={pa.site}
                        onChange={(e) => {
                          const next = [...formState.physicalAgents];
                          next[idx] = { ...pa, site: e.target.value };
                          updateField('physicalAgents', next);
                        }}
                        className="w-full px-2 py-1 rounded-lg bg-surface border border-layer-line text-foreground"
                      />
                    </div>

                    <div>
                      <label htmlFor={`pa-params-${pa.id}`} className="text-xs text-muted-foreground-1 block mb-0.5">
                        {bi('المعاملات (Parameters)', 'Parameters', 'پێوەرەکان (Parameters)')}
                      </label>
                      <input
                        id={`pa-params-${pa.id}`}
                        type="text"
                        disabled={isLocked}
                        value={pa.parameters}
                        onChange={(e) => {
                          setPrefillParameterIds((prev) => ({ ...prev, [pa.id]: false }));
                          const next = [...formState.physicalAgents];
                          next[idx] = { ...pa, parameters: e.target.value };
                          updateField('physicalAgents', next);
                        }}
                        className="w-full px-2 py-1 rounded-lg bg-surface border border-layer-line font-mono text-xs text-foreground"
                      />
                    </div>

                    <div>
                      <label htmlFor={`pa-duration-${pa.id}`} className="text-xs text-muted-foreground-1 block mb-0.5">
                        {bi('المدة (دقيقة 1–120)', 'Duration (m)', 'ماوە (خولەک ١–١٢٠)')}
                      </label>
                      <input
                        id={`pa-duration-${pa.id}`}
                        type="number"
                        min={1}
                        max={120}
                        disabled={isLocked}
                        value={
                          numericDrafts[durKey] !== undefined
                            ? numericDrafts[durKey]
                            : String(pa.durationMinutes)
                        }
                        onChange={(e) => {
                          const raw = e.target.value;
                          setNumericDrafts((prev) => ({ ...prev, [durKey]: raw }));
                          const parsed = Number(raw);
                          if (
                            raw.trim() !== '' &&
                            Number.isInteger(parsed) &&
                            parsed >= 1 &&
                            parsed <= 120
                          ) {
                            const next = [...formState.physicalAgents];
                            next[idx] = { ...pa, durationMinutes: parsed };
                            updateField('physicalAgents', next);
                          } else {
                            setIsDirty(true);
                          }
                        }}
                        className={`w-full px-2 py-1 rounded-lg bg-surface border font-mono text-center text-foreground ${
                          numericErrors[durKey]
                            ? 'border-rose-500 text-rose-600'
                            : 'border-layer-line'
                        }`}
                      />
                      {numericErrors[durKey] && (
                        <p className="text-xs text-rose-600 mt-0.5">
                          {numericErrors[durKey]}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 3. OBJECTIVE FREE-TEXT & DERIVED FLOWSHEET SUMMARY */}
        <div className="p-4 sm:p-6 rounded-2xl bg-card border border-card-line shadow-2xs space-y-4">
          <div className="flex items-center gap-2.5 border-b border-card-divider pb-3">
            <span className="size-7 rounded-xl bg-primary/10 text-primary font-black text-xs flex items-center justify-center shrink-0">
              3
            </span>
            <h2 className="text-sm font-bold text-foreground">
              {bi(
                'الملاحظات الموضوعية وملخص التدخلات الحر',
                'Objective (O): Clinical Observations & Therapist Free-Text Interventions',
                'تێبینییە بابەتییەکان و پوختەی ئازادی دەستێوەردانەکان'
              )}
            </h2>
          </div>

          {derivedFlowsheetSummary && (
            <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-xs space-y-1">
              <span className="font-bold text-primary block">
                {bi(
                  'ملخص جدول التمارين والأجهزة المشتق تلقائياً (للعرض والتصدير فقط — لا يُخزّن كمدخل نصي مكرر):',
                  'Derived Flowsheet Summary (Render/Export Preview Only — never duplicated into free-text):',
                  'پوختەی خۆکاری خشتەی ڕاهێنان و ئامێرەکان (تەنها بۆ پیشاندان و هەناردن — وەک دەقی دووبارە پاشەکەوت ناکرێت):'
                )}
              </span>
              <p className="text-foreground font-mono text-xs">
                {derivedFlowsheetSummary}
              </p>
            </div>
          )}

          {formState.legacyCompiledSummary && (
            <div className="p-3 rounded-xl bg-muted border border-card-line text-xs space-y-1">
              <span className="font-bold text-muted-foreground-1 block">
                {bi(
                  'ملخص مجمع سابق محفوظ من إصدار أقدم (للقراءة فقط):',
                  'Legacy Stored Compiled Summary (Read-Only):',
                  'پوختەی کۆکراوەی پێشووی هەڵگیراو لە وەشانێکی کۆنتر (تەنها خوێندنەوە):'
                )}
              </span>
              <p className="text-foreground font-mono text-xs">
                {formState.legacyCompiledSummary}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <label htmlFor="soap-interventions-summary" className="text-xs font-bold text-foreground">
                  {bi(
                    'ملخص التدخلات الحر للمعالج:',
                    'Therapist Free-Text Interventions Summary:',
                    'پوختەی ئازادی دەستێوەردانەکانی چارەسەرکار:'
                  )}
                </label>
                {renderCopiedFieldBadge('interventionsSummary')}
              </div>
              <AutoResizeTextarea
                id="soap-interventions-summary"
                minRows={2}
                disabled={isLocked}
                value={formState.interventionsSummary}
                onChange={(e) => updateField('interventionsSummary', e.target.value)}
                placeholder={bi(
                  'اكتب أي تدخلات إضافية أو تفاصيل علاجية حرة نفذها المعالج...',
                  'Enter therapist free-text intervention details...',
                  'هەر دەستێوەردان یان وردەکارییەکی چارەسەریی زیادە کە چارەسەرکار ئەنجامی داوە بنووسە...'
                )}
                className={`w-full px-3 py-2 text-xs rounded-lg bg-surface border text-foreground focus:outline-hidden focus:border-primary ${
                  getCopiedFieldStatus('interventionsSummary') === 'copied'
                    ? 'border-amber-500/50 bg-amber-500/5'
                    : getCopiedFieldStatus('interventionsSummary') === 'edited'
                      ? 'border-emerald-500/50'
                      : 'border-layer-line'
                }`}
              />
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <label htmlFor="soap-clinical-observations" className="text-xs font-bold text-foreground">
                  {bi(
                    'المشاهدات والفحص السريري الموضوعي:',
                    'Clinical Observations (Objective):',
                    'تێبینییە کلینیکییە بابەتییەکان (Objective):'
                  )}
                </label>
                {renderCopiedFieldBadge('clinicalObservations')}
              </div>
              <AutoResizeTextarea
                id="soap-clinical-observations"
                minRows={2}
                disabled={isLocked}
                value={formState.clinicalObservations}
                onChange={(e) => updateField('clinicalObservations', e.target.value)}
                placeholder={bi(
                  'ملاحظات القوام، المشية، التورم، الجس، أو المدى الحركي...',
                  'Posture, gait, edema, palpation, or ROM observations...',
                  'تێبینییەکانی شێوازی جەستە، ڕۆیشتن، ئاوسان، دەستلێدان یان مەودای جووڵە...'
                )}
                className={`w-full px-3 py-2 text-xs rounded-lg bg-surface border text-foreground focus:outline-hidden focus:border-primary ${
                  getCopiedFieldStatus('clinicalObservations') === 'copied'
                    ? 'border-amber-500/50 bg-amber-500/5'
                    : getCopiedFieldStatus('clinicalObservations') === 'edited'
                      ? 'border-emerald-500/50'
                      : 'border-layer-line'
                }`}
              />
            </div>
          </div>

          {enableVitalsModule && (
            <Suspense fallback={null}>
              <VitalsPanel
                value={formState.vitals}
                history={
                  ClinicOperationsService.getEpisodeClinicalStore(session.episodeId, patientId)
                    .vitalsHistory || []
                }
                onChange={(v) => updateField('vitals', v)}
                readOnly={isLocked}
              />
            </Suspense>
          )}
        </div>

        {/* 4. ASSESSMENT & PLAN AXES (التقييم والانطباع السريري والخطة القادمة) */}
        <div className="p-4 sm:p-6 rounded-2xl bg-card border border-card-line shadow-2xs space-y-4">
          <div className="flex items-center gap-2.5 border-b border-card-divider pb-3">
            <span className="size-7 rounded-xl bg-primary/10 text-primary font-black text-xs flex items-center justify-center shrink-0">
              4
            </span>
            <h2 className="text-sm font-bold text-foreground">
              {bi(
                'التقييم السريري والخطة العلاجية القادمة',
                'Assessment (A) & Plan (P)',
                'هەڵسەنگاندنی کلینیکی و پلانی چارەسەری داهاتوو'
              )}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1">
              <label htmlFor="soap-progress-status" className="text-xs font-bold text-foreground block mb-1">
                {bi('مسار تقدم الحالة *:', 'Progress Status *:', 'ڕەوتی پێشکەوتنی بارودۆخ *:')}
              </label>
              <select
                id="soap-progress-status"
                disabled={isLocked}
                value={formState.progressStatus}
                onChange={(e) =>
                  updateField('progressStatus', e.target.value as ProgressStatusOption)
                }
                className="w-full px-3 py-2 text-xs rounded-lg bg-surface border border-layer-line text-foreground focus:outline-hidden focus:border-primary"
              >
                <option value="">
                  {bi('— اختر مسار تقدم الحالة —', '— Select progress status —', '— ڕەوتی پێشکەوتن هەڵبژێرە —')}
                </option>
                <option value="improved">{bi('تحسن ملحوظ', 'Improved', 'باشبوونی بەرچاو')}</option>
                <option value="unchanged">
                  {bi('دون تغيير', 'Unchanged', 'بێ گۆڕان')}
                </option>
                <option value="plateau">
                  {bi('استقرار / ثبات مرحلي', 'Plateau', 'جێگیربوون / وەستانی قۆناغی')}
                </option>
                <option value="regressed">
                  {bi('تراجع في الأعراض', 'Regressed', 'خراپتربوونی نیشانەکان')}
                </option>
              </select>
            </div>

            <div className="md:col-span-1">
              <label htmlFor="soap-patient-tolerance" className="text-xs font-bold text-foreground block mb-1">
                {bi('تحمّل المريض للجلسة:', 'Patient Tolerance:', 'بەرگەگرتنی نەخۆش بۆ دانیشتن:')}
              </label>
              <select
                id="soap-patient-tolerance"
                disabled={isLocked}
                value={formState.patientTolerance}
                onChange={(e) =>
                  updateField('patientTolerance', e.target.value as PatientToleranceOption)
                }
                className="w-full px-3 py-2 text-xs rounded-lg bg-surface border border-layer-line text-foreground focus:outline-hidden focus:border-primary"
              >
                <option value="">
                  {bi('— اختر تحمّل المريض —', '— Select patient tolerance —', '— بەرگەگرتنی نەخۆش هەڵبژێرە —')}
                </option>
                <option value="well_tolerated">
                  {bi('تحمّل ممتاز / جيد', 'Well tolerated', 'بەرگەگرتنی زۆر باش / باش')}
                </option>
                <option value="moderate_fatigue">
                  {bi('إجهاد متوسط', 'Moderate fatigue', 'ماندوبوونی مامناوەند')}
                </option>
                <option value="poorly_tolerated">
                  {bi('ضعف تحمّل / ألم', 'Poorly tolerated', 'بەرگەگرتنی لاواز / ئازار')}
                </option>
              </select>
            </div>

            <div className="md:col-span-1">
              <label htmlFor="soap-recorded-by" className="text-xs font-bold text-foreground block mb-1">
                {bi('مسجل بواسطة:', 'Recorded by:', 'تۆمارکراو لەلایەن:')}
              </label>
              <input
                id="soap-recorded-by"
                type="text"
                readOnly
                value={recordedByName}
                className="w-full px-3 py-2 text-xs rounded-lg bg-muted border border-layer-line text-muted-foreground-1 cursor-not-allowed"
              />
              <span className="text-xs text-muted-foreground-2 block mt-0.5">
                {bi(
                  'اسم مصرّح به ذاتياً من الكادر المحلي (ليس هوية مصادقاً عليها رقمياً)',
                  'Self-declared staff label (not authenticated identity)',
                  'ناوی ڕاگەیەنراوی خۆیی لە ستافی ناوخۆیی (ناسنامەی باوەڕپێکراوی دیجیتاڵی نییە)'
                )}
              </span>
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <label htmlFor="soap-clinical-impression" className="text-xs font-bold text-foreground">
                {bi(
                  'الانطباع والتفسير السريري للجلسة *:',
                  'Clinical Impression (Assessment) *:',
                  'تێڕوانین و لێکدانەوەی کلینیکیی دانیشتن *:'
                )}
              </label>
              {renderCopiedFieldBadge('clinicalImpression')}
            </div>
            <AutoResizeTextarea
              id="soap-clinical-impression"
              minRows={2}
              snippetCategory="assessment"
              disabled={isLocked}
              value={formState.clinicalImpression}
              onChange={(e) => updateField('clinicalImpression', e.target.value)}
              placeholder={bi(
                'اكتب التفسير السريري لاستجابة المريض في هذه الجلسة...',
                'Enter clinical reasoning and impression of patient response...',
                'لێکدانەوەی کلینیکی بۆ وەڵامدانەوەی نەخۆش لەم دانیشتنەدا بنووسە...'
              )}
              className={`w-full px-3 py-2 text-xs rounded-lg bg-surface border text-foreground focus:outline-hidden focus:border-primary ${
                getCopiedFieldStatus('clinicalImpression') === 'copied'
                  ? 'border-amber-500/50 bg-amber-500/5'
                  : getCopiedFieldStatus('clinicalImpression') === 'edited'
                    ? 'border-emerald-500/50'
                    : 'border-layer-line'
              }`}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <label htmlFor="soap-next-session-plan" className="text-xs font-bold text-foreground">
                  {bi(
                    'خطة الجلسة القادمة والتعديلات المقترحة:',
                    'Next Session Plan:',
                    'پلانی دانیشتنی داهاتوو و گۆڕانکارییە پێشنیارکراوەکان:'
                  )}
                </label>
                {renderCopiedFieldBadge('nextSessionPlan')}
              </div>
              <AutoResizeTextarea
                id="soap-next-session-plan"
                minRows={2}
                snippetCategory="plan"
                disabled={isLocked}
                value={formState.nextSessionPlan}
                onChange={(e) => updateField('nextSessionPlan', e.target.value)}
                placeholder={bi(
                  'خطة التدرج أو التعديل للجلسة القادمة...',
                  'Plan or progression for next session...',
                  'پلانی پێشکەوتن یان گۆڕانکاری بۆ دانیشتنی داهاتوو...'
                )}
                className={`w-full px-3 py-2 text-xs rounded-lg bg-surface border text-foreground focus:outline-hidden focus:border-primary ${
                  getCopiedFieldStatus('nextSessionPlan') === 'copied'
                    ? 'border-amber-500/50 bg-amber-500/5'
                    : getCopiedFieldStatus('nextSessionPlan') === 'edited'
                      ? 'border-emerald-500/50'
                      : 'border-layer-line'
                }`}
              />
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <label htmlFor="soap-home-instructions" className="text-xs font-bold text-foreground">
                  {language === 'en' ? (
                    'Home Instructions (HEP):'
                  ) : (
                    <>
                      {bi(
                        'التعليمات والبرنامج المنزلي',
                        'Home Instructions (HEP):',
                        'ڕێنماییەکان و بەرنامەی ماڵەوە'
                      )}{' '}
                      <ClinicalAbbr code="HEP" className="text-xs text-muted-foreground-1 ms-1" />:
                    </>
                  )}
                </label>
                {renderCopiedFieldBadge('homeInstructions')}
              </div>
              <AutoResizeTextarea
                id="soap-home-instructions"
                minRows={2}
                snippetCategory="plan"
                disabled={isLocked}
                value={formState.homeInstructions}
                onChange={(e) => updateField('homeInstructions', e.target.value)}
                placeholder={bi(
                  'تعليمات التمارين المنزلية أو الوقاية اليومية...',
                  'Home exercise instructions or daily precautions...',
                  'ڕێنمایی ڕاهێنانی ماڵەوە یان خۆپارێزی ڕۆژانە...'
                )}
                className={`w-full px-3 py-2 text-xs rounded-lg bg-surface border text-foreground focus:outline-hidden focus:border-primary ${
                  getCopiedFieldStatus('homeInstructions') === 'copied'
                    ? 'border-amber-500/50 bg-amber-500/5'
                    : getCopiedFieldStatus('homeInstructions') === 'edited'
                      ? 'border-emerald-500/50'
                      : 'border-layer-line'
                }`}
              />
            </div>
          </div>
        </div>

        {/* Append-Only Clinical Addenda Section (shown for finalized sessions) */}
        {isLocked && (
          <div className="p-5 rounded-xl bg-card border border-card-line shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-card-divider pb-3">
              <div className="flex items-center gap-2">
                <FilePlus2 className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-bold text-foreground">
                  {bi(
                    'الملاحق والتصحيحات السريرية (Append-Only Clinical Addenda)',
                    'Clinical Addenda (Append-Only Post-Finalization Amendments)',
                    'پاشکۆ و ڕاستکردنەوە کلینیکییەکان (Append-Only Clinical Addenda)'
                  )}
                </h2>
              </div>
              <span className="text-xs font-mono text-muted-foreground-1">
                {addenda.length} {bi('ملحق', 'addenda', 'پاشکۆ')}
              </span>
            </div>

            {addendaFailedCount > 0 && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  {bi(
                    `تنبيه: تعذر فك تشفير (${addendaFailedCount}) ملحق سريري مرتبط بهذه الجلسة.`,
                    `Warning: (${addendaFailedCount}) clinical addendum record(s) failed decryption.`,
                    `ئاگاداری: کردنەوەی کۆدی (${addendaFailedCount}) پاشکۆی کلینیکیی پەیوەست بەم دانیشتنە شکستی هێنا.`
                  )}
                </span>
              </div>
            )}

            {addenda.length > 0 && (
              <div className="space-y-2.5">
                {addenda.map((item) => {
                  const reasonInfo = ADDENDUM_REASONS[item.data.reasonForAmendment];
                  return (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-xl bg-muted/40 border border-card-line space-y-1.5 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground-1">
                        <span className="font-bold text-primary">
                          {reasonInfo ? bi(reasonInfo.ar, reasonInfo.en) : ''}
                        </span>
                        <span className="font-mono">
                          {bi('مسجل بواسطة: ', 'Recorded by: ', 'تۆمارکراو لەلایەن: ')}
                          {item.data.signedByTherapistName} ·{' '}
                          {formatClinicalDate(item.createdAt, language, { includeTime: true })}
                        </span>
                      </div>
                      <p className="text-foreground whitespace-pre-wrap">
                        {item.data.amendmentText}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            {soapRecord && (
              <form onSubmit={handleAddAddendum} className="space-y-3 pt-2">
                {addendumError && (
                  <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                    {addendumError}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="soap-addendum-reason" className="text-xs font-bold text-foreground block mb-1">
                      {bi('سبب الملحق السريري:', 'Reason for Addendum:', 'هۆکاری پاشکۆی کلینیکی:')}
                    </label>
                    <select
                      id="soap-addendum-reason"
                      value={addendumReason}
                      onChange={(e) => setAddendumReason(e.target.value as AddendumReason)}
                      className="w-full px-3 py-2 text-xs rounded-lg bg-surface border border-layer-line text-foreground"
                    >
                      {(Object.keys(ADDENDUM_REASONS) as AddendumReason[]).map((key) => (
                        <option key={key} value={key}>
                          {bi(ADDENDUM_REASONS[key].ar, ADDENDUM_REASONS[key].en)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="soap-addendum-recorded-by" className="text-xs font-bold text-foreground block mb-1">
                      {bi(
                        'مسجل بواسطة (Recorded by — قراءة فقط):',
                        'Recorded by (Read-Only Active Staff):',
                        'تۆمارکراو لەلایەن (تەنها خوێندنەوە):'
                      )}
                    </label>
                    <input
                      id="soap-addendum-recorded-by"
                      type="text"
                      value={recordedByName}
                      readOnly
                      className="w-full px-3 py-2 text-xs rounded-lg bg-muted border border-layer-line text-muted-foreground-1 cursor-not-allowed"
                    />
                    <span className="text-xs text-muted-foreground-2 block mt-0.5">
                      {bi(
                        'اسم مصرّح به ذاتياً من اختيار الكادر المحلي وليس هوية مصادقاً عليها رقمياً.',
                        'Self-declared name from active staff selection, not authenticated identity.',
                        'ناوی ڕاگەیەنراوی خۆیی لە هەڵبژاردنی ستافی ناوخۆیی، ناسنامەی باوەڕپێکراوی دیجیتاڵی نییە.'
                      )}
                    </span>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="soap-addendum-text" className="text-xs font-bold text-foreground">
                      {bi(
                        'نص الإضافة أو التصحيح السريري (لا يعدل النص الأصلي بل يُلحق به):',
                        'Addendum Text (appended immutably):',
                        'دەقی زیادکردن یان ڕاستکردنەوەی کلینیکی (دەقی بنەڕەتی ناگۆڕێت بەڵکو پێوەی دەلکێنرێت):'
                      )}
                    </label>
                    <span className="text-xs font-mono text-muted-foreground-2">
                      <Fraction value={addendumText.length} total={MAX_ADDENDUM_TEXT_LENGTH} />
                    </span>
                  </div>
                  <AutoResizeTextarea
                    id="soap-addendum-text"
                    minRows={2}
                    maxLength={MAX_ADDENDUM_TEXT_LENGTH}
                    value={addendumText}
                    onChange={(e) => setAddendumText(e.target.value)}
                    required
                    placeholder={bi(
                      'اكتب تفاصيل الإضافة أو التوضيح السريري هنا...',
                      'Enter clinical addendum details...',
                      'وردەکارییەکانی پاشکۆ یان ڕوونکردنەوەی کلینیکی لێرە بنووسە...'
                    )}
                    className="w-full px-3 py-2 text-xs rounded-lg bg-surface border border-layer-line text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isSavingAddendum || !addendumText.trim()}
                    className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover disabled:bg-surface disabled:text-muted-foreground-2 disabled:border disabled:border-line-2 disabled:cursor-not-allowed text-primary-foreground text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>
                      {bi('إدراج الملحق السريري', 'Append Clinical Addendum', 'زیادکردنی پاشکۆی کلینیکی')}
                    </span>
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Mobile Sticky Bottom Thumb-Reach Action Bar (2.7) */}
      {!isLocked && (
        <div className="md:hidden shrink-0 px-4 py-3 bg-card/95 backdrop-blur-md border-t border-card-line shadow-[0_-4px_20px_-8px_rgba(0,0,0,0.08)] flex items-center justify-between gap-2.5 z-20">
          <button
            type="button"
            onClick={() => void persistDraftSoap(false)}
            disabled={isSaving}
            className="flex-1 min-h-[44px] px-3 py-2 rounded-xl bg-primary/10 hover:bg-primary/15 text-primary border border-primary/25 text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
          >
            <Save className="size-4" />
            <span>{bi('حفظ المسودة', 'Save Draft', 'پاشەکەوتکردنی ڕەشنووس')}</span>
          </button>
          {perms.canFinalizeAndLockNotes && (
            <button
              type="button"
              onClick={handleRequestSignAndLock}
              disabled={isSaving}
              className="flex-1 min-h-[44px] px-3 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold shadow-md shadow-primary/20 inline-flex items-center justify-center gap-1.5 cursor-pointer transition-all"
            >
              <Lock className="size-4" />
              <span>{bi('إنهاء واعتماد', 'Finish & Sign', 'تەواوکردن و پەسەندکردن')}</span>
            </button>
          )}
        </div>
      )}

      {/* Fallback Local 8s Undo Toast when opened standalone without global AppLayout toast */}
      {localUndoToast && (
        <div className="fixed bottom-16 md:bottom-5 inset-x-4 sm:inset-x-auto sm:end-5 z-50 max-w-md bg-card border-2 border-primary/40 shadow-xl rounded-2xl p-3.5 flex items-center justify-between gap-3 text-xs">
          <span className="font-semibold text-foreground">{localUndoToast.label}</span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                ClinicOperationsService.undoFinishSequenceBillingAndBooking(localUndoToast.snapshot);
                setLocalUndoToast(null);
              }}
              className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground font-bold cursor-pointer"
            >
              {bi('تراجع (الدفع/الموعد)', 'Undo Billing/Appt', 'پاشگەزبوونەوە (پارە/وادە)')}
            </button>
            <button
              type="button"
              onClick={() => setLocalUndoToast(null)}
              className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg p-1 text-muted-foreground-1 hover:text-foreground cursor-pointer"
              aria-label={bi('إغلاق', 'Dismiss', 'داخستن')}
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      {/* One-Flow Finish Sequence Modal (2.4 + B4 Completeness) */}
      <FinishSessionFlowModal
        isOpen={showFinishFlowModal}
        onOpenChange={setShowFinishFlowModal}
        session={session}
        episodeTitle={episodeTitle}
        completenessReport={completenessReport}
        advisoryWarnings={missingLockFields}
        finalizeError={saveError}
        onFinalizeStep={executeFinalizeSessionAsync}
        onFinishCompleted={(undoSnapshot, summaryAr, summaryEn) => {
          if (onFinishCompleted) {
            onFinishCompleted(undoSnapshot, summaryAr, summaryEn);
          } else {
            const label = language === 'en' ? summaryEn : summaryAr;
            setLocalUndoToast({ snapshot: undoSnapshot, label });
            setTimeout(() => {
              setLocalUndoToast((curr) =>
                curr?.snapshot === undoSnapshot ? null : curr
              );
            }, 8000);
          }
        }}
      />

      {/* Favorite Quick SOAP Chips Editor Dialog */}
      <ModalDialog
        isOpen={showChipEditorModal}
        onOpenChange={setShowChipEditorModal}
        title={bi('تخصيص بطاقات التدخل السريع', 'Customize Quick SOAP Favorite Chips', 'تایبەتمەندکردنی کارتەکانی تۆماری خێرا')}
        subtitle={bi(
          'أضف أو احذف اختصارات التمارين والعلاج اليدوي والأجهزة المستخدمة بكثرة في عيادتك.',
          'Add or remove frequently used exercises, manual techniques, and modalities.',
          'قەدبڕەکانی ڕاهێنان، چارەسەری دەستی و ئامێرە زۆر بەکارهێنراوەکانی کلینیکەکەت زیاد بکە یان بسڕەوە.'
        )}
        size="lg"
      >
        <div className="space-y-4 text-xs">
          <form onSubmit={handleAddCustomChip} className="p-3.5 rounded-xl bg-surface border border-line-2 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label htmlFor="chip-new-category" className="font-bold text-foreground block mb-1">
                  {bi('الفئة:', 'Category:', 'پۆل:')}
                </label>
                <select
                  id="chip-new-category"
                  value={newChipCategory}
                  onChange={(e) => setNewChipCategory(e.target.value as QuickSoapChipCategory)}
                  className="w-full px-2.5 py-2 rounded-lg bg-layer border border-layer-line text-foreground"
                >
                  <option value="modality">{bi('جهاز فيزيائي', 'Physical Modality', 'ئامێری فیزیایی')}</option>
                  <option value="manual">{bi('علاج يدوي', 'Manual Therapy', 'چارەسەری دەستی')}</option>
                  <option value="exercise">{bi('تمرين علاجي', 'Therapeutic Exercise', 'ڕاهێنانی چارەسەری')}</option>
                </select>
              </div>
              <div>
                <label htmlFor="chip-new-label-ar" className="font-bold text-foreground block mb-1">
                  {bi('الاسم بالعربية:', 'Arabic Label:', 'ناو بە عەرەبی:')}
                </label>
                <input
                  id="chip-new-label-ar"
                  type="text"
                  value={newChipLabelAr}
                  onChange={(e) => setNewChipLabelAr(e.target.value)}
                  placeholder={bi('مثال: شد فقرات عنقية', 'e.g. Cervical Traction', 'نموونە: ڕاکێشانی بڕبڕەی مل')}
                  className="w-full px-2.5 py-2 rounded-lg bg-layer border border-layer-line text-foreground"
                />
              </div>
              <div>
                <label htmlFor="chip-new-label-en" className="font-bold text-foreground block mb-1">
                  {bi('الاسم بالإنجليزية:', 'English Label:', 'ناو بە ئینگلیزی:')}
                </label>
                <input
                  id="chip-new-label-en"
                  type="text"
                  value={newChipLabelEn}
                  onChange={(e) => setNewChipLabelEn(e.target.value)}
                  placeholder="e.g. Cervical Traction"
                  className="w-full px-2.5 py-2 rounded-lg bg-layer border border-layer-line text-foreground"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-2.5">
              <div className="flex-1 min-w-[180px]">
                <label htmlFor="chip-new-detail" className="font-bold text-foreground block mb-1">
                  {bi('الإعدادات / الجرعة الافتراضية:', 'Default Parameters / Load:', 'ڕێکخستنەکان / بڕی بنەڕەتی:')}
                </label>
                <input
                  id="chip-new-detail"
                  type="text"
                  value={newChipDetail}
                  onChange={(e) => setNewChipDetail(e.target.value)}
                  placeholder={bi('مثال: 100Hz / Grade III / 10 kg', 'e.g. 100Hz / Grade III / 10 kg', 'نموونە: 100Hz / Grade III / 10 kg')}
                  className="w-full px-2.5 py-2 rounded-lg bg-layer border border-layer-line text-foreground"
                />
              </div>
              <button
                type="submit"
                disabled={!newChipLabelAr.trim() && !newChipLabelEn.trim()}
                className="min-h-[36px] px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover disabled:bg-surface disabled:text-muted-foreground-2 disabled:border disabled:border-line-2 disabled:cursor-not-allowed text-primary-foreground font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="size-3.5" />
                <span>{bi('إضافة بطاقة', 'Add Chip', 'زیادکردنی کارت')}</span>
              </button>
            </div>
          </form>

          <div tabIndex={0} className="space-y-2 max-h-60 overflow-y-auto focus:outline-none">
            {favoriteChips.map((chip) => (
              <div
                key={chip.id}
                className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-layer border border-layer-line"
              >
                <div className="min-w-0">
                  <span className="font-bold text-foreground">
                    {bi(chip.labelAr, chip.labelEn)}
                  </span>
                  <span className="text-muted-foreground-1 ms-2">
                    ({chip.category === 'exercise'
                      ? bi('تمرين', 'Exercise', 'ڕاهێنان')
                      : chip.category === 'manual'
                        ? bi('يدوي', 'Manual', 'دەستی')
                        : bi('جهاز', 'Modality', 'ئامێر')})
                  </span>
                </div>
                {confirmDeleteChipId === chip.id ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        void handleDeleteFavoriteChip(chip.id);
                        setConfirmDeleteChipId(null);
                      }}
                      className="px-2 py-1 rounded-lg bg-rose-600 text-white text-xs font-bold cursor-pointer"
                    >
                      {bi('تأكيد', 'Confirm', 'دڵنیاکردنەوە')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteChipId(null)}
                      className="px-2 py-1 rounded-lg bg-layer border border-layer-line text-xs text-muted-foreground-1 cursor-pointer"
                    >
                      {bi('إلغاء', 'Cancel', 'هەڵوەشاندنەوە')}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteChipId(chip.id)}
                    className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center p-1.5 rounded-lg text-muted-foreground-2 hover:text-rose-600 hover:bg-rose-500/10 cursor-pointer"
                    aria-label={bi('حذف البطاقة', 'Delete chip', 'سڕینەوەی کارت')}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-card-divider">
            {confirmResetChips ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    void handleResetDefaultChips();
                    setConfirmResetChips(false);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold cursor-pointer"
                >
                  {bi('تأكيد الاستعادة', 'Confirm Restore', 'دڵنیاکردنەوەی گەڕاندنەوە')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmResetChips(false)}
                  className="px-2.5 py-1.5 rounded-lg bg-surface border border-line-2 text-xs text-muted-foreground-1 cursor-pointer"
                >
                  {bi('إلغاء', 'Cancel', 'هەڵوەشاندنەوە')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmResetChips(true)}
                className="px-3 py-1.5 rounded-lg bg-surface border border-line-2 text-muted-foreground-1 hover:text-foreground font-semibold cursor-pointer"
              >
                {bi('استعادة البطاقات الافتراضية', 'Restore Default Chips', 'گەڕاندنەوەی کارتە بنەڕەتییەکان')}
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowChipEditorModal(false)}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-bold cursor-pointer"
            >
              {bi('تم', 'Done', 'تەواو')}
            </button>
          </div>
        </div>
      </ModalDialog>

      {/* Keyboard Shortcuts Help Dialog (2.3) */}
      <ModalDialog
        isOpen={showShortcutsModal}
        onOpenChange={setShowShortcutsModal}
        title={bi('اختصارات لوحة المفاتيح للجلسة', 'Session Keyboard Shortcuts', 'قەدبڕەکانی کیبۆرد بۆ دانیشتن')}
        size="sm"
      >
        <div className="space-y-2.5 text-xs">
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-surface border border-line-2">
            <span className="font-semibold text-foreground">
              {bi('حفظ المسودة فوراً', 'Save Draft Now', 'پاشەکەوتکردنی خێرای ڕەشنووس')}
            </span>
            <kbd className="px-2 py-1 rounded bg-layer border border-layer-line font-mono text-foreground" dir="ltr">
              Ctrl + Enter
            </kbd>
          </div>
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-surface border border-line-2">
            <span className="font-semibold text-foreground">
              {bi('إنهاء واعتماد الجلسة', 'Finish & Sign Session', 'تەواوکردن و پەسەندکردنی دانیشتن')}
            </span>
            <kbd className="px-2 py-1 rounded bg-layer border border-layer-line font-mono text-foreground" dir="ltr">
              Ctrl + Shift + Enter
            </kbd>
          </div>
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-surface border border-line-2">
            <span className="font-semibold text-foreground">
              {bi('إظهار / إخفاء الاختصارات', 'Toggle Shortcuts Help', 'پیشاندان / شاردنەوەی قەدبڕەکان')}
            </span>
            <kbd className="px-2 py-1 rounded bg-layer border border-layer-line font-mono text-foreground" dir="ltr">
              ?
            </kbd>
          </div>
        </div>
      </ModalDialog>

      {/* Phase B6: Modality Contraindication / Precaution Non-Blocking Override Modal */}
      <ModalDialog
        isOpen={Boolean(pendingModalityCandidate)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingModalityCandidate(null);
            setModalityOverrideReason('');
          }
        }}
        title={bi(
          'تحذير سلامة الوسيلة الفيزيائية (B6)',
          'Physical Modality Safety Alert',
          'ئاگاداری سەلامەتیی ئامێری فیزیایی (B6)'
        )}
        size="md"
      >
        {pendingModalityCandidate && (
          <div data-testid="modality-safety-override-modal" className="space-y-3 text-xs">
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-2">
              <div className="flex items-center gap-2 font-bold text-rose-800 dark:text-rose-200">
                <AlertTriangle className="size-4 shrink-0" />
                <span>
                  {bi(
                    `تم رصد تعارض/محذور سريري عند إضافة: ${pendingModalityCandidate.modalityAr}`,
                    `Safety alert detected for: ${pendingModalityCandidate.modality}`,
                    `ئاگاداری دژبەیەکیی کلینیکی دۆزرایەوە لە کاتی زیادکردنی: ${pendingModalityCandidate.modalityAr}`
                  )}
                </span>
              </div>
              <ul className="space-y-1.5">
                {pendingModalityCandidate.rules.map((rule) => (
                  <li
                    key={rule.id}
                    className="p-2 rounded-lg bg-surface/80 border border-rose-500/20 space-y-0.5"
                  >
                    <div className="font-bold text-rose-700 dark:text-rose-300">
                      {bi(rule.titleAr, rule.titleEn)} (
                      {rule.severity === 'absolute_contraindication'
                        ? bi('مانع مطلق', 'Absolute Contraindication', 'ڕێگری تەواو')
                        : bi('تحذير / احتياط', 'Precaution', 'ئاگاداری / خۆپارێزی')}
                      )
                    </div>
                    <p className="text-foreground">
                      {bi(rule.rationaleAr, rule.rationaleEn)}
                    </p>
                    <p className="text-muted-foreground-1 font-mono">{rule.citation}</p>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <label htmlFor="modality-override-rationale" className="block font-bold text-foreground mb-1">
                {bi(
                  'مبرر التجاوز السريري (اختياري — يُحفظ في سجل الجلسة):',
                  'Clinical Override Rationale (optional — recorded in session note):',
                  'هۆکاری تێپەڕاندنی کلینیکی (دڵخوازانە — لە تۆماری دانیشتندا پاشەکەوت دەکرێت):'
                )}
              </label>
              <AutoResizeTextarea
                id="modality-override-rationale"
                minRows={2}
                value={modalityOverrideReason}
                onChange={(e) => setModalityOverrideReason(e.target.value)}
                placeholder={bi(
                  'مثال: التطبيق بعيداً عن الصدر/الجهاز بعد التحقق السريري...',
                  'e.g., Distal extremity application only after clinical screening...',
                  'نموونە: بەکارهێنان دوور لە سنگ/ئامێر دوای پشکنینی کلینیکی...'
                )}
                className="w-full px-3 py-2 rounded-xl bg-surface border border-layer-line text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-card-divider">
              <button
                type="button"
                onClick={() => {
                  setPendingModalityCandidate(null);
                  setModalityOverrideReason('');
                }}
                className="px-3.5 py-2 rounded-xl bg-layer border border-layer-line text-foreground font-semibold cursor-pointer"
              >
                {bi('إلغاء الإضافة', 'Cancel', 'هەڵوەشاندنەوە')}
              </button>
              <button
                type="button"
                data-testid="modality-safety-confirm-override-btn"
                onClick={handleConfirmModalityOverride}
                className="px-4 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 dark:bg-amber-700 dark:hover:bg-amber-600 text-white font-bold cursor-pointer"
              >
                {bi('تأكيد التجاوز وإضافة الجهاز', 'Override & Add Modality', 'پشتڕاستکردنەوە و زیادکردنی ئامێر')}
              </button>
            </div>
          </div>
        )}
      </ModalDialog>
    </div>
  );
};
