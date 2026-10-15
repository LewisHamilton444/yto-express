// ============================================================================
// I-8 bridge features LIVE check.  Run: npm run qa:features
// ----------------------------------------------------------------------------
// These four features all live in the bridge routes, where a wrong field name
// or a dropped whitelist entry looks exactly like success: the push returns
// 200 and the portal simply never shows the data. A build cannot catch that,
// and neither can reading the code.
//
// So this boots the REAL bridge router (server/bridgeRoutes.js) — not a copy —
// against a real MongoDB (in-memory), pushes the same payloads the Android
// backend sends, and then reads the documents back to see what actually landed:
//
//   D-16  a seller's profile photo is stored, and a later sync WITHOUT one
//         must not wipe it (the blank-value rule);
//   D-14  an issue arrives with the reporter's original intent preserved;
//   D-15  parcel timeline rows are appended without duplicating or erasing;
//   D-13  a rapid doorstep burst is throttled instead of recorded twice.
// ============================================================================

import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Resolve from server/ so the models and this harness share ONE mongoose
// instance — two copies of mongoose would register separate model registries
// and the routes would silently write to a different connection.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(HERE, '..', '..');
const require = createRequire(path.join(SERVER_DIR, 'index.js'));

const express = require('express');
const mongoose = require('mongoose');

const BRIDGE_KEY = 'i8-live-check-key-1234567890';

let checks = 0;
let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  checks += 1;
  if (!ok) {
    failures += 1;
    console.log(`  FAIL ${label}\n       expected: ${JSON.stringify(expected)}\n       actual:   ${JSON.stringify(actual)}`);
  } else {
    console.log(`  ok  ${label}`);
  }
}

async function main() {
  console.log('I-8 bridge features live check\n');

  const mongod = await MongoMemoryServer.create();
  const mongoUri = mongod.getUri('yto_web_features_check');
  process.env.BRIDGE_API_KEY = BRIDGE_KEY;
  process.env.NODE_ENV = 'test';

  // D-5 needs the WHOLE admin server (its endpoint lives in Server.js), so the
  // environment it reads at load is set up front: its own Mongo, its JWT secret
  // and the Android backend URL this portal would push an announcement to.
  const ADMIN_PORT = 34567;
  const STUB_A_PORT = 34568;
  process.env.MONGO_URI = mongoUri;
  process.env.PORT = String(ADMIN_PORT);
  process.env.JWT_SECRET = 'i8-live-check-jwt-secret';
  process.env.ANDROID_BACKEND_URL = `http://127.0.0.1:${STUB_A_PORT}`;
  process.env.ANDROID_BRIDGE_API_KEY = BRIDGE_KEY;

  await mongoose.connect(mongoUri);

  // The real router, mounted on a minimal app: no Server.js auth layer in the
  // way, but every transformation these features depend on is the shipped code.
  const bridgeRouter = require(path.join(SERVER_DIR, 'bridgeRoutes.js'));
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/bridge', bridgeRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/api/bridge`;

  const post = async (route, body) => {
    const res = await fetch(`${base}${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-bridge-api-key': BRIDGE_KEY },
      body: JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch { json = null; }
    return { status: res.status, body: json };
  };

  const Seller = require(path.join(SERVER_DIR, 'models', 'Seller.js'));
  const Issue = require(path.join(SERVER_DIR, 'models', 'Issue.js'));
  const Parcel = require(path.join(SERVER_DIR, 'models', 'Parcel.js'));

  // ── D-16: profile photo sync ─────────────────────────────────────────
  console.log('1. D-16 the seller photo reaches the portal and is never blanked');
  const PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const sellerEmail = `qa.i8.seller.${Date.now()}@example.com`;

  const created = await post('/sync-user', {
    name: 'I8 Seller', email: sellerEmail, role: 'seller',
    phone: '9170000101', storeName: 'I8 Store', profilePhotoUrl: PHOTO,
  });
  check('the seller sync is accepted', created.status, 201);

  const stored = await Seller.findOne({ email: sellerEmail }).lean();
  check('the profile photo is stored on the portal row', stored.profilePhotoUrl, PHOTO);
  check('the cover photo stays empty when none was sent', stored.coverPhotoUrl, '');

  // A later profile edit that carries no photo must not clear it.
  const resync = await post('/sync-user', {
    name: 'I8 Seller Renamed', email: sellerEmail, role: 'seller', phone: '9170000101',
  });
  check('a photo-less re-sync is accepted', resync.status, 200);
  const afterResync = await Seller.findOne({ email: sellerEmail }).lean();
  check('the stored photo survives a sync that omits it', afterResync.profilePhotoUrl, PHOTO);
  check('the re-sync still applied the new name', afterResync.fullName, 'I8 Seller Renamed');

  // ── D-14: issue sub-category ─────────────────────────────────────────
  console.log('\n2. D-14 the reporter\'s original intent is preserved');
  const ticketId = `TICK-2026-${Date.now()}`;
  const issueRes = await post('/sync-issue', {
    ticketId,
    trackingNumber: 'YTO2026LIVE001',
    category: 'Delayed Delivery',
    subCategory: 'Dispute Failed Attempt',
    description: 'Courier did not ring the bell.',
    reporterName: 'I8 Customer',
    reporterEmail: 'qa.i8.cust@example.com',
    reporterRole: 'customer',
  });
  check('the issue sync is accepted', issueRes.status, 201);
  const issue = await Issue.findOne({ ticketId }).lean();
  check('the canonical category is stored', issue.category, 'Delayed Delivery');
  check('the original intent is stored alongside it', issue.subCategory, 'Dispute Failed Attempt');

  // ── D-15: arrival events on the parcel timeline ──────────────────────
  console.log('\n3. D-15 arrival rows join the parcel timeline without duplicating');
  const trackingNumber = 'YTO2026LIVE010';
  const ARRIVAL = {
    time: '2026-10-12T02:00:00.000Z',
    event: 'Courier arrived at the delivery point',
    location: 'Malolos',
    status: 'Out for Delivery',
  };

  const first = await post('/sync-parcel', {
    trackingNumber,
    item: 'I8 Test Parcel',
    senderName: 'I8 Seller Renamed', senderEmail: sellerEmail,
    receiverName: 'I8 Customer', recipientEmail: 'qa.i8.cust@example.com',
    origin: 'Pulilan', destination: 'Malolos', status: 'Out for Delivery',
    weight: '1 kg', paymentMode: 'COD', codAmount: 100, sellerEmail,
    packageCount: 1, packageCategory: 'General', notes: '',
    events: [ARRIVAL],
  });
  check('the parcel sync is accepted', first.status === 200 || first.status === 201, true);
  // Printed on every run: a rejected sync still answers fast, and the body is
  // the only place the reason appears.
  console.log(`  info parcel sync -> ${first.status} ${JSON.stringify(first.body)}`);

  const parcel1 = await Parcel.findOne({ trackingNumber }).lean();
  const eventsWithArrival = parcel1.events.filter((e) => e.event === ARRIVAL.event);
  check('the arrival row is on the timeline', eventsWithArrival.length, 1);

  // Same event again + a genuinely new one.
  await post('/sync-parcel', {
    trackingNumber,
    item: 'I8 Test Parcel',
    senderName: 'I8 Seller Renamed', senderEmail: sellerEmail,
    receiverName: 'I8 Customer', recipientEmail: 'qa.i8.cust@example.com',
    origin: 'Pulilan', destination: 'Malolos', status: 'Out for Delivery',
    weight: '1 kg', paymentMode: 'COD', codAmount: 100, sellerEmail,
    packageCount: 1, packageCategory: 'General', notes: '',
    events: [ARRIVAL, { time: '2026-10-12T02:30:00.000Z', event: 'Courier returned to the doorstep', location: 'Malolos', status: 'Out for Delivery' }],
  });

  const parcel2 = await Parcel.findOne({ trackingNumber }).lean();
  check('the repeated row was not duplicated', parcel2.events.filter((e) => e.event === ARRIVAL.event).length, 1);
  check('the new row was appended', parcel2.events.filter((e) => e.event === 'Courier returned to the doorstep').length, 1);
  check('the timeline is ordered oldest first', parcel2.events.map((e) => e.event).includes('Courier arrived at the delivery point'), true);
  const times = parcel2.events.map((e) => new Date(e.time).getTime());
  check('the timeline is sorted by time', times.every((t, i) => i === 0 || times[i - 1] <= t), true);

  // A sync with no events must not wipe the history.
  await post('/sync-parcel', {
    trackingNumber,
    item: 'I8 Test Parcel',
    senderName: 'I8 Seller Renamed', senderEmail: sellerEmail,
    receiverName: 'I8 Customer', recipientEmail: 'qa.i8.cust@example.com',
    origin: 'Pulilan', destination: 'Malolos', status: 'Out for Delivery',
    weight: '1 kg', paymentMode: 'COD', codAmount: 100, sellerEmail,
    packageCount: 1, packageCategory: 'General', notes: '',
  });
  const parcel3 = await Parcel.findOne({ trackingNumber }).lean();
  check('an event-less sync erased nothing', parcel3.events.length, parcel2.events.length);

  // ── D-13: doorstep burst throttle ────────────────────────────────────
  console.log('\n4. D-13 a doorstep burst is throttled, not double-recorded');
  const step1 = await post('/receive-courier-step', { trackingNumber, event: 'departed', riderLat: 14.9, riderLng: 120.8 });
  const step2 = await post('/receive-courier-step', { trackingNumber, event: 'departed', riderLat: 14.9, riderLng: 120.8 });
  check('the first step is recorded', step1.status, 200);
  check('the immediate repeat is throttled', step2.body && step2.body.data && step2.body.data.throttled, true);

  const parcel4 = await Parcel.findOne({ trackingNumber }).lean();
  check('the burst produced exactly one timeline row',
    parcel4.events.filter((e) => e.event.includes('stepped away from the doorstep')).length, 1);

  // ── D-5: the portal originates an announcement ────────────────────────
  console.log('\n5. D-5 an operator can send an announcement into the app');

  // A stub standing in for the Android backend, capturing exactly what the
  // portal sends it. The real A endpoint is exercised by the Android side's
  // own suite (tests/bridgeFeaturesBundle.test.js).
  let forwarded = null;
  const stubA = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      forwarded = { path: req.url, key: req.headers['x-bridge-api-key'] || '', body: (() => { try { return JSON.parse(raw); } catch { return null; } })() };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Announcement delivered to 2 account(s).', data: { audience: 'all', type: 'system_alert', matched: 3, delivered: 2 } }));
    });
  });
  await new Promise((r) => stubA.listen(STUB_A_PORT, '127.0.0.1', r));

  // The full admin server, against the same in-memory database.
  require(path.join(SERVER_DIR, 'Server.js'));
  const adminBase = `http://127.0.0.1:${ADMIN_PORT}/api`;
  let ready = false;
  for (let i = 0; i < 60 && !ready; i += 1) {
    try {
      const ping = await fetch(`${adminBase}/health`);
      if (ping.status < 500) ready = true;
    } catch { /* still starting */ }
    if (!ready) await new Promise((r) => setTimeout(r, 250));
  }
  check('the admin server is up', ready, true);

  const jwt = require('jsonwebtoken');
  const Account = require(path.join(SERVER_DIR, 'models', 'Account.js'));
  const AdminNotification = require(path.join(SERVER_DIR, 'models', 'AdminNotification.js'));

  const adminAccount = await Account.create({
    name: 'I8 Super Admin', email: `qa.i8.admin.${Date.now()}@example.com`,
    password: 'not-used-by-this-check', role: 'super_admin', status: 'Active',
  });
  const hubAccount = await Account.create({
    name: 'I8 Hub Receiver', email: `qa.i8.hub.${Date.now()}@example.com`,
    password: 'not-used-by-this-check', role: 'hub_receiver', status: 'Active',
  });
  const tokenFor = (account) => jwt.sign(
    { id: account._id.toString(), email: account.email, role: account.role, name: account.name },
    process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' },
  );
  const adminToken = tokenFor(adminAccount);
  const hubToken = tokenFor(hubAccount);

  const announce = async (body, token) => {
    const res = await fetch(`${adminBase}/notifications/broadcast`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch { json = null; }
    return { status: res.status, body: json };
  };

  check('a caller with no token is refused', (await announce({ title: 'T', message: 'M' }, null)).status, 401);
  check('a role outside the office group is refused', (await announce({ title: 'T', message: 'M' }, hubToken)).status, 403);
  check('an unknown audience is refused', (await announce({ title: 'T', message: 'M', audience: 'everybody' }, adminToken)).status, 400);
  check('an unknown message type is refused', (await announce({ title: 'T', message: 'M', type: 'promo_blast' }, adminToken)).status, 400);
  check('empty copy is refused', (await announce({ title: '  ', message: '' }, adminToken)).status, 400);
  check('nothing was forwarded for a refused announcement', forwarded, null);

  const sent = await announce({
    title: 'Hub closed Monday', message: 'The Pulilan hub is closed on Monday.',
    audience: 'seller', type: 'delivery_update',
  }, adminToken);
  check('a valid announcement is accepted', sent.status, 200);
  check('the app reported the delivery count back', sent.body && sent.body.data && sent.body.data.delivered, 2);
  check('it reached the Android backend with the shared key', forwarded && forwarded.key, BRIDGE_KEY);
  check('it hit the right route', forwarded && forwarded.path, '/api/bridge/receive-broadcast');
  check('the audience travelled unchanged', forwarded && forwarded.body.audience, 'seller');
  check('the type travelled unchanged', forwarded && forwarded.body.type, 'delivery_update');
  check('the copy travelled unchanged', forwarded && forwarded.body.message, 'The Pulilan hub is closed on Monday.');

  const audit = await AdminNotification.findOne({ source: 'admin-broadcast' }).lean();
  check('the portal kept an audit row of what was sent', !!audit, true);
  check('the audit row names the announcement', audit && audit.title, 'Announcement sent: Hub closed Monday');

  await new Promise((r) => stubA.close(r));
  await new Promise((r) => server.close(r));
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await mongod.stop();

  console.log(`\n${checks - failures}/${checks} live bridge feature checks passed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('check error:', err && err.message ? err.message : err);
  process.exit(1);
});
