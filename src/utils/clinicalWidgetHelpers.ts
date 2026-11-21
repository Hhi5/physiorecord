// =======================================================================
// PhysioRecord — Pure Clinical Exam Widget Helpers
// Consolidated helpers for Body Chart markers, Orthopedic Special Tests,
// and ROM (AROM / PROM / AAROM) measurement entries.
// =======================================================================

import {
  BODY_SYMPTOM_TYPES,
  type BodyChartMarker,
  type BodyLaterality,
  type RomMeasurementEntry,
  type RomMovementType,
} from '../types/clinical';
import type {
  OrthopedicSpecialTestItem,
  SpecialTestOutcome,
} from '../types/clinicalWidgets';
import {
  buildRomCanonicalKey,
  resolveSpecialTestCanonical,
} from '../data/clinicalToolkit/canonicalKeysCatalog';

// -----------------------------------------------------------------------
// 1. Body Chart Marker Helpers (Pain Type & Color Sanitization)
// -----------------------------------------------------------------------

export const PAIN_MARKER_COLOR_SWATCHES = [
  '#EF4444', // Red
  '#DC2626', // Crimson
  '#F97316', // Orange
  '#F59E0B', // Amber
  '#10B981', // Emerald
  '#0EA5E9', // Sky Blue
  '#3B82F6', // Royal Blue
  '#8B5CF6', // Violet
  '#EC4899', // Magenta
  '#334155', // Slate
] as const;

export const PAIN_TYPE_SUGGESTIONS: ReadonlyArray<{
  ar: string;
  en: string;
  ckb: string;
}> = [
  { ar: 'ألم نابض', en: 'Throbbing Pain', ckb: 'ئازاری لێداندار' },
  { ar: 'تشنج عضلي عميق', en: 'Deep Muscle Spasm', ckb: 'گرژبوونی قووڵی ماسولکە' },
  { ar: 'ألم ممتد عصبياً', en: 'Radicular / Shooting', ckb: 'ئازاری دەماری درێژبووەوە' },
  { ar: 'ألم ضاغط وثقل', en: 'Pressure / Heaviness', ckb: 'ئازاری فشار و قورسایی' },
  { ar: 'طقطقة / احتكاك مفصلي', en: 'Mechanical Crepitus', ckb: 'تەقەتەق و لێکخشاندنی جومگە' },
  { ar: 'ألم ليلي مستمر', en: 'Nocturnal / Constant Ache', ckb: 'ئازاری بەردەوامی شەوانە' },
];

/**
 * Validates and normalizes a CSS 3-digit or 6-digit hex color to #RRGGBB.
 * Returns undefined for invalid values.
 */
export function normalizeMarkerHexColor(raw?: string | null): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  if (/^#[0-9A-Fa-f]{3}$/.test(trimmed)) {
    const [, r, g, b] = trimmed.split('');
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return undefined;
}

export function sanitizePainTypeCustom(raw?: string | null): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  if (!cleaned) return undefined;
  return cleaned.slice(0, 80);
}

export interface MarkerDisplayMeta {
  label: string;
  colorHex: string;
  symbolLabel: string;
  isCustomLabel: boolean;
  isCustomColor: boolean;
}

export function resolveMarkerDisplayMeta(
  marker: BodyChartMarker,
  lang: 'ar' | 'en' | 'ckb' = 'ar'
): MarkerDisplayMeta {
  const cfg = BODY_SYMPTOM_TYPES[marker.symptomType] || BODY_SYMPTOM_TYPES.pain_sharp;
  const customLabel = sanitizePainTypeCustom(marker.painTypeCustom);
  const customHex = normalizeMarkerHexColor(marker.colorHex);

  return {
    label: customLabel || (lang === 'en' ? cfg.en : cfg.ar),
    colorHex: customHex || cfg.colorHex,
    symbolLabel: customLabel ? '✎' : cfg.symbolLabel,
    isCustomLabel: Boolean(customLabel),
    isCustomColor: Boolean(customHex),
  };
}

// -----------------------------------------------------------------------
// 2. Orthopedic Special Tests Custom Entry Helpers
// -----------------------------------------------------------------------

export type OrthopedicJointRegion = OrthopedicSpecialTestItem['joint'];
export type SpecialTestSide = 'right' | 'left' | 'bilateral' | 'midline';

export interface CustomSpecialTestDraft {
  name: string;
  joint: OrthopedicJointRegion;
  targetStructure?: string;
  outcome: SpecialTestOutcome;
  side?: SpecialTestSide;
}

export function validateCustomSpecialTestDraft(
  draft: Partial<CustomSpecialTestDraft>
): { valid: boolean; reasonAr?: string; reasonEn?: string } {
  const name = draft.name?.trim() || '';
  if (!name) {
    return {
      valid: false,
      reasonAr: 'يرجى كتابة اسم الاختبار العظمي قبل الإضافة.',
      reasonEn: 'Please enter the orthopedic test name before adding.',
    };
  }
  return { valid: true };
}

export function buildCustomSpecialTestItem(
  draft: CustomSpecialTestDraft,
  lang: 'ar' | 'en' | 'ckb' = 'ar'
): OrthopedicSpecialTestItem {
  const cleanName = draft.name.trim();
  const cleanTarget = draft.targetStructure?.trim();
  const sideLabelAr =
    draft.side === 'right'
      ? 'الجانب الأيمن'
      : draft.side === 'left'
      ? 'الجانب الأيسر'
      : draft.side === 'bilateral'
      ? 'ثنائي الجانب'
      : draft.side === 'midline'
      ? 'منتصف الخط'
      : '';
  const sideLabelEn = draft.side ? `Side: ${draft.side}` : '';

  const baseDraft: OrthopedicSpecialTestItem = {
    id: `st_custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    joint: draft.joint,
    nameAr: cleanName,
    nameEn: cleanName,
    targetPathologyAr:
      cleanTarget || (lang === 'en' ? 'Custom clinical test' : 'اختبار سريري مخصص'),
    targetPathologyEn: cleanTarget || 'Custom clinical test',
    outcome: draft.outcome,
    notes:
      lang === 'en'
        ? sideLabelEn || undefined
        : sideLabelAr || undefined,
  };

  const resolved = resolveSpecialTestCanonical(baseDraft);
  return {
    ...baseDraft,
    canonicalKey: resolved.canonicalKey,
    label: resolved.label,
  };
}

// -----------------------------------------------------------------------
// 3. Pure ROM Measurement Entry Helpers (AROM / PROM / AAROM)
// -----------------------------------------------------------------------

export interface UpsertRomEntryParams {
  jointId: string;
  jointNameAr: string;
  jointNameEn: string;
  movementId: string;
  movementNameAr: string;
  movementNameEn: string;
  laterality: BodyLaterality;
  movementType: RomMovementType;
  angle: number | null;
}

/** Find an existing ROM entry matching joint, movement, laterality, and movementType. */
export function findRomEntryIndex(
  entries: RomMeasurementEntry[],
  jointId: string,
  movementId: string,
  laterality: BodyLaterality,
  movementType: RomMovementType
): number {
  return entries.findIndex(
    (e) =>
      e.jointId === jointId &&
      e.movementId === movementId &&
      e.laterality === laterality &&
      e.movementType === movementType
  );
}

/** Read the measured angle for a specific joint, movement, laterality, and movementType. */
export function getRomEntryAngle(
  entries: RomMeasurementEntry[],
  jointId: string,
  movementId: string,
  laterality: BodyLaterality,
  movementType: RomMovementType
): number | null {
  const index = findRomEntryIndex(entries, jointId, movementId, laterality, movementType);
  return index >= 0 ? (entries[index].measuredAngleDegrees ?? null) : null;
}

/** Upsert or remove a single ROM measurement entry keyed by joint, movement, side, and movementType. */
export function upsertRomEntry(
  entries: RomMeasurementEntry[],
  params: UpsertRomEntryParams
): RomMeasurementEntry[] {
  const {
    jointId,
    jointNameAr,
    jointNameEn,
    movementId,
    movementNameAr,
    movementNameEn,
    laterality,
    movementType,
    angle,
  } = params;

  const existingIndex = findRomEntryIndex(entries, jointId, movementId, laterality, movementType);
  const updatedEntries = [...entries];

  if (existingIndex >= 0) {
    if (angle === null) {
      updatedEntries.splice(existingIndex, 1);
    } else {
      const existing = updatedEntries[existingIndex];
      const label = existing.label || `${existing.jointNameEn} - ${existing.movementNameEn}`;
      updatedEntries[existingIndex] = {
        ...existing,
        canonicalKey: existing.canonicalKey || buildRomCanonicalKey(jointId, movementId, laterality),
        label,
        measuredAngleDegrees: angle,
        movementType,
        isTested: true,
      };
    }
    return updatedEntries;
  }

  if (angle !== null) {
    const newEntry: RomMeasurementEntry = {
      entryId:
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `rom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      canonicalKey: buildRomCanonicalKey(jointId, movementId, laterality),
      label: `${jointNameEn} - ${movementNameEn}`,
      jointId,
      jointNameAr,
      jointNameEn,
      movementId,
      movementNameAr,
      movementNameEn,
      movementType,
      laterality,
      isTested: true,
      measuredAngleDegrees: angle,
    };
    updatedEntries.push(newEntry);
  }

  return updatedEntries;
}
