// =======================================================================
// PhysioRecord — Table-First ASIA / ISNCSCI (2019) Sensory Screening Matrix
// Structured C2..S4-5 bilateral Light Touch (LT) & Pin Prick (PP) table
// with anatomical key sensory points, live LT/PP totals, and DAP marker.
// Optional visual body map slots cleanly into <BodyMapSlot region="dermatomes" />.
// =======================================================================

import React, { useMemo, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import type {
  AsiaSacralFinding,
  DermatomeSensoryEntry,
  SensoryTableModalityGrade,
} from '../../types/clinical';
import {
  ASIA_ISNCSCI_SENSORY_LEVELS,
  computeAsiaSensoryTotals,
  deriveLegacySensoryStatus,
  getAsiaSensoryCellKey,
  type AsiaSensoryModality,
  type AsiaSensorySide,
} from '../../data/clinicalToolkit/dermatomesData';
import { BodyMapSlot } from '../ui/BodyMapSlot';
import { CheckCircle2, RotateCcw, ShieldAlert } from 'lucide-react';

export interface AsiaSensoryTableProps {
  dermatomes: DermatomeSensoryEntry[];
  sensoryTable?: Record<string, SensoryTableModalityGrade>;
  dap?: AsiaSacralFinding | null;
  onChangeDap?: (nextDap: AsiaSacralFinding | null) => void;
  onChange: (
    nextDermatomes: DermatomeSensoryEntry[],
    nextSensoryTable: Record<string, SensoryTableModalityGrade>
  ) => void;
  readOnly?: boolean;
  onSelectRoot?: (rootLevel: string) => void;
  selectedRoot?: string;
}

const MODALITY_GRADES: SensoryTableModalityGrade[] = ['2', '1', '0', 'NT'];

type RegionFilter = 'all' | 'cervical' | 'thoracic' | 'lumbar' | 'sacral';

export const AsiaSensoryTable: React.FC<AsiaSensoryTableProps> = ({
  dermatomes,
  sensoryTable,
  dap = null,
  onChangeDap,
  onChange,
  readOnly = false,
  onSelectRoot,
  selectedRoot,
}) => {
  const { bi } = useLanguage();
  const [regionFilter, setRegionFilter] = useState<RegionFilter>('all');
  const [confirmClearVisible, setConfirmClearVisible] = useState(false);

  const resolvedTable = useMemo<Record<string, SensoryTableModalityGrade>>(() => {
    const merged: Record<string, SensoryTableModalityGrade> = { ...(sensoryTable || {}) };
    for (const d of dermatomes) {
      const code = d.rootLevel === 'S4' || d.rootLevel === 'S5' ? 'S4-5' : d.rootLevel;
      if (d.rightLightTouch && !merged[getAsiaSensoryCellKey(code, 'R', 'LT')]) {
        merged[getAsiaSensoryCellKey(code, 'R', 'LT')] = d.rightLightTouch;
      }
      if (d.rightPinPrick && !merged[getAsiaSensoryCellKey(code, 'R', 'PP')]) {
        merged[getAsiaSensoryCellKey(code, 'R', 'PP')] = d.rightPinPrick;
      }
      if (d.leftLightTouch && !merged[getAsiaSensoryCellKey(code, 'L', 'LT')]) {
        merged[getAsiaSensoryCellKey(code, 'L', 'LT')] = d.leftLightTouch;
      }
      if (d.leftPinPrick && !merged[getAsiaSensoryCellKey(code, 'L', 'PP')]) {
        merged[getAsiaSensoryCellKey(code, 'L', 'PP')] = d.leftPinPrick;
      }
    }
    return merged;
  }, [dermatomes, sensoryTable]);

  const filteredRows = useMemo(() => {
    if (regionFilter === 'all') return ASIA_ISNCSCI_SENSORY_LEVELS;
    return ASIA_ISNCSCI_SENSORY_LEVELS.filter((r) => r.regionGroup === regionFilter);
  }, [regionFilter]);

  const buildSyncedDermatomes = (
    nextTable: Record<string, SensoryTableModalityGrade>
  ): DermatomeSensoryEntry[] => {
    return ASIA_ISNCSCI_SENSORY_LEVELS.map((row) => {
      const existing = dermatomes.find(
        (d) =>
          d.rootLevel === row.rootLevel ||
          (row.rootLevel === 'S4-5' && (d.rootLevel === 'S4' || d.rootLevel === 'S5'))
      );
      const rLt = nextTable[getAsiaSensoryCellKey(row.rootLevel, 'R', 'LT')];
      const rPp = nextTable[getAsiaSensoryCellKey(row.rootLevel, 'R', 'PP')];
      const lLt = nextTable[getAsiaSensoryCellKey(row.rootLevel, 'L', 'LT')];
      const lPp = nextTable[getAsiaSensoryCellKey(row.rootLevel, 'L', 'PP')];

      return {
        rootLevel: row.rootLevel,
        rightLightTouch: rLt,
        rightPinPrick: rPp,
        leftLightTouch: lLt,
        leftPinPrick: lPp,
        rightStatus:
          rLt || rPp
            ? deriveLegacySensoryStatus(rLt, rPp)
            : existing?.rightStatus || 'not_tested',
        leftStatus:
          lLt || lPp
            ? deriveLegacySensoryStatus(lLt, lPp)
            : existing?.leftStatus || 'not_tested',
        notes: existing?.notes,
      };
    });
  };

  const handleSetCell = (
    rootLevel: string,
    side: AsiaSensorySide,
    modality: AsiaSensoryModality,
    grade: SensoryTableModalityGrade
  ) => {
    if (readOnly) return;
    const key = getAsiaSensoryCellKey(rootLevel, side, modality);
    const nextTable: Record<string, SensoryTableModalityGrade> =
      resolvedTable[key] === grade
        ? Object.fromEntries(Object.entries(resolvedTable).filter(([entryKey]) => entryKey !== key))
        : { ...resolvedTable, [key]: grade };
    onChange(buildSyncedDermatomes(nextTable), nextTable);
  };

  const handleMarkVisibleNormal = () => {
    if (readOnly) return;
    const nextTable: Record<string, SensoryTableModalityGrade> = { ...resolvedTable };
    for (const row of filteredRows) {
      nextTable[getAsiaSensoryCellKey(row.rootLevel, 'R', 'LT')] = '2';
      nextTable[getAsiaSensoryCellKey(row.rootLevel, 'R', 'PP')] = '2';
      nextTable[getAsiaSensoryCellKey(row.rootLevel, 'L', 'LT')] = '2';
      nextTable[getAsiaSensoryCellKey(row.rootLevel, 'L', 'PP')] = '2';
    }
    onChange(buildSyncedDermatomes(nextTable), nextTable);
  };

  const handleClearVisible = () => {
    if (readOnly) return;
    const keysToRemove = new Set<string>();
    for (const row of filteredRows) {
      keysToRemove.add(getAsiaSensoryCellKey(row.rootLevel, 'R', 'LT'));
      keysToRemove.add(getAsiaSensoryCellKey(row.rootLevel, 'R', 'PP'));
      keysToRemove.add(getAsiaSensoryCellKey(row.rootLevel, 'L', 'LT'));
      keysToRemove.add(getAsiaSensoryCellKey(row.rootLevel, 'L', 'PP'));
    }
    const nextTable: Record<string, SensoryTableModalityGrade> = Object.fromEntries(
      Object.entries(resolvedTable).filter(([entryKey]) => !keysToRemove.has(entryKey))
    );
    onChange(buildSyncedDermatomes(nextTable), nextTable);
  };

  const totals = useMemo(() => computeAsiaSensoryTotals(resolvedTable), [resolvedTable]);

  const formatSubtotal = (score: number, max: number, recorded: number, hasNT: boolean) => {
    if (recorded === 0) return `—/${max}`;
    return hasNT ? `${score}/${max} (NT)` : `${score}/${max}`;
  };

  const renderGradeCell = (
    rootLevel: string,
    side: AsiaSensorySide,
    modality: AsiaSensoryModality
  ) => {
    const key = getAsiaSensoryCellKey(rootLevel, side, modality);
    const active = resolvedTable[key];
    return (
      <div className="inline-flex items-center gap-0.5 rounded-lg bg-slate-100/80 dark:bg-slate-800/80 p-0.5">
        {MODALITY_GRADES.map((g) => {
          const isSelected = active === g;
          const colorCls =
            isSelected && g === '2'
              ? 'bg-emerald-600 text-white'
              : isSelected && g === '1'
                ? 'bg-amber-500 text-white'
                : isSelected && g === '0'
                  ? 'bg-rose-600 text-white'
                  : isSelected && g === 'NT'
                    ? 'bg-slate-700 text-white dark:bg-slate-200 dark:text-slate-900'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700';
          return (
            <button
              key={g}
              type="button"
              disabled={readOnly}
              aria-pressed={isSelected}
              aria-label={`${rootLevel} ${side} ${modality} ${g}`}
              onClick={() => handleSetCell(rootLevel, side, modality, g)}
              className={`compact-btn min-w-[26px] h-7 px-1.5 rounded-md text-xs font-mono font-bold transition-colors cursor-pointer disabled:cursor-default ${colorCls}`}
            >
              {g}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Optional visual body map plugin slot (renders null by default) */}
      <BodyMapSlot region="dermatomes" />

      {/* Live ASIA Sensory Subscores (LTR + LTL = LT TOTAL /112 & PPR + PPL = PP TOTAL /112) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="px-3 py-2 rounded-2xl bg-surface/60 flex items-center justify-between gap-2 text-xs">
          <span className="font-bold text-foreground">
            {bi('اللمس الخفيف (LT TOTAL)', 'Light Touch (LT TOTAL)')}
          </span>
          <div className="flex items-center gap-2 font-mono tabular-nums text-muted-foreground-1" dir="ltr">
            <span>
              LTR:{' '}
              <strong className="text-foreground">
                {formatSubtotal(totals.rightLT, 56, totals.rightLTRecorded, totals.rightLTHasNT)}
              </strong>
            </span>
            <span>
              LTL:{' '}
              <strong className="text-foreground">
                {formatSubtotal(totals.leftLT, 56, totals.leftLTRecorded, totals.leftLTHasNT)}
              </strong>
            </span>
            <span className="px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-bold">
              {totals.rightLTRecorded + totals.leftLTRecorded === 0
                ? '—/112'
                : totals.rightLTHasNT || totals.leftLTHasNT
                  ? `${totals.totalLT}/112 NT`
                  : `${totals.totalLT}/112`}
            </span>
          </div>
        </div>

        <div className="px-3 py-2 rounded-2xl bg-surface/60 flex items-center justify-between gap-2 text-xs">
          <span className="font-bold text-foreground">
            {bi('الوخز بالدبوس (PP TOTAL)', 'Pin Prick (PP TOTAL)')}
          </span>
          <div className="flex items-center gap-2 font-mono tabular-nums text-muted-foreground-1" dir="ltr">
            <span>
              PPR:{' '}
              <strong className="text-foreground">
                {formatSubtotal(totals.rightPP, 56, totals.rightPPRecorded, totals.rightPPHasNT)}
              </strong>
            </span>
            <span>
              PPL:{' '}
              <strong className="text-foreground">
                {formatSubtotal(totals.leftPP, 56, totals.leftPPRecorded, totals.leftPPHasNT)}
              </strong>
            </span>
            <span className="px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-bold">
              {totals.rightPPRecorded + totals.leftPPRecorded === 0
                ? '—/112'
                : totals.rightPPHasNT || totals.leftPPHasNT
                  ? `${totals.totalPP}/112 NT`
                  : `${totals.totalPP}/112`}
            </span>
          </div>
        </div>
      </div>

      {/* Filter pills & batch recording actions */}
      <div className="space-y-2">
        <div className="rounded-2xl bg-surface/60 p-1 overflow-hidden">
          <div className="pr-hscroll overflow-x-auto flex items-center gap-1.5 whitespace-nowrap pb-1 pt-0.5 px-0.5">
            {(
              [
                { id: 'all', ar: 'الكل (C2–S4-5)', en: 'All (C2–S4-5)' },
                { id: 'cervical', ar: 'عنقي (C2–C8)', en: 'Cervical (C2–C8)' },
                { id: 'thoracic', ar: 'صدري (T1–T12)', en: 'Thoracic (T1–T12)' },
                { id: 'lumbar', ar: 'قطني (L1–L5)', en: 'Lumbar (L1–L5)' },
                { id: 'sacral', ar: 'عجزي (S1–S4-5)', en: 'Sacral (S1–S4-5)' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={(e) => {
                  setRegionFilter(tab.id);
                  e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                }}
                className={`compact-btn h-8 px-3 rounded-xl text-xs font-semibold transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
                  regionFilter === tab.id
                    ? 'bg-primary text-primary-foreground shadow-2xs'
                    : 'bg-card text-muted-foreground-1 hover:bg-surface'
                }`}
              >
                {bi(tab.ar, tab.en)}
              </button>
            ))}
          </div>
        </div>

        {!readOnly && (
          <div className="pr-hscroll overflow-x-auto flex items-center gap-1.5 whitespace-nowrap pb-0.5">
            <button
              type="button"
              onClick={handleMarkVisibleNormal}
              className="compact-btn h-8 inline-flex items-center gap-1 px-3 rounded-xl text-xs font-semibold bg-surface/75 hover:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 cursor-pointer shrink-0 whitespace-nowrap transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{bi('تعيين المعروض = 2 (طبيعي)', 'Set Visible = 2')}</span>
            </button>
            {confirmClearVisible ? (
              <div className="inline-flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    handleClearVisible();
                    setConfirmClearVisible(false);
                  }}
                  className="compact-btn h-8 px-2.5 rounded-xl text-xs font-bold bg-rose-600 text-white cursor-pointer shrink-0 whitespace-nowrap"
                >
                  {bi('تأكيد المسح', 'Confirm Clear')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClearVisible(false)}
                  className="compact-btn h-8 px-2.5 rounded-xl text-xs bg-surface/75 text-foreground cursor-pointer shrink-0 whitespace-nowrap"
                >
                  {bi('إلغاء', 'Cancel')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClearVisible(true)}
                className="compact-btn h-8 inline-flex items-center gap-1 px-3 rounded-xl text-xs font-semibold bg-surface/75 hover:bg-surface text-foreground cursor-pointer shrink-0 whitespace-nowrap transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{bi('مسح المعروض', 'Clear Visible')}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Table-First C2..S4-5 Sensory Recording Grid (Clean Levels Only, No Landmark Descriptions) */}
      <div className="max-h-[420px] overflow-auto rounded-2xl bg-surface/55">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-20 bg-surface border-b border-black/[0.045] dark:border-white/[0.06] text-foreground">
            <tr>
              <th className="sticky start-0 z-30 bg-surface px-2.5 py-2.5 text-center font-bold w-[72px]">
                {bi('المستوى', 'Level')}
              </th>
              <th className="px-2 py-2.5 text-center font-bold whitespace-nowrap">
                {bi('أيمن: لمس (LTR)', 'R Light Touch (LTR)')}
              </th>
              <th className="px-2 py-2.5 text-center font-bold whitespace-nowrap">
                {bi('أيمن: وخز (PPR)', 'R Pin Prick (PPR)')}
              </th>
              <th className="px-2 py-2.5 text-center font-bold whitespace-nowrap">
                {bi('أيسر: لمس (LTL)', 'L Light Touch (LTL)')}
              </th>
              <th className="px-2 py-2.5 text-center font-bold whitespace-nowrap">
                {bi('أيسر: وخز (PPL)', 'L Pin Prick (PPL)')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.045] dark:divide-white/[0.06]">
            {filteredRows.map((row) => {
              const isSelected = selectedRoot === row.rootLevel;
              return (
                <tr
                  key={row.rootLevel}
                  onClick={() => onSelectRoot?.(row.rootLevel)}
                  className={`transition-colors ${
                    isSelected ? 'bg-primary/10' : 'hover:bg-card/60'
                  }`}
                >
                  <td className="sticky start-0 z-10 bg-card px-2.5 py-2 align-middle text-center w-[72px]">
                    <span className="inline-flex min-w-[44px] h-6 px-1.5 rounded-md font-mono font-bold text-xs items-center justify-center bg-primary/10 text-primary">
                      {row.rootLevel}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-center whitespace-nowrap">
                    {renderGradeCell(row.rootLevel, 'R', 'LT')}
                  </td>
                  <td className="px-2 py-2 text-center whitespace-nowrap">
                    {renderGradeCell(row.rootLevel, 'R', 'PP')}
                  </td>
                  <td className="px-2 py-2 text-center whitespace-nowrap">
                    {renderGradeCell(row.rootLevel, 'L', 'LT')}
                  </td>
                  <td className="px-2 py-2 text-center whitespace-nowrap">
                    {renderGradeCell(row.rootLevel, 'L', 'PP')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ASIA / ISNCSCI Sensory Sacral Sparing — Deep Anal Pressure (DAP) */}
      {onChangeDap && (
        <div className="p-3 rounded-2xl bg-surface/65 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="text-xs font-bold text-foreground">
              {bi(
                'الضغط الشرجي العميق (DAP)',
                'Deep Anal Pressure (DAP)'
              )}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {(
              [
                { value: 'yes', ar: 'نعم (Yes)', en: 'Yes' },
                { value: 'no', ar: 'لا (No)', en: 'No' },
                { value: 'NT', ar: 'NT', en: 'NT' },
              ] as const
            ).map((opt) => {
              const active = dap === opt.value;
              const cls =
                active && opt.value === 'yes'
                  ? 'bg-emerald-600 text-white'
                  : active && opt.value === 'no'
                    ? 'bg-rose-600 text-white'
                    : active && opt.value === 'NT'
                      ? 'bg-slate-700 text-white dark:bg-slate-200 dark:text-slate-900'
                      : 'bg-card text-muted-foreground-1 hover:bg-surface';
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={readOnly}
                  onClick={() => onChangeDap(active ? null : opt.value)}
                  className={`compact-btn h-8 px-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${cls}`}
                >
                  {bi(opt.ar, opt.en)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
