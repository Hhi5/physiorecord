// =======================================================================
// PhysioRecord — Flexible Manual MMT Muscle Strength Testing Widget
// Medical Research Council (MRC Scale 0-5) with Free-Text Muscle/Movement Entry
// =======================================================================

import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import type {
  MmtAssessmentBatteryData,
  MmtMeasurementEntry,
  MmtGradeValue,
  BodyLaterality,
} from '../../types/clinical';
import {
  CANONICAL_MMT_CONCEPTS,
  resolveMmtCanonicalKey,
} from '../../data/clinicalToolkit/canonicalKeysCatalog';
import { Dumbbell, Plus, Trash2 } from 'lucide-react';

interface MmtWidgetProps {
  value: MmtAssessmentBatteryData | undefined;
  onChange: (updated: MmtAssessmentBatteryData) => void;
  readOnly?: boolean;
}

interface ManualMmtRow {
  key: string; // Maps to entry.muscleGroupId
  name: string;
  canonicalKey: string | null;
  isMidline?: boolean;
}

const PRIMARY_GRADES: MmtGradeValue[] = ['0', '1', '2', '3', '4', '5'];

function createBlankRow(): ManualMmtRow {
  return {
    key: `mmt_manual_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    canonicalKey: null,
    isMidline: false,
  };
}

function buildRowsFromEntries(savedEntries: MmtMeasurementEntry[]): ManualMmtRow[] {
  const seen = new Map<string, ManualMmtRow>();
  for (const e of savedEntries) {
    if (!seen.has(e.muscleGroupId)) {
      const label = e.label || e.muscleNameAr || e.muscleNameEn || '';
      const resolved = resolveMmtCanonicalKey(label, e.canonicalKey, e.muscleGroupId);
      seen.set(e.muscleGroupId, {
        key: e.muscleGroupId,
        name: label,
        canonicalKey: resolved.canonicalKey,
        isMidline: e.laterality === 'midline',
      });
    }
  }
  if (seen.size > 0) {
    return Array.from(seen.values());
  }
  return [createBlankRow()];
}

export const MmtWidget: React.FC<MmtWidgetProps> = ({
  value,
  onChange,
  readOnly = false,
}) => {
  const { bi } = useLanguage();

  const entries = value?.entries || [];
  const [rows, setRows] = useState<ManualMmtRow[]>(() => buildRowsFromEntries(entries));

  // Merge in any externally loaded entries without discarding newly added blank cards
  useEffect(() => {
    if (entries.length === 0) return;
    setRows((prev) => {
      const existingKeys = new Set(prev.map((r) => r.key));
      const extras: ManualMmtRow[] = [];
      for (const e of entries) {
        if (!existingKeys.has(e.muscleGroupId)) {
          existingKeys.add(e.muscleGroupId);
          const label = e.label || e.muscleNameAr || e.muscleNameEn || '';
          const resolved = resolveMmtCanonicalKey(label, e.canonicalKey, e.muscleGroupId);
          extras.push({
            key: e.muscleGroupId,
            name: label,
            canonicalKey: resolved.canonicalKey,
            isMidline: e.laterality === 'midline',
          });
        }
      }
      if (extras.length === 0) return prev;
      // If the only row was an untouched initial blank row, replace it with loaded entries
      if (
        prev.length === 1 &&
        !prev[0].name.trim() &&
        !entries.some((e) => e.muscleGroupId === prev[0].key)
      ) {
        return extras;
      }
      return [...prev, ...extras];
    });
  }, [entries]);

  const emitEntries = (updatedEntries: MmtMeasurementEntry[]) => {
    onChange({
      batteryVersion: '1.0.0',
      entries: updatedEntries,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleUpdateRowName = (rowKey: string, newName: string) => {
    if (readOnly) return;
    const resolved = resolveMmtCanonicalKey(newName, undefined, rowKey);
    setRows((prev) =>
      prev.map((r) =>
        r.key === rowKey
          ? { ...r, name: newName, canonicalKey: resolved.canonicalKey }
          : r
      )
    );

    const hasSavedForKey = entries.some((e) => e.muscleGroupId === rowKey);
    if (hasSavedForKey) {
      const fallback = bi('فحص قوة عضلية', 'Muscle Strength Test', 'تاقیکردنەوەی هێزی ماسولکە');
      const display = newName.trim() || fallback;
      const updatedEntries = entries.map((e) =>
        e.muscleGroupId === rowKey
          ? {
              ...e,
              canonicalKey: resolved.canonicalKey,
              label: newName.trim() || e.label || display,
              muscleNameAr: display,
              muscleNameEn: display,
            }
          : e
      );
      emitEntries(updatedEntries);
    }
  };

  const handleSetGrade = (
    row: ManualMmtRow,
    laterality: BodyLaterality,
    grade: MmtGradeValue | null
  ) => {
    if (readOnly) return;

    const existingIndex = entries.findIndex(
      (e) => e.muscleGroupId === row.key && e.laterality === laterality
    );
    const updatedEntries = [...entries];
    const fallback = bi('فحص قوة عضلية', 'Muscle Strength Test', 'تاقیکردنەوەی هێزی ماسولکە');
    const displayName = row.name.trim() || fallback;
    const resolved = resolveMmtCanonicalKey(displayName, row.canonicalKey, row.key);

    if (existingIndex >= 0) {
      if (grade === null) {
        updatedEntries.splice(existingIndex, 1);
      } else {
        updatedEntries[existingIndex] = {
          ...updatedEntries[existingIndex],
          canonicalKey: resolved.canonicalKey,
          label: row.name.trim() || displayName,
          muscleNameAr: displayName,
          muscleNameEn: displayName,
          gradeValue: grade,
          gravityCondition: ['0', '1', '2-', '2', '2+'].includes(grade)
            ? 'gravity_eliminated'
            : 'against_gravity',
          isTested: true,
        };
      }
    } else if (grade !== null) {
      const newEntry: MmtMeasurementEntry = {
        entryId:
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `mmt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        canonicalKey: resolved.canonicalKey,
        label: row.name.trim() || displayName,
        muscleGroupId: row.key,
        muscleNameAr: displayName,
        muscleNameEn: displayName,
        actionNameAr: '',
        actionNameEn: '',
        laterality,
        gravityCondition: ['0', '1', '2-', '2', '2+'].includes(grade)
          ? 'gravity_eliminated'
          : 'against_gravity',
        isTested: true,
        gradeValue: grade,
      };
      updatedEntries.push(newEntry);
    }

    emitEntries(updatedEntries);
  };

  const handleAddRow = () => {
    if (readOnly) return;
    setRows((prev) => [...prev, createBlankRow()]);
  };

  const handleToggleMidline = (rowKey: string) => {
    if (readOnly) return;
    const targetRow = rows.find((r) => r.key === rowKey);
    const nextIsMidline = !targetRow?.isMidline;
    setRows((prev) =>
      prev.map((r) => (r.key === rowKey ? { ...r, isMidline: nextIsMidline } : r))
    );
    // Clear previous laterality entries for this row when switching between bilateral and midline
    const filteredEntries = entries.filter((e) => e.muscleGroupId !== rowKey);
    if (filteredEntries.length !== entries.length) {
      emitEntries(filteredEntries);
    }
  };

  const handleRemoveRow = (rowKey: string) => {
    if (readOnly) return;
    const filteredEntries = entries.filter((e) => e.muscleGroupId !== rowKey);
    if (filteredEntries.length !== entries.length) {
      emitEntries(filteredEntries);
    }

    setRows((prev) => {
      if (prev.length <= 1) {
        return [createBlankRow()];
      }
      return prev.filter((r) => r.key !== rowKey);
    });
  };

  const getGradeValue = (muscleGroupId: string, laterality: BodyLaterality): MmtGradeValue | null => {
    const found = entries.find(
      (e) => e.muscleGroupId === muscleGroupId && e.laterality === laterality
    );
    return found?.gradeValue ?? null;
  };

  const getGradeBadgeStyle = (grade: MmtGradeValue | null) => {
    if (!grade) return 'bg-surface text-muted-foreground-1';
    switch (grade) {
      case '5':
        return 'bg-emerald-700 text-white font-bold shadow-xs';
      case '4':
        return 'bg-teal-700 text-white font-bold shadow-xs';
      case '3':
        return 'bg-amber-500 text-slate-950 font-bold shadow-xs';
      case '2':
        return 'bg-orange-500 text-slate-950 font-bold shadow-xs';
      case '1':
        return 'bg-rose-700 text-white font-bold shadow-xs';
      case '0':
        return 'bg-red-700 text-white font-bold shadow-xs';
      default:
        return 'bg-surface text-foreground';
    }
  };

  const datalistId = 'mmt-canonical-autocomplete-list';

  return (
    <div className="space-y-3.5">
      <datalist id={datalistId}>
        {CANONICAL_MMT_CONCEPTS.map((c) => (
          <option key={c.canonicalKey} value={bi(c.labelAr, c.labelEn)}>
            {bi(c.labelEn, c.labelAr, c.labelEn)}
          </option>
        ))}
      </datalist>

      {/* Compact Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-surface rounded-xl border border-line-2">
        <div className="flex items-center gap-2">
          <Dumbbell className="w-4 h-4 text-primary shrink-0" />
          <span className="text-xs font-bold text-foreground">
            {bi(
              'فحص القوة العضلية المرن (اكتب اسم العضلة أو الحركة وحدد الدرجة)',
              'Flexible Muscle Strength Testing (MRC Scale 0–5)',
              'تاقیکردنەوەی نەرمی هێزی ماسولکە (ناوی ماسولکە یان جووڵە بنووسە و پلە دیاری بکە)'
            )}
          </span>
        </div>

        <span className="text-xs text-muted-foreground-1 font-medium tabular-nums">
          {bi(
            `العضلات المختبرة: ${entries.length}`,
            `Tested Muscles: ${entries.length}`,
            `ماسولکە تاقیکراوەکان: ${entries.length}`
          )}
        </span>
      </div>

      {/* Flexible Manual MMT Cards (Default 1 card; more via + button below) */}
      <div className={`grid gap-3 ${rows.length === 1 ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
        {rows.map((row, idx) => {
          const leftGrade = getGradeValue(row.key, 'left');
          const rightGrade = getGradeValue(row.key, 'right');
          const midlineGrade = getGradeValue(row.key, 'midline');
          const hasContent = Boolean(row.name.trim() || leftGrade || rightGrade || midlineGrade);

          return (
            <div
              key={row.key}
              className="p-3 sm:p-3.5 rounded-xl border border-line-2 bg-card hover:border-line-3 transition-colors space-y-3"
            >
              {/* Manual Muscle / Movement Name Input + Bilateral/Midline Toggle + Remove Button */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="size-6 rounded-lg bg-primary/10 text-primary text-xs font-mono font-bold flex items-center justify-center shrink-0">
                  {idx + 1}
                </span>
                <input
                  type="text"
                  list={datalistId}
                  disabled={readOnly}
                  value={row.name}
                  onChange={(e) => handleUpdateRowName(row.key, e.target.value)}
                  placeholder={bi(
                    'اكتب اسم العضلة أو الحركة أو اختر من المقترحات (مثال: تبعيد الكتف / العضلة الرباعية)...',
                    'Enter muscle or movement (or pick from bilingual suggestions)...',
                    'ناوی ماسولکە یان جووڵە بنووسە یان لە پێشنیارەکان هەڵبژێرە...'
                  )}
                  className="flex-1 min-w-0 px-3 py-2 text-xs font-semibold rounded-xl bg-layer border border-line-2 text-foreground placeholder:text-muted-foreground-1 focus:outline-none focus:border-primary"
                />
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => handleToggleMidline(row.key)}
                    style={{ minHeight: 'unset' }}
                    className="compact-btn px-2.5 py-1.5 rounded-lg border border-line-2 bg-layer text-xs font-bold text-foreground hover:bg-surface transition-colors cursor-pointer shrink-0"
                    title={bi(
                      'التبديل بين فحص يمين/يسار (R/L) أو فحص محوري للجذع/الرقبة',
                      'Toggle between Bilateral (R/L) and Midline/Trunk',
                      'گۆڕین لە نێوان ڕاست/چەپ (R/L) و تەوەرەیی'
                    )}
                  >
                    {row.isMidline ? bi('محوري', 'Midline', 'تەوەرەیی') : 'R/L'}
                  </button>
                )}
                {!readOnly && (rows.length > 1 || hasContent) && (
                  <button
                    type="button"
                    onClick={() => handleRemoveRow(row.key)}
                    style={{ minHeight: 'unset' }}
                    className="compact-btn size-7 flex items-center justify-center rounded-lg text-muted-foreground-1 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer shrink-0"
                    title={bi('حذف هذا الفحص', 'Remove test', 'سڕینەوەی ئەم تاقیکردنەوەیە')}
                    aria-label={bi('حذف هذا الفحص', 'Remove test', 'سڕینەوەی ئەم تاقیکردنەوەیە')}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>

              {row.isMidline ? (
                <div className="space-y-1.5 pt-1 border-t border-line-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground">
                      {bi('درجة القوة (محوري):', 'Midline Strength Grade:', 'پلەی هێز (تەوەرەیی):')}
                    </span>
                    <span className="font-bold text-xs text-primary">
                      {midlineGrade
                        ? `MRC Grade ${midlineGrade}`
                        : bi('غير مختبر', 'Untested', 'تاقی نەکراوەتەوە')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1" dir="ltr">
                    {PRIMARY_GRADES.map((g) => (
                      <button
                        key={g}
                        type="button"
                        aria-pressed={midlineGrade === g}
                        disabled={readOnly}
                        onClick={() =>
                          handleSetGrade(row, 'midline', midlineGrade === g ? null : g)
                        }
                        style={{ minHeight: 'unset' }}
                        className={`compact-btn flex-1 min-h-[34px] py-1.5 rounded-md text-xs font-bold font-mono transition-all border cursor-pointer ${
                          midlineGrade === g
                            ? getGradeBadgeStyle(g) + ' border-transparent'
                            : 'bg-layer border-line-2 text-foreground hover:bg-surface'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-line-1">
                  {/* Right Side */}
                  <div className="space-y-1.5 p-2 rounded-lg bg-surface border border-line-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-foreground">
                        {bi('الأيمن (R):', 'Right (R):', 'لای ڕاست (R):')}
                      </span>
                      <span className="font-mono font-bold text-primary">
                        {rightGrade ? `G${rightGrade}` : '-'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1" dir="ltr">
                      {PRIMARY_GRADES.map((g) => (
                        <button
                          key={g}
                          type="button"
                          aria-pressed={rightGrade === g}
                          disabled={readOnly}
                          onClick={() =>
                            handleSetGrade(row, 'right', rightGrade === g ? null : g)
                          }
                          style={{ minHeight: 'unset' }}
                          className={`compact-btn flex-1 min-h-[34px] py-1.5 text-xs font-bold font-mono rounded transition-all cursor-pointer ${
                            rightGrade === g
                              ? getGradeBadgeStyle(g)
                              : 'bg-layer text-foreground hover:bg-layer-hover'
                          }`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Left Side */}
                  <div className="space-y-1.5 p-2 rounded-lg bg-surface border border-line-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-foreground">
                        {bi('الأيسر (L):', 'Left (L):', 'لای چەپ (L):')}
                      </span>
                      <span className="font-mono font-bold text-primary">
                        {leftGrade ? `G${leftGrade}` : '-'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1" dir="ltr">
                      {PRIMARY_GRADES.map((g) => (
                        <button
                          key={g}
                          type="button"
                          aria-pressed={leftGrade === g}
                          disabled={readOnly}
                          onClick={() =>
                            handleSetGrade(row, 'left', leftGrade === g ? null : g)
                          }
                          style={{ minHeight: 'unset' }}
                          className={`compact-btn flex-1 min-h-[34px] py-1.5 text-xs font-bold font-mono rounded transition-all cursor-pointer ${
                            leftGrade === g
                              ? getGradeBadgeStyle(g)
                              : 'bg-layer text-foreground hover:bg-layer-hover'
                          }`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add New Manual MMT Test (+) */}
      {!readOnly && (
        <button
          type="button"
          onClick={handleAddRow}
          className="w-full py-2.5 px-4 rounded-xl border border-dashed border-teal-500/40 bg-teal-500/5 hover:bg-teal-500/10 hover:border-teal-500/70 text-teal-700 dark:text-teal-300 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <Plus className="size-4" />
          <span>{bi('إضافة فحص عضلي جديد', 'Add New Muscle Test', 'زیادکردنی تاقیکردنەوەی ماسولکەی نوێ')}</span>
        </button>
      )}
    </div>
  );
};
