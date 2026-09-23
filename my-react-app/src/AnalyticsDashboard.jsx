import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  PackageCheck, Bike, Truck, UserCheck,
  ClipboardList, Download, Share2,
  Users, PackageSearch, AlertTriangle,
} from 'lucide-react';
import { apiFetch, parcelsApi, ridersApi, isDemoMode } from './services/api';
import { exportToCSV } from './exportUtils';
import { barHeightPercent, niceAxisMax, axisTicks } from './utils/barHeight';
import useSSE from './services/useSSE';
import './AnalyticsDashboard.css';
import Tooltip from './components/ui/Tooltip';
import StatCard from './components/ui/StatCard';
import SectionCard from './components/ui/SectionCard';
import CardFooter from './components/ui/CardFooter';
import DataTable from './components/ui/DataTable';
import RefreshButton from './components/ui/RefreshButton';
import yto_logo from './yto_express_logo.png';

// Page components come from the single registry in pageMap.js — the same map
// App.jsx uses for hash validation — so there is exactly one key -> component
// source of truth for the whole portal.
import { PAGE_MAP } from './pageMap';
import PeakAlertBanner                   from "./PeakAlertBanner";
import GlobalHeader                      from "./GlobalHeader";
import ListSkeleton from "./components/ui/ListSkeleton";
import EmptyState from "./components/ui/EmptyState";
import ErrorBoundary from "./components/ui/ErrorBoundary";
import { initialPendingSellers, initialPendingRiders } from "./verification/registrationCredentials";
import { isDeliveredStatus, isReturnFamilyStatus, isInTransitFamilyStatus, normalizeParcelStatus } from "./utils/parcelStatus";
import { PARCEL_STATUS_COLORS } from "./components/ui/statusColors";
import TrendArea from "./components/ui/TrendArea";

function mapSellerToPendingItem(seller) {
  return {
    id: seller.registrationId || String(seller._id),
    _id: seller._id,
    fullName: seller.fullName || '—',
    contactNumber: seller.phone || '—',
    email: seller.email || '—',
    storeName: seller.storeName || '—',
    governmentId: {
      type: seller.idType || 'National ID',
      number: seller.idNumber || '—',
    },
    address: typeof seller.address === 'string' ? seller.address : (seller.address?.street || '—'),
    businessName: seller.storeName || seller.fullName || '—',
    businessType: 'Retail',
    submittedAt: seller.createdAt || new Date().toISOString(),
    status: seller.status || 'Pending Verification',
    documents: Array.isArray(seller.documents) ? seller.documents : [],
    raw: seller,
  };
}

function mapRiderToPendingItem(rider) {
  return {
    id: rider.registrationId || String(rider._id),
    _id: rider._id,
    fullName: rider.riderName || '—',
    contactNumber: rider.phone || '—',
    email: rider.email || '—',
    vehicleType: rider.vehicleType || 'Motorcycle',
    plateNumber: rider.vehiclePlate || '—',
    governmentId: {
      type: rider.idType || "Driver's License",
      number: rider.idNumber || '—',
    },
    address: typeof rider.address === 'string' ? rider.address : (rider.address?.street || '—'),
    submittedAt: rider.createdAt || new Date().toISOString(),
    status: rider.status || 'Pending Verification',
    documents: Array.isArray(rider.documents) ? rider.documents : [],
    raw: rider,
  };
}



// ── Dashboard parcel-report exports (CSV + printable PDF) ───────────────
const DASH_PARCEL_COLUMNS = [
  { key: 'trackingNumber', label: 'Tracking Number' },
  { key: 'senderName',     label: 'Sender' },
  { key: 'receiverName',   label: 'Receiver' },
  { key: 'destination',    label: 'Destination' },
  { key: 'status',         label: 'Status' },
  { key: 'createdAt',      label: 'Created' },
];

const escHtml = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function dashboardExportCSV(parcels) {
  exportToCSV(parcels, DASH_PARCEL_COLUMNS, `yto-parcel-report-${new Date().toISOString().slice(0, 10)}`);
}

// ── Chart helpers ───────────────────────────────────────────────────────
// The axis ceiling and its tick values live in utils/barHeight.js, shared with
// the TrendArea primitive, so the bar plot and every trend line agree on one
// scale instead of each carrying its own copy.

// Only a single clear winner is highlighted. When several periods tie for the
// top, none is — a flat week used to render as every bar being the peak.
function isUniquePeak(value, series) {
  return value > 0 && series.filter((v) => v === value).length === 1;
}

// Composition ring for the parcel-status breakdown. Dependency-free SVG: an arc
// is a stroke-dasharray offset on a circle, so no charting library is needed.
// Every slice is also printed in the legend beside it, so no value is carried
// by colour alone.
function StatusDonut({ rows, total }) {
  const size = 132;
  const thickness = 16;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <svg
      className="ed-donut"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Parcel status split: ${rows.map((row) => `${row.status} ${row.count}`).join(', ')}.`}
    >
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f1ecf8" strokeWidth={thickness} />
      {total > 0 && rows.map((row) => {
        const length = (row.count / total) * circumference;
        const arc = (
          <circle
            key={row.status}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={row.color}
            strokeWidth={thickness}
            strokeDasharray={`${length} ${circumference - length}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        );
        offset += length;
        return arc;
      })}
      <text className="ed-donut-value" x="50%" y="49%" textAnchor="middle" dominantBaseline="middle">{total}</text>
      <text className="ed-donut-label" x="50%" y="63%" textAnchor="middle">{total === 1 ? 'parcel' : 'parcels'}</text>
    </svg>
  );
}

function dashboardExportPDF(parcels) {
  const w = window.open('', '_blank');
  if (!w) return;
  const head = DASH_PARCEL_COLUMNS.map((c) => `<th>${escHtml(c.label)}</th>`).join('');
  const rows = parcels.map((p) =>
    `<tr>${DASH_PARCEL_COLUMNS.map((c) => `<td>${escHtml(p[c.key])}</td>`).join('')}</tr>`
  ).join('');
  w.document.write(`<html><head><title>YTO Parcel Report</title><style>
    body{font-family:Arial,sans-serif;margin:24px;color:#1a1a1a}
    h1{color:#390955;margin-bottom:2px}
    p{color:#666;margin-top:0}
    table{width:100%;border-collapse:collapse;margin-top:16px}
    th,td{border:1px solid #e5e7eb;padding:8px 10px;text-align:left;font-size:12px}
    th{background:#390955;color:white;text-transform:uppercase;letter-spacing:0.4px}
    tr:nth-child(even){background:#faf8ff}
  </style></head><body>
    <h1>YTO Express — Parcel Report</h1>
    <p>Generated ${new Date().toLocaleString()} · ${parcels.length} parcel(s)</p>
    <table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>
    <script>window.print();</script>
  </body></html>`);
  w.document.close();
}

// Sidebar information architecture — noun-based sections grouped by domain
// (Overview / People / Shipments / Tracking & Maps / Support / Admin), the
// standard logistics-admin pattern. Route keys are unchanged; only grouping
// and display labels moved (previous verb-stuffed labels live on as page
// titles inside each view). Role gating: Super Admin gets everything, Staff
// gets day-to-day operations (no Tracking & Maps or Accounts), Hub Receiver
// gets only Overview + a restricted Shipments screen. Empty sections are
// filtered out at render time, so role rules stay exact.
const getMenuSections = (role) => [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', key: 'dashboard' }],
  },

  ...(role !== 'hub_receiver' ? [{
    label: 'People',
    items: [
      { label: 'Customers', key: 'customer-list' },
      {
        label: 'Sellers', key: 'seller', children: [
          { label: 'Registration Review', key: 'process-seller' },
          { label: 'Seller Directory',    key: 'seller-report'  },
        ],
      },
      {
        label: 'Riders', key: 'rider', children: [
          { label: 'Registration Review', key: 'process-rider' },
          { label: 'Duty Monitor',        key: 'monitor-rider' },
          { label: 'Rider Reports',       key: 'rider-report'  },
        ],
      },
    ],
  }] : []),

  {
    label: 'Shipments',
    items: [
      ...(role === 'hub_receiver'
        ? [{ label: 'Hub Receiving', key: 'hub-parcels' }]
        : [{ label: 'All Parcels', key: 'manage-parcels' }]),
      ...(role !== 'hub_receiver'
        ? [{ label: 'Tracking Reports', key: 'tracking-info' }]
        : []),
    ],
  },

  ...(role === 'super_admin' ? [{
    label: 'Tracking & Maps',
    items: [
      { label: 'Parcel Map',       key: 'parcel-location' },
      { label: 'Geofence Monitor', key: 'geofence'        },
    ],
  }] : []),

  ...(role !== 'hub_receiver' ? [{
    label: 'Support',
    items: [
      { label: 'Issues',            key: 'manage-issues' },
      { label: 'App Notifications', key: 'app-notifications' },
    ],
  }] : []),

  ...(role !== 'hub_receiver' ? [{
    label: 'Admin',
    items: [      ...(role === 'super_admin' ? [{
        label: 'Accounts', key: 'manage-accounts'
      }] : []),
      ...(role === 'super_admin' ? [{ label: 'Archives', key: 'settings' }] : []),
      { label: 'Activity Log', key: 'activity-log' },
    ],
  }] : []),
];

const icons = {
  dashboard: (
    <svg className="ad-sidebar-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
    </svg>
  ),
  seller: (
    <svg className="ad-sidebar-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  parcel: (
    <svg className="ad-sidebar-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
    </svg>
  ),
  rider: (
    <svg className="ad-sidebar-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8" r="4"/><path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6"/>
    </svg>
  ),
  'customer-list': (
    <svg className="ad-sidebar-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  'manage-issues': (
    <svg className="ad-sidebar-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  ),
  'app-notifications': (
    <svg className="ad-sidebar-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  ),
  'activity-log': (
    <svg className="ad-sidebar-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
  gps: (
    <svg className="ad-sidebar-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
    </svg>
  ),
  'manage-accounts': (
    <svg className="ad-sidebar-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  settings: (
    <svg className="ad-sidebar-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
  logout: (
    <svg className="ad-sidebar-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  ),
  sub: (
    <svg className="ad-sidebar-nav-icon ad-sidebar-sub-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="2"/>
    </svg>
  ),
};

icons['hub-parcels'] = icons.parcel;
icons['manage-parcels'] = icons.parcel;
icons['parcel-location'] = icons.gps;
icons['geofence'] = (
  <svg className="ad-sidebar-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
  </svg>
);
icons['tracking-info'] = (
  <svg className="ad-sidebar-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
  </svg>
);

const getIcon = (key) => icons[key] || icons.sub;

// Status-family predicates moved to utils/parcelStatus.js — the local
// isReturnStatus was kept case-sensitive-adjacent (/return/i is fine) but
// delivered/transit checks elsewhere compared exact Title-case strings
// against lowercase DB values, undercounting whenever the /dashboard/stats
// aggregate was unreachable and the client-side fallback kicked in.
const isReturnStatus = isReturnFamilyStatus;
const toDayKey = (isoString) => (isoString ? isoString.slice(0, 10) : null);

// Last 7 calendar days (oldest first), each bucket built from real parcel timestamps.
const buildLast7Days = (parcels) => {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  return days.map(d => {
    const dayKey = d.toISOString().slice(0, 10);
    const created  = parcels.filter(p => toDayKey(p.createdAt) === dayKey).length;
    const delivered = parcels.filter(p => isDeliveredStatus(p.status) && toDayKey(p.updatedAt) === dayKey).length;
    const returned  = parcels.filter(p => isReturnStatus(p.status) && toDayKey(p.updatedAt) === dayKey).length;
    return { label: d.toLocaleDateString('en-US', { weekday: 'short' }), dayKey, created, delivered, returned };
  });
};

// Last N calendar weeks (oldest first), each bucket built from real parcel
// timestamps — the "Weekly" view for the Parcel Volume chart. Windows are
// non-overlapping day ranges: week i covers [today-6-7i, today-7i], so a
// parcel can never be counted in two adjacent weeks.
const buildLastNWeeks = (parcels, n = 6) => {
  const weeks = [];
  const todayKey = new Date().toISOString().slice(0, 10);
  for (let i = n - 1; i >= 0; i--) {
    const end = new Date();
    end.setDate(end.getDate() - i * 7);
    const start = new Date(end);
    start.setDate(end.getDate() - 6);
    if (i === 0) end.setHours(23, 59, 59, 999);
    const startKey = start.toISOString().slice(0, 10);
    const endKey = i === 0 ? todayKey : end.toISOString().slice(0, 10);
    const created = parcels.filter(p => {
      const dayKey = toDayKey(p.createdAt);
      return dayKey && dayKey >= startKey && dayKey <= endKey;
    }).length;
    weeks.push({ label: `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`, created });
  }
  return weeks;
};

export default function AnalyticsDashboard({
  onLogout,
  currentUser,
  activePage = 'dashboard',
  setActivePage,
  retryNonce = 0,
  setRetryNonce,
}) {
  // NOTE: the old dateRange select (Today/7/30) was removed — its state was
  // never read by any computation, so the control changed nothing on screen
  // (ghost UI). If a real date filter is wanted later, wire it into
  // buildLast7Days/buildLastNWeeks first, then reintroduce the select.
  const [volumeView, setVolumeView]         = useState('daily');
  // Single routing authority: the active page lives in App.jsx (hash-synced,
  // deep-linkable). This shell renders whatever page is active and forwards
  // navigation requests up through setActivePage. The historical names are
  // kept so the sidebar/header/Logout call sites read unchanged.
  const activeMenuItem = activePage;
  const setActiveMenuItem = setActivePage || (() => {});
  const [openSection, setOpenSection]       = useState(null);

  // Collapsible sidebar: remembered per-browser, defaults to expanded.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('yto_sidebar_collapsed') === '1'; } catch { return false; }
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Which parent group's children are shown as a flyout next to the icon rail
  // (collapsed mode only). Closed on mouse-leave or navigation.
  const [railFlyout, setRailFlyout] = useState(null);

  const toggleSidebar = () => {
    setOpenSection(null);
    setRailFlyout(null);
    setSidebarCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('yto_sidebar_collapsed', next ? '1' : '0'); } catch { /* localStorage unavailable (private mode): collapse state is best-effort */ }
      return next;
    });
  };

  // Collapsed mode is a pure icon rail: hovering a top-level item shows a
  // small tooltip; parent groups (like GPS-Based Parcel Tracking) show their
  // children in an instant flyout panel so no hover-pause is needed.
  const sidebarExpanded = !sidebarCollapsed;
  const closeRailFlyout = () => setRailFlyout(null);

  // Seller Directory fetches live /api/sellers itself (since the de-demo
  // migration); the old hardcoded 'Fresh Express Store' seed row here only
  // existed to pre-fill ViewSeller's initial state and was dropped.

  // Lifted up here (instead of living inside ProcessSellerInformation/
  // ProcessRiderInformation) so the pending-verification queue survives
  // switching sidebar sections. Those page components used to hold this in
  // local useState, which reset back to the original 3 mock applicants every
  // time you navigated away and back — including ones you'd already approved,
  // so an applicant could show as "Pending" here while already being a real,
  // active seller/rider elsewhere.
  const [pendingSellers, setPendingSellers] = useState(initialPendingSellers);
  const [pendingRiders,  setPendingRiders]  = useState(initialPendingRiders);

  const fetchPendingRegistrations = useCallback(async () => {
    try {
      const [sellersRes, ridersRes] = await Promise.all([
        apiFetch('/sellers?status=PENDING_VERIFICATION'),
        apiFetch('/riders?status=Pending'),
      ]);
      if (sellersRes.ok) {
        const data = await sellersRes.json();
        if (Array.isArray(data)) {
          setPendingSellers(data.map(mapSellerToPendingItem));
        }
      }
      if (ridersRes.ok) {
        const data = await ridersRes.json();
        if (Array.isArray(data)) {
          setPendingRiders(data.map(mapRiderToPendingItem));
        }
      }
    } catch (e) {
      console.warn('Failed to fetch pending registrations:', e);
    }
  }, []);

  const [trackingReports, setTrackingReports] = useState([]);

  // Real-time SSE connection — auto-refreshes data when bridge events arrive
  const { connected: sseConnected, on: onSSE } = useSSE();

  // SSE connection count (how many admin clients are connected)
  const [sseClientCount, setSseClientCount] = useState(0);

  useEffect(() => {
    fetchPendingRegistrations();
    if (onSSE) {
      const unsubUser = onSSE('user-synced', () => fetchPendingRegistrations());
      const unsubApproval = onSSE('approval-updated', () => fetchPendingRegistrations());
      return () => {
        if (typeof unsubUser === 'function') unsubUser();
        if (typeof unsubApproval === 'function') unsubApproval();
      };
    }
  }, [fetchPendingRegistrations, onSSE]);

  useEffect(() => {
    const fetchSSEStats = async () => {
      try {
        const res = await apiFetch('/events/stats');
        if (res.ok) {
          const data = await res.json();
          setSseClientCount(data.connectedClients || 0);
        }
      } catch { /* events/stats is best-effort: keep the last known client count */ }
    };
    fetchSSEStats();
    const interval = setInterval(fetchSSEStats, 10000); // refresh every 10s
    return () => clearInterval(interval);
  }, []);

  const toggleSection   = (key) => setOpenSection(prev => (prev === key ? null : key));
  const handleMenuClick = (key) => {
    setActiveMenuItem(key);
    const parent = visibleMenuItems.find(item => item.children?.some(c => c.key === key));
    setOpenSection(parent ? parent.key : null);
    setMobileNavOpen(false);
  };
  const goToSettings    = () => { setActiveMenuItem('settings'); setOpenSection(null); setMobileNavOpen(false); };

  const visibleSections = useMemo(() => getMenuSections(currentUser?.role), [currentUser?.role]);
  const visibleMenuItems = useMemo(() => visibleSections.flatMap(section => section.items), [visibleSections]);

  // Keep the sidebar's open section in sync when the active page route changes (e.g. deep link or menu click)
  useEffect(() => {
    const parent = visibleMenuItems.find(item => item.children?.some(c => c.key === activeMenuItem));
    setOpenSection(parent ? parent.key : null);
  }, [activeMenuItem, visibleMenuItems]);


  // ── Real data from the backend — no more hardcoded numbers ────────────────
  const [parcels, setParcels]         = useState([]);
  const [riders, setRiders]           = useState([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [isRefreshing, setIsRefreshing]         = useState(false);
  // Top KPI row is bound to the real GET /api/dashboard/stats aggregate
  // (server-computed counts, cheaper than shipping the full parcels/riders
  // arrays just to total them). `dashboardStats` is null until it resolves —
  // everything below still falls back to computing the same numbers from the
  // full arrays fetched above, so the KPI cards never go blank if the stats
  // endpoint alone fails.
  const [dashboardStats, setDashboardStats] = useState(null);
  const [statsError,     setStatsError]     = useState(false);

  const fetchDashboardData = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    else setDashboardLoading(true);

    try {
      const [parcelsData, ridersData, statsRes] = await Promise.all([
        parcelsApi.list().catch(() => []),
        ridersApi.list().catch(() => []),
        apiFetch('/dashboard/stats').catch(() => null),
      ]);

      setParcels(Array.isArray(parcelsData) ? parcelsData : []);
      setRiders(Array.isArray(ridersData) ? ridersData : []);

      if (statsRes && statsRes.ok) {
        const data = await statsRes.json();
        setDashboardStats(data);
        setStatsError(false);
      } else {
        setStatsError(true);
      }
    } catch {
      setStatsError(true);
    } finally {
      setDashboardLoading(false);
      if (isManual) setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Stats endpoint responses have drifted before (missing/renamed fields) and
  // used to crash the dashboard via unconditional `.toFixed()` on undefined —
  // every nested field is guarded so a partial payload falls back to the
  // locally-computed numbers instead of throwing.
  const hasNum = (v) => typeof v === 'number' && Number.isFinite(v);

  // Strict empty states: every figure on this page reads the real rows above,
  // or renders an empty state. The sample-preview layer that used to stand in
  // while all collections were empty was removed 2026-09-22 (AGENTS2 section 7
  // requires zero synthetic rows in the client).
  const totalParcels    = hasNum(dashboardStats?.totalParcels) ? dashboardStats.totalParcels : parcels.length;
  const deliveredCount  = hasNum(dashboardStats?.deliveredCount) ? dashboardStats.deliveredCount : parcels.filter(p => isDeliveredStatus(p.status)).length;
  const deliverySuccessPct = hasNum(dashboardStats?.deliverySuccessPct)
    ? dashboardStats.deliverySuccessPct.toFixed(1)
    : totalParcels ? ((deliveredCount / totalParcels) * 100).toFixed(1) : '0.0';
  const totalRidersCount  = hasNum(dashboardStats?.totalRiders) ? dashboardStats.totalRiders : riders.length;
  const activeRidersCount = hasNum(dashboardStats?.activeRidersCount) ? dashboardStats.activeRidersCount : riders.filter(r => r.status === 'Active').length;
  const avgRating   = hasNum(dashboardStats?.avgRiderRating)
    ? dashboardStats.avgRiderRating.toFixed(1)
    : riders.length ? (riders.reduce((s, r) => s + (r.rating || 0), 0) / riders.length).toFixed(1) : '0.0';
  const totalRides  = hasNum(dashboardStats?.totalDeliveries) ? dashboardStats.totalDeliveries : riders.reduce((s, r) => s + (r.deliveries || 0), 0);

  const last7 = useMemo(() => buildLast7Days(parcels), [parcels]);
  const createdVals  = last7.map(d => d.created);

  // Week-over-week windows, reused below for the one primary KPI with enough
  // history for a real trend.
  const now = new Date();
  const startThisWeek = new Date(now); startThisWeek.setDate(now.getDate() - 6);
  const startPrevWeek = new Date(now); startPrevWeek.setDate(now.getDate() - 13);
  const endPrevWeek   = new Date(now); endPrevWeek.setDate(now.getDate() - 7);

  // Delivery Success is the only primary KPI with a legitimate week-over-week
  // comparison (parcels carry real createdAt timestamps). The other three are
  // point-in-time snapshots (live rider roster, current queue), so we don't
  // fabricate a trend for them.
  const thisWeekParcels = parcels.filter(p => p.createdAt && new Date(p.createdAt) >= startThisWeek);
  const prevWeekParcels = parcels.filter(p => p.createdAt && new Date(p.createdAt) >= startPrevWeek && new Date(p.createdAt) <= endPrevWeek);
  const thisWeekSuccessPct = thisWeekParcels.length ? (thisWeekParcels.filter(p => isDeliveredStatus(p.status)).length / thisWeekParcels.length) * 100 : null;
  const prevWeekSuccessPct = prevWeekParcels.length ? (prevWeekParcels.filter(p => isDeliveredStatus(p.status)).length / prevWeekParcels.length) * 100 : null;
  const successTrendPts = (thisWeekSuccessPct !== null && prevWeekSuccessPct !== null)
    ? Number((thisWeekSuccessPct - prevWeekSuccessPct).toFixed(1))
    : null;

  // Dynamic rider delivery and performance derivation from live parcels.
  // Riders with no assigned parcels are unranked (successRate null) — they
  // sort below every ranked rider instead of defaulting to a false 100%.
  const ridersWithLiveDeliveries = useMemo(() => {
    return riders.map(r => {
      const rName = (r.riderName || '').trim().toLowerCase();
      const rId = String(r._id || '');
      const regId = (r.registrationId || '').trim();

      // Count delivered parcels where this rider was assigned
      const parcelDeliveries = parcels.filter(p => {
        if (!isDeliveredStatus(p.status)) return false;
        const pRiderId = String(p.riderId || '');
        const pRiderName = String(p.riderName || '').trim().toLowerCase();
        return (regId && pRiderId === regId) || (rId && pRiderId === rId) || (rName && pRiderName === rName);
      }).length;

      // Count total parcels assigned to this rider
      const totalAssigned = parcels.filter(p => {
        const pRiderId = String(p.riderId || '');
        const pRiderName = String(p.riderName || '').trim().toLowerCase();
        return (regId && pRiderId === regId) || (rId && pRiderId === rId) || (rName && pRiderName === rName);
      }).length;

      const actualDeliveries = Math.max(r.deliveries || 0, parcelDeliveries);
      const computedSuccessRate = totalAssigned > 0
        ? Math.round((parcelDeliveries / totalAssigned) * 100)
        : (hasNum(r.successRate) ? r.successRate : null);

      return {
        ...r,
        deliveries: actualDeliveries,
        successRate: computedSuccessRate,
        totalAssigned,
      };
    });
  }, [riders, parcels]);

  // Ranked riders only — unassigned riders never headline the leaderboard.
  const rankeriders = ridersWithLiveDeliveries.filter(r => r.successRate !== null);
  const topRiders   = [...rankeriders].sort((a, b) => (b.successRate || 0) - (a.successRate || 0)).slice(0, 7);
  const peakRider     = topRiders[0]?.riderName || 'No ranked rider yet';

  const inTransitCount = parcels.filter(p => isInTransitFamilyStatus(p.status)).length;
  const pendingVerificationsCount = pendingSellers.length + pendingRiders.length;

  // Delivery-fee revenue (2026-09-11 parity): the mobile app's booking fee
  // now bridges onto every Parcel as deliveryFee — sum it over completed
  // deliveries, mirroring the app's Transactions screen. Hidden entirely
  // when no fee data has synced yet (honest empty state, not a zero lie).
  const completedFeeParcels = parcels.filter(p => isDeliveredStatus(p.status) && typeof p.deliveryFee === 'number' && p.deliveryFee > 0);
  const collectedFees = completedFeeParcels.reduce((sum, p) => sum + p.deliveryFee, 0);

  // ── The KPI row ───────────────────────────────────────────────────────
  // Exactly four headline figures. Everything else this page used to repeat
  // here (seller count, customer count, fees, on-duty breakdown) now appears
  // once, inside the section that owns it, so no number is drawn twice.
  const dutyRatePct = totalRidersCount > 0 ? Math.round((activeRidersCount / totalRidersCount) * 100) : 0;
  const inTransitPct = totalParcels > 0 ? Math.round((inTransitCount / totalParcels) * 100) : 0;

  // Only the delivery-success figure has an honest week-over-week comparison —
  // parcel rows carry real dates. The rest are point-in-time snapshots, so no
  // trend badge is invented for them.
  const successTrendText = successTrendPts === null
    ? null
    : `${successTrendPts >= 0 ? '+' : ''}${successTrendPts} pts`;

  const primaryKpis = [
    {
      key: 'delivery-success', label: 'Delivery Success', icon: PackageCheck, tone: 'purple',
      value: `${deliverySuccessPct}%`,
      sub: totalParcels > 0 ? `${deliveredCount} of ${totalParcels} parcels delivered` : 'No parcels booked yet',
      trendText: successTrendText,
      trendTone: successTrendPts !== null && successTrendPts < 0 ? 'negative' : 'positive',
    },
    {
      key: 'in-transit', label: 'In Transit', icon: Truck, tone: 'orange',
      value: `${inTransitCount}`,
      sub: totalParcels > 0 ? `${inTransitPct}% of all parcels are on the road` : 'Nothing on the road yet',
    },
    {
      key: 'on-duty-riders', label: 'Riders On Duty', icon: Bike, tone: 'emerald',
      value: `${activeRidersCount}/${totalRidersCount}`,
      sub: totalRidersCount > 0 ? `${dutyRatePct}% of riders are on duty` : 'No riders registered yet',
    },
    {
      key: 'awaiting-review', label: 'Waiting For Review', icon: UserCheck, tone: 'blue',
      value: `${pendingVerificationsCount}`,
      sub: pendingVerificationsCount > 0
        ? `${pendingSellers.length} sellers and ${pendingRiders.length} riders to check`
        : 'Nothing is waiting for review',
    },
  ];

  const weekly = useMemo(() => buildLastNWeeks(parcels, 6), [parcels]);

  // Hour granularity for the Parcel Volume card. The standalone "Hourly
  // Activity" panel drew a second parcel-over-time chart for the same metric at
  // a finer scale; that scale now lives in this card's period switch instead of
  // in a card of its own.
  const hourly = useMemo(() => {
    const now = new Date();
    const buckets = [];
    for (let i = 13; i >= 0; i--) {
      const slot = new Date(now.getTime() - i * 3600000);
      const dayKey = slot.toISOString().slice(0, 10);
      const hour = slot.getHours();
      const countedAt = (iso) => {
        if (!iso) return false;
        const at = new Date(iso);
        return !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === dayKey && at.getHours() === hour;
      };
      buckets.push({
        label: `${String(hour).padStart(2, '0')}:00`,
        booked: parcels.filter((p) => countedAt(p.createdAt)).length,
        delivered: parcels.filter((p) => isDeliveredStatus(p.status) && countedAt(p.updatedAt)).length,
      });
    }
    return buckets;
  }, [parcels]);

  const isHourlyView = volumeView === 'hourly';
  const volumeVals = isHourlyView
    ? hourly.map((h) => h.booked)
    : volumeView === 'daily' ? createdVals : weekly.map(w => w.created);
  const volumeLabels = isHourlyView
    ? hourly.map((h) => h.label)
    : volumeView === 'daily' ? last7.map(d => d.label) : weekly.map(w => w.label);
  const maxVolume = Math.max(1, ...volumeVals);
  const volumeMax = niceAxisMax(maxVolume);
  const volumeTicks = axisTicks(volumeMax);
  const hasVolume = volumeVals.some((v) => v > 0);
  const hourlyBooked = hourly.reduce((sum, h) => sum + h.booked, 0);
  const hourlyDelivered = hourly.reduce((sum, h) => sum + h.delivered, 0);
  const hourlyActiveHours = hourly.filter((h) => h.booked > 0).length || 1;
  const hourlyAvg = Math.round((hourlyBooked / hourlyActiveHours) * 10) / 10;

  // ── Parcel status composition ──────────────────────────────────────────
  // Grouped through the canonical normalizer (never a local status map) and
  // coloured from the shared parcel palette — same fallback StatusBadge uses for
  // a status the palette does not carry.
  const statusBreakdown = useMemo(() => {
    const counts = new Map();
    parcels.forEach((p) => {
      const key = normalizeParcelStatus(p.status);
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    const rows = [...counts.entries()]
      .map(([status, count]) => ({
        status,
        count,
        color: (PARCEL_STATUS_COLORS[status] || PARCEL_STATUS_COLORS.Pending).color,
      }))
      .sort((a, b) => b.count - a.count);
    // Six slices plus an aggregated remainder keeps the ring readable.
    if (rows.length > 6) {
      const head = rows.slice(0, 6);
      const rest = rows.slice(6).reduce((sum, row) => sum + row.count, 0);
      return [...head, { status: 'Other', count: rest, color: PARCEL_STATUS_COLORS.Returned.color }];
    }
    return rows;
  }, [parcels]);

  // Whole-number shares that add up to exactly 100. Rounding each slice on its
  // own produced a legend of 25+23+20+18+15 = 101, which reads as an error on a
  // page whose whole point is honest numbers — so the largest remainders take
  // the leftover points.
  const statusShares = useMemo(() => {
    const total = parcels.length;
    const shares = new Map();
    if (!total || statusBreakdown.length === 0) return shares;

    const floors = statusBreakdown.map((row) => {
      const exact = (row.count / total) * 100;
      return { status: row.status, whole: Math.floor(exact), remainder: exact - Math.floor(exact) };
    });

    let leftover = 100 - floors.reduce((sum, row) => sum + row.whole, 0);
    const byRemainder = [...floors].sort((a, b) => b.remainder - a.remainder);
    for (const row of byRemainder) {
      if (leftover <= 0) break;
      row.whole += 1;
      leftover -= 1;
    }

    floors.forEach((row) => shares.set(row.status, row.whole));
    return shares;
  }, [statusBreakdown, parcels.length]);

  // Per-page prop contracts. Every page gets currentUser from the common base
  // below; this adds only the extras. key -> component lives in pageMap.js,
  // key -> extra props lives here — one registry each, no duplicated switch.
  // (The two verification pages are also handed onNavigateToSettings by the
  // historical code, but neither consumes it — not carried forward.)
  const pagePropsFor = (key) => ({
    'process-seller': { pendingSellers, setPendingSellers },
    'process-rider':  { pendingRiders,  setPendingRiders  },
    'tracking-info':  { reports: trackingReports, onReportsChange: setTrackingReports },
    'logout':         { setActivePage: setActiveMenuItem, onLogout, onCancel: () => setActiveMenuItem('dashboard') },
  }[key] || {});

  // One router: the active key comes from App.jsx (hash-synced), the component
  // from PAGE_MAP. Pages hidden for the current role render nothing — the same
  // visibility rule the sidebar applies, now also enforced for deep links and
  // header navigation. Logout is reachable from the header, not the sidebar,
  // so it is exempt from the sidebar-visibility gate. The manage-accounts and
  // hub-parcels role checks the old switch carried inline are subsumed by the
  // gate: those keys only exist in menus built for their roles.
  const renderPage = () => {
    const key = activeMenuItem;
    if (key === 'dashboard' || !PAGE_MAP[key]) return null;
    const visible = key === 'logout' || currentUser?.role === 'super_admin' || visibleMenuItems.some(
      (item) => item.key === key || item.children?.some((c) => c.key === key),
    );
    if (!visible) return null;
    const PageComponent = PAGE_MAP[key];
    return <PageComponent currentUser={currentUser} {...pagePropsFor(key)} />;
  };

  return (
    <div data-yto-typography-floor className={`ad-wrapper ${sidebarCollapsed ? 'ad-sidebar--collapsed' : ''}`}>
      {/* Mobile backdrop — closes the drawer when tapping outside it */}
      {mobileNavOpen && <div className="ad-mobile-backdrop" onClick={() => setMobileNavOpen(false)} aria-hidden="true" />}
      <button className="ad-nav-hamburger" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation menu">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>

      <aside
        className={`ad-sidebar ${mobileNavOpen ? 'ad-sidebar--mobile-open' : ''}`}
        onMouseLeave={closeRailFlyout}
        aria-label="Main navigation"
      >
        <div className="ad-sidebar-header">
          <Tooltip content={sidebarCollapsed ? 'Expand sidebar to full menu' : 'Collapse sidebar to icon rail'}>
          <button className="ad-sidebar-collapse-btn" onClick={toggleSidebar} aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points={sidebarExpanded ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} /></svg>
          </button>
          </Tooltip>
          <Tooltip content={sidebarCollapsed ? 'Expand sidebar to full menu' : 'Collapse sidebar to icon rail'}>
          <button
            type="button"
            className="ad-sidebar-logo ad-sidebar-logo--toggle"
            onClick={toggleSidebar}
            aria-expanded={!sidebarCollapsed}
            aria-label={sidebarCollapsed ? 'Expand sidebar to full menu' : 'Collapse sidebar to icon rail'}
            title={sidebarCollapsed ? 'Expand sidebar to full menu' : 'Collapse sidebar to icon rail'}
          >
            <span className="ad-sidebar-logo-circle" aria-hidden="true">
              <img src={yto_logo} alt="" className="ad-sidebar-logo-img" onError={(e) => { e.target.style.display = 'none'; }} />
            </span>
            <span className="ad-sidebar-nav-text ad-sidebar-logo-text">YTO <span>EXPRESS</span></span>
          </button>
          </Tooltip>
        </div>

        {/* Show logged in user info if available */}
        {currentUser && (
          <div className="ad-sidebar-user">
            <div className="ad-sidebar-user-name">{currentUser.name}</div>
            <div className="ad-sidebar-user-role">
              {{ super_admin: 'Super Admin', staff: 'Staff', hub_receiver: 'Hub Receiver' }[currentUser.role] || currentUser.role}
            </div>
          </div>
        )}

        <nav className="ad-sidebar-nav">
          {visibleSections.map(section => (
            <div className="ad-sidebar-nav-section" key={section.label}>
              <p className="ad-sidebar-nav-section-label">{section.label}</p>
              <ul className="ad-sidebar-nav-list">
                {section.items.map(item => (
                <li key={item.key}>
                  {item.children ? (
                    <div className="ad-sidebar-dropdown"
                      onMouseEnter={() => sidebarCollapsed && setRailFlyout(item.key)}
                      onMouseLeave={closeRailFlyout}
                    >
                      <button data-tooltip={item.label} className={`ad-sidebar-nav-item ad-sidebar-nav-parent ${item.children.some(c => c.key === activeMenuItem) ? 'ad-sidebar-nav-parent--active' : ''} ${openSection === item.key ? 'ad-sidebar-nav-parent--open' : ''}`} onClick={() => { if (sidebarCollapsed) setRailFlyout(prev => (prev === item.key ? null : item.key)); else toggleSection(item.key); }} type="button" aria-expanded={sidebarCollapsed ? railFlyout === item.key : openSection === item.key}>
                        {getIcon(item.key)}
                        <span className="ad-sidebar-nav-text">{item.label}</span>
                        <svg className={`ad-sidebar-chevron ${(sidebarCollapsed ? railFlyout === item.key : openSection === item.key) ? 'ad-sidebar-chevron--rotated' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                      </button>
                      <ul className={`ad-sidebar-submenu ${openSection === item.key ? 'ad-sidebar-submenu--open' : ''}`}>
                        {item.children.map(child => (
                          <li key={child.key}>
                            <button type="button" className={`ad-sidebar-submenu-link ${activeMenuItem === child.key ? 'ad-sidebar-submenu-link--active' : ''}`} onClick={() => handleMenuClick(child.key)}>
                              {icons.sub}
                              <span className="ad-sidebar-nav-text">{child.label}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                      {/* Flyout shown only when the sidebar is a collapsed rail */}
                      {sidebarCollapsed && (
                        <div className={`ad-rail-flyout ${railFlyout === item.key ? 'ad-rail-flyout--open' : ''}`}
                          onMouseEnter={() => setRailFlyout(item.key)}
                          onMouseLeave={closeRailFlyout}
                        >
                          <div className="ad-rail-flyout-title">{item.label}</div>
                          {item.children.map(child => (
                            <button key={child.key} type="button" className={`ad-rail-flyout-link ${activeMenuItem === child.key ? 'ad-rail-flyout-link--active' : ''}`} onClick={() => handleMenuClick(child.key)}>
                              {icons.sub}
                              <span>{child.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <button type="button" data-tooltip={item.label} className={`ad-sidebar-nav-item ${activeMenuItem === item.key ? 'ad-sidebar-nav-item--active' : ''}`} onClick={() => handleMenuClick(item.key)}>
                      {getIcon(item.key)}
                      <span className="ad-sidebar-nav-text">{item.label}</span>
                    </button>
                  )}
                </li>
              ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <main className={`ad-main${activeMenuItem === 'dashboard' ? ' ad-main--no-scroll' : ''}`}>
        <GlobalHeader
          currentUser={currentUser}
          riders={riders}
          pendingCount={pendingVerificationsCount}
          onNavigate={handleMenuClick}
          onNavigateSettings={goToSettings}
          onLogoutClick={() => handleMenuClick('logout')}
        />
        {isDemoMode && (
          // Visible on every page (outside the dashboard/renderPage split
          // below) so fabricated fallback rows — see VITE_DEMO_MODE in
          // services/api.js — are never mistaken for real records.
          <div
            role="status"
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: '#fef3c7', borderBottom: '1px solid #f59e0b',
              color: '#92400e', fontSize: 13, fontWeight: 600,
              padding: '8px 20px',
            }}
          >
            <AlertTriangle size={15} aria-hidden="true" />
            Demo Data — showing sample records because no live data has synced yet. These are not real customers, parcels, or riders.
          </div>
        )}
        {activeMenuItem !== 'dashboard' ? (
          <ErrorBoundary
            key={`${activeMenuItem}:${retryNonce}`}
            onReset={() => (setRetryNonce ? setRetryNonce(n => n + 1) : null)}
            onHome={() => { setActiveMenuItem('dashboard'); if (setRetryNonce) setRetryNonce(n => n + 1); }}
          >
            {renderPage()}
          </ErrorBoundary>
        ) : (
          <div className="enhanced-dashboard-root">
            <header className="ed-toolbar">
              <div className="ed-toolbar-titles">
                <h1>Dashboard</h1>
                <p>Logistics Performance · Today, {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
              </div>
              <div className="ed-toolbar-controls">
                <RefreshButton
                  onClick={() => fetchDashboardData(true)}
                  isRefreshing={isRefreshing}
                  disabled={dashboardLoading}
                />
              </div>
            </header>

            {dashboardLoading ? (
              // The dashboard body is a card grid, not a table — a <tr>/<td>
              // skeleton here rendered invalid DOM (React logs "<tr> cannot be
              // a child of <div>") on every cold load.
              <ListSkeleton rows={6} />
            ) : (
              <>
                {statsError && (
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#c2410c', background: '#fff4ec', padding: '6px 12px', borderRadius: '8px', marginBottom: '10px', display: 'block' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={13} aria-hidden="true" /> Some totals could not be loaded just now. The numbers below are counted from the parcel and rider lists instead.</span>
                  </div>
                )}
                {/* Four headline figures, one card each. Seller count, customer
                    count and collected fees are deliberately not repeated here —
                    they live in the sections that own them. */}
                <StatCard.Grid cols={4} className="ed-kpi-grid">
                  {primaryKpis.map((kpi) => (
                    <StatCard
                      key={kpi.key}
                      label={kpi.label}
                      value={kpi.value}
                      sub={kpi.sub}
                      trend={kpi.trendText}
                      trendTone={kpi.trendTone}
                      icon={kpi.icon}
                      tone={kpi.tone}
                    />
                  ))}
                </StatCard.Grid>
                {/* Top row: Parcel Volume (compact) | Rider Performance | Parcel
                    Operations, in that fixed order — each card fills the row's
                    height and scrolls its own body internally (.ed-top-card-body)
                    so an overlong list never grows the page itself. */}
                <div className="ed-top-row">
                  <SectionCard
                    className="ed-top-card ed-top-card--volume"
                    bodyClassName="ed-top-card-body"
                    title="Parcel Volume"
                    subtitle={volumeView === 'daily' ? 'Parcels booked per day, last 7 days' : volumeView === 'weekly' ? 'Parcels booked per week, last 6 weeks' : 'Parcels booked per hour, last 14 hours'}
                    actions={(
                      <div className="ed-segmented" role="group" aria-label="Chart period">
                        {['daily', 'weekly', 'hourly'].map((v) => (
                          <button
                            key={v}
                            type="button"
                            className={`ed-segmented-btn${volumeView === v ? ' is-active' : ''}`}
                            aria-pressed={volumeView === v}
                            onClick={() => setVolumeView(v)}
                          >
                            {v === 'daily' ? 'Daily' : v === 'weekly' ? 'Weekly' : 'Hourly'}
                          </button>
                        ))}
                      </div>
                    )}
                    footer={!hasVolume ? null : (
                      <CardFooter
                        resultsLabel={isHourlyView
                          ? `${hourlyBooked} booked and ${hourlyDelivered} delivered in the last 14 hours`
                          : `${volumeVals.reduce((a, b) => a + b, 0)} parcels booked in this period`}
                        pills={isHourlyView
                          ? [
                              { label: 'Peak hour', value: maxVolume, tone: 'purple' },
                              { label: 'Average per active hour', value: hourlyAvg, tone: 'slate' },
                            ]
                          : [
                              { label: 'Busiest', value: volumeLabels[volumeVals.indexOf(maxVolume)], tone: 'purple' },
                              { label: 'Peak', value: maxVolume, tone: 'slate' },
                            ]}
                      />
                    )}
                  >
                    {!hasVolume ? (
                      <EmptyState icon={PackageSearch} title="No parcel activity yet" description="Parcels booked through the app will show up here." />
                    ) : isHourlyView ? (
                      <TrendArea
                        points={hourly.map((h) => ({ label: h.label, value: h.booked }))}
                        reference={{ value: hourlyAvg, label: `Average ${hourlyAvg}` }}
                        height={140}
                        ariaLabel={`Parcels booked per hour over the last 14 hours, ${hourlyBooked} in total.`}
                      />
                    ) : (
                      <>
                        <div className="ed-plot">
                          <div className="ed-plot-y" aria-hidden="true">
                            {volumeTicks.map((tick) => <span key={tick}>{tick}</span>)}
                          </div>
                          <div className="ed-plot-area">
                            <div className="ed-plot-grid" aria-hidden="true">
                              {volumeTicks.map((tick) => <span key={tick} />)}
                            </div>
                            <div className="ed-plot-bars">
                              {volumeVals.map((v, i) => {
                                const pct = barHeightPercent(v, volumeMax);
                                return (
                                  <div className="ed-plot-col" key={volumeLabels[i]}>
                                    <div className="ed-plot-track" title={`${volumeLabels[i]}: ${v} ${v === 1 ? 'parcel' : 'parcels'} booked`}>
                                      <div
                                        className={`ed-plot-fill${isUniquePeak(v, volumeVals) ? ' is-peak' : ''}`}
                                        style={{ height: `${pct}%` }}
                                      />
                                    </div>
                                    <span className="ed-plot-value" style={{ bottom: `calc(${pct}% + 6px)` }}>{v}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                        <div className="ed-plot-x" aria-hidden="true">
                          {volumeVals.map((v, i) => <span key={volumeLabels[i]}>{volumeLabels[i]}</span>)}
                        </div>
                      </>
                    )}
                  </SectionCard>

                  <SectionCard
                    className="ed-top-card"
                    bodyClassName="ed-top-card-body"
                    title="Rider Performance"
                    subtitle="Ranked by success rate on the parcels each rider was given"
                    actions={<button type="button" className="ed-link-btn" onClick={() => handleMenuClick('monitor-rider')}>Duty monitor</button>}
                    footer={topRiders.length === 0 ? null : (
                      <CardFooter
                        resultsLabel={`${activeRidersCount} of ${riders.length} riders on duty`}
                        pills={[
                          { label: 'Top performer', value: peakRider, tone: 'green' },
                          { label: 'Average rating', value: `${avgRating} / 5`, tone: 'purple' },
                          { label: 'Deliveries', value: totalRides.toLocaleString(), tone: 'slate' },
                        ]}
                      />
                    )}
                  >
                    {topRiders.length === 0 ? (
                      <EmptyState icon={Users} title={riders.length === 0 ? 'No riders registered yet' : 'No deliveries assigned yet'} description={riders.length === 0 ? 'Riders approved through the app will appear here.' : 'Rankings appear once riders start completing assigned parcels.'} />
                    ) : (
                      <DataTable>
                        <DataTable.Head>
                          <tr>
                            <DataTable.Th>Rider</DataTable.Th>
                            <DataTable.Th>Duty</DataTable.Th>
                            <DataTable.Th align="right">Parcels</DataTable.Th>
                            <DataTable.Th align="right">Delivered</DataTable.Th>
                            <DataTable.Th align="right">Success</DataTable.Th>
                            <DataTable.Th align="right">Rating</DataTable.Th>
                          </tr>
                        </DataTable.Head>
                        <tbody>
                          {topRiders.map((r) => (
                            <DataTable.Row key={r.registrationId || String(r._id) || r.riderName}>
                              <DataTable.Cell>
                                <span className="ed-rider-name">{r.riderName || 'Unnamed rider'}</span>
                                <span className="ed-rider-id">{r.registrationId || 'No rider ID yet'}</span>
                              </DataTable.Cell>
                              <DataTable.Cell>{r.isOnDuty ? 'On duty' : 'Off duty'}</DataTable.Cell>
                              <DataTable.Cell align="right" tabularNums>{(r.totalAssigned || 0).toLocaleString()}</DataTable.Cell>
                              <DataTable.Cell align="right" tabularNums>{(r.deliveries || 0).toLocaleString()}</DataTable.Cell>
                              <DataTable.Cell align="right" tabularNums>{r.successRate}%</DataTable.Cell>
                              <DataTable.Cell align="right" tabularNums>{r.rating ? Number(r.rating).toFixed(1) : 'Not rated'}</DataTable.Cell>
                            </DataTable.Row>
                          ))}
                        </tbody>
                      </DataTable>
                    )}
                  </SectionCard>

                  <SectionCard
                    className="ed-top-card"
                    bodyClassName="ed-top-card-body"
                    title="Parcel Operations"
                    subtitle="Where every parcel stands"
                    footer={(
                      <div className="ed-card-actions">
                        <button type="button" className="ed-action-btn primary" onClick={() => handleMenuClick('manage-parcels')}>
                          <ClipboardList size={15} aria-hidden="true" /> View parcels
                        </button>
                        <button type="button" className="ed-action-btn secondary" disabled={parcels.length === 0} onClick={() => dashboardExportPDF(parcels)}>
                          <Download size={15} aria-hidden="true" /> Download PDF
                        </button>
                        <button type="button" className="ed-action-btn secondary" disabled={parcels.length === 0} onClick={() => dashboardExportCSV(parcels)}>
                          <Share2 size={15} aria-hidden="true" /> Export CSV
                        </button>
                      </div>
                    )}
                  >
                    {statusBreakdown.length === 0 ? (
                      <EmptyState icon={PackageSearch} title="No parcels yet" description="The status breakdown appears once parcels are booked." />
                    ) : (
                      <>
                        <div className="ed-donut-row">
                          <StatusDonut rows={statusBreakdown} total={parcels.length} />
                          <div className="ed-status-legend">
                            {statusBreakdown.map((row) => (
                              <div className="ed-status-row" key={row.status}>
                                <i className="ed-status-swatch" style={{ background: row.color }} aria-hidden="true" />
                                <span className="ed-status-name">{row.status}</span>
                                <strong className="ed-status-count">{row.count}</strong>
                                <span className="ed-status-share">{statusShares.get(row.status)}%</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        {collectedFees > 0 && (
                          <p className="ed-caption">
                            Delivery fees collected: <strong>₱{collectedFees.toFixed(2)}</strong> from {completedFeeParcels.length} completed {completedFeeParcels.length === 1 ? 'delivery' : 'deliveries'}.
                          </p>
                        )}
                      </>
                    )}
                  </SectionCard>
                </div>

                {/* Admin-side diagnostics. Deliberately the last card on the page
                    and the only place connection health is reported, so it stays
                    out of the way until someone goes looking for it. */}
                <SectionCard title="System Activity" subtitle="Dashboard connections and alerts">
                  <div className="ed-rail-stats">
                    <div className="ed-rail-stat">
                      <label>Admin connections</label>
                      <strong>{sseConnected ? sseClientCount : 0}</strong>
                      <span>{sseConnected ? 'Live updates are flowing' : 'Live updates are paused'}</span>
                    </div>
                  </div>
                  <PeakAlertBanner />
                </SectionCard>
              </>
            )}
          </div>
        )}      </main>
    </div>
  );
}
