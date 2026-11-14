// =======================================================================
// PhysioRecord — Active Examination Canvas (Drop Zone & Cards)
// Renders active assessment widgets with drag-and-drop drop-target
// =======================================================================

import React, { useState, Suspense, lazy } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import type { SoapObjectiveData, PatientBodyChartData } from '../../types/clinical';
import type { OrthopedicSpecialTestItem, GaitPostureData, FunctionalScaleEntry, CustomWidgetDefinition } from '../../types/clinicalWidgets';
import type { PerformanceTestResultEntry } from '../../types/clinicManagement';

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
  readOnly = false,
}) => {
  const { bi } = useLanguage();

  const [isDragOver, setIsDragOver] = useState(false);
  const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>({});

  const [customDefinitions, setCustomDefinitions] = useState<CustomWidgetDefinition[]>(() =>
    ClinicOperationsService.getCustomWidgets()
  );
  React.useEffect(() => {
    void ClinicOperationsService.ensureColdStoreLoadedAsync('customWidgets');
    const syncCustomWidgets = () => {
      setCustomDefinitions(ClinicOperationsService.getCustomWidgets());
    };
    syncCustomWidgets();
    return ClinicOperationsService.subscribe(syncCustomWidgets);
  }, []);

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

  const toggleCollapse = (id: string) => {
    setCollapsedMap((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
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
          icon: <MapPin className="size-4 text-rose-500" />,
        };
      case 'rom':
        return {
          title: bi(
            'قياس المدى الحركي المفصلي (ROM)',
            'Range of Motion (ROM Goniometry)',
            'پێوانی مەودای جووڵەی جومگە (ROM)'
          ),
          icon: <Activity className="size-4 text-primary" />,
        };
      case 'mmt':
        return {
          title: bi(
            'اختبار القوة العضلية اليدوي (MMT)',
            'Manual Muscle Strength (MMT MRC Scale)',
            'تاقیکردنەوەی هێزی ماسولکە بە دەست (MMT)'
          ),
          icon: <Dumbbell className="size-4 text-sky-600 dark:text-sky-400" />,
        };
      case 'neuro':
        return {
          title: bi(
            'الفحص العصبي وخريطة القطاعات الجلدية',
            'Neurological Screening & Dermatome Map',
            'پشکنینی دەماری و نەخشەی دێرماتۆمەکان'
          ),
          icon: <Brain className="size-4 text-purple-600 dark:text-purple-400" />,
        };
      case 'special_tests':
        return {
          title: bi(
            'الفحوصات العظمية التخصصية (Orthopedic Provocative)',
            'Orthopedic Special Provocative Tests',
            'تاقیکردنەوە تایبەتییەکانی ئێسک (Orthopedic)'
          ),
          icon: <Stethoscope className="size-4 text-amber-600 dark:text-amber-400" />,
        };
      case 'gait_posture':
        return {
          title: bi(
            'تقييم المشي والقوام واختبار TUG',
            'Gait, Posture & Timed Up & Go (TUG)',
            'هەڵسەنگاندنی ڕۆیشتن، وەستان و تاقیکردنەوەی TUG'
          ),
          icon: <Footprints className="size-4 text-emerald-600 dark:text-emerald-400" />,
        };
      case 'functional_scales':
        return {
          title: bi(
            'المقاييس الوظيفية والاختبارات الأدائية (Outcome Measures)',
            'Outcome Measures & Functional Scales',
            'پێوەرە فەرمانییەکان و تاقیکردنەوە جێبەجێکارییەکان'
          ),
          icon: <FileCheck className="size-4 text-indigo-600 dark:text-indigo-400" />,
        };
      default: {
        const customDef = customDefinitions.find((cd) => cd.id === id);
        return {
          title: customDef
            ? bi(customDef.titleAr, customDef.titleEn)
            : bi('فحص سريري مخصص', 'Custom Clinical Test', 'پشکنینی کلینیکی تایبەت'),
          icon: <Sparkles className="size-4 text-fuchsia-600 dark:text-fuchsia-400" />,
        };
      }
    }
  };

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
        <div className="p-10 rounded-2xl border border-dashed border-line-2 bg-card/70 text-center space-y-3">
          <div className="size-12 rounded-2xl bg-surface border border-line-2 text-muted-foreground-1 flex items-center justify-center mx-auto">
            <Inbox className="size-6" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-foreground">
              {bi(
                'لم يتم إدراج أي فحوصات سريرية بعد',
                'No clinical examination cards added yet',
                'هێشتا هیچ کارتی پشکنینێکی کلینیکی زیاد نەکراوە'
              )}
            </h4>
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
              className="px-3.5 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold cursor-pointer inline-flex items-center gap-1.5"
            >
              <span>{bi('فتح أدوات الفحص', 'Open Assessment Tools', 'کردنەوەی ئامرازەکانی پشکنین')}</span>
            </button>
          )}
        </div>
      )}

      {/* Render Active Widgets */}
      <div className="space-y-4">
        {activeWidgetIds.map((widgetId) => {
          const isCollapsed = collapsedMap[widgetId] || false;
          const { title, icon } = getWidgetTitle(widgetId);

          return (
            <div
              key={widgetId}
              className="rounded-2xl border border-card-line bg-card shadow-2xs overflow-hidden transition-all"
            >
              {/* Card Header */}
              <div className="px-5 py-3.5 bg-muted/40 border-b border-card-divider flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-card border border-card-line shadow-2xs">
                    {icon}
                  </div>
                  <h3 className="text-xs font-bold text-foreground tracking-wide">{title}</h3>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => toggleCollapse(widgetId)}
                    className="py-1 px-2.5 text-muted-foreground-1 hover:text-foreground rounded-lg hover:bg-surface transition-colors cursor-pointer inline-flex items-center gap-1"
                    title={
                      isCollapsed
                        ? bi('توسيع', 'Expand', 'کردنەوە')
                        : bi('طي', 'Collapse', 'داخستن')
                    }
                  >
                    <span className="text-xs font-semibold">
                      {isCollapsed
                        ? bi('فتح', 'Expand', 'کردنەوە')
                        : bi('طي', 'Collapse', 'داخستن')}
                    </span>
                    {isCollapsed ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
                  </button>

                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => onRemoveWidget(widgetId)}
                      className="p-1.5 text-muted-foreground-1 hover:text-rose-600 rounded-lg hover:bg-rose-500/10 transition-colors cursor-pointer"
                      title={bi('إزالة الفحص', 'Remove card', 'لابردنی پشکنین')}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Card Body */}
              {!isCollapsed && (
                <div className="p-5 bg-card">
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
                  {!['body_chart', 'rom', 'mmt', 'neuro', 'special_tests', 'gait_posture', 'functional_scales'].includes(widgetId) && (
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
                    })()
                  )}
                  </Suspense>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
