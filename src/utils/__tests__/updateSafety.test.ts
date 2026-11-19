import { describe, expect, it } from 'vitest';
import {
  compareSemverVersions,
  evaluateBackupRecencyForUpdate,
  isAllowedGithubReleaseUrl,
  selectPlatformReleaseAsset,
} from '../updateSafety';

describe('updateSafety', () => {
  it('compares semver strings accurately across tag prefixes and numeric segments', () => {
    expect(compareSemverVersions('v1.2.0', '1.1.0')).toBe(1);
    expect(compareSemverVersions('1.1.0', 'v1.1.0')).toBe(0);
    expect(compareSemverVersions('1.0.9', '1.1.0')).toBe(-1);
    expect(compareSemverVersions('v2.1.0-beta.1', '2.0.9')).toBe(1);
  });

  it('selects signed APK on Android and NSIS Setup EXE on Windows over portable/debug assets', () => {
    const assets = [
      {
        name: 'PhysioRecord-Android-Universal-v1.2.0-debug.apk',
        browser_download_url: 'https://github.com/Hhi5/physiorecord/releases/download/v1.2.0/debug.apk',
      },
      {
        name: 'PhysioRecord-Android-Universal-v1.2.0.apk',
        browser_download_url: 'https://github.com/Hhi5/physiorecord/releases/download/v1.2.0/signed.apk',
      },
      {
        name: 'PhysioRecord-Portable-1.2.0-x64.exe',
        browser_download_url: 'https://github.com/Hhi5/physiorecord/releases/download/v1.2.0/portable.exe',
      },
      {
        name: 'PhysioRecord-Setup-1.2.0-x64.exe',
        browser_download_url: 'https://github.com/Hhi5/physiorecord/releases/download/v1.2.0/setup.exe',
      },
    ];

    expect(selectPlatformReleaseAsset(assets, 'android')?.downloadUrl).toBe(
      'https://github.com/Hhi5/physiorecord/releases/download/v1.2.0/signed.apk'
    );
    expect(selectPlatformReleaseAsset(assets, 'desktop')?.downloadUrl).toBe(
      'https://github.com/Hhi5/physiorecord/releases/download/v1.2.0/setup.exe'
    );
  });

  it('allowlists only official PhysioRecord release URLs', () => {
    expect(isAllowedGithubReleaseUrl('https://github.com/Hhi5/physiorecord/releases/latest')).toBe(true);
    expect(
      isAllowedGithubReleaseUrl(
        'https://github.com/Hhi5/physiorecord/releases/download/v1.2.0/PhysioRecord-Android-Universal-v1.2.0.apk'
      )
    ).toBe(true);
    expect(isAllowedGithubReleaseUrl('https://example.com/PhysioRecord.apk')).toBe(false);
  });

  it('assesses encrypted backup recency cleanly before upgrades', () => {
    const now = Date.UTC(2026, 10, 18, 12, 0, 0);
    expect(evaluateBackupRecencyForUpdate(null, now).status).toBe('none');
    expect(
      evaluateBackupRecencyForUpdate(new Date(now - 3 * 86400_000).toISOString(), now).status
    ).toBe('recent');
    expect(
      evaluateBackupRecencyForUpdate(new Date(now - 14 * 86400_000).toISOString(), now).status
    ).toBe('stale');
  });
});
