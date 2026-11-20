#!/usr/bin/env node
// =======================================================================
// PhysioRecord — Cross-Platform Version Synchronizer
// Keeps package.json, Android (versionName + deterministic versionCode),
// and Capacitor metadata strictly in sync from a single semver source.
// Formula: versionCode = 100000 + major * 10000 + minor * 100 + patch
// =======================================================================

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT_DIR = process.cwd();
const PKG_PATH = path.join(ROOT_DIR, 'package.json');
const SETTINGS_PHASE_F_PATH = path.join(ROOT_DIR, 'src', 'utils', 'settingsOnboardingPhaseF.ts');
const ANDROID_GRADLE_PATH = path.join(ROOT_DIR, 'android', 'app', 'build.gradle');
const ANDROID_VERSION_CODE_BASE = 100000;

export function normalizeSemver(semverStr) {
  const clean = String(semverStr || '1.0.0')
    .trim()
    .replace(/^refs\/tags\//i, '')
    .replace(/^v/i, '')
    .split('-')[0];
  const parts = clean.split('.').map((n) => parseInt(n, 10));
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n) || n < 0)) {
    throw new Error(`Invalid semantic version "${semverStr}"`);
  }
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

export function computeAndroidVersionCode(semverStr) {
  const clean = normalizeSemver(semverStr);
  const parts = clean.split('.').map((n) => parseInt(n, 10));
  const [major, minor, patch] = parts;
  // Base offset of 100000 guarantees every future release (0.x.y, 1.0.x, 1.1.x, ...)
  // is strictly higher than all previously shipped APKs (1..10102) so Android never
  // rejects installs with INSTALL_FAILED_VERSION_DOWNGRADE ("Package appears to be invalid")
  // while preserving strict semver monotonicity across all version series.
  return ANDROID_VERSION_CODE_BASE + major * 10000 + minor * 100 + patch;
}

function parseCliVersionArg(argv = process.argv.slice(2)) {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--version=')) {
      return arg.slice('--version='.length);
    }
    if (arg === '--version' && argv[i + 1]) {
      return argv[i + 1];
    }
  }
  return process.env.RELEASE_VERSION || '';
}

export function syncAndroidVersion(explicitVersion = '') {
  if (!fs.existsSync(PKG_PATH)) {
    console.error('❌ package.json not found');
    process.exit(1);
  }

  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
  const rawRequested = String(explicitVersion || parseCliVersionArg() || '').trim();
  const versionName = rawRequested
    ? normalizeSemver(rawRequested)
    : normalizeSemver(pkg.version || '1.0.0');
  const versionCode = computeAndroidVersionCode(versionName);

  if (pkg.version !== versionName) {
    pkg.version = versionName;
    fs.writeFileSync(PKG_PATH, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
    console.log(`✅ Updated package.json version -> "${versionName}"`);
  }

  if (fs.existsSync(SETTINGS_PHASE_F_PATH)) {
    const prevTs = fs.readFileSync(SETTINGS_PHASE_F_PATH, 'utf8');
    const nextTs = prevTs.replace(
      /export const APP_SEMVER_VERSION = '[^']+';/,
      `export const APP_SEMVER_VERSION = '${versionName}';`
    );
    if (nextTs !== prevTs) {
      fs.writeFileSync(SETTINGS_PHASE_F_PATH, nextTs, 'utf8');
      console.log(`✅ Updated APP_SEMVER_VERSION -> "${versionName}"`);
    }
  }

  if (fs.existsSync(ANDROID_GRADLE_PATH)) {
    const gradleContent = fs.readFileSync(ANDROID_GRADLE_PATH, 'utf8');
    const updatedGradle = gradleContent
      .replace(/versionCode\s+\d+/g, `versionCode ${versionCode}`)
      .replace(/versionName\s+"[^"]+"/g, `versionName "${versionName}"`);
    if (updatedGradle !== gradleContent) {
      fs.writeFileSync(ANDROID_GRADLE_PATH, updatedGradle, 'utf8');
    }
    console.log(
      `✅ Synced Android version: versionName="${versionName}", versionCode=${versionCode}`
    );
  } else {
    console.log(
      `ℹ️ Computed version: versionName="${versionName}", versionCode=${versionCode} (android/app/build.gradle not present yet)`
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  syncAndroidVersion();
}
