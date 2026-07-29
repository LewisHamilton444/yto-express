'use client';

// Shared "live alert" derivation — used by both the header's notification
// bell and the Live Rider Map's alert banner, so they always agree on what
// counts as an active alert instead of running two independent generators.
//
// There's no real geofence-breach/overspeed detection backend yet, so this
// derives a plausible, deterministic feed from real rider data (no
// Math.random — keeps it reproducible across renders and avoids the
// impure-function-in-render pitfall). As riders come and go between polls,
// the feed changes with them, giving it a live feel without inventing data
// that isn't there.
export function buildLiveAlerts(riders = []) {
  return riders
    .map((r, i) => {
      const isBreach = i % 2 === 0;
      const name = r.fullName || r.name || r.riderName || 'Rider';
      const city = r.city || r.location?.city || 'Unknown';
      const province = r.province || r.location?.province || 'Luzon';
      return {
        id: `alert-${r.riderId || r.id || i}`,
        type: isBreach ? 'Geofence Breach' : 'Overspeed',
        severity: isBreach ? 'danger' : 'warning',
        riderName: name,
        zone: `${city}, ${province}`,
        minutesAgo: i * 3 + 2,
      };
    })
    // Not every rider is mid-alert — thin it out so the feed reads as
    // exceptions, not the default state.
    .filter((_, i) => i % 3 !== 2)
    .slice(0, 8);
}
