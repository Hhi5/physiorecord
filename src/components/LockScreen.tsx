// =======================================================================
// PhysioRecord — Cryptographic Vault Gate & Authentication
// Supports First-Time Setup, Recovery Key Generation, Vault Unlock & Wipe
// =======================================================================

import React, { useState, useMemo } from 'react';
import { useVault } from '../context/VaultContext';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { LanguageSwitcher } from './ui/LanguageSwitcher';
import { BrandLogo } from './ui/BrandLogo';
import { ModalDialog } from './ui/Dialog';
import { copySecretWithAutoClear } from '../utils/clipboardPrivacy';
import { VAULT_CREDENTIAL_USERNAME } from '../utils/passwordManagerHelper';
import {
  saveTextFilePortable,
  triggerPlatformPrint,
} from '../platform/nativeBridge';
import {
  Lock,
  ShieldCheck,
  KeyRound,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Copy,
  Check,
  Key,
  Eye,
  EyeOff,
  Sun,
  Moon,
  Download,
  Printer,
  Fingerprint,
  Globe,
} from 'lucide-react';

const MOTIVATIONAL_CLINICAL_QUOTES: ReadonlyArray<{
  ar: string;
  en: string;
  ckb: string;
}> = [
  {
    ar: 'كل خطوة علاجية تقرّب مريضك من حركته الطبيعية',
    en: 'Every session brings someone closer to moving freely',
    ckb: 'هەر هەنگاوێکی چارەسەر نەخۆشەکەت نزیکتر دەکاتەوە لە جووڵەی سروشتی',
  },
  {
    ar: 'بلمسة رحيمة وعلم دقيق نصنع فرقاً في حياة الناس',
    en: 'Compassion and precision heal more than muscle alone',
    ckb: 'بە دەستێکی میهرەبان و زانستی ورد جیاوازی لە ژیانی خەڵکدا دروست دەکەین',
  },
  {
    ar: 'تقدّم صغير اليوم يصنع تعافياً يدوم لسنوات',
    en: 'Small daily progress builds lifelong recovery',
    ckb: 'پێشکەوتنێکی بچووکی ئەمڕۆ چاکبوونەوەیەکی هەمیشەیی دروست دەکات',
  },
  {
    ar: 'العناية الجيدة تبدأ دائماً بالإنصات الهادئ للمريض',
    en: 'Great care begins with listening to every movement',
    ckb: 'چاودێری باش هەمیشە بە گوێگرتنی هێمنانە لە نەخۆش دەست پێدەکات',
  },
  {
    ar: 'يداك الثابتتان تعيدان الأمل خطوةً بعد خطوة',
    en: 'Steady care restores confidence step by step',
    ckb: 'دەستە بەهێزەکانت هیوا و متمانە هەنگاو بە هەنگاو دەگەڕێننەوە',
  },
];

export const LockScreen: React.FC = () => {
  const {
    isInitialized,
    setupPassword,
    completeSetup,
    unlock,
    unlockWithPrf,
    kdfProgress,
    isPrfSupported,
    isPrfEnrolled,
    schemaDowngradeError,
    resetPasswordWithRecovery,
    resetPasswordWithPrf,
    wipeDatabase,
  } = useVault();
  const { language, isRtl, bi } = useLanguage();
  const { theme, toggleTheme } = useTheme();

  const [motivationalQuote] = useState(() => {
    try {
      const prevIdxRaw = sessionStorage.getItem('physiorecord_quote_idx');
      const prevIdx = prevIdxRaw !== null ? Number(prevIdxRaw) : -1;
      const candidates = MOTIVATIONAL_CLINICAL_QUOTES.map((_, idx) => idx).filter(
        (idx) => idx !== prevIdx
      );
      const pickedIdx =
        candidates[Math.floor(Math.random() * candidates.length)] ?? 0;
      sessionStorage.setItem('physiorecord_quote_idx', String(pickedIdx));
      return MOTIVATIONAL_CLINICAL_QUOTES[pickedIdx];
    } catch {
      return MOTIVATIONAL_CLINICAL_QUOTES[0];
    }
  });

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Post-setup Recovery Key Display Modal
  const [generatedRecoveryKey, setGeneratedRecoveryKey] = useState<string | null>(null);
  const [copiedRecoveryKey, setCopiedRecoveryKey] = useState(false);
  const [confirmedSavedRecoveryKey, setConfirmedSavedRecoveryKey] = useState(false);
  const [challengeGroupIndex, setChallengeGroupIndex] = useState<number>(0);
  const [challengeGroupInput, setChallengeGroupInput] = useState('');

  // Recovery Mode (Unlock using Biometrics/Passkey OR 32-char Recovery Key + Set New Password)
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recoveryMethod, setRecoveryMethod] = useState<'prf' | 'key'>('key');
  const [recoveryKeyInput, setRecoveryKeyInput] = useState('');
  const [newVaultPassword, setNewVaultPassword] = useState('');
  const [confirmNewVaultPassword, setConfirmNewVaultPassword] = useState('');

  // Destructive Wipe Confirmation Modal
  const [showWipeModal, setShowWipeModal] = useState(false);
  const [wipeConfirmInput, setWipeConfirmInput] = useState('');

  const isSetup = !isInitialized || generatedRecoveryKey !== null;

  // Password Requirements & Strength Computation for Setup
  const pwHasMinLen = password.length >= 10;
  const pwHasLetter = /[A-Za-z\u0600-\u06FF]/.test(password);
  const pwHasNumberOrSymbol = /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);
  const pwStrengthScore =
    (pwHasMinLen ? 1 : 0) +
    (pwHasLetter ? 1 : 0) +
    (pwHasNumberOrSymbol ? 1 : 0) +
    (password.length >= 14 ? 1 : 0);
  const pwMatches = confirmPassword.length > 0 && password === confirmPassword;

  const recoveryGroups = useMemo(
    () => (generatedRecoveryKey ? generatedRecoveryKey.split('-').filter(Boolean) : []),
    [generatedRecoveryKey]
  );

  const expectedChallengeGroup = recoveryGroups[challengeGroupIndex] || '';
  const isChallengeVerified =
    expectedChallengeGroup.length > 0 &&
    challengeGroupInput.trim().toUpperCase() === expectedChallengeGroup.toUpperCase();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!isInitialized) {
      if (password.length < 10) {
        setLocalError(
          bi(
            'يجب ألا تقل كلمة المرور السريرية عن 10 خانات.',
            'Clinical password must be at least 10 characters.',
            'وشەی نهێنی کلینیکی نابێت لە ١٠ پیت کەمتر بێت.'
          )
        );
        return;
      }
      if (password !== confirmPassword) {
        setLocalError(
          bi(
            'كلمتا المرور غير متطابقتين. يرجى التأكد من التطابق.',
            'Passwords do not match. Please verify.',
            'وشە نهێنییەکان وەک یەک نین. تکایە دڵنیابە لە هاوتابوونیان.'
          )
        );
        return;
      }

      setSubmitting(true);
      try {
        const { recoveryKeyFormatted } = await setupPassword(password);
        const groups = recoveryKeyFormatted.split('-').filter(Boolean);
        setChallengeGroupIndex(
          groups.length > 0 ? Math.floor(Math.random() * groups.length) : 0
        );
        setChallengeGroupInput('');
        setConfirmedSavedRecoveryKey(false);
        setGeneratedRecoveryKey(recoveryKeyFormatted);
      } catch (err) {
        setLocalError(
          err instanceof Error
            ? err.message
            : bi(
                'تعذر إنشاء الخزينة المشفرة.',
                'Failed to initialize encrypted vault.',
                'دروستکردنی خەزێنەی نهێنیکراو سەرکەوتوو نەبوو.'
              )
        );
      } finally {
        setSubmitting(false);
      }
    } else {
      if (!password) {
        setLocalError(bi('يرجى إدخال كلمة المرور.', 'Please enter your password.', 'تکایە وشەی نهێنی بنووسە.'));
        return;
      }

      setSubmitting(true);
      try {
        const ok = await unlock(password);
        if (!ok) {
          setLocalError(
            bi(
              'كلمة المرور غير صحيحة. يرجى المحاولة مرة أخرى.',
              'Incorrect master password. Please try again.',
              'وشەی نهێنی هەڵەیە. تکایە دووبارە هەوڵبدەرەوە.'
            )
          );
        }
      } catch (err) {
        setLocalError(
          err instanceof Error
            ? err.message
            : bi(
                'تعذر فتح الخزينة المشفرة.',
                'Failed to unlock encrypted vault.',
                'کردنەوەی خەزێنەی نهێنیکراو سەرکەوتوو نەبوو.'
              )
        );
      } finally {
        setSubmitting(false);
      }
    }
  };

  const handleCopyRecoveryKey = async () => {
    if (!generatedRecoveryKey) return;
    try {
      await copySecretWithAutoClear(generatedRecoveryKey);
      setCopiedRecoveryKey(true);
      setTimeout(() => setCopiedRecoveryKey(false), 5000);
    } catch {
      // Fallback
    }
  };

  const handleDownloadRecoveryKeyTxt = () => {
    if (!generatedRecoveryKey) return;
    const content = [
      'PhysioRecord — Emergency Vault Recovery Key',
      '===========================================',
      `Recovery Key: ${generatedRecoveryKey}`,
      `Generated: ${new Date().toISOString()}`,
      '',
      'Keep this file in a secure offline location. It is the only way to recover your encrypted database if you forget your master password.',
    ].join('\n');
    void saveTextFilePortable({
      filename: 'physiorecord-recovery-key.txt',
      content,
      mimeType: 'text/plain;charset=utf-8',
      description: 'PhysioRecord Emergency Recovery Key (.txt)',
      extensions: ['txt'],
    });
  };

  const handlePrintRecoveryKey = () => {
    void triggerPlatformPrint('PhysioRecord_Recovery_Key');
  };

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    const usePrfMethod = recoveryMethod === 'prf' && isPrfSupported && isPrfEnrolled;

    if (!usePrfMethod && !recoveryKeyInput.trim()) {
      setLocalError(
        bi(
          'يرجى إدخال مفتاح الاسترداد الطارئ.',
          'Please enter the emergency recovery key.',
          'تکایە کلیلی فریاگوزاری گەڕاندنەوە بنووسە.'
        )
      );
      return;
    }
    if (newVaultPassword.length < 10) {
      setLocalError(
        bi(
          'يجب ألا تقل كلمة المرور الجديدة عن 10 خانات.',
          'New password must be at least 10 characters.',
          'وشەی نهێنی نوێ نابێت لە ١٠ پیت کەمتر بێت.'
        )
      );
      return;
    }
    if (newVaultPassword !== confirmNewVaultPassword) {
      setLocalError(
        bi(
          'كلمتا المرور الجديدتان غير متطابقتين.',
          'New passwords do not match.',
          'وشە نهێنییە نوێیەکان وەک یەک نین.'
        )
      );
      return;
    }

    setSubmitting(true);
    try {
      if (usePrfMethod) {
        await resetPasswordWithPrf(newVaultPassword);
        setShowRecoveryModal(false);
        setNewVaultPassword('');
        setConfirmNewVaultPassword('');
        return;
      }

      const { newRecoveryKeyFormatted } = await resetPasswordWithRecovery(
        recoveryKeyInput,
        newVaultPassword
      );
      setShowRecoveryModal(false);
      const groups = newRecoveryKeyFormatted.split('-').filter(Boolean);
      setChallengeGroupIndex(
        groups.length > 0 ? Math.floor(Math.random() * groups.length) : 0
      );
      setChallengeGroupInput('');
      setConfirmedSavedRecoveryKey(false);
      setGeneratedRecoveryKey(newRecoveryKeyFormatted);
    } catch (err) {
      setLocalError(
        err instanceof Error
          ? err.message
          : bi(
              'مفتاح الاسترداد الطارئ غير صالح أو تعذر استعادة الخزينة.',
              'Invalid recovery key or failed to recover vault.',
              'کلیلی فریاگوزاری هەڵەیە یان گەڕاندنەوەی خەزێنە سەرکەوتوو نەبوو.'
            )
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleFactoryWipe = async (e: React.FormEvent) => {
    e.preventDefault();
    const confirmVal = wipeConfirmInput.trim().toUpperCase();
    if (
      confirmVal !== 'حذف نهائي' &&
      confirmVal !== 'WIPE' &&
      confirmVal !== 'مسح' &&
      confirmVal !== 'مسح نهائي' &&
      confirmVal !== 'سڕینەوەی یەکجاری' &&
      confirmVal !== 'سڕینەوە'
    ) {
      return;
    }
    setSubmitting(true);
    try {
      await wipeDatabase();
      setShowWipeModal(false);
      setWipeConfirmInput('');
      setPassword('');
    } catch (err) {
      setLocalError(
        err instanceof Error
          ? err.message
          : bi('تعذر مسح الخزينة.', 'Failed to wipe vault.', 'سڕینەوەی خەزێنە سەرکەوتوو نەبوو.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  const displayError = localError;

  const renderBannerArt = () => (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden select-none"
      style={{
        background:
          theme === 'dark'
            ? 'linear-gradient(145deg, var(--primary-950) 0%, var(--primary-800) 58%, var(--primary-700) 100%)'
            : 'linear-gradient(145deg, var(--primary-700) 0%, var(--primary-600) 55%, var(--primary-500) 100%)',
      }}
    >
      <svg
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMid slice"
        className="w-full h-full"
        fill="none"
      >
        {/* Asymmetric Diagonal Ribbon Wave across top */}
        <path
          d="M-60 40 C 220 -20, 420 180, 780 95 C 980 48, 1140 12, 1260 -30 L 1260 220 C 1030 280, 790 160, 440 250 C 190 315, 30 210, -60 150 Z"
          fill="#ffffff"
          fillOpacity="0.07"
        />
        {/* Warm Saffron Crescent Sweep (bottom-start corner) */}
        <path
          d="M-60 820 C 40 540, 260 490, 440 650 C 540 738, 600 830, 600 830 Z"
          fill="#e7b949"
          fillOpacity="0.72"
        />
        {/* Soft Coral Organic Pill (end side) */}
        <rect
          x="940"
          y="390"
          width="320"
          height="320"
          rx="116"
          transform="rotate(-18 940 390)"
          fill="#eb9474"
          fillOpacity="0.58"
        />
        {/* Translucent Sage Mint Wave (bottom-end) */}
        <path
          d="M620 820 C 710 590, 940 560, 1260 660 L 1260 820 Z"
          fill="var(--primary-300)"
          fillOpacity="0.55"
        />
        {/* Architectural Dashed & Solid Rings */}
        <circle
          cx="155"
          cy="118"
          r="112"
          stroke="#ffffff"
          strokeOpacity="0.14"
          strokeWidth="2"
          strokeDasharray="10 12"
        />
        <circle
          cx="1040"
          cy="110"
          r="64"
          fill="#ffffff"
          fillOpacity="0.08"
        />
      </svg>
    </div>
  );

  const renderBottomIconBar = () => (
    <footer className="w-full max-w-sm mx-auto px-2 pt-5 pb-1 flex items-center justify-center gap-4">
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={
          theme === 'dark'
            ? bi('الوضع النهاري', 'Light Mode', 'دۆخی ڕۆژ')
            : bi('الوضع الليلي', 'Dark Mode', 'دۆخی شەو')
        }
        title={
          theme === 'dark'
            ? bi('الوضع النهاري', 'Light Mode', 'دۆخی ڕۆژ')
            : bi('الوضع الليلي', 'Dark Mode', 'دۆخی شەو')
        }
        className="min-w-[36px] min-h-[36px] p-2 rounded-full bg-transparent border-0 text-muted-foreground-1 hover:text-foreground inline-flex items-center justify-center transition-colors cursor-pointer"
      >
        {theme === 'dark' ? (
          <Sun className="size-4 text-amber-400" />
        ) : (
          <Moon className="size-4" />
        )}
      </button>

      <span className="h-3.5 w-px bg-card-divider" aria-hidden="true" />

      <LanguageSwitcher compact variant="borderless" />
    </footer>
  );

  // Step 2 of Setup: Display One-Time Emergency Recovery Key
  if (generatedRecoveryKey) {
    return (
      <div
        className="min-h-dvh w-full text-foreground flex flex-col relative overflow-x-hidden md:px-6"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        {renderBannerArt()}

        <div className="pr-auth-spacer" aria-hidden="true" />

        {/* Motivational / Step Header sitting on the artistic backdrop */}
        <header className="relative z-10 px-6 pt-9 pb-7 md:pt-4 md:pb-5 text-center shrink-0">
          <div className="max-w-md mx-auto space-y-1.5">
            <div className="inline-flex items-center gap-1.5 text-white/90 text-xs font-semibold">
              <Key className="size-3.5" />
              <span>{bi('خطوة الأمان 2 من 2', 'Security Step 2 of 2', 'هەنگاوی سەلامەتی ٢ لە ٢')}</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
              {bi(
                'مفتاح الاسترداد الطارئ',
                'Emergency Recovery Key',
                'کلیلی فریاگوزاری گەڕاندنەوە'
              )}
            </h1>
          </div>
        </header>

        {/* Fluid Morphing Sheet (Edge-to-edge bottom sheet on mobile -> Centered floating card on tablet/desktop) */}
        <main className="pr-auth-sheet pr-auth-sheet--wide relative z-10 mx-auto bg-card px-5 sm:px-8 pt-7 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] md:py-7 flex flex-col justify-between">
          <div className="w-full space-y-4">
            <div className="text-center">
              <div className="inline-flex items-center justify-center gap-1.5 text-primary text-xs font-bold tracking-wide mb-1">
                <BrandLogo className="size-5 shrink-0" />
                <span>PhysioRecord</span>
              </div>
              <p className="text-xs text-muted-foreground-1 leading-relaxed">
                {bi(
                  'انسخ هذا المفتاح أو حمّله واحتفظ به خارج المتصفح — هو الوسيلة الوحيدة لاستعادة سجلاتك عند نسيان كلمة المرور.',
                  'Save this key outside your browser. It is the only way to recover your records if you forget your password.',
                  'ئەم کلیلە لە دەرەوەی وێبگەڕ هەڵبگرە — تاکە ڕێگایە بۆ گەڕاندنەوەی تۆمارەکان لە کاتی لەبیرچوونەوەی وشەی نهێنی.'
                )}
              </p>
            </div>

            {/* Recovery Key Grouped Blocks */}
            <div
              dir="ltr"
              className="p-3.5 rounded-2xl bg-surface grid grid-cols-2 sm:grid-cols-4 gap-2 text-center select-all"
            >
              {recoveryGroups.map((grp, idx) => (
                <div
                  key={idx}
                  className="py-2 px-2 rounded-xl bg-card font-mono text-xs font-bold text-primary whitespace-nowrap flex items-center justify-center gap-1 shadow-2xs"
                >
                  <span className="text-xs text-muted-foreground-1 select-none">
                    #{idx + 1}
                  </span>
                  <span>{grp}</span>
                </div>
              ))}
            </div>

            {/* Action Buttons: Copy / Download .txt / Print */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={handleCopyRecoveryKey}
                className="py-2.5 px-3 rounded-xl bg-surface hover:bg-layer-hover text-foreground text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                {copiedRecoveryKey ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span>{bi('تم النسخ', 'Copied', 'کۆپی کرا')}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-primary" />
                    <span>{bi('نسخ', 'Copy', 'کۆپیکردن')}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleDownloadRecoveryKeyTxt}
                className="py-2.5 px-3 rounded-xl bg-surface hover:bg-layer-hover text-foreground text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-primary" />
                <span>{bi('تحميل', 'Download', 'داگرتن')} <bdi dir="ltr">.txt</bdi></span>
              </button>

              <button
                type="button"
                onClick={handlePrintRecoveryKey}
                className="py-2.5 px-3 rounded-xl bg-surface hover:bg-layer-hover text-foreground text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <Printer className="w-3.5 h-3.5 text-primary" />
                <span>{bi('طباعة', 'Print', 'چاپکردن')}</span>
              </button>
            </div>

            {/* Re-type Random Group Verification */}
            <div className="space-y-1.5">
              <label htmlFor="challenge-group-input" className="block text-xs font-semibold text-foreground text-center">
                {bi(
                  `لتأكيد الحفظ، أعد كتابة المجموعة رقم #${challengeGroupIndex + 1}:`,
                  `Verify backup — type Group #${challengeGroupIndex + 1}:`,
                  `بۆ دڵنیاکردنەوە، کۆمەڵەی ژمارە #${challengeGroupIndex + 1} بنووسەرەوە:`
                )}
              </label>
              <input
                id="challenge-group-input"
                type="text"
                dir="ltr"
                value={challengeGroupInput}
                onChange={(e) => setChallengeGroupInput(e.target.value)}
                placeholder={expectedChallengeGroup}
                className="w-full px-4 py-3 rounded-2xl bg-surface border border-card-line/50 focus:border-primary/45 focus:bg-layer font-mono text-sm font-bold text-center uppercase tracking-widest text-foreground placeholder:text-muted-foreground-1/75 focus:outline-none transition-all"
              />
            </div>

            <label className="flex items-start gap-2.5 p-3 rounded-2xl bg-surface/70 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmedSavedRecoveryKey}
                onChange={(e) => setConfirmedSavedRecoveryKey(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded accent-primary"
              />
              <span className="text-xs font-semibold text-foreground leading-relaxed">
                {bi(
                  'أؤكد أنني حفظت مفتاح الاسترداد الطارئ في مكان آمن خارج هذا الجهاز.',
                  'I confirm that I have securely stored this Emergency Recovery Key.',
                  'دڵنیا دەکەمەوە کە کلیلی فریاگوزاری گەڕاندنەوەم لە شوێنێکی سەلامەت لە دەرەوەی ئەم ئامێرە هەڵگرتووە.'
                )}
              </span>
            </label>

            <button
              type="button"
              disabled={!confirmedSavedRecoveryKey || !isChallengeVerified}
              onClick={() => {
                setGeneratedRecoveryKey(null);
                completeSetup();
              }}
              className="w-full h-12 px-5 rounded-full bg-primary hover:bg-primary-hover text-primary-foreground disabled:opacity-45 disabled:cursor-not-allowed font-bold text-sm transition-all cursor-pointer"
            >
              {bi(
                'الدخول إلى مساحة العمل السريرية',
                'Enter Clinical Workspace',
                'چوونە ناو شوێنی کاری کلینیکی'
              )}
            </button>
          </div>

          {renderBottomIconBar()}
        </main>

        <div className="pr-auth-spacer" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div
      className="min-h-dvh w-full text-foreground flex flex-col relative overflow-x-hidden md:px-6"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Full-Viewport Geometric Art Backdrop (stays visible behind the sheet & floating card) */}
      {renderBannerArt()}

      <div className="pr-auth-spacer" aria-hidden="true" />

      {/* Handwritten Motivational Quote over the Artistic Backdrop */}
      <header className="relative z-10 px-6 pt-12 pb-8 md:pt-4 md:pb-6 flex flex-col items-center justify-center text-center shrink-0">
        <blockquote className="max-w-[300px] sm:max-w-md mx-auto space-y-2.5">
          <p
            data-testid="lock-motivational-quote"
            className="text-xl sm:text-2xl font-medium text-white leading-relaxed drop-shadow-[0_1px_10px_rgba(0,0,0,0.22)]"
            style={{
              fontFamily:
                language === 'en'
                  ? "'Segoe Print', 'Bradley Hand', 'Apple Chancery', cursive"
                  : "'Segoe Print', 'Traditional Arabic', 'Amiri', 'IBM Plex Sans Arabic', cursive",
              fontStyle: language === 'en' ? 'italic' : 'normal',
            }}
          >
            {language === 'en'
              ? `“${motivationalQuote.en}”`
              : language === 'ckb'
                ? `«${motivationalQuote.ckb}»`
                : `«${motivationalQuote.ar}»`}
          </p>
          <svg
            viewBox="0 0 140 12"
            className="w-24 h-2.5 mx-auto text-amber-200/85"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M4 8 C 42 2, 98 2, 136 7"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </svg>
        </blockquote>
      </header>

      {/* Fluid Morphing Sheet (Edge-to-edge full bottom sheet on phone -> Smooth motion detach into centered card on tablet/desktop) */}
      <main className="pr-auth-sheet relative z-10 mx-auto bg-card px-6 sm:px-9 pt-8 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] md:py-8 flex flex-col justify-between">
        <div className="w-full max-w-sm mx-auto">
          <div className="text-center space-y-1.5 mb-6">
            <div className="inline-flex items-center justify-center gap-1.5 text-primary text-xs font-bold tracking-wide">
              <BrandLogo className="size-6 shrink-0" />
              <span>PhysioRecord</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-foreground leading-tight tracking-tight">
              {isSetup
                ? bi(
                    'إنشاء الخزينة المشفرة',
                    'Create your vault',
                    'دروستکردنی خەزێنە'
                  )
                : bi('فتح الخزينة السريرية', 'Unlock your vault', 'کردنەوەی خەزێنە')}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground-1 leading-relaxed">
              {isSetup
                ? bi(
                    'الخطوة 1 من 2: عيّن كلمة مرور رئيسية لحماية سجلات المرضى',
                    'Step 1 of 2: Set a master password for patient records',
                    'هەنگاوی ١ لە ٢: وشەی نهێنی سەرەکی دابنێ بۆ پاراستنی تۆمارەکان'
                  )
                : bi(
                    'أدخل كلمة المرور للوصول إلى السجلات المشفرة',
                    'Enter your password to access encrypted records',
                    'وشەی نهێنی بنووسە بۆ کردنەوەی تۆمارە نهێنیکراوەکان'
                  )}
            </p>
          </div>

          {displayError && (
            <div className="mb-4 p-3 rounded-2xl bg-surface/75 flex items-start gap-2 text-rose-700 dark:text-rose-300 text-xs font-medium">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{displayError}</span>
            </div>
          )}

          {schemaDowngradeError ? (
              <div
                data-testid="schema-downgrade-blocked-card"
                className="p-4 rounded-2xl bg-surface/75 text-xs space-y-2.5 text-foreground"
              >
                <div className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-300">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>
                    {bi(
                      'حماية البيانات: قاعدة البيانات أحدث من إصدار التطبيق الحالي',
                      'Data Safety Guard: Database Is Newer Than This App Version',
                      'پاراستنی داتا: داتابەیسەکە نوێترە لەم وەشانەی بەرنامەکە'
                    )}
                  </span>
                </div>
                <p className="leading-relaxed text-muted-foreground-1">
                  {bi(
                    'تم ترقية قاعدة البيانات المحلية على هذا الجهاز بواسطة إصدار أحدث من PhysioRecord. يرجى تثبيت أحدث إصدار للمتابعة بأمان.',
                    'The local database on this device was upgraded by a newer version of PhysioRecord. Please install the latest release to continue safely.',
                    'داتابەیسی ناوخۆیی لەلایەن وەشانێکی نوێترەوە نوێکراوەتەوە. تکایە نوێترین وەشان دابەزێنە.'
                  )}
                </p>
                <p className="font-mono text-xs text-muted-foreground-2 break-all" dir="ltr">
                  {schemaDowngradeError.message}
                </p>
              </div>
            ) : (
            <form className="space-y-3" onSubmit={handleSubmit}>
              {/* Standard hidden username field so Google Password Manager / iCloud Keychain recognizes and saves the vault password */}
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
              <div>
                <label htmlFor="password" className="sr-only">
                  {isSetup
                    ? bi('كلمة المرور الرئيسية الجديدة', 'New Master Password', 'وشەی نهێنی سەرەکی نوێ')
                    : bi('كلمة المرور', 'Password', 'وشەی نهێنی')}
                </label>
                <div className="pr-pill-input-wrap rounded-2xl bg-surface flex items-center overflow-hidden border border-card-line/50 focus-within:border-primary/45 focus-within:bg-layer transition-all">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={isSetup ? 'new-password' : 'current-password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      isSetup
                        ? bi(
                            'كلمة المرور (10 خانات فأكثر)',
                            'Password (10+ characters)',
                            'وشەی نهێنی (١٠ پیت یان زیاتر)'
                          )
                        : bi('كلمة المرور', 'Password', 'وشەی نهێنی')
                    }
                    className="pr-input-bare flex-1 min-w-0 px-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground-1"
                  />
                  <span className="w-px h-5 bg-card-divider shrink-0" aria-hidden="true" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={
                      showPassword
                        ? bi('إخفاء كلمة المرور', 'Hide password', 'شاردنەوەی وشەی نهێنی')
                        : bi('إظهار كلمة المرور', 'Show password', 'پیشاندانی وشەی نهێنی')
                    }
                    aria-pressed={showPassword}
                    className="pr-eye-bare px-3.5 py-3.5 rounded-none text-muted-foreground-1 hover:text-foreground cursor-pointer flex items-center justify-center shrink-0 focus-visible:bg-layer-hover"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Minimal Setup Password Strength Indicator */}
              {isSetup && password.length > 0 && (
                <div className="px-1 space-y-1.5">
                  <div className="grid grid-cols-4 gap-1.5 h-1" dir="ltr">
                    {[1, 2, 3, 4].map((step) => (
                      <div
                        key={step}
                        className={`rounded-full transition-colors ${
                          pwStrengthScore >= step
                            ? pwStrengthScore >= 3
                              ? 'bg-emerald-500'
                              : pwStrengthScore === 2
                                ? 'bg-amber-500'
                                : 'bg-rose-500'
                            : 'bg-line-2'
                        }`}
                      />
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground-1">
                    <span>
                      {!pwHasMinLen
                        ? bi('10 خانات على الأقل', 'At least 10 characters', 'لانی کەم ١٠ پیت')
                        : !pwHasLetter || !pwHasNumberOrSymbol
                          ? bi('أضف حرفاً ورقماً أو رمزاً', 'Mix letters & numbers/symbols', 'پیت و ژمارە تێکەڵ بکە')
                          : bi('كلمة مرور صالحة وجاهزة', 'Ready & valid password', 'وشەی نهێنی گونجاوە')}
                    </span>
                    <span
                      className={`font-semibold ${
                        pwStrengthScore >= 3
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : pwStrengthScore === 2
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      {pwStrengthScore >= 3
                        ? bi('قوية', 'Strong', 'بەهێز')
                        : pwStrengthScore === 2
                          ? bi('متوسطة', 'Fair', 'مامناوەند')
                          : bi('ضعيفة', 'Weak', 'لاواز')}
                    </span>
                  </div>
                </div>
              )}

              {isSetup && (
                <div>
                  <label htmlFor="confirmPassword" className="sr-only">
                    {bi('تأكيد كلمة المرور', 'Confirm Password', 'دڵنیاکردنەوەی وشەی نهێنی')}
                  </label>
                  <div className="pr-pill-input-wrap rounded-2xl bg-surface flex items-center overflow-hidden border border-card-line/50 focus-within:border-primary/45 focus-within:bg-layer transition-all">
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder={bi(
                        'تأكيد كلمة المرور',
                        'Confirm password',
                        'دووبارەکردنەوەی وشەی نهێنی'
                      )}
                      className="pr-input-bare flex-1 min-w-0 px-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground-1"
                    />
                    {confirmPassword.length > 0 && (
                      <span
                        aria-label={pwMatches ? bi('متطابقتان', 'Matches') : bi('غير متطابقتين', 'Mismatch')}
                        className={`pe-3.5 text-xs font-semibold shrink-0 ${
                          pwMatches
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-rose-700 dark:text-rose-400'
                        }`}
                      >
                        {pwMatches ? '✓' : '×'}
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting || (isSetup && (!pwHasMinLen || !pwMatches))}
                  className="w-full h-12 px-5 rounded-full text-sm font-bold text-primary-foreground bg-primary hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-45 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>
                    {submitting
                      ? bi(
                          'جاري المعالجة...',
                          'Processing...',
                          'خەریکی جێبەجێکردنە...'
                        )
                      : isSetup
                        ? bi(
                            'إنشاء الخزينة المشفرة',
                            'Create Vault',
                            'دروستکردنی خەزێنە'
                          )
                        : bi('فتح الخزينة', 'Unlock', 'کردنەوەی قفڵ')}
                  </span>
                </button>

                {submitting && (
                  <div className="mt-3 space-y-1" role="progressbar" aria-valuenow={kdfProgress} aria-valuemin={0} aria-valuemax={100}>
                    <div className="flex items-center justify-between text-xs text-muted-foreground-1">
                      <span>
                        {bi(
                          'جاري اشتقاق مفتاح التشفير...',
                          'Deriving encryption key...',
                          'خەریکی دەرهێنانی کلیلی نهێنیکردنە...'
                        )}
                      </span>
                      <span dir="ltr" className="font-mono font-bold tabular-nums">{kdfProgress}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-150"
                        style={{ width: `${Math.max(5, Math.min(100, kdfProgress))}%` }}
                      />
                    </div>
                  </div>
                )}

                {!isSetup && isPrfSupported && isPrfEnrolled && (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={async () => {
                      setLocalError(null);
                      setSubmitting(true);
                      try {
                        await unlockWithPrf();
                      } catch (err: unknown) {
                        const msg = err instanceof Error ? err.message : '';
                        setLocalError(
                          msg ||
                            bi(
                              'تعذر فتح القفل بمفتاح المرور. استخدم كلمة المرور الرئيسية.',
                              'Passkey unlock failed. Use your master password.',
                              'کردنەوە بە کلیلی تێپەڕبوون سەرکەوتوو نەبوو. وشەی نهێنی سەرەکی بەکاربهێنە.'
                            )
                        );
                      } finally {
                        setSubmitting(false);
                      }
                    }}
                    className="mt-2.5 w-full h-11 px-4 rounded-full bg-surface hover:bg-layer-hover text-xs font-semibold text-foreground disabled:opacity-50 transition-all cursor-pointer inline-flex items-center justify-center gap-2"
                  >
                    <Fingerprint className="w-4 h-4 text-primary" />
                    <span>
                      {bi(
                        'فتح بالبصمة / مفتاح المرور',
                        'Unlock with Passkey',
                        'کردنەوە بە پەنجەمۆر'
                      )}
                    </span>
                  </button>
                )}
              </div>
            </form>
            )}

            {/* Quiet Privacy Reassurance + Recovery Link */}
            <div className="mt-6 text-center space-y-2.5">
              <p className="text-xs text-muted-foreground-1 leading-relaxed">
                {bi(
                  'بياناتك مشفرة ومحفوظة على هذا الجهاز فقط',
                  'Your clinical records remain encrypted on this device only',
                  'داتاکانت نهێنیکراون و تەنها لەسەر ئەم ئامێرە هەڵدەگیرێن'
                )}
              </p>

              {!isSetup && !schemaDowngradeError && (
                <div className="text-xs text-muted-foreground-1">
                  <span>{bi('نسيت كلمة المرور؟', 'Forgot password?', 'وشەی نهێنیت لەبیرچووە؟')} </span>
                  <button
                    type="button"
                    onClick={() => {
                      setLocalError(null);
                      setRecoveryMethod(isPrfSupported && isPrfEnrolled ? 'prf' : 'key');
                      setShowRecoveryModal(true);
                    }}
                    className="font-bold text-foreground underline underline-offset-4 hover:text-primary cursor-pointer"
                  >
                    {isPrfSupported && isPrfEnrolled
                      ? bi('استعادة بالبصمة أو مفتاح الطوارئ', 'Recover with Passkey or Key', 'گەڕاندنەوە بە پەنجەمۆر یان کلیل')
                      : bi('استعادة بمفتاح الطوارئ', 'Recover here', 'گەڕاندنەوە لێرە')}
                  </button>
                </div>
              )}
            </div>
          </div>

          {renderBottomIconBar()}
        </main>

        <div className="pr-auth-spacer" aria-hidden="true" />

      {/* Recovery Key Modal */}
      <ModalDialog
        isOpen={showRecoveryModal}
        onOpenChange={(open) => {
          if (!open) setShowRecoveryModal(false);
        }}
        size="sm"
        dir={isRtl ? 'rtl' : 'ltr'}
        title={
          <span className="inline-flex items-center gap-2 text-sm sm:text-base font-bold text-primary-foreground">
            <Key className="w-4 h-4 shrink-0" />
            <span>
              {bi(
                'استرداد الخزينة بمفتاح الطوارئ (Recovery Key)',
                'Recover Vault with Emergency Key',
                'گەڕاندنەوەی خەزێنە بە کلیلی فریاگوزاری (Recovery Key)'
              )}
            </span>
          </span>
        }
        ariaLabel={bi(
          'استرداد الخزينة بمفتاح الطوارئ (Recovery Key)',
          'Recover Vault with Emergency Key',
          'گەڕاندنەوەی خەزێنە بە کلیلی فریاگوزاری (Recovery Key)'
        )}
        closeLabel={bi('إغلاق', 'Close', 'داخستن')}
        className="bg-card border-card-line"
        bodyClassName="p-6 space-y-4 overflow-y-auto"
      >

            {isPrfSupported && isPrfEnrolled && (
              <div
                role="tablist"
                aria-label={bi('طريقة الاسترداد', 'Recovery method', 'شێوازی گەڕاندنەوە')}
                className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-surface border border-line-2"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={recoveryMethod === 'prf'}
                  data-testid="recovery-method-prf-tab"
                  onClick={() => {
                    setLocalError(null);
                    setRecoveryMethod('prf');
                  }}
                  className={`min-h-[34px] px-2.5 py-1.5 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                    recoveryMethod === 'prf'
                      ? 'bg-primary text-primary-foreground shadow-2xs'
                      : 'text-muted-foreground-1 hover:text-foreground'
                  }`}
                >
                  <Fingerprint className="size-3.5 shrink-0" />
                  <span>{bi('بالبصمة (سريع)', 'Passkey (Fast)', 'بە پەنجەمۆر')}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={recoveryMethod === 'key'}
                  data-testid="recovery-method-key-tab"
                  onClick={() => {
                    setLocalError(null);
                    setRecoveryMethod('key');
                  }}
                  className={`min-h-[34px] px-2.5 py-1.5 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                    recoveryMethod === 'key'
                      ? 'bg-primary text-primary-foreground shadow-2xs'
                      : 'text-muted-foreground-1 hover:text-foreground'
                  }`}
                >
                  <Key className="size-3.5 shrink-0" />
                  <span>{bi('مفتاح الطوارئ', 'Recovery Key', 'کلیلی فریاگوزاری')}</span>
                </button>
              </div>
            )}

            <p className="text-xs text-muted-foreground-2 leading-relaxed">
              {recoveryMethod === 'prf' && isPrfSupported && isPrfEnrolled
                ? bi(
                    'استخدم بصمة جهازك أو مفتاح المرور (Windows Hello / Touch ID / بصمة الهاتف) لتعيين كلمة مرور رئيسية جديدة فوراً دون فقدان أي سجل.',
                    'Use your device biometrics or Passkey to set a new master password immediately without losing any clinical record.',
                    'پەنجەمۆری ئامێرەکەت بەکاربهێنە بۆ دانانی وشەی نهێنی نوێ بەبێ لەدەستدانی هیچ تۆمارێک.'
                  )
                : bi(
                    'أدخل مفتاح الاسترداد الطارئ المكون من 32 خانة لفك تغليف مفتاح البيانات الأصلي (DEK) وتعيين كلمة مرور جديدة دون فقدان أي سجل.',
                    'Enter your 32-character Emergency Recovery Key to unwrap the original DEK and set a new master password without losing any data.',
                    'کلیلی فریاگوزاری ٣٢ پیتی بنووسە بۆ کردنەوەی کلیلی داتای بنەڕەتی (DEK) و دانانی وشەی نهێنی نوێ بێ لەدەستدانی هیچ تۆمارێک.'
                  )}
            </p>

            {displayError && (
              <div className="p-3 bg-surface/75 rounded-xl text-xs text-rose-700 dark:text-rose-400">
                {displayError}
              </div>
            )}

            <form onSubmit={handleRecoverySubmit} className="space-y-3">
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

              {!(recoveryMethod === 'prf' && isPrfSupported && isPrfEnrolled) && (
                <div>
                  <label htmlFor="recovery-key-input" className="block text-xs font-bold text-foreground mb-1">
                    {bi(
                      'مفتاح الاسترداد الطارئ (Recovery Key):',
                      'Recovery Key:',
                      'کلیلی فریاگوزاری (Recovery Key):'
                    )}
                  </label>
                  <input
                    id="recovery-key-input"
                    type="text"
                    dir="ltr"
                    required
                    value={recoveryKeyInput}
                    onChange={(e) => setRecoveryKeyInput(e.target.value)}
                    placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                    className="w-full px-3 py-2 text-xs font-mono border border-layer-line rounded-xl bg-layer text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
              )}

              <div>
                <label htmlFor="recovery-new-password-input" className="block text-xs font-bold text-foreground mb-1">
                  {bi(
                    'كلمة المرور الرئيسية الجديدة (10 خانات على الأقل):',
                    'New Master Password (min 10 chars):',
                    'وشەی نهێنی سەرەکی نوێ (لانی کەم ١٠ پیت):'
                  )}
                </label>
                <input
                  id="recovery-new-password-input"
                  type="password"
                  autoComplete="new-password"
                  dir="ltr"
                  required
                  value={newVaultPassword}
                  onChange={(e) => setNewVaultPassword(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-layer-line rounded-xl bg-layer text-foreground focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label htmlFor="recovery-confirm-password-input" className="block text-xs font-bold text-foreground mb-1">
                  {bi(
                    'تأكيد كلمة المرور الجديدة:',
                    'Confirm New Password:',
                    'دڵنیاکردنەوەی وشەی نهێنی نوێ:'
                  )}
                </label>
                <input
                  id="recovery-confirm-password-input"
                  type="password"
                  autoComplete="new-password"
                  dir="ltr"
                  required
                  value={confirmNewVaultPassword}
                  onChange={(e) => setConfirmNewVaultPassword(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-layer-line rounded-xl bg-layer text-foreground focus:outline-none focus:border-primary"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRecoveryModal(false)}
                  className="px-4 py-2 rounded-xl bg-surface text-foreground text-xs font-bold cursor-pointer"
                >
                  {bi('إلغاء', 'Cancel', 'پاشگەزبوونەوە')}
                </button>
                <button
                  type="submit"
                  data-testid="recovery-submit-btn"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {recoveryMethod === 'prf' && isPrfSupported && isPrfEnrolled && (
                    <Fingerprint className="size-3.5 shrink-0" />
                  )}
                  <span>
                    {submitting
                      ? bi('جاري الاسترداد...', 'Recovering...', 'خەریکی گەڕاندنەوەیە...')
                      : recoveryMethod === 'prf' && isPrfSupported && isPrfEnrolled
                        ? bi(
                            'تحقق بالبصمة وتعيين كلمة المرور',
                            'Verify Passkey & Reset Password',
                            'پشکنینی پەنجەمۆر و دانانی وشەی نهێنی'
                          )
                        : bi(
                            'استرداد الخزينة وحفظ كلمة المرور',
                            'Recover Vault',
                            'گەڕاندنەوەی خەزێنە و پاشەکەوتکردنی وشەی نهێنی'
                          )}
                  </span>
                </button>
              </div>
            </form>

            {/* Destructive Wipe Option inside Forgot Password Flow */}
            <div className="pt-4 border-t border-card-divider flex flex-col gap-2">
              <p className="text-xs text-muted-foreground-1">
                {bi(
                  'إذا فقدت كلمة المرور ومفتاح الاسترداد الطارئ معاً، لن يكون بالإمكان فك تشفير السجلات ويمكنك فقط مسح الخزينة لبدء خزينة جديدة:',
                  'If both your master password and Emergency Recovery Key are lost, records cannot be decrypted and you can only wipe the vault:',
                  'ئەگەر هەردوو وشەی نهێنی و کلیلی فریاگوزاریت پێکەوە لەدەستدا، ناتوانرێت تۆمارەکان بکرێنەوە و تەنها دەتوانیت خەزێنەکە بسڕیتەوە بۆ دەستپێکردنەوەی خەزێنەیەکی نوێ:'
                )}
              </p>
              <button
                type="button"
                onClick={() => {
                  setShowRecoveryModal(false);
                  setLocalError(null);
                  setShowWipeModal(true);
                }}
                className="self-start inline-flex items-center gap-1.5 text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>
                  {bi(
                    'مسح الخزينة نهائياً (Wipe Vault)',
                    'Wipe Vault Permanently',
                    'سڕینەوەی یەکجاری خەزێنە (Wipe Vault)'
                  )}
                </span>
              </button>
            </div>
      </ModalDialog>

      {/* Destructive Factory Wipe Modal */}
      <ModalDialog
        isOpen={showWipeModal}
        onOpenChange={(open) => {
          if (!open) {
            setShowWipeModal(false);
            setWipeConfirmInput('');
          }
        }}
        role="alertdialog"
        size="sm"
        dir={isRtl ? 'rtl' : 'ltr'}
        title={
          <span className="inline-flex items-center gap-2 text-sm sm:text-base font-bold text-primary-foreground">
            <Trash2 className="w-4 h-4 shrink-0" />
            <span>
              {bi(
                'تحذير حاسم: إتلاف ومسح الخزينة بالكامل (Factory Wipe)',
                'Critical Warning: Complete Vault Factory Wipe',
                'ئاگاداری یەکلاکەرەوە: سڕینەوەی تەواوی خەزێنە (Factory Wipe)'
              )}
            </span>
          </span>
        }
        ariaLabel={bi(
          'تحذير حاسم: إتلاف ومسح الخزينة بالكامل (Factory Wipe)',
          'Critical Warning: Complete Vault Factory Wipe',
          'ئاگاداری یەکلاکەرەوە: سڕینەوەی تەواوی خەزێنە (Factory Wipe)'
        )}
        closeLabel={bi('إغلاق', 'Close', 'داخستن')}
        className="bg-card"
        bodyClassName="p-6 space-y-4 overflow-y-auto"
      >

            <p className="text-xs text-muted-foreground-2 leading-relaxed">
              {bi(
                'سيؤدي هذا الإجراء إلى حذف كافة سجلات المرضى، وحلقات الرعاية، والجلسات، وملاحظات SOAP، والملاحق السريرية من هذا المتصفح نهائياً دون إمكانية التراجع. لا تستخدم هذا الخيار إلا إذا فقدت كلمة المرور ومفتاح الاسترداد معاً.',
                'This action permanently deletes all patients, episodes, sessions, SOAP notes, and clinical addenda stored in this browser. Only proceed if both your password and recovery key are permanently lost.',
                'ئەم کارە هەموو تۆمارەکانی نەخۆش، خولە چارەسەرییەکان، دانیشتنەکان، تێبینییەکانی SOAP و پاشکۆ کلینیکییەکان لەم وێبگەڕەدا بە یەکجاری دەسڕێتەوە بێ گەڕانەوە. تەنها کاتێک بەکاریبهێنە کە هەردوو وشەی نهێنی و کلیلی گەڕاندنەوەت لەدەستدابێت.'
              )}
            </p>

            <form onSubmit={handleFactoryWipe} className="space-y-3">
              <div>
                <label htmlFor="wipe-confirm-input" className="block text-xs font-bold text-foreground mb-1">
                  {bi(
                    'اكتب عبارة "حذف نهائي" أو "WIPE" للتأكيد:',
                    'Type "WIPE" to confirm:',
                    'دەستەواژەی "سڕینەوەی یەکجاری" یان "WIPE" بنووسە بۆ دڵنیاکردنەوە:'
                  )}
                </label>
                <input
                  id="wipe-confirm-input"
                  type="text"
                  required
                  value={wipeConfirmInput}
                  onChange={(e) => setWipeConfirmInput(e.target.value)}
                  placeholder={bi('حذف نهائي / WIPE', 'WIPE', 'سڕینەوەی یەکجاری / WIPE')}
                  className="w-full px-3 py-2 text-xs border border-rose-300 dark:border-rose-800 rounded-xl bg-layer text-foreground focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowWipeModal(false);
                    setWipeConfirmInput('');
                  }}
                  className="px-4 py-2 rounded-xl bg-surface text-foreground text-xs font-bold cursor-pointer"
                >
                  {bi('إلغاء', 'Cancel', 'پاشگەزبوونەوە')}
                </button>
                <button
                  type="submit"
                  disabled={
                    submitting ||
                    ![
                      'حذف نهائي',
                      'WIPE',
                      'مسح',
                      'مسح نهائي',
                      'سڕینەوەی یەکجاری',
                      'سڕینەوە',
                    ].includes(wipeConfirmInput.trim().toUpperCase())
                  }
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white disabled:bg-surface disabled:text-muted-foreground-2 disabled:border disabled:border-layer-line disabled:cursor-not-allowed text-xs font-bold cursor-pointer"
                >
                  {bi(
                    'تأكيد المسح النهائي للخزينة',
                    'Confirm Permanent Wipe',
                    'دڵنیاکردنەوەی سڕینەوەی یەکجاری خەزێنە'
                  )}
                </button>
              </div>
            </form>
      </ModalDialog>
    </div>
  );
};
