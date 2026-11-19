import { expect, test } from '@playwright/test';

test.describe('Offline & Self-Hosted Security Gate (0.4 & 1.12)', () => {
  test('makes ZERO non-same-origin network requests, ZERO CSP violations, and loads self-hosted fonts', async ({
    page,
    baseURL,
  }) => {
    const appOrigin = new URL(baseURL || 'http://127.0.0.1:4173').origin;
    const externalRequests: Array<{ url: string; resourceType: string }> = [];
    const sameOriginRequests: Array<{ url: string; status: number | null }> = [];
    const failedRequests: Array<{ url: string; errorText: string }> = [];

    await page.addInitScript(() => {
      const violations: Array<{ directive: string; blockedUri: string }> = [];
      (window as unknown as { __cspViolations?: typeof violations }).__cspViolations = violations;
      window.addEventListener('securitypolicyviolation', (ev) => {
        violations.push({
          directive: ev.violatedDirective,
          blockedUri: ev.blockedURI,
        });
      });
    });

    page.on('request', (request) => {
      const reqUrl = request.url();
      if (
        reqUrl.startsWith('data:') ||
        reqUrl.startsWith('blob:') ||
        reqUrl.startsWith('about:')
      ) {
        return;
      }

      const reqOrigin = new URL(reqUrl).origin;
      if (reqOrigin !== appOrigin) {
        externalRequests.push({
          url: reqUrl,
          resourceType: request.resourceType(),
        });
      }
    });

    page.on('response', (response) => {
      const resUrl = response.url();
      if (resUrl.startsWith(appOrigin)) {
        sameOriginRequests.push({ url: resUrl, status: response.status() });
      }
    });

    page.on('requestfailed', (request) => {
      failedRequests.push({
        url: request.url(),
        errorText: request.failure()?.errorText || 'unknown error',
      });
    });

    // 1. Load app root (built preview)
    await page.goto('/', { waitUntil: 'networkidle' });

    // Confirm no external <link> stylesheets (Google Fonts / CDNs) exist in DOM
    const externalStylesheetHrefs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
        .map((el) => (el as HTMLLinkElement).href)
        .filter((href) => !href.startsWith(window.location.origin))
    );
    expect(externalStylesheetHrefs).toEqual([]);

    // Confirm self-hosted fonts loaded from same origin
    const loadedFontFamilies = await page.evaluate(async () => {
      await document.fonts.ready;
      return Array.from(document.fonts)
        .filter((f) => f.status === 'loaded')
        .map((f) => f.family.replace(/['"]/g, ''));
    });
    expect(
      loadedFontFamilies.some(
        (family) =>
          family.includes('Inter') || family.includes('IBM Plex Sans Arabic')
      )
    ).toBeTruthy();

    // 2. Toggle language EN <-> AR and initialize encrypted vault
    const langBtn = page.locator('header button').filter({ hasText: /English|العربية/i }).first();
    if (await langBtn.isVisible()) {
      await langBtn.click();
    }

    const passwordInput = page.locator('input#password');
    await expect(passwordInput).toBeVisible({ timeout: 20_000 });
    await passwordInput.fill('PlaywrightOffline#2026');

    const confirmInput = page.locator('input#confirmPassword');
    await expect(confirmInput).toBeVisible();
    await confirmInput.fill('PlaywrightOffline#2026');

    await page.locator('button[type="submit"]').click();

    // 3. Complete Step 2 recovery key challenge & enter workspace
    const challengeInput = page.locator('input[type="text"]').first();
    await expect(challengeInput).toBeVisible({ timeout: 20_000 });
    const expectedGroup = (await challengeInput.getAttribute('placeholder')) || '';
    if (expectedGroup) {
      await challengeInput.fill(expectedGroup);
    }

    const ackCheckbox = page.locator('input[type="checkbox"]').first();
    await ackCheckbox.check();

    const enterWorkspaceBtn = page
      .locator('button')
      .filter({ hasText: /الدخول إلى مساحة العمل|Enter Clinical Workspace/i })
      .first();
    await expect(enterWorkspaceBtn).toBeEnabled();
    await enterWorkspaceBtn.click();

    // 4. Complete Phase 2 First-Run Mode Wizard (choose Solo Mode -> no blocking Admin PIN prompt)
    const soloModeBtn = page.getByTestId('wizard-mode-solo');
    await expect(soloModeBtn).toBeVisible({ timeout: 15_000 });
    await soloModeBtn.click();
    await page.getByTestId('wizard-confirm-btn').click();

    const pinSetupBtn = page
      .locator('button[type="submit"]')
      .filter({ hasText: /حفظ رمز المدير المشفر|Save Encrypted Admin PIN/i });
    await expect(pinSetupBtn).toHaveCount(0);

    await expect(page.locator('main')).toBeVisible({ timeout: 15_000 });

    // 5. Phase 2 Solo Workflow: Today view -> 10s Walk-In -> Quick SOAP -> EOD Summary
    const walkInBtn = page.getByTestId('today-walkin-btn');
    await expect(walkInBtn).toBeVisible({ timeout: 10_000 });
    await walkInBtn.click();

    await page.getByTestId('walkin-name-input').fill('أحمد علي الاختبار');
    await page.getByTestId('walkin-submit-btn').click();

    await expect(page.locator('main textarea').first()).toBeVisible({ timeout: 10_000 });

    const navTodayBtn = page
      .locator('aside button[aria-label="اليوم"], aside button[aria-label="Today"]')
      .first();
    await expect(navTodayBtn).toBeVisible({ timeout: 10_000 });
    await navTodayBtn.click();

    const eodSubTab = page.getByTestId('today-subtab-eod');
    await expect(eodSubTab).toBeVisible({ timeout: 10_000 });
    await eodSubTab.click();
    await page.waitForTimeout(800);

    const cspViolations = await page.evaluate(
      () => (window as unknown as { __cspViolations?: unknown[] }).__cspViolations || []
    );

    // Final hard assertions: ZERO third-party / CDN / telemetry requests & ZERO CSP violations
    expect(cspViolations).toEqual([]);
    expect(externalRequests).toEqual([]);
    expect(failedRequests).toEqual([]);
    expect(sameOriginRequests.length).toBeGreaterThan(0);
  });
});
