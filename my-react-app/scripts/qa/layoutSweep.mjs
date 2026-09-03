// QA layout sweep — headless-Chrome geometry + crash sweep of the admin portal.
//
//   npm run qa:layout            full matrix (default widths below)
//   npm run qa:layout -- 1366 1280 1080 960 902   custom widths
//
// What it does:
//   1. Starts an in-process seed API server (see ./seedServer.mjs) so every
//      screen renders real seeded rows instead of empty/live states.
//   2. Boots a local Vite dev server pointed at the seed server.
//   3. Launches headless Chrome, mints an offline demo super-admin JWT
//      (App.jsx decodes tokens client-side, so no real backend is needed),
//      and logs into the portal.
//   4. For every sidebar page x every viewport width it measures:
//        - horizontal overflow (document scrollWidth - clientWidth)
//        - whether the ErrorBoundary recovery card is showing (page crash)
//        - runtime console errors captured via CDP Log/Runtime events
//   5. Prints a pass/fail table and exits non-zero on any failure.
//
// This catches exactly the class of bug `vite build` cannot: pages that
// crash or overflow only when real data + a real viewport exercise them
// (previously caught: vehicleIcon, .toFixed on undefined, history.forEach
// on a non-array, plus all the Array.isArray hardening that lives in the
// page sources now).
//
// Runtime: ~2-4 minutes depending on page count and machine.

import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startSeedServer } from './seedServer.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '..', '..');
const VITE_BIN = path.join(APP_ROOT, 'node_modules', 'vite', 'bin', 'vite.js');

const DEFAULT_WIDTHS = [1280, 1080, 960, 902];
const VIEWPORT_H = 768;          // small-laptop height: the QA target
const PAGE_SETTLE_MS = 900;      // wait after a nav click for data + layout
const RESIZE_SETTLE_MS = 450;

// ── tiny helpers ─────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const fail = (msg) => { console.error(msg); process.exitCode = 1; };

async function waitForHttp(url, timeoutMs, tries = 100) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {}
    await sleep(timeoutMs / tries);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  for (const c of candidates) {
    try { execFileSync(c, ['--version'], { stdio: 'ignore' }); return c; } catch {}
  }
  throw new Error('Chrome not found. Set CHROME_PATH to your chrome.exe.');
}

// Mint an offline JWT that App.jsx will accept (header.payload.sig, payload
// decoded client-side, `exp` in the future, super_admin role).
function mintToken() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const payload = {
    email: 'qa.superadmin@yto.com',
    role: 'super_admin',
    isDemo: true,
    exp: Math.floor(Date.now() / 1000) + 86400,
  };
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload)}.qa-seed-signature`;
}

// ── minimal CDP client over the global WebSocket ────────────────────────
class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }
  async open() {
    if (this.ws.readyState === WebSocket.OPEN) return;
    await new Promise((res, rej) => {
      this.ws.onopen = res;
      this.ws.onerror = (e) => rej(new Error('CDP connect failed'));
    });
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id) {
        const p = this.pending.get(msg.id);
        if (p) { this.pending.delete(msg.id); msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result); }
        return;
      }
      const ls = this.listeners.get(msg.method);
      if (ls) ls.forEach((fn) => fn(msg.params));
    };
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, new Set());
    this.listeners.get(method).add(fn);
  }
  close() { try { this.ws.close(); } catch {} }
}

// ── the sweep ────────────────────────────────────────────────────────────
async function main() {
  const widths = process.argv.slice(2).map(Number).filter((n) => n > 0 && Number.isInteger(n));
  const WIDTHS = widths.length ? [...new Set(widths)] : DEFAULT_WIDTHS;
  const chromePath = findChrome();
  const token = mintToken();

  const errors = [];            // every captured console error, appended
  let pageMarker = 0;           // errors before this index belong to prior page

  log('YTO admin layout sweep');
  log('  widths:  ' + WIDTHS.join(', ') + 'px   height: ' + VIEWPORT_H + 'px');

  // 1. Seed API server
  const seed = await startSeedServer();
  const seedUrl = `http://127.0.0.1:${seed.port}`;
  log('  seed:    ' + seedUrl);

  // 2. Vite dev server against the seed server
  const devPort = 20000 + Math.floor(Math.random() * 20000);
  const devUrl = `http://127.0.0.1:${devPort}`;
  const vite = spawn(process.execPath, [VITE_BIN, '--host', '127.0.0.1', '--port', String(devPort), '--strictPort'], {
    cwd: APP_ROOT,
    env: { ...process.env, VITE_API_URL: seedUrl },
    stdio: 'ignore',
  });
  log('  vite:    ' + devUrl + ' (VITE_API_URL=' + seedUrl + ')');
  try { await waitForHttp(devUrl, 30000); } catch (e) { fail('  vite boot: ' + e.message); }

  // 3. Headless Chrome
  const dbgPort = devPort + 1;
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yto-qa-chrome-'));
  const chrome = spawn(chromePath, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=' + profileDir, '--remote-debugging-port=' + dbgPort,
    '--window-size=1400,900', 'about:blank',
  ], { stdio: 'ignore' });
  let cdp;
  try {
    await waitForHttp(`http://127.0.0.1:${dbgPort}/json/version`, 20000);
    const targets = await (await fetch(`http://127.0.0.1:${dbgPort}/json`)).json();
    const page = targets.find((t) => t.type === 'page');
    if (!page) throw new Error('no page target');
    cdp = new CDP(page.webSocketDebuggerUrl);
    await cdp.open();
  } catch (e) { fail('  chrome:  ' + e.message); }

  // Event capture (page crashes + console errors)
  cdp.on('Runtime.exceptionThrown', (p) => errors.push('[exception] ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || 'unknown')));
  cdp.on('Log.entryAdded', (p) => { if (p.entry?.level === 'error') errors.push('[console] ' + p.entry.text); });
  cdp.on('Runtime.consoleAPICalled', (p) => { if (p.type === 'error') errors.push('[console] ' + (p.args || []).map((a) => a.value ?? a.description ?? '').join(' ')); });

  const evalJs = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('eval failed: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result?.value;
  };

  const waitFor = async (sel, timeoutMs = 20000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (await evalJs(`!!document.querySelector(${JSON.stringify(sel)})`)) return true;
      await sleep(250);
    }
    return false;
  };

  const pageErrCount = () => errors.length - pageMarker;

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Page.navigate', { url: devUrl });
  await waitFor('.login-card-title, .ad-sidebar', 20000);

  // Log in by planting the offline token, then reload.
  await evalJs(`localStorage.setItem('yto_token', ${JSON.stringify(token)}); 'ok'`);
  await cdp.send('Page.reload', { ignoreCache: true });
  const shellUp = await waitFor('.ad-sidebar-nav-list', 20000);
  if (!shellUp) { fail('  shell did not mount after login'); }
  await sleep(800);

  // Enumerate nav leaves (grouped children + standalone items).
  const NAV = await evalJs(`(() => {
    const out = [];
    const txt = (el) => (el.querySelector('.ad-sidebar-nav-text') || el).textContent.trim();
    document.querySelectorAll('.ad-sidebar-nav-list > li').forEach((li) => {
      const parent = li.querySelector(':scope > .ad-sidebar-dropdown > .ad-sidebar-nav-parent');
      if (parent) {
        const group = txt(parent);
        li.querySelectorAll('.ad-sidebar-submenu .ad-sidebar-submenu-link').forEach((b) => {
          out.push({ group, label: txt(b) });
        });
      } else {
        const b = li.querySelector(':scope > .ad-sidebar-nav-item');
        if (b) out.push({ group: null, label: txt(b) });
      }
    });
    return out;
  })()`);
  if (!Array.isArray(NAV) || NAV.length === 0) { fail('  no nav items found — sweep aborted'); }
  log('  pages:   ' + NAV.length + ' (' + NAV.map((n) => n.label).join(', ') + ')');

  const rows = [];
  for (const width of WIDTHS) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width, height: VIEWPORT_H, deviceScaleFactor: 1, mobile: false,
    });
    await sleep(RESIZE_SETTLE_MS);
    for (const item of NAV) {
      pageMarker = errors.length;
      // Ensure the parent group is expanded (async React state -> two steps).
      if (item.group) {
        const gres = await evalJs(`(() => {
          const g = ${JSON.stringify(item.group)};
          const p = [...document.querySelectorAll('.ad-sidebar-nav-parent')].find((b) => (b.querySelector('.ad-sidebar-nav-text') || b).textContent.trim() === g);
          if (!p) return 'nogroup';
          const sub = p.closest('.ad-sidebar-dropdown') ? p.closest('.ad-sidebar-dropdown').querySelector(':scope > .ad-sidebar-submenu') : null;
          if (sub && !sub.classList.contains('ad-sidebar-submenu--open')) { p.click(); return 'opened'; }
          return 'open';
        })()`);
        if (gres === 'nogroup') { rows.push({ width, label: item.label, note: 'GROUP NOT FOUND' }); continue; }
        await sleep(280);
      }
      const cres = await evalJs(`(() => {
        const want = ${JSON.stringify(item.label)};
        const pick = (ls) => [...ls].find((b) => (b.querySelector('.ad-sidebar-nav-text') || b).textContent.trim() === want);
        const scope = ${item.group ? `[...document.querySelectorAll('.ad-sidebar-submenu')]` : '[]'};
        let b = null;
        if (scope.length) { for (const s of scope) { b = pick(s.querySelectorAll('.ad-sidebar-submenu-link')); if (b) break; } }
        if (!b) b = pick(document.querySelectorAll('.ad-sidebar-nav-list > li > .ad-sidebar-nav-item:not(.ad-sidebar-nav-parent)'));
        if (!b) return 'noleaf';
        b.click();
        return 'ok';
      })()`);
      await sleep(PAGE_SETTLE_MS);

      const m = await evalJs(`(() => ({
        se: document.scrollingElement ? document.scrollingElement.scrollWidth : 0,
        ce: document.documentElement.clientWidth,
        crash: document.body.innerText.indexOf('This page hit an unexpected error') !== -1,
        head: (document.querySelector('.ad-main h1, h1') || { textContent: '' }).textContent.trim().slice(0, 46),
      }))()`);
      rows.push({
        width, label: item.label,
        overflow: Math.max(0, (m.se || 0) - (m.ce || 0)),
        crash: !!m.crash,
        errs: cres === 'noleaf' ? ['LEAF NOT FOUND'] : errors.slice(pageMarker),
        head: m.head,
      });
    }
  }

  // ── Report ─────────────────────────────────────────────────────────────
  log('\nResults (page x width):');
  const pad = (s, n) => String(s).padEnd(n);
  log('  ' + pad('Page', 38) + ' ' + WIDTHS.map((w) => pad(w + 'px', 22)).join(''));
  const failures = [];
  for (const label of [...new Set(rows.map((r) => r.label))]) {
    const cells = rows.filter((r) => r.label === label);
    const cellText = WIDTHS.map((w) => {
      const r = cells.find((c) => c.width === w);
      if (!r) return pad('—', 22);
      if (r.note) { failures.push(`${label} @ ${w}px: ${r.note}`); return pad(r.note, 22); }
      const flags = [];
      if (r.overflow > 0) flags.push('OVERFLOW+' + r.overflow);
      if (r.crash) flags.push('CRASH');
      if (r.errs && r.errs.length) flags.push('ERR');
      if (!flags.length) return pad('ok', 22);
      failures.push(`${label} @ ${w}px: ${flags.join(', ')}${r.errs && r.errs.length ? ' — ' + r.errs.slice(0, 2).join(' | ') : ''}`);
      return pad(flags.join(' '), 22);
    }).join('');
    log('  ' + pad(label, 38) + ' ' + cellText);
  }
  if (!failures.length) log('\nAll ' + rows.length + ' page-width checks clean: zero overflow, zero crashes, zero console errors.');
  else {
    log('\n' + failures.length + ' failure(s):');
    failures.forEach((f) => log('  - ' + f));
  }

  await sleep(150); // let error events flush before counting final state
  const clean = failures.length === 0;
  process.exitCode = clean ? 0 : 1;

  // ── teardown ───────────────────────────────────────────────────────────
  try { cdp?.close(); } catch {}
  try { chrome.kill(); } catch {}
  try { vite.kill(); } catch {}
  try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch {}
  await seed.close();
  log(clean ? 'Sweep PASSED.' : 'Sweep FAILED — see failures above.');
}

main().catch((e) => {
  console.error('Sweep crashed:', e);
  process.exitCode = 1;
});
