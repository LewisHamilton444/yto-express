// API client for the customer/issues/activity-log admin views.
//
// These routes (/customers, /issues, /activity-log) are new and, unlike the
// ~17 screens wired to services/api.js, aren't deployed to the shared
// production backend that apiFetch() there falls back to
// (yto-express.onrender.com) — so during local development, with no
// VITE_API_URL set, those calls were silently hitting production and
// failing since the routes don't exist there yet. This client defaults to
// the local dev backend instead, while still resolving VITE_API_URL first
// when it's set (staging/prod builds), and still attaching the same JWT
// auth header and 401-expiry handling as apiFetch().
import { getAuthToken, setAuthToken } from './api';

const API_ROOT = import.meta.env.VITE_API_URL || 'http://localhost:3001';
export const API_BASE = `${API_ROOT}/api`;

export async function apiFetch(path, options = {}) {
  const token = getAuthToken();
  const headers = { ...options.headers };
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401 && token && !path.includes('/login')) {
    try {
      const clone = res.clone();
      const data = await clone.json();
      if (data.error && (data.error.toLowerCase().includes('expired') || data.error.toLowerCase().includes('token') || data.error.toLowerCase().includes('denied'))) {
        setAuthToken(null);
        window.dispatchEvent(new Event('yto:auth_expired'));
      }
    } catch {
      // Response body wasn't JSON (or already consumed) — not a 401 we need to react to.
    }
  }
  return res;
}
