/**
 * OSRM Road Routing client for Web Admin Live Tracking Map.
 * Queries OpenStreetMap driving directions to render road-snapped polylines
 * hugging streets and highways, matching Android app routing (OsrmRoutingHelper).
 * Includes 30-minute in-memory caching and fallback to euclidean endpoints.
 */

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const TIMEOUT_MS = 4000; // 4 seconds timeout before fallback

// In-memory cache: cacheKey -> { points, distanceMeters, durationSeconds, timestamp }
const memoryCache = new Map();

/**
 * Creates a stable cache key by rounding coordinates to 4 decimals (~11m).
 */
export function buildRouteCacheKey(waypoints) {
  if (!Array.isArray(waypoints) || waypoints.length < 2) return '';
  return waypoints
    .map(p => `${Number(p.lat).toFixed(4)},${Number(p.lng).toFixed(4)}`)
    .join(';');
}

/**
 * Checks cache for a non-expired route.
 */
export function getCachedRoute(cacheKey) {
  if (!cacheKey) return null;
  const entry = memoryCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    memoryCache.delete(cacheKey);
    return null;
  }
  return entry;
}

/**
 * Stores a route in the cache.
 */
export function setCachedRoute(cacheKey, points, distanceMeters = null, durationSeconds = null) {
  if (!cacheKey || !Array.isArray(points)) return;
  memoryCache.set(cacheKey, {
    points,
    distanceMeters,
    durationSeconds,
    timestamp: Date.now(),
  });
}

/**
 * Fetches real road coordinates from OSRM driving service.
 * @param {Array<{lat: number, lng: number}>} waypoints - At least 2 waypoints in order.
 * @returns {Promise<{points: Array<{lat: number, lng: number}>, distanceMeters: number|null, durationSeconds: number|null, fromCache: boolean}>}
 */
export async function fetchRoadRoute(waypoints) {
  if (!Array.isArray(waypoints) || waypoints.length < 2) {
    return { points: waypoints || [], distanceMeters: null, durationSeconds: null, fromCache: false };
  }

  // Filter out invalid coordinates
  const validWaypoints = waypoints.filter(
    p => p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng))
  );
  if (validWaypoints.length < 2) {
    return { points: validWaypoints, distanceMeters: null, durationSeconds: null, fromCache: false };
  }

  const cacheKey = buildRouteCacheKey(validWaypoints);
  const cached = getCachedRoute(cacheKey);
  if (cached) {
    return {
      points: cached.points,
      distanceMeters: cached.distanceMeters,
      durationSeconds: cached.durationSeconds,
      fromCache: true,
    };
  }

  // Build OSRM query: {lng1},{lat1};{lng2},{lat2}...
  const coordsQuery = validWaypoints
    .map(p => `${p.lng},${p.lat}`)
    .join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coordsQuery}?overview=full&geometries=geojson`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);

    if (!res.ok) {
      throw new Error(`OSRM HTTP ${res.status}`);
    }

    const data = await res.json();
    if (data.code === 'Ok' && Array.isArray(data.routes) && data.routes.length > 0) {
      const bestRoute = data.routes[0];
      const rawCoords = bestRoute.geometry?.coordinates;

      if (Array.isArray(rawCoords) && rawCoords.length > 0) {
        // OSRM coordinates are in [longitude, latitude] GeoJSON format
        const roadPoints = rawCoords.map(coord => ({
          lat: coord[1],
          lng: coord[0],
        }));

        const distanceMeters = typeof bestRoute.distance === 'number' ? bestRoute.distance : null;
        const durationSeconds = typeof bestRoute.duration === 'number' ? bestRoute.duration : null;

        setCachedRoute(cacheKey, roadPoints, distanceMeters, durationSeconds);
        return {
          points: roadPoints,
          distanceMeters,
          durationSeconds,
          fromCache: false,
        };
      }
    }

    throw new Error('OSRM returned empty or invalid geometry');
  } catch {
    clearTimeout(timer);
    // Graceful fallback to direct waypoints on error or timeout
    return {
      points: validWaypoints,
      distanceMeters: null,
      durationSeconds: null,
      fromCache: false,
    };
  }
}
