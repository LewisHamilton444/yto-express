const dns = require('node:dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const twilio = require('twilio');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');

// Load .env anchored to this file (not process.cwd()) so the server
// starts regardless of which directory it is invoked from.
dotenv.config({ path: path.resolve(__dirname, '.env') });

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const Seller          = require('./models/Seller');
const Rider           = require('./models/Rider');
const Customer        = require('./models/Customer');
const Parcel          = require('./models/Parcel');
const ParcelLocation  = require('./models/ParcelLocation');
const BridgeClient    = require('./utils/BridgeClient');
const Account         = require('./models/Account');
const Issue           = require('./models/Issue');
const sseBroadcaster  = require('./utils/sseBroadcaster');

// ── JWT AUTHENTICATION MIDDLEWARE ───────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'ytoexpressappandwebcapstoneproject';

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // { id, email, role, isDemo, iat, exp }
        req.category = decoded.isDemo ? 'DEMO' : 'REAL';
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired. Please log in again.' });
        }
        return res.status(403).json({ error: 'Invalid token.' });
    }
}

// ── CATEGORY PARTITIONING HELPER ─────────────────────────────────────────
function getCategoryFilter(req) {
    const requested = (req.query.category || '').toUpperCase();
    if (requested === 'ALL') return {};
    if (requested === 'REAL' || requested === 'DEMO') return { accountCategory: requested };
    // Default to the authenticated user's realm (REAL for real admins, DEMO for demo admins)
    return { accountCategory: req.category || 'REAL' };
}

// ── DEMO / REAL ACCOUNT CLASSIFICATION ──────────────────────────────────
const DEMO_DOMAINS = ['yto.com', 'example.com', 'ytoexpress.com'];
const DEMO_EMAILS = ['superadmin@gmail.com', 'staff@gmail.com', 'hub@gmail.com'];
function isDemoEmail(email) {
    const value = String(email || '').toLowerCase().trim();
    const domain = value.split('@')[1] || '';
    return DEMO_EMAILS.includes(value) || DEMO_DOMAINS.includes(domain) || value.startsWith('demo');
}

// ── ROOT ROUTE ──
app.get('/', (req, res) => {
    res.send('YTO Express API Server is Running!');
});

// ── SSE EVENT STREAM ───────────────────────────────────────────────────
app.get('/api/events/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // nginx proxy compat
    res.flushHeaders();

    // Send initial connection event
    res.write(`event: connected\ndata: ${JSON.stringify({ message: 'SSE connected', timestamp: new Date().toISOString() })}\n\n`);

    sseBroadcaster.addClient(res);

    // Heartbeat to keep connection alive
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
        const newSeller = new Seller({
            ...req.body,
            accountCategory: req.body.accountCategory || req.category || 'REAL',
        });
        await newSeller.save();
        res.status(201).json({ message: "Seller saved!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/sellers', authenticateToken, async (req, res) => {
    try {
        const sellers = await Seller.find(getCategoryFilter(req)).sort({ createdAt: -1 });
        res.json(sellers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/sellers/:id', authenticateToken, async (req, res) => {
    try {
        const updated = await Seller.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true, runValidators: false }
        );

        if (req.body.status && updated.email) {
            BridgeClient.sendApproval(updated.email, 'seller', req.body.status)
                .catch(e => console.warn('[Bridge→Android] sendApproval failed:', e.message));
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
        const newRider = new Rider({
            ...req.body,
            accountCategory: req.body.accountCategory || req.category || 'REAL',
        });
        await newRider.save();
        res.status(201).json({ message: "Rider saved!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/riders', authenticateToken, async (req, res) => {
    try {
        const riders = await Rider.find(getCategoryFilter(req)).sort({ createdAt: -1 });
        res.json(riders);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/riders/:id', authenticateToken, async (req, res) => {
    try {
        const updated = await Rider.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true, runValidators: false }
        );

        if (req.body.status && updated.email) {
            BridgeClient.sendApproval(updated.email, 'rider', req.body.status)
                .catch(e => console.warn('[Bridge→Android] sendApproval failed:', e.message));
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
        const customers = await Customer.find(getCategoryFilter(req)).sort({ createdAt: -1 });
        res.json(customers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/customers/stats', authenticateToken, async (req, res) => {
    try {
        const [total, realCount, demoCount] = await Promise.all([
            Customer.countDocuments(),
            Customer.countDocuments({ accountCategory: 'REAL' }),
            Customer.countDocuments({ accountCategory: 'DEMO' }),
        ]);
        res.json({ total, realCount, demoCount });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/customers/:id/orders', authenticateToken, async (req, res) => {
    try {
        const customer = await Customer.findOne({ customerId: req.params.id });
        if (!customer) {
            return res.status(404).json({ error: 'Customer not found.' });
        }
        const orders = await Parcel.find({ recipientEmail: customer.email }).sort({ createdAt: -1 });
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ── ACTIVITY LOG ROUTE ──
app.get('/api/activity-log', authenticateToken, async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const roleFilter = req.query.role;
        const catFilter = getCategoryFilter(req);
        const events = [];

        if (!roleFilter || roleFilter === 'customer') {
            const customers = await Customer.find(catFilter);
            customers.forEach(c => {
                events.push({
                    role: 'customer',
                    actorName: c.fullName,
                    actorId: c.customerId,
                    type: 'registration',
                    status: c.status || 'Active',
                    description: `${c.fullName} registered as ${c.accountCategory || 'REAL'} customer`,
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
        }

        if (!roleFilter || roleFilter === 'seller') {
            const sellers = await Seller.find(catFilter);
            sellers.forEach(s => {
                events.push({
                    role: 'seller',
                    actorName: s.fullName,
                    actorId: s.registrationId,
                    type: 'registration',
                    status: s.status || 'ACTIVE',
                    description: `${s.fullName} registered as ${s.accountCategory || 'REAL'} seller`,
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
        }

        if (!roleFilter || roleFilter === 'rider') {
            const riders = await Rider.find(catFilter);
            riders.forEach(r => {
                events.push({
                    role: 'rider',
                    actorName: r.riderName,
                    actorId: r.registrationId,
                    type: 'registration',
                    status: r.status || 'Active',
                    description: `${r.riderName} registered as ${r.accountCategory || 'REAL'} rider`,
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
                            description: sh.reason || `Status changed to ${sh.status}`,
                            timestamp: sh.changedAt,
                        });
                    });
                }
            });
        }

        events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        res.json(events.slice(0, limit));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ── PARCEL ROUTES ──
app.post('/api/parcels', authenticateToken, async (req, res) => {
    try {
        const newParcel = new Parcel({
            ...req.body,
            accountCategory: req.body.accountCategory || req.category || 'REAL',
        });
        await newParcel.save();
        res.status(201).json({ message: "Parcel saved!", parcel: newParcel });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/parcels', authenticateToken, async (req, res) => {
    try {
        const parcels = await Parcel.find(getCategoryFilter(req)).sort({ createdAt: -1 });
        res.json(parcels);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/parcels/:id', authenticateToken, async (req, res) => {
    try {
        const updated = await Parcel.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true, runValidators: false }
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
        const updated = await ParcelLocation.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true, runValidators: false }
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
        const catFilter = getCategoryFilter(req);
        const [totalParcels, deliveredCount, totalRiders, activeRidersCount, totalSellers, riderStats] = await Promise.all([
            Parcel.countDocuments(catFilter),
            Parcel.countDocuments({ ...catFilter, status: { $regex: /^delivered$/i } }),
            Rider.countDocuments(catFilter),
            Rider.countDocuments({ ...catFilter, status: { $regex: /^active$/i } }),
            Seller.countDocuments(catFilter),
            Rider.find(catFilter, 'rating deliveries'),
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
            category: req.category,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ── ACCOUNT ROUTES ──
app.get('/api/accounts', authenticateToken, async (req, res) => {
    try {
        const accounts = await Account.find(getCategoryFilter(req)).select('-password');
        res.json(accounts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/accounts', authenticateToken, async (req, res) => {
    try {
        const email = req.body.email.toLowerCase().trim();
        const existing = await Account.findOne({ email });
        if (existing) {
            return res.status(400).json({ error: 'An account with this email already exists.' });
        }
        const isDemo = isDemoEmail(email);
        const newAccount = new Account({
            ...req.body,
            email,
            accountCategory: isDemo ? 'DEMO' : 'REAL',
        });
        await newAccount.save();
        const result = newAccount.toObject();
        delete result.password;
        res.status(201).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/accounts/:id', authenticateToken, async (req, res) => {
    try {
        const updateData = { ...req.body };
        if (updateData.email) {
            updateData.email = updateData.email.toLowerCase().trim();
            updateData.accountCategory = isDemoEmail(updateData.email) ? 'DEMO' : 'REAL';
        }
        if (updateData.password && updateData.password.trim()) {
            const salt = await bcrypt.genSalt(10);
            updateData.password = await bcrypt.hash(updateData.password, salt);
        } else {
            delete updateData.password;
        }
        const updated = await Account.findByIdAndUpdate(
            req.params.id,
            { $set: updateData },
            { new: true, runValidators: false }
        ).select('-password');
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.patch('/api/accounts/:id/status', authenticateToken, async (req, res) => {
    try {
        const account = await Account.findById(req.params.id);
        if (!account) return res.status(404).json({ error: 'Account not found' });
        if (account.role === 'super_admin') {
            return res.status(403).json({ error: 'Super Admin account cannot be deactivated.' });
        }
        account.status = account.status === 'Active' ? 'Deactivated' : 'Active';
        await account.save();
        const result = account.toObject();
        delete result.password;
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/accounts/login', async (req, res) => {
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
        const isDemo = isDemoEmail(account.email);
        const result = account.toObject();
        delete result.password;

        const token = jwt.sign(
            { id: account._id, email: account.email, role: account.role, isDemo },
            process.env.JWT_SECRET || 'ytoexpressappandwebcapstoneproject',
            { expiresIn: '24h' }
        );
        res.json({ ...result, token, loginRole: 'admin', isDemo, accountCategory: isDemo ? 'DEMO' : 'REAL' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ── SUPPORT TICKET / ISSUE ROUTES ──
app.get('/api/issues', authenticateToken, async (req, res) => {
    try {
        const issues = await Issue.find(getCategoryFilter(req)).sort({ createdAt: -1 });
        res.json(issues);
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

app.post('/api/sms/send', authenticateToken, async (req, res) => {
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

// ── EMAIL ROUTES (FIXED FOR RENDER / IPV4 ENETUNREACH) ──
let emailTransporter = null;
function getEmailTransporter() {
    if (emailTransporter) return emailTransporter;
    emailTransporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        // Override internal DNS lookup to force Node's IPv4 stack only
        dnsLookup: (hostname, options, callback) => {
            dns.lookup(hostname, { family: 4 }, callback);
        },
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_APP_PASSWORD,
        },
    });
    return emailTransporter;
}

app.post('/api/email/send', authenticateToken, async (req, res) => {
    try {
        const { to, subject, message } = req.body;
        if (!to || !message) {
            return res.status(400).json({ error: 'to and message are required' });
        }

        const hasGmail = process.env.EMAIL_USER && process.env.EMAIL_APP_PASSWORD;

        if (!hasGmail) {
            console.log(`[EMAIL SIMULATED] To: ${to} | Subject: ${subject} | Message: ${message}`);
            return res.json({ success: true, provider: 'simulated', result: { to, subject, message } });
        }

        const info = await getEmailTransporter().sendMail({
            from: `"YTO Express" <${process.env.EMAIL_USER}>`,
            to,
            subject: subject || 'Your YTO Express account has been verified',
            text: message,
        });

        res.json({ success: true, provider: 'gmail', result: { messageId: info.messageId } });
    } catch (error) {
        console.error('[Nodemailer Error]:', error);
        res.status(502).json({ error: error.message });
    }
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

// ── PORT & DATABASE STARTUP ──
const PORT = process.env.PORT || 3001;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('[Startup Error] MONGO_URI is not set. Add it to server/.env or set it as a deployment env variable.');
  process.exit(1);
}

// ── DEMO ADMIN BOOTSTRAP ──
const DEMO_ADMIN_BOOTSTRAP = [
  { email: 'superadmin@gmail.com', name: 'YTO Super Admin (Demo)',      role: 'super_admin',  passwordEnv: 'DEMO_ADMIN_PASSWORD_SUPERADMIN', phone: '09170000000' },
  { email: 'staff@gmail.com',      name: 'YTO Operations Staff (Demo)', role: 'staff',        passwordEnv: 'DEMO_ADMIN_PASSWORD_STAFF',      phone: '09170000000' },
  { email: 'hub@gmail.com',        name: 'YTO Hub Receiver (Demo)',     role: 'hub_receiver', passwordEnv: 'DEMO_ADMIN_PASSWORD_HUB',        phone: '09170000000' },
];

function resolveDemoPassword(entry) {
  const fromEnv = process.env[entry.passwordEnv];
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  const generated = crypto.randomBytes(12).toString('base64url');
  console.log('[Bootstrap] No ' + entry.passwordEnv + ' set for ' + entry.email + '. Generated a one-time password (record it now): ' + generated);
  return generated;
}

async function ensureDemoAdminAccounts() {
  try {
    const today = new Date().toISOString().split('T')[0];
    for (const d of DEMO_ADMIN_BOOTSTRAP) {
      const passwordHash = await bcrypt.hash(resolveDemoPassword(d), 10);
      await Account.collection.updateOne(
        { email: d.email },
        {
          $setOnInsert: {
            email: d.email,
            name: d.name,
            phone: d.phone,
            role: d.role,
            password: passwordHash,
            status: 'Active',
            accountCategory: 'DEMO',
            createdDate: today,
          },
        },
        { upsert: true }
      );
    }
    console.log('[Bootstrap] Demo admin accounts ensured (bcrypt-hashed, insert-only).');
  } catch (err) {
    console.error('[Bootstrap Warning] Could not ensure demo admin accounts:', err.message);
  }
}

const bootstrapRequested = process.env.ENABLE_DEMO_BOOTSTRAP === '1';
const bootstrapAllowedInProd = process.env.ALLOW_DEMO_BOOTSTRAP_IN_PROD === '1';
const bootstrapActive = bootstrapRequested && (process.env.NODE_ENV !== 'production' || bootstrapAllowedInProd);

mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 15000 })
  .then(async () => {
    if (bootstrapActive) {
      await ensureDemoAdminAccounts();
    } else if (bootstrapRequested) {
      console.log('[Bootstrap] ENABLE_DEMO_BOOTSTRAP=1 while NODE_ENV=production without ALLOW_DEMO_BOOTSTRAP_IN_PROD=1 - skipped for safety.');
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