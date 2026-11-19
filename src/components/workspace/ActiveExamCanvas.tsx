// =======================================================================
// PhysioRecord — Active Examination Canvas (Drop Zone & Cards)
// Renders active assessment widgets with drag-and-drop drop-target
// =======================================================================

import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import type { SoapObjectiveData, PatientBodyChartData } from '../../types/clinical';
import type { OrthopedicSpecialTestItem, GaitPostureData, FunctionalScaleEntry, CustomWidgetDefinition } from '../../types/clinicalWidgets';
import type { PerformanceTestResultEntry } from '../../types/clinicManagement';

const isInitialCompactViewport = () =>
  typeof window !== 'undefined' && window.innerWidth < 768;

const BodyChartWidget = lazy(() =>
  import('../widgets/BodyChartWidget').then((m) => ({ default: m.BodyChartWidget }))
);
const RomWidget = lazy(() =>
  import('../widgets/RomWidget').then((m) => ({ default: m.RomWidget }))
);
const MmtWidget = lazy(() =>
  import('../widgets/MmtWidget').then((m) => ({ default: m.MmtWidget }))
);
const NeuroWidget = lazy(() =>
  import('../widgets/NeuroWidget').then((m) => ({ default: m.NeuroWidget }))
);
const SpecialTestsWidget = lazy(() =>
  import('../widgets/SpecialTestsWidget').then((m) => ({ default: m.SpecialTestsWidget }))
);
const GaitPostureWidget = lazy(() =>
  import('../widgets/GaitPostureWidget').then((m) => ({ default: m.GaitPostureWidget }))
);
const FunctionalScalesWidget = lazy(() =>
  import('../widgets/FunctionalScalesWidget').then((m) => ({ default: m.FunctionalScalesWidget }))
);
const DynamicCustomWidget = lazy(() =>
  import('../widgets/DynamicCustomWidget').then((m) => ({ default: m.DynamicCustomWidget }))
);
import {
  ChevronDown,
  ChevronUp,
  Trash2,
  MapPin,
  Activity,
  Dumbbell,
  Brain,
  Stethoscope,
  Footprints,
  FileCheck,
  Sparkles,
  Inbox,
  ArrowLeft,
} from 'lucide-react';

interface ActiveExamCanvasProps {
  activeWidgetIds: string[];
  onRemoveWidget: (widgetId: string) => void;
  onAddWidget: (widgetId: string) => void;
  bodyChart: PatientBodyChartData | undefined;
  onBodyChartChange: (chart: PatientBodyChartData) => void;
  objective: SoapObjectiveData;
  onObjectiveChange: (obj: SoapObjectiveData) => void;
  specialTests: OrthopedicSpecialTestItem[];
  onSpecialTestsChange: (tests: OrthopedicSpecialTestItem[]) => void;
  gaitPosture: GaitPostureData | undefined;
  onGaitPostureChange: (gait: GaitPostureData) => void;
  functionalScales: FunctionalScaleEntry | undefined;
  onFunctionalScalesChange: (scale: FunctionalScaleEntry) => void;
  customWidgetsData: Record<string, Record<string, unknown>>;
  onCustomWidgetsDataChange: (data: Record<string, Record<string, unknown>>) => void;
  performanceTests?: PerformanceTestResultEntry[];
  onPerformanceTestsChange?: (updated: PerformanceTestResultEntry[]) => void;
  patientAge?: number;
  patientGender?: 'male' | 'female' | 'other';
  enablePerformanceTestLibrary?: boolean;
  onOpenExamShelf?: () => void;
  singleWidgetId?: string;
  focusedWidgetId?: string | null;
  focusSignal?: number;
  onActiveWidgetChange?: (widgetId: string | null) => void;
  readOnly?: boolean;
}

export const ActiveExamCanvas: React.FC<ActiveExamCanvasProps> = ({
  activeWidgetIds,
  onRemoveWidget,
  onAddWidget,
  bodyChart,
  onBodyChartChange,
  objective,
  onObjectiveChange,
  specialTests,
  onSpecialTestsChange,
  gaitPosture,
  onGaitPostureChange,
  functionalScales,
  onFunctionalScalesChange,
  customWidgetsData,
  onCustomWidgetsDataChange,
  performanceTests,
  onPerformanceTestsChange,
  patientAge,
  patientGender,
  enablePerformanceTestLibrary,
  onOpenExamShelf,
  singleWidgetId,
  focusedWidgetId = null,
  focusSignal = 0,
  onActiveWidgetChange,
  readOnly = false,
}) => {
  const { bi } = useLanguage();

  const [isDragOver, setIsDragOver] = useState(false);
  const [isCompactViewport, setIsCompactViewport] = useState<boolean>(isInitialCompactViewport);
  const [expandedMobileWidgetId, setExpandedMobileWidgetId] = useState<string | null>(null);
  const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>({});
  const [pendingRemoveWidgetId, setPendingRemoveWidgetId] = useState<string | null>(null);

  const onActiveWidgetChangeRef = useRef(onActiveWidgetChange);
  onActiveWidgetChangeRef.current = onActiveWidgetChange;

  const [customDefinitions, setCustomDefinitions] = useState<CustomWidgetDefinition[]>(() =>
    ClinicOperationsService.getCustomWidgets()
  );
  useEffect(() => {
    void ClinicOperationsService.ensureColdStoreLoadedAsync('customWidgets');
    const syncCustomWidgets = () => {
      setCustomDefinitions(ClinicOperationsService.getCustomWidgets());
    };
    syncCustomWidgets();
    return ClinicOperationsService.subscribe(syncCustomWidgets);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const sync = () => setIsCompactViewport(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!focusSignal) return;
    if (!focusedWidgetId) {
      if (isCompactViewport && !readOnly) {
        setExpandedMobileWidgetId(null);
      }
      return;
    }
    if (isCompactViewport && !readOnly) {
      setExpandedMobileWidgetId(focusedWidgetId);
    } else {
      setCollapsedMap((prev) => ({ ...prev, [focusedWidgetId]: false }));
    }
    onActiveWidgetChangeRef.current?.(focusedWidgetId);
    const timer = window.setTimeout(() => {
      document.getElementById(`exam-station-${focusedWidgetId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [focusedWidgetId, focusSignal, isCompactViewport, readOnly]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const widgetId = e.dataTransfer.getData('text/plain');
    if (widgetId) {
      onAddWidget(widgetId);
    }
  };

  const useMobileSingleFocus = isCompactViewport && !readOnly;

  const toggleCollapse = (id: string) => {
    if (useMobileSingleFocus) {
      const next = expandedMobileWidgetId === id ? null : id;
      setExpandedMobileWidgetId(next);
      onActiveWidgetChangeRef.current?.(next);
      return;
    }
    const nextCollapsed = !collapsedMap[id];
    setCollapsedMap((prev) => ({
      ...prev,
      [id]: nextCollapsed,
    }));
    onActiveWidgetChangeRef.current?.(nextCollapsed ? null : id);
  };

  const getWidgetTitle = (id: string) => {
    switch (id) {
      case 'body_chart':
        return {
          title: bi(
            'مخطط الجسم التشريحي ومواضع الألم',
            'Anatomical Body Map & Pain Charting',
            'هێڵکاری جەستە و شوێنی ئازارەکان'
          ),
          shortTitle: bi('مخطط الجسم', 'Body Map', 'هێڵکاری جەستە'),
          icon: <MapPin className="size-4 text-rose-500" />,
        };
      case 'rom':
        return {
          title: bi(
            'قياس المدى الحركي المفصلي (ROM)',
            'Range of Motion (ROM Goniometry)',
            'پێوانی مەودای جووڵەی جومگە (ROM)'
          ),
          shortTitle: bi('المدى الحركي ROM', 'ROM', 'ROM'),
          icon: <Activity className="size-4 text-primary" />,
        };
      case 'mmt':
        return {
          title: bi(
            'اختبار القوة العضلية اليدوي (MMT)',
            'Manual Muscle Strength (MMT MRC Scale)',
            'تاقیکردنەوەی هێزی ماسولکە بە دەست (MMT)'
          ),
          shortTitle: bi('القوة العضلية MMT', 'MMT', 'MMT'),
          icon: <Dumbbell className="size-4 text-sky-600 dark:text-sky-400" />,
        };
      case 'neuro':
        return {
          title: bi(
            'الفحص العصبي وخريطة القطاعات الجلدية',
            'Neurological Screening & Dermatome Map',
            'پشکنینی دەماری و نەخشەی دێرماتۆمەکان'
          ),
          shortTitle: bi('الفحص العصبي', 'Neuro', 'دەماری'),
          icon: <Brain className="size-4 text-purple-600 dark:text-purple-400" />,
        };
      case 'special_tests':
        return {
          title: bi(
            'الفحوصات العظمية التخصصية (Orthopedic Provocative)',
            'Orthopedic Special Provocative Tests',
            'تاقیکردنەوە تایبەتییەکانی ئێسک (Orthopedic)'
          ),
          shortTitle: bi('الاختبارات التخصصية', 'Special Tests', 'تاقیکردنەوەکان'),
          icon: <Stethoscope className="size-4 text-amber-600 dark:text-amber-400" />,
        };
      case 'gait_posture':
        return {
          title: bi(
            'تقييم المشي والقوام واختبار TUG',
            'Gait, Posture & Timed Up & Go (TUG)',
            'هەڵسەنگاندنی ڕۆیشتن، وەستان و تاقیکردنەوەی TUG'
          ),
          shortTitle: bi('المشي والقوام', 'Gait & Posture', 'ڕۆیشتن'),
          icon: <Footprints className="size-4 text-emerald-600 dark:text-emerald-400" />,
        };
      case 'functional_scales':
        return {
          title: bi(
            'المقاييس الوظيفية والاختبارات الأدائية (Outcome Measures)',
            'Outcome Measures & Functional Scales',
            'پێوەرە فەرمانییەکان و تاقیکردنەوە جێبەجێکارییەکان'
          ),
          shortTitle: bi('المقاييس الوظيفية', 'Scales', 'پێوەرەکان'),
          icon: <FileCheck className="size-4 text-indigo-600 dark:text-indigo-400" />,
        };
      default: {
        const customDef = customDefinitions.find((cd) => cd.id === id);
        const label = customDef
          ? bi(customDef.titleAr, customDef.titleEn)
          : bi('فحص سريري مخصص', 'Custom Clinical Test', 'پشکنینی کلینیکی تایبەت');
        return {
          title: label,
          shortTitle: label,
          icon: <Sparkles className="size-4 text-fuchsia-600 dark:text-fuchsia-400" />,
        };
      }
    }
  };

  const getWidgetSummary = (id: string): { text: string; hasData: boolean; accentClass?: string } => {
    const emptyLabel = bi('لم يُسجل بعد', 'Not recorded yet', 'هێشتا تۆمار نەکراوە');
    switch (id) {
      case 'body_chart': {
        const count = bodyChart?.markers?.length || 0;
        return {
          text: count > 0 ? bi(`${count} نقاط مسجلة`, `${count} pins`, `${count} خاڵ`) : emptyLabel,
          hasData: count > 0,
        };
      }
      case 'rom': {
        const count = objective?.romBattery?.entries?.length || 0;
        return {
          text: count > 0 ? bi(`${count} قياسات مسجلة`, `${count} ROM`, `${count} پێوان`) : emptyLabel,
          hasData: count > 0,
        };
      }
      case 'mmt': {
        const count = objective?.mmtBattery?.entries?.length || 0;
        return {
          text: count > 0 ? bi(`${count} عضلات مسجلة`, `${count} MMT`, `${count} ماسولکە`) : emptyLabel,
          hasData: count > 0,
        };
      }
      case 'neuro': {
        const ns = objective?.neuroScreening;
        const count =
          (ns?.dermatomes?.length || 0) +
          (ns?.reflexes?.length || 0) +
          (ns?.myotomes?.length || 0) +
          Object.keys(ns?.sensoryTable || {}).length;
        return {
          text: count > 0 ? bi(`${count} نتائج عصبية`, `${count} findings`, `${count} ئەنجام`) : emptyLabel,
          hasData: count > 0,
        };
      }
      case 'special_tests': {
        const tested = (specialTests || []).filter((t) => t.outcome !== 'not_tested');
        const pos = tested.filter(
          (t) => t.outcome === 'positive' || t.outcome === 'pain_reproduced'
        ).length;
        if (pos > 0) {
          return {
            text: bi(
              `${tested.length} مختبر · ${pos} إيجابي`,
              `${tested.length} tested · ${pos} (+)`,
              `${tested.length} تاقیکراو · ${pos} (+)`
            ),
            hasData: true,
            accentClass: 'text-rose-700 dark:text-rose-400',
          };
        }
        return {
          text: tested.length > 0 ? bi(`${tested.length} مختبر`, `${tested.length} tested`, `${tested.length} تاقیکراو`) : emptyLabel,
          hasData: tested.length > 0,
        };
      }
      case 'gait_posture': {
        const devCount = gaitPosture?.postureDeviations?.length || 0;
        const tug = gaitPosture?.tugSeconds;
        const hasTug = tug !== null && tug !== undefined;
        if (hasTug && devCount > 0) {
          return {
            text: bi(`${tug} ث · ${devCount} ملاحظات`, `${tug}s · ${devCount} findings`),
            hasData: true,
          };
        }
        if (hasTug) {
          return {
            text: bi(`${tug} ث (TUG)`, `${tug}s (TUG)`),
            hasData: true,
          };
        }
        if (devCount > 0) {
          return {
            text: bi(`${devCount} ملاحظات قوام`, `${devCount} findings`),
            hasData: true,
          };
        }
        return { text: emptyLabel, hasData: false };
      }
      case 'functional_scales': {
        const parts: string[] = [];
        if (functionalScales && typeof functionalScales.rawScore === 'number') {
          parts.push(`${functionalScales.scaleId.toUpperCase()} ${functionalScales.scorePercentage}%`);
        }
        const perfCount = performanceTests?.length || 0;
        if (perfCount > 0) {
          parts.push(bi(`${perfCount} اختبار أداء`, `${perfCount} perf`, `${perfCount} تاقیکردنەوە`));
        }
        return {
          text: parts.length > 0 ? parts.join(' · ') : emptyLabel,
          hasData: parts.length > 0,
        };
      }
      default: {
        const dataObj = customWidgetsData?.[id] || {};
        const filled = Object.values(dataObj).filter(
          (v) => v !== undefined && v !== null && String(v).trim() !== ''
        ).length;
        return {
          text: filled > 0 ? bi(`${filled} حقول مسجلة`, `${filled} recorded`) : emptyLabel,
          hasData: filled > 0,
        };
      }
    }
  };

  const renderWidgetContent = (widgetId: string) => (
    <Suspense
      fallback={
        <div className="py-6 text-center text-xs text-muted-foreground-1">
          {bi('جاري تحميل أداة الفحص...', 'Loading exam module...', 'ئامرازی پشکنین باردەکرێت...')}
        </div>
      }
    >
      {widgetId === 'body_chart' && (
        <BodyChartWidget
          value={bodyChart}
          onChange={onBodyChartChange}
          readOnly={readOnly}
        />
      )}

      {widgetId === 'rom' && (
        <RomWidget
          value={objective.romBattery}
          onChange={(battery) =>
            onObjectiveChange({ ...objective, romBattery: battery })
          }
          readOnly={readOnly}
        />
      )}

      {widgetId === 'mmt' && (
        <MmtWidget
          value={objective.mmtBattery}
          onChange={(battery) =>
            onObjectiveChange({ ...objective, mmtBattery: battery })
          }
          readOnly={readOnly}
        />
      )}

      {widgetId === 'neuro' && (
        <NeuroWidget
          value={objective.neuroScreening}
          onChange={(screening) =>
            onObjectiveChange({ ...objective, neuroScreening: screening })
          }
          readOnly={readOnly}
        />
      )}

      {widgetId === 'special_tests' && (
        <SpecialTestsWidget
          value={specialTests}
          onChange={onSpecialTestsChange}
          readOnly={readOnly}
        />
      )}

      {widgetId === 'gait_posture' && (
        <GaitPostureWidget
          value={gaitPosture}
          onChange={onGaitPostureChange}
          readOnly={readOnly}
        />
      )}

      {widgetId === 'functional_scales' && (
        <FunctionalScalesWidget
          value={functionalScales}
          onChange={onFunctionalScalesChange}
          performanceTests={performanceTests}
          onPerformanceTestsChange={onPerformanceTestsChange}
          patientAge={patientAge}
          patientGender={patientGender}
          enablePerformanceTestLibrary={enablePerformanceTestLibrary}
          readOnly={readOnly}
        />
      )}

      {/* AI Custom Widgets */}
      {!['body_chart', 'rom', 'mmt', 'neuro', 'special_tests', 'gait_posture', 'functional_scales'].includes(widgetId) &&
        (() => {
          const customDef = customDefinitions.find((cd) => cd.id === widgetId);
          if (!customDef) {
            return (
              <p className="text-xs text-muted-foreground-1 italic">
                {bi(
                  'لم يتم العثور على تعريف هذا الفحص المخصص.',
                  'Custom widget definition not found.',
                  'پێناسەی ئەم پشکنینە تایبەتە نەدۆزرایەوە.'
                )}
              </p>
            );
          }
          return (
            <DynamicCustomWidget
              definition={customDef}
              value={customWidgetsData[widgetId] || {}}
              onChange={(widgetVal) =>
                onCustomWidgetsDataChange({
                  ...customWidgetsData,
                  [widgetId]: widgetVal,
                })
              }
              readOnly={readOnly}
            />
          );
        })()}
    </Suspense>
  );

  if (singleWidgetId) {
    return renderWidgetContent(singleWidgetId);
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`rounded-2xl transition-all ${
        isDragOver
          ? 'ring-2 ring-primary ring-dashed bg-primary/5 p-2'
          : 'space-y-4'
      }`}
    >
      {/* Drop Zone Visual Cue when dragging */}
      {isDragOver && (
        <div className="p-8 border-2 border-dashed border-primary rounded-2xl bg-primary/10 text-center">
          <p className="text-sm font-bold text-primary">
            {bi(
              'أفلت الفحص هنا لإدراجه فوراً في السجل السريري',
              'Drop examination card here to insert into chart',
              'پشکنینەکە لێرە دابنێ بۆ زیادکردنی دەستبەجێ لە تۆماردا'
            )}
          </p>
        </div>
      )}

      {/* Empty State when no widgets are active */}
      {activeWidgetIds.length === 0 && !isDragOver && (
        <div className="p-8 sm:p-10 rounded-2xl pr-surface text-center space-y-3">
          <div className="size-11 rounded-2xl bg-surface/80 text-muted-foreground-1 flex items-center justify-center mx-auto">
            <Inbox className="size-6" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground">
              {bi(
                'لم يتم إدراج أي فحوصات سريرية بعد',
                'No clinical examination cards added yet',
                'هێشتا هیچ کارتی پشکنینێکی کلینیکی زیاد نەکراوە'
              )}
            </h2>
            <p className="text-xs text-muted-foreground-1 max-w-md mx-auto mt-1">
              {bi(
                'افتح أدوات الفحص من الشريط العلوي لإدراج الأدوات المناسبة (مخطط الجسم، ROM، MMT، خريطة القطاعات الجلدية، أو الفحوصات العظمية).',
                'Open Assessment Tools from the top toolbar to add exams (Body Map, ROM, MMT, Dermatome Map, or Special Tests).',
                'ئامرازەکانی پشکنین لە شریتی سەرەوە بکەرەوە بۆ زیادکردنی پشکنینەکان (هێڵکاری جەستە، ROM، MMT، نەخشەی دێرماتۆم، یان تاقیکردنەوە تایبەتییەکان).'
              )}
            </p>
          </div>
          {onOpenExamShelf && (
            <button
              type="button"
              onClick={onOpenExamShelf}
              className="compact-btn h-9 px-3.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold cursor-pointer inline-flex items-center gap-1.5"
            >
              <span>{bi('فتح أدوات الفحص', 'Open Assessment Tools', 'کردنەوەی ئامرازەکانی پشکنین')}</span>
            </button>
          )}
        </div>
      )}

      {/* Render Active Widgets */}
      <div className="space-y-3 sm:space-y-4">
        {activeWidgetIds.map((widgetId, widgetIndex) => {
          const isCollapsed = useMobileSingleFocus
            ? expandedMobileWidgetId !== widgetId
            : collapsedMap[widgetId] || false;
          const { title, icon } = getWidgetTitle(widgetId);
          const summary = getWidgetSummary(widgetId);
          const nextWidgetId =
            widgetIndex + 1 < activeWidgetIds.length ? activeWidgetIds[widgetIndex + 1] : null;

          return (
            <div
              key={widgetId}
              id={`exam-station-${widgetId}`}
              className="rounded-2xl pr-surface overflow-hidden transition-all scroll-mt-4"
            >
              {/* Card Header */}
              <div className="px-3.5 sm:px-5 py-2.5 sm:py-3 bg-surface/40 border-b border-black/[0.045] dark:border-white/[0.06] flex items-center justify-between gap-2 sm:gap-3">
                <button
                  type="button"
                  aria-expanded={!isCollapsed}
                  onClick={() => toggleCollapse(widgetId)}
                  className="compact-btn flex items-center gap-2.5 min-w-0 flex-1 text-start cursor-pointer"
                >
                  <div className="size-8 rounded-xl bg-surface/80 flex items-center justify-center shrink-0">
                    {icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xs sm:text-sm font-bold text-foreground truncate">{title}</h2>
                    <span
                      className={`block text-xs truncate font-medium mt-0.5 tabular-nums ${
                        summary.accentClass
                          ? `${summary.accentClass} font-bold`
                          : summary.hasData
                            ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                            : 'text-muted-foreground-1'
                      }`}
                    >
                      {summary.text}
                    </span>
                  </div>
                </button>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    aria-expanded={!isCollapsed}
                    onClick={() => toggleCollapse(widgetId)}
                    className="compact-btn h-8 px-2 sm:px-2.5 text-muted-foreground-1 hover:text-foreground rounded-xl hover:bg-surface/80 transition-colors cursor-pointer inline-flex items-center gap-1"
                    title={
                      isCollapsed
                        ? bi('توسيع', 'Expand', 'کردنەوە')
                        : bi('طي', 'Collapse', 'داخستن')
                    }
                  >
                    <span className="text-xs font-semibold hidden sm:inline">
                      {isCollapsed
                        ? bi('فتح', 'Expand', 'کردنەوە')
                        : bi('طي', 'Collapse', 'داخستن')}
                    </span>
                    {isCollapsed ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
                  </button>

                  {!readOnly &&
                    (pendingRemoveWidgetId === widgetId ? (
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setPendingRemoveWidgetId(null);
                            if (expandedMobileWidgetId === widgetId) {
                              setExpandedMobileWidgetId(null);
                              onActiveWidgetChangeRef.current?.(null);
                            }
                            onRemoveWidget(widgetId);
                          }}
                          className="compact-btn h-8 px-2.5 rounded-xl bg-rose-600 text-white text-xs font-bold cursor-pointer"
                        >
                          {bi('تأكيد الإزالة', 'Confirm Remove', 'دڵنیاکردنەوەی لابردن')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingRemoveWidgetId(null)}
                          className="compact-btn h-8 px-2.5 rounded-xl bg-surface/80 hover:bg-surface text-foreground text-xs font-semibold cursor-pointer"
                        >
                          {bi('إلغاء', 'Cancel', 'هەڵوەشاندنەوە')}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPendingRemoveWidgetId(widgetId)}
                        className="compact-btn size-8 p-1.5 text-muted-foreground-1 hover:text-rose-600 rounded-xl hover:bg-rose-500/10 transition-colors cursor-pointer inline-flex items-center justify-center"
                        aria-label={bi('إزالة الفحص', 'Remove card', 'لابردنی پشکنین')}
                        title={bi('إزالة الفحص', 'Remove card', 'لابردنی پشکنین')}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    ))}
                </div>
              </div>

              {/* Card Body */}
              {!isCollapsed && (
                <div className="p-3.5 sm:p-5 bg-card">
                  {renderWidgetContent(widgetId)}

                  {useMobileSingleFocus && nextWidgetId && (
                    <div className="mt-4 pt-3 border-t border-black/[0.045] dark:border-white/[0.06] flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground-1 font-medium tabular-nums">
                        {bi(
                          `الأداة ${widgetIndex + 1} من ${activeWidgetIds.length}`,
                          `Tool ${widgetIndex + 1} of ${activeWidgetIds.length}`,
                          `ئامراز ${widgetIndex + 1} لە ${activeWidgetIds.length}`
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedMobileWidgetId(nextWidgetId);
                          onActiveWidgetChangeRef.current?.(nextWidgetId);
                          window.setTimeout(() => {
                            document.getElementById(`exam-station-${nextWidgetId}`)?.scrollIntoView({
                              behavior: 'smooth',
                              block: 'nearest',
                            });
                          }, 60);
                        }}
                        className="compact-btn h-8 px-3 rounded-xl bg-primary/10 hover:bg-primary/15 text-primary text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <span>
                          {bi('التالي:', 'Next:', 'دواتر:')} {getWidgetTitle(nextWidgetId).shortTitle}
                        </span>
                        <ArrowLeft className="size-3.5 rtl:rotate-0 ltr:rotate-180" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
