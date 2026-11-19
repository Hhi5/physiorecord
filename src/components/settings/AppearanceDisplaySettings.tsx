// =======================================================================
// PhysioRecord — Display, Typography & Custom Font Settings Panel
// Keeps all fonts local/offline (self-hosted, device fonts, or IndexedDB
// user uploads loaded via FontFace ArrayBuffer — zero external requests).
// =======================================================================

import React, { useRef, useState } from 'react';
import {
  Type,
  Upload,
  Trash2,
  RotateCcw,
  Sparkles,
  Check,
  Monitor,
  Eye,
  Maximize2,
  AlertCircle,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
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

export const AppearanceDisplaySettings: React.FC = () => {
  const { bi } = useLanguage();
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
          : bi(
              'تعذر تحميل ملف الخط.',
              'Failed to load custom font file.',
              'بارکردنی فایلی فۆنت سەرکەوتوو نەبوو.'
            )
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
      // Local Font Access API not supported on Android WebView / some browsers — fail silently
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

  return (
    <div className="space-y-4">
      {/* 1. Font Family Section */}
      <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            <Type className="size-4 text-primary" />
            <span>
              {bi('نوع الخط والطباعة', 'Typography & Font Family', 'جۆری فۆنت و چاپکردن')}
            </span>
          </div>
          <button
            type="button"
            onClick={resetDisplayPrefs}
            className="px-2.5 py-1 rounded-lg border border-layer-line bg-layer hover:bg-layer-hover text-foreground text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="size-3.5 text-primary" />
            <span>{bi('إعادة ضبط العرض', 'Reset Display', 'گەڕاندنەوەی بنەڕەتی نیشاندان')}</span>
          </button>
        </div>

        {/* Built-in Offline Fonts */}
        <div className="space-y-1.5">
          <span className="text-xs font-bold text-muted-foreground-1 block">
            {bi(
              'الخطوط المدمجة (تعمل بدون إنترنت):',
              'Built-in Offline Fonts:',
              'فۆنتە یەکخراوەکان (بێ ئینتەرنێت کار دەکەن):'
            )}
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
                      : 'bg-card border-card-line hover:bg-layer-hover text-foreground'
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

        {/* Upload Custom Local Font (.woff2 / .woff / .ttf / .otf) */}
        <div className="p-3 rounded-xl bg-layer border border-layer-line space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-bold text-foreground">
                {bi(
                  'رفع خط مخصص من جهازك',
                  'Upload Custom Font from Device',
                  'بارکردنی فۆنتی تایبەت لە ئامێرەکەتەوە'
                )}
              </div>
              <p className="text-xs text-muted-foreground-1 mt-0.5">
                {bi(
                  'يقبل صيغ .woff2 / .woff / .ttf / .otf (بحد أقصى 5 ميجابايت) ويُحفظ محلياً على هذا الجهاز فقط.',
                  'Supports .woff2 / .woff / .ttf / .otf (max 5 MB), stored locally on this device only.',
                  'فۆرماتەکانی .woff2 / .woff / .ttf / .otf وەردەگرێت (زۆرترین 5 MB) و تەنها لەسەر ئەم ئامێرە هەڵدەگیرێت.'
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
                aria-label={bi(
                  'رفع ملف خط من الجهاز',
                  'Upload custom font file',
                  'بارکردنی فایلی فۆنت لە ئامێرەوە'
                )}
              />
              <button
                type="button"
                disabled={uploadingFont}
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary-hover text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                <Upload className="size-3.5" />
                <span>
                  {uploadingFont
                    ? bi('جاري التحميل...', 'Loading...', 'خەریکی بارکردنە...')
                    : bi('رفع خط من الجهاز', 'Upload Font File', 'بارکردنی فۆنت لە ئامێرەوە')}
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
                    className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border ${
                      active
                        ? 'bg-primary/10 border-primary'
                        : 'bg-card border-card-line'
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
                      aria-label={bi('حذف الخط المخصص', 'Delete custom font', 'سڕینەوەی فۆنتی تایبەت')}
                      className="size-9 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 inline-flex items-center justify-center cursor-pointer shrink-0"
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
        <div className="p-3 rounded-xl bg-layer border border-layer-line space-y-2.5">
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
                className="px-2.5 py-1 rounded-lg border border-layer-line bg-card hover:bg-surface text-xs font-semibold text-foreground cursor-pointer"
              >
                {scanningSystemFonts
                  ? bi('جاري الفحص...', 'Scanning...', 'خەریکی پشکنینە...')
                  : bi('قراءة خطوط هذا الجهاز', 'Load Device Fonts', 'خوێندنەوەی فۆنتەکانی ئەم ئامێرە')}
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {CURATED_DEVICE_FONTS.map((df) => {
              const id = `system:${df.family}`;
              const active = displayPrefs.fontPreset === id;
              return (
                <button
                  key={df.family}
                  type="button"
                  onClick={() => updateDisplayPrefs({ fontPreset: id })}
                  className={`min-h-[36px] px-2.5 py-1 rounded-lg border text-xs font-semibold cursor-pointer ${
                    active
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card border-card-line text-foreground hover:bg-surface'
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
              aria-label={bi('اختيار خط من النظام', 'Select system font', 'هەڵبژاردنی فۆنت لە سیستەمەوە')}
              className="w-full py-2 px-3 rounded-lg bg-card border border-card-line text-xs text-foreground"
            >
              <option value="">
                {bi(
                  `-- اختر من ${systemFontFamilies.length} خط مثبت على جهازك --`,
                  `-- Choose from ${systemFontFamilies.length} installed fonts --`,
                  `-- لە نێوان ${systemFontFamilies.length} فۆنتی دامەزراوی ئامێرەکەت هەڵبژێرە --`
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
                'أو اكتب اسم خط مثبت (مثل: Sakkal Majalla أو Noto Naskh Arabic)...',
                'Or type installed font name (e.g., Inter, Arial, Georgia)...',
                'یان ناوی فۆنتێکی دامەزراو بنووسە (وەک: Noto Naskh Arabic یان Inter)...'
              )}
              className="flex-1 min-h-[36px] py-1.5 px-2.5 rounded-lg bg-card border border-control-border text-xs text-foreground"
            />
            <button
              type="button"
              onClick={handleApplyManualSystemFont}
              disabled={!manualSystemFontInput.trim()}
              className="min-h-[36px] px-3 py-1.5 rounded-lg bg-surface hover:bg-layer-hover border border-layer-line text-xs font-bold text-foreground cursor-pointer disabled:opacity-50"
            >
              {bi('تطبيق', 'Apply', 'جێبەجێکردن')}
            </button>
          </div>
        </div>
      </div>

      {/* 2. Font Size, Arabic Boost, Weight, Line Height & LTR Spacing */}
      <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-foreground flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <span>
              {bi(
                'حجم الخط الأساسي والتفاصيل الطباعية',
                'Font Size & Typography Controls',
                'قەبارەی سەرەکی فۆنت و وردەکاری چاپکردن'
              )}
            </span>
          </span>
          <span dir="ltr" className="text-xs font-mono font-bold text-primary">
            {displayPrefs.fontScalePercent}%
          </span>
        </div>

        {/* Fine slider + quick preset buttons */}
        <div className="space-y-2">
          <input
            type="range"
            min={87.5}
            max={150}
            step={2.5}
            value={displayPrefs.fontScalePercent}
            onChange={(e) =>
              updateDisplayPrefs({ fontScalePercent: Number(e.target.value) })
            }
            aria-label={bi('حجم الخط الأساسي', 'Base font size', 'قەبارەی سەرەکی فۆنت')}
            className="w-full accent-primary cursor-pointer"
          />
          <div className="flex flex-wrap gap-1.5">
            {([87.5, 100, 115, 130, 150] as const).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => updateDisplayPrefs({ fontScalePercent: preset })}
                className={`min-h-[36px] px-2.5 py-1 rounded-lg border text-xs font-bold cursor-pointer ${
                  displayPrefs.fontScalePercent === preset
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card border-card-line text-foreground hover:bg-layer-hover'
                }`}
              >
                <span dir="ltr">{preset}%</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          {/* Arabic/Kurdish Relative Scale Boost */}
          <div className="space-y-1">
            <span id="appearance-arabic-scale-label" className="text-xs font-bold text-muted-foreground-1 block">
              {bi('تكبير إضافي للنص العربي والكردي', 'Arabic / Kurdish Readability Boost', 'گەورەکردنی زیادەی دەقی کوردی و عەرەبی')}
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
                  onClick={() =>
                    updateDisplayPrefs({ arabicScale: opt.val as ArabicScaleMode })
                  }
                  className={`flex-1 min-h-[36px] py-1.5 rounded-lg border text-xs font-bold cursor-pointer ${
                    displayPrefs.arabicScale === opt.val
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'bg-card border-card-line text-foreground hover:bg-layer-hover'
                  }`}
                >
                  <span dir="ltr">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Font Weight */}
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
                  onClick={() =>
                    updateDisplayPrefs({ fontWeight: opt.val as FontWeightMode })
                  }
                  className={`flex-1 min-h-[36px] py-1.5 rounded-lg border text-xs font-bold cursor-pointer ${
                    displayPrefs.fontWeight === opt.val
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'bg-card border-card-line text-foreground hover:bg-layer-hover'
                  }`}
                >
                  {bi(opt.ar, opt.en, opt.ckb)}
                </button>
              ))}
            </div>
          </div>

          {/* Line Height */}
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
                  onClick={() =>
                    updateDisplayPrefs({ lineHeight: opt.val as LineHeightMode })
                  }
                  className={`flex-1 min-h-[36px] py-1.5 rounded-lg border text-xs font-bold cursor-pointer ${
                    displayPrefs.lineHeight === opt.val
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'bg-card border-card-line text-foreground hover:bg-layer-hover'
                  }`}
                >
                  {bi(opt.ar, opt.en, opt.ckb)}
                </button>
              ))}
            </div>
          </div>

          {/* LTR-only Letter Spacing */}
          <div className="space-y-1">
            <span id="appearance-letter-spacing-label" className="text-xs font-bold text-muted-foreground-1 block">
              {bi(
                'تباعد الأحرف اللاتينية (EN فقط)',
                'Latin Letter Spacing (LTR only)',
                'مەودای پیتە لاتینییەکان (تەنها EN)'
              )}
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
                    updateDisplayPrefs({
                      ltrLetterSpacing: opt.val as LtrLetterSpacingMode,
                    })
                  }
                  className={`flex-1 min-h-[36px] py-1.5 rounded-lg border text-xs font-bold cursor-pointer ${
                    displayPrefs.ltrLetterSpacing === opt.val
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'bg-card border-card-line text-foreground hover:bg-layer-hover'
                  }`}
                >
                  {bi(opt.ar, opt.en, opt.ckb)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Layout Density, Max Width & Corner Radius */}
      <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-foreground">
          <Maximize2 className="size-4 text-primary" />
          <span>
            {bi(
              'تخطيط الشاشة والكثافة والحواف',
              'Layout Density, Width & Borders',
              'شێوازی شاشە، چڕی و لێوارەکان'
            )}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                  onClick={() =>
                    updateDisplayPrefs({ density: opt.val as DisplayDensityMode })
                  }
                  className={`flex-1 min-h-[36px] py-1.5 rounded-lg border text-xs font-bold cursor-pointer ${
                    displayPrefs.density === opt.val
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'bg-card border-card-line text-foreground hover:bg-layer-hover'
                  }`}
                >
                  {bi(opt.ar, opt.en, opt.ckb)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
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
                    updateDisplayPrefs({
                      contentMaxWidth: opt.val as ContentWidthMode,
                    })
                  }
                  className={`flex-1 min-h-[36px] py-1.5 rounded-lg border text-xs font-bold cursor-pointer ${
                    displayPrefs.contentMaxWidth === opt.val
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'bg-card border-card-line text-foreground hover:bg-layer-hover'
                  }`}
                >
                  {bi(opt.ar, opt.en, opt.ckb)}
                </button>
              ))}
            </div>
          </div>

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
                  onClick={() =>
                    updateDisplayPrefs({ cornerRadius: opt.val as CornerRadiusMode })
                  }
                  className={`flex-1 min-h-[36px] py-1.5 rounded-lg border text-xs font-bold cursor-pointer ${
                    displayPrefs.cornerRadius === opt.val
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'bg-card border-card-line text-foreground hover:bg-layer-hover'
                  }`}
                >
                  {bi(opt.ar, opt.en, opt.ckb)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Accessibility Toggles */}
      <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-2.5">
        <div className="flex items-center gap-2 text-xs font-bold text-foreground">
          <Eye className="size-4 text-primary" />
          <span>
            {bi(
              'خيارات الوضوح وسهولة الاستخدام',
              'Accessibility & Visual Comfort',
              'بژاردەکانی ڕوونی و ئاسانی بەکارهێنان'
            )}
          </span>
        </div>

        {(
          [
            {
              key: 'highContrast',
              checked: displayPrefs.highContrast,
              onToggle: () =>
                updateDisplayPrefs({ highContrast: !displayPrefs.highContrast }),
              arTitle: 'تباين عالٍ للحدود والحقول',
              enTitle: 'High Contrast Borders & Controls',
              ckbTitle: 'کۆنتراستی بەرز بۆ چوارچێوە و خانەکان',
              arDesc: 'يزيد وضوح إطارات الإدخال والفواصل للشاشات الساطعة أو ضعيفي البصر',
              enDesc: 'Strengthens borders and dividers for bright clinics or low-vision comfort',
              ckbDesc:
                'ڕوونی چوارچێوە و جیاکەرەوەکان زیاد دەکات بۆ شاشەی ڕووناک یان لاوازی بینین',
            },
            {
              key: 'largeHitTargets',
              checked: displayPrefs.largeHitTargets,
              onToggle: () =>
                updateDisplayPrefs({
                  largeHitTargets: !displayPrefs.largeHitTargets,
                }),
              arTitle: 'أزرار وحقول لمس أكبر (44px+)',
              enTitle: 'Larger Click & Touch Targets (44px+)',
              ckbTitle: 'دوگمە و خانەی گەورەتر بۆ دەستلێدان (44px+)',
              arDesc: 'يكبّر مساحة الضغط للأزرار والقوائم المنسدلة للأجهزة اللوحية',
              enDesc: 'Expands minimum button and control height to 44px for tablet ergonomics',
              ckbDesc:
                'بۆشایی کرتەکردن بۆ دوگمە و لیستەکان گەورە دەکات بۆ بەکارهێنانی تابلێت',
            },
            {
              key: 'reduceTransparency',
              checked: displayPrefs.reduceTransparency,
              onToggle: () =>
                updateDisplayPrefs({
                  reduceTransparency: !displayPrefs.reduceTransparency,
                }),
              arTitle: 'تقليل الشفافية والظلال (أداء أسرع)',
              enTitle: 'Reduce Transparency & Shadows',
              ckbTitle: 'کەمکردنەوەی شەفافیەت و سێبەر (کارایی خێراتر)',
              arDesc: 'يزيل الضبابية والظلال الثقيلة لتخفيف الحمل على الأجهزة الضعيفة',
              enDesc: 'Disables blur filters and heavy shadows for crisper visuals and lower GPU load',
              ckbDesc:
                'تەڵخی و سێبەرە قورسەکان لادەبات بۆ کەمکردنەوەی بار لەسەر ئامێرە لاوازەکان',
            },
            {
              key: 'reduceMotion',
              checked: reduceMotion,
              onToggle: () => setReduceMotion(!reduceMotion),
              arTitle: 'تقليل الحركات والانتقالات البصرية',
              enTitle: 'Reduce Motion & UI Animations',
              ckbTitle: 'کەمکردنەوەی جوڵە و گواستنەوەی بینراو',
              arDesc: 'يوقف الحركات المتكررة لراحة العين والأداء السريع',
              enDesc: 'Disables non-essential animations for visual comfort',
              ckbDesc: 'جوڵە ناپێویستەکان ڕادەگرێت بۆ ئاسوودەیی چاو و خێرایی کارکردن',
            },
          ] as const
        ).map((item) => (
          <div
            key={item.key}
            className="flex items-center justify-between gap-3 py-1.5 border-t border-line-2/50 first:border-t-0"
          >
            <div>
              <div className="text-xs font-bold text-foreground">
                {bi(item.arTitle, item.enTitle, item.ckbTitle)}
              </div>
              <p className="text-xs text-muted-foreground-1 mt-0.5">
                {bi(item.arDesc, item.enDesc, item.ckbDesc)}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={item.checked}
              onClick={item.onToggle}
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0 ${
                item.checked
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-card-line text-foreground'
              }`}
            >
              <span>
                {item.checked
                  ? bi('✓ مفعّل', '✓ On', '✓ چالاکە')
                  : bi('مغلق', 'Off', 'کوژاوەتەوە')}
              </span>
            </button>
          </div>
        ))}

        {/* Low-End Hardware / Auto Reduced Effects Override */}
        <div className="pt-2.5 mt-1 border-t border-line-2/50 space-y-2">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <div className="text-xs font-bold text-foreground">
                {bi(
                  'وضع الأداء للأجهزة الضعيفة (تقليل المؤثرات والظلال)',
                  'Low-End Device Performance Mode',
                  'دۆخی ئامێرە لاوازەکان (کەمکردنەوەی کاریگەرییەکان)'
                )}
              </div>
              <p className="text-xs text-muted-foreground-1 mt-0.5">
                {bi(
                  'يُعطّل الشفافية والحركات تلقائياً عند اكتشاف ذاكرة 4 غيغابايت فأقل أو معالج ثنائي النواة.',
                  'Automatically disables heavy blur, shadows, and animations when <=4GB RAM or <=2 CPU cores are detected.',
                  'بە شێوەیەکی خۆکار شەفافیەت و جوڵە کەم دەکاتەوە کاتێک ئامێرەکە <=4GB یان <=2 ناوک بێت.'
                )}
              </p>
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-layer border border-line-2 text-muted-foreground-1">
              {isLowEndHardware
                ? bi('تم اكتشاف جهاز بموارد محدودة', 'Low-resource hardware detected', 'ئامێری سنووردار دۆزرایەوە')
                : bi('عتاد قياسي', 'Standard hardware', 'ئامێری ئاسایی')}
            </span>
          </div>

          <div className="flex gap-1.5" role="radiogroup" aria-label={bi('وضع الأداء للأجهزة الضعيفة', 'Low-End Device Mode', 'دۆخی ئامێرە لاوازەکان')}>
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
                className={`flex-1 py-1.5 px-2 rounded-lg border text-xs font-bold cursor-pointer ${
                  (displayPrefs.reducedEffectsMode || 'auto') === opt.val
                    ? 'bg-primary/10 border-primary text-primary'
                    : 'bg-card border-card-line text-foreground hover:bg-layer-hover'
                }`}
              >
                {bi(opt.ar, opt.en, opt.ckb)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
