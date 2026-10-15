// ============================================================================
// App parcel events -> Web parcel events (D-15, 2026-10-12)
// ----------------------------------------------------------------------------
// The app's timeline entry is {status, description, location, timestamp}; the
// portal's Parcel.events entry — and the shape the parcel drawer's Timeline
// component renders — is {status, event, location, time}. Before this mapper,
// sync-parcel carried the app's events straight through on create and dropped
// them entirely on update, so a doorstep arrival the rider recorded in the app
// never appeared on the admin parcel timeline.
//
// Rules, mirroring utils/deliveryAttempts.js:
//   - malformed rows are skipped, never guessed at;
//   - an absent/empty list maps to [] so the caller can tell "nothing to merge"
//     from "erase what you have" (it must always mean the former);
//   - the mapper is pure, so it is cheap to call on every sync.
// ============================================================================

const MAX_EVENT_TEXT = 300;

function pickText(...candidates) {
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, MAX_EVENT_TEXT);
  }
  return '';
}

/**
 * Translate one app timeline row into the portal's event shape.
 * Returns null when the row carries no usable content.
 */
function mapAppEventToWeb(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const event = pickText(raw.event, raw.description);
  const time = raw.time || raw.timestamp;
  if (!event || !time) return null;

  const parsed = new Date(time);
  if (Number.isNaN(parsed.getTime())) return null;

  return {
    time: parsed.toISOString(),
    event,
    location: pickText(raw.location),
    status: pickText(raw.status),
  };
}

/**
 * Translate a whole list, dropping anything unusable.
 * @returns {Array<{time: string, event: string, location: string, status: string}>}
 */
function mapAppEventsToWeb(list) {
  if (!Array.isArray(list)) return [];
  return list.map(mapAppEventToWeb).filter(Boolean);
}

/**
 * Append incoming events to the ones a parcel already holds, keeping the
 * existing history and never duplicating a row both sides already have.
 * Append-only, like the attempt ledger: the timeline is history, not state.
 */
function mergeEvents(existing, incoming) {
  const current = Array.isArray(existing) ? existing.slice() : [];
  const seen = new Set(current.map((e) => `${e && e.time}|${e && e.event}`));
  const added = [];

  for (const event of incoming) {
    const key = `${event.time}|${event.event}`;
    if (seen.has(key)) continue;
    seen.add(key);
    current.push(event);
    added.push(event);
  }

  // Oldest first, so the drawer renders the timeline in the order it happened
  // even when a push arrives slightly out of order.
  current.sort((a, b) => new Date(a.time) - new Date(b.time));
  return { events: current, added };
}

module.exports = {
  mapAppEventToWeb,
  mapAppEventsToWeb,
  mergeEvents,
  MAX_EVENT_TEXT,
};
