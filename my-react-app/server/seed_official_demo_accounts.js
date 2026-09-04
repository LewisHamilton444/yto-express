const dns = require('node:dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
const path = require('node:path');
const crypto = require('node:crypto');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const Seller = require('./models/Seller');
const Customer = require('./models/Customer');
const Rider = require('./models/Rider');
const Account = require('./models/Account');
const bcrypt = require('bcryptjs');

// Credentials never live in source. MONGO_URI must come from server/.env or
// the environment; demo admin passwords come from DEMO_ADMIN_PASSWORD_* vars
// (a random one is generated and logged once when a var is missing).
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('[Seed Error] MONGO_URI is required. Set it in server/.env or the environment (never hardcode credentials in source).');
  process.exit(1);
}

async function seedOfficialDemoAccounts() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to Web MongoDB Atlas.');

    // 1. Seed / Upsert Official Demo Seller
    await Seller.findOneAndUpdate(
      { email: 'seller@gmail.com' },
      {
        registrationId: 'YTO-SELL-2026-DEMO1',
        accountNumber: '9876543210',
        fullName: 'YTO Merchant',
        email: 'seller@gmail.com',
        phone: '09876543210',
        idType: 'National ID',
        idNumber: 'PH-ID-98765',
        address: 'YTO Central Warehouse, Taguig City, Metro Manila',
        city: 'Taguig',
        state: 'Metro Manila',
        country: 'Philippines',
        paymentCycle: 'Weekly',
        commissionRate: 10,
        status: 'ACTIVE',
        accountCategory: 'DEMO',
        statusHistory: [{ status: 'ACTIVE', changedAt: new Date(), reason: 'Official Demo Seller Initialization' }],
      },
      { upsert: true, new: true }
    );
    console.log('✓ Seeded Demo Seller (seller@gmail.com)');

    // 2. Seed / Upsert Official Demo Customer
    await Customer.findOneAndUpdate(
      { email: 'customer@gmail.com' },
      {
        customerId: 'YTO-CUST-2026-DEMO1',
        fullName: 'YTO Buyer',
        email: 'customer@gmail.com',
        phone: '01234567890',
        address: '123 Ayala Ave, Makati City, Metro Manila',
        accountCategory: 'DEMO',
        status: 'Active',
        source: 'mobile-app',
        statusHistory: [{ status: 'Active', changedAt: new Date(), reason: 'Official Demo Customer Initialization' }],
      },
      { upsert: true, new: true }
    );
    console.log('✓ Seeded Demo Customer (customer@gmail.com)');

    // 3. Seed / Upsert Official Demo Rider
    await Rider.findOneAndUpdate(
      { email: 'rider@gmail.com' },
      {
        registrationId: 'YTO-RIDE-2026-DEMO1',
        accountNumber: '2468101214',
        riderName: 'YTO Rider',
        email: 'rider@gmail.com',
        phone: '02468101214',
        vehicleType: 'Yamaha NMAX 155',
        vehiclePlate: 'ABC-1234',
        licenseNumber: 'N01-23-456789',
        address: '45 Taft Ave, Manila City, Metro Manila',
        city: 'Manila',
        state: 'Metro Manila',
        country: 'Philippines',
        payoutRate: 80,
        payoutCycle: 'Weekly',
        status: 'Active',
        deliveries: 42,
        rating: 4.9,
        accountCategory: 'DEMO',
        statusHistory: [{ status: 'Active', changedAt: new Date(), reason: 'Official Demo Rider Initialization' }],
      },
      { upsert: true, new: true }
    );
    console.log('✓ Seeded Demo Rider (rider@gmail.com)');

    // 4. Seed / Upsert Official Demo Admin Accounts (@gmail.com trio -
    //    mirrors the Android app's customer/seller/rider@gmail.com convention).
    //    Passwords are ALWAYS bcrypt-hashed before storage (the plaintext
    //    compatibility mode was removed - rotate legacy rows with
    //    rotate_demo_admin_credentials.js instead). Sources, in order:
    //      1. DEMO_ADMIN_PASSWORD_SUPERADMIN / _STAFF / _HUB env vars
    //      2. A random generated password, logged once so the operator can
    //         record it (never hardcoded, never re-printed on later runs).
    const demoAdmins = [
      { name: 'YTO Super Admin (Demo)',      email: 'superadmin@gmail.com', role: 'super_admin',  passwordEnv: 'DEMO_ADMIN_PASSWORD_SUPERADMIN' },
      { name: 'YTO Operations Staff (Demo)', email: 'staff@gmail.com',      role: 'staff',        passwordEnv: 'DEMO_ADMIN_PASSWORD_STAFF' },
      { name: 'YTO Hub Receiver (Demo)',     email: 'hub@gmail.com',        role: 'hub_receiver', passwordEnv: 'DEMO_ADMIN_PASSWORD_HUB' },
    ];
    for (const admin of demoAdmins) {
      let plainPassword = process.env[admin.passwordEnv];
      if (!plainPassword || !plainPassword.trim()) {
        plainPassword = crypto.randomBytes(12).toString('base64url');
        console.log('[Seed] No ' + admin.passwordEnv + ' set for ' + admin.email + '. Generated a one-time password (record it now): ' + plainPassword);
      }
      const passwordHash = await bcrypt.hash(plainPassword.trim(), 10);
      await Account.findOneAndUpdate(
        { email: admin.email },
        {
          name: admin.name,
          email: admin.email,
          phone: '09170000000',
          role: admin.role,
          password: passwordHash,
          status: 'Active',
          accountCategory: 'DEMO',
          createdDate: new Date().toISOString().split('T')[0],
        },
        { upsert: true, new: true }
      );
      console.log('Seeded Demo Admin (' + admin.email + ')');
    }

    console.log('All 6 official demo accounts successfully seeded into Web MongoDB Atlas.');
  } catch (err) {
    console.error('Seeding Error:', err.message);
  } finally {
    process.exit(0);
  }
}

seedOfficialDemoAccounts();
