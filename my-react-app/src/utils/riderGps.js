// Live GPS helpers shared by the Geofence Monitor table (MonitorParcel.jsx)
// and its map (LiveRiderMap.jsx), so both agree on when a rider is "live".
//
// The rider app sends a ping to POST /api/riders/:registrationId/location,
// which saves it on the rider as `lastLocation: { lat, lng, heading, recordedAt }`.
import { CITY_COORDS } from '../luzonCityCoords';
import { haversineKm } from '../hubGeofenceData';

// A ping older than this no longer counts as live.
export const LIVE_PING_MAX_AGE_MS = 60 * 1000;

// How often the Geofence Monitor re-loads rider positions.
export const LIVE_REFRESH_MS = 3000;

// Returns { lat, lng, heading } when the rider's last ping is under 60 seconds
// old, otherwise null (the page then falls back to its approximate position).
export function getFreshPing(rider) {
  const loc = rider && rider.lastLocation;
  if (!loc) return null;
  const lat = Number(loc.lat);
  const lng = Number(loc.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const age = Date.now() - new Date(loc.recordedAt).getTime();
  if (!(age >= -LIVE_PING_MAX_AGE_MS && age <= LIVE_PING_MAX_AGE_MS)) return null;
  const heading = Number(loc.heading);
  return { lat, lng, heading: Number.isFinite(heading) ? heading : null };
}

// Name of the closest town in our city table, e.g. "Malolos".
export function nearestTownName(lat, lng) {
  let bestName = '';
  let bestDist = Infinity;
  Object.entries(CITY_COORDS).forEach(([name, c]) => {
    const d = haversineKm(lat, lng, c.lat, c.lng);
    if (d < bestDist) { bestDist = d; bestName = name; }
  });
  return bestName;
}

// Text for the "Current Location" column, e.g. "14.8430, 120.8110 · near Malolos".
export function formatLivePosition(lat, lng) {
  const town = nearestTownName(lat, lng);
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}${town ? ` · near ${town}` : ''}`;
}
