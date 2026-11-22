// =======================================================================
// PhysioRecord Electron — Native Desktop OS Authentication
// Windows Hello (PIN/Password/Biometrics) & macOS Touch ID backed by
// Electron safeStorage (Windows DPAPI / macOS Keychain).
// =======================================================================

import { app, safeStorage, systemPreferences } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const getOsBiometricFilePath = () =>
  path.resolve(app.getPath('userData'), 'desktop-os-unlock.json');

async function hasStoredOsBiometricDek() {
  try {
    const raw = await fs.readFile(getOsBiometricFilePath(), 'utf8');
    const parsed = JSON.parse(raw);
    return Boolean(parsed && typeof parsed.cipherBase64 === 'string' && parsed.cipherBase64.length > 0);
  } catch {
    return false;
  }
}

async function runWindowsPowerShellScript(scriptText, timeoutMs = 120_000) {
  const encoded = Buffer.from(scriptText, 'utf16le').toString('base64');
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded],
    { windowsHide: true, timeout: timeoutMs }
  );
  return String(stdout || '').trim();
}

async function checkOsBiometricAvailability() {
  if (!safeStorage.isEncryptionAvailable()) {
    return { available: false, status: 'unavailable' };
  }

  if (process.platform === 'darwin') {
    const canTouchId =
      typeof systemPreferences?.canPromptTouchID === 'function' &&
      systemPreferences.canPromptTouchID();
    return {
      available: Boolean(canTouchId),
      status: canTouchId ? 'ready' : 'unavailable',
    };
  }

  if (process.platform === 'win32') {
    const checkScript = [
      "$ErrorActionPreference = 'Stop'",
      'Add-Type -AssemblyName System.Runtime.WindowsRuntime',
      "$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]",
      'function Await($WinRtTask, $ResultType) {',
      '  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)',
      '  $netTask = $asTask.Invoke($null, @($WinRtTask))',
      '  $netTask.Wait(-1) | Out-Null',
      '  $netTask.Result',
      '}',
      '[Windows.Security.Credentials.UI.UserConsentVerifier, Windows.Security.Credentials.UI, ContentType = WindowsRuntime] | Out-Null',
      '$res = Await ([Windows.Security.Credentials.UI.UserConsentVerifier]::CheckAvailabilityAsync()) ([Windows.Security.Credentials.UI.UserConsentVerifierAvailability])',
      'Write-Output $res.ToString()',
    ].join('\n');
    try {
      const result = await runWindowsPowerShellScript(checkScript, 10_000);
      if (result === 'Available') {
        return { available: true, status: 'ready' };
      }
      if (result === 'NotConfiguredForUser' || result === 'DeviceNotPresent') {
        return { available: false, status: 'not-enrolled-os' };
      }
      return { available: false, status: 'unavailable' };
    } catch {
      return { available: false, status: 'unavailable' };
    }
  }

  return { available: false, status: 'unavailable' };
}

async function promptOsUserVerification() {
  if (process.platform === 'darwin') {
    await systemPreferences.promptTouchID('PhysioRecord — Unlock encrypted clinical vault');
    return true;
  }

  if (process.platform === 'win32') {
    const promptScript = [
      "$ErrorActionPreference = 'Stop'",
      'Add-Type -AssemblyName System.Runtime.WindowsRuntime',
      "$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]",
      'function Await($WinRtTask, $ResultType) {',
      '  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)',
      '  $netTask = $asTask.Invoke($null, @($WinRtTask))',
      '  $netTask.Wait(-1) | Out-Null',
      '  $netTask.Result',
      '}',
      '[Windows.Security.Credentials.UI.UserConsentVerifier, Windows.Security.Credentials.UI, ContentType = WindowsRuntime] | Out-Null',
      "$res = Await ([Windows.Security.Credentials.UI.UserConsentVerifier]::RequestVerificationAsync('PhysioRecord — Verify using your Windows PIN, Password, or Biometrics')) ([Windows.Security.Credentials.UI.UserConsentVerificationResult])",
      'Write-Output $res.ToString()',
    ].join('\n');
    const result = await runWindowsPowerShellScript(promptScript, 120_000);
    if (result === 'Verified') {
      return true;
    }
    if (result === 'Canceled') {
      throw new Error('تم إلغاء التحقق عبر Windows Hello.');
    }
    if (result === 'NotConfiguredForUser' || result === 'DeviceNotPresent') {
      throw new Error('لم يتم إعداد Windows Hello أو رمز PIN في إعدادات نظام ويندوز.');
    }
    throw new Error('تعذر التحقق عبر Windows Hello.');
  }

  throw new Error('OS verification is not supported on this platform.');
}

export function registerOsBiometricHandlers({ ipcMain, assertTrustedIpcSender }) {
  ipcMain.handle('physiorecord:os-biometric-available', async (event) => {
    assertTrustedIpcSender(event);
    const [avail, enrolled] = await Promise.all([
      checkOsBiometricAvailability(),
      hasStoredOsBiometricDek(),
    ]);
    return {
      available: avail.available,
      status: avail.status,
      enrolled,
    };
  });

  ipcMain.handle('physiorecord:os-biometric-enroll', async (event, payload) => {
    assertTrustedIpcSender(event);
    const dekBase64 = String(payload?.dekBase64 || '').trim();
    const rawBuf = Buffer.from(dekBase64, 'base64');
    if (rawBuf.length !== 32) {
      rawBuf.fill(0);
      throw new Error('Invalid DEK payload length.');
    }
    rawBuf.fill(0);

    const avail = await checkOsBiometricAvailability();
    if (!avail.available) {
      throw new Error(
        avail.status === 'not-enrolled-os'
          ? 'لم يتم إعداد Windows Hello أو رمز الحاسوب في إعدادات ويندوز.'
          : 'قفل النظام الآمن غير متاح على هذا الجهاز.'
      );
    }

    await promptOsUserVerification();
    const encrypted = safeStorage.encryptString(dekBase64);
    const targetPath = getOsBiometricFilePath();
    const tmpPath = `${targetPath}.${Date.now()}.tmp`;
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(
      tmpPath,
      JSON.stringify({
        version: 1,
        cipherBase64: encrypted.toString('base64'),
        enrolledAt: new Date().toISOString(),
      }),
      { encoding: 'utf8', mode: 0o600 }
    );
    await fs.rename(tmpPath, targetPath);
    return { enrolled: true };
  });

  ipcMain.handle('physiorecord:os-biometric-unlock', async (event) => {
    assertTrustedIpcSender(event);
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('OS secure storage is unavailable.');
    }
    const rawFile = await fs.readFile(getOsBiometricFilePath(), 'utf8').catch(() => '');
    if (!rawFile) {
      throw new Error('لم يتم تفعيل الفتح بقفل الحاسوب لهذه الخزينة.');
    }
    const parsed = JSON.parse(rawFile);
    const cipherBase64 = String(parsed?.cipherBase64 || '');
    if (!cipherBase64) {
      throw new Error('بيانات الفتح المحفوظة تالفة أو غير مكتملة.');
    }

    await promptOsUserVerification();
    const decryptedDekBase64 = safeStorage.decryptString(Buffer.from(cipherBase64, 'base64'));
    const checkBuf = Buffer.from(decryptedDekBase64, 'base64');
    if (checkBuf.length !== 32) {
      checkBuf.fill(0);
      throw new Error('طول مفتاح التشفير المسترجع غير صالح.');
    }
    checkBuf.fill(0);
    return { dekBase64: decryptedDekBase64 };
  });

  ipcMain.handle('physiorecord:os-biometric-clear', async (event) => {
    assertTrustedIpcSender(event);
    try {
      await fs.unlink(getOsBiometricFilePath());
    } catch {
      // ignore ENOENT
    }
    return { cleared: true };
  });
}
