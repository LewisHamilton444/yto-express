// ============================================================================
// Manual mock GPS — sends ONE location ping for a rider, like the rider app.
//
//   cd server
//   node scripts/mock/pingRider.js <riderId> <lat> <lng> [heading]
//   node scripts/mock/pingRider.js <riderId> --place <hub|edge|outside|malolos|baliwag> [heading]
//
// Examples:
//   node scripts/mock/pingRider.js YTOR20260001 --place hub
//   node scripts/mock/pingRider.js YTOR20260001 14.8680 120.8040 200
//
// The target server is BASE_URL in scripts/mock/mockGps.js.
// The map counts a ping as "Live" for 60 seconds.
// ============================================================================
const {
  BASE_URL, HUB, HUB_RADIUS_M, PLACES, geofenceCheck, requireBridgeKey, sendPing,
} = require('./mockGps');

function usage(problem) {
  if (problem) console.error(`\n${problem}\n`);
  console.log('Usage:');
  console.log('  node scripts/mock/pingRider.js <riderId> <lat> <lng> [heading]');
  console.log('  node scripts/mock/pingRider.js <riderId> --place <name> [heading]');
  console.log('\nPlaces:');
  Object.entries(PLACES).forEach(([name, p]) => console.log(`  ${name.padEnd(8)} ${p.label}`));
  console.log('\nExample: node scripts/mock/pingRider.js YTOR20260001 --place hub');
  process.exit(1);
}

// Reads a number and checks its range; stops with a usage message if wrong.
function readNumber(text, name, min, max) {
  const n = Number(text);
  if (text === undefined || text.trim() === '' || !Number.isFinite(n) || n < min || n > max) {
    usage(`${name} must be a number from ${min} to ${max} (got "${text}").`);
  }
  return n;
}

async function main() {
  const args = process.argv.slice(2);
  const riderId = args[0];
  if (!riderId || riderId.startsWith('-')) usage('Missing <riderId>.');

  let point;
  let headingText;
  if (args[1] === '--place') {
    const place = PLACES[String(args[2] || '').toLowerCase()];
    if (!place) usage(`Unknown place "${args[2] || ''}".`);
    point = { lat: place.lat, lng: place.lng };
    headingText = args[3];
    if (args.length > 4) usage('Too many arguments.');
  } else {
    point = { lat: readNumber(args[1], 'Latitude', -90, 90), lng: readNumber(args[2], 'Longitude', -180, 180) };
    headingText = args[3];
    if (args.length > 4) usage('Too many arguments.');
  }
  const heading = headingText === undefined ? undefined : readNumber(headingText, 'Heading', 0, 359);

  requireBridgeKey();

  const { meters, inside } = geofenceCheck(point);
  console.log(`Rider:    ${riderId}`);
  console.log(`Point:    ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}${heading !== undefined ? `  heading ${heading}°` : ''}`);
  console.log(`Geofence: ${Math.round(meters).toLocaleString('en-US')} m from ${HUB.name} → ${inside ? 'INSIDE' : 'OUTSIDE'} (radius ${HUB_RADIUS_M.toLocaleString('en-US')} m)`);
  console.log(`Sending:  POST ${BASE_URL}/api/riders/${riderId}/location`);

  try {
    const { status, body } = await sendPing(riderId, point, heading);
    console.log(`\nServer answered ${status}:`);
    console.log(typeof body === 'string' ? body : JSON.stringify(body, null, 2));
    if (status >= 400) process.exit(1);
    console.log('\nThe Geofence Monitor shows it within 3 seconds; it stays "Live" for 60 seconds.');
  } catch (err) {
    console.error(`\nCould not reach ${BASE_URL}: ${err.message}`);
    console.error('Is the server running? (cd server && npm start)');
    process.exit(1);
  }
}

main();
