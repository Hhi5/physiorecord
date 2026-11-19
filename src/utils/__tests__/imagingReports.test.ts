import { describe, expect, it } from 'vitest';
import {
  ATTACHMENT_CATEGORY_OPTIONS,
  buildAttachmentsFromDrafts,
  createBlankReportDraft,
  getAttachmentCategoryDisplayLabel,
  normalizeLegacyAttachment,
  validateReportDraftQueue,
} from '../imagingReports';

describe('Imaging & Clinical Document Reports Helpers', () => {
  it('exposes the manual "other" category option alongside imaging, referral, lab, and consent', () => {
    const values = ATTACHMENT_CATEGORY_OPTIONS.map((o) => o.value);
    expect(values).toContain('imaging_mri_xray');
    expect(values).toContain('referral');
    expect(values).toContain('lab_report');
    expect(values).toContain('consent');
    expect(values).toContain('other');
  });

  it('returns explicit validation feedback (never silently passes) on missing title or empty "other" label', () => {
    const blank = createBlankReportDraft('2026-11-13');
    const missingTitle = validateReportDraftQueue([blank]);
    expect(missingTitle.valid).toBe(false);
    expect(missingTitle.firstInvalidDraftId).toBe(blank.draftId);
    expect(missingTitle.reasonAr).toBeTruthy();
    expect(missingTitle.reasonEn).toBeTruthy();

    const missingOtherLabel = validateReportDraftQueue([
      {
        ...blank,
        category: 'other',
        title: 'Nerve Conduction Study',
        customCategoryLabel: '   ',
      },
    ]);
    expect(missingOtherLabel.valid).toBe(false);
    expect(missingOtherLabel.reasonAr).toContain('أخرى');
  });

  it('builds multi-report queues cleanly and preserves manual "other" labels', () => {
    const row1 = {
      ...createBlankReportDraft('2026-11-10'),
      category: 'imaging_mri_xray' as const,
      title: 'Lumbar Spine MRI',
      bodyRegion: 'L4-L5',
      summaryNotes: 'Mild disc bulge at L4-L5',
    };
    const row2 = {
      ...createBlankReportDraft('2026-11-12'),
      category: 'other' as const,
      customCategoryLabel: 'تخطيط أعصاب EMG',
      title: 'Lower Limb EMG',
      summaryNotes: 'Normal nerve conduction velocity',
    };

    const validation = validateReportDraftQueue([row1, row2]);
    expect(validation.valid).toBe(true);

    const built = buildAttachmentsFromDrafts([row1, row2], {
      dateAdded: '2026-11-13',
      uploadedAttachmentsByDraftId: {
        [row1.draftId]: { attachmentRecordId: 'att_1', fileName: 'mri-lumbar.jpg' },
      },
    });

    expect(built).toHaveLength(2);
    expect(built[0].attachmentRecordId).toBe('att_1');
    expect(built[0].fileName).toBe('mri-lumbar.jpg');
    expect(built[1].category).toBe('other');
    expect(built[1].customCategoryLabel).toBe('تخطيط أعصاب EMG');
    expect(getAttachmentCategoryDisplayLabel(built[1], 'ar')).toBe('تخطيط أعصاب EMG');

    const normalized = normalizeLegacyAttachment({
      id: 'old_1',
      title: 'Legacy X-Ray',
      category: 'imaging_mri_xray',
      dateAdded: '2025-05-01',
    });
    expect(normalized.id).toBe('old_1');
    expect(getAttachmentCategoryDisplayLabel(normalized, 'en')).toBe(
      'Imaging (MRI / X-Ray / US)'
    );
  });
});
