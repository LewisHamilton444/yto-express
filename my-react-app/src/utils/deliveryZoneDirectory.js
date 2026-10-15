/**
 * deliveryZoneDirectory.js — JS port of Android `DeliveryZoneDirectory`
 * (app/src/main/java/com/example/yto_express_app/utils/DeliveryZoneDirectory.java).
 *
 * App-defined delivery corridors around the Pulilan hub: three logistics
 * zones over Bulacan's 24 municipalities/cities. Bulacan has no official
 * numbered zone layer (that system exists only in the City of Manila), so
 * the zone IDs below are declared logistics groupings — stable keys only;
 * display labels live with the callers ("North Zone", "Central Zone",
 * "South Zone").
 *
 * Barangay coverage is PARTIAL (3 of 24 towns) pending professor sign-off
 * on the full zone → municipality → barangay mapping:
 *   - San Miguel ..... 31 barangays (from AddAddressActivity block copy)
 *   - San Rafael ..... 31 barangays (same block copy as San Miguel)
 *   - Santa Maria .... 23 barangays
 * Towns without entries return an empty list from barangaysOf(); callers
 * must hide the barangay dropdown in that case (never show an empty list).
 */

export const NORTH = 'NORTH';
export const CENTRAL = 'CENTRAL';
export const SOUTH = 'SOUTH';

export const ALL_ZONE_IDS = [NORTH, CENTRAL, SOUTH];

export const ZONE_LABELS = {
  [NORTH]: 'North Zone',
  [CENTRAL]: 'Central Zone',
  [SOUTH]: 'South Zone',
};

// 24 municipalities / cities (same order as the Android zone map).
export const ALL_MUNICIPALITIES = [
  'San Miguel', 'San Ildefonso', 'San Rafael', 'Baliwag', 'Bustos',
  'Angat', 'Norzagaray', 'Dona Remedios Trinidad', 'Pandi',
  'Pulilan', 'Plaridel', 'Calumpit', 'Malolos', 'Hagonoy',
  'Paombong', 'Guiguinto', 'Balagtas', 'Bulakan', 'Bocaue',
  'Meycauayan', 'Marilao', 'Obando', 'Santa Maria', 'San Jose del Monte',
];

const ZONE_MAP = {
  [NORTH]: [
    'San Miguel', 'San Ildefonso', 'San Rafael', 'Baliwag',
    'Bustos', 'Angat', 'Norzagaray', 'Dona Remedios Trinidad', 'Pandi',
  ],
  [CENTRAL]: [
    'Pulilan', 'Plaridel', 'Calumpit', 'Malolos', 'Hagonoy',
    'Paombong', 'Guiguinto', 'Balagtas', 'Bulakan', 'Bocaue',
  ],
  [SOUTH]: [
    'Meycauayan', 'Marilao', 'Obando', 'Santa Maria', 'San Jose del Monte',
  ],
};

// Barangay list copied from Android BARANGAYS (block copy kept in sync
// manually; keys match the municipality name). Only 3 of 24 towns are
// populated — see file header.
const SAN_MIGUEL_SAN_RAFAEL = [
  'BMA-Balagtas', 'Caingin', 'Coral na Bato', 'Cruz na Daan',
  'Dagat-dagatan', 'Diliman 1st', 'Diliman 2nd', 'Libis',
  'Lico', 'Maasim', 'Mabalas-balas', 'Maguinao', 'Maronquillo',
  'Paco', 'Pansumaloc', 'Pantubig', 'Pasong Callos', 'Pasong Cruz',
  'Pasong Intsik', 'Poblacion', 'Pulo', 'Pulong Bayabas',
  'Salapungan', 'Sampaloc', 'San Agustin', 'San Roque',
  'Sapang Pahalang', 'Talacsan', 'Tambubong', 'Tukod', 'Ulingao',
];

export const BARANGAYS = {
  'San Miguel': SAN_MIGUEL_SAN_RAFAEL.slice(),
  'San Rafael': SAN_MIGUEL_SAN_RAFAEL.slice(),
  'Santa Maria': [
    'Bagbaguin', 'Balasing', 'Buenavista', 'Camangyanan', 'Catmon',
    'Caypombo', 'Caysio', 'Guyong', 'Lalakhan', 'Mag-asawang Sapa',
    'Mahabang Parang', 'Manggahan', 'Parada', 'Poblacion',
    'Pulong Buhangin', 'San Gabriel', 'San Jose Patag', 'San Vicente',
    'Santa Clara', 'Santa Cruz', 'Silangan', 'Tabing Bakod', 'Tumana',
  ],
};

/** Common aliases seen in free-form addresses (port of Android alias()). */
function alias(normalized) {
  if (normalized === 'drt') return 'dona remedios trinidad';
  if (normalized === 'sjdm') return 'san jose del monte';
  // Web interop: bulacanLocationUtils canonicalises Baliwag -> "Baliuag"
  // (old spelling); the directory spells it "Baliwag". Accept both.
  if (normalized === 'baliuag') return 'baliwag';
  return normalized;
}

function normalize(raw) {
  if (raw == null) return '';
  let s = String(raw).trim().toLowerCase();
  if (s.endsWith(' city')) s = s.substring(0, s.length() - 5).trim();
  s = s.replace(/ñ/g, 'n');
  return alias(s);
}

/** Zone IDs in display order. */
export function allZoneIds() {
  return ALL_ZONE_IDS.slice();
}

/** Municipalities of a zone; empty list for unknown IDs. */
export function municipalitiesOf(zoneId) {
  const list = ZONE_MAP[zoneId];
  return list ? list.slice() : [];
}

/** Barangays of a municipality; empty list when not yet mapped (21/24 towns). */
export function barangaysOf(municipality) {
  const list = BARANGAYS[municipality];
  return list ? list.slice() : [];
}

/**
 * Maps a city/municipality name to its zone ID, or null when unknown
 * (outside Bulacan, unparseable, Metro Manila spill-over).
 */
export function zoneForMunicipality(municipality) {
  const want = normalize(municipality);
  if (!want) return null;
  for (const zoneId of ALL_ZONE_IDS) {
    for (const town of ZONE_MAP[zoneId]) {
      if (want === normalize(town)) return zoneId;
    }
  }
  return null;
}

/** Returns the zone ID for a given barangay name, or null. */
export function zoneForBarangay(barangay) {
  if (barangay == null) return null;
  const want = String(barangay).trim().toLowerCase();
  if (!want) return null;
  for (const town of Object.keys(BARANGAYS)) {
    for (const b of BARANGAYS[town]) {
      if (want === String(b).trim().toLowerCase()) {
        return zoneForMunicipality(town);
      }
    }
  }
  return null;
}

/** Case-insensitive barangay equality (trims both sides; '' never matches). */
export function sameBarangay(a, b) {
  if (a == null || b == null) return false;
  const x = String(a).trim().toLowerCase();
  const y = String(b).trim().toLowerCase();
  return x !== '' && x === y;
}

/** All barangays across mapped towns, sorted (port of Android allBarangays()). */
export function allBarangays() {
  const combined = new Set();
  for (const town of Object.keys(BARANGAYS)) {
    for (const b of BARANGAYS[town]) combined.add(b);
  }
  return Array.from(combined).sort((a, b) => a.localeCompare(b));
}

/**
 * Extract the barangay name from a free-form address string.
 * Port of Android PendingViewActivity.extractBarangayFromAddress():
 * split on ',', take the last token; if it starts with "Brgy."/"Barangay"
 * strip the prefix; otherwise accept it only when it matches a known
 * barangay (containment fallback). Returns '' when none found.
 */
export function extractBarangayFromAddress(fullAddr) {
  if (fullAddr == null) return '';
  const parts = String(fullAddr).split(',');
  if (parts.length < 2) return '';
  const lastPart = parts[parts.length - 1].trim();
  if (!lastPart) return '';
  const clued = lastPart.toLowerCase();
  if (clued.startsWith('brgy.') || clued.startsWith('barangay')) {
    const remainder = lastPart.substring(clued.startsWith('brgy.') ? 5 : 8).trim();
    return remainder;
  }
  for (const b of allBarangays()) {
    if (String(b).trim().toLowerCase() === lastPart.toLowerCase()) return lastPart;
  }
  return '';
}
