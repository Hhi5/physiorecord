// =======================================================================
// PhysioRecord — Signal-Style Spaced-Repetition Password Memory Modal
// Helps clinicians keep their master password fresh while unlocked, and
// provides immediate safe rescue paths (Passkey reset / Enroll Passkey /
// Encrypted Backup) if they realize they forgot it BEFORE a lockout!
// =======================================================================

import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Fingerprint,
  HardDrive,
  KeyRound,
  ShieldCheck,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useVault } from '../context/VaultContext';
import { VAULT_CREDENTIAL_USERNAME } from '../utils/passwordReminderSchedule';
import { ModalDialog } from './ui/Dialog';

interface PasswordReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenBackupModal?: () => void;
}

export const PasswordReminderModal: React.FC<PasswordReminderModalProps> = ({
  isOpen,
  onClose,
  onOpenBackupModal,
}) => {
  const { isRtl, bi } = useLanguage();
  const {
    vaultKek,
    isPrfSupported,
    isPrfEnrolled,
    enrollPrf,
    confirmPasswordMemoryCheck,
    resetPasswordWithPrf,
    snoozePasswordReminder,
  } = useVault();

  const [mode, setMode] = useState<'check' | 'forgot' | 'prf_reset'>('check');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successDays, setSuccessDays] = useState<number | null>(null);

  // Inline PRF reset state
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [enrollingPrf, setEnrollingPrf] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setMode('check');
    setPasswordInput('');
    setShowPassword(false);
    setChecking(false);
    setError(null);
    setSuccessDays(null);
    setNewPassword('');
    setConfirmNewPassword('');
    setResetBusy(false);
    setResetDone(false);
    setEnrollingPrf(false);
  }, [isOpen]);

  const formatIntervalLabel = (days: number): string => {
    if (days <= 1) return bi('يوم واحد', '1 day', '١ ڕۆژ');
    if (days === 3) return bi('3 أيام', '3 days', '٣ ڕۆژ');
    if (days === 7) return bi('أسبوع واحد', '1 week', '١ هەفتە');
    if (days === 14) return bi('أسبوعين', '2 weeks', '٢ هەفتە');
    return bi('شهر واحد', '1 month', '١ مانگ');
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!passwordInput) {
      setError(bi('يرجى كتابة كلمة المرور الرئيسية.', 'Please enter your master password.', 'تکایە وشەی نهێنی سەرەکی بنووسە.'));
      return;
    }

    setChecking(true);
    try {
      const res = await confirmPasswordMemoryCheck(passwordInput);
      if (!res.ok) {
        setError(
          bi(
            'كلمة المرور غير مطابقة. جرّب مرة أخرى أو اضغط "نسيتها" لإعادة ضبطها بأمان قبل إقفال التطبيق.',
            'Password does not match. Try again or click "Forgot it?" to rescue safely while unlocked.',
            'وشەی نهێنی هەڵەیە. دووبارە هەوڵبدە یان کرتە لە "لەبیرم چوو؟" بکە.'
          )
        );
        return;
      }
      setPasswordInput('');
      setSuccessDays(res.nextIntervalDays ?? 3);
    } finally {
      setChecking(false);
    }
  };

  const handlePrfResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 10) {
      setError(
        bi(
          'يجب ألا تقل كلمة المرور الجديدة عن 10 خانات.',
          'New password must be at least 10 characters.',
          'وشەی نهێنی نوێ نابێت لە ١٠ پیت کەمتر بێت.'
        )
      );
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError(
        bi(
          'كلمتا المرور غير متطابقتين.',
          'Passwords do not match.',
          'وشە نهێنییەکان وەک یەک نین.'
        )
      );
      return;
    }

    setResetBusy(true);
    try {
      await resetPasswordWithPrf(newPassword);
      setNewPassword('');
      setConfirmNewPassword('');
      setResetDone(true);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : bi(
              'تعذر التحقق بالبصمة لإعادة تعيين كلمة المرور.',
              'Biometric verification failed while resetting password.',
              'پشکنینی پەنجەمۆر سەرکەوتوو نەبوو.'
            )
      );
    } finally {
      setResetBusy(false);
    }
  };

  const handleEnrollPrfNow = async () => {
    setError(null);
    setEnrollingPrf(true);
    try {
      await enrollPrf();
      setMode('prf_reset');
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : bi(
              'تعذر تفعيل البصمة على هذا الجهاز.',
              'Unable to enable Passkey on this device.',
              'چالاککردنی پەنجەمۆر سەرکەوتوو نەبوو.'
            )
      );
    } finally {
      setEnrollingPrf(false);
    }
  };

  return (
    <ModalDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      size="sm"
      dir={isRtl ? 'rtl' : 'ltr'}
      title={
        <span className="inline-flex items-center gap-2 text-sm font-bold text-primary-foreground">
          <ShieldCheck className="size-4 shrink-0" />
          <span>
            {bi(
              'تذكير تثبيت كلمة المرور',
              'Password Memory Check',
              'بیرخستنەوەی وشەی نهێنی'
            )}
          </span>
        </span>
      }
      ariaLabel={bi('تذكير تثبيت كلمة المرور', 'Password Memory Check', 'بیرخستنەوەی وشەی نهێنی')}
      closeLabel={bi('إغلاق', 'Close', 'داخستن')}
      className="bg-card border-card-line"
      bodyClassName="p-5 space-y-4 overflow-y-auto"
    >
      {successDays !== null ? (
        <div data-testid="password-reminder-success" className="space-y-4 text-center py-2">
          <div className="mx-auto size-12 rounded-2xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <CheckCircle2 className="size-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-foreground">
              {bi('أحسنت! كلمة المرور مطابقة تماماً', 'Great! Password confirmed', 'نایابە! وشەی نهێنی دروستە')}
            </h3>
            <p className="text-xs text-muted-foreground-1 leading-relaxed">
              {bi(
                `تتباعد التذكيرات تلقائياً مع الوقت — سنذكّرك مجدداً بعد ${formatIntervalLabel(successDays)}.`,
                `Reminders space out automatically — next gentle check in ${formatIntervalLabel(successDays)}.`,
                `بیرخستنەوەی داهاتوو دوای ${formatIntervalLabel(successDays)} دەبێت.`
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[40px] px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold cursor-pointer"
          >
            {bi('تم، العودة للعمل', 'Done', 'تەواو')}
          </button>
        </div>
      ) : resetDone ? (
        <div data-testid="password-reminder-reset-success" className="space-y-4 text-center py-2">
          <div className="mx-auto size-12 rounded-2xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <CheckCircle2 className="size-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-foreground">
              {bi('تم تعيين كلمة المرور الجديدة بنجاح!', 'New password saved successfully!', 'وشەی نهێنی نوێ بە سەرکەوتوویی دانرا!')}
            </h3>
            <p className="text-xs text-muted-foreground-1 leading-relaxed">
              {bi(
                'جميع سجلاتك آمنة كما هي، ويمكنك حفظ كلمة المرور الجديدة في مدير كلمات مرور المتصفح.',
                'All clinical records remain intact, and you can save your new password in your browser password manager.',
                'هەموو تۆمارەکانت پارێزراون و دەتوانیت وشەی نهێنی نوێ لە وێبگەڕەکەت پاشەکەوت بکەیت.'
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[40px] px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold cursor-pointer"
          >
            {bi('تم', 'Done', 'تەواو')}
          </button>
        </div>
      ) : mode === 'check' ? (
        <form onSubmit={(e) => void handleVerifySubmit(e)} className="space-y-3.5">
          <input
            type="text"
            name="username"
            autoComplete="username"
            value={VAULT_CREDENTIAL_USERNAME}
            readOnly
            tabIndex={-1}
            aria-hidden="true"
            className="sr-only"
          />

          <p className="text-xs text-muted-foreground-1 leading-relaxed">
            {bi(
              'فحص سريع ومطمئن للتأكد من تذكّرك لكلمة المرور الرئيسية قبل أن تنساها مع مرور الأشهر. خزينتك مفتوحة الآن ولن تفقد أي بيانات حتى لو نسيتها.',
              'A quick check to keep your master password fresh in memory. Your vault is unlocked right now — you will not lose any data even if you forgot it.',
              'پشکنینێکی خێرا بۆ دڵنیابوون لە بیرمانی وشەی نهێنی سەرەکی. خەزێنەکەت کراوەیە و هیچ داتایەک لەدەست نادەیت.'
            )}
          </p>

          {error && (
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label htmlFor="reminder-password-input" className="block text-xs font-bold text-foreground mb-1">
              {bi('اكتب كلمة المرور الرئيسية:', 'Enter your master password:', 'وشەی نهێنی سەرەکی بنووسە:')}
            </label>
            <div className="pr-pill-input-wrap rounded-xl bg-layer border border-layer-line flex items-center overflow-hidden focus-within:border-primary">
              <input
                id="reminder-password-input"
                data-testid="password-reminder-input"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={passwordInput}
                onChange={(e) => {
                  setPasswordInput(e.target.value);
                  setError(null);
                }}
                placeholder={bi('كلمة المرور الرئيسية...', 'Master password...', 'وشەی نهێنی سەرەکی...')}
                className="pr-input-bare flex-1 min-w-0 px-3 py-2 text-xs text-foreground"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? bi('إخفاء', 'Hide') : bi('إظهار', 'Show')}
                className="pr-eye-bare px-3 py-2 text-muted-foreground-1 hover:text-foreground cursor-pointer"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="button"
              data-testid="password-reminder-forgot-btn"
              onClick={() => {
                setError(null);
                setMode(isPrfSupported && isPrfEnrolled ? 'prf_reset' : 'forgot');
              }}
              className="text-xs font-bold text-amber-700 dark:text-amber-300 hover:underline cursor-pointer"
            >
              {bi('نسيتها؟ اضبطها الآن بأمان', 'Forgot it? Rescue safely', 'لەبیرم چوو؟ ئێستا چاکی بکە')}
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  snoozePasswordReminder(2);
                  onClose();
                }}
                className="min-h-[36px] px-3 py-1.5 rounded-xl bg-surface hover:bg-layer-hover text-foreground text-xs font-semibold cursor-pointer"
              >
                {bi('تذكيري لاحقاً', 'Later', 'دواتر')}
              </button>
              <button
                type="submit"
                data-testid="password-reminder-verify-btn"
                disabled={checking}
                className="min-h-[36px] px-4 py-1.5 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground text-xs font-bold cursor-pointer"
              >
                {checking
                  ? bi('جاري التحقق...', 'Checking...', 'دەپشکنرێت...')
                  : bi('تأكيد', 'Verify', 'دڵنیاکردنەوە')}
              </button>
            </div>
          </div>
        </form>
      ) : mode === 'prf_reset' ? (
        <form onSubmit={(e) => void handlePrfResetSubmit(e)} className="space-y-3">
          <input
            type="text"
            name="username"
            autoComplete="username"
            value={VAULT_CREDENTIAL_USERNAME}
            readOnly
            tabIndex={-1}
            aria-hidden="true"
            className="sr-only"
          />

          <div className="p-3 rounded-xl bg-primary/8 border border-primary/20 text-xs text-foreground leading-relaxed flex items-start gap-2">
            <Fingerprint className="size-4 text-primary shrink-0 mt-0.5" />
            <span>
              {bi(
                'لأن البصمة / مفتاح المرور مفعّل على هذا الجهاز، يمكنك تعيين كلمة مرور رئيسية جديدة فوراً بالتحقق الحيوي دون الحاجة لكلمة المرور القديمة.',
                'Because Biometrics / Passkey is enrolled on this device, you can set a new master password immediately without the old password.',
                'چونکە پەنجەمۆر چالاکە، دەتوانیت ڕاستەوخۆ وشەی نهێنی نوێ دابنێیت بێ وشەی کۆن.'
              )}
            </span>
          </div>

          {error && (
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label htmlFor="reminder-prf-new-pw" className="block text-xs font-bold text-foreground mb-1">
              {bi('كلمة المرور الجديدة (10 خانات على الأقل):', 'New Master Password (min 10 chars):', 'وشەی نهێنی نوێ (لانی کەم ١٠ پیت):')}
            </label>
            <input
              id="reminder-prf-new-pw"
              type="password"
              autoComplete="new-password"
              dir="ltr"
              required
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                setError(null);
              }}
              className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label htmlFor="reminder-prf-confirm-pw" className="block text-xs font-bold text-foreground mb-1">
              {bi('تأكيد كلمة المرور الجديدة:', 'Confirm New Password:', 'دڵنیابوونەوەی وشەی نهێنی نوێ:')}
            </label>
            <input
              id="reminder-prf-confirm-pw"
              type="password"
              autoComplete="new-password"
              dir="ltr"
              required
              value={confirmNewPassword}
              onChange={(e) => {
                setConfirmNewPassword(e.target.value);
                setError(null);
              }}
              className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setMode('check');
              }}
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-surface text-foreground text-xs font-semibold cursor-pointer"
            >
              {bi('رجوع', 'Back', 'گەڕانەوە')}
            </button>
            <button
              type="submit"
              disabled={resetBusy}
              className="min-h-[36px] px-4 py-1.5 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Fingerprint className="size-4" />
              <span>
                {resetBusy
                  ? bi('جاري التحقق...', 'Verifying...', 'دەپشکنرێت...')
                  : bi('تحقق بالبصمة وحفظ كلمة المرور', 'Verify Passkey & Save', 'پشکنینی پەنجەمۆر و پاشەکەوت')}
              </span>
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-3 text-xs">
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-foreground leading-relaxed space-y-1">
            <p className="font-bold text-amber-800 dark:text-amber-300">
              {bi('لا تقلق — خزينتك ما زالت مفتوحة الآن!', 'Do not worry — your vault is still unlocked!', 'مەترسە — خەزێنەکەت هێشتا کراوەیە!')}
            </p>
            <p className="text-muted-foreground-1">
              {bi(
                'قبل إقفال التطبيق أو إغلاق المتصفح، يمكنك إنقاذ بياناتك وتعيين كلمة مرور جديدة بإحدى الطرق الآمنة التالية:',
                'Before locking the vault, rescue your data and set a new password using one of these safe options:',
                'پێش داخستنی بەرنامەکە، دەتوانیت داتاکانت بپارێزیت بەم ڕێگایانە:'
              )}
            </p>
          </div>

          {error && (
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}

          <div className="space-y-2">
            {isPrfSupported && !isPrfEnrolled && vaultKek && (
              <button
                type="button"
                disabled={enrollingPrf}
                onClick={() => void handleEnrollPrfNow()}
                className="w-full p-3 rounded-xl bg-primary/10 hover:bg-primary/15 border border-primary/25 text-start flex items-center gap-2.5 cursor-pointer transition-colors"
              >
                <Fingerprint className="size-4 text-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-foreground">
                    {enrollingPrf
                      ? bi('جاري تفعيل البصمة...', 'Enabling Passkey...', 'پەنجەمۆر چالاک دەکرێت...')
                      : bi('تفعيل البصمة الآن ثم تعيين كلمة مرور جديدة', 'Enable Passkey now & reset password', 'چالاککردنی پەنجەمۆر و گۆڕینی وشەی نهێنی')}
                  </div>
                  <div className="text-muted-foreground-1 mt-0.5">
                    {bi(
                      'أسرع طريقة لإعادة ضبط كلمة المرور دون فقدان أي سجل.',
                      'Fastest way to reset your master password with zero data loss.',
                      'خێراترین ڕێگا بۆ گۆڕینی وشەی نهێنی بێ لەدەستدانی هیچ تۆمارێک.'
                    )}
                  </div>
                </div>
              </button>
            )}

            {onOpenBackupModal && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenBackupModal();
                }}
                className="w-full p-3 rounded-xl bg-surface hover:bg-layer-hover border border-line-2 text-start flex items-center gap-2.5 cursor-pointer transition-colors"
              >
                <HardDrive className="size-4 text-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-foreground">
                    {bi('حفظ نسخة احتياطية مشفّرة الآن', 'Export an encrypted backup right now', 'هەناردەکردنی کۆپی یەدەگی کۆدکراو ئێستا')}
                  </div>
                  <div className="text-muted-foreground-1 mt-0.5">
                    {bi(
                      'احفظ ملف .ptbackup بكلمة مرور جديدة تتذكرها قبل قفل الخزينة.',
                      'Save a .ptbackup file with a fresh password you remember before locking.',
                      'فایلی .ptbackup بە وشەی نهێنی نوێ پاشەکەوت بکە پێش قفڵکردن.'
                    )}
                  </div>
                </div>
              </button>
            )}

            <div className="p-3 rounded-xl bg-surface/60 border border-card-divider flex items-start gap-2.5 text-muted-foreground-1">
              <KeyRound className="size-4 text-primary shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                {bi(
                  'أو استخدم مفتاح الاسترداد الطارئ (32 خانة) من شاشة القفل لإعادة تعيين كلمة المرور مباشرة.',
                  'Or use your 32-character Emergency Recovery Key on the Lock Screen to reset your password directly.',
                  'یان کلیلی گەڕاندنەوەی لەناکاو (٣٢ پیت) لە شاشەی قفڵ بەکاربهێنە.'
                )}
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={() => setMode('check')}
              className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-surface hover:bg-layer-hover text-foreground text-xs font-bold cursor-pointer"
            >
              {bi('رجوع', 'Back', 'گەڕانەوە')}
            </button>
          </div>
        </div>
      )}
    </ModalDialog>
  );
};
