// =======================================================================
// PhysioRecord — Pure Update Safety, Semver Comparison & Asset Selection
// Zero network side effects; decoupled for deterministic unit testing.
// =======================================================================

export const OFFICIAL_GITHUB_REPO = 'Hhi5/physiorecord';
export const OFFICIAL_RELEASES_URL = `https://github.com/${OFFICIAL_GITHUB_REPO}/releases`;
export const OFFICIAL_LATEST_RELEASE_URL = `${OFFICIAL_RELEASES_URL}/latest`;

export type UpdateRuntimeTarget = 'web' | 'android' | 'desktop';

export interface GitHubReleaseAssetLike {
  name?: string;
  browser_download_url?: string;
  size?: number;
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
 * Strictly allowlist official GitHub Release URLs (releases page, tag, latest, or download asset)
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
 * Pick the safest in-place upgrade installer asset from a GitHub Release assets array:
 * - `android`: signed `.apk` (strictly prefers non-debug APK if multiple exist)
 * - `desktop`: Windows `Setup-*.exe` (preserves `%APPDATA%\PhysioRecord` in-place), falling back to `.exe`
 * - `web`: `Web-PWA-*.zip` bundle
 */
export function selectPlatformReleaseAsset(
  assets: readonly GitHubReleaseAssetLike[] | undefined | null,
  target: UpdateRuntimeTarget
): SelectedReleaseAsset | null {
  if (!Array.isArray(assets) || assets.length === 0) return null;

  const valid = assets.filter(
    (item): item is { name: string; browser_download_url: string; size?: number } =>
      typeof item?.name === 'string' &&
      item.name.trim().length > 0 &&
      typeof item?.browser_download_url === 'string' &&
      item.browser_download_url.startsWith('https://')
  );
  if (valid.length === 0) return null;

  if (target === 'android') {
    const apks = valid.filter((a) => a.name.toLowerCase().endsWith('.apk'));
    if (apks.length === 0) return null;
    const signedReleaseApk =
      apks.find((a) => !a.name.toLowerCase().includes('-debug')) || apks[0];
    return {
      fileName: signedReleaseApk.name,
      downloadUrl: signedReleaseApk.browser_download_url,
      sizeBytes: typeof signedReleaseApk.size === 'number' ? signedReleaseApk.size : undefined,
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
        downloadUrl: setupExe.browser_download_url,
        sizeBytes: typeof setupExe.size === 'number' ? setupExe.size : undefined,
        kind: 'windows-setup',
      };
    }
    const portableExe = exes.find((a) => /portable/i.test(a.name)) || exes[0];
    return {
      fileName: portableExe.name,
      downloadUrl: portableExe.browser_download_url,
      sizeBytes: typeof portableExe.size === 'number' ? portableExe.size : undefined,
      kind: /portable/i.test(portableExe.name) ? 'windows-portable' : 'windows-setup',
    };
  }

  const webZip = valid.find(
    (a) => a.name.toLowerCase().endsWith('.zip') && /pwa|web/i.test(a.name)
  );
  if (!webZip) return null;
  return {
    fileName: webZip.name,
    downloadUrl: webZip.browser_download_url,
    sizeBytes: typeof webZip.size === 'number' ? webZip.size : undefined,
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
