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
const mongoose = require('mongoose');

const Seller         = require('./models/Seller');
const Rider          = require('./models/Rider');
const Customer       = require('./models/Customer');
const sseBroadcaster = require('./utils/sseBroadcaster');
const Parcel         = require('./models/Parcel');
const ParcelLocation = require('./models/ParcelLocation');
const Issue          = require('./models/Issue');
const AdminNotification = require('./models/AdminNotification');
const { logAudit }     = require('./utils/auditLog');
const { MAX_DELIVERY_ATTEMPTS, mapAppAttemptsToWeb } = require('./utils/deliveryAttempts');
const { mapAppEventsToWeb, mergeEvents } = require('./utils/parcelEvents');
const { resolveParcelCurrentLocation } = require('./utils/parcelLocationResolver');

// ── Shared-secret gate (fail CLOSED) ────────────────────────────────────
// These routes accept writes from another backend, not from the admin UI, so
// every one of them is locked behind a shared secret that BOTH sides set in
// their .env (BRIDGE_API_KEY on this side, WEB_BRIDGE_API_KEY on the mobile
// side — same value).
//
// When the key is missing this now answers 503 and denies every bridge call
// instead of calling next(). Continuing without a key would mean a deploy
// that forgot to set it silently accepted unauthenticated writes to users,
// parcels, issues and notifications. The mobile backend already fails closed
// the same way, so a half-configured pair now fails loudly at the health
// check rather than quietly trusting requests.
router.use((req, res, next) => {
  const expected = process.env.BRIDGE_API_KEY;
  if (!expected) {
    return res.status(503).json({ success: false, error: 'Bridge API key not configured. All bridge access denied.' });
  }
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

// Audit (SH-09): parcel changes that arrive from the rider app are logged with
// source 'rider_app' so the Audit Trail can tell them apart from admin-panel
// changes. The actor is the rider's registrationId when the app sends one.
function auditRiderAppParcelChange(req, trackingNumber, before, after, riderId) {
  const actor = { id: riderId || '', email: '', role: 'rider_app' };
  if (String(before.status || '') !== String(after.status || '')) {
    logAudit(req, {
      action: 'parcel_status_changed',
      target: trackingNumber,
      details: { from: before.status || '', to: after.status || '' },
      actor,
      source: 'rider_app',
    });
  }
  if (String(before.riderId || '') !== String(after.riderId || '')) {
    logAudit(req, {
      action: 'rider_assigned',
      target: trackingNumber,
      details: { from: String(before.riderId || ''), to: String(after.riderId || '') },
      actor,
      source: 'rider_app',
    });
  }
}

function statusForError(err) {
  if (err.name === 'ValidationError') return 400; // bad/missing fields Mongoose itself rejected
  if (err.code === 11000) return 409;              // duplicate key — usually a racing re-sync
  return 500;
}

// ── Demo-email guard (REAL-only Web, 2026-09-18) ──────────────────────────
// The canonical mobile test logins (seller/customer/rider@gmail.com) keep
// their copies in the APP database for testing — they must NOT resurrect in
// the WEB database via the bridge. The gate below rejects them:
const DEMO_SYNC_EMAILS = new Set([
  'seller@gmail.com',
  'customer@gmail.com',
  'rider@gmail.com',
]);

function isDemoSyncEmail(email) {
  return DEMO_SYNC_EMAILS.has(String(email || '').trim().toLowerCase());
}

// ── Enterprise ID generation ─────────────────────────────────────────────
// NEW FORMAT (2026-09-11, approved): compact Web-minted enterprise IDs —
//   Seller   YTOS<YYYY><4-digit seq>   e.g. YTOS20260001
//   Customer YTOC<YYYY><4-digit seq>   e.g. YTOC20260001
//   Rider    YTOR<YYYY><4-digit seq>   e.g. YTOR20260001
// Sequence continues per collection per year across the migration: rows in
// BOTH the legacy (YTO-SELL-YYYY-#####) and compact (YTOSYYYY####) shapes
// are counted so new IDs never collide with grandfathered ones. Legacy rows
// remain valid and still resolve via the find-by-email merge in the sync*
// helpers (demo-email senders are rejected earlier at the route gate, so no
// new demo rows can be created through the bridge). YTO-ADM-XXX (3-digit, no
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

// ── Return handover + pickup point (app parity, 2026-10-12) ──────────────
// The mobile Shipment keeps a returnFlow subdocument when a rider hands a
// parcel back (signer name/role, merchant signature, optional condition photo,
// handover fix). The sync-parcel whitelist dropped it, so a completed return
// reached the portal as a bare "Returned" status. Bounds mirror the mobile
// controller exactly so this side can never store a photo the app refused:
// signature <= 100KB of base64, condition photo <= 7MB, data URLs only.
const SIGNATURE_MAX_B64 = 100 * 1024;
const CONDITION_MAX_B64 = 7 * 1024 * 1024;
const PHOTO_DATA_URL_RE = /^data:image\/(jpe?g|png|webp);base64,(.+)$/i;

function isStorablePhoto(value, maxB64) {
  if (typeof value !== 'string') return false;
  const match = value.trim().match(PHOTO_DATA_URL_RE);
  return !!match && match[2].length <= maxB64;
}

function mapAppReturnFlow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const signerName = String(raw.signerName || '').trim();
  // The app refuses to complete a return without a signer, so a handover
  // without one is not a handover — drop it rather than store a blank shell.
  if (!signerName) return null;
  const signature = typeof raw.signaturePhoto === 'string' ? raw.signaturePhoto.trim() : '';
  // Handover fix, in the app's [lng, lat] order and under the app's own bounds
  // (lat +/-90, lng +/-180). The mobile controller stores null for anything
  // outside them, so an out-of-range pair must never become a stored fix here.
  const coords = Array.isArray(raw.riderCoords) && raw.riderCoords.length === 2
    ? [Number(raw.riderCoords[0]), Number(raw.riderCoords[1])]
    : null;
  const coordsInRange = !!coords
    && Number.isFinite(coords[0]) && Number.isFinite(coords[1])
    && coords[1] >= -90 && coords[1] <= 90
    && coords[0] >= -180 && coords[0] <= 180;
  const role = String(raw.signerRole || '').trim().toUpperCase();
  const conditionPhoto = typeof raw.conditionPhoto === 'string' ? raw.conditionPhoto.trim() : '';
  return {
    type: 'RETURN_TO_SENDER',
    signerName,
    signerRole: ['SELLER', 'CUSTOMER'].includes(role) ? role : 'SELLER',
    signaturePhoto: isStorablePhoto(signature, SIGNATURE_MAX_B64) ? signature : '',
    conditionPhoto: isStorablePhoto(conditionPhoto, CONDITION_MAX_B64) ? conditionPhoto : null,
    riderCoords: coordsInRange ? coords : null,
    hubId: raw.hubId ? String(raw.hubId) : null,
    completedAt: raw.completedAt ? new Date(raw.completedAt) : null,
  };
}

// The app sends pickupCoordinates as GeoJSON [lng, lat]. An unresolved pickup
// arrives as the [0,0] placeholder, and a null-island fix is worse than none,
// so it writes nothing — the same rule the delivery point already follows.
function pickupPoint(coords) {
  let pair = coords;
  if (coords && Array.isArray(coords.coordinates)) pair = coords.coordinates;
  if (!Array.isArray(pair) || pair.length !== 2) return {};
  const lng = Number(pair[0]);
  const lat = Number(pair[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return {};
  if (lat === 0 && lng === 0) return {};
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return {};
  return { pickupLat: lat, pickupLng: lng };
}

// ── Wire party identity (F2, 2026-10-12) ────────────────────────────────
// The mobile app used to send its OWN Mongo ids for the courier and the
// merchant, and this backend stored them verbatim — so every app-synced
// parcel showed an unresolvable courier in Rider Reports / the Geofence
// Monitor, and an unassigned app parcel blanked an office assignment ('' was
// written). The wire contract now carries the Web-minted identity instead:
//   rider:  riderEnterpriseId (Rider.registrationId) | riderEmail | riderId*
//   seller: sellerEnterpriseId (Seller.registrationId) | senderEmail | sellerId*
// (*legacy field, accepted ONLY when it actually resolves here)
// Returns undefined = leave the stored value untouched, '' = explicit
// unassign, an id = assign. An unresolvable non-empty value is logged and
// treated as untouched — a dead id is never written.
// The stored id differs by party because that is what each consumer expects:
// Parcel.riderId is matched against Rider.registrationId (or the Rider _id)
// by the portal's reports, while Parcel.sellerId is used with
// Seller.findById() server-side.
// Escapes a user-supplied string before it becomes part of a RegExp, so a
// courier name containing regex characters cannot widen or break the query.
const escapeRegExp = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function resolveWirePartyId({ Model, idField, enterpriseId, foreignId, email, label }) {
  const has = (v) => v !== undefined && v !== null;
  const idOf = (doc) => (doc && doc[idField] !== undefined && doc[idField] !== null ? String(doc[idField]) : null);

  if (has(enterpriseId) || has(email)) {
    const ent = String(enterpriseId || '').trim();
    const mail = String(email || '').trim().toLowerCase();
    if (!ent && !mail) return '';
    if (ent) {
      const byEnterpriseId = await Model.findOne({ registrationId: ent }).select(idField).lean();
      if (byEnterpriseId) return idOf(byEnterpriseId);
    }
    if (mail) {
      const byEmail = await Model.findOne({ email: mail }).select(idField).lean();
      if (byEmail) return idOf(byEmail);
    }
    logBridgeError(`sync-parcel:${label}`, new Error(`"${ent || mail}" does not resolve on this backend - value left unchanged`), {});
    return undefined;
  }

  if (has(foreignId)) {
    const raw = String(foreignId).trim();
    if (!raw) return '';
    const byRegistrationId = await Model.findOne({ registrationId: raw }).select(idField).lean();
    if (byRegistrationId) return idOf(byRegistrationId);
    if (/^[a-f0-9]{24}$/i.test(raw)) {
      const byObjectId = await Model.findById(raw).select(idField).lean().catch(() => null);
      if (byObjectId) return idOf(byObjectId);
    }
    logBridgeError(`sync-parcel:${label}-legacy`, new Error(`ignored foreign ${label} id "${raw}"`), {});
    return undefined;
  }

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
  let delivery = null;
  if (Array.isArray(body.deliveryCoordinates)) {
    delivery = body.deliveryCoordinates;
  } else if (body.deliveryCoordinates && Array.isArray(body.deliveryCoordinates.coordinates)) {
    delivery = body.deliveryCoordinates.coordinates;
  } else if (body.recipient && body.recipient.location && Array.isArray(body.recipient.location.coordinates)) {
    delivery = body.recipient.location.coordinates;
  } else if (body.deliveryCoordinates && typeof body.deliveryCoordinates.lat === 'number' && typeof body.deliveryCoordinates.lng === 'number') {
    return {
      kind: 'POD_RING',
      center: { lat: body.deliveryCoordinates.lat, lng: body.deliveryCoordinates.lng },
      radiusMeters: POD_GEOFENCE_RADIUS_METERS,
    };
  }

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

    // REAL-only Web: canonical mobile demo logins must not create Web rows.
    if (isDemoSyncEmail(normalizedEmail)) {
      return res.status(200).json({
        success: true,
        message: 'Demo account skipped (Web portal keeps real records only).',
        data: { skipped: true, reason: 'demo-account', email: normalizedEmail },
      });
    }

    const syncByRole = { seller: syncSeller, rider: syncRider, customer: syncCustomer };
    const result = await syncByRole[normalizedRole](body, normalizedEmail);

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
        created: result.created,
      },
    });
  } catch (err) {
    logBridgeError('sync-user', err, body);
    return res.status(statusForError(err)).json({ success: false, error: 'Failed to sync user record.' });
  }
});

const BULACAN_MUNICIPALITIES = [
  'Pulilan', 'Malolos', 'Baliuag', 'Baliwag', 'Calumpit', 'Plaridel',
  'Guiguinto', 'Bocaue', 'Meycauayan', 'Marilao', 'San Jose del Monte',
  'Santa Maria', 'Angat', 'Norzagaray', 'San Ildefonso', 'San Miguel',
  'San Rafael', 'Pandi', 'Paombong', 'Hagonoy', 'Bulakan', 'Balagtas',
  'Obando', 'Bustos', 'Doña Remedios Trinidad', 'Dona Remedios Trinidad'
];

const METRO_MANILA_CITIES = [
  'Manila', 'Quezon City', 'Caloocan', 'Las Piñas', 'Las Pinas', 'Makati',
  'Malabon', 'Mandaluyong', 'Marikina', 'Muntinlupa', 'Navotas', 'Parañaque',
  'Paranaque', 'Pasay', 'Pasig', 'San Juan', 'Taguig', 'Valenzuela', 'Pateros'
];

const KNOWN_PH_PROVINCES = [
  'Bulacan', 'Metro Manila', 'Cavite', 'Laguna', 'Batangas', 'Rizal',
  'Pampanga', 'Bataan', 'Zambales', 'Nueva Ecija', 'Tarlac', 'Pangasinan'
];

function extractLocationFromAddress(address) {
  if (!address || typeof address !== 'string') {
    return { city: '', province: '', postalCode: '', country: 'Philippines' };
  }
  const cleanStr = address.trim();
  if (!cleanStr) {
    return { city: '', province: '', postalCode: '', country: 'Philippines' };
  }

  let postalCode = '';
  const postalMatch = cleanStr.match(/\b(\d{4})\b/);
  if (postalMatch) postalCode = postalMatch[1];

  let province = '';
  for (const prov of KNOWN_PH_PROVINCES) {
    if (new RegExp(`\\b${prov}\\b`, 'i').test(cleanStr)) {
      province = prov;
      break;
    }
  }

  let city = '';
  for (const bTown of BULACAN_MUNICIPALITIES) {
    if (new RegExp(`\\b${bTown}\\b`, 'i').test(cleanStr)) {
      city = bTown === 'Baliwag' ? 'Baliuag' : bTown;
      if (!province) province = 'Bulacan';
      break;
    }
  }

  if (!city) {
    for (const mmCity of METRO_MANILA_CITIES) {
      if (new RegExp(`\\b${mmCity}\\b`, 'i').test(cleanStr)) {
        city = mmCity;
        if (!province) province = 'Metro Manila';
        break;
      }
    }
  }

  if (!city) {
    const parts = cleanStr.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length >= 3) {
      city = parts[parts.length - 2];
    } else if (parts.length === 2) {
      city = parts[0];
      if (!province) province = parts[1];
    }
  }

  if (city && BULACAN_MUNICIPALITIES.some(b => b.toLowerCase() === city.toLowerCase())) {
    province = 'Bulacan';
  } else if (city && METRO_MANILA_CITIES.some(m => m.toLowerCase() === city.toLowerCase())) {
    if (!province) province = 'Metro Manila';
  }

  return { city, province, postalCode, country: 'Philippines' };
}

function extractCityFromAddress(address) {
  const loc = extractLocationFromAddress(address);
  return loc.city;
}

async function syncSeller(body, email) {
  const updates = { fullName: body.name, email };
  if (body.phone !== undefined) updates.phone = body.phone;
  if (body.idNumber !== undefined) updates.idNumber = body.idNumber;
  if (body.idType !== undefined) updates.idType = body.idType;
  if (body.storeName !== undefined) updates.storeName = body.storeName;
  if (body.accountNumber !== undefined) updates.accountNumber = body.accountNumber;
  Object.assign(updates, pickDefined(body, ['address', 'city', 'state', 'country', 'postalCode', 'bankName', 'commissionRate', 'paymentCycle', 'warehouseAddress', 'operatingHours']));
  // D-16 photos: non-empty only. pickDefined would pass an empty string
  // through, which would wipe a stored photo — the bridge's blank-value rule
  // says a blank never propagates in either direction.
  if (isNonEmptyString(body.profilePhotoUrl)) updates.profilePhotoUrl = body.profilePhotoUrl;
  if (isNonEmptyString(body.coverPhotoUrl)) updates.coverPhotoUrl = body.coverPhotoUrl;

  // Mirror warehouseAddress <-> address and derive location fields
  if (!updates.address && body.warehouseAddress) {
    updates.address = body.warehouseAddress;
  }
  if (!updates.warehouseAddress && updates.address) {
    updates.warehouseAddress = updates.address;
  }

  const loc = extractLocationFromAddress(updates.address || updates.warehouseAddress || '');
  if (!updates.city && loc.city) updates.city = loc.city;
  if (!updates.state && loc.province) updates.state = loc.province;
  if (!updates.country) updates.country = loc.country || 'Philippines';
  if (!updates.postalCode && loc.postalCode) updates.postalCode = loc.postalCode;

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
  const initialStatus = body.status || 'PENDING_VERIFICATION';
  const doc = await Seller.create({
    registrationId,
    accountNumber,
    phone: body.phone || '',
    ...updates,
    status: initialStatus,
    statusHistory: [{
      status: initialStatus,
      changedAt: new Date(),
      reason: 'Seller registered',
    }],
  });
  return { doc, created: true, collection: 'Seller', enterpriseId: registrationId };
}

async function syncRider(body, email) {
  const updates = { riderName: body.name, email };
  if (body.phone !== undefined) updates.phone = body.phone;
  // Real-time duty flag from the Android rider profile toggle. Guarded with
  // !== undefined so a re-sync that omits the field never clobbers a
  // previously-synced true value back to false (pickDefined-style contract).
  if (body.isOnDuty !== undefined) updates.isOnDuty = body.isOnDuty;
  if (body.plateNumber !== undefined) updates.vehiclePlate = body.plateNumber;   // mobile plateNumber -> web vehiclePlate
  if (body.vehicleModel !== undefined) updates.vehicleType = body.vehicleModel;  // mobile vehicleModel -> web vehicleType
  if (body.accountNumber !== undefined) updates.accountNumber = body.accountNumber;
  if (body.deliveries !== undefined) updates.deliveries = Number(body.deliveries);
  else if (body.totalDeliveries !== undefined) updates.deliveries = Number(body.totalDeliveries);
  if (body.rating !== undefined) updates.rating = Number(body.rating);
  else if (body.riderRating !== undefined) updates.rating = Number(body.riderRating);
  Object.assign(updates, pickDefined(body, ['address', 'city', 'state', 'country', 'postalCode', 'bankName', 'licenseNumber', 'emergencyContactName', 'emergencyContactPhone', 'payoutRate', 'payoutCycle', 'assignedHub']));
  // D-16 photos: non-empty only, so a blank never clears a stored photo.
  if (isNonEmptyString(body.profilePhotoUrl)) updates.profilePhotoUrl = body.profilePhotoUrl;
  if (isNonEmptyString(body.coverPhotoUrl)) updates.coverPhotoUrl = body.coverPhotoUrl;

  // Auto-derive city, state, country, postalCode from address or assignedHub if omitted
  const loc = extractLocationFromAddress(updates.address || updates.assignedHub || '');
  if (!updates.city && loc.city) updates.city = loc.city;
  if (!updates.state && loc.province) updates.state = loc.province;
  if (!updates.country) updates.country = loc.country || 'Philippines';
  if (!updates.postalCode && loc.postalCode) updates.postalCode = loc.postalCode;

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
  const initialStatus = body.status || 'Pending';
  const doc = await Rider.create({
    registrationId,
    accountNumber,
    phone: body.phone || '',
    ...updates,
    status: initialStatus,
    statusHistory: [{
      status: initialStatus,
      changedAt: new Date(),
      reason: 'Rider registered',
    }],
  });
  return { doc, created: true, collection: 'Rider', enterpriseId: registrationId };
}

async function syncCustomer(body, email) {
  const updates = { fullName: body.name, email };
  Object.assign(updates, pickDefined(body, ['phone', 'address', 'city', 'deliveryInstructions']));

  // Auto-derive city from address/instructions if not explicitly passed
  if (!updates.city && updates.address) {
    updates.city = extractCityFromAddress(updates.address);
  }
  if (!updates.city && updates.deliveryInstructions) {
    updates.city = extractCityFromAddress(updates.deliveryInstructions);
  }

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
  const initialStatus = body.status || 'Active';
  const doc = await Customer.create({
    customerId,
    ...updates,
    status: initialStatus,
    statusHistory: [{
      status: initialStatus,
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

    // REAL-only Web: parcels routed through the canonical mobile demo logins
    // stay in the App database — do not materialize demo parcels here.
    if (isDemoSyncEmail(resolvedSenderEmail) || isDemoSyncEmail(recipientEmail)) {
      return res.status(200).json({
        success: true,
        message: 'Demo parcel skipped (Web portal keeps real records only).',
        data: { skipped: true, reason: 'demo-account', trackingNumber },
      });
    }

    // Web-generated identity artifacts (see helpers above): canonical QR
    // payload + POD geofence spec. Persisted on the Parcel doc AND echoed in
    // the response so the mobile backend can persist them on the Shipment.
    const sellerEnterpriseId = await resolveSellerEnterpriseId(resolvedSenderEmail);
    const customerEnterpriseId = await resolveCustomerEnterpriseId(recipientEmail);
    const qrPayload = buildParcelQrPayload(trackingNumber, sellerEnterpriseId, customerEnterpriseId);
    const trackingGeofence = buildTrackingGeofence(body);

    // F2: translate the app's courier/merchant identity into THIS backend's
    // identifiers (see resolveWirePartyId). undefined = untouched, '' = the
    // sender explicitly cleared it, an id = assign.
    const riderIdForParcel = await resolveWirePartyId({
      Model: Rider, idField: 'registrationId', label: 'rider',
      enterpriseId: body.riderEnterpriseId, foreignId: body.riderId, email: body.riderEmail,
    });
    // Hub-and-spoke courier provenance (entity-mapping spec 2026-10-14):
    // same F2 resolution for first-mile and last-mile riders. Any arm may
    // be absent (unknown) - undefined never overwrites a stored id.
    const pickupRiderIdForParcel = await resolveWirePartyId({
      Model: Rider, idField: 'registrationId', label: 'pickup-rider',
      enterpriseId: body.pickupRiderEnterpriseId, foreignId: undefined, email: body.pickupRiderEmail,
    });
    const deliveryRiderIdForParcel = await resolveWirePartyId({
      Model: Rider, idField: 'registrationId', label: 'delivery-rider',
      enterpriseId: body.deliveryRiderEnterpriseId, foreignId: undefined, email: body.deliveryRiderEmail,
    });
    const sellerIdForParcel = await resolveWirePartyId({
      Model: Seller, idField: '_id', label: 'seller',
      enterpriseId: body.sellerEnterpriseId, foreignId: body.sellerId, email: resolvedSenderEmail,
    });

    // Returns / pickup parity (2026-10-12): resolved once, before the update
    // object, so the handover is mapped exactly once per push.
    const incomingReturnFlow = mapAppReturnFlow(body.returnFlow);

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
      // I-3f (G-33): mirror the validated delivery point onto Parcel.lat/lng
      // so the admin map and the B→A create/PUT pushes share one coordinate
      // truth with the mobile Shipment. No usable fix in this push ([0,0]
      // placeholder or absent) leaves the stored pair untouched.
      ...(trackingGeofence && trackingGeofence.center
        ? { lat: trackingGeofence.center.lat, lng: trackingGeofence.center.lng }
        : {}),
      // riderId/sellerId are deliberately NOT forwarded raw — they arrive here
      // as resolved Web identifiers (F2), never as the app's own ObjectIds.
      ...(riderIdForParcel !== undefined ? { riderId: riderIdForParcel } : {}),
      ...(pickupRiderIdForParcel !== undefined ? { pickupRiderId: pickupRiderIdForParcel } : {}),
      ...(deliveryRiderIdForParcel !== undefined ? { deliveryRiderId: deliveryRiderIdForParcel } : {}),
      // Hub refs + manifest backlink: present-only, never unassign.
      ...pickDefined(body, ['originHubId', 'destinationHubId', 'currentHubId', 'manifestId']),
      ...(sellerIdForParcel !== undefined ? { sellerId: sellerIdForParcel } : {}),
      ...pickDefined(body, ['weight', 'value', 'origin', 'destination', 'status', 'recipientEmail', 'podPhoto', 'packagePhoto', 'paymentMode', 'codAmount', 'packageCount', 'packageCategory', 'notes', 'deliveryFee', 'packageType', 'dimensions', 'estimatedDeliveryDate', 'actualDeliveryDate']),
      // Returns / cancellation parity (2026-10-12). The mobile app has sent
      // these since its returns work and this whitelist dropped every one, so a
      // returned parcel reached the portal with no custody, no cancellation
      // reason and no handover. Null cancellation values are skipped by
      // pickDefined, so a cancel-with-reason is stored and an unrelated status
      // sync can never blank a stored reason.
      ...pickDefined(body, ['custody', 'cancellationReason', 'cancellationReasonDescription', 'maxDeliveryAttempts']),
      // Absent handover = write nothing, never a blank one: a status-only sync
      // must not erase a handover this side already holds.
      ...(incomingReturnFlow ? { returnFlow: incomingReturnFlow } : {}),
      ...pickupPoint(body.pickupCoordinates),
    };

    // I-3c (G-23): the Android backend syncs its rider-attempt ledger here
    // (reasonCode enum + riderCoords + proofPhoto); translate it into this
    // backend's attempt shape instead of dropping it. An absent/empty list
    // writes nothing — a status-only sync must never wipe attempts this side
    // already recorded, and the union below never duplicates one both sides
    // already share.
    const incomingAttempts = mapAppAttemptsToWeb(body.deliveryAttempts);
    // D-15: the app's real timeline rows (arrival at the doorstep, doorstep
    // delay, seller edits, ...) translated into this side's event shape.
    // Empty for a payload that carries none, which must never erase the
    // history this side already holds.
    const incomingEvents = mapAppEventsToWeb(body.events);

    const existing = await Parcel.findOne({ trackingNumber });
    let doc, created;
    if (existing) {
      const before = { status: existing.status, riderId: existing.riderId };
      Object.assign(existing, update);
      // Append-only merge: a re-sync of the same parcel must not duplicate a
      // row, and a sync that carries no events must not wipe the timeline.
      if (incomingEvents.length) {
        const merged = mergeEvents(existing.events, incomingEvents);
        if (merged.added.length) existing.events = merged.events;
      }
      if (incomingAttempts.length) {
        const current = Array.isArray(existing.deliveryAttempts) ? existing.deliveryAttempts.slice() : [];
        const seen = new Set(current.map((a) => `${a.attemptNumber}|${new Date(a.attemptedAt).getTime()}`));
        for (const a of incomingAttempts) {
          const key = `${a.attemptNumber}|${new Date(a.attemptedAt).getTime()}`;
          if (!seen.has(key)) { current.push(a); seen.add(key); }
        }
        current.sort((x, y) => new Date(x.attemptedAt) - new Date(y.attemptedAt));
        existing.deliveryAttempts = current.slice(-MAX_DELIVERY_ATTEMPTS);
      }
      await existing.save();
      auditRiderAppParcelChange(req, existing.trackingNumber, before, existing, String(riderIdForParcel || existing.riderId || ''));
      doc = existing;
      created = false;
    } else {
      doc = await Parcel.create({
        ...update,
        ...(incomingAttempts.length ? { deliveryAttempts: incomingAttempts.slice(-MAX_DELIVERY_ATTEMPTS) } : {}),
        // The app's own timeline when it sent one, prefixed by the sync row so
        // the portal still records where the record came from.
        events: mergeEvents([{
          time: new Date().toISOString(),
          event: 'Synced from mobile app',
          location: update.origin || 'Mobile App',
          status: update.status || 'Pending',
        }], incomingEvents).events,
      });
      created = true;
    }

    // Auto-index into ParcelLocation for Parcel Map & real-time telemetry
    try {
      const resolvedLoc = resolveParcelCurrentLocation(doc);
      if (resolvedLoc.lat !== null && resolvedLoc.lat !== undefined && resolvedLoc.lng !== null && resolvedLoc.lng !== undefined) {
        await ParcelLocation.findOneAndUpdate(
          { parcelId: doc.trackingNumber },
          {
            $set: {
              parcelId: doc.trackingNumber,
              lat: String(resolvedLoc.lat),
              lng: String(resolvedLoc.lng),
              location: resolvedLoc.location,
              type: resolvedLoc.type,
              status: doc.status || 'Active',
              geofence: 'Inside',
              notes: doc.item || '',
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        sseBroadcaster.broadcast('location-synced', {
          parcelId: doc.trackingNumber,
          lat: Number(resolvedLoc.lat),
          lng: Number(resolvedLoc.lng),
          timestamp: new Date().toISOString(),
        });
      }
    } catch (locErr) {
      console.warn('[ParcelLocation:sync-parcel] auto-index warning:', locErr.message);
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
    return res.status(statusForError(err)).json({ success: false, error: 'Failed to sync parcel record.' });
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

    // REAL-only Web: the demo rider's duty toggle stays in the App database.
    if (isDemoSyncEmail(normalizedEmail)) {
      return res.status(200).json({
        success: true,
        message: 'Demo rider skipped (Web portal keeps real records only).',
        data: { skipped: true, reason: 'demo-account', email: normalizedEmail },
      });
    }

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
    return res.status(statusForError(err)).json({ success: false, error: 'Failed to sync duty status.' });
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
    return res.status(statusForError(err)).json({ success: false, error: 'Failed to sync notification.' });
  }
});

// ══════════════════════════════════════════════════════════════════════
// POST /api/bridge/sync-verification
// Android SellerVerification -> Web Seller.documents + PENDING_VERIFICATION
// queue. The admin pending-verification table is fed by
// GET /api/sellers?status=PENDING_VERIFICATION and renders
// `documents[].url|dataUrl` (ReviewModal), so persisting the row here is
// sufficient intake — no other Web change is needed for the queue itself.
// A `verification-synced` SSE event triggers a live refetch (AnalyticsDashboard).
// Status rule: never downgrade an ACTIVE seller — resubmitted documents on an
// active row are stored with a history entry and keep ACTIVE; every other
// row (new / pending / rejected) lands in PENDING_VERIFICATION.
// ══════════════════════════════════════════════════════════════════════
router.post('/sync-verification', async (req, res) => {
  const body = req.body || {};
  try {
    // Accepts both the sync-user-style keys (email/name) and the
    // mobile verification keys (sellerEmail/sellerName).
    const email = String(body.email || body.sellerEmail || '').toLowerCase().trim();
    if (!email) {
      return res.status(400).json({ success: false, error: '"email" is required.' });
    }

    const docs = [];
    if (isNonEmptyString(body.permitUrl)) docs.push({ name: 'Business Permit', label: 'Business Permit', fileName: 'Business_Permit.jpg', url: body.permitUrl });
    else if (isNonEmptyString(body.permitDataUrl)) docs.push({ name: 'Business Permit', label: 'Business Permit', fileName: 'Business_Permit.jpg', dataUrl: body.permitDataUrl });
    if (isNonEmptyString(body.idUrl)) docs.push({ name: body.idType || 'Valid ID', label: body.idType || 'Valid ID', fileName: 'Valid_ID.jpg', url: body.idUrl });
    else if (isNonEmptyString(body.idDataUrl)) docs.push({ name: body.idType || 'Valid ID', label: body.idType || 'Valid ID', fileName: 'Valid_ID.jpg', dataUrl: body.idDataUrl });

    let seller = await Seller.findOne({ email });
    let created = false;
    if (!seller) {
      const registrationId = await generateEnterpriseId('seller', Seller, 'registrationId');
      seller = await Seller.create({
        registrationId,
        accountNumber: body.accountNumber || String(Math.floor(1000000000 + Math.random() * 9000000000)),
        email,
        fullName: body.name || body.sellerName || '',
        phone: body.phone || '',
        storeName: body.businessName || body.storeName || '',
        idType: body.idType || '',
        idNumber: body.idNumber || body.permitNumber || '',
        documents: docs,
        status: 'PENDING_VERIFICATION',
        statusHistory: [{
          status: 'PENDING_VERIFICATION',
          changedAt: new Date(),
          reason: 'Documents submitted from mobile app',
        }],
      });
      created = true;
    } else {
      if (docs.length) seller.documents = docs;
      if (isNonEmptyString(body.businessName)) seller.storeName = body.businessName;
      else if (isNonEmptyString(body.storeName)) seller.storeName = body.storeName;
      if (isNonEmptyString(body.idType)) seller.idType = body.idType;
      if (isNonEmptyString(body.idNumber)) seller.idNumber = body.idNumber;
      else if (isNonEmptyString(body.permitNumber)) seller.idNumber = body.permitNumber;
      if (isNonEmptyString(body.name)) seller.fullName = body.name;
      else if (isNonEmptyString(body.sellerName)) seller.fullName = body.sellerName;
      if (body.phone !== undefined) seller.phone = body.phone;
      if (!seller.statusHistory) seller.statusHistory = [];
      if (seller.status === 'ACTIVE') {
        seller.statusHistory.push({
          status: 'ACTIVE',
          changedAt: new Date(),
          reason: 'Verification documents updated from mobile app',
        });
      } else if (seller.status !== 'PENDING_VERIFICATION') {
        seller.statusHistory.push({
          status: 'PENDING_VERIFICATION',
          changedAt: new Date(),
          reason: 'Documents submitted from mobile app',
        });
        seller.status = 'PENDING_VERIFICATION';
      }
      await seller.save();
    }

    sseBroadcaster.broadcast('verification-synced', {
      email: seller.email,
      registrationId: seller.registrationId,
      status: seller.status,
      created,
    });

    return res.status(201).json({
      success: true,
      message: 'Verification synced successfully.',
      data: { _id: seller._id, registrationId: seller.registrationId, created },
    });
  } catch (err) {
    logBridgeError('sync-verification', err, body);
    return res.status(statusForError(err)).json({ success: false, error: 'Failed to sync verification.' });
  }
});

// ══════════════════════════════════════════════════════════════════════
// POST /api/bridge/sync-rider-verification
// Mobile rider verification submit (DL + clearance + ORCR/authorization)
// → Web Rider row for the Pending queue (GET /api/riders?status=Pending).
// Mirrors sync-verification: find-or-create by email, riderType stored,
// Active rows are never downgraded, resubmits replace documents.
// ══════════════════════════════════════════════════════════════════════
router.post('/sync-rider-verification', async (req, res) => {
  const body = req.body || {};
  try {
    // Accepts both the sync-user-style keys (email/name) and the
    // mobile rider-verification keys (riderEmail/riderName).
    const email = String(body.email || body.riderEmail || '').toLowerCase().trim();
    if (!email) {
      return res.status(400).json({ success: false, error: '"email" is required.' });
    }

    const riderType = ['COMPANY', 'PARTNER'].includes(String(body.riderType || '').toUpperCase())
      ? String(body.riderType).toUpperCase()
      : 'PARTNER';

    const docs = [];
    if (isNonEmptyString(body.dlUrl)) docs.push({ name: "Professional Driver's License", label: "Professional Driver's License", fileName: "Driver_License.jpg", url: body.dlUrl });
    else if (isNonEmptyString(body.dlDataUrl)) docs.push({ name: "Professional Driver's License", label: "Professional Driver's License", fileName: "Driver_License.jpg", dataUrl: body.dlDataUrl });
    if (isNonEmptyString(body.clearanceUrl)) docs.push({ name: 'NBI/Police Clearance', label: 'NBI/Police Clearance', fileName: 'NBI_Clearance.jpg', url: body.clearanceUrl });
    else if (isNonEmptyString(body.clearanceDataUrl)) docs.push({ name: 'NBI/Police Clearance', label: 'NBI/Police Clearance', fileName: 'NBI_Clearance.jpg', dataUrl: body.clearanceDataUrl });
    if (isNonEmptyString(body.orcrUrl)) docs.push({ name: 'Vehicle OR/CR', label: 'Vehicle OR/CR', fileName: 'Vehicle_ORCR.jpg', url: body.orcrUrl });
    else if (isNonEmptyString(body.orcrDataUrl)) docs.push({ name: 'Vehicle OR/CR', label: 'Vehicle OR/CR', fileName: 'Vehicle_ORCR.jpg', dataUrl: body.orcrDataUrl });
    if (isNonEmptyString(body.authLetterUrl)) docs.push({ name: 'Vehicle Authorization', label: 'Vehicle Authorization', fileName: 'Authorization_Letter.jpg', url: body.authLetterUrl });
    else if (isNonEmptyString(body.authLetterDataUrl)) docs.push({ name: 'Vehicle Authorization', label: 'Vehicle Authorization', fileName: 'Authorization_Letter.jpg', dataUrl: body.authLetterDataUrl });

    let rider = await Rider.findOne({ email });
    let created = false;
    if (!rider) {
      const registrationId = await generateEnterpriseId('rider', Rider, 'registrationId');
      rider = await Rider.create({
        registrationId,
        accountNumber: body.accountNumber || String(Math.floor(1000000000 + Math.random() * 9000000000)),
        email,
        riderName: body.name || body.riderName || '',
        phone: body.phone || '',
        riderType,
        licenseNumber: body.licenseNumber || body.idNumber || '',
        vehiclePlate: body.vehiclePlate || body.plateNumber || '',
        vehicleType: body.vehicleType || '',
        documents: docs,
        status: 'Pending',
        statusHistory: [{
          status: 'Pending',
          changedAt: new Date(),
          reason: 'Documents submitted from mobile app',
        }],
      });
      created = true;
    } else {
      if (docs.length) rider.documents = docs;
      // The admin review is the authority on rider type: a mobile resubmit
      // only fills a blank, never overwrites an admin reclassification.
      if (!rider.riderType) rider.riderType = riderType;
      if (isNonEmptyString(body.licenseNumber)) rider.licenseNumber = body.licenseNumber;
      else if (isNonEmptyString(body.idNumber)) rider.licenseNumber = body.idNumber;
      if (isNonEmptyString(body.vehiclePlate)) rider.vehiclePlate = body.vehiclePlate;
      else if (isNonEmptyString(body.plateNumber)) rider.vehiclePlate = body.plateNumber;
      if (isNonEmptyString(body.vehicleType)) rider.vehicleType = body.vehicleType;
      if (isNonEmptyString(body.name)) rider.riderName = body.name;
      else if (isNonEmptyString(body.riderName)) rider.riderName = body.riderName;
      if (body.phone !== undefined) rider.phone = body.phone;
      if (!rider.statusHistory) rider.statusHistory = [];
      if (rider.status === 'Active') {
        rider.statusHistory.push({
          status: 'Active',
          changedAt: new Date(),
          reason: 'Verification documents updated from mobile app',
        });
      } else if (rider.status !== 'Pending') {
        rider.statusHistory.push({
          status: 'Pending',
          changedAt: new Date(),
          reason: 'Documents submitted from mobile app',
        });
        rider.status = 'Pending';
      }
      await rider.save();
    }

    sseBroadcaster.broadcast('verification-synced', {
      email: rider.email,
      registrationId: rider.registrationId,
      status: rider.status,
      riderType: rider.riderType,
      created,
    });

    return res.status(201).json({
      success: true,
      message: 'Rider verification synced successfully.',
      data: { _id: rider._id, registrationId: rider.registrationId, created },
    });
  } catch (err) {
    logBridgeError('sync-rider-verification', err, body);
    return res.status(statusForError(err)).json({ success: false, error: 'Failed to sync rider verification.' });
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
      // D-14: the reporter's original intent, who the app folded into the
      // canonical category above. A always sends the field ('' when the report
      // was already canonical), so this replaces rather than merges — the
      // intent is immutable once filed.
      subCategory: (body.subCategory || '').toString().trim(),
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
    return res.status(statusForError(err)).json({ success: false, error: 'Failed to sync issue record.' });
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

    // Also update Parcel and Rider live telemetry so web map, customer/seller maps, and admin feeds reflect live progress
    try {
      const pUpdate = {
        riderLat: lat,
        riderLng: lng,
        'telemetry.riderLat': lat,
        'telemetry.riderLng': lng,
        'telemetry.lastUpdated': new Date(),
      };
      if (body.progressFraction !== undefined) pUpdate['telemetry.progressFraction'] = Number(body.progressFraction);
      if (body.activeLeg) pUpdate['telemetry.activeLeg'] = String(body.activeLeg);

      const updatedParcel = await Parcel.findOneAndUpdate(
        { trackingNumber: parcelId },
        { $set: pUpdate },
        { new: true }
      ).select('riderId').lean();

      if (updatedParcel && updatedParcel.riderId) {
        const rIdStr = String(updatedParcel.riderId).trim();
        const rQuery = {
          $or: [
            { registrationId: rIdStr },
            ...(/^[a-f0-9]{24}$/i.test(rIdStr) ? [{ _id: rIdStr }] : []),
          ],
        };
        await Rider.updateOne(
          rQuery,
          { $set: { lastLocation: { lat, lng, recordedAt: new Date(), heading: body.heading !== undefined ? Number(body.heading) : null } } }
        );
      }
    } catch (telemetryErr) {
      console.warn('[sync-location:telemetry] mirror warning:', telemetryErr.message);
    }

    // Broadcast SSE event to connected admin clients
    sseBroadcaster.broadcast('location-synced', {
      parcelId,
      lat,
      lng,
      progressFraction: body.progressFraction,
      activeLeg: body.activeLeg,
      timestamp: new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      message: 'Location telemetry synced successfully.',
      data: { parcelId: doc.parcelId, lat: doc.lat, lng: doc.lng, updatedAt: doc.updatedAt },
    });
  } catch (err) {
    logBridgeError('sync-location', err, body);
    return res.status(statusForError(err)).json({ success: false, error: 'Failed to sync location telemetry.' });
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
    // F3 (2026-10-12): the app names the courier by Web identity
    // (riderEnterpriseId + riderEmail); the legacy riderId and riderName are
    // still accepted so older app builds keep working.
    const riderId = (req.body.riderId || req.body.riderEnterpriseId || '').toString();
    const riderEmail = (req.body.riderEmail || '').toString().trim().toLowerCase();
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

    // I-1 (plan v3.0 APPENDIX A): extended with the A statuses the app DOES
    // emit over the bridge (To Pickup from batch-claim, Failed from rider
    // failed-attempt, plus the Confirmed/To Ship/Processing legacy set).
    // 'Completed' is deliberately absent - it is an app display alias only;
    // A never emits it over the bridge.
    const allowedStatuses = ['Pending', 'To Ship', 'Confirmed', 'Processing', 'Shipping', 'Attempted', 'To Pickup', 'Picked Up', 'In Transit', 'Out for Delivery', 'Delivered', 'Failed', 'Returning', 'Returned', 'Cancelled'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: `Invalid status: ${status}. Allowed: ${allowedStatuses.join(', ')}` });
    }

    const before = { status: parcel.status, riderId: parcel.riderId };
    parcel.status = status;
    if (podPhoto) parcel.podPhoto = podPhoto;
    // Last-known rider position (Android sends the POD fix when available);
    // guards keep a malformed payload from stamping non-numeric coords.
    if (Number.isFinite(riderLat) && Number.isFinite(riderLng)) {
      parcel.riderLat = riderLat;
      parcel.riderLng = riderLng;
      const targetRiderId = riderId || parcel.riderId;
      if (targetRiderId) {
        const rIdStr = String(targetRiderId).trim();
        const rQuery = {
          $or: [
            { registrationId: rIdStr },
            ...(mongoose.Types.ObjectId.isValid(rIdStr) ? [{ _id: rIdStr }] : []),
          ],
        };
        Rider.updateOne(rQuery, {
          $set: { lastLocation: { lat: riderLat, lng: riderLng, recordedAt: new Date() } }
        }).catch(() => {});
      }
    } else if (['Delivered', 'Cancelled', 'Returned'].includes(status)) {
      // Terminal: clear any stale courier fix so finished parcels stop
      // carrying the rider's last position forever (live-map audit #11).
      parcel.riderLat = null;
      parcel.riderLng = null;
    }
    parcel.events.push({
      time: timestamp || new Date().toISOString(),
      event: `Status updated to ${status} via Android bridge${riderName ? ` by ${riderName}` : ''}`,
      location: parcel.destination || '',
      status: status,
    });
    await parcel.save();
    auditRiderAppParcelChange(req, parcel.trackingNumber, before, parcel, riderId || String(parcel.riderId || ''));

    // Keep ParcelLocation in sync with new status and courier coordinates
    try {
      const resolvedLoc = resolveParcelCurrentLocation(parcel);
      if (resolvedLoc.lat !== null && resolvedLoc.lat !== undefined && resolvedLoc.lng !== null && resolvedLoc.lng !== undefined) {
        await ParcelLocation.findOneAndUpdate(
          { parcelId: parcel.trackingNumber },
          {
            $set: {
              parcelId: parcel.trackingNumber,
              lat: String(resolvedLoc.lat),
              lng: String(resolvedLoc.lng),
              location: resolvedLoc.location,
              type: resolvedLoc.type,
              status: parcel.status || 'Active',
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        sseBroadcaster.broadcast('location-synced', {
          parcelId: parcel.trackingNumber,
          lat: Number(resolvedLoc.lat),
          lng: Number(resolvedLoc.lng),
          timestamp: new Date().toISOString(),
        });
      }
    } catch (locErr) {
      console.warn('[ParcelLocation:receive-status] sync warning:', locErr.message);
    }

    // Increment the rider's completed deliveries on a TRANSITION into
    // Delivered (F3, 2026-10-12). Three bugs are fixed here:
    //   1. the old query pushed { _id: riderId } unconditionally, so an
    //      enterprise id ('YTOR2026...') failed ObjectId casting and the whole
    //      $or threw — swallowed by the old .catch(() => {}), the counter never
    //      moved even when an identity WAS supplied. Only a 24-hex value may be
    //      matched against _id.
    //   2. the app's status pushes used to carry no rider at all, so the parcel's
    //      own assignment (parcel.riderId, a Rider registrationId since the
    //      identity fix) is now the fallback.
    //   3. a repeated Delivered push re-counted the same delivery; the increment
    //      is now guarded on the previous status.
    if (status === 'Delivered' && before.status !== 'Delivered') {
      try {
        // One candidate list per identity, in precedence order. They are
        // resolved one at a time (not unioned into a single $or) so a body
        // identity and the parcel's own assignment can never both be credited,
        // and only the rider who actually resolves gets the increment.
        const clausesForId = (value) => {
          const raw = String(value || '').trim();
          if (!raw) return [];
          const clauses = [{ registrationId: raw }];
          if (/^[a-f0-9]{24}$/i.test(raw)) clauses.push({ _id: raw });
          return clauses;
        };
        const candidates = [
          clausesForId(riderId),                                            // who did it (app / office)
          riderEmail ? [{ email: riderEmail }] : [],                        // app's courier email
          clausesForId(parcel.riderId),                                     // the parcel's assignment
          riderName ? [{ riderName: new RegExp(`^${escapeRegExp(riderName)}$`, 'i') }] : [],
        ].filter((clauses) => clauses.length > 0);

        let credited = null;
        for (const clauses of candidates) {
          credited = await Rider.findOne({ $or: clauses }).select('_id').lean();
          if (credited) break;
        }
        if (credited) {
          await Rider.updateOne({ _id: credited._id }, { $inc: { deliveries: 1 } });
        } else {
          logBridgeError('receive-status:delivery-count',
            new Error('no rider resolvable for this delivery - counter unchanged'),
            { trackingNumber: parcel.trackingNumber, riderId, hasEmail: !!riderEmail });
        }
      } catch (e) {
        // A counting failure must never fail the rider's status transition.
        logBridgeError('receive-status:delivery-count', e, { trackingNumber: parcel.trackingNumber });
      }
    }

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
    return res.status(500).json({ success: false, error: 'Failed to receive status update.' });
  }
});

// ── RECEIVE COURIER STEP (I-2, plan v3.0): doorstep departed/returned ────
// A's doorstep engine (60s stepped-away debounce) pushes these via
// BridgeClient.sendStepStatus. Records the step on Parcel.events, refreshes
// the courier fix, mirrors it to ParcelLocation, notifies admins (S2), and
// broadcasts SSE for LiveRiderMap (D-13 stepped-away badge).
const courierStepThrottle = new Map(); // `${tracking}:${event}` -> epoch ms
const COURIER_STEP_MIN_INTERVAL_MS = 5000;
router.post('/receive-courier-step', async (req, res) => {
  const body = req.body || {};
  try {
    const trackingNumber = (body.trackingNumber || body.trackingId || '').toString().trim();
    const event = (body.event || '').toString().trim().toLowerCase();
    const riderLat = Number(body.riderLat);
    const riderLng = Number(body.riderLng);
    if (!trackingNumber) {
      return res.status(400).json({ success: false, error: '"trackingNumber" is required.' });
    }
    if (!['departed', 'returned'].includes(event)) {
      return res.status(400).json({ success: false, error: '"event" must be "departed" or "returned".' });
    }

    const parcel = await Parcel.findOne({ trackingNumber });
    if (!parcel) {
      return res.status(404).json({ success: false, error: `Parcel not found for tracking: ${trackingNumber}` });
    }

    // Burst throttle (G-24): A already debounces 60s at the source; this
    // only absorbs replay bursts. Throttled duplicates answer 200 so the
    // fire-and-forget sender never retries them.
    const throttleKey = `${parcel.trackingNumber}:${event}`;
    const lastAt = courierStepThrottle.get(throttleKey) || 0;
    if (Date.now() - lastAt < COURIER_STEP_MIN_INTERVAL_MS) {
      return res.status(200).json({ success: true, message: 'Step event throttled (duplicate within window).', data: { trackingNumber: parcel.trackingNumber, event, throttled: true } });
    }
    courierStepThrottle.set(throttleKey, Date.now());

    const label = event === 'departed'
      ? 'Courier stepped away from the doorstep'
      : 'Courier returned to the doorstep';
    const before = { status: parcel.status };
    if (Number.isFinite(riderLat) && Number.isFinite(riderLng)) {
      parcel.riderLat = riderLat;
      parcel.riderLng = riderLng;
    }
    parcel.events.push({
      time: body.timestamp || new Date().toISOString(),
      event: `${label} (bridge step)`,
      location: parcel.destination || '',
      status: parcel.status,
    });
    await parcel.save();
    auditRiderAppParcelChange(req, parcel.trackingNumber, before, parcel, String(parcel.riderId || ''));

    // Mirror the courier fix to ParcelLocation (same shape as /sync-location).
    if (Number.isFinite(riderLat) && Number.isFinite(riderLng)) {
      ParcelLocation.findOneAndUpdate(
        { parcelId: parcel.trackingNumber },
        { $set: {
            parcelId: parcel.trackingNumber,
            lat: String(riderLat),
            lng: String(riderLng),
            location: `${label} (${riderLat.toFixed(4)}, ${riderLng.toFixed(4)})`,
            notes: label,
        } },
        { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
      ).catch((e) => logBridgeError('receive-courier-step:location', e, body));
    }

    // S2 admin feed so the doorstep state is auditable, not just live SSE.
    AdminNotification.create({
      role: 'admin',
      title: event === 'departed' ? 'Courier Stepped Away' : 'Courier Back At Door',
      message: `${label} for parcel #${parcel.trackingNumber}.`,
      type: 'system',
      relatedId: parcel.trackingNumber,
      source: 'bridge-courier-step',
    }).catch((e) => logBridgeError('receive-courier-step:notification', e, body));

    sseBroadcaster.broadcast('courier-step', {
      trackingNumber: parcel.trackingNumber,
      event,
      status: parcel.status,
      ...(Number.isFinite(riderLat) && Number.isFinite(riderLng) ? { riderLat, riderLng } : {}),
      timestamp: new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      message: `${label} recorded.`,
      data: { trackingNumber: parcel.trackingNumber, event, status: parcel.status },
    });
  } catch (err) {
    logBridgeError('receive-courier-step', err, body);
    return res.status(statusForError(err)).json({ success: false, error: 'Failed to record courier step.' });
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

    // 'Rejected' mirrors the mobile Issue enum (A models/Issue.js:105): the app
    // lets staff deny a claim, so the office-to-app status channel must be able
    // to carry that decision back rather than 400 it.
    const allowedStatuses = ['Open', 'Under Investigation', 'Resolved', 'Rejected', 'Closed'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: `Invalid status: ${status}. Allowed: ${allowedStatuses.join(', ')}` });
    }

    issue.status = status;
    if (adminNotes) issue.adminNotes = adminNotes;
    // Rejected is a terminal decision too (A's controller stamps its clock for
    // Resolved / Closed / Rejected alike).
    if (status === 'Resolved' || status === 'Closed' || status === 'Rejected') issue.resolvedAt = new Date();
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
    return res.status(500).json({ success: false, error: 'Failed to receive issue status update.' });
  }
});

// ── POLL CHANGES: Delta feed for the Android backend ────────────────────
// GET /api/bridge/poll-changes?since=<ISO timestamp>
// I-6 (2026-10-12): this is no longer this backend's raw documents — it is
// the delta feed the Android reconciler actually applies, in the shape the
// app's own /api/bridge endpoints consume:
//   parcels → the /sync-parcel body shape (flat senderName/receiverName/
//             destination/origin/... + riderEmail resolved from riderId)
//   users   → { email, role, updates } in the /sync-user body shape, sourced
//             from Seller + Rider + Customer (there is no unified user
//             collection here)
//   issues  → { ticketId, status, adminNotes, ... }
// Translation rules learned from the two schemas:
//   receiverPhone → recipientPhone, senderEmail → sellerEmail (the app reads
//   those names), riderId → riderEmail (the app resolves couriers by email),
//   and blank fields are OMITTED rather than sent as '' so a sparse Web row
//   can never blank a richer profile on the app side — the same rule this
//   backend's own pickDefined applies in the opposite direction.
// Coordinate pairs are deliberately absent: they are not stored here (only the
// derived trackingGeofence ring), and the app is their source of truth.
// Capped at 100 docs per collection per call.
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

    const [parcels, sellers, riders, customers, issues] = await Promise.all([
      Parcel.find({ updatedAt: { $gt: sinceDate } }).sort({ updatedAt: 1 }).limit(100).lean(),
      Seller.find({ updatedAt: { $gt: sinceDate } }).sort({ updatedAt: 1 }).limit(100).lean(),
      Rider.find({ updatedAt: { $gt: sinceDate } }).sort({ updatedAt: 1 }).limit(100).lean(),
      Customer.find({ updatedAt: { $gt: sinceDate } }).sort({ updatedAt: 1 }).limit(100).lean(),
      Issue.find({ updatedAt: { $gt: sinceDate } }).sort({ updatedAt: 1 }).limit(100).lean(),
    ]);

    // Courier identity for the parcel wire: Parcel.riderId is a Rider
    // registrationId (or a legacy Rider _id) → resolve one email map, once.
    const parcelRiderIds = [...new Set(parcels.map((p) => String(p.riderId || '').trim()).filter(Boolean))];
    const parcelRiderObjectIds = parcelRiderIds.filter((id) => /^[a-f0-9]{24}$/i.test(id));
    const parcelRiders = parcelRiderIds.length
      ? await Rider.find({
          $or: [
            { registrationId: { $in: parcelRiderIds } },
            ...(parcelRiderObjectIds.length ? [{ _id: { $in: parcelRiderObjectIds } }] : []),
          ],
        }).select('registrationId email').lean()
      : [];
    const riderEmailById = new Map();
    for (const r of parcelRiders) {
      if (!r.email) continue;
      riderEmailById.set(String(r.registrationId), r.email);
      riderEmailById.set(String(r._id), r.email);
    }

    // Blank → omitted helper (shared by every collection below).
    const defined = (v) => (v === undefined || v === null || String(v).trim() === '' ? undefined : v);
    const assignDefined = (target, key, value) => {
      const v = defined(value);
      if (v !== undefined) target[key] = v;
    };

    const wireParcels = parcels
      .filter((p) => !isDemoSyncEmail(p.senderEmail) && !isDemoSyncEmail(p.recipientEmail))
      .map((p) => {
        const wire = { trackingId: p.trackingNumber, trackingNumber: p.trackingNumber };
        assignDefined(wire, 'senderName', p.senderName);
        assignDefined(wire, 'receiverName', p.receiverName);
        assignDefined(wire, 'senderPhone', p.senderPhone);
        assignDefined(wire, 'recipientPhone', p.receiverPhone);
        assignDefined(wire, 'sellerEmail', p.senderEmail);
        assignDefined(wire, 'recipientEmail', p.recipientEmail);
        assignDefined(wire, 'item', p.item);
        assignDefined(wire, 'weight', p.weight);
        assignDefined(wire, 'origin', p.origin);
        assignDefined(wire, 'destination', p.destination);
        assignDefined(wire, 'status', p.status);
        assignDefined(wire, 'notes', p.notes);
        assignDefined(wire, 'podPhoto', p.podPhoto);
        assignDefined(wire, 'packageType', p.packageType);
        assignDefined(wire, 'estimatedDeliveryDate', p.estimatedDeliveryDate);
        assignDefined(wire, 'actualDeliveryDate', p.actualDeliveryDate);
        // Numbers: sent whenever the row has one (LWW — an office correction
        // to 0 is a real intent, and the app compares the value itself).
        if (Number.isFinite(Number(p.deliveryFee))) wire.deliveryFee = Number(p.deliveryFee);
        if (p.dimensions && ['length', 'width', 'height'].some((k) => Number(p.dimensions[k]) > 0)) {
          wire.dimensions = p.dimensions;
        }
        // Web attempt ledger → the app translates it with mapWebAttemptsToApp,
        // so the Web shape (reason string + lat/lng) is exactly right here.
        if (Array.isArray(p.deliveryAttempts) && p.deliveryAttempts.length) {
          wire.deliveryAttempts = p.deliveryAttempts;
        }
        const riderEmail = p.riderId ? riderEmailById.get(String(p.riderId).trim()) : null;
        // Only a resolvable courier email is sent: '' would read as an
        // explicit unassign on the app side.
        if (riderEmail) wire.riderEmail = riderEmail;
        wire.updatedAt = p.updatedAt;
        return wire;
      });

    // B status vocabulary → the app's user.status enum. Only an exact business
    // status maps; a verification stage (PENDING_VERIFICATION / Pending) is
    // deliberately NOT mapped to 'active' — that would activate an unverified
    // merchant on the app side.
    const mapUserStatus = (status) => {
      const norm = String(status || '').trim().toLowerCase();
      return ['active', 'inactive', 'suspended'].includes(norm) ? norm : undefined;
    };

    const wireUsers = [];
    const pushUser = (role, doc, updates, updatedAt) => {
      const email = defined(doc.email);
      if (!email || isDemoSyncEmail(email)) return;
      wireUsers.push({ email: String(email).toLowerCase().trim(), role, updates, updatedAt });
    };

    for (const s of sellers) {
      const updates = {};
      assignDefined(updates, 'name', s.fullName);
      assignDefined(updates, 'phone', s.phone);
      assignDefined(updates, 'address', s.address);
      assignDefined(updates, 'city', s.city);
      assignDefined(updates, 'storeName', s.storeName);
      assignDefined(updates, 'warehouseAddress', s.warehouseAddress);
      assignDefined(updates, 'operatingHours', s.operatingHours);
      assignDefined(updates, 'idNumber', s.idNumber);
      assignDefined(updates, 'idType', s.idType);
      assignDefined(updates, 'enterpriseId', s.registrationId);
      assignDefined(updates, 'status', mapUserStatus(s.status));
      pushUser('seller', s, updates, s.updatedAt);
    }

    for (const r of riders) {
      const updates = {};
      assignDefined(updates, 'name', r.riderName);
      assignDefined(updates, 'phone', r.phone);
      assignDefined(updates, 'address', r.address);
      assignDefined(updates, 'city', r.city);
      // mobile field names, so the app's user-update projection matches
      assignDefined(updates, 'vehicleModel', r.vehicleType);
      assignDefined(updates, 'plateNumber', r.vehiclePlate);
      assignDefined(updates, 'assignedHub', r.assignedHub);
      assignDefined(updates, 'enterpriseId', r.registrationId);
      assignDefined(updates, 'status', mapUserStatus(r.status));
      pushUser('rider', r, updates, r.updatedAt);
    }

    for (const c of customers) {
      const updates = {};
      assignDefined(updates, 'name', c.fullName);
      assignDefined(updates, 'phone', c.phone);
      assignDefined(updates, 'address', c.address);
      assignDefined(updates, 'city', c.city);
      assignDefined(updates, 'deliveryInstructions', c.deliveryInstructions);
      assignDefined(updates, 'enterpriseId', c.customerId);
      assignDefined(updates, 'status', mapUserStatus(c.status));
      pushUser('customer', c, updates, c.updatedAt);
    }

    const wireIssues = issues
      .filter((i) => !isDemoSyncEmail(i.reporterEmail))
      .map((i) => {
        const wire = { ticketId: i.ticketId, updatedAt: i.updatedAt };
        assignDefined(wire, 'trackingNumber', i.trackingNumber);
        assignDefined(wire, 'status', i.status);
        assignDefined(wire, 'category', i.category);
        wire.adminNotes = i.adminNotes || '';
        return wire;
      });

    return res.status(200).json({
      success: true,
      data: {
        parcels: wireParcels,
        users: wireUsers,
        issues: wireIssues,
        lastSync: new Date().toISOString(),
        counts: { parcels: wireParcels.length, users: wireUsers.length, issues: wireIssues.length },
      },
    });
  } catch (err) {
    logBridgeError('poll-changes', err, req.query);
    return res.status(statusForError(err)).json({ success: false, error: 'Failed to poll changes.' });
  }
});

// ── BRIDGE HEALTH CHECK ─────────────────────────────────────────────────
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Bridge operational',
    timestamp: new Date().toISOString(),
    routes: ['sync-user', 'sync-duty-status', 'sync-parcel', 'sync-issue', 'sync-location', 'sync-notification', 'sync-verification', 'sync-rider-verification', 'receive-status', 'receive-issue-status', 'poll-changes'],
  });
});
