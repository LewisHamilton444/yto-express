const mongoose = require('mongoose');

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
    sellerId: { type: String, default: '' },
    // Realm partition (REAL/DEMO). Set by POST /api/parcels (from the admin's
    // authenticated realm) and by bridge sync-parcel (categorizeEmail of the
    // sender/recipient). Must be declared here — Mongoose strict mode strips
    // undeclared fields on save, which previously made this value vanish.
    accountCategory: { type: String, enum: ['REAL', 'DEMO'], default: 'REAL' },
    podPhoto: { type: String, default: '' },
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
    events: [{ 
        time: String, 
        event: String, 
        location: String, 
        status: String 
    }],
}, { timestamps: true });

module.exports = mongoose.model('Parcel', parcelSchema);