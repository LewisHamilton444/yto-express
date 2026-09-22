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

// Approval notification text sent to registered users.
// Note: Passwords are created by users on the mobile app and never overwritten.
export const buildSmsMessage = (credentials = {}) => {
  const role = credentials.role || 'user';
  return `Welcome to YTO Express! Your ${role} account registration has been approved. You can now log into the YTO Express mobile app using your registered email/phone and password.`;
};
