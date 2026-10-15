const mongoose = require('mongoose');

// Company fleet vehicle pool (2026-10-13, rider dual-type research).
// COMPANY riders draw from this pool: the company owns the unit, so the
// OR/CR is held HERE (uploaded once per unit by admin), never re-uploaded
// by the rider. PARTNER riders keep their own vehicle docs on
// RiderVerification (orcrUrl/authLetterUrl).
// One row per plate (unique). Assignment is office-driven; a COMPANY rider
// with no assignment stays vehicle-less in the portal (honest state).
const companyVehicleSchema = new mongoose.Schema({
    plateNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
    makeModel: { type: String, default: '', trim: true },
    vehicleType: { type: String, default: 'Motorcycle', trim: true },
    // Company OR/CR (admin-held). Same {name,url,dataUrl} shape the seller /
    // rider verification syncs write, so any existing ReviewModal/doc viewer
    // renders these without new plumbing.
    documents: [{ name: String, url: String, dataUrl: String }],
    // Assigned COMPANY rider (email = merge key used everywhere else).
    assignedRiderEmail: { type: String, default: '', lowercase: true, trim: true },
    assignedAt: { type: Date, default: null },
    assignedBy: { type: String, default: '' }, // admin email who assigned
    status: { type: String, enum: ['Available', 'Assigned', 'Retired'], default: 'Available' },
    notes: { type: String, default: '', trim: true },
    statusHistory: [{
        status: String,
        changedAt: { type: Date, default: Date.now },
        reason: { type: String, default: '' },
    }],
}, { timestamps: true });

module.exports = mongoose.model('CompanyVehicle', companyVehicleSchema);
