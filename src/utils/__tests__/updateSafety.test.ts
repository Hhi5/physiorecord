import { describe, expect, it } from 'vitest';
import {
  compareSemverVersions,
  evaluateBackupRecencyForUpdate,
  extractReleaseNotesLines,
  isAllowedGithubReleaseUrl,
  isAllowedOfficialGithubUrl,
  normalizeGithubReleasesPayload,
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

  it('allowlists only official PhysioRecord repository and release URLs', () => {
    expect(isAllowedGithubReleaseUrl('https://github.com/Hhi5/physiorecord/releases/latest')).toBe(true);
    expect(
      isAllowedGithubReleaseUrl(
        'https://github.com/Hhi5/physiorecord/releases/download/v1.2.0/PhysioRecord-Android-Universal-v1.2.0.apk'
      )
    ).toBe(true);
    expect(isAllowedGithubReleaseUrl('https://example.com/PhysioRecord.apk')).toBe(false);

    expect(isAllowedOfficialGithubUrl('https://github.com/Hhi5/physiorecord')).toBe(true);
    expect(isAllowedOfficialGithubUrl('https://github.com/Hhi5/physiorecord/releases')).toBe(true);
    expect(isAllowedOfficialGithubUrl('https://github.com/other/physiorecord')).toBe(false);
  });

  it('normalizes multiple GitHub releases, skips drafts, filters untrusted assets, and sorts newest first', () => {
    const normalized = normalizeGithubReleasesPayload([
      {
        id: 1,
        tag_name: 'v1.0.0',
        name: 'Initial Release',
        body: '- First version',
        published_at: '2026-11-13T10:00:00Z',
        html_url: 'https://github.com/Hhi5/physiorecord/releases/tag/v1.0.0',
        draft: false,
        prerelease: false,
        assets: [],
      },
      {
        id: 2,
        tag_name: 'v1.3.0-draft',
        name: 'Draft',
        draft: true,
        assets: [],
      },
      {
        id: 3,
        tag_name: 'v1.2.0',
        name: 'Clinical Update 1.2',
        body: '## Highlights\n- Fixed **A4 printing**\n- See [Notes](https://github.com/Hhi5/physiorecord)',
        published_at: '2026-11-20T10:00:00Z',
        html_url: 'https://github.com/Hhi5/physiorecord/releases/tag/v1.2.0',
        draft: false,
        prerelease: false,
        assets: [
          {
            name: 'PhysioRecord-Setup-1.2.0-x64.exe',
            browser_download_url:
              'https://github.com/Hhi5/physiorecord/releases/download/v1.2.0/PhysioRecord-Setup-1.2.0-x64.exe',
            size: 85000000,
          },
          {
            name: 'malicious.exe',
            browser_download_url: 'https://evil.example.com/malicious.exe',
          },
        ],
      },
    ]);

    expect(normalized).toHaveLength(2);
    expect(normalized[0].tagName).toBe('v1.2.0');
    expect(normalized[0].name).toBe('Clinical Update 1.2');
    expect(normalized[0].assets).toHaveLength(1);
    expect(normalized[0].assets[0].name).toBe('PhysioRecord-Setup-1.2.0-x64.exe');
    expect(extractReleaseNotesLines(normalized[0].body)).toEqual([
      'Highlights',
      'Fixed A4 printing',
      'See Notes',
    ]);
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
