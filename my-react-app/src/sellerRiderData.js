

import { isDemoEmail } from './demoUtils';

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
    storeName: raw.storeName || '',
    warehouseAddress: raw.warehouseAddress || '',
    operatingHours: raw.operatingHours || '',
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
    accountCategory: raw.accountCategory || (isDemoEmail(raw.email) || String(raw.sellerId || raw.registrationId || '').includes('DEMO') ? 'DEMO' : 'REAL'),
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

// ── City extraction from a free-text address ────────────────────────────────
// Pending registrations only carry a single `address` string (e.g. "45 Mabini
// Ave, Barangay San Isidro, Pasig City" or "78 Aguinaldo Hwy, Barangay Zapote,
// Bacoor, Cavite") — the city was never being pulled out of it, so approved
// riders/sellers were saved with an empty `city`, which is why the CITY column
// downstream rendered blank. PH addresses conventionally end either with just
// "<City>" (common for Metro Manila cities, which are usually written without
// their province) or "<City>, <Province>". We only need to tell those two
// shapes apart for the province names that actually show up in this app's
// service area.
const PH_PROVINCES_NEAR_METRO = new Set([
  'Metro Manila', 'Cavite', 'Laguna', 'Batangas', 'Rizal', 'Bulacan',
  'Pampanga', 'Bataan', 'Zambales', 'Nueva Ecija', 'Tarlac', 'Pangasinan',
]);

function extractCityFromAddress(addrString = '') {
  if (!addrString || typeof addrString !== 'string') return { city: '', province: '' };
  const parts = addrString.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { city: '', province: '' };

  const last = parts[parts.length - 1];
  if (PH_PROVINCES_NEAR_METRO.has(last) && parts.length >= 2) {
    return { city: parts[parts.length - 2], province: last };
  }
  return { city: last, province: 'Metro Manila' };
}

export function buildSellerPayloadFromPendingRegistration(item) {
  const { city, province } = extractCityFromAddress(item.address);
  return {
    registrationId: generateRegistrationId('SEL'),
    accountNumber: generateAccountNumber(),
    fullName: item.fullName,
    idType: item.governmentId?.type || 'National ID',
    idNumber: item.governmentId?.number || '',
    email: item.email,
    phone: item.contactNumber,
    address: item.address || '',
    city,
    state: province,
    country: 'Philippines',
    postalCode: '',
    bankName: '',
    commissionRate: 10,
    paymentCycle: 'Weekly',
    status: SELLER_STATUS.ACTIVE,
  };
}

export function buildRiderPayloadFromPendingRegistration(item) {
  const { city, province } = extractCityFromAddress(item.address);
  return {
    registrationId: generateRegistrationId('RD'),
    accountNumber: generateAccountNumber(),
    riderName: item.fullName,
    vehicleType: item.vehicle?.type || 'Motorcycle',
    email: item.email,
    phone: item.contactNumber,
    address: item.address || '',
    city,
    state: province,
    country: 'Philippines',
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
  // Riders saved before the city-extraction fix (or created some other way)
  // can still have an empty `city`/`state` even though their `address` string
  // has one embedded — fall back to parsing it so the CITY column doesn't
  // render blank for those older records either.
  const addrFallback = raw.city ? { city: '', province: '' } : extractCityFromAddress(raw.address);
  return {
    _id: raw._id,
    riderId: raw.registrationId || raw.riderId || raw._id || '—',
    fullName: raw.riderName || raw.fullName || '',
    driverLicenseNumber: raw.licenseNumber || raw.driverLicenseNumber || '',
    phone: raw.phone || '',
    email: raw.email || '',
    vehicleType: raw.vehicleType || 'Motorcycle',
    vehiclePlateNumber: raw.vehiclePlate || raw.vehiclePlateNumber || '',
    assignedHub: raw.assignedHub || '',
    location: {
      province: raw.state || raw.province || addrFallback.province || '',
      city: raw.city || addrFallback.city || '',
      barangay: raw.barangay || '',
    },
    emergencyContactName: raw.emergencyContactName || '',
    emergencyContactPhone: raw.emergencyContactPhone || '',
    payoutCommissionShare: raw.payoutRate ?? 0,
    bankName: raw.bankName || '',
    accountNumber: raw.accountNumber || '',
    payoutCycle: raw.payoutCycle || 'Weekly',
    // Real-time duty flag synced from the Android rider profile toggle
    // (bridge sync-duty-status). Raw kept on `raw.isOnDuty` too — the UI
    // derives both this and the parcel-based "on-delivery" signal.
    isOnDuty: raw.isOnDuty === true,
    status: normalizeStatus(raw.status),
    accountCategory: raw.accountCategory || (isDemoEmail(raw.email) || String(raw.riderId || raw.registrationId || '').includes('DEMO') ? 'DEMO' : 'REAL'),
    performance: {
      deliveriesCount: raw.deliveries ?? 0,
      rating: raw.rating ?? 5.0,
    },
    joined: raw.createdAt ? raw.createdAt.split('T')[0] : 'N/A',
    raw: raw,
  };
}

// Mock rosters (mockSellers / mockRiders) were removed 2026-09-13 — the
// platform is REAL-only and pages render only live API records.


