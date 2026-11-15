// =======================================================================
// PhysioRecord — Longitudinal Clinical Comparison Matrix
// Side-by-Side Comparison Across Initial Evaluation -> Re-evaluations -> Discharge
// =======================================================================

import React, { useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import { formatDateDDMMYYYY } from '../../utils/date';
import { Fraction, ClinicalAbbr } from '../ui/Primitives';
import {
  resolveLongitudinalMmtGroupKey,
  resolveLongitudinalRomGroupKey,
} from '../../data/clinicalToolkit/canonicalKeysCatalog';
import { evaluateBaselineChange } from '../../utils/outcomeMeasures';
import type {
  EpisodeScopedClinicalStore,
  ClinicalAssessmentSnapshot,
} from '../../types/clinicManagement';
import {
  Plus,
  CheckCircle2,
  FileBarChart,
} from 'lucide-react';

interface LongitudinalComparisonViewProps {
  episodeStore: EpisodeScopedClinicalStore;
  episodeTitle: string;
  onSnapshotAdded: (updatedStore: EpisodeScopedClinicalStore) => void;
}

export const LongitudinalComparisonView: React.FC<LongitudinalComparisonViewProps> = ({
  episodeStore,
  episodeTitle,
  onSnapshotAdded,
}) => {
  const { language, bi, isRtl } = useLanguage();

  const [snapshotType, setSnapshotType] =
    useState<ClinicalAssessmentSnapshot['snapshotType']>('initial_evaluation');
  const [justRecorded, setJustRecorded] = useState(false);

  const snapshots = episodeStore.snapshots || [];

  const handleCaptureSnapshot = () => {
    ClinicOperationsService.recordEpisodeSnapshot(
      episodeStore.episodeId,
      episodeStore.patientId,
      snapshotType
    );
    const refreshed = ClinicOperationsService.getEpisodeClinicalStore(
      episodeStore.episodeId,
      episodeStore.patientId
    );
    onSnapshotAdded(refreshed);
    setJustRecorded(true);
    setTimeout(() => setJustRecorded(false), 2500);
  };

  // Collect all unique ROM keys and MMT keys across snapshots + current live store
  const currentRomEntries = (episodeStore.objective?.romBattery?.entries || []).filter(
    (r) => r.isTested && r.measuredAngleDegrees !== null
  );
  const currentMmtEntries = (episodeStore.objective?.mmtBattery?.entries || []).filter(
    (m) => m.isTested && m.gradeValue !== null
  );

  const uniqueRomKeys = Array.from(
    new Set([
      ...snapshots.flatMap((s) =>
        s.romSummary.map((r) => resolveLongitudinalRomGroupKey(r))
      ),
      ...currentRomEntries.map((r) =>
        resolveLongitudinalRomGroupKey({
          canonicalKey: r.canonicalKey,
          jointMovementKey: `${r.jointId}_${r.movementId}_${r.laterality}`,
          laterality: r.laterality,
        })
      ),
    ])
  );

  const uniqueMmtKeys = Array.from(
    new Set([
      ...snapshots.flatMap((s) =>
        s.mmtSummary.map((m) => resolveLongitudinalMmtGroupKey(m))
      ),
      ...currentMmtEntries.map((m) =>
        resolveLongitudinalMmtGroupKey({
          canonicalKey: m.canonicalKey,
          muscleKey: `${m.muscleGroupId}_${m.laterality}`,
          label: m.label || m.muscleNameEn || m.muscleNameAr,
          laterality: m.laterality,
        })
      ),
    ])
  );

  const firstSnapshot = snapshots[0];
  const currentPainActivity = episodeStore.painOnActivityNrs ?? 5;
  const baselinePainActivity = firstSnapshot?.painNrsActivity ?? currentPainActivity;
  const painDelta = baselinePainActivity - currentPainActivity;
  const outcomeEval =
    firstSnapshot?.outcomeScale && episodeStore.functionalScales
      ? evaluateBaselineChange(
          episodeStore.functionalScales.scaleId,
          firstSnapshot.outcomeScale.rawScore ?? firstSnapshot.outcomeScale.scorePercentage,
          episodeStore.functionalScales.rawScore ?? episodeStore.functionalScales.scorePercentage,
          firstSnapshot.outcomeScale.scorePercentage,
          episodeStore.functionalScales.scorePercentage,
          episodeStore.functionalScales.customMeasureConfig
        )
      : null;

  return (
    <div className="space-y-5" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header & Capture Snapshot Action Card */}
      <div className="p-5 sm:p-6 rounded-2xl bg-card border border-card-line shadow-2xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="size-10 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
            <FileBarChart className="size-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-foreground">
              {bi(
                'مصفوفة المقارنة السريرية الطولية',
                'Longitudinal Clinical Comparison Matrix (Baseline vs. Re-evals vs. Current)',
                'ماتریکسی بەراوردکردنی کلینیکی درێژخایەن (بنەڕەتی لەگەڵ دووبارە هەڵسەنگاندن و ئێستا)'
              )}
            </h2>
            <p className="text-xs text-muted-foreground-1 mt-0.5">
              {language === 'ar' ? (
                <>
                  مقارنة قياسات المدى الحركي <ClinicalAbbr code="ROM" />، القوة العضلية <ClinicalAbbr code="MMT" />، شدة الألم <ClinicalAbbr code="NPRS" />، ومقاييس الإعاقة لحلقة الرعاية: {episodeTitle}
                </>
              ) : language === 'ckb' ? (
                <>
                  بەراوردکردنی پێوانەکانی مەودای جوڵە <ClinicalAbbr code="ROM" />، هێزی ماسولکە <ClinicalAbbr code="MMT" />، توندی ئازار <ClinicalAbbr code="NPRS" /> و پێوانەکانی پەککەوتەیی بۆ قۆناغی: {episodeTitle}
                </>
              ) : (
                `Side-by-side progression tracking for ${episodeTitle}`
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label={bi('نوع اللقطة المرجعية', 'Snapshot type', 'جۆری وێنەگرتن')}
            value={snapshotType}
            onChange={(e) =>
              setSnapshotType(e.target.value as ClinicalAssessmentSnapshot['snapshotType'])
            }
            className="px-3 py-2 text-xs font-semibold rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
          >
            <option value="initial_evaluation">
              {bi('التقييم الأولي المرجعي', 'Initial Evaluation (Baseline)', 'هەڵسەنگاندنی سەرەتایی (بنەڕەتی)')}
            </option>
            <option value="re_evaluation">
              {bi('إعادة تقييم مرحلي', 'Re-evaluation Snapshot', 'وێنەگرتنی دووبارە هەڵسەنگاندن')}
            </option>
            <option value="follow_up">
              {bi('متابعة سريرية', 'Follow-up Snapshot', 'وێنەگرتنی بەدواداچوونی کلینیکی')}
            </option>
            <option value="discharge">
              {bi('تقييم التخريج الختامي', 'Discharge Evaluation', 'هەڵسەنگاندنی کۆتایی دەرچوون')}
            </option>
          </select>

          <button
            type="button"
            onClick={handleCaptureSnapshot}
            className={`py-2 px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs cursor-pointer whitespace-nowrap transition-colors ${
              justRecorded
                ? 'bg-emerald-600 text-white'
                : 'bg-primary hover:bg-primary-hover text-primary-foreground'
            }`}
          >
            {justRecorded ? (
              <>
                <CheckCircle2 className="size-4" />
                <span>{bi('تم توثيق القراءات بالمصفوفة!', 'Snapshot Captured!', 'پێوانەکان لە ماتریکسدا تۆمارکران!')}</span>
              </>
            ) : (
              <>
                <Plus className="size-4" />
                <span>
                  {bi(
                    '+ تثبيت القراءات الحالية في جدول المقارنة',
                    '+ Capture Current Exam Snapshot',
                    '+ تۆمارکردنی پێوانەکانی ئێستا لە خشتەی بەراورددا'
                  )}
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Longitudinal Comparison Table or Clear Empty State */}
      {snapshots.length === 0 ? (
        <div className="bg-card rounded-2xl border border-card-line shadow-2xs p-10 text-center space-y-3">
          <div className="size-12 rounded-2xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center mx-auto">
            <FileBarChart className="size-6" />
          </div>
          <h3 className="text-sm font-bold text-foreground">
            {bi('التقط قراءة مرجعية للمقارنة', 'Capture a snapshot to compare', 'پێوانەیەکی بنەڕەتی تۆمار بکە بۆ بەراوردکردن')}
          </h3>
          <p className="text-xs text-muted-foreground-1 max-w-md mx-auto leading-relaxed">
            {bi(
              'لم يتم حفظ أي قراءة مرجعية (Baseline) لحلقة الرعاية هذه بعد. اضغط على الزر أعلاه لتثبيت القراءات الحالية ومقارنة التحسن بمرور الجلسات.',
              'No baseline snapshot has been recorded for this episode yet. Capture a snapshot to compare Baseline, Current, and Change across sessions.',
              'هێشتا هیچ پێوانەیەکی بنەڕەتی (Baseline) بۆ ئەم قۆناغە تۆمار نەکراوە. کلیک لە دوگمەکەی سەرەوە بکە بۆ تۆمارکردن و بەراوردکردنی بەرەوپێشچوون.'
            )}
          </p>
          <div className="pt-1">
            <button
              type="button"
              onClick={handleCaptureSnapshot}
              className="py-2 px-4 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Plus className="size-4" />
              <span>{bi('التقط قراءة مرجعية للمقارنة', 'Capture a snapshot to compare', 'پێوانەیەکی بنەڕەتی تۆمار بکە بۆ بەراوردکردن')}</span>
            </button>
          </div>
        </div>
      ) : (
      <div className="bg-card rounded-2xl border border-card-line shadow-2xs overflow-hidden">
        <div
          tabIndex={0}
          aria-label={bi('جدول المقارنة السريرية', 'Clinical comparison table', 'خشتەی بەراوردی کلینیکی')}
          className="overflow-x-auto focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <table className="min-w-full divide-y divide-card-divider text-start text-xs">
            <thead className="bg-muted/50">
              <tr className="text-muted-foreground-1 font-semibold uppercase tracking-wider text-xs">
                <th className="py-3.5 px-4 text-start min-w-[210px]">
                  {bi('المعيار السريري / المفصل', 'Clinical Parameter / Joint', 'پێوەری کلینیکی / جومگە')}
                </th>
                {snapshots.map((snap, idx) => (
                  <th key={snap.id} className="py-3.5 px-4 text-start min-w-[140px]">
                    <div className="text-foreground">
                      {idx === 0
                        ? bi('خط الأساس (Baseline)', 'Baseline', 'بنەڕەتی (Baseline)')
                        : bi(snap.labelAr, snap.labelEn)}
                    </div>
                    <div className="text-xs text-muted-foreground-1 tabular-nums">
                      <bdi dir="ltr">{formatDateDDMMYYYY(snap.recordedDate)}</bdi>
                    </div>
                  </th>
                ))}
                <th className="py-3.5 px-4 text-start min-w-[150px] bg-primary/10">
                  <div className="text-primary">
                    {bi('الحالي (Current)', 'Current', 'ئێستا (Current)')}
                  </div>
                  <div className="text-xs text-muted-foreground-1">
                    {bi('محدث الآن', 'Active Chart', 'تۆماری چالاک')}
                  </div>
                </th>
                <th className="py-3.5 px-4 text-end min-w-[120px]">
                  {bi('التغير (Change)', 'Change', 'گۆڕانکاری (Change)')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-divider tabular-nums">
              {/* Row 1: Pain NPRS at Rest */}
              <tr className="hover:bg-muted/20">
                <td className="py-3 px-4 font-bold text-foreground">
                  {language === 'ar' ? (
                    <>
                      شدة الألم أثناء الراحة <ClinicalAbbr code="NPRS" className="text-xs text-muted-foreground-1 ms-1" />
                    </>
                  ) : language === 'ckb' ? (
                    <>
                      توندی ئازار لە کاتی پشوودا <ClinicalAbbr code="NPRS" className="text-xs text-muted-foreground-1 ms-1" />
                    </>
                  ) : (
                    'Pain at Rest (NPRS 0–10)'
                  )}
                </td>
                {snapshots.map((snap) => (
                  <td key={snap.id} className="py-3 px-4 text-muted-foreground-2">
                    <Fraction value={snap.painNrsRest} total={10} />
                  </td>
                ))}
                <td className="py-3 px-4 font-bold text-primary bg-primary/5">
                  <Fraction value={episodeStore.painAtRestNrs ?? 0} total={10} />
                </td>
                <td className="py-3 px-4 text-end font-bold">
                  {firstSnapshot ? (
                    <span
                      className={
                        firstSnapshot.painNrsRest - (episodeStore.painAtRestNrs ?? 0) >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600'
                      }
                    >
                      <bdi dir="ltr">
                        {firstSnapshot.painNrsRest - (episodeStore.painAtRestNrs ?? 0) > 0
                          ? `\u2212${firstSnapshot.painNrsRest - (episodeStore.painAtRestNrs ?? 0)} pts`
                          : '0 pts'}
                      </bdi>
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>

              {/* Row 2: Pain NPRS with Activity */}
              <tr className="hover:bg-muted/20">
                <td className="py-3 px-4 font-bold text-foreground">
                  {language === 'ar' ? (
                    <>
                      شدة الألم مع الحركة والمجهود <ClinicalAbbr code="NPRS" className="text-xs text-muted-foreground-1 ms-1" />
                    </>
                  ) : language === 'ckb' ? (
                    <>
                      توندی ئازار لە کاتی جوڵە و ماندووبووندا <ClinicalAbbr code="NPRS" className="text-xs text-muted-foreground-1 ms-1" />
                    </>
                  ) : (
                    'Pain on Activity (NPRS 0–10)'
                  )}
                </td>
                {snapshots.map((snap) => (
                  <td key={snap.id} className="py-3 px-4 font-mono text-muted-foreground-2">
                    <Fraction value={snap.painNrsActivity} total={10} />
                  </td>
                ))}
                <td className="py-3 px-4 font-mono font-bold text-primary bg-primary/5">
                  <Fraction value={currentPainActivity} total={10} />
                </td>
                <td className="py-3 px-4 text-end font-mono font-bold">
                  {firstSnapshot ? (
                    <div className="inline-flex flex-col items-end gap-1">
                      <span
                        className={
                          painDelta >= 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600'
                        }
                      >
                        <bdi dir="ltr">
                          {painDelta > 0 ? `\u2212${painDelta} pts` : '0 pts'}
                        </bdi>
                      </span>
                      {painDelta >= 2 && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-xs font-sans font-bold">
                          {bi('تغيّر ذو دلالة (MCID)', 'Meaningful Change', 'گۆڕانکاری مانادار (MCID)')}
                        </span>
                      )}
                    </div>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>

              {/* Row 3: Functional Outcome Scale Score */}
              <tr className="hover:bg-muted/20">
                <td className="py-3 px-4 font-bold text-foreground">
                  {bi(
                    `المقياس الوظيفي (${episodeStore.functionalScales?.scaleId?.toUpperCase() || 'ODI / QuickDASH'})`,
                    `Functional Scale (${episodeStore.functionalScales?.scaleId?.toUpperCase() || 'Outcome'})`,
                    `پێوانەی فرمانی (${episodeStore.functionalScales?.scaleId?.toUpperCase() || 'ODI / QuickDASH'})`
                  )}
                </td>
                {snapshots.map((snap) => (
                  <td key={snap.id} className="py-3 px-4 font-mono text-muted-foreground-2">
                    {snap.outcomeScale ? `${snap.outcomeScale.scorePercentage}%` : '—'}
                  </td>
                ))}
                <td className="py-3 px-4 font-mono font-bold text-primary bg-primary/5">
                  {episodeStore.functionalScales
                    ? `${episodeStore.functionalScales.scorePercentage}%`
                    : '—'}
                </td>
                <td className="py-3 px-4 text-end font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {firstSnapshot?.outcomeScale && episodeStore.functionalScales ? (
                    <div className="inline-flex flex-col items-end gap-1">
                      <span>
                        {`${Math.abs(
                          firstSnapshot.outcomeScale.scorePercentage -
                            episodeStore.functionalScales.scorePercentage
                        )}% Δ`}
                      </span>
                      {outcomeEval?.mcidMet && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-xs font-sans font-bold">
                          {bi('تغيّر ذو دلالة (MCID)', 'Meaningful Change', 'گۆڕانکاری مانادار (MCID)')}
                        </span>
                      )}
                    </div>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>

              {/* Dynamic ROM Rows */}
              {uniqueRomKeys.map((romKey) => {
                const liveMatch = currentRomEntries.find(
                  (r) =>
                    resolveLongitudinalRomGroupKey({
                      canonicalKey: r.canonicalKey,
                      jointMovementKey: `${r.jointId}_${r.movementId}_${r.laterality}`,
                      laterality: r.laterality,
                    }) === romKey
                );
                const snapMatch = snapshots
                  .flatMap((s) => s.romSummary)
                  .find((r) => resolveLongitudinalRomGroupKey(r) === romKey);
                const label = liveMatch
                  ? bi(
                      `${liveMatch.jointNameAr} - ${liveMatch.movementNameAr} (${liveMatch.laterality})`,
                      `${liveMatch.jointNameEn} ${liveMatch.movementNameEn} (${liveMatch.laterality})`
                    )
                  : bi(snapMatch?.labelAr || romKey, snapMatch?.labelEn || romKey);

                const firstVal = firstSnapshot?.romSummary.find(
                  (r) => resolveLongitudinalRomGroupKey(r) === romKey
                )?.aromDegrees;
                const currentVal = liveMatch?.measuredAngleDegrees;
                const romGain =
                  firstVal !== undefined &&
                  firstVal !== null &&
                  currentVal !== undefined &&
                  currentVal !== null
                    ? currentVal - firstVal
                    : null;

                return (
                  <tr key={romKey} className="hover:bg-muted/20">
                    <td className="py-3 px-4 font-semibold text-foreground">
                      ROM · {label}
                    </td>
                    {snapshots.map((snap) => {
                      const entry = snap.romSummary.find(
                        (r) => resolveLongitudinalRomGroupKey(r) === romKey
                      );
                      return (
                        <td key={snap.id} className="py-3 px-4 font-mono text-muted-foreground-2">
                          {entry?.aromDegrees !== undefined && entry?.aromDegrees !== null
                            ? `${entry.aromDegrees}°`
                            : '—'}
                        </td>
                      );
                    })}
                    <td className="py-3 px-4 font-mono font-bold text-primary bg-primary/5">
                      {currentVal !== undefined && currentVal !== null ? `${currentVal}°` : '—'}
                    </td>
                    <td className="py-3 px-4 text-end font-mono font-bold">
                      {romGain !== null ? (
                        <span
                          className={
                            romGain >= 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-amber-600'
                          }
                        >
                          {romGain > 0 ? `+${romGain}°` : `${romGain}°`}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}

              {/* Dynamic MMT Rows */}
              {uniqueMmtKeys.map((mmtKey) => {
                const liveMatch = currentMmtEntries.find(
                  (m) =>
                    resolveLongitudinalMmtGroupKey({
                      canonicalKey: m.canonicalKey,
                      muscleKey: `${m.muscleGroupId}_${m.laterality}`,
                      label: m.label || m.muscleNameEn || m.muscleNameAr,
                      laterality: m.laterality,
                    }) === mmtKey
                );
                const snapMatch = snapshots
                  .flatMap((s) => s.mmtSummary)
                  .find((m) => resolveLongitudinalMmtGroupKey(m) === mmtKey);
                const label = liveMatch
                  ? bi(
                      `${liveMatch.muscleNameAr} (${liveMatch.laterality})`,
                      `${liveMatch.muscleNameEn} (${liveMatch.laterality})`
                    )
                  : bi(snapMatch?.labelAr || mmtKey, snapMatch?.labelEn || mmtKey);

                const firstGrade = firstSnapshot?.mmtSummary.find(
                  (m) => resolveLongitudinalMmtGroupKey(m) === mmtKey
                )?.grade;
                const currentGrade = liveMatch?.gradeValue;

                return (
                  <tr key={mmtKey} className="hover:bg-muted/20">
                    <td className="py-3 px-4 font-semibold text-foreground">
                      MMT · {label}
                    </td>
                    {snapshots.map((snap) => {
                      const entry = snap.mmtSummary.find(
                        (m) => resolveLongitudinalMmtGroupKey(m) === mmtKey
                      );
                      return (
                        <td key={snap.id} className="py-3 px-4 font-mono text-muted-foreground-2">
                          {entry ? <Fraction value={entry.grade} total={5} /> : '—'}
                        </td>
                      );
                    })}
                    <td className="py-3 px-4 font-mono font-bold text-primary bg-primary/5">
                      {currentGrade ? <Fraction value={currentGrade} total={5} /> : '—'}
                    </td>
                    <td className="py-3 px-4 text-end font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {firstGrade && currentGrade ? (
                        <bdi dir="ltr">{`${firstGrade} → ${currentGrade}/5`}</bdi>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  );
};
