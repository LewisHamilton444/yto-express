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
    events: [{ 
        time: String, 
        event: String, 
        location: String, 
        status: String 
    }],
}, { timestamps: true });

module.exports = mongoose.model('Parcel', parcelSchema);