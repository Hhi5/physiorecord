// =======================================================================
// PhysioRecord — Modern Expansive ROM Goniometric Assessment Widget
// =======================================================================

import React, { useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import type { RomAssessmentBatteryData, RomMovementType, BodyLaterality } from '../../types/clinical';
import { ROM_JOINTS_CATALOG, ROM_MOVEMENT_TYPES, ROM_END_FEELS } from '../../data/clinicalToolkit/romMmtCatalog';
import { getRomEntryAngle, upsertRomEntry } from '../../utils/romWidgetHelpers';
import { Activity, Plus, Trash2, CheckCircle2, ChevronRight, Gauge } from 'lucide-react';

interface RomWidgetProps {
  value: RomAssessmentBatteryData | undefined;
  onChange: (updated: RomAssessmentBatteryData) => void;
  readOnly?: boolean;
}

export const RomWidget: React.FC<RomWidgetProps> = ({
  value,
  onChange,
  readOnly = false,
}) => {
  const { bi } = useLanguage();

  const [selectedJointId, setSelectedJointId] = useState<string>('shoulder');
  const [movementType, setMovementType] = useState<RomMovementType>('AROM');

  const entries = value?.entries || [];

  const currentJointConfig = ROM_JOINTS_CATALOG.find((j) => j.jointId === selectedJointId) || ROM_JOINTS_CATALOG[0];

  const handleUpdateEntry = (
    jointId: string,
    movementId: string,
    laterality: BodyLaterality,
    angle: number | null
  ) => {
    if (readOnly) return;

    const jointDef = ROM_JOINTS_CATALOG.find((j) => j.jointId === jointId);
    const movDef = jointDef?.movements.find((m) => m.movementId === movementId);
    const updatedEntries = upsertRomEntry(entries, {
      jointId,
      jointNameAr: jointDef?.nameAr || jointId,
      jointNameEn: jointDef?.nameEn || jointId,
      movementId,
      movementNameAr: movDef?.nameAr || movementId,
      movementNameEn: movDef?.nameEn || movementId,
      laterality,
      movementType,
      angle,
    });

    onChange({
      batteryVersion: '1.0.0',
      entries: updatedEntries,
      updatedAt: new Date().toISOString(),
    });
  };

  const getEntryValue = (jointId: string, movementId: string, laterality: BodyLaterality) =>
    getRomEntryAngle(entries, jointId, movementId, laterality, movementType);

  return (
    <div className="space-y-4">
      {/* Top Bar: Measurement Type Segmented Toggle & Tested Count */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 bg-surface rounded-xl border border-line-2">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-1.5">
            <Gauge className="w-4 h-4 text-primary shrink-0" />
            <span className="text-xs font-bold text-foreground">
              {bi('نوع قياس المدى الحركي:', 'Measurement Type:', 'جۆری پێوانی مەودای جووڵە:')}
            </span>
          </div>
          <div className="grid grid-cols-3 w-full sm:w-auto bg-layer rounded-lg p-1 border border-line-2 text-xs gap-1">
            {(Object.keys(ROM_MOVEMENT_TYPES) as RomMovementType[]).map((type) => (
              <button
                key={type}
                type="button"
                aria-pressed={movementType === type}
                onClick={() => setMovementType(type)}
                className={`min-h-[34px] px-3 py-1 rounded-md font-semibold transition-colors cursor-pointer text-center ${
                  movementType === type
                    ? 'bg-teal-700 text-white shadow-xs'
                    : 'text-muted-foreground-1 hover:text-foreground'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground-1 font-medium">
            {bi(
              `الحركات الموثقة: ${entries.length}`,
              `Recorded Movements: ${entries.length}`,
              `جووڵە تۆمارکراوەکان: ${entries.length}`
            )}
          </span>
        </div>
      </div>

      {/* Joint Tabs (Multi-line wrap so every joint including Ankle is always visible) */}
      <div className="flex flex-wrap items-center gap-1.5 pb-1" role="tablist">
        {ROM_JOINTS_CATALOG.map((joint) => {
          const isSelected = selectedJointId === joint.jointId;
          const jointEntriesCount = entries.filter((e) => e.jointId === joint.jointId).length;

          return (
            <button
              key={joint.jointId}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => setSelectedJointId(joint.jointId)}
              style={{ minHeight: 'unset' }}
              className={`compact-btn px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 border cursor-pointer ${
                isSelected
                  ? 'bg-teal-700 text-white border-teal-800 shadow-sm'
                  : 'bg-layer text-foreground border-line-2 hover:bg-surface'
              }`}
            >
              <span>{bi(joint.nameAr.split('(')[0], joint.nameEn)}</span>
              {jointEntriesCount > 0 && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-xs font-mono tabular-nums ${
                    isSelected
                      ? 'bg-white/20 text-white'
                      : 'bg-teal-500/15 text-teal-700 dark:text-teal-300'
                  }`}
                >
                  <bdi dir="ltr">{jointEntriesCount}</bdi>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Movements Table / Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {currentJointConfig.movements.map((mov) => {
          const isMidline = currentJointConfig.applicableLateralities.includes('midline');
          const leftVal = getEntryValue(currentJointConfig.jointId, mov.movementId, 'left');
          const rightVal = getEntryValue(currentJointConfig.jointId, mov.movementId, 'right');
          const midlineVal = getEntryValue(currentJointConfig.jointId, mov.movementId, 'midline');
          const bilateralDiff =
            !isMidline && rightVal !== null && leftVal !== null
              ? Math.abs(rightVal - leftVal)
              : null;

          return (
            <div
              key={mov.movementId}
              className="p-3 sm:p-3.5 rounded-xl border border-line-2 bg-card hover:border-line-3 transition-colors space-y-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-bold text-foreground">
                  {bi(mov.nameAr, mov.nameEn)}
                </h3>
                {bilateralDiff !== null && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold tabular-nums shrink-0 ${
                      bilateralDiff >= 15
                        ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30'
                        : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20'
                    }`}
                    title={bi('الفرق بين اليمين واليسار', 'Side-to-side difference', 'جیاوازی نێوان ڕاست و چەپ')}
                  >
                    <bdi dir="ltr">Δ {bilateralDiff}°</bdi>
                  </span>
                )}
              </div>

              {/* Bilateral or Midline Stepper Inputs */}
              {isMidline ? (
                <div className="flex items-center justify-between gap-3 pt-1.5 border-t border-line-1">
                  <span className="text-xs text-muted-foreground-1 font-medium">
                    {bi('الزاوية المقاسة:', 'Angle:', 'گۆشەی پێوراو:')}
                  </span>
                  <div className="flex items-center gap-1.5" dir="ltr">
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      max="180"
                      disabled={readOnly}
                      aria-label={`${bi(mov.nameAr, mov.nameEn)} (${movementType})`}
                      value={midlineVal ?? ''}
                      placeholder="0–180"
                      onChange={(e) =>
                        handleUpdateEntry(
                          currentJointConfig.jointId,
                          mov.movementId,
                          'midline',
                          e.target.value === '' ? null : Number(e.target.value)
                        )
                      }
                      className="w-20 min-h-[34px] px-2 py-1 text-center font-bold font-mono text-xs tabular-nums rounded-lg border border-line-2 bg-layer text-foreground focus:ring-2 focus:ring-primary"
                    />
                    <span className="text-xs font-bold text-muted-foreground-1">°</span>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:gap-3 pt-1.5 border-t border-line-1">
                  {/* Right Side */}
                  <div className="flex items-center justify-between gap-1.5 p-2 rounded-lg bg-surface border border-line-2">
                    <span className="text-xs font-bold text-foreground">
                      {bi('يمين (R):', 'Right (R):', 'لای ڕاست (R):')}
                    </span>
                    <div className="flex items-center gap-1" dir="ltr">
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        max="180"
                        disabled={readOnly}
                        aria-label={`${bi(mov.nameAr, mov.nameEn)} - ${bi('يمين', 'Right')} (${movementType})`}
                        value={rightVal ?? ''}
                        placeholder="°"
                        onChange={(e) =>
                          handleUpdateEntry(
                            currentJointConfig.jointId,
                            mov.movementId,
                            'right',
                            e.target.value === '' ? null : Number(e.target.value)
                          )
                        }
                        className="w-16 sm:w-20 min-h-[34px] px-2 py-1 text-center font-bold font-mono text-xs tabular-nums rounded-md border border-line-2 bg-layer text-foreground focus:ring-2 focus:ring-primary"
                      />
                      <span className="text-xs font-bold text-muted-foreground-1">°</span>
                    </div>
                  </div>

                  {/* Left Side */}
                  <div className="flex items-center justify-between gap-1.5 p-2 rounded-lg bg-surface border border-line-2">
                    <span className="text-xs font-bold text-foreground">
                      {bi('يسار (L):', 'Left (L):', 'چەپ (L):')}
                    </span>
                    <div className="flex items-center gap-1" dir="ltr">
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        max="180"
                        disabled={readOnly}
                        aria-label={`${bi(mov.nameAr, mov.nameEn)} - ${bi('يسار', 'Left')} (${movementType})`}
                        value={leftVal ?? ''}
                        placeholder="°"
                        onChange={(e) =>
                          handleUpdateEntry(
                            currentJointConfig.jointId,
                            mov.movementId,
                            'left',
                            e.target.value === '' ? null : Number(e.target.value)
                          )
                        }
                        className="w-16 sm:w-20 min-h-[34px] px-2 py-1 text-center font-bold font-mono text-xs tabular-nums rounded-md border border-line-2 bg-layer text-foreground focus:ring-2 focus:ring-primary"
                      />
                      <span className="text-xs font-bold text-muted-foreground-1">°</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
