import { test, expect, type Page } from '@playwright/test';

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

  const challengeInput = page.locator('input#challenge-group-input');
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
  await expect(page.getByTestId('wizard-confirm-btn')).toBeHidden({ timeout: 15_000 });
  await expect(page.getByTestId('today-walkin-btn')).toBeVisible({ timeout: 20_000 });
}

test.describe('Phase D — Data Quality, Import, 30-Day Recycle Bin, Health & Glossary (D1–D5)', () => {
  test('verifies D1–D5 end-to-end in Arabic RTL & English LTR with zero external requests', async ({
    page,
  }) => {
    test.setTimeout(150_000);

    const externalRequests: string[] = [];
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

    await page.setViewportSize({ width: 1440, height: 900 });
    await completeFirstRunToSolo(page, 'ClinicVault!2026');

    // 1) Verify Phase D Settings > Modules controls & ESSENTIAL D1 badge
    await page.getByTestId('rail-account-btn').click();
    await page.getByTestId('account-settings-btn').click();
    await page.getByTestId('settings-tab-modules').click();

    await expect(page.getByTestId('settings-phaseD-modules-card')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('badge-duplicate-guard-essential')).toBeVisible();
    await expect(page.getByTestId('toggle-import-wizard-btn')).toBeVisible();
    await expect(page.getByTestId('toggle-trash-recycle-bin-btn')).toBeVisible();
    await expect(page.getByTestId('toggle-data-health-screen-btn')).toBeVisible();
    await expect(page.getByTestId('toggle-bilingual-glossary-btn')).toBeVisible();
    await page.getByRole('button', { name: /إغلاق الإعدادات|Close settings/i }).click();

    // 2) D1 & D5 in PatientModal + EpisodeModal: Create Primary Patient using Glossary
    await page.getByTestId('rail-quick-add-btn').click();
    await page.getByTestId('quick-add-patient-btn').click();
    await page.locator('input[placeholder*="أحمد فهد"]').first().fill('سارة كريم محمد');
    await page.locator('input[placeholder="0770 123 4567"]').first().fill('07703334455');
    await page.locator('input[type="number"]').first().fill('29');

    const patientGlossaryInput = page.getByTestId('patient-glossary-autocomplete-input');
    await expect(patientGlossaryInput).toBeVisible();
    await patientGlossaryInput.fill('ACL');
    await page.getByTestId('glossary-suggestion-diag_acl_post_op').click();

    await page.locator('form button[type="submit"]').first().click();

    // Inside newly opened patient workspace: test D5 Glossary in EpisodeModal
    const newEpisodeBtn = page.getByRole('button', { name: /\+ حلقة جديدة|\+ New Episode/i }).first();
    await expect(newEpisodeBtn).toBeVisible({ timeout: 10_000 });
    await newEpisodeBtn.click();

    const epGlossaryInput = page.getByTestId('episode-glossary-autocomplete-input');
    await expect(epGlossaryInput).toBeVisible({ timeout: 5_000 });
    await epGlossaryInput.fill('sciatica');
    await page.getByTestId('episode-glossary-option-diag_lumbar_radiculopathy').click();
    await expect(
      page.locator('input[placeholder*="الرباط الصليبي الأمامي"]').first()
    ).toHaveValue(/انزلاق غضروفي قطني/);
    await page.getByRole('button', { name: /^إلغاء$|^Cancel$/i }).last().click();

    // 3) Return to Patients Directory -> Create intentional duplicate to verify D1 Duplicate Guard Banner
    await page.getByRole('button', { name: /المرضى|Patients/i }).first().click();
    await page.getByTestId('rail-quick-add-btn').click();
    await page.getByTestId('quick-add-patient-btn').click();
    await page.locator('input[placeholder*="أحمد فهد"]').first().fill('ساره كريم محمد');
    await page.locator('input[placeholder="0770 123 4567"]').first().fill('0770 333 4455');

    const dupBanner = page.getByTestId('duplicate-patient-guard-banner');
    await expect(dupBanner).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('duplicate-open-existing-btn')).toBeVisible();
    await expect(page.getByTestId('duplicate-save-anyway-btn')).toBeVisible();

    // Dismiss banner via "Save Anyway" and submit Patient 2 (missing age/DOB for D4 testing)
    await page.getByTestId('duplicate-save-anyway-btn').click();
    await page.locator('form button[type="submit"]').first().click();

    // 4) D1 Patient Merge Modal: Merge duplicate pair transactionally
    await page.getByRole('button', { name: /المرضى|Patients/i }).first().click();
    await page.getByRole('button', { name: /خيارات الدليل|Directory options/i }).first().click();
    await page.getByTestId('open-patient-merge-modal-btn').click();
    const mergeModal = page.getByTestId('patient-merge-modal');
    await expect(mergeModal).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('merge-safety-snapshot-notice')).toBeVisible();
    await page.getByTestId('merge-detected-pair-btn-0').click();
    await page.getByTestId('merge-confirm-checkbox').check();
    await page.getByTestId('execute-patient-merge-btn').click();
    await expect(page.getByTestId('merge-success-banner')).toBeVisible({ timeout: 10_000 });
    await mergeModal.getByRole('button', { name: /إغلاق|Close/i }).last().click();

    // 5) D2 Import Wizard (CSV + XLSX sample export + Auto-Guess + Dry-Run + 'imported' badge)
    await page.getByRole('button', { name: /خيارات الدليل|Directory options/i }).first().click();
    await page.getByRole('menuitem', { name: /استيراد مرضى|Import CSV \/ XLSX/i }).first().click();
    const importDialog = page.locator('[role="dialog"]').last();
    await expect(importDialog).toBeVisible({ timeout: 5_000 });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('download-sample-xlsx-btn').click(),
    ]);
    expect(download.suggestedFilename().toLowerCase()).toContain('.xlsx');

    const csvPayload = [
      'fullNameAr,phone,gender,age,medicalHistory',
      'كرار علي جبار,07804445566,ذكر,33,انزلاق غضروفي قطني',
      ',07801112222,ذكر,,ناقص الاسم',
    ].join('\n');
    await importDialog.locator('textarea').first().fill(csvPayload);

    await expect(page.getByTestId('import-column-mapping-section')).toBeVisible();
    await expect(page.getByTestId('import-wizard-dry-run-panel')).toBeVisible();
    await expect(page.getByTestId('import-dryrun-valid-count')).toContainText('1');
    await expect(page.getByTestId('import-dryrun-invalid-count')).toContainText('1');

    await page.getByTestId('commit-csv-import-btn').click();
    await expect(page.getByTestId('import-commit-success-banner')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('import-rollback-batch-btn')).toBeVisible();
    await importDialog.getByRole('button', { name: /إغلاق|Close/i }).last().click();

    await expect(page.getByTestId('patient-imported-badge').first()).toBeVisible({ timeout: 5_000 });

    // 6) D3 30-Day Recycle Bin + D4 Data Health Screen (5 categories)
    await page.getByRole('button', { name: /^اليوم$|^Today$/i }).first().click();
    await page.getByTestId('today-more-menu-btn').click();
    await page.getByTestId('today-subtab-schedule').click();
    await page.getByRole('button', { name: /^حجز موعد$|^Book Appointment$/i }).click();
    const patientSearchInput = page
      .locator('input[placeholder*="ابحث بالاسم"], input[placeholder*="Search by name"]')
      .first();
    await patientSearchInput.fill('كرار');
    await page.locator('form button').filter({ hasText: 'كرار علي جبار' }).first().click();
    await page
      .locator('form button[type="submit"]')
      .filter({ hasText: /تأكيد الموعد|Confirm Appointment/i })
      .first()
      .click();

    const rowMenuBtn = page
      .locator('button[aria-label*="إجراءات إضافية لموعد كرار"], button[aria-label*="More actions for"]')
      .first();
    await expect(rowMenuBtn).toBeVisible({ timeout: 8_000 });
    await rowMenuBtn.click();
    const deleteApptBtn = page.getByRole('menuitem', { name: /حذف الموعد|Delete/i }).first();
    await expect(deleteApptBtn).toBeVisible({ timeout: 5_000 });
    await deleteApptBtn.click();

    await page.getByTestId('today-more-menu-btn').click();
    await page.getByTestId('today-subtab-data_health').click();
    await expect(page.getByTestId('data-health-screen-panel')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('data-health-score-badge')).toBeVisible();
    await expect(page.getByTestId('data-health-card-missing_demographics')).toBeVisible();
    await expect(page.getByTestId('data-health-card-unsigned_notes')).toBeVisible();
    await expect(page.getByTestId('data-health-card-unpaid_invoices')).toBeVisible();
    await expect(page.getByTestId('data-health-card-orphan_records')).toBeVisible();
    await expect(page.getByTestId('data-health-card-unverified_backup')).toBeVisible();

    const recyclePanel = page.getByTestId('recycle-bin-panel');
    await expect(recyclePanel).toBeVisible();
    await expect(page.getByTestId('recycle-bin-clinical-immutability-notice')).toBeVisible();
    await expect(recyclePanel).toContainText('كرار علي جبار');

    const restoreBtn = page.locator('[data-testid^="recycle-bin-restore-btn-"]').first();
    await expect(restoreBtn).toBeVisible();
    await restoreBtn.click();
    await expect(recyclePanel).not.toContainText('كرار علي جبار', { timeout: 5_000 });

    // 7) Verify English LTR parity & zero external requests
    await page.getByTestId('rail-account-btn').click();
    await page.getByTestId('account-menu-popover').locator('button').filter({ hasText: /^EN$/ }).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByTestId('data-health-screen-panel')).toContainText(/Data Health/i);

    expect(externalRequests).toEqual([]);
  });
});
