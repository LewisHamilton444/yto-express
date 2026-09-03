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
- **Normative base:** `AGENTS2.md`; `src/components/MonitorRiderStatus.jsx`; `src/components/DeliveryDetailsActivity.jsx` (web analogue).

## 1. Intent (9 Dimensions)

| # | Dimension | Value |
|---|-----------|-------|
| 1 | Task | Manage delivery status slider (75% threshold); authorize POD capture after geofence check; mask payment amounts as `"PREPAID"` or `"COD"` only for rider role. |
| 2 | Target Tool | Any React agent runtime: Cline, Copilot, Studio Bot, raw API. |
| 3 | Output Format | Structured readback with `status`, `sliderDeltaX`, `thresholdPassed`, `podAuthorized`, and `paymentMasked` values. |
| 4 | Constraints | Status slider: 75% threshold detection; clamp `Math.max(0, Math.min(rawDeltaX, width - thumb - 8))`; 160ms snap-in + 240ms completion animation; payment masking: `"PREPAID"` or `"COD"` only. |
| 5 | Input | Raw slider deltaX; shipment status; `isDemo` flag; rider GPS coordinates; delivery address. |
| 6 | Context | When shipment is `"Pending"`: suppress rider marker and motion animators; only show Pickup Origin + Pulilan HUB marker; geofence 100m before POD unlock. |
| 7 | Audience | MyTasksFragment; RiderStatusFragment; DeliveryDetailsActivity (web); ManageParcelLocation.jsx. |
| 8 | Success Status Slider: 75% threshold passed → shipment status updates; POD authorized → camera captures photo; Payment masked → `"PREPAID"` or `"COD"` only. |
| 9 | Examples | Rider slides status to "Out for Delivery" → 75% threshold passed → status updates to "Out for Delivery" → POD camera unlocks (if within geofence). |

## 2. Trigger Matrix

| Scenario | Decision | Action |
|----------|----------|--------|
| Rider adjusts status slider | YES | Compute `rawDeltaX`; clamp `Math.max(0, Math.min(rawDeltaX, width - thumb - 8))`; check ≥ 75% of total width; if pass → update status; if fail → revert. |
| Shipment status is `"Pending"` | NO | Suppress `riderMarker` and motion animators; only show Pickup Origin + Pulilan HUB marker; no geofence check. |
| Shipment status is `"Out for Delivery"` or `"To receive"` | YES | Compute geofence (100m Haversine); if passes → authorize POD camera; if fails → show "Not within delivery zone" alert. |
| Rider role payment amount display | NO | Mask payment amounts as `"PREPAID"` or `"COD"` only; numeric amounts strictly hidden for rider role; customer/seller view full unmasked details. |
| Demo account (`isDemo === true`) | YES | Auto-unlock instant camera testing; bypass geofence distance check; payment still masked as `"PREPAID"` or `"COD"`. |

## 3. Execution Workflow

### Step 1: Handle Status Slider Input

- **Action:** Receive `rawDeltaX` from slider drag; compute clamped value `clampedX = Math.max(0, Math.min(rawDeltaX, width - thumb - 8))`; calculate percentage `percent = (clampedX / (width - thumb - 8)) * 100`.
- **Input:** `rawDeltaX` from slider event; `width` of slider container; `thumb` diameter.
- **Stop Condition:** `clampedX` calculated; `percent` computed; ready for threshold check.
- **Validation:** `clampedX ≥ 0`; `clampedX ≤ width - thumb - 8`; `percent` in range 0-100.

### Step 2: Apply 75% Threshold Detection

- **Action:** If `percent ≥ 75`: update shipment status to next state (e.g., `Pending` → `Out for Delivery`; `Out for Delivery` → `Delivered`); dispatch `POST /api/bridge/receive-status` with new status; show success feedback.
- **Input:** `percent` from Step 1; `currentShipmentStatus`; `trackingNumber`.
- **Stop Condition:** Status updated in MongoDB; `POST /api/bridge/receive-status` dispatched; success feedback shown.
- **Validation:** `percent ≥ 75`; backend responds `200 OK` with updated status; `REFRESH_LOGISTICS` broadcast dispatched; fragments re-render with new status.

### Step 3: Clamp and Snap-in Animation

- **Action:** If `percent < 75`: revert to previous state; apply 160ms snap-in animation; display "Swipe further to confirm" transient message.
- **Input:** `percent < 75`; previous status from state.
- **Stop Condition:** Animation runs; status reverts; message dismissed after 160ms.
- **Validation:** 160ms snap-in animation plays; status reverts to previous value; no database write.

### Step 4: Authorize POD Capture (Geofence Check)

- **Action:** If status updated to `"Out for Delivery"` or `"To receive"`: compute Haversine distance to delivery address; if ≤ 100m: authorize POD camera unlock; if > 100m: show alert "You are not within the delivery zone (distance: X m)".
- **Input:** Rider GPS coordinates; delivery destination lat/lng; `isDemo` flag.
- **Stop Condition:** Geofence result (`pass`/`fail`); POD camera authorized or denied.
- **Validation:** 
  - `pass` if distance ≤ 100m; 
  - `fail` if distance > 100m; 
  - Demo bypass: auto-authorize if `isDemo === true`; `[DEMO MODE]` banner visible.

### Step 5: Capture Proof of Delivery (POD)

- **Action:** If geofence passes: prompt rider to capture camera photo; encode as Base64 JPEG data URL; include in `podPhoto` field; dispatch `POST /api/bridge/sync-parcel` with updated payload.
- **Input:** Camera output; `trackingNumber`; Base64 data URL from device.
- **Stop Condition:** Photo encoded; bridge sync dispatched; `podPhoto` stored in MongoDB; rendered in web admin confirmation modal.
- **Validation:** 
  - Base64 JPEG data URL valid; 
  - `podPhoto` stored in `Parcel.podPhoto`; 
  - Web admin modal displays POD photo alongside digital signature.

### Step 6: Mask Payment Amounts for Rider Role

- **Action:** If `currentUser.role === "RIDER"`: display payment status as `"PREPAID"` or `"COD"` only; numeric amounts strictly hidden; never show raw currency value.
- **Input:** Payment amount from shipment document; `currentUser.role`.
- **Stop Condition:** Payment masked; UI displays `"PREPAID"` or `"COD"`; no numeric value visible.
- **Validation:** 
  - `currentUser.role === "RIDER"` → payment = `"PREPAID"` or `"COD"`; 
  - `currentUser.role === "SELLER"` or `"CUSTOMER"` → payment = full unmasked value; 
  - No numeric amounts visible in rider UI.

### Step 7: Handle Delivery Completion and Auto-Dismiss

- **Action:** After POD captured and bridge sync successful: 2.2s success dialog (`dialog_yto_delivery_success`) — 3-stage morphing checkmark & card expansion → auto-dismiss at 2.2s; return to RiderDashboardFragment.
- **Input:** Completion data from bridge; `trackingNumber`.
- **Stop Condition:** Dialog shown; auto-dismiss after 2200ms; user returns to dashboard.
- **Validation:** Dialog morphs through 3 stages; auto-dismiss at exactly 2.2s; focus returns to `RiderDashboardFragment`.

## 4. Output Specification

```json
{
  "module": "rider-delivery-skill",
  "status": "delivery_managed",
  "shipmentStatus": "Pending|To Pay|To Ship|In Transit|Delivered|Returns|Cancelled",
  "sliderPercent": "number (0-100)",
  "thresholdPassed": true/false,
  "geofencePassed": true/false,
  "paymentMasked": true/false,
  "paymentDisplay": "\"PREPAID\"|\"COD\"|numeric value",
  "podAuthorized": true/false,
  "successDialog": true/false
}
```

## 5. Validation Gate

- [ ] Slider clamped: `Math.max(0, Math.min(rawDeltaX, width - thumb - 8))`
- [ ] 75% threshold: `percent ≥ 75` triggers status update; `< 75` reverts
- [ ] 160ms snap-in animation on revert; 240ms completion animation on pass
- [ ] Geofence: 100m Haversine distance check before POD unlock (real accounts)
- [ ] Demo bypass: auto-authorize POD if `isDemo === true`; `[DEMO MODE]` banner
- [ ] Payment masking: `currentUser.role === "RIDER"` → `"PREPAID"` or `"COD"` only; numeric hidden
- [ ] Full payment visible: `currentUser.role !== "RIDER"` → numeric amounts unmasked
- [ ] POD capture: Base64 JPEG data URL; bridge `sync-parcel` dispatched
- [ ] 2.2s success dialog: 3-stage morphing checkmark & card expansion → auto-dismiss at 2.2s
- [ ] Return to RiderDashboardFragment after completion

## 6. Anti-Triggers and Calibration

- **Over-execution:** Updating shipment status before 75% threshold passed (causes invalid state transitions; database errors).
- **Under-execution:** Skipping geofence check → POD unlocked outside delivery zone; GPS integrity issues.
- **Calibration default:** Trigger status update only when `percent ≥ 75` AND `currentShipmentStatus` ∈ `{"Pending", "To Pay", "To Ship"}` AND `isDemo` flag evaluated.

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
| Vite React | verified | Executed in current workspace; integrates with `MonitorRiderStatus.jsx`, `DeliveryDetailsActivity` (web analogue), `DeliveryDetailsActivity` mobile bridge. |
| Claude Code | untested | |
| Cursor | untested | |
| Copilot | untested | |
| Windsurf | untested | |
| Kiro | untested | |
| Cline | untested | |

## 10. Examples

**Input:** "Rider slides status slider to 85% on 'Out for Delivery' shipment; is real account (isDemo: false); within 100m geofence."

**Output:** "Taking from this: rider delivery workflow. Constraints: 75% threshold; geofence 100m; payment masked for rider role. Proceeding with slider clamping and geofence check."

**Failure case:** The user attempts geofence check for Pending status shipment → agent refuses: suppress riderMarker and motion animators; only show Pickup Origin + Pulilan HUB marker. No geofence distance computed.