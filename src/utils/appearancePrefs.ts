// =======================================================================
// PhysioRecord — Display, Typography, Layout & Accessibility Preferences
// Preserves >= 12px floor and avoids positive letter-spacing on Arabic/Kurdish.
// =======================================================================

export type DisplayFontPresetId =
  | 'default'
  | 'naskh_ui'
  | 'kufi_modern'
  | 'amiri_serif'
  | 'mono_clinical';

export type LineHeightMode = 'compact' | 'normal' | 'relaxed';
export type LtrLetterSpacingMode = 'normal' | 'wide' | 'wider';
export type FontWeightMode = 'normal' | 'medium' | 'semibold';
export type DisplayDensityMode = 'comfortable' | 'standard' | 'compact';
export type ContentWidthMode = 'narrow' | 'standard' | 'wide' | 'full';
export type CornerRadiusMode = 'sharp' | 'standard' | 'rounded';
export type ArabicScaleMode = 1 | 1.06 | 1.12;

export type ReducedEffectsMode = 'auto' | 'on' | 'off';

export interface DisplayPreferences {
  /** 'default' | preset ID | 'system:<familyName>' | 'custom:<customFontId>' */
  fontPreset: string;
  /** 87.5 to 150 (%) */
  fontScalePercent: number;
  /** Extra size boost for Arabic / Kurdish text legibility */
  arabicScale: ArabicScaleMode;
  lineHeight: LineHeightMode;
  /** Applied exclusively to LTR / Latin text (never breaks Arabic cursive ligatures) */
  ltrLetterSpacing: LtrLetterSpacingMode;
  fontWeight: FontWeightMode;
  density: DisplayDensityMode;
  contentMaxWidth: ContentWidthMode;
  cornerRadius: CornerRadiusMode;
  highContrast: boolean;
  largeHitTargets: boolean;
  reduceTransparency: boolean;
  /** Low-end device performance mode ('auto' uses deviceMemory<=4 || hardwareConcurrency<=2) */
  reducedEffectsMode: ReducedEffectsMode;
}

export const DISPLAY_PREFS_STORAGE_KEY = 'physiorecord_display_prefs_v1';

export const DEFAULT_DISPLAY_PREFERENCES: DisplayPreferences = {
  fontPreset: 'default',
  fontScalePercent: 100,
  arabicScale: 1,
  lineHeight: 'normal',
  ltrLetterSpacing: 'normal',
  fontWeight: 'normal',
  density: 'standard',
  contentMaxWidth: 'standard',
  cornerRadius: 'standard',
  highContrast: false,
  largeHitTargets: false,
  reduceTransparency: false,
  reducedEffectsMode: 'auto',
};

export interface BuiltInFontOption {
  id: DisplayFontPresetId;
  labelAr: string;
  labelEn: string;
  labelCkb: string;
  descAr: string;
  descEn: string;
  stack: string;
}

export const BUILTIN_FONT_OPTIONS: BuiltInFontOption[] = [
  {
    id: 'default',
    labelAr: 'الافتراضي (IBM Plex + Inter)',
    labelEn: 'Default (IBM Plex + Inter)',
    labelCkb: 'بنەڕەت (IBM Plex + Inter)',
    descAr: 'خطوط مدمجة عالية الوضوح للنصوص الطبية والأرقام',
    descEn: 'Bundled offline fonts optimized for Arabic RTL and clinical numbers',
    stack: '"IBM Plex Sans Arabic", "Inter", ui-sans-serif, system-ui, sans-serif',
  },
  {
    id: 'naskh_ui',
    labelAr: 'نسخ النظام الواضح (System UI)',
    labelEn: 'Clean System UI (Segoe / Noto)',
    labelCkb: 'فۆنتی ئاسایی سیستەم (System UI)',
    descAr: 'يستخدم خط الواجهة الرسمي في ويندوز أو أندرويد أو ماك',
    descEn: 'Uses crisp OS-native Arabic/Latin UI sans-serif fonts',
    stack:
      '"Segoe UI", "Noto Sans Arabic", "Tahoma", "IBM Plex Sans Arabic", "Inter", system-ui, sans-serif',
  },
  {
    id: 'kufi_modern',
    labelAr: 'كوفي حديث هندسي (Modern Geometric)',
    labelEn: 'Modern Geometric (Dubai / Noto Kufi)',
    labelCkb: 'کۆفی مۆدێرن (Modern Geometric)',
    descAr: 'تناسق حديث للعناوين والبطاقات والجداول السريرية',
    descEn: 'Balanced geometric typography for clinical cards and tables',
    stack:
      '"Dubai", "Noto Kufi Arabic", "Geeza Pro", "IBM Plex Sans Arabic", "Inter", system-ui, sans-serif',
  },
  {
    id: 'amiri_serif',
    labelAr: 'نسخ كلاسيكي للتقارير (Classic Serif)',
    labelEn: 'Classic Report Serif (Amiri / Georgia)',
    labelCkb: 'فۆنتی کلاسیکی ڕاپۆرت (Classic Serif)',
    descAr: 'مناسب للتقارير السريرية الطويلة والقراءة المريحة',
    descEn: 'Editorial serif feel well suited for clinical summaries and reports',
    stack:
      '"Amiri", "Traditional Arabic", "Georgia", "IBM Plex Sans Arabic", serif',
  },
  {
    id: 'mono_clinical',
    labelAr: 'خط رقمي أحادي (Clinical Mono)',
    labelEn: 'Clinical Monospace (JetBrains Mono)',
    labelCkb: 'فۆنتی ژمارەیی (Clinical Mono)',
    descAr: 'إبراز واضح للأرقام الطبية والقياسات والفواتير',
    descEn: 'High separation for tabular clinical measurements and billing',
    stack: '"JetBrains Mono", "IBM Plex Sans Arabic", ui-monospace, monospace',
  },
];

export const CURATED_DEVICE_FONTS: ReadonlyArray<{
  family: string;
  labelAr: string;
  labelEn: string;
}> = [
  { family: 'Segoe UI', labelAr: 'Segoe UI (ويندوز)', labelEn: 'Segoe UI (Windows)' },
  { family: 'Tahoma', labelAr: 'Tahoma (كلاسيكي واضح)', labelEn: 'Tahoma (Crisp Classic)' },
  { family: 'Arial', labelAr: 'Arial (قياسي شامل)', labelEn: 'Arial (Universal)' },
  { family: 'Noto Sans Arabic', labelAr: 'Noto Sans Arabic', labelEn: 'Noto Sans Arabic' },
  { family: 'Noto Kufi Arabic', labelAr: 'Noto Kufi Arabic', labelEn: 'Noto Kufi Arabic' },
  { family: 'Geeza Pro', labelAr: 'Geeza Pro (ماك)', labelEn: 'Geeza Pro (macOS)' },
  { family: 'Dubai', labelAr: 'Dubai Font (إن كان مثبتاً)', labelEn: 'Dubai (If installed)' },
  { family: 'Cairo', labelAr: 'Cairo (إن كان مثبتاً)', labelEn: 'Cairo (If installed)' },
  { family: 'Tajawal', labelAr: 'Tajawal (إن كان مثبتاً)', labelEn: 'Tajawal (If installed)' },
];

export function sanitizeCssFontFamily(raw: string): string {
  const cleaned = raw.replace(/["'`;{}<>\\]/g, '').trim();
  return cleaned.slice(0, 80);
}

export function clampFontScalePercent(raw: number): number {
  if (!Number.isFinite(raw)) return 100;
  return Math.min(150, Math.max(87.5, Math.round(raw * 2) / 2));
}

export function normalizeDisplayPreferences(
  raw: Partial<DisplayPreferences> | null | undefined,
  legacyFontScale?: '100' | '115' | '130'
): DisplayPreferences {
  const base = { ...DEFAULT_DISPLAY_PREFERENCES };
  if (!raw && !legacyFontScale) return base;

  const merged = { ...base, ...(raw || {}) };

  let fontScalePercent = clampFontScalePercent(merged.fontScalePercent);
  if ((!raw || raw.fontScalePercent === undefined) && legacyFontScale) {
    const parsedLegacy = Number(legacyFontScale);
    if (parsedLegacy === 115 || parsedLegacy === 130) {
      fontScalePercent = parsedLegacy;
    }
  }

  const arabicScale: ArabicScaleMode =
    merged.arabicScale === 1.06 || merged.arabicScale === 1.12 ? merged.arabicScale : 1;

  const lineHeight: LineHeightMode =
    merged.lineHeight === 'compact' || merged.lineHeight === 'relaxed'
      ? merged.lineHeight
      : 'normal';

  const ltrLetterSpacing: LtrLetterSpacingMode =
    merged.ltrLetterSpacing === 'wide' || merged.ltrLetterSpacing === 'wider'
      ? merged.ltrLetterSpacing
      : 'normal';

  const fontWeight: FontWeightMode =
    merged.fontWeight === 'medium' || merged.fontWeight === 'semibold'
      ? merged.fontWeight
      : 'normal';

  const density: DisplayDensityMode =
    merged.density === 'comfortable' || merged.density === 'compact'
      ? merged.density
      : 'standard';

  const contentMaxWidth: ContentWidthMode =
    merged.contentMaxWidth === 'narrow' ||
    merged.contentMaxWidth === 'wide' ||
    merged.contentMaxWidth === 'full'
      ? merged.contentMaxWidth
      : 'standard';

  const cornerRadius: CornerRadiusMode =
    merged.cornerRadius === 'sharp' || merged.cornerRadius === 'rounded'
      ? merged.cornerRadius
      : 'standard';

  const fontPreset =
    typeof merged.fontPreset === 'string' && merged.fontPreset.trim()
      ? merged.fontPreset.trim()
      : 'default';

  const reducedEffectsMode: ReducedEffectsMode =
    merged.reducedEffectsMode === 'on' || merged.reducedEffectsMode === 'off'
      ? merged.reducedEffectsMode
      : 'auto';

  return {
    fontPreset,
    fontScalePercent,
    arabicScale,
    lineHeight,
    ltrLetterSpacing,
    fontWeight,
    density,
    contentMaxWidth,
    cornerRadius,
    highContrast: Boolean(merged.highContrast),
    largeHitTargets: Boolean(merged.largeHitTargets),
    reduceTransparency: Boolean(merged.reduceTransparency),
    reducedEffectsMode,
  };
}

export function detectLowEndHardware(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const mem =
    typeof nav.deviceMemory === 'number' && Number.isFinite(nav.deviceMemory)
      ? nav.deviceMemory
      : undefined;
  const cores =
    typeof nav.hardwareConcurrency === 'number' && Number.isFinite(nav.hardwareConcurrency)
      ? nav.hardwareConcurrency
      : undefined;
  if (mem !== undefined && mem <= 4) return true;
  if (cores !== undefined && cores <= 2) return true;
  return false;
}

export function resolveReducedEffectsEnabled(
  mode: ReducedEffectsMode | undefined,
  isLowEndDetected: boolean = detectLowEndHardware()
): boolean {
  if (mode === 'on') return true;
  if (mode === 'off') return false;
  return isLowEndDetected;
}

export function resolveFontStack(
  fontPreset: string,
  customFontCssFamily?: string | null
): string {
  const defaultStack = BUILTIN_FONT_OPTIONS[0].stack;

  if (fontPreset.startsWith('custom:') && customFontCssFamily) {
    const safeCustom = sanitizeCssFontFamily(customFontCssFamily);
    if (safeCustom) {
      return `"${safeCustom}", "IBM Plex Sans Arabic", "Inter", ui-sans-serif, system-ui, sans-serif`;
    }
  }

  if (fontPreset.startsWith('system:')) {
    const family = sanitizeCssFontFamily(fontPreset.slice('system:'.length));
    if (family) {
      return `"${family}", "IBM Plex Sans Arabic", "Inter", ui-sans-serif, system-ui, sans-serif`;
    }
  }

  const builtIn = BUILTIN_FONT_OPTIONS.find((opt) => opt.id === fontPreset);
  return builtIn ? builtIn.stack : defaultStack;
}

export function getDisplayCssVariables(
  prefs: DisplayPreferences,
  customFontCssFamily?: string | null
): Record<string, string> {
  const scaleRatio = prefs.fontScalePercent / 100;

  const lineHeightVal =
    prefs.lineHeight === 'compact' ? '1.42' : prefs.lineHeight === 'relaxed' ? '1.85' : '1.6';

  const ltrTrackingVal =
    prefs.ltrLetterSpacing === 'wide'
      ? '0.015em'
      : prefs.ltrLetterSpacing === 'wider'
      ? '0.03em'
      : '0em';

  const weightVal =
    prefs.fontWeight === 'medium' ? '500' : prefs.fontWeight === 'semibold' ? '600' : '400';

  const maxWidthVal =
    prefs.contentMaxWidth === 'narrow'
      ? '72rem'
      : prefs.contentMaxWidth === 'wide'
      ? '96rem'
      : prefs.contentMaxWidth === 'full'
      ? '100%'
      : '80rem';

  const radiusSmall =
    prefs.cornerRadius === 'sharp' ? '0.25rem' : prefs.cornerRadius === 'rounded' ? '0.875rem' : '0.625rem';
  const radiusLarge =
    prefs.cornerRadius === 'sharp' ? '0.5rem' : prefs.cornerRadius === 'rounded' ? '1.375rem' : '1rem';

  const densityPadScale =
    prefs.density === 'compact' ? '0.82' : prefs.density === 'comfortable' ? '1.18' : '1';

  return {
    '--app-font-sans': resolveFontStack(prefs.fontPreset, customFontCssFamily),
    '--app-scale-factor': String(scaleRatio),
    '--app-arabic-scale': String(prefs.arabicScale),
    '--app-line-height': lineHeightVal,
    '--app-ltr-letter-spacing': ltrTrackingVal,
    '--app-font-weight-body': weightVal,
    '--app-max-width': maxWidthVal,
    '--app-radius-sm': radiusSmall,
    '--app-radius-lg': radiusLarge,
    '--app-density-scale': densityPadScale,
  };
}

/**
 * Applies typography, contrast, density, and custom font variables cleanly onto documentElement.
 */
export function applyDisplayPreferencesToDom(
  prefs: DisplayPreferences,
  customFontCssFamily?: string | null
): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const vars = getDisplayCssVariables(prefs, customFontCssFamily);

  for (const [prop, value] of Object.entries(vars)) {
    root.style.setProperty(prop, value);
  }
  root.style.removeProperty('font-size');

  const reducedEffectsActive = resolveReducedEffectsEnabled(prefs.reducedEffectsMode);
  root.classList.toggle('high-contrast', prefs.highContrast);
  root.classList.toggle('large-hit-targets', prefs.largeHitTargets);
  root.classList.toggle('reduce-transparency', prefs.reduceTransparency || reducedEffectsActive);
  root.classList.toggle('low-end-device', reducedEffectsActive);

  root.classList.remove('density-comfortable', 'density-standard', 'density-compact');
  root.classList.add(`density-${prefs.density}`);

  root.classList.remove(
    'content-width-narrow',
    'content-width-standard',
    'content-width-wide',
    'content-width-full'
  );
  root.classList.add(`content-width-${prefs.contentMaxWidth}`);

  root.classList.remove('font-scale-115', 'font-scale-130');
  if (prefs.fontScalePercent >= 125) {
    root.classList.add('font-scale-130');
  } else if (prefs.fontScalePercent >= 110) {
    root.classList.add('font-scale-115');
  }
}

export function isLocalFontAccessSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return typeof (window as unknown as { queryLocalFonts?: unknown }).queryLocalFonts === 'function';
}

export async function queryInstalledDeviceFonts(): Promise<string[]> {
  if (!isLocalFontAccessSupported()) return [];
  try {
    const fn = (
      window as unknown as {
        queryLocalFonts: () => Promise<Array<{ family?: string }>>;
      }
    ).queryLocalFonts;
    const list = await fn();
    const families = new Set<string>();
    for (const item of list) {
      if (item && typeof item.family === 'string' && item.family.trim()) {
        families.add(item.family.trim());
      }
    }
    return Array.from(families).sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}
