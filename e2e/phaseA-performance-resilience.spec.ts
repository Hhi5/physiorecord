import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { createInMemoryDatabase } from '../src/crypto/__tests__/testDbHelper';
import {
  CONSTANTS,
  CURRENT_DEK_VERSION,
  CURRENT_RECORD_CRYPTO_VERSION,
  bindDekToGeneration,
  deriveKEK,
  encryptRecordWithMandatoryReservation,
  generateAndWrapOperationalDEK,
  generateVerifier,
  randomBytes,
} from '../src/crypto/vault';
import { exportBackupPackage } from '../src/crypto/backup';
import type { PatientClinicalData } from '../src/types/clinical';

async function completeFirstRunToSolo(page: Page, password: string) {
  await page.addInitScript(() => {
    try {
      Object.defineProperty(window, 'showSaveFilePicker', {
        value: undefined,
        configurable: true,
        writable: true,
      });
    } catch {
      // ignore
    }
  });

  await page.goto('/', { waitUntil: 'networkidle' });
  await page.locator('input#password').fill(password);
  await page.locator('input#confirmPassword').fill(password);
  await page.locator('button[type="submit"]').click();

  const challengeInput = page.locator('input[type="text"]').first();
  await expect(challengeInput).toBeVisible({ timeout: 15_000 });
  const expectedGroup = (await challengeInput.getAttribute('placeholder')) || '';
  if (expectedGroup) {
    await challengeInput.fill(expectedGroup);
  }
  await page.locator('input[type="checkbox"]').first().check();
  await page
    .locator('button')
    .filter({ hasText: /الدخول إلى مساحة العمل|Enter Clinical Workspace/i })
    .first()
    .click();

  const soloBtn = page.getByTestId('wizard-mode-solo');
  await expect(soloBtn).toBeVisible({ timeout: 15_000 });
  await soloBtn.click();
  await page.getByTestId('wizard-confirm-btn').click();
  await expect(page.getByTestId('today-walkin-btn')).toBeVisible({ timeout: 20_000 });
}

async function generate125PatientBackupFile(backupPassword: string): Promise<string> {
  const testDb = createInMemoryDatabase(10);
  const salt = randomBytes(CONSTANTS.SALT_BYTES);
  const kek = await deriveKEK('TempSeedVault!2026', salt, 1000);
  const generated = await generateAndWrapOperationalDEK(kek, 1);
  const { verifierIv, verifierCiphertext } = await generateVerifier(kek);

  const meta = {
    id: 'auth' as const,
    salt,
    wrappedDek: generated.wrappedDek,
    wrappedDekIv: generated.wrappedDekIv,
    verifierIv,
    verifierCiphertext,
    schemaVersion: 10,
    kdfAlgorithm: 'PBKDF2-HMAC-SHA256' as const,
    kdfIterations: 1000,
    dekVersion: CURRENT_DEK_VERSION,
    encryptionInvocationCount: 0,
    vaultGeneration: 1,
    recoveryWrappedDek: generated.recoveryWrappedDek,
    recoveryWrappedDekIv: generated.recoveryWrappedDekIv,
    recoverySalt: generated.recoverySalt,
    recoveryKdfIterations: generated.recoveryKdfIterations,
    recoveryKeyGroupSalt: generated.recoveryKeyGroupSalt,
    recoveryKeyGroupDigests: generated.recoveryKeyGroupDigests,
  };

  await testDb.vaultMeta.put(meta);
  bindDekToGeneration(generated.operationalDek, 1);

  const nowIso = new Date().toISOString();
  const encWorkspaceMode = await encryptRecordWithMandatoryReservation(
    testDb,
    generated.operationalDek,
    'clinicSettings',
    'workspace_mode',
    [],
    {
      id: 'workspace_mode',
      mode: 'solo',
      wizardCompleted: true,
      updatedAt: nowIso,
      version: 1,
    }
  );
  await testDb.clinicSettings.put({
    id: 'workspace_mode',
    updatedAt: nowIso,
    version: 1,
    recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
    dekVersion: CURRENT_DEK_VERSION,
    recordSalt: encWorkspaceMode.recordSalt,
    iv: encWorkspaceMode.iv,
    ciphertext: encWorkspaceMode.ciphertext,
  });

  for (let i = 1; i <= 125; i++) {
    const num = String(i).padStart(3, '0');
    const patId = `pat-seed-${num}`;
    const payload: PatientClinicalData = {
      fullName: `Patient-${num} Al-Baghdadi`,
      fullNameAr: `مريض قياسي ${num}`,
      gender: i % 2 === 0 ? 'female' : 'male',
      phone: `0770100${num}`,
      medicalHistory: `Clinical record notes for Patient-${num}. Low back stiffness & rehab follow-up.`,
    };
    const enc = await encryptRecordWithMandatoryReservation(
      testDb,
      generated.operationalDek,
      'patients',
      patId,
      [],
      payload
    );
    await testDb.patients.put({
      id: patId,
      createdAt: nowIso,
      updatedAt: nowIso,
      isArchived: 0,
      version: 1,
      recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
      dekVersion: CURRENT_DEK_VERSION,
      recordSalt: enc.recordSalt,
      iv: enc.iv,
      ciphertext: enc.ciphertext,
    });
  }

  const backupJson = await exportBackupPackage(testDb, meta, kek, backupPassword);
  const outPath = path.join(os.tmpdir(), `physiorecord-perf125-${Date.now()}.ptbackup`);
  fs.writeFileSync(outPath, backupJson, 'utf8');
  return outPath;
}

test.describe('Phase A — Crash Resilience, Auto-Lock Warning, Sandbox Drill, Low-End Mode & 6x CPU Benchmark', () => {
  test('A1 & A5: mid-typing reload draft recovery, Ctrl+L pre-lock draft flush, and Esc x2 Privacy Cover', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await completeFirstRunToSolo(page, 'DraftVault!2026');

    // Open Privacy Cover with Esc x2 shortcut and resume
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('privacy-cover-overlay')).toBeVisible({ timeout: 5_000 });
    await page
      .getByTestId('privacy-cover-overlay')
      .locator('button')
      .filter({ hasText: /استئناف العمل|Resume Session/i })
      .first()
      .click();
    await expect(page.getByTestId('privacy-cover-overlay')).toBeHidden();

    // Create a Walk-In session and type mid-note without saving
    await page.getByTestId('today-walkin-btn').click();
    await page.getByTestId('walkin-name-input').fill('علي حسن كريم');
    await page.getByTestId('walkin-submit-btn').click();

    const complaintBox = page
      .locator('textarea[placeholder*="شكوى المريض"], textarea[placeholder*="chief complaint"]')
      .first();
    await expect(complaintBox).toBeVisible({ timeout: 15_000 });
    await complaintBox.fill('ألم الكتف الأيمن أثناء الرفع قبل انقطاع الكهرباء');

    // Wait > 700ms so the 650ms encrypted debounce writes to Dexie v10 `drafts`
    await page.waitForTimeout(900);

    // Simulate sudden power cut / reload before hitting Save or Finish
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('input#password').fill('DraftVault!2026');
    await page.locator('button[type="submit"]').click();

    await expect(page.getByTestId('recovered-work-banner')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('recovered-draft-item-soap')).toBeVisible();

    // Restore the draft back into TreatmentSessionView
    await page
      .getByTestId('recovered-draft-item-soap')
      .locator('button')
      .filter({ hasText: /استعادة|Restore/i })
      .first()
      .click();

    await expect(complaintBox).toBeVisible({ timeout: 15_000 });
    await expect(complaintBox).toHaveValue('ألم الكتف الأيمن أثناء الرفع قبل انقطاع الكهرباء');

    // Immediately type and hit Ctrl+L without waiting for debounce: pre-lock collector must flush!
    await complaintBox.fill('تحديث سريع تم حفظه تلقائياً عند Ctrl+L');
    await page.keyboard.press('Control+l');
    await expect(page.locator('input#password')).toBeVisible({ timeout: 10_000 });

    // Unlock and confirm pre-lock flush survived
    await page.locator('input#password').fill('DraftVault!2026');
    await page.locator('button[type="submit"]').click();
    await expect(page.getByTestId('recovered-work-banner')).toBeVisible({ timeout: 15_000 });
    await page
      .getByTestId('recovered-draft-item-soap')
      .locator('button')
      .filter({ hasText: /استعادة|Restore/i })
      .first()
      .click();
    await expect(complaintBox).toHaveValue('تحديث سريع تم حفظه تلقائياً عند Ctrl+L', {
      timeout: 15_000,
    });
  });

  test('A2: 30s auto-lock warning countdown toast and Stay Unlocked button reset inactivity timer', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.addInitScript(() => {
      try {
        localStorage.setItem('physiorecord_autolock_timeout_ms', '60000');
      } catch {
        // ignore
      }
    });

    await completeFirstRunToSolo(page, 'AutoLockVault!2026');

    // Advance virtual clock into the final 30-second warning window (elapsed >= 35s of 60s timeout)
    await page.clock.install({ time: Date.now() });
    await page.clock.runFor(36_000);

    const toast = page.getByTestId('autolock-warning-toast');
    await expect(toast).toBeVisible({ timeout: 10_000 });
    await expect(toast).toContainText(/\d+s/);

    // Click "Stay Unlocked" to clear warning and reset inactivity deadline
    await toast
      .locator('button')
      .filter({ hasText: /البقاء مفتوحاً|Stay Unlocked/i })
      .click();
    await expect(toast).toBeHidden({ timeout: 5_000 });

    // Advancing another 20s must NOT trigger lock or warning yet since timer reset to full 60s
    await page.clock.runFor(20_000);
    await expect(toast).toBeHidden();
    await expect(page.getByTestId('today-walkin-btn')).toBeVisible();
  });

  test('A3 & A4: Quarterly Recovery Drill sandbox .ptbackup check & Low-End Device Mode toggle', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await completeFirstRunToSolo(page, 'DrillVault!2026');

    // 1. Toggle Low-End Device Performance Mode in Settings -> Display & Fonts
    const userMenuBtn = page
      .locator('header button[aria-label*="menu"], header button[aria-label*="المستخدم"]')
      .first();
    await userMenuBtn.click();
    await page
      .locator('button')
      .filter({ hasText: /الإعدادات والخيارات|Settings/i })
      .first()
      .click();
    await page.getByTestId('settings-tab-display').click();

    await expect(page.getByTestId('reduced-effects-on')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('reduced-effects-on').click();

    const htmlClassesOn = await page.evaluate(() => ({
      lowEnd: document.documentElement.classList.contains('low-end-device'),
      reduceTrans: document.documentElement.classList.contains('reduce-transparency'),
    }));
    expect(htmlClassesOn.lowEnd).toBe(true);
    expect(htmlClassesOn.reduceTrans).toBe(true);

    await page.getByTestId('reduced-effects-off').click();
    const htmlClassesOff = await page.evaluate(() => ({
      lowEnd: document.documentElement.classList.contains('low-end-device'),
      reduceTrans: document.documentElement.classList.contains('reduce-transparency'),
    }));
    expect(htmlClassesOff.lowEnd).toBe(false);

    // Close Settings modal cleanly via its Close button
    await page
      .locator('button[aria-label*="إغلاق الإعدادات"], button[aria-label*="Close"]')
      .first()
      .click();
    await page.waitForTimeout(200);

    // 2. Export a real .ptbackup from Today -> EOD then test it inside Recovery Drill Sandbox DB
    await page.getByTestId('today-subtab-eod').click();
    await page.getByTestId('eod-backup-now-btn').click();

    const exportTabCheckboxes = page.locator('div.fixed input[type="checkbox"]');
    if ((await exportTabCheckboxes.count()) > 0 && (await exportTabCheckboxes.first().isChecked())) {
      await exportTabCheckboxes.first().uncheck();
    }

    const exportPwInputs = page.locator('div.fixed input[type="password"]');
    await exportPwInputs.nth(0).fill('SandboxPass!2026');
    await exportPwInputs.nth(1).fill('SandboxPass!2026');
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      page.locator('button').filter({ hasText: /تصدير وتحقق وحفظ ملف النسخة/i }).first().click(),
    ]);
    const backupFile = path.join(os.tmpdir(), `drill-sandbox-${Date.now()}.ptbackup`);
    await download.saveAs(backupFile);

    // Close backup modal
    await page
      .locator('div.fixed button[aria-label*="إغلاق"], div.fixed button[aria-label*="Close"]')
      .first()
      .click();

    // Open Settings -> Security tab -> Run Recovery Drill modal & verify isolated sandbox backup test
    await userMenuBtn.click();
    await page
      .locator('button')
      .filter({ hasText: /الإعدادات والخيارات|Settings/i })
      .first()
      .click();
    await page
      .locator('button')
      .filter({ hasText: /الأمان|Security/i })
      .first()
      .click();
    await expect(page.getByTestId('open-recovery-drill-btn')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('open-recovery-drill-btn').click();

    await page.locator('[role="dialog"] input[type="file"]').setInputFiles(backupFile);
    await page
      .locator('[role="dialog"] input[type="password"]')
      .last()
      .fill('SandboxPass!2026');
    await page
      .locator('[role="dialog"] button')
      .filter({ hasText: /اختبار النسخة الآن|Run Sandbox Test/i })
      .first()
      .click();

    await expect(page.getByTestId('recovery-drill-verified-badge')).toBeVisible({ timeout: 30_000 });

    // Close drill modal & confirm verified badge updated in Settings Security tab
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    await expect(page.getByTestId('settings-drill-verified-badge')).toBeVisible({ timeout: 5_000 });

    try {
      fs.unlinkSync(backupFile);
    } catch {
      // ignore
    }
  });

  test('A3 Benchmark (6x CPU throttle): >100 virtualized directory rows & latency measurement', async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });

    const perfBackupPath = await generate125PatientBackupFile('PerfBackup!2026');
    await completeFirstRunToSolo(page, 'InitialSetup!2026');

    // Restore 125-patient V3 .ptbackup via Backup & Restore UI
    await page.getByTestId('today-subtab-eod').click();
    await page.getByTestId('eod-backup-now-btn').click();
    await page.locator('button').filter({ hasText: /استعادة نسخة احتياطية/i }).first().click();
    await page.locator('div.fixed input[type="file"]').setInputFiles(perfBackupPath);
    await page
      .locator('div.fixed input[placeholder*="كلمة المرور التي حُمي بها"]')
      .fill('PerfBackup!2026');
    await page
      .locator('button')
      .filter({ hasText: /فحص ومعاينة السجلات قبل الاستعادة/i })
      .first()
      .click();

    await expect(page.locator('text=/125 مريض/').first()).toBeVisible({ timeout: 30_000 });
    await page.locator('button').filter({ hasText: /استبدال شامل/i }).first().click();
    const restoreCheckboxes = page.locator('div.fixed input[type="checkbox"]');
    const cbCount = await restoreCheckboxes.count();
    for (let i = 0; i < cbCount; i++) {
      await restoreCheckboxes.nth(i).check();
    }
    const restorePwInputs = page.locator('div.fixed input[type="password"]');
    await restorePwInputs.nth(0).fill('PerfVault!2026');
    await restorePwInputs.nth(1).fill('PerfVault!2026');
    await restorePwInputs.nth(2).fill('EmergencyPerf!2026');
    await restorePwInputs.nth(3).fill('EmergencyPerf!2026');
    await page
      .locator('button')
      .filter({ hasText: /تأكيد واستبدال قاعدة البيانات مع توليد DEK جديد/i })
      .first()
      .click();

    await expect(
      page.locator('text=/تم استعادة وتحديث قاعدة البيانات بنجاح تام/i').first()
    ).toBeVisible({ timeout: 40_000 });

    // Enable CDP 6x CPU throttling across unlock, search & opening PatientWorkspace
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });

    try {
      await page.reload({ waitUntil: 'networkidle' });
      await page.locator('input#password').fill('PerfVault!2026');

      const unlockStart = Date.now();
      await page.locator('button[type="submit"]').click();
      await expect(page.getByTestId('today-walkin-btn')).toBeVisible({ timeout: 25_000 });
      const unlockToRenderedMs = Date.now() - unlockStart;

      // Navigate to Patients Directory (>100 rows triggers window virtualization)
      await page
        .getByRole('complementary')
        .getByRole('button', { name: /المرضى|Patients/i })
        .first()
        .click();

      // Switch to Clinical Table view to assert exact <tr> row virtualization bound
      await page
        .locator('button')
        .filter({ hasText: /جدول سريري|Clinical Table/i })
        .first()
        .click();
      const directoryContainer = page.getByTestId('patient-directory-list');
      await expect(directoryContainer).toBeVisible({ timeout: 10_000 });

      const renderedTableRows = await directoryContainer.locator('tbody tr').count();
      expect(renderedTableRows).toBeGreaterThan(0);
      expect(renderedTableRows).toBeLessThan(45); // Virtualized window out of 125 patients

      // Switch back to Grid cards and measure search query response under 6x CPU throttle
      await page
        .locator('button')
        .filter({ hasText: /بطاقات|Cards/i })
        .first()
        .click();

      const searchInput = page
        .locator('input[placeholder*="بحث فوري"], input[placeholder*="Instant search"]')
        .first();
      const searchStart = Date.now();
      await searchInput.fill('Patient-085');
      await expect(directoryContainer).toContainText('Patient-085', { timeout: 10_000 });
      await expect(directoryContainer).not.toContainText('Patient-001', { timeout: 10_000 });
      const directorySearchMs = Date.now() - searchStart;

      // Open PatientWorkspace under 6x CPU throttle and measure transition time
      const openChartStart = Date.now();
      await directoryContainer
        .locator('button')
        .filter({ hasText: /فتح الملف السريري|Open Patient Chart/i })
        .first()
        .click();
      await expect(
        page
          .locator(
            'button[aria-label*="العودة لدليل المرضى"], button[aria-label*="Back to patient directory"]'
          )
          .first()
      ).toBeVisible({ timeout: 15_000 });
      const openWorkspaceMs = Date.now() - openChartStart;

      console.log(
        `PHASE_A_6X_CPU_BENCHMARK=${JSON.stringify({
          unlockToRenderedMs,
          renderedTableRowsOutOf125: renderedTableRows,
          directorySearchMs,
          openWorkspaceMs,
        })}`
      );

      expect(unlockToRenderedMs).toBeLessThan(12_000);
      expect(directorySearchMs).toBeLessThan(3_500);
      expect(openWorkspaceMs).toBeLessThan(5_000);
    } finally {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => undefined);
      try {
        fs.unlinkSync(perfBackupPath);
      } catch {
        // ignore
      }
    }
  });
});
