// =======================================================================
// PhysioRecord — Imaging, X-Ray, MRI & Clinical Document Helpers
// Supports multi-report drafts, manual "other" category specification,
// optional attached binary references, and legacy normalization.
// =======================================================================

import type { PatientDocumentAttachment } from '../types/clinical';
import { localDate } from './date';

export type AttachmentCategory = PatientDocumentAttachment['category'];

export const ATTACHMENT_CATEGORY_OPTIONS: ReadonlyArray<{
  value: AttachmentCategory;
  ar: string;
  en: string;
  ckb: string;
}> = [
  {
    value: 'imaging_mri_xray',
    ar: 'تقرير رنين / أشعة / سونار',
    en: 'Imaging (MRI / X-Ray / US)',
    ckb: 'ڕاپۆرتی ڕەنین / تیشک / سۆنەر',
  },
  {
    value: 'referral',
    ar: 'كتاب إحالة طبية',
    en: 'Physician Referral Letter',
    ckb: 'نامەی ڕەوانەکردنی پزیشکی',
  },
  {
    value: 'lab_report',
    ar: 'نتائج تحاليل مختبرية',
    en: 'Lab / Pathology Report',
    ckb: 'ئەنجامی پشکنینی تاقیگەیی',
  },
  {
    value: 'consent',
    ar: 'موافقة خطية / إقرار',
    en: 'Signed Consent Form',
    ckb: 'فۆڕمی ڕەزامەندی نەخۆش',
  },
  {
    value: 'other',
    ar: 'أخرى (كتابة يدوية)',
    en: 'Other (Manual Entry)',
    ckb: 'هیتر (نووسینی دەستی)',
  },
];

export const CUSTOM_REPORT_TYPE_SUGGESTIONS: ReadonlyArray<{
  ar: string;
  en: string;
  ckb: string;
}> = [
  { ar: 'تخطيط أعصاب (EMG/NCS)', en: 'EMG / Nerve Conduction', ckb: 'پشکنینی کارەبایی دەمار (EMG)' },
  { ar: 'سونار عضلي هيكلي', en: 'MSK Ultrasound', ckb: 'سۆنەری ماسولکە و ئێسک' },
  { ar: 'تقرير جراحة / عملية سابقة', en: 'Surgical / Operative Note', ckb: 'ڕاپۆرتی نەشتەرگەری پێشوو' },
  { ar: 'استشارة طبيب أعصاب / مفاصل', en: 'Specialist Consultation', ckb: 'ڕاوێژی پزیشکی پسپۆڕ' },
  { ar: 'فحص كثافة العظام (DEXA)', en: 'DEXA Bone Density', ckb: 'پشکنینی چڕی ئێسک (DEXA)' },
];

export interface ImagingReportDraftRow {
  draftId: string;
  category: AttachmentCategory;
  customCategoryLabel: string;
  title: string;
  studyDate: string;
  bodyRegion: string;
  summaryNotes: string;
  file?: File | null;
}

export function createBlankReportDraft(todayStr: string = localDate()): ImagingReportDraftRow {
  return {
    draftId: `draft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    category: 'imaging_mri_xray',
    customCategoryLabel: '',
    title: '',
    studyDate: todayStr,
    bodyRegion: '',
    summaryNotes: '',
    file: null,
  };
}

export interface DraftValidationResult {
  valid: boolean;
  firstInvalidDraftId?: string;
  reasonAr?: string;
  reasonEn?: string;
  reasonCkb?: string;
}

export function validateReportDraftRow(row: ImagingReportDraftRow): DraftValidationResult {
  if (!row.title.trim()) {
    return {
      valid: false,
      firstInvalidDraftId: row.draftId,
      reasonAr: 'يرجى كتابة عنوان التقرير أو الفحص (مثلاً: رنين الفقرات القطنية) قبل الحفظ.',
      reasonEn: 'Please enter a report title (e.g. Lumbar Spine MRI) before saving.',
      reasonCkb: 'تکایە ناونیشانی ڕاپۆرت بنووسە (بۆ نموونە: ڕەنینی بڕبڕەی کەمەر) پێش پاشەکەوتکردن.',
    };
  }
  if (row.category === 'other' && !row.customCategoryLabel.trim()) {
    return {
      valid: false,
      firstInvalidDraftId: row.draftId,
      reasonAr: 'عند اختيار "أخرى"، يرجى كتابة نوع التقرير يدوياً.',
      reasonEn: 'When "Other" is selected, please type the document type manually.',
      reasonCkb: 'لە کاتی هەڵبژاردنی "هیتر"، تکایە جۆری بەڵگەنامەکە بە دەست بنووسە.',
    };
  }
  return { valid: true };
}

export function validateReportDraftQueue(
  drafts: ImagingReportDraftRow[]
): DraftValidationResult {
  if (!drafts || drafts.length === 0) {
    return {
      valid: false,
      reasonAr: 'يرجى إضافة تقرير واحد على الأقل.',
      reasonEn: 'Please add at least one report row.',
      reasonCkb: 'تکایە لانی کەم ڕاپۆرتێک زیاد بکە.',
    };
  }

  for (const row of drafts) {
    const check = validateReportDraftRow(row);
    if (!check.valid) return check;
  }

  return { valid: true };
}

export function buildAttachmentsFromDrafts(
  drafts: ImagingReportDraftRow[],
  options?: {
    dateAdded?: string;
    uploadedAttachmentsByDraftId?: Record<
      string,
      { attachmentRecordId: string; fileName: string }
    >;
  }
): PatientDocumentAttachment[] {
  const dateAdded = options?.dateAdded || localDate();
  const uploaded = options?.uploadedAttachmentsByDraftId || {};

  return drafts.map((row, idx) => {
    const fileLink = uploaded[row.draftId];
    return {
      id: `doc_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
      title: row.title.trim(),
      category: row.category,
      customCategoryLabel:
        row.category === 'other' ? row.customCategoryLabel.trim() : undefined,
      studyDate: row.studyDate.trim() || undefined,
      bodyRegion: row.bodyRegion.trim() || undefined,
      dateAdded,
      summaryNotes: row.summaryNotes.trim() || undefined,
      fileName: fileLink?.fileName || row.file?.name || undefined,
      attachmentRecordId: fileLink?.attachmentRecordId || undefined,
    };
  });
}

export function getAttachmentCategoryDisplayLabel(
  att: Pick<PatientDocumentAttachment, 'category' | 'customCategoryLabel'>,
  lang: 'ar' | 'en' | 'ckb' = 'ar'
): string {
  if (att.category === 'other' && att.customCategoryLabel?.trim()) {
    return att.customCategoryLabel.trim();
  }
  const found = ATTACHMENT_CATEGORY_OPTIONS.find((opt) => opt.value === att.category);
  if (!found) return lang === 'en' ? 'Document' : 'مستند';
  return lang === 'en' ? found.en : lang === 'ckb' ? found.ckb : found.ar;
}

export function normalizeLegacyAttachment(
  att: Partial<PatientDocumentAttachment>
): PatientDocumentAttachment {
  const validCats: AttachmentCategory[] = [
    'referral',
    'imaging_mri_xray',
    'lab_report',
    'consent',
    'other',
  ];
  const category = validCats.includes(att.category as AttachmentCategory)
    ? (att.category as AttachmentCategory)
    : 'other';

  return {
    id: att.id || `doc_${Date.now()}`,
    title: att.title?.trim() || 'Untitled Report',
    category,
    customCategoryLabel: att.customCategoryLabel?.trim() || undefined,
    studyDate: att.studyDate?.trim() || undefined,
    bodyRegion: att.bodyRegion?.trim() || undefined,
    dateAdded: att.dateAdded || localDate(),
    summaryNotes: att.summaryNotes?.trim() || undefined,
    fileName: att.fileName?.trim() || undefined,
    attachmentRecordId: att.attachmentRecordId || undefined,
  };
}
