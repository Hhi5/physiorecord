// =======================================================================
// PhysioRecord — Phase F E2E Verification Suite (F1–F5)
// Verifies:
// - F1: Searchable Settings, Simple/Advanced switch, Unified 6-pillar Hub
// - F2: 4-step dismissible Onboarding Checklist & Teaching Empty States
// - F3: In-app "What's New" CHANGELOG & Dexie v1–v10 Migration Guide
// - F4: CC0-1.0 Iraqi Synthetic Data Generator & Public Demo Mode banner
// - Arabic RTL & English LTR parity + Zero external network requests
// =======================================================================

import { test, expect, type Page } from '@playwright/test';

async function completeFirstRunToSolo(page: Page, password: string): Promise<void> {
  await page.addInitScript(() => {
    try {
      Object.defineProperty(window, 'showSaveFilePicker', {
        value: undefined,
        configurable: true,
        writable: true,
      });
      window.print = () => {};
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

test.describe('Phase F: Settings, Onboarding Checklist, What\'s New & Public Demo Mode (F1–F4)', () => {
  test('verifies F1–F4 flows in Arabic RTL & English LTR with zero external network requests', async ({
    page,
  }) => {
    test.setTimeout(180_000);

    const externalRequests: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      if (
        !url.startsWith('http://127.0.0.1') &&
        !url.startsWith('http://localhost') &&
        !url.startsWith('data:') &&
        !url.startsWith('blob:')
      ) {
        externalRequests.push(url);
      }
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await completeFirstRunToSolo(page, 'ClinicVault!2026');

    // -------------------------------------------------------------------
    // 1) F2: Dismissible 4-Step Onboarding Checklist & Teaching Empty States
    // -------------------------------------------------------------------
    const checklistCard = page.getByTestId('onboarding-checklist-card');
    await expect(checklistCard).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('onboarding-checklist-progress')).toContainText('/ 4');
    await expect(page.getByTestId('onboarding-step-clinic_profile')).toBeVisible();
    await expect(page.getByTestId('onboarding-step-first_patient')).toBeVisible();
    await expect(page.getByTestId('onboarding-step-first_backup')).toBeVisible();
    await expect(page.getByTestId('onboarding-step-verify_recovery_key')).toBeVisible();

    // Dismiss and restore the Onboarding Checklist
    await page.getByTestId('onboarding-checklist-dismiss-btn').click();
    await expect(checklistCard).toBeHidden();
    const restoreBtn = page.getByTestId('onboarding-checklist-restore-btn');
    await expect(restoreBtn).toBeVisible();
    await restoreBtn.click();
    await expect(checklistCard).toBeVisible();

    // Verify Today teaching empty state (1 sentence + 1 primary button)
    await expect(page.getByTestId('today-empty-state')).toBeVisible();
    await expect(page.getByTestId('today-empty-primary-btn')).toBeVisible();

    // Verify Schedule teaching empty state (via Today > Full Schedule subtab)
    await page.getByTestId('today-subtab-schedule').click();
    await expect(page.getByTestId('schedule-empty-state')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('schedule-empty-primary-btn')).toBeVisible();

    // Verify Patients Directory teaching empty state
    await page
      .locator('aside button')
      .filter({ hasText: /المرضى|Patients/i })
      .first()
      .click();
    await expect(page.getByTestId('patients-empty-state')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('patients-empty-primary-btn')).toBeVisible();

    // Verify Financial Ledger teaching empty state
    await page
      .locator('aside button')
      .filter({ hasText: /الحسابات|Finance/i })
      .first()
      .click();
    await expect(page.getByTestId('finance-invoices-empty-state')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('finance-empty-primary-btn')).toBeVisible();

    // -------------------------------------------------------------------
    // 2) F1 & F3: Settings Search, Simple/Advanced Switch & In-App What's New
    // -------------------------------------------------------------------
    await page.locator('header button[aria-expanded]').click();
    await page
      .locator('button')
      .filter({ hasText: /الإعدادات والخيارات|Settings/i })
      .first()
      .click();

    await expect(page.getByTestId('settings-search-input')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('settings-tab-currency')).toBeVisible();
    await expect(page.getByTestId('settings-tab-clinic')).toBeVisible();
    await expect(page.getByTestId('settings-tab-display')).toBeVisible();
    await expect(page.getByTestId('settings-tab-staff')).toBeHidden();
    await expect(page.getByTestId('settings-tab-security')).toBeVisible();
    await expect(page.getByTestId('settings-tab-modules')).toBeVisible();
    await expect(page.getByTestId('settings-tab-developer')).toBeVisible();

    // Test Settings Search
    await page.getByTestId('settings-search-input').fill('نسخ احتياطي');
    await expect(page.getByTestId('settings-search-results')).toBeVisible();
    await expect(
      page.getByTestId('settings-search-result-hub-backup-restore')
    ).toBeVisible();
    await page.getByTestId('settings-search-result-hub-backup-restore').click();
    await expect(page.getByTestId('settings-backup-hub-card')).toBeVisible();

    // Test Simple vs Advanced Mode Switch
    await page.getByTestId('settings-mode-simple-btn').click();
    await expect(page.getByTestId('settings-tab-developer')).toBeHidden();
    await expect(page.getByTestId('settings-simple-mode-notice')).toBeVisible();

    // Switch back to Advanced Mode
    await page.getByTestId('settings-mode-advanced-btn').click();
    await expect(page.getByTestId('settings-tab-developer')).toBeVisible();

    // Test F3: In-App What's New & Dexie v1–v10 Migration Guide
    await page.getByTestId('open-whats-new-btn').click();
    const whatsNewModal = page.getByTestId('whats-new-modal');
    await expect(whatsNewModal).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('whats-new-semver-badge')).toContainText('v1.1.0');
    await expect(page.getByTestId('changelog-release-1.1.0')).toBeVisible();
    await expect(page.getByTestId('changelog-release-1.0.0')).toBeVisible();

    await page.getByTestId('whats-new-tab-migrations').click();
    await expect(page.getByTestId('migration-guide-v1')).toBeVisible();
    await expect(page.getByTestId('migration-guide-v10')).toBeVisible();
    await page.getByTestId('whats-new-close-btn').click();
    await expect(whatsNewModal).toBeHidden();

    // -------------------------------------------------------------------
    // 3) F4: CC0 Iraqi Synthetic Data Generator & Public Demo Mode Banner
    // -------------------------------------------------------------------
    await page.getByTestId('settings-tab-developer').click();
    await page
      .locator('button')
      .filter({ hasText: /فتح نافذة تحميل البيانات التجريبية|Load Demo Cases/i })
      .first()
      .click();

    await expect(page.getByTestId('public-demo-mode-card')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('synthetic-count-5-btn')).toBeVisible();
    await expect(page.getByTestId('synthetic-count-10-btn')).toBeVisible();

    // Enable Public Demo Mode
    await page.getByTestId('toggle-public-demo-mode-btn').click();
    await expect(page.getByTestId('public-demo-mode-banner')).toBeVisible({ timeout: 5_000 });

    // Close SyntheticDataModal and verify English LTR parity on Public Demo Banner & Settings
    await page
      .locator('button')
      .filter({ hasText: /^إغلاق$|^Close$/i })
      .last()
      .click();

    await page.locator('header button[aria-expanded]').click();
    await page
      .locator('button')
      .filter({ hasText: /الإعدادات والخيارات|Settings/i })
      .first()
      .click();
    await page.getByTestId('settings-tab-display').click();
    await page.getByTestId('settings-lang-ckb-btn').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ckb');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByTestId('settings-tab-clinic')).toContainText(/کلینیک/);

    await page.getByTestId('settings-lang-en-btn').click();
    await expect(page.getByTestId('public-demo-mode-banner')).toContainText('PUBLIC DEMO BUILD');
    await page.getByRole('button', { name: /Close settings|إغلاق الإعدادات/i }).click();

    // Exit Public Demo Mode from the top banner
    await page.getByTestId('exit-public-demo-mode-btn').click();
    await expect(page.getByTestId('public-demo-mode-banner')).toBeHidden();

    expect(externalRequests).toEqual([]);
  });
});
