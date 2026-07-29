const mongoose = require('mongoose');

const sellerSchema = new mongoose.Schema({
    registrationId: { type: String, required: true },
    accountNumber: { type: String, required: true },
    fullName: String,
    idNumber: String,
    idType: String,
    email: { type: String, required: true },
    phone: { type: String, required: true },
    address: String,
    city: String,
    state: String,
    country: String,
    postalCode: String,
    bankName: String,
    commissionRate: Number,
    paymentCycle: String,
    status: { type: String, default: 'ACTIVE' }
});

module.exports = mongoose.model('Seller', sellerSchema);