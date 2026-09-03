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
const sseBroadcaster = require('./utils/sseBroadcaster');
const Parcel         = require('./models/Parcel');
const ParcelLocation = require('./models/ParcelLocation');
const Issue          = require('./models/Issue');

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
const DEMO_DOMAINS = ['yto.com', 'example.com', 'ytoexpress.com'];
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

    // Broadcast SSE event to connected admin clients
    sseBroadcaster.broadcast('user-synced', {
      role: normalizedRole,
      name: body.name,
      email: normalizedEmail,
      enterpriseId: result.enterpriseId,
      created: result.created,
      timestamp: new Date().toISOString(),
    });

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
    // Record status change in history
    const newStatus = body.status || existing.status;
    if (newStatus !== existing.status) {
      if (!existing.statusHistory) existing.statusHistory = [];
      existing.statusHistory.push({
        status: newStatus,
        changedAt: new Date(),
        reason: body.statusReason || 'Status updated via bridge',
      });
      existing.status = newStatus;
    }
    Object.assign(existing, updates);
    await existing.save();
    return { doc: existing, created: false, collection: 'Seller', enterpriseId: existing.registrationId };
  }

  const registrationId = await generateEnterpriseId('seller', Seller, 'registrationId');
  const accountNumber = body.accountNumber || String(Math.floor(1000000000 + Math.random() * 9000000000));
  const doc = await Seller.create({
    registrationId,
    accountNumber,
    phone: body.phone || '',
    ...updates,
    statusHistory: [{
      status: body.status || 'ACTIVE',
      changedAt: new Date(),
      reason: 'Seller registered',
    }],
  });
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
    // Record status change in history
    const newStatus = body.status || existing.status;
    if (newStatus !== existing.status) {
      if (!existing.statusHistory) existing.statusHistory = [];
      existing.statusHistory.push({
        status: newStatus,
        changedAt: new Date(),
        reason: body.statusReason || 'Status updated via bridge',
      });
      existing.status = newStatus;
    }
    Object.assign(existing, updates);
    await existing.save();
    return { doc: existing, created: false, collection: 'Rider', enterpriseId: existing.registrationId };
  }

  const registrationId = await generateEnterpriseId('rider', Rider, 'registrationId');
  const accountNumber = body.accountNumber || String(Math.floor(1000000000 + Math.random() * 9000000000));
  const doc = await Rider.create({
    registrationId,
    accountNumber,
    phone: body.phone || '',
    ...updates,
    statusHistory: [{
      status: body.status || 'Active',
      changedAt: new Date(),
      reason: 'Rider registered',
    }],
  });
  return { doc, created: true, collection: 'Rider', enterpriseId: registrationId };
}

async function syncCustomer(body, email, accountCategory) {
  const updates = { fullName: body.name, email, accountCategory };
  if (body.phone !== undefined) updates.phone = body.phone;

  const existing = await Customer.findOne({ email });
  if (existing) {
    // Record status change in history if status differs
    const newStatus = body.status || existing.status;
    if (newStatus !== existing.status) {
      if (!existing.statusHistory) existing.statusHistory = [];
      existing.statusHistory.push({
        status: newStatus,
        changedAt: new Date(),
        reason: body.statusReason || 'Status updated via bridge',
      });
      existing.status = newStatus;
    }
    Object.assign(existing, updates);
    await existing.save();
    return { doc: existing, created: false, collection: 'Customer', enterpriseId: existing.customerId };
  }

  const customerId = await generateEnterpriseId('customer', Customer, 'customerId');
  const doc = await Customer.create({
    customerId,
    ...updates,
    statusHistory: [{
      status: body.status || 'Active',
      changedAt: new Date(),
      reason: 'Customer registered',
    }],
  });
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

    // Server-side weight validation
    if (body.weight !== undefined && body.weight !== null && body.weight !== '') {
      const numericWeight = parseFloat(body.weight);
      if (isNaN(numericWeight) || numericWeight <= 0) {
        return res.status(400).json({ success: false, error: '"weight" must be a positive number.' });
      }
    }

    const senderEmail = body.sender?.email || body.senderEmail || '';
    const recipientEmail = body.recipient?.email || body.recipientEmail || '';
    const parcelCategory = body.accountCategory || categorizeEmail(senderEmail || recipientEmail);

    const update = {
      trackingNumber,
      senderName,
      receiverName,
      item: body.item,
      accountCategory: parcelCategory,
      ...pickDefined(body, ['weight', 'value', 'origin', 'destination', 'status', 'riderId', 'sellerId', 'recipientEmail', 'podPhoto']),
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

    // Broadcast SSE event to connected admin clients
    sseBroadcaster.broadcast('parcel-synced', {
      trackingNumber: doc.trackingNumber,
      senderName,
      receiverName,
      status: doc.status,
      accountCategory: doc.accountCategory,
      created,
      timestamp: new Date().toISOString(),
    });

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
// POST /api/bridge/sync-issue
// Android Issue.js -> Web Issue.js
// ══════════════════════════════════════════════════════════════════════
router.post('/sync-issue', async (req, res) => {
  const body = req.body || {};
  try {
    const ticketId = (body.ticketId || '').toString().trim().toUpperCase();
    const trackingNumber = (body.trackingNumber || '').toString().trim().toUpperCase();

    if (!ticketId || !trackingNumber) {
      return res.status(400).json({ success: false, error: '"ticketId" and "trackingNumber" are required.' });
    }

    const issueCategory = body.accountCategory || categorizeEmail(body.reporterEmail || '');

    const update = {
      ticketId,
      trackingNumber,
      category: body.category || 'Other',
      description: body.description || '',
      evidenceImages: Array.isArray(body.evidenceImages) ? body.evidenceImages : (body.evidenceImages ? [body.evidenceImages] : []),
      reporterName: body.reporterName || 'Customer',
      reporterEmail: body.reporterEmail || '',
      reporterPhone: body.reporterPhone || '',
      reporterRole: body.reporterRole || 'customer',
      status: body.status || 'Open',
      accountCategory: issueCategory,
      adminNotes: body.adminNotes || '',
      updatedAt: new Date(),
    };

    let doc = await Issue.findOne({ ticketId });
    let created = false;
    if (doc) {
      Object.assign(doc, update);
      await doc.save();
    } else {
      doc = await Issue.create(update);
      created = true;
    }

    // Broadcast SSE event to connected admin clients
    sseBroadcaster.broadcast('issue-synced', {
      ticketId: doc.ticketId,
      trackingNumber: doc.trackingNumber,
      category: doc.category,
      status: doc.status,
      accountCategory: doc.accountCategory,
      created,
      timestamp: new Date().toISOString(),
    });

    return res.status(created ? 201 : 200).json({
      success: true,
      message: `Issue ticket ${ticketId} ${created ? 'created' : 'updated'} successfully.`,
      data: doc,
    });
  } catch (err) {
    logBridgeError('sync-issue', err, body);
    return res.status(statusForError(err)).json({ success: false, error: 'Failed to sync issue record.', details: err.message });
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

    // Broadcast SSE event to connected admin clients
    sseBroadcaster.broadcast('location-synced', {
      parcelId,
      lat,
      lng,
      timestamp: new Date().toISOString(),
    });

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

// ── RECEIVE STATUS: Rider status transitions from Android ────────────────
// Accepts rider terminal slider swipes (Out for Delivery, Delivered, Returning, Returned)
router.post('/receive-status', async (req, res) => {
  try {
    const { trackingId, status, riderId, riderName, podPhoto, timestamp } = req.body;
    if (!trackingId || !status) {
      return res.status(400).json({ success: false, error: '"trackingId" and "status" are required.' });
    }

    const parcel = await Parcel.findOne({ trackingNumber: trackingId });
    if (!parcel) {
      return res.status(404).json({ success: false, error: `Parcel not found for tracking: ${trackingId}` });
    }

    const allowedStatuses = ['Pending', 'Picked Up', 'In Transit', 'Out for Delivery', 'Delivered', 'Returning', 'Returned', 'Cancelled'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: `Invalid status: ${status}. Allowed: ${allowedStatuses.join(', ')}` });
    }

    parcel.status = status;
    if (podPhoto) parcel.podPhoto = podPhoto;
    parcel.events.push({
      timestamp: timestamp || new Date().toISOString(),
      location: parcel.destination || '',
      status: status,
      description: `Status updated to ${status} via Android bridge`,
    });
    await parcel.save();

    sseBroadcaster.broadcast('parcel-synced', {
      trackingNumber: parcel.trackingNumber,
      status: parcel.status,
      updatedAt: new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      message: `Parcel status updated to "${status}".`,
      data: { trackingNumber: parcel.trackingNumber, status: parcel.status },
    });
  } catch (err) {
    logBridgeError('receive-status', err, req.body);
    return res.status(500).json({ success: false, error: 'Failed to receive status update.', details: err.message });
  }
});

// ── RECEIVE ISSUE STATUS: Admin investigation status push to Android ─────
router.post('/receive-issue-status', async (req, res) => {
  try {
    const { ticketId, status, adminNotes } = req.body;
    if (!ticketId || !status) {
      return res.status(400).json({ success: false, error: '"ticketId" and "status" are required.' });
    }

    const issue = await Issue.findOne({ ticketId });
    if (!issue) {
      return res.status(404).json({ success: false, error: `Issue not found for ticket: ${ticketId}` });
    }

    const allowedStatuses = ['Open', 'Under Investigation', 'Resolved', 'Closed'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: `Invalid status: ${status}. Allowed: ${allowedStatuses.join(', ')}` });
    }

    issue.status = status;
    if (adminNotes) issue.adminNotes = adminNotes;
    if (status === 'Resolved' || status === 'Closed') issue.resolvedAt = new Date();
    await issue.save();

    sseBroadcaster.broadcast('issue-status-updated', {
      ticketId: issue.ticketId,
      status: issue.status,
      updatedAt: new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      message: `Issue ${ticketId} status updated to "${status}".`,
      data: { ticketId: issue.ticketId, status: issue.status },
    });
  } catch (err) {
    logBridgeError('receive-issue-status', err, req.body);
    return res.status(500).json({ success: false, error: 'Failed to receive issue status update.', details: err.message });
  }
});

// ── BRIDGE HEALTH CHECK ─────────────────────────────────────────────────
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Bridge operational',
    timestamp: new Date().toISOString(),
    routes: ['sync-user', 'sync-parcel', 'sync-issue', 'sync-location', 'receive-status', 'receive-issue-status'],
  });
});
