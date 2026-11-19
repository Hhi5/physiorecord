import React, { Suspense, lazy, useState } from 'react';
import {
  AlertTriangle,
  Copy,
  Hand,
  Plus,
  Trash2,
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
  PhysicalAgentFlowsheetEntry,
  SessionType,
  SessionVitalsEntry,
} from '../../../types/clinical';
import { AutoResizeTextarea, ClinicalAbbr, Fraction, NprsControl } from '../../ui/Primitives';
import type { CopiedSoapTextField, UntouchedDraftFormState } from './sessionSoapHelpers';

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
  {
    mod: 'TENS',
    ar: 'تحفيز كهربائي مسكن TENS',
    ckb: 'وریاکردنەوەی کارەبایی ئازارشکێن TENS',
    params: '100Hz, 150µs',
  },
  {
    mod: 'Ultrasound',
    ar: 'أمواج فوق صوتية',
    ckb: 'شەپۆلی سەروودەنگ',
    params: '1MHz, 1.2 W/cm²',
  },
  {
    mod: 'NMES',
    ar: 'تحفيز عضلي كهربائي NMES',
    ckb: 'وریاکردنەوەی ماسولکەیی کارەبایی NMES',
    params: '50Hz, 10s/30s',
  },
  {
    mod: 'HotPack',
    ar: 'كمادات ساخنة (حرارة سطحية)',
    ckb: 'پەستانی گەرم (گەرمی ڕووکەش)',
    params: 'Hydrocollator 15m',
  },
  {
    mod: 'Shortwave',
    ar: 'موجات قصيرة (SWD)',
    ckb: 'شەپۆلی کورت (SWD)',
    params: 'Pulsed / Continuous',
  },
  {
    mod: 'DryNeedling',
    ar: 'وخز بالإبر الجافة',
    ckb: 'دەرزی وشک (Dry Needling)',
    params: 'Trigger Points',
  },
  {
    mod: 'Cryotherapy',
    ar: 'كمادات باردة',
    ckb: 'پەستانی سارد',
    params: 'Cold pack',
  },
  {
    mod: 'Traction',
    ar: 'شد فقري / ميكانيكي',
    ckb: 'کێشانی بڕبڕە / میکانیکی',
    params: 'Intermittent traction',
  },
];

export interface SessionSubjectiveAndObjectiveSectionsProps {
  formState: UntouchedDraftFormState;
  isLocked: boolean;
  patientId: string;
  episodeId: string;
  sessionType?: SessionType;
  embeddedExamSection?: React.ReactNode;
  enableVitalsModule: boolean;
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
  onAddManualTherapy: () => void;
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

export const SessionSubjectiveAndObjectiveSections: React.FC<
  SessionSubjectiveAndObjectiveSectionsProps
> = ({
  formState,
  isLocked,
  patientId,
  episodeId,
  sessionType,
  embeddedExamSection,
  enableVitalsModule,
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
  const { language, bi } = useLanguage();
  const [showSymptomChanges, setShowSymptomChanges] = useState(false);
  const [showInterventionsText, setShowInterventionsText] = useState(false);
  const [showObservationsText, setShowObservationsText] = useState(false);

  const isEvalPriority =
    sessionType === 'initial_evaluation' ||
    sessionType === 're_evaluation' ||
    sessionType === 'discharge_summary';

  const hasSymptomChanges =
    showSymptomChanges || formState.symptomChanges.trim().length > 0;
  const hasInterventionsText =
    showInterventionsText || formState.interventionsSummary.trim().length > 0;
  const hasObservationsText =
    showObservationsText || formState.clinicalObservations.trim().length > 0;

  return (
    <>
      {/* 1. SUBJECTIVE AXIS (المحور الذاتي — الألم والشكوى وتغير الأعراض) */}
      <div className="p-4 sm:p-5 rounded-2xl pr-surface space-y-3.5">
        <div className="flex items-center gap-2 border-b border-black/[0.045] dark:border-white/[0.06] pb-2.5">
          <span className="size-6 rounded-lg bg-primary/10 text-primary font-black text-xs flex items-center justify-center shrink-0">
            1
          </span>
          <h2 className="text-sm font-bold text-foreground">
            {language === 'en' ? (
              'Subjective (S): Pre/Post Pain NPRS & Chief Complaint'
            ) : (
              <>
                {bi(
                  'المحور الذاتي والألم والشكوى الرئيسية',
                  'Subjective (S): Pre/Post Pain NPRS & Chief Complaint',
                  'تەوەرەی خودی، ئازار و سکاڵای سەرەکی'
                )}{' '}
                <ClinicalAbbr code="SOAP" className="text-xs text-muted-foreground-1 ms-1" />
              </>
            )}
          </h2>
        </div>

        {/* Pre & Post Session Pain NPRS */}
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

        <div className={`grid grid-cols-1 ${hasSymptomChanges ? 'md:grid-cols-2' : ''} gap-3.5`}>
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

          {hasSymptomChanges && (
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
          )}
        </div>

        {!isLocked && !hasSymptomChanges && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowSymptomChanges(true)}
              className="compact-btn h-8 px-2.5 rounded-xl bg-surface/80 hover:bg-surface text-xs font-semibold text-muted-foreground-1 hover:text-foreground inline-flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Plus className="size-3.5 text-primary shrink-0" />
              <span>{bi('تغير الأعراض منذ الجلسة السابقة', 'Symptom changes since last visit', 'گۆڕانی نیشانەکان')}</span>
            </button>
          </div>
        )}
      </div>

      {/* ADAPTIVE PRIORITY: In Initial Evaluation / Re-Evaluation / Discharge sessions, Clinical Examination Paper comes FIRST right under Subjective! */}
      {isEvalPriority && embeddedExamSection}

      {/* 2. UNIFIED CLINICAL INTERVENTIONS PAPER (تمارين • أجهزة • علاج يدوي • ملاحظات) */}
      <div className="rounded-2xl pr-surface divide-y divide-black/[0.045] dark:divide-white/[0.06] overflow-hidden">
        {/* 2A. Therapeutic Exercise Flowsheet */}
        <div className="p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <span className="size-6 rounded-lg bg-primary/10 text-primary font-black text-xs flex items-center justify-center shrink-0">
                2
              </span>
              <h2 className="text-sm font-bold text-foreground">
                {bi(
                  'العلاج المنفذ في الجلسة (تمارين • أجهزة • علاج يدوي)',
                  'Session Interventions (Exercises • Modalities • Manual Therapy)',
                  'چارەسەری ئەنجامدراو لە دانیشتندا (ڕاهێنان • ئامێر • دەستی)'
                )}
              </h2>
            </div>

            {!isLocked && (
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={onCarryForwardPreviousFlowsheet}
                  className="compact-btn h-8 px-2.5 rounded-xl bg-surface/80 hover:bg-surface text-foreground text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Copy className="size-3.5 text-primary" />
                  <span>{bi('نسخ تمارين الجلسة السابقة', 'Copy Previous Flowsheet', 'کۆپیکردنی ڕاهێنانەکانی دانیشتنی پێشوو')}</span>
                </button>

                <select
                  value={selectedCatalogExId}
                  onChange={(e) => setSelectedCatalogExId(e.target.value)}
                  aria-label={bi('اختر تمريناً من الكتالوج', 'Select exercise from catalog', 'ڕاهێنانێک لە کەتەلۆگ هەڵبژێرە')}
                  className="h-8 px-2.5 rounded-xl text-xs bg-surface/80 text-foreground min-w-[160px] max-w-full sm:max-w-xs"
                >
                  {(() => {
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
                  onClick={onAddExerciseFromCatalog}
                  className="compact-btn h-8 px-2.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="size-3.5" />
                  <span>{bi('إدراج تمرين', 'Add Exercise', 'زیادکردنی ڕاهێنان')}</span>
                </button>
                <button
                  type="button"
                  onClick={onAddManualExercise}
                  className="compact-btn h-8 px-2.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="size-3.5" />
                  <span>{bi('إضافة يدوي', 'Manual Exercise', 'زیادکردنی دەستی')}</span>
                </button>
              </div>
            )}
          </div>

          {formState.exercises.length === 0 ? (
            <p className="text-xs text-muted-foreground-1">
              {bi(
                'لم تُدرج تمارين بعد — اختر تمريناً من الكتالوج أو انسخ تمارين الجلسة السابقة.',
                'No exercises added yet — pick from catalog or copy previous session flowsheet.',
                'هیچ ڕاهێنانێک زیاد نەکراوە — لە کەتەلۆگ هەڵبژێرە یان لە دانیشتنی پێشوو کۆپی بکە.'
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
                              onMarkDirty();
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
                              onMarkDirty();
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
                              onMarkDirty();
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

        {/* 2B. Physical Agents / Modalities & Manual Therapy (Inside Same Paper) */}
        <div className="p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Physical Agents / Electrotherapy Column */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                  <Zap className="w-4 h-4 text-amber-500" />
                  <span>
                    {bi('الأجهزة والوسائل الفيزيائية', 'Physical Modalities', 'ئامێر و شێوازە فیزیاییەکان')}
                  </span>
                </div>
              </div>

              {!isLocked && (
                <div className="rounded-xl bg-surface/65 p-1 overflow-hidden">
                  <div className="pr-hscroll overflow-x-auto flex items-center gap-1.5 whitespace-nowrap pb-1 pt-0.5 px-0.5">
                    {QUICK_MODALITY_BUTTONS.map((btn) => (
                      <button
                        key={btn.mod}
                        type="button"
                        data-testid={`add-modality-${btn.mod}`}
                        onClick={() => onAddPhysicalAgent(btn.mod, btn.ar, btn.params)}
                        className="compact-btn h-8 px-2.5 rounded-xl bg-card hover:bg-primary/10 hover:text-primary text-xs font-semibold text-foreground shadow-2xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        + {bi(btn.ar, btn.mod, btn.ckb)}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={onAddManualPhysicalAgent}
                      className="compact-btn h-8 px-2.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      + {bi('إضافة يدوي', 'Manual Entry', 'زیادکردنی دەستی')}
                    </button>
                  </div>
                </div>
              )}

              {formState.modalitySafetyOverrides.length > 0 && (
                <div
                  data-testid="session-modality-overrides-list"
                  className="p-2.5 rounded-xl bg-surface/65 space-y-1 text-xs"
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
                    className="p-3 rounded-2xl bg-surface/65 space-y-2 text-xs"
                  >
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
                            placeholder={bi('اسم الجهاز / الوسيلة', 'Modality name', 'ناوی ئامێر')}
                            className="w-full px-2 py-0.5 rounded-lg bg-card text-xs font-bold text-primary placeholder:text-muted-foreground-2 focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        ) : (
                          bi(pa.modalityAr || pa.modality, pa.modality)
                        )}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
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
                            className="compact-btn size-7 inline-flex items-center justify-center rounded-lg text-muted-foreground-2 hover:text-rose-600 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
                          className="w-full px-2 py-1 rounded-lg bg-card text-foreground"
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
                          className="w-full px-2 py-1 rounded-lg bg-card font-mono text-xs text-foreground"
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
                              onMarkDirty();
                            }
                          }}
                          className={`w-full px-2 py-1 rounded-lg bg-card font-mono text-center text-foreground ${
                            numericErrors[durKey]
                              ? 'ring-1 ring-rose-500 text-rose-600'
                              : ''
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

            {/* Manual Therapy Column */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                  <Hand className="w-4 h-4 text-primary" />
                  <span>{bi('العلاج اليدوي', 'Manual Therapy', 'چارەسەری دەستی')}</span>
                </div>
                {!isLocked && (
                  <button
                    type="button"
                    onClick={onAddManualTherapy}
                    className="compact-btn h-8 px-2.5 rounded-xl bg-surface/80 hover:bg-surface text-xs font-bold text-primary cursor-pointer"
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
                    className="p-3 rounded-2xl bg-surface/65 space-y-2 text-xs"
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
                          next[idx] = language !== 'en'
                            ? { ...mt, techniqueAr: e.target.value }
                            : { ...mt, techniqueEn: e.target.value };
                          updateField('manualTherapy', next);
                        }}
                        className="flex-1 min-w-0 w-0 px-2.5 py-1 rounded-lg bg-card font-semibold text-foreground"
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
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
                          className="w-full px-2 py-1 rounded-lg bg-card text-foreground"
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
                          className="w-full px-2 py-1 rounded-lg bg-card font-mono text-foreground"
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
                              onMarkDirty();
                            }
                          }}
                          className={`w-full px-2 py-1 rounded-lg bg-card font-mono text-center text-foreground ${
                            numericErrors[durKey]
                              ? 'ring-1 ring-rose-500 text-rose-600'
                              : ''
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

          {derivedFlowsheetSummary && (
            <div className="p-3 rounded-xl bg-surface/65 text-xs space-y-1">
              <span className="font-bold text-primary block">
                {bi(
                  'ملخص التمارين والأجهزة المشتق تلقائياً:',
                  'Derived Flowsheet Summary:',
                  'پوختەی خۆکاری خشتەی ڕاهێنان و ئامێرەکان:'
                )}
              </span>
              <p className="text-foreground font-mono text-xs">{derivedFlowsheetSummary}</p>
            </div>
          )}

          {formState.legacyCompiledSummary && (
            <div className="p-3 rounded-xl bg-surface/65 text-xs space-y-1">
              <span className="font-bold text-muted-foreground-1 block">
                {bi(
                  'ملخص مجمع سابق محفوظ من إصدار أقدم (للقراءة فقط):',
                  'Legacy Stored Compiled Summary (Read-Only):',
                  'پوختەی کۆکراوەی پێشووی هەڵگیراو لە وەشانێکی کۆنتر (تەنها خوێندنەوە):'
                )}
              </span>
              <p className="text-foreground font-mono text-xs">{formState.legacyCompiledSummary}</p>
            </div>
          )}

          {(hasInterventionsText || hasObservationsText) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {hasInterventionsText && (
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
                    className={`w-full px-3 py-2 text-xs rounded-xl bg-surface/80 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 ${
                      getCopiedFieldStatus('interventionsSummary') === 'copied'
                        ? 'ring-1 ring-amber-500/40'
                        : getCopiedFieldStatus('interventionsSummary') === 'edited'
                          ? 'ring-1 ring-emerald-500/40'
                          : ''
                    }`}
                  />
                </div>
              )}

              {hasObservationsText && (
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
                    className={`w-full px-3 py-2 text-xs rounded-xl bg-surface/80 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 ${
                      getCopiedFieldStatus('clinicalObservations') === 'copied'
                        ? 'ring-1 ring-amber-500/40'
                        : getCopiedFieldStatus('clinicalObservations') === 'edited'
                          ? 'ring-1 ring-emerald-500/40'
                          : ''
                    }`}
                  />
                </div>
              )}
            </div>
          )}

          {!isLocked && (!hasInterventionsText || !hasObservationsText) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {!hasInterventionsText && (
                <button
                  type="button"
                  onClick={() => setShowInterventionsText(true)}
                  className="compact-btn h-8 px-2.5 rounded-xl bg-surface/80 hover:bg-surface text-xs font-semibold text-muted-foreground-1 hover:text-foreground inline-flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Plus className="size-3.5 text-primary shrink-0" />
                  <span>{bi('ملخص تدخلات حر', 'Free-text interventions', 'پوختەی ئازادی دەستێوەردان')}</span>
                </button>
              )}
              {!hasObservationsText && (
                <button
                  type="button"
                  onClick={() => setShowObservationsText(true)}
                  className="compact-btn h-8 px-2.5 rounded-xl bg-surface/80 hover:bg-surface text-xs font-semibold text-muted-foreground-1 hover:text-foreground inline-flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Plus className="size-3.5 text-primary shrink-0" />
                  <span>{bi('مشاهدات سريرية إضافية', 'Additional clinical observations', 'تێبینییە کلینیکییەکان')}</span>
                </button>
              )}
            </div>
          )}

          {enableVitalsModule && (
            <Suspense fallback={null}>
              <VitalsPanel
                value={formState.vitals}
                history={
                  ClinicOperationsService.getEpisodeClinicalStore(episodeId, patientId).vitalsHistory || []
                }
                onChange={(v: SessionVitalsEntry | undefined) => updateField('vitals', v)}
                readOnly={isLocked}
              />
            </Suspense>
          )}
        </div>
      </div>

      {/* ADAPTIVE PRIORITY: In Follow-Up daily treatment sessions, Clinical Examination & Quick Re-measure Paper comes right below Interventions! */}
      {!isEvalPriority && embeddedExamSection}
    </>
  );
};
