// ============================================================================
// Gate check for the Web-side bridge reconciler (server/utils/bridgeReconcile).
// ----------------------------------------------------------------------------
//   cd server && npm run qa:gates      (or: node scripts/qa/bridgeReconcileGates.js)
//
// This backend has no Jest suite, so this script exercises the pure gates that
// decide whether a pulled record is applied, using node:assert only (no new
// dependencies). The gates are the loop guard: a gate that returns true for a
// value the apply path will not write re-applies the same row on every poll,
// and a gate that ignores a field the apply path DOES write loses the change.
// Both failure modes are asserted against below.
//
// Exits non-zero on the first failure, so it can act as a regression gate.
// ============================================================================

const assert = require('node:assert/strict');
const {
  parcelDiffers,
  userDiffers,
  issueDiffers,
  newerThan,
  nextCursor,
  ISSUE_STATUSES,
} = require('../../utils/bridgeReconcile');

let checks = 0;
function check(label, fn) {
  fn();
  checks += 1;
  console.log(`  ok  ${label}`);
}

const parcel = (over = {}) => ({
  trackingNumber: 'YTO2026000001',
  senderName: 'Merl Store',
  receiverName: 'Ana Cruz',
  destination: 'Pulilan, Bulacan',
  origin: 'Malolos, Bulacan',
  item: 'Phone case',
  weight: '2',
  status: 'Pending',
  notes: '',
  senderPhone: '9170000001',
  receiverPhone: '9170000002',
  senderEmail: 'merl@example.com',
  recipientEmail: 'ana@example.com',
  deliveryFee: 120,
  dimensions: { length: 20, width: 10, height: 5 },
  podPhoto: '',
  deliveryAttempts: [],
  updatedAt: '2026-10-12T00:00:00.000Z',
  ...over,
});

console.log('bridgeReconcile gates');

// ── newerThan / nextCursor ──────────────────────────────────────────────
check('newerThan: strictly newer remote wins', () => {
  assert.equal(newerThan('2026-10-12T00:00:01.000Z', '2026-10-12T00:00:00.000Z'), true);
});
check('newerThan: equal timestamps are not newer (LWW stop)', () => {
  assert.equal(newerThan('2026-10-12T00:00:00.000Z', '2026-10-12T00:00:00.000Z'), false);
});
check('newerThan: unusable remote timestamp never applies', () => {
  assert.equal(newerThan('not-a-date', '2026-10-12T00:00:00.000Z'), false);
});
check('newerThan: missing local timestamp means the remote is the only value', () => {
  assert.equal(newerThan('2026-10-12T00:00:00.000Z', null), true);
});
check('nextCursor: max updatedAt minus the 1s overlap boundary', () => {
  assert.equal(nextCursor('2026-10-12T00:00:10.000Z').toISOString(), '2026-10-12T00:00:09.000Z');
});
check('nextCursor: no records -> no advance', () => {
  assert.equal(nextCursor(null), null);
  assert.equal(nextCursor(undefined), null);
});

// ── parcelDiffers ───────────────────────────────────────────────────────
check('parcelDiffers: remote row with no local row always applies (create)', () => {
  assert.equal(parcelDiffers(parcel(), null, undefined), true);
});
check('parcelDiffers: identical content is skipped (loop stop)', () => {
  assert.equal(parcelDiffers(parcel(), parcel(), undefined), false);
});
check('parcelDiffers: status change applies', () => {
  assert.equal(parcelDiffers(parcel({ status: 'In Transit' }), parcel(), undefined), true);
});
check('parcelDiffers: status outside the stored vocabulary is skipped, never coerced', () => {
  assert.equal(parcelDiffers(parcel({ status: 'Teleported' }), parcel(), undefined), false);
});
check('parcelDiffers: blank remote fields never blank the stored row', () => {
  const local = parcel({ notes: 'Fragile', senderEmail: 'merl@example.com' });
  assert.equal(parcelDiffers(parcel({ notes: '', senderEmail: '' }), local, undefined), false);
});
check('parcelDiffers: receiverPhone compares against receiverPhone (not recipientPhone)', () => {
  assert.equal(parcelDiffers(parcel({ recipientPhone: '999' }), parcel(), undefined), true);
});
check('parcelDiffers: phone formatting alone is not a difference', () => {
  assert.equal(parcelDiffers(parcel({ senderPhone: '+63 917 000 0001' }), parcel(), undefined), false);
});
check('parcelDiffers: a fee correction to zero is a real change', () => {
  assert.equal(parcelDiffers(parcel({ deliveryFee: 0 }), parcel(), undefined), true);
});
check('parcelDiffers: dimensions are compared per axis', () => {
  assert.equal(parcelDiffers(parcel({ dimensions: { length: 21, width: 10, height: 5 } }), parcel(), undefined), true);
});
check('parcelDiffers: unusable remote date is not a difference', () => {
  assert.equal(parcelDiffers(parcel({ estimatedDeliveryDate: 'nonsense' }), parcel(), undefined), false);
});
check('parcelDiffers: courier reassignment applies', () => {
  assert.equal(parcelDiffers(parcel({ riderEmail: 'rider@example.com' }), parcel(), 'YTOR20260001'), true);
});
check('parcelDiffers: same courier is not a difference', () => {
  const local = parcel({ riderId: 'YTOR20260001' });
  assert.equal(parcelDiffers(parcel(), local, 'YTOR20260001'), false);
});
check('parcelDiffers: an unresolvable courier email leaves the assignment alone', () => {
  const local = parcel({ riderId: 'YTOR20260001' });
  assert.equal(parcelDiffers(parcel(), local, undefined), false);
});
check('parcelDiffers: a new delivery attempt applies', () => {
  const local = parcel({ deliveryAttempts: [{ attemptNumber: 1, attemptedAt: '2026-10-11T00:00:00.000Z' }] });
  const remote = parcel({ deliveryAttempts: [{ attemptNumber: 1, attemptedAt: '2026-10-11T00:00:00.000Z' }, { attemptNumber: 2, attemptedAt: '2026-10-12T00:00:00.000Z' }] });
  assert.equal(parcelDiffers(remote, local, undefined), true);
});

// ── userDiffers ─────────────────────────────────────────────────────────
const sellerRow = (over = {}) => ({
  fullName: 'Merl Store', email: 'merl@example.com', phone: '9170000001',
  storeName: 'Merl Mart', warehouseAddress: 'Malolos', operatingHours: '8-5',
  ...over,
});

check('userDiffers: store name change applies', () => {
  assert.equal(userDiffers({ storeName: 'MerlMart 2' }, sellerRow(), 'seller'), true);
});
check('userDiffers: identical profile is skipped (loop stop)', () => {
  assert.equal(userDiffers({ name: 'Merl Store', storeName: 'Merl Mart' }, sellerRow(), 'seller'), false);
});
check('userDiffers: blank remote fields are ignored, not applied', () => {
  assert.equal(userDiffers({ storeName: '', warehouseAddress: '' }, sellerRow(), 'seller'), false);
});
check('userDiffers: rider wire names map to the rider columns', () => {
  const rider = { riderName: 'Rico', phone: '9170000003', vehicleType: 'Motorcycle', vehiclePlate: 'ABC 123' };
  assert.equal(userDiffers({ vehicleModel: 'Van' }, rider, 'rider'), true);
  assert.equal(userDiffers({ plateNumber: 'ABC 123' }, rider, 'rider'), false);
});
check('userDiffers: an unknown role never applies', () => {
  assert.equal(userDiffers({ name: 'X' }, {}, 'super_admin'), false);
});

// ── issueDiffers ────────────────────────────────────────────────────────
const ticket = (over = {}) => ({
  ticketId: 'TICK-2026-00001', trackingNumber: 'YTO2026000001',
  status: 'Open', adminNotes: '', description: 'Box arrived damaged',
  ...over,
});

check('issueDiffers: status change applies', () => {
  assert.equal(issueDiffers({ status: 'Resolved' }, ticket(), undefined), true);
});
check('issueDiffers: identical ticket is skipped (loop stop)', () => {
  assert.equal(issueDiffers({ status: 'Open', adminNotes: '' }, ticket(), undefined), false);
});
check('issueDiffers: blank adminNotes never clears a stored note', () => {
  assert.equal(issueDiffers({ adminNotes: '' }, ticket({ adminNotes: 'Waiting on photos' }), undefined), false);
});
check('issueDiffers: a real note applies', () => {
  assert.equal(issueDiffers({ adminNotes: 'Refund issued' }, ticket(), undefined), true);
});
check('issueDiffers: description drift applies', () => {
  assert.equal(issueDiffers({ description: 'Box arrived crushed' }, ticket(), undefined), true);
});

// ── shared vocabularies ─────────────────────────────────────────────────
// The apply loop skips any issue whose status is not in this list, so a status
// the app can emit but this list lacks is a silent, permanent loss of that
// decision. 'Rejected' was missing until 2026-10-12 for exactly that reason.
// The five below mirror the mobile app's own enum (A Issue.js:105 / its
// controller allowlist).
check('ISSUE_STATUSES covers every status the mobile app can emit', () => {
  const appStatuses = ['Open', 'Under Investigation', 'Resolved', 'Rejected', 'Closed'];
  const missing = appStatuses.filter((s) => !ISSUE_STATUSES.includes(s));
  assert.deepEqual(missing, [], `issue statuses the portal cannot represent: ${missing.join(', ')}`);
  assert.equal(new Set(ISSUE_STATUSES).size, ISSUE_STATUSES.length, 'ISSUE_STATUSES has duplicates');
});

console.log(`\n${checks} gate checks passed.`);
