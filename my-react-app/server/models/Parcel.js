const mongoose = require('mongoose');

const parcelSchema = new mongoose.Schema({
    trackingNumber: { type: String, required: true, unique: true },
    senderName: { type: String, required: true },
    receiverName: { type: String, required: true },
    item: { type: String, required: true },
    weight: String,
    value: String,
    origin: String,
    destination: String,
    status: { type: String, default: 'Pending' },
    riderId: { type: String, default: '' },
    sellerId: { type: String, default: '' },
    events: [{ 
        time: String, 
        event: String, 
        location: String, 
        status: String 
    }],
}, { timestamps: true });

module.exports = mongoose.model('Parcel', parcelSchema);