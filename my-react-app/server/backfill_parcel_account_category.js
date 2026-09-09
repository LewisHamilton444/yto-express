// ============================================================================
// BACKFILL: Parcel.accountCategory  (one-time remediation)
// ----------------------------------------------------------------------------
// Background: before 2026-09-09 the Parcel schema had no accountCategory
// field, so Mongoose strict mode silently stripped the value that
// POST /api/parcels and bridge sync-parcel computed. Every parcel saved
// before that fix lacks the stored field, which breaks server-side
// category filtering (getCategoryFilter matches on a nonexistent field).
//
// This script backfills the field on existing documents using the SAME
// heuristics the frontend uses at render time (ManageParcels.jsx
// normalizeParcel):
//   senderEmail / recipientEmail classified via isDemoEmail
//   (canonical demo gmail logins + yto.com/example.com/ytoexpress.com
//   domains + "demo" prefix), OR trackingNumber starts with "DEMO-"
//   -> DEMO; otherwise REAL.
//
// Safety:
//   - MONGO_URI must come from server/.env or the environment (never
//     hardcoded credentials in source).
//   - Default mode is DRY RUN: it reports what would change and writes
//     nothing. Add --apply to actually persist.
//   - Gated behind BACKFILL_CONFIRM=YES for the apply mode (mirrors
//     rotate_demo_admin_credentials.js).
//
// Usage (from my-react-app/server):
//   node backfill_parcel_account_category.js            # dry run
//   BACKFILL_CONFIRM=YES node backfill_parcel_account_category.js --apply
// ============================================================================

const dns = require('node:dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('node:path');

dotenv.config({ path: path.resolve(__dirname, '.env') });

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('[Backfill Error] MONGO_URI is required. Set it in server/.env or the environment (never hardcode credentials in source).');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const CONFIRMED = process.env.BACKFILL_CONFIRM === 'YES';

if (APPLY && !CONFIRMED) {
  console.error('[Backfill Error] --apply requires BACKFILL_CONFIRM=YES in the environment. Run the dry run first, review the counts, then re-run with the flag.');
  process.exit(1);
}

// Mirrors Server.js isDemoEmail + demoUtils.js exactly.
const DEMO_DOMAINS = ['yto.com', 'example.com', 'ytoexpress.com'];
const DEMO_EMAILS = ['superadmin@gmail.com', 'staff@gmail.com', 'hub@gmail.com'];
function isDemoEmail(email) {
  const value = String(email || '').toLowerCase().trim();
  const domain = value.split('@')[1] || '';
  return DEMO_EMAILS.includes(value) || DEMO_DOMAINS.includes(domain) || value.startsWith('demo');
}

// Mirrors ManageParcels.jsx normalizeParcel accountCategory derivation.
function deriveCategory(parcel) {
  const senderLike =
    parcel.senderEmail ||
    (parcel.sender && parcel.sender.email) ||
    parcel.recipientEmail ||
    '';
  const trackingLike = String(parcel.trackingNumber || parcel._id || '');
  return isDemoEmail(senderLike) || trackingLike.startsWith('DEMO-') ? 'DEMO' : 'REAL';
}

async function main() {
  console.log(`[Backfill] Mode: ${APPLY ? 'APPLY (writing changes)' : 'DRY RUN (no writes)'}`);
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 15000 });

  const parcelSchema = new mongoose.Schema({}, { strict: false, collection: 'parcels' });
  const ParcelRaw = mongoose.model('ParcelBackfill', parcelSchema);

  // Only rows where the field is genuinely absent (null/undefined). Rows that
  // already carry a valid REAL/DEMO value (post-fix writes) are left alone.
  const targets = await ParcelRaw.find({ accountCategory: { $in: [null, undefined] } })
    .select('trackingNumber senderEmail recipientEmail sender')
    .lean();

  const counts = { DEMO: 0, REAL: 0, total: targets.length };
  const updates = [];

  for (const p of targets) {
    const category = deriveCategory(p);
    counts[category] += 1;
    updates.push({ id: p._id, trackingNumber: p.trackingNumber, category });
    console.log(`  ${category.padEnd(4)} | ${p.trackingNumber || p._id}`);
  }

  console.log('─'.repeat(60));
  console.log(`[Backfill Summary] total lacking field: ${counts.total} | would set DEMO: ${counts.DEMO} | would set REAL: ${counts.REAL}`);

  if (!APPLY) {
    console.log('[Backfill] Dry run complete — no writes performed. Review the list above, then re-run with BACKFILL_CONFIRM=YES and --apply to persist.');
  } else {
    let written = 0;
    for (const u of updates) {
      const res = await ParcelRaw.updateOne({ _id: u.id }, { $set: { accountCategory: u.category } });
      written += res.modifiedCount;
    }
    console.log(`[Backfill] Applied: ${written}/${counts.total} documents updated.`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[Backfill Error]', err.message);
  process.exit(1);
});
