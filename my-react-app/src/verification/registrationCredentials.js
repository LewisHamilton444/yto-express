// Registration-queue utilities.
//
// The mock applicant rosters (initialPendingSellers / initialPendingRiders)
// were removed 2026-09-13 as part of the REAL-only migration — the queue now
// starts empty and renders its own empty state. A live "pending registrations"
// feed arrives when the mobile backend exposes an endpoint for it; the review
// → approve → credential flow below is already wired to consume it
// (see useRegistrationApproval.js).

export const initialPendingSellers = [];

export const initialPendingRiders = [];

export const generateCredentials = (fullName) => {
  const parts = fullName.trim().split(/\s+/);
  const first = (parts[0] || 'user').toLowerCase();
  const lastInitial = (parts[parts.length - 1] || '')[0]?.toLowerCase() || '';
  const randomDigits = Math.floor(100 + Math.random() * 900);
  const username = `${first}${lastInitial}${randomDigits}`;

  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 8; i++) {
    password += chars[Math.floor(Math.random() * chars.length)];
  }

  return { username, password };
};

// The Contact Number is only WHERE the SMS gets delivered — the username is
// its own generated value, not the phone number/email itself.
export const buildSmsMessage = ({ username, password }) =>
  `Welcome to YTO Express! Your account has been approved. Your login credentials — Username: ${username} | Temp Password: ${password}. Please change your password after logging in.`;
