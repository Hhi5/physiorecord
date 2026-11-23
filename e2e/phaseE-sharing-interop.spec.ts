import { test, expect, type Page } from '@playwright/test';

const TEST_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC';

async function completeFirstRunToSolo(page: Page, password: string) {
  await page.addInitScript(() => {
    try {
      Object.defineProperty(window, 'showSaveFilePicker', {
        value: undefined,
        configurable: true,
        writable: true,
      });
      // Stub window.print so automated print tests never block the UI thread
      window.print = () => {};
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

test.describe('Phase E — Sharing & Interop (E1–E4)', () => {
  test('verifies E1–E4 end-to-end in Arabic RTL & English LTR with zero external requests', async ({
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

    // 1) Verify Phase E toggles in Settings > Modules & enable 5.2 Attachments for E4
    await page.getByTestId('rail-account-btn').click();
    await page.getByTestId('account-settings-btn').click();
    await page.getByTestId('settings-tab-modules').click();

    await expect(page.getByTestId('settings-phaseE-modules-card')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('toggle-web-share-interop-btn')).toBeVisible();
    await expect(page.getByTestId('toggle-ics-calendar-export-btn')).toBeVisible();
    await expect(page.getByTestId('toggle-schedule-visit-card-print-btn')).toBeVisible();
    await expect(page.getByTestId('toggle-photo-measurement-tools-btn')).toBeVisible();
    await page.getByRole('button', { name: /إغلاق الإعدادات|Close settings/i }).click();

    // 2) Create a patient + book an appointment so E2 (.ics) & E3 (Schedule + Visit Card) have rich data
    await page.getByTestId('rail-quick-add-btn').click();
    await page.getByTestId('quick-add-patient-btn').click();
    await page.locator('input[placeholder*="أحمد فهد"]').first().fill('حيدر باسم علي');
    await page.locator('input[placeholder="0770 123 4567"]').first().fill('07701234567');
    await page.locator('input[type="number"]').first().fill('31');
    await page.locator('form button[type="submit"]').first().click();

    // Inside newly opened patient workspace: open History (السجل المرضي) -> Imaging & Files tab for E4 Photo Studio
    const historyTabBtn = page
      .locator('button')
      .filter({ hasText: /السجل المرضي|History/i })
      .first();
    await expect(historyTabBtn).toBeVisible({ timeout: 10_000 });
    await historyTabBtn.click();

    const imagingSubTabBtn = page
      .getByRole('tab', { name: /الأشعة والمرفقات|Imaging & Files/i })
      .first();
    await expect(imagingSubTabBtn).toBeVisible({ timeout: 5_000 });
    await imagingSubTabBtn.click();

    // Enable 5.2 Attachments Gallery inline if currently off
    const enableGalleryBtn = page
      .locator('button')
      .filter({ hasText: /تفعيل المعرض السريري|Enable Attachment Gallery/i })
      .first();
    const addAttachmentBtn = page
      .locator('button')
      .filter({ hasText: /إضافة مرفق|Add Attachment/i })
      .first();
    // The attachments panel is lazy-loaded: wait for either state before deciding.
    await expect(enableGalleryBtn.or(addAttachmentBtn).first()).toBeVisible({ timeout: 20_000 });
    if (await enableGalleryBtn.isVisible()) {
      await enableGalleryBtn.click();
      await expect(addAttachmentBtn).toBeVisible({ timeout: 10_000 });
    }

    // Upload 2 posture photos (Before & After) so Side-by-Side Before/After + Angle Studio are testable
    const pngBuf = Buffer.from(TEST_PNG_BASE64, 'base64');

    const uploadPhoto = async (catValue: 'posture_before' | 'posture_after', title: string, fileName: string) => {
      await page
        .locator('button')
        .filter({ hasText: /إضافة مرفق|Add Attachment/i })
        .first()
        .click();
      const uploadForm = page
        .locator('form')
        .filter({ has: page.locator('button[type="submit"]', { hasText: /تشفير وحفظ|Encrypt & Save/i }) })
        .first();
      await expect(uploadForm).toBeVisible({ timeout: 5_000 });
      await uploadForm.locator('select').first().selectOption(catValue);
      await uploadForm
        .locator('input[placeholder*="وقوف جانبي"], input[placeholder*="Sagittal Posture"]')
        .first()
        .fill(title);
      await uploadForm.locator('input[type="file"]').first().setInputFiles({
        name: fileName,
        mimeType: 'image/png',
        buffer: pngBuf,
      });
      await uploadForm
        .locator('button[type="submit"]')
        .filter({ hasText: /تشفير وحفظ|Encrypt & Save/i })
        .first()
        .click();
      await expect(uploadForm).toBeHidden({ timeout: 15_000 });
    };

    await uploadPhoto('posture_before', 'وقوف أمامي قبل الجلسات', 'before.png');
    await uploadPhoto('posture_after', 'وقوف أمامي بعد الجلسات', 'after.png');

    // Verify Side-by-Side Before/After Photo Comparison Modal (E4)
    const compareModalBtn = page.getByTestId('open-posture-compare-modal-btn');
    await expect(compareModalBtn).toBeVisible({ timeout: 10_000 });
    await compareModalBtn.click();
    const compareDialog = page.getByRole('dialog');
    await expect(compareDialog).toBeVisible({ timeout: 5_000 });
    await expect(compareDialog).toContainText(/مقارنة الصور|Photo Comparison/i);
    await compareDialog.getByRole('button', { name: /إغلاق|Close/i }).first().click();
    await expect(compareDialog).toBeHidden({ timeout: 5_000 });

    // Open E4 Photo Measurement Studio on first image, adjust angle coordinates, toggle plumb/grid & save encrypted copy
    const openToolsBtn = page.locator('[data-testid^="open-photo-tools-btn-"]').first();
    await expect(openToolsBtn).toBeVisible();
    await openToolsBtn.click();

    const stage = page.getByTestId('photo-studio-canvas-stage');
    await expect(stage).toBeVisible({ timeout: 10_000 });
    const stageCanvas = stage.locator('canvas').first();
    await expect(stageCanvas).toBeVisible({ timeout: 10_000 });

    const readout = page.getByTestId('photo-studio-angle-readout');
    await expect(readout).toContainText('°');

    // Verify zoom controls update Konva viewport zoom readout
    await page.getByTestId('photo-studio-zoom-in-btn').click();
    await expect(page.getByTestId('photo-studio-zoom-readout')).not.toHaveText('100%');
    await page.getByTestId('photo-studio-zoom-reset-btn').click();
    await expect(page.getByTestId('photo-studio-zoom-readout')).toHaveText('100%');

    // Verify 4-point Cobb angle tool auto-creates a Cobb measurement and computes acute/obtuse angles
    await page.getByTestId('photo-tool-cobb4').click();
    await expect(page.getByTestId('photo-studio-cobb-readout')).toContainText('°');

    // Verify scale calibration + calibrated distance measurement tool (cm/mm)
    await page.getByTestId('photo-tool-calibrate').click();
    await page.getByTestId('photo-calib-length-input').fill('10');
    await page.getByTestId('photo-calib-apply-btn').click();
    await expect(page.getByTestId('photo-calib-status-badge')).toBeVisible();

    await page.getByTestId('photo-tool-distance').click();
    await expect(page.getByTestId('photo-studio-distance-readout')).toContainText('cm');

    // Verify undo reverses the latest action and still allows switching back to 3-point angle tool
    await page.getByTestId('photo-studio-undo-btn').click();
    await page.getByTestId('photo-tool-angle3').click();

    // Set exact 90-degree angle coordinates via accessible inputs: A(50, 20), B(50, 70), C(90, 70)
    await page.getByTestId('photo-studio-angle-label-input').fill('CVA Test');
    await page.getByTestId('angle-point-a-x').fill('50');
    await page.getByTestId('angle-point-a-y').fill('20');
    await page.getByTestId('angle-point-b-x').fill('50');
    await page.getByTestId('angle-point-b-y').fill('70');
    await page.getByTestId('angle-point-c-x').fill('90');
    await page.getByTestId('angle-point-c-y').fill('70');
    await expect(readout).toContainText('90°');
    await page.getByTestId('photo-studio-grid-select').selectOption('6x6');

    await page.getByTestId('photo-studio-save-only-btn').click();
    await expect(
      page.getByText(/تم حفظ القياسات بنجاح|Measurements saved to encrypted record/i)
    ).toBeVisible({ timeout: 10_000 });
    await page.getByRole('dialog').getByRole('button', { name: /إغلاق|Close/i }).first().click();
    await expect(page.getByTestId('photo-studio-canvas-stage')).toBeHidden({ timeout: 5_000 });
    await expect(page.locator('[data-testid^="open-photo-tools-btn-"]')).toHaveCount(2, {
      timeout: 10_000,
    });

    // Switch to Financial & Docs tab for E3 Patient Visit Card & E1 Web Share / WhatsApp / Copy fallback
    const profileTabBtn = page
      .locator('button')
      .filter({ hasText: /الملف والمالية|Financial & Docs/i })
      .first();
    await expect(profileTabBtn).toBeVisible({ timeout: 10_000 });
    await profileTabBtn.click();

    await page.getByTestId('print-patient-visit-card-btn').click();
    await expect(page.getByTestId('print-patient-visit-card-section')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId('visit-card-next-appointment')).toBeVisible();
    await expect(page.getByTestId('visit-card-remaining-sessions')).toBeVisible();

    // E1 Web Share & Fallback toolbar inside PrintDocumentModal
    await expect(page.getByTestId('print-web-share-file-btn')).toBeVisible();
    await expect(page.getByTestId('print-copy-summary-btn')).toBeVisible();
    const waLink = page.getByTestId('print-whatsapp-fallback-link');
    await expect(waLink).toBeVisible();
    const waHref = await waLink.getAttribute('href');
    expect(waHref).toContain('https://wa.me/9647701234567');

    await page.getByTestId('print-copy-summary-btn').click();
    await expect(page.getByTestId('print-share-status-notice')).toBeVisible();

    await page.getByRole('dialog').getByRole('button', { name: /إغلاق|Close/i }).first().click();
    await expect(page.getByTestId('print-patient-visit-card-section')).toBeHidden({ timeout: 5_000 });

    // 3) Switch to Today -> Schedule for E2 (.ics) & E3 (Tomorrow/Day Schedule Print)
    await page.getByRole('button', { name: /^اليوم$|^Today$/i }).first().click();
    await page.getByTestId('today-more-menu-btn').click();
    await page.getByTestId('today-subtab-schedule').click();
    await page.getByRole('button', { name: /^حجز موعد$|^Book Appointment$/i }).click();
    const patientSearchInput = page
      .locator('input[placeholder*="ابحث بالاسم"], input[placeholder*="Search by name"]')
      .first();
    await patientSearchInput.fill('حيدر');
    await page.locator('form button').filter({ hasText: 'حيدر باسم علي' }).first().click();
    await page
      .locator('form button[type="submit"]')
      .filter({ hasText: /تأكيد الموعد|Confirm Appointment/i })
      .first()
      .click();

    // E2 Export .ics modal from Schedule options menu
    await page.getByRole('button', { name: /خيارات الجدول والتاريخ|Schedule options/i }).click();
    await page.getByTestId('schedule-export-ics-btn').click();
    const icsPreview = page.getByTestId('ics-live-preview');
    await expect(icsPreview).toBeVisible({ timeout: 5_000 });
    await expect(icsPreview).toContainText('BEGIN:VCALENDAR');
    await expect(icsPreview).toContainText('حيدر باسم علي');

    // Toggle Patient Name OFF -> verify name immediately disappears from .ics preview
    await page.getByTestId('ics-opt-patient-name').uncheck();
    await expect(icsPreview).not.toContainText('حيدر باسم علي');

    const [icsDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('ics-download-confirm-btn').click(),
    ]);
    expect(icsDownload.suggestedFilename().toLowerCase()).toContain('.ics');
    await page.getByRole('button', { name: /^إغلاق$|^Close$/i }).last().click();

    // E3 Print Schedule from Schedule options menu & End-of-Day Tomorrow's Schedule
    await page.getByRole('button', { name: /خيارات الجدول والتاريخ|Schedule options/i }).click();
    await page.getByTestId('schedule-print-day-btn').click();
    await expect(page.getByTestId('print-tomorrow-schedule-section')).toBeVisible({
      timeout: 5_000,
    });
    await page.getByRole('dialog').getByRole('button', { name: /إغلاق|Close/i }).first().click();
    await expect(page.getByTestId('print-tomorrow-schedule-section')).toBeHidden({ timeout: 5_000 });

    await page.getByRole('button', { name: /العودة لليوم|Back to Today/i }).first().click();
    await page.getByTestId('today-subtab-eod').click();
    await page.getByTestId('eod-print-tomorrow-schedule-btn').click();
    await expect(page.getByTestId('print-tomorrow-schedule-section')).toBeVisible({
      timeout: 5_000,
    });
    await page.getByRole('dialog').getByRole('button', { name: /إغلاق|Close/i }).first().click();
    await expect(page.getByTestId('print-tomorrow-schedule-section')).toBeHidden({ timeout: 5_000 });

    // 4) Switch to English LTR parity check
    await page.getByTestId('rail-account-btn').click();
    await page.getByTestId('account-menu-popover').locator('button').filter({ hasText: /^EN$/ }).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByTestId('eod-print-tomorrow-schedule-btn')).toContainText(/Print Tomorrow/i);

    expect(externalRequests).toEqual([]);
  });
});
