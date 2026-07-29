import { chromium } from 'playwright';

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();

const pages = [
  { name: 'seller-report', label: 'ViewSeller' },
  { name: 'monitor-rider', label: 'MonitorRiderStatus' },
  { name: 'rider-report', label: 'GenerateRiderDataReport' },
];

for (const p of pages) {
  const errors = [];
  page.removeAllListeners('console');
  page.removeAllListeners('pageerror');
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push('PAGEERROR: ' + err.message));

  await page.goto(`http://localhost:5174/?page=${p.name}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000); // allow fetch-fail -> mock fallback to settle
  await page.screenshot({ path: `/private/tmp/claude-501/-Users-ian-Desktop-YTO/6977aea6-4d9a-41d5-a414-e6c2835c06b9/scratchpad/${p.name}.png`, fullPage: true });

  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log(`\n=== ${p.label} (${p.name}) ===`);
  console.log('Console errors:', errors.length ? errors : 'none');
  console.log('Body text snippet (first 1500 chars):');
  console.log(bodyText.slice(0, 1500));
}

await browser.close();
