// ─────────────────────────────────────────────────────────────────────────────
// backfill_issue_enrichment.js — ONE-TIME maintenance script (idempotent).
//
// GET /api/issues used to mint a random ticket id and persist its own
// enrichment via issue.save() on every read. That route is now read-only and
// derives missing values deterministically for the response only. This script
// is where the derived values become durable, so legacy rows carry a stable
// ticketId in the database instead of a per-request projection.
//
// The derivation below mirrors Server.js GET /api/issues field-for-field.
// If that route's derivation ever changes, change it here too — or better,
// retire this script once every row is enriched (the summary prints how many
// rows still need work; re-run until it reports 0).
//
// Usage:
//   node backfill_issue_enrichment.js          dry run — prints what would change
//   node backfill_issue_enrichment.js --write  persists the changes
//
// Requires MONGO_URI in server/.env or the environment.
// ─────────────────────────────────────────────────────────────────────────────

const dns = require('node:dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const Issue = require('./models/Issue');
const Parcel = require('./models/Parcel');

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('[Backfill Error] MONGO_URI is required. Set it in server/.env or the environment.');
  process.exit(1);
}

const WRITE = process.argv.includes('--write');

// Mirrors the canonical demo logins used by GET /api/issues.
const DEMO_REPORTER_EMAILS = ['customer@gmail.com', 'seller@gmail.com', 'rider@gmail.com'];

// Same deterministic ticket id shape as the read route: year + 5 digits derived
// from the tail of _id. The route does not care about collisions (response
// only); persistence does, because ticketId is unique — so on a collision the
// suffix increments until a free id is found (still deterministic per _id).
async function deriveFreeTicketId(desired) {
  let candidate = desired;
  for (let attempt = 0; attempt < 100000; attempt += 1) {
    const clash = await Issue.exists({ ticketId: candidate });
    if (!clash) return candidate;
    const year = candidate.slice(5, 9);
    let suffix = parseInt(candidate.slice(10), 10);
    suffix = (suffix + 1) % 100000;
    candidate = `TICK-${year}-${String(suffix).padStart(5, '0')}`;
  }
  throw new Error(`Could not derive a free ticket id from "${desired}"`);
}

async function backfill() {
  console.log(`[Backfill] mode: ${WRITE ? 'WRITE' : 'DRY RUN (no changes will be saved)'}`);
  await mongoose.connect(MONGO_URI);
  console.log('Connected to Web MongoDB.');

  // Only rows that are actually missing something. Rows missing none of the
  // five fields cannot change, so they are excluded from the scan entirely.
  const MISSING = { $in: [null, ''] };
  const issues = await Issue.find({
    $or: [
      { ticketId: MISSING },
      { accountCategory: MISSING },
      { productName: MISSING },
      { productCategory: MISSING },
      { eta: MISSING },
    ],
  }).lean();
  console.log(`[Backfill] rows needing enrichment: ${issues.length}`);

  if (issues.length === 0) {
    console.log('[Backfill] nothing to do. Every issue row is already enriched.');
    await mongoose.disconnect();
    return;
  }

  // Same single batched parcel lookup as the read route.
  const trackingNumbers = issues
    .filter(i => (!i.productName || !i.productCategory || !i.eta) && i.trackingNumber)
    .map(i => i.trackingNumber);
  const parcelByTracking = new Map();
  if (trackingNumbers.length > 0) {
    const linked = await Parcel.find({ trackingNumber: { $in: trackingNumbers } })
      .select('trackingNumber item productName packageType category estimatedDeliveryDate eta')
      .lean();
    linked.forEach(p => parcelByTracking.set(p.trackingNumber, p));
  }
  console.log(`[Backfill] linked parcels found: ${parcelByTracking.size}`);

  const totals = { scanned: issues.length, changed: 0, skipped: 0, errors: 0 };
  const perField = { ticketId: 0, accountCategory: 0, productName: 0, productCategory: 0, eta: 0 };

  for (const issue of issues) {
    try {
      const updates = {};

      if (!issue.ticketId) {
        const year = new Date(issue.createdAt || Date.now()).getFullYear();
        const suffix = String(parseInt(String(issue._id).slice(-6), 16) % 100000).padStart(5, '0');
        updates.ticketId = await deriveFreeTicketId(`TICK-${year}-${suffix}`);
      }

      if (!issue.accountCategory) {
        const reporterEmail = (issue.reporterEmail || '').toLowerCase().trim();
        updates.accountCategory = DEMO_REPORTER_EMAILS.includes(reporterEmail) ? 'DEMO' : 'REAL';
      }

      if (!issue.productName || !issue.productCategory || !issue.eta) {
        const parcel = parcelByTracking.get(issue.trackingNumber);
        if (parcel) {
          if (!issue.productName && (parcel.item || parcel.productName)) {
            updates.productName = String(parcel.item || parcel.productName);
          }
          if (!issue.productCategory && (parcel.packageType || parcel.category)) {
            updates.productCategory = String(parcel.packageType || parcel.category);
          }
          if (!issue.eta && (parcel.estimatedDeliveryDate || parcel.eta)) {
            // Issue.eta is a String; the read route serializes the parcel's
            // Date through res.json as ISO. Store ISO so the stored value
            // matches what the response shows.
            const raw = parcel.estimatedDeliveryDate || parcel.eta;
            updates.eta = raw instanceof Date ? raw.toISOString() : String(raw);
          }
        }
      }

      const fields = Object.keys(updates);
      if (fields.length === 0) {
        totals.skipped += 1;
        continue;
      }

      fields.forEach(f => { perField[f] += 1; });
      totals.changed += 1;
      console.log(`  ${issue.trackingNumber || '(no tracking)'} -> ${fields.map(f => `${f}=${JSON.stringify(updates[f])}`).join(', ')}`);

      if (WRITE) {
        await Issue.updateOne({ _id: issue._id }, { $set: updates });
      }
    } catch (err) {
      totals.errors += 1;
      console.error(`  [Backfill Error] issue ${issue._id}: ${err.message}`);
    }
  }

  console.log('─────────────────────────────────────────────');
  console.log(`[Backfill] scanned ${totals.scanned} | changed ${totals.changed} | skipped ${totals.skipped} | errors ${totals.errors}`);
  Object.entries(perField).forEach(([f, n]) => console.log(`  ${f.padEnd(16)} ${n}`));
  if (!WRITE) {
    console.log('[Backfill] dry run only — re-run with --write to persist.');
  } else {
    console.log('[Backfill] persisted. Re-run without --write to confirm 0 rows remain.');
  }

  await mongoose.disconnect();
}

backfill().catch((err) => {
  console.error('[Backfill Error]', err);
  process.exit(1);
});
