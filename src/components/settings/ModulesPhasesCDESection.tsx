import React, { useEffect, useState } from 'react';
import { Compass, Share2, Shield } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import type { SettingsViewMode } from '../../types/clinicManagement';

interface ModulesPhasesCDESectionProps {
  isModalOpen: boolean;
  settingsViewMode: SettingsViewMode;
  onSwitchSettingsMode: (mode: SettingsViewMode) => void;
}

export const ModulesPhasesCDESection: React.FC<ModulesPhasesCDESectionProps> = ({
  isModalOpen,
  settingsViewMode,
  onSwitchSettingsMode,
}) => {
  const { bi } = useLanguage();

  // Phase C: Iraq-Specific Operations Toggles
  const [enableHomeVisits, setEnableHomeVisits] = useState<boolean>(() =>
    ClinicOperationsService.isHomeVisitsEnabled()
  );
  const [enablePracticeLocations, setEnablePracticeLocations] = useState<boolean>(() =>
    ClinicOperationsService.isPracticeLocationsEnabled()
  );
  const [enableClosedDaysBreaks, setEnableClosedDaysBreaks] = useState<boolean>(() =>
    ClinicOperationsService.isClosedDaysBreaksEnabled()
  );
  const [enableHijriDateDisplay, setEnableHijriDateDisplay] = useState<boolean>(() =>
    ClinicOperationsService.isHijriDateDisplayEnabled()
  );
  const [enableInstallmentPlans, setEnableInstallmentPlans] = useState<boolean>(() =>
    ClinicOperationsService.isInstallmentPlansEnabled()
  );
  const [enableRecurringExpenses, setEnableRecurringExpenses] = useState<boolean>(() =>
    ClinicOperationsService.isRecurringExpensesEnabled()
  );
  const [enableReferralsModule, setEnableReferralsModule] = useState<boolean>(() =>
    ClinicOperationsService.isReferralsModuleEnabled()
  );
  const [enableRetentionLists, setEnableRetentionLists] = useState<boolean>(() =>
    ClinicOperationsService.isRetentionListsEnabled()
  );
  const [retentionInactiveDays, setRetentionInactiveDays] = useState<number>(() =>
    ClinicOperationsService.getRetentionInactiveDaysThreshold()
  );

  // Phase D: Data Quality, Import, Recycle Bin & Terminology Toggles
  const [enableImportWizard, setEnableImportWizard] = useState<boolean>(() =>
    ClinicOperationsService.isImportWizardEnabled()
  );
  const [enableTrashRecycleBin, setEnableTrashRecycleBin] = useState<boolean>(() =>
    ClinicOperationsService.isTrashRecycleBinEnabled()
  );
  const [enableDataHealthScreen, setEnableDataHealthScreen] = useState<boolean>(() =>
    ClinicOperationsService.isDataHealthScreenEnabled()
  );
  const [enableBilingualGlossary, setEnableBilingualGlossary] = useState<boolean>(() =>
    ClinicOperationsService.isBilingualTerminologyGlossaryEnabled()
  );

  // Phase E: Sharing, .ics Calendar Export, Schedule/Visit Card Print & Photo Tools
  const [enableWebShareInterop, setEnableWebShareInterop] = useState<boolean>(() =>
    ClinicOperationsService.isWebShareInteropEnabled()
  );
  const [enableIcsCalendarExport, setEnableIcsCalendarExport] = useState<boolean>(() =>
    ClinicOperationsService.isIcsCalendarExportEnabled()
  );
  const [enableScheduleVisitCardPrint, setEnableScheduleVisitCardPrint] = useState<boolean>(() =>
    ClinicOperationsService.isScheduleVisitCardPrintEnabled()
  );
  const [enablePhotoMeasurementTools, setEnablePhotoMeasurementTools] = useState<boolean>(() =>
    ClinicOperationsService.isPhotoMeasurementToolsEnabled()
  );

  useEffect(() => {
    const syncPhasesCDE = () => {
      setEnableHomeVisits(ClinicOperationsService.isHomeVisitsEnabled());
      setEnablePracticeLocations(ClinicOperationsService.isPracticeLocationsEnabled());
      setEnableClosedDaysBreaks(ClinicOperationsService.isClosedDaysBreaksEnabled());
      setEnableHijriDateDisplay(ClinicOperationsService.isHijriDateDisplayEnabled());
      setEnableInstallmentPlans(ClinicOperationsService.isInstallmentPlansEnabled());
      setEnableRecurringExpenses(ClinicOperationsService.isRecurringExpensesEnabled());
      setEnableReferralsModule(ClinicOperationsService.isReferralsModuleEnabled());
      setEnableRetentionLists(ClinicOperationsService.isRetentionListsEnabled());
      setRetentionInactiveDays(ClinicOperationsService.getRetentionInactiveDaysThreshold());
      setEnableImportWizard(ClinicOperationsService.isImportWizardEnabled());
      setEnableTrashRecycleBin(ClinicOperationsService.isTrashRecycleBinEnabled());
      setEnableDataHealthScreen(ClinicOperationsService.isDataHealthScreenEnabled());
      setEnableBilingualGlossary(
        ClinicOperationsService.isBilingualTerminologyGlossaryEnabled()
      );
      setEnableWebShareInterop(ClinicOperationsService.isWebShareInteropEnabled());
      setEnableIcsCalendarExport(ClinicOperationsService.isIcsCalendarExportEnabled());
      setEnableScheduleVisitCardPrint(ClinicOperationsService.isScheduleVisitCardPrintEnabled());
      setEnablePhotoMeasurementTools(ClinicOperationsService.isPhotoMeasurementToolsEnabled());
    };
    if (isModalOpen) {
      syncPhasesCDE();
    }
    const unsubOps = ClinicOperationsService.subscribe(syncPhasesCDE);
    window.addEventListener('physiorecord-modules-updated', syncPhasesCDE);
    return () => {
      unsubOps();
      window.removeEventListener('physiorecord-modules-updated', syncPhasesCDE);
    };
  }, [isModalOpen]);

  return (
    <>
      {/* Phase C: Iraq-Specific Operations Toggles (C1–C7) */}
      <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-foreground">
          <Compass className="size-4 text-primary" />
          <span>
            {bi(
              'وحدات التشغيل الخاصة بعيادات العراق (Phase C)',
              'Iraq-Specific Operations Modules (Phase C)',
              'بەشەکانی کارکردنی کلینیکەکانی عێراق (Phase C)'
            )}
          </span>
        </div>

        {[
          {
            testId: 'toggle-home-visits-btn',
            titleAr: 'الزيارات المنزلية وفواصل التنقل والخرائط (C1)',
            titleEn: 'Home Visits, Landmarks, Travel Buffers & Maps Link (C1)',
            titleCkb: 'سەردانی ماڵەوە، کاتی هاتوچۆ و بەستەری نەخشە (C1)',
            descAr: 'دعم العنوان المعلمي ورسوم التوصيل الاختيارية وفتح الخريطة عند طلب المستخدم.',
            descEn: 'Landmark addresses, optional travel fee line (blank default), and user-initiated Maps link.',
            descCkb: 'پشتگیری ناونیشانی شوێنی ناسراو، نرخی هاتوچۆی بژاردەیی و کردنەوەی نەخشە بە داواکاری بەکارهێنەر.',
            value: enableHomeVisits,
            onToggle: (next: boolean) => {
              ClinicOperationsService.setHomeVisitsEnabled(next);
              setEnableHomeVisits(next);
            },
          },
          {
            testId: 'toggle-practice-locations-btn',
            titleAr: 'مواقع الممارسة المتعددة (C2)',
            titleEn: 'Multiple Practice Locations (C2)',
            titleCkb: 'شوێنە جیاوازەکانی کارکردن (C2)',
            descAr: 'تصنيف المواعيد والفواتير بين العيادة الرئيسية والمنزل والمستشفى والعيادة الثانية.',
            descEn: 'Tag appointments & invoices across Clinic, Home Visits, Hospital, or Second Clinic.',
            descCkb: 'پۆلێنکردنی چاوپێکەوتن و پسوڵەکان لە نێوان کلینیکی سەرەکی، ماڵەوە، نەخۆشخانە و کلینیکی دووەم.',
            value: enablePracticeLocations,
            onToggle: (next: boolean) => {
              ClinicOperationsService.setPracticeLocationsEnabled(next);
              setEnablePracticeLocations(next);
            },
          },
          {
            testId: 'toggle-closed-days-breaks-btn',
            titleAr: 'أيام الإغلاق والاستراحات الأسبوعية (C3)',
            titleEn: 'Custom Closed Days & Weekly Breaks (C3)',
            titleCkb: 'ڕۆژانی پشوو و پشووە هەفتانەییەکان (C3)',
            descAr: 'استراحات الصلاة/الغداء وتواريخ الإغلاق التي يدخلها المستخدم مع تنبيه المواعيد.',
            descEn: 'Lunch/prayer weekly breaks and user-entered closed date ranges honored by scheduling.',
            descCkb: 'پشووی نوێژ/نیوەڕۆ و ڕۆژانی داخستنی تۆمارکراو لەلایەن بەکارهێنەرەوە لەگەڵ ئاگادارکردنەوەی چاوپێکەوتنەکان.',
            value: enableClosedDaysBreaks,
            onToggle: (next: boolean) => {
              ClinicOperationsService.setClosedDaysBreaksEnabled(next);
              setEnableClosedDaysBreaks(next);
            },
          },
          {
            testId: 'toggle-hijri-date-btn',
            titleAr: 'عرض التاريخ الهجري الاختياري (C3)',
            titleEn: 'Optional Hijri Date Display via Intl (C3)',
            titleCkb: 'پیشاندانی بژاردەیی ڕێکەوتی کۆچی (C3)',
            descAr: 'إظهار التاريخ الهجري بجانب الميلادي في الجدول باستخدام تقويم المتصفح المحلي.',
            descEn: 'Display Hijri calendar date beside Gregorian in schedule via browser Intl API.',
            descCkb: 'پیشاندانی ڕێکەوتی کۆچی لە تەنیشت زاینی لە خشتەکەدا بە بەکارهێنانی ڕۆژژمێری ناوخۆیی وێبگەڕ.',
            value: enableHijriDateDisplay,
            onToggle: (next: boolean) => {
              ClinicOperationsService.setHijriDateDisplayEnabled(next);
              setEnableHijriDateDisplay(next);
            },
          },
          {
            testId: 'toggle-installment-plans-btn',
            titleAr: 'خطط الأقساط وتقادم الديون 30/60/90 يوم (C4)',
            titleEn: 'Installment Plans & 30/60/90-Day Aging (C4)',
            titleCkb: 'پلانی قیستەکان و کۆنبوونی قەرزی 30/60/90 ڕۆژ (C4)',
            descAr: 'تقسيم الفاتورة إلى دفعات مجدولة مع تنبيهات التأخير وتذكير واتساب.',
            descEn: 'Split invoices into due dates with 30/60/90 aging buckets & one-tap WhatsApp reminders.',
            descCkb: 'دابەشکردنی پسوڵە بۆ قیستی دیاریکراو لەگەڵ ئاگادارکردنەوەی دواکەوتن و بیرخستنەوەی واتساپ.',
            value: enableInstallmentPlans,
            onToggle: (next: boolean) => {
              ClinicOperationsService.setInstallmentPlansEnabled(next);
              setEnableInstallmentPlans(next);
            },
          },
          {
            testId: 'toggle-recurring-expenses-btn',
            titleAr: 'المصاريف الدورية والتصنيفات المخصصة (C5)',
            titleEn: 'Recurring Monthly Expenses & Custom Categories (C5)',
            titleCkb: 'خەرجییە دووبارەبووەکان و پۆلە تایبەتەکان (C5)',
            descAr: 'قوالب الإيجار والمولدة والاشتراكات مع اقتراح "مستحق هذا الشهر".',
            descEn: 'Rent, generator fuel & subscription templates with "Due this month" prompts.',
            descCkb: 'داڕشتەی کرێ، مۆلیدە و بەشداریکردنەکان لەگەڵ پێشنیاری "شایستەی ئەم مانگە".',
            value: enableRecurringExpenses,
            onToggle: (next: boolean) => {
              ClinicOperationsService.setRecurringExpensesEnabled(next);
              setEnableRecurringExpenses(next);
            },
          },
          {
            testId: 'toggle-referrals-module-btn',
            titleAr: 'الإحالات ودليل الأطباء ورسالة التقرير (C6)',
            titleEn: 'Referral Sources, Doctor Directory & Report-Back Letters (C6)',
            titleCkb: 'ڕەوانەکردنەکان، ڕێبەری پزیشکان و نامەی ڕاپۆرت (C6)',
            descAr: 'تتبع مصادر الإحالة وإحصائياتها وإنشاء رسالة متابعة للطبيب بنقرة واحدة.',
            descEn: 'Track referral sources, doctor directory analytics, and one-click report-back letters.',
            descCkb: 'شوێنپێگرتنی سەرچاوەکانی ڕەوانەکردن و ئامارەکانیان و دروستکردنی نامەی وەڵام بۆ پزیشک بە یەک کلیک.',
            value: enableReferralsModule,
            onToggle: (next: boolean) => {
              ClinicOperationsService.setReferralsModuleEnabled(next);
              setEnableReferralsModule(next);
            },
          },
          {
            testId: 'toggle-retention-lists-btn',
            titleAr: 'قوائم المتابعة والاحتفاظ بالمرضى (C7)',
            titleEn: 'Retention Lists & 4w/12w Post-Discharge Follow-Ups (C7)',
            titleCkb: 'لیستی بەدواداچوون و پاراستنی نەخۆشەکان (C7)',
            descAr: 'متابعة المنقطعين، استبيان 4 و12 أسبوعاً (NPRS/PSFS)، انتهاء الكورس والديون.',
            descEn: 'Inactive plan alerts, 4w/12w post-discharge outcome follow-ups, package expiry & balances.',
            descCkb: 'بەدواداچوونی دابڕاوەکان، ڕاپرسی 4 و 12 هەفتە (NPRS/PSFS)، تەواوبوونی کۆرس و قەرزەکان.',
            value: enableRetentionLists,
            onToggle: (next: boolean) => {
              ClinicOperationsService.setRetentionListsEnabled(next);
              setEnableRetentionLists(next);
            },
          },
        ].map((mod) => (
          <div
            key={mod.testId}
            className="p-3 rounded-xl bg-layer/60 border border-layer-line flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <p className="text-xs font-bold text-foreground">
                {bi(mod.titleAr, mod.titleEn, mod.titleCkb)}
              </p>
              <p className="text-xs text-muted-foreground-1">
                {bi(mod.descAr, mod.descEn, mod.descCkb)}
              </p>
            </div>
            <button
              type="button"
              data-testid={mod.testId}
              onClick={() => mod.onToggle(!mod.value)}
              className={`shrink-0 py-1.5 px-3 rounded-xl text-xs font-bold cursor-pointer ${
                mod.value
                  ? 'bg-emerald-600 text-white'
                  : 'bg-surface border border-layer-line text-foreground'
              }`}
            >
              {mod.value ? bi('مفعّلة', 'Enabled', 'چالاکە') : bi('معطّلة', 'Off', 'ناچالاکە')}
            </button>
          </div>
        ))}

        {enableRetentionLists && (
          <div className="p-3 rounded-xl bg-layer/60 border border-layer-line flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold text-foreground">
                {bi(
                  'عتبة الانقطاع عن الخطة النشطة (بالأيام)',
                  'Active-Plan Inactivity Threshold (Days)',
                  'سنووری دابڕان لە پلانی چالاک (بە ڕۆژ)'
                )}
              </p>
              <p className="text-xs text-muted-foreground-1">
                {bi(
                  'إظهار المرضى النشطين بدون زيارة خلال آخر N يوماً في قائمة المتابعة.',
                  'Flag active episodes with no visit for at least N days in the Retention list.',
                  'پیشاندانی نەخۆشە چالاکەکان کە لە ماوەی N ڕۆژی ڕابردوودا سەردانیان نەکردووە لە لیستی بەدواداچووندا.'
                )}
              </p>
            </div>
            <input
              type="number"
              min={3}
              max={180}
              aria-label={bi('عتبة الانقطاع عن الخطة النشطة بالأيام', 'Active-Plan Inactivity Threshold Days', 'سنووری دابڕان بە ڕۆژ')}
              data-testid="retention-inactive-days-input"
              value={retentionInactiveDays}
              onChange={(e) => {
                const val = Math.max(3, Math.min(180, Number(e.target.value) || 14));
                setRetentionInactiveDays(val);
                ClinicOperationsService.setRetentionInactiveDaysThreshold(val);
              }}
              className="w-24 py-1.5 px-3 rounded-xl bg-surface border border-layer-line text-xs font-bold text-foreground text-center"
            />
          </div>
        )}
      </div>

      {/* Phase D: Data Quality, Import, Recycle Bin & Terminology (D1–D5) */}
      <div
        data-testid="settings-phaseD-modules-card"
        className="p-4 rounded-xl bg-surface border border-line-2 space-y-3"
      >
        <div className="flex items-center gap-2 text-xs font-bold text-foreground">
          <Shield className="size-4 text-primary" />
          <span>
            {bi(
              'جودة البيانات، الاستيراد، السلة والمصطلحات (Phase D)',
              'Data Quality, Import, Recycle Bin & Terminology (Phase D)',
              'کوالێتی داتا، هاوردەکردن، سەبەتە و زاراوەکان (Phase D)'
            )}
          </span>
        </div>

        {/* D1: Essential Always-Active Duplicate Guard & Transactional Merge */}
        <div className="p-3 rounded-xl bg-layer/60 border border-layer-line flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold text-foreground">
              {bi(
                'منع التكرار والدمج الآمن لملفات المرضى (D1)',
                'Duplicate Patient Guard & Transactional Merge (D1)',
                'ڕێگری لە دووبارەبوونەوە و تێکەڵکردنی سەلامەتی دۆسیەی نەخۆش (D1)'
              )}
            </p>
            <p className="text-xs text-muted-foreground-1">
              {bi(
                'فحص تطابق الاسم أو آخر 7 أرقام للهاتف وحفظ لقطة أمان مشفرة قبل أي دمج.',
                'Always active to warn on matching name/7-digit phone and capture encrypted pre-merge snapshots.',
                'پشکنینی هاوشێوەیی ناو یان دوا 7 ژمارەی مۆبایل و پاشەکەوتکردنی وێنەی سەلامەتی کۆدکراو پێش هەر تێکەڵکردنێک.'
              )}
            </p>
          </div>
          <span
            data-testid="badge-duplicate-guard-essential"
            className="shrink-0 text-emerald-700 dark:text-emerald-400 text-xs font-extrabold"
          >
            {bi('أساسي · مفعّل دائماً', 'ESSENTIAL · Always Active', 'بنەڕەتی · هەمیشە چالاکە')}
          </span>
        </div>

        {[
          {
            testId: 'toggle-import-wizard-btn',
            titleAr: 'معالج استيراد المرضى CSV / XLSX (D2)',
            titleEn: 'CSV & XLSX Patient Import Wizard (D2)',
            titleCkb: 'ڕێنیشاندەری هاوردەکردنی نەخۆشەکان CSV / XLSX (D2)',
            descAr: 'تخمين تلقائي للأعمدة، فحص تكرار تجريبي قبل الحفظ، وإمكانية التراجع الكامل عن الاستيراد.',
            descEn: 'Offline column auto-guess, dry-run duplicate preview, and atomic import batch rollback.',
            descCkb: 'پێشبینی خۆکاری ستوونەکان، پشکنینی دووبارەبوونەوە پێش پاشەکەوتکردن و توانای گەڕانەوەی تەواو لە هاوردەکردن.',
            value: enableImportWizard,
            onToggle: (next: boolean) => {
              ClinicOperationsService.setImportWizardEnabled(next);
              setEnableImportWizard(next);
            },
          },
          {
            testId: 'toggle-trash-recycle-bin-btn',
            titleAr: 'سلة المهملات غير السريرية لمدة 30 يوماً (D3)',
            titleEn: '30-Day Non-Clinical Recycle Bin (D3)',
            titleCkb: 'سەبەتەی سڕاوە ناکلینیکییەکان بۆ ماوەی 30 ڕۆژ (D3)',
            descAr: 'استعادة المواعيد وقائمة الانتظار والمصاريف خلال 30 يوماً مع بقاء السجلات السريرية محمية دائماً.',
            descEn: 'Recover deleted appointments, waitlist entries & expenses for 30 days; clinical records stay immutable.',
            descCkb: 'گەڕاندنەوەی چاوپێکەوتن، لیستی چاوەڕوانی و خەرجییەکان لە ماوەی 30 ڕۆژدا لەگەڵ مانەوەی تۆمارە کلینیکییەکان بە پارێزراوی.',
            value: enableTrashRecycleBin,
            onToggle: (next: boolean) => {
              ClinicOperationsService.setTrashRecycleBinEnabled(next);
              setEnableTrashRecycleBin(next);
            },
          },
          {
            testId: 'toggle-data-health-screen-btn',
            titleAr: 'شاشة صحة البيانات وفحص السجلات المعزولة (D4)',
            titleEn: 'Data Health Screen & Orphan Record Scanner (D4)',
            titleCkb: 'شاشەی تەندروستی داتا و پشکنەری تۆمارە دابڕاوەکان (D4)',
            descAr: 'فحص البيانات الناقصة، المسودات غير المعتمدة، الفواتير، السجلات المعزولة وتمرين النسخ الاحتياطي.',
            descEn: 'Audit missing demographics, unsigned drafts, unpaid invoices, orphan records & backup verification.',
            descCkb: 'پشکنینی زانیارییە کەمەکان، ڕەشنووسە واژۆنەکراوەکان، پسوڵە نەدراوەکان، تۆمارە دابڕاوەکان و دڵنیابوونەوە لە کۆپی یەدەگ.',
            value: enableDataHealthScreen,
            onToggle: (next: boolean) => {
              ClinicOperationsService.setDataHealthScreenEnabled(next);
              setEnableDataHealthScreen(next);
            },
          },
          {
            testId: 'toggle-bilingual-glossary-btn',
            titleAr: 'معجم المصطلحات ثنائي اللغة والاختصارات (D5)',
            titleEn: 'Bilingual Terminology Glossary & Quick Help (D5)',
            titleCkb: 'فەرهەنگی زاراوەکان و کورتکراوەکان (D5)',
            descAr: 'دليل مصطلحات واختصارات العلاج الطبيعي بالعربية والإنجليزية (ODI، NPRS، MCID، ROM، MMT).',
            descEn: 'Offline Arabic/English clinical glossary for outcome scores, SOAP, ROM & safety terminology.',
            descCkb: 'ڕێبەری زاراوە و کورتکراوەکانی چارەسەری سروشتی بێ ئینتەرنێت (ODI، NPRS، MCID، ROM، MMT).',
            value: enableBilingualGlossary,
            onToggle: (next: boolean) => {
              ClinicOperationsService.setBilingualTerminologyGlossaryEnabled(next);
              setEnableBilingualGlossary(next);
            },
          },
        ].map((mod) => (
          <div
            key={mod.testId}
            className="p-3 rounded-xl bg-layer/60 border border-layer-line flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <p className="text-xs font-bold text-foreground">
                {bi(mod.titleAr, mod.titleEn, mod.titleCkb)}
              </p>
              <p className="text-xs text-muted-foreground-1">
                {bi(mod.descAr, mod.descEn, mod.descCkb)}
              </p>
            </div>
            <button
              type="button"
              data-testid={mod.testId}
              onClick={() => mod.onToggle(!mod.value)}
              className={`shrink-0 py-1.5 px-3 rounded-xl text-xs font-bold cursor-pointer ${
                mod.value
                  ? 'bg-emerald-600 text-white'
                  : 'bg-surface border border-layer-line text-foreground'
              }`}
            >
              {mod.value ? bi('مفعّلة', 'Enabled', 'چالاکە') : bi('معطّلة', 'Off', 'ناچالاکە')}
            </button>
          </div>
        ))}
      </div>

      {/* Phase E: Sharing, .ics Calendar Export, Visit Card Printing & Photo Tools (E1–E4) */}
      <div
        data-testid="settings-phaseE-modules-card"
        className="p-4 rounded-xl bg-surface border border-line-2 space-y-3"
      >
        <div className="flex items-center gap-2 text-xs font-bold text-foreground">
          <Share2 className="size-4 text-primary" />
          <span>
            {bi(
              'المشاركة، التصدير للتقويم، طباعة المواعيد وقياس الصور (Phase E)',
              'Sharing, Calendar Export, Visit Card Print & Photo Tools (Phase E)',
              'هاوبەشکردن، هەناردەکردنی ڕۆژژمێر، چاپ و پێوانەی وێنە (Phase E)'
            )}
          </span>
        </div>

        {[
          {
            testId: 'toggle-web-share-interop-btn',
            titleAr: 'مشاركة الإيصالات والتقارير عبر النظام وواتساب (E1)',
            titleEn: 'Web Share & WhatsApp Fallbacks (E1)',
            titleCkb: 'هاوبەشکردنی پسوڵە و ڕاپۆرتەکان لە ڕێگەی سیستەم و واتساپەوە (E1)',
            descAr:
              'مشاركة المستندات المطبوعة عبر نافذة مشاركة الجهاز المحلية أو عبر واتساب (+964) ونسخ الملخص.',
            descEn:
              'Share printed receipts & reports via system share sheet, +964 WhatsApp fallback, or clipboard.',
            descCkb:
              'هاوبەشکردنی بەڵگەنامە چاپکراوەکان لە ڕێگەی پەنجەرەی هاوبەشکردنی ئامێر یان واتساپ (+964) و لەبەرگرتنەوەی پوختە.',
            value: enableWebShareInterop,
            onToggle: (next: boolean) => {
              ClinicOperationsService.setWebShareInteropEnabled(next);
              setEnableWebShareInterop(next);
            },
          },
          {
            testId: 'toggle-ics-calendar-export-btn',
            titleAr: 'تصدير المواعيد كملف تقويم (.ics) (E2)',
            titleEn: 'Privacy-First .ics Calendar Export (E2)',
            titleCkb: 'هەناردەکردنی چاوپێکەوتنەکان وەک فایلی ڕۆژژمێر (.ics) (E2)',
            descAr:
              'تصدير الموعد القادم أو جدول اليوم إلى ملف (.ics) محلياً مع اختيار حقول الخصوصية.',
            descEn:
              'Generate offline .ics files for single appointments or day schedules with explicit privacy controls.',
            descCkb:
              'دروستکردنی فایلی (.ics) بێ ئینتەرنێت بۆ چاوپێکەوتنی داهاتوو یان خشتەی ڕۆژ لەگەڵ هەڵبژاردنی خانەکانی نهێنیپارێزی.',
            value: enableIcsCalendarExport,
            onToggle: (next: boolean) => {
              ClinicOperationsService.setIcsCalendarExportEnabled(next);
              setEnableIcsCalendarExport(next);
            },
          },
          {
            testId: 'toggle-schedule-visit-card-print-btn',
            titleAr: 'طباعة جدول الغد وبطاقة مواعيد المريض (E3)',
            titleEn: 'Tomorrow Schedule & Visit Card Printing (E3)',
            titleCkb: 'چاپکردنی خشتەی سبەینێ و کارتی سەردانی نەخۆش (E3)',
            descAr:
              'طباعة جدول مواعيد اليوم/الغد وبطاقة مواعيد المريض مع الجلسات المتبقية بالكورس والرصيد.',
            descEn:
              'Print schedule run-sheets and patient visit cards showing remaining package sessions & balance.',
            descCkb:
              'چاپکردنی خشتەی چاوپێکەوتنەکانی ئەمڕۆ/سبەینێ و کارتی چاوپێکەوتنی نەخۆش لەگەڵ دانیشتنە ماوەکان و باڵانس.',
            value: enableScheduleVisitCardPrint,
            onToggle: (next: boolean) => {
              ClinicOperationsService.setScheduleVisitCardPrintEnabled(next);
              setEnableScheduleVisitCardPrint(next);
            },
          },
          {
            testId: 'toggle-photo-measurement-tools-btn',
            titleAr: 'أدوات قياس الزوايا والشاقول على الصور (E4)',
            titleEn: 'Photo 3-Point Angle & Plumb-Line Tools (E4)',
            titleCkb: 'ئامرازەکانی پێوانەی گۆشە و هێڵی شاقووڵی لەسەر وێنە (E4)',
            descAr:
              'خط الشاقول، خط الأفق، شبكة المعايرة، قياس الزوايا بـ 3 نقاط وحفظ نسخة مشفرة.',
            descEn:
              'Plumb line, horizontal level, grid overlay, 3-point angle measurement & encrypted copy.',
            descCkb:
              'هێڵی شاقووڵی، هێڵی ئاسۆیی، تۆڕی پێوانە، پێوانەی گۆشە بە 3 خاڵ و پاشەکەوتکردنی کۆپی کۆدکراو.',
            value: enablePhotoMeasurementTools,
            onToggle: (next: boolean) => {
              ClinicOperationsService.setPhotoMeasurementToolsEnabled(next);
              setEnablePhotoMeasurementTools(next);
            },
          },
        ].map((mod) => (
          <div
            key={mod.testId}
            className="p-3 rounded-xl bg-layer/60 border border-layer-line flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <p className="text-xs font-bold text-foreground">
                {bi(mod.titleAr, mod.titleEn, mod.titleCkb)}
              </p>
              <p className="text-xs text-muted-foreground-1">
                {bi(mod.descAr, mod.descEn, mod.descCkb)}
              </p>
            </div>
            <button
              type="button"
              data-testid={mod.testId}
              onClick={() => mod.onToggle(!mod.value)}
              className={`shrink-0 py-1.5 px-3 rounded-xl text-xs font-bold cursor-pointer ${
                mod.value
                  ? 'bg-emerald-600 text-white'
                  : 'bg-surface border border-layer-line text-foreground'
              }`}
            >
              {mod.value ? bi('مفعّلة', 'Enabled', 'چالاکە') : bi('معطّلة', 'Off', 'ناچالاکە')}
            </button>
          </div>
        ))}
      </div>

      {settingsViewMode === 'simple' && (
        <div
          data-testid="settings-simple-mode-notice"
          className="p-3 rounded-xl bg-muted/60 border border-line-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground-1"
        >
          <span>
            {bi(
              'الوضع المبسط مفعّل حالياً — يتم إخفاء تبويبات الكادر والمطور المتقدمة لتقليل الازدحام.',
              'Simple Mode active — advanced staff & developer controls are hidden for a cleaner view.',
              'شێوازی سادە لە ئێستادا چالاکە — بەشە پێشکەوتووەکانی ستاف و گەشەپێدەر شاردراونەتەوە بۆ کەمکردنەوەی قەرەباڵغی.'
            )}
          </span>
          <button
            type="button"
            data-testid="settings-switch-to-advanced-inline-btn"
            onClick={() => onSwitchSettingsMode('advanced')}
            className="px-2.5 py-1 rounded-lg bg-layer border border-layer-line text-foreground font-bold cursor-pointer hover:bg-layer-hover"
          >
            {bi('عرض الوضع المتقدم', 'Switch to Advanced', 'گۆڕین بۆ شێوازی پێشکەوتوو')}
          </button>
        </div>
      )}
    </>
  );
};
