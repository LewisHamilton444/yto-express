const dns = require('node:dns');
// Force Node's default global DNS resolver to use IPv4 addresses first
dns.setServers(['8.8.8.8', '8.8.4.4']);

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const twilio = require('twilio');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');

// Load .env anchored to this file
dotenv.config({ path: path.resolve(__dirname, '.env') });

const app = express();

// Render terminates TLS and forwards requests to the app, so the client IP
// lives in X-Forwarded-For. Without trust proxy, express-rate-limit cannot
// key its counters on the real client IP behind the proxy (rate-limit v8+
// throws a validation error in that setup, which would 500 every login).
app.set('trust proxy', 1);

// Security HTTP headers (2026 audit H3): packaged via helmet with a CSP that
// tolerates the admin's inline-style design system while blocking frame
// embedding, MIME sniffing, and mixed content downgrades.
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https:', 'http:'],
            connectSrc: ["'self'", 'https:', 'http:', 'ws:', 'wss:'],
            fontSrc: ["'self'", 'https:', 'data:'],
            frameAncestors: ["'none'"],
            objectSrc: ["'none'"],
        },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    strictTransportSecurity: { maxAge: 15552000 },
}));

// CORS (2026 audit M1, tightened by SH-05): no wildcard. Same-origin and
// localhost dev origins are always allowed; production origins must be listed
// EXACTLY in CORS_ORIGIN (comma-separated, e.g.
// CORS_ORIGIN=https://yto-express-web.onrender.com). The old "any
// *.onrender.com host" rule was removed â€” anyone can create an onrender.com
// site, so it let attacker pages call this API from a browser. Disallowed
// origins get no ACAO header at all.
//
// BUGFIX 2026-09-22 â€” this predicate previously had signature (origin) => bool.
// cors@2.8.6 treats a FUNCTION origin as the async-decision contract
// (origin, callback) => void. Our predicate never invoked its 2nd argument,
// so cors's internal continuation never ran, next() was never called, and
// EVERY request â€” allowed or not â€” hung until the client timed out. That was
// the login page's "stuck spinner + error after ~1 minute" (apiFetch's 60s
// abort) and the perpetually orange "Connecting..." health pill. The fixed
// form below keeps the same allowlist rules but answers cors's callback:
//   cb(null, originValue)  â†’ allow (reflects the origin)
//   cb(null, false)        â†’ deny (no ACAO header, request still proceeds)
//   cb(err)                â†’ reject with error
// Verified against the installed cors source: server/node_modules/cors/lib/index.js
// (middlewareWrapper â†’ originCallback(req.headers.origin, function (err2, origin) ...)).
const isAllowedCorsOrigin = (origin, callback) => {
    if (!origin) return callback(null, true); // same-origin requests, curl, native clients
    try {
        const { hostname } = new URL(origin);
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return callback(null, origin);
        }
    } catch { return callback(null, false); }
    const allowed = (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
    return callback(null, allowed.includes(origin) ? origin : false);
};

app.use(cors({
    origin: isAllowedCorsOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '15mb' })); // I-3e/G-32: was 1mb - a POD-bearing syncParcel (7MB JPEG -> ~9.33MB base64) 413'd and the mobile queue silently discarded it. 15mb matches the mobile backend's own C-18 precedent.
app.use((req, res, next) => {
    if (req.body && typeof req.body === 'object') stripMongoOperators(req.body);
    next();
});

// â”€â”€ EDITABLE-FIELD ALLOWLISTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Every admin PUT below assigns its fields straight into $set, so each request body
// is filtered through an explicit allowlist first. Without this, an authenticated
// admin could write any schema field, and validation was off so bad values were
// stored silently. Deliberately NOT writable: identity (trackingNumber, parcelId,
// registrationId, accountNumber), delivery proof (podPhoto), rider telemetry
// (riderLat/riderLng), money (codAmount, deliveryFee), derived counters
// (deliveries, rating, successRate, isOnDuty), and the Web-minted identity
// artifacts (qrPayload, sellerEnterpriseId, customerEnterpriseId, trackingGeofence)
// â€” the Web is the sole minting authority for those.
const pickEditable = (body, allowed) => {
    const updates = {};
    allowed.forEach((field) => {
        if (body[field] !== undefined) updates[field] = body[field];
    });
    return updates;
};

// Maps a thrown error to an honest, non-technical client response.
//   - Mongoose validation / cast failures are the caller's problem -> 400
//   - a duplicate key is a conflict -> 409
//   - everything else is logged in full server-side and answered generically
// The raw driver text used to be sent straight to the admin UI
// ("E11000 duplicate key error collection: test.parcels index:
// trackingNumber_1", "Cannot read properties of null"), which leaked
// collection and index names and read to an operator as a crash.
function respondError(res, error, context = 'request') {
    if (error && error.name === 'ValidationError') {
        return res.status(400).json({ error: 'Some details are missing or not valid. Please check the form and try again.' });
    }
    if (error && error.name === 'CastError') {
        return res.status(400).json({ error: 'That reference is not valid. Please pick the record again.' });
    }
    if (error && error.code === 11000) {
        const field = Object.keys(error.keyPattern || {})[0] || '';
        if (field === 'trackingNumber') {
            return res.status(409).json({ error: 'A parcel with that tracking number already exists.' });
        }
        if (field === 'email') {
            return res.status(409).json({ error: 'A record with that email already exists.' });
        }
        return res.status(409).json({ error: 'That record already exists.' });
    }
    console.error(`[API:${context}]`, error && error.message ? error.message : error);
    return res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
}

const CUSTOMER_EDITABLE_FIELDS = [
    'fullName', 'email', 'phone', 'address', 'city', 'deliveryInstructions', 'status',
];

const SELLER_EDITABLE_FIELDS = [
    'fullName', 'storeName', 'warehouseAddress', 'operatingHours',
    'idType', 'idNumber', 'email', 'phone', 'address', 'city', 'state',
    'country', 'postalCode', 'bankName', 'commissionRate', 'paymentCycle', 'status', 'documents',
];

const RIDER_EDITABLE_FIELDS = [
    'riderName', 'vehicleType', 'email', 'phone', 'address', 'city', 'state',
    'country', 'postalCode', 'licenseNumber', 'vehiclePlate', 'riderType',
    'emergencyContactName', 'emergencyContactPhone', 'bankName',
    'payoutRate', 'payoutCycle', 'assignedHub', 'status', 'documents',
];

// events IS allowed: office status screens legitimately append timeline entries
// through this route. Hub accounts never reach this list (see applyHubStatus).
const PARCEL_EDITABLE_FIELDS = [
    'senderName', 'senderPhone', 'senderEmail',
    'receiverName', 'receiverPhone', 'recipientEmail',
    'item', 'weight', 'value', 'origin', 'destination',
    'status', 'riderId', 'events', 'notes',
    'paymentMode', 'packageCount', 'packageCategory', 'packageType',
    'dimensions', 'estimatedDeliveryDate', 'actualDeliveryDate',
];

// â”€â”€ PART 5.2: office field edits that must reach the mobile app â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// The app's POST /api/bridge/receive-parcel reads these names. An office edit
// used to stop at this database entirely, so the app kept the old payment
// mode / piece count / category / item indefinitely.
// Deliberately EXCLUDED from this push:
//   value              - the mobile Shipment has no counterpart field
//   status             - already travels via BridgeClient.sendStatus
//                        (vocabulary-validated + audited there)
//   riderId            - already travels via emitRiderAssignPush, which
//                        resolves it to an email the app can look up
//   events             - the portal's own timeline; the app stamps its own
//   actualDeliveryDate - the app owns that clock (Delivered / Returned)
const PARCEL_FIELD_PUSH_TO_APP = [
    'senderName', 'senderPhone', 'senderEmail',
    'receiverName', 'receiverPhone', 'recipientEmail',
    'item', 'weight', 'origin', 'destination', 'notes',
    'paymentMode', 'packageCount', 'packageCategory', 'packageType',
    'dimensions', 'estimatedDeliveryDate',
];

// parcelId excluded: it is the join key with Parcel, so rewriting it would orphan
// the location from the parcel it belongs to.
const PARCEL_LOCATION_EDITABLE_FIELDS = [
    'lat', 'lng', 'location', 'type', 'status', 'geofence', 'notes',
];

const Seller          = require('./models/Seller');
const Rider           = require('./models/Rider');
const CompanyVehicle  = require('./models/CompanyVehicle');
const Customer        = require('./models/Customer');
const Parcel          = require('./models/Parcel');
const ParcelLocation  = require('./models/ParcelLocation');
const BridgeClient    = require('./utils/BridgeClient');
const bridgeReconcile = require('./utils/bridgeReconcile');
const Account         = require('./models/Account');
const Issue           = require('./models/Issue');
const AdminNotification = require('./models/AdminNotification');
const sseBroadcaster  = require('./utils/sseBroadcaster');
const {
    initAppDatabase,
    enrichParcelsFromAppDb,
    enrichParcelLocationsFromAppDb,
    enrichRidersFromAppDb,
} = require('./utils/appDatabase');
const AuditLog        = require('./models/AuditLog');
const { logAudit }    = require('./utils/auditLog');
const {
    MAX_DELIVERY_ATTEMPTS, FAILED_ATTEMPT_REASONS, NOTES_MAX_LENGTH, STATUS: DELIVERY_STATUS,
    FAILED_ATTEMPT_ALLOWED_FROM, REDELIVER_ALLOWED_FROM,
    computeNextAttemptDate, mapWebAttemptsToApp,
} = require('./utils/deliveryAttempts');
const { resolveParcelCurrentLocation } = require('./utils/parcelLocationResolver');

// â”€â”€ JWT AUTHENTICATION MIDDLEWARE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// No fallback: a missing JWT_SECRET must be a loud startup failure, never a
// silent fall-through to a publicly-known string (token forgery risk).
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || !JWT_SECRET.trim()) {
  console.error('[Startup Error] JWT_SECRET is not set. Add it to server/.env or set it as a deployment env variable.');
  process.exit(1);
}

// 2026 audit L1: HS256 only. A forged/rewritten alg claim is rejected before
// the payload is trusted.
function verifyJwtToken(token) {
  return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
}

// 2026 audit M2: an account's Deactivated status is enforced on EVERY
// authenticated request, not just at login â€” an existing token cannot keep
// working after an admin neutralizes the account.
async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    let decoded;
    try {
        decoded = verifyJwtToken(token);
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired. Please log in again.' });
        }
        return res.status(403).json({ error: 'Invalid token.' });
    }

    const account = mongoose.isValidObjectId(decoded.id)
        ? await Account.findById(decoded.id)
        : await Account.findOne({ $or: [{ adminId: decoded.id }, { email: decoded.id }, { email: decoded.email }] });
    if (!account) {
        return res.status(401).json({ error: 'Account no longer exists. Please log in again.' });
    }
    if (account.status !== 'Active') {
        return res.status(403).json({ error: 'This account is deactivated. Contact your Super Admin.' });
    }

    req.user = { ...decoded, status: account.status };
    next();
}

// 2026 audit C1/C2: with the exception of the account routes, every admin
// route previously trusted ANY authenticated role. requireRole closes the
// staff/hub_receiver privilege-escalation surface.
function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Access denied. You do not have permission for this action.' });
        }
        next();
    };
}

// 2026-09-29 RBAC pass: role groups mirror the admin panel's page access
// (AnalyticsDashboard getMenuSections/canOpenPage). The panel hides pages a
// role cannot open, but a hidden page is not a protected one â€” these checks
// are what actually stop a staff or hub account calling the API directly.
//   ANY_ROLE    â€” every signed-in role (the hub dashboard reads these)
//   OFFICE      â€” super_admin + staff (people, parcels admin, issues, logs)
//   SUPER_ONLY  â€” super_admin (deletes, map/geofence edits, settings)
const ANY_ROLE = ['super_admin', 'staff', 'hub_receiver'];
const OFFICE = ['super_admin', 'staff'];
const SUPER_ONLY = ['super_admin'];

// â”€â”€ I-6 manual reconcile trigger (auth) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Two accepted credentials, because the callers differ: the bridge secret for
// ops scripts / the app backend, and a signed-in super_admin for the portal's
// own "sync now" nudge (a browser can never hold the server secret). Anything
// else is refused by the existing middleware, unchanged.
function bridgeKeyMatches(req) {
    const expected = process.env.BRIDGE_API_KEY;
    if (!expected) return false;
    const presented = String(req.get('x-bridge-api-key') || '');
    const a = Buffer.from(presented);
    const b = Buffer.from(String(expected));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireBridgeKeyOrSuperAdmin(req, res, next) {
    if (bridgeKeyMatches(req)) return next();
    return authenticateToken(req, res, () => requireRole(...SUPER_ONLY)(req, res, next));
}

async function handleBridgeReconcile(req, res) {
    try {
        const result = await bridgeReconcile.runOnce();
        return res.status(result.ok ? 200 : 503).json(result);
    } catch (error) {
        return sendServerError(res, error, `POST ${req.path}`);
    }
}
// 2026-09-29 secure error handling: never send raw exception text (database
// error codes, duplicate-key index names, validation internals, stack
// traces, file paths) to the client. The full error is logged server-side
// with a short reference id; the client gets a generic message plus that id,
// so support can find the log line without the response revealing anything.
function sendServerError(res, error, context = 'request') {
    const ref = Math.random().toString(36).slice(2, 10);
    console.error(`[Server Error ${ref}] ${context}:`, error && error.stack ? error.stack : error);
    if (error && (error.name === 'ValidationError' || error.name === 'CastError')) {
        return res.status(400).json({ error: 'Some of the submitted information is invalid. Please check it and try again.', ref });
    }
    if (error && error.code === 11000) {
        return res.status(409).json({ error: 'A record with these details already exists.', ref });
    }
    return res.status(500).json({ error: 'Something went wrong on our side. Please try again.', ref });
}

// Strips MongoDB operator keys ($gt, $where, $ne, ...) from request bodies,
// so a JSON body can never smuggle a query operator into a findOne/update
// (NoSQL injection). Plain field names are untouched.
function stripMongoOperators(value, depth = 0) {
    if (depth > 20 || value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(v => stripMongoOperators(v, depth + 1));
    for (const key of Object.keys(value)) {
        if (key.startsWith('$')) delete value[key];
        else value[key] = stripMongoOperators(value[key], depth + 1);
    }
    return value;
}

// Rate limiting (2026 audit H1/M4): brute-force guard on sign-in and the
// messaging endpoints that burn money (SMS) or can be abused for spoofing.
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    // Defaults to 10. A local QA run (repeated sign-in matrix from one IP)
    // may raise it with LOGIN_MAX_ATTEMPTS so the tester is not locked out
    // of their own window; production leaves the variable unset.
    max: Number(process.env.LOGIN_MAX_ATTEMPTS || 10),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many sign-in attempts. Please try again in 15 minutes.' },
});
const messageLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many messages sent. Please try again later.' },
});

// 2026 audit L3: server-side password floor for admin accounts created/reset
// through the API. The bootstrap accounts (env-seeded) bypass this route.
function validateAdminPassword(password) {
    if (!password || typeof password !== 'string' || password.length < 8) {
        return 'Password must be at least 8 characters';
    }
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
        return 'Password must include at least one letter and one number';
    }
    return null;
}

// â”€â”€ ROOT ROUTE â”€â”€
app.get('/', (req, res) => {
    res.send('YTO Express API Server is Running!');
});

// â”€â”€ HEALTH CHECK â”€â”€
// Machine-readable liveness endpoint (the root route returns prose). The login
// page's server-status pill probes this; before it existed the pill polled '/'
// and could not distinguish "API up" from "some other server on that port".
app.get('/api/health', (req, res) => {
    const dbState = mongoose.connection.readyState; // 1 = connected
    res.status(dbState === 1 ? 200 : 503).json({
        status: dbState === 1 ? 'ok' : 'degraded',
        db: dbState === 1 ? 'connected' : 'disconnected',
        uptimeSeconds: Math.floor(process.uptime()),
    });
});

// â”€â”€ SSE EVENT STREAM â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// 2026 audit H2: the stream is now authenticated. A browser EventSource cannot
// send request headers, so the dashboard already rides the JWT as ?token=; the
// server validates it (HS256 + real Active Account) BEFORE opening the stream,
// and rejects anonymous/expired tokens with 401/403. Residual: the token rides
// the query string (visible in access logs) â€” swapping the frontend to a
// fetch()-based reader with an Authorization header removes that residual.
app.get('/api/events/stream', async (req, res) => {
    // 2026 audit M5: Authorization header is the preferred carrier (the
    // dashboard reads the stream with fetch()+ReadableStream, so the JWT stays
    // out of the URL). The ?token= query path remains as a legacy fallback for
    // any older client build still in the field; remove it once retired.
    const authHeader = req.headers['authorization'];
    const headerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const token = headerToken || req.query.token;
    let decoded;
    if (token) {
        try {
            decoded = verifyJwtToken(token);
        } catch { decoded = null; }
    }
    if (!decoded) {
        return res.status(401).json({ error: 'Authentication required.' });
    }
    const streamAccount = await Account.findById(decoded.id);
    if (!streamAccount || streamAccount.status !== 'Active') {
        return res.status(403).json({ error: 'Account unavailable.' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    res.write(`event: connected\ndata: ${JSON.stringify({ message: 'SSE connected', timestamp: new Date().toISOString() })}\n\n`);

    sseBroadcaster.addClient(res);

    const heartbeat = setInterval(() => {
        res.write(`: heartbeat\n\n`);
    }, 30000);

    req.on('close', () => {
        sseBroadcaster.removeClient(res);
        clearInterval(heartbeat);
    });
});

// â”€â”€ SSE STATS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/events/stats', authenticateToken, (req, res) => {
    const stats = sseBroadcaster.getStats();
    res.json({
        connectedClients: stats.current,
        peakConnections: stats.peak,
        totalEvents: stats.total,
        threshold: stats.threshold,
        timestamp: new Date().toISOString(),
    });
});

// â”€â”€ SSE CONNECTION HISTORY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/events/history', authenticateToken, (req, res) => {
    const history = sseBroadcaster.getConnectionHistory();
    res.json(history);
});

// â”€â”€ SSE PEAK ALERTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/events/alerts', authenticateToken, (req, res) => {
    const alerts = sseBroadcaster.getPeakAlerts();
    res.json(alerts);
});

// â”€â”€ SSE THRESHOLD CONFIG â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.put('/api/events/threshold', authenticateToken, requireRole(...SUPER_ONLY), (req, res) => {
    const { threshold } = req.body;
    if (typeof threshold !== 'number' || threshold < 1) {
        return res.status(400).json({ error: 'threshold must be a positive number' });
    }
    sseBroadcaster.setThreshold(threshold);
    res.json({ success: true, threshold, message: `Threshold updated to ${threshold}` });
});

// â”€â”€ BRIDGE ROUTES â”€â”€
// I-6: the manual reconcile trigger must be registered BEFORE this mount so
// it can accept a signed-in super_admin as well as the shared bridge secret.
// (The 60s loop in utils/bridgeReconcile.js runs regardless of this route; the
// endpoint is the "sync now" nudge the portal fires on load, and the hook a
// QA script uses.) It is deliberately NOT reachable without either credential
// â€” an unauthenticated endpoint that writes records on demand would be a
// denial-of-service lever on the live database.
app.post('/api/bridge/reconcile', requireBridgeKeyOrSuperAdmin, handleBridgeReconcile);

app.use('/api/bridge', require('./bridgeRoutes'));

// â”€â”€ SELLER ROUTES â”€â”€
app.post('/api/sellers', authenticateToken, requireRole(...OFFICE), async (req, res) => {
    try {
        const sellerEmail = String(req.body.email || '').toLowerCase().trim();
        if (sellerEmail) {
            const existingSeller = await Seller.findOne({ email: sellerEmail });
            if (existingSeller) {
                return res.status(400).json({ error: 'A seller with this email already exists.' });
            }
        }
        const newSeller = new Seller({ ...req.body, email: sellerEmail || req.body.email });
        // Every new seller needs a registration entry: the activity log is
        // built from statusHistory, so a web-created seller without one was
        // invisible in the audit trail (mobile-synced rows always carried it).
        newSeller.statusHistory = [{
            status: newSeller.status || 'ACTIVE',
            reason: `${newSeller.fullName || 'Seller'} registered as seller`,
            changedAt: new Date(),
        }];
        await newSeller.save();

        if (newSeller.email && (newSeller.status === 'ACTIVE' || newSeller.status === 'Active')) {
            BridgeClient.sendApproval(newSeller.email, 'seller', newSeller.status, newSeller.registrationId)
                .catch(e => console.warn('[Bridgeâ†’Android] sendApproval seller failed:', e.message));
        }

        res.status(201).json({ message: "Seller saved!", data: newSeller });
    } catch (error) {
        respondError(res, error, 'POST /api/sellers');
    }
});

app.get('/api/sellers', authenticateToken, async (req, res) => {
    try {
        const filter = {};
        if (req.query.status) {
            // Escape the value before it becomes a pattern: raw input here is
            // regex injection, and a crafted value can also hang the event loop.
            const escapedStatus = req.query.status.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            filter.status = new RegExp(`^${escapedStatus}$`, 'i');
        }
        const sellers = await Seller.find(filter).sort({ createdAt: -1 });
        res.json(sellers);
    } catch (error) {
        sendServerError(res, error, `${req.method} ${req.path}`);
    }
});

app.put('/api/sellers/:id', authenticateToken, requireRole(...OFFICE), async (req, res) => {
    try {
        const updates = pickEditable(req.body, SELLER_EDITABLE_FIELDS);
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No updatable fields were provided.' });
        }

        const updated = await Seller.findByIdAndUpdate(
            req.params.id,
            { $set: updates },
            { new: true, runValidators: true }
        );

        if (!updated) {
            return res.status(404).json({ error: 'That seller could not be found.' });
        }

        if (req.body.status && updated.email) {
            BridgeClient.sendApproval(updated.email, 'seller', req.body.status, updated.registrationId)
                .catch(e => console.warn('[Bridgeâ†’Android] sendApproval failed:', e.message));
        }

        if (updated && updated.email) {
            BridgeClient.sendUserUpdate(updated.email, 'seller', {
                name: updated.fullName,
                phone: updated.phone,
                storeName: updated.storeName,
                warehouseAddress: updated.warehouseAddress,
                operatingHours: updated.operatingHours,
                address: updated.address,
                city: updated.city,
            }).catch(e => console.warn('[Bridgeâ†’Android] sendUserUpdate seller failed:', e.message));
        }

        res.json(updated);
    } catch (error) {
        sendServerError(res, error, `${req.method} ${req.path}`);
    }
});

app.delete('/api/sellers/:id', authenticateToken, requireRole(...SUPER_ONLY), async (req, res) => {
    try {
        const deletedSeller = await Seller.findByIdAndDelete(req.params.id);
        if (!deletedSeller) {
            return res.status(404).json({ error: 'That seller could not be found.' });
        }
        res.json({ message: "Seller deleted!" });
    } catch (error) {
        sendServerError(res, error, `${req.method} ${req.path}`);
    }
});

// â”€â”€ RIDER ROUTES â”€â”€
app.post('/api/riders', authenticateToken, requireRole(...OFFICE), async (req, res) => {
    try {
        const riderEmail = String(req.body.email || '').toLowerCase().trim();
        if (riderEmail) {
            const existingRider = await Rider.findOne({ email: riderEmail });
            if (existingRider) {
                return res.status(400).json({ error: 'A rider with this email already exists.' });
            }
        }
        const newRider = new Rider({ ...req.body, email: riderEmail || req.body.email });
        // Same audit-trail requirement as sellers: the activity log reads
        // statusHistory, so a web-created rider must carry a registration row.
        newRider.statusHistory = [{
            status: newRider.status || 'Active',
            reason: `${newRider.riderName || 'Rider'} registered as rider`,
            changedAt: new Date(),
        }];
        await newRider.save();

        if (newRider.email && (newRider.status === 'ACTIVE' || newRider.status === 'Active')) {
            BridgeClient.sendApproval(newRider.email, 'rider', newRider.status, newRider.registrationId)
                .catch(e => console.warn('[Bridgeâ†’Android] sendApproval rider failed:', e.message));
        }

        res.status(201).json({ message: "Rider saved!", data: newRider });
    } catch (error) {
        respondError(res, error, 'POST /api/riders');
    }
});

app.get('/api/riders', authenticateToken, async (req, res) => {
    try {
        const filter = {};
        if (req.query.status) {
            // Escape the value before it becomes a pattern: raw input here is
            // regex injection, and a crafted value can also hang the event loop.
            const escapedStatus = req.query.status.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            filter.status = new RegExp(`^${escapedStatus}$`, 'i');
        }
        const riders = await Rider.find(filter).sort({ createdAt: -1 }).lean();
        const enriched = await enrichRidersFromAppDb(riders);
        res.json(enriched);
    } catch (error) {
        sendServerError(res, error, `${req.method} ${req.path}`);
    }
});

app.put('/api/riders/:id', authenticateToken, requireRole(...OFFICE), async (req, res) => {
    try {
        const updates = pickEditable(req.body, RIDER_EDITABLE_FIELDS);
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No updatable fields were provided.' });
        }

        const updated = await Rider.findByIdAndUpdate(
            req.params.id,
            { $set: updates },
            { new: true, runValidators: true }
        );

        if (!updated) {
            return res.status(404).json({ error: 'That rider could not be found.' });
        }

        if (req.body.status && updated.email) {
            BridgeClient.sendApproval(updated.email, 'rider', req.body.status, updated.registrationId)
                .catch(e => console.warn('[Bridgeâ†’Android] sendApproval failed:', e.message));
        }

        if (updated && updated.email) {
            BridgeClient.sendUserUpdate(updated.email, 'rider', {
                name: updated.riderName,
                phone: updated.phone,
                vehicleModel: updated.vehicleType,
                plateNumber: updated.vehiclePlate,
                assignedHub: updated.assignedHub,
                address: updated.address,
                city: updated.city,
            }).catch(e => console.warn('[Bridgeâ†’Android] sendUserUpdate rider failed:', e.message));
        }

        res.json(updated);
    } catch (error) {
        sendServerError(res, error, `${req.method} ${req.path}`);
    }
});

app.delete('/api/riders/:id', authenticateToken, requireRole(...SUPER_ONLY), async (req, res) => {
    try {
        const deletedRider = await Rider.findByIdAndDelete(req.params.id);
        if (!deletedRider) {
            return res.status(404).json({ error: 'That rider could not be found.' });
        }
        res.json({ message: "Rider deleted!" });
    } catch (error) {
        sendServerError(res, error, `${req.method} ${req.path}`);
    }
});

// â”€â”€ RIDER GPS PING â”€â”€
// Called by the rider app (or server/simulateRider.js) every few seconds with
// the rider's current position. Only the LATEST position is kept, on the rider
// record itself, so the Geofence Monitor (which already loads GET /api/riders)
// can move the rider's pin. The app has no admin login, so this route is locked
// with the same shared secret as /api/bridge (header: x-bridge-api-key).
function requireBridgeKey(req, res, next) {
    const expected = process.env.BRIDGE_API_KEY;
    if (!expected) {
        return res.status(503).json({ error: 'Bridge API key not configured.' });
    }
    if (req.get('x-bridge-api-key') !== expected) {
        return res.status(401).json({ error: 'Missing or invalid bridge API key.' });
    }
    next();
}

app.post('/api/riders/:registrationId/location', requireBridgeKey, async (req, res) => {
    try {
        const lat = Number(req.body.latitude);
        const lng = Number(req.body.longitude);
        if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
            return res.status(400).json({ error: '"latitude" and "longitude" must be valid numbers.' });
        }

        const lastLocation = { lat, lng, recordedAt: new Date() };
        const heading = Number(req.body.heading);
        if (req.body.heading !== undefined && Number.isFinite(heading)) {
            lastLocation.heading = ((heading % 360) + 360) % 360;
        }
        // Use the phone's timestamp when it is a real date, otherwise server time.
        // A timestamp more than 1 minute in the future is ignored (server time
        // is used instead): a wrong phone clock could otherwise keep a rider
        // showing "Live" long after the pings stop. Past timestamps are kept,
        // so a delayed ping correctly shows as stale.
        const MAX_FUTURE_SKEW_MS = 60 * 1000;
        const sentAt = new Date(req.body.timestamp);
        if (req.body.timestamp && !Number.isNaN(sentAt.getTime())
            && sentAt.getTime() <= Date.now() + MAX_FUTURE_SKEW_MS) {
            lastLocation.recordedAt = sentAt;
        }

        const regParam = String(req.params.registrationId || '').trim();
        const riderQuery = {
            $or: [
                { registrationId: regParam },
                ...(mongoose.Types.ObjectId.isValid(regParam) ? [{ _id: regParam }] : []),
            ]
        };
        const rider = await Rider.findOneAndUpdate(
            riderQuery,
            { $set: { lastLocation } },
            { new: true }
        );
        if (!rider) {
            return res.status(404).json({ error: 'That rider could not be found.' });
        }
        sseBroadcaster.broadcast('location-synced', {
            riderId: rider.registrationId,
            lat,
            lng,
            recordedAt: lastLocation.recordedAt,
        });
        res.json({ message: 'Location received.', riderId: rider.registrationId, lastLocation: rider.lastLocation });
    } catch (error) {
        sendServerError(res, error, `${req.method} ${req.path}`);
    }
});

// ── COMPANY VEHICLE ROUTES (fleet pool for COMPANY riders) ──
const COMPANY_VEHICLE_EDITABLE = ['makeModel', 'vehicleType', 'documents', 'notes'];
app.get('/api/company-vehicles', authenticateToken, requireRole(...OFFICE), async (req, res) => {
    try {
        const vehicles = await CompanyVehicle.find({}).sort({ createdAt: -1 });
        res.json(vehicles);
    } catch (error) {
        sendServerError(res, error, `${req.method} ${req.path}`);
    }
});
app.post('/api/company-vehicles', authenticateToken, requireRole(...OFFICE), async (req, res) => {
    try {
        const plateNumber = String(req.body.plateNumber || '').trim().toUpperCase();
        if (!plateNumber) { return res.status(400).json({ error: 'Plate number is required.' }); }
        const existing = await CompanyVehicle.findOne({ plateNumber });
        if (existing) { return res.status(400).json({ error: 'A vehicle with this plate already exists.' }); }
        const doc = await CompanyVehicle.create({
            plateNumber,
            makeModel: String(req.body.makeModel || '').trim(),
            vehicleType: String(req.body.vehicleType || 'Motorcycle').trim(),
            notes: String(req.body.notes || '').trim(),
            statusHistory: [{ status: 'Available', reason: 'Added to fleet pool' }],
        });
        res.status(201).json(doc);
    } catch (error) {
        sendServerError(res, error, `${req.method} ${req.path}`);
    }
});
app.put('/api/company-vehicles/:id', authenticateToken, requireRole(...OFFICE), async (req, res) => {
    try {
        const updates = pickEditable(req.body, COMPANY_VEHICLE_EDITABLE);
        if (Object.keys(updates).length === 0) { return res.status(400).json({ error: 'No updatable fields were provided.' }); }
        const updated = await CompanyVehicle.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true, runValidators: true });
        if (!updated) { return res.status(404).json({ error: 'That vehicle could not be found.' }); }
        res.json(updated);
    } catch (error) {
        sendServerError(res, error, `${req.method} ${req.path}`);
    }
});
app.put('/api/company-vehicles/:id/assign', authenticateToken, requireRole(...OFFICE), async (req, res) => {
    try {
        const vehicle = await CompanyVehicle.findById(req.params.id);
        if (!vehicle) { return res.status(404).json({ error: 'That vehicle could not be found.' }); }
        if (vehicle.status === 'Retired') { return res.status(400).json({ error: 'A retired vehicle cannot be assigned.' }); }
        if (vehicle.assignedRiderEmail) { return res.status(400).json({ error: 'This vehicle is already assigned. Unassign it first.' }); }
        const riderEmail = String(req.body.riderEmail || '').trim().toLowerCase();
        if (!riderEmail) { return res.status(400).json({ error: 'Rider email is required.' }); }
        const rider = await Rider.findOne({ email: riderEmail });
        if (!rider) { return res.status(404).json({ error: 'That rider could not be found.' }); }
        if (rider.riderType !== 'COMPANY') {
            return res.status(400).json({ error: 'Only COMPANY riders use fleet vehicles. This rider is not classified as COMPANY.' });
        }
        vehicle.assignedRiderEmail = riderEmail;
        vehicle.assignedAt = new Date();
        vehicle.assignedBy = req.user && req.user.email ? req.user.email : '';
        vehicle.status = 'Assigned';
        vehicle.statusHistory.push({ status: 'Assigned', reason: `Assigned to ${riderEmail}` });
        await vehicle.save();
        res.json(vehicle);
    } catch (error) {
        sendServerError(res, error, `${req.method} ${req.path}`);
    }
});
app.put('/api/company-vehicles/:id/unassign', authenticateToken, requireRole(...OFFICE), async (req, res) => {
    try {
        const vehicle = await CompanyVehicle.findById(req.params.id);
        if (!vehicle) { return res.status(404).json({ error: 'That vehicle could not be found.' }); }
        if (!vehicle.assignedRiderEmail) { return res.status(400).json({ error: 'This vehicle is not assigned.' }); }
        const prev = vehicle.assignedRiderEmail;
        vehicle.assignedRiderEmail = '';
        vehicle.assignedAt = null;
        vehicle.assignedBy = '';
        vehicle.status = 'Available';
        vehicle.statusHistory.push({ status: 'Available', reason: `Unassigned from ${prev}` });
        await vehicle.save();
        res.json(vehicle);
    } catch (error) {
        sendServerError(res, error, `${req.method} ${req.path}`);
    }
});
app.delete('/api/company-vehicles/:id', authenticateToken, requireRole(...SUPER_ONLY), async (req, res) => {
    try {
        const deleted = await CompanyVehicle.findByIdAndDelete(req.params.id);
        if (!deleted) { return res.status(404).json({ error: 'That vehicle could not be found.' }); }
        res.json({ message: 'Vehicle removed from fleet pool.' });
    } catch (error) {
        sendServerError(res, error, `${req.method} ${req.path}`);
    }
});
// â”€â”€ CUSTOMER ROUTES â”€â”€
app.get('/api/customers', authenticateToken, requireRole(...OFFICE), async (req, res) => {
    try {
        const customers = await Customer.find({}).sort({ createdAt: -1 });
        res.json(customers);
    } catch (error) {
        sendServerError(res, error, `${req.method} ${req.path}`);
    }
});

app.put('/api/customers/:id', authenticateToken, requireRole(...OFFICE), async (req, res) => {
    try {
        const query = mongoose.isValidObjectId(req.params.id)
            ? { _id: req.params.id }
            : { customerId: req.params.id };

        const updates = pickEditable(req.body, CUSTOMER_EDITABLE_FIELDS);

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No updatable fields were provided.' });
        }

        const updated = await Customer.findOneAndUpdate(
            query,
            { $set: updates },
            { new: true, runValidators: true }
        );

        if (!updated) {
            return res.status(404).json({ error: 'Customer not found.' });
        }

        if (updated.email) {
            BridgeClient.sendUserUpdate(updated.email, 'customer', {
                name: updated.fullName,
                phone: updated.phone,
                address: updated.address,
                city: updated.city,
                deliveryInstructions: updated.deliveryInstructions,
            }).catch(e => console.warn('[Bridgeâ†’Android] sendUserUpdate customer failed:', e.message));
        }

        res.json(updated);
    } catch (error) {
        sendServerError(res, error, `${req.method} ${req.path}`);
    }
});

app.delete('/api/customers/:id', authenticateToken, requireRole(...SUPER_ONLY), async (req, res) => {
    try {
        const query = mongoose.isValidObjectId(req.params.id)
            ? { _id: req.params.id }
            : { customerId: req.params.id };
        await Customer.findOneAndDelete(query);
        res.json({ message: "Customer record deleted!" });
    } catch (error) {
        sendServerError(res, error, `${req.method} ${req.path}`);
    }
});

app.get('/api/customers/stats', authenticateToken, requireRole(...OFFICE), async (req, res) => {
    try {
        const total = await Customer.countDocuments();
        res.json({ total });
    } catch (error) {
        sendServerError(res, error, `${req.method} ${req.path}`);
    }
});

app.get('/api/customers/:id/orders', authenticateToken, requireRole(...OFFICE), async (req, res) => {
    try {
        const query = mongoose.isValidObjectId(req.params.id)
            ? { $or: [{ customerId: req.params.id }, { _id: req.params.id }] }
            : { customerId: req.params.id };

        const customer = await Customer.findOne(query);
        if (!customer) {
            return res.status(404).json({ error: 'Customer not found.' });
        }

        const matchConditions = [
            { customerEnterpriseId: customer.customerId },
            { recipientEmail: new RegExp(`^${customer.email.trim()}$`, 'i') },
        ];

        if (customer.phone) {
            const cleanPhone = customer.phone.replace(/\D/g, '');
            if (cleanPhone.length >= 7) {
                matchConditions.push({ receiverPhone: new RegExp(cleanPhone + '$') });
            }
        }

        const orders = await Parcel.find({ $or: matchConditions }).sort({ createdAt: -1 });
        res.json(orders);
    } catch (error) {
        sendServerError(res, error, `${req.method} ${req.path}`);
    }
});

// â”€â”€ ACTIVITY LOG ROUTE â”€â”€
// â”€â”€ ACTIVITY LOG ROUTE â”€â”€
app.get('/api/activity-log', authenticateToken, requireRole(...OFFICE), async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 100, 300);
        const roleFilter = req.query.role;
        const events = [];

        // 1. Customers Activity (Registrations, Status Changes, Parcel Shipments, Issue Tickets)
        if (!roleFilter || roleFilter === 'customer') {
            const customers = await Customer.find({});
            customers.forEach(c => {
                events.push({
                    role: 'customer',
                    actorName: c.fullName,
                    actorId: c.customerId,
                    type: 'registration',
                    status: c.status || 'Active',
                    description: `${c.fullName} registered as a customer`,
                    timestamp: c.createdAt,
                });
                if (c.statusHistory && c.statusHistory.length > 0) {
                    c.statusHistory.forEach(sh => {
                        events.push({
                            role: 'customer',
                            actorName: c.fullName,
                            actorId: c.customerId,
                            type: 'status_change',
                            status: sh.status,
                            description: sh.reason || `Status changed to ${sh.status}`,
                            timestamp: sh.changedAt,
                        });
                    });
                }
            });

            // Customer parcel orders
            const custParcels = await Parcel.find({}).sort({ createdAt: -1 }).limit(limit).lean();
            custParcels.forEach(p => {
                if (p.receiverName) {
                    events.push({
                        role: 'customer',
                        actorName: p.receiverName,
                        actorId: p.customerEnterpriseId || p.recipientEmail || p.trackingNumber,
                        type: 'order',
                        status: p.status,
                        description: `Shipment ${p.trackingNumber} destination: ${p.destination || p.city || 'Delivery Address'} (${p.item || 'Package'})`,
                        timestamp: p.createdAt,
                    });
                }
            });

            // Customer issue tickets
            const issues = await Issue.find({}).sort({ createdAt: -1 }).limit(limit).lean();
            issues.forEach(i => {
                events.push({
                    role: 'customer',
                    actorName: 'Customer',
                    actorId: i.ticketId,
                    type: 'issue',
                    status: i.status || 'Pending',
                    description: `Issue ticket ${i.ticketId} filed for tracking ${i.trackingNumber}: ${i.category} - ${i.description.slice(0, 70)}`,
                    timestamp: i.createdAt,
                });
            });
        }

        // 2. Sellers Activity (Registrations, Approvals, Parcel Bookings)
        if (!roleFilter || roleFilter === 'seller') {
            const sellers = await Seller.find({});
            sellers.forEach(s => {
                events.push({
                    role: 'seller',
                    actorName: s.fullName,
                    actorId: s.registrationId,
                    type: 'registration',
                    status: s.status || 'ACTIVE',
                    description: s.storeName ? `${s.fullName} registered as a merchant (${s.storeName})` : `${s.fullName} registered as a merchant`,
                    timestamp: s.createdAt,
                });
                if (s.statusHistory && s.statusHistory.length > 0) {
                    s.statusHistory.forEach(sh => {
                        events.push({
                            role: 'seller',
                            actorName: s.fullName,
                            actorId: s.registrationId,
                            type: 'status_change',
                            status: sh.status,
                            description: sh.reason || `Status changed to ${sh.status}`,
                            timestamp: sh.changedAt,
                        });
                    });
                }
            });

            // Seller bookings
            const sellerParcels = await Parcel.find({}).sort({ createdAt: -1 }).limit(limit).lean();
            sellerParcels.forEach(p => {
                if (p.senderName) {
                    events.push({
                        role: 'seller',
                        actorName: p.senderName,
                        actorId: p.sellerEnterpriseId || p.sellerId || p.trackingNumber,
                        type: 'order',
                        status: p.status,
                        description: `Merchant ${p.senderName} generated package ${p.trackingNumber} for ${p.receiverName} (${p.item || 'Item'})`,
                        timestamp: p.createdAt,
                    });
                }
            });
        }

        // 3. Riders Activity (Registrations, Duty Changes, Logistics Pickups/Deliveries/POD)
        if (!roleFilter || roleFilter === 'rider') {
            const riders = await Rider.find({});
            riders.forEach(r => {
                events.push({
                    role: 'rider',
                    actorName: r.riderName,
                    actorId: r.registrationId,
                    type: 'registration',
                    status: r.status || 'Active',
                    description: `${r.riderName} registered as a courier (${r.vehicleType || 'Motorcycle'} ${r.vehiclePlate || ''})`,
                    timestamp: r.createdAt,
                });
                if (r.statusHistory && r.statusHistory.length > 0) {
                    r.statusHistory.forEach(sh => {
                        events.push({
                            role: 'rider',
                            actorName: r.riderName,
                            actorId: r.registrationId,
                            type: 'status_change',
                            status: sh.status,
                            description: sh.reason || `Duty / status updated to ${sh.status}`,
                            timestamp: sh.changedAt,
                        });
                    });
                }
            });

            // Rider pickups, transits, and POD deliveries
            const riderParcels = await Parcel.find({ $or: [{ riderId: { $ne: '' } }, { 'events.0': { $exists: true } }] }).sort({ createdAt: -1 }).limit(limit).lean();
            riderParcels.forEach(p => {
                if (Array.isArray(p.events) && p.events.length > 0) {
                    p.events.forEach(ev => {
                        events.push({
                            role: 'rider',
                            actorName: p.assignedRider || 'Courier',
                            actorId: p.riderId || p.trackingNumber,
                            type: 'delivery',
                            status: ev.status || p.status,
                            description: `Parcel ${p.trackingNumber}: ${ev.event || ev.status} at ${ev.location || 'Routing Hub'}`,
                            timestamp: ev.time ? new Date(ev.time) : p.updatedAt,
                        });
                    });
                } else if (p.riderId) {
                    events.push({
                        role: 'rider',
                        actorName: p.assignedRider || 'Courier',
                        actorId: p.riderId || p.trackingNumber,
                        type: 'delivery',
                        status: p.status,
                        description: `Assigned delivery task for parcel ${p.trackingNumber} (${p.status})`,
                        timestamp: p.updatedAt || p.createdAt,
                    });
                }
            });
        }

        // 4. Admin Activity (Accounts, Management, Notifications)
        if (!roleFilter || roleFilter === 'admin') {
            const accounts = await Account.find({});
            accounts.forEach(a => {
                if (a.statusHistory && a.statusHistory.length > 0) {
                    a.statusHistory.forEach(sh => {
                        events.push({
                            role: 'admin',
                            actorName: a.name,
                            actorId: a.adminId || String(a._id),
                            type: sh.type || 'status_change',
                            status: sh.status || a.status || 'Active',
                            description: sh.reason || (sh.type === 'registration' ? `${a.name} registered as an admin` : `${a.name} account updated`),
                            timestamp: sh.changedAt,
                        });
                    });
                } else {
                    events.push({
                        role: 'admin',
                        actorName: a.name,
                        actorId: a.adminId || String(a._id),
                        type: 'registration',
                        status: a.status || 'Active',
                        description: `${a.name} provisioned as ${a.role || 'staff'}`,
                        timestamp: a.createdAt || a.createdDate,
                    });
                }
            });

            // System & Admin Notifications
            const notifs = await AdminNotification.find({}).sort({ createdAt: -1 }).limit(limit).lean();
            notifs.forEach(n => {
                events.push({
                    role: n.role || 'admin',
                    actorName: 'System Monitor',
                    actorId: n.relatedId || n.notificationId || 'SYS',
                    type: n.type === 'new_order' ? 'order' : n.type === 'security' ? 'registration' : 'status_change',
                    status: 'Logged',
                    description: `${n.title}: ${n.message}`,
                    timestamp: n.createdAt,
                });
            });
        }

        events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        res.json(events.slice(0, limit));
    } catch (error) {
        sendServerError(res, error, `${req.method} ${req.path}`);
    }
});

// â”€â”€ PARCEL ROUTES â”€â”€
// Bridge parity (2026-09-13): admin-created parcels now push to the mobile
// backend via BridgeClient.syncParcel â†’ POST /api/bridge/receive-parcel, so
// they appear in the app like app-booked shipments do. The mobile side
// resolves its own seller User by sellerEmail (a Web Seller _id is NOT a
// mobile User id, so it is deliberately never sent); parcels with no
// resolvable seller are skipped â€” the mobile Shipment schema requires one
// and the old "any existing seller" mis-attribution fallback is gone.
// Fire-and-forget: bridge failure never fails the admin save.
function titleCaseStatus(s) {
    return typeof s === 'string' && s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
}

// â”€â”€ I-3b (G-19): rider assignment bridge to the mobile backend â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// The office PUT/redeliver paths used to write only the Web row, so the
// mobile shipment.riderId silently drifted. The mobile side resolves riders
// by EMAIL only (never a raw Web id â€” a Rider registrationId/ObjectId is not
// a mobile User id), so look the Rider up and push a minimal riderEmail
// patch through the existing receive-parcel route. Contract:
//   - riderEmail '<email>'  â†’ mobile resolves the rider and assigns;
//   - riderEmail ''         â†’ explicit unassign (rider cleared on Web);
//   - non-empty id that resolves to no email â†’ push NOTHING, so a failed
//     lookup can never be mistaken for an unassign.
// Fire-and-forget: a bridge failure never fails the admin save.
function riderLookupQuery(riderId) {
    const q = [{ registrationId: riderId }];
    if (mongoose.isValidObjectId(riderId)) q.push({ _id: riderId });
    return q;
}

async function resolveRiderEmail(riderId) {
    if (!riderId) return '';
    const rider = await Rider.findOne({ $or: riderLookupQuery(String(riderId)) }, 'email');
    return rider && rider.email ? rider.email : '';
}

async function emitRiderAssignPush(trackingNumber, riderId) {
    if (!trackingNumber || !BridgeClient.isBridgeEnabled()) return;
    try {
        if (!riderId) {
            await BridgeClient.syncParcel({ trackingNumber, riderEmail: '' });
            return;
        }
        const email = await resolveRiderEmail(riderId);
        if (!email) {
            console.warn(`[Bridgeâ†’Android] rider-assign ${trackingNumber}: rider "${riderId}" has no resolvable email â€” push skipped.`);
            return;
        }
        await BridgeClient.syncParcel({ trackingNumber, riderEmail: email });
    } catch (e) {
        console.warn('[Bridgeâ†’Android] rider-assign push failed:', e.message);
    }
}

app.post('/api/parcels', authenticateToken, requireRole(...OFFICE), async (req, res) => {
    try {
        const newParcel = new Parcel({ ...req.body });
        await newParcel.save();

        // Bridge: push the admin-created parcel to the mobile backend.
        try {
            if (BridgeClient.isBridgeEnabled()) {
                const sellerDoc = newParcel.sellerId
                    ? await Seller.findById(newParcel.sellerId).select('email').lean()
                    : null;
                if (sellerDoc && sellerDoc.email) {
                    BridgeClient.syncParcel({
                        trackingNumber: newParcel.trackingNumber,
                        sellerEmail: sellerDoc.email,
                        senderName: newParcel.senderName,
                        senderPhone: newParcel.senderPhone || '',
                        receiverName: newParcel.receiverName,
                        recipientPhone: newParcel.receiverPhone || '',
                        recipientEmail: newParcel.recipientEmail || '',
                        item: newParcel.item || newParcel.content || 'Parcel',
                        weight: newParcel.weight || '',
                        origin: newParcel.origin || '',
                        destination: newParcel.destination || '',
                        // Mobile Shipment.status is Title-case enum
                        // ('Pending'â€¦); the admin form posts 'pending'.
                        status: titleCaseStatus(newParcel.status) || 'Pending',
                        notes: newParcel.notes || '',
                        paymentMode: newParcel.paymentMode || 'Prepaid',
                        codAmount: newParcel.codAmount || 0,
                        packageCount: newParcel.packageCount || 1,
                        packageCategory: newParcel.packageCategory || '',
                        deliveryFee: typeof newParcel.deliveryFee === 'number'
                            ? newParcel.deliveryFee
                            : (parseFloat(newParcel.shippingCost) || 0),
                        packageType: titleCaseStatus(newParcel.packageType || newParcel.serviceType || ''),
                        riderEmail: await resolveRiderEmail(newParcel.riderId),
                        // I-3f (G-33) + PART L: previously the create push
                        // dropped dimensions/ETA and carried no coordinates,
                        // so a Web-created parcel could not heal A-side
                        // package metadata or destination fix. Parcel.lat/lng
                        // ride as the A-wire GeoJSON [lng, lat] pair; a
                        // [0,0] placeholder is treated as absent.
                        ...(newParcel.dimensions && (newParcel.dimensions.length || newParcel.dimensions.width || newParcel.dimensions.height)
                            ? { dimensions: newParcel.dimensions }
                            : {}),
                        ...(newParcel.estimatedDeliveryDate ? { estimatedDeliveryDate: newParcel.estimatedDeliveryDate } : {}),
                        ...(Number.isFinite(newParcel.lat) && Number.isFinite(newParcel.lng) && !(newParcel.lat === 0 && newParcel.lng === 0)
                            ? { deliveryCoordinates: [newParcel.lng, newParcel.lat] }
                            : {}),
                    }).catch(e => console.warn('[Bridgeâ†’Android] sync-parcel failed:', e.message));
                } else {
                    console.warn(`[Bridgeâ†’Android] Parcel ${newParcel.trackingNumber} has no resolvable seller â€” not bridged (mobile Shipment requires one).`);
                }
            }
        } catch (bridgeErr) {
            console.warn('[Bridgeâ†’Android] sync-parcel error:', bridgeErr.message);
        }

        // Auto-index into ParcelLocation for Parcel Map and Geofence telemetry
        try {
            const resolvedLoc = resolveParcelCurrentLocation(newParcel);
            if (resolvedLoc.lat !== null && resolvedLoc.lat !== undefined && resolvedLoc.lng !== null && resolvedLoc.lng !== undefined) {
                await ParcelLocation.findOneAndUpdate(
                    { parcelId: newParcel.trackingNumber },
                    {
                        $set: {
                            parcelId: newParcel.trackingNumber,
                            lat: String(resolvedLoc.lat),
                            lng: String(resolvedLoc.lng),
                            location: resolvedLoc.location,
                            type: resolvedLoc.type,
                            status: newParcel.status || 'Active',
                            geofence: 'Inside',
                            notes: newParcel.item || '',
                        }
                    },
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                );
            } else {
                console.warn(`[ParcelLocation] skipping auto-index for ${newParcel.trackingNumber}: no coordinates yet`);
            }
        } catch (locErr) {
            console.warn('[ParcelLocation] auto-index error:', locErr.message);
        }

        res.status(201).json({ message: "Parcel saved!", parcel: newParcel });
    } catch (error) {
        respondError(res, error, 'POST /api/parcels');
    }
});

app.get('/api/parcels', authenticateToken, async (req, res) => {
    try {
        const rawParcels = await Parcel.find({}).sort({ createdAt: -1 }).lean();
        const parcels = await enrichParcelsFromAppDb(rawParcels);
        res.json(parcels);
    } catch (error) {
        sendServerError(res, error, `${req.method} ${req.path}`);
    }
});

// Hub receivers may only move a parcel to one of the two hub statuses â€” every
// other parcel field is office-only. Each status lists the current statuses it
// may NOT be applied from (lower-case); mirrored by the buttons on
// HubParcelReceiving.jsx so the screen never offers a refused action.
const HUB_STATUS_BLOCKED_FROM = {
    // The failed-delivery statuses are listed too, so the hub buttons can never
    // overwrite a parcel that is in the return flow (see /received-returned).
    'Received at Hub': ['received at hub', 'returned', 'returned to hub', 'delivered', 'failed', 'cancelled', 'canceled',
        'failed attempt', 'received at hub (returned)', 'returned to seller'],
    'Returned to Hub': ['returned', 'returned to hub', 'delivered', 'cancelled', 'canceled',
        'received at hub (returned)', 'returned to seller'],
};

// Applies a hub status change. The timeline entry is appended here with $push
// rather than taken from the client, so a hub screen holding a stale copy can
// never overwrite rider updates that arrived meanwhile. The update is guarded
// on the status that was checked, so a concurrent change makes it a no-op
// instead of slipping past the rule.
async function applyHubStatus(parcelId, body) {
    const extraFields = Object.keys(body || {}).filter(k => k !== 'status');
    const status = body && body.status;
    if (extraFields.length > 0 || !Object.prototype.hasOwnProperty.call(HUB_STATUS_BLOCKED_FROM, status)) {
        return { code: 403, error: 'Hub accounts can only mark parcels as Received at Hub or Returned to Hub.' };
    }
    const current = await Parcel.findById(parcelId, 'status riderId trackingNumber');
    if (!current) return { code: 404, error: 'That parcel could not be found.' };
    const currentStatus = String(current.status || '').trim().toLowerCase();
    if (HUB_STATUS_BLOCKED_FROM[status].includes(currentStatus)) {
        return { code: 409, error: `This parcel is "${current.status}" and cannot be marked as ${status}.`, before: current };
    }
    const updated = await Parcel.findOneAndUpdate(
        { _id: parcelId, status: current.status },
        {
            $set: { status },
            $push: { events: { time: new Date().toISOString(), event: status, location: 'Hub', status } },
        },
        { new: true, runValidators: true }
    );
    if (!updated) return { code: 409, error: 'This parcel was just updated by someone else. Refresh and try again.', before: current };
    return { updated, before: current };
}

app.put('/api/parcels/:id', authenticateToken, requireRole(...ANY_ROLE), async (req, res) => {
    try {
        let updated;
        let before; // the parcel's status/rider before this change, for the audit log
        // Hub accounts always take the hub path. A super admin using the Hub
        // Receiving screen sends the same status-only body and gets the same
        // rule and server-written timeline entry.
        const bodyKeys = Object.keys(req.body || {});
        const isHubStatusOnly = bodyKeys.length === 1 && bodyKeys[0] === 'status'
            && Object.prototype.hasOwnProperty.call(HUB_STATUS_BLOCKED_FROM, req.body.status);
        if (req.user.role === 'hub_receiver' || isHubStatusOnly) {
            const result = await applyHubStatus(req.params.id, req.body);
            if (result.error) {
                logAudit(req, {
                    action: 'parcel_status_changed',
                    target: result.before ? result.before.trackingNumber : req.params.id,
                    result: 'failure',
                    details: { from: result.before ? result.before.status : '', to: String(req.body.status || ''), reason: result.error },
                });
                return res.status(result.code).json({ error: result.error });
            }
            updated = result.updated;
            before = result.before;
        } else {
            const updates = pickEditable(req.body, PARCEL_EDITABLE_FIELDS);
            if (Object.keys(updates).length === 0) {
                return res.status(400).json({ error: 'No updatable fields were provided.' });
            }

            before = await Parcel.findById(req.params.id, 'status riderId trackingNumber');
            if (before) {
                updated = await Parcel.findByIdAndUpdate(
                    req.params.id,
                    { $set: updates },
                    { new: true, runValidators: true }
                );
            }
        }

        if (!updated) {
            return res.status(404).json({ error: 'That parcel could not be found.' });
        }

        if (String(before.status || '') !== String(updated.status || '')) {
            logAudit(req, {
                action: 'parcel_status_changed',
                target: updated.trackingNumber,
                details: { from: before.status || '', to: updated.status || '' },
            });
        }
        if (String(before.riderId || '') !== String(updated.riderId || '')) {
            logAudit(req, {
                action: 'rider_assigned',
                target: updated.trackingNumber,
                details: { from: String(before.riderId || ''), to: String(updated.riderId || '') },
            });
            // I-3b (G-19): tell the mobile backend about the new assignment.
            emitRiderAssignPush(updated.trackingNumber, updated.riderId || '');
        }

        if (req.body.status && updated.trackingNumber) {
            BridgeClient.sendStatus(updated.trackingNumber, req.body.status)
                .catch(e => console.warn('[Bridgeâ†’Android] sendStatus failed:', e.message));
        }

        // PART 5.2 (G-3 remainder): push the field edits this request actually
        // made. ONLY the keys present in the body are sent, so an untouched
        // field can never be blanked on the app (the "blank values never
        // propagate" rule both sides rely on). Fire-and-forget: the admin's
        // edit is already committed here, and a bridge outage must not fail it.
        try {
            const fieldPush = pickEditable(req.body, PARCEL_FIELD_PUSH_TO_APP);
            if (Object.keys(fieldPush).length > 0 && BridgeClient.isBridgeEnabled()) {
                BridgeClient.syncParcel({ trackingNumber: updated.trackingNumber, ...fieldPush })
                    .catch(e => console.warn('[Bridgeâ†’Android] field-edit sync failed:', e.message));
            }
        } catch (fieldPushErr) {
            console.warn('[Bridgeâ†’Android] field-edit push error:', fieldPushErr.message);
        }

        sseBroadcaster.broadcast('parcel-updated', {
            trackingNumber: updated.trackingNumber,
            status: req.body.status || updated.status,
            action: 'admin-update',
            timestamp: new Date().toISOString(),
        });

        res.json(updated);
    } catch (error) {
        respondError(res, error, 'PUT /api/parcels');
    }
});

app.delete('/api/parcels/:id', authenticateToken, requireRole(...SUPER_ONLY), async (req, res) => {
    try {
        const deletedParcel = await Parcel.findByIdAndDelete(req.params.id);
        if (!deletedParcel) {
            return res.status(404).json({ error: 'That parcel could not be found.' });
        }
        // A parcel's map row must not outlive the parcel itself, otherwise the
        // parcel map keeps showing a marker for a shipment that no longer exists.
        await ParcelLocation.deleteOne({ parcelId: deletedParcel.trackingNumber });
        res.json({ message: "Parcel deleted!" });
    } catch (error) {
        sendServerError(res, error, `${req.method} ${req.path}`);
    }
});

// â”€â”€ FAILED DELIVERY ATTEMPTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// The rules (max attempts, reasons, which status may follow which) live in
// utils/deliveryAttempts.js. deliveryAttempts is NOT in PARCEL_EDITABLE_FIELDS,
// so these routes are the only way it can change.

// Reads an optional coordinate. Returns null when it was not sent, the number
// when it is valid, or undefined when it was sent but is not a valid value.
function readCoordinate(value, limit) {
    if (value === undefined || value === null || value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n < -limit || n > limit) return undefined;
    return n;
}

// Rider app reports a failed delivery. No admin login here â€” the rider app
// uses the shared bridge key, like the GPS ping route above.
app.post('/api/parcels/:trackingNumber/failed-attempt', requireBridgeKey, async (req, res) => {
    try {
        const body = req.body || {};
        const trackingNumber = String(req.params.trackingNumber || '').trim();

        // 1. Check what the rider sent.
        const riderId = typeof body.riderId === 'string' ? body.riderId.trim() : '';
        if (!riderId || riderId.length > 60) {
            return res.status(400).json({ error: '"riderId" is required (up to 60 characters).' });
        }
        if (!FAILED_ATTEMPT_REASONS.includes(body.reason)) {
            return res.status(400).json({ error: `"reason" must be one of: ${FAILED_ATTEMPT_REASONS.join(', ')}.` });
        }
        if (body.notes !== undefined && body.notes !== null && typeof body.notes !== 'string') {
            return res.status(400).json({ error: '"notes" must be text.' });
        }
        const notes = String(body.notes || '').trim();
        if (notes.length > NOTES_MAX_LENGTH) {
            return res.status(400).json({ error: `"notes" can be at most ${NOTES_MAX_LENGTH} characters.` });
        }
        const lat = readCoordinate(body.lat, 90);
        const lng = readCoordinate(body.lng, 180);
        if (lat === undefined || lng === undefined || (lat === null) !== (lng === null)) {
            return res.status(400).json({ error: '"lat" and "lng" must be sent together as valid numbers.' });
        }
        // Only web links are accepted, so the admin panel never renders a
        // javascript: or other unsafe link as the photo.
        const photoUrl = typeof body.photoUrl === 'string' ? body.photoUrl.trim() : '';
        if (photoUrl && (!/^https?:\/\/\S+$/i.test(photoUrl) || photoUrl.length > 2000)) {
            return res.status(400).json({ error: '"photoUrl" must be a web link starting with http:// or https://.' });
        }
        let attemptedAt = new Date();
        if (body.timestamp) {
            attemptedAt = new Date(body.timestamp);
            if (Number.isNaN(attemptedAt.getTime())) {
                return res.status(400).json({ error: '"timestamp" must be a valid date (for example 2026-10-11T09:30:00Z).' });
            }
        }

        // 2. Check the parcel.
        const parcel = await Parcel.findOne({ trackingNumber }, 'trackingNumber status riderId destination deliveryAttempts maxDeliveryAttempts');
        if (!parcel) {
            return res.status(404).json({ error: 'That parcel could not be found.' });
        }
        // D-18 (2026-10-12): the parcel's OWN retry cap, synced from the mobile
        // Shipment at booking. It used to be this backend's constant only, so an
        // app-booked parcel (cap 2) could keep accumulating attempts here up to
        // 3 while the app had already escalated it. Falls back to the shared
        // constant for portal-created parcels and pre-sync rows.
        const attemptCap = Number(parcel.maxDeliveryAttempts) >= 1
            ? Number(parcel.maxDeliveryAttempts)
            : MAX_DELIVERY_ATTEMPTS;
        const usedAttempts = parcel.deliveryAttempts.length;
        if (usedAttempts >= attemptCap) {
            return res.status(400).json({ error: `This parcel already has ${attemptCap} failed delivery attempts. No more attempts can be recorded.` });
        }
        if (!FAILED_ATTEMPT_ALLOWED_FROM.includes(parcel.status)) {
            return res.status(400).json({ error: `This parcel is "${parcel.status}". A failed attempt can only be recorded while it is Out for Delivery or after an earlier failed attempt.` });
        }

        // 3. Save the attempt. The 3rd failure sends the parcel back to the hub.
        const attemptNumber = usedAttempts + 1;
        const isLastAttempt = attemptNumber >= attemptCap;
        const newStatus = isLastAttempt ? DELIVERY_STATUS.RETURNED_TO_HUB : DELIVERY_STATUS.FAILED_ATTEMPT;
        const eventText = isLastAttempt
            ? `Delivery attempt ${attemptNumber} of ${attemptCap} failed (${body.reason}). Parcel is going back to the hub.`
            : `Delivery attempt ${attemptNumber} of ${attemptCap} failed: ${body.reason}`;

        const setFields = { status: newStatus };
        if (lat !== null) { setFields.riderLat = lat; setFields.riderLng = lng; }
        // I-3c (G-23): retriable attempts carry the shared PH retry date
        // (next day, skipping Sunday); the final attempt rests at the hub with
        // no next date â€” same rule the Android backend applies.
        const nextAttemptDate = isLastAttempt ? null : computeNextAttemptDate(attemptedAt);

        // The filter repeats the checks above (same status, same number of
        // attempts), so two reports sent at the same moment cannot both pass.
        // Parcels saved before this feature have no deliveryAttempts field at
        // all, which $size: 0 does not match â€” hence the $exists case.
        const sameAttemptCount = usedAttempts === 0
            ? { $or: [{ deliveryAttempts: { $size: 0 } }, { deliveryAttempts: { $exists: false } }] }
            : { deliveryAttempts: { $size: usedAttempts } };
        const updated = await Parcel.findOneAndUpdate(
            { _id: parcel._id, status: parcel.status, ...sameAttemptCount },
            {
                $set: setFields,
                $push: {
                    deliveryAttempts: { attemptNumber, reason: body.reason, notes, riderId, lat, lng, photoUrl, attemptedAt, nextAttemptDate },
                    events: { time: attemptedAt.toISOString(), event: eventText, location: parcel.destination || '', status: newStatus },
                },
            },
            { new: true, runValidators: true }
        );
        if (!updated) {
            return res.status(409).json({ error: 'This parcel was just updated. Please try again.' });
        }

        // 4. Record it and tell everyone. None of these make the rider wait.
        logAudit(req, {
            action: 'delivery_attempt_failed',
            target: updated.trackingNumber,
            details: { from: parcel.status, to: newStatus, attemptNumber, reason: body.reason },
            actor: { id: riderId, email: '', role: 'rider_app' },
            source: 'rider_app',
        });

        AdminNotification.create({
            role: 'admin',
            title: isLastAttempt ? 'Parcel going back to the hub' : 'Delivery attempt failed',
            message: `${updated.trackingNumber}: attempt ${attemptNumber} of ${attemptCap} failed (${body.reason}).`,
            type: 'delivery_failed',
            relatedId: updated.trackingNumber,
            source: 'rider-app',
        }).then((doc) => {
            sseBroadcaster.broadcast('notification-synced', {
                _id: doc._id, role: doc.role, title: doc.title, message: doc.message,
                type: doc.type, relatedId: doc.relatedId, createdAt: doc.createdAt,
            });
        }).catch(e => console.warn('[FailedAttempt] Could not save admin notification:', e.message));

        sseBroadcaster.broadcast('parcel-updated', {
            trackingNumber: updated.trackingNumber,
            status: newStatus,
            action: 'failed-attempt',
            attemptNumber,
            reason: body.reason,
            timestamp: new Date().toISOString(),
        });

        BridgeClient.sendStatus(updated.trackingNumber, newStatus)
            .catch(e => console.warn('[Bridgeâ†’Android] sendStatus failed:', e.message));

        // I-3c (G-23): push the refreshed attempt ledger to the Android
        // backend so a Web-logged office attempt appears in the app's
        // deliveryAttempts history too (the two stores were disjoint before).
        // Fire-and-forget; the status above already travelled via sendStatus.
        BridgeClient.syncParcel({
            trackingNumber: updated.trackingNumber,
            deliveryAttempts: mapWebAttemptsToApp(updated.deliveryAttempts || []),
            attemptCount: (updated.deliveryAttempts || []).length,
        }).catch(e => console.warn('[Bridgeâ†’Android] attempt-ledger push failed:', e.message));

        res.status(201).json({
            message: isLastAttempt
                ? `Attempt ${attemptNumber} of ${attemptCap} recorded. The parcel is now going back to the hub.`
                : `Attempt ${attemptNumber} of ${attemptCap} recorded.`,
            trackingNumber: updated.trackingNumber,
            status: updated.status,
            attemptNumber,
            attemptsLeft: Math.max(0, attemptCap - attemptNumber),
            maxAttempts: attemptCap,
        });
    } catch (error) {
        sendServerError(res, error, `${req.method} ${req.path}`);
    }
});

// Shared by the three office steps below: checks the parcel's current status,
// moves it to the new one, adds a timeline entry, then logs, tells the mobile
// side and refreshes open admin screens â€” the same follow-up PUT /api/parcels
// does. `check` can add one more rule (returns an error message or '').
async function moveParcelInReturnFlow(req, res, { allowedFrom, newStatus, actionLabel, location, eventText, check, extraSet = {} }) {
    const parcel = await Parcel.findById(req.params.id, 'trackingNumber status riderId deliveryAttempts');
    if (!parcel) {
        return res.status(404).json({ error: 'That parcel could not be found.' });
    }

    let problem = '';
    if (!allowedFrom.includes(parcel.status)) {
        problem = `This parcel is "${parcel.status}" and cannot be ${actionLabel}.`;
    } else if (check) {
        problem = check(parcel);
    }
    if (problem) {
        logAudit(req, {
            action: 'parcel_status_changed',
            target: parcel.trackingNumber,
            result: 'failure',
            details: { from: parcel.status, to: newStatus, reason: problem },
        });
        return res.status(400).json({ error: problem });
    }

    // Guarded on the status we just checked: if someone else changed the
    // parcel a moment ago, nothing is saved.
    const updated = await Parcel.findOneAndUpdate(
        { _id: parcel._id, status: parcel.status },
        {
            $set: { status: newStatus, ...extraSet },
            $push: { events: { time: new Date().toISOString(), event: eventText(parcel), location, status: newStatus } },
        },
        { new: true, runValidators: true }
    );
    if (!updated) {
        return res.status(409).json({ error: 'This parcel was just updated by someone else. Refresh and try again.' });
    }

    logAudit(req, {
        action: 'parcel_status_changed',
        target: updated.trackingNumber,
        details: { from: parcel.status, to: newStatus },
    });
    if (String(parcel.riderId || '') !== String(updated.riderId || '')) {
        logAudit(req, {
            action: 'rider_assigned',
            target: updated.trackingNumber,
            details: { from: String(parcel.riderId || ''), to: String(updated.riderId || '') },
        });
        // I-3b (G-19): office redeliver can swap the rider â€” same bridge push.
        emitRiderAssignPush(updated.trackingNumber, updated.riderId || '');
    }

    BridgeClient.sendStatus(updated.trackingNumber, newStatus)
        .catch(e => console.warn('[Bridgeâ†’Android] sendStatus failed:', e.message));

    sseBroadcaster.broadcast('parcel-updated', {
        trackingNumber: updated.trackingNumber,
        status: newStatus,
        action: 'admin-update',
        timestamp: new Date().toISOString(),
    });

    return res.json(updated);
}

// Hub confirms a parcel sent back after its last failed attempt has arrived.
app.post('/api/parcels/:id/received-returned', authenticateToken, requireRole(...ANY_ROLE), async (req, res) => {
    try {
        await moveParcelInReturnFlow(req, res, {
            allowedFrom: [DELIVERY_STATUS.RETURNED_TO_HUB],
            newStatus: DELIVERY_STATUS.RECEIVED_RETURNED,
            actionLabel: 'confirmed as received back at the hub',
            location: 'Hub',
            eventText: () => 'Returned parcel received at the hub',
        });
    } catch (error) {
        sendServerError(res, error, `${req.method} ${req.path}`);
    }
});

// Office sends the parcel out again, optionally with a different rider.
app.post('/api/parcels/:id/redeliver', authenticateToken, requireRole(...OFFICE), async (req, res) => {
    try {
        const extraSet = {};
        const riderId = typeof req.body?.riderId === 'string' ? req.body.riderId.trim() : '';
        if (riderId) {
            const riderQuery = [{ registrationId: riderId }];
            if (mongoose.isValidObjectId(riderId)) riderQuery.push({ _id: riderId });
            const rider = await Rider.findOne({ $or: riderQuery }, 'registrationId');
            if (!rider) {
                return res.status(400).json({ error: 'That rider could not be found. Please pick the rider again.' });
            }
            extraSet.riderId = riderId;
        }

        await moveParcelInReturnFlow(req, res, {
            allowedFrom: REDELIVER_ALLOWED_FROM,
            newStatus: DELIVERY_STATUS.OUT_FOR_DELIVERY,
            actionLabel: 'sent out for delivery again',
            location: 'Hub',
            extraSet,
            // D-18: per-parcel cap, so the redeliver guard agrees with the
            // failed-attempt route for an app-booked parcel (cap 2).
            check: (parcel) => {
                const cap = Number(parcel.maxDeliveryAttempts) >= 1 ? Number(parcel.maxDeliveryAttempts) : MAX_DELIVERY_ATTEMPTS;
                return parcel.deliveryAttempts.length >= cap
                    ? `This parcel already had ${cap} failed delivery attempts. It can only be returned to the seller.`
                    : '';
            },
            eventText: (parcel) => {
                const cap = Number(parcel.maxDeliveryAttempts) >= 1 ? Number(parcel.maxDeliveryAttempts) : MAX_DELIVERY_ATTEMPTS;
                return `Sent out for delivery again (attempt ${parcel.deliveryAttempts.length + 1} of ${cap})`;
            },
        });
    } catch (error) {
        sendServerError(res, error, `${req.method} ${req.path}`);
    }
});

// Office closes the return: the parcel goes back to the seller.
app.post('/api/parcels/:id/return-to-seller', authenticateToken, requireRole(...OFFICE), async (req, res) => {
    try {
        await moveParcelInReturnFlow(req, res, {
            allowedFrom: [DELIVERY_STATUS.RECEIVED_RETURNED],
            newStatus: DELIVERY_STATUS.RETURNED_TO_SELLER,
            actionLabel: 'returned to the seller',
            location: 'Hub',
            eventText: () => 'Parcel returned to the seller',
        });
    } catch (error) {
        sendServerError(res, error, `${req.method} ${req.path}`);
    }
});

// â”€â”€ PARCEL LOCATION ROUTES â”€â”€
app.post('/api/parcel-locations', authenticateToken, requireRole(...SUPER_ONLY), async (req, res) => {
    try {
        const newLocation = new ParcelLocation(req.body);
        await newLocation.save();
        res.status(201).json({ message: "Parcel location saved!", location: newLocation });
    } catch (error) {
        sendServerError(res, error, `${req.method} ${req.path}`);
    }
});

app.get('/api/parcel-locations', authenticateToken, requireRole(...OFFICE), async (req, res) => {
    try {
        const rawLocations = await ParcelLocation.find().lean();
        const locations = await enrichParcelLocationsFromAppDb(rawLocations);
        res.json(locations);
    } catch (error) {
        sendServerError(res, error, `${req.method} ${req.path}`);
    }
});

app.put('/api/parcel-locations/:id', authenticateToken, requireRole(...SUPER_ONLY), async (req, res) => {
    try {
        const updates = pickEditable(req.body, PARCEL_LOCATION_EDITABLE_FIELDS);
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No updatable fields were provided.' });
        }

        const updated = await ParcelLocation.findByIdAndUpdate(
            req.params.id,
            { $set: updates },
            { new: true, runValidators: true }
        );
        res.json(updated);
    } catch (error) {
        sendServerError(res, error, `${req.method} ${req.path}`);
    }
});

app.delete('/api/parcel-locations/:id', authenticateToken, requireRole(...SUPER_ONLY), async (req, res) => {
    try {
        const deletedLocation = await ParcelLocation.findByIdAndDelete(req.params.id);
        if (!deletedLocation) {
            return res.status(404).json({ error: 'That map entry could not be found.' });
        }
        res.json({ message: "Location deleted!" });
    } catch (error) {
        sendServerError(res, error, `${req.method} ${req.path}`);
    }
});

// â”€â”€ DASHBOARD ANALYTICS â”€â”€
app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
    try {
        const [totalParcels, deliveredCount, totalRiders, activeRidersCount, totalSellers, riderStats] = await Promise.all([
            Parcel.countDocuments({}),
            Parcel.countDocuments({ status: { $regex: /^delivered$/i } }),
            Rider.countDocuments({ riderName: { $not: /test/i } }),
            Rider.countDocuments({ isOnDuty: true, riderName: { $not: /test/i } }),
            Seller.countDocuments({ storeName: { $not: /test/i }, fullName: { $not: /test/i } }),
            Rider.find({ riderName: { $not: /test/i } }, 'rating deliveries'),
        ]);

        const deliverySuccessPct = totalParcels
            ? Number(((deliveredCount / totalParcels) * 100).toFixed(1))
            : 0;
        const avgRiderRating = riderStats.length
            ? Number((riderStats.reduce((sum, r) => sum + (r.rating || 0), 0) / riderStats.length).toFixed(1))
            : 0;
        const totalDeliveries = riderStats.reduce((sum, r) => sum + (r.deliveries || 0), 0);

        res.json({
            totalParcels,
            deliveredCount,
            deliverySuccessPct,
            totalRiders,
            activeRidersCount,
            avgRiderRating,
            totalDeliveries,
            totalSellers,
        });
    } catch (error) {
        sendServerError(res, error, `${req.method} ${req.path}`);
    }
});

// â”€â”€ ACCOUNT ROUTES â”€â”€
app.get('/api/accounts', authenticateToken, requireRole('super_admin'), async (req, res) => {
    try {
        const accounts = await Account.find({}).select('-password');
        res.json(accounts);
    } catch (error) {
        sendServerError(res, error, `${req.method} ${req.path}`);
    }
});

app.post('/api/accounts', authenticateToken, requireRole('super_admin'), async (req, res) => {
    try {
        const email = req.body.email.toLowerCase().trim();
        const existing = await Account.findOne({ email });
        if (existing) {
            return res.status(400).json({ error: 'An account with this email already exists.' });
        }
        // 2026 audit L3: enforce a sane password floor on self-service account
        // creation (bootstrap accounts are unaffected â€” they bypass this route).
        const passwordError = validateAdminPassword(req.body.password);
        if (passwordError) {
            return res.status(400).json({ error: passwordError });
        }
        // 2026 audit M6: adminId is now server-minted only (client-supplied
        // values are ignored) and collision-checked instead of count-guessed.
        let adminId = null;
        const year = new Date().getFullYear();
        for (let attempt = 0; attempt < 5 && !adminId; attempt++) {
            const count = await Account.countDocuments();
            const candidate = `YTOA${year}${String(count + 1 + attempt).padStart(4, '0')}`;
            const taken = await Account.exists({ adminId: candidate });
            if (!taken) adminId = candidate;
        }
        if (!adminId) {
            adminId = `YTOA${year}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        }
        const newAccount = new Account({
            ...req.body,
            adminId,
            email,
        });
        newAccount.statusHistory = [{
            type: 'registration',
            status: 'Active',
            reason: `${req.body.name || 'Admin'} registered as ${req.body.role || 'staff'}`,
            changedAt: new Date(),
        }];
        await newAccount.save();
        logAudit(req, {
            action: 'account_created',
            target: newAccount.email,
            details: { role: newAccount.role },
        });
        const result = newAccount.toObject();
        delete result.password;
        res.status(201).json(result);
    } catch (error) {
        sendServerError(res, error, `${req.method} ${req.path}`);
    }
});

app.put('/api/accounts/:id', authenticateToken, requireRole('super_admin'), async (req, res) => {
    try {
        const updateData = { ...req.body };
        if (updateData.email) {
            updateData.email = updateData.email.toLowerCase().trim();
        }
        if (updateData.password && updateData.password.trim()) {
            // 2026 audit L3: the same strength floor applies to resets.
            const passwordError = validateAdminPassword(updateData.password);
            if (passwordError) {
                return res.status(400).json({ error: passwordError });
            }
            // Left as plain text on purpose: account.save() below runs the
            // Account model's pre('save') hook, which hashes it. Hashing here
            // too stored a hash-of-a-hash and locked the account out.
        } else {
            delete updateData.password;
        }
        delete updateData.statusHistory;
        const account = await Account.findById(req.params.id);
        if (!account) return res.status(404).json({ error: 'Account not found' });

        const oldRole = account.role;
        const roleChanging = Boolean(updateData.role) && updateData.role !== oldRole;
        const auditRoleRefused = (reason) => logAudit(req, {
            action: 'role_changed',
            target: account.email,
            result: 'failure',
            details: { from: oldRole, to: updateData.role, reason },
        });

        // 2026 audit C2: nobody may promote/demote themselves.
        if (roleChanging && String(req.user.id) === String(account._id)) {
            auditRoleRefused('cannot change own role');
            return res.status(400).json({ error: 'You cannot change your own role.' });
        }
        // The last standing Super Admin can never be demoted or disabled.
        if (account.role === 'super_admin' && updateData.role && updateData.role !== 'super_admin') {
            const activeSupers = await Account.countDocuments({ role: 'super_admin', status: 'Active' });
            if (activeSupers <= 1) {
                auditRoleRefused('last active Super Admin');
                return res.status(400).json({ error: 'The last active Super Admin cannot be demoted.' });
            }
        }

        // Audit records only the NAMES of changed fields, never their values
        // (so a new password is never written to the log).
        const changedFields = Object.keys(updateData).filter(
            (k) => k === 'password' || String(account[k] ?? '') !== String(updateData[k] ?? '')
        );

        Object.assign(account, updateData);
        account.statusHistory = account.statusHistory || [];
        account.statusHistory.push({
            type: 'status_change',
            status: account.status || 'Active',
            reason: 'Account details updated',
            changedAt: new Date(),
        });
        await account.save();
        logAudit(req, {
            action: 'account_updated',
            target: account.email,
            details: { fields: changedFields },
        });
        if (roleChanging) {
            logAudit(req, {
                action: 'role_changed',
                target: account.email,
                details: { from: oldRole, to: account.role },
            });
        }
        const result = account.toObject();
        delete result.password;
        res.json(result);
    } catch (error) {
        sendServerError(res, error, `${req.method} ${req.path}`);
    }
});

app.patch('/api/accounts/:id/status', authenticateToken, requireRole('super_admin'), async (req, res) => {
    try {
        const account = await Account.findById(req.params.id);
        if (!account) return res.status(404).json({ error: 'Account not found' });
        if (account.role === 'super_admin') {
            return res.status(403).json({ error: 'Super Admin account cannot be deactivated.' });
        }
        account.status = account.status === 'Active' ? 'Deactivated' : 'Active';
        account.statusHistory = account.statusHistory || [];
        account.statusHistory.push({
            type: 'status_change',
            status: account.status,
            reason: account.status === 'Active' ? 'Account reactivated' : 'Account deactivated',
            changedAt: new Date(),
        });
        await account.save();
        logAudit(req, {
            action: account.status === 'Active' ? 'account_activated' : 'account_deactivated',
            target: account.email,
        });
        const result = account.toObject();
        delete result.password;
        res.json(result);
    } catch (error) {
        sendServerError(res, error, `${req.method} ${req.path}`);
    }
});

app.post('/api/accounts/login', loginLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        // A non-string identifier (e.g. a query-operator object) used to throw
        // inside toLowerCase() and surface as a 500 instead of a clear 400.
        if (typeof email !== 'string' || typeof password !== 'string') {
            return res.status(400).json({ error: 'Please enter your email and password.' });
        }
        const attemptedEmail = email.toLowerCase().trim();
        // Failed attempts record only the email that was tried and why â€”
        // never the password.
        const auditLoginFailure = (reason, acct) => logAudit(req, {
            action: 'login_failure',
            target: attemptedEmail,
            result: 'failure',
            details: { reason },
            actor: { id: acct ? acct._id : '', email: attemptedEmail, role: acct ? acct.role : 'anonymous' },
        });
        const account = await Account.findOne({ email: attemptedEmail });
        if (!account) {
            auditLoginFailure('unknown email');
            return res.status(401).json({ error: 'Invalid email or password.' });
        }
        const isMatch = await account.comparePassword(password);
        if (!isMatch) {
            auditLoginFailure('wrong password', account);
            return res.status(401).json({ error: 'Invalid email or password.' });
        }
        if (account.status === 'Deactivated') {
            auditLoginFailure('account deactivated', account);
            return res.status(403).json({ error: 'This account has been deactivated. Contact your Super Admin.' });
        }
        logAudit(req, {
            action: 'login_success',
            target: account.email,
            actor: { id: account._id, email: account.email, role: account.role },
        });
        const result = account.toObject();
        delete result.password;

        const token = jwt.sign(
            { id: account._id, email: account.email, role: account.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        res.json({ ...result, token, loginRole: 'admin' });
    } catch (error) {
        sendServerError(res, error, `${req.method} ${req.path}`);
    }
});

// â”€â”€ APP NOTIFICATION FEED (bridged from the Android backend) â”€â”€
// Durable, queryable feed of app-originated events for the admin panel.
app.get('/api/notifications', authenticateToken, async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const filter = {};
        if (req.query.role && ['customer', 'seller', 'rider', 'admin'].includes(req.query.role)) {
            filter.role = req.query.role;
        }
        if (req.query.type) filter.type = req.query.type;
        const notifications = await AdminNotification.find(filter).sort({ createdAt: -1 }).limit(limit);
        res.json(notifications);
    } catch (error) {
        sendServerError(res, error, `${req.method} ${req.path}`);
    }
});

// â”€â”€ D-5 / G-8: operator announcement INTO the app's notification inbox â”€â”€
// The portal could only ever read app-originated events; it had no way to
// originate one. An operator composes an announcement here, this route hands it
// to the Android bridge, and the app's own inbox shows it like any other
// notification. Deny-by-default on audience and type, so an unknown value can
// never create a row the app renders without an icon or a tone.
const BROADCAST_AUDIENCES = ['all', 'customer', 'seller', 'rider'];
const BROADCAST_TYPES = ['system_alert', 'order_update', 'delivery_update', 'security_alert'];
const BROADCAST_TITLE_MAX = 120;
const BROADCAST_MESSAGE_MAX = 1000;

app.post('/api/notifications/broadcast', authenticateToken, requireRole(...OFFICE), async (req, res) => {
    try {
        const body = req.body || {};
        const title = String(body.title || '').trim();
        const message = String(body.message || '').trim();
        const audience = String(body.audience || 'all').trim().toLowerCase();
        const type = String(body.type || 'system_alert').trim().toLowerCase();

        if (!title || !message) {
            return res.status(400).json({ success: false, error: 'A title and a message are required.' });
        }
        if (title.length > BROADCAST_TITLE_MAX || message.length > BROADCAST_MESSAGE_MAX) {
            return res.status(400).json({ success: false, error: `Keep the title under ${BROADCAST_TITLE_MAX} characters and the message under ${BROADCAST_MESSAGE_MAX}.` });
        }
        if (!BROADCAST_AUDIENCES.includes(audience)) {
            return res.status(400).json({ success: false, error: `Choose an audience: ${BROADCAST_AUDIENCES.join(', ')}.` });
        }
        if (!BROADCAST_TYPES.includes(type)) {
            return res.status(400).json({ success: false, error: `Choose a message type: ${BROADCAST_TYPES.join(', ')}.` });
        }

        if (!BridgeClient.isBridgeEnabled()) {
            return res.status(503).json({ success: false, error: 'App notifications are not set up right now. Nothing was sent.' });
        }

        const result = await BridgeClient.sendBroadcast({ title, message, audience, type });
        if (!result || !result.success) {
            return res.status(502).json({ success: false, error: (result && result.error) || 'The app did not accept the announcement.' });
        }

        const payload = (result.data && result.data.data) ? result.data.data : (result.data || {});
        const delivered = Number.isFinite(Number(payload.delivered)) ? Number(payload.delivered) : 0;

        // Audit trail in this portal's own feed, so an operator can see what was
        // sent (and to whom) without reading the Android server's logs.
        AdminNotification.create({
            role: 'admin',
            title: `Announcement sent: ${title}`,
            message: `Audience: ${audience} â€” reached ${delivered} account(s).`,
            type: 'system',
            source: 'admin-broadcast',
        }).catch((e) => console.warn('[AdminNotification] broadcast audit row failed:', e.message));

        res.json({
            success: true,
            message: `Announcement sent to ${delivered} account(s).`,
            data: { audience, type, delivered, matched: payload.matched },
        });
    } catch (error) {
        sendServerError(res, error, `${req.method} ${req.path}`);
    }
});

app.patch('/api/notifications/:id/read', authenticateToken, async (req, res) => {
    try {
        // Server is the source of truth for read state (shared across admin
        // sessions/devices). Marks the row read; dedupes harmlessly on repeat.
        const notification = await AdminNotification.findByIdAndUpdate(
            req.params.id,
            { $set: { read: true, readAt: new Date() } },
            { new: true }
        ).lean();
        if (!notification) {
            return res.status(404).json({ error: 'Notification not found' });
        }
        res.json({ success: true, id: notification._id });
    } catch (error) {
        sendServerError(res, error, `${req.method} ${req.path}`);
    }
});

// â”€â”€ SUPPORT TICKET / ISSUE ROUTES â”€â”€
app.get('/api/issues', authenticateToken, requireRole(...OFFICE), async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 200, 500);
        const issues = await Issue.find({}).sort({ createdAt: -1 }).limit(limit).lean();

        // One parcel lookup for the whole page rather than one query per ticket.
        const trackingNumbers = issues
            .filter(i => (!i.productName || !i.productCategory || !i.eta) && i.trackingNumber)
            .map(i => i.trackingNumber);
        const parcelByTracking = new Map();
        if (trackingNumbers.length > 0) {
            const linked = await Parcel.find({ trackingNumber: { $in: trackingNumbers } })
                .select('trackingNumber item productName packageType category estimatedDeliveryDate eta')
                .lean();
            linked.forEach(p => parcelByTracking.set(p.trackingNumber, p));
        }

        // Read-only projection. This route used to mint a random ticket id and persist
        // its own enrichment through issue.save(), which made a GET write to the database
        // and gave a legacy ticket a different id on every request. Missing values are now
        // derived deterministically for the response only; nothing is written here.
        const enriched = issues.map((issue) => {
            const obj = { ...issue };

            if (!obj.ticketId) {
                const year = new Date(obj.createdAt || Date.now()).getFullYear();
                const suffix = String(parseInt(String(obj._id).slice(-6), 16) % 100000).padStart(5, '0');
                obj.ticketId = `TICK-${year}-${suffix}`;
            }

            if (!obj.productName || !obj.productCategory || !obj.eta) {
                const parcel = parcelByTracking.get(obj.trackingNumber);
                if (parcel) {
                    if (!obj.productName) obj.productName = parcel.item || parcel.productName || '';
                    if (!obj.productCategory) obj.productCategory = parcel.packageType || parcel.category || '';
                    if (!obj.eta) obj.eta = parcel.estimatedDeliveryDate || parcel.eta || '';
                }
            }

            return obj;
        });
        res.json(enriched);
    } catch (error) {
        sendServerError(res, error, `${req.method} ${req.path}`);
    }
});

app.put('/api/issues/:id/status', authenticateToken, requireRole(...OFFICE), async (req, res) => {
    try {
        const { status, adminNotes } = req.body;
        const issue = await Issue.findById(req.params.id);
        if (!issue) {
            return res.status(404).json({ error: 'Support ticket not found' });
        }

        issue.status = status || issue.status;
        if (adminNotes !== undefined) issue.adminNotes = adminNotes;
        if (status === 'Resolved' || status === 'Closed') {
            issue.resolvedAt = new Date();
        }
        issue.updatedAt = new Date();
        await issue.save();

        BridgeClient.sendIssueStatus(issue.ticketId, issue.status, issue.adminNotes)
            .catch(e => console.warn('[Bridge] sendIssueStatus failed:', e.message));

        sseBroadcaster.broadcast('issue-status-updated', {
            ticketId: issue.ticketId,
            status: issue.status,
            adminNotes: issue.adminNotes,
            timestamp: new Date().toISOString(),
        });

        res.json(issue);
    } catch (error) {
        sendServerError(res, error, `${req.method} ${req.path}`);
    }
});

// â”€â”€ SMS ROUTES â”€â”€
// 2026 audit M4: sending SMS burns Twilio/Semaphore credit and can spoof the
// YTO sender ID â€” restricted to super_admin + staff and rate-capped.
function toE164PH(number) {
    const digits = number.replace(/\D/g, '');
    if (number.trim().startsWith('+')) return '+' + digits;
    if (digits.startsWith('63')) return '+' + digits;
    if (digits.startsWith('0')) return '+63' + digits.slice(1);
    return '+63' + digits;
}

async function sendViaTwilio(number, message) {
    try {
        const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER } = process.env;
        if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
            throw new Error('Twilio credentials not configured');
        }
        const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
        const result = await client.messages.create({
            body: message,
            from: TWILIO_PHONE_NUMBER,
            to: toE164PH(number),
        });
        return { success: true, provider: 'twilio', result: { sid: result.sid, status: result.status } };
    } catch (err) {
        console.error('[Twilio] SMS failed, falling back:', err.message);
        throw err;
    }
}

async function sendViaSemaphore(number, message) {
    if (!process.env.SEMAPHORE_API_KEY) {
        throw new Error('Semaphore API key not configured');
    }
    const cleanedNumber = number.replace(/[^\d+]/g, '');
    const params = new URLSearchParams({
        apikey: process.env.SEMAPHORE_API_KEY,
        number: cleanedNumber,
        message,
    });
    if (process.env.SEMAPHORE_SENDER_NAME) {
        params.append('sendername', process.env.SEMAPHORE_SENDER_NAME);
    }
    const smsResponse = await fetch('https://api.semaphore.co/api/v4/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params,
    });
    const data = await smsResponse.json();
    if (!smsResponse.ok || data?.error) {
        const err = new Error(data?.message || data?.error || 'Semaphore request failed');
        err.details = data;
        throw err;
    }
    return { success: true, provider: 'semaphore', result: data };
}

app.post('/api/sms/send', authenticateToken, requireRole('super_admin', 'staff'), messageLimiter, async (req, res) => {
    try {
        const { number, message } = req.body;
        if (!number || !message) {
            return res.status(400).json({ error: 'number and message are required' });
        }

        const hasTwilio    = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER;
        const hasSemaphore = process.env.SEMAPHORE_API_KEY;

        if (hasTwilio) {
            const result = await sendViaTwilio(number, message);
            return res.json(result);
        }
        if (hasSemaphore) {
            const result = await sendViaSemaphore(number, message);
            return res.json(result);
        }

        console.log(`[SMS SIMULATED] To: ${number} | Message: ${message}`);
        return res.json({ success: true, provider: 'simulated', result: { number, message } });
    } catch (error) {
        console.error('[SMS] delivery failed:', error.message, error.details || '', error.moreInfo || '');
        res.status(502).json({ error: 'The SMS could not be sent right now. Please try again later.' });
    }
});

// â”€â”€ EMAIL TRANSPORTER CONFIGURATION (IPV4 EXPLICIT FORCE) â”€â”€
let emailTransporter = null;

function getEmailTransporter() {
    if (emailTransporter) return emailTransporter;

    emailTransporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        family: 4, // <-- FORCES NODEMAILER TO USE IPV4 ONLY (PREVENTS ESOCKET IPv6 DROPS)
        dnsLookup: (hostname, options, callback) => {
            dns.lookup(hostname, { family: 4 }, callback);
        },
        connectionTimeout: 10000,
        greetingTimeout: 5000,
        socketTimeout: 10000,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_APP_PASSWORD,
        },
        // 2026 audit M3: TLS certificate verification stays ON (default) â€” the
        // previous rejectUnauthorized:false opened a MITM window for the Gmail
        // app password. The IPv4-only family:4 + dnsLookup overrides above already
        // solve the ESOCKET IPv6 drop this was originally working around.
    });

    return emailTransporter;
}

// â”€â”€ BULLETPROOF EMAIL ROUTE (NON-BLOCKING BACKGROUND DISPATCH) â”€â”€
app.post('/api/email/send', authenticateToken, requireRole('super_admin', 'staff'), messageLimiter, async (req, res) => {
    const { to, subject, message } = req.body;

    if (!to || !message) {
        return res.status(400).json({ error: 'to and message are required' });
    }

    // 1. Send immediate 200 OK success to the browser so it NEVER times out, 502s, or CORS crashes
    res.status(200).json({ 
        success: true, 
        message: 'Account processing complete. Email dispatch queued in background.',
        provider: 'queued' 
    });

    // 2. Process email sending completely out-of-band in the background
    setImmediate(async () => {
        try {
            const hasGmail = process.env.EMAIL_USER && process.env.EMAIL_APP_PASSWORD;
            
            if (!hasGmail) {
                console.log(`[EMAIL SIMULATED] To: ${to} | Subject: ${subject}`);
                return;
            }

            const transporter = getEmailTransporter();
            await transporter.sendMail({
                from: `"YTO Express" <${process.env.EMAIL_USER}>`,
                to,
                subject: subject || 'Your YTO Express account has been verified',
                text: message,
            });
            console.log(`[EMAIL SUCCESS] Background dispatch complete to: ${to}`);
        } catch (bgError) {
            console.error('[EMAIL BACKGROUND WARNING] Non-fatal delivery failure:', bgError.message);
        }
    });
});

// â”€â”€ ADMIN: DATABASE RESET â”€â”€
app.delete('/api/admin/reset-database', authenticateToken, requireRole(...SUPER_ONLY), async (req, res) => {
    if (req.user?.role !== 'super_admin') {
        return res.status(403).json({ error: 'Access denied. Only Super Admin can reset the database.' });
    }

    if (req.body?.confirm !== 'RESET') {
        logAudit(req, {
            action: 'database_reset',
            target: 'sellers, riders',
            result: 'failure',
            details: { reason: 'missing or incorrect confirmation phrase' },
        });
        return res.status(400).json({ error: 'Missing or incorrect confirmation phrase.' });
    }
    try {
        const [sellersResult, ridersResult] = await Promise.all([
            Seller.deleteMany({}),
            Rider.deleteMany({}),
        ]);
        logAudit(req, {
            action: 'database_reset',
            target: 'sellers, riders',
            details: { sellersDeleted: sellersResult.deletedCount, ridersDeleted: ridersResult.deletedCount },
        });
        res.json({
            success: true,
            deleted: {
                sellers: sellersResult.deletedCount,
                riders: ridersResult.deletedCount,
            },
        });
    } catch (error) {
        sendServerError(res, error, `${req.method} ${req.path}`);
    }
});

// â”€â”€ SECURITY AUDIT TRAIL (SH-09) â”€â”€
// Super Admin only. Newest first, paginated (limit capped at 200), with
// optional exact-match filters. Filter values are forced to strings so a
// query-operator object can never reach the database query.
app.get('/api/audit-logs', authenticateToken, requireRole('super_admin'), async (req, res) => {
    try {
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const filter = {};
        ['action', 'result', 'source'].forEach((key) => {
            if (typeof req.query[key] === 'string' && req.query[key]) filter[key] = req.query[key];
        });
        const [logs, total] = await Promise.all([
            AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
            AuditLog.countDocuments(filter),
        ]);
        res.json({ logs, total, page, limit });
    } catch (error) {
        sendServerError(res, error, `${req.method} ${req.path}`);
    }
});

// 2026 bridge audit F5: the bridge contract spans THREE env names on TWO
// deploys that must all agree. Assert the wiring loudly at startup so a
// silent 401 on every bridge call (wrong/rotated secret on one side) can
// never masquerade as "sync just stopped working".
//   Appâ†’Web outbound:  WEB_BACKEND_URL + WEB_BRIDGE_API_KEY
//   Web inbound gate:  BRIDGE_API_KEY            â† must EQUAL WEB_BRIDGE_API_KEY
//   Webâ†’App outbound:  ANDROID_BACKEND_URL + ANDROID_BRIDGE_API_KEY
//   App inbound gate:  BRIDGE_API_KEY || WEB_BRIDGE_API_KEY
//                      â† must EQUAL ANDROID_BRIDGE_API_KEY
// Conclusion: set ALL FOUR names to the SAME secret value on BOTH deploys.
if (!process.env.BRIDGE_API_KEY) {
  console.warn('[Bridge config] BRIDGE_API_KEY not set â€” ALL inbound bridge writes are denied with 503. Set it to the SAME secret as the App backend\'s WEB_BRIDGE_API_KEY.');
}
if (!process.env.ANDROID_BACKEND_URL) {
  console.warn('[Bridge config] ANDROID_BACKEND_URL not set â€” Web-to-App bridge pushes (approvals, parcels, issue statuses) are DISABLED.');
} else if (!process.env.ANDROID_BRIDGE_API_KEY) {
  console.warn('[Bridge config] ANDROID_BRIDGE_API_KEY not set â€” outbound bridge pushes will 401. Set it to the SAME secret as the App backend\'s WEB_BRIDGE_API_KEY.');
}

// â”€â”€ PORT & DATABASE STARTUP â”€â”€
const PORT = process.env.PORT || 3001;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('[Startup Error] MONGO_URI is not set. Add it to server/.env or set it as a deployment env variable.');
  process.exit(1);
}

// â”€â”€ ADMIN BOOTSTRAP â”€â”€
// Insert-only: ensures the canonical admin accounts exist with bcrypt-hashed
// passwords from env. Passwords are never overwritten on restart.
const ADMIN_BOOTSTRAP = [
  { email: 'superadmin@ytoexpress.com', adminId: 'YTOA20260001', name: 'YTO Super Admin',      role: 'super_admin',  passwordEnv: 'ADMIN_PASSWORD_SUPERADMIN', legacyEnv: 'DEMO_ADMIN_PASSWORD_SUPERADMIN', phone: '09170000000' },
  { email: 'staff@ytoexpress.com',      adminId: 'YTOA20260002', name: 'YTO Operations Staff', role: 'staff',        passwordEnv: 'ADMIN_PASSWORD_STAFF',      legacyEnv: 'DEMO_ADMIN_PASSWORD_STAFF',      phone: '09170000000' },
  { email: 'hub@ytoexpress.com',        adminId: 'YTOA20260003', name: 'YTO Hub Receiver',     role: 'hub_receiver', passwordEnv: 'ADMIN_PASSWORD_HUB',        legacyEnv: 'DEMO_ADMIN_PASSWORD_HUB',        phone: '09170000000' },
];

function resolveAdminPassword(entry) {
  const fromEnv = process.env[entry.passwordEnv];
  if (fromEnv && fromEnv.trim()) return { password: fromEnv.trim(), source: entry.passwordEnv };
  // Legacy fallback (pre-de-demo env names) so existing deployments keep working.
  const fromLegacy = process.env[entry.legacyEnv];
  if (fromLegacy && fromLegacy.trim()) return { password: fromLegacy.trim(), source: entry.legacyEnv };
  const generated = crypto.randomBytes(12).toString('base64url');
  console.log('[Bootstrap] No ' + entry.passwordEnv + ' set for ' + entry.email + '. Generated a one-time password (record it now): ' + generated);
  return { password: generated, source: 'generated' };
}

async function ensureAdminAccounts() {
  try {
    const today = new Date().toISOString().split('T')[0];
    for (const d of ADMIN_BOOTSTRAP) {
      const { password, source } = resolveAdminPassword(d);
      const passwordHash = await bcrypt.hash(password, 10);
      await Account.collection.updateOne(
        { email: d.email },
        {
          $setOnInsert: {
            adminId: d.adminId,
            email: d.email,
            name: d.name,
            phone: d.phone,
            role: d.role,
            password: passwordHash,
            status: 'Active',
            createdDate: today,
          },
        },
        { upsert: true }
      );
      // Ensure adminId is set on existing accounts as well
      await Account.collection.updateOne(
        { email: d.email, $or: [{ adminId: { $exists: false } }, { adminId: null }] },
        { $set: { adminId: d.adminId } }
      );
      if (source !== d.passwordEnv) console.log(`[Bootstrap] ${d.email}: password sourced from ${source}.`);
    }
    console.log('[Bootstrap] Admin accounts ensured (bcrypt-hashed, insert-only).');
  } catch (err) {
    console.error('[Bootstrap Warning] Could not ensure admin accounts:', err.message);
  }
}

async function ensureOfficialDemoAccounts() {
  // RETIRED 2026-09-18: the Web portal is REAL-only. The three canonical demo
  // rows (seller/customer/rider@gmail.com) must NOT be created here â€” mobile
  // testing keeps its own copies in the App database. This function is kept
  // as a no-op so existing bootstrap call sites need no change.
  console.log('[Bootstrap] Official demo-account seeding is retired (Web is REAL-only); skipping.');
}

const bootstrapRequested = process.env.ENABLE_ADMIN_BOOTSTRAP === '1' || process.env.ENABLE_DEMO_BOOTSTRAP === '1';
const bootstrapAllowedInProd = process.env.ALLOW_ADMIN_BOOTSTRAP_IN_PROD === '1' || process.env.ALLOW_DEMO_BOOTSTRAP_IN_PROD === '1';
const bootstrapActive = bootstrapRequested && (process.env.NODE_ENV !== 'production' || bootstrapAllowedInProd);

mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 15000 })
  .then(async () => {
    // Admin and demo-account bootstrap stay behind the opt-in gate: a production
    // deploy that forgets ENABLE_ADMIN_BOOTSTRAP must not silently create admin
    // records or seed demo rows. ALLOW_ADMIN_BOOTSTRAP_IN_PROD=1 is still required
    // in production, and the demo seeder only runs when the same flag is set.
    if (bootstrapActive) {
      await ensureAdminAccounts();
      await ensureOfficialDemoAccounts();
    } else if (bootstrapRequested) {
      console.log('[Bootstrap] ENABLE_ADMIN_BOOTSTRAP=1 while NODE_ENV=production without ALLOW_ADMIN_BOOTSTRAP_IN_PROD=1 - skipped for safety.');
    }
    app.listen(PORT, () => console.log(`Server running on port ${PORT} and Connected to MongoDB!`));

    // Connect directly to Mobile App Database for live telemetry streaming and data coherence
    initAppDatabase(sseBroadcaster);

    // I-6: start the 60s bidirectional reconcile loop on a real server only
    // (never under NODE_ENV=test). runOnce() additionally self-gates on the
    // bridge key + ANDROID_BACKEND_URL, so an unconfigured process stays idle.
    if (process.env.NODE_ENV !== 'test') {
      bridgeReconcile.start();
    }
  })
  .catch(err => console.error('[Startup Error] DB Connection Error:', err.message));

// â”€â”€ GLOBAL ERROR HANDLER â”€â”€
app.use((err, req, res, next) => {
  // Malformed JSON bodies (express.json) and oversized payloads are client
  // errors, reported without echoing the parser's message.
  if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
    return res.status(400).json({ error: 'The request could not be read. Please try again.' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'The request is too large.' });
  }
  const statusCode = err.statusCode || err.status || 500;
  if (statusCode >= 500) return sendServerError(res, err, `${req.method} ${req.path}`);
  // Never echo internals; http-errors marks client-safe messages with expose.
  return res.status(statusCode).json({ error: err.expose ? err.message : 'The request could not be completed.' });
});
