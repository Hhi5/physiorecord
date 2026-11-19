import React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
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
  isLocked?: boolean;
  copiedFromInfo?: { sessionNumber: number; sessionDate: string } | null;
  onResetCopiedFields?: () => void;
  onCopyPreviousSessionManual?: () => void;
  onOpenChipEditor?: () => void;
  favoriteChips?: QuickSoapChip[];
  onApplyFavoriteChip?: (chip: QuickSoapChip) => void;
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
    </>
  );
};
