import React, { useState } from 'react';
import LoginPage from './LoginPage';
import ManageAccounts from './ManageAccounts';
import ManageParcels from './ManageParcels';
import { ROLE_PERMISSIONS } from './AuthContext';

// ── Error Boundary — catches crashes from any child component (e.g. Leaflet) ──
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', textAlign: 'center', color: '#a890c0' }}>
          <p style={{ fontSize: '14px', fontWeight: 600 }}>This page crashed: {this.state.error?.message}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ marginTop: '16px', padding: '8px 20px', background: '#390955', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const AppRoot = () => {
  const [currentUser, setCurrentUser] = useState(null);
  const [activePage,  setActivePage]  = useState('dashboard');
  const [sellers,     setSellers]     = useState([]);

  // ── Not logged in → show login page ───────────────────────────────────────
  if (!currentUser) {
    return <LoginPage onLogin={(user) => { setCurrentUser(user); setActivePage('dashboard'); }} />;
  }

  const allowed = ROLE_PERMISSIONS[currentUser.role] ?? [];
  const can = (page) => allowed.includes(page);

  // ── Logout: directly clears user → login page shows immediately ────────────
  const handleLogout = () => {
    setCurrentUser(null);
    setActivePage('dashboard');
  };

  const navItems = [
    { key: 'dashboard',       label: 'Dashboard',              permission: 'dashboard' },
    { key: 'manage_sellers',  label: 'Manage Seller Infor...', permission: 'manage_sellers', children: [
      { key: 'process_seller', label: 'Process Seller Information', permission: 'manage_sellers' },
      { key: 'view_seller',    label: 'View Seller',                permission: 'manage_sellers' },
    ]},
    { key: 'manage_parcels',  label: 'Manage Parcels',         permission: 'manage_parcels' },
    { key: 'manage_riders',   label: 'Manage Rider Infor...',  permission: 'manage_riders' },
    { key: 'gps_parcel',      label: 'GPS-Based Parcel...',    permission: 'gps_parcel' },
    { key: 'manage_accounts', label: 'Manage Accounts',        permission: 'manage_accounts' },
  ].filter(item => can(item.permission));

  const roleLabel = {
    super_admin:  'Super Admin',
    staff:        'Staff',
    hub_receiver: 'Hub Receiver',
  }[currentUser.role];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: "'DM Sans', sans-serif" }}>

      {/* ── Sidebar ── */}
      <aside style={{
        width: 240,
        background: '#2d0744',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        height: '100vh',
        position: 'sticky',
        top: 0,
        overflowY: 'auto',
      }}>

        {/* Logo */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'linear-gradient(135deg,#f37021,#e25e10)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 900, color: 'white', flexShrink: 0 }}>YX</div>
            <span style={{ fontSize: '15px', fontWeight: 900, color: 'white', letterSpacing: '-0.5px' }}>YTO <span style={{ color: '#f37021' }}>EXPRESS</span></span>
          </div>
        </div>

        {/* User info */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)', marginBottom: '8px', flexShrink: 0 }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'white', marginBottom: '2px' }}>{currentUser.name}</div>
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{roleLabel}</div>
        </div>

        {/* Nav */}
        <div style={{ padding: '0 12px 24px 12px', flex: 1 }}>
          <p style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '1px', padding: '8px 8px 4px', margin: 0 }}>General</p>

          {navItems.map(item => (
            <div key={item.key}>
              <button
                type="button"
                onClick={() => setActivePage(item.children ? item.children[0].key : item.key)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center',
                  padding: '9px 12px', borderRadius: '9px', border: 'none', cursor: 'pointer',
                  background: activePage === item.key || item.children?.some(c => c.key === activePage) ? '#f37021' : 'transparent',
                  color: 'white', fontSize: '13px', fontWeight: 600, fontFamily: 'inherit',
                  marginBottom: '2px', textAlign: 'left',
                }}
              >
                {item.label}
              </button>
              {item.children && item.children.map(child => (
                <button
                  key={child.key}
                  type="button"
                  onClick={() => setActivePage(child.key)}
                  style={{
                    width: '100%', padding: '7px 12px 7px 28px', borderRadius: '8px',
                    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    background: activePage === child.key ? 'rgba(255,255,255,0.1)' : 'transparent',
                    color: activePage === child.key ? 'white' : 'rgba(255,255,255,0.55)',
                    fontSize: '12px', fontWeight: 500, textAlign: 'left', marginBottom: '1px',
                    display: 'block',
                  }}
                >
                  · {child.label}
                </button>
              ))}
            </div>
          ))}

          {/* Account section */}
          <p style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '1px', padding: '12px 8px 4px', marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            Account
          </p>

          {can('settings') && (
            <button
              type="button"
              onClick={() => setActivePage('settings')}
              style={{
                width: '100%', padding: '9px 12px', borderRadius: '9px', border: 'none',
                cursor: 'pointer', background: activePage === 'settings' ? '#f37021' : 'transparent',
                color: 'white', fontSize: '13px', fontWeight: 600, fontFamily: 'inherit',
                marginBottom: '2px', textAlign: 'left', display: 'block',
              }}
            >
              Settings
            </button>
          )}

          {/* LOGOUT BUTTON — calls handleLogout directly, no Logout.jsx, no page navigation */}
          <button
            type="button"
            onClick={handleLogout}
            style={{
              width: '100%',
              padding: '9px 12px',
              borderRadius: '9px',
              border: 'none',
              cursor: 'pointer',
              background: 'transparent',
              color: 'rgba(255,255,255,0.6)',
              fontSize: '13px',
              fontWeight: 600,
              fontFamily: 'inherit',
              textAlign: 'left',
              display: 'block',
              marginTop: '2px',
            }}
          >
            Logout
          </button>
        </div>
      </aside>

      {/* ── Main content — wrapped in ErrorBoundary so crashes don't block the sidebar ── */}
      <main style={{ flex: 1, background: '#f0ecf7', overflow: 'auto' }}>
        <ErrorBoundary>

          {activePage === 'manage_accounts' && can('manage_accounts') && (
            <ManageAccounts currentUser={currentUser} />
          )}

          {activePage === 'manage_parcels' && can('manage_parcels') && (
            <ManageParcels />
          )}

          {/* Uncomment as you build each page: */}
          {/* {activePage === 'process_seller' && <ProcessSellerInformation externalSellers={sellers} onSellersChange={setSellers} />} */}
          {/* {activePage === 'view_seller'    && <GenerateSellerReport sellers={sellers} onUpdateSellers={setSellers} />} */}
          {/* {activePage === 'dashboard'      && <Dashboard />} */}
          {/* {activePage === 'manage_riders'  && <ManageRiders />} */}
          {/* {activePage === 'gps_parcel'     && <GPSParcel />} */}

          {!['manage_accounts', 'manage_parcels'].includes(activePage) && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '80vh', color: '#a890c0', fontSize: '14px', fontWeight: 500 }}>
              [{activePage}] — wire up your component here in AppRoot.jsx
            </div>
          )}

        </ErrorBoundary>
      </main>
    </div>
  );
};

export default AppRoot;