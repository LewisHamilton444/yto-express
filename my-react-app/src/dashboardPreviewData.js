// ── TEMPORARY dashboard preview data ──────────────────────────────────────
// Purpose: the owner asked to see every dashboard graph with figures while
// the live database is still empty. This module is the ONLY place holding
// placeholder rows, and it self-disables the moment real records exist.
//
// Removal (one step): set PREVIEW_ENABLED to false, or delete this file and
// the `previewing` references in AnalyticsDashboard.jsx. Strict empty states
// (AGENTS2.md section 7) return immediately — no other file holds fake rows.
//
// Honesty guards:
// - Preview activates ONLY when parcels, riders, sellers AND customers are
//   all empty. Any single real record disables every placeholder at once.
// - The dashboard renders a persistent "Sample preview" banner with a Hide
//   button while placeholders are on screen. Placeholders are never
//   presented as real figures.

export const PREVIEW_ENABLED = true;

const hoursAgo = (h) => new Date(Date.now() - h * 3600000).toISOString();
const daysAgo = (d, extraHours = 0) => new Date(Date.now() - d * 86400000 - extraHours * 3600000).toISOString();

export const shouldPreviewData = ({ parcels, riders, sellers, customers }) =>
  PREVIEW_ENABLED &&
  (parcels || []).length === 0 &&
  (riders || []).length === 0 &&
  (sellers || []).length === 0 &&
  (customers || []).length === 0;

export const SAMPLE_PARCELS = [
  // Recent hours — feeds the Hourly Activity chart.
  { trackingNumber: 'YTO202600101', senderName: 'Green Mart', receiverName: 'A. Reyes', destination: 'Malolos, Bulacan', status: 'Delivered', riderId: 'YTOR20260001', riderName: 'J. Dela Cruz', deliveryFee: 60, createdAt: hoursAgo(1), updatedAt: hoursAgo(0.5) },
  { trackingNumber: 'YTO202600102', senderName: 'Pixel Gadgets', receiverName: 'R. Aquino', destination: 'Baliwag, Bulacan', status: 'Out for Delivery', riderId: 'YTOR20260002', riderName: 'M. Santos', createdAt: hoursAgo(2), updatedAt: hoursAgo(1) },
  { trackingNumber: 'YTO202600103', senderName: 'Fresh Harvest', receiverName: 'L. Mendoza', destination: 'Pulilan, Bulacan', status: 'In Transit', riderId: 'YTOR20260001', riderName: 'J. Dela Cruz', createdAt: hoursAgo(3), updatedAt: hoursAgo(2) },
  { trackingNumber: 'YTO202600104', senderName: 'Bulacan Books', receiverName: 'K. Villanueva', destination: 'Calumpit, Bulacan', status: 'In Transit', riderId: 'YTOR20260004', riderName: 'R. Bautista', createdAt: hoursAgo(5), updatedAt: hoursAgo(4) },
  { trackingNumber: 'YTO202600105', senderName: 'Green Mart', receiverName: 'D. Ramos', destination: 'Plaridel, Bulacan', status: 'Delivered', riderId: 'YTOR20260002', riderName: 'M. Santos', deliveryFee: 80, createdAt: hoursAgo(9), updatedAt: hoursAgo(7) },
  { trackingNumber: 'YTO202600106', senderName: 'Pixel Gadgets', receiverName: 'S. Cruz', destination: 'Guiguinto, Bulacan', status: 'Pending', createdAt: hoursAgo(11), updatedAt: hoursAgo(11) },
  // Last 7 days — feeds Parcel Volume (daily) and the delivery/return minis.
  { trackingNumber: 'YTO202600107', senderName: 'Fresh Harvest', receiverName: 'P. Navarro', destination: 'Hagonoy, Bulacan', status: 'Delivered', riderId: 'YTOR20260001', riderName: 'J. Dela Cruz', deliveryFee: 60, createdAt: daysAgo(1, 3), updatedAt: daysAgo(1, 1) },
  { trackingNumber: 'YTO202600108', senderName: 'Green Mart', receiverName: 'T. Salazar', destination: 'Paombong, Bulacan', status: 'Delivered', riderId: 'YTOR20260003', riderName: 'A. Ocampo', deliveryFee: 100, createdAt: daysAgo(2, 2), updatedAt: daysAgo(1, 20) },
  { trackingNumber: 'YTO202600109', senderName: 'Bulacan Books', receiverName: 'N. Flores', destination: 'San Miguel, Bulacan', status: 'Returned', riderId: 'YTOR20260002', riderName: 'M. Santos', createdAt: daysAgo(3, 5), updatedAt: daysAgo(2, 2) },
  { trackingNumber: 'YTO202600110', senderName: 'Pixel Gadgets', receiverName: 'G. Torres', destination: 'San Ildefonso, Bulacan', status: 'Delivered', riderId: 'YTOR20260004', riderName: 'R. Bautista', deliveryFee: 60, createdAt: daysAgo(3, 8), updatedAt: daysAgo(3, 2) },
  { trackingNumber: 'YTO202600111', senderName: 'Fresh Harvest', receiverName: 'E. Castillo', destination: 'San Rafael, Bulacan', status: 'Picked Up', riderId: 'YTOR20260001', riderName: 'J. Dela Cruz', createdAt: daysAgo(4, 1), updatedAt: daysAgo(4, 1) },
  { trackingNumber: 'YTO202600112', senderName: 'Green Mart', receiverName: 'F. Domingo', destination: 'Bustos, Bulacan', status: 'Delivered', riderId: 'YTOR20260003', riderName: 'A. Ocampo', deliveryFee: 80, createdAt: daysAgo(5, 4), updatedAt: daysAgo(4, 22) },
  { trackingNumber: 'YTO202600113', senderName: 'Bulacan Books', receiverName: 'H. Mercado', destination: 'Angat, Bulacan', status: 'Delivered', riderId: 'YTOR20260001', riderName: 'J. Dela Cruz', deliveryFee: 60, createdAt: daysAgo(6, 6), updatedAt: daysAgo(5, 20) },
  // Older weeks — feeds Parcel Volume (weekly).
  { trackingNumber: 'YTO202600114', senderName: 'Pixel Gadgets', receiverName: 'J. Padilla', destination: 'Norzagaray, Bulacan', status: 'Delivered', riderId: 'YTOR20260002', riderName: 'M. Santos', deliveryFee: 120, createdAt: daysAgo(9, 2), updatedAt: daysAgo(8, 20) },
  { trackingNumber: 'YTO202600115', senderName: 'Fresh Harvest', receiverName: 'C. Aguilar', destination: 'Santa Maria, Bulacan', status: 'Delivered', riderId: 'YTOR20260004', riderName: 'R. Bautista', deliveryFee: 60, createdAt: daysAgo(12, 7), updatedAt: daysAgo(11, 21) },
  { trackingNumber: 'YTO202600116', senderName: 'Green Mart', receiverName: 'V. Del Rosario', destination: 'Marilao, Bulacan', status: 'Delivered', riderId: 'YTOR20260001', riderName: 'J. Dela Cruz', deliveryFee: 80, createdAt: daysAgo(16, 3), updatedAt: daysAgo(15, 22) },
  { trackingNumber: 'YTO202600117', senderName: 'Bulacan Books', receiverName: 'B. Gonzales', destination: 'Meycauayan, Bulacan', status: 'Delivered', riderId: 'YTOR20260003', riderName: 'A. Ocampo', deliveryFee: 60, createdAt: daysAgo(23, 5), updatedAt: daysAgo(22, 20) },
  { trackingNumber: 'YTO202600118', senderName: 'Pixel Gadgets', receiverName: 'Q. Fernandez', destination: 'Obando, Bulacan', status: 'Delivered', riderId: 'YTOR20260002', riderName: 'M. Santos', deliveryFee: 100, createdAt: daysAgo(30, 1), updatedAt: daysAgo(29, 18) },
  { trackingNumber: 'YTO202600119', senderName: 'Fresh Harvest', receiverName: 'Z. Lopez', destination: 'Balagtas, Bulacan', status: 'Delivered', riderId: 'YTOR20260004', riderName: 'R. Bautista', deliveryFee: 60, createdAt: daysAgo(37, 4), updatedAt: daysAgo(36, 19) },
];

export const SAMPLE_RIDERS = [
  { _id: 'r1', registrationId: 'YTOR20260001', riderName: 'J. Dela Cruz', status: 'Active', isOnDuty: true, deliveries: 48, rating: 4.8, vehicleType: 'Motorcycle' },
  { _id: 'r2', registrationId: 'YTOR20260002', riderName: 'M. Santos', status: 'Active', isOnDuty: true, deliveries: 35, rating: 4.6, vehicleType: 'Motorcycle' },
  { _id: 'r3', registrationId: 'YTOR20260003', riderName: 'A. Ocampo', status: 'Active', isOnDuty: false, deliveries: 22, rating: 4.9, vehicleType: 'Van' },
  { _id: 'r4', registrationId: 'YTOR20260004', riderName: 'R. Bautista', status: 'Active', isOnDuty: true, deliveries: 12, rating: 4.2, vehicleType: 'Motorcycle' },
  // No assignments yet — exercises the leaderboard guard (must rank last, not first).
  { _id: 'r5', registrationId: 'YTOR20260005', riderName: 'N. Santiago', status: 'Active', isOnDuty: false, deliveries: 0, rating: 0, vehicleType: 'Motorcycle' },
];

export const SAMPLE_SELLERS = [
  { _id: 's1', registrationId: 'YTOS20260001', fullName: 'Green Mart Owner', storeName: 'Green Mart', email: 'green.mart@example.com', phone: '9171000001', status: 'ACTIVE', createdAt: daysAgo(40) },
  { _id: 's2', registrationId: 'YTOS20260002', fullName: 'Pixel Gadgets Owner', storeName: 'Pixel Gadgets', email: 'pixel.gadgets@example.com', phone: '9171000002', status: 'ACTIVE', createdAt: daysAgo(28) },
  { _id: 's3', registrationId: 'YTOS20260003', fullName: 'Fresh Harvest Owner', storeName: 'Fresh Harvest', email: 'fresh.harvest@example.com', phone: '9171000003', status: 'ACTIVE', createdAt: daysAgo(15) },
  { _id: 's4', registrationId: 'YTOS20260004', fullName: 'Bulacan Books Owner', storeName: 'Bulacan Books', email: 'bulacan.books@example.com', phone: '9171000004', status: 'ACTIVE', createdAt: daysAgo(6) },
  { _id: 's5', registrationId: 'YTOS20260005', fullName: 'C. Reyes', storeName: 'Reyes Apparel', email: 'reyes.apparel@example.com', phone: '9171000005', status: 'PENDING_VERIFICATION', createdAt: daysAgo(2) },
  { _id: 's6', registrationId: 'YTOS20260006', fullName: 'D. Bautista', storeName: 'Bautista Foods', email: 'bautista.foods@example.com', phone: '9171000006', status: 'PENDING_VERIFICATION', createdAt: daysAgo(0, 5) },
];

export const SAMPLE_PENDING_RIDERS = [
  { _id: 'pr1', registrationId: 'YTOR20260006', riderName: 'P. Villanueva', email: 'p.villanueva@example.com', phone: '9172000001', status: 'Pending', vehicleType: 'Motorcycle', vehiclePlate: 'ABC 1234', createdAt: daysAgo(1) },
];

export const SAMPLE_CUSTOMERS = [
  { _id: 'c1', customerId: 'YTOC20260001', fullName: 'A. Reyes', status: 'Active', createdAt: hoursAgo(6) },
  { _id: 'c2', customerId: 'YTOC20260002', fullName: 'R. Aquino', status: 'Active', createdAt: daysAgo(1) },
  { _id: 'c3', customerId: 'YTOC20260003', fullName: 'L. Mendoza', status: 'Active', createdAt: daysAgo(2) },
  { _id: 'c4', customerId: 'YTOC20260004', fullName: 'K. Villanueva', status: 'Active', createdAt: daysAgo(4) },
  { _id: 'c5', customerId: 'YTOC20260005', fullName: 'D. Ramos', status: 'Active', createdAt: daysAgo(6) },
  { _id: 'c6', customerId: 'YTOC20260006', fullName: 'S. Cruz', status: 'Active', createdAt: daysAgo(9) },
  { _id: 'c7', customerId: 'YTOC20260007', fullName: 'P. Navarro', status: 'Active', createdAt: daysAgo(13) },
  { _id: 'c8', customerId: 'YTOC20260008', fullName: 'T. Salazar', status: 'Active', createdAt: daysAgo(20) },
  { _id: 'c9', customerId: 'YTOC20260009', fullName: 'N. Flores', status: 'Active', createdAt: daysAgo(28) },
];

export const SAMPLE_ISSUES = [
  { _id: 'i1', ticketId: 'TICK-2026-00001', status: 'Open', category: 'Delayed delivery', createdAt: daysAgo(0, 3) },
  { _id: 'i2', ticketId: 'TICK-2026-00002', status: 'Open', category: 'Wrong address', createdAt: daysAgo(1) },
  { _id: 'i3', ticketId: 'TICK-2026-00003', status: 'Under Investigation', category: 'Damaged parcel', createdAt: daysAgo(2) },
  { _id: 'i4', ticketId: 'TICK-2026-00004', status: 'Resolved', category: 'Rider concern', createdAt: daysAgo(5) },
  { _id: 'i5', ticketId: 'TICK-2026-00005', status: 'Closed', category: 'Delayed delivery', createdAt: daysAgo(9) },
];
