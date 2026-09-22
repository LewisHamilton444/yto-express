// ══════════════════════════════════════════════════════════════════════════
// READ-ONLY Web database audit (2026-09-18)
// ---------------------------------------------------------------------------
// Inspects the Web MongoDB for demo / synthetic / placeholder rows across every
// collection the admin portal reads, and reports which tabs would show data
// that is not real. It NEVER writes: no updateOne, no deleteMany, no upserts.
//
//   node audit_web_db.js
// ══════════════════════════════════════════════════════════════════════════

const dns = require('node:dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const Account           = require('./models/Account');
const AdminNotification = require('./models/AdminNotification');
const Customer          = require('./models/Customer');
const Issue             = require('./models/Issue');
const Parcel            = require('./models/Parcel');
const ParcelLocation    = require('./models/ParcelLocation');
const Rider             = require('./models/Rider');
const Seller            = require('./models/Seller');

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('[Audit Error] MONGO_URI is required (server/.env or environment).');
  process.exit(1);
}

const DEMO_EMAILS = ['seller@gmail.com', 'customer@gmail.com', 'rider@gmail.com'];
const TEST_ID = /TEST|E2E|DUMMY|SAMPLE|MOCK|PLACEHOLDER/i;

const DEMO_RIDER_PLATES = ['ABC-1234'];
const DEMO_RIDER_LICENSES = ['N01-23-456789'];
const DEMO_SELLER_IDS = ['YTOS2026DEMO1', 'PH-ID-98765'];
const DEMO_CUSTOMER_IDS = ['YTOC2026DEMO1'];
const DEMO_RIDER_IDS = ['YTOR2026DEMO1'];

function section(title) {
  console.log(`\n=== ${title} ===`);
}

async function main() {
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  console.log('Connected to Web MongoDB (read-only audit).');

  section('Row counts');
  console.log({
    Account: await Account.countDocuments(),
    Seller: await Seller.countDocuments(),
    Customer: await Customer.countDocuments(),
    Rider: await Rider.countDocuments(),
    Parcel: await Parcel.countDocuments(),
    ParcelLocation: await ParcelLocation.countDocuments(),
    Issue: await Issue.countDocuments(),
    AdminNotification: await AdminNotification.countDocuments(),
  });

  section('Accounts (admin users)');
  console.log(await Account.find({}).select('email role adminId status accountCategory').lean());

  section('Demo-email rows still present');
  const demoSellers = await Seller.find({ email: { $in: DEMO_EMAILS } }).select('email registrationId fullName storeName').lean();
  const demoCustomers = await Customer.find({ email: { $in: DEMO_EMAILS } }).select('email customerId fullName').lean();
  const demoRiders = await Rider.find({ email: { $in: DEMO_EMAILS } }).select('email registrationId riderName vehiclePlate').lean();
  console.log({ demoSellers, demoCustomers, demoRiders });
  console.log(`demo rows -> sellers:${demoSellers.length} customers:${demoCustomers.length} riders:${demoRiders.length}`);

  section('Demo fixture identities (by pinned ID / plate / licence)');
  console.log({
    sellers: await Seller.find({ $or: [{ registrationId: { $in: DEMO_SELLER_IDS } }, { idNumber: { $in: DEMO_SELLER_IDS } }] }).select('email registrationId idNumber fullName').lean(),
    customers: await Customer.find({ customerId: { $in: DEMO_CUSTOMER_IDS } }).select('email customerId fullName').lean(),
    riders: await Rider.find({ $or: [{ registrationId: { $in: DEMO_RIDER_IDS } }, { vehiclePlate: { $in: DEMO_RIDER_PLATES } }, { licenseNumber: { $in: DEMO_RIDER_LICENSES } }] }).select('email registrationId riderName vehiclePlate licenseNumber').lean(),
  });

  section('Test/synthetic tracking + ticket IDs');
  const testParcels = await Parcel.find({ trackingNumber: { $regex: TEST_ID } }).select('trackingNumber senderName receiverName senderEmail status').lean();
  console.log(testParcels, `count: ${testParcels.length}`);
  const testIssues = await Issue.find({ $or: [{ trackingNumber: { $regex: TEST_ID } }, { ticketId: { $regex: TEST_ID } }] }).select('ticketId trackingNumber reporterEmail status').lean();
  console.log(testIssues, `count: ${testIssues.length}`);

  section('Parcels with demo parties');
  console.log(await Parcel.find({ $or: [{ senderEmail: { $in: DEMO_EMAILS } }, { recipientEmail: { $in: DEMO_EMAILS } }] }).select('trackingNumber senderEmail recipientEmail status').lean());

  section('Data integrity: parcels missing real coordinates');
  console.log({
    parcelsNoGeofence: await Parcel.countDocuments({ $or: [{ trackingGeofence: null }, { trackingGeofence: { $exists: false } }] }),
    parcelsNoRiderFix: await Parcel.countDocuments({ $or: [{ riderLat: null }, { riderLat: { $exists: false } }] }),
  });

  section('ParcelLocation telemetry vs parcels');
  const locations = await ParcelLocation.find({}).select('parcelId lat lng location type status geofence updatedAt').lean();
  console.log(locations.slice(0, 20), `count: ${locations.length}`);
  const orphanLocations = [];
  for (const loc of locations) {
    const match = await Parcel.findOne({ trackingNumber: loc.parcelId }).select('_id').lean();
    if (!match) orphanLocations.push(loc.parcelId);
  }
  console.log('ParcelLocation rows with no matching parcel:', orphanLocations);

  section('Notifications: read-state + recent rows');
  console.log({
    unread: await AdminNotification.countDocuments({ read: { $ne: true } }),
    total: await AdminNotification.countDocuments(),
  });
  console.log(await AdminNotification.find({}).sort({ createdAt: -1 }).limit(10).select('role title type relatedId read source createdAt').lean());

  section('Riders: duty + performance fields');
  console.log(await Rider.find({}).select('email riderName isOnDuty status deliveries rating vehicleType vehiclePlate').lean());

  section('Issues: reporter + status');
  console.log(await Issue.find({}).sort({ createdAt: -1 }).limit(20).select('ticketId trackingNumber reporterEmail reporterRole category status').lean());

  console.log('\nAudit complete (no writes performed).');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('[Audit Error]', err.message);
  process.exit(1);
});
