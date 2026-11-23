// =======================================================================
// PhysioRecord — Imaging (MRI/X-Ray), Referrals & Clinical Documents Panel
// Calm Read-First face-sheet card + Modal bottom-sheet report builder
// Supports multi-report queue, "Other" custom type, & Dexie v9 encryption.
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
import { formatDateDDMMYYYY, localDate } from '../../utils/date';
import { ModalDialog } from '../ui/Dialog';
import { DatePickerInput } from '../ui/Primitives';
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

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [drafts, setDrafts] = useState<ImagingReportDraftRow[]>(() => [
    createBlankReportDraft(),
  ]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const titleInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const normalizedList = attachments.map(normalizeLegacyAttachment);

  const openModal = () => {
    setDrafts([createBlankReportDraft()]);
    setValidationError(null);
    setSavedNotice(null);
    setIsModalOpen(true);
  };

  const updateDraft = (draftId: string, patch: Partial<ImagingReportDraftRow>) => {
    setDrafts((prev) => prev.map((d) => (d.draftId === draftId ? { ...d, ...patch } : d)));
    if (validationError) setValidationError(null);
  };

  const handleAddDraftRow = () => {
    const newRow = createBlankReportDraft();
    setDrafts((prev) => [...prev, newRow]);
    setValidationError(null);
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
      const invalidDraftId = check.firstInvalidDraftId;
      if (invalidDraftId) {
        requestAnimationFrame(() => {
          titleInputRefs.current[invalidDraftId]?.focus();
        });
      }
      return;
    }

    setSaving(true);
    setValidationError(null);

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
      setIsModalOpen(false);
      setSavedNotice(
        bi(
          `تم إرفاق وحفظ (${newItems.length}) تقرير في ملف المريض بنجاح.`,
          `Saved and encrypted ${newItems.length} report(s).`,
          `(${newItems.length}) ڕاپۆرت بە سەرکەوتوویی پاشەکەوتکرا.`
        )
      );
      setTimeout(() => setSavedNotice(null), 3500);
    } catch (err: unknown) {
      setValidationError(
        err instanceof Error
          ? err.message
          : bi(
              'تعذر حفظ التقرير. يرجى التحقق من المدخلات.',
              'Failed to save report.',
              'پاشەکەوتکردنی ڕاپۆرت سەرکەوتوو نەبوو.'
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
    setConfirmDeleteId(null);
  };

  return (
    <div className="p-4 sm:p-5 rounded-2xl pr-surface space-y-3">
      {/* Compact Read-First Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="size-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <Paperclip className="size-4" />
          </div>
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <h3 className="text-xs sm:text-sm font-bold text-foreground">
              {bi(
                'تقارير الأشعة والمستندات السريرية',
                'Imaging & Referral Reports',
                'ڕاپۆرتی تیشک و بەڵگەنامە کلینیکییەکان'
              )}
            </h3>
            {normalizedList.length > 0 && (
              <span className="text-xs font-mono tabular-nums text-muted-foreground-1">
                · <bdi dir="ltr">{normalizedList.length}</bdi>
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={openModal}
          className="compact-btn min-h-[40px] px-3.5 rounded-xl bg-surface/90 hover:bg-surface text-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="size-3.5 text-primary" />
          <span>{bi('إضافة تقرير', 'Add Report', 'زیادکردنی ڕاپۆرت')}</span>
        </button>
      </div>

      {savedNotice && (
        <div
          role="status"
          className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-2"
        >
          <CheckCircle2 className="size-4 shrink-0" />
          <span>{savedNotice}</span>
        </div>
      )}

      {/* Saved Reports List or Calm 1-Line Empty State */}
      {normalizedList.length === 0 ? (
        <p className="text-xs text-muted-foreground-1 leading-relaxed py-1">
          {bi(
            'لا توجد تقارير أشعة أو رنين أو إحالات مسجلة بعد — اضغط «إضافة تقرير» عند الحاجة.',
            'No imaging, MRI, or referral reports recorded yet — click "Add Report" when needed.',
            'هێشتا هیچ ڕاپۆرتی تیشک یان ڕەنین تۆمار نەکراوە — لە کاتی پێویستدا کلیک لە «زیادکردنی ڕاپۆرت» بکە.'
          )}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {normalizedList.map((att) => (
            <div
              key={att.id}
              className="p-3.5 rounded-2xl bg-surface/65 flex items-start justify-between gap-2 text-xs"
            >
              <div className="min-w-0 space-y-1">
                <div className="font-bold text-foreground flex items-center gap-1.5">
                  <FileText className="size-3.5 text-primary shrink-0" />
                  <span className="truncate">{att.title}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground-1">
                  <span className="text-primary font-semibold">
                    {getAttachmentCategoryDisplayLabel(att, language)}
                  </span>
                  {att.bodyRegion && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{att.bodyRegion}</span>
                    </>
                  )}
                  {att.studyDate && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span dir="ltr" className="font-mono tabular-nums">
                        {formatDateDDMMYYYY(att.studyDate)}
                      </span>
                    </>
                  )}
                </div>
                {att.fileName && (
                  <div className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold truncate">
                    {att.fileName}
                  </div>
                )}
                {att.summaryNotes && (
                  <p className="text-xs text-muted-foreground-2 leading-relaxed">
                    {att.summaryNotes}
                  </p>
                )}
              </div>

              {confirmDeleteId === att.id ? (
                <div className="inline-flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleDeleteSavedReport(att)}
                    className="compact-btn min-h-[34px] px-2.5 rounded-lg bg-rose-600 text-white text-xs font-bold cursor-pointer"
                  >
                    {bi('حذف', 'Delete', 'سڕینەوە')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(null)}
                    className="compact-btn min-h-[34px] px-2 rounded-lg bg-card text-foreground text-xs cursor-pointer"
                  >
                    {bi('إلغاء', 'Cancel', 'پاشگەز')}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(att.id)}
                  aria-label={bi('حذف التقرير', 'Delete report', 'سڕینەوەی ڕاپۆرت')}
                  className="compact-btn min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-xl text-muted-foreground-2 hover:text-rose-600 hover:bg-card cursor-pointer shrink-0"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal Bottom Sheet for Multi-Report Drafting */}
      <ModalDialog
        isOpen={isModalOpen}
        onOpenChange={setIsModalOpen}
        title={bi(
          'إضافة تقرير أشعة أو مستند سريري',
          'Add Imaging or Clinical Report',
          'زیادکردنی ڕاپۆرتی تیشک یان بەڵگەنامە'
        )}
        subtitle={bi(
          'وثّق نتائج الرنين أو الأشعة وأرفق ملفاً مشفراً عند الحاجة',
          'Document MRI/X-Ray findings and optionally attach an encrypted file',
          'ئەنجامی ڕەنین یان تیشک تۆمار بکە و لە کاتی پێویستدا فایل هاوپێچ بکە'
        )}
        size="lg"
        closeLabel={bi('إغلاق', 'Close', 'داخستن')}
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2 w-full">
            <button
              type="button"
              onClick={handleAddDraftRow}
              className="compact-btn min-h-[42px] px-3.5 rounded-xl bg-surface hover:bg-surface/80 text-foreground text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="size-3.5 text-primary" />
              <span>{bi('تقرير آخر (+)', 'Another Row (+)', 'ڕاپۆرتێکی تر (+)')}</span>
            </button>

            <div className="flex items-center gap-2 ms-auto">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="compact-btn min-h-[42px] px-4 rounded-xl bg-surface hover:bg-surface/80 text-foreground text-xs font-bold cursor-pointer"
              >
                {bi('إلغاء', 'Cancel', 'پاشگەزبوونەوە')}
              </button>
              <button
                type="button"
                onClick={() => void handleSaveReports()}
                disabled={saving}
                className="compact-btn min-h-[42px] px-5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                <Paperclip className="size-3.5" />
                <span>
                  {saving
                    ? bi('جاري الحفظ والتشفير...', 'Encrypting & Saving...', 'پاشەکەوت دەکرێت...')
                    : drafts.length > 1
                    ? bi(
                        `حفظ (${drafts.length}) تقارير`,
                        `Save (${drafts.length}) Reports`,
                        `پاشەکەوتکردنی (${drafts.length}) ڕاپۆرت`
                      )
                    : bi('حفظ التقرير', 'Save Report', 'پاشەکەوتکردنی ڕاپۆرت')}
                </span>
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-3">
          {drafts.map((row, idx) => (
            <div key={row.draftId} className="p-3.5 rounded-2xl bg-surface/65 space-y-3">
              {drafts.length > 1 && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-primary">
                    {bi(`تقرير رقم ${idx + 1}`, `Report #${idx + 1}`, `ڕاپۆرتی ژمارە ${idx + 1}`)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveDraftRow(row.draftId)}
                    className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <X className="size-3.5" />
                    <span>{bi('إزالة', 'Remove', 'لابردن')}</span>
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
                <div>
                  <label htmlFor={`img-cat-${row.draftId}`} className="block text-xs font-bold text-foreground mb-1">
                    {bi('نوع التقرير:', 'Document Type:', 'جۆری ڕاپۆرت:')}
                  </label>
                  <select
                    id={`img-cat-${row.draftId}`}
                    value={row.category}
                    onChange={(e) =>
                      updateDraft(row.draftId, {
                        category: e.target.value as PatientDocumentAttachment['category'],
                      })
                    }
                    className="w-full min-h-[40px] py-2 px-2.5 rounded-xl bg-card text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
                  >
                    {ATTACHMENT_CATEGORY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {language === 'en' ? opt.en : language === 'ckb' ? opt.ckb : opt.ar}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label htmlFor={`img-title-${row.draftId}`} className="block text-xs font-bold text-foreground mb-1">
                    {bi('عنوان التقرير / الفحص:', 'Report Title / Exam:', 'ناونیشانی ڕاپۆرت / پشکنین:')}
                  </label>
                  <input
                    id={`img-title-${row.draftId}`}
                    ref={(el) => {
                      titleInputRefs.current[row.draftId] = el;
                    }}
                    type="text"
                    value={row.title}
                    onChange={(e) => updateDraft(row.draftId, { title: e.target.value })}
                    placeholder={bi(
                      'مثال: رنين الفقرات القطنية MRI، أو أشعة الركبة X-Ray...',
                      'e.g. Lumbar Spine MRI, Knee X-Ray...',
                      'نموونە: ڕەنینی بڕبڕەی کەمەر MRI...'
                    )}
                    className="w-full min-h-[40px] py-2 px-3 rounded-xl bg-card text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
                  />
                </div>

                <div>
                  <label htmlFor={`img-date-${row.draftId}`} className="block text-xs font-bold text-foreground mb-1">
                    {bi('تاريخ الفحص:', 'Study Date:', 'بەرواری پشکنین:')}
                  </label>
                  <DatePickerInput
                    id={`img-date-${row.draftId}`}
                    ariaLabel={bi('تاريخ الفحص', 'Study Date', 'بەرواری پشکنین')}
                    value={row.studyDate}
                    onChange={(val) => updateDraft(row.draftId, { studyDate: val })}
                  />
                </div>
              </div>

              {row.category === 'other' && (
                <div className="p-2.5 rounded-xl bg-card/85 space-y-2">
                  <label htmlFor={`img-custom-cat-${row.draftId}`} className="block text-xs font-bold text-foreground">
                    {bi(
                      'اكتب نوع المستند أو الفحص يدوياً:',
                      'Specify Manual Document Type:',
                      'جۆری بەڵگەنامە بە دەستی بنووسە:'
                    )}
                  </label>
                  <input
                    id={`img-custom-cat-${row.draftId}`}
                    type="text"
                    value={row.customCategoryLabel}
                    onChange={(e) =>
                      updateDraft(row.draftId, { customCategoryLabel: e.target.value })
                    }
                    placeholder={bi(
                      'مثال: تخطيط أعصاب EMG، سونار عضلي...',
                      'e.g. Nerve Conduction Study, MSK Ultrasound...',
                      'نموونە: پشکنینی دەمار EMG...'
                    )}
                    className="w-full min-h-[40px] py-2 px-3 rounded-xl bg-surface text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {CUSTOM_REPORT_TYPE_SUGGESTIONS.map((sug) => {
                      const txt = language === 'en' ? sug.en : language === 'ckb' ? sug.ckb : sug.ar;
                      return (
                        <button
                          key={sug.en}
                          type="button"
                          onClick={() =>
                            updateDraft(row.draftId, { customCategoryLabel: txt })
                          }
                          className="compact-btn px-2.5 py-1 rounded-lg bg-surface hover:bg-surface/80 text-xs text-foreground cursor-pointer"
                        >
                          {txt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                <div>
                  <label htmlFor={`img-region-${row.draftId}`} className="block text-xs font-semibold text-muted-foreground-1 mb-1">
                    {bi('المنطقة (اختياري):', 'Body Region (Optional):', 'ناوچە (ئارەزوومەندانە):')}
                  </label>
                  <input
                    id={`img-region-${row.draftId}`}
                    type="text"
                    value={row.bodyRegion}
                    onChange={(e) => updateDraft(row.draftId, { bodyRegion: e.target.value })}
                    placeholder={bi('مثال: L4-L5 / الكتف الأيمن', 'e.g. Lumbar / Right Shoulder', 'نموونە: L4-L5')}
                    className="w-full min-h-[40px] py-2 px-3 rounded-xl bg-card text-xs text-foreground"
                  />
                </div>

                <div>
                  <label htmlFor={`img-notes-${row.draftId}`} className="block text-xs font-semibold text-muted-foreground-1 mb-1">
                    {bi('ملخص النتائج:', 'Key Findings / Notes:', 'پوختەی ئەنجامەکان:')}
                  </label>
                  <input
                    id={`img-notes-${row.draftId}`}
                    type="text"
                    value={row.summaryNotes}
                    onChange={(e) => updateDraft(row.draftId, { summaryNotes: e.target.value })}
                    placeholder={bi(
                      'النتائج الرئيسية (مثال: انزلاق غضروفي...)',
                      'Key radiological findings or notes...',
                      'ئەنجامە سەرەکییەکان...'
                    )}
                    className="w-full min-h-[40px] py-2 px-3 rounded-xl bg-card text-xs text-foreground"
                  />
                </div>

                <div>
                  <label htmlFor={`img-file-${row.draftId}`} className="block text-xs font-semibold text-muted-foreground-1 mb-1">
                    {bi('صورة / PDF مشفر (اختياري):', 'Image / PDF (Optional):', 'وێنە / PDF (ئارەزوومەندانە):')}
                  </label>
                  <label
                    htmlFor={`img-file-${row.draftId}`}
                    className="flex items-center justify-between gap-2 min-h-[40px] py-2 px-3 rounded-xl bg-card hover:bg-surface/80 text-xs text-foreground cursor-pointer transition-colors"
                  >
                    <span className="truncate flex items-center gap-1.5">
                      <Upload className="size-3.5 text-primary shrink-0" />
                      <span>
                        {row.file
                          ? row.file.name
                          : bi('اختر صورة أو PDF', 'Choose image or PDF', 'وێنە یان PDF هەڵبژێرە')}
                      </span>
                    </span>
                    <input
                      id={`img-file-${row.draftId}`}
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

          {validationError && (
            <div
              role="alert"
              className="text-xs font-bold text-rose-700 dark:text-rose-400 flex items-center gap-2 pt-1"
            >
              <AlertCircle className="size-4 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}
        </div>
      </ModalDialog>
    </div>
  );
};
