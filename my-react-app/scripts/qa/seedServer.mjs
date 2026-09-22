// QA / local-dev seed server — serves realistic-but-synthetic payloads for
// every /api/* endpoint the admin portal reads, so pages render populated
// tables/charts/dashboards without touching the live backend or MongoDB.
//
// The dataset itself lives in src/services/demoFixtures.js (shared with the
// frontend's opt-in VITE_DEMO_MODE fallback — see that file's header) so
// there is exactly one synthetic dataset in this repo, not two that can
// silently drift apart.
//
// Two consumers:
//  - scripts/qa/layoutSweep.mjs (npm run qa:layout) — headless layout sweep.
//  - scripts/dev-mock.mjs (npm run dev:mock) — local dev against a fake API
//    instead of the real server/Server.js + Atlas, so nothing synthetic ever
//    touches the REAL-only Web database (see AGENTS2.md §7).
//
// Design notes:
//  - GET collections return bare arrays (40 parcels, 12 riders, ...) so wide
//    tables have rows to stretch layout with.
//  - /api/events/stream is a real text/event-stream so useSSE connects
//    (instead of erroring, falling back to polling and spamming console
//    warnings that would trip the sweep's error assertions).
//  - POST/PUT/DELETE answer { ok: true } so stray mutations never crash.
//  - `/sellers` and `/riders` honor `?status=` the same way the real routes
//    do (case-insensitive exact match), since the pending-verification
//    queues (ProcessSellerInformation.jsx, ProcessRiderInformation.jsx) fetch
//    with that filter.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEMO_RIDERS, DEMO_SELLERS, DEMO_CUSTOMERS, DEMO_PARCELS, DEMO_ISSUES,
  DEMO_ACCOUNTS, DEMO_PARCEL_LOCATIONS, DEMO_ACTIVITY_LOG, DEMO_NOTIFICATIONS,
  DEMO_DASHBOARD_STATS, filterByStatus,
} from '../../src/services/demoFixtures.js';

const collectionRoutes = {
  '/parcels': DEMO_PARCELS,
  '/riders': DEMO_RIDERS,
  '/sellers': DEMO_SELLERS,
  '/accounts': DEMO_ACCOUNTS,
  '/customers': DEMO_CUSTOMERS,
  '/issues': DEMO_ISSUES,
  '/parcel-locations': DEMO_PARCEL_LOCATIONS,
  '/notifications': DEMO_NOTIFICATIONS,
  '/activity-log': DEMO_ACTIVITY_LOG,
  '/events/alerts': [],
  '/events/history': [],
};

// Object-shaped (non-collection) routes.
const objectRoutes = {
  '/dashboard/stats': DEMO_DASHBOARD_STATS,
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
          email, role: 'super_admin',
          account: { _id: 'QA-ACC-1', name: 'QA Super Admin', email, role: 'super_admin' },
        });
      });
      return;
    }

    if (req.method === 'GET') {
      // /customers/:id/orders and similar detail reads -> empty array.
      const suffix = '/' + api.split('/').filter(Boolean).slice(-1)[0];
      if (objectRoutes[api]) { json(res, 200, objectRoutes[api]); return; }
      let rows = collectionRoutes[api] || collectionRoutes[suffix];
      if (rows && (api === '/sellers' || api === '/riders')) {
        rows = filterByStatus(rows, url.searchParams.get('status'));
      }
      if (rows) { json(res, 200, rows); return; }
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
