import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';

const SHOT_DIR = process.env.PHASE6_SHOT_DIR || '';
const REPORT_ONLY = process.env.PHASE6_AUDIT_MODE === 'report';

interface DomFinding {
  screen: string;
  viewport: string;
  lang: string;
  theme: string;
  horizontalOverflowPx: number;
  unlabeledButtons: string[];
  tinyFonts: { tag: string; text: string; fontSize: number; renderedH: number }[];
  arabicMonoOrTracking: { tag: string; text: string; fontFamily: string; letterSpacing: string }[];
  unwrappedFractions: { tag: string; text: string }[];
  clippedTabStrips: string[];
  truncatedHeaderTitles: string[];
  wrappedRecoveryChunks: string[];
  disabledLowContrast: string[];
  rawI18nKeys?: string[];
}

async function saveShot(page: Page, name: string) {
  if (!SHOT_DIR) return;
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(SHOT_DIR, `${name}.png`),
    fullPage: false,
  });
}

async function inspectLiveDom(
  page: Page,
  meta: { screen: string; viewport: string; lang: string; theme: string }
): Promise<DomFinding> {
  const result = await page.evaluate(() => {
    const isVisible = (el: Element): boolean => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const st = getComputedStyle(el);
      return st.display !== 'none' && st.visibility !== 'hidden' && parseFloat(st.opacity) > 0;
    };

    const overflowPx = Math.round(
      document.documentElement.scrollWidth - window.innerWidth
    );

    const unlabeledButtons: string[] = [];
    document.querySelectorAll('button, [role="button"]').forEach((btn) => {
      if (!isVisible(btn)) return;
      const txt = (btn.textContent || '').trim();
      const aria = (btn.getAttribute('aria-label') || '').trim();
      const title = (btn.getAttribute('title') || '').trim();
      const labelledBy = (btn.getAttribute('aria-labelledby') || '').trim();
      if (!txt && !aria && !title && !labelledBy) {
        unlabeledButtons.push(btn.outerHTML.slice(0, 110));
      }
    });

    const tinyFonts: { tag: string; text: string; fontSize: number; renderedH: number }[] = [];
    const arabicMonoOrTracking: {
      tag: string;
      text: string;
      fontFamily: string;
      letterSpacing: string;
    }[] = [];
    const unwrappedFractions: { tag: string; text: string }[] = [];

    const docDir = document.documentElement.dir || 'ltr';
    const arabicRegex = /[\u0600-\u06FF]/;
    const rawFracRegex = /(^|\s)\d+(\.\d+)?\s*\/\s*\d+(\.\d+)?(\s|$)/;

    const allEls = Array.from(document.body.querySelectorAll('*'));
    for (const el of allEls) {
      if (!isVisible(el)) continue;
      let directText = '';
      for (const node of Array.from(el.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE && node.textContent) {
          directText += node.textContent;
        }
      }
      directText = directText.trim();
      if (!directText) continue;

      const st = getComputedStyle(el);
      const fsPx = parseFloat(st.fontSize || '14');
      const rect = el.getBoundingClientRect();
      const tag = el.tagName.toLowerCase();

      if (tag === 'text' || tag === 'tspan') {
        const attrSize = parseFloat(el.getAttribute('font-size') || el.getAttribute('fontSize') || `${fsPx}`);
        if (attrSize < 12 || fsPx < 12 || rect.height < 9.5) {
          tinyFonts.push({
            tag: `svg:${tag}`,
            text: directText.slice(0, 40),
            fontSize: Math.min(attrSize, fsPx),
            renderedH: Math.round(rect.height * 10) / 10,
          });
        }
      } else if (fsPx < 11.9) {
        tinyFonts.push({
          tag,
          text: directText.slice(0, 40),
          fontSize: Math.round(fsPx * 10) / 10,
          renderedH: Math.round(rect.height * 10) / 10,
        });
      }

      if (arabicRegex.test(directText)) {
        const ff = st.fontFamily || '';
        const ls = st.letterSpacing || '0px';
        const isMonoClass = el.classList.contains('font-mono');
        if (
          isMonoClass ||
          (/JetBrains Mono|ui-monospace|monospace/i.test(ff) &&
            !/IBM Plex Sans Arabic/i.test(ff.split(',')[0])) ||
          (ls !== 'normal' && ls !== '0px' && parseFloat(ls) > 0.05)
        ) {
          arabicMonoOrTracking.push({
            tag,
            text: directText.slice(0, 40),
            fontFamily: ff.slice(0, 60),
            letterSpacing: ls,
          });
        }
      }

      if (docDir === 'rtl' && rawFracRegex.test(directText)) {
        const inLtrIsolate =
          el.closest('[dir="ltr"]') !== null ||
          el.tagName.toLowerCase() === 'bdi';
        if (!inLtrIsolate && !el.closest('[data-testid="fraction-ltr"]')) {
          unwrappedFractions.push({ tag, text: directText.slice(0, 50) });
        }
      }
    }

    const truncatedHeaderTitles: string[] = [];
    document.querySelectorAll('header h1, header h2, header span.truncate').forEach((el) => {
      if (!isVisible(el)) return;
      const htmlEl = el as HTMLElement;
      if (htmlEl.scrollWidth > htmlEl.clientWidth + 2) {
        truncatedHeaderTitles.push(`${(htmlEl.textContent || '').trim()} (${htmlEl.clientWidth}/${htmlEl.scrollWidth})`);
      }
    });

    const clippedTabStrips: string[] = [];
    document.querySelectorAll('[role="tablist"], .overflow-x-auto').forEach((strip) => {
      if (!isVisible(strip)) return;
      const htmlEl = strip as HTMLElement;
      const st = getComputedStyle(htmlEl);
      if (htmlEl.scrollWidth > htmlEl.clientWidth + 4 && st.overflowX !== 'auto' && st.overflowX !== 'scroll') {
        clippedTabStrips.push(htmlEl.className.slice(0, 60));
      }
    });

    const wrappedRecoveryChunks: string[] = [];
    document.querySelectorAll('[data-testid="recovery-key-chunk"], .recovery-key-token, code').forEach((chunk) => {
      if (!isVisible(chunk)) return;
      if (!/[A-Z0-9]{4}-[A-Z0-9]{4}/.test(chunk.textContent || '') && !chunk.matches('[data-testid="recovery-key-chunk"]')) return;
      const range = document.createRange();
      range.selectNodeContents(chunk);
      const rects = range.getClientRects();
      if (rects.length > 1) {
        wrappedRecoveryChunks.push((chunk.textContent || '').trim());
      }
    });

    const disabledLowContrast: string[] = [];
    document.querySelectorAll('button:disabled, input:disabled, select:disabled').forEach((el) => {
      if (!isVisible(el)) return;
      const st = getComputedStyle(el);
      if (parseFloat(st.opacity) < 0.55) {
        disabledLowContrast.push(`${el.tagName}:${(el.textContent || '').trim().slice(0, 30)} opacity=${st.opacity}`);
      }
    });

    const rawI18nKeys: string[] = [];
    const rawKeyRegex = /\b(?:analytics|attachments|kiosk)\.[a-zA-Z_]+\b/;
    const bodyText = (document.body.innerText || '').trim();
    const rawKeyMatch = bodyText.match(rawKeyRegex);
    if (rawKeyMatch) {
      rawI18nKeys.push(rawKeyMatch[0]);
    }

    return {
      horizontalOverflowPx: overflowPx,
      unlabeledButtons: unlabeledButtons.slice(0, 20),
      tinyFonts: tinyFonts.slice(0, 25),
      arabicMonoOrTracking: arabicMonoOrTracking.slice(0, 20),
      unwrappedFractions: unwrappedFractions.slice(0, 20),
      clippedTabStrips,
      truncatedHeaderTitles,
      wrappedRecoveryChunks,
      disabledLowContrast,
      rawI18nKeys,
    };
  });

  return { ...meta, ...result };
}

test.describe('Phase 6 UI/UX Comprehensive Verification (AR/EN, 1440/390, Light/Dark)', () => {
  test('Full App Audit & Visual Screenshots', async ({ page }) => {
    test.setTimeout(180_000);

    const allFindings: DomFinding[] = [];
    const check = async (
      screen: string,
      viewport: string,
      lang: string,
      theme: string,
      shotName?: string
    ) => {
      await page.waitForTimeout(150);
      const f = await inspectLiveDom(page, { screen, viewport, lang, theme });
      allFindings.push(f);
      if (shotName) await saveShot(page, shotName);
      if (!REPORT_ONLY) {
        expect(f.horizontalOverflowPx, `${screen} (${viewport} ${lang} ${theme}) overflow`).toBeLessThanOrEqual(2);
        expect(f.unlabeledButtons, `${screen} unlabeled buttons`).toEqual([]);
        expect(f.tinyFonts, `${screen} <12px fonts`).toEqual([]);
        expect(f.arabicMonoOrTracking, `${screen} arabic mono/tracking`).toEqual([]);
        expect(f.unwrappedFractions, `${screen} unwrapped RTL fractions`).toEqual([]);
        expect(f.clippedTabStrips, `${screen} clipped tab strips`).toEqual([]);
        expect(f.truncatedHeaderTitles, `${screen} truncated header titles`).toEqual([]);
        expect(f.wrappedRecoveryChunks, `${screen} orphan recovery key chunk`).toEqual([]);
        expect(f.disabledLowContrast, `${screen} low contrast disabled`).toEqual([]);
        expect(f.rawI18nKeys, `${screen} untranslated i18n keys`).toEqual([]);
      }
      return f;
    };

    // ---------------------------------------------------------
    // 1. Setup & Recovery Key (1440 Light AR -> 390 Dark AR)
    // ---------------------------------------------------------
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'networkidle' });

    await check('setup-password', '1440x900', 'ar', 'light', '01-setup-ar-1440-light');

    // Toggle to Dark Mode on Step 1 before advancing so Recovery renders in Dark
    await page
      .getByRole('button', { name: /الوضع الليلي|الوضع النهاري|Dark Mode|Light Mode|دۆخی شەو|دۆخی ڕۆژ/i })
      .first()
      .click();
    await page.locator('input#password').fill('ClinicVault!2026');
    await page.locator('input#confirmPassword').fill('ClinicVault!2026');
    await page.locator('button[type="submit"]').click();

    await expect(
      page.locator('button').filter({ hasText: /الدخول إلى مساحة العمل|Enter Clinical Workspace/i }).first()
    ).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await check('recovery-key', '390x844', 'ar', 'dark', '02-recovery-ar-390-dark');

    // Verify challenge & enter workspace
    const challengeInput = page.locator('input[type="text"]').first();
    const expectedGroup = (await challengeInput.getAttribute('placeholder')) || '';
    if (expectedGroup) await challengeInput.fill(expectedGroup);
    await page.locator('input[type="checkbox"]').first().check();
    await page
      .locator('button')
      .filter({ hasText: /الدخول إلى مساحة العمل|Enter Clinical Workspace/i })
      .first()
      .click();

    // ---------------------------------------------------------
    // 2. Clinic Mode Wizard -> Solo Mode -> Enable HEP & Analytics & Seed Demo
    // ---------------------------------------------------------
    await page.setViewportSize({ width: 1440, height: 900 });
    const soloModeBtn = page.getByTestId('wizard-mode-solo');
    await expect(soloModeBtn).toBeVisible({ timeout: 15_000 });
    await soloModeBtn.click();
    await page.getByTestId('wizard-confirm-btn').click();
    await expect(page.getByTestId('today-walkin-btn')).toBeVisible({ timeout: 15_000 });

    const userMenuBtn = page.locator('header button[aria-label*="menu"], header button[aria-label*="المستخدم"]').first();
    // Switch back to Light Mode via User Menu
    await userMenuBtn.click();
    await page.locator('button').filter({ hasText: /الوضع النهاري|Light Mode/i }).click();

    // Open Settings -> Modules -> Enable HEP & Analytics
    await userMenuBtn.click();
    await page.locator('button').filter({ hasText: /الإعدادات والخيارات|Settings/i }).first().click();
    await page.locator('button').filter({ hasText: /الأقسام|Modules/i }).first().click();
    const restoreHepBtn = page.locator('button').filter({ hasText: /استعادة وإظهار|Restore & Show Exercise/i }).first();
    if (await restoreHepBtn.isVisible()) await restoreHepBtn.click();
    const enableAnalyticsBtn = page.locator('button').filter({ hasText: /تفعيل لوحة التحليلات|Enable Local Analytics/i }).first();
    if (await enableAnalyticsBtn.isVisible()) await enableAnalyticsBtn.click();

    // Developer tab -> Load Demo Cases
    await page.locator('button').filter({ hasText: /المطور|Developer/i }).first().click();
    await page.locator('button').filter({ hasText: /فتح نافذة تحميل|Load Demo Cases/i }).first().click();
    await page.locator('button').filter({ hasText: /إدراج كافة الحالات|Seed All 5/i }).first().click();
    await expect(page.locator('text=/تم إدراج|Successfully seeded/i').first()).toBeVisible({ timeout: 25_000 });
    await page.locator('button').filter({ hasText: /^إغلاق$|^Close$/i }).first().click();

    // ---------------------------------------------------------
    // 3. Today View (Mobile 390x844 Light AR — queue above fold check!)
    // ---------------------------------------------------------
    await page.setViewportSize({ width: 390, height: 844 });
    await check('today-solo', '390x844', 'ar', 'light', '03-today-ar-390-light');

    const todayQueueMetrics = await page.evaluate(() => {
      const walkin = document.querySelector('[data-testid="today-walkin-btn"]')?.getBoundingClientRect();
      const firstRow = document.querySelector('[data-testid^="today-row-"]')?.getBoundingClientRect();
      return { walkinY: walkin?.top, firstRowTop: firstRow?.top, innerH: window.innerHeight };
    });
    console.log('PHASE6_METRIC today_mobile_queue:', JSON.stringify(todayQueueMetrics));
    expect(todayQueueMetrics.firstRowTop, 'Mobile Today first row must be above fold').toBeLessThan(
      todayQueueMetrics.innerH
    );

    // Switch to Team Mode via User Menu -> Settings -> Clinic
    await page.setViewportSize({ width: 1440, height: 900 });
    await userMenuBtn.click();
    await page.locator('button').filter({ hasText: /الإعدادات والخيارات|Settings/i }).first().click();
    await page.locator('button').filter({ hasText: /بيانات العيادة|Clinic/i }).first().click();
    await page.locator('button').filter({ hasText: /عيادة مع فريق وكادر|I Have a Team/i }).first().click();
    // If First-Run Admin PIN modal appears, configure PIN (8472)
    const pinSaveBtn = page
      .locator('button')
      .filter({ hasText: /حفظ رمز المدير|Save (?:Encrypted )?Admin PIN/i })
      .first();
    if (
      await pinSaveBtn
        .waitFor({ state: 'visible', timeout: 3000 })
        .then(() => true)
        .catch(() => false)
    ) {
      const pinInputs = page.locator('input[type="password"]');
      const cnt = await pinInputs.count();
      for (let idx = 0; idx < cnt; idx++) {
        await pinInputs.nth(idx).fill('8472');
      }
      await pinSaveBtn.click();
      await expect(pinSaveBtn).toBeHidden({ timeout: 5000 });
    }
    // Close Settings Drawer if still open
    const settingsBackdrop = page.locator('div.fixed.inset-0.z-50').first();
    if (await settingsBackdrop.isVisible({ timeout: 800 }).catch(() => false)) {
      const settingsCloseBtn = page
        .locator('button[aria-label*="إغلاق الإعدادات"], button[aria-label*="Close settings"]')
        .first();
      if (await settingsCloseBtn.isVisible({ timeout: 800 }).catch(() => false)) {
        await settingsCloseBtn.click();
      } else {
        await page.keyboard.press('Escape');
      }
      if (await settingsBackdrop.isVisible({ timeout: 500 }).catch(() => false)) {
        const footerCloseBtn = settingsBackdrop
          .locator('button')
          .filter({ hasText: /^إغلاق$|^Close$/i })
          .last();
        if (await footerCloseBtn.isVisible({ timeout: 500 }).catch(() => false)) {
          await footerCloseBtn.click();
        }
      }
      await expect(settingsBackdrop).toBeHidden({ timeout: 5000 });
    }

    // ---------------------------------------------------------
    // 4. Team Mode Views (Reception, HEP EN, Audit EN, Analytics, Schedule, Finance)
    // ---------------------------------------------------------
    await page.setViewportSize({ width: 390, height: 844 });
    await check('reception-team', '390x844', 'ar', 'light', '04-reception-ar-390-light');

    // Reception EN Dark 1440
    await page.setViewportSize({ width: 1440, height: 900 });
    await userMenuBtn.click();
    await page.locator('button').filter({ hasText: /^EN$/ }).click();
    await userMenuBtn.click();
    await page.locator('button').filter({ hasText: /Dark Mode|الوضع الليلي/i }).click();
    await check('reception-team', '1440x900', 'en', 'dark', '05-reception-en-1440-dark');

    // HEP & Audit in EN
    await page.locator('aside nav button').filter({ hasText: /Exercise & HEP/i }).click();
    const hepH1 = await page.locator('h1, h2').first().textContent();
    console.log('PHASE6_ROUTE_CHECK hep_en_heading:', JSON.stringify(hepH1));
    await check('exercises-hep', '1440x900', 'en', 'dark', '06-hep-en-1440-dark');

    await page.locator('aside nav button').filter({ hasText: /Audit & Staff Roles/i }).click();
    const auditH1 = await page.locator('h1, h2').first().textContent();
    console.log('PHASE6_ROUTE_CHECK audit_en_heading:', JSON.stringify(auditH1));
    await check('activity-log-audit', '1440x900', 'en', 'dark', '07-audit-en-1440-dark');

    await page.locator('aside nav button').filter({ hasText: /Analytics/i }).click();
    await check('analytics', '1440x900', 'en', 'dark', '08-analytics-en-1440-dark');

    await page.locator('aside nav button').filter({ hasText: /Schedule/i }).click();
    await check('schedule', '1440x900', 'en', 'dark', '09-schedule-en-1440-dark');

    // Finance in AR Light
    await userMenuBtn.click();
    await page.locator('button').filter({ hasText: /^العربية$/ }).click();
    await userMenuBtn.click();
    await page.locator('button').filter({ hasText: /Light Mode|الوضع النهاري/i }).click();
    await page.locator('aside nav button').filter({ hasText: /الحسابات/ }).click();
    await check('finance', '1440x900', 'ar', 'light', '10-finance-ar-1440-light');

    // Finance 390 Dark EN too
    await page.setViewportSize({ width: 390, height: 844 });
    await check('finance', '390x844', 'ar', 'light', '11-finance-ar-390-light');

    // Directory 390 AR Light -> Open Seeded Patient
    await page.locator('nav[aria-label*="التنقل"] button, nav button').filter({ hasText: /المرضى|Patients/ }).first().click();
    await check('directory', '390x844', 'ar', 'light', '12-directory-ar-390-light');

    // Open Patient 1 Quick-View Popup -> verify UI audit -> click Open Patient Chart
    await page.locator('button, [role="button"], h3').filter({ hasText: /أحمد فهد|Ahmed Fahad/i }).first().click();
    const quickViewDialog = page.getByRole('dialog');
    await expect(quickViewDialog).toBeVisible({ timeout: 5_000 });
    await check('patient-quick-view', '390x844', 'ar', 'light', '13a-patient-quick-view-ar-390-light');
    await quickViewDialog.getByRole('button', { name: /فتح الملف السريري|Open Patient Chart/i }).click();
    await check('patient-assessment', '390x844', 'ar', 'light', '13-patient-assessment-ar-390-light');

    // Check PatientBanner & Red Flag toggle visibility on mobile 390
    const bannerStats = await page.evaluate(() => {
      const imgsOrBadges = document.querySelectorAll('button').length;
      const alertBtn = Array.from(document.querySelectorAll('button')).find((b) =>
        /علامات|Red Flag|تنبيه|Alerts/i.test(b.textContent || '')
      );
      return {
        alertBtnVisible: alertBtn ? alertBtn.getBoundingClientRect().width > 0 : false,
        alertBtnText: alertBtn?.textContent?.trim(),
        alertBtnRect: alertBtn?.getBoundingClientRect(),
        imgsOrBadges,
      };
    });
    console.log('PHASE6_METRIC patient_banner_mobile:', JSON.stringify(bannerStats));

    // Open Progress / Charts tab on Mobile 390 & Desktop 1440
    await page.locator('button, [role="tab"]').filter({ hasText: /المقارنة|التقدّم|Progress/i }).first().click();
    await check('patient-progress', '390x844', 'ar', 'light', '14-patient-progress-ar-390-light');

    await page.setViewportSize({ width: 1440, height: 900 });
    await check('patient-progress', '1440x900', 'ar', 'light', '15-patient-progress-ar-1440-light');

    // Open Assessment -> Toolkit/Dermatomes in EN Light 1440
    await userMenuBtn.click();
    await page.locator('button').filter({ hasText: /^EN$/ }).click();
    await page.locator('button, [role="tab"]').filter({ hasText: /التقييم|Assessment/i }).first().click();
    await check('patient-assessment', '1440x900', 'en', 'light', '16-patient-assessment-en-1440-light');

    console.log('PHASE6_FINDINGS_JSON_START');
    console.log(JSON.stringify(allFindings, null, 2));
    console.log('PHASE6_FINDINGS_JSON_END');
  });
});
