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
- **Normative base:** `AGENTS2.md`; `src/components/LiveRiderMap.jsx`; `src/utils/locationUtils.js`.

## 1. Intent (9 Dimensions)

| # | Dimension | Value |
|---|-----------|-------|
| 1 | Task | Enforce 100m GPS geofence before authorizing delivery completion; gate POD camera capture. |
| 2 | Target Tool | Any React agent runtime: Cline, Copilot, Studio Bot, raw API. |
| 3 | Output Format | Structured readback with `distanceMeters`, `geofenceStatus`, `podAuthorized`, and `riderMarkerSuppressed`. |
| 4 | Constraints | Real accounts: strict 100m Haversine check via `FusedLocationProviderClient` equivalent. Demo accounts: auto-unlock instant camera testing. |
| 5 | Input | Rider GPS coordinates (`latitude`, `longitude`); delivery destination coordinates; `accountCategory` (`REAL` | `DEMO`). |
| 6 | Context | Isolate `riderMarker` and motion animators when shipment is `"Pending"`; only show Pickup Origin + HUB marker. |
| 7 | Audience | Active rider; `DeliveryDetailsActivity`; `RiderDashboardFragment`; POD capture workflow. |
| 8 | Success Criteria | Geofence distance < 100m → POD camera unlocked; distance ≥ 100m → error alert `"Distance too far"`; `"SHIPMENT CANCELLED"` for failed. |
| 9 | Examples | Rider at `(14.9085, 120.8545)` → distance 0m → POD unlock instant. Rider 150m away → geofence denied; `"SWIPE TO RETRY DELIVERY"` (`#FFC107` Amber). |

## 2. Trigger Matrix

| Scenario | Decision | Action |
|----------|----------|--------|
| Shipment status is `"Pending"` | YES | Suppress `riderMarker` and motion animators; only show Pickup Origin + Pulilan HUB marker. |
| Real account (`isDemo == false`) | YES | Calculate Haversine distance between rider GPS and delivery destination; check < 100m. |
| Demo account (`isDemo == true`) | YES | Auto-unlock POD camera instantly; no geofence distance check. |
| Distance ≥ 100m for real account | YES | Show `"Distance too far"` error; disable POD capture; optionally `"SWIPE TO RETRY DELIVERY"` (`#FFC107` Amber). |
| Distance < 100m for real account | YES | Unlock POD camera; enable photo capture; after capture, transition status to `Delivered`. |

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

### Step 5: Capture POD and Transition Status

- **Action:** After geofence passes (or demo auto-unlock): enable camera; capture photo as Base64 JPEG data URL; store in `Parcel.podPhoto`; transition status to `Delivered`.
- **Input:** Captured photo data; `trackingNumber`; `podPhoto` Base64 data URL.
- **Stop Condition:** POD photo stored; status updated to `Delivered`; `REFRESH_LOGISTICS` broadcast emitted.

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

- [ ] `currentUser.isDemo` flag checked before geofence logic
- [ ] Haversine formula used for distance calculation (not Euclidean)
- [ ] 100m threshold strict for real accounts; automatic pass for demo accounts
- [ ] When shipment `"Pending"`: `riderMarker` suppressed, only HUB + Pickup markers shown
- [ ] POD photo stored as Base64 JPEG data URL in `Parcel.podPhoto`
- [ ] Status transition to `Delivered` only after POD capture
- [ ] `REFRESH_LOGISTICS` broadcast emitted after status update
- [ ] Error message `"Distance too far"` shown when `distance >= 100m`
- [ ] `"SWIPE TO RETRY DELIVERY"` Amber (#FFC107) shown on geofence deny

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
| Vite React | verified | Executed in current workspace; integrates with `LiveRiderMap.jsx`, `DeliveryDetailsActivity`, `locationUtils.js`. |
| Claude Code | untested | |
| Cursor | untested | |
| Copilot | untested | |
| Windsurf | untested | |
| Kiro | untested | |
| Cline | untested | |

## 10. Examples

**Input:** "Rider at latitude 14.9090, longitude 120.8550 attempts delivery to destination at 14.9085, 120.8545."

**Output:** "Taking from this: geofence check for delivery POD. Constraints: 100m Haversine threshold for real accounts; auto-unlock for demo. Distance calculated ~50m → POD authorized. Proceeding with geofence check."

**Failure case:** Rider 200m away from destination for real account → geofence denied; `"Distance too far"` error shown; `"SWIPE TO RETRY DELIVERY"` (`#FFC107` Amber) displayed; POD camera locked.