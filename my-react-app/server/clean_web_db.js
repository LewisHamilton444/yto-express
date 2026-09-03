const dns = require('node:dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://ianjayaguinaldo3_db_user:wadu09269592382@cluster0.qv8m83a.mongodb.net/?appName=Cluster0';

const Customer = require('./models/Customer');
const Seller = require('./models/Seller');
const Rider = require('./models/Rider');
const Parcel = require('./models/Parcel');
const Issue = require('./models/Issue');

const PRESERVED_DEMO_EMAILS = [
  'seller@gmail.com',
  'customer@gmail.com',
  'rider@gmail.com',
];

async function cleanWebDatabase() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to Web MongoDB.');

    // Delete test customers
    const delCust = await Customer.deleteMany({ email: { $nin: PRESERVED_DEMO_EMAILS } });
    console.log(`Deleted ${delCust.deletedCount} temporary customers.`);

    // Delete test sellers
    const delSell = await Seller.deleteMany({ email: { $nin: PRESERVED_DEMO_EMAILS } });
    console.log(`Deleted ${delSell.deletedCount} temporary sellers.`);

    // Delete test riders
    const delRide = await Rider.deleteMany({ email: { $nin: PRESERVED_DEMO_EMAILS } });
    console.log(`Deleted ${delRide.deletedCount} temporary riders.`);

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
