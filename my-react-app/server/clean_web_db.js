const dns = require('node:dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

// Credentials never live in source. MONGO_URI must come from server/.env or
// the environment.
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('[Clean Error] MONGO_URI is required. Set it in server/.env or the environment (never hardcode credentials in source).');
  process.exit(1);
}

const Customer = require('./models/Customer');
const Seller = require('./models/Seller');
const Rider = require('./models/Rider');
const Parcel = require('./models/Parcel');
const Issue = require('./models/Issue');

// No preserved accounts — the platform is single-realm (REAL) since the
// 2026-09-13 de-demo migration; this script wipes all operational data.

async function cleanWebDatabase() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to Web MongoDB.');

    // Delete customers
    const delCust = await Customer.deleteMany({});
    console.log(`Deleted ${delCust.deletedCount} customers.`);

    // Delete sellers
    const delSell = await Seller.deleteMany({});
    console.log(`Deleted ${delSell.deletedCount} sellers.`);

    // Delete riders
    const delRide = await Rider.deleteMany({});
    console.log(`Deleted ${delRide.deletedCount} riders.`);

    // Delete test parcels generated during automated testing (with test / e2e / dummy tracking)
    const delParcels = await Parcel.deleteMany({
      $or: [
        { trackingNumber: { $regex: /TEST|E2E|DUMMY/i } },
        { senderName: { $regex: /Bridge Test|E2E/i } }
      ]
    });
    console.log(`Deleted ${delParcels.deletedCount} temporary test parcels.`);

    // Delete test issues
    const delIssues = await Issue.deleteMany({
      $or: [
        { trackingNumber: { $regex: /TEST|E2E|DUMMY/i } },
        { reporterEmail: { $regex: /test|e2e|example/i } }
      ]
    });
    console.log(`Deleted ${delIssues.deletedCount} temporary test issues.`);

    console.log('Web database cleanup complete.');
  } catch (err) {
    console.error('Web DB Cleanup Error:', err.message);
  } finally {
    process.exit(0);
  }
}

cleanWebDatabase();
