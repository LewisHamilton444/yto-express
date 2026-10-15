// ============================================================================
// Hub directory parity check (D-6 / G-10 / G-29).  Run: npm run qa:hubs
// ----------------------------------------------------------------------------
// The portal used to carry ONE hub while the app seeds ten. That disagreement
// is not cosmetic: a parcel's destination hub, the hub intake list and the sort
// code printed on a label all resolve from this directory, so a missing branch
// means a real shipment is attributed to a hub that does not exist.
//
// This reads the app's defaultHubRows() out of its source (the function is not
// exported), and compares every row against the portal's LOGISTICS_HUBS on the
// fields that must be identical for operations to line up: the hub id, its
// municipality, its address and its coordinates. Textual extraction is
// deliberate — it re-checks the LIVE app source on every run, so editing the
// app's directory without updating the portal breaks this check instead of
// silently shipping two different hub maps.
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { LOGISTICS_HUBS } from '../../../src/hubGeofenceData.js';
import { resolveDestinationHub } from '../../../src/services/waybill.js';

const APP_CONTROLLER = process.env.APP_HUB_CONTROLLER
  || 'C:/Users/ADMIN/AndroidStudioProjects/YTO_Express_App/yto_express_backend/controllers/hubController.js';

let checks = 0;
let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  checks += 1;
  if (!ok) {
    failures += 1;
    console.log(`  FAIL ${label}\n       app:    ${JSON.stringify(expected)}\n       portal: ${JSON.stringify(actual)}`);
  } else {
    console.log(`  ok  ${label}`);
  }
}

// Parse `branch('hubId', 'Name', 'Address', 'Municipality', lat, lng)` rows.
function appRows() {
  const src = fs.readFileSync(APP_CONTROLLER, 'utf8');
  const start = src.indexOf('function defaultHubRows');
  if (start === -1) throw new Error('defaultHubRows not found in the app hub controller — update this checker');
  const end = src.indexOf('\nfunction ', start + 10);
  const body = src.slice(start, end === -1 ? undefined : end);

  const rows = [];
  const branchRe = /branch\('([^']*)',\s*'([^']*)',\s*'([^']*)',\s*\n?\s*'([^']*)',\s*([\d.]+),\s*([\d.]+)\)/g;
  let m;
  while ((m = branchRe.exec(body)) !== null) {
    rows.push({ hubId: m[1], name: m[2], address: m[3], municipality: m[4], lat: Number(m[5]), lng: Number(m[6]) });
  }

  // The central hub is an object literal, not a branch() call.
  const central = {};
  const pick = (key) => {
    const re = new RegExp(`${key}:\\s*'([^']*)'`);
    const hit = body.match(re);
    return hit ? hit[1] : null;
  };
  central.hubId = pick('hubId');
  central.name = pick('name');
  central.municipality = pick('municipality');
  central.address = pick('address');
  const lat = body.match(/latitude:\s*([\d.]+)/);
  const lng = body.match(/longitude:\s*([\d.]+)/);
  central.lat = lat ? Number(lat[1]) : null;
  central.lng = lng ? Number(lng[1]) : null;

  if (!rows.length || !central.hubId) {
    throw new Error('no hub rows parsed from the app — the source shape changed');
  }
  return [central, ...rows];
}

console.log('hub parity: portal directory vs the app\'s defaultHubRows()\n');

const appHubs = appRows();
console.log(`parsed ${appHubs.length} app hub row(s); portal has ${LOGISTICS_HUBS.length}\n`);

check('the portal lists the same number of hubs as the app', LOGISTICS_HUBS.length, appHubs.length);

const portalById = new Map(LOGISTICS_HUBS.map((h) => [h.hubId, h]));

for (const appHub of appHubs) {
  const portalHub = portalById.get(appHub.hubId);
  if (!portalHub) {
    check(`hub ${appHub.hubId} exists in the portal`, portalHub, { hubId: appHub.hubId });
    continue;
  }
  // The portal keeps the app's name verbatim; the central hub carries the brand
  // prefix in its display label, so that one comparison allows it.
  const nameOk = portalHub.hubName === appHub.name || portalHub.hubName === `YTO ${appHub.name}`;
  check(`hub ${appHub.hubId} name`, nameOk, true);
  check(`hub ${appHub.hubId} municipality`, portalHub.municipality, appHub.municipality);
  check(`hub ${appHub.hubId} address`, portalHub.address, appHub.address);
  check(`hub ${appHub.hubId} lat`, portalHub.coordinates.lat, appHub.lat);
  check(`hub ${appHub.hubId} lng`, portalHub.coordinates.lng, appHub.lng);
}

// Every portal hub needs a sort code, and it must be the code the waybill
// resolver actually prints for that hub's own municipality — otherwise the hub
// list and the printed label disagree about where a parcel is sorted.
const seenCodes = new Set();
for (const hub of LOGISTICS_HUBS) {
  check(`hub ${hub.hubId} declares a sort code`, typeof hub.sortCode === 'string' && hub.sortCode.length > 0, true);
  seenCodes.add(hub.sortCode);
  const resolved = resolveDestinationHub(hub.municipality || '');
  check(`hub ${hub.hubId} sort code matches the waybill resolver for ${hub.municipality}`, hub.sortCode, resolved.code);
}
check('no two hubs share a sort code', seenCodes.size, LOGISTICS_HUBS.length);

// Exactly one central hub, like the app's directory.
check('exactly one hub is marked central', LOGISTICS_HUBS.filter((h) => h.isCentralHub).length, 1);

console.log(`\n${checks - failures}/${checks} hub parity checks passed.`);
if (failures > 0) process.exit(1);
