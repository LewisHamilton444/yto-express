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

- **Production backend**: `https://yto-express.onrender.com` (or `VITE_API_URL`)
- **Local dev backend**: `http://localhost:3001` (port **3001**, not 5001)
- Workspace: `C:\Users\ADMIN\React_Projects\YTO Latest\` — the Android side (`AGENTS.md`) references this project; do not confuse it with the stale internal mirror at `...\AndroidStudioProjects\YTO_Express_App\React_Projects\YTO Latest`.

---

## 2. Frontend Architecture

### Entry & routing
- `src/main.jsx` — React DOM entry; imports `index.css` + `tailwind.css`.
- `src/App.jsx` — auth-state router. Restores `currentUser` from the JWT (parses `payload.isDemo ?? isDemoEmail(payload.email)`); listens for `yto:auth_expired`; renders `LoginPage` when logged out; otherwise routes via `PAGE_MAP` and passes `activePage`/`setActivePage`/`currentUser`/`onLogout`.

### `PAGE_MAP` (18 views)
`dashboard` → AnalyticsDashboard · `process-seller` → ProcessSellerInformation · `seller-report` → ViewSeller · `process-parcel` → ProcessParcelInformation · `manage-parcels` → ManageParcels · `process-rider` → ProcessRiderInformation · `monitor-rider` → MonitorRiderStatus · `rider-report` → GenerateRiderDataReport · `customer-list` → CustomerList · `activity-log` → ActivityLog · `manage-accounts` → ManageAccounts · `hub-parcels` → HubParcelReceiving · `manage-issues` → ManageIssues · `parcel-location` → ManageParcelLocation · `geofence` → MonitorParcel · `tracking-info` → GenerateTrackingInformation · `settings` → Settings · `logout` → Logout

### Design system (`src/components/ui/`)
`Badge`, `Modal`, `AlertBanner`, `EmptyState`, `ListSkeleton`, `TableSkeleton`, `StatCard`, `PageHeader`, `CardSectionHeader`, `CardFooter`, `StatusBadge`, `ErrorBoundary` (wraps every routed page — a page crash shows a Retry/Back-to-dashboard card instead of blanking the whole app), `SimulatedFeedBadge` (honest-labeling for demo/simulated feeds), `ToastContext` (global toast provider — wraps the app in `App.jsx`, replaces per-screen toast stacks), `vehicleIcons` (`VehicleIcon` lucide component + `vehicleGlyphSvg` SVG data-URI + `vehicleTypeLabel` for Leaflet markers), `statusColors.js` (canonical palettes: `PARCEL_STATUS_COLORS`, `SELLER_STATUS_COLORS`, `RIDER_STATUS_COLORS`, `RIDER_STATUS_BADGE`, **`ACCOUNT_CATEGORY_TONE` = REAL green / DEMO slate gray**, `ACCOUNT_CATEGORY_LABEL`).

**Icon rule** — no emoji/text glyphs as icons in UI strings; all use lucide-react SVGs (`aria-hidden`, icon-only buttons carry `aria-label`).

### Services
- `src/services/api.js` — centralized client: `API_ROOT = import.meta.env.VITE_API_URL || 'https://yto-express.onrender.com'`; `apiFetch(path, opts)` attaches `Authorization: Bearer`; on 401 with token-expiry errors clears the token and dispatches `yto:auth_expired`. **Token key: `yto_token`** — `remember=true` → `localStorage`, `remember=false` → `sessionStorage` (session storage wins on read). `adminLogin(email, password, remember)`; `notificationsApi.sendEmail`; collection helpers (`sellersApi`, `ridersApi`, `parcelsApi`, `parcelLocationsApi`, `accountsApi`, `dashboardApi`).
- `src/services/localApi.js` — same API shape but defaults to `http://localhost:3001`; used by the newer views (`ManageIssues`, `CustomerList`, `ActivityLog`) whose routes are not yet deployed to production.
- `src/services/useSSE.js` — real-time hook (see §5).
- `src/demoUtils.js` — `isDemoEmail()`: demo if the email is an allowlisted demo login (`superadmin@gmail.com`, `staff@gmail.com`, `hub@gmail.com` — mirrors the Android app's `customer/seller/rider@gmail.com` convention), domain ∈ `['yto.com','example.com','ytoexpress.com']`, OR email starts with `demo`.

### Auth screens
- `LoginPage.jsx` / `LoginPage.css` — enterprise login, remember-me checkbox (session vs persistent token), server health pill, role tags. `Logout.jsx` / `Logout.css` — secure session termination.

---

## 3. Backend & API (`server/Server.js`)

- Express 5 + Mongoose; `cors({ origin: '*' })`; JSON body; dotenv anchored to `server/.env`; **`MONGO_URI` required at startup**; listens on `process.env.PORT || 3001`.
- DNS pinned to `8.8.8.8`/`8.8.4.4` at boot.

### JWT & category partition
- `authenticateToken` middleware: Bearer token → `req.user = { id, email, role, isDemo, ... }`; sets `req.category = decoded.isDemo ? 'DEMO' : 'REAL'`; 401 on missing/expired, 403 on invalid.
- `getCategoryFilter(req)`: `?category=ALL` → no filter; `REAL`/`DEMO` → that partition; **default = the authenticated admin's own realm** (`req.category`).
- `isDemoEmail()` mirrors `demoUtils.js` (allowlisted `@gmail.com` demo logins + yto.com / example.com / ytoexpress.com / `demo` prefix).

### Route table
| Endpoint | Methods | Notes |
|---|---|---|
| `/` | GET | Server banner |
| `/api/events/stream` | GET | SSE (no JWT required) |
| `/api/events/stats`, `/api/events/history`, `/api/events/alerts` | GET | SSE broadcaster metrics (auth) |
| `/api/events/threshold` | PUT | Peak-alert threshold (auth) |
| `/api/bridge/*` | POST | See §6 |
| `/api/sellers`, `/api/riders`, `/api/customers` | GET/POST | Category-filtered; sellers/riders also PUT/DELETE (`sendApproval` on status change) |
| `/api/customers/stats`, `/api/customers/:id/orders` | GET | Customer aggregates + order history by `customerId` |
| `/api/activity-log` | GET | Audit trail from registration/statusHistory across roles; `limit` ≤ 200, `role` filter |
| `/api/parcels`, `/api/parcel-locations` | GET/POST/PUT/DELETE | Parcel status PUT pushes `BridgeClient.sendStatus` + SSE `parcel-updated` |
| `/api/dashboard/stats` | GET | Category-filtered KPIs: parcels, delivered %, riders, active riders, avg rating, total deliveries, sellers |
| `/api/accounts` | GET/POST | Admin accounts; POST derives `accountCategory` from email |
| `/api/accounts/:id` | PUT | bcrypt-hashes new passwords; re-derives category on email change |
| `/api/accounts/:id/status` | PATCH | Toggle Active/Deactivated; **super_admin cannot be deactivated** |
| `/api/accounts/login` | POST | JWT 24h embedding `isDemo`; rejects Deactivated |
| `/api/issues` | GET | Support tickets, category-filtered |
| `/api/issues/:id/status` | PUT | Sets status/adminNotes → `BridgeClient.sendIssueStatus` + SSE `issue-status-updated` |
| `/api/sms/send` | POST | Twilio → Semaphore → **simulated fallback** (toE164PH) |
| `/api/email/send` | POST | Gmail SMTP → **simulated fallback** (approval flows) |
| `/api/admin/reset-database` | DELETE | **super_admin only** + body `confirm: 'RESET'`; purges sellers/riders |

---

## 4. Data Models (`server/models/`)

| Model | Key fields |
|---|---|
| `Account` | `name`, `email` (unique), `phone`, `role` (`super_admin`/`staff`/`hub_receiver`), `password` (bcrypt, `comparePassword()`), `status` (`Active`/`Deactivated`), `accountCategory` (`REAL`/`DEMO`), `createdDate` |
| `Seller` | `registrationId` (`YTO-SELL-YYYY-XXXXX`), `accountNumber`, `fullName`, `email`, `phone`, `idType`, `idNumber`, `status` (`ACTIVE`), `accountCategory`, `statusHistory[]` |
| `Rider` | `registrationId` (`YTO-RIDE-YYYY-XXXXX`), `accountNumber`, `riderName`, `email`, `phone`, `vehicleType`, `vehiclePlate`, `status`, `deliveries`, `rating`, `successRate`, `accountCategory`, `statusHistory[]` |
| `Customer` | `customerId` (`YTO-CUST-YYYY-XXXXX`), `fullName`, `email` (unique), `phone`, `address`, `accountCategory`, `status`, `source` (`mobile-app`), `statusHistory[]` |
| `Parcel` | `trackingNumber` (unique), `senderName`, `receiverName`, `recipientEmail`, `item`, `weight`, `origin`, `destination`, `status`, `riderId`, `sellerId`, `podPhoto` (Base64 JPEG), `accountCategory`, `events[]` |
| `ParcelLocation` | `parcelId` (unique), `lat`, `lng`, `location`, `type` (`Warehouse`), `status`, `geofence` (`Inside`) |
| `Issue` | `ticketId` (`TICK-2026-XXXXX`), `trackingNumber`, `category`, `description`, `evidenceImages[]`, `reporterName/Email/Phone/Role`, `status` (`Open`→`Under Investigation`→`Resolved`→`Closed`), `accountCategory`, `adminNotes`, `resolvedAt` |

---

## 5. Real-Time Layer (SSE)

- **`/api/events/stream`**: `text/event-stream`, 30s heartbeat, no JWT on the stream itself. `sseBroadcaster` singleton tracks connected clients, connection history (capped 500), peak alerts (threshold `SSE_PEAK_THRESHOLD` default 5, 1-min cooldown, optional email via `ADMIN_EMAIL`).
- **Events broadcast**: `user-synced`, `parcel-synced`, `location-synced`, `parcel-updated`, `issue-synced`, `issue-status-updated`, `peak-alert`.
- **Client hook (`useSSE.js`)**: connects to `/api/events/stream?token=<jwt>`; auto-reconnect every 3s; after **5 failed attempts falls back to HTTP polling every 5s** (`/api/activity-log?limit=10`, diffing timestamps); exposes `{ connected, mode: 'sse'|'polling'|'offline', lastEvent, on(type, cb), retry() }`; optional browser notifications per event type.

---

## 6. Cross-Platform Bridge Protocol (`server/bridgeRoutes.js`)

Bidirectional REST bridge with the Android backend (`yto_express_backend`). Every route validates its payload, never lets an exception escape (all try/caught + `logBridgeError`), answers `{ success, message, data }` / `{ success: false, error, details }`, and broadcasts SSE to admin clients. Optional shared-secret gate via `BRIDGE_API_KEY` (off by default).

| Route | Purpose |
|---|---|
| `POST /api/bridge/sync-user` | Mobile `User.js` → `Seller`/`Rider`/`Customer` by role; **Enterprise ID generation** `YTO-<PREFIX>-<YEAR>-<5-digit>` (sequence per collection per year); partial-update merge (only fields the client sent); SSE `user-synced` |
| `POST /api/bridge/sync-parcel` | Mobile `Shipment.js` → `Parcel.js` (nested sender/recipient flattened; tolerates flat payloads); server-side weight validation (>0); upsert by `trackingNumber`; SSE `parcel-synced` |
| `POST /api/bridge/sync-issue` | Mobile `Issue.js` → `Issue.js`; SSE `issue-synced` |
| `POST /api/bridge/sync-location` | Rider GPS telemetry → `ParcelLocation`; SSE `location-synced` |
| `POST /api/bridge/receive-status` | Rider terminal transitions; SSE `parcel-synced` |
| `POST /api/bridge/receive-issue-status` | Mobile-side ticket status; SSE `issue-status-updated` |
| `GET /api/bridge/health` | Bridge liveness |

**Outbound** (`server/utils/BridgeClient.js`): `sendStatus(trackingNumber, status)`, `sendApproval(email, role, status)`, `syncParcel(parcelData)`, `pollChanges(since)`, `sendIssueStatus(ticketId, status, adminNotes)`, `healthCheck()` — HTTP(S) POST with retry (3 attempts, exponential backoff, 10s timeout) to `ANDROID_BACKEND_URL`.

---

## 7. Demo vs. Real Isolation (Web Admin)

```
┌────────────────────────────────────────────────────────────────────────┐
│            WEB ADMIN DEMO VS. REAL ISOLATION PROTOCOL                 │
├────────────────────────────────────────────────────────────────────────┤
│                  [Admin Authentication / Login]                       │
│                                    │                                   │
│                  ┌─────────────────┴─────────────────┐                 │
│                  ▼                                   ▼                 │
│   ┌─────────────────────────────┐     ┌─────────────────────────────┐  │
│   │     Real Admin Account      │     │      Demo Admin Account     │  │
│   │  (JWT isDemo: false)        │     │   (JWT isDemo: true)        │  │
│   │  - Strict live DB queries   │     │   - Realm defaults to DEMO  │  │
│   │  - 0 records = clean empty  │     │   - Sandbox test records    │  │
│   │    state (NO mock fallback) │     │   - [DEMO MODE] banner      │  │
│   └─────────────────────────────┘     └─────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

1. **Login & session flag**: `/api/accounts/login` embeds `isDemo` in the 24h JWT from `isDemoEmail()`; `App.jsx` propagates `currentUser.isDemo` everywhere.
2. **Clean empty states**: real admins (`!isDemo`) with 0 records see clean empty-state graphics — zero synthetic/mock injections. Demo admins load test datasets (`FALLBACK_PARCELS`, `MOCK_ACCOUNTS`, `mockSellers`, `mockRiders`) under a yellow `[DEMO MODE]` banner.
3. **Category filtering**: every data grid has an `Account Category` column + `All`/`Real Records`/`Demo Records` filter; **badge scheme: green `REAL` (#43A047) / gray `DEMO` (#9CA3AF)** — centralized in `components/ui/statusColors.js` (`ACCOUNT_CATEGORY_TONE`). ManageParcels additionally treats `DEMO-` tracking-number prefixes as demo.
4. **Demo logins (canonical, 2026-09-03)**: the three Web Admin demo logins are **`superadmin@gmail.com`** (super_admin; password env-managed via `DEMO_ADMIN_PASSWORD_SUPERADMIN`), **`staff@gmail.com`** (staff; `DEMO_ADMIN_PASSWORD_STAFF`), **`hub@gmail.com`** (hub_receiver; `DEMO_ADMIN_PASSWORD_HUB`) — all `accountCategory: DEMO`. This mirrors the Android app, which treats `customer/seller/rider@gmail.com` as demo logins. Those exact addresses are allowlisted in `demoUtils.js` + `Server.js` so they stay DEMO even though gmail normally defaults to REAL; every other gmail address remains REAL.
5. **Deployment skew — plaintext demo passwords (2026-09-03)**: the LIVE Render backend (`https://yto-express.onrender.com`) still runs `origin/main` `b6c89fc` (Aug 27) which authenticates demo accounts with a **plaintext compare** (`account.password !== password`) and issues no JWT. A Sep 1 re-seed wrote bcrypt hashes, so every demo login 401'd until the live DB was re-written to PLAINTEXT (approved hotfix). The newer local backend hashes with bcrypt (`Account.pre('save')`) but `Account.comparePassword` also accepts plaintext via its legacy fallback and upgrades it to bcrypt on the first successful login. Until the new backend is deployed, demo accounts in the live DB must stay plaintext — do NOT re-run the bcrypt seed against it (`DEMO_PLAINTEXT=1 node seed_official_demo_accounts.js` for the legacy server). **UPDATE 2026-09-04:** the `DEMO_PLAINTEXT=1` compatibility mode was removed from the seed script; the plaintext rows in the live DB are rotated to bcrypt by `server/rotate_demo_admin_credentials.js` during the deploy window, after which the new bcrypt/JWT backend is the only auth path.

---

## 8. Engineering Rules

1. **State isolation & navigation** — views route via `PAGE_MAP`; `currentUser` is top-level state; 401 expiry → clean logout to `LoginPage`.
2. **Backend robustness** — external services (Twilio, Semaphore, Nodemailer) fall back to simulation when credentials are absent; bridge routes never throw unhandled; errors logged with payload context and structured JSON.
3. **Data integrity & Enterprise IDs** — strict formats: tickets `TICK-<YEAR>-<5-digit>`; sellers `YTO-SELL-<YEAR>-<5-digit>`; riders `YTO-RIDE-<YEAR>-<5-digit>`; customers `YTO-CUST-<YEAR>-<5-digit>`; admins `YTO-ADM-XXX`.
4. **Input hygiene** — email `.toLowerCase().trim()`; phone `.replaceAll("[^0-9]","")`; no emojis in UI strings or logs; no hardcoded impersonating fallbacks (`"seller@gmail.com"`, `"YTO Rider"`, `"Store Warehouse"`).
5. **Code quality** — retain docstrings/comments/schemas; responsive desktop + mobile layouts; clear error boundaries.
6. **Auth** — bcrypt 10 rounds; JWT 24h; token key `yto_token`; 401 interceptor clears storage + emits `yto:auth_expired`.

---

## 9. Scripts & Tooling (`server/`, `scripts/`)

- `server/seed_official_demo_accounts.js` — upserts official demo records: seller/customer/rider (`seller@gmail.com`/`customer@gmail.com`/`rider@gmail.com` → DEMO) plus the three admin logins `superadmin@gmail.com` / `staff@gmail.com` / `hub@gmail.com`. Passwords are bcrypt-hashed from `DEMO_ADMIN_PASSWORD_*` env vars (a random one is generated and logged once when a var is missing); the plaintext `DEMO_PLAINTEXT=1` mode was removed 2026-09-04.
- `Server.js` boot — `ensureDemoAdminAccounts()` runs after `mongoose.connect` and INSERT-ONLY upserts the same three demo admins (`$setOnInsert`, never overwrites an existing account), so a fresh/cleaned DB can never 401 on the demo logins again. **Opt-in since 2026-09-04:** runs only when `ENABLE_DEMO_BOOTSTRAP=1` (plus `ALLOW_DEMO_BOOTSTRAP_IN_PROD=1` when `NODE_ENV=production`); passwords bcrypt-hashed from env, never stored plaintext in source.
- `server/clean_web_db.js` — wipes test records while **preserving** `seller@gmail.com`, `customer@gmail.com`, `rider@gmail.com`.
- `scripts/dev.cjs` — `npm run dev:all` launcher (frontend + server).
- `package.json` scripts: `dev` (vite), `dev:server`, `dev:all`, `start` (dev.cjs), `build` (`vite build`), `lint`, `preview`.
- `scripts/qa/` — `npm run qa:layout` runs the headless layout sweep: boots a seeded API + Vite dev server + headless Chrome, logs in with an offline demo JWT, and asserts zero horizontal overflow / zero crashes / zero console errors across every sidebar page x viewport width (catches runtime-only crashes `vite build` cannot see).
- Skills specs live in `my-react-app/skills/` (9 SKILL.md files: authentication, cross-device, geofence-delivery, map-location-picker, notifications, package-booking, profile-management, rider-delivery, seller-dashboard).

---

## 10. File Structure Reference

```
C:\Users\ADMIN\React_Projects\YTO Latest\
├─ AGENTS2.md                        (this document)
├─ my-react-app/
│  ├─ package.json, vite.config.js, index.html
│  ├─ src/
│  │  ├─ App.jsx, main.jsx, index.css, tailwind.css, demoUtils.js
│  │  ├─ (pages: AnalyticsDashboard, ProcessSellerInformation, ViewSeller,
│  │  │   ProcessParcelInformation, ManageParcels, ProcessRiderInformation,
│  │  │   MonitorRiderStatus, GenerateRiderDataReport, CustomerList, ActivityLog,
│  │  │   ManageAccounts, HubParcelReceiving, ManageIssues, ManageParcelLocation,
│  │  │   MonitorParcel, GenerateTrackingInformation, Settings, SettingsArchiveView,
│  │  │   LoginPage, Logout, GlobalHeader, GlobalSearch, NotificationBell, ...)
│  │  │   (legacy GenerateParcelMovement / GenerateParcelConfirmationStatus /
│  │  │   GenerateParcelStatusReport screens were removed 2026-09-03 — superseded
│  │  │   by ManageParcels; do not re-import)
│  │  ├─ components/ui/              (Badge, Modal, EmptyState, skeletons, statusColors.js, ...)
│  │  ├─ services/                   (api.js, localApi.js, useSSE.js)
│  │  ├─ verification/               (PendingVerificationsTable, ReviewModal, SendSMSModal, ...)
│  │  └─ (utils: exportUtils, leafletLoader, luzonCityCoords, luzonMockData, hubGeofenceData, alertsFeed, useRouteAnimation)
│  ├─ server/
│  │  ├─ Server.js, bridgeRoutes.js
│  │  ├─ models/                     (Account, Seller, Rider, Customer, Parcel, ParcelLocation, Issue)
│  │  ├─ utils/                      (BridgeClient.js, sseBroadcaster.js)
│  │  ├─ seed_official_demo_accounts.js, clean_web_db.js
│  │  └─ .env                        (MONGO_URI, JWT_SECRET, TWILIO_*, SEMAPHORE_*, EMAIL_*, ANDROID_BACKEND_URL, BRIDGE_API_KEY, SSE_PEAK_THRESHOLD)
│  ├─ scripts/dev.cjs
│  ├─ public/                        (assets, server, vite.svg)
│  └─ skills/                        (9 SKILL.md files)
└─ __MACOSX/                         (junk from archive extraction — ignore)
```

## 11. Security: Known Issue — `.env` Credential Leak & Pending History Scrub (Future Fix)

**Status:** LOCAL SCRUB COMPLETE — REMOTE PUSH BLOCKED (as of 2026-09-03).

### What happened
- `my-react-app/server/.env` was committed into git history from the initial commit (`426e719`) with live credentials. The repo is **public** on GitHub (`LewisHamilton444/yto-express`), and `origin/main` at `b6c89fc` **still contains the file** — the leak is live on the remote.
- Local history was scrubbed with `git filter-repo`: `.env` and the junk `Icon\r` file were removed from all 25 commits. New local HEAD: `642ff8d`.
- `.env` was restored to disk (from backup) and added to `.gitignore` — it must never be committed again.
- Pre-scrub backup (contains original history incl. `.env`): `C:\Users\ADMIN\React_Projects\yto-express-backup.git`.
- `vite build` passes; working tree clean; only `.gitignore` modified locally.

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
```

---

### Remediation status — 2026-09-04 (N1 + N2 emergency batch)

- **Code scrub complete (local, uncommitted):** `Server.js` demo bootstrap is now **opt-in** (`ENABLE_DEMO_BOOTSTRAP=1`, plus `ALLOW_DEMO_BOOTSTRAP_IN_PROD=1` when `NODE_ENV=production`), bcrypt-only, with passwords sourced from `DEMO_ADMIN_PASSWORD_*` env vars — all hardcoded plaintext credentials removed from source.
- **`DEMO_PLAINTEXT=1` removed** from `seed_official_demo_accounts.js`; both it and `server/clean_web_db.js` now require `MONGO_URI` from env (the hardcoded Atlas connection string with credentials is gone from source).
- **New `server/rotate_demo_admin_credentials.js`** (gated behind `ROTATE_CONFIRM=YES`): re-hashes any plaintext demo admin password to bcrypt and audits the `Account` collection for other non-bcrypt rows. Run it against production **in the same window as the deploy** (the legacy plaintext-compare server cannot verify bcrypt hashes).
- **Local `.env` secrets rotated:** `JWT_SECRET` (new 64-char value), `BRIDGE_API_KEY` + `ANDROID_BRIDGE_API_KEY` (new shared value, synced to the mobile backend `WEB_BRIDGE_API_KEY`). Demo admin passwords now live in `DEMO_ADMIN_PASSWORD_*` env vars.
- **Still pending (manual):** Atlas DB user password rotation (then update `MONGO_URI` in `.env` + Render), Gmail app password rotation, Render env var updates, run the rotation script against production, commit/push/deploy, then the full verification matrix. Demo plaintext passwords redacted from this document (they never reached the remote — remote is still at `b6c89fc`).

---

## 12. Deployment: Render Cold-Start & Keep-Alive (Recommendation)

**Symptom:** the LoginPage health pill sometimes shows red `API OFFLINE` when the app has been idle — even though nothing is broken.

**Root cause:** the hosted backend `https://yto-express.onrender.com` runs on Render's free tier, which **sleeps after ~15 minutes of no traffic**. The first request after idle must cold-start the service (30–60s), which exceeds the old 6s probe timeout.

**Current state (2026-09-03):** LoginPage now uses a two-stage, cold-start-tolerant probe — 10s first attempt, then an 800ms pause and a second 45s attempt, with the pill staying orange `Connecting...` throughout the wake-up window. It only declares `API OFFLINE` after ~46s of genuine failure. Trade-off: a truly dead backend takes longer to show red (acceptable — sign-in itself always waits for the cold start and succeeds).

### Recommended: free uptime-monitor keep-alive (so Render never sleeps)

Any free external monitor that pings the backend every ~10 minutes keeps the free instance warm and removes the cold-start lag entirely. Options (free tiers):

| Service | Setup | Notes |
|---|---|---|
| **UptimeRobot** (recommended) | Add a new monitor → HTTP(S) → URL `https://yto-express.onrender.com` → interval **10 min** | 50 monitors free; alert emails if the service ever goes down |
| **cron-job.org** | Add a cron job → `https://yto-express.onrender.com` → every **10 min** | Free, no sign-up friction; only GET pings |
| **Better Stack Uptime** | Add uptime monitor → URL above → 10 min interval | Free tier includes status pages |

Rules to follow so the keep-alive actually works and stays honest:

1. **Ping the root URL** (`https://yto-express.onrender.com/`) — a GET returning 200 counts as traffic and prevents sleep. Do not point the monitor at the Vite dev origin or a Mongo URI.
2. **Interval ≤ 15 min** (10 min is the safe choice) — Render's idle cutoff is ~15 minutes; anything slower re-introduces cold starts.
3. **Do NOT add keep-alive logic inside the app** (frontend polling, self-ping endpoints). Render free tier only wakes on inbound external traffic, and internal self-requests do not reliably prevent sleep — the external monitor is the fix.
4. **Re-check after backend redeploys** — a fresh Render deploy restarts the idle timer; the monitor resumes keeping it warm automatically.

Once a monitor is active, the login pill should read green `System Operational` within ~1s on every visit (no `Connecting...` wait, no red flash).
