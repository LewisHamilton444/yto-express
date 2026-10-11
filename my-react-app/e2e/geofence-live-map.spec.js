// Test 1 — the Geofence Monitor reacts to a rider's live GPS pings.
import { test, expect } from '@playwright/test';
import { PLACES, sendPing, openGeofenceFor, riderRow, distanceInMeters, markerPosition } from './helpers.js';

const RIDER = 'YTOR20260001';

test('a ping at the hub shows Inside Geofence + Live; a ping 4 km away shows outside and moves the pin', async ({ page, request }) => {
  await openGeofenceFor(page, RIDER);
  const row = riderRow(page, RIDER);

  // 1. Rider at the hub center.
  await sendPing(request, RIDER, PLACES.hub);
  await expect(row.signal).toHaveText(/Live GPS Ping/);
  await expect(row.boundary).toHaveText(/Inside Geofence/);
  await expect.poll(async () => distanceInMeters(await row.distance.textContent())).toBeLessThan(100);
  await expect(row.marker).toBeAttached();
  const pinAtHub = await markerPosition(row.marker);

  // 2. Same rider about 4 km away, outside the 2.5 km geofence.
  await sendPing(request, RIDER, PLACES.outside, { heading: 185 });
  await expect(row.boundary).toHaveText(/In Transit/);
  await expect(row.boundary).not.toHaveText(/Inside Geofence/);
  await expect(row.signal).toHaveText(/Live GPS Ping/);
  await expect.poll(async () => distanceInMeters(await row.distance.textContent())).toBeGreaterThan(2500);

  // 3. The pin on the map moved (it glides there, so poll until it differs).
  await expect.poll(async () => {
    const now = await markerPosition(row.marker);
    return now && pinAtHub ? Math.hypot(now.x - pinAtHub.x, now.y - pinAtHub.y) : 0;
  }).toBeGreaterThan(5);
});
