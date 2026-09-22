import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { apiFetch } from './services/api';
import StatusBadge from './components/ui/StatusBadge';
import { PARCEL_STATUS_COLORS } from './components/ui/statusColors';
import Modal from './components/ui/Modal';
import PageHeader from './components/ui/PageHeader';
import Tooltip from './components/ui/Tooltip';
import TableSkeleton from './components/ui/TableSkeleton';
import EmptyState from './components/ui/EmptyState';
import SectionCard from './components/ui/SectionCard';
import CardSectionHeader from './components/ui/CardSectionHeader';
import CardFooter from './components/ui/CardFooter';
import FilterBar from './components/ui/FilterBar';
import PaginationControls from './PaginationControls';
import RefreshButton from './components/ui/RefreshButton';
import ExportDropdown from './components/ui/ExportDropdown';
import { exportToCSV, exportToExcel, exportToWord, exportToPDF } from './exportUtils';
import {
  Check, CheckCircle2, CircleDot, FileDown, FileText, Package, X, XCircle,
  Hash, User, Users, Store, MapPin, Weight, Truck, Activity,
} from 'lucide-react';
import { normalizeParcelStatus } from './utils/parcelStatus';
import { resolveCityCoords } from './luzonCityCoords';

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
 *      → parcel detail modal layout, bridge-synced rider GPS map, POD photo
 *   3. GenerateParcelStatusReport.jsx       ("General Parcel Status Report")
 *      → delivery timeline stepper, Export & Print panel
 *
 * Fetches real parcels from GET /api/parcels and real riders from
 * GET /api/riders (for the Assign Rider list + resolving assignedRider
 * names), normalized via normalizeParcel() below. The page renders ONLY live
 * /api/parcels records — there is no fallback dataset; when the server is
 * unreachable an honest error banner appears instead of placeholder rows.
 *
 * Palette (unchanged from the legacy files):
 *   page bg #f9f7ff · card white / border #e8e0f0 · table header #390955
 *   (white uppercase text) · primary text #1a1a1a · secondary text #888
 *   accent / primary actions #f37021.
 */

// ── Reference Data ──────────────────────────────────────────────────────────

// 'Picked Up' and 'Out for Delivery' complete the delivery-lifecycle vocabulary
// but real /api/parcels records only ever carry pending/in-transit/delivered/
// returned/failed (see ProcessParcelInformation.jsx's status options) — those
// two extra values were added to represent that real vocabulary faithfully.
const STATUSES = ['Pending', 'Picked Up', 'In Transit', 'Out for Delivery', 'Delivered', 'Returned', 'Failed'];

// Status normalization is centralized in utils/parcelStatus.js — it maps both
// the legacy lowercase-hyphenated vocabulary AND the mobile backend's
// Title-case vocabulary ('Out for Delivery', 'Picked Up', 'Returning', ...)
// that arrive verbatim through the bridge. The old local 5-entry REAL_STATUS_MAP
// silently coerced every mobile-synced status it didn't know into "Pending".

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

// City-center coordinates for the list-level mini-map dots come from the
// shared Luzon lookup (luzonCityCoords.js). The local 13-city table and its
// NCR fallback center were removed in the truth-pass: an unknown city now
// yields no coordinate at all instead of pinning the parcel to a wrong island.
// The POD tab's MiniMap still plots only the REAL bridge-synced rider fix.

// Column definition for the parcel registry table — label + the icon that
// sits left of the header text, matching the Customers/Sellers/Riders tables.
const COLS = [
  { label: 'Tracking ID',      Icon: Hash,     sticky: true },
  { label: 'Sender',           Icon: User },
  { label: 'Receiver',         Icon: Users },
  { label: 'Pickup Address',   Icon: Store },
  { label: 'Delivery Address', Icon: MapPin },
  { label: 'Weight',           Icon: Weight,   align: 'right' },
  { label: 'Assigned Rider',   Icon: Truck },
  { label: 'Status',           Icon: Activity },
];

// ── Derived-data helpers ─────────────────────────────────────────────────────

function fmtDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Real-data adapter ───────────────────────────────────────────────────────
// Maps a raw /api/parcels document (trackingNumber, senderName, receiverName,
// item, weight, value, origin, destination, status, riderId, events[]) onto
// this page's display shape. Fields the real schema doesn't have yet
// (sender/receiver phone & email, dimensions, service tier, free-text
// instructions) get an honest placeholder rather than a fabricated value.
const SERVICE_LABELS = { express: 'Express', standard: 'Standard', overnight: 'Overnight', international: 'International' };
function mapServiceLabel(rawServiceType) {
  const key = String(rawServiceType || '').trim().toLowerCase();
  return SERVICE_LABELS[key] || '—';
}

function normalizeParcel(raw, riderNameById) {
  const city = raw.destination || raw.origin || '';
  // null when the destination/origin city isn't in the shared Luzon table —
  // the parcel then has no map position instead of a fabricated one.
  const base = resolveCityCoords(city);
  const createdAt = raw.createdAt ? raw.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const riderId = raw.riderId || '';

  // Real dimensions now sync from the mobile package.dimensions object
  // ({length,width,height} cm) via the bridge — format honestly, '—' when absent.
  const dims = raw.dimensions && Number(raw.dimensions.length) > 0
    ? `${Number(raw.dimensions.length)}×${Number(raw.dimensions.width)}×${Number(raw.dimensions.height)} cm`
    : '—';
  // Delivery dates: the app computes the ETA at booking and stamps the actual
  // delivery time on completion; both sync through the bridge now.
  const estDelivery = raw.estimatedDeliveryDate ? fmtDate(raw.estimatedDeliveryDate.slice(0, 10)) : '—';
  const actDelivery = raw.actualDeliveryDate ? fmtDate(String(raw.actualDeliveryDate).slice(0, 10)) : '—';

  const parcel = {
    id: raw.trackingNumber || raw._id,
    _id: raw._id,
    // Contact phones/emails now sync from the mobile sender/recipient via the
    // bridge (senderPhone / receiverPhone / senderEmail / recipientEmail on
    // the Parcel schema).
    sender: { name: raw.senderName || '—', phone: raw.senderPhone || '—', email: raw.senderEmail || '—' },
    receiver: { name: raw.receiverName || '—', phone: raw.receiverPhone || '—', email: raw.recipientEmail || '—' },
    pickupAddress: raw.origin || '—',
    deliveryAddress: raw.destination || raw.address || raw.origin || '—',
    address: raw.destination || raw.origin || '—',
    city,
    weight: raw.weight || '—',
    dimensions: dims,
    contents: raw.item || '—',
    productName: raw.item || '—',
    category: raw.packageCategory || '—',
    quantity: raw.packageCount ? `${raw.packageCount} pc(s)` : '1 pc',
    packagePhoto: raw.packagePhoto || '',
    value: raw.value || '—',
    // Service tier: packageType is the bridge-synced mobile package.type
    // (Standard/Express); serviceType remains the legacy web-created field.
    service: mapServiceLabel(raw.packageType || raw.serviceType),
    status: normalizeParcelStatus(raw.status),
    registeredDate: createdAt,
    riderId,
    assignedRider: riderId ? (riderNameById[riderId] || riderId) : '',
    // Delivery instructions: the bridge syncs the app's shipment `notes`
    // (field on Parcel since the phone-fields pass); the legacy web-only
    // `instructions` field is kept as fallback for pre-bridge rows.
    instructions: raw.notes || raw.instructions || '—',
    trackingNumber: raw.trackingNumber || '—',
    // Real ETA/actual delivery from the synced dates — '—' only when the
    // mobile side never supplied them.
    estimatedDelivery: estDelivery,
    actualDelivery: actDelivery,
    // Fee breakdown synced from mobile package.deliveryFee (the same value
    // shown on the app's booking summary). paymentMode/codAmount ride along
    // from the existing sync payload.
    deliveryFee: typeof raw.deliveryFee === 'number' && raw.deliveryFee > 0 ? `₱${raw.deliveryFee.toFixed(2)}` : '—',
    paymentMode: raw.paymentMode || '—',
    codAmount: typeof raw.codAmount === 'number' && raw.codAmount > 0 ? `₱${raw.codAmount.toFixed(2)}` : '—',
    lat: base ? base.lat : null,
    lng: base ? base.lng : null,
    podPhoto: raw.podPhoto || '',
    // Real last-known rider GPS fix, stamped by POST /api/bridge/receive-status
    // whenever the rider app sends coordinates with a status transition. When
    // absent, the POD tab shows an honest "no fix synced" state instead of a
    // jittered fake position (the random GPS/geofence generators were removed
    // as part of the admin truth-pass). Note city-center lat/lng remain for
    // the list-level map previews only; they are never shown as a live fix.
    riderLat: Number.isFinite(Number(raw.riderLat)) && raw.riderLat !== null && raw.riderLat !== undefined && String(raw.riderLat) !== '' ? Number(raw.riderLat) : null,
    riderLng: Number.isFinite(Number(raw.riderLng)) && raw.riderLng !== null && raw.riderLng !== undefined && String(raw.riderLng) !== '' ? Number(raw.riderLng) : null,
    riderGpsAt: raw.updatedAt || raw.createdAt || null,
  };

  // Real per-scan history when the backend recorded any events. When it
  // didn't, show ONE honest row (current status, no fabricated timestamps)
  // instead of the synthetic cumulative-steps generator — real parcels must
  // never display invented intermediate scans (demo fixtures keep theirs).
  parcel.timeline = Array.isArray(raw.events) && raw.events.length > 0
    ? raw.events.map((ev) => ({
        status: normalizeParcelStatus(ev.status),
        label: ev.event || 'Status update',
        location: ev.location || '—',
        timestamp: ev.time || '—',
      }))
    : [{
        status: parcel.status,
        label: 'No scan history recorded yet',
        location: 'Status events appear here as the mobile app scans this parcel',
        timestamp: fmtDate(createdAt),
      }];

  return parcel;
}

// ── Export helpers (CSV via Blob download, PDF via print window — no extra deps) ──

const EXPORT_COLUMNS = ['Tracking ID', 'Sender', 'Receiver', 'Pickup Address', 'Delivery Address', 'Weight', 'Service', 'Assigned Rider', 'Date Created', 'Status'];

const PARCEL_EXPORT_COLUMNS = [
  { key: 'id', label: 'Tracking ID' },
  { key: 'senderName', label: 'Sender' },
  { key: 'receiverName', label: 'Receiver' },
  { key: 'pickupAddress', label: 'Pickup Address' },
  { key: 'deliveryAddress', label: 'Delivery Address' },
  { key: 'weight', label: 'Weight' },
  { key: 'service', label: 'Service Level' },
  { key: 'assignedRider', label: 'Assigned Courier' },
  { key: 'dateCreated', label: 'Date Created' },
  { key: 'status', label: 'Status' },
];

function rowValues(p) {
  return [p.id, p.sender.name, p.receiver.name, p.pickupAddress, p.deliveryAddress || p.address, p.weight, p.service, p.assignedRider || 'Unassigned', fmtDate(p.registeredDate), p.status];
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

// DB-derived values are interpolated into printable HTML — escape them so a
// name/address/status can never break out of the report markup.
const escHtml = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function exportPDF(rows) {
  const w = window.open('', '_blank');
  if (!w) return;
  const head = EXPORT_COLUMNS.map(escHtml).join('');
  const body = rows.map((p) => `<tr>${rowValues(p).map((v) => `<td>${escHtml(v)}</td>`).join('')}</tr>`).join('');
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

// ── Rider-fix Mini-Map (adapted from GenerateParcelConfirmationStatus.jsx's
// MiniMap) — plots ONLY the real last-known rider fix synced through the
// bridge. Random jitter/geofence simulation removed in the truth-pass: every
// coordinate rendered here exists in the database.

function MiniMap({ parcel, allParcels }) {
  const VW = 400, VH = 200;
  // Bounds expand (with padding) to contain both the rider fix and every
  // other parcel's city-center position — unlike the fixed NCR box, this
  // stays correct for app-synced destinations (Pulilan/Bulacan, Cebu, ...).
  const pts = [
    { lat: parcel.riderLat, lng: parcel.riderLng, label: parcel.trackingNumber },
    ...allParcels.filter((p) => p.id !== parcel.id).map((p) => ({ lat: p.lat, lng: p.lng })),
  ].filter((pt) => Number.isFinite(pt.lat) && Number.isFinite(pt.lng));
  const lats = pts.map((pt) => pt.lat);
  const lngs = pts.map((pt) => pt.lng);
  const padLat = Math.max(0.04, (Math.max(...lats) - Math.min(...lats)) * 0.25);
  const padLng = Math.max(0.04, (Math.max(...lngs) - Math.min(...lngs)) * 0.25);
  const minLat = Math.min(...lats) - padLat, maxLat = Math.max(...lats) + padLat;
  const minLng = Math.min(...lngs) - padLng, maxLng = Math.max(...lngs) + padLng;
  const project = (lat, lng) => ({
    x: ((lng - minLng) / (maxLng - minLng || 1)) * VW,
    y: VH - ((lat - minLat) / (maxLat - minLat || 1)) * VH,
  });
  const pin = project(parcel.riderLat, parcel.riderLng);
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
        {allParcels.filter((p) => p.id !== parcel.id && Number.isFinite(p.lat) && Number.isFinite(p.lng)).map((p) => {
          const pt = project(p.lat, p.lng);
          return <circle key={p.id} cx={pt.x} cy={pt.y} r="4" fill="rgba(57,9,85,0.2)" stroke="white" strokeWidth="1" />;
        })}
        <circle cx={pin.x} cy={pin.y} r="22" fill="none" stroke="rgba(57,9,85,0.35)" strokeWidth="1.5">
          <animate attributeName="r" values="14;30" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.7;0" dur="2s" repeatCount="indefinite" />
        </circle>
        <ellipse cx={pin.x} cy={pin.y + 14} rx="7" ry="3" fill="rgba(0,0,0,0.18)" />
        <path d={`M${pin.x},${pin.y + 12} C${pin.x - 10},${pin.y + 2} ${pin.x - 10},${pin.y - 12} ${pin.x},${pin.y - 14} C${pin.x + 10},${pin.y - 12} ${pin.x + 10},${pin.y + 2} ${pin.x},${pin.y + 12}Z`} fill="#390955" stroke="white" strokeWidth="1.5" />
        <circle cx={pin.x} cy={pin.y - 5} r="3.5" fill="white" />
        <rect x={Math.min(Math.max(pin.x - 56, 2), VW - 114)} y={pin.y + 16} width="112" height="20" rx="4" fill="rgba(57,9,85,0.88)" />
        <text x={Math.min(Math.max(pin.x, 58), VW - 58)} y={pin.y + 29} textAnchor="middle" fill="white" fontSize="9" fontFamily="'Courier New', monospace" fontWeight="bold">
          {parcel.riderLat.toFixed(4)}° N, {parcel.riderLng.toFixed(4)}° E
        </text>
      </svg>
      <div style={{ position: 'absolute', top: 8, left: 8, background: '#390955', color: 'white', border: '1.5px solid #390955', fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 8 }}>
        <><CircleDot size={10} aria-hidden="true" /> Last known rider fix</>
      </div>
      {parcel.riderGpsAt && (
        <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(255,255,255,0.9)', fontSize: 10, color: '#666', padding: '3px 8px', borderRadius: 4, fontFamily: 'monospace' }}>
          {new Date(parcel.riderGpsAt).toLocaleString()}
        </div>
      )}
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
  padding: '6px 14px', borderRadius: 8, border: `1.5px solid ${active ? '#390955' : '#e0d5f0'}`,
  background: active ? '#390955' : 'transparent', color: active ? 'white' : '#555',
  fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
});

function ParcelModal({ parcel, onClose, allParcels }) {
  const [activeTab, setActiveTab] = useState('details');
  const [exportFmt, setExportFmt] = useState('pdf');

  // POD truth-pass: no fabricated GPS/geofence/signature state. The only
  // position this tab can show is the parcel's REAL last-known rider fix
  // (riderLat/riderLng, stamped by the mobile bridge on status transitions);
  // when the rider never sent coordinates we render an honest empty state.
  const hasRiderFix = parcel.riderLat !== null && parcel.riderLng !== null;

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const reportDate = new Date().toLocaleString();
  const reportId = `RPT-${parcel.id}`;

  const handleExport = () => {
    if (exportFmt === 'csv') {
      const content = `Tracking ID,Timestamp,Event,Location\n${parcel.timeline.map((e) => `${parcel.id},"${e.timestamp}","${e.label}","${e.location}"`).join('\n')}`;
      const blob = new Blob([content], { type: 'text/csv' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `report-${parcel.id}.csv`; a.click();
    } else if (exportFmt === 'txt') {
      const content = `DELIVERY STATUS REPORT\n${reportDate}\n\nTracking ID: ${parcel.id}\nTracking: ${parcel.trackingNumber}\nStatus: ${parcel.status}\n\nTIMELINE:\n${parcel.timeline.map((e) => `[${e.timestamp}] ${e.label} — ${e.location}`).join('\n')}`;
      const blob = new Blob([content], { type: 'text/plain' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `report-${parcel.id}.txt`; a.click();
    } else {
      exportPDF([parcel]);
    }
  };

  const handlePrint = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>Delivery Report</title><style>body{font-family:Arial,sans-serif;margin:20px}h1{color:#390955}table{width:100%;border-collapse:collapse}th,td{border:1px solid #e5e7eb;padding:10px;text-align:left}th{background:#f0eaf8}</style></head><body><h1>Delivery Status Report</h1><p>${escHtml(reportId)} · ${escHtml(reportDate)}</p><p><strong>Parcel:</strong> ${escHtml(parcel.id)} | <strong>Tracking:</strong> ${escHtml(parcel.trackingNumber)} | <strong>Status:</strong> ${escHtml(parcel.status)}</p><h3>Parcel Details</h3><p>Recipient: ${escHtml(parcel.receiver.name)}<br>Sender: ${escHtml(parcel.sender.name)}<br>Pickup Address: ${escHtml(parcel.pickupAddress)}<br>Delivery Address: ${escHtml(parcel.deliveryAddress || parcel.address)}<br>Weight: ${escHtml(parcel.weight)} | Value: ${escHtml(parcel.value)} | Service: ${escHtml(parcel.service)}</p><h3>Delivery Timeline</h3><table><tr><th>Timestamp</th><th>Event</th><th>Location</th></tr>${parcel.timeline.map((e) => `<tr><td>${escHtml(e.timestamp)}</td><td>${escHtml(e.label)}</td><td>${escHtml(e.location)}</td></tr>`).join('')}</table><script>window.print();</script></body></html>`);
    w.document.close();
  };

  const svc = SERVICE_CONFIG[parcel.service] || SERVICE_CONFIG.Standard;

  return (
    <Modal
      onBackdropClick={onClose}
      zIndex={1000}
      maxWidth={720}
      padding={0}
      overlayStyle={{ padding: 24 }}
      cardStyle={{ borderRadius: 12, width: '100%', animation: 'mp-modal-in 0.22s cubic-bezier(0.34,1.56,0.64,1) both', boxShadow: '0 32px 80px rgba(57,9,85,0.25)' }}
    >

        {/* Header */}
        <div style={{ padding: '22px 24px 16px', borderBottom: '1.5px solid #f5f0ff', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', position: 'sticky', top: 0, background: 'white', zIndex: 1, borderRadius: '12px 12px 0 0' }}>
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
            <Tooltip content="Close parcel details">
      <button onClick={onClose} aria-label="Close parcel details" style={{ width: 30, height: 30, borderRadius: 8, border: '1.5px solid #e0d5f0', background: 'white', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}><X size={15} aria-hidden="true" /></button>
      </Tooltip>
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
                {[
                  { label: 'From (Sender)', name: parcel.sender.name, phone: parcel.sender.phone, email: parcel.sender.email },
                  { label: 'To (Recipient)', name: parcel.receiver.name, phone: parcel.receiver.phone, email: parcel.receiver.email }
                ].map(({ label, name, phone, email }) => (
                  <div key={label} style={{ background: '#faf8ff', border: '1.5px solid #ebe4f5', borderRadius: 10, padding: '14px 15px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a' }}>{name}</div>
                    {phone && <div style={{ fontSize: 11, color: '#888', marginTop: 3, fontFamily: 'monospace' }}>Phone: {phone}</div>}
                    {email && email !== '—' && <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>Email: {email}</div>}
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ background: '#faf8ff', border: '1.5px solid #ebe4f5', borderRadius: 10, padding: '14px 15px', display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#390955" strokeWidth="2" width="15" height="15" style={{ flexShrink: 0, marginTop: 2 }}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Pickup Address</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a' }}>{parcel.pickupAddress}</div>
                  </div>
                </div>

                <div style={{ background: '#faf8ff', border: '1.5px solid #ebe4f5', borderRadius: 10, padding: '14px 15px', display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#390955" strokeWidth="2" width="15" height="15" style={{ flexShrink: 0, marginTop: 2 }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Delivery Address</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a' }}>{parcel.deliveryAddress || parcel.address}</div>
                  </div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#390955', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Product &amp; Package Specifications</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {[
                    ['Product Name', parcel.productName || parcel.contents],
                    ['Product Category', parcel.category],
                    ['Quantity', parcel.quantity],
                    ['Dimensions', parcel.dimensions],
                    ['Weight', parcel.weight],
                    ['Declared Value', parcel.value],
                  ].map(([l, v]) => (
                    <div key={l} style={{ background: 'white', border: '1px solid #ebe4f5', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ fontSize: 10, color: '#aaa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 }}>{l}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#1a1a1a', wordBreak: 'break-all' }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#390955', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Service &amp; Payment</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {[
                    ['Service Level', parcel.service],
                    ['Payment Mode', parcel.paymentMode],
                    ['COD Amount', parcel.codAmount !== '—' ? parcel.codAmount : '—'],
                    ['Computed Shipment Price', parcel.deliveryFee || '—'],
                    ['Assigned Rider', parcel.assignedRider || 'Unassigned'],
                    ['Date Created', fmtDate(parcel.registeredDate)],
                    ['Est. Delivery', parcel.estimatedDelivery],
                    ['Delivered On', parcel.actualDelivery || '—'],
                    ['Recipient Email', parcel.receiver.email],
                  ].map(([l, v]) => (
                    <div key={l} style={{ background: 'white', border: '1px solid #ebe4f5', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ fontSize: 10, color: '#aaa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 }}>{l}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#1a1a1a', wordBreak: 'break-all' }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background: '#faf8ff', border: '1.5px solid #ebe4f5', borderRadius: 10, padding: '14px 15px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Product Photo</div>
                {parcel.packagePhoto ? (
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <img src={parcel.packagePhoto} alt="Product" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid #ddd0f8' }} />
                    <span style={{ fontSize: 12, color: '#555' }}>Attached parcel image</span>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: '#888', fontStyle: 'italic' }}>
                    No product photo attached during package booking.
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start', background: '#f5f0ff', border: '1.5px solid #ddd0f8', borderRadius: 10, padding: '13px 15px' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#390955" strokeWidth="2" width="15" height="15" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#390955', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Special Instructions / Shipping Notes</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#390955' }}>{parcel.instructions}</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'timeline' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 24 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: PARCEL_STATUS_COLORS[parcel.status]?.bg, borderRadius: 8, marginBottom: 18 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: PARCEL_STATUS_COLORS[parcel.status]?.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: PARCEL_STATUS_COLORS[parcel.status]?.color }}>{parcel.status}</span>
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
              {/* Rider GPS fix — real bridge-synced coordinates only */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#390955', textTransform: 'uppercase', letterSpacing: 0.7 }}>Last Known Rider GPS</div>
                </div>
                {hasRiderFix ? (
                  <>
                    <MiniMap parcel={parcel} allParcels={allParcels} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                      {[['Latitude', `${parcel.riderLat.toFixed(5)}° N`], ['Longitude', `${parcel.riderLng.toFixed(5)}° E`]].map(([l, v]) => (
                        <div key={l} style={{ background: '#faf8ff', border: '1px solid #e8e0f5', borderRadius: 8, padding: '9px 11px' }}>
                          <div style={{ fontSize: 10, color: '#aaa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>{l}</div>
                          <strong style={{ fontSize: 12, fontWeight: 800, color: '#390955', fontFamily: "'Courier New', monospace" }}>{v}</strong>
                        </div>
                      ))}
                    </div>
                    <p style={{ fontSize: 11, color: '#9b82b2', margin: '10px 2px 0', lineHeight: 1.5 }}>
                      Coordinates are the rider's last app-reported fix, synced through the mobile bridge. Live telemetry streams on the Parcel Map page.
                    </p>
                  </>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '40px 16px', background: '#faf8ff', border: '1.5px dashed #d4c8e8', borderRadius: 10, textAlign: 'center' }}>
                    <CircleDot size={26} strokeWidth={1.5} color="#c4a8d8" aria-hidden="true" />
                    <p style={{ fontSize: 12, color: '#bbb', margin: 0 }}>No GPS fix synced yet</p>
                    <p style={{ fontSize: 11, color: '#c4b8d8', margin: 0, lineHeight: 1.5 }}>Coordinates appear here once the rider's app reports a position for this parcel.</p>
                  </div>
                )}
              </div>

              {/* Proof of Delivery — real captured data only */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#390955', textTransform: 'uppercase', letterSpacing: 0.7 }}>Proof of Delivery</div>
                  {parcel.podPhoto && <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 8, background: '#16a34a', color: 'white', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Check size={12} aria-hidden="true" /> Photo on file</span>}
                </div>

                {parcel.podPhoto ? (
                  <div style={{ background: '#faf8ff', border: '1.5px solid #e8e0f5', borderRadius: 12, padding: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#390955', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                      POD Photo (captured in the app)
                    </div>
                    <div style={{ width: '100%', maxHeight: 260, borderRadius: 8, overflow: 'hidden', border: '1px solid #d1c4e9' }}>
                      <img
                        src={parcel.podPhoto}
                        alt="Proof of Delivery"
                        style={{ width: '100%', maxHeight: 260, objectFit: 'contain', background: '#111', display: 'block' }}
                      />
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '40px 16px', background: '#faf8ff', border: '1.5px dashed #d4c8e8', borderRadius: 10, textAlign: 'center' }}>
                    <CheckCircle2 size={26} strokeWidth={1.5} color="#c4a8d8" aria-hidden="true" />
                    <p style={{ fontSize: 12, color: '#bbb', margin: 0 }}>No proof-of-delivery photo yet</p>
                    <p style={{ fontSize: 11, color: '#c4b8d8', margin: 0, lineHeight: 1.5 }}>The rider's camera capture uploads here when the delivery is confirmed in the app.</p>
                  </div>
                )}

                <div style={{ background: '#faf8ff', border: '1.5px solid #e8e0f5', borderRadius: 12, padding: 16, marginTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#390955', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12, paddingBottom: 10, borderBottom: '1.5px solid #f0eaf8' }}>Delivery Summary</div>
                  {[
                    ['Tracking',       parcel.trackingNumber, true],
                    ['Sender',         parcel.sender.name,    false],
                    ['Receiver',       parcel.receiver.name,  false],
                    ['Address',        parcel.address,        false],
                    ['Assigned Rider', parcel.assignedRider || 'Unassigned', false],
                    ['Rider GPS',      hasRiderFix ? `${parcel.riderLat.toFixed(4)}°N, ${parcel.riderLng.toFixed(4)}°E` : 'Not synced yet', true],
                    ['POD Photo',      parcel.podPhoto ? 'Captured' : 'Not uploaded', false],
                    ['Delivered On',   parcel.actualDelivery !== '—' ? parcel.actualDelivery : 'Not delivered yet', false],
                  ].map(([l, v, mono]) => (
                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '7px 0', fontSize: 12, color: '#666', borderBottom: '1px solid #f0eaf8', gap: 8 }}>
                      <span style={{ flexShrink: 0 }}>{l}</span>
                      <strong style={{ color: '#1a1a1a', textAlign: 'right', wordBreak: 'break-word', fontFamily: mono ? "'Courier New', monospace" : 'inherit', fontSize: 11, maxWidth: '60%' }}>{v}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
    </Modal>
  );
}

// ── Shared popover styles ───────────────────────────────────────────────────
// Note: the page's control bar is now the shared FilterBar (search + status
// filter + Export CSV/PDF) rendered in the main component below, matching the
// Customers / Sellers / Riders tables. The old inline-styled Toolbar with its
// export dropdown was removed in that pass.

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
      <Tooltip content="Assign a rider to this parcel">
      <button onClick={() => setOpen((v) => !v)} className="mp-icon-btn" style={iconBtnStyle}>
        <RiderIcon size={13} />
      </button>
      </Tooltip>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', background: 'white', border: '1px solid #e0d5f0', borderRadius: 10, boxShadow: '0 12px 32px rgba(57,9,85,0.14)', overflow: 'hidden', minWidth: 160, maxHeight: 260, overflowY: 'auto', zIndex: 20, textAlign: 'left' }}>
          <div style={{ padding: '8px 14px', fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.4 }}>Assign Rider</div>
          {riders.length === 0 ? (
            <div style={{ padding: '10px 14px', fontSize: 12, color: '#bbb' }}>No riders available.</div>
          ) : riders.map((r) => (
            <button key={r.riderId} onClick={() => { onAssign(parcel, r); setOpen(false); }}
              style={{ ...menuItemStyle, background: parcel.riderId === r.riderId ? '#f0eaf8' : 'transparent', color: parcel.riderId === r.riderId ? '#390955' : '#1a1a1a', fontWeight: parcel.riderId === r.riderId ? 700 : 600 }}>
              {parcel.riderId === r.riderId && <Check size={13} aria-hidden="true" />} <span style={{ flex: 1 }}>{r.riderName}</span>
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionError, setActionError]   = useState('');
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [viewParcel, setViewParcel]     = useState(null);
  const [currentPage, setCurrentPage]   = useState(1);
  const [rowsPerPage, setRowsPerPage]   = useState(10);

  const flashActionError = useCallback((msg) => { setActionError(msg); setTimeout(() => setActionError(''), 4000); }, []);

  const loadData = useCallback(async (isManual = false) => {
    if (isManual) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const [parcelsRes, ridersRes] = await Promise.all([apiFetch('/parcels'), apiFetch('/riders')]);
      if (!parcelsRes.ok) throw new Error(`Parcels endpoint responded ${parcelsRes.status}`);
      const [parcelsData, ridersData] = await Promise.all([
        parcelsRes.json(),
        ridersRes.ok ? ridersRes.json() : Promise.resolve([]),
      ]);

      const riderList = (Array.isArray(ridersData) ? ridersData : [])
        .filter((r) => String(r.status || '').toLowerCase() !== 'archived')
        .map((r) => ({ riderId: r.registrationId || r._id, riderName: r.riderName || '—' }));
      const riderNameById = {};
      riderList.forEach((r) => { riderNameById[r.riderId] = r.riderName; });

      const normalized = (Array.isArray(parcelsData) ? parcelsData : []).map((p) => normalizeParcel(p, riderNameById));

      // Live rows only — the page never substitutes a fallback dataset.
      setParcels(normalized);
      setRiders(riderList);
    } catch (err) {
      console.error('ManageParcels: error loading parcels —', err);
      setParcels([]);
      flashActionError('Could not reach the server.');
      setRiders([]);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [flashActionError]);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return parcels.filter((p) => {
      if (statusFilter !== 'All' && p.status !== statusFilter) return false;
      if (!q) return true;
      return (
        p.id.toLowerCase().includes(q) ||
        p.sender.name.toLowerCase().includes(q) ||
        p.receiver.name.toLowerCase().includes(q) ||
        (p.pickupAddress && p.pickupAddress.toLowerCase().includes(q)) ||
        p.address.toLowerCase().includes(q) ||
        (p.assignedRider && p.assignedRider.toLowerCase().includes(q))
      );
    });
  }, [parcels, search, statusFilter]);

  // Persists the assignment to the real parcel record (PUT /api/parcels/:id).
  // Rows without a database id (never the case for live rows) update locally.
  const handleAssignRider = async (parcel, rider) => {
    const prevParcels = parcels;
    setParcels((prev) => prev.map((p) => (p.id === parcel.id ? { ...p, riderId: rider.riderId, assignedRider: rider.riderName } : p)));

    if (!parcel._id) return;
    try {
      const res = await apiFetch(`/parcels/${parcel._id}`, {
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

  const getExportData = () => filtered.map((p) => ({
    id: p.id,
    senderName: p.sender?.name || '—',
    receiverName: p.receiver?.name || '—',
    pickupAddress: p.pickupAddress || '—',
    deliveryAddress: p.deliveryAddress || p.address || '—',
    weight: p.weight || '—',
    service: p.service || '—',
    assignedRider: p.assignedRider || 'Unassigned',
    dateCreated: fmtDate(p.registeredDate),
    status: p.status || '—',
  }));

  const handleTableExport = (format) => {
    const data = getExportData();
    if (format === 'excel') {
      exportToExcel(data, PARCEL_EXPORT_COLUMNS, 'parcels-ledger');
    } else if (format === 'word') {
      exportToWord(data, PARCEL_EXPORT_COLUMNS, 'parcels-ledger', 'Parcels Ledger Report');
    } else if (format === 'pdf') {
      exportToPDF(data, PARCEL_EXPORT_COLUMNS, 'parcels-ledger', 'Parcels Ledger Report');
    } else {
      exportToCSV(data, PARCEL_EXPORT_COLUMNS, 'parcels-ledger');
    }
  };

  // Page slice — the registry renders one page at a time (same behaviour as
  // the Customers/Sellers/Riders ledgers). safePage clamps the request when a
  // filter change shrinks the result set below the current page.
  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const pageRows = useMemo(
    () => filtered.slice((safePage - 1) * rowsPerPage, safePage * rowsPerPage),
    [filtered, safePage, rowsPerPage],
  );

  return (
    <div style={{ flex: 1, padding: '24px 30px 48px', backgroundColor: '#f0ecf7', minHeight: '100vh', fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @keyframes mp-modal-in { from { opacity:0; transform:scale(0.95) translateY(10px); } to { opacity:1; transform:scale(1) translateY(0); } }

        .mp-row:hover td      { background:#f0eaf8 !important; }
        .mp-view-btn, .mp-icon-btn { opacity: 0.8; transition: all 0.15s ease; }
        .mp-row:hover .mp-view-btn, .mp-row:hover .mp-icon-btn { opacity: 1; }
        .mp-view-btn:hover, .mp-icon-btn:hover { background:#f37021 !important; color:white !important; border-color:#f37021 !important; opacity: 1; }

        .mp-table-wrap { width:100%; overflow-x:auto; -webkit-overflow-scrolling:touch; }
        .mp-table-wrap table { width:100%; min-width:1080px; border-collapse:collapse; font-size:13px; }
      `}</style>

      {viewParcel && <ParcelModal key={viewParcel.id} parcel={viewParcel} onClose={() => setViewParcel(null)} allParcels={parcels} />}

      {/* Header — shared PageHeader pattern with refresh action */}
      <PageHeader
        title="Manage Parcels"
        subtitle="Parcel registry, delivery status &amp; rider assignment in one view"
        breadcrumb={['Dashboard', 'Shipments', 'Manage Parcels']}
        actions={(
          <RefreshButton
            onClick={() => loadData(true)}
            isRefreshing={isRefreshing}
          />
        )}
      />

      {actionError && (
        <div style={{ marginBottom: 20, padding: '12px 16px', background: '#fdf2f2', color: '#9b1c1c', border: '1px solid #fecaca', borderRadius: 10, fontSize: 12.5, fontWeight: 600 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><XCircle size={15} aria-hidden="true" /> {actionError}</span>
        </div>
      )}

      <SectionCard
        noPadding
        className="w-full mb-6"
        footer={(
          <CardFooter
            resultsLabel={`Showing ${filtered.length} of ${parcels.length} results`}
            pills={[
              { label: 'Delivered',  value: parcels.filter((p) => p.status === 'Delivered').length,  tone: 'green' },
              { label: 'In Transit', value: parcels.filter((p) => p.status === 'In Transit').length, tone: 'blue' },
              { label: 'Pending',    value: parcels.filter((p) => p.status === 'Pending').length,    tone: 'slate' },
            ]}
          />
        )}
      >
        <CardSectionHeader
          icon={Package}
          title="Parcel List"
          subtitle={`${filtered.length} of ${parcels.length} records — all active shipments and assigned rider tracking`}
        />

        <FilterBar>
          <FilterBar.Group>
            <FilterBar.Search
              placeholder="Search by tracking ID, sender, or receiver..."
              value={search}
              onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
            />
            <FilterBar.Select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}
            >
              <option value="All">All Statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </FilterBar.Select>
            <FilterBar.Count count={filtered.length} label="results" />
          </FilterBar.Group>
          <FilterBar.Actions>
            <ExportDropdown onExport={handleTableExport} disabled={filtered.length === 0} />
          </FilterBar.Actions>
        </FilterBar>

          {/* Table — same bordered/rounded container the other ledgers use */}
          <div className="mp-table-wrap custom-table-scroll" style={{ margin: '8px 24px 24px', border: '1px solid #e4d8f2', borderRadius: 12 }}>
            <table>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {COLS.map((col) => {
                    const ColIcon = col.Icon;
                    return (
                      <th
                        key={col.label}
                        style={{
                          padding: '12px 16px',
                          textAlign: col.align === 'right' ? 'right' : 'left',
                          fontWeight: 600,
                          color: '#64748b',
                          fontSize: 11,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          whiteSpace: 'nowrap',
                          ...(col.sticky ? { position: 'sticky', left: 0, zIndex: 10, background: '#f8fafc', borderRight: '1px solid #e2e8f0', boxShadow: '2px 0 5px -2px rgba(0,0,0,0.06)' } : {})
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <ColIcon size={12} style={{ color: '#94a3b8' }} />
                          {col.label}
                        </span>
                      </th>
                    );
                  })}
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <TableSkeleton rows={8} columns={COLS.length + 1} />
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={COLS.length + 1} style={{ padding: '32px 16px' }}>
                      <EmptyState
                        icon={Package}
                        title={parcels.length === 0 ? 'No parcels yet' : 'No parcels match your search'}
                        description={parcels.length === 0
                          ? 'Parcels appear here as the mobile app books and syncs them.'
                          : 'Try a different tracking ID, sender, or receiver, then clear the status filter if needed.'}
                      />
                    </td>
                  </tr>
                ) : pageRows.map((p) => (
                  <tr key={p.id} className="mp-row" style={{ background: 'white' }}>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#390955', fontWeight: 700, whiteSpace: 'nowrap', borderBottom: '1px solid #f3f0f8', position: 'sticky', left: 0, zIndex: 5, background: 'white', borderRight: '1px solid #f3f0f8', boxShadow: '2px 0 5px -2px rgba(0,0,0,0.06)' }}>{p.id}</td>
                    <td style={{ padding: '12px 16px', color: '#1a1a1a', fontWeight: 600, whiteSpace: 'nowrap', borderBottom: '1px solid #f3f0f8' }}>{p.sender.name}</td>
                    <td style={{ padding: '12px 16px', color: '#374151', whiteSpace: 'nowrap', borderBottom: '1px solid #f3f0f8' }}>{p.receiver.name}</td>
                    <td style={{ padding: '12px 16px', color: '#666', borderBottom: '1px solid #f3f0f8', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.pickupAddress}</td>
                    <td style={{ padding: '12px 16px', color: '#666', borderBottom: '1px solid #f3f0f8', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.deliveryAddress || p.address}</td>
                    <td style={{ padding: '12px 16px', color: '#374151', whiteSpace: 'nowrap', borderBottom: '1px solid #f3f0f8', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{p.weight}</td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', borderBottom: '1px solid #f3f0f8' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: p.assignedRider ? '#1a1a1a' : '#bbb', fontWeight: 600, fontSize: 12 }}>
                        <span style={{ color: '#7c3aed' }}><RiderIcon size={13} /></span>
                        {p.assignedRider || 'Unassigned'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', borderBottom: '1px solid #f3f0f8' }}><StatusBadge status={p.status} /></td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', borderBottom: '1px solid #f3f0f8' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                        <button onClick={() => setViewParcel(p)} className="mp-view-btn" title="View Details"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 6, border: '1.5px solid #390955', background: 'white', color: '#390955', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                          View Details
                        </button>
                        <AssignRiderButton parcel={p} riders={riders} onAssign={handleAssignRider} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        {/* Pagination — same rows-per-page + Prev/Next bar as the other ledgers */}
        {!loading && filtered.length > 0 && (
          <PaginationControls
            currentPage={safePage}
            totalRecords={filtered.length}
            rowsPerPage={rowsPerPage}
            onPageChange={setCurrentPage}
            onRowsPerPageChange={(n) => { setRowsPerPage(n); setCurrentPage(1); }}
          />
        )}
    </div>
  );
}
