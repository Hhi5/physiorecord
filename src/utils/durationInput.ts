// =======================================================================
// PhysioRecord — Pure Duration Input Draft Helpers
// Allows clinicians to freely erase & type session duration without
// premature clamping on every keystroke; validates/clamps on blur/submit.
// =======================================================================

export const DEFAULT_DURATION_MIN = 5;
export const DEFAULT_DURATION_MAX = 240;
export const DEFAULT_DURATION_FALLBACK = 45;

/**
 * Sanitizes raw user typing into digits only (allowing empty string while clearing).
 */
export function sanitizeDurationDraft(raw: string, maxDigits = 3): string {
  const normalizedDigits = raw
    // Convert Arabic-Indic / Extended Arabic-Indic numerals if user types on Arabic/Kurdish keyboard
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[^\d]/g, '');
  return normalizedDigits.slice(0, maxDigits);
}

/**
 * Parses and clamps a draft string on blur or form submission.
 */
export function commitDurationDraft(
  draft: string,
  options?: { min?: number; max?: number; fallback?: number }
): number {
  const min = options?.min ?? DEFAULT_DURATION_MIN;
  const max = options?.max ?? DEFAULT_DURATION_MAX;
  const fallback = options?.fallback ?? DEFAULT_DURATION_FALLBACK;
  const clean = sanitizeDurationDraft(draft, 4);
  if (!clean) return fallback;
  const parsed = Number.parseInt(clean, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}
