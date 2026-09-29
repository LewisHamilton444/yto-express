// Controlled end-to-end bridge write test (QA harness, disposable test data).
// Creates a test seller + customer + parcel through the REAL bridge, verifies
// the Web-minted identity artifacts land on the mobile records, then deletes
// every row it created from BOTH databases.
//
// Two mongoose instances are required: the Web models were compiled against
// server/node_modules/mongoose and the mobile models against the mobile
// backend's own copy. Handing one's schema to the other throws
// "schema._getDocumentMiddleware is not a function".
const fs = require('node:fs');
const path = require('node:path');
const dns = require('node:dns');
dns.setServers(['8.8.8.8', '8.8.4.4']); // Atlas SRV lookups fail without this here

const WEB_DIR = 'C:/Users/ADMIN/React_Projects/YTO Latest/my-react-app';
const MOB_DIR = 'C:/Users/ADMIN/AndroidStudioProjects/YTO_Express_App/yto_express_backend';

const mongooseWeb = require(path.join(WEB_DIR, 'server/node_modules/mongoose'));
const mongooseMob = require(path.join(MOB_DIR, 'node_modules/mongoose'));

const parse = (p) => {
  const o = {};
  for (const l of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) o[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return o;
};

const webEnv = parse(path.join(WEB_DIR, 'server/.env'));
const mobEnv = parse(path.join(MOB_DIR, '.env'));

process.env.WEB_BACKEND_URL = mobEnv.WEB_BACKEND_URL;
process.env.WEB_BRIDGE_API_KEY = mobEnv.WEB_BRIDGE_API_KEY;
const Bridge = require(path.join(MOB_DIR, 'utils/BridgeClient.js'));

const userSchema = require(path.join(MOB_DIR, 'models/User.js')).schema;
const shipSchema = require(path.join(MOB_DIR, 'models/Shipment.js')).schema;

// Every row this harness ever creates matches these prefixes, so cleanup is a
// prefix sweep and can never touch a real record.
const EMAIL_RE = /^qa\.e2e\./;
const TRACK_RE = /^YTOQA\d+$/;

const TS = Date.now();
const SELLER_EMAIL = 'qa.e2e.seller.' + TS + '@yto-test.example.com';
const CUST_EMAIL = 'qa.e2e.customer.' + TS + '@yto-test.example.com';
const TRACKING = 'YTOQA' + TS;

let webConn = null;
let mobConn = null;
const rep = {};

async function main() {
  console.log('TEST SELLER  ', SELLER_EMAIL);
  console.log('TEST CUSTOMER', CUST_EMAIL);
  console.log('TEST TRACKING', TRACKING);

  console.log('\n=== STEP 1+2: mobile -> web sync-user ===');
  let r = await Bridge.syncUser({ name: 'QA E2E Seller', email: SELLER_EMAIL, role: 'seller', phone: '09171112222', storeName: 'QA Test Store' });
  rep.sellerEnt = r.data && r.data.data ? r.data.data.enterpriseId : null;
  console.log('  seller   success:', r.success, ' enterpriseId:', rep.sellerEnt);
  r = await Bridge.syncUser({ name: 'QA E2E Customer', email: CUST_EMAIL, role: 'customer', phone: '09173334444', address: 'Baliuag, Bulacan' });
  rep.custEnt = r.data && r.data.data ? r.data.data.enterpriseId : null;
  console.log('  customer success:', r.success, ' enterpriseId:', rep.custEnt);

  console.log('\n=== STEP 3: mobile -> web sync-parcel ===');
  const shipmentData = {
    trackingId: TRACKING,
    sellerId: new mongooseMob.Types.ObjectId().toString(),
    status: 'Pending',
    sender: { name: 'QA E2E Seller', phone: '09171112222', email: SELLER_EMAIL, address: 'Pulilan, Bulacan', storeName: 'QA Test Store' },
    recipient: { name: 'QA E2E Customer', phone: '09173334444', email: CUST_EMAIL, address: 'Baliuag, Bulacan' },
    package: { weight: 2.5, count: 1, category: 'Electronics', productName: 'QA Test Item', type: 'Standard', paymentMode: 'Prepaid', codAmount: 0, deliveryFee: 110, dimensions: { length: 10, width: 10, height: 10 } },
    pickupCoordinates: { coordinates: [120.8073, 14.9027] },
    deliveryCoordinates: { coordinates: [120.83, 14.95] },
  };
  r = await Bridge.syncParcel(shipmentData);
  const wd = (r.data && r.data.data) ? r.data.data : {};
  rep.qrPayload = wd.qrPayload;
  rep.geofence = wd.trackingGeofence;
  rep.webSellerEnt = wd.sellerEnterpriseId;
  rep.webCustEnt = wd.customerEnterpriseId;
  console.log('  success         :', r.success);
  console.log('  qrPayload       :', rep.qrPayload);
  console.log('  sellerEntId     :', rep.webSellerEnt);
  console.log('  customerEntId   :', rep.webCustEnt);
  console.log('  trackingGeofence:', JSON.stringify(rep.geofence));

  console.log('\n=== STEP 4: persist on MOBILE (mirrors authController:221 + shipmentController:443) ===');
  mobConn = await mongooseMob.createConnection(mobEnv.MONGODB_URI, { serverSelectionTimeoutMS: 15000 }).asPromise();
  const MUser = mobConn.model('User', userSchema);
  const MShip = mobConn.model('Shipment', shipSchema);
  const u = await MUser.create({ name: 'QA E2E Seller', email: SELLER_EMAIL, role: 'seller', phone: '09171112222', password: 'qa-only-not-a-real-account' });
  await MUser.findByIdAndUpdate(u._id, { $set: { webEnterpriseId: rep.sellerEnt } });
  const sh = await MShip.create({
    trackingId: TRACKING, sellerId: u._id, status: 'Pending',
    sender: { name: 'QA E2E Seller', phone: '09171112222', email: SELLER_EMAIL, address: 'Pulilan, Bulacan' },
    recipient: { name: 'QA E2E Customer', phone: '09173334444', email: CUST_EMAIL, address: 'Baliuag, Bulacan' },
    package: { weight: 2.5, count: 1, category: 'Electronics', productName: 'QA Test Item', type: 'Standard' },
  });
  const patch = {};
  if (wd.qrPayload) patch.webQrPayload = wd.qrPayload;
  if (wd.trackingGeofence) patch.webTrackingGeofence = wd.trackingGeofence;
  await MShip.findByIdAndUpdate(sh._id, { $set: patch });

  console.log('\n=== STEP 5: VERIFY PERSISTED ON MOBILE ===');
  const u2 = await MUser.findById(u._id).lean();
  const s2 = await MShip.findById(sh._id).lean();
  console.log('  User.webEnterpriseId        :', u2.webEnterpriseId);
  console.log('  Shipment.webQrPayload       :', s2.webQrPayload);
  console.log('  Shipment.webTrackingGeofence:', JSON.stringify(s2.webTrackingGeofence));

  const okEnt = /^YTOS2026\d{4}$/.test(String(rep.sellerEnt || '')) && /^YTOC2026\d{4}$/.test(String(rep.custEnt || ''));
  const okQr = rep.qrPayload === ('YTOQR1|' + TRACKING + '|' + rep.webSellerEnt + '|' + rep.webCustEnt);
  const g = rep.geofence || {};
  const okGeo = g.kind === 'POD_RING' && g.center && g.center.lat === 14.95 && g.center.lng === 120.83 && g.radiusMeters === 100;
  const okPersist = u2.webEnterpriseId === rep.sellerEnt && s2.webQrPayload === rep.qrPayload && !!s2.webTrackingGeofence;

  console.log('\n  ASSERT enterpriseId format YTOS/YTOC<YYYY><4-digit> :', okEnt);
  console.log('  ASSERT qrPayload = YTOQR1|tracking|sellerEnt|custEnt:', okQr);
  console.log('  ASSERT geofence  = POD_RING center(14.95,120.83) 100m:', okGeo);
  console.log('  ASSERT persisted on mobile User + Shipment           :', okPersist);

  fs.writeFileSync(
    path.join(WEB_DIR, '_tmp_edit/observed-bridge-artifacts.json'),
    JSON.stringify({
      trackingNumber: TRACKING,
      qrPayload: rep.qrPayload,
      sellerEnterpriseId: rep.webSellerEnt,
      customerEnterpriseId: rep.webCustEnt,
      trackingGeofence: rep.geofence,
    }, null, 2)
  );
  console.log('\n  artifacts -> _tmp_edit/observed-bridge-artifacts.json');
}

async function cleanup() {
  console.log('\n=== STEP 6: CLEANUP (prefix sweep, both databases) ===');
  try {
    const c = await mongooseMob.createConnection(mobEnv.MONGODB_URI, { serverSelectionTimeoutMS: 15000 }).asPromise();
    const MUser = c.model('User', userSchema);
    const MShip = c.model('Shipment', shipSchema);
    const a = await MUser.deleteMany({ email: EMAIL_RE });
    const b = await MShip.deleteMany({ trackingId: TRACK_RE });
    console.log('  mobile User deleted:', a.deletedCount, ' Shipment deleted:', b.deletedCount);
    await c.close();
  } catch (e) {
    console.log('  mobile cleanup err:', e.message);
  }
  try {
    webConn = await mongooseWeb.createConnection(webEnv.MONGO_URI, { serverSelectionTimeoutMS: 15000 }).asPromise();
    const S = webConn.model('Seller', require(path.join(WEB_DIR, 'server/models/Seller.js')).schema);
    const C = webConn.model('Customer', require(path.join(WEB_DIR, 'server/models/Customer.js')).schema);
    const P = webConn.model('Parcel', require(path.join(WEB_DIR, 'server/models/Parcel.js')).schema);
    const PL = webConn.model('ParcelLocation', require(path.join(WEB_DIR, 'server/models/ParcelLocation.js')).schema);
    const a = await S.deleteMany({ email: EMAIL_RE });
    const b = await C.deleteMany({ email: EMAIL_RE });
    const c = await P.deleteMany({ trackingNumber: TRACK_RE });
    const d = await PL.deleteMany({ parcelId: TRACK_RE });
    console.log('  web Seller/Customer/Parcel/ParcelLocation deleted:', a.deletedCount, b.deletedCount, c.deletedCount, d.deletedCount);
    console.log('  FINAL WEB DB  Seller:' + await S.countDocuments({}) + '  Customer:' + await C.countDocuments({}) + '  Parcel:' + await P.countDocuments({}) + '  ParcelLocation:' + await PL.countDocuments({}));
    await webConn.close();
  } catch (e) {
    console.log('  web cleanup err:', e.message);
  }
}

main()
  .catch((e) => console.log('TEST ERROR:', e.message))
  .then(cleanup)
  .then(() => process.exit(0));
