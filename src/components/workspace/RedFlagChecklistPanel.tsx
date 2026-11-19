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
import { ShieldAlert, CheckSquare, Square, Info, Clock, Plus, Trash2 } from 'lucide-react';

export interface RedFlagChecklistPanelProps {
  checklist: PatientRedFlagChecklistItem[] | undefined;
  onChange: (updated: PatientRedFlagChecklistItem[]) => void;
  redFlagsText: string;
  onRedFlagsTextChange?: (val: string) => void;
  readOnly?: boolean;
  dismissedItemIds?: string[];
  onDismissedItemIdsChange?: (ids: string[]) => void;
}

export const RedFlagChecklistPanel: React.FC<RedFlagChecklistPanelProps> = ({
  checklist = [],
  onChange,
  redFlagsText,
  onRedFlagsTextChange,
  readOnly = false,
  dismissedItemIds: propDismissedItemIds,
  onDismissedItemIdsChange,
}) => {
  const { bi } = useLanguage();
  const [activeRegion, setActiveRegion] =
    useState<RedFlagChecklistDefinition['regionId']>('lumbar_pelvis');
  const [internalDismissedIds, setInternalDismissedIds] = useState<string[]>([]);
  const [newFlagText, setNewFlagText] = useState('');

  const dismissedItemIds = propDismissedItemIds ?? internalDismissedIds;
  const setDismissedItemIds = (ids: string[]) => {
    setInternalDismissedIds(ids);
    onDismissedItemIdsChange?.(ids);
  };

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
    () =>
      RED_FLAG_CHECKLIST_CATALOG.filter(
        (item) => item.regionId === activeRegion && !dismissedItemIds.includes(item.itemId)
      ),
    [activeRegion, dismissedItemIds]
  );

  const customItemsInRegion = useMemo(
    () => checklist.filter((item) => item.regionId === activeRegion && item.isCustom),
    [checklist, activeRegion]
  );

  const activeRegionMeta = useMemo(
    () => RED_FLAG_REGION_GROUPS.find((g) => g.regionId === activeRegion),
    [activeRegion]
  );

  const handleToggleItem = (def: {
    itemId: string;
    regionId: string;
    labelAr: string;
    labelEn: string;
    citation?: string;
  }) => {
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

  const handleAddCustomFlag = () => {
    const trimmed = newFlagText.trim();
    if (!trimmed || readOnly) return;
    const newItem: PatientRedFlagChecklistItem = {
      itemId: `custom_rf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      regionId: activeRegion,
      labelAr: trimmed,
      labelEn: trimmed,
      status: 'present',
      screenedAt: new Date().toISOString(),
      citation: bi('علامة سريرية مخصصة للعيادة', 'Custom clinic red flag'),
      isCustom: true,
    };
    onChange([...checklist, newItem]);
    setNewFlagText('');
  };

  const handleDeleteItem = (itemId: string, isCustom?: boolean) => {
    if (readOnly) return;
    if (isCustom || itemId.startsWith('custom_')) {
      onChange(checklist.filter((c) => c.itemId !== itemId));
    } else {
      setDismissedItemIds([...dismissedItemIds, itemId]);
      onChange(checklist.filter((c) => c.itemId !== itemId));
    }
  };

  return (
    <div className="space-y-3">
      {/* Header summary bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-bold text-foreground">
          <ShieldAlert
            className={`size-4 ${presentCount > 0 ? 'text-rose-700 dark:text-rose-400' : 'text-muted-foreground-1'}`}
          />
          <span>
            {bi(
              'فحص العلامات الحمراء المرجعي حسب المنطقة (Red Flags Checklist)',
              'Regional Red-Flag Safety Checklist'
            )}
          </span>
        </div>

        <span
          className={`inline-flex items-center gap-1.5 text-xs tabular-nums ${
            presentCount > 0
              ? 'text-rose-700 dark:text-rose-400 font-bold'
              : 'text-muted-foreground-1 font-semibold'
          }`}
        >
          {presentCount > 0 && <span className="size-1.5 rounded-full bg-current shrink-0" />}
          {presentCount > 0
            ? bi(`تم رصد ${presentCount} علامات`, `${presentCount} Flagged`)
            : bi('0 علامات محددة في القائمة', '0 Checklist Flags')}
        </span>
      </div>

      {/* Region Tabs (Horizontally scrollable strip — borderless surface) */}
      <div className="rounded-2xl bg-surface/60 p-1 overflow-hidden">
        <div className="pr-hscroll overflow-x-auto flex items-center gap-1.5 whitespace-nowrap pb-1 pt-0.5 px-0.5">
          {RED_FLAG_REGION_GROUPS.map((group) => {
            const countInGroup = checklist.filter(
              (c) => c.regionId === group.regionId && c.status === 'present'
            ).length;
            const isSelected = activeRegion === group.regionId;
            return (
              <button
                key={group.regionId}
                type="button"
                onClick={(e) => {
                  setActiveRegion(group.regionId);
                  e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                }}
                className={`compact-btn h-8 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  isSelected
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-card/80 text-foreground hover:bg-card'
                }`}
              >
                <span>{bi(group.titleAr.split(' (')[0], group.titleEn.split(' (')[0])}</span>
                {countInGroup > 0 && (
                  <span
                    className={`text-xs font-mono font-bold ${
                      isSelected ? 'text-primary-foreground' : 'text-rose-700 dark:text-rose-400'
                    }`}
                  >
                    {countInGroup}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Quick Add Custom Red Flag Input */}
      {!readOnly && (
        <div className="flex items-center gap-2 min-w-0">
          <input
            type="text"
            value={newFlagText}
            onChange={(e) => setNewFlagText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddCustomFlag();
              }
            }}
            placeholder={bi(
              'إضافة علامة حمراء جديدة لهذه المنطقة...',
              'Add custom red flag for this region...'
            )}
            className="flex-1 min-w-0 w-0 px-3 py-1.5 text-xs bg-surface/80 rounded-xl text-foreground placeholder:text-muted-foreground-2 focus:outline-none focus:ring-2 focus:ring-primary/25"
          />
          <button
            type="button"
            onClick={handleAddCustomFlag}
            className="compact-btn h-9 inline-flex items-center gap-1 px-2.5 sm:px-3 rounded-xl text-xs font-bold bg-surface/90 hover:bg-surface text-rose-700 dark:text-rose-400 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
          >
            <Plus className="size-3.5" />
            <span>{bi('إضافة علامة', 'Add Flag')}</span>
          </button>
        </div>
      )}

      {/* Checklist items for selected region (Zero Red Boxes — Distinct Red Text & Icon Only) */}
      <div className="divide-y divide-black/[0.045] dark:divide-white/[0.06] rounded-2xl bg-surface/50 overflow-hidden">
        {visibleCatalog.map((def) => {
          const isChecked = statusById.get(def.itemId)?.status === 'present';
          return (
            <div
              key={def.itemId}
              onClick={() => handleToggleItem(def)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleToggleItem(def);
                }
              }}
              className="w-full text-start p-3 hover:bg-surface/80 transition-colors flex items-start gap-2.5 cursor-pointer"
            >
              {isChecked ? (
                <CheckSquare className="size-4 text-rose-700 dark:text-rose-400 shrink-0 mt-0.5" />
              ) : (
                <Square className="size-4 text-muted-foreground-2 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={`text-xs font-bold ${
                      isChecked ? 'text-rose-700 dark:text-rose-400' : 'text-foreground'
                    }`}
                  >
                    {bi(def.labelAr, def.labelEn)}
                  </span>
                  <div className="flex items-center gap-2">
                    {def.urgency === 'immediate_emergency' && (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 dark:text-rose-400">
                        <span className="size-1.5 rounded-full bg-current shrink-0" />
                        {bi('طوارئ', 'Urgent')}
                      </span>
                    )}
                    {!def.governance.reviewedBy && (
                      <span
                        title={def.governance.source}
                        className="inline-flex items-center gap-1 text-orange-600 dark:text-orange-400 text-xs font-semibold"
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
              {!readOnly && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteItem(def.itemId, false);
                  }}
                  title={bi('حذف هذه العلامة الحمراء', 'Delete this red flag')}
                  className="p-1 text-muted-foreground-2 hover:text-rose-600 rounded-lg transition-colors cursor-pointer shrink-0 ms-1"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          );
        })}

        {customItemsInRegion.map((item) => {
          const isChecked = item.status === 'present';
          return (
            <div
              key={item.itemId}
              onClick={() => handleToggleItem(item)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleToggleItem(item);
                }
              }}
              className="w-full text-start p-3 hover:bg-surface/80 transition-colors flex items-start gap-2.5 cursor-pointer"
            >
              {isChecked ? (
                <CheckSquare className="size-4 text-rose-700 dark:text-rose-400 shrink-0 mt-0.5" />
              ) : (
                <Square className="size-4 text-muted-foreground-2 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={`text-xs font-bold ${
                      isChecked ? 'text-rose-700 dark:text-rose-400' : 'text-foreground'
                    }`}
                  >
                    {item.labelAr}
                  </span>
                  <span className="text-xs font-semibold text-rose-700 dark:text-rose-400">
                    {bi('مخصص', 'Custom')}
                  </span>
                </div>
                <p className="text-xs font-mono text-muted-foreground-2">{item.citation}</p>
              </div>
              {!readOnly && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteItem(item.itemId, true);
                  }}
                  title={bi('حذف هذه العلامة المخصصة', 'Delete this custom red flag')}
                  className="p-1 text-muted-foreground-2 hover:text-rose-600 rounded-lg transition-colors cursor-pointer shrink-0 ms-1"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Restore dismissed items link */}
      {dismissedItemIds.length > 0 && !readOnly && (
        <div className="px-1">
          <button
            type="button"
            onClick={() => setDismissedItemIds([])}
            className="text-xs text-primary hover:underline font-semibold cursor-pointer"
          >
            {bi('استعادة العلامات الحمراء الافتراضية المحذوفة', 'Restore default red flags')}
          </button>
        </div>
      )}

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
          <label htmlFor="redflag-custom-notes" className="block text-xs font-semibold text-foreground mb-1">
            {bi('ملاحظات العلامات الحمراء الإضافية (نص حر):', 'Additional Custom Red-Flag Notes (Free Text):')}
          </label>
          <textarea
            id="redflag-custom-notes"
            rows={2}
            disabled={readOnly}
            value={redFlagsText}
            onChange={(e) => onRedFlagsTextChange(e.target.value)}
            placeholder={bi(
              'أي علامات سريرية إضافية أو استيضاحات للتحويل الطبي...',
              'Document additional safety concerns or referral details...'
            )}
            className="w-full px-3 py-2 text-xs rounded-xl bg-surface/80 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
          />
        </div>
      )}
    </div>
  );
};
