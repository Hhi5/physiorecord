// =======================================================================
// PhysioRecord — Accessible 3-Way Language Switcher (AR / کوردی / EN)
// =======================================================================

import React from 'react';
import { Globe } from 'lucide-react';
import {
  LANGUAGE_SWITCHER_OPTIONS,
  useLanguage,
  type SupportedLanguage,
} from '../../context/LanguageContext';

interface LanguageSwitcherProps {
  compact?: boolean;
  className?: string;
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({
  compact = false,
  className = '',
}) => {
  const { language, setLanguage, bi } = useLanguage();

  const handleSelect = (code: SupportedLanguage) => {
    setLanguage(code);
  };

  return (
    <div
      role="group"
      aria-label={bi('لغة الواجهة والاتجاه (RTL / LTR)', 'Interface Language')}
      className={`inline-flex items-center gap-1 p-1 rounded-xl bg-layer border border-layer-line ${className}`}
    >
      {!compact && <Globe className="w-3.5 h-3.5 text-primary ms-1.5 me-0.5 shrink-0" />}
      {LANGUAGE_SWITCHER_OPTIONS.map((opt) => {
        const active = language === opt.code;
        return (
          <button
            key={opt.code}
            type="button"
            onClick={() => handleSelect(opt.code)}
            aria-pressed={active}
            title={opt.label}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              active
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'text-muted-foreground-1 hover:text-foreground hover:bg-surface'
            }`}
          >
            {compact ? opt.shortLabel : opt.label}
          </button>
        );
      })}
    </div>
  );
};
