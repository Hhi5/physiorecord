// =======================================================================
// PhysioRecord — Display, Typography & Custom Font Settings Panel
// Keeps all fonts local/offline (self-hosted, device fonts, or IndexedDB
// user uploads loaded via FontFace ArrayBuffer — zero external requests).
// =======================================================================

import React, { useEffect, useRef, useState } from 'react';
import {
  Type,
  Upload,
  Trash2,
  RotateCcw,
  Check,
  Monitor,
  Eye,
  Maximize2,
  AlertCircle,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
import { useDeviceFormFactor } from '../../hooks/useDeviceFormFactor';
import type { SettingsViewMode } from '../../types/clinicManagement';
import {
  BUILTIN_FONT_OPTIONS,
  CURATED_DEVICE_FONTS,
  isLocalFontAccessSupported,
  sanitizeCssFontFamily,
  type ArabicScaleMode,
  type ContentWidthMode,
  type CornerRadiusMode,
  type DisplayDensityMode,
  type DisplayFontPresetId,
  type FontWeightMode,
  type LineHeightMode,
  type LtrLetterSpacingMode,
  type ReducedEffectsMode,
} from '../../utils/appearancePrefs';
import { SettingsAccordion, SettingsSwitchRow } from './SettingsPrimitives';

const FONT_DESC_CKB: Record<DisplayFontPresetId, string> = {
  default: 'فۆنتی یەکخراوی ڕوون بۆ دەقی پزیشکی کوردی و عەرەبی و ژمارەکان',
  naskh_ui: 'فۆنتی فەرمی ڕووکاری سیستەم لە ویندۆز یان ئەندرۆید یان ماک بەکاردەهێنێت',
  kufi_modern: 'هاوسەنگی ئەندازەیی مۆدێرن بۆ سەردێڕ و کارت و خشتە کلینیکییەکان',
  amiri_serif: 'گونجاوە بۆ ڕاپۆرتە کلینیکییە درێژەکان و خوێندنەوەی ئارام',
  mono_clinical: 'جیاکردنەوەی ڕوون بۆ ژمارە پزیشکییەکان، پێوانەکان و پسوڵەکان',
};

const DEVICE_FONT_LABEL_CKB: Record<string, string> = {
  'Segoe UI': 'Segoe UI (ویندۆز)',
  Tahoma: 'Tahoma (کلاسیکی ڕوون)',
  Arial: 'Arial (گشتی و ستاندارد)',
  'Noto Sans Arabic': 'Noto Sans Arabic',
  'Noto Kufi Arabic': 'Noto Kufi Arabic',
  'Geeza Pro': 'Geeza Pro (ماک)',
  Dubai: 'Dubai Font (ئەگەر هەبێت)',
  Cairo: 'Cairo (ئەگەر هەبێت)',
  Tajawal: 'Tajawal (ئەگەر هەبێت)',
};

interface AppearanceDisplaySettingsProps {
  settingsViewMode?: SettingsViewMode;
}

export const AppearanceDisplaySettings: React.FC<AppearanceDisplaySettingsProps> = ({
  settingsViewMode = 'advanced',
}) => {
  const { bi } = useLanguage();
  const deviceFormFactor = useDeviceFormFactor();
  const {
    displayPrefs,
    updateDisplayPrefs,
    resetDisplayPrefs,
    customFonts,
    uploadCustomFont,
    removeCustomFont,
    reduceMotion,
    setReduceMotion,
    isLowEndHardware,
    systemFontFamilies,
    scanSystemFonts,
  } = useTheme();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fontUploadError, setFontUploadError] = useState<string | null>(null);
  const [uploadingFont, setUploadingFont] = useState(false);
  const [scanningSystemFonts, setScanningSystemFonts] = useState(false);
  const [manualSystemFontInput, setManualSystemFontInput] = useState('');
  const [accessibilityOpen, setAccessibilityOpen] = useState<boolean>(
    settingsViewMode === 'advanced'
  );

  useEffect(() => {
    setAccessibilityOpen(settingsViewMode === 'advanced');
  }, [settingsViewMode]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setFontUploadError(null);
    setUploadingFont(true);
    try {
      await uploadCustomFont(file);
    } catch (err: unknown) {
      setFontUploadError(
        err instanceof Error
          ? err.message
          : bi('تعذر تحميل ملف الخط.', 'Failed to load custom font file.', 'بارکردنی فایلی فۆنت سەرکەوتوو نەبوو.')
      );
    } finally {
      setUploadingFont(false);
    }
  };

  const handleScanSystemFonts = async () => {
    setScanningSystemFonts(true);
    try {
      await scanSystemFonts();
    } catch (err) {
      console.warn('[AppearanceDisplaySettings] scanSystemFonts failed (API likely unsupported):', err);
    } finally {
      setScanningSystemFonts(false);
    }
  };

  const handleApplyManualSystemFont = () => {
    const cleaned = sanitizeCssFontFamily(manualSystemFontInput);
    if (!cleaned) return;
    updateDisplayPrefs({ fontPreset: `system:${cleaned}` });
    setManualSystemFontInput('');
  };

  const localFontApiAvailable = isLocalFontAccessSupported();
  const activeBuiltin = BUILTIN_FONT_OPTIONS.find((f) => f.id === displayPrefs.fontPreset);
  const currentFontLabel = activeBuiltin
    ? bi(activeBuiltin.labelAr, activeBuiltin.labelEn, activeBuiltin.labelCkb)
    : displayPrefs.fontPreset.replace(/^(system:|custom:)/, '');

  return (
    <div className="space-y-3.5">
      {/* 1. Font Family & Device/Custom Fonts (Collapsible) */}
      <SettingsAccordion
        icon={<Type className="size-4" />}
        title={bi('نوع الخط وخطوط الجهاز', 'Font Family & Custom Fonts', 'جۆری فۆنت و فۆنتەکانی ئامێر')}
        meta={currentFontLabel}
      >
        <div className="flex justify-end">
          <button
            type="button"
            onClick={resetDisplayPrefs}
            className="px-2.5 py-1 rounded-lg border border-layer-line bg-layer hover:bg-layer-hover text-foreground text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="size-3.5 text-primary" />
            <span>{bi('إعادة ضبط العرض', 'Reset Display', 'گەڕاندنەوەی بنەڕەتی')}</span>
          </button>
        </div>

        {/* Built-in Offline Fonts */}
        <div className="space-y-1.5">
          <span className="text-xs font-bold text-muted-foreground-1 block">
            {bi('الخطوط المدمجة (تعمل بدون إنترنت)', 'Built-in Offline Fonts', 'فۆنتە یەکخراوەکان')}
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {BUILTIN_FONT_OPTIONS.map((opt) => {
              const active = displayPrefs.fontPreset === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => updateDisplayPrefs({ fontPreset: opt.id })}
                  className={`p-2.5 rounded-xl border text-start transition-colors cursor-pointer ${
                    active
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'bg-surface border-line-2 hover:bg-layer-hover text-foreground'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold">
                      {bi(opt.labelAr, opt.labelEn, opt.labelCkb)}
                    </span>
                    {active && <Check className="size-3.5 shrink-0" />}
                  </div>
                  <p className="text-xs text-muted-foreground-1 mt-0.5 leading-snug">
                    {bi(opt.descAr, opt.descEn, FONT_DESC_CKB[opt.id])}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Upload Custom Font */}
        <div className="p-3 rounded-xl bg-surface border border-line-2 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-bold text-foreground">
                {bi('رفع خط مخصص من جهازك', 'Upload Custom Font from Device', 'بارکردنی فۆنتی تایبەت')}
              </div>
              <p className="text-xs text-muted-foreground-1 mt-0.5">
                {bi(
                  'صيغ .woff2 / .woff / .ttf / .otf (حتى 5 MB) — يُحفظ محلياً فقط.',
                  'Supports .woff2 / .woff / .ttf / .otf (max 5 MB), stored locally.',
                  'فۆرماتەکانی .woff2 / .woff / .ttf / .otf (زۆرترین 5 MB).'
                )}
              </p>
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf"
                onChange={handleFileChange}
                className="hidden"
                aria-label={bi('رفع ملف خط من الجهاز', 'Upload custom font file', 'بارکردنی فایلی فۆنت')}
              />
              <button
                type="button"
                disabled={uploadingFont}
                onClick={() => fileInputRef.current?.click()}
                className="min-h-[34px] px-3 py-1.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary-hover text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                <Upload className="size-3.5" />
                <span>
                  {uploadingFont
                    ? bi('جاري التحميل...', 'Loading...', 'بارکردن...')
                    : bi('رفع ملف خط', 'Upload Font', 'بارکردنی فۆنت')}
                </span>
              </button>
            </div>
          </div>

          {fontUploadError && (
            <div className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400 font-semibold">
              <AlertCircle className="size-3.5 shrink-0" />
              <span>{fontUploadError}</span>
            </div>
          )}

          {customFonts.length > 0 && (
            <div className="space-y-1.5 pt-1">
              {customFonts.map((f) => {
                const active = displayPrefs.fontPreset === `custom:${f.id}`;
                return (
                  <div
                    key={f.id}
                    className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl border ${
                      active ? 'bg-primary/10 border-primary' : 'bg-card border-card-line'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => updateDisplayPrefs({ fontPreset: `custom:${f.id}` })}
                      className="flex-1 text-start text-xs font-bold text-foreground cursor-pointer flex items-center gap-2 min-w-0"
                    >
                      {active && <Check className="size-3.5 text-primary shrink-0" />}
                      <span className="truncate">{f.name}</span>
                      <span className="text-xs font-mono text-muted-foreground-1 uppercase">
                        .{f.format}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeCustomFont(f.id)}
                      aria-label={bi('حذف الخط المخصص', 'Delete custom font', 'سڕینەوەی فۆنت')}
                      className="size-8 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 inline-flex items-center justify-center cursor-pointer shrink-0"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Device / System Fonts */}
        <div className="p-3 rounded-xl bg-surface border border-line-2 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Monitor className="size-3.5 text-primary" />
              <span>{bi('خطوط الجهاز المثبتة', 'Device / System Fonts', 'فۆنتە دامەزراوەکانی ئامێر')}</span>
            </span>
            {localFontApiAvailable && (
              <button
                type="button"
                disabled={scanningSystemFonts}
                onClick={handleScanSystemFonts}
                className="px-2.5 py-1 rounded-lg border border-layer-line bg-card hover:bg-layer-hover text-xs font-semibold text-foreground cursor-pointer"
              >
                {scanningSystemFonts
                  ? bi('جاري الفحص...', 'Scanning...', 'پشکنین...')
                  : bi('قراءة خطوط الجهاز', 'Load Device Fonts', 'خوێندنەوەی فۆنتەکان')}
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {CURATED_DEVICE_FONTS.filter(
              (df) =>
                deviceFormFactor === 'desktop' ||
                df.family !== 'Segoe UI' ||
                displayPrefs.fontPreset === 'system:Segoe UI'
            ).map((df) => {
              const id = `system:${df.family}`;
              const active = displayPrefs.fontPreset === id;
              return (
                <button
                  key={df.family}
                  type="button"
                  onClick={() => updateDisplayPrefs({ fontPreset: id })}
                  className={`min-h-[34px] px-2.5 py-1 rounded-xl border text-xs font-semibold cursor-pointer ${
                    active
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card border-card-line text-foreground hover:bg-layer-hover'
                  }`}
                >
                  {bi(df.labelAr, df.labelEn, DEVICE_FONT_LABEL_CKB[df.family])}
                </button>
              );
            })}
          </div>

          {systemFontFamilies.length > 0 && (
            <select
              value={displayPrefs.fontPreset.startsWith('system:') ? displayPrefs.fontPreset : ''}
              onChange={(e) => {
                if (e.target.value) updateDisplayPrefs({ fontPreset: e.target.value });
              }}
              aria-label={bi('اختيار خط من النظام', 'Select system font', 'هەڵبژاردنی فۆنت')}
              className="w-full py-2 px-3 rounded-xl bg-card border border-card-line text-xs text-foreground"
            >
              <option value="">
                {bi(
                  `-- اختر من ${systemFontFamilies.length} خط مثبت --`,
                  `-- Choose from ${systemFontFamilies.length} installed fonts --`,
                  `-- لە ${systemFontFamilies.length} فۆنت هەڵبژێرە --`
                )}
              </option>
              {systemFontFamilies.map((fam) => (
                <option key={fam} value={`system:${fam}`}>
                  {fam}
                </option>
              ))}
            </select>
          )}

          <div className="flex items-center gap-2">
            <input
              type="text"
              aria-label={bi('اسم خط مثبت على الجهاز', 'Installed font family name', 'ناوی فۆنتی دامەزراو')}
              value={manualSystemFontInput}
              onChange={(e) => setManualSystemFontInput(e.target.value)}
              placeholder={bi(
                'أو اكتب اسم خط مثبت على جهازك...',
                'Or type an installed font name...',
                'یان ناوی فۆنتێکی دامەزراو بنووسە...'
              )}
              className="flex-1 min-h-[36px] py-1.5 px-2.5 rounded-xl bg-card border border-control-border text-xs text-foreground"
            />
            <button
              type="button"
              onClick={handleApplyManualSystemFont}
              disabled={!manualSystemFontInput.trim()}
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-card hover:bg-layer-hover border border-line-2 text-xs font-bold text-foreground cursor-pointer disabled:opacity-50"
            >
              {bi('تطبيق', 'Apply', 'جێبەجێکردن')}
            </button>
          </div>
        </div>
      </SettingsAccordion>

      {/* 2. Fine Typography & Layout Controls (Collapsed by default) */}
      <SettingsAccordion
        icon={<Maximize2 className="size-4" />}
        title={bi('تفاصيل الخط وكثافة التخطيط', 'Typography Fine-Tuning & Layout', 'وردەکاری فۆنت و شێوازی شاشە')}
        subtitle={
          deviceFormFactor === 'mobile'
            ? bi(
                'سُمك الخط، تباعد الأسطر، كثافة العرض واستدارة الحواف.',
                'Weight, line height, Arabic readability boost, density & corner radius.',
                'ئەستووری فۆنت، دووری دێڕ، چڕی نیشاندان و خڕی لێوارەکان.'
              )
            : bi(
                'سُمك الخط، تباعد الأسطر، كثافة العرض، عرض المحتوى واستدارة الحواف.',
                'Weight, line height, Arabic readability boost, density, width & corner radius.',
                'ئەستووری فۆنت، دووری دێڕ، چڕی نیشاندان، پانی و خڕی لێوارەکان.'
              )
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <span id="appearance-arabic-scale-label" className="text-xs font-bold text-muted-foreground-1 block">
              {bi('تكبير إضافي للنص العربي والكردي', 'Arabic / Kurdish Readability Boost', 'گەورەکردنی دەقی کوردی و عەرەبی')}
            </span>
            <div className="flex gap-1.5" role="group" aria-labelledby="appearance-arabic-scale-label">
              {([
                { val: 1, label: '1.0x' },
                { val: 1.06, label: '1.06x' },
                { val: 1.12, label: '1.12x' },
              ] as const).map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => updateDisplayPrefs({ arabicScale: opt.val as ArabicScaleMode })}
                  className={`flex-1 min-h-[34px] py-1.5 rounded-xl border text-xs font-bold cursor-pointer ${
                    displayPrefs.arabicScale === opt.val
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'bg-surface border-line-2 text-foreground hover:bg-layer-hover'
                  }`}
                >
                  <span dir="ltr">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <span id="appearance-font-weight-label" className="text-xs font-bold text-muted-foreground-1 block">
              {bi('سُمك الخط', 'Font Weight', 'ئەستووری فۆنت')}
            </span>
            <div className="flex gap-1.5" role="group" aria-labelledby="appearance-font-weight-label">
              {([
                { val: 'normal', ar: 'عادي', en: 'Normal', ckb: 'ئاسایی' },
                { val: 'medium', ar: 'متوسط', en: 'Medium', ckb: 'مامناوەند' },
                { val: 'semibold', ar: 'سميك', en: 'Semibold', ckb: 'تۆخ' },
              ] as const).map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => updateDisplayPrefs({ fontWeight: opt.val as FontWeightMode })}
                  className={`flex-1 min-h-[34px] py-1.5 rounded-xl border text-xs font-bold cursor-pointer ${
                    displayPrefs.fontWeight === opt.val
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'bg-surface border-line-2 text-foreground hover:bg-layer-hover'
                  }`}
                >
                  {bi(opt.ar, opt.en, opt.ckb)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <span id="appearance-line-height-label" className="text-xs font-bold text-muted-foreground-1 block">
              {bi('تباعد الأسطر', 'Line Height', 'دووری نێوان دێڕەکان')}
            </span>
            <div className="flex gap-1.5" role="group" aria-labelledby="appearance-line-height-label">
              {([
                { val: 'compact', ar: 'مضغوط', en: 'Compact', ckb: 'چڕکراو' },
                { val: 'normal', ar: 'قياسي', en: 'Normal', ckb: 'ئاسایی' },
                { val: 'relaxed', ar: 'مريح', en: 'Relaxed', ckb: 'ئارام' },
              ] as const).map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => updateDisplayPrefs({ lineHeight: opt.val as LineHeightMode })}
                  className={`flex-1 min-h-[34px] py-1.5 rounded-xl border text-xs font-bold cursor-pointer ${
                    displayPrefs.lineHeight === opt.val
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'bg-surface border-line-2 text-foreground hover:bg-layer-hover'
                  }`}
                >
                  {bi(opt.ar, opt.en, opt.ckb)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <span id="appearance-letter-spacing-label" className="text-xs font-bold text-muted-foreground-1 block">
              {bi('تباعد الأحرف الإنجليزية', 'Latin Letter Spacing', 'مەودای پیتە لاتینییەکان')}
            </span>
            <div className="flex gap-1.5" role="group" aria-labelledby="appearance-letter-spacing-label">
              {([
                { val: 'normal', ar: 'عادي', en: 'Normal', ckb: 'ئاسایی' },
                { val: 'wide', ar: 'واسع', en: 'Wide', ckb: 'فراوان' },
                { val: 'wider', ar: 'أوسع', en: 'Wider', ckb: 'فراوانتر' },
              ] as const).map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() =>
                    updateDisplayPrefs({ ltrLetterSpacing: opt.val as LtrLetterSpacingMode })
                  }
                  className={`flex-1 min-h-[34px] py-1.5 rounded-xl border text-xs font-bold cursor-pointer ${
                    displayPrefs.ltrLetterSpacing === opt.val
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'bg-surface border-line-2 text-foreground hover:bg-layer-hover'
                  }`}
                >
                  {bi(opt.ar, opt.en, opt.ckb)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div
          className={`grid grid-cols-1 ${
            deviceFormFactor === 'mobile' ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'
          } gap-3 pt-2 border-t border-card-divider`}
        >
          <div className="space-y-1">
            <span id="appearance-density-label" className="text-xs font-bold text-muted-foreground-1 block">
              {bi('كثافة العرض', 'Display Density', 'چڕی نیشاندان')}
            </span>
            <div className="flex gap-1" role="group" aria-labelledby="appearance-density-label">
              {([
                { val: 'comfortable', ar: 'مريح', en: 'Comf.', ckb: 'ئارام' },
                { val: 'standard', ar: 'قياسي', en: 'Std', ckb: 'ئاسایی' },
                { val: 'compact', ar: 'مضغوط', en: 'Dense', ckb: 'چڕ' },
              ] as const).map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => updateDisplayPrefs({ density: opt.val as DisplayDensityMode })}
                  className={`flex-1 min-h-[34px] py-1.5 rounded-xl border text-xs font-bold cursor-pointer ${
                    displayPrefs.density === opt.val
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'bg-surface border-line-2 text-foreground hover:bg-layer-hover'
                  }`}
                >
                  {bi(opt.ar, opt.en, opt.ckb)}
                </button>
              ))}
            </div>
          </div>

          {deviceFormFactor !== 'mobile' && (
            <div className="space-y-1" data-testid="appearance-content-width-control">
              <span id="appearance-width-label" className="text-xs font-bold text-muted-foreground-1 block">
                {bi('عرض المحتوى', 'Content Width', 'پانی ناوەڕۆک')}
              </span>
              <div className="flex gap-1" role="group" aria-labelledby="appearance-width-label">
                {([
                  { val: 'narrow', ar: 'ضيق', en: 'Narrow', ckb: 'تەسک' },
                  { val: 'standard', ar: 'قياسي', en: 'Std', ckb: 'ئاسایی' },
                  { val: 'wide', ar: 'عريض', en: 'Wide', ckb: 'فراوان' },
                  { val: 'full', ar: 'كامل', en: 'Full', ckb: 'تەواو' },
                ] as const).map((opt) => (
                  <button
                    key={opt.val}
                    type="button"
                    onClick={() =>
                      updateDisplayPrefs({ contentMaxWidth: opt.val as ContentWidthMode })
                    }
                    className={`flex-1 min-h-[34px] py-1.5 rounded-xl border text-xs font-bold cursor-pointer ${
                      displayPrefs.contentMaxWidth === opt.val
                        ? 'bg-primary/10 border-primary text-primary'
                        : 'bg-surface border-line-2 text-foreground hover:bg-layer-hover'
                    }`}
                  >
                    {bi(opt.ar, opt.en, opt.ckb)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <span id="appearance-radius-label" className="text-xs font-bold text-muted-foreground-1 block">
              {bi('استدارة الحواف', 'Corner Radius', 'خڕی لێوارەکان')}
            </span>
            <div className="flex gap-1" role="group" aria-labelledby="appearance-radius-label">
              {([
                { val: 'sharp', ar: 'حادة', en: 'Sharp', ckb: 'تیژ' },
                { val: 'standard', ar: 'قياسية', en: 'Std', ckb: 'ئاسایی' },
                { val: 'rounded', ar: 'مستديرة', en: 'Round', ckb: 'خڕ' },
              ] as const).map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => updateDisplayPrefs({ cornerRadius: opt.val as CornerRadiusMode })}
                  className={`flex-1 min-h-[34px] py-1.5 rounded-xl border text-xs font-bold cursor-pointer ${
                    displayPrefs.cornerRadius === opt.val
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'bg-surface border-line-2 text-foreground hover:bg-layer-hover'
                  }`}
                >
                  {bi(opt.ar, opt.en, opt.ckb)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </SettingsAccordion>

      {/* 3. Accessibility & Low-End Performance */}
      <SettingsAccordion
        icon={<Eye className="size-4" />}
        title={bi('الوضوح وسهولة الاستخدام والأداء', 'Accessibility & Device Performance', 'ڕوونی، ئاسانی بەکارهێنان و کارایی')}
        meta={
          isLowEndHardware
            ? bi('جهاز بموارد محدودة', 'Low-resource device', 'ئامێری سنووردار')
            : bi('عتاد قياسي', 'Standard hardware', 'ئامێری ئاسایی')
        }
        open={accessibilityOpen}
        onOpenChange={setAccessibilityOpen}
      >
        <div>
          <SettingsSwitchRow
            title={bi('تباين عالٍ للحدود والحقول', 'High Contrast Borders & Controls', 'کۆنتراستی بەرز بۆ چوارچێوەکان')}
            description={bi(
              'يزيد وضوح إطارات الإدخال والفواصل للشاشات الساطعة.',
              'Strengthens borders and dividers for bright clinics or low-vision comfort.',
              'ڕوونی چوارچێوە و جیاکەرەوەکان زیاد دەکات.'
            )}
            checked={displayPrefs.highContrast}
            onChange={(next) => updateDisplayPrefs({ highContrast: next })}
          />
          <SettingsSwitchRow
            title={
              deviceFormFactor === 'desktop'
                ? bi(
                    'أزرار وحقول نقر أكبر (44px+)',
                    'Larger Click Targets & Inputs (44px+)',
                    'دوگمە و خانەی کرتەکردنی گەورەتر (44px+)'
                  )
                : deviceFormFactor === 'tablet'
                  ? bi(
                      'أزرار وحقول لمس أكبر للتابلت (44px+)',
                      'Larger Tablet Touch Targets (44px+)',
                      'دوگمە و خانەی دەستلێدانی گەورەتر بۆ تابلێت (44px+)'
                    )
                  : bi(
                      'أزرار وحقول لمس أكبر للهاتف (44px+)',
                      'Larger Phone Touch Targets (44px+)',
                      'دوگمە و خانەی دەستلێدانی گەورەتر بۆ مۆبایل (44px+)'
                    )
            }
            description={
              deviceFormFactor === 'desktop'
                ? bi(
                    'يكبّر مساحة النقر بالماوس للأزرار والقوائم والحقول المنسدلة على شاشات الحاسوب.',
                    'Expands minimum button and dropdown heights for easier mouse clicking on desktop.',
                    'بۆشایی کرتەکردن بە ماوس بۆ دوگمە و لیستەکان لەسەر کۆمپیوتەر گەورە دەکات.'
                  )
                : deviceFormFactor === 'tablet'
                  ? bi(
                      'يكبّر مساحة اللمس للأزرار والقوائم المنسدلة لسهولة الاستخدام على شاشة التابلت.',
                      'Expands minimum button and control height for comfortable tablet touch ergonomics.',
                      'بۆشایی دەستلێدان بۆ دوگمە و لیستەکان بۆ ئاسانی بەکارهێنان لەسەر تابلێت گەورە دەکات.'
                    )
                  : bi(
                      'يكبّر مساحة اللمس للأزرار والحقول لتسهيل الإدخال بيد واحدة على شاشة الهاتف.',
                      'Expands touch targets and input heights for reliable one-handed phone ergonomics.',
                      'بۆشایی دەستلێدان بۆ دوگمە و خانەکان گەورە دەکات بۆ ئاسانی بەکارهێنان لەسەر مۆبایل.'
                    )
            }
            checked={displayPrefs.largeHitTargets}
            onChange={(next) => updateDisplayPrefs({ largeHitTargets: next })}
          />
          <SettingsSwitchRow
            title={bi('تقليل الشفافية والظلال', 'Reduce Transparency & Shadows', 'کەمکردنەوەی شەفافیەت و سێبەر')}
            description={bi(
              'يزيل الضبابية والظلال الثقيلة لتسريع الأداء على الأجهزة الضعيفة.',
              'Disables blur filters and heavy shadows for lower GPU load.',
              'تەڵخی و سێبەرە قورسەکان لادەبات بۆ کارایی خێراتر.'
            )}
            checked={displayPrefs.reduceTransparency}
            onChange={(next) => updateDisplayPrefs({ reduceTransparency: next })}
          />
          <SettingsSwitchRow
            title={bi('تقليل الحركات والانتقالات', 'Reduce Motion & UI Animations', 'کەمکردنەوەی جوڵە و گواستنەوە')}
            description={bi(
              'يوقف الحركات غير الضرورية لراحة العين والأداء السريع.',
              'Disables non-essential animations for visual comfort.',
              'جوڵە ناپێویستەکان ڕادەگرێت.'
            )}
            checked={reduceMotion}
            onChange={(next) => setReduceMotion(next)}
          />
        </div>

        {/* Low-End Hardware Performance Mode */}
        <div className="pt-2 border-t border-card-divider space-y-2">
          <div>
            <div className="text-xs font-bold text-foreground">
              {bi('وضع الأداء للأجهزة الضعيفة', 'Low-End Device Performance Mode', 'دۆخی ئامێرە لاوازەکان')}
            </div>
            <p className="text-xs text-muted-foreground-1 mt-0.5">
              {bi(
                'يعطّل المؤثرات الثقيلة تلقائياً عند اكتشاف موارد جهاز محدودة.',
                'Automatically disables heavy blur, shadows, and animations on low-resource devices.',
                'بە شێوەی خۆکار کاریگەرییە قورسەکان کەم دەکاتەوە لەسەر ئامێرە لاوازەکان.'
              )}
            </p>
          </div>

          <div
            className="flex gap-1.5"
            role="radiogroup"
            aria-label={bi('وضع الأداء للأجهزة الضعيفة', 'Low-End Device Mode', 'دۆخی ئامێرە لاوازەکان')}
          >
            {(
              [
                { val: 'auto', ar: 'تلقائي', en: 'Auto', ckb: 'خۆکار' },
                { val: 'on', ar: 'تفعيل دائماً', en: 'Always On', ckb: 'هەمیشە چالاک' },
                { val: 'off', ar: 'إيقاف', en: 'Always Off', ckb: 'هەمیشە کوژاوە' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.val}
                type="button"
                role="radio"
                aria-checked={(displayPrefs.reducedEffectsMode || 'auto') === opt.val}
                data-testid={`reduced-effects-${opt.val}`}
                onClick={() =>
                  updateDisplayPrefs({ reducedEffectsMode: opt.val as ReducedEffectsMode })
                }
                className={`flex-1 min-h-[34px] py-1.5 px-2 rounded-xl border text-xs font-bold cursor-pointer ${
                  (displayPrefs.reducedEffectsMode || 'auto') === opt.val
                    ? 'bg-primary/10 border-primary text-primary'
                    : 'bg-surface border-line-2 text-foreground hover:bg-layer-hover'
                }`}
              >
                {bi(opt.ar, opt.en, opt.ckb)}
              </button>
            ))}
          </div>
        </div>
      </SettingsAccordion>
    </div>
  );
};
