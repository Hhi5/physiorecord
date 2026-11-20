import React, { useState } from 'react';
import { ChevronDown, Languages, Moon, Palette, Sun } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { THEME_PALETTE_OPTIONS, useTheme } from '../../context/ThemeContext';
import type { SettingsViewMode } from '../../types/clinicManagement';
import { SpectrumColorPicker } from '../ui/SpectrumColorPicker';
import { AppearanceDisplaySettings } from './AppearanceDisplaySettings';
import { THEME_PALETTE_CKB } from './settingsI18nLabels';

interface DisplaySettingsTabProps {
  settingsViewMode?: SettingsViewMode;
}

export const DisplaySettingsTab: React.FC<DisplaySettingsTabProps> = ({
  settingsViewMode = 'advanced',
}) => {
  const { language, setLanguage, bi } = useLanguage();
  const {
    theme,
    toggleTheme,
    themePalette,
    setThemePalette,
    customPrimaryColor,
    setCustomPrimaryColor,
    displayPrefs,
    updateDisplayPrefs,
  } = useTheme();

  const [showCustomColor, setShowCustomColor] = useState<boolean>(Boolean(customPrimaryColor));

  return (
    <div className="space-y-3.5">
      {/* 1. Core Everyday Controls: Language + Theme Mode + Palette + Base Font Scale */}
      <section
        data-testid="settings-language-card"
        className="p-4 sm:p-5 rounded-2xl bg-card border border-card-line space-y-4"
      >
        {/* Interface Language */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Languages className="size-4 text-primary" />
            <span>{bi('لغة الواجهة', 'Interface Language', 'زمانی ڕووکار')}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { code: 'ar' as const, label: 'العربية' },
              { code: 'ckb' as const, label: 'کوردی' },
              { code: 'en' as const, label: 'English' },
            ].map((langOpt) => {
              const active = language === langOpt.code;
              return (
                <button
                  key={langOpt.code}
                  type="button"
                  data-testid={`settings-lang-${langOpt.code}-btn`}
                  onClick={() => setLanguage(langOpt.code)}
                  className={`min-h-[38px] py-2 px-3 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${
                    active
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-surface border-line-2 text-foreground hover:bg-layer-hover'
                  }`}
                >
                  {langOpt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Light / Dark Mode & Accent Palette */}
        <div className="pt-3.5 border-t border-card-divider space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              {theme === 'dark' ? (
                <Moon className="size-4 text-primary" />
              ) : (
                <Sun className="size-4 text-primary" />
              )}
              <span>{bi('المظهر واللون الأساسي', 'Appearance & Accent Color', 'شێواز و ڕەنگی سەرەکی')}</span>
            </div>

            <button
              type="button"
              onClick={toggleTheme}
              className="min-h-[34px] px-3 py-1.5 rounded-xl border border-line-2 bg-surface hover:bg-layer-hover text-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="size-3.5 text-amber-500" />
                  <span>{bi('الوضع النهاري', 'Light Mode', 'دۆخی ڕۆژ')}</span>
                </>
              ) : (
                <>
                  <Moon className="size-3.5 text-primary" />
                  <span>{bi('الوضع الليلي', 'Dark Mode', 'دۆخی شەو')}</span>
                </>
              )}
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {THEME_PALETTE_OPTIONS.map((pal) => {
              const active = !customPrimaryColor && themePalette === pal.id;
              return (
                <button
                  key={pal.id}
                  type="button"
                  onClick={() => setThemePalette(pal.id)}
                  className={`min-h-[38px] px-2.5 py-2 rounded-xl border text-start cursor-pointer transition-colors flex items-center gap-2 ${
                    active
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'bg-surface border-line-2 hover:bg-layer-hover text-foreground'
                  }`}
                >
                  <span
                    className="size-4 rounded-full shrink-0 border border-black/15"
                    style={{ backgroundColor: pal.swatchHex }}
                  />
                  <span className="text-xs font-bold leading-snug truncate">
                    {bi(pal.labelAr, pal.labelEn, THEME_PALETTE_CKB[pal.id])}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Progressive Disclosure: Custom Spectrum Color Picker */}
          <div className="pt-0.5">
            <button
              type="button"
              aria-expanded={showCustomColor}
              onClick={() => setShowCustomColor((v) => !v)}
              className="text-xs font-bold text-muted-foreground-1 hover:text-foreground inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Palette className="size-3.5 text-primary" />
              <span>{bi('اختيار لون مخصص آخر', 'Pick a custom accent color', 'هەڵبژاردنی ڕەنگێکی تایبەت')}</span>
              {customPrimaryColor && (
                <span
                  className="size-3.5 rounded-full border border-black/15 shrink-0"
                  style={{ backgroundColor: customPrimaryColor }}
                />
              )}
              <ChevronDown
                className={`size-3.5 transition-transform ${showCustomColor ? 'rotate-180' : ''}`}
              />
            </button>

            {showCustomColor && (
              <div className="mt-2.5 p-3.5 rounded-xl bg-surface border border-line-2">
                <SpectrumColorPicker
                  compact
                  label={bi('اختر أي لون', 'Pick any color', 'هەر ڕەنگێک هەڵبژێرە')}
                  value={customPrimaryColor}
                  defaultColor={
                    THEME_PALETTE_OPTIONS.find((p) => p.id === themePalette)?.swatchHex || '#0D9488'
                  }
                  onChange={(hex) => setCustomPrimaryColor(hex)}
                  onReset={() => setCustomPrimaryColor('')}
                />
              </div>
            )}
          </div>
        </div>

        {/* Everyday Base Font Size Slider */}
        <div className="pt-3.5 border-t border-card-divider space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-foreground">
              {bi('حجم الخط الأساسي', 'Base Font Size', 'قەبارەی سەرەکی فۆنت')}
            </span>
            <span dir="ltr" className="text-xs font-mono font-bold text-primary tabular-nums">
              {displayPrefs.fontScalePercent}%
            </span>
          </div>
          <input
            type="range"
            min={87.5}
            max={150}
            step={2.5}
            value={displayPrefs.fontScalePercent}
            onChange={(e) => updateDisplayPrefs({ fontScalePercent: Number(e.target.value) })}
            aria-label={bi('حجم الخط الأساسي', 'Base font size', 'قەبارەی سەرەکی فۆنت')}
            className="w-full accent-primary cursor-pointer"
          />
          <div className="flex flex-wrap gap-1.5">
            {([87.5, 100, 115, 130, 150] as const).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => updateDisplayPrefs({ fontScalePercent: preset })}
                className={`min-h-[34px] px-2.5 py-1 rounded-xl border text-xs font-bold cursor-pointer tabular-nums transition-colors ${
                  displayPrefs.fontScalePercent === preset
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-surface border-line-2 text-foreground hover:bg-layer-hover'
                }`}
              >
                <span dir="ltr">{preset}%</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 2. Collapsible Typography, Layout & Accessibility/Performance Sections */}
      <AppearanceDisplaySettings settingsViewMode={settingsViewMode} />
    </div>
  );
};
