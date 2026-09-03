// Centralized demo-account detection for the admin portal.
// Demo accounts live on @yto.com / @example.com / @ytoexpress.com, or any
// email starting with "demo". Everything else defaults to REAL (safer —
// never silently treat an unknown domain as a throwaway test account).
// Mirrors the realm logic used in server/Server.js and bridgeRoutes.js.
export const DEMO_DOMAINS = ['yto.com', 'example.com', 'ytoexpress.com'];

export function isDemoEmail(email) {
  const value = String(email || '').toLowerCase().trim();
  const domain = value.split('@')[1] || '';
  return DEMO_DOMAINS.includes(domain) || value.startsWith('demo');
}