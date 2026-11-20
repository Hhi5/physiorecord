#!/usr/bin/env node
// =======================================================================
// PhysioRecord — One-Time Persistent Android Release Keystore Setup
// License: GPL-3.0-or-later (Original Project Code)
// Generates a single permanent `.jks` signing store locally (gitignored)
// and prints the exact Base64 + SHA-256 fingerprint values to paste once
// into GitHub Repository Secrets so future Android APK releases ALWAYS
// install cleanly over previous versions without wiping user data.
// =======================================================================

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT_DIR = process.cwd();
const KEYSTORE_DIR = path.join(ROOT_DIR, '.keystore');
const KEYSTORE_PATH = path.join(KEYSTORE_DIR, 'physiorecord-release.jks');
const KEY_ALIAS = process.env.ANDROID_KEY_ALIAS || 'physiorecord_release';

function resolveKeytoolBin() {
  if (process.env.JAVA_HOME) {
    const ext = process.platform === 'win32' ? '.exe' : '';
    const candidate = path.join(process.env.JAVA_HOME, 'bin', `keytool${ext}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return 'keytool';
}

function generateRandomPassword() {
  return crypto.randomBytes(18).toString('base64url');
}

function run() {
  const keytool = resolveKeytoolBin();
  fs.mkdirSync(KEYSTORE_DIR, { recursive: true });

  const storePassword = process.env.ANDROID_KEYSTORE_PASSWORD || generateRandomPassword();
  const keyPassword = process.env.ANDROID_KEY_PASSWORD || storePassword;

  if (fs.existsSync(KEYSTORE_PATH)) {
    console.log(`ℹ️ Existing keystore found at ${KEYSTORE_PATH}`);
    console.log('   Delete or move it first if you truly intend to rotate signing keys.');
  } else {
    execFileSync(
      keytool,
      [
        '-genkeypair',
        '-v',
        '-keystore',
        KEYSTORE_PATH,
        '-alias',
        KEY_ALIAS,
        '-keyalg',
        'RSA',
        '-keysize',
        '4096',
        '-startdate',
        '2020/01/01 00:00:00',
        '-validity',
        '10000',
        '-storepass',
        storePassword,
        '-keypass',
        keyPassword,
        '-dname',
        'CN=PhysioRecord Clinic, OU=Mobile Engineering, O=PhysioRecord, L=Baghdad, C=IQ',
      ],
      { stdio: 'inherit' }
    );
    console.log(`\n✅ Created permanent Android Release Keystore: ${KEYSTORE_PATH}`);
  }

  let sha256Output = '';
  try {
    sha256Output = execFileSync(
      keytool,
      [
        '-list',
        '-v',
        '-keystore',
        KEYSTORE_PATH,
        '-alias',
        KEY_ALIAS,
        '-storepass',
        storePassword,
      ],
      { encoding: 'utf8' }
    );
  } catch {
    // Print helpful prompt if existing keystore used a custom password
    console.log(
      '⚠️ Could not read SHA-256 fingerprint automatically (supply ANDROID_KEYSTORE_PASSWORD if reusing an existing keystore).'
    );
  }

  const sha256Match = sha256Output.match(/SHA256:\s*([0-9A-Fa-f:]+)/);
  const certSha256 = sha256Match ? sha256Match[1].trim() : '(check with keytool -list -v)';

  const b64 = fs.readFileSync(KEYSTORE_PATH).toString('base64');

  console.log('\n==============================================================');
  console.log('Add these Secrets to GitHub -> Settings -> Secrets -> Actions:');
  console.log('==============================================================');
  console.log(`ANDROID_KEY_ALIAS         = ${KEY_ALIAS}`);
  console.log(`ANDROID_KEYSTORE_PASSWORD = ${storePassword}`);
  console.log(`ANDROID_KEY_PASSWORD      = ${keyPassword}`);
  console.log(`ANDROID_CERT_SHA256       = ${certSha256}`);
  console.log('\nANDROID_KEYSTORE_BASE64 (copy full single line below):');
  console.log(b64);
  console.log('\n⚠️ Keep .keystore/ backed up offline securely! Never commit *.jks files.');
}

run();
