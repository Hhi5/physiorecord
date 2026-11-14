// =======================================================================
// PhysioRecord — Table-First ASIA / ISNCSCI Sensory Screening Matrix
// Replaces active dermatome SVG rendering with structured C2..S4-5 table.
// Optional visual body map slots cleanly into <BodyMapSlot region="dermatomes" />.
// =======================================================================

import React, { useMemo, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import type {
  DermatomeSensoryEntry,
  SensoryTableModalityGrade,
} from '../../types/clinical';
import {
  ASIA_ISNCSCI_SENSORY_LEVELS,
  deriveLegacySensoryStatus,
  getAsiaSensoryCellKey,
  type AsiaSensoryModality,
  type AsiaSensorySide,
} from '../../data/clinicalToolkit/dermatomesData';
import { BodyMapSlot } from '../ui/BodyMapSlot';
import { CheckCircle2, Info, RotateCcw } from 'lucide-react';

export interface AsiaSensoryTableProps {
  dermatomes: DermatomeSensoryEntry[];
  sensoryTable?: Record<string, SensoryTableModalityGrade>;
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
    const nextTable: Record<string, SensoryTableModalityGrade> = { ...resolvedTable };
    if (nextTable[key] === grade) {
      delete nextTable[key];
    } else {
      nextTable[key] = grade;
    }
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
    const nextTable: Record<string, SensoryTableModalityGrade> = { ...resolvedTable };
    for (const row of filteredRows) {
      delete nextTable[getAsiaSensoryCellKey(row.rootLevel, 'R', 'LT')];
      delete nextTable[getAsiaSensoryCellKey(row.rootLevel, 'R', 'PP')];
      delete nextTable[getAsiaSensoryCellKey(row.rootLevel, 'L', 'LT')];
      delete nextTable[getAsiaSensoryCellKey(row.rootLevel, 'L', 'PP')];
    }
    onChange(buildSyncedDermatomes(nextTable), nextTable);
  };

  const summary = useMemo(() => {
    let recordedCells = 0;
    let alteredLevels = 0;
    for (const row of ASIA_ISNCSCI_SENSORY_LEVELS) {
      const vals = [
        resolvedTable[getAsiaSensoryCellKey(row.rootLevel, 'R', 'LT')],
        resolvedTable[getAsiaSensoryCellKey(row.rootLevel, 'R', 'PP')],
        resolvedTable[getAsiaSensoryCellKey(row.rootLevel, 'L', 'LT')],
        resolvedTable[getAsiaSensoryCellKey(row.rootLevel, 'L', 'PP')],
      ];
      recordedCells += vals.filter(Boolean).length;
      if (vals.some((v) => v === '0' || v === '1')) {
        alteredLevels += 1;
      }
    }
    return { recordedCells, alteredLevels };
  }, [resolvedTable]);

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
              className={`min-w-[26px] h-7 px-1.5 rounded-md text-xs font-mono font-bold transition-colors cursor-pointer disabled:cursor-default ${colorCls}`}
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

      {/* Explicit clinician recording-aid notice */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/70">
        <div className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-200">
          <Info className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
          <p className="font-medium leading-relaxed">
            {bi(
              'التسجيل يتبع فحص المعالج نفسه؛ هذا الجدول أداة توثيق (0 = غائب، 1 = متغيّر، 2 = طبيعي، NT = غير مفحوص).',
              "Scoring follows the clinician's own exam; this table is a recording aid (0 = Absent, 1 = Altered, 2 = Normal, NT = Not Tested)."
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
          <bdi dir="ltr">
            {summary.recordedCells}/{ASIA_ISNCSCI_SENSORY_LEVELS.length * 4}
          </bdi>
          {summary.alteredLevels > 0 && (
            <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 font-bold">
              {bi(`${summary.alteredLevels} مستويات متغيّرة`, `${summary.alteredLevels} altered`)}
            </span>
          )}
        </div>
      </div>

      {/* Filter pills & batch recording actions */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
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
              onClick={() => setRegionFilter(tab.id)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                regionFilter === tab.id
                  ? 'bg-teal-600 text-white border-teal-600'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
              }`}
            >
              {bi(tab.ar, tab.en)}
            </button>
          ))}
        </div>

        {!readOnly && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleMarkVisibleNormal}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{bi('تعيين المعروض = 2 (طبيعي)', 'Set Visible = 2')}</span>
            </button>
            {confirmClearVisible ? (
              <div className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    handleClearVisible();
                    setConfirmClearVisible(false);
                  }}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-rose-600 text-white cursor-pointer"
                >
                  {bi('تأكيد المسح', 'Confirm Clear')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClearVisible(false)}
                  className="px-2.5 py-1.5 rounded-lg text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 cursor-pointer"
                >
                  {bi('إلغاء', 'Cancel')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClearVisible(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{bi('مسح المعروض', 'Clear Visible')}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Table-First C2..S4-5 Sensory Recording Grid */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-900">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200">
            <tr>
              <th className="px-3 py-2.5 text-start font-bold">
                {bi('المستوى العصبي ونقطة الفحص', 'Level & Key Sensory Point')}
              </th>
              <th className="px-2 py-2.5 text-center font-bold">
                {bi('أيمن: لمس خفيف (R.LT)', 'Right Light Touch')}
              </th>
              <th className="px-2 py-2.5 text-center font-bold">
                {bi('أيمن: وخز (R.PP)', 'Right Pin Prick')}
              </th>
              <th className="px-2 py-2.5 text-center font-bold">
                {bi('أيسر: لمس خفيف (L.LT)', 'Left Light Touch')}
              </th>
              <th className="px-2 py-2.5 text-center font-bold">
                {bi('أيسر: وخز (L.PP)', 'Left Pin Prick')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredRows.map((row) => {
              const isSelected = selectedRoot === row.rootLevel;
              return (
                <tr
                  key={row.rootLevel}
                  onClick={() => onSelectRoot?.(row.rootLevel)}
                  className={`transition-colors ${
                    isSelected
                      ? 'bg-teal-50/70 dark:bg-teal-950/30'
                      : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <td className="px-3 py-2 min-w-[210px]">
                    <div className="flex items-start gap-2">
                      <span className="shrink-0 min-w-[44px] h-6 px-1.5 rounded-md font-mono font-bold text-xs flex items-center justify-center bg-teal-50 text-teal-800 border border-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800">
                        {row.rootLevel}
                      </span>
                      <div className="space-y-0.5">
                        <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {bi(row.regionAr, row.regionEn)}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {bi(row.keyPointAr, row.keyPointEn)}
                        </div>
                      </div>
                    </div>
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
    </div>
  );
};
