import React, { useEffect, useState } from 'react';
import { Activity, AlertTriangle } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { ClinicOperationsService } from '../../services/clinicOperationsService';

interface ModulesClinicalSafetySectionProps {
  isModalOpen: boolean;
}

export const ModulesClinicalSafetySection: React.FC<ModulesClinicalSafetySectionProps> = ({
  isModalOpen,
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

  return (
    <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-bold text-foreground">
          <Activity className="size-4 text-primary" />
          <span>
            {bi(
              'وحدات سير العمل السريري السريع والسلامة (Phase B)',
              'Clinical Workflow & Safety Modules (Phase B)',
              'بەشەکانی کارکردنی خێرای کلینیکی و سەلامەتی (Phase B)'
            )}
          </span>
        </div>
      </div>

      {/* B2: Problem List & Outcome-Linked Goals */}
      <div className="p-3 rounded-xl bg-layer/60 border border-layer-line flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold text-foreground">
            {bi(
              'قائمة المشاكل والأهداف المرتبطة بالمقاييس (B2)',
              'Problem List & Outcome-Linked Goals (B2)',
              'لیستی کێشەکان و ئامانجە بەستراوەکان بە پێوەرەکانەوە (B2)'
            )}
          </p>
          <p className="text-xs text-muted-foreground-1">
            {bi(
              'ربط الأهداف بمقاييس (ODI / NPRS / LEFS) مع حساب التحسن التلقائي MCID.',
              'Link episode goals to ODI/NPRS/LEFS baselines with automatic MCID status.',
              'بەستنەوەی ئامانجەکان بە پێوەرەکانی (ODI / NPRS / LEFS) لەگەڵ هەژمارکردنی خۆکاری باشتربوون (MCID).'
            )}
          </p>
        </div>
        <button
          type="button"
          data-testid="toggle-problem-list-goals-btn"
          onClick={() => {
            const next = !enableProblemListGoals;
            ClinicOperationsService.setProblemListGoalsEnabled(next);
            setEnableProblemListGoals(next);
          }}
          className={`shrink-0 py-1.5 px-3 rounded-xl text-xs font-bold cursor-pointer ${
            enableProblemListGoals
              ? 'bg-emerald-600 text-white'
              : 'bg-surface border border-layer-line text-foreground'
          }`}
        >
          {enableProblemListGoals ? bi('مفعّلة', 'Enabled', 'چالاکە') : bi('معطّلة', 'Off', 'ناچالاکە')}
        </button>
      </div>

      {/* B3: Re-Evaluation Nudges (OFF BY DEFAULT) */}
      <div className="p-3 rounded-xl bg-layer/60 border border-layer-line space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold text-foreground">
              {bi(
                'تنبيهات استحقاق إعادة التقييم (B3)',
                'Re-Evaluation Nudges (B3)',
                'ئاگادارکردنەوەی کاتی دووبارە هەڵسەنگاندن (B3)'
              )}
            </p>
            <p className="text-xs text-muted-foreground-1">
              {bi(
                'مغلقة افتراضياً — تُظهر شارة في قائمة اليوم والملف السريري عند تجاوز عدد الجلسات أو الأيام المحددة.',
                'Off by default — surfaces a non-intrusive badge in Today Command & Patient Chart after N sessions or D days.',
                'بە بنەڕەتی ناچالاکە — نیشانەیەکی هێمن لە لیستی ئەمڕۆ و دۆسیەی نەخۆشدا پیشان دەدات کاتێک ژمارەی دانیشتن یان ڕۆژە دیاریکراوەکان تێدەپەڕێنرێت.'
              )}
            </p>
          </div>
          <button
            type="button"
            data-testid="toggle-reeval-nudges-btn"
            onClick={() => {
              const next = !enableReEvalNudges;
              ClinicOperationsService.setReEvalNudgesEnabled(next);
              setEnableReEvalNudges(next);
            }}
            className={`shrink-0 py-1.5 px-3 rounded-xl text-xs font-bold cursor-pointer ${
              enableReEvalNudges
                ? 'bg-emerald-600 text-white'
                : 'bg-surface border border-layer-line text-foreground'
            }`}
          >
            {enableReEvalNudges
              ? bi('مفعّلة', 'Enabled', 'چالاکە')
              : bi('معطّلة افتراضياً', 'Off (Default)', 'بە بنەڕەتی ناچالاکە')}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label htmlFor="reeval-sessions-input" className="block text-xs font-semibold text-foreground mb-1">
              {bi('عتبة عدد الجلسات (N)', 'After N Sessions', 'سنووری ژمارەی دانیشتنەکان (N)')}
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
              className="w-full px-3 py-1.5 rounded-lg bg-surface border border-layer-line text-xs text-foreground"
            />
          </div>
          <div>
            <label htmlFor="reeval-days-input" className="block text-xs font-semibold text-foreground mb-1">
              {bi('عتبة عدد الأيام (D)', 'After D Days', 'سنووری ژمارەی ڕۆژەکان (D)')}
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
              className="w-full px-3 py-1.5 rounded-lg bg-surface border border-layer-line text-xs text-foreground"
            />
          </div>
        </div>
      </div>

      {/* B4: Note Completeness Check */}
      <div className="p-3 rounded-xl bg-layer/60 border border-layer-line flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold text-foreground">
            {bi(
              'فحص اكتمال الملاحظة غير المعطل (B4)',
              'Non-Blocking Note Completeness Check (B4)',
              'پشکنینی تەواوبوونی تێبینی بێ ڕێگریکردن (B4)'
            )}
          </p>
          <p className="text-xs text-muted-foreground-1">
            {bi(
              'يعرض البنود الناقصة قبل اعتماد الجلسة مع إمكانية الاعتماد على أي حال.',
              'Displays missing items checklist before sign-off while allowing Finalize anyway.',
              'بڕگە کەمەکان پیشان دەدات پێش پەسەندکردنی دانیشتن لەگەڵ توانای تەواوکردن لە هەموو بارێکدا.'
            )}
          </p>
        </div>
        <button
          type="button"
          data-testid="toggle-completeness-check-btn"
          onClick={() => {
            const next = !enableNoteCompletenessCheck;
            ClinicOperationsService.setNoteCompletenessCheckEnabled(next);
            setEnableNoteCompletenessCheck(next);
          }}
          className={`shrink-0 py-1.5 px-3 rounded-xl text-xs font-bold cursor-pointer ${
            enableNoteCompletenessCheck
              ? 'bg-emerald-600 text-white'
              : 'bg-surface border border-layer-line text-foreground'
          }`}
        >
          {enableNoteCompletenessCheck ? bi('مفعّلة', 'Enabled', 'چالاکە') : bi('معطّلة', 'Off', 'ناچالاکە')}
        </button>
      </div>

      {/* B5: Performance-Test Library */}
      <div className="p-3 rounded-xl bg-layer/60 border border-layer-line flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold text-foreground">
            {bi(
              'مكتبة اختبارات الأداء الوظيفي (B5)',
              'Procedural Performance-Test Library (B5)',
              'کتێبخانەی تاقیکردنەوەکانی کارایی جەستەیی (B5)'
            )}
          </p>
          <p className="text-xs text-muted-foreground-1">
            {bi(
              'LSI / 10MWT / 6MWT / 30s-CST / 5xSTS / Grip مع وسم حاجة المراجعة السريرية.',
              'LSI, 10MWT, 6MWT, SLS, 30s-CST, 5xSTS, Grip with expert verification flags.',
              'LSI / 10MWT / 6MWT / 30s-CST / 5xSTS / Grip لەگەڵ نیشانەی پێویستی پێداچوونەوەی کلینیکی.'
            )}
          </p>
        </div>
        <button
          type="button"
          data-testid="toggle-performance-library-btn"
          onClick={() => {
            const next = !enablePerformanceTestLibrary;
            ClinicOperationsService.setPerformanceTestLibraryEnabled(next);
            setEnablePerformanceTestLibrary(next);
          }}
          className={`shrink-0 py-1.5 px-3 rounded-xl text-xs font-bold cursor-pointer ${
            enablePerformanceTestLibrary
              ? 'bg-emerald-600 text-white'
              : 'bg-surface border border-layer-line text-foreground'
          }`}
        >
          {enablePerformanceTestLibrary ? bi('مفعّلة', 'Enabled', 'چالاکە') : bi('معطّلة', 'Off', 'ناچالاکە')}
        </button>
      </div>

      {/* B6: Modality Safety Checker (Disabled Until Senior PT Review) */}
      <div className="p-3 rounded-xl bg-rose-500/5 border border-rose-500/30 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            <AlertTriangle className="size-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <span>
              {bi(
                'قواعد سلامة الأجهزة الكهربائية والفيزيائية (B6)',
                'Modality Contraindication Rules (B6 — Senior PT Review Gate)',
                'یاساکانی سەلامەتی ئامێرە کارەبایی و فیزیایییەکان (B6)'
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
        <p className="text-xs text-muted-foreground-1">
          {bi(
            'تُربط أجهزة (TENS/NMES/IFC/Ultrasound/SWD/الحرارة/البرودة/الشد/الإبر) بمحاذير المريض وتبقى معطلة حتى اعتماد اسم المعالج الأقدم.',
            'Cross-checks physical agents against structured precautions (pacemaker, pregnancy, DVT, malignancy, metal) — gated on Senior PT review sign-off.',
            'ئامێرەکانی (TENS/NMES/IFC/Ultrasound/SWD/گەرمی/ساردی/کێشان/دەرزی) بە ڕێگرییەکانی نەخۆشەوە دەبەستێتەوە و تا پەسەندکردنی ناوی چارەسەرکاری باڵا ناچالاک دەمێنێتەوە.'
          )}
        </p>
        {modalityReviewStatus.reviewed && modalityReviewStatus.reviewedBy && (
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            {bi(
              `تمت المراجعة بواسطة: ${modalityReviewStatus.reviewedBy}`,
              `Reviewed by: ${modalityReviewStatus.reviewedBy}`,
              `پێداچوونەوە کراوە لەلایەن: ${modalityReviewStatus.reviewedBy}`
            )}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            aria-label={bi('اسم أخصائي العلاج الطبيعي الأقدم', 'Senior PT full name for sign-off', 'ناوی تەواوی چارەسەرکاری سروشتی باڵا')}
            data-testid="modality-safety-reviewer-input"
            value={reviewerNameDraft}
            onChange={(e) => setReviewerNameDraft(e.target.value)}
            placeholder={bi(
              'اسم أخصائي العلاج الطبيعي الأقدم...',
              'Senior PT full name for sign-off...',
              'ناوی تەواوی چارەسەرکاری سروشتی باڵا...'
            )}
            className="flex-1 min-w-[200px] px-3 py-1.5 rounded-xl bg-surface border border-layer-line text-xs text-foreground focus:outline-none focus:border-primary"
          />
          <button
            type="button"
            data-testid="modality-safety-review-enable-btn"
            disabled={!reviewerNameDraft.trim()}
            onClick={() => {
              if (!reviewerNameDraft.trim()) return;
              ClinicOperationsService.confirmModalitySafetyReview(
                reviewerNameDraft.trim(),
                true
              );
              setModalityReviewStatus(
                ClinicOperationsService.getModalitySafetyReviewStatus()
              );
            }}
            className="py-1.5 px-3.5 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground text-xs font-bold cursor-pointer"
          >
            {bi('اعتماد المراجعة والتفعيل', 'Mark Reviewed & Enable', 'پەسەندکردنی پێداچوونەوە و چالاککردن')}
          </button>
          {modalityReviewStatus.reviewed && (
            <button
              type="button"
              data-testid="modality-safety-toggle-active-btn"
              onClick={() => {
                ClinicOperationsService.setModalitySafetyCheckEnabled(
                  !modalityReviewStatus.enabled
                );
                setModalityReviewStatus(
                  ClinicOperationsService.getModalitySafetyReviewStatus()
                );
              }}
              className="py-1.5 px-3 rounded-xl bg-surface border border-layer-line text-xs font-bold text-foreground cursor-pointer"
            >
              {modalityReviewStatus.enabled
                ? bi('إيقاف مؤقت', 'Pause Rules', 'ڕاگرتنی کاتی')
                : bi('تفعيل', 'Enable', 'چالاککردن')}
            </button>
          )}
        </div>
      </div>

      {/* B7: Session Vitals Module */}
      <div className="p-3 rounded-xl bg-layer/60 border border-layer-line flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold text-foreground">
            {bi(
              'وحدة العلامات الحيوية واتجاهاتها (B7)',
              'Session Vitals & Trend Chart (B7)',
              'بەشی نیشانە زیندەییەکان و هێڵکاری گۆڕانکارییەکان (B7)'
            )}
          </p>
          <p className="text-xs text-muted-foreground-1">
            {bi(
              'تسجيل ضغط الدم والنبض وSpO2 مع تنبيهات عتبات قابلة للتعديل.',
              'Record BP, HR, SpO2 with editable AHA/ACSM alert thresholds.',
              'تۆمارکردنی پەستانی خوێن، لێدانی دڵ و SpO2 لەگەڵ ئاگادارکەرەوەی سنوورە گۆڕاوەکان.'
            )}
          </p>
        </div>
        <button
          type="button"
          data-testid="toggle-vitals-module-btn"
          onClick={() => {
            const next = !enableVitalsModule;
            ClinicOperationsService.setVitalsModuleEnabled(next);
            setEnableVitalsModule(next);
          }}
          className={`shrink-0 py-1.5 px-3 rounded-xl text-xs font-bold cursor-pointer ${
            enableVitalsModule
              ? 'bg-emerald-600 text-white'
              : 'bg-surface border border-layer-line text-foreground'
          }`}
        >
          {enableVitalsModule ? bi('مفعّلة', 'Enabled', 'چالاکە') : bi('معطّلة', 'Off', 'ناچالاکە')}
        </button>
      </div>

      {/* B8: Pediatric Safeguards */}
      <div className="p-3 rounded-xl bg-layer/60 border border-layer-line space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold text-foreground">
              {bi(
                'ضوابط حماية الأطفال والقُصّر < 18 سنة (B8)',
                'Pediatric Guardian Safeguards < 18 yrs (B8)',
                'یاساکانی پاراستنی منداڵان و ناکامان < 18 ساڵ (B8)'
              )}
            </p>
            <p className="text-xs text-muted-foreground-1">
              {bi(
                'إلزام بيانات وموافقة ولي الأمر عند تسجيل مريض دون 18 عاماً أو توقيع الإقرار.',
                'Requires guardian contact & consent for patients under 18.',
                'داواکردنی زانیاری و ڕەزامەندی سەرپەرشتیار لە کاتی تۆمارکردنی نەخۆشی خوار 18 ساڵ یان واژۆکردنی ڕەزامەندیدا.'
              )}
            </p>
          </div>
          <button
            type="button"
            data-testid="toggle-pediatric-safeguards-btn"
            onClick={() => {
              const next = !enablePediatricSafeguards;
              ClinicOperationsService.setPediatricSafeguardsEnabled(next);
              setEnablePediatricSafeguards(next);
            }}
            className={`shrink-0 py-1.5 px-3 rounded-xl text-xs font-bold cursor-pointer ${
              enablePediatricSafeguards
                ? 'bg-emerald-600 text-white'
                : 'bg-surface border border-layer-line text-foreground'
            }`}
          >
            {enablePediatricSafeguards ? bi('مفعّلة', 'Enabled', 'چالاکە') : bi('معطّلة', 'Off', 'ناچالاکە')}
          </button>
        </div>
      </div>
    </div>
  );
};
