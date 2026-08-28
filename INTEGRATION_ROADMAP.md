# INTEGRATION_ROADMAP.md — YTO Express Cross-Platform Integration Plan

> **Goal**: Fully integrate the Android mobile app (`yto_express_backend`) with the React web admin panel (`my-react-app/server/`) so both systems share authentication, parcel data, status updates, and real-time sync — while operating on **separate MongoDB databases**.

---

## 1. Current State Analysis

### Android Backend (`yto_express_backend/`)

| Component | Implementation |
|---|---|
| **User Model** | Single `User` collection (customer/seller/rider/admin) with bcrypt password hashing |
| **Auth** | JWT tokens, OTP verification (email/SMS), phone number login, Gmail dotless fallback |
| **Parcels** | `Shipment` model with nested `sender`/`recipient` objects, GeoJSON coordinates |
| **Tracking** | Auto-generated IDs (`YTO{timestamp}{random}`), 12+ status enum |
| **Real-time** | 2.5s polling via `YTOCrossDeviceService`, system OS notifications |

### React Web Backend (`my-react-app/server/`)

| Component | Implementation |
|---|---|
| **Users** | `Account` (admin only, plain text passwords) + `Seller` + `Rider` + `Customer` (separate collections) |
| **Auth** | Plain text password comparison, no JWT, no OTP |
| **Parcels** | `Parcel` model with flat `senderName`/`receiverName`, no coordinates |
| **Tracking** | Enterprise IDs (`YTO-SELL-YYYY-XXXXX`), simple status string |
| **Dashboard** | REST API aggregates over Parcel/Rider/Seller collections |

### Existing Bridge (`bridgeRoutes.js`)

| Endpoint | Direction | What It Does |
|---|---|---|
| `POST /api/bridge/sync-user` | Android → Web | Transforms `User` → `Seller`/`Rider`/`Customer` by role |
| `POST /api/bridge/sync-parcel` | Android → Web | Flattens nested `Shipment` → `Parcel` |
| `POST /api/bridge/sync-location` | Android → Web | Converts GeoJSON coords → `ParcelLocation` lat/lng strings |

---

## 2. Critical Gaps

| # | Gap | Severity | Impact |
|---|---|---|---|
| 1 | **No shared authentication** | Critical | Android uses bcrypt+JWT, Web uses plain text. Same credentials don't work on both. |
| 2 | **One-way sync only** | Critical | Bridge pushes Android→Web. Web admin actions (approve/reject/toggle) don't sync back. |
| 3 | **Password incompatibility** | Critical | Android hashes with bcrypt, Web compares plain text. |
| 4 | **Status granularity mismatch** | High | Android has 12+ statuses, Web has ~3. Status updates lose detail. |
| 5 | **No real-time sync** | High | Web has no polling/WebSocket. Admin sees stale data. |
| 6 | **Missing Customer display** | Medium | Bridge creates Customer records but Web dashboard doesn't show them. |
| 7 | **No admin→mobile notification** | Medium | Web admin approval/rejection doesn't notify mobile users. |

---

## 3. Integration Phases

### PHASE 1: Authentication Unification

**Goal**: A seller/rider registered on mobile can log into the web admin panel with the same credentials.

| Step | File | Change | Verification |
|---|---|---|---|
| 1.1 | `server/models/Account.js` | Add bcrypt pre-save hook + compare method | Passwords hashed on save |
| 1.2 | `server/Server.js` `/api/accounts/login` | Return JWT token on successful login | Token contains `{ id, email, role }` |
| 1.3 | `server/Server.js` | Add `/api/accounts/register` with OTP verification flow | Register → OTP → Verify → Login works |
| 1.4 | `src/services/api.js` | Store JWT in `localStorage`, add `Authorization: Bearer` header to `apiFetch` | All API calls authenticated |
| 1.5 | `server/bridgeRoutes.js` `sync-user` | When syncing seller/rider, also create `Account` record with bcrypt-hashed password | Mobile user can log into web |
| 1.6 | Manual test | Register seller on mobile → login to web with same email+password | Credentials work on both |

**Acceptance Criteria**:
- [ ] Mobile-registered seller logs into web panel successfully
- [ ] Web-created admin account works independently
- [ ] JWT tokens expire after configured TTL
- [ ] Password changes on mobile sync to web Account collection

---

### PHASE 2: Bidirectional Data Sync

**Goal**: Actions on either platform reflect on the other within seconds.

| Step | File | Change | Verification |
|---|---|---|---|
| 2.1 | `bridgeRoutes.js` | Add `POST /api/bridge/sync-user-from-web` (web admin creates/approves seller/rider) | Web-created seller appears in Android via polling |
| 2.2 | `bridgeRoutes.js` | Add `POST /api/bridge/sync-parcel-from-web` (web admin creates parcel) | Web-created parcel syncs to Android Shipment collection |
| 2.3 | `bridgeRoutes.js` | Add `POST /api/bridge/sync-status` (web admin updates parcel status) | Status change on web → Android reflects it |
| 2.4 | `bridgeRoutes.js` | Add `POST /api/bridge/sync-approval` (web admin approves/rejects seller/rider) | Approval status syncs to mobile User model |
| 2.5 | Android `YTOCrossDeviceService.java` | Add bridge endpoint polling for status changes from web | Mobile picks up web-initiated changes |
| 2.6 | Manual test | Web admin approves seller → mobile seller sees "Active" status | |

**Acceptance Criteria**:
- [ ] Web admin creating a parcel syncs to Android Shipment collection
- [ ] Web admin changing parcel status syncs to Android
- [ ] Web admin approving a seller syncs to Android User status
- [ ] Android status changes sync to web Parcel collection
- [ ] No duplicate records on re-sync (upsert by email/trackingId)

---

### PHASE 3: Parcel Status Harmonization

**Goal**: Unified status vocabulary across both systems.

| Step | File | Change | Verification |
|---|---|---|---|
| 3.1 | Both backends | Define unified status enum document | Single source of truth for all statuses |
| 3.2 | `bridgeRoutes.js` | Map Android 12+ statuses → Web simplified statuses in sync-parcel | Web shows correct simplified status |
| 3.3 | Web frontend `ManageParcels.jsx` | Display full status timeline from Android `events[]` array | Timeline shows all milestones |
| 3.4 | Manual test | Change status on mobile → web shows correct mapped status | |

**Unified Status Mapping**:

| Android Status | Web Status | Category |
|---|---|---|
| Pending, To Ship, Confirmed, To Pay | Pending | Awaiting |
| Picked Up, In Transit, To receive | In Transit | Active |
| Out for Delivery | Out for Delivery | Active |
| Delivered, Completed | Delivered | Complete |
| Cancelled | Cancelled | Terminal |
| Returns, Returned | Returns | Terminal |
| Failed Delivery | Failed | Terminal |

**Acceptance Criteria**:
- [ ] All Android statuses map to a web status without data loss
- [ ] Web timeline shows granular Android events
- [ ] Status filtering on web works correctly for all categories

---

### PHASE 4: Real-Time Sync & Notifications

**Goal**: Both platforms see updates within seconds, not minutes.

| Step | File | Change | Verification |
|---|---|---|---|
| 4.1 | Both backends | Add WebSocket server (e.g., `socket.io`) for live event broadcast | WS connection established |
| 4.2 | Web frontend | Connect to WebSocket, update dashboard in real-time | New parcel appears without refresh |
| 4.3 | Android backend | On shipment status change, POST to bridge AND emit WebSocket event | Web receives live update |
| 4.4 | Web backend | On admin action, POST to Android backend notification endpoint | Mobile receives system notification |
| 4.5 | Manual test | Parcel status change on mobile → web dashboard updates live | |

**Acceptance Criteria**:
- [ ] New parcel booking on mobile appears in web dashboard within 3 seconds
- [ ] Status change on web triggers OS notification on mobile
- [ ] WebSocket reconnects automatically after disconnection
- [ ] No duplicate events from polling + WebSocket overlap

---

### PHASE 5: Dashboard & Analytics Unification

**Goal**: Web dashboard shows accurate cross-platform totals.

| Step | File | Change | Verification |
|---|---|---|---|
| 5.1 | `Server.js` `/api/dashboard/stats` | Aggregate parcel counts from BOTH Parcel collection AND bridge-synced records | Totals include mobile bookings |
| 5.2 | Web frontend | Add Customer tab to display Customer collection from bridge | Customer list visible |
| 5.3 | `LiveRiderMap.jsx` | Plot rider locations from `ParcelLocation` data synced via bridge | Riders visible on map |
| 5.4 | `GenerateTrackingInformation.jsx` | Show Android `events[]` timeline in tracking lookup | Full milestone history visible |
| 5.5 | Manual test | Book parcel on mobile → web dashboard total increases by 1 | |

**Acceptance Criteria**:
- [ ] Dashboard `totalParcels` includes both web-created and mobile-synced parcels
- [ ] Customer list shows all mobile-registered customers
- [ ] Live map shows rider positions from mobile GPS telemetry
- [ ] Tracking lookup shows full event timeline from Android

---

### PHASE 6: Testing & Edge Cases

**Goal**: Full end-to-end verification of all integration points.

| Test Case | Expected Result | Status |
|---|---|---|
| Register seller on mobile → appears in web Seller list | Seller visible with correct enterprise ID | [ ] |
| Register rider on mobile → appears in web Rider list | Rider visible with vehicle details | [ ] |
| Book parcel on mobile → appears in web Manage Parcels | Parcel with tracking number visible | [ ] |
| Admin approves seller on web → mobile shows Active status | Seller can access full features | [ ] |
| Admin rejects rider on web → mobile shows Rejected status | Rider sees rejection notice | [ ] |
| Rider picks up parcel on mobile → web status updates | Status changes to "In Transit" | [ ] |
| Rider delivers parcel on mobile → web status updates | Status changes to "Delivered" | [ ] |
| Admin changes parcel status on web → mobile reflects | Mobile timeline updates | [ ] |
| Demo accounts (@yto.com) isolated from real accounts | No cross-contamination | [ ] |
| Bridge API key authentication blocks unauthorized writes | 401 on missing/invalid key | [ ] |
| Offline mobile → syncs when back online | Pending sync queue processes correctly | [ ] |
| Same email registered on both platforms | Account created on both, credentials work on both | [ ] |

---

## 4. Data Flow Diagram (Post-Integration)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         YTO EXPRESS PLATFORM                            │
├───────────────────────────────┬─────────────────────────────────────────┤
│     Android Mobile App        │        React Web Admin Panel            │
│  ┌─────────────────────┐      │      ┌─────────────────────┐           │
│  │ Customer / Seller / │      │      │ Admin / Staff /     │           │
│  │ Rider Interface     │      │      │ Hub Receiver        │           │
│  └──────────┬──────────┘      │      └──────────┬──────────┘           │
│             │                 │                 │                       │
│             ▼                 │                 ▼                       │
│  ┌─────────────────────┐      │      ┌─────────────────────┐           │
│  │ Android Backend     │      │      │ Web Backend         │           │
│  │ (Express + Mongoose)│      │      │ (Express + Mongoose)│           │
│  │                     │      │      │                     │           │
│  │ User.js             │◄─────┼─────►│ Account.js          │           │
│  │ Shipment.js         │      │      │ Seller.js           │           │
│  │ Notification.js     │      │      │ Rider.js            │           │
│  │ ChatMessage.js      │      │      │ Customer.js         │           │
│  │                     │      │      │ Parcel.js           │           │
│  │ MongoDB A           │      │      │ ParcelLocation.js   │           │
│  └──────────┬──────────┘      │      │                     │           │
│             │                 │      │ MongoDB B           │           │
│             │                 │      └──────────┬──────────┘           │
│             │                 │                 │                       │
│             └─────────────────┼─────────────────┘                       │
│                               │                                         │
│                     ┌─────────▼─────────┐                               │
│                     │  Bridge API Layer  │                               │
│                     │  (bridgeRoutes.js) │                               │
│                     │                    │                               │
│                     │ sync-user          │                               │
│                     │ sync-parcel        │                               │
│                     │ sync-location      │                               │
│                     │ sync-status        │  ◄── NEW (Phase 2)           │
│                     │ sync-approval      │  ◄── NEW (Phase 2)           │
│                     │                    │                               │
│                     │ + WebSocket        │  ◄── NEW (Phase 4)           │
│                     └────────────────────┘                               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Implementation Order

| Priority | Phase | Estimated Effort | Dependencies |
|---|---|---|---|
| 1 | Phase 1: Auth Unification | 2-3 hours | None |
| 2 | Phase 2: Bidirectional Sync | 3-4 hours | Phase 1 |
| 3 | Phase 3: Status Harmonization | 1-2 hours | Phase 2 |
| 4 | Phase 4: Real-Time Sync | 3-4 hours | Phase 2, Phase 3 |
| 5 | Phase 5: Dashboard Unification | 2-3 hours | Phase 3, Phase 4 |
| 6 | Phase 6: Testing & Edge Cases | 2-3 hours | All phases |

**Total Estimated Effort**: 13-19 hours

---

## 6. Risk Mitigation

| Risk | Mitigation |
|---|---|
| Bridge API key compromise | Rotate keys, add rate limiting, log all bridge requests |
| Data inconsistency during sync conflicts | Use "last write wins" with timestamp comparison |
| WebSocket connection drops | Fallback to polling, auto-reconnect with exponential backoff |
| MongoDB connection failures | Circuit breaker pattern, retry with backoff |
| Password hash mismatch during migration | Dual-verify: try bcrypt first, then plain text, re-hash on success |
