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
const LEGACY_THEME_STORAGE_KEY = 'physiorecord_preline_theme';
const FONT_SCALE_STORAGE_KEY = 'physiorecord_font_scale';
const REDUCE_MOTION_STORAGE_KEY = 'physiorecord_reduce_motion';

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
    } catch {
      // ignore storage errors
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
    } catch {
      // ignore storage errors
    }
    return 'theme-clinical-default';
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
    } catch {
      // ignore storage errors
    }
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', themePalette);
    try {
      localStorage.setItem(THEME_PALETTE_STORAGE_KEY, themePalette);
      localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
  }, [themePalette]);

  const toggleTheme = () => {
    setThemeState((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
  };

  const setThemePalette = (themeId: ThemePaletteId) => {
    setThemePaletteState(themeId);
  };

  const [fontScale, setFontScaleState] = useState<FontScaleOption>(() => {
    try {
      const saved = localStorage.getItem(FONT_SCALE_STORAGE_KEY);
      if (saved === '115' || saved === '130') return Number(saved) as FontScaleOption;
    } catch {
      // Ignore
    }
    return 100;
  });

  const [reduceMotion, setReduceMotionState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(REDUCE_MOTION_STORAGE_KEY);
      if (saved === 'true') return true;
      if (saved === 'false') return false;
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return true;
    } catch {
      // Ignore
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
    } catch {
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
    } catch {
      // Ignore
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
    } catch {
      // Ignore
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
    const found = await queryInstalledDeviceFonts();
    setSystemFontFamilies(found);
    return found;
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        toggleTheme,
        setTheme,
        themePalette,
        setThemePalette,
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
