// Test 3 — a rider whose pings stop is no longer shown as "Live".
// The map counts a ping as live for 60 seconds (LIVE_PING_MAX_AGE_MS in
// src/utils/riderGps.js).
import { test, expect } from '@playwright/test';
import { PLACES, sendPing, openGeofenceFor, riderRow } from './helpers.js';
import { RUN_SLOW_TESTS } from './env.js';

const RIDER = 'YTOR20260001';
const LIVE_LIMIT_SECONDS = 60;

// Fast version: a ping whose phone timestamp is 2 minutes old is already past
// the limit, so the very next refresh shows the rider as not live.
test('a ping older than 60 seconds shows Approximate, not Live', async ({ page, request }) => {
  await openGeofenceFor(page, RIDER);
  const row = riderRow(page, RIDER);

  await sendPing(request, RIDER, PLACES.hub);
  await expect(row.signal).toHaveText(/Live GPS Ping/);

  await sendPing(request, RIDER, PLACES.hub, { secondsAgo: 2 * LIVE_LIMIT_SECONDS });
  await expect(row.signal).toHaveText(/Approximate/);
  await expect(row.signal).not.toHaveText(/Live/);
  // QA riders have no city to fall back on, so the pin leaves the map.
  await expect(row.marker).toHaveCount(0);
});

// Real-time version: send one ping, stop, and wait out the 60 seconds.
// Off by default because it takes over a minute; run with E2E_SLOW=1.
test('after pings stop, the rider stops being Live within about a minute', async ({ page, request }) => {
  test.skip(!RUN_SLOW_TESTS, 'Slow test (about 70 s). Run with E2E_SLOW=1.');
  test.setTimeout(150_000);
  await openGeofenceFor(page, RIDER);
  const row = riderRow(page, RIDER);

  await sendPing(request, RIDER, PLACES.hub);
  await expect(row.signal).toHaveText(/Live GPS Ping/);
  const stoppedAt = Date.now();

  // Still live well inside the limit...
  await page.waitForTimeout((LIVE_LIMIT_SECONDS - 20) * 1000);
  await expect(row.signal).toHaveText(/Live GPS Ping/);

  // ...and not live shortly after it (limit + one 3-second refresh + margin).
  await expect(row.signal).toHaveText(/Approximate/, { timeout: 40_000 });
  const seconds = Math.round((Date.now() - stoppedAt) / 1000);
  expect(seconds).toBeGreaterThanOrEqual(LIVE_LIMIT_SECONDS - 1);
  test.info().annotations.push({ type: 'stale after', description: `${seconds} s` });
});
