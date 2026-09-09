---
name: geofence-delivery-skill
description: Handles GPS geofencing, 100m destination checks, and POD unlock for YTO Express Web App.
version: 1.0.0
verified-on: [vite]
---

# Geofence Delivery Skill

## 0. Identity

- **Role:** GPS Geofence enforcer and POD gatekeeper
- **Authority:** Tier-2 normative root skill for `skills/geofence-delivery-skill/`.
- **Must not define:** Bypassing geofence check for real accounts; POD unlock without 100m Haversine distance validation.
- **Normative base:** `AGENTS2.md`; `src/components/LiveRiderMap.jsx` (hub geofence circles via `hubGeofenceData.js`); `src/MonitorParcel.jsx` (geofence status view). NOTE: there is no `src/utils/locationUtils.js` in the current tree.

## 1. Intent (9 Dimensions)

| # | Dimension | Value |
|---|-----------|-------|
| 1 | Task | Render and monitor hub geofences on the Leaflet map (`LiveRiderMap`), surface geofence state in `MonitorParcel`, and keep hub markers/layers consistent with rider positions. The 100m POD geofence gate itself executes on the Android side; the Web observes its outcomes via bridge/SSE. |
| 2 | Target Tool | Any React agent runtime: Cline, Copilot, Studio Bot, raw API. |
| 3 | Output Format | Structured readback with `mapInitialized`, `geofenceLayers`, `hubCount`, and `parcelGeofenceStatus`. |
| 4 | Constraints | Hub geofences render as Leaflet circles (`radius: hub.geofenceRadius * 1000`); toggleable via the layers control; `hubGeofenceData.js` is the canonical hub registry. |
| 5 | Input | Rider GPS coordinates from bridge `sync-location`; hub registry (`hubGeofenceData.js`); layer visibility state. |
| 6 | Context | Web Admin is an observation plane — geofence enforcement/POD gating happens on mobile; Web renders hubs, rider markers, and geofence status columns. |
| 7 | Audience | Admin dispatcher; LiveRiderMap; MonitorParcel; hub intake staff. |
| 8 | Success Criteria | Hub circles render with correct radius/status; selected-hub highlight works without disturbing other layers; geofence and parcel statuses visible. |
| 9 | Examples | Hub `PN12` Pulilan renders a circle at `(14.9085, 120.8545)` with its configured km radius; toggling the geofence layer adds/removes circles without re-creating the map. |

## 2. Trigger Matrix

| Scenario | Decision | Action |
|----------|----------|--------|
| Map mounts in `LiveRiderMap` / `MonitorParcel` | YES | Build the base Leaflet map + hub geofence circles ONCE; rider markers are separate layer objects. |
| User toggles the geofences layer | YES | Add/remove hub circles + markers based on `layers.geofences` without re-initializing the map. |
| User selects a hub | YES | Highlight that hub's circle only; leave all other layers untouched. |
| Bridge `sync-location` delivers rider GPS | YES | Update rider marker position; geofence status derivation stays on the Android/POD side. |
| Parcel status changes to Delivered/Returned/Failed | YES | Exclude from the active-watch list in `MonitorParcel`. |

## 3. Execution Workflow

### Step 1: Determine Account Type

- **Action:** Check `currentUser.isDemo`; set `geofenceMode` to `strict` (real) or `demo` (demo).
- **Input:** `currentUser.isDemo` flag from authentication state.
- **Stop Condition:** `geofenceMode` determined; strict or demo path selected.

### Step 2: Calculate Haversine Distance (Real Accounts Only)

- **Action:** Compute distance using Haversine formula between rider GPS `(lat, lng)` and destination `(destLat, destLng)`.
- **Input:** Rider coordinates from GPS telemetry; destination coordinates from parcel data.
- **Stop Condition:** Distance in meters calculated; compared against 100m threshold.

### Step 3: Apply Geofence Threshold

- **Action:** If `geofenceMode == "strict"` AND `distance >= 100` → deny POD, show error. If `geofenceMode == "strict"` AND `distance < 100` → unlock POD. If `geofenceMode == "demo"` → auto-unlock regardless of distance.
- **Input:** Distance from Step 2; `geofenceMode` from Step 1.
- **Stop Condition:** Geofence decision made; POD authorized or denied.

### Step 4: Suppress Rider Marker (Pending Status Isolation)

- **Action:** When shipment status is `"Pending"`: suppress `riderMarker` and motion animators; only show Pickup Origin + Pulilan HUB marker.
- **Input:** Shipment status from parcel data; `geofenceMode` from Step 1.
- **Stop Condition:** Marker visibility adjusted; only essential markers displayed.

### Step 5: Observe POD Outcomes

- **Action:** POD capture itself happens on Android (camera → Base64 JPEG → `PUT /api/shipments/:id/status` → bridge `receive-status`). The Web receives the result via bridge sync/SSE and renders `podPhoto` in parcel detail views.
- **Input:** Bridge status payloads; `podPhoto` Base64 data URL on the Parcel document.
- **Stop Condition:** Web admin displays the delivered status and POD evidence.

## 4. Output Specification

```json
{
  "module": "geofence-delivery-skill",
  "status": "geofence_checked",
  "distanceMeters": number,
  "geofenceStatus": "passed|denied|auto_unlocked",
  "podAuthorized": boolean,
  "riderMarkerSuppressed": boolean,
  "nextAction": "capture_pod|show_error|auto_proceed"
}
```

## 5. Validation Gate

- [ ] Base map + hub geofence circles built once (no re-initialization on layer toggles)
- [ ] Hub circles use `hub.geofenceRadius * 1000` meters from `hubGeofenceData.js`
- [ ] Layer toggle (`layers.geofences`) adds/removes circles + markers only
- [ ] Selected-hub highlight does not disturb other layers
- [ ] POD `podPhoto` (Base64 JPEG) rendered only as received from bridge sync — never synthesized on the Web
- [ ] Delivered/Returned/Failed parcels excluded from the active geofence watch list

## 6. Anti-Triggers and Calibration

- **Over-execution:** Calculating geofence distance before checking `isDemo` flag (demo accounts should auto-unlock).
- **Under-execution:** Skipping Haversine formula → using simple Euclidean distance causes false positives/negatives on map projections.
- **Calibration default:** 100m threshold hardcoded; adjustable only via backend config update.

## 7. Anti-Pattern Compliance

| Step | Prevents AP | Mechanism |
|------|-------------|-----------|
| 1 (Account Type) | AP-11 (forgotten context) | `isDemo` evaluated before any distance calculation; context never silently dropped. |
| 2 (Haversine Distance) | AP-1 (vague task verb) | Explicit Haversine formula applied; distance unit consistently meters. |
| 3 (Geofence Threshold) | AP-29 (ambiguous verb) | Deterministic 100m threshold; no guessing based on approximate values. |
| 4 (Marker Suppression) | AP-2 (two tasks in one prompt) | Marker visibility adjusted as separate step after geofence decision; authentication completed first. |
| 5 (POD Capture) | AP-45 (no human review trigger) | Camera only enabled after geofence pass; user must manually capture POD photo. |

## 8. Versioning & Changelog

- **Version:** 1.0.0
- **Changelog:**
  - `1.0.0` (2026-09-01) — Initial creation; adapted from `agent-spec-main` framework; integrated with YTO Express AGENTS2.md rules.

## 9. Portability Matrix

| Runtime | Status | Notes |
|---------|--------|-------|
| Vite React | verified | Executed in current workspace; integrates with `LiveRiderMap.jsx`, `MonitorParcel.jsx`, `hubGeofenceData.js`. |
| Claude Code | untested | |
| Cursor | untested | |
| Copilot | untested | |
| Windsurf | untested | |
| Kiro | untested | |
| Cline | untested | |

## 10. Examples

**Input:** "Admin opens MonitorParcel and expects hub geofences with rider positions."

**Output:** "Taking from this: geofence observation view. Constraints: hub circles from `hubGeofenceData.js` with correct radii; rider markers from bridge GPS; POD gating remains Android-side. Proceeding with map render."

**Failure case:** Agent tries to implement the 100m POD gate in the Web app → out of scope; the Web observes outcomes via bridge/SSE. Refuse: enforce/observe separation — enforcement lives on Android.