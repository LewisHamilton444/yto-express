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

const API_ROOT = import.meta.env.VITE_API_URL || 'https://yto-express.onrender.com';
export const API_BASE = `${API_ROOT}/api`;

/** fetch(), with `path` resolved against the shared API base. */
export function apiFetch(path, options) {
  return fetch(`${API_BASE}${path}`, options);
}

const getJson = (path) => apiFetch(path).then((res) => res.json());

export const sellersApi = {
  list: () => getJson('/sellers'),
};

export const ridersApi = {
  list: () => getJson('/riders'),
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

export const dashboardApi = {
  stats: () => getJson('/dashboard/stats'),
};

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
