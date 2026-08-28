# INTEGRATION_ROADMAP.md — YTO Express Cross-Platform Integration Plan (Revised)

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
| 4 | **Bridge can't receive passwords** | Critical | Android `User.password` has `select: false` — bridge never gets the hash. Can't create web accounts from mobile data. |
| 5 | **Account role enum excludes sellers/riders** | High | `Account.js` only allows `super_admin`/`staff`/`hub_receiver`. Mobile users would pollute admin list. |
| 6 | **Status granularity mismatch** | High | Android has 12+ statuses, Web has ~3. Status updates lose detail. |
| 7 | **No real-time sync** | High | Web has no polling/WebSocket. Admin sees stale data. |
| 8 | **Missing Customer display** | Medium | Bridge creates Customer records but Web dashboard doesn't show them. |
| 9 | **No admin→mobile notification** | Medium | Web admin approval/rejection doesn't notify mobile users. |

---

## 3. Revised Architecture

### Auth Strategy (Key Change)

Instead of forcing mobile sellers/riders into the `Account` collection (admin-only), we add **bcrypt passwords to Seller/Rider collections** and create **role-specific login endpoints**. This keeps the admin account list clean.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    AUTHENTICATION ROUTING                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Login Request                                                          │
│       │                                                                 │
│       ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │               Role Detection (by email domain or login path)    │    │
│  └──────────┬──────────────────┬──────────────────┬───────────────┘    │
│             │                  │                  │                     │
│             ▼                  ▼                  ▼                     │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐       │
│  │ Admin/Staff      │ │ Seller           │ │ Rider            │       │
│  │ POST             │ │ POST             │ │ POST             │       │
│  │ /api/accounts/   │ │ /api/auth/       │ │ /api/auth/       │       │
│  │ login            │ │ seller-login     │ │ rider-login      │       │
│  │                  │ │                  │ │                  │       │
│  │ Account.js       │ │ Seller.js        │ │ Rider.js         │       │
│  │ (bcrypt + JWT)   │ │ (bcrypt + JWT)   │ │ (bcrypt + JWT)   │       │
│  └──────────────────┘ └──────────────────┘ └──────────────────┘       │
│                                                                         │
│  Customer login → Android backend only (no web login needed)            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Sync Strategy (Key Change)

Bidirectional polling with timestamp-based change detection. No WebSocket complexity.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    BIDIRECTIONAL SYNC STRATEGY                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────┐              ┌──────────────────┐                │
│  │ Android Backend  │              │ Web Backend      │                │
│  │ MongoDB A        │              │ MongoDB B        │                │
│  └────────┬─────────┘              └────────┬─────────┘                │
│           │                                 │                          │
│           │  POST /api/bridge/sync-*        │  POST /api/bridge/       │
│           │  (existing: user, parcel,        │  receive-*              │
│           │   location)                     │  (NEW: status,          │
│           │                                 │   approval, parcel)     │
│           │────────────────────────────────►│                          │
│           │                                 │                          │
│           │  POST /api/bridge/receive-*     │  POST /api/bridge/       │
│           │  (NEW: status, approval,        │  sync-*                 │
│           │   parcel)                       │  (existing: user,       │
│           │                                 │   parcel, location)     │
│           │◄────────────────────────────────│                          │
│           │                                 │                          │
│  Polling: Android polls web every 10s       │  Web polls Android      │
│           via /api/bridge/poll-changes      │  every 10s via          │
│                                             │  /api/bridge/poll       │
│  Both return: { changes: [...], lastSync }  │                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Parcel Model Enhancement

Web `Parcel.js` gains additional fields to preserve full Android data:

| New Field | Type | Source | Purpose |
|---|---|---|---|
| `originalStatus` | String | Android `Shipment.status` | Raw Android status, never simplified |
| `senderPhone` | String | Android `Shipment.sender.phone` | Contact for rider pickup |
| `recipientPhone` | String | Android `Shipment.recipient.phone` | Contact for delivery |
| `pickupLat` | Number | Android `Shipment.pickupCoordinates` | Pickup GPS coordinate |
| `pickupLng` | Number | Android `Shipment.pickupCoordinates` | Pickup GPS coordinate |
| `deliveryLat` | Number | Android `Shipment.deliveryCoordinates` | Delivery GPS coordinate |
| `deliveryLng` | Number | Android `Shipment.deliveryCoordinates` | Delivery GPS coordinate |
| `packageWeight` | String | Android `Shipment.package.weight` | Package weight |
| `packageCategory` | String | Android `Shipment.package.category` | Package category |
| `packageCount` | Number | Android `Shipment.package.count` | Number of items |
| `paymentMode` | String | Android `Shipment.package.paymentMode` | Prepaid / COD |
| `codAmount` | Number | Android `Shipment.package.codAmount` | Cash on delivery amount |
| `sellerEmail` | String | Android `User.email` (seller) | Lookup key for seller |
| `riderEmail` | String | Android `User.email` (rider) | Lookup key for rider |
| `lastSyncedAt` | Date | Bridge timestamp | Change detection for polling |

---

## 4. Integration Phases

### PHASE 1: Authentication Unification

**Goal**: A seller/rider registered on mobile can log into the web admin panel with the same credentials.

| Step | File | Change | Verification |
|---|---|---|---|
| 1.1 | `server/models/Account.js` | Add bcrypt pre-save hook + compare method | Passwords hashed on save |
| 1.2 | `server/models/Seller.js` | Add `password` field (String, required) | Seller can store bcrypt hash |
| 1.3 | `server/models/Rider.js` | Add `password` field (String, required) | Rider can store bcrypt hash |
| 1.4 | `server/Server.js` | Upgrade `/api/accounts/login` to return JWT | Admin auth: `{ id, email, role }` token |
| 1.5 | `server/Server.js` | Add `POST /api/auth/seller-login` — checks Seller collection by email, bcrypt compare, returns JWT with `role: 'seller'` | Seller web login works |
| 1.6 | `server/Server.js` | Add `POST /api/auth/rider-login` — checks Rider collection by email, bcrypt compare, returns JWT with `role: 'rider'` | Rider web login works |
| 1.7 | `server/bridgeRoutes.js` `sync-user` | Hash password with bcrypt before saving to Seller/Rider | Mobile passwords work on web |
| 1.8 | `src/services/api.js` | Add `sellerLogin(email, pw)`, `riderLogin(email, pw)`, store JWT in `localStorage` per role | Frontend auth routing |
| 1.9 | `src/App.jsx` | Add role-based routing: admin → dashboard, seller → seller view, rider → rider view | Role-based view access |
| 1.10 | Manual test | Register seller on mobile → login to web with same email+password | End-to-end verification |

**Key Design Decision**: The `Account` collection remains admin-only (`super_admin`/`staff`/`hub_receiver`). Sellers and riders authenticate against their own collections. This prevents polluting the admin account list shown in `ManageAccounts.jsx`.

**Acceptance Criteria**:
- [ ] Mobile-registered seller logs into web panel with same email+password
- [ ] Mobile-registered rider logs into web panel with same email+password
- [ ] Web-created admin account works independently via `/api/accounts/login`
- [ ] JWT tokens expire after 24h TTL
- [ ] Password changes on mobile sync to web Seller/Rider collections via bridge
- [ ] Invalid credentials return 401 on all three login endpoints

---

### PHASE 2: Bidirectional Data Sync

**Goal**: Actions on either platform reflect on the other within 10 seconds.

| Step | File | Change | Verification |
|---|---|---|---|
| 2.1 | `server/models/Parcel.js` | Add new fields: `originalStatus`, `senderPhone`, `recipientPhone`, `pickupLat/Lng`, `deliveryLat/Lng`, `packageWeight`, `packageCategory`, `packageCount`, `paymentMode`, `codAmount`, `sellerEmail`, `riderEmail`, `lastSyncedAt` | Parcel schema supports full Android data |
| 2.2 | `server/bridgeRoutes.js` `sync-parcel` | Populate ALL new fields from Android Shipment payload | Full data preserved on sync |
| 2.3 | `server/bridgeRoutes.js` | Add `POST /api/bridge/receive-status` — accepts `{ trackingNumber, status, updatedAt }` from Android, updates Parcel | Android status changes sync to web |
| 2.4 | `server/bridgeRoutes.js` | Add `POST /api/bridge/receive-approval` — accepts `{ email, role, status }` from Android, updates Seller/Rider status | Android approval changes sync to web |
| 2.5 | `server/bridgeRoutes.js` | Add `POST /api/bridge/receive-parcel` — accepts Android Shipment payload, upserts to Parcel | Android bookings sync to web |
| 2.6 | `server/bridgeRoutes.js` | Add `GET /api/bridge/poll-changes?since=<timestamp>` — returns all parcels/riders/sellers updated after `since` | Web can poll for Android changes |
| 2.7 | Android `Server.js` | Add `POST /api/bridge/receive-status` endpoint | Android accepts web status updates |
| 2.8 | Android `Server.js` | Add `POST /api/bridge/receive-approval` endpoint | Android accepts web approval updates |
| 2.9 | Android `Server.js` | Add `GET /api/bridge/poll-changes?since=<timestamp>` endpoint | Android can poll for web changes |
| 2.10 | Android `YTOCrossDeviceService.java` | Add 10s polling to web bridge `/poll-changes` endpoint | Mobile picks up web-initiated changes |
| 2.11 | Manual test | Web admin approves seller → mobile seller sees "Active" status | End-to-end verification |

**Acceptance Criteria**:
- [ ] Web admin creating a parcel syncs to Android Shipment collection
- [ ] Web admin changing parcel status syncs to Android
- [ ] Web admin approving a seller syncs to Android User status
- [ ] Android status changes sync to web Parcel collection
- [ ] Android bookings sync to web Parcel collection with full fields
- [ ] No duplicate records on re-sync (upsert by email/trackingNumber)
- [ ] `lastSyncedAt` updated on every sync for change detection

---

### PHASE 3: Parcel Status Harmonization

**Goal**: Unified status vocabulary across both systems with full detail preservation.

| Step | File | Change | Verification |
|---|---|---|---|
| 3.1 | Both backends | Create `shared/statusMap.js` — single source of truth for all statuses | Status enum documented |
| 3.2 | `bridgeRoutes.js` `sync-parcel` | Store `originalStatus` (raw Android) AND `status` (simplified web) | Both statuses preserved |
| 3.3 | Web frontend `ManageParcels.jsx` | Filter by `status` (simplified) but display `originalStatus` in detail view | Full granularity visible |
| 3.4 | Web frontend `GenerateTrackingInformation.jsx` | Show `events[]` timeline from Android in tracking lookup | Milestone history visible |
| 3.5 | Manual test | Change status on mobile → web shows correct mapped status + original | |

**Unified Status Mapping**:

| Android Status | Web `status` (simplified) | Web `originalStatus` (raw) | Category |
|---|---|---|---|
| Pending | Pending | Pending | Awaiting |
| To Pay | Pending | To Pay | Awaiting |
| To Ship | Pending | To Ship | Awaiting |
| Confirmed | Pending | Confirmed | Awaiting |
| To Pickup | Pending | To Pickup | Awaiting |
| Picked Up | In Transit | Picked Up | Active |
| In Transit | In Transit | In Transit | Active |
| To receive | In Transit | To receive | Active |
| Out for Delivery | Out for Delivery | Out for Delivery | Active |
| Delivered | Delivered | Delivered | Complete |
| Completed | Delivered | Completed | Complete |
| Cancelled | Cancelled | Cancelled | Terminal |
| Returns | Returns | Returns | Terminal |
| Returned | Returns | Returned | Terminal |
| Failed Delivery | Failed | Failed Delivery | Terminal |

**Acceptance Criteria**:
- [ ] All Android statuses preserved in `originalStatus`
- [ ] Web filtering uses simplified `status` field
- [ ] Web detail view shows `originalStatus` for granularity
- [ ] Tracking timeline displays full `events[]` from Android

---

### PHASE 4: Polling-Based Real-Time Sync

**Goal**: Both platforms see updates within 10 seconds via timestamp-based polling.

| Step | File | Change | Verification |
|---|---|---|---|
| 4.1 | `server/bridgeRoutes.js` | Add `GET /api/bridge/poll-changes?since=<ISO timestamp>` — returns all records updated after `since` | Polling endpoint works |
| 4.2 | Android `Server.js` | Add `GET /api/bridge/poll-changes?since=<ISO timestamp>` endpoint | Android polling endpoint works |
| 4.3 | Web frontend | Add polling hook: `usePolling(interval=10000)` that fetches `/api/bridge/poll-changes` and updates local state | Dashboard refreshes automatically |
| 4.4 | Android `YTOCrossDeviceService.java` | Add web bridge polling: fetch `/api/bridge/poll-changes` every 10s, apply changes to local DB | Mobile picks up web changes |
| 4.5 | Both backends | On every status change, set `lastSyncedAt = new Date()` | Change detection works |
| 4.6 | Manual test | Parcel status change on mobile → web dashboard updates within 10s | End-to-end verification |

**Acceptance Criteria**:
- [ ] New parcel booking on mobile appears in web dashboard within 10 seconds
- [ ] Status change on web reflects on mobile within 10 seconds
- [ ] Polling doesn't cause performance issues (efficient timestamp queries)
- [ ] `lastSyncedAt` index ensures fast polling queries

---

### PHASE 5: Dashboard & Analytics Unification

**Goal**: Web dashboard shows accurate cross-platform totals.

| Step | File | Change | Verification |
|---|---|---|---|
| 5.1 | `Server.js` `/api/dashboard/stats` | Already aggregates all Parcel documents (including bridge-synced). Verify counts are correct. | Totals include mobile bookings |
| 5.2 | Web frontend | Add Customer tab to display Customer collection from bridge | Customer list visible |
| 5.3 | `LiveRiderMap.jsx` | Plot rider locations from `ParcelLocation` data synced via bridge | Riders visible on map |
| 5.4 | `GenerateTrackingInformation.jsx` | Show `events[]` timeline + `originalStatus` in tracking lookup | Full milestone history visible |
| 5.5 | Manual test | Book parcel on mobile → web dashboard total increases by 1 | |

**Note**: The existing `/api/dashboard/stats` already counts ALL Parcel documents. Bridge-synced parcels ARE in the Parcel collection (upserted by trackingNumber). No additional aggregation needed.

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
| Register seller on mobile → appears in web Seller list | Seller visible with correct enterprise ID + bcrypt password | [ ] |
| Register rider on mobile → appears in web Rider list | Rider visible with vehicle details + bcrypt password | [ ] |
| Book parcel on mobile → appears in web Manage Parcels | Parcel with tracking number + all fields visible | [ ] |
| Login to web with mobile seller credentials | JWT token returned, seller view shown | [ ] |
| Login to web with mobile rider credentials | JWT token returned, rider view shown | [ ] |
| Admin approves seller on web → mobile shows Active status | Seller can access full features | [ ] |
| Admin rejects rider on web → mobile shows Rejected status | Rider sees rejection notice | [ ] |
| Rider picks up parcel on mobile → web status updates | Status changes to "In Transit", originalStatus = "Picked Up" | [ ] |
| Rider delivers parcel on mobile → web status updates | Status changes to "Delivered" | [ ] |
| Admin changes parcel status on web → mobile reflects | Mobile timeline updates | [ ] |
| Demo accounts (@yto.com) isolated from real accounts | No cross-contamination | [ ] |
| Bridge API key authentication blocks unauthorized writes | 401 on missing/invalid key | [ ] |
| Offline mobile → syncs when back online | Pending sync queue processes correctly | [ ] |
| Same email registered on both platforms | Account created on both, credentials work on both | [ ] |
| Concurrent edits on same parcel | Last write wins with timestamp comparison | [ ] |
| Password change on mobile → web login still works | New password synced via bridge, old password rejected | [ ] |

---

## 5. Data Flow Diagram (Post-Integration)

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
│  │ User.js             │      │      │ Account.js (admin)  │           │
│  │ Shipment.js         │◄─────┼─────►│ Seller.js (+pw)     │           │
│  │ Notification.js     │      │      │ Rider.js (+pw)      │           │
│  │ ChatMessage.js      │      │      │ Customer.js         │           │
│  │                     │      │      │ Parcel.js (+fields) │           │
│  │ MongoDB A           │      │      │ ParcelLocation.js   │           │
│  └──────────┬──────────┘      │      │                     │           │
│             │                 │      │ MongoDB B           │           │
│             │                 │      └──────────┬──────────┘           │
│             │                 │                 │                       │
│             └─────────────────┼─────────────────┘                       │
│                               │                                         │
│  AUTH:                        │  AUTH:                                  │
│  POST /api/auth/seller-login  │  POST /api/auth/seller-login           │
│  POST /api/auth/rider-login   │  POST /api/auth/rider-login            │
│  POST /api/auth/customer-login│  POST /api/accounts/login (admin)      │
│                               │                                         │
│  SYNC:                        │  SYNC:                                  │
│  bridge/sync-user      ──────►│  bridge/sync-user                      │
│  bridge/sync-parcel    ──────►│  bridge/sync-parcel (+full fields)     │
│  bridge/sync-location  ──────►│  bridge/sync-location                  │
│  bridge/receive-status ◄──────│  bridge/receive-status                 │
│  bridge/receive-approval◄─────│  bridge/receive-approval               │
│  bridge/poll-changes   ◄──────│  bridge/poll-changes                   │
│                               │                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Implementation Order

| Priority | Phase | Estimated Effort | Dependencies | Risk |
|---|---|---|---|---|
| 1 | Phase 1: Auth Unification | 3-4 hours | None | Low — additive changes only |
| 2 | Phase 2: Bidirectional Sync | 4-5 hours | Phase 1 | Medium — field mapping complexity |
| 3 | Phase 3: Status Harmonization | 1-2 hours | Phase 2 | Low — data transformation |
| 4 | Phase 4: Polling Sync | 2-3 hours | Phase 2, Phase 3 | Low — timestamp queries |
| 5 | Phase 5: Dashboard Unification | 1-2 hours | Phase 3, Phase 4 | Low — mostly frontend |
| 6 | Phase 6: Testing & Edge Cases | 2-3 hours | All phases | Medium — cross-platform verification |

**Total Estimated Effort**: 13-19 hours

---

## 7. Risk Mitigation

| Risk | Mitigation |
|---|---|
| Bridge API key compromise | Rotate keys quarterly, add rate limiting (100 req/min), log all bridge requests with IP |
| Data inconsistency during sync conflicts | Use `lastSyncedAt` timestamp comparison — newer write wins. Add `updatedAt` index for fast queries. |
| Password hash mismatch during migration | Dual-verify on first login: try bcrypt, then plain text, re-hash on success. Remove plain text after migration. |
| Polling performance degradation | Add compound index on `(lastSyncedAt)` for efficient timestamp queries. Cap response to 100 records per poll. |
| MongoDB connection failures | Circuit breaker pattern with 30s cooldown. Retry with exponential backoff (1s, 2s, 4s). |
| Concurrent edits on same parcel | Timestamp-based conflict resolution. Future: add version field for optimistic locking. |
| Mobile offline → stale data | Android queues outbound syncs in SharedPreferences. Processes queue on reconnect. Web shows "last synced X ago" indicator. |

---

## 8. File Change Summary

| File | Phase | Changes |
|---|---|---|
| `server/models/Account.js` | 1 | Add bcrypt pre-save hook + compare method |
| `server/models/Seller.js` | 1, 2 | Add `password` field, add `lastSyncedAt` |
| `server/models/Rider.js` | 1, 2 | Add `password` field, add `lastSyncedAt` |
| `server/models/Parcel.js` | 2, 3 | Add 15+ new fields from Android Shipment |
| `server/Server.js` | 1 | Add seller-login, rider-login endpoints, upgrade admin login to JWT |
| `server/bridgeRoutes.js` | 1, 2, 3, 4 | Hash passwords in sync-user, add receive-* endpoints, add poll-changes, enhance sync-parcel |
| `src/services/api.js` | 1 | Add sellerLogin(), riderLogin(), JWT storage |
| `src/App.jsx` | 1 | Add role-based routing |
| `src/ManageParcels.jsx` | 3 | Show originalStatus, filter by simplified status |
| `src/GenerateTrackingInformation.jsx` | 3, 5 | Show events[] timeline |
| `src/LiveRiderMap.jsx` | 5 | Plot rider locations from bridge data |
| Android `Server.js` | 2 | Add receive-status, receive-approval, poll-changes endpoints |
| Android `YTOCrossDeviceService.java` | 4 | Add web bridge polling every 10s |
