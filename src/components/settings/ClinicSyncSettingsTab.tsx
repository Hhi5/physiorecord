// =======================================================================
// PhysioRecord — Clinic Multi-Device Sync Settings Tab (Dual Free Options)
// 1. Local Wi-Fi (LAN) Non-Destructive Sync + Offline Outbox + .ptsync File
// 2. Encrypted Google Drive BYOC Sync ($0 ongoing cost) + Setup/Security Guide
// =======================================================================

import React, { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cloud,
  Copy,
  Download,
  Eye,
  EyeOff,
  HardDrive,
  Laptop,
  Lock,
  LogOut,
  RefreshCw,
  Server,
  ShieldCheck,
  Upload,
  Wifi,
  WifiOff,
  AlertTriangle,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useVault } from '../../context/VaultContext';
import { usePatients } from '../../context/PatientContext';
import {
  getElectronDesktopBridge,
  isNativeAndroid,
  saveTextFilePortable,
  shareGeneratedFileOnAndroid,
} from '../../platform/nativeBridge';
import {
  clearOfflineSyncOutbox,
  exportEncryptedSyncFileString,
  getClinicSyncConfig,
  getOfflineSyncOutbox,
  importAndMergeEncryptedSyncFile,
  saveClinicSyncConfig,
  syncWithEncryptedGoogleDrive,
  syncWithLocalLanHub,
  type ClinicSyncConfig,
  type ClinicSyncMode,
  type OfflineSyncOutboxRecord,
} from '../../services/clinicSyncService';
import {
  getGoogleDriveAuthState,
  getNativeGoogleOAuthConfig,
  saveNativeGoogleOAuthConfig,
  signInWithGoogleDrive,
  signOutGoogleDrive,
  type GoogleDriveAuthState,
} from '../../services/googleDriveSync';

const GoogleBrandMark: React.FC = () => (
  <svg className="size-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
    />
    <path
      fill="#FBBC05"
      d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
    />
    <path
      fill="#EA4335"
      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
    />
  </svg>
);

export const ClinicSyncSettingsTab: React.FC = () => {
  const { bi } = useLanguage();
  const { dek } = useVault();
  const { refreshPatients } = usePatients();

  const electronBridge = getElectronDesktopBridge();
  const isElectronDesktop = Boolean(electronBridge?.startLanSyncHub);
  const isAndroidApk = isNativeAndroid();
  const isNativeAppPlatform = isAndroidApk || Boolean(electronBridge);

  const [config, setConfig] = useState<ClinicSyncConfig>(() => getClinicSyncConfig());
  const [outbox, setOutbox] = useState<OfflineSyncOutboxRecord | null>(() => getOfflineSyncOutbox());
  const [syncPassphrase, setSyncPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);

  // Electron LAN Hub status
  const [hubStatus, setHubStatus] = useState<{
    running: boolean;
    port: number;
    urls: string[];
    pairingToken: string;
    storedDevicesCount: number;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Google Drive Auth state (in-memory only)
  const [driveAuth, setDriveAuth] = useState<GoogleDriveAuthState>(() => getGoogleDriveAuthState());
  const [nativeOAuthCfg, setNativeOAuthCfg] = useState(() => getNativeGoogleOAuthConfig());
  const [showNativeOAuthSetup, setShowNativeOAuthSetup] = useState(
    () => Boolean(getNativeGoogleOAuthConfig().clientId)
  );
  const [showDriveConfirmModal, setShowDriveConfirmModal] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(true);

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'info' | 'error'; text: string } | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!electronBridge?.getLanSyncHubStatus) return;
    void electronBridge.getLanSyncHubStatus().then((st) => {
      setHubStatus(st);
    });
  }, [electronBridge]);

  const handleModeChange = (mode: ClinicSyncMode) => {
    const next = saveClinicSyncConfig({ mode });
    setConfig(next);
    setFeedback(null);
  };

  const handleCopy = (key: string, text: string) => {
    if (navigator?.clipboard?.writeText) {
      void navigator.clipboard.writeText(text);
      setCopiedField(key);
      setTimeout(() => setCopiedField(null), 1800);
    }
  };

  const handleToggleLanHub = async () => {
    if (!electronBridge?.startLanSyncHub || !electronBridge?.stopLanSyncHub) return;
    setBusyAction('lan-hub');
    setFeedback(null);
    try {
      if (hubStatus?.running) {
        await electronBridge.stopLanSyncHub();
        const st = await electronBridge.getLanSyncHubStatus?.();
        if (st) setHubStatus(st);
      } else {
        const st = await electronBridge.startLanSyncHub({ port: 47821 });
        setHubStatus(st);
        if (st.error) {
          setFeedback({ kind: 'error', text: st.error });
        } else if (st.urls[0]) {
          const updated = saveClinicSyncConfig({
            mode: 'lan',
            lanServerUrl: st.urls[0],
            lanPairingToken: st.pairingToken,
          });
          setConfig(updated);
          setFeedback({
            kind: 'success',
            text: bi(
              `تم تشغيل خادم الواي فاي المحلي بنجاح على ${st.urls[0]} — يمكنك الآن ربط أجهزة المعالجين على نفس الشبكة.`,
              `Clinic LAN Hub started at ${st.urls[0]}. Peer therapist devices on the same Wi-Fi can now sync.`
            ),
          });
        }
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleSyncLanNow = async () => {
    if (!dek) return;
    if (syncPassphrase.trim().length < 6) {
      setFeedback({
        kind: 'error',
        text: bi(
          'أدخل كلمة مرور المزامنة المشتركة للعيادة (6 أحرف على الأقل) لتشفير البيانات قبل الإرسال.',
          'Enter the shared clinic sync passphrase (at least 6 characters) to encrypt records before syncing.'
        ),
      });
      return;
    }

    setBusyAction('lan-sync');
    setFeedback(null);
    try {
      saveClinicSyncConfig({
        mode: 'lan',
        lanServerUrl: config.lanServerUrl,
        lanPairingToken: config.lanPairingToken,
        deviceLabel: config.deviceLabel,
      });
      const res = await syncWithLocalLanHub({
        dek,
        passphrase: syncPassphrase,
        serverUrl: config.lanServerUrl,
        pairingToken: config.lanPairingToken,
      });
      setConfig(getClinicSyncConfig());
      setOutbox(getOfflineSyncOutbox());
      if (res.ok) {
        await refreshPatients();
        setFeedback({ kind: 'success', text: bi(res.messageAr, res.messageEn) });
      } else if (res.queuedOffline) {
        setFeedback({ kind: 'info', text: bi(res.messageAr, res.messageEn) });
      }
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : bi('فشلت المزامنة المحلية.', 'LAN sync failed.'),
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleSignInGoogle = async () => {
    setBusyAction('google-signin');
    setFeedback(null);
    try {
      const st = await signInWithGoogleDrive();
      setDriveAuth(st);
      setConfig(saveClinicSyncConfig({ mode: 'google_drive' }));
      setFeedback({
        kind: 'success',
        text: bi(
          `تم تسجيل الدخول بنجاح بحساب ${st.email || 'Google'}. التوكن محفوظ بالذاكرة المؤقتة فقط ولا يُخزّن على القرص.`,
          `Signed in as ${st.email || 'Google'}. Access token is kept strictly in memory.`
        ),
      });
    } catch (err) {
      setFeedback({
        kind: 'error',
        text:
          err instanceof Error
            ? err.message
            : bi('تعذّر تسجيل الدخول بحساب Google.', 'Google Sign-In failed.'),
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleSignOutGoogle = async () => {
    await signOutGoogleDrive();
    setDriveAuth(getGoogleDriveAuthState());
    setFeedback({
      kind: 'info',
      text: bi(
        'تم تسجيل الخروج من Google Drive ومسح رمز الوصول من الذاكرة. سجلاتك المحلية تبقى آمنة على جهازك.',
        'Signed out from Google Drive and cleared access token from memory. Local records remain intact.'
      ),
    });
  };

  const handleRequestGoogleDriveSync = () => {
    if (!driveAuth.isSignedIn) {
      setFeedback({
        kind: 'error',
        text: bi('يرجى تسجيل الدخول بحساب Google أولاً.', 'Please sign in with Google first.'),
      });
      return;
    }
    if (syncPassphrase.trim().length < 6) {
      setFeedback({
        kind: 'error',
        text: bi(
          'أدخل كلمة مرور المزامنة المشتركة للعيادة (6 أحرف على الأقل) — يتم تشفير ملفات المرضى بها قبل رفعها إلى Google Drive.',
          'Enter the shared clinic sync passphrase (min 6 chars) — patient data is AES-256-GCM encrypted before upload.'
        ),
      });
      return;
    }
    // Mandatory explicit confirmation dialog before any Drive upload/write mutation
    setShowDriveConfirmModal(true);
  };

  const handleConfirmedGoogleDriveSync = async () => {
    if (!dek) return;
    setShowDriveConfirmModal(false);
    setBusyAction('drive-sync');
    setFeedback(null);
    try {
      const res = await syncWithEncryptedGoogleDrive({
        dek,
        passphrase: syncPassphrase,
      });
      setConfig(getClinicSyncConfig());
      setOutbox(getOfflineSyncOutbox());
      if (res.ok) {
        await refreshPatients();
        setFeedback({ kind: 'success', text: bi(res.messageAr, res.messageEn) });
      } else if (res.queuedOffline) {
        setFeedback({ kind: 'info', text: bi(res.messageAr, res.messageEn) });
      }
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : bi('تعذّرت المزامنة مع Google Drive.', 'Google Drive sync failed.'),
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleExportSyncFile = async () => {
    if (!dek) return;
    if (syncPassphrase.trim().length < 6) {
      setFeedback({
        kind: 'error',
        text: bi(
          'أدخل كلمة مرور المزامنة المشتركة (6 أحرف على الأقل) لتشفير ملف `.ptsync.json`.',
          'Enter the shared clinic sync passphrase (min 6 chars) to encrypt the .ptsync.json file.'
        ),
      });
      return;
    }
    setBusyAction('export-file');
    setFeedback(null);
    try {
      const exported = await exportEncryptedSyncFileString(dek, syncPassphrase);
      await saveTextFilePortable({
        filename: exported.filename,
        content: exported.content,
        mimeType: 'application/json',
        description: 'PhysioRecord Encrypted Sync Package',
        extensions: ['json'],
      });
      setFeedback({
        kind: 'success',
        text: bi(
          `تم تصدير حزمة المزامنة المشفّرة (${exported.filename}) بنجاح. يمكنك نقلها لأي جهاز آخر ودمجها بدون حذف أي سجل.`,
          `Exported encrypted sync package (${exported.filename}). Import it on any peer device for a non-destructive merge.`
        ),
      });
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : bi('فشل تصدير حزمة المزامنة.', 'Export failed.'),
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleShareSyncToAndroidDrive = async () => {
    if (!dek) return;
    if (syncPassphrase.trim().length < 6) {
      setFeedback({
        kind: 'error',
        text: bi(
          'أدخل كلمة مرور المزامنة المشتركة (6 أحرف على الأقل) لتشفير الملف قبل إرساله إلى Google Drive.',
          'Enter the shared clinic sync passphrase (min 6 chars) to encrypt the file before sending to Google Drive.'
        ),
      });
      return;
    }
    setBusyAction('android-drive-share');
    setFeedback(null);
    try {
      const exported = await exportEncryptedSyncFileString(dek, syncPassphrase);
      if (isAndroidApk) {
        const shared = await shareGeneratedFileOnAndroid({
          filename: exported.filename,
          content: exported.content,
          mimeType: 'application/json',
          title: bi('حفظ حزمة مزامنة PhysioRecord إلى Google Drive', 'Save PhysioRecord Sync to Google Drive'),
        });
        if (!shared) {
          await saveTextFilePortable({
            filename: exported.filename,
            content: exported.content,
            mimeType: 'application/json',
            description: 'PhysioRecord Encrypted Sync Package',
            extensions: ['json'],
          });
        }
        setFeedback({
          kind: 'success',
          text: bi(
            `تم تجهيز الحزمة المشفّرة (${exported.filename}). اختر «حفظ في Drive» من قائمة المشاركة لرفعها مباشرة إلى Google Drive.`,
            `Prepared encrypted package (${exported.filename}). Pick "Save to Drive" to upload directly to Google Drive.`
          ),
        });
      } else {
        const savedRes = await saveTextFilePortable({
          filename: exported.filename,
          content: exported.content,
          mimeType: 'application/json',
          description: 'PhysioRecord Encrypted Sync Package',
          extensions: ['json'],
        });
        if (savedRes.confirmedSaved) {
          setFeedback({
            kind: 'success',
            text: bi(
              `تم حفظ الحزمة المشفّرة (${exported.filename}) بنجاح. إذا حفظتها داخل مجلد Google Drive على الحاسبة ستُرفع تلقائياً، ويمكنك استيرادها من هاتفك بدون حذف أي سجل.`,
              `Saved encrypted package (${exported.filename}). Save it inside your Google Drive desktop folder (or upload to drive.google.com) to merge on other devices.`
            ),
          });
        }
      }
    } catch (err) {
      setFeedback({
        kind: 'error',
        text:
          err instanceof Error
            ? err.message
            : bi('تعذّر إرسال ملف المزامنة إلى Google Drive.', 'Could not export sync file for Google Drive.'),
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleImportSyncFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !dek) return;

    if (syncPassphrase.trim().length < 6) {
      setFeedback({
        kind: 'error',
        text: bi(
          'أدخل كلمة مرور المزامنة المشتركة أولاً لفك تشفير الحزمة المستوردة.',
          'Enter the shared clinic sync passphrase first to decrypt the imported file.'
        ),
      });
      return;
    }

    setBusyAction('import-file');
    setFeedback(null);
    try {
      const text = await file.text();
      const res = await importAndMergeEncryptedSyncFile(text, dek, syncPassphrase);
      setConfig(getClinicSyncConfig());
      await refreshPatients();
      setFeedback({ kind: 'success', text: bi(res.messageAr, res.messageEn) });
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : bi('فشل دمج ملف المزامنة.', 'Import merge failed.'),
      });
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="space-y-4" data-testid="clinic-sync-settings-tab">
      {/* Header Guarantee Banner */}
      <div className="p-4 rounded-2xl bg-card border border-card-line space-y-2">
        <div className="flex items-start gap-3">
          <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <ShieldCheck className="size-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-black text-foreground">
              {bi('مزامنة العيادة متعددة الأجهزة (مجانية $0 وآمنة بالتشفير الطرفي)', 'Free Multi-Device Clinic Sync (End-to-End Encrypted)')}
            </h3>
            <p className="text-xs text-muted-foreground-1 leading-relaxed">
              {bi(
                'اختر الطريقة المناسبة لعيادتك: مزامنة الواي فاي المحلي داخل العيادة (بدون إنترنت)، أو مزامنة Google Drive المشفّرة بحسابك الشخصي (مجانية للأبد وتعمل من أي مكان).',
                'Choose what fits your clinic: Local Wi-Fi Clinic Sync (offline LAN) or Encrypted Google Drive Sync using your own free Google account.'
              )}
            </p>
            <div className="flex flex-wrap gap-2 pt-1 text-xs font-bold">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="size-3.5" />
                {bi('دمج تراكمي فقط — لا يُحذف أي سجل من تطبيق المعالج', 'Additive merge only — never deletes therapist data')}
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 text-primary">
                <Lock className="size-3.5" />
                {bi('تشفير AES-256-GCM قبل مغادرة الجهاز', 'AES-256-GCM encrypted before leaving device')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Offline Outbox Indicator (when Clinic PC / Internet was off) */}
      {outbox && (
        <div
          data-testid="sync-offline-outbox-banner"
          className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-wrap items-center justify-between gap-2 text-xs"
        >
          <div className="flex items-start gap-2.5 min-w-0">
            <WifiOff className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="font-extrabold text-amber-800 dark:text-amber-300">
                {bi(
                  'توجد حزمة مزامنة مشفّرة بانتظار الإرسال (صندوق أوفلاين)',
                  'Pending encrypted sync package queued offline'
                )}
              </div>
              <p className="text-muted-foreground-1">
                {bi(
                  'تم حفظ عملك محلياً بأمان أثناء إطفاء الحاسبة أو انقطاع الاتصال — اضغط «مزامنة الآن» فور توفر الشبكة.',
                  'Your work was queued locally while offline — click "Sync Now" once connected.'
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              clearOfflineSyncOutbox();
              setOutbox(null);
            }}
            className="text-xs font-bold text-amber-800 dark:text-amber-300 hover:underline cursor-pointer"
          >
            {bi('مسح التنبيه', 'Dismiss')}
          </button>
        </div>
      )}

      {/* Feedback Banner */}
      {feedback && (
        <div
          role="status"
          data-testid="clinic-sync-feedback"
          className={`p-3.5 rounded-2xl border text-xs font-bold leading-relaxed ${
            feedback.kind === 'error'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-400'
              : feedback.kind === 'info'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Mode Selector Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {(
          [
            {
              id: 'off' as ClinicSyncMode,
              icon: HardDrive,
              titleAr: 'محلي فقط (جهاز واحد)',
              titleEn: 'Local Only',
              descAr: 'العمل أوفلاين بالكامل على هذا الجهاز فقط.',
              descEn: 'Fully standalone on this device.',
            },
            {
              id: 'lan' as ClinicSyncMode,
              icon: Wifi,
              titleAr: 'واي فاي العيادة (LAN)',
              titleEn: 'Local Wi-Fi (LAN)',
              descAr: 'مزامنة داخل العيادة بدون إنترنت + عمل أوفلاين عند إطفاء الحاسبة.',
              descEn: 'In-clinic Wi-Fi sync without internet + offline queue.',
            },
            {
              id: 'google_drive' as ClinicSyncMode,
              icon: Cloud,
              titleAr: 'Google Drive المشفّر',
              titleEn: 'Encrypted Google Drive',
              descAr: 'مجاني 15GB للأبد — يزامن من أي مكان حتى والحاسبة مطفية.',
              descEn: 'Free 15GB forever — sync anywhere even when PC is off.',
            },
          ] as const
        ).map((opt) => {
          const Icon = opt.icon;
          const selected = config.mode === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              data-testid={`sync-mode-card-${opt.id}`}
              onClick={() => handleModeChange(opt.id)}
              className={`p-3.5 rounded-2xl border text-start transition-all cursor-pointer space-y-1.5 ${
                selected
                  ? 'border-primary bg-primary/[0.06] ring-2 ring-primary/20'
                  : 'border-card-line bg-card hover:bg-surface/60'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <Icon className={`size-4.5 ${selected ? 'text-primary' : 'text-muted-foreground-1'}`} />
                {selected && <CheckCircle2 className="size-4 text-primary" />}
              </div>
              <div className="text-xs font-extrabold text-foreground">
                {bi(opt.titleAr, opt.titleEn)}
              </div>
              <p className="text-xs text-muted-foreground-1 leading-relaxed">
                {bi(opt.descAr, opt.descEn)}
              </p>
            </button>
          );
        })}
      </div>

      {/* Shared Clinic Sync Passphrase & Device Label (Shown whenever sync mode is LAN or Google Drive) */}
      {config.mode !== 'off' && (
        <div className="p-4 rounded-2xl bg-card border border-card-line space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="sync-passphrase-input"
                className="block text-xs font-bold text-foreground mb-1"
              >
                {bi('كلمة مرور المزامنة المشتركة للعيادة (للتشفير الطرفي)', 'Shared Clinic Sync Passphrase (E2EE)')}
              </label>
              <div className="relative">
                <input
                  id="sync-passphrase-input"
                  data-testid="sync-passphrase-input"
                  type={showPassphrase ? 'text' : 'password'}
                  value={syncPassphrase}
                  onChange={(e) => setSyncPassphrase(e.target.value)}
                  placeholder={bi('كلمة مرور موحّدة تُكتب على جميع أجهزة العيادة...', 'Same passphrase across all clinic devices...')}
                  className="w-full h-10 ps-3 pe-10 rounded-xl bg-surface border border-line-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
                />
                <button
                  type="button"
                  onClick={() => setShowPassphrase((v) => !v)}
                  aria-label={bi('إظهار/إخفاء', 'Show/hide')}
                  className="absolute end-1.5 top-1/2 -translate-y-1/2 size-7 rounded-lg flex items-center justify-center text-muted-foreground-1 hover:text-foreground cursor-pointer"
                >
                  {showPassphrase ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground-1 mt-1">
                {bi(
                  'تُستخدم لتشفير ملفات المزامنة بـ AES-256-GCM قبل خروجها من الجهاز (ولا تُحفظ بالملفات السحابية).',
                  'Encrypts sync envelopes with AES-256-GCM before leaving your device.'
                )}
              </p>
            </div>

            <div>
              <label
                htmlFor="sync-device-label-input"
                className="block text-xs font-bold text-foreground mb-1"
              >
                {bi('اسم هذا الجهاز في العيادة', 'This Device Label')}
              </label>
              <input
                id="sync-device-label-input"
                type="text"
                value={config.deviceLabel}
                onChange={(e) => setConfig(saveClinicSyncConfig({ deviceLabel: e.target.value }))}
                className="w-full h-10 px-3 rounded-xl bg-surface border border-line-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
              />
              <p className="text-xs text-muted-foreground-1 mt-1 font-mono">
                ID: {config.deviceId}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* OPTION 1: LOCAL WI-FI (LAN) CLINIC SYNC */}
      {config.mode === 'lan' && (
        <div
          data-testid="lan-sync-panel"
          className="p-4 rounded-2xl bg-card border border-card-line space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Server className="size-4.5 text-primary" />
              <h4 className="text-xs sm:text-sm font-black text-foreground">
                {bi('إعدادات مزامنة الواي فاي المحلي (بدون إنترنت)', 'Local Wi-Fi (LAN) Clinic Sync Settings')}
              </h4>
            </div>
            {config.lastSyncAt && config.lastSyncMode === 'lan' && (
              <span className="text-xs text-muted-foreground-1">
                {bi('آخر مزامنة:', 'Last sync:')} {new Date(config.lastSyncAt).toLocaleString()}
              </span>
            )}
          </div>

          {/* Clear No-Hotspot Banner */}
          <div className="p-3 rounded-xl bg-emerald-500/[0.07] border border-emerald-500/20 text-xs text-foreground leading-relaxed">
            <div className="font-extrabold text-emerald-800 dark:text-emerald-300 mb-1">
              {bi(
                'لا تحتاج فتح نقطة اتصال (Hotspot) من الحاسبة!',
                'No PC Hotspot needed!'
              )}
            </div>
            <p className="text-muted-foreground-1">
              {bi(
                'فقط اربط حاسبة العيادة وموبايلات المعالجين على نفس راوتر الواي فاي العادي في العيادة (يعمل حتى لو انقطع الإنترنت عن الراوتر).',
                'Simply connect the clinic PC and therapists’ phones to the same regular clinic Wi-Fi router (works even without internet).'
              )}
            </p>
          </div>

          {/* Windows Electron Built-In Hub Controls */}
          {isElectronDesktop ? (
            <div className="p-3.5 rounded-xl bg-surface/80 border border-line-2 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-extrabold text-foreground flex items-center gap-1.5">
                    <Laptop className="size-4 text-primary" />
                    <span>{bi('حاسبة العيادة الرئيسية (تشغيل الاستقبال على الواي فاي)', 'Clinic Main PC (Wi-Fi Sync Receiver)')}</span>
                  </div>
                  <p className="text-xs text-muted-foreground-1 mt-0.5 leading-relaxed">
                    {bi(
                      'اضغط «تشغيل» لتستقبل الحاسبة مزامنة موبايلات المعالجين على نفس الراوتر. وإذا أُطفئت الحاسبة، يكمل كل معالج عمله أوفلاين بدون حذف أي سجل.',
                      'Click Start so this PC receives encrypted sync packages over your clinic router. When the PC is off, therapists keep working offline.'
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busyAction === 'lan-hub'}
                  onClick={handleToggleLanHub}
                  className={`h-9 px-4 rounded-xl text-xs font-extrabold cursor-pointer transition-colors ${
                    hubStatus?.running
                      ? 'bg-rose-600 hover:bg-rose-700 text-white'
                      : 'bg-primary hover:bg-primary-hover text-primary-foreground'
                  }`}
                >
                  {hubStatus?.running
                    ? bi('إيقاف المزامنة على الشبكة', 'Stop Wi-Fi Sync')
                    : bi('تشغيل المزامنة على شبكة العيادة', 'Start Clinic Wi-Fi Sync')}
                </button>
              </div>

              {hubStatus?.running && (
                <div className="space-y-2.5 pt-2 border-t border-card-divider">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="p-2.5 rounded-xl bg-card border border-card-line flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs text-muted-foreground-1">{bi('رابط العيادة على الواي فاي:', 'Clinic Wi-Fi Link:')}</div>
                        <div className="text-xs font-mono font-bold text-primary truncate" dir="ltr">
                          {hubStatus.urls[0]}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy('url', hubStatus.urls[0] || '')}
                        className="size-8 rounded-lg bg-surface hover:bg-surface/80 flex items-center justify-center cursor-pointer shrink-0"
                        aria-label={bi('نسخ الرابط', 'Copy URL')}
                      >
                        {copiedField === 'url' ? (
                          <Check className="size-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="size-3.5 text-muted-foreground-1" />
                        )}
                      </button>
                    </div>
                    <div className="p-2.5 rounded-xl bg-card border border-card-line flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs text-muted-foreground-1">{bi('رمز الاقتران:', 'Pairing Code:')}</div>
                        <div className="text-xs font-mono font-bold text-foreground" dir="ltr">
                          {hubStatus.pairingToken}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy('token', hubStatus.pairingToken)}
                        className="size-8 rounded-lg bg-surface hover:bg-surface/80 flex items-center justify-center cursor-pointer shrink-0"
                        aria-label={bi('نسخ رمز الاقتران', 'Copy Pairing Code')}
                      >
                        {copiedField === 'token' ? (
                          <Check className="size-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="size-3.5 text-muted-foreground-1" />
                        )}
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy('pair', `${hubStatus.urls[0] || ''}|${hubStatus.pairingToken}`)
                    }
                    className="compact-btn h-8 px-3 rounded-lg bg-primary/10 hover:bg-primary/15 text-primary text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedField === 'pair' ? (
                      <Check className="size-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                    <span>
                      {copiedField === 'pair'
                        ? bi('تم نسخ كود الربط السريع!', 'Quick-pair code copied!')
                        : bi('نسخ كود الربط السريع (الرابط + الرمز معاً)', 'Copy Quick-Pair Code (Link + Token)')}
                    </span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-surface/70 border border-line-2 text-xs text-muted-foreground-1 space-y-2 leading-relaxed">
              <div className="font-extrabold text-foreground">
                {bi('طريقة الربط بـ 3 خطوات بسيطة:', 'How to connect in 3 simple steps:')}
              </div>
              <ol className="list-decimal list-inside space-y-1.5">
                <li>
                  {bi(
                    'اتصل من موبايلك وحاسبة العيادة بنفس راوتر الواي فاي العادي في العيادة (بدون نقطة اتصال).',
                    'Connect both your phone and the clinic PC to the same regular Wi-Fi router (no hotspot needed).'
                  )}
                </li>
                <li>
                  {bi(
                    'افتح التطبيق على حاسبة العيادة واضغط «تشغيل المزامنة على شبكة العيادة» ليظهر لك الرابط ورمز الاقتران.',
                    'Open the desktop app on the clinic PC and click "Start Clinic Wi-Fi Sync" to see the link and pairing code.'
                  )}
                </li>
                <li>
                  {bi(
                    'اكتب الرابط والرمز بالأسفل (أو الصق كود الربط السريع في الخانة الأولى ليتعبّأ الحقلان تلقائياً) ثم اضغط «مزامنة الآن».',
                    'Enter the link and code below (or paste the quick-pair code in the first box to fill both) and tap Sync Now.'
                  )}
                </li>
              </ol>
              <p className="text-xs text-muted-foreground-2 pt-1 border-t border-card-divider">
                {bi(
                  'ملاحظة: إذا كانت حاسبة العيادة مطفأة، أكمل تسجيل مرضاك عادي أوفلاين؛ بياناتك محفوظة ولا يُحذف منها شيء، وتتم المزامنة عندما تُفتح الحاسبة لاحقاً. (وإذا أردت المزامنة بأي وقت حتى والحاسبة مطفأة، اختر Google Drive المشفّر).',
                  'Note: If the clinic PC is off, keep working offline safely—nothing is deleted and changes sync once the PC is back on. (For 24/7 sync even when the PC is off, choose Encrypted Google Drive.)'
                )}
              </p>
            </div>
          )}

          {/* Peer Connection Form */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="lan-url-input" className="block text-xs font-bold text-foreground mb-1">
                {bi('رابط العيادة على الواي فاي', 'Clinic Wi-Fi Link')}
              </label>
              <input
                id="lan-url-input"
                type="text"
                dir="ltr"
                value={config.lanServerUrl}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw.includes('|')) {
                    const [urlPart, tokenPart] = raw.split('|');
                    setConfig(
                      saveClinicSyncConfig({
                        lanServerUrl: (urlPart || '').trim(),
                        lanPairingToken: (tokenPart || '').trim(),
                      })
                    );
                  } else {
                    setConfig(saveClinicSyncConfig({ lanServerUrl: raw }));
                  }
                }}
                placeholder="http://192.168.1.15:47821"
                className="w-full h-10 px-3 rounded-xl bg-surface border border-line-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
              />
            </div>
            <div>
              <label htmlFor="lan-token-input" className="block text-xs font-bold text-foreground mb-1">
                {bi('رمز الاقتران', 'Pairing Code')}
              </label>
              <input
                id="lan-token-input"
                type="text"
                dir="ltr"
                value={config.lanPairingToken}
                onChange={(e) => setConfig(saveClinicSyncConfig({ lanPairingToken: e.target.value }))}
                placeholder="A1B2C3D4E5F6"
                className="w-full h-10 px-3 rounded-xl bg-surface border border-line-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              data-testid="lan-sync-now-btn"
              disabled={busyAction !== null}
              onClick={handleSyncLanNow}
              className="h-10 px-4 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-extrabold inline-flex items-center gap-2 cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`size-4 ${busyAction === 'lan-sync' ? 'animate-spin' : ''}`} />
              <span>
                {busyAction === 'lan-sync'
                  ? bi('جاري الدمج المشفّر...', 'Syncing...')
                  : bi('مزامنة الآن عبر الواي فاي (دمج بدون حذف)', 'Sync Now via Wi-Fi (Non-Destructive)')}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* OPTION 2: ENCRYPTED GOOGLE DRIVE CLINIC SYNC */}
      {config.mode === 'google_drive' && (
        <div
          data-testid="google-drive-sync-panel"
          className="p-4 rounded-2xl bg-card border border-card-line space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Cloud className="size-4.5 text-primary" />
              <h4 className="text-xs sm:text-sm font-black text-foreground">
                {bi('مزامنة Google Drive المشفّرة (حساب العيادة المجاني)', 'Encrypted Google Drive Sync (Your Own Free Drive)')}
              </h4>
            </div>
            {config.lastSyncAt && config.lastSyncMode === 'google_drive' && (
              <span className="text-xs text-muted-foreground-1">
                {bi('آخر مزامنة:', 'Last sync:')} {new Date(config.lastSyncAt).toLocaleString()}
              </span>
            )}
          </div>

          {/* Native App (Android & Windows Desktop) Instant Zero-Setup Google Drive Sync */}
          {isNativeAppPlatform && !driveAuth.isSignedIn && (
            <div className="p-4 rounded-xl bg-primary/[0.06] border border-primary/25 space-y-3">
              <div className="space-y-1">
                <div className="text-xs font-extrabold text-foreground">
                  {isAndroidApk
                    ? bi(
                        'مزامنة فورية مع تطبيق Google Drive على الأندرويد (جاهزة بدون إعداد)',
                        'Instant Android Google Drive App Sync (Ready — No Setup Needed)'
                      )
                    : bi(
                        'مزامنة فورية مع Google Drive على الحاسبة (جاهزة بدون إعداد)',
                        'Instant Desktop Google Drive Sync (Ready — No Setup Needed)'
                      )}
                </div>
                <p className="text-xs text-muted-foreground-1 leading-relaxed">
                  {isAndroidApk
                    ? bi(
                        'يحفظ التطبيق ملف مزامنة مشفّر (.ptsync.json) مباشرة إلى تطبيق Google Drive على هاتفك، ويدمج ملفات الأجهزة الأخرى من Drive بدون حذف أي سجل.',
                        'Uploads your AES-256-GCM encrypted sync package directly to the Google Drive app on your phone and merges peer files from Drive non-destructively.'
                      )
                    : bi(
                        'يحفظ التطبيق ملف المزامنة المشفّر (.ptsync.json) مباشرة داخل مجلد Google Drive على الحاسبة (أو لرفعه على drive.google.com)، ويدمج ملفات الموبايل والأجهزة الأخرى بدون حذف أي سجل.',
                        'Saves your AES-256-GCM encrypted sync package (.ptsync.json) directly into your Google Drive desktop folder (or upload to drive.google.com) and merges peer files non-destructively.'
                      )}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  data-testid="android-drive-share-btn"
                  disabled={busyAction !== null}
                  onClick={handleShareSyncToAndroidDrive}
                  className="h-10 px-4 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-extrabold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  <Upload className="size-4 shrink-0" />
                  <span>
                    {busyAction === 'android-drive-share'
                      ? bi('جاري التشفير والتجهيز...', 'Encrypting...')
                      : isAndroidApk
                        ? bi('رفع / حفظ إلى Google Drive', 'Save / Share to Google Drive')
                        : bi('حفظ ملف المزامنة إلى Google Drive', 'Save Sync File to Google Drive')}
                  </span>
                </button>
                <button
                  type="button"
                  data-testid="android-drive-import-btn"
                  disabled={busyAction !== null}
                  onClick={() => fileInputRef.current?.click()}
                  className="h-10 px-4 rounded-xl bg-card hover:bg-surface border border-line-2 text-foreground text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  <Download className="size-4 shrink-0 text-primary" />
                  <span>{bi('استيراد ودمج من Google Drive', 'Import & Merge from Google Drive')}</span>
                </button>
              </div>
            </div>
          )}

          {/* Official Google Sign-In Control (Web Firebase Popup | Android & Windows Native PKCE Loopback) */}
          {!driveAuth.isSignedIn ? (
            isNativeAppPlatform ? (
              <div className="rounded-xl bg-surface/80 border border-line-2 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowNativeOAuthSetup((v) => !v)}
                  className="w-full px-4 py-3 flex items-center justify-between gap-2 text-start text-xs font-bold text-foreground cursor-pointer hover:bg-surface transition-colors"
                >
                  <span>
                    {isAndroidApk
                      ? bi(
                          'ربط API تلقائي بحساب Google Drive على الأندرويد (اختياري)',
                          'Automatic Google Drive API OAuth on Android (Optional)'
                        )
                      : bi(
                          'ربط API تلقائي بحساب Google Drive على الحاسبة عبر المتصفح (اختياري)',
                          'Automatic Google Drive API OAuth on Desktop via Browser (Optional)'
                        )}
                  </span>
                  {showNativeOAuthSetup ? (
                    <ChevronUp className="size-4 text-muted-foreground-1 shrink-0" />
                  ) : (
                    <ChevronDown className="size-4 text-muted-foreground-1 shrink-0" />
                  )}
                </button>
                {showNativeOAuthSetup && (
                  <div className="px-4 pb-4 pt-2 border-t border-card-divider space-y-3">
                    <p className="text-xs text-muted-foreground-1 leading-relaxed">
                      {bi(
                        'للمزامنة التلقائية بضغطة زر عبر متصفح الجهاز الأصلي (بدون خطأ نافذة Firebase)، أدخل معرّف عميل OAuth من نوع Desktop app من Google Cloud Console (يمكن استخدام نفس المعرّف على الحاسبة والأندرويد):',
                        'For 1-tap automatic Drive API sync via your default system browser, enter a free Google Cloud "Desktop app" OAuth Client ID (works on both Windows Desktop and Android):'
                      )}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label htmlFor="android-oauth-client-id" className="block text-xs font-bold text-foreground mb-1">
                          {bi('معرّف العميل (OAuth Client ID)', 'OAuth Client ID')}
                        </label>
                        <input
                          id="android-oauth-client-id"
                          type="text"
                          dir="ltr"
                          value={nativeOAuthCfg.clientId}
                          onChange={(e) =>
                            setNativeOAuthCfg(saveNativeGoogleOAuthConfig({ clientId: e.target.value }))
                          }
                          placeholder="123456789-xxxx.apps.googleusercontent.com"
                          className="w-full min-w-0 h-10 px-3 rounded-xl bg-card border border-line-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
                        />
                      </div>
                      <div>
                        <label htmlFor="android-oauth-client-secret" className="block text-xs font-bold text-foreground mb-1">
                          {bi('السر (Client Secret — اختياري)', 'Client Secret (Optional)')}
                        </label>
                        <input
                          id="android-oauth-client-secret"
                          type="password"
                          dir="ltr"
                          value={nativeOAuthCfg.clientSecret}
                          onChange={(e) =>
                            setNativeOAuthCfg(saveNativeGoogleOAuthConfig({ clientSecret: e.target.value }))
                          }
                          placeholder="GOCSPX-..."
                          className="w-full min-w-0 h-10 px-3 rounded-xl bg-card border border-line-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      data-testid="google-drive-signin-btn"
                      disabled={busyAction === 'google-signin'}
                      onClick={handleSignInGoogle}
                      className="h-10 px-4 rounded-xl bg-white hover:bg-neutral-50 text-[#1f1f1f] border border-[#747775] font-semibold text-xs inline-flex items-center justify-center gap-2.5 shadow-xs cursor-pointer shrink-0 transition-colors"
                    >
                      <GoogleBrandMark />
                      <span>
                        {busyAction === 'google-signin'
                          ? bi('جاري الربط عبر المتصفح...', 'Signing in via browser...')
                          : 'Sign in with Google'}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-surface/80 border border-line-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-xs font-extrabold text-foreground">
                    {bi('ربط حساب Google Drive للعيادة', 'Connect Clinic Google Drive Account')}
                  </div>
                  <p className="text-xs text-muted-foreground-1 leading-relaxed">
                    {bi(
                      'يستخدم التطبيق صلاحية drive.file المحدودة فقط (لا يستطيع رؤية أي ملف آخر في حسابك، بل فقط مجلد PhysioRecord-Clinic-Sync الذي ينشئه التطبيق).',
                      'Uses minimal drive.file scope only—the app can solely access encrypted sync files it creates inside PhysioRecord-Clinic-Sync.'
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="google-drive-signin-btn"
                  disabled={busyAction === 'google-signin'}
                  onClick={handleSignInGoogle}
                  className="h-10 px-4 rounded-xl bg-white hover:bg-neutral-50 text-[#1f1f1f] border border-[#747775] font-semibold text-xs inline-flex items-center justify-center gap-2.5 shadow-xs cursor-pointer shrink-0 transition-colors"
                >
                  <GoogleBrandMark />
                  <span>
                    {busyAction === 'google-signin'
                      ? bi('جاري الربط...', 'Signing in...')
                      : 'Sign in with Google'}
                  </span>
                </button>
              </div>
            )
          ) : (
            <div className="p-3.5 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/25 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-extrabold text-foreground truncate">
                    {driveAuth.displayName || driveAuth.email}
                  </div>
                  <div className="text-xs text-muted-foreground-1 truncate" dir="ltr">
                    {driveAuth.email}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="google-drive-sync-now-btn"
                  disabled={busyAction !== null}
                  onClick={handleRequestGoogleDriveSync}
                  className="h-9 px-4 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  <RefreshCw className={`size-3.5 ${busyAction === 'drive-sync' ? 'animate-spin' : ''}`} />
                  <span>
                    {busyAction === 'drive-sync'
                      ? bi('جاري المزامنة المشفّرة...', 'Syncing...')
                      : bi('مزامنة مع Google Drive الآن', 'Sync with Google Drive Now')}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleSignOutGoogle}
                  className="h-9 px-3 rounded-xl bg-surface hover:bg-surface/80 border border-line-2 text-xs font-bold text-foreground inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="size-3.5" />
                  <span>{bi('فصل الحساب', 'Sign Out')}</span>
                </button>
              </div>
            </div>
          )}

          {/* Built-In Step-by-Step Setup, Security Audit & Offline Resilience Guide */}
          <div className="rounded-2xl border border-card-line bg-surface/50 overflow-hidden">
            <button
              type="button"
              data-testid="google-drive-guide-toggle"
              aria-expanded={isGuideOpen}
              onClick={() => setIsGuideOpen((v) => !v)}
              className="w-full px-4 py-3 flex items-center justify-between gap-2 text-start cursor-pointer hover:bg-surface/80 transition-colors"
            >
              <div className="flex items-center gap-2 text-xs font-extrabold text-foreground">
                <BookOpen className="size-4 text-primary shrink-0" />
                <span>
                  {bi(
                    'دليل تنصيب Google Drive للعيادة + تقييم الأمان وتحسينات العمل أوفلاين',
                    'Google Drive Setup Guide + Medical Security & Offline Resilience Review'
                  )}
                </span>
              </div>
              {isGuideOpen ? (
                <ChevronUp className="size-4 text-muted-foreground-1 shrink-0" />
              ) : (
                <ChevronDown className="size-4 text-muted-foreground-1 shrink-0" />
              )}
            </button>

            {isGuideOpen && (
              <div className="px-4 pb-4 pt-1 space-y-3 text-xs leading-relaxed border-t border-card-divider">
                <div className="space-y-1.5">
                  <div className="font-extrabold text-primary">
                    {bi('1) خطوات التنصيب للعيادة (دقيقتان فقط — مجاني للأبد):', '1) Clinic Setup Steps (2 minutes — $0 forever):')}
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-muted-foreground-1">
                    <li>
                      {bi(
                        'أنشئ حساب Gmail واحد خاص بعيادتك (مثلاً: clinic.name.pt@gmail.com) وفعّل عليه التحقق بخطوتين (2FA).',
                        'Create one dedicated clinic Gmail account and enable 2-Step Verification (2FA).'
                      )}
                    </li>
                    <li>
                      {bi(
                        'من جهاز المدير وكل جهاز معالج: افتح الإعدادات ← المزامنة والعيادة ← اختر «Google Drive المشفّر» واضغط «Sign in with Google».',
                        'On the manager PC and each therapist device, select "Encrypted Google Drive" and click "Sign in with Google".'
                      )}
                    </li>
                    <li>
                      {bi(
                        'اتفق مع فريقك على «كلمة مرور مزامنة مشتركة» قوية (تُكتب على كل جهاز لفتح التشفير) — لا تشاركها خارج العيادة.',
                        'Set one strong shared Clinic Sync Passphrase across your team devices.'
                      )}
                    </li>
                    <li>
                      {bi(
                        'اضغط «مزامنة الآن»: كل جهاز يرفع ملفاً مشفّراً باسمه الخاص (sync_device.ptsync.json) داخل مجلد PhysioRecord-Clinic-Sync ويدمج ملفات زملائه تلقائياً دون أي تعارض أو مسح.',
                        'Click "Sync Now": each device writes its own encrypted file inside PhysioRecord-Clinic-Sync and merges peers non-destructively.'
                      )}
                    </li>
                  </ol>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-card-divider">
                  <div className="font-extrabold text-emerald-700 dark:text-emerald-400">
                    {bi('2) هل Google Drive آمن طبياً لحفظ بيانات المرضى؟', '2) Is Google Drive Safe for Clinical Data?')}
                  </div>
                  <p className="text-muted-foreground-1">
                    {bi(
                      'نعم بنسبة عالية جداً بفضل 4 طبقات حماية مدمجة في PhysioRecord: (أ) كل البيانات تُشفّر محلياً على جهازك بخوارزمية AES-256-GCM + PBKDF2-SHA256 (310,000 دورة) قبل أن تصل إلى Google — أي حتى Google نفسه لا يستطيع قراءة اسم مريض واحد بدون كلمة مرور المزامنة. (ب) نطلب صلاحية drive.file المحدودة فقط، فلا يمكن للتطبيق لمس أي صور أو ملفات شخصية أخرى في حسابك. (ج) رمز الدخول (OAuth Token) يُحفظ بالذاكرة المؤقتة فقط ويُمسح فوراً عند تسجيل الخروج. (د) السجلات المعتمدة (SOAP Finalized) والملاحق الطبية محمية ضد الكتابة فوقها أو حذفها.',
                      'Yes—4 built-in layers protect PHI: (a) Client-side AES-256-GCM + PBKDF2-SHA256 (310k iterations) before upload so Google only stores unreadable ciphertext; (b) Minimal drive.file scope; (c) In-memory OAuth tokens only; (d) Finalized SOAP notes and addenda are strictly immutable.'
                    )}
                  </p>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-card-divider">
                  <div className="font-extrabold text-foreground">
                    {bi('3) تحسينات العمل أوفلاين (عند إطفاء الحاسبة أو انقطاع الكهرباء/الإنترنت):', '3) Offline & Power-Cut Resilience Improvements:')}
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground-1">
                    <li>
                      {bi(
                        'لا حاجة لإبقاء حاسبة العيادة مفتوحة في وضع Google Drive — المعالج يزامن بأي وقت ومن البيت أو العيادة.',
                        'In Google Drive mode, the main clinic PC never needs to stay powered on.'
                      )}
                    </li>
                    <li>
                      {bi(
                        'ملف منفصل لكل جهاز (Per-Device Envelope): يمنع تلف أو استبدال بيانات معالج آخر إذا عملا بنفس الوقت أوفلاين.',
                        'Per-device encrypted envelopes eliminate file-overwrite conflicts when multiple therapists work offline.'
                      )}
                    </li>
                    <li>
                      {bi(
                        'صندوق المزامنة المشفّر المحلي (Offline Outbox): عند انقطاع الإنترنت أو إطفاء خادم الواي فاي، تُحفظ حزمة التغييرات المشفّرة محلياً وتبقى جميع سجلات المعالج كاملة دون حذف أي حرف.',
                        'Local Encrypted Outbox queues pending envelopes automatically whenever offline or when the LAN PC is powered off.'
                      )}
                    </li>
                  </ul>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-card-divider">
                  <div className="font-extrabold text-amber-700 dark:text-amber-400">
                    {bi('4) إذا ظهرت رسالة «لم تتحقق Google من هذا التطبيق» أثناء التجربة:', '4) If Google Shows "Unverified App" During Preview/Testing:')}
                  </div>
                  <p className="text-muted-foreground-1">
                    {bi(
                      'هذا أمر طبيعي قبل النشر العام؛ اضغط «إعدادات متقدمة (Advanced)» ثم «الانتقال إلى التطبيق» للمتابعة بأمان على حسابك. وعند نشر التطبيق للعيادات بشكل عام، قم بتقديم شاشة موافقة OAuth للتحقق المجاني من Google مرة واحدة لإزالة هذا التنبيه لجميع المستخدمين.',
                      'This is normal before public OAuth verification. Click "Advanced" -> "Go to app" to continue during testing. Before public release, submit your Google Cloud OAuth Consent Screen for free verification of the drive.file scope once.'
                    )}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Always-Available Zero-Network .ptsync File Exchange Fallback */}
      <div className="p-4 rounded-2xl bg-card border border-card-line space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-extrabold text-foreground">
              {bi('تبادل ملف مزامنة مشفّر بدون شبكة (.ptsync.json)', 'Zero-Network Encrypted File Merge (.ptsync.json)')}
            </h4>
            <p className="text-xs text-muted-foreground-1 mt-0.5">
              {bi(
                'خيار احتياطي يعمل دائماً عبر فلاش USB أو بلوتوث أو واتساب — يدمج سجلات الأجهزة معاً دون حذف أي سجل محلي.',
                'Always-available fallback via USB, AirDrop, or chat—merges devices safely without deleting local records.'
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={handleExportSyncFile}
              className="h-9 px-3 rounded-xl bg-surface hover:bg-surface/80 border border-line-2 text-xs font-bold text-foreground inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="size-3.5 text-primary" />
              <span>{bi('تصدير حزمة مزامنة', 'Export Sync File')}</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.ptsync,application/json,application/octet-stream"
              className="hidden"
              onChange={handleImportSyncFile}
            />
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => fileInputRef.current?.click()}
              className="h-9 px-3 rounded-xl bg-primary/10 hover:bg-primary/15 text-primary text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Upload className="size-3.5" />
              <span>{bi('استيراد ودمج حزمة', 'Import & Merge File')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Explicit Confirmation Modal before ANY Mutating Google Drive API Call */}
      {showDriveConfirmModal && (
        <div
          className="fixed inset-0 z-[70] bg-black/55 backdrop-blur-[2px] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          data-testid="google-drive-confirm-modal"
        >
          <div className="w-full max-w-md rounded-2xl bg-card border border-card-line shadow-2xl p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <AlertTriangle className="size-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-black text-foreground">
                  {bi('تأكيد المزامنة المشفّرة مع Google Drive', 'Confirm Encrypted Google Drive Sync')}
                </h4>
                <p className="text-xs text-muted-foreground-1 leading-relaxed">
                  {bi(
                    `سيقوم التطبيق الآن بتشفير سجلات هذا الجهاز (AES-256-GCM) ورفع الملف المشفّر sync_${config.deviceId}.ptsync.json إلى مجلد PhysioRecord-Clinic-Sync في حساب ${driveAuth.email || 'Google Drive'}، ثم تنزيل ودمج ملفات الأجهزة الأخرى بدون حذف أي سجل محلي. هل تريد المتابعة؟`,
                    `PhysioRecord will AES-256-GCM encrypt your local records, upload sync_${config.deviceId}.ptsync.json to PhysioRecord-Clinic-Sync in ${driveAuth.email || 'Google Drive'}, and merge peer envelopes non-destructively. Proceed?`
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-card-divider">
              <button
                type="button"
                onClick={() => setShowDriveConfirmModal(false)}
                className="h-9 px-3.5 rounded-xl bg-surface hover:bg-surface/80 text-xs font-bold text-foreground cursor-pointer"
              >
                {bi('إلغاء', 'Cancel')}
              </button>
              <button
                type="button"
                data-testid="google-drive-confirm-proceed-btn"
                onClick={handleConfirmedGoogleDriveSync}
                className="h-9 px-4 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-extrabold cursor-pointer"
              >
                {bi('نعم، ابدأ المزامنة المشفّرة', 'Yes, Sync Encrypted Now')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
