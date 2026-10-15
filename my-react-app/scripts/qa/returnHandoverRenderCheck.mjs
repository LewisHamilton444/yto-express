// ============================================================================
// Parcel drawer render check (D-19 return handover + I-4 QR).  npm run qa:drawer
// ----------------------------------------------------------------------------
// This closes the one gap a compile/lint pass cannot: whether the admin
// portal's parcel drawer actually RENDERS the return-handover evidence and the
// scannable code. It drives the real component tree in a real browser against
// the QA seed server, so it asserts on DOM output, not on source review.
//
// What it proves:
//   1. the Return Handover panel appears for a parcel that has one, naming the
//      person who took the parcel back;
//   2. the merchant signature and the parcel-condition photos load as real
//      images (naturalWidth > 0), not broken <img> boxes;
//   3. the honest fallbacks ("No signature captured") are NOT shown when the
//      photos exist;
//   4. the in-drawer QR decodes back to the parcel's own payload (decoded with
//      jsQR from the rendered canvas, the same pixels a scanner sees);
//   5. the panel is conditional — a parcel with no handover renders none of it
//      (guards against a panel that appears unconditionally).
//
// Fixture: DEMO_PARCELS[0] (tracking YTO-QA-1001) is the dataset's one completed
// return; see src/services/demoFixtures.js.
// ============================================================================

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startSeedServer } from './seedServer.mjs';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '..', '..');
const VITE_BIN = path.join(APP_ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
const JSQR_SRC = fs.readFileSync(path.join(APP_ROOT, 'node_modules', 'jsqr', 'dist', 'jsQR.js'), 'utf8');

const RETURNED_TRACKING = 'YTO-QA-1001';

let failures = 0;
let checks = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  checks += 1;
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : ` -- expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}
function info(m) { console.log(`  info ${m}`); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function mintToken() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const payload = { email: 'qa.superadmin@yto.com', role: 'super_admin', exp: Math.floor(Date.now() / 1000) + 86400 };
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload)}.qa-seed-signature`;
}

async function waitForHttp(url, timeoutMs = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try { const r = await fetch(url); if (r.ok || r.status === 404) return true; } catch (e) { /* not up yet */ }
    await sleep(300);
  }
  throw new Error(`timed out waiting for ${url}`);
}

// Reads the rendered <img> the way a scanner would: real pixels off a canvas.
async function decodeRendered(page, selector) {
  await page.addScriptTag({ content: JSQR_SRC });
  await page.waitForFunction((sel) => {
    const img = document.querySelector(sel);
    return !!img && img.complete && img.naturalWidth > 0;
  }, selector, { timeout: 10000 });
  return page.evaluate((sel) => {
    const img = document.querySelector(sel);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const found = window.jsQR(px.data, px.width, px.height);
    return { width: img.naturalWidth, height: img.naturalHeight, decoded: found ? found.data : null };
  }, selector);
}

async function openDrawerFor(page, rowText) {
  const row = page.locator('tr.mp-row', { hasText: rowText }).first();
  await row.waitFor({ timeout: 15000 });
  await row.locator('.mp-view-btn').click();
  await page.getByRole('button', { name: 'GPS & Proof of Delivery' }).click();
  await page.waitForTimeout(400);
}

async function main() {
  console.log('Parcel drawer render check: D-19 return handover + I-4 QR\n');

  const seed = await startSeedServer();
  const seedUrl = `http://127.0.0.1:${seed.port}`;
  const devPort = 20000 + Math.floor(Math.random() * 20000);
  const devUrl = `http://127.0.0.1:${devPort}`;
  info(`seed API: ${seedUrl}`);

  const vite = spawn(process.execPath, [VITE_BIN, '--host', '127.0.0.1', '--port', String(devPort), '--strictPort'], {
    cwd: APP_ROOT, env: { ...process.env, VITE_API_URL: seedUrl }, stdio: 'ignore',
  });

  let browser;
  try {
    await waitForHttp(devUrl);
    info(`portal:   ${devUrl}`);

    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    await page.addInitScript((t) => window.localStorage.setItem('yto_token', t), mintToken());
    // The dev server transforms the whole module graph on first hit, which can
    // outlast the default navigation budget, so wait for the commit and then
    // for the rendered table rather than for the load event.
    await page.goto(`${devUrl}/#/manage-parcels`, { waitUntil: 'commit', timeout: 90000 });
    await page.locator('tr.mp-row').first().waitFor({ timeout: 120000 });

    // 1. the returned parcel is listed
    const returnedRow = page.locator('tr.mp-row', { hasText: 'Returned' }).first();
    check('the completed-return parcel is listed', await returnedRow.count() > 0, true);

    // 2. the drawer shows its handover evidence
    await openDrawerFor(page, 'Returned');
    // innerText returns the CSS-rendered text, and this heading is uppercased
    // by its own text-transform, so the assertions are case-insensitive.
    const panelHeading = (await page.getByText(/Return Handover — /i).first().innerText()).trim();
    check('the Return Handover panel renders', /return handover —/i.test(panelHeading), true);
    info(`panel heading: ${JSON.stringify(panelHeading)}`);
    check('it names the person who took the parcel back', /\(seller\)/i.test(panelHeading), true);

    const sig = page.locator('img[alt="Signature of the person who received the returned parcel"]');
    const cond = page.locator('img[alt="Condition of the parcel when it was handed back"]');
    check('the merchant signature image is present', await sig.count(), 1);
    check('the parcel-condition image is present', await cond.count(), 1);

    const dims = await page.evaluate(() => {
      const pick = (alt) => {
        const img = document.querySelector(`img[alt="${alt}"]`);
        return img ? { complete: img.complete, w: img.naturalWidth, h: img.naturalHeight, isPng: img.currentSrc.startsWith('data:image/png;base64,') } : null;
      };
      return {
        sig: pick('Signature of the person who received the returned parcel'),
        cond: pick('Condition of the parcel when it was handed back'),
      };
    });
    check('the signature photo actually loaded as an image', dims.sig && dims.sig.complete && dims.sig.w > 0 && dims.sig.h > 0, true);
    check('the condition photo actually loaded as an image', dims.cond && dims.cond.complete && dims.cond.w > 0 && dims.cond.h > 0, true);
    info(`signature ${dims.sig.w}x${dims.sig.h}px · condition ${dims.cond.w}x${dims.cond.h}px`);

    // 3. the honest fallbacks stay hidden when the evidence exists
    const body = await page.locator('body').innerText();
    check('no "No signature captured" fallback is shown', body.includes('No signature captured'), false);
    check('no "No condition photo captured" fallback is shown', body.includes('No condition photo captured'), false);

    // 4. the in-drawer QR is real and carries this parcel's own payload
    const qr = await decodeRendered(page, `img[alt="Label code for ${RETURNED_TRACKING}"]`);
    const payloadParts = qr.decoded ? qr.decoded.split('|') : [];
    check('the parcel label QR rendered as a real image', qr.width > 0 && qr.height > 0, true);
    check('the label QR carries the full YTOQR1 payload', payloadParts.length === 4 && payloadParts[0] === 'YTOQR1', true);
    check('the label QR names this parcel', qr.decoded ? qr.decoded.includes(RETURNED_TRACKING) : false, true);
    check('it is the same code the portal minted for the parcel', qr.decoded, `YTOQR1|${RETURNED_TRACKING}|YTOS20260001|YTOC20260001`);
    info(`decoded code: ${qr.decoded}`);

    // 5. negative control — a parcel with no handover renders no panel
    await page.getByRole('button', { name: 'Close parcel details' }).click();
    await page.waitForTimeout(300);
    await openDrawerFor(page, 'In Transit');
    const controlText = await page.locator('body').innerText();
    check('a parcel with no handover shows no Return Handover panel', controlText.includes('Return Handover'), false);
    check('its normal drawer still renders', controlText.includes('Proof of Delivery'), true);

    check('no uncaught error while the drawer rendered', pageErrors, []);
  } finally {
    if (browser) await browser.close();
    try { vite.kill(); } catch (e) { /* already gone */ }
    await seed.close();
  }

  console.log(`\n${checks - failures}/${checks} parcel drawer render checks passed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => { console.error('check error:', err.message); process.exit(1); });
