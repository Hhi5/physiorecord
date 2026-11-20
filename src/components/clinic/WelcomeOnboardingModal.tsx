// =======================================================================
// PhysioRecord — First-Entry Welcome & Platform Philosophy Modal
// - Shown once on first workspace entry (never interrupts E2E/WebDriver)
// - Clearly explains what PhysioRecord is and its 3 core pillars
// - Highlights device-specific orientation (Desktop/Laptop vs Mobile/Phone)
// - Lets the user launch the Full-App Walkthrough OR jump right into work
//   with automatic per-page guides active as they explore each section
// =======================================================================

import React from 'react';
import {
  Activity,
  Stethoscope,
  CalendarClock,
  ShieldCheck,
  Compass,
  ArrowLeft,
  ArrowRight,
  BookOpen,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { ModalDialog } from '../ui/Dialog';
import { PLATFORM_OVERVIEW_PILLARS } from '../../utils/pageSpotlightTours';

export interface WelcomeOnboardingModalProps {
  isOpen: boolean;
  isSoloMode: boolean;
  walkthroughCount?: number;
  onStartFullWalkthrough: () => void;
  onEnterWorkspaceWithAutoGuides: () => void;
  onOpenFullGuide: () => void;
  onDisableAllAutoGuides: () => void;
}

const PILLAR_ICONS = [Stethoscope, CalendarClock, ShieldCheck] as const;

export const WelcomeOnboardingModal: React.FC<WelcomeOnboardingModalProps> = ({
  isOpen,
  isSoloMode,
  walkthroughCount = 5,
  onStartFullWalkthrough,
  onEnterWorkspaceWithAutoGuides,
  onOpenFullGuide,
  onDisableAllAutoGuides,
}) => {
  const { bi, isRtl } = useLanguage();
  const EnterArrow = isRtl ? ArrowLeft : ArrowRight;

  return (
    <ModalDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onEnterWorkspaceWithAutoGuides();
      }}
      size="lg"
      dir={isRtl ? 'rtl' : 'ltr'}
      title={
        <span className="inline-flex items-center gap-2.5 text-sm sm:text-base font-extrabold text-primary-foreground">
          <span className="size-7 rounded-lg bg-primary-foreground/15 inline-flex items-center justify-center shrink-0">
            <Activity className="size-4" strokeWidth={2.4} />
          </span>
          <span>
            {bi(
              'أهلاً بك في PhysioRecord',
              'Welcome to PhysioRecord',
              'بەخێربێیت بۆ PhysioRecord'
            )}
          </span>
        </span>
      }
      subtitle={bi(
        'مكتبك السريري والإداري المتكامل لعيادات العلاج الطبيعي — يعمل محلياً 100% ومشفّر بالكامل على جهازك',
        'Your complete offline-first clinical & financial workstation for physiotherapy clinics — encrypted locally on your device',
        'نووسینگەی کلینیکی و کارگێڕیی تەواو بۆ کلینیکەکانی چارەسەری سروشتی — ١٠٠٪ ناوخۆیی و کۆدکراو لەسەر ئامێرەکەت'
      )}
      ariaLabel={bi(
        'الترحيب والتعريف بمنصة PhysioRecord',
        'Welcome and PhysioRecord platform overview',
        'بەخێرهاتن و ناساندنی سەکۆی PhysioRecord'
      )}
    >
      <div data-testid="welcome-onboarding-modal" className="space-y-5 text-xs">
        {/* 1. Platform Core Philosophy — 3 Calm Pillars */}
        <div className="space-y-2.5">
          <div className="text-xs font-bold text-muted-foreground-1">
            {bi(
              'فكرة المنصة وكيف تساعدك يومياً في العيادة',
              'How PhysioRecord supports your clinic every day',
              'بیرۆکەی سەکۆکە و چۆن ڕۆژانە یارمەتیت دەدات'
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {PLATFORM_OVERVIEW_PILLARS.map((pillar, idx) => {
              const Icon = PILLAR_ICONS[idx] ?? ShieldCheck;
              return (
                <div
                  key={pillar.id}
                  className="p-3.5 rounded-2xl bg-surface/65 border border-line-2/80 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="size-8 rounded-xl bg-primary/12 text-primary inline-flex items-center justify-center shrink-0">
                      <Icon className="size-4" />
                    </span>
                    <h3 className="text-xs font-extrabold text-foreground leading-snug">
                      {bi(pillar.titleAr, pillar.titleEn, pillar.titleCkb)}
                    </h3>
                  </div>
                  <p className="text-xs text-muted-foreground-1 leading-relaxed">
                    {bi(pillar.bodyAr, pillar.bodyEn, pillar.bodyCkb)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* 2. Quiet Workspace Mode & Auto-Guide Reassurance */}
        <div className="px-3.5 py-2.5 rounded-xl bg-layer border border-line-2 text-xs text-muted-foreground-1 leading-relaxed flex flex-wrap items-center justify-between gap-2">
          <span>
            {bi(
              'يمكنك البدء بجولة شاملة الآن، أو الدخول مباشرة للعمل وسيظهر لك شرح مختصر وهادئ لكل قسم عند زيارته لأول مرة.',
              'Start the quick walkthrough now, or jump straight into work with a calm first-visit spotlight guide on each section.',
              'دەتوانیت ئێستا گەشتی گشتی دەستپێبکەیت یان ڕاستەوخۆ بچیتە ناو کار و لە یەکەم سەردانی هەر بەشێکدا ڕوونکردنەوەت بۆ دەردەکەوێت.'
            )}
          </span>
          <span className="font-bold text-foreground shrink-0">
            {isSoloMode
              ? bi('وضع المعالج المنفرد', 'Solo Mode', 'دۆخی تاک')
              : bi('وضع العيادة والفريق', 'Clinic Team Mode', 'دۆخی کلینیک')}
          </span>
        </div>

        {/* 3. Clear Action Choices: Full-App Walkthrough vs Direct Work */}
        <div className="pt-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <button
            type="button"
            data-testid="welcome-start-full-tour-btn"
            onClick={onStartFullWalkthrough}
            className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-extrabold inline-flex items-center justify-center gap-2 shadow-sm cursor-pointer transition-colors"
          >
            <Compass className="size-4 shrink-0" />
            <span>
              {bi(
                `ابدأ الجولة الشاملة لكل التطبيق (${walkthroughCount} أقسام · دقيقتان)`,
                `Start Full-App Walkthrough (${walkthroughCount} Sections · ~2 min)`,
                `دەستپێکردنی گەشتی گشتی بۆ هەموو ئەپەکە (${walkthroughCount} بەش)`
              )}
            </span>
          </button>

          <button
            type="button"
            data-testid="welcome-enter-work-btn"
            onClick={onEnterWorkspaceWithAutoGuides}
            className="sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl bg-surface hover:bg-layer-hover border border-line-2 text-foreground text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <span>
              {bi(
                'دخول مباشر للعمل (مع شرح كل صفحة عند زيارتها)',
                'Start Working (Show Guide on Each Page Visit)',
                'چوونە ناو کار (لەگەڵ ڕوونکردنەوەی هەر پەڕەیەک)'
              )}
            </span>
            <EnterArrow className="size-4 shrink-0" />
          </button>
        </div>

        {/* 4. Quiet Secondary Footer */}
        <div className="pt-2.5 border-t border-card-divider/70 flex flex-wrap items-center justify-between gap-2 text-xs">
          <button
            type="button"
            data-testid="welcome-open-guide-btn"
            onClick={onOpenFullGuide}
            className="text-primary hover:underline font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <BookOpen className="size-3.5" />
            <span>
              {bi(
                'تصفّح الدليل الكامل',
                'Browse Full Guide',
                'کردنەوەی ڕێبەری تەواو'
              )}
            </span>
          </button>

          <button
            type="button"
            data-testid="welcome-disable-auto-btn"
            onClick={onDisableAllAutoGuides}
            className="text-muted-foreground-2 hover:text-foreground underline-offset-2 hover:underline cursor-pointer"
          >
            {bi(
              'أعرف التطبيق — إيقاف الشروحات التلقائية',
              'I know the app — disable auto-guides',
              'ئەپەکە دەناسم — وەستاندنی ڕوونکردنەوە خۆکارەکان'
            )}
          </button>
        </div>
      </div>
    </ModalDialog>
  );
};
