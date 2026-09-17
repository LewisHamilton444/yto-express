import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  PackageCheck, Bike, Truck, UserCheck,
  TrendingUp, TrendingDown,
  ClipboardList, Download, Share2,
  Users, PackageSearch, AlertTriangle,
} from 'lucide-react';
import { apiFetch, parcelsApi, ridersApi } from './services/api';
import { exportToCSV } from './exportUtils';
import { barHeightPercent } from './utils/barHeight';
import useSSE from './services/useSSE';
import './AnalyticsDashboard.css';
import Tooltip from './components/ui/Tooltip';
import yto_logo from './yto_express_logo.png';

// Page components come from the single registry in pageMap.js — the same map
// App.jsx uses for hash validation — so there is exactly one key -> component
// source of truth for the whole portal.
import { PAGE_MAP } from './pageMap';
import ConnectionHistoryChart             from "./ConnectionHistoryChart";
import PeakAlertBanner                   from "./PeakAlertBanner";import GlobalHeader from "./GlobalHeader";
import TableSkeleton from "./components/ui/TableSkeleton";
import { initialPendingSellers, initialPendingRiders } from "./verification/registrationCredentials";
import { isDeliveredStatus, isReturnFamilyStatus, isInTransitFamilyStatus } from "./utils/parcelStatus";
import { isDemoEmail } from './demoUtils';

function mapSellerToPendingItem(seller) {
  const isDemo = (seller.accountCategory || (isDemoEmail(seller.email) ? 'DEMO' : 'REAL')) === 'DEMO';
  return {
    id: seller.registrationId || String(seller._id),
    _id: seller._id,
    fullName: seller.fullName || '—',
    contactNumber: seller.phone || '—',
    email: seller.email || '—',
    storeName: seller.storeName || '—',
    accountCategory: isDemo ? 'DEMO' : 'REAL',
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
  const isDemo = (rider.accountCategory || (isDemoEmail(rider.email) ? 'DEMO' : 'REAL')) === 'DEMO';
  return {
    id: rider.registrationId || String(rider._id),
    _id: rider._id,
    fullName: rider.riderName || '—',
    contactNumber: rider.phone || '—',
    email: rider.email || '—',
    accountCategory: isDemo ? 'DEMO' : 'REAL',
    governmentId: {
      type: rider.idType || "Driver's License",
      number: rider.licenseNumber || rider.idNumber || '—',
    },
    vehicle: {
      type: rider.vehicleType || 'Motorcycle',
      plate: rider.vehiclePlate || '—',
      model: rider.vehicleType || '—',
    },
    address: typeof rider.address === 'string' ? rider.address : (rider.address?.street || '—'),
    submittedAt: rider.createdAt || new Date().toISOString(),
    status: rider.status || 'Pending',
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
    items: [
      ...(role === 'super_admin' ? [{ label: 'Accounts', key: 'manage-accounts' }] : []),
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
// timestamps — the "Weekly" view for the Parcel Volume chart.
const buildLastNWeeks = (parcels, n = 6) => {
  const weeks = [];
  for (let i = n - 1; i >= 0; i--) {
    const end = new Date();
    end.setDate(end.getDate() - i * 7);
    const start = new Date(end);
    start.setDate(end.getDate() - 6);
    const created = parcels.filter(p => {
      if (!p.createdAt) return false;
      const d = new Date(p.createdAt);
      return d >= start && d <= end;
    }).length;
    weeks.push({ label: `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`, created });
  }
  return weeks;
};

// Stylized placeholder for a chart/list with no data yet — swaps the old
// plain "No X yet." text for a small icon + heading + helper line.
const DashboardEmptyState = (props) => {
  const Icon = props.icon;
  return (
    <div className="ed-empty-state">
      <div className="ed-empty-icon"><Icon size={28} strokeWidth={1.75} /></div>
      <p className="ed-empty-title">{props.title}</p>
      {props.subtitle && <p className="ed-empty-sub">{props.subtitle}</p>}
    </div>
  );
};

export default function AnalyticsDashboard({ onLogout, currentUser, activePage = 'dashboard', setActivePage }) {
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
  const [archivedReports] = useState([]);

  const isSuperAdmin = currentUser?.role === 'super_admin';

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
    // Auto-open the parent section whenever a nested child is activated, so
    // the current page is never hidden behind a collapsed group (deep links
    // from the header/search land with the right group expanded).
    const parent = visibleMenuItems.find(item => item.children?.some(c => c.key === key));
    if (parent) setOpenSection(parent.key);
    setMobileNavOpen(false);
  };
  const goToSettings    = () => { setActiveMenuItem('settings'); setMobileNavOpen(false); };

  const visibleSections = getMenuSections(currentUser?.role);
  const visibleMenuItems = visibleSections.flatMap(section => section.items);

  // Keep the sidebar's open section in sync whenever the active page is a
  // nested child — covers header/search navigation and Logout's page resets.
  useEffect(() => {
    const parent = visibleMenuItems.find(item => item.children?.some(c => c.key === activeMenuItem));
    if (parent) setOpenSection(parent.key);
  }, [activeMenuItem, visibleMenuItems]);


  // ── Real data from the backend — no more hardcoded numbers ────────────────
  const [parcels, setParcels]         = useState([]);
  const [riders, setRiders]           = useState([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);

  // Top KPI row is bound to the real GET /api/dashboard/stats aggregate
  // (server-computed counts, cheaper than shipping the full parcels/riders
  // arrays just to total them). `dashboardStats` is null until it resolves —
  // everything below still falls back to computing the same numbers from the
  // full arrays fetched above, so the KPI cards never go blank if the stats
  // endpoint alone fails.
  const [dashboardStats, setDashboardStats] = useState(null);
  const [statsError,     setStatsError]     = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDashboardLoading(true);
    Promise.all([
      parcelsApi.list().catch(() => []),
      ridersApi.list().catch(() => []),
    ]).then(([parcelsData, ridersData]) => {
      if (cancelled) return;
      setParcels(Array.isArray(parcelsData) ? parcelsData : []);
      setRiders(Array.isArray(ridersData) ? ridersData : []);
      setDashboardLoading(false);
    });
    apiFetch('/dashboard/stats')
      .then(r => { if (!r.ok) throw new Error(`Stats endpoint responded ${r.status}`); return r.json(); })
      .then(data => { if (!cancelled) setDashboardStats(data); })
      .catch(() => { if (!cancelled) setStatsError(true); });
    return () => { cancelled = true; };
  }, []);

  // Stats endpoint responses have drifted before (missing/renamed fields) and
  // used to crash the dashboard via unconditional `.toFixed()` on undefined —
  // every nested field is guarded so a partial payload falls back to the
  // locally-computed numbers instead of throwing.
  const hasNum = (v) => typeof v === 'number' && Number.isFinite(v);

  const totalParcels    = hasNum(dashboardStats?.totalParcels) ? dashboardStats.totalParcels : parcels.length;
  const deliveredCount  = hasNum(dashboardStats?.deliveredCount) ? dashboardStats.deliveredCount : parcels.filter(p => isDeliveredStatus(p.status)).length;
  const returnedCount   = parcels.filter(p => isReturnStatus(p.status)).length;
  const deliverySuccessPct = hasNum(dashboardStats?.deliverySuccessPct)
    ? dashboardStats.deliverySuccessPct.toFixed(1)
    : totalParcels ? ((deliveredCount / totalParcels) * 100).toFixed(1) : '0.0';
  const returnRatePct      = totalParcels ? ((returnedCount / totalParcels) * 100).toFixed(1) : '0.0';

  const totalRidersCount  = hasNum(dashboardStats?.totalRiders) ? dashboardStats.totalRiders : riders.length;
  const activeRidersCount = hasNum(dashboardStats?.activeRidersCount) ? dashboardStats.activeRidersCount : riders.filter(r => r.status === 'Active').length;
  const avgRating   = hasNum(dashboardStats?.avgRiderRating)
    ? dashboardStats.avgRiderRating.toFixed(1)
    : riders.length ? (riders.reduce((s, r) => s + (r.rating || 0), 0) / riders.length).toFixed(1) : '0.0';
  const totalRides  = hasNum(dashboardStats?.totalDeliveries) ? dashboardStats.totalDeliveries : riders.reduce((s, r) => s + (r.deliveries || 0), 0);

  const last7 = useMemo(() => buildLast7Days(parcels), [parcels]);
  const createdVals  = last7.map(d => d.created);
  const deliveryVals = last7.map(d => d.delivered);
  const returnVals   = last7.map(d => d.returned);
  const maxDelivery = Math.max(1, ...deliveryVals);
  const maxReturn   = Math.max(1, ...returnVals);

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

  const topRiders   = [...riders].sort((a, b) => (b.successRate || 0) - (a.successRate || 0)).slice(0, 7);
  const riderScores = topRiders.map(r => r.successRate || 0);
  const riderLabels = topRiders.map(r => (r.riderName || 'Rider').split(' ')[0]);
  const maxRider     = Math.max(1, ...riderScores);
  const peakRider     = topRiders[0]?.riderName || 'N/A';

  const offlineRidersCount = riders.length - activeRidersCount;
  const inTransitCount = parcels.filter(p => isInTransitFamilyStatus(p.status)).length;
  const pendingVerificationsCount = pendingSellers.length + pendingRiders.length;

  // Delivery-fee revenue (2026-09-11 parity): the mobile app's booking fee
  // now bridges onto every Parcel as deliveryFee — sum it over completed
  // deliveries, mirroring the app's Transactions screen. Hidden entirely
  // when no fee data has synced yet (honest empty state, not a zero lie).
  const completedFeeParcels = parcels.filter(p => isDeliveredStatus(p.status) && typeof p.deliveryFee === 'number' && p.deliveryFee > 0);
  const collectedFees = completedFeeParcels.reduce((sum, p) => sum + p.deliveryFee, 0);

  // Four primary metric cards — replaces the old 8-card KPI grid.
  const primaryKpis = [
    {
      key: 'delivery-success', label: 'Delivery Success', icon: PackageCheck, tone: 'purple',
      value: `${deliverySuccessPct}%`, sub: `${deliveredCount} of ${totalParcels} parcels`, trend: successTrendPts,
    },
    {
      key: 'active-riders', label: 'Active Riders', icon: Bike, tone: 'orange',
      value: `${activeRidersCount}/${totalRidersCount}`, sub: `${offlineRidersCount} offline`, trend: null,
    },
    {
      key: 'in-transit', label: 'In-Transit Parcels', icon: Truck, tone: 'orange',
      value: `${inTransitCount}`, sub: `of ${totalParcels} total parcels`, trend: null,
    },
    {
      key: 'pending-verifications', label: 'Pending Verifications', icon: UserCheck, tone: 'purple',
      value: `${pendingVerificationsCount}`, sub: `${pendingSellers.length} sellers, ${pendingRiders.length} riders`, trend: null,
    },
    ...(collectedFees > 0 ? [{
      key: 'collected-fees', label: 'Delivery Fees Collected', icon: Truck, tone: 'purple',
      value: `₱${collectedFees.toFixed(2)}`, sub: `from ${completedFeeParcels.length} completed ${completedFeeParcels.length !== 1 ? 'deliveries' : 'delivery'}`, trend: null,
    }] : []),
  ];

  const weekly = useMemo(() => buildLastNWeeks(parcels, 6), [parcels]);
  const volumeVals = volumeView === 'daily' ? createdVals : weekly.map(w => w.created);
  const volumeLabels = volumeView === 'daily' ? last7.map(d => d.label) : weekly.map(w => w.label);
  const maxVolume = Math.max(1, ...volumeVals);

  const activityRiders = [...riders].sort((a, b) => (b.deliveries || 0) - (a.deliveries || 0)).slice(0, 7);
  const activityVals   = activityRiders.map(r => r.deliveries || 0);
  const activityLabels = activityRiders.map(r => (r.riderName || 'Rider').split(' ')[0]);
  const maxActivity     = Math.max(1, ...activityVals);

  // Per-page prop contracts. Every page gets currentUser from the common base
  // below; this adds only the extras. key -> component lives in pageMap.js,
  // key -> extra props lives here — one registry each, no duplicated switch.
  const pagePropsFor = (key) => ({
    'process-seller': { pendingSellers, setPendingSellers, onNavigateToSettings: goToSettings },
    'process-rider':  { pendingRiders,  setPendingRiders,  onNavigateToSettings: goToSettings },
    'tracking-info':  { reports: trackingReports, onReportsChange: setTrackingReports },
    'settings':       { archivedReports },
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
    const visible = key === 'logout' || visibleMenuItems.some(
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
          <div className="ad-sidebar-user" style={{ padding: '10px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'white', marginBottom: '2px' }}>{currentUser.name}</div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
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
                      <button data-tooltip={item.label} className={`ad-sidebar-nav-item ad-sidebar-nav-parent ${item.children.some(c => c.key === activeMenuItem) ? 'ad-sidebar-nav-parent--active' : ''}`} onClick={() => { if (sidebarCollapsed) setRailFlyout(prev => (prev === item.key ? null : item.key)); else toggleSection(item.key); }} type="button" aria-expanded={sidebarCollapsed ? railFlyout === item.key : openSection === item.key}>
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

      <main className="ad-main">
        <GlobalHeader
          currentUser={currentUser}
          riders={riders}
          pendingCount={pendingSellers.length + pendingRiders.length}
          onNavigate={handleMenuClick}
          onNavigateSettings={goToSettings}
          onLogoutClick={() => handleMenuClick('logout')}
        />
        {activeMenuItem !== 'dashboard' ? renderPage() : (
          <div className="enhanced-dashboard-root">
            <header className="ed-toolbar">
              <div className="ed-toolbar-titles">
                <h1>Dashboard</h1>
                <p>Delivery Performance Overview</p>
              </div>
              <div className="ed-toolbar-controls">
                {/* SSE Connection Count */}
                <Tooltip content="Admin clients currently connected to the realtime dashboard feed">
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                  background: sseConnected ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                  borderRadius: 8, border: `1px solid ${sseConnected ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={sseConnected ? '#16a34a' : '#dc2626'} strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                  <span style={{ fontSize: 11, fontWeight: 700, color: sseConnected ? '#16a34a' : '#dc2626' }}>
                    {sseClientCount} connected
                  </span>
                </div>
                </Tooltip>
              </div>
            </header>

            {dashboardLoading ? (
              <TableSkeleton rows={8} columns={5} />
            ) : (
              <>
                {statsError && (
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#c2410c', background: '#fff4ec', padding: '6px 12px', borderRadius: '8px', marginBottom: '10px', display: 'inline-block' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={13} aria-hidden="true" /> Some totals could not be loaded just now. The figures below are counted from the full parcel and rider lists.</span>
                  </div>
                )}
                {/* Dominant KPI anchor + compact inline tickers — asymmetric, no uniform card grid */}
                <div className="ed-anchor-row">
                  {(() => {
                    const anchor = primaryKpis[0];
                    const hasTrend = anchor.trend !== null && anchor.trend !== undefined;
                    const trendUp = hasTrend && anchor.trend >= 0;
                    return (
                      <div className="ed-anchor-metric">
                        <span className="ed-anchor-label">{anchor.label}</span>
                        <h2>{anchor.value}</h2>
                        <p className="ed-anchor-sub">{anchor.sub}</p>
                        {hasTrend && (
                          <Tooltip content={`${anchor.label}: change vs the previous week`}>
                            <span className={`ed-kpi-trend ${trendUp ? 'up' : 'down'}`}>
                              {trendUp ? <TrendingUp size={12} strokeWidth={3} /> : <TrendingDown size={12} strokeWidth={3} />}
                              {trendUp ? '+' : ''}{anchor.trend} pts
                            </span>
                          </Tooltip>
                        )}
                      </div>
                    );
                  })()}
                  <div className="ed-ticker-rail">
                    {primaryKpis.slice(1).map((kpi) => (
                      <div className="ed-ticker" key={kpi.key}>
                        <label>{kpi.label}</label>
                        <strong>{kpi.value}</strong>
                        <span>{kpi.sub}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Peak Connection Alert Banner */}
                <PeakAlertBanner />

                {/* SSE Connection History Chart */}
                <div style={{ marginBottom: 20 }}>
                  <ConnectionHistoryChart />
                </div>

                <div className="ed-canvas-grid">
                  <section className="ed-canvas">
                    <div className="ed-panel-head">
                      <div>
                        <h2>Parcel Volume</h2>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {['daily', 'weekly'].map(v => (
                          <button
                            key={v}
                            onClick={() => setVolumeView(v)}
                            style={{
                              padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize',
                              border: `1px solid ${volumeView === v ? '#390955' : '#d5cbe4'}`,
                              background: volumeView === v ? '#390955' : 'white',
                              color: volumeView === v ? 'white' : '#390955',
                            }}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>

                    {volumeVals.every(v => v === 0) ? (
                      <DashboardEmptyState icon={PackageSearch} title="No parcel volume data yet" subtitle="New parcel activity will populate this chart automatically." />
                    ) : (
                      <div className="ed-chart-axis-row">
                        <div className="ed-axis-ticks">
                          <span>{maxVolume}</span>
                          <span>{Math.round(maxVolume / 2)}</span>
                          <span>0</span>
                        </div>
                        <div className="ed-bar-chart">
                          {volumeVals.map((v, i) => (
                            <div className="ed-bar-column" key={i}>
                              <span className="ed-bar-score" style={{ color: v === maxVolume ? '#f37021' : '#390955' }}>{v}</span>
                              <div className="ed-bar-track">
                                <div className={`ed-bar-fill ${v === maxVolume ? 'peak' : 'standard'}`} style={{ height: `${barHeightPercent(v, maxVolume)}%` }} />
                              </div>
                              <span className="ed-bar-day">{volumeLabels[i]}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="ed-canvas-footer">
                      <div className="ed-rail-stat"><label>Total ({volumeView})</label><strong>{volumeVals.reduce((a, b) => a + b, 0)}</strong></div>
                      <div className="ed-rail-stat"><label>Peak</label><strong>{maxVolume}</strong></div>
                    </div>
                  </section>

                  <aside className="ed-rail">
                    <div className="ed-rail-block">
                      <div className="ed-block-head">
                        <h2>Rider Performance</h2>
                        <span className="ed-live-indicator"><span className="ed-live-dot" />Live</span>
                      </div>

                    {riders.length === 0 ? (
                      <DashboardEmptyState icon={Users} title="No riders registered yet" subtitle="Performance rankings will appear here once riders are added." />
                    ) : (
                      <div className="ed-chart-axis-row">
                        <div className="ed-axis-ticks">
                          <span>{maxRider}%</span>
                          <span>{Math.round(maxRider / 2)}%</span>
                          <span>0%</span>
                        </div>
                        <div className="ed-bar-chart">
                          {riderScores.map((score, i) => {
                            const isTop = score === maxRider;
                            return (
                              <div className="ed-bar-column" key={i}>
                                <span className="ed-bar-score" style={{ color: isTop ? '#f37021' : '#390955' }}>{score}%</span>
                                <div className="ed-bar-track">
                                  <div className={`ed-bar-fill ${isTop ? 'peak' : 'standard'}`} style={{ height: `${(score / maxRider) * 100}%` }} />
                                </div>
                                <span className="ed-bar-day">{riderLabels[i]}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                      <div className="ed-rail-stats">
                        <div className="ed-rail-stat"><label>Top Performing Rider</label><strong>{peakRider}</strong></div>
                        <div className="ed-rail-stat"><label>Average Delivery Rating</label><strong>{avgRating} / 5</strong></div>
                        <div className="ed-rail-stat"><label>Total Completed Rides</label><strong>{totalRides.toLocaleString()}</strong></div>
                      </div>
                    </div>

                    <div className="ed-rail-block">
                      <div className="ed-block-head"><h2>Parcel Operations</h2></div>
                      <div className="ed-rail-stats">
                        <div className="ed-rail-stat"><label>Overall Success Rate</label><strong>{deliverySuccessPct}%</strong><span>{deliveredCount} of {totalParcels} parcels</span></div>
                        <div className="ed-rail-stat"><label>Return Rate</label><strong>{returnRatePct}%</strong><span>{returnedCount} of {totalParcels} parcels</span></div>
                      </div>

                      <div className="ed-mini-histogram-block">
                      <div className="ed-mini-head"><h6>Parcel Deliveries (7d)</h6><span>{deliveryVals.reduce((a, b) => a + b, 0)}</span></div>
                      <div className="ed-mini-bars purple">
                        {deliveryVals.map((v, i) => (
                          <div key={i} className="ed-mini-bar" style={{ height: `${barHeightPercent(v, maxDelivery)}%`, background: v === maxDelivery && v > 0 ? '#f37021' : '#390955' }} />
                        ))}
                      </div>
                    </div>

                    <div className="ed-mini-histogram-block">
                      <div className="ed-mini-head"><h6>Returned Parcels (7d)</h6><span style={{ color: '#f37021' }}>{maxReturn} peak</span></div>
                      <div className="ed-mini-bars orange">
                        {returnVals.map((v, i) => (
                          <div key={i} className="ed-mini-bar" style={{ height: `${barHeightPercent(v, maxReturn)}%`, background: v === maxReturn && v > 0 ? '#390955' : '#f37021' }} />
                        ))}
                      </div>
                    </div>

                    </div>

                    <div className="ed-rail-block">
                      <div className="ed-block-head"><h2>Rider Activity</h2></div>
                      {activityRiders.length === 0 ? (
                        <DashboardEmptyState icon={Users} title="No riders registered yet" subtitle="Delivery activity per rider will show up here once riders are added." />
                      ) : (
                        <div className="ed-mini-histogram-block">
                          <div className="ed-mini-head"><h6>Deliveries per Rider (Top 7)</h6><span>{activityVals.reduce((a, b) => a + b, 0)} total</span></div>
                          <div className="ed-mini-bars purple">
                            {activityVals.map((v, i) => (
                              <div key={i} className="ed-mini-bar" style={{ height: `${barHeightPercent(v, maxActivity)}%`, background: v === maxActivity && v > 0 ? '#f37021' : '#390955' }} />
                            ))}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                            {activityLabels.map((label, i) => (
                              <span key={i} style={{ fontSize: 10, color: '#390955', flex: 1, textAlign: 'center' }}>{label}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="ed-rail-stats">
                        <div className="ed-rail-stat"><label>Riders On Duty</label><strong>{activeRidersCount} of {riders.length}</strong></div>
                        <div className="ed-rail-stat"><label>Not On Duty</label><strong>{offlineRidersCount}</strong></div>
                      </div>
                    </div>

                    <div className="ed-action-bar">
                      <Tooltip content="Open the full Manage Parcels page">
                      <button className="ed-action-btn primary" onClick={() => handleMenuClick('manage-parcels')}>
                        <ClipboardList size={15} /> View parcels
                      </button>
                      </Tooltip>
                      <Tooltip content="Download the current parcel list as a PDF report">
                      <button className="ed-action-btn secondary" disabled={parcels.length === 0} onClick={() => dashboardExportPDF(parcels)}>
                        <Download size={15} /> Download PDF
                      </button>
                      </Tooltip>
                      <Tooltip content="Export the current parcel list as a CSV file">
                      <button className="ed-action-btn secondary" disabled={parcels.length === 0} onClick={() => dashboardExportCSV(parcels)}>
                        <Share2 size={15} /> Export CSV
                      </button>
                      </Tooltip>
                    </div>
                  </aside>
                </div>
              </>
            )}
          </div>
        )}      </main>
    </div>
  );
}
