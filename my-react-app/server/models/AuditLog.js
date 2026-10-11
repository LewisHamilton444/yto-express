const mongoose = require('mongoose');

// Security audit trail (SH-09): who did what, to what, from where, and whether
// it worked. Written only through utils/auditLog.js, which saves the fields
// below and nothing else, so passwords, tokens, secrets and request bodies can
// never end up in this collection.
const AuditLogSchema = new mongoose.Schema({
  actorId:    { type: String, default: '' },   // account _id, or the rider's registrationId for rider-app events
  actorEmail: { type: String, default: '' },   // for login_failure: the email that was attempted
  actorRole:  { type: String, default: '' },   // super_admin / staff / hub_receiver / rider_app / anonymous
  source:     { type: String, enum: ['admin_panel', 'rider_app'], default: 'admin_panel' },
  action:     { type: String, required: true }, // e.g. login_success, role_changed, parcel_status_changed
  target:     { type: String, default: '' },   // e.g. an account email or a parcel tracking number
  result:     { type: String, enum: ['success', 'failure'], required: true },
  ip:         { type: String, default: '' },
  details:    { type: mongoose.Schema.Types.Mixed, default: {} }, // small, hand-picked values only (e.g. { from, to })
  createdAt:  { type: Date, default: Date.now },
});

// RETENTION POLICY: audit entries are kept for 1 year (365 days) and then
// deleted automatically by MongoDB's TTL monitor. One year covers a full
// academic/review cycle while keeping the collection within the MongoDB Atlas
// free-tier (M0) 512 MB storage limit.
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;
AuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: ONE_YEAR_SECONDS });

// Filters used by GET /api/audit-logs (newest first).
AuditLogSchema.index({ action: 1, createdAt: -1 });
AuditLogSchema.index({ result: 1, createdAt: -1 });
AuditLogSchema.index({ source: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
