// ============================================================================
// Rider GPS simulator — demo the live Geofence Monitor before the mobile app
// sends real GPS.
//
//   cd server
//   node simulateRider.js
//
// Every 3 seconds it sends one GPS ping per rider to
//   POST {BASE_URL}/api/riders/:riderId/location
// exactly like the rider app will. Stop it with Ctrl+C.
// ============================================================================
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// ── Settings ────────────────────────────────────────────────────────────────
// Local test:  'http://localhost:3001'
// Live site:   'https://yto-express-backend.onrender.com'
const BASE_URL = 'http://localhost:3001';
const LOOP = true;               // true = start the routes again when they finish
const PING_EVERY_MS = 3000;      // one ping every 3 seconds
const POINTS_PER_ROUTE = 28;     // points along each route

// Same secret the server checks (BRIDGE_API_KEY in server/.env). For the live
// site it must match the BRIDGE_API_KEY set on Render.
const BRIDGE_API_KEY = process.env.BRIDGE_API_KEY;

// YTO Pulilan Main Sorting Hub (same as src/hubGeofenceData.js)
const HUB = { lat: 14.9027, lng: 120.8073 };
const HUB_RADIUS_KM = 2.5;

// ── Routes ──────────────────────────────────────────────────────────────────
// A few real turning points along the roads (approximate). The script fills in
// evenly spaced points between them so each route has POINTS_PER_ROUTE pings.
const RIDERS = [
  {
    riderId: 'YTOR20260001',
    label: 'Rider 1 (hub -> Malolos)',
    // Starts at the hub, goes down to MacArthur Highway, then south to Malolos.
    waypoints: [
      { lat: 14.9027, lng: 120.8073 }, // YTO Pulilan Main Sorting Hub
      { lat: 14.8975, lng: 120.8040 }, // Dampol II-B road
      { lat: 14.8900, lng: 120.8000 }, // join MacArthur Highway
      { lat: 14.8790, lng: 120.8020 }, // MacArthur Hwy southbound
      { lat: 14.8680, lng: 120.8060 }, // Longos / Bulihan area
      { lat: 14.8560, lng: 120.8110 }, // Malolos city proper
      { lat: 14.8440, lng: 120.8115 }, // Malolos (about 6.5 km from hub)
    ],
  },
  {
    riderId: 'YTOR20260002',
    label: 'Rider 2 (Plaridel -> hub)',
    // Starts in Plaridel, heads west through Pulilan town and the NLEX
    // Pulilan interchange, then into the hub.
    waypoints: [
      { lat: 14.8870, lng: 120.8570 }, // Plaridel (about 5.6 km from hub)
      { lat: 14.8935, lng: 120.8520 }, // Plaridel-Pulilan road
      { lat: 14.8990, lng: 120.8490 }, // Pulilan town proper
      { lat: 14.9050, lng: 120.8350 }, // Pulilan Regional Road westbound
      { lat: 14.9103, lng: 120.8152 }, // NLEX Pulilan interchange
      { lat: 14.9060, lng: 120.8100 }, // Dampol II-B
      { lat: 14.9027, lng: 120.8073 }, // YTO Pulilan Main Sorting Hub
    ],
  },
];

// ── Math helpers ────────────────────────────────────────────────────────────
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

// Distance in km between two points (haversine formula).
function distanceKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Compass heading from a to b (0 = north, 90 = east, 180 = south, 270 = west).
function headingDeg(a, b) {
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// Turns a few waypoints into `count` evenly spaced points along the same path.
function buildRoute(waypoints, count) {
  const legs = [];
  let total = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const km = distanceKm(waypoints[i], waypoints[i + 1]);
    legs.push({ from: waypoints[i], to: waypoints[i + 1], km });
    total += km;
  }

  const points = [];
  for (let n = 0; n < count; n++) {
    let target = (total * n) / (count - 1); // km from the start for this point
    // Walk along the legs until we reach the leg this point falls on.
    let k = 0;
    while (k < legs.length - 1 && target > legs[k].km) {
      target -= legs[k].km;
      k += 1;
    }
    const leg = legs[k];
    const t = leg.km === 0 ? 0 : Math.min(1, target / leg.km);
    points.push({
      lat: leg.from.lat + (leg.to.lat - leg.from.lat) * t,
      lng: leg.from.lng + (leg.to.lng - leg.from.lng) * t,
    });
  }

  // Heading of each point = direction to the next point (last keeps the previous one).
  return points.map((p, i) => {
    const next = points[i + 1];
    const heading = next ? headingDeg(p, next) : headingDeg(points[i - 1], p);
    return { ...p, heading: Math.round(heading) };
  });
}

// ── Sending a ping ──────────────────────────────────────────────────────────
async function sendPing(rider, point) {
  const res = await fetch(`${BASE_URL}/api/riders/${rider.riderId}/location`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-bridge-api-key': BRIDGE_API_KEY },
    body: JSON.stringify({
      latitude: point.lat,
      longitude: point.lng,
      heading: point.heading,
      timestamp: new Date().toISOString(),
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`HTTP ${res.status} ${body.error || ''}`.trim());
  }
}

function logPing(rider, point, step, error) {
  const km = distanceKm(point, HUB);
  const zone = km <= HUB_RADIUS_KM ? 'INSIDE GEOFENCE ' : 'OUTSIDE GEOFENCE';
  const time = new Date().toLocaleTimeString();
  const result = error ? `FAILED: ${error.message}` : 'ok';
  console.log(
    `[${time}] ${rider.riderId} ${String(step + 1).padStart(2)}/${POINTS_PER_ROUTE}  ` +
    `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}  heading ${String(point.heading).padStart(3)}°  ` +
    `${km.toFixed(2)} km  ${zone}  ${result}`
  );
}

// ── Main loop ───────────────────────────────────────────────────────────────
async function main() {
  if (!BRIDGE_API_KEY) {
    console.error('BRIDGE_API_KEY is missing. Add it to server/.env (same value the server uses).');
    process.exit(1);
  }

  const routes = RIDERS.map((r) => buildRoute(r.waypoints, POINTS_PER_ROUTE));
  console.log(`Sending GPS pings to ${BASE_URL} every ${PING_EVERY_MS / 1000}s (LOOP=${LOOP}). Ctrl+C to stop.`);
  RIDERS.forEach((r) => console.log(`  ${r.label}`));

  let step = 0;
  const timer = setInterval(async () => {
    const current = step;
    step += 1;

    // Send this step's ping for every rider at the same time.
    await Promise.all(RIDERS.map(async (rider, i) => {
      const point = routes[i][current];
      try {
        await sendPing(rider, point);
        logPing(rider, point, current);
      } catch (err) {
        logPing(rider, point, current, err);
      }
    }));

    if (step >= POINTS_PER_ROUTE) {
      if (LOOP) {
        console.log('--- Route finished, starting again ---');
        step = 0;
      } else {
        console.log('--- Route finished ---');
        clearInterval(timer);
      }
    }
  }, PING_EVERY_MS);
}

main();
