const mongoose = require('mongoose');

const sellerSchema = new mongoose.Schema({
    registrationId: { type: String, required: true },
    accountNumber: { type: String, default: '' },
    fullName: String,
    // Merchant shop name (Android User.storeName, synced via bridge sync-user)
    // so the Seller Directory shows the trading name, not just the person.
    storeName: { type: String, default: '' },
    warehouseAddress: { type: String, default: '' },
    operatingHours: { type: String, default: '' },
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
    statusHistory: [{
        status: String,
        changedAt: { type: Date, default: Date.now },
        reason:    { type: String, default: '' },
    }],
}, { timestamps: true });

module.exports = mongoose.model('Seller', sellerSchema);
