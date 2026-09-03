// ============================================================================
// SSE Broadcaster — shared singleton for real-time event dispatch + history
// ----------------------------------------------------------------------------
// Used by both Server.js (API routes) and bridgeRoutes.js (bridge sync).
// Any module can call broadcast(eventType, data) to push events to all
// connected admin dashboard clients.
//
// Tracks connection history: every connect/disconnect is recorded with a
// timestamp and the current client count, enabling the admin dashboard to
// render a "peak concurrent connections" chart.
//
// Peak alerts: when concurrent connections exceed a configurable threshold,
// a 'peak-alert' event is broadcast to all clients and logged.
// ============================================================================

const clients = new Set();

// ── Peak Alert Configuration ────────────────────────────────────────────
const PEAK_THRESHOLD = parseInt(process.env.SSE_PEAK_THRESHOLD) || 5;
const ALERT_COOLDOWN_MS = 60000; // 1 minute cooldown between alerts
let lastAlertTime = 0;

// Connection history: array of { timestamp, count, event } objects.
// Capped at 500 entries to prevent unbounded memory growth.
const MAX_HISTORY = 500;
const connectionHistory = [];

// Peak alerts log: array of { timestamp, count, threshold } objects.
const MAX_ALERTS = 100;
const peakAlerts = [];

function recordHistory(event) {
    connectionHistory.push({
        timestamp: new Date().toISOString(),
        count: clients.size,
        event, // 'connect' or 'disconnect'
    });
    // Trim oldest if over cap
    if (connectionHistory.length > MAX_HISTORY) {
        connectionHistory.splice(0, connectionHistory.length - MAX_HISTORY);
    }
}

async function sendPeakAlertEmail(alert) {
    try {
        // Only send if email is configured
        const adminEmail = process.env.ADMIN_EMAIL;
        if (!adminEmail) return;

        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.GMAIL_USER,
                pass: process.env.GMAIL_PASS,
            },
        });

        await transporter.sendMail({
            from: process.env.GMAIL_USER || 'yto-express@example.com',
            to: adminEmail,
            subject: `[YTO Alert] Peak Connection Threshold Exceeded`,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2 style="color: #dc2626;">Peak Connection Alert</h2>
                    <p>The SSE connection count has exceeded the configured threshold.</p>
                    <table style="border-collapse: collapse; margin: 16px 0;">
                        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Current Connections</td><td style="padding: 8px; border: 1px solid #ddd;">${alert.count}</td></tr>
                        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Threshold</td><td style="padding: 8px; border: 1px solid #ddd;">${alert.threshold}</td></tr>
                        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Time</td><td style="padding: 8px; border: 1px solid #ddd;">${alert.timestamp}</td></tr>
                    </table>
                    <p style="color: #666; font-size: 12px;">This is an automated alert from YTO Express Admin Panel.</p>
                </div>
            `,
        });
        console.log(`[SSE-ALERT] Email sent to ${adminEmail}`);
    } catch (err) {
        console.warn(`[SSE-ALERT] Email failed: ${err.message}`);
    }
}

function checkPeakThreshold() {
    const now = Date.now();
    if (clients.size >= PEAK_THRESHOLD && (now - lastAlertTime) > ALERT_COOLDOWN_MS) {
        lastAlertTime = now;
        const alert = {
            timestamp: new Date().toISOString(),
            count: clients.size,
            threshold: PEAK_THRESHOLD,
            message: `Peak connection alert: ${clients.size} concurrent clients (threshold: ${PEAK_THRESHOLD})`,
        };
        peakAlerts.push(alert);
        if (peakAlerts.length > MAX_ALERTS) {
            peakAlerts.splice(0, peakAlerts.length - MAX_ALERTS);
        }
        console.warn(`[SSE-ALERT] ${alert.message}`);
        broadcast('peak-alert', alert);
        // Send email alert (non-blocking)
        sendPeakAlertEmail(alert).catch(() => {});
    }
}

function addClient(res) {
    clients.add(res);
    recordHistory('connect');
    checkPeakThreshold();
    console.log(`[SSE] Client connected. Total: ${clients.size}`);
}

function removeClient(res) {
    clients.delete(res);
    recordHistory('disconnect');
    console.log(`[SSE] Client disconnected. Total: ${clients.size}`);
}

function broadcast(eventType, data) {
    const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of clients) {
        client.write(payload);
    }
}

function getClientCount() {
    return clients.size;
}

function getConnectionHistory() {
    return connectionHistory;
}

function getPeakAlerts() {
    return peakAlerts;
}

function getStats() {
    if (connectionHistory.length === 0) {
        return { current: clients.size, peak: clients.size, total: 0, history: [], threshold: PEAK_THRESHOLD, alerts: [] };
    }
    const peak = Math.max(...connectionHistory.map(h => h.count));
    return {
        current: clients.size,
        peak,
        total: connectionHistory.length,
        history: connectionHistory,
        threshold: PEAK_THRESHOLD,
        alerts: peakAlerts,
    };
}

// Allow runtime threshold adjustment
function setThreshold(newThreshold) {
    if (typeof newThreshold === 'number' && newThreshold > 0) {
        process.env.SSE_PEAK_THRESHOLD = String(newThreshold);
        console.log(`[SSE] Peak threshold updated to ${newThreshold}`);
    }
}

module.exports = { addClient, removeClient, broadcast, getClientCount, getConnectionHistory, getPeakAlerts, getStats, setThreshold };
