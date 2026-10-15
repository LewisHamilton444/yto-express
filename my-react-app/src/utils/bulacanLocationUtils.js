// Bulacan municipalities and shared location/rider matching helpers
import { LOGISTICS_HUBS, haversineKm } from '../hubGeofenceData.js';

export const BULACAN_TOWNS = [
  'Pulilan', 'Malolos', 'Baliuag', 'Baliwag', 'Calumpit', 'Plaridel',
  'Guiguinto', 'Bocaue', 'Meycauayan', 'Marilao', 'San Jose del Monte',
  'Santa Maria', 'Angat', 'Norzagaray', 'San Ildefonso', 'San Miguel',
  'San Rafael', 'Pandi', 'Paombong', 'Hagonoy', 'Bulakan', 'Balagtas',
  'Obando', 'Bustos', 'Doña Remedios Trinidad',
];

export function extractMunicipality(text) {
  if (!text) return '';
  const s = String(text);
  for (const town of BULACAN_TOWNS) {
    if (new RegExp(`\\b${town}\\b`, 'i').test(s)) {
      return town === 'Baliwag' ? 'Baliuag' : town;
    }
  }
  return '';
}

export function matchRider(pRider, riderObj) {
  if (!pRider || !riderObj) return false;
  const pId = typeof pRider === 'object' ? String(pRider._id || pRider.registrationId || '') : String(pRider);
  const rReg = String(riderObj.registrationId || riderObj.riderId || '');
  const rMongo = String(riderObj._id || '');
  return (Boolean(rReg) && pId === rReg) || (Boolean(rMongo) && pId === rMongo);
}

export function nearestHub(lat, lng) {
  let best = LOGISTICS_HUBS[0];
  let bestDist = Infinity;
  LOGISTICS_HUBS.forEach(hub => {
    const d = haversineKm(lat, lng, hub.coordinates.lat, hub.coordinates.lng);
    if (d < bestDist) { bestDist = d; best = hub; }
  });
  return best;
}
