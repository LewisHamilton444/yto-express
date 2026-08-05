'use client';
import React, { useState, useEffect, useMemo, useRef } from 'react';

/**
 * ManageParcels.jsx
 * ──────────────────────────────────────────────────────────────────────────
 * Standalone, consolidated admin view that merges three legacy screens:
 *   1. View Registered Parcels
 *   2. Generate Parcel Confirmation Status
 *   3. General Parcel Status Report
 *
 * This file is 100% self-contained and renders from local mock data — it
 * does not call the live API, so it's safe to drop into the app and test
 * without touching the real MongoDB / Render backend.
 *
 * When you're ready to wire it to real data, replace the `useEffect` below
 * (the one that seeds `parcels` from MOCK_PARCELS) with a fetch against your
 * existing endpoints, e.g.:
 *
 *   useEffect(() => {
 *     Promise.all([
 *       fetch('https://yto-express.onrender.com/api/parcels').then(r => r.json()),
 *       fetch('https://yto-express.onrender.com/api/sellers').then(r => r.json()),
 *     ]).then(([parcelsData, sellersData]) => {
 *       setParcels(mapApiParcelsToViewModel(parcelsData, sellersData));
 *       setLoading(false);
 *     });
 *   }, []);
 *
 * Field names on the parcel objects intentionally mirror a typical MongoDB
 * parcel schema (parcel_id, sender, receiver, status, address, ...) so the
 * mapping layer above is a thin, obvious translation from your real schema
 * (trackingNumber, senderName, receiverName, sellerId, riderId, events[]).
 */

// ── Reference Data ──────────────────────────────────────────────────────────

const STATUSES = ['Pending', 'Picked Up', 'In Transit', 'Out for Delivery', 'Delivered'];

const STATUS_STYLES = {
  'Pending':          { color: '#cbd5e1', bg: 'rgba(148,163,184,0.16)', border: 'rgba(148,163,184,0.32)', dot: '#94a3b8' },
  'Picked Up':        { color: '#7dd3fc', bg: 'rgba(56,189,248,0.14)',  border: 'rgba(56,189,248,0.30)',  dot: '#38bdf8' },
  'In Transit':       { color: '#d8b4fe', bg: 'rgba(168,85,247,0.16)',  border: 'rgba(168,85,247,0.34)',  dot: '#a855f7' },
  'Out for Delivery': { color: '#fdba74', bg: 'rgba(251,146,60,0.16)',  border: 'rgba(251,146,60,0.34)',  dot: '#fb923c' },
  'Delivered':        { color: '#86efac', bg: 'rgba(74,222,128,0.15)',  border: 'rgba(74,222,128,0.32)',  dot: '#4ade80' },
};

const SERVICE_STYLES = {
  Standard:  { color: '#93c5fd', bg: 'rgba(59,130,246,0.14)' },
  Express:   { color: '#d8b4fe', bg: 'rgba(168,85,247,0.14)' },
  Overnight: { color: '#fdba74', bg: 'rgba(251,146,60,0.14)' },
};

const ORIGIN_STYLES = {
  Seller:   { color: '#d8b4fe', bg: 'rgba(168,85,247,0.14)', border: 'rgba(168,85,247,0.3)' },
  Customer: { color: '#7dd3fc', bg: 'rgba(56,189,248,0.14)', border: 'rgba(56,189,248,0.3)' },
};

// Approximate NCR-area coordinates, used only to place a pin on the
// Proof-of-Delivery map preview — never rendered as raw text.
const CITY_LATLNG = {
  'Makati City':       { lat: 14.5547, lng: 121.0244 },
  'Quezon City':       { lat: 14.6760, lng: 121.0437 },
  'Pasig City':        { lat: 14.5764, lng: 121.0851 },
  'Taguig City':       { lat: 14.5176, lng: 121.0509 },
  'Mandaluyong City':  { lat: 14.5794, lng: 121.0359 },
  'Manila':            { lat: 14.5995, lng: 120.9842 },
  'Parañaque City':    { lat: 14.4793, lng: 121.0198 },
  'San Juan City':     { lat: 14.6019, lng: 121.0355 },
  'Marikina City':     { lat: 14.6507, lng: 121.1029 },
  'Caloocan City':     { lat: 14.6488, lng: 120.9673 },
  'Las Piñas City':    { lat: 14.4499, lng: 120.9829 },
  'Muntinlupa City':   { lat: 14.4081, lng: 121.0415 },
};
const NCR_BOUNDS = { minLat: 14.35, maxLat: 14.75, minLng: 120.90, maxLng: 121.15 };

const RIDERS = {
  R014: { rider_id: 'RDR-014', rider_name: 'Mark Santos' },
  R022: { rider_id: 'RDR-022', rider_name: 'Liza Ramos' },
  R007: { rider_id: 'RDR-007', rider_name: 'Paolo Cruz' },
  R031: { rider_id: 'RDR-031', rider_name: 'Angela Reyes' },
};

// ── Mock Parcels (standalone — no live API calls) ──────────────────────────

const RAW_PARCELS = [
  { parcel_id: 'PKG-2026-0801', origin: { type: 'Seller',   name: 'GadgetHub PH' },
    sender: { name: 'GadgetHub PH', phone: '+63 917 555 0101', email: 'orders@gadgethub.ph' },
    receiver: { name: 'John Dela Cruz', phone: '+63 918 222 3344' },
    address: '123 Mabini St, Brgy. San Antonio, Makati City', city: 'Makati City',
    weight: '2.4 kg', dimensions: '30 x 20 x 15 cm', service: 'Express',
    status: 'Delivered', rider: RIDERS.R014, date: '2026-07-30',
    special_instructions: 'Handle with care — fragile electronics.' },

  { parcel_id: 'PKG-2026-0802', origin: { type: 'Customer', name: 'Ramon Villanueva' },
    sender: { name: 'Ramon Villanueva', phone: '+63 920 441 7712', email: 'ramon.v@gmail.com' },
    receiver: { name: 'Kristine Uy', phone: '+63 927 118 9902' },
    address: '45 Kalayaan Ave, Brgy. Central, Quezon City', city: 'Quezon City',
    weight: '1.1 kg', dimensions: '20 x 15 x 10 cm', service: 'Standard',
    status: 'In Transit', rider: RIDERS.R022, date: '2026-08-02',
    special_instructions: 'Call recipient before arrival.' },

  { parcel_id: 'PKG-2026-0803', origin: { type: 'Seller',   name: 'HomeStyle Living Co.' },
    sender: { name: 'HomeStyle Living Co.', phone: '+63 917 300 4488', email: 'logistics@homestyle.ph' },
    receiver: { name: 'Andrea Bautista', phone: '+63 915 662 0031' },
    address: '78 Shaw Blvd, Brgy. Kapitolyo, Pasig City', city: 'Pasig City',
    weight: '5.6 kg', dimensions: '45 x 35 x 25 cm', service: 'Standard',
    status: 'Out for Delivery', rider: RIDERS.R007, date: '2026-08-03',
    special_instructions: 'Leave with building guard if unavailable.' },

  { parcel_id: 'PKG-2026-0804', origin: { type: 'Customer', name: 'Michelle Tan' },
    sender: { name: 'Michelle Tan', phone: '+63 918 774 2201', email: 'mtan.ph@yahoo.com' },
    receiver: { name: 'Rafael Ocampo', phone: '+63 921 305 5567' },
    address: '12 McKinley Pkwy, Bonifacio Global City, Taguig City', city: 'Taguig City',
    weight: '0.8 kg', dimensions: '18 x 12 x 8 cm', service: 'Standard',
    status: 'Pending', rider: null, date: '2026-08-05',
    special_instructions: 'Signature required on delivery.' },

  { parcel_id: 'PKG-2026-0805', origin: { type: 'Seller',   name: 'TechTrend Gadgets' },
    sender: { name: 'TechTrend Gadgets', phone: '+63 917 902 3345', email: 'ship@techtrend.ph' },
    receiver: { name: 'Carlo Espino', phone: '+63 906 447 8821' },
    address: '9 Boni Ave, Brgy. Plainview, Mandaluyong City', city: 'Mandaluyong City',
    weight: '1.9 kg', dimensions: '25 x 18 x 12 cm', service: 'Express',
    status: 'Picked Up', rider: RIDERS.R031, date: '2026-08-04',
    special_instructions: 'Fragile — do not stack.' },

  { parcel_id: 'PKG-2026-0806', origin: { type: 'Seller',   name: 'BeautyBox PH' },
    sender: { name: 'BeautyBox PH', phone: '+63 917 220 6690', email: 'fulfillment@beautybox.ph' },
    receiver: { name: 'Grace Lim', phone: '+63 928 550 1123' },
    address: '221 Taft Ave, Ermita, Manila', city: 'Manila',
    weight: '0.6 kg', dimensions: '15 x 10 x 8 cm', service: 'Overnight',
    status: 'Delivered', rider: RIDERS.R014, date: '2026-07-29',
    special_instructions: 'Leave at door if not home.' },

  { parcel_id: 'PKG-2026-0807', origin: { type: 'Customer', name: 'Noel Ferrer' },
    sender: { name: 'Noel Ferrer', phone: '+63 919 664 2287', email: 'noel.ferrer@gmail.com' },
    receiver: { name: 'Patricia Gomez', phone: '+63 917 883 4471' },
    address: '33 Dr. A. Santos Ave, Brgy. San Isidro, Parañaque City', city: 'Parañaque City',
    weight: '3.3 kg', dimensions: '32 x 24 x 18 cm', service: 'Standard',
    status: 'In Transit', rider: RIDERS.R022, date: '2026-08-01',
    special_instructions: 'No special instructions.' },

  { parcel_id: 'PKG-2026-0808', origin: { type: 'Seller',   name: 'PetCare Supplies Hub' },
    sender: { name: 'PetCare Supplies Hub', phone: '+63 917 400 1120', email: 'orders@petcarehub.ph' },
    receiver: { name: 'Samantha Cruz', phone: '+63 918 227 6634' },
    address: '5 N. Domingo St, San Juan City', city: 'San Juan City',
    weight: '6.2 kg', dimensions: '40 x 30 x 30 cm', service: 'Standard',
    status: 'Pending', rider: null, date: '2026-08-05',
    special_instructions: 'Heavy item — two-person carry recommended.' },

  { parcel_id: 'PKG-2026-0809', origin: { type: 'Seller',   name: 'OfficeMart Philippines' },
    sender: { name: 'OfficeMart Philippines', phone: '+63 917 556 8823', email: 'dispatch@officemart.ph' },
    receiver: { name: 'Daniel Reyes', phone: '+63 920 118 4429' },
    address: '88 Sumulong Hwy, Sto. Niño, Marikina City', city: 'Marikina City',
    weight: '2.1 kg', dimensions: '28 x 20 x 14 cm', service: 'Express',
    status: 'Delivered', rider: RIDERS.R007, date: '2026-07-28',
    special_instructions: 'Deliver to reception desk.' },

  { parcel_id: 'PKG-2026-0810', origin: { type: 'Customer', name: 'Angelica Soriano' },
    sender: { name: 'Angelica Soriano', phone: '+63 927 331 8809', email: 'angelica.s@outlook.com' },
    receiver: { name: 'Miguel Torres', phone: '+63 919 774 5512' },
    address: '17 EDSA cor. 10th Ave, Caloocan City', city: 'Caloocan City',
    weight: '1.5 kg', dimensions: '22 x 16 x 10 cm', service: 'Standard',
    status: 'Out for Delivery', rider: RIDERS.R031, date: '2026-08-04',
    special_instructions: 'Recipient works from home — any time is fine.' },

  { parcel_id: 'PKG-2026-0811', origin: { type: 'Seller',   name: 'FitGear Athletics' },
    sender: { name: 'FitGear Athletics', phone: '+63 917 663 9012', email: 'ship@fitgear.ph' },
    receiver: { name: 'Bianca Navarro', phone: '+63 915 220 7789' },
    address: '61 Alabang-Zapote Rd, Las Piñas City', city: 'Las Piñas City',
    weight: '4.0 kg', dimensions: '35 x 25 x 20 cm', service: 'Standard',
    status: 'Picked Up', rider: RIDERS.R014, date: '2026-08-05',
    special_instructions: 'No special instructions.' },

  { parcel_id: 'PKG-2026-0812', origin: { type: 'Customer', name: 'Ferdinand Aquino' },
    sender: { name: 'Ferdinand Aquino', phone: '+63 918 447 2290', email: 'ferdinand.aquino@gmail.com' },
    receiver: { name: 'Louis Domingo', phone: '+63 921 668 3345' },
    address: '30 Filinvest Ave, Alabang, Muntinlupa City', city: 'Muntinlupa City',
    weight: '1.2 kg', dimensions: '20 x 14 x 10 cm', service: 'Express',
    status: 'Delivered', rider: RIDERS.R022, date: '2026-07-31',
    special_instructions: 'Ring doorbell twice.' },
];

// ── Derived-data helpers ─────────────────────────────────────────────────────

function addHours(dateStr, hours) {
  const d = new Date(`${dateStr}T08:00:00`);
  d.setHours(d.getHours() + hours);
  return d;
}

function fmtDateTime(d) {
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function fmtDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const STEP_LABELS = [
  'Order registered & awaiting pickup',
  'Picked up from sender',
  'In transit to destination hub',
  'Out for delivery to receiver',
  'Delivered to receiver',
];
const STEP_OFFSET_HOURS = [0, 6, 26, 46, 52];

function buildTimeline(p) {
  const idx = STATUSES.indexOf(p.status);
  return STATUSES.slice(0, idx + 1).map((status, i) => {
    let location;
    if (i === 0) location = 'Origin Warehouse — Manila Sorting Hub';
    else if (i === 1) location = `Picked up — ${p.sender.name}`;
    else if (i === 2) location = 'Regional Sorting Hub';
    else if (i === 3) location = `Local Delivery Station — ${p.city}`;
    else location = p.address;

    return {
      status,
      label: STEP_LABELS[i],
      time: fmtDateTime(addHours(p.date, STEP_OFFSET_HOURS[i])),
      location,
      rider: i === 0 ? null : p.rider,
    };
  });
}

function buildProof(p) {
  if (p.status !== 'Delivered') return null;
  const base = CITY_LATLNG[p.city] || { lat: 14.6, lng: 121.0 };
  const jitter = () => (Math.random() - 0.5) * 0.01;
  const deliveredAt = fmtDateTime(addHours(p.date, STEP_OFFSET_HOURS[4]));
  return {
    delivered_at: deliveredAt,
    delivered_by: p.rider,
    gps: { lat: base.lat + jitter(), lng: base.lng + jitter() },
    signature: { signee: p.receiver.name, captured_at: deliveredAt },
  };
}

const MOCK_PARCELS = RAW_PARCELS.map((p) => ({
  ...p,
  scan_timeline: buildTimeline(p),
  proof_of_delivery: buildProof(p),
}));

// ── Export helpers (CSV via Blob download, PDF via print window — no extra deps) ──

const EXPORT_COLUMNS = ['Parcel ID', 'Origin', 'Sender', 'Receiver', 'Delivery Address', 'Weight', 'Service', 'Scanned By', 'Date', 'Status'];

function scannedByLabel(p) {
  return p.rider ? `${p.rider.rider_id} — ${p.rider.rider_name}` : 'Unassigned';
}

function rowValues(p) {
  return [p.parcel_id, p.origin.type, p.sender.name, p.receiver.name, p.address, p.weight, p.service, scannedByLabel(p), fmtDate(p.date), p.status];
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
  const s = STATUS_STYLES[status] || STATUS_STYLES.Pending;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, background: s.bg, border: `1px solid ${s.border}`, fontSize: 11, fontWeight: 700, color: s.color, whiteSpace: 'nowrap' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
      {status}
    </span>
  );
}

function OriginBadge({ type }) {
  const o = ORIGIN_STYLES[type] || ORIGIN_STYLES.Customer;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 6, background: o.bg, border: `1px solid ${o.border}`, fontSize: 10, fontWeight: 700, color: o.color, textTransform: 'uppercase', letterSpacing: 0.4, whiteSpace: 'nowrap' }}>
      {type === 'Seller' ? '🏬' : '👤'} {type}
    </span>
  );
}

function ServiceTag({ service }) {
  const s = SERVICE_STYLES[service] || SERVICE_STYLES.Standard;
  return <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 5, background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>{service}</span>;
}

// Deterministic pseudo-random pin placement inside the map card, derived
// from the parcel's real GPS coords — no raw lat/long is ever printed.
function pinPercent(gps) {
  const clamp = (v) => Math.min(96, Math.max(4, v));
  const x = clamp(((gps.lng - NCR_BOUNDS.minLng) / (NCR_BOUNDS.maxLng - NCR_BOUNDS.minLng)) * 100);
  const y = clamp(100 - ((gps.lat - NCR_BOUNDS.minLat) / (NCR_BOUNDS.maxLat - NCR_BOUNDS.minLat)) * 100);
  return { x, y };
}

function PODMap({ parcel }) {
  const { gps } = parcel.proof_of_delivery;
  const pin = pinPercent(gps);
  return (
    <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(168,85,247,0.25)', background: 'linear-gradient(135deg, #221735 0%, #2c1f47 100%)', height: 180 }}>
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, opacity: 0.35 }}>
        {[20, 40, 60, 80].map((v) => (
          <React.Fragment key={v}>
            <line x1={v} y1="0" x2={v} y2="100" stroke="#a855f7" strokeWidth="0.3" />
            <line x1="0" y1={v} x2="100" y2={v} stroke="#a855f7" strokeWidth="0.3" />
          </React.Fragment>
        ))}
      </svg>
      <div style={{ position: 'absolute', left: `${pin.x}%`, top: `${pin.y}%`, transform: 'translate(-50%, -100%)' }}>
        <div style={{ width: 30, height: 30, borderRadius: '50%', border: '2px solid #a855f7', position: 'absolute', top: 4, left: -9, animation: 'mp-ping 2s ease-out infinite' }} />
        <svg viewBox="0 0 24 24" width="26" height="26" fill="#a855f7" stroke="#1a1229" strokeWidth="1">
          <path d="M12 0C7 0 3 4 3 9c0 6.5 9 15 9 15s9-8.5 9-15c0-5-4-9-9-9z" />
          <circle cx="12" cy="9" r="3" fill="#1a1229" />
        </svg>
      </div>
      <div style={{ position: 'absolute', left: 10, bottom: 10, right: 10, background: 'rgba(15,10,26,0.75)', borderRadius: 8, padding: '7px 10px', fontSize: 11, color: '#e9defc', fontWeight: 600 }}>
        📍 Delivered near {parcel.address}
      </div>
    </div>
  );
}

function SignaturePad({ parcel }) {
  const { signature } = parcel.proof_of_delivery;
  return (
    <div style={{ border: '1px solid rgba(168,85,247,0.25)', borderRadius: 12, background: '#1a1229', padding: '16px 18px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#9c8fb5', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Rider-Captured Signature</div>
      <div style={{ background: '#f8f5ff', borderRadius: 8, padding: '14px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg viewBox="0 0 200 60" width="180" height="54">
          <path d="M8 40 C 20 10, 30 55, 42 25 S 62 5, 72 35 S 92 50, 105 20 S 130 8, 140 32 S 165 45, 185 15"
            fill="none" stroke="#390955" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 12 }}>
        <div>
          <div style={{ color: '#9c8fb5', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>Signed by</div>
          <div style={{ color: '#f4f0fb', fontWeight: 700, marginTop: 2 }}>{signature.signee}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: '#9c8fb5', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>Captured</div>
          <div style={{ color: '#f4f0fb', fontWeight: 700, marginTop: 2 }}>{signature.captured_at}</div>
        </div>
      </div>
    </div>
  );
}

function ScanTimeline({ events }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {events.map((ev, i) => {
        const s = STATUS_STYLES[ev.status] || STATUS_STYLES.Pending;
        const isLast = i === events.length - 1;
        return (
          <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 16, flexShrink: 0 }}>
              <div style={{ width: isLast ? 14 : 11, height: isLast ? 14 : 11, borderRadius: '50%', background: s.dot, border: '2px solid #1a1229', boxShadow: `0 0 0 2.5px ${s.bg}`, marginTop: 3 }} />
              {!isLast && <div style={{ width: 2, flex: 1, minHeight: 26, background: 'rgba(168,85,247,0.18)', margin: '3px 0' }} />}
            </div>
            <div style={{ flex: 1, paddingBottom: isLast ? 0 : 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#a855f7', fontFamily: 'monospace' }}>{ev.time}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#f4f0fb', margin: '3px 0 2px' }}>{ev.label}</div>
              <div style={{ fontSize: 11, color: '#9c8fb5' }}>{ev.location}</div>
              <div style={{ fontSize: 11, color: '#7a6d92', marginTop: 2 }}>
                Scanned by: {ev.rider ? `${ev.rider.rider_id} — ${ev.rider.rider_name}` : 'Not yet scanned'}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Consolidated Action Modal (3 tabs) ──────────────────────────────────────

const TABS = [
  { key: 'details',  label: 'Parcel Details' },
  { key: 'timeline', label: 'Scan Timeline' },
  { key: 'pod',      label: 'Proof of Delivery' },
];

function ParcelModal({ parcel, onClose }) {
  // NOTE: the parent mounts this with key={parcel.parcel_id}, so switching
  // to a different parcel remounts the modal and naturally resets activeTab
  // — no effect needed to sync it.
  const [activeTab, setActiveTab] = useState('details');

  // Close on Escape.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(8,5,15,0.7)', backdropFilter: 'blur(3px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 640, maxHeight: '88vh', overflowY: 'auto', background: '#170f24', border: '1px solid rgba(168,85,247,0.25)', borderRadius: 18, boxShadow: '0 32px 80px rgba(0,0,0,0.5)', animation: 'mp-modal-in 0.2s cubic-bezier(0.34,1.56,0.64,1) both' }}>

        {/* Header */}
        <div style={{ padding: '20px 22px 16px', borderBottom: '1px solid rgba(168,85,247,0.15)', position: 'sticky', top: 0, background: '#170f24', zIndex: 1, borderRadius: '18px 18px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 11, background: 'linear-gradient(135deg,#7c3aed,#a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" width="19" height="19"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#f4f0fb', letterSpacing: -0.3 }}>{parcel.parcel_id}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 5 }}>
                <OriginBadge type={parcel.origin.type} />
                <ServiceTag service={parcel.service} />
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StatusBadge status={parcel.status} />
            <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid rgba(168,85,247,0.25)', background: '#1f1730', cursor: 'pointer', color: '#c4b5e8', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, padding: '12px 22px 0', borderBottom: '1px solid rgba(168,85,247,0.15)' }}>
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setActiveTab(t.key)} className="mp-tab-btn"
              style={{
                padding: '9px 14px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
                background: 'transparent', border: 'none', borderBottom: activeTab === t.key ? '2px solid #a855f7' : '2px solid transparent',
                color: activeTab === t.key ? '#e9defc' : '#8a7ba8',
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ padding: '20px 22px 24px' }}>
          {activeTab === 'details' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'mp-fade-in 0.15s ease both' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ background: '#1a1229', border: '1px solid rgba(168,85,247,0.18)', borderRadius: 10, padding: '13px 15px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#8a7ba8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Sender</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#f4f0fb' }}>{parcel.sender.name}</div>
                  <div style={{ fontSize: 11, color: '#9c8fb5', marginTop: 3 }}>{parcel.sender.phone}</div>
                  <div style={{ fontSize: 11, color: '#9c8fb5' }}>{parcel.sender.email}</div>
                </div>
                <div style={{ background: '#1a1229', border: '1px solid rgba(168,85,247,0.18)', borderRadius: 10, padding: '13px 15px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#8a7ba8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Receiver</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#f4f0fb' }}>{parcel.receiver.name}</div>
                  <div style={{ fontSize: 11, color: '#9c8fb5', marginTop: 3 }}>{parcel.receiver.phone}</div>
                </div>
              </div>

              <div style={{ background: '#1a1229', border: '1px solid rgba(168,85,247,0.18)', borderRadius: 10, padding: '13px 15px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#8a7ba8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>Delivery Address</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#f4f0fb' }}>{parcel.address}</div>
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Package Details</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {[['Weight', parcel.weight], ['Dimensions', parcel.dimensions], ['Service', parcel.service], ['Origin', parcel.origin.type], ['Date', fmtDate(parcel.date)], ['Scanned By', scannedByLabel(parcel)]].map(([l, v]) => (
                    <div key={l} style={{ background: '#1f1730', border: '1px solid rgba(168,85,247,0.14)', borderRadius: 8, padding: '9px 11px' }}>
                      <div style={{ fontSize: 10, color: '#8a7ba8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 }}>{l}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#f4f0fb' }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.25)', borderRadius: 10, padding: '12px 14px' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#d8b4fe" strokeWidth="2" width="15" height="15" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#d8b4fe', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Special Instructions</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#e9defc' }}>{parcel.special_instructions}</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'timeline' && (
            <div style={{ animation: 'mp-fade-in 0.15s ease both' }}>
              <ScanTimeline events={parcel.scan_timeline} />
            </div>
          )}

          {activeTab === 'pod' && (
            <div style={{ animation: 'mp-fade-in 0.15s ease both' }}>
              {parcel.proof_of_delivery ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <PODMap parcel={parcel} />
                  <SignaturePad parcel={parcel} />
                  <div style={{ fontSize: 11, color: '#8a7ba8', textAlign: 'center' }}>
                    Delivered {parcel.proof_of_delivery.delivered_at} by {parcel.proof_of_delivery.delivered_by?.rider_name || 'rider'}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '40px 16px', background: '#1a1229', border: '1.5px dashed rgba(168,85,247,0.3)', borderRadius: 12, textAlign: 'center' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#6b5c87" strokeWidth="1.5" width="34" height="34"><polyline points="20 6 9 17 4 12" /></svg>
                  <p style={{ fontSize: 12, color: '#8a7ba8', margin: 0 }}>
                    Proof of delivery becomes available once <strong style={{ color: '#c4b5e8' }}>{parcel.parcel_id}</strong> is marked Delivered.
                    <br />Current status: <strong style={{ color: '#c4b5e8' }}>{parcel.status}</strong>
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Toolbar ──────────────────────────────────────────────────────────────────

function Toolbar({ search, setSearch, statusFilter, setStatusFilter, onExportCSV, onExportPDF, resultCount }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const onClickOutside = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '14px 22px', borderBottom: '1px solid rgba(168,85,247,0.15)', background: '#170f24' }}>
      {/* Search */}
      <div style={{ position: 'relative', flex: '1 1 260px', minWidth: 220, maxWidth: 380 }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="#7a6d92" strokeWidth="2" width="15" height="15" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
          <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search parcel ID, sender, receiver, rider…"
          className="mp-search"
          style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px 9px 34px', borderRadius: 9, border: '1px solid rgba(168,85,247,0.25)', background: '#1a1229', color: '#f4f0fb', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
        />
      </div>

      {/* Status filter */}
      <select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
        className="mp-select"
        style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid rgba(168,85,247,0.25)', background: '#1a1229', color: '#f4f0fb', fontSize: 13, fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}
      >
        <option value="All">All Statuses</option>
        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>

      <span style={{ fontSize: 12, color: '#8a7ba8' }}>{resultCount} result{resultCount !== 1 ? 's' : ''}</span>

      {/* Export */}
      <div ref={menuRef} style={{ position: 'relative', marginLeft: 'auto' }}>
        <button onClick={() => setMenuOpen((v) => !v)} className="mp-export-btn"
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 15px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#7c3aed,#a855f7)', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" width="13" height="13"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
          Export PDF/CSV
        </button>
        {menuOpen && (
          <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', background: '#1f1730', border: '1px solid rgba(168,85,247,0.25)', borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.4)', overflow: 'hidden', minWidth: 170, zIndex: 20 }}>
            <button onClick={() => { onExportCSV(); setMenuOpen(false); }} className="mp-menu-item" style={menuItemStyle}>📄 Export as CSV</button>
            <button onClick={() => { onExportPDF(); setMenuOpen(false); }} className="mp-menu-item" style={menuItemStyle}>🖨️ Export as PDF</button>
          </div>
        )}
      </div>
    </div>
  );
}

const menuItemStyle = { display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'transparent', border: 'none', color: '#e9defc', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };

// ── Main Component ──────────────────────────────────────────────────────────

export default function ManageParcels() {
  const [parcels, setParcels]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [viewParcel, setViewParcel]   = useState(null);

  // Standalone data load — swap this for a real fetch() when ready (see
  // the file header comment for the exact shape to map into).
  useEffect(() => {
    const t = setTimeout(() => {
      setParcels(MOCK_PARCELS);
      setLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return parcels.filter((p) => {
      const matchesStatus = statusFilter === 'All' || p.status === statusFilter;
      if (!matchesStatus) return false;
      if (!q) return true;
      return (
        p.parcel_id.toLowerCase().includes(q) ||
        p.sender.name.toLowerCase().includes(q) ||
        p.receiver.name.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q) ||
        (p.rider && p.rider.rider_name.toLowerCase().includes(q))
      );
    });
  }, [parcels, search, statusFilter]);

  const COLS = ['Origin / Source', 'Parcel ID', 'Sender', 'Receiver', 'Delivery Address', 'Weight', 'Service', 'Scanned By', 'Date', 'Status'];

  return (
    <div style={{ flex: 1, minHeight: '100vh', overflowY: 'auto', background: '#0f0a1a', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <style>{`
        @keyframes mp-modal-in { from { opacity:0; transform:scale(0.96) translateY(8px); } to { opacity:1; transform:scale(1) translateY(0); } }
        @keyframes mp-fade-in  { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }
        @keyframes mp-ping     { 0% { transform:scale(0.6); opacity:0.9; } 100% { transform:scale(1.6); opacity:0; } }

        .mp-search:focus, .mp-select:focus { border-color:#a855f7 !important; box-shadow:0 0 0 3px rgba(168,85,247,0.18); }
        .mp-export-btn:hover { filter:brightness(1.1); }
        .mp-menu-item:hover  { background:rgba(168,85,247,0.14) !important; }
        .mp-tab-btn:hover    { color:#e9defc !important; }
        .mp-row:hover td     { background:rgba(168,85,247,0.06) !important; }
        .mp-view-btn:hover   { background:#a855f7 !important; color:white !important; border-color:#a855f7 !important; }

        .mp-table-wrap { width:100%; overflow-x:auto; -webkit-overflow-scrolling:touch; }
        .mp-table-wrap table { width:100%; min-width:1080px; border-collapse:collapse; font-size:13px; }
        .mp-table-wrap::-webkit-scrollbar { height:8px; }
        .mp-table-wrap::-webkit-scrollbar-thumb { background:rgba(168,85,247,0.3); border-radius:8px; }
      `}</style>

      {viewParcel && <ParcelModal key={viewParcel.parcel_id} parcel={viewParcel} onClose={() => setViewParcel(null)} />}

      {/* Header */}
      <header style={{ background: '#170f24', borderBottom: '1px solid rgba(168,85,247,0.15)', padding: '24px 32px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg,#7c3aed,#a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" width="18" height="18"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#f4f0fb', letterSpacing: -0.4, margin: 0 }}>Manage Parcels</h1>
            <p style={{ fontSize: 12.5, color: '#9c8fb5', margin: '3px 0 0' }}>Unified registry, confirmation status &amp; delivery reporting — sellers &amp; customers in one view</p>
          </div>
        </div>
        <nav style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, paddingLeft: 50 }}>
          <span style={{ fontSize: 11, color: '#7a6d92' }}>Dashboard</span><span style={{ color: '#3a2d54', fontSize: 11 }}>/</span>
          <span style={{ fontSize: 11, color: '#7a6d92' }}>Parcel Information Management</span><span style={{ color: '#3a2d54', fontSize: 11 }}>/</span>
          <span style={{ fontSize: 11, color: '#d8b4fe', fontWeight: 700 }}>Manage Parcels</span>
        </nav>
      </header>

      <div style={{ padding: '22px 32px 40px' }}>
        <div style={{ background: '#170f24', border: '1px solid rgba(168,85,247,0.15)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 8px 30px rgba(0,0,0,0.25)' }}>

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
                <tr style={{ background: '#1a1229' }}>
                  {COLS.map((c) => (
                    <th key={c} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: '#c4b5e8', textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap', borderBottom: '1px solid rgba(168,85,247,0.18)' }}>{c}</th>
                  ))}
                  <th style={{ padding: '11px 14px', textAlign: 'center', fontSize: 10.5, fontWeight: 700, color: '#c4b5e8', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid rgba(168,85,247,0.18)' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={COLS.length + 1} style={{ padding: '48px 20px', textAlign: 'center', color: '#7a6d92', fontSize: 13 }}>Loading parcels…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={COLS.length + 1} style={{ padding: '48px 20px', textAlign: 'center', color: '#7a6d92', fontSize: 13 }}>No parcels match your search / filter.</td></tr>
                ) : filtered.map((p) => (
                  <tr key={p.parcel_id} className="mp-row" style={{ borderBottom: '1px solid rgba(168,85,247,0.08)' }}>
                    <td style={{ padding: '11px 14px' }}><OriginBadge type={p.origin.type} /></td>
                    <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontWeight: 700, fontSize: 12.5, color: '#d8b4fe', whiteSpace: 'nowrap' }}>{p.parcel_id}</td>
                    <td style={{ padding: '11px 14px', fontSize: 12.5, color: '#f4f0fb', whiteSpace: 'nowrap', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.sender.name}</td>
                    <td style={{ padding: '11px 14px', fontSize: 12.5, color: '#f4f0fb', whiteSpace: 'nowrap', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.receiver.name}</td>
                    <td style={{ padding: '11px 14px', fontSize: 12, color: '#9c8fb5', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.address}</td>
                    <td style={{ padding: '11px 14px', fontSize: 12.5, color: '#f4f0fb', whiteSpace: 'nowrap' }}>{p.weight}</td>
                    <td style={{ padding: '11px 14px' }}><ServiceTag service={p.service} /></td>
                    <td style={{ padding: '11px 14px', fontSize: 12, color: p.rider ? '#c4b5e8' : '#6b5c87', whiteSpace: 'nowrap' }}>{scannedByLabel(p)}</td>
                    <td style={{ padding: '11px 14px', fontSize: 12, color: '#9c8fb5', whiteSpace: 'nowrap' }}>{fmtDate(p.date)}</td>
                    <td style={{ padding: '11px 14px' }}><StatusBadge status={p.status} /></td>
                    <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                      <button onClick={() => setViewParcel(p)} className="mp-view-btn"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 13px', borderRadius: 7, border: '1px solid rgba(168,85,247,0.4)', background: 'transparent', color: '#d8b4fe', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ padding: '10px 22px', borderTop: '1px solid rgba(168,85,247,0.12)', display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#7a6d92' }}>
            <span>Showing {filtered.length} of {parcels.length} parcels</span>
            <span>Click "View" for full parcel details, scan timeline &amp; proof of delivery</span>
          </div>
        </div>
      </div>
    </div>
  );
}
