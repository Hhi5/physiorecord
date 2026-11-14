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

test.describe('Phase C — Iraq-Specific Operations E2E (C1–C7)', () => {
  test('verifies C1–C7 end-to-end in Arabic RTL & English LTR with zero external requests', async ({
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

    // 1) Verify Phase C Settings > Modules toggles exist and can be inspected
    await page.locator('header button[aria-expanded]').click();
    await page
      .locator('button')
      .filter({ hasText: /الإعدادات والخيارات|Settings/i })
      .first()
      .click();
    await page
      .locator('button')
      .filter({ hasText: /^الأقسام$|^Modules$/i })
      .first()
      .click();

    await expect(page.getByTestId('toggle-home-visits-btn')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('toggle-practice-locations-btn')).toBeVisible();
    await expect(page.getByTestId('toggle-closed-days-breaks-btn')).toBeVisible();
    await expect(page.getByTestId('toggle-hijri-date-btn')).toBeVisible();
    await expect(page.getByTestId('toggle-installment-plans-btn')).toBeVisible();
    await expect(page.getByTestId('toggle-recurring-expenses-btn')).toBeVisible();
    await expect(page.getByTestId('toggle-referrals-module-btn')).toBeVisible();
    await expect(page.getByTestId('toggle-retention-lists-btn')).toBeVisible();
    await expect(page.getByTestId('retention-inactive-days-input')).toBeVisible();

    await page.getByRole('button', { name: /إغلاق الإعدادات|Close settings/i }).click();

    // 2) C6 Referrals: Open Referrals & Retention sub-tab -> Add Referring Doctor -> Register Referred Patient
    await page.getByTestId('today-subtab-referrals_retention').click();
    await expect(page.getByRole('button', { name: /إضافة طبيب محيل|Add Doctor/i })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole('button', { name: /إضافة طبيب محيل|Add Doctor/i }).click();

    const docDialog = page.locator('[role="dialog"]').last();
    await docDialog.locator('input').first().fill('د. خالد المولى');
    await docDialog.locator('button[type="submit"]').click();
    await expect(page.locator('main')).toContainText('د. خالد المولى', { timeout: 5_000 });

    // Register referred adult patient and verify C6 MasterPatientChart pill + Report Back letter
    await page
      .getByRole('button', { name: /مريض جديد|New Patient/i })
      .first()
      .click();
    await page.locator('input[placeholder*="أحمد فهد"]').first().fill('زينب عبد الحسين');
    await page.locator('input[type="number"]').first().fill('34');

    const referralCard = page.getByTestId('patient-modal-referral-section');
    await expect(referralCard).toBeVisible();
    await referralCard.getByRole('button', { name: /طبيب محيل|Referring Doctor/i }).click();
    await referralCard.locator('select').first().selectOption({ label: 'د. خالد المولى' });

    await page.locator('form button[type="submit"]').first().click();

    await expect(page.getByTestId('patient-referral-pill')).toContainText('د. خالد المولى', {
      timeout: 10_000,
    });
    await page.getByTestId('open-report-back-btn').click();
    const letterDialog = page.locator('[role="dialog"]').last();
    await expect(letterDialog).toContainText('زينب عبد الحسين');
    await expect(letterDialog).toContainText('د. خالد المولى');
    await letterDialog.getByRole('button', { name: /إغلاق|Close/i }).first().click();

    // Return to Today view -> Schedule subtab
    await page.getByRole('button', { name: /^اليوم$|^Today$/i }).first().click();
    await page.getByTestId('today-subtab-schedule').click();
    await expect(page.getByTestId('location-summary-strip')).toBeVisible({ timeout: 10_000 });

    // 3) C3 Closed Days, Breaks & Optional Hijri Display (lazy ClosedDaysBreaksModal)
    await page.getByTestId('open-closed-days-breaks-btn').click();
    const scheduleModal = page.locator('[role="dialog"]').last();
    await expect(scheduleModal).toBeVisible({ timeout: 10_000 });

    // Enable optional Hijri date display
    await scheduleModal.getByRole('switch').click();
    await scheduleModal.getByRole('tab', { name: /أيام الإغلاق|Closed Days/i }).click();
    await expect(scheduleModal).toContainText(/لا يتضمن التطبيق تقويم عطل رسمية|No pre-bundled/i);

    await scheduleModal
      .locator('input[placeholder*="عيد الفطر"], input[placeholder*="Closure"], input[type="text"]')
      .first()
      .fill('صيانة العيادة اليوم');
    await scheduleModal.locator('form button[type="submit"]').click();
    await expect(scheduleModal).toContainText('صيانة العيادة اليوم');
    await scheduleModal.getByRole('button', { name: /إغلاق|Close/i }).first().click();

    // Closed-day banner and Hijri badge must show on selected date
    await expect(page.getByTestId('hijri-date-badge')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('closed-date-banner')).toBeVisible({ timeout: 5_000 });

    // 4) C1–C2 Book Home Visit Appointment with Landmark Address, Travel Buffer & Privacy-Confirmed Map Dialog
    await page.getByRole('button', { name: /^حجز موعد$|^Book Appointment$/i }).click();
    const patientComboInput = page.locator('input[placeholder*="ابحث بالاسم"], input[placeholder*="Search by name"]').first();
    await patientComboInput.fill('زينب');
    await page.locator('form button').filter({ hasText: 'زينب عبد الحسين' }).first().click();

    await page.getByTestId('appt-mode-home-visit').click();
    await expect(page.getByTestId('sheet-practice-location-select')).toHaveValue('loc_home_visits');

    await page.locator('input[list="iraq-governorates-sheet-list"]').fill('بغداد');
    await page.locator('input[placeholder*="الكرادة"]').fill('المنصور');
    await page.locator('input[placeholder*="ساحة كهرمانة"]').fill('قرب تقاطع الرواد');
    await page.locator('input[placeholder="0"]').first().fill('20');

    // Closed date warning inside sheet (non-blocking)
    await expect(page.getByTestId('sheet-closed-day-banner')).toBeVisible();

    await page
      .locator('form button[type="submit"]')
      .filter({ hasText: /تأكيد الموعد|Confirm Appointment/i })
      .first()
      .click();

    // Toggle Full Schedule Privacy Blur ON then OFF and verify blurred state
    const scheduleBlurToggle = page.getByTestId('schedule-privacy-blur-toggle');
    await expect(scheduleBlurToggle).toBeVisible({ timeout: 5_000 });
    await scheduleBlurToggle.click();
    await expect(page.locator('[data-privacy-blurred="true"]').first()).toBeVisible({ timeout: 5_000 });
    await scheduleBlurToggle.click();
    await expect(page.locator('[data-privacy-blurred="true"]')).toHaveCount(0);

    // Click "Open in maps" -> verify privacy notice dialog shows query WITHOUT patient name
    const openMapsBtn = page.getByRole('button', { name: /فتح في الخرائط|Open in maps/i }).first();
    await expect(openMapsBtn).toBeVisible({ timeout: 8_000 });
    await openMapsBtn.click();

    const mapsDialog = page.locator('[role="alertdialog"]');
    await expect(mapsDialog).toBeVisible({ timeout: 5_000 });
    await expect(mapsDialog).toContainText('قرب تقاطع الرواد');
    await expect(mapsDialog).toContainText('https://www.google.com/maps/search/');
    await expect(mapsDialog).not.toContainText('زينب عبد الحسين');
    await mapsDialog.getByRole('button', { name: /إلغاء|Cancel/i }).click();

    // 5) C4–C5 Finance Ledger: Blank Travel Fee, Installment Plan + 30/60/90 Aging & Recurring Expenses
    await page.getByRole('button', { name: /الحسابات|Finance/i }).first().click();
    await page
      .getByRole('button', { name: /\+ إصدار فاتورة|New Invoice/i })
      .first()
      .click();

    await page.locator('form select[required]').first().selectOption({ index: 1 });

    // Money inputs start blank/zero (R2 preserved)
    const moneyInputs = page.locator('form input[inputmode="numeric"]');
    await expect(moneyInputs.first()).toHaveValue(/^0?$/);

    await moneyInputs.nth(0).fill('100000'); // Service fee
    // Travel fee optional field (3rd MoneyInput: Service, Discount, Travel Fee)
    await moneyInputs.nth(2).fill('15000');
    await page
      .locator('label')
      .filter({ hasText: /تفعيل خطة الأقساط|Enable Installment Plan/i })
      .click();

    await page.getByRole('button', { name: /إصدار الفاتورة وحفظ الوصل|Issue Invoice/i }).click();
    await expect(page.getByTestId('financial-invoices-list')).toContainText('115,000', {
      timeout: 8_000,
    });

    // Installments & 30/60/90 Aging tab
    await page
      .getByRole('button', { name: /الأقساط وتقادم الديون|Installments & Aging/i })
      .click();
    await expect(page.locator('main')).toContainText(/1–30|31–60|61–90|الأقساط المفتوحة/i, {
      timeout: 10_000,
    });

    // Recurring Expenses ("Due this month") in Expenses tab
    await page.getByRole('button', { name: /مصاريف العيادة|Expenses/i }).first().click();
    await expect(page.locator('main')).toContainText(/مستحق هذا الشهر|Due This Month/i, {
      timeout: 10_000,
    });
    const rentCard = page
      .locator('main div')
      .filter({ hasText: /إيجار العيادة الشهري|Monthly Clinic Rent/i })
      .filter({ has: page.locator('input[inputmode="numeric"]') })
      .last();
    await expect(rentCard.locator('input[inputmode="numeric"]').first()).toHaveValue(/^0?$/);
    await rentCard.locator('input[inputmode="numeric"]').first().fill('500000');
    await rentCard.getByRole('button', { name: /تسجيل المصروف|Log Expense/i }).click();
    await expect(page.locator('main')).toContainText('500,000', { timeout: 8_000 });

    // 6) Verify English LTR parity & C7 Retention unpaid balance list
    await page.locator('header button[aria-expanded]').click();
    await page.getByRole('button', { name: /^EN$/ }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

    await page.getByRole('button', { name: /^Today$/i }).first().click();
    await page.getByTestId('today-subtab-referrals_retention').click();
    await page.getByRole('tab', { name: /Retention/i }).click();
    await expect(page.locator('main')).toContainText(/Unpaid Balance/i, { timeout: 10_000 });
    await expect(page.locator('main')).toContainText('115,000');

    expect(externalRequests).toEqual([]);
  });
});
