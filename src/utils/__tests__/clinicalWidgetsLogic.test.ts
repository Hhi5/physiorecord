import { describe, expect, it } from 'vitest';
import {
  PAIN_MARKER_COLOR_SWATCHES,
  PAIN_TYPE_SUGGESTIONS,
  normalizeMarkerHexColor,
  resolveMarkerDisplayMeta,
  sanitizePainTypeCustom,
} from '../bodyChartMarkers';
import {
  buildCustomSpecialTestItem,
  validateCustomSpecialTestDraft,
} from '../specialTestsHelpers';
import {
  findRomEntryIndex,
  getRomEntryAngle,
  upsertRomEntry,
} from '../romWidgetHelpers';
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
