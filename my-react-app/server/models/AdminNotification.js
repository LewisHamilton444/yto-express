const mongoose = require('mongoose');

// App-originated notifications, persisted via the bridge (POST
// /api/bridge/sync-notification from the Android backend's
// createNotification). Gives the admin panel a real, durable notification
// feed (booking, pickup, delivery, POD uploaded, issue opened) instead of
// transient SSE events or the synthetic alertsFeed derivation.
const adminNotificationSchema = new mongoose.Schema({
    notificationId: { type: String, default: '' },   // Android Notification._id (traceability)
    role: {
        type: String,
        enum: ['customer', 'seller', 'rider', 'admin'],
        default: 'customer',
    },
    title: { type: String, required: true },
    message: { type: String, default: '' },
    type: { type: String, default: 'system' },       // order_update | new_order | system_alert | ...
    relatedId: { type: String, default: '' },        // tracking number / ticket id
    source: { type: String, default: 'mobile-app' },
    read: { type: Boolean, default: false },        // server-side read state (shared across admin sessions)
    readAt: { type: Date, default: null },
}, { timestamps: true });

adminNotificationSchema.index({ createdAt: -1 });
adminNotificationSchema.index({ role: 1, createdAt: -1 });

module.exports = mongoose.model('AdminNotification', adminNotificationSchema);
