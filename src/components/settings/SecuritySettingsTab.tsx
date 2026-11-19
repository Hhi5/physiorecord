import React, { useEffect, useState } from 'react';
import {
  Activity,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Database,
  FileSpreadsheet,
  Fingerprint,
  HardDrive,
  KeyRound,
  RefreshCw,
  Shield,
  Upload,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useVault } from '../../context/VaultContext';
import { requestPersistentStorage } from '../../db/db';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import type { SettingsViewMode } from '../../types/clinicManagement';
import { copySecretWithAutoClear } from '../../utils/clipboardPrivacy';
import { PlatformUpdateCenterCard } from '../clinic/PlatformUpdateCenterCard';

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
    enrollPrf,
    disablePrf,
  } = useVault();

  const [storageEstimate, setStorageEstimate] = useState<{ usageMB: number; quotaMB: number } | null>(null);
  const [localPersistenceState, setLocalPersistenceState] = useState<boolean>(persistenceGranted);
  const [rotatingDek, setRotatingDek] = useState(false);
  const [rotatedRecoveryKey, setRotatedRecoveryKey] = useState<string | null>(null);
  const [copiedRotatedKey, setCopiedRotatedKey] = useState(false);
  const [rotationError, setRotationError] = useState<string | null>(null);
  const [prfBusy, setPrfBusy] = useState(false);
  const [prfError, setPrfError] = useState<string | null>(null);

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
    // Sync security draft state on modal open only so typing a preset-matching value in Custom mode stays open
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
              'Failed to rotate DEK.',
              'سووڕاندنەوەی کلیلی کۆدکردن سەرکەوتوو نەبوو.'
            )
      );
    } finally {
      setRotatingDek(false);
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
      setPrfError(
        err instanceof Error
          ? err.message
          : bi(
              'تعذر تغيير حالة مفتاح المرور/البصمة على هذا الجهاز.',
              'Unable to update passkey/biometric unlock on this device.',
              'نەتوانرا دۆخی کلیلی تێپەڕبوون/پەنجەمۆر لەسەر ئەم ئامێرە بگۆڕدرێت.'
            )
      );
    } finally {
      setPrfBusy(false);
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
    <div className="space-y-4">
      {/* Unified Backup & Recovery Card (Phase F1) */}
      <div
        data-testid="settings-backup-hub-card"
        className="p-4 rounded-xl bg-primary/5 border border-primary/25 space-y-2.5"
      >
        <div className="flex items-center gap-2 text-xs font-bold text-foreground">
          <HardDrive className="size-4 text-primary" />
          <span>
            {bi(
              'النسخ الاحتياطي المشفر والاسترداد السريع (.ptbackup)',
              'Encrypted Vault Backup & Recovery Hub (.ptbackup)',
              'کۆپی یەدەگی کۆدکراو و گەڕاندنەوەی خێرا (.ptbackup)'
            )}
          </span>
        </div>
        <p className="text-xs text-muted-foreground-1 leading-relaxed">
          {bi(
            'احفظ نسخة احتياطية مشفرة لجميع سجلات العيادة على جهازك، أو نفذ تمرين التحقق من مفتاح الاسترداد الطارئ (32 حرفاً).',
            'Download an encrypted .ptbackup archive of your clinic records or run a 15-second Emergency Recovery Key verification drill.',
            'کۆپییەکی یەدەگی کۆدکراوی هەموو تۆمارەکانی کلینیک لەسەر ئامێرەکەت پاشەکەوت بکە، یان ڕاهێنانی دڵنیابوونەوە لە کلیلی گەڕاندنەوەی لەناکاو (32 پیت) ئەنجام بدە.'
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          {onOpenBackupModal && (
            <button
              type="button"
              data-testid="settings-open-backup-modal-btn"
              onClick={onOpenBackupModal}
              className="px-3.5 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <HardDrive className="size-3.5" />
              <span>
                {bi(
                  'فتح نافذة النسخ الاحتياطي والاستعادة',
                  'Open Backup & Restore',
                  'کردنەوەی پەنجەرەی کۆپی یەدەگ و گەڕاندنەوە'
                )}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenRecoveryDrill}
            className="px-3 py-2 rounded-xl bg-layer hover:bg-layer-hover border border-layer-line text-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Shield className="size-3.5 text-primary" />
            <span>{bi('تمرين التحقق من المفتاح', 'Verify Recovery Key', 'تاقیکردنەوەی کلیلی گەڕاندنەوە')}</span>
          </button>
          <button
            type="button"
            onClick={onOpenFullExport}
            className="px-3 py-2 rounded-xl bg-layer hover:bg-layer-hover border border-layer-line text-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Database className="size-3.5 text-primary" />
            <span>{bi('تصدير أرشيف كامل', 'Full Vault Export', 'ناردنەدەرەوەی ئەرشیفی تەواو')}</span>
          </button>
        </div>
      </div>

      {/* Inactivity Auto-Lock Timeout */}
      <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-2.5">
        <div className="flex items-center gap-2 text-xs font-bold text-foreground">
          <Clock className="size-4 text-primary" />
          <span>
            {bi(
              'القفل التلقائي عند عدم النشاط (Inactivity Auto-Lock):',
              'Inactivity Auto-Lock Timeout:',
              'قفڵکردنی خۆکار لە کاتی بێچالاکی (Inactivity Auto-Lock):'
            )}
          </span>
        </div>
        <p className="text-xs text-muted-foreground-1 leading-relaxed">
          {bi(
            'يقفل النظام الخزنة تلقائياً لحماية بيانات المرضى عند ترك الشاشة دون استخدام.',
            'Automatically locks the encrypted vault after inactivity.',
            'سیستەم خەزێنەکە بە شێوەی خۆکار قفڵ دەکات بۆ پاراستنی زانیارییەکانی نەخۆش کاتێک شاشەکە بە بێ بەکارهێنان بەجێدەهێڵدرێت.'
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

        {isCustomLockMode && (
          <div className="pt-1 space-y-1.5">
            <div className="flex items-center gap-2">
              <input
                id="settings-custom-lock-minutes"
                aria-label={bi('مدة القفل المخصصة بالدقائق', 'Custom auto-lock minutes', 'ماوەی قفڵکردنی تایبەت بە خولەک')}
                type="number"
                min={1}
                max={1440}
                step={1}
                dir="ltr"
                value={customLockMinutes}
                onChange={(e) => {
                  const raw = e.target.value;
                  setCustomLockMinutes(raw);
                  const parsed = parseInt(raw, 10);
                  if (!Number.isNaN(parsed) && parsed >= 1) {
                    setAutoLockTimeoutMs(Math.min(1440, parsed) * 60_000);
                  }
                }}
                placeholder="20"
                className="w-28 px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs font-mono font-bold text-foreground tabular-nums focus:outline-none focus:border-primary"
              />
              <span className="text-xs font-semibold text-muted-foreground-1">
                {bi('دقيقة (1 – 1440 دقيقة)', 'minutes (1 – 1440 min)', 'خولەک (1 – 1440 خولەک)')}
              </span>
            </div>
          </div>
        )}

        {!isCustomLockMode && autoLockTimeoutMs === 0 && (
          <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-xs font-medium text-amber-800 dark:text-amber-300">
            {bi(
              'تم تعطيل القفل التلقائي؛ ستبقى الخزنة مفتوحة إلى أن تقفلها يدوياً من القائمة.',
              'Auto-lock is disabled; the vault will stay unlocked until you lock it manually.',
              'قفڵکردنی خۆکار ناچالاک کراوە؛ خەزێنەکە بە کراوەیی دەمێنێتەوە تا خۆت بە دەست لە لیستەکەوە قفڵی دەکەیت.'
            )}
          </div>
        )}
      </div>

      {/* Staff Admin PIN Configuration (Team Mode only) */}
      {isSoloMode ? (
        <div className="p-4 rounded-xl bg-surface border border-line-2 text-xs text-muted-foreground-1 leading-relaxed">
          <div className="flex items-center gap-2 font-bold text-foreground mb-1">
            <KeyRound className="size-4 text-primary" />
            <span>
              {bi(
                'رمز تبديل الكادر (مُعطّل في وضع المعالج الفردي)',
                'Staff Admin PIN (Not Needed in Solo Mode)',
                'کۆدی گۆڕینی ستاف (لە شێوازی تاکدا ناچالاکە)'
              )}
            </span>
          </div>
          <p>
            {bi(
              'بما أنك تعمل في وضع المعالج الفردي، تفتح الخزينة مباشرة بكلمة المرور الرئيسية دون الحاجة لرمز PIN لتبديل الكادر.',
              'In Solo Mode, the vault unlocks directly with your Master Password with zero Staff Admin PIN prompts.',
              'لەبەرئەوەی لە شێوازی چارەسەرکاری تاکدا کاردەکەیت، خەزێنەکە ڕاستەوخۆ بە وشەی نهێنی سەرەکی دەکرێتەوە بێ پێویستبوون بە کۆدی PINی ستاف.'
            )}
          </p>
        </div>
      ) : (
        <form
          onSubmit={(e) => void handleSaveAdminPin(e)}
          className="p-4 rounded-xl bg-surface border border-line-2 space-y-2.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-foreground">
            <span className="inline-flex items-center gap-2">
              <KeyRound className="size-4 text-primary" />
              <span>
                {bi(
                  'رمز PIN لتبديل صفة المدير (نسبة التوثيق للكادر):',
                  'Staff Admin Attribution PIN (PBKDF2):',
                  'کۆدی PIN بۆ گۆڕینی دەسەڵاتی بەڕێوەبەر (PBKDF2):'
                )}
              </span>
            </span>
            <span
              className={`text-xs font-bold ${
                pinStatus.isConfigured
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-amber-700 dark:text-amber-400'
              }`}
            >
              {pinStatus.isConfigured
                ? bi('مهيأ (PBKDF2)', 'Configured (PBKDF2)', 'ڕێکخراوە (PBKDF2)')
                : bi('مطلوب التعيين', 'Setup Required', 'پێویستی بە دیاریکردن هەیە')}
            </span>
          </div>
          <p className="text-xs text-muted-foreground-1 leading-relaxed">
            {bi(
              'ملاحظة شفافية: تبديل الكادر يُستخدم لنسبة التوثيق في السجل فقط وليس مصادقة أمان مستقلة (مفتاح الخزينة الرئيسي هو الحماية الفعلية). الرموز الافتراضية مثل 1234 مرفوضة.',
              'Transparency notice: role switching is for staff attribution only, not security authentication. Trivial PINs like 1234/0000 are rejected; stored as salted PBKDF2 hash inside the encrypted vault.',
              'تێبینی شەفافیەت: گۆڕینی ستاف تەنها بۆ دیاریکردنی تۆمارکردنی ستافە و ڕەسەنایەتی سەربەخۆ نییە (کلیلی سەرەکی خەزێنە پاراستنی ڕاستەقینەیە). کۆدە سادەکانی وەک 1234 ڕەتدەکرێنەوە.'
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
            <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold">
              {adminPinError}
            </p>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="submit"
              disabled={pinSaving}
              className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground text-xs font-bold cursor-pointer"
            >
              {pinSaving
                ? bi('جاري التشفير...', 'Saving...', 'کۆد دەکرێت...')
                : pinSaved
                ? bi('تم الحفظ المشفر!', 'Saved!', 'بە کۆدکراوی پاشەکەوت کرا!')
                : bi('تحديث رمز المدير', 'Update Admin PIN', 'نوێکردنەوەی کۆدی بەڕێوەبەر')}
            </button>
          </div>
        </form>
      )}

      {/* Optional WebAuthn PRF Passkey / Biometrics Unlock (Hidden cleanly when unsupported) */}
      {isPrfSupported && (
        <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-foreground">
              <Fingerprint className="size-4 text-primary" />
              <span>
                {bi(
                  'الفتح السريع بمفتاح المرور / البصمة (اختياري)',
                  'Passkey / Biometrics Quick Unlock (Optional)',
                  'کردنەوەی خێرا بە کلیلی تێپەڕبوون / پەنجەمۆر (بژاردەیی)'
                )}
              </span>
            </div>
            <span
              className={`px-2 py-0.5 rounded-md text-xs font-bold border ${
                isPrfEnrolled
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25'
                  : 'bg-muted text-muted-foreground-1 border-line-2'
              }`}
            >
              {isPrfEnrolled
                ? bi('مفعّل', 'Enrolled', 'چالاککراوە')
                : bi('غير مفعّل', 'Disabled', 'ناچالاکە')}
            </span>
          </div>
          <p className="text-xs text-muted-foreground-1 leading-relaxed">
            {bi(
              'يستخدم امتداد WebAuthn PRF المتاح على هذا المتصفح. تظل كلمة المرور الرئيسية ومفتاح الاسترداد الطارئ فعالين دائماً.',
              'Uses local WebAuthn PRF key wrapping. Master password and recovery key always remain fully active.',
              'درێژکراوەی ناوخۆیی WebAuthn PRF لەسەر ئەم وێبگەڕە بەکاردەهێنێت. وشەی نهێنی سەرەکی و کلیلی گەڕاندنەوەی لەناکاو هەمیشە چالاک دەمێننەوە.'
            )}
          </p>
          {prfError && (
            <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold">{prfError}</p>
          )}
          <button
            type="button"
            disabled={prfBusy}
            onClick={() => void handleTogglePrf()}
            className="px-4 py-2 rounded-xl bg-layer hover:bg-layer-hover border border-layer-line text-xs font-bold text-foreground disabled:opacity-50 cursor-pointer"
          >
            {prfBusy
              ? bi('جاري المعالجة...', 'Working...', 'جێبەجێ دەکرێت...')
              : isPrfEnrolled
              ? bi('تعطيل مفتاح المرور', 'Disable Passkey Unlock', 'ناچالاککردنی کلیلی تێپەڕبوون')
              : bi('تفعيل البصمة / مفتاح المرور', 'Enable Passkey Unlock', 'چالاککردنی پەنجەمۆر / کلیلی تێپەڕبوون')}
          </button>
        </div>
      )}

      {/* Storage Health, Encryption Key Usage % & Per-Record Telemetry (1.4, 1.5, 1.8) */}
      <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-foreground">
          <HardDrive className="size-4 text-primary" />
          <span>
            {bi(
              'صحة التخزين المحلي واستهلاك مفتاح التشفير',
              'Storage Health & Encryption Key Usage',
              'تەندروستی کۆگای ناوخۆیی و بەکارهێنانی کلیلی کۆدکردن'
            )}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
          <div className="p-2.5 rounded-lg bg-layer border border-layer-line flex items-center justify-between gap-2">
            <span className="text-muted-foreground-1">{bi('تثبيت التخزين:', 'Persistence:', 'جێگیرکردنی کۆگا:')}</span>
            <div className="flex items-center gap-2">
              <span className={`font-bold ${localPersistenceState ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-300'}`}>
                {localPersistenceState
                  ? bi('مثبت (Persistent)', 'Persistent', 'جێگیرکراو (Persistent)')
                  : bi('غير مثبت', 'Best-effort', 'جێگیر نەکراو')}
              </span>
              {!localPersistenceState && (
                <button
                  type="button"
                  onClick={() => void handleRetryPersistence()}
                  className="px-2 py-0.5 rounded bg-primary/15 text-primary font-bold cursor-pointer"
                >
                  {bi('طلب', 'Grant', 'داواکردن')}
                </button>
              )}
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-layer border border-layer-line flex items-center justify-between gap-2">
            <span className="text-muted-foreground-1">{bi('سعة المتصفح:', 'Quota:', 'قەبارەی وێبگەڕ:')}</span>
            <span dir="ltr" className="font-mono font-bold text-foreground tabular-nums">
              {storageEstimate
                ? `${storageEstimate.usageMB} / ${storageEstimate.quotaMB} MB`
                : bi('غير متاح', 'N/A', 'بەردەست نییە')}
            </span>
          </div>

          <div className="p-2.5 rounded-lg bg-layer border border-layer-line flex items-center justify-between gap-2">
            <span className="text-muted-foreground-1">{bi('آخر نسخة احتياطية:', 'Last backup:', 'دوایین کۆپی یەدەگ:')}</span>
            <span dir="ltr" className="font-mono font-bold text-foreground">
              {backupMeta.lastBackupAt
                ? backupMeta.lastBackupAt.slice(0, 10)
                : bi('لم يتم بعد', 'Never', 'هێشتا نەکراوە')}
            </span>
          </div>

          <div className="p-2.5 rounded-lg bg-layer border border-layer-line flex items-center justify-between gap-2">
            <span className="text-muted-foreground-1 inline-flex items-center gap-1">
              <Activity className="size-3.5 text-primary" />
              <span>{bi('عمليات حفظ فردية:', 'Per-record writes:', 'پاشەکەوتکردنی تاکە تۆمار:')}</span>
            </span>
            <span dir="ltr" className="font-mono font-bold text-foreground tabular-nums">
              {telemetry.totalWrites} ({bi('اليوم:', 'today:', 'ئەمڕۆ:')} {telemetry.writesToday})
            </span>
          </div>
        </div>

        {/* GCM Encryption Key Usage Meter & Manual Rotation */}
        <div className="pt-1 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-foreground">
              {bi(
                'نسبة استهلاك مفتاح التشفير (تدوير تلقائي عند 70%):',
                'Encryption key usage (auto-rotates at 70%):',
                'ڕێژەی بەکارهێنانی کلیلی کۆدکردن (سووڕانەوەی خۆکار لە 70%):'
              )}
            </span>
            <span dir="ltr" className="font-mono font-bold text-primary tabular-nums">
              {usagePct}% {keyUsageStatus ? `(${keyUsageStatus.effectiveCount.toLocaleString()} / ${keyUsageStatus.maxLimit.toLocaleString()})` : ''}
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-layer overflow-hidden border border-layer-line">
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
                    'تم تدوير مفتاح التشفير بنجاح! احفظ مفتاح الاسترداد الطارئ الجديد فوراً:',
                    'DEK rotated cleanly! Record your new Emergency Recovery Key immediately:',
                    'کلیلی کۆدکردن بە سەرکەوتوویی سووڕێنرایەوە! دەستبەجێ کلیلی گەڕاندنەوەی لەناکاوی نوێ هەڵبگرە:'
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
                      <span>
                        {bi(
                          'تم النسخ (يُمسح بعد 60 ثانية)',
                          'Copied (auto-clears in 60s)',
                          'لەبەرگیرایەوە (دوای 60 چرکە دەسڕێتەوە)'
                        )}
                      </span>
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
              className="px-3.5 py-1.5 rounded-xl bg-layer hover:bg-layer-hover border border-layer-line text-xs font-bold text-foreground inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`size-3.5 text-primary ${rotatingDek ? 'animate-spin' : ''}`} />
              <span>
                {rotatingDek
                  ? bi('جاري إعادة التشفير...', 'Rotating DEK...', 'دووبارە کۆدکردنەوە لە جریان دایە...')
                  : bi('تدوير مفتاح التشفير يدوياً', 'Rotate DEK Now', 'سووڕاندنەوەی کلیلی کۆدکردن بە دەست')}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Phase A4: Quarterly Recovery Drill & Backup Sandbox Test */}
      <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            <Shield className="size-4 text-primary shrink-0" />
            <span>
              {bi(
                'تمرين الاسترداد الربع سنوي واختبار النسخة الاحتياطية',
                'Quarterly Recovery Drill & Backup Sandbox Test',
                'ڕاهێنانی گەڕاندنەوەی وەرزی و تاقیکردنەوەی کۆپی یەدەگ'
              )}
            </span>
          </div>
          {lastRecoveryDrillAt ? (
            <span
              data-testid="settings-drill-verified-badge"
              className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 text-xs font-bold"
            >
              <CheckCircle2 className="size-3.5" />
              <span>
                {bi('تم التحقق', 'Verified', 'دڵنیاییکراوەتەوە')}:{' '}
                {new Date(lastRecoveryDrillAt).toLocaleDateString(
                  language === 'en' ? 'en-GB' : 'ar-IQ'
                )}
              </span>
            </span>
          ) : (
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
              {bi('بانتظار الاختبار', 'Test Pending', 'چاوەڕوانی تاقیکردنەوەیە')}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground-1 leading-relaxed">
          {bi(
            'اختبر قدرتك على استعادة النسخة الاحتياطية (.ptbackup) داخل قاعدة بيانات معزولة وتحقق من مجموعة واحدة من مفتاح الاسترداد الطارئ.',
            'Verify your Emergency Recovery Key spot group and test-decrypt your latest .ptbackup file in an isolated sandbox without affecting live clinic records.',
            'توانای گەڕاندنەوەی کۆپی یەدەگ (.ptbackup) لە داتابەیسێکی جیاکراودا تاقیبکەرەوە و لە کۆمەڵەیەکی کلیلی گەڕاندنەوەی لەناکاو دڵنیاببەرەوە.'
          )}
        </p>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onOpenRecoveryDrill}
            data-testid="open-recovery-drill-btn"
            className="px-3.5 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Shield className="size-3.5" />
            <span>
              {bi(
                'تشغيل تمرين الاسترداد واختبار النسخة',
                'Run Recovery Drill & Test Backup',
                'کارپێکردنی ڕاهێنانی گەڕاندنەوە و تاقیکردنەوەی کۆپی یەدەگ'
              )}
            </span>
          </button>
        </div>
      </div>

      {/* 5.1 Data Portability: CSV Onboarding + Full Plaintext Export */}
      <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-foreground">
          <FileSpreadsheet className="size-4 text-primary" />
          <span>
            {bi(
              'قابلية نقل البيانات (استيراد CSV / تصدير كامل غير مشفر)',
              'Data Portability (CSV Onboarding & Full Plaintext Export)',
              'گواستنەوەی داتا (هاوردەکردنی CSV / هەناردەکردنی تەواوی بێ کۆد)'
            )}
          </span>
        </div>
        <p className="text-xs text-muted-foreground-1 leading-relaxed">
          {bi(
            'يمكنك استيراد قائمة مرضاك السابقة عبر جدول CSV، أو تصدير جميع بيانات العيادة بصيغ CSV / JSON غير مشفرة بعد إعادة إدخال كلمة مرور الخزينة.',
            'Onboard patients from an existing CSV spreadsheet, or export your full clinical ledger as plaintext CSV/JSON after vault password verification.',
            'دەتوانیت لیستی نەخۆشەکانی پێشووت لە خشتەی CSVەوە هاوردە بکەیت، یان هەموو داتای کلینیک بە شێوازی CSV / JSON بێ کۆد هەناردە بکەیت دوای دووبارە نووسینی وشەی نهێنی خەزێنە.'
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onOpenCsvOnboarding}
            className="py-2 px-3.5 rounded-xl bg-layer hover:bg-layer-hover border border-layer-line text-xs font-bold text-foreground inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Upload className="size-3.5 text-primary" />
            <span>{bi('استيراد مرضى (CSV)', 'Import Patients CSV', 'هاوردەکردنی نەخۆشەکان (CSV)')}</span>
          </button>
          <button
            type="button"
            onClick={onOpenFullExport}
            className="py-2 px-3.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-xs font-bold text-amber-800 dark:text-amber-300 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Database className="size-3.5" />
            <span>{bi('تصدير كامل (CSV / JSON)', 'Full CSV / JSON Export', 'هەناردەکردنی تەواو (CSV / JSON)')}</span>
          </button>
        </div>
      </div>

      <PlatformUpdateCenterCard onOpenBackupModal={onOpenBackupModal} />

      {settingsViewMode === 'simple' && (
        <div
          data-testid="settings-simple-mode-notice"
          className="p-3 rounded-xl bg-muted/60 border border-line-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground-1"
        >
          <span>
            {bi(
              'الوضع المبسط مفعّل حالياً — يتم إخفاء تبويبات الكادر والمطور المتقدمة لتقليل الازدحام.',
              'Simple Mode active — advanced staff & developer controls are hidden for a cleaner view.',
              'شێوازی سادە لە ئێستادا چالاکە — بەشە پێشکەوتووەکانی ستاف و گەشەپێدەر شاردراونەتەوە بۆ کەمکردنەوەی قەرەباڵغی.'
            )}
          </span>
          <button
            type="button"
            data-testid="settings-switch-to-advanced-inline-btn"
            onClick={() => onSwitchSettingsMode('advanced')}
            className="px-2.5 py-1 rounded-lg bg-layer border border-layer-line text-foreground font-bold cursor-pointer hover:bg-layer-hover"
          >
            {bi('عرض الوضع المتقدم', 'Switch to Advanced', 'گۆڕین بۆ شێوازی پێشکەوتوو')}
          </button>
        </div>
      )}
    </div>
  );
};
