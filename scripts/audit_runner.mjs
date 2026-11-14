import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP_URL = 'http://localhost:3000/';
const SCREENSHOT_DIR = path.resolve('docs/audit_screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const auditFindings = [];
const consoleLogs = [];
const networkErrors = [];

function recordFinding(finding) {
  auditFindings.push({
    timestamp: new Date().toISOString(),
    ...finding
  });
  console.log(`[AUDIT FINDING] [${finding.severity || 'INFO'}] [${finding.category}] ${finding.title}`);
}

async function runAudit() {
  console.log('🚀 Starting comprehensive multidisciplinary browser audit...');
  
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1440,900'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  page.on('console', (msg) => {
    const text = msg.text();
    const type = msg.type();
    consoleLogs.push({ type, text, location: msg.location() });
    if (type === 'error' && !text.includes('404')) {
      recordFinding({
        id: `TECH-CONSOLE-${consoleLogs.length}`,
        page: 'Console',
        category: 'Technical',
        severity: 'High',
        title: `Browser console error: ${text.slice(0, 120)}`,
        actual: text,
        expected: 'Clean browser console without runtime exceptions'
      });
    }
  });

  page.on('pageerror', (err) => {
    recordFinding({
      id: `TECH-EXCEPTION-${Date.now()}`,
      page: 'Runtime',
      category: 'Technical',
      severity: 'Critical',
      title: `Uncaught Page Exception: ${err.message}`,
      actual: err.stack || err.message,
      expected: 'Clean runtime without uncaught exceptions'
    });
  });

  page.on('requestfailed', (req) => {
    networkErrors.push({ url: req.url(), failure: req.failure() });
  });

  console.log(`📡 Navigating to ${APP_URL}...`);
  await page.goto(APP_URL, { waitUntil: 'networkidle2', timeout: 30000 });

  // 1. Initial State Inspection & Vault Unlock/Setup
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_initial_state.png'), fullPage: true });

  const hasPasswordInput = await page.evaluate(() => Boolean(document.querySelector('input[type="password"]')));

  if (hasPasswordInput) {
    console.log('Lock screen detected. Checking setup vs unlock...');
    const hasConfirm = await page.evaluate(() => Boolean(document.querySelector('#confirmPassword')));
    if (hasConfirm) {
      console.log('Setup mode: Entering master password...');
      await page.type('input#password', 'ClinicalMaster123!');
      await page.type('input#confirmPassword', 'ClinicalMaster123!');
      await page.click('button[type="submit"]');
      await new Promise(r => setTimeout(r, 2500));

      console.log('Step 2: Emergency Recovery Key Screen rendered!');
      await page.waitForFunction(() => {
        return document.body.innerText.includes('Recovery Key') || document.body.innerText.includes('مفتاح الاسترداد');
      }, { timeout: 10000 });
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_recovery_key_step.png'), fullPage: true });

      // Check confirmation checkbox
      const checkbox = await page.$('input[type="checkbox"]');
      if (checkbox) await checkbox.click();
      await new Promise(r => setTimeout(r, 500));

      // Click "Enter Clinical Workspace"
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const enterBtn = btns.find(b => b.innerText.includes('الدخول') || b.innerText.includes('Enter Clinical'));
        if (enterBtn) enterBtn.click();
      });
      await new Promise(r => setTimeout(r, 1500));
    } else {
      console.log('Unlock mode: Entering master password...');
      await page.type('input#password', 'ClinicalMaster123!');
      await page.click('button[type="submit"]');
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // Check if we are now inside workspace
  await page.waitForFunction(() => {
    return Boolean(document.querySelector('aside') || document.querySelector('header') || document.body.innerText.includes('PhysioRecord'));
  }, { timeout: 10000 });

  console.log('✅ Reached Clinical Workspace!');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_workspace_home.png'), fullPage: true });

  // 2. Open Synthetic Data Modal and Seed Demo Cases
  console.log('🌱 Seeding demo clinical cases...');
  const seedBtn = await page.evaluateHandle(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    return btns.find(b => b.innerText.includes('بيانات تجريبية') || b.innerText.includes('Demo'));
  });

  if (seedBtn && seedBtn.asElement()) {
    await seedBtn.asElement().click();
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_synthetic_modal.png') });

    // Click "إدراج كافة الحالات السريرية الخمس"
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const gen = btns.find(b => b.innerText.includes('إدراج كافة الحالات') || b.innerText.includes('Seed All'));
      if (gen) gen.click();
    });
    console.log('Waiting for synthetic seeding to complete in IndexedDB...');
    await new Promise(r => setTimeout(r, 4000));

    // Close modal
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const close = btns.find(b => b.innerText.includes('إغلاق') || b.innerText.includes('Close'));
      if (close) close.click();
    });
    await new Promise(r => setTimeout(r, 1000));
  }

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_workspace_seeded.png'), fullPage: true });

  // 3. Inspect Navigation & Each Main View in Detail
  const viewsToTest = [
    { id: 'reception', labelAr: 'الاستقبال', labelEn: 'Reception' },
    { id: 'directory', labelAr: 'سجل المرضى الشامل', labelEn: 'Directory' },
    { id: 'schedule', labelAr: 'جدول المواعيد والانتظار', labelEn: 'Schedule' },
    { id: 'finance', labelAr: 'السجل المالي', labelEn: 'Finance' },
    { id: 'exercises', labelAr: 'مكتبة التمارين', labelEn: 'Exercise' },
    { id: 'activity_log', labelAr: 'سجل التدقيق والصلاحيات', labelEn: 'Audit' },
  ];

  for (const v of viewsToTest) {
    console.log(`🔍 Testing module: ${v.labelEn} (${v.labelAr})...`);
    
    // Click navigation item in sidebar
    await page.evaluate((labelAr, labelEn) => {
      const buttons = Array.from(document.querySelectorAll('aside button'));
      const target = buttons.find(b => b.innerText.includes(labelAr) || b.innerText.includes(labelEn));
      if (target) target.click();
    }, v.labelAr, v.labelEn);

    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `05_view_${v.id}.png`), fullPage: true });

    // Check for horizontal overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth || document.body.scrollWidth > window.innerWidth;
    });

    if (hasHorizontalOverflow) {
      recordFinding({
        id: `RESP-OVERFLOW-${v.id}`,
        page: v.labelEn,
        category: 'Responsive',
        severity: 'High',
        title: `Horizontal page overflow detected on ${v.labelEn} view at 1440px width`,
        actual: 'Horizontal scrollbar appears, layout overflows viewport width',
        expected: 'Zero horizontal scroll on standard viewport'
      });
    }

    // Check for empty buttons or missing labels
    const unlabeledElements = await page.evaluate(() => {
      const unlabeled = [];
      document.querySelectorAll('button').forEach((b, idx) => {
        const text = b.innerText.trim();
        const ariaLabel = b.getAttribute('aria-label');
        const title = b.getAttribute('title');
        if (!text && !ariaLabel && !title) {
          unlabeled.push({ index: idx, html: b.outerHTML.slice(0, 100) });
        }
      });
      return unlabeled;
    });

    if (unlabeledElements.length > 0) {
      recordFinding({
        id: `A11Y-UNLABELED-${v.id}`,
        page: v.labelEn,
        category: 'Accessibility',
        severity: 'Medium',
        title: `${unlabeledElements.length} button(s) lack accessible text, aria-label, or title on ${v.labelEn}`,
        actual: JSON.stringify(unlabeledElements),
        expected: 'Every interactive button must have accessible name for screen readers'
      });
    }
  }

  // 4. Test New Patient Registration Modal
  console.log('👤 Testing New Patient Registration Modal...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.innerText.includes('مريض جديد') || b.innerText.includes('تسجيل مريض جديد') || b.innerText.includes('New Patient'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_patient_modal_open.png') });

  // Close Patient Modal
  await page.evaluate(() => {
    const closeBtns = Array.from(document.querySelectorAll('div[role="dialog"] button, div.fixed button'));
    if (closeBtns.length > 0) closeBtns[0].click();
  });
  await new Promise(r => setTimeout(r, 500));

  // 5. Test Patient Directory -> Open Patient -> Patient Workspace
  console.log('🩺 Testing Patient Selection & Clinical Workspace...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('aside button'));
    const target = buttons.find(b => b.innerText.includes('سجل المرضى') || b.innerText.includes('Directory'));
    if (target) target.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  // Select patient by clicking table row or card
  const patientSelected = await page.evaluate(() => {
    // Try table view row or button
    const openChartSpan = Array.from(document.querySelectorAll('span, p, h3, div')).find(el => el.innerText && (el.innerText.includes('فتح السجل') || el.innerText.includes('Open Chart')));
    if (openChartSpan) {
      openChartSpan.click();
      return true;
    }
    // Try clicking card directly
    const cards = Array.from(document.querySelectorAll('.bg-card [class*="cursor-pointer"]'));
    if (cards.length > 0) {
      cards[0].click();
      return true;
    }
    // Try sidebar active patient list
    const asideButtons = Array.from(document.querySelectorAll('aside button')).filter(b => b.innerText && (b.innerText.includes('سنة') || b.innerText.includes('y')));
    if (asideButtons.length > 0) {
      asideButtons[0].click();
      return true;
    }
    return false;
  });

  console.log(`Patient selected: ${patientSelected}`);
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_patient_workspace.png'), fullPage: true });

  // Test tabs inside Master Patient Chart
  const chartTabs = [
    { id: 'evaluation', ar: 'التقييم', en: 'Evaluation' },
    { id: 'comparison', ar: 'المقارنة', en: 'Comparison' },
    { id: 'hep', ar: 'التمارين', en: 'HEP' },
    { id: 'sessions', ar: 'الجلسات', en: 'Sessions' },
    { id: 'profile', ar: 'الملف', en: 'Profile' }
  ];

  for (const tab of chartTabs) {
    console.log(`📑 Testing Patient Tab: ${tab.en}...`);
    await page.evaluate((tAr, tEn) => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const b = buttons.find(btn => btn.innerText && (btn.innerText.includes(tAr) || btn.innerText.includes(tEn)));
      if (b) b.click();
    }, tab.ar, tab.en);
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `08_patient_tab_${tab.id}.png`), fullPage: true });
  }

  // 6. Test Treatment Session View & SOAP Flowsheet
  console.log('📝 Testing Treatment Session View & Flowsheet...');
  // Click on Sessions tab
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const sessTab = buttons.find(b => b.innerText && (b.innerText.includes('الجلسات') || b.innerText.includes('Sessions')));
    if (sessTab) sessTab.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  // Click on first session or create new session
  const sessionOpened = await page.evaluate(() => {
    const sessionCards = Array.from(document.querySelectorAll('[role="button"], div')).filter(el => {
      const txt = el.innerText || '';
      return txt.includes('#1') || txt.includes('2026-03-01') || (txt.includes('#') && (txt.includes('Finalized') || txt.includes('معتمدة') || txt.includes('مسودة')));
    });
    if (sessionCards.length > 0) {
      sessionCards[0].click();
      return true;
    }
    return false;
  });

  console.log(`Session interaction: ${sessionOpened}`);
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_treatment_session_view.png'), fullPage: true });

  // 7. Test Responsive Viewports (Matrix)
  console.log('📱 Testing Multi-Device Viewport Responsiveness...');
  const viewports = [
    { name: '320x720_mobile_compact', width: 320, height: 720 },
    { name: '360x800_android_standard', width: 360, height: 800 },
    { name: '390x844_iphone_12_13_14', width: 390, height: 844 },
    { name: '430x932_iphone_pro_max', width: 430, height: 932 },
    { name: '768x1024_ipad_portrait', width: 768, height: 1024 },
    { name: '1024x768_ipad_landscape', width: 1024, height: 768 },
    { name: '1280x800_laptop_small', width: 1280, height: 800 },
    { name: '1440x900_desktop_standard', width: 1440, height: 900 },
    { name: '1920x1080_desktop_fhd', width: 1920, height: 1080 }
  ];

  for (const vp of viewports) {
    await page.setViewport({ width: vp.width, height: vp.height });
    await new Promise(r => setTimeout(r, 600));

    const overflowInfo = await page.evaluate((vpWidth) => {
      const docWidth = document.documentElement.scrollWidth;
      const bodyWidth = document.body.scrollWidth;
      const isOverflow = docWidth > vpWidth || bodyWidth > vpWidth;
      
      const offenders = [];
      if (isOverflow) {
        document.querySelectorAll('*').forEach(el => {
          if (el.scrollWidth > vpWidth + 2) {
            offenders.push({
              tag: el.tagName,
              className: el.className ? String(el.className).slice(0, 50) : '',
              scrollWidth: el.scrollWidth
            });
          }
        });
      }

      return {
        isOverflow,
        docWidth,
        bodyWidth,
        offenders: offenders.slice(0, 3)
      };
    }, vp.width);

    if (overflowInfo.isOverflow) {
      recordFinding({
        id: `RESP-OVERFLOW-${vp.name}`,
        page: 'Responsive Matrix',
        category: 'Responsive',
        severity: vp.width < 500 ? 'Critical' : 'High',
        title: `Horizontal layout overflow on ${vp.name} (${vp.width}x${vp.height}) - scrollWidth is ${Math.max(overflowInfo.docWidth, overflowInfo.bodyWidth)}px`,
        actual: `Overflow by ${Math.max(overflowInfo.docWidth, overflowInfo.bodyWidth) - vp.width}px. Offending elements: ${JSON.stringify(overflowInfo.offenders)}`,
        expected: `Layout should strictly fit within viewport width (${vp.width}px) without horizontal scrollbar`
      });
    }

    // Touch targets check for mobile viewports (< 768px)
    if (vp.width < 768) {
      const smallTouchTargets = await page.evaluate(() => {
        const small = [];
        document.querySelectorAll('button, a, input, select').forEach(el => {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0 && (rect.width < 32 || rect.height < 32)) {
            small.push({
              tag: el.tagName,
              text: el.innerText ? el.innerText.trim().slice(0, 20) : '',
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            });
          }
        });
        return small.slice(0, 5);
      });

      if (smallTouchTargets.length > 0) {
        recordFinding({
          id: `A11Y-TOUCH-${vp.name}`,
          page: 'Mobile Usability',
          category: 'Accessibility',
          severity: 'Medium',
          title: `Interactive elements with undersized touch targets (< 32px) on ${vp.name}`,
          actual: JSON.stringify(smallTouchTargets),
          expected: 'Touch targets on mobile viewports should meet minimum recommended tap area (36-44px)'
        });
      }
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `10_responsive_${vp.name}.png`) });
  }

  // 8. Test Theme Customizer & Dark/Light Toggle
  console.log('🎨 Testing Preline Themes and Dark/Light Modes...');
  await page.setViewport({ width: 1440, height: 900 });

  // Toggle Dark Mode
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('header button, aside button'));
    const themeBtn = buttons.find(b => b.getAttribute('title')?.includes('Mode') || b.getAttribute('title')?.includes('الوضع') || b.getAttribute('title')?.includes('نهاري') || b.getAttribute('title')?.includes('ليلي'));
    if (themeBtn) themeBtn.click();
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11_theme_dark_mode.png'), fullPage: true });

  // Toggle Language to English (LTR)
  console.log('🌐 Testing English (LTR) Mode...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('header button, aside button'));
    const langBtn = buttons.find(b => b.innerText.includes('EN') || b.innerText.includes('English'));
    if (langBtn) langBtn.click();
  });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '12_language_english_ltr.png'), fullPage: true });

  // Switch Preline color theme to Ocean Blue
  await page.evaluate(() => {
    const swatchBtns = Array.from(document.querySelectorAll('button')).filter(b => b.getAttribute('title')?.includes('Ocean') || b.getAttribute('title')?.includes('Blue'));
    if (swatchBtns.length > 0) swatchBtns[0].click();
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '13_preline_ocean_blue_theme.png'), fullPage: true });

  // 9. Test Clinical Reference Toolkit Modal
  console.log('📖 Testing Clinical Toolkit Modal...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('header button, aside button'));
    const toolkitBtn = buttons.find(b => b.getAttribute('title')?.includes('Toolkit') || b.getAttribute('title')?.includes('المراجع'));
    if (toolkitBtn) toolkitBtn.click();
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '14_clinical_toolkit_modal.png') });

  // Close toolkit
  await page.evaluate(() => {
    const closeBtns = Array.from(document.querySelectorAll('div[role="dialog"] button, div.fixed button'));
    if (closeBtns.length > 0) closeBtns[0].click();
  });
  await new Promise(r => setTimeout(r, 500));

  // Save audit data summary
  const summaryReport = {
    executedAt: new Date().toISOString(),
    totalFindings: auditFindings.length,
    findings: auditFindings,
    consoleLogsCount: consoleLogs.length,
    networkErrorsCount: networkErrors.length
  };

  fs.writeFileSync('docs/audit_raw_findings.json', JSON.stringify(summaryReport, null, 2), 'utf8');
  console.log(`\n🎉 Audit completed! Total findings logged: ${auditFindings.length}`);

  await browser.close();
}

runAudit().catch(err => {
  console.error('Audit failed with error:', err);
  process.exit(1);
});
