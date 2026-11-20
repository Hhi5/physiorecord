import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareSemverVersions,
  evaluateBackupRecencyForUpdate,
  isAllowedGithubReleaseUrl,
  selectPlatformReleaseAsset,
} from '../src/utils/updateSafety';

test('compareSemverVersions compares semantic tags cleanly', () => {
  assert.equal(compareSemverVersions('v1.2.0', '1.1.0'), 1);
  assert.equal(compareSemverVersions('1.1.0', 'v1.1.0'), 0);
  assert.equal(compareSemverVersions('1.0.9', '1.1.0'), -1);
  assert.equal(compareSemverVersions('v2.0.0-rc1', '1.99.99'), 1);
});

test('selectPlatformReleaseAsset prioritizes signed APK and Setup EXE over debug/portable', () => {
  const assets = [
    {
      name: 'PhysioRecord-Android-Universal-v1.2.0-debug.apk',
      browser_download_url: 'https://github.com/Hhi5/physiorecord/releases/download/v1.2.0/debug.apk',
      size: 1000,
    },
    {
      name: 'PhysioRecord-Android-Universal-v1.2.0.apk',
      browser_download_url: 'https://github.com/Hhi5/physiorecord/releases/download/v1.2.0/release.apk',
      size: 2000,
    },
    {
      name: 'PhysioRecord-Portable-1.2.0-x64.exe',
      browser_download_url: 'https://github.com/Hhi5/physiorecord/releases/download/v1.2.0/portable.exe',
      size: 3000,
    },
    {
      name: 'PhysioRecord-Setup-1.2.0-x64.exe',
      browser_download_url: 'https://github.com/Hhi5/physiorecord/releases/download/v1.2.0/setup.exe',
      size: 4000,
    },
    {
      name: 'PhysioRecord-Web-PWA-v1.2.0.zip',
      browser_download_url: 'https://github.com/Hhi5/physiorecord/releases/download/v1.2.0/web.zip',
      size: 500,
    },
  ];

  const android = selectPlatformReleaseAsset(assets, 'android');
  assert.equal(android?.kind, 'apk');
  assert.equal(android?.fileName, 'PhysioRecord-Android-Universal-v1.2.0.apk');

  const desktop = selectPlatformReleaseAsset(assets, 'desktop');
  assert.equal(desktop?.kind, 'windows-setup');
  assert.equal(desktop?.fileName, 'PhysioRecord-Setup-1.2.0-x64.exe');

  const web = selectPlatformReleaseAsset(assets, 'web');
  assert.equal(web?.kind, 'web-zip');
  assert.equal(web?.fileName, 'PhysioRecord-Web-PWA-v1.2.0.zip');
});

test('isAllowedGithubReleaseUrl strictly allowlists official PhysioRecord releases', () => {
  assert.equal(isAllowedGithubReleaseUrl('https://github.com/Hhi5/physiorecord/releases'), true);
  assert.equal(isAllowedGithubReleaseUrl('https://github.com/Hhi5/physiorecord/releases/latest'), true);
  assert.equal(
    isAllowedGithubReleaseUrl('https://github.com/Hhi5/physiorecord/releases/download/v1.2.0/PhysioRecord-Setup-1.2.0-x64.exe'),
    true
  );
  assert.equal(isAllowedGithubReleaseUrl('https://evil.example.com/releases/PhysioRecord.apk'), false);
  assert.equal(isAllowedGithubReleaseUrl('https://github.com/other/repo/releases'), false);
});

test('evaluateBackupRecencyForUpdate distinguishes recent, stale, and missing backups', () => {
  const now = Date.UTC(2026, 10, 18, 12, 0, 0);
  const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
  const twentyDaysAgo = new Date(now - 20 * 24 * 60 * 60 * 1000).toISOString();

  const recent = evaluateBackupRecencyForUpdate(twoDaysAgo, now);
  assert.equal(recent.hasBackup, true);
  assert.equal(recent.isRecent, true);
  assert.equal(recent.status, 'recent');
  assert.equal(recent.daysSinceBackup, 2);

  const stale = evaluateBackupRecencyForUpdate(twentyDaysAgo, now);
  assert.equal(stale.hasBackup, true);
  assert.equal(stale.isRecent, false);
  assert.equal(stale.status, 'stale');
  assert.equal(stale.daysSinceBackup, 20);

  const missing = evaluateBackupRecencyForUpdate(null, now);
  assert.equal(missing.hasBackup, false);
  assert.equal(missing.status, 'none');
});

test('Android sync-version.mjs matches nativeBridge versionCode formula above legacy 10102 floor', async () => {
  const { computeAndroidVersionCode: scriptCompute } = await import('./sync-version.mjs');
  const { computeAndroidVersionCode: appCompute } = await import('../src/platform/nativeBridge');
  const versions = ['0.0.1', '0.0.2', '1.0.0', '1.0.3', '1.0.4', '1.1.0', '1.2.3', '2.0.0'];
  let prev = 10102;
  for (const v of versions) {
    const sc = scriptCompute(v);
    const ac = appCompute(v);
    assert.equal(sc, ac, `versionCode mismatch for ${v}`);
    assert.ok(sc > prev, `versionCode for ${v} (${sc}) must exceed previous (${prev})`);
    prev = sc;
  }
});

test('Android data_extraction_rules.xml includes required path attribute on all exclude rules', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const xmlPath = path.join(
    process.cwd(),
    'android',
    'app',
    'src',
    'main',
    'res',
    'xml',
    'data_extraction_rules.xml'
  );
  const xml = fs.readFileSync(xmlPath, 'utf8');
  const excludeTags = xml.match(/<exclude\b[^>]*>/g) || [];
  assert.ok(excludeTags.length >= 10, 'Expected cloud-backup and device-transfer exclude rules');
  for (const tag of excludeTags) {
    assert.match(tag, /\bdomain="[^"]+"/, `Missing domain attribute in ${tag}`);
    assert.match(tag, /\bpath="[^"]+"/, `Missing required path attribute in ${tag}`);
  }
});

