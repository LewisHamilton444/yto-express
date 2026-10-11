// Test 4 — the GPS route rejects requests it should not trust.
// API only (no browser, no login): these call the backend directly.
import { test, expect } from '@playwright/test';
import { postLocation } from './helpers.js';
import { BRIDGE_API_KEY } from './env.js';

const RIDER = 'YTOR20260001';
const HUB = { latitude: 14.9027, longitude: 120.8073 };
const withKey = { 'x-bridge-api-key': BRIDGE_API_KEY };

test('a ping without the bridge key is refused with 401', async ({ request }) => {
  const res = await postLocation(request, RIDER, HUB, {});
  expect(res.status()).toBe(401);
});

test('a ping with a wrong bridge key is refused with 401', async ({ request }) => {
  const res = await postLocation(request, RIDER, HUB, { 'x-bridge-api-key': 'not-the-real-key' });
  expect(res.status()).toBe(401);
});

test('invalid coordinates are refused with 400', async ({ request }) => {
  test.skip(!BRIDGE_API_KEY, 'Needs the bridge key to get past the 401 check.');
  for (const body of [
    { latitude: 999, longitude: 120.8073 },   // latitude must be -90..90
    { latitude: 14.9027, longitude: 999 },    // longitude must be -180..180
    { latitude: 'abc', longitude: 120.8073 }, // not a number
    { longitude: 120.8073 },                  // latitude missing
  ]) {
    const res = await postLocation(request, RIDER, body, withKey);
    expect(res.status(), JSON.stringify(body)).toBe(400);
  }
});

test('a phone timestamp far in the future is replaced by server time', async ({ request }) => {
  test.skip(!BRIDGE_API_KEY, 'Needs the bridge key.');
  const tenMinutesAhead = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const res = await postLocation(request, RIDER, { ...HUB, timestamp: tenMinutesAhead }, withKey);
  expect(res.status()).toBe(200);
  const { lastLocation } = await res.json();
  const skewSeconds = Math.abs(new Date(lastLocation.recordedAt).getTime() - Date.now()) / 1000;
  expect(skewSeconds).toBeLessThan(30);
});
