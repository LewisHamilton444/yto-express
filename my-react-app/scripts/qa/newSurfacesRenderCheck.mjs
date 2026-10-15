// ============================================================================
// I-8 UI render check.  Run: npm run qa:i8ui
// ----------------------------------------------------------------------------
// Two of the I-8 features added visible UI, and neither can be proved by a
// build: a build says "this compiled", not "this appears". This drives the real
// pages in a real browser against the QA seed server and asserts on the DOM:
//
//   D-16  the Seller Directory shows the app-synced photo for the seller that
//         has one (a loaded <img>, not a broken box) and still shows initials
//         for the sellers that do not;
//   D-5   the App Notifications page offers the announcement composer, it opens
//         with the right fields, and submitting empty copy is refused with a
//         plain-language message instead of sending an empty announcement.
//
// Fixture: DEMO_SELLERS[0] carries profilePhotoUrl; the rest do not (see
// src/services/demoFixtures.js).
// ============================================================================

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startSeedServer } from './seedServer.mjs';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '..', '..');
const VITE_BIN = path.join(APP_ROOT, 'node_modules', 'vite', 'bin', 'vite.js');

let checks = 0;
let failures = 0;
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
    try { const r = await fetch(url); if (r.ok || r.status === 404) return true; } catch { /* not up yet */ }
    await sleep(300);
  }
  throw new Error(`timed out waiting for ${url}`);
}

async function main() {
  console.log('I-8 UI render check: photo avatar (D-16) + announcement composer (D-5)\n');

  const seed = await startSeedServer();
  const seedUrl = `http://127.0.0.1:${seed.port}`;
  const devPort = 21000 + Math.floor(Math.random() * 20000);
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

    // ── D-16: the seller photo ──────────────────────────────────────────
    console.log('1. D-16 the Seller Directory shows the app-synced photo');
    await page.goto(`${devUrl}/#/seller-report`, { waitUntil: 'commit', timeout: 90000 });
    await page.locator('.lp-avatar').first().waitFor({ timeout: 120000 });

    const avatars = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.lp-avatar'));
      return rows.map((el) => {
        const img = el.querySelector('img.yto-avatar-img');
        return {
          hasPhoto: !!img,
          loaded: img ? img.complete && img.naturalWidth > 0 : null,
          isDataUrl: img ? img.currentSrc.startsWith('data:image/png;base64,') : null,
          initials: img ? '' : (el.textContent || '').trim(),
        };
      });
    });

    const withPhoto = avatars.filter((a) => a.hasPhoto);
    const withoutPhoto = avatars.filter((a) => !a.hasPhoto);
    check('at least one seller avatar renders the synced photo', withPhoto.length > 0, true);
    check('the photo actually loaded (not a broken image box)', withPhoto.every((a) => a.loaded), true);
    check('it renders the app data URL', withPhoto.every((a) => a.isDataUrl), true);
    check('sellers without a photo still show initials', withoutPhoto.length > 0 && withoutPhoto.every((a) => a.initials.length > 0), true);
    info(`${withPhoto.length} avatar(s) with a photo, ${withoutPhoto.length} with initials`);

    // ── D-5: the announcement composer ──────────────────────────────────
    console.log('\n2. D-5 the announcement composer opens and refuses empty copy');
    await page.goto(`${devUrl}/#/app-notifications`, { waitUntil: 'commit', timeout: 90000 });

    const sendButton = page.getByRole('button', { name: 'Send an announcement to the app' });
    await sendButton.waitFor({ timeout: 60000 });
    check('the page offers a send-announcement action', await sendButton.count(), 1);

    await sendButton.click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ timeout: 15000 });
    check('the composer opens', await dialog.count(), 1);
    check('it titles itself in plain words', (await dialog.innerText()).includes('Send an announcement'), true);

    const form = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]');
      if (!dlg) return null;
      return {
        textInputs: dlg.querySelectorAll('input[type="text"]').length,
        textareas: dlg.querySelectorAll('textarea').length,
        selects: dlg.querySelectorAll('select').length,
        audienceOptions: Array.from(dlg.querySelectorAll('select')[0]?.options || []).map((o) => o.value),
        typeOptions: Array.from(dlg.querySelectorAll('select')[1]?.options || []).map((o) => o.value),
      };
    });
    check('it has a title field, a message box and two pickers', [form.textInputs, form.textareas, form.selects], [1, 1, 2]);
    check('the audience options are the ones the app understands', form.audienceOptions, ['all', 'customer', 'seller', 'rider']);
    check('the message types are the ones the app renders', form.typeOptions,
      ['system_alert', 'delivery_update', 'order_update', 'security_alert']);

    // Submitting empty copy must be refused locally, with a plain message.
    let broadcastAttempts = 0;
    await page.route('**/notifications/broadcast', async (route) => { broadcastAttempts += 1; await route.abort(); });

    await page.getByRole('button', { name: 'Send now' }).click();
    await page.waitForTimeout(600);
    const afterEmpty = await page.evaluate(() => document.querySelector('[role="dialog"]')?.innerText || '');
    check('empty copy is refused', afterEmpty.includes('Add a title and a message before sending.'), true);
    check('nothing was sent for an empty announcement', broadcastAttempts, 0);
    check('the composer stays open so the operator can fix it', await dialog.count(), 1);

    // Filling it in and sending must reach the endpoint with the drafted copy.
    await page.locator('[role="dialog"] input[type="text"]').fill('Hub closed Monday');
    await page.locator('[role="dialog"] textarea').fill('The Pulilan hub is closed on Monday.');
    await page.locator('[role="dialog"] select').first().selectOption('seller');
    await page.getByRole('button', { name: 'Send now' }).click();
    await page.waitForTimeout(900);
    check('a filled-in announcement is sent', broadcastAttempts, 1);

    check('no uncaught error while these pages rendered', pageErrors, []);
  } finally {
    if (browser) await browser.close();
    try { vite.kill(); } catch { /* already gone */ }
    await seed.close();
  }

  console.log(`\n${checks - failures}/${checks} I-8 UI render checks passed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => { console.error('check error:', err.message); process.exit(1); });
