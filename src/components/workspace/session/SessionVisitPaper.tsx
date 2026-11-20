import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Brain,
  Check,
  ChevronLeft,
  Copy,
  Dumbbell,
  FileCheck,
  Footprints,
  Hand,
  HeartPulse,
  ListChecks,
  MapPin,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Stethoscope,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import {
  ClinicOperationsService,
  PT_EXERCISE_CATALOG,
} from '../../../services/clinicOperationsService';
import type {
  FlowsheetExerciseEntry,
  ManualTherapyFlowsheetEntry,
  ManualTherapyGradeOrIntensity,
  PatientRecord,
  PhysicalAgentFlowsheetEntry,
  SessionRecord,
  SessionVitalsEntry,
} from '../../../types/clinical';
import type { CustomWidgetDefinition } from '../../../types/clinicalWidgets';
import type {
  EpisodeScopedClinicalStore,
  QuickSoapChip,
  RegionalExamPresetDefinition,
  VitalsAlertThresholds,
} from '../../../types/clinicManagement';
import {
  BUILT_IN_EXAM_PRESETS_CC0,
  removeExamPresetFromEpisodeStore,
} from '../../../data/clinicalToolkit/examPresetsCc0';
import {
  MANUAL_THERAPY_GRADE_OPTIONS,
  MANUAL_THERAPY_TARGET_CHIPS,
  MANUAL_THERAPY_TECHNIQUE_PRESETS,
  type ManualTherapyTechniquePreset,
} from '../../../data/clinicalToolkit/manualTherapyCatalog';
import { computePatientAge } from '../../../utils/date';
import { evaluateVitalsAgainstThresholds } from '../../../utils/modalitySafetyChecker';
import { ModalDialog } from '../../ui/Dialog';
import { AutoResizeTextarea, ClinicalAbbr, Fraction, NprsControl } from '../../ui/Primitives';
import {
  CORE_BUILTIN_WIDGET_KEYS,
  TONE_CLASS_MAP,
  buildClinicalExamSummary,
  nprsTextColor,
} from '../chart/examSummaryHelpers';
import type {
  CopiedSoapTextField,
  PatientToleranceOption,
  ProgressStatusOption,
  UntouchedDraftFormState,
} from './sessionSoapHelpers';

const ActiveExamCanvas = lazy(() =>
  import('../ActiveExamCanvas').then((m) => ({ default: m.ActiveExamCanvas }))
);
const ExamPresetBar = lazy(() =>
  import('../ExamPresetBar').then((m) => ({ default: m.ExamPresetBar }))
);
const EpisodeProblemListGoalsPanel = lazy(() =>
  import('../EpisodeProblemListGoalsPanel').then((m) => ({
    default: m.EpisodeProblemListGoalsPanel,
  }))
);
const VitalsPanel = lazy(() =>
  import('../VitalsPanel').then((m) => ({ default: m.VitalsPanel }))
);

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

const QUICK_MODALITY_BUTTONS: ReadonlyArray<{
  mod: PhysicalAgentFlowsheetEntry['modality'];
  ar: string;
  ckb: string;
  params: string;
}> = [
  { mod: 'TENS', ar: 'تحفيز كهربائي TENS', ckb: 'TENS', params: '100Hz, 150µs' },
  { mod: 'Ultrasound', ar: 'أمواج فوق صوتية', ckb: 'شەپۆلی سەروودەنگ', params: '1MHz, 1.2 W/cm²' },
  { mod: 'NMES', ar: 'تحفيز عضلي NMES', ckb: 'NMES', params: '50Hz, 10s/30s' },
  { mod: 'HotPack', ar: 'كمادات ساخنة', ckb: 'گەرمی', params: 'Hydrocollator 15m' },
  { mod: 'Shortwave', ar: 'موجات قصيرة (SWD)', ckb: 'SWD', params: 'Pulsed / Continuous' },
  { mod: 'DryNeedling', ar: 'إبر جافة', ckb: 'دەرزی وشک', params: 'Trigger Points' },
  { mod: 'Cryotherapy', ar: 'كمادات باردة', ckb: 'ساردی', params: 'Cold pack' },
  { mod: 'Traction', ar: 'شد فقري', ckb: 'کێشانی بڕبڕە', params: 'Intermittent traction' },
];

type VisitSheetKey =
  | 'picker'
  | 'subjective'
  | 'exercises'
  | 'modalities'
  | 'manual_therapy'
  | 'vitals'
  | 'assessment_plan'
  | 'presets'
  | 'problems'
  | string;

export interface SessionVisitPaperProps {
  session: SessionRecord;
  patient: PatientRecord | undefined;
  formState: UntouchedDraftFormState;
  isLocked: boolean;
  recordedByName: string;
  episodeStore: EpisodeScopedClinicalStore;
  setEpisodeStore: React.Dispatch<React.SetStateAction<EpisodeScopedClinicalStore>>;
  updateEpisodeField: <K extends keyof EpisodeScopedClinicalStore>(
    field: K,
    val: EpisodeScopedClinicalStore[K]
  ) => void;
  onAddExamWidget: (widgetId: string) => void;
  onRemoveExamWidget: (widgetId: string) => void;
  enableVitalsModule: boolean;
  enableProblemListGoals: boolean;
  enablePerformanceTestLibrary: boolean;
  isSafetyOverrideOpen?: boolean;
  copiedFromInfo: { sessionNumber: number; sessionDate: string } | null;
  onResetCopiedFields: () => void;
  onCopyPreviousSessionManual: () => void;
  onOpenChipEditor: () => void;
  favoriteChips: QuickSoapChip[];
  onApplyFavoriteChip: (chip: QuickSoapChip) => void;
  derivedFlowsheetSummary: string;
  selectedCatalogExId: string;
  setSelectedCatalogExId: (id: string) => void;
  numericDrafts: Record<string, string>;
  setNumericDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  numericErrors: Record<string, string>;
  prefillParameterIds: Record<string, boolean>;
  setPrefillParameterIds: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  updateField: <K extends keyof UntouchedDraftFormState>(
    key: K,
    value: UntouchedDraftFormState[K]
  ) => void;
  onPainChange: (kind: 'pre' | 'post', val: number) => void;
  onPainToggleNotRecorded: (kind: 'pre' | 'post') => void;
  onMarkDirty: () => void;
  onCarryForwardPreviousFlowsheet: () => void;
  onAddExerciseFromCatalog: () => void;
  onAddManualExercise: () => void;
  onAddManualTherapy: (preset?: ManualTherapyTechniquePreset) => void;
  onAddPhysicalAgent: (
    modality: PhysicalAgentFlowsheetEntry['modality'],
    modalityAr: string,
    defaultParams: string,
    durationMinutes?: number,
    customId?: string
  ) => void;
  onAddManualPhysicalAgent: () => void;
  getCopiedFieldStatus: (field: CopiedSoapTextField) => 'copied' | 'edited' | null;
  renderCopiedFieldBadge: (field: CopiedSoapTextField) => React.ReactNode;
}

export const SessionVisitPaper: React.FC<SessionVisitPaperProps> = ({
  session,
  patient,
  formState,
  isLocked,
  recordedByName,
  episodeStore,
  setEpisodeStore,
  updateEpisodeField,
  onAddExamWidget,
  onRemoveExamWidget,
  enableVitalsModule,
  enableProblemListGoals,
  enablePerformanceTestLibrary,
  isSafetyOverrideOpen = false,
  copiedFromInfo,
  onResetCopiedFields,
  onCopyPreviousSessionManual,
  onOpenChipEditor,
  favoriteChips,
  onApplyFavoriteChip,
  derivedFlowsheetSummary,
  selectedCatalogExId,
  setSelectedCatalogExId,
  numericDrafts,
  setNumericDrafts,
  numericErrors,
  prefillParameterIds,
  setPrefillParameterIds,
  updateField,
  onPainChange,
  onPainToggleNotRecorded,
  onMarkDirty,
  onCarryForwardPreviousFlowsheet,
  onAddExerciseFromCatalog,
  onAddManualExercise,
  onAddManualTherapy,
  onAddPhysicalAgent,
  onAddManualPhysicalAgent,
  getCopiedFieldStatus,
  renderCopiedFieldBadge,
}) => {
  const { language, isRtl, bi } = useLanguage();
  const [activeSheet, setActiveSheet] = useState<VisitSheetKey | null>(null);
  const [showFreeTextExtras, setShowFreeTextExtras] = useState(false);

  const [customDefinitions, setCustomDefinitions] = useState<CustomWidgetDefinition[]>(() =>
    ClinicOperationsService.getCustomWidgets()
  );
  const [vitalsThresholds, setVitalsThresholds] = useState<VitalsAlertThresholds>(() =>
    ClinicOperationsService.getVitalsThresholds()
  );

  const [customPresets, setCustomPresets] = useState<RegionalExamPresetDefinition[]>(() =>
    ClinicOperationsService.getCustomExamPresets()
  );

  useEffect(() => {
    void ClinicOperationsService.ensureColdStoreLoadedAsync('customWidgets');
    const syncClinicStores = () => {
      setCustomDefinitions(ClinicOperationsService.getCustomWidgets());
      setVitalsThresholds(ClinicOperationsService.getVitalsThresholds());
      setCustomPresets(ClinicOperationsService.getCustomExamPresets());
    };
    syncClinicStores();
    return ClinicOperationsService.subscribe(syncClinicStores);
  }, []);

  const mergedExamPresets = useMemo(() => {
    const customMap = new Map(customPresets.map((c) => [c.id, c]));
    const builtInMerged = BUILT_IN_EXAM_PRESETS_CC0.map((b) => customMap.get(b.id) || b);
    const extras = customPresets.filter(
      (c) => !BUILT_IN_EXAM_PRESETS_CC0.some((b) => b.id === c.id)
    );
    return [...builtInMerged, ...extras];
  }, [customPresets]);

  const appliedExamPresets = useMemo(() => {
    const appliedSet = new Set(episodeStore.appliedPresetIds || []);
    return mergedExamPresets.filter((p) => appliedSet.has(p.id));
  }, [mergedExamPresets, episodeStore.appliedPresetIds]);

  const appliedPresetWidgetIds = useMemo(() => {
    const s = new Set<string>();
    for (const p of appliedExamPresets) {
      for (const wid of p.widgetsToEnable) s.add(wid);
    }
    return s;
  }, [appliedExamPresets]);

  const openSheet = (key: VisitSheetKey) => {
    if (isLocked) return;
    if (
      (CORE_BUILTIN_WIDGET_KEYS as readonly string[]).includes(key) &&
      !episodeStore.activeWidgetIds.includes(key)
    ) {
      onAddExamWidget(key);
    }
    setActiveSheet(key);
  };

  const closeSheet = () => setActiveSheet(null);

  const sessionType = session.data.sessionType;
  const isEvalPriority =
    sessionType === 'initial_evaluation' ||
    sessionType === 're_evaluation' ||
    sessionType === 'discharge_summary';

  const examWidgetKeys = useMemo(
    () =>
      Array.from(
        new Set([
          ...episodeStore.activeWidgetIds,
          ...CORE_BUILTIN_WIDGET_KEYS,
          ...Object.keys(episodeStore.customWidgetsData || {}),
          ...(enableProblemListGoals ? ['problems'] : []),
        ])
      ),
    [episodeStore.activeWidgetIds, episodeStore.customWidgetsData, enableProblemListGoals]
  );

  const examSummaries = useMemo(
    () =>
      examWidgetKeys.map((key) =>
        buildClinicalExamSummary(key, {
          episodeStore,
          customDefinitions,
          vitalsThresholds,
          language,
          bi,
        })
      ),
    [examWidgetKeys, episodeStore, customDefinitions, vitalsThresholds, language, bi]
  );

  const recordedExamSections = useMemo(
    () => examSummaries.filter((sec) => sec.hasData),
    [examSummaries]
  );

  const queuedExamSections = useMemo(() => {
    const romCount = (episodeStore.objective?.romBattery?.entries || []).length;
    const mmtCount = (episodeStore.objective?.mmtBattery?.entries || []).length;
    const testCount = (episodeStore.specialTests || []).length;
    const activeScale = episodeStore.functionalScales;

    return examSummaries
      .filter((sec) => !sec.hasData)
      .map((sec) => {
        let readyHint = '';
        if (sec.key === 'rom' && romCount > 0) {
          readyHint = bi(
            `${romCount} حركات جاهزة للقياس — اضغط لتسجيل الزوايا`,
            `${romCount} movements queued — tap to record ROM angles`,
            `${romCount} جووڵە ئامادەیە بۆ پێوانە`
          );
        } else if (sec.key === 'mmt' && mmtCount > 0) {
          readyHint = bi(
            `${mmtCount} عضلات جاهزة للتقييم — اضغط لتسجيل القوة`,
            `${mmtCount} muscles queued — tap to record MMT grade`,
            `${mmtCount} ماسولکە ئامادەیە بۆ هەڵسەنگاندن`
          );
        } else if (sec.key === 'special_tests' && testCount > 0) {
          readyHint = bi(
            `${testCount} اختبارات جاهزة — اضغط لتسجيل النتيجة (+/-)`,
            `${testCount} tests queued — tap to log outcomes (+/-)`,
            `${testCount} تاقیکردنەوە ئامادەیە (+/-)`
          );
        } else if (sec.key === 'functional_scales' && activeScale?.scaleId) {
          const code = activeScale.scaleId.toUpperCase();
          const arLabel = activeScale.scaleNameAr.includes(code)
            ? activeScale.scaleNameAr
            : `${code} (${activeScale.scaleNameAr})`;
          const enLabel = activeScale.scaleNameEn.includes(code)
            ? activeScale.scaleNameEn
            : `${code} (${activeScale.scaleNameEn})`;
          readyHint = bi(
            `${arLabel} — جاهز لإدخال النتيجة`,
            `${enLabel} — ready to score`,
            `${code} ئامادەیە بۆ نووسینی نمرە`
          );
        } else if (
          appliedPresetWidgetIds.has(sec.key) &&
          (sec.key === 'body_chart' || sec.key === 'neuro' || sec.key === 'gait_posture')
        ) {
          readyHint = bi(
            'مُجهّز ضمن قالب الفحص — اضغط للبدء بالتوثيق',
            'Enabled by exam preset — tap to document',
            'چالاککراوە لە تێمپلەیت — پەنجە بنێ بۆ تۆمارکردن'
          );
        }
        return readyHint ? { ...sec, readyHint } : null;
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [
    examSummaries,
    episodeStore.objective?.romBattery?.entries,
    episodeStore.objective?.mmtBattery?.entries,
    episodeStore.specialTests,
    episodeStore.functionalScales,
    appliedPresetWidgetIds,
    bi,
  ]);

  const hasSessionVitals = Boolean(
    formState.vitals &&
      (formState.vitals.bpSystolic !== undefined ||
        formState.vitals.bpDiastolic !== undefined ||
        formState.vitals.heartRateBpm !== undefined ||
        formState.vitals.spO2Percent !== undefined)
  );

  const vitalsAlerts = useMemo(
    () =>
      hasSessionVitals && formState.vitals
        ? evaluateVitalsAgainstThresholds(formState.vitals, vitalsThresholds)
        : [],
    [hasSessionVitals, formState.vitals, vitalsThresholds]
  );

  const hasAssessmentOrPlan = Boolean(
    formState.progressStatus ||
      formState.patientTolerance ||
      formState.clinicalImpression.trim() ||
      formState.nextSessionPlan.trim() ||
      formState.homeInstructions.trim() ||
      formState.interventionsSummary.trim() ||
      formState.clinicalObservations.trim()
  );

  const hasAnyOtherRows =
    appliedExamPresets.length > 0 ||
    recordedExamSections.length > 0 ||
    queuedExamSections.length > 0 ||
    formState.exercises.length > 0 ||
    formState.physicalAgents.length > 0 ||
    formState.modalitySafetyOverrides.length > 0 ||
    formState.manualTherapy.length > 0 ||
    (enableVitalsModule && hasSessionVitals) ||
    hasAssessmentOrPlan;

  const progressLabelMap: Record<Exclude<ProgressStatusOption, ''>, string> = {
    improved: bi('تحسن ملحوظ', 'Improved', 'باشبوونی بەرچاو'),
    unchanged: bi('دون تغيير', 'Unchanged', 'بێ گۆڕان'),
    plateau: bi('استقرار مرحلي', 'Plateau', 'جێگیربوون'),
    regressed: bi('تراجع الأعراض', 'Regressed', 'خراپتربوون'),
  };

  const renderEditCue = () =>
    !isLocked ? (
      <span className="text-xs font-semibold text-muted-foreground-1 inline-flex items-center gap-0.5 shrink-0 mt-0.5">
        <span>{bi('تعديل', 'Edit', 'دەستکاری')}</span>
        <ChevronLeft className="size-3.5 ltr:rotate-180" />
      </span>
    ) : null;

  const handleUnselectPresetFromPaper = (preset: RegionalExamPresetDefinition) => {
    if (isLocked) return;
    const next = removeExamPresetFromEpisodeStore(episodeStore, preset, mergedExamPresets);
    setEpisodeStore(next);
    ClinicOperationsService.saveEpisodeClinicalStore(next);
  };

  const renderActivePresetsBanner = () => {
    if (appliedExamPresets.length === 0) return null;
    const primaryPreset = appliedExamPresets[appliedExamPresets.length - 1];
    return (
      <div
        data-testid="visit-active-presets-banner"
        className="px-4 sm:px-5 py-3 bg-primary/[0.04] space-y-2"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <span className="inline-flex items-center gap-1 text-xs font-bold text-primary shrink-0">
              <Sparkles className="size-3.5 shrink-0" />
              <span>{bi('القوالب المفعّلة:', 'Active Presets:', 'تێمپلەیتە چالاکەکان:')}</span>
            </span>
            {appliedExamPresets.map((preset) => {
              const title =
                language === 'en'
                  ? preset.titleEn
                  : language === 'ckb'
                    ? preset.titleCkb
                    : preset.titleAr;
              return (
                <span
                  key={preset.id}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-primary text-primary-foreground text-xs font-semibold"
                >
                  <span>{title}</span>
                  {!isLocked && (
                    <button
                      type="button"
                      onClick={() => handleUnselectPresetFromPaper(preset)}
                      aria-label={bi(`إلغاء قالب ${title}`, `Remove ${title} preset`)}
                      className="compact-btn size-5 inline-flex items-center justify-center rounded-full hover:bg-primary-foreground/20 cursor-pointer"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </span>
              );
            })}
          </div>
          {!isLocked && (
            <button
              type="button"
              onClick={() => openSheet('presets')}
              className="compact-btn h-7 px-2.5 rounded-lg bg-surface/80 hover:bg-surface text-xs font-semibold text-foreground cursor-pointer shrink-0"
            >
              {bi('تغيير القوالب', 'Manage', 'گۆڕین')}
            </button>
          )}
        </div>
        {(primaryPreset.redFlagReminderAr || primaryPreset.redFlagReminderEn) && (
          <div className="flex items-start gap-1.5 text-xs text-rose-700 dark:text-rose-400">
            <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
            <span>
              {bi(primaryPreset.redFlagReminderAr, primaryPreset.redFlagReminderEn)}
            </span>
          </div>
        )}
      </div>
    );
  };

  const renderExamRows = () => (
    <>
      {renderActivePresetsBanner()}
      {recordedExamSections.map((sec) => (
        <button
          key={sec.key}
          type="button"
          data-testid={`visit-row-exam-${sec.key}`}
          disabled={isLocked}
          onClick={() => openSheet(sec.key)}
          className={`w-full px-4 sm:px-5 py-3.5 text-start transition-colors flex items-start justify-between gap-3 ${
            isLocked ? 'cursor-default' : 'hover:bg-surface/40 cursor-pointer'
          }`}
        >
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <div className="mt-0.5 shrink-0">{sec.icon}</div>
            <div className="min-w-0 flex-1 space-y-1">
              <h3 className="text-xs sm:text-sm font-bold text-foreground truncate">{sec.title}</h3>
              {sec.lines.map((line, idx) => (
                <p
                  key={idx}
                  className={`text-xs leading-relaxed line-clamp-2 ${TONE_CLASS_MAP[line.tone || 'default']}`}
                >
                  {line.label && (
                    <span className="font-semibold text-muted-foreground-1">{line.label}: </span>
                  )}
                  {line.ltr ? <bdi dir="ltr">{line.text}</bdi> : line.text}
                </p>
              ))}
            </div>
          </div>
          {renderEditCue()}
        </button>
      ))}
      {queuedExamSections.map((sec) => (
        <button
          key={`queued-${sec.key}`}
          type="button"
          data-testid={`visit-row-exam-${sec.key}`}
          disabled={isLocked}
          onClick={() => openSheet(sec.key)}
          className={`w-full px-4 sm:px-5 py-3 text-start transition-colors flex items-start justify-between gap-3 ${
            isLocked ? 'cursor-default' : 'hover:bg-surface/40 cursor-pointer'
          }`}
        >
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <div className="mt-0.5 shrink-0">{sec.icon}</div>
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xs sm:text-sm font-bold text-foreground truncate">
                  {sec.title}
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-bold">
                  {bi('جاهز للتقييم', 'Ready', 'ئامادە')}
                </span>
              </div>
              <p className="text-xs text-muted-foreground-1 leading-relaxed">{sec.readyHint}</p>
            </div>
          </div>
          {!isLocked && (
            <span className="text-xs font-semibold text-primary inline-flex items-center gap-0.5 shrink-0 mt-0.5">
              <span>{bi('تسجيل', 'Record', 'تۆمارکردن')}</span>
              <ChevronLeft className="size-3.5 ltr:rotate-180" />
            </span>
          )}
        </button>
      ))}
    </>
  );

  const renderInterventionRows = () => (
    <>
      {formState.exercises.length > 0 && (
        <button
          type="button"
          data-testid="visit-row-exercises"
          disabled={isLocked}
          onClick={() => openSheet('exercises')}
          className={`w-full px-4 sm:px-5 py-3.5 text-start transition-colors flex items-start justify-between gap-3 ${
            isLocked ? 'cursor-default' : 'hover:bg-surface/40 cursor-pointer'
          }`}
        >
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <Dumbbell className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1 space-y-1">
              <h3 className="text-xs sm:text-sm font-bold text-foreground truncate">
                {bi(
                  `التمارين العلاجية (${formState.exercises.length})`,
                  `Therapeutic Exercises (${formState.exercises.length})`,
                  `ڕاهێنانە چارەسەرییەکان (${formState.exercises.length})`
                )}
              </h3>
              <p className="text-xs text-foreground line-clamp-2 leading-relaxed">
                {formState.exercises
                  .slice(0, 3)
                  .map((ex) => {
                    const nm = bi(ex.nameAr, ex.nameEn) || bi('تمرين مخصص', 'Custom exercise');
                    return `${nm} (${ex.sets}×${ex.reps}${ex.loadOrBand ? ` · ${ex.loadOrBand}` : ''})`;
                  })
                  .join(' · ')}
                {formState.exercises.length > 3 ? ` (+${formState.exercises.length - 3})` : ''}
              </p>
            </div>
          </div>
          {renderEditCue()}
        </button>
      )}

      {(formState.physicalAgents.length > 0 || formState.modalitySafetyOverrides.length > 0) && (
        <button
          type="button"
          data-testid="visit-row-modalities"
          disabled={isLocked}
          onClick={() => openSheet('modalities')}
          className={`w-full px-4 sm:px-5 py-3.5 text-start transition-colors flex items-start justify-between gap-3 ${
            isLocked ? 'cursor-default' : 'hover:bg-surface/40 cursor-pointer'
          }`}
        >
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <Zap className="size-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1 space-y-1">
              <h3 className="text-xs sm:text-sm font-bold text-foreground truncate">
                {bi(
                  `الأجهزة والوسائل الفيزيائية (${formState.physicalAgents.length})`,
                  `Physical Modalities (${formState.physicalAgents.length})`,
                  `ئامێرە فیزیاییەکان (${formState.physicalAgents.length})`
                )}
              </h3>
              {formState.physicalAgents.length > 0 && (
                <p className="text-xs text-foreground line-clamp-2 leading-relaxed">
                  {formState.physicalAgents
                    .slice(0, 3)
                    .map(
                      (pa) =>
                        `${bi(pa.modalityAr || pa.modality, pa.modality)} (${pa.durationMinutes} ${bi('د', 'm', 'خ')})`
                    )
                    .join(' · ')}
                  {formState.physicalAgents.length > 3
                    ? ` (+${formState.physicalAgents.length - 3})`
                    : ''}
                </p>
              )}
              {formState.modalitySafetyOverrides.length > 0 && (
                <p
                  data-testid="session-modality-overrides-list"
                  className="text-xs font-semibold text-amber-700 dark:text-amber-400"
                >
                  {bi(
                    `تجاوز سلامة موثق (${formState.modalitySafetyOverrides.length})`,
                    `Safety override documented (${formState.modalitySafetyOverrides.length})`
                  )}
                </p>
              )}
            </div>
          </div>
          {renderEditCue()}
        </button>
      )}

      {formState.manualTherapy.length > 0 && (
        <button
          type="button"
          data-testid="visit-row-manual_therapy"
          disabled={isLocked}
          onClick={() => openSheet('manual_therapy')}
          className={`w-full px-4 sm:px-5 py-3.5 text-start transition-colors flex items-start justify-between gap-3 ${
            isLocked ? 'cursor-default' : 'hover:bg-surface/40 cursor-pointer'
          }`}
        >
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <Hand className="size-4 text-primary shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1 space-y-1">
              <h3 className="text-xs sm:text-sm font-bold text-foreground truncate">
                {bi(
                  `العلاج اليدوي (${formState.manualTherapy.length})`,
                  `Manual Therapy (${formState.manualTherapy.length})`,
                  `چارەسەری دەستی (${formState.manualTherapy.length})`
                )}
              </h3>
              <p className="text-xs text-foreground line-clamp-2 leading-relaxed">
                {formState.manualTherapy
                  .slice(0, 3)
                  .map(
                    (mt) =>
                      `${language !== 'en' ? mt.techniqueAr : mt.techniqueEn} · ${mt.gradeOrIntensity} (${mt.durationMinutes} ${bi('د', 'm', 'خ')})`
                  )
                  .join(' · ')}
                {formState.manualTherapy.length > 3
                  ? ` (+${formState.manualTherapy.length - 3})`
                  : ''}
              </p>
            </div>
          </div>
          {renderEditCue()}
        </button>
      )}

      {enableVitalsModule && hasSessionVitals && formState.vitals && (
        <button
          type="button"
          data-testid="visit-row-vitals"
          disabled={isLocked}
          onClick={() => openSheet('vitals')}
          className={`w-full px-4 sm:px-5 py-3.5 text-start transition-colors flex items-start justify-between gap-3 ${
            isLocked ? 'cursor-default' : 'hover:bg-surface/40 cursor-pointer'
          }`}
        >
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <HeartPulse className="size-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1 space-y-1">
              <h3 className="text-xs sm:text-sm font-bold text-foreground truncate">
                {bi('العلامات الحيوية للجلسة', 'Session Vitals', 'نیشانە زیندەییەکانی دانیشتن')}
              </h3>
              <p className="text-xs text-foreground font-mono" dir="ltr">
                {[
                  formState.vitals.bpSystolic !== undefined &&
                  formState.vitals.bpDiastolic !== undefined
                    ? `BP ${formState.vitals.bpSystolic}/${formState.vitals.bpDiastolic}`
                    : formState.vitals.bpSystolic !== undefined
                      ? `SBP ${formState.vitals.bpSystolic}`
                      : null,
                  formState.vitals.heartRateBpm !== undefined
                    ? `HR ${formState.vitals.heartRateBpm}`
                    : null,
                  formState.vitals.spO2Percent !== undefined
                    ? `SpO2 ${formState.vitals.spO2Percent}%`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {vitalsAlerts.length > 0 && (
                <p className="text-xs font-semibold text-rose-700 dark:text-rose-400">
                  {vitalsAlerts
                    .map((a) =>
                      language === 'en' ? a.labelEn : language === 'ckb' ? a.labelCkb : a.labelAr
                    )
                    .join(' · ')}
                </p>
              )}
            </div>
          </div>
          {renderEditCue()}
        </button>
      )}
    </>
  );

  // Picker Item Definitions (Jane App Add-Item Menu)
  const interventionPickerItems = [
    {
      key: 'subjective' as const,
      label: bi('الألم والشكوى اليوم', 'Pain & Chief Complaint', 'ئازار و سکاڵا'),
      icon: <Activity className="size-4 text-primary shrink-0" />,
      recorded:
        formState.prePainNrs !== undefined ||
        formState.postPainNrs !== undefined ||
        formState.chiefComplaint.trim().length > 0,
    },
    {
      key: 'exercises' as const,
      label: bi('تمارين علاجية', 'Therapeutic Exercises', 'ڕاهێنانی چارەسەری'),
      icon: <Dumbbell className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />,
      recorded: formState.exercises.length > 0,
      count: formState.exercises.length || undefined,
    },
    {
      key: 'modalities' as const,
      label: bi('أجهزة فيزيائية', 'Physical Modalities', 'ئامێری فیزیایی'),
      icon: <Zap className="size-4 text-amber-500 shrink-0" />,
      recorded: formState.physicalAgents.length > 0,
      count: formState.physicalAgents.length || undefined,
    },
    {
      key: 'manual_therapy' as const,
      label: bi('علاج يدوي', 'Manual Therapy', 'چارەسەری دەستی'),
      icon: <Hand className="size-4 text-sky-600 dark:text-sky-400 shrink-0" />,
      recorded: formState.manualTherapy.length > 0,
      count: formState.manualTherapy.length || undefined,
    },
    {
      key: 'assessment_plan' as const,
      label: bi('التقييم والخطة (SOAP)', 'Assessment & Plan', 'هەڵسەنگاندن و پلان'),
      icon: <FileCheck className="size-4 text-indigo-600 dark:text-indigo-400 shrink-0" />,
      recorded: hasAssessmentOrPlan,
    },
    ...(enableVitalsModule
      ? [
          {
            key: 'vitals' as const,
            label: bi('العلامات الحيوية', 'Session Vitals', 'نیشانە زیندەییەکان'),
            icon: <HeartPulse className="size-4 text-rose-600 shrink-0" />,
            recorded: hasSessionVitals,
          },
        ]
      : []),
  ];

  const examPickerItems = [
    {
      key: 'body_chart',
      label: bi('مخطط الجسم', 'Body Chart', 'هێڵکاری جەستە'),
      icon: <MapPin className="size-4 text-rose-500 shrink-0" />,
    },
    {
      key: 'rom',
      label: bi('المدى الحركي ROM', 'Range of Motion (ROM)', 'مەودای جووڵە ROM'),
      icon: <Activity className="size-4 text-primary shrink-0" />,
    },
    {
      key: 'mmt',
      label: bi('القوة العضلية MMT', 'Muscle Strength (MMT)', 'هێزی ماسولکە MMT'),
      icon: <Dumbbell className="size-4 text-sky-600 dark:text-sky-400 shrink-0" />,
    },
    {
      key: 'special_tests',
      label: bi('اختبارات خاصة', 'Special Tests', 'تاقیکردنەوە تایبەتەکان'),
      icon: <Stethoscope className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />,
    },
    {
      key: 'functional_scales',
      label: bi('المقاييس الوظيفية', 'Outcome Measures', 'پێوەرە فەرمانییەکان'),
      icon: <FileCheck className="size-4 text-indigo-600 dark:text-indigo-400 shrink-0" />,
    },
    {
      key: 'neuro',
      label: bi('الفحص العصبي', 'Neuro Screening', 'پشکنینی دەماری'),
      icon: <Brain className="size-4 text-purple-600 dark:text-purple-400 shrink-0" />,
    },
    {
      key: 'gait_posture',
      label: bi('المشي والقوام', 'Gait & Posture', 'ڕۆیشتن و وەستان'),
      icon: <Footprints className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />,
    },
    ...(enableProblemListGoals
      ? [
          {
            key: 'problems',
            label: bi('المشكلات والأهداف', 'Problems & Goals', 'کێشە و ئامانجەکان'),
            icon: <ListChecks className="size-4 text-primary shrink-0" />,
          },
        ]
      : []),
    {
      key: 'presets',
      label: bi('قوالب فحص جاهزة', 'Quick Exam Presets', 'تێمپلەیتی پشکنین'),
      icon: <Sparkles className="size-4 text-fuchsia-600 dark:text-fuchsia-400 shrink-0" />,
    },
  ];

  const sheetMeta = useMemo(() => {
    switch (activeSheet) {
      case 'picker':
        return {
          title: bi('إضافة للجلسة', 'Add to Session', 'زیادکردن بۆ دانیشتن'),
          subtitle: bi(
            'اختر البند الذي تريد توثيقه أو قياسه الآن',
            'Select a treatment, SOAP block, or exam tool to document'
          ),
        };
      case 'subjective':
        return {
          title: bi('الألم والشكوى اليوم', 'Pain & Chief Complaint', 'ئازار و سکاڵای ئەمڕۆ'),
          subtitle: bi('مقياس الألم قبل/بعد الجلسة والشكوى الحالية', 'Pre/post pain NPRS and subjective note'),
        };
      case 'exercises':
        return {
          title: bi('التمارين العلاجية المنفذة', 'Therapeutic Exercises', 'ڕاهێنانە چارەسەرییەکان'),
          subtitle: bi('أدرج تمارين اليوم أو انسخ تمارين الجلسة السابقة', 'Add today’s exercises or copy last session'),
        };
      case 'modalities':
        return {
          title: bi('الأجهزة والوسائل الفيزيائية', 'Physical Modalities', 'ئامێر و شێوازە فیزیاییەکان'),
          subtitle: bi('TENS · Ultrasound · NMES · حرارة · شد فقري', 'Select physical agents applied today'),
        };
      case 'manual_therapy':
        return {
          title: bi('العلاج اليدوي', 'Manual Therapy', 'چارەسەری دەستی'),
          subtitle: bi('توثيق التقنيات اليدوية والمفصل والمدة', 'Manual techniques, target joint & duration'),
        };
      case 'vitals':
        return {
          title: bi('العلامات الحيوية للجلسة', 'Session Vitals', 'نیشانە زیندەییەکان'),
          subtitle: bi('الضغط، النبض، ونسبة الأكسجة', 'BP, heart rate, and oxygen saturation'),
        };
      case 'assessment_plan':
        return {
          title: bi('التقييم السريري والخطة (SOAP)', 'Assessment & Plan (SOAP)', 'هەڵسەنگاندن و پلان (SOAP)'),
          subtitle: bi('تقدم الحالة والانطباع السريري وخطة الجلسة القادمة', 'Progress, clinical impression & next plan'),
        };
      case 'presets':
        return {
          title: bi('قوالب الفحص الإقليمي السريع', 'Quick Regional Exam Presets', 'تێمپلەیتەکانی پشکنین'),
          subtitle: bi('تجهيز أدوات الفحص والتذكيرات للمنطقة التشريحية', 'Activate regional tools and safety screens'),
        };
      default:
        if (!activeSheet) return null;
        return (
          examSummaries.find((s) => s.key === activeSheet) || {
            title: bi('أداة الفحص', 'Exam Tool', 'ئامرازی پشکنین'),
            subtitle: undefined,
          }
        );
    }
  }, [activeSheet, examSummaries, bi]);

  const sheetIsWidgetEditor = Boolean(
    activeSheet &&
      activeSheet !== 'picker' &&
      activeSheet !== 'subjective' &&
      activeSheet !== 'exercises' &&
      activeSheet !== 'modalities' &&
      activeSheet !== 'manual_therapy' &&
      activeSheet !== 'vitals' &&
      activeSheet !== 'assessment_plan' &&
      activeSheet !== 'presets' &&
      activeSheet !== 'problems'
  );

  const hasFreeTextExtraValues =
    showFreeTextExtras ||
    formState.interventionsSummary.trim().length > 0 ||
    formState.clinicalObservations.trim().length > 0;

  return (
    <div className="max-w-3xl mx-auto w-full">
      {/* ONE Serene Visit Paper */}
      <div className="rounded-2xl pr-surface overflow-hidden">
        {/* Paper Header (Single Row: Title + One Cliniko Copy Action) */}
        <div className="px-4 sm:px-5 py-3 border-b border-black/[0.045] dark:border-white/[0.06] flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-foreground truncate">
              {isEvalPriority
                ? bi('ورقة التقييم السريري', 'Clinical Evaluation Sheet', 'پەڕەی هەڵسەنگاندنی کلینیکی')
                : bi('ملخص الجلسة', 'Visit Note', 'پوختەی دانیشتن')}
            </h2>
            {copiedFromInfo && (
              <p className="text-xs text-amber-700 dark:text-amber-400 font-medium truncate">
                {bi(
                  `منسوخ مسبقاً من جلسة #${copiedFromInfo.sessionNumber}`,
                  `Copied forward from Session #${copiedFromInfo.sessionNumber}`,
                  `کۆپیکراو لە دانیشتنی #${copiedFromInfo.sessionNumber}`
                )}
              </p>
            )}
          </div>

          {!isLocked && (
            copiedFromInfo ? (
              <button
                type="button"
                onClick={onResetCopiedFields}
                className="compact-btn h-8 px-2.5 rounded-xl bg-surface/80 hover:bg-surface text-xs font-semibold text-foreground inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
              >
                <RotateCcw className="size-3.5 shrink-0" />
                <span>{bi('إفراغ المنسوخ', 'Clear Copied', 'سڕینەوەی کۆپیکراو')}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onCopyPreviousSessionManual}
                className="compact-btn h-8 px-2.5 rounded-xl bg-surface/80 hover:bg-surface text-xs font-semibold text-primary inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
              >
                <Copy className="size-3.5 shrink-0" />
                <span>{bi('نسخ الجلسة السابقة', 'Copy Last Session', 'کۆپیکردنی دانیشتنی پێشوو')}</span>
              </button>
            )
          )}
        </div>

        {/* Recorded Visit Rows (Zero Blank Boxes) */}
        <div className="divide-y divide-black/[0.045] dark:divide-white/[0.06]">
          {/* Row 1: Pain & Complaint (Always Present, Ultra-Compact) */}
          <button
            type="button"
            data-testid="visit-row-subjective"
            disabled={isLocked}
            onClick={() => openSheet('subjective')}
            className={`w-full px-4 sm:px-5 py-3.5 text-start transition-colors flex items-start justify-between gap-3 ${
              isLocked ? 'cursor-default' : 'hover:bg-surface/40 cursor-pointer'
            }`}
          >
            <div className="flex items-start gap-2.5 min-w-0 flex-1">
              <Activity className="size-4 text-primary shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h3 className="text-xs sm:text-sm font-bold text-foreground">
                    {bi('الألم والشكوى اليوم', 'Pain & Complaint Today', 'ئازار و سکاڵای ئەمڕۆ')}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
                    {formState.prePainNrs !== undefined ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="text-muted-foreground-1">{bi('قبل:', 'Pre:', 'پێش:')}</span>
                        <span className={`font-mono font-bold ${nprsTextColor(formState.prePainNrs)}`}>
                          <Fraction value={formState.prePainNrs} total={10} />
                        </span>
                      </span>
                    ) : formState.prePainNotRecorded ? (
                      <span className="text-muted-foreground-1">
                        {bi('قبل: غير مسجل', 'Pre: N/R')}
                      </span>
                    ) : null}

                    {formState.postPainNrs !== undefined ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="text-muted-foreground-1">{bi('بعد:', 'Post:', 'دوای:')}</span>
                        <span className={`font-mono font-bold ${nprsTextColor(formState.postPainNrs)}`}>
                          <Fraction value={formState.postPainNrs} total={10} />
                        </span>
                      </span>
                    ) : formState.postPainNotRecorded ? (
                      <span className="text-muted-foreground-1">
                        {bi('بعد: غير مسجل', 'Post: N/R')}
                      </span>
                    ) : null}

                    {formState.prePainNrs === undefined &&
                      !formState.prePainNotRecorded &&
                      formState.postPainNrs === undefined &&
                      !formState.postPainNotRecorded && (
                        <span className="text-muted-foreground-1">
                          {isLocked
                            ? bi('غير مسجّل في هذه الجلسة', 'Not recorded in this session', 'تۆمار نەکراوە')
                            : bi('لم يُسجل الألم بعد', 'Tap to record pain NPRS', 'ئازار هێشتا تۆمار نەکراوە')}
                        </span>
                      )}
                  </div>
                </div>

                {formState.chiefComplaint.trim() && (
                  <p className="text-xs text-foreground line-clamp-2 leading-relaxed">
                    {formState.chiefComplaint}
                  </p>
                )}

                {formState.symptomChanges.trim() && (
                  <p className="text-xs text-muted-foreground-1 line-clamp-1 leading-relaxed">
                    <span className="font-semibold">{bi('تغير الأعراض:', 'Changes:')} </span>
                    {formState.symptomChanges}
                  </p>
                )}
              </div>
            </div>
            {renderEditCue()}
          </button>

          {/* Adaptive Order: Initial/Re-Eval shows Exam rows first; Follow-up shows Interventions first */}
          {isEvalPriority ? (
            <>
              {renderExamRows()}
              {renderInterventionRows()}
            </>
          ) : (
            <>
              {renderInterventionRows()}
              {renderExamRows()}
            </>
          )}

          {/* Row: Assessment & Plan (Only when populated) */}
          {hasAssessmentOrPlan && (
            <button
              type="button"
              data-testid="visit-row-assessment_plan"
              disabled={isLocked}
              onClick={() => openSheet('assessment_plan')}
              className={`w-full px-4 sm:px-5 py-3.5 text-start transition-colors flex items-start justify-between gap-3 ${
                isLocked ? 'cursor-default' : 'hover:bg-surface/40 cursor-pointer'
              }`}
            >
              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                <FileCheck className="size-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xs sm:text-sm font-bold text-foreground">
                      {bi('التقييم والخطة (SOAP)', 'Assessment & Plan', 'هەڵسەنگاندن و پلان')}
                    </h3>
                    {formState.progressStatus && (
                      <span className="text-xs font-semibold text-primary">
                        · {progressLabelMap[formState.progressStatus]}
                      </span>
                    )}
                  </div>
                  {formState.clinicalImpression.trim() && (
                    <p className="text-xs text-foreground line-clamp-2 leading-relaxed">
                      {formState.clinicalImpression}
                    </p>
                  )}
                  {formState.nextSessionPlan.trim() && (
                    <p className="text-xs text-muted-foreground-1 line-clamp-1 leading-relaxed">
                      <span className="font-semibold">{bi('القادم:', 'Next:')} </span>
                      {formState.nextSessionPlan}
                    </p>
                  )}
                  {formState.homeInstructions.trim() && (
                    <p className="text-xs text-muted-foreground-1 line-clamp-1 leading-relaxed">
                      <span className="font-semibold">{bi('المنزلي:', 'HEP:')} </span>
                      {formState.homeInstructions}
                    </p>
                  )}
                </div>
              </div>
              {renderEditCue()}
            </button>
          )}
        </div>

        {/* Calm Onboarding Hint when Blank */}
        {!hasAnyOtherRows && !isLocked && (
          <div className="px-4 sm:px-5 py-3 text-xs text-muted-foreground-1 border-t border-black/[0.045] dark:border-white/[0.06]">
            {isEvalPriority
              ? bi(
                  'اضغط «+ إضافة للجلسة» لاختيار أدوات الفحص (مخطط الجسم، ROM، MMT، اختبارات خاصة) والخطة.',
                  'Tap "+ Add to Session" to add clinical exam tools (Body Chart, ROM, MMT, Special Tests) and plan.'
                )
              : bi(
                  'ابدأ بنسخ علاج الجلسة السابقة، أو اضغط «+ إضافة للجلسة» لتوثيق ما تم اليوم.',
                  'Start by copying last session, or tap "+ Add to Session" to document today’s care.'
                )}
          </div>
        )}

        {/* ONE Clean Bottom "+ إضافة للجلسة" Trigger */}
        {!isLocked && (
          <div className="px-4 sm:px-5 py-3.5 bg-surface/35 border-t border-black/[0.045] dark:border-white/[0.06]">
            <button
              type="button"
              data-testid="session-add-item-btn"
              onClick={() => openSheet('picker')}
              className="w-full compact-btn h-10 px-4 rounded-xl bg-primary/10 hover:bg-primary/15 text-primary text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Plus className="size-4 shrink-0" />
              <span>{bi('إضافة للجلسة', 'Add to Session', 'زیادکردن بۆ دانیشتن')}</span>
            </button>
          </div>
        )}
      </div>

      {/* Dedicated Bottom Sheet / Modal Editor */}
      <ModalDialog
        isOpen={activeSheet !== null && !isSafetyOverrideOpen}
        onOpenChange={(open) => {
          if (!open) closeSheet();
        }}
        dir={isRtl ? 'rtl' : 'ltr'}
        size="lg"
        title={sheetMeta?.title || ''}
        subtitle={sheetMeta?.subtitle}
        closeLabel={bi('إغلاق', 'Close', 'داخستن')}
        footer={
          activeSheet && activeSheet !== 'picker' ? (
            <div className="flex items-center justify-between gap-2 w-full">
              <button
                type="button"
                onClick={() => setActiveSheet('picker')}
                className="compact-btn h-9 px-3 rounded-xl bg-surface/80 hover:bg-surface text-foreground text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowRight className="size-3.5 rtl:rotate-0 ltr:rotate-180 shrink-0" />
                <span>{bi('قائمة الإضافة', 'Add Menu', 'لیستی زیادکردن')}</span>
              </button>

              <button
                type="button"
                onClick={closeSheet}
                className="compact-btn h-9 px-4 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold cursor-pointer"
              >
                {bi('تم', 'Done', 'تەواو')}
              </button>
            </div>
          ) : undefined
        }
      >
        {/* 1. PICKER SHEET ("+ إضافة للجلسة") */}
        {activeSheet === 'picker' && (
          <div className="space-y-4">
            {(isEvalPriority ? ['exam', 'session'] : ['session', 'exam']).map((group) =>
              group === 'session' ? (
                <div key="session" className="space-y-2">
                  <span className="text-xs font-bold text-muted-foreground-1 block">
                    {bi('العلاج وتوثيق الجلسة', 'Session Care & SOAP', 'چارەسەر و تۆمارکردنی دانیشتن')}
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {interventionPickerItems.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        data-testid={`picker-item-${item.key}`}
                        onClick={() => openSheet(item.key)}
                        className="compact-btn px-3 py-2.5 rounded-xl bg-surface/65 hover:bg-surface text-start flex items-center justify-between gap-2 transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          {item.icon}
                          <span className="text-xs font-semibold text-foreground truncate">
                            {item.label}
                          </span>
                        </span>
                        {item.count ? (
                          <span className="text-xs font-mono font-bold text-primary shrink-0">
                            {item.count}
                          </span>
                        ) : item.recorded ? (
                          <Check className="size-3.5 text-emerald-600 shrink-0" />
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div key="exam" className="space-y-2">
                  <span className="text-xs font-bold text-muted-foreground-1 block">
                    {bi('الفحص والقياسات السريرية', 'Clinical Examination Tools', 'ئامرازەکانی پشکنینی کلینیکی')}
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {examPickerItems.map((item) => {
                      const summary = examSummaries.find((s) => s.key === item.key);
                      return (
                        <button
                          key={item.key}
                          type="button"
                          data-testid={`picker-item-${item.key}`}
                          onClick={() => openSheet(item.key)}
                          className="compact-btn px-3 py-2.5 rounded-xl bg-surface/65 hover:bg-surface text-start flex items-center justify-between gap-2 transition-colors cursor-pointer"
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            {item.icon}
                            <span className="text-xs font-semibold text-foreground truncate">
                              {item.label}
                            </span>
                          </span>
                          {summary?.hasData && (
                            <Check className="size-3.5 text-emerald-600 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )
            )}

            {/* Quick 1-Tap Chips Inside Picker Only (Zero Main-Screen Clutter) */}
            <div className="pt-3 border-t border-black/[0.045] dark:border-white/[0.06] space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-muted-foreground-1">
                  {bi('إدراج سريع بلمسة واحدة:', '1-Tap Quick Insert:', 'دانان بە یەک کرتە:')}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    closeSheet();
                    onOpenChipEditor();
                  }}
                  className="compact-btn h-7 px-2 rounded-lg bg-surface/80 hover:bg-surface text-xs font-semibold text-primary inline-flex items-center gap-1 cursor-pointer"
                >
                  <SlidersHorizontal className="size-3 shrink-0" />
                  <span>{bi('تخصيص', 'Customize', 'تایبەتمەندکردن')}</span>
                </button>
              </div>
              {favoriteChips.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {favoriteChips.map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() => {
                        onApplyFavoriteChip(chip);
                        if (chip.category === 'exercise') setActiveSheet('exercises');
                        else if (chip.category === 'manual') setActiveSheet('manual_therapy');
                        else setActiveSheet('modalities');
                      }}
                      className="compact-btn h-8 px-2.5 rounded-xl bg-surface/75 hover:bg-surface text-xs font-semibold text-foreground hover:text-primary transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
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
              )}
            </div>
          </div>
        )}

        {/* 2. SUBJECTIVE SHEET (Pain NPRS + Complaint + Changes) */}
        {activeSheet === 'subjective' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-2xl bg-surface/65">
                <NprsControl
                  value={formState.prePainNotRecorded ? undefined : formState.prePainNrs}
                  notRecorded={formState.prePainNotRecorded}
                  showNotRecordedOption
                  disabled={isLocked}
                  label={bi(
                    'شدة الألم قبل الجلسة (NPRS 0–10):',
                    'Pre-Session Pain (NPRS 0–10):',
                    'توندی ئازار پێش دانیشتن (NPRS 0–10):'
                  )}
                  onChange={(val) => onPainChange('pre', val)}
                  onToggleNotRecorded={() => onPainToggleNotRecorded('pre')}
                />
              </div>

              <div className="p-3.5 rounded-2xl bg-surface/65">
                <NprsControl
                  value={formState.postPainNotRecorded ? undefined : formState.postPainNrs}
                  notRecorded={formState.postPainNotRecorded}
                  showNotRecordedOption
                  disabled={isLocked}
                  label={bi(
                    'شدة الألم بعد انتهاء الجلسة (NPRS 0–10):',
                    'Post-Session Pain (NPRS 0–10):',
                    'توندی ئازار دوای تەواوبوونی دانیشتن (NPRS 0–10):'
                  )}
                  onChange={(val) => onPainChange('post', val)}
                  onToggleNotRecorded={() => onPainToggleNotRecorded('post')}
                />
              </div>
            </div>

            {formState.legacyPainDetail && (
              <div className="p-3 rounded-xl bg-surface/65 text-xs text-muted-foreground-2 flex flex-wrap items-center gap-3">
                <span className="font-bold text-muted-foreground-1">
                  {bi('تفاصيل ألم سابقة (قراءة فقط):', 'Preserved Legacy Pain (Read-Only):')}
                </span>
                {formState.legacyPainDetail.scoreAtRest !== undefined && (
                  <span className="font-mono">
                    {bi('راحة:', 'Rest:')}{' '}
                    <Fraction value={formState.legacyPainDetail.scoreAtRest} total={10} />
                  </span>
                )}
                {formState.legacyPainDetail.scoreWithMovement !== undefined && (
                  <span className="font-mono">
                    {bi('حركة:', 'Move:')}{' '}
                    <Fraction value={formState.legacyPainDetail.scoreWithMovement} total={10} />
                  </span>
                )}
                {formState.legacyPainDetail.contextNotes && (
                  <span>{formState.legacyPainDetail.contextNotes}</span>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
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
                  className={`w-full px-3 py-2 text-xs rounded-xl bg-surface/80 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 ${
                    getCopiedFieldStatus('chiefComplaint') === 'copied'
                      ? 'ring-1 ring-amber-500/40'
                      : getCopiedFieldStatus('chiefComplaint') === 'edited'
                        ? 'ring-1 ring-emerald-500/40'
                        : ''
                  }`}
                />
              </div>

              <div>
                <label htmlFor="soap-symptom-changes" className="text-xs font-semibold text-foreground block mb-1">
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
                  className="w-full px-3 py-2 text-xs rounded-xl bg-surface/80 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
                />
              </div>
            </div>
          </div>
        )}

        {/* 3. EXERCISES SHEET (Mobile-First Cards, 0px Overflow) */}
        {activeSheet === 'exercises' && (
          <div className="space-y-3.5">
            {!isLocked && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={onCarryForwardPreviousFlowsheet}
                    className="compact-btn h-8 px-2.5 rounded-xl bg-surface/80 hover:bg-surface text-foreground text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Copy className="size-3.5 text-primary shrink-0" />
                    <span>{bi('نسخ تمارين الجلسة السابقة', 'Copy Previous Flowsheet')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={onAddManualExercise}
                    className="compact-btn h-8 px-2.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="size-3.5 shrink-0" />
                    <span>{bi('تمرين يدوي', 'Manual Exercise')}</span>
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <select
                    value={selectedCatalogExId}
                    onChange={(e) => setSelectedCatalogExId(e.target.value)}
                    aria-label={bi('اختر تمريناً من الكتالوج', 'Select exercise from catalog')}
                    className="flex-1 min-w-0 w-0 h-9 px-2.5 rounded-xl text-xs bg-surface/80 text-foreground"
                  >
                    {(() => {
                      const grouped = PT_EXERCISE_CATALOG.reduce<
                        Record<string, typeof PT_EXERCISE_CATALOG>
                      >((acc, item) => {
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
                    onClick={onAddExerciseFromCatalog}
                    className="compact-btn h-9 px-3 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center gap-1 cursor-pointer shrink-0 whitespace-nowrap"
                  >
                    <Plus className="size-3.5 shrink-0" />
                    <span>{bi('إدراج تمرين', 'Add Exercise')}</span>
                  </button>
                </div>
              </div>
            )}

            {formState.exercises.length === 0 ? (
              <p className="text-xs text-muted-foreground-1 text-center py-6">
                {bi(
                  'اختر تمريناً واضغط «إدراج تمرين» أو انسخ تمارين الجلسة السابقة.',
                  'Select an exercise and tap "Add Exercise" or copy previous flowsheet.'
                )}
              </p>
            ) : (
              <div className="space-y-2.5">
                {formState.exercises.map((ex, idx) => {
                  const setsKey = `${ex.id}_sets`;
                  const repsKey = `${ex.id}_reps`;
                  const holdKey = `${ex.id}_hold`;
                  return (
                    <div
                      key={ex.id}
                      className="p-3 rounded-2xl bg-surface/65 space-y-2.5 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
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
                            className="flex-1 min-w-0 w-0 px-2.5 py-1.5 rounded-xl bg-card font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        ) : (
                          <span className="font-bold text-foreground truncate">
                            {bi(ex.nameAr, ex.nameEn)}
                          </span>
                        )}

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
                            className="compact-btn size-7 inline-flex items-center justify-center rounded-lg text-muted-foreground-2 hover:text-rose-600 cursor-pointer shrink-0"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-2 tabular-nums">
                        <div>
                          <label className="text-xs text-muted-foreground-1 block mb-0.5">
                            {bi('جولات', 'Sets', 'گەڕ')}
                          </label>
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
                                onMarkDirty();
                              }
                            }}
                            className={`w-full px-2 py-1.5 rounded-xl bg-card font-mono text-center text-foreground ${
                              numericErrors[setsKey] ? 'ring-1 ring-rose-500 text-rose-600' : ''
                            }`}
                          />
                        </div>

                        <div>
                          <label className="text-xs text-muted-foreground-1 block mb-0.5">
                            {bi('تكرار', 'Reps', 'دووبارەبوونەوە')}
                          </label>
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
                                onMarkDirty();
                              }
                            }}
                            className={`w-full px-2 py-1.5 rounded-xl bg-card font-mono text-center text-foreground ${
                              numericErrors[repsKey] ? 'ring-1 ring-rose-500 text-rose-600' : ''
                            }`}
                          />
                        </div>

                        <div>
                          <label className="text-xs text-muted-foreground-1 block mb-0.5">
                            {bi('ثبات (ث)', 'Hold (s)', 'مانەوە (چ)')}
                          </label>
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
                                onMarkDirty();
                              }
                            }}
                            className={`w-full px-2 py-1.5 rounded-xl bg-card font-mono text-center text-foreground ${
                              numericErrors[holdKey] ? 'ring-1 ring-rose-500 text-rose-600' : ''
                            }`}
                          />
                        </div>
                      </div>

                      {(numericErrors[setsKey] || numericErrors[repsKey] || numericErrors[holdKey]) && (
                        <p className="text-xs text-rose-600">
                          {numericErrors[setsKey] || numericErrors[repsKey] || numericErrors[holdKey]}
                        </p>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-muted-foreground-1 block mb-0.5">
                            {bi('المقاومة / الوزن', 'Load / Band', 'بەرگری / کێش')}
                          </label>
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
                            className="w-full px-2.5 py-1.5 rounded-xl bg-card font-mono text-foreground"
                          />
                        </div>

                        <div>
                          <label className="text-xs text-muted-foreground-1 block mb-0.5">
                            {bi('الاستجابة', 'Response', 'وەڵامدانەوە')}
                          </label>
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
                            className="w-full px-2.5 py-1.5 rounded-xl bg-card text-foreground"
                          >
                            <option value="pain_free">{bi('دون ألم', 'Pain-free', 'بێ ئازار')}</option>
                            <option value="mild_discomfort">
                              {bi('شد خفيف مقبول', 'Mild discomfort')}
                            </option>
                            <option value="painful_modified">
                              {bi('مؤلم - تم التعديل', 'Modified')}
                            </option>
                          </select>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 4. MODALITIES SHEET */}
        {activeSheet === 'modalities' && (
          <div className="space-y-3.5">
            {!isLocked && (
              <div className="flex flex-wrap items-center gap-1.5">
                {QUICK_MODALITY_BUTTONS.map((btn) => (
                  <button
                    key={btn.mod}
                    type="button"
                    data-testid={`add-modality-${btn.mod}`}
                    onClick={() => onAddPhysicalAgent(btn.mod, btn.ar, btn.params)}
                    className="compact-btn h-8 px-2.5 rounded-xl bg-surface/80 hover:bg-primary/10 hover:text-primary text-xs font-semibold text-foreground transition-colors cursor-pointer whitespace-nowrap"
                  >
                    + {bi(btn.ar, btn.mod, btn.ckb)}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={onAddManualPhysicalAgent}
                  className="compact-btn h-8 px-2.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                >
                  + {bi('إضافة يدوي', 'Manual Entry', 'زیادکردنی دەستی')}
                </button>
              </div>
            )}

            {formState.modalitySafetyOverrides.length > 0 && (
              <div
                data-testid="session-modality-overrides-list"
                className="p-3 rounded-xl bg-surface/65 space-y-1 text-xs"
              >
                <div className="font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  <span>
                    {bi(
                      'تجاوزات سلامة الوسائل الفيزيائية الموثقة:',
                      'Documented Modality Safety Overrides:'
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

            {formState.physicalAgents.length === 0 ? (
              <p className="text-xs text-muted-foreground-1 text-center py-4">
                {bi(
                  'اضغط على أي جهاز أعلاه لإضافته إلى هذه الجلسة.',
                  'Tap any modality above to add it to this session.'
                )}
              </p>
            ) : (
              <div className="space-y-2.5">
                {formState.physicalAgents.map((pa, idx) => {
                  const durKey = `${pa.id}_duration`;
                  const isDefaultPrefill = Boolean(prefillParameterIds[pa.id]);
                  return (
                    <div key={pa.id} className="p-3 rounded-2xl bg-surface/65 space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-primary min-w-0 flex-1">
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
                              placeholder={bi('اسم الجهاز / الوسيلة', 'Modality name')}
                              className="w-full px-2 py-1 rounded-lg bg-card text-xs font-bold text-primary focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                          ) : (
                            bi(pa.modalityAr || pa.modality, pa.modality)
                          )}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          {isDefaultPrefill && (
                            <span className="text-amber-700 dark:text-amber-400 text-xs font-bold">
                              {bi('افتراضي — تحقق', 'default - verify')}
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
                              className="compact-btn size-7 inline-flex items-center justify-center rounded-lg text-muted-foreground-2 hover:text-rose-600 cursor-pointer"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label htmlFor={`pa-site-${pa.id}`} className="text-xs text-muted-foreground-1 block mb-0.5">
                            {bi('المنطقة المستهدفة', 'Target Site')}
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
                            className="w-full px-2.5 py-1.5 rounded-xl bg-card text-foreground"
                          />
                        </div>

                        <div>
                          <label htmlFor={`pa-params-${pa.id}`} className="text-xs text-muted-foreground-1 block mb-0.5">
                            {bi('المعاملات', 'Parameters')}
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
                            className="w-full px-2.5 py-1.5 rounded-xl bg-card font-mono text-xs text-foreground"
                          />
                        </div>

                        <div>
                          <label htmlFor={`pa-duration-${pa.id}`} className="text-xs text-muted-foreground-1 block mb-0.5">
                            {bi('المدة (دقيقة)', 'Duration (m)')}
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
                                onMarkDirty();
                              }
                            }}
                            className={`w-full px-2 py-1.5 rounded-xl bg-card font-mono text-center text-foreground ${
                              numericErrors[durKey] ? 'ring-1 ring-rose-500 text-rose-600' : ''
                            }`}
                          />
                          {numericErrors[durKey] && (
                            <p className="text-xs text-rose-600 mt-0.5">{numericErrors[durKey]}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 5. MANUAL THERAPY SHEET */}
        {activeSheet === 'manual_therapy' && (
          <div className="space-y-3.5">
            {!isLocked && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-muted-foreground-1">
                    {bi(
                      'إضافة سريعة لأبرز تقنيات العلاج اليدوي:',
                      'Quick-Add Manual Therapy Techniques:',
                      'زیادکردنی خێرای تەکنیکەکانی چارەسەری دەستی:'
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => onAddManualTherapy()}
                    className="compact-btn h-7 px-2.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold inline-flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <Plus className="size-3.5 shrink-0" />
                    <span>{bi('تقنية مخصصة', 'Custom', 'تەکنیکی تایبەت')}</span>
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {MANUAL_THERAPY_TECHNIQUE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      data-testid={`add-mt-${preset.id}`}
                      onClick={() => onAddManualTherapy(preset)}
                      className="compact-btn h-8 px-2.5 rounded-xl bg-surface/80 hover:bg-primary/10 hover:text-primary text-xs font-semibold text-foreground transition-colors cursor-pointer whitespace-nowrap"
                    >
                      + {bi(preset.shortAr, preset.shortEn, preset.shortCkb)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {formState.manualTherapy.length === 0 ? (
              <p className="text-xs text-muted-foreground-1 text-center py-4">
                {bi(
                  'اضغط على أي تقنية أعلاه لإضافتها وتحديد المفصل والدرجة والمدة.',
                  'Tap any technique above to log target tissue, grade/mode, and duration.',
                  'پەنجە بنێ بە هەر تەکنیکێک لە سەرەوە بۆ تۆمارکردنی جومگە و پلە و ماوە.'
                )}
              </p>
            ) : (
              formState.manualTherapy.map((mt, idx) => {
                const durKey = `${mt.id}_duration`;
                return (
                  <div key={mt.id} className="p-3 rounded-2xl bg-surface/65 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="text"
                        disabled={isLocked}
                        aria-label={bi('اسم التقنية اليدوية', 'Manual therapy technique')}
                        placeholder={bi('اسم التقنية اليدوية', 'Manual therapy technique')}
                        value={language !== 'en' ? mt.techniqueAr : mt.techniqueEn}
                        onChange={(e) => {
                          const next = [...formState.manualTherapy];
                          next[idx] =
                            language !== 'en'
                              ? { ...mt, techniqueAr: e.target.value }
                              : { ...mt, techniqueEn: e.target.value };
                          updateField('manualTherapy', next);
                        }}
                        className="flex-1 min-w-0 w-0 px-2.5 py-1.5 rounded-xl bg-card font-semibold text-foreground"
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
                          className="compact-btn size-7 inline-flex items-center justify-center rounded-lg text-muted-foreground-2 hover:text-rose-600 cursor-pointer shrink-0"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label htmlFor={`mt-target-${mt.id}`} className="text-xs text-muted-foreground-1 block mb-0.5">
                          {bi('المفصل / النسيج', 'Target Joint/Tissue', 'جومگە / شانە')}
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
                          className="w-full px-2.5 py-1.5 rounded-xl bg-card text-foreground"
                        />
                      </div>

                      <div>
                        <label htmlFor={`mt-grade-${mt.id}`} className="text-xs text-muted-foreground-1 block mb-0.5">
                          {bi('الدرجة / التقنية', 'Grade / Mode', 'پلە / تەکنیک')}
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
                                e.target.value as ManualTherapyGradeOrIntensity,
                            };
                            updateField('manualTherapy', next);
                          }}
                          className="w-full px-2.5 py-1.5 rounded-xl bg-card text-foreground"
                        >
                          <optgroup label={bi('تحريك ومعالجة المفاصل والعمود الفقري', 'Joint Mobilization & Traction', 'جووڵاندنی جومگە')}>
                            {MANUAL_THERAPY_GRADE_OPTIONS.filter((o) => o.group === 'joint').map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {bi(opt.labelAr, opt.labelEn, opt.labelCkb)}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label={bi('الأنسجة الرخوة والأعصاب والعضلات', 'Soft Tissue, MET, PNF & Neural', 'شانەی نەرم و دەمار')}>
                            {MANUAL_THERAPY_GRADE_OPTIONS.filter((o) => o.group === 'soft_neuro').map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {bi(opt.labelAr, opt.labelEn, opt.labelCkb)}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                      </div>

                      <div>
                        <label htmlFor={`mt-duration-${mt.id}`} className="text-xs text-muted-foreground-1 block mb-0.5">
                          {bi('المدة (دقيقة)', 'Duration (m)', 'ماوە (خ)')}
                        </label>
                        <div className="flex items-center gap-1">
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
                                onMarkDirty();
                              }
                            }}
                            className={`w-full px-2 py-1.5 rounded-xl bg-card font-mono text-center text-foreground ${
                              numericErrors[durKey] ? 'ring-1 ring-rose-500 text-rose-600' : ''
                            }`}
                          />
                          {!isLocked && (
                            <div className="flex items-center gap-0.5 shrink-0">
                              {[5, 10, 15].map((mins) => (
                                <button
                                  key={mins}
                                  type="button"
                                  onClick={() => {
                                    setNumericDrafts((prev) => ({ ...prev, [durKey]: String(mins) }));
                                    const next = [...formState.manualTherapy];
                                    next[idx] = { ...mt, durationMinutes: mins };
                                    updateField('manualTherapy', next);
                                  }}
                                  className={`h-7 px-1.5 rounded-lg font-mono text-xs cursor-pointer ${
                                    mt.durationMinutes === mins
                                      ? 'bg-primary text-primary-foreground font-bold'
                                      : 'bg-card text-muted-foreground-1 hover:text-foreground'
                                  }`}
                                >
                                  {mins}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        {numericErrors[durKey] && (
                          <p className="text-xs text-rose-600 mt-0.5">{numericErrors[durKey]}</p>
                        )}
                      </div>
                    </div>

                    {/* Quick anatomical target suggestions */}
                    {!isLocked && (
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {MANUAL_THERAPY_TARGET_CHIPS.map((tc) => {
                          const targetText = bi(tc.ar, tc.en, tc.ckb);
                          const isSelectedTarget = mt.targetJointOrTissue === targetText;
                          return (
                            <button
                              key={tc.en}
                              type="button"
                              onClick={() => {
                                const next = [...formState.manualTherapy];
                                next[idx] = { ...mt, targetJointOrTissue: targetText };
                                updateField('manualTherapy', next);
                              }}
                              className={`px-2 py-0.5 rounded-lg text-xs cursor-pointer transition-colors ${
                                isSelectedTarget
                                  ? 'bg-primary/15 text-primary font-bold'
                                  : 'bg-card/80 hover:bg-card text-muted-foreground-1 hover:text-foreground'
                              }`}
                            >
                              {targetText}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Patient response / immediate effect note */}
                    <div>
                      <input
                        type="text"
                        disabled={isLocked}
                        aria-label={bi('استجابة المريض بعد التقنية', 'Patient response after technique')}
                        placeholder={bi(
                          'استجابة المريض الفورية (مثال: تحسن المدى الحركي وتراجع الألم)...',
                          'Immediate response (e.g., increased ROM, decreased pain)...',
                          'وەڵامدانەوەی دەستبەجێی نەخۆش...'
                        )}
                        value={mt.patientResponse || ''}
                        onChange={(e) => {
                          const next = [...formState.manualTherapy];
                          next[idx] = { ...mt, patientResponse: e.target.value };
                          updateField('manualTherapy', next);
                        }}
                        className="w-full px-2.5 py-1.5 rounded-xl bg-card text-xs text-foreground"
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* 6. VITALS SHEET */}
        {activeSheet === 'vitals' && enableVitalsModule && (
          <Suspense
            fallback={
              <div className="py-6 text-center text-xs text-muted-foreground-1">
                {bi('جاري تحميل العلامات الحيوية...', 'Loading vitals...')}
              </div>
            }
          >
            <VitalsPanel
              value={formState.vitals}
              history={episodeStore.vitalsHistory || []}
              onChange={(v: SessionVitalsEntry | undefined) => updateField('vitals', v)}
              readOnly={isLocked}
            />
          </Suspense>
        )}

        {/* 7. ASSESSMENT & PLAN SHEET */}
        {activeSheet === 'assessment_plan' && (
          <div className="space-y-3.5 text-xs">
            <div className="flex items-center justify-between text-muted-foreground-1">
              <span>
                {bi('مسجل بواسطة:', 'Recorded by:')}{' '}
                <strong className="text-foreground">{recordedByName}</strong>
              </span>
            </div>

            {derivedFlowsheetSummary && (
              <div className="p-3 rounded-xl bg-surface/65 space-y-1">
                <span className="font-bold text-primary block">
                  {bi('ملخص التدخلات المشتق:', 'Derived Flowsheet Summary:')}
                </span>
                <p className="text-foreground font-mono text-xs">{derivedFlowsheetSummary}</p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="soap-progress-status" className="font-bold text-foreground block mb-1">
                  {bi('مسار تقدم الحالة *:', 'Progress Status *:')}
                </label>
                <select
                  id="soap-progress-status"
                  disabled={isLocked}
                  value={formState.progressStatus}
                  onChange={(e) =>
                    updateField('progressStatus', e.target.value as ProgressStatusOption)
                  }
                  className="w-full px-3 py-2 text-xs rounded-xl bg-surface/80 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
                >
                  <option value="">{bi('— اختر مسار تقدم الحالة —', '— Select progress —')}</option>
                  <option value="improved">{bi('تحسن ملحوظ', 'Improved')}</option>
                  <option value="unchanged">{bi('دون تغيير', 'Unchanged')}</option>
                  <option value="plateau">{bi('استقرار / ثبات مرحلي', 'Plateau')}</option>
                  <option value="regressed">{bi('تراجع في الأعراض', 'Regressed')}</option>
                </select>
              </div>

              <div>
                <label htmlFor="soap-patient-tolerance" className="font-bold text-foreground block mb-1">
                  {bi('تحمّل المريض للجلسة:', 'Patient Tolerance:')}
                </label>
                <select
                  id="soap-patient-tolerance"
                  disabled={isLocked}
                  value={formState.patientTolerance}
                  onChange={(e) =>
                    updateField('patientTolerance', e.target.value as PatientToleranceOption)
                  }
                  className="w-full px-3 py-2 text-xs rounded-xl bg-surface/80 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
                >
                  <option value="">{bi('— اختر تحمّل المريض —', '— Select tolerance —')}</option>
                  <option value="well_tolerated">{bi('تحمّل ممتاز / جيد', 'Well tolerated')}</option>
                  <option value="moderate_fatigue">{bi('إجهاد متوسط', 'Moderate fatigue')}</option>
                  <option value="poorly_tolerated">{bi('ضعف تحمّل / ألم', 'Poorly tolerated')}</option>
                </select>
              </div>
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <label htmlFor="soap-clinical-impression" className="font-bold text-foreground">
                  {bi('الانطباع والتفسير السريري للجلسة *:', 'Clinical Impression (Assessment) *:')}
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
                  'Enter clinical reasoning and impression of patient response...'
                )}
                className="w-full px-3 py-2 text-xs rounded-xl bg-surface/80 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <label htmlFor="soap-next-session-plan" className="font-bold text-foreground">
                    {bi('خطة الجلسة القادمة:', 'Next Session Plan:')}
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
                  placeholder={bi('خطة التدرج أو التعديل...', 'Plan for next session...')}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-surface/80 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
                />
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <label htmlFor="soap-home-instructions" className="font-bold text-foreground">
                    {language === 'en' ? (
                      'Home Instructions (HEP):'
                    ) : (
                      <>
                        {bi('التعليمات والبرنامج المنزلي', 'Home Instructions (HEP)')}{' '}
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
                  placeholder={bi('تعليمات التمارين المنزلية...', 'Home exercise instructions...')}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-surface/80 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
                />
              </div>
            </div>

            {hasFreeTextExtraValues ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="soap-interventions-summary" className="font-bold text-foreground block mb-1">
                    {bi('ملخص التدخلات الحر للمعالج:', 'Therapist Free-Text Interventions:')}
                  </label>
                  <AutoResizeTextarea
                    id="soap-interventions-summary"
                    minRows={2}
                    disabled={isLocked}
                    value={formState.interventionsSummary}
                    onChange={(e) => updateField('interventionsSummary', e.target.value)}
                    placeholder={bi('تفاصيل علاجية حرة إضافية...', 'Additional free-text interventions...')}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-surface/80 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
                  />
                </div>
                <div>
                  <label htmlFor="soap-clinical-observations" className="font-bold text-foreground block mb-1">
                    {bi('المشاهدات السريرية الإضافية:', 'Additional Clinical Observations:')}
                  </label>
                  <AutoResizeTextarea
                    id="soap-clinical-observations"
                    minRows={2}
                    disabled={isLocked}
                    value={formState.clinicalObservations}
                    onChange={(e) => updateField('clinicalObservations', e.target.value)}
                    placeholder={bi('ملاحظات سريرية موضوعية...', 'Objective clinical observations...')}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-surface/80 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
                  />
                </div>
              </div>
            ) : (
              !isLocked && (
                <button
                  type="button"
                  onClick={() => setShowFreeTextExtras(true)}
                  className="compact-btn h-8 px-2.5 rounded-xl bg-surface/80 hover:bg-surface text-xs font-semibold text-muted-foreground-1 hover:text-foreground inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="size-3.5 text-primary shrink-0" />
                  <span>{bi('ملاحظات موضوعية أو تدخلات حرة إضافية', 'Additional observations & notes')}</span>
                </button>
              )
            )}
          </div>
        )}

        {/* 8. PRESETS SHEET */}
        {activeSheet === 'presets' && (
          <Suspense
            fallback={
              <div className="py-8 text-center text-xs text-muted-foreground-1">
                {bi('جاري تحميل القوالب...', 'Loading presets...')}
              </div>
            }
          >
            <ExamPresetBar
              embeddedInSheet
              episodeStore={episodeStore}
              onApplyStore={(next) => {
                setEpisodeStore(next);
                ClinicOperationsService.saveEpisodeClinicalStore(next);
              }}
            />
          </Suspense>
        )}

        {/* 9. PROBLEMS & GOALS SHEET */}
        {activeSheet === 'problems' && enableProblemListGoals && (
          <Suspense
            fallback={
              <div className="py-8 text-center text-xs text-muted-foreground-1">
                {bi('جاري تحميل المشكلات والأهداف...', 'Loading problems & goals...')}
              </div>
            }
          >
            <EpisodeProblemListGoalsPanel
              episodeStore={episodeStore}
              onUpdateStore={(patch) => {
                const next = { ...episodeStore, ...patch };
                setEpisodeStore(next);
                ClinicOperationsService.saveEpisodeClinicalStore(next);
              }}
            />
          </Suspense>
        )}

        {/* 10. INDIVIDUAL EXAM WIDGET EDITOR INSIDE SESSION SHEET */}
        {sheetIsWidgetEditor && activeSheet && (
          <Suspense
            fallback={
              <div className="py-8 text-center text-xs text-muted-foreground-1">
                {bi('جاري تحميل أداة الفحص...', 'Loading exam module...')}
              </div>
            }
          >
            <ActiveExamCanvas
              key={`${session.episodeId}-${activeSheet}`}
              singleWidgetId={activeSheet}
              activeWidgetIds={episodeStore.activeWidgetIds}
              onRemoveWidget={onRemoveExamWidget}
              onAddWidget={onAddExamWidget}
              onOpenExamShelf={() => {}}
              bodyChart={episodeStore.bodyChart}
              onBodyChartChange={(val) => updateEpisodeField('bodyChart', val)}
              objective={episodeStore.objective}
              onObjectiveChange={(val) => updateEpisodeField('objective', val)}
              specialTests={episodeStore.specialTests}
              onSpecialTestsChange={(val) => updateEpisodeField('specialTests', val)}
              gaitPosture={episodeStore.gaitPosture}
              onGaitPostureChange={(val) => updateEpisodeField('gaitPosture', val)}
              functionalScales={episodeStore.functionalScales}
              onFunctionalScalesChange={(val) => updateEpisodeField('functionalScales', val)}
              customWidgetsData={episodeStore.customWidgetsData}
              onCustomWidgetsDataChange={(val) => updateEpisodeField('customWidgetsData', val)}
              performanceTests={episodeStore.performanceTests || []}
              onPerformanceTestsChange={(list) => updateEpisodeField('performanceTests', list)}
              patientAge={
                patient ? computePatientAge(patient.data.dateOfBirth, patient.data.age) : undefined
              }
              patientGender={patient?.data.gender}
              enablePerformanceTestLibrary={enablePerformanceTestLibrary}
            />
          </Suspense>
        )}
      </ModalDialog>
    </div>
  );
};
