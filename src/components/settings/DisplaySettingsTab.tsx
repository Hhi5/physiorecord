import React from 'react';
import { Languages, Moon, Palette, Sun } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { THEME_PALETTE_OPTIONS, useTheme } from '../../context/ThemeContext';
import { SpectrumColorPicker } from '../ui/SpectrumColorPicker';
import { AppearanceDisplaySettings } from './AppearanceDisplaySettings';
import { THEME_PALETTE_CKB } from './settingsI18nLabels';

export const DisplaySettingsTab: React.FC = () => {
  const { language, setLanguage, bi } = useLanguage();
  const {
    theme,
    toggleTheme,
    themePalette,
    setThemePalette,
    customPrimaryColor,
    setCustomPrimaryColor,
  } = useTheme();

  return (
    <div className="space-y-4">
      {/* Language Quick Switcher Card (Phase F1 Unified Hub) */}
      <div
        data-testid="settings-language-card"
        className="p-4 rounded-xl bg-surface border border-line-2 space-y-3"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            <Languages className="size-4 text-primary" />
            <span>
              {bi(
                'لغة واجهة النظام (عربي / کوردی / English)',
                'Interface Language (Arabic / Kurdish / English)',
                'زمانی ڕووکاری سیستەم (عەرەبی / کوردی / ئینگلیزی)'
              )}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {[
            { code: 'ar' as const, label: 'العربية (RTL)' },
            { code: 'ckb' as const, label: 'کوردی (RTL)' },
            { code: 'en' as const, label: 'English (LTR)' },
          ].map((langOpt) => {
            const active = language === langOpt.code;
            return (
              <button
                key={langOpt.code}
                type="button"
                data-testid={`settings-lang-${langOpt.code}-btn`}
                onClick={() => setLanguage(langOpt.code)}
                className={`py-2 px-3 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${
                  active
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-layer border-layer-line text-foreground hover:bg-layer-hover'
                }`}
              >
                {langOpt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Theme Mode & Color Palette */}
      <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            {theme === 'dark' ? (
              <Moon className="size-4 text-primary" />
            ) : (
              <Sun className="size-4 text-primary" />
            )}
            <span>
              {bi(
                'الوضع الليلي / النهاري ولوحة الألوان',
                'Theme Mode & Color Palette',
                'دۆخی شەو / ڕۆژ و تابلۆی ڕەنگەکان'
              )}
            </span>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="px-3 py-1.5 rounded-xl border border-layer-line bg-layer hover:bg-layer-hover text-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="size-3.5 text-amber-500" />
                <span>{bi('التبديل إلى النهاري', 'Switch to Light', 'گۆڕین بۆ دۆخی ڕۆژ')}</span>
              </>
            ) : (
              <>
                <Moon className="size-3.5 text-primary" />
                <span>{bi('التبديل إلى الليلي', 'Switch to Dark', 'گۆڕین بۆ دۆخی شەو')}</span>
              </>
            )}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {THEME_PALETTE_OPTIONS.map((pal) => {
            const active = !customPrimaryColor && themePalette === pal.id;
            return (
              <button
                key={pal.id}
                type="button"
                onClick={() => setThemePalette(pal.id)}
                className={`min-h-[40px] p-2.5 rounded-xl border text-start cursor-pointer transition-colors flex items-center gap-2 ${
                  active
                    ? 'bg-primary/10 border-primary text-primary'
                    : 'bg-card border-card-line hover:bg-layer-hover text-foreground'
                }`}
              >
                <span
                  className="w-4 h-4 rounded-full shrink-0 border border-black/15"
                  style={{ backgroundColor: pal.swatchHex }}
                />
                <span className="text-xs font-bold leading-snug">
                  {bi(pal.labelAr, pal.labelEn, THEME_PALETTE_CKB[pal.id])}
                </span>
              </button>
            );
          })}
        </div>

        {/* Custom Color Spectrum Wheel (same picker as Body Chart) */}
        <div className="p-3.5 rounded-2xl bg-card border border-line-2 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-foreground">
              <Palette className="size-4 text-primary shrink-0" />
              <span>
                {bi(
                  'تخصيص لون المنصة (عجلة الألوان)',
                  'Custom Platform Accent Color',
                  'دیاریکردنی ڕەنگی تایبەتی سەکۆ'
                )}
              </span>
            </div>
            {customPrimaryColor && (
              <span
                className="size-4 rounded-full border border-black/15 shrink-0"
                style={{ backgroundColor: customPrimaryColor }}
              />
            )}
          </div>
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
      </div>

      <AppearanceDisplaySettings />
    </div>
  );
};
