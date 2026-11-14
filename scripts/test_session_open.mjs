import puppeteer from 'puppeteer-core';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP_URL = 'http://localhost:3000/';
const SCREENSHOT_DIR = path.resolve('docs/audit_screenshots');

async function testOpenSessionDirectly() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--window-size=1440,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  await page.goto(APP_URL, { waitUntil: 'networkidle2' });

  // Select patient
  console.log('Selecting patient from directory...');
  await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.bg-card [class*="cursor-pointer"]'));
    if (cards.length > 0) cards[0].click();
  });
  await new Promise(r => setTimeout(r, 1500));

  // Find all clickable session items in sidebar or chart
  const sessionItemClicked = await page.evaluate(() => {
    // Look in PatientSummarySidebar
    const sessionItems = Array.from(document.querySelectorAll('.bg-surface\\/40, [class*="cursor-pointer"]')).filter(el => {
      return el.innerText && (el.innerText.includes('تقييم') || el.innerText.includes('جلسة') || el.innerText.includes('Session') || el.innerText.includes('2026'));
    });
    console.log('Found session candidates:', sessionItems.length);
    if (sessionItems.length > 0) {
      sessionItems[0].click();
      return true;
    }
    return false;
  });
  console.log('Session item clicked:', sessionItemClicked);

  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_treatment_session_view.png'), fullPage: true });

  const isSoapView = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      hasSoapHeader: text.includes('SOAP') || text.includes('توثيق الجلسة') || text.includes('Treatment Session'),
      hasFlowsheet: text.includes('Flowsheet') || text.includes('تمارين الجلسة') || text.includes('العلاج اليدوي'),
      hasPainNrs: text.includes('NRS') || text.includes('مقياس شدة الألم')
    };
  });
  console.log('SOAP View Verification:', isSoapView);

  await browser.close();
}

testOpenSessionDirectly().catch(console.error);
