// Centralized demo-account detection for the admin portal.
// Demo accounts live on demo domains or are the allowlisted demo logins
// (mirroring the Android app's customer/seller/rider/demo-admin convention).
// Everything else defaults to REAL.

export const DEMO_DOMAINS = ['example.com'];

export const DEMO_EMAILS = [
  'customer@gmail.com',
  'seller@gmail.com',
  'rider@gmail.com',
];

export function isDemoEmail(email) {
  const value = String(email || '').toLowerCase().trim();
  const domain = value.split('@')[1] || '';
  return DEMO_EMAILS.includes(value) || DEMO_DOMAINS.includes(domain) || value.startsWith('demo.');
}
