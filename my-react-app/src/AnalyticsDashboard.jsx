import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  PackageCheck, Bike, Truck, UserCheck,
  TrendingUp, TrendingDown,
  ClipboardList, Download, Share2,
  Users, PackageSearch, AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { apiFetch, parcelsApi, ridersApi, sellersApi, customersApi } from './services/api';
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
import ListSkeleton from "./components/ui/ListSkeleton";
import EmptyState from "./components/ui/EmptyState";
import ErrorBoundary from "./components/ui/ErrorBoundary";
import { initialPendingSellers, initialPendingRiders } from "./verification/registrationCredentials";
import { isDeliveredStatus, isReturnFamilyStatus, isInTransitFamilyStatus } from "./utils/parcelStatus";
import {
  shouldPreviewData,
  SAMPLE_PARCELS,
  SAMPLE_RIDERS,
  SAMPLE_SELLERS,
  SAMPLE_PENDING_RIDERS,
  SAMPLE_CUSTOMERS,
  SAMPLE_ISSUES,
} from "./dashboardPreviewData";

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
  const [sellers, setSellers]         = useState([]);
  const [customers, setCustomers]     = useState([]);
  const [issues, setIssues]           = useState([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [isRefreshing, setIsRefreshing]         = useState(false);
  // Owner-requested layout preview: placeholder figures render ONLY while
  // every collection is empty (see dashboardPreviewData.js). Dismissing
  // restores the strict empty states; any real record disables it entirely.
  const [previewOn, setPreviewOn] = useState(true);

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

    // Hub receivers have no People/Support sections — skip those collections
    // so their browser never pulls seller/customer rows it cannot open.
    const isHubReceiver = currentUser?.role === 'hub_receiver';
    const okJson = (res) => (res && res.ok ? res.json().catch(() => []) : []);

    try {
      const [parcelsData, ridersData, statsRes, sellersData, customersData, issuesData] = await Promise.all([
        parcelsApi.list().catch(() => []),
        ridersApi.list().catch(() => []),
        apiFetch('/dashboard/stats').catch(() => null),
        isHubReceiver ? Promise.resolve([]) : sellersApi.list().catch(() => []),
        isHubReceiver ? Promise.resolve([]) : customersApi.list().catch(() => []),
        isHubReceiver ? Promise.resolve([]) : apiFetch('/issues').then(okJson).catch(() => []),
      ]);

      setParcels(Array.isArray(parcelsData) ? parcelsData : []);
      setRiders(Array.isArray(ridersData) ? ridersData : []);
      setSellers(Array.isArray(sellersData) ? sellersData : []);
      setCustomers(Array.isArray(customersData) ? customersData : []);
      setIssues(Array.isArray(issuesData) ? issuesData : []);

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
  }, [currentUser?.role]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Stats endpoint responses have drifted before (missing/renamed fields) and
  // used to crash the dashboard via unconditional `.toFixed()` on undefined —
  // every nested field is guarded so a partial payload falls back to the
  // locally-computed numbers instead of throwing.
  const hasNum = (v) => typeof v === 'number' && Number.isFinite(v);

  // Effective collections: real rows win; placeholder rows (previewing) stand
  // in only while every collection is empty. Every figure below reads these,
  // so preview and live modes can never mix real and placeholder rows.
  // Server aggregates are the tiebreaker: if /dashboard/stats reports real
  // rows while a list endpoint hiccups, placeholders stay off and the honest
  // stats figures render instead of sample data.
  const statsHaveCounts = hasNum(dashboardStats?.totalParcels) && dashboardStats.totalParcels > 0;
  const previewing = previewOn && !statsHaveCounts && shouldPreviewData({ parcels, riders, sellers, customers });
  const dParcels   = previewing ? SAMPLE_PARCELS : parcels;
  const dRiders    = previewing ? SAMPLE_RIDERS : riders;
  const dSellers   = previewing ? SAMPLE_SELLERS : sellers;
  const dCustomers = previewing ? SAMPLE_CUSTOMERS : customers;
  const dIssues    = previewing ? SAMPLE_ISSUES : issues;
  const effPendingSellers = previewing
    ? SAMPLE_SELLERS.filter(s => /pending|verif/i.test(s.status || '')).map(mapSellerToPendingItem)
    : pendingSellers;
  const effPendingRiders = previewing
    ? SAMPLE_PENDING_RIDERS.map(mapRiderToPendingItem)
    : pendingRiders;

  const totalParcels    = hasNum(dashboardStats?.totalParcels) && !previewing ? dashboardStats.totalParcels : dParcels.length;
  const deliveredCount  = hasNum(dashboardStats?.deliveredCount) && !previewing ? dashboardStats.deliveredCount : dParcels.filter(p => isDeliveredStatus(p.status)).length;
  const returnedCount   = dParcels.filter(p => isReturnStatus(p.status)).length;
  const deliverySuccessPct = hasNum(dashboardStats?.deliverySuccessPct) && !previewing
    ? dashboardStats.deliverySuccessPct.toFixed(1)
    : totalParcels ? ((deliveredCount / totalParcels) * 100).toFixed(1) : '0.0';
  const returnRatePct      = totalParcels ? ((returnedCount / totalParcels) * 100).toFixed(1) : '0.0';

  const totalRidersCount  = hasNum(dashboardStats?.totalRiders) && !previewing ? dashboardStats.totalRiders : dRiders.length;
  const activeRidersCount = hasNum(dashboardStats?.activeRidersCount) && !previewing ? dashboardStats.activeRidersCount : dRiders.filter(r => r.status === 'Active').length;
  const avgRating   = hasNum(dashboardStats?.avgRiderRating) && !previewing
    ? dashboardStats.avgRiderRating.toFixed(1)
    : dRiders.length ? (dRiders.reduce((s, r) => s + (r.rating || 0), 0) / dRiders.length).toFixed(1) : '0.0';
  const totalRides  = hasNum(dashboardStats?.totalDeliveries) && !previewing ? dashboardStats.totalDeliveries : dRiders.reduce((s, r) => s + (r.deliveries || 0), 0);

  const last7 = useMemo(() => buildLast7Days(dParcels), [dParcels]);
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
  const thisWeekParcels = dParcels.filter(p => p.createdAt && new Date(p.createdAt) >= startThisWeek);
  const prevWeekParcels = dParcels.filter(p => p.createdAt && new Date(p.createdAt) >= startPrevWeek && new Date(p.createdAt) <= endPrevWeek);
  const thisWeekSuccessPct = thisWeekParcels.length ? (thisWeekParcels.filter(p => isDeliveredStatus(p.status)).length / thisWeekParcels.length) * 100 : null;
  const prevWeekSuccessPct = prevWeekParcels.length ? (prevWeekParcels.filter(p => isDeliveredStatus(p.status)).length / prevWeekParcels.length) * 100 : null;
  const successTrendPts = (thisWeekSuccessPct !== null && prevWeekSuccessPct !== null)
    ? Number((thisWeekSuccessPct - prevWeekSuccessPct).toFixed(1))
    : null;

  // Dynamic rider delivery and performance derivation from live parcels.
  // Riders with no assigned parcels are unranked (successRate null) — they
  // sort below every ranked rider instead of defaulting to a false 100%.
  const ridersWithLiveDeliveries = useMemo(() => {
    return dRiders.map(r => {
      const rName = (r.riderName || '').trim().toLowerCase();
      const rId = String(r._id || '');
      const regId = (r.registrationId || '').trim();

      // Count delivered parcels where this rider was assigned
      const parcelDeliveries = dParcels.filter(p => {
        if (!isDeliveredStatus(p.status)) return false;
        const pRiderId = String(p.riderId || '');
        const pRiderName = String(p.riderName || '').trim().toLowerCase();
        return (regId && pRiderId === regId) || (rId && pRiderId === rId) || (rName && pRiderName === rName);
      }).length;

      // Count total parcels assigned to this rider
      const totalAssigned = dParcels.filter(p => {
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
  }, [dRiders, dParcels]);

  // Ranked riders only — unassigned riders never headline the leaderboard.
  const rankedRiders = ridersWithLiveDeliveries.filter(r => r.successRate !== null);
  const topRiders   = [...rankedRiders].sort((a, b) => (b.successRate || 0) - (a.successRate || 0)).slice(0, 7);
  const riderScores = topRiders.map(r => r.successRate || 0);
  const riderLabels = topRiders.map(r => (r.riderName || 'Rider').split(' ')[0]);
  const maxRider     = Math.max(1, ...riderScores);
  const peakRider     = topRiders[0]?.riderName || 'No ranked rider yet';

  const offlineRidersCount = dRiders.length - activeRidersCount;
  const inTransitCount = dParcels.filter(p => isInTransitFamilyStatus(p.status)).length;
  const pendingVerificationsCount = effPendingSellers.length + effPendingRiders.length;

  // Delivery-fee revenue (2026-09-11 parity): the mobile app's booking fee
  // now bridges onto every Parcel as deliveryFee — sum it over completed
  // deliveries, mirroring the app's Transactions screen. Hidden entirely
  // when no fee data has synced yet (honest empty state, not a zero lie).
  const completedFeeParcels = dParcels.filter(p => isDeliveredStatus(p.status) && typeof p.deliveryFee === 'number' && p.deliveryFee > 0);
  const collectedFees = completedFeeParcels.reduce((sum, p) => sum + p.deliveryFee, 0);

  // ── People analytics (sellers + customers) ──────────────────────────────
  // Status matching is case-insensitive: the seller refresh asks for
  // PENDING_VERIFICATION while the rider refresh asks for Pending.
  const isPendingSeller = (s) => /pending|verif/i.test(s.status || '');
  const activeSellers = dSellers.filter(s => !isPendingSeller(s));
  const pendingSellerItems = dSellers.filter(isPendingSeller);
  const newSellers7d = dSellers.filter(s => s.createdAt && new Date(s.createdAt) >= startThisWeek).length;

  const newCustomers7d = dCustomers.filter(c => c.createdAt && new Date(c.createdAt) >= startThisWeek).length;
  const last14Days = useMemo(() => {
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayKey = d.toISOString().slice(0, 10);
      days.push({
        label: d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }),
        count: dCustomers.filter(c => toDayKey(c.createdAt) === dayKey).length,
      });
    }
    return days;
  }, [dCustomers]);
  const maxNewCustomers = Math.max(1, ...last14Days.map(d => d.count));

  // ── Support snapshot ────────────────────────────────────────────────────
  const openIssues = dIssues.filter(t => (t.status || '').toLowerCase() === 'open');
  const investigatingIssues = dIssues.filter(t => /investigat|progress/i.test(t.status || ''));
  const closedIssues = dIssues.filter(t => /resolv|clos/i.test(t.status || ''));

  // Four primary metric cards — replaces the old 8-card KPI grid.
  const dutyRatePct = totalRidersCount > 0 ? Math.round((activeRidersCount / totalRidersCount) * 100) : 0;
  const inTransitPct = totalParcels > 0 ? Math.round((inTransitCount / totalParcels) * 100) : 0;

  // Ticker honesty rule: only genuine week-over-week deltas wear the trend
  // pill (delivery-success anchor). Every other ticker carries `meta` — a
  // plain point-in-time note — except Pending Verifications, whose
  // attention pill marks work waiting, not a trend.
  const primaryKpis = [
    {
      key: 'delivery-success', label: 'Delivery Success', icon: PackageCheck, tone: 'purple',
      value: `${deliverySuccessPct}%`, sub: `${deliveredCount} of ${totalParcels} parcels`, trend: successTrendPts,
    },
    {
      key: 'active-riders', label: 'Active Riders', icon: Bike, tone: 'orange',
      value: `${activeRidersCount}/${totalRidersCount}`, sub: totalRidersCount > 0 ? `${offlineRidersCount} offline` : '0 registered', meta: totalRidersCount > 0 ? `${dutyRatePct}% on duty` : null,
    },
    {
      key: 'in-transit', label: 'In-Transit Parcels', icon: Truck, tone: 'orange',
      value: `${inTransitCount}`, sub: totalParcels > 0 ? 'moving through the network' : 'No parcels in transit', meta: totalParcels > 0 ? `${inTransitPct}% of volume` : null,
    },
    {
      key: 'pending-verifications', label: 'Pending Verifications', icon: UserCheck, tone: 'purple',
      value: `${pendingVerificationsCount}`, sub: pendingVerificationsCount === 0 ? 'All reviews up to date' : `${effPendingSellers.length} sellers · ${effPendingRiders.length} riders`, attention: pendingVerificationsCount > 0 ? `${pendingVerificationsCount} waiting` : 'All clear',
    },
    ...(currentUser?.role !== 'hub_receiver' ? [
    {
      key: 'active-sellers', label: 'Active Sellers', icon: Users, tone: 'purple',
      value: `${activeSellers.length}`, sub: dSellers.length > 0 ? `${pendingSellerItems.length} waiting for review` : 'No sellers yet', meta: newSellers7d > 0 ? `+${newSellers7d} this week` : null,
    },
    {
      key: 'customers', label: 'Registered Customers', icon: Users, tone: 'orange',
      value: `${dCustomers.length}`, sub: dCustomers.length > 0 ? 'ordering through the app' : 'No customers yet', meta: newCustomers7d > 0 ? `+${newCustomers7d} this week` : null,
    },
    ] : []),
    ...(collectedFees > 0 ? [{
      key: 'collected-fees', label: 'Delivery Fees Collected', icon: Truck, tone: 'purple',
      value: `₱${collectedFees.toFixed(2)}`, sub: `from ${completedFeeParcels.length} completed ${completedFeeParcels.length !== 1 ? 'deliveries' : 'delivery'}`, meta: null,
    }] : []),
  ];

  const weekly = useMemo(() => buildLastNWeeks(dParcels, 6), [dParcels]);
  const volumeVals = volumeView === 'daily' ? createdVals : weekly.map(w => w.created);
  const volumeLabels = volumeView === 'daily' ? last7.map(d => d.label) : weekly.map(w => w.label);
  const maxVolume = Math.max(1, ...volumeVals);

  const activityRiders = [...ridersWithLiveDeliveries].sort((a, b) => (b.deliveries || 0) - (a.deliveries || 0)).slice(0, 7);
  const activityVals   = activityRiders.map(r => r.deliveries || 0);
  const activityLabels = activityRiders.map(r => (r.riderName || 'Rider').split(' ')[0]);
  const maxActivity     = Math.max(1, ...activityVals);

  // Per-page prop contracts. Every page gets currentUser from the common base
  // below; this adds only the extras. key -> component lives in pageMap.js,
  // key -> extra props lives here — one registry each, no duplicated switch.
  // (The two verification pages are also handed onNavigateToSettings by the
  // historical code, but neither consumes it — not carried forward.)
  const pagePropsFor = (key) => ({
    'process-seller': { pendingSellers: effPendingSellers, setPendingSellers },
    'process-rider':  { pendingRiders: effPendingRiders,  setPendingRiders  },
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

      <main className="ad-main">
        <GlobalHeader
          currentUser={currentUser}
          riders={dRiders}
          pendingCount={pendingVerificationsCount}
          onNavigate={handleMenuClick}
          onNavigateSettings={goToSettings}
          onLogoutClick={() => handleMenuClick('logout')}
        />
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
                <p className="ed-toolbar-period">Logistics Performance · Today, {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
              </div>
              <div className="ed-toolbar-controls" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Tooltip content="Refresh dashboard metrics">
                  <button
                    type="button"
                    onClick={() => fetchDashboardData(true)}
                    disabled={isRefreshing || dashboardLoading}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                      background: 'white', border: '1px solid #e0d5f0', borderRadius: 8,
                      fontSize: 11, fontWeight: 700, color: '#390955', cursor: (isRefreshing || dashboardLoading) ? 'not-allowed' : 'pointer',
                      transition: 'all 0.15s ease', opacity: (isRefreshing || dashboardLoading) ? 0.7 : 1,
                    }}
                  >
                    <RefreshCw size={12} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
                    <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
                  </button>
                </Tooltip>
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
              // The dashboard body is a card grid, not a table — a <tr>/<td>
              // skeleton here rendered invalid DOM (React logs "<tr> cannot be
              // a child of <div>") on every cold load.
              <ListSkeleton rows={6} />
            ) : (
              <>
                {statsError && !previewing && (
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#c2410c', background: '#fff4ec', padding: '6px 12px', borderRadius: '8px', marginBottom: '10px', display: 'block' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={13} aria-hidden="true" /> Some totals could not be loaded just now. The figures below are counted from the full parcel and rider lists.</span>
                  </div>
                )}
                {previewing && (
                  <div className="ed-preview-banner" role="status">
                    <span><strong>Sample preview.</strong> Placeholder figures so every graph can be reviewed while the database is empty. Real figures return automatically once records exist.</span>
                    <button type="button" className="ed-preview-hide" onClick={() => setPreviewOn(false)}>Hide preview</button>
                  </div>
                )}
                <PeakAlertBanner />
                {/* Dominant KPI anchor + secondary stack + Connection history aligned on the right */}
                <div className="ed-anchor-row">
                  {(() => {
                    const anchor = primaryKpis[0];
                    const hasTrend = anchor.trend !== null && anchor.trend !== undefined;
                    const trendUp = hasTrend && anchor.trend >= 0;
                    return (
                      <div className="ed-anchor-metric">
                        <div className="ed-anchor-header">
                          <span className="ed-anchor-label">Delivery Success Rate</span>
                          <span className="ed-anchor-tag">Last 7 Days</span>
                        </div>
                        <div className="ed-anchor-val-row">
                          <h2>{anchor.value}</h2>
                          {hasTrend && (
                            <Tooltip content={`${anchor.label}: change vs the previous week`}>
                              <span className={`ed-kpi-trend ${trendUp ? 'up' : 'down'}`}>
                                {trendUp ? <TrendingUp size={12} strokeWidth={3} /> : <TrendingDown size={12} strokeWidth={3} />}
                                {trendUp ? '+' : ''}{anchor.trend} pts
                              </span>
                            </Tooltip>
                          )}
                        </div>
                        <p className="ed-anchor-sub">{deliveredCount} of {totalParcels} parcels completed</p>
                        <div className="ed-anchor-breakdown">
                          <div className="ed-anchor-breakdown-item">
                            <label>Delivered</label>
                            <strong>{deliveredCount} parcels ({totalParcels ? Math.round((deliveredCount / totalParcels) * 100) : 0}%)</strong>
                          </div>
                          <div className="ed-anchor-breakdown-item">
                            <label>In Transit</label>
                            <strong>{inTransitCount} parcels ({totalParcels ? Math.round((inTransitCount / totalParcels) * 100) : 0}%)</strong>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  <div className="ed-ticker-rail">
                    {primaryKpis.slice(1).map((kpi) => (
                      <div className="ed-ticker-card" key={kpi.key}>
                        <div className="ed-ticker-info">
                          <label>{kpi.label}</label>
                          <span>{kpi.sub}</span>
                        </div>
                        <div className="ed-ticker-stat">
                          <strong>{kpi.value}</strong>
                          {kpi.meta && (
                            <span className="ed-ticker-meta">{kpi.meta}</span>
                          )}
                          {kpi.attention && (
                            <span className={`ed-ticker-delta ${pendingVerificationsCount > 0 ? 'warning' : ''}`}>
                              {kpi.attention}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <ConnectionHistoryChart parcels={dParcels} />
                </div>

                {/* Core logistics work first; connection diagnostics are
                    secondary and live at the bottom of the page. */}
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
                      <EmptyState icon={PackageSearch} title="No parcel volume data yet" description="New parcel activity will populate this chart automatically." />
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
                      <div className="ed-rail-stat"><label>Total ({volumeView === 'daily' ? 'Last 7 days' : 'Last 6 weeks'})</label><strong>{volumeVals.reduce((a, b) => a + b, 0)}</strong></div>
                      <div className="ed-rail-stat"><label>Peak</label><strong>{maxVolume}</strong></div>
                    </div>
                  </section>

                  <aside className="ed-rail">
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
                            <div
                              key={i}
                              className="ed-mini-bar"
                              title={`${last7[i]?.label || 'Day'}: ${v} ${v === 1 ? 'delivery' : 'deliveries'}`}
                              style={{ height: `${barHeightPercent(v, maxDelivery)}%`, background: v === maxDelivery && v > 0 ? '#f37021' : '#390955' }}
                            />
                          ))}
                        </div>
                      </div>

                      <div className="ed-mini-histogram-block">
                        <div className="ed-mini-head"><h6>Returned Parcels (7d)</h6><span style={{ color: '#f37021' }}>{maxReturn} peak</span></div>
                        <div className="ed-mini-bars orange">
                          {returnVals.map((v, i) => (
                            <div
                              key={i}
                              className="ed-mini-bar"
                              title={`${last7[i]?.label || 'Day'}: ${v} ${v === 1 ? 'return' : 'returns'}`}
                              style={{ height: `${barHeightPercent(v, maxReturn)}%`, background: v === maxReturn && v > 0 ? '#390955' : '#f37021' }}
                            />
                          ))}
                        </div>
                      </div>

                    </div>

                    <div className="ed-action-bar">
                      <Tooltip content="Open the full Manage Parcels page">
                      <button className="ed-action-btn primary" onClick={() => handleMenuClick('manage-parcels')}>
                        <ClipboardList size={15} /> View parcels
                      </button>
                      </Tooltip>
                      <Tooltip content="Download the current parcel list as a PDF report">
                      <button className="ed-action-btn secondary" disabled={dParcels.length === 0} onClick={() => dashboardExportPDF(dParcels)}>
                        <Download size={15} /> Download PDF
                      </button>
                      </Tooltip>
                      <Tooltip content="Export the current parcel list as a CSV file">
                      <button className="ed-action-btn secondary" disabled={dParcels.length === 0} onClick={() => dashboardExportCSV(dParcels)}>
                        <Share2 size={15} /> Export CSV
                      </button>
                      </Tooltip>
                    </div>
                  </aside>
                </div>

                {/* Secondary analytics row — the two rider blocks pair side by
                    side instead of stacking three-deep in the rail; the
                    operational canvas pairs with Parcel Operations above. */}
                <div className="ed-secondary-row">
                  <div className="ed-rail-block">
                    <div className="ed-block-head">
                      <h2>Rider Performance</h2>
                      <span className="ed-live-indicator"><span className="ed-live-dot" />Live</span>
                    </div>

                    {topRiders.length === 0 ? (
                      <EmptyState icon={Users} title={dRiders.length === 0 ? "No riders registered yet" : "No deliveries assigned yet"} description={dRiders.length === 0 ? "Performance rankings will appear here once riders are added." : "Rankings appear once riders start completing assigned parcels."} />
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
                              <div
                                className="ed-bar-column"
                                key={i}
                                title={`${topRiders[i]?.riderName || 'Rider'}: ${score}% success rate`}
                              >
                                <span className="ed-bar-score" style={{ color: isTop ? '#f37021' : '#390955' }}>{score}%</span>
                                <div className="ed-bar-track">
                                  <div className={`ed-bar-fill ${isTop ? 'peak' : 'standard'}`} style={{ height: `${(score / maxRider) * 100}%` }} />
                                </div>
                                <span className="ed-bar-day" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 50 }} title={topRiders[i]?.riderName || riderLabels[i]}>
                                  {riderLabels[i]}
                                </span>
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
                    <div className="ed-block-head"><h2>Rider Activity</h2></div>
                    {activityRiders.length === 0 ? (
                      <EmptyState icon={Users} title="No riders registered yet" description="Delivery activity per rider will show up here once riders are added." />
                    ) : (
                      <div className="ed-mini-histogram-block">
                        <div className="ed-mini-head"><h6>Deliveries per Rider (Top 7)</h6><span>{activityVals.reduce((a, b) => a + b, 0)} total</span></div>
                        <div className="ed-mini-bars purple">
                          {activityVals.map((v, i) => (
                            <div
                              key={i}
                              className="ed-mini-bar"
                              title={`${activityRiders[i]?.riderName || 'Rider'}: ${v} ${v === 1 ? 'delivery' : 'deliveries'}`}
                              style={{ height: `${barHeightPercent(v, maxActivity)}%`, background: v === maxActivity && v > 0 ? '#f37021' : '#390955' }}
                            />
                          ))}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4, marginTop: 6 }}>
                          {activityLabels.map((label, i) => (
                            <span
                              key={i}
                              title={activityRiders[i]?.riderName || label}
                              style={{
                                fontSize: 10,
                                color: '#64748b',
                                flex: 1,
                                textAlign: 'center',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="ed-rail-stats">
                      <div className="ed-rail-stat"><label>Riders On Duty</label><strong>{activeRidersCount} of {dRiders.length}</strong></div>
                      <div className="ed-rail-stat"><label>Not On Duty</label><strong>{offlineRidersCount}</strong></div>
                    </div>
                  </div>
                </div>

                {/* People analytics — sellers + customers, aggregate only. No
                    personal rows here; every block links out to its ledger.
                    Hidden for hub receivers, who have no People section. */}
                {currentUser?.role !== 'hub_receiver' && (
                <div className="ed-people-row">
                  <div className="ed-rail-block">
                    <div className="ed-block-head">
                      <h2>Seller Pipeline</h2>
                      <button type="button" className="ed-link-btn" onClick={() => handleMenuClick('process-seller')}>Review queue</button>
                    </div>
                    {dSellers.length === 0 ? (
                      <EmptyState icon={Users} title="No sellers yet" description="The approval pipeline will appear here once sellers register through the app." />
                    ) : (
                      <>
                        <div className="ed-funnel">
                          {[
                            { label: 'Waiting for review', count: pendingSellerItems.length, bar: 'amber' },
                            { label: 'Active sellers', count: activeSellers.length, bar: 'purple' },
                            { label: 'Joined this week', count: newSellers7d, bar: 'green' },
                          ].map(stage => (
                            <div className="ed-funnel-row" key={stage.label}>
                              <span className="ed-funnel-label">{stage.label}</span>
                              <div className="ed-funnel-track">
                                <div
                                  className={`ed-funnel-fill ${stage.bar}`}
                                  style={{ width: `${dSellers.length ? Math.max(stage.count > 0 ? 8 : 0, Math.round((stage.count / dSellers.length) * 100)) : 0}%` }}
                                />
                              </div>
                              <strong className="ed-funnel-count">{stage.count}</strong>
                            </div>
                          ))}
                        </div>
                        <div className="ed-rail-stats">
                          <div className="ed-rail-stat"><label>Total sellers</label><strong>{dSellers.length}</strong></div>
                          <div className="ed-rail-stat"><label>Approval backlog</label><strong>{pendingSellerItems.length}</strong></div>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="ed-rail-block">
                    <div className="ed-block-head">
                      <h2>Customer Growth</h2>
                      <button type="button" className="ed-link-btn" onClick={() => handleMenuClick('customer-list')}>View customers</button>
                    </div>
                    {dCustomers.length === 0 ? (
                      <EmptyState icon={Users} title="No customers yet" description="Registration activity will appear here once customers sign up through the app." />
                    ) : (
                      <>
                        <div className="ed-mini-histogram-block">
                          <div className="ed-mini-head"><h6>New customers (14 days)</h6><span>{newCustomers7d} this week</span></div>
                          <div className="ed-mini-bars purple">
                            {last14Days.map((d, i) => (
                              <div
                                key={i}
                                className="ed-mini-bar"
                                title={`${d.label}: ${d.count} new ${d.count === 1 ? 'customer' : 'customers'}`}
                                style={{ height: `${barHeightPercent(d.count, maxNewCustomers)}%`, background: d.count === maxNewCustomers && d.count > 0 ? '#f37021' : '#390955' }}
                              />
                            ))}
                          </div>
                        </div>
                        <div className="ed-rail-stats">
                          <div className="ed-rail-stat"><label>Registered customers</label><strong>{dCustomers.length}</strong></div>
                          <div className="ed-rail-stat"><label>Joined this week</label><strong>{newCustomers7d}</strong></div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                )}

                {/* Operations strip — support snapshot plus one-tap jumps to the
                    working tabs. Hidden for hub receivers (support is staff-only). */}
                {currentUser?.role !== 'hub_receiver' && (
                <div className="ed-ops-strip">
                  <div className="ed-rail-block">
                    <div className="ed-block-head">
                      <h2>Support Snapshot</h2>
                      <button type="button" className="ed-link-btn" onClick={() => handleMenuClick('manage-issues')}>Open issues</button>
                    </div>
                    {dIssues.length === 0 ? (
                      <EmptyState icon={ClipboardList} title="No support tickets" description="Customer and rider reports will be counted here once tickets arrive." />
                    ) : (
                      <div className="ed-rail-stats">
                        <div className="ed-rail-stat"><label>Open tickets</label><strong>{openIssues.length}</strong></div>
                        <div className="ed-rail-stat"><label>Being investigated</label><strong>{investigatingIssues.length}</strong></div>
                        <div className="ed-rail-stat"><label>Resolved or closed</label><strong>{closedIssues.length}</strong></div>
                      </div>
                    )}
                  </div>

                  <div className="ed-rail-block">
                    <div className="ed-block-head"><h2>Working Tabs</h2></div>
                    <div className="ed-quick-links">
                      <button type="button" className="ed-action-btn secondary" onClick={() => handleMenuClick('manage-parcels')}>All parcels</button>
                      <button type="button" className="ed-action-btn secondary" onClick={() => handleMenuClick('monitor-rider')}>Duty monitor</button>
                      <button type="button" className="ed-action-btn secondary" onClick={() => handleMenuClick('tracking-info')}>Tracking reports</button>
                      <button type="button" className="ed-action-btn secondary" onClick={() => handleMenuClick('activity-log')}>Activity log</button>
                    </div>
                  </div>
                </div>
                )}

                {/* Bottom of dashboard: ends cleanly after rider operations */}
              </>
            )}
          </div>
        )}      </main>
    </div>
  );
}
