const dns = require('node:dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
require('dotenv').config();

const Seller = require('./models/Seller');
const Customer = require('./models/Customer');
const Rider = require('./models/Rider');
const Account = require('./models/Account');
const bcrypt = require('bcryptjs');

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://ianjayaguinaldo3_db_user:wadu09269592382@cluster0.qv8m83a.mongodb.net/?appName=Cluster0';

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

    // 4. Seed / Upsert Official Demo Admin Account
    const adminSalt = await bcrypt.genSalt(10);
    const adminHash = await bcrypt.hash('Admin@123', adminSalt);
    await Account.findOneAndUpdate(
      { email: 'admin@yto.com' },
      {
        name: 'YTO Super Admin',
        email: 'admin@yto.com',
        phone: '09170000000',
        role: 'super_admin',
        password: adminHash,
        status: 'Active',
        accountCategory: 'DEMO',
        createdDate: new Date().toISOString().split('T')[0],
      },
      { upsert: true, new: true }
    );
    console.log('✓ Seeded Demo Admin (admin@yto.com / Admin@123)');

    // 5. Seed / Upsert YTO Express demo admin accounts used by the login
    //    fast-fill selector on the web admin portal (DEMO realm).
    const demoAdmins = [
      { name: 'YTO Super Admin (Demo)',   email: 'superadmin@ytoexpress.com', role: 'super_admin',  password: 'admin123' },
      { name: 'YTO Operations Staff (Demo)', email: 'staff@ytoexpress.com',     role: 'staff',        password: 'staff123' },
      { name: 'YTO Hub Receiver (Demo)',  email: 'hub@ytoexpress.com',         role: 'hub_receiver', password: 'sub123' },
    ];
    for (const admin of demoAdmins) {
      const demoSalt = await bcrypt.genSalt(10);
      const demoHash = await bcrypt.hash(admin.password, demoSalt);
      await Account.findOneAndUpdate(
        { email: admin.email },
        {
          name: admin.name,
          email: admin.email,
          phone: '09170000000',
          role: admin.role,
          password: demoHash,
          status: 'Active',
          accountCategory: 'DEMO',
          createdDate: new Date().toISOString().split('T')[0],
        },
        { upsert: true, new: true }
      );
      console.log(`✓ Seeded Demo Admin (${admin.email})`);
    }

    console.log('All 7 official demo accounts successfully seeded into Web MongoDB Atlas.');
  } catch (err) {
    console.error('Seeding Error:', err.message);
  } finally {
    process.exit(0);
  }
}

seedOfficialDemoAccounts();
