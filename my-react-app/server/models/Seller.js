const mongoose = require('mongoose');

const sellerSchema = new mongoose.Schema({
    registrationId: { type: String, required: true },
    accountNumber: { type: String, default: '' },
    fullName: String,
    idNumber: String,
    idType: String,
    email: { type: String, required: true },
    phone: { type: String, default: '' },
    address: String,
    city: String,
    state: String,
    country: String,
    postalCode: String,
    bankName: String,
    commissionRate: Number,
    paymentCycle: String,
    status: { type: String, default: 'ACTIVE' },
    accountCategory: { type: String, enum: ['REAL', 'DEMO'], default: 'REAL' },
    statusHistory: [{
        status: String,
        changedAt: { type: Date, default: Date.now },
        reason:    { type: String, default: '' },
    }],
}, { timestamps: true });

module.exports = mongoose.model('Seller', sellerSchema);
