// =======================================================================
// PhysioRecord — Phase A5: Instant Privacy Cover Overlay (`Esc` twice / Header)
// Blanks clinical data visually when someone approaches the desk, without wiping
// the unlocked DEK; clinician can Resume or Lock Vault in one tap.
// =======================================================================

import React from 'react';
import { Eye, Lock, Shield } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface PrivacyCoverOverlayProps {
  isOpen: boolean;
  onResume: () => void;
  onLockVault: () => void;
}

export const PrivacyCoverOverlay: React.FC<PrivacyCoverOverlayProps> = ({
  isOpen,
  onResume,
  onLockVault,
}) => {
  const { bi, isRtl } = useLanguage();
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={bi('وضع ستار الخصوصية', 'Privacy Cover Active', 'داپۆشەری نهێنی چالاکە')}
      dir={isRtl ? 'rtl' : 'ltr'}
      data-testid="privacy-cover-overlay"
      className="fixed inset-0 z-[90] bg-slate-950/90 backdrop-blur-3xl flex items-center justify-center p-6 text-slate-100 select-none"
      style={{
        backdropFilter: 'blur(40px) saturate(0.2)',
        WebkitBackdropFilter: 'blur(40px) saturate(0.2)',
      }}
    >
      <div className="max-w-md w-full rounded-3xl bg-slate-900 border border-slate-700/80 p-7 text-center space-y-5 shadow-2xl">
        <div className="mx-auto size-16 rounded-2xl bg-primary/20 border border-primary/40 flex items-center justify-center">
          <Shield className="size-8 text-primary" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-extrabold text-white">
            {bi(
              'ستار الخصوصية مفعّل',
              'Privacy Cover Active',
              'داپۆشەری نهێنی چالاکە'
            )}
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            {bi(
              'تم إخفاء السجلات السريرية مؤقتاً عن الشاشة لحماية خصوصية المرضى. اضغط متابعة للعودة فوراً أو اقفل الخزينة كلياً.',
              'Clinical records are temporarily hidden to protect patient privacy. Resume immediately or lock the encrypted vault.',
              'تۆمارە کلینیکییەکان بە کاتی شاردراونەتەوە بۆ پاراستنی نهێنی نەخۆشەکان. بەردەوام بە یان قاسە شفرەکراوەکە دابخە.'
            )}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-2">
          <button
            type="button"
            autoFocus
            onClick={onResume}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <Eye className="size-4" />
            <span>{bi('استئناف العمل', 'Resume Session', 'گەڕانەوە بۆ کار')}</span>
          </button>
          <button
            type="button"
            onClick={onLockVault}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <Lock className="size-4" />
            <span>
              {bi('قفل الخزينة المشفرة', 'Lock Vault', 'قوفڵکردنی قاسە')}{' '}
              <bdi dir="ltr" className="opacity-75">
                (Ctrl+L)
              </bdi>
            </span>
          </button>
        </div>

        <p className="text-xs text-slate-400">
          {bi(
            'اختصار سريع: اضغط Esc مرتين لإظهار أو إخفاء الستار',
            'Shortcut: press Esc twice to toggle cover',
            'کورتەڕێ: دووجار Esc دابگرە بۆ شاردنەوە یان نیشاندان'
          )}
        </p>
      </div>
    </div>
  );
};
