import React, { Suspense, lazy } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import { ClinicOperationsService } from '../../../services/clinicOperationsService';
import type { PatientRecord } from '../../../types/clinical';
import type { EpisodeScopedClinicalStore } from '../../../types/clinicManagement';
import { computePatientAge } from '../../../utils/date';
import { AutoResizeTextarea, NprsControl } from '../../ui/Primitives';

const ExamPresetBar = lazy(() =>
  import('../ExamPresetBar').then((m) => ({ default: m.ExamPresetBar }))
);
const EpisodeProblemListGoalsPanel = lazy(() =>
  import('../EpisodeProblemListGoalsPanel').then((m) => ({
    default: m.EpisodeProblemListGoalsPanel,
  }))
);
const ActiveExamCanvas = lazy(() =>
  import('../ActiveExamCanvas').then((m) => ({ default: m.ActiveExamCanvas }))
);
const VitalsPanel = lazy(() =>
  import('../VitalsPanel').then((m) => ({ default: m.VitalsPanel }))
);

export interface ChartEvaluationTabProps {
  effectiveEpisodeId: string;
  patient: PatientRecord;
  episodeStore: EpisodeScopedClinicalStore;
  setEpisodeStore: React.Dispatch<React.SetStateAction<EpisodeScopedClinicalStore>>;
  updateEpisodeField: <K extends keyof EpisodeScopedClinicalStore>(
    field: K,
    val: EpisodeScopedClinicalStore[K]
  ) => void;
  enableProblemListGoals: boolean;
  enablePerformanceTestLibrary: boolean;
  enableVitalsModule: boolean;
  onRemoveWidget: (widgetId: string) => void;
  onAddWidget: (widgetId: string) => void;
  onOpenExamShelf: () => void;
}

export const ChartEvaluationTab: React.FC<ChartEvaluationTabProps> = ({
  effectiveEpisodeId,
  patient,
  episodeStore,
  setEpisodeStore,
  updateEpisodeField,
  enableProblemListGoals,
  enablePerformanceTestLibrary,
  enableVitalsModule,
  onRemoveWidget,
  onAddWidget,
  onOpenExamShelf,
}) => {
  const { bi } = useLanguage();

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <Suspense fallback={null}>
        <ExamPresetBar
          episodeStore={episodeStore}
          onApplyStore={(next) => {
            setEpisodeStore(next);
            ClinicOperationsService.saveEpisodeClinicalStore(next);
          }}
        />
      </Suspense>

      {enableProblemListGoals && (
        <Suspense fallback={null}>
          <EpisodeProblemListGoalsPanel
            episodeStore={episodeStore}
            onUpdateStore={(patch) => {
              const next = { ...episodeStore, ...patch };
              setEpisodeStore(next);
              ClinicOperationsService.saveEpisodeClinicalStore(next);
            }}
          />
        </Suspense>
      )}

      {/* Structured Initial Evaluation Subjective & Objective Intake Card */}
      <div className="p-5 sm:p-6 rounded-2xl bg-card border border-card-line shadow-2xs space-y-4">
        <div className="border-b border-card-divider pb-3.5">
          <h2 className="text-sm font-bold text-foreground">
            {bi(
              'التقييم السريري المهيكل لحلقة الرعاية',
              'Episode-Scoped Subjective & Objective Clinical Evaluation',
              'هەڵسەنگاندنی کلینیکی پێکهاتەدار بۆ قۆناغی چاودێری'
            )}
          </h2>
        </div>

        {/* Pain NPRS Segmented Controls (Rest / Activity / Worst 24h) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 bg-surface p-3.5 rounded-xl border border-line-2">
          <NprsControl
            value={episodeStore.painAtRestNrs}
            onChange={(val) => updateEpisodeField('painAtRestNrs', val ?? 0)}
            label={bi('ألم الراحة (NPRS)', 'Pain at Rest (NPRS)', 'ئازار لە کاتی پشوو (NPRS)')}
          />
          <NprsControl
            value={episodeStore.painOnActivityNrs}
            onChange={(val) => updateEpisodeField('painOnActivityNrs', val ?? 0)}
            label={bi('الألم مع الحركة (NPRS)', 'Pain on Activity (NPRS)', 'ئازار لە کاتی جوڵە (NPRS)')}
          />
          <NprsControl
            value={episodeStore.painWorst24hNrs}
            onChange={(val) => updateEpisodeField('painWorst24hNrs', val ?? 0)}
            label={bi('أقصى ألم خلال 24 ساعة (NPRS)', 'Worst 24h Pain (NPRS)', 'توندترین ئازار لە ٢٤ کاتژمێردا (NPRS)')}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label htmlFor="eval-chief-complaint" className="text-xs font-semibold text-foreground block mb-1.5">
              {bi('الشكوى الرئيسية للمريض:', 'Chief Complaint:', 'سکاڵای سەرەکی نەخۆش:')}
            </label>
            <AutoResizeTextarea
              id="eval-chief-complaint"
              minRows={2}
              value={episodeStore.chiefComplaint}
              onChange={(e) => updateEpisodeField('chiefComplaint', e.target.value)}
              placeholder={bi(
                'مثال: ألم حاد أسفل الظهر يمتد للساق اليمنى...',
                'e.g., Sharp low back pain radiating to right leg...',
                'نموونە: ئازارێکی تیژی خوارەوەی پشت کە بەرەو قاچی ڕاست دەڕوات...'
              )}
              className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label htmlFor="eval-hpi" className="text-xs font-semibold text-foreground block mb-1.5">
              {bi('آلية الإصابة وتاريخ الحالة:', 'Mechanism of Injury & HPI:', 'میکانیزمی برینداری و مێژووی حاڵەت:')}
            </label>
            <AutoResizeTextarea
              id="eval-hpi"
              minRows={2}
              value={episodeStore.historyOfPresentIllness}
              onChange={(e) => updateEpisodeField('historyOfPresentIllness', e.target.value)}
              placeholder={bi(
                'مثال: بدأ بعد رفع جسم ثقيل قبل 3 أسابيع...',
                'e.g., Onset 3 weeks ago after heavy lifting...',
                'نموونە: ٣ هەفتە لەمەوبەر دوای هەڵگرتنی شتێکی قورس دەستی پێکرد...'
              )}
              className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label htmlFor="eval-pain-nature" className="text-xs font-semibold text-foreground block mb-1.5">
              {bi('طبيعة الألم وانتشاره:', 'Pain Quality & Pattern:', 'جۆر و بڵاوبوونەوەی ئازار:')}
            </label>
            <AutoResizeTextarea
              id="eval-pain-nature"
              minRows={2}
              value={episodeStore.painNature}
              onChange={(e) => updateEpisodeField('painNature', e.target.value)}
              placeholder={bi(
                'حارق / جذري / يزداد صباحاً...',
                'Shooting, aching, worse in morning...',
                'سووتێنەر / ڕەگی / بەیانیان زیاترە...'
              )}
              className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label htmlFor="eval-aggravating" className="text-xs font-semibold text-foreground block mb-1.5">
              {bi('العوامل المهيجة للألم:', 'Aggravating Factors:', 'هۆکارە زیادکەرەکانی ئازار:')}
            </label>
            <AutoResizeTextarea
              id="eval-aggravating"
              minRows={2}
              value={episodeStore.aggravatingFactors}
              onChange={(e) => updateEpisodeField('aggravatingFactors', e.target.value)}
              placeholder={bi(
                'مثال: الجلوس لأكثر من 20 دقيقة، الانحناء للأمام، صعود الدرج...',
                'e.g., Sitting > 20m, forward flexion, stairs...',
                'نموونە: دانیشتن زیاتر لە ٢٠ خولەک، چەمانەوە بۆ پێشەوە، سەرکەوتنی پلیکانە...'
              )}
              className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label htmlFor="eval-relieving" className="text-xs font-semibold text-foreground block mb-1.5">
              {bi('العوامل المخففة للألم:', 'Relieving Factors:', 'هۆکارە کەمکەرەوەکانی ئازار:')}
            </label>
            <AutoResizeTextarea
              id="eval-relieving"
              minRows={2}
              value={episodeStore.relievingFactors}
              onChange={(e) => updateEpisodeField('relievingFactors', e.target.value)}
              placeholder={bi(
                'مثال: الاستلقاء على الظهر، المشي الخفيف، الكمادات الدافئة...',
                'e.g., Supine lying, gentle walking, heat...',
                'نموونە: پاڵکەوتن لەسەر پشت، پیاسەکردنی سووك، گەرمی...'
              )}
              className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label htmlFor="eval-palpation" className="text-xs font-semibold text-foreground block mb-1.5">
              {bi('الجس والملاحظة السريرية:', 'Observation & Palpation:', 'تێبینی کلینیکی و دەستلێدان (Palpation):')}
            </label>
            <AutoResizeTextarea
              id="eval-palpation"
              minRows={2}
              value={episodeStore.palpationFindings}
              onChange={(e) => updateEpisodeField('palpationFindings', e.target.value)}
              placeholder={bi(
                'مثال: إيلام موضعي على L4-L5، تشنج العضلات جانب الفقار...',
                'e.g., Tenderness over L4 spinous process, paraspinal spasm...',
                'نموونە: ئازاری ناوچەیی لەسەر L4-L5، گرژبوونی ماسولکەکانی تەنیشت بڕبڕە...'
              )}
              className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
            />
          </div>
        </div>
      </div>

      {/* Active Examination Canvas Scoped to this Episode */}
      <Suspense
        fallback={
          <div className="p-6 rounded-2xl bg-card border border-card-line text-center text-xs text-muted-foreground-1">
            {bi('جاري تحميل أدوات الفحص...', 'Loading assessment tools...', 'ئامرازەکانی پشکنین بار دەکرێن...')}
          </div>
        }
      >
        <ActiveExamCanvas
          key={effectiveEpisodeId}
          activeWidgetIds={episodeStore.activeWidgetIds}
          onRemoveWidget={onRemoveWidget}
          onAddWidget={onAddWidget}
          onOpenExamShelf={onOpenExamShelf}
          bodyChart={episodeStore.bodyChart}
          onBodyChartChange={(val) => updateEpisodeField('bodyChart', val)}
          objective={episodeStore.objective}
          onObjectiveChange={(val) => updateEpisodeField('objective', val)}
          specialTests={episodeStore.specialTests}
          onSpecialTestsChange={(val) => updateEpisodeField('specialTests', val)}
          gaitPosture={episodeStore.gaitPosture}
          onGaitPostureChange={(val) => updateEpisodeField('gaitPosture', val)}
          functionalScales={episodeStore.functionalScales}
          onFunctionalScalesChange={(val) => updateEpisodeField('functionalScales', val)}
          customWidgetsData={episodeStore.customWidgetsData}
          onCustomWidgetsDataChange={(val) => updateEpisodeField('customWidgetsData', val)}
          performanceTests={episodeStore.performanceTests || []}
          onPerformanceTestsChange={(list) => updateEpisodeField('performanceTests', list)}
          patientAge={computePatientAge(patient.data.dateOfBirth, patient.data.age)}
          patientGender={patient.data.gender}
          enablePerformanceTestLibrary={enablePerformanceTestLibrary}
        />

        {enableVitalsModule && (
          <VitalsPanel
            value={episodeStore.objective?.vitals}
            history={episodeStore.vitalsHistory || []}
            onChange={(v) =>
              updateEpisodeField('objective', {
                ...episodeStore.objective,
                vitals: v,
              })
            }
          />
        )}
      </Suspense>
    </div>
  );
};
