// =======================================================================
// PhysioRecord Clinical Component — Real Data Progress & Outcome Charts
// Longitudinal NPRS Pain Trajectory, Outcome Measure MCID Bands,
// Interactive Joint ROM Progression, & Rehabilitation Goal Attainment (Zero Mock)
// =======================================================================

import React, { useMemo, useState } from 'react';
import { Activity, Award, Flame, Target, TrendingDown } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { resolveLongitudinalRomGroupKey } from '../../data/clinicalToolkit/canonicalKeysCatalog';
import type { SessionRecord, SoapObjectiveData, StructuredRehabGoal } from '../../types/clinical';
import type { FunctionalScaleEntry } from '../../types/clinicalWidgets';
import type {
  ClinicalAssessmentSnapshot,
  OutcomeLinkedGoal,
} from '../../types/clinicManagement';
import { formatDateDDMMYYYY } from '../../utils/date';
import {
  OUTCOME_INSTRUMENTS,
  evaluateBaselineChange,
  normalizeScaleId,
} from '../../utils/outcomeMeasures';

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
  smartGoals?: StructuredRehabGoal[];
  outcomeGoals?: OutcomeLinkedGoal[];
}

export const OrganClinicalCharts: React.FC<OrganClinicalChartsProps> = ({
  sessions,
  masterObjective,
  sessionPainPoints,
  functionalScales,
  snapshots = [],
  smartGoals = [],
  outcomeGoals = [],
}) => {
  const { bi } = useLanguage();

  const [selectedPainIdx, setSelectedPainIdx] = useState<number | null>(null);
  const [selectedOutcomeIdx, setSelectedOutcomeIdx] = useState<number | null>(null);
  const [selectedRomKey, setSelectedRomKey] = useState<string>('');
  const [selectedRomPointIdx, setSelectedRomPointIdx] = useState<number | null>(null);

  // Derive longitudinal NPRS pain points ONLY from real recorded scores (sessions / snapshots / NPRS scale history)
  const painPoints = useMemo(() => {
    const pts: Array<{ sessionNumber: number; date: string; pain: number; label: string }> = [];

    if (sessionPainPoints && sessionPainPoints.length > 0) {
      const sorted = [...sessionPainPoints]
        .filter((pt) => typeof pt.pain === 'number' && Number.isFinite(pt.pain))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      for (const pt of sorted) {
        pts.push({
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
          pts.push({
            sessionNumber: idx + 1,
            date: snap.recordedDate,
            pain: score,
            label: idx === 0 ? 'B' : `S${idx + 1}`,
          });
        }
      });
    } else {
      const nprsHistory = (functionalScales?.history || [])
        .filter((h) => h.scaleId === 'nprs')
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      nprsHistory.forEach((h, idx) => {
        pts.push({
          sessionNumber: idx + 1,
          date: h.date,
          pain: h.rawScore ?? h.scorePercentage,
          label: `#${idx + 1}`,
        });
      });
    }
    return pts;
  }, [sessionPainPoints, snapshots, functionalScales?.history]);

  // Real Outcome Measure trajectory points from functionalScales history / snapshots
  const outcomePoints = useMemo(() => {
    const pts: Array<{
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
        pts.push({
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
            pts.push({
              date: s.recordedDate,
              label: idx === 0 ? 'B' : `S${idx + 1}`,
              scorePercentage: s.outcomeScale.scorePercentage,
              rawScore: s.outcomeScale.rawScore ?? s.outcomeScale.scorePercentage,
              scaleCode: s.outcomeScale.scaleId.toUpperCase(),
            });
          }
        });
    }
    return pts;
  }, [functionalScales?.history, snapshots]);

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

  const baselinePct = outcomePoints.length > 0 ? outcomePoints[0].scorePercentage : null;
  const mcidPctSpan = activeScaleSpec?.mcidUnitIsPercent ? activeScaleSpec.mcidValue : null;
  const higherIsBetter =
    activeScaleId === 'custom'
      ? functionalScales?.customMeasureConfig?.higherIsBetter ?? true
      : activeScaleSpec?.higherIsBetter ?? false;
  const mcidTargetPct =
    baselinePct !== null && mcidPctSpan !== null
      ? Math.max(
          0,
          Math.min(100, higherIsBetter ? baselinePct + mcidPctSpan : baselinePct - mcidPctSpan)
        )
      : null;

  // Build selectable Joint ROM Longitudinal Series from real snapshots + current masterObjective
  const romEntries = useMemo(
    () =>
      (masterObjective?.romBattery?.entries || []).filter(
        (e) => e.isTested && e.measuredAngleDegrees !== null
      ),
    [masterObjective?.romBattery?.entries]
  );
  const mmtEntries = useMemo(
    () =>
      (masterObjective?.mmtBattery?.entries || []).filter(
        (e) => e.isTested && e.gradeValue !== null
      ),
    [masterObjective?.mmtBattery?.entries]
  );

  const romSeriesList = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        labelAr: string;
        labelEn: string;
        uninvolvedRef?: number;
        points: Array<{ label: string; date?: string; degrees: number }>;
      }
    >();

    const sortedSnaps = [...snapshots].sort(
      (a, b) => new Date(a.recordedDate).getTime() - new Date(b.recordedDate).getTime()
    );

    sortedSnaps.forEach((snap, idx) => {
      for (const r of snap.romSummary || []) {
        if (r.aromDegrees === null || r.aromDegrees === undefined) continue;
        const key = resolveLongitudinalRomGroupKey(r);
        let series = map.get(key);
        if (!series) {
          series = {
            key,
            labelAr: r.labelAr || key,
            labelEn: r.labelEn || key,
            points: [],
          };
          map.set(key, series);
        }
        series.points.push({
          label: idx === 0 ? 'B' : `S${idx + 1}`,
          date: snap.recordedDate,
          degrees: r.aromDegrees,
        });
      }
    });

    for (const r of romEntries) {
      if (r.measuredAngleDegrees === null) continue;
      const key = resolveLongitudinalRomGroupKey({
        canonicalKey: r.canonicalKey,
        jointMovementKey: `${r.jointId}_${r.movementId}_${r.laterality}`,
        laterality: r.laterality,
      });
      let series = map.get(key);
      if (!series) {
        series = {
          key,
          labelAr: `${r.jointNameAr} - ${r.movementNameAr} (${r.laterality === 'right' ? 'يمين' : r.laterality === 'left' ? 'يسار' : 'ثنائي'})`,
          labelEn: `${r.jointNameEn} ${r.movementNameEn} (${r.laterality})`,
          points: [],
        };
        map.set(key, series);
      }
      if (r.referenceUninvolvedAngleDegrees && r.referenceUninvolvedAngleDegrees > 0) {
        series.uninvolvedRef = r.referenceUninvolvedAngleDegrees;
      }
      series.points.push({
        label: bi('الحالي', 'Now', 'ئێستا'),
        degrees: r.measuredAngleDegrees,
      });
    }

    return Array.from(map.values()).filter((s) => s.points.length > 0);
  }, [snapshots, romEntries, bi]);

  const activeRomSeries =
    romSeriesList.find((s) => s.key === selectedRomKey) || romSeriesList[0] || null;

  const romChartMax = useMemo(() => {
    if (!activeRomSeries) return 180;
    const maxVal = Math.max(
      ...activeRomSeries.points.map((p) => p.degrees),
      activeRomSeries.uninvolvedRef || 0
    );
    return Math.max(60, Math.ceil(maxVal / 30) * 30);
  }, [activeRomSeries]);

  const latestPain = painPoints.length > 0 ? painPoints[painPoints.length - 1].pain : null;
  const initialPain = painPoints.length > 0 ? painPoints[0].pain : null;
  const painDelta = initialPain !== null && latestPain !== null ? initialPain - latestPain : 0;
  const nprsMcidMet = painDelta >= 2;

  const inspectedPainPoint =
    selectedPainIdx !== null && painPoints[selectedPainIdx] ? painPoints[selectedPainIdx] : null;
  const inspectedOutcomePoint =
    selectedOutcomeIdx !== null && outcomePoints[selectedOutcomeIdx]
      ? outcomePoints[selectedOutcomeIdx]
      : null;
  const inspectedRomPoint =
    selectedRomPointIdx !== null && activeRomSeries?.points[selectedRomPointIdx]
      ? activeRomSeries.points[selectedRomPointIdx]
      : null;

  const hasGoals = smartGoals.length > 0 || outcomeGoals.length > 0;

  return (
    <div className="rounded-2xl border border-card-line bg-card p-4 sm:p-5 space-y-5 shadow-2xs">
      {/* Header with Clean Unboxed Metadata */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-card-divider pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center text-primary shrink-0">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-foreground">
              {bi(
                'المخططات السريرية لتطور الحالة',
                'Longitudinal Clinical Outcome Charts',
                'هێڵکارییە کلینیکییەکانی بەرەوپێشچوونی دۆخ'
              )}
            </h3>
            <p className="text-xs text-muted-foreground-1">
              {bi(
                'منحنى الألم الفعلي (NPRS 0-10)، مقاييس النتائج مع عتبة MCID، وتطور المدى الحركي',
                'Recorded pain trajectory (NPRS 0-10), outcome scale MCID trend, and joint ROM progression',
                'هێڵکاریی ئازاری تۆمارکراو (NPRS 0-10)، ئاڕاستەی پێوەرەکان لەگەڵ MCID، و بەرەوپێشچوونی ROM'
              )}
            </p>
          </div>
        </div>

        {/* Clean Unboxed Summary Metadata Strip */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums text-muted-foreground-1">
          <span>
            {sessions.length} {bi('جلسات', 'sessions', 'دانیشتن')}
          </span>
          {latestPain !== null && (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 text-foreground font-medium">
                <Flame className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <span>{bi('الألم الأخير:', 'Latest NPRS:', 'دوایین ئازار:')}</span>
                <span className="font-mono font-bold">
                  <bdi dir="ltr">{latestPain}/10</bdi>
                </span>
                {painDelta > 0 && (
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-0.5">
                    <TrendingDown className="w-3 h-3" />
                    <bdi dir="ltr">
                      -{painDelta}
                      {nprsMcidMet ? ' MCID' : ''}
                    </bdi>
                  </span>
                )}
              </span>
            </>
          )}
          {outcomeMcidEvaluation?.mcidMet && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-emerald-700 dark:text-emerald-400 font-bold inline-flex items-center gap-1">
                <Award className="w-3.5 h-3.5 shrink-0" />
                <span>{bi('تغيّر دال (MCID)', 'MCID Met', 'MCID بەدەستهات')}</span>
              </span>
            </>
          )}
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Chart 1: Interactive Recorded NPRS Pain Trajectory SVG Line Chart */}
        <div className="p-4 rounded-xl bg-surface/50 border border-card-line space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-foreground">
              {bi(
                'مسار شدة الألم الفعلي (NPRS 0–10)',
                'Recorded Pain Trajectory (NPRS 0–10)',
                'ڕەوتی توندیی ئازاری تۆمارکراو (NPRS 0–10)'
              )}
            </span>
            <span className="text-xs text-muted-foreground-1 tabular-nums">
              {inspectedPainPoint ? (
                <span className="font-semibold text-primary">
                  <bdi dir="ltr">
                    {inspectedPainPoint.label} · {formatDateDDMMYYYY(inspectedPainPoint.date)} ·{' '}
                    {inspectedPainPoint.pain}/10
                  </bdi>
                </span>
              ) : (
                <>
                  {painPoints.length} {bi('قراءات', 'readings', 'خوێندنەوە')}
                </>
              )}
            </span>
          </div>

          {painPoints.length === 0 ? (
            <div className="h-36 flex items-center justify-center text-xs text-muted-foreground-1 text-center px-4">
              {bi(
                'لا توجد قراءات ألم (NPRS) مسجلة بعد — أدخل درجة الألم في الجلسات أو لقطات المتابعة لعرض المنحنى الفعلي',
                'No recorded NPRS pain scores yet — document pain scores in SOAP notes or snapshots to plot real longitudinal progress',
                'هێشتا هیچ نمرەیەکی ئازار (NPRS) تۆمار نەکراوە — نمرەی ئازار لە تێبینییەکان یان بەدواداچوونەکاندا بنووسە'
              )}
            </div>
          ) : (
            <div className="h-44 sm:h-48 w-full">
              <svg viewBox="0 0 320 142" className="w-full h-full overflow-visible">
                {/* MCID Improvement zone (>= 2 pts improvement from baseline pain) */}
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
                        fontSize="12"
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

                {/* Interactive Data Points */}
                {painPoints.map((pt, i) => {
                  const x =
                    painPoints.length === 1
                      ? 165
                      : 48 + (i / (painPoints.length - 1)) * 242;
                  const y = 105 - (pt.pain / 10) * 85;
                  const isSelected = selectedPainIdx === i;
                  return (
                    <g
                      key={`${pt.label}-${pt.date ?? ''}-${pt.pain}`}
                      role="button"
                      tabIndex={0}
                      aria-label={`${pt.label}: ${pt.pain}/10`}
                      onMouseEnter={() => setSelectedPainIdx(i)}
                      onMouseLeave={() => setSelectedPainIdx(null)}
                      onClick={() => setSelectedPainIdx(isSelected ? null : i)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedPainIdx(isSelected ? null : i);
                        }
                      }}
                      className="cursor-pointer focus:outline-none"
                    >
                      <circle cx={x} cy={y} r="12" fill="transparent" />
                      <circle
                        cx={x}
                        cy={y}
                        r={isSelected ? '6' : '4.5'}
                        className="fill-primary stroke-white dark:stroke-slate-900 stroke-2 transition-all"
                      />
                      <text
                        x={x}
                        y={y - 10}
                        fontSize="12"
                        textAnchor="middle"
                        className="fill-slate-700 dark:fill-slate-200 font-mono font-bold"
                      >
                        {pt.pain}
                      </text>
                      <text
                        x={x}
                        y="128"
                        fontSize="12"
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

        {/* Chart 2: Outcome Score Trajectory + MCID Band OR Interactive Joint ROM Trajectory */}
        <div className="p-4 rounded-xl bg-surface/50 border border-card-line space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-foreground">
              {outcomePoints.length > 0
                ? bi(
                    'مسار مقاييس النتائج السريرية (Outcome % & MCID)',
                    'Outcome Measure Trajectory (% & MCID Band)',
                    'ڕەوتی پێوەرەکانی ئەنجامی کلینیکی (Outcome % & MCID)'
                  )
                : bi(
                    'ملخص المدى الحركي (ROM) والقوة العضلية (MMT)',
                    'ROM & MMT Assessment Summary',
                    'پوختەی مەودای جووڵە (ROM) و هێزی ماسولکە (MMT)'
                  )}
            </span>
            <span className="text-xs font-mono text-primary tabular-nums">
              {inspectedOutcomePoint ? (
                <bdi dir="ltr">
                  {inspectedOutcomePoint.scaleCode} · {formatDateDDMMYYYY(inspectedOutcomePoint.date)} ·{' '}
                  {inspectedOutcomePoint.scorePercentage}%
                </bdi>
              ) : outcomePoints.length > 0 ? (
                `${outcomePoints[0].scaleCode} · ${outcomePoints.length}`
              ) : (
                `${romEntries.length} ROM · ${mmtEntries.length} MMT`
              )}
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
                        fontSize="12"
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
                  const isSelected = selectedOutcomeIdx === i;
                  return (
                    <g
                      key={`${pt.label}-${pt.date ?? ''}-${pt.scorePercentage}`}
                      role="button"
                      tabIndex={0}
                      aria-label={`${pt.label}: ${pt.scorePercentage}%`}
                      onMouseEnter={() => setSelectedOutcomeIdx(i)}
                      onMouseLeave={() => setSelectedOutcomeIdx(null)}
                      onClick={() => setSelectedOutcomeIdx(isSelected ? null : i)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedOutcomeIdx(isSelected ? null : i);
                        }
                      }}
                      className="cursor-pointer focus:outline-none"
                    >
                      <circle cx={x} cy={y} r="12" fill="transparent" />
                      <circle
                        cx={x}
                        cy={y}
                        r={isSelected ? '6' : '4.5'}
                        className="fill-indigo-600 stroke-white dark:stroke-slate-900 stroke-2 transition-all"
                      />
                      <text
                        x={x}
                        y={y - 10}
                        fontSize="12"
                        textAnchor="middle"
                        className="fill-slate-700 dark:fill-slate-200 font-mono font-bold"
                      >
                        {pt.scorePercentage}%
                      </text>
                      <text
                        x={x}
                        y="128"
                        fontSize="12"
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
            <div className="h-36 flex items-center justify-center text-xs text-muted-foreground-1 text-center px-4">
              {bi(
                'أدخل قراءات مقاييس النتائج أو الزوايا المفصلية (ROM) لعرض مخططات التطور',
                'Add outcome scale readings or ROM/MMT tests to visualize clinical progress',
                'خوێندنەوەی پێوەرەکانی ئەنجام یان پشکنینەکانی ROM/MMT تۆمار بکە بۆ پیشاندانی هێڵکاریی بەرەوپێشچوون'
              )}
            </div>
          ) : (
            <div className="space-y-2.5 max-h-44 overflow-y-auto pe-1">
              {romEntries.slice(0, 5).map((entry) => {
                const measured = entry.measuredAngleDegrees ?? 0;
                const uninvolved = entry.referenceUninvolvedAngleDegrees;
                const hasUninvolved = typeof uninvolved === 'number' && uninvolved > 0;
                const barPct = hasUninvolved
                  ? Math.min(100, Math.round((measured / uninvolved) * 100))
                  : Math.min(100, Math.round((measured / 180) * 100));

                return (
                  <div key={entry.entryId} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs tabular-nums">
                      <span className="font-semibold text-foreground truncate">
                        {bi(entry.movementNameAr, entry.movementNameEn)} ({entry.laterality})
                      </span>
                      <span className="font-mono text-muted-foreground-1 shrink-0">
                        <bdi dir="ltr">
                          {hasUninvolved
                            ? `${measured}° / ${uninvolved}° (${barPct}%)`
                            : `${measured}°`}
                        </bdi>
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-card overflow-hidden border border-card-line">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Chart 3: Interactive Joint ROM Longitudinal Progression (When ROM Series Exists) */}
      {activeRomSeries && (
        <div className="p-4 rounded-xl bg-surface/50 border border-card-line space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span className="text-xs font-bold text-foreground">
                {bi(
                  'تطور المدى الحركي للمفصل (ROM°)',
                  'Joint ROM Longitudinal Progression (°)',
                  'بەرەوپێشچوونی مەودای جووڵەی جومگە (ROM°)'
                )}
              </span>
              {romSeriesList.length > 1 ? (
                <select
                  aria-label={bi('اختر المفصل لعرض التطور', 'Select joint to inspect', 'جومگە هەڵبژێرە')}
                  value={activeRomSeries.key}
                  onChange={(e) => {
                    setSelectedRomKey(e.target.value);
                    setSelectedRomPointIdx(null);
                  }}
                  className="h-8 px-2.5 text-xs font-semibold rounded-lg bg-card border border-layer-line text-foreground focus:outline-none focus:border-primary"
                >
                  {romSeriesList.map((s) => (
                    <option key={s.key} value={s.key}>
                      {bi(s.labelAr, s.labelEn)}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs text-muted-foreground-1">
                  · {bi(activeRomSeries.labelAr, activeRomSeries.labelEn)}
                </span>
              )}
            </div>

            <div className="text-xs font-mono text-primary tabular-nums">
              {inspectedRomPoint ? (
                <bdi dir="ltr">
                  {inspectedRomPoint.label}
                  {inspectedRomPoint.date ? ` (${formatDateDDMMYYYY(inspectedRomPoint.date)})` : ''} ·{' '}
                  {inspectedRomPoint.degrees}°
                </bdi>
              ) : activeRomSeries.uninvolvedRef ? (
                <bdi dir="ltr">
                  {bi('الطرف السليم:', 'Uninvolved:', 'لای ساخ:')} {activeRomSeries.uninvolvedRef}°
                </bdi>
              ) : (
                `${activeRomSeries.points.length} ${bi('قراءات', 'readings', 'خوێندنەوە')}`
              )}
            </div>
          </div>

          <div className="h-40 sm:h-44 w-full">
            <svg viewBox="0 0 360 140" className="w-full h-full overflow-visible">
              {/* Uninvolved-side clinician-recorded reference line (never normative text) */}
              {activeRomSeries.uninvolvedRef && activeRomSeries.uninvolvedRef <= romChartMax && (
                <line
                  x1="36"
                  y1={104 - (activeRomSeries.uninvolvedRef / romChartMax) * 84}
                  x2="345"
                  y2={104 - (activeRomSeries.uninvolvedRef / romChartMax) * 84}
                  stroke="#059669"
                  strokeDasharray="4 3"
                  strokeWidth="1.5"
                />
              )}

              {[0, Math.round(romChartMax / 2), romChartMax].map((val) => {
                const y = 104 - (val / romChartMax) * 84;
                return (
                  <g key={val}>
                    <line
                      x1="36"
                      y1={y}
                      x2="345"
                      y2={y}
                      stroke="currentColor"
                      strokeDasharray="3 3"
                      className="text-slate-200 dark:text-slate-800"
                    />
                    <text
                      x="32"
                      y={y + 4}
                      fontSize="12"
                      textAnchor="end"
                      className="fill-slate-400 font-mono"
                    >
                      {val}°
                    </text>
                  </g>
                );
              })}

              {activeRomSeries.points.length > 1 && (
                <polyline
                  fill="none"
                  stroke="#0284c7"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={activeRomSeries.points
                    .map((pt, i) => {
                      const x = 56 + (i / Math.max(1, activeRomSeries.points.length - 1)) * 270;
                      const y = 104 - (pt.degrees / romChartMax) * 84;
                      return `${x},${y}`;
                    })
                    .join(' ')}
                />
              )}

              {activeRomSeries.points.map((pt, i) => {
                const x =
                  activeRomSeries.points.length === 1
                    ? 190
                    : 56 + (i / (activeRomSeries.points.length - 1)) * 270;
                const y = 104 - (pt.degrees / romChartMax) * 84;
                const isSelected = selectedRomPointIdx === i;
                return (
                  <g
                    key={`${pt.label}-${pt.date ?? ''}-${pt.degrees}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${pt.label}: ${pt.degrees}°`}
                    onMouseEnter={() => setSelectedRomPointIdx(i)}
                    onMouseLeave={() => setSelectedRomPointIdx(null)}
                    onClick={() => setSelectedRomPointIdx(isSelected ? null : i)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedRomPointIdx(isSelected ? null : i);
                      }
                    }}
                    className="cursor-pointer focus:outline-none"
                  >
                    <circle cx={x} cy={y} r="12" fill="transparent" />
                    <circle
                      cx={x}
                      cy={y}
                      r={isSelected ? '6' : '4.5'}
                      className="fill-sky-600 stroke-white dark:stroke-slate-900 stroke-2 transition-all"
                    />
                    <text
                      x={x}
                      y={y - 10}
                      fontSize="12"
                      textAnchor="middle"
                      className="fill-slate-700 dark:fill-slate-200 font-mono font-bold"
                    >
                      {pt.degrees}°
                    </text>
                    <text
                      x={x}
                      y="126"
                      fontSize="12"
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
        </div>
      )}

      {/* Panel 4: Rehabilitation Goals & Outcome Targets Progress */}
      {hasGoals && (
        <div className="p-4 rounded-xl bg-surface/50 border border-card-line space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Target className="size-4 text-primary shrink-0" />
              <span className="text-xs font-bold text-foreground">
                {bi(
                  'تقدم الأهداف التأهيلية ومقاييس الإنجاز',
                  'Rehabilitation Goals & Target Attainment',
                  'پێشکەوتنی ئامانجەکانی ڕاهێنانەوە'
                )}
              </span>
            </div>
            <span className="text-xs text-muted-foreground-1 tabular-nums">
              {smartGoals.length + outcomeGoals.length} {bi('أهداف', 'goals', 'ئامانج')}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {smartGoals.map((goal) => {
              const pct =
                typeof goal.progressPercent === 'number'
                  ? Math.max(0, Math.min(100, goal.progressPercent))
                  : goal.status === 'achieved'
                    ? 100
                    : 0;
              const isAchieved =
                goal.status === 'achieved' || (typeof goal.gasScore === 'number' && goal.gasScore >= 0);

              return (
                <div
                  key={goal.id}
                  className="p-3 rounded-xl bg-card border border-card-line space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold text-foreground leading-snug">
                      {goal.description}
                    </p>
                    <span
                      className={`text-xs font-mono font-bold shrink-0 tabular-nums ${
                        isAchieved ? 'text-emerald-600 dark:text-emerald-400' : 'text-primary'
                      }`}
                    >
                      {typeof goal.gasScore === 'number'
                        ? `GAS ${goal.gasScore > 0 ? `+${goal.gasScore}` : goal.gasScore}`
                        : `${pct}%`}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isAchieved ? 'bg-emerald-600' : 'bg-primary'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}

            {outcomeGoals.map((goal) => {
              const current = goal.currentScore ?? goal.baselineScore;
              const span = Math.abs(goal.targetScore - goal.baselineScore);
              const moved =
                goal.targetScore >= goal.baselineScore
                  ? current - goal.baselineScore
                  : goal.baselineScore - current;
              const pct = span > 0 ? Math.max(0, Math.min(100, Math.round((moved / span) * 100))) : 0;
              const isMet = pct >= 100;

              return (
                <div
                  key={goal.id}
                  className="p-3 rounded-xl bg-card border border-card-line space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold text-foreground leading-snug">
                      {goal.title}
                    </p>
                    <span
                      className={`text-xs font-mono font-bold shrink-0 tabular-nums ${
                        isMet ? 'text-emerald-600 dark:text-emerald-400' : 'text-primary'
                      }`}
                    >
                      {pct}%
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground-1 font-mono tabular-nums">
                    <bdi dir="ltr">
                      {goal.linkedInstrumentId.toUpperCase()}: {goal.baselineScore} → {current} (
                      {bi('الهدف', 'Target', 'ئامانج')} {goal.targetScore})
                    </bdi>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isMet ? 'bg-emerald-600' : 'bg-primary'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
