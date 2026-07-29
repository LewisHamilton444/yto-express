'use client';

// ── Logistics hub / sorting center mock data ────────────────────────────────
// activeParcelsCount and assignedRidersCount are NOT stored here — they're
// computed live from the real riders/parcels feeds (see LiveRiderMap),
// the same way normalizeSeller/normalizeRider replaced disconnected mock
// counts elsewhere in this app.

export const HUB_STATUS = {
  OPERATIONAL: 'Operational',
  HIGH_CAPACITY: 'High Capacity',
  OFFLINE: 'Offline',
};

// YTO Express operates strictly within Luzon (Metro Manila, Central Luzon,
// South Luzon, Northern Luzon) — Visayas/Mindanao are out of scope, so every
// hub here must resolve to real Luzon coordinates.
export const LOGISTICS_HUBS = [
  {
    hubId: 'HUB-001',
    hubName: 'Quezon City Main Hub',
    region: 'Metro Manila',
    coordinates: { lat: 14.6760, lng: 121.0437 },
    geofenceRadius: 2,
    status: HUB_STATUS.OPERATIONAL,
  },
  {
    hubId: 'HUB-002',
    hubName: 'Central Luzon Hub - Bulacan/Pampanga',
    region: 'Central Luzon',
    coordinates: { lat: 15.0289, lng: 120.6900 },
    geofenceRadius: 2.5,
    status: HUB_STATUS.HIGH_CAPACITY,
  },
  {
    hubId: 'HUB-003',
    hubName: 'South Luzon Hub - Laguna',
    region: 'South Luzon',
    coordinates: { lat: 14.2117, lng: 121.1653 },
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
  [HUB_STATUS.HIGH_CAPACITY]: { bg: '#fff4ec', color: '#c2410c', dot: '#f37021' },
  [HUB_STATUS.OFFLINE]:       { bg: '#f5f5f5', color: '#666',    dot: '#aaa' },
};
