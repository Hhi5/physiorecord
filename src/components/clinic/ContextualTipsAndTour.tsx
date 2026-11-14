// =======================================================================
// PhysioRecord — Contextual Tips & Optional Guided Tour (Phase 2.8)
// Uses clear DEMO-badged data when requested and offers 1-click delete.
// =======================================================================

import React, { useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import { ModalDialog } from '../ui/Dialog';
import { DemoBadge, Fraction } from '../ui/Primitives';
import {
  Lightbulb,
  X,
  Compass,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Trash2,
  Database,
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
      className="px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-amber-500/8 border border-amber-500/25 flex flex-wrap items-center justify-between gap-2 text-xs"
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Lightbulb className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
        <div className="min-w-0 truncate sm:whitespace-normal">
          <span className="font-bold text-foreground">{bi(titleAr, titleEn, titleCkb)}</span>
          <span className="hidden sm:inline text-muted-foreground-1">: {bi(bodyAr, bodyEn, bodyCkb)}</span>
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
          className="px-2.5 py-1 rounded-lg bg-layer hover:bg-layer-hover border border-layer-line text-muted-foreground-1 font-semibold cursor-pointer inline-flex items-center gap-1"
          aria-label={bi('إخفاء النصيحة', 'Dismiss tip', 'شاردنەوەی ئامۆژگاری')}
        >
          <X className="size-3.5" />
          <span>{bi('فهمت', 'Got it', 'تێگەیشتم')}</span>
        </button>
      </div>
    </div>
  );
};

interface GuidedTourModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  hasDemoData: boolean;
  onLoadDemoData: () => Promise<void>;
  onDeleteAllDemoData: () => Promise<void>;
}

const TOUR_STEPS = [
  {
    titleAr: '1. شاشة "اليوم" والمراجع السريع في 10 ثوانٍ',
    titleEn: '1. "Today" Home & 10-Second Walk-In',
    titleCkb: '١. پەڕەی "ئەمڕۆ" و سەردانیکەری خێرا لە ١٠ چرکەدا',
    descAr:
      'ابدأ يومك من شاشة اليوم: شاهد مواعيد اليوم بترتيب زمني، سجّل مراجعاً جديداً بالاسم والهاتف فقط ليدخل فوراً في ملف + حلقة + جلسة، أو اضغط "ابدأ الجلسة التالية".',
    descEn:
      'Run your clinic day from Today: view chronological visits, capture walk-ins with just Name + Phone into patient + episode + session, or tap "Start Next Session".',
    descCkb:
      'ڕۆژەکەت لە پەڕەی ئەمڕۆوە بەڕێوە ببە: چاوپێکەوتنەکانی ئەمڕۆ بە ڕیزبەندیی کات ببینە، سەردانیکەری نوێ تەنها بە ناو و مۆبایل تۆمار بکە بۆ دۆسیە + ئەڵقەی چارەسەر + دانیشتن، یان کرتە لە "دەستپێکردنی دانیشتنی داهاتوو" بکە.',
  },
  {
    titleAr: '2. التوثيق السريع (Quick SOAP)',
    titleEn: '2. Quick SOAP Documentation',
    titleCkb: '٢. بەڵگەنامەکردنی خێرا (Quick SOAP)',
    descAr:
      'يُنسخ سجل الجلسة السابقة مع تمييز الحقول المنسوخة للمراجعة. استخدم شريط الألم NPRS، رقائق الإجراءات القابلة للتعديل، مؤقت الجلسة التلقائي، والاختصارات Ctrl+Enter للحفظ و ? للمساعدة.',
    descEn:
      'Previous sessions copy forward with highlighted fields for review. Use the NPRS slider, editable intervention chips, automatic session timer, and Ctrl+Enter / ? shortcuts.',
    descCkb:
      'تۆماری دانیشتنی پێشوو بە دیاریکردنی خانە لەبەرگیراوەکانەوە بۆ پێداچوونەوە دەگوازرێتەوە. شریتی ئازاری NPRS، چیپە گۆڕاوەکانی دەستێوەردان، کاتژمێری خۆکاری دانیشتن، و کورتکراوەکانی Ctrl+Enter و ? بەکاربهێنە.',
  },
  {
    titleAr: '3. الإنهاء والتحصيل وإعادة الحجز بخطوة متصلة',
    titleEn: '3. One-Flow Finish: Sign, Collect & Rebook',
    titleCkb: '٣. تەواوکردن، وەرگرتنی پارە و دووبارە نۆرەگرتن بە یەک هەنگاو',
    descAr:
      'عند الانتهاء: اعتمد الملاحظة (بقفل غير قابل للتعديل لحفظ الأمانة السريرية)، ثم حصّل الدفعة من باقتك أو خدماتك المخصصة، واحجز نفس اليوم/الوقت للأسبوع القادم مع تراجع فوري لمدة 8 ثوانٍ عن الفوترة والحجز.',
    descEn:
      'Finish smoothly: permanently seal the clinical note, collect payment from package/custom service (no preset fees), suggest same weekday/time next visit, with an 8-second Undo for billing & rebooking.',
    descCkb:
      'لە کاتی تەواوبووندا: تێبینییە کلینیکییەکە واژۆ بکە (بە قوفڵی نەگۆڕاو بۆ پاراستنی ئەمانەتی پزیشکی)، پارەکە لە پاکێج یان خزمەتگوزارییە تایبەتەکانت وەربگرە (بەبێ نرخی پێشوەختە)، و هەمان ڕۆژ/کاتی هەفتەی داهاتوو بنووسە لەگەڵ گەڕانەوەی خێرا بۆ ماوەی ٨ چرکە.',
  },
  {
    titleAr: '4. إغلاق نهاية اليوم والنسخ الاحتياطي',
    titleEn: '4. End-of-Day Closing, WhatsApp & Backup',
    titleCkb: '٤. داخستنی کۆتایی ڕۆژ، WhatsApp و پاڵپشتی نهێنی',
    descAr:
      'في تبويب "نهاية اليوم": راجع ملخص النقد وZainCash وQiCard، استكمل أي مسودات جلسات غير موقعة، أرسل تذكيرات واتساب لمواعيد الغد، واحفظ نسخة احتياطية مشفرة خلال 10 ثوانٍ.',
    descEn:
      'Open End of Day to review cash/ZainCash/QiCard totals, finish any unsigned draft notes, send WhatsApp reminders for tomorrow, and save an encrypted backup in 10s.',
    descCkb:
      'تایبەتمەندیی "کۆتایی ڕۆژ" بکەرەوە: پێداچوونەوە بۆ کۆی نەقد، ZainCash و QiCard بکە، ڕەشنووسی دانیشتنە واژۆنەکراوەکان تەواو بکە، بیرخەرەوەی WhatsApp بۆ نۆرەکانی سبەی بنێرە، و پاشەکەوتی شفرەکراو لە ١٠ چرکەدا بپارێزە.',
  },
  {
    titleAr: '5. التجربة الآمنة ببيانات DEMO',
    titleEn: '5. Safe Practice with DEMO Data',
    titleCkb: '٥. تاقیکردنەوەی سەلامەت بە داتای DEMO',
    descAr:
      'يمكنك إدراج مرضى تجريبيين مميزين بشارة DEMO لتجربة المواعيد والتوثيق والفوترة، ثم حذفهم جميعاً بنقرة واحدة قبل إدخال مرضاك الحقيقيين.',
    descEn:
      'Load clearly badged DEMO patients anytime to test scheduling, charting, and billing safely, then remove all demo records in one click before real clinic use.',
    descCkb:
      'دەتوانیت نەخۆشی تاقیکاریی نیشانەدار بە DEMO دابنێیت بۆ تاقیکردنەوەی نۆرەگرتن، تۆمارکردن و پسوڵە، پاشان بە یەک کرتە هەموویان بسڕیتەوە پێش تۆمارکردنی نەخۆشە ڕاستەقینەکانت.',
  },
];

export const GuidedTourModal: React.FC<GuidedTourModalProps> = ({
  isOpen,
  onOpenChange,
  hasDemoData,
  onLoadDemoData,
  onDeleteAllDemoData,
}) => {
  const { bi, isRtl } = useLanguage();

  const [stepIdx, setStepIdx] = useState(0);
  const [busyAction, setBusyAction] = useState<'load' | 'delete' | null>(null);
  const [confirmDeleteDemo, setConfirmDeleteDemo] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const step = TOUR_STEPS[stepIdx] || TOUR_STEPS[0];
  const PrevIcon = isRtl ? ChevronRight : ChevronLeft;
  const NextIcon = isRtl ? ChevronLeft : ChevronRight;

  const handleCloseComplete = async () => {
    await ClinicOperationsService.setTourCompletedAsync(true);
    onOpenChange(false);
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

  return (
    <ModalDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          void handleCloseComplete();
        }
      }}
      size="md"
      title={bi(
        'جولة استخدام PhysioRecord للمعالج الفردي',
        'Solo Therapist Guided Tour',
        'گەشتی ڕێنوێنیی PhysioRecord بۆ چارەسەرکاری تاک'
      )}
      subtitle={bi(
        'دليل سريع لأهم المزايا اليومية داخل العيادة',
        'A concise walkthrough of your daily solo clinical workflow',
        'ڕێبەرێکی خێرا بۆ گرنگترین کارەکانی ڕۆژانە لە کلینیکدا'
      )}
      footer={
        <div className="w-full flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground-1 font-semibold">
            {bi('الخطوة', 'Step', 'هەنگاو')} <Fraction value={stepIdx + 1} total={TOUR_STEPS.length} />
          </div>
          <div className="flex items-center gap-2">
            {stepIdx > 0 && (
              <button
                type="button"
                onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-layer hover:bg-layer-hover border border-layer-line text-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <PrevIcon className="size-4" />
                <span>{bi('السابق', 'Previous', 'پێشوو')}</span>
              </button>
            )}
            {stepIdx < TOUR_STEPS.length - 1 ? (
              <button
                type="button"
                onClick={() => setStepIdx((i) => Math.min(TOUR_STEPS.length - 1, i + 1))}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <span>{bi('التالي', 'Next', 'دواتر')}</span>
                <NextIcon className="size-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleCloseComplete()}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="size-4" />
                <span>{bi('إنهاء الجولة', 'Finish Tour', 'تەواوکردنی گەشت')}</span>
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4 text-xs">
        {/* Progress Dots */}
        <div className="flex items-center gap-1.5">
          {TOUR_STEPS.map((s, idx) => (
            <button
              key={s.titleEn}
              type="button"
              onClick={() => setStepIdx(idx)}
              className={`h-2 flex-1 rounded-full transition-colors cursor-pointer ${
                idx === stepIdx
                  ? 'bg-primary'
                  : idx < stepIdx
                  ? 'bg-primary/45'
                  : 'bg-muted'
              }`}
              aria-label={bi(s.titleAr, s.titleEn, s.titleCkb)}
            />
          ))}
        </div>

        {/* Active Step Card */}
        <div className="p-4 rounded-2xl bg-surface border border-line-2 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-extrabold text-foreground">
              {bi(step.titleAr, step.titleEn, step.titleCkb)}
            </h3>
            {stepIdx === TOUR_STEPS.length - 1 && <DemoBadge />}
          </div>
          <p className="text-xs text-muted-foreground-1 leading-relaxed">
            {bi(step.descAr, step.descEn, step.descCkb)}
          </p>
        </div>

        {/* Step 5 optional DEMO Sandbox controls */}
        {stepIdx === TOUR_STEPS.length - 1 && (
          <div className="p-3.5 rounded-xl bg-layer border border-layer-line space-y-3">
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

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => void handleLoadDemo()}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:bg-surface disabled:text-muted-foreground-2 disabled:border disabled:border-line-2 disabled:cursor-not-allowed"
              >
                <Database className="size-3.5" />
                <span>
                  {busyAction === 'load'
                    ? bi('جاري الإدراج...', 'Loading DEMO...', 'خەریکی دانانە...')
                    : bi(
                        'تحميل بيانات DEMO للتجربة',
                        'Load DEMO Data for Tour',
                        'بارکردنی داتای DEMO بۆ تاقیکردنەوە'
                      )}
                </span>
              </button>

              {hasDemoData && !confirmDeleteDemo && (
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => setConfirmDeleteDemo(true)}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:bg-surface disabled:text-muted-foreground-2 disabled:border disabled:border-layer-line disabled:cursor-not-allowed"
                >
                  <Trash2 className="size-3.5" />
                  <span>
                    {bi(
                      'حذف جميع بيانات DEMO الآن',
                      'Delete All DEMO Data Now',
                      'سڕینەوەی هەموو داتای DEMO ئێستا'
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
                    className="min-h-[40px] px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="size-3.5" />
                    <span>
                      {busyAction === 'delete'
                        ? bi('جاري الحذف...', 'Deleting...', 'خەریکی سڕینەوەیە...')
                        : bi(
                            'تأكيد حذف بيانات DEMO',
                            'Confirm Delete DEMO',
                            'دڵنیاکردنەوەی سڕینەوەی داتای DEMO'
                          )}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteDemo(false)}
                    className="min-h-[40px] px-3 py-2 rounded-xl bg-layer border border-layer-line text-foreground font-semibold cursor-pointer"
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
        )}
      </div>
    </ModalDialog>
  );
};
