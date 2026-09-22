import { useEffect, useState } from 'react';
import { setAuthToken, getAuthToken } from './services/api';
import { ToastProvider } from './components/ui/ToastContext';
import ErrorBoundary from './components/ui/ErrorBoundary';
import { PAGE_MAP } from './pageMap';

import LoginPage from './LoginPage';
import AnalyticsDashboard from "./AnalyticsDashboard"

function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    const token = getAuthToken();
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.exp * 1000 > Date.now()) {
          return { token, email: payload.email, role: payload.role, loginRole: payload.role };
        }
      } catch { /* malformed token payload: fall through to a clean logout */ }
      setAuthToken(null);
    }
    return null;
  });
  // Deep-linkable active page — the current key lives in the URL hash
  // (#/manage-parcels), so a refresh or shared link restores the view
  // instead of always landing on the dashboard. Unknown/absent -> dashboard.
  const [activePage, setActivePage] = useState(() => {
    const key = (window.location.hash || '').replace(/^#\/?/, '');
    return PAGE_MAP[key] ? key : 'dashboard';
  });

  useEffect(() => {
    const onHashChange = () => {
      const key = (window.location.hash || '').replace(/^#\/?/, '');
      setActivePage(PAGE_MAP[key] ? key : 'dashboard');
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  // Bumped by the error boundary's "Retry" button to force a fresh remount
  // of the current page (the boundary key changes -> React throws the old
  // tree away and re-runs the page from scratch).
  const [retryNonce, setRetryNonce] = useState(0);

  // Handle session expiration from apiFetch interceptor (proper useEffect —
  // the old `useState(() => …)` registered the listener during render and its
  // cleanup was silently discarded).
  useEffect(() => {
    const onAuthExpired = () => {
      setCurrentUser(null);
      setActivePage('dashboard');
    };
    window.addEventListener('yto:auth_expired', onAuthExpired);
    return () => window.removeEventListener('yto:auth_expired', onAuthExpired);
  }, []);

  useEffect(() => {
    if (currentUser && (window.location.hash || '').replace(/^#\/?/, '') !== activePage) {
      window.location.hash = `#/${activePage}`;
    }
  }, [activePage, currentUser]);

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

  return (
    <div style={{ flex: 1 }}>
      <ToastProvider>
        <ErrorBoundary
          key={`shell:${retryNonce}`}
          onReset={() => setRetryNonce(n => n + 1)}
          onHome={() => { setActivePage('dashboard'); setRetryNonce(n => n + 1); }}
        >
          {/* AnalyticsDashboard is the persistent application shell: sidebar,
              global header, and the page area for every route — including the
              dashboard itself. Deep links always render inside the shell. */}
          <AnalyticsDashboard
            currentUser={currentUser}
            onLogout={() => {
              setAuthToken(null);
              setCurrentUser(null);
              setActivePage('dashboard');
            }}
            activePage={activePage}
            setActivePage={setActivePage}
            retryNonce={retryNonce}
            setRetryNonce={setRetryNonce}
          />
        </ErrorBoundary>
      </ToastProvider>
    </div>
  );
}

export default App;
