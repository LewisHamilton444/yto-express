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
    // Profile / cover photos synced from the app (D-16). Held as whatever the
    // app stored — an https URL or a data URL — and only written when the
    // bridge sends a non-empty value, so a blank never clears a stored photo.
    profilePhotoUrl: { type: String, default: '' },
    coverPhotoUrl: { type: String, default: '' },
    // Business-verification documents submitted from the mobile app
    // (sync-verification). Rendered by PendingVerificationsTable/ReviewModal
    // via `documents[].url`. Same blank-value rule as photos: only written
    // when the bridge sends a non-empty value.
    documents: [{
        name: { type: String, default: '' },
        url: { type: String, default: '' },
        dataUrl: { type: String, default: '' },
    }],
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
