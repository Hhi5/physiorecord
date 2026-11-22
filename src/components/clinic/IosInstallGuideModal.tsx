// =======================================================================
// PhysioRecord — Guided iPhone & iPad (iOS) Standalone Install Modal
// Provides clear, durable, zero-expiry Home Screen PWA setup instructions
// plus long-term storage protection & Face ID / encrypted sync guidance.
// =======================================================================

import React, { useState } from 'react';
import {
  Check,
  CheckCircle2,
  Cloud,
  Compass,
  Copy,
  Fingerprint,
  HardDrive,
  PlusSquare,
  Share,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { usePwaStatus } from '../../pwa/pwaClient';
import { ModalDialog } from '../ui/Dialog';

interface IosInstallGuideModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenBackup?: () => void;
}

export const IosInstallGuideModal: React.FC<IosInstallGuideModalProps> = ({
  isOpen,
  onOpenChange,
  onOpenBackup,
}) => {
  const { isRtl, bi } = useLanguage();
  const pwa = usePwaStatus();
  const [copiedUrl, setCopiedUrl] = useState(false);

  const currentUrl =
    typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '';

  const handleCopyLink = async () => {
    if (!currentUrl) return;
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 2500);
    } catch {
      // Clipboard may be unavailable in restricted contexts
    }
  };

  return (
    <ModalDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      dir={isRtl ? 'rtl' : 'ltr'}
      size="md"
      title={bi(
        'تثبيت PhysioRecord على iPhone و iPad',
        'Install PhysioRecord on iPhone & iPad',
        'دامەزراندنی PhysioRecord لەسەر iPhone و iPad'
      )}
      subtitle={bi(
        'تثبيت دائم ومجاني على الشاشة الرئيسية — يعمل أوفلاين بالكامل وبدون انتهاء صلاحية',
        'Permanent, free Home Screen installation — full offline support with zero 7-day expiry',
        'دامەزراندنی هەمیشەیی و بێبەرامبەر لەسەر شاشەی سەرەکی — کاردەکات بەبێ ئینتەرنێت'
      )}
      closeLabel={bi('إغلاق', 'Close', 'داخستن')}
      footer={
        <div className="w-full flex flex-wrap items-center justify-between gap-2">
          {onOpenBackup ? (
            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                onOpenBackup();
              }}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-layer hover:bg-layer-hover border border-layer-line text-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <HardDrive className="size-3.5 text-primary" />
              <span>{bi('النسخ الاحتياطي والمزامنة', 'Backup & Sync', 'پاشەکەوت و هاوکاتکردن')}</span>
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="min-h-[40px] px-5 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold cursor-pointer"
          >
            {bi('فهمت', 'Got it', 'تێگەیشتم')}
          </button>
        </div>
      }
    >
      <div data-testid="ios-install-guide-modal" className="space-y-4 text-xs">
        {/* Status pill */}
        {pwa.isStandalone && pwa.isIosDevice ? (
          <div className="p-3 rounded-xl bg-emerald-500/12 border border-emerald-500/30 flex items-center gap-2.5 text-emerald-800 dark:text-emerald-300 font-bold">
            <CheckCircle2 className="size-4 shrink-0" />
            <span>
              {bi(
                'ممتاز! التطبيق مثبّت بالفعل على الشاشة الرئيسية ويعمل بوضع التطبيق المستقل.',
                'Great! PhysioRecord is already installed on your Home Screen in standalone mode.',
                'نایابە! ئەپەکە پێشتر لەسەر شاشەی سەرەکی دامەزراوە.'
              )}
            </span>
          </div>
        ) : pwa.isIosOtherBrowser ? (
          <div className="p-3 rounded-xl bg-amber-500/12 border border-amber-500/30 space-y-2">
            <div className="flex items-start gap-2 text-amber-900 dark:text-amber-300 font-bold">
              <Compass className="size-4 shrink-0 mt-0.5" />
              <span>
                {bi(
                  'أنت تفتح التطبيق من متصفح آخر غير Safari. لأفضل ثبات وتثبيت نظيف على الآيفون، افتح نفس الرابط داخل متصفح Safari:',
                  'You are using a non-Safari browser on iOS. For the cleanest Home Screen installation, open this link in Safari:',
                  'تۆ ئەپەکە لە وێبگەڕێکی ترەوە دەکەیتەوە. بۆ باشترین دامەزراندن، هەمان لینک لە Safari بکەرەوە:'
                )}
              </span>
            </div>
            {currentUrl && (
              <button
                type="button"
                data-testid="ios-copy-safari-link-btn"
                onClick={() => void handleCopyLink()}
                className="min-h-[38px] px-3 py-1.5 rounded-lg bg-card hover:bg-layer-hover border border-line-2 text-foreground font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                {copiedUrl ? (
                  <Check className="size-3.5 text-emerald-600" />
                ) : (
                  <Copy className="size-3.5 text-primary" />
                )}
                <span>
                  {copiedUrl
                    ? bi('تم نسخ الرابط — الصقه في Safari', 'Link copied — paste in Safari', 'لینک کۆپی کرا')
                    : bi('نسخ رابط التطبيق لفتحه في Safari', 'Copy App Link for Safari', 'کۆپیکردنی لینک بۆ Safari')}
                </span>
              </button>
            )}
          </div>
        ) : null}

        {/* 3 Clear Steps */}
        <ol className="space-y-2.5">
          <li className="p-3 rounded-xl bg-surface border border-line-2 flex items-start gap-3">
            <span className="size-7 rounded-lg bg-primary/12 text-primary font-extrabold inline-flex items-center justify-center shrink-0">
              1
            </span>
            <div className="space-y-0.5 min-w-0">
              <div className="font-bold text-foreground flex items-center gap-1.5">
                <Compass className="size-3.5 text-primary shrink-0" />
                <span>
                  {bi(
                    'افتح رابط التطبيق في متصفح Safari على iPhone أو iPad',
                    'Open the app link in Safari on your iPhone or iPad',
                    'لینکی ئەپەکە لە وێبگەڕی Safari لەسەر iPhone یان iPad بکەرەوە'
                  )}
                </span>
              </div>
              <p className="text-muted-foreground-1 leading-relaxed">
                {bi(
                  'تأكد من فتح الرابط مباشرة (وليس داخل تطبيق واتساب أو تيليغرام) حتى يظهر زر التثبيت.',
                  'Open directly in Safari (not inside WhatsApp or Telegram in-app browsers) so Home Screen install appears.',
                  'دڵنیابە لینکەکە ڕاستەوخۆ لە Safari کراوەتەوە (نەک لە ناو واتساپ یان تێلیگرام).'
                )}
              </p>
            </div>
          </li>

          <li className="p-3 rounded-xl bg-surface border border-line-2 flex items-start gap-3">
            <span className="size-7 rounded-lg bg-primary/12 text-primary font-extrabold inline-flex items-center justify-center shrink-0">
              2
            </span>
            <div className="space-y-0.5 min-w-0">
              <div className="font-bold text-foreground flex items-center gap-1.5">
                <Share className="size-3.5 text-primary shrink-0" />
                <span>
                  {bi(
                    'اضغط زر المشاركة (Share) أسفل الشاشة ثم اختر «إضافة إلى الشاشة الرئيسية»',
                    'Tap the Share icon, scroll down, and tap "Add to Home Screen"',
                    'دوگمەی هاوبەشکردن (Share) دابگرە و «زیادکردن بۆ شاشەی سەرەکی» هەڵبژێرە'
                  )}
                </span>
              </div>
              <p className="text-muted-foreground-1 leading-relaxed">
                {bi(
                  'ستجد خيار «إضافة إلى الشاشة الرئيسية» بجانب أيقونة المربع وبداخله علامة (+) ثم اضغط «إضافة» بالأعلى.',
                  'Look for the square (+) "Add to Home Screen" action, then tap "Add" in the top corner.',
                  'بژاردەی (+) Add to Home Screen هەڵبژێرە و دواتر Add دابگرە.'
                )}
              </p>
            </div>
          </li>

          <li className="p-3 rounded-xl bg-surface border border-line-2 flex items-start gap-3">
            <span className="size-7 rounded-lg bg-primary/12 text-primary font-extrabold inline-flex items-center justify-center shrink-0">
              3
            </span>
            <div className="space-y-0.5 min-w-0">
              <div className="font-bold text-foreground flex items-center gap-1.5">
                <PlusSquare className="size-3.5 text-primary shrink-0" />
                <span>
                  {bi(
                    'افتح PhysioRecord دائماً من أيقونة الشاشة الرئيسية',
                    'Always launch PhysioRecord from its Home Screen icon',
                    'هەمیشە PhysioRecord لە ئایکۆنی شاشەی سەرەکییەوە بکەرەوە'
                  )}
                </span>
              </div>
              <p className="text-muted-foreground-1 leading-relaxed">
                {bi(
                  'سيعمل بملء الشاشة كتطبيق مستقل بدون شريط المتصفح، يعمل بدون إنترنت، ويتحدّث تلقائياً عند توفر نسخة جديدة.',
                  'Launches full-screen with no browser chrome, works 100% offline, and updates seamlessly in-place.',
                  'بە شاشەی تەواو و بێ هێڵی وێبگەڕ کاردەکات، بەبێ ئینتەرنێت دەبێت و خۆکار نوێ دەبێتەوە.'
                )}
              </p>
            </div>
          </li>
        </ol>

        {/* Durability & Security guarantees on iPhone */}
        <div className="p-3.5 rounded-xl bg-primary/8 border border-primary/20 space-y-2">
          <div className="font-bold text-primary flex items-center gap-1.5">
            <ShieldCheck className="size-4 shrink-0" />
            <span>
              {bi(
                'لماذا التثبيت على الشاشة الرئيسية مهم جداً على الآيفون؟',
                'Why Home Screen Installation Matters on iPhone & iPad',
                'بۆچی دامەزراندن لەسەر شاشەی سەرەکی گرنگە لەسەر iPhone؟'
              )}
            </span>
          </div>
          <ul className="space-y-1.5 text-muted-foreground-1 leading-relaxed">
            <li className="flex items-start gap-2">
              <Smartphone className="size-3.5 text-primary shrink-0 mt-0.5" />
              <span>
                {bi(
                  'حماية التخزين المحلي: نظام iOS قد يمسح بيانات تبويبات Safari العادية بعد 7 أيام من عدم فتحها، بينما التطبيق المثبّت على الشاشة الرئيسية يحصل على مساحة تخزين مستقلة ومحمية.',
                  'Storage protection: iOS can evict plain Safari tab storage after 7 inactive days, whereas a Home Screen PWA gets isolated, persistent storage.',
                  'پاراستنی کۆگا: سیستەمی iOS ئەپە دامەزراوەکانی شاشەی سەرەکی دەپارێزێت لە سڕینەوەی خۆکاری دوای ٧ ڕۆژ.'
                )}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Fingerprint className="size-3.5 text-primary shrink-0 mt-0.5" />
              <span>
                {bi(
                  'دعم Face ID و Touch ID: يمكنك تفعيل الفتح السريع بالوجه أو البصمة من الإعدادات ← الأمان على iOS 18+.',
                  'Face ID & Touch ID: enable biometric Passkey unlock in Settings → Security on iOS 18+.',
                  'پشتگیری Face ID و Touch ID لە ڕێکخستنەکان ← ئاسایش.'
                )}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Cloud className="size-3.5 text-primary shrink-0 mt-0.5" />
              <span>
                {bi(
                  'مزامنة طويلة الأمد مع الحاسوب والأندرويد: فعّل مزامنة Google Drive المشفرة (أو حفظ ملف .ptbackup) لتتزامن سجلاتك تلقائياً بين الويندوز والأندرويد والآيفون بأمان تام.',
                  'Long-term cross-device sync: enable E2EE Google Drive sync (or .ptbackup files) to keep Windows, Android, and iPhone seamlessly synchronized.',
                  'هاوکاتکردنی هەمیشەیی لەگەڵ کۆمپیوتەر و ئەندرۆید بە Google Driveی کۆدکراو.'
                )}
              </span>
            </li>
          </ul>
        </div>
      </div>
    </ModalDialog>
  );
};
