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

const AdminNotification = require('./models/AdminNotification');
const Account = require('./models/Account');

// Preserve official demo accounts (seller@gmail.com, customer@gmail.com, rider@gmail.com)
const OFFICIAL_DEMO_EMAILS = [
  'seller@gmail.com',
  'customer@gmail.com',
  'rider@gmail.com',
];

async function cleanWebDatabase() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to Web MongoDB.');

    // 1. Purge duplicate test/demo admin accounts and safeguard canonical Admin accounts
    await Account.deleteMany({ email: { $in: ['superadmin@gmail.com', 'staff@gmail.com', 'hub@gmail.com'] } });
    const adminCount = await Account.countDocuments();
    const adminEmails = await Account.find({}).select('email role adminId').lean();
    console.log(`[PRESERVED] Admin accounts count: ${adminCount}`, adminEmails.map(a => `${a.email} (${a.role}) [${a.adminId || 'no-id'}]`));

    // 2. Delete non-official customers
    const delCust = await Customer.deleteMany({ email: { $nin: OFFICIAL_DEMO_EMAILS } });
    console.log(`Deleted ${delCust.deletedCount} temporary/test customers.`);

    // 3. Delete non-official sellers
    const delSell = await Seller.deleteMany({ email: { $nin: OFFICIAL_DEMO_EMAILS } });
    console.log(`Deleted ${delSell.deletedCount} temporary/test sellers.`);

    // 4. Delete non-official riders
    const delRide = await Rider.deleteMany({ email: { $nin: OFFICIAL_DEMO_EMAILS } });
    console.log(`Deleted ${delRide.deletedCount} temporary/test riders.`);

    // 5. Delete test parcels generated during automated testing
    const delParcels = await Parcel.deleteMany({
      $or: [
        { trackingNumber: { $regex: /TEST|E2E|DUMMY/i } },
        { senderName: { $regex: /Bridge Test|E2E/i } },
        { senderEmail: { $nin: OFFICIAL_DEMO_EMAILS } },
        { recipientEmail: { $nin: OFFICIAL_DEMO_EMAILS } },
      ]
    });
    console.log(`Deleted ${delParcels.deletedCount} temporary test parcels.`);

    // 6. Delete test issues
    const delIssues = await Issue.deleteMany({
      $or: [
        { trackingNumber: { $regex: /TEST|E2E|DUMMY/i } },
        { reporterEmail: { $nin: OFFICIAL_DEMO_EMAILS } }
      ]
    });
    console.log(`Deleted ${delIssues.deletedCount} temporary test issues.`);

    // 7. Delete test AdminNotifications
    const delNotifs = await AdminNotification.deleteMany({
      $or: [
        { message: { $regex: /test\.seller|test\.rider|test\.cust|regd\.cust|uat_customer/i } },
        { relatedId: { $regex: /YTOMU0OSUU0QUI8|YTOMU0OHY0G96FF|TICK-2026/i } },
      ]
    });
    console.log(`Deleted ${delNotifs.deletedCount} test admin notifications.`);

    // 8. Log remaining collections
    const remainingCust = await Customer.find({}).select('email customerId accountCategory').lean();
    const remainingSell = await Seller.find({}).select('email registrationId accountCategory').lean();
    const remainingRide = await Rider.find({}).select('email registrationId accountCategory').lean();
    const remainingAdmins = await Account.find({}).select('email role accountCategory').lean();

    console.log('REMAINING CUSTOMERS:', remainingCust);
    console.log('REMAINING SELLERS:', remainingSell);
    console.log('REMAINING RIDERS:', remainingRide);
    console.log('REMAINING ADMINS:', remainingAdmins);

    console.log('Web database cleanup complete.');
  } catch (err) {
    console.error('Web DB Cleanup Error:', err.message);
  } finally {
    process.exit(0);
  }
}

cleanWebDatabase();
