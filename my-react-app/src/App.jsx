import { useState } from 'react';
import { setAuthToken, getAuthToken } from './services/api';
import { isDemoEmail } from './demoUtils';
import { ToastProvider } from './components/ui/ToastContext';
import ErrorBoundary from './components/ui/ErrorBoundary';

import LoginPage from './LoginPage';
import AnalyticsDashboard from "./AnalyticsDashboard"

import ProcessSellerInformation    from "./ProcessSellerInformation";
import ViewSeller                  from "./ViewSeller";

import ProcessParcelInformation    from "./ProcessParcelInformation";
import ManageParcels               from "./ManageParcels";

import ProcessRiderInformation     from "./ProcessRiderInformation";
import MonitorRiderStatus          from "./MonitorRiderStatus";
import GenerateRiderDataReport     from "./GenerateRiderDataReport";

import ManageParcelLocation        from "./ManageParcelLocation";
import MonitorParcel               from "./MonitorParcel";
import GenerateTrackingInformation from "./GenerateTrackingInformation";

import Settings from "./Settings";
import Logout   from "./Logout";
import CustomerList from "./CustomerList";
import ActivityLog from "./ActivityLog";
import ManageAccounts from "./ManageAccounts";
import HubParcelReceiving from "./HubParcelReceiving";
import ManageIssues from "./ManageIssues";

const PAGE_MAP = {
  'dashboard':           AnalyticsDashboard,
  'process-seller':      ProcessSellerInformation,
  'seller-report':       ViewSeller,
  'process-parcel':      ProcessParcelInformation,
  'manage-parcels':      ManageParcels,
  'process-rider':       ProcessRiderInformation,
  'monitor-rider':       MonitorRiderStatus,
  'rider-report':        GenerateRiderDataReport,
  'customer-list':       CustomerList,
  'activity-log':        ActivityLog,
  'manage-accounts':     ManageAccounts,
  'hub-parcels':         HubParcelReceiving,
  'manage-issues':       ManageIssues,
  'parcel-location':     ManageParcelLocation,
  'geofence':            MonitorParcel,
  'tracking-info':       GenerateTrackingInformation,
  'settings':            Settings,
  'logout':              Logout,
};

function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    const token = getAuthToken();
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.exp * 1000 > Date.now()) {
          const isDemo = payload.isDemo !== undefined ? !!payload.isDemo : isDemoEmail(payload.email);
          return { token, email: payload.email, role: payload.role, loginRole: payload.role, isDemo };
        }
      } catch {}
      setAuthToken(null);
    }
    return null;
  });
  const [activePage, setActivePage] = useState('dashboard');
  // Bumped by the error boundary's "Retry" button to force a fresh remount
  // of the current page (the boundary key changes -> React throws the old
  // tree away and re-runs the page from scratch).
  const [retryNonce, setRetryNonce] = useState(0);

  // Handle session expiration from apiFetch interceptor
  useState(() => {
    const onAuthExpired = () => {
      setCurrentUser(null);
      setActivePage('dashboard');
    };
    window.addEventListener('yto:auth_expired', onAuthExpired);
    return () => window.removeEventListener('yto:auth_expired', onAuthExpired);
  });

  // Not logged in -> show login page
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

  const PageComponent = PAGE_MAP[activePage] || AnalyticsDashboard;

  return (
    <div style={{ flex: 1 }}>
      <ToastProvider>
        <ErrorBoundary
          key={`${activePage}:${retryNonce}`}
          onReset={() => setRetryNonce(n => n + 1)}
          onHome={() => { setActivePage('dashboard'); setRetryNonce(n => n + 1); }}
        >
          <PageComponent
            activePage={activePage}
            setActivePage={setActivePage}
            currentUser={currentUser}
            onLogout={() => {
              setAuthToken(null);
              setCurrentUser(null);
              setActivePage('dashboard');
            }}
          />
        </ErrorBoundary>
      </ToastProvider>
    </div>
  );
}

export default App;
