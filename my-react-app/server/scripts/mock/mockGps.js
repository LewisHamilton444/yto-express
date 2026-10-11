// ============================================================================
// Shared helpers for the mock rider GPS scripts (pingRider.js and
// simulateScenario.js). They send pings exactly like the rider app will:
//
//   POST {BASE_URL}/api/riders/:riderId/location
//   header  x-bridge-api-key: <BRIDGE_API_KEY from server/.env>
//   body    { latitude, longitude, heading, timestamp }
//
// Only use the QA riders (YTOR20260001, YTOR20260002) — a ping replaces the
// rider's last known position.
// ============================================================================
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });

// ── Settings ────────────────────────────────────────────────────────────────
// Local test:  'http://localhost:3001'
// Live site:   'https://yto-express-backend.onrender.com'
const BASE_URL = 'http://localhost:3001';

// Same secret the server checks. Never write the key in this file.
const BRIDGE_API_KEY = process.env.BRIDGE_API_KEY;

// YTO Pulilan Main Sorting Hub and its geofence.
// Must match LOGISTICS_HUBS in src/hubGeofenceData.js.
const HUB = { name: 'YTO Pulilan Main Sorting Hub', lat: 14.9027, lng: 120.8073 };
const HUB_RADIUS_M = 2500;

// Named places for pingRider.js --place <name>.
const PLACES = {
  hub:     { lat: 14.9027, lng: 120.8073, label: 'Center of the Pulilan hub' },
  edge:    { lat: 14.8811, lng: 120.8073, label: 'Just inside the 2.5 km boundary (south)' },
  outside: { lat: 14.8680, lng: 120.8040, label: 'About 4 km away, toward Malolos' },
  malolos: { lat: 14.8440, lng: 120.8115, label: 'Malolos city proper' },
  baliwag: { lat: 14.9546, lng: 120.8968, label: 'Baliwag town proper' },
};

// Distance in meters between two points (Haversine formula).
function distanceMeters(a, b) {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Compass direction from a to b, 0-359 degrees (0 = north, 90 = east).
function headingDegrees(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat))
    - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
}

// { meters, inside } for a point, measured from the hub center.
function geofenceCheck(point) {
  const meters = distanceMeters(point, HUB);
  return { meters, inside: meters <= HUB_RADIUS_M };
}

// Short text like "1,234 m to hub  INSIDE".
function describeDistance(point) {
  const { meters, inside } = geofenceCheck(point);
  return `${Math.round(meters).toLocaleString('en-US')} m to hub  ${inside ? 'INSIDE ' : 'OUTSIDE'}`;
}

// Stops the script early when the bridge key is missing from server/.env.
function requireBridgeKey() {
  if (!BRIDGE_API_KEY) {
    console.error('BRIDGE_API_KEY is missing. Add it to server/.env (same value the server uses).');
    process.exit(1);
  }
}

// Sends one ping. Returns { status, body } — never throws on an HTTP error,
// only when the server cannot be reached at all.
async function sendPing(riderId, point, heading) {
  const body = {
    latitude: point.lat,
    longitude: point.lng,
    timestamp: new Date().toISOString(),
  };
  if (heading !== undefined && heading !== null) body.heading = heading;

  const res = await fetch(`${BASE_URL}/api/riders/${encodeURIComponent(riderId)}/location`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-bridge-api-key': BRIDGE_API_KEY },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

// Evenly spaced points between each pair of waypoints, each with the heading
// toward the next point. Used to turn a few road corners into a smooth drive.
function buildRoute(waypoints, stepsPerLeg) {
  const points = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    for (let s = 0; s < stepsPerLeg; s++) {
      const t = s / stepsPerLeg;
      points.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
    }
  }
  points.push({ ...waypoints[waypoints.length - 1] });
  return points.map((p, i) => {
    const next = points[i + 1] || p;
    const prev = points[i - 1] || p;
    return { ...p, heading: next === p ? headingDegrees(prev, p) : headingDegrees(p, next) };
  });
}

module.exports = {
  BASE_URL,
  HUB,
  HUB_RADIUS_M,
  PLACES,
  distanceMeters,
  headingDegrees,
  geofenceCheck,
  describeDistance,
  requireBridgeKey,
  sendPing,
  buildRoute,
};
