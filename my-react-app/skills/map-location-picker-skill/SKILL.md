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
| 1 | Task | Dynamically inject Leaflet map; resolve addresses to lat/lng; apply deterministic pin offset for anti-overlap. |
| 2 | Target Tool | Any React agent runtime: Cline, Copilot, Studio Bot, raw API. |
| 3 | Output Format | Structured readback with `mapInitialized`, `coordinates`, `pinTag`, and `antiOverlapOffset`. |
| 4 | Constraints | Anti-overlap offset: `isPickup ? -0.008 : +0.008` deterministic hash; case-insensitive `LOCATION_MAP` dictionary fallback; GPS coords bypass fuzzy geocoder. |
| 5 | Input | Raw address string; `isPickup` boolean flag; explicit GPS coordinates intent extras. |
| 6 | Context | Initialize map in `LiveRiderMap.jsx`, `MonitorRiderStatus.jsx`, `MonitorParcel.jsx`; render marker tags with correct icons/colors. |
| 7 | Audience | Active user; map container components; delivery tracking; hub location assignment. |
| 8 | Success Criteria | Map injected with `id='yto-map'`; coordinates resolved; pin rendered with correct tag color and anti-overlap offset; city resolved via `LOCATION_MAP` fallback. |
| 9 | Examples | `"Pulilan, Bulacan"` → resolved to `(14.9085, 120.8545)` with `-0.008` offset (Pickup). `"Manila, PH"` → resolved to `(14.6031, 120.9769)` with `+0.008` offset (Destination). |

## 2. Trigger Matrix

| Scenario | Decision | Action |
|----------|----------|--------|
| Component mounts with `rawAddress` prop | YES | Call `resolveAddressToLatLng(rawAddress, isPickup)`; inject Leaflet map if not present. |
| GPS coordinates intent extras present (`PICKUP_LAT`/`DELIVERY_LAT`) | YES | Bypass fuzzy geocoder entirely; use explicit coordinates; inject map with those coords. |
| Map already injected in ancestor component | YES | Skip re-injection; only resolve and update pin position if coords changed. |
| User clears search field | YES | Remove marker; reset map view to default Luzon hub view; show placeholder text. |
| Map tile load fails | YES | Retry with exponential backoff (2s, 4s, 8s max 3 attempts); fall back to static placeholder. |

## 3. Execution Workflow

### Step 1: Check for GPS Intent Extras

- **Action:** If `PICKUP_LAT`/`DELIVERY_LAT` intent extras present, bypass fuzzy geocoder; use explicit coordinates.
- **Input:** Intent extras from routing navigation; `isPickup` boolean.
- **Stop Condition:** Explicit coordinates obtained; skip to Step 4.

### Step 2: Fuzzy City Resolution (Dictionary Fallback)

- **Action:** Perform case-insensitive lookup in `LOCATION_MAP` dictionary; if found, use stored coordinates.
- **Input:** `rawAddress` string; `LOCATION_MAP` from `luzonCityCoords.js`.
- **Stop Condition:** City found in dictionary; coordinates resolved.

### Step 3: Dynamic Geocoding (Fallback if Not in Dictionary)

- **Action:** If not in `LOCATION_MAP`, invoke dynamic geocoder API (`/api/geocode?address=${rawAddress}`); store result in cache.
- **Input:** `rawAddress`; API response with `lat`, `lng`.
- **Stop Condition:** Coordinates resolved from geocoder API.

### Step 4: Apply Anti-Overlap Pin Offset

- **Action:** Determine `pinOffset`: `isPickup ? -0.008 : +0.008`; apply deterministic hash offset to resolved coordinates.
- **Input:** `isPickup` boolean; resolved `lat`, `lng`.
- **Stop Condition:** Offset applied; final coordinates `finalLat`, `finalLng` calculated.

### Step 5: Inject Leaflet Map and Render Pin

- **Action:** If map not already present, inject via `leafletLoader.js`; render marker with correct tag color/icon; apply `finalLat`, `finalLng` as pin position.
- **Input:** `finalLat`, `finalLng`; `pinTag` determination (`HUB`, `PICKUP`, `RIDER`, `DESTINATION`); tag color from `AGENTS2.md` specs.
- **Stop Condition:** Map initialized; pin rendered at correct position with anti-overlap offset.

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

- [ ] `rawAddress` provided and non-empty before geocoding
- [ ] `isPickup` boolean flag present and validated
- [ ] `LOCATION_MAP` dictionary lookup is case-insensitive
- [ ] Anti-overlap offset exactly `isPickup ? -0.008 : +0.008` (no other values)
- [ ] GPS intent extras bypass fuzzy geocoder entirely (no dictionary lookup)
- [ ] Map injected with `id='yto-map'` and `leafletLoader.js`
- [ ] Pin tag color matches `AGENTS2.md` specs: HUB/DESTINATION orange, PURPLE for PICKUP, BLUE for RIDER
- [ ] Info window content matches tag: `HUB` → `"MAIN SORTING HUB"`, `PICKUP` → `"PICKUP ORIGIN"`, etc.

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
| Vite React | verified | Executed in current workspace; integrates with `leafletLoader.js`, `luzonCityCoords.js`, `LiveRiderMap.jsx`. |
| Claude Code | untested | |
| Cursor | untested | |
| Copilot | untested | |
| Windsurf | untested | |
| Kiro | untested | |
| Cline | untested | |

## 10. Examples

**Input:** "User selects `'Pulilan, Bulacan'` as pickup address on parcel booking form."

**Output:** "Taking from this: map location resolution for pickup address. Constraints: case-insensitive LOCATION_MAP lookup; anti-overlap offset -0.008; pin tag HUB with violet color. Resolved to (14.9085, 120.8545) with offset applied. Proceeding with map injection."

**Failure case:** User selects unknown city not in `LOCATION_MAP` and no GPS extras → geocoder API called; if API fails, map shows placeholder with instruction to enter valid Luzon city or provide GPS coordinates.