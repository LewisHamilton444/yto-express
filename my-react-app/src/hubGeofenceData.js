
// ── Logistics hub / sorting center data ─────────────────────────────────────
// activeParcelsCount and assignedRidersCount are NOT stored here — they're
// computed live from the real riders/parcels feeds (see LiveRiderMap),
// the same way normalizeSeller/normalizeRider replaced disconnected mock
// counts elsewhere in this app.
//
// D-6 / G-10 (2026-10-12): this list is now the app's REAL directory, not one
// hub. The Android backend seeds TEN Bulacan hubs/branches
// (controllers/hubController.js defaultHubRows() -> HubBranch, served by
// GET /api/hubs); this file previously carried only the central one, so the
// portal's hub intake, sort codes and hub map disagreed with the app about how
// many hubs exist. Every row below is copied 1:1 from that source — same
// hubId, name, municipality, address and coordinates — so a hub named in the
// app resolves here. `sortCode` is the destination code printed on the waybill
// label, resolved by the same table as services/waybill.js.
//
// COORDINATE NOTE: the central hub's address is the OSM-verified Dampol II-B
// warehouse (14.9027° N, 120.8073° E); branch coordinates come from the app's
// own row for that branch and are NOT independently surveyed — they place the
// pin on the municipality, which is what the hub map needs.
//
// STATUS HONESTY: `status` below is the hub's declared operating state used
// for map coloring only — it is NOT derived from live load telemetry (no
// such feed exists). Live parcel/rider counts per hub are computed at
// render time in LiveRiderMap (hubMetrics) and are the real numbers.

const HUB_STATUS = {
  OPERATIONAL: 'Operational',
  OFFLINE: 'Offline',
};

// geofenceRadius is the operating-area ring drawn around a hub (km). It is a
// planning radius, not telemetry — live parcel/rider counts inside it are
// computed from real data in LiveRiderMap.
const HUB_RADIUS_MAIN = 2.5;
const HUB_RADIUS_BRANCH = 1.5;

/**
 * One branch row, in the shape this file's consumers already read
 * (hubId/hubName/region/address/coordinates/geofenceRadius/status), built from
 * the Android directory's own fields (name/municipality/address/lat/lng).
 */
function hubRow(hubId, name, address, municipality, lat, lng, sortCode) {
  return {
    hubId,
    hubName: name,
    region: 'Central Luzon — Bulacan',
    municipality,
    sortCode,
    address,
    coordinates: { lat, lng },
    geofenceRadius: HUB_RADIUS_BRANCH,
    status: HUB_STATUS.OPERATIONAL,
    isCentralHub: false,
  };
}

export const LOGISTICS_HUBS = [
  {
    hubId: 'hub_pulilan',
    hubName: 'YTO Pulilan Main Sorting Hub',
    region: 'Central Luzon — Bulacan',
    municipality: 'Pulilan',
    sortCode: 'BUL-PUL-01',
    // Exact warehouse coordinates (the app's PULILAN_MAIN_HUB — OSM-verified
    // Dampol 2nd B, Pulilan, near the NLEX Pulilan interchange).
    address: 'Warehouse 8-17, Pulilan Enterprises Center, Dampol II-B, Pulilan',
    coordinates: { lat: 14.9027, lng: 120.8073 },
    geofenceRadius: HUB_RADIUS_MAIN,
    status: HUB_STATUS.OPERATIONAL,
    isCentralHub: true,
  },
  // A's branch ids carry no prefix (the app's branch() helper stores the id it
  // is given, and that helper is called with these bare names), while its
  // central hub is 'hub_pulilan'. They are reproduced exactly here: a hub id is
  // how both sides name the same hub, so inventing a tidier one would just be a
  // different kind of disagreement. Verified by npm run qa:hubs.
  hubRow('malolos', 'Malolos Branch', 'McArthur Highway, Catmon, Malolos City',
    'Malolos', 14.8433, 120.8114, 'BUL-MAL-02'),
  hubRow('baliuag', 'Baliuag Station', 'Dona Remedios Trinidad Hwy, Poblacion, Baliuag',
    'Baliuag', 14.9547, 120.9008, 'BUL-BAL-04'),
  hubRow('calumpit', 'Calumpit Center', 'Calumpit Municipal Road, Poblacion, Calumpit',
    'Calumpit', 14.9050, 120.7700, 'BUL-CAL-09'),
  hubRow('plaridel', 'Plaridel Hub', 'Cagayan Valley Road, Banga 1st, Plaridel',
    'Plaridel', 14.8872, 120.8572, 'BUL-PLA-10'),
  hubRow('meycauayan', 'Meycauayan Hub', 'Malhacan Road, Meycauayan City',
    'Meycauayan', 14.7350, 120.9610, 'BUL-MEY-03'),
  hubRow('sjdm', 'San Jose del Monte Branch', 'Quirino Highway, Tungkong Mangga, San Jose del Monte',
    'San Jose del Monte', 14.8136, 121.0453, 'BUL-SJD-05'),
  hubRow('santa_maria', 'Santa Maria Branch', 'Santa Maria Bypass Road, Poblacion, Santa Maria',
    'Santa Maria', 14.8189, 120.9575, 'BUL-STM-07'),
  hubRow('marilao', 'Marilao Station', 'Manila North Road, Abangan Sur, Marilao',
    'Marilao', 14.7578, 120.9489, 'BUL-MAR-06'),
  hubRow('guiguinto', 'Guiguinto Center', 'Cagayan Valley Road, Tabang, Guiguinto',
    'Guiguinto', 14.8310, 120.8800, 'BUL-GUI-08'),
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
