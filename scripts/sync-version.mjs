#!/usr/bin/env node
// =======================================================================
// PhysioRecord — Cross-Platform Version Synchronizer
// Keeps package.json, Android (versionName + deterministic versionCode),
// and Capacitor metadata strictly in sync from a single semver source.
// Formula: versionCode = major * 10000 + minor * 100 + patch
// =======================================================================

import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const PKG_PATH = path.join(ROOT_DIR, 'package.json');
const ANDROID_GRADLE_PATH = path.join(ROOT_DIR, 'android', 'app', 'build.gradle');

export function computeAndroidVersionCode(semverStr) {
  const clean = String(semverStr || '1.0.0').trim().replace(/^v/i, '').split('-')[0];
  const parts = clean.split('.').map((n) => parseInt(n, 10));
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n) || n < 0)) {
    throw new Error(`Invalid semantic version "${semverStr}" in package.json`);
  }
  const [major, minor, patch] = parts;
  return major * 10000 + minor * 100 + patch;
}

export function syncAndroidVersion() {
  if (!fs.existsSync(PKG_PATH)) {
    console.error('❌ package.json not found');
    process.exit(1);
  }

  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
  const versionName = String(pkg.version || '1.0.0').trim();
  const versionCode = computeAndroidVersionCode(versionName);

  if (fs.existsSync(ANDROID_GRADLE_PATH)) {
    let gradleContent = fs.readFileSync(ANDROID_GRADLE_PATH, 'utf8');
    gradleContent = gradleContent
      .replace(/versionCode\s+\d+/g, `versionCode ${versionCode}`)
      .replace(/versionName\s+"[^"]+"/g, `versionName "${versionName}"`);
    fs.writeFileSync(ANDROID_GRADLE_PATH, gradleContent, 'utf8');
    console.log(
      `✅ Synced Android version: versionName="${versionName}", versionCode=${versionCode}`
    );
  } else {
    console.log(
      `ℹ️ Computed version: versionName="${versionName}", versionCode=${versionCode} (android/app/build.gradle not present yet)`
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  syncAndroidVersion();
}
