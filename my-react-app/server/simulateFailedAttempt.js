// ============================================================================
// Failed delivery simulator — acts like the rider app reporting one failed
// delivery, so the web side can be tested before the Android app is connected.
//
//   cd server
//   node simulateFailedAttempt.js <trackingNumber> "<reason>" [riderId]
//
// Example (run it 3 times on the same parcel to see it become "Returned to Hub"):
//   node simulateFailedAttempt.js YTO123456789 "Recipient not available" YTOR20260001
//
// It sends ONE request to
//   POST {BASE_URL}/api/parcels/:trackingNumber/failed-attempt
// exactly like the rider app will, and prints the server's answer.
// The parcel must be "Out for Delivery" (or already "Failed Attempt").
// ============================================================================
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { FAILED_ATTEMPT_REASONS } = require('./utils/deliveryAttempts');

// ── Settings ────────────────────────────────────────────────────────────────
// Local test:  'http://localhost:3001'
// Live site:   'https://yto-express-backend.onrender.com'
const BASE_URL = 'http://localhost:3001';
const DEFAULT_RIDER_ID = 'YTOR20260001';

// Same secret the server checks (BRIDGE_API_KEY in server/.env). For the live
// site it must match the BRIDGE_API_KEY set on Render.
const BRIDGE_API_KEY = process.env.BRIDGE_API_KEY;

// A spot near the YTO Pulilan hub, so the attempt has a location.
const SAMPLE_LOCATION = { lat: 14.8995, lng: 120.8490 };

function printUsage() {
  console.log('Usage: node simulateFailedAttempt.js <trackingNumber> "<reason>" [riderId]');
  console.log('Allowed reasons:');
  FAILED_ATTEMPT_REASONS.forEach((r) => console.log(`  - ${r}`));
}

async function main() {
  const [trackingNumber, reason, riderId = DEFAULT_RIDER_ID] = process.argv.slice(2);

  if (!trackingNumber || !reason) {
    printUsage();
    process.exit(1);
  }
  if (!FAILED_ATTEMPT_REASONS.includes(reason)) {
    console.error(`"${reason}" is not an allowed reason.`);
    printUsage();
    process.exit(1);
  }
  if (!BRIDGE_API_KEY) {
    console.error('BRIDGE_API_KEY is missing. Add it to server/.env (same value the server uses).');
    process.exit(1);
  }

  const url = `${BASE_URL}/api/parcels/${encodeURIComponent(trackingNumber)}/failed-attempt`;
  const body = {
    riderId,
    reason,
    notes: 'Sent by simulateFailedAttempt.js',
    lat: SAMPLE_LOCATION.lat,
    lng: SAMPLE_LOCATION.lng,
    timestamp: new Date().toISOString(),
  };

  console.log(`POST ${url}`);
  console.log('Body:', JSON.stringify(body, null, 2));

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bridge-api-key': BRIDGE_API_KEY },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    console.log(`\nServer answered ${res.status}:`);
    console.log(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
    if (!res.ok) process.exit(1);
  } catch (err) {
    console.error(`\nCould not reach ${BASE_URL}: ${err.message}`);
    console.error('Is the server running? (cd server && npm start)');
    process.exit(1);
  }
}

main();
