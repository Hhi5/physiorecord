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
  FolderOpen,
  HardDrive,
  Laptop,
  Lock,
  LogOut,
  RefreshCw,
  Server,
  Share2,
  ShieldCheck,
  Upload,
  Wifi,
  WifiOff,
  AlertTriangle,
} from 'lucide-react';
import { DEFAULT_LAN_SYNC_PORT } from '../../config/appConstants';
import { useLanguage } from '../../context/LanguageContext';
import { useVault } from '../../context/VaultContext';
import { usePatients } from '../../context/PatientContext';
import {
  getElectronDesktopBridge,
  isNativeAndroid,
  openTextFileFromAndroid,
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
  syncWithDesktopSyncFolder,
  syncWithEncryptedGoogleDrive,
  syncWithLocalLanHub,
  type ClinicSyncConfig,
  type ClinicSyncMode,
  type OfflineSyncOutboxRecord,
} from '../../services/clinicSyncService';
import {
  getGoogleDriveAuthState,
  getNativeGoogleOAuthConfig,
  hasBuiltInNativeGoogleOAuth,
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
  const builtInGoogleOAuth = hasBuiltInNativeGoogleOAuth();

  const [config, setConfig] = useState<ClinicSyncConfig>(() => getClinicSyncConfig());
  const [outbox, setOutbox] = useState<OfflineSyncOutboxRecord | null>(() => getOfflineSyncOutbox());
  const [syncPassphrase, setSyncPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [passphraseError, setPassphraseError] = useState(false);

  // Electron LAN Hub status
  const [hubStatus, setHubStatus] = useState<{
    running: boolean;
    port: number;
    urls: string[];
    pairingToken: string;
    storedDevicesCount: number;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Electron 1-Click Sync Folder (Google Drive for Desktop / cloud folder)
  const [syncFolderInfo, setSyncFolderInfo] = useState<{
    configured: boolean;
    folderPath?: string;
    folderName?: string;
  }>({ configured: false });

  // Google Drive Auth state (in-memory only)
  const [driveAuth, setDriveAuth] = useState<GoogleDriveAuthState>(() => getGoogleDriveAuthState());
  const [nativeOAuthCfg, setNativeOAuthCfg] = useState(() => getNativeGoogleOAuthConfig());
  const [showNativeOAuthSetup, setShowNativeOAuthSetup] = useState(
    () => !builtInGoogleOAuth && Boolean(getNativeGoogleOAuthConfig().clientId)
  );
  const [showDriveConfirmModal, setShowDriveConfirmModal] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'info' | 'error'; text: string } | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const passphraseInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (electronBridge?.getLanSyncHubStatus) {
      void electronBridge.getLanSyncHubStatus().then((st) => {
        setHubStatus(st);
      });
    }
    if (electronBridge?.getConfiguredSyncDirectory) {
      void electronBridge.getConfiguredSyncDirectory().then((dir) => {
        if (dir) setSyncFolderInfo(dir);
      });
    }
  }, [electronBridge]);

  const requireSyncPassphrase = (actionLabelAr?: string, actionLabelEn?: string): boolean => {
    if (syncPassphrase.trim().length >= 6) {
      setPassphraseError(false);
      return true;
    }
    setPassphraseError(true);
    setFeedback({
      kind: 'error',
      text: bi(
        `يرجى كتابة «كلمة سر المزامنة المشتركة» (6 أحرف أو أرقام على الأقل) أولاً ${actionLabelAr || 'لحماية بيانات المرضى قبل المزامنة'}.`,
        `Please enter your Shared Sync Password (at least 6 characters) first ${actionLabelEn || 'to protect patient records before syncing'}.`
      ),
    });
    if (passphraseInputRef.current) {
      passphraseInputRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      passphraseInputRef.current.focus();
    }
    return false;
  };

  const handleModeChange = (mode: ClinicSyncMode) => {
    const next = saveClinicSyncConfig({ mode });
    setConfig(next);
    setFeedback(null);
    setPassphraseError(false);
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
        const st = await electronBridge.startLanSyncHub({ port: DEFAULT_LAN_SYNC_PORT });
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
              `تم تشغيل مزامنة الواي فاي بنجاح على الرابط ${st.urls[0]} — يمكنك الآن ربط موبايلات العيادة على نفس الشبكة.`,
              `Clinic Wi-Fi Sync started at ${st.urls[0]}. Peer devices on the same router can now sync.`
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
    if (!requireSyncPassphrase('قبل إرسال البيانات عبر الواي فاي', 'before syncing over Wi-Fi')) {
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
        text: err instanceof Error ? err.message : bi('تعذّرت المزامنة عبر الواي فاي.', 'Wi-Fi sync failed.'),
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handlePickDesktopSyncFolder = async () => {
    if (!electronBridge?.pickSyncDirectory) return;
    setBusyAction('pick-sync-folder');
    setFeedback(null);
    try {
      const res = await electronBridge.pickSyncDirectory();
      if (res?.configured) {
        setSyncFolderInfo(res);
        setFeedback({
          kind: 'success',
          text: bi(
            `تم اختيار مجلد المزامنة «${res.folderName}» بنجاح. اكتب كلمة سر المزامنة واضغط «مزامنة الآن بضغطة واحدة».`,
            `Selected sync folder "${res.folderName}". Enter your sync password and click "Sync Now".`
          ),
        });
      }
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : bi('تعذّر اختيار المجلد.', 'Could not pick folder.'),
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleClearDesktopSyncFolder = async () => {
    if (!electronBridge?.clearConfiguredSyncDirectory) return;
    await electronBridge.clearConfiguredSyncDirectory();
    setSyncFolderInfo({ configured: false });
    setFeedback({
      kind: 'info',
      text: bi('تم إلغاء ربط مجلد المزامنة على الحاسبة.', 'Disconnected desktop sync folder.'),
    });
  };

  const handleSyncDesktopFolderNow = async () => {
    if (!dek) return;
    if (!requireSyncPassphrase('قبل المزامنة مع مجلد Google Drive', 'before syncing with your Google Drive folder')) {
      return;
    }
    setBusyAction('desktop-folder-sync');
    setFeedback(null);
    try {
      const res = await syncWithDesktopSyncFolder({ dek, passphrase: syncPassphrase });
      setConfig(getClinicSyncConfig());
      setOutbox(getOfflineSyncOutbox());
      if (res.ok) {
        await refreshPatients();
        setFeedback({ kind: 'success', text: bi(res.messageAr, res.messageEn) });
      }
    } catch (err) {
      setFeedback({
        kind: 'error',
        text:
          err instanceof Error
            ? err.message
            : bi('تعذّرت المزامنة مع مجلد Google Drive.', 'Folder sync failed.'),
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
          `تم ربط حساب ${st.email || 'Google'} بنجاح! يمكنك الآن الضغط على «مزامنة مع Google Drive الآن».`,
          `Connected ${st.email || 'Google'} successfully! Click "Sync with Google Drive Now" to start.`
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
        'تم فصل حساب Google Drive. جميع سجلات مرضاك محفوظة بأمان على جهازك.',
        'Disconnected Google Drive. All patient records remain safely on your device.'
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
    if (!requireSyncPassphrase('قبل الرفع إلى Google Drive', 'before uploading to Google Drive')) {
      return;
    }
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
    if (!requireSyncPassphrase('لحفظ ملف المزامنة', 'to save the sync file')) {
      return;
    }
    setBusyAction('export-file');
    setFeedback(null);
    try {
      const exported = await exportEncryptedSyncFileString(dek, syncPassphrase);
      const savedRes = await saveTextFilePortable({
        filename: exported.filename,
        content: exported.content,
        mimeType: 'application/octet-stream',
        description: 'PhysioRecord Sync File',
        extensions: ['json'],
      });
      if (savedRes.confirmedSaved || savedRes.method === 'web-download') {
        setFeedback({
          kind: 'success',
          text: bi(
            `تم حفظ ملف المزامنة المحمي (${exported.filename}) بنجاح! يمكنك الآن جلبه من الجهاز الآخر ودمجه بدون حذف أي مريض.`,
            `Saved protected sync file (${exported.filename})! Import it on your other device to merge safely.`
          ),
        });
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setFeedback({
          kind: 'info',
          text: bi('تم إلغاء الحفظ.', 'Save cancelled.'),
        });
      } else {
        setFeedback({
          kind: 'error',
          text: err instanceof Error ? err.message : bi('تعذّر حفظ ملف المزامنة.', 'Could not save sync file.'),
        });
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveSyncDirectlyToDrive = async () => {
    if (!dek) return;
    if (!requireSyncPassphrase('قبل الحفظ إلى Google Drive', 'before saving to Google Drive')) {
      return;
    }
    setBusyAction('drive-direct-save');
    setFeedback(null);
    try {
      const exported = await exportEncryptedSyncFileString(dek, syncPassphrase);
      const savedRes = await saveTextFilePortable({
        filename: exported.filename,
        content: exported.content,
        mimeType: 'application/octet-stream',
        description: 'PhysioRecord Google Drive Sync File',
        extensions: ['json'],
      });
      if (savedRes.confirmedSaved || savedRes.method === 'web-download') {
        setFeedback({
          kind: 'success',
          text: isAndroidApk
            ? bi(
                `تم حفظ ملف المزامنة (${exported.filename}) بنجاح! إذا اخترت Google Drive من القائمة، سيُرفع تلقائياً ويمكنك جلبه من الحاسبة.`,
                `Saved sync file (${exported.filename})! If saved in Google Drive, it uploads automatically and can be merged on your PC.`
              )
            : bi(
                `تم حفظ ملف المزامنة (${exported.filename}) بنجاح! احفظه داخل مجلد Google Drive على الحاسبة أو ارفعه على drive.google.com.`,
                `Saved sync file (${exported.filename})! Place it in your Google Drive folder or upload to drive.google.com.`
              ),
        });
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setFeedback({
          kind: 'info',
          text: bi('تم إلغاء الحفظ.', 'Save cancelled.'),
        });
      } else {
        setFeedback({
          kind: 'error',
          text:
            err instanceof Error
              ? err.message
              : bi('تعذّر حفظ ملف المزامنة في Google Drive.', 'Could not save sync file to Google Drive.'),
        });
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleShareSyncToAndroidDrive = async () => {
    if (!dek) return;
    if (!requireSyncPassphrase('قبل المشاركة إلى Google Drive', 'before sharing to Google Drive')) {
      return;
    }
    setBusyAction('android-drive-share');
    setFeedback(null);
    try {
      const exported = await exportEncryptedSyncFileString(dek, syncPassphrase);
      const shared = await shareGeneratedFileOnAndroid({
        filename: exported.filename,
        content: exported.content,
        mimeType: 'application/octet-stream',
        title: bi('مشاركة ملف مزامنة PhysioRecord إلى Google Drive', 'Share PhysioRecord Sync to Google Drive'),
      });
      if (!shared) {
        await saveTextFilePortable({
          filename: exported.filename,
          content: exported.content,
          mimeType: 'application/octet-stream',
          description: 'PhysioRecord Sync File',
          extensions: ['json'],
        });
      }
      setFeedback({
        kind: 'success',
        text: bi(
          `تم فتح قائمة المشاركة للملف (${exported.filename}) — اختر «حفظ في Drive» (أو واتساب / الملفات).`,
          `Opened Share Sheet for (${exported.filename}) — choose "Save to Drive" (or WhatsApp / Files).`
        ),
      });
    } catch (err) {
      setFeedback({
        kind: 'error',
        text:
          err instanceof Error
            ? err.message
            : bi('تعذّرت مشاركة الملف إلى Google Drive.', 'Could not share sync file to Google Drive.'),
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleImportRawSyncText = async (rawText: string) => {
    if (!dek) return;
    setBusyAction('import-file');
    setFeedback(null);
    try {
      const res = await importAndMergeEncryptedSyncFile(rawText, dek, syncPassphrase);
      setConfig(getClinicSyncConfig());
      await refreshPatients();
      setFeedback({ kind: 'success', text: bi(res.messageAr, res.messageEn) });
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : bi('تعذّر دمج ملف المزامنة — تأكد من صحة كلمة سر المزامنة.', 'Import merge failed — check your sync password.'),
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleImportSyncSmart = async () => {
    if (!dek) return;
    if (!requireSyncPassphrase('لفك قفل الملف ودمج المرضى', 'to unlock and merge the sync file')) {
      return;
    }
    if (isAndroidApk) {
      try {
        const opened = await openTextFileFromAndroid('*/*');
        if (opened) {
          if (opened.cancelled) return;
          if (opened.opened && typeof opened.content === 'string') {
            await handleImportRawSyncText(opened.content);
            return;
          }
        }
      } catch (err) {
        setFeedback({
          kind: 'error',
          text: err instanceof Error ? err.message : bi('تعذّر فتح الملف من الجهاز.', 'Could not open file.'),
        });
        return;
      }
    }
    fileInputRef.current?.click();
  };

  const handleImportSyncFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !dek) return;

    if (!requireSyncPassphrase('لفك قفل الملف ودمج المرضى', 'to unlock and merge the sync file')) {
      return;
    }
    const text = await file.text();
    await handleImportRawSyncText(text);
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
              {bi('مزامنة بيانات العيادة بين أجهزتك (مجانية وآمنة)', 'Free & Safe Multi-Device Clinic Sync')}
            </h3>
            <p className="text-xs text-muted-foreground-1 leading-relaxed">
              {bi(
                'انقل وادمج ملفات المرضى بين الموبايل والحاسبة بسهولة — إما عبر واي فاي العيادة (بدون إنترنت) أو عبر حسابك الشخصي في Google Drive (مجاني للأبد ويعمل من أي مكان).',
                'Sync and merge patient records between your phone and PC — either over your clinic Wi-Fi (no internet needed) or via your own free Google Drive.'
              )}
            </p>
            <div className="flex flex-wrap gap-2 pt-1 text-xs font-bold">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="size-3.5" />
                {bi('دمج آمن — لا يُحذف أي مريض أو جلسة من جهازك', 'Safe merge — never deletes any patient or session')}
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 text-primary">
                <Lock className="size-3.5" />
                {bi('ملفاتك مقفلة بكلمة سر خاصة بعيادتك فقط', 'Locked with your clinic’s private password')}
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
                  'توجد تعديلات محفوظة بانتظار المزامنة',
                  'Saved changes waiting to sync'
                )}
              </div>
              <p className="text-muted-foreground-1">
                {bi(
                  'تم حفظ عملك محلياً بأمان أثناء انقطاع الاتصال — اضغط «مزامنة الآن» فور توفر الشبكة.',
                  'Your work was saved safely while offline — click "Sync Now" once connected.'
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
            {bi('إخفاء', 'Dismiss')}
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
              titleAr: 'على هذا الجهاز فقط',
              titleEn: 'This Device Only',
              descAr: 'بياناتك محفوظة على هذا الجهاز فقط بدون مزامنة.',
              descEn: 'All records stay on this device only.',
            },
            {
              id: 'lan' as ClinicSyncMode,
              icon: Wifi,
              titleAr: 'واي فاي العيادة (بدون إنترنت)',
              titleEn: 'Clinic Wi-Fi (Offline)',
              descAr: 'نقل مباشر بين الحاسبة والموبايل على نفس راوتر العيادة.',
              descEn: 'Direct sync between PC and phone on the same Wi-Fi router.',
            },
            {
              id: 'google_drive' as ClinicSyncMode,
              icon: Cloud,
              titleAr: 'مزامنة Google Drive',
              titleEn: 'Google Drive Sync',
              descAr: 'احفظ وادمج بيانات عيادتك عبر حسابك في Google Drive من أي مكان.',
              descEn: 'Save and merge clinic records via your free Google Drive from anywhere.',
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
        <div
          className={`p-4 rounded-2xl bg-card border space-y-3 transition-colors ${
            passphraseError ? 'border-rose-500 ring-2 ring-rose-500/20' : 'border-card-line'
          }`}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="sync-passphrase-input"
                className="block text-xs font-bold text-foreground mb-1"
              >
                {bi('الخطوة 1: اكتب كلمة سر المزامنة المشتركة لعيادتك (6 أحرف أو أرقام على الأقل)', 'Step 1: Shared Clinic Sync Password (min 6 characters)')}
              </label>
              <div className="relative">
                <input
                  ref={passphraseInputRef}
                  id="sync-passphrase-input"
                  data-testid="sync-passphrase-input"
                  type={showPassphrase ? 'text' : 'password'}
                  value={syncPassphrase}
                  onChange={(e) => {
                    setSyncPassphrase(e.target.value);
                    if (e.target.value.trim().length >= 6) setPassphraseError(false);
                  }}
                  placeholder={bi('مثلاً: Clinic2026 (اكتب نفس الكلمة في الموبايل والحاسبة)', 'e.g. Clinic2026 (use the same password on all devices)')}
                  className={`w-full h-10 ps-3 pe-10 rounded-xl bg-surface border text-xs text-foreground focus:outline-none focus:ring-2 ${
                    passphraseError
                      ? 'border-rose-500 focus:ring-rose-500/25'
                      : 'border-line-2 focus:ring-primary/25'
                  }`}
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
                  'تُستخدم لقفل ملفات المرضى قبل رفعها حتى لا يستطيع أحد فتحها غيرك — اكتب نفس الكلمة عند الدمج على الجهاز الآخر.',
                  'Locks patient files before leaving your device so only you can open them—enter the same password on your other device.'
                )}
              </p>
            </div>

            <div>
              <label
                htmlFor="sync-device-label-input"
                className="block text-xs font-bold text-foreground mb-1"
              >
                {bi('اسم هذا الجهاز (للتمييز بين الموبايل والحاسبة)', 'Device Name (to tell phone & PC apart)')}
              </label>
              <input
                id="sync-device-label-input"
                type="text"
                value={config.deviceLabel}
                onChange={(e) => setConfig(saveClinicSyncConfig({ deviceLabel: e.target.value }))}
                className="w-full h-10 px-3 rounded-xl bg-surface border border-line-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
              />
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
                {bi('الخطوة 2: مزامنة عيادتك عبر Google Drive', 'Step 2: Sync Your Clinic via Google Drive')}
              </h4>
            </div>
            {config.lastSyncAt && config.lastSyncMode === 'google_drive' && (
              <span className="text-xs text-muted-foreground-1">
                {bi('آخر مزامنة:', 'Last sync:')} {new Date(config.lastSyncAt).toLocaleString()}
              </span>
            )}
          </div>

          {/* Inline Passphrase Reminder (Prevents silent off-screen errors) */}
          {syncPassphrase.trim().length < 6 && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-2">
              <Lock className="size-4 shrink-0" />
              <span>
                {bi(
                  'تذكير: اكتب «كلمة سر المزامنة» في المربع بالأعلى (6 أحرف أو أرقام على الأقل) قبل الضغط على أزرار الحفظ أو الدمج.',
                  'Reminder: Enter your Sync Password above (at least 6 characters) before saving or merging.'
                )}
              </span>
            </div>
          )}

          {/* Inline Feedback right next to Google Drive actions so mobile & desktop users always see it */}
          {feedback && (
            <div
              role="status"
              className={`p-3 rounded-xl border text-xs font-bold leading-relaxed ${
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

          {/* METHOD 1 (Works Immediately — Zero Google Cloud Setup Required) */}
          {isNativeAppPlatform && (
            <div className="p-4 rounded-xl bg-primary/[0.06] border border-primary/25 space-y-3">
              {isAndroidApk ? (
                <>
                  <div className="space-y-1">
                    <div className="text-xs font-extrabold text-foreground">
                      {bi(
                        'الطريقة الأولى (الأسهل — جاهزة فوراً بدون تسجيل دخول)',
                        'Method 1 (Easiest — Ready Instantly, No Sign-In Needed)'
                      )}
                    </div>
                    <ol className="list-decimal list-inside text-xs text-muted-foreground-1 space-y-1 leading-relaxed">
                      <li>
                        {bi(
                          'لرفع بيانات هذا الموبايل: اضغط «حفظ في Google Drive» (أو «مشاركة إلى Drive») واختر مجلد عيادتك في تطبيق Google Drive ثم اضغط حفظ.',
                          'To upload from this phone: tap "Save to Google Drive" (or "Share to Drive"), pick your clinic folder in Google Drive, and save.'
                        )}
                      </li>
                      <li>
                        {bi(
                          'لجلب بيانات الحاسبة أو جهاز آخر: اضغط «جلب ودمج من Google Drive» واختر الملف — تُدمج البيانات فوراً بدون حذف أي مريض.',
                          'To bring records from your PC or another phone: tap "Import & Merge from Google Drive" and pick the file — merges safely without deleting anything.'
                        )}
                      </li>
                    </ol>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      data-testid="android-drive-save-btn"
                      disabled={busyAction !== null}
                      onClick={handleSaveSyncDirectlyToDrive}
                      className="h-10 px-4 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-extrabold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                    >
                      <Upload className="size-4 shrink-0" />
                      <span>
                        {busyAction === 'drive-direct-save'
                          ? bi('جاري التجهيز...', 'Preparing...')
                          : bi('حفظ في Google Drive', 'Save to Google Drive')}
                      </span>
                    </button>
                    <button
                      type="button"
                      data-testid="android-drive-share-btn"
                      disabled={busyAction !== null}
                      onClick={handleShareSyncToAndroidDrive}
                      className="h-10 px-3.5 rounded-xl bg-card hover:bg-surface border border-line-2 text-foreground text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                    >
                      <Share2 className="size-4 shrink-0 text-primary" />
                      <span>
                        {busyAction === 'android-drive-share'
                          ? bi('جاري التجهيز...', 'Preparing...')
                          : bi('مشاركة إلى Drive / واتساب', 'Share to Drive / WhatsApp')}
                      </span>
                    </button>
                    <button
                      type="button"
                      data-testid="android-drive-import-btn"
                      disabled={busyAction !== null}
                      onClick={handleImportSyncSmart}
                      className="h-10 px-4 rounded-xl bg-card hover:bg-surface border border-line-2 text-foreground text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                    >
                      <Download className="size-4 shrink-0 text-primary" />
                      <span>
                        {busyAction === 'import-file'
                          ? bi('جاري الدمج...', 'Merging...')
                          : bi('جلب ودمج من Google Drive', 'Import & Merge from Google Drive')}
                      </span>
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1">
                    <div className="text-xs font-extrabold text-foreground">
                      {bi(
                        'الطريقة الأولى (الأسهل على الحاسبة — مزامنة مجلد Google Drive بضغطة واحدة بدون تسجيل دخول)',
                        'Method 1 (Easiest on PC — 1-Click Google Drive Folder Sync, No Sign-In Needed)'
                      )}
                    </div>
                    <ol className="list-decimal list-inside text-xs text-muted-foreground-1 space-y-1 leading-relaxed">
                      <li>
                        {bi(
                          'إذا كان لديك برنامج Google Drive للحاسبة، اختر مجلد عيادتك بداخله مرة واحدة فقط (مثلاً: My Drive ← PhysioRecord).',
                          'If you use Google Drive for Desktop, pick your clinic folder inside it once (e.g. My Drive -> PhysioRecord).'
                        )}
                      </li>
                      <li>
                        {bi(
                          'بعدها كل ما تضغط «مزامنة الآن بضغطة واحدة»، يحفظ البرنامج ملف الحاسبة ويدمج ملفات الموبايل تلقائياً.',
                          'After that, clicking "Sync Now (1 Click)" automatically saves this PC’s records and merges files from your phones.'
                        )}
                      </li>
                    </ol>
                  </div>

                  {syncFolderInfo.configured ? (
                    <div className="space-y-2.5">
                      <div className="p-2.5 rounded-xl bg-card border border-emerald-500/30 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <FolderOpen className="size-4 text-emerald-600 shrink-0" />
                          <div className="min-w-0">
                            <div className="font-extrabold text-foreground truncate">
                              {bi('المجلد المربوط:', 'Linked folder:')} {syncFolderInfo.folderName}
                            </div>
                            {syncFolderInfo.folderPath && (
                              <div className="text-xs text-muted-foreground-1 truncate" dir="ltr">
                                {syncFolderInfo.folderPath}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={handlePickDesktopSyncFolder}
                            className="h-8 px-2.5 rounded-lg bg-surface hover:bg-surface/80 border border-line-2 text-xs font-bold text-foreground cursor-pointer"
                          >
                            {bi('تغيير المجلد', 'Change')}
                          </button>
                          <button
                            type="button"
                            onClick={handleClearDesktopSyncFolder}
                            className="h-8 px-2.5 rounded-lg text-xs font-bold text-rose-600 hover:bg-rose-500/10 cursor-pointer"
                          >
                            {bi('إلغاء الربط', 'Unlink')}
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          data-testid="desktop-folder-sync-now-btn"
                          disabled={busyAction !== null}
                          onClick={handleSyncDesktopFolderNow}
                          className="h-10 px-4 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-extrabold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                        >
                          <RefreshCw className={`size-4 shrink-0 ${busyAction === 'desktop-folder-sync' ? 'animate-spin' : ''}`} />
                          <span>
                            {busyAction === 'desktop-folder-sync'
                              ? bi('جاري الحفظ والدمج...', 'Syncing...')
                              : bi('مزامنة الآن بضغطة واحدة', 'Sync Now (1 Click)')}
                          </span>
                        </button>
                        <button
                          type="button"
                          data-testid="android-drive-import-btn"
                          disabled={busyAction !== null}
                          onClick={handleImportSyncSmart}
                          className="h-10 px-4 rounded-xl bg-card hover:bg-surface border border-line-2 text-foreground text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                        >
                          <Download className="size-4 shrink-0 text-primary" />
                          <span>{bi('جلب ملف يدوياً', 'Import File Manually')}</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        data-testid="desktop-pick-sync-folder-btn"
                        disabled={busyAction !== null}
                        onClick={handlePickDesktopSyncFolder}
                        className="h-10 px-4 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-extrabold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                      >
                        <FolderOpen className="size-4 shrink-0" />
                        <span>{bi('اختيار مجلد Google Drive على الحاسبة', 'Choose Google Drive Folder on PC')}</span>
                      </button>
                      <button
                        type="button"
                        data-testid="android-drive-share-btn"
                        disabled={busyAction !== null}
                        onClick={handleSaveSyncDirectlyToDrive}
                        className="h-10 px-3.5 rounded-xl bg-card hover:bg-surface border border-line-2 text-foreground text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                      >
                        <Upload className="size-4 shrink-0 text-primary" />
                        <span>{bi('حفظ ملف للرفع يدوياً', 'Save File to Upload Manually')}</span>
                      </button>
                      <button
                        type="button"
                        data-testid="android-drive-import-btn"
                        disabled={busyAction !== null}
                        onClick={handleImportSyncSmart}
                        className="h-10 px-3.5 rounded-xl bg-card hover:bg-surface border border-line-2 text-foreground text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                      >
                        <Download className="size-4 shrink-0 text-primary" />
                        <span>{bi('جلب ودمج ملف', 'Import & Merge File')}</span>
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* METHOD 2: Direct Google Account Sign-In (Web | Built-In Native OAuth | Optional Owner Setup) */}
          {!driveAuth.isSignedIn ? (
            isNativeAppPlatform && !builtInGoogleOAuth ? (
              <div className="rounded-xl bg-surface/80 border border-line-2 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowNativeOAuthSetup((v) => !v)}
                  className="w-full px-4 py-3 flex items-center justify-between gap-2 text-start text-xs font-bold text-foreground cursor-pointer hover:bg-surface transition-colors"
                >
                  <span>
                    {bi(
                      'الطريقة الثانية (اختيارية): تسجيل الدخول المباشر بحساب Google',
                      'Method 2 (Optional): Direct Sign in with Google Account'
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
                        'إذا أردت ربط حساب Google مباشرة حتى تتم المزامنة التلقائية بضغطة زر على الموبايل والحاسبة، أدخل مفتاحي الربط من حسابك المجاني في Google Cloud (تُطلب مرة واحدة فقط، أو استخدم الطريقة الأولى أعلاه بدون أي إعداد):',
                        'To enable 1-tap automatic cloud sync directly with your Google account, enter your free Google Cloud Desktop credentials below (one-time setup — or use Method 1 above with zero setup):'
                      )}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label htmlFor="android-oauth-client-id" className="block text-xs font-bold text-foreground mb-1">
                          {bi('معرّف التطبيق (Client ID)', 'App Client ID')}
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
                          {bi('المفتاح السري (Client Secret — مطلوب من Google)', 'Client Secret (Required by Google)')}
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
                          ? bi('جاري فتح المتصفح لتسجيل الدخول...', 'Opening browser to sign in...')
                          : bi('تسجيل الدخول بحساب Google', 'Sign in with Google')}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-surface/80 border border-line-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-xs font-extrabold text-foreground">
                    {isNativeAppPlatform
                      ? bi('الطريقة الثانية: ربط مباشر بحساب Google (بضغطة زر)', 'Method 2: Direct Google Account Sync (1 Click)')
                      : bi('ربط حساب Google Drive للعيادة', 'Connect Clinic Google Drive Account')}
                  </div>
                  <p className="text-xs text-muted-foreground-1 leading-relaxed">
                    {bi(
                      'سجّل دخولك بحساب Gmail الخاص بالعيادة — لا يستطيع التطبيق رؤية أي صور أو ملفات أخرى في حسابك، بل فقط المجلد الخاص بملفات العيادة.',
                      'Sign in with your clinic Gmail — the app cannot see any personal photos or files, only the dedicated clinic sync folder.'
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
                      : bi('تسجيل الدخول بحساب Google', 'Sign in with Google')}
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
                      ? bi('جاري المزامنة...', 'Syncing...')
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

          {/* Simple Non-Technical Guide for Clinic Owners */}
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
                    'شرح مبسّط: كيف أزامن بياناتي بين الموبايل والحاسبة؟',
                    'Simple Guide: How to Sync Between Phone & PC'
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
              <div className="px-4 pb-4 pt-2 space-y-3 text-xs leading-relaxed border-t border-card-divider">
                <div className="space-y-1.5">
                  <div className="font-extrabold text-primary">
                    {bi('خطوات المزامنة اليومية (ببساطة):', 'Simple Daily Sync Steps:')}
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-muted-foreground-1">
                    <li>
                      {bi(
                        'اختر كلمة سر واحدة خاصة بعيادتك (مثلاً 6 أحرف أو أرقام) واكتبها في خانة «كلمة سر المزامنة» على الموبايل وعلى الحاسبة.',
                        'Pick one private password for your clinic (at least 6 characters) and use the same password on both your phone and PC.'
                      )}
                    </li>
                    <li>
                      {bi(
                        'على الحاسبة: اختَر مجلد Google Drive مرة واحدة، وبعدها كل ما تدوس «مزامنة الآن» يحفظ ملف الحاسبة ويدمج ملفات الموبايل تلقائياً.',
                        'On PC: pick your Google Drive folder once, then click "Sync Now" anytime to save and merge automatically.'
                      )}
                    </li>
                    <li>
                      {bi(
                        'على الموبايل: اضغط «حفظ في Google Drive» واختر مجلد عيادتك لحفظ مرضى الموبايل، واضغط «جلب ودمج» لاختيار ملف الحاسبة وإضافته إلى موبايلك.',
                        'On Phone: tap "Save to Google Drive" to save your phone’s records, and tap "Import & Merge" to bring in updates from your PC.'
                      )}
                    </li>
                  </ol>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-card-divider">
                  <div className="font-extrabold text-emerald-700 dark:text-emerald-400">
                    {bi('هل بيانات المرضى آمنة في Google Drive؟', 'Are Patient Records Safe on Google Drive?')}
                  </div>
                  <p className="text-muted-foreground-1">
                    {bi(
                      'نعم تماماً: التطبيق يقفل ملفات المرضى بكلمة سر عيادتك قبل مغادرة جهازك — لا يستطيع Google ولا أي شخص آخر قراءة اسم مريض واحد بدون كلمة السر. كما أن المزامنة تضيف السجلات الجديدة فقط ولا تحذف أي مريض أو جلسة محفوظة لديك.',
                      'Yes — your files are locked with your clinic password before leaving your device so neither Google nor anyone else can read them. Sync only adds new records and never deletes existing patients or sessions.'
                    )}
                  </p>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-card-divider">
                  <div className="font-extrabold text-foreground">
                    {bi('ماذا لو انقطع الإنترنت أو أُطفئت الحاسبة؟', 'What if Internet Goes Out or the PC is Off?')}
                  </div>
                  <p className="text-muted-foreground-1">
                    {bi(
                      'أكمل عملك وتسجيل مرضاك بشكل طبيعي تماماً بدون إنترنت؛ كل شيء يُحفظ على جهازك أولاً، وعندما يتوفر الإنترنت لاحقاً قم بالمزامنة لتندمج جميع السجلات معاً بأمان.',
                      'Keep working completely offline as usual; everything saves safely on your device first, and merges smoothly once you sync later.'
                    )}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Always-Available Zero-Network File Exchange Fallback */}
      <div className="p-4 rounded-2xl bg-card border border-card-line space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-extrabold text-foreground">
              {bi('نقل ودمج الملفات بدون إنترنت (عبر فلاش أو واتساب)', 'Offline File Transfer & Merge (USB or WhatsApp)')}
            </h4>
            <p className="text-xs text-muted-foreground-1 mt-0.5">
              {bi(
                'خيار احتياطي يعمل دائماً — احفظ ملفاً مقفلاً بكلمة سرك وأرسله لجهازك الآخر لدمج المرضى بدون حذف أي سجل.',
                'Always-available backup option — save a password-locked file and import it on your other device without deleting anything.'
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
              <span>{bi('حفظ ملف مزامنة', 'Save Sync File')}</span>
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
              onClick={handleImportSyncSmart}
              className="h-9 px-3 rounded-xl bg-primary/10 hover:bg-primary/15 text-primary text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Upload className="size-3.5" />
              <span>{bi('جلب ودمج ملف', 'Import & Merge File')}</span>
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
                  {bi('تأكيد المزامنة مع Google Drive', 'Confirm Google Drive Sync')}
                </h4>
                <p className="text-xs text-muted-foreground-1 leading-relaxed">
                  {bi(
                    `سيقوم التطبيق الآن بقفل سجلات هذا الجهاز بكلمة سر المزامنة ورفعها إلى حساب ${driveAuth.email || 'Google Drive'}، ثم جلب ودمج سجلات الأجهزة الأخرى بدون حذف أي مريض. هل تريد المتابعة؟`,
                    `PhysioRecord will lock this device’s records with your sync password, upload them to ${driveAuth.email || 'Google Drive'}, and merge updates from your other devices without deleting anything. Continue?`
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
                {bi('نعم، ابدأ المزامنة الآن', 'Yes, Sync Now')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
