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

test.describe('Phase B — Faster Clinical Workflow & Safety E2E (B1–B8)', () => {
  test('verifies B1-B8 end-to-end with zero external requests and safe defaults', async ({
    page,
  }) => {
    test.setTimeout(120_000);

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

    // 1) Phase B8 (Pediatric Safeguard) + B6 (Structured Precaution on Patient Creation)
    await page
      .getByRole('button', { name: /مريض جديد|New Patient/i })
      .first()
      .click();

    await page.locator('input[placeholder*="أحمد فهد"]').first().fill('علي حسين الطفل');
    await page.locator('input[type="number"]').first().fill('12');

    // Guardian section appears automatically for age < 18
    await expect(page.getByTestId('pediatric-guardian-section')).toBeVisible({ timeout: 5_000 });

    // Submitting without guardian details & consent must be blocked
    await page.locator('form button[type="submit"]').first().click();
    await expect(page.getByTestId('pediatric-guardian-section')).toBeVisible();

    await page.getByTestId('pediatric-guardian-name-input').fill('حسين كريم الجبوري');
    await page
      .getByTestId('pediatric-guardian-phone-wrap')
      .locator('input')
      .first()
      .fill('07701234567');
    await page.getByTestId('pediatric-guardian-consent-checkbox').check();

    // Expand Accordion 3 and check Pacemaker/ICD structured precaution
    await page
      .locator('details')
      .filter({ hasText: /الأعلام الحمراء|Red flags/i })
      .first()
      .locator('summary')
      .click();
    await page.getByTestId('modal-precaution-pacemaker_icd').click();

    await page.locator('form button[type="submit"]').first().click();
    await expect(page.getByTestId('pediatric-guardian-section')).toBeHidden({ timeout: 10_000 });

    // 2) Creating a patient navigates directly to MasterPatientChart -> Start a new Episode of Care
    await page.getByRole('button', { name: /\+ حلقة جديدة|\+ New Episode/i }).click();
    await page
      .locator('input[placeholder*="تأهيل تمزق الرباط الصليبي"]')
      .fill('تأهيل ركبة المريض');
    await page
      .locator('textarea[placeholder*="التشخيص الطبي الصادر"]')
      .fill('إجهاد المفصل الرضفي الفخذي');
    await page
      .locator('textarea[placeholder*="الانطباع السريري للمعالج"]')
      .fill('ضعف العضلة الرباعية مع ألم عند صعود الدرج');
    await page.getByRole('button', { name: /اعتماد وبدء حلقة الرعاية/i }).click();
    await expect(
      page.locator('button').filter({ hasText: /جلسة جديدة|New Session/i }).first()
    ).toBeVisible({ timeout: 10_000 });

    // 3) Phase B1: One-tap CC0-1.0 Knee Exam Preset -> populates widgets & red-flag reminder
    await expect(page.getByTestId('exam-preset-btn-knee')).toBeVisible({ timeout: 12_000 });
    await page.getByTestId('exam-preset-btn-knee').click();
    await expect(page.getByTestId('exam-preset-redflag-reminder')).toBeVisible({ timeout: 5_000 });

    // Verify collapsible plain-text clinical summary & modal Exam Shelf button
    await expect(page.getByTestId('clinical-summary-collapsible')).toBeVisible({ timeout: 5_000 });
    await page.getByTestId('toggle-clinical-summary-btn').click();
    await page.getByTestId('toggle-clinical-summary-btn').click();
    await expect(page.getByTestId('open-exam-shelf-btn')).toBeVisible({ timeout: 5_000 });
    await page.getByTestId('open-exam-shelf-btn').click();
    const shelfModal = page.locator('[role="dialog"]').last();
    await expect(shelfModal).toBeVisible({ timeout: 5_000 });
    await shelfModal.getByRole('button', { name: /إغلاق|Close|داخستن/i }).first().click();

    // Verify continuous spectrum color picker inside Body Chart
    await expect(page.getByTestId('spectrum-color-picker').first()).toBeVisible({ timeout: 5_000 });

    // 4) Phase B2: Problem List & Outcome-Linked Goals
    await page.getByTestId('problem-list-input').fill('ألم المفصل الرضفي الفخذي');
    await page.getByTestId('problem-list-add-btn').click();
    await page.getByTestId('outcome-goal-title-input').fill('تقليل العجز الحركي');
    await page.getByTestId('outcome-goal-baseline-input').fill('50');
    await page.getByTestId('outcome-goal-target-input').fill('20');
    await page.getByTestId('outcome-goal-add-btn').click();
    await expect(page.locator('[data-testid^="outcome-goal-status-"]').first()).toBeVisible({
      timeout: 5_000,
    });

    // 5) Phase B5: Performance-Test Library (LSI) with "Needs expert verification" notice
    await expect(page.getByTestId('performance-tests-panel')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('perf-expert-verification-badge')).toBeVisible();
    await page.getByTestId('perf-test-tab-lsi').click();
    await page.getByTestId('perf-input-involved').fill('85');
    await page.getByTestId('perf-input-uninvolved').fill('100');
    await expect(page.getByTestId('perf-live-interpretation')).toContainText('85%');
    await page.getByTestId('perf-save-result-btn').click();

    // 6) Phase B7: Baseline Vitals threshold alert
    await page.getByTestId('vitals-sbp-input').first().fill('185');
    await page.getByTestId('vitals-dbp-input').first().fill('112');
    await expect(page.getByTestId('vitals-alerts-banner').first()).toBeVisible({ timeout: 5_000 });

    // Save Master Chart changes
    await page
      .locator('button')
      .filter({ hasText: /^حفظ$|^Save$/i })
      .first()
      .click();

    // 7) Open Settings -> Modules -> verify B3 default OFF -> ON & Senior PT B6 Review Sign-off
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

    const reEvalToggle = page.getByTestId('toggle-reeval-nudges-btn');
    await expect(reEvalToggle).toContainText(/معطّلة افتراضياً|Off \(Default\)/i);
    await reEvalToggle.click();
    await expect(reEvalToggle).toContainText(/مفعّلة|Enabled/i);
    await page.getByTestId('reeval-sessions-input').fill('1');

    const modalityBadge = page.getByTestId('modality-safety-status-badge');
    await expect(modalityBadge).toContainText(/معطّل حتى مراجعة معالج أول|Disabled until reviewed/i);
    await page.getByTestId('modality-safety-reviewer-input').fill('Dr. Ali Senior PT');
    await page.getByTestId('modality-safety-review-enable-btn').click();
    await expect(modalityBadge).toContainText(/مراجَع ومفعّل|Reviewed & Active/i);

    await page.getByRole('button', { name: /إغلاق الإعدادات|Close settings/i }).click();

    // 8) Start Session #1 -> verify B8 geometric pain shapes, B6 pacemaker override, B7 vitals & B4 non-blocking finalize
    await page
      .locator('button')
      .filter({ hasText: /جلسة جديدة|New Session/i })
      .first()
      .click();
    await page
      .getByRole('button', { name: /حفظ الجلسة كمسودة|Save Draft/i })
      .click();

    await expect(page.getByTestId('add-modality-TENS')).toBeVisible({ timeout: 12_000 });
    await expect(page.getByTestId('nprs-geometric-icons')).toHaveCount(0);
    // Pre-session pain (NPRS 5) + Post-session pain (NPRS 2)
    await page.getByTestId('nprs-num-5').first().click();
    await page.getByTestId('nprs-num-2').nth(1).click();

    // B6 Modality Safety Alert & Non-Blocking Override
    await page.getByTestId('add-modality-TENS').click();
    await expect(page.getByTestId('modality-safety-override-modal')).toBeVisible({ timeout: 5_000 });
    await page.getByTestId('modality-safety-confirm-override-btn').click();
    await expect(page.getByTestId('session-modality-overrides-list')).toBeVisible({
      timeout: 5_000,
    });

    // Clinical Impression & Progress Status (required by medico-legal finalization; leave nextSessionPlan empty to test non-blocking checklist!)
    await page
      .locator('select')
      .filter({ has: page.locator('option[value="improved"]') })
      .first()
      .selectOption('improved');
    await page
      .locator('textarea[placeholder*="التفسير السريري"], textarea[placeholder*="clinical reasoning"]')
      .first()
      .fill('استجابة جيدة للجلسة مع تراجع الألم بعد التداخل.');

    // Record Session #1 Vitals
    await page.getByTestId('vitals-sbp-input').fill('185');
    await page.getByTestId('vitals-dbp-input').fill('112');
    await page.getByTestId('vitals-hr-input').fill('88');
    await page.getByTestId('vitals-spo2-input').fill('97');
    await expect(page.getByTestId('vitals-alerts-banner')).toBeVisible({ timeout: 5_000 });

    // B4 Note Completeness Checklist (leave nextSessionPlan blank -> non-blocking "Finalize anyway")
    await page
      .locator('button')
      .filter({ hasText: /إنهاء واعتماد|Finish & Sign/i })
      .first()
      .click();
    await expect(page.getByTestId('note-completeness-checklist')).toBeVisible({ timeout: 5_000 });
    const finalizeBtn = page.getByTestId('finish-step1-finalize-btn');
    await expect(finalizeBtn).toContainText(/اعتماد على أي حال|Finalize anyway/i);
    await finalizeBtn.click();

    await expect(page.getByTestId('finish-step2-next-btn')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('finish-step2-next-btn').click();
    await expect(page.getByTestId('finish-step3-complete-btn')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('finish-step3-complete-btn').click();
    await expect(page.getByTestId('finish-step3-complete-btn')).toBeHidden({ timeout: 10_000 });

    // 9) Return to Master Chart -> verify B3 Re-eval due banner after Session #1, then start Session #2 for B7 SVG trend
    await page
      .locator('button')
      .filter({ hasText: /السجل العام|Episode Chart/i })
      .first()
      .click();
    await expect(page.getByTestId('reeval-due-banner')).toBeVisible({ timeout: 10_000 });

    await page
      .locator('button')
      .filter({ hasText: /جلسة جديدة|New Session/i })
      .first()
      .click();
    await page
      .getByRole('button', { name: /حفظ الجلسة كمسودة|Save Draft/i })
      .click();
    await expect(page.getByTestId('add-modality-TENS')).toBeVisible({ timeout: 12_000 });
    await page.getByTestId('vitals-sbp-input').fill('122');
    await page.getByTestId('vitals-hr-input').fill('74');
    await page.getByTestId('vitals-spo2-input').fill('98');
    await expect(page.getByTestId('vitals-trend-svg')).toBeVisible({ timeout: 5_000 });

    expect(externalRequests).toEqual([]);
  });
});
