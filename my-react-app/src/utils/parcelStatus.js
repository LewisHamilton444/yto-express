// Canonical parcel-status normalization — one source of truth for every
// surface that displays a bridge-synced status (ManageParcels, AnalyticsDashboard,
// exports). The mobile backend's vocabulary (constants/shipmentStatuses.js,
// mirrored from ShipmentStatus.java) is Title-case and is stored VERBATIM on
// the Web Parcel document by POST /api/bridge/receive-status — so raw values
// like 'Out for Delivery' / 'Picked Up' / 'Returning' flow through the bridge.
// Legacy web-created rows may still carry the lowercase-hyphenated form
// ('in-transit', 'pending', ...) from the old ProcessParcelInformation flow.
//
// Before this module existed, pages mapped only the 5 legacy forms — any
// mobile-synced 'Out for Delivery' / 'Picked Up' row fell through the map and
// was DISPLAYED as "Pending" (wrong status badge, wrong timeline label), and
// dashboard counts missed those rows entirely.

const TITLE_CASE_MAP = {
  'pending':            'Pending',
  'to pickup':          'To Pickup',
  'topickup':           'To Pickup',
  'picked up':          'Picked Up',
  'pickedup':           'Picked Up',
  'in transit':         'In Transit',
  'in-transit':         'In Transit',
  'intransit':          'In Transit',
  'out for delivery':   'Out for Delivery',
  'outfordelivery':     'Out for Delivery',
  'delivered':          'Delivered',
  'completed':          'Delivered',
  'cancelled':          'Cancelled',
  'canceled':           'Cancelled',
  'returning':          'Returning',
  'returned':           'Returned',
  'failed':             'Failed',
  // Legacy web aliases kept writable on the mobile side
  'confirmed':          'Confirmed',
  'processing':         'Confirmed',
  'shipping':           'In Transit',
  'to ship':            'Pending',
  'toship':             'Pending',
  'attempted':          'Failed',
};

// Case-insensitive + separator-insensitive lookup: 'In-Transit', 'IN TRANSIT'
// and 'in transit' all normalize to 'In Transit'.
export function normalizeParcelStatus(rawStatus) {
  const key = String(rawStatus ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  return TITLE_CASE_MAP[key] || String(rawStatus ?? '').trim() || 'Pending';
}

// Status-family predicates used for counts/filters — case-insensitive so the
// dashboard's client-side fallback (used whenever the /dashboard/stats
// aggregate is unreachable) never undercounts because of letter casing.
export const isDeliveredStatus = (status) =>
  String(status ?? '').trim().toLowerCase() === 'delivered';

export const isReturnFamilyStatus = (status) =>
  /return/i.test(String(status ?? ''));

// Anything physically moving through the network — includes Out for Delivery,
// which the old substring check ('transit') missed.
export const isInTransitFamilyStatus = (status) => {
  const s = String(status ?? '').trim().toLowerCase();
  return s === 'in transit' || s === 'out for delivery' || s === 'picked up' || s === 'shipping';
};
