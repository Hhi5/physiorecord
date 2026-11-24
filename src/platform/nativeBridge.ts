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
  openFileFromDevice?: (options?: {
    mimeType?: string;
  }) => Promise<{
    opened: boolean;
    cancelled?: boolean;
    filename?: string;
    content?: string;
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
  startGoogleDriveOAuth?: (options: {
    clientId: string;
    clientSecret?: string;
    scope?: string;
  }) => Promise<{
    accessToken: string;
    email?: string;
    displayName?: string;
    photoURL?: string;
  }>;
  getGoogleDriveSession?: () => Promise<{
    signedIn: boolean;
    email?: string;
    displayName?: string;
    photoURL?: string;
  }>;
  refreshGoogleDriveToken?: (options: {
    clientId: string;
    clientSecret?: string;
  }) => Promise<{
    accessToken: string;
    email?: string;
    displayName?: string;
    photoURL?: string;
  }>;
  clearGoogleDriveSession?: () => Promise<{
    cleared: boolean;
  }>;
  lanSyncExchange?: (options: {
    serverUrl: string;
    pairingToken: string;
    bodyJson: string;
  }) => Promise<{
    ok: boolean;
    status: number;
    responseJson?: string;
    networkError?: boolean;
    error?: string;
  }>;
  isBiometricAvailable?: () => Promise<{
    available: boolean;
    status: string;
    enrolled: boolean;
  }>;
  hasBiometricDek?: () => Promise<{
    enrolled: boolean;
  }>;
  enrollBiometricDek?: (options: {
    dekBase64: string;
    title?: string;
    subtitle?: string;
    negativeLabel?: string;
  }) => Promise<{
    enrolled: boolean;
  }>;
  unlockBiometricDek?: (options?: {
    title?: string;
    subtitle?: string;
    negativeLabel?: string;
  }) => Promise<{
    dekBase64: string;
  }>;
  clearBiometricDek?: () => Promise<{
    cleared: boolean;
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
  copyText?: (text: string) => Promise<{
    copied: boolean;
  }>;
  setTitleBarTheme?: (options: { isDark: boolean }) => Promise<boolean>;
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
    firewallAllowed?: boolean;
    error?: string;
  }>;
  stopLanSyncHub?: () => Promise<{ running: boolean }>;
  getLanSyncHubStatus?: () => Promise<{
    running: boolean;
    port: number;
    urls: string[];
    pairingToken: string;
    storedDevicesCount: number;
    firewallAllowed?: boolean;
  }>;
  allowLanSyncFirewall?: () => Promise<{
    allowed: boolean;
    alreadyConfigured?: boolean;
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
  startGoogleDriveOAuth?: (options: {
    clientId: string;
    clientSecret?: string;
    scope?: string;
  }) => Promise<{
    accessToken: string;
    email?: string;
    displayName?: string;
    photoURL?: string;
  }>;
  getGoogleDriveSession?: () => Promise<{
    signedIn: boolean;
    email?: string;
    displayName?: string;
    photoURL?: string;
  }>;
  refreshGoogleDriveToken?: (options: {
    clientId: string;
    clientSecret?: string;
  }) => Promise<{
    accessToken: string;
    email?: string;
    displayName?: string;
    photoURL?: string;
  }>;
  clearGoogleDriveSession?: () => Promise<{
    cleared: boolean;
  }>;
  googleDriveApiRequest?: (options: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }) => Promise<{
    ok: boolean;
    status: number;
    text: string;
    contentLength?: number;
  }>;
  pickSyncDirectory?: () => Promise<{
    configured: boolean;
    cancelled?: boolean;
    folderPath?: string;
    folderName?: string;
  }>;
  getConfiguredSyncDirectory?: () => Promise<{
    configured: boolean;
    folderPath?: string;
    folderName?: string;
  }>;
  clearConfiguredSyncDirectory?: () => Promise<void>;
  exchangeSyncFolderEnvelopes?: (options: {
    localEnvelope: unknown;
  }) => Promise<{
    ok: boolean;
    folderName?: string;
    writtenFile?: string;
    peerEnvelopes?: unknown[];
    error?: string;
  }>;
  isOsBiometricAvailable?: () => Promise<{
    available: boolean;
    status: string;
    enrolled: boolean;
  }>;
  enrollOsBiometricDek?: (options: {
    dekBase64: string;
  }) => Promise<{
    enrolled: boolean;
  }>;
  unlockOsBiometricDek?: () => Promise<{
    dekBase64: string;
  }>;
  clearOsBiometricDek?: () => Promise<{
    cleared: boolean;
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
  return typeof import.meta !== 'undefined' && import.meta.env?.VITE_APP_TARGET === 'desktop';
}

export function isNativeAndroid(): boolean {
  const w = getGlobalWindow();
  if (w?.Capacitor?.getPlatform?.() === 'android') return true;
  if (w?.Capacitor?.isNativePlatform?.() === true && !isElectronDesktop()) return true;
  return typeof import.meta !== 'undefined' && import.meta.env?.VITE_APP_TARGET === 'android';
}

export function isNativeAppShell(): boolean {
  return isNativeAndroid() || isElectronDesktop();
}

export function getAppRuntimeTarget(): AppRuntimeTarget {
  if (isElectronDesktop()) return 'desktop';
  if (isNativeAndroid()) return 'android';
  return 'web';
}

export type DeviceFormFactor = 'desktop' | 'tablet' | 'mobile';

export function getDeviceFormFactor(): DeviceFormFactor {
  if (isElectronDesktop()) return 'desktop';

  const w = getGlobalWindow() as (GlobalNativeWindow & { navigator?: Navigator }) | null;
  const nav = w?.navigator ?? (typeof navigator !== 'undefined' ? navigator : null);
  const ua = nav?.userAgent || '';
  const maxTouchPoints = typeof nav?.maxTouchPoints === 'number' ? nav.maxTouchPoints : 0;
  const innerW = typeof w?.innerWidth === 'number' ? w.innerWidth : 0;
  const innerH = typeof w?.innerHeight === 'number' ? w.innerHeight : 0;

  if (isNativeAndroid()) {
    if (/\bMobile\b/i.test(ua)) return 'mobile';
    if (innerW > 0 && innerH > 0 && Math.min(innerW, innerH) >= 600) {
      return 'tablet';
    }
    if (ua && !/\bMobile\b/i.test(ua) && innerW >= 768) {
      return 'tablet';
    }
    return 'mobile';
  }

  if (/\b(iPhone|iPod)\b/i.test(ua)) return 'mobile';
  if (/\biPad\b/i.test(ua) || (/\bMacintosh\b/i.test(ua) && maxTouchPoints > 1)) {
    return 'tablet';
  }
  if (/\bAndroid\b/i.test(ua)) {
    return /\bMobile\b/i.test(ua) ? 'mobile' : 'tablet';
  }
  if (/\b(Tablet|PlayBook|Silk|Kindle)\b/i.test(ua)) return 'tablet';
  if (/\b(Mobile|Opera Mini|IEMobile|WPDesktop|BlackBerry|webOS)\b/i.test(ua)) {
    return 'mobile';
  }

  const isCoarsePointer =
    Boolean(w?.matchMedia?.('(pointer: coarse)')?.matches) || maxTouchPoints > 1;
  if (isCoarsePointer && innerW > 0 && innerW <= 1366) {
    return innerW < 768 ? 'mobile' : 'tablet';
  }

  if (innerW > 0 && innerW < 768) {
    return 'mobile';
  }

  return 'desktop';
}

export function isMobileOrTabletDevice(): boolean {
  return getDeviceFormFactor() !== 'desktop';
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

export interface NativeAndroidBiometricStatus {
  supportedBridge: boolean;
  available: boolean;
  status:
    | 'ready'
    | 'none_enrolled'
    | 'no_hardware'
    | 'hw_unavailable'
    | 'security_update_required'
    | 'unavailable';
  enrolled: boolean;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export async function getNativeAndroidBiometricStatus(): Promise<NativeAndroidBiometricStatus> {
  const androidPlugin = getAndroidNativePlugin();
  if (!androidPlugin?.isBiometricAvailable) {
    return {
      supportedBridge: false,
      available: false,
      status: 'unavailable',
      enrolled: false,
    };
  }
  try {
    const res = await androidPlugin.isBiometricAvailable();
    const rawStatus = res?.status;
    const status: NativeAndroidBiometricStatus['status'] =
      rawStatus === 'ready' ||
      rawStatus === 'none_enrolled' ||
      rawStatus === 'no_hardware' ||
      rawStatus === 'hw_unavailable' ||
      rawStatus === 'security_update_required'
        ? rawStatus
        : 'unavailable';
    return {
      supportedBridge: true,
      available: Boolean(res?.available),
      status,
      enrolled: Boolean(res?.enrolled),
    };
  } catch {
    return {
      supportedBridge: true,
      available: false,
      status: 'unavailable',
      enrolled: false,
    };
  }
}

export async function enrollNativeAndroidBiometricDek(
  rawDek: Uint8Array,
  prompt?: { title?: string; subtitle?: string; negativeLabel?: string }
): Promise<boolean> {
  const androidPlugin = getAndroidNativePlugin();
  if (!androidPlugin?.enrollBiometricDek) {
    throw new Error('المصادقة الحيوية الأصلية غير متوفرة في هذا الإصدار.');
  }
  const dekBase64 = bytesToBase64(rawDek);
  const res = await androidPlugin.enrollBiometricDek({
    dekBase64,
    title: prompt?.title,
    subtitle: prompt?.subtitle,
    negativeLabel: prompt?.negativeLabel,
  });
  return Boolean(res?.enrolled);
}

export async function unlockNativeAndroidBiometricDek(prompt?: {
  title?: string;
  subtitle?: string;
  negativeLabel?: string;
}): Promise<Uint8Array> {
  const androidPlugin = getAndroidNativePlugin();
  if (!androidPlugin?.unlockBiometricDek) {
    throw new Error('المصادقة الحيوية الأصلية غير متوفرة في هذا الإصدار.');
  }
  const res = await androidPlugin.unlockBiometricDek({
    title: prompt?.title,
    subtitle: prompt?.subtitle,
    negativeLabel: prompt?.negativeLabel,
  });
  if (!res?.dekBase64) {
    throw new Error('تعذر استرجاع مفتاح التشفير عبر البصمة.');
  }
  const rawDek = base64ToBytes(res.dekBase64);
  if (rawDek.length !== 32) {
    rawDek.fill(0);
    throw new Error('طول مفتاح التشفير المسترجع غير صالح.');
  }
  return rawDek;
}

export async function clearNativeAndroidBiometricDek(): Promise<void> {
  const androidPlugin = getAndroidNativePlugin();
  if (!androidPlugin?.clearBiometricDek) return;
  try {
    await androidPlugin.clearBiometricDek();
  } catch {
    // Non-fatal cleanup
  }
}

export interface DesktopOsBiometricStatus {
  supportedBridge: boolean;
  available: boolean;
  status: 'ready' | 'not-enrolled-os' | 'unavailable';
  enrolled: boolean;
}

export async function getDesktopOsBiometricStatus(): Promise<DesktopOsBiometricStatus> {
  const bridge = getElectronDesktopBridge();
  if (!bridge?.isOsBiometricAvailable) {
    return {
      supportedBridge: false,
      available: false,
      status: 'unavailable',
      enrolled: false,
    };
  }
  try {
    const res = await bridge.isOsBiometricAvailable();
    const status: DesktopOsBiometricStatus['status'] =
      res?.status === 'ready'
        ? 'ready'
        : res?.status === 'not-enrolled-os'
          ? 'not-enrolled-os'
          : 'unavailable';
    return {
      supportedBridge: true,
      available: Boolean(res?.available),
      status,
      enrolled: Boolean(res?.enrolled),
    };
  } catch {
    return {
      supportedBridge: true,
      available: false,
      status: 'unavailable',
      enrolled: false,
    };
  }
}

export async function enrollDesktopOsBiometricDek(rawDek: Uint8Array): Promise<boolean> {
  const bridge = getElectronDesktopBridge();
  if (!bridge?.enrollOsBiometricDek) {
    throw new Error('قفل النظام غير متاح في هذا الإصدار.');
  }
  const dekBase64 = bytesToBase64(rawDek);
  const res = await bridge.enrollOsBiometricDek({ dekBase64 });
  return Boolean(res?.enrolled);
}

export async function unlockDesktopOsBiometricDek(): Promise<Uint8Array> {
  const bridge = getElectronDesktopBridge();
  if (!bridge?.unlockOsBiometricDek) {
    throw new Error('قفل النظام غير متاح في هذا الإصدار.');
  }
  const res = await bridge.unlockOsBiometricDek();
  if (!res?.dekBase64) {
    throw new Error('تعذر استرجاع مفتاح التشفير عبر قفل النظام.');
  }
  const rawDek = base64ToBytes(res.dekBase64);
  if (rawDek.length !== 32) {
    rawDek.fill(0);
    throw new Error('طول مفتاح التشفير المسترجع غير صالح.');
  }
  return rawDek;
}

export async function clearDesktopOsBiometricDek(): Promise<void> {
  const bridge = getElectronDesktopBridge();
  if (!bridge?.clearOsBiometricDek) return;
  try {
    await bridge.clearOsBiometricDek();
  } catch {
    // Non-fatal cleanup
  }
}

/**
 * Deterministic monotonic Android versionCode from semver.
 * Uses a 100000 base offset so every release across 0.x.y, 1.0.x, 1.1.x, and higher
 * is strictly greater than all legacy published codes (1..10102), preventing
 * INSTALL_FAILED_VERSION_DOWNGRADE ("Package appears to be invalid").
 */
export function computeAndroidVersionCode(semver: string): number {
  const clean = String(semver || '1.0.0').trim().replace(/^v/i, '').split('-')[0];
  const parts = clean.split('.').map((p) => Number.parseInt(p, 10));
  const major = Number.isFinite(parts[0]) ? parts[0] : 1;
  const minor = Number.isFinite(parts[1]) ? parts[1] : 0;
  const patch = Number.isFinite(parts[2]) ? parts[2] : 0;
  return 100000 + major * 10000 + minor * 100 + patch;
}

/**
 * Detect whether an IndexedDB / Dexie open failure is caused by opening a newer
 * schema version database with an older application binary (Downgrade VersionError).
 * Prevents falsely treating the vault as uninitialized (`isInitialized = false`).
 */
export interface DexieSchemaDowngradeInfo {
  isDowngrade: true;
  message: string;
  onDiskVersion?: number;
  supportedVersion?: number;
  detectionSource?: 'thrown_version_error' | 'backend_db_version' | 'vault_meta_schema_version';
}

function collectErrorChain(err: unknown): Array<{ name: string; message: string }> {
  const collected: Array<{ name: string; message: string }> = [];
  const visited = new Set<unknown>();
  const queue: unknown[] = [err];

  while (queue.length > 0 && collected.length < 24) {
    const current = queue.shift();
    if (!current || typeof current !== 'object' || visited.has(current)) {
      continue;
    }
    visited.add(current);
    const e = current as {
      name?: unknown;
      message?: unknown;
      inner?: unknown;
      cause?: unknown;
      failures?: unknown;
    };
    collected.push({
      name: typeof e.name === 'string' ? e.name : '',
      message: typeof e.message === 'string' ? e.message : '',
    });
    if (e.inner) queue.push(e.inner);
    if (e.cause) queue.push(e.cause);
    if (Array.isArray(e.failures)) {
      for (const f of e.failures) queue.push(f);
    }
  }
  return collected;
}

export function detectDexieSchemaDowngradeError(
  err: unknown
): DexieSchemaDowngradeInfo | null {
  if (!err || typeof err !== 'object') return null;
  const chain = collectErrorChain(err);
  if (chain.length === 0) return null;

  const hasVersionErrorName = chain.some((item) => item.name === 'VersionError');
  const uniqueMessages = Array.from(
    new Set(chain.map((item) => item.message.trim()).filter(Boolean))
  );
  const combinedMsg = uniqueMessages.join(' ').trim();

  if (
    hasVersionErrorName ||
    /less than the existing version|requested version .* is less than|schema version .* is newer/i.test(
      combinedMsg
    )
  ) {
    const versionMatch = combinedMsg.match(
      /requested version \((\d+)\).*existing version \((\d+)\)/i
    );
    const supportedRaw = versionMatch ? Number.parseInt(versionMatch[1], 10) : undefined;
    const onDiskRaw = versionMatch ? Number.parseInt(versionMatch[2], 10) : undefined;
    return {
      isDowngrade: true,
      message:
        combinedMsg ||
        'Database schema version on disk is newer than this application version.',
      ...(typeof onDiskRaw === 'number' && Number.isFinite(onDiskRaw)
        ? { onDiskVersion: onDiskRaw >= 20 ? Math.round(onDiskRaw / 10) : onDiskRaw }
        : {}),
      ...(typeof supportedRaw === 'number' && Number.isFinite(supportedRaw)
        ? { supportedVersion: supportedRaw >= 20 ? Math.round(supportedRaw / 10) : supportedRaw }
        : {}),
      detectionSource: 'thrown_version_error',
    };
  }
  return null;
}

/**
 * Proactive post-open schema downgrade guard for Dexie 4+.
 *
 * Why this is mandatory:
 * In Dexie 4, opening an existing IndexedDB whose on-disk version (e.g. v11 -> IDB 110)
 * exceeds the app's highest declared `this.version(N)` (e.g. v10 -> IDB 100) does NOT
 * throw `VersionError`. Dexie probes with versionless `indexedDB.open(name)` and silently
 * keeps the newer DB open while reporting `db.verno === N`.
 *
 * Comparing `backendDB().version` (Dexie multiplies version by 10 internally) and
 * `vaultMeta.schemaVersion` against `declaredMaxVersion` catches silent downgrades
 * reliably BEFORE any read/write proceeds.
 */
export function inspectOpenedDatabaseSchemaDowngrade(params: {
  backendVersionRaw?: number | null;
  vaultMetaSchemaVersion?: number | null;
  declaredMaxVersion: number;
  backendStoreNames?: Iterable<string> | null;
  declaredStoreNames?: Iterable<string> | null;
}): DexieSchemaDowngradeInfo | null {
  const {
    backendVersionRaw,
    vaultMetaSchemaVersion,
    declaredMaxVersion,
    backendStoreNames,
    declaredStoreNames,
  } = params;

  const declaredIdbVersion = declaredMaxVersion * 10;

  if (
    typeof backendVersionRaw === 'number' &&
    Number.isFinite(backendVersionRaw) &&
    backendVersionRaw > declaredIdbVersion
  ) {
    const onDiskDexieVersion = Number((backendVersionRaw / 10).toFixed(1));
    const unknownStores: string[] = [];
    if (backendStoreNames && declaredStoreNames) {
      const declaredSet = new Set(declaredStoreNames);
      for (const s of backendStoreNames) {
        if (!declaredSet.has(s)) unknownStores.push(s);
      }
    }
    const extraStoresSuffix =
      unknownStores.length > 0 ? ` (unknown stores: ${unknownStores.join(', ')})` : '';
    return {
      isDowngrade: true,
      onDiskVersion: onDiskDexieVersion,
      supportedVersion: declaredMaxVersion,
      detectionSource: 'backend_db_version',
      message: `On-disk IndexedDB schema v${onDiskDexieVersion} (IDB ${backendVersionRaw}) is newer than this app binary's supported schema v${declaredMaxVersion} (IDB ${declaredIdbVersion})${extraStoresSuffix}.`,
    };
  }

  if (
    typeof vaultMetaSchemaVersion === 'number' &&
    Number.isFinite(vaultMetaSchemaVersion) &&
    vaultMetaSchemaVersion > declaredMaxVersion
  ) {
    return {
      isDowngrade: true,
      onDiskVersion: vaultMetaSchemaVersion,
      supportedVersion: declaredMaxVersion,
      detectionSource: 'vault_meta_schema_version',
      message: `Vault metadata records schema v${vaultMetaSchemaVersion}, which is newer than this app binary's supported schema v${declaredMaxVersion}.`,
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
 * Opens a text/sync file directly via Android Storage Access Framework (ACTION_OPEN_DOCUMENT),
 * allowing reliable selection from Google Drive and all OEM document providers.
 */
export async function openTextFileFromAndroid(mimeType = '*/*'): Promise<{
  opened: boolean;
  cancelled?: boolean;
  filename?: string;
  content?: string;
} | null> {
  const androidPlugin = getAndroidNativePlugin();
  if (!androidPlugin?.openFileFromDevice) return null;
  return await androidPlugin.openFileFromDevice({ mimeType });
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
