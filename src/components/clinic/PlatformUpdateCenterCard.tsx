// =======================================================================
// PhysioRecord — Unified Safe In-Place Update Center & Pre-Update Shield
// Platforms: Web (PWA), Android (Capacitor APK), Windows (Electron EXE)
// Security: Zero automatic external network requests (manual opt-in only).
// =======================================================================

import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  GitBranch,
  HardDrive,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Tag,
  TabletSmartphone,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import { APP_SEMVER_VERSION } from '../../utils/settingsOnboardingPhaseF';
import {
  OFFICIAL_GITHUB_REPO,
  OFFICIAL_GITHUB_REPO_URL,
  OFFICIAL_LATEST_RELEASE_URL,
  OFFICIAL_RELEASES_URL,
  compareSemverVersions,
  evaluateBackupRecencyForUpdate,
  extractReleaseNotesLines,
  loadCachedGithubReleases,
  normalizeGithubReleasesPayload,
  saveCachedGithubReleases,
  selectPlatformReleaseAsset,
  type SyncedGithubReleaseItem,
} from '../../utils/updateSafety';
import {
  fetchOfficialGitHubReleases,
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

  const [syncingReleases, setSyncingReleases] = useState(false);
  const [syncError, setSyncError] = useState<{ ar: string; en: string } | null>(null);
  const [syncedReleases, setSyncedReleases] = useState<SyncedGithubReleaseItem[]>(
    () => loadCachedGithubReleases()?.releases ?? []
  );
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(
    () => loadCachedGithubReleases()?.syncedAt ?? null
  );
  const [expandedReleaseId, setExpandedReleaseId] = useState<number | null>(null);

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

  const latestSyncedRelease = useMemo(() => {
    if (syncedReleases.length === 0) return null;
    return syncedReleases.find((r) => !r.isPrerelease) || syncedReleases[0];
  }, [syncedReleases]);

  const latestPlatformAsset = useMemo(
    () =>
      latestSyncedRelease
        ? selectPlatformReleaseAsset(latestSyncedRelease.assets, runtimeTarget)
        : null,
    [latestSyncedRelease, runtimeTarget]
  );

  const hasNewerSyncedRelease = useMemo(() => {
    if (!latestSyncedRelease) return false;
    return compareSemverVersions(latestSyncedRelease.version, displayedVersion) > 0;
  }, [latestSyncedRelease, displayedVersion]);

  const handleSyncGitHubReleases = async () => {
    setSyncingReleases(true);
    setSyncError(null);
    try {
      const bridge = getElectronDesktopBridge();
      if (runtimeTarget === 'desktop' && bridge?.checkForUpdates) {
        const res = await bridge.checkForUpdates();
        setDesktopUpdateStatus(res);
        if (Array.isArray(res.releases) && res.releases.length > 0) {
          const normalized = normalizeGithubReleasesPayload(res.releases);
          const cached = saveCachedGithubReleases(normalized);
          setSyncedReleases(cached.releases);
          setLastSyncedAt(cached.syncedAt);
          if (cached.releases[0]) {
            setExpandedReleaseId(cached.releases[0].id);
          }
          return;
        }
        if (res.status === 'error') {
          setSyncError({ ar: res.messageAr, en: res.messageEn });
          return;
        }
      }

      const result = await fetchOfficialGitHubReleases();
      if (!result.ok) {
        setSyncError({
          ar: 'تعذرت مزامنة الإصدارات مع GitHub (تأكد من الاتصال بالإنترنت أو افتح صفحة المستودع مباشرة).',
          en: result.error
            ? `Could not sync GitHub Releases (${result.error}).`
            : 'Could not sync GitHub Releases. Check your internet connection or open the repository directly.',
        });
        return;
      }

      if (result.releases.length === 0) {
        setSyncError({
          ar: 'لا توجد إصدارات منشورة في المستودع حالياً.',
          en: 'No published releases found in the repository yet.',
        });
        return;
      }

      const cached = saveCachedGithubReleases(result.releases);
      setSyncedReleases(cached.releases);
      setLastSyncedAt(cached.syncedAt);
      if (cached.releases[0]) {
        setExpandedReleaseId(cached.releases[0].id);
      }
    } finally {
      setSyncingReleases(false);
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

  const formatReleaseDate = (iso?: string) => {
    if (!iso) return null;
    const d = iso.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
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
                'التحديثات الآمنة ومزامنة مستودع GitHub (Android / Windows / Web)',
                'Safe Updates & GitHub Repository Sync (Android / Windows / Web)',
                'نوێکردنەوەی سەلامەت و هاوکاتکردن لەگەڵ گیتهەب'
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
            `بيئة التشغيل الحالية: ${runtimeLabel}. التحديثات الرسمية تحافظ على نفس معرّف التطبيق ومفتاح التوقيع ومسار التخزين المحلي المشفّر، لذلك يترقّى التطبيق مباشرة فوق النسخة القديمة بدون مسح سجلات العيادة.`,
            `Active platform: ${runtimeLabel}. Official releases preserve the same App ID, signing certificate, and encrypted local storage directory, enabling direct in-place upgrades without deleting clinic data.`,
            `ژینگەی کارپێکردن: ${runtimeLabel}. نوێکردنەوە فەرمییەکان هەمان ناسنامە و کلیلی واژۆ دەپارێزن بەبێ سڕینەوەی زانیارییەکان.`
          )}
        </p>

        {/* Official GitHub Repository Banner */}
        <div
          data-testid="official-repo-link-bar"
          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-card border border-line-2 text-xs"
        >
          <div className="flex items-center gap-2 min-w-0">
            <GitBranch className="size-3.5 text-primary shrink-0" />
            <span className="text-muted-foreground-1">
              {bi('المستودع الرسمي:', 'Official Repository:', 'کۆگای فەرمی:')}
            </span>
            <button
              type="button"
              data-testid="open-official-repo-btn"
              onClick={() => void openSafeExternalUrl(OFFICIAL_GITHUB_REPO_URL)}
              className="font-mono font-bold text-primary hover:underline inline-flex items-center gap-1 cursor-pointer truncate"
              dir="ltr"
            >
              <span>github.com/{OFFICIAL_GITHUB_REPO}</span>
              <ExternalLink className="size-3 shrink-0" />
            </button>
          </div>
          <button
            type="button"
            data-testid="open-official-releases-btn"
            onClick={() =>
              setPendingAction({
                type: 'external-release',
                url: OFFICIAL_RELEASES_URL,
                labelAr: 'فتح جميع الإصدارات الرسمية على GitHub',
                labelEn: 'Open All Official GitHub Releases',
              })
            }
            className="px-2.5 py-1 rounded-lg bg-layer hover:bg-layer-hover border border-layer-line text-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <ExternalLink className="size-3 text-primary" />
            <span>{bi('صفحة الإصدارات', 'Releases Page', 'پەڕەی وەشانەکان')}</span>
          </button>
        </div>

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
              <span>{bi('حفظ نسخة احتياطية الآن', 'Back Up Now', 'کۆپی یەدەگ ئێستا')}</span>
            </button>
          )}
        </div>

        {/* Manual Opt-In Sync & Platform Controls */}
        <div className="space-y-2 pt-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid={
                runtimeTarget === 'desktop'
                  ? 'desktop-check-updates-btn'
                  : 'sync-github-releases-btn'
              }
              disabled={syncingReleases}
              onClick={handleSyncGitHubReleases}
              className="py-2 px-3.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw
                className={`size-3.5 ${syncingReleases ? 'animate-spin' : ''}`}
              />
              <span>
                {syncingReleases
                  ? bi(
                      'جاري المزامنة مع GitHub...',
                      'Syncing GitHub Releases...',
                      'هاوکاتکردن لەگەڵ گیتهەب...'
                    )
                  : bi(
                      'مزامنة الإصدارات والتحديثات من GitHub',
                      'Sync Releases & Notes from GitHub',
                      'هاوکاتکردنی وەشانەکان لە گیتهەب'
                    )}
              </span>
            </button>

            {runtimeTarget === 'web' && (
              <>
                <button
                  type="button"
                  data-testid="app-check-updates-btn"
                  disabled={checkingPwa}
                  onClick={handlePwaCheck}
                  className="py-2 px-3 rounded-xl bg-layer hover:bg-layer-hover border border-layer-line text-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw
                    className={`size-3.5 text-primary ${checkingPwa ? 'animate-spin' : ''}`}
                  />
                  <span>
                    {checkingPwa
                      ? bi('فحص نسخة الويب...', 'Checking Web PWA...', 'پشکنینی وێب...')
                      : bi('فحص تحديث الويب (PWA)', 'Check Web (PWA)', 'پشکنینی وەشانی وێب')}
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
              </>
            )}

            {runtimeTarget === 'android' && (
              <button
                type="button"
                data-testid="app-check-updates-btn"
                onClick={() =>
                  setPendingAction({
                    type: 'external-release',
                    url: latestPlatformAsset?.downloadUrl || OFFICIAL_LATEST_RELEASE_URL,
                    labelAr: 'تنزيل أحدث APK موقّع للأندرويد',
                    labelEn: 'Download Latest Signed Android APK',
                  })
                }
                className="py-2 px-3 rounded-xl bg-layer hover:bg-layer-hover border border-layer-line text-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="size-3.5 text-primary" />
                <span>
                  {bi(
                    'تنزيل أحدث APK موقّع',
                    'Download Latest Signed APK',
                    'داگرتنی نوێترین APK'
                  )}
                </span>
              </button>
            )}
          </div>

          {pwaCheckResult && runtimeTarget === 'web' && (
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
                        'التحديث الفوري للويب يعمل في نسخة الإنتاج المثبّتة، ويمكنك دائماً تنزيل أحدث حزم Android/Windows من الإصدارات المتزامنة أدناه.',
                        'Live Service Worker updates run in production builds; you can always download official Android/Windows packages from the synced releases below.'
                      )}
              </span>
            </div>
          )}

          {syncError && (
            <div
              data-testid="sync-releases-error-banner"
              className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-400 text-xs font-semibold"
            >
              {bi(syncError.ar, syncError.en)}
            </div>
          )}

          {/* Desktop or Cross-Platform Latest Version Comparison Banner */}
          {(desktopUpdateStatus || latestSyncedRelease) && !syncError && (
            <div
              data-testid="desktop-update-status-banner"
              className={`p-3 rounded-xl bg-card border border-line-2 text-xs font-semibold flex flex-wrap items-center justify-between gap-2 ${
                hasNewerSyncedRelease || desktopUpdateStatus?.status === 'update-available'
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-emerald-700 dark:text-emerald-400'
              }`}
            >
              <div className="space-y-0.5">
                <div>
                  {hasNewerSyncedRelease && latestSyncedRelease
                    ? bi(
                        `يتوفر إصدار جديد على GitHub (${latestSyncedRelease.tagName}) — النسخة الحالية v${displayedVersion}.`,
                        `New release available on GitHub (${latestSyncedRelease.tagName}) — current v${displayedVersion}.`,
                        `وەشانێکی نوێ لە گیتهەب بەردەستە (${latestSyncedRelease.tagName}) — ئێستا v${displayedVersion}.`
                      )
                    : desktopUpdateStatus
                      ? bi(desktopUpdateStatus.messageAr, desktopUpdateStatus.messageEn)
                      : bi(
                          `أنت تستخدم أحدث إصدار منشور في المستودع (v${displayedVersion}).`,
                          `You are running the latest published repository release (v${displayedVersion}).`,
                          `تۆ دوایین وەشانی بڵاوکراوەی کۆگا بەکاردەهێنیت (v${displayedVersion}).`
                        )}
                </div>
                {(latestPlatformAsset || desktopUpdateStatus?.assetName) && (
                  <div className="font-mono tabular-nums text-xs text-muted-foreground-1" dir="ltr">
                    {latestPlatformAsset?.fileName || desktopUpdateStatus?.assetName}
                    {formatMegabytes(
                      latestPlatformAsset?.sizeBytes ?? desktopUpdateStatus?.assetSizeBytes
                    )
                      ? ` · ${formatMegabytes(
                          latestPlatformAsset?.sizeBytes ?? desktopUpdateStatus?.assetSizeBytes
                        )}`
                      : ''}
                  </div>
                )}
              </div>

              {(hasNewerSyncedRelease || desktopUpdateStatus?.status === 'update-available') && (
                <button
                  type="button"
                  data-testid="desktop-download-update-btn"
                  onClick={() =>
                    setPendingAction({
                      type: 'external-release',
                      url:
                        latestPlatformAsset?.downloadUrl ||
                        desktopUpdateStatus?.downloadUrl ||
                        latestSyncedRelease?.htmlUrl ||
                        OFFICIAL_LATEST_RELEASE_URL,
                      labelAr: `تنزيل تحديث ${latestSyncedRelease?.tagName || ''}`.trim(),
                      labelEn: `Download ${latestSyncedRelease?.tagName || 'Latest'} Update`,
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

          {/* Synced GitHub Releases List (Multiple Versions + Exact Release Notes) */}
          {syncedReleases.length > 0 && (
            <div
              data-testid="synced-github-releases-list"
              className="pt-2 space-y-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-bold text-foreground">
                  {bi(
                    `الإصدارات المتزامنة من المستودع (${syncedReleases.length})`,
                    `Synced Repository Releases (${syncedReleases.length})`,
                    `وەشانە هاوکاتکراوەکانی گیتهەب (${syncedReleases.length})`
                  )}
                </span>
                {lastSyncedAt && (
                  <span className="text-muted-foreground-1 font-mono" dir="ltr">
                    {bi('آخر مزامنة:', 'Last synced:', 'دوایین هاوکاتکردن:')}{' '}
                    {formatReleaseDate(lastSyncedAt) || lastSyncedAt.slice(0, 16)}
                  </span>
                )}
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto pe-0.5">
                {syncedReleases.map((rel, index) => {
                  const isCurrent =
                    compareSemverVersions(rel.version, displayedVersion) === 0;
                  const isNewer =
                    compareSemverVersions(rel.version, displayedVersion) > 0;
                  const notesLines = extractReleaseNotesLines(rel.body);
                  const isExpanded = expandedReleaseId === rel.id || (expandedReleaseId === null && index === 0);
                  const platformAsset = selectPlatformReleaseAsset(rel.assets, runtimeTarget);

                  return (
                    <div
                      key={rel.id}
                      data-testid={`synced-release-item-${rel.tagName}`}
                      className="p-3 rounded-xl bg-card border border-line-2 space-y-2 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            dir="ltr"
                            className="px-2 py-0.5 rounded-md bg-primary text-primary-foreground font-mono font-bold"
                          >
                            {rel.tagName}
                          </span>
                          {index === 0 && !rel.isPrerelease && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 font-semibold">
                              <Tag className="size-3" />
                              <span>{bi('الأحدث', 'Latest', 'نوێترین')}</span>
                            </span>
                          )}
                          {isCurrent && (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold">
                              {bi('مثبّت حالياً', 'Installed', 'دامەزراوە')}
                            </span>
                          )}
                          {isNewer && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-800 dark:text-amber-300 font-semibold">
                              {bi('تحديث جديد', 'Update Available', 'نوێکردنەوە')}
                            </span>
                          )}
                          {rel.isPrerelease && (
                            <span className="px-2 py-0.5 rounded-md bg-layer text-muted-foreground-1 font-semibold">
                              {bi('تجريبي', 'Pre-release', 'تاقیکاری')}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {formatReleaseDate(rel.publishedAt) && (
                            <span
                              dir="ltr"
                              className="inline-flex items-center gap-1 text-muted-foreground-1 font-mono"
                            >
                              <Calendar className="size-3" />
                              <span>{formatReleaseDate(rel.publishedAt)}</span>
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedReleaseId(isExpanded ? -1 : rel.id)
                            }
                            aria-label={bi('عرض أو إخفاء التفاصيل', 'Toggle release notes')}
                            className="p-1 rounded-lg hover:bg-layer-hover text-muted-foreground-1 hover:text-foreground cursor-pointer"
                          >
                            {isExpanded ? (
                              <ChevronUp className="size-4" />
                            ) : (
                              <ChevronDown className="size-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="font-bold text-foreground">{rel.name}</div>

                      {isExpanded && (
                        <div className="space-y-2 pt-1 border-t border-line-2/70">
                          {notesLines.length > 0 ? (
                            <ul className="space-y-1 text-muted-foreground-1 leading-relaxed">
                              {notesLines.map((line, lineIdx) => (
                                <li key={lineIdx} className="flex items-start gap-1.5">
                                  <CheckCircle2 className="size-3.5 text-primary shrink-0 mt-0.5" />
                                  <span className="break-words">{line}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-muted-foreground-1">
                              {bi(
                                'لا توجد ملاحظات مكتوبة في وصف هذا الإصدار.',
                                'No release notes were written for this release.',
                                'هیچ تێبینییەک بۆ ئەم وەشانە نەنووسراوە.'
                              )}
                            </p>
                          )}

                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                            {platformAsset ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setPendingAction({
                                    type: 'external-release',
                                    url: platformAsset.downloadUrl,
                                    labelAr: `تنزيل ${platformAsset.fileName}`,
                                    labelEn: `Download ${platformAsset.fileName}`,
                                  })
                                }
                                className="px-2.5 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/25 font-bold inline-flex items-center gap-1.5 cursor-pointer"
                              >
                                <Download className="size-3.5" />
                                <span dir="ltr">{platformAsset.fileName}</span>
                              </button>
                            ) : (
                              <span />
                            )}

                            <button
                              type="button"
                              onClick={() => void openSafeExternalUrl(rel.htmlUrl)}
                              className="px-2.5 py-1 rounded-lg bg-layer hover:bg-layer-hover border border-layer-line text-foreground font-semibold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <ExternalLink className="size-3 text-primary" />
                              <span>{bi('فتح على GitHub', 'View on GitHub', 'کردنەوە لە گیتهەب')}</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
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
