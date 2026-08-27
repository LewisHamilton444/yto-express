// ============================================================================
// REST API Bridge Transformation Adapter
// ----------------------------------------------------------------------------
// Receives payloads shaped like the Android app's backend schema
// (yto_express_backend: User.js / Shipment.js) and transforms them into this
// web backend's schema (Seller.js / Rider.js / Customer.js / Parcel.js /
// ParcelLocation.js), per the Cross-Platform Data Mapping Matrix.
//
// Every route below: validates its payload strictly (400 on a bad shape),
// never lets an exception escape unhandled (everything is try/caught and
// logged via logBridgeError — a route failing here never crashes the
// server process or leaves the mobile app's request hanging), and always
// answers with a clean, consistently-shaped JSON body:
//   success -> { success: true,  message, data }
//   failure -> { success: false, error, details? }
// ============================================================================

const express = require('express');
const router = express.Router();

const Seller         = require('./models/Seller');
const Rider          = require('./models/Rider');
const Customer       = require('./models/Customer');
const Parcel         = require('./models/Parcel');
const ParcelLocation = require('./models/ParcelLocation');

// ── Optional shared-secret gate ─────────────────────────────────────────
// These routes accept writes from another backend, not from the admin UI,
// so — unlike the rest of Server.js — they support being locked down with a
// shared secret. Off by default (no BRIDGE_API_KEY set) so this doesn't
// break anything before the mobile team is ready to configure it; set
// BRIDGE_API_KEY in .env on both sides once the bridge goes live.
router.use((req, res, next) => {
  const expected = process.env.BRIDGE_API_KEY;
  if (!expected) return next();
  if (req.get('x-bridge-api-key') === expected) return next();
  return res.status(401).json({ success: false, error: 'Missing or invalid bridge API key.' });
});

// ── Logging ──────────────────────────────────────────────────────────────
// Centralized so a transformation failure is always visible in the server
// logs with which route and payload triggered it, without ever throwing
// past this point.
function logBridgeError(route, err, payload) {
  console.error(`[Bridge:${route}] ${err.message}`, JSON.stringify(payload));
}

function statusForError(err) {
  if (err.name === 'ValidationError') return 400; // bad/missing fields Mongoose itself rejected
  if (err.code === 11000) return 409;              // duplicate key — usually a racing re-sync
  return 500;
}

// ── User category flagging ──────────────────────────────────────────────
// REAL = live @gmail.com signup. DEMO = @yto.com / @example.com test
// account. Anything else defaults to REAL (safer default than silently
// treating an unrecognized domain as a throwaway test account).
const DEMO_DOMAINS = ['yto.com', 'example.com'];
function categorizeEmail(email) {
  const domain = String(email).split('@')[1]?.toLowerCase() || '';
  return DEMO_DOMAINS.includes(domain) ? 'DEMO' : 'REAL';
}

// ── Enterprise ID generation ─────────────────────────────────────────────
// YTO-<PREFIX>-<YEAR>-<5-digit seq>, sequence counted per collection per
// year (so it resets each year) by counting existing IDs already matching
// that prefix+year. YTO-ADM-XXX (3-digit, no year) is included for
// completeness/reuse — the mobile app never registers admin accounts, so
// this bridge never calls it with "super_admin".
const ID_PREFIXES = { customer: 'CUST', seller: 'SELL', rider: 'RIDE', super_admin: 'ADM' };

async function generateEnterpriseId(kind, Model, idField) {
  const prefix = ID_PREFIXES[kind];
  if (!prefix) throw new Error(`No enterprise ID prefix configured for "${kind}".`);

  if (kind === 'super_admin') {
    const count = await Model.countDocuments({ [idField]: { $regex: '^YTO-ADM-' } });
    return `YTO-ADM-${String(count + 1).padStart(3, '0')}`;
  }

  const year = new Date().getFullYear();
  const count = await Model.countDocuments({ [idField]: { $regex: `^YTO-${prefix}-${year}-` } });
  return `YTO-${prefix}-${year}-${String(count + 1).padStart(5, '0')}`;
}

// ── Shared validation / transform helpers ────────────────────────────────
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;
const isValidEmail = (v) => isNonEmptyString(v) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

// Copies over only the keys the caller actually sent, so a partial re-sync
// (e.g. a rider app resending its profile after only editing one field)
// never clobbers previously-saved fields with blanks.
function pickDefined(source, keys) {
  const out = {};
  keys.forEach((k) => { if (source[k] !== undefined && source[k] !== null) out[k] = source[k]; });
  return out;
}

// Mobile Shipment.js nests sender/recipient as objects ({ name, ... });
// tolerate a plain string too so a slightly different mobile payload shape
// doesn't hard-fail the whole sync.
function extractName(nested, flatFallback) {
  if (nested && typeof nested === 'object' && isNonEmptyString(nested.name)) return nested.name;
  if (isNonEmptyString(nested)) return nested;
  if (isNonEmptyString(flatFallback)) return flatFallback;
  return undefined;
}

// ══════════════════════════════════════════════════════════════════════
// POST /api/bridge/sync-user
// Mobile User.js -> Seller.js / Rider.js / Customer.js, routed by role.
// ══════════════════════════════════════════════════════════════════════
router.post('/sync-user', async (req, res) => {
  const body = req.body || {};
  try {
    const { name, email, role } = body;

    if (!isNonEmptyString(name)) {
      return res.status(400).json({ success: false, error: '"name" is required.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, error: '"email" is required and must be a valid address.' });
    }
    const normalizedRole = String(role || '').trim().toLowerCase();
    if (!['seller', 'rider', 'customer'].includes(normalizedRole)) {
      return res.status(400).json({ success: false, error: `"role" must be one of seller, rider, customer (got "${role}").` });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const accountCategory = categorizeEmail(normalizedEmail);

    const syncByRole = { seller: syncSeller, rider: syncRider, customer: syncCustomer };
    const result = await syncByRole[normalizedRole](body, normalizedEmail, accountCategory);

    return res.status(result.created ? 201 : 200).json({
      success: true,
      message: `${normalizedRole} ${result.created ? 'registered' : 'updated'} successfully.`,
      data: {
        collection: result.collection,
        enterpriseId: result.enterpriseId,
        _id: result.doc._id,
        accountCategory,
        created: result.created,
      },
    });
  } catch (err) {
    logBridgeError('sync-user', err, body);
    return res.status(statusForError(err)).json({ success: false, error: 'Failed to sync user record.', details: err.message });
  }
});

async function syncSeller(body, email, accountCategory) {
  const updates = { fullName: body.name, email, accountCategory };
  if (body.phone !== undefined) updates.phone = body.phone;
  if (body.idNumber !== undefined) updates.idNumber = body.idNumber;
  if (body.idType !== undefined) updates.idType = body.idType;
  if (body.accountNumber !== undefined) updates.accountNumber = body.accountNumber;
  Object.assign(updates, pickDefined(body, ['address', 'city', 'state', 'country', 'postalCode', 'bankName', 'commissionRate', 'paymentCycle']));

  const existing = await Seller.findOne({ email });
  if (existing) {
    Object.assign(existing, updates);
    await existing.save();
    return { doc: existing, created: false, collection: 'Seller', enterpriseId: existing.registrationId };
  }

  const registrationId = await generateEnterpriseId('seller', Seller, 'registrationId');
  const doc = await Seller.create({ registrationId, accountNumber: '', phone: '', ...updates });
  return { doc, created: true, collection: 'Seller', enterpriseId: registrationId };
}

async function syncRider(body, email, accountCategory) {
  const updates = { riderName: body.name, email, accountCategory };
  if (body.phone !== undefined) updates.phone = body.phone;
  if (body.plateNumber !== undefined) updates.vehiclePlate = body.plateNumber;   // mobile plateNumber -> web vehiclePlate
  if (body.vehicleModel !== undefined) updates.vehicleType = body.vehicleModel;  // mobile vehicleModel -> web vehicleType
  if (body.accountNumber !== undefined) updates.accountNumber = body.accountNumber;
  Object.assign(updates, pickDefined(body, ['address', 'city', 'state', 'country', 'postalCode', 'bankName', 'licenseNumber', 'emergencyContactName', 'emergencyContactPhone', 'payoutRate', 'payoutCycle']));

  const existing = await Rider.findOne({ email });
  if (existing) {
    Object.assign(existing, updates);
    await existing.save();
    return { doc: existing, created: false, collection: 'Rider', enterpriseId: existing.registrationId };
  }

  const registrationId = await generateEnterpriseId('rider', Rider, 'registrationId');
  const doc = await Rider.create({ registrationId, accountNumber: '', phone: '', ...updates });
  return { doc, created: true, collection: 'Rider', enterpriseId: registrationId };
}

async function syncCustomer(body, email, accountCategory) {
  const updates = { fullName: body.name, email, accountCategory };
  if (body.phone !== undefined) updates.phone = body.phone;

  const existing = await Customer.findOne({ email });
  if (existing) {
    Object.assign(existing, updates);
    await existing.save();
    return { doc: existing, created: false, collection: 'Customer', enterpriseId: existing.customerId };
  }

  const customerId = await generateEnterpriseId('customer', Customer, 'customerId');
  const doc = await Customer.create({ customerId, ...updates });
  return { doc, created: true, collection: 'Customer', enterpriseId: customerId };
}

// ══════════════════════════════════════════════════════════════════════
// POST /api/bridge/sync-parcel
// Mobile Shipment.js -> web Parcel.js (nested sender/recipient flattened).
// ══════════════════════════════════════════════════════════════════════
router.post('/sync-parcel', async (req, res) => {
  const body = req.body || {};
  try {
    const trackingNumber = (body.trackingId || body.trackingNumber || '').toString().trim();
    if (!isNonEmptyString(trackingNumber)) {
      return res.status(400).json({ success: false, error: '"trackingId" is required.' });
    }

    const senderName = extractName(body.sender, body.senderName);
    const receiverName = extractName(body.recipient, body.receiverName);
    if (!isNonEmptyString(senderName)) {
      return res.status(400).json({ success: false, error: '"sender.name" is required.' });
    }
    if (!isNonEmptyString(receiverName)) {
      return res.status(400).json({ success: false, error: '"recipient.name" is required.' });
    }
    if (!isNonEmptyString(body.item)) {
      return res.status(400).json({ success: false, error: '"item" is required.' });
    }

    const update = {
      trackingNumber,
      senderName,
      receiverName,
      item: body.item,
      ...pickDefined(body, ['weight', 'value', 'origin', 'destination', 'status', 'riderId', 'sellerId']),
    };

    const existing = await Parcel.findOne({ trackingNumber });
    let doc, created;
    if (existing) {
      Object.assign(existing, update);
      await existing.save();
      doc = existing;
      created = false;
    } else {
      doc = await Parcel.create({
        ...update,
        events: [{
          time: new Date().toISOString(),
          event: 'Synced from mobile app',
          location: update.origin || 'Mobile App',
          status: update.status || 'Pending',
        }],
      });
      created = true;
    }

    return res.status(created ? 201 : 200).json({
      success: true,
      message: `Parcel ${created ? 'created' : 'updated'} successfully.`,
      data: { trackingNumber: doc.trackingNumber, _id: doc._id, status: doc.status, created },
    });
  } catch (err) {
    logBridgeError('sync-parcel', err, body);
    return res.status(statusForError(err)).json({ success: false, error: 'Failed to sync parcel record.', details: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════
// POST /api/bridge/sync-location
// Mobile GeoJSON [lng, lat] telemetry -> web ParcelLocation.js (lat/lng
// as separate string fields). Upserted by parcelId since a rider's app
// will call this repeatedly for the same parcel as it moves.
// ══════════════════════════════════════════════════════════════════════
router.post('/sync-location', async (req, res) => {
  const body = req.body || {};
  try {
    const parcelId = (body.parcelId || body.trackingId || body.trackingNumber || '').toString().trim();
    if (!isNonEmptyString(parcelId)) {
      return res.status(400).json({ success: false, error: '"parcelId" (or trackingId/trackingNumber) is required.' });
    }

    const coords = body.coordinates || body.coords;
    const isValidCoordPair = Array.isArray(coords) && coords.length === 2 && coords.every((n) => typeof n === 'number' && Number.isFinite(n));
    if (!isValidCoordPair) {
      return res.status(400).json({ success: false, error: '"coordinates" must be a [longitude, latitude] array of two numbers.' });
    }
    const [lng, lat] = coords;

    const update = {
      parcelId,
      lat: String(lat),
      lng: String(lng),
      location: isNonEmptyString(body.location) ? body.location : `En route (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
      ...pickDefined(body, ['type', 'status', 'geofence', 'notes']),
    };

    const doc = await ParcelLocation.findOneAndUpdate(
      { parcelId },
      { $set: update },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );

    return res.status(200).json({
      success: true,
      message: 'Location telemetry synced successfully.',
      data: { parcelId: doc.parcelId, lat: doc.lat, lng: doc.lng, updatedAt: doc.updatedAt },
    });
  } catch (err) {
    logBridgeError('sync-location', err, body);
    return res.status(statusForError(err)).json({ success: false, error: 'Failed to sync location telemetry.', details: err.message });
  }
});

module.exports = router;
