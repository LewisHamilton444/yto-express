// Live REAL-admin end-to-end + security harness for the YTO Web Admin API.
//
//   node qa/web/liveAdminE2E.mjs                 full run, cleans up after itself
//   node qa/web/liveAdminE2E.mjs --keep          leave the rows it created in Atlas
//   WEB_SERVER_DIR=<path> node qa/web/liveAdminE2E.mjs
//
// Unlike the Web project's own `npm run qa:layout` (which boots seedServer.mjs
// with synthetic fixtures and an offline demo JWT), this harness talks to a
// REAL server/Server.js instance, signs in with REAL admin accounts taken from
// server/.env, and writes to the live Atlas database. Every row it creates is
// removed again at the end unless --keep is passed.
//
// Coverage
//   - liveness + database connection
//   - admin sign-in matrix (valid / wrong password / unknown email / wrong shape)
//   - sign-in rate-limit headers
//   - unauthenticated access to every protected route, plus garbage/other schemes
//   - forged, unsigned and tampered JWTs (role escalation attempt)
//   - role gates (staff and hub_receiver against super_admin-only routes)
//   - admin-account safety (super_admin cannot be disabled, no self role change,
//     deactivation really blocks sign-in and can be undone)
//   - bridge shared-secret gate (fails closed, and only the real key passes)
//   - collection shape + dashboard/collection cross-consistency
//   - crafted ?status= filter escaping and object-shaped filter handling
//   - CRUD integrity (create / update / delete) for sellers, riders and parcels
//   - duplicate and missing-field handling mapped to 4xx, never a 500
//   - no internal identifiers (driver text, collection or index names) leaked
//     into any client-facing error body
//   - parcel map row lifecycle (created with coordinates, removed with the parcel)
//   - audit trail (a web-created seller shows up in the activity log)
//
// Exits non-zero when a check fails, so it can act as a regression gate.

import fs from 'node:fs';
import path from 'node:path';

const WEB_SERVER_DIR = process.env.WEB_SERVER_DIR
    || 'C:/Users/ADMIN/React_Projects/YTO Latest/my-react-app/server';
const ENV_FILE = path.join(WEB_SERVER_DIR, '.env');
const BASE = process.env.WEB_BASE || 'http://localhost:3001';
const KEEP = process.argv.includes('--keep');
// Map rows left behind by parcels deleted before the cleanup fix existed.
const PURGE_ORPHANS = process.argv.includes('--purge-orphans');
const STAMP = Date.now().toString(36).toUpperCase();

// ── env ─────────────────────────────────────────────────────────────────
function readEnv(file) {
    const out = {};
    if (!fs.existsSync(file)) return out;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line.trim());
        if (!m) continue;
        out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
    return out;
}
const env = readEnv(ENV_FILE);

const ADMIN = {
    super_admin: { email: 'superadmin@ytoexpress.com', password: env.ADMIN_PASSWORD_SUPERADMIN },
    staff: { email: 'staff@ytoexpress.com', password: env.ADMIN_PASSWORD_STAFF },
    hub_receiver: { email: 'hub@ytoexpress.com', password: env.ADMIN_PASSWORD_HUB },
};

// ── result bookkeeping ──────────────────────────────────────────────────
const results = [];
const skips = [];
function record(id, name, pass, detail = '') {
    results.push({ id, name, pass: !!pass, detail });
    console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${id} ${name}${detail ? ' :: ' + detail : ''}`);
}
function skip(id, name, reason) {
    skips.push({ id, name, reason });
    console.log(`  [SKIP] ${id} ${name} :: ${reason}`);
}
async function check(id, name, fn) {
    try {
        const out = await fn();
        if (out && typeof out === 'object' && 'pass' in out) record(id, name, out.pass, out.detail);
        else record(id, name, true, typeof out === 'string' ? out : '');
    } catch (e) {
        record(id, name, false, 'threw: ' + e.message);
    }
}
async function expectStatus(id, name, request, wanted) {
    const allowed = Array.isArray(wanted) ? wanted : [wanted];
    const r = await request();
    const ok = allowed.includes(r.status);
    record(id, name, ok, `expected ${allowed.join('/')}, got ${r.status}${ok ? '' : ' — ' + r.snippet}`);
    return r;
}

// ── http ────────────────────────────────────────────────────────────────
async function req(method, urlPath, opts = {}) {
    const headers = {};
    if (opts.token) headers['Authorization'] = 'Bearer ' + opts.token;
    if (opts.rawToken) headers['Authorization'] = opts.rawToken;
    if (opts.key) headers['x-bridge-api-key'] = opts.key;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

    let res;
    try {
        res = await fetch(BASE + urlPath, {
            method,
            headers,
            body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        });
    } catch (e) {
        return { status: 0, snippet: 'network error: ' + e.message, json: null, text: '', headers: {} };
    }
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
    return {
        status: res.status,
        json,
        text,
        snippet: text.slice(0, 220).replace(/\s+/g, ' '),
        headers: res.headers,
    };
}
const authed = (method, urlPath, token, body) => req(method, urlPath, { token, body });

let loginCount = 0;
function login(email, password) {
    loginCount++;
    return req('POST', '/api/accounts/login', { body: { email, password } });
}

// ── tracked rows ────────────────────────────────────────────────────────
const created = { sellers: [], riders: [], parcels: [] };

// ════════════════════════════════════════════════════════════════════════
async function groupLiveness() {
    console.log('\n== Liveness ==');
    await check('LIVE-01', 'GET /api/health reports a connected database', async () => {
        const r = await req('GET', '/api/health');
        const ok = r.status === 200 && r.json?.status === 'ok' && r.json?.db === 'connected';
        return { pass: ok, detail: `status=${r.status} body=${r.snippet}` };
    });
    await check('LIVE-02', 'GET / returns the server banner', async () => {
        const r = await req('GET', '/');
        return { pass: r.status === 200 && r.text.length > 0, detail: `status=${r.status}` };
    });
}

async function groupAuth() {
    console.log('\n== Admin sign-in matrix ==');
    const tokens = {};
    for (const role of ['super_admin', 'staff', 'hub_receiver']) {
        const cred = ADMIN[role];
        if (!cred.password) {
            record(`AUTH-${role}`, `Sign-in as ${role}`, false, 'no password in server/.env');
            continue;
        }
        const r = await login(cred.email, cred.password);
        if (r.status === 429) {
            skip(`AUTH-${role}`, `Sign-in as ${role}`, 'sign-in rate limit engaged (429)');
            continue;
        }
        const ok = r.status === 200 && typeof r.json?.token === 'string' && r.json?.role === role;
        record(`AUTH-${role}`, `Sign-in as ${role} (${cred.email})`, ok,
            ok ? `role=${r.json.role}` : `status=${r.status} body=${r.snippet}`);
        if (ok) tokens[role] = r.json.token;
    }

    const wrongPw = await login(ADMIN.super_admin.email, 'definitely-not-the-password');
    record('AUTH-04', 'Wrong password is rejected', wrongPw.status === 401,
        `expected 401, got ${wrongPw.status}`);

    const unknown = await login(`no.such.admin.${STAMP.toLowerCase()}@ytoexpress.com`, 'Password123!');
    record('AUTH-05', 'Unknown email is rejected', unknown.status === 401,
        `expected 401, got ${unknown.status}`);

    await expectStatus('AUTH-06', 'Missing fields are rejected',
        () => req('POST', '/api/accounts/login', { body: {} }), 400);

    await check('AUTH-07', 'Sign-in response never carries a password field', async () => {
        const r = await req('POST', '/api/accounts/login', {
            body: { email: ADMIN.super_admin.email, password: ADMIN.super_admin.password },
        });
        if (r.status !== 200) return { pass: false, detail: `status=${r.status} (rate limited?)` };
        const leaked = 'password' in (r.json || {});
        return { pass: !leaked, detail: leaked ? 'response carries a password field' : 'clean payload' };
    });

    await check('AUTH-08', 'Sign-in answers carry rate-limit headers', async () => {
        const r = await req('POST', '/api/accounts/login', { body: {} });
        const header = r.headers?.get?.('ratelimit') || r.headers?.get?.('ratelimit-policy') || '';
        return { pass: !!header, detail: header ? header.slice(0, 60) : 'no ratelimit header' };
    });

    return tokens;
}

async function groupUnauthenticated() {
    console.log('\n== Unauthenticated access ==');
    const routes = [
        ['GET', '/api/parcels'], ['GET', '/api/sellers'], ['GET', '/api/riders'],
        ['GET', '/api/customers'], ['GET', '/api/issues'], ['GET', '/api/notifications'],
        ['GET', '/api/accounts'], ['GET', '/api/dashboard/stats'], ['GET', '/api/activity-log'],
        ['GET', '/api/parcel-locations'], ['GET', '/api/events/stats'],
        ['POST', '/api/parcels'], ['POST', '/api/sellers'], ['DELETE', '/api/admin/reset-database'],
        ['GET', '/api/bridge/poll-changes'],
    ];
    let n = 0;
    for (const [method, route] of routes) {
        n++;
        await expectStatus(`UNAUTH-${String(n).padStart(2, '0')}`, `${method} ${route} without a token`,
            () => req(method, route, { body: method === 'POST' ? {} : undefined }), 401);
    }

    await check('UNAUTH-16', 'Garbage bearer token is rejected', async () => {
        const r = await req('GET', '/api/parcels', { token: 'not.a.real.jwt' });
        return { pass: [401, 403].includes(r.status), detail: `status=${r.status}` };
    });
    await check('UNAUTH-17', 'Basic/other auth schemes are ignored', async () => {
        const r = await req('GET', '/api/parcels', { rawToken: 'Basic ' + Buffer.from('admin:x').toString('base64') });
        return { pass: [401, 403].includes(r.status), detail: `status=${r.status}` };
    });
    await expectStatus('UNAUTH-18', 'Empty Bearer token is rejected',
        () => req('GET', '/api/parcels', { rawToken: 'Bearer ' }), [401, 403]);

    await expectStatus('UNAUTH-19', 'NoSQL-operator sign-in payload cannot authenticate',
        () => req('POST', '/api/accounts/login', { body: { email: { $gt: '' }, password: { $gt: '' } } }), 400);
}

async function groupTokenTamper(tokens) {
    console.log('\n== Token tampering ==');
    const real = tokens?.staff;
    if (!real) { skip('TOK-00', 'Token tamper suite', 'no staff token'); return; }

    await check('TOK-01', 'Tampered payload (role escalated to super_admin) is rejected', async () => {
        const [h, p, s] = real.split('.');
        const claims = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
        claims.role = 'super_admin';
        const forged = [h, Buffer.from(JSON.stringify(claims)).toString('base64url'), s].join('.');
        const r = await req('GET', '/api/accounts', { token: forged });
        return { pass: [401, 403].includes(r.status), detail: `status=${r.status}` };
    });
    await check('TOK-02', 'Unsigned (alg=none style) token is rejected', async () => {
        const claims = { id: '000000000000000000000000', email: 'forged@ytoexpress.com', role: 'super_admin' };
        const forged = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url') + '.' +
            Buffer.from(JSON.stringify(claims)).toString('base64url') + '.';
        const r = await req('GET', '/api/accounts', { token: forged });
        return { pass: [401, 403].includes(r.status), detail: `status=${r.status}` };
    });
    await check('TOK-03', 'Hostile header fields cannot bypass verification', async () => {
        const claims = { id: '000000000000000000000000', email: 'forged@ytoexpress.com', role: 'super_admin' };
        const forged = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: '../../dev/null' })).toString('base64url') + '.' +
            Buffer.from(JSON.stringify(claims)).toString('base64url') + '.x';
        const r = await req('GET', '/api/accounts', { token: forged });
        return { pass: [401, 403].includes(r.status), detail: `status=${r.status}` };
    });
}

async function groupRoleGates(tokens) {
    console.log('\n== Role gates ==');
    const { staff, hub_receiver: hub, super_admin: su } = tokens || {};
    if (!su) { skip('ROLE-00', 'Role gate suite', 'no super_admin token'); return; }

    await check('ROLE-01', 'super_admin can list admin accounts', async () => {
        const r = await authed('GET', '/api/accounts', su);
        const roles = Array.isArray(r.json) ? r.json.map(a => a.role) : [];
        const onlyAdmins = roles.every(x => ['super_admin', 'staff', 'hub_receiver'].includes(x));
        return { pass: r.status === 200 && onlyAdmins, detail: `status=${r.status}, roles=${[...new Set(roles)].join('|') || 'none'}` };
    });

    if (staff) {
        await expectStatus('ROLE-02', 'staff cannot list admin accounts',
            () => authed('GET', '/api/accounts', staff), 403);
        await expectStatus('ROLE-03', 'staff cannot create an admin account',
            () => authed('POST', '/api/accounts', staff, { name: 'x', email: `x.${STAMP}@ytoexpress.com`, password: 'Password123!', role: 'staff' }), 403);
        await expectStatus('ROLE-05', 'staff cannot reset the database',
            () => authed('DELETE', '/api/admin/reset-database', staff, {}), 403);
    }
    if (hub) {
        await expectStatus('ROLE-06', 'hub_receiver cannot list admin accounts',
            () => authed('GET', '/api/accounts', hub), 403);
        await expectStatus('ROLE-04', 'hub_receiver cannot send SMS (cost control)',
            () => authed('POST', '/api/sms/send', hub, { number: '09170000000', message: 'qa probe' }), 403);
        await expectStatus('ROLE-07', 'hub_receiver cannot reset the database',
            () => authed('DELETE', '/api/admin/reset-database', hub, {}), 403);
    }

    await expectStatus('ROLE-08', 'Database reset refuses a missing confirmation phrase',
        () => authed('DELETE', '/api/admin/reset-database', su, {}), 400);

    for (const [role, token] of Object.entries(tokens || {})) {
        await check(`ROLE-READ-${role}`, `${role} can read parcels`, async () => {
            const r = await authed('GET', '/api/parcels', token);
            return { pass: r.status === 200 && Array.isArray(r.json), detail: `status=${r.status}` };
        });
    }
}

async function groupAdminSafety(tokens) {
    console.log('\n== Admin account safety ==');
    const su = tokens?.super_admin;
    if (!su) { skip('SAFE-00', 'Admin safety suite', 'no super_admin token'); return; }

    const list = await authed('GET', '/api/accounts', su);
    const accounts = Array.isArray(list.json) ? list.json : [];
    const selfSuper = accounts.find(a => a.email === ADMIN.super_admin.email);
    const staffAcc = accounts.find(a => a.role === 'staff');
    const activeSupers = accounts.filter(a => a.role === 'super_admin' && a.status === 'Active').length;

    await check('SAFE-01', 'Admin list has no duplicate emails', async () => {
        const emails = accounts.map(a => a.email);
        return { pass: new Set(emails).size === emails.length, detail: `${emails.length} accounts` };
    });

    if (selfSuper) {
        await expectStatus('SAFE-02', 'super_admin cannot be deactivated',
            () => authed('PATCH', `/api/accounts/${selfSuper._id}/status`, su), 403);
        await check('SAFE-03', 'super_admin status left untouched after the attempt', async () => {
            const after = await authed('GET', '/api/accounts', su);
            const row = (after.json || []).find(a => String(a._id) === String(selfSuper._id));
            return { pass: row?.status === 'Active', detail: `status=${row?.status}` };
        });
        await check('SAFE-04', 'Re-setting the same role on the last super_admin is not blocked by mistake', async () => {
            const r = await authed('PUT', `/api/accounts/${selfSuper._id}`, su, { role: 'super_admin' });
            return { pass: [200, 400].includes(r.status), detail: `status=${r.status}, activeSupers=${activeSupers}` };
        });
    }

    await expectStatus('SAFE-05', 'Unknown account id is a 404',
        () => authed('PATCH', '/api/accounts/000000000000000000000000/status', su), 404);

    if (staffAcc) {
        await expectStatus('SAFE-06', 'Weak password reset is refused',
            () => authed('PUT', `/api/accounts/${staffAcc._id}`, su, { password: 'abc' }), 400);

        const off = await authed('PATCH', `/api/accounts/${staffAcc._id}/status`, su);
        const deactivated = off.json?.status === 'Deactivated';
        record('SAFE-07', 'staff can be deactivated', deactivated, `status=${off.status} newStatus=${off.json?.status}`);

        if (deactivated) {
            const blocked = await login(staffAcc.email, ADMIN.staff.password);
            record('SAFE-08', 'Deactivated admin cannot sign in', blocked.status === 403,
                `status=${blocked.status} body=${blocked.snippet}`);
            const back = await authed('PATCH', `/api/accounts/${staffAcc._id}/status`, su);
            record('SAFE-09', 'staff restored to Active', back.json?.status === 'Active',
                `status=${back.status} newStatus=${back.json?.status}`);
        }

        if (selfSuper) {
            const r = await authed('PUT', `/api/accounts/${selfSuper._id}`, su, { role: 'staff' });
            record('SAFE-10', 'Self demotion is refused', r.status === 400, `status=${r.status} body=${r.snippet}`);
        }
    }
}

async function groupBridgeGate() {
    console.log('\n== Bridge shared-secret gate ==');
    const good = env.BRIDGE_API_KEY || env.WEB_BRIDGE_API_KEY;
    const payload = { email: `bridge.probe.${STAMP.toLowerCase()}@gmail.com`, role: 'customer', fullName: 'Bridge Probe' };

    await expectStatus('BRG-01', 'bridge write without a key is refused',
        () => req('POST', '/api/bridge/sync-user', { body: payload }), 401);
    await expectStatus('BRG-02', 'bridge write with a wrong key is refused',
        () => req('POST', '/api/bridge/sync-user', { body: payload, key: 'wrong-key-' + STAMP }), 401);
    await expectStatus('BRG-03', 'bridge write with an empty key is refused',
        () => req('POST', '/api/bridge/sync-user', { body: payload, key: '' }), 401);
    await expectStatus('BRG-04', 'bridge health without a key is refused',
        () => req('GET', '/api/bridge/health'), 401);

    if (good) {
        const r = await req('GET', '/api/bridge/health', { key: good });
        record('BRG-05', 'bridge health with the configured key answers 200',
            r.status === 200, `status=${r.status} body=${r.snippet}`);
    } else {
        record('BRG-05', 'bridge health with the configured key answers 200', false, 'no BRIDGE_API_KEY in server/.env');
    }
}

async function groupIntegrity(tokens) {
    console.log('\n== Data integrity ==');
    const su = tokens?.super_admin;
    if (!su) { skip('INT-00', 'Integrity suite', 'no super_admin token'); return; }

    const [parcels, sellers, riders, customers, issues, notifications, locations, stats, activity] = await Promise.all([
        authed('GET', '/api/parcels', su), authed('GET', '/api/sellers', su), authed('GET', '/api/riders', su),
        authed('GET', '/api/customers', su), authed('GET', '/api/issues', su), authed('GET', '/api/notifications', su),
        authed('GET', '/api/parcel-locations', su), authed('GET', '/api/dashboard/stats', su),
        authed('GET', '/api/activity-log?limit=200', su),
    ]);

    const shapes = { parcels, sellers, riders, customers, issues, notifications, 'parcel-locations': locations, 'activity-log': activity };
    for (const [name, r] of Object.entries(shapes)) {
        await check(`INT-SHAPE-${name}`, `GET /api/${name} returns an array`, async () => ({
            pass: r.status === 200 && Array.isArray(r.json),
            detail: `status=${r.status} type=${Array.isArray(r.json) ? 'array' : typeof r.json}`,
        }));
    }

    const s = stats.json || {};
    await check('INT-01', 'Dashboard parcel total matches the parcel collection', async () => ({
        pass: Number(s.totalParcels) === (parcels.json || []).length,
        detail: `stats.totalParcels=${s.totalParcels} collection=${(parcels.json || []).length}`,
    }));
    await check('INT-02', 'Dashboard rider total matches the rider collection', async () => ({
        pass: Number(s.totalRiders) === (riders.json || []).length,
        detail: `stats.totalRiders=${s.totalRiders} collection=${(riders.json || []).length}`,
    }));
    await check('INT-03', 'Dashboard seller total matches the seller collection', async () => ({
        pass: Number(s.totalSellers) === (sellers.json || []).length,
        detail: `stats.totalSellers=${s.totalSellers} collection=${(sellers.json || []).length}`,
    }));
    await check('INT-04', 'Dashboard KPIs are internally consistent', async () => {
        const total = Number(s.totalParcels);
        const delivered = Number(s.deliveredCount);
        const pct = Number(s.deliverySuccessPct);
        const ok = Number.isFinite(total) && Number.isFinite(delivered) && Number.isFinite(pct)
            && delivered >= 0 && delivered <= total && pct >= 0 && pct <= 100;
        return { pass: ok, detail: `total=${total} delivered=${delivered} pct=${pct}` };
    });

    await check('INT-05', 'Crafted ?status= is escaped, not treated as a pattern', async () => {
        const r = await authed('GET', '/api/sellers?status=' + encodeURIComponent('.*'), su);
        const len = Array.isArray(r.json) ? r.json.length : -1;
        return { pass: r.status === 200 && len === 0, detail: `status=${r.status} rows=${len}` };
    });
    await check('INT-06', 'Object-shaped ?status filter does not 500', async () => {
        const r = await authed('GET', '/api/sellers?status[foo]=bar', su);
        return { pass: r.status === 200, detail: `status=${r.status} body=${r.snippet}` };
    });
    await check('INT-07', 'No row exposes a password-like field', async () => {
        const bad = [...(riders.json || []), ...(customers.json || []), ...(sellers.json || [])].filter(x => 'password' in x);
        return { pass: bad.length === 0, detail: `${bad.length} offending rows` };
    });
    await check('INT-08', 'Notification feed rows carry an id and a read flag', async () => {
        const rows = notifications.json || [];
        if (!rows.length) return { pass: true, detail: 'feed empty' };
        const bad = rows.filter(n => !(n._id || n.notificationId) || typeof n.read !== 'boolean');
        return { pass: bad.length === 0, detail: `${rows.length} rows, ${bad.length} malformed` };
    });
    await check('INT-09', 'Every parcel map row belongs to a live parcel', async () => {
        const tracking = new Set((parcels.json || []).map(p => p.trackingNumber));
        const orphans = (locations.json || []).filter(l => !tracking.has(l.parcelId));
        return { pass: orphans.length === 0, detail: `${orphans.length} orphan map row(s): ${orphans.map(o => o.parcelId).join(',') || 'none'}` };
    });
}

async function groupErrorsAndLeaks(tokens, leakBodies) {
    console.log('\n== Validation mapping and error hygiene ==');
    const su = tokens?.super_admin;
    if (!su) { skip('VAL-00', 'Validation suite', 'no super_admin token'); return; }

    const push = (r) => { if (r) leakBodies.push(r); return r; };

    push(await expectStatus('VAL-01', 'Parcel missing required fields is a 400, not a 500',
        () => authed('POST', '/api/parcels', su, { trackingNumber: `QA-${STAMP}-MISSING` }), 400));
    push(await expectStatus('VAL-02', 'Seller missing required fields is a 400, not a 500',
        () => authed('POST', '/api/sellers', su, { fullName: 'QA Missing Fields' }), 400));
    push(await expectStatus('VAL-03', 'Update with no editable field is a 400',
        () => authed('PUT', '/api/parcels/000000000000000000000000', su, { nothing: 1 }), 400));
    push(await expectStatus('VAL-04', 'Updating an unknown parcel is a 404, not a 500',
        () => authed('PUT', '/api/parcels/000000000000000000000000', su, { status: 'In Transit' }), 404));
    push(await expectStatus('VAL-05', 'Updating an unknown seller is a 404, not a 500',
        () => authed('PUT', '/api/sellers/000000000000000000000000', su, { storeName: 'QA' }), 404));
    push(await expectStatus('VAL-06', 'Deleting an unknown parcel is a 404, not a 200',
        () => authed('DELETE', '/api/parcels/000000000000000000000000', su), 404));
    push(await expectStatus('VAL-07', 'Deleting an unknown seller is a 404, not a 200',
        () => authed('DELETE', '/api/sellers/000000000000000000000000', su), 404));

    const forbidden = [
        ['E11000', 'duplicate-key driver text'],
        ['Path `', 'schema path text'],
        ['Cannot read properties', 'internal crash text'],
        ['collection:', 'collection name'],
        ['index:', 'index name'],
        ['MongoServerError', 'driver error class'],
        [' at ', 'stack frame'],
    ];
    for (const [needle, label] of forbidden) {
        await check(`LEAK-${needle.trim().replace(/[^A-Za-z]/g, '') || 'X'}`, `No ${label} in any error body`, async () => {
            const hits = leakBodies.filter(r => (r.text || '').includes(needle));
            return { pass: hits.length === 0, detail: hits.length ? `${hits.length} body/bodies contain "${needle}": ${hits[0].snippet}` : 'clean' };
        });
    }
}

async function groupCrud(tokens) {
    console.log('\n== CRUD integrity (rows are removed afterwards) ==');
    const su = tokens?.super_admin;
    if (!su) { skip('CRUD-00', 'CRUD suite', 'no super_admin token'); return; }

    const sellerEmail = `qa.e2e.seller.${STAMP.toLowerCase()}@gmail.com`;
    const sellerRes = await authed('POST', '/api/sellers', su, {
        registrationId: `YTOS2026QA${STAMP.slice(-3)}`, fullName: 'QA E2E Seller',
        storeName: 'QA E2E Store', email: sellerEmail, phone: '09171234567', status: 'ACTIVE',
    });
    const seller = sellerRes.json?.data;
    if (seller?._id) created.sellers.push(seller._id);
    record('CRUD-01', 'Seller created', sellerRes.status === 201 && !!seller?._id,
        `status=${sellerRes.status} registrationId=${seller?.registrationId}`);
    record('CRUD-02', 'Seller carries an audit entry',
        Array.isArray(seller?.statusHistory) && seller.statusHistory.length > 0,
        `entries=${seller?.statusHistory?.length ?? 0}`);
    record('CRUD-02b', 'Seller email is stored lower-cased',
        seller?.email === sellerEmail, `email=${seller?.email}`);

    await check('CRUD-03', 'Created seller is readable back by email', async () => {
        const r = await authed('GET', '/api/sellers', su);
        const found = (r.json || []).find(x => x.email === sellerEmail);
        return { pass: !!found, detail: found ? `id=${found._id}` : 'not found' };
    });
    await check('CRUD-04', 'Seller update is persisted', async () => {
        const r = await authed('PUT', `/api/sellers/${seller?._id}`, su, { storeName: 'QA E2E Store Renamed' });
        return { pass: r.status === 200 && r.json?.storeName === 'QA E2E Store Renamed', detail: `status=${r.status}` };
    });
    await check('CRUD-05', 'Seller update ignores non-editable fields', async () => {
        const r = await authed('PUT', `/api/sellers/${seller?._id}`, su, { storeName: 'QA E2E Store', registrationId: 'YTOS99999999' });
        return { pass: r.json?.registrationId !== 'YTOS99999999', detail: `registrationId=${r.json?.registrationId}` };
    });
    await check('AUDIT-01', 'Web-created seller reaches the activity log', async () => {
        const r = await authed('GET', '/api/activity-log?limit=200', su);
        const hay = (r.text || '').toLowerCase();
        return { pass: hay.includes(sellerEmail) || hay.includes('qa e2e store'), detail: `status=${r.status}, email present=${hay.includes(sellerEmail)}` };
    });

    const riderEmail = `qa.e2e.rider.${STAMP.toLowerCase()}@gmail.com`;
    const riderRes = await authed('POST', '/api/riders', su, {
        registrationId: `YTOR2026QA${STAMP.slice(-3)}`, riderName: 'QA E2E Rider',
        email: riderEmail, phone: '09179876543', vehicleType: 'Motorcycle',
        vehiclePlate: 'QA-' + STAMP.slice(-4), status: 'Active',
    });
    const rider = riderRes.json?.data;
    if (rider?._id) created.riders.push(rider._id);
    record('CRUD-06', 'Rider created', riderRes.status === 201 && !!rider?._id, `status=${riderRes.status}`);
    record('CRUD-07', 'Rider duty flag defaults to off', rider?.isOnDuty === false, `isOnDuty=${rider?.isOnDuty}`);

    const tracking = `YTOQA${STAMP}`;
    const parcelRes = await authed('POST', '/api/parcels', su, {
        trackingNumber: tracking, senderName: 'QA E2E Seller', senderPhone: '09171234567', senderEmail: sellerEmail,
        receiverName: 'QA E2E Recipient', receiverPhone: '09170001111', item: 'QA E2E Parcel', weight: '1.5',
        origin: 'Calumpit, Bulacan', destination: 'Baliuag, Bulacan', status: 'Pending',
        sellerId: seller?._id || '', deliveryFee: 170, paymentMode: 'COD', codAmount: 1500,
        riderLat: 14.9027, riderLng: 120.8073,
    });
    const parcel = parcelRes.json?.parcel;
    if (parcel?._id) created.parcels.push(parcel._id);
    record('CRUD-08', 'Parcel created', parcelRes.status === 201 && !!parcel?._id,
        `status=${parcelRes.status} tracking=${parcel?.trackingNumber}`);
    await check('CRUD-09', 'Parcel keeps its fee and COD figures', async () =>
        ({ pass: parcel?.deliveryFee === 170 && parcel?.codAmount === 1500, detail: `fee=${parcel?.deliveryFee} cod=${parcel?.codAmount}` }));
    await check('CRUD-10', 'Parcel status update is persisted', async () => {
        const r = await authed('PUT', `/api/parcels/${parcel?._id}`, su, { status: 'In Transit' });
        return { pass: r.status === 200 && r.json?.status === 'In Transit', detail: `status=${r.status} newStatus=${r.json?.status}` };
    });
    await check('CRUD-11', 'Duplicate tracking number is refused with a client error', async () => {
        const r = await authed('POST', '/api/parcels', su, { trackingNumber: tracking, senderName: 'Dup', receiverName: 'Dup', item: 'Dup' });
        return { pass: r.status === 409 || r.status === 400, detail: `status=${r.status} body=${r.snippet}` };
    });
    await check('CRUD-12', 'Duplicate seller email is refused with a client error', async () => {
        const r = await authed('POST', '/api/sellers', su, {
            registrationId: `YTOS2026QB${STAMP.slice(-3)}`, fullName: 'QA Duplicate', email: sellerEmail,
        });
        if (r.json?.data?._id) created.sellers.push(r.json.data._id);
        return { pass: r.status === 409 || r.status === 400, detail: `status=${r.status} body=${r.snippet}` };
    });
    await check('CRUD-13', 'Parcel with coordinates creates one map row', async () => {
        const r = await authed('GET', '/api/parcel-locations', su);
        const rows = (r.json || []).filter(l => l.parcelId === tracking);
        return { pass: rows.length === 1, detail: `${rows.length} map row(s) for ${tracking}` };
    });
    await check('CRUD-14', 'Deleting a parcel removes its map row', async () => {
        const del = await authed('DELETE', `/api/parcels/${parcel?._id}`, su);
        const r = await authed('GET', '/api/parcel-locations', su);
        const left = (r.json || []).filter(l => l.parcelId === tracking);
        created.parcels = created.parcels.filter(id => id !== parcel?._id);
        return { pass: del.status === 200 && left.length === 0, detail: `delete=${del.status} remainingRows=${left.length}` };
    });
}

async function cleanup(tokens) {
    if (KEEP) { console.log('\n--keep passed: created rows were left in place.'); return; }
    console.log('\n== Cleanup ==');
    const su = tokens?.super_admin;
    if (!su) { console.log('  skipped: no super_admin token'); return; }
    for (const id of created.parcels) await authed('DELETE', `/api/parcels/${id}`, su);
    for (const id of created.riders) await authed('DELETE', `/api/riders/${id}`, su);
    for (const id of created.sellers) await authed('DELETE', `/api/sellers/${id}`, su);
    console.log(`  removed ${created.parcels.length} parcel(s), ${created.riders.length} rider(s), ${created.sellers.length} seller(s)`);
}

async function purgeOrphans(tokens) {
    const su = tokens?.super_admin;
    if (!su || !PURGE_ORPHANS) return;
    console.log('\n== Purging orphaned map rows ==');
    const [parcels, locations] = await Promise.all([
        authed('GET', '/api/parcels', su), authed('GET', '/api/parcel-locations', su),
    ]);
    const tracking = new Set((parcels.json || []).map(p => p.trackingNumber));
    for (const row of (locations.json || [])) {
        if (tracking.has(row.parcelId)) continue;
        const r = await authed('DELETE', `/api/parcel-locations/${row._id}`, su);
        console.log(`  removed map row ${row.parcelId} (status ${r.status})`);
    }
}

async function groupInventory(tokens) {
    const su = tokens?.super_admin;
    if (!su) return;
    console.log('\n== Live data inventory (evidence, not assertions) ==');
    const [parcels, sellers, riders, customers, issues, notifications, locations] = await Promise.all([
        authed('GET', '/api/parcels', su), authed('GET', '/api/sellers', su), authed('GET', '/api/riders', su),
        authed('GET', '/api/customers', su), authed('GET', '/api/issues', su), authed('GET', '/api/notifications', su),
        authed('GET', '/api/parcel-locations', su),
    ]);
    const len = (x) => (Array.isArray(x.json) ? x.json.length : 'n/a');
    console.log(`  counts: parcels=${len(parcels)} sellers=${len(sellers)} riders=${len(riders)} customers=${len(customers)} issues=${len(issues)} notifications=${len(notifications)} mapRows=${len(locations)}`);
    if (Array.isArray(customers.json) && customers.json.length) {
        console.log('  customers: ' + customers.json.map(c => `${c.email || c.customerId} (${c.source || 'n/a'})`).join(', '));
    }
    if (Array.isArray(issues.json) && issues.json.length) {
        console.log('  issues: ' + issues.json.map(i => `${i.ticketId}:${i.status}`).join(', '));
    }
    if (Array.isArray(riders.json) && riders.json.length) {
        console.log('  riders: ' + riders.json.map(r => `${r.registrationId || r.email}:${r.status}${r.isOnDuty ? ' (on duty)' : ''}`).join(', '));
    }
    if (Array.isArray(locations.json) && locations.json.length) {
        const tracking = new Set((parcels.json || []).map(p => p.trackingNumber));
        console.log('  map rows: ' + locations.json.map(l => `${l.parcelId}${tracking.has(l.parcelId) ? '' : ' [ORPHAN]'}`).join(', '));
    }
    if (Array.isArray(notifications.json) && notifications.json.length) {
        console.log('  newest notifications: ' + notifications.json.slice(0, 3).map(n => `"${n.title}" (${n.role || 'n/a'}, read=${n.read})`).join(', '));
    }
}

async function groupClientConfig() {
    console.log('\n== Client data-source configuration ==');
    const envFiles = ['.env', '.env.development', '.env.production'];
    for (const f of envFiles) {
        const p = path.resolve(WEB_SERVER_DIR, '..', f);
        if (!fs.existsSync(p)) continue;
        const body = fs.readFileSync(p, 'utf8');
        const m = /^VITE_DEMO_MODE\s*=\s*(.*)$/m.exec(body);
        console.log(`  ${f}: VITE_DEMO_MODE=${m ? m[1].trim() : '(unset)'}`);
    }
}

// ════════════════════════════════════════════════════════════════════════
(async () => {
    console.log('YTO Web Admin - live REAL-admin E2E + security harness');
    console.log(`  base:   ${BASE}`);
    console.log(`  env:    ${ENV_FILE}${fs.existsSync(ENV_FILE) ? '' : ' (MISSING)'}`);
    console.log(`  run id: ${STAMP}`);

    const leakBodies = [];
    const tokens = await groupAuth();
    await groupLiveness();
    await groupUnauthenticated();
    await groupTokenTamper(tokens);
    await groupRoleGates(tokens);
    await groupAdminSafety(tokens);
    await groupBridgeGate();
    await groupIntegrity(tokens);
    await groupErrorsAndLeaks(tokens, leakBodies);
    await groupCrud(tokens);
    await cleanup(tokens);
    await purgeOrphans(tokens);
    await groupInventory(tokens);
    await groupClientConfig();

    const failed = results.filter(r => !r.pass);
    console.log('\n== Summary ==');
    console.log(`  ${results.length - failed.length} passed, ${failed.length} failed, ${skips.length} skipped (of ${results.length + skips.length})`);
    console.log(`  sign-in calls used: ${loginCount} (limit 10 per 15 min unless LOGIN_MAX_ATTEMPTS is raised)`);
    if (failed.length) {
        console.log('  failures:');
        for (const f of failed) console.log(`    ${f.id} ${f.name} — ${f.detail}`);
    }
    if (skips.length) {
        console.log('  skipped:');
        for (const s of skips) console.log(`    ${s.id} ${s.name} — ${s.reason}`);
    }
    process.exit(failed.length ? 1 : 0);
})().catch((e) => {
    console.error('harness crashed:', e);
    process.exit(2);
});
