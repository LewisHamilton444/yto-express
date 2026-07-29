const mongoose = require('mongoose');

const parcelLocationSchema = new mongoose.Schema({
    parcelId: { type: String, required: true, unique: true },
    lat: { type: String, required: true },
    lng: { type: String, required: true },
    location: { type: String, required: true },
    type: { type: String, default: 'Warehouse' },
    status: { type: String, default: 'Active' },
    geofence: { type: String, default: 'Inside' },
    notes: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('ParcelLocation', parcelLocationSchema);