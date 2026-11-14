import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: 'new',
  args: ['--no-sandbox']
});
const page = await browser.newPage();
page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
page.on('pageerror', err => console.error('PAGE ERROR:', err));

await page.goto('http://localhost:3000/', { waitUntil: 'networkidle2' });

console.log('Typing password...');
await page.type('input#password', 'ClinicalMaster123!');
await page.type('input#confirmPassword', 'ClinicalMaster123!');

console.log('Submitting form...');
await page.click('button[type="submit"]');

// Wait 4 seconds to observe state changes
for (let i = 0; i < 8; i++) {
  await new Promise(r => setTimeout(r, 500));
  const status = await page.evaluate(() => {
    return {
      title: document.querySelector('h1, h2')?.innerText,
      hasInput: Boolean(document.querySelector('input')),
      bodySnippet: document.body.innerText.slice(0, 300)
    };
  });
  console.log(`Step ${i}:`, status.title);
}

await browser.close();
