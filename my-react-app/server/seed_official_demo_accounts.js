const dns = require('node:dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const Seller = require('./models/Seller');
const Customer = require('./models/Customer');
const Rider = require('./models/Rider');

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('[Seed Error] MONGO_URI is required. Set it in server/.env or the environment.');
  process.exit(1);
}

async function seedOfficialDemoAccounts() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to Web MongoDB Atlas.');

    // 1. Seed / Upsert Official Demo Seller
    const seller = await Seller.findOneAndUpdate(
      { email: 'seller@gmail.com' },
      {
        $set: {
          registrationId: 'YTOS2026DEMO1',
          accountNumber: '9876543210',
          fullName: 'YTO Merchant',
          storeName: 'YTO Official Store',
          email: 'seller@gmail.com',
          phone: '09876543210',
          idType: 'National ID',
          idNumber: 'PH-ID-98765',
          address: 'YTO Central Warehouse, Pulilan, Bulacan',
          city: 'Pulilan',
          state: 'Bulacan',
          country: 'Philippines',
          postalCode: '3005',
          bankName: 'BDO Unibank',
          paymentCycle: 'Weekly',
          commissionRate: 10,
          status: 'ACTIVE',
        },
        $setOnInsert: {
          statusHistory: [{ status: 'ACTIVE', changedAt: new Date(), reason: 'Official Demo Seller Initialization' }],
        }
      },
      { upsert: true, new: true }
    );
    console.log('Seeded Demo Seller:', seller.email, `(${seller.registrationId})`);

    // 2. Seed / Upsert Official Demo Customer
    const customer = await Customer.findOneAndUpdate(
      { email: 'customer@gmail.com' },
      {
        $set: {
          customerId: 'YTOC2026DEMO1',
          fullName: 'YTO Buyer',
          email: 'customer@gmail.com',
          phone: '01234567890',
          status: 'Active',
          source: 'mobile-app',
        },
        $setOnInsert: {
          statusHistory: [{ status: 'Active', changedAt: new Date(), reason: 'Official Demo Customer Initialization' }],
        }
      },
      { upsert: true, new: true }
    );
    console.log('Seeded Demo Customer:', customer.email, `(${customer.customerId})`);

    // 3. Seed / Upsert Official Demo Rider
    const rider = await Rider.findOneAndUpdate(
      { email: 'rider@gmail.com' },
      {
        $set: {
          registrationId: 'YTOR2026DEMO1',
          accountNumber: '2468101214',
          riderName: 'YTO Rider',
          email: 'rider@gmail.com',
          phone: '02468101214',
          vehicleType: 'Yamaha NMAX 155',
          vehiclePlate: 'ABC-1234',
          licenseNumber: 'N01-23-456789',
          address: 'Pulilan Hub, Pulilan, Bulacan',
          city: 'Pulilan',
          state: 'Bulacan',
          country: 'Philippines',
          postalCode: '3005',
          bankName: 'BPI',
          payoutRate: 80,
          payoutCycle: 'Weekly',
          status: 'Active',
          isOnDuty: true,
          deliveries: 120,
          rating: 5.0,
        },
        $setOnInsert: {
          statusHistory: [{ status: 'Active', changedAt: new Date(), reason: 'Official Demo Rider Initialization' }],
        }
      },
      { upsert: true, new: true }
    );
    console.log('Seeded Demo Rider:', rider.email, `(${rider.registrationId})`);

    console.log('All 3 official demo accounts successfully seeded into Web MongoDB Atlas.');
  } catch (err) {
    console.error('Seeding Error:', err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

seedOfficialDemoAccounts();
