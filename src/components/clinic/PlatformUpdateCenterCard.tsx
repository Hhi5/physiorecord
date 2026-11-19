// =======================================================================
// PhysioRecord — Unified Safe In-Place Update Center & Pre-Update Shield
// Platforms: Web (PWA), Android (Capacitor APK), Windows (Electron EXE)
// Security: Zero automatic external network requests (manual opt-in only).
// =======================================================================

import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  HardDrive,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  TabletSmartphone,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import { APP_SEMVER_VERSION } from '../../utils/settingsOnboardingPhaseF';
import {
  OFFICIAL_LATEST_RELEASE_URL,
  evaluateBackupRecencyForUpdate,
} from '../../utils/updateSafety';
import {
  getAndroidAppVersionInfo,
  getAppRuntimeTarget,
  getElectronDesktopBridge,
  openSafeExternalUrl,
  type ElectronDesktopUpdateStatus,
} from '../../platform/nativeBridge';
import {
  applyPwaUpdate,
  checkForPwaUpdate,
  usePwaStatus,
} from '../../pwa/pwaClient';
import { ModalDialog } from '../ui/Dialog';

interface PlatformUpdateCenterCardProps {
  onOpenBackupModal?: () => void;
}

type PendingUpdateAction =
  | { type: 'pwa-apply' }
  | { type: 'external-release'; url: string; labelAr: string; labelEn: string };

export const PlatformUpdateCenterCard: React.FC<PlatformUpdateCenterCardProps> = ({
  onOpenBackupModal,
}) => {
  const { bi, isRtl } = useLanguage();
  const pwa = usePwaStatus();
  const runtimeTarget = getAppRuntimeTarget();

  const [androidInfo, setAndroidInfo] = useState<{
    packageName: string;
    versionName: string;
    versionCode: number;
  } | null>(null);
  const [desktopVersion, setDesktopVersion] = useState<string | null>(null);

  const [checkingDesktop, setCheckingDesktop] = useState(false);
  const [desktopUpdateStatus, setDesktopUpdateStatus] =
    useState<ElectronDesktopUpdateStatus | null>(null);

  const [checkingPwa, setCheckingPwa] = useState(false);
  const [pwaCheckResult, setPwaCheckResult] = useState<
    'update-ready' | 'up-to-date' | 'unavailable' | null
  >(null);

  const [pendingAction, setPendingAction] = useState<PendingUpdateAction | null>(null);

  useEffect(() => {
    let active = true;
    if (runtimeTarget === 'android') {
      void getAndroidAppVersionInfo().then((info) => {
        if (active && info) setAndroidInfo(info);
      });
    } else if (runtimeTarget === 'desktop') {
      const bridge = getElectronDesktopBridge();
      if (bridge?.getAppInfo) {
        void bridge
          .getAppInfo()
          .then((info) => {
            if (active && info?.version) setDesktopVersion(info.version);
          })
          .catch(() => {
            // Non-fatal in preview contexts
          });
      }
    }
    return () => {
      active = false;
    };
  }, [runtimeTarget]);

  const backupMeta = ClinicOperationsService.getBackupMeta();
  const backupRecency = useMemo(
    () =>
      evaluateBackupRecencyForUpdate(
        backupMeta.lastBackupAt || backupMeta.lastVerifiedBackupAt
      ),
    [backupMeta.lastBackupAt, backupMeta.lastVerifiedBackupAt]
  );

  const displayedVersion =
    runtimeTarget === 'android' && androidInfo?.versionName
      ? androidInfo.versionName
      : runtimeTarget === 'desktop' && desktopVersion
        ? desktopVersion
        : APP_SEMVER_VERSION;

  const displayedAppId = androidInfo?.packageName || 'org.physiorecord.app';

  const runtimeLabel =
    runtimeTarget === 'desktop'
      ? bi('سطح المكتب (Windows Setup)', 'Windows Desktop (Electron)', 'سەر مێز (Windows)')
      : runtimeTarget === 'android'
        ? bi('أندرويد (Signed APK)', 'Android Native (Signed APK)', 'ئەندرۆید (APK)')
        : bi('تطبيق الويب (Web / PWA)', 'Web / PWA Browser', 'وێب (PWA)');

  const handleDesktopCheck = async () => {
    const bridge = getElectronDesktopBridge();
    if (!bridge?.checkForUpdates) return;
    setCheckingDesktop(true);
    try {
      const res = await bridge.checkForUpdates();
      setDesktopUpdateStatus(res);
    } finally {
      setCheckingDesktop(false);
    }
  };

  const handlePwaCheck = async () => {
    setCheckingPwa(true);
    try {
      const result = await checkForPwaUpdate();
      setPwaCheckResult(result);
    } finally {
      setCheckingPwa(false);
    }
  };

  const handleConfirmProceed = () => {
    if (!pendingAction) return;
    const action = pendingAction;
    setPendingAction(null);
    if (action.type === 'pwa-apply') {
      applyPwaUpdate();
      return;
    }
    void openSafeExternalUrl(action.url);
  };

  const formatMegabytes = (bytes?: number) => {
    if (!bytes || bytes <= 0) return null;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <>
      <div
        data-testid="settings-platform-runtime-card"
        className="p-4 rounded-xl bg-surface border border-line-2 space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            <TabletSmartphone className="size-4 text-primary shrink-0" />
            <span>
              {bi(
                'التحديثات الآمنة دون مسح البيانات (Android / Windows / Web)',
                'Safe In-Place Updates & App Identity (Android / Windows / Web)',
                'نوێکردنەوەی سەلامەت بەبێ سڕینەوەی داتاکان'
              )}
            </span>
          </div>
          <span className="font-mono tabular-nums text-xs font-semibold text-muted-foreground-1">
            {displayedAppId} · v{displayedVersion}
            {androidInfo?.versionCode ? ` · code ${androidInfo.versionCode}` : ''}
          </span>
        </div>

        <p className="text-xs text-muted-foreground-1 leading-relaxed">
          {bi(
            `بيئة التشغيل الحالية: ${runtimeLabel}. التحديثات الرسمية تحافظ على نفس معرّف التطبيق ومفتاح التوقيع الرقمي ومسار التخزين المحلي المشفّر، لذلك يترقّى التطبيق مباشرة فوق النسخة القديمة بدون حذفها وبدون مسح سجلات العيادة.`,
            `Active platform: ${runtimeLabel}. Official releases preserve the same App ID, release signing certificate, and encrypted local storage directory, enabling direct in-place upgrades without uninstalling or losing clinic data.`,
            `ژینگەی کارپێکردن: ${runtimeLabel}. نوێکردنەوە فەرمییەکان هەمان ناسنامە و کلیلی واژۆ دەپارێزن بۆیە ڕاستەوخۆ بەسەر وەشانە کۆنەکەدا دادەمەزرێن بەبێ سڕینەوەی زانیارییەکان.`
          )}
        </p>

        {/* Encrypted Backup Recency Indicator */}
        <div
          data-testid="update-backup-readiness-line"
          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-card border border-line-2 text-xs"
        >
          <div className="flex items-center gap-2">
            {backupRecency.isRecent ? (
              <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <ShieldAlert className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
            )}
            <span className="font-medium text-foreground">
              {backupRecency.status === 'recent'
                ? bi(
                    `آخر نسخة احتياطية مشفرة: ${backupRecency.lastBackupDateLabel} (حديثة وجاهزة للتحديث)`,
                    `Last encrypted backup: ${backupRecency.lastBackupDateLabel} (recent & ready)`,
                    `دوایین کۆپی یەدەگی کۆدکراو: ${backupRecency.lastBackupDateLabel} (نوێیە)`
                  )
                : backupRecency.status === 'stale'
                  ? bi(
                      `آخر نسخة احتياطية بتاريخ ${backupRecency.lastBackupDateLabel} (منذ ${backupRecency.daysSinceBackup} يوماً) — يُنصح بأخذ نسخة جديدة قبل التحديث`,
                      `Last backup was ${backupRecency.lastBackupDateLabel} (${backupRecency.daysSinceBackup} days ago) — back up before updating`,
                      `دوایین کۆپی یەدەگ لە ${backupRecency.lastBackupDateLabel} بوو — باشترە پێش نوێکردنەوە کۆپی نوێ هەڵبگریت`
                    )
                  : bi(
                      'لم يتم حفظ نسخة احتياطية مشفرة مؤخراً — خذ نسخة احتياطية (.ptbackup) قبل التحديث.',
                      'No recent encrypted backup recorded — save a .ptbackup file before updating.',
                      'هیچ کۆپییەکی یەدەگی کۆدکراوی نوێ تۆمار نەکراوە — پێش نوێکردنەوە کۆپی هەڵبگرە.'
                    )}
            </span>
          </div>
          {onOpenBackupModal && (
            <button
              type="button"
              data-testid="update-center-backup-now-btn"
              onClick={onOpenBackupModal}
              className="px-2.5 py-1 rounded-lg bg-layer hover:bg-layer-hover border border-layer-line text-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <HardDrive className="size-3.5 text-primary" />
              <span>
                {bi('حفظ نسخة احتياطية الآن', 'Back Up Now', 'کۆپی یەدەگ ئێستا')}
              </span>
            </button>
          )}
        </div>

        {/* Platform-Specific Opt-In Update Controls */}
        {runtimeTarget === 'desktop' && (
          <div className="space-y-2 pt-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="desktop-check-updates-btn"
                disabled={checkingDesktop}
                onClick={handleDesktopCheck}
                className="py-2 px-3.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw
                  className={`size-3.5 ${checkingDesktop ? 'animate-spin' : ''}`}
                />
                <span>
                  {checkingDesktop
                    ? bi(
                        'جاري التحقق من الإصدارات...',
                        'Checking GitHub Releases...',
                        'پشکنینی وەشانەکان...'
                      )
                    : bi(
                        'فحص التحديثات الآن (Windows)',
                        'Check for Windows Updates',
                        'پشکنینی نوێکردنەوەکانی ویندۆز'
                      )}
                </span>
              </button>
              <button
                type="button"
                data-testid="open-official-releases-btn"
                onClick={() =>
                  setPendingAction({
                    type: 'external-release',
                    url: OFFICIAL_LATEST_RELEASE_URL,
                    labelAr: 'فتح صفحة الإصدارات الرسمية على GitHub',
                    labelEn: 'Open Official GitHub Releases Page',
                  })
                }
                className="py-2 px-3 rounded-xl bg-layer hover:bg-layer-hover border border-layer-line text-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <ExternalLink className="size-3.5 text-primary" />
                <span>
                  {bi('صفحة الإصدارات الرسمية', 'Official Releases', 'پەڕەی وەشانە فەرمییەکان')}
                </span>
              </button>
            </div>

            {desktopUpdateStatus && (
              <div
                data-testid="desktop-update-status-banner"
                className={`p-3 rounded-xl bg-card border border-line-2 text-xs font-semibold flex flex-wrap items-center justify-between gap-2 ${
                  desktopUpdateStatus.status === 'update-available'
                    ? 'text-amber-700 dark:text-amber-400'
                    : desktopUpdateStatus.status === 'up-to-date'
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-rose-700 dark:text-rose-400'
                }`}
              >
                <div className="space-y-0.5">
                  <div>{bi(desktopUpdateStatus.messageAr, desktopUpdateStatus.messageEn)}</div>
                  {desktopUpdateStatus.assetName && (
                    <div className="font-mono tabular-nums text-xs text-muted-foreground-1">
                      {desktopUpdateStatus.assetName}
                      {formatMegabytes(desktopUpdateStatus.assetSizeBytes)
                        ? ` · ${formatMegabytes(desktopUpdateStatus.assetSizeBytes)}`
                        : ''}
                    </div>
                  )}
                </div>
                {desktopUpdateStatus.status === 'update-available' &&
                  (desktopUpdateStatus.downloadUrl || desktopUpdateStatus.releaseUrl) && (
                    <button
                      type="button"
                      data-testid="desktop-download-update-btn"
                      onClick={() =>
                        setPendingAction({
                          type: 'external-release',
                          url:
                            desktopUpdateStatus.downloadUrl ||
                            desktopUpdateStatus.releaseUrl!,
                          labelAr: 'تنزيل مثبّت التحديث المباشر (Windows Setup.exe)',
                          labelEn: 'Download Windows In-Place Update Installer',
                        })
                      }
                      className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download className="size-3.5" />
                      <span>
                        {bi(
                          'تحديث فوق النسخة الحالية',
                          'Download In-Place Update',
                          'داگرتنی نوێکردنەوە'
                        )}
                      </span>
                    </button>
                  )}
              </div>
            )}
          </div>
        )}

        {runtimeTarget === 'android' && (
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <button
              type="button"
              data-testid="app-check-updates-btn"
              onClick={() =>
                setPendingAction({
                  type: 'external-release',
                  url: OFFICIAL_LATEST_RELEASE_URL,
                  labelAr: 'فتح صفحة تنزيل أحدث APK موقّع للأندرويد',
                  labelEn: 'Open Signed Android APK Release Download',
                })
              }
              className="py-2 px-3.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="size-3.5" />
              <span>
                {bi(
                  'تنزيل أحدث APK موقّع (تحديث مباشر فوق الحالي)',
                  'Download Latest Signed APK (In-Place Update)',
                  'داگرتنی نوێترین APKی واژۆکراو'
                )}
              </span>
            </button>
          </div>
        )}

        {runtimeTarget === 'web' && (
          <div className="space-y-2 pt-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="app-check-updates-btn"
                disabled={checkingPwa}
                onClick={handlePwaCheck}
                className="py-2 px-3.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw
                  className={`size-3.5 ${checkingPwa ? 'animate-spin' : ''}`}
                />
                <span>
                  {checkingPwa
                    ? bi('جاري فحص نسخة الويب...', 'Checking Web Update...', 'پشکنینی وەشانی وێب...')
                    : bi('فحص تحديثات الويب (PWA)', 'Check Web (PWA) Updates', 'پشکنینی نوێکردنەوەی وێب')}
                </span>
              </button>

              {(pwa.updateReady || pwaCheckResult === 'update-ready') && (
                <button
                  type="button"
                  data-testid="pwa-apply-update-btn"
                  onClick={() => setPendingAction({ type: 'pwa-apply' })}
                  className="py-2 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="size-3.5" />
                  <span>
                    {bi(
                      'تفعيل التحديث دون حذف البيانات',
                      'Activate Update Safely',
                      'کارپێکردنی نوێکردنەوە بەبێ سڕینەوە'
                    )}
                  </span>
                </button>
              )}

              <button
                type="button"
                data-testid="open-official-releases-btn"
                onClick={() =>
                  setPendingAction({
                    type: 'external-release',
                    url: OFFICIAL_LATEST_RELEASE_URL,
                    labelAr: 'فتح صفحة الإصدارات الرسمية (APK / Windows Setup)',
                    labelEn: 'Open Official Releases (APK / Windows Setup)',
                  })
                }
                className="py-2 px-3 rounded-xl bg-layer hover:bg-layer-hover border border-layer-line text-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <ExternalLink className="size-3.5 text-primary" />
                <span>
                  {bi(
                    'إصدارات Android و Windows',
                    'Android & Windows Releases',
                    'وەشانەکانی Android و Windows'
                  )}
                </span>
              </button>
            </div>

            {pwaCheckResult && (
              <div
                data-testid="web-update-status-note"
                className="flex items-center gap-2 text-xs text-muted-foreground-1"
              >
                <CheckCircle2 className="size-4 text-primary shrink-0" />
                <span>
                  {pwaCheckResult === 'update-ready'
                    ? bi(
                        'تتوفر نسخة ويب جديدة جاهزة للتفعيل دون مسح أي سجل مريض.',
                        'A new Web PWA build is downloaded and ready to activate without clearing clinic data.'
                      )
                    : pwaCheckResult === 'up-to-date'
                      ? bi(
                          'تعمل حالياً على أحدث إصدار متاح من تطبيق الويب.',
                          'You are currently running the latest Web PWA build.'
                        )
                      : bi(
                          'التحديث الفوري للويب يعمل في نسخة الإنتاج المثبّتة، ويمكنك دائماً تنزيل أحدث حزم Android/Windows من الإصدارات الرسمية.',
                          'Live Service Worker updates run in production builds; you can always download official Android/Windows packages from Releases.'
                        )}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pre-Update Encrypted Backup Shield Modal */}
      <ModalDialog
        isOpen={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
        dir={isRtl ? 'rtl' : 'ltr'}
        size="md"
        title={bi(
          'درع حماية البيانات قبل التحديث',
          'Pre-Update Encrypted Backup Shield',
          'پاراستنی داتاکان پێش نوێکردنەوە'
        )}
        subtitle={
          pendingAction?.type === 'pwa-apply'
            ? bi(
                'تفعيل نسخة الويب الجديدة مع الحفاظ الكامل على قاعدة البيانات المشفرة',
                'Activating updated Web build while preserving local encrypted IndexedDB',
                'کارپێکردنی وەشانی نوێ بە پاراستنی داتابەیس'
              )
            : pendingAction
              ? bi(pendingAction.labelAr, pendingAction.labelEn)
              : undefined
        }
        closeLabel={bi('إلغاء', 'Cancel', 'پاشگەزبوونەوە')}
      >
        <div
          data-testid="pre-update-backup-shield-modal"
          className="p-4 sm:p-5 space-y-4 text-xs"
        >
          <div className="p-3.5 rounded-xl bg-surface border border-line-2 space-y-2 leading-relaxed text-foreground">
            <div className="flex items-center gap-2 font-bold text-primary">
              <ShieldCheck className="size-4 shrink-0" />
              <span>
                {bi(
                  'ملاحظة التحديث الآمن فوق النسخة الحالية',
                  'Safe In-Place Upgrade Guarantee',
                  'دڵنیایی نوێکردنەوەی سەلامەت'
                )}
              </span>
            </div>
            <p className="text-muted-foreground-1">
              {bi(
                'لا تقم بحذف التطبيق القديم أبداً. عند تثبيت ملف التحديث الرسمي الموقّع (APK أو Setup.exe أو PWA) فوق التطبيق الحالي، تبقى جميع بيانات المرضى والفواتير والمواعيد محفوظة بالكامل.',
                'Never uninstall the previous version. Installing the officially signed update (APK, Setup.exe, or PWA reload) upgrades the app in-place while preserving all patients, invoices, and appointments.',
                'هەرگیز بەرنامە کۆنەکە مەسڕەوە. دامەزراندنی وەشانی فەرمی واژۆکراو لەسەر بەرنامە کۆنەکە هەموو داتاکان وەک خۆیان دەهێڵێتەوە.'
              )}
            </p>
          </div>

          <div
            className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
              backupRecency.isRecent
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-300'
            }`}
          >
            {backupRecency.isRecent ? (
              <ShieldCheck className="size-4 shrink-0 mt-0.5" />
            ) : (
              <ShieldAlert className="size-4 shrink-0 mt-0.5" />
            )}
            <div className="space-y-1 leading-relaxed">
              <div className="font-bold">
                {backupRecency.isRecent
                  ? bi(
                      `حالة النسخ الاحتياطي: آمنة (${backupRecency.lastBackupDateLabel})`,
                      `Backup Status: Ready (${backupRecency.lastBackupDateLabel})`,
                      `دۆخی کۆپی یەدەگ: ئامادەیە (${backupRecency.lastBackupDateLabel})`
                    )
                  : bi(
                      'توصية هامة قبل الترقية: احفظ نسخة احتياطية مشفرة أولاً',
                      'Recommended Safety Step: Save an Encrypted Backup First',
                      'ئامۆژگاری گرنگ: سەرەتا کۆپییەکی یەدەگی کۆدکراو هەڵبگرە'
                    )}
              </div>
              <p>
                {bi(
                  'حفظ ملف (.ptbackup) قبل التحديث يمنحك نسخة احتياطية مشفرة يمكنك استعادتها على أي جهاز في ثوانٍ.',
                  'Saving a quick (.ptbackup) file before updating gives you an encrypted recovery archive you can restore anytime.',
                  'هەڵگرتنی فایلی (.ptbackup) پێش نوێکردنەوە پارێزگاری تەواوت پێدەبەخشێت.'
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            {onOpenBackupModal && (
              <button
                type="button"
                data-testid="pre-update-backup-first-btn"
                onClick={() => {
                  setPendingAction(null);
                  onOpenBackupModal();
                }}
                className="py-2 px-3.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <HardDrive className="size-3.5" />
                <span>
                  {bi(
                    'حفظ نسخة احتياطية مشفرة أولاً (.ptbackup)',
                    'Save Encrypted Backup First (.ptbackup)',
                    'سەرەتا هەڵگرتنی کۆپی یەدەگ (.ptbackup)'
                  )}
                </span>
              </button>
            )}
            <button
              type="button"
              data-testid="pre-update-proceed-btn"
              onClick={handleConfirmProceed}
              className="py-2 px-3.5 rounded-xl bg-layer hover:bg-layer-hover border border-layer-line text-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="size-3.5 text-primary" />
              <span>
                {bi(
                  'المتابعة للتحديث فوق النسخة الحالية',
                  'Continue In-Place Update',
                  'بەردەوامبوون لە نوێکردنەوە'
                )}
              </span>
            </button>
          </div>
        </div>
      </ModalDialog>
    </>
  );
};
