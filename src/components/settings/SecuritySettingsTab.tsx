import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BellRing,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Database,
  ExternalLink,
  Fingerprint,
  HardDrive,
  KeyRound,
  Laptop,
  Lock,
  RefreshCw,
  Shield,
  ShieldCheck,
  Smartphone,
  Tablet,
  Upload,
} from 'lucide-react';
import { isElectronDesktop } from '../../platform/nativeBridge';
import {
  getSecuritySettingsCopy,
  useDeviceFormFactor,
} from '../../utils/deviceBiometricCopy';
import { useLanguage } from '../../context/LanguageContext';
import { useVault } from '../../context/VaultContext';
import { requestPersistentStorage } from '../../db/db';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import type { SettingsViewMode } from '../../types/clinicManagement';
import { copySecretWithAutoClear } from '../../utils/securityHardening';
import {
  getReminderIntervalDays,
  VAULT_CREDENTIAL_USERNAME,
} from '../../utils/passwordReminderSchedule';
import { PlatformUpdateCenterCard } from '../clinic/PlatformUpdateCenterCard';
import { PasswordReminderModal } from '../auth/PasswordReminderModal';
import { sanitizeDurationDraft } from '../../utils/date';
import { normalizeVaultPinInput, validateVaultPin } from '../../crypto/vaultPin';
import { SettingsAccordion, SettingsSwitchRow } from './SettingsPrimitives';

interface SecuritySettingsTabProps {
  isModalOpen: boolean;
  isSoloMode: boolean;
  settingsViewMode: SettingsViewMode;
  onSwitchSettingsMode: (mode: SettingsViewMode) => void;
  onOpenBackupModal?: () => void;
  onOpenRecoveryDrill: () => void;
  onOpenFullExport: () => void;
  onOpenCsvOnboarding: () => void;
}

const PRESET_LOCK_MS = [
  1 * 60 * 1000,
  5 * 60 * 1000,
  10 * 60 * 1000,
  15 * 60 * 1000,
  30 * 60 * 1000,
  0,
];

export const SecuritySettingsTab: React.FC<SecuritySettingsTabProps> = ({
  isModalOpen,
  isSoloMode,
  settingsViewMode,
  onSwitchSettingsMode,
  onOpenBackupModal,
  onOpenRecoveryDrill,
  onOpenFullExport,
  onOpenCsvOnboarding,
}) => {
  const { language, bi } = useLanguage();
  const deviceFormFactor = useDeviceFormFactor();
  const {
    autoLockTimeoutMs,
    setAutoLockTimeoutMs,
    persistenceGranted,
    keyUsageStatus,
    refreshKeyUsageStatus,
    rotateDekNow,
    lastRecoveryDrillAt,
    isPrfSupported,
    isPrfEnrolled,
    isPinEnrolled,
    vaultKek,
    biometricMode,
    biometricUnavailableReason,
    enrollPrf,
    disablePrf,
    enrollPin,
    disablePin,
    changeVaultPassword,
    resetPasswordWithPrf,
    passwordReminderState,
    setPasswordReminderEnabled,
  } = useVault();

  const securityCopy = useMemo(
    () =>
      getSecuritySettingsCopy({
        device: deviceFormFactor,
        isPrfSupported,
        biometricMode,
        unavailableReason: biometricUnavailableReason,
        isElectronShell: isElectronDesktop(),
      }),
    [deviceFormFactor, isPrfSupported, biometricMode, biometricUnavailableReason]
  );

  const DeviceIcon =
    deviceFormFactor === 'desktop'
      ? Laptop
      : deviceFormFactor === 'tablet'
        ? Tablet
        : Smartphone;

  const [storageEstimate, setStorageEstimate] = useState<{ usageMB: number; quotaMB: number } | null>(null);
  const [localPersistenceState, setLocalPersistenceState] = useState<boolean>(persistenceGranted);
  const [rotatingDek, setRotatingDek] = useState(false);
  const [rotatedRecoveryKey, setRotatedRecoveryKey] = useState<string | null>(null);
  const [copiedRotatedKey, setCopiedRotatedKey] = useState(false);
  const [rotationError, setRotationError] = useState<string | null>(null);
  const [prfBusy, setPrfBusy] = useState(false);
  const [prfError, setPrfError] = useState<string | null>(null);

  // Quick Vault PIN Unlock (Desktop & Browser alternative to biometrics)
  const [showQuickPinForm, setShowQuickPinForm] = useState(false);
  const [quickPinInput, setQuickPinInput] = useState('');
  const [quickPinConfirm, setQuickPinConfirm] = useState('');
  const [quickPinMasterPw, setQuickPinMasterPw] = useState('');
  const [quickPinBusy, setQuickPinBusy] = useState(false);
  const [quickPinError, setQuickPinError] = useState<string | null>(null);
  const [quickPinSaved, setQuickPinSaved] = useState(false);

  // Password Change / Passkey Password Reset inline form
  const [showPasswordChangeForm, setShowPasswordChangeForm] = useState(false);
  const [pwChangeMode, setPwChangeMode] = useState<'current' | 'prf'>('current');
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmNewPasswordInput, setConfirmNewPasswordInput] = useState('');
  const [pwChangeBusy, setPwChangeBusy] = useState(false);
  const [pwChangeError, setPwChangeError] = useState<string | null>(null);
  const [pwChangeSaved, setPwChangeSaved] = useState(false);
  const [isReminderTestOpen, setIsReminderTestOpen] = useState(false);

  const [isCustomLockMode, setIsCustomLockMode] = useState<boolean>(
    () => !PRESET_LOCK_MS.includes(autoLockTimeoutMs)
  );
  const [customLockMinutes, setCustomLockMinutes] = useState<string>(() =>
    autoLockTimeoutMs > 0 ? String(Math.max(1, Math.round(autoLockTimeoutMs / 60_000))) : '10'
  );

  const [adminPinInput, setAdminPinInput] = useState('');
  const [adminPinConfirm, setAdminPinConfirm] = useState('');
  const [adminPinError, setAdminPinError] = useState<string | null>(null);
  const [pinSaving, setPinSaving] = useState(false);
  const [pinSaved, setPinSaved] = useState(false);

  useEffect(() => {
    if (!isModalOpen) return;
    setLocalPersistenceState(persistenceGranted);
    setRotatedRecoveryKey(null);
    setRotationError(null);
    setPrfError(null);
    setQuickPinError(null);
    setQuickPinSaved(false);
    setQuickPinInput('');
    setQuickPinConfirm('');
    setQuickPinMasterPw('');
    setShowQuickPinForm(false);
    setPwChangeError(null);
    setPwChangeSaved(false);
    setCurrentPasswordInput('');
    setNewPasswordInput('');
    setConfirmNewPasswordInput('');
    void refreshKeyUsageStatus();
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      void navigator.storage
        .estimate()
        .then((est) => {
          setStorageEstimate({
            usageMB: Math.round(((est.usage || 0) / (1024 * 1024)) * 10) / 10,
            quotaMB: Math.round(((est.quota || 0) / (1024 * 1024)) * 10) / 10,
          });
        })
        .catch(() => {
          setStorageEstimate(null);
        });
    }
    const isPreset = PRESET_LOCK_MS.includes(autoLockTimeoutMs);
    setIsCustomLockMode(!isPreset);
    if (autoLockTimeoutMs > 0) {
      setCustomLockMinutes(String(Math.max(1, Math.round(autoLockTimeoutMs / 60_000))));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModalOpen]);

  const handleSaveAdminPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminPinError(null);
    if (adminPinInput.trim().length < 4) {
      setAdminPinError(
        bi(
          'يجب أن لا يقل الرمز عن 4 خانات.',
          'Admin PIN must be at least 4 characters.',
          'کۆدی PIN نابێت لە 4 خانە کەمتر بێت.'
        )
      );
      return;
    }
    if (adminPinInput !== adminPinConfirm) {
      setAdminPinError(
        bi(
          'رمزا PIN غير متطابقين.',
          'PIN confirmation does not match.',
          'هەردوو کۆدی PIN وەک یەک نین.'
        )
      );
      return;
    }
    setPinSaving(true);
    try {
      await ClinicOperationsService.setAdminPinAsync(adminPinInput);
      setAdminPinInput('');
      setAdminPinConfirm('');
      setPinSaved(true);
      setTimeout(() => setPinSaved(false), 3000);
    } catch (err: unknown) {
      setAdminPinError(
        err instanceof Error
          ? err.message
          : bi(
              'فشل حفظ رمز المدير.',
              'Failed to save Admin PIN.',
              'پاشەکەوتکردنی کۆدی PINی بەڕێوەبەر سەرکەوتوو نەبوو.'
            )
      );
    } finally {
      setPinSaving(false);
    }
  };

  const handleRetryPersistence = async () => {
    const ok = await requestPersistentStorage();
    setLocalPersistenceState(ok);
  };

  const handleRotateDek = async () => {
    setRotatingDek(true);
    setRotationError(null);
    setRotatedRecoveryKey(null);
    try {
      const summary = await rotateDekNow();
      setRotatedRecoveryKey(summary.newRecoveryKeyFormatted || null);
    } catch (err: unknown) {
      setRotationError(
        err instanceof Error
          ? err.message
          : bi(
              'فشل تدوير مفتاح التشفير.',
              'Failed to rotate encryption key.',
              'سووڕاندنەوەی کلیلی کۆدکردن سەرکەوتوو نەبوو.'
            )
      );
    } finally {
      setRotatingDek(false);
    }
  };

  const handleSaveQuickPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setQuickPinError(null);
    setQuickPinSaved(false);

    const validation = validateVaultPin(quickPinInput);
    if (!validation.valid) {
      if (validation.errorCode === 'non_digits') {
        setQuickPinError(
          bi(
            'يجب أن يتكوّن رمز PIN من أرقام فقط (0–9).',
            'Quick PIN must contain digits only (0–9).',
            'کۆدی PIN دەبێت تەنها لە ژمارە (0–9) پێکهاتبێت.'
          )
        );
      } else if (validation.errorCode === 'too_short' || validation.errorCode === 'too_long') {
        setQuickPinError(
          bi(
            'يجب أن يتكوّن رمز PIN من 4 إلى 12 رقماً.',
            'Quick PIN must be between 4 and 12 digits.',
            'کۆدی PIN دەبێت لە نێوان ٤ بۆ ١٢ ژمارەدا بێت.'
          )
        );
      } else {
        setQuickPinError(
          bi(
            'هذا الرمز سهل التخمين (مثل 1234 أو 0000). يرجى اختيار رمز أقوى.',
            'This PIN is too easy to guess (e.g. 1234 or 0000). Please pick a stronger code.',
            'ئەم کۆدە زۆر ئاسانە (وەک 1234 یان 0000). تکایە کۆدێکی بەهێزتر هەڵبژێرە.'
          )
        );
      }
      return;
    }

    const normalizedConfirm = normalizeVaultPinInput(quickPinConfirm);
    if (validation.normalized !== normalizedConfirm) {
      setQuickPinError(
        bi(
          'رمزا PIN غير متطابقين.',
          'PIN confirmation does not match.',
          'هەردوو کۆدی PIN وەک یەک نین.'
        )
      );
      return;
    }

    if (!vaultKek && !quickPinMasterPw) {
      setQuickPinError(
        bi(
          'يرجى إدخال كلمة المرور الرئيسية لتأكيد تفعيل رمز PIN.',
          'Please enter your master password to authorize setting a Quick PIN.',
          'تکایە وشەی نهێنی سەرەکی بنووسە بۆ دڵنیاکردنەوەی دانانی کۆدی PIN.'
        )
      );
      return;
    }

    setQuickPinBusy(true);
    try {
      await enrollPin(validation.normalized, quickPinMasterPw || undefined);
      setQuickPinInput('');
      setQuickPinConfirm('');
      setQuickPinMasterPw('');
      setShowQuickPinForm(false);
      setQuickPinSaved(true);
      setTimeout(() => setQuickPinSaved(false), 4000);
    } catch (err: unknown) {
      setQuickPinError(
        err instanceof Error
          ? err.message
          : bi(
              'تعذر حفظ رمز PIN السريع.',
              'Failed to save Quick PIN.',
              'پاشەکەوتکردنی کۆدی PIN سەرکەوتوو نەبوو.'
            )
      );
    } finally {
      setQuickPinBusy(false);
    }
  };

  const handleDisableQuickPin = async () => {
    setQuickPinBusy(true);
    setQuickPinError(null);
    setQuickPinSaved(false);
    try {
      await disablePin();
      setShowQuickPinForm(false);
      setQuickPinInput('');
      setQuickPinConfirm('');
      setQuickPinMasterPw('');
    } catch (err: unknown) {
      setQuickPinError(
        err instanceof Error
          ? err.message
          : bi(
              'تعذر تعطيل رمز PIN السريع.',
              'Failed to disable Quick PIN.',
              'ناچالاککردنی کۆدی PIN سەرکەوتوو نەبوو.'
            )
      );
    } finally {
      setQuickPinBusy(false);
    }
  };

  const handleTogglePrf = async () => {
    setPrfBusy(true);
    setPrfError(null);
    try {
      if (isPrfEnrolled) {
        await disablePrf();
      } else {
        await enrollPrf();
      }
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : '';
      const lower = raw.toLowerCase();
      if (
        lower.includes('credentialscontainer') ||
        lower.includes('notallowederror') ||
        lower.includes('not allowed') ||
        lower.includes('permissions policy')
      ) {
        setPrfError(
          bi(
            securityCopy.biometricIframeBlockedError.ar,
            securityCopy.biometricIframeBlockedError.en,
            securityCopy.biometricIframeBlockedError.ckb
          )
        );
      } else {
        setPrfError(
          raw ||
            bi(
              'تعذر تغيير حالة البصمة على هذا الجهاز.',
              'Unable to update biometric unlock on this device.',
              'نەتوانرا دۆخی پەنجەمۆر لەسەر ئەم ئامێرە بگۆڕدرێت.'
            )
        );
      }
    } finally {
      setPrfBusy(false);
    }
  };

  const handleVaultPasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwChangeError(null);
    setPwChangeSaved(false);

    const usingPrf = pwChangeMode === 'prf' && isPrfSupported && isPrfEnrolled;

    if (!usingPrf && !currentPasswordInput) {
      setPwChangeError(
        bi(
          'يرجى إدخال كلمة المرور الحالية.',
          'Please enter your current master password.',
          'تکایە وشەی نهێنی ئێستا بنووسە.'
        )
      );
      return;
    }
    if (newPasswordInput.length < 10) {
      setPwChangeError(
        bi(
          'يجب ألا تقل كلمة المرور الجديدة عن 10 خانات.',
          'New password must be at least 10 characters.',
          'وشەی نهێنی نوێ نابێت لە ١٠ پیت کەمتر بێت.'
        )
      );
      return;
    }
    if (newPasswordInput !== confirmNewPasswordInput) {
      setPwChangeError(
        bi(
          'كلمتا المرور الجديدتان غير متطابقتين.',
          'New passwords do not match.',
          'وشە نهێنییە نوێیەکان وەک یەک نین.'
        )
      );
      return;
    }

    setPwChangeBusy(true);
    try {
      if (usingPrf) {
        await resetPasswordWithPrf(newPasswordInput);
      } else {
        await changeVaultPassword(currentPasswordInput, newPasswordInput);
      }
      setCurrentPasswordInput('');
      setNewPasswordInput('');
      setConfirmNewPasswordInput('');
      setPwChangeSaved(true);
      setTimeout(() => setPwChangeSaved(false), 4000);
    } catch (err: unknown) {
      setPwChangeError(
        err instanceof Error
          ? err.message
          : bi(
              'تعذر تحديث كلمة المرور الرئيسية.',
              'Failed to update master password.',
              'نوێکردنەوەی وشەی نهێنی سەرکەوتوو نەبوو.'
            )
      );
    } finally {
      setPwChangeBusy(false);
    }
  };

  const timeoutOptions = [
    { ms: 1 * 60 * 1000, labelAr: 'دقيقة واحدة (1 د)', labelEn: '1 minute', labelCkb: '1 خولەک' },
    { ms: 5 * 60 * 1000, labelAr: '5 دقائق (الافتراضي)', labelEn: '5 minutes (Default)', labelCkb: '5 خولەک (بنەڕەتی)' },
    { ms: 10 * 60 * 1000, labelAr: '10 دقائق', labelEn: '10 minutes', labelCkb: '10 خولەک' },
    { ms: 15 * 60 * 1000, labelAr: '15 دقيقة', labelEn: '15 minutes', labelCkb: '15 خولەک' },
    { ms: 30 * 60 * 1000, labelAr: '30 دقيقة', labelEn: '30 minutes', labelCkb: '30 خولەک' },
    { ms: 0, labelAr: 'أبداً (تعطيل القفل التلقائي)', labelEn: 'Never (Disable Auto-Lock)', labelCkb: 'هەرگیز (ناچالاککردنی قفڵی خۆکار)' },
  ];

  const telemetry = ClinicOperationsService.getWriteTelemetry();
  const backupMeta = ClinicOperationsService.getBackupMeta();
  const usagePct = keyUsageStatus?.usagePercent ?? 0;
  const pinStatus = ClinicOperationsService.getAdminPinStatus();

  return (
    <div className="space-y-3.5">
      {/* 1. Unified Backup, Recovery & Data Portability Hub (Zero Duplication) */}
      <section
        data-testid="settings-backup-hub-card"
        className="p-4 sm:p-5 rounded-2xl bg-card border border-card-line space-y-3.5"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0">
            <span className="size-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
              <HardDrive className="size-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-foreground">
                {bi('النسخ الاحتياطي والاسترداد ونقل البيانات', 'Backup, Recovery & Data Portability', 'کۆپی یەدەگ، گەڕاندنەوە و گواستنەوەی داتا')}
              </h3>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground-1 mt-0.5">
                <span>
                  {bi('آخر نسخة:', 'Last backup:', 'دوایین کۆپی:')}{' '}
                  <strong className="font-mono text-foreground tabular-nums">
                    {backupMeta.lastBackupAt ? backupMeta.lastBackupAt.slice(0, 10) : bi('لم يتم بعد', 'Never', 'نەکراوە')}
                  </strong>
                </span>
                <span aria-hidden="true">·</span>
                {lastRecoveryDrillAt ? (
                  <span
                    data-testid="settings-drill-verified-badge"
                    className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-bold"
                  >
                    <CheckCircle2 className="size-3.5" />
                    <span>
                      {bi('تم التحقق من المفتاح', 'Key Verified', 'کلیل دڵنیاکرایەوە')}:{' '}
                      {new Date(lastRecoveryDrillAt).toLocaleDateString(
                        language === 'en' ? 'en-GB' : 'ar-IQ'
                      )}
                    </span>
                  </span>
                ) : (
                  <span className="font-semibold text-amber-700 dark:text-amber-300">
                    {bi('تمرين المفتاح بانتظار الاختبار', 'Recovery drill pending', 'تاقیکردنەوەی کلیل نەکراوە')}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground-1 leading-relaxed">
          {bi(
            'احفظ نسخة احتياطية مشفّرة لجميع سجلاتك، اختبر استرداد النسخة ومفتاح الطوارئ بأمان، أو استورد وصدّر ملفات CSV وJSON.',
            'Download encrypted vault backups, verify your Emergency Recovery Key in an isolated sandbox, or import/export CSV & JSON.',
            'کۆپییەکی یەدەگی کۆدکراوی هەموو تۆمارەکانت پاشەکەوت بکە، کلیلی گەڕاندنەوەی لەناکاو تاقیبکەرەوە، یان فایلی CSV و JSON هاوردە و هەناردە بکە.'
          )}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {onOpenBackupModal && (
            <button
              type="button"
              data-testid="settings-open-backup-modal-btn"
              onClick={onOpenBackupModal}
              className="min-h-[38px] px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <HardDrive className="size-3.5" />
              <span>{bi('النسخ الاحتياطي والاستعادة', 'Backup & Restore', 'کۆپی یەدەگ و گەڕاندنەوە')}</span>
            </button>
          )}

          <button
            type="button"
            data-testid="open-recovery-drill-btn"
            onClick={onOpenRecoveryDrill}
            className="min-h-[38px] px-3.5 py-2 rounded-xl bg-surface hover:bg-layer-hover border border-line-2 text-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Shield className="size-3.5 text-primary" />
            <span>{bi('اختبار الاسترداد والمفتاح', 'Test Recovery Key', 'تاقیکردنەوەی گەڕاندنەوە')}</span>
          </button>

          <button
            type="button"
            onClick={onOpenCsvOnboarding}
            className="min-h-[38px] px-3.5 py-2 rounded-xl bg-surface hover:bg-layer-hover border border-line-2 text-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Upload className="size-3.5 text-primary" />
            <span>{bi('استيراد مرضى (CSV)', 'Import CSV', 'هاوردەکردنی CSV')}</span>
          </button>

          <button
            type="button"
            onClick={onOpenFullExport}
            className="min-h-[38px] px-3.5 py-2 rounded-xl bg-surface hover:bg-layer-hover border border-line-2 text-amber-800 dark:text-amber-300 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Database className="size-3.5" />
            <span>{bi('تصدير كامل (CSV / JSON)', 'Full Export', 'هەناردەکردنی تەواو')}</span>
          </button>
        </div>
      </section>

      {/* 2. Access & Auto-Lock */}
      <section className="p-4 sm:p-5 rounded-2xl bg-card border border-card-line space-y-4">
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Clock className="size-4 text-primary" />
              <span>{bi('القفل التلقائي عند عدم النشاط', 'Inactivity Auto-Lock', 'قفڵکردنی خۆکار لە کاتی بێچالاکی')}</span>
            </div>
            <span
              data-testid="settings-security-device-badge"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface border border-line-2 text-xs font-bold text-primary"
            >
              <DeviceIcon className="size-3.5 shrink-0" />
              <span>
                {bi(
                  securityCopy.deviceProfileBadge.ar,
                  securityCopy.deviceProfileBadge.en,
                  securityCopy.deviceProfileBadge.ckb
                )}
              </span>
            </span>
          </div>
          <p className="text-xs text-muted-foreground-1 leading-relaxed">
            {bi(
              'يقفل الخزينة تلقائياً لحماية بيانات المرضى عند ترك الجهاز دون استخدام.',
              'Automatically locks the encrypted vault after a period of inactivity.',
              'خەزێنەکە بە شێوەی خۆکار قفڵ دەکات بۆ پاراستنی زانیارییەکانی نەخۆش.'
            )}
          </p>

          <select
            id="settings-autolock-select"
            aria-label={bi('القفل التلقائي عند عدم النشاط', 'Inactivity Auto-Lock Timeout', 'قفڵکردنی خۆکار لە کاتی بێچالاکی')}
            value={isCustomLockMode ? 'custom' : String(autoLockTimeoutMs)}
            onChange={(e) => {
              const val = e.target.value;
              if (val === 'custom') {
                setIsCustomLockMode(true);
                const mins = parseInt(customLockMinutes, 10);
                if (!Number.isNaN(mins) && mins >= 1) {
                  setAutoLockTimeoutMs(Math.min(1440, mins) * 60_000);
                }
              } else {
                setIsCustomLockMode(false);
                setAutoLockTimeoutMs(Number(val));
              }
            }}
            className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs font-semibold text-foreground focus:outline-none focus:border-primary"
          >
            {timeoutOptions.map((opt) => (
              <option key={opt.ms} value={String(opt.ms)}>
                {bi(opt.labelAr, opt.labelEn, opt.labelCkb)}
              </option>
            ))}
            <option value="custom">
              {bi('تحديد يدوي (بالدقائق)...', 'Custom (Enter minutes)...', 'دیاریکردنی دەستی (بە خولەک)...')}
            </option>
          </select>

          <p className="text-xs text-muted-foreground-1 leading-relaxed">
            {bi(
              securityCopy.autoLockScopeHint.ar,
              securityCopy.autoLockScopeHint.en,
              securityCopy.autoLockScopeHint.ckb
            )}
          </p>

          {isCustomLockMode && (
            <div className="flex items-center gap-2 pt-1">
              <input
                id="settings-custom-lock-minutes"
                aria-label={bi('مدة القفل المخصصة بالدقائق', 'Custom auto-lock minutes', 'ماوەی قفڵکردنی تایبەت بە خولەک')}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                dir="ltr"
                lang="en"
                autoComplete="off"
                value={customLockMinutes}
                onChange={(e) => {
                  const raw = sanitizeDurationDraft(e.target.value, 4);
                  setCustomLockMinutes(raw);
                  const parsed = parseInt(raw, 10);
                  if (!Number.isNaN(parsed) && parsed >= 1) {
                    setAutoLockTimeoutMs(Math.min(1440, parsed) * 60_000);
                  }
                }}
                onBlur={() => {
                  const parsed = parseInt(customLockMinutes, 10);
                  const valid = Number.isFinite(parsed) && parsed >= 1 ? Math.min(1440, parsed) : 10;
                  setCustomLockMinutes(String(valid));
                  setAutoLockTimeoutMs(valid * 60_000);
                }}
                placeholder="20"
                className="w-28 px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs font-mono font-bold text-foreground text-left tabular-nums focus:outline-none focus:border-primary"
              />
              <span className="text-xs font-semibold text-muted-foreground-1">
                {bi('دقيقة (1 – 1440)', 'minutes (1 – 1440)', 'خولەک (1 – 1440)')}
              </span>
            </div>
          )}

          {!isCustomLockMode && autoLockTimeoutMs === 0 && (
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs font-medium text-amber-800 dark:text-amber-300">
              {bi(
                'تم تعطيل القفل التلقائي؛ ستبقى الخزينة مفتوحة حتى تقفلها يدوياً.',
                'Auto-lock is disabled; the vault stays unlocked until locked manually.',
                'قفڵکردنی خۆکار ناچالاک کراوە؛ خەزێنەکە بە کراوەیی دەمێنێتەوە تا بە دەست قفڵی دەکەیت.'
              )}
            </div>
          )}
        </div>

        {/* Device-Specific Biometrics / PC OS Lock */}
        <div
          data-testid="settings-biometric-section"
          className="pt-3.5 border-t border-card-divider space-y-2.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-foreground">
                {deviceFormFactor === 'desktop' ? (
                  <Laptop className="size-4 text-primary shrink-0" />
                ) : (
                  <Fingerprint className="size-4 text-primary shrink-0" />
                )}
                <span>
                  {bi(
                    securityCopy.biometricTitle.ar,
                    securityCopy.biometricTitle.en,
                    securityCopy.biometricTitle.ckb
                  )}
                </span>
                <span aria-hidden="true" className="text-muted-foreground-2">·</span>
                <span
                  className={`font-semibold ${
                    !isPrfSupported
                      ? 'text-amber-700 dark:text-amber-400'
                      : isPrfEnrolled
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-muted-foreground-1'
                  }`}
                >
                  {!isPrfSupported
                    ? bi('غير متاح هنا', 'Unavailable here', 'لێرە بەردەست نییە')
                    : isPrfEnrolled
                      ? bi('مفعّل', 'Active', 'چالاکە')
                      : bi('غير مفعّل', 'Off', 'ناچالاکە')}
                </span>
              </div>
              <p className="text-xs text-muted-foreground-1 mt-0.5 leading-relaxed">
                {bi(
                  securityCopy.biometricDescription.ar,
                  securityCopy.biometricDescription.en,
                  securityCopy.biometricDescription.ckb
                )}
              </p>
              {prfError && <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold mt-1">{prfError}</p>}
            </div>

            {biometricUnavailableReason === 'restricted-iframe' && typeof window !== 'undefined' && (
              <a
                href={window.location.href}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="settings-open-standalone-tab-link"
                className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-primary/10 hover:bg-primary/15 border border-primary/25 text-xs font-bold text-primary inline-flex items-center gap-1.5 shrink-0 transition-colors"
              >
                <ExternalLink className="size-3.5 shrink-0" />
                <span>{bi('فتح في تبويب مستقل', 'Open Standalone Tab', 'کردنەوە لە تابێکی سەربەخۆ')}</span>
              </a>
            )}

            {isPrfSupported && (
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {isPrfEnrolled && (
                  <button
                    type="button"
                    data-testid="settings-open-prf-password-reset-btn"
                    onClick={() => {
                      setPwChangeMode('prf');
                      setPwChangeError(null);
                      setShowPasswordChangeForm(true);
                    }}
                    className="min-h-[36px] px-3 py-1.5 rounded-xl bg-primary/10 hover:bg-primary/15 text-primary text-xs font-bold cursor-pointer"
                  >
                    {bi(
                      securityCopy.biometricResetPasswordButton.ar,
                      securityCopy.biometricResetPasswordButton.en,
                      securityCopy.biometricResetPasswordButton.ckb
                    )}
                  </button>
                )}
                <button
                  type="button"
                  data-testid="settings-toggle-biometric-btn"
                  disabled={prfBusy}
                  onClick={() => void handleTogglePrf()}
                  className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-surface hover:bg-layer-hover border border-line-2 text-xs font-bold text-foreground disabled:opacity-50 cursor-pointer shrink-0"
                >
                  {prfBusy
                    ? bi('جاري المعالجة...', 'Working...', 'جێبەجێ دەکرێت...')
                    : isPrfEnrolled
                      ? bi('تعطيل', 'Disable', 'ناچالاککردن')
                      : bi(
                          securityCopy.biometricEnableButton.ar,
                          securityCopy.biometricEnableButton.en,
                          securityCopy.biometricEnableButton.ckb
                        )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Optional In-App Quick PIN Fallback (Prominent on PCs without OS Lock; collapsed on Mobile/Tablet unless active) */}
        <details
          open={isPinEnrolled || (deviceFormFactor === 'desktop' && !isPrfSupported)}
          data-testid="settings-quick-pin-fallback-details"
          className="pt-3 border-t border-card-divider group"
        >
          <summary className="list-none flex items-center justify-between gap-2 cursor-pointer text-xs font-semibold text-muted-foreground-1 hover:text-foreground select-none">
            <span className="inline-flex items-center gap-2">
              <KeyRound className="size-3.5 text-primary shrink-0" />
              <span>
                {bi(
                  securityCopy.quickPinSummary.ar,
                  securityCopy.quickPinSummary.en,
                  securityCopy.quickPinSummary.ckb
                )}
              </span>
              {isPinEnrolled && (
                <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                  · {bi('مفعّل', 'Active', 'چالاکە')}
                </span>
              )}
            </span>
            <span className="text-xs text-muted-foreground-2 group-open:hidden">
              {bi('عرض', 'Show', 'پیشاندان')}
            </span>
          </summary>

        <div
          data-testid="settings-quick-pin-section"
          className="pt-3 space-y-2.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-foreground">
                <KeyRound className="size-4 text-primary shrink-0" />
                <span>
                  {bi(
                    securityCopy.quickPinTitle.ar,
                    securityCopy.quickPinTitle.en,
                    securityCopy.quickPinTitle.ckb
                  )}
                </span>
                <span aria-hidden="true" className="text-muted-foreground-2">·</span>
                <span
                  data-testid="settings-quick-pin-status"
                  className={`font-semibold ${
                    isPinEnrolled
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-muted-foreground-1'
                  }`}
                >
                  {isPinEnrolled
                    ? bi('مفعّل', 'Active', 'چالاکە')
                    : bi('غير مفعّل', 'Off', 'ناچالاکە')}
                </span>
              </div>
              <p className="text-xs text-muted-foreground-1 mt-0.5 leading-relaxed">
                {bi(
                  securityCopy.quickPinDescription.ar,
                  securityCopy.quickPinDescription.en,
                  securityCopy.quickPinDescription.ckb
                )}
              </p>
              {quickPinSaved && (
                <p className="text-xs text-emerald-700 dark:text-emerald-400 font-bold mt-1">
                  {bi(
                    'تم حفظ رمز PIN السريع بنجاح — يمكنك استخدامه الآن في شاشة القفل.',
                    'Quick PIN saved! You can use it next time on the lock screen.',
                    'کۆدی PIN بە سەرکەوتوویی پاشەکەوت کرا — دەتوانیت لە شاشەی قفڵ بەکاریبهێنیت.'
                  )}
                </p>
              )}
              {!showQuickPinForm && quickPinError && (
                <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold mt-1">{quickPinError}</p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {isPinEnrolled && (
                <button
                  type="button"
                  data-testid="settings-disable-quick-pin-btn"
                  disabled={quickPinBusy}
                  onClick={() => void handleDisableQuickPin()}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl bg-surface hover:bg-layer-hover border border-line-2 text-xs font-bold text-rose-700 dark:text-rose-400 disabled:opacity-50 cursor-pointer"
                >
                  {bi('تعطيل', 'Disable', 'ناچالاککردن')}
                </button>
              )}
              <button
                type="button"
                data-testid="settings-toggle-quick-pin-form-btn"
                disabled={quickPinBusy}
                onClick={() => {
                  setQuickPinError(null);
                  setQuickPinSaved(false);
                  setShowQuickPinForm((prev) => !prev);
                }}
                className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-surface hover:bg-layer-hover border border-line-2 text-xs font-bold text-foreground disabled:opacity-50 cursor-pointer shrink-0"
              >
                {showQuickPinForm
                  ? bi('إغلاق', 'Close', 'داخستن')
                  : isPinEnrolled
                    ? bi('تغيير رمز PIN', 'Change PIN', 'گۆڕینی کۆدی PIN')
                    : bi('تفعيل رمز PIN', 'Enable Quick PIN', 'چالاککردنی کۆدی PIN')}
              </button>
            </div>
          </div>

          {showQuickPinForm && (
            <form
              onSubmit={(e) => void handleSaveQuickPin(e)}
              data-testid="settings-quick-pin-form"
              className="p-3.5 rounded-xl bg-surface/75 border border-line-2 space-y-2.5"
            >
              {!vaultKek && (
                <div>
                  <label htmlFor="settings-quick-pin-master-pw" className="sr-only">
                    {bi('كلمة المرور الرئيسية', 'Master password', 'وشەی نهێنی سەرەکی')}
                  </label>
                  <input
                    id="settings-quick-pin-master-pw"
                    type="password"
                    autoComplete="current-password"
                    dir="ltr"
                    value={quickPinMasterPw}
                    onChange={(e) => {
                      setQuickPinMasterPw(e.target.value);
                      setQuickPinError(null);
                    }}
                    placeholder={bi(
                      'أدخل كلمة المرور الرئيسية أولاً للتحقق',
                      'Enter master password first to authorize PIN',
                      'سەرەتا وشەی نهێنی سەرەکی بنووسە بۆ دڵنیاکردنەوە'
                    )}
                    className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  id="settings-quick-pin-input"
                  data-testid="settings-quick-pin-input"
                  type="password"
                  autoComplete="off"
                  inputMode="numeric"
                  dir="ltr"
                  lang="en"
                  maxLength={12}
                  aria-label={bi('رمز PIN السريع الجديد', 'New Quick PIN', 'کۆدی PINی نوێ')}
                  value={quickPinInput}
                  onChange={(e) => {
                    setQuickPinInput(normalizeVaultPinInput(e.target.value).replace(/[^0-9]/g, '').slice(0, 12));
                    setQuickPinError(null);
                  }}
                  placeholder={bi('رمز PIN جديد (4–12 رقماً)', 'New PIN (4–12 digits)', 'کۆدی PINی نوێ (٤–١٢ ژمارە)')}
                  className="px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs font-mono font-bold text-foreground tracking-widest focus:outline-none focus:border-primary"
                />
                <input
                  id="settings-quick-pin-confirm"
                  data-testid="settings-quick-pin-confirm"
                  type="password"
                  autoComplete="off"
                  inputMode="numeric"
                  dir="ltr"
                  lang="en"
                  maxLength={12}
                  aria-label={bi('تأكيد رمز PIN السريع', 'Confirm Quick PIN', 'دڵنیاکردنەوەی کۆدی PIN')}
                  value={quickPinConfirm}
                  onChange={(e) => {
                    setQuickPinConfirm(normalizeVaultPinInput(e.target.value).replace(/[^0-9]/g, '').slice(0, 12));
                    setQuickPinError(null);
                  }}
                  placeholder={bi('تأكيد رمز PIN', 'Confirm PIN', 'دڵنیاکردنەوەی PIN')}
                  className="px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs font-mono font-bold text-foreground tracking-widest focus:outline-none focus:border-primary"
                />
              </div>

              <p className="text-xs text-muted-foreground-1">
                {bi(
                  'ملاحظة: تُرفض الرموز المتكررة أو المتسلسلة مثل 1234 أو 0000 لحماية بياناتك.',
                  'Note: Trivial or sequential codes like 1234 or 0000 are rejected.',
                  'تێبینی: کۆدە سادە و دووبارەکان وەک 1234 یان 0000 ڕەتدەکرێنەوە.'
                )}
              </p>

              {quickPinError && (
                <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold">{quickPinError}</p>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowQuickPinForm(false);
                    setQuickPinError(null);
                  }}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl bg-card border border-line-2 text-xs font-bold text-foreground cursor-pointer"
                >
                  {bi('إلغاء', 'Cancel', 'پاشگەزبوونەوە')}
                </button>
                <button
                  type="submit"
                  data-testid="settings-save-quick-pin-btn"
                  disabled={quickPinBusy}
                  className="min-h-[36px] px-4 py-1.5 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground text-xs font-bold cursor-pointer"
                >
                  {quickPinBusy
                    ? bi('جاري التشفير والحفظ...', 'Encrypting & Saving...', 'کۆدکردن و پاشەکەوتکردن...')
                    : bi('حفظ رمز PIN', 'Save Quick PIN', 'پاشەکەوتکردنی PIN')}
                </button>
              </div>
            </form>
          )}
        </div>
        </details>

        {/* Password Change / Anti-Lockout Protection (Signal Reminders + OS Password Manager + Passkey Reset) */}
        <div className="pt-3.5 border-t border-card-divider space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                <ShieldCheck className="size-4 text-primary shrink-0" />
                <span>
                  {bi(
                    'كلمة المرور الرئيسية ومنع النسيان',
                    'Master Password & Anti-Lockout Protection',
                    'وشەی نهێنی سەرەکی و پاراستن لە لەبیرچوونەوە'
                  )}
                </span>
              </div>
              <p className="text-xs text-muted-foreground-1 mt-0.5 leading-relaxed">
                {bi(
                  securityCopy.passwordManagerNote.ar,
                  securityCopy.passwordManagerNote.en,
                  securityCopy.passwordManagerNote.ckb
                )}
              </p>
            </div>
            <button
              type="button"
              data-testid="settings-toggle-password-change-btn"
              onClick={() => {
                setPwChangeError(null);
                setShowPasswordChangeForm((prev) => !prev);
              }}
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-surface hover:bg-layer-hover border border-line-2 text-xs font-bold text-foreground cursor-pointer shrink-0"
            >
              {showPasswordChangeForm
                ? bi('إغلاق', 'Close', 'داخستن')
                : bi('تغيير كلمة المرور', 'Change Password', 'گۆڕینی وشەی نهێنی')}
            </button>
          </div>

          {showPasswordChangeForm && (
            <form
              onSubmit={(e) => void handleVaultPasswordUpdate(e)}
              data-testid="settings-password-change-form"
              className="p-3.5 rounded-xl bg-surface/75 border border-line-2 space-y-3"
            >
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

              {isPrfSupported && isPrfEnrolled && (
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-card border border-card-line">
                  <button
                    type="button"
                    onClick={() => {
                      setPwChangeMode('current');
                      setPwChangeError(null);
                    }}
                    className={`min-h-[32px] px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                      pwChangeMode === 'current'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground-1 hover:text-foreground'
                    }`}
                  >
                    {bi('بكلمة المرور الحالية', 'With Current Password', 'بە وشەی نهێنی ئێستا')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPwChangeMode('prf');
                      setPwChangeError(null);
                    }}
                    className={`min-h-[32px] px-2.5 py-1 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                      pwChangeMode === 'prf'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground-1 hover:text-foreground'
                    }`}
                  >
                    {deviceFormFactor === 'desktop' ? (
                      <Laptop className="size-3.5 shrink-0" />
                    ) : (
                      <Fingerprint className="size-3.5 shrink-0" />
                    )}
                    <span>
                      {bi(
                        securityCopy.passwordChangeBiometricTab.ar,
                        securityCopy.passwordChangeBiometricTab.en,
                        securityCopy.passwordChangeBiometricTab.ckb
                      )}
                    </span>
                  </button>
                </div>
              )}

              {!(pwChangeMode === 'prf' && isPrfSupported && isPrfEnrolled) && (
                <input
                  type="password"
                  autoComplete="current-password"
                  dir="ltr"
                  value={currentPasswordInput}
                  onChange={(e) => {
                    setCurrentPasswordInput(e.target.value);
                    setPwChangeError(null);
                  }}
                  placeholder={bi('كلمة المرور الحالية', 'Current master password', 'وشەی نهێنی ئێستا')}
                  className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground focus:outline-none focus:border-primary"
                />
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="password"
                  autoComplete="new-password"
                  dir="ltr"
                  value={newPasswordInput}
                  onChange={(e) => {
                    setNewPasswordInput(e.target.value);
                    setPwChangeError(null);
                  }}
                  placeholder={bi('كلمة المرور الجديدة (10+ خانات)', 'New password (10+ chars)', 'وشەی نهێنی نوێ (10+ پیت)')}
                  className="px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground focus:outline-none focus:border-primary"
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  dir="ltr"
                  value={confirmNewPasswordInput}
                  onChange={(e) => {
                    setConfirmNewPasswordInput(e.target.value);
                    setPwChangeError(null);
                  }}
                  placeholder={bi('تأكيد كلمة المرور الجديدة', 'Confirm new password', 'دڵنیاکردنەوەی وشەی نهێنی نوێ')}
                  className="px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground focus:outline-none focus:border-primary"
                />
              </div>

              {pwChangeError && (
                <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold">{pwChangeError}</p>
              )}
              {pwChangeSaved && (
                <p className="text-xs text-emerald-700 dark:text-emerald-400 font-bold">
                  {bi(
                    'تم تحديث كلمة المرور الرئيسية بنجاح مع الحفاظ على جميع سجلاتك.',
                    'Master password updated successfully with all records intact.',
                    'وشەی نهێنی سەرەکی بە سەرکەوتوویی نوێ کرایەوە.'
                  )}
                </p>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={pwChangeBusy}
                  className="min-h-[36px] px-4 py-1.5 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {pwChangeMode === 'prf' && isPrfSupported && isPrfEnrolled && (
                    deviceFormFactor === 'desktop' ? (
                      <Laptop className="size-3.5 shrink-0" />
                    ) : (
                      <Fingerprint className="size-3.5 shrink-0" />
                    )
                  )}
                  <span>
                    {pwChangeBusy
                      ? bi('جاري التحديث...', 'Updating...', 'نوێ دەکرێتەوە...')
                      : pwChangeMode === 'prf' && isPrfSupported && isPrfEnrolled
                        ? bi(
                            securityCopy.passwordChangeBiometricSubmit.ar,
                            securityCopy.passwordChangeBiometricSubmit.en,
                            securityCopy.passwordChangeBiometricSubmit.ckb
                          )
                        : bi('حفظ كلمة المرور الجديدة', 'Save New Password', 'پاشەکەوتکردنی وشەی نهێنی نوێ')}
                  </span>
                </button>
              </div>
            </form>
          )}

          {/* Signal-Style Spaced-Repetition Password Memory Reminder */}
          <div className="pt-1 border-t border-card-divider/70">
            <SettingsSwitchRow
              testId="toggle-password-memory-reminder-btn"
              title={
                <span className="inline-flex items-center gap-1.5">
                  <BellRing className="size-3.5 text-primary shrink-0" />
                  <span>
                    {bi(
                      'التذكير الذكي المتباعد لتثبيت كلمة المرور',
                      'Spaced Password Memory Reminders',
                      'بیرخستنەوەی زیرەکی وشەی نهێنی'
                    )}
                  </span>
                </span>
              }
              description={bi(
                'يطلب تأكيد كلمة المرور بلطف والخزينة مفتوحة على فترات متباعدة (يوم ← 3 أيام ← أسبوع ← أسبوعين ← شهرياً) لمنع نسيانها.',
                'Gently checks your password while unlocked at expanding intervals (1d → 3d → 7d → 14d → 30d) so you never forget it.',
                'لە کاتی کراوەیی بەرنامەکەدا بە نەرمی وشەی نهێنیت بیردەخاتەوە (١ ڕۆژ ← ٣ ڕۆژ ← هەفتەیەک ← مانگانە).'
              )}
              checked={passwordReminderState.enabled}
              onLabel={bi('مفعّلة', 'Enabled', 'چالاکە')}
              offLabel={bi('معطّلة', 'Off', 'ناچالاکە')}
              onChange={(next) => setPasswordReminderEnabled(next)}
            >
              {passwordReminderState.enabled && (
                <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-surface border border-line-2 text-xs">
                  <span className="text-muted-foreground-1">
                    {bi('الفحص القادم:', 'Next check:', 'پشکنینی داهاتوو:')}{' '}
                    <strong className="text-foreground font-semibold">
                      {new Date(passwordReminderState.nextDueAt).toLocaleDateString(
                        language === 'en' ? 'en-GB' : 'ar-IQ'
                      )}
                    </strong>{' '}
                    ({bi(
                      `كل ${getReminderIntervalDays(passwordReminderState.stageIndex)} يوم`,
                      `every ${getReminderIntervalDays(passwordReminderState.stageIndex)}d`,
                      `هەموو ${getReminderIntervalDays(passwordReminderState.stageIndex)} ڕۆژێک`
                    )})
                  </span>
                  <button
                    type="button"
                    data-testid="settings-test-password-reminder-btn"
                    onClick={() => setIsReminderTestOpen(true)}
                    className="compact-btn px-2.5 py-1 rounded-lg bg-card hover:bg-layer-hover border border-line-2 text-primary font-bold cursor-pointer"
                  >
                    {bi('اختبار التذكّر الآن', 'Check Memory Now', 'ئێستا تاقی بکەرەوە')}
                  </button>
                </div>
              )}
            </SettingsSwitchRow>
          </div>
        </div>

        {/* Staff Admin PIN (Team mode only) */}
        {!isSoloMode && (
          <form onSubmit={(e) => void handleSaveAdminPin(e)} className="pt-3.5 border-t border-card-divider space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-foreground">
              <span className="inline-flex items-center gap-2">
                <KeyRound className="size-4 text-primary" />
                <span>{bi('رمز PIN لتبديل صفة المدير', 'Staff Admin PIN', 'کۆدی PINی بەڕێوەبەر')}</span>
              </span>
              <span className={pinStatus.isConfigured ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}>
                {pinStatus.isConfigured
                  ? bi('مهيأ', 'Configured', 'ڕێکخراوە')
                  : bi('مطلوب التعيين', 'Setup Required', 'پێویستی بە دیاریکردن هەیە')}
              </span>
            </div>
            <p className="text-xs text-muted-foreground-1 leading-relaxed">
              {bi(
                'يُستخدم لنسبة التوثيق عند تبديل الكادر (الرموز البسيطة مثل 1234 مرفوضة).',
                'Used for staff attribution when switching roles (trivial PINs like 1234 are rejected).',
                'بۆ دیاریکردنی تۆمارکردنی ستاف بەکاردەهێنرێت (کۆدە سادەکانی وەک 1234 ڕەتدەکرێنەوە).'
              )}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="password"
                autoComplete="new-password"
                inputMode="numeric"
                minLength={4}
                maxLength={32}
                aria-label={bi('رمز PIN الجديد', 'New Admin PIN', 'کۆدی PINی نوێ')}
                value={adminPinInput}
                onChange={(e) => {
                  setAdminPinInput(e.target.value);
                  setAdminPinError(null);
                }}
                placeholder={bi('رمز PIN جديد (4+ خانات)', 'New Admin PIN (4+ chars)', 'کۆدی PINی نوێ (4+ خانە)')}
                className="px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs font-mono font-bold text-foreground focus:outline-none focus:border-primary"
              />
              <input
                type="password"
                autoComplete="new-password"
                inputMode="numeric"
                minLength={4}
                maxLength={32}
                aria-label={bi('تأكيد رمز PIN الجديد', 'Confirm New PIN', 'دڵنیابوونەوەی کۆدی نوێ')}
                value={adminPinConfirm}
                onChange={(e) => {
                  setAdminPinConfirm(e.target.value);
                  setAdminPinError(null);
                }}
                placeholder={bi('تأكيد الرمز الجديد', 'Confirm New PIN', 'دڵنیابوونەوەی کۆدی نوێ')}
                className="px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs font-mono font-bold text-foreground focus:outline-none focus:border-primary"
              />
            </div>
            {adminPinError && (
              <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold">{adminPinError}</p>
            )}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={pinSaving}
                className="min-h-[36px] px-4 py-1.5 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground text-xs font-bold cursor-pointer"
              >
                {pinSaving
                  ? bi('جاري الحفظ...', 'Saving...', 'پاشەکەوت دەکرێت...')
                  : pinSaved
                  ? bi('تم الحفظ!', 'Saved!', 'پاشەکەوت کرا!')
                  : bi('تحديث رمز المدير', 'Update Admin PIN', 'نوێکردنەوەی کۆدی بەڕێوەبەر')}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* 3. Safe In-Place App Updates */}
      <PlatformUpdateCenterCard onOpenBackupModal={onOpenBackupModal} />

      {/* 4. Advanced Storage & Encryption Details (Collapsed by default — Progressive Disclosure) */}
      <SettingsAccordion
        icon={<Lock className="size-4" />}
        title={bi('تفاصيل التشفير والتخزين المحلي', 'Local Storage & Encryption Details', 'وردەکاری کۆدکردن و کۆگای ناوخۆیی')}
        meta={`${usagePct}% · ${localPersistenceState ? bi('مثبت', 'Persistent', 'جێگیرکراو') : bi('غير مثبت', 'Standard', 'جێگیر نەکراو')}`}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          <div className="p-2.5 rounded-xl bg-surface border border-line-2 flex items-center justify-between gap-2">
            <span className="text-muted-foreground-1">{bi('تثبيت التخزين', 'Persistence', 'جێگیرکردن')}</span>
            <div className="flex items-center gap-1.5">
              <span className={`font-bold ${localPersistenceState ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-300'}`}>
                {localPersistenceState ? bi('مثبت', 'Persistent', 'جێگیر') : bi('عادي', 'Standard', 'ئاسایی')}
              </span>
              {!localPersistenceState && (
                <button
                  type="button"
                  onClick={() => void handleRetryPersistence()}
                  className="px-2 py-0.5 rounded-lg bg-primary/15 text-primary font-bold cursor-pointer"
                >
                  {bi('تثبيت', 'Grant', 'داواکردن')}
                </button>
              )}
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-surface border border-line-2 flex items-center justify-between gap-2">
            <span className="text-muted-foreground-1">{bi('المساحة', 'Storage', 'قەبارە')}</span>
            <span dir="ltr" className="font-mono font-bold text-foreground tabular-nums">
              {storageEstimate
                ? `${storageEstimate.usageMB} / ${storageEstimate.quotaMB} MB`
                : bi('غير متاح', 'N/A', 'بەردەست نییە')}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-surface border border-line-2 flex items-center justify-between gap-2">
            <span className="text-muted-foreground-1 inline-flex items-center gap-1">
              <Activity className="size-3.5 text-primary" />
              <span>{bi('عمليات الحفظ', 'Writes', 'پاشەکەوت')}</span>
            </span>
            <span dir="ltr" className="font-mono font-bold text-foreground tabular-nums">
              {telemetry.totalWrites} ({bi('اليوم', 'today', 'ئەمڕۆ')}: {telemetry.writesToday})
            </span>
          </div>
        </div>

        <div className="pt-1 space-y-2">
          <div className="flex items-center justify-between text-xs gap-2">
            <span className="font-semibold text-foreground">
              {bi(
                'استهلاك مفتاح التشفير (يُجدّد تلقائياً عند 70%)',
                'Encryption key usage (auto-rotates at 70%)',
                'بەکارهێنانی کلیلی کۆدکردن (لە 70% خۆکار نوێ دەبێتەوە)'
              )}
            </span>
            <span dir="ltr" className="font-mono font-bold text-primary tabular-nums">
              {usagePct}%{' '}
              {keyUsageStatus
                ? `(${keyUsageStatus.effectiveCount.toLocaleString()} / ${keyUsageStatus.maxLimit.toLocaleString()})`
                : ''}
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-surface overflow-hidden border border-line-2">
            <div
              className={`h-full transition-all ${usagePct >= 70 ? 'bg-amber-500' : 'bg-primary'}`}
              style={{ width: `${Math.min(100, Math.max(2, usagePct))}%` }}
            />
          </div>

          {rotationError && (
            <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold">{rotationError}</p>
          )}

          {rotatedRecoveryKey && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold text-foreground">
                  {bi(
                    'تم تجديد مفتاح التشفير بنجاح! احفظ مفتاح الاسترداد الطارئ الجديد فوراً:',
                    'Key rotated cleanly! Record your new Emergency Recovery Key immediately:',
                    'کلیلی کۆدکردن نوێ کرایەوە! دەستبەجێ کلیلی گەڕاندنەوەی نوێ هەڵبگرە:'
                  )}
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    await copySecretWithAutoClear(rotatedRecoveryKey);
                    setCopiedRotatedKey(true);
                    setTimeout(() => setCopiedRotatedKey(false), 5000);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-layer hover:bg-layer-hover border border-layer-line text-xs font-bold text-foreground inline-flex items-center gap-1 cursor-pointer"
                >
                  {copiedRotatedKey ? (
                    <>
                      <Check className="size-3.5 text-emerald-500" />
                      <span>{bi('تم النسخ (يُمسح بعد 60 ثانية)', 'Copied (clears in 60s)', 'لەبەرگیرایەوە')}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="size-3.5 text-primary" />
                      <span>{bi('نسخ المفتاح', 'Copy Key', 'لەبەرگرتنەوەی کلیل')}</span>
                    </>
                  )}
                </button>
              </div>
              <div
                dir="ltr"
                className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-2 rounded-lg bg-card border border-card-line select-all"
              >
                {rotatedRecoveryKey.split('-').map((chunk, idx) => (
                  <code
                    key={idx}
                    className="px-2 py-1 rounded bg-surface border border-line-2 font-mono text-xs font-bold text-foreground text-center whitespace-nowrap"
                  >
                    {chunk}
                  </code>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end pt-1">
            <button
              type="button"
              disabled={rotatingDek}
              onClick={() => void handleRotateDek()}
              className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-surface hover:bg-layer-hover border border-line-2 text-xs font-bold text-foreground inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`size-3.5 text-primary ${rotatingDek ? 'animate-spin' : ''}`} />
              <span>
                {rotatingDek
                  ? bi('جاري إعادة التشفير...', 'Rotating key...', 'نوێکردنەوەی کلیل...')
                  : bi('تدوير مفتاح التشفير يدوياً', 'Rotate Encryption Key', 'سووڕاندنەوەی کلیلی کۆدکردن')}
              </span>
            </button>
          </div>
        </div>
      </SettingsAccordion>

      {settingsViewMode === 'simple' && (
        <div
          data-testid="settings-simple-mode-notice"
          className="p-3 rounded-xl bg-surface border border-line-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground-1"
        >
          <span>
            {bi(
              'الوضع المبسط مفعّل حالياً — يتم إخفاء أدوات الكادر والتجربة المتقدمة.',
              'Simple Mode active — advanced staff & demo controls are hidden.',
              'شێوازی سادە چالاکە — بەشە پێشکەوتووەکانی ستاف و تاقیکردنەوە شاردراونەتەوە.'
            )}
          </span>
          <button
            type="button"
            data-testid="settings-switch-to-advanced-inline-btn"
            onClick={() => onSwitchSettingsMode('advanced')}
            className="px-3 py-1.5 rounded-lg bg-card border border-line-2 text-foreground font-bold cursor-pointer hover:bg-layer-hover"
          >
            {bi('عرض الوضع المتقدم', 'Switch to Advanced', 'گۆڕین بۆ پێشکەوتوو')}
          </button>
        </div>
      )}
      <PasswordReminderModal
        isOpen={isReminderTestOpen}
        onClose={() => setIsReminderTestOpen(false)}
        onOpenBackupModal={onOpenBackupModal}
      />
    </div>
  );
};
