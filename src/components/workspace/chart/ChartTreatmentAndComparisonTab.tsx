import React, { Suspense, lazy } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import type { EpisodeRecord, PatientRecord, SessionRecord } from '../../../types/clinical';
import type { EpisodeScopedClinicalStore } from '../../../types/clinicManagement';
import type { SessionPainPointInput } from '../../organui/OrganClinicalCharts';
import { AutoResizeTextarea } from '../../ui/Primitives';

const LongitudinalComparisonView = lazy(() =>
  import('../LongitudinalComparisonView').then((m) => ({
    default: m.LongitudinalComparisonView,
  }))
);
const OrganClinicalCharts = lazy(() =>
  import('../../organui/OrganClinicalCharts').then((m) => ({
    default: m.OrganClinicalCharts,
  }))
);
const SmartGoalsGasPanel = lazy(() =>
  import('../SmartGoalsGasPanel').then((m) => ({ default: m.SmartGoalsGasPanel }))
);
const ExerciseLibraryHepView = lazy(() =>
  import('../../clinic/ExerciseLibraryHepView').then((m) => ({
    default: m.ExerciseLibraryHepView,
  }))
);

export interface ChartComparisonTabProps {
  episodeStore: EpisodeScopedClinicalStore;
  activeEpisode: EpisodeRecord | null;
  episodeSessions: SessionRecord[];
  sessionPainPoints: SessionPainPointInput[];
  onSnapshotAdded: (updatedStore: EpisodeScopedClinicalStore) => void;
}

export const ChartComparisonTab: React.FC<ChartComparisonTabProps> = ({
  episodeStore,
  activeEpisode,
  episodeSessions,
  sessionPainPoints,
  onSnapshotAdded,
}) => {
  const { bi } = useLanguage();

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <Suspense
        fallback={
          <div className="p-8 rounded-2xl pr-surface text-center text-xs text-muted-foreground-1">
            {bi('جاري تحميل مصفوفة التقدم...', 'Loading progress analytics...', 'شیکارییەکانی پێشکەوتن بار دەکرێن...')}
          </div>
        }
      >
        <LongitudinalComparisonView
          episodeStore={episodeStore}
          episodeTitle={
            activeEpisode?.data.title ||
            activeEpisode?.data.medicalDiagnosis ||
            bi('حلقة الرعاية النشطة', 'Active Episode', 'قۆناغی چاودێری چالاک')
          }
          onSnapshotAdded={onSnapshotAdded}
        />

        <OrganClinicalCharts
          sessions={episodeSessions}
          masterObjective={episodeStore.objective}
          sessionPainPoints={sessionPainPoints}
          functionalScales={episodeStore.functionalScales}
          snapshots={episodeStore.snapshots}
        />
      </Suspense>
    </div>
  );
};

export interface ChartTreatmentTabProps {
  patient: PatientRecord;
  activeEpisode: EpisodeRecord | null;
  episodeStore: EpisodeScopedClinicalStore;
  showExerciseLibrary: boolean;
  updateEpisodeField: <K extends keyof EpisodeScopedClinicalStore>(
    field: K,
    val: EpisodeScopedClinicalStore[K]
  ) => void;
}

export const ChartTreatmentTab: React.FC<ChartTreatmentTabProps> = ({
  patient,
  activeEpisode,
  episodeStore,
  showExerciseLibrary,
  updateEpisodeField,
}) => {
  const { bi } = useLanguage();

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Clinical Impression, Plan of Care & Goals Surface */}
      <div className="p-4 sm:p-5 rounded-2xl pr-surface space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.045] dark:border-white/[0.06] pb-3">
          <div>
            <h2 className="text-sm font-bold text-foreground">
              {bi(
                'الانطباع السريري، خطة الرعاية، والأهداف التأهيلية',
                'Clinical Impression, Plan of Care & Rehabilitation Goals',
                'تێگەیشتنی کلینیکی، پلانی چاودێری و ئامانجەکانی ڕاهێنانەوە'
              )}
            </h2>
            <p className="text-xs text-muted-foreground-1">
              {activeEpisode ? `${activeEpisode.data.title || activeEpisode.data.medicalDiagnosis}` : ''}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="hep-treatment-frequency" className="text-xs font-semibold text-foreground block mb-1.5">
              {bi('معدل تكرار الجلسات:', 'Treatment Frequency:', 'ڕێژەی دووبارەبوونەوەی دانیشتنەکان:')}
            </label>
            <input
              id="hep-treatment-frequency"
              type="text"
              value={episodeStore.treatmentFrequency}
              onChange={(e) => updateEpisodeField('treatmentFrequency', e.target.value)}
              placeholder={bi('3 جلسات أسبوعياً', '3 sessions / week', '٣ دانیشتن لە هەفتەیەکدا')}
              className="w-full px-3 py-2 text-xs rounded-xl bg-surface/80 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
            />
          </div>

          <div>
            <label htmlFor="hep-planned-duration" className="text-xs font-semibold text-foreground block mb-1.5">
              {bi('المدة المتوقعة للخطة (بالأسابيع):', 'Planned Duration (Weeks):', 'ماوەی پێشبینیکراو (بە هەفتە):')}
            </label>
            <input
              id="hep-planned-duration"
              type="number"
              value={episodeStore.plannedDurationWeeks}
              onChange={(e) => updateEpisodeField('plannedDurationWeeks', Number(e.target.value))}
              className="w-full px-3 py-2 text-xs rounded-xl bg-surface/80 text-foreground tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/25"
            />
          </div>

          <div>
            <label htmlFor="hep-personal-goals" className="text-xs font-semibold text-foreground block mb-1.5">
              {bi('أهداف المريض الوظيفية والشخصية:', 'Patient Functional Goals:', 'ئامانجە فرمانی و کەسییەکانی نەخۆش:')}
            </label>
            <input
              id="hep-personal-goals"
              type="text"
              value={episodeStore.patientPersonalGoals}
              onChange={(e) => updateEpisodeField('patientPersonalGoals', e.target.value)}
              placeholder={bi(
                'مثال: العودة لممارسة كرة القدم، الصلاة بدون ألم...',
                'e.g., Return to sport, pain-free daily activities...',
                'نموونە: گەڕانەوە بۆ وەرزش، چالاکی ڕۆژانە بەبێ ئازار...'
              )}
              className="w-full px-3 py-2 text-xs rounded-xl bg-surface/80 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
            />
          </div>
        </div>

        {/* Optional SMART Goals & GAS (-2..+2) Module (3.3 / R6) */}
        <Suspense fallback={null}>
          <SmartGoalsGasPanel
            goals={
              episodeStore.smartGoals && episodeStore.smartGoals.length > 0
                ? episodeStore.smartGoals
                : activeEpisode?.data.structuredGoals || []
            }
            onChange={(next) => updateEpisodeField('smartGoals', next)}
          />
        </Suspense>

        <div>
          <label htmlFor="hep-clinical-impression" className="text-xs font-semibold text-foreground block mb-1.5">
            {bi(
              'الانطباع السريري والتشخيص الوظيفي وملخص التخريج:',
              'Clinical Impression & Discharge Summary:',
              'تێگەیشتنی کلینیکی، دەستنیشانکردنی فرمانی و پوختەی دەرچوون:'
            )}
          </label>
          <AutoResizeTextarea
            id="hep-clinical-impression"
            minRows={2}
            value={episodeStore.clinicalImpression}
            onChange={(e) => updateEpisodeField('clinicalImpression', e.target.value)}
            placeholder={bi(
              'تفسير الفحص السريري، المشكلات الوظيفية المحددة، ومعايير التخريج...',
              'Clinical synthesis, functional deficits, and discharge criteria...',
              'لێکدانەوەی پشکنینی کلینیکی، کێشە فرمانییەکان و پێوەرەکانی دەرچوون...'
            )}
            className="w-full px-3 py-2 text-xs rounded-xl bg-surface/80 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
          />
        </div>
      </div>

      {/* Embedded Searchable Exercise Library & HEP Builder for this Episode (Preserved when hidden) */}
      {showExerciseLibrary && (
        <Suspense
          fallback={
            <div className="p-6 rounded-2xl pr-surface text-center text-xs text-muted-foreground-1">
              {bi('جاري تحميل برنامج التمارين...', 'Loading exercise program...', 'بەرنامەی ڕاهێنانەکان بار دەکرێت...')}
            </div>
          }
        >
          <ExerciseLibraryHepView
            embeddedHepProgram={episodeStore.hepProgram}
            onUpdateEmbeddedHep={(updatedHep) => updateEpisodeField('hepProgram', updatedHep)}
            patient={patient}
            patientName={patient.data.fullNameAr || patient.data.fullName}
            patientPhone={patient.data.phoneNumber || patient.data.phone || ''}
            episode={activeEpisode}
            episodeTitle={activeEpisode?.data.title || activeEpisode?.data.medicalDiagnosis}
          />
        </Suspense>
      )}
    </div>
  );
};
