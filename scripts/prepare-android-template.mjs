#!/usr/bin/env node
// =======================================================================
// PhysioRecord — Capacitor Android Template & Gradle Wrapper Hydrator
// Extracts `gradlew`, `gradle-wrapper.jar`, `gradle-wrapper.properties`,
// and default launcher mipmap/drawable resources from `@capacitor/cli`
// without overwriting PhysioRecord's custom AndroidManifest.xml, build.gradle,
// or PhysioRecordNativePlugin.java.
// =======================================================================

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const ANDROID_DIR = path.join(ROOT_DIR, 'android');
const TEMPLATE_TAR = path.join(
  ROOT_DIR,
  'node_modules',
  '@capacitor',
  'cli',
  'assets',
  'android-template.tar.gz'
);

if (!fs.existsSync(TEMPLATE_TAR)) {
  console.log(
    '[prepare-android-template] @capacitor/cli template archive not found yet; skipping template hydration.'
  );
  process.exit(0);
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'physiorecord-cap-tpl-'));

try {
  execFileSync('tar', ['-xzf', TEMPLATE_TAR, '-C', tmpDir], {
    stdio: 'inherit',
  });

  // Remove Capacitor's placeholder com.getcapacitor.myapp sources from template before merging
  const placeholderDirs = [
    path.join(tmpDir, 'app', 'src', 'main', 'java', 'com'),
    path.join(tmpDir, 'app', 'src', 'test'),
    path.join(tmpDir, 'app', 'src', 'androidTest'),
  ];
  for (const dir of placeholderDirs) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  fs.mkdirSync(ANDROID_DIR, { recursive: true });
  // Copy only missing files (`force: false`) so custom PhysioRecord files are never overwritten
  fs.cpSync(tmpDir, ANDROID_DIR, {
    recursive: true,
    force: false,
    errorOnExist: false,
  });

  const gradlewPath = path.join(ANDROID_DIR, 'gradlew');
  if (fs.existsSync(gradlewPath)) {
    fs.chmodSync(gradlewPath, 0o755);
  }

  console.log('[prepare-android-template] ✅ Hydrated Gradle wrapper and Android base resources.');
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
