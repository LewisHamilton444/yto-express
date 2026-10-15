


// ── Shared Seller/Rider data shapes ──────────────────────────────────────────
// The MongoDB documents (see server/models/Seller.js and server/models/Rider.js)
// store flat fields (idNumber, city, state, deliveries, rating, ...). Every page
// that read from `/api/sellers` or `/api/riders` used to map that raw shape into
// its own slightly-different local shape, which is how the field names/labels
// drifted apart across ViewSeller, MonitorRiderStatus and GenerateRiderDataReport.
//
// normalizeSeller()/normalizeRider() are the single place that turns a raw DB
// document into the consistent shape all three pages now render from, so every
// property is always present (no more undefined-prop bugs) and named the same
// way everywhere.

export const SELLER_STATUS = {
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
};

export const RIDER_STATUS = {
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
};

const STATUS_LABELS = {
  PENDING_VERIFICATION: 'Pending Verification',
  ACTIVE: 'Active',
  ARCHIVED: 'Archived',
};

export function formatStatusLabel(status) {
  return STATUS_LABELS[status] || status || 'Unknown';
}

// Accepts legacy/loose values ('Active', 'archived', 'Inactive', undefined, ...)
// and maps them onto the canonical PENDING_VERIFICATION / ACTIVE / ARCHIVED enum.
function normalizeStatus(rawStatus) {
  const value = String(rawStatus || '').trim().toLowerCase();
  if (value === 'archived') return 'ARCHIVED';
  if (value === 'pending_verification' || value === 'pending') return 'PENDING_VERIFICATION';
  if (value === 'inactive') return 'PENDING_VERIFICATION';
  if (value === 'active' || value === '') return 'ACTIVE';
  return value.toUpperCase();
}

// `raw` is usually a flat DB document (address is a plain string, city/state/
// etc. are top-level), but ViewSeller can also be re-seeded with an already-
// normalized object (e.g. a parent component holding onto normalizeSeller's
// own output) where address is already {street, city, ...}. Reading from both
// shapes keeps normalizeSeller safe to call more than once on the same data —
// calling it twice used to make `address.street` hold a whole address object,
// which crashed the page when JSX tried to render it directly.
export function normalizeSeller(raw = {}) {
  const addr = raw.address && typeof raw.address === 'object' ? raw.address : {};
  const addrStr = (typeof raw.address === 'string' && raw.address.trim())
    ? raw.address.trim()
    : (typeof raw.warehouseAddress === 'string' && raw.warehouseAddress.trim()
        ? raw.warehouseAddress.trim()
        : (addr.street || ''));

  const parsedLoc = extractLocationFromAddress(addrStr);
  const streetAddr = addr.street || addrStr || '';
  const city = raw.city || addr.city || parsedLoc.city || '';
  const state = raw.state || addr.state || parsedLoc.province || '';
  const postalCode = raw.postalCode || addr.postalCode || parsedLoc.postalCode || '';
  const country = raw.country || addr.country || parsedLoc.country || '';

  return {
    _id: raw._id,
    sellerId: raw.registrationId || raw.sellerId || raw._id || '—',
    fullName: raw.fullName || raw.displayName || raw.companyName || '',
    // D-16: the app's profile/cover photo, synced over the bridge. Held as
    // whatever the app stored (https or data URL); '' means show the initials
    // avatar instead.
    profilePhotoUrl: raw.profilePhotoUrl || '',
    coverPhotoUrl: raw.coverPhotoUrl || '',
    storeName: raw.storeName || '',
    warehouseAddress: raw.warehouseAddress || addrStr || '',
    operatingHours: raw.operatingHours || '',
    idType: raw.idType || '',
    governmentIdNumber: raw.idNumber || raw.governmentIdNumber || '',
    email: raw.email || '',
    phone: raw.phone || '',
    address: {
      street: streetAddr,
      city,
      state,
      postalCode,
      country,
      fullAddress: addrStr,
    },
    bankName: raw.bankName || '',
    accountNumber: raw.accountNumber || '',
    paymentCycle: raw.paymentCycle || '',
    commissionRate: raw.commissionRate ?? 0,
    documents: Array.isArray(raw.documents) ? raw.documents : [],
    status: normalizeStatus(raw.status),
    raw: raw,
  };
}

// ── Turning an approved pending registration into a real backend record ─────
// ProcessSellerInformation / ProcessRiderInformation review mobile-app
// submissions that only exist in local component state. Approving one must
// actually create the Seller/Rider document in MongoDB — otherwise it never
// shows up in ViewSeller / MonitorRiderStatus / GenerateRiderDataReport, which
// all read live from the backend.

function generateRegistrationId(prefix) {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rand = Math.floor(10000 + Math.random() * 90000);
  return `${prefix}-${ymd}-${rand}`;
}

function generateAccountNumber() {
  return String(Math.floor(1000000000 + Math.random() * 9000000000));
}

// ── Location & Address extraction from a free-text address ─────────────────
export const BULACAN_MUNICIPALITIES = [
  'Pulilan', 'Malolos', 'Baliuag', 'Baliwag', 'Calumpit', 'Plaridel',
  'Guiguinto', 'Bocaue', 'Meycauayan', 'Marilao', 'San Jose del Monte',
  'Santa Maria', 'Angat', 'Norzagaray', 'San Ildefonso', 'San Miguel',
  'San Rafael', 'Pandi', 'Paombong', 'Hagonoy', 'Bulakan', 'Balagtas',
  'Obando', 'Bustos', 'Doña Remedios Trinidad', 'Dona Remedios Trinidad'
];

export const METRO_MANILA_CITIES = [
  'Manila', 'Quezon City', 'Caloocan', 'Las Piñas', 'Las Pinas', 'Makati',
  'Malabon', 'Mandaluyong', 'Marikina', 'Muntinlupa', 'Navotas', 'Parañaque',
  'Paranaque', 'Pasay', 'Pasig', 'San Juan', 'Taguig', 'Valenzuela', 'Pateros'
];

export const PH_PROVINCES = [
  'Bulacan', 'Metro Manila', 'Cavite', 'Laguna', 'Batangas', 'Rizal',
  'Pampanga', 'Bataan', 'Zambales', 'Nueva Ecija', 'Tarlac', 'Pangasinan',
  'Benguet', 'La Union', 'Ilocos Sur', 'Ilocos Norte', 'Isabela', 'Cagayan',
  'Quezon', 'Camarines Sur', 'Cebu', 'Iloilo', 'Davao del Sur', 'Misamis Oriental'
];

export function extractLocationFromAddress(addrString = '') {
  if (!addrString || typeof addrString !== 'string') {
    return { street: '', city: '', province: '', postalCode: '', country: '' };
  }
  const cleanStr = addrString.trim();
  if (!cleanStr) {
    return { street: '', city: '', province: '', postalCode: '', country: '' };
  }

  // Postal code detection: 4 consecutive digits at end or preceded by space/comma
  let postalCode = '';
  const postalMatch = cleanStr.match(/\b(\d{4})\b/);
  if (postalMatch) {
    postalCode = postalMatch[1];
  }

  // Country: only set if explicitly found
  const country = /philippines/i.test(cleanStr) ? 'Philippines' : '';

  // Province detection
  let province = '';
  for (const prov of PH_PROVINCES) {
    const regex = new RegExp(`\\b${prov}\\b`, 'i');
    if (regex.test(cleanStr)) {
      province = prov;
      break;
    }
  }

  // City detection
  let city = '';
  for (const bTown of BULACAN_MUNICIPALITIES) {
    const regex = new RegExp(`\\b${bTown}\\b`, 'i');
    if (regex.test(cleanStr)) {
      city = bTown === 'Baliwag' ? 'Baliuag' : bTown;
      if (!province) province = 'Bulacan';
      break;
    }
  }

  if (!city) {
    for (const mmCity of METRO_MANILA_CITIES) {
      const regex = new RegExp(`\\b${mmCity}\\b`, 'i');
      if (regex.test(cleanStr)) {
        city = mmCity;
        if (!province) province = 'Metro Manila';
        break;
      }
    }
  }

  // Comma-separated parts fallback if not matched by dictionary
  const parts = cleanStr.split(',').map((p) => p.trim()).filter(Boolean);
  if (!city && parts.length >= 2) {
    const lastPart = parts[parts.length - 1].replace(/\b\d{4}\b/, '').replace(/philippines/i, '').trim();
    const secondLast = parts[parts.length - 2].trim();
    if (province && lastPart.toLowerCase().includes(province.toLowerCase())) {
      city = secondLast;
    } else if (parts.length >= 3) {
      city = secondLast;
      if (!province) province = lastPart;
    } else {
      city = lastPart;
    }
  } else if (!city && parts.length === 1) {
    city = parts[0];
  }

  // If city is in Bulacan, ensure province is Bulacan
  if (city && BULACAN_MUNICIPALITIES.some((b) => b.toLowerCase() === city.toLowerCase())) {
    province = 'Bulacan';
  } else if (city && METRO_MANILA_CITIES.some((m) => m.toLowerCase() === city.toLowerCase())) {
    if (!province) province = 'Metro Manila';
  }

  return {
    street: cleanStr,
    city: city || '',
    province: province || (city ? 'Bulacan' : ''),
    postalCode,
    country,
  };
}

export function extractCityFromAddress(addrString = '') {
  const loc = extractLocationFromAddress(addrString);
  return { city: loc.city, province: loc.province };
}

export function buildSellerPayloadFromPendingRegistration(item) {
  const loc = extractLocationFromAddress(item.address || item.warehouseAddress || '');
  return {
    registrationId: item.id || generateRegistrationId('SEL'),
    accountNumber: generateAccountNumber(),
    fullName: item.fullName,
    storeName: item.storeName || item.businessName || '',
    warehouseAddress: item.warehouseAddress || item.address || '',
    operatingHours: item.operatingHours || '',
    idType: item.governmentId?.type || item.idType || '',
    idNumber: item.governmentId?.number || item.idNumber || '',
    email: item.email,
    phone: item.contactNumber || item.phone || '',
    address: item.address || item.warehouseAddress || '',
    city: loc.city,
    state: loc.province,
    country: loc.country || item.country || '',
    postalCode: loc.postalCode || '',
    bankName: item.bankName || '',
    commissionRate: item.commissionRate ?? 0,
    paymentCycle: item.paymentCycle || '',
    documents: Array.isArray(item.documents) ? item.documents : (Array.isArray(item.raw?.documents) ? item.raw.documents : []),
    status: SELLER_STATUS.ACTIVE,
  };
}

export function buildRiderPayloadFromPendingRegistration(item) {
  const loc = extractLocationFromAddress(item.address || item.assignedHub || '');
  return {
    registrationId: generateRegistrationId('RD'),
    accountNumber: generateAccountNumber(),
    riderName: item.fullName,
    vehicleType: item.vehicle?.type || item.vehicleType || '',
    email: item.email,
    phone: item.contactNumber || item.phone || '',
    address: item.address || '',
    city: loc.city,
    state: loc.province,
    country: loc.country || item.country || '',
    postalCode: loc.postalCode || '',
    licenseNumber: item.governmentId?.number || item.licenseNumber || item.raw?.licenseNumber || '',
    vehiclePlate: item.vehicle?.plate || item.plateNumber || item.raw?.vehiclePlate || '',
    riderType: item.raw?.riderType || item.riderType || 'PARTNER',
    bankName: item.bankName || '',
    payoutRate: item.payoutRate ?? 0,
    payoutCycle: item.payoutCycle || '',
    documents: Array.isArray(item.documents) ? item.documents : (Array.isArray(item.raw?.documents) ? item.raw.documents : []),
    status: RIDER_STATUS.ACTIVE,
    deliveries: 0,
    rating: item.rating ?? 0,
  };
}

export function normalizeRider(raw = {}) {
  // Derive location honestly: parse address or assigned hub if raw.city or raw.state is missing
  const loc = extractLocationFromAddress(raw.address || raw.assignedHub || '');
  const city = raw.city || loc.city || '';
  const isBtown = city && BULACAN_MUNICIPALITIES.some((b) => b.toLowerCase() === city.toLowerCase());
  const isMtown = city && METRO_MANILA_CITIES.some((m) => m.toLowerCase() === city.toLowerCase());
  const province = raw.state || raw.province || loc.province || (isBtown ? 'Bulacan' : (isMtown ? 'Metro Manila' : ''));

  return {
    _id: raw._id,
    riderId: raw.registrationId || raw.riderId || raw._id || '—',
    fullName: raw.riderName || raw.fullName || '',
    // D-16: the photo the rider set in the app; '' means show the initials /
    // vehicle glyph instead, exactly as before.
    profilePhotoUrl: raw.profilePhotoUrl || '',
    coverPhotoUrl: raw.coverPhotoUrl || '',
    driverLicenseNumber: raw.licenseNumber || raw.driverLicenseNumber || '',
    phone: raw.phone || '',
    email: raw.email || '',
    vehicleType: raw.vehicleType || raw.vehicleModel || '',
    vehiclePlateNumber: raw.vehiclePlate || raw.vehiclePlateNumber || '',
    riderType: raw.riderType || '',
    documents: Array.isArray(raw.documents) ? raw.documents : [],
    assignedHub: raw.assignedHub || '',
    location: {
      province: province,
      city: city,
      barangay: raw.barangay || '',
    },
    emergencyContactName: raw.emergencyContactName || '',
    emergencyContactPhone: raw.emergencyContactPhone || '',
    payoutCommissionShare: raw.payoutRate ?? 0,
    bankName: raw.bankName || '',
    accountNumber: raw.accountNumber || '',
    payoutCycle: raw.payoutCycle || '',
    // Real-time duty flag synced from the Android rider profile toggle
    // (bridge sync-duty-status). Raw kept on `raw.isOnDuty` too — the UI
    // derives both this and the parcel-based "on-delivery" signal.
    isOnDuty: raw.isOnDuty === true,
    status: normalizeStatus(raw.status),
    performance: {
      deliveriesCount: raw.deliveries ?? 0,
      rating: raw.rating ?? 0,
    },
    joined: raw.createdAt ? raw.createdAt.split('T')[0] : 'N/A',
    createdAt: raw.createdAt || null,
    raw: raw,
  };
}

// Mock rosters (mockSellers / mockRiders) were removed 2026-09-13 — the
// platform is REAL-only and pages render only live API records.

export function mapSellerToPendingItem(seller) {
  const resolvedAddress = (typeof seller.address === 'string' && seller.address.trim())
    ? seller.address.trim()
    : (typeof seller.warehouseAddress === 'string' && seller.warehouseAddress.trim()
        ? seller.warehouseAddress.trim()
        : (seller.address?.street || ''));

  return {
    id: seller.registrationId || String(seller._id),
    _id: seller._id,
    fullName: seller.fullName || '—',
    contactNumber: seller.phone || '—',
    email: seller.email || '—',
    storeName: seller.storeName || seller.raw?.storeName || '',
    warehouseAddress: seller.warehouseAddress || seller.raw?.warehouseAddress || resolvedAddress,
    governmentId: {
      type: seller.idType || '',
      number: seller.idNumber || '',
    },
    address: resolvedAddress || '—',
    businessName: seller.storeName || seller.raw?.storeName || '',
    businessType: seller.businessType || seller.raw?.businessType || '',
    submittedAt: seller.createdAt || new Date().toISOString(),
    status: seller.status || 'Pending Verification',
    documents: Array.isArray(seller.documents) ? seller.documents : [],
    raw: seller,
  };
}

export function mapRiderToPendingItem(rider) {
  const resolvedAddress = (typeof rider.address === 'string' && rider.address.trim())
    ? rider.address.trim()
    : (typeof rider.assignedHub === 'string' && rider.assignedHub.trim()
        ? rider.assignedHub.trim()
        : (rider.address?.street || ''));

  return {
    id: rider.registrationId || String(rider._id),
    _id: rider._id,
    fullName: rider.riderName || '—',
    contactNumber: rider.phone || '—',
    email: rider.email || '—',
    vehicleType: rider.vehicleType || rider.vehicleModel || '',
    plateNumber: rider.vehiclePlate || rider.plateNumber || '',
    governmentId: {
      type: rider.idType || (rider.licenseNumber ? "Driver's License" : ''),
      number: rider.idNumber || rider.licenseNumber || '',
    },
    address: resolvedAddress || '—',
    submittedAt: rider.createdAt || new Date().toISOString(),
    status: rider.status || 'Pending Verification',
    documents: Array.isArray(rider.documents) ? rider.documents : [],
    raw: rider,
  };
}
