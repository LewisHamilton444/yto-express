// App <-> Web integration verification.
//
//   node qa/web/appWebIntegration.mjs
//   TRACKING=YTO2026516193 node qa/web/appWebIntegration.mjs
//
// Uses the REAL shipment that the phone's autonomous REAL-account suite
// created (tests/QA activity REAL-02 -> booking, REAL-04 -> delivered with POD)
// and checks both halves of the bridge contract:
//
//   App -> Web : seller / customer / rider rows, parcel fields, delivery fee,
//                POD photo, rider coordinates, event timeline, Web-minted
//                enterprise IDs, QR payload, POD geofence spec, notifications
//   Web -> App : an admin status change reaches the mobile backend and the
//                mobile shipment record, and an admin profile edit reaches the
//                mobile user record
//
// Reads credentials from the Web server/.env and talks to both backends
// directly over HTTP.

import fs from 'node:fs';
import path from 'node:path';

const WEB_SERVER_DIR = process.env.WEB_SERVER_DIR
    || 'C:/Users/ADMIN/React_Projects/YTO Latest/my-react-app/server';
const WEB_BASE = process.env.WEB_BASE || 'http://localhost:3001';
const MOBILE_BASE = process.env.MOBILE_BASE || 'http://localhost:5000';
const TRACKING = process.env.TRACKING || '';
const APP_PASSWORD = process.env.APP_QA_PASSWORD || 'Password123';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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

const results = [];
function record(id, name, pass, detail = '') {
    results.push({ id, name, pass: !!pass, detail });
    console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${id} ${name}${detail ? ' :: ' + detail : ''}`);
}

async function api(base, method, urlPath, { token, key, body } = {}) {
    const headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (key) headers['x-bridge-api-key'] = key;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    try {
        const res = await fetch(base + urlPath, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
        const text = await res.text();
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
        return { status: res.status, json, text };
    } catch (e) {
        return { status: 0, json: null, text: 'network error: ' + e.message };
    }
}

(async () => {
    console.log('YTO App <-> Web integration verification');
    console.log(`  web:    ${WEB_BASE}`);
    console.log(`  mobile: ${MOBILE_BASE}`);

    // ── sign in to the Web admin ────────────────────────────────────────
    const loginRes = await api(WEB_BASE, 'POST', '/api/accounts/login', {
        body: { email: 'superadmin@ytoexpress.com', password: env.ADMIN_PASSWORD_SUPERADMIN },
    });
    if (loginRes.status !== 200 || !loginRes.json?.token) {
        record('I-00', 'Web admin sign-in', false, `status=${loginRes.status} ${loginRes.text.slice(0, 120)}`);
        process.exitCode = 1;
        return;
    }
    const token = loginRes.json.token;
    record('I-00', 'Web admin sign-in', true, 'super_admin');

    // ── locate the parcel the phone created ─────────────────────────────
    const parcelsRes = await api(WEB_BASE, 'GET', '/api/parcels', { token });
    const parcels = Array.isArray(parcelsRes.json) ? parcelsRes.json : [];
    // /api/parcels sorts newest first, so the app-created candidate is the one
    // at the front of the filtered list, not the back.
    const parcel = TRACKING
        ? parcels.find(p => p.trackingNumber === TRACKING)
        : parcels.filter(p => /^YTO\d{6,}$/.test(p.trackingNumber || ''))[0];

    if (!parcel) {
        record('I-01', 'App-created parcel arrived on the Web', false,
            `${parcels.length} parcel(s) on the Web, none matched ${TRACKING || 'an app tracking number'}: ${parcels.map(p => p.trackingNumber).join(', ')}`);
        process.exitCode = 1;
        return;
    }
    const tracking = parcel.trackingNumber;
    console.log(`  parcel under test: ${tracking}`);
    record('I-01', 'App-created parcel arrived on the Web', true, `trackingNumber=${tracking}`);

    // ═══ App -> Web ════════════════════════════════════════════════════
    console.log('\n== App -> Web (booking + delivery push) ==');
    record('I-02', 'Status pushed by the rider reached the Web', parcel.status === 'Delivered',
        `status=${parcel.status}`);
    record('I-03', 'Delivery fee persisted on the Web parcel',
        parcel.deliveryFee === 170 || parcel.package?.deliveryFee === 170,
        `deliveryFee=${parcel.deliveryFee} package.deliveryFee=${parcel.package?.deliveryFee}`);
    record('I-04', 'Proof-of-delivery photo stored',
        typeof parcel.podPhoto === 'string' && parcel.podPhoto.startsWith('data:image/'),
        `podPhoto=${parcel.podPhoto ? parcel.podPhoto.slice(0, 32) + '... (' + parcel.podPhoto.length + ' bytes)' : 'missing'}`);
    record('I-05', 'Rider coordinates stamped from the phone',
        Number.isFinite(parcel.riderLat) && Number.isFinite(parcel.riderLng),
        `riderLat=${parcel.riderLat} riderLng=${parcel.riderLng}`);
    record('I-06', 'Event timeline recorded',
        Array.isArray(parcel.events) && parcel.events.length > 0,
        `${parcel.events?.length ?? 0} event(s)`);
    record('I-07', 'QR payload minted by the Web',
        typeof parcel.qrPayload === 'string' && parcel.qrPayload.startsWith('YTOQR1|') && parcel.qrPayload.includes(tracking),
        `qrPayload=${parcel.qrPayload || 'missing'}`);
    record('I-08', 'POD geofence spec delivered to the app',
        parcel.trackingGeofence?.radiusMeters === 100 && parcel.trackingGeofence?.kind === 'POD_RING',
        `trackingGeofence=${JSON.stringify(parcel.trackingGeofence)}`);
    record('I-09', 'Enterprise IDs attached to the parcel',
        /^YTOS\d{4}\d{4}$/.test(parcel.sellerEnterpriseId || '') || /^YTOC\d{4}\d{4}$/.test(parcel.customerEnterpriseId || ''),
        `seller=${parcel.sellerEnterpriseId || 'none'} customer=${parcel.customerEnterpriseId || 'none'}`);

    const sellersRes = await api(WEB_BASE, 'GET', '/api/sellers', { token });
    const customersRes = await api(WEB_BASE, 'GET', '/api/customers', { token });
    const ridersRes = await api(WEB_BASE, 'GET', '/api/riders', { token });
    const sellers = Array.isArray(sellersRes.json) ? sellersRes.json : [];
    const customers = Array.isArray(customersRes.json) ? customersRes.json : [];
    const riders = Array.isArray(ridersRes.json) ? ridersRes.json : [];

    const seller = sellers.find(s => s.email && parcel.senderEmail && s.email.toLowerCase() === parcel.senderEmail.toLowerCase())
        || sellers.find(s => s.registrationId && parcel.sellerId && String(s._id) === String(parcel.sellerId));
    const rider = riders.find(r => r.email && parcel.riderId && String(r._id) === String(parcel.riderId))
        || riders.find(r => /^YTOR\d{4}\d{4}$|^YTO-RIDE-/.test(r.registrationId || ''));
    const customer = customers.find(c => c.email && parcel.recipientEmail && c.email.toLowerCase() === parcel.recipientEmail.toLowerCase())
        || customers.find(c => /^YTOC\d{4}\d{4}$|^YTO-CUST-/.test(c.customerId || ''));

    record('I-10', 'Seller row created from the app registration',
        !!seller && /^YTOS\d{4}\d{4}$|^YTO-SELL-/.test(seller.registrationId || ''),
        seller ? `email=${seller.email} registrationId=${seller.registrationId} storeName=${seller.storeName || '(empty)'}` : `no seller matched senderEmail=${parcel.senderEmail}`);
    record('I-11', 'Rider row created from the app registration', !!rider,
        rider ? `email=${rider.email} registrationId=${rider.registrationId}` : 'no rider matched');
    record('I-12', 'Customer row created from the app registration', !!customer,
        customer ? `email=${customer.email} customerId=${customer.customerId}` : `no customer matched recipientEmail=${parcel.recipientEmail}`);

    const notifRes = await api(WEB_BASE, 'GET', '/api/notifications?limit=200', { token });
    const notifs = Array.isArray(notifRes.json) ? notifRes.json : [];
    const related = notifs.filter(n => (n.relatedId || '') === tracking || JSON.stringify(n).includes(tracking));
    record('I-13', 'App notifications fanned out to the Web feed', related.length > 0,
        related.length ? `${related.length} related: ${related.slice(0, 3).map(n => n.title).join(' | ')}` : `feed has ${notifs.length} row(s), none related to ${tracking}`);

    // ═══ Web -> App ════════════════════════════════════════════════════
    console.log('\n== Web -> App (admin status change + profile edit) ==');

    const mobileRead = async () => {
        // Shipment routes mount at /api/shipments (server.js), so the public
        // read is /api/shipments/tracking/<id>.
        const r = await api(MOBILE_BASE, 'GET', `/api/shipments/tracking/${tracking}`);
        return r.json?.data || r.json?.shipment || r.json;
    };
    const before = await mobileRead();
    record('I-14', 'Mobile backend holds the same shipment', !!before?.status,
        `mobile status=${before?.status}`);

    const push = await api(WEB_BASE, 'PUT', `/api/parcels/${parcel._id}`, { token, body: { status: 'Out for Delivery' } });
    record('I-15', 'Admin status change accepted by the Web', push.status === 200,
        `status=${push.status} newStatus=${push.json?.status}`);

    let landed = null;
    for (let i = 0; i < 12; i++) {
        await sleep(1000);
        const s = await mobileRead();
        if (s?.status === 'Out for Delivery') { landed = s; break; }
    }
    record('I-16', 'Admin status change reached the mobile shipment', !!landed,
        landed ? `mobile status=${landed.status}` : `mobile status still ${(await mobileRead())?.status}`);

    // Restore the delivered state so the test row ends where the app left it.
    const restore = await api(WEB_BASE, 'PUT', `/api/parcels/${parcel._id}`, { token, body: { status: 'Delivered' } });
    let back = null;
    for (let i = 0; i < 12; i++) {
        await sleep(1000);
        const s = await mobileRead();
        if (s?.status === 'Delivered') { back = s; break; }
    }
    record('I-17', 'Terminal state restored through the same path',
        restore.status === 200 && !!back, `web=${restore.status} mobile status=${back?.status}`);

    // Profile edit: Web -> App user record (needs the QA seller password).
    if (seller?.email && /^qa/i.test(seller.email)) {
        const newStore = `QA Integrated Store ${Date.now().toString(36).toUpperCase()}`;
        const edit = await api(WEB_BASE, 'PUT', `/api/sellers/${seller._id}`, { token, body: { storeName: newStore } });
        record('I-18', 'Admin profile edit accepted by the Web', edit.status === 200,
            `status=${edit.status} storeName=${edit.json?.storeName}`);

        let appStore = null;
        for (let i = 0; i < 10; i++) {
            await sleep(1000);
            const login = await api(MOBILE_BASE, 'POST', '/api/auth/login', {
                body: { identifier: seller.email, email: seller.email, password: APP_PASSWORD },
            });
            appStore = login.json?.user?.storeName || login.json?.data?.user?.storeName || null;
            if (appStore === newStore) break;
        }
        record('I-19', 'Admin profile edit reached the mobile user record', appStore === newStore,
            `mobile storeName=${appStore || '(unchanged / login failed)'}`);
    } else {
        console.log('  [SKIP] I-18/I-19 profile edit round trip (no QA seller row to edit)');
    }

    const failed = results.filter(r => !r.pass);
    console.log('\n== Summary ==');
    console.log(`  ${results.length - failed.length} passed, ${failed.length} failed (of ${results.length})`);
    for (const f of failed) console.log(`    ${f.id} ${f.name} — ${f.detail}`);
    process.exit(failed.length ? 1 : 0);
})().catch(e => {
    console.error('integration check crashed:', e);
    process.exit(2);
});
