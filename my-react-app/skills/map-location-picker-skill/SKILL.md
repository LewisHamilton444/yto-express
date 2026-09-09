---
name: map-location-picker-skill
description: Handles Leaflet map integration, location search, and coordinate formatting for YTO Express Web App.
version: 1.0.0
verified-on: [vite]
---

# Map Location Picker Skill

## 0. Identity

- **Role:** Leaflet map injector and location resolver
- **Authority:** Tier-2 normative root skill for `skills/map-location-picker-skill/`.
- **Must not define:** Missing `locateControl`; unbound event listeners causing map memory leaks; incorrect coordinate format.
- **Normative base:** `AGENTS2.md`; `src/utils/leafletLoader.js`; `src/utils/luzonCityCoords.js`.

## 1. Intent (9 Dimensions)

| # | Dimension | Value |
|---|-----------|-------|
| 1 | Task | Dynamically inject the Leaflet map (`leafletLoader.js`); resolve city strings to coordinates via the `CITY_COORDS` dictionary (`luzonCityCoords.js`, case-insensitive keying handled by callers) with `LUZON_FALLBACK_COORDS` as the safe default; render typed markers with vehicle glyphs. |
| 2 | Target Tool | Any React agent runtime: Cline, Copilot, Studio Bot, raw API. |
| 3 | Output Format | Structured readback with `mapInitialized`, `coordinates`, `markerType`, and `fallbackUsed`. |
| 4 | Constraints | City resolution is dictionary-based (`resolveCityCoords(city)` → null when unknown → Manila fallback) — there is **no `/api/geocode` endpoint** on the Web backend and no external geocoder call; `isPickup` anti-overlap offsets (±0.008) are an Android-side contract, not a Web one. |
| 5 | Input | City/address strings from parcel or rider records; rider GPS where available; layer visibility state. |
| 6 | Context | Initialize map in `LiveRiderMap.jsx`, `MonitorRiderStatus.jsx`, `MonitorParcel.jsx`; render markers with `vehicleIcons` glyphs for Leaflet. |
| 7 | Audience | Active user; map container components; delivery tracking; hub location assignment. |
| 8 | Success Criteria | Map injected once; coordinates resolved via `CITY_COORDS` (or fallback); markers rendered with correct glyph/type. |
| 9 | Examples | `"Pulilan"` → `(14.9085, 120.8545)` from `CITY_COORDS`. Unknown city → `LUZON_FALLBACK_COORDS` `(14.5995, 120.9842)`. |

## 2. Trigger Matrix

| Scenario | Decision | Action |
|----------|----------|--------|
| Component mounts with a city/address string | YES | Look up `resolveCityCoords(city)` from `luzonCityCoords.js`; inject Leaflet map if not present. |
| Rider GPS coordinates available from bridge sync | YES | Use explicit coordinates; skip dictionary resolution. |
| City not found in `CITY_COORDS` | YES | Fall back to `LUZON_FALLBACK_COORDS` (Manila) — no external geocoder call. |
| Map already injected | YES | Skip re-injection; only update marker positions when coords changed. |
| Map tile load fails | YES | Retry with backoff; fall back to static placeholder per `leafletLoader.js` behavior. |

## 3. Execution Workflow

### Step 1: Check for Explicit Coordinates

- **Action:** If rider/parcel GPS coordinates are available (bridge `sync-location`, parcel records), use them directly.
- **Input:** GPS coordinates from live data.
- **Stop Condition:** Explicit coordinates obtained; skip to Step 4.

### Step 2: City Dictionary Resolution

- **Action:** Perform lookup via `resolveCityCoords(city)` against `CITY_COORDS` in `luzonCityCoords.js`.
- **Input:** City string from parcel/rider record.
- **Stop Condition:** City found in dictionary; coordinates resolved.

### Step 3: Fallback Coordinates (No Geocoder Endpoint)

- **Action:** If the city is not in `CITY_COORDS`, use `LUZON_FALLBACK_COORDS` — there is no `/api/geocode` route on this backend; do not invent one.
- **Input:** Unresolved city string.
- **Stop Condition:** Fallback coordinates applied; flag the record for data cleanup if precision matters.

### Step 4: Apply Marker Type Styling

- **Action:** Determine marker type (`HUB`, `RIDER`, or parcel watch-list entry); select the correct `vehicleIcons` glyph / `vehicleTypeLabel` for Leaflet markers.
- **Input:** Marker record; `VehicleIcon` component; `vehicleGlyphSvg` data-URI.
- **Stop Condition:** Icon set chosen for the marker.

### Step 5: Inject Leaflet Map and Render Marker

- **Action:** If map not already present, inject via `leafletLoader.js`; render marker at resolved coordinates with the chosen glyph.
- **Input:** Resolved `lat`, `lng`; marker type.
- **Stop Condition:** Map initialized; marker rendered at correct position.

### Step 6: Handle Map Interactions

- **Action:** Attach click listener to pin → open info window with tag-specific content; enable drag-to-reposition if needed.
- **Input:** Map click event; pin `tag` identifier.
- **Stop Condition:** Info window opened with correct content; pin draggable if enabled.

## 4. Output Specification

```json
{
  "module": "map-location-picker-skill",
  "status": "map_initialized",
  "coordinates": {"lat": number, "lng": number},
  "antiOverlapOffset": number,
  "pinTag": "HUB|PICKUP|RIDER|DESTINATION",
  "mapInitialized": boolean
}
```

## 5. Validation Gate

- [ ] City string provided before resolution
- [ ] Explicit GPS coordinates (when present) bypass the `CITY_COORDS` dictionary entirely
- [ ] Dictionary miss falls back to `LUZON_FALLBACK_COORDS` — never an external geocoder call
- [ ] Map injected once via `leafletLoader.js` (no duplicate containers)
- [ ] Markers use `vehicleIcons` glyphs; hub markers carry their hub identity
- [ ] Anti-overlap ±0.008 offsets are NOT applied on the Web (Android-side contract)

## 6. Anti-Triggers and Calibration

- **Over-execution:** Running geocoder API when GPS coordinates already present in intent extras (bypass is mandatory).
- **Under-execution:** Forgetting anti-overlap offset → Pickup (Violet `#390955`) and Destination (Orange `#F37021`) markers overlap.
- **Calibration default:** Offset magnitude `0.008` degrees ≈ 1km at equator; deterministic sign based on `isPickup`.

## 7. Anti-Pattern Compliance

| Step | Prevents AP | Mechanism |
|------|-------------|-----------|
| 1 (GPS Check) | AP-1 (vague task verb) | Explicit GPS coord check before any other resolution step. |
| 2 (Dictionary Lookup) | AP-11 (forgotten context) | `LOCATION_MAP` lookup performed; context of `isPickup` preserved for offset. |
| 3 (Geocoder API) | AP-29 (ambiguous verb) | Dictionary tried first; API only as fallback; no guessing which path to take. |
| 4 (Offset Application) | AP-2 (two tasks in one prompt) | Offset application separate from map injection; coordinates resolved first. |
| 5 (Pin Rendering) | AP-45 (no human review trigger) | Pin color/icon deterministic from tag; no user-driven color selection. |

## 8. Versioning & Changelog

- **Version:** 1.0.0
- **Changelog:**
  - `1.0.0` (2026-09-01) — Initial creation; adapted from `agent-spec-main` framework; integrated with YTO Express AGENTS2.md rules.

## 9. Portability Matrix

| Runtime | Status | Notes |
|---------|--------|-------|
| Vite React | verified | Executed in current workspace; integrates with `leafletLoader.js`, `luzonCityCoords.js`, `LiveRiderMap.jsx`, `MonitorParcel.jsx`. |
| Claude Code | untested | |
| Cursor | untested | |
| Copilot | untested | |
| Windsurf | untested | |
| Kiro | untested | |
| Cline | untested | |

## 10. Examples

**Input:** "Render a rider marker for a parcel originating in `'Pulilan'`."

**Output:** "Taking from this: map marker placement. Constraints: `resolveCityCoords('Pulilan')` → `(14.9085, 120.8545)`; inject map via `leafletLoader.js`; rider glyph from `vehicleIcons`. Proceeding with map injection."

**Failure case:** Unknown city not in `CITY_COORDS` and no GPS → use `LUZON_FALLBACK_COORDS` (Manila). Do NOT call a geocoder endpoint — none exists on the Web backend.