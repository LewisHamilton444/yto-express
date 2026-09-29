// Client-side input hardening and safe error wording (2026-09-29, IAS pass).
//
// These checks improve the experience and stop obviously malformed input
// early; they are NOT the security boundary. The server re-validates every
// request (type checks, operator stripping, requireRole) because anything in
// the browser can be bypassed. Keep the two in step.

export const LIMITS = {
  email: 254,     // RFC 5321 maximum address length
  password: 128,
  search: 100,
};

// Control characters (NUL, escapes, bidi overrides) have no place in a login
// or search field and are a common ingredient in injection/spoofing attempts.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g;

// Deliberately simple: one @, no spaces, a dot in the domain. The server is
// the authority on whether the account exists.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(value) {
  return String(value ?? '').replace(CONTROL_CHARS, '').trim().toLowerCase();
}

/**
 * Validate the login form before anything is sent. Returns a user-facing
 * message, or null when the input is acceptable. Messages describe the
 * input format only — they never say whether an account exists.
 */
export function validateLoginInput(email, password) {
  const cleanEmail = normalizeEmail(email);
  const pass = String(password ?? '');

  if (!cleanEmail && !pass) return 'Please enter your email and password.';
  if (!cleanEmail) return 'Please enter your email address.';
  if (!pass) return 'Please enter your password.';
  if (cleanEmail.length > LIMITS.email || !EMAIL_PATTERN.test(cleanEmail)) {
    return 'Please enter a valid email address.';
  }
  if (pass.length > LIMITS.password) return 'Invalid email or password.';
  CONTROL_CHARS.lastIndex = 0;
  if (CONTROL_CHARS.test(pass)) return 'Invalid email or password.';
  return null;
}

/**
 * Map any login failure to a fixed, non-revealing message. The raw server
 * text, status codes, exception names and stack traces never reach the UI:
 * wrong email and wrong password read exactly the same.
 */
export function toSafeLoginError(err) {
  const status = err && typeof err.status === 'number' ? err.status : null;
  if (status === 400 || status === 401 || status === 404) return 'Invalid email or password.';
  if (status === 403) return 'This account cannot sign in right now. Contact your Super Admin.';
  if (status === 429) return 'Too many sign-in attempts. Please wait a few minutes and try again.';
  if (err && err.kind === 'timeout') return 'The server is taking too long to respond. It may be starting up — please try again in a moment.';
  if (err && err.kind === 'network') return 'Cannot reach the server right now. Check your connection and try again.';
  return 'Something went wrong while signing in. Please try again.';
}

/**
 * Clean free-text search input: drop control characters and the characters
 * used to build markup or query operators (< > { } $ \), and cap the length.
 * Letters, digits, spaces, @ . - _ ' # and / (IDs, emails, names, tracking
 * numbers) pass through unchanged.
 */
export function sanitizeSearchInput(value, max = LIMITS.search) {
  return String(value ?? '')
    .replace(CONTROL_CHARS, '')
    .replace(/[<>{}$\\]/g, '')
    .slice(0, max);
}

/** Roles the admin panel knows. Anything else is treated as signed out. */
export const KNOWN_ROLES = ['super_admin', 'staff', 'hub_receiver'];

/**
 * Decode a JWT payload (base64url) without trusting it for authorization —
 * the server verifies the signature on every request. Used only to restore
 * the session UI (name, role for menu layout, expiry). Returns null when the
 * token is malformed, expired, or carries an unknown role.
 */
export function readSessionFromToken(token) {
  try {
    const part = String(token || '').split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    const payload = JSON.parse(atob(b64));
    if (!payload || typeof payload !== 'object') return null;
    if (typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) return null;
    if (!KNOWN_ROLES.includes(payload.role)) return null;
    return payload;
  } catch {
    return null;
  }
}
