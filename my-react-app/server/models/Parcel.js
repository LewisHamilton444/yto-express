const mongoose = require('mongoose');
const { MAX_DELIVERY_ATTEMPTS, FAILED_ATTEMPT_REASONS, NOTES_MAX_LENGTH } = require('../utils/deliveryAttempts');

// One failed delivery try by a rider. Written only by
// POST /api/parcels/:trackingNumber/failed-attempt — never through the
// generic PUT /api/parcels/:id (it is not in PARCEL_EDITABLE_FIELDS).
const deliveryAttemptSchema = new mongoose.Schema({
    attemptNumber: { type: Number, required: true, min: 1, max: MAX_DELIVERY_ATTEMPTS },
    reason: { type: String, required: true, enum: FAILED_ATTEMPT_REASONS },
    notes: { type: String, default: '', maxlength: NOTES_MAX_LENGTH },
    riderId: { type: String, default: '' },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    photoUrl: { type: String, default: '' },
    attemptedAt: { type: Date, default: Date.now },
    // I-3c (G-23): PH retry date (next day, skipping Sunday) stamped on every
    // retriable attempt. Calculator lives in utils/deliveryAttempts.js and is
    // identical to the Android backend's — the two sides must never disagree.
    nextAttemptDate: { type: Date, default: null },
}, { _id: false });

// Return handover (app parity, 2026-10-12). The rider app records who took a
// parcel back — the merchant's name and signature, an optional condition photo
// and the handover GPS fix — in the mobile Shipment's returnFlow subdocument.
// Nothing carried it across, so a completed return landed here as a bare
// "Returned" status with no evidence attached. Bounds mirror the mobile
// controller exactly (data-URL JPEG/PNG/WebP only, signature <= 100KB,
// condition photo <= 7MB) so this side can never hold a photo the app itself
// would have refused.
const returnFlowSchema = new mongoose.Schema({
    type: { type: String, default: 'RETURN_TO_SENDER' },
    signerName: { type: String, default: '' },
    signerRole: { type: String, default: 'SELLER' },
    signaturePhoto: { type: String, default: '' },
    conditionPhoto: { type: String, default: null },
    riderCoords: { type: [Number], default: null },
    hubId: { type: String, default: null },
    completedAt: { type: Date, default: null },
}, { _id: false });

const parcelSchema = new mongoose.Schema({
    trackingNumber: { type: String, required: true, unique: true },
    senderName: { type: String, required: true },
    receiverName: { type: String, required: true },
    recipientEmail: { type: String, default: '' },
    item: { type: String, required: true },
    weight: String,
    value: String,
    origin: String,
    destination: String,
    status: { type: String, default: 'Pending' },
    riderId: { type: String, default: '' },
    pickupRiderId: { type: String, default: '' },
    deliveryRiderId: { type: String, default: '' },
    sellerId: { type: String, default: '' },
    podPhoto: { type: String, default: '' },
    packagePhoto: { type: String, default: '' },
    // Contact phones (synced from mobile sender/recipient phones via bridge
    // sync-parcel) so the admin From/To cards show complete contact info.
    senderPhone: { type: String, default: '' },
    receiverPhone: { type: String, default: '' },
    // Seller contact email (Android BridgeClient.syncParcel sends sellerEmail);
    // declared so strict mode keeps it — also the fallback for QR seller-ID
    // resolution when the payload's nested sender.email is absent.
    senderEmail: { type: String, default: '' },
    // Last-known rider position, stamped by POST /api/bridge/receive-status
    // when the Android payload carries a POD GPS fix. Powers location-aware
    // admin views without touching the separate ParcelLocation upsert stream.
    riderLat: { type: Number, default: null },
    riderLng: { type: Number, default: null },
    // Delivery destination coordinates mirrored on Parcel for geographic lookup
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    // Cross-platform bridge fields (synced from the mobile Shipment.js schema by
    // POST /api/bridge/sync-parcel). Mongoose strict mode strips undeclared fields
    // on save, which is why each of these must be declared on the schema.
    paymentMode: { type: String, default: '' },
    codAmount: { type: Number, default: 0 },
    packageCount: { type: Number, default: 1 },
    packageCategory: { type: String, default: '' },
    notes: { type: String, default: '' },
    // Receipt/billing completeness (synced from mobile package.deliveryFee and
    // package.type via bridge sync-parcel): fee breakdown shown end-to-end on
    // the app, service tier for the ManageParcels details tab.
    deliveryFee: { type: Number, default: 0 },
    packageType: { type: String, default: '' },
    // { length, width, height } in cm — synced from mobile package.dimensions.
    dimensions: {
        length: { type: Number, default: 0 },
        width: { type: Number, default: 0 },
        height: { type: Number, default: 0 },
    },
    // Delivery dates: the app computes the Pulilan-anchored ETA at booking
    // (estimatedDeliveryDate) and stamps the actual clock-on-delivery time
    // (actualDeliveryDate). Synced so the Web shows real dates instead of '—'.
    estimatedDeliveryDate: { type: Date, default: null },
    actualDeliveryDate: { type: Date, default: null },
    // Web-generated identity artifacts (2026-09-11): the canonical QR payload
    // (YTOQR1|tracking|sellerEntId|customerEntId, degrades to plain tracking
    // number) and the resolved enterprise IDs of the trading parties. Minted
    // by POST /api/bridge/sync-parcel; declared here because Mongoose strict
    // mode strips undeclared fields on save.
    qrPayload: { type: String, default: '' },
    sellerEnterpriseId: { type: String, default: '' },
    customerEnterpriseId: { type: String, default: '' },
    // Web-derived POD geofence spec: { kind: 'POD_RING', center: {lat, lng},
    // radiusMeters: 100 }. Mixed type — absent when delivery coordinates were
    // not supplied.
    trackingGeofence: { type: mongoose.Schema.Types.Mixed },
    // Failed delivery tries, oldest first. At most MAX_DELIVERY_ATTEMPTS.
    deliveryAttempts: { type: [deliveryAttemptSchema], default: [] },
    // D-18 (2026-10-12): the retry cap this parcel was BOOKED with, synced from
    // the mobile Shipment. The two sides disagreed before (app 2, portal 3), so
    // the same parcel could escalate to Returning here while the app still
    // offered a retry. The parcel's own cap now wins; the fallback below covers
    // portal-created parcels and rows that predate the sync.
    maxDeliveryAttempts: { type: Number, default: MAX_DELIVERY_ATTEMPTS },
    // ── Returns / cancellation parity with the mobile Shipment (2026-10-12) ──
    // The mobile app has sent all of these since its returns work, but Mongoose
    // strict mode strips undeclared fields on save, so the portal never held
    // any of them. None is derivable from what is already stored here:
    //   custody: COURIER | HUB | SELLER — where the parcel physically is.
    custody: { type: String, default: 'COURIER' },
    // Cancellation reason plus the free text the canceller supplied. Null (not
    // '') so "never cancelled" stays distinguishable from "cancelled, no reason
    // given".
    cancellationReason: { type: String, default: null },
    cancellationReasonDescription: { type: String, default: null },
    originHubId: { type: String, default: null },
    destinationHubId: { type: String, default: null },
    currentHubId: { type: String, default: null },
    manifestId: { type: String, default: null },
    // Return handover subdocument — null until a return is confirmed.
    // Deliberately NOT a stored attemptCount/lastAttemptReason/maxDelivery
    // Attempts: the first two are derived from deliveryAttempts above (one
    // source of truth for one number), and the retry cap is a policy this
    // portal already owns outright (utils/deliveryAttempts.js) — see the
    // bridge notes in bridgeRoutes.js.
    returnFlow: { type: returnFlowSchema, default: null },
    // Pickup origin point (mobile Shipment.pickupCoordinates GeoJSON). The
    // delivery point already lands on lat/lng via the POD geofence spec; the
    // pickup end had nowhere to go until now.
    pickupLat: { type: Number, default: null },
    pickupLng: { type: Number, default: null },
    events: [{
        time: String, 
        event: String, 
        location: String, 
        status: String 
    }],
}, { timestamps: true });

module.exports = mongoose.model('Parcel', parcelSchema);