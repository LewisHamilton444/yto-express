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
    emergencyContactName: String,
    emergencyContactPhone: String,
    bankName: String,
    payoutRate: Number,
    payoutCycle: String,
    status: { type: String, default: 'Active' },
    deliveries: { type: Number, default: 0 },
    rating: { type: Number, default: 5.0 },
    successRate: { type: Number, default: 100 },
    // REAL = live @gmail.com signup, DEMO = @yto.com/@example.com test
    // account — set by the bridge adapter from the mobile registration's
    // email domain (see bridgeRoutes.js).
    accountCategory: { type: String, enum: ['REAL', 'DEMO'], default: 'REAL' },
}, { timestamps: true });

module.exports = mongoose.model('Rider', riderSchema);