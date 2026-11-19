import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  DEFAULT_DISPLAY_PREFERENCES,
  DISPLAY_PREFS_STORAGE_KEY,
  applyDisplayPreferencesToDom,
  detectLowEndHardware,
  normalizeDisplayPreferences,
  queryInstalledDeviceFonts,
  resolveReducedEffectsEnabled,
  type DisplayPreferences,
} from '../utils/appearancePrefs';
import {
  deleteCustomFont,
  getCustomFontRecord,
  listCustomFonts,
  loadCustomFontIntoDocument,
  saveUploadedCustomFont,
  type CustomFontMeta,
} from '../utils/customFonts';
import { recordSafeNonFatalWarning } from '../utils/safeDevDiagnostics';

export type ThemeMode = 'light' | 'dark';
export type ThemePaletteId =
  | 'theme-clinical-default'
  | 'theme-ocean-blue'
  | 'theme-royal-indigo'
  | 'theme-emerald-care';

export interface ThemePaletteOption {
  id: ThemePaletteId;
  labelAr: string;
  labelEn: string;
  swatchHex: string;
}

export const THEME_PALETTE_OPTIONS: ThemePaletteOption[] = [
  {
    id: 'theme-clinical-default',
    labelAr: 'المظهر السريري الافتراضي',
    labelEn: 'Clinical Default',
    swatchHex: '#0d9488',
  },
  {
    id: 'theme-ocean-blue',
    labelAr: 'أزرق طبي (Ocean Blue)',
    labelEn: 'Ocean Blue',
    swatchHex: '#0284c7',
  },
  {
    id: 'theme-royal-indigo',
    labelAr: 'نيلي أكاديمي (Royal Indigo)',
    labelEn: 'Royal Indigo',
    swatchHex: '#4f46e5',
  },
  {
    id: 'theme-emerald-care',
    labelAr: 'زمردي تأهيلي (Emerald Care)',
    labelEn: 'Emerald Care',
    swatchHex: '#059669',
  },
];

export type FontScaleOption = 100 | 115 | 130;

interface ThemeContextType {
  theme: ThemeMode;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
  themePalette: ThemePaletteId;
  setThemePalette: (themeId: ThemePaletteId) => void;
  customPrimaryColor: string;
  setCustomPrimaryColor: (hex: string) => void;
  fontScale: FontScaleOption;
  setFontScale: (scale: FontScaleOption) => void;
  reduceMotion: boolean;
  setReduceMotion: (enabled: boolean) => void;
  isLowEndHardware: boolean;
  effectiveReduceMotion: boolean;
  displayPrefs: DisplayPreferences;
  updateDisplayPrefs: (patch: Partial<DisplayPreferences>) => void;
  resetDisplayPrefs: () => void;
  customFonts: CustomFontMeta[];
  uploadCustomFont: (file: File) => Promise<CustomFontMeta>;
  removeCustomFont: (id: string) => Promise<void>;
  systemFontFamilies: string[];
  scanSystemFonts: () => Promise<string[]>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'physiorecord_theme_mode';
const THEME_PALETTE_STORAGE_KEY = 'physiorecord_theme_palette';
const CUSTOM_PRIMARY_COLOR_STORAGE_KEY = 'physiorecord_custom_primary_color';
const LEGACY_THEME_STORAGE_KEY = 'physiorecord_preline_theme';
const FONT_SCALE_STORAGE_KEY = 'physiorecord_font_scale';
const REDUCE_MOTION_STORAGE_KEY = 'physiorecord_reduce_motion';

const PRIMARY_CSS_VARS = [
  '--primary-50',
  '--primary-100',
  '--primary-200',
  '--primary-300',
  '--primary-400',
  '--primary-500',
  '--primary-600',
  '--primary-700',
  '--primary-800',
  '--primary-900',
  '--primary-950',
  '--primary',
  '--primary-hover',
  '--primary-focus',
  '--primary-active',
  '--primary-checked',
  '--primary-foreground',
] as const;

function parseHexRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const raw = m[1];
  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16),
  };
}

function mixRgbToHex(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  weightB: number
): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  const r = clamp(a.r * (1 - weightB) + b.r * weightB);
  const g = clamp(a.g * (1 - weightB) + b.g * weightB);
  const bl = clamp(a.b * (1 - weightB) + b.b * weightB);
  return `#${[r, g, bl].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  const toLin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLin(rgb.r) + 0.7152 * toLin(rgb.g) + 0.0722 * toLin(rgb.b);
}

function applyCustomPrimaryCssVars(hex: string, mode: ThemeMode): void {
  const root = document.documentElement;
  const baseRgb = parseHexRgb(hex);
  if (!baseRgb) {
    for (const key of PRIMARY_CSS_VARS) {
      root.style.removeProperty(key);
    }
    return;
  }

  const white = { r: 255, g: 255, b: 255 };
  const black = { r: 0, g: 0, b: 0 };

  const shade50 = mixRgbToHex(baseRgb, white, 0.9);
  const shade100 = mixRgbToHex(baseRgb, white, 0.82);
  const shade200 = mixRgbToHex(baseRgb, white, 0.65);
  const shade300 = mixRgbToHex(baseRgb, white, 0.45);
  const shade400 = mixRgbToHex(baseRgb, white, 0.22);
  const shade500 = mixRgbToHex(baseRgb, white, 0.08);
  const shade600 = hex.toUpperCase();
  const shade700 = mixRgbToHex(baseRgb, black, 0.16);
  const shade800 = mixRgbToHex(baseRgb, black, 0.3);
  const shade900 = mixRgbToHex(baseRgb, black, 0.44);
  const shade950 = mixRgbToHex(baseRgb, black, 0.58);

  const primaryHex = mode === 'dark' ? shade500 : shade600;
  const hoverHex = mode === 'dark' ? shade400 : shade700;
  const primaryRgb = parseHexRgb(primaryHex) || baseRgb;
  const fgHex = relativeLuminance(primaryRgb) > 0.44 ? '#0F172A' : '#FFFFFF';

  root.style.setProperty('--primary-50', shade50);
  root.style.setProperty('--primary-100', shade100);
  root.style.setProperty('--primary-200', shade200);
  root.style.setProperty('--primary-300', shade300);
  root.style.setProperty('--primary-400', shade400);
  root.style.setProperty('--primary-500', shade500);
  root.style.setProperty('--primary-600', shade600);
  root.style.setProperty('--primary-700', shade700);
  root.style.setProperty('--primary-800', shade800);
  root.style.setProperty('--primary-900', shade900);
  root.style.setProperty('--primary-950', shade950);
  root.style.setProperty('--primary', primaryHex);
  root.style.setProperty('--primary-hover', hoverHex);
  root.style.setProperty('--primary-focus', hoverHex);
  root.style.setProperty('--primary-active', hoverHex);
  root.style.setProperty('--primary-checked', primaryHex);
  root.style.setProperty('--primary-foreground', fgHex);
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
      if (saved === 'dark' || saved === 'light') {
        return saved;
      }
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
    } catch (err: unknown) {
      recordSafeNonFatalWarning('theme', 'read_theme_mode', err);
    }
    return 'light';
  });

  const [themePalette, setThemePaletteState] = useState<ThemePaletteId>(() => {
    try {
      const rawSaved =
        localStorage.getItem(THEME_PALETTE_STORAGE_KEY) ||
        localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
      if (rawSaved === 'theme-clinical-teal') {
        localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
        return 'theme-clinical-default';
      }
      if (rawSaved && THEME_PALETTE_OPTIONS.some((t) => t.id === rawSaved)) {
        localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
        return rawSaved as ThemePaletteId;
      }
    } catch (err: unknown) {
      recordSafeNonFatalWarning('theme', 'read_theme_palette', err);
    }
    return 'theme-clinical-default';
  });

  const [customPrimaryColor, setCustomPrimaryColorState] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(CUSTOM_PRIMARY_COLOR_STORAGE_KEY) || '';
      return parseHexRgb(saved) ? saved.toUpperCase() : '';
    } catch (err: unknown) {
      recordSafeNonFatalWarning('theme', 'read_custom_primary_color', err);
      return '';
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (err: unknown) {
      recordSafeNonFatalWarning('theme', 'persist_theme_mode', err);
    }
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', themePalette);
    try {
      localStorage.setItem(THEME_PALETTE_STORAGE_KEY, themePalette);
      localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
    } catch (err: unknown) {
      recordSafeNonFatalWarning('theme', 'persist_theme_palette', err);
    }
  }, [themePalette]);

  useEffect(() => {
    applyCustomPrimaryCssVars(customPrimaryColor, theme);
    try {
      if (customPrimaryColor) {
        localStorage.setItem(CUSTOM_PRIMARY_COLOR_STORAGE_KEY, customPrimaryColor);
      } else {
        localStorage.removeItem(CUSTOM_PRIMARY_COLOR_STORAGE_KEY);
      }
    } catch (err: unknown) {
      recordSafeNonFatalWarning('theme', 'persist_custom_primary_color', err);
    }
  }, [customPrimaryColor, theme]);

  const toggleTheme = () => {
    setThemeState((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
  };

  const setThemePalette = (themeId: ThemePaletteId) => {
    setThemePaletteState(themeId);
    setCustomPrimaryColorState('');
  };

  const setCustomPrimaryColor = useCallback((hex: string) => {
    const clean = hex.trim().toUpperCase();
    setCustomPrimaryColorState(parseHexRgb(clean) ? clean : '');
  }, []);

  const [fontScale, setFontScaleState] = useState<FontScaleOption>(() => {
    try {
      const saved = localStorage.getItem(FONT_SCALE_STORAGE_KEY);
      if (saved === '115' || saved === '130') return Number(saved) as FontScaleOption;
    } catch (err: unknown) {
      recordSafeNonFatalWarning('theme', 'read_font_scale', err);
    }
    return 100;
  });

  const [reduceMotion, setReduceMotionState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(REDUCE_MOTION_STORAGE_KEY);
      if (saved === 'true') return true;
      if (saved === 'false') return false;
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return true;
    } catch (err: unknown) {
      recordSafeNonFatalWarning('theme', 'read_reduce_motion', err);
    }
    return false;
  });

  const [displayPrefs, setDisplayPrefsState] = useState<DisplayPreferences>(() => {
    try {
      const legacyScaleRaw = localStorage.getItem(FONT_SCALE_STORAGE_KEY);
      const legacyScale =
        legacyScaleRaw === '115' || legacyScaleRaw === '130' ? legacyScaleRaw : '100';
      const rawPrefs = localStorage.getItem(DISPLAY_PREFS_STORAGE_KEY);
      if (rawPrefs) {
        return normalizeDisplayPreferences(JSON.parse(rawPrefs) as Partial<DisplayPreferences>, legacyScale);
      }
      return normalizeDisplayPreferences(undefined, legacyScale);
    } catch (err: unknown) {
      recordSafeNonFatalWarning('theme', 'read_display_prefs', err);
      return DEFAULT_DISPLAY_PREFERENCES;
    }
  });

  const [customFonts, setCustomFonts] = useState<CustomFontMeta[]>([]);
  const [systemFontFamilies, setSystemFontFamilies] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    listCustomFonts().then(async (fonts) => {
      if (!active) return;
      setCustomFonts(fonts);
      if (displayPrefs.fontPreset.startsWith('custom:')) {
        const fontId = displayPrefs.fontPreset.slice('custom:'.length);
        const rec = await getCustomFontRecord(fontId);
        if (rec) {
          await loadCustomFontIntoDocument(rec);
        }
      }
    });
    // Load system fonts (gracefully handle unsupported platforms like Android WebView)
    queryInstalledDeviceFonts()
      .then((fonts) => {
        if (active) setSystemFontFamilies(fonts);
      })
      .catch(() => {
        if (active) setSystemFontFamilies([]);
      });
    return () => {
      active = false;
    };
  }, [displayPrefs.fontPreset]);

  useEffect(() => {
    const activeCustom =
      displayPrefs.fontPreset.startsWith('custom:')
        ? customFonts.find((f) => f.id === displayPrefs.fontPreset.slice('custom:'.length))
        : undefined;

    applyDisplayPreferencesToDom(displayPrefs, activeCustom?.cssFamily);
    try {
      localStorage.setItem(DISPLAY_PREFS_STORAGE_KEY, JSON.stringify(displayPrefs));
      const legacyScale: FontScaleOption =
        displayPrefs.fontScalePercent >= 125
          ? 130
          : displayPrefs.fontScalePercent >= 110
          ? 115
          : 100;
      localStorage.setItem(FONT_SCALE_STORAGE_KEY, String(legacyScale));
    } catch (err: unknown) {
      recordSafeNonFatalWarning('theme', 'persist_display_prefs', err);
    }
  }, [displayPrefs, customFonts]);

  const isLowEndHardware = useMemo(() => detectLowEndHardware(), []);
  const effectiveReduceMotion =
    reduceMotion || resolveReducedEffectsEnabled(displayPrefs.reducedEffectsMode, isLowEndHardware);

  useEffect(() => {
    const root = document.documentElement;
    if (effectiveReduceMotion) {
      root.classList.add('reduce-motion');
    } else {
      root.classList.remove('reduce-motion');
    }
    try {
      localStorage.setItem(REDUCE_MOTION_STORAGE_KEY, reduceMotion ? 'true' : 'false');
    } catch (err: unknown) {
      recordSafeNonFatalWarning('theme', 'persist_reduce_motion', err);
    }
  }, [effectiveReduceMotion, reduceMotion]);

  const setFontScale = (scale: FontScaleOption) => {
    setFontScaleState(scale);
    setDisplayPrefsState((prev) =>
      normalizeDisplayPreferences({ ...prev, fontScalePercent: scale })
    );
  };

  const setReduceMotion = (enabled: boolean) => setReduceMotionState(enabled);

  const updateDisplayPrefs = useCallback((patch: Partial<DisplayPreferences>) => {
    setDisplayPrefsState((prev) => {
      const next = normalizeDisplayPreferences({ ...prev, ...patch });
      const mappedLegacy: FontScaleOption =
        next.fontScalePercent >= 125 ? 130 : next.fontScalePercent >= 110 ? 115 : 100;
      setFontScaleState(mappedLegacy);
      return next;
    });
  }, []);

  const resetDisplayPrefs = useCallback(() => {
    setFontScaleState(100);
    setReduceMotionState(false);
    setDisplayPrefsState(DEFAULT_DISPLAY_PREFERENCES);
  }, []);

  const uploadCustomFont = useCallback(async (file: File): Promise<CustomFontMeta> => {
    const meta = await saveUploadedCustomFont(file);
    const all = await listCustomFonts();
    setCustomFonts(all);
    setDisplayPrefsState((prev) =>
      normalizeDisplayPreferences({ ...prev, fontPreset: `custom:${meta.id}` })
    );
    return meta;
  }, []);

  const removeCustomFont = useCallback(async (id: string): Promise<void> => {
    await deleteCustomFont(id);
    const all = await listCustomFonts();
    setCustomFonts(all);
    setDisplayPrefsState((prev) =>
      prev.fontPreset === `custom:${id}`
        ? normalizeDisplayPreferences({ ...prev, fontPreset: 'default' })
        : prev
    );
  }, []);

  const scanSystemFonts = useCallback(async (): Promise<string[]> => {
    try {
      const found = await queryInstalledDeviceFonts();
      setSystemFontFamilies(found);
      return found;
    } catch (err) {
      // Local Font Access API not supported on Android WebView / some browsers — fail silently
      console.warn('[ThemeContext] scanSystemFonts failed (API likely unsupported):', err);
      setSystemFontFamilies([]);
      return [];
    }
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        toggleTheme,
        setTheme,
        themePalette,
        setThemePalette,
        customPrimaryColor,
        setCustomPrimaryColor,
        fontScale,
        setFontScale,
        reduceMotion,
        setReduceMotion,
        isLowEndHardware,
        effectiveReduceMotion,
        displayPrefs,
        updateDisplayPrefs,
        resetDisplayPrefs,
        customFonts,
        uploadCustomFont,
        removeCustomFont,
        systemFontFamilies,
        scanSystemFonts,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
