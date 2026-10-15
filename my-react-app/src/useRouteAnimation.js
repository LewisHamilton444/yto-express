import { useEffect, useRef } from 'react';

// Great-circle distance in kilometers.
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Compass bearing (0-360, 0 = north) from point a to point b.
function bearingDeg(a, b) {
  const toRad = (d) => d * Math.PI / 180;
  const toDeg = (r) => r * 180 / Math.PI;
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// ── useRouteAnimation ────────────────────────────────────────────────────
// Drives a rider smoothly along `route` (an array of {lat,lng} waypoints),
// frame by frame, calling `onUpdate({lat, lng, bearing, speedKmh, progress})`
// imperatively (via requestAnimationFrame) rather than through React state —
// so a Leaflet marker can be moved with marker.setLatLng() every frame
// without forcing a React re-render per tick, which is what actually keeps
// the motion smooth.
//
// When the rider reaches the end of the route it reverses direction and
// heads back the way it came (a continuous back-and-forth "commute" so the
// map always shows live activity, per requirement), rather than teleporting
// back to the start.
//
// `speedKmh` is the label-facing speed (what you'd show in a "Moving • 35
// km/h" tooltip). `simSpeedMultiplier` separately controls how fast the
// on-screen marker actually travels, since a real 30 km/h over tens of real
// `speedKmh` is the reported courier speed (e.g. 35 km/h).
// `simSpeedMultiplier` scales visualization pace to a calm, observable speed (default 18x).
// When the courier reaches the destination, it holds at the destination stop (does NOT reverse).
export function useRouteAnimation(route, { speedKmh = 30, simSpeedMultiplier = 18, startProgress = 0, loop = false } = {}, onUpdate) {
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);

  useEffect(() => {
    if (!route || route.length < 2) return undefined;

    const segments = [];
    let totalDistKm = 0;
    for (let i = 0; i < route.length - 1; i++) {
      const a = route[i], b = route[i + 1];
      const dist = haversineKm(a.lat, a.lng, b.lat, b.lng);
      totalDistKm += dist;
      segments.push({ a, b, distKm: dist, bearing: bearingDeg(a, b) });
    }

    let segmentIndex = 0;
    let segmentProgress = 0;

    // Initialize progress along route based on courier's active delivery progress
    const clampedStart = Math.max(0, Math.min(0.98, Number(startProgress) || 0));
    if (clampedStart > 0 && totalDistKm > 0) {
      const targetDist = clampedStart * totalDistKm;
      let accum = 0;
      for (let i = 0; i < segments.length; i++) {
        if (accum + segments[i].distKm >= targetDist) {
          segmentIndex = i;
          segmentProgress = segments[i].distKm > 0 ? (targetDist - accum) / segments[i].distKm : 0;
          break;
        }
        accum += segments[i].distKm;
      }
    }

    let lastTs = null;
    let rafId = null;
    let completed = false;

    const tick = (ts) => {
      if (lastTs == null) lastTs = ts;
      const dtSec = Math.min((ts - lastTs) / 1000, 0.1); // Cap step delta to prevent jumps
      lastTs = ts;

      const seg = segments[segmentIndex];
      if (seg && seg.distKm > 0 && !completed) {
        const kmPerSec = (speedKmh * simSpeedMultiplier) / 3600;
        segmentProgress += (kmPerSec * dtSec) / seg.distKm;

        if (segmentProgress >= 1) {
          if (segmentIndex < segments.length - 1) {
            segmentIndex += 1;
            segmentProgress = 0;
          } else {
            segmentProgress = 1;
            if (loop) {
              segmentIndex = 0;
              segmentProgress = 0;
            } else {
              completed = true; // Hold at destination point
            }
          }
        }
      }

      const current = segments[segmentIndex];
      if (current) {
        const lat = current.a.lat + (current.b.lat - current.a.lat) * segmentProgress;
        const lng = current.a.lng + (current.b.lng - current.a.lng) * segmentProgress;
        const bearing = current.bearing;
        onUpdateRef.current?.({ lat, lng, bearing, speedKmh, progress: segmentProgress, isArrived: completed });
      }

      if (!completed || loop) {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => { if (rafId) cancelAnimationFrame(rafId); };
  }, [route, speedKmh, simSpeedMultiplier, startProgress, loop]);
}
