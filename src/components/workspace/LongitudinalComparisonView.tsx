// =======================================================================
// PhysioRecord — Serene Longitudinal Progress & Comparison Hub (Option 1)
// Combines low-cognitive-load mobile-first inline sparklines, a horizontal
// milestone timeline strip, a 2-line clinical verdict, a bottom-sheet
// snapshot capture modal, and full desktop floodlight matrix + CSV/Print.
// =======================================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  FileBarChart,
  Filter,
  History,
  LayoutList,
  Plus,
  Printer,
  Share2,
  Table2,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import { formatDateDDMMYYYY } from '../../utils/date';
import { downloadCsvFile } from '../../utils/csvExport';
import {
  resolveLongitudinalMmtGroupKey,
  resolveLongitudinalRomGroupKey,
} from '../../data/clinicalToolkit/canonicalKeysCatalog';
import { evaluateBaselineChange } from '../../utils/outcomeMeasures';
import {
  type ComparisonPointData,
  type DeltaDirection,
  buildClinicalVerdictText,
  buildComparisonPointFromLiveStore,
  buildComparisonPointFromSnapshot,
  buildLongitudinalMatrixCsv,
  buildLongitudinalSummaryText,
  computeMmtDelta,
  computePainDelta,
  computePerformanceTestProgress,
  computeRomDelta,
  computeSpecialTestsDelta,
  normalizeSparklineCoords,
  parseMmtGradeNumeric,
} from '../../utils/longitudinalProgress';
import type { ValidatedScaleId } from '../../types/clinicalWidgets';
import type {
  ClinicalAssessmentSnapshot,
  EpisodeScopedClinicalStore,
} from '../../types/clinicManagement';
import { ModalDialog } from '../ui/Dialog';
import { ClampedMenuPanel } from '../ui/ClampedMenuPanel';
import { ClinicalAbbr, Fraction } from '../ui/Primitives';

type MatrixCategoryFilter = 'all' | 'pain' | 'rom' | 'mmt' | 'scales_tests';
export type ProgressSubTab = 'trajectory' | 'charts';
type DesktopPresentation = 'cards' | 'table';

interface LongitudinalComparisonViewProps {
  episodeStore: EpisodeScopedClinicalStore;
  episodeTitle: string;
  patientName?: string;
  sessionsCount?: number;
  onSnapshotAdded: (updatedStore: EpisodeScopedClinicalStore) => void;
  onPrintProgressReport?: () => void;
  activeSubTab?: ProgressSubTab;
  onSubTabChange?: (tab: ProgressSubTab) => void;
  chartsContent?: React.ReactNode;
}

function deltaToneClass(direction: DeltaDirection): string {
  if (direction === 'improved') return 'text-emerald-600 dark:text-emerald-400';
  if (direction === 'worsened') return 'text-rose-600 dark:text-rose-400';
  return 'text-muted-foreground-1';
}

function sparklineStrokeColor(direction: DeltaDirection): string {
  if (direction === 'improved') return '#059669';
  if (direction === 'worsened') return '#dc2626';
  return '#0f766e';
}

const InlineSparkline: React.FC<{
  values: Array<number | null | undefined>;
  direction: DeltaDirection;
  ariaLabel: string;
}> = ({ values, direction, ariaLabel }) => {
  const numeric = values.filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v)
  );
  const coords = normalizeSparklineCoords(numeric, 68, 22, 4, 4);
  if (coords.length === 0) return null;

  const stroke = sparklineStrokeColor(direction);
  const last = coords[coords.length - 1];

  return (
    <svg
      width="68"
      height="22"
      viewBox="0 0 68 22"
      role="img"
      aria-label={ariaLabel}
      className="shrink-0 overflow-visible"
    >
      {coords.length > 1 && (
        <polyline
          fill="none"
          stroke={stroke}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={coords.map((c) => `${c.x},${c.y}`).join(' ')}
        />
      )}
      {coords.map((c, i) => {
        const isLast = i === coords.length - 1;
        return (
          <circle
            key={i}
            cx={c.x}
            cy={c.y}
            r={isLast ? 2.6 : 1.5}
            fill={isLast ? stroke : 'currentColor'}
            className={isLast ? '' : 'text-muted-foreground-1/50'}
          />
        );
      })}
      {coords.length === 1 && (
        <line
          x1="8"
          y1={last.y}
          x2="60"
          y2={last.y}
          stroke={stroke}
          strokeOpacity="0.25"
          strokeDasharray="2 2"
          strokeWidth="1"
        />
      )}
    </svg>
  );
};

const DeltaDirectionIcon: React.FC<{ direction: DeltaDirection }> = ({ direction }) => {
  if (direction === 'improved') {
    return <ArrowUpRight className="size-3.5 shrink-0" aria-hidden="true" />;
  }
  if (direction === 'worsened') {
    return <ArrowDownRight className="size-3.5 shrink-0" aria-hidden="true" />;
  }
  return <ArrowRight className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />;
};

interface SparklineTrajectoryRowData {
  id: string;
  title: React.ReactNode;
  subtitle?: string;
  fromDisplay: React.ReactNode;
  currentDisplay: React.ReactNode;
  deltaDisplay: React.ReactNode;
  direction: DeltaDirection;
  mcidMet?: boolean;
  sparkValues: Array<number | null>;
  milestoneValues: Array<{ label: string; date?: string; valueDisplay: React.ReactNode }>;
}

export const LongitudinalComparisonView: React.FC<LongitudinalComparisonViewProps> = ({
  episodeStore,
  episodeTitle,
  patientName,
  sessionsCount,
  onSnapshotAdded,
  onPrintProgressReport,
  activeSubTab: controlledSubTab,
  onSubTabChange,
  chartsContent,
}) => {
  const { language, bi, isRtl } = useLanguage();

  const snapshots = episodeStore.snapshots || [];

  // Controlled/uncontrolled sub-tab state (`trajectory` vs `charts`)
  const [internalSubTab, setInternalSubTab] = useState<ProgressSubTab>('trajectory');
  const activeSubTab = controlledSubTab ?? internalSubTab;
  const setSubTab = (next: ProgressSubTab) => {
    setInternalSubTab(next);
    onSubTabChange?.(next);
  };

  // Capture Snapshot Bottom Sheet / Modal state
  const [isCaptureSheetOpen, setIsCaptureSheetOpen] = useState(false);
  const [snapshotType, setSnapshotType] = useState<ClinicalAssessmentSnapshot['snapshotType']>(() =>
    snapshots.length === 0 ? 'initial_evaluation' : 're_evaluation'
  );
  const [customSnapshotLabel, setCustomSnapshotLabel] = useState('');
  const [justRecorded, setJustRecorded] = useState(false);

  // Share & Export Menu state
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [exportedCsv, setExportedCsv] = useState(false);

  // Filters & presentation toggles
  const [categoryFilter, setCategoryFilter] = useState<MatrixCategoryFilter>('all');
  const [changesOnly, setChangesOnly] = useState(false);
  const [desktopPresentation, setDesktopPresentation] = useState<DesktopPresentation>('table');
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [showMilestoneNotes, setShowMilestoneNotes] = useState(false);

  // Pairwise comparison selectors (shown progressively when >= 2 snapshots exist)
  const [compareFromId, setCompareFromId] = useState<string>(() => snapshots[0]?.id || '__current__');
  const [compareToId, setCompareToId] = useState<string>('__current__');

  useEffect(() => {
    setSnapshotType(snapshots.length === 0 ? 'initial_evaluation' : 're_evaluation');
    if (snapshots.length === 0) {
      setCompareFromId('__current__');
      setCompareToId('__current__');
      return;
    }
    const validIds = new Set([...snapshots.map((s) => s.id), '__current__']);
    setCompareFromId((prev) => (prev !== '__current__' && validIds.has(prev) ? prev : snapshots[0].id));
    setCompareToId((prev) => (validIds.has(prev) ? prev : '__current__'));
  }, [episodeStore.episodeId, snapshots.length]);

  // Close export dropdown on outside click or Escape
  useEffect(() => {
    if (!isExportMenuOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsExportMenuOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isExportMenuOpen]);

  const handleCaptureSnapshot = (overrideType?: ClinicalAssessmentSnapshot['snapshotType']) => {
    const trimmedCustom = customSnapshotLabel.trim();
    ClinicOperationsService.recordEpisodeSnapshot(
      episodeStore.episodeId,
      episodeStore.patientId,
      overrideType || snapshotType,
      trimmedCustom || undefined,
      trimmedCustom || undefined
    );
    const refreshed = ClinicOperationsService.getEpisodeClinicalStore(
      episodeStore.episodeId,
      episodeStore.patientId
    );
    onSnapshotAdded(refreshed);
    setCustomSnapshotLabel('');
    setIsCaptureSheetOpen(false);
    setJustRecorded(true);
    setTimeout(() => setJustRecorded(false), 2500);
  };

  // Normalized timepoints
  const comparisonPoints = useMemo<ComparisonPointData[]>(() => {
    const snapPoints = snapshots.map((s, idx) => buildComparisonPointFromSnapshot(s, idx === 0));
    return [...snapPoints, buildComparisonPointFromLiveStore(episodeStore)];
  }, [snapshots, episodeStore]);

  const livePoint = comparisonPoints[comparisonPoints.length - 1];
  const fromPoint =
    comparisonPoints.find((p) => p.id === compareFromId) || comparisonPoints[0] || livePoint;
  const toPoint = comparisonPoints.find((p) => p.id === compareToId) || livePoint;
  const isComparingDifferentPoints = fromPoint.id !== toPoint.id;

  const currentRomEntries = useMemo(
    () =>
      (episodeStore.objective?.romBattery?.entries || []).filter(
        (r) => r.isTested && r.measuredAngleDegrees !== null
      ),
    [episodeStore.objective?.romBattery?.entries]
  );

  const currentMmtEntries = useMemo(
    () =>
      (episodeStore.objective?.mmtBattery?.entries || []).filter(
        (m) => m.isTested && m.gradeValue !== null
      ),
    [episodeStore.objective?.mmtBattery?.entries]
  );

  const uniqueRomKeys = useMemo(
    () =>
      Array.from(
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
      ),
    [snapshots, currentRomEntries]
  );

  const uniqueMmtKeys = useMemo(
    () =>
      Array.from(
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
      ),
    [snapshots, currentMmtEntries]
  );

  const performanceRows = useMemo(
    () => computePerformanceTestProgress(episodeStore.performanceTests),
    [episodeStore.performanceTests]
  );

  const painRestDelta = useMemo(
    () => computePainDelta(fromPoint.painRest, toPoint.painRest),
    [fromPoint.painRest, toPoint.painRest]
  );

  const painActivityDelta = useMemo(
    () => computePainDelta(fromPoint.painActivity, toPoint.painActivity),
    [fromPoint.painActivity, toPoint.painActivity]
  );

  const specialTestsDelta = useMemo(
    () =>
      computeSpecialTestsDelta(
        fromPoint.specialTestsPositiveCount,
        toPoint.specialTestsPositiveCount
      ),
    [fromPoint.specialTestsPositiveCount, toPoint.specialTestsPositiveCount]
  );

  const outcomeEval = useMemo(() => {
    if (!fromPoint.outcomeScale || !toPoint.outcomeScale) return null;
    if (fromPoint.outcomeScale.scaleId !== toPoint.outcomeScale.scaleId) return null;
    return evaluateBaselineChange(
      toPoint.outcomeScale.scaleId as ValidatedScaleId,
      fromPoint.outcomeScale.rawScore ?? fromPoint.outcomeScale.scorePercentage,
      toPoint.outcomeScale.rawScore ?? toPoint.outcomeScale.scorePercentage,
      fromPoint.outcomeScale.scorePercentage,
      toPoint.outcomeScale.scorePercentage,
      episodeStore.functionalScales?.customMeasureConfig
    );
  }, [fromPoint.outcomeScale, toPoint.outcomeScale, episodeStore.functionalScales?.customMeasureConfig]);

  const latLabel = (lat?: string) =>
    lat === 'right'
      ? bi('يمين', 'R', 'ڕاست')
      : lat === 'left'
        ? bi('يسار', 'L', 'چەپ')
        : lat === 'bilateral'
          ? bi('ثنائي', 'B', 'دوولایەنە')
          : lat || '';

  const romDisplayRows = useMemo(() => {
    return uniqueRomKeys.map((romKey) => {
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
            `${liveMatch.jointNameAr} - ${liveMatch.movementNameAr} (${latLabel(liveMatch.laterality)})`,
            `${liveMatch.jointNameEn} ${liveMatch.movementNameEn} (${latLabel(liveMatch.laterality)})`
          )
        : bi(snapMatch?.labelAr || romKey, snapMatch?.labelEn || romKey);

      const fromVal = fromPoint.romByKey.get(romKey);
      const toVal = toPoint.romByKey.get(romKey);
      const currentVal = liveMatch?.measuredAngleDegrees ?? null;
      const refUninvolved = liveMatch?.referenceUninvolvedAngleDegrees ?? null;
      const symmetryPct =
        currentVal !== null && refUninvolved && refUninvolved > 0
          ? Math.min(100, Math.round((currentVal / refUninvolved) * 100))
          : null;
      const delta = computeRomDelta(fromVal, toVal);

      return {
        romKey,
        label,
        fromVal,
        toVal,
        currentVal,
        symmetryPct,
        delta,
        changed: delta !== null && delta.signedChange !== 0,
      };
    });
  }, [uniqueRomKeys, currentRomEntries, snapshots, fromPoint, toPoint, bi]);

  const mmtDisplayRows = useMemo(() => {
    return uniqueMmtKeys.map((mmtKey) => {
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
            `${liveMatch.muscleNameAr} (${latLabel(liveMatch.laterality)})`,
            `${liveMatch.muscleNameEn} (${latLabel(liveMatch.laterality)})`
          )
        : bi(snapMatch?.labelAr || mmtKey, snapMatch?.labelEn || mmtKey);

      const fromVal = fromPoint.mmtByKey.get(mmtKey);
      const toVal = toPoint.mmtByKey.get(mmtKey);
      const currentGrade = liveMatch?.gradeValue ?? null;
      const delta = computeMmtDelta(fromVal, toVal);

      return {
        mmtKey,
        label,
        fromVal,
        toVal,
        currentGrade,
        delta,
        changed: Boolean(fromVal && toVal && fromVal !== toVal),
      };
    });
  }, [uniqueMmtKeys, currentMmtEntries, snapshots, fromPoint, toPoint, bi]);

  const avgRomGain = useMemo(() => {
    const matched = romDisplayRows.filter((r) => r.delta !== null);
    if (matched.length === 0) return null;
    const sum = matched.reduce((acc, r) => acc + (r.delta?.signedChange || 0), 0);
    return {
      avg: Math.round(sum / matched.length),
      count: matched.length,
    };
  }, [romDisplayRows]);

  const goalsSummary = useMemo(() => {
    const smart = episodeStore.smartGoals || [];
    const outcomeGoals = episodeStore.outcomeGoals || [];
    const smartAchieved = smart.filter(
      (g) => g.status === 'achieved' || (typeof g.gasScore === 'number' && g.gasScore >= 0)
    ).length;
    const outcomeAchieved = outcomeGoals.filter((g) => {
      if (typeof g.currentScore !== 'number') return false;
      const higherBetter = g.targetScore >= g.baselineScore;
      return higherBetter ? g.currentScore >= g.targetScore : g.currentScore <= g.targetScore;
    }).length;
    return {
      achieved: smartAchieved + outcomeAchieved,
      total: smart.length + outcomeGoals.length,
    };
  }, [episodeStore.smartGoals, episodeStore.outcomeGoals]);

  const clinicalVerdict = useMemo(
    () =>
      buildClinicalVerdictText({
        language,
        painActivityDelta: isComparingDifferentPoints ? painActivityDelta : null,
        avgRomGain: isComparingDifferentPoints ? avgRomGain : null,
        outcomeImproved: outcomeEval ? outcomeEval.improved : null,
        outcomeMcidMet: Boolean(outcomeEval?.mcidMet),
        goalsAchieved: goalsSummary.achieved,
        goalsTotal: goalsSummary.total,
      }),
    [
      language,
      isComparingDifferentPoints,
      painActivityDelta,
      avgRomGain,
      outcomeEval,
      goalsSummary,
    ]
  );

  const snapshotsWithNotes = useMemo(
    () =>
      snapshots.filter(
        (s) => Boolean(s.clinicalImpressionNote && s.clinicalImpressionNote.trim()) || Boolean(s.recordedBy)
      ),
    [snapshots]
  );

  const handleCopySummary = async () => {
    const summaryText = buildLongitudinalSummaryText({
      language,
      patientName,
      episodeTitle,
      fromPoint,
      toPoint,
      romRows: romDisplayRows.map((r) => ({
        label: r.label,
        fromVal: r.fromVal,
        toVal: r.toVal,
      })),
      mmtRows: mmtDisplayRows.map((m) => ({
        label: m.label,
        fromVal: m.fromVal,
        toVal: m.toVal,
      })),
      performanceRows,
      goalsAchieved: goalsSummary.achieved,
      goalsTotal: goalsSummary.total,
      customMeasureConfig: episodeStore.functionalScales?.customMeasureConfig,
    });
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(summaryText);
        setCopiedSummary(true);
        setTimeout(() => setCopiedSummary(false), 2200);
      }
    } catch {
      // Clipboard write may be restricted
    }
    setIsExportMenuOpen(false);
  };

  const handleExportCsv = () => {
    const csvRows: Array<{
      parameter: string;
      snapshotValues: string[];
      currentValue: string;
      changeValue: string;
    }> = [];

    csvRows.push({
      parameter: bi('شدة الألم أثناء الراحة (NPRS)', 'Pain at Rest (NPRS)'),
      snapshotValues: snapshots.map((s) => `${s.painNrsRest}/10`),
      currentValue: `${livePoint.painRest}/10`,
      changeValue: painRestDelta?.formatted || '—',
    });

    csvRows.push({
      parameter: bi('شدة الألم مع الحركة (NPRS)', 'Pain on Activity (NPRS)'),
      snapshotValues: snapshots.map((s) => `${s.painNrsActivity}/10`),
      currentValue: `${livePoint.painActivity}/10`,
      changeValue: painActivityDelta
        ? `${painActivityDelta.formatted}${painActivityDelta.mcidMet ? ' (MCID)' : ''}`
        : '—',
    });

    if (episodeStore.functionalScales || snapshots.some((s) => s.outcomeScale)) {
      const scaleCode =
        episodeStore.functionalScales?.scaleId?.toUpperCase() ||
        snapshots.find((s) => s.outcomeScale)?.outcomeScale?.scaleId?.toUpperCase() ||
        'OUTCOME';
      csvRows.push({
        parameter: `${bi('المقياس الوظيفي', 'Functional Scale')} (${scaleCode})`,
        snapshotValues: snapshots.map((s) =>
          s.outcomeScale ? `${s.outcomeScale.scorePercentage}%` : '—'
        ),
        currentValue: livePoint.outcomeScale ? `${livePoint.outcomeScale.scorePercentage}%` : '—',
        changeValue: outcomeEval
          ? `${outcomeEval.deltaPercent > 0 ? '+' : ''}${outcomeEval.deltaPercent}%${outcomeEval.mcidMet ? ' (MCID)' : ''}`
          : '—',
      });
    }

    csvRows.push({
      parameter: bi('الاختبارات الخاصة الإيجابية', 'Positive Provocative Special Tests'),
      snapshotValues: snapshots.map((s) => String(s.specialTestsPositiveCount ?? 0)),
      currentValue: String(livePoint.specialTestsPositiveCount),
      changeValue: specialTestsDelta?.formatted || '—',
    });

    for (const r of romDisplayRows) {
      csvRows.push({
        parameter: `ROM · ${r.label}`,
        snapshotValues: snapshots.map((snap) => {
          const entry = snap.romSummary.find(
            (item) => resolveLongitudinalRomGroupKey(item) === r.romKey
          );
          return entry?.aromDegrees !== undefined && entry?.aromDegrees !== null
            ? `${entry.aromDegrees}°`
            : '—';
        }),
        currentValue: r.currentVal !== null ? `${r.currentVal}°` : '—',
        changeValue: r.delta?.formatted || '—',
      });
    }

    for (const m of mmtDisplayRows) {
      csvRows.push({
        parameter: `MMT · ${m.label}`,
        snapshotValues: snapshots.map((snap) => {
          const entry = snap.mmtSummary.find(
            (item) => resolveLongitudinalMmtGroupKey(item) === m.mmtKey
          );
          return entry ? `${entry.grade}/5` : '—';
        }),
        currentValue: m.currentGrade ? `${m.currentGrade}/5` : '—',
        changeValue: m.delta?.formatted || '—',
      });
    }

    const csv = buildLongitudinalMatrixCsv({
      language,
      snapshots,
      rows: csvRows,
    });
    downloadCsvFile(`physiorecord-progress-${episodeStore.episodeId.slice(0, 8)}.csv`, csv);
    setExportedCsv(true);
    setTimeout(() => setExportedCsv(false), 2200);
    setIsExportMenuOpen(false);
  };

  // Visibility filters
  const showPainSection = categoryFilter === 'all' || categoryFilter === 'pain';
  const showScalesTestsSection = categoryFilter === 'all' || categoryFilter === 'scales_tests';
  const showRomSection = categoryFilter === 'all' || categoryFilter === 'rom';
  const showMmtSection = categoryFilter === 'all' || categoryFilter === 'mmt';

  const visiblePainRest =
    showPainSection && (!changesOnly || (painRestDelta !== null && painRestDelta.signedChange !== 0));
  const visiblePainActivity =
    showPainSection &&
    (!changesOnly || (painActivityDelta !== null && painActivityDelta.signedChange !== 0));
  const visibleOutcomeScale =
    showScalesTestsSection &&
    (!changesOnly || (outcomeEval !== null && outcomeEval.deltaRaw !== 0));
  const visibleSpecialTests =
    showScalesTestsSection &&
    (!changesOnly || (specialTestsDelta !== null && specialTestsDelta.signedChange !== 0));
  const visibleRomRows = showRomSection
    ? romDisplayRows.filter((r) => !changesOnly || r.changed)
    : [];
  const visibleMmtRows = showMmtSection
    ? mmtDisplayRows.filter((m) => !changesOnly || m.changed)
    : [];

  // Unified Sparkline Trajectory Rows (for mobile-first flashlight view & desktop cards toggle)
  const sparklineRows = useMemo<SparklineTrajectoryRowData[]>(() => {
    const rows: SparklineTrajectoryRowData[] = [];

    if (visiblePainRest) {
      rows.push({
        id: 'pain_rest',
        title: (
          <>
            {bi('شدة الألم أثناء الراحة', 'Pain at Rest', 'ئازار لە پشوودا')}{' '}
            <ClinicalAbbr code="NPRS" className="text-xs text-muted-foreground-1" />
          </>
        ),
        fromDisplay: <Fraction value={fromPoint.painRest} total={10} />,
        currentDisplay: <Fraction value={livePoint.painRest} total={10} />,
        deltaDisplay:
          isComparingDifferentPoints && painRestDelta ? painRestDelta.formatted : '—',
        direction: isComparingDifferentPoints && painRestDelta ? painRestDelta.direction : 'unchanged',
        mcidMet: Boolean(isComparingDifferentPoints && painRestDelta?.mcidMet),
        sparkValues: comparisonPoints.map((pt) => pt.painRest),
        milestoneValues: comparisonPoints.map((pt) => ({
          label: bi(pt.labelAr, pt.labelEn),
          date: pt.date,
          valueDisplay: <Fraction value={pt.painRest} total={10} />,
        })),
      });
    }

    if (visiblePainActivity) {
      rows.push({
        id: 'pain_activity',
        title: (
          <>
            {bi('شدة الألم مع الحركة', 'Pain on Activity', 'ئازار لە جوڵەدا')}{' '}
            <ClinicalAbbr code="NPRS" className="text-xs text-muted-foreground-1" />
          </>
        ),
        fromDisplay: <Fraction value={fromPoint.painActivity} total={10} />,
        currentDisplay: <Fraction value={livePoint.painActivity} total={10} />,
        deltaDisplay:
          isComparingDifferentPoints && painActivityDelta ? painActivityDelta.formatted : '—',
        direction:
          isComparingDifferentPoints && painActivityDelta ? painActivityDelta.direction : 'unchanged',
        mcidMet: Boolean(isComparingDifferentPoints && painActivityDelta?.mcidMet),
        sparkValues: comparisonPoints.map((pt) => pt.painActivity),
        milestoneValues: comparisonPoints.map((pt) => ({
          label: bi(pt.labelAr, pt.labelEn),
          date: pt.date,
          valueDisplay: <Fraction value={pt.painActivity} total={10} />,
        })),
      });
    }

    if (visibleOutcomeScale && (episodeStore.functionalScales || snapshots.some((s) => s.outcomeScale))) {
      const scaleCode =
        episodeStore.functionalScales?.scaleId?.toUpperCase() ||
        snapshots.find((s) => s.outcomeScale)?.outcomeScale?.scaleId?.toUpperCase() ||
        'Outcome';
      const dir: DeltaDirection = !outcomeEval
        ? 'unchanged'
        : outcomeEval.improved
          ? 'improved'
          : outcomeEval.deltaRaw === 0
            ? 'unchanged'
            : 'worsened';

      rows.push({
        id: 'outcome_scale',
        title: `${bi('المقياس الوظيفي', 'Functional Scale', 'پێوانەی فرمانی')} (${scaleCode})`,
        fromDisplay: fromPoint.outcomeScale ? `${fromPoint.outcomeScale.scorePercentage}%` : '—',
        currentDisplay: livePoint.outcomeScale ? `${livePoint.outcomeScale.scorePercentage}%` : '—',
        deltaDisplay:
          isComparingDifferentPoints && outcomeEval
            ? outcomeEval.deltaPercent > 0
              ? `+${outcomeEval.deltaPercent}%`
              : outcomeEval.deltaPercent < 0
                ? `\u2212${Math.abs(outcomeEval.deltaPercent)}%`
                : '0%'
            : '—',
        direction: isComparingDifferentPoints ? dir : 'unchanged',
        mcidMet: Boolean(isComparingDifferentPoints && outcomeEval?.mcidMet),
        sparkValues: comparisonPoints.map((pt) => pt.outcomeScale?.scorePercentage ?? null),
        milestoneValues: comparisonPoints.map((pt) => ({
          label: bi(pt.labelAr, pt.labelEn),
          date: pt.date,
          valueDisplay: pt.outcomeScale ? `${pt.outcomeScale.scorePercentage}%` : '—',
        })),
      });
    }

    if (visibleSpecialTests) {
      rows.push({
        id: 'special_tests',
        title: bi(
          'الاختبارات الاستفزازية الإيجابية',
          'Positive Special Tests',
          'تاقیکردنەوە ئەرێنییەکان'
        ),
        fromDisplay: String(fromPoint.specialTestsPositiveCount),
        currentDisplay: String(livePoint.specialTestsPositiveCount),
        deltaDisplay:
          isComparingDifferentPoints && specialTestsDelta ? specialTestsDelta.formatted : '—',
        direction:
          isComparingDifferentPoints && specialTestsDelta ? specialTestsDelta.direction : 'unchanged',
        sparkValues: comparisonPoints.map((pt) => pt.specialTestsPositiveCount),
        milestoneValues: comparisonPoints.map((pt) => ({
          label: bi(pt.labelAr, pt.labelEn),
          date: pt.date,
          valueDisplay: String(pt.specialTestsPositiveCount),
        })),
      });
    }

    for (const r of visibleRomRows) {
      rows.push({
        id: `rom_${r.romKey}`,
        title: `ROM · ${r.label}`,
        subtitle:
          r.symmetryPct !== null
            ? bi(
                `تماثل مع الطرف السليم: ${r.symmetryPct}%`,
                `Uninvolved symmetry: ${r.symmetryPct}%`,
                `هاوسەنگی لەگەڵ لای ساخ: ${r.symmetryPct}%`
              )
            : undefined,
        fromDisplay: r.fromVal !== undefined ? `${r.fromVal}°` : '—',
        currentDisplay: r.currentVal !== null ? `${r.currentVal}°` : '—',
        deltaDisplay: isComparingDifferentPoints && r.delta ? r.delta.formatted : '—',
        direction: isComparingDifferentPoints && r.delta ? r.delta.direction : 'unchanged',
        sparkValues: comparisonPoints.map((pt) => pt.romByKey.get(r.romKey) ?? null),
        milestoneValues: comparisonPoints.map((pt) => {
          const val = pt.romByKey.get(r.romKey);
          return {
            label: bi(pt.labelAr, pt.labelEn),
            date: pt.date,
            valueDisplay: val !== undefined ? `${val}°` : '—',
          };
        }),
      });
    }

    for (const m of visibleMmtRows) {
      rows.push({
        id: `mmt_${m.mmtKey}`,
        title: `MMT · ${m.label}`,
        fromDisplay: m.fromVal ? <Fraction value={m.fromVal} total={5} /> : '—',
        currentDisplay: m.currentGrade ? <Fraction value={m.currentGrade} total={5} /> : '—',
        deltaDisplay: isComparingDifferentPoints && m.delta ? m.delta.formatted : '—',
        direction: isComparingDifferentPoints && m.delta ? m.delta.direction : 'unchanged',
        sparkValues: comparisonPoints.map((pt) => parseMmtGradeNumeric(pt.mmtByKey.get(m.mmtKey))),
        milestoneValues: comparisonPoints.map((pt) => {
          const g = pt.mmtByKey.get(m.mmtKey);
          return {
            label: bi(pt.labelAr, pt.labelEn),
            date: pt.date,
            valueDisplay: g ? <Fraction value={g} total={5} /> : '—',
          };
        }),
      });
    }

    return rows;
  }, [
    visiblePainRest,
    visiblePainActivity,
    visibleOutcomeScale,
    visibleSpecialTests,
    visibleRomRows,
    visibleMmtRows,
    fromPoint,
    livePoint,
    comparisonPoints,
    isComparingDifferentPoints,
    painRestDelta,
    painActivityDelta,
    outcomeEval,
    specialTestsDelta,
    episodeStore.functionalScales,
    snapshots,
    bi,
  ]);

  const categoryButtons: Array<{
    id: MatrixCategoryFilter;
    label: string;
    count?: number;
  }> = [
    { id: 'all', label: bi('الكل', 'All', 'هەموو') },
    { id: 'pain', label: bi('الألم', 'Pain', 'ئازار') },
    { id: 'rom', label: 'ROM', count: romDisplayRows.length },
    { id: 'mmt', label: 'MMT', count: mmtDisplayRows.length },
    { id: 'scales_tests', label: bi('المقاييس', 'Scales', 'پێوەرەکان') },
  ];

  const verdictToneClasses =
    clinicalVerdict.tone === 'improved'
      ? 'text-emerald-700 dark:text-emerald-400'
      : clinicalVerdict.tone === 'worsened'
        ? 'text-rose-700 dark:text-rose-400'
        : 'text-muted-foreground-1';

  return (
    <div className="space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* 1. Calm Compact Top Bar + Milestone Timeline Strip */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-card border border-card-line shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <h2 className="text-sm sm:text-base font-bold text-foreground truncate">
                {bi('التقدم السريري', 'Clinical Progress', 'بەرەوپێشچوونی کلینیکی')}
              </h2>
              <span className="text-xs text-muted-foreground-1 tabular-nums">
                · {snapshots.length}{' '}
                {bi(
                  snapshots.length === 1 ? 'محطة' : 'محطات',
                  snapshots.length === 1 ? 'milestone' : 'milestones',
                  'وێستگە'
                )}
                {typeof sessionsCount === 'number' && (
                  <>
                    {' · '}
                    {sessionsCount} {bi('جلسات', 'sessions', 'دانیشتن')}
                  </>
                )}
              </span>
            </div>
            <p className="text-xs text-muted-foreground-1 truncate">{episodeTitle}</p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Consolidated Export & Share Menu */}
            {snapshots.length > 0 && (
              <div className="relative" ref={exportMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsExportMenuOpen((v) => !v)}
                  aria-expanded={isExportMenuOpen}
                  aria-haspopup="menu"
                  className="h-10 px-3 rounded-xl border border-card-line bg-layer hover:bg-surface text-xs font-semibold text-foreground inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                >
                  {copiedSummary || exportedCsv ? (
                    <>
                      <Check className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span className="text-emerald-700 dark:text-emerald-400">
                        {copiedSummary
                          ? bi('تم النسخ', 'Copied', 'کۆپی کرا')
                          : bi('تم التصدير', 'Exported', 'هەناردە کرا')}
                      </span>
                    </>
                  ) : (
                    <>
                      <Share2 className="size-3.5 text-muted-foreground-1 shrink-0" />
                      <span className="hidden sm:inline">
                        {bi('تصدير ومشاركة', 'Share & Export', 'هاوبەشکردن')}
                      </span>
                      <span className="sm:hidden">{bi('تصدير', 'Export', 'هەناردە')}</span>
                      <ChevronDown className="size-3.5 text-muted-foreground-1 shrink-0" />
                    </>
                  )}
                </button>

                {isExportMenuOpen && (
                  <ClampedMenuPanel
                    role="menu"
                    className="absolute start-0 sm:end-0 sm:start-auto mt-1.5 w-52 rounded-xl bg-layer border border-layer-line shadow-lg py-1 z-30"
                  >
                    {onPrintProgressReport && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setIsExportMenuOpen(false);
                          onPrintProgressReport();
                        }}
                        className="w-full px-3.5 py-2.5 text-xs font-semibold text-foreground hover:bg-surface flex items-center gap-2.5 text-start cursor-pointer"
                      >
                        <Printer className="size-4 text-primary shrink-0" />
                        <span>
                          {bi('طباعة تقرير التقدم', 'Print Progress Report', 'چاپکردنی ڕاپۆرت')}
                        </span>
                      </button>
                    )}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleCopySummary}
                      className="w-full px-3.5 py-2.5 text-xs font-semibold text-foreground hover:bg-surface flex items-center gap-2.5 text-start cursor-pointer"
                    >
                      <Copy className="size-4 text-muted-foreground-1 shrink-0" />
                      <span>
                        {bi('نسخ ملخص للواتساب', 'Copy WhatsApp Summary', 'کۆپیکردنی پوختە')}
                      </span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleExportCsv}
                      className="w-full px-3.5 py-2.5 text-xs font-semibold text-foreground hover:bg-surface flex items-center gap-2.5 text-start cursor-pointer"
                    >
                      <Download className="size-4 text-muted-foreground-1 shrink-0" />
                      <span>{bi('تصدير جدول CSV', 'Export CSV Table', 'هەناردەی CSV')}</span>
                    </button>
                  </ClampedMenuPanel>
                )}
              </div>
            )}

            {/* Primary CTA: Opens Clean Bottom Sheet for Snapshot Capture */}
            <button
              type="button"
              onClick={() => setIsCaptureSheetOpen(true)}
              className={`h-10 px-3.5 sm:px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs cursor-pointer whitespace-nowrap transition-colors ${
                justRecorded
                  ? 'bg-emerald-600 text-white'
                  : 'bg-primary hover:bg-primary-hover text-primary-foreground'
              }`}
            >
              {justRecorded ? (
                <>
                  <CheckCircle2 className="size-4 shrink-0" />
                  <span>{bi('تم التوثيق', 'Captured', 'تۆمارکرا')}</span>
                </>
              ) : (
                <>
                  <Plus className="size-4 shrink-0" />
                  <span>{bi('لقطة جديدة', 'New Snapshot', 'پێوانەی نوێ')}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Horizontal Milestone Timeline Strip */}
        {snapshots.length > 0 && (
          <div
            aria-label={bi('الخط الزمني للمحطات السريرية', 'Clinical milestone timeline', 'هێڵی کاتیی وێستگەکان')}
            className="pt-2.5 border-t border-card-divider flex items-center gap-2 overflow-x-auto pb-0.5"
          >
            {snapshots.map((snap, idx) => {
              const isFrom = snap.id === fromPoint.id;
              const isTo = snap.id === toPoint.id;
              const shortTitle =
                idx === 0
                  ? bi('خط الأساس', 'Baseline', 'بنەڕەتی')
                  : bi(snap.labelAr, snap.labelEn);
              return (
                <React.Fragment key={snap.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (snapshots.length >= 2) {
                        setCompareFromId(snap.id);
                        if (toPoint.id === snap.id) setCompareToId('__current__');
                      } else {
                        setShowMilestoneNotes((v) => !v);
                      }
                    }}
                    className={`shrink-0 h-9 px-3 rounded-xl border text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                      isFrom || isTo
                        ? 'border-primary/40 bg-primary/10 text-primary font-bold'
                        : 'border-card-line bg-surface/60 text-foreground hover:bg-surface font-medium'
                    }`}
                  >
                    <span className="truncate max-w-[140px]">{shortTitle}</span>
                    <span className="text-muted-foreground-1 font-mono tabular-nums font-normal">
                      <bdi dir="ltr">{formatDateDDMMYYYY(snap.recordedDate)}</bdi>
                    </span>
                  </button>
                  <span className="text-muted-foreground-1/50 shrink-0" aria-hidden="true">
                    {isRtl ? '←' : '→'}
                  </span>
                </React.Fragment>
              );
            })}
            <button
              type="button"
              onClick={() => {
                if (snapshots.length >= 2) setCompareToId('__current__');
              }}
              className={`shrink-0 h-9 px-3 rounded-xl border text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                toPoint.id === '__current__'
                  ? 'border-primary/40 bg-primary/10 text-primary font-bold'
                  : 'border-card-line bg-surface/60 text-foreground hover:bg-surface font-medium'
              }`}
            >
              <span>{bi('الحالي', 'Current', 'ئێستا')}</span>
            </button>
          </div>
        )}
      </div>

      {/* Empty State when Zero Snapshots Recorded */}
      {snapshots.length === 0 ? (
        <div className="bg-card rounded-2xl border border-card-line shadow-2xs p-8 sm:p-10 text-center space-y-3">
          <div className="size-12 rounded-2xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center mx-auto">
            <FileBarChart className="size-6" />
          </div>
          <h3 className="text-sm font-bold text-foreground">
            {bi(
              'التقط قراءة مرجعية للمقارنة',
              'Capture a baseline snapshot to track progress',
              'پێوانەیەکی بنەڕەتی تۆمار بکە بۆ بەراوردکردن'
            )}
          </h3>
          <p className="text-xs text-muted-foreground-1 max-w-md mx-auto leading-relaxed">
            {bi(
              'لم يتم حفظ أي نقطة مرجعية (Baseline) لحلقة الرعاية هذه بعد. ثبّت القراءات الحالية لفتح خط المقارنة والرسوم البيانية.',
              'No baseline milestone has been saved for this episode yet. Capture the current assessment to unlock longitudinal comparisons and trend lines.',
              'هێشتا هیچ پێوانەیەکی بنەڕەتی بۆ ئەم قۆناغە تۆمار نەکراوە. پێوانەکانی ئێستا تۆمار بکە بۆ بینینی بەراورد و هێڵکاری.'
            )}
          </p>
          <div className="pt-1 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => handleCaptureSnapshot('initial_evaluation')}
              className="h-11 px-5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Plus className="size-4 shrink-0" />
              <span>
                {bi(
                  'تثبيت التقييم الأولي (Baseline)',
                  'Capture Initial Baseline',
                  'تۆمارکردنی بنەڕەتی (Baseline)'
                )}
              </span>
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* 2. Unified Clinical Verdict & 4-Metric Compact Strip */}
          <div className="rounded-2xl bg-card border border-card-line shadow-2xs overflow-hidden">
            <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 divide-x rtl:divide-x-reverse divide-card-divider">
              {/* Metric 1: Activity Pain */}
              <div className="p-3.5 space-y-0.5">
                <div className="text-xs text-muted-foreground-1">
                  {bi('الألم مع الحركة (NPRS)', 'Activity Pain', 'ئازاری جوڵە')}
                </div>
                <div className="flex items-baseline justify-between gap-2 tabular-nums">
                  <span className="text-sm sm:text-base font-bold font-mono text-foreground">
                    <bdi dir="ltr">
                      {fromPoint.painActivity} → {toPoint.painActivity}/10
                    </bdi>
                  </span>
                  {isComparingDifferentPoints && painActivityDelta && (
                    <span
                      className={`text-xs font-mono font-bold ${deltaToneClass(painActivityDelta.direction)}`}
                    >
                      <bdi dir="ltr">{painActivityDelta.formatted}</bdi>
                    </span>
                  )}
                </div>
              </div>

              {/* Metric 2: Average ROM Gain */}
              <div className="p-3.5 space-y-0.5">
                <div className="text-xs text-muted-foreground-1">
                  {bi('متوسط المدى الحركي (ROM)', 'Mean ROM Change', 'ناوەندی ROM')}
                </div>
                <div className="flex items-baseline justify-between gap-2 tabular-nums">
                  <span
                    className={`text-sm sm:text-base font-bold font-mono ${
                      !isComparingDifferentPoints || avgRomGain === null
                        ? 'text-foreground'
                        : avgRomGain.avg > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : avgRomGain.avg < 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-foreground'
                    }`}
                  >
                    <bdi dir="ltr">
                      {!isComparingDifferentPoints || avgRomGain === null
                        ? '—'
                        : avgRomGain.avg > 0
                          ? `+${avgRomGain.avg}°`
                          : avgRomGain.avg < 0
                            ? `\u2212${Math.abs(avgRomGain.avg)}°`
                            : '0°'}
                    </bdi>
                  </span>
                  <span className="text-xs text-muted-foreground-1">
                    {avgRomGain !== null
                      ? bi(`${avgRomGain.count} مفاصل`, `${avgRomGain.count} joints`, `${avgRomGain.count} جومگە`)
                      : `${romDisplayRows.length} ${bi('مسجل', 'logged', 'تۆمار')}`}
                  </span>
                </div>
              </div>

              {/* Metric 3: Functional Outcome Scale */}
              <div className="p-3.5 space-y-0.5">
                <div className="text-xs text-muted-foreground-1 truncate">
                  {toPoint.outcomeScale
                    ? `${bi('المقياس', 'Scale', 'پێوەر')} (${toPoint.outcomeScale.scaleId.toUpperCase()})`
                    : bi('المقياس الوظيفي', 'Outcome Scale', 'پێوەری فرمانی')}
                </div>
                <div className="flex items-baseline justify-between gap-2 tabular-nums">
                  <span className="text-sm sm:text-base font-bold font-mono text-foreground">
                    <bdi dir="ltr">
                      {fromPoint.outcomeScale && toPoint.outcomeScale
                        ? `${fromPoint.outcomeScale.scorePercentage}% → ${toPoint.outcomeScale.scorePercentage}%`
                        : toPoint.outcomeScale
                          ? `${toPoint.outcomeScale.scorePercentage}%`
                          : '—'}
                    </bdi>
                  </span>
                  {isComparingDifferentPoints && outcomeEval && (
                    <span
                      className={`text-xs font-mono font-bold ${
                        outcomeEval.improved
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : outcomeEval.deltaRaw === 0
                            ? 'text-muted-foreground-1'
                            : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      <bdi dir="ltr">
                        {outcomeEval.deltaPercent > 0
                          ? `+${outcomeEval.deltaPercent}%`
                          : outcomeEval.deltaPercent < 0
                            ? `\u2212${Math.abs(outcomeEval.deltaPercent)}%`
                            : '0%'}
                      </bdi>
                    </span>
                  )}
                </div>
              </div>

              {/* Metric 4: Goals & Special Tests */}
              <div className="p-3.5 space-y-0.5">
                <div className="text-xs text-muted-foreground-1">
                  {goalsSummary.total > 0
                    ? bi('الأهداف المحققة', 'Goals Achieved', 'ئامانجەکان')
                    : bi('الاختبارات الإيجابية', 'Positive Tests', 'تاقیکردنەوە ئەرێنییەکان')}
                </div>
                <div className="flex items-baseline justify-between gap-2 tabular-nums">
                  {goalsSummary.total > 0 ? (
                    <span className="text-sm sm:text-base font-bold font-mono text-foreground">
                      <bdi dir="ltr">
                        {goalsSummary.achieved} / {goalsSummary.total}
                      </bdi>
                    </span>
                  ) : (
                    <>
                      <span className="text-sm sm:text-base font-bold font-mono text-foreground">
                        <bdi dir="ltr">
                          {fromPoint.specialTestsPositiveCount} → {toPoint.specialTestsPositiveCount}
                        </bdi>
                      </span>
                      {isComparingDifferentPoints && specialTestsDelta && (
                        <span
                          className={`text-xs font-mono font-bold ${deltaToneClass(specialTestsDelta.direction)}`}
                        >
                          <bdi dir="ltr">{specialTestsDelta.formatted}</bdi>
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Quiet 1-Line Clinical Verdict Footer */}
            <div className="px-3.5 sm:px-4 py-2.5 border-t border-card-divider bg-surface/35 flex flex-wrap items-center justify-between gap-2 text-xs">
              <p className={`font-medium leading-relaxed ${verdictToneClasses}`}>
                <span className="font-bold text-foreground me-1.5">
                  {bi('خلاصة التطور:', 'Clinical Verdict:', 'پوختەی بەرەوپێشچوون:')}
                </span>
                <span>{clinicalVerdict.text}</span>
              </p>
            </div>
          </div>

          {/* 3. Segmented View Switcher: [المسار والمقارنة | المخططات والأهداف] */}
          {chartsContent && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div
                role="tablist"
                aria-label={bi('طريقة عرض التقدم', 'Progress view mode', 'شێوازی پیشاندان')}
                className="inline-flex items-center gap-1 p-1 rounded-xl bg-surface/80"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeSubTab === 'trajectory'}
                  onClick={() => setSubTab('trajectory')}
                  className={`h-9 px-3 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                    activeSubTab === 'trajectory'
                      ? 'bg-card text-foreground shadow-2xs'
                      : 'text-muted-foreground-1 hover:text-foreground'
                  }`}
                >
                  <LayoutList className="size-3.5 shrink-0" />
                  <span>{bi('المسار والمقارنة', 'Trajectory & Matrix', 'ڕەوت و بەراورد')}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeSubTab === 'charts'}
                  onClick={() => setSubTab('charts')}
                  className={`h-9 px-3 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                    activeSubTab === 'charts'
                      ? 'bg-card text-foreground shadow-2xs'
                      : 'text-muted-foreground-1 hover:text-foreground'
                  }`}
                >
                  <BarChart3 className="size-3.5 shrink-0" />
                  <span>{bi('المخططات والأهداف', 'Charts & Goals', 'هێڵکاری و ئامانجەکان')}</span>
                </button>
              </div>

              {/* Desktop Only: Toggle between Sparkline Cards and Full Table */}
              {activeSubTab === 'trajectory' && (
                <div className="hidden md:inline-flex items-center gap-1 p-1 rounded-xl bg-surface/80">
                  <button
                    type="button"
                    onClick={() => setDesktopPresentation('cards')}
                    className={`h-8 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                      desktopPresentation === 'cards'
                        ? 'bg-card text-foreground shadow-2xs'
                        : 'text-muted-foreground-1 hover:text-foreground'
                    }`}
                  >
                    <LayoutList className="size-3.5 shrink-0" />
                    <span>{bi('بطاقات المسار', 'Sparklines', 'کارتەکان')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDesktopPresentation('table')}
                    className={`h-8 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                      desktopPresentation === 'table'
                        ? 'bg-card text-foreground shadow-2xs'
                        : 'text-muted-foreground-1 hover:text-foreground'
                    }`}
                  >
                    <Table2 className="size-3.5 shrink-0" />
                    <span>{bi('الجدول الشامل', 'Full Table', 'خشتەی تەواو')}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 4. Main Content Area */}
          {activeSubTab === 'charts' && chartsContent ? (
            <div>{chartsContent}</div>
          ) : (
            <div className="space-y-4">
              {/* Filter Bar + Progressive Pairwise Selector */}
              <div className="bg-card rounded-2xl border border-card-line shadow-2xs overflow-hidden">
                <div className="p-3 sm:px-4 border-b border-card-divider flex flex-col gap-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div
                      role="group"
                      aria-label={bi(
                        'تصفية المعايير السريرية',
                        'Filter clinical parameters',
                        'فلتەری پێوەرەکان'
                      )}
                      className="inline-flex items-center gap-1 overflow-x-auto max-w-full pb-0.5"
                    >
                      {categoryButtons.map((cat) => {
                        const active = categoryFilter === cat.id;
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setCategoryFilter(cat.id)}
                            className={`h-9 px-3 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                              active
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-surface/70 text-muted-foreground-1 hover:text-foreground'
                            }`}
                          >
                            <span>{cat.label}</span>
                            {typeof cat.count === 'number' && cat.count > 0 && (
                              <span className="ms-1 opacity-80 tabular-nums">({cat.count})</span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={() => setChangesOnly((v) => !v)}
                      aria-pressed={changesOnly}
                      className={`h-9 px-3 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        changesOnly
                          ? 'border-primary/40 bg-primary/10 text-primary'
                          : 'border-card-line bg-layer text-muted-foreground-2 hover:text-foreground'
                      }`}
                    >
                      <Filter className="size-3.5 shrink-0" />
                      <span>{bi('المتغيرات فقط', 'Changes Only', 'تەنها گۆڕاوەکان')}</span>
                    </button>
                  </div>

                  {/* Progressive Disclosure: Only show pairwise dropdowns when >= 2 snapshots exist */}
                  {snapshots.length >= 2 && (
                    <div className="flex flex-wrap items-center gap-2 text-xs pt-1 border-t border-card-divider">
                      <span className="text-muted-foreground-1 font-semibold whitespace-nowrap">
                        {bi('مقارنة:', 'Compare:', 'بەراورد:')}
                      </span>
                      <select
                        aria-label={bi('نقطة البداية للمقارنة', 'Compare from timepoint', 'خاڵی دەستپێک')}
                        value={fromPoint.id}
                        onChange={(e) => setCompareFromId(e.target.value)}
                        className="h-9 px-2.5 text-xs font-semibold rounded-lg bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                      >
                        {comparisonPoints.map((pt) => (
                          <option key={pt.id} value={pt.id}>
                            {bi(pt.labelAr, pt.labelEn)}
                            {pt.date ? ` (${formatDateDDMMYYYY(pt.date)})` : ''}
                          </option>
                        ))}
                      </select>
                      <span className="text-muted-foreground-1 font-bold" aria-hidden="true">
                        {isRtl ? '←' : '→'}
                      </span>
                      <select
                        aria-label={bi('نقطة النهاية للمقارنة', 'Compare to timepoint', 'خاڵی کۆتایی')}
                        value={toPoint.id}
                        onChange={(e) => setCompareToId(e.target.value)}
                        className="h-9 px-2.5 text-xs font-semibold rounded-lg bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                      >
                        {comparisonPoints.map((pt) => (
                          <option key={pt.id} value={pt.id}>
                            {bi(pt.labelAr, pt.labelEn)}
                            {pt.date ? ` (${formatDateDDMMYYYY(pt.date)})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Presentation A: Inline Sparkline Rows (Always on mobile < md, or when selected on desktop) */}
                <div
                  className={
                    desktopPresentation === 'cards' ? 'block' : 'block md:hidden'
                  }
                >
                  {sparklineRows.length === 0 ? (
                    <div className="py-8 px-4 text-center text-xs text-muted-foreground-1">
                      {changesOnly
                        ? bi(
                            'لا توجد تغيرات مسجلة بين النقطتين المختارتين ضمن هذا التصنيف.',
                            'No changed parameters between the selected timepoints in this filter.',
                            'هیچ گۆڕانکارییەک لەم فلتەرەدا تۆمار نەکراوە.'
                          )
                        : bi(
                            'لا توجد قياسات مسجلة ضمن هذا التصنيف بعد.',
                            'No measurements recorded in this category yet.',
                            'هێشتا هیچ پێوانەیەک لەم بەشەدا تۆمار نەکراوە.'
                          )}
                    </div>
                  ) : (
                    <div className="divide-y divide-card-divider">
                      {sparklineRows.map((row) => {
                        const isExpanded = expandedRowId === row.id;
                        return (
                          <div key={row.id}>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedRowId((prev) => (prev === row.id ? null : row.id))
                              }
                              aria-expanded={isExpanded}
                              className="w-full px-3.5 sm:px-4 py-3 flex items-center justify-between gap-3 text-start hover:bg-muted/20 transition-colors cursor-pointer min-h-[60px]"
                            >
                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="text-xs sm:text-sm font-bold text-foreground truncate">
                                  {row.title}
                                </div>
                                {row.subtitle && (
                                  <div className="text-xs text-muted-foreground-1 truncate">
                                    {row.subtitle}
                                  </div>
                                )}
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs tabular-nums">
                                  <span className="text-muted-foreground-1">
                                    {bi('المرجع:', 'Ref:', 'بنەڕەت:')}{' '}
                                    <span className="font-mono font-medium text-foreground">
                                      {row.fromDisplay}
                                    </span>
                                  </span>
                                  <span aria-hidden="true" className="text-muted-foreground-1">
                                    ·
                                  </span>
                                  <span
                                    className={`font-mono font-bold inline-flex items-center gap-0.5 ${deltaToneClass(row.direction)}`}
                                  >
                                    <DeltaDirectionIcon direction={row.direction} />
                                    <bdi dir="ltr">{row.deltaDisplay}</bdi>
                                  </span>
                                  {row.mcidMet && (
                                    <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                                      · MCID
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-3 shrink-0">
                                <InlineSparkline
                                  values={row.sparkValues}
                                  direction={row.direction}
                                  ariaLabel={bi('مسار القراءات', 'Reading trend', 'هێڵکاری ڕەوت')}
                                />
                                <div className="text-end tabular-nums min-w-[44px]">
                                  <div className="text-sm font-mono font-bold text-primary">
                                    {row.currentDisplay}
                                  </div>
                                  <div className="text-xs text-muted-foreground-1 flex items-center justify-end gap-0.5">
                                    {isExpanded ? (
                                      <ChevronUp className="size-3.5" />
                                    ) : (
                                      <ChevronDown className="size-3.5" />
                                    )}
                                  </div>
                                </div>
                              </div>
                            </button>

                            {/* Expandable Milestone Timeline Breakdown for This Row */}
                            {isExpanded && (
                              <div className="px-3.5 sm:px-4 pb-3 pt-1 bg-surface/40 border-t border-card-divider">
                                <div className="flex flex-wrap items-center gap-3 text-xs tabular-nums">
                                  {row.milestoneValues.map((mv, mIdx) => (
                                    <div
                                      key={mIdx}
                                      className="flex items-center gap-1.5 text-muted-foreground-2"
                                    >
                                      <span className="font-medium">{mv.label}</span>
                                      {mv.date && (
                                        <span className="text-muted-foreground-1 font-mono">
                                          (<bdi dir="ltr">{formatDateDDMMYYYY(mv.date)}</bdi>)
                                        </span>
                                      )}
                                      <span>:</span>
                                      <span className="font-mono font-bold text-foreground">
                                        {mv.valueDisplay}
                                      </span>
                                      {mIdx < row.milestoneValues.length - 1 && (
                                        <span
                                          aria-hidden="true"
                                          className="ms-1.5 text-muted-foreground-1/50"
                                        >
                                          |
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Presentation B: Full Floodlight Matrix Table (Desktop md+ when 'table' selected) */}
                <div
                  className={
                    desktopPresentation === 'table' ? 'hidden md:block' : 'hidden'
                  }
                >
                  <div
                    tabIndex={0}
                    aria-label={bi(
                      'جدول المقارنة السريرية',
                      'Clinical comparison table',
                      'خشتەی بەراوردی کلینیکی'
                    )}
                    className="overflow-x-auto focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <table className="min-w-full divide-y divide-card-divider text-start text-xs">
                      <thead className="bg-muted/50">
                        <tr className="text-muted-foreground-1 font-semibold text-xs">
                          <th className="py-3 px-4 text-start min-w-[210px]">
                            {bi(
                              'المعيار السريري / المفصل',
                              'Clinical Parameter / Joint',
                              'پێوەری کلینیکی / جومگە'
                            )}
                          </th>
                          {snapshots.map((snap, idx) => {
                            const isSelected =
                              snap.id === fromPoint.id || snap.id === toPoint.id;
                            return (
                              <th
                                key={snap.id}
                                className={`py-3 px-4 text-start min-w-[130px] ${
                                  isSelected ? 'bg-primary/[0.04]' : ''
                                }`}
                              >
                                <div className="text-foreground">
                                  {idx === 0
                                    ? bi('خط الأساس (Baseline)', 'Baseline', 'بنەڕەتی (Baseline)')
                                    : bi(snap.labelAr, snap.labelEn)}
                                </div>
                                <div className="text-xs font-normal text-muted-foreground-1 tabular-nums">
                                  <bdi dir="ltr">{formatDateDDMMYYYY(snap.recordedDate)}</bdi>
                                </div>
                              </th>
                            );
                          })}
                          <th className="py-3 px-4 text-start min-w-[125px] bg-primary/10">
                            <div className="text-primary">
                              {bi('الحالي (Current)', 'Current', 'ئێستا (Current)')}
                            </div>
                            <div className="text-xs font-normal text-muted-foreground-1">
                              {bi('محدث الآن', 'Active Chart', 'تۆماری چالاک')}
                            </div>
                          </th>
                          <th className="py-3 px-4 text-start min-w-[90px]">
                            {bi('المسار', 'Trend', 'ڕەوت')}
                          </th>
                          <th className="py-3 px-4 text-end min-w-[125px]">
                            {bi('التغير (Change)', 'Change', 'گۆڕانکاری (Change)')}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-card-divider tabular-nums">
                        {sparklineRows.length === 0 ? (
                          <tr>
                            <td
                              colSpan={snapshots.length + 4}
                              className="py-8 px-4 text-center text-xs text-muted-foreground-1"
                            >
                              {changesOnly
                                ? bi(
                                    'لا توجد تغيرات مسجلة بين النقطتين المختارتين ضمن هذا التصنيف.',
                                    'No changed parameters between the selected timepoints in this filter.',
                                    'هیچ گۆڕانکارییەک لەم فلتەرەدا تۆمار نەکراوە.'
                                  )
                                : bi(
                                    'لا توجد قياسات مسجلة ضمن هذا التصنيف بعد.',
                                    'No measurements recorded in this category yet.',
                                    'هێشتا هیچ پێوانەیەک لەم بەشەدا تۆمار نەکراوە.'
                                  )}
                            </td>
                          </tr>
                        ) : (
                          sparklineRows.map((row) => (
                            <tr key={row.id} className="hover:bg-muted/20">
                              <td className="py-3 px-4 font-semibold text-foreground">
                                <div>{row.title}</div>
                                {row.subtitle && (
                                  <div className="text-xs font-normal text-muted-foreground-1 mt-0.5">
                                    {row.subtitle}
                                  </div>
                                )}
                              </td>
                              {row.milestoneValues.slice(0, snapshots.length).map((mv, idx) => (
                                <td
                                  key={idx}
                                  className="py-3 px-4 font-mono text-muted-foreground-2"
                                >
                                  {mv.valueDisplay}
                                </td>
                              ))}
                              <td className="py-3 px-4 font-mono font-bold text-primary bg-primary/5">
                                {row.currentDisplay}
                              </td>
                              <td className="py-3 px-4">
                                <InlineSparkline
                                  values={row.sparkValues}
                                  direction={row.direction}
                                  ariaLabel={bi('مسار القراءات', 'Reading trend', 'هێڵکاری ڕەوت')}
                                />
                              </td>
                              <td className="py-3 px-4 text-end font-mono font-bold">
                                <div className="inline-flex flex-col items-end gap-0.5">
                                  <span
                                    className={`inline-flex items-center gap-0.5 ${deltaToneClass(row.direction)}`}
                                  >
                                    <DeltaDirectionIcon direction={row.direction} />
                                    <bdi dir="ltr">{row.deltaDisplay}</bdi>
                                  </span>
                                  {row.mcidMet && (
                                    <span className="text-emerald-700 dark:text-emerald-400 text-xs font-sans font-bold">
                                      {bi('تغيّر دال (MCID)', 'MCID Met', 'مانادار (MCID)')}
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Functional Performance Tests Longitudinal Progression */}
              {performanceRows.length > 0 && showScalesTestsSection && (
                <div className="bg-card rounded-2xl border border-card-line shadow-2xs overflow-hidden">
                  <div className="px-4 py-3 border-b border-card-divider flex items-center justify-between gap-2">
                    <h3 className="text-xs sm:text-sm font-bold text-foreground">
                      {bi(
                        'تقدم اختبارات الأداء الوظيفي',
                        'Functional Performance Tests Progression',
                        'پێشکەوتنی تاقیکردنەوەکانی ئەدای فرمانی'
                      )}
                    </h3>
                    <span className="text-xs text-muted-foreground-1 tabular-nums">
                      {performanceRows.length} {bi('اختبارات', 'tests', 'تاقیکردنەوە')}
                    </span>
                  </div>
                  <div className="divide-y divide-card-divider tabular-nums">
                    {performanceRows.map((p) => (
                      <div
                        key={p.testId}
                        className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-foreground">
                            {language === 'en' ? p.nameEn : language === 'ckb' ? p.nameCkb : p.nameAr}
                          </div>
                          <div className="text-muted-foreground-1">
                            {p.code} · {p.count} {bi('قراءات', 'trials', 'خوێندنەوە')} ·{' '}
                            {bi('الأول:', 'Initial:', 'یەکەم:')}{' '}
                            <span className="font-mono">
                              <bdi dir="ltr">
                                {p.firstValue} {p.unit}
                              </bdi>
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <div className="text-end">
                            <div className="font-mono font-bold text-primary text-sm">
                              <bdi dir="ltr">
                                {p.latestValue} {p.unit}
                              </bdi>
                            </div>
                            <div
                              className={`font-mono font-bold inline-flex items-center gap-0.5 ${deltaToneClass(p.direction)}`}
                            >
                              <DeltaDirectionIcon direction={p.direction} />
                              <bdi dir="ltr">{p.formattedDelta}</bdi>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Collapsible Milestone Clinical Notes Log */}
              {snapshotsWithNotes.length > 0 && (
                <div className="bg-card rounded-2xl border border-card-line shadow-2xs overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowMilestoneNotes((v) => !v)}
                    aria-expanded={showMilestoneNotes}
                    className="w-full px-4 py-3 flex items-center justify-between gap-2 text-start hover:bg-muted/20 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <History className="size-4 text-primary shrink-0" />
                      <span className="text-xs sm:text-sm font-bold text-foreground truncate">
                        {bi(
                          'ملاحظات المحطات السريرية الموثقة',
                          'Recorded Milestone Notes',
                          'تێبینییە تۆمارکراوەکانی وێستگەکان'
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground-1 tabular-nums shrink-0">
                        ({snapshots.length})
                      </span>
                    </div>
                    {showMilestoneNotes ? (
                      <ChevronUp className="size-4 text-muted-foreground-1 shrink-0" />
                    ) : (
                      <ChevronDown className="size-4 text-muted-foreground-1 shrink-0" />
                    )}
                  </button>

                  {showMilestoneNotes && (
                    <div className="divide-y divide-card-divider border-t border-card-divider">
                      {snapshots.map((snap, idx) => (
                        <div key={snap.id} className="px-4 py-3 space-y-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs font-bold text-foreground">
                              {idx === 0
                                ? bi('خط الأساس (Baseline)', 'Baseline', 'بنەڕەتی (Baseline)')
                                : bi(snap.labelAr, snap.labelEn)}
                            </div>
                            <div className="text-xs text-muted-foreground-1 flex flex-wrap items-center gap-x-2 tabular-nums">
                              <bdi dir="ltr">{formatDateDDMMYYYY(snap.recordedDate)}</bdi>
                              {snap.recordedBy && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>{snap.recordedBy}</span>
                                </>
                              )}
                              <span aria-hidden="true">·</span>
                              <span>
                                {bi(
                                  `الألم ${snap.painNrsRest}/${snap.painNrsActivity}`,
                                  `Pain ${snap.painNrsRest}/${snap.painNrsActivity}`,
                                  `ئازار ${snap.painNrsRest}/${snap.painNrsActivity}`
                                )}
                              </span>
                            </div>
                          </div>
                          {snap.clinicalImpressionNote && snap.clinicalImpressionNote.trim() ? (
                            <p className="text-xs text-muted-foreground-2 leading-relaxed whitespace-pre-line">
                              {snap.clinicalImpressionNote}
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground-1">
                              {bi(
                                'لا توجد ملاحظة انطباع سريري مرفقة مع هذه اللقطة.',
                                'No clinical impression note attached to this milestone.',
                                'هیچ تێبینییەکی کلینیکی لەگەڵ ئەم وێستگەیەدا نییە.'
                              )}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Clean Bottom Sheet / Dialog for Capturing a New Clinical Snapshot */}
      <ModalDialog
        isOpen={isCaptureSheetOpen}
        onOpenChange={setIsCaptureSheetOpen}
        size="sm"
        dir={isRtl ? 'rtl' : 'ltr'}
        title={bi('توثيق لقطة سريرية جديدة', 'Capture Clinical Snapshot', 'تۆمارکردنی پێوانەی نوێ')}
        subtitle={bi(
          'تثبيت القراءات الحالية (الألم، المدى الحركي، القوة، المقياس الوظيفي) كمحطة ثابتة في المصفوفة',
          'Save current exam metrics (NPRS, ROM, MMT, Outcome scale) as an immutable milestone',
          'تۆمارکردنی پێوانەکانی ئێستا وەک وێستگەیەکی جێگیر لە خشتەی بەراورددا'
        )}
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <button
              type="button"
              onClick={() => setIsCaptureSheetOpen(false)}
              className="h-10 px-4 rounded-xl border border-card-line bg-layer text-xs font-semibold text-foreground hover:bg-surface cursor-pointer"
            >
              {bi('إلغاء', 'Cancel', 'هەڵوەشاندنەوە')}
            </button>
            <button
              type="button"
              onClick={() => handleCaptureSnapshot()}
              className="h-10 px-5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="size-4 shrink-0" />
              <span>{bi('تثبيت اللقطة الآن', 'Save Snapshot', 'پاشەکەوتکردن')}</span>
            </button>
          </div>
        }
      >
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <label
              htmlFor="modal-snapshot-type"
              className="block text-xs font-bold text-foreground"
            >
              {bi('نوع المحطة السريرية', 'Milestone Type', 'جۆری وێستگە')}
            </label>
            <select
              id="modal-snapshot-type"
              value={snapshotType}
              onChange={(e) =>
                setSnapshotType(e.target.value as ClinicalAssessmentSnapshot['snapshotType'])
              }
              className="w-full h-11 px-3 text-xs font-semibold rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
            >
              <option value="initial_evaluation">
                {bi(
                  'التقييم الأولي المرجعي (Baseline)',
                  'Initial Evaluation (Baseline)',
                  'هەڵسەنگاندنی سەرەتایی (بنەڕەتی)'
                )}
              </option>
              <option value="re_evaluation">
                {bi(
                  'إعادة تقييم مرحلي (Re-evaluation)',
                  'Re-evaluation Snapshot',
                  'دووبارە هەڵسەنگاندن'
                )}
              </option>
              <option value="follow_up">
                {bi(
                  'متابعة سريرية (Follow-up)',
                  'Follow-up Snapshot',
                  'بەدواداچوونی کلینیکی'
                )}
              </option>
              <option value="discharge">
                {bi(
                  'تقييم التخريج الختامي (Discharge)',
                  'Discharge Evaluation',
                  'هەڵسەنگاندنی دەرچوون'
                )}
              </option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="modal-snapshot-custom-label"
              className="block text-xs font-bold text-foreground"
            >
              {bi('تسمية مخصصة (اختياري)', 'Custom Label (optional)', 'ناوی تایبەت (ئارەزوومەندانە)')}
            </label>
            <input
              id="modal-snapshot-custom-label"
              type="text"
              value={customSnapshotLabel}
              onChange={(e) => setCustomSnapshotLabel(e.target.value)}
              placeholder={bi(
                'مثال: بعد الأسبوع الرابع / قبل العودة للرياضة',
                'e.g., Week 4 Re-eval / Pre-return to sport',
                'نموونە: دوای هەفتەی چوارەم'
              )}
              className="w-full h-11 px-3 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          <div className="p-3 rounded-xl bg-surface/60 border border-card-line text-xs text-muted-foreground-2 space-y-1 tabular-nums">
            <div className="font-bold text-foreground">
              {bi('سيتم توثيق القراءات الحالية التالية:', 'Current live values to be captured:', 'ئەم پێوانانە تۆمار دەکرێن:')}
            </div>
            <div>
              {bi('الألم (الراحة / الحركة):', 'Pain (Rest / Activity):', 'ئازار (پشوو / جوڵە):')}{' '}
              <span className="font-mono font-bold text-foreground">
                <bdi dir="ltr">
                  {livePoint.painRest}/10 · {livePoint.painActivity}/10
                </bdi>
              </span>
            </div>
            <div>
              {bi('المدى الحركي والقوة العضلية:', 'ROM & MMT:', 'ROM و MMT:')}{' '}
              <span className="font-mono font-bold text-foreground">
                {currentRomEntries.length} ROM · {currentMmtEntries.length} MMT
              </span>
            </div>
          </div>
        </div>
      </ModalDialog>
    </div>
  );
};
