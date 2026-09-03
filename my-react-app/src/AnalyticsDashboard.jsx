import React, { useState, useEffect, useMemo } from 'react';
import {
  PackageCheck, Bike, Truck, UserCheck,
  TrendingUp, TrendingDown,
  Trophy, Star, Route,
  ClipboardList, Download, Share2,
  Users, PackageSearch, BarChart3, AlertTriangle,
} from 'lucide-react';
import { apiFetch, parcelsApi, ridersApi } from './services/api';
import { exportToCSV } from './exportUtils';
import useSSE from './services/useSSE';
import './AnalyticsDashboard.css';
import yto_logo from './yto_express_logo.png';

import ProcessSellerInformation         from "./ProcessSellerInformation";
import ViewSeller                        from "./ViewSeller";
import ManageParcels                     from "./ManageParcels";
import ProcessRiderInformation           from "./ProcessRiderInformation";
import MonitorRiderStatus                from "./MonitorRiderStatus";
import GenerateRiderDataReport           from "./GenerateRiderDataReport";
import ManageParcelLocation              from "./ManageParcelLocation";
import MonitorParcel                     from "./MonitorParcel";
import GenerateTrackingInformation       from "./GenerateTrackingInformation";
import Settings                          from "./Settings";
import Logout                            from "./Logout";
import ManageAccounts                    from "./ManageAccounts";
import HubParcelReceiving                from "./HubParcelReceiving";
import CustomerList                      from "./CustomerList";
import ActivityLog                       from "./ActivityLog";
import ManageIssues                      from "./ManageIssues";
import ConnectionHistoryChart             from "./ConnectionHistoryChart";
import PeakAlertBanner                   from "./PeakAlertBanner";
import GlobalHeader                      from "./GlobalHeader";
import { initialPendingSellers, initialPendingRiders } from "./verification/mockPendingRegistrations";

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

// Menu is built per-role — Super Admin gets everything, Staff gets day-to-day
// operations (no GPS tracking or account management), Hub Receiver gets only
// Dashboard + a restricted parcel-receiving screen.
const getMenuItems = (role) => [
  { label: 'Dashboard', key: 'dashboard' },

  ...(role !== 'hub_receiver' ? [{
    label: 'Manage Seller Information', key: 'seller', children: [
      { label: 'Process Seller Information', key: 'process-seller' },
      { label: 'View Seller',                key: 'seller-report'  },
    ],
  }] : []),

  role === 'hub_receiver'
    ? { label: 'Manage Parcels', key: 'hub-parcels' }
    : { label: 'Manage Parcels', key: 'manage-parcels' },

  ...(role !== 'hub_receiver' ? [{
    label: 'Manage Rider Information', key: 'rider', children: [
      { label: 'Process Rider Information',  key: 'process-rider' },
      { label: 'Monitor Rider Status',       key: 'monitor-rider' },
      { label: 'Generate Rider Data Report', key: 'rider-report'  },
    ],
  }] : []),

  ...(role !== 'hub_receiver' ? [
    { label: 'Customers', key: 'customer-list' },
    { label: 'Customer Issues', key: 'manage-issues' },
    { label: 'Activity Log', key: 'activity-log' },
  ] : []),

  ...(role === 'super_admin' ? [{
    label: 'GPS-Based Parcel Tracking', key: 'gps', children: [
      { label: 'Manage Parcel Location',        key: 'parcel-location' },
      { label: 'Monitor Parcel',                key: 'geofence'        },
      { label: 'Generate Tracking Information', key: 'tracking-info'   },
    ],
  }] : []),

  ...(role === 'super_admin' ? [{ label: 'Manage Accounts', key: 'manage-accounts' }] : []),
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

const getIcon = (key) => icons[key] || icons.sub;

const isReturnStatus = (status) => /return/i.test(status || '');
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
    const delivered = parcels.filter(p => p.status === 'Delivered' && toDayKey(p.updatedAt) === dayKey).length;
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

export default function AnalyticsDashboard({ onLogout, currentUser }) {
  const [dateRange, setDateRange]           = useState('7days');
  const [volumeView, setVolumeView]         = useState('daily');
  const [activeMenuItem, setActiveMenuItem] = useState('dashboard');
  const [openSection, setOpenSection]       = useState(null);

  // Collapsible sidebar: remembered per-browser, defaults to expanded.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('yto_sidebar_collapsed') === '1'; } catch { return false; }
  });
  const [sidebarHover, setSidebarHover] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('yto_sidebar_collapsed', next ? '1' : '0'); } catch {}
      return next;
    });
  };

  const sidebarExpanded = !sidebarCollapsed || sidebarHover;

  const [sharedSellers, setSharedSellers] = useState([
    { id: 1, companyName: 'Fresh Express Store', displayName: 'Fresh Express Store', registrationId: 'SH-20220101-12345', status: 'Active', sellerType: 'Business', email: 'info@freshexpress.com', phone: '13823456789', totalParcels: 0 }
  ]);

  // Lifted up here (instead of living inside ProcessSellerInformation/
  // ProcessRiderInformation) so the pending-verification queue survives
  // switching sidebar sections. Those page components used to hold this in
  // local useState, which reset back to the original 3 mock applicants every
  // time you navigated away and back — including ones you'd already approved,
  // so an applicant could show as "Pending" here while already being a real,
  // active seller/rider elsewhere.
  const [pendingSellers, setPendingSellers] = useState(initialPendingSellers);
  const [pendingRiders,  setPendingRiders]  = useState(initialPendingRiders);

  const [trackingReports, setTrackingReports] = useState([]);
  const [archivedReports, setArchivedReports] = useState([]);

  const isSuperAdmin = currentUser?.role === 'super_admin';

  // Real-time SSE connection — auto-refreshes data when bridge events arrive
  const { connected: sseConnected } = useSSE();

  // SSE connection count (how many admin clients are connected)
  const [sseClientCount, setSseClientCount] = useState(0);

  useEffect(() => {
    const fetchSSEStats = async () => {
      try {
        const res = await apiFetch('/events/stats');
        if (res.ok) {
          const data = await res.json();
          setSseClientCount(data.connectedClients || 0);
        }
      } catch {}
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

  const visibleMenuItems = getMenuItems(currentUser?.role);

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

  const totalParcels    = dashboardStats ? dashboardStats.totalParcels   : parcels.length;
  const deliveredCount  = dashboardStats ? dashboardStats.deliveredCount : parcels.filter(p => p.status === 'Delivered').length;
  const returnedCount   = parcels.filter(p => isReturnStatus(p.status)).length;
  const deliverySuccessPct = dashboardStats ? dashboardStats.deliverySuccessPct.toFixed(1)
    : totalParcels ? ((deliveredCount / totalParcels) * 100).toFixed(1) : '0.0';
  const returnRatePct      = totalParcels ? ((returnedCount / totalParcels) * 100).toFixed(1) : '0.0';

  const totalRidersCount  = dashboardStats ? dashboardStats.totalRiders       : riders.length;
  const activeRidersCount = dashboardStats ? dashboardStats.activeRidersCount : riders.filter(r => r.status === 'Active').length;
  const avgRating   = dashboardStats ? dashboardStats.avgRiderRating.toFixed(1)
    : riders.length ? (riders.reduce((s, r) => s + (r.rating || 0), 0) / riders.length).toFixed(1) : '0.0';
  const totalRides  = dashboardStats ? dashboardStats.totalDeliveries : riders.reduce((s, r) => s + (r.deliveries || 0), 0);

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
  const thisWeekSuccessPct = thisWeekParcels.length ? (thisWeekParcels.filter(p => p.status === 'Delivered').length / thisWeekParcels.length) * 100 : null;
  const prevWeekSuccessPct = prevWeekParcels.length ? (prevWeekParcels.filter(p => p.status === 'Delivered').length / prevWeekParcels.length) * 100 : null;
  const successTrendPts = (thisWeekSuccessPct !== null && prevWeekSuccessPct !== null)
    ? Number((thisWeekSuccessPct - prevWeekSuccessPct).toFixed(1))
    : null;

  const topRiders   = [...riders].sort((a, b) => (b.successRate || 0) - (a.successRate || 0)).slice(0, 7);
  const riderScores = topRiders.map(r => r.successRate || 0);
  const riderLabels = topRiders.map(r => (r.riderName || 'Rider').split(' ')[0]);
  const maxRider     = Math.max(1, ...riderScores);
  const peakRider     = topRiders[0]?.riderName || 'N/A';

  const offlineRidersCount = riders.length - activeRidersCount;
  const inTransitCount = parcels.filter(p => String(p.status || '').toLowerCase().includes('transit')).length;
  const pendingVerificationsCount = pendingSellers.length + pendingRiders.length;

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
  ];

  const weekly = useMemo(() => buildLastNWeeks(parcels, 6), [parcels]);
  const volumeVals = volumeView === 'daily' ? createdVals : weekly.map(w => w.created);
  const volumeLabels = volumeView === 'daily' ? last7.map(d => d.label) : weekly.map(w => w.label);
  const maxVolume = Math.max(1, ...volumeVals);

  const activityRiders = [...riders].sort((a, b) => (b.deliveries || 0) - (a.deliveries || 0)).slice(0, 7);
  const activityVals   = activityRiders.map(r => r.deliveries || 0);
  const activityLabels = activityRiders.map(r => (r.riderName || 'Rider').split(' ')[0]);
  const maxActivity     = Math.max(1, ...activityVals);

  const renderPage = () => {
    switch (activeMenuItem) {
      case 'process-seller':
        return (
          <ProcessSellerInformation
            pendingSellers={pendingSellers}
            setPendingSellers={setPendingSellers}
            onNavigateToSettings={goToSettings}
          />
        );
      case 'seller-report':       return <ViewSeller sellers={sharedSellers} onUpdateSellers={setSharedSellers} currentUser={currentUser} />;
      case 'manage-parcels':      return <ManageParcels currentUser={currentUser} />;
      case 'customer-list':       return <CustomerList currentUser={currentUser} />;
      case 'activity-log':        return <ActivityLog currentUser={currentUser} />;
      case 'manage-issues':       return <ManageIssues currentUser={currentUser} />;
      case 'process-rider':
        return (
          <ProcessRiderInformation
            pendingRiders={pendingRiders}
            setPendingRiders={setPendingRiders}
            onNavigateToSettings={goToSettings}
            currentUser={currentUser}
          />
        );
      case 'monitor-rider':       return <MonitorRiderStatus currentUser={currentUser} />;
      case 'rider-report':        return <GenerateRiderDataReport currentUser={currentUser} />;
      case 'parcel-location':     return <ManageParcelLocation currentUser={currentUser} />;
      case 'geofence':            return <MonitorParcel currentUser={currentUser} />;
      case 'tracking-info':       return <GenerateTrackingInformation reports={trackingReports} onReportsChange={setTrackingReports} currentUser={currentUser} />;
      case 'settings':            return <Settings currentUser={currentUser} archivedReports={archivedReports} />;
      case 'manage-accounts':     return isSuperAdmin ? <ManageAccounts currentUser={currentUser} /> : null;
      case 'hub-parcels':         return currentUser?.role === 'hub_receiver' ? <HubParcelReceiving currentUser={currentUser} /> : null;
      case 'logout':              return <Logout setActivePage={setActiveMenuItem} onLogout={onLogout} onCancel={() => setActiveMenuItem('dashboard')} />;
      default:                    return null;
    }
  };

  return (
    <div className={`ad-wrapper ${sidebarCollapsed ? 'ad-sidebar--collapsed' : ''}`}>
      {/* Mobile backdrop — closes the drawer when tapping outside it */}
      {mobileNavOpen && <div className="ad-mobile-backdrop" onClick={() => setMobileNavOpen(false)} aria-hidden="true" />}
      <button className="ad-nav-hamburger" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation menu">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>

      <aside
        className={`ad-sidebar ${mobileNavOpen ? 'ad-sidebar--mobile-open' : ''} ${sidebarCollapsed && sidebarHover ? 'ad-sidebar--hover-expanded' : ''}`}
        onMouseEnter={() => setSidebarHover(true)}
        onMouseLeave={() => setSidebarHover(false)}
        aria-label="Main navigation"
      >
        <div className="ad-sidebar-header">
          <button className="ad-sidebar-collapse-btn" onClick={toggleSidebar} aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points={sidebarExpanded ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} /></svg>
          </button>
          <div className="ad-sidebar-logo">
            <div className="ad-sidebar-logo-circle">
              <img src={yto_logo} alt="YTO Express" className="ad-sidebar-logo-img" onError={(e) => { e.target.src = 'https://via.placeholder.com/150?text=YTO'; }} />
            </div>
            <div className="ad-sidebar-logo-text">YTO <span>EXPRESS</span></div>
          </div>
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
          <div className="ad-sidebar-nav-section">
            <p className="ad-sidebar-nav-section-label">General</p>
            <ul className="ad-sidebar-nav-list">
              {visibleMenuItems.map(item => (
                <li key={item.key}>
                  {item.children ? (
                    <div className="ad-sidebar-dropdown">
                      <button className={`ad-sidebar-nav-item ad-sidebar-nav-parent ${item.children.some(c => c.key === activeMenuItem) ? 'ad-sidebar-nav-parent--active' : ''}`} onClick={() => toggleSection(item.key)} type="button" aria-expanded={openSection === item.key}>
                        {getIcon(item.key)}
                        <span className="ad-sidebar-nav-text">{item.label}</span>
                        <svg className={`ad-sidebar-chevron ${openSection === item.key ? 'ad-sidebar-chevron--rotated' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
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
                    </div>
                  ) : (
                    <button type="button" className={`ad-sidebar-nav-item ${activeMenuItem === item.key ? 'ad-sidebar-nav-item--active' : ''}`} onClick={() => handleMenuClick(item.key)}>
                      {getIcon(item.key)}
                      <span className="ad-sidebar-nav-text">{item.label}</span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
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
            <header className="ed-header">
              <div className="ed-header-titles">
                <h1>Dashboard</h1>
                <p>YTO Express • Delivery Performance Overview</p>
              </div>
              <div className="ed-header-controls">
                {/* SSE Connection Count */}
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
                <div className="ed-select-container">
                  <select value={dateRange} onChange={e => setDateRange(e.target.value)}>
                    <option value="today">Today</option>
                    <option value="7days">Last 7 Days</option>
                    <option value="30days">Last 30 Days</option>
                  </select>
                </div>
              </div>
            </header>

            {dashboardLoading ? (
              <div style={{ padding: '60px 0', textAlign: 'center', color: '#a890c0', fontSize: '14px', fontWeight: 600 }}>
                Loading live data…
              </div>
            ) : (
              <>
                {statsError && (
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#c2410c', background: '#fff4ec', padding: '6px 12px', borderRadius: '8px', marginBottom: '10px', display: 'inline-block' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={13} aria-hidden="true" /> Stats endpoint unreachable — KPIs below are computed from the full parcel/rider lists instead.</span>
                  </div>
                )}
                <div className="ed-kpi-row">
                  {primaryKpis.map((kpi) => {
                    const Icon = kpi.icon;
                    const hasTrend = kpi.trend !== null && kpi.trend !== undefined;
                    const trendUp = hasTrend && kpi.trend >= 0;
                    return (
                      <div className="ed-kpi-card" key={kpi.key}>
                        <div className="ed-kpi-top">
                          <span className={`ed-kpi-icon-wrap ${kpi.tone}`}><Icon size={20} strokeWidth={2.25} /></span>
                          {hasTrend && (
                            <span className={`ed-kpi-trend ${trendUp ? 'up' : 'down'}`} title="Week-over-week change in delivery success rate">
                              {trendUp ? <TrendingUp size={12} strokeWidth={3} /> : <TrendingDown size={12} strokeWidth={3} />}
                              {trendUp ? '+' : ''}{kpi.trend} pts
                            </span>
                          )}
                        </div>
                        <div className="ed-kpi-body">
                          <h2>{kpi.value}</h2>
                          <span className="ed-kpi-label">{kpi.label}</span>
                          <p className="ed-kpi-sub">{kpi.sub}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Peak Connection Alert Banner */}
                <PeakAlertBanner />

                {/* SSE Connection History Chart */}
                <div style={{ marginBottom: 20 }}>
                  <ConnectionHistoryChart />
                </div>

                <div className="ed-workspace-grid">
                  <section className="ed-panel ed-panel-left">
                    <div className="ed-panel-head">
                      <div>
                        <span className="ed-tag-badge orange">By Success Rate</span>
                        <h2>Rider Performance</h2>
                      </div>
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

                    <div className="ed-chart-footer">
                      <div className="ed-footer-badge highlight">
                        <span className="ed-footer-badge-icon"><Trophy size={14} /></span>
                        <div><label>Top Performing Rider</label><strong>{peakRider}</strong></div>
                      </div>
                      <div className="ed-footer-badge">
                        <span className="ed-footer-badge-icon"><Star size={14} /></span>
                        <div><label>Average Delivery Rating</label><strong>{avgRating} / 5</strong></div>
                      </div>
                      <div className="ed-footer-badge">
                        <span className="ed-footer-badge-icon"><Route size={14} /></span>
                        <div><label>Total Completed Rides</label><strong>{totalRides.toLocaleString()}</strong></div>
                      </div>
                    </div>
                  </section>

                  <section className="ed-panel ed-panel-right">
                    <div className="ed-panel-head">
                      <div>
                        <span className="ed-tag-badge purple">Live Totals</span>
                        <h2>Parcel Report</h2>
                      </div>
                    </div>

                    <div className="ed-stat-split">
                      <div className="ed-split-box purple">
                        <p className="box-label">Overall Success Rate</p>
                        <h3>{deliverySuccessPct}%</h3>
                        <p className="box-sub">{deliveredCount} of {totalParcels} parcels</p>
                      </div>
                      <div className="ed-split-box orange">
                        <p className="box-label">Return Rate</p>
                        <h3>{returnRatePct}%</h3>
                        <p className="box-sub">{returnedCount} of {totalParcels} parcels</p>
                      </div>
                    </div>

                    <div className="ed-mini-histogram-block">
                      <div className="ed-mini-head"><h6>Parcel Deliveries (7d)</h6><span>{deliveryVals.reduce((a, b) => a + b, 0)}</span></div>
                      <div className="ed-mini-bars purple">
                        {deliveryVals.map((v, i) => (
                          <div key={i} className="ed-mini-bar" style={{ height: `${Math.max(4, (v / maxDelivery) * 100)}%`, background: v === maxDelivery && v > 0 ? '#f37021' : '#390955' }} />
                        ))}
                      </div>
                    </div>

                    <div className="ed-mini-histogram-block">
                      <div className="ed-mini-head"><h6>Returned Parcels (7d)</h6><span style={{ color: '#f37021' }}>{maxReturn} peak</span></div>
                      <div className="ed-mini-bars orange">
                        {returnVals.map((v, i) => (
                          <div key={i} className="ed-mini-bar" style={{ height: `${Math.max(4, (v / maxReturn) * 100)}%`, background: v === maxReturn && v > 0 ? '#390955' : '#f37021' }} />
                        ))}
                      </div>
                    </div>

                    <div className="ed-action-bar">
                      <button className="ed-action-btn primary" onClick={() => handleMenuClick('manage-parcels')}>
                        <ClipboardList size={15} /> Generate Full Report
                      </button>
                      <button className="ed-action-btn secondary" disabled={parcels.length === 0} onClick={() => dashboardExportPDF(parcels)}>
                        <Download size={15} /> Download PDF
                      </button>
                      <button className="ed-action-btn secondary" disabled={parcels.length === 0} onClick={() => dashboardExportCSV(parcels)}>
                        <Share2 size={15} /> Export CSV
                      </button>
                    </div>
                  </section>
                </div>

                <div className="ed-workspace-grid" style={{ marginTop: 20 }}>
                  <section className="ed-panel ed-panel-left">
                    <div className="ed-panel-head">
                      <div>
                        <span className="ed-tag-badge purple">{volumeView === 'daily' ? 'Last 7 Days' : 'Last 6 Weeks'}</span>
                        <h2>Parcel Volume</h2>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {['daily', 'weekly'].map(v => (
                          <button
                            key={v}
                            onClick={() => setVolumeView(v)}
                            style={{
                              padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize',
                              border: `1.5px solid ${volumeView === v ? '#390955' : '#e0d5f0'}`,
                              background: volumeView === v ? '#390955' : 'white',
                              color: volumeView === v ? 'white' : '#555',
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
                                <div className={`ed-bar-fill ${v === maxVolume ? 'peak' : 'standard'}`} style={{ height: `${Math.max(4, (v / maxVolume) * 100)}%` }} />
                              </div>
                              <span className="ed-bar-day">{volumeLabels[i]}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="ed-chart-footer">
                      <div className="ed-footer-badge">
                        <span className="ed-footer-badge-icon"><BarChart3 size={14} /></span>
                        <div><label>Total ({volumeView})</label><strong>{volumeVals.reduce((a, b) => a + b, 0)}</strong></div>
                      </div>
                      <div className="ed-footer-badge highlight">
                        <span className="ed-footer-badge-icon"><TrendingUp size={14} /></span>
                        <div><label>Peak</label><strong>{maxVolume}</strong></div>
                      </div>
                    </div>
                  </section>

                  <section className="ed-panel ed-panel-right">
                    <div className="ed-panel-head">
                      <div>
                        <span className="ed-tag-badge orange">By Deliveries Completed</span>
                        <h2>Rider Activity</h2>
                      </div>
                    </div>

                    {activityRiders.length === 0 ? (
                      <DashboardEmptyState icon={Users} title="No riders registered yet" subtitle="Delivery activity per rider will show up here once riders are added." />
                    ) : (
                      <div className="ed-mini-histogram-block">
                        <div className="ed-mini-head"><h6>Deliveries per Rider (Top 7)</h6><span>{activityVals.reduce((a, b) => a + b, 0)} total</span></div>
                        <div className="ed-mini-bars purple">
                          {activityVals.map((v, i) => (
                            <div key={i} className="ed-mini-bar" style={{ height: `${Math.max(4, (v / maxActivity) * 100)}%`, background: v === maxActivity && v > 0 ? '#f37021' : '#390955' }} />
                          ))}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                          {activityLabels.map((label, i) => (
                            <span key={i} style={{ fontSize: 10, color: '#390955', flex: 1, textAlign: 'center' }}>{label}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="ed-stat-split" style={{ marginTop: 20 }}>
                      <div className="ed-split-box purple">
                        <p className="box-label">Online Now</p>
                        <h3>{activeRidersCount}</h3>
                        <p className="box-sub">of {riders.length} total riders</p>
                      </div>
                      <div className="ed-split-box orange">
                        <p className="box-label">Offline</p>
                        <h3>{offlineRidersCount}</h3>
                        <p className="box-sub">not currently on duty</p>
                      </div>
                    </div>
                  </section>
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}