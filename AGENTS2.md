# AGENTS2.md — YTO Express Web Admin Platform — Architecture & Engineering Reference

> *Complete architecture, file mappings, and engineering rules for the Web Admin portal (React frontend + Node/Express backend), including the real-time SSE layer and the cross-platform bridge to the Android app.*

---

## 1. Overview & System Architecture

**YTO Express Web Admin** is a logistics and supply-chain management portal paired with the Android mobile app via a bidirectional REST bridge. It provides real-time tracking, rider dispatching, seller/rider onboarding & verification, hub parcel intake, geo-fencing, analytics, customer dispute tickets, and role-based account management.

```
┌────────────────────────────────────────────────────────────────────────┐
│                          YTO Express Platform                          │
├──────────────────────────────────┬─────────────────────────────────────┤
│        Frontend (React 19)       │          Backend (Node / Express)   │
│  - Vite 7 + React 19             │  - Express 5 + MongoDB (Mongoose 9) │
│  - Lucide Icons + Leaflet Maps   │  - REST API + SSE Event Stream      │
│  - Tailwind CSS design system    │  - Twilio / Semaphore / Gmail SMTP  │
│  - Multi-view Single-Page App    │  - Role-based Access Control (RBAC) │
│  - JWT auth (local/session)      │  - Cross-Platform Android Bridge    │
└──────────────────────────────────┴─────────────────────────────────────┘
```

- **Production backend**: `https://yto-express-backend.onrender.com` (or `VITE_API_URL`) — verified against `src/services/api.js` and `src/services/useSSE.js` defaults (2026-09-09). The older `https://yto-express.onrender.com` host name appears only in legacy comments.
- **Local dev backend**: `http://localhost:3001` (port **3001**, not 5001)
- Workspace: `C:\Users\ADMIN\React_Projects\YTO Latest\` — the Android side (`AGENTS.md`) references this project; do not confuse it with the stale internal mirror at `...\AndroidStudioProjects\YTO_Express_App\React_Projects\YTO Latest`.

---

## 2. Frontend Architecture

### Entry & routing
- `src/main.jsx` — React DOM entry; imports `index.css` + `tailwind.css` + `design-tokens.css`.
- `src/App.jsx` — auth-state router. Restores `currentUser` from JWT (`id`, `email`, `role`); listens for `yto:auth_expired` (a proper `useEffect`, not render-time registration); renders `LoginPage` when logged out; otherwise routes via `PAGE_MAP` and passes `activePage`/`setActivePage`/`currentUser`/`onLogout`.
- **Hash routing (2026-09-14):** the active page key lives in the URL hash (`#/manage-parcels`) — refresh and shared links restore the view instead of always landing on the dashboard. `PAGE_MAP` itself is exported from `src/pageMap.js` (single source of truth for the router, sidebar, and deep-link validation), no longer an inline const in `App.jsx`.
- **Design tokens (2026-09-14):** `src/design-tokens.css` defines the CSS-variable layer (`--yto-brand-purple`, `--yto-brand-orange`, surfaces, borders, text, type scale, radius, shadows, focus ring). CSS files consume `var()`; inline JSX styles keep hex until migrated file-by-file. It also carries the **typography floor** — inline-styled text below 11px renders at 11px (11px → 12px), scoped via `data-yto-typography-floor` on the app shell in `AnalyticsDashboard.jsx`.

### `PAGE_MAP` (19 views)
`dashboard` → AnalyticsDashboard · `process-seller` → ProcessSellerInformation · `seller-report` → ViewSeller · `process-parcel` → ProcessParcelInformation · `manage-parcels` → ManageParcels · `process-rider` → ProcessRiderInformation · `monitor-rider` → MonitorRiderStatus · `rider-report` → GenerateRiderDataReport · `customer-list` → CustomerList · `activity-log` → ActivityLog · `manage-accounts` → ManageAccounts · `hub-parcels` → HubParcelReceiving · `manage-issues` → ManageIssues · `parcel-location` → ManageParcelLocation · `geofence` → MonitorParcel · `tracking-info` → GenerateTrackingInformation · `settings` → Settings · `app-notifications` → AppNotifications · `logout` → Logout

### Sidebar IA (2026-09-13)
The sidebar in `AnalyticsDashboard.jsx` is **section-grouped** (`getMenuSections(role)` → `OVERVIEW / PEOPLE / SHIPMENTS / TRACKING & MAPS / SUPPORT / ADMIN` quiet headers, rendered as `ad-sidebar-nav-section` blocks) — not the older flat "Manage X Information" groups. Rules:
- Route keys are the contract (must stay identical to `PAGE_MAP`); display labels are free to change. Sidebar sub-labels are noun-based destinations: `process-seller`/`process-rider` show as **"Registration Review"**, `seller-report` → **"Seller Directory"**, `monitor-rider` → **"Duty Monitor"**, `rider-report` → **"Rider Reports"**, `manage-parcels` → **"All Parcels"**, `parcel-location` → **"Parcel Map"**, `geofence` → **"Geofence Monitor"**, `manage-issues` → **"Issues"**, `manage-accounts` → **"Accounts"**, `tracking-info` → **"Tracking Reports"** (moved under SHIPMENTS, out of the GPS group).
- Page components keep their own full titles (e.g. `MonitorRiderStatus.jsx` still renders "Monitor Rider Status" as its `<h1>`); only the menu label is shortened.
- `handleMenuClick`/section-sync work off `visibleMenuItems` (a flatMap of all sections), so parent auto-open and rail flyouts need no per-section logic. Empty role-filtered sections are skipped at render.
- Breadcrumbs in `PageHeader` consumers must mirror the section names: `['Dashboard', 'People', 'Customer List']`, `['Dashboard', 'Support', 'Issues']`, `['Dashboard', 'Support', 'App Notifications']`, `['Dashboard', 'Admin', 'Activity Log']`.

### Design system (`src/components/ui/`)
`Badge`, `Modal`, `AlertBanner`, `EmptyState`, `ListSkeleton`, `TableSkeleton`, `StatCard`, `PageHeader`, `CardSectionHeader`, `CardFooter`, `StatusBadge`, `ErrorBoundary` (wraps every routed page with Retry/Back UI), `Tooltip` (+ `Tooltip.css`), `ToastContext` (global toast provider in `App.jsx`), `vehicleIcons` (`VehicleIcon` lucide component + `vehicleGlyphSvg` SVG data-URI + `vehicleTypeLabel`), `statusColors.js` (canonical palettes: `PARCEL_STATUS_COLORS`, `SELLER_STATUS_COLORS`, `RIDER_STATUS_COLORS`, `RIDER_STATUS_BADGE`, `STATUS_HINTS`).

### Parcel-status normalization (`src/utils/parcelStatus.js`, 2026-09-14)
Single source of truth for mapping bridge-synced statuses to display labels: `normalizeParcelStatus()` handles the mobile backend's Title-case vocabulary **and** the legacy lowercase-hyphenated web form, case-insensitively; `isDeliveredStatus` / `isReturnFamilyStatus` / `isInTransitFamilyStatus` power counts and filters. Before this module, `ManageParcels`' 5-entry `REAL_STATUS_MAP` silently coerced mobile statuses it didn't know (`Out for Delivery`, `Picked Up`, `Returning`…) into "Pending", and the dashboard's client-side fallback compared exact Title-case strings against lowercase DB values. Every surface that renders a parcel status must consume this module — never re-derive local maps. The old dashboard `dateRange` select (state never read) was removed in the same pass.

**Icon rule** — no emoji/text glyphs as icons in UI strings; all use lucide-react SVGs (`aria-hidden`, icon-only buttons carry `aria-label`).

### UI design guardrails (anti-AI-slop)
- Read `skills/no-slop-ui/SKILL.md` before making any visual, layout, or styling change.
- On conflict, `skills/no-slop-ui/YTO_ADAPTATIONS.md` outranks the skill defaults.
- After UI changes, run `skills/no-slop-ui/examples/review-checklist.md`.
- `skills/avoid-ai-design/` is the audit/rewrite skill (upstream: funboy322/avoid-ai-design): use it when asked to audit existing UI for AI-design tells, de-slop a screen, or as the post-build audit of generated frontend. It complements `no-slop-ui` (which stays the build-time guardrail); in rewrite mode it stops at this project's brand tokens and conventions — see `skills/avoid-ai-design/YTO_ADAPTATIONS.md`.

### Services
- `src/services/api.js` — centralized client: `API_ROOT = import.meta.env.VITE_API_URL || 'https://yto-express-backend.onrender.com'`; `apiFetch(path, opts)` attaches `Authorization: Bearer`; on 401 with token-expiry errors clears the token and dispatches `yto:auth_expired`. **Token key: `yto_token`** — `remember=true` → `localStorage`, `remember=false` → `sessionStorage` (session storage wins on read). `adminLogin(email, password, remember)`; `notificationsApi.sendEmail`; collection helpers (`sellersApi`, `ridersApi`, `parcelsApi`, `parcelLocationsApi`, `accountsApi`, `dashboardApi`).
- `src/services/localApi.js` — **removed** (2026-09-14): all views use `services/api.js` exclusively.
- `src/services/useSSE.js` — real-time hook (see §5). Exposed `mode` is `'sse' | 'polling'` in practice; offline pill renders via `modeConfig` fallback.
- `src/GlobalSearch.jsx` — cross-entity search with a **60-second snapshot cache**: the parcels/riders/sellers/accounts corpus is fetched once per TTL window (not on every keystroke) and a failed refresh serves the last good snapshot instead of blanking results.

### Auth screens
- `LoginPage.jsx` / `LoginPage.css` — enterprise login, remember-me checkbox (session vs persistent token), server health pill, role tags. `Logout.jsx` / `Logout.css` — secure session termination.

---

## 3. Backend & API (`server/Server.js`)

- Express 5 + Mongoose; `cors({ origin: '*' })`; JSON body; dotenv anchored to `server/.env`; **`MONGO_URI` required at startup**; listens on `process.env.PORT || 3001`.
- DNS pinned to `8.8.8.8`/`8.8.4.4` at boot.

### JWT & auth middleware
- `authenticateToken` middleware: Bearer token → `req.user = { id, email, role }`; 401 on missing/expired, 403 on invalid. `JWT_SECRET` is strictly required at startup (server exits with `[Startup Error]` if unset).
- **Single-realm platform**: Real dataset only; no demo partition or category query filters (see §7).
- **Admin bootstrap** (`ensureAdminAccounts()`): Runs when `ENABLE_ADMIN_BOOTSTRAP=1` (requires `ALLOW_ADMIN_BOOTSTRAP_IN_PROD=1` in production). Insert-only upsert of 3 canonical admins (`superadmin@ytoexpress.com`, `staff@ytoexpress.com`, `hub@ytoexpress.com`) with bcrypt-hashed passwords from `ADMIN_PASSWORD_*` env. Never overwrites existing accounts.

### Route table
| Endpoint | Methods | Notes |
|---|---|---|
| `/` | GET | Server banner |
| `/api/events/stream` | GET | SSE (no JWT required) |
| `/api/events/stats`, `/api/events/history`, `/api/events/alerts` | GET | SSE broadcaster metrics (auth) |
| `/api/events/threshold` | PUT | Peak-alert threshold (auth) |
| `/api/bridge/*` | POST | See §6 |
| `/api/sellers`, `/api/riders` | GET/POST | Also PUT/DELETE (`sendApproval` on status change) |
| `/api/customers` | GET | **GET-only** — customers are created exclusively via bridge (`POST /api/bridge/sync-user`), never via POST here |
| `/api/customers/stats`, `/api/customers/:id/orders` | GET | Customer aggregates + order history by `customerId` |
| `/api/activity-log` | GET | Audit trail from registration/statusHistory across roles; `limit` ≤ 200, `role` filter |
| `/api/app-notifications` (GET) + `/api/app-notifications/:id/read` (PATCH) | GET/PATCH | App-originated notifications (`AdminNotification` collection); `limit` ≤ 200, `type`/`read` filters; PATCH marks one read (auth) |
| `/api/parcels`, `/api/parcel-locations` | GET/POST/PUT/DELETE | Parcel CRUD; POST bridges parcel to mobile backend via `BridgeClient.syncParcel`; PUT updates status, pushes `BridgeClient.sendStatus` + SSE `parcel-updated` (see §6) |
| `/api/dashboard/stats` | GET | KPIs: parcels, delivered %, riders, active riders, avg rating, total deliveries, sellers |
| `/api/accounts` | GET/POST | Admin accounts |
| `/api/accounts/:id` | PUT | bcrypt-hashes new passwords on change |
| `/api/accounts/:id/status` | PATCH | Toggle Active/Deactivated; **super_admin cannot be deactivated** |
| `/api/accounts/login` | POST | JWT 24h (id/email/role); rejects Deactivated |
| `/api/issues` | GET | Support tickets |
| `/api/issues/:id/status` | PUT | Sets status/adminNotes → `BridgeClient.sendIssueStatus` + SSE `issue-status-updated` |
| `/api/sms/send` | POST | Twilio → Semaphore → **simulated fallback** (toE164PH) |
| `/api/email/send` | POST | Gmail SMTP → **simulated fallback** (approval flows). Responds **immediately** with `provider: 'queued'` and performs the actual send (or `[EMAIL SIMULATED]` log when creds are absent) in a background `setImmediate` task; SMTP uses port 465 with an explicit IPv4 DNS/family override to prevent ESOCKET IPv6 drops (the `family: 4` line is currently an uncommitted working-tree change). |
| `/api/admin/reset-database` | DELETE | **super_admin only** + body `confirm: 'RESET'`; purges sellers/riders |

---

## 4. Data Models (`server/models/`)

| Model | Key fields |
|---|---|
| `Account` | `name`, `email` (unique), `phone`, `role` (`super_admin`/`staff`/`hub_receiver`), `password` (bcrypt, `comparePassword()`), `status` (`Active`/`Deactivated`), `createdDate` |
| `Seller` | `registrationId` (compact `YTOS<YYYY><4-digit>`, e.g. `YTOS20260001` — legacy `YTO-SELL-…` values still counted/recognized), `accountNumber`, `fullName`, `storeName` (merchant shop name, synced from Android `User.storeName` via bridge sync-user), `email`, `phone`, `idType`, `idNumber`, `status` (`ACTIVE`), `statusHistory[]` |
| `Rider` | `registrationId` (`YTO-RIDE-YYYY-XXXXX`), `accountNumber`, `riderName`, `email`, `phone`, `vehicleType`, `vehiclePlate`, `status`, `deliveries`, `rating`, `successRate`, `isOnDuty` (real duty toggle synced from Android `PUT auth/duty-status` via `/api/bridge/sync-duty-status`), `statusHistory[]` |
| `Customer` | `customerId` (`YTO-CUST-YYYY-XXXXX`), `fullName`, `email` (unique), `phone`, `address`, `status`, `source` (`mobile-app`), `statusHistory[]` |
| `Parcel` | `trackingNumber` (unique), `senderName`, `receiverName`, `senderPhone`/`receiverPhone`/`senderEmail` (bridge-synced contact info — declared on the schema because Mongoose strict mode silently strips undeclared fields), `recipientEmail`, `item`, `weight`, `value`, `origin`, `destination`, `status`, `riderId`, `sellerId`, `podPhoto` (Base64 JPEG), `events[]`, `deliveryFee`, `riderLat`/`riderLng` (last-known rider position, stamped by `receive-status` when the Android payload carries a GPS fix). |
| `ParcelLocation` | `parcelId` (unique), `lat`, `lng`, `location`, `type` (`Warehouse`), `status`, `geofence` (`Inside`) |
| `Issue` | `ticketId` (`TICK-2026-XXXXX`), `trackingNumber`, `category`, `description`, `evidenceImages[]`, `reporterName/Email/Phone/Role`, `status` (`Open`→`Under Investigation`→`Resolved`→`Closed`), `adminNotes`, `resolvedAt` |
| `AdminNotification` | `title`, `body`, `type` (`ORDER`/`SECURITY`/`SYSTEM`), `targetUserId`, `targetRole`, `refId` (shipment id), `read` (bool), `createdAt` — app-originated notifications fanned in via `/api/bridge/sync-notification`, surfaced in the App Notifications panel + bell |

---

## 5. Real-Time Layer (SSE)

- **`/api/events/stream`**: `text/event-stream`, 30s heartbeat, no JWT on the stream itself. `sseBroadcaster` singleton tracks connected clients, connection history (capped 500), peak alerts (threshold `SSE_PEAK_THRESHOLD` default 5, 1-min cooldown, optional email via `ADMIN_EMAIL`).
- **Events broadcast**: `user-synced`, `parcel-synced`, `location-synced`, `parcel-updated`, `issue-synced`, `issue-status-updated`, `duty-status-synced`, `notification-synced`, `peak-alert`.
- **Client hook (`useSSE.js`)**: connects to `/api/events/stream?token=<jwt>`; auto-reconnect every 3s; after **5 failed attempts falls back to HTTP polling every 5s** (`/api/activity-log?limit=10`, diffing timestamps); exposes `{ connected, mode: 'sse'|'polling'|'offline', lastEvent, on(type, cb), retry() }`; optional browser notifications per event type.

---

## 6. Cross-Platform Bridge Protocol (`server/bridgeRoutes.js`)

Bidirectional REST bridge with the Android backend (`yto_express_backend`). Every route validates its payload, never lets an exception escape (all try/caught + `logBridgeError`), answers `{ success, message, data }` / `{ success: false, error, details }`, and broadcasts SSE to admin clients. Optional shared-secret gate via `BRIDGE_API_KEY` (off by default).

| Route | Purpose |
|---|---|
| `POST /api/bridge/sync-user` | Mobile `User.js` → `Seller`/`Rider`/`Customer` by role; **Enterprise ID generation** compact `<PREFIX><YYYY><4-digit>` (e.g. `YTOS20260001`; legacy `YTO-SELL-…` sequences still counted); partial-update merge (only fields the client sent — incl. `storeName` for sellers); SSE `user-synced` |
| `POST /api/bridge/sync-parcel` | Mobile `Shipment.js` → `Parcel.js` (nested sender/recipient flattened; tolerates flat payloads); server-side weight validation (>0); persists contact info (`senderPhone`/`receiverPhone`/`senderEmail`/`recipientEmail` — flattened Android fields or nested `sender.*`/`recipient.*`; Android's `sellerEmail` is the sender-email fallback and feeds seller enterprise-ID/QR resolution); upsert by `trackingNumber`; SSE `parcel-synced` |
| `POST /api/bridge/sync-issue` | Mobile `Issue.js` → `Issue.js`; SSE `issue-synced`. Mobile `createdAt` is the source of truth for the stored submission time when present (web arrival time is fallback) |
| `POST /api/bridge/sync-location` | Rider GPS telemetry → `ParcelLocation`; SSE `location-synced` |
| `POST /api/bridge/receive-status` | Rider status transitions from Android `BridgeClient.sendStatus` (`trackingNumber` primary, `trackingId` legacy alias — the original `trackingId`-only destructure 400'd every app status push until fixed 2026-09-13); stamps `podPhoto`, last-known `riderLat`/`riderLng`, appends a timeline `events[]` entry; SSE `parcel-synced` |
| `POST /api/bridge/receive-issue-status` | Mobile-side ticket status; SSE `issue-status-updated` |
| `POST /api/bridge/sync-duty-status` | Rider duty toggle from Android `PUT auth/duty-status`; upserts `isOnDuty` on the matching `Rider` (email/phone match); SSE `duty-status-synced` |
| `POST /api/bridge/sync-notification` | App-originated notification (`ORDER`/`SECURITY`/`SYSTEM`, target user/role) → `AdminNotification`; SSE `notification-synced`. Per-user REAL notifications bridge (2026-09-13 mobile fix: a missing `await` on the mobile demo gate had silently skipped every bridge write); role-wide broadcasts (e.g. rider `New Incoming Task`) are demo-context and stay mobile-side — they now persist there with a null recipient instead of erroring (`Notification.recipient` made optional). |
| `GET /api/bridge/poll-changes` | Delta feed mirroring the mobile backend's route of the same name (Android `BridgeClient.pollChanges()` previously 404'd here): `?since=<ISO>` → parcels/sellers/riders/customers updated after the timestamp, 100 docs per collection cap |
| `GET /api/bridge/health` | Bridge liveness (route list includes `poll-changes`) |

**Outbound** (`server/utils/BridgeClient.js`): `sendStatus(trackingNumber, status)`, `sendApproval(email, role, status, enterpriseId)`, `syncParcel(parcelData)`, `pollChanges(since)` (targets the mobile backend's `/api/bridge/poll-changes`), `sendIssueStatus(ticketId, status, adminNotes)`, `healthCheck()` — HTTP(S) POST with retry (3 attempts, exponential backoff, 10s timeout) to `ANDROID_BACKEND_URL`.

---

### 7. Single-Realm Platform

The Web Admin is **REAL-only**. The former REAL/DEMO realm partition was removed completely:
1. **Accounts**: Canonical admin logins are `superadmin@ytoexpress.com`, `staff@ytoexpress.com`, and `hub@ytoexpress.com` (see §3). Customer/seller/rider accounts arrive via the mobile bridge and retain their signup emails.
2. **Clean empty states**: 0 records renders the clean empty-state view — zero synthetic or mock injections anywhere in the client. Unreachable backends display an error banner, never simulated data.
3. **Database specification**: Pinned to Atlas DB `/test` (`server/.env` `MONGO_URI`); operational collections clean.

---

## 8. Engineering Rules

1. **State isolation & navigation** — views route via `PAGE_MAP`; `currentUser` is top-level state; 401 expiry → clean logout to `LoginPage`.
2. **Backend robustness** — external services (Twilio, Semaphore, Nodemailer) fall back to simulation when credentials are absent; bridge routes never throw unhandled; errors logged with payload context and structured JSON.
3. **Data integrity & Enterprise IDs** — strict formats: tickets `TICK-<YEAR>-<5-digit>`; **mobile-account enterprise IDs use the compact Web-minted format (2026-09-11):** sellers `YTOS<YEAR><4-digit>`, riders `YTOR<YEAR><4-digit>`, customers `YTOC<YEAR><4-digit>` (per-collection-per-year sequence counted across BOTH compact and legacy shapes, collision-safe probe before minting; legacy `YTO-SELL/RIDE/CUST-<YEAR>-<5-digit>` rows remain valid/grandfathered); admins `YTO-ADM-XXX`. The Web is the sole minting authority: the sync-user response carries `data.enterpriseId`, the Android backend persists it (`User.webEnterpriseId`) and it is backfilled via `receive-approval` (`enterpriseId` field). Sync-parcel additionally mints + returns the canonical QR payload (`YTOQR1|<tracking>|<sellerEntId>|<customerEntId>`, degraded to the plain tracking number when no enterprise party resolves) and the POD geofence spec (`trackingGeofence` = `{kind:'POD_RING', center:{lat,lng}, radiusMeters:100}`) — both persisted on the web `Parcel` (`qrPayload`, `sellerEnterpriseId`, `customerEnterpriseId`, `trackingGeofence`) and echoed to the mobile side. Web-created parcels pushed to Android must resolve a seller explicitly (`sellerId`/registered `sellerEmail`) — no arbitrary-seller fallback.
4. **Input hygiene** — email `.toLowerCase().trim()`; phone `.replaceAll("[^0-9]","")`; no emojis in UI strings or logs; no hardcoded impersonating fallbacks (`"seller@gmail.com"`, `"YTO Rider"`, `"Store Warehouse"`).
5. **Code quality** — retain docstrings/comments/schemas; responsive desktop + mobile layouts; clear error boundaries.
6. **Auth** — bcrypt 10 rounds; JWT 24h; token key `yto_token`; 401 interceptor clears storage + emits `yto:auth_expired`.
7. **Caveman protocol** — When activated (`caveman`), maintain 100% technical accuracy, zero conversational filler, exact paths, and preserve verification gates.

---

## 9. Scripts & Tooling (`server/`, `scripts/`)

- `Server.js` boot — `ensureAdminAccounts()` initializes canonical admins if enabled (see §3).
- `server/clean_web_db.js` — Wipes operational data (customers/sellers/riders/parcels/issues). Pinned to Atlas database `/test`. Render `MONGO_URI` env var must end in `/test`.
- `scripts/dev.cjs` — `npm run dev:all` launcher (frontend + server).
- `package.json` scripts: `dev` (vite), `dev:server`, `dev:all`, `start` (dev.cjs), `build` (`vite build`), `lint`, `preview`.
- `scripts/qa/` — `npm run qa:layout` headless layout sweep across every sidebar page x viewport width.
- Skills specs live in `my-react-app/skills/` (11 SKILL.md files) plus `.agents/skills/caveman/` (`commit/`, `compress/`, `review/`, `help/`).

---

## 10. File Structure Reference

```
C:\Users\ADMIN\React_Projects\YTO Latest\
├─ REMEDIATION_HANDOFF.md            (N1/N2 security cutover runbook — see §11)
├─ AGENTS2.md                        (this document)
├─ .agents/                          (universal agent spec: rules.md, skills/caveman/)
├─ my-react-app/
│  ├─ package.json, vite.config.js, index.html
│  ├─ src/
│  │  ├─ App.jsx, main.jsx, index.css, tailwind.css, sellerRiderData.js
│  │  ├─ (pages: AnalyticsDashboard, ProcessSellerInformation, ViewSeller,
│  │  │   ProcessParcelInformation, ManageParcels, ProcessRiderInformation,
│  │  │   MonitorRiderStatus, GenerateRiderDataReport, CustomerList, ActivityLog,
│  │  │   ManageAccounts, HubParcelReceiving, ManageIssues, ManageParcelLocation,
│  │  │   MonitorParcel, GenerateTrackingInformation, Settings, SettingsArchiveView,
│  │  │   LoginPage, Logout, GlobalHeader, GlobalSearch, NotificationBell, ...)
│  │  ├─ components/ui/              (Badge, Modal, EmptyState, skeletons, statusColors.js, ...)
│  │  ├─ services/                   (api.js, localApi.js, useSSE.js)
│  │  ├─ verification/               (PendingVerificationsTable, ReviewModal, SendSMSModal, ...)
│  │  └─ (utils: exportUtils, leafletLoader, luzonCityCoords, hubGeofenceData, useRouteAnimation)
│  │  ├─ (top-level src utilities: AdminProfileDropdown, ConnectionHistoryChart,
│  │  │   LiveRiderMap, NotificationBell, PaginationControls, ParcelProgressTimeline,
│  │  │   PeakAlertBanner, sellerRiderData.js)
│  │  ├─ server/
│  │  │  ├─ Server.js, bridgeRoutes.js, clean_web_db.js
│  │  │  ├─ models/                  (Account, Seller, Rider, Customer, Parcel, ParcelLocation, Issue, AdminNotification)
│  │  │  ├─ utils/                   (BridgeClient.js, sseBroadcaster.js)
│  │  │  └─ .env                     (MONGO_URI, JWT_SECRET, ADMIN_PASSWORD_*, TWILIO_*, SEMAPHORE_*, EMAIL_*, ANDROID_BACKEND_URL, BRIDGE_API_KEY, SSE_PEAK_THRESHOLD)
│  │  ├─ scripts/dev.cjs
│  │  ├─ public/                     (assets, vite.svg)
│  │  └─ skills/                     (11 SKILL.md files)
└─ __MACOSX/                         (junk from archive extraction — ignore)
```

## 11. Security: Known Issue — `.env` Credential Leak & Pending History Scrub (Future Fix)

**Status:** LOCAL SCRUB COMPLETE — REMOTE PUSH BLOCKED (as of 2026-09-03).

### What happened
- `my-react-app/server/.env` was committed into git history from the initial commit (`426e719`) with live credentials. The repo is **public** on GitHub (`LewisHamilton444/yto-express`), and `origin/main` at `b6c89fc` **still contains the file** — the leak is live on the remote.
- Local history was scrubbed with `git filter-repo`: `.env` and the junk `Icon\r` file were removed from all 25 commits. New local HEAD: `642ff8d` at scrub time — since advanced by the nodemailer IPv4/CORS fix commits (`c7e0e15` security batch → `70ec918` as of 2026-09-09, plus one uncommitted `family: 4` working-tree change in `Server.js`).
- `.env` was restored to disk (from backup) and added to `.gitignore` — it must never be committed again.
- Pre-scrub backup (contains original history incl. `.env`): `C:\Users\ADMIN\React_Projects\yto-express-backup.git`.
- `vite build` passes; **UPDATE 2026-09-09:** working tree fixes applied and committed locally — nodemailer `family: 4` IPv4 fix, `accountCategory` added to the `Parcel` schema, and the hardcoded `JWT_SECRET` fallback removed (startup now requires the env var). Verify `JWT_SECRET` is set in Render env before the next deploy. **UPDATE 2026-09-13 (de-demo migration):** `accountCategory` was subsequently removed from all models — see §7.

### Why the remote still leaks
A force-push was attempted but rejected (`403 denied`): this machine's cached GitHub credential (account `Natoy0123`) has no push rights to `LewisHamilton444/yto-express`, and the repo owner's credentials are not available on this machine.

### Future fix — repo owner with push access
1. From a machine/account with push rights to `LewisHamilton444/yto-express`:
   ```bash
   cd "C:\Users\ADMIN\React_Projects\YTO Latest"
   git push origin main --force
   ```
2. Verify: `git ls-remote origin main` must return `642ff8d...` (not `b6c89fc...`).
3. After the push: run `git reflog expire --expire=now --all && git gc --prune=now --aggressive` locally, and optionally ask GitHub Support to purge cached objects.

### Mandatory credential rotation (leak is public — scrub alone is NOT a fix)
Anyone who cloned or forked the repo before the force-push keeps the secrets. Rotate ALL of the following in the service dashboards, then update only the local (gitignored) `.env`:

| Key | Service |
|---|---|
| `MONGO_URI` | MongoDB Atlas (regenerate user/password) |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | Twilio console |
| `SEMAPHORE_API_KEY`, `SEMAPHORE_SENDER_NAME` | Semaphore SMS |
| `EMAIL_USER`, `EMAIL_APP_PASSWORD` | Gmail app password |
| `JWT_SECRET`, `BRIDGE_API_KEY`, `ANDROID_BRIDGE_API_KEY` | Internal — regenerate with any strong string |

---

### Active Remediation Status

- **Local `.env` secrets rotated:** `JWT_SECRET` (64-char string), `BRIDGE_API_KEY` + `ANDROID_BRIDGE_API_KEY` (shared value synced to mobile backend `WEB_BRIDGE_API_KEY`).
- **Manual operational items:** Atlas DB user password rotation (sync `MONGO_URI` in `.env` + Render), Gmail app password rotation, Render env var updates (`ADMIN_PASSWORD_*`), commit/push/deploy, and verification matrix.

---

## 12. Deployment: Render Cold-Start & Keep-Alive (Recommendation)

**Symptom:** the LoginPage health pill sometimes shows red `API OFFLINE` when the app has been idle — even though nothing is broken.

**Root cause:** the hosted backend `https://yto-express-backend.onrender.com` runs on Render's free tier, which **sleeps after ~15 minutes of no traffic**. The first request after idle must cold-start the service (30–60s), which exceeds the old 6s probe timeout.

**Current state (2026-09-03):** LoginPage now uses a two-stage, cold-start-tolerant probe — 10s first attempt, then an 800ms pause and a second 45s attempt, with the pill staying orange `Connecting...` throughout the wake-up window. It only declares `API OFFLINE` after ~46s of genuine failure. Trade-off: a truly dead backend takes longer to show red (acceptable — sign-in itself always waits for the cold start and succeeds).

### Recommended: free uptime-monitor keep-alive (so Render never sleeps)

Any free external monitor that pings the backend every ~10 minutes keeps the free instance warm and removes the cold-start lag entirely. Options (free tiers):

| Service | Setup | Notes |
|---|---|---|
| **UptimeRobot** (recommended) | Add a new monitor → HTTP(S) → URL `https://yto-express-backend.onrender.com` → interval **10 min** | 50 monitors free; alert emails if the service ever goes down |
| **cron-job.org** | Add a cron job → `https://yto-express-backend.onrender.com` → every **10 min** | Free, no sign-up friction; only GET pings |
| **Better Stack Uptime** | Add uptime monitor → URL above → 10 min interval | Free tier includes status pages |

Rules to follow so the keep-alive actually works and stays honest:

1. **Ping the root URL** (`https://yto-express-backend.onrender.com/`) — a GET returning 200 counts as traffic and prevents sleep. Do not point the monitor at the Vite dev origin or a Mongo URI.
2. **Interval ≤ 15 min** (10 min is the safe choice) — Render's idle cutoff is ~15 minutes; anything slower re-introduces cold starts.
3. **Do NOT add keep-alive logic inside the app** (frontend polling, self-ping endpoints). Render free tier only wakes on inbound external traffic, and internal self-requests do not reliably prevent sleep — the external monitor is the fix.
4. **Re-check after backend redeploys** — a fresh Render deploy restarts the idle timer; the monitor resumes keeping it warm automatically.

Once a monitor is active, the login pill should read green `System Operational` within ~1s on every visit (no `Connecting...` wait, no red flash).

