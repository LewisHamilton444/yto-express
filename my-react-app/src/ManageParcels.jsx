'use client';
import React, { useState, useEffect, useMemo, useRef } from 'react';

/**
 * ManageParcels.jsx
 * ──────────────────────────────────────────────────────────────────────────
 * Peer-to-peer (P2P) courier tracking page — every parcel is a direct
 * person-to-person shipment (no seller/store origin distinction) with a
 * rider assigned for pickup and delivery. Built on the same visual language,
 * color tokens and interaction patterns as the original consolidated view:
 *   1. GenerateParcelMovement.jsx           ("View Registered Parcels")
 *      → master table shape, status footer pills
 *   2. GenerateParcelConfirmationStatus.jsx ("Generate Parcel Confirmation Status")
 *      → parcel detail modal layout, live GPS/geofence MiniMap, signature flow
 *   3. GenerateParcelStatusReport.jsx       ("General Parcel Status Report")
 *      → delivery timeline stepper, Export & Print panel
 *
 * Fetches real parcels from GET /api/parcels and real riders from
 * GET /api/riders (for the Assign Rider list + resolving assignedRider
 * names), normalized via normalizeParcel() below. Falls back to
 * FALLBACK_PARCELS — clearly flagged in the UI — only if the API is
 * unreachable, so the page never renders blank.
 *
 * Palette (unchanged from the legacy files):
 *   page bg #f9f7ff · card white / border #e8e0f0 · table header #390955
 *   (white uppercase text) · primary text #1a1a1a · secondary text #888
 *   accent / primary actions #f37021.
 */

// ── Reference Data ──────────────────────────────────────────────────────────

// 'Picked Up' and 'Out for Delivery' are kept for the fallback dataset below,
// but real /api/parcels records only ever carry pending/in-transit/delivered/
// returned/failed (see ProcessParcelInformation.jsx's status options) — those
// two extra values were added to represent that real vocabulary faithfully.
const STATUSES = ['Pending', 'Picked Up', 'In Transit', 'Out for Delivery', 'Delivered', 'Returned', 'Failed'];

// Exact palette from GenerateParcelMovement.jsx's STATUS_COLORS, extended
// with Returned/Failed (real values the backend actually produces).
const STATUS_COLORS = {
  'Pending':          { bg: '#f3f4f6', color: '#374151' },
  'Picked Up':        { bg: '#ede9fe', color: '#4c1d95' },
  'In Transit':       { bg: '#e0f2fe', color: '#075985' },
  'Out for Delivery': { bg: '#fef3c7', color: '#92400e' },
  'Delivered':        { bg: '#d1fae5', color: '#065f46' },
  'Returned':         { bg: '#f3f4f6', color: '#6b7280' },
  'Failed':           { bg: '#fee2e2', color: '#991b1b' },
};

// Real parcel documents store status as lowercase-hyphenated
// ('pending' | 'in-transit' | 'delivered' | 'returned' | 'failed' — see
// ProcessParcelInformation.jsx). This maps that real vocabulary onto the
// Title Case labels this page's badges/filters already use.
const REAL_STATUS_MAP = {
  'pending': 'Pending',
  'in-transit': 'In Transit',
  'delivered': 'Delivered',
  'returned': 'Returned',
  'failed': 'Failed',
};
function mapRealStatus(rawStatus) {
  const key = String(rawStatus || '').trim().toLowerCase();
  return REAL_STATUS_MAP[key] || 'Pending';
}

// Exact palette from GenerateParcelStatusReport.jsx's SERVICE_CONFIG.
const SERVICE_CONFIG = {
  Express:   { color: '#7c3aed', bg: '#ede9fe' },
  Standard:  { color: '#0369a1', bg: '#e0f2fe' },
  Overnight: { color: '#b45309', bg: '#fef3c7' },
};

// Badge color for rider chips — kept inside the same blue family already
// used elsewhere (was Customer's origin color). The rider list itself now
// comes from real GET /api/riders (see the main component below).
const RIDER_STYLE = { color: '#075985', bg: '#e0f2fe' };

const EXPORT_FORMATS = [
  { key: 'pdf', label: 'PDF Document',    desc: 'Portable, print-ready' },
  { key: 'txt', label: 'Text File',       desc: 'Plain text format' },
  { key: 'csv', label: 'CSV Spreadsheet', desc: 'Excel-compatible' },
];

// Approximate NCR-area coordinates, used only to place a pin on the
// Live GPS map preview — mirrors MiniMap from GenerateParcelConfirmationStatus.jsx.
// Covers both this file's own fallback dataset (the "City" keys) AND the real
// origin/destination values ProcessParcelInformation.jsx's CITIES dropdown
// actually writes to real parcels ('Makati', 'Pasig', 'Mandaluyong', etc. —
// no "City" suffix there, and it includes places outside NCR entirely).
const PH_CITY_COORDS = {
  'Manila':            { lat: 14.5995, lng: 120.9842 },
  'Makati City':       { lat: 14.5547, lng: 121.0244 },
  'Makati':            { lat: 14.5547, lng: 121.0244 },
  'Quezon City':       { lat: 14.6760, lng: 121.0437 },
  'Pasay':             { lat: 14.5378, lng: 121.0014 },
  'Mandaluyong City':  { lat: 14.5794, lng: 121.0359 },
  'Mandaluyong':       { lat: 14.5794, lng: 121.0359 },
  'Pasig City':        { lat: 14.5764, lng: 121.0851 },
  'Pasig':             { lat: 14.5764, lng: 121.0851 },
  'BGC':               { lat: 14.5509, lng: 121.0489 },
  'Caloocan':          { lat: 14.6488, lng: 120.9673 },
  'Marikina':          { lat: 14.6507, lng: 121.1029 },
  'Bulacan':           { lat: 14.7943, lng: 120.8799 },
  'Hagonoy':           { lat: 14.8340, lng: 120.7310 },
};
// Cebu, Davao, and "Other" are real dropdown options too, but this map
// preview is NCR-only (see NCR_BOUNDS below) — those fall back to the NCR
// center below rather than being silently placed on the wrong side of the
// country.
const NCR_FALLBACK_CENTER = { lat: 14.6, lng: 121.0 };
const NCR_BOUNDS = { minLat: 14.45, maxLat: 14.75, minLng: 120.90, maxLng: 121.15 };

// ── Fallback Parcels (used only if the live API is unreachable — every
// shipment is one person sending to another, with a rider assigned for
// pickup/delivery) ───────────────────────────────────────────────────────

const RAW_PARCELS = [
  { id: 'PKG-2025-001',
    sender: { name: 'Juan Dela Cruz', phone: '+63 917 200 1001', email: 'juan.delacruz@gmail.com' },
    receiver: { name: 'Maria Santos', phone: '+63 918 334 2210' },
    address: '123 Rizal St, Manila', city: 'Manila',
    weight: '2.5 kg', dimensions: '30 x 20 x 15 cm', contents: 'Electronics', value: '$250.00',
    service: 'Express', status: 'In Transit', registeredDate: '2025-02-15', assignedRider: 'John Doe',
    instructions: 'Handle with care — fragile electronics.' },

  { id: 'PKG-2025-002',
    sender: { name: 'Sarah Alonzo', phone: '+63 917 200 1002', email: 'sarah.alonzo@gmail.com' },
    receiver: { name: 'Jose Reyes', phone: '+63 919 445 3321' },
    address: '456 Mabini Ave, Makati', city: 'Makati City',
    weight: '1.2 kg', dimensions: '25 x 18 x 10 cm', contents: 'Apparel', value: '$120.00',
    service: 'Standard', status: 'Out for Delivery', registeredDate: '2025-02-15', assignedRider: 'Mark Tan',
    instructions: 'Call recipient before arrival.' },

  { id: 'PKG-2025-003',
    sender: { name: 'Michael Reyes', phone: '+63 917 200 1003', email: 'michael.reyes@gmail.com' },
    receiver: { name: 'Ana Cruz', phone: '+63 920 556 4432' },
    address: '789 Quezon Blvd, QC', city: 'Quezon City',
    weight: '3.8 kg', dimensions: '35 x 25 x 20 cm', contents: 'Computer Parts', value: '$520.00',
    service: 'Overnight', status: 'Picked Up', registeredDate: '2025-02-14', assignedRider: 'Angela Reyes',
    instructions: 'Signature required on delivery.' },

  { id: 'PKG-2025-004',
    sender: { name: 'Angela Bautista', phone: '+63 917 200 1004', email: 'angela.bautista@gmail.com' },
    receiver: { name: 'Carlo Mendoza', phone: '+63 921 667 5543' },
    address: '12 Taft Ave, Pasay', city: 'Pasay',
    weight: '0.9 kg', dimensions: '20 x 15 x 8 cm', contents: 'Books & Merch', value: '$95.00',
    service: 'Standard', status: 'Pending', registeredDate: '2025-02-14', assignedRider: 'Paolo Santos',
    instructions: 'Leave at door if not home.' },

  { id: 'PKG-2025-005',
    sender: { name: 'Juan Dela Cruz', phone: '+63 917 200 1001', email: 'juan.delacruz@gmail.com' },
    receiver: { name: 'Liza Soriano', phone: '+63 922 778 6654' },
    address: '88 Shaw Blvd, Mandaluyong', city: 'Mandaluyong City',
    weight: '1.7 kg', dimensions: '28 x 20 x 12 cm', contents: 'Electronics', value: '$180.00',
    service: 'Express', status: 'Delivered', registeredDate: '2025-02-13', assignedRider: 'Kevin Cruz',
    instructions: 'Ring doorbell twice.' },

  { id: 'PKG-2025-006',
    sender: { name: 'Ramon Villanueva', phone: '+63 920 441 7712', email: 'ramon.v@gmail.com' },
    receiver: { name: 'Grace Tan', phone: '+63 927 118 9902' },
    address: '55 Ortigas Ave, Pasig', city: 'Pasig City',
    weight: '1.0 kg', dimensions: '22 x 16 x 10 cm', contents: 'Personal Parcel', value: '$60.00',
    service: 'Standard', status: 'In Transit', registeredDate: '2025-02-15', assignedRider: 'John Doe',
    instructions: 'Call recipient before arrival.' },

  { id: 'PKG-2025-007',
    sender: { name: 'Jenny Pascual', phone: '+63 918 774 2201', email: 'jenny.pascual@yahoo.com' },
    receiver: { name: 'Mark Aquino', phone: '+63 921 305 5567' },
    address: '23 España Blvd, Manila', city: 'Manila',
    weight: '0.5 kg', dimensions: '18 x 12 x 8 cm', contents: 'Documents', value: '$20.00',
    service: 'Express', status: 'Pending', registeredDate: '2025-02-15', assignedRider: 'Mark Tan',
    instructions: 'Signature required on delivery.' },

  { id: 'PKG-2025-008',
    sender: { name: 'Roberto Flores', phone: '+63 917 902 3345', email: 'roberto.flores@gmail.com' },
    receiver: { name: 'Diana Castillo', phone: '+63 906 447 8821' },
    address: '101 Katipunan Ave, QC', city: 'Quezon City',
    weight: '2.1 kg', dimensions: '26 x 18 x 14 cm', contents: 'Gift Item', value: '$85.00',
    service: 'Overnight', status: 'Delivered', registeredDate: '2025-02-14', assignedRider: 'Angela Reyes',
    instructions: 'Leave with building guard if unavailable.' },

  { id: 'PKG-2025-009',
    sender: { name: 'Marivic Santos', phone: '+63 917 220 6690', email: 'marivic.santos@gmail.com' },
    receiver: { name: 'Paolo Gutierrez', phone: '+63 928 550 1123' },
    address: '77 EDSA, Mandaluyong', city: 'Mandaluyong City',
    weight: '0.8 kg', dimensions: '20 x 14 x 8 cm', contents: 'Personal Parcel', value: '$45.00',
    service: 'Standard', status: 'Out for Delivery', registeredDate: '2025-02-13', assignedRider: 'Kevin Cruz',
    instructions: 'Leave at door if not home.' },
];

// ── Derived-data helpers ─────────────────────────────────────────────────────

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d;
}
function addHours(dateStr, hours) {
  const d = new Date(`${dateStr}T08:00:00`);
  d.setHours(d.getHours() + hours);
  return d;
}
function fmtDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtDateTime(d) {
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// Cumulative step timeline, in the spirit of StatusReport.jsx's
// DELIVERY_EVENTS_MAP, personalized with each parcel's own sender/city/address.
const STEP_META = [
  { status: 'Pending',          label: 'Order Received',   loc: (p) => `${p.sender.name} — Order Processing` },
  { status: 'Picked Up',        label: 'Picked Up',         loc: (p) => `Picked up by ${p.assignedRider || 'rider'} from ${p.sender.name}` },
  { status: 'In Transit',       label: 'In Transit',        loc: () => 'Metro Manila Sorting Hub' },
  { status: 'Out for Delivery', label: 'Out for Delivery',  loc: (p) => `${p.city} Local Delivery Station` },
  { status: 'Delivered',        label: 'Delivered',         loc: (p) => p.address },
];
const STEP_OFFSET_HOURS = [0, 6, 26, 46, 52];

function buildTimeline(p) {
  const idx = STATUSES.indexOf(p.status);
  return STEP_META.slice(0, idx + 1).map((step, i) => ({
    status: step.status,
    label: step.label,
    location: step.loc(p),
    timestamp: fmtDateTime(addHours(p.registeredDate, STEP_OFFSET_HOURS[i])),
  }));
}

const FALLBACK_PARCELS = RAW_PARCELS.map((p) => {
  const base = PH_CITY_COORDS[p.city] || NCR_FALLBACK_CENTER;
  return {
    ...p,
    trackingNumber: `TRK-${p.id.replace('PKG-', '')}`,
    estimatedDelivery: addDays(p.registeredDate, 3).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }),
    lat: base.lat,
    lng: base.lng,
    timeline: buildTimeline(p),
  };
});

// ── Real-data adapter ───────────────────────────────────────────────────────
// Maps a raw /api/parcels document (trackingNumber, senderName, receiverName,
// item, weight, value, origin, destination, status, riderId, events[]) onto
// this page's display shape. Fields the real schema doesn't have yet
// (sender/receiver phone & email, dimensions, service tier, free-text
// instructions) get an honest placeholder rather than a fabricated value.
const PARCELS_API = 'https://yto-express.onrender.com/api/parcels';
const RIDERS_API  = 'https://yto-express.onrender.com/api/riders';

function normalizeParcel(raw, riderNameById) {
  const city = raw.destination || raw.origin || '';
  const base = PH_CITY_COORDS[city] || NCR_FALLBACK_CENTER;
  const createdAt = raw.createdAt ? raw.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const riderId = raw.riderId || '';

  const parcel = {
    id: raw.trackingNumber || raw._id,
    _id: raw._id,
    sender: { name: raw.senderName || 'Unknown', phone: '—', email: '—' },
    receiver: { name: raw.receiverName || 'Unknown', phone: '—' },
    address: raw.destination || raw.origin || 'Unknown',
    city,
    weight: raw.weight || '—',
    dimensions: '—',
    contents: raw.item || '—',
    value: raw.value || '—',
    // The backend doesn't persist a service tier yet — Standard is a display
    // default, not a real recorded value.
    service: 'Standard',
    status: mapRealStatus(raw.status),
    registeredDate: createdAt,
    riderId,
    assignedRider: riderId ? (riderNameById[riderId] || riderId) : '',
    instructions: 'No special instructions.',
    trackingNumber: raw.trackingNumber || '—',
    estimatedDelivery: addDays(createdAt, 3).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }),
    lat: base.lat,
    lng: base.lng,
  };

  // Real per-scan history if the backend recorded any events; otherwise fall
  // back to the same synthetic cumulative-steps generator the fallback
  // dataset uses, so the Timeline tab is never empty.
  parcel.timeline = Array.isArray(raw.events) && raw.events.length > 0
    ? raw.events.map((ev) => ({
        status: mapRealStatus(ev.status),
        label: ev.event || 'Status update',
        location: ev.location || '—',
        timestamp: ev.time || '—',
      }))
    : buildTimeline(parcel);

  return parcel;
}

// ── Export helpers (CSV via Blob download, PDF via print window — no extra deps) ──

const EXPORT_COLUMNS = ['Parcel ID', 'Sender', 'Receiver', 'Delivery Address', 'Weight', 'Service', 'Assigned Rider', 'Date Created', 'Status'];

function rowValues(p) {
  return [p.id, p.sender.name, p.receiver.name, p.address, p.weight, p.service, p.assignedRider || 'Unassigned', fmtDate(p.registeredDate), p.status];
}

function exportCSV(rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [EXPORT_COLUMNS.map(esc).join(',')];
  rows.forEach((p) => lines.push(rowValues(p).map(esc).join(',')));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `manage-parcels-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportPDF(rows) {
  const w = window.open('', '_blank');
  if (!w) return;
  const head = EXPORT_COLUMNS.map((c) => `<th>${c}</th>`).join('');
  const body = rows.map((p) => `<tr>${rowValues(p).map((v) => `<td>${v}</td>`).join('')}</tr>`).join('');
  w.document.write(`<html><head><title>Manage Parcels Report</title><style>
    body{font-family:Arial,sans-serif;margin:24px;color:#1a1a1a}
    h1{color:#390955;margin-bottom:2px}
    p{color:#666;margin-top:0}
    table{width:100%;border-collapse:collapse;margin-top:16px}
    th,td{border:1px solid #e5e7eb;padding:8px 10px;text-align:left;font-size:12px}
    th{background:#390955;color:white;text-transform:uppercase;letter-spacing:0.4px}
    tr:nth-child(even){background:#faf8ff}
  </style></head><body>
    <h1>Manage Parcels — Report</h1>
    <p>Generated ${new Date().toLocaleString()} · ${rows.length} parcel(s)</p>
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    <script>window.print();</script>
  </body></html>`);
  w.document.close();
}

// ── Small presentational pieces ─────────────────────────────────────────────

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.Pending;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: c.bg, color: c.color, whiteSpace: 'nowrap', display: 'inline-block' }}>
      {status}
    </span>
  );
}

// Small reusable rider glyph — used in the table's Assigned Rider column,
// the modal header chip, and the icon action buttons.
function RiderIcon({ size = 10 }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width={size} height={size}>
      <circle cx="5.5" cy="17.5" r="3.5" /><circle cx="18.5" cy="17.5" r="3.5" />
      <path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM12 17.5V14l-3-3 4-3 2 3h2" />
    </svg>
  );
}

function RiderBadge({ name }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 6, background: RIDER_STYLE.bg, color: RIDER_STYLE.color, textTransform: 'uppercase', letterSpacing: 0.4, whiteSpace: 'nowrap' }}>
      <RiderIcon />
      {name || 'Unassigned'}
    </span>
  );
}

// ── Live GPS Mini-Map (adapted from GenerateParcelConfirmationStatus.jsx's
// MiniMap — same animated-pin/geofence-ring SVG, NCR bounds instead of US) ──

function MiniMap({ parcel, gps, geofence, allParcels }) {
  const VW = 400, VH = 200;
  const { minLat, maxLat, minLng, maxLng } = NCR_BOUNDS;
  const project = (lat, lng) => ({
    x: ((lng - minLng) / (maxLng - minLng)) * VW,
    y: VH - ((lat - minLat) / (maxLat - minLat)) * VH,
  });
  const pin = project(gps.lat, gps.lng);
  const gridLines = [];
  for (let i = 0; i <= 5; i++) {
    gridLines.push({ x1: 0, y1: (VH / 5) * i, x2: VW, y2: (VH / 5) * i });
    gridLines.push({ x1: (VW / 5) * i, y1: 0, x2: (VW / 5) * i, y2: VH });
  }
  return (
    <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1.5px solid #e0d5f0' }}>
      <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: '100%', display: 'block' }}>
        <rect width={VW} height={VH} fill="#e8ecf5" />
        {gridLines.map((l, i) => <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="rgba(57,9,85,0.08)" strokeWidth="1" />)}
        {allParcels.filter((p) => p.id !== parcel.id).map((p) => {
          const pt = project(p.lat, p.lng);
          return <circle key={p.id} cx={pt.x} cy={pt.y} r="4" fill="rgba(57,9,85,0.2)" stroke="white" strokeWidth="1" />;
        })}
        {geofence && (
          <>
            <circle cx={pin.x} cy={pin.y} r="32" fill="rgba(57,9,85,0.06)" stroke="rgba(57,9,85,0.25)" strokeWidth="1.5" strokeDasharray="5,3" />
            <circle cx={pin.x} cy={pin.y} r="18" fill="rgba(57,9,85,0.08)" stroke="rgba(57,9,85,0.35)" strokeWidth="1" />
          </>
        )}
        <circle cx={pin.x} cy={pin.y} r="22" fill="none" stroke="rgba(57,9,85,0.35)" strokeWidth="1.5">
          <animate attributeName="r" values="14;30" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.7;0" dur="2s" repeatCount="indefinite" />
        </circle>
        <ellipse cx={pin.x} cy={pin.y + 14} rx="7" ry="3" fill="rgba(0,0,0,0.18)" />
        <path d={`M${pin.x},${pin.y + 12} C${pin.x - 10},${pin.y + 2} ${pin.x - 10},${pin.y - 12} ${pin.x},${pin.y - 14} C${pin.x + 10},${pin.y - 12} ${pin.x + 10},${pin.y + 2} ${pin.x},${pin.y + 12}Z`} fill="#390955" stroke="white" strokeWidth="1.5" />
        <circle cx={pin.x} cy={pin.y - 5} r="3.5" fill="white" />
        <rect x={pin.x - 56} y={pin.y + 16} width="112" height="20" rx="4" fill="rgba(57,9,85,0.88)" />
        <text x={pin.x} y={pin.y + 29} textAnchor="middle" fill="white" fontSize="9" fontFamily="'Courier New', monospace" fontWeight="bold">
          {gps.lat.toFixed(4)}° N, {gps.lng.toFixed(4)}° E
        </text>
      </svg>
      <div style={{ position: 'absolute', top: 8, left: 8, background: geofence?.inside ? '#390955' : 'white', color: geofence?.inside ? 'white' : '#390955', border: '1.5px solid #390955', fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20 }}>
        {geofence ? (geofence.inside ? '✓ Inside Zone' : '✗ Outside Zone') : '● Live GPS'}
      </div>
      <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(255,255,255,0.9)', fontSize: 10, color: '#666', padding: '3px 8px', borderRadius: 4, fontFamily: 'monospace' }}>
        {gps.satellites} sats · ±{gps.accuracy}m
      </div>
    </div>
  );
}

// ── Delivery timeline stepper (from GenerateParcelStatusReport.jsx) ────────

function Timeline({ events }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {events.map((ev, i) => (
        <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 16, flexShrink: 0 }}>
            <div style={{ width: i === events.length - 1 ? 14 : 11, height: i === events.length - 1 ? 14 : 11, borderRadius: '50%', background: '#390955', border: '2px solid white', boxShadow: '0 0 0 2.5px rgba(57,9,85,0.18)', marginTop: 3 }} />
            {i < events.length - 1 && <div style={{ width: 2, flex: 1, minHeight: 24, background: 'rgba(57,9,85,0.12)', margin: '3px 0' }} />}
          </div>
          <div style={{ flex: 1, paddingBottom: i < events.length - 1 ? 16 : 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#390955', fontFamily: 'monospace', letterSpacing: 0.2 }}>{ev.timestamp}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a', margin: '3px 0 2px' }}>{ev.label}</div>
            <div style={{ fontSize: 11, color: '#999' }}>{ev.location}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Consolidated Parcel Modal (3 tabs, replaces the 3 legacy screens) ──────

const TABS = [
  { key: 'details',  label: 'Parcel Details' },
  { key: 'timeline', label: 'Timeline & Reports' },
  { key: 'pod',      label: 'GPS & Proof of Delivery' },
];

const tabPillStyle = (active) => ({
  padding: '6px 14px', borderRadius: 20, border: `1.5px solid ${active ? '#390955' : '#e0d5f0'}`,
  background: active ? '#390955' : 'white', color: active ? 'white' : '#555',
  fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
});

function ParcelModal({ parcel, onClose, allParcels }) {
  const [activeTab, setActiveTab] = useState('details');
  const [exportFmt, setExportFmt] = useState('pdf');

  // GPS / confirmation state — auto-acquires on open, mirroring
  // GenerateParcelConfirmationStatus.jsx's handleSelect() behavior.
  const [confirmCode] = useState(() => `CONF-${parcel.id}-${Math.random().toString(36).substr(2, 8).toUpperCase()}`);
  const [gps, setGps] = useState(null);
  const [geofence, setGeofence] = useState(null);
  const [mapLoading, setMapLoading] = useState(true);
  const [signature, setSignature] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      const jitter = () => (Math.random() - 0.5) * 0.01;
      const lat = parseFloat((parcel.lat + jitter()).toFixed(6));
      const lng = parseFloat((parcel.lng + jitter()).toFixed(6));
      setGps({ lat, lng, accuracy: (Math.random() * 8 + 2).toFixed(1), satellites: Math.floor(Math.random() * 8 + 10) });
      const inside = Math.random() > 0.35;
      setGeofence({ inside, status: inside ? 'Inside Geofence' : 'Outside Geofence', zone: 'Delivery Zone A', radius: (Math.random() * 4 + 0.5).toFixed(2), distance: (Math.random() * 1.5 + 0.1).toFixed(2) });
      setMapLoading(false);
    }, 800);
    return () => clearTimeout(t);
  }, [parcel.id, parcel.lat, parcel.lng]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleRefreshGPS = () => {
    setMapLoading(true);
    setTimeout(() => {
      const jitter = () => (Math.random() - 0.5) * 0.01;
      const lat = parseFloat((parcel.lat + jitter()).toFixed(6));
      const lng = parseFloat((parcel.lng + jitter()).toFixed(6));
      setGps({ lat, lng, accuracy: (Math.random() * 8 + 2).toFixed(1), satellites: Math.floor(Math.random() * 8 + 10) });
      const inside = Math.random() > 0.35;
      setGeofence({ inside, status: inside ? 'Inside Geofence' : 'Outside Geofence', zone: 'Delivery Zone A', radius: (Math.random() * 4 + 0.5).toFixed(2), distance: (Math.random() * 1.5 + 0.1).toFixed(2) });
      setMapLoading(false);
    }, 600);
  };

  const handleGenerateSignature = () => {
    setSignature({ code: `SIG-${Math.random().toString(36).substr(2, 12).toUpperCase()}`, time: new Date().toLocaleTimeString(), date: new Date().toLocaleDateString(), by: 'Delivery Agent', condition: 'Good Condition' });
  };

  const reportDate = new Date().toLocaleString();
  const reportId = `RPT-${parcel.id}`;

  const handleExport = () => {
    if (exportFmt === 'csv') {
      const content = `Parcel ID,Timestamp,Event,Location\n${parcel.timeline.map((e) => `${parcel.id},"${e.timestamp}","${e.label}","${e.location}"`).join('\n')}`;
      const blob = new Blob([content], { type: 'text/csv' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `report-${parcel.id}.csv`; a.click();
    } else if (exportFmt === 'txt') {
      const content = `DELIVERY STATUS REPORT\n${reportDate}\n\nParcel ID: ${parcel.id}\nTracking: ${parcel.trackingNumber}\nStatus: ${parcel.status}\n\nTIMELINE:\n${parcel.timeline.map((e) => `[${e.timestamp}] ${e.label} — ${e.location}`).join('\n')}`;
      const blob = new Blob([content], { type: 'text/plain' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `report-${parcel.id}.txt`; a.click();
    } else {
      exportPDF([parcel]);
    }
  };

  const handlePrint = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>Delivery Report</title><style>body{font-family:Arial,sans-serif;margin:20px}h1{color:#390955}table{width:100%;border-collapse:collapse}th,td{border:1px solid #e5e7eb;padding:10px;text-align:left}th{background:#f0eaf8}</style></head><body><h1>Delivery Status Report</h1><p>${reportId} · ${reportDate}</p><p><strong>Parcel:</strong> ${parcel.id} | <strong>Tracking:</strong> ${parcel.trackingNumber} | <strong>Status:</strong> ${parcel.status}</p><h3>Parcel Details</h3><p>Recipient: ${parcel.receiver.name}<br>Sender: ${parcel.sender.name}<br>Address: ${parcel.address}<br>Weight: ${parcel.weight} | Value: ${parcel.value} | Service: ${parcel.service}</p><h3>Delivery Timeline</h3><table><tr><th>Timestamp</th><th>Event</th><th>Location</th></tr>${parcel.timeline.map((e) => `<tr><td>${e.timestamp}</td><td>${e.label}</td><td>${e.location}</td></tr>`).join('')}</table><script>window.print();</script></body></html>`);
    w.document.close();
  };

  const svc = SERVICE_CONFIG[parcel.service] || SERVICE_CONFIG.Standard;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,5,35,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(3px)' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'white', borderRadius: 18, width: '100%', maxWidth: 720, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 32px 80px rgba(57,9,85,0.25)', animation: 'mp-modal-in 0.22s cubic-bezier(0.34,1.56,0.64,1) both' }}>

        {/* Header */}
        <div style={{ padding: '22px 24px 16px', borderBottom: '1.5px solid #f5f0ff', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', position: 'sticky', top: 0, background: 'white', zIndex: 1, borderRadius: '18px 18px 0 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
            <div style={{ width: 44, height: 44, background: '#390955', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" width="20" height="20"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#1a1a1a', letterSpacing: -0.4 }}>{parcel.id}</div>
              <div style={{ fontSize: 11, color: '#aaa', fontFamily: 'monospace', marginTop: 3 }}>{parcel.trackingNumber}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <RiderBadge name={parcel.assignedRider} />
            <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 6, background: svc.bg, color: svc.color }}>{parcel.service}</span>
            <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: '1.5px solid #e0d5f0', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: 14 }}>✕</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, padding: '14px 24px', borderBottom: '1px solid #ede8f8', flexWrap: 'wrap' }}>
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setActiveTab(t.key)} style={tabPillStyle(activeTab === t.key)}>{t.label}</button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ padding: '20px 24px 24px' }}>

          {activeTab === 'details' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[{ label: 'From', name: parcel.sender.name, sub: parcel.sender.phone }, { label: 'To', name: parcel.receiver.name, sub: parcel.receiver.phone }].map(({ label, name, sub }) => (
                  <div key={label} style={{ background: '#faf8ff', border: '1.5px solid #ebe4f5', borderRadius: 10, padding: '14px 15px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a' }}>{name}</div>
                    {sub && <div style={{ fontSize: 11, color: '#888', marginTop: 3, fontFamily: 'monospace' }}>{sub}</div>}
                  </div>
                ))}
              </div>

              <div style={{ background: '#faf8ff', border: '1.5px solid #ebe4f5', borderRadius: 10, padding: '14px 15px', display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#390955" strokeWidth="2" width="15" height="15" style={{ flexShrink: 0, marginTop: 2 }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Delivery Address</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a' }}>{parcel.address}</div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#390955', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Package Details</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {[['Weight', parcel.weight], ['Dimensions', parcel.dimensions], ['Value', parcel.value], ['Contents', parcel.contents], ['Email', parcel.sender.email], ['Assigned Rider', parcel.assignedRider || 'Unassigned'], ['Date Created', fmtDate(parcel.registeredDate)], ['Est. Delivery', parcel.estimatedDelivery]].map(([l, v]) => (
                    <div key={l} style={{ background: 'white', border: '1px solid #ebe4f5', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ fontSize: 10, color: '#aaa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 }}>{l}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#1a1a1a', wordBreak: 'break-all' }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start', background: '#f5f0ff', border: '1.5px solid #ddd0f8', borderRadius: 10, padding: '13px 15px' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#390955" strokeWidth="2" width="15" height="15" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#390955', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Special Instructions</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#390955' }}>{parcel.instructions}</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'timeline' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 24 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: STATUS_COLORS[parcel.status]?.bg, borderRadius: 8, marginBottom: 18 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLORS[parcel.status]?.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: STATUS_COLORS[parcel.status]?.color }}>{parcel.status}</span>
                </div>
                <Timeline events={parcel.timeline} />
              </div>

              <div>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#390955', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 12 }}>Export &amp; Print</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                  {EXPORT_FORMATS.map((fmt) => (
                    <div key={fmt.key} onClick={() => setExportFmt(fmt.key)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', background: exportFmt === fmt.key ? '#f0eaf8' : 'white', border: `1.5px solid ${exportFmt === fmt.key ? '#390955' : '#e8e0f5'}`, borderRadius: 8, cursor: 'pointer' }}>
                      <div style={{ width: 28, height: 28, background: '#390955', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" width="13" height="13"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#1a1a1a' }}>{fmt.label}</div>
                        <div style={{ fontSize: 10, color: '#bbb' }}>{fmt.desc}</div>
                      </div>
                      {exportFmt === fmt.key && (
                        <div style={{ width: 18, height: 18, background: '#390955', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" width="9" height="9"><polyline points="20 6 9 17 4 12" /></svg>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <button onClick={handleExport} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: 10, background: '#390955', color: 'white', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', width: '100%', fontFamily: 'inherit', marginBottom: 8 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" width="13" height="13"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /></svg>
                  Export as {exportFmt.toUpperCase()}
                </button>
                <button onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: 10, background: 'white', color: '#390955', border: '2px solid #390955', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', width: '100%', fontFamily: 'inherit' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#390955" strokeWidth="2" width="13" height="13"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
                  Print Report
                </button>
              </div>
            </div>
          )}

          {activeTab === 'pod' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {/* GPS & Geofence */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#390955', textTransform: 'uppercase', letterSpacing: 0.7 }}>Live GPS &amp; Geofence</div>
                  {mapLoading && <span style={{ fontSize: 11, color: '#390955', fontWeight: 700 }}>Locating…</span>}
                </div>
                {mapLoading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '40px 16px', background: '#faf8ff', border: '1.5px dashed #d4c8e8', borderRadius: 10, textAlign: 'center' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="#c4a8d8" strokeWidth="2" width="28" height="28"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" strokeLinecap="round" stroke="#390955" /></svg>
                    <p style={{ fontSize: 12, color: '#bbb', margin: 0 }}>Acquiring GPS signal…</p>
                  </div>
                ) : gps && (
                  <>
                    <MiniMap parcel={parcel} gps={gps} geofence={geofence} allParcels={allParcels} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                      {[['Latitude', `${gps.lat.toFixed(5)}° N`], ['Longitude', `${gps.lng.toFixed(5)}° E`], ['Accuracy', `±${gps.accuracy} m`], ['Satellites', `${gps.satellites} locked`]].map(([l, v]) => (
                        <div key={l} style={{ background: '#faf8ff', border: '1px solid #e8e0f5', borderRadius: 8, padding: '9px 11px' }}>
                          <div style={{ fontSize: 10, color: '#aaa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>{l}</div>
                          <strong style={{ fontSize: 12, fontWeight: 800, color: '#390955', fontFamily: "'Courier New', monospace" }}>{v}</strong>
                        </div>
                      ))}
                    </div>
                    {geofence && (
                      <div style={{ background: geofence.inside ? '#f37021' : 'white', border: `1.5px solid ${geofence.inside ? '#f37021' : '#e8e0f5'}`, borderRadius: 9, padding: '11px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 800, color: geofence.inside ? 'white' : '#390955' }}>{geofence.status}</div>
                          <div style={{ fontSize: 10, color: geofence.inside ? 'rgba(255,255,255,0.7)' : '#aaa', marginTop: 2 }}>{geofence.zone} · r={geofence.radius}km · d={geofence.distance}km</div>
                        </div>
                        <span style={{ fontSize: 22 }}>{geofence.inside ? '✅' : '⚠️'}</span>
                      </div>
                    )}
                    <button onClick={handleRefreshGPS} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px 16px', background: '#390955', color: 'white', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', width: '100%', fontFamily: 'inherit', marginTop: 12 }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" width="13" height="13"><path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
                      Refresh GPS &amp; Geofence
                    </button>
                  </>
                )}
              </div>

              {/* Confirmation & Signature */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#390955', textTransform: 'uppercase', letterSpacing: 0.7 }}>Delivery Confirmation &amp; Signature</div>
                  {signature && <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: '#f37021', color: 'white' }}>✓ Confirmed</span>}
                </div>
                <div style={{ fontSize: 11, color: '#aaa', marginBottom: 12 }}>{confirmCode}</div>
                <button onClick={handleGenerateSignature} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: 10, background: 'white', color: '#390955', border: '2px solid #390955', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', width: '100%', fontFamily: 'inherit', marginBottom: 16 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#390955" strokeWidth="2" width="13" height="13"><polyline points="20 6 9 17 4 12" /></svg>
                  {signature ? 'Re-generate Signature' : 'Generate Delivery Signature'}
                </button>

                {!signature ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '40px 16px', background: '#faf8ff', border: '1.5px dashed #d4c8e8', borderRadius: 10, textAlign: 'center' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="#c4a8d8" strokeWidth="1.5" width="40" height="40"><polyline points="20 6 9 17 4 12" /></svg>
                    <p style={{ fontSize: 12, color: '#bbb', margin: 0 }}>Click above to generate a delivery signature for <strong style={{ color: '#390955' }}>{parcel.id}</strong></p>
                  </div>
                ) : (
                  <>
                    <div style={{ background: '#f37021', borderRadius: 12, padding: 18, color: 'white', display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, opacity: 0.75 }}>Delivery Signature</div>
                      <div style={{ fontSize: 13, fontWeight: 800, fontFamily: "'Courier New', monospace", letterSpacing: 1, background: 'rgba(255,255,255,0.15)', padding: '10px 13px', borderRadius: 7, wordBreak: 'break-all' }}>{signature.code}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        {[['Delivered By', signature.by], ['Time', signature.time], ['Date', signature.date], ['Condition', signature.condition]].map(([l, v]) => (
                          <div key={l}>
                            <div style={{ fontSize: 10, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 }}>{l}</div>
                            <strong style={{ fontSize: 12 }}>{v}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ background: '#faf8ff', border: '1.5px solid #e8e0f5', borderRadius: 12, padding: 16, marginTop: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#390955', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12, paddingBottom: 10, borderBottom: '1.5px solid #f0eaf8' }}>Delivery Summary</div>
                      {[
                        ['Tracking',       parcel.trackingNumber, true],
                        ['Sender',         parcel.sender.name,    false],
                        ['Receiver',       parcel.receiver.name,  false],
                        ['Address',        parcel.address,        false],
                        ['Assigned Rider', parcel.assignedRider || 'Unassigned', false],
                        ['GPS',            gps ? `${gps.lat.toFixed(4)}°N, ${gps.lng.toFixed(4)}°E` : 'N/A', true],
                        ['Geofence',       geofence?.status ?? 'N/A', false],
                        ['Confirmation',   confirmCode,           true],
                        ['Signature Code', signature.code,        true],
                      ].map(([l, v, mono]) => (
                        <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '7px 0', fontSize: 12, color: '#666', borderBottom: '1px solid #f0eaf8', gap: 8 }}>
                          <span style={{ flexShrink: 0 }}>{l}</span>
                          <strong style={{ color: '#1a1a1a', textAlign: 'right', wordBreak: 'break-word', fontFamily: mono ? "'Courier New', monospace" : 'inherit', fontSize: 11, maxWidth: '60%' }}>{v}</strong>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Toolbar (search + status filter + Export PDF/CSV) ──────────────────────

function Toolbar({ search, setSearch, statusFilter, setStatusFilter, onExportCSV, onExportPDF, resultCount }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const onClickOutside = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div style={{ padding: '12px 20px', background: '#fdfcff', borderBottom: '1px solid #f5f0ff', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
      <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 380 }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="#c4a8d8" strokeWidth="2" width="15" height="15" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
          <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          className="mp-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search parcels, sender, receiver…"
          style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px 9px 36px', border: '1.5px solid #e0d5f0', borderRadius: 8, fontSize: 13, color: '#1a1a1a', background: 'white', fontFamily: 'inherit', outline: 'none' }}
        />
      </div>

      <select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
        className="mp-select"
        style={{ padding: '9px 12px', border: '1.5px solid #e0d5f0', borderRadius: 8, fontSize: 13, color: '#1a1a1a', background: 'white', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}
      >
        <option value="All">All Statuses</option>
        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>

      <span style={{ fontSize: 12, color: '#aaa' }}>{resultCount} result{resultCount !== 1 ? 's' : ''}</span>

      <div ref={menuRef} style={{ position: 'relative', marginLeft: 'auto' }}>
        <button onClick={() => setMenuOpen((v) => !v)} className="mp-export-btn"
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 15px', borderRadius: 8, border: 'none', background: '#f37021', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" width="13" height="13"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
          Export PDF/CSV
        </button>
        {menuOpen && (
          <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', background: 'white', border: '1px solid #e0d5f0', borderRadius: 10, boxShadow: '0 12px 32px rgba(57,9,85,0.14)', overflow: 'hidden', minWidth: 170, zIndex: 20 }}>
            <button onClick={() => { onExportCSV(); setMenuOpen(false); }} style={menuItemStyle}>📄 Export as CSV</button>
            <button onClick={() => { onExportPDF(); setMenuOpen(false); }} style={menuItemStyle}>🖨️ Export as PDF</button>
          </div>
        )}
      </div>
    </div>
  );
}

const menuItemStyle = { display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'transparent', border: 'none', color: '#1a1a1a', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };

// Small square icon-button used by the Assign Rider action in the Actions
// column — same outline-purple-hovers-to-orange treatment as the existing
// "View" pill, just icon-only and more compact.
const iconBtnStyle = { width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '1.5px solid #390955', background: 'white', color: '#390955', cursor: 'pointer', fontFamily: 'inherit' };

// ── Assign Rider (popover menu attached to its own action-column button) ───

function AssignRiderButton({ parcel, riders, onAssign }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClickOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={() => setOpen((v) => !v)} className="mp-icon-btn" title="Assign Rider" style={iconBtnStyle}>
        <RiderIcon size={13} />
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', background: 'white', border: '1px solid #e0d5f0', borderRadius: 10, boxShadow: '0 12px 32px rgba(57,9,85,0.14)', overflow: 'hidden', minWidth: 160, maxHeight: 260, overflowY: 'auto', zIndex: 20, textAlign: 'left' }}>
          <div style={{ padding: '8px 14px', fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.4 }}>Assign Rider</div>
          {riders.length === 0 ? (
            <div style={{ padding: '10px 14px', fontSize: 12, color: '#bbb' }}>No riders available.</div>
          ) : riders.map((r) => (
            <button key={r.riderId} onClick={() => { onAssign(parcel, r); setOpen(false); }}
              style={{ ...menuItemStyle, background: parcel.riderId === r.riderId ? '#f0eaf8' : 'transparent', color: parcel.riderId === r.riderId ? '#390955' : '#1a1a1a', fontWeight: parcel.riderId === r.riderId ? 700 : 600 }}>
              {parcel.riderId === r.riderId ? '✓ ' : ''}{r.riderName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function ManageParcels() {
  const [parcels, setParcels]           = useState([]);
  const [riders, setRiders]             = useState([]); // [{ riderId, riderName }] from GET /api/riders
  const [loading, setLoading]           = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);
  const [actionError, setActionError]   = useState('');
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [viewParcel, setViewParcel]     = useState(null);

  const flashActionError = (msg) => { setActionError(msg); setTimeout(() => setActionError(''), 4000); };

  const loadData = async () => {
    setLoading(true);
    try {
      const [parcelsRes, ridersRes] = await Promise.all([fetch(PARCELS_API), fetch(RIDERS_API)]);
      if (!parcelsRes.ok) throw new Error(`Parcels endpoint responded ${parcelsRes.status}`);
      const [parcelsData, ridersData] = await Promise.all([
        parcelsRes.json(),
        ridersRes.ok ? ridersRes.json() : Promise.resolve([]),
      ]);

      const riderList = (Array.isArray(ridersData) ? ridersData : [])
        .filter((r) => String(r.status || '').toLowerCase() !== 'archived')
        .map((r) => ({ riderId: r.registrationId || r._id, riderName: r.riderName || 'Unknown Rider' }));
      const riderNameById = {};
      riderList.forEach((r) => { riderNameById[r.riderId] = r.riderName; });

      const normalized = (Array.isArray(parcelsData) ? parcelsData : []).map((p) => normalizeParcel(p, riderNameById));

      setParcels(normalized);
      setRiders(riderList);
      setUsingFallback(false);
    } catch (err) {
      console.error('ManageParcels: falling back to sample data —', err);
      setParcels(FALLBACK_PARCELS);
      setRiders([]);
      setUsingFallback(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return parcels.filter((p) => {
      if (statusFilter !== 'All' && p.status !== statusFilter) return false;
      if (!q) return true;
      return (
        p.id.toLowerCase().includes(q) ||
        p.sender.name.toLowerCase().includes(q) ||
        p.receiver.name.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q) ||
        (p.assignedRider && p.assignedRider.toLowerCase().includes(q))
      );
    });
  }, [parcels, search, statusFilter]);

  // Persists the assignment to the real parcel record (PUT /api/parcels/:id)
  // when we're on live data; in fallback mode (API unreachable) there's
  // nothing real to persist to, so it just updates local state like before.
  const handleAssignRider = async (parcel, rider) => {
    const prevParcels = parcels;
    setParcels((prev) => prev.map((p) => (p.id === parcel.id ? { ...p, riderId: rider.riderId, assignedRider: rider.riderName } : p)));

    if (usingFallback || !parcel._id) return;
    try {
      const res = await fetch(`${PARCELS_API}/${parcel._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ riderId: rider.riderId }),
      });
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
    } catch (err) {
      console.error('Error assigning rider:', err);
      setParcels(prevParcels);
      flashActionError(`Could not assign ${rider.riderName} to ${parcel.id} — server error. Please try again.`);
    }
  };

  const COLS = ['Parcel ID', 'Sender', 'Receiver', 'Delivery Address', 'Weight', 'Assigned Rider', 'Status'];

  return (
    <div style={{ flex: 1, overflowY: 'auto', backgroundColor: '#f9f7ff', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
      <style>{`
        @keyframes mp-modal-in { from { opacity:0; transform:scale(0.95) translateY(10px); } to { opacity:1; transform:scale(1) translateY(0); } }

        .mp-search:focus, .mp-select:focus { border-color:#390955 !important; box-shadow:0 0 0 3px rgba(57,9,85,0.1); }
        .mp-export-btn:hover { filter:brightness(1.08); }
        .mp-row:hover td      { background:#f0eaf8 !important; }
        .mp-view-btn:hover, .mp-icon-btn:hover { background:#f37021 !important; color:white !important; border-color:#f37021 !important; }

        .mp-table-wrap { width:100%; overflow-x:auto; -webkit-overflow-scrolling:touch; }
        .mp-table-wrap table { width:100%; min-width:1040px; border-collapse:collapse; font-size:13px; }
      `}</style>

      {viewParcel && <ParcelModal key={viewParcel.id} parcel={viewParcel} onClose={() => setViewParcel(null)} allParcels={parcels} />}

      {/* Header */}
      <header style={{ background: 'white', borderBottom: '1px solid #e0d5f0', padding: '24px 32px 20px' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#1a1a1a', letterSpacing: -0.5, margin: '0 0 4px 0' }}>Manage Parcels</h1>
        <p style={{ fontSize: 13, color: '#666', margin: '2px 0 0 0' }}>Peer-to-peer parcel registry, delivery status &amp; rider assignment in one view</p>
        <nav style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
          <span style={{ fontSize: 12, color: '#666', fontWeight: 500 }}>Dashboard</span>
          <span style={{ fontSize: 12, color: '#d4c8e8' }}>/</span>
          <span style={{ fontSize: 12, color: '#666', fontWeight: 500 }}>Parcel Information Management</span>
          <span style={{ fontSize: 12, color: '#d4c8e8' }}>/</span>
          <span style={{ fontSize: 12, color: '#390955', fontWeight: 600 }}>Manage Parcels</span>
        </nav>
      </header>

      {/* Body */}
      <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {usingFallback && !loading && (
          <div style={{ padding: '12px 16px', background: '#fff4ec', color: '#c2410c', border: '1px solid #f9d4b6', borderRadius: 10, fontSize: 12.5, fontWeight: 600 }}>
            ⚠️ Showing sample parcels — the live server didn't respond. Rider assignment won't be saved until it's back.
          </div>
        )}
        {actionError && (
          <div style={{ padding: '12px 16px', background: '#fdf2f2', color: '#9b1c1c', border: '1px solid #fecaca', borderRadius: 10, fontSize: 12.5, fontWeight: 600 }}>
            ❌ {actionError}
          </div>
        )}
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e8e0f0', boxShadow: '0 2px 8px rgba(57,9,85,0.05)', overflow: 'hidden' }}>

          {/* Panel header */}
          <div style={{ padding: '16px 20px', borderBottom: '1.5px solid #f0eaf8', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 28, height: 28, background: '#f37021', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" width="14" height="14"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>
            </div>
            <div>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a', margin: 0 }}>Parcel List</h2>
              <p style={{ fontSize: 11, color: '#888', margin: '1px 0 0' }}>{filtered.length} of {parcels.length} records — All active shipments and assigned rider tracking</p>
            </div>
          </div>

          <Toolbar
            search={search} setSearch={setSearch}
            statusFilter={statusFilter} setStatusFilter={setStatusFilter}
            onExportCSV={() => exportCSV(filtered)}
            onExportPDF={() => exportPDF(filtered)}
            resultCount={filtered.length}
          />

          <div className="mp-table-wrap">
            <table>
              <thead>
                <tr style={{ background: '#390955' }}>
                  {COLS.map((h) => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: 'white', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                  <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 700, color: 'white', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={COLS.length + 1} style={{ padding: '48px 20px', textAlign: 'center', color: '#aaa', fontSize: 13 }}>Loading parcels…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={COLS.length + 1} style={{ padding: '48px 20px', textAlign: 'center', color: '#aaa', fontSize: 13 }}>No parcels found matching your search.</td></tr>
                ) : filtered.map((p, idx) => (
                  <tr key={p.id} className="mp-row" style={{ background: idx % 2 === 0 ? 'white' : '#faf9ff' }}>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#390955', fontWeight: 700, whiteSpace: 'nowrap', borderBottom: '1px solid #f3f0f8' }}>{p.id}</td>
                    <td style={{ padding: '12px 16px', color: '#1a1a1a', fontWeight: 600, whiteSpace: 'nowrap', borderBottom: '1px solid #f3f0f8' }}>{p.sender.name}</td>
                    <td style={{ padding: '12px 16px', color: '#374151', whiteSpace: 'nowrap', borderBottom: '1px solid #f3f0f8' }}>{p.receiver.name}</td>
                    <td style={{ padding: '12px 16px', color: '#666', borderBottom: '1px solid #f3f0f8', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.address}</td>
                    <td style={{ padding: '12px 16px', color: '#374151', whiteSpace: 'nowrap', borderBottom: '1px solid #f3f0f8', textAlign: 'center' }}>{p.weight}</td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', borderBottom: '1px solid #f3f0f8' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: p.assignedRider ? '#1a1a1a' : '#bbb', fontWeight: 600, fontSize: 12 }}>
                        <span style={{ color: '#7c3aed' }}><RiderIcon size={13} /></span>
                        {p.assignedRider || 'Unassigned'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', borderBottom: '1px solid #f3f0f8' }}><StatusBadge status={p.status} /></td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', borderBottom: '1px solid #f3f0f8' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <button onClick={() => setViewParcel(p)} className="mp-view-btn" title="View"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 6, border: '1.5px solid #390955', background: 'white', color: '#390955', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                          View
                        </button>
                        <AssignRiderButton parcel={p} riders={riders} onAssign={handleAssignRider} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div style={{ padding: '10px 20px', borderTop: '1px solid #f0eaf8', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#aaa' }}>Showing {filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {['Delivered', 'In Transit', 'Pending'].map((s) => (
                <span key={s} style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: STATUS_COLORS[s]?.bg, color: STATUS_COLORS[s]?.color }}>
                  {s}: {parcels.filter((p) => p.status === s).length}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
