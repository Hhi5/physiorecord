import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ORDERED_STATE_SPECS } from './states';
import type {
  AxeMetrics,
  CaptureStateSpec,
  CapturedStateResult,
  ColorMode,
  SideLabel,
  SideRunResult,
  ThemePaletteId,
} from './types';

// Synthetic-only vault passphrase constant (no real PHI is ever entered or accessed)
export const TEST_VAULT_PASSWORD = 'ClinicVault!2026';

export const MOBILE_VIEWPORT = {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
} as const;

const DISABLE_ANIMATIONS_CSS = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    scroll-behavior: auto !important;
  }
`;

export function resolveChromiumLaunchOptions(): {
  executablePath?: string;
  headless: boolean;
  chromiumSandbox?: boolean;
  args: string[];
} {
  const envPath = process.env.PLAYWRIGHT_CHROME_PATH?.trim();
  if (envPath && fs.existsSync(envPath)) {
    return {
      executablePath: envPath,
      headless: true,
      chromiumSandbox: false,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    };
  }

  const defaultExec = chromium.executablePath();
  if (defaultExec && fs.existsSync(defaultExec)) {
    return {
      headless: true,
      args: ['--disable-dev-shm-usage'],
    };
  }

  const containerHeadlessShell = '/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell';
  if (fs.existsSync(containerHeadlessShell)) {
    return {
      executablePath: containerHeadlessShell,
      headless: true,
      chromiumSandbox: false,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    };
  }

  return {
    headless: true,
    args: ['--disable-dev-shm-usage'],
  };
}

async function waitForDeterministicRender(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.evaluate(async (cssText) => {
    if (!document.getElementById('ux-evidence-no-motion')) {
      const style = document.createElement('style');
      style.id = 'ux-evidence-no-motion';
      style.textContent = cssText;
      document.head.appendChild(style);
    }
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
  }, DISABLE_ANIMATIONS_CSS);
}

async function runAxeAudit(page: Page): Promise<AxeMetrics> {
  const results = await new AxeBuilder({ page }).analyze();
  const byImpact = {
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
    unknown: 0,
  };
  let totalAffectedNodes = 0;

  const rules = results.violations.map((v) => {
    const impact = (v.impact || 'unknown') as keyof typeof byImpact;
    if (impact in byImpact) {
      byImpact[impact] += 1;
    } else {
      byImpact.unknown += 1;
    }
    const nodesCount = v.nodes?.length || 0;
    totalAffectedNodes += nodesCount;
    return {
      id: v.id,
      impact: v.impact || 'unknown',
      nodes: nodesCount,
      help: v.help,
    };
  });

  return {
    violationCount: results.violations.length,
    totalAffectedNodes,
    byImpact,
    rules,
  };
}

function makeSpecLookup(): Map<string, CaptureStateSpec> {
  return new Map(ORDERED_STATE_SPECS.map((s) => [s.id, s]));
}

export async function captureSideEvidence(params: {
  side: SideLabel;
  refLabel: string;
  baseUrl: string;
  screenshotsDir: string;
}): Promise<SideRunResult> {
  const { side, refLabel, baseUrl, screenshotsDir } = params;
  const startedAt = new Date().toISOString();
  const sideShotDir = path.join(screenshotsDir, side);
  fs.mkdirSync(sideShotDir, { recursive: true });

  const specById = makeSpecLookup();
  const states: Record<string, CapturedStateResult> = {};
  for (const spec of ORDERED_STATE_SPECS) {
    states[spec.id] = {
      spec,
      status: 'not_captured',
      reason: 'NOT CAPTURED: Capture step did not execute.',
    };
  }

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;

  const markNotCaptured = (stateId: string, reason: string) => {
    const spec = specById.get(stateId);
    if (!spec) return;
    states[stateId] = {
      spec,
      status: 'not_captured',
      reason: reason.startsWith('NOT CAPTURED:') ? reason : `NOT CAPTURED: ${reason}`,
    };
  };

  const captureState = async (
    page: Page,
    stateId: string,
    waitTarget?: Locator
  ): Promise<void> => {
    const spec = specById.get(stateId);
    if (!spec) {
      throw new Error(`Unknown state ID in catalog: ${stateId}`);
    }
    try {
      if (waitTarget) {
        await waitTarget.waitFor({ state: 'visible', timeout: 10_000 });
      }
      await waitForDeterministicRender(page);

      const overflowPx = await page.evaluate(() =>
        Math.round(document.documentElement.scrollWidth - window.innerWidth)
      );
      const axe = await runAxeAudit(page);
      const screenshotPath = path.join(sideShotDir, `${stateId}.png`);
      await page.screenshot({
        path: screenshotPath,
        fullPage: false,
        animations: 'disabled',
      });

      states[stateId] = {
        spec,
        status: 'captured',
        screenshotPath,
        axe,
        horizontalOverflowPx: overflowPx,
      };
      console.log(
        `[${side}] CAPTURED ${stateId} | axe=${axe.violationCount} (${axe.totalAffectedNodes} nodes) | overflow=${overflowPx}px`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
      markNotCaptured(stateId, msg);
      console.warn(`[${side}] NOT CAPTURED ${stateId}: ${msg}`);
    }
  };

  const runSafeStep = async (affectedIds: string[], fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
      for (const id of affectedIds) {
        if (states[id]?.status !== 'captured') {
          markNotCaptured(id, msg);
        }
      }
      console.warn(`[${side}] Step failed (${affectedIds.join(', ')}): ${msg}`);
    }
  };

  // Closes any open Settings / Dialog / fixed modal overlays cleanly
  const closeDialogsIfAny = async (page: Page) => {
    for (let i = 0; i < 6; i++) {
      const dialogCount = await page.locator('[role="dialog"]').count();
      const overlayCloseBtn = page
        .locator(
          [
            '[role="dialog"] button[aria-label*="إغلاق"]',
            '[role="dialog"] button[aria-label*="Close"]',
            'button[aria-label="إغلاق نافذة النسخ الاحتياطي"]',
            'button[aria-label="Close backup modal"]',
            'button[aria-label="إغلاق الإعدادات"]',
            'button[aria-label="Close settings"]',
            'div.fixed.inset-0 button[aria-label="إغلاق"]',
            'div.fixed.inset-0 button[aria-label="Close"]',
          ].join(', ')
        )
        .last();
      const hasOverlayBtn = await overlayCloseBtn.isVisible({ timeout: 250 }).catch(() => false);
      if (dialogCount === 0 && !hasOverlayBtn) break;
      if (hasOverlayBtn) {
        await overlayCloseBtn.click();
      } else {
        await page.keyboard.press('Escape');
      }
      await page.waitForLoadState('domcontentloaded').catch(() => {});
    }
  };

  const openUserMenu = async (page: Page) => {
    const userMenuBtn = page
      .locator(
        'header button[aria-label*="قائمة المستخدم"], header button[aria-label*="User & clinic menu"], header button[aria-haspopup="menu"], header button[aria-haspopup="dialog"], header button[aria-label*="menu"], header button[aria-label*="المستخدم"]'
      )
      .first();
    await userMenuBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await userMenuBtn.click();
    const menu = page
      .locator(
        '[role="dialog"][aria-label*="قائمة المستخدم"], [role="dialog"][aria-label*="User & clinic menu"], [role="menu"]'
      )
      .first();
    await menu.waitFor({ state: 'visible', timeout: 5_000 });
    return menu;
  };

  const openSettingsModal = async (page: Page) => {
    const existingSettings = page.getByTestId('settings-tab-currency');
    if (await existingSettings.isVisible({ timeout: 300 }).catch(() => false)) {
      return;
    }
    const menu = await openUserMenu(page);
    await menu
      .locator('button')
      .filter({ hasText: /الإعدادات والخيارات|Settings/i })
      .first()
      .click();
    await page.getByTestId('settings-tab-currency').waitFor({ state: 'visible', timeout: 10_000 });
    // Ensure Advanced mode is active so all tabs (Staff, Developer) are accessible
    const advBtn = page.getByTestId('settings-mode-advanced-btn');
    if (await advBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      const pressed = await advBtn.getAttribute('aria-pressed');
      if (pressed !== 'true') {
        await advBtn.click();
      }
    }
  };

  const closeSettingsModal = async (page: Page) => {
    const closeFooter = page.getByTestId('settings-modal-close-footer-btn');
    const closeHeader = page
      .locator('button[aria-label*="إغلاق الإعدادات"], button[aria-label*="Close settings"]')
      .first();
    if (await closeHeader.isVisible({ timeout: 500 }).catch(() => false)) {
      await closeHeader.click();
    } else if (await closeFooter.isVisible({ timeout: 500 }).catch(() => false)) {
      await closeFooter.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.getByTestId('settings-tab-currency').waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
  };

  const setColorModeInWorkspace = async (page: Page, targetMode: ColorMode) => {
    const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    if ((targetMode === 'dark' && isDark) || (targetMode === 'light' && !isDark)) {
      return;
    }
    const menu = await openUserMenu(page);
    const toggleBtn = menu
      .locator('button')
      .filter({
        hasText:
          targetMode === 'dark'
            ? /الوضع الليلي|Dark Mode|دۆخی شەو/i
            : /الوضع النهاري|Light Mode|دۆخی ڕۆژ/i,
      })
      .first();
    await toggleBtn.click();
    await page.waitForFunction(
      (wantDark) => document.documentElement.classList.contains('dark') === wantDark,
      targetMode === 'dark'
    );
  };

  const setThemePaletteInWorkspace = async (page: Page, palette: ThemePaletteId) => {
    const current = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    if (current === palette) return;
    await openSettingsModal(page);
    await page.getByTestId('settings-tab-display').click();
    const labelRegex =
      palette === 'theme-ocean-blue'
        ? /أزرق طبي|Ocean Blue/i
        : /المظهر السريري الافتراضي|Clinical Default/i;
    await page.locator('[role="dialog"] button').filter({ hasText: labelRegex }).first().click();
    await page.waitForFunction(
      (want) => document.documentElement.getAttribute('data-theme') === want,
      palette
    );
    await closeSettingsModal(page);
  };

  const navigateBottomTab = async (page: Page, labelRegex: RegExp) => {
    await closeDialogsIfAny(page);
    const btn = page.locator('nav button').filter({ hasText: labelRegex }).first();
    await btn.waitFor({ state: 'visible', timeout: 8_000 });
    await btn.click();
  };

  // Open Patient #1 Chart via PatientDirectory -> QuickViewModal -> MasterPatientChart
  const openFirstPatientQuickView = async (page: Page) => {
    await navigateBottomTab(page, /المرضى|Patients/i);
    await page.getByTestId('patient-directory-list').first().waitFor({ state: 'visible', timeout: 10_000 });
    const firstPatient = page
      .locator('button, [role="button"], h3')
      .filter({ hasText: /أحمد فهد|Ahmed Fahad/i })
      .first();
    await firstPatient.waitFor({ state: 'visible', timeout: 10_000 });
    await firstPatient.click();
    const dialog = page.getByRole('dialog').last();
    await dialog.waitFor({ state: 'visible', timeout: 8_000 });
    // Wait until loading finishes inside QuickView
    await dialog
      .getByRole('button', { name: /فتح الملف السريري|Open Patient Chart/i })
      .waitFor({ state: 'visible', timeout: 10_000 });
    return dialog;
  };

  const openFirstPatientChart = async (page: Page) => {
    const chartTab = page
      .locator('[role="tablist"][aria-label*="الملف السريري"] [role="tab"], [role="tablist"][aria-label*="Patient Chart"] [role="tab"]')
      .first();
    if (await chartTab.isVisible({ timeout: 400 }).catch(() => false)) {
      return;
    }
    const dialog = await openFirstPatientQuickView(page);
    await dialog.getByRole('button', { name: /فتح الملف السريري|Open Patient Chart/i }).click();
    await chartTab.waitFor({ state: 'visible', timeout: 12_000 });
  };

  const clickChartTab = async (page: Page, regex: RegExp) => {
    const tablist = page
      .locator('[role="tablist"][aria-label*="الملف السريري"], [role="tablist"][aria-label*="Patient Chart"]')
      .first();
    const tab = tablist.locator('[role="tab"]').filter({ hasText: regex }).first();
    await tab.scrollIntoViewIfNeeded();
    await tab.click();
    await tab.waitFor({ state: 'visible', timeout: 5_000 });
  };

  // Captures a coherent pass of all Solo-mode screens for the given (theme, mode)
  const runSoloPass = async (page: Page, theme: ThemePaletteId, mode: ColorMode) => {
    const tShort = theme === 'theme-ocean-blue' ? 'ocean-blue' : 'clinical-default';
    const isClinicalDefault = theme === 'theme-clinical-default';
    const suffix = `__${tShort}__${mode}`;

    await closeDialogsIfAny(page);
    await setThemePaletteInWorkspace(page, theme);
    await setColorModeInWorkspace(page, mode);

    // 1. LockScreen (before unlock)
    await runSafeStep([`lock-unlock${suffix}`], async () => {
      const menu = await openUserMenu(page);
      await menu
        .locator('button')
        .filter({ hasText: /قفل الخزينة المشفرة|Lock Vault/i })
        .first()
        .click();
      const unlockPassInput = page.locator('input#password').first();
      await unlockPassInput.waitFor({ state: 'visible', timeout: 10_000 });
      await captureState(page, `lock-unlock${suffix}`, unlockPassInput);
      await unlockPassInput.fill(TEST_VAULT_PASSWORD);
      await page.locator('button[type="submit"]').first().click();
      await page
        .locator('header button[aria-haspopup="menu"], [data-testid="today-walkin-btn"]')
        .first()
        .waitFor({ state: 'visible', timeout: 15_000 });
    });

    // 2. TodayCommandView + WalkInQuickAddModal + End of Day + Schedule
    await runSafeStep(
      [`today-main${suffix}`, `modal-walkin${suffix}`, `today-eod${suffix}`, `schedule-view${suffix}`],
      async () => {
        await navigateBottomTab(page, /اليوم|Today/i);
        await captureState(page, `today-main${suffix}`, page.getByTestId('today-walkin-btn'));

        if (isClinicalDefault) {
          await page.getByTestId('today-walkin-btn').click();
          const walkinInput = page.getByTestId('walkin-name-input');
          await captureState(page, `modal-walkin${suffix}`, walkinInput);
          await closeDialogsIfAny(page);

          await page.getByTestId('today-subtab-eod').click();
          await captureState(page, `today-eod${suffix}`, page.getByTestId('eod-backup-now-btn'));
        }

        await page.getByTestId('today-subtab-schedule').click();
        await captureState(
          page,
          `schedule-view${suffix}`,
          page.locator('h1').filter({ hasText: /جدول المواعيد|Appointment Schedule/i }).first()
        );
      }
    );

    // 3. PatientDirectory + PatientQuickViewModal + PatientModal
    await runSafeStep(
      [`patient-directory${suffix}`, `modal-quick-view${suffix}`, `modal-patient-new${suffix}`],
      async () => {
        await navigateBottomTab(page, /المرضى|Patients/i);
        await captureState(
          page,
          `patient-directory${suffix}`,
          page.getByTestId('patient-directory-list').first()
        );

        if (isClinicalDefault) {
          // New Patient Modal (renders custom fixed overlay with close button aria-label="إغلاق")
          const newPatientBtn = page
            .locator('header button[aria-label*="مريض جديد"], header button[aria-label*="New Patient"]')
            .first();
          await newPatientBtn.click();
          const patientModalClose = page
            .locator('div.fixed.inset-0 button[aria-label="إغلاق"], div.fixed.inset-0 button[aria-label="Close"]')
            .last();
          await captureState(
            page,
            `modal-patient-new${suffix}`,
            patientModalClose
          );
          await closeDialogsIfAny(page);

          // Quick View Modal
          const qvDialog = await openFirstPatientQuickView(page);
          await captureState(page, `modal-quick-view${suffix}`, qvDialog);
          // Open full chart directly from QuickView
          await qvDialog.getByRole('button', { name: /فتح الملف السريري|Open Patient Chart/i }).click();
        } else {
          await openFirstPatientChart(page);
        }
      }
    );

    // 4. MasterPatientChart (All tabs + Exam Preset + Widgets + Modals)
    await runSafeStep(
      [
        `chart-evaluation${suffix}`,
        `chart-widgets-detail${suffix}`,
        `modal-exam-shelf${suffix}`,
        `chart-sessions${suffix}`,
        `modal-episode-new${suffix}`,
        `modal-session-new${suffix}`,
        `chart-comparison${suffix}`,
        `chart-hep${suffix}`,
        `chart-profile${suffix}`,
        `treatment-session-top${suffix}`,
        `treatment-session-body${suffix}`,
      ],
      async () => {
        await openFirstPatientChart(page);
        await clickChartTab(page, /التقييم|Assessment/i);

        // Apply knee regional preset on first pass so ROM, MMT, Special Tests & Functional Scales render
        const expandPresetBtn = page.getByTestId('expand-exam-preset-btn');
        if (await expandPresetBtn.isVisible({ timeout: 500 }).catch(() => false)) {
          await expandPresetBtn.click();
        }
        const kneePresetBtn = page.getByTestId('exam-preset-btn-knee');
        if (await kneePresetBtn.isVisible({ timeout: 800 }).catch(() => false)) {
          await kneePresetBtn.click();
        }
        await captureState(page, `chart-evaluation${suffix}`, page.getByTestId('open-exam-shelf-btn'));

        // Scroll to active exam widgets (ROM / MMT / Special Tests / Functional Scales)
        const widgetHeading = page
          .locator('h3')
          .filter({ hasText: /المدى الحركي|ROM|اختبار القوة العضلية|MMT|الفحوصات العظمية|Special Tests/i })
          .first();
        if (await widgetHeading.waitFor({ state: 'visible', timeout: 8_000 }).then(() => true).catch(() => false)) {
          await widgetHeading.scrollIntoViewIfNeeded();
          await captureState(page, `chart-widgets-detail${suffix}`, widgetHeading);
        } else {
          markNotCaptured(`chart-widgets-detail${suffix}`, 'No exam widget card rendered under Evaluation tab.');
        }

        if (isClinicalDefault) {
          // Scroll back up to click Assessment Tools Shelf button
          await page.getByTestId('open-exam-shelf-btn').scrollIntoViewIfNeeded();
          await page.getByTestId('open-exam-shelf-btn').click();
          await captureState(page, `modal-exam-shelf${suffix}`, page.getByRole('dialog').last());
          await closeDialogsIfAny(page);

          // New Episode Modal
          const newEpBtn = page.locator('button').filter({ hasText: /حلقة جديدة|New Episode/i }).first();
          if (await newEpBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
            await newEpBtn.click();
            await captureState(page, `modal-episode-new${suffix}`, page.getByRole('dialog').last());
            await closeDialogsIfAny(page);
          }

          // New Session Modal
          const newSessBtn = page.locator('button').filter({ hasText: /^جلسة جديدة$|^New Session$/i }).first();
          if (await newSessBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
            await newSessBtn.click();
            await captureState(page, `modal-session-new${suffix}`, page.getByRole('dialog').last());
            await closeDialogsIfAny(page);
          }

          // Comparison, HEP, Profile tabs
          await clickChartTab(page, /التقدم|المقارنة|Progress/i);
          await captureState(page, `chart-comparison${suffix}`, page.locator('h2, h3').first());

          await clickChartTab(page, /الخطة|Plan/i);
          await captureState(page, `chart-hep${suffix}`, page.locator('h2, h3').first());

          await clickChartTab(page, /الملف|Profile/i);
          await captureState(page, `chart-profile${suffix}`, page.locator('h2, h3').first());
        }

        // Sessions Tab -> Open TreatmentSessionView
        await clickChartTab(page, /الجلسات|Sessions/i);
        if (isClinicalDefault) {
          await captureState(page, `chart-sessions${suffix}`, page.getByTestId('chart-sessions-list'));
        }

        // Open a session card (#2 Draft or #1)
        const sessionCard = page.locator('[data-testid="chart-sessions-list"] [role="button"]').first();
        await sessionCard.waitFor({ state: 'visible', timeout: 8_000 });
        await sessionCard.click();

        const sessionBackBtn = page
          .locator('button[aria-label="العودة"], button[aria-label="Go back"]')
          .first();
        await captureState(page, `treatment-session-top${suffix}`, sessionBackBtn);

        if (isClinicalDefault) {
          const soapSectionHeading = page
            .locator('h3')
            .filter({ hasText: /العلاج اليدوي|Manual Therapy|الملاحق|Addenda|التحليل السريري|Assessment/i })
            .first();
          if (await soapSectionHeading.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await soapSectionHeading.scrollIntoViewIfNeeded();
          }
          await captureState(page, `treatment-session-body${suffix}`, sessionBackBtn);
        }

        // Exit session -> back to chart -> back to directory
        if (await sessionBackBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
          await sessionBackBtn.click();
        }
        const chartBackBtn = page
          .locator('button[aria-label*="العودة لقائمة"], button[aria-label*="Back to directory"], button[aria-label*="Back to Patients"]')
          .first();
        if (await chartBackBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await chartBackBtn.click();
        }
      }
    );

    // 5. IraqiFinancialLedgerView (all tabs)
    await runSafeStep(
      [
        `finance-invoices${suffix}`,
        `finance-installments${suffix}`,
        `finance-expenses${suffix}`,
        `finance-zreport${suffix}`,
        `finance-monthly${suffix}`,
      ],
      async () => {
        await navigateBottomTab(page, /المالية|Finance/i);
        await captureState(
          page,
          `finance-invoices${suffix}`,
          page.getByTestId('financial-invoices-list')
        );

        if (isClinicalDefault) {
          const installmentsTab = page.locator('button').filter({ hasText: /الأقساط|Installments/i }).first();
          if (await installmentsTab.isVisible({ timeout: 1_000 }).catch(() => false)) {
            await installmentsTab.click();
            await captureState(page, `finance-installments${suffix}`, page.locator('h2, h3').first());
          } else {
            markNotCaptured(`finance-installments${suffix}`, 'Installments module tab not visible.');
          }

          await page.locator('button').filter({ hasText: /مصاريف العيادة|Expenses/i }).first().click();
          await captureState(page, `finance-expenses${suffix}`, page.locator('h2, h3').first());

          await page.locator('button').filter({ hasText: /الإغلاق اليومي|Z-Report|Daily Cash/i }).first().click();
          await captureState(page, `finance-zreport${suffix}`, page.locator('h2, h3').first());

          await page.locator('button').filter({ hasText: /الملخص الشهري|Monthly/i }).first().click();
          await captureState(page, `finance-monthly${suffix}`, page.locator('input[type="month"]').first());
        }
      }
    );

    // 6. SettingsModal (all tabs + child modals) + AppLayout User Menu
    await runSafeStep(
      [
        `app-user-menu${suffix}`,
        `settings-currency${suffix}`,
        `settings-clinic${suffix}`,
        `settings-display${suffix}`,
        `settings-security${suffix}`,
        `settings-modules${suffix}`,
        `settings-developer${suffix}`,
        `modal-synthetic-data${suffix}`,
        `modal-whats-new${suffix}`,
        `modal-backup-restore${suffix}`,
      ],
      async () => {
        if (isClinicalDefault) {
          const menu = await openUserMenu(page);
          await captureState(page, `app-user-menu${suffix}`, menu);
          await menu
            .locator('button')
            .filter({ hasText: /الإعدادات والخيارات|Settings/i })
            .first()
            .click();
          await page.getByTestId('settings-tab-currency').waitFor({ state: 'visible', timeout: 10_000 });
          const advBtn = page.getByTestId('settings-mode-advanced-btn');
          if ((await advBtn.getAttribute('aria-pressed')) !== 'true') {
            await advBtn.click();
          }
        } else {
          await openSettingsModal(page);
        }

        // Currency Tab
        await page.getByTestId('settings-tab-currency').scrollIntoViewIfNeeded();
        await page.getByTestId('settings-tab-currency').click();
        await captureState(page, `settings-currency${suffix}`);

        if (isClinicalDefault) {
          await page.getByTestId('settings-tab-clinic').scrollIntoViewIfNeeded();
          await page.getByTestId('settings-tab-clinic').click();
          await captureState(page, `settings-clinic${suffix}`);
        }

        // Display Tab
        await page.getByTestId('settings-tab-display').scrollIntoViewIfNeeded();
        await page.getByTestId('settings-tab-display').click();
        await captureState(page, `settings-display${suffix}`);

        if (isClinicalDefault) {
          // Security Tab
          await page.getByTestId('settings-tab-security').scrollIntoViewIfNeeded();
          await page.getByTestId('settings-tab-security').click();
          await captureState(page, `settings-security${suffix}`);

          // Modules Tab
          await page.getByTestId('settings-tab-modules').scrollIntoViewIfNeeded();
          await page.getByTestId('settings-tab-modules').click();
          await captureState(page, `settings-modules${suffix}`);

          // Developer Tab + SyntheticDataModal
          await page.getByTestId('settings-tab-developer').scrollIntoViewIfNeeded();
          await page.getByTestId('settings-tab-developer').click();
          await captureState(page, `settings-developer${suffix}`);

          await page
            .locator('button')
            .filter({ hasText: /فتح نافذة تحميل|Load Demo Cases/i })
            .first()
            .click();
          const synthSeedBtn = page.getByTestId('synthetic-seed-btn');
          await captureState(page, `modal-synthetic-data${suffix}`, synthSeedBtn);
          await synthSeedBtn
            .locator('xpath=..')
            .locator('button')
            .filter({ hasText: /^إغلاق$|^Close$/i })
            .first()
            .click();
          await synthSeedBtn.waitFor({ state: 'hidden', timeout: 5_000 });

          // What's New Modal (from Settings header)
          await page.getByTestId('open-whats-new-btn').click();
          const whatsNewModal = page.getByTestId('whats-new-modal');
          const whatsNewClose = page.getByTestId('whats-new-close-btn');
          await captureState(page, `modal-whats-new${suffix}`, whatsNewModal);
          await whatsNewClose.click();
          await whatsNewModal.waitFor({ state: 'hidden', timeout: 5_000 });

          await closeSettingsModal(page);

          // Backup & Restore Modal (via User Menu)
          const menu = await openUserMenu(page);
          await menu.locator('button').filter({ hasText: /النسخ الاحتياطي والاستعادة|Backup & Restore/i }).first().click();
          const backupCloseBtn = page
            .locator('button[aria-label*="إغلاق نافذة النسخ"], button[aria-label*="Close backup modal"]')
            .first();
          await captureState(page, `modal-backup-restore${suffix}`, backupCloseBtn);
          await backupCloseBtn.click();
          await backupCloseBtn.waitFor({ state: 'hidden', timeout: 5_000 });
        } else {
          await closeSettingsModal(page);
        }
      }
    );
  };

  // Team Mode pass (Settings Staff tab, ReceptionCommandCenterView, Mobile More drawer, ActivityLogView)
  const runTeamModePass = async (page: Page, mode: ColorMode) => {
    const suffix = `__clinical-default__${mode}`;
    await closeDialogsIfAny(page);
    await setThemePaletteInWorkspace(page, 'theme-clinical-default');
    await setColorModeInWorkspace(page, mode);

    await runSafeStep(
      [
        `settings-staff${suffix}`,
        `team-reception${suffix}`,
        `team-mobile-more${suffix}`,
        `team-activity-log${suffix}`,
      ],
      async () => {
        // Ensure Team Mode is active via Settings -> Clinic
        await openSettingsModal(page);
        await page.getByTestId('settings-tab-clinic').click();
        const teamModeBtn = page
          .locator('[role="dialog"] button')
          .filter({ hasText: /عيادة مع فريق وكادر|I Have a Team/i })
          .first();
        if (await teamModeBtn.isVisible({ timeout: 1_500 }).catch(() => false)) {
          await teamModeBtn.click();
          const pinSaveBtn = page
            .locator('button')
            .filter({ hasText: /حفظ رمز المدير|Save (?:Encrypted )?Admin PIN/i })
            .first();
          if (await pinSaveBtn.waitFor({ state: 'visible', timeout: 2_500 }).catch(() => false)) {
            const pinInputs = page.locator('input[type="password"]');
            const cnt = await pinInputs.count();
            for (let idx = 0; idx < cnt; idx++) {
              await pinInputs.nth(idx).fill('8472');
            }
            await pinSaveBtn.click();
            await pinSaveBtn.waitFor({ state: 'hidden', timeout: 5_000 });
          }
        }

        // Capture Settings -> Staff tab
        const staffTab = page.getByTestId('settings-tab-staff');
        await staffTab.scrollIntoViewIfNeeded();
        await staffTab.click();
        await captureState(page, `settings-staff${suffix}`);
        await closeSettingsModal(page);

        // Reception Command Center (Queue tab on bottom nav)
        await navigateBottomTab(page, /الطابور|Queue/i);
        await captureState(
          page,
          `team-reception${suffix}`,
          page.locator('h1, h2').filter({ hasText: /الاستقبال|الطابور|Reception/i }).first()
        );

        // Open Mobile More Drawer
        const moreBtn = page.locator('nav button[aria-label*="المزيد"], nav button[aria-label*="More"]').first();
        await moreBtn.click();
        const moreDialog = page.locator('[role="dialog"][aria-label*="المزيد"], [role="dialog"][aria-label*="More"]').first();
        await captureState(page, `team-mobile-more${suffix}`, moreDialog);

        // Navigate to Activity Log & Staff Roles from Mobile More Drawer
        await moreDialog
          .locator('button')
          .filter({ hasText: /سجل النشاط والكادر|Audit & Staff Roles/i })
          .first()
          .click();
        await captureState(
          page,
          `team-activity-log${suffix}`,
          page.locator('h1, h2').filter({ hasText: /سجل|النشاط|Activity|Audit/i }).first()
        );
      }
    );
  };

  try {
    const launchOpts = resolveChromiumLaunchOptions();
    browser = await chromium.launch(launchOpts);
    context = await browser.newContext({
      viewport: { width: MOBILE_VIEWPORT.width, height: MOBILE_VIEWPORT.height },
      deviceScaleFactor: MOBILE_VIEWPORT.deviceScaleFactor,
      isMobile: MOBILE_VIEWPORT.isMobile,
      hasTouch: MOBILE_VIEWPORT.hasTouch,
      locale: 'ar-IQ',
      reducedMotion: 'reduce',
    });

    await context.addInitScript((cssText) => {
      const inject = () => {
        if (document.head && !document.getElementById('ux-evidence-no-motion')) {
          const style = document.createElement('style');
          style.id = 'ux-evidence-no-motion';
          style.textContent = cssText;
          document.head.appendChild(style);
        }
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inject, { once: true });
      } else {
        inject();
      }
    }, DISABLE_ANIMATIONS_CSS);

    const page = await context.newPage();

    // ---------------------------------------------------------
    // First Run: Vault Init, Recovery Key, Mode Wizard, Synthetic Data
    // ---------------------------------------------------------
    await page.goto(baseUrl, { waitUntil: 'networkidle' });

    const setupPassword = page.locator('input#password').first();
    await setupPassword.waitFor({ state: 'visible', timeout: 20_000 });
    await captureState(page, 'lock-setup__clinical-default__light', setupPassword);

    await setupPassword.fill(TEST_VAULT_PASSWORD);
    await page.locator('input#confirmPassword').first().fill(TEST_VAULT_PASSWORD);
    await page.locator('button[type="submit"]').first().click();

    const enterWorkspaceBtn = page
      .locator('button')
      .filter({ hasText: /الدخول إلى مساحة العمل|Enter Clinical Workspace/i })
      .first();
    await enterWorkspaceBtn.waitFor({ state: 'visible', timeout: 20_000 });
    await captureState(page, 'lock-recovery__clinical-default__light', enterWorkspaceBtn);

    const challengeInput = page.locator('input#challenge-group-input, input[type="text"]').first();
    const expectedGroup = (await challengeInput.getAttribute('placeholder')) || '';
    if (expectedGroup) {
      await challengeInput.fill(expectedGroup);
    }
    await page.locator('input[type="checkbox"]').first().check();
    await enterWorkspaceBtn.click();

    // FirstRunModeWizardModal -> Solo mode
    const soloModeBtn = page.getByTestId('wizard-mode-solo');
    await soloModeBtn.waitFor({ state: 'visible', timeout: 20_000 });
    await soloModeBtn.click();
    await page.getByTestId('wizard-confirm-btn').click();
    await page.getByTestId('today-walkin-btn').waitFor({ state: 'visible', timeout: 20_000 });

    // Seed synthetic data exclusively through SyntheticDataModal + enable optional modules so every tab is reachable
    await openSettingsModal(page);
    await page.getByTestId('settings-tab-modules').click();
    const restoreHepBtn = page.locator('button').filter({ hasText: /استعادة وإظهار|Restore & Show Exercise/i }).first();
    if (await restoreHepBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await restoreHepBtn.click();
    }
    const instBtn = page.getByTestId('toggle-installment-plans-btn');
    if (await instBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      const pressed = await instBtn.getAttribute('aria-pressed');
      if (pressed !== 'true') await instBtn.click();
    }
    await page.getByTestId('settings-tab-developer').click();
    await page.locator('button').filter({ hasText: /فتح نافذة تحميل|Load Demo Cases/i }).first().click();
    await page.getByTestId('synthetic-seed-btn').waitFor({ state: 'visible', timeout: 10_000 });
    await page.getByTestId('synthetic-seed-btn').click();
    await page.locator('text=/تم إدراج|Successfully seeded/i').first().waitFor({ state: 'visible', timeout: 30_000 });
    await page
      .getByTestId('synthetic-seed-btn')
      .locator('xpath=..')
      .locator('button')
      .filter({ hasText: /^إغلاق$|^Close$/i })
      .first()
      .click();
    await page.getByTestId('synthetic-seed-btn').waitFor({ state: 'hidden', timeout: 5_000 });
    await closeSettingsModal(page);

    // ---------------------------------------------------------
    // Capture Passes (Arabic RTL @ 390x844 DPR 2)
    // ---------------------------------------------------------
    await runSoloPass(page, 'theme-clinical-default', 'light');
    await runSoloPass(page, 'theme-clinical-default', 'dark');
    await runSoloPass(page, 'theme-ocean-blue', 'light');
    await runSoloPass(page, 'theme-ocean-blue', 'dark');

    // Team Mode Passes (Reception, Staff Settings, Mobile More, Activity Log)
    await runTeamModePass(page, 'light');
    await runTeamModePass(page, 'dark');
  } catch (err: unknown) {
    const fatalMsg = err instanceof Error ? err.message : String(err);
    console.error(`[${side}] Fatal capture error:`, fatalMsg);
    return {
      side,
      refLabel,
      baseUrl,
      startedAt,
      finishedAt: new Date().toISOString(),
      unavailableReason: fatalMsg,
      states,
    };
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }

  return {
    side,
    refLabel,
    baseUrl,
    startedAt,
    finishedAt: new Date().toISOString(),
    states,
  };
}
