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
  reporterRole: {
    type: String,
    enum: ['customer', 'seller', 'rider', 'guest'],
    default: 'customer',
  },
  status: {
    type: String,
    enum: ['Open', 'Under Investigation', 'Resolved', 'Closed'],
    default: 'Open',
  },
  accountCategory: {
    type: String,
    enum: ['REAL', 'DEMO'],
    default: 'REAL',
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
