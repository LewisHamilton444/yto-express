import React, { useState, useEffect, useMemo } from 'react';
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
import GlobalHeader                      from "./GlobalHeader";
import { initialPendingSellers, initialPendingRiders } from "./verification/mockPendingRegistrations";

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

const PARCELS_API = 'https://yto-express.onrender.com/api/parcels';
const RIDERS_API  = 'https://yto-express.onrender.com/api/riders';

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

const TrendUp = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
  </svg>
);

export default function AnalyticsDashboard({ onLogout, currentUser }) {
  const [dateRange, setDateRange]           = useState('7days');
  const [volumeView, setVolumeView]         = useState('daily');
  const [activeMenuItem, setActiveMenuItem] = useState('dashboard');
  const [openSection, setOpenSection]       = useState(null);

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

  const toggleSection   = (key) => setOpenSection(prev => (prev === key ? null : key));
  const handleMenuClick = (key) => setActiveMenuItem(key);
  const goToSettings    = () => setActiveMenuItem('settings');

  const visibleMenuItems = getMenuItems(currentUser?.role);

  // ── Real data from the backend — no more hardcoded numbers ────────────────
  const [parcels, setParcels]         = useState([]);
  const [riders, setRiders]           = useState([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setDashboardLoading(true);
    Promise.all([
      fetch(PARCELS_API).then(r => r.json()).catch(() => []),
      fetch(RIDERS_API).then(r => r.json()).catch(() => []),
    ]).then(([parcelsData, ridersData]) => {
      if (cancelled) return;
      setParcels(Array.isArray(parcelsData) ? parcelsData : []);
      setRiders(Array.isArray(ridersData) ? ridersData : []);
      setDashboardLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const totalParcels    = parcels.length;
  const deliveredCount  = parcels.filter(p => p.status === 'Delivered').length;
  const returnedCount   = parcels.filter(p => isReturnStatus(p.status)).length;
  const deliverySuccessPct = totalParcels ? ((deliveredCount / totalParcels) * 100).toFixed(1) : '0.0';
  const returnRatePct      = totalParcels ? ((returnedCount / totalParcels) * 100).toFixed(1) : '0.0';

  const activeRidersCount = riders.filter(r => r.status === 'Active').length;
  const avgRating   = riders.length ? (riders.reduce((s, r) => s + (r.rating || 0), 0) / riders.length).toFixed(1) : '0.0';
  const totalRides  = riders.reduce((s, r) => s + (r.deliveries || 0), 0);

  const last7 = useMemo(() => buildLast7Days(parcels), [parcels]);
  const createdVals  = last7.map(d => d.created);
  const deliveryVals = last7.map(d => d.delivered);
  const returnVals   = last7.map(d => d.returned);
  const maxCreated  = Math.max(1, ...createdVals);
  const maxDelivery = Math.max(1, ...deliveryVals);
  const maxReturn   = Math.max(1, ...returnVals);

  // Week-over-week new-parcel volume — the only KPI with enough history for a real trend.
  const now = new Date();
  const startThisWeek = new Date(now); startThisWeek.setDate(now.getDate() - 6);
  const startPrevWeek = new Date(now); startPrevWeek.setDate(now.getDate() - 13);
  const endPrevWeek   = new Date(now); endPrevWeek.setDate(now.getDate() - 7);
  const thisWeekCount = parcels.filter(p => p.createdAt && new Date(p.createdAt) >= startThisWeek).length;
  const prevWeekCount = parcels.filter(p => p.createdAt && new Date(p.createdAt) >= startPrevWeek && new Date(p.createdAt) <= endPrevWeek).length;
  const weekChangePct = prevWeekCount > 0
    ? (((thisWeekCount - prevWeekCount) / prevWeekCount) * 100).toFixed(1)
    : (thisWeekCount > 0 ? '100.0' : '0.0');

  const kpis = [
    { label: 'Delivery Success',  value: `${deliverySuccessPct}%`, sub: `${deliveredCount} of ${totalParcels} parcels` },
    { label: 'Active Riders',     value: `${activeRidersCount}/${riders.length}`, sub: 'currently on duty' },
    { label: 'Avg Rider Rating',  value: `${avgRating} / 5`, sub: `across ${riders.length} rider${riders.length === 1 ? '' : 's'}` },
    { label: 'Total Parcels',     value: `${totalParcels}`, change: `${weekChangePct >= 0 ? '+' : ''}${weekChangePct}%`, sub: `${deliveredCount} delivered`, spark: createdVals },
  ];

  const topRiders   = [...riders].sort((a, b) => (b.successRate || 0) - (a.successRate || 0)).slice(0, 7);
  const riderScores = topRiders.map(r => r.successRate || 0);
  const riderLabels = topRiders.map(r => (r.riderName || 'Rider').split(' ')[0]);
  const maxRider     = Math.max(1, ...riderScores);
  const avgRiderRate = riders.length ? (riders.reduce((s, r) => s + (r.successRate || 0), 0) / riders.length).toFixed(1) : '0.0';
  const peakRider     = topRiders[0]?.riderName || 'N/A';

  // ── Additional operational KPIs (new, additive — the original 4 cards above stay untouched) ──
  const offlineRidersCount = riders.length - activeRidersCount;
  const inTransitCount = parcels.filter(p => String(p.status || '').toLowerCase().includes('transit')).length;
  const pendingVerificationsCount = pendingSellers.length + pendingRiders.length;
  const deliveredWithDates = parcels.filter(p => p.status === 'Delivered' && p.createdAt && p.updatedAt);
  const onTimeCount = deliveredWithDates.filter(p => (new Date(p.updatedAt) - new Date(p.createdAt)) / 86400000 <= 3).length;
  const onTimeRatePct = deliveredWithDates.length ? ((onTimeCount / deliveredWithDates.length) * 100).toFixed(1) : '0.0';

  const operationalKpis = [
    { label: 'Active Riders', value: `${activeRidersCount} online`, sub: `${offlineRidersCount} offline`, color: '#22c55e' },
    { label: 'In-Transit Parcels', value: `${inTransitCount}`, sub: `of ${totalParcels} total parcels` },
    { label: 'Pending Verifications', value: `${pendingVerificationsCount}`, sub: `${pendingSellers.length} sellers, ${pendingRiders.length} riders` },
    { label: 'On-Time Delivery Rate', value: `${onTimeRatePct}%`, sub: `${onTimeCount} of ${deliveredWithDates.length} delivered on time` },
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
      case 'seller-report':       return <ViewSeller sellers={sharedSellers} onUpdateSellers={setSharedSellers} />;
      case 'manage-parcels':      return <ManageParcels />;
      case 'process-rider':
        return (
          <ProcessRiderInformation
            pendingRiders={pendingRiders}
            setPendingRiders={setPendingRiders}
            onNavigateToSettings={goToSettings}
          />
        );
      case 'monitor-rider':       return <MonitorRiderStatus />;
      case 'rider-report':        return <GenerateRiderDataReport />;
      case 'parcel-location':     return <ManageParcelLocation />;
      case 'geofence':            return <MonitorParcel />;
      case 'tracking-info':       return <GenerateTrackingInformation reports={trackingReports} onReportsChange={setTrackingReports} />;
      case 'settings':            return <Settings currentUser={currentUser} archivedReports={archivedReports} />;
      case 'manage-accounts':     return isSuperAdmin ? <ManageAccounts currentUser={currentUser} /> : null;
      case 'hub-parcels':         return currentUser?.role === 'hub_receiver' ? <HubParcelReceiving /> : null;
      case 'logout':              return <Logout setActivePage={setActiveMenuItem} onLogout={onLogout} onCancel={() => setActiveMenuItem('dashboard')} />;
      default:                    return null;
    }
  };

  return (
    <div className="ad-wrapper">
      <aside className="ad-sidebar">
        <div className="ad-sidebar-header">
          <div className="ad-sidebar-logo">
            <div className="ad-sidebar-logo-circle">
              <img src={yto_logo} alt="YTO Express" className="ad-sidebar-logo-img" onError={(e) => { e.target.src = 'https://via.placeholder.com/150?text=YTO'; }} />
            </div>
            <div className="ad-sidebar-logo-text">YTO <span>EXPRESS</span></div>
          </div>
        </div>

        {/* Show logged in user info if available */}
        {currentUser && (
          <div style={{ padding: '10px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
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
                      <button className={`ad-sidebar-nav-item ad-sidebar-nav-parent ${item.children.some(c => c.key === activeMenuItem) ? 'ad-sidebar-nav-parent--active' : ''}`} onClick={() => toggleSection(item.key)} type="button">
                        {getIcon(item.key)}
                        <span className="ad-sidebar-nav-text">{item.label}</span>
                        <svg className={`ad-sidebar-chevron ${openSection === item.key ? 'ad-sidebar-chevron--rotated' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                      </button>
                      <ul className={`ad-sidebar-submenu ${openSection === item.key ? 'ad-sidebar-submenu--open' : ''}`}>
                        {item.children.map(child => (
                          <li key={child.key}>
                            <a href="#" className={`ad-sidebar-submenu-link ${activeMenuItem === child.key ? 'ad-sidebar-submenu-link--active' : ''}`} onClick={(e) => { e.preventDefault(); handleMenuClick(child.key); }}>
                              {icons.sub}
                              <span className="ad-sidebar-nav-text">{child.label}</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <a href="#" className={`ad-sidebar-nav-item ${activeMenuItem === item.key ? 'ad-sidebar-nav-item--active' : ''}`} onClick={(e) => { e.preventDefault(); handleMenuClick(item.key); }}>
                      {getIcon(item.key)}
                      <span className="ad-sidebar-nav-text">{item.label}</span>
                    </a>
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
                <div className="ed-select-container">
                  <select value={dateRange} onChange={e => setDateRange(e.target.value)}>
                    <option value="today">Today</option>
                    <option value="7days">Last 7 Days</option>
                    <option value="30days">Last 30 Days</option>
                  </select>
                </div>
                <button className="ed-btn-export">Export</button>
              </div>
            </header>

            {dashboardLoading ? (
              <div style={{ padding: '60px 0', textAlign: 'center', color: '#a890c0', fontSize: '14px', fontWeight: 600 }}>
                Loading live data…
              </div>
            ) : (
              <>
                <div className="ed-kpi-row">
                  {kpis.map((kpi, index) => (
                    <div className="ed-kpi-card" key={index}>
                      <div className="ed-kpi-top">
                        <span className="ed-kpi-label">{kpi.label}</span>
                        {kpi.change && <span className="ed-kpi-badge"><TrendUp /> {kpi.change}</span>}
                      </div>
                      <div className="ed-kpi-middle">
                        <h2>{kpi.value}</h2>
                        {kpi.spark ? (
                          <div className="ed-sparkline">
                            {kpi.spark.map((v, sIdx) => (
                              <div key={sIdx} className="ed-spark-bar" style={{ height: `${Math.max(4, (v / maxCreated) * 100)}%`, opacity: sIdx === kpi.spark.length - 1 ? 1 : 0.3 }} />
                            ))}
                          </div>
                        ) : (
                          <p style={{ fontSize: '11px', color: '#888', margin: '4px 0 0' }}>{kpi.sub}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="ed-kpi-row" style={{ marginTop: 4 }}>
                  {operationalKpis.map((kpi, index) => (
                    <div className="ed-kpi-card" key={index}>
                      <div className="ed-kpi-top">
                        <span className="ed-kpi-label">{kpi.label}</span>
                      </div>
                      <div className="ed-kpi-middle">
                        <h2 style={kpi.color ? { color: kpi.color } : undefined}>{kpi.value}</h2>
                        <p style={{ fontSize: '11px', color: '#888', margin: '4px 0 0' }}>{kpi.sub}</p>
                      </div>
                    </div>
                  ))}
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
                      <p style={{ padding: '32px 0', textAlign: 'center', color: '#aaa', fontSize: '13px' }}>No riders registered yet.</p>
                    ) : (
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
                    )}

                    <div className="ed-chart-footer">
                      <div className="ed-footer-stat"><label>Avg. Rate</label><strong>{avgRiderRate}%</strong></div>
                      <div className="ed-footer-divider" />
                      <div className="ed-footer-stat"><label>Top Rider</label><strong style={{ color: '#f37021' }}>{peakRider}</strong></div>
                      <div className="ed-footer-divider" />
                      <div className="ed-footer-stat"><label>Total Rides</label><strong>{totalRides.toLocaleString()}</strong></div>
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

                    <div className="ed-action-footer">
                      <button className="ed-btn-primary" onClick={() => handleMenuClick('manage-parcels')}>Generate Full Report</button>
                      <button className="ed-btn-secondary">Download PDF</button>
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
                      <p style={{ padding: '32px 0', textAlign: 'center', color: '#aaa', fontSize: '13px' }}>No parcel volume data yet.</p>
                    ) : (
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
                    )}

                    <div className="ed-chart-footer">
                      <div className="ed-footer-stat"><label>Total ({volumeView})</label><strong>{volumeVals.reduce((a, b) => a + b, 0)}</strong></div>
                      <div className="ed-footer-divider" />
                      <div className="ed-footer-stat"><label>Peak</label><strong style={{ color: '#f37021' }}>{maxVolume}</strong></div>
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
                      <p style={{ padding: '32px 0', textAlign: 'center', color: '#aaa', fontSize: '13px' }}>No riders registered yet.</p>
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
                            <span key={i} style={{ fontSize: 10, color: '#aaa', flex: 1, textAlign: 'center' }}>{label}</span>
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