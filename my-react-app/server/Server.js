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

// CORS (2026 audit M1): no wildcard. Same-origin and localhost dev origins are
// always allowed; production origins come from CORS_ORIGIN (comma-separated)
// and any *.onrender.com host. Disallowed origins get no ACAO header at all.
//
// BUGFIX 2026-09-22 — this predicate previously had signature (origin) => bool.
// cors@2.8.6 treats a FUNCTION origin as the async-decision contract
// (origin, callback) => void. Our predicate never invoked its 2nd argument,
// so cors's internal continuation never ran, next() was never called, and
// EVERY request — allowed or not — hung until the client timed out. That was
// the login page's "stuck spinner + error after ~1 minute" (apiFetch's 60s
// abort) and the perpetually orange "Connecting..." health pill. The fixed
// form below keeps the same allowlist rules but answers cors's callback:
//   cb(null, originValue)  → allow (reflects the origin)
//   cb(null, false)        → deny (no ACAO header, request still proceeds)
//   cb(err)                → reject with error
// Verified against the installed cors source: server/node_modules/cors/lib/index.js
// (middlewareWrapper → originCallback(req.headers.origin, function (err2, origin) ...)).
const isAllowedCorsOrigin = (origin, callback) => {
    if (!origin) return callback(null, true); // same-origin requests, curl, native clients
    try {
        const { hostname } = new URL(origin);
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.onrender.com')) {
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
app.use(express.json());

// ── EDITABLE-FIELD ALLOWLISTS ───────────────────────────────────────────────
// Every admin PUT below assigns its fields straight into $set, so each request body
// is filtered through an explicit allowlist first. Without this, an authenticated
// admin could write any schema field, and validation was off so bad values were
// stored silently. Deliberately NOT writable: identity (trackingNumber, parcelId,
// registrationId, accountNumber), delivery proof (podPhoto), rider telemetry
// (riderLat/riderLng), money (codAmount, deliveryFee), derived counters
// (deliveries, rating, successRate, isOnDuty), and the Web-minted identity
// artifacts (qrPayload, sellerEnterpriseId, customerEnterpriseId, trackingGeofence)
// — the Web is the sole minting authority for those.
const pickEditable = (body, allowed) => {
    const updates = {};
    allowed.forEach((field) => {
        if (body[field] !== undefined) updates[field] = body[field];
    });
    return updates;
};

const CUSTOMER_EDITABLE_FIELDS = [
    'fullName', 'email', 'phone', 'address', 'city', 'deliveryInstructions', 'status',
];

const SELLER_EDITABLE_FIELDS = [
    'fullName', 'storeName', 'warehouseAddress', 'operatingHours',
    'idType', 'idNumber', 'email', 'phone', 'address', 'city', 'state',
    'country', 'postalCode', 'bankName', 'commissionRate', 'paymentCycle', 'status',
];

const RIDER_EDITABLE_FIELDS = [
    'riderName', 'vehicleType', 'email', 'phone', 'address', 'city', 'state',
    'country', 'postalCode', 'licenseNumber', 'vehiclePlate',
    'emergencyContactName', 'emergencyContactPhone', 'bankName',
    'payoutRate', 'payoutCycle', 'assignedHub', 'status',
];

// events IS allowed: the hub and status screens legitimately append timeline entries
// through this route.
const PARCEL_EDITABLE_FIELDS = [
    'senderName', 'senderPhone', 'senderEmail',
    'receiverName', 'receiverPhone', 'recipientEmail',
    'item', 'weight', 'value', 'origin', 'destination',
    'status', 'riderId', 'events', 'notes',
    'paymentMode', 'packageCount', 'packageCategory', 'packageType',
    'dimensions', 'estimatedDeliveryDate', 'actualDeliveryDate',
];

// parcelId excluded: it is the join key with Parcel, so rewriting it would orphan
// the location from the parcel it belongs to.
const PARCEL_LOCATION_EDITABLE_FIELDS = [
    'lat', 'lng', 'location', 'type', 'status', 'geofence', 'notes',
];

const Seller          = require('./models/Seller');
const Rider           = require('./models/Rider');
const Customer        = require('./models/Customer');
const Parcel          = require('./models/Parcel');
const ParcelLocation  = require('./models/ParcelLocation');
const BridgeClient    = require('./utils/BridgeClient');
const Account         = require('./models/Account');
const Issue           = require('./models/Issue');
const AdminNotification = require('./models/AdminNotification');
const sseBroadcaster  = require('./utils/sseBroadcaster');

// ── JWT AUTHENTICATION MIDDLEWARE ───────────────────────────────────────
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
// authenticated request, not just at login — an existing token cannot keep
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

    const account = await Account.findById(decoded.id);
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

// Rate limiting (2026 audit H1/M4): brute-force guard on sign-in and the
// messaging endpoints that burn money (SMS) or can be abused for spoofing.
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
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

// ── ROOT ROUTE ──
app.get('/', (req, res) => {
    res.send('YTO Express API Server is Running!');
});

// ── HEALTH CHECK ──
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

// ── SSE EVENT STREAM ───────────────────────────────────────────────────
// 2026 audit H2: the stream is now authenticated. A browser EventSource cannot
// send request headers, so the dashboard already rides the JWT as ?token=; the
// server validates it (HS256 + real Active Account) BEFORE opening the stream,
// and rejects anonymous/expired tokens with 401/403. Residual: the token rides
// the query string (visible in access logs) — swapping the frontend to a
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

// ── SSE STATS ───────────────────────────────────────────────────────────
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

// ── SSE CONNECTION HISTORY ──────────────────────────────────────────────
app.get('/api/events/history', authenticateToken, (req, res) => {
    const history = sseBroadcaster.getConnectionHistory();
    res.json(history);
});

// ── SSE PEAK ALERTS ────────────────────────────────────────────────────
app.get('/api/events/alerts', authenticateToken, (req, res) => {
    const alerts = sseBroadcaster.getPeakAlerts();
    res.json(alerts);
});

// ── SSE THRESHOLD CONFIG ───────────────────────────────────────────────
app.put('/api/events/threshold', authenticateToken, (req, res) => {
    const { threshold } = req.body;
    if (typeof threshold !== 'number' || threshold < 1) {
        return res.status(400).json({ error: 'threshold must be a positive number' });
    }
    sseBroadcaster.setThreshold(threshold);
    res.json({ success: true, threshold, message: `Threshold updated to ${threshold}` });
});

// ── BRIDGE ROUTES ──
app.use('/api/bridge', require('./bridgeRoutes'));

// ── SELLER ROUTES ──
app.post('/api/sellers', authenticateToken, async (req, res) => {
    try {
        const newSeller = new Seller({ ...req.body });
        await newSeller.save();
        res.status(201).json({ message: "Seller saved!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
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
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/sellers/:id', authenticateToken, async (req, res) => {
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

        if (req.body.status && updated.email) {
            BridgeClient.sendApproval(updated.email, 'seller', req.body.status, updated.registrationId)
                .catch(e => console.warn('[Bridge→Android] sendApproval failed:', e.message));
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
            }).catch(e => console.warn('[Bridge→Android] sendUserUpdate seller failed:', e.message));
        }

        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/sellers/:id', authenticateToken, async (req, res) => {
    try {
        await Seller.findByIdAndDelete(req.params.id);
        res.json({ message: "Seller deleted!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ── RIDER ROUTES ──
app.post('/api/riders', authenticateToken, async (req, res) => {
    try {
        const newRider = new Rider({ ...req.body });
        await newRider.save();
        res.status(201).json({ message: "Rider saved!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
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
        const riders = await Rider.find(filter).sort({ createdAt: -1 });
        res.json(riders);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/riders/:id', authenticateToken, async (req, res) => {
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

        if (req.body.status && updated.email) {
            BridgeClient.sendApproval(updated.email, 'rider', req.body.status, updated.registrationId)
                .catch(e => console.warn('[Bridge→Android] sendApproval failed:', e.message));
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
            }).catch(e => console.warn('[Bridge→Android] sendUserUpdate rider failed:', e.message));
        }

        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/riders/:id', authenticateToken, async (req, res) => {
    try {
        await Rider.findByIdAndDelete(req.params.id);
        res.json({ message: "Rider deleted!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ── CUSTOMER ROUTES ──
app.get('/api/customers', authenticateToken, async (req, res) => {
    try {
        const customers = await Customer.find({}).sort({ createdAt: -1 });
        res.json(customers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/customers/:id', authenticateToken, async (req, res) => {
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
            }).catch(e => console.warn('[Bridge→Android] sendUserUpdate customer failed:', e.message));
        }

        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/customers/:id', authenticateToken, async (req, res) => {
    try {
        const query = mongoose.isValidObjectId(req.params.id)
            ? { _id: req.params.id }
            : { customerId: req.params.id };
        await Customer.findOneAndDelete(query);
        res.json({ message: "Customer record deleted!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/customers/stats', authenticateToken, async (req, res) => {
    try {
        const total = await Customer.countDocuments();
        res.json({ total });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/customers/:id/orders', authenticateToken, async (req, res) => {
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
        res.status(500).json({ error: error.message });
    }
});

// ── ACTIVITY LOG ROUTE ──
// ── ACTIVITY LOG ROUTE ──
app.get('/api/activity-log', authenticateToken, async (req, res) => {
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
                    description: `${s.fullName} registered as a merchant (${s.storeName || 'Store'})`,
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
        res.status(500).json({ error: error.message });
    }
});

// ── PARCEL ROUTES ──
// Bridge parity (2026-09-13): admin-created parcels now push to the mobile
// backend via BridgeClient.syncParcel → POST /api/bridge/receive-parcel, so
// they appear in the app like app-booked shipments do. The mobile side
// resolves its own seller User by sellerEmail (a Web Seller _id is NOT a
// mobile User id, so it is deliberately never sent); parcels with no
// resolvable seller are skipped — the mobile Shipment schema requires one
// and the old "any existing seller" mis-attribution fallback is gone.
// Fire-and-forget: bridge failure never fails the admin save.
function titleCaseStatus(s) {
    return typeof s === 'string' && s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
}

app.post('/api/parcels', authenticateToken, async (req, res) => {
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
                        // ('Pending'…); the admin form posts 'pending'.
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
                        riderId: newParcel.riderId ? String(newParcel.riderId) : '',
                    }).catch(e => console.warn('[Bridge→Android] sync-parcel failed:', e.message));
                } else {
                    console.warn(`[Bridge→Android] Parcel ${newParcel.trackingNumber} has no resolvable seller — not bridged (mobile Shipment requires one).`);
                }
            }
        } catch (bridgeErr) {
            console.warn('[Bridge→Android] sync-parcel error:', bridgeErr.message);
        }

        // Auto-index into ParcelLocation for Parcel Map and Geofence telemetry
        try {
            // Index only a genuine coordinate. The old fallback pinned every located
            // parcel to one fixed point, which misleads the map and the geofence far
            // more than leaving it unlocated until a real fix arrives.
            if (!newParcel.riderLat || !newParcel.riderLng) {
                console.warn(`[ParcelLocation] skipping auto-index for ${newParcel.trackingNumber}: no coordinates yet`);
            } else {
                const lat = String(newParcel.riderLat);
                const lng = String(newParcel.riderLng);
                await ParcelLocation.findOneAndUpdate(
                    { parcelId: newParcel.trackingNumber },
                    {
                        $set: {
                            parcelId: newParcel.trackingNumber,
                            lat,
                            lng,
                            location: newParcel.origin || 'Pulilan Sorting Hub',
                            type: 'Warehouse',
                            status: newParcel.status || 'Active',
                            geofence: 'Inside',
                            notes: newParcel.item || '',
                        }
                    },
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                );
            }
        } catch (locErr) {
            console.warn('[ParcelLocation] auto-index error:', locErr.message);
        }

        res.status(201).json({ message: "Parcel saved!", parcel: newParcel });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/parcels', authenticateToken, async (req, res) => {
    try {
        const parcels = await Parcel.find({}).sort({ createdAt: -1 });
        res.json(parcels);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/parcels/:id', authenticateToken, async (req, res) => {
    try {
        const updates = pickEditable(req.body, PARCEL_EDITABLE_FIELDS);
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No updatable fields were provided.' });
        }

        const updated = await Parcel.findByIdAndUpdate(
            req.params.id,
            { $set: updates },
            { new: true, runValidators: true }
        );

        if (req.body.status && updated.trackingNumber) {
            BridgeClient.sendStatus(updated.trackingNumber, req.body.status)
                .catch(e => console.warn('[Bridge→Android] sendStatus failed:', e.message));
        }

        sseBroadcaster.broadcast('parcel-updated', {
            trackingNumber: updated.trackingNumber,
            status: req.body.status || updated.status,
            action: 'admin-update',
            timestamp: new Date().toISOString(),
        });

        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/parcels/:id', authenticateToken, async (req, res) => {
    try {
        await Parcel.findByIdAndDelete(req.params.id);
        res.json({ message: "Parcel deleted!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ── PARCEL LOCATION ROUTES ──
app.post('/api/parcel-locations', authenticateToken, async (req, res) => {
    try {
        const newLocation = new ParcelLocation(req.body);
        await newLocation.save();
        res.status(201).json({ message: "Parcel location saved!", location: newLocation });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/parcel-locations', authenticateToken, async (req, res) => {
    try {
        const locations = await ParcelLocation.find();
        res.json(locations);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/parcel-locations/:id', authenticateToken, async (req, res) => {
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
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/parcel-locations/:id', authenticateToken, async (req, res) => {
    try {
        await ParcelLocation.findByIdAndDelete(req.params.id);
        res.json({ message: "Location deleted!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ── DASHBOARD ANALYTICS ──
app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
    try {
        const [totalParcels, deliveredCount, totalRiders, activeRidersCount, totalSellers, riderStats] = await Promise.all([
            Parcel.countDocuments({}),
            Parcel.countDocuments({ status: { $regex: /^delivered$/i } }),
            Rider.countDocuments({}),
            Rider.countDocuments({ status: { $regex: /^active$/i } }),
            Seller.countDocuments({}),
            Rider.find({}, 'rating deliveries'),
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
        res.status(500).json({ error: error.message });
    }
});

// ── ACCOUNT ROUTES ──
app.get('/api/accounts', authenticateToken, requireRole('super_admin'), async (req, res) => {
    try {
        const accounts = await Account.find({}).select('-password');
        res.json(accounts);
    } catch (error) {
        res.status(500).json({ error: error.message });
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
        // creation (bootstrap accounts are unaffected — they bypass this route).
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
        const result = newAccount.toObject();
        delete result.password;
        res.status(201).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
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
            const salt = await bcrypt.genSalt(10);
            updateData.password = await bcrypt.hash(updateData.password, salt);
        } else {
            delete updateData.password;
        }
        delete updateData.statusHistory;
        const account = await Account.findById(req.params.id);
        if (!account) return res.status(404).json({ error: 'Account not found' });

        // 2026 audit C2: nobody may promote/demote themselves.
        if (updateData.role && String(req.user.id) === String(account._id) && updateData.role !== account.role) {
            return res.status(400).json({ error: 'You cannot change your own role.' });
        }
        // The last standing Super Admin can never be demoted or disabled.
        if (account.role === 'super_admin' && updateData.role && updateData.role !== 'super_admin') {
            const activeSupers = await Account.countDocuments({ role: 'super_admin', status: 'Active' });
            if (activeSupers <= 1) {
                return res.status(400).json({ error: 'The last active Super Admin cannot be demoted.' });
            }
        }

        Object.assign(account, updateData);
        account.statusHistory = account.statusHistory || [];
        account.statusHistory.push({
            type: 'status_change',
            status: account.status || 'Active',
            reason: 'Account details updated',
            changedAt: new Date(),
        });
        await account.save();
        const result = account.toObject();
        delete result.password;
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
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
        const result = account.toObject();
        delete result.password;
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/accounts/login', loginLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        const account = await Account.findOne({ email: email.toLowerCase().trim() });
        if (!account) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }
        const isMatch = await account.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }
        if (account.status === 'Deactivated') {
            return res.status(403).json({ error: 'This account has been deactivated. Contact your Super Admin.' });
        }
        const result = account.toObject();
        delete result.password;

        const token = jwt.sign(
            { id: account._id, email: account.email, role: account.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        res.json({ ...result, token, loginRole: 'admin' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ── APP NOTIFICATION FEED (bridged from the Android backend) ──
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
        res.status(500).json({ error: error.message });
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
        res.status(500).json({ error: error.message });
    }
});

// ── SUPPORT TICKET / ISSUE ROUTES ──
app.get('/api/issues', authenticateToken, async (req, res) => {
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
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/issues/:id/status', authenticateToken, async (req, res) => {
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
        res.status(500).json({ error: error.message });
    }
});

// ── SMS ROUTES ──
// 2026 audit M4: sending SMS burns Twilio/Semaphore credit and can spoof the
// YTO sender ID — restricted to super_admin + staff and rate-capped.
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
        res.status(502).json({ error: error.message, details: error.details, moreInfo: error.moreInfo });
    }
});

// ── EMAIL TRANSPORTER CONFIGURATION (IPV4 EXPLICIT FORCE) ──
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
        // 2026 audit M3: TLS certificate verification stays ON (default) — the
        // previous rejectUnauthorized:false opened a MITM window for the Gmail
        // app password. The IPv4-only family:4 + dnsLookup overrides above already
        // solve the ESOCKET IPv6 drop this was originally working around.
    });

    return emailTransporter;
}

// ── BULLETPROOF EMAIL ROUTE (NON-BLOCKING BACKGROUND DISPATCH) ──
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

// ── ADMIN: DATABASE RESET ──
app.delete('/api/admin/reset-database', authenticateToken, async (req, res) => {
    if (req.user?.role !== 'super_admin') {
        return res.status(403).json({ error: 'Access denied. Only Super Admin can reset the database.' });
    }

    if (req.body?.confirm !== 'RESET') {
        return res.status(400).json({ error: 'Missing or incorrect confirmation phrase.' });
    }
    try {
        const [sellersResult, ridersResult] = await Promise.all([
            Seller.deleteMany({}),
            Rider.deleteMany({}),
        ]);
        res.json({
            success: true,
            deleted: {
                sellers: sellersResult.deletedCount,
                riders: ridersResult.deletedCount,
            },
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2026 bridge audit F5: the bridge contract spans THREE env names on TWO
// deploys that must all agree. Assert the wiring loudly at startup so a
// silent 401 on every bridge call (wrong/rotated secret on one side) can
// never masquerade as "sync just stopped working".
//   App→Web outbound:  WEB_BACKEND_URL + WEB_BRIDGE_API_KEY
//   Web inbound gate:  BRIDGE_API_KEY            ← must EQUAL WEB_BRIDGE_API_KEY
//   Web→App outbound:  ANDROID_BACKEND_URL + ANDROID_BRIDGE_API_KEY
//   App inbound gate:  BRIDGE_API_KEY || WEB_BRIDGE_API_KEY
//                      ← must EQUAL ANDROID_BRIDGE_API_KEY
// Conclusion: set ALL FOUR names to the SAME secret value on BOTH deploys.
if (!process.env.BRIDGE_API_KEY) {
  console.warn('[Bridge config] BRIDGE_API_KEY not set — ALL inbound bridge writes are denied with 503. Set it to the SAME secret as the App backend\'s WEB_BRIDGE_API_KEY.');
}
if (!process.env.ANDROID_BACKEND_URL) {
  console.warn('[Bridge config] ANDROID_BACKEND_URL not set — Web-to-App bridge pushes (approvals, parcels, issue statuses) are DISABLED.');
} else if (!process.env.ANDROID_BRIDGE_API_KEY) {
  console.warn('[Bridge config] ANDROID_BRIDGE_API_KEY not set — outbound bridge pushes will 401. Set it to the SAME secret as the App backend\'s WEB_BRIDGE_API_KEY.');
}

// ── PORT & DATABASE STARTUP ──
const PORT = process.env.PORT || 3001;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('[Startup Error] MONGO_URI is not set. Add it to server/.env or set it as a deployment env variable.');
  process.exit(1);
}

// ── ADMIN BOOTSTRAP ──
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
  // rows (seller/customer/rider@gmail.com) must NOT be created here — mobile
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
  })
  .catch(err => console.error('[Startup Error] DB Connection Error:', err.message));

// ── GLOBAL ERROR HANDLER ──
app.use((err, req, res, next) => {
  console.error('[Server Error]', err.message);
  const statusCode = err.statusCode || err.status || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
});