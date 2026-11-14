// =======================================================================
// PhysioRecord — Structured Red-Flag Safety Checklist Panel (Phase 3.4 & 3.8)
// Regional red-flag screening checklist + custom free-text alerts + citations.
// Zero checked items stays honest & neutral (only triggers chip when flagged).
// =======================================================================

import React, { useMemo, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import type { PatientRedFlagChecklistItem } from '../../types/clinical';
import {
  RED_FLAG_CHECKLIST_CATALOG,
  RED_FLAG_REGION_GROUPS,
  type RedFlagChecklistDefinition,
} from '../../data/clinicalToolkit/redFlagsCatalog';
import { ShieldAlert, CheckSquare, Square, Info, Clock } from 'lucide-react';

export interface RedFlagChecklistPanelProps {
  checklist: PatientRedFlagChecklistItem[] | undefined;
  onChange: (updated: PatientRedFlagChecklistItem[]) => void;
  redFlagsText: string;
  onRedFlagsTextChange?: (val: string) => void;
  readOnly?: boolean;
}

export const RedFlagChecklistPanel: React.FC<RedFlagChecklistPanelProps> = ({
  checklist = [],
  onChange,
  redFlagsText,
  onRedFlagsTextChange,
  readOnly = false,
}) => {
  const { bi } = useLanguage();
  const [activeRegion, setActiveRegion] =
    useState<RedFlagChecklistDefinition['regionId']>('lumbar_pelvis');

  const statusById = useMemo(() => {
    const map = new Map<string, PatientRedFlagChecklistItem>();
    for (const item of checklist) {
      map.set(item.itemId, item);
    }
    return map;
  }, [checklist]);

  const presentCount = useMemo(
    () => checklist.filter((c) => c.status === 'present').length,
    [checklist]
  );

  const visibleCatalog = useMemo(
    () => RED_FLAG_CHECKLIST_CATALOG.filter((item) => item.regionId === activeRegion),
    [activeRegion]
  );

  const activeRegionMeta = useMemo(
    () => RED_FLAG_REGION_GROUPS.find((g) => g.regionId === activeRegion),
    [activeRegion]
  );

  const handleToggleItem = (def: RedFlagChecklistDefinition) => {
    if (readOnly) return;
    const existing = statusById.get(def.itemId);
    const nextStatus: PatientRedFlagChecklistItem['status'] =
      existing?.status === 'present' ? 'absent' : 'present';
    const nextList = checklist.filter((c) => c.itemId !== def.itemId);
    if (nextStatus === 'present') {
      nextList.push({
        itemId: def.itemId,
        regionId: def.regionId,
        labelAr: def.labelAr,
        labelEn: def.labelEn,
        status: 'present',
        screenedAt: new Date().toISOString(),
        citation: def.citation,
      });
    }
    onChange(nextList);
  };

  return (
    <div className="space-y-3">
      {/* Header summary bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-bold text-foreground">
          <ShieldAlert
            className={`size-4 ${presentCount > 0 ? 'text-rose-600' : 'text-muted-foreground-1'}`}
          />
          <span>
            {bi(
              'فحص العلامات الحمراء المرجعي حسب المنطقة (Red Flags Checklist)',
              'Regional Red-Flag Safety Checklist'
            )}
          </span>
        </div>

        <span
          className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border tabular-nums ${
            presentCount > 0
              ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30'
              : 'bg-surface text-muted-foreground-1 border-line-2'
          }`}
        >
          {presentCount > 0
            ? bi(`تم رصد ${presentCount} علامات`, `${presentCount} Flagged`)
            : bi('0 علامات محددة في القائمة', '0 Checklist Flags')}
        </span>
      </div>

      {/* Region Tabs */}
      <div className="flex flex-wrap gap-1.5">
        {RED_FLAG_REGION_GROUPS.map((group) => {
          const countInGroup = checklist.filter(
            (c) => c.regionId === group.regionId && c.status === 'present'
          ).length;
          const isSelected = activeRegion === group.regionId;
          return (
            <button
              key={group.regionId}
              type="button"
              onClick={() => setActiveRegion(group.regionId)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                isSelected
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-surface text-foreground border-layer-line hover:bg-layer-hover'
              }`}
            >
              <span>{bi(group.titleAr.split(' (')[0], group.titleEn.split(' (')[0])}</span>
              {countInGroup > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-rose-600 text-white text-xs font-mono">
                  {countInGroup}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Checklist items for selected region */}
      <div className="space-y-2">
        {visibleCatalog.map((def) => {
          const isChecked = statusById.get(def.itemId)?.status === 'present';
          return (
            <button
              key={def.itemId}
              type="button"
              disabled={readOnly}
              onClick={() => handleToggleItem(def)}
              aria-pressed={isChecked}
              className={`w-full text-start p-3 rounded-xl border transition-colors flex items-start gap-2.5 cursor-pointer disabled:cursor-default ${
                isChecked
                  ? 'bg-rose-500/10 border-rose-500/40'
                  : 'bg-surface border-layer-line hover:bg-layer-hover'
              }`}
            >
              {isChecked ? (
                <CheckSquare className="size-4 text-rose-600 shrink-0 mt-0.5" />
              ) : (
                <Square className="size-4 text-muted-foreground-2 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-foreground">
                    {bi(def.labelAr, def.labelEn)}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {def.urgency === 'immediate_emergency' && (
                      <span className="px-2 py-0.5 rounded-md bg-rose-600 text-white text-xs font-bold">
                        {bi('طوارئ', 'Urgent')}
                      </span>
                    )}
                    {!def.governance.reviewedBy && (
                      <span
                        title={def.governance.source}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/25 text-xs font-medium"
                      >
                        <Clock className="size-3" />
                        <span>{bi('بانتظار المراجعة', 'Pending Review')}</span>
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground-1 leading-relaxed">
                  {bi(def.rationaleAr, def.rationaleEn)}
                </p>
                <p className="text-xs font-mono text-muted-foreground-2">{def.citation}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Regional Citation Footer */}
      {activeRegionMeta && (
        <div className="flex items-start gap-2 text-xs text-muted-foreground-1 px-2">
          <Info className="size-3.5 shrink-0 mt-0.5" />
          <span>
            {bi('المصدر السريري: ', 'Guideline Reference: ')}
            {activeRegionMeta.citation}
          </span>
        </div>
      )}

      {/* Optional Free-Text Red Flags Field */}
      {onRedFlagsTextChange && (
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1">
            {bi('ملاحظات العلامات الحمراء الإضافية (نص حر):', 'Additional Custom Red-Flag Notes (Free Text):')}
          </label>
          <textarea
            rows={2}
            disabled={readOnly}
            value={redFlagsText}
            onChange={(e) => onRedFlagsTextChange(e.target.value)}
            placeholder={bi(
              'أي علامات سريرية إضافية أو استيضاحات للتحويل الطبي...',
              'Document additional safety concerns or referral details...'
            )}
            className="w-full px-3 py-2 text-xs rounded-xl bg-card border border-layer-line text-foreground focus:outline-none focus:border-primary"
          />
        </div>
      )}
    </div>
  );
};
