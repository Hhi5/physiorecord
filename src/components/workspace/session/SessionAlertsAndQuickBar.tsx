import React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Dumbbell,
  Hand,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import type { SealVerificationStatus, SoapNoteRecord } from '../../../types/clinical';
import type { QuickSoapChip } from '../../../types/clinicManagement';
import { formatClinicalDate } from '../../../utils/date';

export interface SessionAlertsAndQuickBarProps {
  loadError: string | null;
  onRetryLoad: () => void;
  saveError: string | null;
  missingLockFields: string[];
  addendaFailedCount: number;
  flowsheetFailedCount: number;
  sealStatus: SealVerificationStatus | null;
  sealMismatchWarning: string | null;
  unsealedNotice: string | null;
  soapRecord: SoapNoteRecord | null;
  isLegacyDraftOrigin: boolean;
  requiresLegacyReview: boolean;
  legacyDraftReviewed: boolean;
  onToggleLegacyDraftReviewed: (checked: boolean) => void;
  isLocked: boolean;
  copiedFromInfo: { sessionNumber: number; sessionDate: string } | null;
  onResetCopiedFields: () => void;
  onCopyPreviousSessionManual: () => void;
  onOpenChipEditor: () => void;
  favoriteChips: QuickSoapChip[];
  onApplyFavoriteChip: (chip: QuickSoapChip) => void;
}

export const SessionAlertsAndQuickBar: React.FC<SessionAlertsAndQuickBarProps> = ({
  loadError,
  onRetryLoad,
  saveError,
  missingLockFields,
  addendaFailedCount,
  flowsheetFailedCount,
  sealStatus,
  sealMismatchWarning,
  unsealedNotice,
  soapRecord,
  isLegacyDraftOrigin,
  requiresLegacyReview,
  legacyDraftReviewed,
  onToggleLegacyDraftReviewed,
  isLocked,
  copiedFromInfo,
  onResetCopiedFields,
  onCopyPreviousSessionManual,
  onOpenChipEditor,
  favoriteChips,
  onApplyFavoriteChip,
}) => {
  const { language, bi } = useLanguage();

  return (
    <>
      {loadError && (
        <div className="p-4 rounded-2xl bg-card shadow-2xs text-xs text-rose-700 dark:text-rose-400 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0 text-rose-600" />
            <span>{loadError}</span>
          </div>
          <button
            type="button"
            onClick={onRetryLoad}
            className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-bold inline-flex items-center gap-1 cursor-pointer shrink-0"
          >
            <RefreshCw className="size-3.5" />
            <span>{bi('إعادة المحاولة', 'Retry', 'هەوڵدانەوە')}</span>
          </button>
        </div>
      )}

      {saveError && (
        <div className="p-3.5 rounded-2xl bg-card shadow-2xs text-xs text-rose-700 dark:text-rose-400 flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0 text-rose-600" />
          <span>{saveError}</span>
        </div>
      )}

      {missingLockFields.length > 0 && (
        <div className="p-3.5 rounded-2xl bg-card shadow-2xs text-xs text-amber-700 dark:text-amber-400 space-y-1.5">
          <div className="flex items-center gap-2 font-extrabold">
            <AlertTriangle className="size-4 shrink-0" />
            <span>
              {bi(
                'تنبيه إرشادي (غير مانع للاعتماد) — يفضّل استكمال الملاحظات التالية:',
                'Advisory reminder (non-blocking) — recommended clinical fields to review:',
                'ئاگاداری ڕێنمایی (ڕێگر نییە لە پەسەندکردن) — پێشنیار دەکرێت ئەم خانانە پڕبکرێنەوە:'
              )}
            </span>
          </div>
          <ul className="list-disc list-inside space-y-0.5 font-semibold text-muted-foreground-1">
            {missingLockFields.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {(addendaFailedCount > 0 || flowsheetFailedCount > 0) && (
        <div className="p-3.5 rounded-2xl bg-card shadow-2xs text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2">
          <AlertTriangle className="size-4 shrink-0" />
          <span>
            {bi(
              `تحذير سلامة البيانات: تعذر فك تشفير (${addendaFailedCount + flowsheetFailedCount}) سجل مرتبط بهذه الجلسة أو الحلقة.`,
              `Data integrity warning: (${addendaFailedCount + flowsheetFailedCount}) related record(s) failed decryption.`,
              `ئاگاداری سەلامەتیی زانیاری: کردنەوەی کۆدی (${addendaFailedCount + flowsheetFailedCount}) تۆماری پەیوەست بەم دانیشتنە شکستی هێنا.`
            )}
          </span>
        </div>
      )}

      {sealStatus === 'mismatch' && sealMismatchWarning && (
        <div className="p-4 rounded-2xl bg-card shadow-2xs text-xs text-rose-700 dark:text-rose-400 flex items-center gap-2.5 font-bold">
          <AlertCircle className="size-5 text-rose-600 dark:text-rose-400 shrink-0" />
          <span>{sealMismatchWarning}</span>
        </div>
      )}

      {sealStatus === 'unsealed' && unsealedNotice && (
        <div className="p-3.5 rounded-2xl bg-surface border border-line-2 text-xs text-foreground flex items-center gap-2 font-semibold">
          <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>{unsealedNotice}</span>
        </div>
      )}

      {soapRecord?.data.legacyReviewedAt ? (
        <div className="p-3.5 rounded-2xl bg-card shadow-2xs text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-2 font-semibold">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>
            {bi(
              `تمت مراجعة هذه المسودة المنشأة بإصدار أقدم بتاريخ ${formatClinicalDate(
                soapRecord.data.legacyReviewedAt,
                language,
                { includeTime: true }
              )}${
                soapRecord.data.legacyReviewedBy
                  ? ` (مسجل بواسطة: ${soapRecord.data.legacyReviewedBy})`
                  : ''
              }.`,
              `Legacy draft reviewed on ${formatClinicalDate(
                soapRecord.data.legacyReviewedAt,
                language,
                { includeTime: true }
              )}${
                soapRecord.data.legacyReviewedBy
                  ? ` (Recorded by: ${soapRecord.data.legacyReviewedBy})`
                  : ''
              }.`,
              `پێداچوونەوە بۆ ئەم ڕەشنووسە کۆنە کرا لە ڕێکەوتی ${formatClinicalDate(
                soapRecord.data.legacyReviewedAt,
                language,
                { includeTime: true }
              )}${
                soapRecord.data.legacyReviewedBy
                  ? ` (تۆمارکراو لەلایەن: ${soapRecord.data.legacyReviewedBy})`
                  : ''
              }.`
            )}
          </span>
        </div>
      ) : (
        (soapRecord?.data.legacyUnreviewed || isLegacyDraftOrigin) && (
          <div className="p-4 rounded-2xl bg-card shadow-2xs text-xs text-amber-700 dark:text-amber-400 space-y-2.5">
            <div className="flex items-center gap-2 font-bold">
              <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                {bi(
                  'تنبيه مراجعة سريرية: تم إنشاء محتوى هذه الملاحظة بواسطة إصدار أقدم من النظام، يرجى مراجعته قبل الاعتماد عليه (Content created by an older version, review before relying on it).',
                  'Clinical review notice: Content created by an older version, review before relying on it.',
                  'ئاگاداری پێداچوونەوەی کلینیکی: ناوەڕۆکی ئەم تۆمارە بە وەشانێکی کۆنتری سیستەم دروست کراوە، تکایە پێش پشتبەستن پێی پێداچوونەوەی بۆ بکە.'
                )}
              </span>
            </div>

            {requiresLegacyReview && (
              <label className="flex items-center gap-2 pt-1 cursor-pointer select-none font-bold text-amber-950 dark:text-amber-100">
                <input
                  type="checkbox"
                  checked={legacyDraftReviewed}
                  onChange={(e) => onToggleLegacyDraftReviewed(e.target.checked)}
                  className="size-4 rounded border-line-2 text-primary focus:ring-primary cursor-pointer"
                />
                <span>
                  {bi(
                    'لقد راجعت محتوى هذه المسودة القديمة وأؤكد صحته قبل الاعتماد والقفل (I reviewed this)',
                    'I have reviewed this legacy draft and confirm its accuracy before Sign & Lock (I reviewed this)',
                    'پێداچوونەوەم بۆ ناوەڕۆکی ئەم ڕەشنووسە کۆنە کردووە و دروستییەکەی پێش پەسەندکردن و قفڵکردن دووپات دەکەمەوە'
                  )}
                </span>
              </label>
            )}
          </div>
        )
      )}

      {soapRecord?.data.repairedDuringMigration && !soapRecord?.data.legacyUnreviewed && (
        <div className="p-3 rounded-xl bg-card shadow-2xs text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2">
          <ShieldCheck className="size-4 shrink-0" />
          <span>
            {bi(
              'تم إصلاح ومزامنة قفل الاعتماد لهذه الملاحظة تلقائياً أثناء الترحيل بناءً على حالة اعتماد الجلسة.',
              'Finalization lock on this SOAP note was automatically repaired during migration to match the finalized session.',
              'قفڵی پەسەندکردنی ئەم تۆماری SOAPـە بە خۆکاری چاککرایەوە لە کاتی گواستنەوەدا بەپێی باری پەسەندکردنی دانیشتنەکە.'
            )}
          </span>
        </div>
      )}

      {/* Quick SOAP Bar */}
      {!isLocked && (
        <div className="p-4 sm:p-5 rounded-2xl bg-card border border-card-line shadow-2xs space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2.5 text-xs">
              <div className="size-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Sparkles className="size-4" />
              </div>
              <div>
                <span className="font-bold text-foreground block">
                  {bi('أدوات التوثيق السريع (Quick SOAP)', 'Quick SOAP Helpers', 'ئامرازەکانی تۆمارکردنی خێرا (Quick SOAP)')}
                </span>
                {copiedFromInfo && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 font-semibold mt-0.5">
                    <Copy className="size-3" />
                    <span>
                      {bi(
                        `تم النسخ المسبق من الجلسة #${copiedFromInfo.sessionNumber} — راجع الحقول وعدّل ما تغير`,
                        `Copied forward from Session #${copiedFromInfo.sessionNumber} — review fields`,
                        `پێشوەختە لە دانیشتنی #${copiedFromInfo.sessionNumber} کۆپی کرا — خانەکان بپشکنە و گۆڕاوەکان چاک بکە`
                      )}
                    </span>
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {copiedFromInfo ? (
                <button
                  type="button"
                  onClick={onResetCopiedFields}
                  className="px-3 py-1.5 rounded-xl bg-surface hover:bg-layer-hover border border-line-2 text-xs font-semibold text-foreground inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <RotateCcw className="size-3.5" />
                  <span>{bi('إفراغ المنسوخ', 'Clear Copied', 'سڕینەوەی کۆپیکراو')}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onCopyPreviousSessionManual}
                  className="px-3 py-1.5 rounded-xl bg-primary/10 hover:bg-primary/15 border border-primary/25 text-primary text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Copy className="size-3.5" />
                  <span>{bi('نسخ من الجلسة السابقة', 'Copy Last Session', 'کۆپیکردن لە دانیشتنی پێشوو')}</span>
                </button>
              )}

              <button
                type="button"
                onClick={onOpenChipEditor}
                className="px-3 py-1.5 rounded-xl bg-surface hover:bg-layer-hover border border-line-2 text-muted-foreground-1 hover:text-foreground text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <SlidersHorizontal className="size-3.5" />
                <span>{bi('تخصيص البطاقات', 'Customize Chips', 'تایبەتمەندکردنی کارتەکان')}</span>
              </button>
            </div>
          </div>

          {favoriteChips.length > 0 && (
            <div className="pt-2.5 border-t border-card-divider space-y-1.5">
              <span className="text-xs text-muted-foreground-1 font-semibold block">
                {bi('إدراج بلمسة واحدة:', '1-Tap Insert:', 'دانان بە یەک کرتە:')}
              </span>
              <div className="rounded-2xl border border-line-2 bg-surface/60 p-1 overflow-hidden">
                <div className="pr-hscroll overflow-x-auto flex items-center gap-1.5 whitespace-nowrap pb-1 pt-0.5 px-0.5">
                  {favoriteChips.map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() => onApplyFavoriteChip(chip)}
                      className="min-h-[34px] px-3 py-1 rounded-xl bg-primary/5 hover:bg-primary/12 border border-primary/15 hover:border-primary/35 text-xs font-semibold text-foreground hover:text-primary transition-all inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      {chip.category === 'exercise' ? (
                        <Dumbbell className="size-3.5 text-emerald-600 shrink-0" />
                      ) : chip.category === 'manual' ? (
                        <Hand className="size-3.5 text-sky-600 shrink-0" />
                      ) : (
                        <Zap className="size-3.5 text-amber-500 shrink-0" />
                      )}
                      <span>+ {bi(chip.labelAr, chip.labelEn)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
};
