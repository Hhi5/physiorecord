// =======================================================================
// PhysioRecord — Unified Multi-Platform Native Bridge (Web / Android / Windows)
// Zero external runtime dependencies; communicates with:
// - Android Capacitor (`window.Capacitor.Plugins.PhysioRecordNative`)
// - Windows Electron (`window.electronAPI` via contextBridge preload)
// - Standard Web / PWA APIs (File System Access API, Web Share, window.print)
// =======================================================================

import {
  OFFICIAL_GITHUB_RELEASES_API_URL,
  normalizeGithubReleasesPayload,
  type SyncedGithubReleaseItem,
} from '../utils/updateSafety';
import { isAllowedExternalActionUrl } from '../utils/securityHardening';

export type AppRuntimeTarget = 'web' | 'android' | 'desktop';

export interface AndroidPhysioRecordPlugin {
  saveFileToDevice?: (options: {
    filename: string;
    content: string;
    mimeType: string;
  }) => Promise<{
    saved: boolean;
    cancelled?: boolean;
    uri?: string;
    filename?: string;
  }>;
  shareFile?: (options: {
    filename: string;
    content: string;
    mimeType: string;
    title?: string;
    text?: string;
  }) => Promise<{
    shared: boolean;
  }>;
  printCurrentPage?: (options: {
    jobName: string;
  }) => Promise<{
    printed: boolean;
  }>;
  openExternalUrl?: (options: {
    url: string;
  }) => Promise<{
    opened: boolean;
  }>;
  getAppVersionInfo?: () => Promise<{
    packageName: string;
    versionName: string;
    versionCode: number;
  }>;
  fetchGitHubReleases?: () => Promise<{
    ok: boolean;
    releasesJson?: string;
  }>;
}

export interface ElectronDesktopUpdateStatus {
  status: 'up-to-date' | 'update-available' | 'error';
  currentVersion: string;
  latestVersion?: string;
  releaseUrl?: string;
  downloadUrl?: string;
  assetName?: string;
  assetSizeBytes?: number;
  publishedAt?: string;
  releaseNotes?: string;
  releases?: unknown[];
  messageAr: string;
  messageEn: string;
}

export interface ElectronDesktopBridge {
  isElectron: boolean;
  getAppInfo?: () => Promise<{
    version: string;
    platform: string;
    userDataPath: string;
    appId: string;
  }>;
  saveFile?: (options: {
    filename: string;
    content: string;
    mimeType?: string;
    description?: string;
    extensions?: string[];
  }) => Promise<{
    saved: boolean;
    cancelled?: boolean;
    filePath?: string;
    filename?: string;
  }>;
  pickBackupDirectory?: () => Promise<{
    configured: boolean;
    folderPath?: string;
    folderName?: string;
    cancelled?: boolean;
  }>;
  getConfiguredBackupDirectory?: () => Promise<{
    configured: boolean;
    folderPath?: string;
    folderName?: string;
  }>;
  clearConfiguredBackupDirectory?: () => Promise<void>;
  writeToConfiguredBackupDirectory?: (options: {
    filename: string;
    content: string;
  }) => Promise<{
    written: boolean;
    folderName?: string;
    filePath?: string;
  }>;
  printCurrentPage?: (options: {
    jobName: string;
  }) => Promise<{
    printed: boolean;
  }>;
  exportCurrentPageToPdf?: (options: {
    suggestedName: string;
  }) => Promise<{
    saved: boolean;
    cancelled?: boolean;
    filePath?: string;
  }>;
  openExternalUrl?: (options: {
    url: string;
  }) => Promise<{
    opened: boolean;
  }>;
  checkForUpdates?: () => Promise<ElectronDesktopUpdateStatus>;
  fetchGithubReleases?: () => Promise<{
    ok: boolean;
    releases?: unknown[];
    error?: string;
  }>;
  startLanSyncHub?: (options?: { port?: number }) => Promise<{
    running: boolean;
    port: number;
    urls: string[];
    pairingToken: string;
    storedDevicesCount: number;
    error?: string;
  }>;
  stopLanSyncHub?: () => Promise<{ running: boolean }>;
  getLanSyncHubStatus?: () => Promise<{
    running: boolean;
    port: number;
    urls: string[];
    pairingToken: string;
    storedDevicesCount: number;
  }>;
  lanSyncExchange?: (options: {
    serverUrl: string;
    pairingToken: string;
    envelope: unknown;
  }) => Promise<{
    ok: boolean;
    peerEnvelopes?: unknown[];
    error?: string;
  }>;
}

interface GlobalNativeWindow extends Window {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
    Plugins?: {
      PhysioRecordNative?: AndroidPhysioRecordPlugin;
    };
  };
  electronAPI?: ElectronDesktopBridge;
}

function getGlobalWindow(): GlobalNativeWindow | null {
  return typeof window !== 'undefined' ? (window as GlobalNativeWindow) : null;
}

export function getAndroidNativePlugin(): AndroidPhysioRecordPlugin | null {
  const w = getGlobalWindow();
  return w?.Capacitor?.Plugins?.PhysioRecordNative ?? null;
}

export function getElectronDesktopBridge(): ElectronDesktopBridge | null {
  const w = getGlobalWindow();
  return w?.electronAPI?.isElectron ? w.electronAPI : null;
}

export function isElectronDesktop(): boolean {
  const w = getGlobalWindow();
  if (w?.electronAPI?.isElectron) return true;
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_APP_TARGET === 'desktop') {
    return true;
  }
  return false;
}

export function isNativeAndroid(): boolean {
  const w = getGlobalWindow();
  if (w?.Capacitor?.getPlatform?.() === 'android') return true;
  if (w?.Capacitor?.isNativePlatform?.() === true && !isElectronDesktop()) return true;
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_APP_TARGET === 'android') {
    return true;
  }
  return false;
}

export function isNativeAppShell(): boolean {
  return isNativeAndroid() || isElectronDesktop();
}

export function getAppRuntimeTarget(): AppRuntimeTarget {
  if (isElectronDesktop()) return 'desktop';
  if (isNativeAndroid()) return 'android';
  return 'web';
}

export async function getAndroidAppVersionInfo(): Promise<{
  packageName: string;
  versionName: string;
  versionCode: number;
} | null> {
  const androidPlugin = getAndroidNativePlugin();
  if (!androidPlugin?.getAppVersionInfo) return null;
  try {
    return await androidPlugin.getAppVersionInfo();
  } catch {
    return null;
  }
}

/**
 * Deterministic monotonic Android versionCode from semver.
 * Note: Because v1.0.0 (10000) and v1.1.0 (10100) were already published,
 * any 0.x.y tag is offset above 10100 so Android never rejects it with
 * INSTALL_FAILED_VERSION_DOWNGRADE ("Package appears to be invalid").
 */
export function computeAndroidVersionCode(semver: string): number {
  const clean = String(semver || '1.0.0').trim().split('-')[0];
  const parts = clean.split('.').map((p) => Number.parseInt(p, 10));
  const major = Number.isFinite(parts[0]) ? parts[0] : 1;
  const minor = Number.isFinite(parts[1]) ? parts[1] : 0;
  const patch = Number.isFinite(parts[2]) ? parts[2] : 0;
  if (major === 0) {
    return 10100 + minor * 100 + patch;
  }
  return major * 10000 + minor * 100 + patch;
}

/**
 * Detect whether an IndexedDB / Dexie open failure is caused by opening a newer
 * schema version database with an older application binary (Downgrade VersionError).
 * Prevents falsely treating the vault as uninitialized (`isInitialized = false`).
 */
export interface DexieSchemaDowngradeInfo {
  isDowngrade: true;
  message: string;
}

export function detectDexieSchemaDowngradeError(
  err: unknown
): DexieSchemaDowngradeInfo | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as {
    name?: string;
    message?: string;
    inner?: { name?: string; message?: string };
  };
  const name = e.name || '';
  const innerName = e.inner?.name || '';
  const combinedMsg = `${e.message || ''} ${e.inner?.message || ''}`.trim();

  if (
    name === 'VersionError' ||
    innerName === 'VersionError' ||
    /less than the existing version|requested version .* is less than/i.test(combinedMsg)
  ) {
    return {
      isDowngrade: true,
      message:
        combinedMsg ||
        'Database schema version on disk is newer than this application version.',
    };
  }
  return null;
}

/**
 * Save a text/JSON/CSV/ICS/HTML/ptbackup file across Web, Android (SAF / Share), and Windows (Electron IPC).
 */
export async function saveTextFilePortable(params: {
  filename: string;
  content: string;
  mimeType?: string;
  description?: string;
  extensions?: string[];
}): Promise<{
  method: 'electron-dialog' | 'android-saf' | 'android-share' | 'web-download';
  confirmedSaved: boolean;
  filename: string;
}> {
  const mimeType = params.mimeType || 'application/octet-stream';

  // 1. Windows Electron Desktop native save dialog
  const electronBridge = getElectronDesktopBridge();
  if (electronBridge?.saveFile) {
    const res = await electronBridge.saveFile({
      filename: params.filename,
      content: params.content,
      mimeType,
      description: params.description,
      extensions: params.extensions,
    });
    if (res.cancelled) {
      const abortErr = new Error('Save cancelled by user');
      abortErr.name = 'AbortError';
      throw abortErr;
    }
    if (res.saved) {
      return {
        method: 'electron-dialog',
        confirmedSaved: true,
        filename: res.filename || params.filename,
      };
    }
  }

  // 2. Android Capacitor native Storage Access Framework (ACTION_CREATE_DOCUMENT)
  const androidPlugin = getAndroidNativePlugin();
  if (androidPlugin?.saveFileToDevice) {
    try {
      const res = await androidPlugin.saveFileToDevice({
        filename: params.filename,
        content: params.content,
        mimeType,
      });
      if (res.cancelled) {
        const abortErr = new Error('Save cancelled by user');
        abortErr.name = 'AbortError';
        throw abortErr;
      }
      if (res.saved) {
        return {
          method: 'android-saf',
          confirmedSaved: true,
          filename: res.filename || params.filename,
        };
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw err;
      }
      // If SAF is unavailable on a custom ROM, fall back to native Android Share sheet
    }
  }

  if (androidPlugin?.shareFile) {
    const shared = await androidPlugin.shareFile({
      filename: params.filename,
      content: params.content,
      mimeType,
      title: params.filename,
    });
    if (shared.shared) {
      return {
        method: 'android-share',
        confirmedSaved: true,
        filename: params.filename,
      };
    }
  }

  // 3. Standard Web Browser download fallback
  if (typeof document !== 'undefined' && typeof Blob !== 'undefined') {
    const blob = new Blob([params.content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = params.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return {
    method: 'web-download',
    confirmedSaved: false,
    filename: params.filename,
  };
}

/**
 * Share a generated file (such as .ptbackup, .html document, .ics calendar) via native Android Share Sheet
 * if running inside Android Capacitor.
 */
export async function shareGeneratedFileOnAndroid(params: {
  filename: string;
  content: string;
  mimeType: string;
  title?: string;
  text?: string;
}): Promise<boolean> {
  const androidPlugin = getAndroidNativePlugin();
  if (!androidPlugin?.shareFile) return false;
  try {
    const res = await androidPlugin.shareFile(params);
    return Boolean(res.shared);
  } catch {
    return false;
  }
}

/**
 * Trigger print / Save as PDF across Web (`window.print`), Android (`PrintManager`), and Windows (`webContents.print`).
 */
export async function triggerPlatformPrint(jobName = 'PhysioRecord_Document'): Promise<void> {
  const androidPlugin = getAndroidNativePlugin();
  if (androidPlugin?.printCurrentPage) {
    await androidPlugin.printCurrentPage({ jobName });
    return;
  }

  const electronBridge = getElectronDesktopBridge();
  if (electronBridge?.printCurrentPage) {
    await electronBridge.printCurrentPage({ jobName });
    return;
  }

  if (typeof window !== 'undefined' && typeof window.print === 'function') {
    window.print();
  }
}

/**
 * Export the current printable sheet directly to a PDF file on Windows Electron (`webContents.printToPDF`).
 */
export async function exportPlatformPdfDirect(
  suggestedName = 'PhysioRecord_Document.pdf'
): Promise<boolean> {
  const electronBridge = getElectronDesktopBridge();
  if (!electronBridge?.exportCurrentPageToPdf) return false;
  const res = await electronBridge.exportCurrentPageToPdf({
    suggestedName: suggestedName.endsWith('.pdf') ? suggestedName : `${suggestedName}.pdf`,
  });
  return Boolean(res.saved);
}

/**
 * Manually sync published releases from the official GitHub repository (`Hhi5/physiorecord`).
 * Strictly user-initiated opt-in only — never runs automatically in the background.
 * Works across Windows Electron (Main Process IPC), Android (native Java HttpURLConnection), and Web.
 */
export async function fetchOfficialGitHubReleases(): Promise<{
  ok: boolean;
  releases: SyncedGithubReleaseItem[];
  error?: string;
}> {
  // 1. Windows Electron Desktop (runs in Main Process so renderer keeps `connect-src 'none'`)
  const electronBridge = getElectronDesktopBridge();
  if (electronBridge?.fetchGithubReleases) {
    try {
      const res = await electronBridge.fetchGithubReleases();
      if (res?.ok && Array.isArray(res.releases)) {
        return {
          ok: true,
          releases: normalizeGithubReleasesPayload(res.releases),
        };
      }
      return {
        ok: false,
        releases: [],
        error: res?.error || 'Could not sync releases from GitHub.',
      };
    } catch (err) {
      return {
        ok: false,
        releases: [],
        error: err instanceof Error ? err.message : 'Could not sync releases from GitHub.',
      };
    }
  }

  // 2. Native Android APK (runs via Java native plugin off UI thread)
  const androidPlugin = getAndroidNativePlugin();
  if (androidPlugin?.fetchGitHubReleases) {
    try {
      const res = await androidPlugin.fetchGitHubReleases();
      if (res?.ok && res.releasesJson) {
        const parsed = JSON.parse(res.releasesJson) as unknown;
        return {
          ok: true,
          releases: normalizeGithubReleasesPayload(parsed),
        };
      }
    } catch (err) {
      return {
        ok: false,
        releases: [],
        error: err instanceof Error ? err.message : 'Could not sync releases from GitHub.',
      };
    }
  }

  // 3. Web / PWA browser (opt-in fetch permitted to api.github.com)
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 8000) : null;
    try {
      const response = await fetch(OFFICIAL_GITHUB_RELEASES_API_URL, {
        method: 'GET',
        headers: {
          Accept: 'application/vnd.github+json',
        },
        signal: controller?.signal,
      });
      if (!response.ok) {
        return {
          ok: false,
          releases: [],
          error: `GitHub API returned HTTP ${response.status}`,
        };
      }
      const data = (await response.json()) as unknown;
      return {
        ok: true,
        releases: normalizeGithubReleasesPayload(data),
      };
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId);
    }
  } catch (err) {
    return {
      ok: false,
      releases: [],
      error: err instanceof Error ? err.message : 'Network error syncing GitHub Releases.',
    };
  }
}

/**
 * Open an allowed external URL (WhatsApp, Google Maps, official GitHub repo/releases)
 * safely outside the app WebView/Electron window.
 */
export async function openSafeExternalUrl(url: string): Promise<boolean> {
  if (!isAllowedExternalActionUrl(url)) {
    return false;
  }

  const electronBridge = getElectronDesktopBridge();
  if (electronBridge?.openExternalUrl) {
    const res = await electronBridge.openExternalUrl({ url });
    return Boolean(res.opened);
  }

  const androidPlugin = getAndroidNativePlugin();
  if (androidPlugin?.openExternalUrl) {
    const res = await androidPlugin.openExternalUrl({ url });
    return Boolean(res.opened);
  }

  if (typeof window !== 'undefined' && typeof window.open === 'function') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
  }
  return false;
}

let externalInterceptorInstalled = false;

/**
 * Intercepts anchor clicks on allowlisted external URLs (WhatsApp, Google Maps, GitHub Repo/Releases)
 * when running inside Android Capacitor APK or Windows Electron EXE so they open in the OS
 * handler / browser cleanly instead of opening inside the offline WebView.
 */
export function installNativeExternalLinkInterceptor(): void {
  if (externalInterceptorInstalled || typeof document === 'undefined') return;
  if (!isNativeAppShell()) return;
  externalInterceptorInstalled = true;

  document.addEventListener(
    'click',
    (event) => {
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute('href') || '';
      if (!href || href === '#') return;

      if (isAllowedExternalActionUrl(href)) {
        event.preventDefault();
        void openSafeExternalUrl(href);
      }
    },
    true
  );
}
