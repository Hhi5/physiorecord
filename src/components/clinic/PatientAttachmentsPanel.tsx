// =======================================================================
// PhysioRecord — Encrypted Clinical Attachments & Posture Photos (5.2)
// Stored in Dexie v9 `attachments` (AES-GCM), compressed (~1600px) with ~320px
// thumbnails, posture Before/After side-by-side comparison, & PDF previews.
// =======================================================================

import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  FileText,
  Upload,
  Trash2,
  Eye,
  Download,
  AlertTriangle,
  Columns2,
  Plus,
  Ruler,
  Paperclip,
  X,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import {
  ATTACHMENT_TOTAL_WARNING_BYTES,
  formatReadableBytes,
  isSafeAttachmentDataUrl,
  processAttachmentFile,
} from '../../utils/attachmentMedia';
import { localDate } from '../../utils/date';
import { ModalDialog } from '../ui/Dialog';
import { DatePickerInput } from '../ui/Primitives';
import type {
  EncryptedAttachmentRecord,
  PatientAttachmentCategory,
} from '../../types/clinicManagement';

const PhotoMeasurementStudioModal = lazy(() => import('./PhotoMeasurementStudioModal'));

interface PatientAttachmentsPanelProps {
  patientId: string;
  episodeId?: string;
}

const CATEGORY_LABELS: Record<
  PatientAttachmentCategory,
  { ar: string; en: string; ckb: string }
> = {
  posture_before: {
    ar: 'قوام / صورة (قبل العلاج)',
    en: 'Posture / Photo (Before)',
    ckb: 'شێوەی وەستان / وێنە (پێش چارەسەر)',
  },
  posture_after: {
    ar: 'قوام / صورة (بعد العلاج)',
    en: 'Posture / Photo (After)',
    ckb: 'شێوەی وەستان / وێنە (دوای چارەسەر)',
  },
  imaging_mri_xray: {
    ar: 'أشعة / رنين (MRI / X-Ray)',
    en: 'Radiology / MRI / X-Ray',
    ckb: 'تیشک / ڕەنین (MRI / X-Ray)',
  },
  pdf_report: {
    ar: 'تقرير طبي (PDF)',
    en: 'Medical Report (PDF)',
    ckb: 'ڕاپۆرتی پزیشکی (PDF)',
  },
  clinical_photo: {
    ar: 'صورة سريرية عامة',
    en: 'Clinical Photo',
    ckb: 'وێنەی کلینیکی گشتی',
  },
  other: {
    ar: 'مرفق آخر',
    en: 'Other Attachment',
    ckb: 'هاوپێچی تر',
  },
};

export const PatientAttachmentsPanel: React.FC<PatientAttachmentsPanelProps> = ({
  patientId,
  episodeId,
}) => {
  const { t, bi } = useLanguage();

  const [isEnabled, setIsEnabled] = useState<boolean>(() =>
    ClinicOperationsService.isAttachmentsModuleEnabled()
  );
  const [photoToolsEnabled, setPhotoToolsEnabled] = useState<boolean>(() =>
    ClinicOperationsService.isPhotoMeasurementToolsEnabled()
  );
  const [attachments, setAttachments] = useState<EncryptedAttachmentRecord[]>(() =>
    ClinicOperationsService.getAttachmentsForPatient(patientId)
  );
  const [totalVaultBytes, setTotalVaultBytes] = useState<number>(() =>
    ClinicOperationsService.getTotalAttachmentsBytes()
  );

  const [showUploadForm, setShowUploadForm] = useState(false);
  const [category, setCategory] = useState<PatientAttachmentCategory>('clinical_photo');
  const [title, setTitle] = useState('');
  const [capturedAt, setCapturedAt] = useState(() => localDate());
  const [posturePairKey, setPosturePairKey] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sizeWarningMsg, setSizeWarningMsg] = useState<string | null>(null);

  const [previewAttachment, setPreviewAttachment] =
    useState<EncryptedAttachmentRecord | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Posture comparison modal state
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [studioTarget, setStudioTarget] = useState<EncryptedAttachmentRecord | null>(null);
  const [beforeId, setBeforeId] = useState<string>('');
  const [afterId, setAfterId] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void ClinicOperationsService.ensurePatientColdStoresLoadedAsync(
      patientId,
      episodeId ? [episodeId] : []
    );
    const sync = () => {
      setIsEnabled(ClinicOperationsService.isAttachmentsModuleEnabled());
      setPhotoToolsEnabled(ClinicOperationsService.isPhotoMeasurementToolsEnabled());
      setAttachments(ClinicOperationsService.getAttachmentsForPatient(patientId));
      setTotalVaultBytes(ClinicOperationsService.getTotalAttachmentsBytes());
    };
    sync();
    const unsubscribe = ClinicOperationsService.subscribe(sync);
    window.addEventListener('physiorecord-modules-updated', sync);
    return () => {
      unsubscribe();
      window.removeEventListener('physiorecord-modules-updated', sync);
    };
  }, [patientId, episodeId]);

  const imageAttachments = useMemo(
    () => attachments.filter((a) => a.mimeType.startsWith('image/')),
    [attachments]
  );

  const postureBeforeOptions = useMemo(
    () => imageAttachments.filter((a) => a.category === 'posture_before'),
    [imageAttachments]
  );
  const postureAfterOptions = useMemo(
    () => imageAttachments.filter((a) => a.category === 'posture_after'),
    [imageAttachments]
  );

  useEffect(() => {
    if (!beforeId && postureBeforeOptions.length > 0) {
      setBeforeId(postureBeforeOptions[0].id);
    }
    if (!afterId && postureAfterOptions.length > 0) {
      setAfterId(postureAfterOptions[0].id);
    }
  }, [postureBeforeOptions, postureAfterOptions, beforeId, afterId]);

  if (!isEnabled) {
    return (
      <div className="p-4 sm:p-5 rounded-2xl pr-surface flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="size-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <Camera className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-bold text-foreground">
              {bi(
                'معرض صور القوام والملفات المشفرة',
                'Encrypted Posture Gallery & Attachments',
                'پیشانگای وێنەی شێوەی وەستان و فایلە نهێنیکراوەکان'
              )}
            </p>
            <p className="text-xs text-muted-foreground-1">
              {bi(
                'فعّل المعرض لعرض صور القوام قبل/بعد وملفات PDF محلياً بشكل مشفر.',
                'Enable locally to preview posture Before/After photos and encrypted PDF files.',
                'ئەم بەشە چالاک بکە بۆ بینینی وێنەکانی پێش/دوای چارەسەر و فایلە نهێنیکراوەکانی PDF.'
              )}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => ClinicOperationsService.setAttachmentsModuleEnabled(true)}
          className="compact-btn min-h-[40px] px-3.5 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold cursor-pointer transition-colors"
        >
          {bi('تفعيل المعرض السريري', 'Enable Attachment Gallery', 'چالاککردنی پیشانگای کلینیکی')}
        </button>
      </div>
    );
  }

  const resolvedBefore =
    imageAttachments.find((a) => a.id === beforeId) || postureBeforeOptions[0] || imageAttachments[0];
  const resolvedAfter =
    imageAttachments.find((a) => a.id === afterId) ||
    postureAfterOptions[0] ||
    (imageAttachments.length > 1 ? imageAttachments[1] : imageAttachments[0]);

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSizeWarningMsg(null);

    if (!selectedFile) {
      setErrorMsg(
        bi(
          'يرجى اختيار صورة أو ملف PDF أولاً.',
          'Please select an image or PDF report first.',
          'تکایە سەرەتا وێنەیەک یان فایلێکی PDF هەڵبژێرە.'
        )
      );
      return;
    }

    setSaving(true);
    try {
      const processed = await processAttachmentFile(selectedFile);
      if (processed.sizeWarning) {
        setSizeWarningMsg(
          bi(
            `تم حفظ ملف كبير نسبياً (${formatReadableBytes(processed.storedBytes)}). يُفضّل تقليل حجم ملفات PDF للحفاظ على خفة الخزينة.`,
            `Large file stored (${formatReadableBytes(processed.storedBytes)}). Keep encrypted backups small by avoiding very large PDFs.`,
            `فایلێکی تا ڕادەیەک گەورە پاشەکەوت کرا (${formatReadableBytes(processed.storedBytes)}). باشترە قەبارەی فایلەکانی PDF کەم بکەیتەوە بۆ سووکیی خەزێنە.`
          )
        );
      }

      const fallbackTitle =
        selectedFile.name.replace(/\.[^.]+$/, '') ||
        bi(
          CATEGORY_LABELS[category].ar,
          CATEGORY_LABELS[category].en,
          CATEGORY_LABELS[category].ckb
        );

      await ClinicOperationsService.saveAttachmentAsync({
        patientId,
        episodeId,
        category,
        title: title.trim() || fallbackTitle,
        notes: notes.trim() || undefined,
        fileName: processed.fileName,
        mimeType: processed.mimeType,
        payloadDataUrl: processed.payloadDataUrl,
        thumbnailDataUrl: processed.thumbnailDataUrl,
        widthPx: processed.widthPx,
        heightPx: processed.heightPx,
        originalBytes: processed.originalBytes,
        storedBytes: processed.storedBytes,
        posturePairKey: posturePairKey.trim() || undefined,
        capturedAt,
      });

      setSelectedFile(null);
      setTitle('');
      setNotes('');
      setPosturePairKey('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      setShowUploadForm(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadAttachment = (att: EncryptedAttachmentRecord) => {
    if (!isSafeAttachmentDataUrl(att.payloadDataUrl)) {
      setErrorMsg(
        bi(
          'تم حظر تنزيل هذا المرفق لأن صيغة البيانات المخزنة غير صالحة أمنياً.',
          'Download blocked because the stored attachment data URL is invalid.',
          'داگرتنی ئەم هاوپێچە ڕاگیرا چونکە فۆرماتی داتاکە پارێزراو نییە.'
        )
      );
      return;
    }
    const link = document.createElement('a');
    link.href = att.payloadDataUrl;
    link.download = att.fileName || `${att.title}.bin`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const overTotalWarning = totalVaultBytes >= ATTACHMENT_TOTAL_WARNING_BYTES;

  return (
    <div className="pr-surface rounded-2xl p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="size-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <Camera className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xs sm:text-sm font-bold text-foreground">
                {t('attachments.title')}
              </h3>
              <span className="text-xs font-mono tabular-nums text-muted-foreground-1">
                · {formatReadableBytes(totalVaultBytes)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {imageAttachments.length >= 2 && (
            <button
              type="button"
              data-testid="open-posture-compare-modal-btn"
              onClick={() => setShowCompareModal(true)}
              className="compact-btn min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface hover:bg-surface/80 text-foreground text-xs font-bold transition-colors cursor-pointer"
            >
              <Columns2 className="w-4 h-4 text-primary" />
              {bi('مقارنة الصور', 'Compare Photos', 'بەراوردکردنی وێنەکان')}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowUploadForm((prev) => !prev)}
            className="compact-btn min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold transition-colors cursor-pointer shadow-2xs"
          >
            <Plus className="w-4 h-4" />
            {bi('إضافة مرفق', 'Add Attachment', 'زیادکردنی هاوپێچ')}
          </button>
        </div>
      </div>

      {overTotalWarning && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            {bi(
              `حجم المرفقات التراكمي (${formatReadableBytes(totalVaultBytes)}) تجاوز 20 MB. يُنصح بأخذ نسخة احتياطية مشفرة بشكل دوري.`,
              `Cumulative attachment size (${formatReadableBytes(totalVaultBytes)}) exceeds 20 MB. Export an encrypted v3.0 backup regularly.`,
              `قەبارەی کۆکراوەی هاوپێچەکان (${formatReadableBytes(totalVaultBytes)}) لە 20 MB تێپەڕیوە. پێشنیار دەکرێت بە شێوەی خولی کۆپییەکی یەدەگی نهێنیکراو هەناردە بکەیت.`
            )}
          </span>
        </div>
      )}

      {sizeWarningMsg && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-800 dark:text-amber-300">
          {sizeWarningMsg}
        </div>
      )}

      {showUploadForm && (
        <form
          onSubmit={handleUploadSubmit}
          className="p-4 rounded-2xl bg-surface/70 space-y-3"
        >
          {errorMsg && (
            <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-700 dark:text-rose-300">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                {bi('التصنيف', 'Category', 'پۆلێنکردن')}
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as PatientAttachmentCategory)}
                className="w-full px-3 py-2 rounded-xl border border-card-stroke bg-layer text-xs text-foreground"
              >
                {(Object.keys(CATEGORY_LABELS) as PatientAttachmentCategory[]).map((k) => (
                  <option key={k} value={k}>
                    {bi(CATEGORY_LABELS[k].ar, CATEGORY_LABELS[k].en, CATEGORY_LABELS[k].ckb)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                {bi('العنوان', 'Title', 'ناونیشان')}
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={bi(
                  'مثال: وقوف جانبي — الكتفين',
                  'e.g. Sagittal Posture Standing',
                  'نموونە: وەستانی لاوەکی — شانەکان'
                )}
                className="w-full px-3 py-2 rounded-xl border border-card-stroke bg-layer text-xs text-foreground"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                {bi('تاريخ الالتقاط', 'Captured Date', 'بەرواری گرتن')}
              </label>
              <DatePickerInput
                value={capturedAt}
                onChange={setCapturedAt}
                ariaLabel={bi('تاريخ الالتقاط', 'Captured Date', 'بەرواری گرتن')}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                {bi('وسم المقارنة (اختياري)', 'Pair Tag (optional)', 'تاگی بەراوردکردن (ئارەزوومەندانە)')}
              </label>
              <input
                type="text"
                value={posturePairKey}
                onChange={(e) => setPosturePairKey(e.target.value)}
                placeholder={bi('مثال: جانبي-1', 'e.g. sagittal-1', 'نموونە: لاوەکی-1')}
                className="w-full px-3 py-2 rounded-xl border border-card-stroke bg-layer text-xs text-foreground"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                {bi(
                  'صورة (تُضغط إلى ~1600px) أو تقرير PDF',
                  'Image (resized to ~1600px) or PDF Report',
                  'وێنە (دەپەسترێت بۆ ~1600px) یان ڕاپۆرتی PDF'
                )}
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/bmp,image/gif,.pdf,application/pdf"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="sr-only"
                aria-label={bi(
                  'اختيار صورة أو ملف PDF',
                  'Choose image or PDF file',
                  'هەڵبژاردنی وێنە یان فایلی PDF'
                )}
              />
              {selectedFile ? (
                <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-primary/40 bg-primary/8">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="size-8 rounded-lg bg-primary/15 text-primary inline-flex items-center justify-center shrink-0">
                      {selectedFile.type === 'application/pdf' ? (
                        <FileText className="size-4" />
                      ) : (
                        <Camera className="size-4" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-foreground truncate">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground-1 font-mono tabular-nums">
                        {formatReadableBytes(selectedFile.size)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      style={{ minHeight: 'unset' }}
                      className="compact-btn px-2.5 py-1.5 rounded-lg bg-card hover:bg-layer-hover text-xs font-bold text-primary cursor-pointer"
                    >
                      {bi('تغيير', 'Change', 'گۆڕین')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      aria-label={bi('إزالة الملف', 'Remove file', 'لابردنی فایل')}
                      style={{ minHeight: 'unset' }}
                      className="compact-btn size-7 rounded-lg bg-card hover:bg-rose-500/10 text-muted-foreground-1 hover:text-rose-600 inline-flex items-center justify-center cursor-pointer"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  data-testid="custom-attachment-file-picker"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl border border-dashed border-primary/45 bg-layer hover:bg-primary/6 hover:border-primary transition-colors flex items-center justify-between gap-2.5 text-start cursor-pointer"
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span className="size-8 rounded-lg bg-primary/12 text-primary inline-flex items-center justify-center shrink-0">
                      <Paperclip className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-foreground truncate">
                        {bi('اختيار صورة أو ملف PDF', 'Choose Image or PDF', 'هەڵبژاردنی وێنە یان PDF')}
                      </span>
                      <span className="block text-xs text-muted-foreground-1 truncate">
                        {bi('لم يتم اختيار أي ملف بعد', 'No file chosen yet', 'هێشتا هیچ فایلێک هەڵنەبژێردراوە')}
                      </span>
                    </span>
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-primary/12 text-primary text-xs font-bold shrink-0">
                    {bi('تصفح', 'Browse', 'گەڕان')}
                  </span>
                </button>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                {bi('ملاحظات سريرية', 'Clinical Notes', 'تێبینییە کلینیکییەکان')}
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={bi(
                  'ملاحظات حول الصورة أو التقرير',
                  'Optional findings or angle note',
                  'تێبینی سەبارەت بە وێنەکە یان ڕاپۆرتەکە'
                )}
                className="w-full px-3 py-2 rounded-xl border border-card-stroke bg-layer text-xs text-foreground"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowUploadForm(false)}
              className="px-3 py-2 rounded-xl border border-card-stroke text-xs font-semibold text-muted-foreground-1 hover:bg-layer-hover cursor-pointer"
            >
              {bi('إلغاء', 'Cancel', 'پاشگەزبوونەوە')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold disabled:bg-surface disabled:text-muted-foreground-2 disabled:border disabled:border-line-2 disabled:cursor-not-allowed cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              {saving
                ? bi('جاري التشفير…', 'Encrypting…', 'نهێنیکردن لە جێبەجێکردندایە…')
                : bi('تشفير وحفظ', 'Encrypt & Save', 'نهێنیکردن و پاشەکەوتکردن')}
            </button>
          </div>
        </form>
      )}



      {/* Attachments List */}
      {attachments.length === 0 ? (
        <p className="text-xs text-muted-foreground-1 leading-relaxed py-1">
          {bi(
            'لا توجد صور قوام أو ملفات PDF مرفقة بعد — اضغط «إضافة مرفق» للرفع والتشفير محلياً.',
            'No encrypted posture photos or PDFs saved yet — click "Add Attachment" to upload.',
            'هێشتا هیچ وێنەی شێوەی وەستان یان فایلی PDF هاوپێچ نەکراوە.'
          )}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {attachments.map((att) => {
            const isPdf = att.mimeType === 'application/pdf';
            return (
              <div
                key={att.id}
                className="rounded-2xl bg-surface/65 p-3 flex flex-col gap-2.5"
              >
                <div className="relative h-32 rounded-lg overflow-hidden bg-muted flex items-center justify-center">
                  {isPdf ? (
                    <div className="flex flex-col items-center gap-1.5 text-rose-600 dark:text-rose-400">
                      <FileText className="w-8 h-8" />
                      <span className="text-xs font-bold">
                        {bi('تقرير PDF', 'PDF Report', 'ڕاپۆرتی PDF')}
                      </span>
                    </div>
                  ) : (
                    <img
                      src={att.thumbnailDataUrl || att.payloadDataUrl}
                      alt={att.title}
                      className="w-full h-full object-cover"
                    />
                  )}
                  <span className="absolute top-2 start-2 px-2 py-0.5 rounded bg-slate-950/75 text-white text-xs font-medium">
                    {att.capturedAt}
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-foreground truncate">{att.title}</div>
                  <div className="text-xs text-muted-foreground-1 mt-0.5 truncate">
                    {bi(
                      CATEGORY_LABELS[att.category].ar,
                      CATEGORY_LABELS[att.category].en,
                      CATEGORY_LABELS[att.category].ckb
                    )}{' '}
                    • {formatReadableBytes(att.storedBytes)}
                  </div>
                  {att.notes && (
                    <p className="text-xs text-muted-foreground-1 mt-1 line-clamp-2">{att.notes}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-card-divider">
                  <div className="flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setPreviewAttachment(att)}
                      aria-label={bi(`معاينة ${att.title}`, `Preview ${att.title}`, `پێشبینینی ${att.title}`)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-card hover:bg-layer-hover text-xs font-semibold text-foreground cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      {bi('عرض', 'View', 'پیشاندان')}
                    </button>
                    {!isPdf && photoToolsEnabled && (
                      <button
                        type="button"
                        data-testid={`open-photo-tools-btn-${att.id}`}
                        onClick={() => setStudioTarget(att)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-xs font-semibold text-primary cursor-pointer transition-colors"
                      >
                        <Ruler className="w-3.5 h-3.5" />
                        {bi('قياس الزوايا والقوام', 'Angle & Posture Tools', 'پێوانەی گۆشە و شێوەی وەستان')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDownloadAttachment(att)}
                      aria-label={bi(`تنزيل ${att.title}`, `Download ${att.title}`, `داگرتنی ${att.title}`)}
                      className="size-8 inline-flex items-center justify-center rounded-lg bg-card hover:bg-layer-hover text-muted-foreground-1 hover:text-foreground cursor-pointer shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {confirmDeleteId === att.id ? (
                    <button
                      type="button"
                      onClick={async () => {
                        await ClinicOperationsService.deleteAttachmentAsync(patientId, att.id);
                        setConfirmDeleteId(null);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold cursor-pointer"
                    >
                      {bi('تأكيد الحذف', 'Confirm', 'دڵنیاکردنەوەی سڕینەوە')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(att.id)}
                      aria-label={bi(`حذف ${att.title}`, `Delete ${att.title}`, `سڕینەوەی ${att.title}`)}
                      className="size-8 inline-flex items-center justify-center rounded-lg bg-card text-rose-600 hover:bg-rose-500/10 cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Photo Comparison Modal Dialog */}
      {showCompareModal && (
        <ModalDialog
          isOpen={showCompareModal}
          onOpenChange={(open) => {
            if (!open) setShowCompareModal(false);
          }}
          title={bi('مقارنة الصور (قبل وبعد العلاج)', 'Photo Comparison (Before & After)', 'بەراوردکردنی وێنەکان (پێش و دوای چارەسەر)')}
          subtitle={bi('اختر الصور المراد مقارنتها للعرض السريري المباشر', 'Select photos to compare side-by-side', 'وێنەکان هەڵبژێرە بۆ بەراوردکردنی ڕاستەوخۆ')}
          size="xl"
          closeLabel={bi('إغلاق', 'Close', 'داخستن')}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                {
                  label: bi('الصورة الأولى (الأساس / قبل العلاج)', 'Photo 1 (Baseline / Before)', 'وێنەی یەکەم (بنەڕەت / پێش چارەسەر)'),
                  selectedId: resolvedBefore?.id || '',
                  onChange: setBeforeId,
                  item: resolvedBefore,
                },
                {
                  label: bi('الصورة الثانية (المقارنة / بعد العلاج)', 'Photo 2 (Comparison / After)', 'وێنەی دووەم (بەراورد / دوای چارەسەر)'),
                  selectedId: resolvedAfter?.id || '',
                  onChange: setAfterId,
                  item: resolvedAfter,
                },
              ].map((slot, idx) => (
                <div key={idx} className="space-y-2 flex flex-col">
                  <label className="block text-xs font-semibold text-foreground">
                    {slot.label}
                  </label>
                  <select
                    aria-label={slot.label}
                    value={slot.selectedId}
                    onChange={(e) => slot.onChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-card-stroke bg-layer text-xs text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {imageAttachments.map((img) => (
                      <option key={img.id} value={img.id}>
                        {img.capturedAt} — {img.title}
                      </option>
                    ))}
                  </select>
                  {slot.item ? (
                    <div className="relative rounded-2xl overflow-hidden bg-surface min-h-[300px] max-h-[55vh] flex items-center justify-center p-2">
                      <img
                        src={slot.item.payloadDataUrl}
                        alt={slot.item.title}
                        className="max-h-[50vh] max-w-full object-contain rounded-xl"
                      />
                      <div className="absolute bottom-3 start-3 end-3 flex items-center justify-between pointer-events-none px-2.5 py-1.5 rounded-lg bg-slate-900/75 backdrop-blur-xs text-white text-xs">
                        <span className="truncate font-semibold">{slot.item.title}</span>
                        <span className="shrink-0 tabular-nums text-slate-200 font-mono ms-2">{slot.item.capturedAt}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="h-64 rounded-2xl bg-surface/65 flex items-center justify-center text-xs text-muted-foreground-1">
                      {bi('لم يتم اختيار صورة', 'No photo selected', 'هیچ وێنەیەک دیاری نەکراوە')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </ModalDialog>
      )}

      {/* Lightbox / PDF Viewer Modal */}
      <ModalDialog
        isOpen={Boolean(previewAttachment)}
        onOpenChange={(open) => {
          if (!open) setPreviewAttachment(null);
        }}
        title={previewAttachment?.title || ''}
        subtitle={
          previewAttachment
            ? `${previewAttachment.capturedAt} • ${formatReadableBytes(previewAttachment.storedBytes)}`
            : undefined
        }
        size="xl"
        closeLabel={bi('إغلاق', 'Close', 'داخستن')}
      >
        {previewAttachment && (
          <div className="space-y-3">
            {previewAttachment.mimeType === 'application/pdf' ? (
              isSafeAttachmentDataUrl(previewAttachment.payloadDataUrl, 'pdf') ? (
                // skipcq: JS-D010 - data:application/pdf URLs already run in an opaque origin; HTML5 sandbox disables Chromium/Electron built-in PDF viewer plugins.
                <iframe
                  title={previewAttachment.title}
                  src={previewAttachment.payloadDataUrl}
                  referrerPolicy="no-referrer"
                  className="w-full h-[70vh] rounded-xl border border-card-stroke bg-white"
                />
              ) : (
                <div className="p-6 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-700 dark:text-rose-300 text-center">
                  {bi(
                    'تم حظر معاينة ملف PDF لأن محتواه لا يطابق صيغة PDF الآمنة.',
                    'PDF preview blocked because the stored data URL is not a valid PDF payload.',
                    'پێشبینینی PDF ڕاگیرا چونکە داتاکە فۆرماتی PDF ی دروست نییە.'
                  )}
                </div>
              )
            ) : isSafeAttachmentDataUrl(previewAttachment.payloadDataUrl, 'image') ||
              /^data:image\/svg\+xml;base64,/i.test(previewAttachment.payloadDataUrl) ? (
              <div className="flex justify-center bg-surface rounded-xl p-2">
                <img
                  src={previewAttachment.payloadDataUrl}
                  alt={previewAttachment.title}
                  className="max-h-[70vh] w-auto object-contain rounded-lg"
                />
              </div>
            ) : (
              <div className="p-6 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-700 dark:text-rose-300 text-center">
                {bi(
                  'تم حظر معاينة الصورة لأن صيغة البيانات المخزنة غير صالحة.',
                  'Image preview blocked because the stored data URL is invalid.',
                  'پێشبینینی وێنەکە ڕاگیرا چونکە فۆرماتی داتاکە دروست نییە.'
                )}
              </div>
            )}
            {previewAttachment.notes && (
              <p className="text-xs text-muted-foreground-1">{previewAttachment.notes}</p>
            )}
          </div>
        )}
      </ModalDialog>

      {studioTarget && (
        <Suspense fallback={null}>
          <PhotoMeasurementStudioModal
            isOpen={Boolean(studioTarget)}
            onClose={() => setStudioTarget(null)}
            attachment={studioTarget}
            onSavedCopy={(updated) => setStudioTarget(updated)}
          />
        </Suspense>
      )}
    </div>
  );
};
