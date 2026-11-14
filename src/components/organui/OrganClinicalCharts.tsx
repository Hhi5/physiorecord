// =======================================================================
// PhysioRecord Clinical Component — Real Data Progress & Outcome Charts
// Longitudinal NPRS Pain Trajectory & Outcome Measure MCID Bands (Zero Mock)
// =======================================================================

import React from 'react';
import { useLanguage } from '../../context/LanguageContext';
import type { SessionRecord, SoapObjectiveData } from '../../types/clinical';
import type { FunctionalScaleEntry } from '../../types/clinicalWidgets';
import type { ClinicalAssessmentSnapshot } from '../../types/clinicManagement';
import {
  OUTCOME_INSTRUMENTS,
  evaluateBaselineChange,
  normalizeScaleId,
} from '../../utils/outcomeMeasures';
import { TrendingDown, Activity, Flame, Award } from 'lucide-react';

export interface SessionPainPointInput {
  sessionId?: string;
  sessionNumber: number;
  date: string;
  pain: number;
}

interface OrganClinicalChartsProps {
  sessions: SessionRecord[];
  masterObjective?: SoapObjectiveData;
  sessionPainPoints?: SessionPainPointInput[];
  functionalScales?: FunctionalScaleEntry;
  snapshots?: ClinicalAssessmentSnapshot[];
}

export const OrganClinicalCharts: React.FC<OrganClinicalChartsProps> = ({
  sessions,
  masterObjective,
  sessionPainPoints,
  functionalScales,
  snapshots = [],
}) => {
  const { bi } = useLanguage();

  // Derive longitudinal NPRS pain points ONLY from real recorded scores (sessions / snapshots / NPRS scale history)
  const painPoints: Array<{ sessionNumber: number; date: string; pain: number; label: string }> =
    [];

  if (sessionPainPoints && sessionPainPoints.length > 0) {
    const sorted = [...sessionPainPoints]
      .filter((pt) => typeof pt.pain === 'number' && Number.isFinite(pt.pain))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    for (const pt of sorted) {
      painPoints.push({
        sessionNumber: pt.sessionNumber,
        date: pt.date,
        pain: pt.pain,
        label: `#${pt.sessionNumber}`,
      });
    }
  } else if (snapshots.length > 0) {
    const sortedSnaps = [...snapshots].sort(
      (a, b) => new Date(a.recordedDate).getTime() - new Date(b.recordedDate).getTime()
    );
    sortedSnaps.forEach((snap, idx) => {
      const score = snap.painNrsActivity ?? snap.painNrsRest;
      if (typeof score === 'number' && Number.isFinite(score)) {
        painPoints.push({
          sessionNumber: idx + 1,
          date: snap.recordedDate,
          pain: score,
          label: `S${idx + 1}`,
        });
      }
    });
  } else {
    // Check recorded NPRS points inside functionalScales.history or objective pain fallback if available
    const nprsHistory = (functionalScales?.history || [])
      .filter((h) => h.scaleId === 'nprs')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    nprsHistory.forEach((h, idx) => {
      painPoints.push({
        sessionNumber: idx + 1,
        date: h.date,
        pain: h.rawScore ?? h.scorePercentage,
        label: `#${idx + 1}`,
      });
    });
  }

  // Real Outcome Measure trajectory points from functionalScales history / current entry / snapshots
  const outcomePoints: Array<{
    date: string;
    label: string;
    scorePercentage: number;
    rawScore: number;
    scaleCode: string;
  }> = [];
  const scaleHistory = [...(functionalScales?.history || [])].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  if (scaleHistory.length > 0) {
    scaleHistory.forEach((pt, idx) => {
      outcomePoints.push({
        date: pt.date,
        label: `#${idx + 1}`,
        scorePercentage: pt.scorePercentage,
        rawScore: pt.rawScore ?? pt.scorePercentage,
        scaleCode: pt.scaleId.toUpperCase(),
      });
    });
  } else {
    snapshots
      .filter((s) => s.outcomeScale)
      .sort((a, b) => new Date(a.recordedDate).getTime() - new Date(b.recordedDate).getTime())
      .forEach((s, idx) => {
        if (s.outcomeScale) {
          outcomePoints.push({
            date: s.recordedDate,
            label: `#${idx + 1}`,
            scorePercentage: s.outcomeScale.scorePercentage,
            rawScore: s.outcomeScale.rawScore ?? s.outcomeScale.scorePercentage,
            scaleCode: s.outcomeScale.scaleId.toUpperCase(),
          });
        }
      });
  }

  const activeScaleId = functionalScales?.scaleId
    ? normalizeScaleId(functionalScales.scaleId)
    : undefined;
  const activeScaleSpec =
    activeScaleId && activeScaleId !== 'custom'
      ? OUTCOME_INSTRUMENTS[activeScaleId as keyof typeof OUTCOME_INSTRUMENTS]
      : undefined;

  const outcomeMcidEvaluation =
    functionalScales && outcomePoints.length >= 2
      ? evaluateBaselineChange(
          functionalScales.scaleId,
          outcomePoints[0].rawScore,
          outcomePoints[outcomePoints.length - 1].rawScore,
          outcomePoints[0].scorePercentage,
          outcomePoints[outcomePoints.length - 1].scorePercentage,
          functionalScales.customMeasureConfig
        )
      : null;

  // Compute MCID shaded threshold in SVG 0..100% coordinate space when possible
  const baselinePct = outcomePoints.length > 0 ? outcomePoints[0].scorePercentage : null;
  const mcidPctSpan = activeScaleSpec?.mcidUnitIsPercent ? activeScaleSpec.mcidValue : null;
  const higherIsBetter =
    activeScaleId === 'custom'
      ? functionalScales?.customMeasureConfig?.higherIsBetter ?? true
      : activeScaleSpec?.higherIsBetter ?? false;
  const mcidTargetPct =
    baselinePct !== null && mcidPctSpan !== null
      ? Math.max(0, Math.min(100, higherIsBetter ? baselinePct + mcidPctSpan : baselinePct - mcidPctSpan))
      : null;

  // Extract ROM & MMT summary counts from masterObjective
  const romEntries = masterObjective?.romBattery?.entries || [];
  const mmtEntries = masterObjective?.mmtBattery?.entries || [];

  const latestPain = painPoints.length > 0 ? painPoints[painPoints.length - 1].pain : null;
  const initialPain = painPoints.length > 0 ? painPoints[0].pain : null;
  const painDelta =
    initialPain !== null && latestPain !== null ? initialPain - latestPain : 0;
  const nprsMcidMet = painDelta >= 2;

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5 shadow-2xs">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-teal-950/80 border border-teal-200 dark:border-teal-800 flex items-center justify-center text-teal-600 dark:text-teal-400">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                {bi(
                  'المخططات السريرية لتطور الحالة',
                  'Longitudinal Clinical Outcome Charts',
                  'هێڵکارییە کلینیکییەکانی بەرەوپێشچوونی دۆخ'
                )}
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {bi(
                'منحنى الألم الفعلي (NPRS 0-10)، مقاييس النتائج مع عتبة MCID، وتماثل ROM/MMT',
                'Recorded pain trajectory (NPRS 0-10), outcome scale MCID trend, and ROM/MMT indices',
                'هێڵکاریی ئازاری تۆمارکراو (NPRS 0-10)، ئاڕاستەی پێوەرەکانی ئەنجام لەگەڵ MCID، و هاوسەنگیی ROM/MMT'
              )}
            </p>
          </div>
        </div>

        {/* Summary KPI Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs tabular-nums text-slate-600 dark:text-slate-300">
            {sessions.length} {bi('جلسات', 'sessions', 'دانیشتن')}
          </span>
          {latestPain !== null && (
            <div className="px-3 py-1 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center gap-2 text-xs tabular-nums">
              <Flame className="w-3.5 h-3.5 text-rose-500" />
              <span className="text-slate-500 dark:text-slate-400">
                {bi('الألم الأخير:', 'Latest NPRS:', 'دوایین ئازار (NPRS):')}
              </span>
              <span className="font-mono font-bold text-slate-900 dark:text-white">
                <bdi dir="ltr">{latestPain}/10</bdi>
              </span>
              {painDelta > 0 && (
                <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                  <TrendingDown className="w-3 h-3" />-{painDelta}
                  {nprsMcidMet && (
                    <span className="ms-1 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      MCID
                    </span>
                  )}
                </span>
              )}
            </div>
          )}
          {outcomeMcidEvaluation?.mcidMet && (
            <div className="px-2.5 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-bold inline-flex items-center gap-1">
              <Award className="w-3.5 h-3.5" />
              <span>
                {bi(
                  'تغيّر سريري ذو دلالة (MCID)',
                  'Meaningful Change (MCID Met)',
                  'گۆڕانکاریی کلینیکیی بەرچاو (MCID بەدەستهات)'
                )}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Chart 1: Real Recorded NPRS Pain Trajectory SVG Line Chart with MCID band */}
        <div className="p-4 rounded-xl bg-slate-50/70 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              {bi(
                'مسار شدة الألم الفعلي (NPRS 0–10)',
                'Recorded Pain Trajectory (NPRS 0–10)',
                'ڕەوتی توندیی ئازاری تۆمارکراو (NPRS 0–10)'
              )}
            </span>
            <span className="text-xs text-slate-500 tabular-nums">
              {painPoints.length} {bi('قراءات', 'readings', 'خوێندنەوە')}
            </span>
          </div>

          {painPoints.length === 0 ? (
            <div className="h-36 flex items-center justify-center text-xs text-slate-500 text-center px-4">
              {bi(
                'لا توجد قراءات ألم (NPRS) مسجلة بعد — أدخل درجة الألم في الجلسات أو لقطات المتابعة لعرض المنحنى الفعلي',
                'No recorded NPRS pain scores yet — document pain scores in SOAP notes or snapshots to plot real longitudinal progress',
                'هێشتا هیچ نمرەیەکی ئازار (NPRS) تۆمار نەکراوە — نمرەی ئازار لە تێبینییەکان یان بەدواداچوونەکاندا بنووسە بۆ پیشاندانی هێڵکاریی بەرەوپێشچوون'
              )}
            </div>
          ) : (
            <div className="h-44 sm:h-48 w-full">
              <svg viewBox="0 0 320 142" className="w-full h-full overflow-visible">
                {/* MCID Improvement zone (≥ 2 pts improvement from baseline pain) */}
                {initialPain !== null && initialPain >= 2 && (
                  <rect
                    x="30"
                    y={105 - ((initialPain - 2) / 10) * 85}
                    width="275"
                    height={105 - (105 - ((initialPain - 2) / 10) * 85)}
                    fill="rgba(16, 185, 129, 0.08)"
                  />
                )}
                {/* Horizontal Reference Lines (0, 5, 10) */}
                {[0, 5, 10].map((val) => {
                  const y = 105 - (val / 10) * 85;
                  return (
                    <g key={val}>
                      <line
                        x1="30"
                        y1={y}
                        x2="305"
                        y2={y}
                        stroke="currentColor"
                        strokeDasharray="3 3"
                        className="text-slate-200 dark:text-slate-800"
                      />
                      <text
                        x="25"
                        y={y + 4}
                        fontSize="13"
                        textAnchor="end"
                        className="fill-slate-400 font-mono"
                      >
                        {val}
                      </text>
                    </g>
                  );
                })}

                {/* Polyline connecting recorded readings */}
                {painPoints.length > 1 && (
                  <polyline
                    fill="none"
                    stroke="#0d9488"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={painPoints
                      .map((pt, i) => {
                        const x = 48 + (i / Math.max(1, painPoints.length - 1)) * 242;
                        const y = 105 - (pt.pain / 10) * 85;
                        return `${x},${y}`;
                      })
                      .join(' ')}
                  />
                )}

                {/* Data Points */}
                {painPoints.map((pt, i) => {
                  const x =
                    painPoints.length === 1
                      ? 165
                      : 48 + (i / (painPoints.length - 1)) * 242;
                  const y = 105 - (pt.pain / 10) * 85;
                  return (
                    <g key={i}>
                      <circle
                        cx={x}
                        cy={y}
                        r="4.5"
                        className="fill-teal-600 stroke-white dark:stroke-slate-900 stroke-2"
                      />
                      <text
                        x={x}
                        y={y - 10}
                        fontSize="13"
                        textAnchor="middle"
                        className="fill-slate-700 dark:fill-slate-200 font-mono font-bold"
                      >
                        {pt.pain}
                      </text>
                      <text
                        x={x}
                        y="128"
                        fontSize="13"
                        textAnchor="middle"
                        className="fill-slate-500 font-mono"
                      >
                        {pt.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          )}
        </div>

        {/* Chart 2: Outcome Score Trajectory + MCID Band OR ROM Summary */}
        <div className="p-4 rounded-xl bg-slate-50/70 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              {outcomePoints.length > 0
                ? bi(
                    'مسار مقاييس النتائج السريرية (Outcome % & MCID)',
                    'Outcome Measure Trajectory (% & MCID Band)',
                    'ڕەوتی پێوەرەکانی ئەنجامی کلینیکی (Outcome % & MCID)'
                  )
                : bi(
                    'مؤشرات المدى الحركي (ROM) والقوة العضلية (MMT)',
                    'ROM & MMT Assessment Summary',
                    'نیشاندەرەکانی مەودای جووڵە (ROM) و هێزی ماسولکە (MMT)'
                  )}
            </span>
            <span className="text-xs font-mono text-teal-600 dark:text-teal-400 tabular-nums">
              {outcomePoints.length > 0
                ? `${outcomePoints[0].scaleCode} · ${outcomePoints.length}`
                : `${romEntries.length} ROM · ${mmtEntries.length} MMT`}
            </span>
          </div>

          {outcomePoints.length > 0 ? (
            <div className="h-44 sm:h-48 w-full">
              <svg viewBox="0 0 320 142" className="w-full h-full overflow-visible">
                {mcidTargetPct !== null && (
                  <line
                    x1="34"
                    y1={105 - (mcidTargetPct / 100) * 85}
                    x2="305"
                    y2={105 - (mcidTargetPct / 100) * 85}
                    stroke="#10b981"
                    strokeDasharray="4 3"
                    strokeWidth="1.5"
                  />
                )}
                {[0, 50, 100].map((val) => {
                  const y = 105 - (val / 100) * 85;
                  return (
                    <g key={val}>
                      <line
                        x1="34"
                        y1={y}
                        x2="305"
                        y2={y}
                        stroke="currentColor"
                        strokeDasharray="3 3"
                        className="text-slate-200 dark:text-slate-800"
                      />
                      <text
                        x="31"
                        y={y + 4}
                        fontSize="13"
                        textAnchor="end"
                        className="fill-slate-400 font-mono"
                      >
                        {val}%
                      </text>
                    </g>
                  );
                })}
                {outcomePoints.length > 1 && (
                  <polyline
                    fill="none"
                    stroke="#4f46e5"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={outcomePoints
                      .map((pt, i) => {
                        const x = 50 + (i / Math.max(1, outcomePoints.length - 1)) * 240;
                        const y = 105 - (pt.scorePercentage / 100) * 85;
                        return `${x},${y}`;
                      })
                      .join(' ')}
                  />
                )}
                {outcomePoints.map((pt, i) => {
                  const x =
                    outcomePoints.length === 1
                      ? 165
                      : 50 + (i / (outcomePoints.length - 1)) * 240;
                  const y = 105 - (pt.scorePercentage / 100) * 85;
                  return (
                    <g key={i}>
                      <circle
                        cx={x}
                        cy={y}
                        r="4.5"
                        className="fill-indigo-600 stroke-white dark:stroke-slate-900 stroke-2"
                      />
                      <text
                        x={x}
                        y={y - 10}
                        fontSize="13"
                        textAnchor="middle"
                        className="fill-slate-700 dark:fill-slate-200 font-mono font-bold"
                      >
                        {pt.scorePercentage}%
                      </text>
                      <text
                        x={x}
                        y="128"
                        fontSize="13"
                        textAnchor="middle"
                        className="fill-slate-500 font-mono"
                      >
                        {pt.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          ) : romEntries.length === 0 && mmtEntries.length === 0 ? (
            <div className="h-36 flex items-center justify-center text-xs text-slate-500 text-center px-4">
              {bi(
                'أدخل قراءات مقاييس النتائج أو الزوايا المفصلية (ROM) لعرض مخططات التطور',
                'Add outcome scale readings or ROM/MMT tests to visualize clinical progress',
                'خوێندنەوەی پێوەرەکانی ئەنجام یان پشکنینەکانی ROM/MMT تۆمار بکە بۆ پیشاندانی هێڵکاریی بەرەوپێشچوون'
              )}
            </div>
          ) : (
            <div className="space-y-2.5 max-h-40 overflow-y-auto pr-1">
              {romEntries.slice(0, 4).map((entry) => {
                const measured = entry.measuredAngleDegrees ?? 0;
                const refAngle = entry.referenceUninvolvedAngleDegrees || 150;
                const pct = Math.min(100, Math.round((measured / refAngle) * 100));

                return (
                  <div key={entry.entryId} className="space-y-1">
                    <div className="flex items-center justify-between text-xs tabular-nums">
                      <span className="font-semibold text-slate-700 dark:text-slate-200">
                        {bi(entry.movementNameAr, entry.movementNameEn)} ({entry.laterality})
                      </span>
                      <span className="font-mono text-slate-500">
                        <bdi dir="ltr">{measured}° / {refAngle}° ({pct}%)</bdi>
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-teal-600 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
