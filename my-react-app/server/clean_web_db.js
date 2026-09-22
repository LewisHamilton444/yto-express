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

// Destructive purge gate (2026-09-18): this script only runs when the caller
// explicitly confirms with CONFIRM_PURGE=YES, so an accidental invocation can
// never wipe the live Web database.
if (process.env.CONFIRM_PURGE !== 'YES') {
  console.log('[Purge Refused] Set CONFIRM_PURGE=YES to run this destructive cleanup.');
  console.log('[Purge Refused] It permanently deletes demo/test rows and every non-demo row it classifies as temporary.');
  process.exit(0);
}

// Canonical mobile demo logins. The Web database is REAL-only: these rows are
// demo fixtures that belong to the APP database, so they are PURGED here
// (previous versions of this script preserved them).
const OFFICIAL_DEMO_EMAILS = [
  'seller@gmail.com',
  'customer@gmail.com',
  'rider@gmail.com',
];

async function cleanWebDatabase() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to Web MongoDB.');

    // NOTE (2026-09-18): every filter below targets DEMO/TEST rows ONLY.
    // The previous version deleted "everything that is not a demo account",
    // which would have wiped every real seller, customer, rider, parcel, and
    // issue on a REAL-only database. Real records are never touched now.

    // 1. Demo/test admin accounts — canonical admins are preserved.
    const delAdmins = await Account.deleteMany({
      email: { $in: ['superadmin@gmail.com', 'staff@gmail.com', 'hub@gmail.com'] },
    });
    console.log(`Deleted ${delAdmins.deletedCount} demo admin accounts (canonical admins preserved).`);
    const adminEmails = await Account.find({}).select('email role adminId').lean();
    console.log(`[PRESERVED] Admin accounts: ${adminEmails.length}`, adminEmails.map(a => `${a.email} (${a.role}) [${a.adminId || 'no-id'}]`));

    // 2. Demo customers (canonical demo logins only)
    const delCust = await Customer.deleteMany({ email: { $in: OFFICIAL_DEMO_EMAILS } });
    console.log(`Deleted ${delCust.deletedCount} demo customers.`);

    // 3. Demo sellers
    const delSell = await Seller.deleteMany({ email: { $in: OFFICIAL_DEMO_EMAILS } });
    console.log(`Deleted ${delSell.deletedCount} demo sellers.`);

    // 4. Demo riders
    const delRide = await Rider.deleteMany({ email: { $in: OFFICIAL_DEMO_EMAILS } });
    console.log(`Deleted ${delRide.deletedCount} demo riders.`);

    // 5. Demo/test parcels — demo parties or obviously synthetic test IDs only.
    const delParcels = await Parcel.deleteMany({
      $or: [
        { trackingNumber: { $regex: /TEST|E2E|DUMMY/i } },
        { senderName: { $regex: /Bridge Test|E2E/i } },
        { senderEmail: { $in: OFFICIAL_DEMO_EMAILS } },
        { recipientEmail: { $in: OFFICIAL_DEMO_EMAILS } },
      ],
    });
    console.log(`Deleted ${delParcels.deletedCount} demo/test parcels.`);

    // 6. Demo/test issues — demo reporters or synthetic test IDs only.
    const delIssues = await Issue.deleteMany({
      $or: [
        { trackingNumber: { $regex: /TEST|E2E|DUMMY/i } },
        { reporterEmail: { $in: OFFICIAL_DEMO_EMAILS } },
      ],
    });
    console.log(`Deleted ${delIssues.deletedCount} demo/test issues.`);

    // 7. Test AdminNotifications
    const delNotifs = await AdminNotification.deleteMany({
      $or: [
        { message: { $regex: /test\.seller|test\.rider|test\.cust|regd\.cust|uat_customer/i } },
        { relatedId: { $regex: /YTOMU0OSUU0QUI8|YTOMU0OHY0G96FF/i } },
      ],
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

    console.log('Web database demo/test cleanup complete.');
  } catch (err) {
    console.error('Web DB Cleanup Error:', err.message);
  } finally {
    process.exit(0);
  }
}

cleanWebDatabase();
