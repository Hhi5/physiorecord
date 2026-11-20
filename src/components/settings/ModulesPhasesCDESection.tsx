import React, { useEffect, useState } from 'react';
import { Compass, Share2, Shield } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import type { SettingsViewMode } from '../../types/clinicManagement';
import { SettingsAccordion, SettingsSwitchRow } from './SettingsPrimitives';

interface ModulesPhasesCDESectionProps {
  isModalOpen: boolean;
  settingsViewMode: SettingsViewMode;
  onSwitchSettingsMode: (mode: SettingsViewMode) => void;
  openClinicOps: boolean;
  onOpenClinicOpsChange: (open: boolean) => void;
  openDataQuality: boolean;
  onOpenDataQualityChange: (open: boolean) => void;
  openSharing: boolean;
  onOpenSharingChange: (open: boolean) => void;
}

export const ModulesPhasesCDESection: React.FC<ModulesPhasesCDESectionProps> = ({
  isModalOpen,
  settingsViewMode,
  onSwitchSettingsMode,
  openClinicOps,
  onOpenClinicOpsChange,
  openDataQuality,
  onOpenDataQualityChange,
  openSharing,
  onOpenSharingChange,
}) => {
  const { bi } = useLanguage();

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

  const clinicOpsActiveCount = [
    enableHomeVisits,
    enablePracticeLocations,
    enableClosedDaysBreaks,
    enableHijriDateDisplay,
    enableInstallmentPlans,
    enableRecurringExpenses,
    enableReferralsModule,
    enableRetentionLists,
  ].filter(Boolean).length;

  const dataQualityActiveCount = [
    enableImportWizard,
    enableTrashRecycleBin,
    enableDataHealthScreen,
    enableBilingualGlossary,
  ].filter(Boolean).length;

  const sharingActiveCount = [
    enableWebShareInterop,
    enableIcsCalendarExport,
    enableScheduleVisitCardPrint,
    enablePhotoMeasurementTools,
  ].filter(Boolean).length;

  const onText = bi('مفعّلة', 'Enabled', 'چالاکە');
  const offText = bi('معطّلة', 'Off', 'ناچالاکە');

  return (
    <>
      {/* Group: Clinic Operations & Scheduling */}
      <SettingsAccordion
        icon={<Compass className="size-4" />}
        title={bi('تشغيل العيادة والمواعيد والأقساط', 'Clinic Operations, Visits & Installments', 'کارکردنی کلینیک، چاوپێکەوتن و قیستەکان')}
        meta={bi(`مفعّل ${clinicOpsActiveCount} من 8`, `${clinicOpsActiveCount} of 8 active`, `${clinicOpsActiveCount} لە 8 چالاکە`)}
        open={openClinicOps}
        onOpenChange={onOpenClinicOpsChange}
      >
        <div>
          <SettingsSwitchRow
            testId="toggle-home-visits-btn"
            title={bi('الزيارات المنزلية والخرائط', 'Home Visits, Landmarks & Maps Link', 'سەردانی ماڵەوە و بەستەری نەخشە')}
            description={bi(
              'دعم العنوان المعلمي ورسوم التوصيل الاختيارية وفتح الخريطة عند الطلب.',
              'Landmark addresses, optional travel fee line, and user-initiated Maps link.',
              'پشتگیری ناونیشانی شوێنی ناسراو، نرخی هاتوچۆ و کردنەوەی نەخشە.'
            )}
            checked={enableHomeVisits}
            onLabel={onText}
            offLabel={offText}
            onChange={(next) => {
              ClinicOperationsService.setHomeVisitsEnabled(next);
              setEnableHomeVisits(next);
            }}
          />
          <SettingsSwitchRow
            testId="toggle-practice-locations-btn"
            title={bi('مواقع الممارسة المتعددة', 'Multiple Practice Locations', 'شوێنە جیاوازەکانی کارکردن')}
            description={bi(
              'تصنيف المواعيد والفواتير بين العيادة الرئيسية والمنزل والمستشفى.',
              'Tag appointments & invoices across Clinic, Home Visits, Hospital, or Second Clinic.',
              'پۆلێنکردنی چاوپێکەوتن و پسوڵەکان بەپێی شوێن.'
            )}
            checked={enablePracticeLocations}
            onLabel={onText}
            offLabel={offText}
            onChange={(next) => {
              ClinicOperationsService.setPracticeLocationsEnabled(next);
              setEnablePracticeLocations(next);
            }}
          />
          <SettingsSwitchRow
            testId="toggle-closed-days-breaks-btn"
            title={bi('أيام الإغلاق والاستراحات الأسبوعية', 'Closed Days & Weekly Breaks', 'ڕۆژانی پشوو و پشووە هەفتانەییەکان')}
            description={bi(
              'استراحات الصلاة/الغداء وتواريخ الإغلاق مع تنبيه المواعيد.',
              'Lunch/prayer weekly breaks and closed date ranges honored by scheduling.',
              'پشووی نوێژ/نیوەڕۆ و ڕۆژانی داخستن.'
            )}
            checked={enableClosedDaysBreaks}
            onLabel={onText}
            offLabel={offText}
            onChange={(next) => {
              ClinicOperationsService.setClosedDaysBreaksEnabled(next);
              setEnableClosedDaysBreaks(next);
            }}
          />
          <SettingsSwitchRow
            testId="toggle-hijri-date-btn"
            title={bi('عرض التاريخ الهجري بجانب الميلادي', 'Optional Hijri Date Display', 'پیشاندانی ڕێکەوتی کۆچی')}
            description={bi(
              'إظهار التاريخ الهجري في الجدول باستخدام تقويم الجهاز المحلي.',
              'Display Hijri calendar date beside Gregorian in schedule.',
              'پیشاندانی ڕێکەوتی کۆچی لە تەنیشت زاینی لە خشتەکەدا.'
            )}
            checked={enableHijriDateDisplay}
            onLabel={onText}
            offLabel={offText}
            onChange={(next) => {
              ClinicOperationsService.setHijriDateDisplayEnabled(next);
              setEnableHijriDateDisplay(next);
            }}
          />
          <SettingsSwitchRow
            testId="toggle-installment-plans-btn"
            title={bi('خطط الأقساط وتقادم الديون', 'Installment Plans & Debt Aging', 'پلانی قیستەکان و کۆنبوونی قەرز')}
            description={bi(
              'تقسيم الفاتورة إلى دفعات مجدولة مع تنبيهات التأخير (30/60/90 يوم) وتذكير واتساب.',
              'Split invoices into due dates with 30/60/90 aging buckets & WhatsApp reminders.',
              'دابەشکردنی پسوڵە بۆ قیستی دیاریکراو لەگەڵ ئاگادارکردنەوەی دواکەوتن.'
            )}
            checked={enableInstallmentPlans}
            onLabel={onText}
            offLabel={offText}
            onChange={(next) => {
              ClinicOperationsService.setInstallmentPlansEnabled(next);
              setEnableInstallmentPlans(next);
            }}
          />
          <SettingsSwitchRow
            testId="toggle-recurring-expenses-btn"
            title={bi('المصاريف الدورية والتصنيفات المخصصة', 'Recurring Monthly Expenses', 'خەرجییە دووبارەبووەکان')}
            description={bi(
              'قوالب الإيجار والمولدة والاشتراكات مع اقتراح "مستحق هذا الشهر".',
              'Rent, generator fuel & subscription templates with "Due this month" prompts.',
              'داڕشتەی کرێ، مۆلیدە و بەشداریکردنەکان.'
            )}
            checked={enableRecurringExpenses}
            onLabel={onText}
            offLabel={offText}
            onChange={(next) => {
              ClinicOperationsService.setRecurringExpensesEnabled(next);
              setEnableRecurringExpenses(next);
            }}
          />
          <SettingsSwitchRow
            testId="toggle-referrals-module-btn"
            title={bi('الإحالات ودليل الأطباء ورسالة التقرير', 'Referrals, Doctor Directory & Report-Back', 'ڕەوانەکردنەکان و ڕێبەری پزیشکان')}
            description={bi(
              'تتبع مصادر الإحالة وإنشاء رسالة متابعة للطبيب المحوِّل بنقرة واحدة.',
              'Track referral sources, doctor analytics, and one-click report-back letters.',
              'شوێنپێگرتنی سەرچاوەکانی ڕەوانەکردن و نامەی وەڵام بۆ پزیشک.'
            )}
            checked={enableReferralsModule}
            onLabel={onText}
            offLabel={offText}
            onChange={(next) => {
              ClinicOperationsService.setReferralsModuleEnabled(next);
              setEnableReferralsModule(next);
            }}
          />
          <SettingsSwitchRow
            testId="toggle-retention-lists-btn"
            title={bi('قوائم المتابعة والاحتفاظ بالمرضى', 'Retention Lists & Post-Discharge Follow-Ups', 'لیستی بەدواداچوونی نەخۆشەکان')}
            description={bi(
              'متابعة المنقطعين، استبيان 4 و12 أسبوعاً، انتهاء الكورس والذمم.',
              'Inactive plan alerts, 4w/12w outcome follow-ups, package expiry & balances.',
              'بەدواداچوونی دابڕاوەکان، ڕاپرسی 4 و 12 هەفتە و تەواوبوونی کۆرس.'
            )}
            checked={enableRetentionLists}
            onLabel={onText}
            offLabel={offText}
            onChange={(next) => {
              ClinicOperationsService.setRetentionListsEnabled(next);
              setEnableRetentionLists(next);
            }}
          >
            {enableRetentionLists && (
              <div className="p-3 rounded-xl bg-surface border border-line-2 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-foreground">
                    {bi('عتبة الانقطاع عن الخطة النشطة (بالأيام)', 'Active-Plan Inactivity Threshold (Days)', 'سنووری دابڕان (بە ڕۆژ)')}
                  </p>
                  <p className="text-xs text-muted-foreground-1">
                    {bi(
                      'إظهار المرضى النشطين بدون زيارة خلال آخر N يوماً.',
                      'Flag active episodes with no visit for at least N days.',
                      'پیشاندانی نەخۆشە چالاکەکان کە لە ماوەی N ڕۆژدا سەردانیان نەکردووە.'
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
                  className="w-24 py-1.5 px-3 rounded-xl bg-layer border border-layer-line text-xs font-bold tabular-nums text-foreground text-center"
                />
              </div>
            )}
          </SettingsSwitchRow>
        </div>
      </SettingsAccordion>

      {/* Group: Data Quality, Import & Terminology */}
      <SettingsAccordion
        testId="settings-phaseD-modules-card"
        icon={<Shield className="size-4" />}
        title={bi('جودة البيانات، الاستيراد، السلة والمعجم', 'Data Quality, Import, Recycle Bin & Glossary', 'کوالێتی داتا، هاوردەکردن، سەبەتە و فەرهەنگ')}
        meta={bi(`مفعّل ${dataQualityActiveCount} من 4`, `${dataQualityActiveCount} of 4 active`, `${dataQualityActiveCount} لە 4 چالاکە`)}
        open={openDataQuality}
        onOpenChange={onOpenDataQualityChange}
      >
        {/* Always-active Duplicate Guard */}
        <div className="py-2.5 border-b border-card-divider/70 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold text-foreground">
              {bi('منع التكرار والدمج الآمن لملفات المرضى', 'Duplicate Patient Guard & Safe Merge', 'ڕێگری لە دووبارەبوونەوە و تێکەڵکردنی سەلامەت')}
            </p>
            <p className="text-xs text-muted-foreground-1 mt-0.5">
              {bi(
                'فحص تطابق الاسم أو آخر 7 أرقام للهاتف وحفظ لقطة أمان قبل أي دمج.',
                'Warns on matching name or phone and saves encrypted snapshots before merge.',
                'پشکنینی هاوشێوەیی ناو یان ژمارەی مۆبایل پێش هەر تێکەڵکردنێک.'
              )}
            </p>
          </div>
          <span
            data-testid="badge-duplicate-guard-essential"
            className="shrink-0 text-emerald-700 dark:text-emerald-400 text-xs font-bold"
          >
            {bi('مفعّل دائماً', 'Always Active', 'هەمیشە چالاکە')}
          </span>
        </div>

        <div>
          <SettingsSwitchRow
            testId="toggle-import-wizard-btn"
            title={bi('معالج استيراد المرضى (CSV / XLSX)', 'CSV & XLSX Patient Import Wizard', 'ڕێنیشاندەری هاوردەکردنی CSV / XLSX')}
            description={bi(
              'تخمين تلقائي للأعمدة، فحص تكرار قبل الحفظ، وإمكانية التراجع الكامل.',
              'Offline column auto-guess, duplicate preview, and atomic rollback.',
              'پێشبینی خۆکاری ستوونەکان و پشکنینی دووبارەبوونەوە.'
            )}
            checked={enableImportWizard}
            onLabel={onText}
            offLabel={offText}
            onChange={(next) => {
              ClinicOperationsService.setImportWizardEnabled(next);
              setEnableImportWizard(next);
            }}
          />
          <SettingsSwitchRow
            testId="toggle-trash-recycle-bin-btn"
            title={bi('سلة المهملات لمدة 30 يوماً', '30-Day Non-Clinical Recycle Bin', 'سەبەتەی سڕاوەکان بۆ 30 ڕۆژ')}
            description={bi(
              'استعادة المواعيد وقائمة الانتظار والمصاريف خلال 30 يوماً.',
              'Recover deleted appointments, waitlist entries & expenses for 30 days.',
              'گەڕاندنەوەی چاوپێکەوتن و خەرجییەکان لە ماوەی 30 ڕۆژدا.'
            )}
            checked={enableTrashRecycleBin}
            onLabel={onText}
            offLabel={offText}
            onChange={(next) => {
              ClinicOperationsService.setTrashRecycleBinEnabled(next);
              setEnableTrashRecycleBin(next);
            }}
          />
          <SettingsSwitchRow
            testId="toggle-data-health-screen-btn"
            title={bi('شاشة صحة البيانات وفحص النواقص', 'Data Health & Integrity Scanner', 'شاشەی تەندروستی داتا')}
            description={bi(
              'فحص البيانات الناقصة، المسودات غير المعتمدة، الفواتير والنسخ الاحتياطي.',
              'Audit missing demographics, unsigned drafts, unpaid invoices & backup health.',
              'پشکنینی زانیارییە کەمەکان، ڕەشنووسەکان و پسوڵە نەدراوەکان.'
            )}
            checked={enableDataHealthScreen}
            onLabel={onText}
            offLabel={offText}
            onChange={(next) => {
              ClinicOperationsService.setDataHealthScreenEnabled(next);
              setEnableDataHealthScreen(next);
            }}
          />
          <SettingsSwitchRow
            testId="toggle-bilingual-glossary-btn"
            title={bi('معجم المصطلحات ثنائي اللغة', 'Bilingual Terminology Glossary', 'فەرهەنگی زاراوە پزیشکییەکان')}
            description={bi(
              'دليل مصطلحات واختصارات العلاج الطبيعي (ODI، NPRS، MCID، ROM، MMT).',
              'Offline Arabic/English clinical glossary for outcome scores, SOAP & ROM.',
              'ڕێبەری زاراوە و کورتکراوەکانی چارەسەری سروشتی بێ ئینتەرنێت.'
            )}
            checked={enableBilingualGlossary}
            onLabel={onText}
            offLabel={offText}
            onChange={(next) => {
              ClinicOperationsService.setBilingualTerminologyGlossaryEnabled(next);
              setEnableBilingualGlossary(next);
            }}
          />
        </div>
      </SettingsAccordion>

      {/* Group: Sharing, Printing & Photo Tools */}
      <SettingsAccordion
        testId="settings-phaseE-modules-card"
        icon={<Share2 className="size-4" />}
        title={bi('المشاركة، التقويم، الطباعة وقياس الصور', 'Sharing, Calendar, Printing & Photo Tools', 'هاوبەشکردن، ڕۆژژمێر، چاپ و پێوانەی وێنە')}
        meta={bi(`مفعّل ${sharingActiveCount} من 4`, `${sharingActiveCount} of 4 active`, `${sharingActiveCount} لە 4 چالاکە`)}
        open={openSharing}
        onOpenChange={onOpenSharingChange}
      >
        <div>
          <SettingsSwitchRow
            testId="toggle-web-share-interop-btn"
            title={bi('مشاركة الإيصالات والتقارير عبر النظام وواتساب', 'Web Share & WhatsApp Sharing', 'هاوبەشکردنی پسوڵە و ڕاپۆرتەکان')}
            description={bi(
              'مشاركة المستندات عبر نافذة مشاركة الجهاز أو واتساب (+964) ونسخ الملخص.',
              'Share printed receipts & reports via system share sheet, WhatsApp, or clipboard.',
              'هاوبەشکردنی بەڵگەنامەکان لە ڕێگەی سیستەم یان واتساپ.'
            )}
            checked={enableWebShareInterop}
            onLabel={onText}
            offLabel={offText}
            onChange={(next) => {
              ClinicOperationsService.setWebShareInteropEnabled(next);
              setEnableWebShareInterop(next);
            }}
          />
          <SettingsSwitchRow
            testId="toggle-ics-calendar-export-btn"
            title={bi('تصدير المواعيد كملف تقويم (.ics)', 'Calendar Export (.ics)', 'هەناردەکردنی چاوپێکەوتن (.ics)')}
            description={bi(
              'تصدير الموعد القادم أو جدول اليوم إلى ملف تقويم محلي مع خيارات الخصوصية.',
              'Generate offline .ics files for single appointments or day schedules.',
              'دروستکردنی فایلی (.ics) بێ ئینتەرنێت بۆ چاوپێکەوتنەکان.'
            )}
            checked={enableIcsCalendarExport}
            onLabel={onText}
            offLabel={offText}
            onChange={(next) => {
              ClinicOperationsService.setIcsCalendarExportEnabled(next);
              setEnableIcsCalendarExport(next);
            }}
          />
          <SettingsSwitchRow
            testId="toggle-schedule-visit-card-print-btn"
            title={bi('طباعة جدول الغد وبطاقة مواعيد المريض', 'Schedule & Visit Card Printing', 'چاپکردنی خشتە و کارتی سەردان')}
            description={bi(
              'طباعة جدول مواعيد اليوم/الغد وبطاقة مواعيد المريض مع الجلسات المتبقية والرصيد.',
              'Print schedule run-sheets and patient visit cards with remaining sessions & balance.',
              'چاپکردنی خشتەی چاوپێکەوتنەکان و کارتی سەردانی نەخۆش.'
            )}
            checked={enableScheduleVisitCardPrint}
            onLabel={onText}
            offLabel={offText}
            onChange={(next) => {
              ClinicOperationsService.setScheduleVisitCardPrintEnabled(next);
              setEnableScheduleVisitCardPrint(next);
            }}
          />
          <SettingsSwitchRow
            testId="toggle-photo-measurement-tools-btn"
            title={bi('أدوات قياس الزوايا والشاقول على الصور', 'Photo Angle & Plumb-Line Tools', 'پێوانەی گۆشە و شاقووڵی لەسەر وێنە')}
            description={bi(
              'خط الشاقول، خط الأفق، شبكة المعايرة، وقياس الزوايا بـ 3 نقاط على صور القوام.',
              'Plumb line, horizontal level, grid overlay, and 3-point angle measurement.',
              'هێڵی شاقووڵی، ئاسۆیی، تۆڕی پێوانە و پێوانەی گۆشە بە 3 خاڵ.'
            )}
            checked={enablePhotoMeasurementTools}
            onLabel={onText}
            offLabel={offText}
            onChange={(next) => {
              ClinicOperationsService.setPhotoMeasurementToolsEnabled(next);
              setEnablePhotoMeasurementTools(next);
            }}
          />
        </div>
      </SettingsAccordion>

      {settingsViewMode === 'simple' && (
        <div
          data-testid="settings-simple-mode-notice"
          className="p-3 rounded-xl bg-surface border border-line-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground-1"
        >
          <span>
            {bi(
              'الوضع المبسط مفعّل حالياً — يتم إخفاء أدوات الكادر والتجربة المتقدمة.',
              'Simple Mode active — advanced staff & demo controls are hidden.',
              'شێوازی سادە چالاکە — بەشە پێشکەوتووەکانی ستاف و تاقیکردنەوە شاردراونەتەوە.'
            )}
          </span>
          <button
            type="button"
            data-testid="settings-switch-to-advanced-inline-btn"
            onClick={() => onSwitchSettingsMode('advanced')}
            className="px-3 py-1.5 rounded-lg bg-card border border-line-2 text-foreground font-bold cursor-pointer hover:bg-layer-hover"
          >
            {bi('عرض الوضع المتقدم', 'Switch to Advanced', 'گۆڕین بۆ پێشکەوتوو')}
          </button>
        </div>
      )}
    </>
  );
};
