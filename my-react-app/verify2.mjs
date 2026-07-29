import { chromium } from 'playwright';

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });
const errors = [];
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', err => errors.push('PAGEERROR: ' + err.message));

await page.goto('http://localhost:5174/?page=seller-report', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// Open detail modal for first seller
await page.getByRole('button', { name: 'View Details' }).first().click();
await page.waitForTimeout(300);
await page.screenshot({ path: '/Users/ian/Desktop/YTO/my-react-app/scratch_detail_modal.png' });
const modalText = await page.evaluate(() => document.body.innerText);
console.log('--- Detail modal text ---');
console.log(modalText.slice(0, 900));
await page.getByRole('button', { name: 'Close' }).click();

// Test archive/restore persistence
await page.waitForTimeout(300);
const firstRowStatusBefore = await page.locator('tbody tr').first().locator('td').nth(4).innerText();
console.log('Status before archive:', firstRowStatusBefore);
await page.getByRole('button', { name: 'Archive' }).first().click();
await page.waitForTimeout(800);
const firstRowStatusAfter = await page.locator('tbody tr').first().locator('td').nth(4).innerText();
console.log('Status after archive click:', firstRowStatusAfter);

// reload page fresh to confirm it persisted server-side (not just local state)
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const rows = await page.locator('tbody tr').allInnerTexts();
const archivedRow = rows.find(r => r.includes('Archived'));
console.log('After reload, found an Archived row:', !!archivedRow);
if (archivedRow) console.log(archivedRow.slice(0, 200));

// restore it back so we don't leave test data mutated
if (archivedRow) {
  await page.getByRole('button', { name: 'Restore' }).first().click();
  await page.waitForTimeout(800);
  console.log('Restored back to Active.');
}

console.log('Console errors:', errors.length ? errors : 'none');
await browser.close();
