const mongoose = require('mongoose');

const riderSchema = new mongoose.Schema({
    registrationId: { type: String, required: true },
    accountNumber: { type: String, default: '' },
    riderName: String,
    vehicleType: String,
    email: { type: String, required: true },
    phone: { type: String, default: '' },
    address: String,
    city: String,
    state: String,
    country: String,
    postalCode: String,
    licenseNumber: String,
    vehiclePlate: String,
    emergencyContactName: String,
    emergencyContactPhone: String,
    bankName: String,
    payoutRate: Number,
    payoutCycle: String,
    status: { type: String, default: 'Active' },
    deliveries: { type: Number, default: 0 },
    rating: { type: Number, default: 5.0 },
    successRate: { type: Number, default: 100 },
    accountCategory: { type: String, enum: ['REAL', 'DEMO'], default: 'REAL' },
    statusHistory: [{
        status: String,
        changedAt: { type: Date, default: Date.now },
        reason:    { type: String, default: '' },
    }],
}, { timestamps: true });

module.exports = mongoose.model('Rider', riderSchema);
