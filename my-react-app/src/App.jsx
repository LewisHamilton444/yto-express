import { useState } from 'react';

import LoginPage from './Loginpage';
import AnalyticsDashboard from "./AnalyticsDashboard";

import ProcessSellerInformation    from "./ProcessSellerInformation";
import ViewSeller                  from "./ViewSeller";

import ProcessParcelInformation    from "./ProcessParcelInformation";
import GenerateParcelMovement      from "./GenerateParcelMovement";
import GenerateParcelConfirmationStatus from "./GenerateParcelConfirmationStatus";
import GenerateParcelStatusReport  from "./GenerateParcelStatusReport";

import ProcessRiderInformation     from "./ProcessRiderInformation";
import MonitorRiderStatus          from "./MonitorRiderStatus";
import GenerateRiderDataReport     from "./GenerateRiderDataReport";

import ManageParcelLocation        from "./ManageParcelLocation";
import MonitorParcel               from "./MonitorParcel";
import GenerateTrackingInformation from "./GenerateTrackingInformation";

import Settings from "./Settings";
import Logout   from "./Logout";

const PAGE_MAP = {
  'dashboard':           AnalyticsDashboard,

  'process-seller':      ProcessSellerInformation,
  'seller-report':       ViewSeller,

  'process-parcel':      ProcessParcelInformation,
  'parcel-movement':     GenerateParcelMovement,
  'parcel-confirmation': GenerateParcelConfirmationStatus,
  'parcel-report':       GenerateParcelStatusReport,

  'process-rider':       ProcessRiderInformation,
  'monitor-rider':       MonitorRiderStatus,
  'rider-report':        GenerateRiderDataReport,

  'parcel-location':     ManageParcelLocation,
  'geofence':            MonitorParcel,
  'tracking-info':       GenerateTrackingInformation,

  'settings':            Settings,
  'logout':              Logout,
};

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [activePage, setActivePage]   = useState('dashboard');

  // ── Not logged in → show login page ───────────────────────────────────────
  if (!currentUser) {
    return (
      <LoginPage
        onLogin={(user) => {
          setCurrentUser(user);
          setActivePage('dashboard');
        }}
      />
    );
  }

  // ── Logged in → render the active page ────────────────────────────────────
  const PageComponent = PAGE_MAP[activePage] || AnalyticsDashboard;

  return (
    <div style={{ flex: 1 }}>
      <PageComponent
        activePage={activePage}
        setActivePage={setActivePage}
        currentUser={currentUser}
        onLogout={() => {
          setCurrentUser(null);
          setActivePage('dashboard');
        }}
      />
    </div>
  );
}

export default App;