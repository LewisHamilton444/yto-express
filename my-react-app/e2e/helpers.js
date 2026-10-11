// Shared helpers for the Geofence Monitor tests.
import { expect } from '@playwright/test';
import { API_URL, BRIDGE_API_KEY } from './env.js';

// The ONLY riders these tests may move. Every ping helper refuses any other
// rider, so a typo can never touch a real rider's location.
export const QA_RIDERS = ['YTOR20260001', 'YTOR20260002'];

// Same places as server/scripts/mock/mockGps.js.
export const PLACES = {
  hub:     { lat: 14.9027, lng: 120.8073 }, // center of the Pulilan hub (inside)
  outside: { lat: 14.8680, lng: 120.8040 }, // about 4 km away toward Malolos
};

// Five points from the hub south along MacArthur Highway toward Malolos,
// each farther from the hub than the one before.
export const ROUTE_TO_MALOLOS = [
  { lat: 14.8975, lng: 120.8040, heading: 210 },
  { lat: 14.8900, lng: 120.8000, heading: 205 },
  { lat: 14.8790, lng: 120.8020, heading: 170 },
  { lat: 14.8680, lng: 120.8060, heading: 160 },
  { lat: 14.8560, lng: 120.8110, heading: 160 },
];

function assertQaRider(riderId) {
  if (!QA_RIDERS.includes(riderId)) {
    throw new Error(`Refusing to move "${riderId}": the tests may only use the QA riders ${QA_RIDERS.join(', ')}.`);
  }
}

// Sends a raw request to the GPS route and returns the response. `headers`
// replaces the default bridge-key header (the security tests send none).
export async function postLocation(request, riderId, body, headers = { 'x-bridge-api-key': BRIDGE_API_KEY }) {
  assertQaRider(riderId);
  return request.post(`${API_URL}/api/riders/${riderId}/location`, { data: body, headers });
}

// Sends one valid ping, like the rider app, and checks the server took it.
// `secondsAgo` back-dates the ping (the server keeps past phone timestamps),
// which makes the signal stale immediately.
export async function sendPing(request, riderId, { lat, lng, heading }, { secondsAgo = 0 } = {}) {
  if (!BRIDGE_API_KEY) throw new Error('No bridge key: set BRIDGE_API_KEY in server/.env or E2E_BRIDGE_API_KEY.');
  const body = { latitude: lat, longitude: lng, timestamp: new Date(Date.now() - secondsAgo * 1000).toISOString() };
  if (heading !== undefined) body.heading = heading;
  const res = await postLocation(request, riderId, body);
  expect(res.status(), `ping for ${riderId} should be accepted`).toBe(200);
  return res.json();
}

// Opens the Geofence Monitor and searches the rider table for one rider, so
// pagination can never hide the QA rider.
export async function openGeofenceFor(page, riderId) {
  await page.goto('/#/geofence');
  const search = page.getByPlaceholder('Search rider, city, vehicle, tracking...');
  await expect(search).toBeVisible({ timeout: 30_000 });
  await search.fill(riderId);
  await expect(page.getByTestId(`rider-id-${riderId}`)).toBeVisible();
}

// The table cells for one rider (data-testid hooks in MonitorParcel.jsx).
export function riderRow(page, riderId) {
  return {
    signal: page.getByTestId(`rider-signal-${riderId}`),     // "Live GPS Ping" / "Approximate"
    boundary: page.getByTestId(`rider-boundary-${riderId}`), // "Inside Geofence" / "In Transit"
    distance: page.getByTestId(`rider-distance-${riderId}`), // "850 m to hub" / "3.9 km to hub"
    marker: page.getByTestId(`map-rider-${riderId}`),        // the rider's pin on the map
  };
}

// "850 m to hub" -> 850, "3.9 km to hub" -> 3900.
export function distanceInMeters(text) {
  const m = /([\d.,]+)\s*(m|km)\b/.exec(text || '');
  if (!m) return NaN;
  const n = Number(m[1].replace(/,/g, ''));
  return m[2] === 'km' ? n * 1000 : n;
}

// The pin's position on the map in map-layer pixels (Leaflet moves the pin
// with a CSS translate3d). Panning the map does not change this value; only
// a new rider position does.
export async function markerPosition(marker) {
  return marker.evaluate((el) => {
    const icon = el.closest('.leaflet-marker-icon');
    const m = /translate3d\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px/.exec(icon ? icon.style.transform : '');
    return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
  });
}
