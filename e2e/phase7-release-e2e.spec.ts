import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const SHOT_DIR = 'test-results/phase7-rtl-visuals';

async function completeFirstRunToSolo(page: Page, password: string) {
  await page.goto('/', { waitUntil: 'networkidle' });

  await page.locator('input#password').fill(password);
  await page.locator('input#confirmPassword').fill(password);
  await page.locator('button[type="submit"]').click();

  // Recovery Key confirmation group
  const challengeInput = page.locator('input[type="text"]').first();
  await expect(challengeInput).toBeVisible({ timeout: 10_000 });
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

  // Clinic Mode Wizard -> Solo Mode
  const soloBtn = page.getByTestId('wizard-mode-solo');
  await expect(soloBtn).toBeVisible({ timeout: 10_000 });
  await soloBtn.click();
  await page.getByTestId('wizard-confirm-btn').click();
  await expect(page.getByTestId('today-walkin-btn')).toBeVisible({ timeout: 15_000 });
}

interface RtlLayoutContract {
  screen: string;
  dir: string;
  lang: string;
  viewport: string;
  horizontalOverflowPx: number;
  hasSidebar: boolean;
  sidebarOnExpectedSide: boolean | null;
  allButtonsLabeled: boolean;
  minVisibleFontPx: number;
}

async function captureRtlSnapshotAndAxe(
  page: Page,
  screenName: string,
  opts: { lang: 'ar' | 'en'; viewport: { width: number; height: number } }
): Promise<RtlLayoutContract> {
  await page.waitForTimeout(250);

  // Run automated axe-core WCAG 2.0/2.1 A/AA check
  const axeResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  const seriousOrCritical = axeResults.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious'
  );
  expect(
    seriousOrCritical,
    `axe-core critical/serious violations on ${screenName} (${opts.lang} ${opts.viewport.width}x${opts.viewport.height}):\n` +
      JSON.stringify(
        seriousOrCritical.map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          nodes: v.nodes.slice(0, 3).map((n) => ({ target: n.target, html: n.html.slice(0, 140) })),
        })),
        null,
        2
      )
  ).toEqual([]);

  // Save visual screenshot for manual/visual inspection and optional same-platform baseline compare
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const shotPath = path.join(SHOT_DIR, `${screenName}-${opts.lang}-${opts.viewport.width}x${opts.viewport.height}.png`);
  await page.screenshot({ path: shotPath, fullPage: false });

  // Measure structural RTL/LTR layout contract (deterministic across Windows & Ubuntu Linux CI)
  const layout = await page.evaluate(() => {
    const dir = document.documentElement.dir || 'ltr';
    const lang = document.documentElement.lang || 'ar';
    const overflowPx = Math.round(document.documentElement.scrollWidth - window.innerWidth);
    const aside = document.querySelector('aside');
    const main = document.querySelector('main');
    const asideRect = aside?.getBoundingClientRect();
    const mainRect = main?.getBoundingClientRect();
    const hasVisibleSidebar = Boolean(asideRect && asideRect.width > 40 && asideRect.height > 100);

    let sidebarOnExpectedSide: boolean | null = null;
    if (hasVisibleSidebar && asideRect && mainRect) {
      // In RTL (Arabic), sidebar is docked on the right (aside.left >= main.right - 2)
      // In LTR (English), sidebar is docked on the left (aside.right <= main.left + 2)
      sidebarOnExpectedSide =
        dir === 'rtl' ? asideRect.left >= mainRect.right - 4 : asideRect.right <= mainRect.left + 4;
    }

    let allButtonsLabeled = true;
    for (const btn of Array.from(document.querySelectorAll('button, [role="button"]'))) {
      const r = btn.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      const st = getComputedStyle(btn);
      if (st.display === 'none' || st.visibility === 'hidden') continue;
      const label =
        (btn.textContent || '').trim() ||
        (btn.getAttribute('aria-label') || '').trim() ||
        (btn.getAttribute('title') || '').trim() ||
        (btn.getAttribute('aria-labelledby') || '').trim();
      if (!label) {
        allButtonsLabeled = false;
        break;
      }
    }

    let minFont = 99;
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) === 0) continue;
      let directText = '';
      for (const node of Array.from(el.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE && node.textContent) directText += node.textContent;
      }
      if (!directText.trim()) continue;
      const fsPx = parseFloat(st.fontSize || '14');
      if (fsPx < minFont) minFont = fsPx;
    }

    return {
      dir,
      lang,
      horizontalOverflowPx: Math.max(0, overflowPx),
      hasSidebar: hasVisibleSidebar,
      sidebarOnExpectedSide,
      allButtonsLabeled,
      minVisibleFontPx: minFont === 99 ? 14 : Math.round(minFont * 10) / 10,
    };
  });

  expect(layout.dir).toBe(opts.lang === 'ar' ? 'rtl' : 'ltr');
  expect(layout.horizontalOverflowPx).toBeLessThanOrEqual(2);
  if (layout.sidebarOnExpectedSide !== null) {
    expect(layout.sidebarOnExpectedSide).toBe(true);
  }
  expect(layout.allButtonsLabeled).toBe(true);
  expect(layout.minVisibleFontPx).toBeGreaterThanOrEqual(12);

  return {
    screen: screenName,
    viewport: `${opts.viewport.width}x${opts.viewport.height}`,
    ...layout,
  };
}

test.describe('Phase 7 — Full Release E2E, Accessibility (axe-core), RTL Visual Snapshots & PWA Offline', () => {
  test('full clinical journey (first run -> patient -> appointment -> session -> finalize -> payment -> backup -> restore) & PWA offline', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    // Disable native OS SaveFilePicker in test runtime so browser download events fire deterministically
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

    const externalRequests: string[] = [];
    const failedRequests: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      if (
        !url.startsWith('http://127.0.0.1:4173') &&
        !url.startsWith('data:') &&
        !url.startsWith('blob:')
      ) {
        externalRequests.push(url);
      }
    });
    page.on('requestfailed', (req) => {
      const url = req.url();
      // Ignore canceled requests triggered intentionally during reload tests
      if (!url.startsWith('http://127.0.0.1:4173')) {
        failedRequests.push(`${url} (${req.failure()?.errorText || 'failed'})`);
      }
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await completeFirstRunToSolo(page, 'ClinicVault!2026');

    // Verify /manifest.webmanifest is valid & same-origin via request API (page fetch is intentionally blocked by connect-src 'none')
    const manifestRes = await page.request.get('/manifest.webmanifest');
    expect(manifestRes.ok()).toBe(true);
    const manifestJson = await manifestRes.json();
    expect(manifestJson.display).toBe('standalone');
    expect(manifestJson.dir).toBe('rtl');

    // Measure Solo Therapist <60s full visit flow:
    // Walk-In (creates Patient + Appointment + Session #1) -> Quick SOAP -> Finalize -> Payment -> Next Visit
    const visitStartMs = Date.now();

    await page.getByTestId('today-walkin-btn').click();
    await page.getByTestId('walkin-name-input').fill('زهراء كريم العلي');
    await page.getByTestId('walkin-submit-btn').click();

    // TreatmentSessionView opens on Session #1
    await expect(page.locator('button').filter({ hasText: /إنهاء واعتماد|Finish & Sign/i }).first()).toBeVisible({
      timeout: 12_000,
    });

    // 1) Pre-Session Pain NPRS = 7, Post-Session Pain NPRS = 3
    const nprsGroups = page.locator('div.p-4.rounded-xl.bg-surface').filter({
      hasText: /شدة الألم|Pre-Session Pain|Post-Session Pain/i,
    });
    await nprsGroups.nth(0).locator('button', { hasText: /^7$/ }).first().click();
    await nprsGroups.nth(1).locator('button', { hasText: /^3$/ }).first().click();

    // 2) Add an exercise entry to flowsheet
    await page.locator('button').filter({ hasText: /إدراج تمرين|Add Exercise/i }).first().click();

    // 3) Fill Chief Complaint & Clinical Impression & select Progress Status
    await page
      .locator('textarea[placeholder*="شكوى المريض"], textarea[placeholder*="chief complaint"]')
      .first()
      .fill('ألم أسفل الظهر منذ أسبوعين يزداد بالجلوس الطويل');

    await page
      .locator('select')
      .filter({ has: page.locator('option[value="improved"]') })
      .first()
      .selectOption('improved');

    await page
      .locator('textarea[placeholder*="التفسير السريري"], textarea[placeholder*="clinical reasoning"]')
      .first()
      .fill('استجابة جيدة للعلاج اليدوي وتمارين الثبات القطني مع تراجع الألم من 7 إلى 3.');

    // 4) Open Finish Sequence Flow
    await page.locator('button').filter({ hasText: /إنهاء واعتماد|Finish & Sign/i }).first().click();

    // Step 1: Confirm Sign & Lock (SHA-256 immutable seal)
    await page.getByTestId('finish-step1-finalize-btn').click();

    // Step 2: Financial Payment (verify blank/zero defaults preserved per clinic policy, then enter 25,000 IQD ZainCash)
    await expect(page.getByTestId('finish-step2-next-btn')).toBeVisible({ timeout: 10_000 });
    const totalAmountInput = page.locator('[role="dialog"] input[inputmode="numeric"]').first();
    await expect(totalAmountInput).toHaveValue('0');
    await totalAmountInput.fill('25000');
    await page.locator('button').filter({ hasText: /^ZainCash$/ }).first().click();
    await page.getByTestId('finish-step2-next-btn').click();

    // Step 3: Next Visit Auto-Scheduled -> Complete Finish Flow
    await expect(page.getByTestId('finish-step3-complete-btn')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('finish-step3-complete-btn').click();
    await expect(page.getByTestId('finish-step3-complete-btn')).toBeHidden({ timeout: 10_000 });

    const elapsedVisitMs = Date.now() - visitStartMs;
    console.log(`PHASE7_SOLO_VISIT_DURATION_MS=${elapsedVisitMs}`);
    expect(elapsedVisitMs, 'Solo full visit flow must finish in under 60s').toBeLessThan(60_000);

    // 5) Verify Finalized SOAP Immutability + Append-Only Addendum
    await expect(
      page.locator('button').filter({ hasText: /إنهاء واعتماد|Finish & Sign/i })
    ).toHaveCount(0);

    const addendumTextarea = page
      .locator('textarea[placeholder*="التوضيح السريري"], textarea[placeholder*="clinical addendum"]')
      .first();
    await expect(addendumTextarea).toBeVisible({ timeout: 10_000 });
    await addendumTextarea.fill('ملحق سريري: تم تزويد المريضة ببرنامج التمارين المنزلية اليومية.');
    await page
      .locator('button')
      .filter({ hasText: /إدراج الملحق السريري|Append Clinical Addendum/i })
      .first()
      .click();
    await expect(
      page.locator('text=/ملحق سريري: تم تزويد المريضة/i').first()
    ).toBeVisible({ timeout: 10_000 });

    // 6) Navigate Back to Today -> EOD -> Verify Payment + Next Visit + Export .ptbackup
    await page
      .locator('aside button[aria-label="اليوم"], aside button[aria-label="Today"]')
      .first()
      .click();
    await expect(page.getByTestId('today-subtab-eod')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('today-subtab-eod').click();

    // Iraqi currency formatting invariant: symbol AFTER number ("25,000 د.ع")
    await expect(page.locator('main')).toContainText(/25,000\s*د\.ع/);

    await page.getByTestId('eod-backup-now-btn').click();
    await expect(
      page.locator('button').filter({ hasText: /تصدير وتحقق وحفظ ملف النسخة/i }).first()
    ).toBeVisible({ timeout: 10_000 });

    // Fill export password & uncheck File System picker if present
    const exportTabCheckboxes = page.locator('div.fixed input[type="checkbox"]');
    if ((await exportTabCheckboxes.count()) > 0 && (await exportTabCheckboxes.first().isChecked())) {
      await exportTabCheckboxes.first().uncheck();
    }
    const exportPwInputs = page.locator('div.fixed input[type="password"]');
    await exportPwInputs.nth(0).fill('BackupPass!2026');
    await exportPwInputs.nth(1).fill('BackupPass!2026');

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      page.locator('button').filter({ hasText: /تصدير وتحقق وحفظ ملف النسخة/i }).first().click(),
    ]);

    const downloadedPath = path.join(os.tmpdir(), `phase7-e2e-${Date.now()}.ptbackup`);
    await download.saveAs(downloadedPath);
    const backupJsonText = fs.readFileSync(downloadedPath, 'utf8');
    const parsedBackup = JSON.parse(backupJsonText);
    expect(parsedBackup.header.magic).toBe('PHYSIORECORD_BACKUP_V3.0');
    expect(parsedBackup.header.schemaVersion).toBe(10);
    await expect(
      page.locator('text=/تم تصدير النسخة الاحتياطية والتحقق من سلامتها بنجاح/i').first()
    ).toBeVisible({ timeout: 20_000 });

    // 7) Restore from the exported .ptbackup inside the same modal
    await page.locator('button').filter({ hasText: /استعادة نسخة احتياطية/i }).first().click();
    await page.locator('div.fixed input[type="file"]').setInputFiles(downloadedPath);
    await page
      .locator('div.fixed input[placeholder*="كلمة المرور التي حُمي بها"]')
      .fill('BackupPass!2026');
    await page
      .locator('button')
      .filter({ hasText: /فحص ومعاينة السجلات قبل الاستعادة/i })
      .first()
      .click();

    await expect(page.locator('text=/1 مريض/').first()).toBeVisible({ timeout: 20_000 });
    await page.locator('button').filter({ hasText: /استبدال شامل/i }).first().click();
    const restoreCheckboxes = page.locator('div.fixed input[type="checkbox"]');
    const checkboxCount = await restoreCheckboxes.count();
    for (let i = 0; i < checkboxCount; i++) {
      await restoreCheckboxes.nth(i).check();
    }

    const restorePwInputs = page.locator('div.fixed input[type="password"]');
    await restorePwInputs.nth(0).fill('RestoredVault!2026');
    await restorePwInputs.nth(1).fill('RestoredVault!2026');
    await restorePwInputs.nth(2).fill('EmergencyPass!2026');
    await restorePwInputs.nth(3).fill('EmergencyPass!2026');

    const confirmRestoreBtn = page
      .locator('button')
      .filter({ hasText: /تأكيد واستبدال قاعدة البيانات مع توليد DEK جديد/i })
      .first();
    await confirmRestoreBtn.click();

    await expect(
      page.locator('text=/تم استعادة وتحديث قاعدة البيانات بنجاح تام/i').first()
    ).toBeVisible({ timeout: 30_000 });

    await page
      .locator('button')
      .filter({ hasText: /إغلاق والعودة للسجلات السريرية/i })
      .first()
      .click();

    // 8) Reload and unlock with the new restored password to prove durable IndexedDB persistence
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('input#password').fill('RestoredVault!2026');
    await page.locator('button[type="submit"]').click();
    await expect(page.getByTestId('today-walkin-btn')).toBeVisible({ timeout: 20_000 });

    // Confirm restored patient & schedule exist cleanly
    await page
      .getByRole('complementary')
      .getByRole('button', { name: /المرضى|Patients/i })
      .first()
      .click();
    await expect(page.locator('main')).toContainText('زهراء كريم العلي');

    // Confirm restored payment survives in Finance ledger
    await page
      .getByRole('complementary')
      .getByRole('button', { name: /الحسابات|Finance/i })
      .first()
      .click();
    await expect(page.locator('main')).toContainText(/25,000\s*د\.ع/);

    // 9) PWA Service Worker & Offline Navigation Test
    const swRegistered = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const reg = await Promise.race([
        navigator.serviceWorker.ready.then(() => true),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000)),
      ]);
      return reg;
    });
    expect(swRegistered).toBe(true);

    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('input#password')).toBeVisible({ timeout: 10_000 });
    await context.setOffline(false);

    // Zero external network requests across the entire session
    expect(externalRequests).toEqual([]);
    expect(failedRequests).toEqual([]);

    try {
      fs.unlinkSync(downloadedPath);
    } catch {
      // ignore temp cleanup
    }
  });

  test('runs automated axe-core WCAG 2.1 AA checks & deterministic RTL/LTR visual snapshots', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const snapshots: RtlLayoutContract[] = [];

    // 1. Setup Password Screen (Arabic RTL Light 1440x900)
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'networkidle' });
    snapshots.push(
      await captureRtlSnapshotAndAxe(page, '01-lock-setup', {
        lang: 'ar',
        viewport: { width: 1440, height: 900 },
      })
    );

    // Finish setup into workspace
    await completeFirstRunToSolo(page, 'AxeSnapshot!2026');

    // 2. Today Command View (Arabic RTL Light 1440x900)
    snapshots.push(
      await captureRtlSnapshotAndAxe(page, '02-today-solo', {
        lang: 'ar',
        viewport: { width: 1440, height: 900 },
      })
    );

    // 3. Mobile Arabic RTL View (390x844)
    await page.setViewportSize({ width: 390, height: 844 });
    snapshots.push(
      await captureRtlSnapshotAndAxe(page, '03-today-mobile', {
        lang: 'ar',
        viewport: { width: 390, height: 844 },
      })
    );

    // 4. Desktop Walk-In Quick SOAP (Dark Mode Arabic RTL 1440x900)
    await page.setViewportSize({ width: 1440, height: 900 });
    const userMenuBtn = page
      .locator('header button[aria-label*="menu"], header button[aria-label*="المستخدم"]')
      .first();
    await userMenuBtn.click();
    await page.locator('button').filter({ hasText: /الوضع الليلي|Dark Mode/i }).click();

    await page.getByTestId('today-walkin-btn').click();
    await page.getByTestId('walkin-name-input').fill('سارة جعفر');
    await page.getByTestId('walkin-submit-btn').click();
    await expect(page.locator('main textarea').first()).toBeVisible({ timeout: 10_000 });
    snapshots.push(
      await captureRtlSnapshotAndAxe(page, '04-quick-soap-dark', {
        lang: 'ar',
        viewport: { width: 1440, height: 900 },
      })
    );

    // 5. Financial Ledger (Arabic RTL Light 1440x900)
    await userMenuBtn.click();
    await page.locator('button').filter({ hasText: /الوضع النهاري|Light Mode/i }).click();
    await page
      .getByRole('complementary')
      .getByRole('button', { name: /الحسابات|Finance/i })
      .first()
      .click();
    await expect(page.locator('main')).toContainText(/الحسابات|الإيرادات|المالية|Finance/i, {
      timeout: 10_000,
    });
    snapshots.push(
      await captureRtlSnapshotAndAxe(page, '05-finance-ledger', {
        lang: 'ar',
        viewport: { width: 1440, height: 900 },
      })
    );

    // 6. Patient Directory in English LTR (Light 1440x900) to confirm RTL/LTR symmetry
    await userMenuBtn.click();
    await page.locator('button').filter({ hasText: /^EN$/ }).click();
    await page
      .getByRole('complementary')
      .getByRole('button', { name: /Patients|المرضى/i })
      .first()
      .click();
    await expect(page.locator('main')).toContainText(/Patients|Directory|سارة جعفر/i, {
      timeout: 10_000,
    });
    snapshots.push(
      await captureRtlSnapshotAndAxe(page, '06-directory-ltr', {
        lang: 'en',
        viewport: { width: 1440, height: 900 },
      })
    );

    // Commit/verify deterministic RTL & LTR layout contract snapshot across OS environments
    expect(JSON.stringify(snapshots, null, 2)).toMatchSnapshot('rtl-ltr-visual-contract.json');
  });
});
