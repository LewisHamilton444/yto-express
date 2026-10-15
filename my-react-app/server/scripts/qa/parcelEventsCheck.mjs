// ============================================================================
// Parcel timeline merge check (D-15).  Run: npm run qa:events
// ----------------------------------------------------------------------------
// sync-parcel carries the app's timeline rows. This exercises the two things
// that decide whether the portal's timeline stays correct over many syncs:
//   1. the app's row shape is translated (a row with no usable label or time is
//      dropped, never invented);
//   2. the merge is APPEND-ONLY — a re-sync of the same parcel must not
//      duplicate a row, an out-of-order push must still render in time order,
//      and a sync carrying no events must not erase the history already stored.
// These are the failure modes that would silently corrupt a parcel's history,
// which is the one thing on the drawer that cannot be reconstructed later.
// ============================================================================

import { mapAppEventsToWeb, mapAppEventToWeb, mergeEvents } from '../../utils/parcelEvents.js';

let checks = 0;
let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  checks += 1;
  if (!ok) {
    failures += 1;
    console.log(`  FAIL ${label}\n       expected: ${JSON.stringify(expected)}\n       actual:   ${JSON.stringify(actual)}`);
  } else {
    console.log(`  ok  ${label}`);
  }
}

console.log('parcel timeline merge check (D-15)\n');

// 1. Translation
console.log('1. the app row shape becomes the portal row shape');
check('description becomes event', mapAppEventToWeb({
  status: 'Out for Delivery', description: 'Courier arrived at the delivery point',
  location: 'Malolos', timestamp: '2026-10-12T02:00:00.000Z',
}), {
  time: '2026-10-12T02:00:00.000Z', event: 'Courier arrived at the delivery point',
  location: 'Malolos', status: 'Out for Delivery',
});
check('an already-portal-shaped row passes through', mapAppEventToWeb({
  status: 'In Transit', event: 'Picked up by courier', location: 'Pulilan', time: '2026-10-12T03:00:00.000Z',
}), {
  time: '2026-10-12T03:00:00.000Z', event: 'Picked up by courier', location: 'Pulilan', status: 'In Transit',
});
check('a row with no label is dropped', mapAppEventToWeb({ timestamp: '2026-10-12T02:00:00.000Z' }), null);
check('a row with an unusable time is dropped', mapAppEventToWeb({ description: 'Arrived', timestamp: 'not-a-date' }), null);
check('a non-row is dropped', mapAppEventToWeb('Arrived'), null);
check('a missing list maps to an empty list (never null)', mapAppEventsToWeb(undefined), []);

// 2. Append-only merge
console.log('\n2. the merge never loses or duplicates history');
const stored = [
  { time: '2026-10-12T01:00:00.000Z', event: 'Parcel registered by merchant', location: 'Pulilan', status: 'Pending' },
];
const arrival = mapAppEventsToWeb([{ status: 'Out for Delivery', description: 'Courier arrived at the delivery point', location: 'Malolos', timestamp: '2026-10-12T02:00:00.000Z' }]);

const firstMerge = mergeEvents(stored, arrival);
check('a new event is appended', firstMerge.added.length, 1);
check('the stored history is kept', firstMerge.events.length, 2);
check('the new event is the app one', firstMerge.events[1].event, 'Courier arrived at the delivery point');

const repeatMerge = mergeEvents(firstMerge.events, arrival);
check('re-syncing the same event adds nothing', repeatMerge.added.length, 0);
check('re-syncing the same event duplicates nothing', repeatMerge.events.length, 2);

const emptyMerge = mergeEvents(firstMerge.events, []);
check('a sync with no events erases nothing', emptyMerge.events.length, 2);
check('a sync with no events adds nothing', emptyMerge.added.length, 0);

// Out-of-order arrival (a doorstep delay pushed after a later status).
const older = mapAppEventsToWeb([{ description: 'Courier could not complete the stop yet (location delay)', timestamp: '2026-10-12T01:30:00.000Z' }]);
const ordered = mergeEvents(firstMerge.events, older);
check('an out-of-order event is inserted by time', ordered.events.map((e) => e.event), [
  'Parcel registered by merchant',
  'Courier could not complete the stop yet (location delay)',
  'Courier arrived at the delivery point',
]);

// A malformed row in the middle must not poison the batch.
const withGarbage = mapAppEventsToWeb([
  { description: 'Courier returned to the doorstep', timestamp: '2026-10-12T02:30:00.000Z' },
  null,
  { description: 'No time', timestamp: null },
]);
check('malformed rows are skipped, valid ones kept', withGarbage.length, 1);
check('the kept row is the valid one', withGarbage[0].event, 'Courier returned to the doorstep');

console.log(`\n${checks - failures}/${checks} parcel event checks passed.`);
if (failures > 0) process.exit(1);
