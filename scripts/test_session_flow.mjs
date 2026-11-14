import puppeteer from 'puppeteer-core';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP_URL = 'http://localhost:3000/';
const SCREENSHOT_DIR = path.resolve('docs/audit_screenshots');

async function testSessionFlow() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--window-size=1440,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  await page.goto(APP_URL, { waitUntil: 'networkidle2' });

  // Select patient
  console.log('Selecting patient...');
  await page.evaluate(() => {
    const sidePatients = Array.from(document.querySelectorAll('aside button')).filter(b => b.innerText && (b.innerText.includes('سنة') || b.innerText.includes('y') || b.innerText.includes('أحمد') || b.innerText.includes('زينب')));
    if (sidePatients.length > 0) sidePatients[0].click();
  });
  await new Promise(r => setTimeout(r, 1200));

  // Go to sessions tab
  console.log('Navigating to sessions tab...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const sessTab = buttons.find(b => b.innerText && (b.innerText.includes('الجلسات') || b.innerText.includes('Sessions')));
    if (sessTab) sessTab.click();
  });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'test_patient_sessions_tab.png'), fullPage: true });

  // Click on a session card
  console.log('Clicking on session card...');
  const clickedSession = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('div')).filter(el => {
      return el.className && el.className.includes('bg-card') && el.innerText && el.innerText.includes('#1');
    });
    if (cards.length > 0) {
      cards[0].click();
      return true;
    }
    return false;
  });
  console.log('Session card clicked:', clickedSession);

  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'test_treatment_session_view.png'), fullPage: true });

  const isSoapView = await page.evaluate(() => {
    const text = document.body.innerText;
    return text.includes('SOAP') || text.includes('ملاحظات الجلسة') || text.includes('Flowsheet') || text.includes('تمارين الجلسة');
  });
  console.log('SOAP View loaded successfully:', isSoapView);

  await browser.close();
}

testSessionFlow().catch(console.error);
