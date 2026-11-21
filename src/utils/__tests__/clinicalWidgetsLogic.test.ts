import { describe, expect, it } from 'vitest';
import {
  PAIN_MARKER_COLOR_SWATCHES,
  PAIN_TYPE_SUGGESTIONS,
  normalizeMarkerHexColor,
  resolveMarkerDisplayMeta,
  sanitizePainTypeCustom,
  buildCustomSpecialTestItem,
  validateCustomSpecialTestDraft,
  findRomEntryIndex,
  getRomEntryAngle,
  upsertRomEntry,
} from '../clinicalWidgetHelpers';
import {
  ATTACHMENT_CATEGORY_OPTIONS,
  buildAttachmentsFromDrafts,
  createBlankReportDraft,
  getAttachmentCategoryDisplayLabel,
  normalizeLegacyAttachment,
  validateReportDraftQueue,
} from '../imagingReports';
import type { BodyChartMarker, RomMeasurementEntry } from '../../types/clinical';

describe('Clinical Widgets Logic — Body Chart Custom Pain & Special Tests', () => {
  it('validates and sanitizes manual pain type and optional hex colors cleanly', () => {
    expect(PAIN_MARKER_COLOR_SWATCHES.length).toBeGreaterThanOrEqual(8);
    expect(PAIN_TYPE_SUGGESTIONS.length).toBeGreaterThanOrEqual(4);

    expect(normalizeMarkerHexColor('#abc')).toBe('#AABBCC');
    expect(normalizeMarkerHexColor('#0d9488')).toBe('#0D9488');
    expect(normalizeMarkerHexColor('javascript:alert(1)')).toBeUndefined();
    expect(normalizeMarkerHexColor('#zzzzzz')).toBeUndefined();

    expect(sanitizePainTypeCustom('   ألم   موضعي   نابض   ')).toBe('ألم موضعي نابض');
    expect(sanitizePainTypeCustom('   ')).toBeUndefined();

    const baseMarker: BodyChartMarker = {
      markerId: 'm1',
      symptomType: 'pain_sharp',
      painTypeCustom: 'تشنج عضلي ليلي',
      colorHex: '#0ea5e9',
      view: 'posterior',
      xPercent: 50,
      yPercent: 50,
      anatomicalRegionCode: 'low_back_lumbar',
      createdAt: '2026-11-13T10:00:00.000Z',
    };

    const customMeta = resolveMarkerDisplayMeta(baseMarker, 'ar');
    expect(customMeta).toEqual({
      label: 'تشنج عضلي ليلي',
      colorHex: '#0EA5E9',
      symbolLabel: '✎',
      isCustomLabel: true,
      isCustomColor: true,
    });

    const fallbackMeta = resolveMarkerDisplayMeta(
      { ...baseMarker, painTypeCustom: undefined, colorHex: 'invalid' },
      'en'
    );
    expect(fallbackMeta.label).toBe('Sharp / Lancinating Pain');
    expect(fallbackMeta.colorHex).toBe('#EF4444');
    expect(fallbackMeta.isCustomLabel).toBe(false);
    expect(fallbackMeta.isCustomColor).toBe(false);
  });

  it('validates and builds custom orthopedic special tests across all 9 joint regions', () => {
    expect(validateCustomSpecialTestDraft({ name: '   ' }).valid).toBe(false);
    expect(validateCustomSpecialTestDraft({ name: 'FADIR Test' }).valid).toBe(true);

    const built = buildCustomSpecialTestItem(
      {
        name: 'Kemp Test',
        joint: 'lumbar',
        targetStructure: 'Facet joints / nerve root',
        outcome: 'positive',
        side: 'right',
      },
      'en'
    );

    expect(built.id).toMatch(/^st_custom_/);
    expect(built.joint).toBe('lumbar');
    expect(built.nameAr).toBe('Kemp Test');
    expect(built.nameEn).toBe('Kemp Test');
    expect(built.targetPathologyEn).toBe('Facet joints / nerve root');
    expect(built.outcome).toBe('positive');
    expect(built.notes).toContain('right');
  });

  it('keeps AROM, PROM, and AAROM ROM measurements independent for the same joint, movement, and side', () => {
    let entries: RomMeasurementEntry[] = [];

    entries = upsertRomEntry(entries, {
      jointId: 'knee',
      jointNameAr: 'الركبة',
      jointNameEn: 'Knee',
      movementId: 'flexion',
      movementNameAr: 'ثني',
      movementNameEn: 'Flexion',
      laterality: 'right',
      movementType: 'AROM',
      angle: 110,
    });

    entries = upsertRomEntry(entries, {
      jointId: 'knee',
      jointNameAr: 'الركبة',
      jointNameEn: 'Knee',
      movementId: 'flexion',
      movementNameAr: 'ثني',
      movementNameEn: 'Flexion',
      laterality: 'right',
      movementType: 'PROM',
      angle: 125,
    });

    entries = upsertRomEntry(entries, {
      jointId: 'knee',
      jointNameAr: 'الركبة',
      jointNameEn: 'Knee',
      movementId: 'flexion',
      movementNameAr: 'ثني',
      movementNameEn: 'Flexion',
      laterality: 'right',
      movementType: 'AAROM',
      angle: 118,
    });

    expect(entries).toHaveLength(3);
    expect(findRomEntryIndex(entries, 'knee', 'flexion', 'right', 'AROM')).toBe(0);
    expect(findRomEntryIndex(entries, 'knee', 'flexion', 'right', 'PROM')).toBe(1);
    expect(findRomEntryIndex(entries, 'knee', 'flexion', 'right', 'AAROM')).toBe(2);
    expect(getRomEntryAngle(entries, 'knee', 'flexion', 'right', 'AROM')).toBe(110);
    expect(getRomEntryAngle(entries, 'knee', 'flexion', 'right', 'PROM')).toBe(125);
    expect(getRomEntryAngle(entries, 'knee', 'flexion', 'right', 'AAROM')).toBe(118);

    // Updating PROM does not overwrite AROM or AAROM
    entries = upsertRomEntry(entries, {
      jointId: 'knee',
      jointNameAr: 'الركبة',
      jointNameEn: 'Knee',
      movementId: 'flexion',
      movementNameAr: 'ثني',
      movementNameEn: 'Flexion',
      laterality: 'right',
      movementType: 'PROM',
      angle: 130,
    });
    expect(entries).toHaveLength(3);
    expect(getRomEntryAngle(entries, 'knee', 'flexion', 'right', 'AROM')).toBe(110);
    expect(getRomEntryAngle(entries, 'knee', 'flexion', 'right', 'PROM')).toBe(130);
    expect(getRomEntryAngle(entries, 'knee', 'flexion', 'right', 'AAROM')).toBe(118);

    // Clearing AAROM (angle === null) removes only AAROM
    entries = upsertRomEntry(entries, {
      jointId: 'knee',
      jointNameAr: 'الركبة',
      jointNameEn: 'Knee',
      movementId: 'flexion',
      movementNameAr: 'ثني',
      movementNameEn: 'Flexion',
      laterality: 'right',
      movementType: 'AAROM',
      angle: null,
    });
    expect(entries).toHaveLength(2);
    expect(getRomEntryAngle(entries, 'knee', 'flexion', 'right', 'AAROM')).toBeNull();
    expect(getRomEntryAngle(entries, 'knee', 'flexion', 'right', 'AROM')).toBe(110);
    expect(getRomEntryAngle(entries, 'knee', 'flexion', 'right', 'PROM')).toBe(130);
  });
});

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
