// Failed delivery attempts — the shared rules, kept in one place so the
// Parcel model, the routes in Server.js and simulateFailedAttempt.js can
// never disagree about them.
//
// The flow:
//   Out for Delivery --(rider fails)--> Failed Attempt  (attempt 1 or 2)
//   Failed Attempt   --(rider fails)--> Failed Attempt  (rider retries on their own)
//   any of the above --(3rd failure)--> Returned to Hub
//   Returned to Hub  --(hub confirms)-> Received at Hub (Returned)
//   Received at Hub (Returned) --(office)--> Returned to Seller
//   Failed Attempt / Returned to Hub / Received at Hub (Returned)
//                    --(office, only while attempts < 3)--> Out for Delivery

// A parcel gets at most this many delivery attempts. The 3rd failure sends it
// back to the hub; a 4th attempt is refused.
const MAX_DELIVERY_ATTEMPTS = 3;

// The only reasons a rider may give. The rider app shows these as a list.
const FAILED_ATTEMPT_REASONS = [
    'Recipient not available',
    'Recipient refused',
    'Wrong or incomplete address',
    'Recipient unreachable',
    'Recipient requested reschedule',
    'No cash for COD',
    'Unsafe area or bad weather',
    'Other',
];

const NOTES_MAX_LENGTH = 500;

// Status names used by this feature. "Out for Delivery" and "Returned to Hub"
// already existed; the other three are new.
const STATUS = {
    OUT_FOR_DELIVERY: 'Out for Delivery',
    FAILED_ATTEMPT: 'Failed Attempt',
    RETURNED_TO_HUB: 'Returned to Hub',
    RECEIVED_RETURNED: 'Received at Hub (Returned)',
    RETURNED_TO_SELLER: 'Returned to Seller',
};

// Statuses a rider can report a failed attempt from.
const FAILED_ATTEMPT_ALLOWED_FROM = [STATUS.OUT_FOR_DELIVERY, STATUS.FAILED_ATTEMPT];

// Statuses the office can send a parcel out again from.
const REDELIVER_ALLOWED_FROM = [STATUS.FAILED_ATTEMPT, STATUS.RETURNED_TO_HUB, STATUS.RECEIVED_RETURNED];

module.exports = {
    MAX_DELIVERY_ATTEMPTS,
    FAILED_ATTEMPT_REASONS,
    NOTES_MAX_LENGTH,
    STATUS,
    FAILED_ATTEMPT_ALLOWED_FROM,
    REDELIVER_ALLOWED_FROM,
};
