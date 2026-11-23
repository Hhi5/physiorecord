// =======================================================================
// PhysioRecord — Contextual Tips & Full Offline Guide Center
// - Preserves ContextualTipBanner & GuidedTourModal API
// - Explicitly separates Desktop/Laptop UI Guide vs Mobile/Phone UI Guide
// - Launches 5-Stage Full-App Walkthrough OR individual page Spotlight Tours
// - Includes platform philosophy recap, keyboard shortcuts table & DEMO sandbox
// =======================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import { ModalDialog } from '../ui/Dialog';
import { DemoBadge } from '../ui/Primitives';
import {
  THERAPIST_WORKFLOW_CHAPTERS,
  DESKTOP_GUIDE_TOPICS,
  MOBILE_GUIDE_TOPICS,
  DESKTOP_SHORTCUTS,
  PLATFORM_OVERVIEW_PILLARS,
  PAGE_SPOTLIGHT_TOURS,
  loadPageToursState,
  setAutoPageToursEnabled,
  resetAllPageTours,
  type PageTourId,
  type QuickGuideTopic,
} from '../../utils/pageSpotlightTours';
import {
  Lightbulb,
  X,
  Compass,
  Trash2,
  Database,
  Search,
  ChevronDown,
  RotateCcw,
  BookOpen,
  ClipboardList,
  LayoutGrid,
  CheckCircle2,
  Keyboard,
  Play,
} from 'lucide-react';

interface ContextualTipBannerProps {
  tipId: string;
  titleAr: string;
  titleEn: string;
  titleCkb?: string;
  bodyAr: string;
  bodyEn: string;
  bodyCkb?: string;
  onStartTour?: () => void;
}

export const ContextualTipBanner: React.FC<ContextualTipBannerProps> = ({
  tipId,
  titleAr,
  titleEn,
  titleCkb,
  bodyAr,
  bodyEn,
  bodyCkb,
  onStartTour,
}) => {
  const { bi } = useLanguage();
  const onboarding = ClinicOperationsService.getOnboardingState();

  const [locallyDismissed, setLocallyDismissed] = useState(false);

  if (
    locallyDismissed ||
    !onboarding.tipsEnabled ||
    onboarding.dismissedTipIds.includes(tipId)
  ) {
    return null;
  }

  const handleDismiss = async () => {
    setLocallyDismissed(true);
    await ClinicOperationsService.dismissTipAsync(tipId);
  };

  return (
    <div
      role="note"
      className="px-3.5 py-2 rounded-2xl bg-card/75 backdrop-blur-xs shadow-2xs flex flex-wrap items-center justify-between gap-2 text-xs"
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Lightbulb className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
        <div className="min-w-0 truncate sm:whitespace-normal">
          <span className="font-bold text-foreground">{bi(titleAr, titleEn, titleCkb)}</span>
          <span className="hidden sm:inline text-muted-foreground-1">
            : {bi(bodyAr, bodyEn, bodyCkb)}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {onStartTour && (
          <button
            type="button"
            onClick={onStartTour}
            className="px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary font-bold cursor-pointer inline-flex items-center gap-1"
          >
            <Compass className="size-3.5" />
            <span>{bi('جولة سريعة', 'Quick Tour', 'گەشتێکی خێرا')}</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => void handleDismiss()}
          className="px-2.5 py-1 rounded-lg bg-surface/70 hover:bg-surface text-muted-foreground-1 font-semibold cursor-pointer inline-flex items-center gap-1"
          aria-label={bi('إخفاء النصيحة', 'Dismiss tip', 'شاردنەوەی ئامۆژگاری')}
        >
          <X className="size-3.5" />
          <span>{bi('فهمت', 'Got it', 'تێگەیشتم')}</span>
        </button>
      </div>
    </div>
  );
};

type GuideTabId = 'overview' | 'workflow' | 'interface';

interface GuidedTourModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  hasDemoData: boolean;
  hasPatients?: boolean;
  onLoadDemoData: () => Promise<void>;
  onDeleteAllDemoData: () => Promise<void>;
  isSoloMode?: boolean;
  currentPageTourId?: PageTourId;
  onStartSpotlightTour?: (
    pageId?: PageTourId
  ) => boolean | undefined | Promise<boolean | undefined>;
  onStartPatientChartTourWithDemo?: () => Promise<void>;
  onStartSessionSoapTourWithDemo?: () => Promise<void>;
  onAddFirstPatient?: () => void;
  onStartFullWalkthrough?: () => void;
  onOpenWelcomeScreen?: () => void;
}

export const GuidedTourModal: React.FC<GuidedTourModalProps> = ({
  isOpen,
  onOpenChange,
  hasDemoData,
  hasPatients = false,
  onLoadDemoData,
  onDeleteAllDemoData,
  isSoloMode = true,
  currentPageTourId,
  onStartSpotlightTour,
  onStartPatientChartTourWithDemo,
  onStartSessionSoapTourWithDemo,
  onAddFirstPatient,
  onStartFullWalkthrough,
  onOpenWelcomeScreen,
}) => {
  const { bi, language, isRtl } = useLanguage();

  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setIsMobileViewport(window.innerWidth < 768);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const currentDeviceTopics = isMobileViewport ? MOBILE_GUIDE_TOPICS : DESKTOP_GUIDE_TOPICS;

  const [activeTab, setActiveTab] = useState<GuideTabId>('overview');
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [toursState, setToursState] = useState(() => loadPageToursState());
  const [resetNotice, setResetNotice] = useState(false);
  const [busyAction, setBusyAction] = useState<
    'load' | 'delete' | 'demo_chart' | 'demo_session' | null
  >(null);
  const [confirmDeleteDemo, setConfirmDeleteDemo] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [missingTourContext, setMissingTourContext] = useState<
    'patient_chart' | 'session_soap' | null
  >(null);

  useEffect(() => {
    if (isOpen) {
      setToursState(loadPageToursState());
      setMissingTourContext(null);
      setExpandedId(currentDeviceTopics[0]?.id ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const trimmedQuery = query.trim().toLowerCase();

  const matchesSearch = (topic: QuickGuideTopic): boolean => {
    if (!trimmedQuery) return true;
    const haystack = [
      topic.titleAr,
      topic.titleEn,
      topic.titleCkb,
      topic.summaryAr,
      topic.summaryEn,
      topic.summaryCkb,
      topic.keywords,
      ...topic.stepsAr,
      ...topic.stepsEn,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(trimmedQuery);
  };

  const filteredWorkflowTopics = useMemo(
    () => THERAPIST_WORKFLOW_CHAPTERS.filter(matchesSearch),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trimmedQuery]
  );

  const filteredInterfaceTopics = useMemo(
    () => currentDeviceTopics.filter(matchesSearch),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trimmedQuery, isMobileViewport]
  );

  const directPageIds: PageTourId[] = useMemo(
    () => [
      isSoloMode ? 'today' : 'reception',
      'schedule',
      'directory',
      'patient_chart',
      'session_soap',
      'finance',
      'backup_restore',
      'settings',
    ],
    [isSoloMode]
  );

  const contextualPageIds: PageTourId[] = [
    'exercises',
    'analytics',
    'activity_log',
  ];

  const handleRequestSectionTour = async (pageId: PageTourId) => {
    if (pageId === 'patient_chart' && !hasPatients) {
      setMissingTourContext('patient_chart');
      setActiveTab('overview');
      return;
    }
    if (pageId === 'session_soap' && !hasPatients) {
      setMissingTourContext('session_soap');
      setActiveTab('overview');
      return;
    }
    setMissingTourContext(null);
    const result = await onStartSpotlightTour?.(pageId);
    if (result === false) {
      if (pageId === 'patient_chart' || pageId === 'session_soap') {
        setMissingTourContext(pageId);
        setActiveTab('overview');
      }
      return;
    }
    onOpenChange(false);
  };

  const handleLoadDemoAndTourChart = async () => {
    if (!onStartPatientChartTourWithDemo) return;
    setBusyAction('demo_chart');
    try {
      setMissingTourContext(null);
      onOpenChange(false);
      await onStartPatientChartTourWithDemo();
    } finally {
      setBusyAction(null);
    }
  };

  const handleLoadDemoAndTourSession = async () => {
    if (!onStartSessionSoapTourWithDemo) return;
    setBusyAction('demo_session');
    try {
      setMissingTourContext(null);
      onOpenChange(false);
      await onStartSessionSoapTourWithDemo();
    } finally {
      setBusyAction(null);
    }
  };

  const currentTourDef = currentPageTourId ? PAGE_SPOTLIGHT_TOURS[currentPageTourId] : null;

  const handleCloseComplete = async () => {
    await ClinicOperationsService.setTourCompletedAsync(true);
    onOpenChange(false);
  };

  const handleToggleAutoTours = () => {
    const next = !toursState.autoEnabled;
    const updated = setAutoPageToursEnabled(next);
    setToursState(updated);
    void ClinicOperationsService.setTipsEnabledAsync(next);
  };

  const handleResetTours = () => {
    const updated = resetAllPageTours();
    setToursState(updated);
    void ClinicOperationsService.setTipsEnabledAsync(true);
    setResetNotice(true);
    window.setTimeout(() => setResetNotice(false), 3000);
  };

  const handleLoadDemo = async () => {
    setBusyAction('load');
    setStatusMsg(null);
    try {
      await onLoadDemoData();
      setStatusMsg(
        bi(
          'تم تحميل بيانات DEMO التجريبية بنجاح. يمكنك حذفها بنقرة واحدة متى شئت.',
          'Temporary DEMO data loaded. You can delete all DEMO records in one click anytime.',
          'داتای تاقیکاریی DEMO بە سەرکەوتوویی بارکرا. هەر کاتێک بتەوێت دەتوانیت بە یەک کرتە بیسڕیتەوە.'
        )
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeleteDemo = async () => {
    setBusyAction('delete');
    setStatusMsg(null);
    try {
      await onDeleteAllDemoData();
      setStatusMsg(
        bi(
          'تم مسح جميع سجلات DEMO من الخزينة والعمليات بنجاح.',
          'All DEMO patient & clinic records deleted cleanly.',
          'هەموو تۆمارەکانی DEMO لە قاسە و کاروبارەکان بە سەرکەوتوویی سڕدرانەوە.'
        )
      );
    } finally {
      setBusyAction(null);
    }
  };

  const renderTopicAccordion = (topics: QuickGuideTopic[]) => {
    if (topics.length === 0) {
      return (
        <p className="text-center py-4 text-muted-foreground-1">
          {bi('لا توجد نتائج مطابقة للبحث.', 'No matching guide topics.', 'هیچ ئەنجامێک نەدۆزرایەوە.')}
        </p>
      );
    }

    return (
      <div className="space-y-2">
        {topics.map((topic) => {
          const isOpenTopic = expandedId === topic.id || trimmedQuery.length > 0;
          const steps =
            language === 'en'
              ? topic.stepsEn
              : language === 'ckb'
                ? topic.stepsCkb
                : topic.stepsAr;

          return (
            <div
              key={topic.id}
              className="rounded-xl bg-surface/65 border border-line-2/80 overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setExpandedId((cur) => (cur === topic.id ? null : topic.id))}
                aria-expanded={isOpenTopic}
                className="w-full min-h-[46px] px-3.5 py-2.5 text-start flex items-center justify-between gap-2 cursor-pointer hover:bg-surface transition-colors"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="font-bold text-foreground leading-snug">
                    {bi(topic.titleAr, topic.titleEn, topic.titleCkb)}
                  </div>
                  <div className="text-xs text-muted-foreground-1">
                    <span className="line-clamp-1">
                      {bi(topic.summaryAr, topic.summaryEn, topic.summaryCkb)}
                    </span>
                  </div>
                </div>
                <ChevronDown
                  className={`size-4 text-muted-foreground-1 shrink-0 transition-transform ${
                    isOpenTopic ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {isOpenTopic && (
                <div className="px-4 pb-3.5 pt-2 border-t border-card-divider/60 space-y-2.5">
                  <ul className="space-y-2 list-disc ps-4 text-xs text-foreground/90 leading-relaxed">
                    {steps.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                  {topic.tourId &&
                    onStartSpotlightTour &&
                    !PAGE_SPOTLIGHT_TOURS[topic.tourId].contextualOnly && (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => void handleRequestSectionTour(topic.tourId!)}
                          className="text-xs font-bold text-primary hover:underline inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Compass className="size-3.5" />
                          <span>
                            {bi(
                              `جرّب الجولة التفاعلية على: ${PAGE_SPOTLIGHT_TOURS[topic.tourId].pageLabelAr}`,
                              `Launch interactive tour: ${PAGE_SPOTLIGHT_TOURS[topic.tourId].pageLabelEn}`,
                              `گەشتی کارلێککەر بۆ: ${PAGE_SPOTLIGHT_TOURS[topic.tourId].pageLabelCkb}`
                            )}
                          </span>
                        </button>
                      </div>
                    )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <ModalDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          void handleCloseComplete();
        }
      }}
      size="lg"
      dir={isRtl ? 'rtl' : 'ltr'}
      title={bi(
        'دليل استخدام PhysioRecord والجولات التفاعلية',
        'PhysioRecord Complete Guide & Interactive Tours',
        'ڕێبەری تەواوی PhysioRecord و گەشتە کارلێککەرەکان'
      )}
      subtitle={bi(
        'دليل أوفلاين شامل لكل ميزات المنصة مع جولة متكاملة وجولات تفاعلية لكل قسم',
        'Complete offline guide to every feature, plus a Full-App Walkthrough and per-page Spotlight tours',
        'ڕێبەری تەواوی ئۆفلاین بۆ هەموو تایبەتمەندییەکانی سەکۆکە لەگەڵ گەشتی گشتی و گەشتی پەڕەکان'
      )}
    >
      <div className="space-y-4 text-xs">
        {/* 1. Clean 3-Tab Switcher: Overview & Tours | Full Playbook | Interface & Navigation */}
        <div
          role="tablist"
          aria-label={bi('أقسام الدليل', 'Guide Sections', 'بەشەکانی ڕێبەر')}
          className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-surface border border-line-2/70"
        >
          <button
            type="button"
            role="tab"
            data-testid="guide-tab-overview"
            aria-selected={activeTab === 'overview'}
            onClick={() => setActiveTab('overview')}
            className={`min-h-[40px] px-2.5 py-1.5 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap ${
              activeTab === 'overview'
                ? 'bg-card text-primary shadow-xs border border-line-2/60'
                : 'text-muted-foreground-1 hover:text-foreground'
            }`}
          >
            <BookOpen className="size-3.5 shrink-0" />
            <span className="truncate">
              {bi('نظرة عامة والجولات', 'Overview & Tours', 'گشتی و گەشتەکان')}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            data-testid="guide-tab-workflow"
            aria-selected={activeTab === 'workflow'}
            onClick={() => {
              setActiveTab('workflow');
              setExpandedId(THERAPIST_WORKFLOW_CHAPTERS[0]?.id ?? null);
            }}
            className={`min-h-[40px] px-2.5 py-1.5 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap ${
              activeTab === 'workflow'
                ? 'bg-card text-primary shadow-xs border border-line-2/60'
                : 'text-muted-foreground-1 hover:text-foreground'
            }`}
          >
            <ClipboardList className="size-3.5 shrink-0" />
            <span className="truncate">
              {bi('دليل العمل الكامل', 'Full Playbook', 'ڕێبەری کاری تەواو')}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            data-testid="guide-tab-interface"
            aria-selected={activeTab === 'interface'}
            onClick={() => {
              setActiveTab('interface');
              setExpandedId(currentDeviceTopics[0]?.id ?? null);
            }}
            className={`min-h-[40px] px-2.5 py-1.5 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap ${
              activeTab === 'interface'
                ? 'bg-card text-primary shadow-xs border border-line-2/60'
                : 'text-muted-foreground-1 hover:text-foreground'
            }`}
          >
            <LayoutGrid className="size-3.5 shrink-0" />
            <span className="truncate">
              {bi('دليل الواجهة', 'Interface Guide', 'ڕێبەری ڕووکار')}
            </span>
          </button>
        </div>

        {/* 2. Instant Offline Search Across Playbook & Current Device Interface Guide */}
        <div className="relative">
          <Search className="size-4 text-muted-foreground-1 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={bi(
              'ابحث عن أي ميزة (مثال: SOAP، فحص عضلات، تينس، قوام، أقساط، مصروفات، بصمة، نسخة احتياطية)...',
              'Search any feature (e.g. SOAP, MMT, TENS safety, posture, installments, passkey, backup)...',
              'بۆ هەر تایبەتمەندییەک بگەڕێ (نموونە: SOAP، پشکنینی ماسولکە، قیست، پەنجەمۆر، کۆپی یەدەگ)...'
            )}
            className="w-full min-h-[40px] ps-9 pe-3 py-2 rounded-xl bg-surface border border-line-2 text-xs text-foreground placeholder:text-muted-foreground-2 focus:outline-none focus:border-primary"
          />
        </div>

        {/* Search Results Override */}
        {trimmedQuery.length > 0 ? (
          <div className="space-y-2.5">
            <div className="text-xs font-bold text-muted-foreground-1">
              {bi(
                `نتائج البحث (${filteredWorkflowTopics.length + filteredInterfaceTopics.length})`,
                `Search results (${filteredWorkflowTopics.length + filteredInterfaceTopics.length})`,
                `ئەنجامەکانی گەڕان (${filteredWorkflowTopics.length + filteredInterfaceTopics.length})`
              )}
            </div>
            {renderTopicAccordion([...filteredWorkflowTopics, ...filteredInterfaceTopics])}
          </div>
        ) : activeTab === 'overview' ? (
          <div className="space-y-4">
            {/* Full-App Walkthrough & Current Page Tour Launcher */}
            <div className="p-4 rounded-2xl bg-primary/8 border border-primary/20 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="font-extrabold text-sm text-foreground flex items-center gap-1.5">
                    <Compass className="size-4 text-primary shrink-0" />
                    <span>
                      {bi(
                        'الجولة الشاملة التفاعلية لكل التطبيق',
                        'Interactive Full-App Walkthrough',
                        'گەشتی گشتیی کارلێککەر بۆ هەموو ئەپەکە'
                      )}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground-1 leading-relaxed">
                    {bi(
                      hasPatients
                        ? 'تأخذك تلقائياً بين كل أقسام التطبيق بما فيها «سجل المريض السريري» بتبويباته الأربعة مع تسليط الإضاءة على الأزرار الحقيقية وشرح كل خطوة بوضوح.'
                        : 'تأخذك تلقائياً بين أقسام التطبيق الأساسية مع تسليط الإضاءة على الأزرار الحقيقية، وبمجرد إضافة مريض أو تحميل DEMO تشمل أيضاً سجل المريض.',
                      hasPatients
                        ? 'Guides you step-by-step across all main sections including a live 4-tab Patient Clinical Record, highlighting real controls as you go.'
                        : 'Guides you step-by-step across all main sections highlighting real controls, and automatically includes the Patient Record once a patient or DEMO data exists.',
                      'هەنگاو بە هەنگاو بە هەموو بەشە سەرەکییەکانی ئەپەکە و دۆسیەی نەخۆشت دەگەڕێنێت بە شیکردنەوەی ڕوون.'
                    )}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {onStartFullWalkthrough && (
                    <button
                      type="button"
                      data-testid="guide-launch-full-walkthrough-btn"
                      onClick={() => {
                        onOpenChange(false);
                        onStartFullWalkthrough();
                      }}
                      className="min-h-[40px] px-3.5 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground font-extrabold inline-flex items-center gap-1.5 cursor-pointer shadow-xs whitespace-nowrap"
                    >
                      <Play className="size-3.5" />
                      <span>
                        {bi('ابدأ الجولة الشاملة', 'Start Full Tour', 'دەستپێکردنی گەشتی گشتی')}
                      </span>
                    </button>
                  )}
                  {onStartSpotlightTour && currentTourDef && (
                    <button
                      type="button"
                      data-testid="guide-launch-spotlight-btn"
                      onClick={() => {
                        onOpenChange(false);
                        onStartSpotlightTour(currentPageTourId);
                      }}
                      className="min-h-[40px] px-3.5 py-2 rounded-xl bg-card hover:bg-surface border border-line-2 text-foreground font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <Compass className="size-3.5 text-primary" />
                      <span>
                        {bi(
                          `شرح: ${currentTourDef.pageLabelAr}`,
                          `Tour: ${currentTourDef.pageLabelEn}`,
                          `گەشت: ${currentTourDef.pageLabelCkb}`
                        )}
                      </span>
                    </button>
                  )}
                </div>
              </div>

              <div className="pt-2.5 border-t border-primary/15 flex flex-wrap items-center justify-between gap-2">
                <label className="inline-flex items-center gap-2 cursor-pointer text-foreground font-semibold">
                  <input
                    type="checkbox"
                    checked={toursState.autoEnabled}
                    onChange={handleToggleAutoTours}
                    className="size-4 rounded accent-primary cursor-pointer"
                  />
                  <span>
                    {bi(
                      'إظهار دليل كل صفحة تلقائياً عند زيارتها لأول مرة',
                      'Auto-show spotlight guide on first visit to each page',
                      'پیشاندانی ڕوونکردنەوەی هەر پەڕەیەک بە خۆکار لە یەکەم سەرداندا'
                    )}
                  </span>
                </label>

                <div className="flex flex-wrap items-center gap-3">
                  {onOpenWelcomeScreen && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenChange(false);
                        onOpenWelcomeScreen();
                      }}
                      className="text-xs font-semibold text-primary hover:underline cursor-pointer"
                    >
                      {bi('عرض شاشة الترحيب', 'Show Welcome', 'شاشەی بەخێرهاتن')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleResetTours}
                    className="text-xs font-semibold text-muted-foreground-1 hover:text-primary inline-flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="size-3.5" />
                    <span>
                      {resetNotice
                        ? bi('تمت إعادة التفعيل ✓', 'Tours reset ✓', 'چالاککرایەوە ✓')
                        : bi('إعادة تعيين كل الجولات', 'Reset all tours', 'سفرکردنەوەی هەموو گەشتەکان')}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* Platform Core Idea Recap */}
            <div className="space-y-2">
              <h3 className="text-xs font-extrabold text-foreground">
                {bi('فكرة المنصة بإيجاز', 'Platform Philosophy at a Glance', 'بیرۆکەی سەکۆکە بە کورتی')}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                {PLATFORM_OVERVIEW_PILLARS.map((p) => (
                  <div
                    key={p.id}
                    className="p-3 rounded-xl bg-surface/65 border border-line-2/80 space-y-1"
                  >
                    <div className="font-bold text-foreground">
                      {bi(p.titleAr, p.titleEn, p.titleCkb)}
                    </div>
                    <p className="text-xs text-muted-foreground-1 leading-relaxed">
                      {bi(p.bodyAr, p.bodyEn, p.bodyCkb)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Per-Page Interactive Tour Directory */}
            {onStartSpotlightTour && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-extrabold text-foreground">
                    {bi(
                      'جولات الأقسام المباشرة (اضغط للانتقال وشرح القسم)',
                      'Direct Section Tours (Jump & Highlight)',
                      'گەشتی بەشە سەرەکییەکان'
                    )}
                  </h3>
                  <span className="text-xs text-muted-foreground-2">
                    {bi(
                      'كما تظهر تلقائياً عند أول فتح لملف مريض أو جلسة SOAP',
                      'Patient Chart & SOAP tours also auto-trigger on first visit',
                      'دۆسیەی نەخۆش و SOAP لە یەکەم کردنەوەدا خۆکارانە دەردەکەون'
                    )}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {directPageIds.map((pid) => {
                    const def = PAGE_SPOTLIGHT_TOURS[pid];
                    const seen = toursState.seenPages.includes(pid);
                    return (
                      <button
                        key={pid}
                        type="button"
                        data-testid={`guide-direct-tour-${pid}`}
                        onClick={() => void handleRequestSectionTour(pid)}
                        className="p-3 rounded-xl bg-surface/65 hover:bg-surface border border-line-2/80 text-start flex items-start justify-between gap-2 cursor-pointer transition-colors"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="font-bold text-foreground flex items-center gap-1.5">
                            <span>{bi(def.pageLabelAr, def.pageLabelEn, def.pageLabelCkb)}</span>
                            {seen && (
                              <CheckCircle2
                                className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0"
                                aria-label={bi('تمت مشاهدتها', 'Viewed', 'بینراوە')}
                              />
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground-1 line-clamp-2 leading-relaxed">
                            {bi(def.summaryAr, def.summaryEn, def.summaryCkb)}
                          </p>
                        </div>
                        <span className="text-xs font-bold text-primary shrink-0 pt-0.5">
                          {bi('ابدأ', 'Tour', 'دەستپێک')}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {missingTourContext === 'patient_chart' && (
                  <div
                    role="note"
                    data-testid="guide-patient-chart-empty-notice"
                    className="p-3 rounded-xl bg-primary/8 border border-primary/25 space-y-2 text-xs"
                  >
                    <p className="text-foreground font-semibold leading-relaxed">
                      {bi(
                        'لا يوجد مريض مسجّل حالياً لعرض «سجل المريض السريري» عليه. يمكنك تحميل مريض تجريبي (DEMO) وبدء الجولة فوراً (ويمكنك حذفه بنقرة لاحقاً)، أو إضافة أول مريض الآن:',
                        'There are no patients yet to showcase the Patient Clinical Record. Load temporary DEMO data to tour a real 4-tab chart immediately (deletable in one click), or add your first patient:',
                        'لە ئێستادا هیچ نەخۆشێک تۆمار نەکراوە بۆ پیشاندانی دۆسیەی نەخۆش. دەتوانیت داتای تاقیکاریی DEMO بار بکەیت و دەستبەجێ گەشتەکە دەست پێبکەیت:'
                      )}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      {onStartPatientChartTourWithDemo && (
                        <button
                          type="button"
                          disabled={busyAction !== null}
                          onClick={() => void handleLoadDemoAndTourChart()}
                          className="min-h-[36px] px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <Play className="size-3.5" />
                          <span>
                            {busyAction === 'demo_chart'
                              ? bi('جاري التحضير...', 'Preparing...', 'ئامادەکردن...')
                              : bi(
                                  'تحميل DEMO وبدء شرح سجل المريض فوراً',
                                  'Load DEMO & Tour Patient Record',
                                  'بارکردنی DEMO و گەشتی دۆسیەی نەخۆش'
                                )}
                          </span>
                        </button>
                      )}
                      {onAddFirstPatient && (
                        <button
                          type="button"
                          onClick={() => {
                            setMissingTourContext(null);
                            onOpenChange(false);
                            onAddFirstPatient();
                          }}
                          className="min-h-[36px] px-3 py-1.5 rounded-lg bg-card hover:bg-surface border border-line-2 text-foreground font-bold cursor-pointer"
                        >
                          {bi('إضافة أول مريض الآن', 'Add First Patient', 'زیادکردنی یەکەم نەخۆش')}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {missingTourContext === 'session_soap' && (
                  <div
                    role="note"
                    data-testid="guide-session-soap-empty-notice"
                    className="p-3 rounded-xl bg-primary/8 border border-primary/25 space-y-2 text-xs"
                  >
                    <p className="text-foreground font-semibold leading-relaxed">
                      {bi(
                        'لا توجد جلسة علاجية مفتوحة أو مسجّلة حالياً لشرح «ورقة جلسة SOAP» عليها. يمكنك فتح جلسة تجريبية على مريض DEMO فوراً لتجربة الـ 6 خطوات (وتُحذف بالكامل مع بيانات DEMO)، أو افتح أي مريض واضغط «+ جلسة جديدة»:',
                        'No treatment sessions exist yet to showcase the 6-step SOAP Session sheet. Launch a temporary DEMO session immediately (deleted cleanly with DEMO data), or open any patient and tap "+ New Session":',
                        'لە ئێستادا هیچ دانیشتنێک نییە بۆ پیشاندانی پەڕەی SOAP. دەتوانیت دانیشتنێکی تاقیکاریی DEMO بکەیتەوە یان نەخۆشێک بکەیتەوە و «+ دانیشتنی نوێ» دابگریت:'
                      )}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      {onStartSessionSoapTourWithDemo && (
                        <button
                          type="button"
                          disabled={busyAction !== null}
                          onClick={() => void handleLoadDemoAndTourSession()}
                          className="min-h-[36px] px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <Play className="size-3.5" />
                          <span>
                            {busyAction === 'demo_session'
                              ? bi('جاري التحضير...', 'Preparing...', 'ئامادەکردن...')
                              : bi(
                                  'فتح جلسة DEMO وبدء شرح جلسة SOAP فوراً',
                                  'Open DEMO Session & Start SOAP Tour',
                                  'کردنەوەی دانیشتنی DEMO و گەشتی SOAP'
                                )}
                          </span>
                        </button>
                      )}
                      {onAddFirstPatient && !hasPatients && (
                        <button
                          type="button"
                          onClick={() => {
                            setMissingTourContext(null);
                            onOpenChange(false);
                            onAddFirstPatient();
                          }}
                          className="min-h-[36px] px-3 py-1.5 rounded-lg bg-card hover:bg-surface border border-line-2 text-foreground font-bold cursor-pointer"
                        >
                          {bi('إضافة أول مريض الآن', 'Add First Patient', 'زیادکردنی یەکەم نەخۆش')}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Contextual optional modules note */}
                <div className="px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-muted-foreground-1 leading-relaxed">
                  <span className="font-bold text-foreground">
                    {bi('الوحدات الإضافية (تُفعَّل من الإعدادات): ', 'Optional Modules (enable in Settings): ', 'بەشە زیادەکان (لە ڕێکخستنەکان چالاک دەکرێن): ')}
                  </span>
                  {contextualPageIds
                    .map((id) =>
                      bi(
                        PAGE_SPOTLIGHT_TOURS[id].pageLabelAr,
                        PAGE_SPOTLIGHT_TOURS[id].pageLabelEn,
                        PAGE_SPOTLIGHT_TOURS[id].pageLabelCkb
                      )
                    )
                    .join(' · ')}
                  {' — '}
                  {bi(
                    'يظهر دليلها المضيء تلقائياً عند فتحها لأول مرة، كما يمكنك قراءة شرحها الكامل في تبويب «دليل العمل الكامل».',
                    'their spotlight guides trigger automatically on first open, and every detail is explained in the "Full Playbook" tab.',
                    'لە یەکەم کردنەوەدا ڕوونکردنەوەیان خۆکار دەردەکەوێت و شیکردنەوەیان لە «ڕێبەری کاری تەواو» هەیە.'
                  )}
                </div>
              </div>
            )}
          </div>
        ) : activeTab === 'workflow' ? (
          <div className="space-y-4">
            {/* Complete 8-Chapter Therapist Playbook Intro */}
            <div className="px-3.5 py-2.5 rounded-xl bg-primary/8 border border-primary/20 flex items-start gap-2.5 text-xs text-foreground">
              <ClipboardList className="size-4 text-primary shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-extrabold">
                  {bi(
                    'دليل المعالج الشامل خطوة بخطوة (8 فصول تغطي كل ميزة في المنصة)',
                    'Complete Therapist Playbook (8 Chapters Covering Every Feature)',
                    'ڕێبەری تەواوی چارەسەرکار هەنگاو بە هەنگاو (٨ بەش بۆ هەموو تایبەتمەندییەکان)'
                  )}
                </div>
                <p className="text-muted-foreground-1 leading-relaxed">
                  {bi(
                    'مرتّب حسب يوم عملك الحقيقي: من بداية الدوام والمواعيد والكورسات ← ملف المريض والتقييمات وجلسة SOAP وقواعد أمان الأجهزة ← التمارين والقوام والموافقات ← المالية العراقية والأقساط ← الإحالات والاحتفاظ والتحليلات ← الأمان والنسخ الاحتياطي. اضغط أي فصل لفتحه أو لتجربة جولته التفاعلية مباشرة.',
                    'Ordered like your actual clinic day: Morning Start & Scheduling → Patient Chart & Full Assessment Suite & SOAP + Modality Safety → HEP, Posture & Consents → Iraqi Billing & Installments → Referrals, Retention & Analytics → Security & Backups. Open any chapter or launch its live spotlight tour directly.',
                    'بەپێی ڕۆژی کاری کلینیک ڕێکخراوە لە بەیانییەوە تا کۆتایی ڕۆژ و کۆپی یەدەگ. هەر بەشێک بکەرەوە بۆ خوێندنەوە یان دەستپێکردنی گەشتەکەی.'
                  )}
                </p>
              </div>
            </div>

            {renderTopicAccordion(filteredWorkflowTopics)}
          </div>
        ) : (
          <div className="space-y-4">
            {renderTopicAccordion(filteredInterfaceTopics)}

            {/* Keyboard Shortcuts Table (shown seamlessly on wide screens only) */}
            {!isMobileViewport && (
              <div className="rounded-2xl bg-surface/65 border border-line-2/80 overflow-hidden">
                <div className="px-3.5 py-2.5 border-b border-card-divider/70 flex items-center gap-2 font-extrabold text-foreground">
                  <Keyboard className="size-4 text-primary shrink-0" />
                  <span>
                    {bi(
                      'اختصارات لوحة المفاتيح',
                      'Keyboard Shortcuts',
                      'قەدبڕەکانی کیبۆرد'
                    )}
                  </span>
                </div>
                <div className="divide-y divide-card-divider/60">
                  {DESKTOP_SHORTCUTS.map((sc) => (
                    <div
                      key={sc.keys}
                      className="px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="font-bold text-foreground">
                          {bi(sc.labelAr, sc.labelEn, sc.labelCkb)}
                        </div>
                        <div className="text-xs text-muted-foreground-1 leading-relaxed">
                          {bi(sc.detailAr, sc.detailEn, sc.detailCkb)}
                        </div>
                      </div>
                      <kbd
                        dir="ltr"
                        className="self-start sm:self-center px-2 py-1 rounded-lg bg-card border border-line-2 font-mono text-xs font-bold text-foreground whitespace-nowrap shrink-0 tabular-nums"
                      >
                        {sc.keys}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 3. Optional Safe DEMO Sandbox */}
        <div className="p-3.5 rounded-xl bg-layer border border-layer-line space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Database className="size-4 text-primary" />
              <span className="font-bold text-foreground">
                {bi(
                  'بيئة التجربة السريعة (DEMO)',
                  'Quick Demo Sandbox',
                  'ژینگەی تاقیکردنەوەی خێرا (DEMO)'
                )}
              </span>
            </div>
            <DemoBadge />
          </div>
          <p className="text-xs text-muted-foreground-1 leading-relaxed">
            {bi(
              'جرّب المواعيد والتوثيق والفوترة على مرضى افتراضيين، ثم احذفهم جميعاً بنقرة واحدة قبل إدخال مرضاك الحقيقيين.',
              'Practice scheduling, charting, and billing on clearly badged DEMO patients, then delete them all in one click.',
              'نۆرەگرتن و تۆمارکردن و پسوولە لەسەر نەخۆشی تاقیکاری DEMO تاقیبکەرەوە و دواتر بە یەک کرتە هەموویان بسڕەوە.'
            )}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => void handleLoadDemo()}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Database className="size-3.5" />
              <span>
                {busyAction === 'load'
                  ? bi('جاري الإدراج...', 'Loading DEMO...', 'خەریکی دانانە...')
                  : bi(
                      'تحميل بيانات DEMO للتجربة',
                      'Load DEMO Data',
                      'بارکردنی داتای DEMO'
                    )}
              </span>
            </button>

            {hasDemoData && !confirmDeleteDemo && (
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => setConfirmDeleteDemo(true)}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="size-3.5" />
                <span>
                  {bi(
                    'حذف جميع بيانات DEMO الآن',
                    'Delete All DEMO Data',
                    'سڕینەوەی هەموو داتای DEMO'
                  )}
                </span>
              </button>
            )}
            {hasDemoData && confirmDeleteDemo && (
              <div className="inline-flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={async () => {
                    await handleDeleteDemo();
                    setConfirmDeleteDemo(false);
                  }}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="size-3.5" />
                  <span>
                    {busyAction === 'delete'
                      ? bi('جاري الحذف...', 'Deleting...', 'خەریکی سڕینەوەیە...')
                      : bi(
                          'تأكيد حذف بيانات DEMO',
                          'Confirm Delete DEMO',
                          'دڵنیاکردنەوەی سڕینەوە'
                        )}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteDemo(false)}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-layer border border-layer-line text-foreground font-semibold cursor-pointer"
                >
                  {bi('إلغاء', 'Cancel', 'هەڵوەشاندنەوە')}
                </button>
              </div>
            )}
          </div>

          {statusMsg && (
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              {statusMsg}
            </p>
          )}
        </div>
      </div>
    </ModalDialog>
  );
};
