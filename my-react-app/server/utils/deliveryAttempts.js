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

// ── Cross-bridge attempt vocabulary (I-3c / G-23) ──────────────────────
// The Android backend records attempts with enum codes (its
// constants/deliveryAttempts.js is the canonical vocabulary); this backend
// records them with human-readable reason strings. These two tables are the
// ONLY translation between them, so neither side ever invents a reason the
// other cannot store. Anything unmapped is dropped at the boundary, never
// coerced.

// Android reasonCode -> this backend's reason string.
const APP_ATTEMPT_REASON_TO_WEB = {
    RECIPIENT_UNAVAILABLE: 'Recipient not available',
    CONSIGNEE_UNREACHABLE: 'Recipient unreachable',
    INCORRECT_ADDRESS: 'Wrong or incomplete address',
    WEATHER_FORCE_MAJEURE: 'Unsafe area or bad weather',
    CONSIGNEE_REFUSED: 'Recipient refused',
    // The three below have no exact web string; they land in 'Other' with the
    // original code preserved in notes so the ledger never loses the truth.
    OPERATIONAL_OVERTIME: 'Other',
    ORDER_CANCELLED: 'Other',
    DAMAGED_IN_TRANSIT: 'Other',
};

// This backend's reason string -> Android reasonCode. 'Other'/'reschedule'/
// 'no cash' land on the nearest retriable Android code; the original web
// reason stays in the Android reasonDescription via the caller.
const WEB_ATTEMPT_REASON_TO_APP = {
    'Recipient not available': 'RECIPIENT_UNAVAILABLE',
    'Recipient refused': 'CONSIGNEE_REFUSED',
    'Wrong or incomplete address': 'INCORRECT_ADDRESS',
    'Recipient unreachable': 'CONSIGNEE_UNREACHABLE',
    'Recipient requested reschedule': 'RECIPIENT_UNAVAILABLE',
    'No cash for COD': 'RECIPIENT_UNAVAILABLE',
    'Unsafe area or bad weather': 'WEATHER_FORCE_MAJEURE',
    'Other': 'OPERATIONAL_OVERTIME',
};

function parseValidDate(value) {
    if (!value) return null;
    const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

// Android deliveryAttempts entry -> this backend's Parcel.deliveryAttempt
// shape (reason enum, lat/lng, photoUrl). riderCoords is GeoJSON order
// [lng, lat]. Unknown reasonCodes are skipped; the schema's min:1/max:3
// attemptNumber is respected by dropping out-of-range rows.
function mapAppAttemptsToWeb(list) {
    if (!Array.isArray(list)) return [];
    const mapped = [];
    for (const a of list) {
        if (!a || typeof a !== 'object') continue;
        const n = Number(a.attemptNumber);
        if (!Number.isFinite(n) || n < 1 || n > MAX_DELIVERY_ATTEMPTS) continue;
        const code = String(a.reasonCode || '');
        const reason = APP_ATTEMPT_REASON_TO_WEB[code];
        if (!reason) continue;
        const desc = String(a.reasonDescription || '').trim();
        const notes = (code === 'OPERATIONAL_OVERTIME' || code === 'ORDER_CANCELLED' || code === 'DAMAGED_IN_TRANSIT')
            ? `[app: ${code}] ${desc}`.trim().slice(0, NOTES_MAX_LENGTH)
            : desc.slice(0, NOTES_MAX_LENGTH);
        const coords = Array.isArray(a.riderCoords) && a.riderCoords.length === 2 ? a.riderCoords : null;
        mapped.push({
            attemptNumber: n,
            reason,
            notes,
            riderId: '',
            lat: coords ? Number(coords[1]) : null,
            lng: coords ? Number(coords[0]) : null,
            photoUrl: typeof a.proofPhoto === 'string' ? a.proofPhoto : '',
            attemptedAt: parseValidDate(a.attemptedAt) || new Date(),
            nextAttemptDate: parseValidDate(a.nextAttemptDate),
        });
    }
    return mapped;
}

// This backend's Parcel.deliveryAttempts entry -> Android attempt shape
// (reasonCode enum, riderCoords [lng, lat], proofPhoto). Unmapped reasons
// are dropped; notes ride in reasonDescription so nothing is lost.
function mapWebAttemptsToApp(list) {
    if (!Array.isArray(list)) return [];
    const mapped = [];
    for (const a of list) {
        if (!a || typeof a !== 'object') continue;
        const n = Number(a.attemptNumber);
        if (!Number.isFinite(n) || n < 1) continue;
        const webReason = String(a.reason || '');
        const reasonCode = WEB_ATTEMPT_REASON_TO_APP[webReason];
        if (!reasonCode) continue;
        const hasCoords = Number.isFinite(Number(a.lat)) && Number.isFinite(Number(a.lng));
        mapped.push({
            attemptNumber: n,
            reasonCode,
            reasonDescription: String(a.notes || '').trim().slice(0, NOTES_MAX_LENGTH),
            proofPhoto: typeof a.photoUrl === 'string' && a.photoUrl ? a.photoUrl : null,
            riderCoords: hasCoords ? [Number(a.lng), Number(a.lat)] : null,
            attemptedAt: parseValidDate(a.attemptedAt) || new Date(),
            nextAttemptDate: parseValidDate(a.nextAttemptDate),
        });
    }
    return mapped;
}

// PH retry rule shared by both backends (ported from the Android backend's
// constants/deliveryAttempts.js — keep the two implementations identical):
// next attempt is tomorrow, and Sunday is skipped so a parcel never rests
// on a non-delivery day.
function computeNextAttemptDate(fromDate = new Date()) {
    const d = new Date(fromDate);
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 0) {
        d.setDate(d.getDate() + 1);
    }
    return d;
}

module.exports = {
    MAX_DELIVERY_ATTEMPTS,
    FAILED_ATTEMPT_REASONS,
    NOTES_MAX_LENGTH,
    STATUS,
    FAILED_ATTEMPT_ALLOWED_FROM,
    REDELIVER_ALLOWED_FROM,
    APP_ATTEMPT_REASON_TO_WEB,
    WEB_ATTEMPT_REASON_TO_APP,
    mapAppAttemptsToWeb,
    mapWebAttemptsToApp,
    computeNextAttemptDate,
};
