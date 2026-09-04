// Centralized demo-account detection for the admin portal.
// Demo accounts live on @yto.com / @example.com / @ytoexpress.com, are
// allowlisted demo logins on @gmail.com (mirroring the Android app's
// customer/seller/rider@gmail.com convention), or start with "demo".
// Everything else defaults to REAL (safer — never silently treat an
// unknown domain as a throwaway test account). Mirrors the realm logic
// used in server/Server.js and bridgeRoutes.js.
export const DEMO_DOMAINS = ['yto.com', 'example.com', 'ytoexpress.com'];

// Canonical demo logins on @gmail.com (Web Admin roles). Kept exact-match
// so gmail stays REAL for everyone else. The mobile app counterparts
// (customer/seller/rider@gmail.com) are seeded DEMO records on the Web DB.
export const DEMO_EMAILS = ['superadmin@gmail.com', 'staff@gmail.com', 'hub@gmail.com'];

export function isDemoEmail(email) {
  const value = String(email || '').toLowerCase().trim();
  const domain = value.split('@')[1] || '';
  return DEMO_EMAILS.includes(value) || DEMO_DOMAINS.includes(domain) || value.startsWith('demo');
}