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
  variant?: 'pill' | 'borderless';
  className?: string;
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({
  compact = false,
  variant = 'pill',
  className = '',
}) => {
  const { language, setLanguage, bi } = useLanguage();

  const handleSelect = (code: SupportedLanguage) => {
    setLanguage(code);
  };

  if (variant === 'borderless') {
    return (
      <div
        role="group"
        aria-label={bi('لغة الواجهة والاتجاه (RTL / LTR)', 'Interface Language')}
        className={`inline-flex items-center ${compact ? 'gap-0.5' : 'gap-1.5'} ${className}`}
      >
        {!compact && <Globe className="size-4 text-muted-foreground-1 shrink-0" aria-hidden="true" />}
        {LANGUAGE_SWITCHER_OPTIONS.map((opt, idx) => {
          const active = language === opt.code;
          return (
            <React.Fragment key={opt.code}>
              {idx > 0 && (
                <span className="text-muted-foreground-1/50 select-none text-xs" aria-hidden="true">
                  ·
                </span>
              )}
              <button
                type="button"
                onClick={() => handleSelect(opt.code)}
                aria-pressed={active}
                aria-label={opt.label}
                title={opt.label}
                className={`min-h-[36px] ${compact ? 'px-1' : 'px-1.5'} text-xs cursor-pointer transition-colors bg-transparent border-0 whitespace-nowrap ${
                  active
                    ? 'font-bold text-primary underline underline-offset-4 decoration-2'
                    : 'font-medium text-muted-foreground-1 hover:text-foreground'
                }`}
              >
                {compact ? opt.shortLabel : opt.label}
              </button>
            </React.Fragment>
          );
        })}
      </div>
    );
  }

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
