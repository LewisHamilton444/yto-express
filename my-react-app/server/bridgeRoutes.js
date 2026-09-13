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
const AdminNotification = require('./models/AdminNotification');

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

// ── Account category (removed 2026-09-13) ─────────────────────────────
// The REAL/DEMO realm partition was removed — the platform is single-realm
// (REAL only). categorizeEmail is kept as a one-liner purely for wire-format
// compatibility with the Android bridge client.
const categorizeEmail = () => 'REAL';

// ── Enterprise ID generation ─────────────────────────────────────────────
// NEW FORMAT (2026-09-11, approved): compact Web-minted enterprise IDs —
//   Seller   YTOS<YYYY><4-digit seq>   e.g. YTOS20260001
//   Customer YTOC<YYYY><4-digit seq>   e.g. YTOC20260001
//   Rider    YTOR<YYYY><4-digit seq>   e.g. YTOR20260001
// Sequence continues per collection per year across the migration: rows in
// BOTH the legacy (YTO-SELL-YYYY-#####) and compact (YTOSYYYY####) shapes
// are counted so new IDs never collide with grandfathered ones. Legacy rows
// (incl. the pinned DEMO1 seed fixtures) remain valid and still resolve via
// the find-by-email merge in the sync* helpers. YTO-ADM-XXX (3-digit, no
// year) is kept for completeness — the mobile app never registers admins.
// Collision-safe: each candidate is probed against the collection before
// being returned; a racing duplicate insert still answers 409 via
// statusForError(E11000).
const ENTERPRISE_ID_SPECS = {
  customer:     { compactPrefix: 'YTOC', legacyPrefix: 'CUST' },
  seller:       { compactPrefix: 'YTOS', legacyPrefix: 'SELL' },
  rider:        { compactPrefix: 'YTOR', legacyPrefix: 'RIDE' },
  super_admin:  { compactPrefix: 'YTOADM', legacyPrefix: 'ADM' },
};

async function generateEnterpriseId(kind, Model, idField) {
  const spec = ENTERPRISE_ID_SPECS[kind];
  if (!spec) throw new Error(`No enterprise ID prefix configured for "${kind}".`);

  if (kind === 'super_admin') {
    const count = await Model.countDocuments({ [idField]: { $regex: '^YTO-ADM-' } });
    return `YTO-ADM-${String(count + 1).padStart(3, '0')}`;
  }

  const year = new Date().getFullYear();
  const compactPrefix = `${spec.compactPrefix}${year}`;
  const legacyCount = await Model.countDocuments({ [idField]: { $regex: `^YTO-${spec.legacyPrefix}-${year}-` } });
  const compactCount = await Model.countDocuments({ [idField]: { $regex: `^${compactPrefix}\\d{4}$` } });
  const seq = Math.max(legacyCount, compactCount);

  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = `${compactPrefix}${String(seq + attempt + 1).padStart(4, '0')}`;
    const clash = await Model.findOne({ [idField]: candidate }).lean();
    if (!clash) return candidate;
  }
  throw new Error(`Unable to mint a unique enterprise ID for "${kind}" after 20 attempts.`);
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

// ── Web-generated parcel artifacts (returned to the mobile backend) ──────
// Canonical QR payload + POD geofence spec are minted HERE on sync-parcel
// and handed back in the response so the Android side persists them on the
// Shipment. The Web is the authority for identity artifacts; the app only
// renders/consumes them.

// Enterprise-party resolution for the QR payload: seller by sender email,
// customer by recipient email. Unresolvable party -> null (its segment is
// simply omitted from the payload).
async function resolveSellerEnterpriseId(email) {
  if (!isValidEmail(email)) return null;
  const doc = await Seller.findOne({ email: String(email).trim().toLowerCase() }).select('registrationId').lean();
  return doc?.registrationId || null;
}

async function resolveCustomerEnterpriseId(email) {
  if (!isValidEmail(email)) return null;
  const doc = await Customer.findOne({ email: String(email).trim().toLowerCase() }).select('customerId').lean();
  return doc?.customerId || null;
}

// YTOQR1|<trackingNumber>|<sellerEntId>|<customerEntId>
// Rider ID is deliberately excluded: rider assignment is dynamic post-booking
// and would force payload regeneration. With no resolvable enterprise party
// the payload degrades to the plain tracking number (legacy-compatible — the
// app's scanners treat any non-YTOQR1 payload as a raw tracking ID).
function buildParcelQrPayload(trackingNumber, sellerEntId, customerEntId) {
  const segments = [trackingNumber, sellerEntId, customerEntId].filter(isNonEmptyString);
  return segments.length > 1 ? `YTOQR1|${segments.join('|')}` : trackingNumber;
}

// POD delivery-zone ring derived from the parcel's delivery coordinates
// (GeoJSON [lng, lat] as sent by the mobile BridgeClient). The 100m radius
// mirrors the Android geofence-gated POD rule. Mobile sends [0,0] when it
// has no coordinates — treated as absent so web-created parcels keep no
// geofence instead of a ring at null island.
const POD_GEOFENCE_RADIUS_METERS = 100;

function buildTrackingGeofence(body) {
  const delivery = body.deliveryCoordinates || body.recipient?.location?.coordinates;
  const isUsablePair = Array.isArray(delivery)
    && delivery.length === 2
    && delivery.every((n) => typeof n === 'number' && Number.isFinite(n))
    && !(delivery[0] === 0 && delivery[1] === 0);
  if (!isUsablePair) return undefined;
  return {
    kind: 'POD_RING',
    center: { lat: delivery[1], lng: delivery[0] },
    radiusMeters: POD_GEOFENCE_RADIUS_METERS,
  };
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
  const updates = { fullName: body.name, email };
  if (body.phone !== undefined) updates.phone = body.phone;
  if (body.idNumber !== undefined) updates.idNumber = body.idNumber;
  if (body.idType !== undefined) updates.idType = body.idType;
  if (body.storeName !== undefined) updates.storeName = body.storeName;
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
  const updates = { riderName: body.name, email };
  if (body.phone !== undefined) updates.phone = body.phone;
  // Real-time duty flag from the Android rider profile toggle. Guarded with
  // !== undefined so a re-sync that omits the field never clobbers a
  // previously-synced true value back to false (pickDefined-style contract).
  if (body.isOnDuty !== undefined) updates.isOnDuty = body.isOnDuty;
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
  const updates = { fullName: body.name, email };
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
    // Android BridgeClient.syncParcel carries the seller email as sellerEmail
    // (nested sender.email is absent in its flattened payload). Without this
    // fallback the QR payload's seller-ID resolution silently got ''. Also
    // persisted below so the admin From card shows the merchant's email.
    const sellerEmail = body.sellerEmail || '';
    const resolvedSenderEmail = senderEmail || sellerEmail;
    // Contact phones arrive either flattened (Android BridgeClient.syncParcel:
    // senderPhone / recipientPhone) or nested (sender.phone / recipient.phone);
    // recipient maps to the receiverPhone column.
    const senderPhone = (body.sender?.phone || body.senderPhone || '').toString().trim();
    const receiverPhone = (body.recipient?.phone || body.recipientPhone || '').toString().trim();

    // Web-generated identity artifacts (see helpers above): canonical QR
    // payload + POD geofence spec. Persisted on the Parcel doc AND echoed in
    // the response so the mobile backend can persist them on the Shipment.
    const sellerEnterpriseId = await resolveSellerEnterpriseId(resolvedSenderEmail);
    const customerEnterpriseId = await resolveCustomerEnterpriseId(recipientEmail);
    const qrPayload = buildParcelQrPayload(trackingNumber, sellerEnterpriseId, customerEnterpriseId);
    const trackingGeofence = buildTrackingGeofence(body);

    const update = {
      trackingNumber,
      senderName,
      receiverName,
      senderPhone,
      receiverPhone,
      senderEmail: resolvedSenderEmail,
      item: body.item,
      qrPayload,
      sellerEnterpriseId: sellerEnterpriseId || '',
      customerEnterpriseId: customerEnterpriseId || '',
      ...(trackingGeofence ? { trackingGeofence } : {}),
      ...pickDefined(body, ['weight', 'value', 'origin', 'destination', 'status', 'riderId', 'sellerId', 'recipientEmail', 'podPhoto', 'paymentMode', 'codAmount', 'packageCount', 'packageCategory', 'notes', 'deliveryFee', 'packageType', 'dimensions', 'estimatedDeliveryDate', 'actualDeliveryDate']),
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
      created,
      timestamp: new Date().toISOString(),
    });

    return res.status(created ? 201 : 200).json({
      success: true,
      message: `Parcel ${created ? 'created' : 'updated'} successfully.`,
      data: {
        trackingNumber: doc.trackingNumber,
        _id: doc._id,
        status: doc.status,
        created,
        qrPayload: doc.qrPayload || qrPayload,
        sellerEnterpriseId: doc.sellerEnterpriseId || '',
        customerEnterpriseId: doc.customerEnterpriseId || '',
        trackingGeofence: doc.trackingGeofence || trackingGeofence || null,
      },
    });
  } catch (err) {
    logBridgeError('sync-parcel', err, body);
    return res.status(statusForError(err)).json({ success: false, error: 'Failed to sync parcel record.', details: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════
// POST /api/bridge/sync-duty-status
// Lightweight duty-toggle sync fired by the Android backend's
// PUT auth/duty-status. Upserts ONLY the isOnDuty flag on the matching
// rider (merge-by-email), creating a minimal rider record when the toggle
// arrives before any full sync-user — the next full sync-user re-sync
// fills in the rest.
// ══════════════════════════════════════════════════════════════════════
router.post('/sync-duty-status', async (req, res) => {
  const body = req.body || {};
  try {
    if (!isValidEmail(body.email)) {
      return res.status(400).json({ success: false, error: '"email" is required and must be a valid address.' });
    }
    if (typeof body.isOnDuty !== 'boolean') {
      return res.status(400).json({ success: false, error: '"isOnDuty" must be a boolean.' });
    }

    const normalizedEmail = String(body.email).trim().toLowerCase();
    let rider = await Rider.findOne({ email: normalizedEmail });
    let created = false;
    if (rider) {
      if (rider.isOnDuty !== body.isOnDuty) {
        rider.isOnDuty = body.isOnDuty;
        await rider.save();
      }
    } else {      // Minimal record so the toggle state is never lost when duty flips
      // happen before registration sync.
      const registrationId = await generateEnterpriseId('rider', Rider, 'registrationId');
      rider = await Rider.create({
        registrationId,
        riderName: isNonEmptyString(body.name) ? body.name : normalizedEmail.split('@')[0],
        email: normalizedEmail,
        isOnDuty: body.isOnDuty,
        statusHistory: [{
          status: 'Active',
          changedAt: new Date(),
          reason: 'Created by duty-status sync (pre-registration toggle)',
        }],
      });
      created = true;
    }

    sseBroadcaster.broadcast('duty-status-synced', {
      email: normalizedEmail,
      riderName: rider.riderName,
      isOnDuty: rider.isOnDuty,
      created,
      timestamp: new Date().toISOString(),
    });

    return res.status(created ? 201 : 200).json({
      success: true,
      message: `Duty status synced (isOnDuty: ${rider.isOnDuty}).`,
      data: { email: normalizedEmail, isOnDuty: rider.isOnDuty, created },
    });
  } catch (err) {
    logBridgeError('sync-duty-status', err, body);
    return res.status(statusForError(err)).json({ success: false, error: 'Failed to sync duty status.', details: err.message });
  }
});// ══════════════════════════════════════════════════════════════════════
// POST /api/bridge/sync-notification
// Android Notification.js -> Web AdminNotification.js. Persisted (not just
// SSE) so the admin Notifications panel has a durable, queryable feed of
// app-originated events: bookings, pickups, deliveries, POD uploads, issue
// tickets. Deduped on (notificationId, title, createdAt) so a bridge retry
// never doubles an entry.
// ══════════════════════════════════════════════════════════════════════
router.post('/sync-notification', async (req, res) => {
  const body = req.body || {};
  try {
    if (!isNonEmptyString(body.title)) {
      return res.status(400).json({ success: false, error: '"title" is required.' });
    }

    const role = ['customer', 'seller', 'rider', 'admin'].includes(String(body.role).toLowerCase())
      ? String(body.role).toLowerCase()
      : 'customer';
    const createdAt = body.createdAt && !isNaN(new Date(body.createdAt).getTime())
      ? new Date(body.createdAt)
      : new Date();

    // Retry-safe dedupe: same Android notification id, same title, same
    // original timestamp => the same logical event.
    const dedupeFilter = {
      title: body.title,
      relatedId: body.relatedId || '',
      createdAt: createdAt,
    };
    const existing = await AdminNotification.findOne(dedupeFilter).lean();
    if (existing) {
      return res.status(200).json({ success: true, message: 'Notification already synced (dedupe).', data: { _id: existing._id, deduped: true } });
    }

    const doc = await AdminNotification.create({
      notificationId: body.notificationId || '',
      role,
      title: body.title,
      message: body.message || '',
      type: body.type || 'system',
      relatedId: body.relatedId || '',
      source: body.source || 'mobile-app',
      createdAt,
    });

    sseBroadcaster.broadcast('notification-synced', {
      _id: doc._id,
      role: doc.role,
      title: doc.title,
      message: doc.message,
      type: doc.type,
      relatedId: doc.relatedId,
      createdAt: doc.createdAt,
    });

    return res.status(201).json({
      success: true,
      message: 'Notification synced successfully.',
      data: { _id: doc._id },
    });
  } catch (err) {
    logBridgeError('sync-notification', err, body);
    return res.status(statusForError(err)).json({ success: false, error: 'Failed to sync notification.', details: err.message });
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
      adminNotes: body.adminNotes || '',
      updatedAt: new Date(),
    };

    // Preserve the mobile-side submission time as the source of truth for
    // createdAt; web arrival time stays only as the fallback for legacy
    // payloads that omit it.
    const mobileCreatedAt = body.createdAt ? new Date(body.createdAt) : null;
    if (mobileCreatedAt && !Number.isNaN(mobileCreatedAt.getTime())) {
      update.createdAt = mobileCreatedAt;
    }

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
    // Android BridgeClient.sendStatus() sends { trackingNumber, status } —
    // accept trackingNumber FIRST and trackingId as legacy alias (the field
    // mismatch previously 400'd every rider status transition from the app).
    const trackingId = (req.body.trackingNumber || req.body.trackingId || '').toString().trim();
    const { status, podPhoto, timestamp } = req.body;
    const riderId = (req.body.riderId || '').toString();
    const riderName = (req.body.riderName || '').toString();
    const riderLat = Number(req.body.riderLat);
    const riderLng = Number(req.body.riderLng);
    if (!trackingId || !status) {
      return res.status(400).json({ success: false, error: '"trackingNumber" and "status" are required.' });
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
    // Last-known rider position (Android sends the POD fix when available);
    // guards keep a malformed payload from stamping non-numeric coords.
    if (Number.isFinite(riderLat) && Number.isFinite(riderLng)) {
      parcel.riderLat = riderLat;
      parcel.riderLng = riderLng;
    }
    parcel.events.push({
      time: timestamp || new Date().toISOString(),
      event: `Status updated to ${status} via Android bridge${riderName ? ` by ${riderName}` : ''}`,
      location: parcel.destination || '',
      status: status,
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

// ── POLL CHANGES: Delta feed for the Android backend ────────────────────
// GET /api/bridge/poll-changes?since=<ISO timestamp>
// Mirrors the mobile backend's route of the same name (Android BridgeClient
// .pollChanges() targets the WEB side, which previously 404'd). Returns web
// records updated after `since` so the app can pull deltas it missed while
// offline. Capped at 100 docs per collection per call.
router.get('/poll-changes', async (req, res) => {
  try {
    const since = req.query.since;
    if (!since) {
      return res.status(400).json({ success: false, error: 'since parameter is required.' });
    }
    const sinceDate = new Date(since);
    if (isNaN(sinceDate.getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid timestamp format.' });
    }

    const [parcels, sellers, riders, customers] = await Promise.all([
      Parcel.find({ updatedAt: { $gt: sinceDate } }).limit(100).lean(),
      Seller.find({ updatedAt: { $gt: sinceDate } }).limit(100).lean(),
      Rider.find({ updatedAt: { $gt: sinceDate } }).limit(100).lean(),
      Customer.find({ updatedAt: { $gt: sinceDate } }).limit(100).lean(),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        parcels,
        sellers,
        riders,
        customers,
        lastSync: new Date().toISOString(),
        counts: { parcels: parcels.length, sellers: sellers.length, riders: riders.length, customers: customers.length },
      },
    });
  } catch (err) {
    logBridgeError('poll-changes', err, req.query);
    return res.status(statusForError(err)).json({ success: false, error: 'Failed to poll changes.', details: err.message });
  }
});

// ── BRIDGE HEALTH CHECK ─────────────────────────────────────────────────
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Bridge operational',
    timestamp: new Date().toISOString(),
    routes: ['sync-user', 'sync-duty-status', 'sync-parcel', 'sync-issue', 'sync-location', 'sync-notification', 'receive-status', 'receive-issue-status', 'poll-changes'],
  });
});
