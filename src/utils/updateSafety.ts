// =======================================================================
// PhysioRecord — Pure Update Safety, Semver Comparison & Asset Selection
// Zero network side effects; decoupled for deterministic unit testing.
// =======================================================================

export const OFFICIAL_GITHUB_REPO = 'Hhi5/physiorecord';
export const OFFICIAL_GITHUB_REPO_URL = `https://github.com/${OFFICIAL_GITHUB_REPO}`;
export const OFFICIAL_RELEASES_URL = `${OFFICIAL_GITHUB_REPO_URL}/releases`;
export const OFFICIAL_LATEST_RELEASE_URL = `${OFFICIAL_RELEASES_URL}/latest`;
export const OFFICIAL_GITHUB_RELEASES_API_URL = `https://api.github.com/repos/${OFFICIAL_GITHUB_REPO}/releases?per_page=10`;
export const SYNCED_RELEASES_CACHE_KEY = 'physiorecord_synced_github_releases_v1';
export const AUTO_UPDATE_CHECK_PREF_KEY = 'physiorecord_auto_update_check_v1';
export const DISMISSED_UPDATE_TAG_KEY = 'physiorecord_dismissed_update_tag_v1';
export const GITHUB_RELEASES_UPDATED_EVENT = 'physiorecord-github-releases-updated';
export const AUTO_UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

export type UpdateRuntimeTarget = 'web' | 'android' | 'desktop';

export interface GitHubReleaseAssetLike {
  name?: string;
  browser_download_url?: string;
  size?: number;
}

export interface SyncedGithubReleaseAsset {
  name: string;
  downloadUrl: string;
  sizeBytes?: number;
}

export interface SyncedGithubReleaseItem {
  id: number;
  tagName: string;
  version: string;
  name: string;
  body: string;
  publishedAt?: string;
  htmlUrl: string;
  isPrerelease: boolean;
  assets: SyncedGithubReleaseAsset[];
}

export interface CachedSyncedGithubReleases {
  releases: SyncedGithubReleaseItem[];
  syncedAt: string;
}

export interface SelectedReleaseAsset {
  fileName: string;
  downloadUrl: string;
  sizeBytes?: number;
  kind: 'apk' | 'windows-setup' | 'windows-portable' | 'web-zip';
}

export interface BackupRecencyAssessment {
  hasBackup: boolean;
  isRecent: boolean;
  daysSinceBackup: number | null;
  status: 'recent' | 'stale' | 'none';
  lastBackupDateLabel: string | null;
}

/**
 * Normalize a semantic version string (strip leading `v` and prerelease suffix)
 * into `[major, minor, patch]` integers.
 */
export function parseSemverTriplet(versionStr: string): [number, number, number] {
  const clean = String(versionStr || '0.0.0')
    .trim()
    .replace(/^v/i, '')
    .split('-')[0]
    .split('+')[0];
  const parts = clean.split('.').map((part) => {
    const parsed = Number.parseInt(part, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  });
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

/**
 * Compare two semantic versions. Returns:
 * - `1` when `a > b`
 * - `-1` when `a < b`
 * - `0` when equal
 */
export function compareSemverVersions(a: string, b: string): -1 | 0 | 1 {
  const va = parseSemverTriplet(a);
  const vb = parseSemverTriplet(b);
  for (let i = 0; i < 3; i += 1) {
    if (va[i] > vb[i]) return 1;
    if (va[i] < vb[i]) return -1;
  }
  return 0;
}

/**
 * Strictly allowlist official PhysioRecord release URLs (releases page, tag, latest, or download asset)
 * so native external-browser launchers never open untrusted third-party domains.
 */
export function isAllowedGithubReleaseUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  return /^https:\/\/github\.com\/Hhi5\/physiorecord\/releases(\/(latest|tag\/[^\s?#]+|download\/[^\s?#]+))?(\?[^\s#]*)?$/i.test(
    trimmed
  );
}

/**
 * Allowlists both the official PhysioRecord GitHub repository root URL
 * (`https://github.com/Hhi5/physiorecord`) and official release/download URLs.
 */
export function isAllowedOfficialGithubUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (isAllowedGithubReleaseUrl(trimmed)) return true;
  return /^https:\/\/github\.com\/Hhi5\/physiorecord\/?(\?[^\s#]*)?(#[^\s]*)?$/i.test(trimmed);
}

/**
 * Normalize GitHub REST API `/repos/Hhi5/physiorecord/releases` (or single release object)
 * into clean, strictly validated, semver-sorted release cards.
 */
export function normalizeGithubReleasesPayload(raw: unknown): SyncedGithubReleaseItem[] {
  const rawList = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : [];
  const items: SyncedGithubReleaseItem[] = [];

  for (let i = 0; i < rawList.length; i += 1) {
    const entry = rawList[i] as Record<string, unknown> | null;
    if (!entry || typeof entry !== 'object') continue;
    if (entry.draft === true) continue;

    const tagName = String(entry.tag_name ?? entry.tagName ?? '').trim();
    const version = tagName.replace(/^v/i, '').trim();
    if (!tagName && !version) continue;

    const rawHtmlUrl = String(entry.html_url ?? entry.htmlUrl ?? '').trim();
    const htmlUrl = isAllowedGithubReleaseUrl(rawHtmlUrl) ? rawHtmlUrl : OFFICIAL_RELEASES_URL;

    const rawName = String(entry.name ?? '').trim();
    const name = rawName || tagName || `v${version}`;
    const body = String(entry.body ?? '')
      .replace(/\r\n/g, '\n')
      .trim()
      .slice(0, 6000);
    const publishedAtRaw = String(entry.published_at ?? entry.publishedAt ?? '').trim();
    const publishedAt = publishedAtRaw || undefined;

    const rawAssets = Array.isArray(entry.assets) ? entry.assets : [];
    const assets: SyncedGithubReleaseAsset[] = [];
    for (const a of rawAssets) {
      if (!a || typeof a !== 'object') continue;
      const assetObj = a as Record<string, unknown>;
      const assetName = String(assetObj.name ?? '').trim();
      const downloadUrl = String(
        assetObj.browser_download_url ?? assetObj.downloadUrl ?? ''
      ).trim();
      if (!assetName || !isAllowedGithubReleaseUrl(downloadUrl)) continue;
      const rawSize = assetObj.size ?? assetObj.sizeBytes;
      const sizeBytes =
        typeof rawSize === 'number' && Number.isFinite(rawSize) && rawSize > 0
          ? rawSize
          : undefined;
      assets.push({ name: assetName, downloadUrl, sizeBytes });
    }

    const rawId = entry.id;
    const id = typeof rawId === 'number' && Number.isFinite(rawId) ? rawId : i + 1;

    items.push({
      id,
      tagName: tagName || `v${version}`,
      version: version || tagName,
      name,
      body,
      publishedAt,
      htmlUrl,
      isPrerelease: Boolean(entry.prerelease ?? entry.isPrerelease),
      assets,
    });
  }

  return items.sort((a, b) => {
    const semverDiff = compareSemverVersions(b.version, a.version);
    if (semverDiff !== 0) return semverDiff;
    const dateA = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const dateB = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return (Number.isFinite(dateB) ? dateB : 0) - (Number.isFinite(dateA) ? dateA : 0);
  });
}

/**
 * Convert GitHub Release Markdown body into clean, readable text lines
 * without exposing raw Markdown syntax clutter in the UI.
 */
export function extractReleaseNotesLines(body: string): string[] {
  if (!body || !String(body).trim()) return [];
  const lines = String(body)
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^---+$/.test(line));

  const cleaned: string[] = [];
  for (const rawLine of lines) {
    // Strip Markdown links [label](url) -> label, bold/code wrappers, headings, bullet prefixes
    const stripped = rawLine
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1')
      .replace(/^#{1,6}\s+/, '')
      .replace(/^[-*•+]\s+/, '')
      .replace(/^\d+[.)]\s+/, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .trim();
    if (stripped) {
      cleaned.push(stripped);
    }
  }
  return cleaned;
}

export function loadCachedGithubReleases(): CachedSyncedGithubReleases | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(SYNCED_RELEASES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { releases?: unknown; syncedAt?: unknown };
    const releases = normalizeGithubReleasesPayload(parsed?.releases);
    if (releases.length === 0) return null;
    const syncedAt =
      typeof parsed?.syncedAt === 'string' && parsed.syncedAt.trim()
        ? parsed.syncedAt
        : new Date().toISOString();
    return { releases, syncedAt };
  } catch {
    return null;
  }
}

export function saveCachedGithubReleases(
  releases: SyncedGithubReleaseItem[],
  syncedAt: string = new Date().toISOString()
): CachedSyncedGithubReleases {
  const normalized = normalizeGithubReleasesPayload(releases);
  const payload: CachedSyncedGithubReleases = { releases: normalized, syncedAt };
  try {
    if (typeof window !== 'undefined' && window.localStorage && normalized.length > 0) {
      window.localStorage.setItem(SYNCED_RELEASES_CACHE_KEY, JSON.stringify(payload));
    }
  } catch {
    // Ignore storage quota errors
  }
  return payload;
}

/**
 * Pick the safest in-place upgrade installer asset from a GitHub Release assets array:
 * - `android`: signed `.apk` (strictly prefers non-debug APK if multiple exist)
 * - `desktop`: Windows `Setup-*.exe` (preserves `%APPDATA%\PhysioRecord` in-place), falling back to `.exe`
 * - `web`: `Web-PWA-*.zip` bundle
 */
export function selectPlatformReleaseAsset(
  assets: readonly (GitHubReleaseAssetLike | SyncedGithubReleaseAsset)[] | undefined | null,
  target: UpdateRuntimeTarget
): SelectedReleaseAsset | null {
  if (!Array.isArray(assets) || assets.length === 0) return null;

  const valid = assets
    .map((item) => {
      const a = item as GitHubReleaseAssetLike & Partial<SyncedGithubReleaseAsset>;
      return {
        name: typeof a?.name === 'string' ? a.name.trim() : '',
        url:
          typeof a?.browser_download_url === 'string'
            ? a.browser_download_url
            : typeof a?.downloadUrl === 'string'
              ? a.downloadUrl
              : '',
        size:
          typeof a?.size === 'number'
            ? a.size
            : typeof a?.sizeBytes === 'number'
              ? a.sizeBytes
              : undefined,
      };
    })
    .filter((item) => item.name.length > 0 && item.url.startsWith('https://'));
  if (valid.length === 0) return null;

  if (target === 'android') {
    const apks = valid.filter((a) => a.name.toLowerCase().endsWith('.apk'));
    if (apks.length === 0) return null;
    const signedReleaseApk =
      apks.find((a) => !a.name.toLowerCase().includes('-debug')) || apks[0];
    return {
      fileName: signedReleaseApk.name,
      downloadUrl: signedReleaseApk.url,
      sizeBytes: signedReleaseApk.size,
      kind: 'apk',
    };
  }

  if (target === 'desktop') {
    const exes = valid.filter((a) => a.name.toLowerCase().endsWith('.exe'));
    if (exes.length === 0) return null;
    const setupExe = exes.find((a) => /setup/i.test(a.name));
    if (setupExe) {
      return {
        fileName: setupExe.name,
        downloadUrl: setupExe.url,
        sizeBytes: setupExe.size,
        kind: 'windows-setup',
      };
    }
    const portableExe = exes.find((a) => /portable/i.test(a.name)) || exes[0];
    return {
      fileName: portableExe.name,
      downloadUrl: portableExe.url,
      sizeBytes: portableExe.size,
      kind: /portable/i.test(portableExe.name) ? 'windows-portable' : 'windows-setup',
    };
  }

  const webZip = valid.find(
    (a) => a.name.toLowerCase().endsWith('.zip') && /pwa|web/i.test(a.name)
  );
  if (!webZip) return null;
  return {
    fileName: webZip.name,
    downloadUrl: webZip.url,
    sizeBytes: webZip.size,
    kind: 'web-zip',
  };
}

/**
 * Evaluate how recently an encrypted `.ptbackup` was created before running an update.
 * Backups within the last 7 days are marked `recent`; older backups are `stale`; missing are `none`.
 */
export function evaluateBackupRecencyForUpdate(
  lastBackupAt?: string | null,
  nowMs: number = Date.now()
): BackupRecencyAssessment {
  if (!lastBackupAt || !String(lastBackupAt).trim()) {
    return {
      hasBackup: false,
      isRecent: false,
      daysSinceBackup: null,
      status: 'none',
      lastBackupDateLabel: null,
    };
  }

  const parsedMs = Date.parse(lastBackupAt);
  if (!Number.isFinite(parsedMs)) {
    return {
      hasBackup: false,
      isRecent: false,
      daysSinceBackup: null,
      status: 'none',
      lastBackupDateLabel: null,
    };
  }

  const diffMs = Math.max(0, nowMs - parsedMs);
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  const isRecent = days <= 7;
  return {
    hasBackup: true,
    isRecent,
    daysSinceBackup: days,
    status: isRecent ? 'recent' : 'stale',
    lastBackupDateLabel: new Date(parsedMs).toISOString().slice(0, 10),
  };
}

/**
 * Automatic GitHub release check preference.
 * Enabled by default so users receive in-app update notifications whenever a
 * newer GitHub release is published; users can disable it anytime in Settings → Security.
 */
export function isAutoUpdateCheckEnabled(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return true;
    return window.localStorage.getItem(AUTO_UPDATE_CHECK_PREF_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setAutoUpdateCheckEnabled(enabled: boolean): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(AUTO_UPDATE_CHECK_PREF_KEY, enabled ? 'true' : 'false');
      window.dispatchEvent(new CustomEvent(GITHUB_RELEASES_UPDATED_EVENT));
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function getDismissedUpdateTag(): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const tag = window.localStorage.getItem(DISMISSED_UPDATE_TAG_KEY);
    return tag && tag.trim() ? tag.trim() : null;
  } catch {
    return null;
  }
}

export function dismissUpdateTag(tagName: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage && tagName.trim()) {
      window.localStorage.setItem(DISMISSED_UPDATE_TAG_KEY, tagName.trim());
      window.dispatchEvent(new CustomEvent(GITHUB_RELEASES_UPDATED_EVENT));
    }
  } catch {
    // Ignore storage errors
  }
}

export function notifyGithubReleasesUpdated(): void {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(GITHUB_RELEASES_UPDATED_EVENT));
    }
  } catch {
    // Ignore event dispatch errors
  }
}

/**
 * Pure predicate deciding whether a background auto-check should run now.
 */
export function shouldRunAutoUpdateCheck(params: {
  enabled: boolean;
  lastSyncedAt?: string | null;
  nowMs?: number;
  intervalMs?: number;
}): boolean {
  if (!params.enabled) return false;
  if (!params.lastSyncedAt) return true;
  const parsedMs = Date.parse(params.lastSyncedAt);
  if (!Number.isFinite(parsedMs)) return true;
  const now = params.nowMs ?? Date.now();
  const interval = params.intervalMs ?? AUTO_UPDATE_CHECK_INTERVAL_MS;
  return now - parsedMs >= interval;
}

/**
 * Pure resolver returning the newest non-prerelease GitHub release that is newer than
 * `currentAppVersion` and has not been dismissed by the user.
 */
export function getPendingUpdateNotification(params: {
  releases: readonly SyncedGithubReleaseItem[] | null | undefined;
  currentAppVersion: string;
  dismissedTag?: string | null;
}): SyncedGithubReleaseItem | null {
  if (!Array.isArray(params.releases) || params.releases.length === 0) return null;
  const stable = params.releases.find((r) => !r.isPrerelease) ?? params.releases[0];
  if (!stable) return null;
  if (compareSemverVersions(stable.version, params.currentAppVersion) <= 0) {
    return null;
  }
  const dismissed = (params.dismissedTag || '').trim().toLowerCase();
  if (dismissed && stable.tagName.trim().toLowerCase() === dismissed) {
    return null;
  }
  return stable;
}

