import React from 'react';
import { AlertTriangle, ChevronDown, FilePlus2, Plus, Trash2 } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import { MAX_ADDENDUM_TEXT_LENGTH } from '../../../services/soapService';
import {
  ADDENDUM_REASONS,
  type AddendumReason,
  type ClinicalAddendumRecord,
  type SoapNoteRecord,
} from '../../../types/clinical';
import { formatClinicalDate } from '../../../utils/date';
import { AutoResizeTextarea, Fraction } from '../../ui/Primitives';

export interface SessionAddendaSectionProps {
  recordedByName: string;
  soapRecord: SoapNoteRecord | null;
  addenda: ClinicalAddendumRecord[];
  addendaFailedCount: number;
  addendumReason: AddendumReason;
  setAddendumReason: (reason: AddendumReason) => void;
  addendumText: string;
  setAddendumText: (text: string) => void;
  isSavingAddendum: boolean;
  addendumError: string | null;
  onAddAddendum: (e: React.FormEvent) => void;
  onRequestDeleteSession?: () => void;
}

export const SessionAddendaSection: React.FC<SessionAddendaSectionProps> = ({
  recordedByName,
  soapRecord,
  addenda,
  addendaFailedCount,
  addendumReason,
  setAddendumReason,
  addendumText,
  setAddendumText,
  isSavingAddendum,
  addendumError,
  onAddAddendum,
  onRequestDeleteSession,
}) => {
  const { language, bi } = useLanguage();

  return (
    <div className="max-w-3xl mx-auto w-full p-4 sm:p-5 rounded-2xl pr-surface space-y-4">
      <div className="flex items-center justify-between gap-3 border-b border-black/[0.045] dark:border-white/[0.06] pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <FilePlus2 className="size-4 text-primary shrink-0" />
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-foreground leading-snug">
              {bi(
                'الملاحق والتصحيحات السريرية',
                'Clinical Addenda',
                'پاشکۆ و ڕاستکردنەوە کلینیکییەکان'
              )}
            </h2>
            <p className="text-xs text-muted-foreground-1 leading-snug mt-0.5">
              {bi(
                'إضافات لاحقة تُلحق بالجلسة المعتمدة دون تعديل النص الأصلي',
                'Append-only post-finalization clinical amendments',
                'زیادکردنەکانی دوای پەسەندکردن بێ گۆڕینی دەقی بنەڕەتی'
              )}
            </p>
          </div>
        </div>
        <span className="shrink-0 whitespace-nowrap px-2.5 py-1 rounded-full bg-surface text-xs font-bold text-muted-foreground-1 tabular-nums">
          {addenda.length} {bi('ملحق', 'addenda', 'پاشکۆ')}
        </span>
      </div>

      {addendaFailedCount > 0 && (
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
          <AlertTriangle className="size-4 shrink-0" />
          <span>
            {bi(
              `تنبيه: تعذر فك تشفير (${addendaFailedCount}) ملحق سريري مرتبط بهذه الجلسة.`,
              `Warning: (${addendaFailedCount}) clinical addendum record(s) failed decryption.`,
              `ئاگاداری: کردنەوەی کۆدی (${addendaFailedCount}) پاشکۆی کلینیکیی پەیوەست بەم دانیشتنە شکستی هێنا.`
            )}
          </span>
        </div>
      )}

      {addenda.length > 0 && (
        <div className="space-y-2.5">
          {addenda.map((item) => {
            const reasonInfo = ADDENDUM_REASONS[item.data.reasonForAmendment];
            return (
              <div
                key={item.id}
                className="p-3.5 rounded-xl bg-surface/65 space-y-1.5 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground-1">
                  <span className="font-bold text-primary">
                    {reasonInfo ? bi(reasonInfo.ar, reasonInfo.en) : ''}
                  </span>
                  <span className="font-mono">
                    {bi('مسجل بواسطة: ', 'Recorded by: ', 'تۆمارکراو لەلایەن: ')}
                    {item.data.signedByTherapistName} ·{' '}
                    {formatClinicalDate(item.createdAt, language, { includeTime: true })}
                  </span>
                </div>
                <p className="text-foreground whitespace-pre-wrap break-words">{item.data.amendmentText}</p>
              </div>
            );
          })}
        </div>
      )}

      {soapRecord && (
        <form onSubmit={onAddAddendum} className="space-y-3.5 pt-1">
          {addendumError && (
            <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
              {addendumError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div className="min-w-0">
              <label htmlFor="soap-addendum-reason" className="text-xs font-bold text-foreground block mb-1.5">
                {bi('سبب الملحق السريري:', 'Reason for Addendum:', 'هۆکاری پاشکۆی کلینیکی:')}
              </label>
              <div className="relative">
                <select
                  id="soap-addendum-reason"
                  value={addendumReason}
                  onChange={(e) => setAddendumReason(e.target.value as AddendumReason)}
                  className="appearance-none w-full min-h-[42px] ps-3.5 pe-9 py-2.5 text-xs font-medium text-start rounded-xl bg-surface/80 text-foreground cursor-pointer"
                >
                  {(Object.keys(ADDENDUM_REASONS) as AddendumReason[]).map((key) => (
                    <option key={key} value={key}>
                      {bi(ADDENDUM_REASONS[key].ar, ADDENDUM_REASONS[key].en)}
                    </option>
                  ))}
                </select>
                <ChevronDown className="size-4 text-muted-foreground-1 pointer-events-none absolute end-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            <div className="min-w-0">
              <label htmlFor="soap-addendum-recorded-by" className="text-xs font-bold text-foreground block mb-1.5">
                {bi(
                  'مسجل بواسطة (قراءة فقط):',
                  'Recorded by (Read-Only):',
                  'تۆمارکراو لەلایەن (تەنها خوێندنەوە):'
                )}
              </label>
              <div
                id="soap-addendum-recorded-by"
                aria-readonly="true"
                className="w-full min-h-[42px] px-3.5 py-2.5 text-xs font-semibold rounded-xl bg-muted/75 border border-card-line text-foreground leading-relaxed break-words flex items-center"
              >
                {recordedByName}
              </div>
              <span className="text-xs text-muted-foreground-2 block mt-1 leading-relaxed">
                {bi(
                  'اسم مصرّح به ذاتياً من اختيار الكادر المحلي وليس هوية مصادقاً عليها رقمياً.',
                  'Self-declared name from active staff selection, not authenticated identity.',
                  'ناوی ڕاگەیەنراوی خۆیی لە هەڵبژاردنی ستافی ناوخۆیی، ناسنامەی باوەڕپێکراوی دیجیتاڵی نییە.'
                )}
              </span>
            </div>
          </div>

          <div>
            <div className="flex items-start justify-between gap-3 mb-1.5">
              <label htmlFor="soap-addendum-text" className="text-xs font-bold text-foreground leading-snug">
                {bi(
                  'نص الإضافة أو التصحيح السريري:',
                  'Addendum Text (appended immutably):',
                  'دەقی زیادکردن یان ڕاستکردنەوەی کلینیکی:'
                )}
              </label>
              <span className="text-xs font-mono text-muted-foreground-2 shrink-0 whitespace-nowrap tabular-nums">
                <Fraction value={addendumText.length} total={MAX_ADDENDUM_TEXT_LENGTH} />
              </span>
            </div>
            <AutoResizeTextarea
              id="soap-addendum-text"
              minRows={3}
              maxLength={MAX_ADDENDUM_TEXT_LENGTH}
              value={addendumText}
              onChange={(e) => setAddendumText(e.target.value)}
              required
              placeholder={bi(
                'اكتب تفاصيل الإضافة أو التوضيح السريري هنا...',
                'Enter clinical addendum details...',
                'وردەکارییەکانی پاشکۆ یان ڕوونکردنەوەی کلینیکی لێرە بنووسە...'
              )}
              className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-surface/80 text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/25"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSavingAddendum || !addendumText.trim()}
              className="compact-btn h-10 px-4 rounded-xl bg-primary hover:bg-primary-hover disabled:bg-surface disabled:text-muted-foreground-2 disabled:cursor-not-allowed text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Plus className="size-3.5" />
              <span>
                {bi('إدراج الملحق السريري', 'Append Clinical Addendum', 'زیادکردنی پاشکۆی کلینیکی')}
              </span>
            </button>
          </div>
        </form>
      )}

      {onRequestDeleteSession && (
        <div className="pt-3 mt-2 border-t border-black/[0.05] dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground-1 leading-relaxed min-w-0 flex-1">
            {bi(
              'هل تم اعتماد هذه الجلسة بالخطأ أو بدون تسجيل بيانات؟ يمكنك حذفها نهائياً مع توثيق السبب في سجل التدقيق.',
              'Finalized this session by mistake or while empty? You can permanently delete it with an audit reason.',
              'ئەم دانیشتنە بە هەڵە یان بێ تۆمارکردنی زانیاری پەسەند کراوە؟ دەتوانیت بە یەکجاری بیسڕیتەوە.'
            )}
          </p>
          <button
            type="button"
            data-testid="addenda-delete-finalized-session-btn"
            onClick={onRequestDeleteSession}
            className="compact-btn h-9 px-3.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/18 text-rose-700 dark:text-rose-400 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors"
          >
            <Trash2 className="size-3.5" />
            <span>{bi('حذف الجلسة المعتمدة', 'Delete Finalized Session', 'سڕینەوەی دانیشتنی پەسەندکراو')}</span>
          </button>
        </div>
      )}
    </div>
  );
};
