
// ── Logistics hub / sorting center data ─────────────────────────────────────
// activeParcelsCount and assignedRidersCount are NOT stored here — they're
// computed live from the real riders/parcels feeds (see LiveRiderMap),
// the same way normalizeSeller/normalizeRider replaced disconnected mock
// counts elsewhere in this app.
//
// COVERAGE ALIGNMENT (2026-09-13): the Android app's service area is
// Bulacan Province ONLY (see app ETACalculatorUtils: "Geographic Scope:
// Bulacan Province Only"). The single hub listed below IS the app's real
// operations hub — YTO Pulilan Main Sorting Hub — at the warehouse address
// "Warehouse 8-17, Pulilan Enterprises Center, Block 3, Pulilan Regional
// Road, Dampol II-B, Pulilan, Bulacan" at the OSM-verified Dampol 2nd B
// location (14.9027° N, 120.8073° E), which matches the app's updated
// PULILAN_MAIN_HUB. Corrections applied 2026-09-13:
//   1. HUB-002 coordinates 14.8967, 120.8528 -> 14.9027, 120.8073
//      (14.8967/120.8528 is NOT inside Dampol II-B; OSM places the
//      barangay polygon at bbox 14.9012-14.9244, 120.8003-120.8107 and
//      the NLEX Pulilan interchange at 14.9103, 120.8152).
//   2. HUB-001 (Quezon City) and HUB-003 (South Luzon - Laguna) were
//      REMOVED — non-Bulacan hubs contradicted the Bulacan-only app
//      service area. The hub list is now Bulacan-only.
//
// STATUS HONESTY: `status` below is the hub's declared operating state used
// for map coloring only — it is NOT derived from live load telemetry (no
// such feed exists). Live parcel/rider counts per hub are computed at
// render time in LiveRiderMap (hubMetrics) and are the real numbers.

const HUB_STATUS = {
  OPERATIONAL: 'Operational',
  OFFLINE: 'Offline',
};

export const LOGISTICS_HUBS = [
  {
    hubId: 'HUB-002',
    hubName: 'YTO Pulilan Main Sorting Hub',
    region: 'Central Luzon — Bulacan',
    // Exact warehouse coordinates (matches the app's PULILAN_MAIN_HUB —
    // OSM-verified Dampol 2nd B, Pulilan, near the NLEX Pulilan interchange).
    address: 'Warehouse 8-17, Pulilan Enterprises Center, Block 3, Pulilan Regional Road, Dampol II-B, Pulilan, Bulacan',
    coordinates: { lat: 14.9027, lng: 120.8073 },
    geofenceRadius: 2.5,
    status: HUB_STATUS.OPERATIONAL,
  },
];

// Great-circle distance in kilometers between two lat/lng points.
export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const HUB_STATUS_COLORS = {
  [HUB_STATUS.OPERATIONAL]:   { bg: '#e6f9ed', color: '#1e7e34', dot: '#22c55e' },
  [HUB_STATUS.OFFLINE]:       { bg: '#f5f5f5', color: '#666',    dot: '#aaa' },
  // Legacy guard: rows written before the honesty fix may still carry the
  // removed 'High Capacity' value — render them as Operational, never blank.
  'High Capacity':            { bg: '#e6f9ed', color: '#1e7e34', dot: '#22c55e' },
};
