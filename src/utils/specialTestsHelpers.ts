// =======================================================================
// PhysioRecord — Pure Helpers for Orthopedic Special Tests Custom Entry
// Extracted cleanly so unit tests can verify validation & build logic.
// =======================================================================

import type { OrthopedicSpecialTestItem, SpecialTestOutcome } from '../types/clinicalWidgets';
import { resolveSpecialTestCanonical } from '../data/clinicalToolkit/canonicalKeysCatalog';

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
