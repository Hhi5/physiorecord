import React, { useEffect, useState } from 'react';
import { Activity, AlertTriangle, ChevronDown } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import { MODALITY_SAFETY_RULES } from '../../utils/modalitySafetyChecker';
import { SettingsAccordion, SettingsSwitchRow } from './SettingsPrimitives';

const MODALITY_DISPLAY_AR: Record<string, string> = {
  TENS: 'TENS',
  IFC: 'IFC',
  NMES: 'NMES',
  Ultrasound: 'الأمواج فوق الصوتية (Ultrasound)',
  SWD_Diathermy: 'الإنفاذ الحراري (SWD)',
  SuperficialHeat: 'الحرارة السطحية',
  HotPack: 'الكمادات الساخنة',
  Cryotherapy: 'التبريد (Cryo)',
  DryNeedling: 'الإبر الجافة',
  Traction: 'الشد الميكانيكي',
  ManualTherapy: 'العلاج اليدوي',
};

interface ModulesClinicalSafetySectionProps {
  isModalOpen: boolean;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ModulesClinicalSafetySection: React.FC<ModulesClinicalSafetySectionProps> = ({
  isModalOpen,
  isOpen,
  onOpenChange,
}) => {
  const { bi } = useLanguage();

  const [enableProblemListGoals, setEnableProblemListGoals] = useState<boolean>(() =>
    ClinicOperationsService.isProblemListGoalsEnabled()
  );
  const [enableReEvalNudges, setEnableReEvalNudges] = useState<boolean>(() =>
    ClinicOperationsService.isReEvalNudgesEnabled()
  );
  const [reEvalConfig, setReEvalConfig] = useState(() =>
    ClinicOperationsService.getReEvalNudgeConfig()
  );
  const [enableNoteCompletenessCheck, setEnableNoteCompletenessCheck] = useState<boolean>(() =>
    ClinicOperationsService.isNoteCompletenessCheckEnabled()
  );
  const [enablePerformanceTestLibrary, setEnablePerformanceTestLibrary] = useState<boolean>(() =>
    ClinicOperationsService.isPerformanceTestLibraryEnabled()
  );
  const [modalityReviewStatus, setModalityReviewStatus] = useState(() =>
    ClinicOperationsService.getModalitySafetyReviewStatus()
  );
  const [reviewerNameDraft, setReviewerNameDraft] = useState<string>(
    () => ClinicOperationsService.getModalitySafetyReviewStatus().reviewedBy || ''
  );
  const [enableVitalsModule, setEnableVitalsModule] = useState<boolean>(() =>
    ClinicOperationsService.isVitalsModuleEnabled()
  );
  const [enablePediatricSafeguards, setEnablePediatricSafeguards] = useState<boolean>(() =>
    ClinicOperationsService.isPediatricSafeguardsEnabled()
  );
  const [showSafetyRules, setShowSafetyRules] = useState<boolean>(false);

  useEffect(() => {
    const syncPhaseB = () => {
      setEnableProblemListGoals(ClinicOperationsService.isProblemListGoalsEnabled());
      setEnableReEvalNudges(ClinicOperationsService.isReEvalNudgesEnabled());
      setReEvalConfig(ClinicOperationsService.getReEvalNudgeConfig());
      setEnableNoteCompletenessCheck(ClinicOperationsService.isNoteCompletenessCheckEnabled());
      setEnablePerformanceTestLibrary(ClinicOperationsService.isPerformanceTestLibraryEnabled());
      const modReview = ClinicOperationsService.getModalitySafetyReviewStatus();
      setModalityReviewStatus(modReview);
      setReviewerNameDraft((prev) => (modReview.reviewedBy && !prev ? modReview.reviewedBy : prev));
      setEnableVitalsModule(ClinicOperationsService.isVitalsModuleEnabled());
      setEnablePediatricSafeguards(ClinicOperationsService.isPediatricSafeguardsEnabled());
    };
    if (isModalOpen) {
      syncPhaseB();
    }
    const unsubOps = ClinicOperationsService.subscribe(syncPhaseB);
    window.addEventListener('physiorecord-modules-updated', syncPhaseB);
    return () => {
      unsubOps();
      window.removeEventListener('physiorecord-modules-updated', syncPhaseB);
    };
  }, [isModalOpen]);

  const activeCount = [
    enableProblemListGoals,
    enableReEvalNudges,
    enableNoteCompletenessCheck,
    enablePerformanceTestLibrary,
    modalityReviewStatus.enabled,
    enableVitalsModule,
    enablePediatricSafeguards,
  ].filter(Boolean).length;

  return (
    <SettingsAccordion
      icon={<Activity className="size-4" />}
      title={bi('سير العمل السريري والسلامة', 'Clinical Workflow & Safety', 'کارکردنی کلینیکی و سەلامەتی')}
      meta={bi(`مفعّل ${activeCount} من 7`, `${activeCount} of 7 active`, `${activeCount} لە 7 چالاکە`)}
      open={isOpen}
      onOpenChange={onOpenChange}
    >
      <div>
        <SettingsSwitchRow
          testId="toggle-problem-list-goals-btn"
          title={bi('قائمة المشاكل والأهداف المرتبطة بالمقاييس', 'Problem List & Outcome-Linked Goals', 'لیستی کێشەکان و ئامانجەکان')}
          description={bi(
            'ربط الأهداف بمقاييس (ODI / NPRS / LEFS) مع حساب التحسن التلقائي MCID.',
            'Link episode goals to ODI/NPRS/LEFS baselines with automatic MCID status.',
            'بەستنەوەی ئامانجەکان بە پێوەرەکانەوە لەگەڵ هەژمارکردنی باشتربوون.'
          )}
          checked={enableProblemListGoals}
          onLabel={bi('مفعّلة', 'Enabled', 'چالاکە')}
          offLabel={bi('معطّلة', 'Off', 'ناچالاکە')}
          onChange={(next) => {
            ClinicOperationsService.setProblemListGoalsEnabled(next);
            setEnableProblemListGoals(next);
          }}
        />

        <SettingsSwitchRow
          testId="toggle-reeval-nudges-btn"
          title={bi('تنبيهات استحقاق إعادة التقييم', 'Re-Evaluation Nudges', 'ئاگادارکردنەوەی دووبارە هەڵسەنگاندن')}
          description={bi(
            'تُظهر شارة هادئة عند تجاوز عدد الجلسات أو الأيام المحددة دون إعادة تقييم.',
            'Surfaces a subtle badge in Today & Patient Chart after N sessions or D days.',
            'نیشانەیەک پیشان دەدات کاتێک ژمارەی دانیشتن یان ڕۆژە دیاریکراوەکان تێدەپەڕێنرێت.'
          )}
          checked={enableReEvalNudges}
          onLabel={bi('مفعّلة', 'Enabled', 'چالاکە')}
          offLabel={bi('معطّلة افتراضياً', 'Off (Default)', 'بە بنەڕەتی ناچالاکە')}
          onChange={(next) => {
            ClinicOperationsService.setReEvalNudgesEnabled(next);
            setEnableReEvalNudges(next);
          }}
        >
          {enableReEvalNudges && (
            <div className="grid grid-cols-2 gap-2.5 p-3 rounded-xl bg-surface border border-line-2">
              <div>
                <label htmlFor="reeval-sessions-input" className="block text-xs font-semibold text-foreground mb-1">
                  {bi('بعد عدد جلسات', 'After Sessions', 'دوای ژمارەی دانیشتن')}
                </label>
                <input
                  id="reeval-sessions-input"
                  type="number"
                  min={1}
                  max={50}
                  dir="ltr"
                  data-testid="reeval-sessions-input"
                  value={reEvalConfig.afterSessions}
                  onChange={(e) => {
                    const n = Math.max(1, Math.min(50, Number(e.target.value) || 1));
                    setReEvalConfig((prev) => ({ ...prev, afterSessions: n }));
                    ClinicOperationsService.setReEvalNudgeConfig(n, reEvalConfig.afterDays);
                  }}
                  className="w-full px-3 py-1.5 rounded-xl bg-layer border border-layer-line text-xs font-bold tabular-nums text-foreground"
                />
              </div>
              <div>
                <label htmlFor="reeval-days-input" className="block text-xs font-semibold text-foreground mb-1">
                  {bi('أو بعد عدد أيام', 'Or After Days', 'یان دوای ڕۆژ')}
                </label>
                <input
                  id="reeval-days-input"
                  type="number"
                  min={1}
                  max={180}
                  dir="ltr"
                  data-testid="reeval-days-input"
                  value={reEvalConfig.afterDays}
                  onChange={(e) => {
                    const d = Math.max(1, Math.min(180, Number(e.target.value) || 1));
                    setReEvalConfig((prev) => ({ ...prev, afterDays: d }));
                    ClinicOperationsService.setReEvalNudgeConfig(reEvalConfig.afterSessions, d);
                  }}
                  className="w-full px-3 py-1.5 rounded-xl bg-layer border border-layer-line text-xs font-bold tabular-nums text-foreground"
                />
              </div>
            </div>
          )}
        </SettingsSwitchRow>

        <SettingsSwitchRow
          testId="toggle-completeness-check-btn"
          title={bi('فحص اكتمال الملاحظة السريرية', 'Note Completeness Check', 'پشکنینی تەواوبوونی تێبینی')}
          description={bi(
            'يعرض البنود الناقصة قبل اعتماد الجلسة مع إمكانية الاعتماد على أي حال.',
            'Shows missing items before sign-off while allowing Finalize anyway.',
            'بڕگە کەمەکان پیشان دەدات پێش پەسەندکردنی دانیشتن.'
          )}
          checked={enableNoteCompletenessCheck}
          onLabel={bi('مفعّلة', 'Enabled', 'چالاکە')}
          offLabel={bi('معطّلة', 'Off', 'ناچالاکە')}
          onChange={(next) => {
            ClinicOperationsService.setNoteCompletenessCheckEnabled(next);
            setEnableNoteCompletenessCheck(next);
          }}
        />

        <SettingsSwitchRow
          testId="toggle-performance-library-btn"
          title={bi('مكتبة اختبارات الأداء الوظيفي', 'Functional Performance-Test Library', 'کتێبخانەی تاقیکردنەوەکانی کارایی')}
          description={bi(
            'اختبارات LSI / 10MWT / 6MWT / 30s-CST / 5xSTS / Grip مع متابعة التقدم.',
            'LSI, 10MWT, 6MWT, SLS, 30s-CST, 5xSTS, and Grip test logging.',
            'تاقیکردنەوەکانی LSI / 10MWT / 6MWT / 30s-CST / 5xSTS / Grip.'
          )}
          checked={enablePerformanceTestLibrary}
          onLabel={bi('مفعّلة', 'Enabled', 'چالاکە')}
          offLabel={bi('معطّلة', 'Off', 'ناچالاکە')}
          onChange={(next) => {
            ClinicOperationsService.setPerformanceTestLibraryEnabled(next);
            setEnablePerformanceTestLibrary(next);
          }}
        />

        <SettingsSwitchRow
          testId="toggle-vitals-module-btn"
          title={bi('العلامات الحيوية واتجاهاتها', 'Session Vitals & Trend Chart', 'نیشانە زیندەییەکان و هێڵکاری')}
          description={bi(
            'تسجيل ضغط الدم والنبض وSpO2 مع تنبيهات عتبات قابلة للتعديل.',
            'Record BP, HR, and SpO2 with editable clinical alert thresholds.',
            'تۆمارکردنی پەستانی خوێن، لێدانی دڵ و SpO2.'
          )}
          checked={enableVitalsModule}
          onLabel={bi('مفعّلة', 'Enabled', 'چالاکە')}
          offLabel={bi('معطّلة', 'Off', 'ناچالاکە')}
          onChange={(next) => {
            ClinicOperationsService.setVitalsModuleEnabled(next);
            setEnableVitalsModule(next);
          }}
        />

        <SettingsSwitchRow
          testId="toggle-pediatric-safeguards-btn"
          title={bi('ضوابط حماية الأطفال والقُصّر (< 18 سنة)', 'Pediatric Guardian Safeguards (< 18 yrs)', 'پاراستنی منداڵان و ناکامان (< 18 ساڵ)')}
          description={bi(
            'إلزام بيانات وموافقة ولي الأمر عند تسجيل مريض دون 18 عاماً.',
            'Requires guardian contact and consent for patients under 18.',
            'داواکردنی زانیاری و ڕەزامەندی سەرپەرشتیار بۆ نەخۆشی خوار 18 ساڵ.'
          )}
          checked={enablePediatricSafeguards}
          onLabel={bi('مفعّلة', 'Enabled', 'چالاکە')}
          offLabel={bi('معطّلة', 'Off', 'ناچالاکە')}
          onChange={(next) => {
            ClinicOperationsService.setPediatricSafeguardsEnabled(next);
            setEnablePediatricSafeguards(next);
          }}
        />
      </div>

      {/* Modality Safety Checker (Requires Senior PT Review Sign-Off) */}
      <div className="p-3.5 rounded-xl bg-rose-500/5 border border-rose-500/25 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            <AlertTriangle className="size-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <span>
              {bi(
                'قواعد سلامة الأجهزة الكهربائية والفيزيائية',
                'Modality Contraindication Safety Rules',
                'یاساکانی سەلامەتی ئامێرە کارەبایی و فیزیایییەکان'
              )}
            </span>
          </div>
          <span
            data-testid="modality-safety-status-badge"
            className={`text-xs font-bold ${
              modalityReviewStatus.enabled
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-amber-700 dark:text-amber-400'
            }`}
          >
            {modalityReviewStatus.enabled
              ? bi('مراجَع ومفعّل', 'Reviewed & Active', 'پێداچوونەوەی بۆ کراوە و چالاکە')
              : bi('معطّل حتى مراجعة معالج أول', 'Disabled until reviewed by Senior PT', 'ناچالاکە تا پێداچوونەوەی چارەسەرکاری باڵا')}
          </span>
        </div>

        <p className="text-xs text-muted-foreground-1 leading-relaxed">
          {bi(
            'يفحص التداخل بين الأجهزة العلاجية (TENS، NMES، IFC، الأمواج فوق الصوتية، SWD، الحرارة، البرودة، الشد، والإبر الجافة) ومحاذير المريض السريرية. تبقى الميزة معطّلة حتى مراجعة هذه القواعد وتوثيق اسم المعالج أدناه.',
            'Cross-checks physical agents (TENS, NMES, IFC, Ultrasound, SWD, Heat, Cryo, Traction, Dry Needling) against patient precautions (pacemaker, pregnancy, DVT, malignancy, metal) after Senior PT sign-off.',
            'پشکنینی گونجاوی لە نێوان ئامێرە فیزیایییەکان و ڕێگرییەکانی نەخۆش دەکات دوای پێداچوونەوە و پەسەندکردنی چارەسەرکاری باڵا.'
          )}
        </p>

        <div>
          <button
            type="button"
            aria-expanded={showSafetyRules}
            data-testid="modality-safety-view-rules-btn"
            onClick={() => setShowSafetyRules((prev) => !prev)}
            className="compact-btn inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/15 text-xs font-bold text-rose-700 dark:text-rose-300 cursor-pointer transition-colors"
          >
            <span>
              {showSafetyRules
                ? bi(
                    `إخفاء المعايير والقواعد (${MODALITY_SAFETY_RULES.length})`,
                    `Hide Safety Rules (${MODALITY_SAFETY_RULES.length})`,
                    `شاردنەوەی یاساکان (${MODALITY_SAFETY_RULES.length})`
                  )
                : bi(
                    `عرض المعايير والقواعد السريرية (${MODALITY_SAFETY_RULES.length} قاعدة)`,
                    `View Clinical Safety Rules (${MODALITY_SAFETY_RULES.length})`,
                    `پیشاندانی یاسا و پێوەرە کلینیکییەکان (${MODALITY_SAFETY_RULES.length})`
                  )}
            </span>
            <ChevronDown
              className={`size-3.5 transition-transform duration-200 ${
                showSafetyRules ? 'rotate-180' : ''
              }`}
            />
          </button>

          {showSafetyRules && (
            <div
              data-testid="modality-safety-rules-list"
              className="mt-2.5 max-h-72 overflow-y-auto rounded-xl bg-card border border-card-line divide-y divide-card-divider"
            >
              {MODALITY_SAFETY_RULES.map((rule) => {
                const isAbsolute = rule.severity === 'absolute_contraindication';
                return (
                  <div key={rule.id} className="p-3 space-y-1.5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-foreground">
                        {bi(rule.titleAr, rule.titleEn, rule.titleAr)}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md font-bold text-xs ${
                          isAbsolute
                            ? 'bg-rose-500/12 text-rose-700 dark:text-rose-300'
                            : 'bg-amber-500/12 text-amber-800 dark:text-amber-300'
                        }`}
                      >
                        {isAbsolute
                          ? bi('مانع مطلق', 'Absolute Contraindication', 'قەدەغەکراوی ڕەها')
                          : bi('احتياط سريري', 'Precaution', 'ئاگاداربوون')}
                      </span>
                    </div>

                    <p className="text-muted-foreground-1 leading-relaxed">
                      {bi(rule.rationaleAr, rule.rationaleEn, rule.rationaleAr)}
                    </p>

                    <div className="flex flex-wrap items-center justify-between gap-1.5 pt-0.5 text-xs text-muted-foreground-2">
                      <span>
                        <strong className="text-foreground">
                          {bi('الأجهزة:', 'Modalities:', 'ئامێرەکان:')}{' '}
                        </strong>
                        {rule.modalities
                          .map((m) => bi(MODALITY_DISPLAY_AR[m] || m, m, MODALITY_DISPLAY_AR[m] || m))
                          .join(' · ')}
                      </span>
                      <span dir="ltr" className="opacity-80">
                        {rule.citation}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {modalityReviewStatus.reviewed && modalityReviewStatus.reviewedBy && (
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            {bi(
              `تمت المراجعة والاعتماد بواسطة: ${modalityReviewStatus.reviewedBy}`,
              `Reviewed by: ${modalityReviewStatus.reviewedBy}`,
              `پێداچوونەوە و پەسەندکردن لەلایەن: ${modalityReviewStatus.reviewedBy}`
            )}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            aria-label={bi('اسم المعالج المختص لاعتماد القواعد', 'Senior PT full name for sign-off', 'ناوی چارەسەرکاری باڵا بۆ پەسەندکردن')}
            data-testid="modality-safety-reviewer-input"
            value={reviewerNameDraft}
            onChange={(e) => setReviewerNameDraft(e.target.value)}
            placeholder={bi(
              'اكتب اسم المعالج للاعتماد...',
              'Senior PT full name for sign-off...',
              'ناوی چارەسەرکاری باڵا...'
            )}
            className="flex-1 min-w-[190px] px-3 py-1.5 rounded-xl bg-layer border border-layer-line text-xs text-foreground focus:outline-none focus:border-primary"
          />
          <button
            type="button"
            data-testid="modality-safety-review-enable-btn"
            disabled={!reviewerNameDraft.trim()}
            onClick={() => {
              if (!reviewerNameDraft.trim()) return;
              ClinicOperationsService.confirmModalitySafetyReview(reviewerNameDraft.trim(), true);
              setModalityReviewStatus(ClinicOperationsService.getModalitySafetyReviewStatus());
            }}
            className="min-h-[34px] py-1.5 px-3.5 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground text-xs font-bold cursor-pointer"
          >
            {bi('اعتماد وتفعيل', 'Mark Reviewed & Enable', 'پەسەندکردن و چالاککردن')}
          </button>
          {modalityReviewStatus.reviewed && (
            <button
              type="button"
              data-testid="modality-safety-toggle-active-btn"
              onClick={() => {
                ClinicOperationsService.setModalitySafetyCheckEnabled(!modalityReviewStatus.enabled);
                setModalityReviewStatus(ClinicOperationsService.getModalitySafetyReviewStatus());
              }}
              className="min-h-[34px] py-1.5 px-3 rounded-xl bg-surface border border-line-2 text-xs font-bold text-foreground cursor-pointer"
            >
              {modalityReviewStatus.enabled
                ? bi('إيقاف مؤقت', 'Pause', 'ڕاگرتن')
                : bi('تفعيل', 'Enable', 'چالاککردن')}
            </button>
          )}
        </div>
      </div>
    </SettingsAccordion>
  );
};
