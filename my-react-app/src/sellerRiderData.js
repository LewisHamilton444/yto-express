'use client';

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
  return {
    _id: raw._id,
    sellerId: raw.registrationId || raw.sellerId || raw._id || '—',
    fullName: raw.fullName || raw.displayName || raw.companyName || '',
    idType: raw.idType || 'National ID',
    governmentIdNumber: raw.idNumber || raw.governmentIdNumber || '',
    email: raw.email || '',
    phone: raw.phone || '',
    address: {
      street: typeof raw.address === 'string' ? raw.address : (addr.street || ''),
      city: raw.city || addr.city || '',
      state: raw.state || addr.state || '',
      postalCode: raw.postalCode || addr.postalCode || '',
      country: raw.country || addr.country || '',
    },
    bankName: raw.bankName || '',
    accountNumber: raw.accountNumber || '',
    paymentCycle: raw.paymentCycle || 'Weekly',
    commissionRate: raw.commissionRate ?? 0,
    status: normalizeStatus(raw.status),
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

export function buildSellerPayloadFromPendingRegistration(item) {
  return {
    registrationId: generateRegistrationId('SH'),
    accountNumber: generateAccountNumber(),
    fullName: item.fullName,
    idType: item.governmentId?.type || 'National ID',
    idNumber: item.governmentId?.number || '',
    email: item.email,
    phone: item.contactNumber,
    address: item.address || '',
    city: '',
    state: '',
    country: '',
    postalCode: '',
    bankName: '',
    commissionRate: 10,
    paymentCycle: 'Weekly',
    status: SELLER_STATUS.ACTIVE,
  };
}

export function buildRiderPayloadFromPendingRegistration(item) {
  return {
    registrationId: generateRegistrationId('RD'),
    accountNumber: generateAccountNumber(),
    riderName: item.fullName,
    vehicleType: item.vehicle?.type || 'Motorcycle',
    email: item.email,
    phone: item.contactNumber,
    address: item.address || '',
    city: '',
    state: '',
    country: '',
    postalCode: '',
    licenseNumber: item.governmentId?.number || '',
    vehiclePlate: item.vehicle?.plate || '',
    bankName: '',
    payoutRate: 80,
    payoutCycle: 'Weekly',
    status: RIDER_STATUS.ACTIVE,
    deliveries: 0,
    rating: 5.0,
  };
}

export function normalizeRider(raw = {}) {
  return {
    _id: raw._id,
    riderId: raw.registrationId || raw.riderId || raw._id || '—',
    fullName: raw.riderName || raw.fullName || '',
    driverLicenseNumber: raw.licenseNumber || raw.driverLicenseNumber || '',
    phone: raw.phone || '',
    email: raw.email || '',
    vehicleType: raw.vehicleType || 'Motorcycle',
    vehiclePlateNumber: raw.vehiclePlate || raw.vehiclePlateNumber || '',
    location: {
      province: raw.state || raw.province || '',
      city: raw.city || '',
      barangay: raw.barangay || '',
    },
    payoutCommissionShare: raw.payoutRate ?? 0,
    bankName: raw.bankName || '',
    accountNumber: raw.accountNumber || '',
    payoutCycle: raw.payoutCycle || 'Weekly',
    status: normalizeStatus(raw.status),
    performance: {
      deliveriesCount: raw.deliveries ?? 0,
      rating: raw.rating ?? 5.0,
    },
    joined: raw.createdAt ? raw.createdAt.split('T')[0] : 'N/A',
  };
}

// ── Standardized mock data ───────────────────────────────────────────────────
// Used as a local fallback whenever the backend is unreachable, and as sample
// data for local development. Built through the same normalizers so it is
// guaranteed to match the live-data shape exactly.

export const mockSellers = [
  normalizeSeller({
    _id: 'mock-seller-1',
    registrationId: 'SEL-00123',
    fullName: 'Maria Santos',
    idType: 'PhilSys ID',
    idNumber: '1234-5678-9012',
    email: 'maria.santos@example.com',
    phone: '+63 917 123 4567',
    address: '123 Rizal Street',
    city: 'Quezon City',
    state: 'Metro Manila',
    postalCode: '1100',
    country: 'Philippines',
    bankName: 'BDO Unibank',
    accountNumber: '0012-3456-7890',
    paymentCycle: 'Bi-weekly',
    commissionRate: 12.5,
    status: 'ACTIVE',
  }),
  normalizeSeller({
    _id: 'mock-seller-2',
    registrationId: 'SEL-00124',
    fullName: 'Juan Dela Cruz',
    idType: 'Passport',
    idNumber: 'P1234567A',
    email: 'juan.delacruz@example.com',
    phone: '+63 918 234 5678',
    address: '45 Mabini Ave',
    city: 'Makati',
    state: 'Metro Manila',
    postalCode: '1200',
    country: 'Philippines',
    bankName: 'BPI',
    accountNumber: '0098-7654-3210',
    paymentCycle: 'Weekly',
    commissionRate: 10,
    status: 'PENDING_VERIFICATION',
  }),
  normalizeSeller({
    _id: 'mock-seller-3',
    registrationId: 'SEL-00125',
    fullName: 'Ana Reyes',
    idType: 'Driver\'s License',
    idNumber: 'N01-23-456789',
    email: 'ana.reyes@example.com',
    phone: '+63 919 345 6789',
    address: '78 Bonifacio Road',
    city: 'Pasig',
    state: 'Metro Manila',
    postalCode: '1600',
    country: 'Philippines',
    bankName: 'Metrobank',
    accountNumber: '0055-1122-3344',
    paymentCycle: 'Monthly',
    commissionRate: 15,
    status: 'ARCHIVED',
  }),
];

export const mockRiders = [
  normalizeRider({
    _id: 'mock-rider-1',
    registrationId: 'RD-00456',
    riderName: 'Carlo Villanueva',
    licenseNumber: 'D01-23-456789',
    phone: '+63 920 111 2222',
    email: 'carlo.villanueva@example.com',
    vehicleType: 'Motorcycle',
    vehiclePlate: 'NBC 1234',
    city: 'Manila',
    state: 'Metro Manila',
    payoutRate: 80,
    bankName: 'BDO Unibank',
    accountNumber: '0011-2233-4455',
    payoutCycle: 'Weekly',
    status: 'ACTIVE',
    deliveries: 342,
    rating: 4.8,
    createdAt: '2025-11-02T00:00:00.000Z',
  }),
  normalizeRider({
    _id: 'mock-rider-2',
    registrationId: 'RD-00457',
    riderName: 'Bea Fernandez',
    licenseNumber: 'D04-56-789012',
    phone: '+63 921 222 3333',
    email: 'bea.fernandez@example.com',
    vehicleType: 'Bicycle',
    vehiclePlate: '—',
    city: 'Quezon City',
    state: 'Metro Manila',
    payoutRate: 75,
    bankName: 'BPI',
    accountNumber: '0022-3344-5566',
    payoutCycle: 'Weekly',
    status: 'PENDING_VERIFICATION',
    deliveries: 12,
    rating: 5.0,
    createdAt: '2026-06-15T00:00:00.000Z',
  }),
  normalizeRider({
    _id: 'mock-rider-3',
    registrationId: 'RD-00458',
    riderName: 'Ramon Ocampo',
    licenseNumber: 'D07-89-012345',
    phone: '+63 922 333 4444',
    email: 'ramon.ocampo@example.com',
    vehicleType: 'Van',
    vehiclePlate: 'NCD 5678',
    city: 'Taguig',
    state: 'Metro Manila',
    payoutRate: 70,
    bankName: 'Metrobank',
    accountNumber: '0033-4455-6677',
    payoutCycle: 'Monthly',
    status: 'ARCHIVED',
    deliveries: 189,
    rating: 4.3,
    createdAt: '2025-08-20T00:00:00.000Z',
  }),
];
