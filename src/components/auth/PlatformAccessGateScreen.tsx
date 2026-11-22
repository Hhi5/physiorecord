// =======================================================================
// PhysioRecord — Hosted Web Platform Access & Local Install Gate Screen
// Blocks browser-tab clinical usage on hosted web domains:
// - iPhone/iPad Safari tab -> Guided Add-to-Home-Screen (protects against iOS 7-day eviction)
// - iPhone/iPad Chrome/Edge/In-App browser -> 1-tap Copy Link & Open in Safari
// - Android browser -> Official APK download from GitHub Releases
// - Desktop browser -> Official Desktop (.exe) download from GitHub Releases
// Preserves emergency read/backup access ONLY if a pre-existing vault is detected.
// =======================================================================

import React, { useState } from 'react';
import {
  Check,
  Compass,
  Copy,
  Download,
  ExternalLink,
  HardDrive,
  Laptop,
  Lock,
  Moon,
  PlusSquare,
  RefreshCw,
  Share,
  ShieldCheck,
  Smartphone,
  Sun,
  WifiOff,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { BrandLogo } from '../ui/BrandLogo';
import { LanguageSwitcher } from '../ui/LanguageSwitcher';
import { OFFICIAL_LATEST_RELEASE_URL } from '../../utils/updateSafety';
import type { PlatformGateMode } from '../../pwa/platformAccessGate';

interface PlatformAccessGateScreenProps {
  mode: Exclude<PlatformGateMode, 'allow'>;
  desktopOs: 'windows' | 'macos' | 'linux' | 'other';
  isMacSafari?: boolean;
  canInstallPrompt?: boolean;
  onTriggerInstallPrompt?: () => void;
  hasExistingVault: boolean;
  onAllowExistingVaultBackup: () => void;
}

export const PlatformAccessGateScreen: React.FC<PlatformAccessGateScreenProps> = ({
  mode,
  desktopOs,
  isMacSafari = false,
  canInstallPrompt = false,
  onTriggerInstallPrompt,
  hasExistingVault,
  onAllowExistingVaultBackup,
}) => {
  const { isRtl, bi } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const [copiedUrl, setCopiedUrl] = useState(false);

  const currentUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}`
      : '';

  const handleCopyUrl = async () => {
    if (!currentUrl) return;
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 3000);
    } catch {
      // Fallback: select readonly URL input if clipboard is restricted in in-app webview
      const input = document.getElementById('ios-gate-url-input') as HTMLInputElement | null;
      if (input) {
        input.focus();
        input.select();
        try {
          document.execCommand('copy');
          setCopiedUrl(true);
          window.setTimeout(() => setCopiedUrl(false), 3000);
        } catch {
          // User can tap & copy manually from the visible URL box
        }
      }
    }
  };

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      data-testid="platform-access-gate"
      data-gate-mode={mode}
      className="min-h-[100dvh] bg-surface text-foreground flex flex-col justify-between px-4 py-6 sm:px-6 sm:py-8 pt-[max(1.5rem,env(safe-area-inset-top,0px))] pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]"
    >
      {/* Top Bar: Brand + Language/Theme Controls */}
      <header className="w-full max-w-xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="size-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <BrandLogo className="size-6" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-black tracking-tight text-foreground truncate">
              PhysioRecord
            </p>
            <p className="text-xs text-muted-foreground-1 truncate">
              {bi(
                'نظام عيادات العلاج الطبيعي المحلي',
                'Local-First Physical Therapy EHR',
                'سیستەمی ناوخۆیی کلینیکی چارەسەری سروشتی'
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <LanguageSwitcher compact />
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={bi('تبديل المظهر', 'Toggle theme', 'گۆڕینی ڕووکار')}
            className="size-9 rounded-xl bg-layer border border-card-line hover:bg-layer-hover text-foreground inline-flex items-center justify-center cursor-pointer transition-colors"
          >
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
        </div>
      </header>

      {/* Main Centered Gate Card */}
      <main className="w-full max-w-xl mx-auto my-6">
        <section className="rounded-3xl bg-layer border border-card-line shadow-xl overflow-hidden">
          {/* Emerald Header */}
          <div className="bg-primary text-primary-foreground px-5 py-6 sm:px-7 sm:py-7">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-foreground/15 text-primary-foreground text-xs font-bold mb-3">
              {mode === 'ios-safari-install' && (
                <>
                  <Smartphone className="size-3.5 shrink-0" />
                  <span>
                    {bi(
                      'iPhone و iPad · تثبيت محلي دائم',
                      'iPhone & iPad · Permanent Local Install',
                      'iPhone و iPad · دامەزراندنی ناوخۆیی هەمیشەیی'
                    )}
                  </span>
                </>
              )}
              {mode === 'ios-open-in-safari' && (
                <>
                  <Compass className="size-3.5 shrink-0" />
                  <span>
                    {bi(
                      'iPhone و iPad · افتحه في Safari أولاً',
                      'iPhone & iPad · Open in Safari First',
                      'iPhone و iPad · سەرەتا لە Safari بیکەرەوە'
                    )}
                  </span>
                </>
              )}
              {mode === 'macos-install-app' && (
                <>
                  <Laptop className="size-3.5 shrink-0" />
                  <span>
                    {bi(
                      'macOS (Mac) · تثبيت كتطبيق مستقل على الجهاز',
                      'macOS (Mac) · Standalone Local Mac App',
                      'macOS (Mac) · دامەزراندن وەک ئەپی سەربەخۆ لەسەر Mac'
                    )}
                  </span>
                </>
              )}
              {mode === 'android-download-apk' && (
                <>
                  <Smartphone className="size-3.5 shrink-0" />
                  <span>
                    {bi(
                      'Android · التطبيق الرسمي المثبّت',
                      'Android · Official Native App',
                      'Android · ئەپی فەرمیی دامەزراو'
                    )}
                  </span>
                </>
              )}
              {mode === 'desktop-download-app' && (
                <>
                  <Laptop className="size-3.5 shrink-0" />
                  <span>
                    {bi(
                      'الكمبيوتر · النسخة المكتبية المحلية',
                      'Desktop · Official Local App',
                      'کۆمپیوتەر · وەشانی فەرمیی ناوخۆیی'
                    )}
                  </span>
                </>
              )}
            </div>

            <h1 className="text-xl sm:text-2xl font-black leading-snug">
              {mode === 'ios-safari-install' &&
                bi(
                  'ثبّت PhysioRecord على الشاشة الرئيسية قبل البدء',
                  'Add PhysioRecord to Home Screen Before Starting',
                  'سەرەتا PhysioRecord بۆ شاشەی سەرەکی زیاد بکە'
                )}
              {mode === 'ios-open-in-safari' &&
                bi(
                  'افتح هذا الرابط في متصفح Safari لتثبيت التطبيق',
                  'Open This Link in Safari to Install the App',
                  'ئەم بەستەرە لە Safari بکەرەوە بۆ دامەزراندن'
                )}
              {mode === 'macos-install-app' &&
                bi(
                  'ثبّت PhysioRecord كتطبيق مستقل على جهاز Mac قبل البدء',
                  'Install PhysioRecord as a Standalone Mac App First',
                  'سەرەتا PhysioRecord وەک ئەپی سەربەخۆ لەسەر Mac دابمەزرێنە'
                )}
              {mode === 'android-download-apk' &&
                bi(
                  'حمّل تطبيق PhysioRecord الرسمي للأندرويد',
                  'Download the Official PhysioRecord Android App',
                  'ئەپی فەرمیی PhysioRecord بۆ ئەندرۆید دابگرە'
                )}
              {mode === 'desktop-download-app' &&
                bi(
                  desktopOs === 'windows'
                    ? 'حمّل نسخة PhysioRecord الرسمية للويندوز'
                    : 'استخدم النسخة المحلية الرسمية لجهازك',
                  desktopOs === 'windows'
                    ? 'Download the Official PhysioRecord Windows App'
                    : 'Use the Official Local App for Your Device',
                  'وەشانی فەرمیی PhysioRecord بۆ کۆمپیوتەر دابگرە'
                )}
            </h1>

            <p className="text-xs sm:text-sm text-primary-foreground/90 mt-2 leading-relaxed">
              {mode === 'ios-safari-install' &&
                bi(
                  'لأن التطبيق محلي 100% ولا يرفع بيانات المرضى لأي سيرفر، يمنع التسجيل داخل تبويب Safari العادي لأن نظام iOS يمسح بيانات التبويبات بعد 7 أيام من عدم فتحها.',
                  'Because PhysioRecord is 100% local and never uploads patient data to a server, regular Safari tabs are blocked to protect you from iOS deleting tab storage after 7 days of inactivity.',
                  'چونکە ئەپەکە ١٠٠٪ ناوخۆییە و زانیاریی نەخۆشەکان نانێرێتە هیچ سێرڤەرێک، تۆمارکردن لە تابی ئاسایی Safari ڕێگری لێ دەکرێت تا سیستەمی iOS دوای ٧ ڕۆژ زانیارییەکان نەسڕێتەوە.'
                )}
              {mode === 'ios-open-in-safari' &&
                bi(
                  'نظام iOS لا يسمح لأي متصفح غير Safari (مثل Chrome أو Edge أو Firefox أو Brave أو Opera أو المتصفح الداخلي للواتساب وتيليغرام وإنستغرام) بتثبيت تطبيقات مستقلة أوفلاين — فقط Safari يوفّر التثبيت الدائم والمحمي.',
                  'iOS only allows Apple Safari to install standalone offline web apps with protected local storage. Other browsers (Chrome, Edge, Firefox, Brave, Opera, WhatsApp, Telegram, Instagram, etc.) cannot complete this step.',
                  'سیستەمی iOS تەنها ڕێگە بە Safari دەدات ئەپە سەربەخۆکانی ئۆفلاین دابمەزرێنێت، وێبگەڕەکانی تر ناتوانن ئەم هەنگاوە تەواو بکەن.'
                )}
              {mode === 'macos-install-app' &&
                bi(
                  'أجهزة Mac لا تحتاج نسخة الويندوز (.exe) — يمكنك تثبيت PhysioRecord كتطبيق Mac مستقل تماماً في شريط Dock بمساحة تخزين محلية محمية ويعمل أوفلاين 100% ومجاناً مدى الحياة.',
                  'Mac does not use the Windows (.exe) installer — install PhysioRecord directly as a standalone local Mac app in your Dock for protected offline storage and automatic free updates.',
                  'ئامێرەکانی Mac پێویستیان بە وەشانی ویندۆز (.exe) نییە — دەتوانیت PhysioRecord وەک ئەپێکی سەربەخۆی ناوخۆیی لە شریتی Dock دابمەزرێنیت و ١٠٠٪ ئۆفلاین کار دەکات.'
                )}
              {mode === 'android-download-apk' &&
                bi(
                  'هذا الرابط مخصص لتثبيت التطبيق على أجهزة Apple فقط (iPhone و iPad و Mac). لمستخدمي الأندرويد، نوفر تطبيق APK رسمي مجاني يعمل محلياً وأوفلاين بالكامل مع دعم البصمة.',
                  'This web URL is reserved exclusively for installing PhysioRecord on Apple devices (iPhone, iPad & Mac). On Android, install the free official APK for full offline speed, local storage, and biometrics.',
                  'ئەم بەستەرە تایبەتە بە دامەزراندنی ئەپەکە لەسەر ئامێرەکانی Apple. بۆ ئەندرۆید، فایلی APKی فەرمی و بێبەرامبەر دابگرە.'
                )}
              {mode === 'desktop-download-app' &&
                bi(
                  'للحفاظ على سرية بيانات عيادتك بشكل محلي 100% بدون قيود المتصفح، هذا الرابط مخصص لتثبيت نسخة أجهزة Apple فقط. لنظام Windows استخدم النسخة المكتبية الرسمية المجانية (.exe).',
                  'To keep clinical records 100% local without browser limits, this web link is reserved for Apple devices. On Windows, please install the free official Desktop release (.exe).',
                  'بۆ پاراستنی نهێنیی زانیارییەکان بە شێوەی ناوخۆیی، بۆ ویندۆز وەشانی فەرمیی دێسکتۆپ (.exe) دابگرە.'
                )}
            </p>
          </div>

          {/* Body Content Per Platform */}
          <div className="p-5 sm:p-7 space-y-4 text-xs">
            {/* Case 1: iPhone/iPad Safari — 3 visual install steps */}
            {mode === 'ios-safari-install' && (
              <ol className="space-y-2.5">
                <li className="flex items-start gap-3 p-3.5 rounded-2xl bg-surface border border-card-line">
                  <span className="size-7 rounded-xl bg-primary/15 text-primary font-black text-xs inline-flex items-center justify-center shrink-0">
                    1
                  </span>
                  <div className="space-y-1 min-w-0">
                    <p className="font-bold text-foreground flex items-center gap-1.5">
                      <Share className="size-4 text-primary shrink-0" />
                      <span>
                        {bi(
                          'اضغط زر المشاركة (Share) أسفل شاشة Safari',
                          'Tap the Share button at the bottom of Safari',
                          'دوگمەی هاوبەشکردن (Share) لە خوارەوەی Safari دابگرە'
                        )}
                      </span>
                    </p>
                    <p className="text-muted-foreground-1 leading-relaxed">
                      {bi(
                        'أيقونة المربع الذي يخرج منه سهم للأعلى في شريط Safari السفلي (أو العلوي في الآيباد).',
                        'Look for the square icon with an upward arrow in the Safari toolbar.',
                        'ئایکۆنی چوارگۆشەکە کە تیری بەرەو سەرەوەی تێدایە.'
                      )}
                    </p>
                  </div>
                </li>

                <li className="flex items-start gap-3 p-3.5 rounded-2xl bg-surface border border-card-line">
                  <span className="size-7 rounded-xl bg-primary/15 text-primary font-black text-xs inline-flex items-center justify-center shrink-0">
                    2
                  </span>
                  <div className="space-y-1 min-w-0">
                    <p className="font-bold text-foreground flex items-center gap-1.5">
                      <PlusSquare className="size-4 text-primary shrink-0" />
                      <span>
                        {bi(
                          'اختر «إضافة إلى الشاشة الرئيسية» ثم اضغط «إضافة»',
                          'Select "Add to Home Screen", then tap "Add"',
                          '«زیادکردن بۆ شاشەی سەرەکی» هەڵبژێرە پاشان «زیادکردن» دابگرە'
                        )}
                      </span>
                    </p>
                    <p className="text-muted-foreground-1 leading-relaxed">
                      {bi(
                        'مرّر القائمة للأسفل قليلاً إذا لم يظهر الخيار فوراً.',
                        'Scroll down slightly in the share sheet if it is not immediately visible.',
                        'کەمێک لیستەکە بەرەو خوارەوە ببە ئەگەر یەکسەر دەرنەکەوت.'
                      )}
                    </p>
                  </div>
                </li>

                <li className="flex items-start gap-3 p-3.5 rounded-2xl bg-surface border border-card-line">
                  <span className="size-7 rounded-xl bg-primary/15 text-primary font-black text-xs inline-flex items-center justify-center shrink-0">
                    3
                  </span>
                  <div className="space-y-1 min-w-0">
                    <p className="font-bold text-foreground flex items-center gap-1.5">
                      <Smartphone className="size-4 text-primary shrink-0" />
                      <span>
                        {bi(
                          'أغلق Safari وافتح PhysioRecord من الأيقونة الجديدة',
                          'Close Safari and launch PhysioRecord from its new icon',
                          'Safari دابخە و PhysioRecord لە ئایکۆنە نوێیەکە بکەرەوە'
                        )}
                      </span>
                    </p>
                    <p className="text-muted-foreground-1 leading-relaxed">
                      {bi(
                        'سيفتح مباشرة بملء الشاشة لإنشاء خزينتك المشفرة محلياً بدون إنترنت وبحماية كاملة.',
                        'It opens full-screen so you can create your encrypted local vault with full offline protection.',
                        'بە تەواویی شاشە دەکرێتەوە بۆ دروستکردنی خەزێنە نهێنیکراوەکەت بەبێ ئینتەرنێت.'
                      )}
                    </p>
                  </div>
                </li>
              </ol>
            )}

            {/* Case 2: iPhone/iPad ANY non-Safari browser -> Copy Link & Open in Safari */}
            {mode === 'ios-open-in-safari' && (
              <div className="space-y-3.5">
                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/35 border border-amber-300/70 dark:border-amber-800/70 space-y-3">
                  <p className="font-bold text-amber-950 dark:text-amber-100 leading-relaxed">
                    {bi(
                      'الخطوة 1: انسخ الرابط أدناه ثم افتح تطبيق Safari والصقه في شريط العنوان:',
                      'Step 1: Copy the link below, open Apple Safari, and paste it in the address bar:',
                      'هەنگاوی ١: ئەم بەستەرە کۆپی بکە، پاشان Safari بکەرەوە و لە شریتی ناونیشان دایبنێ:'
                    )}
                  </p>

                  <div className="flex items-center gap-2">
                    <input
                      id="ios-gate-url-input"
                      type="text"
                      readOnly
                      dir="ltr"
                      value={currentUrl}
                      aria-label={bi('رابط التطبيق', 'App URL', 'بەستەری ئەپ')}
                      className="flex-1 min-w-0 h-10 px-3 rounded-xl bg-layer border border-card-line font-mono text-xs text-foreground select-all"
                    />
                  </div>

                  <button
                    type="button"
                    data-testid="gate-copy-safari-url-btn"
                    onClick={handleCopyUrl}
                    className="w-full h-11 px-4 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground font-bold text-sm inline-flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-xs"
                  >
                    {copiedUrl ? (
                      <>
                        <Check className="size-4 shrink-0" />
                        <span>
                          {bi(
                            'تم نسخ الرابط — افتح Safari الآن والصقه',
                            'Link Copied — Open Safari & Paste It',
                            'بەستەر کۆپی کرا — ئێستا لە Safari دایبنێ'
                          )}
                        </span>
                      </>
                    ) : (
                      <>
                        <Copy className="size-4 shrink-0" />
                        <span>
                          {bi(
                            'نسخ الرابط لفتحه في Safari',
                            'Copy Link to Open in Safari',
                            'کۆپیکردنی بەستەر بۆ کردنەوە لە Safari'
                          )}
                        </span>
                      </>
                    )}
                  </button>
                </div>

                <div className="p-3.5 rounded-2xl bg-surface border border-card-line space-y-1.5 text-muted-foreground-1 leading-relaxed">
                  <p className="font-bold text-foreground">
                    {bi(
                      'الخطوة 2 (داخل Safari):',
                      'Step 2 (Inside Safari):',
                      'هەنگاوی ٢ (لەناو Safari):'
                    )}
                  </p>
                  <p>
                    {bi(
                      'اضغط زر المشاركة (Share) ← «إضافة إلى الشاشة الرئيسية» ← «إضافة»، ثم افتح التطبيق دائماً من أيقونته على الشاشة الرئيسية.',
                      'Tap Share -> "Add to Home Screen" -> "Add", then always launch PhysioRecord from its Home Screen icon.',
                      'دوگمەی Share دابگرە ← «زیادکردن بۆ شاشەی سەرەکی» ← «زیادکردن».'
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* Case 3: macOS (MacBook / iMac) -> Standalone Dock App / 1-click Chromium Install */}
            {mode === 'macos-install-app' && (
              <div className="space-y-3.5">
                {canInstallPrompt && onTriggerInstallPrompt && (
                  <button
                    type="button"
                    data-testid="gate-macos-install-now-btn"
                    onClick={onTriggerInstallPrompt}
                    className="w-full min-h-[48px] px-5 py-3 rounded-2xl bg-primary hover:bg-primary-hover text-primary-foreground font-bold text-sm inline-flex items-center justify-center gap-2.5 cursor-pointer transition-colors shadow-sm"
                  >
                    <Download className="size-4 shrink-0" />
                    <span>
                      {bi(
                        'تثبيت PhysioRecord كتطبيق مستقل على Mac الآن',
                        'Install PhysioRecord as a Standalone Mac App Now',
                        'دامەزراندنی PhysioRecord وەک ئەپی سەربەخۆ لەسەر Mac ئێستا'
                      )}
                    </span>
                  </button>
                )}

                <ol className="space-y-2.5">
                  <li className="flex items-start gap-3 p-3.5 rounded-2xl bg-surface border border-card-line">
                    <span className="size-7 rounded-xl bg-primary/15 text-primary font-black text-xs inline-flex items-center justify-center shrink-0">
                      1
                    </span>
                    <div className="space-y-1 min-w-0">
                      <p className="font-bold text-foreground">
                        {isMacSafari
                          ? bi(
                              'في شريط Safari العلوي اضغط «ملف» (File) ← «إضافة إلى شريط الأيقونات» (Add to Dock)',
                              'In the Safari menu bar, click File -> "Add to Dock"',
                              'لە مینیوی سەرەوەی Safari دوگمەی File ← Add to Dock دابگرە'
                            )
                          : bi(
                              'اضغط أيقونة التثبيت في شريط العنوان أو افتح الرابط في Safari (macOS 14+)',
                              'Click the Install icon in the address bar — or open this link in Safari (macOS 14+)',
                              'ئایکۆنی دامەزراندن لە شریتی ناونیشان دابگرە یان لە Safari بیکەرەوە'
                            )}
                      </p>
                      <p className="text-muted-foreground-1 leading-relaxed">
                        {isMacSafari
                          ? bi(
                              'متوفر في macOS Sonoma 14 فأحدث — أو يمكنك الضغط على زر المشاركة (Share) أعلى يمين Safari ثم «Add to Dock».',
                              'Available on macOS Sonoma 14+ — or click the Share button in Safari toolbar -> "Add to Dock".',
                              'لەسەر macOS 14 و نوێتر بەردەستە.'
                            )
                          : bi(
                              'في Chrome أو Edge أو Brave ستجد أيقونة التثبيت (Install PhysioRecord) في طرف شريط العنوان، أو افتحه في Safari واختر File ← Add to Dock.',
                              'In Chrome, Edge, or Brave click the Install icon in the address bar; in Safari choose File -> Add to Dock.',
                              'لە Chrome و Edge و Brave ئایکۆنی دامەزراندن لە شریتی ناونیشاندایە.'
                            )}
                      </p>
                    </div>
                  </li>

                  <li className="flex items-start gap-3 p-3.5 rounded-2xl bg-surface border border-card-line">
                    <span className="size-7 rounded-xl bg-primary/15 text-primary font-black text-xs inline-flex items-center justify-center shrink-0">
                      2
                    </span>
                    <div className="space-y-1 min-w-0">
                      <p className="font-bold text-foreground">
                        {bi(
                          'أغلق تبويب المتصفح وافتح PhysioRecord من شريط Dock أو التطبيقات',
                          'Close the browser tab and launch PhysioRecord from your Dock or Applications',
                          'تابی وێبگەڕ دابخە و PhysioRecord لە Dock بکەرەوە'
                        )}
                      </p>
                      <p className="text-muted-foreground-1 leading-relaxed">
                        {bi(
                          'سيعمل بنافذة مستقلة بالكامل مع دعم Touch ID وتشفير محلي AES-256 وعمل أوفلاين 100% وتحديثات تلقائية مجانية.',
                          'Runs in its own standalone Mac window with Touch ID support, local AES-256 encryption, 100% offline access, and free auto-updates.',
                          'لە پەنجەرەیەکی سەربەخۆدا کار دەکات بە پشتگیری Touch ID و کارکردنی ١٠٠٪ ئۆفلاین.'
                        )}
                      </p>
                    </div>
                  </li>
                </ol>
              </div>
            )}

            {/* Case 4 & 5: Android Browser or Windows/Desktop Browser -> Official Releases Download */}
            {(mode === 'android-download-apk' || mode === 'desktop-download-app') && (
              <div className="space-y-3.5">
                <a
                  href={OFFICIAL_LATEST_RELEASE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="gate-official-download-link"
                  className="w-full min-h-[48px] px-5 py-3 rounded-2xl bg-primary hover:bg-primary-hover text-primary-foreground font-bold text-sm inline-flex items-center justify-center gap-2.5 transition-colors shadow-sm"
                >
                  <Download className="size-4 shrink-0" />
                  <span>
                    {mode === 'android-download-apk'
                      ? bi(
                          'تحميل تطبيق الأندرويد الرسمي (.apk) مجاناً',
                          'Download Official Android App (.apk) — Free',
                          'داگرتنی ئەپی فەرمیی ئەندرۆید (.apk) — بێبەرامبەر'
                        )
                      : desktopOs === 'windows'
                        ? bi(
                            'تحميل نسخة الويندوز الرسمية (.exe) مجاناً',
                            'Download Official Windows App (.exe) — Free',
                            'داگرتنی وەشانی فەرمیی ویندۆز (.exe) — بێبەرامبەر'
                          )
                        : bi(
                            'عرض الإصدارات الرسمية على GitHub Releases',
                            'View Official Releases on GitHub',
                            'بینینی وەشانە فەرمییەکان لە GitHub'
                          )}
                  </span>
                  <ExternalLink className="size-3.5 opacity-80 shrink-0" />
                </a>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="p-3.5 rounded-2xl bg-surface border border-card-line flex items-start gap-2.5">
                    <HardDrive className="size-4 text-primary shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <p className="font-bold text-foreground">
                        {bi(
                          'بياناتك تبقى على جهازك 100%',
                          '100% Local on Your Device',
                          'زانیارییەکانت ١٠٠٪ لەسەر ئامێرەکەت دەمێننەوە'
                        )}
                      </p>
                      <p className="text-muted-foreground-1 leading-relaxed">
                        {bi(
                          'تشفير AES-256 محلي بدون سيرفر وبدون أي اشتراك شهري.',
                          'Local AES-256 vault with zero servers and zero subscriptions.',
                          'نهێنیکردنی ناوخۆیی AES-256 بەبێ سێرڤەر و بەبێ هیچ بەشدارییەکی مانگانە.'
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-surface border border-card-line flex items-start gap-2.5">
                    <WifiOff className="size-4 text-primary shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <p className="font-bold text-foreground">
                        {bi(
                          'عمل أوفلاين كامل ومستقر',
                          'Full Offline Reliability',
                          'کارکردنی تەواو و جێگیر بەبێ ئینتەرنێت'
                        )}
                      </p>
                      <p className="text-muted-foreground-1 leading-relaxed">
                        {bi(
                          'لا يتأثر بمسح ذاكرة المتصفح ويحافظ على ملفات المرضى بأمان.',
                          'Immune to browser cache clears and tab storage limits.',
                          'کاریگەر نابێت بە سڕینەوەی بیرگەی وێبگەڕ و فایلەکانی نەخۆش بە سەلامەتی دەپارێزێت.'
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Shared Trust Strip */}
            <div className="pt-2 border-t border-card-divider flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground-1">
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <Lock className="size-3.5 text-primary" />
                {bi('تشفير AES-256 محلي', 'Local AES-256 Vault', 'نهێنیکردنی ناوخۆیی AES-256')}
              </span>
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <WifiOff className="size-3.5 text-primary" />
                {bi('أوفلاين 100%', '100% Offline', '١٠٠٪ ئۆفلاین')}
              </span>
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <RefreshCw className="size-3.5 text-primary" />
                {bi('تحديثات تلقائية مجانية', 'Free Auto Updates', 'نوێکردنەوەی خۆکاری بێبەرامبەر')}
              </span>
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <ShieldCheck className="size-3.5 text-primary" />
                {bi('مجاني ومفتوح المصدر', 'Free & Open Source', 'بێبەرامبەر و سەرچاوەکراوە')}
              </span>
            </div>

            {/* Emergency Rescue Hatch ONLY if a pre-existing encrypted vault is already in this browser */}
            {hasExistingVault && (
              <div className="pt-2 border-t border-card-divider text-center">
                <button
                  type="button"
                  data-testid="gate-existing-vault-rescue-btn"
                  onClick={onAllowExistingVaultBackup}
                  className="text-xs font-bold text-primary hover:underline cursor-pointer"
                >
                  {bi(
                    'لدي خزينة محلية سابقة في هذا المتصفح — فتحها لأخذ نسخة احتياطية (.ptbackup)',
                    'I have an existing local vault in this browser — unlock to export a .ptbackup',
                    'خەزێنەیەکی ناوخۆیی پێشترم لەم وێبگەڕەدا هەیە — کردنەوە بۆ وەرگرتنی کۆپی یەدەگ'
                  )}
                </button>
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="w-full max-w-xl mx-auto text-center text-xs text-muted-foreground-1">
        {bi(
          'PhysioRecord — كل بيانات المرضى تبقى محلية ومشفرة داخل جهاز العيادة فقط.',
          'PhysioRecord — All clinical records stay encrypted locally on your clinic device.',
          'PhysioRecord — هەموو زانیارییەکانی نەخۆش بە نهێنیکراوی و ناوخۆیی لەناو ئامێری کلینیکەکەت دەمێننەوە.'
        )}
      </footer>
    </div>
  );
};
