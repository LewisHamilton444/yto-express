// ============================================================================
// Automatic mock GPS — drives QA riders along Bulacan roads so the Geofence
// Monitor (#/geofence) can be watched moving in real time.
//
//   cd server
//   node scripts/mock/simulateScenario.js <scenario> [--interval 3000] [--loop] [--stale 5]
//
// Scenarios:
//   leave-hub      YTOR20260001 starts at the hub and drives out past 2.5 km
//   enter-hub      YTOR20260001 starts near Plaridel and drives into the hub
//   delivery-loop  YTOR20260001 drives hub → Malolos → back to the hub
//   multi          YTOR20260001 and YTOR20260002 move at the same time
//
// Options:
//   --interval <ms>  time between pings (default 3000, minimum 500)
//   --loop           start the route again when it ends
//   --stale <n>      send n pings per rider, then STOP and count down the
//                    60-second limit so you can watch the rider turn
//                    "Approximate" on the map
//
// Stop any time with Ctrl+C. The target server is BASE_URL in mockGps.js.
// ============================================================================
const {
  BASE_URL, PLACES, buildRoute, describeDistance, requireBridgeKey, sendPing,
} = require('./mockGps');

// The map counts a ping as "Live" for this long (LIVE_PING_MAX_AGE_MS in
// src/utils/riderGps.js).
const LIVE_LIMIT_MS = 60 * 1000;
const STEPS_PER_LEG = 4; // points added between two road corners

// Approximate turning points along real roads.
const ROADS = {
  hubToMalolos: [
    PLACES.hub,                       // YTO Pulilan Main Sorting Hub
    { lat: 14.8975, lng: 120.8040 },  // Dampol II-B road
    { lat: 14.8900, lng: 120.8000 },  // join MacArthur Highway
    { lat: 14.8790, lng: 120.8020 },  // MacArthur Hwy southbound
    { lat: 14.8680, lng: 120.8060 },  // Longos / Bulihan area
    { lat: 14.8560, lng: 120.8110 },  // Malolos approach
    PLACES.malolos,                   // Malolos city proper
  ],
  plaridelToHub: [
    { lat: 14.8870, lng: 120.8570 },  // Plaridel (about 5.6 km out)
    { lat: 14.8935, lng: 120.8520 },  // Plaridel-Pulilan road
    { lat: 14.8990, lng: 120.8490 },  // Pulilan town proper
    { lat: 14.9050, lng: 120.8350 },  // Pulilan Regional Road westbound
    { lat: 14.9103, lng: 120.8152 },  // NLEX Pulilan interchange
    { lat: 14.9060, lng: 120.8100 },  // Dampol II-B
    PLACES.hub,
  ],
};

const SCENARIOS = {
  'leave-hub': [
    { riderId: 'YTOR20260001', label: 'leaves the hub toward Malolos', waypoints: ROADS.hubToMalolos.slice(0, 6) },
  ],
  'enter-hub': [
    { riderId: 'YTOR20260001', label: 'drives from Plaridel into the hub', waypoints: ROADS.plaridelToHub },
  ],
  'delivery-loop': [
    {
      riderId: 'YTOR20260001',
      label: 'hub → Malolos delivery → back to the hub',
      waypoints: [...ROADS.hubToMalolos, ...ROADS.hubToMalolos.slice(0, -1).reverse()],
    },
  ],
  multi: [
    { riderId: 'YTOR20260001', label: 'hub → Malolos', waypoints: ROADS.hubToMalolos },
    { riderId: 'YTOR20260002', label: 'Plaridel → hub', waypoints: ROADS.plaridelToHub },
  ],
};

function usage(problem) {
  if (problem) console.error(`\n${problem}\n`);
  console.log('Usage: node scripts/mock/simulateScenario.js <scenario> [--interval 3000] [--loop] [--stale 5]');
  console.log('\nScenarios:');
  Object.entries(SCENARIOS).forEach(([name, riders]) => {
    console.log(`  ${name.padEnd(14)} ${riders.map((r) => `${r.riderId} ${r.label}`).join('; ')}`);
  });
  process.exit(1);
}

// Reads the command line into { scenario, intervalMs, loop, staleAfter }.
function readOptions(args) {
  const scenario = args[0];
  if (!scenario || !SCENARIOS[scenario]) usage(scenario ? `Unknown scenario "${scenario}".` : 'Missing <scenario>.');
  const options = { scenario, intervalMs: 3000, loop: false, staleAfter: null };
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--loop') {
      options.loop = true;
    } else if (arg === '--interval' || arg === '--stale') {
      const n = Number(args[i + 1]);
      if (!Number.isInteger(n) || (arg === '--interval' ? n < 500 : n < 1)) {
        usage(arg === '--interval' ? '--interval needs a whole number of milliseconds, at least 500.' : '--stale needs a whole number of pings, at least 1.');
      }
      if (arg === '--interval') options.intervalMs = n; else options.staleAfter = n;
      i += 1;
    } else {
      usage(`Unknown option "${arg}".`);
    }
  }
  return options;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const options = readOptions(process.argv.slice(2));
  requireBridgeKey();

  const riders = SCENARIOS[options.scenario].map((r) => ({ ...r, route: buildRoute(r.waypoints, STEPS_PER_LEG) }));
  const routeLength = Math.max(...riders.map((r) => r.route.length));
  const stats = { sent: 0, failed: 0 };
  let stopping = false;

  // Ctrl+C: finish cleanly with a short summary.
  process.on('SIGINT', () => {
    if (stopping) process.exit(0);
    stopping = true;
    console.log(`\nStopped. ${stats.sent} ping(s) sent, ${stats.failed} failed.`);
    process.exit(0);
  });

  console.log(`Scenario "${options.scenario}" → ${BASE_URL}  (every ${options.intervalMs / 1000}s${options.loop ? ', looping' : ''}${options.staleAfter ? `, stale after ${options.staleAfter} ping(s)` : ''})`);
  riders.forEach((r) => console.log(`  ${r.riderId}: ${r.label} (${r.route.length} points)`));
  console.log('Press Ctrl+C to stop.\n');

  let step = 0;
  let pingsPerRider = 0;
  while (!stopping) {
    // One ping per rider for this step, all at the same time. A rider whose
    // route is shorter keeps sending its last point, like a parked rider.
    await Promise.all(riders.map(async (rider) => {
      const point = rider.route[Math.min(step, rider.route.length - 1)];
      const where = `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}  heading ${String(point.heading).padStart(3)}°  ${describeDistance(point)}`;
      const time = new Date().toLocaleTimeString();
      try {
        const { status, body } = await sendPing(rider.riderId, point, point.heading);
        if (status >= 400) throw new Error(`${status} ${body && body.error ? body.error : ''}`.trim());
        stats.sent += 1;
        console.log(`[${time}] ${rider.riderId} ${String(step + 1).padStart(2)}/${rider.route.length}  ${where}  ok`);
      } catch (err) {
        stats.failed += 1;
        console.log(`[${time}] ${rider.riderId} ${String(step + 1).padStart(2)}/${rider.route.length}  ${where}  FAILED: ${err.message}`);
      }
    }));
    pingsPerRider += 1;
    step += 1;

    if (options.staleAfter && pingsPerRider >= options.staleAfter) {
      await staleCountdown();
      break;
    }
    if (step >= routeLength) {
      if (!options.loop) { console.log('\n--- Route finished ---'); break; }
      console.log('--- Route finished, starting again ---');
      step = 0;
    }
    await sleep(options.intervalMs);
  }
  console.log(`${stats.sent} ping(s) sent, ${stats.failed} failed.`);
}

// --stale: no more pings. Count down until the last ping is older than the
// map's 60-second limit, then the rider should show as "Approximate".
async function staleCountdown() {
  const lastPingAt = Date.now();
  console.log(`\n--stale: pings STOPPED. The map keeps the rider "Live" for ${LIVE_LIMIT_MS / 1000} s after the last ping.`);
  while (Date.now() - lastPingAt < LIVE_LIMIT_MS + 3000) {
    const left = Math.ceil((LIVE_LIMIT_MS - (Date.now() - lastPingAt)) / 1000);
    console.log(left > 0 ? `  ${left} s until the signal goes stale...` : '  Past the limit — waiting for the next 3 s map refresh...');
    await sleep(5000);
  }
  console.log('Now the Geofence Monitor should show the rider as "Approximate" (no live GPS).');
}

main();
