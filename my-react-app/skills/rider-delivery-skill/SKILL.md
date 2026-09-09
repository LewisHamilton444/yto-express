---
name: rider-delivery-skill
description: Handles delivery workflow, status slider, POD capture, and geofence-gated completion for YTO Express Web App.
version: 1.0.0
verified-on: [vite]
---

# Rider Delivery Skill

## 0. Identity

- **Role:** Delivery Workflow Manager and Status Slider Controller
- **Authority:** Tier-2 normative root skill for `skills/rider-delivery-skill/`.
- **Must not define:** Allowing status slider below 75% threshold; skipping geofence check before POD; numeric payment amounts displayed for rider role.
- **Normative base:** `AGENTS2.md`; `src/MonitorRiderStatus.jsx`; `src/ManageParcels.jsx`; `server/Server.js` parcel status routes. NOTE: the status slider (75% threshold), POD camera gate, 2.2s success dialog, and payment masking are **Android-side mechanics** (`DeliveryDetailsActivity` in the mobile repo); the Web only observes and administers statuses.

## 1. Intent (9 Dimensions)

| # | Dimension | Value |
|---|-----------|-------|
| 1 | Task | Administer rider delivery lifecycles on the Web: monitor rider statuses (`MonitorRiderStatus.jsx`), administer parcel statuses (`ManageParcels.jsx` → `PUT /api/parcels/:id` → `BridgeClient.sendStatus` → Android), and observe POD evidence. The 75% slider, POD camera gate, and payment masking live on Android. |
| 2 | Target Tool | Any React agent runtime: Cline, Copilot, Studio Bot, raw API. |
| 3 | Output Format | Structured readback with `status`, `riderCount`, `adminUpdateResult`, and SSE/bridge outcomes. |
| 4 | Constraints | Web-side status vocabulary: `Pending / Picked Up / In Transit / Out for Delivery / Delivered / Returned / Failed`; admin edits fire SSE `parcel-updated` + outbound bridge `sendStatus`; `podPhoto` is read-only on the Web. |
| 5 | Input | Rider/parcel records from `/api/riders` + `/api/parcels`; admin status edit payloads; SSE events. |
| 6 | Context | `MonitorRiderStatus` normalizes riders via `normalizeRider` (`sellerRiderData.js`) with demo-fixture fallbacks gated on `currentUser.isDemo`; map markers consume bridge GPS. |
| 7 | Audience | Admin dispatcher; MonitorRiderStatus; ManageParcels; hub staff. |
| 8 | Success | Rider dashboard reflects live statuses; admin status updates propagate to the Android app via the bridge; POD evidence renders where present. |
| 9 | Examples | Admin sets a parcel to "Delivered" → `PUT /api/parcels/:id` → Android receives `sendStatus` → rider app shows the receipt tab. |

## 2. Trigger Matrix

| Scenario | Decision | Action |
|----------|----------|--------|
| Rider adjusts status slider | YES | Compute `rawDeltaX`; clamp `Math.max(0, Math.min(rawDeltaX, width - thumb - 8))`; check ≥ 75% of total width; if pass → update status; if fail → revert. |
| Shipment status is `"Pending"` | NO | Suppress `riderMarker` and motion animators; only show Pickup Origin + Pulilan HUB marker; no geofence check. |
| Shipment status is `"Out for Delivery"` or `"To receive"` | YES | Compute geofence (100m Haversine); if passes → authorize POD camera; if fails → show "Not within delivery zone" alert. |
| Rider role payment amount display | NO | Mask payment amounts as `"PREPAID"` or `"COD"` only; numeric amounts strictly hidden for rider role; customer/seller view full unmasked details. |
| Demo account (`isDemo === true`) | YES | Auto-unlock instant camera testing; bypass geofence distance check; payment still masked as `"PREPAID"` or `"COD"`. |

## 3. Execution Workflow

### Step 1: Load Rider + Parcel Data (Web observation)

- **Action:** Fetch `/api/riders` and `/api/parcels`; normalize riders via `normalizeRider`; gate demo fixtures on `currentUser.isDemo`.
- **Input:** JWT via `apiFetch`; `currentUser.isDemo`.
- **Stop Condition:** Rider dashboard populated with live (or demo-fallback) data.
- **Validation:** Non-array responses guarded; demo fallbacks only when `isDemo === true`.

### Step 2: Administer Parcel Status (Web-side lifecycle)

- **Action:** Admin status edits dispatch `PUT /api/parcels/:id`; the server fires `BridgeClient.sendStatus(trackingNumber, status)` to the Android backend and broadcasts SSE `parcel-updated`.
- **Input:** `parcelId`; new status (Web vocabulary: `Pending / Picked Up / In Transit / Out for Delivery / Delivered / Returned / Failed`).
- **Stop Condition:** Status persisted; bridge + SSE dispatched; views re-fetch.
- **Validation:** `200 OK` with the updated document; Android app observes the transition via its bridge receiver.

### Step 3: Observe Rider Terminal Transitions (Android-side execution)

- **Action:** The 75% slider, 100m geofence POD gate, and 2.2s success dialog execute in the Android `DeliveryDetailsActivity`; the Web receives their outcomes via bridge `receive-status` → parcel update → SSE.
- **Input:** Bridge payloads; SSE events.
- **Stop Condition:** Web reflects the terminal status and any `podPhoto` evidence.
- **Validation:** POD `podPhoto` (Base64 JPEG) rendered read-only; never synthesized on the Web.

### Step 4: Payment Masking (Android-side display rule)

- **Action:** Payment masking (`"PREPAID"`/`"COD"` for riders, full amounts for customer/seller) is applied on the Android side (`RiderMaskUtils`); the Web admin sees administrative fields only and does not re-render masked rider UI.
- **Input:** Rider-masked bridge payloads where applicable.
- **Stop Condition:** Web views show parcel logistics fields without leaking rider-masked payment data into rider-facing contexts.

## 4. Output Specification

```json
{
  "module": "rider-delivery-skill",
  "status": "delivery_managed",
  "parcelStatus": "Pending|Picked Up|In Transit|Out for Delivery|Delivered|Returned|Failed",
  "adminUpdateResult": "200 OK / error",
  "bridgeDispatched": true/false,
  "sseBroadcast": "parcel-updated",
  "podPhotoPresent": true/false
}
```

## 5. Validation Gate

- [ ] Web-side status edits use `PUT /api/parcels/:id` with the Web status vocabulary
- [ ] Admin status changes trigger `BridgeClient.sendStatus` + SSE `parcel-updated`
- [ ] Demo fixtures in MonitorRiderStatus gated on `currentUser.isDemo`
- [ ] POD `podPhoto` rendered read-only (capture, slider, geofence, success dialog are Android-side)
- [ ] No payment amounts invented or displayed in rider-facing Web contexts

## 6. Anti-Triggers and Calibration

- **Over-execution:** Implementing the slider/geofence/POD mechanics in the Web app — they belong to Android; the Web observes.
- **Under-execution:** Skipping the bridge dispatch check after admin status edits → Android stays stale.
- **Calibration default:** Admin edits trigger `PUT /api/parcels/:id`; rider-side transitions arrive only via bridge/SSE.

## 7. Anti-Pattern Compliance

| Step | Prevents AP | Mechanism |
|------|-------------|-----------|
| 1 (Slider Clamp) | AP-1 (vague task verb) | Exact formula `Math.max(0, Math.min(rawDeltaX, width - thumb - 8))`; no approximation. |
| 2 (Threshold) | AP-29 (ambiguous verb) | Fixed 75% constant; no variable thresholds; deterministic check. |
| 4 (Geofence) | AP-11 (forgotten context) | `isDemo` flag always checked; geofence distance computed only when needed. |
| 6 (Payment Masking) | AP-2 (two tasks in one prompt) | Payment masking split into separate display step; no amount calculation embedded in slider. |

## 8. Versioning & Changelog

- **Version:** 1.0.0
- **Changelog:**
  - `1.0.0` (2026-09-01) — Initial creation; adapted from `agent-spec-main` framework; integrated with YTO Express AGENTS2.md rules.

## 9. Portability Matrix

| Runtime | Status | Notes |
|---------|--------|-------|
| Vite React | verified | Executed in current workspace; integrates with `MonitorRiderStatus.jsx`, `ManageParcels.jsx`, `sellerRiderData.js`, `Server.js` parcel routes. |
| Claude Code | untested | |
| Cursor | untested | |
| Copilot | untested | |
| Windsurf | untested | |
| Kiro | untested | |
| Cline | untested | |

## 10. Examples

**Input:** "Admin marks an 'Out for Delivery' parcel as Delivered from ManageParcels."

**Output:** "Taking from this: admin status update. Constraints: `PUT /api/parcels/:id`; server fires `BridgeClient.sendStatus` + SSE `parcel-updated`; rider app receives the transition via bridge. Proceeding with admin update."

**Failure case:** The agent tries to implement the 75% slider or POD camera in the Web app → out of scope; those mechanics live in Android `DeliveryDetailsActivity`. Refuse: observe via bridge/SSE only.