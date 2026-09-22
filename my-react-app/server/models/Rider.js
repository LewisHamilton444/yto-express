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
    assignedHub: { type: String, default: '' },
    status: { type: String, default: 'Active' },
    // Real-time duty flag synced from the Android rider profile toggle
    // (PUT auth/duty-status -> User.isOnDuty). The parcel-derived
    // "on-delivery" state in the UI is a separate signal; this is the actual
    // switch the rider flips. Declared explicitly — Mongoose strict mode
    // strips undeclared fields on save.
    isOnDuty: { type: Boolean, default: false },
    deliveries: { type: Number, default: 0 },
    rating: { type: Number, default: 5.0 },
    successRate: { type: Number, default: 100 },
    statusHistory: [{
        status: String,
        changedAt: { type: Date, default: Date.now },
        reason:    { type: String, default: '' },
    }],
}, { timestamps: true });

module.exports = mongoose.model('Rider', riderSchema);
