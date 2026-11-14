// =======================================================================
// PhysioRecord — Imaging (MRI/X-Ray), Referrals & Clinical Documents Panel
// Fixes silent-click behavior, supports `+` multi-report drafting queue,
// supports "Other" manual document type + saved suggestions, optional
// encrypted binary file upload (Dexie v9), and immediate encrypted save.
// =======================================================================

import React, { useRef, useState } from 'react';
import {
  Paperclip,
  Plus,
  Trash2,
  Upload,
  CheckCircle2,
  AlertCircle,
  FileText,
  X,
} from 'lucide-react';
import type { PatientDocumentAttachment } from '../../types/clinical';
import type { PatientAttachmentCategory } from '../../types/clinicManagement';
import { useLanguage } from '../../context/LanguageContext';
import { useVault } from '../../context/VaultContext';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import { processAttachmentFile } from '../../utils/attachmentMedia';
import { localDate } from '../../utils/date';
import {
  ATTACHMENT_CATEGORY_OPTIONS,
  CUSTOM_REPORT_TYPE_SUGGESTIONS,
  buildAttachmentsFromDrafts,
  createBlankReportDraft,
  getAttachmentCategoryDisplayLabel,
  normalizeLegacyAttachment,
  validateReportDraftQueue,
  type ImagingReportDraftRow,
} from '../../utils/imagingReports';

interface PatientImagingReportsPanelProps {
  patientId: string;
  episodeId?: string;
  attachments: PatientDocumentAttachment[];
  onPersistAttachments: (nextAttachments: PatientDocumentAttachment[]) => Promise<void>;
}

export const PatientImagingReportsPanel: React.FC<PatientImagingReportsPanelProps> = ({
  patientId,
  episodeId,
  attachments,
  onPersistAttachments,
}) => {
  const { language, bi } = useLanguage();
  const { dek } = useVault();

  const [drafts, setDrafts] = useState<ImagingReportDraftRow[]>(() => [
    createBlankReportDraft(),
  ]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const titleInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const normalizedList = attachments.map(normalizeLegacyAttachment);

  const updateDraft = (draftId: string, patch: Partial<ImagingReportDraftRow>) => {
    setDrafts((prev) => prev.map((d) => (d.draftId === draftId ? { ...d, ...patch } : d)));
    if (validationError) setValidationError(null);
    if (savedNotice) setSavedNotice(null);
  };

  const handleAddDraftRow = () => {
    const newRow = createBlankReportDraft();
    setDrafts((prev) => [...prev, newRow]);
    setValidationError(null);
    setSavedNotice(null);
    requestAnimationFrame(() => {
      titleInputRefs.current[newRow.draftId]?.focus();
    });
  };

  const handleRemoveDraftRow = (draftId: string) => {
    if (drafts.length <= 1) return;
    setDrafts((prev) => prev.filter((d) => d.draftId !== draftId));
    setValidationError(null);
  };

  const mapToBinaryCategory = (
    cat: PatientDocumentAttachment['category']
  ): PatientAttachmentCategory => {
    if (cat === 'imaging_mri_xray') return 'imaging_mri_xray';
    if (cat === 'referral' || cat === 'lab_report' || cat === 'consent') return 'pdf_report';
    return 'other';
  };

  const handleSaveReports = async () => {
    if (saving) return;

    const check = validateReportDraftQueue(drafts);
    if (!check.valid) {
      const msg =
        language === 'en'
          ? check.reasonEn || 'Please complete required report fields.'
          : language === 'ckb'
          ? check.reasonCkb || check.reasonAr || ''
          : check.reasonAr || 'يرجى إكمال الحقول المطلوبة.';
      setValidationError(msg);
      if (check.firstInvalidDraftId) {
        requestAnimationFrame(() => {
          titleInputRefs.current[check.firstInvalidDraftId!]?.focus();
        });
      }
      return;
    }

    setSaving(true);
    setValidationError(null);
    setSavedNotice(null);

    try {
      const uploadedMap: Record<
        string,
        { attachmentRecordId: string; fileName: string }
      > = {};

      for (const row of drafts) {
        if (row.file && dek) {
          const media = await processAttachmentFile(row.file);
          const binaryRec = await ClinicOperationsService.saveAttachmentAsync({
            patientId,
            episodeId,
            category: mapToBinaryCategory(row.category),
            title: row.title.trim(),
            notes: row.summaryNotes.trim() || undefined,
            fileName: media.fileName,
            mimeType: media.mimeType,
            payloadDataUrl: media.payloadDataUrl,
            thumbnailDataUrl: media.thumbnailDataUrl,
            widthPx: media.widthPx,
            heightPx: media.heightPx,
            originalBytes: media.originalBytes,
            storedBytes: media.storedBytes,
            capturedAt: row.studyDate || localDate(),
          });
          uploadedMap[row.draftId] = {
            attachmentRecordId: binaryRec.id,
            fileName: media.fileName,
          };
        }
      }

      const newItems = buildAttachmentsFromDrafts(drafts, {
        dateAdded: localDate(),
        uploadedAttachmentsByDraftId: uploadedMap,
      });

      const nextList = [...newItems, ...attachments];
      await onPersistAttachments(nextList);

      setDrafts([createBlankReportDraft()]);
      setSavedNotice(
        bi(
          `تم إرفاق وحفظ (${newItems.length}) تقرير في ملف المريض المشفر بنجاح.`,
          `Attached and encrypted ${newItems.length} report(s) into patient record.`,
          `(${newItems.length}) ڕاپۆرت بە سەرکەوتوویی هاوپێچکرا و لە تۆماری نهێنیکراوی نەخۆش پاشەکەوتکرا.`
        )
      );
    } catch (err: unknown) {
      setValidationError(
        err instanceof Error
          ? err.message
          : bi(
              'تعذر حفظ التقرير. يرجى التحقق من المدخلات.',
              'Failed to save report.',
              'پاشەکەوتکردنی ڕاپۆرت سەرکەوتوو نەبوو. تکایە زانیارییەکان بپشکنەرەوە.'
            )
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSavedReport = async (att: PatientDocumentAttachment) => {
    const nextList = attachments.filter((a) => a.id !== att.id);
    await onPersistAttachments(nextList);
    if (att.attachmentRecordId) {
      await ClinicOperationsService.deleteAttachmentAsync(
        patientId,
        att.attachmentRecordId
      );
    }
  };

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-card border border-card-line shadow-2xs space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Paperclip className="size-4 text-primary" />
          <h4 className="text-xs sm:text-sm font-bold text-foreground">
            {bi(
              'الأشعة، الرنين، والمستندات السريرية',
              'Clinical Attachments & Imaging Reports (MRI / X-Ray / Referrals)',
              'تیشک، ڕەنین (MRI)، و بەڵگەنامە کلینیکییەکان'
            )}
          </h4>
        </div>

        <button
          type="button"
          onClick={handleAddDraftRow}
          className="px-3 py-1.5 rounded-xl bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
        >
          <Plus className="size-3.5" />
          <span>{bi('إضافة تقرير آخر (+)', 'Add Another Report (+)', 'زیادکردنی ڕاپۆرتێکی تر (+)')}</span>
        </button>
      </div>

      {/* Multi-Report Draft Queue */}
      <div className="space-y-3">
        {drafts.map((row, idx) => (
          <div
            key={row.draftId}
            className="p-3.5 rounded-xl bg-surface border border-line-2 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-primary">
                {bi(`تقرير رقم ${idx + 1}`, `Report #${idx + 1}`, `ڕاپۆرتی ژمارە ${idx + 1}`)}
              </span>
              {drafts.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveDraftRow(row.draftId)}
                  className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <X className="size-3.5" />
                  <span>{bi('إزالة الصف', 'Remove Row', 'لابردنی ڕیزەکە')}</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
              {/* Category Selector (Includes "Other — Manual Entry") */}
              <div>
                <label className="block text-xs font-bold text-foreground mb-1">
                  {bi('نوع التقرير:', 'Document Type:', 'جۆری ڕاپۆرت:')}
                </label>
                <select
                  value={row.category}
                  onChange={(e) =>
                    updateDraft(row.draftId, {
                      category: e.target.value as PatientDocumentAttachment['category'],
                    })
                  }
                  aria-label={bi('نوع التقرير', 'Document type', 'جۆری ڕاپۆرت')}
                  className="w-full py-2 px-2.5 rounded-xl border border-layer-line bg-layer text-xs text-foreground focus:outline-none focus:border-primary"
                >
                  {ATTACHMENT_CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {language === 'en' ? opt.en : language === 'ckb' ? opt.ckb : opt.ar}
                    </option>
                  ))}
                </select>
              </div>

              {/* Title Input */}
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-foreground mb-1">
                  {bi('عنوان التقرير / الفحص:', 'Report Title / Exam:', 'ناونیشانی ڕاپۆرت / پشکنین:')}
                </label>
                <input
                  ref={(el) => {
                    titleInputRefs.current[row.draftId] = el;
                  }}
                  type="text"
                  value={row.title}
                  onChange={(e) => updateDraft(row.draftId, { title: e.target.value })}
                  placeholder={bi(
                    'مثال: رنين الفقرات القطنية MRI، أو أشعة الركبة X-Ray...',
                    'e.g. Lumbar Spine MRI, Knee X-Ray...',
                    'نموونە: ڕەنینی بڕبڕەی کەمەر MRI، یان تیشکی ئەژنۆ X-Ray...'
                  )}
                  className="w-full py-2 px-3 rounded-xl border border-layer-line bg-layer text-xs text-foreground focus:outline-none focus:border-primary"
                />
              </div>

              {/* Study Date */}
              <div>
                <label className="block text-xs font-bold text-foreground mb-1">
                  {bi('تاريخ الفحص:', 'Study Date:', 'بەرواری پشکنین:')}
                </label>
                <input
                  type="date"
                  dir="ltr"
                  value={row.studyDate}
                  onChange={(e) => updateDraft(row.draftId, { studyDate: e.target.value })}
                  className="w-full py-2 px-2.5 rounded-xl border border-layer-line bg-layer text-xs text-foreground font-mono"
                />
              </div>
            </div>

            {/* Conditional Manual "Other" Category Input + Quick Suggestions */}
            {row.category === 'other' && (
              <div className="p-2.5 rounded-xl bg-layer border border-primary/30 space-y-2">
                <label className="block text-xs font-bold text-foreground">
                  {bi(
                    'اكتب نوع المستند أو الفحص يدوياً:',
                    'Specify Manual Document Type ("Other"):',
                    'جۆری بەڵگەنامە یان پشکنینەکە بە دەستی بنووسە:'
                  )}
                </label>
                <input
                  type="text"
                  value={row.customCategoryLabel}
                  onChange={(e) =>
                    updateDraft(row.draftId, { customCategoryLabel: e.target.value })
                  }
                  placeholder={bi(
                    'مثال: تخطيط أعصاب EMG، سونار عضلي، تقرير جراحة سابقة...',
                    'e.g. Nerve Conduction Study, MSK Ultrasound, Surgical Note...',
                    'نموونە: پشکنینی دەمار EMG، سۆنەری ماسولکە، ڕاپۆرتی نەشتەرگەری پێشوو...'
                  )}
                  className="w-full py-2 px-3 rounded-xl border border-layer-line bg-card text-xs text-foreground focus:outline-none focus:border-primary"
                />
                <div className="flex flex-wrap gap-1">
                  {CUSTOM_REPORT_TYPE_SUGGESTIONS.map((sug) => {
                    const txt = language === 'en' ? sug.en : language === 'ckb' ? sug.ckb : sug.ar;
                    return (
                      <button
                        key={sug.en}
                        type="button"
                        onClick={() =>
                          updateDraft(row.draftId, { customCategoryLabel: txt })
                        }
                        className="px-2 py-0.5 rounded-md bg-card border border-card-line hover:bg-surface text-xs text-foreground cursor-pointer"
                      >
                        {txt}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Region, Summary Notes & Optional Real Image / PDF File Attachment */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground-1 mb-1">
                  {bi('المنطقة التشريحية (اختياري):', 'Body Region (Optional):', 'ناوچەی توێکاری (ئارەزوومەندانە):')}
                </label>
                <input
                  type="text"
                  value={row.bodyRegion}
                  onChange={(e) => updateDraft(row.draftId, { bodyRegion: e.target.value })}
                  placeholder={bi('مثال: L4-L5 / الكتف الأيمن', 'e.g. Lumbar / Right Shoulder', 'نموونە: L4-L5 / شانی ڕاست')}
                  className="w-full py-2 px-3 rounded-xl border border-layer-line bg-layer text-xs text-foreground"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground-1 mb-1">
                  {bi('ملخص النتائج / التقرير:', 'Key Findings / Notes:', 'پوختەی ئەنجامەکان / ڕاپۆرت:')}
                </label>
                <input
                  type="text"
                  value={row.summaryNotes}
                  onChange={(e) => updateDraft(row.draftId, { summaryNotes: e.target.value })}
                  placeholder={bi(
                    'النتائج الرئيسية (مثال: انزلاق غضروفي L4-L5...)',
                    'Key radiological findings or notes...',
                    'ئەنجامە سەرەکییەکان (نموونە: خزانی دیسکی L4-L5...)'
                  )}
                  className="w-full py-2 px-3 rounded-xl border border-layer-line bg-layer text-xs text-foreground"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground-1 mb-1">
                  {bi(
                    'إرفاق صورة / PDF مشفر (اختياري):',
                    'Attach Encrypted Image / PDF (Optional):',
                    'هاوپێچکردنی وێنە / PDF ی نهێنیکراو (ئارەزوومەندانە):'
                  )}
                </label>
                <label className="flex items-center justify-between gap-2 py-2 px-3 rounded-xl border border-dashed border-layer-line bg-layer hover:bg-layer-hover text-xs text-foreground cursor-pointer">
                  <span className="truncate flex items-center gap-1.5">
                    <Upload className="size-3.5 text-primary shrink-0" />
                    <span>
                      {row.file
                        ? row.file.name
                        : bi('اختر صورة أشعة أو PDF', 'Choose X-Ray/MRI or PDF', 'وێنەی تیشک یان PDF هەڵبژێرە')}
                    </span>
                  </span>
                  <input
                    type="file"
                    accept="image/*,.pdf,application/pdf"
                    onChange={(e) =>
                      updateDraft(row.draftId, { file: e.target.files?.[0] || null })
                    }
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Explicit Validation / Save Feedback */}
      {validationError && (
        <div
          role="alert"
          className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center gap-2"
        >
          <AlertCircle className="size-4 shrink-0" />
          <span>{validationError}</span>
        </div>
      )}

      {savedNotice && (
        <div
          role="status"
          className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-2"
        >
          <CheckCircle2 className="size-4 shrink-0" />
          <span>{savedNotice}</span>
        </div>
      )}

      {/* Action Buttons: + Add Another Row & Primary Attach/Save Button (NEVER silently unclickable) */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <button
          type="button"
          onClick={handleAddDraftRow}
          className="px-3 py-2 rounded-xl border border-layer-line bg-layer hover:bg-layer-hover text-foreground text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="size-3.5 text-primary" />
          <span>{bi('إضافة خانة تقرير أخرى (+)', 'Add Another Row (+)', 'زیادکردنی ڕیزی ڕاپۆرتێکی تر (+)')}</span>
        </button>

        <button
          type="button"
          onClick={() => void handleSaveReports()}
          disabled={saving}
          className="py-2 px-4 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer disabled:opacity-60"
        >
          <Paperclip className="size-3.5" />
          <span>
            {saving
              ? bi('جاري الحفظ والتشفير...', 'Encrypting & Saving...', 'پاشەکەوتکردن و نهێنیکردن لە جێبەجێکردندایە...')
              : drafts.length > 1
              ? bi(
                  `+ إرفاق وحفظ (${drafts.length}) تقارير`,
                  `+ Attach & Save (${drafts.length}) Reports`,
                  `+ هاوپێچکردن و پاشەکەوتکردنی (${drafts.length}) ڕاپۆرت`
                )
              : bi('+ إرفاق التقرير', '+ Attach Report', '+ هاوپێچکردنی ڕاپۆرت')}
          </span>
        </button>
      </div>

      {/* Saved Reports List */}
      {normalizedList.length > 0 && (
        <div className="pt-3 border-t border-card-divider grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {normalizedList.map((att) => (
            <div
              key={att.id}
              className="p-3 rounded-xl bg-surface border border-line-2 flex items-start justify-between gap-2 text-xs"
            >
              <div className="min-w-0 space-y-1">
                <div className="font-bold text-foreground flex items-center gap-1.5">
                  <FileText className="size-3.5 text-primary shrink-0" />
                  <span className="truncate">{att.title}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground-1">
                  <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                    {getAttachmentCategoryDisplayLabel(att, language)}
                  </span>
                  {att.bodyRegion && <span>• {att.bodyRegion}</span>}
                  {att.studyDate && (
                    <span dir="ltr" className="font-mono">
                      • {att.studyDate}
                    </span>
                  )}
                </div>
                {att.fileName && (
                  <div className="text-xs text-emerald-700 dark:text-emerald-300 font-semibold truncate">
                    📎 {att.fileName}
                  </div>
                )}
                {att.summaryNotes && (
                  <p className="text-xs text-muted-foreground-2 leading-relaxed">
                    {att.summaryNotes}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => void handleDeleteSavedReport(att)}
                aria-label={bi('حذف التقرير', 'Delete report', 'سڕینەوەی ڕاپۆرت')}
                className="p-1.5 rounded-lg text-muted-foreground-1 hover:text-rose-600 hover:bg-rose-500/10 cursor-pointer shrink-0"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
