// Test 2 — automatic movement: five pings along a road, a few seconds apart.
// Every refresh of the Geofence Monitor must show a new distance to the hub.
import { test, expect } from '@playwright/test';
import { PLACES, ROUTE_TO_MALOLOS, sendPing, openGeofenceFor, riderRow, distanceInMeters } from './helpers.js';

const RIDER = 'YTOR20260002';
const SECONDS_BETWEEN_PINGS = 4; // a bit longer than the page's 3-second refresh

test('the distance to the hub changes after every ping', async ({ page, request }) => {
  test.setTimeout(120_000);
  await openGeofenceFor(page, RIDER);
  const row = riderRow(page, RIDER);
  const readDistance = async () => distanceInMeters(await row.distance.textContent());

  // Start at the hub so the first move is a real change.
  await sendPing(request, RIDER, PLACES.hub);
  await expect.poll(readDistance).toBeLessThan(100);
  let previous = await readDistance();

  for (const [i, point] of ROUTE_TO_MALOLOS.entries()) {
    await page.waitForTimeout(SECONDS_BETWEEN_PINGS * 1000);
    await sendPing(request, RIDER, point);
    await expect.poll(readDistance, { message: `ping ${i + 1} should change the distance` }).not.toBe(previous);
    const current = await readDistance();
    expect(current, `ping ${i + 1} is farther from the hub than the one before`).toBeGreaterThan(previous);
    await expect(row.signal).toHaveText(/Live GPS Ping/);
    previous = current;
  }
  // The route ends well outside the 2.5 km geofence.
  await expect(row.boundary).toHaveText(/In Transit/);
});
