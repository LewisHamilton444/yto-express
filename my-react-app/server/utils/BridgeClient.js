// ============================================================================
// BRIDGE CLIENT — Outbound HTTP Client for Web → Android Sync
// ----------------------------------------------------------------------------
// Sends payloads from the web backend (my-react-app/server) to the Android
// backend (yto_express_backend) via the bridge API. All calls are
// non-blocking (fire-and-forget) with automatic retry and graceful
// degradation — a failed bridge call never crashes the main API response.
//
// Usage:
//   const BridgeClient = require('./utils/BridgeClient');
//   await BridgeClient.sendStatus(trackingNumber, status);
//   await BridgeClient.sendApproval(email, role, status);
//   await BridgeClient.syncParcel(parcelData);
//   await BridgeClient.pollChanges(since);
//
// Environment variables required:
//   ANDROID_BACKEND_URL    — Base URL of the Android backend (e.g. ngrok URL)
//   ANDROID_BRIDGE_API_KEY — Shared secret for bridge authentication
// ============================================================================

const https = require('https');
const http = require('http');
const { URL } = require('url');

// ── Configuration ───────────────────────────────────────────────────────
const ANDROID_BACKEND_URL = process.env.ANDROID_BACKEND_URL || '';
const ANDROID_BRIDGE_API_KEY = process.env.ANDROID_BRIDGE_API_KEY || '';
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 10000;

// ── Bridge Disabled Check ───────────────────────────────────────────────
function isBridgeEnabled() {
    if (!ANDROID_BACKEND_URL) {
        console.warn('[Bridge] ANDROID_BACKEND_URL not configured. Bridge sync disabled.');
        return false;
    }
    return true;
}

// ── Core HTTP Request ───────────────────────────────────────────────────
/**
 * Makes an HTTP POST request to the Android bridge endpoint.
 * Returns { success, data?, error? } — never throws.
 */
async function post(endpoint, payload, attempt = 1) {
    if (!isBridgeEnabled()) return { success: false, error: 'Bridge not configured' };

    const fullUrl = `${ANDROID_BACKEND_URL.replace(/\/$/, '')}/api/bridge${endpoint}`;
    const urlObj = new URL(fullUrl);
    const isHttps = urlObj.protocol === 'https:';
    const body = JSON.stringify(payload);

    const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        timeout: REQUEST_TIMEOUT_MS,
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            ...(ANDROID_BRIDGE_API_KEY ? { 'x-bridge-api-key': ANDROID_BRIDGE_API_KEY } : {}),
        },
    };

    const startTime = Date.now();

    return new Promise((resolve) => {
        const transport = isHttps ? https : http;
        const req = transport.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                const ms = Date.now() - startTime;
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        console.log(`[Bridge→Android] ${endpoint} -> ${res.statusCode} ${ms}ms (attempt ${attempt})`);
                        resolve({ success: true, data: parsed });
                    } else {
                        console.warn(`[Bridge→Android] ${endpoint} -> ${res.statusCode} ${ms}ms: ${parsed.error || parsed.message || data}`);
                        resolve({ success: false, error: parsed.error || parsed.message || `HTTP ${res.statusCode}` });
                    }
                } catch (e) {
                    console.warn(`[Bridge→Android] ${endpoint} -> ${res.statusCode} ${ms}ms (unparseable)`);
                    resolve({ success: false, error: `HTTP ${res.statusCode}: unparseable` });
                }
            });
        });

        req.on('timeout', () => {
            req.destroy();
            console.warn(`[Bridge→Android] ${endpoint} -> TIMEOUT (attempt ${attempt})`);
            resolve({ success: false, error: 'Request timeout' });
        });

        req.on('error', (err) => {
            console.warn(`[Bridge→Android] ${endpoint} -> ERROR: ${err.message} (attempt ${attempt})`);
            resolve({ success: false, error: err.message });
        });

        req.write(body);
        req.end();
    });
}

/**
 * POST with automatic retry on failure.
 */
async function postWithRetry(endpoint, payload) {
    let lastError = '';
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const result = await post(endpoint, payload, attempt);
        if (result.success) return { ...result, attempts: attempt };
        lastError = result.error;
        if (attempt < MAX_RETRIES) {
            const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
            await new Promise((r) => setTimeout(r, delay));
        }
    }
    console.error(`[Bridge→Android] ${endpoint} FAILED after ${MAX_RETRIES} attempts: ${lastError}`);
    return { success: false, error: lastError, attempts: MAX_RETRIES };
}

/**
 * GET request for polling.
 */
async function get(endpoint) {
    if (!isBridgeEnabled()) return { success: false, error: 'Bridge not configured' };

    const fullUrl = `${ANDROID_BACKEND_URL.replace(/\/$/, '')}/api/bridge${endpoint}`;
    const urlObj = new URL(fullUrl);
    const isHttps = urlObj.protocol === 'https:';

    const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        timeout: REQUEST_TIMEOUT_MS,
        headers: {
            ...(ANDROID_BRIDGE_API_KEY ? { 'x-bridge-api-key': ANDROID_BRIDGE_API_KEY } : {}),
        },
    };

    return new Promise((resolve) => {
        const transport = isHttps ? https : http;
        const req = transport.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ success: res.statusCode >= 200 && res.statusCode < 300, data: parsed });
                } catch (e) {
                    resolve({ success: false, error: 'Unparseable response' });
                }
            });
        });
        req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'Timeout' }); });
        req.on('error', (err) => { resolve({ success: false, error: err.message }); });
        req.end();
    });
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Send a parcel status update to the Android backend.
 */
async function sendStatus(trackingNumber, status) {
    return postWithRetry('/receive-status', { trackingNumber, status, updatedAt: new Date().toISOString() });
}

/**
 * Send an approval/rejection to the Android backend.
 */
async function sendApproval(email, role, status) {
    return postWithRetry('/receive-approval', { email, role, status, updatedAt: new Date().toISOString() });
}

/**
 * Sync a parcel to the Android backend.
 */
async function syncParcel(parcelData) {
    return postWithRetry('/receive-parcel', parcelData);
}

/**
 * Poll the Android backend for changes since a timestamp.
 */
async function pollChanges(since) {
    return get(`/poll-changes?since=${encodeURIComponent(since)}`);
}

/**
 * Send an issue ticket status update to the Android backend.
 */
async function sendIssueStatus(ticketId, status, adminNotes = '') {
    return postWithRetry('/receive-issue-status', { ticketId, status, adminNotes, updatedAt: new Date().toISOString() });
}

/**
 * Health check — tests connectivity to the Android backend.
 */
async function healthCheck() {
    if (!isBridgeEnabled()) return { success: false, error: 'Bridge not configured' };
    const fullUrl = `${ANDROID_BACKEND_URL.replace(/\/$/, '')}/api/health`;
    const urlObj = new URL(fullUrl);
    const isHttps = urlObj.protocol === 'https:';

    return new Promise((resolve) => {
        const transport = isHttps ? https : http;
        const req = transport.request({
            hostname: urlObj.hostname,
            port: urlObj.port || (isHttps ? 443 : 80),
            path: '/api/health',
            method: 'GET',
            timeout: 5000,
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => resolve({ success: res.statusCode === 200, body: data }));
        });
        req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'Timeout' }); });
        req.on('error', (err) => resolve({ success: false, error: err.message }));
        req.end();
    });
}

module.exports = { sendStatus, sendApproval, syncParcel, sendIssueStatus, pollChanges, healthCheck, isBridgeEnabled };
