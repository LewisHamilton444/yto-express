const mongoose = require('mongoose');

// Mobile-app end-customers, synced in via the bridge adapter (see
// bridgeRoutes.js). Deliberately NOT stored in Account.js: that collection
// gates admin-panel login (its `role` enum is only super_admin/staff/
// hub_receiver and `password` is required), so mixing customer records into
// it would both fail validation and pollute the staff list shown in
// ManageAccounts.jsx. This is its own small, additive collection instead.
const CustomerSchema = new mongoose.Schema({
  customerId:      { type: String, required: true, unique: true }, // YTO-CUST-YYYY-XXXXX
  fullName:        { type: String, required: true },
  email:           { type: String, required: true, unique: true },
  phone:           { type: String, default: '' },
  address:         { type: String, default: '' },
  city:            { type: String, default: '' },
  deliveryInstructions: { type: String, default: '' },
  status:          { type: String, default: 'Active' },
  source:          { type: String, default: 'mobile-app' },
  statusHistory: [{
    status: String,
    changedAt: { type: Date, default: Date.now },
    reason:    { type: String, default: '' },
  }],
}, { timestamps: true });

module.exports = mongoose.model('Customer', CustomerSchema);
