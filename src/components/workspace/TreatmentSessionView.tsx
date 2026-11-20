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

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Copy, Lock, Save, X } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useVault } from '../../context/VaultContext';
import { usePatients } from '../../context/PatientContext';
import {
  SoapService,
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
import type {
  EpisodeScopedClinicalStore,
  FinishUndoSnapshot,
  QuickSoapChip,
  QuickSoapChipCategory,
} from '../../types/clinicManagement';
import {
  type AddendumReason,
  type ClinicalAddendumRecord,
  type FlowsheetExerciseEntry,
  type ManualTherapyFlowsheetEntry,
  type ModalitySafetyOverrideEntry,
  type PhysicalAgentFlowsheetEntry,
  type SealVerificationStatus,
  type SessionRecord,
  type SoapNoteData,
  type SoapNoteRecord,
} from '../../types/clinical';
import { localDate } from '../../utils/date';
import { evaluateNoteCompleteness, type NoteCompletenessReport } from '../../utils/reEvalNudge';
import { checkModalitySafety, type ModalitySafetyRule } from '../../utils/modalitySafetyChecker';
import { resolveInitialSessionTimerState } from '../../utils/sessionTimerState';
import {
  type CopiedSoapTextField,
  type PatientToleranceOption,
  type ProgressStatusOption,
  type UntouchedDraftFormState,
  buildSoapPayloadFromFormState,
  compileFlowsheetSummaryText,
  createUntouchedDraftFormState,
  resolveStoredInterventionsSummary,
  validateSignAndLockState,
} from './session/sessionSoapHelpers';
import { SessionTopBar } from './session/SessionTopBar';
import { SessionAlertsAndQuickBar } from './session/SessionAlertsAndQuickBar';
import { SessionVisitPaper } from './session/SessionVisitPaper';
import { SessionAddendaSection } from './session/SessionAssessmentPlanAndAddenda';
import { SessionModals } from './session/SessionModals';

export {
  buildSoapPayloadFromFormState,
  compileFlowsheetSummaryText,
  createUntouchedDraftFormState,
  resolveStoredInterventionsSummary,
  validateSignAndLockState,
  type CopiedSoapTextField,
  type PatientToleranceOption,
  type ProgressStatusOption,
  type UntouchedDraftFormState,
};

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
  onStartSessionTour?: () => void;
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
  onStartSessionTour,
}) => {
  const { language, bi } = useLanguage();
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
  const [enableProblemListGoals, setEnableProblemListGoals] = useState<boolean>(() =>
    ClinicOperationsService.isProblemListGoalsEnabled()
  );
  const [enablePerformanceTestLibrary, setEnablePerformanceTestLibrary] = useState<boolean>(() =>
    ClinicOperationsService.isPerformanceTestLibraryEnabled()
  );
  const [episodeStore, setEpisodeStore] = useState<EpisodeScopedClinicalStore>(() =>
    ClinicOperationsService.getEpisodeClinicalStore(session.episodeId, patientId)
  );
  const hasExamModifiedInSessionRef = useRef(false);

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
      setEnableProblemListGoals(ClinicOperationsService.isProblemListGoalsEnabled());
      setEnablePerformanceTestLibrary(ClinicOperationsService.isPerformanceTestLibraryEnabled());
      setEpisodeStore(ClinicOperationsService.getEpisodeClinicalStore(session.episodeId, patientId));
    };
    syncModules();
    return ClinicOperationsService.subscribe(syncModules);
  }, [session.episodeId, patientId]);

  const updateEpisodeField = useCallback(
    <K extends keyof EpisodeScopedClinicalStore>(
      field: K,
      val: EpisodeScopedClinicalStore[K]
    ) => {
      hasExamModifiedInSessionRef.current = true;
      setEpisodeStore((prev) => {
        const next = { ...prev, [field]: val };
        ClinicOperationsService.saveEpisodeClinicalStore(next);
        return next;
      });
    },
    []
  );

  const handleAddExamWidget = useCallback(
    (widgetId: string) => {
      setEpisodeStore((prev) => {
        if (prev.activeWidgetIds.includes(widgetId)) return prev;
        const next = { ...prev, activeWidgetIds: [...prev.activeWidgetIds, widgetId] };
        ClinicOperationsService.saveEpisodeClinicalStore(next);
        return next;
      });
    },
    []
  );

  const handleRemoveExamWidget = useCallback(
    (widgetId: string) => {
      setEpisodeStore((prev) => {
        const next = {
          ...prev,
          activeWidgetIds: prev.activeWidgetIds.filter((id) => id !== widgetId),
        };
        ClinicOperationsService.saveEpisodeClinicalStore(next);
        return next;
      });
    },
    []
  );

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

  // Quick SOAP State (Copy-Forward, Timer, Custom Chips, Shortcuts)
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

  const loadRequestIdRef = useRef(0);

  // Append-Only Addendum Form State (for finalized sessions)
  const [addendumReason, setAddendumReason] = useState<AddendumReason>('treatment_response_update');
  const [addendumText, setAddendumText] = useState('');
  const [isSavingAddendum, setIsSavingAddendum] = useState(false);
  const [addendumError, setAddendumError] = useState<string | null>(null);

  const [formState, setFormState] = useState<UntouchedDraftFormState>(
    createUntouchedDraftFormState
  );
  const [numericDrafts, setNumericDrafts] = useState<Record<string, string>>({});
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

  const handlePainChange = useCallback((kind: 'pre' | 'post', val: number) => {
    loadRequestIdRef.current++;
    setFormState((prev) =>
      kind === 'pre'
        ? { ...prev, prePainNrs: val, prePainNotRecorded: false }
        : { ...prev, postPainNrs: val, postPainNotRecorded: false }
    );
    setIsDirty(true);
    setMissingLockFields([]);
  }, []);

  const handlePainToggleNotRecorded = useCallback((kind: 'pre' | 'post') => {
    loadRequestIdRef.current++;
    setFormState((prev) =>
      kind === 'pre'
        ? { ...prev, prePainNrs: undefined, prePainNotRecorded: !prev.prePainNotRecorded }
        : { ...prev, postPainNrs: undefined, postPainNotRecorded: !prev.postPainNotRecorded }
    );
    setIsDirty(true);
    setMissingLockFields([]);
  }, []);

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

  const getCopiedFieldStatus = (field: CopiedSoapTextField): 'copied' | 'edited' | null => {
    if (!copiedFromInfo || !copiedBaseline) return null;
    const base = copiedBaseline[field];
    if (!base || !String(base).trim()) return null;
    return formState[field] === base ? 'copied' : 'edited';
  };

  const renderCopiedFieldBadge = (field: CopiedSoapTextField) => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dek, session.id, bi, applyCopyForwardFromSoap]);

  useEffect(() => {
    autoFinishTriggeredRef.current = false;
    loadSoapAndAddenda();
  }, [loadSoapAndAddenda]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  useEffect(() => {
    if (isLocked) {
      setTimerRunning(false);
    }
  }, [isLocked]);

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
      refreshRecoveredDrafts,
    ]
  );

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

  const handleAddManualExercise = () => {
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
      const savedSoap = await persistDraftSoap(false, false);
      if (!savedSoap) {
        setIsSaving(false);
        return false;
      }

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

      // Automatic Longitudinal Comparison Snapshot on Session Finalization
      {
        const latestEpStore = ClinicOperationsService.getEpisodeClinicalStore(
          session.episodeId,
          patientId
        );
        const sType = session.data.sessionType;
        const sNum = session.data.sessionNumber;
        const hasAnyExamData =
          (latestEpStore.objective?.romBattery?.entries || []).some(
            (e) => e.measuredAngleDegrees !== null && e.measuredAngleDegrees !== undefined
          ) ||
          (latestEpStore.objective?.mmtBattery?.entries || []).some((e) => e.gradeValue !== null) ||
          Boolean(
            latestEpStore.functionalScales &&
              typeof latestEpStore.functionalScales.rawScore === 'number'
          );
        const noSnapshotsYet = (latestEpStore.snapshots || []).length === 0;

        if (sType === 'initial_evaluation') {
          ClinicOperationsService.recordEpisodeSnapshot(
            session.episodeId,
            patientId,
            'initial_evaluation',
            `تقييم أولي (جلسة #${sNum})`,
            `Initial Eval (Session #${sNum})`
          );
        } else if (sType === 're_evaluation') {
          ClinicOperationsService.recordEpisodeSnapshot(
            session.episodeId,
            patientId,
            're_evaluation',
            `إعادة تقييم (جلسة #${sNum})`,
            `Re-Eval (Session #${sNum})`
          );
        } else if (sType === 'discharge_summary') {
          ClinicOperationsService.recordEpisodeSnapshot(
            session.episodeId,
            patientId,
            'discharge',
            `تقييم التخريج (جلسة #${sNum})`,
            `Discharge (Session #${sNum})`
          );
        } else if (hasExamModifiedInSessionRef.current) {
          ClinicOperationsService.recordEpisodeSnapshot(
            session.episodeId,
            patientId,
            noSnapshotsYet ? 'initial_evaluation' : 're_evaluation',
            `قياسات الجلسة #${sNum}`,
            `Session #${sNum} Measurements`
          );
        } else if (noSnapshotsYet && hasAnyExamData) {
          ClinicOperationsService.recordEpisodeSnapshot(
            session.episodeId,
            patientId,
            'initial_evaluation',
            `خط الأساس (جلسة #${sNum})`,
            `Baseline (Session #${sNum})`
          );
        }
        hasExamModifiedInSessionRef.current = false;
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
      <SessionTopBar
        session={session}
        patientName={patientName}
        episodeTitle={episodeTitle}
        isLocked={isLocked}
        isDirty={isDirty}
        isSaving={isSaving}
        saveSuccess={saveSuccess}
        autosaveStatus={autosaveStatus}
        lastSavedAt={lastSavedAt}
        canFinalizeAndLockNotes={perms.canFinalizeAndLockNotes}
        elapsedSeconds={elapsedSeconds}
        timerRunning={timerRunning}
        savedSessionSeconds={savedSessionSeconds}
        latestElapsedRef={latestElapsedRef}
        setElapsedSeconds={setElapsedSeconds}
        setTimerRunning={setTimerRunning}
        setSavedSessionSeconds={setSavedSessionSeconds}
        pendingNavAction={pendingNavAction}
        onSafeNavigation={handleSafeNavigation}
        onOpenShortcuts={() => setShowShortcutsModal(true)}
        onStartSessionTour={onStartSessionTour}
        onSaveDraft={() => void persistDraftSoap(false)}
        onRequestSignAndLock={handleRequestSignAndLock}
        onConfirmSaveAndLeave={async () => {
          const target = pendingNavAction;
          setPendingNavAction(null);
          const saved = await persistDraftSoap(false);
          if (saved) {
            if (target === 'back') onBack();
            else onOpenMasterChart();
          }
        }}
        onConfirmDiscardAndLeave={() => {
          const target = pendingNavAction;
          setPendingNavAction(null);
          setIsDirty(false);
          void DraftRecoveryService.deleteDraftAsync('soap', session.id).then(() =>
            refreshRecoveredDrafts()
          );
          if (target === 'back') onBack();
          else onOpenMasterChart();
        }}
        onCancelPendingNav={() => setPendingNavAction(null)}
      />

      {/* Main Session & Flowsheet Canvas */}
      <div
        tabIndex={0}
        aria-label={bi('مساحة توثيق الجلسة العلاجية', 'Treatment session documentation canvas', 'ڕووبەری تۆمارکردنی دانیشتنی چارەسەر')}
        className="flex-1 overflow-y-auto p-4 sm:p-6 pb-24 md:pb-6 space-y-5 max-w-5xl mx-auto w-full focus:outline-none"
      >
        <SessionAlertsAndQuickBar
          loadError={loadError}
          onRetryLoad={() => void loadSoapAndAddenda()}
          saveError={saveError}
          missingLockFields={missingLockFields}
          addendaFailedCount={addendaFailedCount}
          flowsheetFailedCount={flowsheetFailedCount}
          sealStatus={sealStatus}
          sealMismatchWarning={sealMismatchWarning}
          unsealedNotice={unsealedNotice}
          soapRecord={soapRecord}
          isLegacyDraftOrigin={isLegacyDraftOrigin}
          requiresLegacyReview={requiresLegacyReview}
          legacyDraftReviewed={formState.legacyDraftReviewed}
          onToggleLegacyDraftReviewed={(checked) => {
            setFormState((prev) => ({ ...prev, legacyDraftReviewed: checked }));
            setMissingLockFields([]);
          }}
        />

        <SessionVisitPaper
          session={session}
          patient={currentPatient}
          formState={formState}
          isLocked={isLocked}
          recordedByName={recordedByName}
          episodeStore={episodeStore}
          setEpisodeStore={setEpisodeStore}
          updateEpisodeField={updateEpisodeField}
          onAddExamWidget={handleAddExamWidget}
          onRemoveExamWidget={handleRemoveExamWidget}
          enableVitalsModule={enableVitalsModule}
          enableProblemListGoals={enableProblemListGoals}
          enablePerformanceTestLibrary={enablePerformanceTestLibrary}
          isSafetyOverrideOpen={Boolean(pendingModalityCandidate)}
          copiedFromInfo={copiedFromInfo}
          onResetCopiedFields={handleResetCopiedFields}
          onCopyPreviousSessionManual={() => void handleCopyPreviousSessionManual()}
          onOpenChipEditor={() => setShowChipEditorModal(true)}
          favoriteChips={favoriteChips}
          onApplyFavoriteChip={handleApplyFavoriteChip}
          derivedFlowsheetSummary={derivedFlowsheetSummary}
          selectedCatalogExId={selectedCatalogExId}
          setSelectedCatalogExId={setSelectedCatalogExId}
          numericDrafts={numericDrafts}
          setNumericDrafts={setNumericDrafts}
          numericErrors={numericErrors}
          prefillParameterIds={prefillParameterIds}
          setPrefillParameterIds={setPrefillParameterIds}
          updateField={updateField}
          onPainChange={handlePainChange}
          onPainToggleNotRecorded={handlePainToggleNotRecorded}
          onMarkDirty={() => setIsDirty(true)}
          onCarryForwardPreviousFlowsheet={() => void handleCarryForwardPreviousFlowsheet()}
          onAddExerciseFromCatalog={handleAddExerciseFromCatalog}
          onAddManualExercise={handleAddManualExercise}
          onAddManualTherapy={handleAddManualTherapy}
          onAddPhysicalAgent={handleAddPhysicalAgent}
          onAddManualPhysicalAgent={handleAddManualPhysicalAgent}
          getCopiedFieldStatus={getCopiedFieldStatus}
          renderCopiedFieldBadge={renderCopiedFieldBadge}
        />

        {isLocked && (
          <SessionAddendaSection
            recordedByName={recordedByName}
            soapRecord={soapRecord}
            addenda={addenda}
            addendaFailedCount={addendaFailedCount}
            addendumReason={addendumReason}
            setAddendumReason={setAddendumReason}
            addendumText={addendumText}
            setAddendumText={setAddendumText}
            isSavingAddendum={isSavingAddendum}
            addendumError={addendumError}
            onAddAddendum={handleAddAddendum}
          />
        )}
      </div>

      {/* Mobile Sticky Bottom Thumb-Reach Action Bar */}
      {!isLocked && (
        <div className="md:hidden shrink-0 px-3 py-2.5 bg-card/95 backdrop-blur-md border-t border-black/[0.05] dark:border-white/[0.06] flex items-center justify-between gap-2 z-20">
          <button
            type="button"
            data-tour="session-save-btn"
            onClick={() => void persistDraftSoap(false)}
            disabled={isSaving}
            className="flex-1 compact-btn h-10 px-3 rounded-xl bg-surface/85 hover:bg-surface text-foreground text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
          >
            <Save className="size-4 text-primary" />
            <span>{bi('حفظ المسودة', 'Save Draft', 'پاشەکەوتکردنی ڕەشنووس')}</span>
          </button>
          {perms.canFinalizeAndLockNotes && (
            <button
              type="button"
              data-tour="session-sign-btn"
              onClick={handleRequestSignAndLock}
              disabled={isSaving}
              className="flex-1 compact-btn h-10 px-3 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold shadow-xs shadow-primary/20 inline-flex items-center justify-center gap-1.5 cursor-pointer transition-all"
            >
              <Lock className="size-4" />
              <span>{bi('إنهاء واعتماد', 'Finish & Sign', 'تەواوکردن و پەسەندکردن')}</span>
            </button>
          )}
        </div>
      )}

      {/* Fallback Local 8s Undo Toast when opened standalone */}
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

      <SessionModals
        session={session}
        episodeTitle={episodeTitle}
        showFinishFlowModal={showFinishFlowModal}
        setShowFinishFlowModal={setShowFinishFlowModal}
        completenessReport={completenessReport}
        missingLockFields={missingLockFields}
        saveError={saveError}
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
        showChipEditorModal={showChipEditorModal}
        setShowChipEditorModal={setShowChipEditorModal}
        newChipCategory={newChipCategory}
        setNewChipCategory={setNewChipCategory}
        newChipLabelAr={newChipLabelAr}
        setNewChipLabelAr={setNewChipLabelAr}
        newChipLabelEn={newChipLabelEn}
        setNewChipLabelEn={setNewChipLabelEn}
        newChipDetail={newChipDetail}
        setNewChipDetail={setNewChipDetail}
        onAddCustomChip={handleAddCustomChip}
        favoriteChips={favoriteChips}
        confirmDeleteChipId={confirmDeleteChipId}
        setConfirmDeleteChipId={setConfirmDeleteChipId}
        onDeleteFavoriteChip={(id) => void handleDeleteFavoriteChip(id)}
        confirmResetChips={confirmResetChips}
        setConfirmResetChips={setConfirmResetChips}
        onResetDefaultChips={() => void handleResetDefaultChips()}
        showShortcutsModal={showShortcutsModal}
        setShowShortcutsModal={setShowShortcutsModal}
        pendingModalityCandidate={pendingModalityCandidate}
        modalityOverrideReason={modalityOverrideReason}
        setModalityOverrideReason={setModalityOverrideReason}
        onCancelModalityOverride={() => setPendingModalityCandidate(null)}
        onConfirmModalityOverride={handleConfirmModalityOverride}
      />
    </div>
  );
};
