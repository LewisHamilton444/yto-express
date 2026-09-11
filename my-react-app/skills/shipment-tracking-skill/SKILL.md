---
name: shipment-tracking-skill
description: Admin-side parcel tracking, 5-stage progress timeline, hub receiving, parcel-location ledger, and SSE live updates for YTO Express Web App.
version: 1.0.0
verified-on: [vite]
---

# Shipment Tracking Skill (Web Admin)

## 0. Identity

- **Role:** Admin-side tracking and monitoring router - renders the parcel progress timeline, monitors in-flight parcels, and maintains the parcel-location ledger.
- **Authority:** Tier-2 normative root skill for `skills/shipment-tracking-skill/`.
- **Must not define:** Inventing statuses outside the shared parcel-status vocabulary; hardcoding a stage count that diverges from `ParcelProgressTimeline.jsx`; treating a `Returned`/`Failed` parcel as timeline-progressed; writing tracking rows without `trackingNumber`.
- **Normative base:** `AGENTS2.md`; `src/ParcelProgressTimeline.jsx`; `src/MonitorParcel.jsx`; `src/ManageParcelLocation.jsx`; `src/GenerateTrackingInformation.jsx`.

## 1. Intent (9 Dimensions)

| # | Dimension | Value |
|---|-----------|-------|
| 1 | Task | Render the 5-stage progress timeline for a parcel, monitor in-flight parcels, maintain the parcel-location ledger, and surface live bridge updates without a page reload. |
| 2 | Target Tool | Any React agent runtime: Cline, Copilot, Studio Bot, raw API. |
| 3 | Output Format | Timeline stage render + status badge + events[] timeline + SSE subscription contract. |
| 4 | Constraints | Stages are exactly `Picked Up` -> `Arrived at Hub` -> `In Transit` -> `Out for Delivery` -> `Delivered`; `Failed` / `Returned` / `Return to Sender` resolve to the exception path (stage `-1`), never to a happy-path stage; no emojis. |
| 5 | Input | `parcel.status`, `parcel.events[]` (each with `event` / `status`), `trackingNumber`, optional `podPhoto`. |
| 6 | Context | `ParcelProgressTimeline.jsx` prefers real per-parcel `events[]` history and only falls back to the coarse `status` field when no event matches a stage keyword. |
| 7 | Audience | Admin staff; MonitorParcel.jsx; ManageParcelLocation.jsx; GenerateTrackingInformation.jsx. |
| 8 | Success Criteria | Timeline lands on the correct stage from `events[]`; exception parcels render the alert banner instead of a stage; badge colors match `PARCEL_STATUS_COLORS`; SSE `parcel-synced` / `parcel-updated` refresh the view. |
| 9 | Examples | See section 10. |

## 2. Trigger Matrix

| Scenario | Decision | Action |
|----------|----------|--------|
| Admin opens MonitorParcel for an in-flight parcel | YES | Resolve stage via `events[]` keyword scan, then render `ParcelProgressTimeline` + `StatusBadge`. |
| Parcel has `Returned` / `Failed` / `Return to Sender` status | YES | Short-circuit to the exception path (stage `-1`) and render the `AlertTriangle` banner with `"left the standard delivery path"`. |
| Parcel `events[]` is empty or unmatched | YES | Fall back to the coarse `status` field alone (`deliver` -> 4, `out for delivery` -> 3, `transit` -> 2, `hub` -> 1, `picked`/`pending` -> 0). |
| Hub marks a parcel received | YES | `HubParcelReceiving.jsx` writes `Received at Hub` / `Returned to Hub` plus an appended `events[]` entry with `location: 'Hub'`. |
| Admin edits parcel location | YES | `ManageParcelLocation.jsx` -> `POST` / `PUT /api/parcel-locations`. |
| Bridge pushes a parcel change from mobile | YES | SSE event -> subscriber refresh; the Web never polls for parcel status while SSE is connected. |

## 3. Execution Workflow

### Step 1: Load the Parcel Record

- **Action:** Fetch the parcel via `GET /api/parcels` (category-filtered) and select the record by `trackingNumber` or `_id`.
- **Input:** Parcel list; admin category filter (`REAL` / `DEMO`).
- **Stop Condition:** Record resolved; `trackingNumber` and `status` present.
- **Validation:** Response is an array; non-array responses degrade to an empty list, never a crash.

### Step 2: Resolve the Timeline Stage

- **Action:** Scan `parcel.events[]` for the highest matching stage keyword; if none match, fall back to the coarse `status` field.
- **Input:** `parcel.status`; `parcel.events[]`.
- **Stop Condition:** A stage index is returned (0-4, or -1 for the exception path).
- **Validation:**
  - Exception check runs first: `failed`, `returned`, `return to sender` -> `-1`.
  - Event text is the concatenation of `event` + `status`, lowercased.
  - Fallback order is strict: `deliver` (4) -> `out for delivery` (3) -> `transit` (2) -> `hub` (1) -> `picked`/`pending` (0).

### Step 3: Render the Timeline and Badge

- **Action:** Render the 5 stages with the resolved index highlighted; render the shared `StatusBadge` using `PARCEL_STATUS_COLORS`.
- **Input:** Resolved stage index; parcel status.
- **Stop Condition:** Stages rendered; exception parcels render the alert banner instead of stage progress.
- **Validation:** Badge keys are exactly `Pending`, `Picked Up`, `In Transit`, `Out for Delivery`, `Delivered`, `Returned`, `Failed`. Hub-only `Received at Hub` / `Returned to Hub` come from the local `HUB_STATUS_COLORS` extension in `HubParcelReceiving.jsx`.

### Step 4: Subscribe to Live Updates

- **Action:** Subscribe with `useSSE()` to bridge events; refresh the parcel view on parcel-related events.
- **Input:** SSE connection (`GET /api/events/stream`), polling fallback.
- **Stop Condition:** Subscription active; cleanup unsubscribes on unmount.
- **Validation:** Polling is only the fallback after repeated SSE failures - it is not the primary transport.

### Step 5: Maintain the Location Ledger

- **Action:** Create/update parcel-location rows via `POST` / `PUT /api/parcel-locations`; delete stale rows via `DELETE /api/parcel-locations/:id`.
- **Input:** Parcel reference, location label, timestamps.
- **Stop Condition:** Ledger row persisted and reflected in the list.
- **Validation:** Row always references an existing parcel; no orphan location rows.

## 4. Output Specification

- **Stage constants:** `['Picked Up', 'Arrived at Hub', 'In Transit', 'Out for Delivery', 'Delivered']` - the single source of truth lives in `ParcelProgressTimeline.jsx`.
- **Exception sentinel:** stage `-1` means the parcel left the standard delivery path.
- **Status badge palette:**

| Status | Background | Foreground |
|--------|-----------|------------|
| Pending | `#f3f4f6` | `#374151` |
| Picked Up | `#ede9fe` | `#4c1d95` |
| In Transit | `#e0f2fe` | `#075985` |
| Out for Delivery | `#fef3c7` | `#92400e` |
| Delivered | `#d1fae5` | `#065f46` |
| Returned | `#f3f4f6` | `#6b7280` |
| Failed | `#fee2e2` | `#991b1b` |

- **Hub extension:** `Received at Hub` (`#d1fae5` / `#065f46`), `Returned to Hub` (`#fee2e2` / `#991b1b`).

## 5. Validation Gate

- [ ] Timeline stage count is exactly 5 and matches `ParcelProgressTimeline.jsx` `STAGES`
- [ ] Exception statuses resolve to `-1` and never render as happy-path progress
- [ ] `events[]` keyword scan runs before the coarse-status fallback
- [ ] Fallback order is strict: `deliver` -> `out for delivery` -> `transit` -> `hub` -> `picked`/`pending`
- [ ] Badge colors come from `PARCEL_STATUS_COLORS`, never inline hex
- [ ] Hub-only statuses come from the `HUB_STATUS_COLORS` extension, not the shared map
- [ ] SSE is the primary transport; polling is the documented fallback only
- [ ] Parcel-location rows never orphan their parcel
- [ ] No emojis in timeline, banner, or badge text

## 6. Anti-Triggers and Calibration

- Do NOT invent a sixth stage - the timeline is fixed at 5.
- Do NOT render a `Failed` or `Returned` parcel as partially progressed; it is an exception, not a stage.
- Do NOT skip the `events[]` scan in favour of the coarse `status` field - the events array is the more accurate source.
- Do NOT add new status colors inline; extend the shared map instead.
- Do NOT poll for parcel status while SSE is connected.
- Do NOT write a parcel-location row for a parcel that does not exist.

## 7. Anti-Pattern Compliance

| Step | Prevents AP | Mechanism |
|------|-------------|-----------|
| 1 (Load) | AP-1 (vague task) | Record resolved by `trackingNumber` or `_id` before any render |
| 2 (Stage) | AP-2 (two tasks in one prompt) | Stage resolution and rendering are separate steps |
| 3 (Render) | AP-11 (forgotten context) | Shared badge map reused, so status vocabulary cannot drift |
| 4 (Live) | AP-29 (ambiguous verb) | SSE is primary, polling is explicitly the fallback |
| 5 (Ledger) | AP-45 (no human review trigger) | Ledger writes are explicit CRUD calls, never implicit side effects |

## 8. Versioning & Changelog

- **Version:** 1.0.0
- **Changelog:**
  - `1.0.0` (2026-09-11) - Initial Web Admin port; 5-stage timeline, exception path, hub status extension, SSE subscription, parcel-location ledger.

## 9. Portability Matrix

| Runtime | Status | Notes |
|---------|--------|-------|
| Vite 7 + React | verified | `vite build` green; `npx eslint .` 0 errors, 0 warnings |
| EventSource (SSE) | verified | `GET /api/events/stream`, polling fallback in `useSSE.js` |
| Express 5 backend | verified | `/api/parcels`, `/api/parcel-locations`, `/api/bridge/*` |
| Android bridge | verified | `sync-parcel`, `sync-location`, `receive-status` |

## 10. Examples

**Input:** "Show tracking for `YTO20260911001`, events: `Picked Up` -> `Arrived at Hub` -> `In Transit`."

**Output:**
1. Parcel loaded via `GET /api/parcels`.
2. Stage scan matches `In Transit` -> index 2.
3. Timeline renders stages 0-2 highlighted, stages 3-4 pending.
4. `StatusBadge` renders `In Transit` with `#e0f2fe` / `#075985`.
5. SSE subscription refreshes the row when the bridge pushes the next status.

**Failure case:** Parcel status is `Returned` with no matching stage keyword. Stage resolution short-circuits to `-1` and the view renders the `AlertTriangle` exception banner reading `"Returned - this parcel left the standard delivery path."` instead of a partially-filled timeline.