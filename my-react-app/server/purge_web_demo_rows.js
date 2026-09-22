// ══════════════════════════════════════════════════════════════════════════
// Demo-row purge for the WEB database (2026-09-18)
// ---------------------------------------------------------------------------
// Removes the canonical mobile demo fixtures from the Web MongoDB only:
//   Account : superadmin@gmail.com / staff@gmail.com / hub@gmail.com
//   Seller  : seller@gmail.com          (YTOS2026DEMO1)
//   Customer: customer@gmail.com        (YTOC2026DEMO1)
//   Rider   : rider@gmail.com           (YTOR2026DEMO1)
//   AdminNotification: legacy 'New User Registration' security rows written
//                      by the pre-2026-09-18 demo flow (role 'admin', source
//                      'mobile-app', no relatedId) — pure noise in the bell.
// The App database keeps its own copies for testing — this script never
// touches the mobile backend's MongoDB.
//
// SAFETY: dry-run by default. Nothing is deleted unless PURGE_CONFIRM=YES.
//
//   node purge_web_demo_rows.js                  # dry run (shows what would go)
//   $env:PURGE_CONFIRM='YES'; node purge_web_demo_rows.js   # performs deletion
// ══════════════════════════════════════════════════════════════════════════

const dns = require('node:dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const Account           = require('./models/Account');
const AdminNotification = require('./models/AdminNotification');
const Customer          = require('./models/Customer');
const Rider             = require('./models/Rider');
const Seller            = require('./models/Seller');

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('[Purge Error] MONGO_URI is required (server/.env or environment).');
  process.exit(1);
}

const DEMO_ADMIN_EMAILS = ['superadmin@gmail.com', 'staff@gmail.com', 'hub@gmail.com'];
const DEMO_USER_EMAILS = ['seller@gmail.com', 'customer@gmail.com', 'rider@gmail.com'];
const DEMO_SELLER_IDS = ['YTOS2026DEMO1', 'PH-ID-98765'];
const DEMO_CUSTOMER_IDS = ['YTOC2026DEMO1'];
const DEMO_RIDER_IDS = ['YTOR2026DEMO1'];
const DEMO_RIDER_PLATES = ['ABC-1234'];
const DEMO_RIDER_LICENSES = ['N01-23-456789'];

const TARGETS = [
  { label: 'Seller', model: Seller, filter: { $or: [{ email: { $in: DEMO_USER_EMAILS } }, { registrationId: { $in: DEMO_SELLER_IDS } }, { idNumber: { $in: DEMO_SELLER_IDS } }] }, fields: 'email registrationId fullName storeName' },
  { label: 'Customer', model: Customer, filter: { $or: [{ email: { $in: DEMO_USER_EMAILS } }, { customerId: { $in: DEMO_CUSTOMER_IDS } }] }, fields: 'email customerId fullName' },
  { label: 'Rider', model: Rider, filter: { $or: [{ email: { $in: DEMO_USER_EMAILS } }, { registrationId: { $in: DEMO_RIDER_IDS } }, { vehiclePlate: { $in: DEMO_RIDER_PLATES } }, { licenseNumber: { $in: DEMO_RIDER_LICENSES } }] }, fields: 'email registrationId riderName vehiclePlate' },
  { label: 'Account', model: Account, filter: { email: { $in: DEMO_ADMIN_EMAILS } }, fields: 'email role adminId' },
  { label: 'AdminNotification (legacy registration noise)', model: AdminNotification, filter: { role: 'admin', type: 'security', title: 'New User Registration', source: 'mobile-app', relatedId: '' }, fields: 'title type role source relatedId read createdAt' },
];

async function main() {
  const confirmed = process.env.PURGE_CONFIRM === 'YES';
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  console.log('Connected to Web MongoDB.');
  console.log(confirmed ? 'MODE: EXECUTE (rows will be deleted)' : 'MODE: DRY RUN (no writes)');

  let totalMatched = 0;
  for (const target of TARGETS) {
    const rows = await target.model.find(target.filter).select(target.fields).lean();
    totalMatched += rows.length;
    console.log(`\n[${target.label}] matched ${rows.length}`);
    rows.forEach((r) => console.log('  -', JSON.stringify(r)));
  }

  if (!confirmed) {
    console.log(`\nDry run complete: ${totalMatched} demo row(s) would be deleted.`);
    console.log('Re-run with PURGE_CONFIRM=YES to perform the deletion.');
    await mongoose.disconnect();
    process.exit(0);
  }

  console.log('\nDeleting...');
  for (const target of TARGETS) {
    const result = await target.model.deleteMany(target.filter);
    console.log(`[${target.label}] deleted ${result.deletedCount}`);
  }

  console.log('\nVerification after purge:');
  for (const target of TARGETS) {
    console.log(`[${target.label}] remaining ${await target.model.countDocuments(target.filter)} (must be 0)`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('[Purge Error]', err.message);
  process.exit(1);
});