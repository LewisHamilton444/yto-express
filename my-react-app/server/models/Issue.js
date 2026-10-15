const mongoose = require('mongoose');

const IssueSchema = new mongoose.Schema({
  ticketId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true,
  },
  trackingNumber: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
  },
  category: {
    type: String,
    required: true,
    enum: [
      'Damaged Package',
      'Delayed Delivery',
      'Wrong Item Received',
      'Lost Package',
      'Courier Behavior',
      'Incorrect Address',
      'Billing / Payment Issue',
      'Other',
    ],
    default: 'Other',
  },
  // D-14: what the reporter actually chose before the app folded it into a
  // canonical `category` ("Dispute Failed Attempt", "Reschedule Delivery", ...).
  // Empty for an already-canonical report, so triage can tell the two apart
  // without a second category list.
  subCategory: {
    type: String,
    default: '',
    trim: true,
  },
  description: {
    type: String,
    required: true,
    trim: true,
  },
  evidenceImages: {
    type: [String],
    default: [],
  },
  reporterName: {
    type: String,
    default: 'Customer',
    trim: true,
  },
  reporterEmail: {
    type: String,
    default: '',
    trim: true,
  },
  reporterPhone: {
    type: String,
    default: '',
    trim: true,
  },
  productName: {
    type: String,
    default: '',
    trim: true,
  },
  productCategory: {
    type: String,
    default: '',
    trim: true,
  },
  eta: {
    type: String,
    default: '',
    trim: true,
  },
  reporterRole: {
    type: String,
    enum: ['customer', 'seller', 'rider', 'guest'],
    default: 'customer',
  },
  status: {
    type: String,
    // 'Rejected' mirrors the mobile Issue enum (A models/Issue.js:105) — the
    // app has let staff deny a claim since v2, and the bridge used to SKIP a
    // rejected ticket because this list had no equivalent, so the portal never
    // reflected the decision the app had already made.
    enum: ['Open', 'Under Investigation', 'Resolved', 'Rejected', 'Closed'],
    default: 'Open',
  },
  adminNotes: {
    type: String,
    default: '',
    trim: true,
  },
  resolvedAt: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Issue', IssueSchema);
