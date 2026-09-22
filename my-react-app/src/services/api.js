// Centralized API client.
//
// Before this module existed, ~17 components each hardcoded their own copy
// of the backend origin ('https://yto-express.onrender.com') under a mix of
// names (API, API_BASE, PARCELS_API, RIDERS_API, ...) and re-typed the same
// fetch(`${BASE}/api/...`) calls. That meant one more place to update every
// time the backend moved, and no single spot to point at a different
// environment. Everything now resolves against the same base here.
//
// `apiFetch` is a deliberately thin wrapper — same signature as fetch(),
// just with the origin filled in — so it's a drop-in replacement at each
// call site without changing any of that site's existing response/error
// handling (some throw, some read `data.error`, some ignore failures and
// return an empty array, etc.). The `*Api.list()` helpers below cover the
// common "GET a collection" case, which was identical everywhere.

export const API_ROOT = import.meta.env.VITE_API_URL || 'https://yto-express-backend.onrender.com';
const API_BASE = `${API_ROOT}/api`;

/** fetch(), with `path` resolved against the shared API base and JWT token attached. */
export async function apiFetch(path, options = {}) {
  // Per-call timeout (default 60s): without this a hanging connection leaves
  // every caller waiting forever — the login spinner and the dashboard
  // skeleton never resolve. A timeout converts the hang into a catchable
  // error so each screen shows its honest error state instead. Callers that
  // need longer (or shorter) pass { timeout: ms }.
  const { timeout = 60000, ...fetchOptions } = options;
  const token = getAuthToken();
  const headers = { ...fetchOptions.headers };
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(`${API_BASE}${path}`, { ...fetchOptions, headers, signal: ctrl.signal });
    if (res.status === 401 && token && !path.includes('/login')) {
      try {
        const clone = res.clone();
        const data = await clone.json();
        if (data.error && (data.error.toLowerCase().includes('expired') || data.error.toLowerCase().includes('token') || data.error.toLowerCase().includes('denied'))) {
          setAuthToken(null);
          window.dispatchEvent(new Event('yto:auth_expired'));
        }
      } catch { /* non-JSON 401 body: nothing to inspect */ }
    }
    return res;
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new Error('Taking too long to respond. The system may be starting up — please try again.');
    }
    if (err instanceof TypeError) {
      // Browser-native fetch failures (DNS, refusal, offline) arrive as a bare
      // TypeError whose message leaks internals like "Failed to fetch". Surface
      // plain language instead — the login screen prints this verbatim.
      throw new Error('Cannot reach the server right now. Check that it is running, then try again.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

const TOKEN_KEY = 'yto_token';

/**
 * Read the stored JWT token. Session-only tokens (sessionStorage) win over
 * persistent ones (localStorage) because they are the more recent and more
 * restrictive choice made at login time.
 */
export function getAuthToken() {
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
}

/**
 * Store the JWT token after login.
 * remember = true  -> localStorage   (persists across tabs / browser restarts)
 * remember = false -> sessionStorage (session-only; cleared when the tab closes)
 * Passing null clears both storages (logout or token expiry).
 */
export function setAuthToken(token, remember = false) {
  if (token) {
    if (remember) {
      localStorage.setItem(TOKEN_KEY, token);
      sessionStorage.removeItem(TOKEN_KEY);
    } else {
      sessionStorage.setItem(TOKEN_KEY, token);
      localStorage.removeItem(TOKEN_KEY);
    }
  } else {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  }
}

const getJson = (path) => apiFetch(path).then((res) => res.json());

export const sellersApi = {
  list: () => getJson('/sellers'),
};

export const ridersApi = {
  list: () => getJson('/riders'),
};

export const customersApi = {
  list: () => getJson('/customers'),
};

export const parcelsApi = {
  list: () => getJson('/parcels'),
};

export const parcelLocationsApi = {
  list: () => getJson('/parcel-locations'),
};

export const accountsApi = {
  list: () => getJson('/accounts'),
};

// ── Login Helper ────────────────────────────────────────────────────────
export async function adminLogin(email, password, remember = false) {
  const res = await apiFetch('/accounts/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  if (data.token) setAuthToken(data.token, remember);
  return { ...data, loginRole: 'admin' };
}

export const notificationsApi = {
  // Both approval flows (seller + rider) POST here with the identical
  // request/response shape — mails the new account's credentials via Gmail.
  // Throws with the server's error message on failure, same as both call
  // sites used to do by hand.
  sendEmail: async (payload) => {
    const res = await apiFetch('/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Email delivery failed');
    return result;
  },
};
