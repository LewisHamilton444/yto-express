// Shared synthetic dataset — single source of truth for every place this
// app shows demo data instead of live records:
//   - scripts/qa/seedServer.mjs (npm run dev:mock / npm run qa:layout):
//     a local mock API server, never deployed, never touches real MongoDB.
//   - src/services/api.js (VITE_DEMO_MODE=1, opt-in, build-time only):
//     transparently fills an empty real API response on a live deployment
//     that has no records yet (pre-launch UAT), paired with the visible
//     "Demo Data" banner in AnalyticsDashboard.jsx so it's never mistaken
//     for real records. Off by default — a plain build never activates it.
//     See AGENTS2.md §7 (the Web app is REAL-only outside this opt-in flag).
//
// Pure and isomorphic on purpose: no Node built-ins (fs/http/path), no
// browser globals (window/document) — this file is bundled into the Vite
// frontend build AND imported directly by the Node seed server, so it can
// only use plain JS (Math/Date/Array/String).
//
// Every row carries only fields declared on the matching Mongoose schema
// (server/models/*.js) — real documents strip undeclared fields on save
// (strict mode), so a convenience field here that doesn't exist there would
// misrepresent what the real API actually returns. Rows are LINKED the way
// the real bridge links them: parcels reference a real seller (sellerId)
// and customer (recipientEmail/customerEnterpriseId), and every parcel that
// has moved past Pending carries the assigned rider's registrationId in
// riderId. Riders carry registrationId + isOnDuty but no stored
// successRate/deliveries (the dashboard must compute both from the linked
// parcels). Issues link back to a real parcel's trackingNumber and derive
// productName/productCategory/eta the same way GET /api/issues does.

// ── Deterministic pseudo-random rows ────────────────────────────────────
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const rnd = lcg(20260903);
function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
function pad(n, len) { return String(n).padStart(len, '0'); }
function daysAgoISO(days, extraMs = 0) { return new Date(Date.now() - days * 86400000 + extraMs).toISOString(); }

const PARCEL_STATUSES  = ['Delivered', 'In Transit', 'Pending', 'Out for Delivery', 'Cancelled'];
const RIDER_STATUSES   = ['Active', 'On Delivery', 'Idle', 'Offline'];
const ISSUE_STATUSES   = ['Open', 'Under Investigation', 'Resolved', 'Closed'];
const ISSUE_CATEGORIES = [
  'Damaged Package', 'Delayed Delivery', 'Wrong Item Received', 'Lost Package',
  'Courier Behavior', 'Incorrect Address', 'Billing / Payment Issue', 'Other',
];

const PLACES = [
  { city: 'Pulilan',       province: 'Bulacan' },
  { city: 'Baliuag',       province: 'Bulacan' },
  { city: 'Malolos',       province: 'Bulacan' },
  { city: 'Meycauayan',    province: 'Bulacan' },
  { city: 'Quezon City',   province: 'Metro Manila' },
  { city: 'Makati',        province: 'Metro Manila' },
  { city: 'Pasig',         province: 'Metro Manila' },
  { city: 'Caloocan',      province: 'Metro Manila' },
  { city: 'Manila',        province: 'Metro Manila' },
  { city: 'Angeles',       province: 'Pampanga' },
  { city: 'San Fernando',  province: 'Pampanga' },
  { city: 'Cabanatuan',    province: 'Nueva Ecija' },
];
const COORDS = {
  Pulilan: [14.9085, 120.8545], Baliuag: [14.9563, 120.8994], Malolos: [14.8433, 120.8113],
  Meycauayan: [14.7365, 120.9581], 'Quezon City': [14.6760, 121.0437], Makati: [14.5547, 121.0244],
  Pasig: [14.5764, 121.0851], Caloocan: [14.6488, 120.9673], Manila: [14.5995, 120.9842],
  Angeles: [15.1450, 120.5930], 'San Fernando': [15.0286, 120.6898], Cabanatuan: [15.4864, 120.9694],
};
const STREETS    = ['Rizal', 'Mabini', 'Bonifacio', 'Quezon', 'Luna', 'Aguinaldo', 'Del Pilar'];
const BARANGAYS   = ['Poblacion', 'San Jose', 'Santa Maria', 'San Isidro', 'San Roque', 'Sto. Niño'];
const BANKS       = ['BDO Unibank', 'BPI', 'Metrobank', 'Landbank', 'UnionBank', 'RCBC', 'Security Bank'];
const ID_TYPES    = ['National ID', "Driver's License", 'Passport', 'UMID', 'PhilHealth ID'];
const VEHICLES    = ['Motorcycle', 'Tricycle', 'E-Bike', 'Van'];

const RIDER_NAMES = ['Marco Aquino', 'Nina Ramos', 'Paolo Fernandez', 'Gina Salazar', 'Leo Ramirez', 'Sofia Diaz', 'Miguel Ocampo', 'Ava Cruz', 'Josh Reyes', 'Ella Navarro', 'Rafael Lim', 'Zoe Tan'];
const CUSTOMER_NAMES = ['Liza Villanueva', 'Marco Aquino Jr.', 'Nina Ramos-Cruz', 'Paolo Fernandez', 'Gina Salazar', 'Leo Ramirez', 'Ramon Bautista', 'Nina Delos Santos', 'Marco Aquino', 'Carla Torres', 'Luis Mendoza', 'Ana Garcia', 'Pedro Reyes', 'Maria Santos'];
const SELLER_OWNERS  = ['Juan Dela Cruz', 'Maria Santos', 'Pedro Reyes', 'Ana Garcia', 'Ramil Ocampo', 'Cherry Villaflor', 'Ferdinand Uy', 'Grace Lim'];
const STORE_NAMES    = ['Bulacan Home Essentials', 'QuickTech Gadgets PH', 'Manila Threads Apparel', 'Fresh Harvest Grocers', 'AutoParts Central', 'Bookworm PH', 'StepUp Footwear Co.', 'Crystal Care Glassware'];

const ITEM_CATALOG = [
  { name: 'Wireless Earbuds',            category: 'Electronics' },
  { name: "Men's Denim Jacket",          category: 'Apparel' },
  { name: 'Notarized Legal Documents',   category: 'Documents' },
  { name: 'Ceramic Mug Set (4pc)',       category: 'Fragile Glassware' },
  { name: 'Motorcycle Brake Pads',       category: 'Spare Parts' },
  { name: 'Frozen Seafood Pack',         category: 'Perishables' },
  { name: 'Textbook Bundle (Grade 10)',  category: 'Books' },
  { name: 'Running Shoes, Size 9',       category: 'Footwear' },
  { name: 'Bluetooth Speaker',           category: 'Electronics' },
  { name: "Women's Blouse Set",          category: 'Apparel' },
];
const PACKAGE_TYPES = ['Standard', 'Express', 'Fragile Handling', 'Document Courier'];

function personAddress(i) {
  const place = PLACES[i % PLACES.length];
  return {
    address: `${100 + i} ${STREETS[i % STREETS.length]} St., Brgy. ${BARANGAYS[i % BARANGAYS.length]}`,
    city: place.city,
    state: place.province,
    country: 'Philippines',
    postalCode: String(3000 + (i * 7) % 999),
  };
}

function statusHistoryEntry(status, daysAgo, reason) {
  return [{ status, changedAt: daysAgoISO(daysAgo), reason }];
}

// ── Riders ───────────────────────────────────────────────────────────────
function makeRiders(n) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const pending = i > n - 2; // last 2 riders are still awaiting approval
    const loc = personAddress(i);
    const registrationId = `YTOR2026${pad(i, 4)}`;
    out.push({
      _id: `QA-RIDER-${pad(i, 4)}`,
      registrationId,
      accountNumber: pad(9100000000 + i * 137, 10),
      riderName: RIDER_NAMES[i - 1] || `Rider ${i}`,
      vehicleType: pick(VEHICLES),
      email: `rider.qa${i}@yto.com`,
      phone: '0917' + pad(1000000 + i * 137, 7),
      ...loc,
      licenseNumber: `N0${1 + (i % 9)}-${pad(20 + i, 2)}-${pad(400000 + i * 53, 6)}`,
      vehiclePlate: `${['ABC', 'NDR', 'QRS', 'LMV'][i % 4]}-${pad(1000 + i, 4)}`,
      emergencyContactName: CUSTOMER_NAMES[(i + 3) % CUSTOMER_NAMES.length],
      emergencyContactPhone: '0918' + pad(2000000 + i * 211, 7),
      bankName: pick(BANKS),
      payoutRate: [70, 75, 80, 85][i % 4],
      payoutCycle: pick(['Weekly', 'Bi-Weekly']),
      assignedHub: 'Pulilan Central Hub',
      status: pending ? 'Pending' : pick(RIDER_STATUSES),
      isOnDuty: !pending && i % 3 !== 0,
      // Deliberately no stored successRate/deliveries: the dashboard and
      // rider-ranking views must compute both from the linked parcels below.
      rating: Math.round((rnd() * 2 + 3.5) * 10) / 10,
      statusHistory: statusHistoryEntry(pending ? 'Pending' : 'Active', n - i + 5, pending ? 'Application submitted, awaiting document review' : 'Rider account approved'),
      createdAt: daysAgoISO(n - i + 5),
      updatedAt: daysAgoISO(Math.floor(rnd() * 3)),
    });
  }
  return out;
}

// ── Sellers ──────────────────────────────────────────────────────────────
function makeSellers(n) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const pending = i === n; // last seller is mid-verification
    const loc = personAddress(i + 4);
    const registrationId = `YTOS2026${pad(i, 4)}`;
    out.push({
      _id: `QA-SELL-${pad(i, 4)}`,
      registrationId,
      accountNumber: pad(9200000000 + i * 317, 10),
      fullName: SELLER_OWNERS[i - 1] || `Owner ${i}`,
      storeName: STORE_NAMES[i - 1] || `QA Store ${i}`,
      warehouseAddress: `${loc.address}, ${loc.city}`,
      operatingHours: '8:00 AM - 6:00 PM, Mon-Sat',
      idType: pick(ID_TYPES),
      idNumber: `PH-ID-${pad(90000 + i * 37, 5)}`,
      email: `seller.qa${i}@yto.com`,
      phone: '0919' + pad(3000000 + i * 317, 7),
      ...loc,
      bankName: pick(BANKS),
      commissionRate: [8, 10, 12][i % 3],
      paymentCycle: pick(['Weekly', 'Bi-Weekly', 'Monthly']),
      status: pending ? 'PENDING_VERIFICATION' : 'ACTIVE',
      statusHistory: statusHistoryEntry(pending ? 'PENDING_VERIFICATION' : 'ACTIVE', n - i + 6, pending ? 'Submitted for KYC review' : 'Merchant account approved'),
      createdAt: daysAgoISO(n - i + 6),
      updatedAt: daysAgoISO(Math.floor(rnd() * 4)),
    });
  }
  return out;
}

// ── Customers ────────────────────────────────────────────────────────────
function makeCustomers(n) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const loc = personAddress(i + 8);
    out.push({
      _id: `QA-CUST-${pad(i, 4)}`,
      customerId: `YTOC2026${pad(i, 4)}`,
      fullName: CUSTOMER_NAMES[i - 1] || `Customer ${i}`,
      email: `customer.qa${i}@gmail.com`,
      phone: '0918' + pad(2000000 + i * 211, 7),
      address: loc.address,
      city: loc.city,
      deliveryInstructions: pick(['Leave with guard', 'Call upon arrival', 'Ring doorbell twice', '']),
      status: i % 11 === 0 ? 'Inactive' : 'Active',
      source: 'mobile-app',
      statusHistory: statusHistoryEntry('Active', n - i + 7, 'Account created via mobile app'),
      createdAt: daysAgoISO(n - i + 7),
      updatedAt: daysAgoISO(Math.floor(rnd() * 5)),
    });
  }
  return out;
}

// ── Parcels (linked to sellers, customers, riders) ──────────────────────
function makeParcels(n, riders, sellers, customers) {
  const activeRiders = riders.filter((r) => r.status !== 'Pending');
  const out = [];
  for (let i = 1; i <= n; i++) {
    const status = pick(PARCEL_STATUSES);
    const daysAgo = Math.floor(rnd() * 12) + 1;
    const seller = sellers[(i - 1) % sellers.length];
    const customer = customers[(i - 1) % customers.length];
    const item = ITEM_CATALOG[(i - 1) % ITEM_CATALOG.length];
    const origin = seller.city;
    const dest = customer.city;
    const destCoord = COORDS[dest] || COORDS.Pulilan;

    const createdAt = daysAgoISO(daysAgo);
    const events = [{ time: createdAt, event: 'Parcel registered by merchant', location: origin, status: 'Pending' }];
    let updatedAt = createdAt;

    const rider = status === 'Pending' ? null : activeRiders[(i - 1) % activeRiders.length];

    if (status !== 'Pending') {
      const pickedUpAt = daysAgoISO(daysAgo, 3600000);
      events.push({ time: pickedUpAt, event: 'Picked up by courier', location: 'Pulilan Main Hub', status: 'In Transit' });
      updatedAt = pickedUpAt;
    }
    if (status === 'Out for Delivery' || status === 'Delivered') {
      const outAt = daysAgoISO(daysAgo, 7200000);
      events.push({ time: outAt, event: 'Out for delivery', location: dest, status: 'Out for Delivery' });
      updatedAt = outAt;
    }
    if (status === 'Delivered') {
      const deliveredAt = new Date(Date.now() - Math.floor(rnd() * 600000)).toISOString();
      events.push({ time: deliveredAt, event: 'Delivered to recipient', location: dest, status: 'Delivered' });
      updatedAt = deliveredAt;
    }
    if (status === 'Cancelled') {
      const cancelAt = daysAgoISO(daysAgo, 5400000);
      events.push({ time: cancelAt, event: 'Cancelled by merchant', location: origin, status: 'Cancelled' });
      updatedAt = cancelAt;
    }

    const paymentMode = pick(['COD', 'Prepaid']);
    const declaredValue = Math.round(rnd() * 9000 + 500);
    const codAmount = paymentMode === 'COD' ? declaredValue : 0;
    const trackingNumber = `YTO-QA-${1000 + i}`;

    out.push({
      _id: `QA-PARCEL-${pad(i, 4)}`,
      trackingNumber,
      senderName: seller.fullName,
      senderPhone: seller.phone,
      senderEmail: seller.email,
      receiverName: customer.fullName,
      receiverPhone: customer.phone,
      recipientEmail: customer.email,
      item: item.name,
      packageCategory: item.category,
      packageType: pick(PACKAGE_TYPES),
      packageCount: 1 + (i % 3 === 0 ? 1 : 0),
      weight: `${(rnd() * 9 + 0.5).toFixed(1)} kg`,
      value: `₱${declaredValue.toLocaleString('en-PH')}`,
      dimensions: { length: 20 + (i % 10), width: 15 + (i % 8), height: 8 + (i % 6) },
      origin, destination: dest,
      status,
      riderId: rider ? rider.registrationId : '',
      sellerId: seller.registrationId,
      podPhoto: '',
      paymentMode,
      codAmount,
      deliveryFee: [80, 120, 150, 220, 350][i % 5],
      notes: i % 6 === 0 ? 'Fragile — handle with care.' : '',
      estimatedDeliveryDate: daysAgoISO(daysAgo - 2),
      actualDeliveryDate: status === 'Delivered' ? updatedAt : null,
      qrPayload: `YTOQR1|${trackingNumber}|${seller.registrationId}|${customer.customerId}`,
      sellerEnterpriseId: seller.registrationId,
      customerEnterpriseId: customer.customerId,
      riderLat: rider && status !== 'Cancelled' ? destCoord[0] + (rnd() - 0.5) * 0.02 : null,
      riderLng: rider && status !== 'Cancelled' ? destCoord[1] + (rnd() - 0.5) * 0.02 : null,
      trackingGeofence: rider ? { kind: 'POD_RING', center: { lat: destCoord[0], lng: destCoord[1] }, radiusMeters: 100 } : undefined,
      events,
      createdAt,
      updatedAt,
    });
  }
  return out;
}

// ── Issues (linked to real parcels the same way GET /api/issues derives) ─
function makeIssues(n, parcels) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const parcel = parcels[(i * 3) % parcels.length]; // spread across the parcel list
    const status = pick(ISSUE_STATUSES);
    const createdAt = daysAgoISO(0, -i * 3600000);
    out.push({
      _id: `QA-ISSUE-${pad(i, 4)}`,
      ticketId: `TICK-2026-${pad(10000 + i, 5)}`,
      trackingNumber: parcel.trackingNumber,
      category: pick(ISSUE_CATEGORIES),
      description: `${parcel.receiverName} reported an issue with shipment ${parcel.trackingNumber} (${parcel.item}). Requesting follow-up from support.`,
      evidenceImages: [],
      // The reporter is the parcel's actual recipient, same as a real ticket.
      reporterName: parcel.receiverName,
      reporterEmail: parcel.recipientEmail,
      reporterPhone: parcel.receiverPhone,
      // Derived the same way GET /api/issues backfills a legacy row.
      productName: parcel.item,
      productCategory: parcel.packageType,
      eta: parcel.estimatedDeliveryDate,
      reporterRole: 'customer',
      status,
      adminNotes: status === 'Resolved' || status === 'Closed' ? 'Resolved after confirming with the assigned rider.' : '',
      resolvedAt: status === 'Resolved' || status === 'Closed' ? daysAgoISO(0, -(i * 3600000) + 7200000) : null,
      createdAt,
      updatedAt: createdAt,
    });
  }
  return out;
}

// ── Admin accounts ───────────────────────────────────────────────────────
function makeAccounts(n) {
  const roles = ['admin', 'moderator'];
  const out = [];
  for (let i = 1; i <= n; i++) {
    out.push({
      _id: `QA-ACC-${i}`,
      adminId: `YTOA2026${pad(i, 4)}`,
      name: i === 1 ? 'QA Super Admin' : `Admin ${i}`,
      email: i === 1 ? 'qa.superadmin@yto.com' : `admin.qa${i}@yto.com`,
      role: i === 1 ? 'super_admin' : pick(roles),
      accountType: 'Admin Account',
      status: 'Active',
      createdAt: daysAgoISO(n - i + 10),
    });
  }
  return out;
}

// ── ParcelLocation (one live pin per parcel that has left the warehouse) ─
function makeParcelLocations(parcels) {
  return parcels
    .filter((p) => p.riderId)
    .map((p, idx) => {
      const [lat, lng] = [p.riderLat, p.riderLng].every(Number.isFinite)
        ? [p.riderLat, p.riderLng]
        : (COORDS[p.destination] || COORDS.Pulilan);
      const type = p.status === 'Delivered' ? 'Delivery Address' : p.status === 'Out for Delivery' ? 'In Transit' : 'Hub';
      return {
        _id: `QA-PL-${pad(idx + 1, 4)}`,
        parcelId: p.trackingNumber,
        lat: String(lat.toFixed(6)),
        lng: String(lng.toFixed(6)),
        location: `${p.destination} — ${type}`,
        type,
        status: p.status === 'Cancelled' ? 'Idle' : 'Active',
        geofence: p.status === 'Delivered' ? 'Inside' : 'Outside',
        notes: '',
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      };
    });
}

// ── Activity log (mirrors GET /api/activity-log's shape, not its full query) ─
function buildActivityLog(customers, sellers, riders, parcels, issues, accounts) {
  const events = [];

  customers.forEach((c) => {
    events.push({ role: 'customer', actorName: c.fullName, actorId: c.customerId, type: 'registration', status: c.status, description: `${c.fullName} registered as a customer`, timestamp: c.createdAt });
    (c.statusHistory || []).forEach((sh) => events.push({ role: 'customer', actorName: c.fullName, actorId: c.customerId, type: 'status_change', status: sh.status, description: sh.reason, timestamp: sh.changedAt }));
  });

  sellers.forEach((s) => {
    events.push({ role: 'seller', actorName: s.fullName, actorId: s.registrationId, type: 'registration', status: s.status, description: `${s.fullName} registered as a merchant (${s.storeName})`, timestamp: s.createdAt });
    (s.statusHistory || []).forEach((sh) => events.push({ role: 'seller', actorName: s.fullName, actorId: s.registrationId, type: 'status_change', status: sh.status, description: sh.reason, timestamp: sh.changedAt }));
  });

  riders.forEach((r) => {
    events.push({ role: 'rider', actorName: r.riderName, actorId: r.registrationId, type: 'registration', status: r.status, description: `${r.riderName} registered as a courier (${r.vehicleType} ${r.vehiclePlate})`, timestamp: r.createdAt });
    (r.statusHistory || []).forEach((sh) => events.push({ role: 'rider', actorName: r.riderName, actorId: r.registrationId, type: 'status_change', status: sh.status, description: sh.reason, timestamp: sh.changedAt }));
  });

  parcels.forEach((p) => {
    events.push({ role: 'seller', actorName: p.senderName, actorId: p.sellerEnterpriseId, type: 'order', status: p.status, description: `Merchant ${p.senderName} generated package ${p.trackingNumber} for ${p.receiverName} (${p.item})`, timestamp: p.createdAt });
    events.push({ role: 'customer', actorName: p.receiverName, actorId: p.customerEnterpriseId, type: 'order', status: p.status, description: `Shipment ${p.trackingNumber} destination: ${p.destination} (${p.item})`, timestamp: p.createdAt });
    if (p.riderId) {
      const rider = riders.find((r) => r.registrationId === p.riderId);
      (p.events || []).forEach((ev) => events.push({
        role: 'rider',
        actorName: rider ? rider.riderName : 'Courier',
        actorId: p.riderId,
        type: 'delivery',
        status: ev.status || p.status,
        description: `Parcel ${p.trackingNumber}: ${ev.event} at ${ev.location}`,
        timestamp: ev.time,
      }));
    }
  });

  issues.forEach((i) => {
    events.push({ role: 'customer', actorName: i.reporterName, actorId: i.ticketId, type: 'issue', status: i.status, description: `Issue ticket ${i.ticketId} filed for tracking ${i.trackingNumber}: ${i.category} - ${i.description.slice(0, 70)}`, timestamp: i.createdAt });
  });

  accounts.forEach((a) => {
    events.push({ role: 'admin', actorName: a.name, actorId: a.adminId, type: 'registration', status: a.status, description: `${a.name} provisioned as ${a.role}`, timestamp: a.createdAt });
  });

  return events
    .filter((e) => e.timestamp)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 200);
}

// ── Admin notifications ──────────────────────────────────────────────────
function buildNotifications(parcels, issues, sellers) {
  const out = [];
  let n = 0;

  parcels.slice(0, 10).forEach((p) => {
    n++;
    const read = n > 3;
    out.push({
      _id: `QA-NOTIF-${pad(n, 4)}`,
      notificationId: `QA-NOTIF-${pad(n, 4)}`,
      role: 'admin',
      title: p.status === 'Delivered' ? 'Parcel Delivered' : 'New Parcel Booked',
      message: `${p.trackingNumber} (${p.item}) — ${p.senderName} to ${p.receiverName}, status: ${p.status}.`,
      type: p.status === 'Delivered' ? 'order_update' : 'new_order',
      relatedId: p.trackingNumber,
      source: 'mobile-app',
      read,
      readAt: read ? p.updatedAt : null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    });
  });

  issues.slice(0, 4).forEach((i) => {
    n++;
    const read = n > 3 && i.status !== 'Open';
    out.push({
      _id: `QA-NOTIF-${pad(n, 4)}`,
      notificationId: `QA-NOTIF-${pad(n, 4)}`,
      role: 'admin',
      title: 'Issue Ticket Filed',
      message: `${i.ticketId}: ${i.category} — ${i.reporterName} (${i.trackingNumber})`,
      type: 'issue_opened',
      relatedId: i.ticketId,
      source: 'mobile-app',
      read,
      readAt: read ? i.updatedAt : null,
      createdAt: i.createdAt,
      updatedAt: i.createdAt,
    });
  });

  const pendingSellers = sellers.filter((s) => s.status === 'PENDING_VERIFICATION');
  pendingSellers.forEach((s) => {
    n++;
    out.push({
      _id: `QA-NOTIF-${pad(n, 4)}`,
      notificationId: `QA-NOTIF-${pad(n, 4)}`,
      role: 'admin',
      title: 'Seller Verification Pending',
      message: `${s.fullName} (${s.storeName}) submitted documents for KYC review.`,
      type: 'system_alert',
      relatedId: s.registrationId,
      source: 'system',
      read: false,
      readAt: null,
      createdAt: s.createdAt,
      updatedAt: s.createdAt,
    });
  });

  return out.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// ── Assemble the dataset once (order matters: parcels/issues link back) ──
const riders    = makeRiders(12);
const sellers   = makeSellers(8);
const customers = makeCustomers(14);
const parcels   = makeParcels(40, riders, sellers, customers);
const issues    = makeIssues(14, parcels);
const accounts  = makeAccounts(4);
const parcelLocations = makeParcelLocations(parcels);
const activityLog = buildActivityLog(customers, sellers, riders, parcels, issues, accounts);
const notifications = buildNotifications(parcels, issues, sellers);

const deliveredCount      = parcels.filter((p) => p.status === 'Delivered').length;
const inTransitCount      = parcels.filter((p) => p.status === 'In Transit').length;
const outForDeliveryCount = parcels.filter((p) => p.status === 'Out for Delivery').length;
const pendingCount        = parcels.filter((p) => p.status === 'Pending').length;
const cancelledCount      = parcels.filter((p) => p.status === 'Cancelled').length;
const activeRidersCount   = riders.filter((r) => r.status === 'Active').length;
const avgRiderRating      = riders.length ? Number((riders.reduce((s, r) => s + r.rating, 0) / riders.length).toFixed(1)) : 0;
const pendingVerifications = sellers.filter((s) => s.status === 'PENDING_VERIFICATION').length + riders.filter((r) => r.status === 'Pending').length;
const todayKey = new Date().toDateString();
const peakToday = parcels.filter((p) => new Date(p.createdAt).toDateString() === todayKey).length;
const revenue = parcels.reduce((sum, p) => sum + (p.deliveryFee || 0), 0);

export const DEMO_DASHBOARD_STATS = {
  // Fields GET /api/dashboard/stats actually returns (AnalyticsDashboard.jsx
  // reads these by name, falling back to computing from the raw collections
  // when a field is missing — keeping the names exact exercises that path).
  totalParcels: parcels.length,
  deliveredCount,
  deliverySuccessPct: parcels.length ? Number(((deliveredCount / parcels.length) * 100).toFixed(1)) : 0,
  totalRiders: riders.length,
  activeRidersCount,
  avgRiderRating,
  totalDeliveries: deliveredCount,
  totalSellers: sellers.length,
  // Extra breakdown fields some widgets read directly.
  totalCustomers: customers.length,
  totalIssues: issues.length,
  inTransit: inTransitCount,
  outForDelivery: outForDeliveryCount,
  pending: pendingCount,
  cancelled: cancelledCount,
  pendingVerifications,
  peakToday,
  revenue,
  history: [],
};

export const DEMO_RIDERS = riders;
export const DEMO_SELLERS = sellers;
export const DEMO_CUSTOMERS = customers;
export const DEMO_PARCELS = parcels;
export const DEMO_ISSUES = issues;
export const DEMO_ACCOUNTS = accounts;
export const DEMO_PARCEL_LOCATIONS = parcelLocations;
export const DEMO_ACTIVITY_LOG = activityLog;
export const DEMO_NOTIFICATIONS = notifications;

// Case-insensitive exact-match filter, mirroring the real ^status$/i regex
// Server.js applies on GET /api/sellers and GET /api/riders.
export function filterByStatus(rows, statusQuery) {
  if (!statusQuery) return rows;
  const escaped = statusQuery.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${escaped}$`, 'i');
  return rows.filter((r) => re.test(r.status || ''));
}
