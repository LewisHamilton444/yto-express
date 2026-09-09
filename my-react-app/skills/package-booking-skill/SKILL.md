---
name: package-booking-skill
description: Handles parcel creation, waybill generation, tracking number assignment, and bridge sync-parcel protocol for YTO Express Web App.
version: 1.0.0
verified-on: [vite]
---

# Package Booking Skill

## 0. Identity

- **Role:** Parcel Booking Module Router and Waybill Generator
- **Authority:** Tier-2 normative root skill for `skills/package-booking-skill/`.
- **Must not define:** Generating tracking numbers without `YTO2026` prefix; missing `podPhoto` flattening; bridge `sync-parcel` payload not matching web parcel schema.
- **Normative base:** `AGENTS2.md`; `src/components/ManageParcels.jsx`; `src/components/ProcessParcelInformation.jsx`.

## 1. Intent (9 Dimensions)

| # | Dimension | Value |
|---|-----------|-------|
| 1 | Task | Create/edit parcels from the admin side (`ProcessParcelInformation.jsx` → `POST /api/parcels`; `ManageParcels.jsx` for lifecycle management); Web-generated tracking numbers use the legacy `PKG-YYYYMMDD-#####` format, while mobile bookings arrive via bridge `POST /api/bridge/sync-parcel` with their own `YTO2026...` numbers. There is no `qrManifest` in this codebase. |
| 2 | Target Tool | Any React agent runtime: Cline, Copilot, Studio Bot, raw API. |
| 3 | Output Format | Structured readback with `trackingNumber`, `parcelId`, and creation path (`admin POST` vs `bridge sync`). |
| 4 | Constraints | Admin-created parcels go through `POST /api/parcels` with `accountCategory` derived server-side; weight must be > 0 when sent through bridge sync; `podPhoto` (Base64 JPEG data URL) is read-only on the Web (produced by the Android rider app). |
| 5 | Input | Sender details; receiver details; item, weight, value, origin, destination; status. |
| 6 | Context | Bridge `sync-parcel` upserts by `trackingNumber` (partial-update merge, tolerant of flat payloads); admin CRUD routes (`/api/parcels`) are category-filtered. |
| 7 | Audience | Admin staff; ManageParcels.jsx; ProcessParcelInformation.jsx; bridgeRoutes.js sync-parcel handler. |
| 8 | Success Criteria | Parcel created in MongoDB with the right `accountCategory`; bridge-synced parcels upsert cleanly; admin edits push `sendStatus` to Android + SSE `parcel-updated`. |
| 9 | Examples | Admin adds parcel → `PKG-20260909-48213` generated client-side → `POST /api/parcels`. Rider books on mobile → `YTO2026...` → bridge `sync-parcel` upsert → appears in ManageParcels. |

## 2. Trigger Matrix

| Scenario | Decision | Action |
|----------|----------|--------|
| Admin clicks add in ProcessParcelInformation | YES | Collect sender/receiver/item fields; generate `PKG-YYYYMMDD-#####` client-side; dispatch `POST /api/parcels`. |
| Admin edits parcel status in ManageParcels | YES | `PUT /api/parcels/:id` → server fires `BridgeClient.sendStatus` to Android + SSE `parcel-updated`. |
| Mobile rider/seller books a shipment | YES | Android backend pushes bridge `POST /api/bridge/sync-parcel` with its `YTO2026...` tracking number; Web upserts and broadcasts SSE `parcel-synced`. |
| Rider captures POD (Android-side) | YES | `podPhoto` Base64 JPEG arrives via bridge sync; Web renders it read-only. |
| Tracking number lookup | YES | `GET /api/parcels` (category-filtered) → client-side filter by `trackingNumber`; timeline from the parcel `events[]` array. |

## 3. Execution Workflow

### Step 1: Collect and Validate Parcel Form Data

- **Action:** Gather sender details (name, address, phone, email); receiver details (name, address, phone, email); parcel item description, weight (numeric), value (numeric); optional `podPhoto` Base64 data URL.
- **Input:** Form data from `ProcessParcelInformation.jsx` or `ManageParcels.jsx`; validation schema.
- **Stop Condition:** All required fields present and valid; ready for payload flattening.
- **Validation:** 
  - Sender/recipient names non-empty; 
  - Phone sanitized via `.replaceAll("[^0-9]", "")`; 
  - Weight > 0 and ≤ 50; 
  - Value ≥ 0; 
  - `podPhoto` if present must be valid Base64 JPEG data URL pattern `data:image/jpeg;base64,`.

### Step 2: Flatten Nested Sender/Recipient Payload

- **Action:** Transform nested `sender.name/address` → flat `parcel.senderName/senderAddress/origin`; transform `receiver.name/address` → flat `parcel.receiverName/receiverAddress/destination`.
- **Input:** Form sender/recipient objects; Data Mapping Summary from AGENTS2.md.
- **Stop Condition:** Payload matches web parcel schema: `senderName`, `senderAddress`, `receiverName`, `receiverDestination`, `origin`, `destination`.
- **Validation:** 
  - Flat fields populated; 
  - No nested objects remain; 
  - `origin` and `destination` are strings (not objects); 
  - Coordinates will be split later in Step 5.

### Step 3: Dispatch Admin Parcel Creation

- **Action:** `POST /api/parcels` with the form payload; server stamps `accountCategory` from the admin's realm.
- **Input:** Parcel payload from Step 2; JWT token in headers.
- **Stop Condition:** Backend responds `201 Created` with the saved parcel document.
- **Validation:** `201` response; `trackingNumber` matches the `PKG-YYYYMMDD-#####` client format; document persisted.

### Step 4: Tracking Display and Lookup

- **Action:** Display the parcel `trackingNumber`; GenerateTrackingInformation renders the timeline from the parcel `events[]` array.
- **Input:** `trackingNumber`; `events[]`.
- **Stop Condition:** Timeline rendered; tracking number searchable in ManageParcels.
- **Validation:** Events entries carry `time`, `event`, `location`, `status`.

### Step 5: Handle POD Photo (read-only on Web)

- **Action:** POD capture happens on Android only; the Web receives `podPhoto` (Base64 JPEG data URL) through bridge `sync-parcel` and renders it in parcel detail/confirmation views.
- **Input:** `podPhoto` from the synced Parcel document.
- **Stop Condition:** POD evidence displayed in the admin UI.
- **Validation:** Valid `data:image/jpeg;base64,` data URL; never synthesized client-side.

### Step 6: Update Web Parcel Document and Events

- **Action:** On admin status edits, `PUT /api/parcels/:id` returns the updated document; server pushes `BridgeClient.sendStatus` + SSE `parcel-updated`; views re-fetch.
- **Input:** Admin edit payload; tracking number.
- **Stop Condition:** Parcel card updated in `ManageParcels.jsx`; Android app receives the status via bridge.
- **Validation:** Status change visible in the parcel `events[]`; SSE `parcel-updated` broadcast observed.

## 4. Output Specification

```json
{
  "module": "package-booking-skill",
  "status": "parcel_created",
  "trackingNumber": "PKG-YYYYMMDD-##### (admin) | YTO2026... (bridge)",
  "parcelId": "MongoDB _id",
  "creationPath": "admin POST /api/parcels | bridge sync-parcel",
  "events": [{ "time": "ISO", "event": "Synced from mobile app", "location": "", "status": "Pending" }],
  "podPhoto": "Base64 JPEG data URL / null (read-only on Web)"
}
```

## 5. Validation Gate

- [ ] Form data validated: sender/recipient non-empty, phone sanitized, weight > 0, value ≥ 0
- [ ] Phone sanitized: `.replaceAll("[^0-9]", "")` 
- [ ] Admin path uses `POST /api/parcels`; mobile path uses bridge `POST /api/bridge/sync-parcel` (upsert by `trackingNumber`)
- [ ] Admin-generated tracking numbers match `PKG-YYYYMMDD-#####` (no `qrManifest` in this codebase)
- [ ] Parcel document carries an `events[]` timeline
- [ ] If `podPhoto` present: Base64 JPEG data URL valid (`data:image/jpeg;base64,`) and rendered read-only
- [ ] Admin status edits trigger `BridgeClient.sendStatus` + SSE `parcel-updated`

## 6. Anti-Triggers and Calibration

- **Over-execution:** Generating tracking number before form validation complete (causes duplicate IDs; backend errors).
- **Under-execution:** Skipping payload flattening → bridge `sync-parcel` rejects payload; parcel not created in MongoDB.
- **Calibration default:** Trigger only when all required fields valid AND `currentUser.role ∈ {SELLER, RIDER}` AND `currentUser.isDemo` flag evaluated.

## 7. Anti-Pattern Compliance

| Step | Prevents AP | Mechanism |
|------|-------------|-----------|
| 1 (Form Validation) | AP-1 (vague task verb) | Complete validation schema before any API dispatch; no partial sends. |
| 2 (Flattening) | AP-11 (forgotten context) | Data Mapping Summary always applied; context (sender/recipient) never dropped. |
| 3 (Bridge Dispatch) | AP-45 (no human review trigger) | User manually clicks "Book Shipment"; no auto-booking without explicit action. |
| 6 (Events Update) | AP-2 (two tasks in one prompt) | State update split into separate step; no routing logic embedded in booking flow. |

## 8. Versioning & Changelog

- **Version:** 1.0.0
- **Changelog:**
  - `1.0.0` (2026-09-01) — Initial creation; adapted from `agent-spec-main` framework; integrated with YTO Express AGENTS2.md rules.

## 9. Portability Matrix

| Runtime | Status | Notes |
|---------|--------|-------|
| Vite React | verified | Executed in current workspace; integrates with `ProcessParcelInformation.jsx`, `ManageParcels.jsx`, `bridgeRoutes.js`. |
| Node.js / Express backend | verified | `/api/parcels` CRUD + `/api/bridge/sync-parcel` upsert; `BridgeClient.sendStatus` outbound. |
| Claude Code | untested | |
| Cursor | untested | |
| Copilot | untested | |
| Windsurf | untested | |
| Kiro | untested | |
| Cline | untested | |

## 10. Examples

**Input:** "Admin adds a parcel: sender 'Juan Dela Cruz, 123 Main St, Manila', receiver 'Maria Santos, 456 Rizal Ave, Quezon City', item 'Documents', weight 2.5, value 1500."

**Output:** "Taking from this: admin parcel creation. Constraints: client-generated `PKG-YYYYMMDD-#####` tracking number; `POST /api/parcels`; server-side `accountCategory` stamping. Proceeding with form collection and dispatch."

**Failure case:** The agent tries to generate a `YTO2026...` number on the Web → wrong plane; `YTO2026...` numbers are minted by the Android backend and arrive via bridge `sync-parcel`.