// =======================================================================
// PhysioRecord — Clinical Examination Widget Shelf
// Collapsible Top Shelf with Compact Quick-Bar Mode & Category Tabs
// =======================================================================

import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import type { ExamWidgetDescriptor, ExamCategory, CustomWidgetDefinition } from '../../types/clinicalWidgets';
import {
  Search,
  Plus,
  Sparkles,
  Layers,
  MapPin,
  Activity,
  Dumbbell,
  Brain,
  Stethoscope,
  Footprints,
  FileCheck,
  GripHorizontal,
  Minimize2,
  Maximize2,
  Check,
} from 'lucide-react';

interface ExamWidgetShelfProps {
  onAddWidget: (widgetId: string) => void;
  onOpenCustomStudio: () => void;
  activeWidgetIds: string[];
}

const BUILT_IN_WIDGETS: ExamWidgetDescriptor[] = [
  {
    id: 'body_chart',
    category: 'body_chart',
    titleAr: 'مخطط الجسم التشريحي',
    titleEn: 'Anatomical Body Map',
    subtitleAr: 'تحديد المناطق التشريحية ومواضع وأعماق الألم (أمامي وخلفي)',
    subtitleEn: 'Interactive region selection & anatomical symptom pin mapping',
    badgeLabelAr: 'مخطط تشريحي',
    badgeLabelEn: 'Body Map',
    badgeColorClass: 'bg-rose-500/10 text-rose-700 border-rose-500/20 dark:text-rose-300',
    iconName: 'MapPin',
    descriptionAr: 'تحديد المناطق التشريحية ونقاط الألم على المتجهات الطبية',
    descriptionEn: 'Plot precise symptom markers and anatomical zones',
  },
  {
    id: 'rom',
    category: 'rom_mmt',
    titleAr: 'المدى الحركي المفصلي',
    titleEn: 'Range of Motion (ROM)',
    subtitleAr: 'قياس درجات الزوايا الحركية النشطة والسلبية',
    subtitleEn: 'Goniometric range of motion for all joints',
    badgeLabelAr: 'مفصلي ROM',
    badgeLabelEn: 'Goniometry',
    badgeColorClass: 'bg-primary/10 text-primary border-primary/20',
    iconName: 'Activity',
    descriptionAr: 'عنق، ظهر، كتف، كوع، رسغ، ورك، ركبة، كاحل',
    descriptionEn: 'Cervical, lumbar, shoulder, elbow, wrist, hip, knee, ankle',
  },
  {
    id: 'mmt',
    category: 'rom_mmt',
    titleAr: 'اختبار القوة العضلية',
    titleEn: 'Manual Muscle Testing (MMT)',
    subtitleAr: 'مقياس القوة العضلية من 0 إلى 5',
    subtitleEn: 'Medical Research Council 0-5 strength grading',
    badgeLabelAr: 'عضلي MMT',
    badgeLabelEn: 'MRC Scale',
    badgeColorClass: 'bg-sky-500/10 text-sky-700 border-sky-500/20 dark:text-sky-300',
    iconName: 'Dumbbell',
    descriptionAr: 'مقارنة ثنائية الأطراف للأطراف العلوية والسفلية والجذع',
    descriptionEn: 'Bilateral side-by-side upper/lower extremity strength',
  },
  {
    id: 'neuro',
    category: 'neurology',
    titleAr: 'خريطة القطاعات الحسية والفحص العصبي',
    titleEn: 'Dermatome Map & Neuro',
    subtitleAr: 'خريطة القطاعات الجلدية والمنعكسات الوترية والعضلية',
    subtitleEn: 'Interactive C2-S5 Dermatomes, DTR Reflexes & Myotomes',
    badgeLabelAr: 'عصبي ASIA',
    badgeLabelEn: 'ASIA Neuro',
    badgeColorClass: 'bg-purple-500/10 text-purple-700 border-purple-500/20 dark:text-purple-300',
    iconName: 'Brain',
    descriptionAr: 'تقييم الحس الجلدي ومنعكسات الرضفة والعرقوب',
    descriptionEn: 'ASIA sensory dermatome map, reflexes and motor roots',
  },
  {
    id: 'special_tests',
    category: 'special_tests',
    titleAr: 'الفحوصات العظمية التخصصية',
    titleEn: 'Orthopedic Special Tests',
    subtitleAr: 'اختبارات الاستفزاز العظمي للمفاصل والعمود الفقري',
    subtitleEn: 'Provocative orthopedic joint tests with instant results',
    badgeLabelAr: 'سريري عظمي',
    badgeLabelEn: 'Orthopedic',
    badgeColorClass: 'bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-300',
    iconName: 'Stethoscope',
    descriptionAr: 'توثيق بنقرة واحدة (+ إيجابي / ألم مطابق / - سلبي)',
    descriptionEn: 'One-click documentation (+ Positive / Pain / - Negative)',
  },
  {
    id: 'gait_posture',
    category: 'gait_balance',
    titleAr: 'تقييم المشي والقوام والتوازن',
    titleEn: 'Gait, Posture & TUG Test',
    subtitleAr: 'اختبار النهوض والمشي وانحرافات القوام والمشية',
    subtitleEn: 'Timed Up & Go test, postural deviations & gait mechanics',
    badgeLabelAr: 'حركي وظيفي',
    badgeLabelEn: 'Mobility',
    badgeColorClass: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-300',
    iconName: 'Footprints',
    descriptionAr: 'قياس خطر السقوط والعرج والمشية غير المتزنة',
    descriptionEn: 'Fall risk assessment, antalgic gait, and postural analysis',
  },
  {
    id: 'functional_scales',
    category: 'functional_scales',
    titleAr: 'المقاييس الوظيفية القياسية',
    titleEn: 'Functional Outcome Scales',
    subtitleAr: 'مقياس الإعاقة الوظيفية مع حساب النسبة تلقائياً',
    subtitleEn: 'Upper limb disability score with automated percentage',
    badgeLabelAr: 'مقياس دولي',
    badgeLabelEn: 'Outcome Scale',
    badgeColorClass: 'bg-indigo-500/10 text-indigo-700 border-indigo-500/20 dark:text-indigo-300',
    iconName: 'FileCheck',
    descriptionAr: 'استبيان معياري لتقييم صعوبة المهام الحياتية اليومية',
    descriptionEn: 'Standard questionnaire evaluating activities of daily living',
  },
];

export const ExamWidgetShelf: React.FC<ExamWidgetShelfProps> = ({
  onAddWidget,
  onOpenCustomStudio,
  activeWidgetIds,
}) => {
  const { bi } = useLanguage();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isCompactMode, setIsCompactMode] = useState<boolean>(false);
  const [customWidgets, setCustomWidgets] = useState<CustomWidgetDefinition[]>(() =>
    ClinicOperationsService.getCustomWidgets()
  );
  const [studioEnabled, setStudioEnabled] = useState<boolean>(() =>
    ClinicOperationsService.isCustomWidgetStudioEnabled()
  );

  useEffect(() => {
    void ClinicOperationsService.ensureColdStoreLoadedAsync('customWidgets');
    const sync = () => {
      setCustomWidgets(ClinicOperationsService.getCustomWidgets());
      setStudioEnabled(ClinicOperationsService.isCustomWidgetStudioEnabled());
    };
    sync();
    const unsub = ClinicOperationsService.subscribe(sync);
    window.addEventListener('physiorecord-modules-updated', sync);
    return () => {
      unsub();
      window.removeEventListener('physiorecord-modules-updated', sync);
    };
  }, []);

  const allWidgets: ExamWidgetDescriptor[] = [
    ...BUILT_IN_WIDGETS,
    ...customWidgets.map((cw) => ({
      id: cw.id,
      category: 'custom_ai' as ExamCategory,
      titleAr: cw.titleAr,
      titleEn: cw.titleEn,
      subtitleAr: cw.clinicalSpecialtyAr,
      subtitleEn: cw.clinicalSpecialtyEn,
      badgeLabelAr: 'مخصص AI',
      badgeLabelEn: 'AI Custom',
      badgeColorClass: 'bg-fuchsia-500/10 text-fuchsia-700 border-fuchsia-500/20 dark:text-fuchsia-300',
      iconName: 'Sparkles',
      descriptionAr: cw.descriptionAr,
      descriptionEn: cw.descriptionEn,
      isCustom: true,
    })),
  ];

  const filteredWidgets = allWidgets.filter((w) => {
    const matchesCat = selectedCategory === 'all' || w.category === selectedCategory;
    const matchesQuery =
      searchQuery.trim() === '' ||
      w.titleAr.toLowerCase().includes(searchQuery.toLowerCase()) ||
      w.titleEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      w.descriptionAr.toLowerCase().includes(searchQuery.toLowerCase()) ||
      w.descriptionEn.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesQuery;
  });

  const getWidgetIcon = (iconName: string, small = false) => {
    const cls = small ? 'size-4' : 'size-5';
    switch (iconName) {
      case 'MapPin':
        return <MapPin className={`${cls} text-rose-500`} />;
      case 'Activity':
        return <Activity className={`${cls} text-primary`} />;
      case 'Dumbbell':
        return <Dumbbell className={`${cls} text-sky-600 dark:text-sky-400`} />;
      case 'Brain':
        return <Brain className={`${cls} text-purple-600 dark:text-purple-400`} />;
      case 'Stethoscope':
        return <Stethoscope className={`${cls} text-amber-600 dark:text-amber-400`} />;
      case 'Footprints':
        return <Footprints className={`${cls} text-emerald-600 dark:text-emerald-400`} />;
      case 'FileCheck':
        return <FileCheck className={`${cls} text-indigo-600 dark:text-indigo-400`} />;
      case 'Sparkles':
      default:
        return <Sparkles className={`${cls} text-fuchsia-600 dark:text-fuchsia-400`} />;
    }
  };

  const handleDragStart = (e: React.DragEvent, widgetId: string) => {
    e.dataTransfer.setData('text/plain', widgetId);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className="space-y-3 bg-card p-4 sm:p-5 rounded-2xl border border-card-line shadow-2xs transition-all">
      {/* Top Header & Shelf Mode Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <Layers className="size-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-foreground">
                {bi('رف الفحوصات والأدوات السريرية', 'Clinical Examination Shelf', 'ڕەفەی پشکنین و ئامرازە کلینیکییەکان')}
              </h3>
              <span className="py-0.5 px-2 rounded-full text-xs font-semibold bg-surface border border-line-2 text-muted-foreground-1 tabular-nums">
                <bdi dir="ltr">{activeWidgetIds.length}/{allWidgets.length}</bdi> {bi('مفعل', 'Active', 'چالاک')}
              </span>
            </div>
          </div>
        </div>

        {/* Right Controls: Compact Mode Toggle + Optional Custom Widget Studio */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsCompactMode((prev) => !prev)}
            className="py-1.5 px-3 rounded-xl bg-layer hover:bg-layer-hover border border-layer-line text-layer-foreground text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            title={
              isCompactMode
                ? bi('عرض الشبكة الكاملة', 'Expand grid', 'پیشاندانی تەواو')
                : bi('الوضع المضغوط السريع', 'Compact shelf mode', 'دۆخی چڕی خێرا')
            }
          >
            {isCompactMode ? (
              <>
                <Maximize2 className="size-3.5 text-primary" />
                <span>{bi('توسيع الرف', 'Expand Shelf', 'فراوانکردنی ڕەفە')}</span>
              </>
            ) : (
              <>
                <Minimize2 className="size-3.5 text-muted-foreground-1" />
                <span>{bi('وضع مضغوط', 'Compact Bar', 'شریتی چڕ')}</span>
              </>
            )}
          </button>

          {studioEnabled && (
            <button
              type="button"
              onClick={onOpenCustomStudio}
              className="py-1.5 px-3 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-semibold shadow-2xs inline-flex items-center gap-1.5 transition-all shrink-0 cursor-pointer"
            >
              <Sparkles className="size-3.5" />
              <span>{bi('+ أداة فحص مخصصة', '+ Custom Exam Tool', '+ ئامرازی پشکنینی تایبەت')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Category Filter Tabs & Search Bar */}
      <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-card-divider">
        {!isCompactMode && (
          <div className="relative flex-1 min-w-[200px]">
            <Search className="size-3.5 text-muted-foreground-1 absolute top-1/2 -translate-y-1/2 start-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={bi(
                'ابحث باسم الفحص، المفصل، أو العضلات (مثال: كتف، ROM، ركبة، عصب)...',
                'Search test, joint, muscle (e.g., shoulder, ROM, knee, neuro)...',
                'گەڕان بە ناوی پشکنین، جومگە، یان ماسولکە...'
              )}
              className="w-full ps-8 pe-3 py-1.5 text-xs rounded-xl bg-layer border border-layer-line text-foreground placeholder:text-muted-foreground-1 focus:outline-none focus:border-primary"
            />
          </div>
        )}

        {/* Categories */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none">
          {[
            { id: 'all', ar: 'الكل', en: 'All Tools', ckb: 'هەمووی' },
            { id: 'body_chart', ar: 'مخطط الجسم', en: 'Body Map', ckb: 'هێڵکاری جەستە' },
            { id: 'rom_mmt', ar: 'حركة وقوة', en: 'ROM / MMT', ckb: 'جووڵە و هێز' },
            { id: 'neurology', ar: 'أعصاب وقطاعات حسية', en: 'Neuro & Dermatomes', ckb: 'دەمار و هەست' },
            { id: 'special_tests', ar: 'اختبارات عظمية', en: 'Orthopedic', ckb: 'تاقیکردنەوەی ئێسک' },
            { id: 'gait_balance', ar: 'مشي وتوازن', en: 'Gait / TUG', ckb: 'ڕۆیشتن و هاوسەنگی' },
            { id: 'functional_scales', ar: 'مقاييس وظيفية', en: 'Scales', ckb: 'پێوەرە فەرمانییەکان' },
            { id: 'custom_ai', ar: 'مخصص', en: 'Custom', ckb: 'تایبەت' },
          ].map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`py-1 px-2.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                selectedCategory === cat.id
                  ? 'bg-primary text-primary-foreground shadow-2xs'
                  : 'bg-surface border border-line-2 text-muted-foreground-1 hover:text-foreground'
              }`}
            >
              {bi(cat.ar, cat.en, cat.ckb)}
            </button>
          ))}
        </div>
      </div>

      {/* Mode A: Compact Single-Row Quick Pill Bar */}
      {isCompactMode ? (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {filteredWidgets.map((widget) => {
            const isAdded = activeWidgetIds.includes(widget.id);
            return (
              <button
                key={widget.id}
                type="button"
                draggable
                onDragStart={(e) => handleDragStart(e, widget.id)}
                onClick={() => onAddWidget(widget.id)}
                className={`py-1.5 px-3 rounded-xl border text-xs font-semibold inline-flex items-center gap-2 transition-all cursor-pointer ${
                  isAdded
                    ? 'bg-primary/10 border-primary text-foreground shadow-2xs'
                    : 'bg-surface border-line-2 text-muted-foreground-2 hover:border-primary/40'
                }`}
              >
                {getWidgetIcon(widget.iconName, true)}
                <span>{bi(widget.titleAr, widget.titleEn)}</span>
                {isAdded ? (
                  <Check className="size-3.5 text-primary" />
                ) : (
                  <Plus className="size-3.5 text-muted-foreground-1" />
                )}
              </button>
            );
          })}
        </div>
      ) : (
        /* Mode B: Expanded Clinical Card Grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 pt-1">
          {filteredWidgets.map((widget) => {
            const isAdded = activeWidgetIds.includes(widget.id);

            return (
              <div
                key={widget.id}
                draggable
                onDragStart={(e) => handleDragStart(e, widget.id)}
                onClick={() => onAddWidget(widget.id)}
                className={`group relative p-3.5 rounded-xl border transition-all cursor-pointer select-none flex flex-col justify-between gap-2.5 ${
                  isAdded
                    ? 'bg-primary/10 border-primary/80 ring-1 ring-primary/20 shadow-2xs'
                    : 'bg-surface/40 border-line-2 hover:border-primary/40 hover:bg-surface'
                }`}
              >
                <div>
                  {/* Top Row: Icon, Badge, Drag Handle */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="p-2 rounded-lg bg-card border border-card-line shadow-2xs group-hover:scale-105 transition-transform">
                      {getWidgetIcon(widget.iconName)}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`py-0.5 px-2 rounded-full text-xs font-semibold border ${widget.badgeColorClass}`}
                      >
                        {bi(widget.badgeLabelAr, widget.badgeLabelEn)}
                      </span>
                      <GripHorizontal className="size-3.5 text-muted-foreground-1 group-hover:text-foreground" />
                    </div>
                  </div>

                  {/* Title & Subtitle */}
                  <h4 className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                    {bi(widget.titleAr, widget.titleEn)}
                  </h4>
                  <p className="text-xs text-muted-foreground-1 line-clamp-1 mt-0.5">
                    {bi(widget.subtitleAr, widget.subtitleEn)}
                  </p>
                </div>

                {/* Bottom State / Action */}
                <div className="pt-2 border-t border-card-divider flex items-center justify-between text-xs">
                  <span className="text-muted-foreground-1 font-medium">
                    {isAdded
                      ? bi('✓ مدرج في السجل', '✓ Active in chart', '✓ لە تۆماردا چالاکە')
                      : bi('+ انقر أو اسحب للإضافة', '+ Click or drag to add', '+ کرتە بکە یان ڕایبکێشە بۆ زیادکردن')}
                  </span>
                  <span
                    className={`size-6 rounded-md flex items-center justify-center transition-colors ${
                      isAdded
                        ? 'bg-primary text-primary-foreground font-bold'
                        : 'bg-surface border border-line-2 text-muted-foreground-1 group-hover:bg-primary group-hover:text-primary-foreground'
                    }`}
                  >
                    {isAdded ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
