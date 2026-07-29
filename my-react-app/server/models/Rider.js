const mongoose = require('mongoose');

const riderSchema = new mongoose.Schema({
    registrationId: { type: String, required: true },
    accountNumber: { type: String, required: true },
    riderName: String,
    vehicleType: String,
    email: { type: String, required: true },
    phone: { type: String, required: true },
    address: String,
    city: String,
    state: String,
    country: String,
    postalCode: String,
    licenseNumber: String,
    vehiclePlate: String,
    bankName: String,
    payoutRate: Number,
    payoutCycle: String,
    status: { type: String, default: 'Active' },
    deliveries: { type: Number, default: 0 },
    rating: { type: Number, default: 5.0 },
    successRate: { type: Number, default: 100 },
}, { timestamps: true });

module.exports = mongoose.model('Rider', riderSchema);