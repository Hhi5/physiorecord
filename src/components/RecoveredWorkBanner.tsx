// =======================================================================
// PhysioRecord — Phase A1: Recovered Unsaved Work Banner
// Appears after vault unlock when encrypted power-cut drafts exist in Dexie v10.
// =======================================================================

import React from 'react';
import { History, RotateCcw, Trash2 } from 'lucide-react';
import type { DecryptedDraftRecord, DraftRecordType } from '../types/clinical';
import { useLanguage } from '../context/LanguageContext';
import { Num } from './ui/Primitives';

interface RecoveredWorkBannerProps {
  drafts: DecryptedDraftRecord[];
  onRestoreDraft: (draft: DecryptedDraftRecord) => void;
  onDiscardDraft: (draftId: string) => void;
  onDiscardAll: () => void;
}

export const RecoveredWorkBanner: React.FC<RecoveredWorkBannerProps> = ({
  drafts,
  onRestoreDraft,
  onDiscardDraft,
  onDiscardAll,
}) => {
  const { bi, isRtl, language } = useLanguage();
  if (!drafts.length) return null;

  const labelForType = (t: DraftRecordType): string => {
    switch (t) {
      case 'soap':
        return bi('ملاحظة SOAP', 'SOAP Note', 'تێبینی SOAP');
      case 'flowsheet':
        return bi('سجل التدفق والألم', 'Session Flowsheet', 'خشتەی ئازار و دانیشتن');
      case 'invoice':
        return bi('مسودة فاتورة', 'Invoice Draft', 'ڕەشنووسی پسووڵە');
      case 'appointment':
        return bi('مسودة موعد', 'Appointment Draft', 'ڕەشنووسی چاوپێکەوتن');
    }
  };

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      data-testid="recovered-work-banner"
      className="px-3 sm:px-4 py-2 bg-amber-500/15 border-b border-amber-500/35 text-xs text-foreground shrink-0 space-y-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-bold text-amber-950 dark:text-amber-200">
          <History className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span>
            {bi(
              'تم استرجاع مسودات مشفرة غير محفوظة من جلستك السابقة:',
              'Recovered encrypted unsaved work from your previous session:',
              'ڕەشنووسە شفرەکراوە تۆمارنەکراوەکان لە دانیشتنی پێشوو گەڕێنرانەوە:'
            )}{' '}
            (<Num value={drafts.length} />)
          </span>
        </div>
        {drafts.length > 1 && (
          <button
            type="button"
            onClick={onDiscardAll}
            className="px-2.5 py-1 rounded-lg bg-layer hover:bg-layer-hover border border-layer-line text-xs font-semibold text-foreground inline-flex items-center gap-1 cursor-pointer"
          >
            <Trash2 className="size-3.5 text-rose-500" />
            <span>{bi('تجاهل الكل', 'Discard All', 'لابردنی هەمووان')}</span>
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {drafts.map((d) => (
          <div
            key={d.id}
            data-testid={`recovered-draft-item-${d.draftType}`}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-card border border-amber-500/35 shadow-2xs"
          >
            <div className="min-w-0">
              <div className="font-bold text-foreground truncate max-w-[240px]">
                {labelForType(d.draftType)}
                {d.patientName ? ` — ${d.patientName}` : ''}
              </div>
              <div className="text-xs text-muted-foreground-1 truncate max-w-[240px]">
                {d.summaryLabel ? `${d.summaryLabel} • ` : ''}
                {new Date(d.updatedAt).toLocaleTimeString(language === 'en' ? 'en-GB' : 'ar-IQ', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onRestoreDraft(d)}
              className="px-2.5 py-1 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="size-3.5" />
              <span>{bi('استعادة', 'Restore', 'گەڕاندنەوە')}</span>
            </button>
            <button
              type="button"
              onClick={() => onDiscardDraft(d.id)}
              className="px-2 py-1 rounded-lg bg-layer hover:bg-layer-hover border border-layer-line text-foreground text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              {bi('تجاهل', 'Discard', 'لابردن')}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
