// =======================================================================
// PhysioRecord — Cryptographic Vault Gate & Authentication
// Supports First-Time Setup, Recovery Key Generation, Vault Unlock & Wipe
// =======================================================================

import React, { useState, useMemo } from 'react';
import { useVault } from '../context/VaultContext';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { LanguageSwitcher } from './ui/LanguageSwitcher';
import { ModalDialog } from './ui/Dialog';
import { copySecretWithAutoClear } from '../utils/clipboardPrivacy';
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
  Activity,
  Download,
  Printer,
  Fingerprint,
} from 'lucide-react';

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
    wipeDatabase,
  } = useVault();
  const { isRtl, bi } = useLanguage();
  const { theme, toggleTheme } = useTheme();

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

  // Recovery Mode (Unlock using 32-char Recovery Key + Set New Password)
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
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

    if (!recoveryKeyInput.trim()) {
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

  // Step 2 of Setup: Display One-Time Emergency Recovery Key
  if (generatedRecoveryKey) {
    return (
      <div
        className="min-h-screen bg-background-1 flex flex-col justify-center py-8 px-4 sm:px-6 lg:px-8"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        <div className="sm:mx-auto sm:w-full sm:max-w-lg">
          <div className="bg-card py-6 px-6 shadow-xl rounded-2xl border border-card-line space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                  {bi('خطوة الأمان 2 من 2', 'Security Step 2 of 2', 'هەنگاوی سەلامەتی ٢ لە ٢')}
                </span>
                <h2 className="text-base font-extrabold text-foreground mt-0.5">
                  {bi(
                    'مفتاح الاسترداد الطارئ للخزينة',
                    'Emergency Vault Recovery Key',
                    'کلیلی فریاگوزاری گەڕاندنەوەی خەزێنە'
                  )}
                </h2>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/80 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
              {bi(
                'انسخ هذا المفتاح أو حمّله واحتفظ به في مكان آمن خارج المتصفح. في حال نسيان كلمة المرور، يُعد هذا المفتاح الوسيلة الوحيدة لاستعادة سجلات المرضى.',
                'Copy, download, or print this key and store it outside your browser. If you forget your password, this key is the only way to recover your records.',
                'ئەم کلیلە کۆپی بکە یان دایبەزێنە و لە شوێنێکی سەلامەت لە دەرەوەی وێبگەڕەکە هەڵیبگرە. ئەگەر وشەی نهێنییەکەت لەبیرچووەوە، ئەم کلیلە تاکە ڕێگایە بۆ گەڕاندنەوەی تۆمارەکانی نەخۆش.'
              )}
            </div>

            {/* Recovery Key Grouped Blocks (Never Orphan-Wraps) */}
            <div
              dir="ltr"
              className="p-4 rounded-xl bg-muted border border-layer-line grid grid-cols-2 sm:grid-cols-4 gap-2 text-center select-all"
            >
              {recoveryGroups.map((grp, idx) => (
                <div
                  key={idx}
                  className="py-2 px-2 rounded-lg bg-card border border-card-line font-mono text-xs sm:text-sm font-bold text-primary whitespace-nowrap flex items-center justify-center gap-1.5"
                >
                  <span className="text-xs text-muted-foreground-1 select-none">
                    #{idx + 1}
                  </span>
                  <span>{grp}</span>
                </div>
              ))}
            </div>

            {/* Action Buttons: Copy / Download .txt / Print */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={handleCopyRecoveryKey}
                className="py-2 px-3 rounded-xl bg-layer hover:bg-layer-hover text-foreground border border-layer-line text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                {copiedRecoveryKey ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span>{bi('تم النسخ (يُمسح بعد 60ث)', 'Copied (clears 60s)', 'کۆپی کرا (دوای ٦٠چ دەسڕدرێتەوە)')}</span>
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
                className="py-2 px-3 rounded-xl bg-layer hover:bg-layer-hover text-foreground border border-layer-line text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-primary" />
                <span>{bi('تحميل', 'Download', 'داگرتن')} <bdi dir="ltr">.txt</bdi></span>
              </button>

              <button
                type="button"
                onClick={handlePrintRecoveryKey}
                className="py-2 px-3 rounded-xl bg-layer hover:bg-layer-hover text-foreground border border-layer-line text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <Printer className="w-3.5 h-3.5 text-primary" />
                <span>{bi('طباعة', 'Print', 'چاپکردن')}</span>
              </button>
            </div>

            {/* Re-type Random Group Verification */}
            <div className="p-3.5 rounded-xl bg-surface border border-line-2 space-y-2">
              <label htmlFor="challenge-group-input" className="block text-xs font-bold text-foreground">
                {bi(
                  `لتأكيد حفظك للمفتاح، أعد كتابة المجموعة رقم #${challengeGroupIndex + 1}:`,
                  `To verify backup, re-type Group #${challengeGroupIndex + 1}:`,
                  `بۆ دڵنیاکردنەوەی هەڵگرتنی کلیلەکە، کۆمەڵەی ژمارە #${challengeGroupIndex + 1} دووبارە بنووسەرەوە:`
                )}
              </label>
              <input
                id="challenge-group-input"
                type="text"
                dir="ltr"
                value={challengeGroupInput}
                onChange={(e) => setChallengeGroupInput(e.target.value)}
                placeholder={expectedChallengeGroup}
                className="w-full px-3 py-2 rounded-lg bg-card border border-layer-line font-mono text-sm font-bold text-center uppercase tracking-widest text-foreground placeholder:text-muted-foreground-2 placeholder:opacity-80 focus:outline-none focus:border-primary"
              />
            </div>

            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-muted/60 border border-layer-line cursor-pointer">
              <input
                type="checkbox"
                checked={confirmedSavedRecoveryKey}
                onChange={(e) => setConfirmedSavedRecoveryKey(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded text-primary focus:ring-primary"
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
              className="w-full py-2.5 px-4 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground disabled:bg-surface disabled:text-muted-foreground-2 disabled:border disabled:border-layer-line disabled:shadow-none disabled:cursor-not-allowed font-bold text-xs shadow-sm transition-all cursor-pointer"
            >
              {bi(
                'الدخول إلى مساحة العمل السريرية',
                'Enter Clinical Workspace',
                'چوونە ناو شوێنی کاری کلینیکی'
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-background-1 text-foreground flex flex-col justify-between relative overflow-hidden transition-colors"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Top Minimal Utility Bar */}
      <header className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-xs">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <span className="font-extrabold text-sm text-foreground tracking-tight block">
              PhysioRecord
            </span>
            <p className="text-xs text-muted-foreground-1">
              {bi(
                'نظام السجلات الصحية للعلاج الطبيعي',
                'Physical Therapy Clinical EHR',
                'سیستەمی تۆماری تەندروستی بۆ چارەسەری سروشتی'
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={
              theme === 'dark'
                ? bi('الوضع النهاري', 'Light Mode', 'دۆخی ڕۆژ')
                : bi('الوضع الليلي', 'Dark Mode', 'دۆخی شەو')
            }
            className="p-2 rounded-xl bg-layer border border-layer-line text-foreground hover:bg-layer-hover transition-colors cursor-pointer shadow-2xs"
            title={
              theme === 'dark'
                ? bi('الوضع النهاري', 'Light Mode', 'دۆخی ڕۆژ')
                : bi('الوضع الليلي', 'Dark Mode', 'دۆخی شەو')
            }
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-slate-600" />
            )}
          </button>

          <LanguageSwitcher compact />
        </div>
      </header>

      {/* Minimal Centered Card */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-6 py-6">
        <div className="w-full max-w-md">
          <div className="bg-card py-7 px-6 sm:px-8 shadow-lg rounded-2xl border border-card-line">
            <div className="flex items-center gap-3 pb-5 mb-5 border-b border-card-divider">
              <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-xs shrink-0">
                {isSetup ? <ShieldCheck className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
              </div>
              <div>
                <h1 className="text-base font-extrabold text-foreground">
                  {isSetup
                    ? bi(
                        'إعداد كلمة المرور الرئيسية',
                        'Create Master Vault Password',
                        'ڕێکخستنی وشەی نهێنی سەرەکی'
                      )
                    : bi('فتح الخزينة السريرية', 'Unlock Clinical Vault', 'کردنەوەی خەزێنەی کلینیکی')}
                </h1>
                <p className="text-xs text-muted-foreground-1">
                  {isSetup
                    ? bi(
                        'الخطوة 1 من 2: تعيين كلمة مرور الخزينة',
                        'Step 1 of 2: Set master password',
                        'هەنگاوی ١ لە ٢: دیاریکردنی وشەی نهێنی خەزێنە'
                      )
                    : bi(
                        'أدخل كلمة المرور للوصول إلى سجلات المرضى',
                        'Enter your password to access patient records',
                        'وشەی نهێنی بنووسە بۆ گەیشتن بە تۆمارەکانی نەخۆش'
                      )}
                </p>
              </div>
            </div>

            {displayError && (
              <div className="mb-5 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 flex items-start gap-2.5 text-rose-800 dark:text-rose-200 text-xs">
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <span>{displayError}</span>
              </div>
            )}

            {schemaDowngradeError ? (
              <div
                data-testid="schema-downgrade-blocked-card"
                className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/35 text-xs space-y-2.5 text-foreground"
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
                    'تم ترقية قاعدة البيانات المحلية على هذا الجهاز بواسطة إصدار أحدث من PhysioRecord. لحماية سجلات المرضى من التلف أو الاستبدال، تم إيقاف فتح القاعدة بهذا الإصدار القديم. يرجى تثبيت أحدث إصدار من التطبيق للمتابعة بأمان.',
                    'The local database on this device was upgraded by a newer version of PhysioRecord. To protect patient records from corruption or accidental overwrite, opening with this older version is blocked. Please install the latest PhysioRecord release to continue safely.',
                    'داتابەیسی ناوخۆیی لەسەر ئەم ئامێرە لەلایەن وەشانێکی نوێتری PhysioRecord نوێکراوەتەوە. بۆ پاراستنی تۆمارەکانی نەخۆش، تکایە نوێترین وەشانی بەرنامەکە دابەزێنە.'
                  )}
                </p>
                <p className="font-mono text-2xs text-muted-foreground-2 break-all" dir="ltr">
                  {schemaDowngradeError.message}
                </p>
              </div>
            ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label
                  htmlFor="password"
                  className="block text-xs font-bold text-foreground mb-1.5"
                >
                  {isSetup
                    ? bi(
                        'كلمة المرور الرئيسية الجديدة',
                        'New Master Password',
                        'وشەی نهێنی سەرەکی نوێ'
                      )
                    : bi('كلمة المرور', 'Password', 'وشەی نهێنی')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 start-0 ps-3.5 flex items-center pointer-events-none text-muted-foreground-1">
                    <KeyRound className="h-4 w-4" />
                  </div>
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
                            'أدخل 10 خانات على الأقل...',
                            'Enter at least 10 characters...',
                            'لانی کەم ١٠ پیت بنووسە...'
                          )
                        : '••••••••••'
                    }
                    className="block w-full ps-10 pe-10 py-2.5 border border-layer-line rounded-xl text-foreground bg-layer placeholder:text-muted-foreground-1 focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary text-sm transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={
                      showPassword
                        ? bi('إخفاء كلمة المرور', 'Hide password', 'شاردنەوەی وشەی نهێنی')
                        : bi('إظهار كلمة المرور', 'Show password', 'پیشاندانی وشەی نهێنی')
                    }
                    aria-pressed={showPassword}
                    className="absolute inset-y-0 end-0 pe-3 flex items-center text-muted-foreground-1 hover:text-foreground cursor-pointer"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Setup Password Strength Bar & Live Checklist */}
              {isSetup && (
                <div className="space-y-2.5 p-3 rounded-xl bg-surface border border-line-2">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-muted-foreground-1">
                      {bi('قوة كلمة المرور:', 'Password strength:', 'هێزی وشەی نهێنی:')}
                    </span>
                    <span
                      className={
                        pwStrengthScore >= 3
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : pwStrengthScore === 2
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-rose-600 dark:text-rose-400'
                      }
                    >
                      {pwStrengthScore >= 3
                        ? bi('قوية', 'Strong', 'بەهێز')
                        : pwStrengthScore === 2
                          ? bi('متوسطة', 'Fair', 'مامناوەند')
                          : bi('ضعيفة', 'Weak', 'لاواز')}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 h-1.5" dir="ltr">
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
                  <ul className="space-y-1 text-xs">
                    <li
                      className={`flex items-center gap-1.5 ${
                        pwHasMinLen
                          ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                          : 'text-muted-foreground-1'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {bi(
                          '10 خانات على الأقل (إلزامي)',
                          'At least 10 characters (required)',
                          'لانی کەم ١٠ پیت (پێویستە)'
                        )}
                      </span>
                    </li>
                    <li
                      className={`flex items-center gap-1.5 ${
                        pwHasLetter
                          ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                          : 'text-muted-foreground-1'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>{bi('تحتوي على أحرف', 'Contains letters', 'پیت لەخۆدەگرێت')}</span>
                    </li>
                    <li
                      className={`flex items-center gap-1.5 ${
                        pwHasNumberOrSymbol
                          ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                          : 'text-muted-foreground-1'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {bi(
                          'تحتوي على رقم أو رمز',
                          'Contains a number or symbol',
                          'ژمارە یان هێمایەک لەخۆدەگرێت'
                        )}
                      </span>
                    </li>
                  </ul>
                </div>
              )}

              {isSetup && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="confirmPassword"
                      className="block text-xs font-bold text-foreground"
                    >
                      {bi('تأكيد كلمة المرور', 'Confirm Password', 'دڵنیاکردنەوەی وشەی نهێنی')}
                    </label>
                    {confirmPassword.length > 0 && (
                      <span
                        className={`text-xs font-semibold ${
                          pwMatches
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {pwMatches
                          ? bi('متطابقتان ✓', 'Passwords match ✓', 'هاوتان ✓')
                          : bi('غير متطابقتين', 'Do not match', 'وەک یەک نین')}
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 start-0 ps-3.5 flex items-center pointer-events-none text-muted-foreground-1">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder={bi(
                        'أعد كتابة كلمة المرور للتأكيد...',
                        'Re-enter password...',
                        'وشەی نهێنی دووبارە بنووسەرەوە...'
                      )}
                      className="block w-full ps-10 pe-10 py-2.5 border border-layer-line rounded-xl text-foreground bg-layer placeholder:text-muted-foreground-1 focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary text-sm transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={
                        showPassword
                          ? bi('إخفاء كلمة المرور', 'Hide password', 'شاردنەوەی وشەی نهێنی')
                          : bi('إظهار كلمة المرور', 'Show password', 'پیشاندانی وشەی نهێنی')
                      }
                      aria-pressed={showPassword}
                      className="absolute inset-y-0 end-0 pe-3 flex items-center text-muted-foreground-1 hover:text-foreground cursor-pointer"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              <div className="pt-1">
                <button
                  type="submit"
                  disabled={submitting || (isSetup && (!pwHasMinLen || !pwMatches))}
                  className="w-full flex justify-center items-center gap-2 py-2.5 px-4 rounded-xl shadow-xs text-xs sm:text-sm font-bold text-primary-foreground bg-primary hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:bg-surface disabled:text-muted-foreground-2 disabled:border disabled:border-layer-line disabled:shadow-none disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  <Lock className="w-4 h-4" />
                  <span>
                    {submitting
                      ? bi(
                          'جاري المعالجة...',
                          'Processing...',
                          'خەریکی جێبەجێکردنە...'
                        )
                      : isSetup
                        ? bi(
                            'إنشاء الخزينة وتوليد مفتاح الاسترداد',
                            'Create Vault & Generate Recovery Key',
                            'دروستکردنی خەزێنە و کلیلی گەڕاندنەوە'
                          )
                        : bi('فتح القفل', 'Unlock', 'کردنەوەی قفڵ')}
                  </span>
                </button>

                {submitting && (
                  <div className="mt-2.5 space-y-1" role="progressbar" aria-valuenow={kdfProgress} aria-valuemin={0} aria-valuemax={100}>
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
                    className="mt-2.5 w-full flex justify-center items-center gap-2 py-2.5 px-4 rounded-xl border border-card-line bg-layer hover:bg-muted/60 text-xs font-bold text-foreground disabled:opacity-50 transition-all cursor-pointer"
                  >
                    <Fingerprint className="w-4 h-4 text-primary" />
                    <span>
                      {bi(
                        'فتح القفل بمفتاح المرور / البصمة',
                        'Unlock with Passkey / Biometrics',
                        'کردنەوەی قفڵ بە پەنجەمۆر / کلیلی تێپەڕبوون'
                      )}
                    </span>
                  </button>
                )}
              </div>
            </form>
            )}

            {/* Recovery & Reset Options when Locked */}
            {!isSetup && !schemaDowngradeError && (
              <div className="mt-5 pt-4 border-t border-card-divider flex flex-wrap items-center justify-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setLocalError(null);
                    setShowRecoveryModal(true);
                  }}
                  className="text-primary hover:underline font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>
                    {bi('نسيت كلمة المرور؟', 'Forgot password?', 'وشەی نهێنیت لەبیرچووە؟')}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-4 text-center text-xs text-muted-foreground-1">
        {bi(
          'بياناتك مشفرة ومحفوظة على هذا الجهاز فقط',
          'Your data is encrypted and stored on this device only',
          'داتاکانت نهێنیکراون و تەنها لەسەر ئەم ئامێرە هەڵدەگیرێن'
        )}
      </footer>

      {/* Recovery Key Modal */}
      <ModalDialog
        isOpen={showRecoveryModal}
        onOpenChange={(open) => {
          if (!open) setShowRecoveryModal(false);
        }}
        size="sm"
        dir={isRtl ? 'rtl' : 'ltr'}
        hideCloseButton
        ariaLabel={bi(
          'استرداد الخزينة بمفتاح الطوارئ (Recovery Key)',
          'Recover Vault with Emergency Key',
          'گەڕاندنەوەی خەزێنە بە کلیلی فریاگوزاری (Recovery Key)'
        )}
        closeLabel={bi('إغلاق', 'Close', 'داخستن')}
        className="bg-card border-card-line"
        bodyClassName="p-6 space-y-4 overflow-y-auto"
      >
            <div className="flex items-center gap-2.5 text-primary font-bold text-sm">
              <Key className="w-5 h-5" />
              <h3>
                {bi(
                  'استرداد الخزينة بمفتاح الطوارئ (Recovery Key)',
                  'Recover Vault with Emergency Key',
                  'گەڕاندنەوەی خەزێنە بە کلیلی فریاگوزاری (Recovery Key)'
                )}
              </h3>
            </div>

            <p className="text-xs text-muted-foreground-2 leading-relaxed">
              {bi(
                'أدخل مفتاح الاسترداد الطارئ المكون من 32 خانة لفك تغليف مفتاح البيانات الأصلي (DEK) وتعيين كلمة مرور جديدة دون فقدان أي سجل.',
                'Enter your 32-character Emergency Recovery Key to unwrap the original DEK and set a new master password without losing any data.',
                'کلیلی فریاگوزاری ٣٢ پیتی بنووسە بۆ کردنەوەی کلیلی داتای بنەڕەتی (DEK) و دانانی وشەی نهێنی نوێ بێ لەدەستدانی هیچ تۆمارێک.'
              )}
            </p>

            {displayError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-700 dark:text-rose-200">
                {displayError}
              </div>
            )}

            <form onSubmit={handleRecoverySubmit} className="space-y-3">
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
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold cursor-pointer"
                >
                  {submitting
                    ? bi('جاري الاسترداد...', 'Recovering...', 'خەریکی گەڕاندنەوەیە...')
                    : bi(
                        'استرداد الخزينة وحفظ كلمة المرور',
                        'Recover Vault',
                        'گەڕاندنەوەی خەزێنە و پاشەکەوتکردنی وشەی نهێنی'
                      )}
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
        hideCloseButton
        ariaLabel={bi(
          'تحذير حاسم: إتلاف ومسح الخزينة بالكامل (Factory Wipe)',
          'Critical Warning: Complete Vault Factory Wipe',
          'ئاگاداری یەکلاکەرەوە: سڕینەوەی تەواوی خەزێنە (Factory Wipe)'
        )}
        closeLabel={bi('إغلاق', 'Close', 'داخستن')}
        className="bg-card border-rose-300 dark:border-rose-800"
        bodyClassName="p-6 space-y-4 overflow-y-auto"
      >
            <div className="flex items-center gap-2.5 text-rose-600 font-bold text-sm">
              <Trash2 className="w-5 h-5" />
              <h3>
                {bi(
                  'تحذير حاسم: إتلاف ومسح الخزينة بالكامل (Factory Wipe)',
                  'Critical Warning: Complete Vault Factory Wipe',
                  'ئاگاداری یەکلاکەرەوە: سڕینەوەی تەواوی خەزێنە (Factory Wipe)'
                )}
              </h3>
            </div>

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
