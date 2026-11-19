// =======================================================================
// PhysioRecord — Body Chart Marker Helpers (Pain Type & Color Sanitization)
// Supports optional clinician-defined manual pain labels & hex colors
// while keeping shape/text cues for WCAG color-independent legibility.
// =======================================================================

import { BODY_SYMPTOM_TYPES, type BodyChartMarker } from '../types/clinical';

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
