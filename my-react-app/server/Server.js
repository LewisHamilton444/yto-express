const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const twilio = require('twilio');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const Seller          = require('./models/Seller');
const Rider           = require('./models/Rider');
const Parcel          = require('./models/Parcel');
const ParcelLocation  = require('./models/ParcelLocation');
const Account         = require('./models/Account');

// ── ROOT ROUTE ──
app.get('/', (req, res) => {
    res.send('YTO Express API Server is Running!');
});

// ── SELLER ROUTES ──
app.post('/api/sellers', async (req, res) => {
    try {
        const newSeller = new Seller(req.body);
        await newSeller.save();
        res.status(201).json({ message: "Seller saved!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/sellers', async (req, res) => {
    try {
        const sellers = await Seller.find();
        res.json(sellers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/sellers/:id', async (req, res) => {
    try {
        const updated = await Seller.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true, runValidators: false }
        );
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/sellers/:id', async (req, res) => {
    try {
        await Seller.findByIdAndDelete(req.params.id);
        res.json({ message: "Seller deleted!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ── RIDER ROUTES ──
app.post('/api/riders', async (req, res) => {
    try {
        const newRider = new Rider(req.body);
        await newRider.save();
        res.status(201).json({ message: "Rider saved!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/riders', async (req, res) => {
    try {
        const riders = await Rider.find();
        res.json(riders);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/riders/:id', async (req, res) => {
    try {
        const updated = await Rider.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true, runValidators: false }
        );
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/riders/:id', async (req, res) => {
    try {
        await Rider.findByIdAndDelete(req.params.id);
        res.json({ message: "Rider deleted!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ── PARCEL ROUTES ──
app.post('/api/parcels', async (req, res) => {
    try {
        const newParcel = new Parcel(req.body);
        await newParcel.save();
        res.status(201).json({ message: "Parcel saved!", parcel: newParcel });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/parcels', async (req, res) => {
    try {
        const parcels = await Parcel.find();
        res.json(parcels);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/parcels/:id', async (req, res) => {
    try {
        const updated = await Parcel.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true, runValidators: false }
        );
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/parcels/:id', async (req, res) => {
    try {
        await Parcel.findByIdAndDelete(req.params.id);
        res.json({ message: "Parcel deleted!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ── PARCEL LOCATION ROUTES ──
app.post('/api/parcel-locations', async (req, res) => {
    try {
        const newLocation = new ParcelLocation(req.body);
        await newLocation.save();
        res.status(201).json({ message: "Parcel location saved!", location: newLocation });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/parcel-locations', async (req, res) => {
    try {
        const locations = await ParcelLocation.find();
        res.json(locations);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/parcel-locations/:id', async (req, res) => {
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

app.delete('/api/parcel-locations/:id', async (req, res) => {
    try {
        await ParcelLocation.findByIdAndDelete(req.params.id);
        res.json({ message: "Location deleted!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ── ACCOUNT ROUTES ──

app.get('/api/accounts', async (req, res) => {
    try {
        const accounts = await Account.find().select('-password');
        res.json(accounts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/accounts', async (req, res) => {
    try {
        const existing = await Account.findOne({ email: req.body.email.toLowerCase().trim() });
        if (existing) {
            return res.status(400).json({ error: 'An account with this email already exists.' });
        }
        const newAccount = new Account({
            ...req.body,
            email: req.body.email.toLowerCase().trim(),
        });
        await newAccount.save();
        const saved = newAccount.toObject();
        delete saved.password;
        res.status(201).json(saved);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/accounts/:id', async (req, res) => {
    try {
        const updateData = { ...req.body };
        if (!updateData.password || updateData.password.trim() === '') {
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

app.patch('/api/accounts/:id/status', async (req, res) => {
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
        if (account.password !== password) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }
        if (account.status === 'Deactivated') {
            return res.status(403).json({ error: 'This account has been deactivated. Contact your Super Admin.' });
        }
        const result = account.toObject();
        delete result.password;
        res.json(result);
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
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER } = process.env;
    const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    const result = await client.messages.create({
        body: message,
        from: TWILIO_PHONE_NUMBER,
        to: toE164PH(number),
    });
    return { success: true, provider: 'twilio', result: { sid: result.sid, status: result.status } };
}

async function sendViaSemaphore(number, message) {
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

app.post('/api/sms/send', async (req, res) => {
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

// ── EMAIL ROUTES ──
let emailTransporter = null;
function getEmailTransporter() {
    if (emailTransporter) return emailTransporter;
    emailTransporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_APP_PASSWORD,
        },
    });
    return emailTransporter;
}

app.post('/api/email/send', async (req, res) => {
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
        res.status(502).json({ error: error.message });
    }
});

// ── ADMIN: DATABASE RESET ──
app.delete('/api/admin/reset-database', async (req, res) => {
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

// Use dynamic port for Render
const PORT = process.env.PORT || 3001;

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT} and Connected to MongoDB!`));
  })
  .catch(err => console.error("DB Connection Error:", err));