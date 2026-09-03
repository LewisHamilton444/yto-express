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
| 1 | Task | Create new parcel shipment; generate `YTO2026` tracking number; flatten nested sender/recipient payloads; push to bridge `POST /api/bridge/sync-parcel`. |
| 2 | Target Tool | Any React agent runtime: Cline, Copilot, Studio Bot, raw API. |
| 3 | Output Format | Structured readback with `trackingNumber`, `parcelId`, `bridgeSyncStatus`, and `qrManifest` values. |
| 4 | Constraints | Tracking number format: `YTO2026-` + 5-digit sequence; sender/recipient flattening (nested → flat); `podPhoto` Base64 JPEG data URL included; Enterprise IDs dynamic: `YTO-SELL-2026-XXXXX` etc. |
| 5 | Input | Sender details (name, address, contact); Receiver details (name, address, contact); Parcel items, weight, value; optional `podPhoto` Base64 data URL. |
| 6 | Context | Bridge route `POST /api/bridge/sync-parcel` accepts flattened payload; returns `trackingNumber` and `qrManifest`; web parcel document updated with events array. |
| 7 | Audience | SellerDashboard; ManageParcels.jsx; ProcessParcelInformation.jsx; bridgeRoutes.js sync-parcel handler. |
| 8 | Success Criteria | Parcel created in MongoDB; `trackingNumber` generated; `qrManifest` generated; bridge sync successful; POD photo rendered in web admin confirmation modal. |
| 9 | Examples | Seller books shipment with sender/recipient details → `YTO2026-00123` tracking number → bridge sync → POD camera → web admin modal displays confirmation. |

## 2. Trigger Matrix

| Scenario | Decision | Action |
|----------|----------|--------|
| Seller clicks "Book Shipment" in SellerDashboard | YES | Collect sender/recipient details from form; flatten nested payload; dispatch `POST /api/bridge/sync-parcel`; generate tracking number; show confirmation. |
| User submits Parcel Information form | YES | Validate all required fields (sender, receiver, weight, item); flatten payload; dispatch bridge sync; generate QR manifest. |
| Rider captures POD photo delivery | YES | Encode camera photo as Base64 JPEG data URL; include in `podPhoto` field; dispatch `POST /api/bridge/sync-parcel` with updated payload. |
| Web admin modifies parcel status | YES | Push live in-app notifications and Android OS heads-up banners to mobile users via `POST /api/bridge/receive-status`. |
| Tracking number lookup by customer | YES | `POST /api/parcels/:id` GET → retrieve parcel; display timeline with events; show QR code from `qrManifest`. |

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

### Step 3: Dispatch Bridge sync-parcel Route

- **Action:** `POST /api/bridge/sync-parcel` with flattened payload; server generates `YTO2026` tracking number and `qrManifest`; returns new document with `events` array initialized.
- **Input:** Flattened parcel payload from Step 2; `currentUser.isDemo` flag; JWT token in headers.
- **Stop Condition:** Backend responds `200 OK` with `trackingNumber`, `qrManifest`, and updated parcel document.
- **Validation:** 
  - `200 OK` response; 
  - `trackingNumber` format `YTO2026-XXXXX`; 
  - `qrManifest` generated; 
  - Parcel document saved to MongoDB with `events: [{status: "Booked", timestamp, userId}]`.

### Step 4: Generate QR Manifest and Tracking Display

- **Action:** Display `trackingNumber` (`YTO2026-XXXXX`) to user; generate QR code from `qrManifest`; show in booking confirmation modal.
- **Input:** `trackingNumber` and `qrManifest` from bridge response.
- **Stop Condition:** QR code rendered; user can scan tracking number; confirmation modal visible.
- **Validation:** QR code scannable; tracking number matches `YTO2026-` format; modal displays all parcel details.

### Step 5: Handle POD Photo (if delivery in progress)

- **Action:** If delivery already in progress; rider captures POD photo; encode as Base64 JPEG data URL; include in `podPhoto` field; dispatch `POST /api/bridge/sync-parcel` with updated payload containing `podPhoto`.
- **Input:** Rider camera output; Base64 data URL from device camera; `trackingNumber` of in-progress parcel.
- **Stop Condition:** Photo encoded; bridge sync dispatched; `podPhoto` rendered in web admin confirmation modal.
- **Validation:** 
  - Base64 JPEG data URL valid; 
  - `podPhoto` stored in MongoDB `Parcel.podPhoto`; 
  - Web admin modal displays POD photo alongside digital signature.

### Step 6: Update Web Parcel Document and Events

- **Action:** Update local web parcel state with new tracking number; add event to `events` array; re-render `ManageParcels.jsx` with new shipment card.
- **Input:** Bridge response from Step 3; `trackingNumber`, `qrManifest`, `events` array.
- **Stop Condition:** Parcel card visible in `ManageParcels.jsx`; `events` array shows "Package Booking Confirmed"; QR code scannable.
- **Validation:** 
  - Parcel card rendered with correct `trackingNumber`; 
  - `events[0].status` = "Package Booking Confirmed"; 
  - Seller and Customer see status updates via `REFRESH_LOGISTICS` broadcast.

## 4. Output Specification

```json
{
  "module": "package-booking-skill",
  "status": "parcel_booked",
  "trackingNumber": "YTO2026-XXXXX",
  "parcelId": "MongoDB _id",
  "qrManifest": "base64 QR code data",
  "bridgeSyncStatus": "200 OK / error",
  "events": ["Package Booking Confirmed"],
  "podPhoto": "Base64 JPEG data URL / null"
}
```

## 5. Validation Gate

- [ ] Form data validated: sender/recipient non-empty, phone sanitized, weight 0-50, value ≥ 0
- [ ] Phone sanitized: `.replaceAll("[^0-9]", "")` 
- [ ] Payload flattened: nested → flat per Data Mapping Summary (sender/recipient objects → flat fields)
- [ ] `POST /api/bridge/sync-parcel` dispatched with correct payload
- [ ] Backend responds `200 OK` with `trackingNumber` format `YTO2026-XXXXX`
- [ ] `qrManifest` generated and QR code scannable
- [ ] Parcel document saved to MongoDB with `events: [{status: "Booked", timestamp, userId}]`
- [ ] If `podPhoto` present: Base64 JPEG data URL valid (`data:image/jpeg;base64,`)
- [ ] Local state updated: `trackingNumber`, `qrManifest`, `events` array
- [ ] `REFRESH_LOGISTICS` broadcast dispatched; fragments re-render

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
| Claude Code | untested | |
| Cursor | untested | |
| Copilot | untested | |
| Windsurf | untested | |
| Kiro | untested | |
| Cline | untested | |

## 10. Examples

**Input:** "Seller books shipment with sender: 'Juan Dela Cruz, 123 Main St, Manila', receiver: 'Maria Santos, 456 Rizal Ave, Quezon City', item: 'Documents', weight: 2.5, value: 1500."

**Output:** "Taking from this: parcel booking. Constraints: tracking number format `YTO2026-XXXXX`; payload flattening per Data Mapping Summary; bridge `sync-parcel` route. Proceeding with form collection and bridge dispatch."

**Failure case:** The user attempts to book without phone number → agent refuses: sanitize phone via `.replaceAll("[^0-9]", "")`; phone mandatory for bridge `sync-parcel` payload.