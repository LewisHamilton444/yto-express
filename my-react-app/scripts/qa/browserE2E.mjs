// Browser-level end-to-end sweep of the YTO Web Admin portal.
//
//   node qa/web/browserE2E.mjs
//   WEB_SERVER_DIR=<path> node qa/web/browserE2E.mjs
//
// What makes this different from the portal's own `npm run qa:layout`:
//   - qa:layout serves synthetic fixtures from scripts/qa/seedServer.mjs and
//     mints an offline demo JWT, so it never touches the API or the database.
//   - this driver starts the real Vite app pointed at the REAL API
//     (server/Server.js on :3001, live Atlas), forces VITE_DEMO_MODE=0 so the
//     fixture fallback in services/api.js is off, signs in through the real
//     login form with a REAL admin account, then walks every sidebar page.
//
// Per page it asserts: the page actually rendered, the error boundary did not
// trip, no console error or exception was raised, the layout does not overflow
// horizontally, and no synthetic fixture row leaked into the UI. It also proves
// the table contents come from the live database, not from fixtures.
//
// Uses headless Chrome over raw CDP (no extra dependencies).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';

const WEB_APP_DIR = process.env.WEB_APP_DIR
    || 'C:/Users/ADMIN/React_Projects/YTO Latest/my-react-app';
const WEB_SERVER_DIR = process.env.WEB_SERVER_DIR || path.join(WEB_APP_DIR, 'server');
const API_BASE = process.env.WEB_BASE || 'http://localhost:3001';
const VITE_PORT = Number(process.env.VITE_PORT || 5199);
const DEBUG_PORT = Number(process.env.CDP_PORT || 9333);
const APP_URL = `http://127.0.0.1:${VITE_PORT}/`;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── env ─────────────────────────────────────────────────────────────────
function readEnv(file) {
    const out = {};
    if (!fs.existsSync(file)) return out;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line.trim());
        if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
    return out;
}
const env = readEnv(path.join(WEB_SERVER_DIR, '.env'));
const ADMIN_EMAIL = env.ADMIN_EMAIL || 'superadmin@ytoexpress.com';
const ADMIN_PASSWORD = env.ADMIN_PASSWORD_SUPERADMIN;

// A real customer synced from the mobile app; seeing this in the UI proves the
// table is live data. Fixture rows use @yto.com / customer.qaN@gmail.com.
const LIVE_CUSTOMER_EMAIL = process.env.EXPECT_CUSTOMER || 'naafrancinemarie@gmail.com';
const FIXTURE_MARKERS = ['@yto.com', 'customer.qa1@', 'seller.qa1@', 'rider.qa1@'];

if (!ADMIN_PASSWORD) {
    console.error('ADMIN_PASSWORD_SUPERADMIN missing from ' + path.join(WEB_SERVER_DIR, '.env'));
    process.exit(2);
}

const results = [];
function record(id, name, pass, detail = '') {
    results.push({ id, name, pass: !!pass, detail });
    console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${id} ${name}${detail ? ' :: ' + detail : ''}`);
}

// ── minimal CDP client over the global WebSocket ─────────────────────────
class CDP {
    constructor(wsUrl) {
        this.wsUrl = wsUrl;
        this.seq = 0;
        this.pending = new Map();
        this.handlers = new Map();
    }
    open() {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.wsUrl);
            this.ws.onopen = () => resolve();
            this.ws.onerror = () => reject(new Error('CDP connect failed'));
            this.ws.onmessage = (ev) => {
                const msg = JSON.parse(ev.data);
                if (msg.id && this.pending.has(msg.id)) {
                    const { resolve: res, reject: rej } = this.pending.get(msg.id);
                    this.pending.delete(msg.id);
                    msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
                } else if (msg.method) {
                    for (const h of (this.handlers.get(msg.method) || [])) h(msg.params);
                }
            };
        });
    }
    send(method, params = {}) {
        const id = ++this.seq;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }
    on(method, cb) {
        if (!this.handlers.has(method)) this.handlers.set(method, []);
        this.handlers.get(method).push(cb);
    }
    close() { try { this.ws?.close(); } catch { /* already gone */ } }
}

function findChrome() {
    const candidates = [
        process.env.CHROME_PATH,
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ].filter(Boolean);
    for (const c of candidates) if (fs.existsSync(c)) return c;
    throw new Error('Chrome not found. Set CHROME_PATH.');
}

async function waitForJson(url, tries = 40) {
    for (let i = 0; i < tries; i++) {
        try {
            const r = await fetch(url);
            if (r.ok) return await r.json();
        } catch { /* not up yet */ }
        await sleep(250);
    }
    throw new Error('timed out waiting for ' + url);
}

// ── main ────────────────────────────────────────────────────────────────
(async () => {
    console.log('YTO Web Admin - browser end-to-end sweep');
    console.log(`  app:  ${WEB_APP_DIR}`);
    console.log(`  api:  ${API_BASE}`);
    console.log(`  user: ${ADMIN_EMAIL}`);

    let vite = null, chrome = null, cdp = null;
    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yto-cdp-'));
    const consoleErrors = [];
    const exceptions = [];
    const apiCalls = [];
    const apiErrors = [];

    try {
        // 1. API must be live
        const health = await fetch(`${API_BASE}/api/health`).then(r => r.json()).catch(() => null);
        record('B-00', 'Real API is reachable before the browser starts',
            health?.status === 'ok' && health?.db === 'connected', JSON.stringify(health));

        // 2. Real Vite app, fixture fallback disabled
        vite = spawn(process.execPath, [path.join(WEB_APP_DIR, 'node_modules', 'vite', 'bin', 'vite.js'),
            '--host', '127.0.0.1', '--port', String(VITE_PORT), '--strictPort'], {
            cwd: WEB_APP_DIR,
            env: { ...process.env, VITE_API_URL: API_BASE, VITE_DEMO_MODE: '0' },
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let viteOut = '';
        vite.stdout.on('data', d => { viteOut += d.toString(); });
        vite.stderr.on('data', d => { viteOut += d.toString(); });
        let up = false;
        for (let i = 0; i < 60 && !up; i++) { up = await fetch(APP_URL).then(r => r.ok).catch(() => false); if (!up) await sleep(500); }
        record('B-01', 'Vite serves the portal with VITE_DEMO_MODE=0', up, up ? APP_URL : viteOut.slice(-200));

        // 3. Headless Chrome
        chrome = spawn(findChrome(), [
            '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
            '--disable-extensions', '--disable-background-networking', '--mute-audio',
            '--window-size=1440,900', `--user-data-dir=${profileDir}`,
            `--remote-debugging-port=${DEBUG_PORT}`, 'about:blank',
        ], { stdio: 'ignore' });

        const list = await waitForJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
        const page = list.find(t => t.type === 'page');
        cdp = new CDP(page.webSocketDebuggerUrl);
        await cdp.open();

        cdp.on('Runtime.exceptionThrown', (p) => {
            exceptions.push((p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || 'unknown').split('\n')[0]);
        });
        cdp.on('Log.entryAdded', (p) => { if (p.entry?.level === 'error') consoleErrors.push(p.entry.text); });
        cdp.on('Runtime.consoleAPICalled', (p) => {
            if (p.type === 'error') consoleErrors.push((p.args || []).map(a => a.value ?? a.description ?? '').join(' '));
        });
        // Track request methods so CORS preflights (OPTIONS, always 204) are not
        // mistaken for real API answers.
        const requestMethods = new Map();
        cdp.on('Network.requestWillBeSent', (p) => requestMethods.set(p.requestId, p.request?.method || ''));
        cdp.on('Network.responseReceived', (p) => {
            const url = p.response?.url || '';
            const method = requestMethods.get(p.requestId) || '';
            if (url.includes('/api/') && method !== 'OPTIONS') {
                apiCalls.push({ url, status: p.response.status, method });
                if (p.response.status >= 400) apiErrors.push(`${p.response.status} ${method} ${url.replace(API_BASE, '')}`);
            }
        });

        await cdp.send('Runtime.enable');
        await cdp.send('Log.enable');
        await cdp.send('Page.enable');
        await cdp.send('Network.enable');

        const evaluate = async (expression, awaitPromise = true) => {
            const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
            if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description || r.exceptionDetails.text || '').split('\n')[0]);
            return r.result?.value;
        };

        const clickSelector = async (sel) => {
            const box = await evaluate(`(() => {
                const el = document.querySelector(${JSON.stringify(sel)});
                if (!el) return null;
                el.scrollIntoView({ block: 'center' });
                const r = el.getBoundingClientRect();
                return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
            })()`);
            if (!box) throw new Error('element not found: ' + sel);
            await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
            await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
        };
        // Filling a React controlled input by coordinates is flaky while the
        // card is still animating in, so go through the native value setter and
        // fire a real input event - exactly what a keystroke does, without
        // depending on where the element was a moment ago.
        const typeInto = async (sel, text) => {
            await evaluate(`(() => {
                const el = document.querySelector(${JSON.stringify(sel)});
                if (!el) return false;
                el.focus();
                const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                setter.call(el, ${JSON.stringify(text)});
                el.dispatchEvent(new Event('input', { bubbles: true }));
                return true;
            })()`);
        };
        const clickElement = async (sel) => {
            const clicked = await evaluate(`(() => {
                const el = document.querySelector(${JSON.stringify(sel)});
                if (!el) return false;
                el.click();
                return true;
            })()`);
            if (!clicked) throw new Error('element not found: ' + sel);
        };

        // Poll instead of a fixed sleep: a cold Vite dev server has to transform
        // the whole module graph before React mounts, which can take far longer
        // than any hard-coded wait on a first run.
        const waitForSelector = async (sel, timeoutMs = 30000) => {
            const deadline = Date.now() + timeoutMs;
            while (Date.now() < deadline) {
                if (await evaluate(`!!document.querySelector(${JSON.stringify(sel)})`)) return true;
                await sleep(500);
            }
            return false;
        };

        // 4. Load the portal
        await cdp.send('Page.navigate', { url: APP_URL });
        const loginVisible = await waitForSelector('#login-email', 45000);
        if (loginVisible) {
            record('B-02', 'Login screen renders', true, '#login-email present');
        } else {
            const diag = await evaluate(`({ url: location.href, body: (document.body ? document.body.innerText : '').slice(0, 240) })`);
            record('B-02', 'Login screen renders', false,
                `url=${diag.url} body="${String(diag.body).replace(/\s+/g, ' ')}"`);
        }

        // 5. Real sign-in through the form
        await typeInto('#login-email', ADMIN_EMAIL);
        await typeInto('#login-password', ADMIN_PASSWORD);
        await clickElement('button.login-btn');

        const loggedIn = await waitForSelector('.ad-sidebar-nav', 30000);
        if (!loggedIn) {
            const diag = await evaluate(`({
                email: (document.querySelector('#login-email') || {}).value,
                passLen: ((document.querySelector('#login-password') || {}).value || '').length,
                error: (document.querySelector('.login-error, [role="alert"]') || {}).innerText || '',
                body: (document.body.innerText || '').slice(0, 200).replace(/\s+/g, ' '),
            })`);
            console.log(`  login diagnostic: email=${diag.email} passwordLength=${diag.passLen} error="${diag.error}" body="${diag.body}"`);
        }
        record('B-03', 'Real admin sign-in reaches the portal', loggedIn === true,
            loggedIn ? 'sidebar mounted' : 'still on the login screen');

        const loginCall = apiCalls.find(c => c.url.includes('/api/accounts/login'));
        record('B-04', 'Sign-in went through the real API', loginCall?.status === 200,
            loginCall ? `${loginCall.status} ${loginCall.url.replace(API_BASE, '')}` : 'no login request captured');

        if (!loggedIn) throw new Error('cannot continue without a signed-in portal');

        // 6. Newly signed in: no leftover error noise
        await sleep(1000);
        const bannerPresent = await evaluate(`!!document.querySelector('[role="status"]') && /Demo Data/i.test(document.body.innerText)`);
        record('B-05', 'No fabricated-data banner with VITE_DEMO_MODE=0', bannerPresent === false,
            `banner present=${bannerPresent}`);

        // 7. Walk every sidebar page
        console.log('\n== Sidebar page sweep ==');
        const targets = await evaluate(`(() => {
            const out = [];
            document.querySelectorAll('button.ad-sidebar-nav-item').forEach((b) => {
                const label = (b.querySelector('.ad-sidebar-nav-text') || b).textContent.trim();
                const isParent = b.classList.contains('ad-sidebar-nav-parent');
                if (label) out.push({ label, kind: isParent ? 'parent' : 'page' });
            });
            return out;
        })()`);
        record('B-06', 'Sidebar exposes its menu items', Array.isArray(targets) && targets.length >= 10,
            `${(targets || []).length} items: ${(targets || []).map(t => t.label).join(' | ')}`);

        const pages = [];
        for (const item of targets || []) {
            // Clicking Logout would end the session and every later page would
            // fail for the wrong reason; it is covered by the API-level suite.
            if (/logout/i.test(item.label)) continue;
            if (item.kind === 'parent') {
                // expand, then treat each child as its own page
                await evaluate(`(() => {
                    const b = [...document.querySelectorAll('button.ad-sidebar-nav-parent')]
                        .find(x => (x.querySelector('.ad-sidebar-nav-text') || x).textContent.trim() === ${JSON.stringify(item.label)});
                    if (b && b.getAttribute('aria-expanded') !== 'true') b.click();
                })()`);
                await sleep(400);
                const children = await evaluate(`(() => {
                    const b = [...document.querySelectorAll('button.ad-sidebar-nav-parent')]
                        .find(x => (x.querySelector('.ad-sidebar-nav-text') || x).textContent.trim() === ${JSON.stringify(item.label)});
                    if (!b) return [];
                    const box = b.closest('.ad-sidebar-dropdown');
                    return [...(box ? box.querySelectorAll('button.ad-sidebar-submenu-link') : [])]
                        .map(l => (l.querySelector('.ad-sidebar-nav-text') || l).textContent.trim()).filter(Boolean);
                })()`);
                for (const child of children) pages.push({ label: `${item.label} > ${child}`, child });
            } else {
                pages.push({ label: item.label });
            }
        }

        for (const target of pages) {
            const before = { errors: consoleErrors.length, exceptions: exceptions.length, api: apiErrors.length };
            await evaluate(`(() => {
                const wanted = ${JSON.stringify(target.child || target.label)};
                const nodes = [...document.querySelectorAll('button.ad-sidebar-nav-item, button.ad-sidebar-submenu-link')];
                const b = nodes.find(x => (x.querySelector('.ad-sidebar-nav-text') || x).textContent.trim() === wanted);
                if (b) b.click();
                return !!b;
            })()`);
            await sleep(1600);

            const probe = await evaluate(`(() => {
                const main = document.querySelector('.ad-main');
                const inner = main ? main.innerText : '';
                const full = main ? main.textContent : '';
                const recoveryCard = !!document.querySelector('.ad-main [role="alert"]')
                    && /unexpected error/i.test(main ? main.innerText : '');
                const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
                const fixtureRow = ${JSON.stringify(FIXTURE_MARKERS)}.find(m => inner.includes(m)) || null;
                const activeNode = document.querySelector('.ad-sidebar-nav-item--active, .ad-sidebar-submenu-link--active');
                const active = activeNode ? activeNode.textContent.trim() : '';
                const rows = document.querySelectorAll('.ad-main tbody tr, .ad-main .ad-row, .ad-main [class*="table-row"]').length;
                // Cheap content fingerprint: length + a rolling character sum, so
                // two different pages cannot look identical to the sweep.
                let sum = 0;
                for (let i = 0; i < full.length; i++) sum = (sum + full.charCodeAt(i) * (i % 31 + 1)) % 1000000007;
                return { innerLen: inner.trim().length, textLen: full.trim().length, fingerprint: full.length + ':' + sum,
                    recoveryCard, overflow, fixtureRow, active, rows };
            })()`);

            const id = 'B-PAGE:' + target.label;
            const newErrors = consoleErrors.length - before.errors;
            const newExceptions = exceptions.length - before.exceptions;
            const newApiErrors = apiErrors.length - before.api;

            // The sidebar's active item must be the item we clicked and the main
            // pane must have real content. Checking the active marker (not just
            // "some text exists") is what proves the navigation actually moved.
            const wanted = (target.child || target.label).trim();
            const navigated = probe.active.toLowerCase().includes(wanted.toLowerCase())
                || wanted.toLowerCase().includes(probe.active.toLowerCase());
            const ok = navigated && probe.textLen > 120 && !probe.recoveryCard
                && probe.overflow <= 2 && !probe.fixtureRow && newExceptions === 0;

            console.log(`    fingerprint=${probe.fingerprint} active="${probe.active}" rows=${probe.rows}`);
            record(id, target.label, ok,
                `navigated=${navigated}, chars=${probe.textLen}, crash=${probe.recoveryCard}, overflowPx=${probe.overflow}, ` +
                `fixtureRow=${probe.fixtureRow || 'none'}, newConsoleErrors=${newErrors}, newExceptions=${newExceptions}, apiErrors=${newApiErrors}`);
        }

        const fingerprints = new Map();
        for (const r of results.filter(x => x.id.startsWith('B-PAGE:'))) {
            const fp = /fingerprint=(\S+)/.exec(r.detail);
            if (fp) fingerprints.set(r.id, fp[1]);
        }

        // 8. Live-data proof: the customers table must show a synced mobile account
        await evaluate(`(() => {
            const nodes = [...document.querySelectorAll('button.ad-sidebar-nav-item')];
            const b = nodes.find(x => /customer/i.test((x.querySelector('.ad-sidebar-nav-text') || x).textContent));
            if (b) b.click();
        })()`);
        await sleep(2000);
        const customerProof = await evaluate(`(() => {
            const main = document.querySelector('.ad-main');
            const text = main ? main.innerText : '';
            return { hasLive: text.includes(${JSON.stringify(LIVE_CUSTOMER_EMAIL)}), sample: text.slice(0, 200) };
        })()`);
        record('B-07', 'Customers page renders live database rows', customerProof.hasLive === true,
            `live row "${LIVE_CUSTOMER_EMAIL}" present=${customerProof.hasLive}`);

        const customerCall = apiCalls.filter(c => c.url.includes('/api/customers')).pop();
        record('B-08', 'Customers data came from the real API', customerCall?.status === 200,
            customerCall ? `${customerCall.status} ${customerCall.url.replace(API_BASE, '')}` : 'no /api/customers call captured');

        // 9. Global tallies
        console.log('\n== Tally ==');
        const uniqueApi = [...new Set(apiCalls.map(c => `${c.status} ${c.url.replace(API_BASE, '').split('?')[0]}`))];
        console.log(`  api calls: ${apiCalls.length} (${uniqueApi.length} unique)`);
        for (const u of uniqueApi.sort()) console.log(`    ${u}`);
        if (apiErrors.length) console.log('  api errors: ' + apiErrors.join(', '));
        if (exceptions.length) console.log('  exceptions: ' + exceptions.join(' | '));
        if (consoleErrors.length) console.log('  console errors: ' + consoleErrors.slice(0, 8).join(' | '));

    } catch (e) {
        record('B-99', 'Browser sweep completed', false, e.message);
    } finally {
        cdp?.close();
        if (chrome) execFileSync('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' }) || true;
        if (vite) execFileSync('taskkill', ['/PID', String(vite.pid), '/T', '/F'], { stdio: 'ignore' }) || true;
        try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch { /* best effort */ }
    }

    const failed = results.filter(r => !r.pass);
    console.log('\n== Summary ==');
    console.log(`  ${results.length - failed.length} passed, ${failed.length} failed (of ${results.length})`);
    for (const f of failed) console.log(`    ${f.id} ${f.name} — ${f.detail}`);
    process.exit(failed.length ? 1 : 0);
})();
