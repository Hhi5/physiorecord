import React, { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Play } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import { BUILT_IN_EXAM_PRESETS_CC0 } from '../../../data/clinicalToolkit/examPresetsCc0';
import { ClinicOperationsService } from '../../../services/clinicOperationsService';
import type { CustomWidgetDefinition } from '../../../types/clinicalWidgets';
import type {
  EpisodeScopedClinicalStore,
  RegionalExamPresetDefinition,
  VitalsAlertThresholds,
} from '../../../types/clinicManagement';
import { Fraction } from '../../ui/Primitives';
import {
  CORE_BUILTIN_WIDGET_KEYS,
  TONE_CLASS_MAP,
  buildClinicalExamSummary,
  nprsTextColor,
} from './examSummaryHelpers';

export interface ChartEvaluationTabProps {
  episodeStore: EpisodeScopedClinicalStore;
  enableProblemListGoals: boolean;
  enableVitalsModule: boolean;
  hasOpenDraftSession?: boolean;
  onOpenSessionForExam?: () => void;
}

export const ChartEvaluationTab: React.FC<ChartEvaluationTabProps> = ({
  episodeStore,
  enableProblemListGoals,
  enableVitalsModule,
  hasOpenDraftSession = false,
  onOpenSessionForExam,
}) => {
  const { language, bi } = useLanguage();

  const [customDefinitions, setCustomDefinitions] = useState<CustomWidgetDefinition[]>(() =>
    ClinicOperationsService.getCustomWidgets()
  );
  const [customPresets, setCustomPresets] = useState<RegionalExamPresetDefinition[]>(() =>
    ClinicOperationsService.getCustomExamPresets()
  );
  const [vitalsThresholds, setVitalsThresholds] = useState<VitalsAlertThresholds>(() =>
    ClinicOperationsService.getVitalsThresholds()
  );

  useEffect(() => {
    void ClinicOperationsService.ensureColdStoreLoadedAsync('customWidgets');
    const syncClinicStores = () => {
      setCustomDefinitions(ClinicOperationsService.getCustomWidgets());
      setCustomPresets(ClinicOperationsService.getCustomExamPresets());
      setVitalsThresholds(ClinicOperationsService.getVitalsThresholds());
    };
    syncClinicStores();
    return ClinicOperationsService.subscribe(syncClinicStores);
  }, []);

  const mergedPresets = useMemo(() => {
    const customMap = new Map(customPresets.map((c) => [c.id, c]));
    const builtInMerged = BUILT_IN_EXAM_PRESETS_CC0.map((b) => customMap.get(b.id) || b);
    const extras = customPresets.filter(
      (c) => !BUILT_IN_EXAM_PRESETS_CC0.some((b) => b.id === c.id)
    );
    return [...builtInMerged, ...extras];
  }, [customPresets]);

  const appliedPreset = useMemo(() => {
    const ids = episodeStore.appliedPresetIds || [];
    for (let i = ids.length - 1; i >= 0; i -= 1) {
      const found = mergedPresets.find((p) => p.id === ids[i]);
      if (found) return found;
    }
    return null;
  }, [episodeStore.appliedPresetIds, mergedPresets]);

  const getPresetTitle = (p: RegionalExamPresetDefinition) =>
    language === 'en' ? p.titleEn : language === 'ckb' ? p.titleCkb : p.titleAr;

  const nprsScores = [
    {
      id: 'rest' as const,
      shortLabel: bi('الراحة', 'Rest', 'پشوو'),
      val: episodeStore.painAtRestNrs ?? 0,
    },
    {
      id: 'activity' as const,
      shortLabel: bi('الحركة', 'Activity', 'جووڵە'),
      val: episodeStore.painOnActivityNrs ?? 0,
    },
    {
      id: 'worst' as const,
      shortLabel: bi('الأقصى', 'Worst', 'توندترین'),
      val: episodeStore.painWorst24hNrs ?? 0,
    },
  ];

  const narrativeItems = [
    {
      key: 'chief',
      label: bi('الشكوى الرئيسية', 'Chief Complaint', 'سکاڵای سەرەکی'),
      value: episodeStore.chiefComplaint,
    },
    {
      key: 'hpi',
      label: bi('آلية الإصابة', 'Mechanism / HPI', 'میکانیزم'),
      value: episodeStore.historyOfPresentIllness,
    },
    {
      key: 'painNature',
      label: bi('طبيعة الألم', 'Pain Quality', 'جۆری ئازار'),
      value: episodeStore.painNature,
    },
    {
      key: 'aggravating',
      label: bi('المهيجات', 'Aggravating', 'زیادکەرەکان'),
      value: episodeStore.aggravatingFactors,
    },
    {
      key: 'relieving',
      label: bi('المخففات', 'Relieving', 'کەمکەرەکان'),
      value: episodeStore.relievingFactors,
    },
    {
      key: 'palpation',
      label: bi('الجس والملاحظة', 'Palpation', 'دەستلێدان'),
      value: episodeStore.palpationFindings,
    },
  ].filter((item) => String(item.value || '').trim().length > 0);

  const hasPainOrIntakeData =
    narrativeItems.length > 0 || nprsScores.some((s) => s.val > 0);

  const sectionKeys = useMemo(
    () =>
      Array.from(
        new Set([
          ...episodeStore.activeWidgetIds,
          ...CORE_BUILTIN_WIDGET_KEYS,
          ...Object.keys(episodeStore.customWidgetsData || {}),
          ...(enableVitalsModule ? ['vitals'] : []),
          ...(enableProblemListGoals ? ['problems'] : []),
        ])
      ),
    [
      episodeStore.activeWidgetIds,
      episodeStore.customWidgetsData,
      enableVitalsModule,
      enableProblemListGoals,
    ]
  );

  const recordedExamSections = useMemo(
    () =>
      sectionKeys
        .map((key) =>
          buildClinicalExamSummary(key, {
            episodeStore,
            customDefinitions,
            vitalsThresholds,
            language,
            bi,
          })
        )
        .filter((s) => s.hasData),
    [sectionKeys, episodeStore, customDefinitions, vitalsThresholds, language, bi]
  );

  const hasAnyRecordedStatus = hasPainOrIntakeData || recordedExamSections.length > 0;

  return (
    <div className="rounded-2xl pr-surface overflow-hidden">
      {/* Header: Read-Only Latest Exam Status + ONE Calm Session Action */}
      <div className="px-4 sm:px-5 py-3 border-b border-black/[0.045] dark:border-white/[0.06] flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-foreground truncate">
            {bi('ملخص آخر فحص سريري', 'Latest Clinical Exam Summary', 'پوختەی دوایین پشکنینی کلینیکی')}
          </h2>
        </div>

        {onOpenSessionForExam && (
          <button
            type="button"
            data-testid="update-exam-via-session-btn"
            onClick={onOpenSessionForExam}
            className="compact-btn h-8 px-3 rounded-xl bg-surface/80 hover:bg-surface text-xs font-bold text-primary inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
          >
            <Play className="size-3.5 shrink-0" />
            <span>
              {hasOpenDraftSession
                ? bi('تحديث عبر الجلسة المفتوحة', 'Update in Open Session', 'نوێکردنەوە لە دانیشتن')
                : hasAnyRecordedStatus
                  ? bi('تحديث عبر جلسة', 'Update via Session', 'نوێکردنەوە لە ڕێگەی دانیشتن')
                  : bi('بدء جلسة تقييم', 'Start Eval Session', 'دەستپێکردنی هەڵسەنگاندن')}
            </span>
          </button>
        )}
      </div>

      {/* Applied Preset Red-Flag Reminder (Zero Colored Box — Text & Icon Only) */}
      {appliedPreset && (appliedPreset.redFlagReminderAr || appliedPreset.redFlagReminderEn) && (
        <div
          data-testid="exam-preset-redflag-reminder"
          className="px-4 sm:px-5 py-2.5 bg-surface/35 border-b border-black/[0.045] dark:border-white/[0.06] flex items-start gap-2 text-xs text-rose-700 dark:text-rose-400"
        >
          <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <span className="font-bold">
              {bi(
                `تنبيه العلامات الحمراء (${getPresetTitle(appliedPreset)}): `,
                `Red-Flag Screen (${getPresetTitle(appliedPreset)}): `,
                `ئاگاداری نیشانە سوورەکان (${getPresetTitle(appliedPreset)}): `
              )}
            </span>
            <span>{bi(appliedPreset.redFlagReminderAr, appliedPreset.redFlagReminderEn)}</span>
          </p>
        </div>
      )}

      {!hasAnyRecordedStatus ? (
        <div className="px-4 sm:px-5 py-4 text-xs text-muted-foreground-1 flex flex-wrap items-center justify-between gap-2">
          <span>
            {bi(
              'لم تُسجّل قياسات فحص سريري بعد — ابدأ جلسة تقييم لتسجيل الفحص والقياسات.',
              'No clinical exam measurements recorded yet — start an evaluation session to document findings.',
              'هێشتا هیچ پێوانەیەکی پشکنینی کلینیکی تۆمار نەکراوە — دانیشتنی هەڵسەنگاندن دەست پێبکە.'
            )}
          </span>
        </div>
      ) : (
        <div className="divide-y divide-black/[0.045] dark:divide-white/[0.06]">
          {hasPainOrIntakeData && (
            <div className="px-4 sm:px-5 py-3.5 space-y-1.5">
              <div className="flex items-center gap-2">
                <Activity className="size-4 text-primary shrink-0" />
                <h3 className="text-xs sm:text-sm font-bold text-foreground">
                  {bi('الألم والشكوى الرئيسية', 'Complaint & Pain Severity', 'سکاڵا و توندی ئازار')}
                </h3>
              </div>

              {nprsScores.some((t) => t.val > 0) && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums">
                  {nprsScores.map((t) => (
                    <span key={t.id} className="inline-flex items-center gap-1">
                      <span className="text-muted-foreground-1 font-medium">{t.shortLabel}:</span>
                      <span className={`font-mono font-bold ${nprsTextColor(t.val)}`}>
                        <Fraction value={t.val} total={10} />
                      </span>
                    </span>
                  ))}
                </div>
              )}

              {narrativeItems.length > 0 && (
                <div className="space-y-1">
                  {narrativeItems.map((item) => (
                    <p key={item.key} className="text-xs text-foreground leading-relaxed">
                      <span className="font-semibold text-muted-foreground-1">{item.label}: </span>
                      <span>{item.value}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {recordedExamSections.map((sec) => (
            <div
              key={sec.key}
              id={`exam-station-${sec.key}`}
              className="px-4 sm:px-5 py-3.5 flex items-start gap-2.5"
            >
              <div className="mt-0.5 shrink-0">{sec.icon}</div>
              <div className="min-w-0 flex-1 space-y-1">
                <h3 className="text-xs sm:text-sm font-bold text-foreground truncate">
                  {sec.title}
                </h3>
                {sec.lines.map((line, idx) => (
                  <p
                    key={idx}
                    className={`text-xs leading-relaxed ${TONE_CLASS_MAP[line.tone || 'default']}`}
                  >
                    {line.label && (
                      <span className="font-semibold text-muted-foreground-1">{line.label}: </span>
                    )}
                    {line.ltr ? <bdi dir="ltr">{line.text}</bdi> : line.text}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
