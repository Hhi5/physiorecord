// =======================================================================
// PhysioRecord — Outcome Measures, Functional Procedures & Score-Entry Hub
// Licensed instruments use copyright-clean score entry + MCID/MDC + source link.
// Non-copyrighted clinical procedures: NPRS, PSFS, TUG, 30s-CST, 5xSTS + Custom.
// =======================================================================

import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import type {
  CustomOutcomeMeasureConfig,
  FunctionalScaleEntry,
  OutcomeScoreHistoryPoint,
  ValidatedScaleId,
} from '../../types/clinicalWidgets';
import type { PerformanceTestResultEntry } from '../../types/clinicManagement';

const PerformanceTestsPanel = lazy(() =>
  import('./PerformanceTestsPanel').then((m) => ({ default: m.PerformanceTestsPanel }))
);
import {
  classifyOutcomeSeverity,
  computeScalePercentage,
  evaluateBaselineChange,
  normalizeScaleId,
  OUTCOME_INSTRUMENTS,
} from '../../utils/outcomeMeasures';
import {
  AccessibleTab,
  AccessibleTabList,
  AccessibleTabPanel,
  AccessibleTabs,
} from '../ui/Tabs';
import {
  Calculator,
  Calendar,
  ExternalLink,
  History,
  Info,
  Play,
  Plus,
  RotateCcw,
  Square,
  Sliders,
  Trash2,
  TrendingUp,
} from 'lucide-react';

interface FunctionalScalesWidgetProps {
  value: FunctionalScaleEntry | undefined;
  onChange: (updated: FunctionalScaleEntry) => void;
  performanceTests?: PerformanceTestResultEntry[];
  onPerformanceTestsChange?: (updated: PerformanceTestResultEntry[]) => void;
  patientAge?: number;
  patientGender?: 'male' | 'female' | 'other';
  enablePerformanceTestLibrary?: boolean;
  readOnly?: boolean;
}

const ORDERED_TABS: Array<Exclude<ValidatedScaleId, 'oswestry'>> = [
  'nprs',
  'psfs',
  'tug',
  'chair_stand_30s',
  'five_x_sts',
  'odi',
  'ndi',
  'quickdash',
  'spadi',
  'lefs',
  'custom',
];

const DEFAULT_PSFS_ACTIVITIES = [
  { id: 'act_1', label: '', score: 5 },
  { id: 'act_2', label: '', score: 5 },
  { id: 'act_3', label: '', score: 5 },
];

const DEFAULT_CUSTOM_CONFIG: CustomOutcomeMeasureConfig = {
  id: 'custom_measure',
  nameAr: 'مقياس وظيفي مخصص للعيادة',
  nameEn: 'Custom Clinic Measure',
  minScore: 0,
  maxScore: 100,
  higherIsBetter: true,
  unitAr: 'نقطة',
  unitEn: 'pts',
  mcidDelta: 10,
};

export const FunctionalScalesWidget: React.FC<FunctionalScalesWidgetProps> = ({
  value,
  onChange,
  performanceTests = [],
  onPerformanceTestsChange,
  patientAge,
  patientGender,
  enablePerformanceTestLibrary = true,
  readOnly = false,
}) => {
  const { language, bi } = useLanguage();

  const initialTab = normalizeScaleId(value?.scaleId || 'odi');
  const [selectedId, setSelectedId] = useState<Exclude<ValidatedScaleId, 'oswestry'>>(initialTab);
  const [visitTypeForLog, setVisitTypeForLog] = useState<OutcomeScoreHistoryPoint['visitType']>('initial_evaluation');

  // SPADI subscales (Pain 0-50, Disability 0-80)
  const [spadiPain, setSpadiPain] = useState<number>(() => value?.responses?.spadi_pain ?? 0);
  const [spadiDisability, setSpadiDisability] = useState<number>(
    () => value?.responses?.spadi_disability ?? 0
  );

  // PSFS custom patient activity list
  const [psfsItems, setPsfsItems] = useState<Array<{ id: string; label: string; score: number }>>(() => {
    if (value?.psfsActivities && value.psfsActivities.length > 0) {
      return value.psfsActivities.map((a, idx) => ({
        id: a.id || `act_${idx + 1}`,
        label: a.activity,
        score: a.score0to10,
      }));
    }
    return DEFAULT_PSFS_ACTIVITIES;
  });

  // Custom Measure Builder configuration
  const [customConfig, setCustomConfig] = useState<CustomOutcomeMeasureConfig>(
    () => value?.customMeasureConfig || DEFAULT_CUSTOM_CONFIG
  );

  // Baseline raw score override (falls back to first logged snapshot for active scale)
  const [baselineInput, setBaselineInput] = useState<string>(() =>
    typeof value?.baselineScore === 'number' ? String(value.baselineScore) : ''
  );

  // Direct numeric input string so decimals (e.g. TUG 11.4 s) type smoothly
  const [rawInput, setRawInput] = useState<string>(() => {
    if (typeof value?.rawScore === 'number') return String(value.rawScore);
    return '';
  });

  // Optional custom denominator for score-entry scales (e.g., ODI 45 when 1 section skipped)
  const [customDenominator, setCustomDenominator] = useState<number>(() => {
    const spec =
      initialTab === 'custom'
        ? undefined
        : OUTCOME_INSTRUMENTS[initialTab as keyof typeof OUTCOME_INSTRUMENTS];
    return value?.maxScore || spec?.maxRaw || 100;
  });

  // Stopwatch / 30s countdown state for TUG / 30s-CST / 5xSTS
  const [timerRunning, setTimerRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerStartRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current !== null) {
        window.clearInterval(timerIntervalRef.current);
      }
    };
  }, []);

  const stopTimer = (applyToRaw: boolean) => {
    if (timerIntervalRef.current !== null) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setTimerRunning(false);
    if (applyToRaw && (selectedId === 'tug' || selectedId === 'five_x_sts')) {
      const rounded = Number(elapsedSeconds.toFixed(1));
      setRawInput(String(rounded));
      emitScoreUpdate(selectedId, rounded, customDenominator);
    }
  };

  const startTimer = () => {
    if (readOnly) return;
    if (timerIntervalRef.current !== null) {
      window.clearInterval(timerIntervalRef.current);
    }
    const startMs = Date.now();
    timerStartRef.current = startMs;
    setElapsedSeconds(0);
    setTimerRunning(true);

    timerIntervalRef.current = window.setInterval(() => {
      if (timerStartRef.current === null) return;
      const secs = (Date.now() - timerStartRef.current) / 1000;
      if (selectedId === 'chair_stand_30s' && secs >= 30) {
        setElapsedSeconds(30);
        if (timerIntervalRef.current !== null) {
          window.clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
        setTimerRunning(false);
        return;
      }
      setElapsedSeconds(secs);
    }, 100);
  };

  const resetTimer = () => {
    if (timerIntervalRef.current !== null) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setTimerRunning(false);
    setElapsedSeconds(0);
  };

  const activeSpec =
    selectedId === 'custom'
      ? undefined
      : OUTCOME_INSTRUMENTS[selectedId as keyof typeof OUTCOME_INSTRUMENTS];

  const activeScaleMeta = useMemo(() => {
    if (selectedId === 'custom') {
      return {
        code: 'CUSTOM',
        nameAr: customConfig.nameAr || 'مقياس مخصص',
        nameEn: customConfig.nameEn || 'Custom Measure',
        unitAr: customConfig.unitAr || 'نقطة',
        unitEn: customConfig.unitEn || 'pts',
        higherIsBetter: customConfig.higherIsBetter,
      };
    }
    return {
      code: activeSpec!.code,
      nameAr: activeSpec!.nameAr,
      nameEn: activeSpec!.nameEn,
      unitAr: activeSpec!.unitAr,
      unitEn: activeSpec!.unitEn,
      higherIsBetter: activeSpec!.higherIsBetter,
    };
  }, [selectedId, activeSpec, customConfig]);

  const emitScoreUpdate = (
    targetId: Exclude<ValidatedScaleId, 'oswestry'>,
    raw: number,
    maxDenom: number,
    extraResponses: Record<string, number> = {},
    nextPsfs?: Array<{ id: string; activity: string; score0to10: number }>,
    nextCustomConfig?: CustomOutcomeMeasureConfig,
    baselineOverride?: number
  ) => {
    const cfg = nextCustomConfig || customConfig;
    const pct = computeScalePercentage(targetId, raw, maxDenom, cfg);
    const sev = classifyOutcomeSeverity(targetId, raw, pct, cfg);
    const spec =
      targetId === 'custom'
        ? undefined
        : OUTCOME_INSTRUMENTS[targetId as keyof typeof OUTCOME_INSTRUMENTS];

    onChange({
      scaleId: targetId,
      scaleNameAr: targetId === 'custom' ? cfg.nameAr : spec!.nameAr,
      scaleNameEn: targetId === 'custom' ? cfg.nameEn : spec!.nameEn,
      responses: { rawScore: raw, ...extraResponses },
      psfsActivities: nextPsfs ?? value?.psfsActivities,
      scorePercentage: pct,
      severityLabelAr: sev.ar,
      severityLabelEn: sev.en,
      rawScore: raw,
      maxScore: targetId === 'custom' ? cfg.maxScore : maxDenom,
      entryMode:
        targetId === 'custom'
          ? 'custom'
          : spec?.category === 'procedure'
            ? 'procedure'
            : 'score_entry',
      baselineScore:
        typeof baselineOverride === 'number'
          ? baselineOverride
          : baselineInput.trim() !== '' && !Number.isNaN(Number(baselineInput))
            ? Number(baselineInput)
            : value?.baselineScore,
      customMeasureConfig: targetId === 'custom' ? cfg : value?.customMeasureConfig,
      unitLabelAr: targetId === 'custom' ? cfg.unitAr : spec?.unitAr,
      unitLabelEn: targetId === 'custom' ? cfg.unitEn : spec?.unitEn,
      officialSourceUrl: spec?.officialSourceUrl,
      history: value?.history || [],
    });
  };

  const handleTabChange = (nextKey: React.Key) => {
    const id = normalizeScaleId(String(nextKey) as ValidatedScaleId);
    stopTimer(false);
    setElapsedSeconds(0);
    setSelectedId(id);

    const spec =
      id === 'custom'
        ? undefined
        : OUTCOME_INSTRUMENTS[id as keyof typeof OUTCOME_INSTRUMENTS];
    const nextMax = spec ? spec.maxRaw : customConfig.maxScore;
    setCustomDenominator(nextMax);

    const isMatchingExisting = value && normalizeScaleId(value.scaleId) === id;
    if (isMatchingExisting && typeof value.rawScore === 'number') {
      setRawInput(String(value.rawScore));
      return;
    }

    if (id === 'psfs') {
      const valid = psfsItems.filter((p) => p.label.trim().length > 0 || p.score >= 0);
      const mean =
        valid.length > 0
          ? Number((valid.reduce((acc, p) => acc + p.score, 0) / valid.length).toFixed(2))
          : 0;
      setRawInput(String(mean));
      if (!readOnly) {
        emitScoreUpdate(
          id,
          mean,
          10,
          Object.fromEntries(psfsItems.map((p) => [p.id, p.score])),
          psfsItems.map((p) => ({ id: p.id, activity: p.label, score0to10: p.score }))
        );
      }
      return;
    }

    setRawInput('');
  };

  const handleRawInputChange = (text: string) => {
    setRawInput(text);
    if (readOnly) return;
    if (text.trim() === '') return;
    const parsed = Number(text);
    if (Number.isNaN(parsed) || parsed < 0) return;
    emitScoreUpdate(selectedId, parsed, customDenominator);
  };

  const handleSpadiChange = (nextPain: number, nextDisab: number) => {
    setSpadiPain(nextPain);
    setSpadiDisability(nextDisab);
    if (readOnly) return;
    const clampedPain = Math.min(50, Math.max(0, nextPain));
    const clampedDisab = Math.min(80, Math.max(0, nextDisab));
    const total = clampedPain + clampedDisab;
    setRawInput(String(total));
    emitScoreUpdate('spadi', total, 130, {
      spadi_pain: clampedPain,
      spadi_disability: clampedDisab,
    });
  };

  const handlePsfsChange = (updated: Array<{ id: string; label: string; score: number }>) => {
    setPsfsItems(updated);
    if (readOnly) return;
    const named = updated.filter((a) => a.label.trim().length > 0);
    const activeSet = named.length > 0 ? named : updated;
    const mean = Number(
      (activeSet.reduce((sum, item) => sum + item.score, 0) / Math.max(1, activeSet.length)).toFixed(2)
    );
    setRawInput(String(mean));
    emitScoreUpdate(
      'psfs',
      mean,
      10,
      Object.fromEntries(updated.map((p) => [p.id, p.score])),
      updated.map((p) => ({ id: p.id, activity: p.label, score0to10: p.score }))
    );
  };

  const handleCustomConfigChange = (patch: Partial<CustomOutcomeMeasureConfig>) => {
    const merged = { ...customConfig, ...patch };
    setCustomConfig(merged);
    if (!readOnly && rawInput.trim() !== '' && !Number.isNaN(Number(rawInput))) {
      emitScoreUpdate('custom', Number(rawInput), merged.maxScore, {}, undefined, merged);
    }
  };

  const handleLogToHistory = () => {
    if (readOnly || !value) return;
    const existingHistory = value.history || [];
    const newPoint: OutcomeScoreHistoryPoint = {
      id: `log_${Date.now()}`,
      date: new Date().toISOString(),
      visitType: visitTypeForLog,
      scaleId: selectedId,
      scaleNameAr: activeScaleMeta.nameAr,
      scaleNameEn: activeScaleMeta.nameEn,
      rawScore: value.rawScore,
      scorePercentage: value.scorePercentage,
      severityLabelAr: value.severityLabelAr || '',
      severityLabelEn: value.severityLabelEn || '',
    };
    onChange({
      ...value,
      history: [newPoint, ...existingHistory],
    });
  };

  const activeCurrentRaw =
    rawInput.trim() !== '' && !Number.isNaN(Number(rawInput))
      ? Number(rawInput)
      : value && normalizeScaleId(value.scaleId) === selectedId && typeof value.rawScore === 'number'
        ? value.rawScore
        : null;

  const activePct =
    activeCurrentRaw !== null
      ? computeScalePercentage(selectedId, activeCurrentRaw, customDenominator, customConfig)
      : value && normalizeScaleId(value.scaleId) === selectedId
        ? value.scorePercentage
        : null;

  const activeSeverity =
    activeCurrentRaw !== null && activePct !== null
      ? classifyOutcomeSeverity(selectedId, activeCurrentRaw, activePct, customConfig)
      : value && normalizeScaleId(value.scaleId) === selectedId
        ? { ar: value.severityLabelAr, en: value.severityLabelEn }
        : null;

  const baselineNumeric =
    baselineInput.trim() !== '' && !Number.isNaN(Number(baselineInput))
      ? Number(baselineInput)
      : null;

  const changeEvaluation =
    activeCurrentRaw !== null && activePct !== null && baselineNumeric !== null
      ? evaluateBaselineChange(
          selectedId,
          baselineNumeric,
          activeCurrentRaw,
          computeScalePercentage(selectedId, baselineNumeric, customDenominator, customConfig),
          activePct,
          customConfig
        )
      : null;

  const spadiPainPct = Math.round((Math.min(50, Math.max(0, spadiPain)) / 50) * 100);
  const spadiDisabPct = Math.round((Math.min(80, Math.max(0, spadiDisability)) / 80) * 100);

  return (
    <div className="space-y-4">
      {/* 1. Accessible Tabs Bar (React Aria Components — RTL keyboard ready) */}
      <AccessibleTabs selectedKey={selectedId} onSelectionChange={handleTabChange}>
        <AccessibleTabList
          ariaLabel={bi('مقاييس النتائج والاختبارات الوظيفية', 'Outcome Measures & Functional Tests', 'پێوانەکانی ئەنجام و پشکنینە فرمانیەکان')}
          className="pb-1"
        >
          {ORDERED_TABS.map((id) => {
            const label =
              id === 'custom'
                ? bi('مقياس مخصص +', 'Custom +', 'پێوانەی تایبەت +')
                : OUTCOME_INSTRUMENTS[id].code;
            return (
              <AccessibleTab key={id} id={id}>
                <span>{label}</span>
              </AccessibleTab>
            );
          })}
        </AccessibleTabList>

        <AccessibleTabPanel id={selectedId} className="space-y-4 pt-4">
          {/* 2. Score Summary KPI Banner */}
      <div className="p-3.5 rounded-2xl bg-surface/65 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-extrabold text-foreground">
            {bi(activeScaleMeta.nameAr, activeScaleMeta.nameEn)}
          </div>
          <div className="text-xs text-muted-foreground-1 mt-0.5">
            {activeSeverity
              ? bi(activeSeverity.ar, activeSeverity.en)
              : bi(
                  'أدخل النتيجة المسجلة لعرض النسبة والتحليل السريري',
                  'Enter documented score to compute percentage & clinical interpretation',
                  'نمرەی تۆمارکراو بنووسە بۆ هەژمارکردنی ڕێژە و لێکدانەوەی کلینیکی'
                )}
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {!readOnly && activePct !== null && (
            <div className="flex items-center gap-1.5">
              <select
                value={visitTypeForLog}
                onChange={(e) =>
                  setVisitTypeForLog(e.target.value as OutcomeScoreHistoryPoint['visitType'])
                }
                aria-label={bi('نوع الزيارة', 'Visit type', 'جۆری سەردان')}
                className="compact-btn h-8 text-xs px-2.5 rounded-xl bg-card text-foreground cursor-pointer"
              >
                <option value="initial_evaluation">{bi('تقييم مبدئي', 'Initial Eval', 'هەڵسەنگاندنی سەرەتایی')}</option>
                <option value="re_evaluation">{bi('إعادة تقييم', 'Re-eval', 'دووبارە هەڵسەنگاندن')}</option>
                <option value="follow_up">{bi('متابعة أسبوعية', 'Follow-up', 'بەدواداچوونی هەفتانە')}</option>
                <option value="discharge">{bi('خروج / إنهاء', 'Discharge', 'دەرچوون / کۆتایی')}</option>
              </select>

              <button
                type="button"
                onClick={handleLogToHistory}
                className="compact-btn h-8 text-xs px-3 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground font-bold inline-flex items-center gap-1 cursor-pointer shadow-2xs whitespace-nowrap"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>{bi('حفظ بالسجل', 'Log Score', 'تۆمارکردن لە دۆسیە')}</span>
              </button>
            </div>
          )}

          <div className="text-end">
            <span className="text-2xl font-black font-mono text-primary">
              {activePct !== null ? `${activePct}%` : '—'}
            </span>
            {activeCurrentRaw !== null && (
              <span className="text-xs font-mono text-muted-foreground-2 block">
                {activeCurrentRaw} {bi(activeScaleMeta.unitAr, activeScaleMeta.unitEn)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 3. Copyright-Safe Mode Body */}
      {activeSpec?.category === 'score_entry' && (
        <div className="p-3.5 sm:p-4 rounded-2xl bg-surface/65 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-black/[0.045] dark:border-white/[0.06]">
            <div className="flex items-start gap-2 text-xs text-muted-foreground-1">
              <Info className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
              <span>
                {bi(
                  'نموذج إدخال نتيجة (Score-Entry): أدخل الدرجة الإجمالية أو الفرعية من النموذج الورقي/الرسمي المرخص لديك دون تضمين نصوص الأسئلة المحمية.',
                  'Score-Entry Mode: Enter the total or subscale score from your licensed clinical form without storing proprietary item text.',
                  'مۆدی نووسینی ئەنجام (Score-Entry): کۆی نمرە یان بەشەکان لە فۆرمە فەرمییەکەتەوە بنووسە بەبێ تۆمارکردنی دەقی پرسیارە مۆڵەتپێدراوەکان.'
                )}
              </span>
            </div>

            {activeSpec.officialSourceUrl && (
              <a
                href={activeSpec.officialSourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline flex-shrink-0"
              >
                <span>{bi('المصدر الرسمي والترخيص', 'Official Source', 'سەرچاوەی فەرمی و مۆڵەت')}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>

          {selectedId === 'spadi' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-card space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="fs-spadi-pain" className="text-xs font-bold text-foreground">
                    {bi('المقياس الفرعي للألم (0–50)', 'Pain Subscale (0–50)', 'بەشی لاوەکی ئازار (0–50)')}
                  </label>
                  <span className="text-xs font-mono font-bold text-primary">{spadiPainPct}%</span>
                </div>
                <input
                  id="fs-spadi-pain"
                  type="number"
                  min={0}
                  max={50}
                  step="1"
                  disabled={readOnly}
                  value={spadiPain}
                  onChange={(e) => handleSpadiChange(Number(e.target.value), spadiDisability)}
                  className="w-full px-3 py-1.5 text-sm font-mono bg-surface/75 rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
                />
              </div>

              <div className="p-3 rounded-xl bg-card space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="fs-spadi-disability" className="text-xs font-bold text-foreground">
                    {bi('المقياس الفرعي للإعاقة (0–80)', 'Disability Subscale (0–80)', 'بەشی لاوەکی پەککەوتەیی (0–80)')}
                  </label>
                  <span className="text-xs font-mono font-bold text-primary">{spadiDisabPct}%</span>
                </div>
                <input
                  id="fs-spadi-disability"
                  type="number"
                  min={0}
                  max={80}
                  step="1"
                  disabled={readOnly}
                  value={spadiDisability}
                  onChange={(e) => handleSpadiChange(spadiPain, Number(e.target.value))}
                  className="w-full px-3 py-1.5 text-sm font-mono bg-surface/75 rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="fs-raw-score" className="text-xs font-bold text-foreground block mb-1">
                  {bi('النتيجة المسجلة', 'Entered Total Score', 'نمرەی تۆمارکراو')}
                </label>
                <input
                  id="fs-raw-score"
                  type="number"
                  min={activeSpec.minRaw}
                  max={customDenominator}
                  step="0.5"
                  disabled={readOnly}
                  value={rawInput}
                  onChange={(e) => handleRawInputChange(e.target.value)}
                  placeholder={`0 – ${customDenominator}`}
                  className="w-full px-3 py-2 text-sm font-mono bg-card rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
                />
              </div>

              <div>
                <label htmlFor="fs-max-score" className="text-xs font-bold text-foreground block mb-1">
                  {bi('الحد الأقصى للدرجة (Max)', 'Max Possible Score', 'بەرزترین نمرەی گونجاو (Max)')}
                </label>
                <input
                  id="fs-max-score"
                  type="number"
                  min={1}
                  max={200}
                  step="5"
                  disabled={readOnly || selectedId === 'quickdash'}
                  value={customDenominator}
                  onChange={(e) => {
                    const nextMax = Math.max(1, Number(e.target.value) || activeSpec.maxRaw);
                    setCustomDenominator(nextMax);
                    if (activeCurrentRaw !== null) {
                      emitScoreUpdate(selectedId, activeCurrentRaw, nextMax);
                    }
                  }}
                  className="w-full px-3 py-2 text-sm font-mono bg-card rounded-xl text-foreground disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-primary/25"
                />
              </div>

              <div>
                <label htmlFor="fs-baseline-score" className="text-xs font-bold text-foreground block mb-1">
                  {bi('نتيجة خط الأساس للمقارنة (اختياري)', 'Baseline Score for Δ (Optional)', 'نمرەی بنەڕەتی بۆ بەراورد (ئیختیاری)')}
                </label>
                <input
                  id="fs-baseline-score"
                  type="number"
                  min={0}
                  step="0.5"
                  disabled={readOnly}
                  value={baselineInput}
                  onChange={(e) => setBaselineInput(e.target.value)}
                  placeholder={bi('مثال: 28', 'e.g. 28', 'نموونە: 28')}
                  className="w-full px-3 py-2 text-sm font-mono bg-card rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* NPRS (0–10 tactile numeric pain scale) */}
      {selectedId === 'nprs' && (
        <div className="p-3.5 sm:p-4 rounded-2xl bg-surface/65 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-foreground">
              {bi(
                'شدة الألم الحالية (0 = بلا ألم • 10 = أشد ألم ممكن):',
                'Pain Intensity (0 = No pain • 10 = Worst imaginable):',
                'توندی ئازاری ئێستا (0 = بێ ئازار • 10 = توندترین ئازار):'
              )}
            </span>
          </div>
          <div className="grid grid-cols-6 sm:grid-cols-11 gap-1.5" dir="ltr">
            {Array.from({ length: 11 }, (_, n) => {
              const selected = activeCurrentRaw === n;
              return (
                <button
                  key={n}
                  type="button"
                  aria-pressed={selected}
                  disabled={readOnly}
                  onClick={() => {
                    setRawInput(String(n));
                    emitScoreUpdate('nprs', n, 10);
                  }}
                  className={`compact-btn h-8 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                    selected
                      ? n >= 7
                        ? 'bg-rose-700 text-white shadow-xs'
                        : n >= 4
                          ? 'bg-amber-500 text-slate-950 shadow-xs'
                          : 'bg-emerald-700 text-white shadow-xs'
                      : 'bg-card text-foreground hover:bg-surface'
                  }`}
                >
                  {n}
                </button>
              );
            })}
          </div>
          <div className="max-w-xs">
            <label htmlFor="nprs-baseline-input" className="text-xs font-bold text-foreground block mb-1">
              {bi('درجة الألم السابقة للمقارنة (اختياري):', 'Baseline NPRS for Δ (optional):', 'نمرەی ئازاری پێشوو بۆ بەراورد (ئیختیاری):')}
            </label>
            <input
              id="nprs-baseline-input"
              type="number"
              min={0}
              max={10}
              step="1"
              disabled={readOnly}
              value={baselineInput}
              onChange={(e) => setBaselineInput(e.target.value)}
              className="w-full px-3 py-1.5 text-xs font-mono bg-card rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
            />
          </div>
        </div>
      )}

      {/* PSFS (Generic prompt in our own words) */}
      {selectedId === 'psfs' && (
        <div className="p-3.5 sm:p-4 rounded-2xl bg-surface/65 space-y-3">
          <p className="text-xs text-muted-foreground-1 leading-relaxed">
            {bi(
              OUTCOME_INSTRUMENTS.psfs.procedureSummaryAr ?? '',
              OUTCOME_INSTRUMENTS.psfs.procedureSummaryEn ?? ''
            )}
          </p>

          <div className="space-y-2.5">
            {psfsItems.map((act, idx) => (
              <div key={act.id} className="p-3 rounded-xl bg-card space-y-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-mono font-bold text-primary shrink-0">#{idx + 1}</span>
                  <input
                    type="text"
                    disabled={readOnly}
                    value={act.label}
                    aria-label={bi(`وصف النشاط الوظيفي ${idx + 1}`, `Functional activity ${idx + 1} description`)}
                    onChange={(e) => {
                      const next = psfsItems.map((p) =>
                        p.id === act.id ? { ...p, label: e.target.value } : p
                      );
                      handlePsfsChange(next);
                    }}
                    placeholder={bi(
                      'اكتب النشاط اليومي المتأثر كما وصفه المريض...',
                      'Type patient-identified functional activity...',
                      'چالاکی ڕۆژانەی کاریگەر بنووسە وەک نەخۆش وەسفی کرد...'
                    )}
                    className="flex-1 min-w-0 w-0 text-xs bg-surface/75 rounded-xl px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
                  />
                  {!readOnly && psfsItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handlePsfsChange(psfsItems.filter((p) => p.id !== act.id))}
                      aria-label={bi(`حذف النشاط ${idx + 1}`, `Delete activity ${idx + 1}`)}
                      className="compact-btn size-8 p-1.5 rounded-xl text-muted-foreground-2 hover:text-rose-600 hover:bg-rose-500/10 inline-flex items-center justify-center cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={1}
                    disabled={readOnly}
                    value={act.score}
                    aria-label={bi(`تقييم النشاط ${idx + 1} من 10`, `Score for activity ${idx + 1} out of 10`)}
                    onChange={(e) => {
                      const next = psfsItems.map((p) =>
                        p.id === act.id ? { ...p, score: Number(e.target.value) } : p
                      );
                      handlePsfsChange(next);
                    }}
                    className="flex-1 accent-primary cursor-pointer"
                  />
                  <span className="text-xs font-mono font-bold text-foreground w-12 text-end">
                    <bdi dir="ltr">{act.score} / 10</bdi>
                  </span>
                </div>
              </div>
            ))}
          </div>

          {!readOnly && psfsItems.length < 5 && (
            <button
              type="button"
              onClick={() =>
                handlePsfsChange([
                  ...psfsItems,
                  { id: `act_${Date.now()}`, label: '', score: 5 },
                ])
              }
              className="compact-btn h-8 text-xs px-3 rounded-xl bg-card hover:bg-surface text-foreground font-bold inline-flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{bi('إضافة نشاط وظيفي', 'Add Activity', 'زیادکردنی چالاکی فرمانی')}</span>
            </button>
          )}
        </div>
      )}

      {/* TUG, 30s-CST, 5xSTS Procedures + Stopwatch */}
      {(selectedId === 'tug' || selectedId === 'chair_stand_30s' || selectedId === 'five_x_sts') &&
        activeSpec && (
          <div className="p-3.5 sm:p-4 rounded-2xl bg-surface/65 space-y-3">
            <p className="text-xs text-muted-foreground-1 leading-relaxed">
              {bi(activeSpec.procedureSummaryAr ?? '', activeSpec.procedureSummaryEn ?? '')}
            </p>

            {/* Interactive Stopwatch / 30s Countdown */}
            <div className="p-3 rounded-xl bg-card flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-mono font-black text-foreground">
                {selectedId === 'chair_stand_30s'
                  ? `${Math.max(0, 30 - elapsedSeconds).toFixed(1)} s ${bi('متبقي', 'remaining', 'ماوە')}`
                  : `${elapsedSeconds.toFixed(1)} s`}
              </div>

              <div className="flex items-center gap-2">
                {!timerRunning ? (
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={startTimer}
                    className="compact-btn h-8 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>{bi('بدء المؤقت', 'Start Timer', 'دەستپێکردنی کاتژمێر')}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => stopTimer(true)}
                    className="compact-btn h-8 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>
                      {selectedId === 'chair_stand_30s'
                        ? bi('إيقاف', 'Stop', 'وەستاندن')
                        : bi('إيقاف واعتماد الزمن', 'Stop & Apply', 'وەستاندن و چەسپاندنی کات')}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={readOnly}
                  onClick={resetTimer}
                  aria-label={bi('تصفير المؤقت', 'Reset timer', 'سفرکردنەوەی کاتژمێر')}
                  className="compact-btn size-8 rounded-xl bg-surface/75 hover:bg-surface text-muted-foreground-1 inline-flex items-center justify-center cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="fs-timed-raw" className="text-xs font-bold text-foreground block mb-1">
                  {selectedId === 'chair_stand_30s'
                    ? bi('عدد التكرارات الكاملة خلال 30 ثانية:', 'Completed repetitions in 30 s:', 'ژمارەی دووبارەبوونەوە تەواوەکان لە ٣٠ چرکەدا:')
                    : bi('الزمن المسجل (بالثواني):', 'Recorded Time (seconds):', 'کاتی تۆمارکراو (بە چرکە):')}
                </label>
                <input
                  id="fs-timed-raw"
                  type="number"
                  min={0}
                  step={selectedId === 'chair_stand_30s' ? '1' : '0.1'}
                  disabled={readOnly}
                  value={rawInput}
                  onChange={(e) => handleRawInputChange(e.target.value)}
                  placeholder={selectedId === 'chair_stand_30s' ? '0' : '0.0'}
                  className="w-full px-3 py-2 text-sm font-mono bg-card rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
                />
              </div>

              <div>
                <label htmlFor="fs-timed-baseline" className="text-xs font-bold text-foreground block mb-1">
                  {bi('قيمة خط الأساس للمقارنة (اختياري):', 'Baseline value for Δ (optional):', 'بەهای بنەڕەتی بۆ بەراورد (ئیختیاری):')}
                </label>
                <input
                  id="fs-timed-baseline"
                  type="number"
                  min={0}
                  step="0.1"
                  disabled={readOnly}
                  value={baselineInput}
                  onChange={(e) => setBaselineInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono bg-card rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
                />
              </div>
            </div>
          </div>
        )}

      {/* Custom Measure Builder */}
      {selectedId === 'custom' && (
        <div className="p-3.5 sm:p-4 rounded-2xl bg-surface/65 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            <Sliders className="w-4 h-4 text-primary" />
            <span>{bi('منشئ المقياس السريري المخصص', 'Custom Outcome Measure Builder', 'دروستکەری پێوانەی کلینیکی تایبەت')}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="fs-custom-name" className="text-xs font-bold text-foreground block mb-1">
                {bi('اسم المقياس:', 'Measure Name:', 'ناوی پێوانە:')}
              </label>
              <input
                id="fs-custom-name"
                type="text"
                disabled={readOnly}
                value={language !== 'en' ? customConfig.nameAr : customConfig.nameEn}
                onChange={(e) =>
                  handleCustomConfigChange(
                    language !== 'en' ? { nameAr: e.target.value } : { nameEn: e.target.value }
                  )
                }
                className="w-full px-3 py-1.5 text-xs bg-card rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
              />
            </div>

            <div>
              <label htmlFor="fs-custom-unit" className="text-xs font-bold text-foreground block mb-1">
                {bi('وحدة القياس:', 'Unit:', 'یەکەی پێوانە:')}
              </label>
              <input
                id="fs-custom-unit"
                type="text"
                disabled={readOnly}
                value={language !== 'en' ? customConfig.unitAr || '' : customConfig.unitEn || ''}
                onChange={(e) =>
                  handleCustomConfigChange(
                    language !== 'en' ? { unitAr: e.target.value } : { unitEn: e.target.value }
                  )
                }
                placeholder={bi('مثال: درجة / متر / تكرار', 'e.g. pts / meters / reps', 'نموونە: خاڵ / مەتر / دووبارەبوونەوە')}
                className="w-full px-3 py-1.5 text-xs bg-card rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
              />
            </div>

            <div>
              <span className="text-xs font-bold text-foreground block mb-1">
                {bi('الحد الأدنى – الحد الأقصى:', 'Min – Max Bounds:', 'کەمترین – زۆرترین سنوور:')}
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  disabled={readOnly}
                  value={customConfig.minScore}
                  aria-label={bi('الحد الأدنى للنتيجة', 'Minimum score bound')}
                  onChange={(e) =>
                    handleCustomConfigChange({ minScore: Number(e.target.value) || 0 })
                  }
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-card rounded-xl text-foreground"
                />
                <span className="text-xs text-muted-foreground-2">—</span>
                <input
                  type="number"
                  disabled={readOnly}
                  value={customConfig.maxScore}
                  aria-label={bi('الحد الأقصى للنتيجة', 'Maximum score bound')}
                  onChange={(e) =>
                    handleCustomConfigChange({ maxScore: Number(e.target.value) || 100 })
                  }
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-card rounded-xl text-foreground"
                />
              </div>
            </div>

            <div>
              <label htmlFor="fs-custom-direction" className="text-xs font-bold text-foreground block mb-1">
                {bi('اتجاه التحسن وعتبة MCID:', 'Improvement Direction & MCID:', 'ئاراستەی باشبوون و ئاستی MCID:')}
              </label>
              <div className="flex items-center gap-2">
                <select
                  id="fs-custom-direction"
                  disabled={readOnly}
                  value={customConfig.higherIsBetter ? 'higher' : 'lower'}
                  onChange={(e) =>
                    handleCustomConfigChange({ higherIsBetter: e.target.value === 'higher' })
                  }
                  className="flex-1 min-w-0 px-2.5 py-1.5 text-xs bg-card rounded-xl text-foreground"
                >
                  <option value="higher">{bi('الأعلى أفضل ↑', 'Higher is better ↑', 'بەرزتر باشترە ↑')}</option>
                  <option value="lower">{bi('الأقل أفضل ↓', 'Lower is better ↓', 'نزمتر باشترە ↓')}</option>
                </select>
                <input
                  type="number"
                  disabled={readOnly}
                  value={customConfig.mcidDelta ?? 0}
                  aria-label={bi('عتبة التغيير السريري MCID', 'MCID threshold value')}
                  onChange={(e) =>
                    handleCustomConfigChange({ mcidDelta: Number(e.target.value) || 0 })
                  }
                  placeholder="MCID Δ"
                  className="w-20 sm:w-24 px-2.5 py-1.5 text-xs font-mono bg-card rounded-xl text-foreground"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-black/[0.045] dark:border-white/[0.06]">
            <div>
              <label htmlFor="fs-custom-raw" className="text-xs font-bold text-foreground block mb-1">
                {bi('القيمة المقاسة حالياً:', 'Current Measured Value:', 'بەهای پێوراوی ئێستا:')}
              </label>
              <input
                id="fs-custom-raw"
                type="number"
                step="0.1"
                disabled={readOnly}
                value={rawInput}
                onChange={(e) => handleRawInputChange(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-card rounded-xl text-foreground"
              />
            </div>

            <div>
              <label htmlFor="fs-custom-baseline" className="text-xs font-bold text-foreground block mb-1">
                {bi('قيمة خط الأساس للمقارنة (اختياري):', 'Baseline Value (optional):', 'بەهای بنەڕەتی (ئیختیاری):')}
              </label>
              <input
                id="fs-custom-baseline"
                type="number"
                step="0.1"
                disabled={readOnly}
                value={baselineInput}
                onChange={(e) => setBaselineInput(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-card rounded-xl text-foreground"
              />
            </div>
          </div>
        </div>
      )}

      {/* 4. Evidence-Cited MCID / MDC & Change Analysis Card */}
      <div className="p-3.5 rounded-2xl bg-surface/65 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
            <Calculator className="w-4 h-4 text-primary" />
            <span>
              {activeSpec
                ? bi(activeSpec.mcidLabelAr, activeSpec.mcidLabelEn)
                : bi(
                    `عتبة MCID المحددة: Δ ≥ ${customConfig.mcidDelta || 0}`,
                    `Configured MCID: Δ ≥ ${customConfig.mcidDelta || 0}`,
                    `ئاستی دیاریکراوی MCID: Δ ≥ ${customConfig.mcidDelta || 0}`
                  )}
            </span>
          </div>

          {activeSpec && (
            <span className="text-xs font-medium text-muted-foreground-1">
              {bi(activeSpec.mdcLabelAr, activeSpec.mdcLabelEn)}
            </span>
          )}
        </div>

        {changeEvaluation && (
          <div
            className={`px-2 py-1 text-xs font-bold flex items-center gap-2 ${
              changeEvaluation.mcidMet
                ? 'text-emerald-700 dark:text-emerald-300'
                : changeEvaluation.improved
                  ? 'text-primary'
                  : 'text-orange-600 dark:text-orange-400'
            }`}
          >
            <TrendingUp className="w-4 h-4 flex-shrink-0" />
            <span>{bi(changeEvaluation.summaryAr, changeEvaluation.summaryEn)}</span>
          </div>
        )}

        {activeSpec && (
          <p className="text-xs text-muted-foreground-2">
            {bi('المرجع العلمي: ', 'Citation: ', 'سەرچاوەی زانستی: ')}
            {activeSpec.citation}
          </p>
        )}
      </div>

      {/* 5. Outcome Score History Timeline & Longitudinal MCID Chart */}
      {value?.history && value.history.length > 0 && (() => {
        const chronological = [...value.history].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        const baseline = chronological[0];
        const mcidBandTarget =
          activeSpec && activeSpec.mcidUnitIsPercent
            ? Math.max(
                0,
                Math.min(
                  100,
                  activeSpec.higherIsBetter
                    ? baseline.scorePercentage + activeSpec.mcidValue
                    : baseline.scorePercentage - activeSpec.mcidValue
                )
              )
            : null;
        return (
        <div className="p-3.5 rounded-2xl bg-surface/65 space-y-3">
          <div className="flex items-center justify-between">
            <h5 className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <History className="w-4 h-4 text-primary" />
              <span>{bi('السجل الزمني ومنحنى التغير (MCID)', 'Recorded Outcome Timeline & Trend', 'تۆماری کاتی و هێڵی گۆڕانکاری (MCID)')}</span>
            </h5>
            <span className="text-xs text-muted-foreground-2">
              {value.history.length} {bi('قراءة', 'entries', 'تۆمار')}
            </span>
          </div>

          {chronological.length >= 1 && (
            <div className="h-32 sm:h-36 w-full px-1">
              <svg viewBox="0 0 320 105" className="w-full h-full overflow-visible">
                {mcidBandTarget !== null && (
                  <line
                    x1="24"
                    y1={86 - (mcidBandTarget / 100) * 60}
                    x2="305"
                    y2={86 - (mcidBandTarget / 100) * 60}
                    stroke="#10b981"
                    strokeDasharray="4 3"
                    strokeWidth="1.5"
                  />
                )}
                {[0, 50, 100].map((tick) => {
                  const y = 86 - (tick / 100) * 60;
                  return (
                    <line
                      key={tick}
                      x1="24"
                      y1={y}
                      x2="305"
                      y2={y}
                      stroke="currentColor"
                      strokeDasharray="2 3"
                      className="text-slate-200 dark:text-slate-700"
                    />
                  );
                })}
                {chronological.length > 1 && (
                  <polyline
                    fill="none"
                    stroke="#0d9488"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={chronological
                      .map((pt, i) => {
                        const x = 35 + (i / Math.max(1, chronological.length - 1)) * 255;
                        const y = 86 - (pt.scorePercentage / 100) * 60;
                        return `${x},${y}`;
                      })
                      .join(' ')}
                  />
                )}
                {chronological.map((pt, i) => {
                  const x =
                    chronological.length === 1
                      ? 165
                      : 35 + (i / (chronological.length - 1)) * 255;
                  const y = 86 - (pt.scorePercentage / 100) * 60;
                  return (
                    <g key={pt.id}>
                      <circle cx={x} cy={y} r="4" className="fill-primary stroke-white dark:stroke-slate-900 stroke-1.5" />
                      <text x={x} y={y - 9} fontSize="13" textAnchor="middle" className="fill-foreground font-mono font-bold">
                        {pt.scorePercentage}%
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          )}

          <div className="divide-y divide-black/[0.045] dark:divide-white/[0.06]">
            {value.history.map((pt) => (
              <div
                key={pt.id}
                className="py-2 flex items-center justify-between gap-2 text-xs"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold uppercase text-primary">
                    {pt.scaleId}
                  </span>
                  <span className="text-muted-foreground-2">
                    {new Date(pt.date).toLocaleDateString(language !== 'en' ? 'ar-IQ' : 'en-GB')}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-card text-muted-foreground-1">
                    {pt.visitType}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground-1">
                    {bi(pt.severityLabelAr, pt.severityLabelEn)}
                  </span>
                  {typeof pt.rawScore === 'number' && (
                    <span className="font-mono text-muted-foreground-1">({pt.rawScore})</span>
                  )}
                  <span className="font-mono font-bold text-foreground">
                    {pt.scorePercentage}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
        );
      })()}

      {enablePerformanceTestLibrary && onPerformanceTestsChange && (
        <Suspense fallback={null}>
          <PerformanceTestsPanel
            entries={performanceTests}
            onChange={onPerformanceTestsChange}
            patientAge={patientAge}
            patientGender={patientGender}
            readOnly={readOnly}
          />
        </Suspense>
      )}
        </AccessibleTabPanel>
      </AccessibleTabs>
    </div>
  );
};
