// QA seed server — serves realistic-but-synthetic payloads for every /api/*
// endpoint the admin portal reads, so the headless layout sweep can render
// real tables/charts without touching the live backend on render.com.
//
// Run only from scripts/qa/layoutSweep.mjs (npm run qa:layout). It answers
// on an ephemeral localhost port and is closed when the sweep finishes.
//
// Design notes:
//  - GET collections return bare arrays (40 parcels, 12 riders, ...) so wide
//    tables have rows to stretch layout with.
//  - Chart/telemetry endpoints return small objects or empty arrays — those
//    pages have empty states, and the app's consumers were hardened against
//    exactly these shapes.
//  - /api/events/stream is a real text/event-stream so useSSE connects
//    (instead of erroring, falling back to polling and spamming console
//    warnings that would trip the sweep's error assertions).
//  - POST/PUT/DELETE answer { ok: true } so stray mutations never crash.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Deterministic pseudo-random rows ────────────────────────────────────
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const PARCEL_STATUSES = ['Delivered', 'In Transit', 'Pending', 'Out for Delivery', 'Cancelled'];
const RIDER_STATUSES  = ['Active', 'On Delivery', 'Idle', 'Offline'];
const ISSUE_STATUSES  = ['Open', 'In Progress', 'Resolved'];
const rnd = lcg(20260903);

function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }

function makeParcels(n) {
  const items = ['Electronics', 'Apparel', 'Documents', 'Fragile Glassware', 'Spare Parts', 'Perishables', 'Books', 'Footwear'];
  const origins = ['Manila', 'Quezon City', 'Makati', 'Pasig', 'Pulilan', 'Caloocan'];
  const dests   = ['Pulilan', 'Baliuag', 'Malolos', 'Angeles', 'Cabanatuan', 'San Fernando'];
  const senders = ['Juan Dela Cruz', 'Maria Santos', 'Pedro Reyes', 'Ana Garcia', 'Luis Mendoza', 'Carla Torres'];
  const recvs   = ['Ramon Bautista', 'Liza Villanueva', 'Marco Aquino', 'Nina Ramos', 'Paolo Fernandez', 'Gina Salazar'];
  const out = [];
  for (let i = 1; i <= n; i++) {
    const status = pick(PARCEL_STATUSES);
    const daysAgo = Math.floor(rnd() * 12);
    const createdAt = new Date(Date.now() - daysAgo * 86400000).toISOString();
    const events = [];
    events.push({ time: createdAt, status: 'Registered', event: 'Parcel registered', location: origins[0] });
    if (status !== 'Pending') {
      events.push({
        time: new Date(Date.now() - daysAgo * 86400000 + 3600000).toISOString(),
        status: 'In Transit', event: 'Picked up by courier', location: 'Pulilan Main Hub',
      });
    }
    if (status === 'Delivered' || status === 'Out for Delivery') {
      events.push({
        time: new Date(Date.now() - 600000).toISOString(),
        status, event: status === 'Delivered' ? 'Delivered to recipient' : 'Out for delivery',
        location: dests[0],
      });
    }
    out.push({
      _id: `QA-PARCEL-${String(i).padStart(4, '0')}`,
      trackingNumber: `YTO-QA-${String(1000 + i)}`,
      parcelId: `YTO-QA-${String(1000 + i)}`,
      senderName: pick(senders), receiverName: pick(recvs),
      origin: pick(origins), destination: pick(dests),
      item: pick(items),
      weightKg: Math.round((rnd() * 9 + 0.5) * 10) / 10,
      declaredValue: Math.round(rnd() * 9000 + 500),
      status, createdAt,
      sender: { name: senders[i % senders.length], address: origins[i % origins.length] },
      events,
    });
  }
  return out;
}

function makeRiders(n) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    out.push({
      _id: `QA-RIDER-${String(i).padStart(4, '0')}`,
      accountNumber: `YTO-RIDER-2026-${String(i).padStart(5, '0')}`,
      riderName: ['Marco Aquino', 'Nina Ramos', 'Paolo Fernandez', 'Gina Salazar', 'Leo Ramirez', 'Sofia Diaz', 'Miguel Ocampo', 'Ava Cruz', 'Josh Reyes', 'Ella Navarro', 'Rafael Lim', 'Zoe Tan'][i - 1] || `Rider ${i}`,
      email: `rider.qa${i}@yto.com`,
      phone: '0917' + String(1000000 + i * 137),
      status: pick(RIDER_STATUSES),
      vehicleType: pick(['Motorcycle', 'Van', 'Tricycle', 'E-Bike']),
      rating: Math.round((rnd() * 2 + 3.5) * 10) / 10,
      currentLocation: { lat: 14.9 + rnd() * 0.1, lng: 120.85 + rnd() * 0.12 },
      lastSeen: new Date(Date.now() - Math.floor(rnd() * 600000)).toISOString(),
    });
  }
  return out;
}

function makeAccounts(n) {
  const roles = ['super_admin', 'admin', 'moderator'];
  const out = [];
  for (let i = 1; i <= n; i++) {
    out.push({
      _id: `QA-ACC-${i}`,
      name: i === 1 ? 'QA Super Admin' : `Admin ${i}`,
      email: i === 1 ? 'qa.superadmin@yto.com' : `admin.qa${i}@yto.com`,
      role: pick(roles),
      accountType: 'Admin Account',
      status: 'Active',
      createdAt: new Date(Date.now() - i * 86400000).toISOString(),
    });
  }
  return out;
}

function makeCustomers(n) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    out.push({
      _id: `QA-CUST-${i}`,
      customerId: `CUST-2026-${String(i).padStart(5, '0')}`,
      name: pick(['Liza Villanueva', 'Marco Aquino', 'Nina Ramos', 'Paolo Fernandez', 'Gina Salazar', 'Leo Ramirez']),
      email: `customer.qa${i}@gmail.com`,
      phone: '0918' + String(2000000 + i * 211),
      statusHistory: [{ status: 'Registered', reason: 'Account created', changedAt: new Date(Date.now() - i * 86400000).toISOString() }],
    });
  }
  return out;
}

function makeIssues(n) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    out.push({
      _id: `QA-ISSUE-${i}`,
      ticketId: `TICK-2026-${String(10000 + i)}`,
      customerName: pick(['Liza Villanueva', 'Marco Aquino', 'Nina Ramos']),
      customerId: `CUST-2026-${String(10000 + i)}`,
      subject: pick(['Lost package', 'Damaged item', 'Delayed delivery', 'Wrong address', 'Billing question']),
      description: 'QA-seeded customer issue used by the layout sweep.',
      status: pick(ISSUE_STATUSES),
      priority: pick(['Low', 'Medium', 'High']),
      createdAt: new Date(Date.now() - i * 3600000).toISOString(),
    });
  }
  return out;
}

function makeSellers(n) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    out.push({
      _id: `QA-SELL-${i}`,
      accountNumber: `YTO-SELL-2026-${String(i).padStart(5, '0')}`,
      fullName: pick(['Juan Dela Cruz', 'Maria Santos', 'Pedro Reyes', 'Ana Garcia']),
      storeName: `QA Store ${i}`,
      email: `seller.qa${i}@yto.com`,
      phone: '0919' + String(3000000 + i * 317),
      status: 'Active',
      createdAt: new Date(Date.now() - i * 86400000).toISOString(),
    });
  }
  return out;
}

const parcels = makeParcels(40);
const riders  = makeRiders(12);
const accounts = makeAccounts(4);
const customers = makeCustomers(14);
const issues  = makeIssues(14);
const sellers = makeSellers(8);

const STATS = {
  totalParcels: parcels.length,
  totalRiders: riders.length,
  totalSellers: sellers.length,
  totalCustomers: customers.length,
  totalIssues: issues.length,
  inTransit: 11, delivered: 14, pending: 9, cancelled: 3, returned: 3,
  deliverySuccessPct: 92.5,
  avgRiderRating: 4.6,
  activeRiders: 9,
  pendingVerifications: 3,
  peakToday: 21,
  revenue: 182450,
  history: [],
};

const collectionRoutes = {
  '/parcels': parcels,
  '/riders': riders,
  '/sellers': sellers,
  '/accounts': accounts,
  '/customers': customers,
  '/issues': issues,
  '/parcel-locations': parcels.map((p) => ({
    _id: `QA-PL-${p._id}`, parcelId: p.parcelId, trackingNumber: p.trackingNumber,
    lat: 14.9085 + (rnd() - 0.5) * 0.05, lng: 120.8545 + (rnd() - 0.5) * 0.05,
    status: p.status, timestamp: p.createdAt,
  })),
  '/notifications': [],
  '/activity-log': [],
  '/events/alerts': [],
  '/events/history': [],
};

// Object-shaped (non-collection) routes.
const objectRoutes = {
  '/dashboard/stats': STATS,
  '/events/stats': { threshold: 5, concurrent: 0 },
};

// ── Optional real-data fixtures ─────────────────────────────────────────
// Drop MongoDB exports into scripts/qa/fixtures/ as JSON files named after
// the route they feed (parcels.json, riders.json, issues.json,
// dashboard-stats.json, ...). When present they REPLACE the synthetic
// generator for that route so the sweep runs against real record shapes
// and volumes. See fixtures/README.md for the full name table. The folder
// may be empty or absent — the synthetic fallback below always applies.
const FIXTURE_ROUTES = {
  'parcels': '/parcels',
  'riders': '/riders',
  'sellers': '/sellers',
  'accounts': '/accounts',
  'customers': '/customers',
  'issues': '/issues',
  'parcel-locations': '/parcel-locations',
  'notifications': '/notifications',
  'activity-log': '/activity-log',
  'events-alerts': '/events/alerts',
  'events-history': '/events/history',
  'dashboard-stats': '/dashboard/stats',
  'events-stats': '/events/stats',
};
// Default: scripts/qa/fixtures/ (real exports). Override with QA_FIXTURES_DIR
// to point at an alternate set, e.g. the committed stress fixtures:
//   QA_FIXTURES_DIR=scripts/qa/fixtures-stress npm run qa:layout
const FIXTURES_DIR = process.env.QA_FIXTURES_DIR
  ? path.resolve(process.cwd(), process.env.QA_FIXTURES_DIR)
  : path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
if (fs.existsSync(FIXTURES_DIR)) {
  for (const file of fs.readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.json'))) {
    const base = file.slice(0, -5);
    const route = FIXTURE_ROUTES[base];
    if (!route) { console.warn('[seed] ignoring unknown fixture ' + file); continue; }
    let payload;
    try { payload = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf8')); }
    catch (e) { console.warn('[seed] skipping unparseable fixture ' + file + ': ' + e.message); continue; }
    if (route === '/dashboard/stats' || route === '/events/stats') {
      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        objectRoutes[route] = payload;
        console.log('[seed] fixture ' + file + ' -> ' + route + ' (object)');
      } else {
        console.warn('[seed] fixture ' + file + ' must be a JSON object, skipped');
      }
    } else if (Array.isArray(payload)) {
      collectionRoutes[route] = payload;
      console.log('[seed] fixture ' + file + ' -> ' + route + ' (' + payload.length + ' rows)');
    } else {
      console.warn('[seed] fixture ' + file + ' must be a JSON array, skipped');
    }
  }
}

function json(res, code, body) {
  const payload = JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '600',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function writeSse(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  res.write('event: connected\ndata: {"message":"QA seed event stream connected"}\n\n');
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 10000);
  res.on('close', () => clearInterval(heartbeat));
}

export function startSeedServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const api = path.startsWith('/api') ? path.slice(4) : path;

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '600',
      });
      res.end();
      return;
    }

    // Real SSE stream so useSSE connects instead of erroring into polling.
    if (api === '/events/stream') { writeSse(res); return; }

    if (req.method === 'POST' && api === '/accounts/login') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        let email = 'qa.superadmin@yto.com';
        try { email = (JSON.parse(body || '{}').email || email); } catch {}
        json(res, 200, {
          token: 'qa-seed-token',
          email, role: 'super_admin', isDemo: true,
          account: { _id: 'QA-ACC-1', name: 'QA Super Admin', email, role: 'super_admin' },
        });
      });
      return;
    }

    if (req.method === 'GET') {
      // /customers/:id/orders and similar detail reads -> empty array.
      const suffix = '/' + api.split('/').filter(Boolean).slice(-1)[0];
      if (objectRoutes[api]) { json(res, 200, objectRoutes[api]); return; }
      if (collectionRoutes[api]) { json(res, 200, collectionRoutes[api]); return; }
      if (collectionRoutes[suffix]) { json(res, 200, collectionRoutes[suffix]); return; }
      json(res, 200, []);
      return;
    }

    // Any mutation the sweep triggers by accident: no-op success.
    json(res, 200, { ok: true });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}
