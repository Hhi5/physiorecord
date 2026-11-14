// =======================================================================
// PhysioRecord — Language & Internationalization Context (5.8)
// JSON locale catalogs (`src/i18n/locales/*.json`) + Intl formatting.
// Supports Arabic (RTL primary), English (LTR), and Kurdish Sorani (ckb, RTL).
// =======================================================================

import React, { createContext, useContext, useState, useEffect } from 'react';
import arLocale from '../i18n/locales/ar.json';
import enLocale from '../i18n/locales/en.json';
import ckbLocale from '../i18n/locales/ckb.json';
import { translateToKurdish } from '../i18n/ckbDictionary';

export type SupportedLanguage = 'ar' | 'en' | 'ckb';

export const LANGUAGE_ORDER: SupportedLanguage[] = ['ar', 'ckb', 'en'];

export const LANGUAGE_SWITCHER_OPTIONS: ReadonlyArray<{
  code: SupportedLanguage;
  shortLabel: string;
  label: string;
  dir: 'rtl' | 'ltr';
}> = [
  { code: 'ar', shortLabel: 'عربي', label: 'العربية (العراق)', dir: 'rtl' },
  { code: 'ckb', shortLabel: 'کوردی', label: 'کوردی سۆرانی', dir: 'rtl' },
  { code: 'en', shortLabel: 'EN', label: 'English', dir: 'ltr' },
];

export function getNextLanguage(current: SupportedLanguage): SupportedLanguage {
  const idx = LANGUAGE_ORDER.indexOf(current);
  if (idx === -1) return 'ar';
  return LANGUAGE_ORDER[(idx + 1) % LANGUAGE_ORDER.length];
}

export function resolveBiText(
  language: SupportedLanguage,
  arText: string,
  enText: string,
  ckbText?: string
): string {
  if (language === 'en') return enText;
  if (language === 'ckb') {
    if (ckbText && ckbText.trim().length > 0) return ckbText;
    return translateToKurdish(arText) || arText;
  }
  return arText;
}

export const LOCALE_CATALOGS: Record<SupportedLanguage, Record<string, string>> = {
  ar: arLocale,
  en: enLocale,
  ckb: ckbLocale,
};

export const LANGUAGE_METADATA: Record<
  SupportedLanguage,
  { code: SupportedLanguage; nativeLabel: string; dir: 'rtl' | 'ltr'; isStarter?: boolean }
> = {
  ar: { code: 'ar', nativeLabel: 'العربية (العراق)', dir: 'rtl' },
  en: { code: 'en', nativeLabel: 'English', dir: 'ltr' },
  ckb: { code: 'ckb', nativeLabel: 'کوردی (سۆرانی — تجريبي)', dir: 'rtl', isStarter: true },
};

interface LanguageContextType {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  toggleLanguage: () => void;
  isRtl: boolean;
  t: (key: string) => string;
  bi: (arText: string, enText: string, ckbText?: string) => string;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<SupportedLanguage>(() => {
    try {
      const saved = localStorage.getItem('physiorecord_language');
      if (saved === 'en' || saved === 'ar' || saved === 'ckb') return saved;
    } catch {
      // Ignore
    }
    return 'ar';
  });

  const isRtl = language === 'ar' || language === 'ckb';

  const setLanguage = (lang: SupportedLanguage) => {
    setLanguageState(lang);
    try {
      localStorage.setItem('physiorecord_language', lang);
    } catch {
      // Ignore
    }
  };

  const toggleLanguage = () => {
    setLanguage(getNextLanguage(language));
  };

  useEffect(() => {
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language, isRtl]);

  const t = (key: string): string => {
    const activeCatalog = LOCALE_CATALOGS[language];
    return activeCatalog[key] || LOCALE_CATALOGS.ar[key] || LOCALE_CATALOGS.en[key] || key;
  };

  const bi = (arText: string, enText: string, ckbText?: string): string => {
    return resolveBiText(language, arText, enText, ckbText);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, isRtl, t, bi }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
